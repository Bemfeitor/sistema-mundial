// Regras puras de venda (usadas no cliente e no servidor).
import type { CommissionRule, PaymentMethod, Product, ProductCategory, RxEye, SaleItem } from "@/lib/types";

export const ITEM_ROLES: { value: NonNullable<SaleItem["role"]>; label: string }[] = [
  { value: "principal", label: "Principal" },
  { value: "adicional", label: "Adicional" },
  { value: "segundo_par", label: "Segundo par" },
  { value: "upgrade", label: "Upgrade" },
];

export const PAYMENT_METHODS: PaymentMethod[] = [
  "dinheiro",
  "pix",
  "debito",
  "credito",
  "credito_parcelado",
  "boleto",
  "crediario",
  "cashback",
  "convenio",
];

/** Formas que entram no caixa da loja no momento da venda. */
export const CASH_METHODS: PaymentMethod[] = ["dinheiro", "pix", "debito", "credito", "credito_parcelado"];

/** Categorias que não movimentam estoque físico. */
export const NO_STOCK: ProductCategory[] = ["lente", "servico"];

export const ROLE_LABEL: Record<string, string> = {
  principal: "Principal",
  adicional: "Adicional",
  segundo_par: "Segundo par",
  upgrade: "Upgrade",
};

export function commissionPercent(rules: CommissionRule[] | null | undefined, category: string) {
  const list = rules ?? [];
  return list.find((r) => r.category === category)?.percent ?? list.find((r) => r.category === "*")?.percent ?? 0;
}

/** Rateia o desconto proporcionalmente e calcula a comissão por categoria. */
export function commissionFor(items: Pick<SaleItem, "category" | "qty" | "price_cents">[], discountCents: number, rules: CommissionRule[]) {
  const subtotal = items.reduce((a, i) => a + i.qty * i.price_cents, 0);
  if (subtotal <= 0) return 0;
  return items.reduce((a, i) => {
    const gross = i.qty * i.price_cents;
    const net = gross - (discountCents * gross) / subtotal;
    return a + Math.round((net * commissionPercent(rules, i.category)) / 100);
  }, 0);
}

export interface LensWarning {
  product: string;
  message: string;
}

const fmt = (n: number) => (n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2));

/** Verifica se a lente atende a receita (faixa de esférico/cilíndrico e adição). */
export function lensWarnings(product: Pick<Product, "name" | "lens">, rx: { od: RxEye; oe: RxEye } | null): LensWarning[] {
  const out: LensWarning[] = [];
  const l = product.lens;
  if (!l) return out;
  if (!rx) {
    out.push({ product: product.name, message: "Venda com lente sem receita vinculada." });
    return out;
  }
  for (const [eye, r] of [["OD", rx.od], ["OE", rx.oe]] as const) {
    if (r.sph != null) {
      if (l.sph_min != null && r.sph < l.sph_min) out.push({ product: product.name, message: `${eye}: esférico ${fmt(r.sph)} abaixo do mínimo da lente (${fmt(l.sph_min)}).` });
      if (l.sph_max != null && r.sph > l.sph_max) out.push({ product: product.name, message: `${eye}: esférico ${fmt(r.sph)} acima do máximo da lente (${fmt(l.sph_max)}).` });
    }
    if (r.cyl != null && l.cyl_max != null && Math.abs(r.cyl) > Math.abs(l.cyl_max))
      out.push({ product: product.name, message: `${eye}: cilíndrico ${fmt(r.cyl)} excede o limite da lente (${fmt(l.cyl_max)}).` });
  }
  const hasAdd = Boolean(rx.od.add || rx.oe.add);
  if ((l.type === "multifocal" || l.type === "bifocal") && !hasAdd)
    out.push({ product: product.name, message: "Lente multifocal/bifocal, mas a receita não tem adição." });
  return out;
}

export const addMonths = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, last));
  return dt.toISOString().slice(0, 10);
};

export const addDays = (ymd: string, n: number) => {
  const dt = new Date(`${ymd}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};

/** Divide um valor em n parcelas (a primeira absorve o arredondamento). */
export function splitInstallments(total: number, n: number) {
  const k = Math.max(1, Math.floor(n));
  const base = Math.floor(total / k);
  return Array.from({ length: k }, (_, i) => (i === 0 ? total - base * (k - 1) : base));
}

export const onlyDigits = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");

export function whatsappLink(phone: string | null | undefined, text: string) {
  let p = onlyDigits(phone);
  if (!p) return null;
  if (p.length <= 11) p = `55${p}`;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}
