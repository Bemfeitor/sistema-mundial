"use client";
import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { collections, getCollection, photoBase, photoColor, rgb } from "./fotossensivel";
import { makeScene } from "./scene";
import { Slider } from "./multifocal";

/**
 * Escurecimento manual ilustrativo (sem sensor de UV/luz ambiente).
 * Mesma fórmula de transmissão do shader original, aplicada em canvas 2D:
 *   cor *= mix(1, 0.48 + tinta*0.52, densidade) * (1 - densidade*0.79)
 */
export function FotossensivelView() {
  const [collection, setCollection] = useState("gens");
  const [color, setColor] = useState("grey");
  const [customColor, setCustomColor] = useState("#835477");
  const [darkness, setDarkness] = useState(85);
  const [style, setStyle] = useState<"washed" | "gradient">("washed");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HTMLCanvasElement | null>(null);
  const anim = useRef(0);

  const grupo = getCollection(collection);
  const cor = photoColor({ collection, color, customColor });

  useEffect(() => {
    const cv = canvasRef.current!;
    sceneRef.current ??= makeScene();
    const scene = sceneRef.current;
    cv.width = scene.width;
    cv.height = scene.height;
    const ctx = cv.getContext("2d")!;
    const W = cv.width,
      H = cv.height,
      half = W / 2;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(scene, 0, 0);
    // metade direita: com lente
    const tint = rgb(cor.hex);
    const base = photoBase(collection);
    const gradient = collection === "colortouch" && style === "gradient";
    const mult = (density: number) => {
      const d = Math.max(0, Math.min(1, density));
      return tint.map((t) => Math.round(255 * (1 + (0.48 + t * 0.52 - 1) * d) * (1 - d * 0.79)));
    };
    const dens = (y: number) => {
      const residual = gradient ? base * (1.7 - 1.5 * y) : base;
      return residual + (0.76 - residual) * (darkness / 100);
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(half, 0, half, H);
    ctx.clip();
    ctx.globalCompositeOperation = "multiply";
    if (gradient) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      for (const s of [0, 0.5, 1]) g.addColorStop(s, `rgb(${mult(dens(s)).join(",")})`);
      ctx.fillStyle = g;
    } else ctx.fillStyle = `rgb(${mult(dens(0.5)).join(",")})`;
    ctx.fillRect(half, 0, half, H);
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(half - 2, 0, 4, H);
  }, [collection, cor.hex, darkness, style]);

  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  function animar() {
    cancelAnimationFrame(anim.current);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setDarkness((d) => (d > 50 ? 0 : 100));
    const start = performance.now();
    const step = (t: number) => {
      const u = Math.min(1, (t - start) / 3200);
      setDarkness(Math.round((0.5 - 0.5 * Math.cos(u * Math.PI * 2)) * 100));
      if (u < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }

  const nivel = darkness < 15 ? "Clara" : darkness < 65 ? "Intermediária" : "Escura";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-2">
        <div className="relative overflow-hidden rounded-xl bg-slate-900">
          <canvas ref={canvasRef} className="block aspect-[1600/1050] w-full" aria-label="Comparação ilustrativa sem lente e com lente fotossensível" />
          <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">Sem lente</span>
          <span className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
            {cor.name} · {nivel.toLowerCase()} · tom ilustrativo
          </span>
        </div>
        <p className="text-xs text-slate-500">Simulação ilustrativa de tonalidade, com escurecimento manual. Não mede UV nem representa a transmissão real de um produto.</p>
      </div>
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <label className="block">
          <span className="mb-1 block font-medium text-slate-800">Linha / paleta</span>
          <select
            value={collection}
            onChange={(e) => {
              setCollection(e.target.value);
              setColor(getCollection(e.target.value).colors[0]?.id ?? "custom");
            }}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          >
            {collections.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        {grupo.colors.length > 0 ? (
          <div className="grid grid-cols-2 gap-1.5">
            {grupo.colors.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={c.id === color}
                onClick={() => setColor(c.id)}
                className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs", c.id === color ? "border-brand-600 bg-brand-50 font-semibold" : "border-slate-200 hover:bg-slate-50")}
              >
                <i className="size-4 shrink-0 rounded-full border border-black/10" style={{ background: c.hex }} />
                {c.name}
              </button>
            ))}
          </div>
        ) : (
          <label className="flex items-center gap-2">
            <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)} />
            <span>Escolha um tom</span>
          </label>
        )}
        {collection === "colortouch" && (
          <label className="block">
            <span className="mb-1 block font-medium text-slate-800">Efeito</span>
            <select value={style} onChange={(e) => setStyle(e.target.value as "washed" | "gradient")} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
              <option value="washed">Washed (uniforme)</option>
              <option value="gradient">Gradient (degradê)</option>
            </select>
          </label>
        )}
        <Slider rotulo="Escurecimento" valor={nivel} min={0} max={100} step={1} value={darkness} onChange={(v) => { cancelAnimationFrame(anim.current); setDarkness(v); }} />
        <div className="grid grid-cols-3 gap-1">
          {[
            [0, "Clara"],
            [45, "Intermediária"],
            [100, "Escura"],
          ].map(([v, r]) => (
            <button key={r} type="button" onClick={() => { cancelAnimationFrame(anim.current); setDarkness(v as number); }} className={cn("rounded-lg border px-1 py-1.5 text-xs", darkness === v ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300")}>
              {r}
            </button>
          ))}
        </div>
        <Button variant="secondary" className="w-full" onClick={animar}>
          <Play className="size-4" /> Animar: interno → sol → interno
        </Button>
        <p className="text-xs text-slate-500">
          {grupo.note}{" "}
          {grupo.source && (
            <a href={grupo.source} target="_blank" rel="noreferrer" className="text-brand-700 underline">
              Fonte
            </a>
          )}
        </p>
      </div>
    </div>
  );
}
