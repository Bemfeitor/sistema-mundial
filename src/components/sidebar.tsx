"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import type { NavGroup } from "@/lib/nav";
import { cn } from "@/components/ui";

export function Sidebar({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  // item mais específico vence (ex.: /vendas/nova x /vendas)
  const best = groups
    .flatMap((g) => g.items)
    .filter((i) => active(i.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-brand-100/60">{g.title}</div>
          {g.items.map((i) => {
            const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[i.icon] ?? Icons.Circle;
            return (
              <Link
                key={i.href}
                href={i.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-brand-50/85 hover:bg-white/10",
                  best === i.href && "bg-white/15 font-medium text-white",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {i.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
