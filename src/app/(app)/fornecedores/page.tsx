import Link from "next/link";
import { Badge, Button, Card, CardHeader, Field, Input, LinkButton, PageHeader, Select, Table, Td } from "@/components/ui";
import { Flash, Progress } from "@/components/gestao/kit";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { todayYmd } from "@/lib/format";
import { LAB_STATUSES } from "@/lib/types";
import { diffDays, localYmd, one, type SearchParams } from "@/lib/gestao/util";
import { alternarFornecedor, salvarFornecedor } from "./actions";

const KIND = { laboratorio: "Laboratório", fornecedor: "Fornecedor", distribuidor: "Distribuidor" } as const;
const RECEIVED_STAGE = LAB_STATUSES.slice(LAB_STATUSES.indexOf("recebido")) as readonly string[];

export default async function Fornecedores({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireUser("compras");
  const sp = await searchParams;
  const d = db();
  const [suppliers, labOrders] = await Promise.all([
    d.list("suppliers", { order: { column: "name" } }),
    d.list("lab_orders", { eq: ctx.storeId ? { store_id: ctx.storeId } : {} }),
  ]);
  const edit = suppliers.find((s) => s.id === one(sp.edit));
  const today = todayYmd();

  const perf = suppliers
    .filter((s) => s.kind === "laboratorio")
    .map((s) => {
      const os = labOrders.filter((o) => o.supplier_id === s.id && o.status !== "cancelado");
      let onTime = 0, late = 0, openLate = 0, open = 0, rework = 0, daysSum = 0, daysN = 0;
      for (const o of os) {
        const back = o.history.find((h) => RECEIVED_STAGE.includes(h.status));
        if (o.history.some((h) => h.status === "retrabalho" || h.status === "devolvido_lab")) rework++;
        if (back) {
          const at = localYmd(back.at);
          daysSum += Math.max(0, diffDays(at, localYmd(o.created_at)));
          daysN++;
          if (!o.due_at || at <= o.due_at) onTime++;
          else late++;
        } else if (RECEIVED_STAGE.includes(o.status)) {
          onTime++;
        } else {
          open++;
          if (o.due_at && o.due_at < today) openLate++;
        }
      }
      const done = onTime + late;
      return { s, total: os.length, onTime, late, open, openLate, rework, rate: done ? (onTime / done) * 100 : null, avg: daysN ? daysSum / daysN : null };
    });

  return (
    <div>
      <PageHeader title="Fornecedores e laboratórios" subtitle="Cadastro, prazos e desempenho dos laboratórios" actions={<LinkButton href="/compras?aba=novo" variant="secondary">Novo pedido de compra</LinkButton>} />
      <Flash sp={sp} />

      <Card className="mb-4">
        <CardHeader title="Desempenho dos laboratórios" subtitle="Pontualidade = OS devolvidas pelo laboratório até a data prometida" />
        <Table head={["Laboratório", "OS", "No prazo", "Atrasadas", "Em aberto (atrasadas)", "Retrabalho/devolução", "Prazo médio real", "Pontualidade"]} empty="Nenhum laboratório cadastrado.">
          {perf.map((p) => (
            <tr key={p.s.id}>
              <Td className="font-medium">{p.s.name}<div className="text-xs text-slate-500">Prazo informado: {p.s.lead_days ?? "—"} dias</div></Td>
              <Td>{p.total}</Td>
              <Td className="text-emerald-700">{p.onTime}</Td>
              <Td className="text-red-700">{p.late}</Td>
              <Td>{p.open} {p.openLate > 0 && <Badge tone="red" className="ml-1">{p.openLate} atrasadas</Badge>}</Td>
              <Td>{p.rework}</Td>
              <Td>{p.avg == null ? "—" : `${p.avg.toFixed(1).replace(".", ",")} dias`}</Td>
              <Td className="w-40">
                {p.rate == null ? (
                  <span className="text-xs text-slate-400">Sem OS concluídas</span>
                ) : (
                  <>
                    <div className="mb-1 text-xs font-semibold">{Math.round(p.rate)}%</div>
                    <Progress value={p.rate} max={100} />
                  </>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Cadastro" />
          <Table head={["Nome", "Tipo", "Contato", "Prazo médio", "Situação", ""]}>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <Td className="font-medium">{s.name}<div className="text-xs text-slate-500">{s.cnpj ?? ""}</div></Td>
                <Td><Badge tone={s.kind === "laboratorio" ? "violet" : "blue"}>{KIND[s.kind]}</Badge></Td>
                <Td className="text-xs">{[s.contact, s.phone, s.email].filter(Boolean).join(" · ") || "—"}</Td>
                <Td>{s.lead_days != null ? `${s.lead_days} dias` : "—"}</Td>
                <Td>{s.active ? <Badge tone="green">Ativo</Badge> : <Badge>Inativo</Badge>}</Td>
                <Td>
                  <div className="flex gap-1">
                    <Link href={`/fornecedores?edit=${s.id}`} className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50">Editar</Link>
                    <form action={alternarFornecedor}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">{s.active ? "Desativar" : "Ativar"}</button>
                    </form>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card>
          <CardHeader title={edit ? `Editar: ${edit.name}` : "Novo fornecedor"} action={edit ? <Link href="/fornecedores" className="text-xs text-brand-700">Novo</Link> : undefined} />
          <form action={salvarFornecedor} className="grid gap-3 p-5" key={edit?.id ?? "novo"}>
            {edit && <input type="hidden" name="id" value={edit.id} />}
            <Field label="Nome"><Input name="name" required defaultValue={edit?.name} /></Field>
            <Field label="Tipo">
              <Select name="kind" defaultValue={edit?.kind ?? "fornecedor"}>
                {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CNPJ"><Input name="cnpj" defaultValue={edit?.cnpj ?? ""} /></Field>
              <Field label="Prazo médio (dias)"><Input name="lead_days" type="number" min={0} defaultValue={edit?.lead_days ?? ""} /></Field>
            </div>
            <Field label="Contato"><Input name="contact" defaultValue={edit?.contact ?? ""} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Telefone"><Input name="phone" defaultValue={edit?.phone ?? ""} /></Field>
              <Field label="E-mail"><Input name="email" type="email" defaultValue={edit?.email ?? ""} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={edit?.active ?? true} /> Ativo</label>
            <Button>{edit ? "Salvar alterações" : "Cadastrar"}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
