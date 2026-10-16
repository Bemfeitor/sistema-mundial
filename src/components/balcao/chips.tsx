"use client";
import { cn } from "@/components/ui";
import type { Campo, Perfil } from "@/lib/balcao/campos";

export function Chip({ ativo, onClick, children, className }: { ativo: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-medium transition select-none",
        ativo ? "border-brand-600 bg-brand-600 text-white shadow-sm" : "border-slate-300 bg-white text-slate-700 hover:border-brand-500 hover:bg-brand-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function CampoChips({ campo, perfil, onChange }: { campo: Campo; perfil: Perfil; onChange: (id: string, v: string | string[] | undefined) => void }) {
  const v = perfil[campo.id];
  const ativo = (valor: string) => (Array.isArray(v) ? v.includes(valor) : v === valor);
  const clicar = (valor: string) => {
    if (campo.tipo === "multi") {
      const atual = Array.isArray(v) ? v : [];
      const novo = atual.includes(valor) ? atual.filter((x) => x !== valor) : [...atual, valor];
      onChange(campo.id, novo.length ? novo : undefined);
    } else onChange(campo.id, v === valor ? undefined : valor);
  };
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2 text-sm">
        <span className="font-medium text-slate-800">{campo.rotulo}</span>
        {campo.obrigatorio && !v && <span className="text-xs font-semibold text-amber-600">obrigatório</span>}
        {campo.tipo === "multi" && <span className="text-xs text-slate-400">várias</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {campo.opcoes.map((op) => (
          <Chip key={op.valor} ativo={ativo(op.valor)} onClick={() => clicar(op.valor)}>
            {op.rotulo}
          </Chip>
        ))}
      </div>
      {campo.ajuda && <p className="mt-1 text-xs text-slate-500">{campo.ajuda}</p>}
    </div>
  );
}

/** Renderiza markdown simples (negrito, tópicos) vindo da IA, sem HTML bruto. */
export function TextoIA({ texto }: { texto: string }) {
  return (
    <div className="space-y-1 text-sm leading-relaxed text-slate-800">
      {texto.split("\n").map((linha, i) => {
        const t = linha.trim();
        if (!t) return <div key={i} className="h-1" />;
        const bullet = /^[-*•]\s+/.test(t);
        const corpo = t.replace(/^[-*•]\s+/, "").replace(/^#+\s*/, "");
        const partes = corpo.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>,
        );
        return bullet ? (
          <div key={i} className="flex gap-2 pl-1">
            <span className="text-brand-600">•</span>
            <span>{partes}</span>
          </div>
        ) : (
          <p key={i}>{partes}</p>
        );
      })}
    </div>
  );
}
