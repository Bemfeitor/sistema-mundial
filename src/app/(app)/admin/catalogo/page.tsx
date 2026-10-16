import Link from "next/link";
import { Badge, Button, Card, CardHeader, Field, Input, LinkButton, PageHeader, Select, Table, Td, Textarea, cn } from "@/components/ui";
import { FilterBar, Flash } from "@/components/gestao/kit";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { brl, label, pct } from "@/lib/format";
import { CATEGORY_KEYS, mapBy, one, type SearchParams } from "@/lib/gestao/util";
import type { Product } from "@/lib/types";
import { alternarProduto, importarCatalogo, salvarProduto } from "@/lib/gestao/admin-actions";

const margin = (p: Pick<Product, "price_cents" | "cost_cents">) => (p.price_cents ? ((p.price_cents - p.cost_cents) / p.price_cents) * 100 : 0);
const reais = (c?: number) => (c != null ? (c / 100).toFixed(2).replace(".", ",") : "");
const CSV_EXAMPLE = `sku;nome;categoria;marca;linha;nivel;preco;custo;codigo_barras;fornecedor;modelo;cor;tamanho;tags
ARM-0100;Armação Aurora preta;armacao;Linha Própria;Aurora;essencial;320,00;90,00;7890000000001;Distribuidora;Aurora;Preto;52-18-140;feminino
LC-0200;Lente de contato mensal;lente_contato;LC Brasil;;;180,00;70,00;;Lentes de Contato Brasil;;;;`;

export default async function Catalogo({ searchParams }: { searchParams: SearchParams }) {
  await requireUser("administrar");
  const sp = await searchParams;
  const d = db();
  const [products, suppliers] = await Promise.all([d.list("products", { order: { column: "name" } }), d.list("suppliers", { order: { column: "name" } })]);
  const sup = mapBy(suppliers);
  const edit = products.find((p) => p.id === one(sp.edit));
  const novo = one(sp.novo) === "1";
  const importar = one(sp.importar) === "1";
  const cat = one(sp.cat), marca = one(sp.marca), q = one(sp.q).toLowerCase(), inativos = one(sp.inativos) === "1";
  const brands = [...new Set(products.map((p) => p.brand).filter(Boolean) as string[])].sort();
  const list = products
    .filter((p) => inativos || p.active)
    .filter((p) => (!cat || p.category === cat) && (!marca || p.brand === marca))
    .filter((p) => !q || `${p.name} ${p.sku} ${p.barcode ?? ""} ${p.line ?? ""} ${(p.tags ?? []).join(" ")}`.toLowerCase().includes(q));
  const showForm = !!edit || novo;
  const formCat = edit?.category ?? (CATEGORY_KEYS.includes(one(sp.categoria) as Product["category"]) ? (one(sp.categoria) as Product["category"]) : "armacao");

  return (
    <div>
      <PageHeader
        title="Catálogo de produtos"
        subtitle={`${products.filter((p) => p.active).length} produtos ativos · armações, lentes, solares, lentes de contato, acessórios e serviços`}
        actions={
          <>
            <LinkButton href="/admin/catalogo?importar=1" variant="secondary">Importar CSV</LinkButton>
            <LinkButton href="/admin/catalogo?novo=1">Novo produto</LinkButton>
          </>
        }
      />
      <Flash sp={sp} />

      {importar && (
        <Card className="mb-4">
          <CardHeader title="Importar produtos (colar CSV)" subtitle="Separador ; ou , · 1ª linha = cabeçalho · produtos com SKU existente são atualizados" action={<Link href="/admin/catalogo" className="text-xs text-brand-700">Fechar</Link>} />
          <form action={importarCatalogo} className="grid gap-3 p-5">
            <Textarea name="csv" required className="min-h-48 font-mono text-xs" placeholder={CSV_EXAMPLE} />
            <p className="text-xs text-slate-500">
              Colunas aceitas: <code>sku, nome, categoria, preco</code> (obrigatórias) e <code>custo, marca, linha, nivel, codigo_barras, fornecedor, modelo, cor, tamanho, tags</code>. Categorias: armacao, lente, solar, lente_contato, acessorio, servico. Valores em reais (320,00).
            </p>
            <div><Button>Importar</Button></div>
          </form>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-5">
        <div className={showForm ? "xl:col-span-3" : "xl:col-span-5"}>
          <FilterBar>
            <Field label="Buscar"><Input name="q" defaultValue={one(sp.q)} placeholder="Nome, SKU, código de barras, tag" /></Field>
            <Field label="Categoria">
              <Select name="cat" defaultValue={cat}>
                <option value="">Todas</option>
                {CATEGORY_KEYS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </Select>
            </Field>
            <Field label="Marca">
              <Select name="marca" defaultValue={marca}>
                <option value="">Todas</option>
                {brands.map((b) => <option key={b}>{b}</option>)}
              </Select>
            </Field>
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="inativos" value="1" defaultChecked={inativos} /> Incluir inativos</label>
          </FilterBar>
          <Card>
            <Table head={["Produto", "Categoria", "Marca / linha", "Nível", "Preço", "Custo", "Margem", ""]} empty="Nenhum produto.">
              {list.map((p) => (
                <tr key={p.id} className={cn(!p.active && "opacity-50", p.id === edit?.id && "bg-brand-50/50")}>
                  <Td>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.sku}{p.barcode ? ` · ${p.barcode}` : ""}{p.supplier_id ? ` · ${sup.get(p.supplier_id)?.name ?? ""}` : ""}</div>
                  </Td>
                  <Td className="text-xs">{label(p.category)}{p.lens?.type ? <div className="text-slate-500">{label(p.lens.type)} {p.lens.index ?? ""}</div> : null}</Td>
                  <Td className="text-xs">{p.brand ?? "—"}<div className="text-slate-500">{p.line ?? ""}</div></Td>
                  <Td>{p.tier ? <Badge tone={p.tier === "premium" ? "violet" : p.tier === "conforto" ? "blue" : "slate"}>{label(p.tier)}</Badge> : "—"}</Td>
                  <Td>{brl(p.price_cents)}</Td>
                  <Td className="text-xs">{brl(p.cost_cents)}</Td>
                  <Td className={cn("text-xs font-semibold", margin(p) < 40 ? "text-amber-700" : "text-emerald-700")}>{p.price_cents ? pct(margin(p)) : "—"}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <Link href={`/admin/catalogo?edit=${p.id}`} className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50">Editar</Link>
                      <form action={alternarProduto}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">{p.active ? "Desativar" : "Ativar"}</button>
                      </form>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>

        {showForm && (
          <Card className="h-fit xl:col-span-2">
            <CardHeader
              title={edit ? `Editar: ${edit.name}` : "Novo produto"}
              subtitle={edit ? `Margem atual ${pct(margin(edit))} · markup ${(edit.price_cents / Math.max(1, edit.cost_cents)).toFixed(2).replace(".", ",")}x` : "Campos de armação/lente são usados conforme a categoria"}
              action={<Link href="/admin/catalogo" className="text-xs text-brand-700">Fechar</Link>}
            />
            {!edit && (
              <div className="flex flex-wrap gap-1 px-5 pt-4">
                {CATEGORY_KEYS.map((c) => (
                  <Link key={c} href={`/admin/catalogo?novo=1&categoria=${c}`} className={cn("rounded-full px-3 py-1 text-xs font-medium", formCat === c ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700")}>{label(c)}</Link>
                ))}
              </div>
            )}
            <form action={salvarProduto} className="grid gap-3 p-5" key={edit?.id ?? `novo-${formCat}`}>
              {edit && <input type="hidden" name="id" value={edit.id} />}
              <Field label="Nome"><Input name="name" required defaultValue={edit?.name} /></Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Categoria">
                  <Select name="category" defaultValue={formCat}>
                    {CATEGORY_KEYS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
                  </Select>
                </Field>
                <Field label="SKU"><Input name="sku" required defaultValue={edit?.sku} /></Field>
                <Field label="Código de barras"><Input name="barcode" defaultValue={edit?.barcode ?? ""} /></Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Marca"><Input name="brand" list="brands" defaultValue={edit?.brand ?? ""} /></Field>
                <Field label="Linha / família"><Input name="line" defaultValue={edit?.line ?? ""} /></Field>
                <Field label="Nível">
                  <Select name="tier" defaultValue={edit?.tier ?? ""}>
                    <option value="">—</option>
                    <option value="essencial">Essencial</option>
                    <option value="conforto">Conforto</option>
                    <option value="premium">Premium</option>
                  </Select>
                </Field>
              </div>
              <datalist id="brands">{brands.map((b) => <option key={b} value={b} />)}</datalist>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Preço de venda (R$)"><Input name="price" inputMode="decimal" required defaultValue={reais(edit?.price_cents)} /></Field>
                <Field label="Custo (R$)"><Input name="cost" inputMode="decimal" defaultValue={reais(edit?.cost_cents)} /></Field>
                <Field label="Fornecedor">
                  <Select name="supplier_id" defaultValue={edit?.supplier_id ?? ""}>
                    <option value="">—</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </Field>
              </div>

              {(formCat === "armacao" || formCat === "solar") && (
                <fieldset className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 p-3">
                  <legend className="px-1 text-xs font-semibold uppercase text-slate-500">Armação (grade)</legend>
                  <Field label="Modelo"><Input name="frame_model" defaultValue={edit?.frame?.model ?? ""} /></Field>
                  <Field label="Cor"><Input name="frame_color" defaultValue={edit?.frame?.color ?? ""} /></Field>
                  <Field label="Tamanho" hint="ex.: 52-18-140"><Input name="frame_size" defaultValue={edit?.frame?.size ?? ""} /></Field>
                  <Field label="Material"><Input name="frame_material" defaultValue={edit?.frame?.material ?? ""} /></Field>
                  <Field label="Formato"><Input name="frame_shape" defaultValue={edit?.frame?.shape ?? ""} /></Field>
                  <Field label="Gênero">
                    <Select name="frame_gender" defaultValue={edit?.frame?.gender ?? ""}>
                      <option value="">—</option><option value="F">Feminino</option><option value="M">Masculino</option><option value="U">Unissex</option>
                    </Select>
                  </Field>
                </fieldset>
              )}

              {formCat === "lente" && (
                <fieldset className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 p-3">
                  <legend className="px-1 text-xs font-semibold uppercase text-slate-500">Lente</legend>
                  <Field label="Tipo">
                    <Select name="lens_type" defaultValue={edit?.lens?.type ?? "visao_simples"}>
                      {["visao_simples", "multifocal", "bifocal", "ocupacional"].map((t) => <option key={t} value={t}>{label(t)}</option>)}
                    </Select>
                  </Field>
                  <Field label="Índice"><Input name="lens_index" inputMode="decimal" defaultValue={edit?.lens?.index ?? ""} placeholder="1.59" /></Field>
                  <Field label="Prazo lab (dias)"><Input name="lens_lab_days" type="number" min={0} defaultValue={edit?.lens?.lab_days ?? ""} /></Field>
                  <Field label="Esférico mín."><Input name="lens_sph_min" inputMode="decimal" defaultValue={edit?.lens?.sph_min ?? ""} /></Field>
                  <Field label="Esférico máx."><Input name="lens_sph_max" inputMode="decimal" defaultValue={edit?.lens?.sph_max ?? ""} /></Field>
                  <Field label="Cilíndrico máx."><Input name="lens_cyl_max" inputMode="decimal" defaultValue={edit?.lens?.cyl_max ?? ""} /></Field>
                  <Field label="Tratamentos" className="col-span-3" hint="Separados por vírgula: antirreflexo, filtro_azul, hidrofobico…">
                    <Input name="lens_treatments" defaultValue={(edit?.lens?.treatments ?? []).join(", ")} />
                  </Field>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="lens_photochromic" defaultChecked={!!edit?.lens?.photochromic} /> Fotossensível</label>
                  <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="lens_blue_filter" defaultChecked={!!edit?.lens?.blue_filter} /> Filtro de luz azul</label>
                </fieldset>
              )}

              <Field label="Tags" hint="Separadas por vírgula (ex.: crianca, polarizado, uv400)"><Input name="tags" defaultValue={(edit?.tags ?? []).join(", ")} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={edit?.active ?? true} /> Ativo</label>
              <Button>{edit ? "Salvar alterações" : "Cadastrar produto"}</Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
