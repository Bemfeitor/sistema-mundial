"use server";
import { db } from "@/lib/db";
import { change, create } from "@/lib/audit";
import { toCents } from "@/lib/format";
import { canAccessStore, writeStoreId } from "@/lib/session";
import { actionCtx, done, optStr, str } from "@/lib/gestao/server";

const safeBack = (f: FormData, d: string) => {
  const b = str(f, "back");
  return b.startsWith("/financeiro") ? b : d;
};

export async function baixarTitulo(f: FormData) {
  const { ctx, actor } = await actionCtx("financeiro");
  const table = str(f, "table") === "payables" ? "payables" : "receivables";
  const back = safeBack(f, `/financeiro?aba=${table === "payables" ? "pagar" : "receber"}`);
  const t = await db().get(table, str(f, "id"));
  if (!t || !canAccessStore(ctx, t.store_id)) done(back, { erro: "Título não encontrado." });
  if (t.status === "cancelado" || t.status === "pago") done(back, { erro: "Título já liquidado ou cancelado." });
  const remaining = t.amount_cents - t.paid_cents;
  const amount = str(f, "amount") ? Math.min(remaining, toCents(str(f, "amount"))) : remaining;
  if (amount <= 0) done(back, { erro: "Valor inválido." });
  const paid = t.paid_cents + amount;
  await change(actor, table, t.id, { paid_cents: paid, status: paid >= t.amount_cents ? "pago" : t.status }, paid >= t.amount_cents ? "baixa total" : "baixa parcial");
  done(back, { ok: paid >= t.amount_cents ? "Título liquidado." : `Baixa parcial registrada. Restam ${((t.amount_cents - paid) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.` });
}

export async function cancelarTitulo(f: FormData) {
  const { ctx, actor } = await actionCtx("financeiro");
  const table = str(f, "table") === "payables" ? "payables" : "receivables";
  const back = safeBack(f, "/financeiro");
  const id = str(f, "id");
  const t = await db().get(table, id);
  if (!t || !canAccessStore(ctx, t.store_id)) done(back, { erro: "Título não encontrado." });
  await change(actor, table, id, { status: "cancelado" }, "cancelar título");
  done(back, { ok: "Título cancelado." });
}

export async function salvarPagar(f: FormData) {
  const { ctx, actor } = await actionCtx("financeiro");
  const back = "/financeiro?aba=pagar";
  const id = str(f, "id");
  const description = str(f, "description"), due_at = str(f, "due_at"), amount_cents = toCents(str(f, "amount"));
  const store_id = writeStoreId(ctx, str(f, "store_id") || ctx.user.store_id);
  if (!description || !due_at || amount_cents <= 0) done(back, { erro: "Preencha descrição, vencimento e valor." });
  if (id) {
    const cur = await db().get("payables", id);
    if (!cur || !canAccessStore(ctx, cur.store_id)) done(back, { erro: "Conta não encontrada." });
  }
  const row = { store_id, supplier_id: optStr(f, "supplier_id"), category: str(f, "category") || "Outros", description, due_at, amount_cents };
  if (id) await change(actor, "payables", id, row);
  else {
    const n = Math.max(1, Math.min(24, Number(str(f, "parcelas")) || 1));
    for (let i = 0; i < n; i++) {
      const d = new Date(`${due_at}T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + i);
      await create(actor, "payables", {
        ...row,
        description: n > 1 ? `${description} ${i + 1}/${n}` : description,
        due_at: d.toISOString().slice(0, 10),
        amount_cents: i === n - 1 ? amount_cents - Math.floor(amount_cents / n) * (n - 1) : Math.floor(amount_cents / n),
        paid_cents: 0,
        status: "aberto",
      });
    }
  }
  done(back, { ok: id ? "Conta atualizada." : "Conta a pagar lançada." });
}

export async function criarReceber(f: FormData) {
  const { ctx, actor } = await actionCtx("financeiro");
  const back = "/financeiro?aba=receber";
  const description = str(f, "description"), due_at = str(f, "due_at"), amount_cents = toCents(str(f, "amount"));
  if (!description || !due_at || amount_cents <= 0) done(back, { erro: "Preencha descrição, vencimento e valor." });
  await create(actor, "receivables", {
    store_id: writeStoreId(ctx, str(f, "store_id") || ctx.user.store_id), customer_id: optStr(f, "customer_id"), description, due_at, amount_cents, paid_cents: 0, status: "aberto",
  });
  done(back, { ok: "Conta a receber lançada." });
}
