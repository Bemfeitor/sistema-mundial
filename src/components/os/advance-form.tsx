"use client";
import { useState } from "react";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { Button, Field, Notice, Select, Textarea } from "@/components/ui";
import { label } from "@/lib/format";
import { advanceLabOrderAction } from "@/lib/vendas/os-actions";
import { ALL_LAB_STATUSES, READY_CHECKLIST } from "@/lib/vendas/os";
import type { LabStatus } from "@/lib/types";

export function AdvanceForm({
  id,
  current,
  suggested,
  responsibleId,
  team,
  checklist,
}: {
  id: string;
  current: LabStatus;
  suggested: LabStatus | null;
  responsibleId: string | null;
  team: { id: string; name: string }[];
  checklist: Record<string, boolean>;
}) {
  const [status, setStatus] = useState<LabStatus>(suggested ?? current);
  const [checks, setChecks] = useState<Record<string, boolean>>(() => ({ ...checklist }));
  const needsChecklist = status === "pronto";
  const allChecked = READY_CHECKLIST.every((c) => checks[c.key]);
  const needsNote = ["pendencia", "retrabalho", "devolvido_lab", "cancelado"].includes(status);

  return (
    <form action={advanceLabOrderAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <Field label="Nova etapa">
        <Select name="status" value={status} onChange={(e) => setStatus(e.target.value as LabStatus)}>
          {ALL_LAB_STATUSES.map((s) => (
            <option key={s} value={s} disabled={s === current}>
              {label(s)}
              {s === suggested ? " (próxima)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Responsável">
        <Select name="responsible_id" defaultValue={responsibleId ?? ""}>
          <option value="">— manter —</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      {needsChecklist && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <ClipboardCheck className="size-4" /> Checklist de conferência (obrigatório)
          </div>
          {READY_CHECKLIST.map((c) => (
            <label key={c.key} className="flex items-center gap-2 py-1 text-sm text-slate-800">
              <input
                type="checkbox"
                name={`check_${c.key}`}
                checked={Boolean(checks[c.key])}
                onChange={(e) => setChecks({ ...checks, [c.key]: e.target.checked })}
                className="size-4 accent-emerald-600"
              />
              {c.label}
            </label>
          ))}
          <p className="mt-1 text-xs text-emerald-800">Ao marcar como pronto, uma mensagem “óculos pronto” vai para validação em Mensagens.</p>
        </div>
      )}
      <Field label={needsNote ? "Observação (obrigatória)" : "Observação"}>
        <Textarea name="note" required={needsNote} placeholder="Ex.: lente recebida sem riscos" />
      </Field>
      {needsChecklist && !allChecked && <Notice tone="amber">Marque todos os itens do checklist para concluir.</Notice>}
      <Button className="w-full" disabled={needsChecklist && !allChecked}>
        Registrar etapa <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}
