-- Reativação de clientes (Atendimento Guiado). Para bancos criados antes desta coluna.
alter table public.opportunities add column if not exists reativacao jsonb;
create index if not exists opportunities_kind_idx on public.opportunities(kind);
