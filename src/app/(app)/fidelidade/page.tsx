import { requireUser, storeFilter } from "@/lib/session";
import { db } from "@/lib/db";
import { brl, date, todayYmd } from "@/lib/format";
import { PageHeader, Card, CardHeader, Badge, Table, Td, LinkButton, Notice, Empty } from "@/components/ui";
import { CampanhaForm } from "@/components/clientes/CampanhaForm";

export default async function FidelidadePage() {
  const ctx = await requireUser("fidelidade");

  const today = todayYmd();
  const in15 = new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10);

  const [campaigns, benefits, stores] = await Promise.all([
    db().list("campaigns", { order: { column: "starts_at", ascending: false } }),
    db().list("benefits"),
    db().list("stores", { eq: { active: true } }),
  ]);

  const totalEmitido = benefits.reduce((a, b) => a + b.initial_cents, 0);
  const totalUtilizado = benefits.reduce((a, b) => a + (b.initial_cents - b.remaining_cents), 0);
  const pctUtilizacao = totalEmitido > 0 ? Math.round((totalUtilizado / totalEmitido) * 100) : 0;
  const aVencer = benefits.filter(
    (b) => b.remaining_cents > 0 && b.expires_at >= today && b.expires_at <= in15,
  ).reduce((a, b) => a + b.remaining_cents, 0);

  return (
    <div>
      <PageHeader
        title="Fidelidade e Cashback"
        actions={<CampanhaForm stores={stores} />}
      />

      {/* KPIs */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total emitido</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{brl(totalEmitido)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total utilizado</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{brl(totalUtilizado)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">% Utilização</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{pctUtilizacao}%</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">A vencer em 15 dias</div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{brl(aVencer)}</div>
        </Card>
      </div>

      {/* Regras de nível */}
      <Card className="mb-6">
        <CardHeader title="Regras de nível fidelidade" subtitle="Baseado em gastos dos últimos 12 meses" />
        <Table head={["Nível", "Requisito (12 meses)", "Benefícios"]}>
          {[
            ["Novo", "Cadastro", "Participa do cashback"],
            ["Silver", "R$ 500+", "Cashback + prioridade em promoções"],
            ["Gold", "R$ 1.500+", "Cashback + desconto especial + presente de aniversário"],
            ["Black", "R$ 3.000+", "Todos os benefícios Gold + consultor exclusivo"],
            ["VIP", "R$ 6.000+ ou indicação", "Benefícios premium + atendimento especial"],
          ].map(([nivel, req, ben]) => (
            <tr key={nivel}>
              <Td><Badge tone={nivel === "Gold" ? "amber" : nivel === "Silver" ? "blue" : nivel === "Black" ? "violet" : nivel === "VIP" ? "green" : "slate"}>{nivel}</Badge></Td>
              <Td className="text-sm text-slate-700">{req}</Td>
              <Td className="text-sm text-slate-500">{ben}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      {/* Campanhas */}
      <Card>
        <CardHeader title="Campanhas de cashback" subtitle={`${campaigns.length} campanhas`} />
        {campaigns.length === 0 ? (
          <div className="p-5"><Empty>Nenhuma campanha cadastrada.</Empty></div>
        ) : (
          <Table head={["Nome", "Cashback", "Vigência", "Loja", "Mín.", "Máx.", "Carência", "Status", ""]}>
            {campaigns.map((c) => {
              const ativa = c.active && c.starts_at <= today && c.ends_at >= today;
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td className="font-medium">{c.name}</Td>
                  <Td>{c.percent}%</Td>
                  <Td className="text-xs text-slate-500">{date(c.starts_at)} – {date(c.ends_at)}</Td>
                  <Td className="text-xs">{stores.find((s) => s.id === c.store_id)?.name ?? "Todas"}</Td>
                  <Td className="text-xs">{brl(c.min_cents)}</Td>
                  <Td className="text-xs">{c.max_cents > 0 ? brl(c.max_cents) : "—"}</Td>
                  <Td className="text-xs">{c.delay_days > 0 ? `${c.delay_days} dias` : "Imediato"}</Td>
                  <Td>
                    <Badge tone={ativa ? "green" : "slate"}>{ativa ? "Ativa" : c.active ? "Fora do período" : "Inativa"}</Badge>
                  </Td>
                  <Td>
                    <CampanhaForm stores={stores} campanha={c} />
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
