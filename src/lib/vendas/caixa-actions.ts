"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { actorOf, change, create } from "@/lib/audit";
import { toCents } from "@/lib/format";
import type { PaymentMethod } from "@/lib/types";
import { PAYMENT_METHODS } from "./calc";
import { openCashSession, saleStoreId } from "./server";
import { expectedCash } from "./caixa";

function back(q: string): never {
  redirect(`/caixa?${q}`);
}

export async function openCashAction(form: FormData) {
  const ctx = await requireUser("caixa");
  const storeId = saleStoreId(ctx);
  if (await openCashSession(storeId)) back("erro=ja_aberto");
  const opening = toCents(form.get("opening"));
  if (opening < 0) back("erro=valor");
  await create(actorOf(ctx.user), "cash_sessions", {
    store_id: storeId,
    opened_by: ctx.user.id,
    opening_cents: opening,
    closed_at: null,
    closed_by: null,
    closing_cents: null,
    expected_cents: null,
    status: "aberto",
  }, "abrir_caixa");
  revalidatePath("/caixa");
  back("ok=aberto");
}

export async function cashMovementAction(form: FormData) {
  const ctx = await requireUser("caixa");
  const storeId = saleStoreId(ctx);
  const session = await openCashSession(storeId);
  if (!session) back("erro=sem_caixa");
  const kind = String(form.get("kind") ?? "");
  if (kind !== "suprimento" && kind !== "sangria") back("erro=tipo");
  const amount = toCents(form.get("amount"));
  if (amount <= 0) back("erro=valor");
  const note = String(form.get("note") ?? "").trim();
  await create(actorOf(ctx.user), "cash_movements", {
    session_id: session!.id,
    store_id: storeId,
    kind: kind as "suprimento" | "sangria",
    method: "dinheiro",
    amount_cents: amount,
    reference: note || null,
    employee_id: ctx.user.id,
  }, kind);
  revalidatePath("/caixa");
  back(`ok=${kind}`);
}

export async function receiveInstallmentAction(form: FormData) {
  const ctx = await requireUser("caixa");
  const storeId = saleStoreId(ctx);
  const session = await openCashSession(storeId);
  if (!session) back("erro=sem_caixa");
  const d = db();
  const r = await d.get("receivables", String(form.get("receivable_id") ?? ""));
  if (!r || r.store_id !== storeId || r.status === "pago" || r.status === "cancelado") back("erro=parcela");
  const open = r!.amount_cents - r!.paid_cents;
  const amount = Math.min(toCents(form.get("amount")) || open, open);
  if (amount <= 0) back("erro=valor");
  const method = String(form.get("method") ?? "dinheiro") as PaymentMethod;
  if (!PAYMENT_METHODS.includes(method) || method === "crediario" || method === "cashback") back("erro=forma");
  const actor = actorOf(ctx.user);
  const paid = r!.paid_cents + amount;
  await change(actor, "receivables", r!.id, { paid_cents: paid, status: paid >= r!.amount_cents ? "pago" : r!.status }, "receber");
  await create(actor, "cash_movements", {
    session_id: session!.id,
    store_id: storeId,
    kind: "recebimento",
    method,
    amount_cents: amount,
    reference: r!.description,
    employee_id: ctx.user.id,
  }, "recebimento");
  revalidatePath("/caixa");
  back("ok=recebido");
}

export async function closeCashAction(form: FormData) {
  const ctx = await requireUser("caixa");
  const storeId = saleStoreId(ctx);
  const session = await openCashSession(storeId);
  if (!session) back("erro=sem_caixa");
  const counted = toCents(form.get("counted"));
  if (counted < 0) back("erro=valor");
  const moves = await db().list("cash_movements", { eq: { session_id: session!.id } });
  const expected = expectedCash(session!.opening_cents, moves);
  await change(actorOf(ctx.user), "cash_sessions", session!.id, {
    status: "fechado",
    closed_at: new Date().toISOString(),
    closed_by: ctx.user.id,
    closing_cents: counted,
    expected_cents: expected,
  }, "fechar_caixa");
  revalidatePath("/caixa");
  back(`ok=fechado&dif=${counted - expected}`);
}
