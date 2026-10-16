# Agente de IA do gestor (MCP)

O sistema expõe um servidor **MCP (Model Context Protocol)** para que o gestor conecte Claude (Claude Code / Claude Desktop), Codex, Hermes ou qualquer cliente MCP e:

- **saiba de tudo**: faturamento, metas, vendedores, estoque, OS, financeiro, clientes, auditoria;
- **opere o sistema** (escopo total): lançar contas, dar baixa, ajustar estoque, avançar OS, criar oportunidades, preparar mensagens, criar/alterar registros.

Toda escrita é **auditada** (`audit_log`, origem `agente`, em nome do usuário dono do token). Mensagens a clientes são apenas **preparadas** (status `para_validar`) — o agente nunca envia nada.

## 1. Gerar um token

1. Entre como administrador e abra **Administração → Agente de IA (MCP)** (`/admin/agente`).
2. Dê um nome (ex.: "Claude Code — notebook") e escolha o escopo:
   - **Somente leitura** — só consultas;
   - **Total** — consultas + ferramentas de escrita.
3. Clique em **Gerar token** e copie o valor (`otk_...`). **Ele aparece uma única vez**; o banco guarda apenas o hash SHA-256 e um prefixo.
4. Para cortar o acesso, clique em **Revogar** na lista de tokens.

O endpoint é `https://SEU-SISTEMA/api/mcp` (Streamable HTTP, stateless, respostas JSON, método POST). Autenticação: header `Authorization: Bearer <token>`.

## 2. Conectar o cliente

Substitua `SEU_TOKEN_AQUI` e a URL.

### Claude Code

```bash
claude mcp add --transport http otica-mundial https://SEU-SISTEMA/api/mcp --header "Authorization: Bearer SEU_TOKEN_AQUI"
```

Confira com `/mcp` dentro do Claude Code.

### Claude Desktop (via mcp-remote)

Em **Configurações → Desenvolvedor → Editar configuração** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "otica-mundial": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://SEU-SISTEMA/api/mcp", "--header", "Authorization:${AUTH_HEADER}"],
      "env": { "AUTH_HEADER": "Bearer SEU_TOKEN_AQUI" }
    }
  }
}
```

### Claude Desktop (stdio local — só com Supabase)

```json
{
  "mcpServers": {
    "otica-mundial": {
      "command": "npx",
      "args": ["tsx", "--conditions=react-server", "scripts/mcp-stdio.ts"],
      "cwd": "C:\\caminho\\para\\otica-unificada",
      "env": { "OTICA_AGENT_TOKEN": "SEU_TOKEN_AQUI" }
    }
  }
}
```

### Codex (OpenAI)

`~/.codex/config.toml`:

```toml
[mcp_servers.otica-mundial]
url = "https://SEU-SISTEMA/api/mcp"
bearer_token_env_var = "OTICA_AGENT_TOKEN"
```

E defina a variável `OTICA_AGENT_TOKEN` no ambiente (`setx OTICA_AGENT_TOKEN "SEU_TOKEN_AQUI"` no Windows). Em versões antigas do Codex, sem suporte a HTTP, use `command = "npx"` com `args = ["-y", "mcp-remote", "<URL>", "--header", "Authorization: Bearer <token>"]`.

### Hermes

`~/.hermes/config.yaml`:

```yaml
mcp_servers:
  otica-mundial:
    url: "https://SEU-SISTEMA/api/mcp"
    headers:
      Authorization: "Bearer SEU_TOKEN_AQUI"
```

### Genérico / teste com curl

```bash
curl -X POST https://SEU-SISTEMA/api/mcp \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 3. Servidor stdio (local)

```bash
OTICA_AGENT_TOKEN=otk_... npx tsx --conditions=react-server scripts/mcp-stdio.ts
```

- A flag `--conditions=react-server` é necessária: o pacote `server-only` (importado pela camada de dados) lança erro fora do Next; com essa condição ele resolve para um módulo vazio.
- O script lê `.env.local`/`.env` da pasta atual (rode a partir da raiz do projeto ou use `cwd` na config do cliente).
- **Só funciona com Supabase configurado.** Em modo demo o banco é memória por processo: o stdio teria um banco separado do app, sem o token criado na tela. No modo demo use o endpoint HTTP, que roda no mesmo processo do Next.

## 4. Ferramentas

| Ferramenta | Tipo | O que faz |
|---|---|---|
| `resumo_geral` | leitura | KPIs do dia e do mês por loja (faturamento, ticket, nº vendas, margem, meta, OS atrasadas, contas vencendo, estoque baixo) |
| `listar_tabelas` | leitura | Tabelas com descrição e colunas |
| `consultar` | leitura | Consulta genérica (eq, intervalo, busca, ordem, limite) em qualquer tabela exceto `agent_tokens` |
| `obter` | leitura | Um registro por id |
| `vendas_periodo` | leitura | Vendas agregadas por dia, loja, vendedor ou categoria |
| `estoque_baixo` | leitura | Produtos com saldo ≤ mínimo |
| `os_atrasadas` | leitura | OS com prazo vencido não entregues |
| `financeiro_resumo` | leitura | A receber, a pagar, vencidos e fluxo de 30 dias |
| `cliente_360` | leitura | Cadastro, compras, receitas, benefícios, OS, oportunidades e mensagens do cliente |
| `desempenho_vendedores` | leitura | Ranking do mês com meta e comissão |
| `auditoria_recente` | leitura | Últimos registros de auditoria |
| `criar_registro` | escrita | Cria registro (exceto `audit_log`/`agent_tokens`) |
| `atualizar_registro` | escrita | Patch parcial com auditoria antes/depois |
| `excluir_registro` | destrutiva | Exclui registro — exige `confirm: true` |
| `registrar_conta_pagar` | escrita | Lança conta a pagar |
| `baixar_conta` | escrita | Baixa total/parcial de conta a pagar ou receber |
| `criar_oportunidade_crm` | escrita | Cria oportunidade de CRM |
| `preparar_mensagem` | escrita | Prepara mensagem `para_validar` (nunca envia; respeita consentimento de marketing) |
| `ajustar_estoque` | escrita | Entrada/saída de estoque com motivo |
| `avancar_os` | escrita | Muda status da OS e registra nota no histórico |

Ferramentas de escrita só são registradas para tokens de escopo **total**. Todas têm `annotations` (`readOnlyHint`, `destructiveHint`) para o cliente pedir confirmação quando apropriado.

## Exemplos de pedidos ao agente

- "Como estão as duas lojas hoje e no mês em relação à meta?"
- "Quais OS estão atrasadas? Prepare mensagens para os clientes avisando do novo prazo."
- "Quem são os 3 melhores vendedores do mês e qual a margem de cada um?"
- "Lance o aluguel da Loja 2 de R$ 4.500 para dia 05 do mês que vem."
- "Mostre tudo sobre a cliente Helena Rodrigues."

## Segurança

- Trate o token como senha; prefira escopo **leitura** quando não precisar operar.
- Revogue tokens não usados; a coluna "Último uso" ajuda a identificar.
- O endpoint `/api/mcp` fica fora do proxy de sessão e só aceita o Bearer token.
- Em modo stateless, `GET` e `DELETE` respondem 405 (permitido pela especificação MCP); use `POST`.
