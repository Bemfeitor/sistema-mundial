import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod";
import { db, type ListOptions } from "@/lib/db";
import { change, create, destroy, type Actor } from "@/lib/audit";
import { moveStock } from "@/lib/estoque";
import { LAB_EXCEPTIONS, LAB_STATUSES, TABLES, type LabOrder, type Sale, type TableName } from "@/lib/types";
import { MCP_TOOLS, toolInfo } from "./catalog";
import { TABLE_INFO } from "./tables";
import type { AgentScope } from "./auth";

// Servidor MCP da Ótica: ferramentas de leitura (todos os escopos) e escrita (escopo "total", auditadas com origem "agente").

const TZ = "America/Sao_Paulo";
const localYmd = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const startIso = (ymd: string) => new Date(`${ymd}T00:00:00-03:00`).toISOString();
const endIso = (ymd: string) => new Date(`${ymd}T23:59:59.999-03:00`).toISOString();
const reais = (cents: number) => Math.round(cents) / 100;
const sum = <X,>(a: X[], f: (x: X) => number) => a.reduce((s, x) => s + (f(x) || 0), 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

const READ_TABLES = TABLES.filter((t) => t !== "agent_tokens") as [TableName, ...TableName[]];
const WRITE_TABLES = TABLES.filter((t) => t !== "agent_tokens" && t !== "audit_log") as [TableName, ...TableName[]];
const LAB_ALL = [...LAB_STATUSES, ...LAB_EXCEPTIONS] as [string, ...string[]];
const LAB_DONE = new Set(["pronto", "cliente_avisado", "entregue", "cancelado"]);

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato YYYY-MM-DD");
const storeArg = z.string().optional().describe("id da loja (uuid). Omitido = todas as lojas (consolidado).");

const ok = (data: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (message: string): CallToolResult => ({ content: [{ type: "text", text: `Erro: ${message}` }], isError: true });

/** Envolve o handler: captura exceções e devolve erro legível ao agente. */
function safe<A>(fn: (args: A) => Promise<CallToolResult>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return await fn(args);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  };
}

const sale = {
  margin: (rows: Sale[]) => {
    const total = sum(rows, (s) => s.total_cents);
    const cost = sum(rows, (s) => s.cost_cents);
    return total ? round1(((total - cost) / total) * 100) : 0;
  },
  agg: (rows: Sale[]) => {
    const total = sum(rows, (s) => s.total_cents);
    const cost = sum(rows, (s) => s.cost_cents);
    return {
      vendas: rows.length,
      faturamento_reais: reais(total),
      custo_reais: reais(cost),
      margem_percent: total ? round1(((total - cost) / total) * 100) : 0,
      ticket_medio_reais: rows.length ? reais(total / rows.length) : 0,
    };
  },
};

async function salesBetween(from: string, to: string, storeId?: string) {
  return db().list("sales", {
    eq: { status: "concluida", ...(storeId ? { store_id: storeId } : {}) },
    gte: { column: "created_at", value: startIso(from) },
    lte: { column: "created_at", value: endIso(to) },
    limit: 100000,
  });
}

const isLate = (o: LabOrder, nowIso: string) => Boolean(o.due_at && o.due_at < nowIso && !LAB_DONE.has(o.status));
const openCents = (r: { amount_cents: number; paid_cents: number }) => Math.max(0, r.amount_cents - (r.paid_cents ?? 0));
const isOpen = (r: { status: string }) => r.status === "aberto" || r.status === "vencido";

export function createOticaMcpServer(actor: Actor, scope: AgentScope) {
  const server = new McpServer(
    { name: "otica-mundial", version: "1.0.0" },
    {
      instructions:
        "Sistema unificado da Ótica Mundial (2 lojas). Dinheiro no banco está em centavos (*_cents); as ferramentas agregadas já devolvem reais (*_reais). " +
        "Comece por resumo_geral e listar_tabelas. " +
        (scope === "total"
          ? "Você tem escopo TOTAL: toda escrita é auditada em nome de " + actor.name + ". Confirme com o gestor antes de ações irreversíveis; mensagens a clientes ficam sempre para validação humana."
          : "Você tem escopo de LEITURA: não há ferramentas de escrita."),
    },
  );
  const d = db();
  const meta = (name: string) => {
    const t = toolInfo(name);
    return {
      title: t.title,
      description: t.description,
      annotations: {
        title: t.title,
        readOnlyHint: !t.write,
        destructiveHint: t.write ? Boolean(t.destructive) : false,
        idempotentHint: !t.write,
        openWorldHint: false,
      },
    };
  };

  // ================= LEITURA =================

  server.registerTool(
    "resumo_geral",
    { ...meta("resumo_geral"), inputSchema: { store_id: storeArg } },
    safe(async ({ store_id }) => {
      const t = today();
      const month = t.slice(0, 7);
      const nowIso = new Date().toISOString();
      const in7 = addDays(t, 7);
      const stores = (await d.list("stores", { eq: { active: true }, order: { column: "code" } })).filter((s) => !store_id || s.id === store_id);
      const [monthSales, goals, labs, payables, receivables, stock] = await Promise.all([
        salesBetween(`${month}-01`, t, store_id),
        d.list("goals", { eq: { month } }),
        d.list("lab_orders", { eq: store_id ? { store_id } : {} }),
        d.list("payables", { eq: store_id ? { store_id } : {} }),
        d.list("receivables", { eq: store_id ? { store_id } : {} }),
        d.list("stock", { eq: store_id ? { store_id } : {}, limit: 100000 }),
      ]);
      const lojas = stores.map((s) => {
        const ms = monthSales.filter((x) => x.store_id === s.id);
        const ds = ms.filter((x) => localYmd(x.created_at) === t);
        const goal = goals.find((g) => g.store_id === s.id && !g.employee_id);
        const fatMes = sum(ms, (x) => x.total_cents);
        const pays = payables.filter((p) => p.store_id === s.id && isOpen(p));
        const recs = receivables.filter((r) => r.store_id === s.id && isOpen(r));
        return {
          loja: s.name,
          store_id: s.id,
          hoje: sale.agg(ds),
          mes: sale.agg(ms),
          meta_mes_reais: goal ? reais(goal.target_cents) : null,
          meta_atingida_percent: goal?.target_cents ? round1((fatMes / goal.target_cents) * 100) : null,
          os_atrasadas: labs.filter((o) => o.store_id === s.id && isLate(o, nowIso)).length,
          contas_pagar_vencendo_7d: {
            qtd: pays.filter((p) => p.due_at.slice(0, 10) >= t && p.due_at.slice(0, 10) <= in7).length,
            total_reais: reais(sum(pays.filter((p) => p.due_at.slice(0, 10) >= t && p.due_at.slice(0, 10) <= in7), openCents)),
          },
          contas_pagar_vencidas_reais: reais(sum(pays.filter((p) => p.due_at.slice(0, 10) < t), openCents)),
          contas_receber_vencidas_reais: reais(sum(recs.filter((r) => r.due_at.slice(0, 10) < t), openCents)),
          itens_estoque_baixo: stock.filter((k) => k.store_id === s.id && k.qty <= k.min_qty).length,
        };
      });
      return ok({ data: t, mes: month, lojas, consolidado_mes: sale.agg(monthSales) });
    }),
  );

  server.registerTool(
    "listar_tabelas",
    { ...meta("listar_tabelas"), inputSchema: {} },
    safe(async () =>
      ok({
        observacoes: "Dinheiro em centavos inteiros (*_cents). Datas ISO 8601 (created_at em UTC). Fuso das lojas: America/Sao_Paulo.",
        tabelas: READ_TABLES.map((t) => ({ tabela: t, ...TABLE_INFO[t] })),
      }),
    ),
  );

  server.registerTool(
    "consultar",
    {
      ...meta("consultar"),
      inputSchema: {
        tabela: z.enum(READ_TABLES).describe("Nome da tabela"),
        eq: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional()
          .describe('Filtros de igualdade, ex.: {"store_id": "...", "status": "aberto"}'),
        intervalo: z
          .object({
            coluna: z.string(),
            de: z.union([z.string(), z.number()]).optional().describe("valor mínimo (inclusive)"),
            ate: z.union([z.string(), z.number()]).optional().describe("valor máximo (inclusive)"),
          })
          .optional()
          .describe("Filtro de intervalo em uma coluna (datas ISO ou números)"),
        busca: z
          .object({ colunas: z.array(z.string()).min(1), termo: z.string().min(1) })
          .optional()
          .describe("Busca textual (contém, sem acento/maiúsculas) nas colunas indicadas"),
        ordem: z.object({ coluna: z.string(), crescente: z.boolean().optional() }).optional(),
        limite: z.number().int().min(1).max(500).optional().describe("padrão 50"),
      },
    },
    safe(async ({ tabela, eq, intervalo, busca, ordem, limite }) => {
      const opts: ListOptions<TableName> = { limit: limite ?? 50 };
      if (eq) opts.eq = eq as never;
      if (intervalo?.de !== undefined) opts.gte = { column: intervalo.coluna as never, value: intervalo.de };
      if (intervalo?.ate !== undefined) opts.lte = { column: intervalo.coluna as never, value: intervalo.ate };
      if (busca) opts.search = { columns: busca.colunas as never, term: busca.termo };
      if (ordem) opts.order = { column: ordem.coluna as never, ascending: ordem.crescente ?? true };
      const rows = await d.list(tabela, opts as never);
      return ok({ tabela, quantidade: rows.length, registros: rows });
    }),
  );

  server.registerTool(
    "obter",
    { ...meta("obter"), inputSchema: { tabela: z.enum(READ_TABLES), id: z.string().min(1) } },
    safe(async ({ tabela, id }) => {
      const r = await d.get(tabela, id);
      return r ? ok(r) : fail(`${tabela}/${id} não encontrado`);
    }),
  );

  server.registerTool(
    "vendas_periodo",
    {
      ...meta("vendas_periodo"),
      inputSchema: {
        inicio: ymdSchema.describe("Data inicial YYYY-MM-DD"),
        fim: ymdSchema.describe("Data final YYYY-MM-DD"),
        agrupar: z.enum(["dia", "loja", "vendedor", "categoria"]).default("dia"),
        store_id: storeArg,
      },
    },
    safe(async ({ inicio, fim, agrupar, store_id }) => {
      const rows = await salesBetween(inicio, fim, store_id);
      const [stores, employees] = await Promise.all([d.list("stores"), d.list("employees")]);
      const nameOf = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? id;
      let grupos: Record<string, unknown>[];
      if (agrupar === "categoria") {
        const acc = new Map<string, { qtd: number; total: number; cost: number }>();
        for (const s of rows)
          for (const it of s.items ?? []) {
            const a = acc.get(it.category) ?? { qtd: 0, total: 0, cost: 0 };
            a.qtd += it.qty;
            a.total += it.price_cents * it.qty;
            a.cost += it.cost_cents * it.qty;
            acc.set(it.category, a);
          }
        grupos = [...acc.entries()]
          .map(([k, a]) => ({
            categoria: k,
            itens: a.qtd,
            faturamento_bruto_reais: reais(a.total),
            custo_reais: reais(a.cost),
            margem_percent: a.total ? round1(((a.total - a.cost) / a.total) * 100) : 0,
          }))
          .sort((x, y) => y.faturamento_bruto_reais - x.faturamento_bruto_reais);
      } else {
        const key = (s: Sale) => (agrupar === "dia" ? localYmd(s.created_at) : agrupar === "loja" ? s.store_id : s.seller_id);
        const acc = new Map<string, Sale[]>();
        for (const s of rows) acc.set(key(s), [...(acc.get(key(s)) ?? []), s]);
        grupos = [...acc.entries()].map(([k, list]) => ({
          [agrupar]: agrupar === "loja" ? nameOf(stores, k) : agrupar === "vendedor" ? nameOf(employees, k) : k,
          ...(agrupar !== "dia" ? { id: k } : {}),
          ...sale.agg(list),
        }));
        grupos.sort((x, y) =>
          agrupar === "dia" ? String(x.dia).localeCompare(String(y.dia)) : (y.faturamento_reais as number) - (x.faturamento_reais as number),
        );
      }
      return ok({ inicio, fim, agrupar, total: sale.agg(rows), grupos });
    }),
  );

  server.registerTool(
    "estoque_baixo",
    { ...meta("estoque_baixo"), inputSchema: { store_id: storeArg, limite: z.number().int().min(1).max(500).optional() } },
    safe(async ({ store_id, limite }) => {
      const [stock, products, stores] = await Promise.all([
        d.list("stock", { eq: store_id ? { store_id } : {}, limit: 100000 }),
        d.list("products", { limit: 100000 }),
        d.list("stores"),
      ]);
      const low = stock
        .filter((k) => k.qty <= k.min_qty)
        .map((k) => {
          const p = products.find((x) => x.id === k.product_id);
          return {
            produto: p?.name ?? k.product_id,
            sku: p?.sku,
            categoria: p?.category,
            product_id: k.product_id,
            loja: stores.find((s) => s.id === k.store_id)?.name ?? k.store_id,
            store_id: k.store_id,
            saldo: k.qty,
            minimo: k.min_qty,
            sugestao_reposicao: Math.max(k.min_qty * 2 - k.qty, 1),
          };
        })
        .sort((a, b) => a.saldo - a.minimo - (b.saldo - b.minimo))
        .slice(0, limite ?? 200);
      return ok({ quantidade: low.length, itens: low });
    }),
  );

  server.registerTool(
    "os_atrasadas",
    { ...meta("os_atrasadas"), inputSchema: { store_id: storeArg } },
    safe(async ({ store_id }) => {
      const nowIso = new Date().toISOString();
      const [labs, customers, suppliers, stores] = await Promise.all([
        d.list("lab_orders", { eq: store_id ? { store_id } : {} }),
        d.list("customers", { limit: 100000 }),
        d.list("suppliers"),
        d.list("stores"),
      ]);
      const late = labs
        .filter((o) => isLate(o, nowIso))
        .map((o) => ({
          id: o.id,
          numero: o.number,
          descricao: o.description,
          status: o.status,
          prazo: o.due_at,
          dias_atraso: Math.floor((Date.now() - new Date(o.due_at!).getTime()) / 864e5),
          cliente: customers.find((c) => c.id === o.customer_id)?.name ?? null,
          telefone: customers.find((c) => c.id === o.customer_id)?.phone ?? null,
          laboratorio: suppliers.find((s) => s.id === o.supplier_id)?.name ?? null,
          loja: stores.find((s) => s.id === o.store_id)?.name ?? o.store_id,
        }))
        .sort((a, b) => b.dias_atraso - a.dias_atraso);
      return ok({ quantidade: late.length, os: late });
    }),
  );

  server.registerTool(
    "financeiro_resumo",
    { ...meta("financeiro_resumo"), inputSchema: { store_id: storeArg } },
    safe(async ({ store_id }) => {
      const t = today();
      const end = addDays(t, 30);
      const [payables, receivables] = await Promise.all([
        d.list("payables", { eq: store_id ? { store_id } : {}, limit: 100000 }),
        d.list("receivables", { eq: store_id ? { store_id } : {}, limit: 100000 }),
      ]);
      const pays = payables.filter(isOpen);
      const recs = receivables.filter(isOpen);
      const due = (r: { due_at: string }) => r.due_at.slice(0, 10);
      const fluxo: { data: string; entradas_reais: number; saidas_reais: number; saldo_dia_reais: number; acumulado_reais: number }[] = [];
      let acc = 0;
      for (let i = 0; i <= 30; i++) {
        const day = addDays(t, i);
        const inn = sum(recs.filter((r) => due(r) === day), openCents);
        const out = sum(pays.filter((p) => due(p) === day), openCents);
        acc += inn - out;
        if (inn || out) fluxo.push({ data: day, entradas_reais: reais(inn), saidas_reais: reais(out), saldo_dia_reais: reais(inn - out), acumulado_reais: reais(acc) });
      }
      return ok({
        data: t,
        a_receber_aberto_reais: reais(sum(recs, openCents)),
        a_pagar_aberto_reais: reais(sum(pays, openCents)),
        receber_vencido: { qtd: recs.filter((r) => due(r) < t).length, total_reais: reais(sum(recs.filter((r) => due(r) < t), openCents)) },
        pagar_vencido: { qtd: pays.filter((p) => due(p) < t).length, total_reais: reais(sum(pays.filter((p) => due(p) < t), openCents)) },
        proximos_30_dias: {
          entradas_reais: reais(sum(recs.filter((r) => due(r) >= t && due(r) <= end), openCents)),
          saidas_reais: reais(sum(pays.filter((p) => due(p) >= t && due(p) <= end), openCents)),
          fluxo_diario: fluxo,
        },
      });
    }),
  );

  server.registerTool(
    "cliente_360",
    {
      ...meta("cliente_360"),
      inputSchema: {
        customer_id: z.string().optional().describe("id do cliente"),
        busca: z.string().optional().describe("nome, CPF, telefone ou e-mail (usado se customer_id não for informado)"),
      },
    },
    safe(async ({ customer_id, busca }) => {
      let customer = customer_id ? await d.get("customers", customer_id) : null;
      if (!customer && busca) {
        const found = await d.list("customers", { search: { columns: ["name", "cpf", "phone", "email"], term: busca }, limit: 10 });
        if (found.length > 1)
          return ok({ aviso: "Mais de um cliente encontrado; chame de novo com customer_id.", candidatos: found.map((c) => ({ id: c.id, name: c.name, cpf: c.cpf, phone: c.phone })) });
        customer = found[0] ?? null;
      }
      if (!customer) return fail("Cliente não encontrado. Informe customer_id ou um termo de busca.");
      const id = customer.id;
      const [sales, prescriptions, benefits, labs, opportunities, messages] = await Promise.all([
        d.list("sales", { eq: { customer_id: id }, order: { column: "created_at", ascending: false } }),
        d.list("prescriptions", { eq: { customer_id: id }, order: { column: "exam_date", ascending: false } }),
        d.list("benefits", { eq: { customer_id: id } }),
        d.list("lab_orders", { eq: { customer_id: id } }),
        d.list("opportunities", { eq: { customer_id: id } }),
        d.list("messages", { eq: { customer_id: id } }),
      ]);
      const nowIso = new Date().toISOString();
      const done = sales.filter((s) => s.status === "concluida");
      return ok({
        cliente: customer,
        resumo: {
          compras: done.length,
          total_gasto_reais: reais(sum(done, (s) => s.total_cents)),
          ultima_compra: done[0]?.created_at ?? null,
          saldo_beneficios_disponivel_reais: reais(
            sum(benefits.filter((b) => b.available_at <= nowIso && b.expires_at >= nowIso), (b) => b.remaining_cents),
          ),
          receita_vigente: prescriptions.find((p) => !p.valid_until || p.valid_until >= today()) ?? null,
        },
        compras: sales,
        receitas: prescriptions,
        beneficios: benefits,
        os: labs,
        oportunidades: opportunities,
        mensagens: messages,
      });
    }),
  );

  server.registerTool(
    "desempenho_vendedores",
    {
      ...meta("desempenho_vendedores"),
      inputSchema: { mes: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("YYYY-MM (padrão: mês atual)"), store_id: storeArg },
    },
    safe(async ({ mes, store_id }) => {
      const month = mes ?? today().slice(0, 7);
      const [y, m] = month.split("-").map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const [rows, employees, goals, stores] = await Promise.all([
        salesBetween(`${month}-01`, `${month}-${String(last).padStart(2, "0")}`, store_id),
        d.list("employees"),
        d.list("goals", { eq: { month } }),
        d.list("stores"),
      ]);
      const ids = [...new Set(rows.map((s) => s.seller_id))];
      const ranking = ids
        .map((sid) => {
          const list = rows.filter((s) => s.seller_id === sid);
          const e = employees.find((x) => x.id === sid);
          const goal = goals.find((g) => g.employee_id === sid);
          const fat = sum(list, (s) => s.total_cents);
          return {
            vendedor: e?.name ?? sid,
            employee_id: sid,
            loja: stores.find((s) => s.id === e?.store_id)?.name ?? null,
            ...sale.agg(list),
            comissao_reais: reais(sum(list, (s) => s.commission_cents)),
            meta_reais: goal ? reais(goal.target_cents) : null,
            meta_atingida_percent: goal?.target_cents ? round1((fat / goal.target_cents) * 100) : null,
          };
        })
        .sort((a, b) => b.faturamento_reais - a.faturamento_reais);
      return ok({ mes: month, total: sale.agg(rows), margem_geral_percent: sale.margin(rows), ranking });
    }),
  );

  server.registerTool(
    "auditoria_recente",
    {
      ...meta("auditoria_recente"),
      inputSchema: {
        limite: z.number().int().min(1).max(200).optional().describe("padrão 30"),
        tabela: z.string().optional(),
        origem: z.enum(["app", "agente", "sistema"]).optional(),
      },
    },
    safe(async ({ limite, tabela, origem }) => {
      const rows = await d.list("audit_log", {
        eq: { ...(tabela ? { table_name: tabela } : {}), ...(origem ? { source: origem } : {}) },
        order: { column: "created_at", ascending: false },
        limit: limite ?? 30,
      });
      return ok({ quantidade: rows.length, registros: rows });
    }),
  );

  if (scope !== "total") return server;

  // ================= ESCRITA (escopo total) =================

  const clean = (o: Record<string, unknown>) => {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = o;
    void _id; void _c; void _u;
    return rest;
  };

  server.registerTool(
    "criar_registro",
    {
      ...meta("criar_registro"),
      inputSchema: {
        tabela: z.enum(WRITE_TABLES),
        dados: z.record(z.string(), z.unknown()).describe("Campos do registro (snake_case, dinheiro em centavos)"),
      },
    },
    safe(async ({ tabela, dados }) => {
      const r = await create(actor, tabela, clean(dados) as never, "agente:criar");
      return ok({ criado: r });
    }),
  );

  server.registerTool(
    "atualizar_registro",
    {
      ...meta("atualizar_registro"),
      inputSchema: {
        tabela: z.enum(WRITE_TABLES),
        id: z.string().min(1),
        patch: z.record(z.string(), z.unknown()).describe("Somente os campos a alterar"),
      },
    },
    safe(async ({ tabela, id, patch }) => {
      if (!(await d.get(tabela, id))) return fail(`${tabela}/${id} não encontrado`);
      const r = await change(actor, tabela, id, clean(patch) as never, "agente:alterar");
      return ok({ atualizado: r });
    }),
  );

  server.registerTool(
    "excluir_registro",
    {
      ...meta("excluir_registro"),
      inputSchema: {
        tabela: z.enum(WRITE_TABLES),
        id: z.string().min(1),
        confirm: z.boolean().describe("Precisa ser true para confirmar a exclusão definitiva"),
      },
    },
    safe(async ({ tabela, id, confirm }) => {
      if (confirm !== true) return fail("Exclusão não confirmada. Reenvie com confirm: true após confirmar com o gestor.");
      const before = await d.get(tabela, id);
      if (!before) return fail(`${tabela}/${id} não encontrado`);
      await destroy(actor, tabela, id, "agente:excluir");
      return ok({ excluido: { tabela, id }, registro_anterior: before });
    }),
  );

  server.registerTool(
    "registrar_conta_pagar",
    {
      ...meta("registrar_conta_pagar"),
      inputSchema: {
        store_id: z.string().min(1).describe("id da loja"),
        descricao: z.string().min(1),
        categoria: z.string().min(1).describe("ex.: aluguel, fornecedor, folha, impostos, marketing"),
        valor_reais: z.number().positive(),
        vencimento: ymdSchema,
        supplier_id: z.string().optional(),
      },
    },
    safe(async ({ store_id, descricao, categoria, valor_reais, vencimento, supplier_id }) => {
      if (!(await d.get("stores", store_id))) return fail("Loja não encontrada");
      const r = await create(
        actor,
        "payables",
        {
          store_id,
          supplier_id: supplier_id ?? null,
          category: categoria,
          description: descricao,
          due_at: vencimento,
          amount_cents: Math.round(valor_reais * 100),
          paid_cents: 0,
          status: vencimento < today() ? "vencido" : "aberto",
        },
        "agente:registrar_conta_pagar",
      );
      return ok({ conta: r });
    }),
  );

  server.registerTool(
    "baixar_conta",
    {
      ...meta("baixar_conta"),
      inputSchema: {
        tipo: z.enum(["pagar", "receber"]),
        id: z.string().min(1),
        valor_reais: z.number().positive().optional().describe("Omitido = quita o saldo restante"),
      },
    },
    safe(async ({ tipo, id, valor_reais }) => {
      const table = tipo === "pagar" ? "payables" : "receivables";
      const row = await d.get(table, id);
      if (!row) return fail(`Conta ${id} não encontrada`);
      if (row.status === "pago" || row.status === "cancelado") return fail(`Conta já está ${row.status}`);
      const remaining = openCents(row);
      const value = valor_reais === undefined ? remaining : Math.min(Math.round(valor_reais * 100), remaining);
      const paid = (row.paid_cents ?? 0) + value;
      const r = await change(
        actor,
        table,
        id,
        { paid_cents: paid, status: paid >= row.amount_cents ? "pago" : row.status } as never,
        tipo === "pagar" ? "agente:baixar_pagamento" : "agente:baixar_recebimento",
      );
      return ok({ baixa_reais: reais(value), saldo_restante_reais: reais(Math.max(0, row.amount_cents - paid)), conta: r });
    }),
  );

  server.registerTool(
    "criar_oportunidade_crm",
    {
      ...meta("criar_oportunidade_crm"),
      inputSchema: {
        customer_id: z.string().min(1),
        tipo: z.enum(["pos_venda", "orcamento", "aniversario", "reexame", "cashback", "reativacao", "indicacao"]),
        nota: z.string().optional(),
        proximo_contato: ymdSchema.optional(),
        owner_id: z.string().optional().describe("id do funcionário responsável"),
      },
    },
    safe(async ({ customer_id, tipo, nota, proximo_contato, owner_id }) => {
      const c = await d.get("customers", customer_id);
      if (!c) return fail("Cliente não encontrado");
      const r = await create(
        actor,
        "opportunities",
        {
          customer_id,
          store_id: c.store_id,
          owner_id: owner_id ?? c.seller_id ?? null,
          kind: tipo,
          status: "nova",
          next_contact_at: proximo_contato ?? null,
          note: nota ?? null,
        },
        "agente:criar_oportunidade",
      );
      return ok({ oportunidade: r });
    }),
  );

  server.registerTool(
    "preparar_mensagem",
    {
      ...meta("preparar_mensagem"),
      inputSchema: {
        customer_id: z.string().min(1),
        texto: z.string().min(1).max(2000),
        canal: z.enum(["whatsapp", "email", "sms"]).default("whatsapp"),
        tipo: z.string().default("agente").describe("ex.: cashback, oculos_pronto, aniversario, reexame"),
      },
    },
    safe(async ({ customer_id, texto, canal, tipo }) => {
      const c = await d.get("customers", customer_id);
      if (!c) return fail("Cliente não encontrado");
      if (!c.consent_marketing && ["cashback", "aniversario", "promocao", "reativacao"].includes(tipo))
        return fail("Cliente não deu consentimento de marketing (LGPD). Mensagem não preparada.");
      const r = await create(
        actor,
        "messages",
        { customer_id, kind: tipo, channel: canal, text: texto, status: "para_validar", prepared_by: actor.id ?? null },
        "agente:preparar_mensagem",
      );
      return ok({ mensagem: r, aviso: "Mensagem aguardando validação humana na tela Mensagens. Nada foi enviado." });
    }),
  );

  server.registerTool(
    "ajustar_estoque",
    {
      ...meta("ajustar_estoque"),
      inputSchema: {
        product_id: z.string().min(1),
        store_id: z.string().min(1),
        quantidade: z.number().int().refine((n) => n !== 0, "Quantidade não pode ser zero").describe("positivo = entrada, negativo = saída"),
        motivo: z.string().min(1),
        tipo: z.enum(["ajuste", "entrada", "saida", "inventario", "devolucao"]).default("ajuste"),
      },
    },
    safe(async ({ product_id, store_id, quantidade, motivo, tipo }) => {
      const [p, s] = await Promise.all([d.get("products", product_id), d.get("stores", store_id)]);
      if (!p) return fail("Produto não encontrado");
      if (!s) return fail("Loja não encontrada");
      const [before] = await d.list("stock", { eq: { product_id, store_id } });
      await moveStock(actor, { product_id, store_id, qty: quantidade, kind: tipo, reference: "agente", note: motivo });
      const [after] = await d.list("stock", { eq: { product_id, store_id } });
      await d.insert("audit_log", {
        actor_id: actor.id ?? null,
        actor_name: actor.name,
        source: actor.source,
        action: "agente:ajustar_estoque",
        table_name: "stock",
        record_id: after?.id ?? null,
        before_data: before ?? null,
        after_data: { ...after, movimento: { qty: quantidade, kind: tipo, motivo } },
        store_id,
      });
      return ok({ produto: p.name, loja: s.name, saldo_anterior: before?.qty ?? 0, saldo_atual: after?.qty ?? quantidade });
    }),
  );

  server.registerTool(
    "avancar_os",
    {
      ...meta("avancar_os"),
      inputSchema: {
        id: z.string().min(1).describe("id da OS (lab_orders)"),
        status: z.enum(LAB_ALL),
        nota: z.string().optional(),
      },
    },
    safe(async ({ id, status, nota }) => {
      const o = await d.get("lab_orders", id);
      if (!o) return fail("OS não encontrada");
      const history = [...(o.history ?? []), { at: new Date().toISOString(), status: status as LabOrder["status"], by: actor.name, note: nota }];
      const r = await change(actor, "lab_orders", id, { status: status as LabOrder["status"], history }, "agente:avancar_os");
      return ok({ os: r.number, status_anterior: o.status, status_atual: r.status });
    }),
  );

  return server;
}

export { MCP_TOOLS };
