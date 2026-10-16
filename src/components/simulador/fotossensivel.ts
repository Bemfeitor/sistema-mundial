// Paletas fotossensíveis (porte de photochromic.js).
// As amostras RGB são ilustrativas, não dados espectrais medidos.

export interface Cor {
  id: string;
  name: string;
  hex: string;
}
export interface Colecao {
  id: string;
  name: string;
  colors: Cor[];
  note: string;
  source: string | null;
}

const c = (id: string, name: string, hex: string): Cor => ({ id, name, hex });
const base: Record<string, Cor> = {
  grey: c("grey", "Cinza", "#656b70"),
  brown: c("brown", "Marrom", "#936b43"),
  graphite: c("graphite", "Verde-grafite", "#647363"),
  sapphire: c("sapphire", "Safira", "#496d9d"),
  amethyst: c("amethyst", "Ametista", "#976393"),
  amber: c("amber", "Âmbar", "#be8739"),
  emerald: c("emerald", "Esmeralda", "#468d72"),
  ruby: c("ruby", "Rubi", "#a54760"),
  extra: c("extra", "Cinza extra", "#41474c"),
  black: c("black", "Preto", "#303436"),
  pioneer: c("pioneer", "Pioneer · verde", "#667a56"),
  blue: c("blue", "Azul", "#526f94"),
  burgundy: c("burgundy", "Burgundy · vinho", "#884252"),
  progrey: c("progrey", "Pro Grey", "#737a7c"),
  probrown: c("probrown", "Pro Brown", "#967855"),
  silver: c("silver", "Silver Grey", "#737a82"),
  bronze: c("bronze", "Bronze Brown", "#9b714b"),
  hgreen: c("hgreen", "Emerald Green", "#658472"),
  ocean: c("ocean", "Oceanic Blue", "#4f7d99"),
};

export const collections: Colecao[] = [
  { id: "gens", name: "Transitions® GEN S™", colors: ["grey", "brown", "graphite", "sapphire", "amethyst", "amber", "emerald", "ruby"], note: "8 cores da linha GEN S. Confirme a combinação de cor, material e desenho com o laboratório.", source: "https://www.transitions.com/en-us/products/transitions-gen-s/" },
  { id: "xtractive", name: "Transitions® XTRActive®", colors: ["grey", "brown", "graphite"], note: "Paleta de referência internacional. A simulação mostra apenas a tonalidade, sem simular polarização ou resposta dentro do carro.", source: "https://www.transitions.com/en-us/products/transitions-xtractive/" },
  { id: "colortouch", name: "Transitions® Color Touch™", colors: ["ruby", "amber", "sapphire", "amethyst", "emerald"], note: "Referência internacional: cor residual em ambiente interno, nos efeitos Washed e Gradient. Confirme disponibilidade no Brasil.", source: "https://www.transitions.com/emea/products/transitions-color-touch/" },
  { id: "zeiss", name: "ZEISS PhotoFusion X", colors: ["grey", "extra", "black", "brown", "pioneer", "blue", "burgundy", "progrey", "probrown"], note: "Reúne paletas internacionais. Black, Pro Grey e Pro Brown variam por mercado; confirme a oferta brasileira com o laboratório.", source: "https://www.zeiss.com/vision-care/us/need-new-eyeglasses/photofusion-x.html" },
  { id: "hoya", name: "HOYA Sensity® 3", colors: ["silver", "bronze", "hgreen", "ocean"], note: "Referência do catálogo dos EUA: Emerald Green e Oceanic Blue em policarbonato. Isso não confirma disponibilidade em multifocais no Brasil.", source: "https://www.hoyavision.com/en-us/newsroom/hoya-in-the-news/news-folder/sensity-3-news-release/" },
  { id: "custom", name: "Cor livre · outras linhas", colors: [], note: "Escolha qualquer tom para ilustrar outra linha do laboratório. A cor livre não representa um produto ou disponibilidade confirmada.", source: null },
].map((g) => ({ ...g, colors: g.colors.map((id) => base[id]!) }));

export const getCollection = (id: string) => collections.find((x) => x.id === id) ?? collections[0]!;

export function photoColor(s: { collection: string; color: string; customColor: string }): Cor {
  return getCollection(s.collection).colors.find((x) => x.id === s.color) ?? { id: "custom", name: "Cor livre", hex: s.customColor };
}

export const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

/** Densidade residual (estado claro) por coleção, como no shader original. */
export const photoBase = (collection: string) => (collection === "colortouch" ? 0.14 : collection === "xtractive" ? 0.035 : 0);
