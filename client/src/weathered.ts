import Phaser from "phaser";
import { ART_PX } from "./pixelgrid";

/**
 * Dark, weathered pixel-art look for speech bubbles and HUD notices, painted like the village bonfire (bonfireArt.ts):
 * a few flat tones per material, ordered Bayer dithering and a dark outline, one colour per art pixel.
 *
 * - `installWeatheredFrames()` paints 9-slice frames (aged bronze, gilded, rusty blood) and hands them to CSS as
 *   `--wf-bronze`, `--wf-gold`, `--wf-blood` (border-image), used by weathered.css.
 * - `speechBubble()` paints a bubble with its text for over a hero's or villager's head.
 */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
// Cheap fixed "noise" (periodic every 8 px so frame edges tile seamlessly)
const wear = (x: number, y: number, seed = 0) => ((((x & 7) * 37 + (y & 7) * 91 + seed * 53) ^ 0x5a) * 2654435761 >>> 24) / 255;

type Ramp = { hi: string; mid: string; lo: string; dark: string; rivet: string; rivetHi: string };
const RAMPS: Record<"bronze" | "gold" | "blood", Ramp> = {
  bronze: { hi: "#8c7046", mid: "#6a5232", lo: "#45331e", dark: "#2a1d10", rivet: "#a8875a", rivetHi: "#d8bc84" },
  gold: { hi: "#d9b25e", mid: "#a8823a", lo: "#6e5222", dark: "#3e2c12", rivet: "#e8c878", rivetHi: "#fff0b8" },
  blood: { hi: "#9a4632", mid: "#6e2e1e", lo: "#461a10", dark: "#2a0e08", rivet: "#a8875a", rivetHi: "#d8bc84" },
};
const OUTLINE = "#080504";
const INNER = "#0f0a06";
const FILL = "#1b140d";
const FILL2 = "#251b12";

/** Paints one weathered rim + dark dithered fill into `g` (art pixels, w x h), with notched corners and rivets. */
function paintPanel(g: CanvasRenderingContext2D, w: number, h: number, r: Ramp, rivets = true, seed = 0) {
  const px = (x: number, y: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ex = Math.min(x, w - 1 - x), ey = Math.min(y, h - 1 - y), e = Math.min(ex, ey);
    // notched corners: the very corner pixel stays empty, the next one is outline
    if (ex === 0 && ey === 0) continue;
    if (e === 0 || (ex === 1 && ey === 1)) { px(x, y, OUTLINE); continue; }
    if (e <= 2) {
      // rim: lit from the top-left, shadowed bottom-right, with worn and chipped pixels
      const top = y <= 2 && ey <= 2, left = x <= 2 && ex <= 2;
      const bottom = ey <= 2 && y > h / 2, right = ex <= 2 && x > w / 2;
      let c = r.mid;
      if ((top && !right) || (left && !bottom)) c = e === 1 ? r.hi : r.mid;
      else if (bottom || right) c = e === 1 ? r.mid : r.lo;
      const n = wear(x, y, seed);
      if (n > 0.86) c = r.lo; else if (n < 0.07) c = r.dark; else if (n > 0.8 && c === r.mid) c = r.hi;
      px(x, y, c);
      continue;
    }
    if (e === 3) { px(x, y, INNER); continue; }
    // inside: dark umber with a soft dithered vignette and a few grimy specks
    const v = Math.min(1, (e - 3) / 6);
    let c = bayer(x, y) < 0.22 + 0.25 * v ? FILL2 : FILL;
    if (e === 4 && bayer(x, y) < 0.5) c = INNER;
    if (wear(x, y, seed + 3) > 0.97) c = "#2e2216";
    px(x, y, c);
  }
  if (!rivets) return;
  for (const [cx, cy] of [[4, 4], [w - 6, 4], [4, h - 6], [w - 6, h - 6]]) {
    px(cx, cy, r.rivetHi); px(cx + 1, cy, r.rivet); px(cx, cy + 1, r.rivet); px(cx + 1, cy + 1, r.dark);
  }
}

/** 9-slice frames for CSS border-image (24x24 art px, slice 9). */
export function installWeatheredFrames() {
  const root = document.documentElement;
  for (const k of Object.keys(RAMPS) as (keyof typeof RAMPS)[]) {
    const c = document.createElement("canvas");
    c.width = 24; c.height = 24;
    paintPanel(c.getContext("2d")!, 24, 24, RAMPS[k]);
    root.style.setProperty(`--wf-${k}`, `url(${c.toDataURL()})`);
  }
  // Small button frame (12x12, slice 4): raised dark leather with a bronze lip
  const b = document.createElement("canvas");
  b.width = 12; b.height = 12;
  const g = b.getContext("2d")!;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const ex = Math.min(x, 11 - x), ey = Math.min(y, 11 - y), e = Math.min(ex, ey);
    if (ex === 0 && ey === 0) continue;
    let c = e === 0 ? OUTLINE : e === 1 ? (y < 6 && ey === 1) || (x < 6 && ex === 1) ? "#8c7046" : "#45331e"
      : bayer(x, y) < 0.3 ? "#3a2b1c" : "#2c2015";
    if (e === 2 && y > 6 && ey === 2) c = "#1c140c";
    g.fillStyle = c; g.fillRect(x, y, 1, 1);
  }
  root.style.setProperty("--wf-btn", `url(${b.toDataURL()})`);
}

export type BubbleKind = "say" | "shout";
const TEXT_COL: Record<BubbleKind, string> = { say: "#eadfc8", shout: "#ffb49a" };
const RIM: Record<BubbleKind, Ramp> = { say: RAMPS.bronze, shout: RAMPS.blood };

const R = 3; // canvas px per art px: the frame is painted in R x R blocks, the text drawn at that finer grid
const FONT_PX = 18; // ≈ 12 screen px at the default zoom, like the old bubbles
let bubbleN = 0;

/**
 * A speech bubble over a head: a weathered pixel frame with a little tail at the bottom centre, and the text in the
 * pixel font (hard edges, no anti-aliasing). Origin is the tail tip. The texture is freed when the image is destroyed.
 */
export function speechBubble(scene: Phaser.Scene, x: number, y: number, text: string, kind: BubbleKind = "say") {
  const font = `${FONT_PX}px 'Pixelify Sans', monospace`;
  const m = document.createElement("canvas").getContext("2d")!;
  m.font = font;
  // word wrap: at most 300 canvas px of text per line
  const maxW = 300, words = text.split(/\s+/), lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (m.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  const tw = Math.max(...lines.map((l) => m.measureText(l).width), 1);
  const lineH = FONT_PX + 2;
  // panel size in art px: 5 px of rim/padding each side
  const aw = Math.max(14, Math.ceil(tw / R) + 10), ah = Math.ceil((lines.length * lineH) / R) + 9;
  const tail = 4;
  const c = document.createElement("canvas");
  c.width = aw * R; c.height = (ah + tail) * R;
  const art = document.createElement("canvas");
  art.width = aw; art.height = ah + tail;
  const ag = art.getContext("2d")!;
  paintPanel(ag, aw, ah, RIM[kind], false, text.length);
  // tail: a small stepped wedge under the middle, outlined
  const r = RIM[kind], mid = Math.floor(aw / 2);
  for (let i = 0; i < tail; i++) {
    const half = tail - 1 - i, yy = ah - 1 + i;
    for (let dx = -half - 1; dx <= half + 1; dx++) {
      const edge = Math.abs(dx) === half + 1 || i === tail - 1;
      ag.fillStyle = edge ? OUTLINE : Math.abs(dx) === half ? r.lo : i === 0 ? r.mid : FILL;
      ag.fillRect(mid + dx, yy, 1, 1);
    }
  }
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.drawImage(art, 0, 0, c.width, c.height);
  // Text: drawn on its own layer, thresholded to hard pixels, with a dark drop shadow
  const t = document.createElement("canvas");
  t.width = c.width; t.height = c.height;
  const tg = t.getContext("2d")!;
  tg.font = font; tg.textBaseline = "top"; tg.textAlign = "center"; tg.fillStyle = "#fff";
  const top = Math.round((c.height - tail * R - lines.length * lineH) / 2) + 1;
  lines.forEach((l, i) => tg.fillText(l, c.width / 2, top + i * lineH));
  const src = tg.getImageData(0, 0, t.width, t.height).data;
  const out = g.getImageData(0, 0, c.width, c.height), d = out.data;
  const col = [1, 3, 5].map((i) => parseInt(TEXT_COL[kind].slice(i, i + 2), 16));
  const W = t.width;
  const on = (i: number) => src[i * 4 + 3] > 110;
  for (let i = W * t.height - 1; i >= 0; i--) {
    if (on(i)) { d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; continue; }
    const s = i - W - 1; // shadow 1px down-right
    if (s >= 0 && on(s)) { d[i * 4] = 8; d[i * 4 + 1] = 5; d[i * 4 + 2] = 3; }
  }
  g.putImageData(out, 0, 0);
  const key = `__bubble${++bubbleN}`;
  scene.textures.addCanvas(key, c)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  const img = scene.add.image(x, y, key).setOrigin(0.5, 1).setScale(ART_PX / R).setDepth(20000);
  (img as any).__worldText = true; // drawn by the text camera (pixelgrid.ts), so the pixel grid doesn't blur the letters
  img.once(Phaser.GameObjects.Events.DESTROY, () => { if (scene.textures.exists(key)) scene.textures.remove(key); });
  return img;
}
