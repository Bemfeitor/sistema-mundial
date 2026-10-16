import { headers } from "next/headers";
import { Bot, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, CardHeader, Notice, PageHeader, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { MCP_TOOLS } from "@/lib/mcp/catalog";
import { CopyBlock, NovoTokenForm } from "./client";
import { revogarToken } from "./actions";

async function baseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function AgentePage() {
  const ctx = await requireUser("administrar");
  const d = db();
  const [tokens, employees, url] = await Promise.all([
    d.list("agent_tokens", { order: { column: "created_at", ascending: false } }),
    d.list("employees"),
    baseUrl(),
  ]);
  const mcpUrl = `${url}/api/mcp`;
  const demo = d.mode === "demo";
  const T = "SEU_TOKEN_AQUI";

  const desktopRemote = JSON.stringify(
    {
      mcpServers: {
        "otica-mundial": {
          command: "npx",
          args: ["-y", "mcp-remote", mcpUrl, "--header", "Authorization:${AUTH_HEADER}"],
          env: { AUTH_HEADER: `Bearer ${T}` },
        },
      },
    },
    null,
    2,
  );
  const desktopStdio = JSON.stringify(
    {
      mcpServers: {
        "otica-mundial": {
          command: "npx",
          args: ["tsx", "--conditions=react-server", "scripts/mcp-stdio.ts"],
          cwd: "C:\\caminho\\para\\otica-unificada",
          env: { OTICA_AGENT_TOKEN: T },
        },
      },
    },
    null,
    2,
  );
  const codex = `# ~/.codex/config.toml
[mcp_servers.otica-mundial]
url = "${mcpUrl}"
bearer_token_env_var = "OTICA_AGENT_TOKEN"

# e no terminal (ou no perfil do shell):
#   export OTICA_AGENT_TOKEN="${T}"        (Linux/macOS)
#   setx OTICA_AGENT_TOKEN "${T}"          (Windows)

# Alternativa via stdio (versões antigas do Codex):
# [mcp_servers.otica-mundial]
# command = "npx"
# args = ["-y", "mcp-remote", "${mcpUrl}", "--header", "Authorization: Bearer ${T}"]`;
  const hermes = `# ~/.hermes/config.yaml
mcp_servers:
  otica-mundial:
    url: "${mcpUrl}"
    headers:
      Authorization: "Bearer ${T}"`;
  const generic = `URL:        ${mcpUrl}
Transporte: Streamable HTTP (stateless, respostas JSON) — use POST
Header:     Authorization: Bearer ${T}

Teste rápido:
curl -X POST ${mcpUrl} \\
  -H "Authorization: Bearer ${T}" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agente de IA (MCP)"
        subtitle="Conecte Claude, Codex, Hermes ou outro agente ao sistema para consultar tudo e operar com auditoria."
      />

      <Notice tone="blue">
        <div className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <div>
            Cada token age em nome do usuário que o criou ({ctx.user.name}). O escopo <b>leitura</b> só consulta; o escopo <b>total</b> também cria,
            altera e exclui registros — tudo fica no log de auditoria com origem &quot;agente&quot;. Mensagens a clientes são apenas preparadas
            (status &quot;para validar&quot;), nunca enviadas pelo agente. Guarde o token como uma senha.
          </div>
        </div>
      </Notice>

      {demo && (
        <Notice tone="amber">
          Modo demonstração: o banco é memória do processo do Next. O endpoint HTTP funciona normalmente, mas os tokens e dados somem ao reiniciar o
          servidor, e o servidor stdio (processo separado) não enxerga estes dados. Configure o Supabase para uso real.
        </Notice>
      )}

      <Card>
        <CardHeader title="Novo token" subtitle="O token é exibido uma única vez. Guardamos apenas o hash SHA-256." />
        <div className="p-5">
          <NovoTokenForm mcpUrl={mcpUrl} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Tokens" subtitle={`${tokens.filter((t) => t.active).length} ativo(s)`} />
        <Table head={["Nome", "Prefixo", "Escopo", "Usuário", "Criado em", "Último uso", "Situação", ""]} empty="Nenhum token criado ainda.">
          {tokens.map((t) => (
            <tr key={t.id}>
              <Td className="font-medium">{t.name}</Td>
              <Td className="font-mono text-xs">{t.prefix}…</Td>
              <Td>{t.scope === "total" ? <Badge tone="violet">Total</Badge> : <Badge tone="blue">Leitura</Badge>}</Td>
              <Td>{employees.find((e) => e.id === t.employee_id)?.name ?? "—"}</Td>
              <Td>{dateTime(t.created_at)}</Td>
              <Td>{t.last_used_at ? dateTime(t.last_used_at) : "Nunca"}</Td>
              <Td>{t.active ? <Badge tone="green">Ativo</Badge> : <Badge tone="red">Revogado</Badge>}</Td>
              <Td className="text-right">
                {t.active && (
                  <form action={revogarToken}>
                    <input type="hidden" name="id" value={t.id} />
                    <Button variant="secondary" className="px-2.5 py-1 text-xs text-red-700">
                      Revogar
                    </Button>
                  </form>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card>
        <CardHeader title="Como conectar" subtitle={`Endpoint: ${mcpUrl} — substitua ${T} pelo token gerado.`} />
        <div className="grid gap-6 p-5 lg:grid-cols-2">
          <section>
            <h4 className="font-semibold text-slate-900">Claude Code</h4>
            <CopyBlock text={`claude mcp add --transport http otica-mundial ${mcpUrl} --header "Authorization: Bearer ${T}"`} />
            <p className="mt-2 text-xs text-slate-500">Depois, no Claude Code, use /mcp para conferir a conexão.</p>
          </section>
          <section>
            <h4 className="font-semibold text-slate-900">Hermes</h4>
            <CopyBlock text={hermes} />
          </section>
          <section>
            <h4 className="font-semibold text-slate-900">Claude Desktop (via mcp-remote)</h4>
            <p className="mt-1 text-xs text-slate-500">Arquivo claude_desktop_config.json (Configurações → Desenvolvedor → Editar configuração).</p>
            <CopyBlock text={desktopRemote} />
          </section>
          <section>
            <h4 className="font-semibold text-slate-900">Claude Desktop (stdio local — só com Supabase)</h4>
            <p className="mt-1 text-xs text-slate-500">Roda o servidor na sua máquina a partir da pasta do projeto (precisa do .env.local com Supabase).</p>
            <CopyBlock text={desktopStdio} />
          </section>
          <section>
            <h4 className="font-semibold text-slate-900">Codex (OpenAI)</h4>
            <CopyBlock text={codex} />
          </section>
          <section>
            <h4 className="font-semibold text-slate-900">Genérico (qualquer cliente MCP)</h4>
            <CopyBlock text={generic} />
          </section>
        </div>
      </Card>

      <Card>
        <CardHeader title="Ferramentas disponíveis" subtitle="Escrita só aparece para tokens de escopo total." />
        <Table head={["Ferramenta", "O que faz", "Tipo"]}>
          {MCP_TOOLS.map((t) => (
            <tr key={t.name}>
              <Td className="whitespace-nowrap">
                <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-800">
                  <Bot className="size-3.5 text-slate-400" />
                  {t.name}
                </div>
              </Td>
              <Td className="text-slate-600">{t.description}</Td>
              <Td>{t.destructive ? <Badge tone="red">Destrutiva</Badge> : t.write ? <Badge tone="amber">Escrita</Badge> : <Badge tone="green">Leitura</Badge>}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
