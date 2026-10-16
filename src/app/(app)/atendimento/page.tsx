import { PageHeader } from "@/components/ui";
import { Balcao } from "@/components/balcao/balcao";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import type { ProdutoBalcao } from "@/lib/balcao/pacotes";

export const metadata = { title: "Balcão — atendimento" };

export default async function AtendimentoPage() {
  await requireUser("vender");
  const products = await db().list("products", { eq: { active: true }, order: { column: "price_cents" } });
  // Só o necessário para o motor de regras no navegador
  const produtos: ProdutoBalcao[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    brand: p.brand,
    tier: p.tier,
    price_cents: p.price_cents,
    cost_cents: 0, // custo não vai ao navegador; o servidor recalcula ao salvar
    lens: p.lens,
    frame: p.frame,
    tags: p.tags,
  }));
  return (
    <>
      <PageHeader title="Balcão" subtitle="Clique no perfil do cliente assim que ele chegar — o sistema sugere argumentos, pacotes e complementos em tempo real." />
      <Balcao produtos={produtos} />
    </>
  );
}
