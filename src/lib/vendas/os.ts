// Constantes da OS de laboratório (sem dependências de servidor).
import { LAB_EXCEPTIONS, LAB_STATUSES, type LabOrder, type LabStatus } from "@/lib/types";

export const READY_CHECKLIST = [
  { key: "dnp_altura", label: "DNP e altura conferidas" },
  { key: "armacao_acabamento", label: "Armação e acabamento" },
  { key: "limpeza_identificacao", label: "Limpeza e identificação" },
] as const;

export const FINAL_STATUSES: LabStatus[] = ["entregue", "cancelado"];

export const STATUS_TONE: Record<LabStatus, "slate" | "blue" | "green" | "amber" | "red" | "violet"> = {
  aguardando_pedido: "slate",
  pedido_enviado: "blue",
  em_producao: "blue",
  recebido: "violet",
  em_montagem: "violet",
  conferencia: "amber",
  pronto: "green",
  cliente_avisado: "green",
  entregue: "slate",
  pendencia: "red",
  retrabalho: "red",
  devolvido_lab: "red",
  cancelado: "slate",
};

export const ALL_LAB_STATUSES: LabStatus[] = [...LAB_STATUSES, ...LAB_EXCEPTIONS];

/** Próxima etapa natural do fluxo (exceções voltam para produção/montagem). */
export function nextStatus(s: LabStatus): LabStatus | null {
  const i = (LAB_STATUSES as readonly string[]).indexOf(s);
  if (i >= 0) return LAB_STATUSES[i + 1] ?? null;
  if (s === "pendencia" || s === "devolvido_lab") return "em_producao";
  if (s === "retrabalho") return "em_montagem";
  return null;
}

export const isLate = (o: Pick<LabOrder, "due_at" | "status">, today: string) =>
  Boolean(o.due_at && o.due_at.slice(0, 10) < today && !["pronto", "cliente_avisado", "entregue", "cancelado"].includes(o.status));
