# Ótica Mundial — Sistema unificado

Gestão (ERP de ótica), vendas e clientes das 2 lojas em um só sistema. Reúne o que existia no **Mundial Retail**, **Mundial Fidelidade** e **Experiência Multifocal**, mais um **assistente de balcão** inspirado no Oferecer e um **servidor MCP** para o gestor operar tudo por agente de IA.

## Rodar

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Sem Supabase configurado o sistema entra em **modo demonstração** (dados fictícios em memória, reiniciam ao reiniciar o servidor) e o login permite escolher um perfil.

## Conectar o Supabase

Veja [docs/supabase.md](docs/supabase.md). Resumo: rodar `supabase/migrations/0001_schema.sql`, preencher `.env.local` a partir de `.env.example`, criar o usuário admin no Supabase Auth com o mesmo e-mail do funcionário.

## Módulos

| Área | Rotas |
|---|---|
| Atendimento | `/atendimento` (balcão com campos rápidos, regras + IA), `/simulador` |
| Vendas | `/vendas/nova`, `/vendas`, `/orcamentos`, `/os`, `/caixa` |
| Clientes | `/clientes`, `/fidelidade`, `/crm`, `/mensagens`, `/agenda`, portal `/cartao/<token>` |
| Gestão | `/` painel, `/estoque`, `/compras`, `/fornecedores`, `/financeiro`, `/metas`, `/relatorios` |
| Administração | `/admin/usuarios`, `/admin/departamentos`, `/admin/lojas`, `/admin/catalogo`, `/admin/convenios`, `/admin/agente`, `/admin/auditoria` |

## Agente de IA do gestor

Servidor MCP em `/api/mcp` (token gerado em `/admin/agente`). Guia para Claude, Codex, Hermes em [docs/agente-ia.md](docs/agente-ia.md).

## Arquitetura

- Next.js 16 (App Router, Server Actions), React 19, Tailwind 4.
- `src/lib/db` — camada de dados única (Supabase com service role no servidor, ou memória no modo demo).
- `src/lib/audit.ts` — toda escrita registra antes/depois em `audit_log` (origem app ou agente).
- Dinheiro sempre em centavos inteiros.
- Análise de engenharia reversa que originou o projeto: [docs/analise-engenharia-reversa.md](docs/analise-engenharia-reversa.md).
