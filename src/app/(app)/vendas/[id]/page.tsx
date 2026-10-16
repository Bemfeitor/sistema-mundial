import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, FlaskConical, Gift } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, LinkButton, Notice, PageHeader, Table, Td } from "@/components/ui";
import { PrintButton } from "@/components/vendas/print-button";
import { RxTable } from "@/components/vendas/rx-table";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { brl, date, dateTime, label } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/vendas/calc";
import { STATUS_TONE } from "@/lib/vendas/os";
import { canCancelSale } from "@/lib/vendas/server";
import { cancelSaleAction } from "@/lib/vendas/actions";

export const metadata = { title: "Venda" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function VendaPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-slate-100" />}>
      <Venda {...props} />
    </Suspense>
  );
}

const ERR: Record<string, string> = {
  permissao: "Somente gerente ou administrador pode cancelar vendas.",
  motivo: "Informe o motivo do cancelamento.",
  loja: "Esta venda pertence a outra loja.",
};

async function Venda({ params, searchParams }: Props) {
  const ctx = await requireUser("vender");
  const { id } = await params;
  const sp = await searchParams;
  const d = db();
  const sale = await d.get("sales", id);
  if (!sale) notFound();
  if (!ctx.can("consolidado") && sale.store_id !== ctx.user.store_id) notFound();

  const [customer, seller, store, rx, labOrders, receivables, benefits] = await Promise.all([
    sale.customer_id ? d.get("customers", sale.customer_id) : Promise.resolve(null),
    d.get("employees", sale.seller_id),
    d.get("stores", sale.store_id),
    sale.prescription_id ? d.get("prescriptions", sale.prescription_id) : Promise.resolve(null),
    d.list("lab_orders", { eq: { sale_id: sale.id } }),
    d.list("receivables", { eq: { sale_id: sale.id }, order: { column: "due_at" } }),
    d.list("benefits", { eq: { sale_id: sale.id } }),
  ]);
  const cancelled = sale.status === "cancelada";
  const erro = typeof sp.erro === "string" ? ERR[sp.erro] : null;

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={`Venda ${sale.number}`}
          subtitle={`${dateTime(sale.created_at)} · ${store?.name ?? ""}`}
          actions={
            <>
              <LinkButton href="/vendas" variant="ghost">
                <ArrowLeft className="size-4" /> Vendas
              </LinkButton>
              <PrintButton auto={sp.imprimir === "1"} label="Imprimir comprovante" />
            </>
          }
        />
        {sp.ok === "cancelada" && <div className="mb-4"><Notice tone="green">Venda cancelada. Estoque estornado e lançamentos ajustados.</Notice></div>}
        {erro && <div className="mb-4"><Notice tone="red">{erro}</Notice></div>}
      </div>

      {/* Cabeçalho do comprovante (só na impressão) */}
      <div className="mb-4 hidden border-b border-slate-300 pb-3 print:block">
        <div className="text-lg font-bold tracking-[0.2em]">ÓTICA MUNDIAL</div>
        <div className="text-xs text-slate-600">
          {store?.name}
          {store?.address ? ` · ${store.address}` : ""}
          {store?.phone ? ` · ${store.phone}` : ""}
          {store?.cnpj ? ` · CNPJ ${store.cnpj}` : ""}
        </div>
        <div className="mt-2 text-sm">
          Comprovante de venda <strong>{sale.number}</strong> · {dateTime(sale.created_at)}
        </div>
      </div>

      {cancelled && <div className="mb-4"><Notice tone="red">Venda cancelada. {sale.note}</Notice></div>}

      <div className="grid gap-4 lg:grid-cols-3 print:block">
        <div className="space-y-4 lg:col-span-2 print:space-y-3">
          <Card>
            <CardHeader title="Itens" subtitle={`Vendedor: ${seller?.name ?? "—"}`} />
            <Table head={["Produto", "Papel", "Qtd", "Unitário", "Total"]}>
              {sale.items.map((i, k) => (
                <tr key={k}>
                  <Td>
                    <div className="font-medium">{i.name}</div>
                    <div className="text-xs text-slate-500">{label(i.category)}</div>
                  </Td>
                  <Td className="text-slate-600">{ROLE_LABEL[i.role ?? "principal"]}</Td>
                  <Td>{i.qty}</Td>
                  <Td className="whitespace-nowrap">{brl(i.price_cents)}</Td>
                  <Td className="text-right font-semibold whitespace-nowrap">{brl(i.qty * i.price_cents)}</Td>
                </tr>
              ))}
            </Table>
            <div className="space-y-1 border-t border-slate-100 px-5 py-3 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{brl(sale.subtotal_cents)}</span>
              </div>
              {sale.discount_cents > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>Desconto</span>
                  <span>−{brl(sale.discount_cents)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>{brl(sale.total_cents)}</span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Pagamentos" />
            <div className="divide-y divide-slate-100 text-sm">
              {sale.payments.map((p, k) => (
                <div key={k} className="flex justify-between px-5 py-2.5">
                  <span>
                    {label(p.method)}
                    {p.installments && p.installments > 1 ? ` · ${p.installments}x` : ""}
                    {p.brand ? ` · ${p.brand}` : ""}
                  </span>
                  <strong>{brl(p.amount_cents)}</strong>
                </div>
              ))}
            </div>
            {receivables.length > 0 && (
              <div className="border-t border-slate-100 px-5 py-3">
                <div className="mb-2 text-xs font-semibold text-slate-500 uppercase">Parcelas do crediário</div>
                <div className="grid gap-1 text-sm sm:grid-cols-2">
                  {receivables.map((r) => (
                    <div key={r.id} className="flex justify-between gap-2">
                      <span>
                        {r.description.split(" ").pop()} · {date(r.due_at)}
                      </span>
                      <span>
                        {brl(r.amount_cents)} <Badge tone={r.status === "pago" ? "green" : r.status === "vencido" ? "red" : "slate"}>{label(r.status)}</Badge>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {rx && (
            <Card>
              <CardHeader title="Receita" subtitle={`Exame de ${date(rx.exam_date)}${rx.professional ? ` · ${rx.professional}` : ""}`} />
              <div className="p-4">
                <RxTable od={rx.od} oe={rx.oe} compact={false} />
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4 print:mt-3 print:space-y-3">
          <Card>
            <CardHeader title="Cliente" />
            <div className="space-y-1 px-5 py-4 text-sm">
              {customer ? (
                <>
                  <div className="font-semibold">{customer.name}</div>
                  <div className="text-slate-600">{[customer.phone, customer.cpf ? `CPF ${customer.cpf}` : null].filter(Boolean).join(" · ")}</div>
                  <div className="text-slate-500">Nível {customer.level}</div>
                </>
              ) : (
                <div className="text-slate-500">Consumidor final</div>
              )}
              <div className="pt-2 text-slate-600">Garantia até {date(sale.warranty_until)}</div>
            </div>
          </Card>

          {(sale.cashback_cents > 0 || benefits.length > 0) && (
            <Card className="p-5">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Gift className="size-4 text-emerald-600" /> Cashback ganho
              </div>
              <div className="mt-1 text-2xl font-bold text-emerald-700">{brl(sale.cashback_cents)}</div>
              {benefits[0] && (
                <div className="mt-1 text-xs text-slate-500">
                  Disponível de {date(benefits[0].available_at)} até {date(benefits[0].expires_at)}
                </div>
              )}
            </Card>
          )}

          {labOrders.length > 0 && (
            <Card className="no-print">
              <CardHeader title="Óculos / laboratório" />
              <div className="divide-y divide-slate-100 text-sm">
                {labOrders.map((o) => (
                  <Link key={o.id} href={`/os/${o.id}`} className="flex items-center justify-between gap-2 px-5 py-3 hover:bg-slate-50">
                    <span className="flex items-center gap-2">
                      <FlaskConical className="size-4 text-brand-600" />
                      <strong>{o.number}</strong> · prazo {date(o.due_at)}
                    </span>
                    <Badge tone={STATUS_TONE[o.status]}>{label(o.status)}</Badge>
                  </Link>
                ))}
              </div>
            </Card>
          )}
          {labOrders.length > 0 && (
            <div className="hidden text-sm print:block">
              OS {labOrders.map((o) => o.number).join(", ")} · previsão de entrega {date(labOrders[0].due_at)}
            </div>
          )}

          {!cancelled && canCancelSale(ctx) && (
            <Card className="no-print">
              <CardHeader title="Cancelar venda" subtitle="Estorna estoque, cashback, crediário e caixa" />
              <form action={cancelSaleAction} className="space-y-3 p-5">
                <input type="hidden" name="id" value={sale.id} />
                <Field label="Motivo">
                  <Input name="reason" required placeholder="Ex.: desistência do cliente" />
                </Field>
                <Button variant="danger" className="w-full">
                  <Ban className="size-4" /> Cancelar venda
                </Button>
              </form>
            </Card>
          )}
        </div>
      </div>

      <div className="mt-8 hidden text-center text-xs text-slate-500 print:block">
        Obrigado pela preferência! Garantia de 12 meses contra defeitos de fabricação mediante este comprovante.
        <div className="mt-10 border-t border-slate-400 pt-1">Assinatura do cliente</div>
      </div>
    </>
  );
}
