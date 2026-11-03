import Phaser from "phaser";
import { hiResTexture } from "./smooth";
/**
 * Hand-built pixel bonfire (village square and camp fires): a sunk ash pit ringed with heat-cracked field stones,
 * a leaning pyre of split logs, and a fire field made of looping noise, banded into a fire palette with ordered
 * dithering. Back stones and logs sit behind the flames and front ones in front, so the fire has real depth.
 * Drawn one cell at a time on a half design-unit grid (96x112 cells for the 48x56 frame).
 */

const W = 96, H = 112, CX = 48, BY = 93;

export const hash = (a: number, b: number, s = 0) => {
  let h = Math.imul(a * 73 + 11 + s * 977, 374761393) ^ Math.imul(b + 5 + s * 131, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Value noise that repeats every `py` lattice steps in y, so the rising fire loops over the animation. */
export const vnoise = (x: number, y: number, py: number, s: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const m = (v: number) => ((v % py) + py) % py;
  const a = hash(ix, m(iy), s), b = hash(ix + 1, m(iy), s), c = hash(ix, m(iy + 1), s), d = hash(ix + 1, m(iy + 1), s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const dith = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

export const FIRE = ["#3a0f08", "#6e1a0a", "#a82c0c", "#d84a12", "#f2761c", "#ffa22e", "#ffcf52", "#fff0a8", "#fffbe8"];
export const FIRE_T = [0.2, 0.28, 0.36, 0.45, 0.55, 0.66, 0.77, 0.88, 0.97];

const HOT = new Set([...FIRE.slice(2), "#ffb040", "#f06818", "#ffd060", "#ffc048", "#ff8a24", "#d04a12"]);

type Px = (x: number, y: number, c: string) => void;

function stone(px: Px, x0: number, y0: number, w: number, h: number, k: number, front: boolean) {
  // a lumpy field stone: outline, three-tone shading lit from the top left, fire light on the face turned to the pit
  const tone = 0.8 + hash(k, 1, 7) * 0.35, mossy = hash(k, 2, 7) < 0.3, cracked = hash(k, 3, 7) < 0.35;
  const col = (r: number, g: number, b: number) => `rgb(${(r * tone) | 0},${(g * tone) | 0},${(b * tone) | 0})`;
  for (let y = -h; y <= h; y++) for (let x = -w; x <= w; x++) {
    const bump = 0.85 + 0.3 * vnoise((x0 + x) * 0.5, (y0 + y) * 0.5, 999, k);
    const d = (x / w) ** 2 + (y / h) ** 2;
    if (d > bump) continue;
    const ax = x0 + x, ay = y0 + y;
    if (d > bump * 0.72) { px(ax, ay, "#17120f"); continue; }
    const lit = -x / w * 0.5 - y / h * 0.8 + (dith(ax, ay) - 0.5) * 0.5;
    let c = lit > 0.45 ? col(178, 170, 154) : lit > 0 ? col(128, 121, 110) : lit > -0.5 ? col(88, 83, 76) : col(56, 52, 48);
    if (front && y < -h * 0.2 && x > -w * 0.6 && lit > -0.3) c = lit > 0.3 ? "#e8a060" : "#b0683a"; // firelight on the top facing the pit
    if (!front && y > -h * 0.3 && lit < 0.2) c = y > h * 0.3 ? "#7a3a1c" : "#a85a2a"; // inner face of the far stones, lit by the fire
    if (mossy && y < -h * 0.4 && x < 0 && hash(ax, ay, 9) < 0.7) c = hash(ax, ay, 10) < 0.5 ? "#4e6a2a" : "#36501e";
    if (!front && y > h * 0.1 && hash(ax, ay, 12) < 0.35) c = "#241a14"; // soot
    px(ax, ay, c);
  }
  if (cracked) { const cx = x0 + ((hash(k, 4, 7) - 0.5) * w) | 0; for (let i = 0; i < h + 1; i++) px(cx + (i % 2), y0 - h + 1 + i, "#17120f"); }
}

function log(px: Px, x0: number, y0: number, x1: number, y1: number, r: number, k: number, f: number, N: number, char: number) {
  // a split log: dark bark outline, bark ridges, a lit flank turned to the fire, a charred end with ember cracks
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  const lightSide = nx * (CX - x0) + ny * (BY - 30 - y0) > 0 ? 1 : -1;
  const minX = Math.floor(Math.min(x0, x1) - r - 1), maxX = Math.ceil(Math.max(x0, x1) + r + 1);
  const minY = Math.floor(Math.min(y0, y1) - r - 1), maxY = Math.ceil(Math.max(y0, y1) + r + 1);
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const t = ((x - x0) * dx + (y - y0) * dy) / (L * L), s = ((x - x0) * nx + (y - y0) * ny) / r;
    if (t < 0 || t > 1 || Math.abs(s) > 1) continue;
    if (Math.abs(s) > 0.72 || (t < 0.03 || t > 0.97)) { px(x, y, "#140c08"); continue; }
    const ridge = vnoise(t * L * 0.25, s * 3 + k * 5, 999, k) + (dith(x, y) - 0.5) * 0.3;
    const side = s * lightSide; // >0 toward the fire
    let c = side > 0.3 ? "#8a5a32" : side > -0.2 ? "#6a4226" : "#45291a";
    if (ridge < 0.32) c = "#2e1c12";
    else if (ridge > 0.78 && side > -0.2) c = "#a07040";
    if (t > char) {
      // charred toward the fire: black scales split by glowing cracks that breathe frame to frame
      const g = vnoise(t * L * 0.45, s * 4 + k * 3, 999, k + 40), pulse = 0.5 + 0.5 * Math.sin((f / N) * Math.PI * 2 + k * 1.7 + t * 6);
      c = g < 0.3 ? (pulse > 0.5 ? "#ffb040" : "#f06818") : g < 0.42 ? "#a8300e" : side > 0.2 ? "#3a2a22" : "#1c1410";
      if (t > char + (1 - char) * 0.85 && hash(x, y, f) < 0.4) c = "#ffd060";
    }
    px(x, y, c);
  }
}

/** Draws one bonfire frame. `g` is set to design units (48x56). */
export function paintBonfire(g: CanvasRenderingContext2D, f: number, N: number, flamesOnly = false) {
  g.save();
  g.scale(0.5, 0.5);
  // flamesOnly: just the glowing pixels (for the night copy drawn above the dark tint); anything else erases, so near logs still hide the fire
  const px: Px = flamesOnly
    ? (x, y, c) => { if (HOT.has(c)) { g.fillStyle = c; g.fillRect(x, y, 1, 1); } else if (!c.startsWith("rgba")) g.clearRect(x, y, 1, 1); }
    : (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };

  // ground: soft dark shadow, then a sunk pit of ash, cinders and glowing coals
  for (let y = BY - 22; y <= BY + 18; y++) for (let x = 2; x < W - 2; x++) {
    const ex = (x - CX) / 44, ey = (y - BY - 2) / 17, d = ex * ex + ey * ey;
    if (d < 1 && dith(x, y) < (1 - d) * 0.7) px(x, y, "rgba(10,7,5,0.45)");
  }
  for (let y = BY - 16; y <= BY + 14; y++) for (let x = CX - 34; x <= CX + 34; x++) {
    const ex = (x - CX) / 31, ey = (y - BY) / 12.5, d = ex * ex + ey * ey;
    if (d > 1) continue;
    const n = vnoise(x * 0.35, y * 0.5, 999, 3) + (dith(x, y) - 0.5) * 0.25;
    let c = n < 0.35 ? "#18120e" : n < 0.6 ? "#2a2420" : n < 0.8 ? "#4a4440" : "#77706a";
    if (d < 0.55) {
      const heat = vnoise(x * 0.4, y * 0.6 - f * 0.3, 999, 5) * (1 - d / 0.55) + (dith(x, y) - 0.5) * 0.2;
      const flick = 0.5 + 0.5 * Math.sin((f / N) * Math.PI * 2 + x * 0.7 + y);
      if (heat > 0.55) c = flick > 0.5 ? "#ffc048" : "#ff8a24";
      else if (heat > 0.4) c = "#d04a12";
      else if (heat > 0.28) c = "#6a1c0a";
    }
    px(x, y, c);
  }
  // spilled ash and cinders past the ring
  for (let k = 0; k < 60; k++) {
    const a = hash(k, 1, 21) * Math.PI * 2, d = 33 + hash(k, 2, 21) * 12;
    const x = Math.round(CX + Math.cos(a) * d), y = Math.round(BY + Math.sin(a) * d * 0.4);
    px(x, y, hash(k, 3, 21) < 0.6 ? "#1e1814" : "#6e6860");
    if (hash(k, 4, 21) < 0.3) px(x + 1, y, "#2a221c");
  }

  // stone ring: back half, behind the fire
  const STONES = 19, ring: { x: number; y: number; w: number; h: number; k: number; front: boolean }[] = [];
  for (let k = 0; k < STONES; k++) {
    if (hash(k, 5, 7) < 0.07) continue; // a stone or two fell out
    const a = (k / STONES) * Math.PI * 2 + (hash(k, 6, 7) - 0.5) * 0.22, r = 34 + (hash(k, 7, 7) - 0.5) * 3;
    const w = 4 + Math.round(hash(k, 8, 7) * 3), h = 3 + Math.round(hash(k, 9, 7) * 2);
    ring.push({ x: Math.round(CX + Math.cos(a) * r), y: Math.round(BY + Math.sin(a) * r * 0.42 - h * 0.5), w, h, k, front: Math.sin(a) > 0.05 });
  }
  ring.sort((a, b) => a.y - b.y);
  for (const s of ring) if (!s.front) stone(px, s.x, s.y, s.w, s.h, s.k, false);

  // pyre: logs leaning into a peak; the far ones are drawn before the flames, the near ones after
  const peak = { x: CX + 1, y: BY - 40 };
  const LOGS = [
    { a: -2.6, r: 3.2, top: 0.82 }, { a: -1.9, r: 3.6, top: 0.9 }, { a: -1.2, r: 3.2, top: 0.86 }, { a: -0.5, r: 3.4, top: 0.8 },
    { a: 0.5, r: 3.8, top: 0.7 }, { a: 1.45, r: 4.2, top: 0.62 }, { a: 2.5, r: 3.8, top: 0.74 },
  ];
  const logLine = (l: (typeof LOGS)[number]) => {
    const fx = CX + Math.cos(l.a) * 22, fy = BY + Math.sin(l.a) * 9;
    return [fx, fy, fx + (peak.x - fx) * l.top, fy + (peak.y - fy) * l.top] as const;
  };
  LOGS.forEach((l, k) => { if (Math.sin(l.a) <= 0) { const [a, b, c, d] = logLine(l); log(px, a, b, c, d, l.r, k, f, N, 0.45); } });

  // fire field: rising looping noise shaped into a tall body with licking tongues, banded into the palette
  const P = 8, rise = (f / N) * P; // the noise lattice repeats every P steps in y, so frame N wraps to frame 0
  const HF = 80, fire = new Float32Array(W * H);
  for (let y = BY - 96; y <= BY - 2; y++) for (let x = CX - 32; x <= CX + 32; x++) {
    const h = BY - 4 - y, ht = h / HF;
    if (ht < -0.05) continue;
    const sway = Math.sin(ht * 3.2 + (f / N) * Math.PI * 2) * ht * ht * 7;
    const u = (x - CX - sway) / (27 * Math.max(0.05, 1 - ht) ** 0.6 + 2);
    const body = 1 - Math.abs(u) ** 1.5 - ht * 0.8;
    const n1 = vnoise(x * 0.11, y * 0.075 + rise, P, 11), n2 = vnoise(x * 0.23, y * 0.15 + rise * 2, P * 2, 12), n3 = vnoise(x * 0.5, y * 0.32 + rise * 4, P * 4, 13);
    const n = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
    const v = body + (n - 0.5) * (1.05 + ht * 0.6) + 0.04 + (dith(x, y) - 0.5) * 0.09;
    let i = -1;
    for (let j = 0; j < FIRE.length; j++) if (v > FIRE_T[j]) i = j;
    if (i < 0) continue;
    if (i === 0 && dith(x, y) > 0.55) continue; // ragged smoky outer edge
    i = Math.min(i, 7);
    if (y >= 0 && y < H) fire[y * W + x] = i;
    px(x, y, FIRE[i]);
  }
  // loose licks of flame torn off the top, and embers
  for (let k = 0; k < 7; k++) {
    const life = ((f / N + hash(k, 1, 31)) % 1), x = Math.round(CX + (hash(k, 2, 31) - 0.5) * 30 + Math.sin(life * 6 + k) * 3);
    const y = Math.round(BY - 62 - life * 30 - hash(k, 3, 31) * 6);
    const s = life < 0.5 ? 2 : 1, c = life < 0.35 ? "#ffcf52" : life < 0.7 ? "#f2761c" : "#a82c0c";
    for (let yy = 0; yy < s + 1; yy++) for (let xx = 0; xx < s; xx++) px(x + xx, y + yy, c);
  }
  for (let k = 0; k < 14; k++) {
    const life = ((f / N) * 2 + hash(k, 4, 33)) % 1, x = Math.round(CX + (hash(k, 5, 33) - 0.5) * 50 + Math.sin(life * 9 + k) * 4);
    const y = Math.round(BY - 40 - life * 62);
    px(x, y, life < 0.4 ? "#fff0a8" : life < 0.75 ? "#ffa22e" : "#a82c0c");
  }

  // near logs, over the flames, then the front stones
  LOGS.forEach((l, k) => { if (Math.sin(l.a) > 0) { const [a, b, c, d] = logLine(l); log(px, a, b, c, d, l.r, k + 8, f, N, 0.5); } });
  // flames lick up over the near logs: the hotter, upper tongues come back in front, torn into strips by noise
  for (let y = BY - 60; y <= BY - 10; y++) for (let x = CX - 30; x <= CX + 30; x++) {
    const i = fire[y * W + x];
    if (i < 3) continue;
    const up = (BY - 10 - y) / 50, m = vnoise(x * 0.3, y * 0.12 + rise * 2, P * 2, 17);
    if (m < 0.62 - up * 0.45) continue;
    px(x, y, FIRE[Math.max(1, i - 1)]);
  }
  // a half-burnt log lying across the front, and one rolled out against the stones
  log(px, CX - 20, BY + 6, CX + 14, BY + 2, 3.4, 20, f, N, 0.55);
  log(px, CX + 18, BY + 10, CX + 30, BY + 4, 2.6, 21, f, N, 0.7);
  for (const s of ring) if (s.front) stone(px, s.x, s.y, s.w, s.h, s.k, true);
  g.restore();
}

/** Four 16x16 pixel smoke puffs: lumpy dithered blobs, lit from the top left, soft ragged edges. */
export function smokeTexture(scene: Phaser.Scene) {
  if (scene.textures.exists("smoke_px")) return;
  const R = 16, C = R * 2; // two cells per px, like the fire
  hiResTexture(scene, "smoke_px", R, R, 4, 4, (g, f) => {
    g.scale(0.5, 0.5);
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const dx = (x - C / 2 + 0.5) / (C / 2), dy = (y - C / 2 + 0.5) / (C / 2);
      const lump = (vnoise(x * 0.22 + f * 9, y * 0.22, 999, 60 + f) - 0.5) * 0.55 + (vnoise(x * 0.5, y * 0.5 + f * 5, 999, 70 + f) - 0.5) * 0.2;
      const d = Math.sqrt(dx * dx + dy * dy) + lump;
      if (d > 0.95) continue;
      const t = dith(x, y);
      if (d > 0.78 && t > 0.35) continue; // ragged dithered rim
      if (d > 0.6 && t > 0.75) continue;
      const lit = -dx * 0.6 - dy * 0.8 + lump;
      g.fillStyle = lit > 0.45 ? "#a8a29a" : lit > 0 ? "#8a847c" : lit > -0.45 ? "#6c6761" : "#524e4a";
      g.fillRect(x, y, 1, 1);
    }
  });
}
