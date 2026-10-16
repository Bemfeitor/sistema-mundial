"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Eye,
  Glasses,
  HelpCircle,
  Lightbulb,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, Input, LinkButton, Notice, Textarea, cn } from "@/components/ui";
import { brl, date, label } from "@/lib/format";
import type { SaleItem } from "@/lib/types";
import { CAMPOS, CAMPOS_OBRIGATORIOS, GRUPOS, rotuloValor, type GrupoId, type Perfil } from "@/lib/balcao/campos";
import { COMPLEMENTOS, avaliar, type GrupoComplemento, type Tier } from "@/lib/balcao/regras";
import { itensDoPacote, montarPacotes, produtoDoComplemento, toItem, type ProdutoBalcao } from "@/lib/balcao/pacotes";
import { buscarClientes, carregarCliente, salvarOrcamento, type ClienteBalcao, type ClienteResumo } from "@/lib/balcao/actions";
import { CampoChips, Chip, TextoIA } from "./chips";

const GRUPOS_COMPLEMENTO: GrupoComplemento[] = ["Lente e tratamentos", "Proteção e ajuste", "Itens que encantam"];
const tierNome: Record<Tier, string> = { essencial: "Essencial", conforto: "Conforto", premium: "Premium" };
const tierCor: Record<Tier, string> = { essencial: "border-slate-300", conforto: "border-brand-500", premium: "border-gold-400" };

/** Maior esférico (em módulo) da receita, para filtrar lentes compatíveis. */
function sphDaReceita(c: ClienteBalcao | null) {
  const r = c?.receita;
  if (!r) return null;
  const vals = [r.od.sph, r.oe.sph].filter((x): x is number => typeof x === "number");
  if (!vals.length) return null;
  return vals.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
}
const addDaReceita = (c: ClienteBalcao | null) => {
  const r = c?.receita;
  const a = Math.max(r?.od.add ?? 0, r?.oe.add ?? 0);
  return a > 0 ? a : null;
};
const fmtGrau = (n?: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2).replace(".", ",")}`);

export function Balcao({ produtos }: { produtos: ProdutoBalcao[] }) {
  const [perfil, setPerfil] = useState<Perfil>({});
  const [cliente, setCliente] = useState<ClienteBalcao | null>(null);
  const [nomeAvulso, setNomeAvulso] = useState("");
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ClienteResumo[]>([]);
  const [buscando, startBusca] = useTransition();
  const [tierEscolhido, setTierEscolhido] = useState<Tier | null>(null);
  const [lenteTroca, setLenteTroca] = useState<ProdutoBalcao | null>(null);
  const [adicionais, setAdicionais] = useState<{ complemento: string; item: SaleItem }[]>([]);
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [textoVendedor, setTextoVendedor] = useState("");
  const [ia, setIa] = useState<{ estado: "ocioso" | "carregando" | "ok" | "fallback"; texto?: string; motivo?: string; modelo?: string }>({ estado: "ocioso" });
  const [salvo, setSalvo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startSalvar] = useTransition();

  const av = useMemo(() => avaliar(perfil), [perfil]);
  const sph = sphDaReceita(cliente);
  const pacotes = useMemo(() => montarPacotes(produtos, perfil, av, sph), [produtos, perfil, av, sph]);
  const tier = tierEscolhido ?? av.recomendado;
  const pacote = pacotes.find((p) => p.tier === tier)!;

  // Itens do orçamento = pacote (com eventual troca de lente) + complementos oferecidos
  const itensBase = itensDoPacote(pacote);
  const itens: SaleItem[] = [
    ...itensBase
      .map((i) => (lenteTroca && i.category === "lente" ? toItem(lenteTroca, "upgrade") : i))
      .filter((i) => !removidos.includes(i.product_id)),
    ...adicionais.map((a) => a.item).filter((i) => !itensBase.some((b) => b.product_id === i.product_id)),
  ];
  const total = itens.reduce((a, i) => a + i.price_cents * i.qty, 0);
  const extraCents = total - pacote.total_cents;
  const extraPct = pacote.total_cents > 0 ? Math.round((extraCents / pacote.total_cents) * 100) : 0;

  const setCampo = (id: string, v: string | string[] | undefined) => {
    setSalvo(null);
    setPerfil((p) => {
      const n = { ...p };
      if (v === undefined) delete n[id];
      else n[id] = v;
      return n;
    });
  };

  const respondidosObrig = CAMPOS_OBRIGATORIOS.filter((c) => perfil[c.id] != null).length;
  const resumo = CAMPOS.filter((c) => perfil[c.id] != null).map((c) => `${c.rotulo}: ${rotuloValor(c.id, perfil[c.id])}`);

  function buscar(t: string) {
    setTermo(t);
    if (t.trim().length < 2) return setResultados([]);
    startBusca(async () => setResultados(await buscarClientes(t)));
  }

  function escolherCliente(id: string) {
    startBusca(async () => {
      const c = await carregarCliente(id);
      if (!c) return;
      setCliente(c);
      setResultados([]);
      setTermo("");
      // Preenche automaticamente o que o sistema já sabe (sem sobrescrever cliques)
      setPerfil((p) => {
        const n: Perfil = { ...p, cliente: "sim" };
        const idade = c.idade;
        if (idade != null && !n.idade) n.idade = idade <= 12 ? "crianca" : idade <= 17 ? "adolescente" : idade < 40 ? "18_39" : idade < 60 ? "40_59" : "60_mais";
        if (!n.sexo && c.gender === "M") n.sexo = "homem";
        if (!n.sexo && c.gender === "F") n.sexo = "mulher";
        if (!n.primeiro_oculos && c.compras > 0) n.primeiro_oculos = "nao";
        if (c.receita && !n.receita) n.receita = c.receita.vencida ? "vencida" : "valida";
        const r = c.receita;
        if (r && !n.grau_alto) {
          const s = [r.od.sph ?? 0, r.oe.sph ?? 0];
          const cyl = Math.max(Math.abs(r.od.cyl ?? 0), Math.abs(r.oe.cyl ?? 0));
          n.grau_alto = Math.min(...s) < -4 ? "miopia_alta" : Math.max(...s) > 4 ? "hiper_alta" : cyl >= 2 ? "astig_alto" : "nao";
        }
        if (r && !n.tipo_oculos && Math.max(r.od.add ?? 0, r.oe.add ?? 0) > 0 && (idade ?? 0) >= 40) n.tipo_oculos = "multifocal";
        return n;
      });
    });
  }

  function limpar() {
    setPerfil({});
    setCliente(null);
    setNomeAvulso("");
    setTierEscolhido(null);
    setLenteTroca(null);
    setAdicionais([]);
    setRemovidos([]);
    setTextoVendedor("");
    setIa({ estado: "ocioso" });
    setSalvo(null);
    setErro(null);
  }

  function oferecer(compId: string) {
    const c = COMPLEMENTOS.find((x) => x.id === compId);
    if (!c) return;
    const lenteAtual = lenteTroca ?? pacote.lente;
    const prod = produtoDoComplemento(c, produtos, lenteAtual);
    if (!prod) return;
    setSalvo(null);
    if (c.troca) setLenteTroca(prod);
    else setAdicionais((a) => (a.some((x) => x.item.product_id === prod.id) ? a : [...a, { complemento: compId, item: toItem(prod, c.id === "segundo_par_solar" ? "segundo_par" : "adicional") }]));
  }

  function removerItem(i: SaleItem) {
    setSalvo(null);
    if (lenteTroca && i.product_id === lenteTroca.id) return setLenteTroca(null);
    if (adicionais.some((a) => a.item.product_id === i.product_id)) return setAdicionais((a) => a.filter((x) => x.item.product_id !== i.product_id));
    setRemovidos((r) => [...r, i.product_id]);
  }

  async function perguntarIA() {
    setIa({ estado: "carregando" });
    try {
      const r = await fetch("/api/balcao/ia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          perfil,
          resumo,
          regras: av.disparadas.map((r) => r.titulo),
          dicas: av.dicas,
          alertas: av.alertas.map((a) => a.texto),
          pacote: { tier: tierNome[tier], itens: itens.map((i) => i.name), total: brl(total) },
          complementos: av.complementos.map((c) => COMPLEMENTOS.find((x) => x.id === c.id)?.nome).filter(Boolean),
          cliente: cliente
            ? { nivel: cliente.level, compras: cliente.compras, ultima_compra: cliente.ultima_compra, ultimos_itens: cliente.ultimos_itens, saldo_cashback: brl(cliente.saldo_cents), receita_vencida: cliente.receita?.vencida ?? null }
            : null,
          texto: textoVendedor,
        }),
      });
      if (r.status === 401) return setIa({ estado: "fallback", motivo: "Sessão expirada. Entre novamente." });
      const j = (await r.json()) as { fallback?: boolean; texto?: string; motivo?: string; modelo?: string };
      if (j.fallback || !j.texto) setIa({ estado: "fallback", motivo: j.motivo });
      else setIa({ estado: "ok", texto: j.texto, modelo: j.modelo });
    } catch {
      setIa({ estado: "fallback", motivo: "Não foi possível falar com a IA agora." });
    }
  }

  function salvar() {
    setErro(null);
    startSalvar(async () => {
      try {
        const profile = Object.fromEntries(Object.entries(perfil).filter(([, v]) => v != null)) as Record<string, string | string[]>;
        const r = await salvarOrcamento({
          profile,
          items: itens,
          package_tier: tier,
          ai_summary: ia.estado === "ok" ? ia.texto : null,
          customer_id: cliente?.id ?? null,
          customer_name: cliente?.name ?? (nomeAvulso || null),
        });
        setSalvo(r.id);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao salvar o orçamento.");
      }
    });
  }

  // Link do simulador levando o perfil
  const qs = new URLSearchParams();
  const tipoSim = av.lente.tipo === "ocupacional" ? "ocupacional" : typeof perfil.tipo_oculos === "string" ? perfil.tipo_oculos : "";
  if (tipoSim) qs.set("tipo", tipoSim);
  const add = addDaReceita(cliente);
  if (add) qs.set("add", add.toFixed(2));
  if (sph != null) qs.set("sph", sph.toFixed(2));
  const linkSimulador = `/simulador${qs.toString() ? `?${qs}` : ""}`;

  const grupos = (Object.keys(GRUPOS) as GrupoId[]).map((g) => ({ id: g, titulo: GRUPOS[g], campos: CAMPOS.filter((c) => c.grupo === g) }));

  return (
    <div className="space-y-5">
      {/* Barra de ações principais */}
      <div className="flex flex-wrap items-center gap-3">
        <LinkButton href={linkSimulador} className="px-5 py-3 text-base shadow-md">
          <Glasses className="size-5" /> Abrir simulador de lentes
        </LinkButton>
        <LinkButton href="/vendas/nova" variant="success" className="px-5 py-3 text-base">
          <ShoppingCart className="size-5" /> Nova venda
        </LinkButton>
        <Button variant="ghost" onClick={limpar} className="ml-auto">
          <RotateCcw className="size-4" /> Novo atendimento
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* ------------------- Coluna de chips ------------------- */}
        <div className="space-y-5 lg:col-span-7">
          <Card>
            <CardHeader
              title="Cliente"
              subtitle={cliente ? "Histórico carregado" : "Busque pelo nome ou telefone se já for cliente"}
              action={
                cliente && (
                  <Button variant="ghost" onClick={() => setCliente(null)} title="Remover cliente">
                    <X className="size-4" />
                  </Button>
                )
              }
            />
            <div className="space-y-3 p-5">
              {!cliente && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" />
                  <Input value={termo} onChange={(e) => buscar(e.target.value)} placeholder="Nome ou telefone do cliente…" className="pl-9" />
                  {buscando && <Loader2 className="absolute right-3 top-2.5 size-4 animate-spin text-slate-400" />}
                  {resultados.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                      {resultados.map((r) => (
                        <button key={r.id} type="button" onClick={() => escolherCliente(r.id)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-brand-50">
                          <span className="font-medium text-slate-800">{r.name}</span>
                          <span className="text-xs text-slate-500">{[r.phone, r.city].filter(Boolean).join(" · ")}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {termo.trim().length >= 2 && !buscando && !resultados.length && <p className="mt-1 text-xs text-slate-500">Nenhum cliente encontrado.</p>}
                </div>
              )}
              {!cliente && perfil.cliente === "nao" && <Input value={nomeAvulso} onChange={(e) => setNomeAvulso(e.target.value)} placeholder="Nome do cliente (opcional, para o orçamento)" />}
              {cliente && (
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div className="flex items-start gap-3">
                    <div className="grid size-10 place-items-center rounded-full bg-brand-50 text-brand-700">
                      <UserRound className="size-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">{cliente.name}</div>
                      <div className="text-slate-500">
                        {[cliente.idade != null ? `${cliente.idade} anos` : null, cliente.phone, cliente.profession].filter(Boolean).join(" · ")}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge tone="violet">{cliente.level}</Badge>
                        <Badge tone={cliente.saldo_cents > 0 ? "green" : "slate"}>Cashback {brl(cliente.saldo_cents)}</Badge>
                        <Badge>{cliente.compras} compra(s)</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    {cliente.receita ? (
                      <>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-medium text-slate-700">Receita de {date(cliente.receita.exam_date)}</span>
                          <Badge tone={cliente.receita.vencida ? "red" : "green"}>{cliente.receita.vencida ? "Vencida" : `Válida até ${date(cliente.receita.valid_until)}`}</Badge>
                        </div>
                        <table className="w-full text-xs text-slate-600">
                          <tbody>
                            {(["od", "oe"] as const).map((o) => (
                              <tr key={o}>
                                <td className="pr-2 font-semibold uppercase">{o}</td>
                                <td>Esf {fmtGrau(cliente.receita![o].sph)}</td>
                                <td>Cil {fmtGrau(cliente.receita![o].cyl)}</td>
                                <td>Eixo {cliente.receita![o].axis ?? "—"}</td>
                                <td>Ad {fmtGrau(cliente.receita![o].add)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    ) : (
                      <span className="text-slate-500">Sem receita cadastrada.</span>
                    )}
                    {cliente.ultimos_itens.length > 0 && <div className="mt-2 text-xs text-slate-500">Última compra ({date(cliente.ultima_compra)}): {cliente.ultimos_itens.join(", ")}</div>}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {grupos.map((g) => (
            <Card key={g.id}>
              <CardHeader
                title={g.titulo}
                action={g.id === "essencial" ? <Badge tone={respondidosObrig === CAMPOS_OBRIGATORIOS.length ? "green" : "amber"}>{respondidosObrig}/{CAMPOS_OBRIGATORIOS.length}</Badge> : undefined}
              />
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                {g.campos.map((c) => (
                  <CampoChips key={c.id} campo={c} perfil={perfil} onChange={setCampo} />
                ))}
              </div>
            </Card>
          ))}
        </div>

        {/* ------------------- Painel de resultado ------------------- */}
        <div className="space-y-4 lg:col-span-5">
          <div className="space-y-4 lg:sticky lg:top-16">
            <Card>
              <CardHeader title={<span className="flex items-center gap-2"><Eye className="size-4 text-brand-600" /> O sistema entendeu</span>} />
              <div className="p-5 text-sm">
                {resumo.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {CAMPOS.filter((c) => perfil[c.id] != null).map((c) => (
                      <Badge key={c.id} tone="blue" className="py-1">
                        {rotuloValor(c.id, perfil[c.id])}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500">Clique nos chips ao lado assim que o cliente chegar. O painel se atualiza a cada clique.</p>
                )}
                {av.disparadas.length > 0 && <p className="mt-3 text-xs text-slate-500">Regras ativas: {av.disparadas.map((r) => r.titulo).join(" · ")}</p>}
              </div>
            </Card>

            {av.alertas.length > 0 && (
              <div className="space-y-2">
                {av.alertas.map((a, i) => (
                  <Notice key={i} tone={a.nivel === "urgente" ? "red" : a.nivel === "atencao" ? "amber" : "blue"}>
                    <span className="flex gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      {a.texto}
                    </span>
                  </Notice>
                ))}
              </div>
            )}

            {(av.dicas.length > 0 || av.perguntas.length > 0) && (
              <Card>
                <div className="space-y-4 p-5 text-sm">
                  {av.dicas.length > 0 && (
                    <div>
                      <h4 className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
                        <Lightbulb className="size-4 text-gold-400" /> Dicas para o vendedor
                      </h4>
                      <ul className="space-y-1.5">
                        {av.dicas.map((d) => (
                          <li key={d} className="flex gap-2 text-slate-700">
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {av.perguntas.length > 0 && (
                    <div>
                      <h4 className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
                        <HelpCircle className="size-4 text-brand-600" /> Perguntas a fazer
                      </h4>
                      <ul className="list-disc space-y-1 pl-5 text-slate-700">
                        {av.perguntas.map((q) => (
                          <li key={q}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Pacotes */}
            <Card>
              <CardHeader title="Pacotes recomendados" subtitle="Montados com produtos reais do catálogo" />
              <div className="grid gap-2 p-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {pacotes.map((p) => (
                  <button
                    key={p.tier}
                    type="button"
                    onClick={() => {
                      setTierEscolhido(p.tier);
                      setLenteTroca(null);
                      setRemovidos([]);
                      setSalvo(null);
                    }}
                    className={cn(
                      "rounded-lg border-2 p-3 text-left text-xs transition hover:shadow",
                      p.tier === tier ? `${tierCor[p.tier]} bg-brand-50/50 shadow` : "border-slate-200",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900">{tierNome[p.tier]}</span>
                      {p.tier === av.recomendado && <Sparkles className="size-4 text-gold-400" />}
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-100">
                      <div className="h-full bg-brand-600" style={{ width: `${p.afinidade}%` }} />
                    </div>
                    <div className="mt-0.5 text-slate-500">Afinidade {p.afinidade}%</div>
                    <div className="mt-2 space-y-0.5 text-slate-700">
                      <div className="truncate" title={p.lente?.name}>{p.lente?.name ?? "Lente —"}</div>
                      <div className="truncate" title={p.armacao?.name}>{p.armacao?.name ?? "Armação —"}</div>
                      {p.extras.map((e) => (
                        <div key={e.id} className="truncate text-slate-500">+ {e.name}</div>
                      ))}
                    </div>
                    <div className="mt-2 text-base font-bold text-slate-900">{brl(p.total_cents)}</div>
                  </button>
                ))}
              </div>
              {pacote.motivos.length > 0 && <p className="px-5 pb-4 text-xs text-slate-500">Por que {tierNome[tier]}: {pacote.motivos.join(", ")}.</p>}
            </Card>

            {/* Complementos */}
            <Card>
              <CardHeader
                title="Complementos para oferecer"
                action={
                  extraCents > 0 ? (
                    <Badge tone="green" className="text-sm">
                      +{brl(extraCents)} (+{extraPct}% no ticket)
                    </Badge>
                  ) : undefined
                }
              />
              <div className="space-y-4 p-5">
                {GRUPOS_COMPLEMENTO.map((g) => {
                  const recomendados = new Map(av.complementos.map((c) => [c.id, c.pontos]));
                  const lista = COMPLEMENTOS.filter((c) => c.grupo === g).sort((a, b) => (recomendados.get(b.id) ?? 0) - (recomendados.get(a.id) ?? 0));
                  return (
                    <div key={g}>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</h4>
                      <div className="space-y-1.5">
                        {lista.map((c) => {
                          const lenteAtual = lenteTroca ?? pacote.lente;
                          const prod = produtoDoComplemento(c, produtos, lenteAtual);
                          const rec = recomendados.has(c.id);
                          const jaTem = c.troca ? !!prod && prod.id === lenteAtual?.id : itens.some((i) => i.product_id === prod?.id);
                          const diff = c.troca && prod ? prod.price_cents - (pacote.lente?.price_cents ?? 0) : prod?.price_cents ?? 0;
                          return (
                            <div key={c.id} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", rec ? "border-brand-100 bg-brand-50/60" : "border-slate-100")}>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 font-medium text-slate-800">
                                  {c.nome}
                                  {rec && <Badge tone="blue">indicado</Badge>}
                                </div>
                                <div className="text-xs text-slate-500">{c.argumento}</div>
                              </div>
                              <div className="text-right text-xs text-slate-600">{prod ? (c.troca ? `${diff >= 0 ? "+" : ""}${brl(diff)}` : brl(prod.price_cents)) : "sem item"}</div>
                              <Button variant={jaTem ? "success" : "secondary"} className="px-2.5 py-1 text-xs" disabled={!prod || jaTem} onClick={() => oferecer(c.id)}>
                                {jaTem ? <CheckCircle2 className="size-3.5" /> : <Plus className="size-3.5" />} {jaTem ? "No orçamento" : "Oferecer"}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Orçamento */}
            <Card>
              <CardHeader title="Orçamento" subtitle={`Pacote ${tierNome[tier]}${cliente ? ` · ${cliente.name}` : nomeAvulso ? ` · ${nomeAvulso}` : ""}`} />
              <div className="p-5">
                <ul className="divide-y divide-slate-100 text-sm">
                  {itens.map((i) => (
                    <li key={i.product_id} className="flex items-center gap-2 py-1.5">
                      <span className="flex-1 text-slate-800">
                        {i.name} <span className="text-xs text-slate-400">{label(i.category)}{i.role === "upgrade" ? " · upgrade" : ""}</span>
                      </span>
                      <span className="font-medium">{brl(i.price_cents * i.qty)}</span>
                      <button type="button" onClick={() => removerItem(i)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Remover">
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                  {!itens.length && <li className="py-2 text-slate-500">Sem itens.</li>}
                </ul>
                <div className="mt-3 flex items-end justify-between border-t border-slate-200 pt-3">
                  <div className="text-xs text-slate-500">
                    Pacote {brl(pacote.total_cents)}
                    {extraCents !== 0 && <> · complementos {extraCents > 0 ? "+" : ""}{brl(extraCents)}</>}
                    {cliente && cliente.saldo_cents > 0 && <div className="text-emerald-700">Cashback disponível: {brl(cliente.saldo_cents)}</div>}
                  </div>
                  <div className="text-2xl font-bold text-slate-900">{brl(total)}</div>
                </div>
                {erro && <div className="mt-3"><Notice tone="red">{erro}</Notice></div>}
                {salvo ? (
                  <div className="mt-4 space-y-2">
                    <Notice tone="green">Orçamento salvo.</Notice>
                    <div className="flex flex-wrap gap-2">
                      <LinkButton href={`/vendas/nova?quote=${salvo}`} variant="success">
                        <ShoppingCart className="size-4" /> Converter em venda
                      </LinkButton>
                      <LinkButton href={`/orcamentos/${salvo}`} variant="secondary">
                        Ver orçamento
                      </LinkButton>
                    </div>
                  </div>
                ) : (
                  <Button className="mt-4 w-full" onClick={salvar} disabled={salvando || !itens.length}>
                    {salvando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar atendimento como orçamento
                  </Button>
                )}
              </div>
            </Card>

            {/* IA */}
            <Card>
              <CardHeader title={<span className="flex items-center gap-2"><Bot className="size-4 text-violet-600" /> Perguntar à IA</span>} subtitle="Dicas personalizadas e roteiro de abordagem" />
              <div className="space-y-3 p-5">
                <Textarea value={textoVendedor} onChange={(e) => setTextoVendedor(e.target.value)} placeholder="Opcional: conte algo a mais (ex.: 'achou caro o multifocal', 'quer algo discreto para o trabalho')" />
                <Button variant="secondary" onClick={perguntarIA} disabled={ia.estado === "carregando"} className="w-full">
                  {ia.estado === "carregando" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Perguntar à IA
                </Button>
                {ia.estado === "ok" && ia.texto && (
                  <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-4">
                    <TextoIA texto={ia.texto} />
                    <p className="mt-3 text-[11px] text-slate-400">Gerado por IA{ia.modelo ? ` (${ia.modelo})` : ""}. Confira antes de usar; não substitui avaliação profissional.</p>
                  </div>
                )}
                {ia.estado === "fallback" && (
                  <Notice tone="amber">
                    IA indisponível{ia.motivo ? `: ${ia.motivo.replace(/\.+$/, "")}` : ""}. Use as dicas das regras acima — elas já consideram o perfil marcado.
                  </Notice>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {["Cliente achou caro", "Quer pensar", "Comparando com concorrente"].map((t) => (
                    <Chip key={t} ativo={textoVendedor === t} onClick={() => setTextoVendedor(textoVendedor === t ? "" : t)} className="text-xs">
                      {t}
                    </Chip>
                  ))}
                </div>
              </div>
            </Card>
            <p className="text-center text-xs text-slate-400">
              <Link href="/orcamentos" className="underline">Ver orçamentos salvos</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
