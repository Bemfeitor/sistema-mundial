// Entidades do sistema. Dinheiro sempre em centavos inteiros (*_cents).
// Nomes das tabelas = chaves de TableMap (iguais ao schema Supabase).

export type ID = string;

export interface Base {
  id: ID;
  created_at: string;
  updated_at?: string | null;
}

export interface Store extends Base {
  name: string;
  code: string;
  cnpj?: string | null;
  phone?: string | null;
  address?: string | null;
  active: boolean;
}

export interface Department extends Base {
  name: string;
  description?: string | null;
  active: boolean;
}

export type Role =
  | "admin"
  | "gerente"
  | "vendedor"
  | "caixa"
  | "optometrista"
  | "tecnico"
  | "financeiro"
  | "estoquista";

export const PERMISSIONS = [
  "vender",
  "desconto",
  "caixa",
  "financeiro",
  "estoque",
  "compras",
  "os",
  "clientes",
  "fidelidade",
  "crm",
  "relatorios",
  "consolidado",
  "administrar",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface CommissionRule {
  category: string | "*";
  percent: number;
}

export interface Employee extends Base {
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  store_id: ID;
  department_id?: ID | null;
  permissions: Permission[];
  discount_limit: number; // %
  commission_rules: CommissionRule[];
  auth_user_id?: string | null;
  active: boolean;
}

export type CustomerLevel = "Novo" | "Silver" | "Gold" | "Black" | "VIP";

export interface Customer extends Base {
  name: string;
  cpf?: string | null;
  phone?: string | null;
  email?: string | null;
  birth?: string | null; // YYYY-MM-DD
  gender?: "F" | "M" | "O" | null;
  address?: string | null;
  city?: string | null;
  profession?: string | null;
  store_id: ID;
  seller_id?: ID | null;
  insurer_id?: ID | null;
  level: CustomerLevel;
  card_token: string;
  consent_program: boolean;
  consent_marketing: boolean;
  consent_version?: string | null;
  notes?: string | null;
  last_purchase_at?: string | null;
}

export interface RxEye {
  sph?: number | null;
  cyl?: number | null;
  axis?: number | null;
  add?: number | null;
  dnp?: number | null;
  height?: number | null;
  prism?: string | null;
}

export interface Prescription extends Base {
  customer_id: ID;
  exam_date: string;
  valid_until?: string | null;
  professional?: string | null;
  od: RxEye;
  oe: RxEye;
  notes?: string | null;
}

export interface Supplier extends Base {
  name: string;
  kind: "laboratorio" | "fornecedor" | "distribuidor";
  cnpj?: string | null;
  phone?: string | null;
  email?: string | null;
  contact?: string | null;
  lead_days?: number | null;
  active: boolean;
}

export type ProductCategory =
  | "armacao"
  | "lente"
  | "solar"
  | "lente_contato"
  | "acessorio"
  | "servico";

export type LensType = "visao_simples" | "multifocal" | "bifocal" | "ocupacional";

export interface Product extends Base {
  sku: string;
  barcode?: string | null;
  name: string;
  category: ProductCategory;
  brand?: string | null;
  line?: string | null; // família/linha
  tier?: "essencial" | "conforto" | "premium" | null;
  supplier_id?: ID | null;
  price_cents: number;
  cost_cents: number;
  // armação
  frame?: {
    model?: string;
    color?: string;
    size?: string; // ex 52-18-140
    material?: string;
    shape?: string;
    gender?: string;
  } | null;
  // lente
  lens?: {
    type?: LensType;
    index?: number;
    treatments?: string[];
    sph_min?: number;
    sph_max?: number;
    cyl_max?: number;
    lab_days?: number;
    photochromic?: boolean;
    blue_filter?: boolean;
  } | null;
  tags?: string[];
  active: boolean;
}

export interface StockItem extends Base {
  product_id: ID;
  store_id: ID;
  qty: number;
  min_qty: number;
  location?: string | null;
}

export interface StockMovement extends Base {
  product_id: ID;
  store_id: ID;
  qty: number; // + entrada / - saída
  kind: "entrada" | "saida" | "venda" | "ajuste" | "transferencia" | "devolucao" | "inventario";
  reference?: string | null;
  employee_id?: ID | null;
  note?: string | null;
}

export interface Transfer extends Base {
  from_store_id: ID;
  to_store_id: ID;
  items: { product_id: ID; qty: number }[];
  status: "solicitada" | "enviada" | "recebida" | "cancelada";
  employee_id?: ID | null;
  note?: string | null;
}

export interface PurchaseOrder extends Base {
  number: string;
  supplier_id: ID;
  store_id: ID;
  items: { product_id: ID; qty: number; cost_cents: number; received?: number }[];
  total_cents: number;
  status: "rascunho" | "enviado" | "recebido_parcial" | "recebido" | "cancelado";
  expected_at?: string | null;
  employee_id?: ID | null;
  note?: string | null;
}

export interface SaleItem {
  product_id: ID;
  name: string;
  category: ProductCategory;
  qty: number;
  price_cents: number;
  cost_cents: number;
  role?: "principal" | "adicional" | "segundo_par" | "upgrade";
}

export type PaymentMethod =
  | "dinheiro"
  | "pix"
  | "debito"
  | "credito"
  | "credito_parcelado"
  | "boleto"
  | "crediario"
  | "cashback"
  | "convenio";

export interface Payment {
  method: PaymentMethod;
  amount_cents: number;
  installments?: number;
  brand?: string | null;
  nsu?: string | null;
}

export interface Sale extends Base {
  number: string;
  store_id: ID;
  customer_id?: ID | null;
  seller_id: ID;
  quote_id?: ID | null;
  prescription_id?: ID | null;
  items: SaleItem[];
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  cost_cents: number;
  payments: Payment[];
  commission_cents: number;
  cashback_cents: number;
  status: "concluida" | "cancelada";
  warranty_until?: string | null;
  note?: string | null;
}

export const LAB_STATUSES = [
  "aguardando_pedido",
  "pedido_enviado",
  "em_producao",
  "recebido",
  "em_montagem",
  "conferencia",
  "pronto",
  "cliente_avisado",
  "entregue",
] as const;
export const LAB_EXCEPTIONS = ["pendencia", "retrabalho", "devolvido_lab", "cancelado"] as const;
export type LabStatus = (typeof LAB_STATUSES)[number] | (typeof LAB_EXCEPTIONS)[number];

export interface LabOrder extends Base {
  number: string;
  sale_id: ID;
  store_id: ID;
  customer_id?: ID | null;
  supplier_id?: ID | null; // laboratório
  description: string;
  status: LabStatus;
  due_at?: string | null;
  responsible_id?: ID | null;
  checklist: Record<string, boolean>;
  history: { at: string; status: LabStatus; by?: string; note?: string }[];
}

export interface Quote extends Base {
  store_id: ID;
  seller_id: ID;
  customer_id?: ID | null;
  customer_name?: string | null;
  profile: Record<string, string | string[] | boolean | number | null>;
  package_tier?: string | null;
  items: SaleItem[];
  total_cents: number;
  ai_summary?: string | null;
  status: "aberto" | "convertido" | "perdido";
  sale_id?: ID | null;
}

export interface Opportunity extends Base {
  customer_id: ID;
  store_id: ID;
  owner_id?: ID | null;
  kind: "pos_venda" | "orcamento" | "aniversario" | "reexame" | "cashback" | "reativacao" | "indicacao";
  status: "nova" | "em_contato" | "agendado" | "convertida" | "perdida";
  next_contact_at?: string | null;
  note?: string | null;
  /** Campos de reativação (Atendimento Guiado) — só para kind "reativacao". */
  reativacao?: Reativacao | null;
}

export const ATTENDANCE_STAGES = [
  "nao_iniciado",
  "aguardando_resposta",
  "cliente_respondeu",
  "em_atendimento",
  "vai_pensar",
  "visita_combinada",
  "aguardando_consulta",
  "venda_concluida",
  "encerrado",
  "encerrado_sem_resposta",
  "nao_quer_mensagens",
] as const;
export type AttendanceStage = (typeof ATTENDANCE_STAGES)[number];

export const RESPONSE_CLASSES = ["tudo_bem", "dificuldade_visual", "quer_trocar", "outra"] as const;
export type ResponseClass = (typeof RESPONSE_CLASSES)[number];

export interface Reativacao {
  years_since_purchase: 1 | 2 | 3 | 4; // 4 = "4 anos ou mais"
  original_seller?: string | null; // vendedor que veio da planilha
  attendance: AttendanceStage;
  response_class?: ResponseClass | null;
  flag?: "sem_contato" | "ja_houve_contato" | "retorno_pendente" | "nao_receber" | "repetido" | null;
  first_contact_at?: string | null;
  last_sent_at?: string | null;
  follow_up_at?: string | null;
  send_history: { at: string; employee_id?: string | null; employee_name: string; store_id: string; kind: "contato" | "retorno" }[];
  import_batch?: string | null;
}

export interface Message extends Base {
  customer_id: ID;
  kind: string;
  channel: "whatsapp" | "email" | "sms";
  text: string;
  status: "para_validar" | "aprovada" | "enviada" | "cancelada";
  prepared_by?: ID | null;
}

export interface Receivable extends Base {
  store_id: ID;
  customer_id?: ID | null;
  sale_id?: ID | null;
  description: string;
  due_at: string;
  amount_cents: number;
  paid_cents: number;
  paid_at?: string | null;
  status: "aberto" | "pago" | "vencido" | "cancelado";
}

export interface Payable extends Base {
  store_id: ID;
  supplier_id?: ID | null;
  category: string;
  description: string;
  due_at: string;
  amount_cents: number;
  paid_cents: number;
  paid_at?: string | null;
  status: "aberto" | "pago" | "vencido" | "cancelado";
}

export interface CashSession extends Base {
  store_id: ID;
  opened_by: ID;
  opening_cents: number;
  closed_at?: string | null;
  closed_by?: ID | null;
  closing_cents?: number | null;
  expected_cents?: number | null;
  status: "aberto" | "fechado";
}

export interface CashMovement extends Base {
  session_id: ID;
  store_id: ID;
  kind: "venda" | "suprimento" | "sangria" | "recebimento" | "pagamento";
  method: PaymentMethod;
  amount_cents: number;
  reference?: string | null;
  employee_id?: ID | null;
}

export interface Campaign extends Base {
  name: string;
  active: boolean;
  percent: number;
  min_cents: number;
  max_cents: number; // 0 = sem teto
  valid_days: number;
  delay_days: number;
  max_use_percent: number; // % máx do valor da recompra
  categories: ProductCategory[] | [];
  store_id?: ID | null;
  starts_at: string;
  ends_at: string;
}

export interface Benefit extends Base {
  customer_id: ID;
  kind: "cashback" | "credito" | "presente" | "cupom";
  name: string;
  initial_cents: number;
  remaining_cents: number;
  available_at: string;
  expires_at: string;
  campaign_id?: ID | null;
  sale_id?: ID | null;
}

export interface BenefitMovement extends Base {
  benefit_id: ID;
  customer_id: ID;
  amount_cents: number; // + concessão / - uso
  reason: string;
  employee_id?: ID | null;
  sale_id?: ID | null;
}

export interface Goal extends Base {
  store_id: ID;
  employee_id?: ID | null; // null = meta da loja
  month: string; // YYYY-MM
  target_cents: number;
}

export interface Appointment extends Base {
  store_id: ID;
  customer_id?: ID | null;
  customer_name: string;
  phone?: string | null;
  professional_id?: ID | null;
  starts_at: string;
  kind: "exame" | "ajuste" | "entrega" | "adaptacao_lc";
  status: "agendado" | "confirmado" | "realizado" | "faltou" | "cancelado";
  note?: string | null;
}

export interface Insurer extends Base {
  name: string;
  discount_percent: number;
  contact?: string | null;
  active: boolean;
}

export interface AuditLog extends Base {
  actor_id?: ID | null;
  actor_name: string;
  source: "app" | "agente" | "sistema";
  action: string;
  table_name: string;
  record_id?: ID | null;
  before_data?: unknown;
  after_data?: unknown;
  store_id?: ID | null;
}

export interface AgentToken extends Base {
  name: string;
  token_hash: string;
  prefix: string;
  scope: "leitura" | "total";
  employee_id: ID;
  last_used_at?: string | null;
  active: boolean;
}

export interface TableMap {
  stores: Store;
  departments: Department;
  employees: Employee;
  customers: Customer;
  prescriptions: Prescription;
  suppliers: Supplier;
  products: Product;
  stock: StockItem;
  stock_movements: StockMovement;
  transfers: Transfer;
  purchase_orders: PurchaseOrder;
  sales: Sale;
  lab_orders: LabOrder;
  quotes: Quote;
  opportunities: Opportunity;
  messages: Message;
  receivables: Receivable;
  payables: Payable;
  cash_sessions: CashSession;
  cash_movements: CashMovement;
  campaigns: Campaign;
  benefits: Benefit;
  benefit_movements: BenefitMovement;
  goals: Goal;
  appointments: Appointment;
  insurers: Insurer;
  audit_log: AuditLog;
  agent_tokens: AgentToken;
}

export type TableName = keyof TableMap;
export const TABLES = [
  "stores",
  "departments",
  "employees",
  "customers",
  "prescriptions",
  "suppliers",
  "products",
  "stock",
  "stock_movements",
  "transfers",
  "purchase_orders",
  "sales",
  "lab_orders",
  "quotes",
  "opportunities",
  "messages",
  "receivables",
  "payables",
  "cash_sessions",
  "cash_movements",
  "campaigns",
  "benefits",
  "benefit_movements",
  "goals",
  "appointments",
  "insurers",
  "audit_log",
  "agent_tokens",
] as const satisfies readonly TableName[];
