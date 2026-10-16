import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { SaleWizard } from "@/components/vendas/sale-wizard";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { customerContext, discountLimitOf, loadCatalog, saleStoreId } from "@/lib/vendas/server";
import type { WizardInit } from "@/lib/vendas/types";

export const metadata = { title: "Nova venda" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function NovaVendaPage(props: Props) {
  return (
    <>
      <PageHeader title="Nova venda" subtitle="Cliente → Receita → Produtos → Pagamento → Conclusão" />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-slate-100" />}>
        <Wizard {...props} />
      </Suspense>
    </>
  );
}

async function Wizard({ searchParams }: Props) {
  const ctx = await requireUser("vender");
  const sp = await searchParams;
  const quoteId = typeof sp.quote === "string" ? sp.quote : null;
  const storeId = saleStoreId(ctx);
  const d = db();
  const [catalog, quoteRow] = await Promise.all([loadCatalog(storeId), quoteId ? d.get("quotes", quoteId) : Promise.resolve(null)]);
  const quote = quoteRow && quoteRow.status === "aberto" ? quoteRow : null;
  const init: WizardInit = {
    storeId,
    storeName: ctx.stores.find((s) => s.id === storeId)?.name ?? "",
    consolidated: ctx.storeId === null,
    sellerName: ctx.user.name,
    discountLimit: discountLimitOf(ctx),
    catalog,
    quote: quote
      ? {
          id: quote.id,
          customerName: quote.customer_name ?? null,
          items: quote.items
            .filter((i) => catalog.some((p) => p.id === i.product_id))
            .map((i) => ({ product_id: i.product_id, qty: i.qty, price_cents: i.price_cents, role: i.role })),
        }
      : null,
    initialCustomer: quote?.customer_id ? await customerContext(quote.customer_id) : null,
  };
  return <SaleWizard init={init} />;
}
