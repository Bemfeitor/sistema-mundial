import type { ReactNode } from "react";
import { Notice, cn } from "@/components/ui";
import { one, type SP } from "@/lib/gestao/util";

/** Mensagem pós-ação (?ok= / ?erro=). */
export function Flash({ sp }: { sp: SP }) {
  const ok = one(sp.ok), erro = one(sp.erro);
  if (!ok && !erro) return null;
  return (
    <div className="mb-4">
      <Notice tone={erro ? "red" : "green"}>{erro || ok}</Notice>
    </div>
  );
}

export function Progress({ value, max, className }: { value: number; max: number; className?: string }) {
  const p = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const tone = p >= 100 ? "bg-emerald-500" : p >= 70 ? "bg-brand-600" : p >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className={cn("h-2.5 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${p}%` }} />
    </div>
  );
}

/** Barras horizontais simples (ranking / mix). */
export function HBars({ items, format }: { items: { label: string; value: number; hint?: string }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((a, i) => a + i.value, 0);
  if (!items.length) return <p className="px-5 py-6 text-center text-sm text-slate-500">Sem dados no período.</p>;
  return (
    <ul className="space-y-3 px-5 py-4">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-slate-700">{i.label}</span>
            <span className="shrink-0 font-medium text-slate-900">
              {format(i.value)}
              <span className="ml-1.5 text-xs font-normal text-slate-500">{total ? Math.round((i.value / total) * 100) : 0}%</span>
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-brand-600" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
          {i.hint && <div className="mt-0.5 text-xs text-slate-500">{i.hint}</div>}
        </li>
      ))}
    </ul>
  );
}

const SERIES_FILL = ["fill-brand-600", "fill-gold-400", "fill-emerald-500", "fill-violet-500"];
const SERIES_BG = ["bg-brand-600", "bg-gold-400", "bg-emerald-500", "bg-violet-500"];

/** Gráfico de barras agrupadas em SVG puro. */
export function GroupedBars({
  labels,
  series,
  format,
  height = 220,
}: {
  labels: string[];
  series: { name: string; values: number[] }[];
  format: (n: number) => string;
  height?: number;
}) {
  const W = 760, H = height, padL = 64, padB = 26, padT = 10, padR = 8;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const nice = niceMax(max);
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const groupW = plotW / Math.max(1, labels.length);
  const barW = Math.max(2, Math.min(18, (groupW * 0.8) / Math.max(1, series.length)));
  const every = Math.ceil(labels.length / 16);
  return (
    <div className="px-3 py-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Gráfico de barras">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padT + plotH * (1 - t);
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} className="stroke-slate-200" strokeWidth={1} />
              <text x={padL - 6} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
                {format(nice * t)}
              </text>
            </g>
          );
        })}
        {labels.map((l, gi) => {
          const gx = padL + gi * groupW + (groupW - barW * series.length) / 2;
          return (
            <g key={l + gi}>
              {series.map((s, si) => {
                const v = s.values[gi] ?? 0;
                const h = (v / nice) * plotH;
                return (
                  <rect key={s.name} x={gx + si * barW} y={padT + plotH - h} width={barW - 1} height={Math.max(0, h)} rx={2} className={SERIES_FILL[si % SERIES_FILL.length]}>
                    <title>{`${s.name} · ${l}: ${format(v)}`}</title>
                  </rect>
                );
              })}
              {gi % every === 0 && (
                <text x={padL + gi * groupW + groupW / 2} y={H - 8} textAnchor="middle" className="fill-slate-500 text-[10px]">
                  {l}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 px-2 text-xs text-slate-600">
        {series.map((s, i) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", SERIES_BG[i % SERIES_BG.length])} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Formulário GET de filtros. */
export function FilterBar({ children, action }: { children: ReactNode; action?: string }) {
  return (
    <form method="get" action={action} className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      {children}
      <button className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">Filtrar</button>
    </form>
  );
}

export const compactBrl = (cents: number) => {
  const v = cents / 100;
  if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
};
