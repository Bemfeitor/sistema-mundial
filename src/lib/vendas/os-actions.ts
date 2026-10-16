"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { canAccessStore, requireUser } from "@/lib/session";
import { actorOf, change, create } from "@/lib/audit";
import { LAB_EXCEPTIONS, LAB_STATUSES, type LabStatus } from "@/lib/types";
import { READY_CHECKLIST } from "./os";

const ALL: readonly string[] = [...LAB_STATUSES, ...LAB_EXCEPTIONS];

export async function advanceLabOrderAction(form: FormData) {
  const ctx = await requireUser("os");
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "") as LabStatus;
  const note = String(form.get("note") ?? "").trim();
  const responsible = String(form.get("responsible_id") ?? "") || null;
  const back = `/os/${id}`;
  if (!ALL.includes(status)) redirect(`${back}?erro=status`);
  const d = db();
  const os = await d.get("lab_orders", id);
  if (!os) redirect("/os");
  if (!canAccessStore(ctx, os.store_id)) redirect(`${back}?erro=loja`);

  const checklist = { ...(os.checklist ?? {}) };
  for (const c of READY_CHECKLIST) if (form.has(`check_${c.key}`)) checklist[c.key] = true;
  if (status === "pronto" && READY_CHECKLIST.some((c) => !checklist[c.key])) redirect(`${back}?erro=checklist`);
  if (["pendencia", "retrabalho", "devolvido_lab", "cancelado"].includes(status) && !note) redirect(`${back}?erro=observacao`);

  const actor = actorOf(ctx.user);
  await change(actor, "lab_orders", os.id, {
    status,
    checklist,
    responsible_id: responsible ?? os.responsible_id ?? null,
    history: [...(os.history ?? []), { at: new Date().toISOString(), status, by: ctx.user.name, note: note || undefined }],
  }, "avancar_etapa");

  if (status === "pronto" && os.customer_id && os.status !== "pronto") {
    const c = await d.get("customers", os.customer_id);
    if (c) {
      const store = await d.get("stores", os.store_id);
      await create(actor, "messages", {
        customer_id: c.id,
        kind: "oculos_pronto",
        channel: "whatsapp",
        text:
          `Olá, ${c.name.split(" ")[0]}! Seus óculos (OS ${os.number}) estão prontos para retirada` +
          (store ? ` na ${store.name}` : "") +
          ". Traga este aviso e aproveite para fazer o ajuste gratuito. Aguardamos sua visita!",
        status: "para_validar",
        prepared_by: ctx.user.id,
      });
    }
  }

  revalidatePath("/os");
  revalidatePath(back);
  redirect(`${back}?ok=1`);
}
