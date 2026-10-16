"use client";
import { useMemo, useState } from "react";
import { cn } from "@/components/ui";
import {
  DEFAULTS,
  GRAUS,
  INDICES,
  crossSection,
  estimate,
  inside,
  mountedEdges,
  outline,
  parseNumber,
  validate,
  type ConfigLente,
  type Estimativa,
  type Formato,
  type Olho,
  type TipoArmacao,
} from "@/lib/balcao/espessura";

const OLHOS: Olho[] = ["OD", "OE"];
const f = (x: number, d = 1) => x.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const power = (x: number) => (x > 0 ? "+" : "") + f(x, 2);
const heat = (t: number) => `hsl(${192 - 150 * Math.max(0, Math.min(1, t))} 65% ${70 - 17 * t}%)`;
const TIPOS: Record<TipoArmacao, string> = { metal: "Metal (fio)", acetate: "Acetato", rimless: "Sem aro (parafusada)" };
const FORMATOS: Record<Formato, string> = { oval: "Oval", rectangle: "Retangular", round: "Redonda" };
const MIN_PADRAO: Record<TipoArmacao, number> = { metal: 1.5, rimless: 2, acetate: 1.5 };

type Form = Record<string, string>;

function formInicial(sph?: number | null): Form {
  const s = sph != null && sph >= -12 && sph <= 8 ? String(Math.round(sph * 4) / 4) : String(DEFAULTS.sphere);
  return {
    "OD.sphere": s,
    "OD.cylinder": "0",
    "OD.axis": "180",
    "OE.sphere": s,
    "OE.cylinder": "0",
    "OE.axis": "180",
    "OD.dnp": String(DEFAULTS.dnp),
    "OE.dnp": String(DEFAULTS.dnp),
    A: String(DEFAULTS.A),
    B: String(DEFAULTS.B),
    bridge: String(DEFAULTS.bridge),
    height: String(DEFAULTS.height),
    minimum: String(DEFAULTS.minimum),
    base: String(DEFAULTS.base),
    shape: DEFAULTS.shape,
    frame: DEFAULTS.frame,
  };
}

function ler(form: Form, eye: Olho): ConfigLente {
  const n = (k: string) => parseNumber(form[k] ?? "");
  return {
    sphere: n(`${eye}.sphere`),
    cylinder: n(`${eye}.cylinder`),
    axis: n(`${eye}.axis`),
    A: n("A"),
    B: n("B"),
    bridge: n("bridge"),
    dnp: n(`${eye}.dnp`),
    height: n("height"),
    shape: form.shape as Formato,
    frame: form.frame as TipoArmacao,
    minimum: n("minimum"),
    base: n("base"),
    eye,
  };
}

function calc(c: ConfigLente, n: number): { r: Estimativa; edges: ReturnType<typeof mountedEdges> } | { erro: string } {
  const errs = validate(c);
  if (errs.length) return { erro: errs.join(" ") };
  try {
    const r = estimate(c, n);
    return { r, edges: mountedEdges(c, r) };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha no cálculo." };
  }
}

export function EspessuraView({ sphInicial }: { sphInicial?: number | null }) {
  const [form, setForm] = useState<Form>(() => formInicial(sphInicial));
  const [receita, setReceita] = useState(false);
  const [indice, setIndice] = useState<Record<Olho, number>>({ OD: 1.67, OE: 1.67 });
  const [cmp, setCmp] = useState<[number, number]>([1.5, 1.67]);
  const [direcao, setDirecao] = useState<"horizontal" | "vertical">("horizontal");

  const set = (k: string, v: string) =>
    setForm((o) => {
      const n = { ...o, [k]: v };
      if (k === "frame") n.minimum = String(MIN_PADRAO[v as TipoArmacao]);
      if (k === "shape" && v === "round") n.B = n.A!;
      if (k === "A" && n.shape === "round") n.B = v;
      // sem receita completa: mesmo grau esférico nos dois olhos
      if (!receita && k === "OD.sphere") n["OE.sphere"] = v;
      return n;
    });

  const resultados = useMemo(() => Object.fromEntries(OLHOS.map((e) => [e, calc(ler(form, e), indice[e])])) as Record<Olho, ReturnType<typeof calc>>, [form, indice]);
  const comparacao = useMemo(() => cmp.map((n) => calc(ler(form, "OD"), n)), [form, cmp]);

  const campo = (k: string, rotulo: string, extra?: React.ComponentProps<"input">) => (
    <label className="block text-xs">
      <span className="mb-0.5 block font-medium text-slate-600">{rotulo}</span>
      <input value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} inputMode="decimal" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" {...extra} />
    </label>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Controles */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold text-slate-800">Receita</span>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={receita} onChange={(e) => setReceita(e.target.checked)} /> receita completa (OD/OE)
              </label>
            </div>
            {!receita ? (
              <label className="block text-xs">
                <span className="mb-0.5 block font-medium text-slate-600">Grau (esférico, os dois olhos)</span>
                <select value={form["OD.sphere"]} onChange={(e) => set("OD.sphere", e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  {!GRAUS.map(String).includes(form["OD.sphere"]!) && <option value={form["OD.sphere"]}>{power(parseNumber(form["OD.sphere"]) || 0)} D</option>}
                  {GRAUS.map((g) => (
                    <option key={g} value={String(g)}>
                      {power(g)} D
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="space-y-2">
                {OLHOS.map((e) => (
                  <div key={e} className="grid grid-cols-[28px_1fr_1fr_1fr] items-end gap-1.5">
                    <span className="pb-2 text-xs font-bold">{e}</span>
                    {campo(`${e}.sphere`, "Esférico")}
                    {campo(`${e}.cylinder`, "Cilindro")}
                    {campo(`${e}.axis`, "Eixo")}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-800">Armação</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs">
                <span className="mb-0.5 block font-medium text-slate-600">Tipo</span>
                <select value={form.frame} onChange={(e) => set("frame", e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  {Object.entries(TIPOS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs">
                <span className="mb-0.5 block font-medium text-slate-600">Formato</span>
                <select value={form.shape} onChange={(e) => set("shape", e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  {Object.entries(FORMATOS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              {campo("A", "Largura A (mm)")}
              {campo("B", "Altura B (mm)")}
              {campo("bridge", "Ponte (mm)")}
              {campo("height", "Altura do centro (mm)")}
              {campo("OD.dnp", "DNP OD (mm)")}
              {campo("OE.dnp", "DNP OE (mm)")}
              {campo("minimum", "Espessura mínima (mm)")}
              {campo("base", "Curva frontal (D)")}
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <button type="button" className="text-brand-700 underline" onClick={() => setForm(formInicial(sphInicial))}>
                Restaurar
              </button>
              <button
                type="button"
                className="text-brand-700 underline"
                onClick={() => setForm((o) => ({ ...o, A: "54", B: "38", bridge: "18", "OD.dnp": "30", "OE.dnp": "30", height: "19" }))}
              >
                Exemplo de borda grossa
              </button>
            </div>
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-800">Índice por olho</div>
            {OLHOS.map((e) => (
              <div key={e} className="mb-1.5 flex flex-wrap items-center gap-1">
                <span className="w-7 text-xs font-bold">{e}</span>
                {INDICES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={indice[e] === n}
                    onClick={() => setIndice((o) => ({ ...o, [e]: n }))}
                    className={cn("rounded border px-1.5 py-0.5 text-xs", indice[e] === n ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 hover:bg-slate-50")}
                  >
                    {f(n, 2)}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Resultados por olho */}
        <div className="space-y-3">
          <div className="flex gap-1 text-xs">
            {(["horizontal", "vertical"] as const).map((d) => (
              <button key={d} type="button" onClick={() => setDirecao(d)} className={cn("rounded-full border px-3 py-1", direcao === d ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300")}>
                {d === "horizontal" ? "Corte nasal / temporal" : "Corte inferior / superior"}
              </button>
            ))}
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {OLHOS.map((e) => {
              const res = resultados[e];
              const c = ler(form, e);
              return (
                <div key={e} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold text-slate-900">
                      {e} · Índice {f(indice[e], 2)}
                    </span>
                    {"r" in res && (
                      <span className="text-xs text-slate-500">
                        {power(c.sphere)} D{c.cylinder ? ` / ${power(c.cylinder)} × ${f(c.axis, 0)}°` : ""} · {TIPOS[c.frame]}
                      </span>
                    )}
                  </div>
                  {"erro" in res ? (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{res.erro}</p>
                  ) : (
                    <>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <Cartao rotulo="Centro" valor={res.r.center} />
                        <Cartao rotulo="Borda nasal" valor={res.edges.nasal.thickness} cor="text-teal-700" />
                        <Cartao rotulo="Borda temporal" valor={res.edges.temporal.thickness} cor="text-orange-700" />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <VistaFrontal c={c} r={res.r} edges={res.edges} />
                        <Corte c={c} r={res.r} direcao={direcao} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Borda máxima: {f(res.r.edgeMax)} mm · mínimo assumido {f(c.minimum)} mm
                      </p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Comparação de índices */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">Compare índices lado a lado (OD)</h3>
            <p className="text-sm text-slate-500">Argumento de venda: mostre ao cliente quanto a lente afina com alto índice.</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {[0, 1].map((i) => (
              <select
                key={i}
                value={cmp[i]}
                onChange={(e) => setCmp((o) => (i === 0 ? [+e.target.value, o[1]] : [o[0], +e.target.value]))}
                className="rounded-md border border-slate-300 px-2 py-1"
              >
                {INDICES.map((n) => (
                  <option key={n} value={n}>
                    {f(n, 2)}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {comparacao.map((res, i) => {
            const c = ler(form, "OD");
            const outro = comparacao[1 - i]!;
            const borda = "r" in res ? Math.max(res.r.edgeMax, res.r.center) : null;
            const bordaOutro = "r" in outro ? Math.max(outro.r.edgeMax, outro.r.center) : null;
            const reducao = borda != null && bordaOutro != null && borda < bordaOutro ? Math.round((1 - borda / bordaOutro) * 100) : null;
            return (
              <div key={i} className={cn("rounded-lg border p-3", reducao ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200")}>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-slate-900">Índice {f(cmp[i], 2)}</span>
                  {reducao != null && reducao > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">{reducao}% mais fina</span>}
                </div>
                {"erro" in res ? (
                  <p className="mt-2 text-sm text-amber-800">{res.erro}</p>
                ) : (
                  <>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <Cartao rotulo="Centro" valor={res.r.center} />
                      <Cartao rotulo="Nasal" valor={res.edges.nasal.thickness} cor="text-teal-700" />
                      <Cartao rotulo="Temporal" valor={res.edges.temporal.thickness} cor="text-orange-700" />
                    </div>
                    <Corte c={c} r={res.r} direcao="horizontal" escalaFixa={Math.max(borda ?? 0, bordaOutro ?? 0)} />
                  </>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-400">Estimativa geométrica para lentes de visão simples. Valores reais dependem do laboratório, da curva base e da montagem.</p>
      </div>
    </div>
  );
}

function Cartao({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className={cn("text-lg font-bold text-slate-900", cor)}>{f(valor)} mm</div>
    </div>
  );
}

function VistaFrontal({ c, r, edges }: { c: ConfigLente; r: Estimativa; edges: ReturnType<typeof mountedEdges> }) {
  const pts = outline(c, 120),
    scale = 3.45,
    cx = 180,
    cy = 153;
  const px = (x: number) => cx + x * scale,
    py = (y: number) => cy - y * scale;
  const path = "M" + pts.map((p) => `${px(p.x)},${py(p.y)}`).join("L") + "Z";
  const max = Math.max(r.center, r.edgeMax);
  const cells: React.ReactNode[] = [];
  for (let y = -c.B / 2; y <= c.B / 2; y += 2)
    for (let x = -c.A / 2; x <= c.A / 2; x += 2)
      if (inside(c, x, y)) {
        const t = r.at(x, y).thickness;
        cells.push(<rect key={`${x},${y}`} x={px(x) - 3.5} y={py(y) - 3.5} width={7} height={7} fill={heat((t - c.minimum) / Math.max(0.1, max - c.minimum))} />);
      }
  const id = `cut-${c.eye}-${r.index}`;
  const marcador = (k: "nasal" | "temporal", p: typeof edges.nasal) => {
    const x = px(p.x),
      y = py(p.y),
      start = p.side === "left",
      cor = k === "nasal" ? "#12655b" : "#a34f28";
    return (
      <g key={k}>
        <circle cx={x} cy={y} r={4} fill={cor} stroke="white" strokeWidth={2} />
        <path d={`M${x} ${y}L${start ? 26 : 334} 58`} stroke={cor} strokeWidth={1.5} />
        <text x={start ? 8 : 352} y={24} textAnchor={start ? "start" : "end"} fontSize={16} fontWeight={700} fill={cor}>
          {k === "nasal" ? "Nasal" : "Temporal"}
        </text>
        <text x={start ? 8 : 352} y={46} textAnchor={start ? "start" : "end"} fontSize={19} fontWeight={700} fill={cor}>
          {f(p.thickness)} mm
        </text>
      </g>
    );
  };
  return (
    <svg viewBox="0 0 360 300" className="w-full" role="img" aria-label={`Vista frontal ${c.eye}: nasal ${f(edges.nasal.thickness)} mm; temporal ${f(edges.temporal.thickness)} mm.`}>
      <defs>
        <clipPath id={id}>
          <path d={path} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>{cells}</g>
      <path d={path} fill="none" stroke="#213b33" strokeWidth={c.frame === "acetate" ? 8 : c.frame === "metal" ? 2.5 : 1} />
      <path d={`M${px(edges.left.x)} ${py(edges.left.y)}H${px(edges.right.x)}`} stroke="#173e35" strokeDasharray="4 3" />
      <circle cx={px(r.oc.x)} cy={py(r.oc.y)} r={5} fill="white" stroke="#173e35" strokeWidth={2} />
      {marcador("nasal", edges.nasal)}
      {marcador("temporal", edges.temporal)}
      <text x={180} y={287} textAnchor="middle" fontSize={16} fill="#213b33">
        {f(c.A, 0)} × {f(c.B, 0)} mm · {c.eye}
      </text>
    </svg>
  );
}

function Corte({ c, r, direcao, escalaFixa }: { c: ConfigLente; r: Estimativa; direcao: "horizontal" | "vertical"; escalaFixa?: number }) {
  const pts = crossSection(c, r, direcao);
  const span = pts[pts.length - 1]!.q - pts[0]!.q;
  const min = Math.min(...pts.map((p) => p.front)),
    max = Math.max(...pts.map((p) => p.back));
  // escala fixa permite comparar duas lentes visualmente na mesma proporção
  const altura = escalaFixa ? Math.max(escalaFixa + 4, max - min) : Math.max(1, max - min);
  const s = Math.min(260 / span, 120 / altura),
    x = (q: number) => 180 + q * s,
    y = (z: number) => 50 + (z - min) * s;
  const path = "M" + pts.map((p) => `${x(p.q)},${y(p.front)}`).join("L") + "L" + [...pts].reverse().map((p) => `${x(p.q)},${y(p.back)}`).join("L") + "Z";
  const ends = [pts[0]!, pts[pts.length - 1]!];
  return (
    <svg viewBox="0 0 360 280" className="w-full" role="img" aria-label={`Perfil da lente ${c.eye}, centro ${f(r.center)} mm.`}>
      <text x={180} y={27} textAnchor="middle" fontSize={18} fill="#173e35">
        Centro {f(r.center)} mm
      </text>
      <path d={path} fill="#b7dce6" stroke="#28647a" strokeWidth={2} />
      {direcao === "horizontal" &&
        ends.map((p, i) => {
          const side = i === 0 ? "left" : "right";
          const nasal = side === (c.eye === "OD" ? "right" : "left");
          return <path key={i} d={`M${x(p.q)} ${y(p.front)}V${y(p.back)}`} stroke={nasal ? "#12655b" : "#a34f28"} strokeWidth={4} />;
        })}
      <text x={180} y={267} textAnchor="middle" fontSize={16} fill="#637069">
        {direcao === "horizontal" ? "Corte nasal / temporal" : "Corte inferior / superior"} · {c.eye}
      </text>
    </svg>
  );
}
