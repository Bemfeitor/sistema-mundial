"use server";
import { db } from "@/lib/db";
import { change, create, destroy } from "@/lib/audit";
import { toCents } from "@/lib/format";
import { canAccessStore } from "@/lib/session";
import { actionCtx, done, optStr, str } from "@/lib/gestao/server";

export async function salvarMeta(f: FormData) {
  const { ctx, actor } = await actionCtx("relatorios");
  const month = str(f, "month");
  const back = `/metas?mes=${month}`;
  const store_id = str(f, "store_id"), employee_id = optStr(f, "employee_id");
  const target_cents = toCents(str(f, "target"));
  if (!/^\d{4}-\d{2}$/.test(month) || !store_id || target_cents <= 0) done(back, { erro: "Informe mês, loja e valor da meta." });
  if (!canAccessStore(ctx, store_id)) done(back, { erro: "Sem acesso a esta loja." });
  const existing = (await db().list("goals", { eq: { month, store_id } })).find((g) => (g.employee_id ?? null) === employee_id);
  if (existing) await change(actor, "goals", existing.id, { target_cents });
  else await create(actor, "goals", { month, store_id, employee_id, target_cents });
  done(back, { ok: existing ? "Meta atualizada." : "Meta cadastrada." });
}

export async function excluirMeta(f: FormData) {
  const { ctx, actor } = await actionCtx("relatorios");
  const g = await db().get("goals", str(f, "id"));
  if (!g || !canAccessStore(ctx, g.store_id)) done(`/metas?mes=${str(f, "month")}`, { erro: "Meta não encontrada." });
  await destroy(actor, "goals", g.id);
  done(`/metas?mes=${str(f, "month")}`, { ok: "Meta excluída." });
}

export async function copiarMetas(f: FormData) {
  const { ctx, actor } = await actionCtx("relatorios");
  const from = str(f, "from"), to = str(f, "to");
  const src = (await db().list("goals", { eq: { month: from } })).filter((g) => canAccessStore(ctx, g.store_id));
  const dst = await db().list("goals", { eq: { month: to } });
  let n = 0;
  for (const g of src) {
    if (dst.some((x) => x.store_id === g.store_id && (x.employee_id ?? null) === (g.employee_id ?? null))) continue;
    await create(actor, "goals", { month: to, store_id: g.store_id, employee_id: g.employee_id ?? null, target_cents: g.target_cents });
    n++;
  }
  done(`/metas?mes=${to}`, { ok: n ? `${n} meta(s) copiada(s) de ${from}.` : "Nada para copiar." });
}
