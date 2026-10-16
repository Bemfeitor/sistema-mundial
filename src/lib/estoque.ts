import "server-only";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/audit";
import type { StockMovement, TableName } from "@/lib/types";

/** Ajusta saldo do produto na loja e registra movimento. qty negativo = saída. */
export async function moveStock(
  actor: Actor,
  p: { product_id: string; store_id: string; qty: number; kind: StockMovement["kind"]; reference?: string; note?: string },
) {
  const d = db();
  const [item] = await d.list("stock", { eq: { product_id: p.product_id, store_id: p.store_id } });
  if (item) await d.update("stock", item.id, { qty: item.qty + p.qty });
  else await d.insert("stock", { product_id: p.product_id, store_id: p.store_id, qty: p.qty, min_qty: 0 });
  await d.insert("stock_movements", {
    product_id: p.product_id,
    store_id: p.store_id,
    qty: p.qty,
    kind: p.kind,
    reference: p.reference ?? null,
    note: p.note ?? null,
    employee_id: actor.id ?? null,
  });
}

/** Próximo número sequencial legível (V1048, OS2015, PC0003…). */
export async function nextNumber(table: TableName, prefix: string, start = 1000) {
  const rows = (await db().list(table)) as unknown as { number?: string }[];
  const max = rows.reduce((m, r) => {
    const n = Number(String(r.number ?? "").replace(/\D/g, ""));
    return Number.isFinite(n) && n > m ? n : m;
  }, start - 1);
  return `${prefix}${max + 1}`;
}
