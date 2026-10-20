import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { db, type Row } from "@/lib/db";
import { actorOf, create } from "@/lib/audit";
import { writeStoreId, type Ctx } from "@/lib/session";
import { RESPONSE_CLASSES, type Customer, type Message, type Opportunity, type Reativacao, type TableName } from "@/lib/types";
import {
  ATTENDANCE_LABEL,
  IMPORT_NOTE,
  RESPONSE_LABEL,
  YEARS_LABEL,
  asPeriodo,
  periodStart,
  type Periodo,
  MAX_ROWS,
  RESPONDED,
  VISIT,
  asYears,
  blockReason,
  consentBlocked,
  isOpen,
  isOverdue,
  isWaiting,
  normalizePhone,
  phoneValid,
  queueStatus,
  reativacaoOf,
  reviewIssues,
  type Flag,
  type QueueStatus,
  type Years,
} from "./shared";

const newCardToken = () => `card_${randomBytes(24).toString("base64url")}`;

/** list com filtro "in" em lotes (evita URLs gigantes no Supabase). */
export async function listIn<T extends TableName>(
  table: T,
  column: keyof Row<T> & string,
  values: unknown[],
  eq?: Partial<Record<keyof Row<T> & string, unknown>>,
): Promise<Row<T>[]> {
  const uniq = [...new Set(values.filter((v) => v != null && v !== ""))];
  const out: Row<T>[] = [];
  for (let i = 0; i < uniq.length; i += 150) {
    const part = await db().list(table, { in: { column, values: uniq.slice(i, i + 150) }, eq, limit: 5000 });
    out.push(...part);
  }
  return out;
}

// ---------- criação (importação e cadastro manual) ----------

export interface EntradaReativacao {
  name: string;
  phone: string;
  years: number | null;
  original?: string | null;
}

export interface ResultadoCriacao {
  criados: number;
  clientesNovos: number;
  repetidos: number;
  invalidos: number;
  ids: string[];
}

async function inChunks<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

/**
 * Cria oportunidades de reativação. Busca o cliente pelo telefone (cria se não existir, sem consentimento),
 * não duplica quem já tem reativação aberta e marca o alerta adequado. Não envia nada.
 */
export async function criarEntradas(ctx: Ctx, rows: EntradaReativacao[], origem: "importacao" | "manual"): Promise<ResultadoCriacao> {
  const actor = actorOf(ctx.user);
  const storeId = writeStoreId(ctx);
  const res: ResultadoCriacao = { criados: 0, clientesNovos: 0, repetidos: 0, invalidos: 0, ids: [] };

  const seen = new Set<string>();
  const valid: { name: string; phone: string; years: Years; original: string | null }[] = [];
  for (const raw of rows.slice(0, MAX_ROWS)) {
    const name = String(raw?.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    const phone = normalizePhone(raw?.phone);
    if (!name || !phoneValid(phone)) {
      res.invalidos++;
      continue;
    }
    if (seen.has(phone)) {
      res.repetidos++;
      continue;
    }
    seen.add(phone);
    valid.push({ name, phone, years: asYears(raw.years) ?? 4, original: String(raw.original ?? "").trim().slice(0, 80) || null });
  }
  if (!valid.length) return res;

  // Clientes existentes pelo telefone (base única das lojas)
  const phones = valid.map((v) => v.phone);
  const found = await listIn("customers", "phone", [...phones, ...phones.map((p) => `55${p}`)]);
  const byPhone = new Map<string, Customer>();
  for (const c of found) {
    const p = normalizePhone(c.phone);
    const prev = byPhone.get(p);
    if (!prev || (prev.store_id !== storeId && c.store_id === storeId)) byPhone.set(p, c);
  }
  const custIds = [...byPhone.values()].map((c) => c.id);
  const [opps, msgs] = await Promise.all([
    listIn("opportunities", "customer_id", custIds, { kind: "reativacao" }),
    listIn("messages", "customer_id", custIds),
  ]);
  const openSet = new Set(opps.filter(isOpen).map((o) => o.customer_id));
  const since90 = new Date(Date.now() - 90 * 864e5).toISOString();
  const recentSet = new Set(msgs.filter((m) => m.status === "enviada" && m.created_at >= since90).map((m) => m.customer_id));

  const batch = randomUUID();
  const note = origem === "importacao" ? "Reativação — importado da planilha" : "Reativação — cadastro manual";

  await inChunks(valid, 8, async (v) => {
    let c = byPhone.get(v.phone);
    let novo = false;
    if (c && openSet.has(c.id)) {
      res.repetidos++;
      return;
    }
    if (!c) {
      c = await create(actor, "customers", {
        name: v.name,
        phone: v.phone,
        store_id: storeId,
        level: "Novo",
        card_token: newCardToken(),
        consent_program: false,
        consent_marketing: false,
        consent_version: null,
        notes: IMPORT_NOTE,
        seller_id: null,
      });
      novo = true;
      res.clientesNovos++;
    }
    openSet.add(c.id);
    const flag: Flag = novo ? "sem_contato" : consentBlocked(c) ? "nao_receber" : recentSet.has(c.id) ? "ja_houve_contato" : "sem_contato";
    const reativacao: Reativacao = {
      years_since_purchase: v.years,
      original_seller: v.original,
      attendance: "nao_iniciado",
      response_class: null,
      flag,
      first_contact_at: null,
      last_sent_at: null,
      follow_up_at: null,
      send_history: [],
      import_batch: batch,
    };
    const o = await create(
      actor,
      "opportunities",
      { customer_id: c.id, store_id: storeId, owner_id: ctx.user.id, kind: "reativacao", status: "nova", next_contact_at: null, note, reativacao },
      origem === "importacao" ? "importar_reativacao" : "criar_reativacao",
    );
    res.criados++;
    res.ids.push(o.id);
  });
  return res;
}

// ---------- leitura (painel, fila, relatório) ----------

export interface ItemReativacao {
  opp: Opportunity;
  r: Reativacao;
  customer: Customer | null;
  issues: string[];
  block: string | null;
  status: QueueStatus;
  overdue: boolean;
  pendingMessage: Message | null;
  comprou: boolean;
  respondeu: boolean;
  visita: boolean;
}

/** Oportunidades de reativação enriquecidas. storeId null = todas as lojas. */
export async function carregarReativacoes(f: { storeId: string | null; ownerId?: string | null }): Promise<ItemReativacao[]> {
  const opps = await db().list("opportunities", {
    eq: { kind: "reativacao", ...(f.storeId ? { store_id: f.storeId } : {}), ...(f.ownerId ? { owner_id: f.ownerId } : {}) },
    order: { column: "created_at", ascending: false },
    limit: 5000,
  });
  if (!opps.length) return [];
  const custIds = opps.map((o) => o.customer_id);
  const [customers, msgs] = await Promise.all([listIn("customers", "id", custIds), listIn("messages", "customer_id", custIds)]);
  const contacted = opps.filter((o) => o.reativacao?.first_contact_at).map((o) => o.customer_id);
  const sales = contacted.length ? await listIn("sales", "customer_id", contacted, { status: "concluida" }) : [];

  const custMap = new Map(customers.map((c) => [c.id, c]));
  const pending = new Map<string, Message>();
  for (const m of msgs) if (m.kind === "reativacao" && m.status === "aprovada") pending.set(m.customer_id, m);

  // telefones em mais de um atendimento aberto
  const phoneCount = new Map<string, number>();
  for (const o of opps) {
    if (!isOpen(o)) continue;
    const p = normalizePhone(custMap.get(o.customer_id)?.phone);
    if (p) phoneCount.set(p, (phoneCount.get(p) ?? 0) + 1);
  }

  const now = Date.now();
  return opps.map((opp) => {
    const r = reativacaoOf(opp);
    const customer = custMap.get(opp.customer_id) ?? null;
    const phone = normalizePhone(customer?.phone);
    const issues = reviewIssues({
      name: customer?.name ?? "",
      phone,
      years: r.years_since_purchase,
      duplicate: isOpen(opp) && (phoneCount.get(phone) ?? 0) > 1,
    });
    const block = blockReason(r, customer, issues, now);
    const pendingMessage = pending.get(opp.customer_id) ?? null;
    const comprou =
      opp.status === "convertida" ||
      (!!r.first_contact_at && sales.some((s) => s.customer_id === opp.customer_id && s.created_at > r.first_contact_at!));
    return {
      opp,
      r,
      customer,
      issues,
      block,
      status: queueStatus({ opp, r, issues, blocked: !!block, pendingMessage: !!pendingMessage, now }),
      overdue: isOpen(opp) && isOverdue(r, now),
      pendingMessage,
      comprou,
      respondeu: RESPONDED.includes(r.attendance) || !!r.response_class,
      visita: VISIT.includes(r.attendance) || opp.status === "agendado" || opp.status === "convertida",
    };
  });
}

/** Itens com atividade no período (importados ou com envio desde `from`). */
export const noPeriodo = (items: ItemReativacao[], from: string) =>
  items.filter((i) => i.opp.created_at >= from || (i.r.last_sent_at ?? "") >= from);

export function indicadores(items: ItemReativacao[], from: string) {
  const base = noPeriodo(items, from);
  const abertos = items.filter((i) => isOpen(i.opp));
  const enviados = base.filter((i) => i.r.first_contact_at).length;
  const responderam = base.filter((i) => i.respondeu).length;
  return {
    naFila: abertos.length,
    envios: items.reduce((s, i) => s + i.r.send_history.filter((h) => h.at >= from).length, 0),
    importados: base.length,
    enviados,
    responderam,
    visitas: base.filter((i) => i.visita).length,
    compraram: base.filter((i) => i.comprou).length,
    taxa: enviados ? (responderam / enviados) * 100 : 0,
    atrasados: abertos.filter((i) => i.overdue).length,
    pendentes: abertos.filter((i) => isWaiting(i.r)).length,
    alertasContato: base.filter((i) => i.r.flag === "ja_houve_contato").length,
    respostas: RESPONSE_CLASSES.map((k) => ({ key: k, n: base.filter((i) => i.r.response_class === k).length })),
  };
}

// ---------- relatório ----------

export interface FiltrosRelatorio {
  periodo: Periodo;
  from: string;
  storeId: string | null;
  ownerId: string | null;
}

/** Filtros do relatório; sem "consolidado" a loja é sempre a do funcionário. */
export function filtrosRelatorio(
  user: { store_id: string; consolidado: boolean },
  sp: Record<string, string | undefined>,
  defaultStore: string | null,
): FiltrosRelatorio {
  const periodo = asPeriodo(sp.periodo);
  const loja = user.consolidado ? (sp.loja ?? defaultStore ?? "") : user.store_id;
  return { periodo, from: periodStart(periodo), storeId: loja || null, ownerId: sp.func || null };
}

export function resultadoDe(i: ItemReativacao) {
  if (i.comprou) return "Comprou";
  if (i.visita) return "Visita combinada";
  if (i.r.response_class) return `Respondeu: ${RESPONSE_LABEL[i.r.response_class]}`;
  if (i.respondeu) return "Respondeu";
  if (i.r.first_contact_at) return i.overdue ? "Sem resposta (48 h)" : "Aguardando resposta";
  return "Não contatado";
}

export async function relatorioReativacao(f: FiltrosRelatorio) {
  const all = await carregarReativacoes({ storeId: f.storeId, ownerId: f.ownerId });
  const ownerIds = [...new Set(all.map((i) => i.opp.owner_id).filter(Boolean))] as string[];
  const owners = ownerIds.length ? await listIn("employees", "id", ownerIds) : [];
  const ownerName = new Map(owners.map((e) => [e.id, e.name]));
  const linhas = noPeriodo(all, f.from)
    .map((i) => ({
      item: i,
      data: i.r.last_sent_at ?? i.opp.created_at,
      cliente: i.customer?.name ?? "—",
      telefone: i.customer?.phone ?? "",
      faixa: YEARS_LABEL[i.r.years_since_purchase],
      situacao: ATTENDANCE_LABEL[i.r.attendance],
      resultado: resultadoDe(i),
      responsavel: (i.opp.owner_id && ownerName.get(i.opp.owner_id)) || "—",
      envios: i.r.send_history.length,
    }))
    .sort((a, b) => b.data.localeCompare(a.data));
  return { k: indicadores(all, f.from), linhas };
}
