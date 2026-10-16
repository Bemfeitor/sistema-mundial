"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, isSupabaseConfigured } from "@/lib/db";
import { STORE_COOKIE, USER_COOKIE, supabaseAuthClient } from "@/lib/session";

const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 12 };

export async function loginDemo(form: FormData) {
  if (isSupabaseConfigured()) redirect("/login");
  const id = String(form.get("employee_id") ?? "");
  const u = await db().get("employees", id);
  if (!u?.active) redirect("/login?erro=usuario");
  const jar = await cookies();
  jar.set(USER_COOKIE, u.id, opts);
  jar.delete(STORE_COOKIE);
  redirect("/");
}

export async function loginPassword(form: FormData) {
  const supabase = await supabaseAuthClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  if (error) redirect("/login?erro=credenciais");
  redirect("/");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(USER_COOKIE);
  jar.delete(STORE_COOKIE);
  if (isSupabaseConfigured() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) await (await supabaseAuthClient()).auth.signOut();
  redirect("/login");
}

export async function switchStore(form: FormData) {
  (await cookies()).set(STORE_COOKIE, String(form.get("store") ?? ""), opts);
  redirect(String(form.get("back") ?? "/"));
}
