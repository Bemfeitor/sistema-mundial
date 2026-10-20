import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/session";
import { dateTime } from "@/lib/format";
import { toCsv } from "@/lib/gestao/util";
import { filtrosRelatorio, relatorioReativacao } from "@/lib/reativacao/server";

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  const can = (p: "crm" | "relatorios" | "consolidado") => user.role === "admin" || user.permissions.includes(p);
  if (!can("crm") && !can("relatorios")) return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const f = filtrosRelatorio({ store_id: user.store_id, consolidado: can("consolidado") }, sp, null);
  const { linhas } = await relatorioReativacao(f);
  const csv = toCsv([
    ["Data", "Cliente", "Telefone", "Faixa", "Situação", "Resultado", "Responsável", "Envios"],
    ...linhas.map((l) => [dateTime(l.data), l.cliente, l.telefone, l.faixa, l.situacao, l.resultado, l.responsavel, l.envios]),
  ]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-reativacao-${f.periodo}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
