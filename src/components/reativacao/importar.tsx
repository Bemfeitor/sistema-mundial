"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { FileSpreadsheet, Upload } from "lucide-react";
import { importarReativacao } from "@/lib/reativacao/actions";
import {
  MAX_FILE_BYTES,
  MAX_ROWS,
  YEARS_LABEL,
  detectHeader,
  formatPhone,
  guessColumns,
  normalizePhone,
  parseYears,
  phoneValid,
  type Years,
} from "@/lib/reativacao/shared";
import { Badge, Button, Card, CardHeader, Field, Notice, Select, Stat, Table, Td } from "@/components/ui";

type Sheet = { name: string; rows: unknown[][] };
type Mapping = { name: number; phone: number; last: number; seller: number };
type Linha = {
  n: number;
  name: string;
  phone: string;
  years: Years | null;
  original: string;
  kind: "valido" | "alerta" | "erro";
  motivo: string;
  importar: boolean;
};
type Resultado = { criados: number; clientesNovos: number; repetidos: number; invalidos: number };

const cellText = (v: unknown) => (v instanceof Date ? v.toLocaleDateString("pt-BR") : String(v ?? "").trim());

export function ImportarReativacao({ filaPhones }: { filaPhones: string[] }) {
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [map, setMap] = useState<Mapping>({ name: -1, phone: -1, last: -1, seller: -1 });
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [lendo, setLendo] = useState(false);
  const [pending, start] = useTransition();
  const fila = useMemo(() => new Set(filaPhones), [filaPhones]);

  const applySheet = (list: Sheet[], idx: number) => {
    const rows = list[idx]?.rows ?? [];
    const h = detectHeader(rows);
    setSheetIdx(idx);
    setHeaderRow(Math.max(0, h));
    setMap(guessColumns(rows[Math.max(0, h)] ?? []));
    setAviso(h < 0 ? "Não encontramos o cabeçalho (colunas de nome e telefone). Confira a linha do cabeçalho e o mapeamento abaixo." : null);
  };

  async function onFile(file: File | undefined) {
    setErro(null);
    setResultado(null);
    setSheets([]);
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return setErro("Envie um arquivo .xlsx, .xls ou .csv.");
    if (file.size > MAX_FILE_BYTES) return setErro("Arquivo maior que 15 MB.");
    setLendo(true);
    try {
      const XLSX = await import("xlsx");
      const wb = /\.csv$/i.test(file.name)
        ? XLSX.read(await file.text(), { type: "string", cellDates: true })
        : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const list: Sheet[] = wb.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: true, defval: "", blankrows: false }),
      }));
      if (!list.some((s) => s.rows.length)) throw new Error("vazio");
      // aba com cabeçalho reconhecido; senão a primeira com dados
      const withHeader = list.findIndex((s) => detectHeader(s.rows) >= 0);
      setFileName(file.name);
      setSheets(list);
      applySheet(list, withHeader >= 0 ? withHeader : Math.max(0, list.findIndex((s) => s.rows.length)));
    } catch {
      setErro("Não foi possível ler a planilha. Verifique se o arquivo não está protegido ou corrompido.");
    } finally {
      setLendo(false);
    }
  }

  const sheet = sheets[sheetIdx];
  const header = sheet?.rows[headerRow] ?? [];
  const dataRows = useMemo(
    () => (sheet ? sheet.rows.slice(headerRow + 1).filter((r) => r.some((c) => cellText(c) !== "")) : []),
    [sheet, headerRow],
  );

  const linhas = useMemo<Linha[]>(() => {
    if (map.name < 0 || map.phone < 0) return [];
    const seen = new Set<string>();
    const now = new Date();
    return dataRows.map((r, i) => {
      const name = cellText(r[map.name]).replace(/\s+/g, " ");
      const phone = normalizePhone(r[map.phone]);
      const years = map.last >= 0 ? parseYears(r[map.last], now) : null;
      const original = map.seller >= 0 ? cellText(r[map.seller]) : "";
      const base = { n: headerRow + 2 + i, name, phone, years, original };
      if (!name) return { ...base, kind: "erro", motivo: "Nome em branco", importar: false };
      if (!phoneValid(phone)) return { ...base, kind: "erro", motivo: "Telefone inválido (precisa de DDD + número)", importar: false };
      if (seen.has(phone)) return { ...base, kind: "alerta", motivo: "Possível repetição no arquivo (não será importado)", importar: false };
      seen.add(phone);
      if (fila.has(phone)) return { ...base, kind: "alerta", motivo: "Já está na fila de reativação (não será duplicado)", importar: false };
      if (!years) return { ...base, kind: "alerta", motivo: "Faixa não identificada: entra como “4 anos ou mais”; revise na ficha", importar: true };
      return { ...base, kind: "valido", motivo: "", importar: true };
    });
  }, [dataRows, map, headerRow, fila]);

  const validos = linhas.filter((l) => l.kind === "valido").length;
  const alertas = linhas.filter((l) => l.kind === "alerta").length;
  const erros = linhas.filter((l) => l.kind === "erro").length;
  const aImportar = linhas.filter((l) => l.importar);
  const excedeu = dataRows.length > MAX_ROWS;

  function confirmar() {
    setErro(null);
    start(async () => {
      const r = await importarReativacao(
        aImportar.map((l) => ({ name: l.name, phone: l.phone, years: l.years, original: l.original || null })),
      );
      if ("error" in r && r.error) return setErro(r.error);
      if ("criados" in r) {
        setResultado({ criados: r.criados, clientesNovos: r.clientesNovos, repetidos: r.repetidos, invalidos: r.invalidos });
        setSheets([]);
        setFileName("");
      }
    });
  }

  const colOptions = header.map((h, i) => ({ i, label: cellText(h) || `Coluna ${i + 1}` }));
  const mapField = (key: keyof Mapping, label: string, required = false) => (
    <Field label={label}>
      <Select value={map[key]} onChange={(e) => setMap({ ...map, [key]: Number(e.target.value) })}>
        <option value={-1}>{required ? "Selecione…" : "— não usar —"}</option>
        {colOptions.map((c) => (
          <option key={c.i} value={c.i}>
            {c.label}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <div className="space-y-6">
      {resultado && (
        <Notice tone="green">
          Fila criada: <strong>{resultado.criados}</strong> atendimento(s), {resultado.clientesNovos} cliente(s) novo(s) cadastrado(s) sem
          consentimento de marketing.
          {resultado.repetidos > 0 && <> {resultado.repetidos} já estavam na fila ou repetidos e não foram duplicados.</>}
          {resultado.invalidos > 0 && <> {resultado.invalidos} linha(s) inválida(s) ignorada(s).</>}{" "}
          <Link href="/crm/reativacao" className="font-semibold underline">
            Ir para a fila
          </Link>
        </Notice>
      )}
      {erro && <Notice tone="red">{erro}</Notice>}

      <Card>
        <CardHeader title="1. Arquivo" subtitle="Excel (.xlsx, .xls) ou CSV, até 15 MB e 1.000 clientes por importação" />
        <div className="p-5">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-brand-400 hover:bg-brand-50/40">
            <Upload className="size-6 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">{lendo ? "Lendo planilha…" : fileName || "Clique para escolher a planilha"}</span>
            <span className="text-xs text-slate-500">Precisa ter pelo menos as colunas de nome e telefone/WhatsApp.</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </Card>

      {sheet && (
        <Card>
          <CardHeader title="2. Mapeamento de colunas" subtitle="Detectamos a aba e o cabeçalho automaticamente; ajuste se precisar" />
          <div className="space-y-4 p-5">
            {aviso && <Notice tone="amber">{aviso}</Notice>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Aba">
                <Select value={sheetIdx} onChange={(e) => applySheet(sheets, Number(e.target.value))}>
                  {sheets.map((s, i) => (
                    <option key={s.name} value={i}>
                      {s.name} ({s.rows.length} linhas)
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Linha do cabeçalho">
                <Select
                  value={headerRow}
                  onChange={(e) => {
                    const h = Number(e.target.value);
                    setHeaderRow(h);
                    setMap(guessColumns(sheet.rows[h] ?? []));
                  }}
                >
                  {sheet.rows.slice(0, 30).map((r, i) => (
                    <option key={i} value={i}>
                      Linha {i + 1}: {r.map(cellText).filter(Boolean).slice(0, 4).join(" · ").slice(0, 60)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {mapField("name", "Nome *", true)}
              {mapField("phone", "WhatsApp *", true)}
              {mapField("last", "Última compra/visita")}
              {mapField("seller", "Vendedor original")}
            </div>
            <p className="text-xs text-slate-500">
              “Última compra/visita” aceita data (dd/mm/aaaa), ano, número de anos ou data do Excel e vira a faixa: até 1 ano, 2, 3 ou 4 anos ou mais.
            </p>
          </div>
        </Card>
      )}

      {sheet && (map.name < 0 || map.phone < 0) && <Notice tone="amber">Selecione as colunas de nome e WhatsApp para ver a prévia.</Notice>}

      {linhas.length > 0 && (
        <Card>
          <CardHeader
            title="3. Prévia"
            subtitle={`${dataRows.length} linha(s) lidas de “${sheet?.name}”`}
            action={
              <Button onClick={confirmar} disabled={pending || excedeu || !aImportar.length}>
                <FileSpreadsheet className="size-4" />
                {pending ? "Criando fila…" : `Criar fila com ${aImportar.length} cliente(s)`}
              </Button>
            }
          />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Stat label="Válidos" value={validos} tone="good" />
            <Stat label="Com alerta" value={alertas} tone={alertas ? "warn" : "default"} />
            <Stat label="Com erro" value={erros} tone={erros ? "bad" : "default"} hint="Não serão importados" />
          </div>
          {excedeu && (
            <div className="px-5 pb-4">
              <Notice tone="red">A planilha tem {dataRows.length} linhas. O limite é {MAX_ROWS} por importação: divida o arquivo.</Notice>
            </div>
          )}
          <div className="px-5 pb-2">
            <Notice tone="blue">
              Importar não envia nada. Clientes que ainda não estão na base serão cadastrados sem cashback e sem consentimento de marketing.
            </Notice>
          </div>
          <Table head={["Linha", "Nome", "WhatsApp", "Faixa", "Vendedor original", "Situação"]}>
            {linhas.slice(0, 200).map((l) => (
              <tr key={l.n}>
                <Td className="text-xs text-slate-400">{l.n}</Td>
                <Td className="font-medium">{l.name || "—"}</Td>
                <Td className="whitespace-nowrap">{phoneValid(l.phone) ? formatPhone(l.phone) : l.phone || "—"}</Td>
                <Td className="whitespace-nowrap text-xs">{l.years ? YEARS_LABEL[l.years] : "—"}</Td>
                <Td className="text-xs">{l.original || "—"}</Td>
                <Td>
                  {l.kind === "valido" ? (
                    <Badge tone="green">Válido</Badge>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <Badge tone={l.kind === "erro" ? "red" : "amber"} className="w-fit">
                        {l.kind === "erro" ? "Erro" : "Alerta"}
                      </Badge>
                      <span className="text-xs text-slate-500">{l.motivo}</span>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
          {linhas.length > 200 && <p className="px-5 py-3 text-xs text-slate-500">Mostrando as 200 primeiras linhas.</p>}
        </Card>
      )}
    </div>
  );
}
