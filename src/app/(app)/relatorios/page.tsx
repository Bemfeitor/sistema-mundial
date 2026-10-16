import Link from "next/link";
import { Download } from "lucide-react";
import { Card, CardHeader, Field, Input, PageHeader, Select, Table, Td, cn } from "@/components/ui";
import { FilterBar } from "@/components/gestao/kit";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { REPORTS, buildReport, isReportKey, resolveFilters, showCell } from "@/lib/gestao/reports";
import { one, type SearchParams } from "@/lib/gestao/util";

export default async function Relatorios({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireUser("relatorios");
  const sp = await searchParams;
  const tipo = isReportKey(one(sp.tipo)) ? one(sp.tipo) : "vendas";
  if (!isReportKey(tipo)) return null;
  const f = resolveFilters(ctx.user, sp, ctx.storeId);
  const [report, employees] = await Promise.all([buildReport(tipo, f), db().list("employees", { order: { column: "name" } })]);
  const qs = new URLSearchParams({ de: f.from, ate: f.to, loja: f.storeId ?? "all", ...(f.sellerId ? { vendedor: f.sellerId } : {}) });
  const sellers = employees.filter((e) => e.role === "vendedor" || e.role === "gerente" || e.permissions.includes("vender"));
  const numericCol = (i: number) => report.rows.some((r) => typeof r[i] !== "string");

  return (
    <div>
      <PageHeader title="Relatórios" subtitle="Relatórios prontos com filtros e exportação para Excel (CSV)" />
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {REPORTS.map((r) => (
          <Link
            key={r.key}
            href={`/relatorios?tipo=${r.key}&${qs.toString()}`}
            className={cn("rounded-xl border bg-white p-3 shadow-sm transition hover:border-brand-500", r.key === tipo ? "border-brand-600 ring-2 ring-brand-100" : "border-slate-200")}
          >
            <div className="text-sm font-semibold text-slate-900">{r.label}</div>
            <div className="mt-0.5 text-xs text-slate-500">{r.desc}</div>
          </Link>
        ))}
      </div>
      <FilterBar>
        <input type="hidden" name="tipo" value={tipo} />
        <Field label="De"><Input type="date" name="de" defaultValue={f.from} /></Field>
        <Field label="Até"><Input type="date" name="ate" defaultValue={f.to} /></Field>
        {ctx.can("consolidado") && (
          <Field label="Loja">
            <Select name="loja" defaultValue={f.storeId ?? "all"}>
              <option value="all">Todas as lojas</option>
              {ctx.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Vendedor">
          <Select name="vendedor" defaultValue={f.sellerId ?? ""}>
            <option value="">Todos</option>
            {sellers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
      </FilterBar>
      <Card>
        <CardHeader
          title={report.title}
          subtitle={`${report.description} · ${f.from.split("-").reverse().join("/")} a ${f.to.split("-").reverse().join("/")} · ${report.rows.length} linhas`}
          action={
            <a href={`/api/relatorios/${tipo}?${qs.toString()}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
              <Download className="size-4" /> Exportar CSV
            </a>
          }
        />
        <Table head={report.columns} empty="Sem dados para os filtros escolhidos.">
          {report.rows.map((row, i) => (
            <tr key={i}>
              {row.map((c, j) => (
                <Td key={j} className={cn(numericCol(j) && "whitespace-nowrap text-right tabular-nums", typeof c === "string" && c.length > 60 && "max-w-md text-xs")}>
                  {showCell(c)}
                </Td>
              ))}
            </tr>
          ))}
          {report.footer && report.rows.length > 0 && (
            <tr className="bg-slate-50 font-semibold">
              {report.footer.map((c, j) => (
                <Td key={j} className={cn(numericCol(j) && "whitespace-nowrap text-right tabular-nums")}>{showCell(c)}</Td>
              ))}
            </tr>
          )}
        </Table>
      </Card>
    </div>
  );
}
