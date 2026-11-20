/**
 * The Sunscar's land kit (settlement network step 3): caravans and salt. Kneeling camels (one with a striped saddle
 * cloth, one loaded with salt slabs), stacks of cut salt slabs, a salt pan with its rake, and the caravan halt outside
 * Kel Ashar's east gate: a loaded litter under a striped canopy with the camel string couched round it. 3D-built like
 * oakvale.ts, baked by tools/art/bake-props.ts; frame sizes from client/src/landKitSheets.ts.
 */
import { hash3, mat, type Mat, type Prim } from "../mob3d";
import { blob, box, cloth, grain, rod, type PMat, type PropModel, type V3 } from "../prop3d";
import { BRASSR, OLDR, REDR, ROPER, WOODR } from "../../../../client/src/isoProps";
import { LK_SHEETS, type LkKind } from "../../../../client/src/landKitSheets";

const N = 6, TAU = Math.PI * 2;
const CAMEL = [0x2a1a0c, 0x463018, 0x664626, 0x866036, 0xa47c4a, 0xbe9862, 0xd4b27e];
const CAMEL_DARK = [0x1e120a, 0x341f10, 0x4e301a, 0x6a4426, 0x845a34, 0x9e7046];
const SALT = [0x5a5650, 0x7a766e, 0x9c988e, 0xbab6ac, 0xd4d0c6, 0xeae6de, 0xf8f6f0];
const MUD = [0x2e2014, 0x463220, 0x5e462e, 0x7a5c3e, 0x947452];
const INDIGO = [0x0c1020, 0x161e3a, 0x223058, 0x324478, 0x485e96];
const SAFFRON = [0x3a2208, 0x6a420e, 0x9a6416, 0xc68a22, 0xe2ac3c, 0xf2c868];
const CLAY = [0x2e160c, 0x4e2814, 0x703c1e, 0x90522a, 0xac6a3a, 0xc4865a];

const M = (pal: number[], o: Parameters<typeof mat>[1] = {}): Mat => mat(0, { ramp: pal, ...o });
const wood = (axis: 0 | 1 | 2, pal = WOODR, bias = 0) => M(pal, { tex: (x, y, z) => grain(axis)(x, y, z) + bias, grain: 0.05 });
const salt = (bias = 0) => M(SALT, { grain: 0.14, tex: (x, y, z) => bias + (hash3(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z * 1.5)) < 0.1 ? -0.18 : 0) + (Math.floor(z * 1.2) % 3 === 0 ? -0.05 : 0) });
/** Striped cloth: bands of `a` and `b` across one axis (the caravans' weave). */
function striped(a: number[], b: number[], axis: 0 | 1, w = 4): PMat {
  const ma = M(a, { grain: 0.06 }), mb: PMat = { ...M(b, { grain: 0.06 }) };
  return { ...mb, sub: (x, y) => (Math.floor(((axis ? y : x) + 100) / w) % 2 ? ma : undefined) };
}

/** A prim turned `phi` about z (SDF and texture in the turned frame), then moved by d. */
function place(p: Prim, phi: number, d: V3 = [0, 0, 0]): Prim {
  const c = Math.cos(phi), s = Math.sin(phi), loc = (x: number, y: number): [number, number] => { const X = x - d[0], Y = y - d[1]; return [X * c + Y * s, -X * s + Y * c]; };
  const m0 = p.m as PMat, m: PMat = { ...m0 };
  if (m0.tex) m.tex = (x, y, z) => { const [a, b] = loc(x, y); return m0.tex!(a, b, z - d[2]); };
  if (m0.sub) m.sub = (x, y, z) => { const [a, b] = loc(x, y); return m0.sub!(a, b, z - d[2]); };
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const a of [p.lo[0], p.hi[0]]) for (const b of [p.lo[1], p.hi[1]]) { const u = a * c - b * s, v = a * s + b * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  return { ...p, m, lo: [u0 + d[0], v0 + d[1], p.lo[2] + d[2]], hi: [u1 + d[0], v1 + d[1], p.hi[2] + d[2]], d: (x, y, z) => { const [a, b] = loc(x, y); return p.d(a, b, z - d[2]); } };
}
const turnPt = (q: V3, phi: number, d: V3 = [0, 0, 0]): V3 => [q[0] * Math.cos(phi) - q[1] * Math.sin(phi) + d[0], q[0] * Math.sin(phi) + q[1] * Math.cos(phi) + d[1], q[2] + d[2]];

// ---- kneeling camel: couched on folded legs, chewing, the tail flicking -----------------------------------------
interface CamelParts { prims: Prim[]; eyes: { p: V3; col: number }[] }
/** `load`: 0 a striped saddle cloth, 1 salt slabs roped either side of the hump, 2 bales and a water skin. */
function camelParts(f: number, load: number, dark = false): CamelParts {
  const P: Prim[] = [], ph = (f / N) * TAU, chew = Math.sin(ph * 2) * 0.8, look = Math.sin(ph) * 0.12;
  const coat = M(dark ? CAMEL_DARK : CAMEL, { grain: 0.12, tex: (x, y, z) => (hash3(Math.floor(x / 3), Math.floor(y / 3), Math.floor(z / 3)) - 0.5) * 0.1 });
  // body low on the ground, the hump, the legs folded tight under it (knees just showing in front, hocks behind)
  P.push(blob([0, 0, 13], 21, 11, 11.5, coat, 3));
  P.push(blob([-2, 0, 26], 11, 8, 9, coat, 3));
  for (const s of [-1, 1]) {
    P.push(blob([13, s * 8.4, 3], 5, 2.6, 3, coat, 1.2)); // fore knees
    P.push(blob([-12, s * 10.2, 4], 6, 2.6, 4, coat, 1.2)); // hind hocks
  }
  // the neck: forward and low, then up in the camel's curve; the long head held level
  const hx = 36, hz = 40 + look * 5, hy = look * 18;
  P.push(rod([15, 0, 18], [27, hy * 0.4, 20], 5.2, coat, 4.2, 2.4));
  P.push(rod([27, hy * 0.4, 20], [hx - 3, hy, hz - 1], 4.2, coat, 3.4, 2));
  P.push(blob([hx + 1, hy, hz + 0.6], 7.5, 3.6, 4, coat, 1.4));
  P.push(blob([hx + 7.6, hy, hz - 0.8 + chew * 0.3], 3.6, 3.1, 3, coat, 1));
  P.push(blob([hx + 8.2, hy, hz - 3.4 + chew], 3, 2.4, 1.3, M(dark ? CAMEL_DARK : CAMEL, { tex: () => -0.12 }), 0.6)); // the lower lip, chewing
  for (const s of [-1, 1]) P.push(blob([hx - 4.4, hy + s * 2.8, hz + 3.8], 1.1, 1.1, 2, coat, 0.4)); // small ears
  const eyes = [{ p: [hx + 2, hy + 3.4, hz + 1.6] as V3, col: 0x0a0806 }, { p: [hx + 2, hy - 3.4, hz + 1.6] as V3, col: 0x0a0806 }];
  // the tail, flicking
  P.push(rod([-21, 0, 17], [-24, Math.sin(ph) * 3, 8], 0.8, coat, 0.6, 0.4));
  P.push(blob([-24.2, Math.sin(ph) * 3, 6.8], 1.2, 1.2, 2, M(CAMEL_DARK), 0.4));
  // the halter: a red cord round the muzzle and up behind the ears
  P.push(rod([hx + 5, hy - 3.4, hz - 0.5], [hx + 5, hy + 3.4, hz - 0.5], 0.5, M(REDR), 0.5, 0.2));
  for (const s of [-1, 1]) P.push(rod([hx + 5, hy + s * 3.4, hz - 0.5], [hx - 3, hy + s * 3.2, hz + 3], 0.4, M(REDR), 0.4, 0.2));
  if (load === 0) {
    // a saddle: a striped cloth over the hump, a wooden frame on top, a tassel at each corner
    P.push(blob([-2, 0, 27.6], 12.2, 9.3, 9.6, striped(REDR, SAFFRON, 0, 3), 0.4, 24));
    for (const s of [-1, 1]) P.push(rod([-11, s * 4, 33], [7, s * 4, 33], 0.9, wood(0), 0.9, 0.3));
    P.push(rod([-11, -4, 33], [-11, 4, 33], 0.9, wood(1), 0.9, 0.3), rod([7, -4, 33], [7, 4, 33], 0.9, wood(1), 0.9, 0.3));
    for (const [u, s] of [[-12, -1], [-12, 1], [8, -1], [8, 1]]) P.push(blob([u, s * 9.6, 21], 0.9, 0.9, 1.6, M(INDIGO), 0.3));
  } else if (load === 1) {
    // salt slabs: two either side of the hump in rope slings, one across the top
    for (const s of [-1, 1]) {
      for (const k of [0, 1]) P.push(box(-10, 8, s * 11.5 - 2, s * 11.5 + 2, 15 + k * 7.2, 21.6 + k * 7.2, salt(k * 0.04), 0.6));
      for (const u of [-6, 4]) P.push(rod([u, s * 13.8, 14], [u, s * 9, 34], 0.5, M(ROPER), 0.5, 0.1));
    }
    P.push(box(-10, 6, -6, 6, 34, 38, salt(0.08), 0.6));
    P.push(rod([-2, -7, 38.5], [-2, 7, 38.5], 0.5, M(ROPER), 0.5, 0.1));
  } else {
    // bales in striped cloth and a water skin
    for (const s of [-1, 1]) P.push(blob([-2, s * 12, 23], 8, 4.4, 7, striped(INDIGO, SAFFRON, 0, 2.6), 1));
    P.push(blob([-2, 0, 36], 6.4, 5, 3.4, striped(REDR, OLDR, 1, 2.2), 0.8));
    P.push(blob([8, 9, 22], 3, 2.4, 4.2, M(CLAY, { spec: 0.2 }), 0.6));
  }
  return { prims: P, eyes };
}

function camelModel(f: number, load: number): PropModel {
  const phi = -0.5, { prims, eyes } = camelParts(f, load); // side on, head to the right: the profile reads
  return { prims: prims.map((p) => place(p, phi)), eyes: eyes.map((e) => ({ ...e, p: turnPt(e.p, phi) })), shadow: [{ u: 0, v: 0, r: 24, a: 0.3 }], cast: 16 };
}
export const camel = (f: number) => camelModel(f, 0);
export const camelLoaded = (f: number) => camelModel(f, 1);

// ---- salt stack: slabs cut from the Flats, stacked crosswise on a reed mat, roped, one leaning --------------------
export function saltStack(): PropModel {
  const P: Prim[] = [];
  P.push(box(-18, 18, -12, 12, 0, 1, M(OLDR.map((c) => c + 0x0c0a04), { grain: 0.2, tex: (x) => ((x + 40) % 2 < 0.6 ? -0.15 : 0.05) }), 0.3)); // reed mat
  for (let k = 0; k < 5; k++) {
    const z = 1 + k * 4.6, along = k % 2 === 0;
    for (const o of [-5.5, 5.5]) {
      const j = (hash3(k, o > 0 ? 1 : 0, 81) - 0.5) * 1.6;
      P.push(along ? box(-14 + j, 14 + j, o - 4.6, o + 4.6, z, z + 4.4, salt(k * 0.02), 0.7) : box(o - 4.6, o + 4.6, -10 + j, 10 + j, z, z + 4.4, salt(k * 0.02 + 0.02), 0.7));
    }
  }
  for (const u of [-7, 7]) P.push(rod([u, -11.4, 1], [u, -11.4, 24], 0.5, M(ROPER), 0.5, 0.1), rod([u, -11.4, 24], [u, 11.4, 24], 0.5, M(ROPER), 0.5, 0.1), rod([u, 11.4, 24], [u, 11.4, 1], 0.5, M(ROPER), 0.5, 0.1));
  // a slab leaning on the stack, a broken one at its foot, chips of salt
  P.push(box(16.4, 20.4, -9, 9, 0, 20, salt(0.06), 0.6)); // a slab stood on end
  P.push(box(14, 24, 12, 18, 0, 3.6, salt(0.1), 0.6));
  for (let i = 0; i < 5; i++) P.push(blob([-20 + hash3(i, 1, 82) * 8, 14 + hash3(i, 2, 82) * 4, 0.8], 1.3, 1.1, 0.9, salt(0.15), 0.3));
  return { prims: P.map((p) => place(p, -0.4)), shadow: [{ u: 0, v: 0, r: 20, a: 0.3 }], cast: 14 };
}

// ---- salt pan: a shallow pan behind a mud bank, white crust cracked in plates, a heap raked up, the rake ----------
export function saltPan(): PropModel {
  const P: Prim[] = [], A = 30, B = 18;
  // the bank: a low ring of mud
  P.push({ m: M(MUD, { grain: 0.2 }), k: 0.6, lo: [-A - 4, -B - 4, 0], hi: [A + 4, B + 4, 3], d: (x, y, z) => Math.max(Math.abs(Math.max(Math.abs(x) - A, Math.abs(y) - B)) - 2.4, Math.abs(z - 1) - 1.6) });
  // the crust: cracked plates, the cracks a shade darker and wetter
  const plate = (x: number, y: number) => { const cx = Math.floor((x + 100) / 7 + Math.sin(y * 0.4) * 0.4), cy = Math.floor((y + 100) / 6 + Math.sin(x * 0.5) * 0.4); return { cx, cy }; };
  P.push(box(-A + 1, A - 1, -B + 1, B - 1, 0, 1, M(SALT, { grain: 0.1, tex: (x, y) => { const p = plate(x, y), q = plate(x + 0.9, y + 0.9); return p.cx !== q.cx || p.cy !== q.cy ? -0.42 : 0.12 + (hash3(p.cx, p.cy, 83) - 0.5) * 0.12; } }), 0.2));
  // one corner still wet: brine with a sheen
  P.push(box(A - 14, A - 2, -B + 2, -B + 10, 0.4, 1.1, M([0x2a3436, 0x40504e, 0x5e706c, 0x88968e, 0xb4bcb2], { spec: 0.7, shine: 32 }), 0.3));
  // the heap raked up at one end, a few slabs cut and drying
  P.push(blob([-A + 10, 6, 1], 8, 6, 6, salt(0.1), 1.6, 1));
  for (const [u, v] of [[6, -8], [14, -7]]) P.push(box(u - 3.5, u + 3.5, v - 2.2, v + 2.2, 1, 3.4, salt(0.05), 0.5));
  // the rake: a long handle leant on the bank, its toothed head down in the crust
  P.push(rod([-6, 12, 1.4], [16, 22, 9], 0.7, M(OLDR, { grain: 0.1 }), 0.7, 0.2));
  P.push(rod([-8, 8, 1.4], [-4, 16, 1.4], 0.8, M(OLDR, { grain: 0.1 }), 0.8, 0.2));
  for (let k = 0; k < 4; k++) P.push(rod([-7.5 + k, 8.5 + k * 2.2, 1.4], [-8.4 + k, 8.8 + k * 2.2, 0.2], 0.35, M(OLDR), 0.35, 0.1));
  return { prims: P.map((p) => place(p, 0.2)), shadow: [{ u: 0, v: 0, r: 30, a: 0.1 }], cast: 4 };
}

// ---- the caravan halt: a loaded litter under a striped canopy on four poles, the camel string couched round it ----
function caravanModel(f: number): PropModel {
  const P: Prim[] = [], E: { p: V3; col: number }[] = [], ph = (f / N) * TAU;
  const CU = 34, CV = 26, CZ = 50;
  // canopy poles, guy ropes to pegs, the striped cloth sagging and lifting in the wind
  for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    P.push(rod([su * CU, sv * CV, 0], [su * CU, sv * CV, CZ + 3], 1.3, wood(2, WOODR, 0.02), 1.1, 0.3));
    P.push(blob([su * CU, sv * CV, CZ + 4], 1.4, 1.4, 1.4, M(BRASSR, { spec: 0.4 }), 0.3));
    P.push(rod([su * CU, sv * CV, CZ + 2], [su * (CU + 12), sv * (CV + 10), 0.5], 0.35, M(ROPER), 0.35, 0.1));
  }
  const flap = Math.sin(ph) * 1.6;
  P.push(cloth([-CU - 1, -CV - 1, CZ + 2], [2 * CU + 2, 0, 0], [0, 2 * CV + 2, 0], striped(REDR, SAFFRON, 1, 6.5), (s, t) => -Math.sin(s * Math.PI) * Math.sin(t * Math.PI) * 4 + Math.sin(s * 5 + ph) * 0.6, () => true, 0.6));
  // a valance along the front edge with a fringe that lifts
  P.push(cloth([-CU - 1, CV + 1, CZ + 2], [2 * CU + 2, 0, 0], [0, 1.6 + flap * 0.2, -6], striped(INDIGO, SAFFRON, 0, 4), (s) => Math.sin(s * 9 + ph) * 0.6, (s, t) => t < 0.75 || Math.floor(s * 40) % 2 === 0, 0.5));
  // the litter: a box on carrying poles, resting on two trestles, roof hooped, curtains drawn
  for (const u of [-14, 14]) for (const s of [-1, 1]) P.push(rod([u - 4, s * 8, 0], [u, s * 8, 10], 1, wood(2, OLDR), 1, 0.3), rod([u + 4, s * 8, 0], [u, s * 8, 10], 1, wood(2, OLDR), 1, 0.3));
  for (const s of [-1, 1]) P.push(rod([-32, s * 8, 11], [32, s * 8, 11], 1.3, wood(0, WOODR, 0.06), 1.3, 0.3));
  P.push(box(-15, 15, -10, 10, 11.5, 26, M(WOODR, { grain: 0.05, tex: (x, y, z) => grain(0)(x, y, z) + ((z % 5) < 0.6 ? -0.18 : 0.04) }), 0.6));
  P.push({ m: striped(INDIGO, OLDR.map((c) => c + 0x1a1610), 0, 3), k: 0.4, lo: [-16, -11, 25], hi: [16, 11, 34], d: (x, y, z) => Math.max(Math.hypot(y, z - 25) - 10.6, Math.abs(x) - 15.5, 25 - z) });
  for (const u of [-15.5, 15.5]) P.push(box(u - 0.6, u + 0.6, -6, 6, 13, 24, M(REDR, { grain: 0.06, tex: (_x, y) => (Math.floor(y + 10) % 3 ? 0 : -0.15) }), 0.3));
  P.push(blob([0, 0, 35], 1.4, 1.4, 1.6, M(BRASSR, { spec: 0.5 }), 0.3));
  // salt slabs and bales piled by the litter, water jars in the shade
  for (let k = 0; k < 3; k++) P.push(box(-30, -18, 12 - k * 0.6, 22 - k * 0.6, k * 4.2, k * 4.2 + 4, salt(k * 0.04), 0.6));
  P.push(blob([24, 16, 5], 6.4, 4.4, 5, striped(INDIGO, SAFFRON, 0, 2.6), 1), blob([20, 19, 12], 5.6, 4, 3.8, striped(REDR, OLDR, 1, 2.2), 0.8));
  for (const [u, v] of [[-6, 20], [0, 22], [-3, 17]]) {
    P.push({ m: M(CLAY, { spec: 0.15, grain: 0.08 }), k: 0.6, lo: [u - 5, v - 5, 0], hi: [u + 5, v + 5, 12], d: (x, y, z) => Math.hypot(x - u, y - v) - (3.8 * Math.sin(Math.min(1, z / 10) * Math.PI * 0.9) + 1.4) * (z > 10 ? 0 : 1) - (z > 10 ? 1.6 - (z - 10) : 0) });
  }
  // the camel string: three couched round the canopy, one loaded with salt, one with bales, the lead camel saddled
  const herd: [number, number, number, number, boolean][] = [[-58, -8, 0.5, 1, false], [52, -30, 2.3, 2, true], [56, 26, -0.4, 0, false]];
  herd.forEach(([u, v, phi, load, dark], i) => {
    const c = camelParts((f + i * 2) % N, load, dark);
    P.push(...c.prims.map((p) => place(p, phi, [u, v, 0])));
    E.push(...c.eyes.map((e) => ({ ...e, p: turnPt(e.p, phi, [u, v, 0]) })));
  });
  // a hitching rail the lead rope runs to
  for (const v of [-34, -18]) P.push(rod([-40, v, 0], [-40, v, 14], 1.1, wood(2, OLDR), 1, 0.3));
  P.push(rod([-40, -36, 13], [-40, -16, 13], 0.9, wood(1, OLDR), 0.9, 0.3));
  return { prims: P, eyes: E, shadow: [{ u: 0, v: 0, r: 44, a: 0.24 }, { u: -58, v: -8, r: 22, a: 0.22 }, { u: 52, v: -30, r: 22, a: 0.22 }, { u: 56, v: 26, r: 22, a: 0.22 }], cast: 40 };
}
/** Turned so the canopy's long side faces the road (shared/landmarks.ts "caravan": solid round the canopy only). */
export const caravan = (f: number) => { const m = caravanModel(f); return { ...m, prims: m.prims.map((p) => place(p, -0.1)), eyes: m.eyes?.map((e) => ({ ...e, p: turnPt(e.p, -0.1) })) }; };

const sheet = (key: LkKind, model: (f: number) => PropModel) => ({ key, ...LK_SHEETS[key], model });
/** The Sunscar's kit for bake-props.ts. */
export const SUNSCAR_KIT = [sheet("lk_camel", camel), sheet("lk_camel_load", camelLoaded), sheet("lk_salt_stack", saltStack), sheet("lk_salt_pan", saltPan), sheet("lk_caravan", caravan)];
