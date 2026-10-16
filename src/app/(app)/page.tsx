import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Boxes, Cake, CalendarClock, CircleDollarSign, Clock, Eye, Receipt, ShoppingBag, Target, TrendingUp, Wallet,
} from "lucide-react";
import { Card, CardHeader, PageHeader, Stat, Table, Td, cn } from "@/components/ui";
import { GroupedBars, HBars, Progress, compactBrl } from "@/components/gestao/kit";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { brl, label, pct, todayYmd } from "@/lib/format";
import { salesBetween } from "@/lib/gestao/server";
import {
  PERIODS, addDays, dayList, finStatus, groupBy, labLate, localYmd, mapBy, monthLabel, one, openAmount, periodRange, sum,
  type Period, type SearchParams,
} from "@/lib/gestao/util";

export default async function Painel({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireUser();
  const sp = await searchParams;
  const period = (PERIODS.some((p) => p.key === one(sp.periodo)) ? one(sp.periodo) : "mes") as Period;
  const today = todayYmd();
  const month = today.slice(0, 7);
  const { from, to } = periodRange(period, today);
  const d = db();
  const sf = ctx.storeId;
  const showFin = ctx.can("financeiro");
  const showMgmt = ctx.can("relatorios") || ctx.can("financeiro");
  const visibleStores = ctx.can("consolidado") ? ctx.stores : ctx.stores.filter((s) => s.id === ctx.user.store_id);

  // período do gráfico
  const chartFrom = period === "ano" ? `${today.slice(0, 4)}-01-01` : period === "mes" ? `${month}-01` : addDays(today, -13);
  const minFrom = [from, chartFrom, `${month}-01`].sort()[0];

  const [allSales, employees, labOrders, payables, receivables, stock, products, customers, prescriptions, goals, transfers, messages, quotes] =
    await Promise.all([
      salesBetween(minFrom, today, ctx.can("consolidado") ? null : ctx.user.store_id),
      d.list("employees"),
      d.list("lab_orders", { eq: sf ? { store_id: sf } : {} }),
      showFin ? d.list("payables", { eq: sf ? { store_id: sf } : {} }) : Promise.resolve([]),
      showFin ? d.list("receivables", { eq: sf ? { store_id: sf } : {} }) : Promise.resolve([]),
      d.list("stock", { eq: sf ? { store_id: sf } : {} }),
      d.list("products", { eq: { active: true } }),
      d.list("customers", { eq: sf ? { store_id: sf } : {} }),
      d.list("prescriptions"),
      d.list("goals", { eq: { month } }),
      d.list("transfers"),
      d.list("messages", { eq: { status: "para_validar" } }),
      d.list("quotes", { eq: { status: "aberto", ...(sf ? { store_id: sf } : {}) } }),
    ]);

  const inStore = <T extends { store_id: string }>(x: T) => !sf || x.store_id === sf;
  const sales = allSales.filter((s) => inStore(s) && localYmd(s.created_at) >= from && localYmd(s.created_at) <= to);
  const revenue = sum(sales, (s) => s.total_cents);
  const cost = sum(sales, (s) => s.cost_cents);
  const ticket = sales.length ? Math.round(revenue / sales.length) : 0;
  const margin = revenue ? ((revenue - cost) / revenue) * 100 : 0;

  // meta do mês
  const monthSales = allSales.filter((s) => inStore(s) && localYmd(s.created_at) >= `${month}-01`);
  const monthRevenue = sum(monthSales, (s) => s.total_cents);
  const storeGoals = goals.filter((g) => !g.employee_id && inStore(g));
  const goalTarget = sum(storeGoals, (g) => g.target_cents);
  const dayOfMonth = Number(today.slice(8, 10));
  const dim = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const projection = Math.round((monthRevenue / dayOfMonth) * dim);

  // alertas
  const lateOS = labOrders.filter((o) => labLate(o, today));
  const in7 = addDays(today, 7);
  const payDue = payables.filter((p) => finStatus(p, today) !== "pago" && p.status !== "cancelado" && p.due_at >= today && p.due_at <= in7);
  const payLate = payables.filter((p) => finStatus(p, today) === "vencido");
  const recLate = receivables.filter((r) => finStatus(r, today) === "vencido");
  const productIds = new Set(products.map((p) => p.id));
  const lowStock = stock.filter((s) => productIds.has(s.product_id) && s.qty < s.min_qty);
  const customerIds = new Set(customers.map((c) => c.id));
  const rxDue = prescriptions.filter(
    (p) => customerIds.has(p.customer_id) && p.valid_until && p.valid_until >= addDays(today, -30) && p.valid_until <= addDays(today, 30),
  );
  const md = today.slice(5);
  const bdayToday = customers.filter((c) => c.birth?.slice(5) === md);
  const bdayMonth = customers.filter((c) => c.birth?.slice(5, 7) === today.slice(5, 7));
  const pendingTransfers = transfers.filter(
    (t) => (t.status === "solicitada" || t.status === "enviada") && (!sf || t.from_store_id === sf || t.to_store_id === sf),
  );

  // gráfico Loja x Loja
  const chartSales = allSales.filter((s) => localYmd(s.created_at) >= chartFrom);
  let labels: string[];
  let keyOf: (s: { created_at: string }) => string;
  let keys: string[];
  if (period === "ano") {
    keys = Array.from({ length: Number(month.slice(5, 7)) }, (_, i) => `${today.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`);
    labels = keys.map((k) => monthLabel(k).split("/")[0]);
    keyOf = (s) => localYmd(s.created_at).slice(0, 7);
  } else {
    keys = dayList(chartFrom, today);
    labels = keys.map((k) => `${k.slice(8, 10)}/${k.slice(5, 7)}`);
    keyOf = (s) => localYmd(s.created_at);
  }
  const series = visibleStores.map((st) => {
    const byKey = groupBy(chartSales.filter((s) => s.store_id === st.id), keyOf);
    return { name: st.name, values: keys.map((k) => sum(byKey.get(k) ?? [], (s) => s.total_cents)) };
  });

  // ranking
  const emp = mapBy(employees);
  const ranking = [...groupBy(sales, (s) => s.seller_id).entries()]
    .map(([id, list]) => ({ id, name: emp.get(id)?.name ?? "—", n: list.length, total: sum(list, (s) => s.total_cents) }))
    .sort((a, b) => b.total - a.total);

  // mix
  const mixGroups: Record<string, string> = { lente: "Lentes", armacao: "Armações", solar: "Solar", lente_contato: "Lentes de contato", acessorio: "Acessórios", servico: "Serviços" };
  const mixMap = new Map<string, number>();
  for (const s of sales) {
    const factor = s.subtotal_cents ? s.total_cents / s.subtotal_cents : 1;
    for (const it of s.items) mixMap.set(it.category, (mixMap.get(it.category) ?? 0) + Math.round(it.price_cents * it.qty * factor));
  }
  const mix = Object.entries(mixGroups)
    .map(([k, l]) => ({ label: l, value: mixMap.get(k) ?? 0 }))
    .filter((m) => m.value > 0)
    .sort((a, b) => b.value - a.value);

  const attention: { label: string; count: number; href: string; tone: "red" | "amber" | "blue"; hint?: string; show: boolean }[] = [
    { label: "OS atrasadas no laboratório", count: lateOS.length, href: "/os", tone: "red", show: ctx.can("os") || showMgmt },
    { label: "Contas a pagar vencidas", count: payLate.length, href: "/financeiro?aba=pagar&status=vencido", tone: "red", hint: brl(sum(payLate, openAmount)), show: showFin },
    { label: "Contas a pagar nos próximos 7 dias", count: payDue.length, href: "/financeiro?aba=pagar", tone: "amber", hint: brl(sum(payDue, openAmount)), show: showFin },
    { label: "Recebíveis vencidos", count: recLate.length, href: "/financeiro?aba=receber&status=vencido", tone: "red", hint: brl(sum(recLate, openAmount)), show: showFin },
    { label: "Produtos abaixo do estoque mínimo", count: lowStock.length, href: "/estoque?abaixo=1", tone: "amber", show: ctx.can("estoque") },
    { label: "Sugestão de compra disponível", count: lowStock.length ? 1 : 0, href: "/compras?aba=sugestao", tone: "blue", show: ctx.can("compras") },
    { label: "Transferências entre lojas pendentes", count: pendingTransfers.length, href: "/estoque?aba=transferencias", tone: "blue", show: ctx.can("estoque") },
    { label: "Receitas vencendo (convidar para reexame)", count: rxDue.length, href: "/crm", tone: "amber", show: ctx.can("crm") },
    { label: "Aniversariantes de hoje", count: bdayToday.length, href: "/clientes", tone: "blue", show: ctx.can("clientes") },
    { label: "Mensagens aguardando validação", count: messages.length, href: "/mensagens", tone: "blue", show: ctx.can("crm") },
    { label: "Orçamentos em aberto", count: quotes.length, href: "/orcamentos", tone: "blue", show: ctx.can("vender") },
  ];
  const att = attention.filter((a) => a.show && a.count > 0);
  const storeLabel = sf ? ctx.stores.find((s) => s.id === sf)?.name ?? "Loja" : "Consolidado";

  return (
    <div>
      <PageHeader
        title="Painel"
        subtitle={`${storeLabel} · ${from === to ? from.split("-").reverse().join("/") : `${from.split("-").reverse().join("/")} a ${to.split("-").reverse().join("/")}`}`}
        actions={
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`/?periodo=${p.key}`}
                className={cn("rounded-md px-3 py-1.5 text-sm font-medium", p.key === period ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50")}
              >
                {p.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Faturamento" value={brl(revenue)} icon={<CircleDollarSign className="size-4" />} hint={`${sales.length} vendas concluídas`} />
        <Stat label="Ticket médio" value={brl(ticket)} icon={<Receipt className="size-4" />} />
        <Stat label="Nº de vendas" value={sales.length} icon={<ShoppingBag className="size-4" />} />
        {showMgmt ? (
          <Stat label="Margem bruta" value={pct(margin)} tone={margin >= 55 ? "good" : margin >= 40 ? "default" : "warn"} icon={<TrendingUp className="size-4" />} hint={`Lucro bruto ${brl(revenue - cost)}`} />
        ) : (
          <Stat label="Itens vendidos" value={sum(sales, (s) => sum(s.items, (i) => i.qty))} icon={<TrendingUp className="size-4" />} />
        )}
      </div>

      <Card className="mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <Target className="size-4 text-brand-600" /> Meta de {monthLabel(month)}
          </div>
          <div className="text-sm text-slate-600">
            {brl(monthRevenue)} de {goalTarget ? brl(goalTarget) : "—"}
            {goalTarget > 0 && <span className="ml-2 font-semibold text-slate-900">{pct((monthRevenue / goalTarget) * 100)}</span>}
          </div>
        </div>
        <Progress value={monthRevenue} max={goalTarget || 1} className="mt-3" />
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <span>Projeção para o fim do mês: <b className="text-slate-700">{brl(projection)}</b></span>
          {goalTarget > 0 && (
            <span>
              {monthRevenue >= goalTarget
                ? "Meta batida!"
                : `Faltam ${brl(goalTarget - monthRevenue)} · ${brl(Math.round((goalTarget - monthRevenue) / Math.max(1, dim - dayOfMonth + 1)))} por dia`}
            </span>
          )}
          {!goalTarget && ctx.can("relatorios") && <Link href="/metas" className="text-brand-700 hover:underline">Cadastrar meta</Link>}
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MiniAlert icon={<Clock className="size-4" />} label="OS atrasadas" value={lateOS.length} href="/os" bad={lateOS.length > 0} />
        {showFin && <MiniAlert icon={<Wallet className="size-4" />} label="A pagar em 7 dias" value={brl(sum(payDue, openAmount))} hint={`${payDue.length} títulos`} href="/financeiro?aba=pagar" />}
        {showFin && <MiniAlert icon={<AlertTriangle className="size-4" />} label="A receber vencidos" value={brl(sum(recLate, openAmount))} hint={`${recLate.length} títulos`} href="/financeiro?aba=receber&status=vencido" bad={recLate.length > 0} />}
        <MiniAlert icon={<Boxes className="size-4" />} label="Abaixo do mínimo" value={lowStock.length} hint="itens de estoque" href="/estoque?abaixo=1" bad={lowStock.length > 0} />
        <MiniAlert icon={<Eye className="size-4" />} label="Receitas vencendo" value={rxDue.length} hint="±30 dias · reexame" href="/crm" />
        <MiniAlert icon={<Cake className="size-4" />} label="Aniversariantes" value={bdayToday.length} hint={`${bdayMonth.length} no mês`} href="/clientes" />
        <MiniAlert icon={<CalendarClock className="size-4" />} label="Transferências pendentes" value={pendingTransfers.length} href="/estoque?aba=transferencias" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={visibleStores.length > 1 ? `Vendas por ${period === "ano" ? "mês" : "dia"} — ${visibleStores.map((s) => s.code).join(" x ")}` : `Vendas por ${period === "ano" ? "mês" : "dia"}`}
            subtitle={period === "hoje" || period === "semana" ? "Últimos 14 dias" : period === "mes" ? "Mês corrente" : "Ano corrente"}
          />
          <GroupedBars labels={labels} series={series} format={compactBrl} />
        </Card>
        <Card>
          <CardHeader title="Precisa de atenção" subtitle="Atalhos para cada módulo" />
          {att.length ? (
            <ul className="divide-y divide-slate-100">
              {att.map((a) => (
                <li key={a.label}>
                  <Link href={a.href} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-slate-50">
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold", a.tone === "red" ? "bg-red-50 text-red-700" : a.tone === "amber" ? "bg-amber-50 text-amber-800" : "bg-brand-50 text-brand-700")}>
                      {a.label.startsWith("Sugestão") ? "!" : a.count}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-slate-800">{a.label}</span>
                      {a.hint && <span className="text-xs text-slate-500">{a.hint}</span>}
                    </span>
                    <ArrowRight className="size-4 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-center text-sm text-slate-500">Tudo em dia por aqui.</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Ranking de vendedores" subtitle="Faturamento no período" />
          <Table head={["#", "Vendedor", "Vendas", "Ticket", "Faturamento"]} empty="Nenhuma venda no período.">
            {ranking.map((r, i) => (
              <tr key={r.id}>
                <Td className="w-10 font-semibold text-slate-500">{i + 1}º</Td>
                <Td className="font-medium">{r.name}</Td>
                <Td>{r.n}</Td>
                <Td>{brl(Math.round(r.total / r.n))}</Td>
                <Td className="font-semibold">{brl(r.total)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card>
          <CardHeader title="Mix de vendas por categoria" subtitle="Participação no faturamento (líquido de desconto)" />
          <HBars items={mix} format={brl} />
        </Card>
      </div>
      {!showFin && <p className="mt-4 text-xs text-slate-400">Indicadores financeiros ficam visíveis para perfis com permissão “{label("financeiro")}”.</p>}
    </div>
  );
}

function MiniAlert({ icon, label, value, hint, href, bad }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string; href: string; bad?: boolean }) {
  return (
    <Link href={href} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-500">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{label}</span>
        <span className={bad ? "text-red-600" : "text-slate-400"}>{icon}</span>
      </div>
      <div className={cn("mt-1.5 text-xl font-bold", bad ? "text-red-700" : "text-slate-900")}>{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </Link>
  );
}
