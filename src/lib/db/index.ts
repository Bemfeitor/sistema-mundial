import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TableMap, TableName } from "@/lib/types";
import { buildSeed } from "./seed";

// Camada de dados única. Com Supabase configurado usa o banco (service role, só no servidor);
// sem configuração usa um banco em memória com dados de demonstração.

export type Row<T extends TableName> = TableMap[T];
export type NewRow<T extends TableName> = Omit<Row<T>, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export interface ListOptions<T extends TableName> {
  eq?: Partial<Record<keyof Row<T> & string, unknown>>;
  in?: { column: keyof Row<T> & string; values: unknown[] };
  gte?: { column: keyof Row<T> & string; value: string | number };
  lte?: { column: keyof Row<T> & string; value: string | number };
  search?: { columns: (keyof Row<T> & string)[]; term: string };
  order?: { column: keyof Row<T> & string; ascending?: boolean };
  limit?: number;
}

export interface Db {
  mode: "supabase" | "demo";
  list<T extends TableName>(table: T, opts?: ListOptions<T>): Promise<Row<T>[]>;
  get<T extends TableName>(table: T, id: string): Promise<Row<T> | null>;
  insert<T extends TableName>(table: T, row: NewRow<T>): Promise<Row<T>>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T>>;
  remove<T extends TableName>(table: T, id: string): Promise<void>;
}

export const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const now = () => new Date().toISOString();
const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// ---------- memória (demo) ----------
type Store = { [K in TableName]: Row<K>[] };
const g = globalThis as unknown as { __oticaDemo?: Store };

function memory(): Db {
  if (!g.__oticaDemo) g.__oticaDemo = buildSeed() as Store;
  const data = g.__oticaDemo;
  const tableOf = <T extends TableName>(t: T) => data[t] as Row<T>[];
  return {
    mode: "demo",
    async list(table, opts = {}) {
      let rows = [...tableOf(table)] as unknown as Record<string, unknown>[];
      if (opts.eq)
        for (const [k, v] of Object.entries(opts.eq))
          if (v !== undefined) rows = rows.filter((r) => r[k] === v);
      if (opts.in) rows = rows.filter((r) => opts.in!.values.includes(r[opts.in!.column]));
      if (opts.gte) rows = rows.filter((r) => (r[opts.gte!.column] as string) >= (opts.gte!.value as string));
      if (opts.lte) rows = rows.filter((r) => (r[opts.lte!.column] as string) <= (opts.lte!.value as string));
      if (opts.search?.term) {
        const t = norm(opts.search.term);
        rows = rows.filter((r) => opts.search!.columns.some((c) => norm(r[c]).includes(t)));
      }
      if (opts.order) {
        const { column, ascending = true } = opts.order;
        rows.sort((a, b) => {
          const x = a[column] as string | number, y = b[column] as string | number;
          return (x > y ? 1 : x < y ? -1 : 0) * (ascending ? 1 : -1);
        });
      }
      if (opts.limit) rows = rows.slice(0, opts.limit);
      return structuredClone(rows) as never;
    },
    async get(table, id) {
      const r = tableOf(table).find((x) => x.id === id);
      return r ? structuredClone(r) : null;
    },
    async insert(table, row) {
      const full = { ...row, id: row.id ?? crypto.randomUUID(), created_at: row.created_at ?? now() } as never;
      tableOf(table).push(full);
      return structuredClone(full);
    },
    async update(table, id, patch) {
      const rows = tableOf(table);
      const i = rows.findIndex((x) => x.id === id);
      if (i < 0) throw new Error(`${table}/${id} não encontrado`);
      rows[i] = { ...rows[i], ...patch, id, updated_at: now() };
      return structuredClone(rows[i]);
    },
    async remove(table, id) {
      const rows = tableOf(table);
      const i = rows.findIndex((x) => x.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
}

// ---------- Supabase ----------
let sb: SupabaseClient | null = null;
function supabase(): Db {
  sb ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const c = sb;
  const fail = (e: { message: string } | null) => {
    if (e) throw new Error(e.message);
  };
  return {
    mode: "supabase",
    async list(table, opts = {}) {
      let q = c.from(table).select("*");
      if (opts.eq)
        for (const [k, v] of Object.entries(opts.eq))
          if (v === null) q = q.is(k, null);
          else if (v !== undefined) q = q.eq(k, v as never);
      if (opts.in) q = q.in(opts.in.column, opts.in.values as never[]);
      if (opts.gte) q = q.gte(opts.gte.column, opts.gte.value);
      if (opts.lte) q = q.lte(opts.lte.column, opts.lte.value);
      if (opts.search?.term) {
        const t = opts.search.term.replace(/[,()%.:*\\"'`]/g, " ").trim().slice(0, 100);
        if (t) q = q.or(opts.search.columns.map((col) => `${col}.ilike.%${t}%`).join(","));
      }
      if (opts.order) q = q.order(opts.order.column, { ascending: opts.order.ascending ?? true });
      q = q.limit(opts.limit ?? 1000);
      const { data, error } = await q;
      fail(error);
      return (data ?? []) as never;
    },
    async get(table, id) {
      const { data, error } = await c.from(table).select("*").eq("id", id).maybeSingle();
      fail(error);
      return data as never;
    },
    async insert(table, row) {
      const { data, error } = await c.from(table).insert(row as never).select("*").single();
      fail(error);
      return data as never;
    },
    async update(table, id, patch) {
      const { data, error } = await c
        .from(table)
        .update({ ...patch, updated_at: now() } as never)
        .eq("id", id)
        .select("*")
        .single();
      fail(error);
      return data as never;
    },
    async remove(table, id) {
      const { error } = await c.from(table).delete().eq("id", id);
      fail(error);
    },
  };
}

export function db(): Db {
  return isSupabaseConfigured() ? supabase() : memory();
}
