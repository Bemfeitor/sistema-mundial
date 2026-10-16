"use server";
import { db } from "@/lib/db";
import { change, create } from "@/lib/audit";
import { moveStock } from "@/lib/estoque";
import type { Ctx } from "@/lib/session";
import type { StockMovement, Transfer } from "@/lib/types";
import { actionCtx, done, int, optStr, str } from "@/lib/gestao/server";

const canStore = (ctx: Ctx, id: string) => ctx.can("consolidado") || ctx.user.store_id === id;

export async function movimentar(f: FormData) {
  const { ctx, actor } = await actionCtx("estoque");
  const back = "/estoque?aba=movimentar";
  const product_id = str(f, "product_id"), store_id = str(f, "store_id");
  const kind = str(f, "kind") as StockMovement["kind"];
  let qty = int(f, "qty");
  if (!product_id || !store_id || !qty) done(back, { erro: "Informe produto, loja e quantidade." });
  if (!canStore(ctx, store_id)) done(back, { erro: "Sem acesso a esta loja." });
  if (!["entrada", "saida", "ajuste", "devolucao"].includes(kind)) done(back, { erro: "Tipo de movimento inválido." });
  if (kind === "saida") qty = -Math.abs(qty);
  if (kind === "entrada" || kind === "devolucao") qty = Math.abs(qty);
  await moveStock(actor, { product_id, store_id, qty, kind, note: optStr(f, "note") ?? undefined, reference: optStr(f, "reference") ?? undefined });
  done(back, { ok: `Movimento registrado (${qty > 0 ? "+" : ""}${qty}).` });
}

export async function definirMinimo(f: FormData) {
  const { ctx, actor } = await actionCtx("estoque");
  const back = "/estoque?aba=movimentar";
  const product_id = str(f, "product_id"), store_id = str(f, "store_id");
  if (!product_id || !store_id) done(back, { erro: "Informe produto e loja." });
  if (!canStore(ctx, store_id)) done(back, { erro: "Sem acesso a esta loja." });
  const min_qty = Math.max(0, int(f, "min_qty"));
  const location = optStr(f, "location");
  const [item] = await db().list("stock", { eq: { product_id, store_id } });
  if (item) await change(actor, "stock", item.id, { min_qty, location });
  else await create(actor, "stock", { product_id, store_id, qty: 0, min_qty, location });
  done(back, { ok: "Estoque mínimo atualizado." });
}

export async function criarTransferencia(f: FormData) {
  const { ctx, actor } = await actionCtx("estoque");
  const back = "/estoque?aba=transferencias";
  const from_store_id = str(f, "from_store_id"), to_store_id = str(f, "to_store_id");
  if (!from_store_id || !to_store_id || from_store_id === to_store_id) done(back, { erro: "Escolha lojas de origem e destino diferentes." });
  if (!canStore(ctx, from_store_id) && !canStore(ctx, to_store_id)) done(back, { erro: "Sem acesso a estas lojas." });
  const items: Transfer["items"] = [];
  for (let i = 0; i < 6; i++) {
    const product_id = str(f, `p${i}`), qty = int(f, `q${i}`);
    if (product_id && qty > 0) items.push({ product_id, qty });
  }
  if (!items.length) done(back, { erro: "Adicione ao menos um item." });
  await create(actor, "transfers", { from_store_id, to_store_id, items, status: "solicitada", employee_id: ctx.user.id, note: optStr(f, "note") });
  done(back, { ok: "Transferência solicitada." });
}

export async function avancarTransferencia(f: FormData) {
  const { ctx, actor } = await actionCtx("estoque");
  const back = "/estoque?aba=transferencias";
  const t = await db().get("transfers", str(f, "id"));
  const to = str(f, "to") as Transfer["status"];
  if (!t) done(back, { erro: "Transferência não encontrada." });
  const ref = `TR-${t.id.slice(0, 8)}`;
  if (to === "enviada" && t.status === "solicitada") {
    if (!canStore(ctx, t.from_store_id)) done(back, { erro: "Somente a loja de origem pode enviar." });
    const stock = await db().list("stock", { eq: { store_id: t.from_store_id } });
    const short = t.items.filter((it) => (stock.find((s) => s.product_id === it.product_id)?.qty ?? 0) < it.qty);
    if (short.length && str(f, "forcar") !== "1") done(back, { erro: `Saldo insuficiente na origem para ${short.length} item(ns). Ajuste o estoque antes de enviar.` });
    for (const it of t.items) await moveStock(actor, { product_id: it.product_id, store_id: t.from_store_id, qty: -it.qty, kind: "transferencia", reference: ref, note: "Envio para outra loja" });
    await change(actor, "transfers", t.id, { status: "enviada" }, "enviar transferência");
    done(back, { ok: "Transferência enviada — estoque baixado na origem." });
  }
  if (to === "recebida" && t.status === "enviada") {
    if (!canStore(ctx, t.to_store_id)) done(back, { erro: "Somente a loja de destino pode receber." });
    for (const it of t.items) await moveStock(actor, { product_id: it.product_id, store_id: t.to_store_id, qty: it.qty, kind: "transferencia", reference: ref, note: "Recebido de outra loja" });
    await change(actor, "transfers", t.id, { status: "recebida" }, "receber transferência");
    done(back, { ok: "Transferência recebida — estoque lançado no destino." });
  }
  if (to === "cancelada" && (t.status === "solicitada" || t.status === "enviada")) {
    if (!canStore(ctx, t.from_store_id) && !canStore(ctx, t.to_store_id)) done(back, { erro: "Sem acesso a esta transferência." });
    if (t.status === "enviada")
      for (const it of t.items) await moveStock(actor, { product_id: it.product_id, store_id: t.from_store_id, qty: it.qty, kind: "transferencia", reference: ref, note: "Estorno de transferência cancelada" });
    await change(actor, "transfers", t.id, { status: "cancelada" }, "cancelar transferência");
    done(back, { ok: "Transferência cancelada." });
  }
  done(back, { erro: "Ação não permitida para o status atual." });
}

export async function aplicarInventario(f: FormData) {
  const { ctx, actor } = await actionCtx("estoque");
  const store_id = str(f, "store_id");
  const back = `/estoque?aba=inventario&loja=${store_id}`;
  if (!canStore(ctx, store_id)) done(back, { erro: "Sem acesso a esta loja." });
  const stock = await db().list("stock", { eq: { store_id } });
  let n = 0;
  for (const [k, v] of f.entries()) {
    if (!k.startsWith("count_") || String(v).trim() === "") continue;
    const product_id = k.slice(6);
    const counted = Math.max(0, Math.round(Number(String(v).replace(",", "."))));
    if (!Number.isFinite(counted)) continue;
    const current = stock.find((s) => s.product_id === product_id)?.qty ?? 0;
    const diff = counted - current;
    if (diff !== 0) {
      await moveStock(actor, { product_id, store_id, qty: diff, kind: "inventario", reference: `INV-${new Date().toISOString().slice(0, 10)}`, note: `Contagem: ${counted} (sistema: ${current})` });
      n++;
    }
  }
  done(back, { ok: n ? `Inventário aplicado: ${n} item(ns) ajustado(s).` : "Contagem confere com o sistema — nenhum ajuste necessário." });
}
