import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/session";
import { buildReport, csvCell, isReportKey, resolveFilters } from "@/lib/gestao/reports";
import { toCsv } from "@/lib/gestao/util";

export async function GET(req: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  if (user.role !== "admin" && !user.permissions.includes("relatorios"))
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  const { tipo } = await params;
  if (!isReportKey(tipo)) return NextResponse.json({ erro: "Relatório inexistente" }, { status: 404 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const filters = resolveFilters(user, sp, user.store_id);
  const r = await buildReport(tipo, filters);
  const csv = toCsv([r.columns, ...r.rows.map((row) => row.map(csvCell)), ...(r.footer ? [r.footer.map(csvCell)] : [])]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-${tipo}-${filters.from}_a_${filters.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
