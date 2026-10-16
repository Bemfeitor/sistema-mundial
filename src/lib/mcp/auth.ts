import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { actorOf, type Actor } from "@/lib/audit";
import type { AgentToken, Employee } from "@/lib/types";

// Tokens de agente: só o hash SHA-256 é guardado (token_hash) + um prefixo legível para identificação.

export type AgentScope = AgentToken["scope"];

export const hashToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

/** Gera um token novo. O valor bruto só existe neste retorno — mostre UMA vez ao usuário. */
export function generateToken() {
  const token = `otk_${randomBytes(24).toString("base64url")}`;
  return { token, prefix: token.slice(0, 12), token_hash: hashToken(token) };
}

export interface AgentContext {
  actor: Actor;
  scope: AgentScope;
  token: AgentToken;
  employee: Employee;
}

/** Valida um token bruto. Retorna o contexto do agente (ator auditável + escopo) ou null. */
export async function authenticateToken(raw: string | null | undefined): Promise<AgentContext | null> {
  const token = (raw ?? "").trim();
  if (!token.startsWith("otk_") || token.length < 20) return null;
  const d = db();
  const [row] = await d.list("agent_tokens", { eq: { token_hash: hashToken(token), active: true }, limit: 1 });
  if (!row) return null;
  const employee = await d.get("employees", row.employee_id);
  if (!employee?.active) return null;
  await d.update("agent_tokens", row.id, { last_used_at: new Date().toISOString() }).catch(() => undefined);
  const actor = { ...actorOf(employee, "agente"), name: `${employee.name} (agente: ${row.name})` };
  return { actor, scope: row.scope, token: row, employee };
}

/** Extrai o token do header Authorization: Bearer <token>. */
export const bearerFrom = (header: string | null) => header?.match(/^Bearer\s+(\S+)\s*$/i)?.[1] ?? null;
