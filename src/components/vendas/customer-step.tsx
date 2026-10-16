"use client";
import { useEffect, useState, useTransition } from "react";
import { Search, UserPlus, UserRound, X } from "lucide-react";
import { Badge, Button, Card, Field, Input, Notice } from "@/components/ui";
import { ageFrom, brl } from "@/lib/format";
import { customerContextAction, quickCreateCustomerAction, searchCustomersAction } from "@/lib/vendas/actions";
import type { CustomerContext, CustomerSummary } from "@/lib/vendas/types";

const LEVEL_TONE = { Novo: "slate", Silver: "blue", Gold: "amber", Black: "violet", VIP: "green" } as const;

export function CustomerCard({ ctx, onClear }: { ctx: CustomerContext; onClear?: () => void }) {
  const c = ctx.customer;
  const age = ageFrom(c.birth);
  return (
    <Card className="flex flex-wrap items-center gap-4 p-4">
      <div className="grid size-11 place-items-center rounded-full bg-brand-50 text-brand-700">
        <UserRound className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900">{c.name}</span>
          <Badge tone={LEVEL_TONE[c.level]}>Nível {c.level}</Badge>
          {ctx.insurer && <Badge tone="violet">{ctx.insurer.name} · {ctx.insurer.discount_percent}%</Badge>}
        </div>
        <div className="mt-0.5 text-sm text-slate-500">
          {[c.phone, c.cpf ? `CPF ${c.cpf}` : null, age != null ? `${age} anos` : null].filter(Boolean).join(" · ") || "Sem contato"}
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs text-slate-500">Cashback disponível</div>
        <div className="text-lg font-bold text-emerald-700">{brl(ctx.balance_cents)}</div>
      </div>
      {onClear && (
        <Button variant="ghost" onClick={onClear} title="Trocar cliente">
          <X className="size-4" />
        </Button>
      )}
    </Card>
  );
}

export function CustomerStep({
  value,
  finalConsumer,
  onSelect,
  onFinalConsumer,
}: {
  value: CustomerContext | null;
  finalConsumer: boolean;
  onSelect: (c: CustomerContext | null) => void;
  onFinalConsumer: () => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [mode, setMode] = useState<"buscar" | "novo">("buscar");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ name: "", phone: "", cpf: "", birth: "" });

  useEffect(() => {
    if (term.trim().length < 2) return;
    const t = setTimeout(() => {
      searchCustomersAction(term).then(setResults);
    }, 300);
    return () => clearTimeout(t);
  }, [term]);

  const pick = (id: string) =>
    start(async () => {
      const ctx = await customerContextAction(id);
      if (ctx) onSelect(ctx);
    });

  const quickCreate = () =>
    start(async () => {
      setError(null);
      const r = await quickCreateCustomerAction({ name: form.name, phone: form.phone, cpf: form.cpf || null, birth: form.birth || null });
      if (r.ok) onSelect(r.ctx);
      else setError(r.error);
    });

  if (value) return <CustomerCard ctx={value} onClear={() => onSelect(null)} />;

  return (
    <div className="space-y-4">
      {finalConsumer && <Notice tone="amber">Venda para consumidor final (sem cadastro). Cashback, receita salva e crediário ficam indisponíveis.</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button variant={mode === "buscar" ? "primary" : "secondary"} onClick={() => setMode("buscar")}>
          <Search className="size-4" /> Buscar cliente
        </Button>
        <Button variant={mode === "novo" ? "primary" : "secondary"} onClick={() => setMode("novo")}>
          <UserPlus className="size-4" /> Cadastro rápido
        </Button>
        <Button variant={finalConsumer ? "success" : "ghost"} onClick={onFinalConsumer}>
          Consumidor final
        </Button>
      </div>

      {mode === "buscar" ? (
        <Card className="p-4">
          <Input autoFocus placeholder="Nome, telefone ou CPF…" value={term} onChange={(e) => setTerm(e.target.value)} />
          <div className="mt-3 divide-y divide-slate-100">
            {term.trim().length >= 2 && results.length === 0 && <p className="py-3 text-sm text-slate-500">Nenhum cliente encontrado. Use o cadastro rápido.</p>}
            {term.trim().length >= 2 &&
              results.map((c) => (
                <button
                  key={c.id}
                  disabled={pending}
                  onClick={() => pick(c.id)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:bg-slate-50"
                >
                  <span>
                    <span className="font-medium text-slate-900">{c.name}</span>
                    <span className="ml-2 text-slate-500">{[c.phone, c.cpf].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Badge tone={LEVEL_TONE[c.level]}>{c.level}</Badge>
                </button>
              ))}
          </div>
        </Card>
      ) : (
        <Card className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Nome completo" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="WhatsApp (com DDD)">
            <Input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(43) 99999-0000" />
          </Field>
          <Field label="CPF (opcional)">
            <Input inputMode="numeric" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
          </Field>
          <Field label="Nascimento">
            <Input type="date" value={form.birth} onChange={(e) => setForm({ ...form, birth: e.target.value })} />
          </Field>
          <div className="flex items-end">
            <Button onClick={quickCreate} disabled={pending} className="w-full">
              <UserPlus className="size-4" /> Cadastrar e selecionar
            </Button>
          </div>
          {error && (
            <div className="sm:col-span-2">
              <Notice tone="red">{error}</Notice>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
