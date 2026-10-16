import Link from "next/link";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Stat, Table, Td, cn } from "@/components/ui";
import { Flash, Progress } from "@/components/gestao/kit";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { brl, pct, todayYmd } from "@/lib/format";
import { salesBetween } from "@/lib/gestao/server";
import { addMonths, daysInMonth, groupBy, mapBy, monthLabel, one, sum, type SearchParams } from "@/lib/gestao/util";
import { copiarMetas, excluirMeta, salvarMeta } from "./actions";

export default async function Metas({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireUser("relatorios");
  const sp = await searchParams;
  const today = todayYmd();
  const ym = /^\d{4}-\d{2}$/.test(one(sp.mes)) ? one(sp.mes) : today.slice(0, 7);
  const dim = daysInMonth(ym);
  const from = `${ym}-01`, to = `${ym}-${String(dim).padStart(2, "0")}`;
  const isCurrent = ym === today.slice(0, 7);
  const elapsed = isCurrent ? Number(today.slice(8, 10)) : ym < today.slice(0, 7) ? dim : 0;
  const d = db();
  const [goals, employees, sales] = await Promise.all([
    d.list("goals", { eq: { month: ym } }),
    d.list("employees", { order: { column: "name" } }),
    salesBetween(from, to, null),
  ]);
  const inScope = (storeId: string) => !ctx.storeId || storeId === ctx.storeId;
  const emp = mapBy(employees);
  const storeName = (id: string) => ctx.stores.find((s) => s.id === id)?.name ?? "—";
  const scopedSales = sales.filter((s) => inScope(s.store_id));
  const byStore = groupBy(scopedSales, (s) => s.store_id);
  const bySeller = groupBy(scopedSales, (s) => s.seller_id);
  const proj = (v: number) => (elapsed ? Math.round((v / elapsed) * dim) : 0);

  const storeRows = ctx.stores
    .filter((s) => inScope(s.id))
    .map((s) => {
      const g = goals.find((x) => x.store_id === s.id && !x.employee_id);
      const real = sum(byStore.get(s.id) ?? [], (x) => x.total_cents);
      return { s, g, real };
    });
  const sellerGoals = goals.filter((g) => g.employee_id && inScope(g.store_id));
  const sellerIds = new Set([...sellerGoals.map((g) => g.employee_id!), ...bySeller.keys()]);
  const sellerRows = [...sellerIds]
    .map((id) => {
      const list = bySeller.get(id) ?? [];
      const g = sellerGoals.find((x) => x.employee_id === id);
      return {
        id, e: emp.get(id), g, n: list.length,
        real: sum(list, (x) => x.total_cents),
        commission: sum(list, (x) => x.commission_cents),
        ticket: list.length ? Math.round(sum(list, (x) => x.total_cents) / list.length) : 0,
      };
    })
    .sort((a, b) => b.real - a.real);
  const totalTarget = sum(storeRows, (r) => r.g?.target_cents ?? 0);
  const totalReal = sum(storeRows, (r) => r.real);
  const sellers = employees.filter((e) => e.active && (e.role === "vendedor" || e.role === "gerente" || e.permissions.includes("vender")));
  const editStore = storeRows.find((r) => r.g?.id === one(sp.edit))?.g ?? sellerGoals.find((g) => g.id === one(sp.edit));

  return (
    <div>
      <PageHeader
        title="Metas e comissões"
        subtitle="Metas mensais por loja e vendedor, realizado, projeção e comissões"
        actions={
          <div className="flex items-center gap-1">
            <Link href={`/metas?mes=${addMonths(ym, -1)}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">←</Link>
            <span className="px-3 font-semibold">{monthLabel(ym)}</span>
            <Link href={`/metas?mes=${addMonths(ym, 1)}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">→</Link>
          </div>
        }
      />
      <Flash sp={sp} />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Meta das lojas" value={brl(totalTarget)} />
        <Stat label="Realizado" value={brl(totalReal)} hint={totalTarget ? `${pct((totalReal / totalTarget) * 100)} da meta` : undefined} tone={totalTarget && totalReal >= totalTarget ? "good" : "default"} />
        <Stat label="Projeção do mês" value={isCurrent ? brl(proj(totalReal)) : "—"} hint={isCurrent ? `${elapsed} de ${dim} dias` : undefined} tone={isCurrent && totalTarget && proj(totalReal) < totalTarget ? "warn" : "good"} />
        <Stat label="Comissões do mês" value={brl(sum(sellerRows, (r) => r.commission))} />
      </div>

      <Card className="mb-4">
        <CardHeader title="Lojas" />
        <Table head={["Loja", "Meta", "Realizado", "Progresso", "Projeção", "Necessário por dia", ""]}>
          {storeRows.map(({ s, g, real }) => (
            <GoalRow key={s.id} name={s.name} target={g?.target_cents ?? 0} real={real} projection={proj(real)} isCurrent={isCurrent} remainingDays={dim - elapsed + (isCurrent ? 1 : 0)} goalId={g?.id} month={ym} />
          ))}
        </Table>
      </Card>

      <Card className="mb-4">
        <CardHeader title="Vendedores — meta e comissão" subtitle="Comissão = soma de commission_cents das vendas concluídas no mês" />
        <Table head={["Vendedor", "Loja", "Vendas", "Ticket", "Meta", "Realizado", "Progresso", "Projeção", "Comissão", ""]} empty="Sem vendedores com meta ou vendas no mês.">
          {sellerRows.map((r) => {
            const target = r.g?.target_cents ?? 0;
            const p = target ? (r.real / target) * 100 : 0;
            return (
              <tr key={r.id}>
                <Td className="font-medium">{r.e?.name ?? "—"}</Td>
                <Td className="text-xs">{r.e ? storeName(r.e.store_id) : "—"}</Td>
                <Td>{r.n}</Td>
                <Td>{brl(r.ticket)}</Td>
                <Td>{target ? brl(target) : <span className="text-slate-400">—</span>}</Td>
                <Td className="font-semibold">{brl(r.real)}</Td>
                <Td className="w-40">{target ? <><div className="mb-1 text-xs">{pct(p)}</div><Progress value={r.real} max={target} /></> : null}</Td>
                <Td className="text-xs">{isCurrent ? brl(proj(r.real)) : "—"}</Td>
                <Td className="font-semibold text-emerald-700">{brl(r.commission)}</Td>
                <Td>{r.g && <GoalActions id={r.g.id} month={ym} />}</Td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={editStore ? "Editar meta" : "Cadastrar / atualizar meta"} subtitle="Se já existir meta para a loja/vendedor no mês, o valor é substituído" />
          <form action={salvarMeta} className="grid gap-3 p-5" key={editStore?.id ?? "nova"}>
            <input type="hidden" name="month" value={ym} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Loja">
                <Select name="store_id" defaultValue={editStore?.store_id ?? ctx.storeId ?? ctx.user.store_id}>
                  {ctx.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="Vendedor" hint="Em branco = meta da loja">
                <Select name="employee_id" defaultValue={editStore?.employee_id ?? ""}>
                  <option value="">— Meta da loja —</option>
                  {sellers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </Select>
              </Field>
            </div>
            <Field label={`Meta de ${monthLabel(ym)} (R$)`}>
              <Input name="target" inputMode="decimal" required defaultValue={editStore ? (editStore.target_cents / 100).toFixed(2).replace(".", ",") : ""} />
            </Field>
            <Button>Salvar meta</Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Copiar metas" subtitle="Repete as metas de outro mês (não sobrescreve existentes)" />
          <form action={copiarMetas} className="flex flex-wrap items-end gap-3 p-5">
            <Field label="Copiar de"><Input name="from" type="month" defaultValue={addMonths(ym, -1)} /></Field>
            <input type="hidden" name="to" value={ym} />
            <Button variant="secondary">Copiar para {monthLabel(ym)}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function GoalRow({ name, target, real, projection, isCurrent, remainingDays, goalId, month }: { name: string; target: number; real: number; projection: number; isCurrent: boolean; remainingDays: number; goalId?: string; month: string }) {
  const p = target ? (real / target) * 100 : 0;
  return (
    <tr>
      <Td className="font-medium">{name}</Td>
      <Td>{target ? brl(target) : <span className="text-slate-400">Sem meta</span>}</Td>
      <Td className="font-semibold">{brl(real)}</Td>
      <Td className="w-48">
        {target ? (
          <>
            <div className="mb-1 flex items-center gap-2 text-xs">
              {pct(p)} {p >= 100 && <Badge tone="green">Batida</Badge>}
            </div>
            <Progress value={real} max={target} />
          </>
        ) : null}
      </Td>
      <Td className={cn("text-xs", isCurrent && target && projection < target ? "text-amber-700" : "")}>{isCurrent ? brl(projection) : "—"}</Td>
      <Td className="text-xs">{isCurrent && target > real ? brl(Math.round((target - real) / Math.max(1, remainingDays))) : "—"}</Td>
      <Td>{goalId && <GoalActions id={goalId} month={month} />}</Td>
    </tr>
  );
}

function GoalActions({ id, month }: { id: string; month: string }) {
  return (
    <div className="flex gap-1">
      <Link href={`/metas?mes=${month}&edit=${id}`} className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50">Editar</Link>
      <form action={excluirMeta}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="month" value={month} />
        <button className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">Excluir</button>
      </form>
    </div>
  );
}
