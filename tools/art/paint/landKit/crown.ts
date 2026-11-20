/**
 * The Crown of the Marches' land kit (settlement network step 3): pilgrims and tourneys. Heralds' pavilions in two
 * liveries, a candle shrine with votive lights, a quintain with its shield and sandbag swinging, a bundle of pilgrims'
 * staves, ribbon posts for the Pilgrims' Way, and the Lists on the Tourney Grounds: a viewing stand under striped cloth
 * (`lk_lists`) and the tilt barrier in front of it (`lk_tilt`, its own sprite so heroes in the riders' lane sort between
 * them). 3D-built like oakvale.ts, baked by tools/art/bake-props.ts; frame sizes from client/src/landKitSheets.ts.
 */
import { hash3, mat, type Mat, type Prim } from "../mob3d";
import { blob, box, cloth, grain, rod, type PMat, type PropModel, type V3 } from "../prop3d";
import { BRASSR, IRONR, OLDR, REDR, ROPER, STONER, WOODR } from "../../../../client/src/isoProps";
import { LK_SHEETS, type LkKind } from "../../../../client/src/landKitSheets";

const N = 6, TAU = Math.PI * 2;
const CREAM = [0x3a3226, 0x5e5442, 0x857a62, 0xaca088, 0xcec4aa, 0xe8e0c8, 0xf6f0de];
const BLUE = [0x0c1224, 0x16203c, 0x22305a, 0x30447a, 0x445c98, 0x5c76b2, 0x7890c6];
const GOLD = [0x3a2408, 0x5e3c0e, 0x8a6018, 0xb48424, 0xd8a83a, 0xeec862, 0xf8e08e];
const WAX = [0x5a5040, 0x8a7e66, 0xb4aa90, 0xd6ceb6, 0xeee8d4, 0xfaf6ea];
const MARBLE = [0x3a3a40, 0x585860, 0x787a80, 0x9a9ca0, 0xbcbcbc, 0xd8d6d0, 0xeceae2];
const SACK = [0x2a2218, 0x42382a, 0x5e5240, 0x7a6c54, 0x968868, 0xb0a27e];
const GREEN = [0x0c1a10, 0x163020, 0x22462e, 0x2e5e3c, 0x3e7a4e, 0x569866];
const DARK = [0x0a0808, 0x141010, 0x1e1816, 0x2a221e];

const M = (pal: number[], o: Parameters<typeof mat>[1] = {}): Mat => mat(0, { ramp: pal, ...o });
const wood = (axis: 0 | 1 | 2, pal = WOODR, bias = 0) => M(pal, { tex: (x, y, z) => grain(axis)(x, y, z) + bias, grain: 0.05 });
const stone = (pal = STONER, bias = 0) => M(pal, { grain: 0.2, tex: (x, y, z) => bias + (hash3(Math.floor(x), Math.floor(y), Math.floor(z * 1.3)) < 0.07 ? -0.18 : 0) });
/** Two-colour cloth: `b` where `pick` says so, `a` elsewhere (stripes, gores, quartered shields). */
function two(a: number[], b: number[], pick: (x: number, y: number, z: number) => boolean, o: Parameters<typeof mat>[1] = {}): PMat {
  const mb = M(b, { grain: 0.06, ...o });
  return { ...M(a, { grain: 0.06, ...o }), sub: (x, y, z) => (pick(x, y, z) ? mb : undefined) };
}
/** A livery: the field, the stripe and the trim colours of one herald's house. */
interface Livery { a: number[]; b: number[]; trim: number[] }
const RED_HOUSE: Livery = { a: REDR, b: CREAM, trim: GOLD };
const BLUE_HOUSE: Livery = { a: BLUE, b: GOLD, trim: CREAM };

/** A prim turned `phi` about z and moved by d (as sunscar.ts `place`). */
function place(p: Prim, phi: number, d: V3 = [0, 0, 0]): Prim {
  const c = Math.cos(phi), s = Math.sin(phi), loc = (x: number, y: number): [number, number] => { const X = x - d[0], Y = y - d[1]; return [X * c + Y * s, -X * s + Y * c]; };
  const m0 = p.m as PMat, m: PMat = { ...m0 };
  if (m0.tex) m.tex = (x, y, z) => { const [a, b] = loc(x, y); return m0.tex!(a, b, z - d[2]); };
  if (m0.sub) m.sub = (x, y, z) => { const [a, b] = loc(x, y); return m0.sub!(a, b, z - d[2]); };
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const a of [p.lo[0], p.hi[0]]) for (const b of [p.lo[1], p.hi[1]]) { const u = a * c - b * s, v = a * s + b * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  return { ...p, m, lo: [u0 + d[0], v0 + d[1], p.lo[2] + d[2]], hi: [u1 + d[0], v1 + d[1], p.hi[2] + d[2]], d: (x, y, z) => { const [a, b] = loc(x, y); return p.d(a, b, z - d[2]); } };
}

/** A pennant on a pole top at `top`, flying along `dir` (unit, horizontal), waving with phase ph. */
function pennant(top: V3, dir: [number, number], len: number, ht: number, m: Mat, ph: number): Prim {
  return cloth([top[0], top[1], top[2]], [dir[0] * len, dir[1] * len, 0], [0, 0, -ht], m,
    (s, t) => Math.sin(s * 5 - ph) * 2.2 * s + (t - 0.5) * s * 1.2, (s, t) => Math.abs(t - 0.5) < 0.5 * (1 - s * 0.85), 0.5);
}
/** A heater shield standing upright in the plane spanned by e (horizontal unit) and z, quartered in the livery. */
function shield(c: V3, e: [number, number], w: number, h: number, L: Livery): Prim {
  const n: [number, number] = [-e[1], e[0]];
  const m = two(L.a, L.b, (x, y, z) => { const s = (x - c[0]) * e[0] + (y - c[1]) * e[1]; return (s > 0) !== (z > c[2]); }, { spec: 0.15 });
  return { m, k: 0.3, lo: [c[0] - w - 2, c[1] - w - 2, c[2] - h - 1], hi: [c[0] + w + 2, c[1] + w + 2, c[2] + h * 0.6 + 1], d: (x, y, z) => {
    const s = (x - c[0]) * e[0] + (y - c[1]) * e[1], t = (x - c[0]) * n[0] + (y - c[1]) * n[1], zz = z - c[2];
    // a flat top, straight sides, then the point: width narrows below the middle
    const half = zz > 0 ? w : w * Math.max(0, 1 + zz / h) ** 0.7;
    return Math.max(Math.abs(t) - 0.9, Math.abs(s) - half, zz - h * 0.6, -zz - h);
  } };
}

// ---- pavilion: a round tent in a herald's livery, gored roof, scalloped valance, door flaps tied back, a pennant ----
const R = 34, HW = 30, HT = 68;
function pavilion(f: number, L: Livery): PropModel {
  const P: Prim[] = [], ph = (f / N) * TAU;
  const ang = (x: number, y: number) => Math.atan2(y, x);
  const stripe = (x: number, y: number) => Math.floor((ang(x, y) + Math.PI) / (TAU / 16)) % 2 === 0;
  const door = (x: number, y: number, z: number) => { let d = ang(x, y) - Math.PI / 4; d = Math.atan2(Math.sin(d), Math.cos(d)); return Math.abs(d) < 0.32 && z < HW - 3; };
  // the wall: a thin shell, the door cut out of it; a dark inside behind it
  const wallM = two(L.a, L.b, (x, y) => stripe(x, y));
  P.push({ m: wallM, k: 0.2, lo: [-R - 2, -R - 2, 0], hi: [R + 2, R + 2, HW + 1], d: (x, y, z) => {
    const d = Math.max(Math.abs(Math.hypot(x, y) - R) - 1, Math.abs(z - HW / 2) - HW / 2);
    return door(x, y, z) ? Math.max(d, 1) : d;
  } });
  P.push({ m: M(DARK), k: 0.2, lo: [-R, -R, 0], hi: [R, R, HW], d: (x, y, z) => Math.max(Math.hypot(x, y) - (R - 5), Math.abs(z - HW / 2) - HW / 2) });
  // the door flaps, tied back either side
  for (const s of [-1, 1]) {
    const a = Math.PI / 4 + s * 0.42, ca = Math.cos(a), sa = Math.sin(a);
    P.push(blob([ca * (R + 1.5), sa * (R + 1.5), HW * 0.55], 3.2, 3.2, HW * 0.48, M(L.b, { grain: 0.06 }), 0.6));
    P.push(rod([ca * (R + 3), sa * (R + 3), HW * 0.5], [ca * (R + 3), sa * (R + 3), HW * 0.5 + 1], 1.4, M(L.trim), 1.4, 0.2));
  }
  // the roof: a gored cone over the wall, its eave a little out
  const RR = R + 4, n = Math.hypot(HT - HW, RR);
  P.push({ m: two(L.a, L.b, (x, y) => stripe(x, y)), k: 0.4, lo: [-RR - 1, -RR - 1, HW - 3], hi: [RR + 1, RR + 1, HT + 1], d: (x, y, z) => {
    const r = Math.hypot(x, y);
    return Math.max(((r - RR) * (HT - HW) + (z - HW) * RR) / n, HW - 2 - z);
  } });
  // the valance round the eave: scallops in the trim colour
  P.push({ m: M(L.trim, { grain: 0.05 }), k: 0.2, lo: [-RR - 2, -RR - 2, HW - 8], hi: [RR + 2, RR + 2, HW], d: (x, y, z) => {
    const a = ang(x, y), bot = HW - 7 + Math.abs(Math.sin(a * 12)) * 3.5;
    return Math.max(Math.abs(Math.hypot(x, y) - RR + 0.5) - 0.9, z - (HW - 0.5), bot - z);
  } });
  // the finial and the pole with the house's pennant
  P.push(rod([0, 0, HT - 2], [0, 0, HT + 16], 0.9, wood(2), 0.8, 0.2), blob([0, 0, HT + 0.5], 2.2, 2.2, 2, M(BRASSR, { spec: 0.5 }), 0.3));
  P.push(pennant([0, 0, HT + 15], [0.75, -0.66], 20, 7, M(L.trim, { grain: 0.04 }), ph));
  // guy ropes to pegs
  for (const a of [Math.PI * 0.75 + 0.3, -Math.PI * 0.25 - 0.3, Math.PI * 1.25, Math.PI * 0.25 + 1.1, Math.PI * 0.25 - 1.1]) {
    const ca = Math.cos(a), sa = Math.sin(a);
    P.push(rod([ca * RR, sa * RR, HW - 1], [ca * (RR + 12), sa * (RR + 12), 0.6], 0.35, M(ROPER), 0.35, 0.1));
    P.push(rod([ca * (RR + 12), sa * (RR + 12), 0], [ca * (RR + 12), sa * (RR + 12), 3], 0.7, wood(2, OLDR), 0.6, 0.1));
  }
  // a shield on a stand by the door: whose pavilion this is
  P.push(rod([R + 10, -6, 0], [R + 10, -6, 22], 0.8, wood(2), 0.8, 0.2));
  P.push(shield([R + 10.5, -6, 17], [0.7, -0.7], 6, 8, L));
  return { prims: P, shadow: [{ u: 0, v: 0, r: R + 6, a: 0.3 }], cast: 30 };
}
export const pavilionRed = (f: number) => pavilion(f, RED_HOUSE);
export const pavilionBlue = (f: number) => pavilion(f, BLUE_HOUSE);

/** Small candle flames painted over the model at these points (frame f flickers them): 1-2 texels wide, 3-4 tall. */
const flames = (pts: V3[], f: number) => (px: (x: number, y: number, c: number) => void, at: (q: V3) => [number, number]) => {
  pts.forEach((q, i) => {
    const [x, y] = at(q), X = Math.round(x), Y = Math.round(y), tall = 3 + ((i * 5 + f) % 3 === 0 ? 1 : 0), lean = (i + f) % 4 === 1 ? 1 : 0;
    px(X, Y, 0xff8a2a); px(X, Y - 1, 0xffb84a); px(X + lean, Y - 2, 0xffe08a);
    if (tall > 3) px(X + lean, Y - 3, 0xfff4c8);
    if ((i + f) % 3) px(X + 1, Y - 1, 0xffa040);
  });
};

// ---- candle shrine: a gabled stone niche on stepped plinths, a saint inside, votive candles flickering on the steps ----
export function candleShrine(f: number): PropModel {
  const P: Prim[] = [], E: { p: V3; col: number }[] = [], lit: V3[] = [];
  const st = stone(STONER, 0.06), mb = stone(MARBLE, 0);
  P.push(box(-20, 20, -16, 16, 0, 5, st, 0.8), box(-15, 15, -12, 12, 5, 10, st, 0.7));
  // the niche: back and sides, a pitched roof over it
  P.push(box(-12, 12, -10, -5, 10, 42, mb, 0.6));
  for (const s of [-1, 1]) P.push(box(s * 12 - 2.5, s * 12 + 2.5, -10, 6, 10, 42, mb, 0.6));
  P.push(box(-12, 12, -10, 6, 10, 12, mb, 0.4));
  const z0 = 42, rh = 12, rb = 13;
  P.push({ m: M(MARBLE.map((c) => c - 0x0c0c0c), { grain: 0.14, tex: (x) => (Math.floor((x + 40) / 3) % 2 ? -0.06 : 0.04) }), k: 0.4, lo: [-17, -12, z0 - 1], hi: [17, 9, z0 + rh + 1], d: (x, y, z) => {
    const yc = y + 2;
    return Math.max(Math.abs(x) - 16, z0 - z, (Math.abs(yc) * rh + (z - z0) * rb - rb * rh) / Math.hypot(rh, rb));
  } });
  P.push(rod([0, -2, z0 + rh], [0, -2, z0 + rh + 7], 0.9, M(BRASSR, { spec: 0.5 }), 0.9, 0.2), rod([-3, -2, z0 + rh + 4.5], [3, -2, z0 + rh + 4.5], 0.8, M(BRASSR, { spec: 0.5 }), 0.8, 0.2));
  // the saint: a robed figure, hands together, a little worn
  P.push(blob([0, -3, 22], 5, 4, 11, mb, 1.2), blob([0, -3, 35.5], 3.2, 3, 3.6, mb, 0.6));
  P.push(blob([2.5, -1, 27], 1.8, 1.8, 2, mb, 0.5));
  // candles: on the steps and the sill, of all heights, the wax run down; each flame flickers by frame
  const spots: [number, number, number][] = [[-16, 10, 5], [-11, 13, 5], [-5, 14, 5], [4, 13.5, 5], [10, 12, 5], [16, 9, 5], [-9, 8, 10], [-2, 9, 10], [6, 8.5, 10], [12, 6, 10], [-8, 4, 12], [8, 4, 12]];
  spots.forEach(([u, v, z], i) => {
    const h = 3 + hash3(i, 1, 91) * 6;
    P.push(rod([u, v, z], [u, v, z + h], 1.1, M(WAX, { grain: 0.04 }), 1, 0.2));
    E.push({ p: [u, v, z + h + 0.6], col: 0x3a2008 }); // the wick
    lit.push([u, v, z + h + 1.2]);
  });
  // offerings: a wreath of flowers and a pilgrim's shell laid on the step
  P.push(blob([-14, -2, 12.5], 4, 3, 1.4, M(GREEN, { grain: 0.3 }), 0.6));
  for (let i = 0; i < 5; i++) P.push(blob([-14 + Math.cos(i * 1.3) * 3.4, -2 + Math.sin(i * 1.3) * 2.6, 13.5], 1, 1, 0.8, M(i % 2 ? GOLD : REDR), 0.3));
  P.push(blob([14, -3, 11], 3, 2.6, 0.9, M(CREAM, { grain: 0.1, tex: (x) => (Math.floor(x * 1.5) % 2 ? -0.1 : 0.05) }), 0.4));
  return { prims: P, eyes: E, halos: [{ p: [0, 10, 12], r: 22, col: 0xffb050, a: 0.22 }], shadow: [{ u: 0, v: 0, r: 22, a: 0.3 }], cast: 34, overlay: flames(lit, f) };
}

// ---- quintain: a post with a turning arm, a shield on one end and a sandbag on the other, swinging after a hit ----
export function quintain(f: number): PropModel {
  const P: Prim[] = [], ph = (f / N) * TAU, swing = Math.sin(ph) * 0.55 + 0.3;
  // the post on a cross foot, braced
  P.push(rod([0, 0, 0], [0, 0, 50], 2.2, wood(2), 2, 0.3));
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    P.push(box(Math.min(0, a * 16) - 1.5 * Math.abs(b), Math.max(0, a * 16) + 1.5 * Math.abs(b), Math.min(0, b * 16) - 1.5 * Math.abs(a), Math.max(0, b * 16) + 1.5 * Math.abs(a), 0, 3, wood(a ? 0 : 1, OLDR), 0.5));
    P.push(rod([a * 11, b * 11, 2.5], [a * 1.5, b * 1.5, 16], 1, wood(2, OLDR), 1, 0.3));
  }
  P.push(blob([0, 0, 51], 3, 3, 2, M(IRONR, { spec: 0.4 }), 0.4));
  // the arm, turned by `swing`: the shield on one end, the sandbag on its chain at the other
  const arm: Prim[] = [];
  arm.push(box(-30, 24, -1.6, 1.6, 49, 52.5, wood(0), 0.5));
  arm.push(shield([24.5, 0, 46], [0, 1], 8, 10, RED_HOUSE));
  arm.push(rod([-29, 0, 49], [-29, 0, 40], 0.5, M(IRONR, { spec: 0.4 }), 0.5, 0.1));
  arm.push(blob([-29, 0, 34], 5, 5, 7, M(SACK, { grain: 0.2 }), 1.2), rod([-31, -2, 40], [-27, 2, 40], 0.4, M(ROPER), 0.4, 0.1));
  P.push(...arm.map((p) => place(p, swing)));
  // a broken lance in the grass, splinters
  P.push(rod([18, 22, 1], [40, 12, 3.5], 1.4, M(CREAM, { grain: 0.1, tex: (x) => (Math.floor(x / 4) % 2 ? -0.1 : 0.06) }), 1.1, 0.2));
  for (let i = 0; i < 4; i++) P.push(rod([6 + i * 4, 18 - i * 2, 0.6], [8 + i * 4, 16 - i * 2.4, 0.6], 0.5, M(CREAM), 0.4, 0.1));
  return { prims: P, shadow: [{ u: 0, v: 0, r: 20, a: 0.3 }], cast: 50 };
}

// ---- pilgrims' staves: tall staves leaning together on a post, scallop shells and a gourd, packs at the foot ----
export function pilgrimStaves(): PropModel {
  const P: Prim[] = [];
  P.push(rod([0, 0, 0], [0, 0, 28], 1.6, wood(2, OLDR), 1.4, 0.3));
  const tops: V3[] = [[-2, -1.5, 36], [1.5, -2, 38], [2, 1.5, 35], [-1.5, 2, 37]];
  const feet: V3[] = [[-12, -6, 0], [6, -12, 0], [11, 6, 0], [-6, 11, 0]];
  feet.forEach((b, i) => {
    P.push(rod(b, tops[i], 0.9, wood(2, i % 2 ? WOODR : OLDR, 0.04), 0.8, 0.2));
    P.push(blob([tops[i][0], tops[i][1], tops[i][2] + 0.6], 1.3, 1.3, 1.2, wood(2, OLDR), 0.2));
  });
  // shells hung on cords, a gourd, a ribbon
  for (const [u, v, z] of [[-5, -3, 26], [4, -6, 27]]) {
    P.push(rod([u * 0.6, v * 0.6, z + 5], [u, v, z + 1.5], 0.25, M(ROPER), 0.25, 0.1));
    P.push(blob([u, v, z], 2.6, 1.2, 2.4, M(CREAM, { grain: 0.06, tex: (x, _y, zz) => (Math.floor(Math.atan2(zz - z, x - u) * 3) % 2 ? -0.12 : 0.05) }), 0.4));
  }
  P.push(blob([5, 5, 22], 2.4, 2.4, 3, M(GOLD.slice(0, 5), { spec: 0.2 }), 0.6), blob([5, 5, 26.5], 1.4, 1.4, 1.8, M(GOLD.slice(0, 5)), 0.4));
  P.push(cloth([1, 1, 31], [5, 3, 0], [0, 0, -10], M(REDR, { grain: 0.05 }), (s, t) => Math.sin(t * 4) * 0.8 * t, (s, t) => s < 0.3 + t * 0.2, 0.4));
  // packs and a rolled cloak at the foot
  P.push(blob([10, -9, 4], 6, 4.5, 4.4, M(SACK, { grain: 0.18 }), 1), rod([5, -12, 2], [15, -6, 2], 0.4, M(ROPER), 0.4, 0.1));
  P.push(rod([-14, 2, 2.4], [-8, 12, 2.4], 2.6, M(BLUE, { grain: 0.06 }), 2.6, 0.4));
  return { prims: P, shadow: [{ u: 0, v: 0, r: 14, a: 0.3 }], cast: 34 };
}

// ---- ribbon post: a pilgrims' post on the Way, prayer ribbons tied to its crossbar, stones and candles at its foot ----
const RIBBONS = [REDR, GOLD, BLUE, CREAM, GREEN, REDR, GOLD];
export function ribbonPost(f: number): PropModel {
  const P: Prim[] = [], lit: V3[] = [], ph = (f / N) * TAU;
  P.push(rod([0, 0, 0], [0, 0, 44], 1.8, wood(2, OLDR, 0.03), 1.5, 0.3));
  P.push(box(-1.4, 1.4, -14, 14, 36, 39, wood(1, OLDR), 0.5));
  P.push(blob([0, 0, 45], 2, 2, 1.4, wood(2, OLDR), 0.3));
  // ribbons tied along the bar, hanging and lifting in the wind, each its own length and phase
  RIBBONS.forEach((pal, i) => {
    const v = -12 + i * 4, len = 12 + hash3(i, 3, 92) * 9;
    P.push(cloth([0.6, v - 0.9, 36.5], [0, 1.8, 0], [3 + Math.sin(ph + i) * 1.5, 0, -len], M(pal, { grain: 0.04 }), (_s, t) => Math.sin(t * 5 + ph + i * 1.1) * 1.4 * t, () => true, 0.4));
  });
  // a cairn of pilgrims' stones round the foot, two candles in clay cups
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7, r = 5 + (i % 3) * 2.2;
    P.push(blob([Math.cos(a) * r, Math.sin(a) * r, 1.4 + (i % 2) * 0.6], 2 + hash3(i, 1, 93), 1.8 + hash3(i, 2, 93), 1.6, stone(STONER, 0.1 + hash3(i, 4, 93) * 0.15), 0.4));
  }
  for (const [u, v] of [[7, 6], [-3, 9]]) {
    P.push(rod([u, v, 0], [u, v, 2.6], 1.8, M([0x2e160c, 0x4e2814, 0x703c1e, 0x90522a, 0xac6a3a]), 1.4, 0.2), rod([u, v, 2], [u, v, 5.5], 0.8, M(WAX), 0.7, 0.1));
    lit.push([u, v, 6.2]);
  }
  return { prims: P, shadow: [{ u: 0, v: 0, r: 14, a: 0.3 }], cast: 44, overlay: flames(lit, f) };
}

// ---- the Lists: the viewing stand (lk_lists) and the tilt barrier (lk_tilt) on the Tourney Grounds ----------------
// tiles are 48 texels; shared/landmarks.ts "lists": stand box 88.6..92.4 x 1205.1..1206.0 (foot 90.5,1206 = u 0, v 0)
const SU = 91, SV = 43;
export function listsStand(f: number): PropModel {
  const P: Prim[] = [], ph = (f / N) * TAU;
  const plank = (axis: 0 | 1, bias = 0) => M(WOODR, { grain: 0.05, tex: (x, y, z) => grain(axis)(x, y, z) + bias + ((axis ? x : y) % 7 < 0.7 ? -0.16 : 0) });
  // three tiers stepping up to the back, a rail along the front with the houses' shields on it
  const tiers: [number, number][] = [[-15, 10], [-29, 20], [-SV, 30]];
  tiers.forEach(([v0, z], k) => {
    P.push(box(-SU + 2, SU - 2, v0, v0 + 14, z - 3, z, plank(0, k * 0.03), 0.5));
    P.push(box(-SU + 2, SU - 2, v0 + 12, v0 + 14, 0, z - 3, wood(2, OLDR, -0.05), 0.4));
    // cushions in the houses' colours here and there on the benches
    for (let i = 0; i < 5; i++) if (hash3(i, k, 94) < 0.6) P.push(box(-SU + 10 + i * 36, -SU + 22 + i * 36, v0 + 3, v0 + 10, z, z + 1.6, M(i % 2 ? BLUE : REDR, { grain: 0.06 }), 0.8));
  });
  P.push(box(-SU + 1, SU - 1, -SV, -SV + 2, 0, 34, wood(2, OLDR, -0.04), 0.4)); // the back boards
  for (const s of [-1, 1]) P.push(box(s * SU - 2, s * SU + 2, -SV, 0, 0, 32, plank(1, -0.04), 0.4)); // the ends
  P.push(rod([-SU, -1, 18], [SU, -1, 18], 1, wood(0, WOODR, 0.04), 1, 0.3));
  for (let i = 0; i < 6; i++) P.push(shield([-SU + 16 + i * 32, 0.6, 12], [1, 0], 6, 7.5, i % 2 ? BLUE_HOUSE : RED_HOUSE));
  // the canopy: four posts, striped cloth sloping down to the front, a scalloped valance, pennants at the corners
  const CZ = 64, FZ = 52;
  for (const [u, v, z] of [[-SU, -SV, CZ], [SU, -SV, CZ], [-SU, 0, FZ], [SU, 0, FZ]]) {
    P.push(rod([u, v, 0], [u, v, z + 12], 1.5, wood(2, WOODR), 1.3, 0.3));
    P.push(blob([u, v, z + 12.5], 1.6, 1.6, 1.4, M(BRASSR, { spec: 0.5 }), 0.3));
  }
  P.push(cloth([-SU - 2, -SV - 2, CZ + 2], [2 * SU + 4, 0, 0], [0, SV + 4, FZ - CZ], two(REDR, CREAM, (x) => Math.floor((x + 300) / 13) % 2 === 0),
    (s, t) => -Math.sin(t * Math.PI) * 3 + Math.sin(s * 9 + ph) * 0.5, () => true, 0.6));
  P.push(cloth([-SU - 2, 2, FZ], [2 * SU + 4, 0, 0], [0, 0.6, -9], M(GOLD, { grain: 0.05 }), (s) => Math.sin(s * 14 + ph) * 0.5,
    (s, t) => t < 0.55 + 0.45 * Math.abs(Math.sin(s * 40)), 0.5));
  for (const [u, v, z, L] of [[-SU, -SV, CZ + 11, RED_HOUSE], [SU, -SV, CZ + 11, BLUE_HOUSE], [-SU, 0, FZ + 11, BLUE_HOUSE], [SU, 0, FZ + 11, RED_HOUSE]] as const)
    P.push(pennant([u, v, z], [0.75, -0.66], 16, 6, M(L.a, { grain: 0.04 }), ph + u * 0.01));
  // the herald's banner hung from the canopy's front middle: the College's gold on blue
  P.push(cloth([-7, 3, FZ - 2], [14, 0, 0], [0, 0.4, -22], two(BLUE, GOLD, (x, _y, z) => Math.abs(x) < 1.6 || Math.abs(z - (FZ - 11)) < 1.6),
    (s, t) => Math.sin(t * 3 + ph) * 0.8 * t, (s, t) => t < 0.85 || Math.abs(s - 0.5) < 0.5 - (t - 0.85) * 3, 0.5));
  return { prims: P, shadow: [{ u: 0, v: -SV / 2, r: 60, a: 0.22 }, { u: -50, v: -SV / 2, r: 40, a: 0.18 }, { u: 50, v: -SV / 2, r: 40, a: 0.18 }], cast: 60 };
}

// the barrier: box 88.6..95.9 x 1207.1..1207.5; its sprite's foot is the box's south middle (92.25, 1207.5)
const TU = 175;
export function tilt(f: number): PropModel {
  const P: Prim[] = [], ph = (f / N) * TAU, v = -9.6;
  // posts every 25 texels, two rails, the tilt cloth hung along it in the two houses' colours
  for (let u = -TU + 3; u <= TU - 3; u += 25) P.push(rod([u, v, 0], [u, v, 30], 1.6, wood(2, WOODR, 0.02), 1.4, 0.3));
  for (const z of [29, 16]) P.push(rod([-TU + 2, v, z], [TU - 2, v, z], 1.3, wood(0, WOODR, 0.05), 1.3, 0.3));
  P.push(cloth([-TU + 3, v + 2, 28], [2 * TU - 6, 0, 0], [0, 0, -18], two(REDR, BLUE, (x) => x > 0, { grain: 0.06 }),
    (s) => Math.sin(s * 30 + ph) * 0.5, (s, t) => !(t > 0.82 && Math.floor(s * 70) % 2), 0.5));
  P.push(rod([-TU + 3, v + 2.3, 27.5], [TU - 3, v + 2.3, 27.5], 0.7, M(GOLD, { spec: 0.3 }), 0.7, 0.2));
  // tall poles at both ends with the houses' pennants
  for (const [s, L] of [[-1, RED_HOUSE], [1, BLUE_HOUSE]] as const) {
    P.push(rod([s * TU, v, 0], [s * TU, v, 62], 1.6, wood(2, WOODR), 1.3, 0.3), blob([s * TU, v, 62.5], 1.8, 1.8, 1.6, M(BRASSR, { spec: 0.5 }), 0.3));
    P.push(pennant([s * TU, v, 60], [0.75, -0.66], 22, 8, M(L.a, { grain: 0.04 }), ph + s));
  }
  // a lance rack at the east end
  for (let i = 0; i < 4; i++) P.push(rod([TU - 14 + i * 2.5, v - 8, 0], [TU - 18 + i * 2.5, v - 9, 44], 1, M(i % 2 ? CREAM : REDR, { grain: 0.06 }), 0.7, 0.2));
  P.push(box(TU - 21, TU - 5, v - 10, v - 7, 22, 24, wood(0, OLDR), 0.4));
  return { prims: P, shadow: [{ u: 0, v, r: 40, a: 0.12 }], cast: 30 };
}

const sheet = (key: LkKind, model: (f: number) => PropModel) => ({ key, ...LK_SHEETS[key], model });
/** The Crown's kit for bake-props.ts. */
export const CROWN_KIT = [
  sheet("lk_pavilion", pavilionRed), sheet("lk_pavilion_blue", pavilionBlue), sheet("lk_candle_shrine", candleShrine), sheet("lk_quintain", quintain),
  sheet("lk_pilgrim_staves", pilgrimStaves), sheet("lk_ribbon_post", ribbonPost), sheet("lk_lists", listsStand), sheet("lk_tilt", tilt),
];
