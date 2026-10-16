"use client";
import { useState } from "react";
import { ArrowLeft, Glasses, Layers, Sun } from "lucide-react";
import { LinkButton, cn } from "@/components/ui";
import { Multifocal, type EstadoMF } from "./multifocal";
import { EspessuraView } from "./espessura-view";
import { FotossensivelView } from "./fotossensivel-view";

export type Aba = "multifocal" | "espessura" | "fotossensivel";

const ABAS: { id: Aba; rotulo: string; icone: typeof Glasses }[] = [
  { id: "multifocal", rotulo: "Multifocal", icone: Glasses },
  { id: "espessura", rotulo: "Espessura", icone: Layers },
  { id: "fotossensivel", rotulo: "Fotossensível", icone: Sun },
];

export function Simulador({ abaInicial, mf, sph }: { abaInicial: Aba; mf: Partial<EstadoMF>; sph: number | null }) {
  const [aba, setAba] = useState<Aba>(abaInicial);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {ABAS.map(({ id, rotulo, icone: Icone }) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={aba === id}
              onClick={() => setAba(id)}
              className={cn("flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition", aba === id ? "bg-white text-brand-700 shadow" : "text-slate-600 hover:text-slate-900")}
            >
              <Icone className="size-4" /> {rotulo}
            </button>
          ))}
        </div>
        <LinkButton href="/atendimento" variant="secondary">
          <ArrowLeft className="size-4" /> Voltar ao atendimento
        </LinkButton>
      </div>
      {/* Cada aba monta só quando visível (libera câmera/WebGL ao sair) */}
      {aba === "multifocal" && <Multifocal inicial={mf} />}
      {aba === "espessura" && <EspessuraView sphInicial={sph} />}
      {aba === "fotossensivel" && <FotossensivelView />}
    </div>
  );
}
