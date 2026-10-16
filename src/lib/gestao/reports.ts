import "server-only";
import { db } from "@/lib/db";
import { label } from "@/lib/format";
import type { Employee, Sale } from "@/lib/types";
import { salesBetween } from "./server";
import { groupBy, labLate, localYmd, mapBy, one, pctOf, rangeFrom, sum, type SP } from "./util";

export type Cell = string | number | { money: number } | { pct: number };
export interface Report {
  title: string;
  description: string;
  columns: string[];
  rows: Cell[][];
  footer?: Cell[];
}
export interface ReportFilters {
  from: string;
  to: string;
  storeId: string | null;
  sellerId: string | null;
}

export const REPORTS = [
  { key: "vendas", label: "Vendas detalhadas", desc: "Todas as vendas com itens, desconto, margem e pagamento" },
  { key: "vendedores", label: "Raio-X dos vendedores", desc: "Ticket, itens por venda, % com adicional, % multifocal, desconto médio" },
  { key: "categorias", label: "Por categoria e marca", desc: "Quantidade, faturamento e margem por categoria/marca" },
  { key: "pagamentos", label: "Por forma de pagamento", desc: "Recebimentos por forma e parcelamento médio" },
  { key: "margem", label: "Margem por produto", desc: "Receita, custo e margem de cada produto" },
  { key: "cashback", label: "Cashback emitido x usado", desc: "Movimentos do programa de fidelidade no período" },
  { key: "os", label: "OS por status e laboratório", desc: "Ordens de serviço abertas no período e atrasos" },
  { key: "clientes", label: "Clientes novos x recorrentes", desc: "Primeira compra no período versus clientes que voltaram" },
] as const;
export type ReportKey = (typeof REPORTS)[number]["key"];
export const isReportKey = (k: string): k is ReportKey => REPORTS.some((r) => r.key === k);

const m = (cents: number) => ({ money: cents });
const p = (v: number) => ({ pct: v });
const itemRevenue = (s: Sale, it: Sale["items"][number]) =>
  Math.round(it.price_cents * it.qty * (s.subtotal_cents ? s.total_cents / s.subtotal_cents : 1));

export async function buildReport(tipo: ReportKey, f: ReportFilters): Promise<Report> {
  const d = db();
  const def = REPORTS.find((r) => r.key === tipo)!;
  const [employees, stores] = await Promise.all([d.list("employees"), d.list("stores")]);
  const emp = mapBy(employees), st = mapBy(stores);
  const salesAll = await salesBetween(f.from, f.to, f.storeId);
  const sales = f.sellerId ? salesAll.filter((s) => s.seller_id === f.sellerId) : salesAll;
  const base = { title: def.label, description: def.desc };

  if (tipo === "vendas") {
    const cust = mapBy(await d.list("customers"));
    const rows = sales
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((s) => [
        localYmd(s.created_at).split("-").reverse().join("/"),
        s.number,
        st.get(s.store_id)?.code ?? "—",
        emp.get(s.seller_id)?.name ?? "—",
        s.customer_id ? cust.get(s.customer_id)?.name ?? "—" : "Consumidor",
        s.items.map((i) => `${i.qty}x ${i.name}`).join(" | "),
        m(s.subtotal_cents), m(s.discount_cents), m(s.total_cents), m(s.cost_cents),
        p(pctOf(s.total_cents - s.cost_cents, s.total_cents)),
        s.payments.map((x) => `${label(x.method)}${x.installments && x.installments > 1 ? ` ${x.installments}x` : ""}`).join(" + "),
      ] as Cell[]);
    const tot = sum(sales, (s) => s.total_cents), cost = sum(sales, (s) => s.cost_cents);
    return {
      ...base,
      columns: ["Data", "Venda", "Loja", "Vendedor", "Cliente", "Itens", "Subtotal", "Desconto", "Total", "Custo", "Margem %", "Pagamento"],
      rows,
      footer: [`${sales.length} vendas`, "", "", "", "", "", m(sum(sales, (s) => s.subtotal_cents)), m(sum(sales, (s) => s.discount_cents)), m(tot), m(cost), p(pctOf(tot - cost, tot)), ""],
    };
  }

  if (tipo === "vendedores") {
    const prod = mapBy(await d.list("products"));
    const rows = [...groupBy(sales, (s) => s.seller_id).entries()]
      .map(([id, list]) => {
        const total = sum(list, (s) => s.total_cents);
        const items = sum(list, (s) => sum(s.items, (i) => i.qty));
        const withAdd = list.filter((s) => s.items.some((i) => i.role === "adicional" || i.role === "segundo_par" || i.role === "upgrade")).length;
        const withLens = list.filter((s) => s.items.some((i) => i.category === "lente"));
        const multi = withLens.filter((s) => s.items.some((i) => i.category === "lente" && prod.get(i.product_id)?.lens?.type === "multifocal")).length;
        const discPct = list.length ? sum(list, (s) => pctOf(s.discount_cents, s.subtotal_cents)) / list.length : 0;
        return {
          total,
          cells: [emp.get(id)?.name ?? "—", list.length, m(total), m(list.length ? Math.round(total / list.length) : 0),
            Math.round((items / Math.max(1, list.length)) * 10) / 10, p(pctOf(withAdd, list.length)), p(pctOf(multi, withLens.length)),
            p(discPct), m(sum(list, (s) => s.commission_cents))] as Cell[],
        };
      })
      .sort((a, b) => b.total - a.total)
      .map((r) => r.cells);
    return { ...base, columns: ["Vendedor", "Vendas", "Faturamento", "Ticket médio", "Itens/venda", "% com adicional", "% multifocal (vendas c/ lente)", "Desconto médio", "Comissão"], rows };
  }

  if (tipo === "categorias" || tipo === "margem") {
    const prod = mapBy(await d.list("products"));
    const acc = new Map<string, { a: string; b: string; c: string; qty: number; rev: number; cost: number }>();
    for (const s of sales)
      for (const it of s.items) {
        const pr = prod.get(it.product_id);
        const key = tipo === "categorias" ? `${it.category}|${pr?.brand ?? "—"}` : it.product_id;
        const r = acc.get(key) ?? (tipo === "categorias"
          ? { a: label(it.category), b: pr?.brand ?? "—", c: "", qty: 0, rev: 0, cost: 0 }
          : { a: it.name, b: pr?.sku ?? "—", c: label(it.category), qty: 0, rev: 0, cost: 0 });
        r.qty += it.qty;
        r.rev += itemRevenue(s, it);
        r.cost += it.cost_cents * it.qty;
        acc.set(key, r);
      }
    const total = [...acc.values()].reduce((x, r) => x + r.rev, 0);
    const list = [...acc.values()].sort((x, y) => y.rev - x.rev);
    if (tipo === "categorias")
      return {
        ...base,
        columns: ["Categoria", "Marca", "Qtd", "Faturamento", "Custo", "Margem R$", "Margem %", "Participação"],
        rows: list.map((r) => [r.a, r.b, r.qty, m(r.rev), m(r.cost), m(r.rev - r.cost), p(pctOf(r.rev - r.cost, r.rev)), p(pctOf(r.rev, total))]),
      };
    return {
      ...base,
      columns: ["Produto", "SKU", "Categoria", "Qtd", "Receita", "Custo", "Margem R$", "Margem %"],
      rows: list.map((r) => [r.a, r.b, r.c, r.qty, m(r.rev), m(r.cost), m(r.rev - r.cost), p(pctOf(r.rev - r.cost, r.rev))]),
    };
  }

  if (tipo === "pagamentos") {
    const acc = new Map<string, { n: number; v: number; inst: number }>();
    for (const s of sales)
      for (const x of s.payments) {
        const r = acc.get(x.method) ?? { n: 0, v: 0, inst: 0 };
        r.n++;
        r.v += x.amount_cents;
        r.inst += x.installments ?? 1;
        acc.set(x.method, r);
      }
    const total = [...acc.values()].reduce((a, r) => a + r.v, 0);
    return {
      ...base,
      columns: ["Forma", "Lançamentos", "Total", "%", "Parcelas (média)"],
      rows: [...acc.entries()].sort((a, b) => b[1].v - a[1].v).map(([k, r]) => [label(k), r.n, m(r.v), p(pctOf(r.v, total)), Math.round((r.inst / r.n) * 10) / 10]),
      footer: ["Total", sum([...acc.values()], (r) => r.n), m(total), p(100), ""],
    };
  }

  if (tipo === "cashback") {
    const [movs, customers] = await Promise.all([d.list("benefit_movements"), d.list("customers")]);
    const cust = mapBy(customers);
    const list = movs
      .filter((x) => {
        const dd = localYmd(x.created_at);
        return dd >= f.from && dd <= f.to && (!f.storeId || cust.get(x.customer_id)?.store_id === f.storeId);
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const emitted = sum(list.filter((x) => x.amount_cents > 0), (x) => x.amount_cents);
    const used = -sum(list.filter((x) => x.amount_cents < 0), (x) => x.amount_cents);
    return {
      ...base,
      columns: ["Data", "Cliente", "Tipo", "Valor", "Motivo"],
      rows: list.map((x) => [localYmd(x.created_at).split("-").reverse().join("/"), cust.get(x.customer_id)?.name ?? "—", x.amount_cents > 0 ? "Emitido" : "Usado", m(Math.abs(x.amount_cents)), x.reason]),
      footer: [`Emitido ${(emitted / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`, `Usado ${(used / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`, `Taxa de uso ${Math.round(pctOf(used, emitted))}%`, "", ""],
    };
  }

  if (tipo === "os") {
    const [orders, suppliers] = await Promise.all([d.list("lab_orders", { eq: f.storeId ? { store_id: f.storeId } : {} }), d.list("suppliers")]);
    const sup = mapBy(suppliers);
    const list = orders.filter((o) => {
      const dd = localYmd(o.created_at);
      return dd >= f.from && dd <= f.to;
    });
    const rows = [...groupBy(list, (o) => `${o.supplier_id ?? ""}|${o.status}`).entries()]
      .map(([k, os]) => {
        const [sid, status] = k.split("|");
        return [sid ? sup.get(sid)?.name ?? "—" : "Sem laboratório", label(status), os.length, os.filter((o) => labLate(o)).length] as Cell[];
      })
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || (b[2] as number) - (a[2] as number));
    return { ...base, columns: ["Laboratório", "Status", "OS", "Atrasadas"], rows, footer: ["Total", "", list.length, list.filter((o) => labLate(o)).length] };
  }

  // clientes novos x recorrentes
  const history = await d.list("sales", { eq: { status: "concluida" }, lte: { column: "created_at", value: `${f.to}T23:59:59.999Z` }, limit: 20000 });
  const first = new Map<string, string>();
  for (const s of history) {
    if (!s.customer_id) continue;
    const dd = localYmd(s.created_at);
    if (!first.has(s.customer_id) || dd < first.get(s.customer_id)!) first.set(s.customer_id, dd);
  }
  const kind = (s: Sale) => (!s.customer_id ? "Sem cadastro" : (first.get(s.customer_id) ?? f.from) >= f.from ? "Novo" : "Recorrente");
  const rows = [...groupBy(sales, (s) => `${s.store_id}|${kind(s)}`).entries()]
    .map(([k, list]) => {
      const [sid, t] = k.split("|");
      const total = sum(list, (s) => s.total_cents);
      return [st.get(sid)?.name ?? "—", t, new Set(list.map((s) => s.customer_id ?? s.id)).size, list.length, m(total), m(Math.round(total / list.length))] as Cell[];
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));
  return { ...base, columns: ["Loja", "Tipo", "Clientes", "Vendas", "Faturamento", "Ticket médio"], rows };
}

/** Filtros a partir da query, respeitando o acesso do usuário às lojas. */
export function resolveFilters(user: Employee, sp: SP, fallbackStore: string | null): ReportFilters {
  const { from, to } = rangeFrom(sp);
  const consolidated = user.role === "admin" || user.permissions.includes("consolidado");
  const loja = one(sp.loja);
  const storeId = !consolidated ? user.store_id : loja === "all" ? null : loja || fallbackStore;
  return { from, to, storeId, sellerId: one(sp.vendedor) || null };
}

/** Converte célula para texto de exibição. */
export const showCell = (c: Cell) =>
  typeof c === "object"
    ? "money" in c
      ? (c.money / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : `${(Math.round(c.pct * 10) / 10).toLocaleString("pt-BR")}%`
    : typeof c === "number"
      ? c.toLocaleString("pt-BR")
      : c;

/** Converte célula para valor de CSV (números puros). */
export const csvCell = (c: Cell): string | number =>
  typeof c === "object" ? ("money" in c ? Math.round(c.money) / 100 : Math.round(c.pct * 10) / 10) : c;
