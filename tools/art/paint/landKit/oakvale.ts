/**
 * Oakvale's land kit (settlement network step 3): farms and mills. Stooks of sheaves, a scarecrow in a patched coat,
 * a handcart of grain sacks, straw bee skeps on a bench, a hide-drying frame for the Hunter's Camp, and the North
 * Meadow post mill with its sails turning. 3D-built like props3d.ts (same ramps, light, outline), baked by
 * tools/art/bake-props.ts to client/public/assets/hd/props/lk_*.png; frame sizes from client/src/landKitSheets.ts.
 */
import { hash3, mat, type Mat, type Prim } from "../mob3d";
import { blob, box, cloth, grain, rod, type PMat, type PropModel, type V3 } from "../prop3d";
import { IRONR, OLDR, REDR, ROPER, STONER, STRAWR, WOODR } from "../../../../client/src/isoProps";
import { LK_SHEETS, type LkKind } from "../../../../client/src/landKitSheets";

const N = 6, TAU = Math.PI * 2;
const SACK = [0x2a2218, 0x42382a, 0x5e5240, 0x7a6c54, 0x968868, 0xb0a27e, 0xc6b896];
const HIDE = [0x22140c, 0x3a2414, 0x58381e, 0x78502c, 0x96683c, 0xb2864e, 0xc8a06a];
const CANVAS = [0x3a3226, 0x5e5240, 0x837458, 0xa8987a, 0xc8baa0, 0xe0d4bc];
const BLUE = [0x10141e, 0x1c2638, 0x2c3a54, 0x3e5070, 0x56688a, 0x7284a2];
const CROW = [0x08080a, 0x121216, 0x1c1c22, 0x2a2a32, 0x3a3a44];
const BEE = [0x2a1e08, 0xd8a020];
const BRICK = [0x1e100c, 0x34190f, 0x4e2616, 0x6a3420, 0x84442a, 0x9e5a3a];

const M = (pal: number[], o: Parameters<typeof mat>[1] = {}): Mat => mat(0, { ramp: pal, ...o });
const wood = (axis: 0 | 1 | 2, pal = WOODR, bias = 0) => M(pal, { tex: (x, y, z) => grain(axis)(x, y, z) + bias, grain: 0.05 });
const iron = (bias = 0) => M(IRONR, { spec: 0.35, shine: 14, tex: () => bias - 0.04, grain: 0.06 });
const stone = (bias = 0) => M(STONER, { grain: 0.24, tex: (x, y, z) => bias + (hash3(Math.floor(x), Math.floor(y), Math.floor(z * 1.3)) < 0.08 ? -0.2 : 0) });
/** Straw in long streaks along the stalks (axis), the odd bright ear. */
const straw = (bias = 0) => M(STRAWR, { grain: 0.12, tex: (x, y, z) => bias + (hash3(Math.floor(x * 0.9), Math.floor(y * 0.9), Math.floor(z / 5)) - 0.5) * 0.3 });

/**
 * A prim built in a turned frame: its local axes (a, b) are the model's (u, v) turned by `phi` about z. SDFs keep
 * their distances under a turn, so the model just looks the other way; textures read local coordinates.
 */
function turn(p: Prim, phi: number): Prim {
  const c = Math.cos(phi), s = Math.sin(phi);
  const loc = (x: number, y: number): [number, number] => [x * c + y * s, -x * s + y * c];
  const m0 = p.m as PMat, m: PMat = { ...m0 };
  if (m0.tex) m.tex = (x, y, z) => { const [a, b] = loc(x, y); return m0.tex!(a, b, z); };
  if (m0.sub) m.sub = (x, y, z) => { const [a, b] = loc(x, y); return m0.sub!(a, b, z); };
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const a of [p.lo[0], p.hi[0]]) for (const b of [p.lo[1], p.hi[1]]) { const u = a * c - b * s, v = a * s + b * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  return { ...p, m, lo: [u0, v0, p.lo[2]], hi: [u1, v1, p.hi[2]], d: (x, y, z) => { const [a, b] = loc(x, y); return p.d(a, b, z); } };
}
const turnV = (q: V3, phi: number): V3 => [q[0] * Math.cos(phi) - q[1] * Math.sin(phi), q[0] * Math.sin(phi) + q[1] * Math.cos(phi), q[2]];

// ---- stook: sheaves leaning together to dry on the stubble -------------------------------------------------------
export function stook(): PropModel {
  const P: Prim[] = [], n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.3, r = 8 + hash3(i, 1, 41) * 1.6, h = 25 + hash3(i, 2, 41) * 4;
    const foot: V3 = [Math.cos(a) * r, Math.sin(a) * r, 0], top: V3 = [Math.cos(a) * 1.6, Math.sin(a) * 1.6, h];
    P.push(rod(foot, top, 2.9, straw(-0.06 + hash3(i, 3, 41) * 0.08), 1.8, 0.3));
    // the binding band two thirds up, then the ears flaring out over the top
    const band: V3 = [foot[0] + (top[0] - foot[0]) * 0.62, foot[1] + (top[1] - foot[1]) * 0.62, h * 0.62];
    P.push(blob(band, 2.7, 2.7, 1, M(ROPER, { tex: () => -0.06 }), 0.2));
    P.push(rod([Math.cos(a) * 1.4, Math.sin(a) * 1.4, h - 1], [Math.cos(a) * 5.5, Math.sin(a) * 5.5, h + 4.5], 1.6, straw(0.16), 2.4, 0.3));
  }
  // a few loose stalks on the ground
  for (let i = 0; i < 4; i++) { const a = hash3(i, 5, 41) * TAU, d = 9 + hash3(i, 6, 41) * 2; P.push(rod([Math.cos(a) * d, Math.sin(a) * d, 0.4], [Math.cos(a + 0.4) * (d + 4), Math.sin(a + 0.4) * (d + 4), 0.4], 0.45, straw(0.05), 0.4, 0.2)); }
  return { prims: P, shadow: [{ u: 1, v: 1, r: 11, a: 0.35 }], cast: 10 };
}

// ---- scarecrow: a cross of poles in a patched coat and a straw hat, a crow on one arm --------------------------------
export function scarecrow(f: number): PropModel {
  const t = (f / N) * TAU, sw = Math.sin(t) * 1.1, P: Prim[] = [];
  const at = (z: number): [number, number] => [sw * z / 60, -sw * z / 120];
  const side: V3 = [0.7071, -0.7071, 0]; // the arms run across the screen
  P.push(rod([0, 0, 0], [...at(56), 56] as V3, 1.3, wood(2, OLDR), 1.2, 0.4));
  for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.5; P.push(blob([Math.cos(a) * 2.6, Math.sin(a) * 2.6, 0.5], 1.4, 1.2, 1, M(STRAWR, { tex: () => -0.2 }), 0.4)); }
  const [au, av] = at(44), arm = (k: number): V3 => [au + side[0] * k, av + side[1] * k, 44 + Math.abs(k) * 0.05];
  P.push(rod(arm(-17), arm(17), 0.9, wood(0, OLDR), 0.9, 0.4));
  // the coat: blue with a red patch, buttoned over a straw belly, sleeves along the arm
  const coat: PMat = { ...M(BLUE, { grain: 0.06, tex: (_x, _y, z) => (z > 40 ? 0.06 : 0) }) };
  const patch = M(REDR, { tex: () => -0.05 }), seam = M(ROPER, { tex: () => -0.1 });
  coat.sub = (x, y, z) => { const s = x * side[0] + y * side[1]; return Math.abs(s - 4) < 2.6 && Math.abs(z - 34) < 2.6 ? patch : Math.abs(s - 4) < 3.1 && Math.abs(z - 34) < 3.1 ? seam : undefined; };
  const [bu, bv] = at(36);
  P.push(blob([bu, bv, 36], 6.2, 6.2, 9, coat, 1));
  P.push(rod(arm(-3), arm(-12), 2.6, coat, 2.1, 0.8));
  P.push(rod(arm(3), arm(12), 2.6, coat, 2.1, 0.8));
  for (const k of [-1, 1]) for (let j = 0; j < 3; j++) P.push(rod(arm(k * 12.5), [...arm(k * (15 + j)).slice(0, 2), 42 - j * 1.6] as V3, 0.5, straw(0.1), 0.35, 0.2)); // straw out of the cuffs
  // coat tails flapping in the wind
  P.push(cloth([bu - side[0] * 6 + 0.6, bv - side[1] * 6 + 0.6, 29], [side[0] * 12, side[1] * 12, 0], [0, 0, -9], coat, (s, tt) => Math.sin(t - s * 4) * 1.4 * tt, (s, tt) => !(tt > 0.8 && hash3(Math.floor(s * 9), 1, 43) < 0.4)));
  for (let i = 0; i < 4; i++) P.push(rod([bu + side[0] * (i - 1.5) * 2.4, bv + side[1] * (i - 1.5) * 2.4, 27.5], [bu + side[0] * (i - 1.5) * 2.6 + 0.4, bv + side[1] * (i - 1.5) * 2.6 + 0.4, 24 + hash3(i, 2, 43) * 2], 0.5, straw(0.08), 0.35, 0.2));
  // head: a stuffed sack, a wide straw hat
  const [hu, hv] = at(51);
  P.push(blob([hu, hv, 50.5], 4.4, 4.4, 4.8, M(SACK, { grain: 0.08, tex: () => 0.04 }), 0.6));
  P.push(blob([hu, hv, 55], 9, 9, 1.3, straw(0.05), 0.3));
  const crown: PMat = { ...straw(0.1) }, band = M(REDR, { tex: () => -0.1 });
  crown.sub = (_x, _y, z) => (z > 55.6 && z < 56.9 ? band : undefined);
  P.push(blob([hu, hv, 57.4], 4.4, 4.4, 3.4, crown, 0.6, 55));
  const eyes: { p: V3; col: number }[] = [];
  const face = (ds: number, dz: number, col: number) => eyes.push({ p: [hu + 3.2 + side[0] * ds, hv + 3.2 + side[1] * ds, 50.5 + dz], col });
  face(-1.4, 1, 0x1a120c); face(1.4, 1, 0x1a120c);
  for (let i = -2; i <= 2; i++) face(i * 0.7, -1.6 + (Math.abs(i) === 2 ? 0.5 : 0), 0x3a2c1e);
  // a crow on the left arm, bobbing
  const bob = f % 3 === 0 ? 0.6 : 0, cw = arm(-14.5);
  const crow = M(CROW, { spec: 0.3, shine: 10 });
  P.push(blob([cw[0], cw[1], cw[2] + 3.4 + bob], 2.2, 2.2, 2.6, crow, 0.6));
  P.push(blob([cw[0] + 1.2, cw[1] + 1.2, cw[2] + 6.2 + bob], 1.5, 1.5, 1.5, crow, 0.6));
  P.push(rod([cw[0] + 2, cw[1] + 2, cw[2] + 6 + bob], [cw[0] + 3.6, cw[1] + 3.6, cw[2] + 5.4 + bob], 0.5, M([0x2a2418, 0x4a4030, 0x6a5c44]), 0.2, 0.2));
  P.push(rod([cw[0] - 1.6, cw[1] - 1.6, cw[2] + 3], [cw[0] - 3.8, cw[1] - 3.8, cw[2] + 1.6], 1, crow, 0.4, 0.3));
  eyes.push({ p: [cw[0] + 2.1, cw[1] + 2.1, cw[2] + 6.8 + bob], col: 0xd0c8a0 });
  return { prims: P, eyes, shadow: [{ u: 0.5, v: 0.5, r: 7, a: 0.35 }], cast: 10 };
}

// ---- grain cart: a two-wheeled handcart of tied sacks, resting on its shafts ------------------------------------------
function wheel(P: Prim[], c: V3, R: number, axis: 1 | 0, spin = 0) {
  const rim = M(WOODR, { grain: 0.06, tex: (x, y, z) => 0.04 + (hash3(Math.floor(Math.atan2(z - c[2], (axis ? x : y) - c[axis ? 0 : 1]) * 5), 0, 7) - 0.5) * 0.18 });
  P.push({ m: rim, k: 0.2, lo: [c[0] - R - 2, c[1] - R - 2, c[2] - R - 2], hi: [c[0] + R + 2, c[1] + R + 2, c[2] + R + 2], d: (x, y, z) => {
    const r = Math.hypot(axis ? x - c[0] : y - c[1], z - c[2]), w = axis ? y - c[1] : x - c[0];
    return Math.max(Math.abs(r - R + 0.9) - 1.5, Math.abs(w) - 1.3);
  } });
  P.push({ ...rod(axis ? [c[0], c[1] - 1.6, c[2]] : [c[0] - 1.6, c[1], c[2]], axis ? [c[0], c[1] + 1.6, c[2]] : [c[0] + 1.6, c[1], c[2]], R + 0.1, iron(-0.05), R + 0.1, 0.1), d: (x, y, z) => {
    const r = Math.hypot(axis ? x - c[0] : y - c[1], z - c[2]), w = axis ? y - c[1] : x - c[0];
    return Math.max(Math.abs(r - R) - 0.45, Math.abs(w) - 1.5);
  }, m: M(IRONR.slice(0, 4), { spec: 0.12, shine: 10 }) });
  for (let k = 0; k < 8; k++) { const a = spin + (k / 8) * TAU, o = (r: number): V3 => axis ? [c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r] : [c[0], c[1] + Math.cos(a) * r, c[2] + Math.sin(a) * r]; P.push(rod(o(2), o(R - 1.5), 0.7, wood(2, WOODR, 0.04), 0.6, 0.3)); }
  P.push(blob(c, axis ? 2.6 : 2.2, axis ? 2.2 : 2.6, 2.6, wood(0, WOODR, -0.04), 0.3));
}
export function grainCart(): PropModel {
  const P: Prim[] = [], tilt = 0.12; // the bed tips forward onto its shafts
  const z = (u: number) => 14 - u * tilt;
  // bed: planked floor and low side boards, along u
  const plank = (axis: 0 | 1, b = 0) => M(WOODR, { grain: 0.05, tex: (x, y, zz) => grain(axis)(x, y, zz) + b + (Math.abs((axis ? x : y) % 4.5) < 0.5 ? -0.16 : 0) });
  const bed = (u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, m: Mat) => {
    const p = box(u0, u1, v0, v1, z0, z1, m, 0.4), d0 = p.d, cu = (u0 + u1) / 2;
    p.d = (x, y, zz) => d0(x, y, zz + (x - cu) * tilt); p.lo = [p.lo[0], p.lo[1], p.lo[2] - 4]; p.hi = [p.hi[0], p.hi[1], p.hi[2] + 4]; P.push(p);
  };
  bed(-20, 18, -11, 11, 12, 14.5, plank(1, 0.05));
  for (const v of [-11, 11]) bed(-20, 18, v - 0.9, v + 0.9, 14, 19.5, plank(0, -0.04));
  bed(-21, -19.2, -11, 11, 14, 19.5, plank(1, -0.08));
  // shafts run out the front to the ground, a prop stick under them
  for (const v of [-7, 7]) P.push(rod([-22, v, z(-22) + 0.5], [38, v * 0.8, 2], 1.1, wood(0, WOODR, 0.02), 0.9, 0.3));
  P.push(rod([30, -5.6, 3], [30, 5.6, 3], 0.8, wood(1), 0.8, 0.3));
  // the wheels on an axle under the middle
  P.push(rod([-2, -13, 9.5], [-2, 13, 9.5], 1, iron(-0.05), 1, 0.2));
  for (const v of [-13.6, 13.6]) wheel(P, [-2, v, 9.5], 9.5, 1, 0.2);
  // sacks: tied necks, piled two high, one leaning against a wheel
  const sack = (c: V3, r: number, h: number, seed: number, lean = 0) => {
    const m = M(SACK, { grain: 0.1, tex: (x, y, zz) => -0.08 + (hash3(Math.floor(x / 2), Math.floor(y / 2), Math.floor(zz / 2) + seed) - 0.5) * 0.12 });
    // a slumped sack: wide at the foot, a shoulder, then the gathered neck and its floppy ear of cloth
    P.push(blob([c[0], c[1], c[2] - h * 0.15], r * 1.08, r * 0.95, h * 0.75, m, 1.4));
    P.push(blob([c[0] + lean * 0.3, c[1], c[2] + h * 0.35], r * 0.8, r * 0.72, h * 0.55, m, 1.6));
    const neck: V3 = [c[0] + lean * 0.6, c[1], c[2] + h * 0.85];
    P.push(rod(neck, [neck[0] + lean * 0.3, neck[1], neck[2] + 1.6], 1.5, m, 1.2, 0.8));
    P.push(blob([neck[0], neck[1], neck[2] + 0.5], 1.8, 1.8, 0.6, M(ROPER, { tex: () => -0.08 }), 0.2));
    P.push(blob([neck[0] + 1.2 + lean, neck[1] - 0.6, neck[2] + 2.2], 1.9, 1.5, 1, m, 0.5));
  };
  sack([-12, -5, 22], 6, 6.5, 1); sack([-12, 5.5, 22], 6, 6.2, 2); sack([2, -5.5, 20.5], 6, 6.6, 3); sack([2, 5, 20.2], 5.8, 6, 4);
  sack([12, 0, 19], 5.8, 6.2, 5, 1); sack([-6, 0, 31], 5.6, 5.8, 6, -1);
  sack([6, 19, 5.8], 5.2, 5.8, 7, 2);
  // spilt grain by the leaning sack
  const eyes: { p: V3; col: number }[] = [];
  for (let i = 0; i < 18; i++) eyes.push({ p: [9 + hash3(i, 1, 51) * 8, 21 + hash3(i, 2, 51) * 6, 0.2], col: STRAWR[4 + (i % 3)] });
  return { prims: P, eyes, shadow: [{ u: 2, v: 0, r: 20, a: 0.32 }], cast: 14 };
}

// ---- beehives: three straw skeps on a plank bench, bees about them -------------------------------------------------
export function beehives(f: number): PropModel {
  const P: Prim[] = [], t = (f / N) * TAU;
  const along: V3 = [0.7071, -0.7071, 0]; // the bench runs across the screen
  const pt = (s: number, du = 0, z = 0): V3 => [along[0] * s + du, along[1] * s + du, z];
  const plank = M(OLDR, { grain: 0.06, tex: (x, y, z) => grain(0)(x, y, z) + 0.05 });
  P.push(turn(box(-27, 27, -4.6, 4.6, 8, 10.4, plank, 0.5), -Math.PI / 4));
  for (const s of [-21, 21]) for (const k of [-1, 1]) P.push(rod(pt(s, k * 3, 0), pt(s, k * 2.4, 8.2), 1.1, wood(2, OLDR), 1, 0.3));
  const eyes: { p: V3; col: number }[] = [];
  for (const [i, s] of [[0, -15], [1, 0], [2, 15]] as const) {
    const c = pt(s, 0, 10), h = 13 + hash3(i, 1, 61) * 2, r = 6.8;
    const coil = M(STRAWR, { grain: 0.1, tex: (_x, _y, z) => (((z - c[2]) % 2.6) < 0.55 ? -0.22 : 0.04) + (hash3(i, Math.floor(z / 2.6), 62) - 0.5) * 0.1 });
    P.push(blob([c[0], c[1], c[2]], r, r, h, coil, 0.6, c[2]));
    P.push(blob([c[0], c[1], c[2] + h - 0.5], 2, 2, 1.4, straw(0.1), 0.4)); // a twist of straw on top
    // the flight hole at the foot, toward the viewer
    P.push({ ...blob([c[0] + r * 0.72, c[1] + r * 0.72, c[2] + 1], 1.4, 1.4, 1.2, M([0x0a0806, 0x140e0a, 0x1e1610]), 0.2), cut: true });
    // bees: dots on loops round the hole and out over the bench
    for (let b = 0; b < 4; b++) {
      const ph = t * (b % 2 ? 1 : -1) + b * 1.7 + i * 2.3, rr = 4 + b * 2.2;
      const q: V3 = [c[0] + r * 0.9 + Math.cos(ph) * rr, c[1] + r * 0.9 + Math.sin(ph) * rr * 0.7, c[2] + 3 + Math.sin(ph * 2 + b) * 3 + b];
      eyes.push({ p: q, col: BEE[1] }, { p: [q[0] + 0.7, q[1] - 0.7, q[2]], col: BEE[0] });
    }
  }
  // a clay pot and a flat stone at the bench end
  P.push(blob(pt(30, 2, 3), 3.6, 3.6, 3.6, M(BRICK, { grain: 0.08 }), 0.6, 0));
  P.push(rod(pt(30, 2, 6), pt(30, 2, 7.2), 2.4, M(BRICK, { tex: () => 0.1 }), 2.6, 0.2));
  P.push(blob(pt(-30, -2, 0.8), 4, 3.2, 1.4, stone(), 0.4));
  return { prims: P, eyes, shadow: [{ u: 0, v: 0, r: 18, a: 0.3 }], cast: 12 };
}

// ---- hide frame: a deer hide laced into a pole square, a pelt over the top bar --------------------------------------
export function hideFrame(f: number): PropModel {
  const P: Prim[] = [], t = (f / N) * TAU, sw = Math.sin(t);
  const side: V3 = [0.7071, -0.7071, 0];
  const at = (s: number, z: number, du = 0): V3 => [side[0] * s + du, side[1] * s + du, z];
  for (const s of [-16, 16]) {
    P.push(rod(at(s, 0), at(s * 0.95, 46), 1.4, wood(2, OLDR), 1.2, 0.4));
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + s; P.push(blob(at(s + Math.cos(a) * 2.4, 0.5, Math.sin(a) * 2.4), 1.3, 1.1, 1, stone(-0.05), 0.4)); }
  }
  P.push(rod(at(-18, 44), at(18, 44), 1.1, wood(0, OLDR), 1.1, 0.4));
  // the square of lashed poles, a little back from the posts
  const fz0 = 8, fz1 = 38, fs = 12, back = -1.2;
  for (const z of [fz0, fz1]) P.push(rod(at(-fs - 2, z, back), at(fs + 2, z, back), 0.8, wood(0), 0.8, 0.3));
  for (const s of [-fs, fs]) P.push(rod(at(s, fz0 - 2, back), at(s, fz1 + 2, back), 0.8, wood(2), 0.8, 0.3));
  for (const [s, z] of [[-16, fz0], [16, fz0], [-16, fz1], [16, fz1]]) P.push(rod(at(s, z, back), at(s * 0.8, z, back), 1, M(ROPER), 1, 0.2));
  // the hide: an irregular outline (legs at the corners), a dark spine, laced to the poles
  const hide: PMat = { ...M(HIDE, { grain: 0.1, tex: (x, y, z) => 0.12 - Math.hypot(x * side[0] + y * side[1], z - 21) / 40 + (hash3(Math.floor(x / 3), Math.floor(y / 3), Math.floor(z / 3)) - 0.5) * 0.12 }) };
  const spine = M(HIDE, { tex: () => -0.22 });
  hide.sub = (x, y) => (Math.abs(x * side[0] + y * side[1]) < 1.2 ? spine : undefined);
  const W = (fs - 2) * 2, Hh = fz1 - fz0 - 4;
  const shape = (s: number, tt: number) => {
    const x = (s - 0.5) * 2, y = (tt - 0.5) * 2, r = Math.hypot(x * 1.15, y * 0.95), j = hash3(Math.floor(s * 16), Math.floor(tt * 16), 71) * 0.07;
    const leg = Math.abs(Math.abs(x) - Math.abs(y) * 0.9) < 0.2 - Math.hypot(x, y) * 0.06 && Math.hypot(x, y) < 1.38; // four legs out to the corners
    return r + j < 0.86 || leg || (Math.abs(x) < 0.12 && y > 0 && y < 1.05); // and the tail
  };
  P.push(cloth(at(-W / 2, fz1 - 2, back + 0.3), [side[0] * W, side[1] * W, 0], [0, 0, -Hh], hide, (s, tt) => Math.sin(s * Math.PI) * Math.sin(tt * Math.PI) * (0.9 + sw * 0.3), shape, 0.7));
  for (let i = 0; i < 5; i++) {
    const k = (i + 0.5) / 5;
    P.push(rod(at(-fs, fz0 + 4 + k * (Hh - 4), back), at(-fs + 3.2, fz0 + 4 + k * (Hh - 4), back + 0.3), 0.3, M(ROPER), 0.3, 0.1));
    P.push(rod(at(fs, fz0 + 4 + k * (Hh - 4), back), at(fs - 3.2, fz0 + 4 + k * (Hh - 4), back + 0.3), 0.3, M(ROPER), 0.3, 0.1));
    P.push(rod(at(-fs + 3 + k * (W - 6), fz1, back), at(-fs + 3 + k * (W - 6), fz1 - 3, back + 0.3), 0.3, M(ROPER), 0.3, 0.1));
  }
  // a furred pelt folded over the top bar, swinging
  const fur = M([0x1a120c, 0x2e2016, 0x463020, 0x5e4430, 0x7a5c40, 0x947858], { grain: 0.2, tex: (x, y, z) => (hash3(Math.floor(x), Math.floor(y), Math.floor(z / 2)) - 0.5) * 0.25 });
  P.push(cloth(at(4, 44.6, 0.9), [side[0] * 11, side[1] * 11, 0], [1.6 + sw * 0.8, 1.6 + sw * 0.8, -15], fur, (s, tt) => Math.sin(t - tt * 3) * 0.6 * tt, (s, tt) => !(tt > 0.85 && Math.abs(s - 0.5) < 0.3) && !(tt > 0.92), 0.9));
  P.push(cloth(at(4, 44.6, -1.2), [side[0] * 11, side[1] * 11, 0], [-0.6, -0.6, -9], fur, () => 0, (_s, tt) => tt < 0.95, 0.8));
  return { prims: P, shadow: [{ u: 0, v: 0, r: 16, a: 0.3 }], cast: 14 };
}

// ---- the North Meadow windmill: a post mill on crossed trestles, tail pole behind, four sails turning ----------------
/** Turn of the buck (radians about z): the sails face the camera, a little to the right. */
const PHI = 0.62;
export function windmill(f: number): PropModel {
  const P: Prim[] = [], L: Prim[] = [];
  const add = (p: Prim) => L.push(p);
  const weather = (bias = 0) => M(WOODR, { grain: 0.05, tex: (x, y, z) => bias + grain(0)(x, y, z) * 0.6 + ((z % 4.6) < 0.8 ? -0.2 : 0) + (hash3(Math.floor(x / 9), Math.floor(z / 4.6), 81) - 0.5) * 0.12 });
  // brick piers and crossed trestles under the post
  for (const [a, b] of [[30, 0], [-30, 0], [0, 30], [0, -30]]) { add(box(a - 5, a + 5, b - 5, b + 5, 0, 7, M(BRICK, { grain: 0.18, tex: (_x, _y, z) => ((z % 3.5) < 0.6 ? -0.18 : 0) }), 0.6)); }
  add(box(-34, 34, -2.6, 2.6, 7, 12, wood(0, OLDR, 0.04), 0.5));
  add(box(-2.6, 2.6, -34, 34, 7, 12, wood(1, OLDR, 0.02), 0.5));
  for (const [a, b] of [[27, 0], [-27, 0], [0, 27], [0, -27]]) add(rod([a, b, 11], [a * 0.12, b * 0.12, 46], 1.8, wood(2, OLDR), 1.6, 0.5));
  add(rod([0, 0, 10], [0, 0, 60], 4.6, wood(2, OLDR, 0.03), 4.2, 0.6));
  // the buck: weatherboarded body, a curved roof, door and ladder at the back
  const A0 = -22, A1 = 22, B = 18, Z0 = 58, Z1 = 132, RZ = Z1 - 14;
  add(box(A0, A1, -B, B, Z0, Z1, weather(), 0.8, 0.4));
  add(box(A0 - 1.5, A1 + 1.5, -B - 1.5, B + 1.5, Z0 - 2, Z0 + 2, wood(0, WOODR, -0.08), 0.5)); // sole plates
  for (const [a, b] of [[A0, -B], [A1, -B], [A0, B], [A1, B]]) add(box(a - 1.6, a + 1.6, b - 1.6, b + 1.6, Z0, Z1, wood(2, WOODR, 0.08), 0.5)); // corner posts
  const roof = M(WOODR, { grain: 0.08, tex: (x, y, z) => -0.12 + (Math.abs(x) > A1 + 1.5 ? ((Math.abs(y) % 4.4) < 0.8 ? -0.2 : 0.04) : ((x % 5) < 0.8 ? -0.2 : 0.04)) + (hash3(Math.floor(x / 5), Math.floor(Math.atan2(z - RZ, y) * 6), 82) - 0.5) * 0.14 });
  add({ m: roof, k: 0.6, lo: [A0 - 4, -B - 4, Z1 - 8], hi: [A1 + 4, B + 4, Z1 + 14], d: (x, y, z) => Math.max(Math.hypot(y, z - RZ) - 25, Math.abs(x) - (A1 + 2.5), Z1 - 6 - z) });
  // windows and the meal door: dark panes in the boards
  const dark = M([0x0a0806, 0x140e0a, 0x22180f, 0x30241a]);
  add({ ...box(-6, 6, B - 1, B + 2, 90, 102, dark, 0.4), cut: true });
  add({ ...box(-6, 6, -B - 2, -B + 1, 90, 102, dark, 0.4), cut: true });
  add(box(A1 - 0.4, A1 + 1.6, -6, 6, 70, 80, dark, 0.3));
  add({ ...box(A0 - 2, A0 + 1, -6, 6, 60, 84, dark, 0.4), cut: true });
  // the ladder down from the back door, the tail pole beside it to the ground (the miller turns the mill on it)
  for (const b of [-6.5, 6.5]) add(rod([A0 - 1, b, 60], [A0 - 34, b, 2], 1.1, wood(2, OLDR), 1, 0.3));
  for (let i = 1; i < 9; i++) { const k = i / 9; add(rod([A0 - 1 - 33 * k, -6.5, 60 - 58 * k], [A0 - 1 - 33 * k, 6.5, 60 - 58 * k], 0.6, wood(1, OLDR), 0.6, 0.2)); }
  add(rod([A0 - 2, 0, 68], [A0 - 62, 0, 6], 1.9, wood(0, WOODR), 1.5, 0.4));
  add(blob([A0 - 63, 0, 4], 3, 3, 4, wood(2, OLDR), 0.5));
  // windshaft and the sails, in the plane a = SA
  const SA = A1 + 9, HZ = 116, R = 92, spin = (f / N) * (Math.PI / 2) + 0.18;
  add(rod([A1 - 3, 0, HZ - 3], [SA + 1, 0, HZ], 3.2, wood(0, WOODR, 0.05), 3, 0.5));
  add(blob([SA + 1.5, 0, HZ], 4.4, 4.4, 4.4, wood(0, WOODR, -0.06), 0.6));
  add(blob([SA + 4.4, 0, HZ], 1.8, 1.8, 1.8, iron(-0.15), 0.3));
  const canvas: PMat = { ...M(CANVAS, { grain: 0.05, tex: (_x, y, z) => (Math.hypot(y, z - HZ) % 9 < 1.1 ? -0.16 : 0.02) }) };
  for (let k = 0; k < 4; k++) {
    const ang = spin + (k / 4) * TAU, dr: V3 = [0, Math.cos(ang), Math.sin(ang)], dt: V3 = [0, -Math.sin(ang), Math.cos(ang)];
    const p = (r: number, w: number, da = 0): V3 => [SA + da, dr[1] * r + dt[1] * w, HZ + dr[2] * r + dt[2] * w];
    add(rod(p(3, 0), p(R, 0), 1.8, wood(0, WOODR, 0.04), 1.1, 0.4)); // the stock
    const w0 = 1.6, w1 = 17;
    add(rod(p(20, w1), p(R, w1), 0.8, wood(0, WOODR), 0.8, 0.2)); // hemlath
    for (let i = 0; i <= 9; i++) { const r = 20 + (R - 20) * i / 9; add(rod(p(r, 0), p(r, w1 + 0.6), 0.55, wood(0, WOODR, -0.04), 0.55, 0.15)); } // sail bars
    // the canvas, spread on two sails and half furled on the others
    const spread = k % 2 === 0 ? 1 : 0.55;
    add(cloth(p(21, w0, -0.6), [dr[0] * (R - 23), dr[1] * (R - 23), dr[2] * (R - 23)], [0, dt[1] * (w1 - w0) * spread, dt[2] * (w1 - w0) * spread], canvas, (s, tt) => -Math.sin(tt * Math.PI) * 1.2 * (0.6 + 0.4 * s), () => true, 0.45));
    if (spread < 1) add(rod(p(21, (w1 - w0) * spread + w0 + 0.6, -0.6), p(R - 2, (w1 - w0) * spread + w0 + 0.6, -0.6), 1.2, canvas, 1.2, 0.3));
  }
  for (const q of L) P.push(turn(q, PHI));
  // the mill's own shadow, and a worn ring of grass round the trestle
  const tail = turnV([A0 - 44, 0, 0], PHI);
  return { prims: P, shadow: [{ u: 0, v: 0, r: 40, a: 0.3 }, { u: tail[0], v: tail[1], r: 12, a: 0.25 }], cast: 34 };
}

const sheet = (key: LkKind, model: (f: number) => PropModel) => ({ key, ...LK_SHEETS[key], model });
/** Oakvale's kit for bake-props.ts. */
export const OAKVALE_KIT = [
  sheet("lk_stook", stook), sheet("lk_scarecrow", scarecrow), sheet("lk_grain_cart", grainCart), sheet("lk_beehives", beehives),
  sheet("lk_hide_frame", hideFrame), sheet("lk_windmill", windmill),
];
