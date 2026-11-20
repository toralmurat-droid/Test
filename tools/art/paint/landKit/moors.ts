/**
 * The Grey Barrow Moors' land kit (settlement network step 3): peat and barrows. Peat stacks drying by the halls, a
 * cut peat bank with its turf spade, way-cairns beside the Moors Highway, and the Beacon Cairn north of Cairnwatch with
 * a peat fire in an iron basket on top (its glow after dusk is client/src/landKitView.ts's, from the fire you see).
 * 3D-built like oakvale.ts, baked by tools/art/bake-props.ts; frame sizes from client/src/landKitSheets.ts.
 */
import { hash3, mat, type Mat, type Prim } from "../mob3d";
import { blob, box, grain, rod, type PMat, type PropModel, type V3 } from "../prop3d";
import { flame2d } from "../dungeon3d";
import { IRONR, OLDR, STONER, WOODR } from "../../../../client/src/isoProps";
import { LK_SHEETS, type LkKind } from "../../../../client/src/landKitSheets";

const TAU = Math.PI * 2;
/** Cut peat: near-black brown, fibrous; the dried skin a little lighter. */
const PEAT = [0x0e0a08, 0x1a120c, 0x281c12, 0x38281a, 0x4a3624, 0x5e4630];
const HEATH = [0x141a10, 0x202a16, 0x2e3a1e, 0x3e4c26, 0x54602e, 0x6c7238];
const MOSS = [0x1a2016, 0x283222, 0x38462e, 0x4a5a3a];
const COAL = [0x2a120a, 0x6e2010, 0xc4461a, 0xffb04a];

const M = (pal: number[], o: Parameters<typeof mat>[1] = {}): Mat => mat(0, { ramp: pal, ...o });
const wood = (axis: 0 | 1 | 2, pal = WOODR, bias = 0) => M(pal, { tex: (x, y, z) => grain(axis)(x, y, z) + bias, grain: 0.05 });
const iron = (bias = 0) => M(IRONR, { spec: 0.35, shine: 14, tex: () => bias - 0.06, grain: 0.06 });
/** Moor stone: grey granite with lichen and moss in the joints. */
const stone = (bias = 0, seed = 0): PMat => {
  const m: PMat = { ...M(STONER, { grain: 0.26, tex: (x, y, z) => bias + (hash3(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2) + seed) - 0.5) * 0.18 }) };
  const moss = M(MOSS, { grain: 0.3 });
  m.sub = (x, y, z) => (hash3(Math.floor(x * 0.7), Math.floor(y * 0.7), Math.floor(z * 0.7) + seed * 7) < 0.07 ? moss : undefined);
  return m;
};
/** A turf of peat: fibres along its length (axis), the cut ends darker. */
const peat = (bias = 0) => M(PEAT, { grain: 0.22, tex: (x, y, z) => bias + (hash3(Math.floor(x * 1.4), Math.floor(y * 1.4), Math.floor(z * 2)) - 0.5) * 0.24 });

/** A box turned `phi` about z round its own centre (cu, cv): turves lie every which way. */
function turf(P: Prim[], cu: number, cv: number, z0: number, l: number, w: number, h: number, phi: number, m: Mat) {
  const c = Math.cos(phi), s = Math.sin(phi), b = box(-l / 2, l / 2, -w / 2, w / 2, z0, z0 + h, m, 0.6, 0.15), d0 = b.d;
  const r = Math.hypot(l, w) / 2 + 1;
  P.push({ ...b, lo: [cu - r, cv - r, z0 - 1], hi: [cu + r, cv + r, z0 + h + 1], d: (x, y, z) => { const a = (x - cu) * c + (y - cv) * s, bb = -(x - cu) * s + (y - cv) * c; return d0(a, bb, z); } });
}

// ---- peat stack: turves built into a round rick to dry, the top course leaning in -------------------------------
export function peatStack(): PropModel {
  const P: Prim[] = [];
  const courses = [[15, 10], [13.5, 9], [11.5, 8], [9, 6], [6, 4]] as const;
  let z = 0;
  courses.forEach(([R, n], ci) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + ci * 0.37, cu = Math.cos(a) * (R - 3.5), cv = Math.sin(a) * (R - 3.5);
      turf(P, cu, cv, z, 9.5, 4.6, 3.6, a + Math.PI / 2 + (hash3(i, ci, 3) - 0.5) * 0.4, peat(-0.04 + hash3(i, ci, 4) * 0.12));
    }
    z += 3.5;
  });
  // the heart filled with broken peat, a turf of heather on top against the rain
  P.push(blob([0, 0, 8], 10, 10, 9, peat(-0.1), 1));
  P.push(blob([0, 0, z + 0.6], 5.6, 5.6, 2.2, M(HEATH, { grain: 0.3 }), 0.6));
  // a few turves leant against the foot, drying on edge
  for (let i = 0; i < 3; i++) { const a = 0.4 + i * 0.5; turf(P, Math.cos(a) * 19, Math.sin(a) * 19, 0, 8, 2.6, 4.2, a + Math.PI / 2, peat(0.06)); }
  return { prims: P, shadow: [{ u: 1, v: 1, r: 14, a: 0.35 }], cast: 10 };
}

// ---- peat bank: the cut face of the bog, a shelf below it, turves laid out to dry, the spade stuck in ---------------
export function peatBank(): PropModel {
  const P: Prim[] = [];
  const along: V3 = [0.7071, -0.7071, 0], out: V3 = [0.7071, 0.7071, 0]; // the bank runs across the screen, its face toward the camera
  const at = (s: number, o: number, z: number): V3 => [along[0] * s + out[0] * o, along[1] * s + out[1] * o, z];
  // the bank: heather on top, the black cut face in front, the shelf a step lower
  const bank: PMat = { ...peat(-0.06) }, top = M(HEATH, { grain: 0.32, tex: (x, y) => (hash3(Math.floor(x / 2), Math.floor(y / 2), 9) - 0.5) * 0.3 });
  bank.sub = (_x, _y, z) => (z > 9.2 ? top : undefined);
  const slab = (o0: number, o1: number, z1: number, m: Mat, rr = 1.2) => {
    const b = box(-25, 25, o0, o1, 0, z1, m, rr, 0.4), d0 = b.d;
    P.push({ ...b, lo: [-40, -40, 0], hi: [40, 40, z1 + 1], d: (x, y, z) => d0(x * along[0] + y * along[1], x * out[0] + y * out[1], z) });
  };
  slab(-16, -2, 11, bank, 2);
  slab(-2, 6, 4.5, peat(-0.12), 0.8);
  // spade cuts down the face
  for (let i = 0; i < 7; i++) P.push({ ...box(-0.4, 0.4, -0.4, 0.4, 4.5, 10.5, M(PEAT, { tex: () => -0.3 })), d: (x, y, z) => { const s = x * along[0] + y * along[1] - (-21 + i * 7), o = x * out[0] + y * out[1] + 1.6; return Math.max(Math.abs(s) - 0.35, Math.abs(o) - 0.6, Math.abs(z - 7.5) - 3); }, lo: [-40, -40, 4], hi: [40, 40, 11], cut: true });
  // turves on the grass in front, some laid flat, some stood in little feet of three to dry
  for (let i = 0; i < 6; i++) {
    const s = -23 + i * 9 + (hash3(i, 1, 21) - 0.5) * 3, o = 12 + hash3(i, 2, 21) * 5, p = at(s, o, 0);
    if (i % 3 === 1) for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; turf(P, p[0] + Math.cos(a) * 2.2, p[1] + Math.sin(a) * 2.2, 0, 3, 2.4, 7.5, a, peat(0.08)); }
    else turf(P, p[0], p[1], 0, 8, 4.2, 2.6, -Math.PI / 4 + (hash3(i, 3, 21) - 0.5) * 0.5, peat(0.04 + hash3(i, 4, 21) * 0.08));
  }
  // the turf spade (tushkar): a straight shaft, a T grip, the iron blade with its side wing driven into the top
  const sp = at(12, -6, 9), tip = at(15, -3, 34);
  P.push(rod(sp, tip, 1.1, wood(2, OLDR, 0.05), 1, 0.3));
  P.push(rod([tip[0] - along[0] * 4, tip[1] - along[1] * 4, tip[2] + 0.5], [tip[0] + along[0] * 4, tip[1] + along[1] * 4, tip[2] + 0.5], 1, wood(0, OLDR), 1, 0.3));
  const bl = box(-2.6, 2.6, -0.5, 0.5, 6, 13, iron(0.05), 0.3), d0 = bl.d;
  P.push({ ...bl, lo: [sp[0] - 6, sp[1] - 6, 5], hi: [sp[0] + 6, sp[1] + 6, 14], d: (x, y, z) => d0((x - sp[0]) * along[0] + (y - sp[1]) * along[1], (x - sp[0]) * out[0] + (y - sp[1]) * out[1], z) });
  return { prims: P, shadow: [{ u: 0, v: 0, r: 22, a: 0.28 }], cast: 8 };
}

// ---- way-cairn: a heap of fieldstones with a standing slab, beside the highway ---------------------------------
export function wayCairn(): PropModel {
  const P: Prim[] = [];
  const rings = [[8.5, 7, 2.6], [6.4, 5, 7.2], [4.2, 4, 11.6], [2, 2, 15.6]] as const;
  rings.forEach(([R, n, z], ri) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + ri * 0.6, r = 2.8 + hash3(i, ri, 31) * 1;
      P.push(blob([Math.cos(a) * R, Math.sin(a) * R, z], r * 1.15, r, r * 0.75, stone(-0.04 + hash3(i, ri, 32) * 0.12, i + ri * 9), 0.7));
    }
  });
  P.push(blob([0, 0, 8], 7, 7, 8, stone(-0.12, 5), 1));
  // the marker slab on top, a little askew, and a white quartz stone left by a walker
  const sl = box(-2.2, 2.2, -0.9, 0.9, 16, 29, stone(0.08, 3), 0.8, 0.3), d0 = sl.d, c = Math.cos(0.5), s = Math.sin(0.5);
  P.push({ ...sl, lo: [-5, -5, 15], hi: [5, 5, 30], d: (x, y, z) => d0(x * c + y * s + (z - 16) * 0.05, -x * s + y * c, z) });
  P.push(blob([3.6, 4.4, 13.4], 1.6, 1.4, 1.2, M([0x6a6660, 0x8e8a84, 0xb4b0a8, 0xd8d4cc], { grain: 0.1 }), 0.3));
  return { prims: P, shadow: [{ u: 1, v: 1, r: 10, a: 0.35 }], cast: 10 };
}

// ---- the Beacon Cairn: a round dry-stone tower, an iron basket of burning peat on top ------------------------
export function beacon(f: number): PropModel {
  const P: Prim[] = [], R0 = 34, R1 = 23, H = 56;
  const Rz = (z: number) => R0 + (R1 - R0) * Math.min(1, Math.max(0, z / H));
  // courses of stone: dark joints every 5.5 texels up, the stones of each course offset from the one below
  const wall: PMat = { ...M(STONER, { grain: 0.24, tex: (x, y, z) => {
    const c = Math.floor(z / 5.5), a = Math.atan2(y, x) * Rz(z) / 8 + c * 0.5, st = Math.floor(a);
    const joint = (z % 5.5) < 0.9 || (a - st) < 0.12 ? -0.28 : 0;
    return joint + (hash3(st, c, 41) - 0.5) * 0.24 + (c % 3 === 0 ? -0.04 : 0.02);
  } }) };
  const moss = M(MOSS, { grain: 0.3 });
  wall.sub = (x, y, z) => (z < 14 && hash3(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2)) < 0.22 - z / 80 ? moss : undefined);
  P.push({ m: wall, k: 0.6, lo: [-R0 - 2, -R0 - 2, 0], hi: [R0 + 2, R0 + 2, H + 1], d: (x, y, z) => Math.max(Math.hypot(x, y) - Rz(z), -z, z - H) });
  // a ring of capstones round the top, a step of slabs up the side for whoever keeps the fire
  for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, r = R1 - 1; P.push(blob([Math.cos(a) * r, Math.sin(a) * r, H + 1.2], 5.4, 4.6, 2.6, stone(0.06 + hash3(i, 0, 42) * 0.08, i), 0.6)); }
  for (let i = 0; i < 6; i++) { const z = 4 + i * 8.6, a = -0.2 + i * 0.3, r = Rz(z) + 2.6; P.push(blob([Math.cos(a) * r, Math.sin(a) * r, z], 5.4, 4, 1.6, stone(0.1, 20 + i), 0.4)); }
  // fallen stones and a stack of fuel at the foot
  for (let i = 0; i < 5; i++) { const a = 1.9 + i * 0.75, r = R0 + 5 + hash3(i, 1, 43) * 4; P.push(blob([Math.cos(a) * r, Math.sin(a) * r, 1.6], 3.6, 3, 2.4, stone(0, 30 + i), 0.5)); }
  for (const [k, z] of [[0, 0], [1, 0], [2, 0], [0.5, 3.4], [1.5, 3.4], [1, 6.8]]) { const a = -0.55 + k * 0.17, r = R0 + 6; turf(P, Math.cos(a) * r, Math.sin(a) * r, z, 8.5, 4.4, 3.2, a, peat(0.02 + hash3(k * 2, z, 43) * 0.08)); }
  // the iron fire basket: a ring, bars, four legs on the capstones, glowing peat in it
  const B0 = H + 3, B1 = H + 19, BR = 11;
  P.push({ m: iron(0.05), k: 0.3, lo: [-BR - 3, -BR - 3, B1 - 2], hi: [BR + 3, BR + 3, B1 + 2], d: (x, y, z) => Math.max(Math.abs(Math.hypot(x, y) - BR) - 1, Math.abs(z - B1) - 1) });
  P.push({ m: iron(0), k: 0.3, lo: [-BR, -BR, B0 + 4], hi: [BR, BR, B0 + 6], d: (x, y, z) => Math.max(Math.abs(Math.hypot(x, y) - BR * 0.6) - 0.9, Math.abs(z - B0 - 5) - 0.9) });
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; P.push(rod([Math.cos(a) * BR * 0.55, Math.sin(a) * BR * 0.55, B0 + 4], [Math.cos(a) * BR, Math.sin(a) * BR, B1 + 1], 0.8, iron(-0.02), 0.8, 0.2)); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; P.push(rod([Math.cos(a) * 7, Math.sin(a) * 7, H + 1], [Math.cos(a) * BR * 0.6, Math.sin(a) * BR * 0.6, B0 + 5], 1, iron(-0.05), 1, 0.3)); }
  P.push(blob([0, 0, B1 - 3], BR * 0.85, BR * 0.85, 4.6, M(COAL, { emit: 0.42, grain: 0.5, tex: (x, y) => (hash3(Math.floor(x * 1.2), Math.floor(y * 1.2), f) - 0.5) * 0.7 }), 0.4));
  // sparks over the fire
  const eyes = [0, 1, 2, 3].map((i) => ({ p: [(hash3(i, f, 44) - 0.5) * 14, (hash3(i, f, 45) - 0.5) * 10, B1 + 22 + hash3(i, f, 46) * 14] as V3, col: i % 2 ? 0xffb04a : 0xffe08a }));
  return {
    prims: P, eyes, halos: [{ p: [0, 0, B1 + 8], r: 26, col: 0xffa040, a: 0.4 }], shadow: [{ u: 0, v: 0, r: 40, a: 0.32 }], cast: 40,
    overlay: (px, at) => { const [x, y] = at([0, 0, B1 - 1]); flame2d(px, Math.floor(x), Math.floor(y), 9, 24, f); },
  };
}

const sheet = (key: LkKind, model: (f: number) => PropModel) => ({ key, ...LK_SHEETS[key], model });
/** The moors' kit for bake-props.ts. */
export const MOORS_KIT = [sheet("lk_peat_stack", peatStack), sheet("lk_peat_bank", peatBank), sheet("lk_way_cairn", wayCairn), sheet("lk_beacon", beacon)];
