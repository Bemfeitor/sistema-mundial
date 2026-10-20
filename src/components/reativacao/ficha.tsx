"use client";
import { useActionState, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Check, Copy, ExternalLink, History, MessageCircle, Save } from "lucide-react";
import { confirmarEnvio, encerrarSemResposta, prepararEnvio, salvarFicha } from "@/lib/reativacao/actions";
import {
  ATTENDANCE_LABEL,
  FLAG_LABEL,
  OPP_STATUS_LABEL,
  RESPONSE_LABEL,
  YEARS_LABEL,
  asYears,
  blockReason,
  consentBlocked,
  firstName,
  formatPhone,
  isOverdue,
  normalizePhone,
  reviewIssues,
} from "@/lib/reativacao/shared";
import { MODELOS, aplicarModelo } from "@/lib/clientes/modelos";
import { dateTime } from "@/lib/format";
import { ATTENDANCE_STAGES, RESPONSE_CLASSES, type Message, type Opportunity, type Reativacao } from "@/lib/types";
import { Badge, Button, Card, CardHeader, Field, Input, Notice, Select, Textarea } from "@/components/ui";

export interface FichaData {
  id: string;
  status: Opportunity["status"];
  nextContactAt: string;
  createdAt: string;
  r: Reativacao;
  customer: { id: string; name: string; phone: string; consent_marketing: boolean; consent_version: string | null; notes: string | null };
  canEditCustomer: boolean;
  storeName: string;
  userName: string;
  ownerName: string;
  duplicate: boolean;
  messages: { id: string; at: string; text: string; status: Message["status"]; kind: string }[];
  pending: { id: string; text: string } | null;
}

const MSG_STATUS: Record<Message["status"], string> = {
  para_validar: "Para validar",
  aprovada: "Aguardando confirmação",
  enviada: "Enviada",
  cancelada: "Não enviada",
};

type State = { ok?: boolean; error?: string } | null;

export function FichaReativacao({ data }: { data: FichaData }) {
  const { r, customer } = data;
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone);
  const [years, setYears] = useState<string>(String(r.years_since_purchase));
  const [attendance, setAttendance] = useState(r.attendance);
  const [text, setText] = useState(() => modelo("reativacao_primeiro_contato"));
  const [checked, setChecked] = useState(false);
  const [modal, setModal] = useState<{ messageId: string; url: string | null; text: string } | null>(
    data.pending ? { messageId: data.pending.id, url: null, text: data.pending.text } : null,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [busy, start] = useTransition();
  const [state, action, saving] = useActionState<State, FormData>(salvarFicha, null);

  function modelo(id: string) {
    const t = MODELOS.find((m) => m.id === id)?.texto ?? "";
    return aplicarModelo(t, { nome: firstName(name ?? customer.name), vendedor: firstName(data.userName), loja: data.storeName });
  }

  const dirty = name.trim() !== customer.name || normalizePhone(phone) !== normalizePhone(customer.phone) || years !== String(r.years_since_purchase);
  const liveIssues = reviewIssues({
    name,
    phone,
    years: asYears(years),
    duplicate: data.duplicate && normalizePhone(phone) === normalizePhone(customer.phone),
  });
  const savedIssues = useMemo(
    () => reviewIssues({ name: customer.name, phone: customer.phone, years: r.years_since_purchase, duplicate: data.duplicate }),
    [customer, r, data.duplicate],
  );
  const block = blockReason(r, customer, savedIssues);
  const overdue = isOverdue(r);
  const canOpen = !block && !dirty && checked && !!text.trim() && !busy && !modal;

  async function copiar(t: string) {
    try {
      await navigator.clipboard.writeText(t.normalize("NFC"));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  function abrirWhatsApp() {
    setErro(null);
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    // abre a aba já no clique (evita bloqueio de pop-up) e depois aponta para o WhatsApp
    const win = window.open("about:blank", "_blank");
    start(async () => {
      const res = await prepararEnvio({ id: data.id, text, mobile });
      if (res.error || !res.url || !res.messageId) {
        win?.close();
        setErro(res.error ?? "Não foi possível liberar a mensagem.");
        return;
      }
      if (win) {
        win.opener = null;
        win.location.href = res.url;
      } else {
        window.open(res.url, "_blank", "noopener,noreferrer");
      }
      setModal({ messageId: res.messageId, url: res.url, text });
    });
  }

  function confirmar(enviado: boolean) {
    if (!modal) return;
    setErro(null);
    start(async () => {
      const res = await confirmarEnvio({ id: data.id, messageId: modal.messageId, enviado });
      if (res.error) setErro(res.error);
      setModal(null);
      setChecked(false);
    });
  }

  const historico = [
    ...r.send_history.map((h) => ({
      at: h.at,
      title: h.kind === "retorno" ? "Retorno enviado" : "Mensagem enviada",
      detail: `por ${h.employee_name}`,
    })),
    ...data.messages
      .filter((m) => m.kind !== "reativacao" || m.status !== "enviada")
      .map((m) => ({ at: m.at, title: `Mensagem (${m.kind}) · ${MSG_STATUS[m.status]}`, detail: m.text })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        <form action={action}>
          <input type="hidden" name="id" value={data.id} />
          <Card>
            <CardHeader
              title="Ficha do cliente"
              subtitle={`Responsável: ${data.ownerName}${r.original_seller ? ` · Vendedor original: ${r.original_seller}` : ""}`}
              action={<Badge tone="slate">CRM: {OPP_STATUS_LABEL[data.status]}</Badge>}
            />
            <div className="space-y-4 p-5">
              {state?.error && <Notice tone="red">{state.error}</Notice>}
              {liveIssues.length > 0 && (
                <Notice tone="amber">
                  <ul className="list-disc pl-4">
                    {liveIssues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </Notice>
              )}
              {!data.canEditCustomer && (
                <Notice tone="blue">O cadastro deste cliente pertence a outra loja: nome e telefone só podem ser corrigidos por ela.</Notice>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome *">
                  <Input name="name" value={name} onChange={(e) => setName(e.target.value)} disabled={!data.canEditCustomer} maxLength={120} />
                </Field>
                <Field label="WhatsApp com DDD *" hint={formatPhone(normalizePhone(phone))}>
                  <Input name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!data.canEditCustomer} inputMode="tel" />
                </Field>
                <Field label="Tempo desde a última compra *">
                  <Select name="years" value={years} onChange={(e) => setYears(e.target.value)}>
                    {([1, 2, 3, 4] as const).map((y) => (
                      <option key={y} value={y}>
                        {YEARS_LABEL[y]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Próximo retorno">
                  <Input type="date" name="next_contact_at" defaultValue={data.nextContactAt.slice(0, 10)} />
                </Field>
                <Field label="Situação do atendimento">
                  <Select name="attendance" value={attendance} onChange={(e) => setAttendance(e.target.value as typeof attendance)}>
                    {ATTENDANCE_STAGES.map((a) => (
                      <option key={a} value={a}>
                        {ATTENDANCE_LABEL[a]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Classificação da resposta">
                  <Select name="response_class" defaultValue={r.response_class ?? ""}>
                    <option value="">— sem resposta classificada —</option>
                    {RESPONSE_CLASSES.map((c) => (
                      <option key={c} value={c}>
                        {RESPONSE_LABEL[c]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {!data.canEditCustomer && (
                <>
                  <input type="hidden" name="name" value={customer.name} />
                  <input type="hidden" name="phone" value={customer.phone} />
                </>
              )}
              {attendance === "nao_quer_mensagens" && r.attendance !== "nao_quer_mensagens" && (
                <Notice tone="amber">Ao salvar, o cliente ficará sem consentimento de marketing e não poderá receber novas mensagens.</Notice>
              )}
              {attendance === "visita_combinada" && <p className="text-xs text-slate-500">Ao salvar, a oportunidade vai para “Agendado” no CRM.</p>}
              {attendance === "venda_concluida" && <p className="text-xs text-slate-500">Ao salvar, a oportunidade vai para “Convertida” no CRM.</p>}
              <div className="flex justify-end">
                <Button type="submit" variant="secondary" disabled={saving}>
                  <Save className="size-4" /> {saving ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </div>
          </Card>
        </form>

        <Card>
          <CardHeader title="Mensagem" subtitle="Edite à vontade. O envio é feito por você, no WhatsApp." />
          <div className="space-y-4 p-5">
            {erro && <Notice tone="red">{erro}</Notice>}
            {overdue && (
              <Notice tone="red">
                <div className="flex flex-wrap items-center gap-3">
                  <AlertTriangle className="size-4" />
                  <span className="flex-1">Sem resposta há mais de 48 h desde o último envio ({dateTime(r.last_sent_at)}).</span>
                  {!r.follow_up_at ? (
                    <Button type="button" variant="secondary" onClick={() => setText(modelo("reativacao_retorno"))}>
                      Preparar mensagem de retorno
                    </Button>
                  ) : (
                    <form action={encerrarSemResposta}>
                      <input type="hidden" name="id" value={data.id} />
                      <Button type="submit" variant="danger">
                        Encerrar sem resposta
                      </Button>
                    </form>
                  )}
                </div>
              </Notice>
            )}
            {r.flag && r.flag !== "sem_contato" && (
              <Notice tone="amber">
                Alerta: {FLAG_LABEL[r.flag]}.{r.flag === "ja_houve_contato" && " Confira o histórico antes de mandar de novo."}
              </Notice>
            )}
            {consentBlocked(customer) && (
              <Notice tone="red">
                Este cliente recusou receber mensagens de marketing (consentimento desativado no cadastro). A mensagem fica bloqueada até que o
                próprio cliente autorize e o consentimento seja atualizado.
              </Notice>
            )}
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} className="font-[inherit]" />
            <div className="flex flex-wrap gap-2 text-xs">
              <button type="button" className="text-brand-700 hover:underline" onClick={() => setText(modelo("reativacao_primeiro_contato"))}>
                Usar modelo de primeiro contato
              </button>
              <span className="text-slate-300">|</span>
              <button type="button" className="text-brand-700 hover:underline" onClick={() => setText(modelo("reativacao_retorno"))}>
                Usar modelo de retorno
              </button>
            </div>
            {block && <Notice tone="amber">{block}</Notice>}
            {!block && dirty && <Notice tone="amber">Salve as correções da ficha antes de abrir o WhatsApp.</Notice>}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4" checked={checked} onChange={(e) => setChecked(e.target.checked)} disabled={!!block} />
              <span>Conferi o nome, o telefone, o histórico e o texto</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="success" disabled={!canOpen} onClick={abrirWhatsApp}>
                <MessageCircle className="size-4" /> {busy ? "Liberando…" : "Abrir WhatsApp"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => copiar(text)}>
                <Copy className="size-4" /> {copiado ? "Copiado!" : "Copiar mensagem"}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader title="Resumo" />
          <dl className="grid grid-cols-2 gap-3 p-5 text-sm">
            <dt className="text-slate-500">Situação</dt>
            <dd className="font-medium">{ATTENDANCE_LABEL[r.attendance]}</dd>
            <dt className="text-slate-500">Primeiro contato</dt>
            <dd>{dateTime(r.first_contact_at)}</dd>
            <dt className="text-slate-500">Último envio</dt>
            <dd>{dateTime(r.last_sent_at)}</dd>
            <dt className="text-slate-500">Retorno enviado</dt>
            <dd>{dateTime(r.follow_up_at)}</dd>
            <dt className="text-slate-500">Na fila desde</dt>
            <dd>{dateTime(data.createdAt)}</dd>
          </dl>
        </Card>
        <Card>
          <CardHeader title="Histórico" subtitle="Envios confirmados e mensagens do cliente (todas as lojas)" />
          <div className="p-5">
            {historico.length ? (
              <ol className="space-y-3">
                {historico.map((h, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <History className="mt-0.5 size-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800">{h.title}</div>
                      <div className="text-xs text-slate-500">{dateTime(h.at)}</div>
                      <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-xs text-slate-600">{h.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-500">Sem contato anterior registrado.</p>
            )}
          </div>
        </Card>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Atualizar resultado</h2>
            <p className="text-sm text-slate-600">
              Você enviou a mensagem para <strong>{customer.name}</strong> pelo WhatsApp? Só confirme depois de enviar de verdade.
            </p>
            {erro && <Notice tone="red">{erro}</Notice>}
            <div className="grid gap-2">
              <Button variant="success" disabled={busy} onClick={() => confirmar(true)}>
                <Check className="size-4" /> Sim, enviei pelo WhatsApp
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => confirmar(false)}>
                Ainda não enviei
              </Button>
              <div className="flex gap-2">
                {modal.url && (
                  <Button variant="ghost" className="flex-1" onClick={() => window.open(modal.url!, "_blank", "noopener,noreferrer")}>
                    <ExternalLink className="size-4" /> Abrir de novo
                  </Button>
                )}
                <Button variant="ghost" className="flex-1" onClick={() => copiar(modal.text)}>
                  <Copy className="size-4" /> {copiado ? "Copiado!" : "Copiar"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
