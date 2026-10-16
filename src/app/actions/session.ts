"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, isSupabaseConfigured } from "@/lib/db";
import { timingSafeEqual } from "node:crypto";
import { STORE_COOKIE, USER_COOKIE, signUserId, supabaseAuthClient } from "@/lib/session";

const opts = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 12,
  secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
};

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function loginDemo(form: FormData) {
  if (isSupabaseConfigured()) redirect("/login");
  // Servidor público em modo demo: exige o código de acesso definido em DEMO_ACCESS_CODE.
  const code = process.env.DEMO_ACCESS_CODE;
  if (code && !sameText(String(form.get("access_code") ?? "").trim(), code)) redirect("/login?erro=codigo");
  const id = String(form.get("employee_id") ?? "");
  const u = await db().get("employees", id);
  if (!u?.active) redirect("/login?erro=usuario");
  const jar = await cookies();
  jar.set(USER_COOKIE, signUserId(u.id), opts);
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
