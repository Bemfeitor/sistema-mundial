// Cálculos do caixa (sem dependências de servidor).
import type { CashMovement, PaymentMethod } from "@/lib/types";

export const OUT_KINDS: CashMovement["kind"][] = ["sangria", "pagamento"];

export const signed = (m: Pick<CashMovement, "kind" | "amount_cents">) => (OUT_KINDS.includes(m.kind) ? -m.amount_cents : m.amount_cents);

/** Dinheiro esperado na gaveta: abertura + entradas em dinheiro − saídas em dinheiro. */
export const expectedCash = (opening: number, moves: Pick<CashMovement, "kind" | "amount_cents" | "method">[]) =>
  opening + moves.filter((m) => m.method === "dinheiro").reduce((a, m) => a + signed(m), 0);

export function totalsByMethod(moves: Pick<CashMovement, "kind" | "amount_cents" | "method">[]) {
  const map = new Map<PaymentMethod, number>();
  for (const m of moves) map.set(m.method, (map.get(m.method) ?? 0) + signed(m));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export const KIND_LABEL: Record<CashMovement["kind"], string> = {
  venda: "Venda",
  suprimento: "Suprimento",
  sangria: "Sangria",
  recebimento: "Recebimento de crediário",
  pagamento: "Saída / estorno",
};
