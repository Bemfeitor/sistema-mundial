import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actorOf } from "@/lib/audit";
import { requireUser } from "@/lib/session";
import type { Permission } from "@/lib/types";
import { addDays, localYmd } from "./util";

/** Vendas concluídas entre datas locais (inclusive), opcionalmente por loja. */
export async function salesBetween(from: string, to: string, storeId: string | null) {
  const rows = await db().list("sales", {
    eq: { status: "concluida", ...(storeId ? { store_id: storeId } : {}) },
    gte: { column: "created_at", value: `${addDays(from, -1)}T00:00:00.000Z` },
    lte: { column: "created_at", value: `${addDays(to, 1)}T23:59:59.999Z` },
    limit: 10000,
  });
  return rows.filter((s) => {
    const d = localYmd(s.created_at);
    return d >= from && d <= to;
  });
}

/** Contexto + ator para Server Actions. */
export async function actionCtx(perm?: Permission) {
  const ctx = await requireUser(perm);
  return { ctx, actor: actorOf(ctx.user) };
}

/** Revalida e redireciona com mensagem (?ok= / ?erro=). */
export function done(path: string, msg?: { ok?: string; erro?: string }): never {
  const u = new URL(path, "http://local");
  u.searchParams.delete("ok");
  u.searchParams.delete("erro");
  if (msg?.ok) u.searchParams.set("ok", msg.ok);
  if (msg?.erro) u.searchParams.set("erro", msg.erro);
  revalidatePath(u.pathname);
  redirect(u.pathname + u.search);
}

// ---- leitura de FormData ----
export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const optStr = (f: FormData, k: string) => str(f, k) || null;
export const int = (f: FormData, k: string, d = 0) => {
  const n = Number(str(f, k).replace(",", "."));
  return Number.isFinite(n) && str(f, k) !== "" ? Math.round(n) : d;
};
export const dec = (f: FormData, k: string): number | null => {
  const s = str(f, k);
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
export const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true" || f.get(k) === "1";
