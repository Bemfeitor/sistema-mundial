// =====================================================================
// CAMPOS DO BALCÃO — configuração fácil de editar
// ---------------------------------------------------------------------
// Cada campo vira um grupo de "chips" de 1 clique na tela /atendimento.
//
// Para ACRESCENTAR um campo novo:
//   1. Copie um bloco { id, rotulo, grupo, tipo, opcoes } abaixo.
//   2. Use um `id` único, sem acento nem espaço (ex.: "usa_tablet").
//   3. `tipo: "unico"`  → o vendedor escolhe só uma opção (clicar de novo desmarca).
//      `tipo: "multi"`  → pode marcar várias opções.
//   4. `obrigatorio: true` faz o campo aparecer no topo e conta no progresso.
//   5. Depois, se quiser que o campo gere dicas/pacotes, crie uma regra em
//      src/lib/balcao/regras.ts usando tem(p, "<id>", "<valor>").
//
// Nada aqui depende do servidor: pode editar à vontade.
// =====================================================================

export interface Opcao {
  valor: string;
  rotulo: string;
}

export interface Campo {
  id: string;
  rotulo: string;
  grupo: GrupoId;
  tipo: "unico" | "multi";
  opcoes: Opcao[];
  obrigatorio?: boolean;
  ajuda?: string;
}

/** Perfil do cliente montado pelos cliques: id do campo → valor (ou lista de valores). */
export type Perfil = Record<string, string | string[] | undefined>;

export const GRUPOS = {
  essencial: "Essencial (pergunte primeiro)",
  receita: "Receita e saúde visual",
  rotina: "Rotina e uso",
  preferencias: "Preferências e investimento",
  estilo: "Estilo, extras e condições",
} as const;
export type GrupoId = keyof typeof GRUPOS;

const o = (valor: string, rotulo: string): Opcao => ({ valor, rotulo });

export const CAMPOS: Campo[] = [
  // ---------------- Obrigatórios (pedidos pelo dono) ----------------
  {
    id: "idade",
    rotulo: "Faixa de idade",
    grupo: "essencial",
    tipo: "unico",
    obrigatorio: true,
    opcoes: [o("crianca", "Criança (0-12)"), o("adolescente", "Adolescente (13-17)"), o("18_39", "18 a 39"), o("40_59", "40 a 59"), o("60_mais", "60+")],
  },
  {
    id: "cliente",
    rotulo: "Já é cliente?",
    grupo: "essencial",
    tipo: "unico",
    obrigatorio: true,
    opcoes: [o("sim", "Cliente"), o("nao", "Não cliente")],
    ajuda: "Se for cliente, busque pelo nome ou telefone para carregar histórico, receita e cashback.",
  },
  { id: "primeiro_oculos", rotulo: "Primeiro óculos?", grupo: "essencial", tipo: "unico", obrigatorio: true, opcoes: [o("sim", "Sim, primeiro"), o("nao", "Já usa")] },
  { id: "sexo", rotulo: "Sexo", grupo: "essencial", tipo: "unico", obrigatorio: true, opcoes: [o("homem", "Homem"), o("mulher", "Mulher")] },
  {
    id: "tipo_oculos",
    rotulo: "Tipo de óculos",
    grupo: "essencial",
    tipo: "unico",
    obrigatorio: true,
    opcoes: [o("perto", "Perto (leitura)"), o("longe", "Longe"), o("multifocal", "Multifocal"), o("infantil", "Infantil (criança)")],
  },

  // ---------------- Receita e saúde visual ----------------
  { id: "receita", rotulo: "Tem receita?", grupo: "receita", tipo: "unico", opcoes: [o("valida", "Sim, válida"), o("vencida", "Vencida"), o("nao_tem", "Não tem")] },
  {
    id: "grau_alto",
    rotulo: "Grau alto?",
    grupo: "receita",
    tipo: "unico",
    opcoes: [o("nao", "Grau baixo/médio"), o("miopia_alta", "Miopia > 4"), o("hiper_alta", "Hipermetropia > 4"), o("astig_alto", "Astigmatismo alto"), o("nao_sei", "Não sei")],
  },
  {
    id: "queixas",
    rotulo: "Queixas",
    grupo: "receita",
    tipo: "multi",
    opcoes: [o("dor_cabeca", "Dor de cabeça"), o("vista_cansada", "Vista cansada"), o("embacada", "Visão embaçada"), o("reflexo", "Reflexo/ofuscamento"), o("tontura_multi", "Tontura com multifocal anterior")],
  },
  { id: "ja_multifocal", rotulo: "Já usou multifocal?", grupo: "receita", tipo: "unico", opcoes: [o("adaptou", "Usou e adaptou"), o("nao_adaptou", "Não adaptou"), o("nunca", "Nunca usou")] },
  { id: "fotofobia", rotulo: "Sensível à luz (fotofobia)?", grupo: "receita", tipo: "unico", opcoes: [o("sim", "Sim"), o("nao", "Não")] },
  { id: "lente_contato", rotulo: "Lente de contato", grupo: "receita", tipo: "unico", opcoes: [o("usa", "Já usa"), o("interesse", "Tem interesse"), o("nao", "Não")] },

  // ---------------- Rotina e uso ----------------
  { id: "telas", rotulo: "Uso de telas por dia", grupo: "rotina", tipo: "unico", opcoes: [o("pouco", "Pouco"), o("4_8", "4 a 8 h"), o("mais_8", "Mais de 8 h")] },
  {
    id: "rotina",
    rotulo: "Profissão / rotina",
    grupo: "rotina",
    tipo: "multi",
    opcoes: [o("escritorio", "Escritório"), o("motorista", "Motorista"), o("ar_livre", "Ao ar livre"), o("estudante", "Estudante"), o("saude", "Saúde"), o("construcao", "Construção/indústria")],
  },
  { id: "dirige_noite", rotulo: "Dirige à noite?", grupo: "rotina", tipo: "unico", opcoes: [o("sim", "Sim"), o("nao", "Não")] },
  {
    id: "esporte",
    rotulo: "Esportes / atividade",
    grupo: "rotina",
    tipo: "multi",
    opcoes: [o("corrida", "Corrida/academia"), o("coletivo", "Futebol/coletivos"), o("praia", "Praia/piscina"), o("ciclismo", "Ciclismo/moto")],
  },
  { id: "quebra_muito", rotulo: "Quebra muito / criança ativa?", grupo: "rotina", tipo: "unico", opcoes: [o("sim", "Sim"), o("nao", "Não")] },

  // ---------------- Preferências ----------------
  { id: "investimento", rotulo: "Faixa de investimento", grupo: "preferencias", tipo: "unico", opcoes: [o("economico", "Econômico"), o("intermediario", "Intermediário"), o("premium", "Premium")] },
  {
    id: "prioridade",
    rotulo: "O que mais importa",
    grupo: "preferencias",
    tipo: "multi",
    opcoes: [o("preco", "Preço"), o("estetica", "Estética"), o("conforto", "Conforto"), o("durabilidade", "Durabilidade")],
  },
  { id: "extras", rotulo: "Quer também", grupo: "preferencias", tipo: "multi", opcoes: [o("sol", "Óculos de sol"), o("segundo_par", "2º par")] },
  { id: "urgencia", rotulo: "Urgência no prazo?", grupo: "preferencias", tipo: "unico", opcoes: [o("sim", "Precisa rápido"), o("nao", "Prazo normal")] },
  { id: "convenio", rotulo: "Convênio?", grupo: "preferencias", tipo: "unico", opcoes: [o("sim", "Tem convênio"), o("nao", "Particular")] },

  // ---------------- Estilo e condições ----------------
  { id: "rosto", rotulo: "Formato do rosto", grupo: "estilo", tipo: "unico", opcoes: [o("redondo", "Redondo"), o("quadrado", "Quadrado"), o("oval", "Oval"), o("coracao", "Coração")] },
  {
    id: "saude",
    rotulo: "Condições de saúde",
    grupo: "estilo",
    tipo: "multi",
    opcoes: [o("diabetes", "Diabetes"), o("pressao", "Pressão alta"), o("glaucoma_familia", "Glaucoma na família")],
    ajuda: "Pede encaminhamento ao oftalmologista — o sistema não faz diagnóstico.",
  },
];

export const CAMPOS_OBRIGATORIOS = CAMPOS.filter((c) => c.obrigatorio);

export const campoPorId = (id: string) => CAMPOS.find((c) => c.id === id);

/** Rótulo legível de um valor (ou lista). */
export function rotuloValor(campoId: string, v: string | string[] | undefined) {
  const c = campoPorId(campoId);
  if (!c || v == null) return "";
  const vals = Array.isArray(v) ? v : [v];
  return vals.map((x) => c.opcoes.find((op) => op.valor === x)?.rotulo ?? x).join(", ");
}
