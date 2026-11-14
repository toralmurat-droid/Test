/**
 * Dark, weathered pixel-art look for speech bubbles and HUD notices, painted like the village bonfire (bonfireArt.ts):
 * a few flat tones per material, ordered Bayer dithering and a dark outline, one colour per art pixel.
 *
 * - `installWeatheredFrames()` paints 9-slice frames (aged bronze, gilded, rusty blood) and hands them to CSS as
 *   `--wf-bronze`, `--wf-gold`, `--wf-blood` (border-image), used by weathered.css.
 * No Phaser here: the start screen needs this file before the game chunk has loaded. Speech bubbles are in speechBubble.ts.
 */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
// Cheap fixed "noise" (periodic every 8 px so frame edges tile seamlessly)
const wear = (x: number, y: number, seed = 0) => ((((x & 7) * 37 + (y & 7) * 91 + seed * 53) ^ 0x5a) * 2654435761 >>> 24) / 255;

export type Ramp = { hi: string; mid: string; lo: string; dark: string; rivet: string; rivetHi: string };
export const RAMPS: Record<"bronze" | "gold" | "blood", Ramp> = {
  bronze: { hi: "#8c7046", mid: "#6a5232", lo: "#45331e", dark: "#2a1d10", rivet: "#a8875a", rivetHi: "#d8bc84" },
  gold: { hi: "#d9b25e", mid: "#a8823a", lo: "#6e5222", dark: "#3e2c12", rivet: "#e8c878", rivetHi: "#fff0b8" },
  blood: { hi: "#9a4632", mid: "#6e2e1e", lo: "#461a10", dark: "#2a0e08", rivet: "#a8875a", rivetHi: "#d8bc84" },
};
export const OUTLINE = "#080504";
const INNER = "#0f0a06";
export const FILL = "#1b140d";
const FILL2 = "#251b12";

/** Paints one weathered rim + dark dithered fill into `g` (art pixels, w x h), with notched corners and rivets. */
export function paintPanel(g: CanvasRenderingContext2D, w: number, h: number, r: Ramp, rivets = true, seed = 0) {
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
    // Thin version (12x12 art px, slice 5, no rivets) for slim strips like the monster bar
    const t = document.createElement("canvas");
    t.width = 12; t.height = 12;
    paintPanel(t.getContext("2d")!, 12, 12, RAMPS[k], false);
    root.style.setProperty(`--wf-thin-${k}`, `url(${t.toDataURL()})`);
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
