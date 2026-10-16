import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { customerBenefits, benefitState, availableBalance } from "@/lib/fidelidade";
import { brl, date } from "@/lib/format";
import { qrSvg } from "@/lib/clientes/qr";
import type { Customer } from "@/lib/types";

const LEVEL_COLORS: Record<Customer["level"], string> = {
  Novo: "bg-slate-100 text-slate-700",
  Silver: "bg-blue-100 text-blue-700",
  Gold: "bg-amber-100 text-amber-800",
  Black: "bg-gray-800 text-white",
  VIP: "bg-emerald-100 text-emerald-800",
};

export default async function CartaoPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;

  const [customer] = await db().list("customers", { eq: { card_token: token } });
  if (!customer) notFound();

  const baseUrl = process.env.NEXT_PUBLIC_URL ?? "https://otica.local";
  const cardUrl = `${baseUrl}/cartao/${token}`;

  const [benefits, sales, store] = await Promise.all([
    customerBenefits(customer.id),
    db().list("sales", { eq: { customer_id: customer.id }, order: { column: "created_at", ascending: false }, limit: 5 }),
    db().get("stores", customer.store_id),
  ]);

  const saldo = await availableBalance(customer.id);
  const qrData = qrSvg(cardUrl, 4);

  // Ocultar dados sensíveis
  const phoneOculto = customer.phone
    ? customer.phone.replace(/(\d{2})\d+(\d{4})/, "$1****$2")
    : null;

  const today = new Date().toISOString().slice(0, 10);
  const benefitsFiltrados = benefits.filter(
    (b) => benefitState(b) === "disponivel" || benefitState(b) === "futuro",
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-4 text-white">
      <div className="mx-auto max-w-sm">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.3em] text-brand-200">Mundial Ótica</div>
          <div className="text-xs text-brand-300">Cartão Fidelidade</div>
        </div>

        {/* Cartão */}
        <div className="mb-4 rounded-2xl bg-white/10 p-5 backdrop-blur">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="text-lg font-bold">{customer.name}</div>
              {phoneOculto && <div className="text-sm text-brand-200">{phoneOculto}</div>}
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${LEVEL_COLORS[customer.level]}`}>
              {customer.level}
            </span>
          </div>
          <div className="mt-4 flex items-end justify-between gap-2">
            <div>
              <div className="text-xs text-brand-300">Saldo cashback disponível</div>
              <div className="text-3xl font-bold">{brl(saldo)}</div>
            </div>
          </div>
        </div>

        {/* Benefícios */}
        {benefitsFiltrados.length > 0 && (
          <div className="mb-4 rounded-xl bg-white/10 p-4 backdrop-blur">
            <div className="mb-3 text-sm font-semibold text-brand-100">Seus benefícios</div>
            <div className="flex flex-col gap-2">
              {benefitsFiltrados.map((b) => {
                const st = benefitState(b);
                return (
                  <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/10 px-3 py-2">
                    <div>
                      <div className="text-sm font-medium">{b.name}</div>
                      <div className="text-xs text-brand-300">
                        {st === "futuro" ? "Disponível em breve" : `Válido até ${date(b.expires_at)}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">{brl(b.remaining_cents)}</div>
                      <div className="text-[10px] text-brand-400">{b.kind}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Histórico */}
        {sales.length > 0 && (
          <div className="mb-4 rounded-xl bg-white/10 p-4 backdrop-blur">
            <div className="mb-3 text-sm font-semibold text-brand-100">Últimas compras</div>
            <div className="flex flex-col gap-1">
              {sales.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-brand-200">{date(s.created_at)}</span>
                  <span className="font-semibold">{brl(s.total_cents)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* QR e Agendar */}
        <div className="mb-4 flex items-center gap-4 rounded-xl bg-white/10 p-4 backdrop-blur">
          <div
            className="size-20 shrink-0 overflow-hidden rounded-lg"
            dangerouslySetInnerHTML={{ __html: qrData }}
          />
          <div>
            <div className="text-sm font-medium">Mostre este QR Code na loja</div>
            <div className="mt-0.5 text-xs text-brand-300">para identificar seu cartão</div>
          </div>
        </div>

        {/* Agendar via WhatsApp */}
        {store?.phone && (
          <a
            href={`https://wa.me/55${store.phone.replace(/\D/g, "")}?text=Ol%C3%A1!%20Gostaria%20de%20agendar%20um%20exame%20de%20vista.`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-xl bg-emerald-500 py-3 text-center text-sm font-bold text-white transition hover:bg-emerald-600"
          >
            📅 Agendar exame de vista
          </a>
        )}

        <div className="mt-6 text-center text-[10px] text-brand-400">
          {store?.name ?? "Mundial Ótica"} · {store?.address ?? ""}
        </div>
      </div>
    </div>
  );
}
