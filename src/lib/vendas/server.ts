import "server-only";
import { db } from "@/lib/db";
import { availableBalance } from "@/lib/fidelidade";
import type { Ctx } from "@/lib/session";
import type { Customer } from "@/lib/types";
import type { CatalogItem, CustomerContext, CustomerSummary } from "./types";
import { NO_STOCK } from "./calc";

/** Loja onde a venda/caixa acontece (no consolidado usa a loja do funcionário). */
export const saleStoreId = (ctx: Ctx) => ctx.storeId ?? ctx.user.store_id;

/** Limite de desconto em %: admin sem limite; sem permissão "desconto" = 0. */
export const discountLimitOf = (ctx: Ctx) =>
  ctx.user.role === "admin" ? 100 : ctx.can("desconto") ? Math.max(0, ctx.user.discount_limit ?? 0) : 0;

export const canCancelSale = (ctx: Ctx) => ctx.user.role === "admin" || ctx.user.role === "gerente";

export const summarize = (c: Customer): CustomerSummary => ({
  id: c.id,
  name: c.name,
  phone: c.phone ?? null,
  cpf: c.cpf ?? null,
  birth: c.birth ?? null,
  level: c.level,
  insurer_id: c.insurer_id ?? null,
});

export async function customerContext(id: string): Promise<CustomerContext | null> {
  const d = db();
  const c = await d.get("customers", id);
  if (!c) return null;
  const [insurer, balance, rx] = await Promise.all([
    c.insurer_id ? d.get("insurers", c.insurer_id) : Promise.resolve(null),
    availableBalance(c.id),
    d.list("prescriptions", { eq: { customer_id: c.id }, order: { column: "exam_date", ascending: false } }),
  ]);
  return {
    customer: summarize(c),
    insurer: insurer && insurer.active ? { id: insurer.id, name: insurer.name, discount_percent: insurer.discount_percent } : null,
    balance_cents: balance,
    prescriptions: rx.map((p) => ({ id: p.id, exam_date: p.exam_date, valid_until: p.valid_until, professional: p.professional, od: p.od, oe: p.oe })),
  };
}

export async function loadCatalog(storeId: string): Promise<CatalogItem[]> {
  const d = db();
  const [products, stock] = await Promise.all([
    d.list("products", { eq: { active: true }, order: { column: "name" } }),
    d.list("stock", { eq: { store_id: storeId } }),
  ]);
  const qty = new Map(stock.map((s) => [s.product_id, s.qty]));
  return products.map((p) => ({
    id: p.id,
    sku: p.sku,
    barcode: p.barcode ?? null,
    name: p.name,
    brand: p.brand ?? null,
    category: p.category,
    price_cents: p.price_cents,
    stock: NO_STOCK.includes(p.category) ? null : (qty.get(p.id) ?? 0),
    lens: p.lens ?? null,
    supplier_id: p.supplier_id ?? null,
  }));
}

/** Sessão de caixa aberta da loja (a mais recente). */
export async function openCashSession(storeId: string) {
  const [s] = await db().list("cash_sessions", {
    eq: { store_id: storeId, status: "aberto" },
    order: { column: "created_at", ascending: false },
    limit: 1,
  });
  return s ?? null;
}
