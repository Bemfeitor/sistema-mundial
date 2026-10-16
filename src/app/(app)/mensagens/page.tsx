import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { PageHeader, Card, CardHeader, Badge, Table, Td, Button, Notice } from "@/components/ui";
import { aprovarMensagem, cancelarMensagem, marcarEnviada } from "@/app/actions/clientes";
import type { Message } from "@/lib/types";

const STATUS_INFO: Record<
  Message["status"],
  { label: string; tone: "amber" | "green" | "slate" | "red" }
> = {
  para_validar: { label: "Para validar", tone: "amber" },
  aprovada: { label: "Aprovada", tone: "green" },
  enviada: { label: "Enviada", tone: "slate" },
  cancelada: { label: "Cancelada", tone: "red" },
};

export default async function MensagensPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const filtro = (sp.status as string) || "para_validar";

  const ctx = await requireUser("crm");

  const messages = await db().list("messages", {
    eq: filtro ? { status: filtro } : undefined,
    order: { column: "created_at", ascending: false },
    limit: 100,
  });

  const customers = await db().list("customers");
  const customerMap = new Map(customers.map((c) => [c.id, c]));

  return (
    <div>
      <PageHeader
        title="Fila de Mensagens"
        subtitle="Revisão e aprovação antes do envio"
      />

      {/* Envio real via API — futura integração */}
      <div className="mb-4">
        <Notice tone="amber">
          O envio de mensagens via API está reservado para integração futura. Use &quot;Abrir no WhatsApp&quot; para envio manual.
        </Notice>
      </div>

      {/* Filtros de status */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(["para_validar", "aprovada", "enviada", "cancelada", ""] as const).map((s) => (
          <Link
            key={s}
            href={s ? `/mensagens?status=${s}` : "/mensagens"}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              filtro === (s || "")
                ? "bg-brand-600 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s ? (STATUS_INFO[s as Message["status"]]?.label ?? s) : "Todas"}
          </Link>
        ))}
      </div>

      <Card>
        <Table
          head={["Cliente", "Canal", "Texto", "Status", "Data", "Ações"]}
          empty="Nenhuma mensagem encontrada."
        >
          {messages.map((msg) => {
            const customer = customerMap.get(msg.customer_id);
            const phone = customer?.phone?.replace(/\D/g, "") ?? "";
            const waLink = phone
              ? `https://wa.me/55${phone}?text=${encodeURIComponent(msg.text)}`
              : null;
            const { tone, label } = STATUS_INFO[msg.status];
            return (
              <tr key={msg.id} className="hover:bg-slate-50">
                <Td className="font-medium">
                  {customer ? (
                    <Link href={`/clientes/${customer.id}`} className="hover:text-brand-700 hover:underline">
                      {customer.name}
                    </Link>
                  ) : "—"}
                </Td>
                <Td><Badge tone="blue">{msg.channel}</Badge></Td>
                <Td className="max-w-xs">
                  <p className="line-clamp-2 text-sm text-slate-700">{msg.text}</p>
                </Td>
                <Td><Badge tone={tone}>{label}</Badge></Td>
                <Td className="text-xs text-slate-400">{dateTime(msg.created_at)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {msg.status === "para_validar" && (
                      <>
                        <form action={aprovarMensagem}>
                          <input type="hidden" name="id" value={msg.id} />
                          <button type="submit" className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100">
                            Aprovar
                          </button>
                        </form>
                        <form action={cancelarMensagem}>
                          <input type="hidden" name="id" value={msg.id} />
                          <button type="submit" className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700 hover:bg-red-100">
                            Cancelar
                          </button>
                        </form>
                      </>
                    )}
                    {msg.status === "aprovada" && (
                      <>
                        {waLink && (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700 hover:bg-brand-100"
                          >
                            Abrir no WhatsApp
                          </a>
                        )}
                        <form action={marcarEnviada}>
                          <input type="hidden" name="id" value={msg.id} />
                          <button type="submit" className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200">
                            Marcar enviada
                          </button>
                        </form>
                        <form action={cancelarMensagem}>
                          <input type="hidden" name="id" value={msg.id} />
                          <button type="submit" className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700 hover:bg-red-100">
                            Cancelar
                          </button>
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
  );
}
