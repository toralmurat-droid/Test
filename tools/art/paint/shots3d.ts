/**
 * Skill and monster projectiles (client/src/skillfx.ts addShot / basicShot) rebuilt as small 3D models and baked:
 * Murat 2026-11-17 picked "skill and spell effects" for the 3D rebuild after the decor. Each shot is modelled at its
 * centre (model origin = the shot's screen position) at 1.5 texels per world px, lit like the props. Shots that fly
 * pointing along their heading (arrows, lances, shards) bake 16 headings as frames, in world angle order (frame k =
 * world heading k * 22.5 deg), so the client picks a frame instead of rotating pixel art; round or tumbling shots bake
 * one frame and keep the client's spin and wobble. Glows, trails and sparks stay runtime particles.
 */
import { mat, hash3, noise3, cone, ell, type Mat, type Prim } from "./mob3d";
import { blob, cloth, rod, type PropModel, type V3 } from "./prop3d";

const M = (pal: number[], o: Parameters<typeof mat>[1] = {}): Mat => mat(0, { ramp: pal, ...o });
export const FX_TX = 1.5, HEADINGS = 16;
const STEEL = [0x1e242c, 0x37474f, 0x6d7d99, 0xa8b4c8, 0xdfe6f0, 0xffffff];
const PALEWOOD = [0x3a2a18, 0x6d5034, 0x9c7c58, 0xc0a078, 0xd8b98a, 0xeed8b0];
const DARKWOOD = [0x1e140c, 0x3a2818, 0x5a3e28, 0x6d4c33, 0x8a6648];
const RED = [0x3a0a0e, 0x7a1418, 0xb0242a, 0xe63946, 0xff7a84];
const SLATE = [0x101418, 0x1e262c, 0x37474f, 0x4e5a62];
const BLOOD = [0x1e0000, 0x3a0000, 0x6d0000, 0x9b1b1b, 0xb71c1c, 0xe63946, 0xff8a94, 0xffcdd2];
const VOID = [0x120820, 0x2a1446, 0x4a2a80, 0x7a4ad0, 0xb48cff, 0xf0e4ff];
const ICE = [0x123a5a, 0x2a6fdb, 0x4cc9f0, 0x8be9ff, 0xd6f6ff, 0xffffff];
const FIRE = [0x5a0e00, 0xa01e00, 0xd62800, 0xff6d00, 0xff9f1c, 0xfff176, 0xffffff];
const GOO = [0x1e0c38, 0x3a1866, 0x5b2c91, 0x8a52d0, 0xb57cff, 0xd1a6ff, 0xffffff];
const STONE = [0x1e1e1e, 0x3a3a3a, 0x555555, 0x6d6d6d, 0x8a8a8a, 0xa9a9a9, 0xc8c8c8];
const FUR = [0x1a1410, 0x2e2420, 0x4e4038, 0x6d5b50, 0x8d7b70, 0xa89888];
const BATR = [0x0c0818, 0x1a1033, 0x2a1d3a, 0x3e2a5a, 0x5e35b1, 0x7e57c2];
const ARC = [0x1a3a5a, 0x2a6fdb, 0x4cc9f0, 0x9fe6ff, 0xd6f6ff, 0xffffff];
const SHADOW = [0x0a0614, 0x1a1033, 0x2a1d4a, 0x1e5a22, 0x43a047, 0x7dff6a];
const SUN = [0x7a3008, 0xc85a10, 0xff8a1c, 0xffb347, 0xffd27a, 0xfff3c0, 0xfffbe8];
const S = FX_TX;

/** A shot model pointing along +u (world x); heading frames turn the whole thing about z. */
type Shot = (f: number) => PropModel;
const arrow = (bolt: boolean): Shot => () => {
  const L = (bolt ? 7 : 9) * S, r = (bolt ? 0.7 : 0.45) * S, P: Prim[] = [];
  P.push(rod([-L / 2, 0, 0], [L / 2, 0, 0], r, M(bolt ? DARKWOOD : PALEWOOD, { grain: 0.04 }), r, 0.2));
  P.push(cone([L / 2 - 0.5, 0, 0], [L / 2 + 2.6 * S, 0, 0], 1.5 * S * 0.7, M(STEEL, { spec: 0.8, shine: 18 }), { k: 0.2 }));
  const fl = M(bolt ? SLATE : RED, { grain: 0.05 });
  for (const s of [-1, 1]) P.push(cloth([-L / 2 - 0.6, 0, 0], [3.2 * S, 0, 0], [0, s * 0.7, 1.4 * S], fl, () => 0, (a, t) => t < 1 - a * 0.6, 0.25));
  return { prims: P };
};
const lance = (voidl: boolean): Shot => () => {
  const P: Prim[] = [], shaft = voidl ? VOID.slice(0, 4) : BLOOD.slice(0, 5), head = voidl ? VOID.slice(2) : BLOOD.slice(3);
  P.push(rod([-9 * S, 0, 0], [3 * S, 0, 0], 0.8 * S, M(shaft, { spec: voidl ? 0.3 : 0.7, shine: 14, grain: 0.05, emit: voidl ? 0.15 : 0 }), 0.7 * S, 0.2));
  P.push(cone([2.5 * S, 0, 0], [9 * S, 0, 0], 2 * S, M(head, { spec: 0.8, shine: 16, emit: voidl ? 0.45 : 0.1, tex: () => (voidl ? 0 : -0.22) }), { k: 0.5 }));
  if (!voidl) for (let i = 0; i < 3; i++) P.push(blob([-2 * S - i * 2.4 * S, 0, -0.7 * S], 0.5 * S, 0.5 * S, 0.8 * S, M(BLOOD.slice(2, 6), { spec: 0.6, shine: 12 }), 0.4)); // drips running off
  return { prims: P };
};
const iceShard: Shot = () => {
  const m = M(ICE, { spec: 0.9, shine: 22, emit: 0.25, tex: (x, y, z) => (Math.abs(((x * 0.8 - y + z) % 3 + 3) % 3 - 1.5) < 0.25 ? 0.2 : 0) });
  return { prims: [cone([-1.5 * S, 0, 0], [4.5 * S, 0, 0], 1.6 * S, m, { k: 0.4 }), cone([-1 * S, 0, 0], [-4.5 * S, 0, 0], 1.6 * S, m, { k: 0.4 })] };
};
const knife: Shot = () => ({ prims: [
  { m: M(STEEL, { spec: 0.9, shine: 20 }), k: 0.2, lo: [-1, -3, -1], hi: [7.5, 3, 1], d: (x, y, z) => Math.max(Math.abs(y) - 1.8 * (1 - Math.max(0, x) / (4.5 * S)) * 0.9, Math.abs(z) - 0.35, -x, x - 4.5 * S) },
  rod([-3.5 * S, 0, 0], [-0.3 * S, 0, 0], 0.7 * S, M(DARKWOOD, { grain: 0.06 }), 0.7 * S, 0.2),
  rod([-0.4 * S, -1.6 * S, 0], [-0.4 * S, 1.6 * S, 0], 0.45 * S, M([0x5a3a10, 0x8a6020, 0xc0902e, 0xffd166], { spec: 0.6, shine: 14 }), 0.45 * S, 0.1),
] });
const stone: Shot = () => ({ prims: [{ ...blob([0, 0, 0], 2.2 * S, 2 * S, 1.9 * S, M(STONE, { grain: 0.2, tex: (x, y, z) => (noise3(x * 0.7, y * 0.7, z * 0.7) - 0.5) * 0.4 }), 0.4),
  d: (x, y, z) => Math.hypot(x / 1.1, y, z / 0.95) - 2.4 * S - (noise3(x * 0.5, y * 0.5, z * 0.5) - 0.5) * 1.6 }] });
const orb = (pal: number[], r: number, o: Parameters<typeof mat>[1], extra?: (P: Prim[]) => void): Shot => () => {
  const P: Prim[] = [blob([0, 0, 0], r * S, r * S, r * S, M(pal, o), 0.4)];
  extra?.(P);
  return { prims: P };
};
const fireball = orb(FIRE, 3.4, { emit: 0.75, grain: 0.2, tex: (x, y, z) => (noise3(x * 0.6 + 3, y * 0.6, z * 0.6) - 0.5) * 0.7 + z * 0.04 });
const bloodbolt = orb(BLOOD, 2.9, { spec: 0.8, shine: 14, grain: 0.06, tex: (x, y, z) => (noise3(x * 0.5, y * 0.5, z * 0.5) - 0.5) * 0.25 - 0.22 });
const slimeball = orb(GOO, 2.7, { spec: 0.9, shine: 16, grain: 0.04, tex: () => -0.18 });
const magicbolt = orb(ARC, 2.4, { emit: 0.7, spec: 0.6, shine: 14 });
const sunbolt = orb(SUN, 2.8, { emit: 0.55, grain: 0.15, tex: (x, y, z) => (noise3(x * 0.7, y * 0.7, z * 0.7) - 0.5) * 0.5 });
const shadowbolt: Shot = () => {
  const glow = M(SHADOW.slice(3), { emit: 0.65 });
  const m = { ...M(SHADOW.slice(0, 3), { grain: 0.15, spec: 0.3, shine: 10 }), sub: (x: number, y: number, z: number) => (noise3(x * 0.6, y * 0.6, z * 0.6) > 0.56 || x + y < -2.6 * S ? glow : undefined) };
  return { prims: [blob([0, 0, 0], 3 * S, 3 * S, 3 * S, m, 0.4)] };
};
const frozenorb: Shot = () => {
  const P: Prim[] = [blob([0, 0, 0], 3.2 * S, 3.2 * S, 3.2 * S, M(ICE, { emit: 0.25, spec: 0.8, shine: 18, tex: (x, y, z) => Math.max(0, -x - y + z) * 0.03 - 0.15 }), 0.3)];
  const spike = M(ICE.slice(1), { spec: 0.9, shine: 22, emit: 0.2 });
  for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3, e = Math.sin(k * 1.7) * 0.5; P.push(cone([Math.cos(a) * 2 * S, Math.sin(a) * 2 * S, e * S], [Math.cos(a) * 5.6 * S, Math.sin(a) * 5.6 * S, e * 3 * S], 0.9 * S, spike, { k: 0.4 })); }
  return { prims: P };
};
/** Rat scurrying toward screen right (world heading -45 deg); the client mirrors it for leftward runs. */
const rat: Shot = () => {
  const fur = M(FUR, { grain: 0.2 }), pink = M([0x6a3a44, 0xa0606e, 0xd48a9a, 0xf0b4c0]);
  const P: Prim[] = [], fw = (a: number, s: number, z: number): V3 => [(a + s) * 0.707, (s - a) * 0.707, z];
  P.push(ell(fw(-0.3 * S, 0, 1.8 * S), [3.4 * S, 1.8 * S, 1.7 * S], fur, { yaw: -Math.PI / 4, k: 0.6 }));
  P.push(cone(fw(1.8 * S, 0, 2 * S), fw(4.6 * S, 0, 1.4 * S), 1.3 * S, fur, { k: 0.6 }));
  for (const s of [-0.7, 0.7]) P.push(blob(fw(2.2 * S, s * S, 3.2 * S), 0.6 * S, 0.6 * S, 0.7 * S, pink, 0.3));
  P.push(rod(fw(-3.4 * S, 0, 1.4 * S), fw(-7 * S, 0.8 * S, 0.5 * S), 0.35 * S, pink, 0.2 * S, 0.3));
  for (const [a, s] of [[1.6, -1], [1.6, 1], [-1.8, -1], [-1.8, 1]] as const) P.push(rod(fw(a * S, s * 0.9 * S, 1 * S), fw((a + 0.4) * S, s * 1.1 * S, 0), 0.35 * S, fur, 0.3 * S, 0.2));
  return { prims: P, eyes: [{ p: fw(3.4 * S, 0.9 * S, 2.3 * S), col: 0xff2d2d }], shadow: [{ u: 0, v: 0, r: 2.6 * S, a: 0.3 }] };
};
/** Bat, wings spread, facing the viewer (the client beats the wings by squashing the sprite). */
const bat: Shot = () => {
  const body = M(BATR, { grain: 0.1 }), wing = M(BATR.slice(1), { grain: 0.05, tex: (x, y, z) => (Math.abs(((x - y) % 2.6 + 2.6) % 2.6 - 1.3) < 0.2 ? -0.2 : 0) });
  const P: Prim[] = [blob([0, 0, 0], 1.6 * S, 1.6 * S, 1.9 * S, body, 0.5), blob([0, 0, 2 * S], 1.1 * S, 1.1 * S, 1.1 * S, body, 0.5)];
  for (const s of [-1, 1]) {
    P.push(cone([s * 0.4 * S, -s * 0.4 * S, 2.8 * S], [s * 0.6 * S, -s * 0.6 * S, 4 * S], 0.4 * S, body, { k: 0.2 }));
    P.push(cloth([0, 0, 0.6 * S], [s * 4 * S, -s * 4 * S, 1.6 * S], [0, 0, -2.4 * S], wing, (a, t) => Math.sin(a * Math.PI) * 0.6, (a, t) => t < 1 - a * 0.55 && !(a > 0.4 && t > 0.75 - Math.abs(Math.sin(a * 9)) * 0.25), 0.3));
  }
  return { prims: P, eyes: [{ p: [0.9 * S, 0.9 * S, 2.1 * S], col: 0xff2d2d }, { p: [1.3 * S, 0.5 * S, 2.1 * S], col: 0xff2d2d }] };
};

export type FxEntry = { key: string; w: number; h: number; dir: boolean; outline: boolean; model: Shot };
/** Baked shot sheets: client/public/assets/hd/fx/fx3_<look>.png. */
export const SHOTS3D: FxEntry[] = [
  { key: "arrow", w: 26, h: 22, dir: true, outline: true, model: arrow(false) },
  { key: "bolt", w: 22, h: 20, dir: true, outline: true, model: arrow(true) },
  { key: "bloodlance", w: 34, h: 26, dir: true, outline: true, model: lance(false) },
  { key: "voidlance", w: 34, h: 26, dir: true, outline: true, model: lance(true) },
  { key: "iceshard", w: 20, h: 18, dir: true, outline: true, model: iceShard },
  { key: "knife", w: 18, h: 14, dir: false, outline: true, model: knife },
  { key: "stone", w: 12, h: 12, dir: false, outline: true, model: stone },
  { key: "fireball", w: 14, h: 14, dir: false, outline: false, model: fireball },
  { key: "bloodbolt", w: 12, h: 12, dir: false, outline: true, model: bloodbolt },
  { key: "slimeball", w: 12, h: 12, dir: false, outline: true, model: slimeball },
  { key: "magicbolt", w: 10, h: 10, dir: false, outline: false, model: magicbolt },
  { key: "sunbolt", w: 12, h: 12, dir: false, outline: false, model: sunbolt },
  { key: "shadowbolt", w: 14, h: 14, dir: false, outline: true, model: shadowbolt },
  { key: "frozenorb", w: 22, h: 20, dir: false, outline: true, model: frozenorb },
  { key: "rat", w: 20, h: 14, dir: false, outline: true, model: rat },
  { key: "bat", w: 20, h: 14, dir: false, outline: true, model: bat },
];
/** Turns a model about z by `a` (heading frames). */
export function turn(m: PropModel, a: number): PropModel {
  const c = Math.cos(a), s = Math.sin(a), R = (p: V3): V3 => [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
  return {
    ...m,
    prims: m.prims.map((p) => {
      const pts = [0, 1].flatMap((i) => [0, 1].map((j) => R([i ? p.hi[0] : p.lo[0], j ? p.hi[1] : p.lo[1], 0])));
      const lo: V3 = [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), p.lo[2]], hi: V3 = [Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1])), p.hi[2]];
      return { ...p, lo, hi, d: (x: number, y: number, z: number) => p.d(x * c + y * s, -x * s + y * c, z) };
    }),
    eyes: m.eyes?.map((e) => ({ ...e, p: R(e.p) })),
  };
}
export { hash3 };
