"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { canAccessStore, requireUser } from "@/lib/session";
import { actorOf, change, create } from "@/lib/audit";
import { grantCashbackForSale, maxRedeemable, redeemBalance } from "@/lib/fidelidade";
import { moveStock, nextNumber } from "@/lib/estoque";
import { brl, todayYmd } from "@/lib/format";
import type { Payment, SaleItem } from "@/lib/types";
import { CASH_METHODS, NO_STOCK, PAYMENT_METHODS, addDays, addMonths, commissionFor, lensWarnings, onlyDigits, splitInstallments, whatsappLink } from "./calc";
import { canCancelSale, customerContext, discountLimitOf, openCashSession, saleStoreId, summarize } from "./server";
import type { CheckoutInput, CheckoutResult, CustomerContext, CustomerSummary, QuickCustomerInput, RxInput } from "./types";

// ---------- Cliente ----------

export async function searchCustomersAction(term: string): Promise<CustomerSummary[]> {
  await requireUser("vender");
  const t = term.trim();
  if (t.length < 2) return [];
  const digits = onlyDigits(t);
  const d = db();
  const byName = await d.list("customers", { search: { columns: ["name", "phone", "cpf", "email"], term: t }, limit: 15 });
  let rows = byName;
  if (digits.length >= 3 && digits !== t) {
    const all = await d.list("customers", { limit: 1000 });
    const extra = all.filter((c) => onlyDigits(c.phone).includes(digits) || onlyDigits(c.cpf).includes(digits));
    rows = [...byName, ...extra.filter((c) => !byName.some((b) => b.id === c.id))];
  }
  return rows.slice(0, 15).map(summarize);
}

export async function customerContextAction(id: string): Promise<CustomerContext | null> {
  await requireUser("vender");
  return customerContext(id);
}

export async function quickCreateCustomerAction(input: QuickCustomerInput): Promise<{ ok: true; ctx: CustomerContext } | { ok: false; error: string }> {
  const ctx = await requireUser("vender");
  const name = input.name?.trim();
  if (!name || name.length < 3) return { ok: false, error: "Informe o nome completo do cliente." };
  const phone = onlyDigits(input.phone);
  if (phone.length < 10) return { ok: false, error: "Informe um WhatsApp válido com DDD." };
  const cpf = onlyDigits(input.cpf) || null;
  if (cpf && cpf.length !== 11) return { ok: false, error: "CPF deve ter 11 dígitos." };
  if (cpf) {
    const dup = (await db().list("customers", { limit: 1000 })).find((c) => onlyDigits(c.cpf) === cpf);
    if (dup) return { ok: false, error: `CPF já cadastrado para ${dup.name}.` };
  }
  const c = await create(actorOf(ctx.user), "customers", {
    name,
    phone,
    cpf,
    email: null,
    birth: input.birth || null,
    store_id: saleStoreId(ctx),
    seller_id: ctx.user.id,
    insurer_id: null,
    level: "Novo",
    card_token: `card_${randomBytes(24).toString("base64url")}`,
    consent_program: false,
    consent_marketing: false,
    consent_version: null,
    last_purchase_at: null,
  });
  const cc = await customerContext(c.id);
  return cc ? { ok: true, ctx: cc } : { ok: false, error: "Falha ao carregar o cliente." };
}

// ---------- Receita ----------

export async function savePrescriptionAction(customerId: string, rx: RxInput): Promise<{ ok: true; ctx: CustomerContext; id: string } | { ok: false; error: string }> {
  const ctx = await requireUser("vender");
  const c = await db().get("customers", customerId);
  if (!c) return { ok: false, error: "Cliente não encontrado." };
  const hasAny = [rx.od, rx.oe].some((e) => e.sph != null || e.cyl != null);
  if (!hasAny) return { ok: false, error: "Preencha ao menos o esférico ou o cilíndrico." };
  for (const e of [rx.od, rx.oe]) if (e.axis != null && (e.axis < 0 || e.axis > 180)) return { ok: false, error: "Eixo deve estar entre 0 e 180." };
  const exam = rx.exam_date || todayYmd();
  const p = await create(actorOf(ctx.user), "prescriptions", {
    customer_id: customerId,
    exam_date: exam,
    valid_until: addMonths(exam, 12),
    professional: rx.professional || null,
    od: rx.od,
    oe: rx.oe,
    notes: null,
  });
  const cc = await customerContext(customerId);
  return cc ? { ok: true, ctx: cc, id: p.id } : { ok: false, error: "Falha ao recarregar o cliente." };
}

// ---------- Pagamento ----------

export async function maxRedeemableAction(customerId: string, totalCents: number) {
  await requireUser("vender");
  if (!customerId || totalCents <= 0) return 0;
  return maxRedeemable(customerId, totalCents);
}

// ---------- Conclusão ----------

export async function finalizeSaleAction(input: CheckoutInput): Promise<CheckoutResult> {
  const ctx = await requireUser("vender");
  const actor = actorOf(ctx.user);
  const d = db();
  const storeId = saleStoreId(ctx);
  const warnings: string[] = [];

  if (!input.items.length) return { ok: false, error: "Adicione ao menos um produto." };

  // Produtos (preço sempre do catálogo; itens de orçamento mantêm o preço orçado)
  const quote = input.quoteId ? await d.get("quotes", input.quoteId) : null;
  if (input.quoteId && (!quote || quote.status !== "aberto")) return { ok: false, error: "Orçamento não encontrado ou já convertido." };
  if (quote && !canAccessStore(ctx, quote.store_id)) return { ok: false, error: "Orçamento de outra loja: sem permissão." };
  const quotePrice = new Map((quote?.items ?? []).map((i) => [i.product_id, i.price_cents]));
  const products = await d.list("products", { in: { column: "id", values: input.items.map((i) => i.product_id) } });
  const byId = new Map(products.map((p) => [p.id, p]));

  const items: SaleItem[] = [];
  for (const line of input.items) {
    const p = byId.get(line.product_id);
    if (!p) return { ok: false, error: "Produto não encontrado no catálogo." };
    const qty = Math.max(1, Math.floor(line.qty));
    items.push({
      product_id: p.id,
      name: p.name,
      category: p.category,
      qty,
      price_cents: quotePrice.get(p.id) ?? p.price_cents,
      cost_cents: p.cost_cents,
      role: line.role ?? "principal",
    });
  }
  const subtotal = items.reduce((a, i) => a + i.qty * i.price_cents, 0);
  const cost = items.reduce((a, i) => a + i.qty * i.cost_cents, 0);

  // Cliente / convênio / desconto
  const customer = input.customerId ? await d.get("customers", input.customerId) : null;
  if (input.customerId && !customer) return { ok: false, error: "Cliente não encontrado." };
  const insurer = customer?.insurer_id ? await d.get("insurers", customer.insurer_id) : null;
  const limit = Math.max(discountLimitOf(ctx), insurer?.active ? insurer.discount_percent : 0);
  const discount = Math.max(0, Math.round(input.discountCents));
  if (discount > subtotal) return { ok: false, error: "Desconto maior que o subtotal." };
  const discountPct = subtotal ? (discount * 100) / subtotal : 0;
  if (ctx.user.role !== "admin" && discountPct > limit + 0.001)
    return { ok: false, error: `Desconto de ${discountPct.toFixed(1)}% acima do seu limite (${limit}%). Peça autorização ao gerente.` };
  const total = subtotal - discount;

  // Receita / lentes
  const rx = input.prescriptionId ? await d.get("prescriptions", input.prescriptionId) : null;
  if (rx && customer && rx.customer_id !== customer.id) return { ok: false, error: "Receita não pertence ao cliente." };
  const lenses = items.filter((i) => i.category === "lente").map((i) => byId.get(i.product_id)!);
  for (const l of lenses) warnings.push(...lensWarnings(l, rx).map((w) => `${w.product}: ${w.message}`));

  // Estoque disponível
  for (const i of items.filter((x) => !NO_STOCK.includes(x.category))) {
    const [st] = await d.list("stock", { eq: { product_id: i.product_id, store_id: storeId } });
    if ((st?.qty ?? 0) < i.qty) warnings.push(`${i.name}: estoque insuficiente na loja (${st?.qty ?? 0}).`);
  }

  // Pagamentos
  const payments: Payment[] = [];
  for (const p of input.payments) {
    if (!PAYMENT_METHODS.includes(p.method)) return { ok: false, error: "Forma de pagamento inválida." };
    const amount = Math.round(p.amount_cents);
    if (amount <= 0) continue;
    payments.push({
      method: p.method,
      amount_cents: amount,
      installments: p.method === "crediario" ? input.crediario?.installments ?? 1 : p.installments ?? 1,
      brand: p.brand ?? null,
      nsu: p.nsu ?? null,
    });
  }
  const paid = payments.reduce((a, p) => a + p.amount_cents, 0);
  if (paid !== total) return { ok: false, error: `Pagamentos (${brl(paid)}) diferentes do total (${brl(total)}).` };
  const cashbackUse = payments.filter((p) => p.method === "cashback").reduce((a, p) => a + p.amount_cents, 0);
  if (cashbackUse > 0) {
    if (!customer) return { ok: false, error: "Cashback exige cliente identificado." };
    const max = await maxRedeemable(customer.id, total);
    if (cashbackUse > max) return { ok: false, error: `Cashback disponível para esta compra: ${brl(max)}.` };
  }
  const crediarioAmount = payments.filter((p) => p.method === "crediario").reduce((a, p) => a + p.amount_cents, 0);
  if (crediarioAmount > 0) {
    if (!customer) return { ok: false, error: "Crediário exige cliente identificado." };
    if (!input.crediario || input.crediario.installments < 1 || !input.crediario.firstDue)
      return { ok: false, error: "Informe parcelas e 1º vencimento do crediário." };
  }

  // Comissão
  const seller = ctx.user;
  const commission = commissionFor(items, discount, seller.commission_rules ?? []);
  const today = todayYmd();

  // Venda
  const number = await nextNumber("sales", "V");
  let sale = await create(actor, "sales", {
    number,
    store_id: storeId,
    customer_id: customer?.id ?? null,
    seller_id: seller.id,
    quote_id: quote?.id ?? null,
    prescription_id: rx?.id ?? null,
    items,
    subtotal_cents: subtotal,
    discount_cents: discount,
    total_cents: total,
    cost_cents: cost,
    payments,
    commission_cents: commission,
    cashback_cents: 0,
    status: "concluida",
    warranty_until: addMonths(today, 12),
    note: input.note?.trim() || null,
  });

  // Daqui em diante: melhor esforço (cada passo auditado; falhas viram avisos)
  const step = async (what: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      warnings.push(`${what}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Uso de cashback
  if (cashbackUse > 0 && customer)
    await step("Cashback", async () => {
      const used = await redeemBalance(actor, customer.id, cashbackUse, `Uso na compra ${number}`, sale.id);
      if (used < cashbackUse) warnings.push(`Cashback debitado parcialmente (${brl(used)}).`);
    });

  // Estoque
  for (const i of items.filter((x) => !NO_STOCK.includes(x.category)))
    await step(`Estoque de ${i.name}`, () =>
      moveStock(actor, { product_id: i.product_id, store_id: storeId, qty: -i.qty, kind: "venda", reference: number }),
    );

  // Cashback ganho (sobre o valor pago sem cashback)
  let earned = 0;
  if (customer)
    await step("Cashback ganho", async () => {
      earned = await grantCashbackForSale(actor, { ...sale, total_cents: total - cashbackUse });
      if (earned > 0) sale = await change(actor, "sales", sale.id, { cashback_cents: earned }, "registrar_cashback");
    });

  // Crediário
  if (crediarioAmount > 0 && input.crediario && customer)
    await step("Crediário", async () => {
      const parts = splitInstallments(crediarioAmount, input.crediario!.installments);
      for (const [k, amount] of parts.entries())
        await create(actor, "receivables", {
          store_id: storeId,
          customer_id: customer.id,
          sale_id: sale.id,
          description: `Crediário ${number} ${k + 1}/${parts.length}`,
          due_at: addMonths(input.crediario!.firstDue, k),
          amount_cents: amount,
          paid_cents: 0,
          status: "aberto",
        });
    });

  // OS de laboratório
  let labOrder: { id: string; number: string; due_at: string | null } | null = null;
  if (lenses.length)
    await step("OS de laboratório", async () => {
      const lens = lenses[0];
      const supplier = lens.supplier_id ? await d.get("suppliers", lens.supplier_id) : null;
      const days = Math.max(...lenses.map((l) => l.lens?.lab_days ?? 0), 0) || supplier?.lead_days || 7;
      const frames = items.filter((i) => i.category === "armacao").map((i) => i.name);
      const osNumber = await nextNumber("lab_orders", "OS", 2000);
      const due = addDays(today, days);
      const os = await create(actor, "lab_orders", {
        number: osNumber,
        sale_id: sale.id,
        store_id: storeId,
        customer_id: customer?.id ?? null,
        supplier_id: lens.supplier_id ?? null,
        description: [...lenses.map((l) => l.name), ...frames].join(" + "),
        status: "aguardando_pedido",
        due_at: due,
        responsible_id: null,
        checklist: {},
        history: [{ at: new Date().toISOString(), status: "aguardando_pedido", by: seller.name, note: `Gerada na venda ${number}` }],
      });
      labOrder = { id: os.id, number: os.number, due_at: os.due_at ?? null };
    });

  // Caixa
  const session = await openCashSession(storeId);
  const cashPays = payments.filter((p) => CASH_METHODS.includes(p.method));
  if (session)
    for (const p of cashPays)
      await step("Caixa", () =>
        create(actor, "cash_movements", {
          session_id: session.id,
          store_id: storeId,
          kind: "venda",
          method: p.method,
          amount_cents: p.amount_cents,
          reference: number,
          employee_id: seller.id,
        }),
      );
  else if (cashPays.length) warnings.push("Nenhum caixa aberto na loja: pagamentos não lançados no caixa.");

  // Orçamento / cliente
  if (quote) await step("Orçamento", () => change(actor, "quotes", quote.id, { status: "convertido", sale_id: sale.id }, "converter"));
  if (customer) await step("Cliente", () => change(actor, "customers", customer.id, { last_purchase_at: new Date().toISOString() }));

  const first = customer?.name.split(" ")[0] ?? "";
  const msg =
    `Olá, ${first}! Obrigado por comprar na Ótica Mundial. Sua compra ${number} no valor de ${brl(total)} foi registrada` +
    (labOrder ? `; seus óculos ficam prontos até ${(labOrder as { due_at: string | null }).due_at?.split("-").reverse().join("/")}` : "") +
    "." +
    (earned > 0 ? ` Você ganhou ${brl(earned)} de cashback para a próxima compra!` : "") +
    " Qualquer dúvida, estamos à disposição.";

  revalidatePath("/vendas");
  revalidatePath("/os");
  revalidatePath("/caixa");
  return {
    ok: true,
    saleId: sale.id,
    number,
    total_cents: total,
    cashback_cents: earned,
    labOrder,
    whatsapp: whatsappLink(customer?.phone, msg),
    warnings,
  };
}

// ---------- Cancelamento ----------

export async function cancelSaleAction(form: FormData) {
  const ctx = await requireUser("vender");
  const id = String(form.get("id") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!canCancelSale(ctx)) redirect(`/vendas/${id}?erro=permissao`);
  const d = db();
  const actor = actorOf(ctx.user);
  const sale = await d.get("sales", id);
  if (!sale || sale.status === "cancelada") redirect(`/vendas/${id}`);
  if (!canAccessStore(ctx, sale.store_id)) redirect(`/vendas/${id}?erro=loja`);
  if (!reason) redirect(`/vendas/${id}?erro=motivo`);

  await change(actor, "sales", sale.id, { status: "cancelada", note: [sale.note, `Cancelada: ${reason}`].filter(Boolean).join(" · ") }, "cancelar");

  for (const i of sale.items.filter((x) => !NO_STOCK.includes(x.category)))
    await moveStock(actor, { product_id: i.product_id, store_id: sale.store_id, qty: i.qty, kind: "devolucao", reference: sale.number, note: "Cancelamento de venda" });

  for (const os of await d.list("lab_orders", { eq: { sale_id: sale.id } }))
    if (os.status !== "cancelado" && os.status !== "entregue")
      await change(actor, "lab_orders", os.id, {
        status: "cancelado",
        history: [...(os.history ?? []), { at: new Date().toISOString(), status: "cancelado", by: ctx.user.name, note: `Venda ${sale.number} cancelada` }],
      }, "cancelar");

  for (const r of await d.list("receivables", { eq: { sale_id: sale.id } }))
    if (r.status !== "pago" && r.status !== "cancelado") await change(actor, "receivables", r.id, { status: "cancelado" }, "cancelar");

  // Cashback concedido nesta venda é anulado; cashback usado volta como crédito
  for (const b of await d.list("benefits", { eq: { sale_id: sale.id } }))
    if (b.remaining_cents > 0) await change(actor, "benefits", b.id, { remaining_cents: 0 }, "anular_beneficio");
  const usedCashback = sale.payments.filter((p) => p.method === "cashback").reduce((a, p) => a + p.amount_cents, 0);
  if (usedCashback > 0 && sale.customer_id) {
    const now = Date.now();
    await create(actor, "benefits", {
      customer_id: sale.customer_id,
      kind: "credito",
      name: `Estorno de cashback ${sale.number}`,
      initial_cents: usedCashback,
      remaining_cents: usedCashback,
      available_at: new Date(now).toISOString(),
      expires_at: new Date(now + 90 * 864e5).toISOString(),
      campaign_id: null,
      sale_id: null,
    });
  }

  // Estorno no caixa aberto (saída)
  const session = await openCashSession(sale.store_id);
  if (session)
    for (const p of sale.payments.filter((x) => CASH_METHODS.includes(x.method)))
      await create(actor, "cash_movements", {
        session_id: session.id,
        store_id: sale.store_id,
        kind: "pagamento",
        method: p.method,
        amount_cents: p.amount_cents,
        reference: `Estorno ${sale.number}`,
        employee_id: ctx.user.id,
      });

  revalidatePath("/vendas");
  revalidatePath(`/vendas/${sale.id}`);
  revalidatePath("/os");
  revalidatePath("/caixa");
  redirect(`/vendas/${sale.id}?ok=cancelada`);
}
