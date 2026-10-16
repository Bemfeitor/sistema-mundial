// Descrição das tabelas para o agente de IA (listar_tabelas). Dinheiro em centavos inteiros (*_cents).
import type { TableName } from "@/lib/types";

export const TABLE_INFO: Record<TableName, { descricao: string; colunas: string }> = {
  stores: { descricao: "Lojas da rede.", colunas: "id, name, code, cnpj, phone, address, active, created_at, updated_at" },
  departments: { descricao: "Departamentos internos.", colunas: "id, name, description, active" },
  employees: {
    descricao: "Funcionários/usuários (vendedores, gerentes, caixa etc.) com permissões, limite de desconto (%) e regras de comissão.",
    colunas: "id, name, email, phone, role (admin|gerente|vendedor|caixa|optometrista|tecnico|financeiro|estoquista), store_id, department_id, permissions (array), discount_limit, commission_rules (jsonb [{category, percent}]), auth_user_id, active",
  },
  customers: {
    descricao: "Clientes. level = nível de fidelidade; card_token = token do cartão fidelidade; consentimentos LGPD.",
    colunas: "id, name, cpf, phone, email, birth (YYYY-MM-DD), gender (F|M|O), address, city, profession, store_id, seller_id, insurer_id, level (Novo|Silver|Gold|Black|VIP), card_token, consent_program, consent_marketing, consent_version, notes, last_purchase_at",
  },
  prescriptions: {
    descricao: "Receitas/exames de refração dos clientes (OD = olho direito, OE = olho esquerdo).",
    colunas: "id, customer_id, exam_date, valid_until, professional, od (jsonb {sph, cyl, axis, add, dnp, height, prism}), oe (jsonb), notes",
  },
  suppliers: { descricao: "Fornecedores, distribuidores e laboratórios.", colunas: "id, name, kind (laboratorio|fornecedor|distribuidor), cnpj, phone, email, contact, lead_days, active" },
  products: {
    descricao: "Catálogo: armações, lentes, solares, lentes de contato, acessórios e serviços.",
    colunas: "id, sku, barcode, name, category (armacao|lente|solar|lente_contato|acessorio|servico), brand, line, tier (essencial|conforto|premium), supplier_id, price_cents, cost_cents, frame (jsonb), lens (jsonb {type, index, treatments, sph_min, sph_max, cyl_max, lab_days, photochromic, blue_filter}), tags (array), active",
  },
  stock: { descricao: "Saldo de estoque por produto e loja.", colunas: "id, product_id, store_id, qty, min_qty, location" },
  stock_movements: {
    descricao: "Movimentos de estoque (qty positivo = entrada, negativo = saída).",
    colunas: "id, product_id, store_id, qty, kind (entrada|saida|venda|ajuste|transferencia|devolucao|inventario), reference, employee_id, note, created_at",
  },
  transfers: { descricao: "Transferências de estoque entre lojas.", colunas: "id, from_store_id, to_store_id, items (jsonb [{product_id, qty}]), status (solicitada|enviada|recebida|cancelada), employee_id, note" },
  purchase_orders: {
    descricao: "Pedidos de compra a fornecedores.",
    colunas: "id, number, supplier_id, store_id, items (jsonb [{product_id, qty, cost_cents}]), total_cents, status (rascunho|enviado|recebido_parcial|recebido|cancelado), expected_at, employee_id, note",
  },
  sales: {
    descricao: "Vendas. items e payments são jsonb. Use status = concluida para faturamento.",
    colunas: "id, number, store_id, customer_id, seller_id, quote_id, prescription_id, items (jsonb [{product_id, name, category, qty, price_cents, cost_cents, role}]), subtotal_cents, discount_cents, total_cents, cost_cents, payments (jsonb [{method, amount_cents, installments}]), commission_cents, cashback_cents, status (concluida|cancelada), warranty_until, note, created_at",
  },
  lab_orders: {
    descricao: "Ordens de serviço (OS) de laboratório e montagem dos óculos.",
    colunas: "id, number, sale_id, store_id, customer_id, supplier_id, description, status (aguardando_pedido|pedido_enviado|em_producao|recebido|em_montagem|conferencia|pronto|cliente_avisado|entregue|pendencia|retrabalho|devolvido_lab|cancelado), due_at, responsible_id, checklist (jsonb), history (jsonb [{at, status, by, note}])",
  },
  quotes: {
    descricao: "Orçamentos feitos no balcão.",
    colunas: "id, store_id, seller_id, customer_id, customer_name, profile (jsonb), package_tier, items (jsonb), total_cents, ai_summary, status (aberto|convertido|perdido), sale_id",
  },
  opportunities: {
    descricao: "Oportunidades de CRM (relacionamento e recompra).",
    colunas: "id, customer_id, store_id, owner_id, kind (pos_venda|orcamento|aniversario|reexame|cashback|reativacao|indicacao), status (nova|em_contato|agendado|convertida|perdida), next_contact_at, note",
  },
  messages: {
    descricao: "Mensagens preparadas para clientes. Só são enviadas após validação humana.",
    colunas: "id, customer_id, kind, channel (whatsapp|email|sms), text, status (para_validar|aprovada|enviada|cancelada), prepared_by",
  },
  receivables: {
    descricao: "Contas a receber (crediário, boletos, convênios).",
    colunas: "id, store_id, customer_id, sale_id, description, due_at, amount_cents, paid_cents, status (aberto|pago|vencido|cancelado)",
  },
  payables: {
    descricao: "Contas a pagar.",
    colunas: "id, store_id, supplier_id, category, description, due_at, amount_cents, paid_cents, status (aberto|pago|vencido|cancelado)",
  },
  cash_sessions: {
    descricao: "Sessões de caixa (abertura/fechamento).",
    colunas: "id, store_id, opened_by, opening_cents, closed_at, closed_by, closing_cents, expected_cents, status (aberto|fechado)",
  },
  cash_movements: {
    descricao: "Movimentos do caixa.",
    colunas: "id, session_id, store_id, kind (venda|suprimento|sangria|recebimento|pagamento), method, amount_cents, reference, employee_id",
  },
  campaigns: {
    descricao: "Campanhas de cashback/fidelidade.",
    colunas: "id, name, active, percent, min_cents, max_cents, valid_days, delay_days, max_use_percent, categories (jsonb), store_id, starts_at, ends_at",
  },
  benefits: {
    descricao: "Benefícios dos clientes (cashback, crédito, presente, cupom) com saldo restante.",
    colunas: "id, customer_id, kind (cashback|credito|presente|cupom), name, initial_cents, remaining_cents, available_at, expires_at, campaign_id, sale_id",
  },
  benefit_movements: { descricao: "Extrato de concessão/uso de benefícios.", colunas: "id, benefit_id, customer_id, amount_cents, reason, employee_id, sale_id" },
  goals: { descricao: "Metas mensais por loja (employee_id nulo) ou por vendedor.", colunas: "id, store_id, employee_id, month (YYYY-MM), target_cents" },
  appointments: {
    descricao: "Agenda de exames, ajustes e entregas.",
    colunas: "id, store_id, customer_id, customer_name, phone, professional_id, starts_at, kind (exame|ajuste|entrega|adaptacao_lc), status (agendado|confirmado|realizado|faltou|cancelado), note",
  },
  insurers: { descricao: "Convênios/parcerias com desconto.", colunas: "id, name, discount_percent, contact, active" },
  audit_log: {
    descricao: "Log de auditoria (somente leitura).",
    colunas: "id, actor_id, actor_name, source (app|agente|sistema), action, table_name, record_id, before_data, after_data, store_id, created_at",
  },
  agent_tokens: { descricao: "Tokens de agentes (não consultável).", colunas: "—" },
};
