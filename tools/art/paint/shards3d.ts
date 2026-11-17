/**
 * The last flat quest objects rebuilt as 3D models and baked: the Gloam's Heart Shards of the Crown's four lands
 * (elementArt.heartShard, whole and shattered) and the marsh spirit lanterns (lanternArt.spiritLantern, dark and lit).
 * Motes, arcs and the spirit flame stay painted over the 3D (PropModel.overlay), frame by frame.
 */
import { mat, hash3, noise3, cone, torus, type Mat, type Prim } from "./mob3d";
import { blob, box, rod, type PMat, type PropModel, type V3 } from "./prop3d";
import { LAND_PAL, type LandEl } from "../../../client/src/elementArt";

const TAU = Math.PI * 2;
const M = (pal: number[], o: Parameters<typeof mat>[1] = {}): Mat => mat(0, { ramp: pal, ...o });
const STONE = [0x0e0d12, 0x141318, 0x24222a, 0x36343b, 0x4a484e, 0x5f5c60, 0x787574, 0x948f88];
const GLOAM = [0x1a0814, 0x3a0e2c, 0x5a1440, 0x9b2c6b, 0xe26fa8];
const MOSS = [0x121a0e, 0x1a2414, 0x2a3a1c, 0x3e5226, 0x56682e];
const WOOD = [0x100c08, 0x17120e, 0x2a2119, 0x3f3226, 0x564535, 0x6f5b45];
const IRON = [0x0c0d10, 0x111215, 0x1f2126, 0x33363d, 0x4d525b, 0x6f7681, 0x9aa2ab];
const RUST = [0x24120a, 0x3a1e12, 0x5a2f18, 0x7a4424];
const SPIRIT = [0x0c2a33, 0x16505e, 0x2a8494, 0x4fc3d0, 0x9ff4ff, 0xeaffff];
const SMOKE = [0x0a0d10, 0x111518, 0x192024, 0x222b30, 0x2e393f, 0x3e4a52];
const rockTex = (s: number, amt = 0.5) => (x: number, y: number, z: number) => (noise3(x * 0.35, y * 0.35, z * 0.35 + s) - 0.5) * amt + (noise3(x * 1.1, y * 1.1, z * 1.1 + s) - 0.5) * amt * 0.45;
type Px = (x: number, y: number, c: number) => void;

// ---- Heart Shard (36x50): three crystal spikes out of a cracked boulder, the Gloam's flesh pulsing in their core ----
export function heartShard(el: LandEl, broken: boolean, f: number): PropModel {
  const P: Prim[] = [], pal = LAND_PAL[el], t = (f / 6) * TAU, glow = broken ? 0 : 0.5 + 0.5 * Math.sin(t);
  const stain = M(pal.slice(0, 4), { grain: 0.2 });
  const stone: PMat = { ...M(STONE, { grain: 0.15, tex: rockTex(31, 0.6) }), sub: (x, y, z) => (z < 3 && hash3(Math.round(x), Math.round(y), 33) < 0.1 ? stain : undefined) };
  P.push(blob([0, 0, 0], 10, 9, 5.5, stone, 0.6, 0));
  const flesh = M(GLOAM, { emit: 0.25 + glow * 0.35, grain: 0.15 });
  const crystal: PMat = { ...M(pal, { spec: 0.5, shine: 20, grain: 0.06, emit: glow * 0.1, tex: (x, y, z) => (Math.abs(((x - y + z * 0.5) % 4 + 4) % 4 - 2) < 0.35 ? 0.15 : 0) - 0.3 }) };
  const S: [V3, V3, number][] = broken
    ? [[[-4, 3, 3], [-4, 4, 10], 3], [[0, 0, 3], [2, -2, 12], 3.4], [[4, -3, 3], [6, -4, 8], 2.4]]
    : [[[-6, 4, 3], [-9, 8, 24], 4.2], [[4, -4, 3], [9, -8, 26], 4.2], [[-1, 1, 3], [1, -1, 45], 6]];
  const axes = S;
  crystal.sub = (x, y, z) => {
    if (broken) return undefined;
    for (const [b, tp] of axes) {
      const k = Math.max(0, Math.min(1, (z - b[2]) / (tp[2] - b[2]))), cx = b[0] + (tp[0] - b[0]) * k, cy = b[1] + (tp[1] - b[1]) * k;
      if (k > 0.15 && k < 0.8 && Math.hypot(x - cx, y - cy) < 6 && noise3(x * 0.5, y * 0.5, z * 0.25) > 0.6) return flesh;
    }
    return undefined;
  };
  for (const [b, tp, r] of S) P.push(cone(b, tp, r, crystal, { k: 0.5 }));
  if (broken) for (let i = 0; i < 8; i++) { const a = hash3(i, 4, 35) * TAU, d = 8 + hash3(i, 5, 35) * 6; P.push(rod([Math.cos(a) * d, Math.sin(a) * d, 0.5], [Math.cos(a) * d + 1.5, Math.sin(a) * d - 0.6, 0.8], 0.6, crystal, 0.3, 0.1)); }
  return { prims: P, cast: broken ? 8 : 30,
    halos: broken ? undefined : [{ p: [0, 0, 20], r: 16, col: pal[3], a: 0.15 + glow * 0.15 }],
    overlay: broken ? undefined : (px: Px, at) => {
      for (let i = 0; i < 7; i++) {
        const ph = ((f + i * 0.8) % 6) / 6; if (el === "cold" && ph > 0.5) continue;
        const [x, y] = at([(hash3(i, 7, 37) - 0.5) * 18 + (el === "shock" ? (hash3(i, f, 38) - 0.5) * 4 : 0), (hash3(i, 8, 37) - 0.5) * 10, 8 + ph * (el === "cold" ? 14 : 30)]);
        if (ph < 0.75) px(x, y, pal[ph < 0.5 ? 5 : 4]);
      }
      if (el === "shock" && f % 3 === 0) { const [x0, y0] = at([0, 0, 20]); let x = Math.round(x0) - 10, y = Math.round(y0); while (x < x0 + 10) { px(x, y, pal[5]); x++; y += hash3(x, f, 39) < 0.5 ? -1 : 1; } }
    } };
}

// ---- spirit lantern (34x72): an iron cage lantern on a square post in a mossy stone plinth; dark, or lit cold ----
export function spiritLantern(lit: boolean, f: number): PropModel {
  const P: Prim[] = [], t = (f / 6) * TAU, fl = lit ? 0.5 + 0.5 * Math.sin(t) : 0;
  const moss = M(MOSS, { grain: 0.2 });
  const plinth: PMat = { ...M(STONE, { grain: 0.15, tex: rockTex(42, 0.6) }), sub: (x, y, z) => (noise3(x * 0.4, y * 0.4, z * 0.4) > (z > 5.5 ? 0.52 : 0.68) && !(z > 5.5 && Math.hypot(x, y) < 2.5) ? moss : undefined) };
  P.push(box(-4.5, 4.5, -4.5, 4.5, 0, 6, plinth, 0.6, 0.2));
  for (const [u, v, h] of [[-5, 3, 5], [-5.4, 1, 3.5], [3, -5.2, 4], [1, -5.5, 3]] as const) P.push(rod([u, v, 0], [u + 0.4, v + 0.4, h], 0.35, moss, 0.15, 0.1)); // marsh reeds
  const wood = M(WOOD, { grain: 0.08, tex: (x, y, z) => (hash3(Math.floor(x * 2), Math.floor(y * 2), Math.floor(z / 4)) - 0.5) * 0.2 });
  P.push(box(-1.5, 1.5, -1.5, 1.5, 5.5, 27.5, wood, 0.3, 0.2));
  const iron: PMat = { ...M(IRON, { spec: 0.5, shine: 14, grain: 0.06 }), sub: lit ? undefined : (x, y, z) => (noise3(x * 0.5, y * 0.5, z * 0.5) > 0.66 ? M(RUST, { grain: 0.15 }) : undefined) };
  for (const z of [10, 22]) P.push(box(-1.9, 1.9, -1.9, 1.9, z, z + 1, iron, 0.2, 0.1));
  // base plate, glass, the frame
  P.push(box(-4.6, 4.6, -4.6, 4.6, 27, 28, iron, 0.2, 0.1));
  const glass = lit ? M(SPIRIT, { emit: 0.5 + fl * 0.2, spec: 0.6, shine: 18, tex: (x, y, z) => -Math.hypot(x, y, z - 34) * 0.03 })
    : M(SMOKE, { spec: 0.7, shine: 22, grain: 0.12, tex: (x, y, z) => (noise3(x * 0.8, y * 0.8, z * 0.8) - 0.5) * 0.3 });
  P.push(box(-3.8, 3.8, -3.8, 3.8, 28, 42, glass, 0.1, 0.1));
  for (const [u, v] of [[-4, -4], [4, -4], [-4, 4], [4, 4]] as const) P.push(rod([u, v, 27.5], [u, v, 42.5], 0.55, iron, 0.55, 0.1));
  for (const z of [28.2, 41.8]) for (const [a, b] of [[[-4, -4], [4, -4]], [[4, -4], [4, 4]], [[4, 4], [-4, 4]], [[-4, 4], [-4, -4]]] as const)
    P.push(rod([a[0], a[1], z], [b[0], b[1], z], 0.5, iron, 0.5, 0.1));
  // pyramid roof with eaves, finial ring
  P.push({ m: iron, k: 0.2, lo: [-6, -6, 41], hi: [6, 6, 55], d: (x, y, z) => {
    const h = 12, s = 5.6 * (1 - (z - 42) / h);
    return Math.max((Math.max(Math.abs(x), Math.abs(y)) - s) * 0.7, 42 - z, z - 54);
  } });
  P.push(torus([0, 0, 56], 1.6, 0.45, iron, { tilt: Math.PI / 2 }));
  const fy: V3 = [0, 0, 30];
  return { prims: P, cast: 30, shadow: [{ u: 0, v: 0, r: 7, a: 0.3 }],
    halos: lit ? [{ p: [0, 0, 35], r: 22, col: SPIRIT[3], a: 0.3 + fl * 0.1 }] : undefined,
    overlay: (px: Px, at) => {
      const [cx, cy] = at(fy), X = Math.round(cx), Y = Math.round(cy);
      if (!lit) { px(X, Y, WOOD[1]); return; }
      px(X, Y + 1, IRON[3]);
      const fh = 9 + fl * 2;
      for (let i = 0; i < fh; i++) {
        const k = i / fh, w = Math.max(0, Math.sin(Math.PI * Math.min(1, k * 1.6 + 0.15)) * 2.4 * (1 - k * 0.6)), sw = Math.round(Math.sin(t + i * 0.5) * k * 1.4);
        for (let x = -Math.ceil(w); x <= Math.ceil(w); x++) if (Math.abs(x) <= w) px(X + x + sw, Y - i, SPIRIT[Math.max(2, Math.min(5, Math.round(5.4 - Math.abs(x) * 0.7 - k * 1.2)))]);
      }
      for (let i = 0; i < 7; i++) {
        const ph = (f / 6 + hash3(i, 0, 7)) % 1, [mx, my] = at([(hash3(i, 1, 7) - 0.5) * 16, (hash3(i, 2, 7) - 0.5) * 6, 40 + ph * 26]);
        if (my >= 1 && ph < 0.8) px(mx + Math.sin(ph * 6 + i) * 1.5, my, SPIRIT[i % 2 ? 4 : 5]);
      }
    } };
}

const ELS: LandEl[] = ["poison", "cold", "fire", "shock"];
type Entry = { key: string; w: number; h: number; frames: number; ox: number; oy: number; shadow?: number; model: (f: number) => PropModel };
export const SHARDS3D: Entry[] = [
  ...ELS.flatMap((el): Entry[] => [
    { key: `qobj_shard_${el}`, w: 36, h: 50, frames: 6, ox: 18, oy: 45, shadow: 0.5, model: (f) => heartShard(el, false, f) },
    { key: `qobj_shard_${el}_broken`, w: 36, h: 50, frames: 1, ox: 18, oy: 45, shadow: 0.5, model: () => heartShard(el, true, 0) },
  ]),
  { key: "qobj_lantern_off", w: 34, h: 72, frames: 1, ox: 17, oy: 66, shadow: 0.5, model: () => spiritLantern(false, 0) },
  { key: "qobj_lantern_lit", w: 34, h: 72, frames: 6, ox: 17, oy: 66, shadow: 0.5, model: (f) => spiritLantern(true, f) },
];
