import { notFound } from "next/navigation";
import { canAccessStore, requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { listIn } from "@/lib/reativacao/server";
import { isOpen, normalizePhone, reativacaoOf } from "@/lib/reativacao/shared";
import { LinkButton, PageHeader } from "@/components/ui";
import { FichaReativacao } from "@/components/reativacao/ficha";

export default async function FichaPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await requireUser("crm");
  const opp = await db().get("opportunities", id);
  if (!opp || opp.kind !== "reativacao" || !canAccessStore(ctx, opp.store_id)) notFound();
  const customer = await db().get("customers", opp.customer_id);
  if (!customer) notFound();

  const phone = normalizePhone(customer.phone);
  const [messages, owner, sameP] = await Promise.all([
    db().list("messages", { eq: { customer_id: customer.id }, order: { column: "created_at", ascending: false }, limit: 50 }),
    opp.owner_id ? db().get("employees", opp.owner_id) : Promise.resolve(null),
    phone ? listIn("customers", "phone", [phone, `55${phone}`]) : Promise.resolve([]),
  ]);
  const others = sameP.length ? await listIn("opportunities", "customer_id", sameP.map((c) => c.id), { kind: "reativacao" }) : [];
  const duplicate = isOpen(opp) && others.some((o) => o.id !== opp.id && isOpen(o));
  const pending = messages.find((m) => m.kind === "reativacao" && m.status === "aprovada") ?? null;
  const store = ctx.stores.find((s) => s.id === opp.store_id);

  return (
    <div>
      <PageHeader
        title={customer.name}
        subtitle="Revisão individual · confira tudo antes de abrir o WhatsApp"
        actions={
          <LinkButton href="/crm/reativacao" variant="secondary">
            Voltar para a fila
          </LinkButton>
        }
      />
      <FichaReativacao
        key={opp.updated_at ?? opp.created_at}
        data={{
          id: opp.id,
          status: opp.status,
          nextContactAt: opp.next_contact_at ?? "",
          createdAt: opp.created_at,
          r: reativacaoOf(opp),
          customer: {
            id: customer.id,
            name: customer.name,
            phone: customer.phone ?? "",
            consent_marketing: customer.consent_marketing,
            consent_version: customer.consent_version ?? null,
            notes: customer.notes ?? null,
          },
          canEditCustomer: canAccessStore(ctx, customer.store_id),
          storeName: store?.name ?? "",
          userName: ctx.user.name,
          ownerName: owner?.name ?? "—",
          duplicate,
          messages: messages.map((m) => ({ id: m.id, at: m.created_at, text: m.text, status: m.status, kind: m.kind })),
          pending: pending ? { id: pending.id, text: pending.text } : null,
        }}
      />
    </div>
  );
}
