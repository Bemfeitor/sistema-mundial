import type { RxEye } from "@/lib/types";

const n = (v: number | null | undefined, signed = true, digits = 2) =>
  v == null ? "—" : `${signed && v > 0 ? "+" : ""}${v.toFixed(digits).replace(".", ",")}`;

/** Tabela compacta de receita (OD/OE). */
export function RxTable({ od, oe, compact = true }: { od: RxEye; oe: RxEye; compact?: boolean }) {
  const cell = compact ? "px-1.5 py-1" : "px-3 py-2";
  return (
    <table className="w-full text-xs tabular-nums">
      <thead>
        <tr className="text-left text-slate-500">
          <th className={cell}></th>
          <th className={cell}>Esf.</th>
          <th className={cell}>Cil.</th>
          <th className={cell}>Eixo</th>
          <th className={cell}>Adição</th>
          <th className={cell}>DNP</th>
          <th className={cell}>Altura</th>
        </tr>
      </thead>
      <tbody>
        {(
          [
            ["OD", od],
            ["OE", oe],
          ] as const
        ).map(([eye, r]) => (
          <tr key={eye} className="border-t border-slate-100">
            <td className={`${cell} font-semibold text-slate-700`}>{eye}</td>
            <td className={cell}>{n(r?.sph)}</td>
            <td className={cell}>{n(r?.cyl)}</td>
            <td className={cell}>{r?.axis != null ? `${r.axis}°` : "—"}</td>
            <td className={cell}>{n(r?.add)}</td>
            <td className={cell}>{n(r?.dnp, false, 1)}</td>
            <td className={cell}>{n(r?.height, false, 1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
