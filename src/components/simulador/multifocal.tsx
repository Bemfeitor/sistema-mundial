"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Pause, Play, RefreshCw, RotateCcw, SwitchCamera } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { blurFragment, blurVertex, clamp, fieldAt, fragmentShader, vertexShader } from "./optics";
import { makeScene } from "./scene";

const NOMES = ["Tradicional", "Digital", "Personalizada", "Ocupacional"];
const DISTANCIAS = [
  { v: -1, rotulo: "Ambiente", ajuda: "Explore o campo útil de toda a lente." },
  { v: 0, rotulo: "Longe", ajuda: "Aponte para algo distante. A região superior favorece longe." },
  { v: 0.5, rotulo: "Tela", ajuda: "Aponte para uma tela. Procure a faixa do meio da lente." },
  { v: 1, rotulo: "Leitura", ajuda: "Aponte para um texto próximo. Posicione-o na parte inferior." },
];
const EXPLICA = [
  "Neste desenho de referência, o corredor é mais estreito. Explore o centro e depois toque nas laterais.",
  "Este exemplo otimizado redistribui o campo útil. O resultado de uma lente digital depende do desenho e dos parâmetros usados.",
  "Este exemplo ilustra um desenho adaptado ao uso. Na prática, a personalização considera medidas individuais, montagem e hábitos.",
  "Ocupacionais privilegiam visão intermediária e perto; este desenho ilustrativo não simula uma zona de longe.",
];

export interface EstadoMF {
  lens: number;
  other: number;
  compare: boolean;
  triptych: boolean;
  map: boolean;
  original: boolean;
  corridor: number;
  addition: number;
  intensity: number;
  brightness: number;
  distance: number;
  didactic: boolean;
}
export const ESTADO_INICIAL: EstadoMF = { lens: 0, other: 2, compare: false, triptych: false, map: false, original: false, corridor: 1, addition: 2, intensity: 75, brightness: 120, distance: -1, didactic: true };

interface GLCtx {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  blurProgram: WebGLProgram;
  quad: WebGLBuffer;
  texture: WebGLTexture;
  loc: Record<string, WebGLUniformLocation | null>;
  blurTargets: { texture: WebGLTexture; framebuffer: WebGLFramebuffer }[];
  blurW: number;
  blurH: number;
}

function initGL(canvas: HTMLCanvasElement): GLCtx {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, powerPreference: "low-power", preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL indisponível");
  const shader = (type: number, code: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, code);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const link = (vs: string, fs: string) => {
    const p = gl.createProgram()!;
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "programa");
    return p;
  };
  const program = link(vertexShader, fragmentShader);
  const blurProgram = link(blurVertex, blurFragment);
  const quad = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  for (const [k, v] of [
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
    [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
  ])
    gl.texParameteri(gl.TEXTURE_2D, k!, v!);
  const loc: GLCtx["loc"] = {};
  ["image", "soft", "blurred", "resolution", "sourceRatio", "lens", "other", "panes", "corridor", "intensity", "map", "original", "distance", "didactic", "photo", "darkness", "tint", "photoBase", "gradient", "addition", "brightness"].forEach(
    (k) => (loc[k] = gl.getUniformLocation(program, "u_" + k)),
  );
  gl.useProgram(program);
  gl.uniform1i(loc.image!, 0);
  gl.uniform1i(loc.soft!, 1);
  gl.uniform1i(loc.blurred!, 2);
  return { gl, program, blurProgram, quad, texture, loc, blurTargets: [], blurW: 0, blurH: 0 };
}

function bindProgram(g: GLCtx, p: WebGLProgram) {
  const { gl } = g;
  gl.useProgram(p);
  gl.bindBuffer(gl.ARRAY_BUFFER, g.quad);
  const a = gl.getAttribLocation(p, "a_position");
  gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
}

function prepareBlur(g: GLCtx, source: HTMLVideoElement | HTMLCanvasElement) {
  const { gl } = g;
  const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.width,
    sh = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  const w = 512,
    h = Math.max(128, Math.round((w * sh) / sw));
  if (w !== g.blurW || h !== g.blurH) {
    g.blurTargets.forEach((t) => {
      gl.deleteTexture(t.texture);
      gl.deleteFramebuffer(t.framebuffer);
    });
    g.blurTargets = [];
    g.blurW = w;
    g.blurH = h;
    for (let i = 0; i < 3; i++) {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const f = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Buffer de desfoque indisponível");
      g.blurTargets.push({ texture: t, framebuffer: f });
    }
  }
  bindProgram(g, g.blurProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(gl.getUniformLocation(g.blurProgram, "u_input"), 0);
  gl.viewport(0, 0, w, h);
  const [t0, t1, t2] = g.blurTargets as [GLCtx["blurTargets"][0], GLCtx["blurTargets"][0], GLCtx["blurTargets"][0]];
  const pass = (src: WebGLTexture, target: { framebuffer: WebGLFramebuffer }, x: number, y: number) => {
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.uniform2f(gl.getUniformLocation(g.blurProgram, "u_step"), x / w, y / h);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
  pass(g.texture, t0, 1.3, 0);
  pass(t0.texture, t1, 0, 0.9);
  pass(t1.texture, t0, 3.0, 0);
  pass(t0.texture, t2, 0, 2.2);
  pass(t2.texture, t0, 4.6, 0);
  pass(t0.texture, t2, 0, 3.4);
}

const MSG_CAMERA: Record<string, string> = {
  NotAllowedError: "A câmera não foi liberada. Autorize a câmera nas configurações do navegador e tente novamente.",
  NotFoundError: "Nenhuma câmera foi encontrada. Conecte uma câmera ou use a cena de exemplo.",
  NotReadableError: "A câmera está ocupada ou indisponível. Feche outros aplicativos que a utilizam e tente novamente.",
  OverconstrainedError: "A câmera não oferece a configuração solicitada. Tente outra câmera ou outro navegador.",
  AbortError: "A câmera não pôde ser iniciada. Tente novamente.",
};

export function Multifocal({ inicial }: { inicial: Partial<EstadoMF> }) {
  const [s, setS] = useState<EstadoMF>({ ...ESTADO_INICIAL, ...inicial });
  const [camera, setCamera] = useState({ on: false, loading: false, paused: false, facing: "environment" as "environment" | "user" });
  const [msg, setMsg] = useState("");
  const [falhaGL, setFalhaGL] = useState(false);
  const [probe, setProbe] = useState<{ x: number; y: number; titulo: string; texto: string } | null>(null);
  const [tam, setTam] = useState({ w: 800, h: 520 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(s);
  const camRef = useRef(camera);
  const dirty = useRef(true);
  const streamRef = useRef<MediaStream | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    stateRef.current = s;
    dirty.current = true;
  }, [s]);
  useEffect(() => {
    camRef.current = camera;
    dirty.current = true;
  }, [camera]);

  const upd = (patch: Partial<EstadoMF>) => {
    setProbe(null);
    setS((o) => ({ ...o, ...patch }));
  };

  // ---------- WebGL + loop de renderização ----------
  useEffect(() => {
    const canvas = canvasRef.current!,
      video = videoRef.current!;
    const scene = makeScene();
    let g: GLCtx;
    try {
      g = initGL(canvas);
    } catch (e) {
      console.error(e);
      setFalhaGL(true);
      return;
    }
    let frame = 0,
      last = 0,
      displayLens = stateRef.current.lens,
      lastSource: HTMLVideoElement | HTMLCanvasElement | null = null;
    const render = (t: number) => {
      frame = requestAnimationFrame(render);
      if (document.hidden || t - last < 32) return;
      const dt = Math.min(100, t - last);
      last = t;
      const st = stateRef.current,
        cam = camRef.current;
      displayLens += (st.lens - displayLens) * Math.min(1, dt / 115);
      if (Math.abs(displayLens - st.lens) < 0.005) displayLens = st.lens;
      const live = cam.on && !cam.paused && video.readyState >= 2;
      if (!live && !dirty.current && displayLens === st.lens) return;
      // tamanho
      const box = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 1.5, 1152 / Math.max(1, box.width));
      const w = Math.max(2, Math.round(box.width * scale)),
        h = Math.max(2, Math.round(box.height * scale));
      if (w !== canvas.width || h !== canvas.height) {
        canvas.width = w;
        canvas.height = h;
      }
      const source = cam.on && video.readyState >= 2 ? video : scene;
      const { gl, loc } = g;
      try {
        if (live || lastSource !== source || dirty.current) {
          if (live || lastSource !== source) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, g.texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
            lastSource = source;
            prepareBlur(g, source);
          }
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        bindProgram(g, g.program);
        [g.texture, g.blurTargets[1]!.texture, g.blurTargets[2]!.texture].forEach((tx, i) => {
          gl.activeTexture(gl.TEXTURE0 + i);
          gl.bindTexture(gl.TEXTURE_2D, tx);
        });
        gl.uniform2f(loc.resolution!, canvas.width, canvas.height);
        const ratio = source === video ? video.videoWidth / video.videoHeight : scene.width / scene.height;
        gl.uniform1f(loc.sourceRatio!, ratio || 1.5);
        const u: Record<string, number> = {
          brightness: st.brightness / 100,
          addition: st.addition,
          lens: displayLens,
          other: st.other,
          panes: st.triptych ? 4 : st.compare ? 2 : 1,
          corridor: st.corridor,
          intensity: st.intensity / 55,
          map: +st.map,
          original: +st.original,
          distance: st.distance,
          didactic: +st.didactic,
          photo: 0,
          darkness: 0,
          photoBase: 0,
          gradient: 0,
        };
        gl.uniform3fv(loc.tint!, [0.4, 0.42, 0.44]);
        for (const [k, v] of Object.entries(u)) gl.uniform1f(loc[k]!, v);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        dirty.current = false;
      } catch (e) {
        console.error("Falha na renderização", e);
        cancelAnimationFrame(frame);
        setFalhaGL(true);
      }
    };
    frame = requestAnimationFrame(render);
    const ro = new ResizeObserver(() => {
      dirty.current = true;
      const v = viewerRef.current;
      if (v) setTam({ w: v.clientWidth, h: v.clientHeight });
    });
    if (viewerRef.current) ro.observe(viewerRef.current);
    const onVis = () => {
      dirty.current = true;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      const ext = g.gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    };
  }, []);

  // ---------- câmera ----------
  const stopCamera = useCallback((mensagem = true) => {
    reqId.current++;
    streamRef.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    streamRef.current = null;
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.srcObject = null;
    }
    setCamera((c) => ({ ...c, on: false, loading: false, paused: false }));
    if (mensagem) setMsg("Câmera desligada. Você pode continuar com a cena de exemplo.");
  }, []);

  async function startCamera(facing = camera.facing) {
    if (falhaGL) return setMsg("O efeito visual precisa de suporte gráfico. Experimente outro navegador.");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      return setMsg("A câmera precisa de conexão segura (HTTPS). A cena de exemplo continua disponível.");
    stopCamera(false);
    const id = ++reqId.current;
    setCamera((c) => ({ ...c, loading: true, facing }));
    setMsg("");
    let acquired: MediaStream | null = null;
    try {
      acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } });
      if (id !== reqId.current) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = acquired;
      const v = videoRef.current!;
      v.srcObject = acquired;
      await v.play();
      const track = acquired.getVideoTracks()[0];
      const real = (track?.getSettings().facingMode as "environment" | "user" | undefined) ?? facing;
      if (track)
        track.onended = () => {
          stopCamera(false);
          setMsg("A câmera foi interrompida pelo dispositivo. Toque em Ativar câmera para tentar novamente.");
        };
      setCamera({ on: true, loading: false, paused: false, facing: real });
    } catch (e) {
      acquired?.getTracks().forEach((t) => t.stop());
      if (id !== reqId.current) return;
      setCamera((c) => ({ ...c, on: false, loading: false }));
      const name = e instanceof DOMException ? e.name : "";
      setMsg(MSG_CAMERA[name] ?? "Não foi possível iniciar a câmera. Tente novamente ou explore a cena de exemplo.");
    }
  }

  useEffect(() => {
    const onHide = () => {
      if (document.hidden && streamRef.current) {
        stopCamera(false);
        setMsg("Câmera desligada ao sair da página. Toque em Ativar câmera para retomar.");
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      stopCamera(false);
    };
  }, [stopCamera]);

  // ---------- sonda (toque na imagem) ----------
  function tocar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (s.original || falhaGL) return;
    const b = e.currentTarget.getBoundingClientRect();
    const sx = clamp((e.clientX - b.left) / b.width),
      y = clamp((e.clientY - b.top) / b.height);
    const panes = s.triptych ? 4 : s.compare ? 2 : 1,
      pane = Math.min(panes - 1, Math.floor(sx * panes));
    const x = Math.min(0.999999, sx * panes - pane),
      lens = s.triptych ? pane : s.compare && pane === 1 ? s.other : s.lens;
    const f = fieldAt(x, y, lens, s.corridor, s.addition);
    const regiao = f.peripheral < 0.12 ? "campo útil" : f.peripheral < 0.7 ? "transição lateral" : "periferia";
    const texto =
      f.peripheral < 0.12
        ? "Você tocou em uma região central do desenho, com menor desfoque periférico."
        : f.peripheral < 0.7
          ? "Ao sair do campo útil, o desfoque aparece aos poucos. Não existe uma linha divisória na lente real."
          : "Nas laterais, a nitidez diminui e as linhas podem parecer deformadas. Mover a cabeça ajuda a trazer o objeto para a região central.";
    setProbe({ x: sx * 100, y: y * 100, titulo: `${NOMES[lens]} · ${regiao} · ${f.zone}`, texto: texto + (s.distance >= 0 ? " A nitidez também depende da distância selecionada." : "") });
  }

  // ---------- textos ----------
  let titulo: string, texto: string;
  if (probe) {
    titulo = probe.titulo;
    texto = probe.texto;
  } else if (s.original) {
    titulo = "Esta é a imagem original, sem a simulação.";
    texto = "Use “Voltar ao efeito” para comparar a imagem com o desfoque e a deformação da lente.";
  } else if (s.distance >= 0) {
    titulo = s.distance === 0 ? "Para longe, use a região superior." : s.distance === 0.5 ? "Para uma tela, explore o corredor." : "Para ler, procure a região inferior.";
    texto = "A distância foi escolhida por você. O simulador aplica essa hipótese a toda a imagem; ele não mede a distância dos objetos.";
  } else if (s.compare) {
    titulo = s.triptych ? "Quatro lentes, a mesma cena." : "Duas lentes, a mesma cena.";
    texto = "Compare a largura da região nítida e o comportamento das laterais. Os perfis são exemplos ilustrativos, sem equivalência a produtos específicos.";
  } else {
    titulo = `${NOMES[s.lens]} · observe o caminho da visão.`;
    texto = EXPLICA[s.lens]!;
  }
  const ajudaDist = s.lens === 3 && s.distance === 0 ? "A lente ocupacional não tem zona para longe; experimente Tela ou Leitura." : DISTANCIAS.find((d) => d.v === s.distance)?.ajuda;

  // ---------- overlay do corredor ----------
  const panes = s.triptych ? 4 : s.compare ? 2 : 1;
  const overlay = s.map && !s.original ? corredorSVG(tam.w, tam.h, panes, s) : null;

  const lensDoPainel = (i: number) => (panes === 4 ? i : i === 1 ? s.other : s.lens);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div ref={viewerRef} className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-slate-900 shadow-inner">
          <canvas ref={canvasRef} onPointerDown={tocar} className="absolute inset-0 size-full cursor-crosshair touch-none" aria-label="Simulação ilustrativa da visão com lente multifocal" />
          <video ref={videoRef} playsInline muted className="hidden" />
          {overlay && <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${tam.w} ${tam.h}`} dangerouslySetInnerHTML={{ __html: overlay }} />}
          {Array.from({ length: panes }).map((_, i) => (
            <span key={i} className="pointer-events-none absolute top-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-semibold text-white" style={{ left: `calc(${(i * 100) / panes}% + 8px)` }}>
              {NOMES[lensDoPainel(i)]} <span className="font-normal opacity-75">{s.original ? "· sem efeito" : "· ilustrativo"}</span>
            </span>
          ))}
          {probe && <span className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${probe.x}%`, top: `${probe.y}%` }} />}
          <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">
            <span className={cn("size-2 rounded-full", camera.on ? "bg-red-500" : "bg-slate-400")} />
            {camera.loading ? "Aguardando câmera…" : camera.on ? (camera.paused ? "Imagem pausada · câmera ligada" : "Câmera ao vivo") : "Cena de exemplo"}
          </span>
          {falhaGL && (
            <div className="absolute inset-0 grid place-items-center bg-slate-900/90 p-6 text-center text-sm text-white">
              <div>
                <strong>O efeito visual não está disponível neste navegador.</strong>
                <p className="mt-1 opacity-80">Abra no Chrome ou Safari atualizado, com aceleração gráfica ativa.</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!camera.on ? (
            <Button variant="secondary" onClick={() => startCamera()} disabled={camera.loading}>
              <Camera className="size-4" /> {camera.loading ? "Aguardando permissão…" : "Ativar câmera ao vivo"}
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => stopCamera()}>
                <CameraOff className="size-4" /> Desligar câmera
              </Button>
              <Button variant="ghost" onClick={() => setCamera((c) => ({ ...c, paused: !c.paused }))} title={camera.paused ? "Retomar imagem" : "Pausar imagem"}>
                {camera.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              </Button>
              <Button variant="ghost" onClick={() => startCamera(camera.facing === "environment" ? "user" : "environment")} title="Trocar câmera">
                <SwitchCamera className="size-4" />
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => upd({ original: !s.original })}>
            <RefreshCw className="size-4" /> {s.original ? "Voltar ao efeito" : "Ver sem efeito"}
          </Button>
          <Button variant="ghost" onClick={() => setS({ ...ESTADO_INICIAL })}>
            <RotateCcw className="size-4" /> Restaurar
          </Button>
        </div>
        {msg && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{msg}</p>}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="font-semibold text-slate-900">{titulo}</div>
          <p className="mt-1 text-sm text-slate-600">{texto}</p>
          <p className="mt-2 text-xs text-slate-400">Toque na imagem para explorar a lente. Simulação ilustrativa: não representa a visão real de nenhum produto nem substitui a avaliação profissional.</p>
        </div>
      </div>

      {/* Controles */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <div>
          <div className="mb-1.5 font-medium text-slate-800">Desenho da lente</div>
          <div className="grid grid-cols-2 gap-1.5">
            {NOMES.map((n, i) => (
              <button
                key={n}
                type="button"
                aria-pressed={i === s.lens && !s.triptych}
                onClick={() => upd({ triptych: false, lens: i, other: s.compare && s.other === i ? (i === 3 ? 0 : 3) : s.other })}
                className={cn("rounded-lg border px-2 py-2 text-left", i === s.lens && !s.triptych ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-slate-200 hover:bg-slate-50")}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ToggleBtn on={s.compare && !s.triptych} onClick={() => upd({ compare: !(s.compare && !s.triptych), triptych: false, other: s.other === s.lens ? (s.lens === 3 ? 0 : 3) : s.other })}>
            Comparar 2
          </ToggleBtn>
          <ToggleBtn on={s.triptych} onClick={() => upd({ triptych: !s.triptych, compare: !s.triptych, map: true, original: false })}>
            Comparar 4
          </ToggleBtn>
          <ToggleBtn on={s.map} onClick={() => upd({ map: !s.map, original: false })}>
            Mostrar corredor
          </ToggleBtn>
        </div>
        {s.compare && !s.triptych && (
          <label className="block">
            <span className="mb-1 block font-medium text-slate-800">Comparar com</span>
            <select value={s.other} onChange={(e) => upd({ other: +e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
              {NOMES.map((n, i) => (
                <option key={n} value={i}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <div>
          <div className="mb-1.5 font-medium text-slate-800">Distância de visão</div>
          <div className="grid grid-cols-4 gap-1">
            {DISTANCIAS.map((d) => (
              <ToggleBtn key={d.v} on={s.distance === d.v} onClick={() => upd({ distance: d.v })} className="px-1">
                {d.rotulo}
              </ToggleBtn>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">{ajudaDist}</p>
        </div>
        <Slider rotulo="Corredor" valor={["Curto", "Padrão", "Longo"][s.corridor]!} min={0} max={2} step={1} value={s.corridor} onChange={(v) => upd({ corridor: v })} />
        <Slider rotulo="Adição" valor={`+${s.addition.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} D`} min={0.75} max={3.5} step={0.25} value={s.addition} onChange={(v) => upd({ addition: v })} />
        <Slider rotulo="Intensidade" valor={s.intensity === 0 ? "Sem efeito" : s.intensity < 35 ? "Suave" : s.intensity < 75 ? "Moderada" : "Marcante"} min={0} max={100} step={1} value={s.intensity} onChange={(v) => upd({ intensity: v })} />
        <Slider rotulo="Brilho da imagem" valor={`${s.brightness}%`} min={100} max={180} step={5} value={s.brightness} onChange={(v) => upd({ brightness: v })} />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={s.didactic} onChange={(e) => upd({ didactic: e.target.checked })} />
          <span>Modo didático (desfoque acentuado)</span>
        </label>
      </div>
    </div>
  );
}

function ToggleBtn({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium", on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 hover:bg-slate-50", className)}>
      {children}
    </button>
  );
}

export function Slider({ rotulo, valor, ...p }: { rotulo: string; valor: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between">
        <span className="font-medium text-slate-800">{rotulo}</span>
        <span className="text-slate-500">{valor}</span>
      </span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} onChange={(e) => p.onChange(+e.target.value)} className="w-full accent-brand-600" />
    </label>
  );
}

/** SVG do corredor (porte de overlays.js), retornado como string estática. */
function corredorSVG(w: number, h: number, n: number, s: EstadoMF) {
  const pw = w / n,
    font = Math.max(10, Math.min(15, pw / 13));
  const label = (text: string, x: number, y: number, size = font) => {
    const bw = text.length * size * 0.61 + 14;
    return `<g><rect x="${x - bw / 2}" y="${y - size - 4}" width="${bw}" height="${size + 10}" rx="5" fill="#143b2a" fill-opacity=".94"/><text x="${x}" y="${y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${size}" fill="#fff" font-weight="700">${text}</text></g>`;
  };
  let html = "";
  for (let i = 0; i < n; i++) {
    const lens = n === 4 ? i : i === 1 ? s.other : s.lens,
      ox = i * pw,
      occupational = lens === 3,
      left: string[] = [],
      right: string[] = [];
    for (let j = 0; j <= 70; j++) {
      const y = 0.08 + (j * 0.85) / 70,
        f = fieldAt(0.5, y, lens, s.corridor, s.addition);
      left.push(`${ox + (f.center - f.width) * pw},${y * h}`);
      right.push(`${ox + (f.center + f.width) * pw},${y * h}`);
    }
    for (const points of [left, right]) {
      const d = "M" + points.join(" L");
      html += `<path d="${d}" fill="none" stroke="#173325" stroke-opacity=".85" stroke-width="6"/><path d="${d}" fill="none" stroke="#efffaf" stroke-width="3"/>`;
    }
    const f = fieldAt(0.5, 0.57, lens, s.corridor, s.addition),
      a = ox + (f.center - f.width) * pw,
      b = ox + (f.center + f.width) * pw,
      cy = 0.57 * h;
    html += `<path d="M${a} ${cy}H${b} M${a + 6} ${cy - 5}L${a} ${cy}L${a + 6} ${cy + 5} M${b - 6} ${cy - 5}L${b} ${cy}L${b - 6} ${cy + 5}" stroke="#fff" stroke-width="2.5" fill="none"/>`;
    if (occupational) {
      html += label("INTERMEDIÁRIO", ox + pw * 0.5, h * 0.23);
      html += label("CAMPO DE USO", ox + pw * f.center, h * 0.5);
    } else {
      html += label("LONGE", ox + pw * 0.5, h * 0.21);
      html += label("CORREDOR", ox + pw * f.center, h * 0.49);
      const cy2 = (0.7 + 0.09 * s.corridor) * h;
      html += `<path d="M${ox + pw * 0.5 - 7} ${h * 0.28}H${ox + pw * 0.5 + 7} M${ox + pw * 0.5} ${h * 0.28 - 7}V${h * 0.28 + 7} M${ox + pw * 0.5} ${h * 0.28}L${ox + pw * 0.455} ${cy2}" stroke="#fff" stroke-width="2" stroke-dasharray="4 4" fill="none"/><circle cx="${ox + pw * 0.455}" cy="${cy2}" r="6" stroke="#fff" stroke-width="2" fill="none"/>`;
    }
    html += label("PERTO", ox + pw * 0.465, h * Math.min(0.93, 0.75 + 0.09 * s.corridor));
    if (i > 0) html += `<path d="M${ox} 0V${h}" stroke="#fff" stroke-opacity=".8" stroke-width="1"/>`;
  }
  return html;
}
