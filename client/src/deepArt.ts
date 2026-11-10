import Phaser from "phaser";
import { BONE, sheet, type Pen } from "./worldProps";
import { iso } from "./isoBox";

/**
 * Props of the two deep dungeons (shared/dungeon.ts), painted in code at the dungeon's 1.5 texels per world px:
 * the Lantern Crypt's stone sarcophagi, votive candles and skull stacks, and the Undercity's sandstone pillars,
 * water jars and sand drifts. Light from the top left like everything else.
 */
const hash = (x: number, y: number, s: number) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Cold crypt stone and warm sandstone, darkest to lightest. */
const GREY = [0x1c1c22, 0x2c2c34, 0x3e3e48, 0x52525c, 0x686872, 0x80808a, 0x9a9aa2];
const SAND = [0x2a1e14, 0x46321e, 0x64482a, 0x84623a, 0xa47e4c, 0xc29c62, 0xdcb87c];
const WAX = [0x8a7a5a, 0xc8b88e, 0xeae0c0];
const FLAME = [0xfff2b0, 0xffd36a, 0xffa040, 0xe0641e];

export const SARC = { w: 64, h: 52 }, CANDLES = { w: 30, h: 30, frames: 4 }, SKULLS = { w: 40, h: 40 };
export const PILLAR = { w: 34, h: 82 }, JAR = { w: 24, h: 30 }, DRIFT = { w: 70, h: 34 };

/** Weathered stone: a palette step from a noisy shade (s 0..1), chipped now and then. */
const stone = (P: number[], s: number, u: number, v: number, seed: number) => {
  const n = s + (hash(Math.floor(u * 2), Math.floor(v * 2), seed) - 0.5) * 0.18;
  return P[Math.max(0, Math.min(P.length - 1, Math.round(n * (P.length - 1))))];
};

/** A stone sarcophagus with a carved lid (v 0), or its lid shoved aside and the dark inside showing (v 1). */
function sarcophagus(p: Pen, v: number) {
  const I = iso(p, 30, 34), L = 26, W = 12;
  I.box(0, L, 0, W, 0, 10, (a, b) => stone(GREY, 0.62, a, b, 3), (a, z) => stone(GREY, z > 8 ? 0.62 : 0.5, a, z, 4), (b, z) => stone(GREY, 0.3, b, z, 5));
  // carved panels on the long side
  for (let a = 3; a < L - 2; a += 6) for (let z = 2; z < 8; z += 0.5) I.put(a, W, z, GREY[2]);
  if (v === 0) {
    I.box(-1, L + 1, -1, W + 1, 10, 12.5, (a, b) => stone(GREY, 0.75, a, b, 6), (a, z) => stone(GREY, 0.55, a, z, 7), (b, z) => stone(GREY, 0.35, b, z, 8));
    // the effigy: a hooded monk with folded hands, raised on the lid
    I.box(3, L - 4, 3, W - 3, 12.5, 14.5, (a, b) => stone(GREY, a < 6 ? 0.92 : 0.82, a, b, 9), GREY[4], GREY[2]);
    I.box(L - 9, L - 7, 4, W - 4, 14.5, 15.5, GREY[6], GREY[4], GREY[2]); // folded hands
  } else {
    I.box(1, L - 1, 1, W - 1, 9.5, 10, 0x08080a, 0x08080a, 0x08080a); // the dark inside
    for (let k = 0; k < 6; k++) I.put(4 + k * 3, 4 + (k % 2) * 3, 10, BONE.mid); // bones in the dark
    I.box(-4, L - 3, W - 2, W + 11, 0, 2.5, (a, b) => stone(GREY, 0.72, a, b, 10), (a, z) => stone(GREY, 0.52, a, z, 11), (b, z) => stone(GREY, 0.32, b, z, 12)); // the lid on the floor, cracked
    for (let a = 4; a < 16; a++) I.put(a, W + 3 + Math.floor(a / 5), 2.5, GREY[0]);
  }
}

/** A cluster of votive candles on a puddle of old wax (4 flicker frames). */
function candles(p: Pen, f: number) {
  const { w, h } = CANDLES;
  for (let y = h - 9; y < h - 2; y++) for (let x = 3; x < w - 3; x++) {
    const r = ((x - w / 2) / 12) ** 2 + ((y - (h - 5.5)) / 3.4) ** 2;
    if (r < 1) p.px(x, y, r < 0.5 ? WAX[1] : WAX[0]);
  }
  const C: [number, number, number][] = [[9, 12, 3], [15, 8, 4], [21, 13, 3], [12, 16, 2], [19, 17, 2]];
  C.forEach(([x, top, cw], i) => {
    const base = h - 6;
    for (let y = top; y < base; y++) for (let k = 0; k < cw; k++) p.px(x + k, y, k === 0 ? WAX[2] : k === cw - 1 ? WAX[0] : WAX[1]);
    p.px(x + (cw >> 1), top - 1, 0x2a2018); // wick
    const fl = (f + i) % 4, fh = 3 + (fl % 2), sway = fl === 3 ? 1 : fl === 1 ? -1 : 0;
    for (let j = 0; j < fh; j++) p.px(x + (cw >> 1) + (j === fh - 1 ? sway : 0), top - 2 - j, FLAME[Math.min(3, j === 0 ? 0 : j)]);
    p.px(x + (cw >> 1) + 1, top - 2, FLAME[1], 0.6);
  });
}

/** Skulls stacked into a heap against a wall, the ossuary's way. */
function skullStack(p: Pen) {
  const { w, h } = SKULLS;
  const skull = (cx: number, cy: number, s: number) => {
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      if (x * x / 10 + y * y / 9 > 1) continue;
      p.px(cx + x, cy + y, x + y < -2 ? BONE.hi : x + y > 2 ? BONE.lo : BONE.mid);
    }
    p.px(cx - 1, cy, 0x140e0a); p.px(cx + 1, cy, 0x140e0a); p.px(cx - 1, cy + 1, 0x241a12); p.px(cx + 1, cy + 1, 0x241a12); // eyes
    p.px(cx, cy + 2, 0x241a12); // nose
    if (hash(cx, cy, s) < 0.3) p.px(cx + 2, cy - 2, 0x5a4a38); // a crack
  };
  const rows = [[6, 5], [5, 5], [4, 5], [3, 5], [2, 5]];
  rows.forEach(([n], r) => { for (let k = 0; k < n; k++) skull(w / 2 - (n - 1) * 3.5 + k * 7, h - 6 - r * 6, r * 13 + k); });
}

/** A sandstone pillar of the old bazaar: fluted, cracked, its top broken off (v 0) or still carrying a lotus capital (v 1). */
function pillar(p: Pen, v: number) {
  const { h } = PILLAR, I = iso(p, 17, h - 10), R = 5, top = v === 0 ? 38 + hash(v, 1, 2) * 8 : 60;
  I.box(-R - 2, R + 2, -R - 2, R + 2, 0, 3, SAND[4], SAND[3], SAND[1]); // plinth
  for (let z = 3; z < top; z += 0.5) for (let a = -R; a <= R; a += 0.5) {
    const flute = Math.round((a + R) * 1.2) % 3 === 0;
    const s = 0.55 + (a < 0 ? 0.15 : -0.1) - (flute ? 0.12 : 0);
    I.put(a, R, z, stone(SAND, s, a, z, 20 + v));
    I.put(R, a, z, stone(SAND, 0.28 - (flute ? 0.08 : 0), a, z, 22 + v));
  }
  if (v === 0) for (let a = -R; a <= R; a += 0.5) for (let b = -R; b <= R; b += 0.5) { // the jagged break
    const z = top - hash(Math.floor(a * 2), Math.floor(b * 2), 31) * 4;
    I.put(a, b, z, stone(SAND, 0.7, a, b, 32));
  }
  else I.box(-R - 3, R + 3, -R - 3, R + 3, top, top + 5, SAND[6], SAND[4], SAND[2]); // the capital
  for (let z = 10; z < top - 6; z += 7) I.put(-1, R, z + hash(v, z, 7) * 4, SAND[1]); // cracks
}

/** A water jar of the bazaar, whole (v 0) or broken open with its sherds about (v 1). */
function jar(p: Pen, v: number) {
  const { w, h } = JAR, cx = w / 2;
  const prof = (t: number) => (t < 0.12 ? 3 : t < 0.22 ? 2.5 : 3 + Math.sin((t - 0.22) / 0.78 * Math.PI) * 6.5);
  const H = h - 6;
  for (let y = 0; y < H; y++) {
    if (v === 1 && y < H * 0.45 && hash(y, 0, 41) < 0.8) continue; // broken top
    const t = y / H, r = prof(t);
    for (let x = -r; x <= r; x += 0.5) {
      const s = 0.62 - (x / r) * 0.3 - (t > 0.85 ? 0.15 : 0);
      p.px(cx + x, y + 2, stone(SAND, s - 0.08, x, y, 40 + v));
    }
    if (y % 6 === 3) for (let x = -r + 1; x <= r - 1; x += 0.5) p.px(cx + x, y + 2, SAND[2]); // painted bands
  }
  if (v === 1) for (let k = 0; k < 5; k++) p.px(cx - 9 + k * 4, h - 3 + (k % 2), SAND[4]);
}

/** A drift of sand blown down the shafts onto the flagstones (decal). */
function drift(p: Pen) {
  const { w, h } = DRIFT;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = ((x - w / 2) / (w / 2 - 1)) ** 2 + ((y - h / 2) / (h / 2 - 1)) ** 2 + (hash(x >> 2, y >> 2, 51) - 0.5) * 0.4;
    if (r > 1) continue;
    const ripple = Math.sin((x * 0.5 + y * 0.9) * 0.9) > 0.6;
    p.px(x, y, ripple ? SAND[5] : r < 0.4 ? SAND[4] : SAND[3], r > 0.75 ? 0.55 : 0.9);
  }
}

export function deepTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("dp_sarc")) return;
  sheet(scene, "dp_sarc", SARC.w, SARC.h, 2, sarcophagus, 0.5);
  sheet(scene, "dp_candles", CANDLES.w, CANDLES.h, CANDLES.frames, candles, 0.3);
  if (!scene.anims.exists("dp_candles_burn")) scene.anims.create({ key: "dp_candles_burn", frames: scene.anims.generateFrameNumbers("dp_candles", { start: 0, end: CANDLES.frames - 1 }), frameRate: 6, repeat: -1 });
  sheet(scene, "dp_skulls", SKULLS.w, SKULLS.h, 1, skullStack, 0.5);
  sheet(scene, "dp_pillar", PILLAR.w, PILLAR.h, 2, pillar, 0.5);
  sheet(scene, "dp_jar", JAR.w, JAR.h, 2, jar, 0.5);
  sheet(scene, "dp_drift", DRIFT.w, DRIFT.h, 1, drift, 0);
}
/** The wall tint of each dungeon's rock (the Mawdeep keeps its own brown cave rock). */
export const WALL_TINT: Record<string, number> = { maw: 0xffffff, crypt: 0xb8c0cc, under: 0xf0cc98 };
/** Phaser re-export for the view (keeps the import list there short). */
export type DeepScene = Phaser.Scene;
