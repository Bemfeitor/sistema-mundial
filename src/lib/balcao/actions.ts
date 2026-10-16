"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { canAccessStore, requireUser, storeFilter } from "@/lib/session";
import { actorOf, change, create } from "@/lib/audit";
import { availableBalance } from "@/lib/fidelidade";
import { ageFrom, todayYmd } from "@/lib/format";
import type { Quote, RxEye, SaleItem } from "@/lib/types";

export interface ClienteResumo {
  id: string;
  name: string;
  phone?: string | null;
  city?: string | null;
}

export interface ClienteBalcao {
  id: string;
  name: string;
  phone?: string | null;
  idade: number | null;
  gender?: string | null;
  profession?: string | null;
  level: string;
  saldo_cents: number;
  compras: number;
  ultima_compra?: string | null;
  ultimos_itens: string[];
  receita: null | {
    exam_date: string;
    valid_until?: string | null;
    vencida: boolean;
    od: RxEye;
    oe: RxEye;
    professional?: string | null;
  };
}

/** Busca rápida por nome ou telefone (respeita a loja selecionada). */
export async function buscarClientes(termo: string): Promise<ClienteResumo[]> {
  const ctx = await requireUser("vender");
  const t = termo.trim();
  if (t.length < 2) return [];
  // telefone digitado com máscara → busca só pelos dígitos
  const soTelefone = /^[\d\s()+-]+$/.test(t);
  const rows = await db().list("customers", {
    eq: storeFilter(ctx),
    search: soTelefone ? { columns: ["phone"], term: t.replace(/\D/g, "") } : { columns: ["name", "phone"], term: t },
    order: { column: "name" },
    limit: 8,
  });
  return rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone, city: c.city }));
}

/** Histórico, última receita e saldo de cashback do cliente. */
export async function carregarCliente(id: string): Promise<ClienteBalcao | null> {
  const ctx = await requireUser("vender");
  const d = db();
  const c = await d.get("customers", id);
  if (!c || !canAccessStore(ctx, c.store_id)) return null;
  const [rxs, sales, saldo] = await Promise.all([
    d.list("prescriptions", { eq: { customer_id: id }, order: { column: "exam_date", ascending: false }, limit: 1 }),
    d.list("sales", { eq: { customer_id: id, status: "concluida" }, order: { column: "created_at", ascending: false }, limit: 20 }),
    availableBalance(id),
  ]);
  const rx = rxs[0];
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    idade: ageFrom(c.birth),
    gender: c.gender,
    profession: c.profession,
    level: c.level,
    saldo_cents: saldo,
    compras: sales.length,
    ultima_compra: sales[0]?.created_at ?? c.last_purchase_at ?? null,
    ultimos_itens: (sales[0]?.items ?? []).map((i) => i.name).slice(0, 4),
    receita: rx
      ? {
          exam_date: rx.exam_date,
          valid_until: rx.valid_until,
          vencida: !!rx.valid_until && rx.valid_until < todayYmd(),
          od: rx.od,
          oe: rx.oe,
          professional: rx.professional,
        }
      : null,
  };
}

export interface SalvarOrcamentoInput {
  profile: Quote["profile"];
  items: SaleItem[];
  package_tier?: string | null;
  ai_summary?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
}

export async function salvarOrcamento(input: SalvarOrcamentoInput): Promise<{ id: string }> {
  const ctx = await requireUser("vender");
  if (!input.items.length) throw new Error("Adicione ao menos um item ao orçamento.");
  // Recalcula preços com o catálogo (não confia no navegador)
  const d = db();
  if (input.customer_id) {
    const c = await d.get("customers", input.customer_id);
    if (!c || !canAccessStore(ctx, c.store_id)) throw new Error("Cliente não encontrado ou de outra loja.");
  }
  const items: SaleItem[] = [];
  for (const it of input.items) {
    const p = await d.get("products", it.product_id);
    if (!p || !p.active) continue;
    items.push({ product_id: p.id, name: p.name, category: p.category, qty: Math.max(1, Math.round(it.qty || 1)), price_cents: p.price_cents, cost_cents: p.cost_cents, role: it.role ?? "principal" });
  }
  if (!items.length) throw new Error("Nenhum produto válido no orçamento.");
  const total = items.reduce((a, i) => a + i.price_cents * i.qty, 0);
  const q = await create(actorOf(ctx.user), "quotes", {
    store_id: ctx.storeId ?? ctx.user.store_id,
    seller_id: ctx.user.id,
    customer_id: input.customer_id || null,
    customer_name: input.customer_name?.trim() || null,
    profile: input.profile,
    package_tier: input.package_tier ?? null,
    items,
    total_cents: total,
    ai_summary: input.ai_summary?.trim() || null,
    status: "aberto",
    sale_id: null,
  });
  revalidatePath("/orcamentos");
  return { id: q.id };
}

export async function marcarPerdido(form: FormData) {
  const ctx = await requireUser("vender");
  const id = String(form.get("id") ?? "");
  const q = await db().get("quotes", id);
  if (!q || (ctx.storeId && q.store_id !== ctx.storeId)) return;
  if (q.status !== "aberto") return;
  await change(actorOf(ctx.user), "quotes", id, { status: "perdido" }, "marcar_perdido");
  revalidatePath("/orcamentos");
  revalidatePath(`/orcamentos/${id}`);
}

export async function reabrirOrcamento(form: FormData) {
  const ctx = await requireUser("vender");
  const id = String(form.get("id") ?? "");
  const q = await db().get("quotes", id);
  if (!q || (ctx.storeId && q.store_id !== ctx.storeId) || q.status !== "perdido") return;
  await change(actorOf(ctx.user), "quotes", id, { status: "aberto" }, "reabrir");
  revalidatePath("/orcamentos");
  revalidatePath(`/orcamentos/${id}`);
}
