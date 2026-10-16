import { headers } from "next/headers";
import { LogOut } from "lucide-react";
import { NAV } from "@/lib/nav";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { label, initials } from "@/lib/format";
import { Sidebar } from "@/components/sidebar";
import { logout, switchStore } from "@/app/actions/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || ctx.can(i.perm)) })).filter((g) => g.items.length);
  const back = (await headers()).get("x-pathname") ?? "/";
  const demo = db().mode === "demo";
  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-brand-900 text-white max-lg:hidden">
        <div className="border-b border-white/10 px-5 py-4">
          <div className="text-lg font-bold tracking-[0.2em]">MUNDIAL</div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-gold-400">Ótica · Sistema unificado</div>
        </div>
        <Sidebar groups={groups} />
        <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3 text-sm">
          <div className="grid size-8 place-items-center rounded-full bg-white/15 text-xs font-semibold">{initials(ctx.user.name)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{ctx.user.name}</div>
            <div className="text-xs text-brand-100/70">{label(ctx.user.role)}</div>
          </div>
          <form action={logout}>
            <button title="Sair" className="rounded p-1.5 hover:bg-white/10">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-6 py-2.5 backdrop-blur">
          <div className="text-sm text-slate-500">
            {demo ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Modo demonstração — dados fictícios em memória</span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Supabase conectado</span>
            )}
          </div>
          <form action={switchStore} className="flex items-center gap-2">
            <input type="hidden" name="back" value={back} />
            <select name="store" defaultValue={ctx.storeId ?? "all"} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {ctx.can("consolidado") && <option value="all">Consolidado (todas as lojas)</option>}
              {ctx.stores
                .filter((s) => ctx.can("consolidado") || s.id === ctx.user.store_id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
            <button className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm hover:bg-slate-50">Trocar</button>
          </form>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
