export const brl = (cents: number | null | undefined) =>
  ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "1.234,56" | "1234.56" | "1234" -> centavos */
export const toCents = (v: FormDataEntryValue | string | number | null | undefined) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Math.round(v * 100);
  const s = String(v).trim().replace(/[R$\s]/g, "");
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const TZ = "America/Sao_Paulo";
export const date = (v?: string | null) =>
  v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString("pt-BR", { timeZone: TZ }) : "—";
export const dateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }) : "—";

export const todayYmd = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
export const monthYm = () => todayYmd().slice(0, 7);

export const ageFrom = (birth?: string | null) => {
  if (!birth) return null;
  const b = new Date(`${birth}T12:00:00`), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export const pct = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString("pt-BR")}%`;

export const LABEL: Record<string, string> = {
  armacao: "Armação", lente: "Lente", solar: "Solar", lente_contato: "Lente de contato", acessorio: "Acessório", servico: "Serviço",
  visao_simples: "Visão simples", multifocal: "Multifocal", bifocal: "Bifocal", ocupacional: "Ocupacional",
  essencial: "Essencial", conforto: "Conforto", premium: "Premium",
  dinheiro: "Dinheiro", pix: "Pix", debito: "Débito", credito: "Crédito à vista", credito_parcelado: "Crédito parcelado", boleto: "Boleto", crediario: "Crediário", cashback: "Cashback", convenio: "Convênio",
  aguardando_pedido: "Aguardando pedido", pedido_enviado: "Pedido enviado", em_producao: "Em produção", recebido: "Recebido", em_montagem: "Em montagem", conferencia: "Conferência", pronto: "Pronto", cliente_avisado: "Cliente avisado", entregue: "Entregue", pendencia: "Pendência técnica", retrabalho: "Retrabalho", devolvido_lab: "Devolvido ao laboratório", cancelado: "Cancelado",
  admin: "Administrador", gerente: "Gerente", vendedor: "Vendedor", caixa: "Caixa", optometrista: "Optometrista", tecnico: "Técnico óptico", financeiro: "Financeiro", estoquista: "Estoquista",
  aberto: "Aberto", pago: "Pago", vencido: "Vencido",
  concluida: "Concluída", cancelada: "Cancelada", principal: "Principal", adicional: "Adicional", segundo_par: "Segundo par", upgrade: "Upgrade",
  convertido: "Convertido", perdido: "Perdido", solicitada: "Solicitada", enviada: "Enviada", recebida: "Recebida", rascunho: "Rascunho", enviado: "Enviado", recebido_parcial: "Recebido parcial",
};
export const label = (k?: string | null) => (k ? LABEL[k] ?? k : "—");
