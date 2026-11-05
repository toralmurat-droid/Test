// Start screen backdrop: a night clearing with the village bonfire in the middle and the six heroes standing round it.
// Painted like the bonfire (bonfireArt.ts): a few flat tones per material, Bayer dithering, one colour per art cell.
// The ground is painted once per screen size on the bonfire's cell grid; heroes use their own sheets at 4/3 of a cell
// (the same proportion as in game), so both stay crisp at whole device pixels.
import { CLASSES, ClassKind, CLASS_KINDS } from "../../shared/classes";
import { CHAR_BASE, CHAR_EXT, HD_CHARS } from "./artAssets";
import { GEAR_SLOTS, starterKit } from "../../shared/gear";
import { bonfireStrip, FRAMES, FW, FH } from "./loading";
import { hash, vnoise, dith, FIRE } from "./bonfireArt";

interface AnimDef { frames: number[]; fps: number; loop: boolean }
interface Meta { columns: number; frameWidth: number; animations: Record<string, AnimDef> }

/** Same order as gear.ts LAYER_ORDER (not imported: that module pulls in the whole game). */
const KIT_ORDER = ["armour", "shoes", "ranged", "hat", "shield", "weapon"] as const;
const SHOWCASE = ["idle3", "swing1", "swing2", "attack3", "skill", "cheer"];
const BASE_X = 48, BASE_Y = 93; // where the fire pit sits inside a bonfire frame (cells)

/** Where each hero stands, in cells from the fire's base, and which way it faces the fire. */
const SLOTS: { dx: number; dy: number; dir: string; flip: boolean }[] = [
  { dx: -132, dy: 14, dir: "right", flip: false },
  { dx: -102, dy: -40, dir: "downright", flip: false },
  { dx: -40, dy: -88, dir: "downright", flip: false },
  { dx: 40, dy: -88, dir: "downright", flip: true },
  { dx: 102, dy: -40, dir: "downright", flip: true },
  { dx: 132, dy: 14, dir: "right", flip: true },
];

interface Hero {
  k: ClassKind; slot: (typeof SLOTS)[number]; img: HTMLImageElement | null; kit: HTMLImageElement[];
  anim: string; t0: number; step: number; nextFidget: number; label: HTMLDivElement;
}

export type FiresideMode = "rest" | "pick";

export function mountFireside(canvas: HTMLCanvasElement, labelHost: HTMLElement, onPick: (k: ClassKind) => void) {
  const g = canvas.getContext("2d")!;
  const strip = bonfireStrip();
  let mode: FiresideMode = "rest";
  let current: ClassKind | null = null;
  let hover: ClassKind | null = null;
  let labelText: Partial<Record<ClassKind, string>> = {};

  // ---- layout: S device px per cell (a multiple of 3, so a hero pixel is a whole 4/3 S) ----
  let S = 3, cw = 0, ch = 0, cx = 0, cy = 0, dpr = 1, squeeze = 1;
  let ground: HTMLCanvasElement[] = [];
  function layout() {
    dpr = window.devicePixelRatio || 1;
    const wd = Math.round(innerWidth * dpr), hd = Math.round(innerHeight * dpr);
    // biggest cell that still leaves room for the ring (at least ~190 x 270 cells); 2 px cells on small screens
    const k = Math.floor(Math.min(wd / 190, hd / 270) / 3);
    S = k >= 1 ? 3 * k : 2;
    cw = Math.ceil(wd / S); ch = Math.ceil(hd / S);
    canvas.width = wd; canvas.height = hd;
    cx = Math.round(cw / 2);
    cy = Math.round(ch > cw * 1.3 ? ch * 0.36 + 34 : ch * 0.45 + 40); // portrait: keep the ring clear of the panel below
    squeeze = Math.min(1, (cw / 2 - 30) / 128); // narrow screens: pull the ring in so every hero shows
    ground = [paintGround(1), paintGround(0.93)];
  }

  function paintGround(glow: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    const gg = c.getContext("2d")!;
    const img = gg.createImageData(cw, ch), d = img.data;
    const rgbCache = new Map<string, number[]>();
    const rgb = (hex: string) => {
      let v = rgbCache.get(hex);
      if (!v) { v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); rgbCache.set(hex, v); }
      return v;
    };
    const px = (x: number, y: number, hex: string) => {
      if (x < 0 || y < 0 || x >= cw || y >= ch) return;
      const [r, gr, b] = rgb(hex), i = (y * cw + x) * 4;
      d[i] = r; d[i + 1] = gr; d[i + 2] = b; d[i + 3] = 255;
    };
    const GRASS = ["#060807", "#0a0e0b", "#10170f", "#172113", "#212c16", "#323818", "#4a4a1e", "#66592a"];
    const DIRT = ["#070608", "#100c0c", "#1b1410", "#291e16", "#3a2a1c", "#4f3822", "#694828", "#86602f"];
    const R = 235 * glow;
    const light = (x: number, y: number) => {
      const dd = Math.hypot(x - cx, (y - cy) * 2.1);
      return Math.max(0, 1 - dd / R) ** 1.35;
    };
    const edge = (x: number, y: number) => {
      // dark falloff towards the screen edges, so the clearing sits in the night
      const ex = Math.min(x, cw - 1 - x) / 40, ey = Math.min(y, ch - 1 - y) / 30;
      return Math.min(1, ex, ey);
    };
    const pick = (ramp: string[], v: number) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(v * ramp.length)))];
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const L = light(x, y) * (0.35 + 0.65 * edge(x, y)) + 0.06 * edge(x, y);
      const n = vnoise(x * 0.11, y * 0.22, 999, 1), n2 = vnoise(x * 0.4, y * 0.8, 999, 2);
      const dirtR = 74 + (n - 0.5) * 34;
      const dirt = Math.hypot(x - cx, (y - cy) * 2.1) < dirtR;
      const v = L * 0.95 + (n2 - 0.5) * 0.2 + (dith(x, y) - 0.5) * 0.16;
      px(x, y, pick(dirt ? DIRT : GRASS, v));
    }
    // grass tufts, pebbles and a few trodden roots, lit by how close they are to the fire
    for (let y = 2; y < ch; y++) for (let x = 1; x < cw - 1; x++) {
      const h = hash(x, y, 31);
      if (h > 0.035) continue;
      const L = light(x, y) * (0.35 + 0.65 * edge(x, y)) + 0.06 * edge(x, y);
      const dirt = Math.hypot(x - cx, (y - cy) * 2.1) < 74 + (vnoise(x * 0.11, y * 0.22, 999, 1) - 0.5) * 34;
      if (dirt) {
        if (h < 0.008 && Math.hypot(x - cx, (y - cy) * 2.1) > 44) { // pebble
          px(x, y, pick(["#141210", "#2a2622", "#4a443c", "#6e665a", "#958a76"], L + 0.15));
          px(x + 1, y, pick(["#0c0a09", "#1c1916", "#332f2a", "#4f4840", "#6e665a"], L + 0.1));
          px(x, y + 1, "#0a0807");
        }
        continue;
      }
      const hi = pick(GRASS, L * 0.95 + 0.16), lo = pick(GRASS, L * 0.95 - 0.08);
      const tall = 2 + Math.floor(hash(x, y, 32) * 3);
      for (let i = 0; i < tall; i++) px(x, y - i, i === tall - 1 ? hi : lo);
      for (let i = 0; i < tall - 1; i++) px(x - 1, y - i + 1, lo);
      if (hash(x, y, 33) < 0.5) for (let i = 0; i < tall - 1; i++) px(x + 1, y - i, hi);
    }
    // a ring of dark pines round the clearing, rim-lit on the side turned to the fire
    const trees: { x: number; y: number; s: number; k: number }[] = [];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + hash(i, 1, 40) * 0.12;
      const r = 1 + hash(i, 2, 40) * 0.35;
      const x = Math.round(cx + Math.cos(a) * 205 * r * Math.max(1, cw / 420));
      const y = Math.round(cy + Math.sin(a) * 100 * r * Math.max(1, ch / 300));
      if (y > cy + 40 && Math.abs(x - cx) < cw * 0.42) continue; // keep the front open for the panels
      trees.push({ x, y, s: 0.8 + hash(i, 3, 40) * 0.6, k: i });
    }
    trees.sort((a, b) => a.y - b.y);
    for (const t of trees) pine(px, t.x, t.y, t.s, t.k, cx, cy);
    gg.putImageData(img, 0, 0);
    return c;
  }

  // ---- heroes ----
  const heroes: Hero[] = CLASS_KINDS.map((k, i) => {
    const label = document.createElement("div");
    label.className = "fs-label";
    labelHost.appendChild(label);
    return { k, slot: SLOTS[i % SLOTS.length], img: null, kit: [], anim: "idle", t0: 0, step: 0, nextFidget: 2000 + Math.random() * 4000, label };
  });
  let meta: Meta | null = null;
  fetch(`${CHAR_BASE}/characters.json`).then((r) => r.json()).then((m) => { meta = m; }).catch(() => { /* names still show */ });
  for (const h of heroes) {
    const i = new Image(); i.onload = () => { h.img = i; }; i.src = `${CHAR_BASE}/${h.k}.${CHAR_EXT}`;
    if (HD_CHARS) { // the painted sheet is the bare hero: put the starting kit on, layer by layer
      const kit = starterKit(h.k);
      for (const slot of KIT_ORDER) {
        const id = kit[slot];
        if (!id || !GEAR_SLOTS.includes(slot)) continue;
        const gi = new Image(); gi.src = `assets/hd/gear/${h.k}_${id}.webp`;
        h.kit.push(gi);
      }
    }
  }
  const feet = (h: Hero) => ({ x: cx + Math.round(h.slot.dx * squeeze), y: cy + h.slot.dy });
  const heroAt = (ex: number, ey: number): Hero | null => {
    const x = (ex * dpr) / S, y = (ey * dpr) / S;
    let best: Hero | null = null;
    for (const h of heroes) {
      const f = feet(h);
      if (Math.abs(x - f.x) < 20 && y < f.y + 6 && y > f.y - 62 && (!best || f.y > feet(best).y)) best = h;
    }
    return best;
  };

  // ---- embers drifting up from the fire ----
  const embers: { x: number; y: number; vx: number; vy: number; life: number; max: number }[] = [];

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf = 0, fireF = 0, fireT = 0, flick = 0, flame = 1, last = performance.now();
  const lightCv = document.createElement("canvas");
  lightCv.width = lightCv.height = 64;
  const lightCtx = lightCv.getContext("2d", { willReadFrequently: true })!;
  const duration = (a: AnimDef) => (a.frames.length * 1000) / a.fps;

  function drawHero(h: Hero, now: number) {
    if (!meta || !h.img) return;
    const sel = mode === "pick" && h.k === current;
    const dir = sel ? "down" : h.slot.dir;
    const get = (n: string) => meta!.animations[`${n}_${dir}`] ?? meta!.animations[`${n}_down`];
    let a = get(h.anim) ?? get("idle");
    if (!reduce) {
      const t = now - h.t0;
      if (sel) {
        if (h.anim === "idle" && t > 900) { h.anim = SHOWCASE[h.step++ % SHOWCASE.length]; h.t0 = now; }
        else if (h.anim !== "idle" && t > duration(a) + 250) { h.anim = "idle"; h.t0 = now; }
      } else if (h.anim === "idle" && t > h.nextFidget) { h.anim = Math.random() < 0.5 ? "idle2" : "idle3"; h.t0 = now; h.nextFidget = 3000 + Math.random() * 6000; }
      else if (h.anim !== "idle" && t > duration(a)) { h.anim = "idle"; h.t0 = now; }
      a = get(h.anim) ?? get("idle");
    }
    const t = reduce ? 0 : now - h.t0;
    let i = Math.floor(t / (1000 / a.fps));
    i = a.loop ? i % a.frames.length : Math.min(i, a.frames.length - 1);
    const fr = a.frames[i], fw = meta.frameWidth, cols = meta.columns;
    const hp = (S * 4) / 3 * (48 / fw); // device px per sheet pixel
    const f = feet(h);
    const flip = !sel && h.slot.flip;
    // direction from the hero to the heart of the flames (cells), and how strongly the fire reaches it
    const lx = cx - f.x, ly = cy - 22 - (f.y - 26), ld = Math.hypot(lx, ly) || 1;
    const ux = lx / ld, uy = ly / ld;
    const reach = Math.max(0, Math.min(1, 1.25 - ld / 190)) * flame;
    // ground: a cast shadow stretching away from the fire, a contact shadow, and a gold ring under the chosen hero
    const gx = f.x - cx, gy = (f.y - cy) * 2.1, gd = Math.hypot(gx, gy) || 1, sx = gx / gd, sy = gy / gd;
    const len = 20 + 12 * reach;
    for (let y = -16; y <= 16; y++) for (let x = -34; x <= 34; x++) {
      const along = x * sx + y * 2.1 * sy, across = Math.abs(-x * sy + y * 2.1 * sx);
      if (along < 0 || along > len) continue;
      const half = 7 * (1 - along / len) + 2;
      if (across > half || dith(f.x + x, f.y + y) > 0.62 - (along / len) * 0.45) continue;
      g.fillStyle = "rgba(4,3,2,0.5)";
      g.fillRect((f.x + x) * S, (f.y + y) * S, S, S);
    }
    for (let y = -4; y <= 4; y++) for (let x = -16; x <= 16; x++) {
      const e = (x / 16) ** 2 + (y / 4) ** 2;
      if (e > 1) continue;
      const ring = sel && e > 0.55 && dith(f.x + x, f.y + y) < 0.75;
      const contact = (x / 10) ** 2 + (y / 2.6) ** 2 < 1 && dith(f.x + x, f.y + y) < 0.6;
      if (!ring && !contact) continue;
      g.fillStyle = ring ? (e > 0.8 ? "#a8823a" : "#e3bf6a") : "rgba(4,3,2,0.6)";
      g.fillRect((f.x + x) * S, (f.y + y) * S, S, S);
    }
    // the hero, lit by the fire on the sheet's own pixel grid
    lightCtx.clearRect(0, 0, fw, fw);
    lightCtx.save();
    if (flip) { lightCtx.translate(fw, 0); lightCtx.scale(-1, 1); }
    for (const im of [h.img, ...h.kit]) {
      if (im.complete && im.naturalWidth) lightCtx.drawImage(im, (fr % cols) * fw, Math.floor(fr / cols) * fw, fw, fw, 0, 0, fw, fw);
    }
    lightCtx.restore();
    firelight(lightCtx, fw, ux, uy, reach);
    g.save();
    g.translate(f.x * S, f.y * S + S);
    const dw = fw * hp, ox = -dw / 2, oy = -dw * (29 / 32);
    g.drawImage(lightCv, 0, 0, fw, fw, Math.round(ox), Math.round(oy), dw, dw);
    g.restore();
  }

  function placeLabels() {
    for (const h of heroes) {
      const text = labelText[h.k];
      const show = !!text;
      h.label.hidden = !show;
      if (!show) continue;
      if (h.label.textContent !== text) h.label.textContent = text!;
      const f = feet(h);
      h.label.style.left = `${(f.x * S) / dpr}px`;
      h.label.style.top = `${((f.y + 7) * S) / dpr}px`;
      h.label.classList.toggle("sel", mode === "pick" && h.k === current);
      h.label.classList.toggle("hover", mode === "pick" && h.k === hover);
    }
  }

  function frame(now: number) {
    if ((canvas.parentElement as HTMLElement | null)?.style.display === "none") { api.stop(); return; } // in the game now
    raf = requestAnimationFrame(frame);
    const dt = Math.min(100, now - last); last = now;
    if (!reduce && now - fireT > 110) { fireT = now; fireF = (fireF + 1) % FRAMES; flick = Math.random() < 0.35 ? 1 : 0; flame = 0.86 + Math.random() * 0.14; }
    g.imageSmoothingEnabled = false;
    g.drawImage(ground[flick] ?? ground[0], 0, 0, cw * S, ch * S);
    // heroes behind the fire, the fire, then heroes in front of it
    const sorted = [...heroes].sort((a, b) => a.slot.dy - b.slot.dy);
    for (const h of sorted) if (h.slot.dy < 0) drawHero(h, now);
    g.drawImage(strip, fireF * FW, 0, FW, FH, (cx - BASE_X) * S, (cy - BASE_Y) * S, FW * S, FH * S);
    for (const h of sorted) if (h.slot.dy >= 0) drawHero(h, now);
    // embers
    if (!reduce && Math.random() < dt / 60) embers.push({ x: cx + (Math.random() - 0.5) * 24, y: cy - 30 - Math.random() * 20, vx: (Math.random() - 0.5) * 0.01, vy: -0.025 - Math.random() * 0.03, life: 0, max: 1200 + Math.random() * 1800 });
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.life += dt; e.x += e.vx * dt + Math.sin((e.life + i * 300) / 260) * 0.08; e.y += e.vy * dt;
      if (e.life > e.max) { embers.splice(i, 1); continue; }
      const k = 1 - e.life / e.max;
      g.fillStyle = FIRE[Math.max(2, Math.min(8, Math.round(2 + k * 6)))];
      g.fillRect(Math.round(e.x) * S, Math.round(e.y) * S, S, S);
    }
    placeLabels();
  }

  function onMove(e: PointerEvent) {
    if (mode !== "pick") return;
    const h = heroAt(e.clientX, e.clientY);
    hover = h?.k ?? null;
    canvas.style.cursor = h ? "pointer" : "";
  }
  function onClick(e: PointerEvent) {
    if (mode !== "pick") return;
    const h = heroAt(e.clientX, e.clientY);
    if (h) { select(h.k); onPick(h.k); }
  }
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onClick);
  for (const h of heroes) h.label.onclick = () => { if (mode === "pick") { select(h.k); onPick(h.k); } };

  function select(k: ClassKind) {
    if (current === k) return;
    current = k;
    const now = performance.now();
    for (const h of heroes) { h.anim = h.k === k ? "cheer" : "idle"; h.t0 = now; h.step = 0; }
  }

  addEventListener("resize", layout);
  layout();
  raf = requestAnimationFrame(frame);

  const api = {
    select,
    /** "rest": heroes idle round the fire; "pick": click a hero to choose it. Labels per hero (empty = none). */
    setMode(m: FiresideMode, labels: Partial<Record<ClassKind, string>> = {}) {
      mode = m; labelText = labels; hover = null; canvas.style.cursor = "";
      if (m === "pick") for (const h of heroes) if (!labels[h.k]) labelText[h.k] = CLASSES[h.k].name;
      const now = performance.now();
      for (const h of heroes) { if (m === "rest") { h.anim = "idle"; h.t0 = now; } }
    },
    stop() { cancelAnimationFrame(raf); removeEventListener("resize", layout); },
  };
  return api;
}

/** A dark pine: stacked jagged tiers, a near-black body with a warm rim on the side facing the fire. */
function pine(px: (x: number, y: number, c: string) => void, x0: number, y0: number, s: number, k: number, fx: number, fy: number) {
  const h = Math.round(70 * s), w = Math.round(22 * s);
  const toFire = Math.sign(fx - x0) || 1;
  const near = Math.max(0, 1 - Math.hypot(x0 - fx, (y0 - fy) * 2) / 520);
  // shadow on the ground, then the trunk
  for (let x = -w; x <= w; x++) for (let y = -2; y <= 2; y++) if ((x / w) ** 2 + (y / 2.5) ** 2 < 1 && dith(x0 + x, y0 + y) < 0.6) px(x0 + x, y0 + y + 1, "#040504");
  for (let y = -8; y <= 0; y++) for (let x = -2; x <= 2; x++) px(x0 + x, y0 + y, x * toFire > 0 && near > 0.3 ? "#2a1a10" : "#0d0907");
  const tiers = 5;
  for (let t = 0; t < tiers; t++) {
    const top = y0 - 6 - Math.round((h * (t + 1)) / tiers) - 6, bot = y0 - 6 - Math.round((h * t) / tiers) + 2;
    const tw = Math.round(w * (1 - t / (tiers + 1.2)));
    for (let y = top; y <= bot; y++) {
      const f = (y - top) / Math.max(1, bot - top);
      const half = Math.round(tw * f + (hash(k, y, 41) - 0.5) * 3 * f);
      for (let x = -half; x <= half; x++) {
        const side = (x * toFire) / Math.max(1, half);
        let c = "#050807";
        if (x === -half || x === half || y === bot) c = "#020302";
        else if (side > 0.55 && near > 0.15 && dith(x0 + x, y) < near * 1.2) c = near > 0.45 && side > 0.8 ? "#4a2e16" : "#22180e";
        else if (side > 0.1 && dith(x0 + x, y) < 0.25) c = "#0b110c";
        px(x0 + x, y, c);
      }
    }
  }
}

/**
 * Firelight on a hero sprite (in place, on the sheet's pixels): the side turned to the fire is warmed and the
 * outline pixels facing it catch a hot orange rim; the far side sinks into a cool night shadow.
 * (ux, uy) points from the hero to the fire; reach is how strongly the fire lights it (0..1).
 */
function firelight(g: CanvasRenderingContext2D, fw: number, ux: number, uy: number, reach: number) {
  const img = g.getImageData(0, 0, fw, fw), d = img.data;
  const a = (x: number, y: number) => (x < 0 || y < 0 || x >= fw || y >= fw ? 0 : d[(y * fw + x) * 4 + 3]);
  // the sprite's extent, so "facing the fire" is measured across the body
  let x0 = fw, x1 = 0, y0 = fw, y1 = 0;
  for (let y = 0; y < fw; y++) for (let x = 0; x < fw; x++) if (a(x, y) > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < x0) return;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, hw = Math.max(4, (x1 - x0) / 2), hh = Math.max(4, (y1 - y0) / 2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * fw + x) * 4;
    if (d[i + 3] < 40) continue;
    // where the pixel sits across the body, towards (+1) or away from (-1) the fire
    const side = Math.max(-1, Math.min(1, ((x - mx) / hw) * ux + ((y - my) / hh) * uy * 0.6));
    // rim: the first transparent pixel towards the fire is 1, 2 or 3 steps away
    let rim = 0;
    for (let k = 1; k <= 3; k++) if (a(Math.round(x + ux * k), Math.round(y + uy * k)) < 40) { rim = k === 1 ? 1 : k === 2 ? 0.55 : 0.25; break; }
    let back = 0;
    for (let k = 1; k <= 2; k++) if (a(Math.round(x - ux * k), Math.round(y - uy * k)) < 40) { back = k === 1 ? 1 : 0.5; break; }
    // a fire in front of the hero (below it on screen) lights the whole face turned to the viewer too
    const front = Math.max(0, uy) * 0.55 * (1 - Math.max(0, (my - y) / hh) * 0.4);
    const lit = reach * Math.min(1, 0.5 + 0.5 * side + front), shade = reach * (0.35 * Math.max(0, -side) + 0.25 * back * (1 - rim));
    let r = d[i], gg = d[i + 1], b = d[i + 2];
    // night ambient first: everything a little darker and cooler, more so away from the fire
    const amb = 0.8 - shade * 0.6;
    r *= amb; gg *= amb; b *= amb * 1.04;
    // warm fill on the lit half
    r = r * (1 + 0.55 * lit) + 34 * lit; gg = gg * (1 + 0.18 * lit) + 12 * lit; b = b * (1 - 0.25 * lit);
    // hot rim on the edge facing the flames, banded to a few fire tones so it stays pixel-art
    if (rim > 0 && side > -0.2) {
      const k = rim * reach;
      const [cr, cg, cb] = k > 0.6 ? [255, 176, 72] : k > 0.35 ? [232, 112, 36] : [168, 66, 22];
      const m = Math.min(0.85, k * 1.1);
      r = r + (cr - r) * m; gg = gg + (cg - gg) * m; b = b + (cb - b) * m;
    }
    d[i] = Math.min(255, r); d[i + 1] = Math.min(255, gg); d[i + 2] = Math.min(255, b);
  }
  g.putImageData(img, 0, 0);
}
