/**
 * Deep dungeon props (client/src/deepArt.ts) rebuilt as 3D models and baked: the candle cluster in its wax puddle
 * (painted flames over the 3D wax), the pyramid of skulls and the painted clay urns (whole and broken).
 */
import { mat, hash3, noise3, type Mat, type Prim } from "./mob3d";
import { blob, rod, type PMat, type PropModel, type V3 } from "./prop3d";
import { BONER } from "../../../client/src/isoProps";

const M = (pal: number[], o: Parameters<typeof mat>[1] = {}): Mat => mat(0, { ramp: pal, ...o });
const SAND = [0x2a1e14, 0x46321e, 0x64482a, 0x84623a, 0xa47e4c, 0xc29c62, 0xdcb87c];
const WAXR = [0x4a3e2a, 0x6a5a40, 0x8a7a5a, 0xaa9a74, 0xc8b88e, 0xeae0c0, 0xf6f0dc];
const FLAME = [0xfff2b0, 0xffd36a, 0xffa040, 0xe0641e];

// ---- candles (30x30, origin 15,24), 4 flicker frames ------------------------------------------------------------
export function candles(f: number): PropModel {
  const P: Prim[] = [], wax = M(WAXR, { spec: 0.25, shine: 8, grain: 0.05 });
  P.push(blob([0, 0, 0], 8, 8, 1.2, M(WAXR, { spec: 0.2, shine: 8, tex: () => -0.12 }), 0.6, 0));
  const C: [number, number, number, number][] = [[-4, -3, 11, 1.6], [1, -5, 15, 2], [5, 2, 10, 1.6], [-2, 3, 7, 1.2], [3, 6, 6, 1.2]];
  const tips: V3[] = [];
  C.forEach(([u, v, h, r], i) => {
    P.push(rod([u, v, 0], [u, v, h], r, wax, r * 0.95, 0.5));
    P.push(blob([u + r * 0.6, v + r * 0.6, h - 1.5 - (i % 3)], 0.6, 0.6, 1.6, wax, 0.4)); // a drip
    P.push(rod([u, v, h], [u, v, h + 0.9], 0.25, M([0x1a120c, 0x2a2018]), 0.2, 0.1));
    tips.push([u, v, h + 1]);
  });
  return { prims: P, shadow: [{ u: 0, v: 0, r: 9, a: 0.3 }], cast: 4,
    overlay: (px, at) => tips.forEach((q, i) => {
      const [x, y] = at(q), fl = (f + i) % 4, fh = 3 + (fl % 2), sway = fl === 3 ? 1 : fl === 1 ? -1 : 0, X = Math.floor(x), Y = Math.floor(y);
      for (let j = 0; j < fh; j++) px(X + (j === fh - 1 ? sway : 0), Y - 1 - j, FLAME[Math.min(3, j === 0 ? 0 : j)]);
    }) };
}

// ---- pyramid of skulls (40x40, origin 20,36) ----------------------------------------------------------------------
export function skulls(): PropModel {
  const P: Prim[] = [], eyes: { p: V3; col: number }[] = [], dark = M([0x0c0806, 0x140e0a, 0x241a12]);
  const bone: PMat = { ...M(BONER, { grain: 0.1, tex: (x, y, z) => (noise3(x * 0.6, y * 0.6, z * 0.6) > 0.7 ? -0.15 : 0) }) };
  // a stepped pyramid of skulls, each facing out toward the viewer's side
  for (let layer = 0; layer < 4; layer++) {
    const n = 4 - layer, z = 2.6 + layer * 4.6, off = (n - 1) * 2.8;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const c: V3 = [-off + i * 5.6 + (hash3(i, j, layer) - 0.5) * 0.6, -off + j * 5.6 + (hash3(j, i, layer) - 0.5) * 0.6, z];
      const front = i === n - 1 || j === n - 1;
      P.push(blob(c, 2.7, 2.7, 2.6, bone, 0.3));
      if (!front) continue;
      const a = i === n - 1 && j === n - 1 ? Math.PI / 4 : i === n - 1 ? 0.25 : Math.PI / 2 - 0.25;
      const fp = (da: number, r: number, dz: number): V3 => [c[0] + Math.cos(a + da) * r, c[1] + Math.sin(a + da) * r, c[2] + dz];
      for (const da of [-0.5, 0.5]) P.push({ ...blob(fp(da, 2.75, 0.2), 0.7, 0.7, 0.75, dark, 0.2), cut: true });
      eyes.push({ p: fp(0, 2.6, -1.3), col: 0x241a12 });
    }
  }
  return { prims: P, eyes, shadow: [{ u: 0, v: 0, r: 13, a: 0.35 }], cast: 6 };
}

// ---- painted urn (24x30, origin 12,27), whole / broken -----------------------------------------------------------
export function jar(v: number): PropModel {
  const P: Prim[] = [], H = 24;
  const prof = (t: number) => (t > 0.88 ? 2.2 : t > 0.78 ? 1.8 : 2.2 + Math.sin(t / 0.78 * Math.PI) * 4.4);
  const m = M(SAND, { grain: 0.12, tex: (_x, _y, z) => (Math.abs(((z + 1.5) % 6) - 3) < 0.8 ? -0.45 : 0) });
  P.push({ m, k: 0.3, lo: [-10, -10, 0], hi: [10, 10, H + 1], d: (x, y, z) => {
    const t = Math.max(0, Math.min(1, z / H)), r = Math.hypot(x, y);
    let d = Math.max((r - prof(t)) * 0.7, -z, z - H);
    d = Math.max(d, -(r - prof(t) + 0.9)); // hollow
    if (v === 1) d = Math.max(d, z - (H * 0.55 + (noise3(Math.atan2(y, x) * 2, 0, 3) - 0.5) * 5)); // broken top
    return d;
  } });
  if (v === 1) for (let k = 0; k < 4; k++) { const a = hash3(k, 1, 41) * 6.28, d = 6 + k; P.push(blob([Math.cos(a) * d * 0.6 + 2, Math.sin(a) * d * 0.6 + 2, 0.4], 1.4, 1, 0.4, m, 0.2)); }
  return { prims: P, shadow: [{ u: 0, v: 0, r: 5, a: 0.35 }], cast: 5 };
}

export const DEEP3D: { key: string; w: number; h: number; frames: number; ox: number; oy: number; model: (f: number) => PropModel }[] = [
  { key: "dp_candles", w: 30, h: 30, frames: 4, ox: 15, oy: 24, model: candles },
  { key: "dp_skulls", w: 40, h: 40, frames: 1, ox: 20, oy: 31, model: () => skulls() },
  { key: "dp_jar", w: 24, h: 30, frames: 2, ox: 12, oy: 25, model: jar },
];
