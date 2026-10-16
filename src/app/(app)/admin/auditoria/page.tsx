import { Badge, Card, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { FilterBar } from "@/components/gestao/kit";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { TABLES } from "@/lib/types";
import { localYmd, one, type SearchParams } from "@/lib/gestao/util";

const json = (v: unknown) => (v == null ? "—" : JSON.stringify(v, null, 2));

/** Campos alterados entre antes e depois. */
function changedKeys(before: unknown, after: unknown) {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return [];
  const b = before as Record<string, unknown>, a = after as Record<string, unknown>;
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => k !== "updated_at" && JSON.stringify(b[k]) !== JSON.stringify(a[k]));
}

export default async function Auditoria({ searchParams }: { searchParams: SearchParams }) {
  await requireUser("administrar");
  const sp = await searchParams;
  const table = one(sp.tabela), action = one(sp.acao).toLowerCase(), actor = one(sp.usuario), source = one(sp.origem), de = one(sp.de), ate = one(sp.ate);
  const [logs, employees] = await Promise.all([
    db().list("audit_log", {
      eq: { ...(table ? { table_name: table } : {}), ...(actor ? { actor_id: actor } : {}), ...(source ? { source } : {}) },
      order: { column: "created_at", ascending: false },
      limit: 1000,
    }),
    db().list("employees", { order: { column: "name" } }),
  ]);
  const rows = logs
    .filter((l) => !action || l.action.toLowerCase().includes(action))
    .filter((l) => (!de || localYmd(l.created_at) >= de) && (!ate || localYmd(l.created_at) <= ate))
    .slice(0, 300);
  const actions = [...new Set(logs.map((l) => l.action))].sort();

  return (
    <div>
      <PageHeader title="Auditoria" subtitle="Quem fez o quê, quando e por onde (aplicativo ou agente de IA)" />
      <FilterBar>
        <Field label="Tabela">
          <Select name="tabela" defaultValue={table}>
            <option value="">Todas</option>
            {TABLES.filter((t) => t !== "audit_log").map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Ação">
          <Input name="acao" defaultValue={one(sp.acao)} list="acoes" placeholder="criar, alterar…" />
          <datalist id="acoes">{actions.map((a) => <option key={a} value={a} />)}</datalist>
        </Field>
        <Field label="Usuário">
          <Select name="usuario" defaultValue={actor}>
            <option value="">Todos</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field label="Origem">
          <Select name="origem" defaultValue={source}>
            <option value="">Todas</option>
            <option value="app">Aplicativo</option>
            <option value="agente">Agente de IA</option>
            <option value="sistema">Sistema</option>
          </Select>
        </Field>
        <Field label="De"><Input type="date" name="de" defaultValue={de} /></Field>
        <Field label="Até"><Input type="date" name="ate" defaultValue={ate} /></Field>
      </FilterBar>
      <Card>
        <Table head={["Quando", "Usuário", "Origem", "Ação", "Tabela / registro", "Antes / depois"]} empty="Nenhum registro de auditoria para os filtros.">
          {rows.map((l) => {
            const keys = changedKeys(l.before_data, l.after_data);
            return (
              <tr key={l.id} className="align-top">
                <Td className="whitespace-nowrap text-xs">{dateTime(l.created_at)}</Td>
                <Td className="text-sm">{l.actor_name}</Td>
                <Td><Badge tone={l.source === "agente" ? "violet" : l.source === "sistema" ? "slate" : "blue"}>{l.source === "agente" ? "Agente" : l.source === "sistema" ? "Sistema" : "App"}</Badge></Td>
                <Td className="text-sm font-medium">{l.action}</Td>
                <Td className="text-xs">
                  <div className="font-mono">{l.table_name}</div>
                  <div className="font-mono text-slate-400">{l.record_id?.slice(0, 8) ?? ""}</div>
                </Td>
                <Td className="min-w-72">
                  {keys.length > 0 && <div className="mb-1 text-xs text-slate-600">Alterado: {keys.slice(0, 8).join(", ")}{keys.length > 8 ? "…" : ""}</div>}
                  <details>
                    <summary className="cursor-pointer text-xs text-brand-700">Ver JSON</summary>
                    <div className="mt-2 grid gap-2 lg:grid-cols-2">
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Antes</div>
                        <pre className="max-h-72 max-w-md overflow-auto rounded bg-slate-50 p-2 text-[11px] leading-snug">{json(l.before_data)}</pre>
                      </div>
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Depois</div>
                        <pre className="max-h-72 max-w-md overflow-auto rounded bg-slate-50 p-2 text-[11px] leading-snug">{json(l.after_data)}</pre>
                      </div>
                    </div>
                  </details>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
      <p className="mt-2 text-xs text-slate-500">Exibindo até 300 registros mais recentes.</p>
    </div>
  );
}
