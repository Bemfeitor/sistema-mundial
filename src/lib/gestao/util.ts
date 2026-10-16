// Utilitários puros do módulo de Gestão (sem dependências de servidor).
import { todayYmd } from "@/lib/format";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export type SP = Record<string, string | string[] | undefined>;

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] ?? "" : v ?? "");

export const TZ = "America/Sao_Paulo";
/** Data local (São Paulo) YYYY-MM-DD de um ISO. */
export const localYmd = (iso: string) =>
  iso.length === 10 ? iso : new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });

export const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const diffDays = (a: string, b: string) =>
  Math.round((new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 864e5);

export const daysInMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]}/${y}`;
};

export const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0);
export const pctOf = (a: number, b: number) => (b ? (a / b) * 100 : 0);

export function groupBy<T>(a: T[], k: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of a) {
    const key = k(x);
    const arr = m.get(key);
    if (arr) arr.push(x);
    else m.set(key, [x]);
  }
  return m;
}
export const mapBy = <T extends { id: string }>(a: T[]) => new Map(a.map((x) => [x.id, x]));

export type Period = "hoje" | "semana" | "mes" | "ano";
export const PERIODS: { key: Period; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
  { key: "ano", label: "Ano" },
];

export function periodRange(p: Period, today = todayYmd()) {
  if (p === "hoje") return { from: today, to: today };
  if (p === "semana") {
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = domingo
    return { from: addDays(today, -((dow + 6) % 7)), to: today };
  }
  if (p === "ano") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export const dayList = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
};

/** Intervalo de datas a partir de ?de=&ate= (padrão: mês corrente). */
export function rangeFrom(sp: SP) {
  const today = todayYmd();
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const de = one(sp.de), ate = one(sp.ate);
  return {
    from: re.test(de) ? de : `${today.slice(0, 7)}-01`,
    to: re.test(ate) ? ate : today,
  };
}

/** Status efetivo de título financeiro (vencido calculado pela data). */
export function finStatus(
  r: { status: string; due_at: string; amount_cents: number; paid_cents: number },
  today = todayYmd(),
): "aberto" | "pago" | "vencido" | "cancelado" {
  if (r.status === "cancelado") return "cancelado";
  if (r.status === "pago" || r.paid_cents >= r.amount_cents) return "pago";
  return r.due_at < today ? "vencido" : "aberto";
}
export const openAmount = (r: { amount_cents: number; paid_cents: number }) => Math.max(0, r.amount_cents - r.paid_cents);

export const LAB_DONE = ["pronto", "cliente_avisado", "entregue"];
export const labLate = (o: { status: string; due_at?: string | null }, today = todayYmd()) =>
  !LAB_DONE.includes(o.status) && o.status !== "cancelado" && !!o.due_at && o.due_at < today;

/** CSV com ";" (padrão Excel pt-BR) e BOM UTF-8. */
export function toCsv(rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}

/** Lê CSV simples (separador ; ou , detectado pela 1ª linha; aspas suportadas). */
export function parseCsv(text: string): string[][] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  return lines.map((line) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === sep) { out.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    out.push(cur.trim());
    return out;
  });
}

export const CATEGORY_KEYS = ["armacao", "lente", "solar", "lente_contato", "acessorio", "servico"] as const;
