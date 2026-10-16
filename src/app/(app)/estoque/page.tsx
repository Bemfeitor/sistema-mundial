import Link from "next/link";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Stat, Table, Tabs, Td, Textarea, cn } from "@/components/ui";
import { FilterBar, Flash } from "@/components/gestao/kit";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { brl, dateTime, label, todayYmd } from "@/lib/format";
import { salesBetween } from "@/lib/gestao/server";
import { CATEGORY_KEYS, addDays, localYmd, mapBy, one, type SearchParams } from "@/lib/gestao/util";
import type { Product, Transfer } from "@/lib/types";
import { aplicarInventario, avancarTransferencia, criarTransferencia, definirMinimo, movimentar } from "./actions";

const TABS = [
  { key: "saldo", label: "Saldo" },
  { key: "movimentar", label: "Entrada / ajuste" },
  { key: "transferencias", label: "Transferências" },
  { key: "inventario", label: "Inventário" },
  { key: "historico", label: "Movimentações" },
  { key: "abc", label: "Curva ABC" },
  { key: "parados", label: "Produtos parados" },
];

const frameGrade = (p: Product) => (p.frame ? [p.frame.model, p.frame.color, p.frame.size].filter(Boolean).join(" · ") : "");

export default async function Estoque({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireUser("estoque");
  const sp = await searchParams;
  const aba = TABS.some((t) => t.key === one(sp.aba)) ? one(sp.aba) : "saldo";
  const d = db();
  const [products, stock, suppliers] = await Promise.all([
    d.list("products", { order: { column: "name" } }),
    d.list("stock"),
    d.list("suppliers"),
  ]);
  const stockable = products.filter((p) => p.category !== "servico" && p.active);
  const prodMap = mapBy(products);
  const stores = ctx.storeId ? ctx.stores.filter((s) => s.id === ctx.storeId) : ctx.can("consolidado") ? ctx.stores : ctx.stores.filter((s) => s.id === ctx.user.store_id);
  const actStores = ctx.can("consolidado") ? ctx.stores : ctx.stores.filter((s) => s.id === ctx.user.store_id);
  const storeName = (id: string) => ctx.stores.find((s) => s.id === id)?.name ?? "—";
  const qtyOf = (pid: string, sid: string) => stock.find((s) => s.product_id === pid && s.store_id === sid);

  return (
    <div>
      <PageHeader title="Estoque" subtitle="Saldo por loja, transferências, inventário e análise de giro" />
      <Tabs items={TABS.map((t) => ({ ...t, href: `/estoque?aba=${t.key}` }))} active={aba} />
      <Flash sp={sp} />
      {aba === "saldo" && <Saldo />}
      {aba === "movimentar" && <Movimentar />}
      {aba === "transferencias" && <Transferencias />}
      {aba === "inventario" && <Inventario />}
      {aba === "historico" && <Historico />}
      {aba === "abc" && <Abc />}
      {aba === "parados" && <Parados />}
    </div>
  );

  function ProductOptions() {
    return (
      <>
        <option value="">Selecione…</option>
        {stockable.map((p) => (
          <option key={p.id} value={p.id}>
            {p.sku} — {p.name}
            {frameGrade(p) ? ` (${frameGrade(p)})` : ""}
          </option>
        ))}
      </>
    );
  }
  function StoreOptions({ list = actStores }: { list?: typeof actStores }) {
    return (
      <>
        {list.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </>
    );
  }

  function Saldo() {
    const cat = one(sp.cat), marca = one(sp.marca), abaixo = one(sp.abaixo) === "1", q = one(sp.q).toLowerCase();
    const brands = [...new Set(stockable.map((p) => p.brand).filter(Boolean) as string[])].sort();
    const rows = stockable
      .filter((p) => (!cat || p.category === cat) && (!marca || p.brand === marca))
      .filter((p) => !q || `${p.name} ${p.sku} ${p.barcode ?? ""} ${frameGrade(p)}`.toLowerCase().includes(q))
      .map((p) => {
        const per = stores.map((s) => qtyOf(p.id, s.id));
        const total = per.reduce((a, s) => a + (s?.qty ?? 0), 0);
        const low = per.some((s) => s && s.qty < s.min_qty);
        return { p, per, total, low };
      })
      .filter((r) => !abaixo || r.low)
      .filter((r) => r.per.some(Boolean) || !abaixo);
    const pos = (n: number) => Math.max(0, n);
    const valCost = rows.reduce((a, r) => a + pos(r.total) * r.p.cost_cents, 0);
    const valSale = rows.reduce((a, r) => a + pos(r.total) * r.p.price_cents, 0);
    return (
      <>
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Peças em estoque" value={rows.reduce((a, r) => a + pos(r.total), 0)} />
          <Stat label="Valor a custo" value={brl(valCost)} />
          <Stat label="Valor a preço de venda" value={brl(valSale)} hint={valSale ? `Markup ${(valSale / Math.max(1, valCost)).toFixed(2).replace(".", ",")}x` : undefined} />
          <Stat label="Abaixo do mínimo" value={rows.filter((r) => r.low).length} tone={rows.some((r) => r.low) ? "warn" : "default"} />
        </div>
        <FilterBar>
          <input type="hidden" name="aba" value="saldo" />
          <Field label="Buscar">
            <Input name="q" defaultValue={one(sp.q)} placeholder="Nome, SKU, código, modelo…" />
          </Field>
          <Field label="Categoria">
            <Select name="cat" defaultValue={cat}>
              <option value="">Todas</option>
              {CATEGORY_KEYS.filter((c) => c !== "servico").map((c) => (
                <option key={c} value={c}>{label(c)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Marca">
            <Select name="marca" defaultValue={marca}>
              <option value="">Todas</option>
              {brands.map((b) => <option key={b}>{b}</option>)}
            </Select>
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="abaixo" value="1" defaultChecked={abaixo} /> Só abaixo do mínimo
          </label>
        </FilterBar>
        <Card>
          <Table
            head={["Produto", "Grade (modelo · cor · tamanho)", "Categoria / marca", ...stores.map((s) => `${s.code} (saldo/mín.)`), "Total", "Custo total", "Venda total"]}
            empty="Nenhum produto encontrado."
          >
            {rows.map(({ p, per, total, low }) => (
              <tr key={p.id} className={cn(low && "bg-amber-50/50")}>
                <Td>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.sku}{p.barcode ? ` · ${p.barcode}` : ""}</div>
                </Td>
                <Td className="text-xs text-slate-600">{frameGrade(p) || "—"}</Td>
                <Td className="text-xs">
                  {label(p.category)}
                  <div className="text-slate-500">{p.brand ?? ""}</div>
                </Td>
                {per.map((s, i) => (
                  <Td key={i}>
                    {s ? (
                      <span className={cn(s.qty < s.min_qty ? "font-semibold text-red-700" : "")}>
                        {s.qty} <span className="text-xs text-slate-400">/ {s.min_qty}</span>
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </Td>
                ))}
                <Td className="font-semibold">{total}</Td>
                <Td>{brl(Math.max(0, total) * p.cost_cents)}</Td>
                <Td>{brl(Math.max(0, total) * p.price_cents)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <p className="mt-2 text-xs text-slate-500">Lentes surfaçadas sob encomenda não controlam saldo (são pedidas ao laboratório por OS).</p>
      </>
    );
  }

  function Movimentar() {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Entrada, saída ou ajuste manual" subtitle="Ajuste use valor positivo ou negativo" />
          <form action={movimentar} className="grid gap-3 p-5">
            <Field label="Produto">
              <Select name="product_id" required><ProductOptions /></Select>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Loja">
                <Select name="store_id" defaultValue={ctx.storeId ?? ctx.user.store_id}><StoreOptions /></Select>
              </Field>
              <Field label="Tipo">
                <Select name="kind">
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                  <option value="ajuste">Ajuste (±)</option>
                  <option value="devolucao">Devolução</option>
                </Select>
              </Field>
              <Field label="Quantidade">
                <Input name="qty" type="number" step="1" required />
              </Field>
            </div>
            <Field label="Referência (NF, pedido…)">
              <Input name="reference" />
            </Field>
            <Field label="Observação">
              <Textarea name="note" />
            </Field>
            <Button>Registrar movimento</Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Estoque mínimo e localização" subtitle="Usado nos alertas e na sugestão de compra" />
          <form action={definirMinimo} className="grid gap-3 p-5">
            <Field label="Produto">
              <Select name="product_id" required><ProductOptions /></Select>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Loja">
                <Select name="store_id" defaultValue={ctx.storeId ?? ctx.user.store_id}><StoreOptions /></Select>
              </Field>
              <Field label="Mínimo">
                <Input name="min_qty" type="number" min={0} required />
              </Field>
              <Field label="Localização">
                <Input name="location" placeholder="Vitrine 2, gaveta B…" />
              </Field>
            </div>
            <Button variant="secondary">Salvar</Button>
          </form>
        </Card>
      </div>
    );
  }

  async function Transferencias() {
    const list = (await d.list("transfers", { order: { column: "created_at", ascending: false } })).filter(
      (t) => !ctx.storeId || t.from_store_id === ctx.storeId || t.to_store_id === ctx.storeId,
    );
    const tone: Record<Transfer["status"], "amber" | "blue" | "green" | "slate"> = { solicitada: "amber", enviada: "blue", recebida: "green", cancelada: "slate" };
    const st = { solicitada: "Solicitada", enviada: "Enviada", recebida: "Recebida", cancelada: "Cancelada" };
    return (
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Solicitar transferência" subtitle="Solicitar → enviar (baixa na origem) → receber (entra no destino)" />
          <form action={criarTransferencia} className="grid gap-3 p-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Origem">
                <Select name="from_store_id"><StoreOptions list={ctx.stores} /></Select>
              </Field>
              <Field label="Destino">
                <Select name="to_store_id" defaultValue={ctx.stores[1]?.id}><StoreOptions list={ctx.stores} /></Select>
              </Field>
            </div>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px] gap-2">
                <Select name={`p${i}`} required={i === 0}><ProductOptions /></Select>
                <Input name={`q${i}`} type="number" min={1} placeholder="Qtd" />
              </div>
            ))}
            <Field label="Observação">
              <Input name="note" />
            </Field>
            <Button>Solicitar</Button>
          </form>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title="Transferências" />
          <Table head={["Data", "Rota", "Itens", "Status", ""]} empty="Nenhuma transferência.">
            {list.map((t) => (
              <tr key={t.id}>
                <Td className="whitespace-nowrap text-xs">{dateTime(t.created_at)}</Td>
                <Td className="text-xs">
                  {storeName(t.from_store_id)} → {storeName(t.to_store_id)}
                  {t.note && <div className="text-slate-500">{t.note}</div>}
                </Td>
                <Td className="text-xs">
                  {t.items.map((it) => (
                    <div key={it.product_id}>
                      {it.qty}× {prodMap.get(it.product_id)?.name ?? "?"}
                    </div>
                  ))}
                </Td>
                <Td><Badge tone={tone[t.status]}>{st[t.status]}</Badge></Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {t.status === "solicitada" && <TAction id={t.id} to="enviada" label="Enviar" />}
                    {t.status === "enviada" && <TAction id={t.id} to="recebida" label="Receber" />}
                    {(t.status === "solicitada" || t.status === "enviada") && <TAction id={t.id} to="cancelada" label="Cancelar" ghost />}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    );
  }

  async function Inventario() {
    const storeId = one(sp.loja) || ctx.storeId || ctx.user.store_id;
    const cat = one(sp.cat);
    const items = stockable.filter((p) => !cat || p.category === cat);
    return (
      <>
        <FilterBar>
          <input type="hidden" name="aba" value="inventario" />
          <Field label="Loja">
            <Select name="loja" defaultValue={storeId}><StoreOptions /></Select>
          </Field>
          <Field label="Categoria">
            <Select name="cat" defaultValue={cat}>
              <option value="">Todas</option>
              {CATEGORY_KEYS.filter((c) => c !== "servico").map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </Select>
          </Field>
        </FilterBar>
        <Card>
          <CardHeader title={`Contagem de inventário — ${storeName(storeId)}`} subtitle="Preencha só o que contou. Diferenças viram movimentos do tipo “inventário”." />
          <form action={aplicarInventario}>
            <input type="hidden" name="store_id" value={storeId} />
            <Table head={["Produto", "Grade", "Sistema", "Contado"]}>
              {items.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.sku}</div>
                  </Td>
                  <Td className="text-xs text-slate-600">{frameGrade(p) || "—"}</Td>
                  <Td>{qtyOf(p.id, storeId)?.qty ?? 0}</Td>
                  <Td className="w-32">
                    <Input name={`count_${p.id}`} type="number" min={0} className="py-1" />
                  </Td>
                </tr>
              ))}
            </Table>
            <div className="flex justify-end border-t border-slate-100 p-4">
              <Button>Aplicar ajustes de inventário</Button>
            </div>
          </form>
        </Card>
      </>
    );
  }

  async function Historico() {
    const kind = one(sp.tipo), q = one(sp.q).toLowerCase();
    const movs = (await d.list("stock_movements", { eq: ctx.storeId ? { store_id: ctx.storeId } : {}, order: { column: "created_at", ascending: false }, limit: 500 }))
      .filter((m) => !kind || m.kind === kind)
      .filter((m) => !q || `${prodMap.get(m.product_id)?.name ?? ""} ${prodMap.get(m.product_id)?.sku ?? ""} ${m.reference ?? ""}`.toLowerCase().includes(q))
      .slice(0, 200);
    const emps = mapBy(await d.list("employees"));
    const kinds = ["entrada", "saida", "venda", "ajuste", "transferencia", "devolucao", "inventario"];
    return (
      <>
        <FilterBar>
          <input type="hidden" name="aba" value="historico" />
          <Field label="Buscar">
            <Input name="q" defaultValue={one(sp.q)} placeholder="Produto, SKU, referência" />
          </Field>
          <Field label="Tipo">
            <Select name="tipo" defaultValue={kind}>
              <option value="">Todos</option>
              {kinds.map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
            </Select>
          </Field>
        </FilterBar>
        <Card>
          <Table head={["Data", "Produto", "Loja", "Tipo", "Qtd", "Referência", "Responsável", "Obs."]} empty="Nenhuma movimentação registrada.">
            {movs.map((m) => (
              <tr key={m.id}>
                <Td className="whitespace-nowrap text-xs">{dateTime(m.created_at)}</Td>
                <Td>{prodMap.get(m.product_id)?.name ?? "?"}</Td>
                <Td className="text-xs">{storeName(m.store_id)}</Td>
                <Td><Badge tone={m.qty > 0 ? "green" : "red"}>{m.kind}</Badge></Td>
                <Td className={cn("font-semibold", m.qty > 0 ? "text-emerald-700" : "text-red-700")}>{m.qty > 0 ? `+${m.qty}` : m.qty}</Td>
                <Td className="text-xs">{m.reference ?? "—"}</Td>
                <Td className="text-xs">{m.employee_id ? emps.get(m.employee_id)?.name ?? "—" : "—"}</Td>
                <Td className="text-xs text-slate-500">{m.note ?? ""}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </>
    );
  }

  async function Abc() {
    const today = todayYmd();
    const sales = await salesBetween(addDays(today, -89), today, ctx.storeId);
    const rev = new Map<string, { qty: number; value: number }>();
    for (const s of sales) {
      const factor = s.subtotal_cents ? s.total_cents / s.subtotal_cents : 1;
      for (const it of s.items) {
        const r = rev.get(it.product_id) ?? { qty: 0, value: 0 };
        r.qty += it.qty;
        r.value += Math.round(it.price_cents * it.qty * factor);
        rev.set(it.product_id, r);
      }
    }
    const total = [...rev.values()].reduce((a, r) => a + r.value, 0);
    let acc = 0;
    const rows = products
      .filter((p) => p.active)
      .map((p) => ({ p, ...(rev.get(p.id) ?? { qty: 0, value: 0 }) }))
      .sort((a, b) => b.value - a.value)
      .map((r) => {
        acc += r.value;
        const cum = total ? (acc / total) * 100 : 100;
        const cls = r.value === 0 ? "C" : cum - (r.value / Math.max(1, total)) * 100 < 80 ? "A" : cum - (r.value / Math.max(1, total)) * 100 < 95 ? "B" : "C";
        return { ...r, cum, cls };
      });
    const count = (c: string) => rows.filter((r) => r.cls === c).length;
    return (
      <>
        <div className="mb-4 grid grid-cols-3 gap-4">
          <Stat label="Classe A (≈80% do faturamento)" value={count("A")} tone="good" hint="Nunca deixar faltar" />
          <Stat label="Classe B (próximos 15%)" value={count("B")} />
          <Stat label="Classe C (5% finais / sem venda)" value={count("C")} tone="warn" hint="Avaliar mix e reposição" />
        </div>
        <Card>
          <CardHeader title="Curva ABC por faturamento" subtitle={`Últimos 90 dias · ${brl(total)} faturados`} />
          <Table head={["Classe", "Produto", "Categoria", "Qtd vendida", "Faturamento", "% acumulado"]}>
            {rows.map((r) => (
              <tr key={r.p.id}>
                <Td><Badge tone={r.cls === "A" ? "green" : r.cls === "B" ? "blue" : "slate"}>{r.cls}</Badge></Td>
                <Td>{r.p.name}</Td>
                <Td className="text-xs">{label(r.p.category)}</Td>
                <Td>{r.qty}</Td>
                <Td>{brl(r.value)}</Td>
                <Td className="text-xs text-slate-500">{r.cum.toFixed(1).replace(".", ",")}%</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </>
    );
  }

  async function Parados() {
    const today = todayYmd();
    const sales = await salesBetween(addDays(today, -365), today, ctx.storeId);
    const last = new Map<string, string>();
    for (const s of sales) {
      const dd = localYmd(s.created_at);
      for (const it of s.items) if ((last.get(it.product_id) ?? "") < dd) last.set(it.product_id, dd);
    }
    const limit = addDays(today, -90);
    const rows = stock
      .filter((s) => s.qty > 0 && stores.some((st) => st.id === s.store_id))
      .map((s) => ({ s, p: prodMap.get(s.product_id), lastSale: last.get(s.product_id) }))
      .filter((r): r is { s: typeof r.s; p: Product; lastSale: string | undefined } => !!r.p && r.p.category !== "servico")
      .filter((r) => !r.lastSale || r.lastSale < limit)
      .sort((a, b) => b.s.qty * b.p.cost_cents - a.s.qty * a.p.cost_cents);
    const tied = rows.reduce((a, r) => a + r.s.qty * r.p.cost_cents, 0);
    return (
      <>
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Stat label="Itens sem venda há 90+ dias" value={rows.length} tone={rows.length ? "warn" : "good"} />
          <Stat label="Capital parado (custo)" value={brl(tied)} tone={tied ? "warn" : "default"} />
        </div>
        <Card>
          <CardHeader title="Produtos parados" subtitle="Com saldo e sem venda nos últimos 90 dias — candidatos a promoção, transferência ou devolução" />
          <Table head={["Produto", "Loja", "Saldo", "Custo parado", "Última venda", "Fornecedor"]} empty="Nenhum produto parado. Ótimo giro!">
            {rows.map(({ s, p, lastSale }) => (
              <tr key={s.id}>
                <Td>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-slate-500">{frameGrade(p) || p.sku}</div>
                </Td>
                <Td className="text-xs">{storeName(s.store_id)}</Td>
                <Td>{s.qty}</Td>
                <Td>{brl(s.qty * p.cost_cents)}</Td>
                <Td className="text-xs">{lastSale ? lastSale.split("-").reverse().join("/") : "Sem venda no último ano"}</Td>
                <Td className="text-xs">{suppliers.find((x) => x.id === p.supplier_id)?.name ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <p className="mt-2 text-xs text-slate-500">
          Dica: use <Link className="text-brand-700 hover:underline" href="/estoque?aba=transferencias">transferências</Link> para mover peças paradas para a loja que gira mais.
        </p>
      </>
    );
  }
}

function TAction({ id, to, label: text, ghost }: { id: string; to: string; label: string; ghost?: boolean }) {
  return (
    <form action={avancarTransferencia}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
      <Button variant={ghost ? "ghost" : "secondary"} className="px-2.5 py-1 text-xs">{text}</Button>
    </form>
  );
}
