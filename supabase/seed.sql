-- =====================================================================
-- Ótica Mundial — dados iniciais (rodar após migrations/0001_schema.sql)
-- Idempotente: pode ser executado mais de uma vez (on conflict do nothing).
-- Troque o e-mail do administrador antes de rodar ou edite depois na tela Usuários.
-- =====================================================================

-- Lojas
insert into public.stores (id, name, code, phone, address, active) values
  ('a0000000-0000-4000-8000-000000000001', 'Loja 1 — Centro',   'L1', '(43) 3000-0001', 'Rua Principal, 100', true),
  ('a0000000-0000-4000-8000-000000000002', 'Loja 2 — Shopping', 'L2', '(43) 3000-0002', 'Shopping, loja 210', true)
on conflict (id) do nothing;

-- Departamentos
insert into public.departments (id, name, active) values
  ('d0000000-0000-4000-8000-000000000001', 'Vendas', true),
  ('d0000000-0000-4000-8000-000000000002', 'Optometria', true),
  ('d0000000-0000-4000-8000-000000000003', 'Laboratório e montagem', true),
  ('d0000000-0000-4000-8000-000000000004', 'Financeiro', true),
  ('d0000000-0000-4000-8000-000000000005', 'Estoque e compras', true),
  ('d0000000-0000-4000-8000-000000000006', 'Administração', true)
on conflict (id) do nothing;

-- Administrador (crie no Supabase Auth um usuário com ESTE MESMO e-mail; o vínculo é feito pelo e-mail
-- e, opcionalmente, por auth_user_id)
insert into public.employees (id, name, email, role, store_id, department_id, permissions, discount_limit, commission_rules, active) values
  ('e0000000-0000-4000-8000-000000000001', 'Administrador', 'admin@otica.com.br', 'admin',
   'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000006',
   '["vender","desconto","caixa","financeiro","estoque","compras","os","clientes","fidelidade","crm","relatorios","consolidado","administrar"]'::jsonb,
   100, '[]'::jsonb, true)
on conflict (id) do nothing;

-- Campanha padrão de cashback
insert into public.campaigns (id, name, active, percent, min_cents, max_cents, valid_days, delay_days, max_use_percent, categories, store_id, starts_at, ends_at) values
  ('c0000000-0000-4000-8000-000000000001', 'Mundial vale Mais', true, 3, 29900, 20000, 60, 0, 30, '[]'::jsonb, null,
   date_trunc('day', now()), (date_trunc('year', now()) + interval '2 years' - interval '1 second'))
on conflict (id) do nothing;

-- Fornecedores / laboratórios
insert into public.suppliers (id, name, kind, phone, lead_days, active) values
  ('b0000000-0000-4000-8000-000000000001', 'Laboratório Óptico Norte', 'laboratorio', '(43) 3300-1000', 7, true),
  ('b0000000-0000-4000-8000-000000000002', 'Distribuidora de Armações Sul', 'distribuidor', null, 5, true),
  ('b0000000-0000-4000-8000-000000000003', 'Lentes de Contato Brasil', 'fornecedor', null, 3, true)
on conflict (id) do nothing;

-- Produtos de exemplo
insert into public.products (id, sku, name, category, brand, line, tier, supplier_id, price_cents, cost_cents, frame, lens, tags, active) values
  ('f0000000-0000-4000-8000-000000000001', 'SKU0001', 'Visão simples 1.50 antirreflexo', 'lente', 'Linha Própria', 'VS Essencial', 'essencial',
   'b0000000-0000-4000-8000-000000000001', 29000, 9000, null,
   '{"type":"visao_simples","index":1.5,"treatments":["antirreflexo"],"sph_min":-6,"sph_max":4,"cyl_max":-2,"lab_days":5}'::jsonb, '[]'::jsonb, true),
  ('f0000000-0000-4000-8000-000000000002', 'SKU0002', 'Visão simples 1.59 filtro azul', 'lente', 'Linha Própria', 'VS Conforto', 'conforto',
   'b0000000-0000-4000-8000-000000000001', 49000, 15000, null,
   '{"type":"visao_simples","index":1.59,"treatments":["antirreflexo","filtro_azul"],"sph_min":-8,"sph_max":6,"cyl_max":-4,"lab_days":7,"blue_filter":true}'::jsonb, '[]'::jsonb, true),
  ('f0000000-0000-4000-8000-000000000003', 'SKU0003', 'Multifocal Essencial', 'lente', 'Linha Própria', 'Multi Essencial', 'essencial',
   'b0000000-0000-4000-8000-000000000001', 89000, 28000, null,
   '{"type":"multifocal","index":1.56,"treatments":["antirreflexo"],"sph_min":-6,"sph_max":4,"cyl_max":-2,"lab_days":7}'::jsonb, '[]'::jsonb, true),
  ('f0000000-0000-4000-8000-000000000004', 'SKU0004', 'Armação Aurora acetato', 'armacao', 'Marca Fashion', null, 'conforto',
   'b0000000-0000-4000-8000-000000000002', 35000, 12000,
   '{"model":"Aurora","material":"acetato","shape":"quadrado","gender":"F","size":"52-18-140"}'::jsonb, null, '[]'::jsonb, true),
  ('f0000000-0000-4000-8000-000000000005', 'SKU0005', 'Óculos de sol polarizado', 'solar', 'Marca Fashion', null, 'conforto',
   'b0000000-0000-4000-8000-000000000002', 39000, 12000, null, null, '["polarizado","uv400"]'::jsonb, true),
  ('f0000000-0000-4000-8000-000000000006', 'SKU0006', 'Lente de contato mensal (cx 6)', 'lente_contato', 'LC Brasil', null, null,
   'b0000000-0000-4000-8000-000000000003', 18000, 7000, null, null, '[]'::jsonb, true),
  ('f0000000-0000-4000-8000-000000000007', 'SKU0007', 'Spray limpa-lentes + flanela', 'acessorio', 'Linha Própria', null, null,
   'b0000000-0000-4000-8000-000000000002', 3500, 800, null, null, '[]'::jsonb, true),
  ('f0000000-0000-4000-8000-000000000008', 'SKU0008', 'Exame de vista (optometria)', 'servico', 'Ótica Mundial', null, null,
   null, 12000, 0, null, null, '[]'::jsonb, true)
on conflict (id) do nothing;

-- Estoque inicial dos produtos físicos nas duas lojas
insert into public.stock (product_id, store_id, qty, min_qty)
select p.id, s.id, 5, 2
from public.products p
cross join public.stores s
where p.category <> 'servico'
on conflict (product_id, store_id) do nothing;
