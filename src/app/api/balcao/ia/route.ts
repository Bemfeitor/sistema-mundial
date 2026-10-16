import Anthropic from "@anthropic-ai/sdk";
import { currentUser } from "@/lib/session";

// "Perguntar à IA" do Balcão.
// Provedor padrão: Anthropic (ANTHROPIC_API_KEY; modelo em BALCAO_AI_MODEL).
// Alternativa: provedor compatível com OpenAI (OPENAI_API_KEY + OPENAI_BASE_URL + OPENAI_MODEL).
// Sem chave configurada responde 200 { fallback: true } e a tela usa só as regras.

export const dynamic = "force-dynamic";

const MODELO_PADRAO = "claude-sonnet-5-5";
const MAX_TEXTO = 1000;
const MAX_JSON = 4096;
const MAX_CORPO = 32 * 1024;

const SYSTEM = `Você é um consultor sênior de vendas de uma ótica no Brasil, especialista em lentes oftálmicas, armações, tratamentos, lentes de contato e atendimento de balcão.
Seu papel é ajudar o VENDEDOR durante o atendimento presencial, com base no perfil marcado por ele e nas regras do sistema.

Regras obrigatórias:
- Responda em português do Brasil, linguagem simples de balcão, direta e respeitosa.
- NUNCA faça diagnóstico médico, não interprete doenças nem prometa resultado clínico. Quando houver queixa de saúde (diabetes, pressão alta, visão embaçada repentina, dor, glaucoma na família, criança sem exame), oriente encaminhar ao oftalmologista.
- Não invente produtos, preços, marcas ou promoções que não estejam nos dados recebidos. Se faltar informação, sugira a pergunta a fazer.
- Não pressione o cliente de forma enganosa; argumente com benefícios reais.

Formato da resposta (markdown curto, no máximo ~250 palavras):
**Abordagem** — 2 a 3 frases prontas para o vendedor falar.
**Argumentos** — até 5 tópicos personalizados para este cliente.
**Perguntas** — até 3 perguntas para descobrir mais.
**Fechamento** — 1 sugestão de fechamento (pacote/complemento) usando os itens recebidos.`;

interface Corpo {
  perfil?: Record<string, unknown>;
  resumo?: string[];
  regras?: string[];
  dicas?: string[];
  alertas?: string[];
  pacote?: { tier?: string; itens?: string[]; total?: string };
  complementos?: string[];
  cliente?: Record<string, unknown> | null;
  texto?: string;
}

function montarPrompt(b: Corpo) {
  const linhas = [
    "Perfil do cliente (marcado pelo vendedor):",
    ...(b.resumo?.length ? b.resumo.map((r) => `- ${r}`) : ["- (sem informações)"]),
    "",
    `Regras disparadas: ${b.regras?.join("; ") || "nenhuma"}`,
    b.alertas?.length ? `Alertas do sistema: ${b.alertas.join(" | ")}` : "",
    b.pacote ? `Pacote recomendado: ${b.pacote.tier ?? ""} — ${b.pacote.itens?.join(", ") ?? ""} (${b.pacote.total ?? ""})` : "",
    b.complementos?.length ? `Complementos disponíveis no catálogo: ${b.complementos.join(", ")}` : "",
    b.cliente ? `Histórico do cliente: ${JSON.stringify(b.cliente).slice(0, MAX_JSON)}` : "",
    typeof b.texto === "string" && b.texto.trim() ? `\nObservação do vendedor: ${b.texto.trim().slice(0, MAX_TEXTO)}` : "",
    "\nMonte dicas personalizadas e um roteiro de abordagem para este atendimento.",
  ];
  return linhas.filter(Boolean).join("\n");
}

async function viaAnthropic(prompt: string) {
  const model = process.env.BALCAO_AI_MODEL || MODELO_PADRAO;
  const client = new Anthropic();
  // Esforço baixo nos modelos atuais para responder rápido no balcão.
  const suportaEsforco = /claude-(sonnet|opus|haiku|fable)-5/.test(model);
  const resp = await client.messages.create({
    model,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
    ...(suportaEsforco ? { output_config: { effort: "low" as const } } : {}),
  });
  if (resp.stop_reason === "refusal") return { texto: "", modelo: model, recusa: true };
  const texto = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { texto, modelo: model };
}

async function viaOpenAICompat(prompt: string) {
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!r.ok) throw new Error(`Provedor respondeu ${r.status}`);
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return { texto: j.choices?.[0]?.message?.content?.trim() ?? "", modelo: model };
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin" && !user.permissions.includes("vender"))
    return Response.json({ erro: "Sem permissão para usar a IA do balcão." }, { status: 403 });

  let corpo: Corpo;
  try {
    const raw = await req.text();
    if (raw.length > MAX_CORPO) return Response.json({ erro: "Requisição muito grande." }, { status: 413 });
    corpo = JSON.parse(raw) as Corpo;
  } catch {
    return Response.json({ erro: "Requisição inválida." }, { status: 400 });
  }
  if (!corpo || typeof corpo !== "object") return Response.json({ erro: "Requisição inválida." }, { status: 400 });
  if (typeof corpo.texto === "string" && corpo.texto.length > MAX_TEXTO)
    return Response.json({ erro: `Observação muito longa (máximo ${MAX_TEXTO} caracteres).` }, { status: 400 });
  if (corpo.perfil && JSON.stringify(corpo.perfil).length > MAX_JSON)
    return Response.json({ erro: "Perfil muito grande." }, { status: 413 });

  const temAnthropic = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const temOpenAI = Boolean(process.env.OPENAI_API_KEY);
  if (!temAnthropic && !temOpenAI) return Response.json({ fallback: true, motivo: "Nenhuma chave de IA configurada." });

  const prompt = montarPrompt(corpo);
  try {
    const r = temAnthropic ? await viaAnthropic(prompt) : await viaOpenAICompat(prompt);
    if (!r.texto) return Response.json({ fallback: true, motivo: "A IA não retornou uma resposta para este perfil." });
    return Response.json({ fallback: false, texto: r.texto, modelo: r.modelo });
  } catch (e) {
    const msg =
      e instanceof Anthropic.AuthenticationError
        ? "Chave da IA inválida."
        : e instanceof Anthropic.RateLimitError
          ? "Limite de uso da IA atingido; tente em instantes."
          : e instanceof Anthropic.APIError
            ? `Erro da IA (${e.status ?? "rede"}).`
            : e instanceof Error
              ? e.message
              : "Falha ao consultar a IA.";
    return Response.json({ fallback: true, motivo: msg });
  }
}
