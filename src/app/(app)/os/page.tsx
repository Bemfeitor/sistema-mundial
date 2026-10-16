import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Columns3, List, Wrench } from "lucide-react";
import { Badge, Button, Card, Input, LinkButton, PageHeader, Select, Stat, Table, Td, cn } from "@/components/ui";
import { db } from "@/lib/db";
import { requireUser, storeFilter } from "@/lib/session";
import { date, label, todayYmd } from "@/lib/format";
import { LAB_EXCEPTIONS, LAB_STATUSES, type LabOrder } from "@/lib/types";
import { STATUS_TONE, isLate } from "@/lib/vendas/os";

export const metadata = { title: "Óculos / laboratório" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function OsPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-slate-100" />}>
      <OsList {...props} />
    </Suspense>
  );
}

const READY = ["pronto", "cliente_avisado"];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function OsList({ searchParams }: Props) {
  const ctx = await requireUser("os");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const view = s("view") === "lista" ? "lista" : "kanban";
  const f = s("f") || "abertas";
  const q = s("q").trim();
  const today = todayYmd();

  const d = db();
  const [all, suppliers] = await Promise.all([d.list("lab_orders", { eq: storeFilter(ctx), limit: 2000 }), d.list("suppliers")]);
  const custIds = [...new Set(all.map((o) => o.customer_id).filter(Boolean))] as string[];
  const saleIds = [...new Set(all.map((o) => o.sale_id))];
  const [customers, sales] = await Promise.all([
    custIds.length ? d.list("customers", { in: { column: "id", values: custIds } }) : Promise.resolve([]),
    saleIds.length ? d.list("sales", { in: { column: "id", values: saleIds } }) : Promise.resolve([]),
  ]);
  const cName = new Map(customers.map((c) => [c.id, c.name]));
  const sNum = new Map(sales.map((x) => [x.id, x.number]));
  const supName = new Map(suppliers.map((x) => [x.id, x.name]));

  const open = all.filter((o) => o.status !== "entregue" && o.status !== "cancelado");
  const late = open.filter((o) => isLate(o, today));
  const ready = open.filter((o) => READY.includes(o.status));

  let rows: LabOrder[] =
    f === "atrasados" ? late : f === "prontos" ? ready : f === "todas" ? all : open;
  if (q) {
    const t = norm(q);
    rows = rows.filter((o) =>
      norm(`${o.number} ${cName.get(o.customer_id ?? "") ?? ""} ${sNum.get(o.sale_id) ?? ""} ${o.description}`).includes(t),
    );
  }
  rows.sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));

  const columns = (f === "todas" ? [...LAB_STATUSES] : LAB_STATUSES.filter((x) => x !== "entregue")) as string[];
  const exceptions = rows.filter((o) => (LAB_EXCEPTIONS as readonly string[]).includes(o.status) && (f === "todas" || o.status !== "cancelado"));
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ view, f, ...(q ? { q } : {}), ...patch });
    return `/os?${p.toString()}`;
  };

  const OsCard = ({ o }: { o: LabOrder }) => {
    const lateNow = isLate(o, today);
    return (
      <Link href={`/os/${o.id}`} className={cn("block rounded-lg border bg-white p-3 text-sm shadow-sm hover:border-brand-500", lateNow ? "border-red-300" : "border-slate-200")}>
        <div className="flex items-center justify-between gap-2">
          <strong className="text-slate-900">{o.number}</strong>
          <span className={cn("text-xs", lateNow ? "font-semibold text-red-600" : "text-slate-500")}>{date(o.due_at)}</span>
        </div>
        <div className="mt-1 truncate text-slate-700">{cName.get(o.customer_id ?? "") ?? "Consumidor final"}</div>
        <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{o.description}</div>
        {lateNow && <Badge tone="red" className="mt-1.5">Atrasada</Badge>}
        {(LAB_EXCEPTIONS as readonly string[]).includes(o.status) && <Badge tone={STATUS_TONE[o.status]} className="mt-1.5">{label(o.status)}</Badge>}
      </Link>
    );
  };

  return (
    <>
      <PageHeader title="Óculos / laboratório" subtitle="Ordens de serviço por etapa, ordenadas por prazo" />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Em aberto" value={open.length} icon={<Wrench className="size-4" />} />
        <Stat label="Atrasadas" value={late.length} tone={late.length ? "bad" : "good"} icon={<AlertTriangle className="size-4" />} />
        <Stat label="Prontas para entrega" value={ready.length} tone="good" icon={<CheckCircle2 className="size-4" />} />
      </div>

      <Card className="mb-5 flex flex-wrap items-end gap-3 p-4">
        <form className="flex flex-1 flex-wrap items-end gap-2">
          <input type="hidden" name="view" value={view} />
          <Input name="q" defaultValue={q} placeholder="Buscar OS, cliente ou venda" className="max-w-xs" />
          <Select name="f" defaultValue={f} className="w-48">
            <option value="abertas">Em aberto</option>
            <option value="atrasados">Atrasadas</option>
            <option value="prontos">Prontas</option>
            <option value="todas">Todas (inclui entregues)</option>
          </Select>
          <Button>Filtrar</Button>
        </form>
        <div className="flex gap-1">
          <LinkButton href={qs({ view: "kanban" })} variant={view === "kanban" ? "primary" : "secondary"}>
            <Columns3 className="size-4" /> Kanban
          </LinkButton>
          <LinkButton href={qs({ view: "lista" })} variant={view === "lista" ? "primary" : "secondary"}>
            <List className="size-4" /> Lista
          </LinkButton>
        </div>
      </Card>

      {view === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {columns.map((col) => {
            const items = rows.filter((o) => o.status === col);
            return (
              <div key={col} className="w-64 shrink-0 rounded-xl bg-slate-100/70 p-2">
                <div className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-slate-700">
                  {label(col)}
                  <Badge tone={STATUS_TONE[col as LabOrder["status"]]}>{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.map((o) => (
                    <OsCard key={o.id} o={o} />
                  ))}
                </div>
              </div>
            );
          })}
          <div className="w-64 shrink-0 rounded-xl bg-red-50/70 p-2">
            <div className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-red-800">
              Exceções
              <Badge tone="red">{exceptions.length}</Badge>
            </div>
            <div className="space-y-2">
              {exceptions.map((o) => (
                <OsCard key={o.id} o={o} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <Card>
          <Table head={["OS", "Cliente", "Venda", "Laboratório", "Descrição", "Prazo", "Etapa"]} empty="Nenhuma OS encontrada.">
            {rows.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/os/${o.id}`} className="font-semibold text-brand-700 hover:underline">
                    {o.number}
                  </Link>
                </Td>
                <Td>{cName.get(o.customer_id ?? "") ?? "Consumidor final"}</Td>
                <Td>
                  <Link href={`/vendas/${o.sale_id}`} className="text-slate-600 hover:underline">
                    {sNum.get(o.sale_id) ?? "—"}
                  </Link>
                </Td>
                <Td className="text-slate-600">{supName.get(o.supplier_id ?? "") ?? "—"}</Td>
                <Td className="max-w-xs truncate text-slate-600">{o.description}</Td>
                <Td className={cn("whitespace-nowrap", isLate(o, today) && "font-semibold text-red-600")}>{date(o.due_at)}</Td>
                <Td>
                  <Badge tone={STATUS_TONE[o.status]}>{label(o.status)}</Badge>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
