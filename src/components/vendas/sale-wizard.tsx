"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, FlaskConical, MessageCircle, Printer, ShoppingCart } from "lucide-react";
import { Button, Card, LinkButton, Notice, cn } from "@/components/ui";
import { brl, date, todayYmd, toCents } from "@/lib/format";
import { addMonths, lensWarnings } from "@/lib/vendas/calc";
import { finalizeSaleAction, maxRedeemableAction } from "@/lib/vendas/actions";
import type { CartLineView, CheckoutResult, CustomerContext, PaymentLine, WizardInit } from "@/lib/vendas/types";
import { CustomerCard, CustomerStep } from "./customer-step";
import { RxStep } from "./rx-step";
import { ProductsStep } from "./products-step";
import { PaymentStep, type DiscountState } from "./payment-step";

const STEPS = ["Cliente", "Receita", "Produtos", "Pagamento", "Conclusão"];

export function SaleWizard({ init }: { init: WizardInit }) {
  const [step, setStep] = useState(0);
  const [customer, setCustomer] = useState<CustomerContext | null>(init.initialCustomer);
  const [finalConsumer, setFinalConsumer] = useState(false);
  const [rxId, setRxId] = useState<string | null>(null);
  const [rxSkipped, setRxSkipped] = useState(false);
  const [cart, setCart] = useState<CartLineView[]>(
    () => init.quote?.items.map((i) => ({ product_id: i.product_id, qty: i.qty, price_cents: i.price_cents, role: i.role ?? "principal" })) ?? [],
  );
  const [discount, setDiscount] = useState<DiscountState>({ mode: "valor", text: "" });
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [crediario, setCrediario] = useState({ installments: 3, firstDue: addMonths(todayYmd(), 1) });
  const [note, setNote] = useState("");
  const [maxCashback, setMaxCashback] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<CheckoutResult, { ok: true }> | null>(null);
  const [pending, start] = useTransition();

  const byId = useMemo(() => new Map(init.catalog.map((p) => [p.id, p])), [init.catalog]);
  const rx = customer?.prescriptions.find((p) => p.id === rxId) ?? null;
  const subtotal = cart.reduce((a, l) => a + l.qty * l.price_cents, 0);
  const rawDiscount = discount.mode === "valor" ? toCents(discount.text) : Math.round((subtotal * (Number(discount.text.replace(",", ".")) || 0)) / 100);
  const discountCents = Math.min(Math.max(0, rawDiscount), subtotal);
  const total = subtotal - discountCents;
  const insurerPct = customer?.insurer?.discount_percent ?? 0;
  const allowedPct = init.discountLimit >= 100 ? 100 : Math.max(init.discountLimit, insurerPct);
  const discountPct = subtotal ? (discountCents * 100) / subtotal : 0;
  const paid = payments.reduce((a, p) => a + p.amount_cents, 0);

  const warnings = useMemo(
    () =>
      cart.flatMap((l) => {
        const p = byId.get(l.product_id);
        return p?.category === "lente" ? lensWarnings(p, rx) : [];
      }),
    [cart, byId, rx],
  );

  // Pagamentos são refeitos quando o total muda
  useEffect(() => {
    setPayments([]);
  }, [total]);

  useEffect(() => {
    if (step !== 3 || !customer || total <= 0) return;
    let alive = true;
    maxRedeemableAction(customer.customer.id, total).then((v) => alive && setMaxCashback(v));
    return () => {
      alive = false;
    };
  }, [step, customer, total]);

  const canNext = [
    Boolean(customer) || finalConsumer,
    Boolean(rxId) || rxSkipped,
    cart.length > 0,
    paid === total && total >= 0 && !(allowedPct < 100 && discountPct > allowedPct + 0.001),
  ][step];

  const selectCustomer = (c: CustomerContext | null) => {
    setCustomer(c);
    setRxId(null);
    setRxSkipped(false);
    if (c) setFinalConsumer(false);
  };

  const finish = () =>
    start(async () => {
      setError(null);
      const r = await finalizeSaleAction({
        customerId: customer?.customer.id ?? null,
        prescriptionId: rxId,
        quoteId: init.quote?.id ?? null,
        items: cart.map(({ product_id, qty, role }) => ({ product_id, qty, role })),
        discountCents,
        payments,
        crediario: payments.some((p) => p.method === "crediario") ? crediario : null,
        note: note || null,
      });
      if (!r.ok) return setError(r.error);
      setResult(r);
      setStep(4);
    });

  return (
    <div className="space-y-5">
      {init.consolidated && <Notice tone="amber">Você está no modo consolidado — a venda será registrada na sua loja ({init.storeName}).</Notice>}
      {init.quote && !result && (
        <Notice>
          Venda a partir de orçamento{init.quote.customerName ? ` de ${init.quote.customerName}` : ""}: itens pré-carregados. Ao concluir, o orçamento será marcado como convertido.
        </Notice>
      )}

      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              disabled={result != null || i > step}
              onClick={() => setStep(i)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium",
                i === step ? "border-brand-600 bg-brand-600 text-white" : i < step ? "border-brand-100 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-400",
              )}
            >
              <span className={cn("grid size-5 place-items-center rounded-full text-xs", i === step ? "bg-white/20" : "bg-white")}>
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      {step > 0 && step < 4 && customer && <CustomerCard ctx={customer} />}

      {step === 0 && (
        <CustomerStep
          value={customer}
          finalConsumer={finalConsumer}
          onSelect={selectCustomer}
          onFinalConsumer={() => {
            selectCustomer(null);
            setFinalConsumer(true);
          }}
        />
      )}
      {step === 1 && (
        <RxStep
          customer={customer}
          selectedId={rxId}
          skipped={rxSkipped}
          onSelect={(id) => {
            setRxId(id);
            if (id) setRxSkipped(false);
          }}
          onSkip={() => {
            setRxId(null);
            setRxSkipped(true);
          }}
          onCustomerUpdate={setCustomer}
        />
      )}
      {step === 2 && <ProductsStep catalog={init.catalog} cart={cart} onChange={setCart} warnings={warnings} />}
      {step === 3 && (
        <PaymentStep
          subtotal={subtotal}
          discountCents={discountCents}
          discount={discount}
          setDiscount={setDiscount}
          allowedPct={allowedPct}
          userLimit={init.discountLimit}
          insurer={customer?.insurer ?? null}
          hasCustomer={Boolean(customer)}
          balance={customer?.balance_cents ?? 0}
          maxCashback={maxCashback}
          payments={payments}
          setPayments={setPayments}
          crediario={crediario}
          setCrediario={setCrediario}
          note={note}
          setNote={setNote}
        />
      )}
      {step === 4 && result && <Conclusion result={result} customer={customer} />}

      {error && <Notice tone="red">{error}</Notice>}
      {step === 3 && warnings.length > 0 && (
        <Notice tone="amber">Há {warnings.length} alerta(s) de lente × receita. Confira na etapa Produtos antes de concluir.</Notice>
      )}

      {step < 4 && (
        <Card className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="text-sm text-slate-600">
            Subtotal <strong>{brl(subtotal)}</strong>
            {discountCents > 0 && <> · Desconto <strong>−{brl(discountCents)}</strong></>} · Total <strong className="text-slate-900">{brl(total)}</strong>
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="secondary" onClick={() => setStep(step - 1)} disabled={pending}>
                <ArrowLeft className="size-4" /> Voltar
              </Button>
            )}
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
                Avançar <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button variant="success" onClick={finish} disabled={!canNext || pending}>
                <ShoppingCart className="size-4" /> {pending ? "Concluindo…" : "Concluir venda"}
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function Conclusion({ result, customer }: { result: Extract<CheckoutResult, { ok: true }>; customer: CustomerContext | null }) {
  return (
    <div className="space-y-4">
      <Card className="p-6 text-center">
        <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
        <h2 className="mt-2 text-xl font-bold text-slate-900">Venda {result.number} concluída</h2>
        <p className="mt-1 text-slate-600">
          Total {brl(result.total_cents)}
          {customer ? ` · ${customer.customer.name}` : " · Consumidor final"}
        </p>
        {result.cashback_cents > 0 && <p className="mt-2 font-medium text-emerald-700">Cliente ganhou {brl(result.cashback_cents)} de cashback.</p>}
        {result.labOrder && (
          <p className="mt-2 flex items-center justify-center gap-2 text-sm text-slate-700">
            <FlaskConical className="size-4 text-brand-600" />
            OS{" "}
            <Link className="font-semibold text-brand-700 underline" href={`/os/${result.labOrder.id}`}>
              {result.labOrder.number}
            </Link>{" "}
            gerada · previsão {date(result.labOrder.due_at)}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <LinkButton href={`/vendas/${result.saleId}?imprimir=1`} variant="secondary">
            <Printer className="size-4" /> Imprimir comprovante
          </LinkButton>
          {result.whatsapp && (
            <a
              href={result.whatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <MessageCircle className="size-4" /> Agradecer no WhatsApp
            </a>
          )}
          <a
            href="/vendas/nova"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <ShoppingCart className="size-4" /> Nova venda
          </a>
        </div>
      </Card>
      {result.warnings.length > 0 && (
        <Notice tone="amber">
          <div className="mb-1 font-semibold">Avisos</div>
          <ul className="list-disc pl-5">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}
    </div>
  );
}
