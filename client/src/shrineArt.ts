import Phaser from "phaser";
import { ART_K as K } from "../../shared/constants";
import { SHRINE_RUNES } from "../../shared/shrine";
import { hiResTexture } from "./smooth";

/**
 * Hand-built pixel art for the Whispering Woods shrine, in the village bonfire's style (bonfireArt.ts): one colour
 * per cell on a half design-unit grid, three-tone stone lit from the top left, ordered dithering, dark outlines.
 * A weathered standing stone carved with a wisp rune rises from a mossy flagstone dais; a stone offering bowl in
 * front holds a cold green-blue wisp flame, and a ring of small rune stones circles the dais.
 *   "shrine_ready": 8 animated frames, everything lit, the wisp flame burning.
 *   "shrine_spent": frame k = k rune stones lit again (0..SHRINE_RUNES-1), the bowl cold: the cooldown at a glance.
 */

const W = 96, H = 128, CX = 48, BY = 106; // cells; BY = the dais centre (the sprite's feet)
export const SHRINE_FW = W / 2, SHRINE_FH = H / 2, SHRINE_FOOT = BY / H;

export const hash = (a: number, b: number, s = 0) => {
  let h = Math.imul(a * 73 + 11 + s * 977, 374761393) ^ Math.imul(b + 5 + s * 131, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
export const vnoise = (x: number, y: number, py: number, s: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const m = (v: number) => ((v % py) + py) % py;
  const a = hash(ix, m(iy), s), b = hash(ix + 1, m(iy), s), c = hash(ix, m(iy + 1), s), d = hash(ix + 1, m(iy + 1), s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const dith = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

/** Wisp fire, dark to bright (the bonfire's ramp, turned to a cold green-blue). */
const WISP = ["#06302e", "#0b4a48", "#0f6b66", "#16928a", "#25b8a6", "#52dcc2", "#9cf3dc", "#e2fff4"];
const WISP_T = [0.2, 0.3, 0.4, 0.5, 0.6, 0.72, 0.84, 0.95];
export const OUT = "#15110e";

export type Px = (x: number, y: number, c: string) => void;
export const stoneCol = (lit: number, tone: number) => {
  const c = (r: number, g: number, b: number) => `rgb(${(r * tone) | 0},${(g * tone) | 0},${(b * tone) | 0})`;
  return lit > 0.5 ? c(170, 168, 156) : lit > 0.05 ? c(122, 120, 110) : lit > -0.45 ? c(84, 83, 77) : c(54, 53, 50);
};

/** The carved wisp rune: an eye-ring with a stem and two swept arms. Returns 2 = groove, 1 = rim, 0 = none. */
function rune(dx: number, dy: number): number {
  const r = Math.hypot(dx, dy * 1.1);
  if (r > 4.2 && r < 6.6) return 2;
  if (r < 1.6) return 2; // pupil
  if (Math.abs(dx) < 1.1 && dy > 6.4 && dy < 17) return 2; // stem
  for (const s of [-1, 1]) { // arms sweeping out and down from the stem
    const t = (dy - 10) / 6, ax = s * (2 + t * t * 6);
    if (t > 0 && t < 1.05 && Math.abs(dx - ax) < 1.1) return 2;
  }
  if (r >= 3.4 && r <= 7.4) return 1;
  return 0;
}

/** The standing stone: tapered, lumpy, chipped at the top, mossy on its north-west shoulder. */
function menhir(px: Px, f: number, N: number, glow: number) {
  const base = BY - 8, top = BY - 96, cx = CX - 1;
  const RY = BY - 64; // rune centre
  for (let y = top - 2; y <= base + 1; y++) for (let x = cx - 22; x <= cx + 22; x++) {
    const t = (base - y) / (base - top); // 0 at foot, 1 at top
    const lump = (vnoise(x * 0.18, y * 0.12, 999, 41) - 0.5) * 3.2;
    let hw = 17 * (1 - 0.38 * t) + lump;
    const chip = t > 0.86 ? (t - 0.86) / 0.14 : 0; // rounded, slanted top
    hw *= Math.sqrt(Math.max(0, 1 - chip * chip));
    const shift = -t * 2.5 + (y < top + 10 ? (x - cx) * 0.0 : 0);
    const dx = x - cx - shift;
    const topY = top + (dx + 17) * 0.22 + (vnoise(x * 0.4, 0, 999, 44) - 0.5) * 3; // slanting broken top edge
    if (Math.abs(dx) > hw || y < topY) continue;
    const edge = hw - Math.abs(dx) < 1.2 || y - topY < 1.2 || y >= base;
    if (edge) { px(x, y, OUT); continue; }
    const nx = dx / hw;
    const n = vnoise(x * 0.35, y * 0.25, 999, 42);
    let lit = -nx * 0.9 + (y - topY < 4 ? 0.6 : 0) + (n - 0.5) * 0.6 + (dith(x, y) - 0.5) * 0.45;
    let c = stoneCol(lit, 0.88 + vnoise(x * 0.1, y * 0.1, 999, 43) * 0.18);
    // weathering: lichen spots, moss on the lit shoulder and at the foot, a long crack
    const moss = vnoise(x * 0.22, y * 0.2, 999, 45);
    if ((t > 0.6 && nx < 0.1 && moss > 0.5) || (t < 0.12 && moss > 0.55)) c = dith(x, y) < 0.5 + (moss - 0.5) ? (lit > 0.2 ? "#5c7a30" : "#3d5822") : "#2c4219";
    else if (hash(x, y, 46) < 0.03) c = "#a7a37a";
    const crackX = cx + 9 - t * 6 + Math.sin(t * 14) * 1.5;
    if (t > 0.18 && t < 0.62 && Math.abs(x - crackX) < 0.6) c = OUT;
    // the carved rune, and the stone around it lit by its glow
    const rr = rune(x - cx - shift * 0.5, y - RY);
    const pulse = 0.5 + 0.5 * Math.sin((f / N) * Math.PI * 2);
    if (rr === 2) c = glow > 0 ? (dith(x, y) < 0.35 + 0.4 * pulse ? WISP[7] : WISP[6]) : "#26231f";
    else if (rr === 1) c = glow > 0 ? (lit > 0 ? "#7fbfa8" : "#4f8476") : lit > 0 ? stoneCol(lit - 0.6, 0.9) : c;
    else if (glow > 0) {
      const d = Math.hypot(x - cx, (y - RY) * 0.8);
      if (d < 13 && dith(x, y) < (1 - d / 13) * (0.55 + 0.25 * pulse)) c = lit > 0 ? "#6aa898" : "#3f6e66";
    }
    px(x, y, c);
  }
}

/** Small rune stone `k` on the dais rim. */
function runeStone(px: Px, x0: number, y0: number, k: number, lit: boolean, f: number, N: number) {
  const w = 3.6 + hash(k, 1, 51) * 1.2, h = 9 + Math.round(hash(k, 2, 51) * 4), lean = (hash(k, 3, 51) - 0.5) * 0.25;
  for (let y = y0 - h - 1; y <= y0 + 1; y++) for (let x = Math.floor(x0 - w - 3); x <= x0 + w + 3; x++) {
    const t = (y0 - y) / h, dx = x - x0 - lean * (y0 - y);
    const hw = w * (1 - 0.3 * t) * (t > 0.8 ? Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.25) ** 2)) : 1);
    if (t < 0 || Math.abs(dx) > hw + 0.01 || t > 1.05) continue;
    if (hw - Math.abs(dx) < 1 || t > 0.97 || y >= y0) { px(x, y, OUT); continue; }
    const lit0 = -dx / hw * 0.9 + (t > 0.85 ? 0.5 : 0) + (dith(x, y) - 0.5) * 0.5;
    let c = stoneCol(lit0, 0.85 + hash(k, 4, 51) * 0.2);
    if (t < 0.2 && hash(x, y, 52) < 0.5) c = "#3d5822";
    // its glyph: a tick and a dot, glowing when lit
    const gx = Math.round(x0 - lean * h * 0.5), gy0 = Math.round(y0 - h * 0.72), gy1 = Math.round(y0 - h * 0.32);
    const glyph = (x === gx && y >= gy0 && y <= gy1) || (x === gx + 1 && y === gy0 + 1) || (x === gx - 1 && y === gy1 - 2);
    if (glyph) c = lit ? (dith(x, y + f) < 0.5 + 0.3 * Math.sin((f / N + k / 8) * Math.PI * 2) ? WISP[7] : WISP[5]) : "#24211d";
    else if (lit && Math.abs(x - gx) <= 2 && y >= gy0 - 1 && y <= gy1 + 1 && dith(x, y) < 0.35) c = "#4f8476";
    px(x, y, c);
  }
}

/** One shrine frame. `wisp` = flame burning (ready); `lit` = rune stones glowing; design units (48x64) in, cells out. */
function paintShrine(g: CanvasRenderingContext2D, f: number, N: number, wisp: boolean, lit: number) {
  g.save();
  g.scale(0.5, 0.5);
  const px: Px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };

  // soft shadow, then the dais: worn flagstones, moss in the joints, grass creeping over the rim
  for (let y = BY - 22; y <= BY + 20; y++) for (let x = 0; x < W; x++) {
    const ex = (x - CX) / 46, ey = (y - BY - 2) / 18, d = ex * ex + ey * ey;
    if (d < 1 && dith(x, y) < (1 - d) * 0.7) px(x, y, "rgba(10,8,6,0.45)");
  }
  for (let y = BY - 17; y <= BY + 16; y++) for (let x = CX - 42; x <= CX + 42; x++) {
    const ex = (x - CX) / 40, ey = (y - BY) / 15.5, d = ex * ex + ey * ey;
    const rim = 1 + (vnoise(x * 0.3, y * 0.5, 999, 61) - 0.5) * 0.25;
    if (d > rim) continue;
    // flagstones: a jittered grid in dais space, each slab its own tone, joints dark or mossy
    const u = (x - CX) / 9 + vnoise(x * 0.2, y * 0.3, 999, 62) * 0.6, v = (y - BY) / 4.5 + vnoise(x * 0.25, y * 0.2, 999, 63) * 0.5;
    const iu = Math.floor(u + (Math.floor(v) % 2) * 0.5), iv = Math.floor(v);
    const fu = u + (Math.floor(v) % 2) * 0.5 - iu, fv = v - iv;
    const joint = fu < 0.1 || fv < 0.16;
    const tone = 0.78 + hash(iu, iv, 64) * 0.3;
    const lit0 = -fu * 0.3 + (1 - fv) * 0.5 + (dith(x, y) - 0.5) * 0.5 - (d > rim - 0.12 ? 0.6 : 0);
    let c = joint ? (vnoise(x * 0.5, y * 0.5, 999, 65) > 0.45 ? "#2f4a1c" : "#1c1814") : stoneCol(lit0 - 0.15, tone);
    if (!joint && hash(iu, iv, 66) < 0.18 && vnoise(x * 0.3, y * 0.3, 999, 67) > 0.5) c = dith(x, y) < 0.5 ? "#4e6a2a" : "#36501e"; // a mossy slab
    if (d > rim - 0.1) c = dith(x, y) < 0.5 ? "#2c4219" : "#3d5822"; // grass over the edge
    px(x, y, c);
  }

  // rune stones around the rim: the back ones behind the standing stone
  const ring: { x: number; y: number; k: number; front: boolean }[] = [];
  // lit in order: from the front-left round the back (a gap behind the standing stone) to the front-right
  const ANGLES = [110, 150, 190, 225, 315, 350, 30, 70];
  for (let k = 0; k < SHRINE_RUNES; k++) {
    const a = (ANGLES[k % ANGLES.length] * Math.PI) / 180;
    ring.push({ x: Math.round(CX + Math.cos(a) * 37), y: Math.round(BY + Math.sin(a) * 13), k, front: Math.sin(a) > -0.1 });
  }
  const runeLit = (k: number) => k < lit;
  ring.filter((s) => !s.front).sort((a, b) => a.y - b.y).forEach((s) => runeStone(px, s.x, s.y, s.k, runeLit(s.k), f, N));

  menhir(px, f, N, wisp ? 1 : 0);

  // offering bowl on a squat pillar, in front of the stone
  const bx = CX + 1, bTop = BY - 12;
  for (let y = bTop; y <= BY + 4; y++) for (let x = bx - 7; x <= bx + 7; x++) {
    const hw = 5 + (y > BY ? 1.5 : 0) + (vnoise(x, y * 0.5, 999, 71) - 0.5) * 0.8;
    const dx = x - bx;
    if (Math.abs(dx) > hw) continue;
    if (hw - Math.abs(dx) < 1 || y === BY + 4) { px(x, y, OUT); continue; }
    px(x, y, stoneCol(-dx / hw * 0.9 + (dith(x, y) - 0.5) * 0.5 - 0.1, 0.85));
  }
  for (let y = bTop - 6; y <= bTop + 2; y++) for (let x = bx - 11; x <= bx + 11; x++) {
    const ex = (x - bx) / 10.5, ey = (y - bTop + 2) / 4, d = ex * ex + ey * ey;
    if (d > 1) continue;
    if (d > 0.72) { px(x, y, y < bTop - 2 ? "#9a968a" : OUT); continue; }
    const inner = ((x - bx) / 8) ** 2 + ((y - bTop + 3) / 2.4) ** 2 < 1;
    if (inner) px(x, y, wisp ? (dith(x, y + f) < 0.5 ? WISP[3] : WISP[2]) : dith(x, y) < 0.4 ? "#4a4640" : "#2a2622"); // embers of wisp light, or cold ash
    else px(x, y, stoneCol(-(x - bx) / 10 * 0.8 + (y - bTop + 2 > 0 ? -0.5 : 0.3) + (dith(x, y) - 0.5) * 0.4, 0.9));
  }

  // the wisp flame: a rising noise field shaped into a tall slim tongue, banded into the wisp palette (loops over N frames)
  if (wisp) {
    const P = 8, rise = (f / N) * P, HF = 30, fy0 = bTop - 4;
    for (let y = fy0 - HF - 6; y <= fy0; y++) for (let x = bx - 14; x <= bx + 14; x++) {
      const h = fy0 - y, ht = h / HF;
      const sway = Math.sin(ht * 3.4 + (f / N) * Math.PI * 2) * ht * ht * 5;
      const uu = (x - bx - sway) / (10 * Math.max(0.05, 1 - ht) ** 0.7 + 1.5);
      const body = 1 - Math.abs(uu) ** 1.6 - ht * 0.85;
      const n = vnoise(x * 0.14, y * 0.09 + rise, P, 81) * 0.6 + vnoise(x * 0.3, y * 0.2 + rise * 2, P * 2, 82) * 0.4;
      const val = body + (n - 0.5) * (1.0 + ht * 0.6) + 0.05 + (dith(x, y) - 0.5) * 0.09;
      let i = -1;
      for (let j = 0; j < WISP.length; j++) if (val > WISP_T[j]) i = j;
      if (i < 0 || (i === 0 && dith(x, y) > 0.5)) continue;
      px(x, y, WISP[i]);
    }
    // motes drifting up around the stone
    for (let k = 0; k < 10; k++) {
      const life = ((f / N) + hash(k, 1, 91)) % 1;
      const x = Math.round(CX + (hash(k, 2, 91) - 0.5) * 60 + Math.sin(life * 7 + k) * 3);
      const y = Math.round(BY - 6 - life * 70 - hash(k, 3, 91) * 10);
      px(x, y, life < 0.4 ? WISP[7] : life < 0.75 ? WISP[5] : WISP[3]);
    }
  }

  ring.filter((s) => s.front).sort((a, b) => a.y - b.y).forEach((s) => runeStone(px, s.x, s.y, s.k, runeLit(s.k), f, N));
  g.restore();
}

export const SHRINE_FRAMES = 8;
/** Builds "shrine_ready" (animated) and "shrine_spent" (one frame per number of rune stones lit). */
export function shrineTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("shrine_ready")) return;
  const N = SHRINE_FRAMES;
  hiResTexture(scene, "shrine_ready", SHRINE_FW * K, SHRINE_FH * K, N, 4, (g, f) => { g.scale(K, K); paintShrine(g, f, N, true, SHRINE_RUNES); });
  hiResTexture(scene, "shrine_spent", SHRINE_FW * K, SHRINE_FH * K, SHRINE_RUNES, 4, (g, f) => { g.scale(K, K); paintShrine(g, 0, N, false, f); });
  scene.anims.create({ key: "shrine_glow", frames: scene.anims.generateFrameNumbers("shrine_ready", { start: 0, end: N - 1 }), frameRate: 8, repeat: -1 });
}
