import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle, ShoppingCart, XCircle, RotateCcw } from "lucide-react";
import { Badge, Button, Card, CardHeader, LinkButton, Notice, PageHeader, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { brl, dateTime, label } from "@/lib/format";
import { CAMPOS, rotuloValor } from "@/lib/balcao/campos";
import { marcarPerdido, reabrirOrcamento } from "@/lib/balcao/actions";
import { TextoIA } from "@/components/balcao/chips";
import { BotaoCopiar, BotaoImprimir } from "@/components/balcao/imprimir";
import type { Quote } from "@/lib/types";

export const metadata = { title: "Orçamento" };

const STATUS: Record<Quote["status"], { rotulo: string; tom: "blue" | "green" | "red" }> = {
  aberto: { rotulo: "Aberto", tom: "blue" },
  convertido: { rotulo: "Convertido em venda", tom: "green" },
  perdido: { rotulo: "Perdido", tom: "red" },
};

export default async function OrcamentoPage(props: PageProps<"/orcamentos/[id]">) {
  const ctx = await requireUser("vender");
  const { id } = await props.params;
  const d = db();
  const q = await d.get("quotes", id);
  if (!q || (ctx.storeId && q.store_id !== ctx.storeId)) notFound();
  const [cliente, vendedor, loja] = await Promise.all([
    q.customer_id ? d.get("customers", q.customer_id) : Promise.resolve(null),
    d.get("employees", q.seller_id),
    d.get("stores", q.store_id),
  ]);

  const nomeCliente = cliente?.name ?? q.customer_name ?? null;
  const perfil = CAMPOS.filter((c) => q.profile[c.id] != null).map((c) => {
    const v = q.profile[c.id];
    return { rotulo: c.rotulo, valor: rotuloValor(c.id, Array.isArray(v) ? v : String(v)) };
  });

  // Texto pronto para WhatsApp (o sistema só monta o link; quem envia é o vendedor)
  const linhas = [
    `Olá${nomeCliente ? `, ${nomeCliente.split(" ")[0]}` : ""}! Aqui é ${vendedor?.name.split(" ")[0] ?? "a equipe"} da ${loja?.name ?? "ótica"}.`,
    "Segue o orçamento do seu atendimento:",
    "",
    ...q.items.map((i) => `• ${i.name}${i.qty > 1 ? ` (${i.qty}x)` : ""} — ${brl(i.price_cents * i.qty)}`),
    "",
    `*Total: ${brl(q.total_cents)}*`,
    "",
    "Qualquer dúvida é só responder por aqui. Será um prazer atender você!",
  ];
  const texto = linhas.join("\n");
  const fone = (cliente?.phone ?? "").replace(/\D/g, "");
  const foneWa = fone ? (fone.startsWith("55") && fone.length > 11 ? fone : `55${fone}`) : "";
  const linkWa = `https://wa.me/${foneWa}?text=${encodeURIComponent(texto)}`;

  return (
    <>
      <PageHeader
        title={`Orçamento${nomeCliente ? ` · ${nomeCliente}` : ""}`}
        subtitle={`${dateTime(q.created_at)} · ${vendedor?.name ?? "—"} · ${loja?.name ?? "—"}`}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <LinkButton href="/orcamentos" variant="ghost">
              <ArrowLeft className="size-4" /> Voltar
            </LinkButton>
            <BotaoImprimir />
            {q.status === "aberto" && (
              <>
                <form action={marcarPerdido}>
                  <input type="hidden" name="id" value={q.id} />
                  <Button variant="secondary" type="submit">
                    <XCircle className="size-4" /> Marcar perdido
                  </Button>
                </form>
                <LinkButton href={`/vendas/nova?quote=${q.id}`} variant="success">
                  <ShoppingCart className="size-4" /> Converter em venda
                </LinkButton>
              </>
            )}
            {q.status === "perdido" && (
              <form action={reabrirOrcamento}>
                <input type="hidden" name="id" value={q.id} />
                <Button variant="secondary" type="submit">
                  <RotateCcw className="size-4" /> Reabrir
                </Button>
              </form>
            )}
          </div>
        }
      />
      <div className="mb-4 flex items-center gap-2">
        <Badge tone={STATUS[q.status].tom} className="text-sm">
          {STATUS[q.status].rotulo}
        </Badge>
        {q.package_tier && <Badge tone="violet">Pacote {label(q.package_tier)}</Badge>}
        {q.sale_id && <span className="text-sm text-slate-500">Venda vinculada</span>}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Itens" />
            <Table head={["Produto", "Categoria", "Qtd", "Valor"]}>
              {q.items.map((i, k) => (
                <tr key={`${i.product_id}-${k}`}>
                  <Td className="font-medium">
                    {i.name}
                    {i.role && i.role !== "principal" && <span className="ml-1 text-xs text-slate-400">({i.role === "segundo_par" ? "2º par" : i.role})</span>}
                  </Td>
                  <Td>{label(i.category)}</Td>
                  <Td>{i.qty}</Td>
                  <Td className="font-semibold">{brl(i.price_cents * i.qty)}</Td>
                </tr>
              ))}
            </Table>
            <div className="flex justify-end border-t border-slate-100 px-5 py-3 text-lg font-bold">Total {brl(q.total_cents)}</div>
          </Card>
          {q.ai_summary && (
            <Card>
              <CardHeader title="Resumo da IA" subtitle="Gerado durante o atendimento" />
              <div className="p-5">
                <TextoIA texto={q.ai_summary} />
              </div>
            </Card>
          )}
          <Card className="no-print">
            <CardHeader title="Enviar pelo WhatsApp" subtitle="O sistema só monta a mensagem; o envio é feito por você." />
            <div className="space-y-3 p-5">
              <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-700">{texto}</pre>
              {!foneWa && <Notice tone="amber">Cliente sem telefone cadastrado: o link abre o WhatsApp para você escolher o contato.</Notice>}
              <div className="flex flex-wrap gap-2">
                <a href={linkWa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                  <MessageCircle className="size-4" /> Abrir no WhatsApp
                </a>
                <BotaoCopiar texto={texto} />
              </div>
            </div>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Perfil do atendimento" />
          <div className="p-5 text-sm">
            {perfil.length ? (
              <dl className="space-y-2">
                {perfil.map((p) => (
                  <div key={p.rotulo}>
                    <dt className="text-xs text-slate-500">{p.rotulo}</dt>
                    <dd className="font-medium text-slate-800">{p.valor}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-slate-500">Sem perfil registrado.</p>
            )}
            {cliente && (
              <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                Cliente: {cliente.name}
                {cliente.phone ? ` · ${cliente.phone}` : ""}
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
