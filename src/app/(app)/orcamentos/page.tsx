import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Badge, Card, LinkButton, PageHeader, Stat, Table, Tabs, Td } from "@/components/ui";
import { requireUser, storeFilter } from "@/lib/session";
import { db } from "@/lib/db";
import { brl, dateTime, label } from "@/lib/format";
import type { Quote } from "@/lib/types";

export const metadata = { title: "Orçamentos" };

const STATUS: Record<Quote["status"], { rotulo: string; tom: "blue" | "green" | "red" }> = {
  aberto: { rotulo: "Aberto", tom: "blue" },
  convertido: { rotulo: "Convertido", tom: "green" },
  perdido: { rotulo: "Perdido", tom: "red" },
};

export default async function OrcamentosPage(props: PageProps<"/orcamentos">) {
  const ctx = await requireUser("vender");
  const q = await props.searchParams;
  const status = typeof q.status === "string" && q.status in STATUS ? (q.status as Quote["status"]) : null;
  const d = db();
  const [todos, employees, stores] = await Promise.all([
    d.list("quotes", { eq: storeFilter(ctx), order: { column: "created_at", ascending: false }, limit: 500 }),
    d.list("employees"),
    Promise.resolve(ctx.stores),
  ]);
  const nome = new Map(employees.map((e) => [e.id, e.name]));
  const loja = new Map(stores.map((s) => [s.id, s.code]));
  const lista = status ? todos.filter((x) => x.status === status) : todos;
  const conta = (s: Quote["status"]) => todos.filter((x) => x.status === s);
  const convertidos = conta("convertido").length;
  const fechados = convertidos + conta("perdido").length;

  return (
    <>
      <PageHeader
        title="Orçamentos"
        subtitle="Atendimentos salvos no Balcão. Converta em venda ou registre a perda."
        actions={
          <LinkButton href="/atendimento">
            <Sparkles className="size-4" /> Novo atendimento
          </LinkButton>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Stat label="Em aberto" value={conta("aberto").length} hint={brl(conta("aberto").reduce((a, x) => a + x.total_cents, 0))} />
        <Stat label="Convertidos" value={convertidos} tone="good" />
        <Stat label="Perdidos" value={conta("perdido").length} tone="bad" />
        <Stat label="Taxa de conversão" value={fechados ? `${Math.round((convertidos / fechados) * 100)}%` : "—"} hint="entre orçamentos encerrados" />
      </div>
      <Tabs
        active={status ?? "todos"}
        items={[
          { key: "todos", label: `Todos (${todos.length})`, href: "/orcamentos" },
          ...(Object.keys(STATUS) as Quote["status"][]).map((s) => ({ key: s, label: `${STATUS[s].rotulo} (${conta(s).length})`, href: `/orcamentos?status=${s}` })),
        ]}
      />
      <Card>
        <Table head={["Data", "Cliente", "Vendedor", ...(ctx.storeId ? [] : ["Loja"]), "Pacote", "Itens", "Total", "Status"]} empty="Nenhum orçamento ainda. Salve um atendimento no Balcão.">
          {lista.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <Td className="whitespace-nowrap text-slate-500">
                <Link href={`/orcamentos/${o.id}`} className="hover:underline">
                  {dateTime(o.created_at)}
                </Link>
              </Td>
              <Td>
                <Link href={`/orcamentos/${o.id}`} className="font-medium text-brand-700 hover:underline">
                  {o.customer_name ?? "Cliente não identificado"}
                </Link>
              </Td>
              <Td>{nome.get(o.seller_id) ?? "—"}</Td>
              {!ctx.storeId && <Td>{loja.get(o.store_id) ?? "—"}</Td>}
              <Td>{o.package_tier ? label(o.package_tier) : "—"}</Td>
              <Td className="text-slate-500">{o.items.length}</Td>
              <Td className="font-semibold">{brl(o.total_cents)}</Td>
              <Td>
                <Badge tone={STATUS[o.status].tom}>{STATUS[o.status].rotulo}</Badge>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
