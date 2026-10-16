"use server";
import { db } from "@/lib/db";
import { change, create } from "@/lib/audit";
import { moveStock, nextNumber } from "@/lib/estoque";
import { todayYmd } from "@/lib/format";
import type { PurchaseOrder } from "@/lib/types";
import { actionCtx, done, int, optStr, str } from "@/lib/gestao/server";
import { addDays } from "@/lib/gestao/util";
import { toCents } from "@/lib/format";

type POItem = PurchaseOrder["items"][number] & { received?: number };

export async function criarPedido(f: FormData) {
  const { ctx, actor } = await actionCtx("compras");
  const back = "/compras?aba=novo";
  const supplier_id = str(f, "supplier_id"), store_id = str(f, "store_id");
  if (!supplier_id || !store_id) done(back, { erro: "Informe fornecedor e loja." });
  const products = await db().list("products");
  const items: POItem[] = [];
  for (let i = 0; i < 10; i++) {
    const product_id = str(f, `p${i}`), qty = int(f, `q${i}`);
    if (!product_id || qty <= 0) continue;
    const typed = str(f, `c${i}`);
    const cost_cents = typed ? toCents(typed) : products.find((p) => p.id === product_id)?.cost_cents ?? 0;
    items.push({ product_id, qty, cost_cents, received: 0 });
  }
  if (!items.length) done(back, { erro: "Adicione ao menos um item." });
  const number = await nextNumber("purchase_orders", "PC", 1);
  const po = await create(actor, "purchase_orders", {
    number, supplier_id, store_id, items,
    total_cents: items.reduce((a, it) => a + it.qty * it.cost_cents, 0),
    status: "rascunho", expected_at: optStr(f, "expected_at"), employee_id: ctx.user.id, note: optStr(f, "note"),
  });
  done(`/compras?pedido=${po.id}`, { ok: `Pedido ${number} criado como rascunho.` });
}

/** Gera rascunho a partir da sugestão automática (itens enviados em hidden inputs). */
export async function gerarDaSugestao(f: FormData) {
  const { ctx, actor } = await actionCtx("compras");
  const supplier_id = str(f, "supplier_id"), store_id = str(f, "store_id");
  const products = await db().list("products");
  const items: POItem[] = f
    .getAll("item")
    .map((v) => String(v).split(":"))
    .map(([product_id, qty]) => ({ product_id, qty: Number(qty), cost_cents: products.find((p) => p.id === product_id)?.cost_cents ?? 0, received: 0 }))
    .filter((it) => it.product_id && it.qty > 0);
  if (!supplier_id || !items.length) done("/compras?aba=sugestao", { erro: "Sugestão sem fornecedor ou itens." });
  const number = await nextNumber("purchase_orders", "PC", 1);
  const po = await create(actor, "purchase_orders", {
    number, supplier_id, store_id, items,
    total_cents: items.reduce((a, it) => a + it.qty * it.cost_cents, 0),
    status: "rascunho", employee_id: ctx.user.id, note: "Gerado pela sugestão automática de compra",
  });
  done(`/compras?pedido=${po.id}`, { ok: `Pedido ${number} gerado a partir da sugestão.` });
}

export async function mudarStatusPedido(f: FormData) {
  const { actor } = await actionCtx("compras");
  const id = str(f, "id"), to = str(f, "to") as PurchaseOrder["status"];
  const po = await db().get("purchase_orders", id);
  const back = `/compras?pedido=${id}`;
  if (!po) done("/compras", { erro: "Pedido não encontrado." });
  if (to === "enviado" && po.status === "rascunho") {
    await change(actor, "purchase_orders", id, { status: "enviado" }, "enviar pedido");
    done(back, { ok: "Pedido marcado como enviado ao fornecedor." });
  }
  if (to === "cancelado" && (po.status === "rascunho" || po.status === "enviado")) {
    await change(actor, "purchase_orders", id, { status: "cancelado" }, "cancelar pedido");
    done(back, { ok: "Pedido cancelado." });
  }
  done(back, { erro: "Ação não permitida para o status atual." });
}

/** Recebimento (total ou parcial): entrada no estoque + conta a pagar. */
export async function receberPedido(f: FormData) {
  const { actor } = await actionCtx("compras");
  const id = str(f, "id");
  const back = `/compras?pedido=${id}`;
  const po = await db().get("purchase_orders", id);
  if (!po) done("/compras", { erro: "Pedido não encontrado." });
  if (!["enviado", "recebido_parcial", "rascunho"].includes(po.status)) done(back, { erro: "Pedido não pode ser recebido neste status." });
  const items = po.items as POItem[];
  let value = 0, pieces = 0;
  const updated: POItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const pending = it.qty - (it.received ?? 0);
    const now = Math.min(pending, Math.max(0, int(f, `r${i}`)));
    if (now > 0) {
      await moveStock(actor, { product_id: it.product_id, store_id: po.store_id, qty: now, kind: "entrada", reference: po.number, note: `Recebimento do pedido ${po.number}` });
      value += now * it.cost_cents;
      pieces += now;
    }
    updated.push({ ...it, received: (it.received ?? 0) + now });
  }
  if (!pieces) done(back, { erro: "Informe as quantidades recebidas." });
  const complete = updated.every((it) => (it.received ?? 0) >= it.qty);
  await change(actor, "purchase_orders", id, { items: updated as PurchaseOrder["items"], status: complete ? "recebido" : "recebido_parcial" }, "receber pedido");
  const supplier = await db().get("suppliers", po.supplier_id);
  const due = str(f, "due_at") || addDays(todayYmd(), 30);
  await create(actor, "payables", {
    store_id: po.store_id, supplier_id: po.supplier_id, category: str(f, "category") || "Fornecedor - compras",
    description: `Pedido ${po.number} — ${supplier?.name ?? "fornecedor"}${complete ? "" : " (parcial)"}${str(f, "nf") ? ` · NF ${str(f, "nf")}` : ""}`,
    due_at: due, amount_cents: value, paid_cents: 0, status: "aberto",
  });
  done(back, { ok: `${pieces} peça(s) recebida(s); conta a pagar de ${(value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} lançada.` });
}
