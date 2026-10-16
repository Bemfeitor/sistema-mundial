import Link from "next/link";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Stat, Table, Tabs, Td, cn } from "@/components/ui";
import { FilterBar, Flash, GroupedBars, HBars, compactBrl } from "@/components/gestao/kit";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { brl, date, label, pct, todayYmd } from "@/lib/format";
import { salesBetween } from "@/lib/gestao/server";
import { addDays, addMonths, daysInMonth, finStatus, mapBy, monthLabel, one, openAmount, rangeFrom, sum, type SearchParams } from "@/lib/gestao/util";
import type { Payable, Receivable } from "@/lib/types";
import { baixarTitulo, cancelarTitulo, criarReceber, salvarPagar } from "./actions";

const TABS = [
  { key: "receber", label: "Contas a receber" },
  { key: "pagar", label: "Contas a pagar" },
  { key: "fluxo", label: "Fluxo de caixa" },
  { key: "dre", label: "DRE do mês" },
  { key: "formas", label: "Recebimentos por forma" },
];
const STATUS_TONE = { aberto: "blue", pago: "green", vencido: "red", cancelado: "slate" } as const;
const DEFAULT_CATS = ["Aluguel", "Folha", "Pró-labore", "Energia", "Água", "Internet e telefone", "Marketing", "Impostos", "Taxas de cartão", "Manutenção", "Sistemas", "Contabilidade", "Fornecedor - lentes", "Fornecedor - armações", "Fornecedor - compras", "Outros"];
const isMerchandise = (cat: string) => /^(fornecedor|compra)/i.test(cat);

export default async function Financeiro({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireUser("financeiro");
  const sp = await searchParams;
  const aba = TABS.some((t) => t.key === one(sp.aba)) ? one(sp.aba) : "receber";
  const d = db();
  const today = todayYmd();
  const sf = ctx.storeId ? { store_id: ctx.storeId } : {};
  const [receivables, payables, customers, suppliers] = await Promise.all([
    d.list("receivables", { eq: sf, order: { column: "due_at" } }),
    d.list("payables", { eq: sf, order: { column: "due_at" } }),
    d.list("customers", { order: { column: "name" } }),
    d.list("suppliers", { order: { column: "name" } }),
  ]);
  const cust = mapBy(customers), sup = mapBy(suppliers);
  const storeName = (id: string) => ctx.stores.find((s) => s.id === id)?.code ?? "—";
  const actStores = ctx.can("consolidado") ? ctx.stores : ctx.stores.filter((s) => s.id === ctx.user.store_id);

  return (
    <div>
      <PageHeader title="Financeiro" subtitle="Contas, fluxo de caixa previsto e resultado do mês" />
      <Tabs items={TABS.map((t) => ({ ...t, href: `/financeiro?aba=${t.key}` }))} active={aba} />
      <Flash sp={sp} />
      {aba === "receber" && <Receber />}
      {aba === "pagar" && <Pagar />}
      {aba === "fluxo" && <Fluxo />}
      {aba === "dre" && <Dre />}
      {aba === "formas" && <Formas />}
    </div>
  );

  function StatusFilter({ tab }: { tab: string }) {
    const st = one(sp.status) || "pendentes";
    const opts = [["pendentes", "Pendentes"], ["vencido", "Vencidos"], ["aberto", "A vencer"], ["pago", "Pagos"], ["cancelado", "Cancelados"], ["todos", "Todos"]];
    return (
      <div className="mb-3 flex flex-wrap gap-1">
        {opts.map(([k, l]) => (
          <Link key={k} href={`/financeiro?aba=${tab}&status=${k}`} className={cn("rounded-full px-3 py-1 text-xs font-medium", st === k ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>
            {l}
          </Link>
        ))}
      </div>
    );
  }
  function filterStatus<T extends Receivable | Payable>(list: T[]) {
    const st = one(sp.status) || "pendentes";
    return list.filter((r) => {
      const s = finStatus(r, today);
      return st === "todos" ? true : st === "pendentes" ? s === "aberto" || s === "vencido" : s === st;
    });
  }
  function Settle({ table, r, back }: { table: "receivables" | "payables"; r: Receivable | Payable; back: string }) {
    const s = finStatus(r, today);
    if (s === "pago" || s === "cancelado") return null;
    return (
      <div className="flex items-center gap-1">
        <form action={baixarTitulo} className="flex items-center gap-1">
          <input type="hidden" name="table" value={table} />
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="back" value={back} />
          <Input name="amount" placeholder={(openAmount(r) / 100).toFixed(2).replace(".", ",")} className="w-24 px-2 py-1 text-xs" inputMode="decimal" title="Em branco = baixa total" />
          <Button variant="success" className="px-2 py-1 text-xs">Baixar</Button>
        </form>
        <form action={cancelarTitulo}>
          <input type="hidden" name="table" value={table} />
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="back" value={back} />
          <button className="rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100" title="Cancelar título">✕</button>
        </form>
      </div>
    );
  }

  function Receber() {
    const list = filterStatus(receivables);
    const late = receivables.filter((r) => finStatus(r, today) === "vencido");
    const open = receivables.filter((r) => finStatus(r, today) === "aberto");
    const back = `/financeiro?aba=receber&status=${one(sp.status) || "pendentes"}`;
    return (
      <>
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="A receber (a vencer)" value={brl(sum(open, openAmount))} hint={`${open.length} títulos`} />
          <Stat label="Vencidos" value={brl(sum(late, openAmount))} tone={late.length ? "bad" : "default"} hint={`${late.length} títulos`} />
          <Stat label="Próximos 30 dias" value={brl(sum(open.filter((r) => r.due_at <= addDays(today, 30)), openAmount))} />
          <Stat label="Inadimplência" value={pct((sum(late, openAmount) / Math.max(1, sum([...late, ...open], openAmount))) * 100)} tone={late.length ? "warn" : "good"} />
        </div>
        <StatusFilter tab="receber" />
        <div className="grid gap-4 lg:grid-cols-4">
          <Card className="lg:col-span-3">
            <Table head={["Vencimento", "Descrição", "Cliente", "Loja", "Valor", "Recebido", "Status", "Baixa (total ou parcial)"]} empty="Nenhum título.">
              {list.map((r) => {
                const s = finStatus(r, today);
                return (
                  <tr key={r.id}>
                    <Td className={cn("whitespace-nowrap text-xs", s === "vencido" && "font-semibold text-red-700")}>{date(r.due_at)}</Td>
                    <Td>{r.description}</Td>
                    <Td className="text-xs">{r.customer_id ? cust.get(r.customer_id)?.name ?? "—" : "—"}</Td>
                    <Td className="text-xs">{storeName(r.store_id)}</Td>
                    <Td>{brl(r.amount_cents)}</Td>
                    <Td className="text-xs">{brl(r.paid_cents)}</Td>
                    <Td><Badge tone={STATUS_TONE[s]}>{label(s)}</Badge></Td>
                    <Td><Settle table="receivables" r={r} back={back} /></Td>
                  </tr>
                );
              })}
            </Table>
          </Card>
          <Card>
            <CardHeader title="Lançar a receber" />
            <form action={criarReceber} className="grid gap-3 p-4">
              <Field label="Descrição"><Input name="description" required /></Field>
              <Field label="Cliente">
                <Select name="customer_id">
                  <option value="">—</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Loja">
                <Select name="store_id" defaultValue={ctx.storeId ?? ctx.user.store_id}>{actStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
              </Field>
              <Field label="Vencimento"><Input name="due_at" type="date" required defaultValue={addDays(today, 30)} /></Field>
              <Field label="Valor (R$)"><Input name="amount" inputMode="decimal" required /></Field>
              <Button>Lançar</Button>
            </form>
          </Card>
        </div>
      </>
    );
  }

  function Pagar() {
    const list = filterStatus(payables);
    const edit = payables.find((p) => p.id === one(sp.edit));
    const late = payables.filter((r) => finStatus(r, today) === "vencido");
    const open = payables.filter((r) => finStatus(r, today) === "aberto");
    const cats = [...new Set([...DEFAULT_CATS, ...payables.map((p) => p.category)])].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const back = `/financeiro?aba=pagar&status=${one(sp.status) || "pendentes"}`;
    return (
      <>
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Vencidas" value={brl(sum(late, openAmount))} tone={late.length ? "bad" : "default"} hint={`${late.length} contas`} />
          <Stat label="Vencem em 7 dias" value={brl(sum(open.filter((r) => r.due_at <= addDays(today, 7)), openAmount))} tone="warn" />
          <Stat label="Próximos 30 dias" value={brl(sum(open.filter((r) => r.due_at <= addDays(today, 30)), openAmount))} />
          <Stat label="Total em aberto" value={brl(sum([...open, ...late], openAmount))} />
        </div>
        <StatusFilter tab="pagar" />
        <div className="grid gap-4 lg:grid-cols-4">
          <Card className="lg:col-span-3">
            <Table head={["Vencimento", "Descrição", "Categoria", "Fornecedor", "Loja", "Valor", "Pago", "Status", "Baixa", ""]} empty="Nenhuma conta.">
              {list.map((r) => {
                const s = finStatus(r, today);
                return (
                  <tr key={r.id}>
                    <Td className={cn("whitespace-nowrap text-xs", s === "vencido" && "font-semibold text-red-700")}>{date(r.due_at)}</Td>
                    <Td>{r.description}</Td>
                    <Td className="text-xs">{r.category}</Td>
                    <Td className="text-xs">{r.supplier_id ? sup.get(r.supplier_id)?.name ?? "—" : "—"}</Td>
                    <Td className="text-xs">{storeName(r.store_id)}</Td>
                    <Td>{brl(r.amount_cents)}</Td>
                    <Td className="text-xs">{brl(r.paid_cents)}</Td>
                    <Td><Badge tone={STATUS_TONE[s]}>{label(s)}</Badge></Td>
                    <Td><Settle table="payables" r={r} back={back} /></Td>
                    <Td><Link href={`/financeiro?aba=pagar&edit=${r.id}`} className="text-xs text-brand-700 hover:underline">Editar</Link></Td>
                  </tr>
                );
              })}
            </Table>
          </Card>
          <Card>
            <CardHeader title={edit ? "Editar conta" : "Nova conta a pagar"} action={edit ? <Link href="/financeiro?aba=pagar" className="text-xs text-brand-700">Nova</Link> : undefined} />
            <form action={salvarPagar} className="grid gap-3 p-4" key={edit?.id ?? "nova"}>
              {edit && <input type="hidden" name="id" value={edit.id} />}
              <Field label="Descrição"><Input name="description" required defaultValue={edit?.description} /></Field>
              <Field label="Categoria">
                <Input name="category" list="cats-pagar" required defaultValue={edit?.category} />
                <datalist id="cats-pagar">{cats.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Fornecedor">
                <Select name="supplier_id" defaultValue={edit?.supplier_id ?? ""}>
                  <option value="">—</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="Loja">
                <Select name="store_id" defaultValue={edit?.store_id ?? ctx.storeId ?? ctx.user.store_id}>{actStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Vencimento"><Input name="due_at" type="date" required defaultValue={edit?.due_at ?? today} /></Field>
                <Field label="Valor (R$)"><Input name="amount" inputMode="decimal" required defaultValue={edit ? (edit.amount_cents / 100).toFixed(2).replace(".", ",") : ""} /></Field>
              </div>
              {!edit && <Field label="Parcelas (mensais)" hint="Valor total dividido igualmente"><Input name="parcelas" type="number" min={1} max={24} defaultValue={1} /></Field>}
              <Button>{edit ? "Salvar" : "Lançar"}</Button>
            </form>
          </Card>
        </div>
      </>
    );
  }

  function Fluxo() {
    const recOpen = receivables.filter((r) => ["aberto", "vencido"].includes(finStatus(r, today)));
    const payOpen = payables.filter((r) => ["aberto", "vencido"].includes(finStatus(r, today)));
    const bucket = (n: number) => {
      const lim = addDays(today, n);
      const rec = sum(recOpen.filter((r) => r.due_at >= today && r.due_at <= lim), openAmount);
      const pay = sum(payOpen.filter((r) => r.due_at >= today && r.due_at <= lim), openAmount);
      return { n, rec, pay, net: rec - pay };
    };
    const buckets = [30, 60, 90].map(bucket);
    const overdueRec = sum(recOpen.filter((r) => r.due_at < today), openAmount);
    const overduePay = sum(payOpen.filter((r) => r.due_at < today), openAmount);
    const weeks = Array.from({ length: 13 }, (_, i) => {
      const a = addDays(today, i * 7), b = addDays(today, i * 7 + 6);
      return {
        label: `${a.slice(8, 10)}/${a.slice(5, 7)}`,
        rec: sum(recOpen.filter((r) => r.due_at >= a && r.due_at <= b), openAmount),
        pay: sum(payOpen.filter((r) => r.due_at >= a && r.due_at <= b), openAmount),
      };
    });
    let run = 0;
    return (
      <>
        <div className="mb-4 grid gap-4 lg:grid-cols-3">
          {buckets.map((b) => (
            <Card key={b.n} className="p-5">
              <div className="text-sm text-slate-500">Próximos {b.n} dias</div>
              <div className={cn("mt-1 text-2xl font-bold", b.net >= 0 ? "text-emerald-700" : "text-red-700")}>{brl(b.net)}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <span>Receber: <b className="text-slate-800">{brl(b.rec)}</b></span>
                <span>Pagar: <b className="text-slate-800">{brl(b.pay)}</b></span>
              </div>
            </Card>
          ))}
        </div>
        {(overdueRec > 0 || overduePay > 0) && (
          <p className="mb-4 text-sm text-slate-600">
            Fora da previsão: <b className="text-red-700">{brl(overdueRec)}</b> em recebíveis vencidos e <b className="text-red-700">{brl(overduePay)}</b> em contas vencidas.
          </p>
        )}
        <Card className="mb-4">
          <CardHeader title="Previsão semanal (13 semanas)" subtitle="Entradas (a receber) x saídas (a pagar)" />
          <GroupedBars labels={weeks.map((w) => w.label)} series={[{ name: "A receber", values: weeks.map((w) => w.rec) }, { name: "A pagar", values: weeks.map((w) => w.pay) }]} format={compactBrl} />
        </Card>
        <Card>
          <Table head={["Semana iniciando", "Entradas", "Saídas", "Saldo da semana", "Saldo acumulado"]}>
            {weeks.map((w) => {
              run += w.rec - w.pay;
              return (
                <tr key={w.label}>
                  <Td>{w.label}</Td>
                  <Td className="text-emerald-700">{brl(w.rec)}</Td>
                  <Td className="text-red-700">{brl(w.pay)}</Td>
                  <Td className={w.rec - w.pay >= 0 ? "text-emerald-700" : "text-red-700"}>{brl(w.rec - w.pay)}</Td>
                  <Td className={cn("font-semibold", run >= 0 ? "text-emerald-700" : "text-red-700")}>{brl(run)}</Td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <p className="mt-2 text-xs text-slate-500">Vendas no cartão/crediário entram aqui quando lançadas como contas a receber. Saldo atual de caixa/banco não é considerado.</p>
      </>
    );
  }

  async function Dre() {
    const ym = /^\d{4}-\d{2}$/.test(one(sp.mes)) ? one(sp.mes) : today.slice(0, 7);
    const regime = one(sp.regime) === "caixa" ? "caixa" : "competencia";
    const from = `${ym}-01`, to = `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}`;
    const sales = await salesBetween(from, to, ctx.storeId);
    const gross = sum(sales, (s) => s.subtotal_cents);
    const disc = sum(sales, (s) => s.discount_cents);
    const net = sum(sales, (s) => s.total_cents);
    const cmv = sum(sales, (s) => s.cost_cents);
    const commissions = sum(sales, (s) => s.commission_cents);
    const exp = payables.filter((p) => p.status !== "cancelado" && p.due_at >= from && p.due_at <= to && !isMerchandise(p.category) && (regime === "competencia" || finStatus(p, today) === "pago"));
    const byCat = new Map<string, number>();
    for (const p of exp) byCat.set(p.category, (byCat.get(p.category) ?? 0) + (regime === "caixa" ? p.paid_cents : p.amount_cents));
    const expenses = [...byCat.values()].reduce((a, b) => a + b, 0);
    const grossProfit = net - cmv;
    const result = grossProfit - commissions - expenses;
    const line = (l: string, v: number, opts: { bold?: boolean; neg?: boolean; indent?: boolean; base?: number } = {}) => (
      <tr key={l} className={opts.bold ? "bg-slate-50" : ""}>
        <Td className={cn(opts.bold && "font-semibold", opts.indent && "pl-8 text-slate-600")}>{l}</Td>
        <Td className={cn("text-right tabular-nums", opts.bold && "font-semibold", opts.neg && "text-red-700")}>{opts.neg ? `(${brl(v)})` : brl(v)}</Td>
        <Td className="text-right text-xs text-slate-500">{net ? pct((v / net) * 100) : "—"}</Td>
      </tr>
    );
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link href={`/financeiro?aba=dre&mes=${addMonths(ym, -1)}&regime=${regime}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">← {monthLabel(addMonths(ym, -1))}</Link>
          <span className="px-2 font-semibold">{monthLabel(ym)}</span>
          <Link href={`/financeiro?aba=dre&mes=${addMonths(ym, 1)}&regime=${regime}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">{monthLabel(addMonths(ym, 1))} →</Link>
          <span className="ml-4 text-sm text-slate-500">Despesas por:</span>
          {(["competencia", "caixa"] as const).map((r) => (
            <Link key={r} href={`/financeiro?aba=dre&mes=${ym}&regime=${r}`} className={cn("rounded-full px-3 py-1 text-xs font-medium", regime === r ? "bg-brand-600 text-white" : "bg-white ring-1 ring-slate-200")}>
              {r === "competencia" ? "Competência (vencimento)" : "Caixa (pagas)"}
            </Link>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="DRE simplificada" subtitle={`${sales.length} vendas concluídas`} />
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Conta</th>
                  <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                  <th className="px-4 py-2.5 text-right font-medium">% receita líq.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {line("Receita bruta de vendas", gross)}
                {line("(−) Descontos concedidos", disc, { neg: true, indent: true })}
                {line("= Receita líquida", net, { bold: true })}
                {line("(−) CMV — custo das mercadorias vendidas", cmv, { neg: true, indent: true })}
                {line("= Margem bruta", grossProfit, { bold: true })}
                {line("(−) Comissões de vendas", commissions, { neg: true, indent: true })}
                {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => line(`(−) ${c}`, v, { neg: true, indent: true }))}
                {line("= Resultado operacional", result, { bold: true })}
              </tbody>
            </table>
          </Card>
          <div className="space-y-4">
            <Stat label="Margem bruta" value={pct(net ? (grossProfit / net) * 100 : 0)} tone="good" />
            <Stat label="Resultado do mês" value={brl(result)} tone={result >= 0 ? "good" : "bad"} hint={net ? `Margem líquida ${pct((result / net) * 100)}` : undefined} />
            <Card>
              <CardHeader title="Despesas por categoria" />
              <HBars items={[...byCat.entries()].map(([l, v]) => ({ label: l, value: v })).sort((a, b) => b.value - a.value)} format={brl} />
            </Card>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">Contas de categorias “Fornecedor…/Compra…” (mercadoria) ficam fora das despesas para não duplicar o CMV.</p>
      </>
    );
  }

  async function Formas() {
    const { from, to } = rangeFrom(sp);
    const sales = await salesBetween(from, to, ctx.storeId);
    const rows = new Map<string, { n: number; v: number; per: Map<string, number> }>();
    for (const s of sales)
      for (const p of s.payments) {
        const r = rows.get(p.method) ?? { n: 0, v: 0, per: new Map() };
        r.n++;
        r.v += p.amount_cents;
        r.per.set(s.store_id, (r.per.get(s.store_id) ?? 0) + p.amount_cents);
        rows.set(p.method, r);
      }
    const total = [...rows.values()].reduce((a, r) => a + r.v, 0);
    const list = [...rows.entries()].sort((a, b) => b[1].v - a[1].v);
    const stores = ctx.storeId ? ctx.stores.filter((s) => s.id === ctx.storeId) : ctx.stores;
    return (
      <>
        <FilterBar>
          <input type="hidden" name="aba" value="formas" />
          <Field label="De"><Input type="date" name="de" defaultValue={from} /></Field>
          <Field label="Até"><Input type="date" name="ate" defaultValue={to} /></Field>
        </FilterBar>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <Table head={["Forma de pagamento", "Lançamentos", ...stores.map((s) => s.code), "Total", "%"]} empty="Sem recebimentos no período.">
              {list.map(([m, r]) => (
                <tr key={m}>
                  <Td className="font-medium">{label(m)}</Td>
                  <Td>{r.n}</Td>
                  {stores.map((s) => <Td key={s.id}>{brl(r.per.get(s.id) ?? 0)}</Td>)}
                  <Td className="font-semibold">{brl(r.v)}</Td>
                  <Td className="text-xs">{pct((r.v / Math.max(1, total)) * 100)}</Td>
                </tr>
              ))}
            </Table>
            <div className="border-t border-slate-100 px-4 py-3 text-right text-sm">Total recebido: <b>{brl(total)}</b></div>
          </Card>
          <Card>
            <CardHeader title="Distribuição" />
            <HBars items={list.map(([m, r]) => ({ label: label(m), value: r.v }))} format={brl} />
          </Card>
        </div>
      </>
    );
  }
}
