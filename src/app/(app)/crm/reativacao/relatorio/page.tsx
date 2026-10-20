import { Download } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { dateTime, pct } from "@/lib/format";
import { filtrosRelatorio, relatorioReativacao } from "@/lib/reativacao/server";
import { PERIODOS } from "@/lib/reativacao/shared";
import { Button, Card, CardHeader, Field, LinkButton, PageHeader, Select, Stat, Table, Td } from "@/components/ui";
import { BotaoImprimir } from "@/components/balcao/imprimir";

export default async function RelatorioReativacaoPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await props.searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const ctx = await requireUser("crm");
  const consolidado = ctx.can("consolidado");
  const f = filtrosRelatorio({ store_id: ctx.user.store_id, consolidado }, sp, ctx.storeId);

  const [{ k, linhas }, employees] = await Promise.all([
    relatorioReativacao(f),
    db().list("employees", { eq: { active: true, ...(f.storeId ? { store_id: f.storeId } : {}) }, order: { column: "name" } }),
  ]);
  const periodoLabel = PERIODOS.find((p) => p.key === f.periodo)?.label ?? "";
  const lojaLabel = f.storeId ? ctx.stores.find((s) => s.id === f.storeId)?.name ?? "" : "Consolidado";
  const csvQuery = new URLSearchParams({ periodo: f.periodo, loja: f.storeId ?? "", func: f.ownerId ?? "" }).toString();

  return (
    <div>
      <PageHeader
        title="Relatório de reativação"
        subtitle={`${periodoLabel} · ${lojaLabel}`}
        actions={
          <div className="flex gap-2 print:hidden">
            <BotaoImprimir />
            <a
              href={`/api/relatorios/reativacao?${csvQuery}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
            >
              <Download className="size-4" /> Exportar CSV
            </a>
            <LinkButton href="/crm/reativacao" variant="ghost">
              Voltar para a fila
            </LinkButton>
          </div>
        }
      />

      <Card className="mb-6 print:hidden">
        <form className="grid gap-4 p-5 sm:grid-cols-4" method="get">
          <Field label="Período">
            <Select name="periodo" defaultValue={f.periodo}>
              {PERIODOS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Loja">
            <Select name="loja" defaultValue={f.storeId ?? ""} disabled={!consolidado}>
              {consolidado && <option value="">Consolidado</option>}
              {ctx.stores
                .filter((s) => consolidado || s.id === ctx.user.store_id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Funcionário">
            <Select name="func" defaultValue={f.ownerId ?? ""}>
              <option value="">Todos</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              Filtrar
            </Button>
          </div>
        </form>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Mensagens enviadas" value={k.envios} hint="Envios confirmados no período" />
        <Stat label="Taxa de resposta" value={pct(k.taxa)} hint={`${k.responderam} de ${k.enviados} contatados`} />
        <Stat label="Visitas combinadas" value={k.visitas} />
        <Stat label="Vendas vinculadas" value={k.compraram} tone={k.compraram ? "good" : "default"} hint="Convertidas ou com venda após o contato" />
        <Stat label="Clientes importados" value={k.importados} />
        <Stat label="Retornos pendentes" value={k.pendentes} hint="Aguardando resposta (menos de 48 h)" />
        <Stat label="Retornos atrasados" value={k.atrasados} tone={k.atrasados ? "bad" : "default"} hint="Sem resposta há 48 h ou mais" />
        <Stat label="Alertas de contato anterior" value={k.alertasContato} tone={k.alertasContato ? "warn" : "default"} />
      </div>

      <Card>
        <CardHeader title="Atendimentos" subtitle={`${linhas.length} atendimento(s) com atividade no período`} />
        <Table head={["Data", "Cliente", "Faixa", "Situação", "Resultado", "Responsável"]} empty="Nenhum atendimento no período.">
          {linhas.map((l) => (
            <tr key={l.item.opp.id}>
              <Td className="whitespace-nowrap text-xs">{dateTime(l.data)}</Td>
              <Td className="font-medium">{l.cliente}</Td>
              <Td className="whitespace-nowrap text-xs">{l.faixa}</Td>
              <Td className="text-xs">{l.situacao}</Td>
              <Td className="text-xs">{l.resultado}</Td>
              <Td className="text-xs">{l.responsavel}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
