"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { generateToken } from "@/lib/mcp/auth";
import { requireUser } from "@/lib/session";
import type { Employee } from "@/lib/types";

/** Auditoria manual (sem expor token_hash no log). */
async function audit(user: Employee, action: string, id: string, before: unknown, after: unknown) {
  await db().insert("audit_log", {
    actor_id: user.id,
    actor_name: user.name,
    source: "app",
    action,
    table_name: "agent_tokens",
    record_id: id,
    before_data: before,
    after_data: after,
    store_id: user.store_id,
  });
}

export interface NovoTokenState {
  token?: string;
  nome?: string;
  escopo?: "leitura" | "total";
  erro?: string;
}

export async function criarToken(_prev: NovoTokenState, form: FormData): Promise<NovoTokenState> {
  const { user } = await requireUser("administrar");
  const nome = String(form.get("nome") ?? "").trim().slice(0, 80);
  const escopo = form.get("escopo") === "total" ? "total" : "leitura";
  if (!nome) return { erro: "Informe um nome para identificar o token (ex.: Claude Code do notebook)." };
  const { token, prefix, token_hash } = generateToken();
  const d = db();
  const row = await d.insert("agent_tokens", { name: nome, token_hash, prefix, scope: escopo, employee_id: user.id, active: true, last_used_at: null });
  await audit(user, "criar_token_agente", row.id, null, { name: nome, prefix, scope: escopo, employee_id: user.id });
  revalidatePath("/admin/agente");
  return { token, nome, escopo };
}

export async function revogarToken(form: FormData) {
  const { user } = await requireUser("administrar");
  const id = String(form.get("id") ?? "");
  const t = await db().get("agent_tokens", id);
  if (t?.active) {
    await db().update("agent_tokens", id, { active: false });
    await audit(user, "revogar_token_agente", id, { name: t.name, prefix: t.prefix, active: true }, { name: t.name, prefix: t.prefix, active: false });
  }
  revalidatePath("/admin/agente");
}
