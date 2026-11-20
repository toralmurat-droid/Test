/**
 * The Red Badlands' land kit (settlement network step 3): mines and cattle. Rust-red longhorns for the Rustwater
 * drovers' pen, a plank water trough, an ore cart of cinnabar on a stub of rail, and the Cinnabar Pits' headframe: a
 * timber frame and winch over the shaft, its sheave wheel turning. 3D-built like oakvale.ts, baked by
 * tools/art/bake-props.ts; frame sizes from client/src/landKitSheets.ts.
 */
import { hash3, mat, type Mat, type Prim } from "../mob3d";
import { blob, box, grain, rod, scaleProp, type PMat, type PropModel, type V3 } from "../prop3d";
import { BONER, IRONR, OLDR, ROPER, STRAWR, WOODR } from "../../../../client/src/isoProps";
import { LK_SHEETS, type LkKind } from "../../../../client/src/landKitSheets";

const N = 6, TAU = Math.PI * 2;
/** Longhorn coat: rust and tan, a pale belly. */
const RUST = [0x200c06, 0x3a160a, 0x5a2410, 0x7c3418, 0x9a4a24, 0xb46434, 0xc88050];
const PALE = [0x4a3a2a, 0x76644c, 0xa08a6a, 0xc4ae88, 0xdccaa4];
const HOOF = [0x0c0a08, 0x1c1814, 0x2e2822];
const HORN = [0x3a3020, 0x6a5c40, 0x9e9070, 0xccc0a0, 0xe8e0c8];
const WATER = [0x0a1a1e, 0x163038, 0x264c54, 0x3e6e74, 0x6a9a9a];
/** Cinnabar ore: blood red crystal in grey rock. */
const ORE = [0x2a0806, 0x52100a, 0x821c10, 0xb02a18, 0xd84a2a, 0xf07a50];
const ROCK = [0x1e1410, 0x2e201a, 0x423028, 0x584236, 0x705646, 0x8a6c58];

const M = (pal: number[], o: Parameters<typeof mat>[1] = {}): Mat => mat(0, { ramp: pal, ...o });
const wood = (axis: 0 | 1 | 2, pal = WOODR, bias = 0) => M(pal, { tex: (x, y, z) => grain(axis)(x, y, z) + bias, grain: 0.05 });
/** Sun-bleached timber: grey, cracked along the grain. */
const bleached = (axis: 0 | 1 | 2, bias = 0) => M(OLDR.map((c) => c + 0x0a0806), { grain: 0.08, tex: (x, y, z) => grain(axis)(x, y, z) + 0.1 + bias });
const iron = (bias = 0) => M(IRONR, { spec: 0.35, shine: 14, tex: () => bias - 0.06, grain: 0.08 });
const rusty = (bias = 0) => M([0x1a0e08, 0x2e1a10, 0x4a2a18, 0x6a3c20, 0x8a5430, 0xa46c40], { spec: 0.15, grain: 0.18, tex: () => bias });

/** A prim turned `phi` about z (SDF and texture in the turned frame). */
function turn(p: Prim, phi: number): Prim {
  const c = Math.cos(phi), s = Math.sin(phi), loc = (x: number, y: number): [number, number] => [x * c + y * s, -x * s + y * c];
  const m0 = p.m as PMat, m: PMat = { ...m0 };
  if (m0.tex) m.tex = (x, y, z) => { const [a, b] = loc(x, y); return m0.tex!(a, b, z); };
  if (m0.sub) m.sub = (x, y, z) => { const [a, b] = loc(x, y); return m0.sub!(a, b, z); };
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const a of [p.lo[0], p.hi[0]]) for (const b of [p.lo[1], p.hi[1]]) { const u = a * c - b * s, v = a * s + b * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  return { ...p, m, lo: [u0, v0, p.lo[2]], hi: [u1, v1, p.hi[2]], d: (x, y, z) => { const [a, b] = loc(x, y); return p.d(a, b, z); } };
}

// ---- longhorn: a lean rangy steer, horns a yard wide, swishing its tail ----------------------------------------
export function longhorn(f: number): PropModel {
  const P: Prim[] = [], ph = (f / N) * TAU, swish = Math.sin(ph), graze = f >= 2 && f <= 4 ? 1 : 0;
  const coat: PMat = { ...M(RUST, { grain: 0.12, tex: (x, y, z) => (hash3(Math.floor(x / 3), Math.floor(y / 3), Math.floor(z / 3)) - 0.5) * 0.12 }) };
  const pale = M(PALE, { grain: 0.1 });
  // a pale belly and blaze, rust on the back: the speckled roan of the drovers' herd
  coat.sub = (x, y, z) => (z < 16 + Math.sin(x * 0.3) * 2 || (Math.sin(x * 0.4 + y * 0.7) + Math.sin(z * 0.5 - x * 0.2) > 1.3) ? pale : undefined);
  for (const [u, v] of [[-14, -5], [-14, 5], [14, -5], [14, 5]]) {
    P.push(rod([u, v, 2], [u + 0.4, v, 17], 2, coat, 2.6, 0.6));
    P.push(rod([u, v, 0.3], [u, v, 2.4], 2, M(HOOF), 2, 0.3));
  }
  P.push(blob([0, 0, 23], 21, 9, 9.5, coat, 3));
  P.push(blob([10, 0, 28], 8, 8, 6, coat, 2)); // the hump over the shoulders
  const hz = 27 - graze * 13, hu = 29 + graze * 3;
  P.push(rod([16, 0, 25], [hu - 4, 0, hz], 6, coat, 4.6, 2));
  P.push(blob([hu, 0, hz], 6.4, 4.4, 4.6, coat, 1.6));
  P.push(blob([hu + 6, 0, hz - 2.2], 3.2, 3.6, 3.2, pale, 1.2));
  // the horns: out sideways, a little forward, then up and out at the tips
  const hm = M(HORN, { spec: 0.25, shine: 12, tex: (_x, y) => Math.abs(y) > 18 ? 0.25 : -0.05 });
  for (const s of [-1, 1]) {
    P.push(rod([hu - 1.5, s * 3, hz + 3], [hu + 0.5, s * 13, hz + 4], 1.6, hm, 1.1, 0.5));
    P.push(rod([hu + 0.5, s * 13, hz + 4], [hu + 1.6, s * 22, hz + 8], 1.1, hm, 0.5, 0.3));
    P.push(blob([hu - 3, s * 5, hz + 1.5], 1.2, 2.4, 1.3, coat, 0.5)); // ears
  }
  const eyes = [{ p: [hu + 2.5, 3.4, hz + 1.4] as V3, col: 0x0a0808 }, { p: [hu + 2.5, -3.4, hz + 1.4] as V3, col: 0x0a0808 }];
  P.push(rod([-20, 0, 26], [-22, swish * 4.5, 10], 0.7, coat, 0.6, 0.4));
  P.push(blob([-22.2, swish * 4.5, 8.4], 1.3, 1.3, 2.4, M(HOOF.concat([0x40362c])), 0.4));
  if (graze) P.push(rod([hu + 8, -1, hz - 3.6], [hu + 10, 1.6, hz - 4.2], 0.45, M(STRAWR, { tex: () => 0.1 })));
  return { prims: P.map((p) => turn(p, 0.35)), eyes: eyes.map((e) => ({ ...e, p: [e.p[0] * Math.cos(0.35) - e.p[1] * Math.sin(0.35), e.p[0] * Math.sin(0.35) + e.p[1] * Math.cos(0.35), e.p[2]] as V3 })), shadow: [{ u: 0, v: 0, r: 22, a: 0.3 }], cast: 18 };
}

// ---- trough: a plank trough on trestles, brimming, a bucket beside it -------------------------------------------
export function trough(): PropModel {
  const P: Prim[] = [], L = 21, W = 7, Z0 = 5, Z1 = 15;
  const plank = (axis: 0 | 1) => M(WOODR, { grain: 0.05, tex: (x, y, z) => grain(axis)(x, y, z) + 0.02 + ((z % 3.4) < 0.5 ? -0.18 : 0) });
  P.push(box(-L, L, -W, W, Z0, Z1, plank(0), 0.8));
  P.push({ ...box(-L + 1.6, L - 1.6, -W + 1.6, W - 1.6, Z0 + 2, Z1 + 2, plank(0), 0.4), cut: true });
  P.push(box(-L + 1.8, L - 1.8, -W + 1.8, W - 1.8, Z0 + 2, Z1 - 1.2, M(WATER, { spec: 0.6, shine: 30, tex: (x, y) => Math.sin(x * 0.6 + y) * 0.06 }), 0.2, 0.1));
  for (const u of [-L + 4, L - 4]) for (const v of [-1, 1]) P.push(rod([u, v * (W + 1), 0], [u, v * (W - 2), Z0 + 1], 1.2, wood(2, OLDR), 1.1, 0.3));
  for (const u of [-L + 6, 0, L - 6]) P.push(box(u - 0.8, u + 0.8, -W - 0.6, W + 0.6, Z1 - 2.2, Z1 - 0.6, iron(0), 0.3));
  // a wooden bucket and a wet patch of ground
  P.push({ ...rod([L + 5, 6, 0], [L + 6, 6, 8], 4.2, plank(1), 4.8, 0.3) });
  P.push({ ...rod([L + 5, 6, 2], [L + 5, 6, 10], 3.2, plank(1), 3.8, 0.2), cut: true });
  P.push(rod([L + 2, 6, 9], [L + 10, 6, 9], 0.4, iron(0), 0.4, 0.2));
  return { prims: P.map((p) => turn(p, -0.75)), shadow: [{ u: 0, v: 0, r: 22, a: 0.3 }, { u: 4, v: 6, r: 16, a: 0.2 }], cast: 10 };
}

// ---- ore cart: an iron-banded tub on four wheels on a stub of rail, heaped with cinnabar ------------------------
export function oreCart(): PropModel {
  const P: Prim[] = [];
  // rails and sleepers, running a little past the cart each way
  for (let i = -3; i <= 3; i++) P.push(box(i * 8 - 1.6, i * 8 + 1.6, -10, 10, 0, 1.6, bleached(1, -0.05 + hash3(i, 0, 51) * 0.1), 0.4));
  for (const v of [-6, 6]) P.push(box(-28, 26, v - 0.8, v + 0.8, 1.6, 3.2, rusty(0.05), 0.2));
  // wheels
  for (const u of [-9, 9]) for (const v of [-6.6, 6.6]) {
    P.push({ m: rusty(-0.02), k: 0.2, lo: [u - 6, v - 2, 0], hi: [u + 6, v + 2, 12], d: (x, y, z) => Math.max(Math.hypot(x - u, z - 7.6) - 4.6, Math.abs(y - v) - 1) });
    P.push(blob([u, v + Math.sign(v) * 1.2, 7.6], 1.4, 0.8, 1.4, iron(0.1), 0.2));
  }
  // the tub: wider at the top, planked, iron bands at the corners
  const tub = M(WOODR, { grain: 0.06, tex: (x, y, z) => grain(0)(x, y, z) + ((z % 4) < 0.6 ? -0.2 : 0.02) });
  P.push({ m: tub, k: 0.4, lo: [-18, -12, 9], hi: [18, 12, 26], d: (x, y, z) => { const g = (z - 9) / 15 * 2.5; return Math.max(Math.abs(x) - 14 - g, Math.abs(y) - 8.5 - g * 0.8, Math.abs(z - 17.5) - 7.5); } });
  P.push({ m: tub, k: 0.2, cut: true, lo: [-16, -10, 12], hi: [16, 10, 28], d: (x, y, z) => Math.max(Math.abs(x) - 14.5, Math.abs(y) - 9, 12.5 - z) });
  for (const z of [11, 23.5]) P.push({ m: iron(0.02), k: 0.2, lo: [-18, -12, z - 1], hi: [18, 12, z + 1], d: (x, y, zz) => { const g = (zz - 9) / 15 * 2.5; return Math.max(Math.abs(Math.max(Math.abs(x) - 14 - g, Math.abs(y) - 8.5 - g * 0.8)) - 0.6, Math.abs(zz - z) - 0.8); } });
  // a heap of ore lumps over the rim: red cinnabar in grey-brown rock
  const lumps: Prim[] = [];
  for (let i = 0; i < 14; i++) {
    const u = (hash3(i, 1, 52) - 0.5) * 24, v = (hash3(i, 2, 52) - 0.5) * 14, z = 22 + (1 - Math.hypot(u / 14, v / 8)) * 6 + hash3(i, 3, 52) * 2, r = 2.6 + hash3(i, 4, 52) * 1.8;
    lumps.push(blob([u, v, z], r, r * 0.9, r * 0.8, hash3(i, 5, 52) < 0.45 ? M(ORE, { spec: 0.4, shine: 20, grain: 0.2 }) : M(ROCK, { grain: 0.25 }), 0.6));
  }
  P.push(...lumps);
  // a pick leant on the cart, a lump fallen by the rail
  P.push(rod([19, 12, 0.5], [16, 9, 24], 0.9, wood(2, OLDR), 0.9, 0.2));
  P.push(rod([12, 9, 23], [21, 9, 25], 0.9, iron(0.05), 0.4, 0.2));
  P.push(blob([-20, 12, 1.6], 2.6, 2.4, 1.8, M(ORE, { spec: 0.4, grain: 0.2 }), 0.4));
  return { prims: P.map((p) => turn(p, -0.5)), shadow: [{ u: 0, v: 0, r: 22, a: 0.3 }], cast: 14 };
}

// ---- the Cinnabar headframe: two braced legs over the shaft, a sheave wheel at the head, the winch drum behind ---
function headframeModel(f: number): PropModel {
  const P: Prim[] = [], spin = (f / N) * (TAU / 8); // a spoke's turn over the loop: the rope runs slowly
  const timber = (axis: 0 | 1 | 2, b = 0) => M(WOODR, { grain: 0.06, tex: (x, y, z) => grain(axis)(x, y, z) + b + (hash3(Math.floor(x / 6), Math.floor(y / 6), Math.floor(z / 9)) - 0.5) * 0.1 });
  // the shaft collar: a square of heavy beams round a black hole, spoil heaped round it
  const S = 26;
  for (const s of [-1, 1]) { P.push(box(-S - 4, S + 4, s * S - 3, s * S + 3, 0, 5, timber(0, -0.04), 0.6)); P.push(box(s * S - 3, s * S + 3, -S + 3, S - 3, 0, 5, timber(1, -0.02), 0.6)); }
  P.push({ ...box(-S + 3, S - 3, -S + 3, S - 3, -12, 6, M([0x050404, 0x0a0806, 0x100c0a]), 0.3), cut: true });
  P.push(box(-S + 3, S - 3, -S + 3, S - 3, -2, 0.5, M([0x050404, 0x0a0806, 0x14100c]), 0.2));
  for (let i = 0; i < 9; i++) { const a = 0.6 + i * 0.45, r = S + 11 + hash3(i, 1, 61) * 6; P.push(blob([Math.cos(a) * r, Math.sin(a) * r, 1], 6, 5, 3 + hash3(i, 2, 61) * 2, hash3(i, 3, 61) < 0.3 ? M(ORE, { grain: 0.2 }) : M(ROCK, { grain: 0.26 }), 1.4)); }
  // the legs: two pairs leaning in to the head, with cross braces
  const HZ = 104, head = (s: number): V3 => [0, s * 7, HZ];
  const foot = (u: number, s: number): V3 => [u, s * (S + 1), 4];
  for (const s of [-1, 1]) for (const u of [-S, S]) P.push(rod(foot(u, s), [u * 0.18, s * 7.5, HZ - 2], 2.4, timber(2, 0.03), 2, 0.4));
  for (const s of [-1, 1]) for (const k of [0.3, 0.58, 0.8]) {
    const z = 4 + (HZ - 6) * k, w = S * (1 - k * 0.82) + 0.4, v = s * ((S + 1) * (1 - k) + 7.5 * k);
    P.push(rod([-w, v, z], [w, v, z], 1.3, timber(0, -0.02), 1.3, 0.3));
    if (k < 0.8) P.push(rod([-w, v, z], [w * 0.8, v, z + (HZ - 6) * 0.26], 0.9, timber(0, -0.06), 0.9, 0.2));
  }
  for (const k of [0.3, 0.58]) { const z = 4 + (HZ - 6) * k, u = S * (1 - k * 0.82); for (const uu of [-u, u]) P.push(rod([uu, -(S + 1) * (1 - k) - 7.5 * k, z], [uu, (S + 1) * (1 - k) + 7.5 * k, z], 1.1, timber(1, -0.04), 1.1, 0.3)); }
  // the head: a cap beam across, the back stay down to the winch side
  P.push(box(-6, 6, -11, 11, HZ - 3, HZ + 2, timber(1, 0.04), 0.6));
  for (const s of [-1, 1]) P.push(rod([-3, s * 7, HZ - 1], [-62, s * 13, 6], 1.9, timber(2, 0), 1.7, 0.4));
  P.push(rod([-40, -9.6, 42], [-40, 9.6, 42], 1.1, timber(1, -0.04), 1.1, 0.3));
  // the sheave wheel on the head, turning
  const WR = 15, WZ = HZ + 12, wm = rusty(0.06);
  P.push({ m: wm, k: 0.2, lo: [-WR - 2, -2, WZ - WR - 2], hi: [WR + 2, 2, WZ + WR + 2], d: (x, y, z) => Math.max(Math.abs(Math.hypot(x, z - WZ) - WR + 1) - 1.4, Math.abs(y) - 1.4) });
  for (let k = 0; k < 6; k++) { const a = spin + (k / 6) * TAU; P.push(rod([0, 0, WZ], [Math.cos(a) * (WR - 1.5), 0, WZ + Math.sin(a) * (WR - 1.5)], 0.7, wm, 0.7, 0.2)); }
  P.push(blob([0, 0, WZ], 2.6, 2.6, 2.6, iron(0.05), 0.3));
  for (const s of [-1, 1]) P.push(rod([0, s * 6, WZ - 8], [0, s * 2, WZ], 1.4, timber(2, 0.02), 1.2, 0.3)); // the bearers
  // the rope: down the front into the shaft (a bucket hanging in it, rising and sinking), back over to the drum
  const bz = 34 + Math.sin((f / N) * TAU) * 10;
  const rope = M(ROPER, { tex: () => 0.05 });
  P.push(rod([WR, 0, WZ], [WR, 0, bz + 9], 0.55, rope, 0.55, 0.1));
  P.push(rod([-WR + 1, 0, WZ + 2], [-52, 0, 19], 0.55, rope, 0.55, 0.1));
  P.push({ m: rusty(0), k: 0.3, lo: [WR - 6, -6, bz - 1], hi: [WR + 6, 6, bz + 10], d: (x, y, z) => Math.max(Math.hypot(x - WR, y) - 4.6 - (z - bz) * 0.08, Math.abs(z - bz - 4) - 4) });
  P.push({ m: rusty(0), k: 0.1, cut: true, lo: [WR - 5, -5, bz + 1], hi: [WR + 5, 5, bz + 10], d: (x, y, z) => Math.max(Math.hypot(x - WR, y) - 3.6, bz + 2 - z) });
  P.push(rod([WR - 4.8, 0, bz + 8], [WR, 0, bz + 10], 0.35, iron(0), 0.35, 0.1)); P.push(rod([WR + 4.8, 0, bz + 8], [WR, 0, bz + 10], 0.35, iron(0), 0.35, 0.1));
  // the winch: a drum between two A-frames, a crank, rope wound on it
  const DU = -54, DZ = 16;
  for (const s of [-1, 1]) { P.push(rod([DU - 7, s * 11, 0], [DU, s * 11, DZ + 2], 1.4, timber(2), 1.3, 0.3)); P.push(rod([DU + 7, s * 11, 0], [DU, s * 11, DZ + 2], 1.4, timber(2), 1.3, 0.3)); }
  P.push({ m: M(ROPER, { grain: 0.1, tex: (_x, y) => ((y + 20) % 1.6 < 0.4 ? -0.2 : 0.04) }), k: 0.3, lo: [DU - 7, -10, DZ - 7], hi: [DU + 7, 10, DZ + 7], d: (x, y, z) => Math.max(Math.hypot(x - DU, z - DZ) - 5.6, Math.abs(y) - 9) });
  for (const s of [-1, 1]) P.push({ m: timber(1, -0.04), k: 0.3, lo: [DU - 9, s * 10 - 1.5, DZ - 9], hi: [DU + 9, s * 10 + 1.5, DZ + 9], d: (x, y, z) => Math.max(Math.hypot(x - DU, z - DZ) - 7.4, Math.abs(y - s * 10) - 0.9) });
  const ca = -spin * 3;
  P.push(rod([DU, -12, DZ], [DU, -15, DZ], 1, iron(0), 1, 0.2));
  P.push(rod([DU, -15, DZ], [DU + Math.cos(ca) * 7, -15, DZ + Math.sin(ca) * 7], 0.9, iron(0.05), 0.9, 0.2));
  P.push(rod([DU + Math.cos(ca) * 7, -15, DZ + Math.sin(ca) * 7], [DU + Math.cos(ca) * 7, -19, DZ + Math.sin(ca) * 7], 0.9, wood(1, OLDR), 0.9, 0.2));
  // a lamp hung on the leg and a skull nailed over the shaft for luck
  P.push(blob([S * 0.82, S * 0.82, 40], 2.4, 2.4, 2.8, M(BONER, { tex: () => 0.08 }), 0.4));
  const eyes = [{ p: [S * 0.82 + 1.6, S * 0.82 + 1.6, 40.6] as V3, col: 0x0a0806 }, { p: [S * 0.82 + 2.2, S * 0.82 + 0.6, 40.6] as V3, col: 0x0a0806 }];
  return { prims: P.map((p) => turn(p, PHI)), eyes: eyes.map((e) => ({ ...e, p: [e.p[0] * Math.cos(PHI) - e.p[1] * Math.sin(PHI), e.p[0] * Math.sin(PHI) + e.p[1] * Math.cos(PHI), e.p[2]] as V3 })), shadow: [{ u: 0, v: 0, r: 44, a: 0.3 }, { u: -30, v: -20, r: 20, a: 0.2 }], cast: 60 };
}

/** The headframe's turn: the winch stands to the west, left of the frame on screen. */
const PHI = -0.785;
/** Built small and scaled up to the 2.8-tile box (shared/landmarks.ts). */
export const headframe = (f: number) => scaleProp(headframeModel(f), 1.8);

const sheet = (key: LkKind, model: (f: number) => PropModel) => ({ key, ...LK_SHEETS[key], model });
/** The badlands' kit for bake-props.ts. */
export const BADLANDS_KIT = [sheet("lk_longhorn", longhorn), sheet("lk_trough", trough), sheet("lk_ore_cart", oreCart), sheet("lk_headframe", headframe)];
