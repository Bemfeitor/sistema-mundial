"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actorOf, change, create } from "@/lib/audit";
import { canAccessStore, requireUser, type Ctx } from "@/lib/session";
import { todayYmd } from "@/lib/format";
import { ATTENDANCE_STAGES, RESPONSE_CLASSES, type AttendanceStage, type Reativacao, type ResponseClass } from "@/lib/types";
import { criarEntradas, listIn, type EntradaReativacao } from "./server";
import {
  MAX_ROWS,
  asYears,
  blockReason,
  isOpen,
  isOverdue,
  normalizePhone,
  reativacaoOf,
  reviewIssues,
  statusFromAttendance,
  waUrl,
} from "./shared";

type Result = { ok?: boolean; error?: string };

const revalidar = (id?: string) => {
  revalidatePath("/crm/reativacao");
  revalidatePath("/crm");
  if (id) revalidatePath(`/crm/reativacao/${id}`);
};

/** Oportunidade de reativação acessível pelo usuário, com o cliente. */
async function carregar(ctx: Ctx, id: string) {
  const opp = id ? await db().get("opportunities", id) : null;
  if (!opp || opp.kind !== "reativacao" || !canAccessStore(ctx, opp.store_id)) return null;
  const customer = await db().get("customers", opp.customer_id);
  return { opp, r: reativacaoOf(opp), customer };
}

/** Outro atendimento de reativação aberto com o mesmo telefone? */
async function telefoneNaFila(phone: string, exceptOppId?: string) {
  if (!phone) return false;
  const custs = await listIn("customers", "phone", [phone, `55${phone}`]);
  if (!custs.length) return false;
  const opps = await listIn("opportunities", "customer_id", custs.map((c) => c.id), { kind: "reativacao" });
  return opps.some((o) => isOpen(o) && o.id !== exceptOppId);
}

// ---------- importação / novo cliente ----------

export async function importarReativacao(rows: EntradaReativacao[]) {
  const ctx = await requireUser("crm");
  if (!Array.isArray(rows) || !rows.length) return { error: "Nenhuma linha válida para importar." };
  if (rows.length > MAX_ROWS) return { error: `Limite de ${MAX_ROWS} linhas por importação.` };
  const r = await criarEntradas(ctx, rows, "importacao");
  revalidar();
  return { ok: true, ...r };
}

export async function novoClienteReativacao(_prev: unknown, fd: FormData): Promise<Result & { id?: string }> {
  const ctx = await requireUser("crm");
  const name = String(fd.get("name") ?? "").trim();
  const phone = normalizePhone(fd.get("phone"));
  const years = asYears(fd.get("years"));
  const issues = reviewIssues({ name, phone, years });
  if (issues.length) return { error: issues.join(" ") };
  const r = await criarEntradas(ctx, [{ name, phone, years }], "manual");
  if (r.repetidos) return { error: "Este telefone já está na fila de reativação." };
  if (!r.ids[0]) return { error: "Não foi possível criar o atendimento." };
  revalidar();
  return { ok: true, id: r.ids[0] };
}

// ---------- ficha ----------

export async function salvarFicha(_prev: unknown, fd: FormData): Promise<Result> {
  const ctx = await requireUser("crm");
  const id = String(fd.get("id") ?? "");
  const cur = await carregar(ctx, id);
  if (!cur || !cur.customer) return { error: "Atendimento não encontrado ou de outra loja." };
  const { opp, r, customer } = cur;

  const name = String(fd.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const phone = normalizePhone(fd.get("phone"));
  const years = asYears(fd.get("years"));
  const attendanceRaw = String(fd.get("attendance") ?? r.attendance);
  const attendance = (ATTENDANCE_STAGES as readonly string[]).includes(attendanceRaw) ? (attendanceRaw as AttendanceStage) : r.attendance;
  const rcRaw = String(fd.get("response_class") ?? "");
  const response_class = (RESPONSE_CLASSES as readonly string[]).includes(rcRaw) ? (rcRaw as ResponseClass) : null;
  const nextRaw = String(fd.get("next_contact_at") ?? "");
  const next_contact_at = /^\d{4}-\d{2}-\d{2}$/.test(nextRaw) ? nextRaw : null;

  const duplicate = phone !== normalizePhone(customer.phone) && (await telefoneNaFila(phone, opp.id));
  const issues = reviewIssues({ name, phone, years, duplicate });
  if (issues.length) return { error: issues.join(" ") };

  const actor = actorOf(ctx.user);
  const custPatch: { name?: string; phone?: string; consent_marketing?: boolean; consent_version?: string } = {};
  if (name !== customer.name) custPatch.name = name;
  if (phone !== normalizePhone(customer.phone)) custPatch.phone = phone;
  if (attendance === "nao_quer_mensagens" && r.attendance !== "nao_quer_mensagens") {
    custPatch.consent_marketing = false;
    custPatch.consent_version = `recusou-reativacao-${todayYmd()}`;
  }
  if (Object.keys(custPatch).length) {
    if (!canAccessStore(ctx, customer.store_id)) return { error: "O cadastro deste cliente pertence a outra loja; peça à loja responsável para corrigir." };
    await change(actor, "customers", customer.id, custPatch, "reativacao_atualizar_cliente");
  }

  const nextR: Reativacao = {
    ...r,
    years_since_purchase: years!,
    attendance,
    response_class,
    flag: attendance === "nao_quer_mensagens" ? "nao_receber" : r.flag,
  };
  await change(
    actor,
    "opportunities",
    opp.id,
    { reativacao: nextR, next_contact_at, status: statusFromAttendance(attendance, !!r.first_contact_at) },
    "salvar_ficha_reativacao",
  );
  revalidar(opp.id);
  return { ok: true };
}

// ---------- envio pelo WhatsApp (sempre confirmado pela pessoa) ----------

export async function prepararEnvio(input: { id: string; text: string; mobile: boolean }): Promise<Result & { url?: string; messageId?: string }> {
  const ctx = await requireUser("crm");
  const cur = await carregar(ctx, input.id);
  if (!cur || !cur.customer) return { error: "Atendimento não encontrado ou de outra loja." };
  const { opp, r, customer } = cur;
  const text = String(input.text ?? "").trim();
  if (!text) return { error: "Escreva a mensagem antes de abrir o WhatsApp." };
  if (text.length > 4000) return { error: "Mensagem muito longa." };

  const phone = normalizePhone(customer.phone);
  const issues = reviewIssues({ name: customer.name, phone, years: r.years_since_purchase, duplicate: await telefoneNaFila(phone, opp.id) });
  const block = blockReason(r, customer, issues);
  if (block) return { error: block };

  // Uma liberação por vez: cancela preparos anteriores não confirmados
  const anteriores = await db().list("messages", { eq: { customer_id: customer.id, kind: "reativacao", status: "aprovada" } });
  const actor = actorOf(ctx.user);
  for (const m of anteriores) await change(actor, "messages", m.id, { status: "cancelada" }, "cancelar_preparo_reativacao");

  const msg = await create(
    actor,
    "messages",
    { customer_id: customer.id, kind: "reativacao", channel: "whatsapp", text, status: "aprovada", prepared_by: ctx.user.id },
    "liberar_mensagem_reativacao",
  );
  revalidar(opp.id);
  return { ok: true, messageId: msg.id, url: waUrl(phone, text, !!input.mobile) };
}

export async function confirmarEnvio(input: { id: string; messageId: string; enviado: boolean }): Promise<Result> {
  const ctx = await requireUser("crm");
  const cur = await carregar(ctx, input.id);
  if (!cur) return { error: "Atendimento não encontrado ou de outra loja." };
  const { opp, r } = cur;
  const msg = await db().get("messages", input.messageId);
  if (!msg || msg.customer_id !== opp.customer_id || msg.kind !== "reativacao") return { error: "Mensagem não encontrada." };
  if (msg.status !== "aprovada") return { error: "Esta mensagem já foi confirmada ou cancelada." };
  const actor = actorOf(ctx.user);

  if (!input.enviado) {
    await change(actor, "messages", msg.id, { status: "cancelada" }, "envio_nao_realizado");
    revalidar(opp.id);
    return { ok: true };
  }

  const at = new Date().toISOString();
  const kind = r.first_contact_at && isOverdue(r) ? "retorno" : "contato";
  await change(actor, "messages", msg.id, { status: "enviada" }, "confirmar_envio");
  const nextR: Reativacao = {
    ...r,
    attendance: "aguardando_resposta",
    last_sent_at: at,
    first_contact_at: r.first_contact_at ?? at,
    follow_up_at: kind === "retorno" ? at : r.follow_up_at ?? null,
    send_history: [
      ...r.send_history,
      { at, employee_id: ctx.user.id, employee_name: ctx.user.name, store_id: ctx.storeId ?? ctx.user.store_id, kind },
    ],
  };
  await change(actor, "opportunities", opp.id, { reativacao: nextR, status: "em_contato" }, "confirmar_envio_reativacao");
  revalidar(opp.id);
  return { ok: true };
}

export async function encerrarSemResposta(fd: FormData): Promise<void> {
  const ctx = await requireUser("crm");
  const cur = await carregar(ctx, String(fd.get("id") ?? ""));
  if (!cur) return;
  const { opp, r } = cur;
  if (!isOverdue(r) || !r.follow_up_at) return;
  await change(
    actorOf(ctx.user),
    "opportunities",
    opp.id,
    { reativacao: { ...r, attendance: "encerrado_sem_resposta" }, status: "perdida" },
    "encerrar_sem_resposta",
  );
  revalidar(opp.id);
}
