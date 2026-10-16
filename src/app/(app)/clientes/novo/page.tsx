"use client";
import { useActionState } from "react";
import Link from "next/link";
import { salvarCliente } from "@/app/actions/clientes";
import { PageHeader, Card, Field, Input, Select, Textarea, Button, LinkButton, Notice } from "@/components/ui";

type State = { error?: string } | null;

export default function NovoClientePage() {
  const [state, action, pending] = useActionState<State, FormData>(
    async (_prev, fd): Promise<State> => {
      const r = await salvarCliente(undefined, fd);
      return r?.error ? { error: r.error } : null;
    },
    null,
  );

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Novo cliente"
        actions={
          <LinkButton href="/clientes" variant="secondary">
            Cancelar
          </LinkButton>
        }
      />

      <form action={action}>
        <input type="hidden" name="id" value="" />
        <Card className="divide-y divide-slate-100">
          {/* Dados pessoais */}
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <h2 className="col-span-full text-sm font-semibold text-slate-700">Dados pessoais</h2>
            <Field label="Nome completo *" className="col-span-full">
              <Input name="name" required autoFocus placeholder="Nome do cliente" />
            </Field>
            <Field label="CPF">
              <Input name="cpf" placeholder="000.000.000-00" />
            </Field>
            <Field label="Data de nascimento">
              <Input name="birth" type="date" />
            </Field>
            <Field label="Gênero">
              <Select name="gender" defaultValue="">
                <option value="">Não informado</option>
                <option value="F">Feminino</option>
                <option value="M">Masculino</option>
                <option value="O">Outro</option>
              </Select>
            </Field>
            <Field label="Profissão">
              <Input name="profession" placeholder="Ex.: Professor, Médico…" />
            </Field>
          </div>

          {/* Contato */}
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <h2 className="col-span-full text-sm font-semibold text-slate-700">Contato</h2>
            <Field label="WhatsApp / Telefone">
              <Input name="phone" placeholder="(43) 99999-9999" />
            </Field>
            <Field label="E-mail">
              <Input name="email" type="email" placeholder="cliente@email.com" />
            </Field>
            <Field label="Endereço" className="col-span-full">
              <Input name="address" placeholder="Rua, número, bairro" />
            </Field>
            <Field label="Cidade">
              <Input name="city" placeholder="Cidade" />
            </Field>
          </div>

          {/* Convênio e observações */}
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <h2 className="col-span-full text-sm font-semibold text-slate-700">Convênio e observações</h2>
            <Field label="Convênio">
              <Select name="insurer_id" defaultValue="">
                <option value="">Sem convênio</option>
                {/* Insurers são carregados no lado servidor; aqui aceita qualquer ID via URL params */}
              </Select>
            </Field>
            <Field label="Observações" className="col-span-full">
              <Textarea name="notes" placeholder="Informações adicionais…" />
            </Field>
          </div>

          {/* LGPD */}
          <div className="flex flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold text-slate-700">Consentimentos LGPD (versão outubro/2026)</h2>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="consent_program" className="mt-0.5 size-4 rounded" required />
              <span>
                <strong>Obrigatório:</strong> Autorizo o armazenamento dos meus dados pessoais para participação no Programa de Fidelidade Mundial Ótica, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="consent_marketing" className="mt-0.5 size-4 rounded" />
              <span>
                <strong>Opcional:</strong> Aceito receber comunicações de marketing (promoções, novidades e ofertas exclusivas) por WhatsApp, SMS ou e-mail.
              </span>
            </label>
          </div>

          {state?.error && (
            <div className="p-5">
              <Notice tone="red">{state.error}</Notice>
            </div>
          )}


          <div className="flex justify-end gap-2 px-5 py-4">
            <LinkButton href="/clientes" variant="secondary">
              Cancelar
            </LinkButton>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando…" : "Cadastrar cliente"}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
