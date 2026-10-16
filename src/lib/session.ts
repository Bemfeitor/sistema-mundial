import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { db, isSupabaseConfigured } from "@/lib/db";
import type { Employee, Permission, Store } from "@/lib/types";

export const USER_COOKIE = "otica_user";
export const STORE_COOKIE = "otica_store";

export async function supabaseAuthClient() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // chamado de Server Component: o proxy renova a sessão
        }
      },
    },
  });
}

/** Funcionário logado ou null. */
export async function currentUser(): Promise<Employee | null> {
  const d = db();
  if (isSupabaseConfigured() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const { data } = await (await supabaseAuthClient()).auth.getUser();
    if (!data.user) return null;
    const [byAuth] = await d.list("employees", { eq: { auth_user_id: data.user.id, active: true } });
    if (byAuth) return byAuth;
    const [byEmail] = await d.list("employees", { eq: { email: data.user.email ?? "", active: true } });
    return byEmail ?? null;
  }
  const id = (await cookies()).get(USER_COOKIE)?.value;
  if (!id) return null;
  const u = await d.get("employees", id);
  return u?.active ? u : null;
}

export interface Ctx {
  user: Employee;
  stores: Store[];
  /** loja selecionada; null = consolidado */
  storeId: string | null;
  can: (p: Permission) => boolean;
}

export async function requireUser(perm?: Permission): Promise<Ctx> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const can = (p: Permission) => user.role === "admin" || user.permissions.includes(p);
  if (perm && !can(perm)) redirect("/sem-permissao");
  const stores = await db().list("stores", { eq: { active: true }, order: { column: "code" } });
  const chosen = (await cookies()).get(STORE_COOKIE)?.value;
  let storeId: string | null = user.store_id;
  if (chosen === "all" && can("consolidado")) storeId = null;
  else if (chosen && stores.some((s) => s.id === chosen) && (can("consolidado") || chosen === user.store_id)) storeId = chosen;
  return { user, stores, storeId, can };
}

/** Filtro eq por loja quando não consolidado. */
export const storeFilter = (ctx: Ctx) => (ctx.storeId ? { store_id: ctx.storeId } : {});
