// Montagem dos pacotes Essencial / Conforto / Premium a partir dos produtos
// reais do catálogo (recebidos do servidor). Funções puras — rodam no cliente.

import type { Product, SaleItem } from "@/lib/types";
import type { Perfil } from "./campos";
import { COMPLEMENTOS, tem, type Avaliacao, type Complemento, type Tier, TIERS } from "./regras";

export type ProdutoBalcao = Pick<Product, "id" | "name" | "category" | "brand" | "tier" | "price_cents" | "cost_cents" | "lens" | "frame" | "tags">;

export interface Pacote {
  tier: Tier;
  lente: ProdutoBalcao | null;
  armacao: ProdutoBalcao | null;
  extras: ProdutoBalcao[];
  total_cents: number;
  afinidade: number;
  motivos: string[];
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const ordemTier: Record<Tier, number> = { essencial: 0, conforto: 1, premium: 2 };
const distTier = (a: Product["tier"], b: Tier) => (a ? Math.abs(ordemTier[a] - ordemTier[b]) : 1.5);

export const toItem = (p: ProdutoBalcao, role: SaleItem["role"] = "principal"): SaleItem => ({
  product_id: p.id,
  name: p.name,
  category: p.category,
  qty: 1,
  price_cents: p.price_cents,
  cost_cents: p.cost_cents,
  role,
});

function escolherLente(produtos: ProdutoBalcao[], tier: Tier, av: Avaliacao, sph?: number | null) {
  const pref = av.lente;
  const lentes = produtos.filter((p) => p.category === "lente" && p.lens);
  const tipoDesejado = pref.tipo ?? "visao_simples";
  let candidatas = lentes.filter((p) => (p.lens!.type ?? "visao_simples") === tipoDesejado);
  if (!candidatas.length) candidatas = lentes;
  if (sph != null) {
    const ok = candidatas.filter((p) => (p.lens!.sph_min ?? -99) <= sph && sph <= (p.lens!.sph_max ?? 99));
    if (ok.length) candidatas = ok;
  }
  const pontuar = (p: ProdutoBalcao) => {
    const l = p.lens!;
    const infantil = p.tags?.includes("crianca");
    let s = -distTier(p.tier, tier) * 3;
    if (pref.infantil) s += infantil ? 6 : -2;
    else if (infantil) s -= 6;
    if (pref.fotossensivel && l.photochromic) s += tier === "essencial" ? 0.5 : 2;
    if (pref.filtroAzul && l.blue_filter) s += 1.5;
    if (pref.indiceMin && (l.index ?? 1.5) >= pref.indiceMin) s += tier === "essencial" ? 1 : 3;
    if (pref.resistente && p.tags?.includes("resistente")) s += 1;
    return s;
  };
  return candidatas.sort((a, b) => pontuar(b) - pontuar(a) || a.price_cents - b.price_cents)[0] ?? null;
}

// Formato de armação sugerido por formato de rosto (visagismo básico).
const formatoPorRosto: Record<string, string[]> = {
  redondo: ["retangular", "quadrado"],
  quadrado: ["redondo", "oval"],
  oval: ["retangular", "quadrado", "redondo", "oval", "gatinho"],
  coracao: ["oval", "gatinho", "redondo"],
};

function escolherArmacao(produtos: ProdutoBalcao[], tier: Tier, p: Perfil) {
  const armacoes = produtos.filter((x) => x.category === "armacao");
  const crianca = tem(p, "idade", "crianca") || tem(p, "tipo_oculos", "infantil");
  const genero = tem(p, "sexo", "homem") ? "M" : tem(p, "sexo", "mulher") ? "F" : null;
  const formatos = typeof p.rosto === "string" ? formatoPorRosto[p.rosto] : undefined;
  const pontuar = (a: ProdutoBalcao) => {
    let s = -distTier(a.tier, tier) * 3;
    const f = a.frame ?? {};
    const infantil = a.tags?.includes("crianca");
    if (crianca) s += infantil ? 8 : -4;
    else if (infantil) s -= 8;
    if (genero && f.gender) s += f.gender === genero ? 1.5 : f.gender === "U" ? 0.8 : -3;
    if (formatos && f.shape && formatos.includes(f.shape)) s += 1.2;
    if (tem(p, "quebra_muito", "sim") && /tr90|silicone|tit/i.test(f.material ?? "")) s += 2;
    if (tem(p, "prioridade", "conforto") && /tr90|tit/i.test(f.material ?? "")) s += 1;
    if (tem(p, "grau_alto", "miopia_alta") && /acetato/i.test(f.material ?? "")) s += 1;
    return s;
  };
  return armacoes.sort((a, b) => pontuar(b) - pontuar(a) || a.price_cents - b.price_cents)[0] ?? null;
}

/** A lente tem o recurso pedido pelo complemento (filtro azul, fotossensível…)? */
export function lenteAtende(c: Complemento, p: ProdutoBalcao) {
  const bl = c.busca.lente;
  const l = p.lens;
  if (!bl || !l) return false;
  if (bl.fotossensivel && !l.photochromic) return false;
  if (bl.filtroAzul && !l.blue_filter) return false;
  if (bl.indiceMin && (l.index ?? 1.5) < bl.indiceMin) return false;
  if (bl.tratamento && !l.treatments?.includes(bl.tratamento)) return false;
  return true;
}

/** Produto real do catálogo que atende um complemento (ou null). */
export function produtoDoComplemento(c: Complemento, produtos: ProdutoBalcao[], lenteAtual?: ProdutoBalcao | null) {
  const b = c.busca;
  let lista = produtos.filter((p) => !b.categoria || b.categoria.includes(p.category));
  if (b.nome) lista = lista.filter((p) => norm(p.name).includes(norm(b.nome!)));
  if (b.tag) lista = lista.filter((p) => p.tags?.includes(b.tag!));
  if (b.lente) {
    // a lente atual já tem o recurso → é ela mesma (já incluso)
    if (lenteAtual && lenteAtende(c, lenteAtual)) return lenteAtual;
    lista = lista.filter((p) => lenteAtende(c, p));
    // upgrade de lente: manter o mesmo tipo da lente atual e ser diferente dela
    if (lenteAtual?.lens) {
      const mesmoTipo = lista.filter((p) => p.lens?.type === lenteAtual.lens?.type && p.id !== lenteAtual.id);
      if (mesmoTipo.length) lista = mesmoTipo;
      else lista = lista.filter((p) => p.id !== lenteAtual.id);
    }
  }
  return lista.sort((a, b) => a.price_cents - b.price_cents)[0] ?? null;
}

export function montarPacotes(produtos: ProdutoBalcao[], perfil: Perfil, av: Avaliacao, sph?: number | null): Pacote[] {
  const extrasPorTier: Record<Tier, string[]> = { essencial: [], conforto: ["estojo", "spray"], premium: ["estojo", "garantia"] };
  return TIERS.map((tier) => {
    const lente = escolherLente(produtos, tier, av, sph);
    const armacao = escolherArmacao(produtos, tier, perfil);
    const extras = extrasPorTier[tier]
      .map((id) => COMPLEMENTOS.find((c) => c.id === id))
      .map((c) => (c ? produtoDoComplemento(c, produtos) : null))
      .filter((x): x is ProdutoBalcao => !!x);
    const total_cents = [lente, armacao, ...extras].reduce((a, p) => a + (p?.price_cents ?? 0), 0);
    const motivos = av.disparadas.filter((r) => (r.pacote?.[tier] ?? 0) > 0).map((r) => r.titulo);
    return { tier, lente, armacao, extras, total_cents, afinidade: av.afinidade[tier], motivos };
  });
}

export const itensDoPacote = (p: Pacote): SaleItem[] =>
  [p.lente && toItem(p.lente, "principal"), p.armacao && toItem(p.armacao, "principal"), ...p.extras.map((e) => toItem(e, "adicional"))].filter(
    (x): x is SaleItem => !!x,
  );
