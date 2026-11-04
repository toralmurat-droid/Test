import type { Pen } from "./worldProps";

/**
 * The Hollow Throne (shared/map.ts HOLLOW): Ostrevar's broken throne on its stepped dais with two green-fire
 * braziers, the crown-stones that ring the clearing, and the three ward-stones the hero breaks (quest objects).
 * Same hand as the village bonfire and the other world props: 1.5 texels per world px, flat colour steps with
 * ordered dithering, light from the top left, dark weathered palette; the 1px outline comes from sheet().
 */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dith = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];
const step = (pal: number[], v: number, x: number, y: number) => {
  const c = Math.max(0, Math.min(pal.length - 1, v)), i = Math.floor(c);
  return pal[Math.min(pal.length - 1, c - i > dith(x, y) ? i + 1 : i)];
};
const hash = (x: number, y: number, s: number) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const noise = (x: number, y: number, s: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};

const STONE = [0x16141a, 0x26242b, 0x38363d, 0x4c4a50, 0x625f63, 0x7c7a7a, 0x9a9690]; // old cold granite
const MOSS = [0x1a2414, 0x2a3a1c, 0x3e5226, 0x56682e];
const GOLD = [0x3a2a10, 0x6a4c1c, 0x9a7430, 0xc8a050, 0xf0d890];
const GLOAM = [0x0e2a10, 0x1f5216, 0x3e8a22, 0x6fdc3a, 0xc8ff8a, 0xf4ffe0];
const IRON = [0x18191d, 0x2c2f35, 0x4a4f57, 0x737a84];
const ASH = [0x2a2622, 0x463f38, 0x645a50];

export const FRAMES = 6;

/** Rough stone surface: shade from light direction, grain, cracks and moss toward the bottom. */
function rock(p: Pen, x: number, y: number, lv: number, seed: number, mossFrom = 1) {
  let v = lv + (noise(x * 0.35, y * 0.35, seed) - 0.5) * 1.3 + (noise(x * 1.1, y * 1.1, seed + 1) - 0.5) * 0.6;
  const crack = noise(x * 0.22, y * 0.9, seed + 2);
  if (crack > 0.47 && crack < 0.5) v -= 2;
  let c = step(STONE, v, x, y);
  if (noise(x * 0.3, y * 0.3, seed + 3) > mossFrom) c = step(MOSS, v * 0.55, x, y);
  p.px(x, y, c);
}

// ---------------------------------------------------------------------------------------------- the throne
export const THRONE_W = 108, THRONE_H = 120;

export function throne(p: Pen, f: number) {
  const t = (f / FRAMES) * Math.PI * 2, W = THRONE_W, H = THRONE_H, cx = W / 2;
  // --- the dais: three worn steps, seen from the front, each a little set back ---
  const steps = [{ y0: H - 12, y1: H - 1, hw: 52 }, { y0: H - 22, y1: H - 12, hw: 44 }, { y0: H - 31, y1: H - 22, hw: 37 }];
  for (const [si, s] of steps.entries()) {
    for (let y = s.y0; y <= s.y1; y++) for (let x = Math.round(cx - s.hw); x <= cx + s.hw; x++) {
      const top = y < s.y0 + 3, edge = Math.abs(x - cx) > s.hw - 2;
      if (edge && hash(x, y, 11 + si) < 0.35) continue; // chipped corners
      if (hash(x >> 3, si, 12) < 0.12 && y > s.y1 - 3) continue; // broken lip
      const lv = top ? 5.2 - (x - cx + s.hw) / (s.hw * 2) * 1.2 : 2.8 - (y - s.y0) / (s.y1 - s.y0) * 1.4 - (x > cx ? 0.5 : 0);
      rock(p, x, y, lv, 20 + si, 0.74 - (y - s.y0) * 0.01);
      if (!top && (x + si * 7) % 19 === 0) p.px(x, y, STONE[1]); // block joints
    }
  }
  // --- the throne: a high back shaped like a five-pointed crown, the left point snapped off ---
  const seatY = H - 50, backTop = 8;
  const backHW = 26;
  const point = (x: number) => { // top edge of the back: five points
    const k = (x - (cx - backHW)) / (backHW * 2), i = Math.round(k * 4), d = Math.abs(k * 4 - i);
    const hgt = [26, 18, 34, 18, 26][Math.max(0, Math.min(4, i))];
    return backTop + 34 - hgt * (1 - d * 1.6) - (i === 2 ? 0 : 4);
  };
  for (let x = cx - backHW; x <= cx + backHW; x++) {
    let topY = Math.round(point(x));
    if (x < cx - backHW + 11) topY = Math.max(topY, backTop + 24 + Math.round(hash(x, 0, 30) * 4)); // the snapped point
    for (let y = topY; y < seatY + 4; y++) {
      const u = (x - (cx - backHW)) / (backHW * 2);
      const rim = x < cx - backHW + 3 || x > cx + backHW - 3 || y < topY + 2;
      let lv = 4.2 - u * 2.2 - (y - topY) / 60;
      if (rim) lv += 0.9;
      // a recessed panel inside the frame, darker, with the crown carved on it
      const inPanel = Math.abs(x - cx) < backHW - 6 && y > backTop + 30 && y < seatY - 2;
      if (inPanel) lv -= 1.4;
      rock(p, x, y, lv, 40, 0.8);
    }
  }
  // carved crown on the back panel, gold leaf mostly worn off
  const crownY = backTop + 40;
  for (let x = -10; x <= 10; x++) for (let y = 0; y < 9; y++) {
    const spike = [0, 4, 8].some((c) => Math.abs(Math.abs(x) - c) < 1.5 - y * 0.15) || y > 4;
    if (!spike) continue;
    const gilt = hash(x + 40, y, 41) < 0.55;
    p.px(cx + x, crownY + y, gilt ? step(GOLD, 3 - y * 0.25 - (x > 0 ? 0.6 : 0), cx + x, crownY + y) : STONE[2]);
  }
  // the gem in the middle point: the Gloam's green, pulsing
  const pulse = 0.5 + 0.5 * Math.sin(t);
  const gy = backTop + 14;
  for (let y = -4; y <= 4; y++) for (let x = -3; x <= 3; x++) {
    const d = Math.abs(x) / 3 + Math.abs(y) / 4;
    if (d > 1) continue;
    p.px(cx + x, gy + y, step(GLOAM, 4.6 - d * 2.4 + pulse * 0.6 - (x > 0 ? 0.5 : 0), cx + x, gy + y));
  }
  for (let r = 5; r < 9; r++) for (let a = 0; a < 24; a++) { const ang = (a / 24) * Math.PI * 2; if (hash(a, r, f) < 0.25 + pulse * 0.2) p.px(cx + Math.cos(ang) * r, gy + Math.sin(ang) * r * 1.2, GLOAM[3], 0.3 - (r - 5) * 0.06); }
  p.rect(cx - 4, gy + 5, 9, 2, GOLD[1]); p.rect(cx - 3, gy - 6, 7, 1, GOLD[2]); // its setting
  // --- seat and armrests with skull-carved ends ---
  for (let y = seatY; y < seatY + 9; y++) for (let x = cx - 30; x <= cx + 30; x++) {
    const top = y < seatY + 3;
    rock(p, x, y, top ? 5 - (x - cx + 30) / 60 : 2.4 - (x > cx ? 0.6 : 0), 50, 0.85);
  }
  for (const sg of [-1, 1]) {
    const ax = cx + sg * 32;
    for (let y = seatY - 16; y < seatY + 12; y++) for (let x = -5; x <= 5; x++) {
      if (sg < 0 && y < seatY - 8 && x < -1) continue; // left arm broken
      rock(p, ax + x, y, (y < seatY - 13 ? 5 : 3.4) - (x + 5) / 10 * 1.6, 60 + sg, 0.8);
    }
    // the skull knob on the right arm (the left one lies broken on the step)
    const kx = sg > 0 ? ax : ax - 10, ky = sg > 0 ? seatY - 20 : H - 36;
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x / 16 + y * y / 18 <= 1) p.px(kx + x, ky + y, step([0x6a6252, 0x8e8672, 0xb8ae94, 0xd8d0b8], 3 - (x + y + 6) / 6, kx + x, ky + y));
    p.px(kx - 2, ky, 0x141014); p.px(kx + 1, ky, 0x141014); p.px(kx - 1, ky + 1, 0x141014); p.px(kx, ky + 1, 0x141014);
    p.rect(kx - 2, ky + 3, 5, 1, 0x3a342c);
  }
  // --- the Gloam's ooze welling from under the seat and dripping down the steps ---
  for (let i = 0; i < 26; i++) {
    const x = cx - 20 + i * 1.6 + Math.round(hash(i, 0, 70) * 2);
    const len = 6 + Math.round(18 * hash(i, 1, 71) * (1 - Math.abs(i - 13) / 16)) + (i % 7 === 3 ? Math.round((1 + Math.sin(t + i)) * 2) : 0);
    for (let j = 0; j < len; j++) {
      const y = seatY + 8 + j;
      p.px(x, y, j === len - 1 ? GLOAM[4] : step(GLOAM, 3.2 - j / len * 1.6 + (i % 3 === 0 ? 0.4 : 0), Math.round(x), y));
    }
  }
  // a pool of it on the top step
  for (let x = -24; x <= 24; x++) for (let y = 0; y < 4; y++) {
    if (x * x / 576 + y * y / 9 > 1 || hash(x, y, 72) < 0.1) continue;
    p.px(cx + x, H - 30 + y, step(GLOAM, 2.6 + Math.sin(t + x * 0.3) * 0.4 - y * 0.3, cx + x, H - 30 + y));
  }
  // dead ivy creeping up the back and over the steps
  for (const [x0, y0, len, seed] of [[cx - backHW + 2, seatY + 2, 40, 80], [cx + backHW - 3, seatY, 30, 81], [cx - 46, H - 10, 22, 82]] as const) {
    let x = x0, y = y0;
    for (let i = 0; i < len; i++) {
      y -= 1; x += Math.round((noise(i * 0.3, 0, seed) - 0.5) * 3);
      p.px(x, y, i % 5 === 0 ? MOSS[3] : MOSS[1]);
      if (i % 4 === 1) { p.px(x + 1, y, MOSS[2]); p.px(x + 2, y + 1, ASH[1]); }
    }
  }
  // rubble and the fallen skull knob on the steps
  for (const [x, y, r] of [[cx - 46, H - 15, 3], [cx + 40, H - 26, 2], [cx + 50, H - 4, 3], [cx - 30, H - 5, 2]] as const)
    for (let j = -r; j <= r; j++) for (let i = -r - 1; i <= r + 1; i++) if (i * i / ((r + 1) * (r + 1)) + j * j / (r * r) <= 1) rock(p, x + i, y + j, 4.4 - (i + j) / r, 90);
  // --- two braziers burning green either side ---
  for (const sg of [-1, 1]) brazier(p, cx + sg * 47, H - 38, t + sg);
}

function brazier(p: Pen, bx: number, by: number, t: number) {
  // tripod legs
  for (const dx of [-5, 0, 5]) p.line(bx + dx * 0.4, by, bx + dx, by + 22, IRON[dx < 0 ? 3 : dx > 0 ? 1 : 2]);
  // iron bowl
  for (let y = -4; y <= 1; y++) for (let x = -8; x <= 8; x++) {
    if (x * x / 64 + (y + 1) * (y + 1) / 12 > 1) continue;
    p.px(bx + x, by + y, step(IRON, 3 - (x + 8) / 16 * 2 - (y > -1 ? 0.8 : 0), bx + x, by + y));
  }
  p.rect(bx - 8, by - 4, 17, 1, IRON[3]);
  // green flame: layered tongues, flickering
  for (let k = 0; k < 18; k++) {
    const ph = t * 1 + k * 0.9, hgt = 10 + 6 * Math.sin(ph) * 0.5 + (k % 3) * 2;
    const x0 = bx - 6 + (k % 7) * 2, sway = Math.sin(ph * 1.3) * 1.5;
    for (let j = 0; j < hgt; j++) {
      const q = j / hgt, x = Math.round(x0 + sway * q + (k % 2 ? 1 : -1) * q * 1.5);
      if (q > 0.7 && hash(k, j, Math.round(t * 10)) < 0.4) continue;
      p.px(x, by - 5 - j, step(GLOAM, 5 - q * 3.6 - (k % 4 === 0 ? 0.6 : 0), x, by - 5 - j));
    }
  }
  for (let i = 0; i < 3; i++) { const y = by - 20 - ((t * 6 + i * 7) % 14), x = bx + Math.sin(t * 2 + i * 2) * 4; p.px(x, y, GLOAM[4], 0.8); } // sparks
}

// ------------------------------------------------------------------------------------- crown-stones and wards
export const STONE_W = 30, STONE_H = 54;

/**
 * A standing stone of the ring. `kind` 0 = a plain crown-stone (variant `v` changes height/lean), 1 = a ward-stone
 * still holding (iron bands, green runes burning), 2 = a broken ward-stone (top snapped off beside it, runes dead).
 */
export function standingStone(p: Pen, f: number, kind: 0 | 1 | 2, v = 0) {
  const t = (f / FRAMES) * Math.PI * 2, W = STONE_W, H = STONE_H, cx = W / 2;
  const hgt = kind === 2 ? 28 : kind === 1 ? 48 : [44, 38, 47][v % 3], lean = kind === 1 ? 0 : [1.5, -2, 0.5][v % 3];
  const base = H - 2, seed = 100 + v * 7 + kind * 13;
  // ground: ash and broken turf round its foot
  for (let x = -11; x <= 11; x++) for (let y = -2; y <= 1; y++) if (x * x / 121 + y * y / 4 <= 1 && hash(x, y, seed) < 0.7) p.px(cx + x, base + y, step(ASH, 1.4 + hash(x, y, seed + 1), cx + x, base + y));
  const halfW = (y: number) => { const k = (base - y) / hgt; return 8.5 - k * 2.5 + (k > 0.85 ? -(k - 0.85) * 30 : 0) + (noise(y * 0.3, 0, seed) - 0.5) * 2; };
  const topAt = base - hgt;
  for (let y = topAt; y <= base; y++) {
    const k = (base - y) / hgt, hw = halfW(y), off = lean * k * 2;
    let top = y;
    if (kind === 2 && y < topAt + 4) { // snapped: a jagged break
      top = y;
    }
    for (let x = Math.round(cx - hw + off); x <= Math.round(cx + hw + off); x++) {
      if (kind === 2 && y < topAt + 5 && noise(x * 0.6, 0, seed + 9) * 5 > (y - topAt) + 1) continue;
      const u = (x - (cx - hw + off)) / (hw * 2);
      const lv = 5 - u * 3 - (y - topAt) / hgt * 0.8 + (u < 0.15 ? 0.6 : 0);
      rock(p, x, top, lv, seed, 0.66 - k * 0.2);
    }
  }
  // carved crown sigil, and for wards a column of runes
  const sy = topAt + 9, glow = kind === 1;
  const lit = (lv: number, x: number, y: number) => glow ? step(GLOAM, lv + 0.6 * Math.sin(t + y * 0.4), x, y) : STONE[1];
  if (kind !== 2) for (let x = -4; x <= 4; x++) for (let y = 0; y < 5; y++) {
    if (!([0, 2, 4].some((c) => Math.abs(Math.abs(x) - c) < 0.8 && y < 3) || y >= 3)) continue;
    p.px(cx + x + Math.round(lean), sy + y, glow ? lit(4, cx + x, sy + y) : STONE[1]);
  }
  if (kind !== 0) for (let r = 0; r < 4; r++) {
    const ry = topAt + (kind === 2 ? 8 : 17) + r * 6, rx = cx + (r % 2 ? 1 : -1);
    const glyph = [[0, 0], [1, 1], [0, 2], [-1, 1], [0, 3]].slice(0, 3 + (r % 3));
    for (const [gx, gy] of glyph) p.px(rx + gx, ry + gy, kind === 1 ? lit(4.5, rx + gx, ry + gy) : STONE[1]);
  }
  if (kind === 1) {
    // two iron bands with a chain hanging between, and a soft green haze
    for (const by of [topAt + 14, base - 12]) for (let x = -9; x <= 9; x++) { const hw = halfW(by); if (Math.abs(x) <= hw + 0.5) { p.px(cx + x, by, step(IRON, 3 - (x + 9) / 18 * 2, cx + x, by)); p.px(cx + x, by + 1, IRON[0]); } }
    for (let i = 0; i < 9; i++) p.px(cx + 9 + Math.sin(i * 0.4) * 1.2, topAt + 15 + i * 3, i % 2 ? IRON[1] : IRON[3]);
    for (let i = 0; i < 14; i++) {
      const a = hash(i, f, seed) * Math.PI * 2, r = 9 + hash(i, f + 1, seed) * 5;
      p.px(cx + Math.cos(a) * r, topAt + 20 + Math.sin(a) * r * 1.6, GLOAM[3], 0.35);
    }
  }
  if (kind === 2) {
    // the broken top lying at its foot, runes dark; chips scattered
    for (let y = -4; y <= 4; y++) for (let x = -9; x <= 9; x++) if (x * x / 81 + y * y / 16 <= 1) rock(p, cx + 7 + x, base - 4 + y, 4.6 - (x + y + 13) / 13 * 2, seed + 5, 0.8);
    for (const [x, y] of [[-9, -1], [-7, 1], [12, 0], [10, -6]] as const) p.rect(cx + x, base + y, 2, 1, STONE[4]);
  }
}
