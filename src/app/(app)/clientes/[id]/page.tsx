import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy, QrCode, RefreshCw, ShoppingCart, Calendar } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { availableBalance, customerBenefits, benefitState } from "@/lib/fidelidade";
import { brl, date, dateTime, toCents } from "@/lib/format";
import { qrSvg } from "@/lib/clientes/qr";
import {
  PageHeader, Card, CardHeader, Tabs, Badge, Table, Td, LinkButton, Button,
  Field, Input, Select, Textarea, Notice, Empty,
} from "@/components/ui";
import {
  alterarNivel, reemitirCartao, salvarReceita, concederBeneficio,
  registrarAtendimento,
} from "@/app/actions/clientes";
import type { Customer } from "@/lib/types";

const LEVEL_BADGE: Record<Customer["level"], "slate" | "blue" | "green" | "amber" | "violet"> = {
  Novo: "slate", Silver: "blue", Gold: "amber", Black: "violet", VIP: "green",
};

const NIVEL_REQUISITOS: Record<Customer["level"], string> = {
  Novo: "Cadastrado",
  Silver: "R$ 500+ nos últimos 12 meses",
  Gold: "R$ 1.500+ nos últimos 12 meses",
  Black: "R$ 3.000+ nos últimos 12 meses",
  VIP: "R$ 6.000+ nos últimos 12 meses — ou indicação da gestão",
};

export default async function ClienteDetalhe(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const tab = (sp.tab as string) || "resumo";

  const ctx = await requireUser("clientes");
  const customer = await db().get("customers", id);
  if (!customer) notFound();

  const baseUrl = process.env.NEXT_PUBLIC_URL ?? "https://otica.local";
  const cardUrl = `${baseUrl}/cartao/${customer.card_token}`;
  const qrData = qrSvg(cardUrl, 3);

  const tabs = [
    { key: "resumo", label: "Resumo", href: `/clientes/${id}?tab=resumo` },
    { key: "compras", label: "Compras", href: `/clientes/${id}?tab=compras` },
    { key: "oculos", label: "Óculos", href: `/clientes/${id}?tab=oculos` },
    { key: "receitas", label: "Receitas", href: `/clientes/${id}?tab=receitas` },
    { key: "beneficios", label: "Benefícios", href: `/clientes/${id}?tab=beneficios` },
    { key: "crm", label: "CRM", href: `/clientes/${id}?tab=crm` },
    { key: "dados", label: "Dados", href: `/clientes/${id}?tab=dados` },
  ];

  // ---- Data fetching por aba (lazy via condição) ----
  const [sales, labOrders, prescriptions, benefits, opportunities, employees, stores, insurers] = await Promise.all([
    tab === "compras" || tab === "resumo" ? db().list("sales", { eq: { customer_id: id }, order: { column: "created_at", ascending: false } }) : Promise.resolve([]),
    tab === "oculos" ? db().list("lab_orders", { eq: { customer_id: id }, order: { column: "created_at", ascending: false } }) : Promise.resolve([]),
    tab === "receitas" || tab === "resumo" ? db().list("prescriptions", { eq: { customer_id: id }, order: { column: "exam_date", ascending: false } }) : Promise.resolve([]),
    tab === "beneficios" || tab === "resumo" ? customerBenefits(id) : Promise.resolve([]),
    tab === "crm" ? db().list("opportunities", { eq: { customer_id: id }, order: { column: "created_at", ascending: false } }) : Promise.resolve([]),
    tab === "receitas" || tab === "agenda" ? db().list("employees", { eq: { role: "optometrista" as never } }) : Promise.resolve([]),
    db().list("stores", { eq: { active: true } }),
    tab === "dados" ? db().list("insurers", { eq: { active: true } }) : Promise.resolve([]),
  ]);

  const totalGasto = sales.reduce((a, s) => a + s.total_cents, 0);
  const numCompras = sales.length;
  const ticketMedio = numCompras > 0 ? totalGasto / numCompras : 0;
  const saldo = await availableBalance(id);

  const today = new Date().toISOString().slice(0, 10);
  const rxAtual = prescriptions[0];
  const rxVencida = rxAtual && rxAtual.valid_until && rxAtual.valid_until < today;

  // Sugestão de nível baseada em gasto 12 meses
  const ago12m = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const gasto12m = sales
    .filter((s) => s.created_at >= ago12m)
    .reduce((a, s) => a + s.total_cents, 0);
  const suggestedLevel = (() => {
    if (gasto12m >= 600000) return "VIP";
    if (gasto12m >= 300000) return "Black";
    if (gasto12m >= 150000) return "Gold";
    if (gasto12m >= 50000) return "Silver";
    return "Novo";
  })() as Customer["level"];

  const storeName = stores.find((s) => s.id === customer.store_id)?.name ?? "—";

  return (
    <div>
      <PageHeader
        title={customer.name}
        subtitle={storeName}
        actions={
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/vendas/nova?cliente=${id}`} variant="secondary">
              <ShoppingCart className="size-4" />
              Iniciar venda
            </LinkButton>
            <LinkButton href={`/agenda?cliente=${id}`} variant="secondary">
              <Calendar className="size-4" />
              Agendar
            </LinkButton>
          </div>
        }
      />

      {/* Cartão fidelidade */}
      <Card className="mb-5 flex flex-wrap items-center gap-4 px-5 py-4">
        <Badge tone={LEVEL_BADGE[customer.level]} className="text-sm px-3 py-1">{customer.level}</Badge>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-500">Link do cartão fidelidade</div>
          <div className="flex items-center gap-2 text-sm font-mono text-slate-700 truncate">
            <span className="truncate">{cardUrl}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={cardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Abrir
          </a>
          <form action={reemitirCartao}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="secondary" className="gap-1 px-3 py-1.5 text-xs">
              <RefreshCw className="size-3" />
              Reemitir
            </Button>
          </form>
        </div>
        {/* QR Code */}
        <div
          className="size-20 shrink-0"
          dangerouslySetInnerHTML={{ __html: qrData }}
        />
      </Card>

      <Tabs items={tabs} active={tab} />

      {/* ======================== RESUMO ======================== */}
      {tab === "resumo" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total gasto</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{brl(totalGasto)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Compras</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{numCompras}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Ticket médio</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{brl(ticketMedio)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Saldo cashback</div>
            <div className="mt-2 text-2xl font-bold text-emerald-700">{brl(saldo)}</div>
          </Card>

          {/* Sugestão de nível */}
          {suggestedLevel !== customer.level && (
            <Card className="col-span-full p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-700">
                    Sugestão automática de nível: <Badge tone={LEVEL_BADGE[suggestedLevel]}>{suggestedLevel}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Gasto nos últimos 12 meses: {brl(gasto12m)} — Requisito: {NIVEL_REQUISITOS[suggestedLevel]}
                  </div>
                </div>
                <form action={alterarNivel} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="level" value={suggestedLevel} />
                  <Button type="submit" variant="secondary" className="text-xs">
                    Aplicar nível {suggestedLevel}
                  </Button>
                </form>
              </div>
            </Card>
          )}

          {/* Receita */}
          {rxAtual && (
            <Card className="col-span-full p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-slate-700">Última receita — {date(rxAtual.exam_date)}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    OD: Esf {rxAtual.od.sph ?? "—"} Cil {rxAtual.od.cyl ?? "—"} Eixo {rxAtual.od.axis ?? "—"} /{" "}
                    OE: Esf {rxAtual.oe.sph ?? "—"} Cil {rxAtual.oe.cyl ?? "—"} Eixo {rxAtual.oe.axis ?? "—"}
                    {rxAtual.valid_until && ` — válida até ${date(rxAtual.valid_until)}`}
                  </div>
                </div>
                {rxVencida && <Badge tone="red">Vencida</Badge>}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ======================== COMPRAS ======================== */}
      {tab === "compras" && (
        <Card>
          <CardHeader title="Compras" subtitle={`${sales.length} registros`} />
          <Table head={["Data", "Nº", "Total", "Pagamento", "Status", ""]} empty="Nenhuma compra registrada.">
            {sales.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <Td className="text-slate-500 text-xs">{date(s.created_at)}</Td>
                <Td className="font-mono text-sm">{s.number}</Td>
                <Td className="font-semibold">{brl(s.total_cents)}</Td>
                <Td className="text-xs text-slate-500">{s.payments.map((p) => p.method).join(", ")}</Td>
                <Td>
                  <Badge tone={s.status === "concluida" ? "green" : "red"}>
                    {s.status === "concluida" ? "Concluída" : "Cancelada"}
                  </Badge>
                </Td>
                <Td>
                  <Link href={`/vendas/${s.id}`} className="text-xs text-brand-600 hover:underline">Ver</Link>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {/* ======================== ÓCULOS ======================== */}
      {tab === "oculos" && (
        <Card>
          <CardHeader title="Óculos / Laboratório" subtitle={`${labOrders.length} pedidos`} />
          <Table head={["Nº", "Descrição", "Status", "Previsão", ""]} empty="Nenhum pedido de laboratório.">
            {labOrders.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <Td className="font-mono text-sm">{o.number}</Td>
                <Td>{o.description}</Td>
                <Td><Badge tone="blue">{o.status}</Badge></Td>
                <Td className="text-slate-500 text-xs">{date(o.due_at)}</Td>
                <Td>
                  <Link href={`/os/${o.id}`} className="text-xs text-brand-600 hover:underline">Ver</Link>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {/* ======================== RECEITAS ======================== */}
      {tab === "receitas" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Receitas / Prescrições" />
            {prescriptions.length === 0 ? (
              <div className="p-5"><Empty>Nenhuma receita cadastrada.</Empty></div>
            ) : (
              <div className="divide-y divide-slate-100">
                {prescriptions.map((rx) => {
                  const vencida = rx.valid_until && rx.valid_until < today;
                  return (
                    <div key={rx.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{date(rx.exam_date)}</div>
                        {vencida ? <Badge tone="red">Vencida</Badge> : rx.valid_until ? <Badge tone="green">Válida até {date(rx.valid_until)}</Badge> : null}
                      </div>
                      {rx.professional && <div className="text-xs text-slate-500">Dr(a). {rx.professional}</div>}
                      <div className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-slate-600">
                        <div><strong>OD:</strong> Esf {rx.od.sph ?? "—"} Cil {rx.od.cyl ?? "—"} Eixo {rx.od.axis ?? "—"}{rx.od.add ? ` Add ${rx.od.add}` : ""}</div>
                        <div><strong>OE:</strong> Esf {rx.oe.sph ?? "—"} Cil {rx.oe.cyl ?? "—"} Eixo {rx.oe.axis ?? "—"}{rx.oe.add ? ` Add ${rx.oe.add}` : ""}</div>
                      </div>
                      {rx.notes && <div className="mt-1 text-xs text-slate-500">{rx.notes}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Adicionar receita */}
          <Card>
            <CardHeader title="Adicionar receita" />
            <form action={salvarReceita} className="grid gap-3 p-5">
              <input type="hidden" name="customer_id" value={id} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Data do exame">
                  <Input type="date" name="exam_date" required defaultValue={today} />
                </Field>
                <Field label="Validade até">
                  <Input type="date" name="valid_until" />
                </Field>
              </div>
              <Field label="Profissional">
                <Select name="professional" defaultValue="">
                  <option value="">Outro / Não informado</option>
                  {employees.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
                </Select>
              </Field>
              {/* OD */}
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">OD (olho direito)</div>
              <div className="grid grid-cols-4 gap-2">
                <Field label="Esférico"><Input name="od_sph" step="0.25" placeholder="0.00" /></Field>
                <Field label="Cilíndrico"><Input name="od_cyl" step="0.25" placeholder="0.00" /></Field>
                <Field label="Eixo"><Input name="od_axis" type="number" placeholder="0" /></Field>
                <Field label="Adição"><Input name="od_add" step="0.25" placeholder="0.00" /></Field>
              </div>
              {/* OE */}
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">OE (olho esquerdo)</div>
              <div className="grid grid-cols-4 gap-2">
                <Field label="Esférico"><Input name="oe_sph" step="0.25" placeholder="0.00" /></Field>
                <Field label="Cilíndrico"><Input name="oe_cyl" step="0.25" placeholder="0.00" /></Field>
                <Field label="Eixo"><Input name="oe_axis" type="number" placeholder="0" /></Field>
                <Field label="Adição"><Input name="oe_add" step="0.25" placeholder="0.00" /></Field>
              </div>
              <Field label="Observações">
                <Textarea name="notes" rows={2} />
              </Field>
              <Button type="submit">Salvar receita</Button>
            </form>
          </Card>
        </div>
      )}

      {/* ======================== BENEFÍCIOS ======================== */}
      {tab === "beneficios" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Benefícios" subtitle={`Saldo disponível: ${brl(saldo)}`} />
            {benefits.length === 0 ? (
              <div className="p-5"><Empty>Nenhum benefício registrado.</Empty></div>
            ) : (
              <div className="divide-y divide-slate-100">
                {benefits.map((b) => {
                  const state = benefitState(b);
                  const tone: Record<string, "green" | "amber" | "red" | "slate"> = {
                    disponivel: "green", futuro: "amber", expirado: "red", utilizado: "slate",
                  };
                  return (
                    <div key={b.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{b.name}</div>
                        <Badge tone={tone[state] ?? "slate"}>
                          {state === "disponivel" ? "Disponível" : state === "futuro" ? "Em carência" : state === "expirado" ? "Expirado" : "Utilizado"}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {b.kind} · Restante: {brl(b.remaining_cents)} / {brl(b.initial_cents)} · Válido até {date(b.expires_at)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Conceder benefício */}
          <Card>
            <CardHeader title="Conceder benefício" />
            <form action={async (fd: FormData): Promise<void> => { "use server"; await concederBeneficio(fd); }} className="grid gap-3 p-5">
              <input type="hidden" name="customer_id" value={id} />
              <Field label="Tipo">
                <Select name="kind" defaultValue="presente">
                  <option value="presente">Presente (uso único)</option>
                  <option value="cupom">Cupom (uso único)</option>
                  <option value="cashback">Cashback (saldo parcial)</option>
                  <option value="credito">Crédito em R$ (admin)</option>
                </Select>
              </Field>
              <Field label="Valor (R$)">
                <Input name="amount" placeholder="0,00" required />
              </Field>
              <Field label="Validade (dias)" hint="A partir de hoje">
                <Input name="valid_days" type="number" defaultValue="90" min="1" />
              </Field>
              <Field label="Motivo *">
                <Input name="reason" placeholder="Ex.: Brinde de aniversário, ajuste de cortesia…" required />
              </Field>
              <Button type="submit">Conceder benefício</Button>
            </form>
          </Card>
        </div>
      )}

      {/* ======================== CRM ======================== */}
      {tab === "crm" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Oportunidades" />
            {opportunities.length === 0 ? (
              <div className="p-5"><Empty>Nenhuma oportunidade registrada.</Empty></div>
            ) : (
              <div className="divide-y divide-slate-100">
                {opportunities.map((o) => (
                  <div key={o.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone="blue">{o.kind}</Badge>
                      <Badge tone={o.status === "convertida" ? "green" : o.status === "perdida" ? "red" : "slate"}>
                        {o.status}
                      </Badge>
                    </div>
                    {o.note && <div className="mt-1 text-sm text-slate-600">{o.note}</div>}
                    <div className="mt-0.5 text-xs text-slate-400">{dateTime(o.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Registrar atendimento" />
            <form action={registrarAtendimento} className="grid gap-3 p-5">
              <input type="hidden" name="customer_id" value={id} />
              <Field label="Status">
                <Select name="status" defaultValue="em_contato">
                  <option value="nova">Nova</option>
                  <option value="em_contato">Em contato</option>
                  <option value="agendado">Agendado</option>
                  <option value="convertida">Convertida</option>
                  <option value="perdida">Perdida</option>
                </Select>
              </Field>
              <Field label="Observação">
                <Textarea name="note" rows={3} placeholder="Descreva o atendimento…" />
              </Field>
              <Button type="submit">Registrar</Button>
            </form>
          </Card>
        </div>
      )}

      {/* ======================== DADOS ======================== */}
      {tab === "dados" && (
        <Card className="max-w-2xl">
          <CardHeader title="Dados cadastrais" />
          <form action={async (fd: FormData): Promise<void> => {
            "use server";
            const { salvarCliente } = await import("@/app/actions/clientes");
            await salvarCliente(undefined, fd);
          }} className="grid gap-4 p-5 sm:grid-cols-2">
            <input type="hidden" name="id" value={id} />
            <Field label="Nome completo *" className="col-span-full">
              <Input name="name" defaultValue={customer.name} required />
            </Field>
            <Field label="CPF">
              <Input name="cpf" defaultValue={customer.cpf ?? ""} />
            </Field>
            <Field label="Data de nascimento">
              <Input name="birth" type="date" defaultValue={customer.birth ?? ""} />
            </Field>
            <Field label="Gênero">
              <Select name="gender" defaultValue={customer.gender ?? ""}>
                <option value="">Não informado</option>
                <option value="F">Feminino</option>
                <option value="M">Masculino</option>
                <option value="O">Outro</option>
              </Select>
            </Field>
            <Field label="Profissão">
              <Input name="profession" defaultValue={customer.profession ?? ""} />
            </Field>
            <Field label="WhatsApp / Telefone">
              <Input name="phone" defaultValue={customer.phone ?? ""} />
            </Field>
            <Field label="E-mail">
              <Input name="email" type="email" defaultValue={customer.email ?? ""} />
            </Field>
            <Field label="Endereço" className="col-span-full">
              <Input name="address" defaultValue={customer.address ?? ""} />
            </Field>
            <Field label="Cidade">
              <Input name="city" defaultValue={customer.city ?? ""} />
            </Field>
            <Field label="Convênio">
              <Select name="insurer_id" defaultValue={customer.insurer_id ?? ""}>
                <option value="">Sem convênio</option>
                {insurers.map((ins) => <option key={ins.id} value={ins.id}>{ins.name}</option>)}
              </Select>
            </Field>
            <Field label="Observações" className="col-span-full">
              <Textarea name="notes" defaultValue={customer.notes ?? ""} />
            </Field>
            <div className="col-span-full border-t border-slate-100 pt-4">
              <div className="mb-2 text-sm font-medium text-slate-700">Consentimentos LGPD</div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="consent_program" defaultChecked={customer.consent_program} className="size-4 rounded" />
                Participação no programa de fidelidade (obrigatório)
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" name="consent_marketing" defaultChecked={customer.consent_marketing} className="size-4 rounded" />
                Marketing e comunicações (opcional)
              </label>
            </div>
            <div className="col-span-full flex gap-2">
              <Button type="submit">Salvar alterações</Button>
              {/* Alterar nível manualmente */}
              <form action={alterarNivel} className="flex items-center gap-2">
                <input type="hidden" name="id" value={id} />
                <Select name="level" defaultValue={customer.level} className="w-36">
                  {(["Novo", "Silver", "Gold", "Black", "VIP"] as const).map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </Select>
                <Button type="submit" variant="secondary">Alterar nível</Button>
              </form>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
