import { PageHeader } from "@/components/ui";
import { Simulador, type Aba } from "@/components/simulador/simulador";
import type { EstadoMF } from "@/components/simulador/multifocal";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Simulador de lentes" };

const num = (v: string | string[] | undefined) => {
  const s = Array.isArray(v) ? v[0] : v;
  if (s == null || s === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export default async function SimuladorPage(props: PageProps<"/simulador">) {
  await requireUser();
  const q = await props.searchParams;
  const tipo = typeof q.tipo === "string" ? q.tipo : "";
  const add = num(q.add);
  const sph = num(q.sph);

  // Pré-configuração vinda do Balcão (?tipo, ?add, ?sph)
  const mf: Partial<EstadoMF> = {};
  if (tipo === "ocupacional") mf.lens = 3;
  if (add != null) mf.addition = Math.min(3.5, Math.max(0.75, Math.round(add * 4) / 4));
  const abaQs = typeof q.aba === "string" && ["multifocal", "espessura", "fotossensivel"].includes(q.aba) ? (q.aba as Aba) : null;
  const aba: Aba = abaQs ?? ((tipo === "longe" || tipo === "perto" || tipo === "infantil") && sph != null ? "espessura" : "multifocal");

  return (
    <>
      <PageHeader title="Simulador de lentes" subtitle="Mostre ao cliente, de forma ilustrativa, a diferença entre desenhos, espessuras e cores de lente." />
      <Simulador abaInicial={aba} mf={mf} sph={sph} />
    </>
  );
}
