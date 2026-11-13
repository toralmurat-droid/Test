import { worldScaleName } from "./worldscale";

/**
 * Perf readout for diagnosing slowdowns on a real PC: open the game with `?perf=1`, press Copy, paste the text.
 * Without the flag this module does nothing (no listeners, no wrapped functions, no DOM). Cosmetic only:
 * it sends nothing to the server and changes no gameplay. Call it once `window.__game` exists.
 */
export function perfHud(): void {
  if (new URLSearchParams(location.search).get("perf") !== "1") return;
  const game = (window as any).__game;
  if (!game) return;

  // ---- samples
  const frames: { t: number; dt: number }[] = []; // frame intervals of the last 5 s
  let last = 0, nAll = 0, sumAll = 0, minFps = Infinity, maxFps = 0;
  let upd = 0, ren = 0, nTimed = 0, tPre = 0, tPost = 0, draws = 0, drawsNow = 0;

  const gl: WebGLRenderingContext | WebGL2RenderingContext | undefined = game.renderer?.gl;
  if (gl) for (const f of ["drawArrays", "drawElements"] as const) {
    const o = (gl as any)[f] as (...a: unknown[]) => unknown;
    (gl as any)[f] = function (...a: unknown[]) { drawsNow++; return o.apply(gl, a); };
  }
  game.events.on("prestep", () => { tPre = performance.now(); drawsNow = 0; });
  game.events.on("poststep", () => { tPost = performance.now(); upd += tPost - tPre; });
  game.events.on("postrender", () => {
    const now = performance.now();
    ren += now - tPost; nTimed++; draws += drawsNow;
    if (last) frames.push({ t: now, dt: now - last });
    last = now;
    while (frames.length && now - frames[0].t > 5000) frames.shift();
  });

  // ---- panel
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:6px;top:6px;z-index:99999;background:rgba(0,0,0,.82);color:#e8ffe8;" +
    `font:${innerWidth < 600 ? 11 : 14}px/1.25 'Pixelify Sans',monospace;padding:6px 8px;border:2px solid #6c6;max-width:92vw;` +
    "pointer-events:auto;white-space:pre-wrap;overflow-wrap:anywhere;box-sizing:border-box;overflow:hidden";
  const pre = document.createElement("div");
  const btn = document.createElement("button");
  btn.textContent = "Copy";
  btn.style.cssText = "font:inherit;margin-top:4px;padding:2px 12px;cursor:pointer";
  box.append(pre, btn);
  document.body.append(box);
  let text = "";

  const gpu = (() => {
    try {
      const e = gl?.getExtension("WEBGL_debug_renderer_info");
      return e ? String(gl!.getParameter(e.UNMASKED_RENDERER_WEBGL)) : "unknown";
    } catch { return "unknown"; }
  })();

  const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : "-");
  function refresh() {
    const n = frames.length;
    const span = n ? frames[n - 1].t - frames[0].t + frames[0].dt : 0;
    const fps = n && span ? (n * 1000) / span : 0;
    const sorted = frames.map((f) => f.dt).sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
    if (n > 10) { nAll++; sumAll += fps; minFps = Math.min(minFps, fps); maxFps = Math.max(maxFps, fps); }
    const k = nTimed || 1;
    const scene = game.scene.scenes.find((s: any) => s.entities);
    const list: any[] = scene?.children?.list ?? [];
    let vis = 0; for (const o of list) if (o.visible) vis++;
    const updList = scene?.sys?.updateList?.length ?? 0;
    const tweens = scene?.tweens?.getTweens?.().length ?? 0;
    let texN = 0, texB = 0;
    for (const key of game.textures.getTextureKeys()) for (const s of game.textures.get(key).source) { texN++; texB += s.width * s.height * 4; }
    const mem = (performance as any).memory;
    const c = game.canvas as HTMLCanvasElement;
    const lines = [
      `fps ${fmt(fps)} (5 s avg)   slowest 5% frame ${fmt(p95)} ms`,
      `fps since open: min ${fmt(minFps === Infinity ? 0 : minFps)} / avg ${fmt(nAll ? sumAll / nAll : 0)} / max ${fmt(maxFps)}`,
      `script per frame: update ${fmt(upd / k, 2)} ms, render ${fmt(ren / k, 2)} ms`,
      `objects: ${list.length} in scene, ${vis} visible, ${updList} updating, ${tweens} tweens`,
      `draw calls per frame: ${fmt(draws / k, 0)}`,
      `textures: ${texN}, ${fmt(texB / 1048576, 0)} MB decoded`,
      `GPU: ${gpu}`,
      `canvas ${c.width}x${c.height}, pixel ratio ${window.devicePixelRatio}, window ${innerWidth}x${innerHeight}`,
      `screen size setting: ${worldScaleName()}`,
      mem ? `JS heap: ${fmt(mem.usedJSHeapSize / 1048576, 0)} MB` : `JS heap: n/a`,
    ];
    text = [...lines, `browser: ${navigator.userAgent}`].join("\n"); // the long user agent stays out of the panel
    pre.textContent = lines.join("\n");
    upd = ren = 0; nTimed = 0; draws = 0;
  }

  btn.onclick = async () => {
    try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.cssText = "position:fixed;left:0;top:0;width:300px;height:100px;z-index:100000";
      document.body.append(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch { /* ignore */ }
      if (ok) ta.remove();
      btn.textContent = ok ? "Copied" : "Select the text and copy it";
    }
    setTimeout(() => { btn.textContent = "Copy"; }, 2000);
  };
  refresh();
  setInterval(refresh, 500);
}
