"use server";
import { db } from "@/lib/db";
import { change, create } from "@/lib/audit";
import type { Supplier } from "@/lib/types";
import { actionCtx, done, int, optStr, str } from "@/lib/gestao/server";

export async function salvarFornecedor(f: FormData) {
  const { actor } = await actionCtx("compras");
  const id = str(f, "id");
  const name = str(f, "name");
  if (!name) done("/fornecedores", { erro: "Informe o nome." });
  const kind = (["laboratorio", "fornecedor", "distribuidor"].includes(str(f, "kind")) ? str(f, "kind") : "fornecedor") as Supplier["kind"];
  const row = {
    name, kind,
    cnpj: optStr(f, "cnpj"), phone: optStr(f, "phone"), email: optStr(f, "email"), contact: optStr(f, "contact"),
    lead_days: str(f, "lead_days") ? int(f, "lead_days") : null,
    active: f.get("active") === "on",
  };
  if (id) await change(actor, "suppliers", id, row);
  else await create(actor, "suppliers", row);
  done("/fornecedores", { ok: id ? "Fornecedor atualizado." : "Fornecedor cadastrado." });
}

export async function alternarFornecedor(f: FormData) {
  const { actor } = await actionCtx("compras");
  const s = await db().get("suppliers", str(f, "id"));
  if (!s) done("/fornecedores", { erro: "Fornecedor não encontrado." });
  await change(actor, "suppliers", s.id, { active: !s.active }, s.active ? "desativar" : "ativar");
  done("/fornecedores", { ok: s.active ? "Fornecedor desativado." : "Fornecedor reativado." });
}
