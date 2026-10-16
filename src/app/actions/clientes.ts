"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { create, change, destroy, actorOf } from "@/lib/audit";
import { requireUser } from "@/lib/session";
import { validarCpf, validarTelefone } from "@/lib/clientes/cpf";

// ---------- Cliente ----------

export async function salvarCliente(prev: unknown, fd: FormData) {
  const ctx = await requireUser("clientes");
  const id = fd.get("id") as string | null;

  const cpf = (fd.get("cpf") as string)?.replace(/\D/g, "") || null;
  if (cpf && !validarCpf(cpf)) return { error: "CPF inválido." };

  const phone = (fd.get("phone") as string)?.replace(/\D/g, "") || null;
  if (phone && !validarTelefone(phone)) return { error: "Telefone inválido (10 ou 11 dígitos)." };

  const row = {
    name: (fd.get("name") as string).trim(),
    cpf: cpf || null,
    phone: phone || null,
    email: (fd.get("email") as string)?.trim() || null,
    birth: (fd.get("birth") as string) || null,
    gender: (fd.get("gender") as "F" | "M" | "O") || null,
    address: (fd.get("address") as string)?.trim() || null,
    city: (fd.get("city") as string)?.trim() || null,
    profession: (fd.get("profession") as string)?.trim() || null,
    insurer_id: (fd.get("insurer_id") as string) || null,
    consent_program: fd.get("consent_program") === "on",
    consent_marketing: fd.get("consent_marketing") === "on",
    consent_version: "outubro/2026",
    notes: (fd.get("notes") as string)?.trim() || null,
  };

  if (!row.name) return { error: "Nome é obrigatório." };
  if (!row.consent_program) return { error: "A participação no programa de fidelidade é obrigatória." };

  const actor = actorOf(ctx.user);

  if (id) {
    await change(actor, "customers", id, row);
    revalidatePath(`/clientes/${id}`);
    revalidatePath("/clientes");
    return { ok: true };
  } else {
    const novo = await create(actor, "customers", {
      ...row,
      level: "Novo",
      card_token: crypto.randomUUID().replace(/-/g, ""),
      store_id: ctx.storeId ?? ctx.user.store_id,
      seller_id: ctx.user.role === "vendedor" ? ctx.user.id : null,
    });
    revalidatePath("/clientes");
    redirect(`/clientes/${novo.id}`);
  }
}

export async function alterarNivel(fd: FormData) {
  const ctx = await requireUser("clientes");
  const id = fd.get("id") as string;
  const level = fd.get("level") as string;
  await change(actorOf(ctx.user), "customers", id, { level: level as never });
  revalidatePath(`/clientes/${id}`);
}

export async function reemitirCartao(fd: FormData) {
  const ctx = await requireUser("clientes");
  const id = fd.get("id") as string;
  await change(actorOf(ctx.user), "customers", id, {
    card_token: crypto.randomUUID().replace(/-/g, ""),
  }, "reemitir_cartao");
  revalidatePath(`/clientes/${id}`);
}

// ---------- Receita ----------

export async function salvarReceita(fd: FormData) {
  const ctx = await requireUser("clientes");
  const customerId = fd.get("customer_id") as string;

  const parseEye = (prefix: string) => ({
    sph: fd.get(`${prefix}_sph`) ? Number(fd.get(`${prefix}_sph`)) : null,
    cyl: fd.get(`${prefix}_cyl`) ? Number(fd.get(`${prefix}_cyl`)) : null,
    axis: fd.get(`${prefix}_axis`) ? Number(fd.get(`${prefix}_axis`)) : null,
    add: fd.get(`${prefix}_add`) ? Number(fd.get(`${prefix}_add`)) : null,
    dnp: fd.get(`${prefix}_dnp`) ? Number(fd.get(`${prefix}_dnp`)) : null,
  });

  await create(actorOf(ctx.user), "prescriptions", {
    customer_id: customerId,
    exam_date: fd.get("exam_date") as string,
    valid_until: (fd.get("valid_until") as string) || null,
    professional: (fd.get("professional") as string)?.trim() || null,
    od: parseEye("od"),
    oe: parseEye("oe"),
    notes: (fd.get("notes") as string)?.trim() || null,
  });
  revalidatePath(`/clientes/${customerId}`);
}

// ---------- Benefício manual ----------

export async function concederBeneficio(fd: FormData) {
  const ctx = await requireUser("clientes");
  const customerId = fd.get("customer_id") as string;
  const kind = fd.get("kind") as "cashback" | "credito" | "presente" | "cupom";
  const reason = (fd.get("reason") as string)?.trim();

  if (!reason) return { error: "Motivo é obrigatório." };

  // Crédito em R$ só para admin
  if (kind === "credito" && ctx.user.role !== "admin")
    return { error: "Concessão de crédito em R$ é exclusiva para administrador." };

  const { toCents } = await import("@/lib/format");
  const amountCents = toCents(fd.get("amount") as string);
  if (amountCents <= 0) return { error: "Valor deve ser maior que zero." };

  const validDays = Number(fd.get("valid_days") ?? 90);
  const now = Date.now();
  const DAY = 864e5;

  const b = await create(actorOf(ctx.user), "benefits", {
    customer_id: customerId,
    kind,
    name: reason,
    initial_cents: amountCents,
    remaining_cents: amountCents,
    available_at: new Date(now).toISOString(),
    expires_at: new Date(now + validDays * DAY).toISOString(),
    campaign_id: null,
    sale_id: null,
  }, "conceder_beneficio");

  await db().insert("benefit_movements", {
    benefit_id: b.id,
    customer_id: customerId,
    amount_cents: amountCents,
    reason,
    employee_id: ctx.user.id,
    sale_id: null,
  });
  revalidatePath(`/clientes/${customerId}`);
  return { ok: true };
}

// ---------- Oportunidade / CRM ----------

export async function registrarAtendimento(fd: FormData) {
  const ctx = await requireUser("crm");
  const opp_id = fd.get("opp_id") as string | null;
  const customer_id = fd.get("customer_id") as string;
  const note = (fd.get("note") as string)?.trim();
  const status = (fd.get("status") as string) || "em_contato";

  if (opp_id) {
    await change(actorOf(ctx.user), "opportunities", opp_id, { status: status as never, note });
  } else {
    await create(actorOf(ctx.user), "opportunities", {
      customer_id,
      store_id: ctx.storeId ?? ctx.user.store_id,
      owner_id: ctx.user.id,
      kind: "pos_venda",
      status: status as never,
      note,
      next_contact_at: null,
    });
  }
  revalidatePath(`/clientes/${customer_id}`);
  revalidatePath("/crm");
}

// ---------- Mensagem ----------

export async function salvarMensagem(fd: FormData) {
  const ctx = await requireUser("crm");
  const id = fd.get("id") as string | null;
  const customer_id = fd.get("customer_id") as string;
  const text = (fd.get("text") as string)?.trim();

  if (!text) return { error: "Texto é obrigatório." };

  if (id) {
    await change(actorOf(ctx.user), "messages", id, { text, status: "para_validar" as const });
  } else {
    await create(actorOf(ctx.user), "messages", {
      customer_id,
      kind: (fd.get("kind") as string) || "manual",
      channel: "whatsapp",
      text,
      status: "para_validar",
      prepared_by: ctx.user.id,
    });
  }
  revalidatePath("/mensagens");
  return { ok: true };
}

export async function aprovarMensagem(fd: FormData) {
  const ctx = await requireUser("crm");
  const id = fd.get("id") as string;
  await change(actorOf(ctx.user), "messages", id, { status: "aprovada" });
  revalidatePath("/mensagens");
}

export async function cancelarMensagem(fd: FormData) {
  const ctx = await requireUser("crm");
  const id = fd.get("id") as string;
  await change(actorOf(ctx.user), "messages", id, { status: "cancelada" });
  revalidatePath("/mensagens");
}

export async function marcarEnviada(fd: FormData) {
  const ctx = await requireUser("crm");
  const id = fd.get("id") as string;
  await change(actorOf(ctx.user), "messages", id, { status: "enviada" });
  revalidatePath("/mensagens");
}

// ---------- Agenda ----------

export async function salvarAgendamento(prev: unknown, fd: FormData) {
  const ctx = await requireUser("clientes");
  const id = fd.get("id") as string | null;

  const row = {
    store_id: (fd.get("store_id") as string) || (ctx.storeId ?? ctx.user.store_id),
    customer_id: (fd.get("customer_id") as string) || null,
    customer_name: (fd.get("customer_name") as string)?.trim() || "",
    phone: (fd.get("phone") as string)?.replace(/\D/g, "") || null,
    professional_id: (fd.get("professional_id") as string) || null,
    starts_at: fd.get("starts_at") as string,
    kind: (fd.get("kind") as "exame" | "ajuste" | "entrega" | "adaptacao_lc") || "exame",
    status: "agendado" as const,
    note: (fd.get("note") as string)?.trim() || null,
  };

  const actor = actorOf(ctx.user);
  if (id) {
    await change(actor, "appointments", id, row);
  } else {
    await create(actor, "appointments", row);
  }
  revalidatePath("/agenda");
  return { ok: true };
}

export async function atualizarStatusAgendamento(fd: FormData) {
  const ctx = await requireUser("clientes");
  const id = fd.get("id") as string;
  const status = fd.get("status") as "agendado" | "confirmado" | "realizado" | "faltou" | "cancelado";
  await change(actorOf(ctx.user), "appointments", id, { status });
  revalidatePath("/agenda");
}

// ---------- Campanha (Fidelidade) ----------

export async function salvarCampanha(prev: unknown, fd: FormData) {
  const ctx = await requireUser("fidelidade");
  const id = fd.get("id") as string | null;
  const { toCents } = await import("@/lib/format");

  const cats = fd.getAll("categories") as string[];
  const row = {
    name: (fd.get("name") as string).trim(),
    active: fd.get("active") === "on",
    percent: Number(fd.get("percent") ?? 5),
    min_cents: toCents(fd.get("min_value") as string),
    max_cents: toCents(fd.get("max_value") as string),
    valid_days: Number(fd.get("valid_days") ?? 90),
    delay_days: Number(fd.get("delay_days") ?? 0),
    max_use_percent: Number(fd.get("max_use_percent") ?? 30),
    categories: cats as never,
    store_id: (fd.get("store_id") as string) || null,
    starts_at: fd.get("starts_at") as string,
    ends_at: fd.get("ends_at") as string,
  };

  const actor = actorOf(ctx.user);
  if (id) {
    await change(actor, "campaigns", id, row);
  } else {
    await create(actor, "campaigns", row);
  }
  revalidatePath("/fidelidade");
  return { ok: true };
}

// ---------- CRM: Gerar oportunidades automáticas ----------

export async function gerarOportunidades(fd: FormData) {
  const ctx = await requireUser("crm");
  const storeId = ctx.storeId ?? ctx.user.store_id;
  const actor = actorOf(ctx.user);
  const today = new Date().toISOString().slice(0, 10);
  const todayDate = new Date();
  const in30 = new Date(todayDate.getTime() + 30 * 864e5).toISOString().slice(0, 10);
  const in7 = new Date(todayDate.getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const weekStart = new Date(todayDate.getTime() - 3 * 864e5).toISOString().slice(0, 10);
  const weekEnd = new Date(todayDate.getTime() + 3 * 864e5).toISOString().slice(0, 10);
  const ago12m = new Date(todayDate.getTime() - 365 * 864e5).toISOString().slice(0, 10);

  const [customers, prescriptions, benefits, sales, existing] = await Promise.all([
    db().list("customers", { eq: storeId ? { store_id: storeId } : undefined }),
    db().list("prescriptions"),
    db().list("benefits"),
    db().list("sales", { eq: storeId ? { store_id: storeId } : undefined }),
    db().list("opportunities", { eq: { status: "nova" } }),
  ]);

  const existingKeys = new Set(existing.map((o) => `${o.customer_id}:${o.kind}`));
  const created: string[] = [];

  const mkOpp = async (customer_id: string, kind: string, note: string) => {
    const key = `${customer_id}:${kind}`;
    if (existingKeys.has(key)) return;
    existingKeys.add(key);
    await create(actor, "opportunities", {
      customer_id,
      store_id: storeId,
      owner_id: ctx.user.id,
      kind: kind as never,
      status: "nova",
      note,
      next_contact_at: null,
    });
    created.push(kind);
  };

  // Aniversariantes da semana
  const monthDay = (d: string) => d.slice(5); // MM-DD
  const todayMD = monthDay(today);
  const weekEndMD = monthDay(weekEnd);
  for (const c of customers) {
    if (!c.birth) continue;
    const bd = monthDay(c.birth);
    if (bd >= monthDay(weekStart) && bd <= weekEndMD)
      await mkOpp(c.id, "aniversario", `Aniversário em ${c.birth}`);
  }

  // Receitas vencendo em 30 dias
  for (const rx of prescriptions) {
    if (!rx.valid_until) continue;
    if (rx.valid_until >= today && rx.valid_until <= in30) {
      const c = customers.find((x) => x.id === rx.customer_id);
      if (c) await mkOpp(c.id, "reexame", `Receita vence em ${rx.valid_until}`);
    }
  }

  // Cashback a vencer em 15 dias
  const in15 = new Date(todayDate.getTime() + 15 * 864e5).toISOString().slice(0, 10);
  for (const b of benefits) {
    if (b.expires_at >= today && b.expires_at <= in15 && b.remaining_cents > 0) {
      const c = customers.find((x) => x.id === b.customer_id);
      if (c) await mkOpp(c.id, "cashback", `Cashback de R$${(b.remaining_cents/100).toFixed(2)} vence em ${b.expires_at}`);
    }
  }

  // Clientes sem compra há 12 meses
  const buyerIds = new Set(sales.filter((s) => s.created_at >= ago12m).map((s) => s.customer_id).filter(Boolean));
  for (const c of customers) {
    if (!buyerIds.has(c.id) && c.last_purchase_at && c.last_purchase_at < ago12m)
      await mkOpp(c.id, "reativacao", "Sem compra há mais de 12 meses");
  }

  // Pós-venda: vendas entregues 7 dias atrás
  const ago7 = new Date(todayDate.getTime() - 7 * 864e5).toISOString().slice(0, 10);
  for (const s of sales) {
    if (!s.customer_id) continue;
    if (s.status === "concluida" && s.created_at >= ago7 && s.created_at <= today)
      await mkOpp(s.customer_id, "pos_venda", `Pós-venda venda ${s.number}`);
  }

  revalidatePath("/crm");
  return { ok: true, criadas: created.length };
}
