import { Suspense } from "react";
import { ArrowDownCircle, ArrowUpCircle, Lock, LockOpen, Wallet } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Notice, PageHeader, Select, Stat, Table, Td, cn } from "@/components/ui";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { brl, date, dateTime, label } from "@/lib/format";
import { KIND_LABEL, OUT_KINDS, expectedCash, totalsByMethod } from "@/lib/vendas/caixa";
import { openCashSession, saleStoreId } from "@/lib/vendas/server";
import { cashMovementAction, closeCashAction, openCashAction, receiveInstallmentAction } from "@/lib/vendas/caixa-actions";

export const metadata = { title: "Caixa" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function CaixaPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-slate-100" />}>
      <Caixa {...props} />
    </Suspense>
  );
}

const OK: Record<string, string> = {
  aberto: "Caixa aberto.",
  suprimento: "Suprimento registrado.",
  sangria: "Sangria registrada.",
  recebido: "Recebimento de crediário registrado.",
  fechado: "Caixa fechado.",
};
const ERR: Record<string, string> = {
  ja_aberto: "Já existe um caixa aberto nesta loja.",
  sem_caixa: "Nenhum caixa aberto nesta loja.",
  valor: "Valor inválido.",
  tipo: "Tipo de movimento inválido.",
  parcela: "Parcela não encontrada ou já quitada.",
  forma: "Forma de pagamento inválida para recebimento.",
};

async function Caixa({ searchParams }: Props) {
  const ctx = await requireUser("caixa");
  const sp = await searchParams;
  const storeId = saleStoreId(ctx);
  const store = ctx.stores.find((s) => s.id === storeId);
  const d = db();
  const [session, history, employees, receivables] = await Promise.all([
    openCashSession(storeId),
    d.list("cash_sessions", { eq: { store_id: storeId, status: "fechado" }, order: { column: "created_at", ascending: false }, limit: 15 }),
    d.list("employees"),
    d.list("receivables", { eq: { store_id: storeId }, order: { column: "due_at" }, limit: 1000 }),
  ]);
  const moves = session ? await d.list("cash_movements", { eq: { session_id: session.id }, order: { column: "created_at", ascending: false } }) : [];
  const eName = new Map(employees.map((e) => [e.id, e.name]));
  const openRec = receivables.filter((r) => r.status === "aberto" || r.status === "vencido").slice(0, 80);
  const custIds = [...new Set(openRec.map((r) => r.customer_id).filter(Boolean))] as string[];
  const customers = custIds.length ? await d.list("customers", { in: { column: "id", values: custIds } }) : [];
  const cName = new Map(customers.map((c) => [c.id, c.name]));

  const sum = (pred: (m: (typeof moves)[number]) => boolean) => moves.filter(pred).reduce((a, m) => a + m.amount_cents, 0);
  const sales = sum((m) => m.kind === "venda");
  const ins = sum((m) => m.kind === "suprimento" || m.kind === "recebimento");
  const outs = sum((m) => OUT_KINDS.includes(m.kind));
  const expected = session ? expectedCash(session.opening_cents, moves) : 0;
  const ok = typeof sp.ok === "string" ? OK[sp.ok] : null;
  const erro = typeof sp.erro === "string" ? ERR[sp.erro] : null;
  const dif = typeof sp.dif === "string" ? Number(sp.dif) : null;

  return (
    <>
      <PageHeader title="Caixa" subtitle={store?.name} />
      <div className="mb-4 space-y-2">
        {ctx.storeId === null && <Notice tone="amber">Modo consolidado: exibindo o caixa da sua loja ({store?.name}).</Notice>}
        {ok && (
          <Notice tone="green">
            {ok}
            {sp.ok === "fechado" && dif != null && Number.isFinite(dif) && (
              <> Diferença: <strong>{dif === 0 ? "nenhuma" : `${dif > 0 ? "sobra de " : "falta de "}${brl(Math.abs(dif))}`}</strong>.</>
            )}
          </Notice>
        )}
        {erro && <Notice tone="red">{erro}</Notice>}
      </div>

      {!session ? (
        <Card className="mb-6 max-w-lg">
          <CardHeader title="Abrir caixa" subtitle="Informe o valor inicial em dinheiro (fundo de troco)" />
          <form action={openCashAction} className="flex items-end gap-3 p-5">
            <Field label="Valor inicial (R$)" className="flex-1">
              <Input name="opening" inputMode="decimal" placeholder="200,00" required />
            </Field>
            <Button>
              <LockOpen className="size-4" /> Abrir caixa
            </Button>
          </form>
        </Card>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Abertura" value={brl(session.opening_cents)} hint={`${dateTime(session.created_at)} · ${eName.get(session.opened_by) ?? ""}`} icon={<Wallet className="size-4" />} />
            <Stat label="Vendas" value={brl(sales)} tone="good" hint={`${moves.filter((m) => m.kind === "venda").length} lançamento(s)`} />
            <Stat label="Entradas / saídas" value={`${brl(ins)} / ${brl(outs)}`} hint="Suprimentos e recebimentos / sangrias e estornos" />
            <Stat label="Dinheiro esperado na gaveta" value={brl(expected)} tone="warn" />
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="Totais por forma" />
              <div className="divide-y divide-slate-100 text-sm">
                {totalsByMethod(moves).map(([m, v]) => (
                  <div key={m} className="flex justify-between px-5 py-2.5">
                    <span>{label(m)}</span>
                    <strong className={cn(v < 0 && "text-red-600")}>{brl(v)}</strong>
                  </div>
                ))}
                {!moves.length && <p className="px-5 py-4 text-slate-500">Sem movimentos ainda.</p>}
              </div>
            </Card>

            <Card>
              <CardHeader title="Suprimento / sangria" />
              <form action={cashMovementAction} className="space-y-3 p-5">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tipo">
                    <Select name="kind" defaultValue="sangria">
                      <option value="sangria">Sangria (saída)</option>
                      <option value="suprimento">Suprimento (entrada)</option>
                    </Select>
                  </Field>
                  <Field label="Valor (R$)">
                    <Input name="amount" inputMode="decimal" required />
                  </Field>
                </div>
                <Field label="Observação">
                  <Input name="note" placeholder="Ex.: depósito bancário" />
                </Field>
                <Button variant="secondary" className="w-full">
                  Registrar
                </Button>
              </form>
            </Card>

            <Card>
              <CardHeader title="Receber crediário" />
              <form action={receiveInstallmentAction} className="space-y-3 p-5">
                <Field label="Parcela">
                  <Select name="receivable_id" required>
                    {openRec.map((r) => (
                      <option key={r.id} value={r.id}>
                        {date(r.due_at)} · {cName.get(r.customer_id ?? "") ?? "—"} · {r.description} · {brl(r.amount_cents - r.paid_cents)}
                        {r.status === "vencido" ? " (vencida)" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Valor (vazio = total)">
                    <Input name="amount" inputMode="decimal" />
                  </Field>
                  <Field label="Forma">
                    <Select name="method" defaultValue="dinheiro">
                      {(["dinheiro", "pix", "debito", "credito"] as const).map((m) => (
                        <option key={m} value={m}>
                          {label(m)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Button variant="secondary" className="w-full" disabled={!openRec.length}>
                  Receber
                </Button>
              </form>
            </Card>
          </div>

          <Card className="mb-6">
            <CardHeader title="Movimentos da sessão" subtitle={`${moves.length} lançamento(s)`} />
            <Table head={["Hora", "Tipo", "Forma", "Referência", "Responsável", "Valor"]} empty="Nenhum movimento.">
              {moves.map((m) => {
                const out = OUT_KINDS.includes(m.kind);
                return (
                  <tr key={m.id}>
                    <Td className="whitespace-nowrap text-slate-600">{dateTime(m.created_at)}</Td>
                    <Td>
                      <span className="flex items-center gap-1.5">
                        {out ? <ArrowUpCircle className="size-4 text-red-500" /> : <ArrowDownCircle className="size-4 text-emerald-600" />}
                        {KIND_LABEL[m.kind]}
                      </span>
                    </Td>
                    <Td>{label(m.method)}</Td>
                    <Td className="text-slate-600">{m.reference ?? "—"}</Td>
                    <Td className="text-slate-600">{eName.get(m.employee_id ?? "") ?? "—"}</Td>
                    <Td className={cn("text-right font-semibold whitespace-nowrap", out ? "text-red-600" : "text-emerald-700")}>
                      {out ? "−" : "+"}
                      {brl(m.amount_cents)}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          </Card>

          <Card className="mb-6 max-w-xl border-amber-200">
            <CardHeader title="Fechar caixa" subtitle={`Esperado em dinheiro: ${brl(expected)}`} />
            <form action={closeCashAction} className="flex items-end gap-3 p-5">
              <Field label="Valor contado na gaveta (R$)" className="flex-1">
                <Input name="counted" inputMode="decimal" required />
              </Field>
              <Button variant="danger">
                <Lock className="size-4" /> Fechar caixa
              </Button>
            </form>
          </Card>
        </>
      )}

      <Card>
        <CardHeader title="Histórico de sessões" />
        <Table head={["Abertura", "Fechamento", "Aberto por", "Fechado por", "Inicial", "Esperado", "Contado", "Diferença"]} empty="Nenhuma sessão fechada.">
          {history.map((h) => {
            const diff = (h.closing_cents ?? 0) - (h.expected_cents ?? 0);
            return (
              <tr key={h.id}>
                <Td className="whitespace-nowrap">{dateTime(h.created_at)}</Td>
                <Td className="whitespace-nowrap">{dateTime(h.closed_at)}</Td>
                <Td>{eName.get(h.opened_by) ?? "—"}</Td>
                <Td>{eName.get(h.closed_by ?? "") ?? "—"}</Td>
                <Td>{brl(h.opening_cents)}</Td>
                <Td>{brl(h.expected_cents)}</Td>
                <Td>{brl(h.closing_cents)}</Td>
                <Td>
                  <Badge tone={diff === 0 ? "green" : diff > 0 ? "amber" : "red"}>{diff === 0 ? "OK" : `${diff > 0 ? "+" : "−"}${brl(Math.abs(diff))}`}</Badge>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
