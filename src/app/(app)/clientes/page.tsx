import Link from "next/link";
import { Search, UserPlus } from "lucide-react";
import { requireUser, storeFilter } from "@/lib/session";
import { db } from "@/lib/db";
import { availableBalance } from "@/lib/fidelidade";
import { brl, date } from "@/lib/format";
import { PageHeader, LinkButton, Table, Td, Badge, Card, Input, Select } from "@/components/ui";
import type { Customer } from "@/lib/types";

const LEVELS: Record<Customer["level"], "slate" | "blue" | "green" | "amber" | "violet"> = {
  Novo: "slate",
  Silver: "blue",
  Gold: "amber",
  Black: "violet",
  VIP: "green",
};

export default async function ClientesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const ctx = await requireUser("clientes");

  const q = sp.q as string | undefined;
  const nivel = sp.nivel as string | undefined;
  const filtro = sp.filtro as string | undefined;

  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(5, 7);
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const ago12m = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);

  let customers = await db().list("customers", {
    ...(q
      ? { search: { columns: ["name", "cpf", "phone"], term: q } }
      : { eq: storeFilter(ctx) }),
    order: { column: "name" },
    limit: 200,
  });

  // Filtros especiais
  if (filtro === "aniversariantes") {
    customers = customers.filter((c) => c.birth?.slice(5, 7) === thisMonth);
  } else if (filtro === "receita_vencendo") {
    const rxs = await db().list("prescriptions");
    const ids = new Set(
      rxs.filter((r) => r.valid_until && r.valid_until >= today && r.valid_until <= in30).map((r) => r.customer_id),
    );
    customers = customers.filter((c) => ids.has(c.id));
  } else if (filtro === "receita_vencida") {
    const rxs = await db().list("prescriptions");
    const ids = new Set(rxs.filter((r) => r.valid_until && r.valid_until < today).map((r) => r.customer_id));
    customers = customers.filter((c) => ids.has(c.id));
  } else if (filtro === "sem_compra") {
    customers = customers.filter(
      (c) => !c.last_purchase_at || c.last_purchase_at < ago12m,
    );
  }

  if (nivel) customers = customers.filter((c) => c.level === nivel);

  // Saldo cashback por cliente (apenas até 50 clientes por performance)
  const saldos = new Map<string, number>();
  for (const c of customers.slice(0, 50)) {
    saldos.set(c.id, await availableBalance(c.id));
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle={`${customers.length} registros`}
        actions={
          <LinkButton href="/clientes/novo">
            <UserPlus className="size-4" />
            Novo cliente
          </LinkButton>
        }
      />

      {/* Filtros */}
      <Card className="mb-4 flex flex-wrap items-end gap-3 px-4 py-3">
        <form className="flex flex-1 flex-wrap items-end gap-3" method="GET">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={q} placeholder="Nome, CPF ou WhatsApp…" className="pl-8" />
          </div>
          <Select name="nivel" defaultValue={nivel ?? ""} className="w-36">
            <option value="">Todos os níveis</option>
            {(["Novo", "Silver", "Gold", "Black", "VIP"] as const).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
          <Select name="filtro" defaultValue={filtro ?? ""} className="w-52">
            <option value="">Sem filtro especial</option>
            <option value="aniversariantes">Aniversariantes do mês</option>
            <option value="receita_vencendo">Receita vencendo em 30 dias</option>
            <option value="receita_vencida">Receita vencida</option>
            <option value="sem_compra">Sem compra há 12 meses</option>
          </Select>
          <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Filtrar
          </button>
          {(q || nivel || filtro) && (
            <Link href="/clientes" className="text-sm text-slate-500 hover:underline">
              Limpar
            </Link>
          )}
        </form>
      </Card>

      <Card>
        <Table
          head={["Nome", "CPF", "Telefone", "Nível", "Última compra", "Saldo cashback", ""]}
          empty="Nenhum cliente encontrado."
        >
          {customers.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <Td className="font-medium">
                <Link href={`/clientes/${c.id}`} className="hover:text-brand-700 hover:underline">
                  {c.name}
                </Link>
                {c.birth && new Date(c.birth + "T12:00:00").getMonth() + 1 === Number(thisMonth) && (
                  <span className="ml-1 text-xs">🎂</span>
                )}
              </Td>
              <Td className="text-slate-500">{c.cpf ? c.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "—"}</Td>
              <Td className="text-slate-500">{c.phone || "—"}</Td>
              <Td>
                <Badge tone={LEVELS[c.level]}>{c.level}</Badge>
              </Td>
              <Td className="text-slate-500">{date(c.last_purchase_at)}</Td>
              <Td>
                {(saldos.get(c.id) ?? 0) > 0 ? (
                  <span className="font-semibold text-emerald-700">{brl(saldos.get(c.id))}</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </Td>
              <Td>
                <Link href={`/clientes/${c.id}`} className="text-sm text-brand-600 hover:underline">
                  Ver
                </Link>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
