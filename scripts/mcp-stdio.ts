// Servidor MCP via stdio para clientes locais (Claude Desktop, Codex, Hermes...).
//
// Rodar:  npx tsx --conditions=react-server scripts/mcp-stdio.ts
//   (a condição "react-server" faz o pacote server-only exportar um módulo vazio fora do Next)
// Autenticação: variável de ambiente OTICA_AGENT_TOKEN (gere em /admin/agente).
// Variáveis do Supabase são lidas de .env.local / .env se existirem.
//
// IMPORTANTE: em modo demo (sem Supabase) o banco é memória por processo — este servidor teria
// dados próprios, separados do app, e o token criado no app não existiria aqui. Use o stdio só com
// Supabase configurado; no modo demo use o endpoint HTTP /api/mcp (mesmo processo do Next).
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

for (const f of [".env.local", ".env"]) {
  const p = resolve(process.cwd(), f);
  if (existsSync(p)) {
    try {
      process.loadEnvFile(p);
    } catch {
      // ignora arquivo inválido
    }
  }
}

async function main() {
  const { isSupabaseConfigured } = await import("@/lib/db");
  const { authenticateToken } = await import("@/lib/mcp/auth");
  const { createOticaMcpServer } = await import("@/lib/mcp/tools");

  if (!isSupabaseConfigured()) {
    console.error(
      "[otica-mcp] Supabase não configurado: em modo demo o banco é memória por processo e o stdio não enxerga os dados do app. " +
        "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ou use o endpoint HTTP /api/mcp.",
    );
    process.exit(1);
  }
  const ctx = await authenticateToken(process.env.OTICA_AGENT_TOKEN);
  if (!ctx) {
    console.error("[otica-mcp] OTICA_AGENT_TOKEN ausente, inválido ou revogado. Gere um token em /admin/agente.");
    process.exit(1);
  }
  const server = createOticaMcpServer(ctx.actor, ctx.scope);
  await server.connect(new StdioServerTransport());
  // stdout é o canal do protocolo: logs só em stderr
  console.error(`[otica-mcp] conectado como ${ctx.actor.name} (escopo ${ctx.scope}).`);
}

main().catch((e) => {
  console.error("[otica-mcp] falha:", e);
  process.exit(1);
});
