import Link from "next/link";
import { requireUser, storeFilter } from "@/lib/session";
import { db } from "@/lib/db";
import { date } from "@/lib/format";
import { PageHeader, Card, Badge, LinkButton, Button, Notice } from "@/components/ui";
import { gerarOportunidades } from "@/app/actions/clientes";
import type { Opportunity } from "@/lib/types";

const STATUS_COLS: { key: Opportunity["status"]; label: string; tone: "slate" | "blue" | "amber" | "green" | "red" }[] = [
  { key: "nova", label: "Nova", tone: "blue" },
  { key: "em_contato", label: "Em contato", tone: "amber" },
  { key: "agendado", label: "Agendado", tone: "slate" },
  { key: "convertida", label: "Convertida", tone: "green" },
  { key: "perdida", label: "Perdida", tone: "red" },
];

const KIND_LABEL: Record<Opportunity["kind"], string> = {
  pos_venda: "Pós-venda",
  orcamento: "Orçamento",
  aniversario: "Aniversário",
  reexame: "Reexame",
  cashback: "Cashback",
  reativacao: "Reativação",
  indicacao: "Indicação",
};

export default async function CrmPage() {
  const ctx = await requireUser("crm");

  const [opportunities, customers] = await Promise.all([
    db().list("opportunities", {
      eq: storeFilter(ctx),
      order: { column: "created_at", ascending: false },
    }),
    db().list("customers", { eq: storeFilter(ctx) }),
  ]);

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const byStatus = (status: Opportunity["status"]) => opportunities.filter((o) => o.status === status);

  return (
    <div>
      <PageHeader
        title="CRM — Oportunidades"
        subtitle={`${opportunities.length} oportunidades`}
        actions={
          <form action={async (fd: FormData): Promise<void> => { "use server"; await gerarOportunidades(fd); }}>
            <Button type="submit" variant="secondary">
              Gerar oportunidades automáticas
            </Button>
          </form>
        }
      />

      {/* Kanban */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${STATUS_COLS.length}, minmax(0, 1fr))` }}>
        {STATUS_COLS.map((col) => {
          const items = byStatus(col.key);
          return (
            <div key={col.key} className="min-w-0">
              <div className="mb-3 flex items-center gap-2">
                <Badge tone={col.tone}>{col.label}</Badge>
                <span className="text-xs text-slate-400">{items.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {items.map((opp) => {
                  const customer = customerMap.get(opp.customer_id);
                  return (
                    <Card key={opp.id} className="p-3">
                      <div className="mb-1 flex items-center justify-between gap-1">
                        <span className="text-xs font-medium text-slate-500">{KIND_LABEL[opp.kind]}</span>
                      </div>
                      {customer && (
                        <Link href={`/clientes/${customer.id}?tab=crm`} className="block text-sm font-semibold text-slate-800 hover:text-brand-700">
                          {customer.name}
                        </Link>
                      )}
                      {opp.note && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{opp.note}</p>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {customer && (
                          <>
                            <Link
                              href={`/vendas/nova?cliente=${customer.id}`}
                              className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700 hover:bg-brand-100"
                            >
                              Iniciar venda
                            </Link>
                            {customer.phone && (
                              <a
                                href={`https://wa.me/55${customer.phone.replace(/\D/g, "")}?text=Ol%C3%A1%20${encodeURIComponent(customer.name)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100"
                              >
                                WhatsApp
                              </a>
                            )}
                          </>
                        )}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-400">{date(opp.created_at)}</div>
                    </Card>
                  );
                })}
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                    Vazio
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
