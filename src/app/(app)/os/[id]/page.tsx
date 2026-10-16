import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { Badge, Card, CardHeader, LinkButton, Notice, PageHeader } from "@/components/ui";
import { AdvanceForm } from "@/components/os/advance-form";
import { PrintButton } from "@/components/vendas/print-button";
import { RxTable } from "@/components/vendas/rx-table";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { date, dateTime, label, todayYmd } from "@/lib/format";
import { FINAL_STATUSES, READY_CHECKLIST, STATUS_TONE, isLate, nextStatus } from "@/lib/vendas/os";

export const metadata = { title: "Ordem de serviço" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function OsDetailPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-slate-100" />}>
      <OsDetail {...props} />
    </Suspense>
  );
}

const ERR: Record<string, string> = {
  checklist: "Para marcar como pronto, confirme todos os itens do checklist.",
  observacao: "Informe uma observação para registrar a exceção.",
  status: "Etapa inválida.",
  loja: "Esta OS pertence a outra loja.",
};

async function OsDetail({ params, searchParams }: Props) {
  const ctx = await requireUser("os");
  const { id } = await params;
  const sp = await searchParams;
  const d = db();
  const os = await d.get("lab_orders", id);
  if (!os) notFound();
  if (!ctx.can("consolidado") && os.store_id !== ctx.user.store_id) notFound();

  const [sale, customer, supplier, store, employees] = await Promise.all([
    d.get("sales", os.sale_id),
    os.customer_id ? d.get("customers", os.customer_id) : Promise.resolve(null),
    os.supplier_id ? d.get("suppliers", os.supplier_id) : Promise.resolve(null),
    d.get("stores", os.store_id),
    d.list("employees", { eq: { active: true } }),
  ]);
  const rx = sale?.prescription_id ? await d.get("prescriptions", sale.prescription_id) : null;
  const team = employees.filter((e) => e.role === "admin" || e.permissions.includes("os")).map((e) => ({ id: e.id, name: e.name }));
  const responsible = employees.find((e) => e.id === os.responsible_id);
  const late = isLate(os, todayYmd());
  const erro = typeof sp.erro === "string" ? ERR[sp.erro] : null;
  const frame = sale?.items.find((i) => i.category === "armacao");
  const lenses = sale?.items.filter((i) => i.category === "lente") ?? [];

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={`OS ${os.number}`}
          subtitle={`Criada em ${dateTime(os.created_at)} · ${store?.name ?? ""}`}
          actions={
            <>
              <LinkButton href="/os" variant="ghost">
                <ArrowLeft className="size-4" /> Ordens de serviço
              </LinkButton>
              <PrintButton label="Imprimir ficha" />
            </>
          }
        />
        {sp.ok && <div className="mb-4"><Notice tone="green">Etapa registrada.</Notice></div>}
        {erro && <div className="mb-4"><Notice tone="red">{erro}</Notice></div>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3 print:block">
        {/* Ficha (imprimível) */}
        <div className="space-y-4 lg:col-span-2 print:space-y-3">
          <Card className="print:border-slate-400 print:shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <div className="hidden text-xs font-bold tracking-[0.2em] print:block">ÓTICA MUNDIAL · FICHA DE LABORATÓRIO</div>
                <h2 className="text-xl font-bold text-slate-900">OS {os.number}</h2>
                <div className="text-sm text-slate-500">
                  Venda{" "}
                  {sale ? (
                    <Link href={`/vendas/${sale.id}`} className="text-brand-700 hover:underline">
                      {sale.number}
                    </Link>
                  ) : (
                    "—"
                  )}{" "}
                  · {store?.name}
                </div>
              </div>
              <div className="text-right">
                <Badge tone={STATUS_TONE[os.status]} className="text-sm">
                  {label(os.status)}
                </Badge>
                <div className={`mt-1 text-sm ${late ? "font-semibold text-red-600" : "text-slate-600"}`}>
                  Prazo: {date(os.due_at)}
                  {late ? " (atrasada)" : ""}
                </div>
              </div>
            </div>
            <div className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase">Cliente</div>
                <div className="font-medium">{customer?.name ?? "Consumidor final"}</div>
                {customer?.phone && <div className="text-slate-600">{customer.phone}</div>}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase">Laboratório</div>
                <div className="font-medium">{supplier?.name ?? "Não definido"}</div>
                {supplier?.phone && <div className="text-slate-600">{supplier.phone}</div>}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase">Lente(s)</div>
                {lenses.length ? lenses.map((l, k) => <div key={k}>{l.name}</div>) : <div>{os.description}</div>}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase">Armação</div>
                <div>{frame?.name ?? "Do cliente / não informada"}</div>
              </div>
            </div>
            <div className="border-t border-slate-100 px-5 py-4">
              <div className="mb-2 text-xs font-semibold text-slate-500 uppercase">
                Receita {rx ? `· exame ${date(rx.exam_date)}${rx.professional ? ` · ${rx.professional}` : ""}` : ""}
              </div>
              {rx ? <RxTable od={rx.od} oe={rx.oe} compact={false} /> : <p className="text-sm text-slate-500">Venda sem receita vinculada.</p>}
              {rx?.notes && <p className="mt-2 text-sm text-slate-600">{rx.notes}</p>}
            </div>
            <div className="border-t border-slate-100 px-5 py-4">
              <div className="mb-2 text-xs font-semibold text-slate-500 uppercase">Conferência</div>
              <div className="grid gap-1 text-sm sm:grid-cols-3">
                {READY_CHECKLIST.map((c) => (
                  <div key={c.key} className="flex items-center gap-2">
                    {os.checklist?.[c.key] ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4 text-slate-300" />}
                    {c.label}
                  </div>
                ))}
              </div>
            </div>
            <div className="hidden border-t border-slate-300 px-5 py-6 text-xs print:grid print:grid-cols-2 print:gap-8">
              <div className="border-t border-slate-400 pt-1">Enviado por</div>
              <div className="border-t border-slate-400 pt-1">Recebido pelo laboratório</div>
            </div>
          </Card>

          <Card className="no-print">
            <CardHeader title="Histórico" />
            <ol className="space-y-3 px-5 py-4">
              {[...(os.history ?? [])].reverse().map((h, k) => (
                <li key={k} className="flex gap-3 text-sm">
                  <div className="mt-1 size-2 shrink-0 rounded-full bg-brand-500" />
                  <div>
                    <div>
                      <Badge tone={STATUS_TONE[h.status]}>{label(h.status)}</Badge>
                      <span className="ml-2 text-slate-500">{dateTime(h.at)}</span>
                      {h.by && <span className="ml-2 text-slate-600">· {h.by}</span>}
                    </div>
                    {h.note && <p className="mt-0.5 text-slate-700">{h.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="no-print space-y-4">
          <Card>
            <CardHeader title="Avançar etapa" subtitle={responsible ? `Responsável atual: ${responsible.name}` : "Sem responsável definido"} />
            <div className="p-5">
              {FINAL_STATUSES.includes(os.status) ? (
                <Notice tone={os.status === "entregue" ? "green" : "amber"}>OS {label(os.status).toLowerCase()} — nenhuma ação pendente.</Notice>
              ) : (
                <AdvanceForm
                  id={os.id}
                  current={os.status}
                  suggested={nextStatus(os.status)}
                  responsibleId={os.responsible_id ?? null}
                  team={team}
                  checklist={os.checklist ?? {}}
                />
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
