// Tipos trocados entre o servidor e o wizard de venda (sem dependências de servidor).
import type { Customer, CustomerLevel, Insurer, PaymentMethod, Prescription, Product, ProductCategory, RxEye, SaleItem } from "@/lib/types";

export interface CatalogItem {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  category: ProductCategory;
  price_cents: number;
  stock: number | null; // null = não controla estoque (lente/serviço)
  lens: Product["lens"];
  supplier_id: string | null;
}

export interface CustomerSummary {
  id: string;
  name: string;
  phone: string | null;
  cpf: string | null;
  birth: string | null;
  level: CustomerLevel;
  insurer_id: string | null;
}

export interface CustomerContext {
  customer: CustomerSummary;
  insurer: Pick<Insurer, "id" | "name" | "discount_percent"> | null;
  balance_cents: number;
  prescriptions: Pick<Prescription, "id" | "exam_date" | "valid_until" | "professional" | "od" | "oe">[];
}

export interface WizardInit {
  storeId: string;
  storeName: string;
  consolidated: boolean;
  sellerName: string;
  discountLimit: number; // % (100 = sem limite)
  catalog: CatalogItem[];
  quote: {
    id: string;
    items: { product_id: string; qty: number; price_cents: number; role?: SaleItem["role"] }[];
    customerName: string | null;
  } | null;
  initialCustomer: CustomerContext | null;
}

/** Linha enviada ao servidor: o preço é sempre definido no servidor (catálogo/orçamento). */
export interface CartLine {
  product_id: string;
  qty: number;
  role: NonNullable<SaleItem["role"]>;
}

/** Linha do carrinho no wizard: inclui o preço apenas para exibição. */
export type CartLineView = CartLine & { price_cents: number };

export interface PaymentLine {
  method: PaymentMethod;
  amount_cents: number;
  installments?: number;
  brand?: string | null;
  nsu?: string | null;
}

export interface CheckoutInput {
  customerId: string | null;
  prescriptionId: string | null;
  quoteId: string | null;
  items: CartLine[];
  discountCents: number;
  payments: PaymentLine[];
  crediario: { installments: number; firstDue: string } | null;
  note: string | null;
}

export type CheckoutResult =
  | {
      ok: true;
      saleId: string;
      number: string;
      total_cents: number;
      cashback_cents: number;
      labOrder: { id: string; number: string; due_at: string | null } | null;
      whatsapp: string | null;
      warnings: string[];
    }
  | { ok: false; error: string };

export type QuickCustomerInput = Pick<Customer, "name" | "phone" | "cpf" | "birth">;
export type RxInput = { od: RxEye; oe: RxEye; exam_date: string; professional: string | null };
