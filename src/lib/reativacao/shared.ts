// Regras puras da Reativação por WhatsApp (Atendimento Guiado). Seguro para cliente e servidor.
import { monthYm } from "@/lib/format";
import type { AttendanceStage, Customer, Opportunity, Reativacao, ResponseClass } from "@/lib/types";

export type Years = Reativacao["years_since_purchase"];
export type Flag = NonNullable<Reativacao["flag"]>;

export const MAX_ROWS = 1000;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const HOURS_48 = 48 * 3600e3;
export const PAGE_SIZE = 10;
export const IMPORT_NOTE = "Importado da reativação";

export const ATTENDANCE_LABEL: Record<AttendanceStage, string> = {
  nao_iniciado: "Não iniciado",
  aguardando_resposta: "Aguardando resposta",
  cliente_respondeu: "Cliente respondeu",
  em_atendimento: "Em atendimento",
  vai_pensar: "Vai pensar",
  visita_combinada: "Visita combinada",
  aguardando_consulta: "Aguardando consulta",
  venda_concluida: "Venda concluída",
  encerrado: "Encerrado",
  encerrado_sem_resposta: "Encerrado sem resposta",
  nao_quer_mensagens: "Não quer receber mensagens",
};

export const RESPONSE_LABEL: Record<ResponseClass, string> = {
  tudo_bem: "Está tudo bem",
  dificuldade_visual: "Dificuldade / cansaço visual",
  quer_trocar: "Quer trocar os óculos",
  outra: "Outras",
};

export const YEARS_LABEL: Record<Years, string> = {
  1: "Até 1 ano",
  2: "2 anos",
  3: "3 anos",
  4: "4 anos ou mais",
};

export const FLAG_LABEL: Record<Flag, string> = {
  sem_contato: "Sem contato anterior",
  ja_houve_contato: "Já houve contato",
  retorno_pendente: "Retorno pendente",
  nao_receber: "Cliente pediu para não receber",
  repetido: "Possível repetição",
};

export const OPP_STATUS_LABEL: Record<Opportunity["status"], string> = {
  nova: "Nova",
  em_contato: "Em contato",
  agendado: "Agendado",
  convertida: "Convertida",
  perdida: "Perdida",
};

export const BLOCK_FLAGS: Flag[] = ["retorno_pendente", "nao_receber", "repetido"];
export const BLOCK_ATTENDANCE: AttendanceStage[] = ["nao_quer_mensagens", "encerrado_sem_resposta"];
export const RESPONDED: AttendanceStage[] = [
  "cliente_respondeu",
  "em_atendimento",
  "vai_pensar",
  "visita_combinada",
  "aguardando_consulta",
  "venda_concluida",
];
export const VISIT: AttendanceStage[] = ["visita_combinada", "aguardando_consulta", "venda_concluida"];

/** Reativação com valores padrão (registros antigos podem não ter o objeto). */
export function reativacaoOf(o: Pick<Opportunity, "reativacao">): Reativacao {
  const r = o.reativacao;
  return {
    years_since_purchase: r?.years_since_purchase ?? 4,
    original_seller: r?.original_seller ?? null,
    attendance: r?.attendance ?? "nao_iniciado",
    response_class: r?.response_class ?? null,
    flag: r?.flag ?? null,
    first_contact_at: r?.first_contact_at ?? null,
    last_sent_at: r?.last_sent_at ?? null,
    follow_up_at: r?.follow_up_at ?? null,
    send_history: r?.send_history ?? [],
    import_batch: r?.import_batch ?? null,
  };
}

export const isOpen = (o: Pick<Opportunity, "status">) => o.status !== "convertida" && o.status !== "perdida";

// ---------- telefone ----------

/** Só dígitos, sem zeros à esquerda e sem o 55 do Brasil. */
export function normalizePhone(v: unknown): string {
  let d = String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d;
}
export const phoneValid = (d: string) => d.length === 10 || d.length === 11;

export function formatPhone(d?: string | null) {
  const n = String(d ?? "").replace(/\D/g, "");
  if (n.length === 11) return n.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (n.length === 10) return n.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return n || "—";
}

// ---------- faixa de tempo ----------

export const bandFromYears = (y: number): Years => (y <= 1 ? 1 : y <= 2 ? 2 : y <= 3 ? 3 : 4);
export const asYears = (v: unknown): Years | null => {
  const n = Number(v);
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null;
};

const YEAR_MS = 365.25 * 864e5;
function bandFromDate(d: Date, now: Date): Years | null {
  if (Number.isNaN(d.getTime())) return null;
  const diff = (now.getTime() - d.getTime()) / YEAR_MS;
  if (diff < -0.1) return null; // data no futuro
  return bandFromYears(Math.ceil(Math.max(diff, 0.01)));
}

/** Faixa 1..4 a partir de número de anos, ano, data BR/ISO, serial do Excel ou texto ("4+", "2 anos"). */
export function parseYears(v: unknown, now = new Date()): Years | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return bandFromDate(v, now);
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) return null;
    if (v <= 100) return bandFromYears(Math.max(1, Math.round(v)));
    if (v >= 1900 && v <= now.getFullYear()) return bandFromYears(Math.max(1, now.getFullYear() - v));
    if (v > 3000) return bandFromDate(new Date(Math.round((v - 25569) * 864e5)), now); // serial Excel
    return null;
  }
  const s = String(v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); // dd/mm/aaaa
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += y > now.getFullYear() % 100 ? 1900 : 2000;
    return bandFromDate(new Date(y, Number(m[2]) - 1, Number(m[1]), 12), now);
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // aaaa-mm-dd
  if (m) return bandFromDate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12), now);
  m = s.match(/^(\d{1,2})[/.-](\d{4})$/); // mm/aaaa
  if (m) return bandFromDate(new Date(Number(m[2]), Number(m[1]) - 1, 15, 12), now);
  if (/^\d+([.,]\d+)?$/.test(s)) return parseYears(Number(s.replace(",", ".")), now);
  m = s.match(/(\d+)/); // "4+", "2 anos", "até 1 ano"
  if (m) return parseYears(Number(m[1]), now);
  return null;
}

// ---------- validação e bloqueios ----------

export function reviewIssues(i: { name: string; phone: string; years: Years | null; duplicate?: boolean }) {
  const out: string[] = [];
  if (!i.name.trim()) out.push("Informe o nome do cliente.");
  if (!phoneValid(normalizePhone(i.phone))) out.push("WhatsApp precisa ter DDD + número (10 ou 11 dígitos).");
  if (!i.years) out.push("Selecione a faixa de tempo desde a última compra.");
  if (i.duplicate) out.push("Este telefone já está em outro atendimento aberto da fila.");
  return out;
}

type ConsentInfo = Pick<Customer, "consent_marketing" | "consent_version" | "notes">;
/** Cliente criado pela importação (nunca deu nem recusou consentimento). */
export const isImportedCustomer = (c: ConsentInfo) => !c.consent_version && (c.notes ?? "").startsWith(IMPORT_NOTE);
/** Cliente de verdade que recusou marketing. Importados sem resposta não são bloqueados. */
export const consentBlocked = (c: ConsentInfo) => c.consent_marketing === false && !isImportedCustomer(c);

export const isOverdue = (r: Reativacao, now = Date.now()) =>
  r.attendance === "aguardando_resposta" && !!r.last_sent_at && now - Date.parse(r.last_sent_at) >= HOURS_48;
export const isWaiting = (r: Reativacao, now = Date.now()) =>
  r.attendance === "aguardando_resposta" && !!r.last_sent_at && now - Date.parse(r.last_sent_at) < HOURS_48;

/** Motivo que impede abrir o WhatsApp, ou null se liberado. */
export function blockReason(r: Reativacao, customer: ConsentInfo | null, issues: string[], now = Date.now()): string | null {
  if (issues.length) return "Corrija os dados destacados antes de liberar a mensagem.";
  if (r.flag && BLOCK_FLAGS.includes(r.flag)) return `Contato bloqueado: ${FLAG_LABEL[r.flag]}.`;
  if (r.attendance === "nao_quer_mensagens") return "O cliente pediu para não receber mensagens.";
  if (r.attendance === "encerrado_sem_resposta") return "Atendimento encerrado sem resposta.";
  if (customer && consentBlocked(customer))
    return "Cliente sem consentimento de marketing: ele recusou receber mensagens. Só é possível contatar depois que o consentimento for atualizado no cadastro, com autorização do cliente.";
  if (isWaiting(r, now)) return "Mensagem enviada há menos de 48 h. Aguarde a resposta; o retorno é liberado depois de 48 h.";
  if (isOverdue(r, now) && r.follow_up_at) return "O retorno já foi enviado e o cliente não respondeu. Encerre o atendimento sem resposta.";
  return null;
}

// ---------- status da fila ----------

export type QueueStatus = "pronto" | "alerta" | "corrigir" | "aguardando_confirmacao" | "enviado" | "atrasado" | "encerrado";
export const QUEUE_STATUS_INFO: Record<QueueStatus, { label: string; tone: "slate" | "blue" | "green" | "amber" | "red" | "violet" }> = {
  pronto: { label: "Pronto para revisar", tone: "blue" },
  alerta: { label: "Com alerta", tone: "amber" },
  corrigir: { label: "Corrigir dados", tone: "red" },
  aguardando_confirmacao: { label: "Aguardando confirmação", tone: "violet" },
  enviado: { label: "Envio confirmado", tone: "green" },
  atrasado: { label: "Retorno atrasado (48 h)", tone: "red" },
  encerrado: { label: "Encerrado", tone: "slate" },
};

export function queueStatus(a: {
  opp: Pick<Opportunity, "status">;
  r: Reativacao;
  issues: string[];
  blocked: boolean;
  pendingMessage: boolean;
  now?: number;
}): QueueStatus {
  if (!isOpen(a.opp)) return "encerrado";
  if (a.issues.length) return "corrigir";
  if (isOverdue(a.r, a.now)) return "atrasado";
  if (a.pendingMessage) return "aguardando_confirmacao";
  if (a.r.last_sent_at) return "enviado";
  if (a.blocked || a.r.flag === "ja_houve_contato") return "alerta";
  return "pronto";
}

/** Situação do atendimento → status da oportunidade no CRM. */
export function statusFromAttendance(a: AttendanceStage, contacted: boolean): Opportunity["status"] {
  if (a === "visita_combinada" || a === "aguardando_consulta") return "agendado";
  if (a === "venda_concluida") return "convertida";
  if (a === "encerrado" || a === "encerrado_sem_resposta" || a === "nao_quer_mensagens") return "perdida";
  return contacted || a !== "nao_iniciado" ? "em_contato" : "nova";
}

// ---------- mensagem / WhatsApp ----------

export const firstName = (n?: string | null) => String(n ?? "").trim().split(/\s+/)[0] ?? "";

export function waUrl(phone: string, text: string, mobile: boolean) {
  const t = encodeURIComponent(text.normalize("NFC"));
  const p = normalizePhone(phone);
  return mobile ? `https://wa.me/55${p}?text=${t}` : `https://web.whatsapp.com/send?phone=55${p}&text=${t}`;
}

// ---------- período ----------

export type Periodo = "30d" | "mes" | "90d";
export const PERIODOS: { key: Periodo; label: string }[] = [
  { key: "30d", label: "30 dias" },
  { key: "mes", label: "Este mês" },
  { key: "90d", label: "90 dias" },
];
export const asPeriodo = (v: unknown): Periodo => (v === "mes" || v === "90d" ? v : "30d");
export function periodStart(p: Periodo, now = Date.now()) {
  if (p === "mes") return new Date(`${monthYm()}-01T00:00:00-03:00`).toISOString();
  return new Date(now - (p === "90d" ? 90 : 30) * 864e5).toISOString();
}

// ---------- importação (detecção de cabeçalho) ----------

const plain = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
const NAME_RE = /nome|cliente/;
const PHONE_RE = /telefone|celular|whats|fone/;
const LAST_RE = /ultima|compra|visita|data/;
const SELLER_RE = /vendedor|vendedora|atendente|consultor|responsavel/;

/** Índice da linha de cabeçalho (nome|cliente + telefone|celular|whats|fone) nas 30 primeiras linhas, ou -1. */
export function detectHeader(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = (rows[i] ?? []).map(plain);
    if (cells.some((c) => NAME_RE.test(c) && !PHONE_RE.test(c)) && cells.some((c) => PHONE_RE.test(c))) return i;
  }
  return -1;
}

export function guessColumns(header: unknown[]) {
  const cells = header.map(plain);
  const find = (re: RegExp, not?: RegExp) => cells.findIndex((c) => re.test(c) && !(not && not.test(c)));
  return {
    name: find(NAME_RE, PHONE_RE),
    phone: find(PHONE_RE),
    last: find(LAST_RE, PHONE_RE),
    seller: find(SELLER_RE),
  };
}
