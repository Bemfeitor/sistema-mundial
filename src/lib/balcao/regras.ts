// =====================================================================
// MOTOR DE REGRAS DO BALCÃO (declarativo, roda no navegador)
// ---------------------------------------------------------------------
// Cada regra diz QUANDO ela vale (a partir do perfil clicado) e o que
// ela acrescenta no painel:
//   - dicas:        argumentos de venda em linguagem de balcão
//   - perguntas:    o que perguntar ao cliente em seguida
//   - alertas:      avisos importantes (receita vencida, encaminhar etc.)
//   - complementos: ids do catálogo COMPLEMENTOS (abaixo) a oferecer
//   - pacote:       peso para Essencial / Conforto / Premium
//   - lente:        preferências que guiam a escolha da lente do pacote
//   - peso:         relevância da regra (entra na "afinidade" dos pacotes)
//
// Para criar uma regra nova: copie um bloco de REGRAS, troque o `id`
// e escreva a condição com os atalhos tem(), algum() e vazio().
// A afinidade mostrada na tela é a soma REAL dos pesos das regras
// disparadas — nada é aleatório.
// =====================================================================

import type { LensType } from "@/lib/types";
import type { Perfil } from "./campos";

export type Tier = "essencial" | "conforto" | "premium";
export const TIERS: Tier[] = ["essencial", "conforto", "premium"];

export interface Alerta {
  nivel: "info" | "atencao" | "urgente";
  texto: string;
}

export interface PreferenciaLente {
  tipo?: LensType;
  indiceMin?: number;
  fotossensivel?: boolean;
  filtroAzul?: boolean;
  infantil?: boolean;
  resistente?: boolean;
}

export interface Regra {
  id: string;
  /** Nome curto mostrado como "motivo" no painel. */
  titulo: string;
  quando: (p: Perfil) => boolean;
  dicas?: string[];
  perguntas?: string[];
  alertas?: Alerta[];
  complementos?: string[];
  pacote?: Partial<Record<Tier, number>>;
  lente?: PreferenciaLente;
  /** Relevância da regra (padrão 1). */
  peso?: number;
}

// ---------- atalhos para escrever condições ----------
/** O campo tem esse valor (ou contém, se for múltipla escolha). */
export const tem = (p: Perfil, campo: string, valor: string) => {
  const v = p[campo];
  return Array.isArray(v) ? v.includes(valor) : v === valor;
};
/** O campo tem algum dos valores. */
export const algum = (p: Perfil, campo: string, valores: string[]) => valores.some((v) => tem(p, campo, v));
/** O campo não foi respondido. */
export const vazio = (p: Perfil, campo: string) => {
  const v = p[campo];
  return v == null || (Array.isArray(v) && v.length === 0) || v === "";
};
const presbita = (p: Perfil) => algum(p, "idade", ["40_59", "60_mais"]);

// =====================================================================
// COMPLEMENTOS — itens para oferecer. `busca` encontra o produto real no
// catálogo (por categoria, nome, tags ou características da lente).
// `troca: true` = upgrade de lente (substitui a lente do orçamento).
// =====================================================================
export type GrupoComplemento = "Lente e tratamentos" | "Proteção e ajuste" | "Itens que encantam";

export interface Complemento {
  id: string;
  nome: string;
  grupo: GrupoComplemento;
  argumento: string;
  troca?: boolean;
  busca: {
    categoria?: string[];
    nome?: string; // trecho do nome (sem acento, minúsculo)
    tag?: string;
    lente?: { fotossensivel?: boolean; filtroAzul?: boolean; indiceMin?: number; tratamento?: string };
  };
}

export const COMPLEMENTOS: Complemento[] = [
  { id: "antirreflexo", nome: "Antirreflexo premium", grupo: "Lente e tratamentos", troca: true, argumento: "Tira o reflexo da lente: enxerga melhor à noite e sai bem nas fotos.", busca: { categoria: ["lente"], lente: { tratamento: "antirreflexo_premium" } } },
  { id: "filtro_azul", nome: "Filtro de luz azul", grupo: "Lente e tratamentos", troca: true, argumento: "Mais conforto em telas: menos cansaço no fim do dia.", busca: { categoria: ["lente"], lente: { filtroAzul: true } } },
  { id: "fotossensivel", nome: "Lente fotossensível", grupo: "Lente e tratamentos", troca: true, argumento: "Escurece no sol e clareia em ambiente interno: um óculos só para tudo.", busca: { categoria: ["lente"], lente: { fotossensivel: true } } },
  { id: "alto_indice", nome: "Alto índice (lente mais fina)", grupo: "Lente e tratamentos", troca: true, argumento: "Lente mais fina e leve, borda discreta — mostre no simulador de espessura.", busca: { categoria: ["lente"], lente: { indiceMin: 1.67 } } },
  { id: "polarizado", nome: "Solar polarizado", grupo: "Lente e tratamentos", argumento: "Corta o reflexo da água e do asfalto: ideal para dirigir e praia.", busca: { categoria: ["solar"], tag: "polarizado" } },
  { id: "garantia", nome: "Garantia estendida 12 meses", grupo: "Proteção e ajuste", argumento: "Tranquilidade: cobre quebra e defeitos por mais um ano.", busca: { categoria: ["servico"], nome: "garantia" } },
  { id: "estojo", nome: "Estojo rígido", grupo: "Proteção e ajuste", argumento: "Protege o investimento na bolsa ou no carro.", busca: { categoria: ["acessorio"], nome: "estojo" } },
  { id: "spray", nome: "Spray limpa-lentes + flanela", grupo: "Proteção e ajuste", argumento: "Limpar do jeito certo preserva o antirreflexo.", busca: { categoria: ["acessorio"], nome: "spray" } },
  { id: "cordao", nome: "Cordão / segura-óculos", grupo: "Proteção e ajuste", argumento: "Prático para quem tira e põe o óculos o dia todo.", busca: { categoria: ["acessorio"], nome: "cordao" } },
  { id: "segundo_par_solar", nome: "2º par solar", grupo: "Itens que encantam", argumento: "Aproveita a visita: um solar para o fim de semana.", busca: { categoria: ["solar"] } },
  { id: "clip_on", nome: "Clip-on magnético", grupo: "Itens que encantam", argumento: "Vira óculos de sol em um segundo, sem outra receita.", busca: { categoria: ["acessorio"], nome: "clip-on" } },
  { id: "lente_contato", nome: "Lente de contato", grupo: "Itens que encantam", argumento: "Liberdade para esporte e festas, alternando com o óculos.", busca: { categoria: ["lente_contato"] } },
  { id: "exame", nome: "Exame de vista", grupo: "Itens que encantam", argumento: "Receita atualizada garante a lente certa — fazemos aqui.", busca: { categoria: ["servico"], nome: "exame" } },
];

// =====================================================================
// REGRAS
// =====================================================================
export const REGRAS: Regra[] = [
  // ---------- base: investimento ----------
  { id: "inv_economico", titulo: "Busca economia", quando: (p) => tem(p, "investimento", "economico") || tem(p, "prioridade", "preco"), pacote: { essencial: 3 }, peso: 2, dicas: ["Mostre primeiro o Essencial e explique o que ele já resolve; depois apresente o Conforto como 'o que a maioria leva'."], perguntas: ["Prefere pagar à vista com desconto ou parcelar?"] },
  { id: "inv_intermediario", titulo: "Investimento intermediário", quando: (p) => tem(p, "investimento", "intermediario"), pacote: { conforto: 3 }, peso: 2 },
  { id: "inv_premium", titulo: "Investimento premium", quando: (p) => tem(p, "investimento", "premium"), pacote: { premium: 3 }, peso: 2, dicas: ["Comece pelo Premium: fale de tecnologia, acabamento e garantia antes do preço."], complementos: ["garantia"] },

  // ---------- idade ----------
  { id: "crianca", titulo: "Criança", quando: (p) => tem(p, "idade", "crianca") || tem(p, "tipo_oculos", "infantil"), lente: { infantil: true, resistente: true }, pacote: { conforto: 2 }, peso: 2, dicas: ["Para criança: lente de policarbonato (resistente a impacto) e armação flexível.", "Envolva a criança na escolha da cor da armação — ela usa mais quando gosta."], perguntas: ["A criança já fez exame com oftalmologista?", "Pratica esporte na escola?"], complementos: ["garantia", "cordao"] },
  { id: "crianca_sem_exame", titulo: "Criança sem receita", quando: (p) => (tem(p, "idade", "crianca") || tem(p, "tipo_oculos", "infantil")) && !tem(p, "receita", "valida"), alertas: [{ nivel: "urgente", texto: "Criança sem receita válida: oriente consulta com oftalmologista antes de fazer a lente." }] },
  { id: "adolescente", titulo: "Adolescente", quando: (p) => tem(p, "idade", "adolescente"), dicas: ["Adolescente liga para estética: mostre armações em alta e lente fina."], complementos: ["lente_contato"] },
  { id: "presbita_sem_multi", titulo: "Idade de presbiopia", quando: (p) => presbita(p) && !tem(p, "tipo_oculos", "multifocal"), dicas: ["Após os 40 a visão de perto muda: pergunte se sente dificuldade para ler o celular — o multifocal resolve perto e longe num óculos só."], perguntas: ["Tem dificuldade para ler o celular ou etiquetas?"] },

  // ---------- tipo de óculos ----------
  { id: "multifocal", titulo: "Multifocal", quando: (p) => tem(p, "tipo_oculos", "multifocal"), lente: { tipo: "multifocal" }, pacote: { conforto: 1, premium: 1 }, peso: 2, dicas: ["Abra o simulador e mostre a diferença do corredor entre Tradicional, Digital e Personalizada — o cliente entende na hora por que vale investir."], perguntas: ["Passa mais tempo lendo, no computador ou dirigindo?"] },
  { id: "multi_primeiro", titulo: "Primeiro multifocal", quando: (p) => tem(p, "tipo_oculos", "multifocal") && (tem(p, "ja_multifocal", "nunca") || tem(p, "primeiro_oculos", "sim")), pacote: { conforto: 2 }, dicas: ["Explique a adaptação: 1 a 2 semanas, mover a cabeça (não só os olhos) para olhar para os lados.", "Desenho digital/personalizado tem corredor mais largo — adaptação mais fácil."], peso: 1 },
  { id: "multi_nao_adaptou", titulo: "Não adaptou ao multifocal", quando: (p) => tem(p, "ja_multifocal", "nao_adaptou") || tem(p, "queixas", "tontura_multi"), pacote: { premium: 3 }, peso: 3, lente: { tipo: "multifocal" }, dicas: ["Quem não adaptou geralmente usou desenho tradicional ou medidas imprecisas. Ofereça lente personalizada com medição de altura e DNP cuidadosa.", "Mostre no simulador o corredor estreito (Tradicional) × largo (Personalizada)."], alertas: [{ nivel: "atencao", texto: "Histórico de não adaptação: confira altura de montagem e DNP com atenção e agende retorno de ajuste." }], perguntas: ["Lembra qual lente usou antes e quanto tempo tentou se adaptar?"] },
  { id: "perto_telas", titulo: "Perto + muito computador", quando: (p) => tem(p, "tipo_oculos", "perto") && algum(p, "telas", ["4_8", "mais_8"]) && presbita(p), lente: { tipo: "ocupacional" }, pacote: { conforto: 2 }, dicas: ["Lente ocupacional: enxerga a tela e o papel sem levantar o queixo — ótima como óculos de trabalho."], peso: 2 },
  { id: "perto", titulo: "Óculos de perto", quando: (p) => tem(p, "tipo_oculos", "perto"), lente: { tipo: "visao_simples" }, dicas: ["Óculos de leitura: ofereça cordão e estojo — é o óculos que mais se perde."], complementos: ["cordao", "estojo"] },
  { id: "longe", titulo: "Óculos de longe", quando: (p) => tem(p, "tipo_oculos", "longe"), lente: { tipo: "visao_simples" } },

  // ---------- receita ----------
  { id: "receita_vencida", titulo: "Receita vencida", quando: (p) => tem(p, "receita", "vencida"), alertas: [{ nivel: "atencao", texto: "Receita vencida: sugira novo exame antes de fechar a lente (grau pode ter mudado)." }], complementos: ["exame"], dicas: ["'Seu grau pode ter mudado — fazendo o exame agora, a lente nova sai certinha.'"] },
  { id: "sem_receita", titulo: "Sem receita", quando: (p) => tem(p, "receita", "nao_tem"), alertas: [{ nivel: "atencao", texto: "Cliente sem receita: ofereça exame e agende (agenda de exames)." }], complementos: ["exame"], perguntas: ["Prefere fazer o exame hoje ou agendar um horário?"] },
  { id: "grau_alto", titulo: "Grau alto", quando: (p) => algum(p, "grau_alto", ["miopia_alta", "hiper_alta", "astig_alto"]), lente: { indiceMin: 1.67 }, pacote: { premium: 2, conforto: 1 }, peso: 2, complementos: ["alto_indice"], dicas: ["Grau alto pede alto índice: lente até 40% mais fina. Mostre a comparação 1.50 × 1.67 no simulador de espessura.", "Armação menor e bem centrada também reduz a espessura da borda."] },
  { id: "miopia_acetato", titulo: "Miopia alta + estética", quando: (p) => tem(p, "grau_alto", "miopia_alta") && tem(p, "prioridade", "estetica"), dicas: ["Para miopia alta, armação de acetato esconde a borda da lente."] },

  // ---------- telas e rotina ----------
  { id: "telas", titulo: "Muitas horas de tela", quando: (p) => algum(p, "telas", ["4_8", "mais_8"]) || tem(p, "rotina", "escritorio") || tem(p, "rotina", "estudante"), lente: { filtroAzul: true }, pacote: { conforto: 2 }, complementos: ["filtro_azul", "antirreflexo"], dicas: ["Filtro de luz azul + antirreflexo: menos reflexo da tela e mais conforto no fim do expediente."], peso: 1 },
  { id: "telas_muito", titulo: "+8h de tela", quando: (p) => tem(p, "telas", "mais_8"), pacote: { premium: 1 }, perguntas: ["Sente os olhos secos ou cansados no fim do dia?"] },
  { id: "motorista", titulo: "Motorista / dirige à noite", quando: (p) => tem(p, "rotina", "motorista") || tem(p, "dirige_noite", "sim"), complementos: ["antirreflexo", "polarizado"], pacote: { conforto: 1, premium: 1 }, dicas: ["Para quem dirige: antirreflexo premium reduz o ofuscamento dos faróis à noite; solar polarizado para o dia."], peso: 1 },
  { id: "noite_foto", titulo: "Dirige + fotossensível", quando: (p) => (tem(p, "rotina", "motorista") || tem(p, "dirige_noite", "sim")) && tem(p, "fotofobia", "sim"), alertas: [{ nivel: "info", texto: "Fotossensível escurece pouco dentro do carro (o para-brisa filtra UV). Para dirigir, prefira solar polarizado." }] },
  { id: "ar_livre", titulo: "Ao ar livre", quando: (p) => tem(p, "rotina", "ar_livre") || tem(p, "rotina", "construcao"), lente: { fotossensivel: true }, complementos: ["fotossensivel", "polarizado"], pacote: { conforto: 1 }, dicas: ["Passa o dia no sol: fotossensível protege do UV e evita trocar de óculos toda hora."] },
  { id: "construcao", titulo: "Construção / indústria", quando: (p) => tem(p, "rotina", "construcao"), lente: { resistente: true }, alertas: [{ nivel: "info", texto: "Óculos de grau comum não substitui EPI. Para risco de impacto, indique óculos de segurança com grau." }] },
  { id: "saude_prof", titulo: "Profissional da saúde", quando: (p) => tem(p, "rotina", "saude"), dicas: ["Rotina de plantão: armação leve e resistente, lente com antirreflexo para luz forte do ambiente."], complementos: ["antirreflexo", "spray"] },
  { id: "esporte", titulo: "Pratica esporte", quando: (p) => algum(p, "esporte", ["corrida", "coletivo", "ciclismo"]), complementos: ["lente_contato", "clip_on"], dicas: ["Para esporte, lente de contato dá liberdade; se for de óculos, armação TR90 flexível."] },
  { id: "praia", titulo: "Praia / piscina", quando: (p) => tem(p, "esporte", "praia"), complementos: ["polarizado", "segundo_par_solar"] },
  { id: "quebra", titulo: "Quebra muito", quando: (p) => tem(p, "quebra_muito", "sim"), lente: { resistente: true }, complementos: ["garantia", "estojo"], dicas: ["Quem quebra muito: armação flexível (TR90/silicone) + garantia estendida. Argumento: 'sai mais barato do que refazer'."], peso: 1 },

  // ---------- luz e queixas ----------
  { id: "fotofobia", titulo: "Sensível à luz", quando: (p) => tem(p, "fotofobia", "sim") || tem(p, "queixas", "reflexo"), lente: { fotossensivel: true }, complementos: ["fotossensivel", "antirreflexo"], pacote: { conforto: 1 }, dicas: ["Sensibilidade à luz: fotossensível + antirreflexo. Mostre as cores no simulador (aba Fotossensível)."], peso: 1 },
  { id: "dor_cabeca", titulo: "Dor de cabeça / vista cansada", quando: (p) => algum(p, "queixas", ["dor_cabeca", "vista_cansada"]), perguntas: ["A dor aparece mais no fim do dia ou depois de usar telas?", "Quando fez o último exame?"], complementos: ["exame", "filtro_azul"], alertas: [{ nivel: "info", texto: "Queixa de dor de cabeça: se a receita for antiga, sugira reavaliação. Não associe a dor a diagnóstico." }] },
  { id: "embacada", titulo: "Visão embaçada", quando: (p) => tem(p, "queixas", "embacada"), alertas: [{ nivel: "atencao", texto: "Visão embaçada relatada: recomende avaliação com oftalmologista, especialmente se for repentina." }], complementos: ["exame"] },

  // ---------- perfil comercial ----------
  { id: "primeiro_oculos", titulo: "Primeiro óculos", quando: (p) => tem(p, "primeiro_oculos", "sim"), dicas: ["Primeiro óculos: explique cuidados (limpeza, estojo) e o período de adaptação de alguns dias."], complementos: ["estojo", "spray"] },
  { id: "cliente_antigo", titulo: "Já é cliente", quando: (p) => tem(p, "cliente", "sim"), dicas: ["Cliente da casa: confira o histórico e o saldo de cashback — use como argumento de fechamento."], perguntas: ["Como foi a experiência com o último óculos que fez aqui?"] },
  { id: "novo_cliente", titulo: "Cliente novo", quando: (p) => tem(p, "cliente", "nao"), dicas: ["Cliente novo: cadastre com WhatsApp e explique o programa de cashback — ele volta para usar."] },
  { id: "estetica", titulo: "Prioriza estética", quando: (p) => tem(p, "prioridade", "estetica"), pacote: { premium: 1 }, dicas: ["Prioriza estética: leve várias armações para o espelho e elogie o que valoriza o rosto."] },
  { id: "conforto", titulo: "Prioriza conforto", quando: (p) => tem(p, "prioridade", "conforto"), pacote: { conforto: 2 }, dicas: ["Conforto: armação leve (titânio/TR90) e lente fina fazem diferença no uso diário."] },
  { id: "durabilidade", titulo: "Prioriza durabilidade", quando: (p) => tem(p, "prioridade", "durabilidade"), complementos: ["garantia"], pacote: { conforto: 1, premium: 1 } },
  { id: "sol", titulo: "Quer óculos de sol", quando: (p) => tem(p, "extras", "sol"), complementos: ["segundo_par_solar", "clip_on", "polarizado"] },
  { id: "segundo_par", titulo: "Quer 2º par", quando: (p) => tem(p, "extras", "segundo_par"), complementos: ["segundo_par_solar"], dicas: ["2º par: ofereça condição especial no segundo óculos (reserva ou solar com grau)."] },
  { id: "lc_usa", titulo: "Usa lente de contato", quando: (p) => tem(p, "lente_contato", "usa") || tem(p, "lente_contato", "interesse"), complementos: ["lente_contato"], perguntas: ["Qual lente usa hoje e de quanto em quanto tempo troca?"] },
  { id: "urgencia", titulo: "Precisa rápido", quando: (p) => tem(p, "urgencia", "sim"), alertas: [{ nivel: "info", texto: "Urgência: confira o prazo do laboratório da lente escolhida antes de prometer data." }] },
  { id: "convenio", titulo: "Convênio", quando: (p) => tem(p, "convenio", "sim"), perguntas: ["Qual o convênio? Está com a carteirinha?"], dicas: ["Convênio: aplique o desconto na venda e mostre o valor final já com o benefício."] },

  // ---------- estilo ----------
  { id: "rosto_redondo", titulo: "Rosto redondo", quando: (p) => tem(p, "rosto", "redondo"), dicas: ["Rosto redondo: armações retangulares ou quadradas alongam o rosto."] },
  { id: "rosto_quadrado", titulo: "Rosto quadrado", quando: (p) => tem(p, "rosto", "quadrado"), dicas: ["Rosto quadrado: formatos redondos ou ovais suavizam os traços."] },
  { id: "rosto_oval", titulo: "Rosto oval", quando: (p) => tem(p, "rosto", "oval"), dicas: ["Rosto oval combina com quase tudo — explore tendências e cores."] },
  { id: "rosto_coracao", titulo: "Rosto coração", quando: (p) => tem(p, "rosto", "coracao"), dicas: ["Rosto coração: armações ovais, gatinho ou com a parte de baixo mais marcada equilibram o queixo."] },

  // ---------- saúde (encaminhamento) ----------
  { id: "diabetes", titulo: "Diabetes", quando: (p) => tem(p, "saude", "diabetes"), alertas: [{ nivel: "urgente", texto: "Diabetes: recomende acompanhamento anual com oftalmologista (exame de fundo de olho). Não é papel da ótica diagnosticar." }] },
  { id: "pressao", titulo: "Pressão alta", quando: (p) => tem(p, "saude", "pressao"), alertas: [{ nivel: "atencao", texto: "Pressão alta: oriente consulta periódica com oftalmologista." }] },
  { id: "glaucoma", titulo: "Glaucoma na família", quando: (p) => tem(p, "saude", "glaucoma_familia"), alertas: [{ nivel: "atencao", texto: "Histórico de glaucoma na família: oriente medir a pressão ocular com oftalmologista." }] },
];

// =====================================================================
// AVALIAÇÃO
// =====================================================================
export interface Avaliacao {
  disparadas: Regra[];
  dicas: string[];
  perguntas: string[];
  alertas: Alerta[];
  complementos: { id: string; pontos: number }[];
  pontosPacote: Record<Tier, number>;
  afinidade: Record<Tier, number>; // 0-100
  recomendado: Tier;
  lente: PreferenciaLente;
}

const uniq = <T,>(a: T[]) => [...new Set(a)];

export function avaliar(p: Perfil): Avaliacao {
  const disparadas = REGRAS.filter((r) => {
    try {
      return r.quando(p);
    } catch {
      return false;
    }
  });
  // pontuação base para que sempre haja um pacote sugerido
  const pontosPacote: Record<Tier, number> = { essencial: 1, conforto: 1.5, premium: 1 };
  const comp = new Map<string, number>();
  const lente: PreferenciaLente = {};
  for (const r of disparadas) {
    const peso = r.peso ?? 1;
    for (const t of TIERS) pontosPacote[t] += (r.pacote?.[t] ?? 0) * peso;
    for (const c of r.complementos ?? []) comp.set(c, (comp.get(c) ?? 0) + peso);
    if (r.lente) {
      // a primeira regra que define o tipo vence (ordem de REGRAS); demais flags somam
      const { tipo, indiceMin, ...flags } = r.lente;
      if (tipo && !lente.tipo) lente.tipo = tipo;
      if (indiceMin) lente.indiceMin = Math.max(lente.indiceMin ?? 0, indiceMin);
      Object.assign(lente, Object.fromEntries(Object.entries(flags).filter(([, v]) => v)));
    }
  }
  const total = TIERS.reduce((a, t) => a + pontosPacote[t], 0);
  const afinidade = Object.fromEntries(TIERS.map((t) => [t, Math.round((pontosPacote[t] / total) * 100)])) as Record<Tier, number>;
  const recomendado = TIERS.reduce((best, t) => (pontosPacote[t] > pontosPacote[best] ? t : best), "conforto" as Tier);
  const ordemNivel = { urgente: 0, atencao: 1, info: 2 } as const;
  return {
    disparadas,
    dicas: uniq(disparadas.flatMap((r) => r.dicas ?? [])),
    perguntas: uniq(disparadas.flatMap((r) => r.perguntas ?? [])),
    alertas: uniq(disparadas.flatMap((r) => r.alertas ?? []).map((a) => JSON.stringify(a)))
      .map((s) => JSON.parse(s) as Alerta)
      .sort((a, b) => ordemNivel[a.nivel] - ordemNivel[b.nivel]),
    complementos: [...comp.entries()].map(([id, pontos]) => ({ id, pontos })).sort((a, b) => b.pontos - a.pontos),
    pontosPacote,
    afinidade,
    recomendado,
    lente,
  };
}
