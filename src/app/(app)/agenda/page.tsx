import { requireUser, storeFilter } from "@/lib/session";
import { db } from "@/lib/db";
import { todayYmd, date } from "@/lib/format";
import { PageHeader, Card, CardHeader, Badge, Table, Td, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { salvarAgendamento, atualizarStatusAgendamento } from "@/app/actions/clientes";
import type { Appointment } from "@/lib/types";

const STATUS_BADGE: Record<Appointment["status"], { label: string; tone: "blue" | "green" | "slate" | "red" | "amber" }> = {
  agendado: { label: "Agendado", tone: "blue" },
  confirmado: { label: "Confirmado", tone: "green" },
  realizado: { label: "Realizado", tone: "slate" },
  faltou: { label: "Faltou", tone: "red" },
  cancelado: { label: "Cancelado", tone: "red" },
};

const KIND_LABEL: Record<Appointment["kind"], string> = {
  exame: "Exame de vista",
  ajuste: "Ajuste de óculos",
  entrega: "Entrega",
  adaptacao_lc: "Adaptação LC",
};

export default async function AgendaPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const ctx = await requireUser("clientes");

  const today = todayYmd();
  const dia = (sp.dia as string) || today;
  const clienteId = sp.cliente as string | undefined;

  const [appointments, employees, stores, customers] = await Promise.all([
    db().list("appointments", {
      eq: storeFilter(ctx),
      order: { column: "starts_at" },
    }),
    db().list("employees", { eq: { role: "optometrista" as never } }),
    db().list("stores", { eq: { active: true } }),
    db().list("customers", { eq: storeFilter(ctx), order: { column: "name" }, limit: 500 }),
  ]);

  const doDia = appointments.filter((a) => a.starts_at.slice(0, 10) === dia);

  // Dias da semana (7 dias a partir de hoje)
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  return (
    <div>
      <PageHeader title="Agenda de Exames e Atendimentos" />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Lista do dia */}
        <div className="lg:col-span-2">
          {/* Seletor de dia */}
          <div className="mb-3 flex flex-wrap gap-2">
            {dias.map((d) => (
              <a
                key={d}
                href={`/agenda?dia=${d}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  d === dia
                    ? "bg-brand-600 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
              </a>
            ))}
          </div>

          <Card>
            <CardHeader title={`Agenda — ${new Date(dia + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}`} subtitle={`${doDia.length} agendamentos`} />
            <Table
              head={["Hora", "Cliente", "Tipo", "Profissional", "Status", "Ações"]}
              empty="Nenhum agendamento para este dia."
            >
              {doDia.map((a) => {
                const hora = a.starts_at.slice(11, 16);
                const prof = employees.find((e) => e.id === a.professional_id);
                const { label, tone } = STATUS_BADGE[a.status];
                return (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <Td className="font-mono text-sm">{hora}</Td>
                    <Td>
                      <div className="font-medium text-sm">{a.customer_name}</div>
                      {a.phone && <div className="text-xs text-slate-500">{a.phone}</div>}
                    </Td>
                    <Td className="text-sm">{KIND_LABEL[a.kind]}</Td>
                    <Td className="text-sm text-slate-500">{prof?.name ?? "—"}</Td>
                    <Td><Badge tone={tone}>{label}</Badge></Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {a.status === "agendado" && (
                          <form action={atualizarStatusAgendamento}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="status" value="confirmado" />
                            <button type="submit" className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100">Confirmar</button>
                          </form>
                        )}
                        {(a.status === "agendado" || a.status === "confirmado") && (
                          <>
                            <form action={atualizarStatusAgendamento}>
                              <input type="hidden" name="id" value={a.id} />
                              <input type="hidden" name="status" value="realizado" />
                              <button type="submit" className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200">Realizado</button>
                            </form>
                            <form action={atualizarStatusAgendamento}>
                              <input type="hidden" name="id" value={a.id} />
                              <input type="hidden" name="status" value="faltou" />
                              <button type="submit" className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700 hover:bg-red-100">Faltou</button>
                            </form>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        </div>

        {/* Formulário de agendamento */}
        <div>
          <Card>
            <CardHeader title="Novo agendamento" />
            <form action={async (fd: FormData): Promise<void> => { "use server"; await salvarAgendamento(undefined, fd); }} className="grid gap-3 p-5">
              <Field label="Cliente (pesquise pelo nome)">
                <Select name="customer_id" defaultValue={clienteId ?? ""}>
                  <option value="">Sem vínculo</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Nome do cliente *">
                <Input name="customer_name" required placeholder="Nome para o agendamento" />
              </Field>
              <Field label="Telefone">
                <Input name="phone" placeholder="(43) 99999-9999" />
              </Field>
              <Field label="Loja">
                <Select name="store_id" defaultValue={ctx.storeId ?? ctx.user.store_id}>
                  {stores
                    .filter((s) => !ctx.storeId || s.id === ctx.storeId)
                    .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="Data e hora *">
                <Input name="starts_at" type="datetime-local" required defaultValue={`${dia}T09:00`} />
              </Field>
              <Field label="Tipo">
                <Select name="kind" defaultValue="exame">
                  <option value="exame">Exame de vista</option>
                  <option value="ajuste">Ajuste de óculos</option>
                  <option value="entrega">Entrega</option>
                  <option value="adaptacao_lc">Adaptação de lente de contato</option>
                </Select>
              </Field>
              <Field label="Profissional">
                <Select name="professional_id" defaultValue="">
                  <option value="">Não definido</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </Select>
              </Field>
              <Field label="Observações">
                <Textarea name="note" rows={2} />
              </Field>
              <Button type="submit">Agendar</Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
