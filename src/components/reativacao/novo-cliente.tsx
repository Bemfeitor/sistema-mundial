"use client";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";
import { novoClienteReativacao } from "@/lib/reativacao/actions";
import { YEARS_LABEL } from "@/lib/reativacao/shared";
import { Button, Field, Input, Notice, Select } from "@/components/ui";

type State = { ok?: boolean; error?: string; id?: string } | null;

export function NovoClienteReativacao() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState<State, FormData>(async (prev, fd) => {
    const r = await novoClienteReativacao(prev, fd);
    if (r.ok && r.id) {
      setOpen(false);
      router.push(`/crm/reativacao/${r.id}`);
    }
    return r;
  }, null);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" /> Novo cliente
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-900">Novo cliente na fila</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Fechar">
                <X className="size-5" />
              </button>
            </div>
            <form action={action} className="space-y-4 p-5">
              {state?.error && <Notice tone="red">{state.error}</Notice>}
              <Field label="Nome *">
                <Input name="name" required autoFocus maxLength={120} />
              </Field>
              <Field label="WhatsApp com DDD *" hint="Ex.: (11) 98765-4321. O 55 do Brasil é removido automaticamente.">
                <Input name="phone" required inputMode="tel" />
              </Field>
              <Field label="Tempo desde a última compra *">
                <Select name="years" required defaultValue="">
                  <option value="" disabled>
                    Selecione…
                  </option>
                  {([1, 2, 3, 4] as const).map((y) => (
                    <option key={y} value={y}>
                      {YEARS_LABEL[y]}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="text-xs text-slate-500">Cadastrar não envia nenhuma mensagem. Telefones que já estão na fila são bloqueados.</p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Salvando…" : "Adicionar à fila"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
