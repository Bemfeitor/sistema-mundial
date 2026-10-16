-- =====================================================================
-- Ótica Mundial — Sistema unificado
-- 0001_schema.sql — schema completo (espelha src/lib/types.ts)
--
-- Convenções:
--   * nomes de tabela = TABLES de src/lib/types.ts; colunas snake_case iguais aos campos
--   * id uuid default gen_random_uuid(); created_at timestamptz default now(); updated_at timestamptz
--   * dinheiro em centavos (bigint, colunas *_cents)
--   * objetos/arrays aninhados em jsonb (inclusive permissions/tags, para compatibilidade com o cliente)
--
-- Segurança (RLS):
--   * RLS habilitado em TODAS as tabelas.
--   * Leitura: usuário autenticado (Supabase Auth) vinculado a um employee ativo (public.is_employee()).
--   * Escrita: feita SOMENTE pelo servidor Next com a service role key, que ignora RLS (bypass).
--     Não há policies de insert/update/delete para "authenticated" — o navegador nunca escreve direto.
--   * audit_log e agent_tokens: sem leitura pelo cliente (só servidor).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Lojas, departamentos, pessoas
-- ---------------------------------------------------------------------
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  code text not null unique,
  cnpj text,
  phone text,
  address text,
  active boolean not null default true
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  description text,
  active boolean not null default true
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  email text not null unique,
  phone text,
  role text not null check (role in ('admin','gerente','vendedor','caixa','optometrista','tecnico','financeiro','estoquista')),
  store_id uuid not null references public.stores(id) on delete restrict,
  department_id uuid references public.departments(id) on delete set null,
  permissions jsonb not null default '[]'::jsonb,
  discount_limit numeric(5,2) not null default 0,
  commission_rules jsonb not null default '[]'::jsonb,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  active boolean not null default true
);
create index employees_store_id_idx on public.employees(store_id);

create table public.insurers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  discount_percent numeric(5,2) not null default 0,
  contact text,
  active boolean not null default true
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  cpf text,
  phone text,
  email text,
  birth date,
  gender text check (gender in ('F','M','O')),
  address text,
  city text,
  profession text,
  store_id uuid not null references public.stores(id) on delete restrict,
  seller_id uuid references public.employees(id) on delete set null,
  insurer_id uuid references public.insurers(id) on delete set null,
  level text not null default 'Novo' check (level in ('Novo','Silver','Gold','Black','VIP')),
  card_token text not null unique,
  consent_program boolean not null default false,
  consent_marketing boolean not null default false,
  consent_version text,
  notes text,
  last_purchase_at timestamptz
);
create index customers_store_id_idx on public.customers(store_id);
create index customers_created_at_idx on public.customers(created_at);
create index customers_cpf_idx on public.customers(cpf);
create index customers_phone_idx on public.customers(phone);

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  customer_id uuid not null references public.customers(id) on delete restrict,
  exam_date date not null,
  valid_until date,
  professional text,
  od jsonb not null default '{}'::jsonb,
  oe jsonb not null default '{}'::jsonb,
  notes text
);
create index prescriptions_customer_id_idx on public.prescriptions(customer_id);

-- ---------------------------------------------------------------------
-- Catálogo e estoque
-- ---------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  kind text not null check (kind in ('laboratorio','fornecedor','distribuidor')),
  cnpj text,
  phone text,
  email text,
  contact text,
  lead_days integer,
  active boolean not null default true
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  sku text not null unique,
  barcode text,
  name text not null,
  category text not null check (category in ('armacao','lente','solar','lente_contato','acessorio','servico')),
  brand text,
  line text,
  tier text check (tier in ('essencial','conforto','premium')),
  supplier_id uuid references public.suppliers(id) on delete set null,
  price_cents bigint not null default 0 check (price_cents >= 0),
  cost_cents bigint not null default 0 check (cost_cents >= 0),
  frame jsonb,
  lens jsonb,
  tags jsonb not null default '[]'::jsonb,
  active boolean not null default true
);
create index products_category_idx on public.products(category);
create index products_barcode_idx on public.products(barcode);

create table public.stock (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  product_id uuid not null references public.products(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  qty integer not null default 0,
  min_qty integer not null default 0,
  location text,
  unique (product_id, store_id)
);
create index stock_store_id_idx on public.stock(store_id);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  product_id uuid not null references public.products(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  qty integer not null,
  kind text not null check (kind in ('entrada','saida','venda','ajuste','transferencia','devolucao','inventario')),
  reference text,
  employee_id uuid references public.employees(id) on delete set null,
  note text
);
create index stock_movements_store_id_idx on public.stock_movements(store_id);
create index stock_movements_product_id_idx on public.stock_movements(product_id);
create index stock_movements_created_at_idx on public.stock_movements(created_at);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  from_store_id uuid not null references public.stores(id) on delete restrict,
  to_store_id uuid not null references public.stores(id) on delete restrict,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'solicitada' check (status in ('solicitada','enviada','recebida','cancelada')),
  employee_id uuid references public.employees(id) on delete set null,
  note text
);
create index transfers_status_idx on public.transfers(status);
create index transfers_created_at_idx on public.transfers(created_at);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  number text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  items jsonb not null default '[]'::jsonb,
  total_cents bigint not null default 0,
  status text not null default 'rascunho' check (status in ('rascunho','enviado','recebido_parcial','recebido','cancelado')),
  expected_at date,
  employee_id uuid references public.employees(id) on delete set null,
  note text
);
create index purchase_orders_store_id_idx on public.purchase_orders(store_id);
create index purchase_orders_status_idx on public.purchase_orders(status);

-- ---------------------------------------------------------------------
-- Vendas, OS, orçamentos
-- ---------------------------------------------------------------------
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  store_id uuid not null references public.stores(id) on delete restrict,
  seller_id uuid not null references public.employees(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  profile jsonb not null default '{}'::jsonb,
  package_tier text,
  items jsonb not null default '[]'::jsonb,
  total_cents bigint not null default 0,
  ai_summary text,
  status text not null default 'aberto' check (status in ('aberto','convertido','perdido')),
  sale_id uuid -- FK adicionada após sales
);
create index quotes_store_id_idx on public.quotes(store_id);
create index quotes_customer_id_idx on public.quotes(customer_id);
create index quotes_status_idx on public.quotes(status);
create index quotes_created_at_idx on public.quotes(created_at);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  number text not null unique,
  store_id uuid not null references public.stores(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  seller_id uuid not null references public.employees(id) on delete restrict,
  quote_id uuid references public.quotes(id) on delete set null,
  prescription_id uuid references public.prescriptions(id) on delete set null,
  items jsonb not null default '[]'::jsonb,
  subtotal_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  total_cents bigint not null default 0,
  cost_cents bigint not null default 0,
  payments jsonb not null default '[]'::jsonb,
  commission_cents bigint not null default 0,
  cashback_cents bigint not null default 0,
  status text not null default 'concluida' check (status in ('concluida','cancelada')),
  warranty_until date,
  note text
);
create index sales_store_id_idx on public.sales(store_id);
create index sales_customer_id_idx on public.sales(customer_id);
create index sales_seller_id_idx on public.sales(seller_id);
create index sales_created_at_idx on public.sales(created_at);
create index sales_status_idx on public.sales(status);

alter table public.quotes
  add constraint quotes_sale_id_fkey foreign key (sale_id) references public.sales(id) on delete set null;

create table public.lab_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  number text not null unique,
  sale_id uuid not null references public.sales(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  description text not null,
  status text not null default 'aguardando_pedido' check (status in (
    'aguardando_pedido','pedido_enviado','em_producao','recebido','em_montagem','conferencia','pronto','cliente_avisado','entregue',
    'pendencia','retrabalho','devolvido_lab','cancelado')),
  due_at timestamptz,
  responsible_id uuid references public.employees(id) on delete set null,
  checklist jsonb not null default '{}'::jsonb,
  history jsonb not null default '[]'::jsonb
);
create index lab_orders_store_id_idx on public.lab_orders(store_id);
create index lab_orders_customer_id_idx on public.lab_orders(customer_id);
create index lab_orders_status_idx on public.lab_orders(status);
create index lab_orders_created_at_idx on public.lab_orders(created_at);

-- ---------------------------------------------------------------------
-- CRM e mensagens
-- ---------------------------------------------------------------------
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  customer_id uuid not null references public.customers(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  owner_id uuid references public.employees(id) on delete set null,
  kind text not null check (kind in ('pos_venda','orcamento','aniversario','reexame','cashback','reativacao','indicacao')),
  status text not null default 'nova' check (status in ('nova','em_contato','agendado','convertida','perdida')),
  next_contact_at date,
  note text
);
create index opportunities_store_id_idx on public.opportunities(store_id);
create index opportunities_customer_id_idx on public.opportunities(customer_id);
create index opportunities_status_idx on public.opportunities(status);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  customer_id uuid not null references public.customers(id) on delete restrict,
  kind text not null,
  channel text not null check (channel in ('whatsapp','email','sms')),
  text text not null,
  status text not null default 'para_validar' check (status in ('para_validar','aprovada','enviada','cancelada')),
  prepared_by uuid references public.employees(id) on delete set null
);
create index messages_customer_id_idx on public.messages(customer_id);
create index messages_status_idx on public.messages(status);
create index messages_created_at_idx on public.messages(created_at);

-- ---------------------------------------------------------------------
-- Financeiro e caixa
-- ---------------------------------------------------------------------
create table public.receivables (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  store_id uuid not null references public.stores(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  description text not null,
  due_at date not null,
  amount_cents bigint not null check (amount_cents >= 0),
  paid_cents bigint not null default 0 check (paid_cents >= 0),
  paid_at timestamptz,
  status text not null default 'aberto' check (status in ('aberto','pago','vencido','cancelado'))
);
create index receivables_store_id_idx on public.receivables(store_id);
create index receivables_customer_id_idx on public.receivables(customer_id);
create index receivables_status_idx on public.receivables(status);
create index receivables_due_at_idx on public.receivables(due_at);

create table public.payables (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  store_id uuid not null references public.stores(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  category text not null,
  description text not null,
  due_at date not null,
  amount_cents bigint not null check (amount_cents >= 0),
  paid_cents bigint not null default 0 check (paid_cents >= 0),
  paid_at timestamptz,
  status text not null default 'aberto' check (status in ('aberto','pago','vencido','cancelado'))
);
create index payables_store_id_idx on public.payables(store_id);
create index payables_status_idx on public.payables(status);
create index payables_due_at_idx on public.payables(due_at);

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  store_id uuid not null references public.stores(id) on delete restrict,
  opened_by uuid not null references public.employees(id) on delete restrict,
  opening_cents bigint not null default 0,
  closed_at timestamptz,
  closed_by uuid references public.employees(id) on delete set null,
  closing_cents bigint,
  expected_cents bigint,
  status text not null default 'aberto' check (status in ('aberto','fechado'))
);
create index cash_sessions_store_id_idx on public.cash_sessions(store_id);
create index cash_sessions_status_idx on public.cash_sessions(status);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  session_id uuid not null references public.cash_sessions(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  kind text not null check (kind in ('venda','suprimento','sangria','recebimento','pagamento')),
  method text not null check (method in ('dinheiro','pix','debito','credito','credito_parcelado','boleto','crediario','cashback','convenio')),
  amount_cents bigint not null,
  reference text,
  employee_id uuid references public.employees(id) on delete set null
);
create index cash_movements_session_id_idx on public.cash_movements(session_id);
create index cash_movements_store_id_idx on public.cash_movements(store_id);
create index cash_movements_created_at_idx on public.cash_movements(created_at);

-- ---------------------------------------------------------------------
-- Fidelidade
-- ---------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  active boolean not null default true,
  percent numeric(5,2) not null default 0,
  min_cents bigint not null default 0,
  max_cents bigint not null default 0, -- 0 = sem teto
  valid_days integer not null default 60,
  delay_days integer not null default 0,
  max_use_percent numeric(5,2) not null default 100,
  categories jsonb not null default '[]'::jsonb,
  store_id uuid references public.stores(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null
);

create table public.benefits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  customer_id uuid not null references public.customers(id) on delete restrict,
  kind text not null check (kind in ('cashback','credito','presente','cupom')),
  name text not null,
  initial_cents bigint not null default 0,
  remaining_cents bigint not null default 0 check (remaining_cents >= 0),
  available_at timestamptz not null,
  expires_at timestamptz not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null
);
create index benefits_customer_id_idx on public.benefits(customer_id);
create index benefits_created_at_idx on public.benefits(created_at);

create table public.benefit_movements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  benefit_id uuid not null references public.benefits(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  amount_cents bigint not null,
  reason text not null,
  employee_id uuid references public.employees(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null
);
create index benefit_movements_customer_id_idx on public.benefit_movements(customer_id);
create index benefit_movements_benefit_id_idx on public.benefit_movements(benefit_id);

-- ---------------------------------------------------------------------
-- Metas, agenda
-- ---------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  store_id uuid not null references public.stores(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete cascade, -- null = meta da loja
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  target_cents bigint not null default 0
);
create index goals_store_id_idx on public.goals(store_id);
create index goals_month_idx on public.goals(month);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  store_id uuid not null references public.stores(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  phone text,
  professional_id uuid references public.employees(id) on delete set null,
  starts_at timestamptz not null,
  kind text not null check (kind in ('exame','ajuste','entrega','adaptacao_lc')),
  status text not null default 'agendado' check (status in ('agendado','confirmado','realizado','faltou','cancelado')),
  note text
);
create index appointments_store_id_idx on public.appointments(store_id);
create index appointments_customer_id_idx on public.appointments(customer_id);
create index appointments_starts_at_idx on public.appointments(starts_at);
create index appointments_status_idx on public.appointments(status);

-- ---------------------------------------------------------------------
-- Auditoria e agentes de IA
-- ---------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  actor_id uuid references public.employees(id) on delete set null,
  actor_name text not null,
  source text not null check (source in ('app','agente','sistema')),
  action text not null,
  table_name text not null,
  record_id uuid,
  before_data jsonb,
  after_data jsonb,
  store_id uuid references public.stores(id) on delete set null
);
create index audit_log_created_at_idx on public.audit_log(created_at desc);
create index audit_log_table_record_idx on public.audit_log(table_name, record_id);
create index audit_log_store_id_idx on public.audit_log(store_id);

create table public.agent_tokens (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  token_hash text not null unique, -- SHA-256 hex do token; o token bruto nunca é salvo
  prefix text not null,
  scope text not null check (scope in ('leitura','total')),
  employee_id uuid not null references public.employees(id) on delete restrict,
  last_used_at timestamptz,
  active boolean not null default true
);
create index agent_tokens_employee_id_idx on public.agent_tokens(employee_id);

-- =====================================================================
-- RLS
-- =====================================================================

-- Usuário autenticado vinculado a um funcionário ativo (por auth_user_id ou e-mail).
create or replace function public.is_employee()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.employees e
    where e.active
      and (e.auth_user_id = auth.uid()
           or (e.auth_user_id is null and lower(e.email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
  );
$$;
revoke all on function public.is_employee() from public;
grant execute on function public.is_employee() to authenticated;

do $$
declare
  t text;
  readable text[] := array[
    'stores','departments','employees','customers','prescriptions','suppliers','products','stock','stock_movements',
    'transfers','purchase_orders','sales','lab_orders','quotes','opportunities','messages','receivables','payables',
    'cash_sessions','cash_movements','campaigns','benefits','benefit_movements','goals','appointments','insurers'
  ];
begin
  -- RLS em todas as tabelas (inclusive audit_log e agent_tokens, que ficam sem policy = só service role)
  foreach t in array readable || array['audit_log','agent_tokens'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  -- leitura para funcionários ativos; escrita só via service role (bypass de RLS)
  foreach t in array readable loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_employee())',
      t || '_select_employee', t
    );
  end loop;
end $$;
