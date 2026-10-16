import "server-only";
import { db, type NewRow, type Row } from "@/lib/db";
import type { Employee, TableName } from "@/lib/types";

export interface Actor {
  id?: string | null;
  name: string;
  source: "app" | "agente" | "sistema";
  store_id?: string | null;
}

export const actorOf = (u: Employee, source: Actor["source"] = "app"): Actor => ({
  id: u.id,
  name: u.name,
  source,
  store_id: u.store_id,
});

async function log(actor: Actor, action: string, table: TableName, id: string | null, before: unknown, after: unknown) {
  await db().insert("audit_log", {
    actor_id: actor.id ?? null,
    actor_name: actor.name,
    source: actor.source,
    action,
    table_name: table,
    record_id: id,
    before_data: before ?? null,
    after_data: after ?? null,
    store_id: actor.store_id ?? null,
  });
}

/** Inserção auditada. */
export async function create<T extends TableName>(actor: Actor, table: T, row: NewRow<T>, action = "criar") {
  const r = await db().insert(table, row);
  await log(actor, action, table, r.id, null, r);
  return r;
}

/** Atualização auditada com antes/depois. */
export async function change<T extends TableName>(actor: Actor, table: T, id: string, patch: Partial<Row<T>>, action = "alterar") {
  const before = await db().get(table, id);
  const r = await db().update(table, id, patch);
  await log(actor, action, table, id, before, r);
  return r;
}

export async function destroy<T extends TableName>(actor: Actor, table: T, id: string, action = "excluir") {
  const before = await db().get(table, id);
  await db().remove(table, id);
  await log(actor, action, table, id, before, null);
}
