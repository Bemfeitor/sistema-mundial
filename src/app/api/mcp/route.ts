import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateToken, bearerFrom } from "@/lib/mcp/auth";
import { createOticaMcpServer } from "@/lib/mcp/tools";

// Endpoint MCP (Streamable HTTP, modo stateless). Autenticação: Authorization: Bearer <token de agente>.
// Cada requisição cria um servidor + transporte novos (sem sessão), com respostas JSON.

const rpcError = (status: number, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

async function authorize(req: Request) {
  const ctx = await authenticateToken(bearerFrom(req.headers.get("authorization")));
  if (!ctx)
    return {
      error: rpcError(401, "Token de agente ausente, inválido ou revogado. Gere um em /admin/agente.", {
        "WWW-Authenticate": 'Bearer realm="otica-mundial"',
      }),
    };
  return { ctx };
}

export async function POST(req: Request) {
  const { ctx, error } = await authorize(req);
  if (!ctx) return error;
  const server = createOticaMcpServer(ctx.actor, ctx.scope);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } catch (e) {
    return rpcError(500, e instanceof Error ? e.message : "Erro interno");
  }
}

// Em modo stateless não há stream SSE independente nem sessão para encerrar (a especificação permite 405).
export async function GET(req: Request) {
  const { ctx, error } = await authorize(req);
  if (!ctx) return error;
  return rpcError(405, "Método não permitido: servidor MCP stateless (use POST).", { Allow: "POST" });
}

export async function DELETE(req: Request) {
  const { ctx, error } = await authorize(req);
  if (!ctx) return error;
  return rpcError(405, "Método não permitido: servidor MCP stateless, sem sessões.", { Allow: "POST" });
}
