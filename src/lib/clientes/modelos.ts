/** Modelos de mensagem com variáveis {nome}, {valor}, {validade}, {loja}, {data}. */
export interface Modelo {
  id: string;
  nome: string;
  canal: "whatsapp" | "sms" | "email";
  texto: string;
}

export const MODELOS: Modelo[] = [
  {
    id: "reativacao_primeiro_contato",
    nome: "Reativação — primeiro contato",
    canal: "whatsapp",
    texto:
      "Oi, {nome}! Tudo bem? 😊\n\nAqui é {vendedor}, da Ótica Mundial — {loja}. Queria saber como você está e como seus óculos estão atendendo no dia a dia.\n\nEstá enxergando bem para leitura, celular e direção? Se tiver percebido alguma mudança ou desconforto, me conte. Estou por aqui para ajudar. 💙",
  },
  {
    id: "reativacao_retorno",
    nome: "Reativação — retorno (48 h sem resposta)",
    canal: "whatsapp",
    texto:
      "Oi, {nome}! Tudo bem? 😊\n\nAqui é {vendedor}, da Ótica Mundial — {loja}. Passando para saber como você está e se seus óculos continuam confortáveis no dia a dia.\n\nSe quiser conversar ou precisar de um ajuste, estou por aqui. Conte conosco! 💙",
  },
  {
    id: "cashback_disponivel",
    nome: "Cashback disponível",
    canal: "whatsapp",
    texto:
      "Olá, {nome}! 🎉 Você tem *{valor}* de cashback disponível na Mundial Ótica. Válido até {validade}. Aproveite na sua próxima compra! Para mais informações, acesse seu cartão fidelidade pelo link enviado anteriormente.",
  },
  {
    id: "cashback_vencendo",
    nome: "Cashback a vencer",
    canal: "whatsapp",
    texto:
      "Oi, {nome}! ⚠️ Seu cashback de *{valor}* vence em {validade}. Não perca! Visite a Mundial Ótica e aproveite seu benefício. Dúvidas? Responda esta mensagem.",
  },
  {
    id: "aniversario",
    nome: "Aniversário",
    canal: "whatsapp",
    texto:
      "🎂 Feliz aniversário, {nome}! A equipe Mundial Ótica deseja a você um dia repleto de alegrias. Como presente, preparamos uma surpresa especial para você. Venha nos visitar em {loja}!",
  },
  {
    id: "reexame",
    nome: "Lembrete de reexame",
    canal: "whatsapp",
    texto:
      "Olá, {nome}! Sua última receita está próxima do vencimento ({validade}). É hora de agendar seu exame de vista! Entre em contato com a Mundial Ótica em {loja} para agendar. Cuidar da sua visão é importante!",
  },
  {
    id: "pos_venda",
    nome: "Pós-venda",
    canal: "whatsapp",
    texto:
      "Olá, {nome}! Esperamos que esteja satisfeito(a) com sua compra na Mundial Ótica. Como está a adaptação aos seus novos óculos? Qualquer dúvida ou ajuste necessário, estamos à disposição em {loja}.",
  },
  {
    id: "orcamento_followup",
    nome: "Seguimento de orçamento",
    canal: "whatsapp",
    texto:
      "Oi, {nome}! Temos seu orçamento pronto na Mundial Ótica. Ainda tem interesse? Podemos reservar o produto para você! Entre em contato ou venha visitar nossa loja em {loja}.",
  },
  {
    id: "reativacao",
    nome: "Reativação (sem compra há 12 meses)",
    canal: "whatsapp",
    texto:
      "Sentimos sua falta, {nome}! 👓 Faz um tempo que não te vemos aqui na Mundial Ótica. Temos novidades incríveis em armações e lentes. Venha conferir! Loja {loja}.",
  },
  {
    id: "agendamento_confirmacao",
    nome: "Confirmação de agendamento",
    canal: "whatsapp",
    texto:
      "Olá, {nome}! Confirmando seu agendamento na Mundial Ótica em {data} às {validade}. Local: {loja}. Se precisar remarcar, responda esta mensagem.",
  },
];

/** Substitui variáveis no texto do modelo. */
export function aplicarModelo(texto: string, vars: Record<string, string>): string {
  return texto.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}
