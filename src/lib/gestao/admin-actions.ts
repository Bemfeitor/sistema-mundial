"use server";
import { createClient } from "@supabase/supabase-js";
import { db, isSupabaseConfigured } from "@/lib/db";
import { change, create, destroy } from "@/lib/audit";
import { toCents } from "@/lib/format";
import { PERMISSIONS, type CommissionRule, type LensType, type Permission, type Product, type Role } from "@/lib/types";
import { ROLES } from "@/lib/gestao/presets";
import { CATEGORY_KEYS, parseCsv } from "@/lib/gestao/util";
import { actionCtx, bool, dec, done, int, optStr, str } from "@/lib/gestao/server";

// ---------------- usuários ----------------
export async function salvarUsuario(f: FormData) {
  const { ctx, actor } = await actionCtx("administrar");
  const id = str(f, "id");
  const back = id ? `/admin/usuarios?edit=${id}` : "/admin/usuarios?novo=1";
  const name = str(f, "name"), email = str(f, "email").toLowerCase();
  const store_id = str(f, "store_id");
  if (!name || !email || !store_id) done(back, { erro: "Nome, e-mail e loja padrão são obrigatórios." });
  const dup = (await db().list("employees", { eq: { email } })).find((e) => e.id !== id);
  if (dup) done(back, { erro: `E-mail já usado por ${dup.name}.` });
  const role = (ROLES.includes(str(f, "role") as Role) ? str(f, "role") : "vendedor") as Role;
  const permissions = f.getAll("perm").map(String).filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p));
  const commission_rules: CommissionRule[] = [];
  for (const cat of ["*", ...CATEGORY_KEYS]) {
    const v = dec(f, `com_${cat}`);
    if (v != null && v > 0) commission_rules.push({ category: cat, percent: v });
  }
  const active = bool(f, "active");
  if (id === ctx.user.id && (!active || (role !== "admin" && !permissions.includes("administrar"))))
    done(back, { erro: "Você não pode remover o próprio acesso de administração." });
  const row = {
    name, email, phone: optStr(f, "phone"), role, store_id, department_id: optStr(f, "department_id"),
    permissions, discount_limit: Math.max(0, Math.min(100, dec(f, "discount_limit") ?? 0)), commission_rules, active,
  };
  const saved = id ? await change(actor, "employees", id, row) : await create(actor, "employees", row);
  done(`/admin/usuarios?edit=${saved.id}`, { ok: id ? "Usuário atualizado." : "Usuário cadastrado." });
}

export async function alternarUsuario(f: FormData) {
  const { ctx, actor } = await actionCtx("administrar");
  const u = await db().get("employees", str(f, "id"));
  if (!u) done("/admin/usuarios", { erro: "Usuário não encontrado." });
  if (u.id === ctx.user.id) done("/admin/usuarios", { erro: "Você não pode desativar a si mesmo." });
  await change(actor, "employees", u.id, { active: !u.active }, u.active ? "desativar" : "ativar");
  done("/admin/usuarios", { ok: u.active ? "Usuário desativado." : "Usuário reativado." });
}

export async function convidarUsuario(f: FormData) {
  const { actor } = await actionCtx("administrar");
  const u = await db().get("employees", str(f, "id"));
  const back = `/admin/usuarios?edit=${str(f, "id")}`;
  if (!u) done("/admin/usuarios", { erro: "Usuário não encontrado." });
  if (!isSupabaseConfigured())
    done(back, { erro: "Modo demonstração: o convite por e-mail só funciona com o Supabase conectado. No demo, o login é feito escolhendo o usuário na tela de entrada." });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.inviteUserByEmail(u.email, { data: { name: u.name } });
  if (error) done(back, { erro: `Falha ao convidar: ${error.message}` });
  if (data.user?.id) await change(actor, "employees", u.id, { auth_user_id: data.user.id }, "convidar");
  done(back, { ok: `Convite enviado para ${u.email}.` });
}

// ---------------- departamentos ----------------
export async function salvarDepartamento(f: FormData) {
  const { actor } = await actionCtx("administrar");
  const id = str(f, "id"), name = str(f, "name");
  if (!name) done("/admin/departamentos", { erro: "Informe o nome." });
  const row = { name, description: optStr(f, "description"), active: bool(f, "active") };
  if (id) await change(actor, "departments", id, row);
  else await create(actor, "departments", row);
  done("/admin/departamentos", { ok: "Departamento salvo." });
}

export async function excluirDepartamento(f: FormData) {
  const { actor } = await actionCtx("administrar");
  const id = str(f, "id");
  const users = await db().list("employees", { eq: { department_id: id } });
  if (users.length) done("/admin/departamentos", { erro: `Há ${users.length} usuário(s) neste departamento. Mova-os antes de excluir (ou desative).` });
  await destroy(actor, "departments", id);
  done("/admin/departamentos", { ok: "Departamento excluído." });
}

// ---------------- lojas ----------------
export async function salvarLoja(f: FormData) {
  const { actor } = await actionCtx("administrar");
  const id = str(f, "id"), name = str(f, "name"), code = str(f, "code").toUpperCase();
  if (!name || !code) done("/admin/lojas", { erro: "Nome e código são obrigatórios." });
  const dup = (await db().list("stores", { eq: { code } })).find((s) => s.id !== id);
  if (dup) done("/admin/lojas", { erro: `Código ${code} já usado por ${dup.name}.` });
  const row = { name, code, cnpj: optStr(f, "cnpj"), phone: optStr(f, "phone"), address: optStr(f, "address"), active: bool(f, "active") };
  if (id) await change(actor, "stores", id, row);
  else await create(actor, "stores", row);
  done("/admin/lojas", { ok: "Loja salva." });
}

// ---------------- convênios ----------------
export async function salvarConvenio(f: FormData) {
  const { actor } = await actionCtx("administrar");
  const id = str(f, "id"), name = str(f, "name");
  if (!name) done("/admin/convenios", { erro: "Informe o nome." });
  const row = { name, discount_percent: Math.max(0, Math.min(100, dec(f, "discount_percent") ?? 0)), contact: optStr(f, "contact"), active: bool(f, "active") };
  if (id) await change(actor, "insurers", id, row);
  else await create(actor, "insurers", row);
  done("/admin/convenios", { ok: "Convênio salvo." });
}

// ---------------- catálogo ----------------
const tierOf = (v: string): Product["tier"] => (["essencial", "conforto", "premium"].includes(v) ? (v as Product["tier"]) : null);
const catOf = (v: string): Product["category"] | null => {
  const n = v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, "_");
  const alias: Record<string, Product["category"]> = { armacao: "armacao", armacoes: "armacao", lente: "lente", lentes: "lente", solar: "solar", oculos_de_sol: "solar", lente_contato: "lente_contato", lente_de_contato: "lente_contato", lc: "lente_contato", acessorio: "acessorio", acessorios: "acessorio", servico: "servico", servicos: "servico" };
  return alias[n] ?? null;
};
const list = (v: string) => v.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);

export async function salvarProduto(f: FormData) {
  const { actor } = await actionCtx("administrar");
  const id = str(f, "id");
  const back = id ? `/admin/catalogo?edit=${id}` : "/admin/catalogo?novo=1";
  const name = str(f, "name"), sku = str(f, "sku");
  const category = catOf(str(f, "category"));
  if (!name || !sku || !category) done(back, { erro: "Nome, SKU e categoria são obrigatórios." });
  const dup = (await db().list("products", { eq: { sku } })).find((p) => p.id !== id);
  if (dup) done(back, { erro: `SKU ${sku} já usado por ${dup.name}.` });
  const frame = category === "armacao" || category === "solar"
    ? { model: str(f, "frame_model") || undefined, color: str(f, "frame_color") || undefined, size: str(f, "frame_size") || undefined, material: str(f, "frame_material") || undefined, shape: str(f, "frame_shape") || undefined, gender: str(f, "frame_gender") || undefined }
    : null;
  const lens = category === "lente"
    ? {
        type: (str(f, "lens_type") || undefined) as LensType | undefined,
        index: dec(f, "lens_index") ?? undefined,
        treatments: list(str(f, "lens_treatments")),
        sph_min: dec(f, "lens_sph_min") ?? undefined,
        sph_max: dec(f, "lens_sph_max") ?? undefined,
        cyl_max: dec(f, "lens_cyl_max") ?? undefined,
        lab_days: str(f, "lens_lab_days") ? int(f, "lens_lab_days") : undefined,
        photochromic: bool(f, "lens_photochromic"),
        blue_filter: bool(f, "lens_blue_filter"),
      }
    : null;
  const row = {
    name, sku, barcode: optStr(f, "barcode"), category, brand: optStr(f, "brand"), line: optStr(f, "line"), tier: tierOf(str(f, "tier")),
    supplier_id: optStr(f, "supplier_id"), price_cents: toCents(str(f, "price")), cost_cents: toCents(str(f, "cost")),
    frame, lens, tags: list(str(f, "tags")), active: bool(f, "active"),
  };
  const saved = id ? await change(actor, "products", id, row) : await create(actor, "products", row);
  done(`/admin/catalogo?edit=${saved.id}`, { ok: id ? "Produto atualizado." : "Produto cadastrado." });
}

export async function alternarProduto(f: FormData) {
  const { actor } = await actionCtx("administrar");
  const p = await db().get("products", str(f, "id"));
  if (!p) done("/admin/catalogo", { erro: "Produto não encontrado." });
  await change(actor, "products", p.id, { active: !p.active }, p.active ? "desativar" : "ativar");
  done("/admin/catalogo", { ok: p.active ? "Produto desativado." : "Produto reativado." });
}

/** Importação CSV: cabeçalho obrigatório; atualiza por SKU ou cria. */
export async function importarCatalogo(f: FormData) {
  const { actor } = await actionCtx("administrar");
  const back = "/admin/catalogo?importar=1";
  const rows = parseCsv(str(f, "csv"));
  if (rows.length < 2) done(back, { erro: "Cole o CSV com a linha de cabeçalho e ao menos um produto." });
  const head = rows[0].map((h) => h.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const ix = {
    sku: col("sku", "codigo"), name: col("nome", "name", "descricao"), cat: col("categoria", "category"), brand: col("marca", "brand"),
    line: col("linha", "line"), tier: col("nivel", "tier"), price: col("preco", "price", "preco_venda"), cost: col("custo", "cost"),
    barcode: col("codigo_barras", "ean", "barcode"), supplier: col("fornecedor", "supplier"), tags: col("tags"),
    model: col("modelo"), color: col("cor"), size: col("tamanho"),
  };
  if (ix.sku < 0 || ix.name < 0 || ix.cat < 0 || ix.price < 0) done(back, { erro: "Cabeçalho precisa ter ao menos: sku, nome, categoria, preco." });
  const [products, suppliers] = await Promise.all([db().list("products"), db().list("suppliers")]);
  let created = 0, updated = 0;
  const errors: string[] = [];
  for (const [n, r] of rows.slice(1).entries()) {
    const get = (i: number) => (i >= 0 ? r[i] ?? "" : "");
    const sku = get(ix.sku), name = get(ix.name), category = catOf(get(ix.cat));
    if (!sku || !name || !category) { errors.push(`linha ${n + 2}`); continue; }
    const supName = get(ix.supplier).toLowerCase();
    const supplier = supName ? suppliers.find((s) => s.name.toLowerCase() === supName || s.name.toLowerCase().includes(supName)) : undefined;
    const existing = products.find((p) => p.sku === sku);
    const frame = (category === "armacao" || category === "solar") && (get(ix.model) || get(ix.color) || get(ix.size))
      ? { ...(existing?.frame ?? {}), model: get(ix.model) || existing?.frame?.model, color: get(ix.color) || existing?.frame?.color, size: get(ix.size) || existing?.frame?.size }
      : existing?.frame ?? null;
    const row = {
      sku, name, category,
      brand: get(ix.brand) || existing?.brand || null,
      line: get(ix.line) || existing?.line || null,
      tier: tierOf(get(ix.tier).toLowerCase()) ?? existing?.tier ?? null,
      price_cents: toCents(get(ix.price)),
      cost_cents: ix.cost >= 0 ? toCents(get(ix.cost)) : existing?.cost_cents ?? 0,
      barcode: get(ix.barcode) || existing?.barcode || null,
      supplier_id: supplier?.id ?? existing?.supplier_id ?? null,
      tags: ix.tags >= 0 ? list(get(ix.tags)) : existing?.tags ?? [],
      frame,
    };
    if (existing) { await change(actor, "products", existing.id, row, "importar CSV"); updated++; }
    else { await create(actor, "products", { ...row, lens: null, active: true }, "importar CSV"); created++; }
  }
  done("/admin/catalogo", { ok: `Importação concluída: ${created} criado(s), ${updated} atualizado(s)${errors.length ? `; ignoradas: ${errors.join(", ")}` : ""}.` });
}
