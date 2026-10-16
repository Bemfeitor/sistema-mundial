"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, FlaskConical, Minus, Plus, Search, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardHeader, Input, Notice, Select, cn } from "@/components/ui";
import { brl, label } from "@/lib/format";
import { ITEM_ROLES, type LensWarning } from "@/lib/vendas/calc";
import type { CartLineView, CatalogItem } from "@/lib/vendas/types";
import type { ProductCategory } from "@/lib/types";

const CATS: ProductCategory[] = ["armacao", "lente", "solar", "lente_contato", "acessorio", "servico"];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ProductsStep({
  catalog,
  cart,
  onChange,
  warnings,
}: {
  catalog: CatalogItem[];
  cart: CartLineView[];
  onChange: (c: CartLineView[]) => void;
  warnings: LensWarning[];
}) {
  const [term, setTerm] = useState("");
  const [cat, setCat] = useState<ProductCategory | "">("");
  const byId = useMemo(() => new Map(catalog.map((p) => [p.id, p])), [catalog]);

  const results = useMemo(() => {
    const t = norm(term.trim());
    return catalog
      .filter((p) => (!cat || p.category === cat) && (!t || norm(`${p.name} ${p.sku} ${p.barcode ?? ""} ${p.brand ?? ""}`).includes(t)))
      .slice(0, 40);
  }, [catalog, term, cat]);

  const add = (p: CatalogItem) => {
    const i = cart.findIndex((l) => l.product_id === p.id);
    if (i >= 0) onChange(cart.map((l, k) => (k === i ? { ...l, qty: l.qty + 1 } : l)));
    else {
      const hasSameCat = cart.some((l) => byId.get(l.product_id)?.category === p.category);
      onChange([...cart, { product_id: p.id, qty: 1, price_cents: p.price_cents, role: hasSameCat ? "segundo_par" : "principal" }]);
    }
  };
  const set = (i: number, patch: Partial<CartLineView>) => onChange(cart.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => onChange(cart.filter((_, k) => k !== i));

  // Leitura de código de barras: Enter com match exato adiciona direto
  const onEnter = () => {
    const t = term.trim();
    const exact = catalog.find((p) => p.barcode === t || p.sku.toLowerCase() === t.toLowerCase());
    if (exact) {
      add(exact);
      setTerm("");
    } else if (results.length === 1) {
      add(results[0]);
      setTerm("");
    }
  };

  const hasLens = cart.some((l) => byId.get(l.product_id)?.category === "lente");
  const subtotal = cart.reduce((a, l) => a + l.qty * l.price_cents, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <div className="space-y-3 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
            <Input
              autoFocus
              className="pl-9"
              placeholder="Nome, SKU ou código de barras (Enter adiciona)"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onEnter();
                }
              }}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setCat("")} className={cn("rounded-full px-2.5 py-1 text-xs", !cat ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700")}>
              Todos
            </button>
            {CATS.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c === cat ? "" : c)}
                className={cn("rounded-full px-2.5 py-1 text-xs", cat === c ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700")}
              >
                {label(c)}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[480px] divide-y divide-slate-100 overflow-y-auto border-t border-slate-100">
          {results.map((p) => (
            <button key={p.id} onClick={() => add(p)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-900">{p.name}</div>
                <div className="text-xs text-slate-500">
                  {p.sku} · {label(p.category)}
                  {p.brand ? ` · ${p.brand}` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{brl(p.price_cents)}</div>
                {p.stock == null ? (
                  <span className="text-xs text-slate-400">sob encomenda</span>
                ) : (
                  <span className={cn("text-xs", p.stock <= 0 ? "text-red-600" : p.stock < 3 ? "text-amber-700" : "text-emerald-700")}>
                    estoque {p.stock}
                  </span>
                )}
              </div>
              <Plus className="size-4 text-brand-600" />
            </button>
          ))}
          {!results.length && <p className="px-4 py-6 text-center text-sm text-slate-500">Nenhum produto encontrado.</p>}
        </div>
      </Card>

      <div className="space-y-3 lg:col-span-3">
        <Card>
          <CardHeader title="Itens da venda" subtitle={`${cart.length} item(ns) · ${brl(subtotal)}`} />
          {cart.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Busque e clique nos produtos para adicionar.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {cart.map((l, i) => {
                const p = byId.get(l.product_id);
                const over = p?.stock != null && l.qty > p.stock;
                return (
                  <div key={l.product_id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <div className="min-w-40 flex-1">
                      <div className="font-medium text-slate-900">{p?.name ?? "Produto"}</div>
                      <div className="text-xs text-slate-500">
                        {label(p?.category)} · {brl(l.price_cents)} un.
                        {over && <span className="ml-2 text-red-600">acima do estoque ({p?.stock})</span>}
                      </div>
                    </div>
                    <Select className="w-36" value={l.role} onChange={(e) => set(i, { role: e.target.value as CartLineView["role"] })}>
                      {ITEM_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </Select>
                    <div className="flex items-center gap-1">
                      <Button variant="secondary" className="px-2" onClick={() => set(i, { qty: Math.max(1, l.qty - 1) })}>
                        <Minus className="size-3.5" />
                      </Button>
                      <span className="w-8 text-center tabular-nums">{l.qty}</span>
                      <Button variant="secondary" className="px-2" onClick={() => set(i, { qty: l.qty + 1 })}>
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                    <div className="w-24 text-right font-semibold">{brl(l.qty * l.price_cents)}</div>
                    <Button variant="ghost" className="px-2 text-red-600" onClick={() => remove(i)} title="Remover">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        {hasLens && (
          <Notice>
            <span className="flex items-center gap-2">
              <FlaskConical className="size-4" /> Venda com lente: uma OS de laboratório será gerada automaticamente ao concluir.
            </span>
          </Notice>
        )}
        {warnings.length > 0 && (
          <Notice tone="amber">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-4" /> Conferir lente × receita
            </div>
            <ul className="list-disc space-y-0.5 pl-5">
              {warnings.map((w, i) => (
                <li key={i}>
                  <Badge tone="amber" className="mr-1">
                    {w.product}
                  </Badge>
                  {w.message}
                </li>
              ))}
            </ul>
          </Notice>
        )}
      </div>
    </div>
  );
}
