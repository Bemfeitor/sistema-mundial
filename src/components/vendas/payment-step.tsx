"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Notice, Select, cn } from "@/components/ui";
import { brl, label, toCents } from "@/lib/format";
import { PAYMENT_METHODS, splitInstallments } from "@/lib/vendas/calc";
import type { PaymentLine } from "@/lib/vendas/types";
import type { PaymentMethod } from "@/lib/types";

export interface DiscountState {
  mode: "valor" | "pct";
  text: string;
}

export function PaymentStep(p: {
  subtotal: number;
  discountCents: number;
  discount: DiscountState;
  setDiscount: (d: DiscountState) => void;
  allowedPct: number;
  userLimit: number;
  insurer: { name: string; discount_percent: number } | null;
  hasCustomer: boolean;
  balance: number;
  maxCashback: number;
  payments: PaymentLine[];
  setPayments: (p: PaymentLine[]) => void;
  crediario: { installments: number; firstDue: string };
  setCrediario: (c: { installments: number; firstDue: string }) => void;
  note: string;
  setNote: (s: string) => void;
}) {
  const total = Math.max(0, p.subtotal - p.discountCents);
  const paid = p.payments.reduce((a, x) => a + x.amount_cents, 0);
  const remaining = total - paid;
  const pct = p.subtotal ? (p.discountCents * 100) / p.subtotal : 0;
  const overLimit = p.allowedPct < 100 && pct > p.allowedPct + 0.001;
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [amount, setAmount] = useState("");
  const [inst, setInst] = useState(2);
  const [received, setReceived] = useState("");

  const usedCashback = p.payments.filter((x) => x.method === "cashback").reduce((a, x) => a + x.amount_cents, 0);
  const crediarioTotal = p.payments.filter((x) => x.method === "crediario").reduce((a, x) => a + x.amount_cents, 0);
  const cashPaid = p.payments.filter((x) => x.method === "dinheiro").reduce((a, x) => a + x.amount_cents, 0);

  const needsCustomer = method === "cashback" || method === "crediario";
  const addPayment = () => {
    let value = amount ? toCents(amount) : remaining;
    if (method === "cashback") value = Math.min(value, p.maxCashback - usedCashback);
    value = Math.min(value, remaining);
    if (value <= 0) return;
    p.setPayments([...p.payments, { method, amount_cents: value, installments: method === "credito_parcelado" ? inst : 1 }]);
    setAmount("");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Desconto" subtitle={p.userLimit >= 100 ? "Sem limite de desconto" : `Seu limite: ${p.userLimit}%`} />
          <div className="space-y-3 p-5">
            <div className="flex gap-2">
              <Select className="w-28" value={p.discount.mode} onChange={(e) => p.setDiscount({ mode: e.target.value as DiscountState["mode"], text: "" })}>
                <option value="valor">R$</option>
                <option value="pct">%</option>
              </Select>
              <Input
                inputMode="decimal"
                placeholder={p.discount.mode === "valor" ? "0,00" : "0"}
                value={p.discount.text}
                onChange={(e) => p.setDiscount({ ...p.discount, text: e.target.value })}
              />
            </div>
            {p.insurer && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">
                <span>
                  Convênio <strong>{p.insurer.name}</strong>: {p.insurer.discount_percent}% sugerido
                </span>
                <Button variant="secondary" onClick={() => p.setDiscount({ mode: "pct", text: String(p.insurer!.discount_percent) })}>
                  Aplicar
                </Button>
              </div>
            )}
            {p.discountCents > 0 && (
              <div className="text-sm text-slate-600">
                Desconto de {brl(p.discountCents)} ({pct.toFixed(1).replace(".", ",")}%)
              </div>
            )}
            {overLimit && <Notice tone="red">Desconto acima do permitido ({p.allowedPct}%). Solicite autorização de um gerente.</Notice>}
          </div>
        </Card>
        <Card className="p-5">
          <Field label="Observações da venda">
            <Input value={p.note} onChange={(e) => p.setNote(e.target.value)} placeholder="Opcional" />
          </Field>
        </Card>
      </div>

      <Card>
        <CardHeader title="Pagamento" subtitle="Combine formas até fechar o total" />
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-xs text-slate-500">Total</div>
              <div className="text-lg font-bold">{brl(total)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-xs text-slate-500">Pago</div>
              <div className="text-lg font-bold text-emerald-700">{brl(paid)}</div>
            </div>
            <div className={cn("rounded-lg p-2", remaining === 0 ? "bg-emerald-50" : "bg-amber-50")}>
              <div className="text-xs text-slate-500">Falta</div>
              <div className={cn("text-lg font-bold", remaining === 0 ? "text-emerald-700" : "text-amber-700")}>{brl(remaining)}</div>
            </div>
          </div>

          {p.payments.length > 0 && (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {p.payments.map((x, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    {label(x.method)}
                    {x.method === "credito_parcelado" && x.installments ? ` · ${x.installments}x` : ""}
                    {x.method === "crediario" ? ` · ${p.crediario.installments}x` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <strong>{brl(x.amount_cents)}</strong>
                    <Button variant="ghost" className="px-1.5 text-red-600" onClick={() => p.setPayments(p.payments.filter((_, k) => k !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {remaining > 0 && (
            <div className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3">
              <div className="flex flex-wrap gap-2">
                <Select className="w-48" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m} disabled={(m === "cashback" || m === "crediario") && !p.hasCustomer}>
                      {label(m)}
                    </option>
                  ))}
                </Select>
                <Input className="w-32 flex-1" inputMode="decimal" placeholder={brl(remaining)} value={amount} onChange={(e) => setAmount(e.target.value)} />
                {method === "credito_parcelado" && (
                  <Select className="w-24" value={inst} onChange={(e) => setInst(Number(e.target.value))}>
                    {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                      <option key={n} value={n}>
                        {n}x
                      </option>
                    ))}
                  </Select>
                )}
                <Button onClick={addPayment} disabled={needsCustomer && !p.hasCustomer}>
                  <Plus className="size-4" /> Adicionar
                </Button>
              </div>
              {method === "cashback" && (
                <p className="text-xs text-slate-600">
                  Saldo {brl(p.balance)} · utilizável nesta compra: <strong>{brl(Math.max(0, p.maxCashback - usedCashback))}</strong>
                </p>
              )}
              {needsCustomer && !p.hasCustomer && <p className="text-xs text-red-600">Disponível apenas com cliente identificado.</p>}
            </div>
          )}

          {crediarioTotal > 0 && (
            <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
              <Field label="Parcelas do crediário">
                <Select value={p.crediario.installments} onChange={(e) => p.setCrediario({ ...p.crediario, installments: Number(e.target.value) })}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}x de {brl(splitInstallments(crediarioTotal, n)[n - 1])}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="1º vencimento">
                <Input type="date" value={p.crediario.firstDue} onChange={(e) => p.setCrediario({ ...p.crediario, firstDue: e.target.value })} />
              </Field>
            </div>
          )}

          {cashPaid > 0 && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3 text-sm">
              <Field label="Valor recebido em dinheiro" className="flex-1">
                <Input inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={brl(cashPaid)} />
              </Field>
              <div className="pb-2">
                Troco: <Badge tone="green">{brl(Math.max(0, toCents(received) - cashPaid))}</Badge>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
