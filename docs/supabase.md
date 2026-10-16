# Conectar o sistema ao Supabase

Sem Supabase o sistema roda em **modo demonstração**: banco em memória, dados fictícios e login por seleção de usuário. Para uso real, siga os passos abaixo.

## 1. Criar o projeto

1. Acesse <https://supabase.com>, crie uma conta e clique em **New project**.
2. Escolha um nome (ex.: `otica-mundial`), uma senha forte para o banco e a região **South America (São Paulo)**.
3. Aguarde o projeto ficar pronto.

## 2. Criar as tabelas (migration)

Escolha **uma** das opções:

**Opção A — SQL Editor (mais simples)**

1. No painel do Supabase, abra **SQL Editor → New query**.
2. Cole todo o conteúdo de `supabase/migrations/0001_schema.sql` e clique em **Run**.
3. Abra outra query, cole `supabase/seed.sql` e rode. Antes, troque o e-mail `admin@otica.com.br` pelo e-mail real do gestor (ou altere depois na tela **Usuários**).

**Opção B — Supabase CLI**

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push            # aplica supabase/migrations
# seed: rode supabase/seed.sql pelo SQL Editor, ou:
psql "$(npx supabase db url)" -f supabase/seed.sql
```

## 3. Criar o usuário administrador no Auth

1. Em **Authentication → Users → Add user → Create new user**.
2. Use **o mesmo e-mail** do funcionário administrador cadastrado no seed (`admin@otica.com.br` ou o que você colocou) e defina uma senha.
3. Marque **Auto Confirm User**.

O sistema vincula o login ao funcionário pelo e-mail (ou por `employees.auth_user_id`, se preenchido). Para cada novo funcionário, cadastre-o na tela **Usuários** e crie no Auth um usuário com o mesmo e-mail.

## 4. Preencher o `.env.local`

Copie `.env.example` para `.env.local` na raiz do projeto e preencha com os dados de **Project Settings → API**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...      # anon / public
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # service_role — secreta!
APP_URL=https://endereco-do-sistema
```

## 5. Reiniciar

Pare e inicie de novo o servidor (`npm run dev` ou `npm run build && npm start`). O aviso de "modo demonstração" some e a tela de login passa a pedir e-mail e senha.

## Segurança (RLS)

- **RLS está habilitado em todas as tabelas.**
- **Leitura:** usuários autenticados vinculados a um funcionário ativo podem ler (função `public.is_employee()`).
- **Escrita:** feita somente pelo servidor Next.js com a `SUPABASE_SERVICE_ROLE_KEY`, que ignora o RLS. Não existem policies de insert/update/delete para usuários — o navegador nunca grava direto no banco. As regras de permissão (vender, financeiro, administrar etc.) e a auditoria ficam no servidor.
- `audit_log` e `agent_tokens` não têm policy de leitura: só o servidor acessa.
- Nunca coloque a service role key em variáveis `NEXT_PUBLIC_*` nem em código que roda no navegador.

## Observações

- Dinheiro é gravado em centavos (`bigint`, colunas `*_cents`).
- Campos compostos (itens da venda, pagamentos, receita OD/OE, permissões, tags) ficam em `jsonb`.
- Datas de vencimento (`due_at` de contas) são `date`; datas/hora de eventos são `timestamptz` (UTC).
- Para começar sem histórico, os dados de demonstração **não** são copiados para o Supabase: apenas o conteúdo de `supabase/seed.sql`.
