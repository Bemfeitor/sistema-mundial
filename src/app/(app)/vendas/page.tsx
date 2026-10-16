import { Suspense } from "react";
import Link from "next/link";
import { Plus, Receipt } from "lucide-react";
import { Badge, Button, Card, Field, Input, LinkButton, PageHeader, Select, Stat, Table, Td } from "@/components/ui";
import { db, type ListOptions } from "@/lib/db";
import { requireUser, storeFilter } from "@/lib/session";
import { brl, dateTime, label, todayYmd } from "@/lib/format";
import { addDays } from "@/lib/vendas/calc";

export const metadata = { title: "Vendas" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function VendasPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-slate-100" />}>
      <Vendas {...props} />
    </Suspense>
  );
}

async function Vendas({ searchParams }: Props) {
  const ctx = await requireUser("vender");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const today = todayYmd();
  const de = s("de") || addDays(today, -30);
  const ate = s("ate") || today;
  const vendedor = s("vendedor");
  const status = s("status");
  const q = s("q").trim().toLowerCase();

  const d = db();
  const opts: ListOptions<"sales"> = {
    eq: { ...storeFilter(ctx), ...(vendedor ? { seller_id: vendedor } : {}), ...(status ? { status } : {}) },
    gte: { column: "created_at", value: de },
    order: { column: "created_at", ascending: false },
    limit: 1000,
  };
  const [rawSales, employees, stores] = await Promise.all([d.list("sales", opts), d.list("employees"), Promise.resolve(ctx.stores)]);
  const localYmd = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const sales0 = rawSales.filter((x) => localYmd(x.created_at) <= ate);
  const customerIds = [...new Set(sales0.map((x) => x.customer_id).filter(Boolean))] as string[];
  const customers = customerIds.length ? await d.list("customers", { in: { column: "id", values: customerIds } }) : [];
  const cName = new Map(customers.map((c) => [c.id, c.name]));
  const eName = new Map(employees.map((e) => [e.id, e.name]));
  const sName = new Map(stores.map((st) => [st.id, st.name]));
  const sales = q
    ? sales0.filter((x) => x.number.toLowerCase().includes(q) || (cName.get(x.customer_id ?? "") ?? "").toLowerCase().includes(q))
    : sales0;

  const ok = sales.filter((x) => x.status === "concluida");
  const revenue = ok.reduce((a, x) => a + x.total_cents, 0);
  const discounts = ok.reduce((a, x) => a + x.discount_cents, 0);
  const margin = ok.reduce((a, x) => a + x.total_cents - x.cost_cents, 0);
  const sellers = employees.filter((e) => e.permissions.includes("vender") || e.role === "admin");

  return (
    <>
      <PageHeader
        title="Vendas"
        subtitle={ctx.storeId ? sName.get(ctx.storeId) : "Consolidado — todas as lojas"}
        actions={
          <LinkButton href="/vendas/nova">
            <Plus className="size-4" /> Nova venda
          </LinkButton>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Faturamento" value={brl(revenue)} hint={`${ok.length} venda(s) concluída(s)`} icon={<Receipt className="size-4" />} />
        <Stat label="Ticket médio" value={brl(ok.length ? Math.round(revenue / ok.length) : 0)} />
        <Stat label="Descontos concedidos" value={brl(discounts)} tone={discounts > 0 ? "warn" : "default"} />
        <Stat label="Margem bruta" value={brl(margin)} tone="good" hint={revenue ? `${Math.round((margin * 100) / revenue)}% do faturamento` : undefined} />
      </div>

      <Card className="mb-5 p-4">
        <form className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="De">
            <Input type="date" name="de" defaultValue={de} />
          </Field>
          <Field label="Até">
            <Input type="date" name="ate" defaultValue={ate} />
          </Field>
          <Field label="Vendedor">
            <Select name="vendedor" defaultValue={vendedor}>
              <option value="">Todos</option>
              {sellers.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={status}>
              <option value="">Todos</option>
              <option value="concluida">Concluída</option>
              <option value="cancelada">Cancelada</option>
            </Select>
          </Field>
          <Field label="Busca">
            <Input name="q" defaultValue={s("q")} placeholder="Nº ou cliente" />
          </Field>
          <div className="flex items-end gap-2">
            <Button className="flex-1">Filtrar</Button>
            <LinkButton href="/vendas" variant="ghost">
              Limpar
            </LinkButton>
          </div>
        </form>
      </Card>

      <Card>
        <Table head={["Venda", "Data", "Cliente", "Vendedor", ...(ctx.storeId ? [] : ["Loja"]), "Pagamento", "Total", "Status"]} empty="Nenhuma venda no período.">
          {sales.map((x) => (
            <tr key={x.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`/vendas/${x.id}`} className="font-semibold text-brand-700 hover:underline">
                  {x.number}
                </Link>
              </Td>
              <Td className="whitespace-nowrap text-slate-600">{dateTime(x.created_at)}</Td>
              <Td>{x.customer_id ? cName.get(x.customer_id) ?? "—" : <span className="text-slate-500">Consumidor final</span>}</Td>
              <Td>{eName.get(x.seller_id) ?? "—"}</Td>
              {!ctx.storeId && <Td>{sName.get(x.store_id) ?? "—"}</Td>}
              <Td className="text-slate-600">{[...new Set(x.payments.map((p) => label(p.method)))].join(", ")}</Td>
              <Td className="text-right font-semibold whitespace-nowrap">{brl(x.total_cents)}</Td>
              <Td>{x.status === "concluida" ? <Badge tone="green">Concluída</Badge> : <Badge tone="red">Cancelada</Badge>}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
