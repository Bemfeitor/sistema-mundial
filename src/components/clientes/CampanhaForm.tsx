"use client";
import { useState, useActionState } from "react";
import { Edit2, Plus, X } from "lucide-react";
import { salvarCampanha } from "@/app/actions/clientes";
import { Button, Field, Input, Select, Notice } from "@/components/ui";
import type { Campaign, ProductCategory, Store } from "@/lib/types";

const CATS: { value: ProductCategory; label: string }[] = [
  { value: "armacao", label: "Armação" },
  { value: "lente", label: "Lente" },
  { value: "solar", label: "Solar" },
  { value: "lente_contato", label: "Lente de contato" },
  { value: "acessorio", label: "Acessório" },
  { value: "servico", label: "Serviço" },
];

interface Props {
  stores: Store[];
  campanha?: Campaign;
}

export function CampanhaForm({ stores, campanha }: Props) {
  const [open, setOpen] = useState(false);
  type CampState = { ok?: boolean; error?: string } | null;
  const [state, action, pending] = useActionState<CampState, FormData>(
    async (_prev, fd): Promise<CampState> => {
      const r = await salvarCampanha(undefined, fd);
      if (r?.ok) setOpen(false);
      return r ?? null;
    },
    null,
  );

  const today = new Date().toISOString().slice(0, 10);
  const in1y = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);

  if (!open) {
    return campanha ? (
      <button onClick={() => setOpen(true)} className="text-xs text-brand-600 hover:underline">
        Editar
      </button>
    ) : (
      <Button onClick={() => setOpen(true)} variant="secondary" className="gap-1">
        <Plus className="size-4" />
        Nova campanha
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">{campanha ? "Editar campanha" : "Nova campanha"}</h2>
          <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>
        <form action={action} className="grid gap-4 p-5 sm:grid-cols-2">
          {campanha && <input type="hidden" name="id" value={campanha.id} />}
          <Field label="Nome da campanha" className="col-span-full">
            <Input name="name" defaultValue={campanha?.name} required />
          </Field>
          <Field label="Cashback (%)">
            <Input name="percent" type="number" min="1" max="100" step="0.5" defaultValue={campanha?.percent ?? 5} required />
          </Field>
          <Field label="Valor mínimo (R$)">
            <Input name="min_value" placeholder="0,00" defaultValue={campanha ? String(campanha.min_cents / 100) : ""} />
          </Field>
          <Field label="Teto máximo (R$)" hint="0 = sem teto">
            <Input name="max_value" placeholder="0,00" defaultValue={campanha ? String(campanha.max_cents / 100) : ""} />
          </Field>
          <Field label="Validade (dias)">
            <Input name="valid_days" type="number" min="1" defaultValue={campanha?.valid_days ?? 90} required />
          </Field>
          <Field label="Carência (dias)">
            <Input name="delay_days" type="number" min="0" defaultValue={campanha?.delay_days ?? 0} />
          </Field>
          <Field label="% máx. de uso por compra">
            <Input name="max_use_percent" type="number" min="1" max="100" defaultValue={campanha?.max_use_percent ?? 30} />
          </Field>
          <Field label="Loja">
            <Select name="store_id" defaultValue={campanha?.store_id ?? ""}>
              <option value="">Todas as lojas</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Início de vigência">
            <Input name="starts_at" type="date" defaultValue={campanha?.starts_at ?? today} required />
          </Field>
          <Field label="Fim de vigência">
            <Input name="ends_at" type="date" defaultValue={campanha?.ends_at ?? in1y} required />
          </Field>
          <div className="col-span-full">
            <div className="mb-2 block text-sm font-medium text-slate-700">Categorias elegíveis</div>
            <div className="flex flex-wrap gap-2">
              {CATS.map((c) => (
                <label key={c.value} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name="categories"
                    value={c.value}
                    defaultChecked={(campanha?.categories as ProductCategory[] | undefined)?.includes(c.value) ?? false}
                    className="size-4 rounded"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          <label className="col-span-full flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={campanha?.active ?? true} className="size-4 rounded" />
            Campanha ativa
          </label>
          {state?.error && (
            <div className="col-span-full">
              <Notice tone="red">{state.error}</Notice>
            </div>
          )}
          <div className="col-span-full flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar campanha"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
