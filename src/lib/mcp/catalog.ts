// Catálogo das ferramentas MCP (sem dependências de servidor: usado pela página /admin/agente e pelo servidor MCP).

export interface ToolInfo {
  name: string;
  title: string;
  description: string;
  write: boolean;
  destructive?: boolean;
}

export const MCP_TOOLS: ToolInfo[] = [
  // ---------- leitura ----------
  {
    name: "resumo_geral",
    title: "Resumo geral do dia e do mês",
    description:
      "KPIs por loja: faturamento, ticket médio, nº de vendas e margem do dia e do mês, meta do mês e % atingido, OS (óculos no laboratório) atrasadas, contas a pagar vencendo em 7 dias, contas vencidas e itens com estoque baixo. Use como primeira chamada para ter uma visão do negócio.",
    write: false,
  },
  {
    name: "listar_tabelas",
    title: "Listar tabelas do sistema",
    description:
      "Lista todas as tabelas consultáveis com descrição e colunas. Valores em dinheiro estão sempre em centavos inteiros (campos *_cents). Datas em ISO 8601.",
    write: false,
  },
  {
    name: "consultar",
    title: "Consultar registros de uma tabela",
    description:
      "Consulta genérica sobre qualquer tabela (exceto agent_tokens) com filtros de igualdade (eq), intervalo (gte/lte em uma coluna), busca textual em colunas, ordenação e limite (padrão 50, máx. 500). Use listar_tabelas antes para conhecer as colunas.",
    write: false,
  },
  {
    name: "obter",
    title: "Obter um registro por id",
    description: "Retorna um registro completo de uma tabela pelo id (uuid).",
    write: false,
  },
  {
    name: "vendas_periodo",
    title: "Vendas agregadas por período",
    description:
      "Agrega vendas concluídas entre duas datas (YYYY-MM-DD, fuso America/Sao_Paulo) agrupando por dia, loja, vendedor ou categoria de produto. Retorna nº de vendas, faturamento, custo, margem e ticket médio de cada grupo e o total.",
    write: false,
  },
  {
    name: "estoque_baixo",
    title: "Produtos com estoque baixo",
    description: "Lista produtos com saldo menor ou igual ao estoque mínimo, por loja, com nome, SKU, saldo, mínimo e sugestão de reposição.",
    write: false,
  },
  {
    name: "os_atrasadas",
    title: "Ordens de serviço atrasadas",
    description:
      "Lista OS de laboratório/montagem com prazo vencido e que ainda não foram entregues nem canceladas, com cliente, laboratório, status e dias de atraso.",
    write: false,
  },
  {
    name: "financeiro_resumo",
    title: "Resumo financeiro",
    description:
      "Total a receber e a pagar em aberto, valores vencidos e fluxo de caixa previsto para os próximos 30 dias (entradas, saídas e saldo por dia).",
    write: false,
  },
  {
    name: "cliente_360",
    title: "Visão 360º do cliente",
    description:
      "Tudo sobre um cliente: cadastro, compras, receitas (prescrições), benefícios/cashback com saldo, OS, oportunidades de CRM e mensagens. Informe o id ou um termo de busca (nome, CPF, telefone ou e-mail).",
    write: false,
  },
  {
    name: "desempenho_vendedores",
    title: "Desempenho dos vendedores",
    description:
      "Ranking dos vendedores no mês (YYYY-MM): nº de vendas, faturamento, ticket médio, margem, comissão, meta individual e % da meta.",
    write: false,
  },
  {
    name: "auditoria_recente",
    title: "Auditoria recente",
    description: "Últimos registros do log de auditoria (quem fez o quê, quando, em qual tabela), com filtros opcionais por tabela e origem.",
    write: false,
  },
  // ---------- escrita ----------
  {
    name: "criar_registro",
    title: "Criar registro",
    description:
      "Cria um registro em qualquer tabela (exceto audit_log e agent_tokens). Informe os campos conforme listar_tabelas; id e created_at são gerados automaticamente. Ação auditada com origem \"agente\".",
    write: true,
  },
  {
    name: "atualizar_registro",
    title: "Atualizar registro",
    description:
      "Atualiza campos de um registro (patch parcial) em qualquer tabela (exceto audit_log e agent_tokens). Ação auditada com antes/depois.",
    write: true,
  },
  {
    name: "excluir_registro",
    title: "Excluir registro",
    description:
      "Exclui definitivamente um registro (exceto audit_log e agent_tokens). Exige confirm: true. Prefira desativar (active=false) ou cancelar (status) quando possível. Ação auditada.",
    write: true,
    destructive: true,
  },
  {
    name: "registrar_conta_pagar",
    title: "Registrar conta a pagar",
    description: "Lança uma conta a pagar (valor em reais, vencimento YYYY-MM-DD, categoria, loja e fornecedor opcional). Ação auditada.",
    write: true,
  },
  {
    name: "baixar_conta",
    title: "Dar baixa em conta",
    description:
      "Registra pagamento (total ou parcial) de uma conta a pagar ou recebimento de uma conta a receber. Sem valor informado, quita o saldo restante. Ação auditada.",
    write: true,
  },
  {
    name: "criar_oportunidade_crm",
    title: "Criar oportunidade no CRM",
    description: "Cria uma oportunidade de relacionamento (pós-venda, reexame, aniversário, cashback, reativação etc.) para um cliente. Ação auditada.",
    write: true,
  },
  {
    name: "preparar_mensagem",
    title: "Preparar mensagem ao cliente",
    description:
      "Prepara uma mensagem (WhatsApp, e-mail ou SMS) para um cliente com status \"para_validar\". NUNCA envia: um funcionário precisa validar e enviar pela tela Mensagens. Ação auditada.",
    write: true,
  },
  {
    name: "ajustar_estoque",
    title: "Ajustar estoque",
    description:
      "Movimenta o estoque de um produto em uma loja (quantidade positiva = entrada, negativa = saída) e registra o movimento com motivo. Ação auditada.",
    write: true,
  },
  {
    name: "avancar_os",
    title: "Avançar status da OS",
    description: "Altera o status de uma OS de laboratório/montagem e adiciona uma nota ao histórico. Ação auditada.",
    write: true,
  },
];

export const toolInfo = (name: string) => {
  const t = MCP_TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`Ferramenta desconhecida: ${name}`);
  return t;
};
