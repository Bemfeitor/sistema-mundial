// Estimativa geométrica de espessura para lentes de visão simples.
// Porte fiel de thickness-model.js. Unidades: mm e dioptrias.
// Superfície frontal esférica; traseira bicônica. A potência no vértice posterior inclui a espessura central.

export const INDICES = [1.5, 1.53, 1.56, 1.59, 1.6, 1.61, 1.67, 1.74] as const;
export const GRAUS = [8, 6, 4, 2, -2, -4, -6, -8, -10, -12] as const;

export type Formato = "oval" | "rectangle" | "round";
export type TipoArmacao = "metal" | "rimless" | "acetate";
export type Olho = "OD" | "OE";

export interface ConfigLente {
  sphere: number;
  cylinder: number;
  axis: number;
  A: number;
  B: number;
  bridge: number;
  dnp: number;
  height: number;
  shape: Formato;
  frame: TipoArmacao;
  eye: Olho;
  minimum: number;
  base: number;
}

export interface Ponto {
  x: number;
  y: number;
}
export interface Superficie {
  front: number;
  back: number;
  thickness: number;
}
export type PontoEspessura = Ponto & Superficie;

export const DEFAULTS: ConfigLente = { sphere: -6, cylinder: 0, axis: 180, A: 52, B: 36, bridge: 18, dnp: 32, height: 18, shape: "oval", frame: "metal", eye: "OD", minimum: 1.5, base: 4 };

export function parseNumber(value: unknown) {
  const s = String(value).trim().replace(/[−－]/g, "-").replace(",", ".");
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) ? Number(s) : NaN;
}

export const shapePower = (shape: Formato) => (shape === "rectangle" ? 4 : 2);

export function outline(c: Pick<ConfigLente, "A" | "B" | "shape">, count = 720): Ponto[] {
  const p = shapePower(c.shape),
    a = c.A / 2,
    b = c.B / 2;
  return Array.from({ length: count }, (_, i) => {
    const t = (2 * Math.PI * i) / count,
      x = Math.cos(t),
      y = Math.sin(t);
    return { x: a * Math.sign(x) * Math.abs(x) ** (2 / p), y: b * Math.sign(y) * Math.abs(y) ** (2 / p) };
  });
}

export function inside(c: Pick<ConfigLente, "A" | "B" | "shape">, x: number, y: number) {
  const p = shapePower(c.shape);
  return Math.abs(x / (c.A / 2)) ** p + Math.abs(y / (c.B / 2)) ** p <= 1 + 1e-9;
}

export function opticalCenter(c: ConfigLente): Ponto {
  return { x: (c.eye === "OD" ? 1 : -1) * ((c.A + c.bridge) / 2 - c.dnp), y: c.height - c.B / 2 };
}

export function validate(c: ConfigLente) {
  const errors: string[] = [];
  const range = (key: keyof ConfigLente, a: number, b: number, name: string) => {
    const v = c[key] as number;
    if (!Number.isFinite(v) || v < a || v > b) errors.push(`${name}: informe um valor entre ${a} e ${b}.`);
  };
  range("sphere", -12, 8, "Esférico");
  range("cylinder", -6, 6, "Cilindro");
  range("axis", 0, 180, "Eixo");
  for (const key of ["sphere", "cylinder"] as const)
    if (Number.isFinite(c[key]) && Math.abs(c[key] * 4 - Math.round(c[key] * 4)) > 1e-7) errors.push("Use intervalos de 0,25 D para esférico e cilindro.");
  if (Math.min(c.sphere, c.sphere + c.cylinder) < -16 || Math.max(c.sphere, c.sphere + c.cylinder) > 12) errors.push("Potências dos meridianos fora do modelo (−16 a +12 D).");
  range("A", 36, 64, "Largura A (mm)");
  range("B", 22, 55, "Altura B (mm)");
  range("bridge", 10, 26, "Ponte (mm)");
  range("dnp", 20, 40, "DNP (mm)");
  range("height", 8, c.B - 5, "Altura do centro óptico (mm)");
  range("minimum", 1, 4, "Espessura mínima (mm)");
  range("base", 0, 12, "Curva frontal (D reais)");
  if (!["oval", "rectangle", "round"].includes(c.shape) || !["metal", "rimless", "acetate"].includes(c.frame) || !["OD", "OE"].includes(c.eye))
    errors.push("Seleção de armação ou olho inválida.");
  if (c.shape === "round" && Math.abs(c.A - c.B) > 0.01) errors.push("No formato redondo, A e B precisam ser iguais.");
  const oc = opticalCenter(c);
  if (!inside(c, oc.x, oc.y)) errors.push("O centro óptico ficou fora da lente. Confira DNP, altura e medidas.");
  return errors;
}

/** Sagitta estável: evita cancelamento em curvaturas pequenas e preserva o sinal. */
export function sag(c1: number, c2: number, u: number, v: number) {
  const q = 1 - c1 * c1 * u * u - c2 * c2 * v * v;
  if (q < 0) throw new Error("Curvatura e tamanho incompatíveis neste modelo. Reduza a armação ou confira a curva frontal.");
  return (c1 * u * u + c2 * v * v) / (1 + Math.sqrt(q));
}

export function surfaces(c: ConfigLente, n: number, ct: number) {
  const a = (c.axis * Math.PI) / 180,
    co = Math.cos(a),
    si = Math.sin(a),
    front = c.base / (1000 * (n - 1));
  const denom = 1 - ((ct / 1000) * c.base) / n;
  if (denom <= 0) throw new Error("Curva frontal fora do limite do modelo.");
  const equivalentFront = c.base / denom;
  const c1 = (equivalentFront - c.sphere) / (1000 * (n - 1)),
    c2 = (equivalentFront - c.sphere - c.cylinder) / (1000 * (n - 1));
  const oc = opticalCenter(c);
  return (x: number, y: number): Superficie => {
    const dx = x - oc.x,
      dy = y - oc.y,
      u = dx * co + dy * si,
      v = -dx * si + dy * co;
    const frontSag = sag(front, front, dx, dy),
      backSag = sag(c1, c2, u, v);
    return { front: frontSag, back: ct + backSag, thickness: ct + backSag - frontSag };
  };
}

export interface Estimativa {
  index: number;
  center: number;
  edgeMax: number;
  edgeMin: number;
  maxPoint: PontoEspessura;
  minPoint: PontoEspessura;
  edges: PontoEspessura[];
  oc: Ponto;
  ed: number;
  cutDiameter: number;
  minThickness: number;
  at: (x: number, y: number) => Superficie;
}

export function estimate(c: ConfigLente, n: number): Estimativa {
  const errors = validate(c);
  if (errors.length) throw new Error(errors[0]);
  if (!(INDICES as readonly number[]).includes(n)) throw new Error("Índice inválido.");
  const edge = outline(c),
    oc = opticalCenter(c),
    samples: Ponto[] = [...edge, oc, { x: 0, y: 0 }];
  // Amostragem interna cobre receitas de sinais mistos e astigmáticas.
  for (let iy = 0; iy <= 16; iy++)
    for (let ix = 0; ix <= 20; ix++) {
      const x = -c.A / 2 + (c.A * ix) / 20,
        y = -c.B / 2 + (c.B * iy) / 16;
      if (inside(c, x, y)) samples.push({ x, y });
    }
  const minimumAt = (ct: number) => {
    const f = surfaces(c, n, ct);
    return Math.min(...samples.map((p) => f(p.x, p.y).thickness));
  };
  let lo = c.minimum,
    hi = lo;
  if (minimumAt(lo) < c.minimum - 1e-9) {
    hi = lo + 1;
    while (minimumAt(hi) < c.minimum && hi < 30) hi += 1;
    if (hi >= 30) throw new Error("Espessura fora do limite deste modelo. Consulte o laboratório.");
    for (let i = 0; i < 36; i++) {
      const mid = (lo + hi) / 2;
      if (minimumAt(mid) < c.minimum) lo = mid;
      else hi = mid;
    }
  }
  const ct = hi,
    f = surfaces(c, n, ct),
    edges = edge.map((p) => ({ ...p, ...f(p.x, p.y) }));
  const maxPoint = edges.reduce((a, b) => (a.thickness > b.thickness ? a : b)),
    minPoint = edges.reduce((a, b) => (a.thickness < b.thickness ? a : b));
  const ed = 2 * Math.max(...edge.map((p) => Math.hypot(p.x, p.y))),
    cutDiameter = 2 * Math.max(...edge.map((p) => Math.hypot(p.x - oc.x, p.y - oc.y)));
  return { index: n, center: ct, edgeMax: maxPoint.thickness, edgeMin: minPoint.thickness, maxPoint, minPoint, edges, oc, ed, cutDiameter, minThickness: minimumAt(ct), at: f };
}

export type PontoCorte = PontoEspessura & { q: number };

export function crossSection(c: ConfigLente, result: Estimativa, direction: "horizontal" | "vertical" = "horizontal"): PontoCorte[] {
  const h = direction === "horizontal",
    oc = result.oc,
    sp = shapePower(c.shape);
  const half = h
    ? (c.A / 2) * (1 - Math.abs(oc.y / (c.B / 2)) ** sp) ** (1 / sp)
    : (c.B / 2) * (1 - Math.abs(oc.x / (c.A / 2)) ** sp) ** (1 / sp);
  return Array.from({ length: 161 }, (_, i) => {
    const q = -half + (2 * half * i) / 160,
      x = h ? q : oc.x,
      y = h ? oc.y : q;
    return { q, x, y, ...result.at(x, y) };
  });
}

export type Borda = PontoCorte & { side: "left" | "right" };

/**
 * Lados anatômicos em vista frontal (observador de frente para o usuário).
 * Amostra o contorno acabado onde a horizontal pelo centro óptico encontra o aro.
 */
export function mountedEdges(c: ConfigLente, result: Estimativa) {
  const cut = crossSection(c, result, "horizontal");
  const left: Borda = { ...cut[0]!, side: "left" },
    right: Borda = { ...cut[cut.length - 1]!, side: "right" };
  const nasal = c.eye === "OD" ? right : left,
    temporal = c.eye === "OD" ? left : right;
  return { nasal, temporal, left, right };
}
