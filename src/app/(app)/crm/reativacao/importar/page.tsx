import { requireUser } from "@/lib/session";
import { carregarReativacoes } from "@/lib/reativacao/server";
import { isOpen, normalizePhone } from "@/lib/reativacao/shared";
import { LinkButton, PageHeader } from "@/components/ui";
import { ImportarReativacao } from "@/components/reativacao/importar";

export default async function ImportarPage() {
  await requireUser("crm");
  // Telefones já em atendimento aberto (todas as lojas: a base de clientes é única)
  const items = await carregarReativacoes({ storeId: null });
  const filaPhones = [...new Set(items.filter((i) => isOpen(i.opp)).map((i) => normalizePhone(i.customer?.phone)).filter(Boolean))];

  return (
    <div>
      <PageHeader
        title="Importar Excel"
        subtitle="Monte a fila de reativação a partir de uma planilha. Importar não envia nenhuma mensagem."
        actions={
          <LinkButton href="/crm/reativacao" variant="secondary">
            Voltar para a fila
          </LinkButton>
        }
      />
      <ImportarReativacao filaPhones={filaPhones} />
    </div>
  );
}
