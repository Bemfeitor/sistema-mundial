import Link from "next/link";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, LinkButton, PageHeader, Select, Stat, Table, Tabs, Td, Textarea } from "@/components/ui";
import { Flash } from "@/components/gestao/kit";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { brl, date, todayYmd } from "@/lib/format";
import { addDays, mapBy, one, type SearchParams } from "@/lib/gestao/util";
import type { PurchaseOrder } from "@/lib/types";
import { criarPedido, gerarDaSugestao, mudarStatusPedido, receberPedido } from "./actions";

type POItem = PurchaseOrder["items"][number] & { received?: number };
const STATUS: Record<PurchaseOrder["status"], { label: string; tone: "slate" | "blue" | "amber" | "green" | "red" }> = {
  rascunho: { label: "Rascunho", tone: "slate" },
  enviado: { label: "Enviado", tone: "blue" },
  recebido_parcial: { label: "Recebido parcial", tone: "amber" },
  recebido: { label: "Recebido", tone: "green" },
  cancelado: { label: "Cancelado", tone: "red" },
};
const TABS = [
  { key: "pedidos", label: "Pedidos de compra" },
  { key: "novo", label: "Novo pedido" },
  { key: "sugestao", label: "Sugestão automática" },
];

export default async function Compras({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireUser("compras");
  const sp = await searchParams;
  const pedidoId = one(sp.pedido);
  const aba = pedidoId ? "pedidos" : TABS.some((t) => t.key === one(sp.aba)) ? one(sp.aba) : "pedidos";
  const d = db();
  const [orders, suppliers, products, stock] = await Promise.all([
    d.list("purchase_orders", { eq: ctx.storeId ? { store_id: ctx.storeId } : {}, order: { column: "created_at", ascending: false } }),
    d.list("suppliers", { order: { column: "name" } }),
    d.list("products", { eq: { active: true }, order: { column: "name" } }),
    d.list("stock", { eq: ctx.storeId ? { store_id: ctx.storeId } : {} }),
  ]);
  const sup = mapBy(suppliers), prod = mapBy(products);
  const storeName = (id: string) => ctx.stores.find((s) => s.id === id)?.name ?? "—";
  const actStores = ctx.can("consolidado") ? ctx.stores : ctx.stores.filter((s) => s.id === ctx.user.store_id);

  return (
    <div>
      <PageHeader title="Compras" subtitle="Pedidos a fornecedores, recebimento com entrada de estoque e conta a pagar" />
      <Tabs items={TABS.map((t) => ({ ...t, href: `/compras?aba=${t.key}` }))} active={aba} />
      <Flash sp={sp} />
      {pedidoId ? <Detalhe /> : aba === "novo" ? <Novo /> : aba === "sugestao" ? <Sugestao /> : <Lista />}
    </div>
  );

  function Lista() {
    const open = orders.filter((o) => o.status === "enviado" || o.status === "recebido_parcial");
    return (
      <>
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Rascunhos" value={orders.filter((o) => o.status === "rascunho").length} />
          <Stat label="Aguardando entrega" value={open.length} />
          <Stat label="Valor em aberto" value={brl(open.reduce((a, o) => a + o.total_cents, 0))} />
          <Stat label="Atrasados" value={open.filter((o) => o.expected_at && o.expected_at < todayYmd()).length} tone="warn" />
        </div>
        <Card>
          <Table head={["Número", "Data", "Fornecedor", "Loja", "Itens", "Total", "Previsão", "Status"]} empty="Nenhum pedido de compra ainda.">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <Td><Link href={`/compras?pedido=${o.id}`} className="font-semibold text-brand-700 hover:underline">{o.number}</Link></Td>
                <Td className="text-xs">{date(o.created_at)}</Td>
                <Td>{sup.get(o.supplier_id)?.name ?? "—"}</Td>
                <Td className="text-xs">{storeName(o.store_id)}</Td>
                <Td>{o.items.reduce((a, i) => a + i.qty, 0)}</Td>
                <Td>{brl(o.total_cents)}</Td>
                <Td className="text-xs">{date(o.expected_at)}</Td>
                <Td><Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge></Td>
              </tr>
            ))}
          </Table>
        </Card>
      </>
    );
  }

  function Novo() {
    const presetSupplier = one(sp.fornecedor);
    return (
      <Card>
        <CardHeader title="Novo pedido de compra" subtitle="Custo em branco usa o custo cadastrado do produto" />
        <form action={criarPedido} className="grid gap-4 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Fornecedor">
              <Select name="supplier_id" required defaultValue={presetSupplier}>
                <option value="">Selecione…</option>
                {suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Loja de entrega">
              <Select name="store_id" defaultValue={ctx.storeId ?? ctx.user.store_id}>
                {actStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Previsão de entrega">
              <Input name="expected_at" type="date" defaultValue={addDays(todayYmd(), 7)} />
            </Field>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_90px_130px] gap-2 text-xs font-medium uppercase text-slate-500">
              <span>Produto</span><span>Qtd</span><span>Custo unit. (R$)</span>
            </div>
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_130px] gap-2">
                <Select name={`p${i}`} required={i === 0}>
                  <option value="">—</option>
                  {products.filter((p) => p.category !== "servico").map((p) => (
                    <option key={p.id} value={p.id}>{p.sku} — {p.name} ({brl(p.cost_cents)})</option>
                  ))}
                </Select>
                <Input name={`q${i}`} type="number" min={1} />
                <Input name={`c${i}`} inputMode="decimal" placeholder="padrão" />
              </div>
            ))}
          </div>
          <Field label="Observação">
            <Textarea name="note" />
          </Field>
          <div><Button>Criar rascunho</Button></div>
        </form>
      </Card>
    );
  }

  function Sugestao() {
    const pendingByKey = new Map<string, number>();
    for (const o of orders.filter((o) => ["rascunho", "enviado", "recebido_parcial"].includes(o.status)))
      for (const it of o.items as POItem[]) {
        const k = `${o.store_id}:${it.product_id}`;
        pendingByKey.set(k, (pendingByKey.get(k) ?? 0) + it.qty - (it.received ?? 0));
      }
    const lines = stock
      .filter((s) => s.qty < s.min_qty && prod.get(s.product_id))
      .map((s) => {
        const p = prod.get(s.product_id)!;
        const pending = pendingByKey.get(`${s.store_id}:${s.product_id}`) ?? 0;
        const suggest = Math.max(0, s.min_qty * 2 - s.qty - pending);
        return { s, p, pending, suggest };
      })
      .filter((l) => l.suggest > 0);
    const groups = new Map<string, typeof lines>();
    for (const l of lines) {
      const k = `${l.s.store_id}|${l.p.supplier_id ?? ""}`;
      groups.set(k, [...(groups.get(k) ?? []), l]);
    }
    if (!groups.size) return <Empty>Nenhum item abaixo do mínimo sem pedido em andamento. Estoque saudável!</Empty>;
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Sugestão = 2× o estoque mínimo − saldo atual − quantidade já pedida (pedidos em aberto). Agrupado por loja e fornecedor.</p>
        {[...groups.entries()].map(([k, ls]) => {
          const [storeId, supplierId] = k.split("|");
          const total = ls.reduce((a, l) => a + l.suggest * l.p.cost_cents, 0);
          return (
            <Card key={k}>
              <CardHeader
                title={`${sup.get(supplierId)?.name ?? "Sem fornecedor cadastrado"} → ${storeName(storeId)}`}
                subtitle={`${ls.length} itens · ${brl(total)} a custo`}
                action={
                  supplierId ? (
                    <form action={gerarDaSugestao}>
                      <input type="hidden" name="supplier_id" value={supplierId} />
                      <input type="hidden" name="store_id" value={storeId} />
                      {ls.map((l) => <input key={l.p.id} type="hidden" name="item" value={`${l.p.id}:${l.suggest}`} />)}
                      <Button className="text-xs">Gerar pedido</Button>
                    </form>
                  ) : undefined
                }
              />
              <Table head={["Produto", "Saldo", "Mínimo", "Já pedido", "Sugerido", "Custo"]}>
                {ls.map((l) => (
                  <tr key={l.s.id}>
                    <Td>{l.p.name}<div className="text-xs text-slate-500">{l.p.sku}</div></Td>
                    <Td className="font-semibold text-red-700">{l.s.qty}</Td>
                    <Td>{l.s.min_qty}</Td>
                    <Td>{l.pending}</Td>
                    <Td className="font-semibold">{l.suggest}</Td>
                    <Td>{brl(l.suggest * l.p.cost_cents)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          );
        })}
      </div>
    );
  }

  function Detalhe() {
    const o = orders.find((x) => x.id === pedidoId);
    if (!o) return <Empty>Pedido não encontrado (ou de outra loja).</Empty>;
    const items = o.items as POItem[];
    const canReceive = ["rascunho", "enviado", "recebido_parcial"].includes(o.status);
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader
            title={`Pedido ${o.number}`}
            subtitle={`${sup.get(o.supplier_id)?.name ?? "—"} · ${storeName(o.store_id)} · criado em ${date(o.created_at)} · previsão ${date(o.expected_at)}`}
            action={
              <div className="flex items-center gap-2">
                <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
                {o.status === "rascunho" && <StatusBtn id={o.id} to="enviado" text="Marcar como enviado" />}
                {(o.status === "rascunho" || o.status === "enviado") && <StatusBtn id={o.id} to="cancelado" text="Cancelar" ghost />}
                <LinkButton href="/compras" variant="ghost" className="text-xs">Voltar</LinkButton>
              </div>
            }
          />
          {o.note && <p className="px-5 pt-3 text-sm text-slate-600">{o.note}</p>}
          <form action={receberPedido}>
            <input type="hidden" name="id" value={o.id} />
            <Table head={["Produto", "Pedido", "Recebido", "Custo unit.", "Subtotal", canReceive ? "Receber agora" : ""]}>
              {items.map((it, i) => {
                const pending = it.qty - (it.received ?? 0);
                return (
                  <tr key={i}>
                    <Td>{prod.get(it.product_id)?.name ?? "?"}</Td>
                    <Td>{it.qty}</Td>
                    <Td>{it.received ?? 0}</Td>
                    <Td>{brl(it.cost_cents)}</Td>
                    <Td>{brl(it.qty * it.cost_cents)}</Td>
                    <Td className="w-32">
                      {canReceive && pending > 0 ? <Input name={`r${i}`} type="number" min={0} max={pending} defaultValue={pending} className="py-1" /> : null}
                    </Td>
                  </tr>
                );
              })}
            </Table>
            <div className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 p-4">
              <div className="text-sm">Total do pedido: <b>{brl(o.total_cents)}</b></div>
              {canReceive && (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Nota fiscal"><Input name="nf" className="w-32" /></Field>
                  <Field label="Vencimento"><Input name="due_at" type="date" defaultValue={addDays(todayYmd(), 30)} /></Field>
                  <Field label="Categoria"><Input name="category" defaultValue="Fornecedor - compras" /></Field>
                  <Button variant="success">Receber e lançar conta a pagar</Button>
                </div>
              )}
            </div>
          </form>
        </Card>
      </div>
    );
  }
}

function StatusBtn({ id, to, text, ghost }: { id: string; to: string; text: string; ghost?: boolean }) {
  return (
    <form action={mudarStatusPedido}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
      <Button variant={ghost ? "ghost" : "secondary"} className="px-2.5 py-1 text-xs">{text}</Button>
    </form>
  );
}
