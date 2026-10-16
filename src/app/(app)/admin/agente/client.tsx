"use client";
import { useActionState, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { criarToken, type NovoTokenState } from "./actions";

export function CopyBlock({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2">
      {label && <div className="mb-1 text-xs font-medium text-slate-500">{label}</div>}
      <div className="relative">
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 pr-12 text-xs leading-relaxed text-slate-100">{text}</pre>
        <button
          type="button"
          title="Copiar"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="absolute right-2 top-2 rounded-md bg-white/10 p-1.5 text-slate-100 hover:bg-white/20"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function NovoTokenForm({ mcpUrl }: { mcpUrl: string }) {
  const [state, action, pending] = useActionState<NovoTokenState, FormData>(criarToken, {});
  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
        <Field label="Nome do token" hint="Para identificar onde ele é usado.">
          <Input name="nome" placeholder="Ex.: Claude Code — notebook do gestor" required maxLength={80} />
        </Field>
        <Field label="Escopo">
          <Select name="escopo" defaultValue="leitura">
            <option value="leitura">Somente leitura</option>
            <option value="total">Total (leitura e escrita)</option>
          </Select>
        </Field>
        <Button type="submit" disabled={pending} className="sm:mb-5">
          <KeyRound className="size-4" />
          {pending ? "Gerando..." : "Gerar token"}
        </Button>
      </form>
      {state.erro && <Notice tone="red">{state.erro}</Notice>}
      {state.token && (
        <Notice tone="amber">
          <p className="font-semibold">
            Token &quot;{state.nome}&quot; ({state.escopo === "total" ? "escopo total" : "somente leitura"}) criado. Copie agora: ele não será exibido de novo.
          </p>
          <CopyBlock text={state.token} />
          <CopyBlock
            label="Claude Code (já com o token):"
            text={`claude mcp add --transport http otica-mundial ${mcpUrl} --header "Authorization: Bearer ${state.token}"`}
          />
        </Notice>
      )}
    </div>
  );
}
