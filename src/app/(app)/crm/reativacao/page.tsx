import Link from "next/link";
import { AlertTriangle, BarChart3, FileSpreadsheet, MessageCircle, Send, Users } from "lucide-react";
import { requireUser } from "@/lib/session";
import { dateTime, pct } from "@/lib/format";
import { carregarReativacoes, indicadores, type ItemReativacao } from "@/lib/reativacao/server";
import {
  ATTENDANCE_LABEL,
  PAGE_SIZE,
  PERIODOS,
  QUEUE_STATUS_INFO,
  RESPONSE_LABEL,
  YEARS_LABEL,
  asPeriodo,
  formatPhone,
  isOpen,
  periodStart,
  type QueueStatus,
} from "@/lib/reativacao/shared";
import { Badge, Card, CardHeader, LinkButton, Notice, PageHeader, Stat, Table, Td, cn } from "@/components/ui";
import { NovoClienteReativacao } from "@/components/reativacao/novo-cliente";

const FILTROS: { key: string; label: string; match: (i: ItemReativacao) => boolean }[] = [
  { key: "abertos", label: "Todos abertos", match: (i) => isOpen(i.opp) },
  { key: "pronto", label: "Pronto para revisar", match: (i) => i.status === "pronto" },
  { key: "enviado", label: "Envio confirmado", match: (i) => i.status === "enviado" },
  { key: "alerta", label: "Com alerta", match: (i) => i.status === "alerta" },
  { key: "corrigir", label: "Corrigir dados", match: (i) => i.status === "corrigir" },
  { key: "atrasado", label: "Retorno atrasado (48 h)", match: (i) => i.status === "atrasado" },
  { key: "aguardando_confirmacao", label: "Aguardando confirmação", match: (i) => i.status === "aguardando_confirmacao" },
  { key: "encerrado", label: "Encerrados", match: (i) => i.status === "encerrado" },
];

const ORDEM: Record<QueueStatus, number> = { atrasado: 0, aguardando_confirmacao: 1, corrigir: 2, alerta: 3, pronto: 4, enviado: 5, encerrado: 6 };

export default async function ReativacaoPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined)) ?? "";
  const ctx = await requireUser("crm");

  const periodo = asPeriodo(one("periodo"));
  const ver = one("ver") === "minha" ? "minha" : "loja";
  const filtroKey = FILTROS.some((f) => f.key === one("status")) ? one("status") : "abertos";
  const from = periodStart(periodo);

  const items = await carregarReativacoes({ storeId: ctx.storeId, ownerId: ver === "minha" ? ctx.user.id : null });
  const k = indicadores(items, from);

  const filtro = FILTROS.find((f) => f.key === filtroKey)!;
  const fila = items
    .filter(filtro.match)
    .sort((a, b) => ORDEM[a.status] - ORDEM[b.status] || (a.r.last_sent_at ?? a.opp.created_at).localeCompare(b.r.last_sent_at ?? b.opp.created_at));
  const pages = Math.max(1, Math.ceil(fila.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(one("page")) || 1));
  const pagina = fila.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const href = (patch: Record<string, string | number>) => {
    const q = new URLSearchParams({ periodo, ver, status: filtroKey, page: String(page), ...Object.fromEntries(Object.entries(patch).map(([a, b]) => [a, String(b)])) });
    return `/crm/reativacao?${q.toString()}`;
  };

  const funil = [
    { label: "Importados", n: k.importados },
    { label: "Enviados", n: k.enviados },
    { label: "Responderam", n: k.responderam },
    { label: "Visita combinada", n: k.visitas },
    { label: "Compraram", n: k.compraram },
  ];
  const maxFunil = Math.max(1, ...funil.map((f) => f.n));
  const totalRespostas = k.respostas.reduce((s, r) => s + r.n, 0);
  const countBy = (key: string) => items.filter(FILTROS.find((f) => f.key === key)!.match).length;

  return (
    <div>
      <PageHeader
        title="Reativação de clientes"
        subtitle="Prepare, confira e envie pelo WhatsApp. Nada é enviado automaticamente."
        actions={
          <>
            <NovoClienteReativacao />
            <LinkButton href="/crm/reativacao/importar" variant="secondary">
              <FileSpreadsheet className="size-4" /> Importar Excel
            </LinkButton>
            <LinkButton href="/crm/reativacao/relatorio" variant="ghost">
              <BarChart3 className="size-4" /> Relatório
            </LinkButton>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {PERIODOS.map((p) => (
          <Link
            key={p.key}
            href={href({ periodo: p.key, page: 1 })}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-medium",
              p.key === periodo ? "bg-brand-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {p.label}
          </Link>
        ))}
        <span className="mx-2 h-5 w-px bg-slate-200" />
        {(
          [
            ["minha", "Minha fila"],
            ["loja", ctx.storeId ? "Minha loja (gestão)" : "Todas as lojas (gestão)"],
          ] as const
        ).map(([key, lbl]) => (
          <Link
            key={key}
            href={href({ ver: key, page: 1 })}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-medium",
              key === ver ? "bg-slate-800 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {lbl}
          </Link>
        ))}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clientes na fila" value={k.naFila} icon={<Users className="size-4" />} hint="Atendimentos abertos" />
        <Stat label="Envios confirmados" value={k.envios} icon={<Send className="size-4" />} hint="No período" />
        <Stat
          label="Taxa de resposta"
          value={pct(k.taxa)}
          icon={<MessageCircle className="size-4" />}
          hint={`${k.responderam} de ${k.enviados} contatados`}
          tone={k.taxa >= 30 ? "good" : "default"}
        />
        <Stat
          label="Sem resposta há 48 h"
          value={k.atrasados}
          icon={<AlertTriangle className="size-4" />}
          tone={k.atrasados ? "bad" : "default"}
          hint="Precisam de retorno ou encerramento"
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Jornada dos contatos" subtitle="Importados ou contatados no período" />
          <div className="space-y-3 p-5">
            {funil.map((f) => (
              <div key={f.label} className="flex items-center gap-3 text-sm">
                <span className="w-36 shrink-0 text-slate-600">{f.label}</span>
                <div className="h-6 flex-1 overflow-hidden rounded bg-slate-100">
                  <div className="h-full rounded bg-brand-500" style={{ width: `${(f.n / maxFunil) * 100}%` }} />
                </div>
                <span className="w-12 text-right font-semibold text-slate-900">{f.n}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Respostas recebidas" subtitle="Classificação registrada na ficha" />
          <div className="space-y-3 p-5">
            {k.respostas.map((r) => (
              <div key={r.key} className="text-sm">
                <div className="mb-1 flex justify-between">
                  <span className="text-slate-600">{RESPONSE_LABEL[r.key]}</span>
                  <span className="font-semibold">{r.n}</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-slate-100">
                  <div className="h-full bg-emerald-500" style={{ width: `${totalRespostas ? (r.n / totalRespostas) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
            {!totalRespostas && <p className="text-xs text-slate-500">Nenhuma resposta classificada no período.</p>}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Fila de contatos" subtitle={`${PAGE_SIZE} por página · cada liberação é individual e revisada`} />
        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
          {FILTROS.map((f) => (
            <Link
              key={f.key}
              href={href({ status: f.key, page: 1 })}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium",
                f.key === filtroKey ? "bg-brand-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {f.label} <span className="opacity-70">({countBy(f.key)})</span>
            </Link>
          ))}
        </div>
        <Table head={["Cliente", "Faixa", "Histórico", "Situação", "Status", ""]} empty="Nenhum cliente neste filtro.">
          {pagina.map((i) => {
            const info = QUEUE_STATUS_INFO[i.status];
            return (
              <tr key={i.opp.id} className="hover:bg-slate-50">
                <Td>
                  <div className="font-medium text-slate-900">{i.customer?.name ?? "Cliente removido"}</div>
                  <div className="text-xs text-slate-500">{formatPhone(i.customer?.phone)}</div>
                </Td>
                <Td className="whitespace-nowrap">{YEARS_LABEL[i.r.years_since_purchase]}</Td>
                <Td className="text-xs text-slate-600">
                  {i.r.send_history.length ? (
                    <>
                      {i.r.send_history.length} envio(s) · último {dateTime(i.r.last_sent_at)}
                    </>
                  ) : (
                    "Sem envios pela reativação"
                  )}
                  {i.r.flag === "ja_houve_contato" && <div className="text-amber-700">Já houve contato nos últimos 90 dias</div>}
                </Td>
                <Td className="text-xs">{ATTENDANCE_LABEL[i.r.attendance]}</Td>
                <Td>
                  <Badge tone={info.tone}>{info.label}</Badge>
                </Td>
                <Td className="text-right">
                  <LinkButton href={`/crm/reativacao/${i.opp.id}`} variant="secondary" className="px-2.5 py-1 text-xs">
                    Revisar individualmente
                  </LinkButton>
                </Td>
              </tr>
            );
          })}
        </Table>
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
            <span className="text-slate-500">
              Página {page} de {pages} · {fila.length} clientes
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <LinkButton href={href({ page: page - 1 })} variant="secondary" className="px-2.5 py-1 text-xs">
                  Anterior
                </LinkButton>
              )}
              {page < pages && (
                <LinkButton href={href({ page: page + 1 })} variant="secondary" className="px-2.5 py-1 text-xs">
                  Próxima
                </LinkButton>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="mt-4">
        <Notice tone="blue">
          O sistema não lê conversas do WhatsApp: registre na ficha a situação do atendimento e a classificação da resposta.
        </Notice>
      </div>
    </div>
  );
}
