"use client";
import { useState, useTransition } from "react";
import { FilePlus2, Glasses } from "lucide-react";
import { Badge, Button, Card, Field, Input, Notice, cn } from "@/components/ui";
import { date, todayYmd } from "@/lib/format";
import { savePrescriptionAction } from "@/lib/vendas/actions";
import type { CustomerContext } from "@/lib/vendas/types";
import type { RxEye } from "@/lib/types";
import { RxTable } from "./rx-table";

const FIELDS: { key: keyof RxEye; label: string; step: string }[] = [
  { key: "sph", label: "Esférico", step: "0.25" },
  { key: "cyl", label: "Cilíndrico", step: "0.25" },
  { key: "axis", label: "Eixo", step: "1" },
  { key: "add", label: "Adição", step: "0.25" },
  { key: "dnp", label: "DNP", step: "0.5" },
  { key: "height", label: "Altura", step: "0.5" },
];

type EyeForm = Record<string, string>;
const empty = (): EyeForm => Object.fromEntries(FIELDS.map((f) => [f.key, ""]));
const toEye = (f: EyeForm): RxEye => {
  const out: RxEye = {};
  for (const { key } of FIELDS) {
    const v = f[key]?.trim().replace(",", ".");
    const n = v ? Number(v) : NaN;
    (out as Record<string, number | null>)[key] = Number.isFinite(n) ? n : null;
  }
  return out;
};

export function RxStep({
  customer,
  selectedId,
  skipped,
  onSelect,
  onSkip,
  onCustomerUpdate,
}: {
  customer: CustomerContext | null;
  selectedId: string | null;
  skipped: boolean;
  onSelect: (id: string | null) => void;
  onSkip: () => void;
  onCustomerUpdate: (c: CustomerContext) => void;
}) {
  const [showNew, setShowNew] = useState(!customer?.prescriptions.length);
  const [od, setOd] = useState<EyeForm>(empty);
  const [oe, setOe] = useState<EyeForm>(empty);
  const [exam, setExam] = useState(todayYmd());
  const [prof, setProf] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const today = todayYmd();

  if (!customer)
    return (
      <div className="space-y-3">
        <Notice tone="amber">Consumidor final: não é possível salvar receita. Para vender lentes com receita, identifique o cliente na etapa anterior.</Notice>
        <Button variant={skipped ? "success" : "secondary"} onClick={onSkip}>
          Seguir sem receita
        </Button>
      </div>
    );

  const save = () =>
    start(async () => {
      setError(null);
      const r = await savePrescriptionAction(customer.customer.id, { od: toEye(od), oe: toEye(oe), exam_date: exam, professional: prof || null });
      if (!r.ok) return setError(r.error);
      onCustomerUpdate(r.ctx);
      onSelect(r.id);
      setShowNew(false);
      setOd(empty());
      setOe(empty());
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant={showNew ? "primary" : "secondary"} onClick={() => setShowNew((v) => !v)}>
          <FilePlus2 className="size-4" /> Nova receita
        </Button>
        <Button variant={skipped ? "success" : "ghost"} onClick={onSkip}>
          Pular (venda sem lente)
        </Button>
      </div>

      {customer.prescriptions.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {customer.prescriptions.map((p) => {
            const expired = p.valid_until ? p.valid_until < today : false;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(selectedId === p.id ? null : p.id)}
                className={cn(
                  "rounded-xl border bg-white p-4 text-left shadow-sm transition",
                  selectedId === p.id ? "border-brand-500 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300",
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 font-medium text-slate-900">
                    <Glasses className="size-4 text-brand-600" /> Exame de {date(p.exam_date)}
                  </span>
                  {expired ? <Badge tone="red">Vencida</Badge> : <Badge tone="green">Válida até {date(p.valid_until)}</Badge>}
                </div>
                <RxTable od={p.od} oe={p.oe} />
                {p.professional && <div className="mt-2 text-xs text-slate-500">{p.professional}</div>}
              </button>
            );
          })}
        </div>
      )}

      {showNew && (
        <Card className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-1 pr-2">Olho</th>
                  {FIELDS.map((f) => (
                    <th key={f.key} className="px-1 py-1 font-medium">
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["OD", od, setOd],
                    ["OE", oe, setOe],
                  ] as const
                ).map(([eye, val, set]) => (
                  <tr key={eye}>
                    <td className="py-1 pr-2 font-semibold text-slate-700">{eye}</td>
                    {FIELDS.map((f) => (
                      <td key={f.key} className="px-1 py-1">
                        <Input
                          type="number"
                          step={f.step}
                          className="min-w-20 px-2"
                          value={val[f.key]}
                          onChange={(e) => set({ ...val, [f.key]: e.target.value })}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Data do exame">
              <Input type="date" value={exam} onChange={(e) => setExam(e.target.value)} />
            </Field>
            <Field label="Profissional">
              <Input value={prof} onChange={(e) => setProf(e.target.value)} placeholder="Nome / registro" />
            </Field>
            <div className="flex items-end gap-2">
              <Button variant="secondary" onClick={() => setOe({ ...od })} type="button">
                Copiar OD → OE
              </Button>
              <Button onClick={save} disabled={pending} className="flex-1">
                Salvar receita
              </Button>
            </div>
          </div>
          {error && (
            <div className="mt-3">
              <Notice tone="red">{error}</Notice>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
