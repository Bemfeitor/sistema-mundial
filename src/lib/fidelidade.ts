import "server-only";
import { db } from "@/lib/db";
import { create, change, type Actor } from "@/lib/audit";
import type { Benefit, Campaign, Sale } from "@/lib/types";
import { todayYmd } from "@/lib/format";

// Livro-razão de benefícios (modelo do Mundial Fidelidade): cashback/crédito com uso parcial,
// presente/cupom de uso único; carência (available_at) e validade (expires_at).

const DAY = 864e5;

export function benefitState(b: Benefit, at = new Date()) {
  if (b.remaining_cents <= 0) return "utilizado" as const;
  if (new Date(b.expires_at) < at) return "expirado" as const;
  if (new Date(b.available_at) > at) return "futuro" as const;
  return "disponivel" as const;
}

export async function customerBenefits(customerId: string) {
  return db().list("benefits", { eq: { customer_id: customerId }, order: { column: "expires_at" } });
}

export async function availableBalance(customerId: string) {
  return (await customerBenefits(customerId))
    .filter((b) => benefitState(b) === "disponivel" && (b.kind === "cashback" || b.kind === "credito"))
    .reduce((a, b) => a + b.remaining_cents, 0);
}

/** Campanha elegível de maior benefício para a venda (ou null). */
export async function bestCampaign(sale: Pick<Sale, "total_cents" | "store_id" | "items">) {
  const today = todayYmd();
  const camps = (await db().list("campaigns", { eq: { active: true } })).filter(
    (c) =>
      c.starts_at <= today &&
      c.ends_at >= today &&
      (!c.store_id || c.store_id === sale.store_id) &&
      sale.total_cents >= c.min_cents &&
      (!c.categories?.length || sale.items.some((i) => (c.categories as string[]).includes(i.category))),
  );
  let best: { campaign: Campaign; cents: number } | null = null;
  for (const c of camps) {
    let cents = Math.round((sale.total_cents * c.percent) / 100);
    if (c.max_cents > 0) cents = Math.min(cents, c.max_cents);
    if (!best || cents > best.cents) best = { campaign: c, cents };
  }
  return best;
}

/** Máximo de cashback utilizável numa compra (respeita % máx de uso da campanha mais restritiva = 30% padrão). */
export async function maxRedeemable(customerId: string, purchaseCents: number) {
  const balance = await availableBalance(customerId);
  const camps = await db().list("campaigns", { eq: { active: true } });
  const pctMax = camps.length ? Math.min(...camps.map((c) => c.max_use_percent || 100)) : 100;
  return Math.min(balance, Math.round((purchaseCents * pctMax) / 100));
}

export async function grantCashbackForSale(actor: Actor, sale: Sale) {
  if (!sale.customer_id) return 0;
  const best = await bestCampaign(sale);
  if (!best || best.cents <= 0) return 0;
  const now = Date.now();
  const b = await create(actor, "benefits", {
    customer_id: sale.customer_id,
    kind: "cashback",
    name: `Cashback ${best.campaign.name}`,
    initial_cents: best.cents,
    remaining_cents: best.cents,
    available_at: new Date(now + best.campaign.delay_days * DAY).toISOString(),
    expires_at: new Date(now + (best.campaign.delay_days + best.campaign.valid_days) * DAY).toISOString(),
    campaign_id: best.campaign.id,
    sale_id: sale.id,
  });
  await db().insert("benefit_movements", {
    benefit_id: b.id,
    customer_id: sale.customer_id,
    amount_cents: best.cents,
    reason: `Compra ${sale.number}`,
    employee_id: actor.id ?? null,
    sale_id: sale.id,
  });
  return best.cents;
}

/** Consome saldo de cashback/crédito (mais antigos a vencer primeiro). Retorna o valor efetivamente usado. */
export async function redeemBalance(actor: Actor, customerId: string, cents: number, reason: string, saleId?: string) {
  let left = cents;
  for (const b of (await customerBenefits(customerId)).filter(
    (x) => benefitState(x) === "disponivel" && (x.kind === "cashback" || x.kind === "credito"),
  )) {
    if (left <= 0) break;
    const use = Math.min(left, b.remaining_cents);
    await change(actor, "benefits", b.id, { remaining_cents: b.remaining_cents - use }, "usar_beneficio");
    await db().insert("benefit_movements", {
      benefit_id: b.id,
      customer_id: customerId,
      amount_cents: -use,
      reason,
      employee_id: actor.id ?? null,
      sale_id: saleId ?? null,
    });
    left -= use;
  }
  return cents - left;
}
