/**
 * Village and camp props rebuilt as 3D models (prop3d.ts) and baked to sheets: lantern pole, training dummy, skull
 * pike, spear / weapon rack, war pennants, net rack. Same frame sizes, feet, palettes and swing as the painted
 * versions in client/src/isoProps.ts, which stay as the fallback when a baked sheet is missing.
 */
import { mat, type Mat, type Prim } from "./mob3d";
import { blob, box, cloth, grain, rod, type PMat, type PropModel, type V3 } from "./prop3d";
import { hash3 } from "./mob3d";
import { BLACKR, BONER, BRASSR, IRONR, OLDR, REDR, ROPER, STONER, STRAWR, WOODR } from "../../../client/src/isoProps";

const N = 6, TAU = Math.PI * 2;
const GLOW = [0xc05a18, 0xf08a2c, 0xffc860, 0xffeaa8, 0xfff8e0];
const SACK = [0x2a2218, 0x463a28, 0x66563c, 0x86744e, 0xa49266, 0xc0b084];
const FISH = [0x1e262c, 0x34424a, 0x52646e, 0x7a8e98, 0xa8bcc4, 0xd4e2e6];
const BLUE = [0x0e1424, 0x18223a, 0x243256, 0x324474, 0x445a92];

const M = (pal: number[], o: Parameters<typeof mat>[1] = {}): Mat => mat(0, { ramp: pal, ...o });
const wood = (axis: 0 | 1 | 2, pal = WOODR, bias = 0) => M(pal, { tex: (x, y, z) => grain(axis)(x, y, z) + bias, grain: 0.05 });
const iron = (bias = 0) => M(IRONR, { spec: 0.35, shine: 14, tex: () => bias - 0.04, grain: 0.06 });
const stone = (bias = 0) => M(STONER, { grain: 0.24, tex: (x, y, z) => bias + (hash3(Math.floor(x), Math.floor(y), Math.floor(z * 1.3)) < 0.08 ? -0.2 : 0) });

/** A few field stones round a post's foot. */
function cairn(P: Prim[], r: number, n: number, seed: number, du = 0) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hash3(i, seed, 1), d = r * (0.7 + hash3(i, seed, 2) * 0.4), s = 1.4 + hash3(i, seed, 3) * 1.2;
    P.push(blob([du + Math.cos(a) * d, Math.sin(a) * d, s * 0.35], s, s * 0.9, s * 0.8, stone(-0.05), 0.4));
  }
}

// ---- lantern pole (32x90, origin 8,86) ------------------------------------------------------------------------
export function lanternPole(f: number): PropModel {
  const sw = Math.sin((f / N) * TAU), P: Prim[] = [];
  P.push(box(-3, 3, -3, 3, 0, 4, stone(), 0.6));
  for (let i = 0; i < 5; i++) { const a = i * 1.3 + 0.4; P.push(blob([Math.cos(a) * 3.4, Math.sin(a) * 3.4, 0.6], 1.3, 1.1, 1, stone(-0.08), 0.6)); }
  P.push(box(-1.4, 1.4, -1.4, 1.4, 3.6, 84, wood(2), 0.35, 0.6));
  P.push(box(-2, 2, -2, 2, 84, 86, wood(0, WOODR, 0.05), 0.4));
  P.push(box(-0.8, 15.5, -0.9, 0.9, 80, 82, wood(0), 0.3, 0.5));
  P.push(rod([1.2, 0, 67], [9, 0, 80.5], 0.7, wood(0, WOODR, -0.05), 0.7, 0.6));
  P.push(box(13.4, 14.6, -0.5, 0.5, 79, 80.2, iron(), 0.2));
  const lu = 14 + sw * 1.1, lv = -sw * 0.5;
  P.push(rod([lu, lv, 79.5], [lu, lv, 78.2], 0.35, iron(-0.1)));
  P.push(box(lu - 2.6, lu + 2.6, lv - 2.6, lv + 2.6, 76.6, 78, iron(0.1), 0.3, 0.1));
  P.push(box(lu - 1.4, lu + 1.4, lv - 1.4, lv + 1.4, 78, 79, iron(), 0.3, 0.1));
  // glass in an iron cage: four corner bars, lit panes
  const glass = M(GLOW, { emit: 0.55, tex: (_x, _y, z) => (z - 69.4) / 7.2 * 0.4 - 0.1 });
  P.push(box(lu - 2, lu + 2, lv - 2, lv + 2, 69.4, 76.6, glass, 0.2, 0.05));
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.push(box(lu + a * 2.1 - 0.45, lu + a * 2.1 + 0.45, lv + b * 2.1 - 0.45, lv + b * 2.1 + 0.45, 69.4, 76.6, iron(-0.05), 0.15, 0.05));
  P.push(box(lu - 2.6, lu + 2.6, lv - 2.6, lv + 2.6, 68.4, 69.6, iron(-0.05), 0.3, 0.1));
  return { prims: P, shadow: [{ u: 1, v: 1, r: 5 }], cast: 6, halos: [{ p: [lu, lv, 73], r: 9, col: 0xffb050, a: 0.5 }] };
}

// ---- training dummy (34x58, origin 17,50) ---------------------------------------------------------------------
export function dummy(f: number): PropModel {
  const sw = Math.sin((f / N) * TAU) * 1.3, P: Prim[] = [];
  const at = (z: number): [number, number] => [sw * z / 46, -sw * z / 92];
  P.push(box(-8, 8, -1.4, 1.4, 0, 2.4, wood(0), 0.4, 0.3));
  P.push(box(-1.4, 1.4, -8, 8, 0, 2.4, wood(1), 0.4, 0.3));
  const [tu, tv] = at(44);
  P.push(rod([0, 0, 2], [tu, tv, 44], 1.2, wood(2), 1.2, 0.5));
  const [bu, bv] = at(24);
  const straw: PMat = { ...M(STRAWR, { grain: 0.1, tex: (x, y, z) => (hash3(Math.floor(Math.atan2(y - bv, x - bu) * 7.3), Math.floor(z / 2), 9) - 0.5) * 0.3 }) };
  const rope = M(ROPER, { tex: () => -0.04 });
  straw.sub = (_x, _y, z) => (Math.abs(z - 19.8) < 0.8 || Math.abs(z - 29) < 0.8 ? rope : undefined);
  P.push(blob([bu, bv, 24], 6, 6, 10.5, straw, 1.2));
  const [au, av] = at(31);
  P.push(rod([au - 10, av + 1, 31], [au + 10, av - 1, 31], 0.9, wood(0), 0.9, 0.6));
  for (const k of [-1, 1]) P.push(blob([au + k * 11, av - k * 1.1, 31], 1.8, 1.8, 2.4, straw, 0.6));
  const [hu, hv] = at(40);
  const sack = M(SACK, { grain: 0.08, tex: () => 0.02 });
  P.push(blob([hu, hv, 39.5], 4.2, 4.2, 4.6, sack, 0.8));
  P.push(blob([hu, hv, 42.4], 4.5, 4.5, 3.4, iron(0.08), 0.3, 42.2));
  P.push(rod([hu, hv, 42.2], [hu, hv, 42.8], 4.8, iron(-0.05), 4.8, 0.2));
  // stitched face toward the viewer
  const eyes: { p: V3; col: number }[] = [];
  const face = (du: number, dv: number, dz: number, col: number) => eyes.push({ p: [hu + 3.05 + du, hv + 3.05 + dv, 39.5 + dz], col });
  for (const e of [-1, 1]) { face(e * 1.3, -e * 1.3, 1.2, 0x241a12); face(e * 1.3 + 0.4, -e * 1.3 - 0.4, 0.6, 0x241a12); }
  for (let i = -2; i <= 2; i++) face(i * 0.6, -i * 0.6, -1.6, i % 2 ? 0x3a2c1e : 0x5e4c34);
  return { prims: P, eyes, shadow: [{ u: 0.5, v: 0.5, r: 7, a: 0.35 }], cast: 8 };
}

// ---- skull pike (26x72, origin 8,66) --------------------------------------------------------------------------
export function skullPike(f: number): PropModel {
  const ph = (f / N) * TAU, P: Prim[] = [];
  cairn(P, 3, 7, 2);
  P.push(rod([0, 0, 0], [0, 0, 57], 1, wood(2, OLDR), 1, 0.4));
  P.push(rod([0, 0, 57], [0, 0, 63], 0.5, wood(2, OLDR, 0.05), 0.1, 0.3));
  const C: V3 = [0, 0, 51.5], bone = M(BONER, { grain: 0.07, tex: () => 0.04 });
  P.push(blob(C, 3.5, 3.5, 3.8, bone, 0.6));
  P.push(blob([1.2, 1.2, 48.3], 2.3, 2.3, 1.5, M(BONER, { grain: 0.06, tex: () => -0.05 }), 0.8));
  // eye sockets and nose carved toward the viewer (+u +v)
  const dark = M([0x0c0806, 0x120c0a, 0x1c1410]);
  const fwd = (a: number, r: number, dz: number): V3 => [C[0] + Math.cos(Math.PI / 4 + a) * r, C[1] + Math.sin(Math.PI / 4 + a) * r, C[2] + dz];
  for (const a of [-0.42, 0.42]) P.push({ ...blob(fwd(a, 3.7, 0.1), 0.8, 0.8, 0.85, dark, 0.2), cut: true });
  P.push({ ...blob(fwd(0, 3.6, -1.5), 0.45, 0.45, 0.6, dark, 0.2), cut: true });
  const eyes: { p: V3; col: number }[] = [];
  for (let i = -2; i <= 2; i++) eyes.push({ p: fwd(i * 0.2, 3.25, -3.1), col: i % 2 ? BONER[2] : BONER[5] });
  // rag knotted round the pole, its loose end flying along the wind
  P.push(rod([0, 0, 45.2], [0, 0, 44], 1.6, M(REDR, { tex: () => -0.1 }), 1.6, 0.4));
  P.push(cloth([1, 0, 45.2], [12, 0, -2], [0, 0, -6], M(REDR, { tex: () => -0.05 }), (s) => Math.sin(ph - s * 5) * 1.6 * s,
    (s, t) => !(t > 1 - s * 0.5 || (s > 0.55 && hash3(Math.floor(s * 16), Math.floor(t * 6), 8) < 0.22))));
  return { prims: P, eyes, shadow: [{ u: 1, v: 1, r: 4.5 }], cast: 6 };
}

// ---- war pennant (44x100, origin 8,97) ------------------------------------------------------------------------
export const warPennant = (col: number[], torn: boolean) => (f: number): PropModel => {
  const ph = (f / N) * TAU, P: Prim[] = [];
  cairn(P, 2.6, 6, torn ? 3 : 5);
  P.push(rod([0, 0, 0], [0, 0, 90], 1.3, wood(2, torn ? OLDR : WOODR), 1.1, 0.4));
  const brass = M(BRASSR, { spec: 0.4, shine: 12, tex: () => 0.05 });
  P.push(blob([0, 0, 91.5], 1.8, 1.8, 2, brass, 0.5));
  P.push(rod([0, 0, 93], [0, 0, 95.5], 0.5, brass, 0.15, 0.3));
  const Ln = 31, Hh = 17;
  P.push(rod([0, 0.4, 86.5], [0, 0.4, 86.5 - Hh], 0.6, M(BRASSR, { tex: () => -0.1 })));
  const flag: PMat = { ...M(col, { tex: (_x, _y, z) => (z > 85.5 ? 0.08 : 0) }) };
  const stripe = M(BRASSR, { tex: () => 0 });
  if (!torn) flag.sub = (x) => (Math.abs(x - 0.8 - 0.32 * Ln) < 1.1 ? stripe : undefined);
  P.push(cloth([0.8, 0, 86.5], [Ln, 0, -4], [0, 0, -Hh], flag, (s, t) => Math.sin(ph - s * 5.2) * 2.2 * s + Math.sin(ph * 2 - s * 9) * 0.5 * s * t, (s, t) => {
    if (t > 1 - s * 0.55) return false;
    if (s > 0.86 && Math.abs(t - (1 - s * 0.55) / 2) < 0.08) return false;
    if (torn && s > 0.35 && (hash3(Math.floor(s * 22), Math.floor(t * 10), 4) < 0.16 || (t > 0.8 - s * 0.55 && hash3(Math.floor(s * 30), 1, 5) < 0.5))) return false;
    return true;
  }));
  return { prims: P, shadow: [{ u: 1, v: 1, r: 4 }], cast: 6 };
};

// ---- net rack (54x50, origin 9,30) ----------------------------------------------------------------------------
export function netRack(f: number): PropModel {
  const sw = Math.sin((f / N) * TAU), P: Prim[] = [];
  for (const u of [0, 34]) { cairn(P, 1.8, 4, u, u); P.push(rod([u, 0, 0], [u, 0, 30], 1.1, wood(2, OLDR), 1.1, 0.4)); P.push(blob([u, 0, 30.3], 1.3, 1.3, 0.8, wood(2, OLDR, 0.05))); }
  const sag = (s: number) => 28.6 - Math.sin(s * Math.PI) * 3;
  const rope = M(ROPER);
  for (let i = 0; i < 12; i++) { const s0 = i / 12, s1 = (i + 1) / 12; P.push(rod([s0 * 34, 0, sag(s0)], [s1 * 34, 0, sag(s1)], 0.45, rope, 0.45, 0.2)); }
  const Hn = 20;
  const net: PMat = { ...M(ROPER, { tex: (_x, _y, z) => -(28.6 - z) / Hn * 0.15 }) };
  const cork = M(BONER, { tex: () => 0.1 });
  net.sub = (x, _y, z) => (z < 28.6 - Hn * 0.95 + 0.3 ? cork : undefined);
  P.push(cloth([1.5, 0.6, 28.6], [31, 0, 0], [0, 0, -Hn], net, (s, t) => sw * 2.2 * t * t + Math.sin(s * Math.PI) * 0.6, (s, t) => {
    if (t * Hn < 28.6 - sag(s) - 0.3) return false;
    if (t > 0.95) return Math.round(s * 31) % 4 === 0;
    const S = s * 31 / 1.6, T = t * Hn / 1.6, a = (S + T) % 2, b = ((S - T) % 2 + 2) % 2;
    return !(a > 0.45 && b > 0.45);
  }, 0.4));
  const fish = M(FISH, { spec: 0.5, shine: 10 });
  [[8, 0], [17, 1.6], [26, 3.1]].forEach(([u, ph]) => {
    const z0 = sag(u / 34) - 0.4, swing = Math.sin((f / N) * TAU + ph) * 0.9;
    P.push(rod([u, 1.6, z0], [u + swing * 0.3, 2.6 + swing, z0 - 5], 0.25, M(ROPER, { tex: () => -0.15 }), 0.25, 0.1));
    P.push(blob([u + swing * 0.3, 2.8 + swing, z0 - 8.6], 1, 1.7, 3.6, fish, 0.3));
    P.push(cloth([u + swing * 0.3, 2.8 + swing, z0 - 12], [0, 1.2, -1.2], [0, -1.2, -1.2], fish, () => 0, () => true, 0.3)); // tail fin
  });
  return { prims: P, shadow: [{ u: 1, v: 1, r: 3.5, a: 0.4 }, { u: 35, v: 1, r: 3.5, a: 0.4 }], cast: 5 };
}

// ---- spear / weapon rack (56x80, origin 13,58) ----------------------------------------------------------------
export const spearRack = (pennants: boolean) => (f: number): PropModel => {
  const ph = (f / N) * TAU, P: Prim[] = [];
  for (const u of [1, 29]) {
    P.push(rod([u, -5.5, 0], [u, 0, 30], 1, wood(2, WOODR, -0.05), 0.9, 0.3));
    P.push(rod([u, 5.5, 0], [u, 0, 30], 1, wood(2), 0.9, 0.3));
    P.push(rod([u, -3.4, 10], [u, 3.4, 10], 0.7, wood(1), 0.7, 0.3));
  }
  P.push(rod([-1.5, 0, 30.5], [31.5, 0, 30.5], 1.3, wood(0, WOODR, 0.05), 1.3, 0.5));
  P.push(rod([0, 4.2, 8], [30, 4.2, 8], 0.9, wood(0), 0.9, 0.3));
  for (let u = 3; u < 28; u += 6) P.push(box(u, u + 0.8, 4.6, 5.6, 7.6, 8.8, iron(0.1), 0.15, 0.1));
  const shaft = (u: number, top: V3) => P.push(rod([u, 6.4, 0.4], top, 0.65, wood(2, WOODR, 0.02), 0.6, 0.1));
  const steel = iron(0.15);
  const head = (q: V3, len: number) => P.push(rod([q[0], q[1] - 0.3, q[2]], [q[0], q[1] - 0.3, q[2] + len], 0.9, steel, 0.05, 0.2));
  const banner = (u: number, top: V3, pal: number[]) => P.push(cloth([top[0], top[1] + 0.2, top[2] - 1.5], [8, 0, -1.5], [0, 0, -4], M(pal), (s) => Math.sin(ph + u - s * 5) * 1.2 * s, (s, t) => t <= 1 - s * 0.6, 0.35));
  for (const [u, h] of [[5, 47], [17, 50], [23, 45]] as const) {
    const top: V3 = [u + 0.6, -2.2, h];
    shaft(u, top); head(top, 6.5);
    P.push(rod([top[0], top[1] + 0.3, h - 1], [top[0], top[1] + 0.35, h - 0.2], 0.9, M(REDR, { tex: () => -0.1 }), 0.9, 0.2));
    if (pennants && u !== 17) banner(u, top, u === 5 ? REDR : BLUE);
  }
  { // halberd
    const u = 11, top: V3 = [u + 0.5, -2.4, 52];
    shaft(u, top);
    P.push(rod([top[0], top[1] + 0.2, 51.5], [top[0], top[1] + 0.2, 56.5], 0.5, steel, 0.05, 0.2));
    P.push(box(top[0] - 0.4, top[0] + 4.2, top[1] - 0.05, top[1] + 0.45, 46, 51, M(IRONR, { spec: 0.4, shine: 14, tex: (x) => 0.1 - (x - top[0]) * 0.03 }), 0.1, 0.2));
    P.push(box(top[0] - 2.6, top[0] - 0.4, top[1] - 0.05, top[1] + 0.45, 48.5, 49.8, iron(0), 0.1, 0.2));
  }
  { // axe
    const u = 27, top: V3 = [u + 0.4, -2, 38];
    shaft(u, top);
    P.push(box(top[0] - 0.2, top[0] + 3.8, top[1] - 0.05, top[1] + 0.55, 33.5, 38.6, M(IRONR, { spec: 0.45, shine: 14, tex: (x) => (x > top[0] + 3 ? 0.18 : 0.06) }), 0.15, 0.2));
  }
  // round shield leaning on the far trestle: planks quartered red and bare, iron rim and boss
  const Cs: V3 = [32.2, 1.5, 8.5], nrm: V3 = [0.96, 0, 0.28], R = 7.6;
  const ironRim = iron(0.1), redP = M(REDR, { grain: 0.1 }), woodP = M(WOODR, { grain: 0.1 });
  const face: PMat = { ...woodP };
  face.sub = (x, y, z) => {
    const q: V3 = [x - Cs[0], y - Cs[1], z - Cs[2]], r = Math.hypot(q[1], q[2] * 1.04 - q[0] * 0.28);
    if (r > R * 0.86) return ironRim;
    if (r < R * 0.2) return ironRim;
    const a = Math.atan2(q[1], q[2]);
    return Math.floor((a + TAU) / (TAU / 4)) % 2 === 0 ? redP : undefined;
  };
  P.push({ m: face, k: 0.2, lo: [Cs[0] - 3, Cs[1] - R - 1, Cs[2] - R - 1], hi: [Cs[0] + 3, Cs[1] + R + 1, Cs[2] + R + 1], d: (x, y, z) => {
    const q: V3 = [x - Cs[0], y - Cs[1], z - Cs[2]], n = q[0] * nrm[0] + q[1] * nrm[1] + q[2] * nrm[2];
    const pl = Math.hypot(q[0] - nrm[0] * n, q[1] - nrm[1] * n, q[2] - nrm[2] * n);
    const dome = n - (0.5 - 0.5 * (pl / R) ** 2) ; // slightly domed disc, 1 texel thick
    return Math.max(Math.abs(dome) - 0.5, pl - R);
  } });
  P.push(blob([Cs[0] + 1.1, Cs[1], Cs[2] + 0.3], 1.1, 1.6, 1.6, iron(0.25), 0.3));
  return { prims: P, shadow: [{ u: 15, v: 2, r: 13, a: 0.3 }], cast: 10 };
};

// ---- Redfang watchtower (60x126, origin 30,114) ----------------------------------------------------------------
const THATCH = [0x1e180c, 0x342a14, 0x4e3e1c, 0x6a5426, 0x866a32, 0xa08240];
export function watchtower(f: number): PropModel {
  const ph = (f / N) * TAU, D = 45, A = 11, B = 8, P: Prim[] = [];
  const leg = (su: number, sv: number): [V3, V3] => [[su * A, sv * A, 0], [su * B, sv * B, D]];
  const lerp = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) { const [a, b] = leg(su, sv); P.push(rod(a, b, 1.6, wood(2, WOODR, su + sv < 0 ? -0.1 : 0), 1.4, 0.4)); }
  const brace = (c0: [number, number], c1: [number, number], k0: number, k1: number) => {
    const [a0, b0] = leg(...c0), [a1, b1] = leg(...c1);
    P.push(rod(lerp(a0, b0, k0), lerp(a1, b1, k1), 0.75, wood(0, OLDR, 0.05), 0.75, 0.3));
  };
  for (const [c0, c1] of [[[-1, 1], [1, 1]], [[1, 1], [1, -1]], [[-1, -1], [-1, 1]], [[1, -1], [-1, -1]]] as [[number, number], [number, number]][]) {
    brace(c0, c1, 0.08, 0.5); brace(c1, c0, 0.08, 0.5); brace(c0, c1, 0.5, 0.92); brace(c1, c0, 0.5, 0.92); brace(c0, c1, 0.5, 0.5);
  }
  for (const u of [-2.4, 2.4]) P.push(rod([u, A + 3.5, 0], [u, B + 1.2, D], 0.6, wood(2, WOODR, 0.05), 0.6, 0.2));
  for (let k = 0.1; k < 0.98; k += 0.13) { const v = A + 3.5 + (B + 1.2 - A - 3.5) * k; P.push(rod([-2.4, v, k * D], [2.4, v, k * D], 0.45, wood(0, WOODR, 0.1), 0.45, 0.2)); }
  // deck: planks along u with dark seams, beam rim
  P.push(box(-10.5, 10.5, -10.5, 10.5, D - 3, D, M(WOODR, { grain: 0.06, tex: (x, y) => (Math.floor((y + 10.5) / 2.6) % 2 ? -0.06 : 0.04) + (Math.abs(((y + 10.5) % 2.6)) < 0.35 ? -0.18 : 0) + grain(0)(x, y, 0) }), 0.4, 0.3));
  for (const [u, v] of [[-10, -10], [10, -10], [-10, 10], [10, 10], [0, 10], [10, 0]]) P.push(rod([u, v, D], [u, v, D + 12], 0.75, wood(2), 0.7, 0.3));
  for (const z of [D + 6, D + 11.5]) for (const [a, b] of [[[-10, 10], [10, 10]], [[10, 10], [10, -10]], [[-10, -10], [10, -10]], [[-10, -10], [-10, 10]]] as [[number, number], [number, number]][]) P.push(rod([a[0], a[1], z], [b[0], b[1], z], 0.55, wood(Math.abs(a[0] - b[0]) > 1 ? 0 : 1, OLDR, 0.05), 0.55, 0.3));
  for (const [u, v] of [[-9.5, -9.5], [9.5, -9.5], [-9.5, 9.5], [9.5, 9.5]]) P.push(rod([u, v, D + 12], [u, v, D + 24], 0.7, wood(2, OLDR), 0.7, 0.3));
  // pyramid thatch roof: a solid pyramid with a ragged, layered eave
  const apex = D + 40, E = 14, ez = D + 23, H = apex - ez;
  const thatch = M(THATCH, { grain: 0.1, tex: (x, y, z) => {
    const r = Math.max(Math.abs(x), Math.abs(y)), a = Math.abs(x) > Math.abs(y) ? y : x;
    return (hash3(Math.floor(a * 1.3 + 0.5), Math.floor(z / 1.6), 3) - 0.5) * 0.3 + (Math.floor((z - ez) / 1.6) % 3 === 0 ? -0.06 : 0) + (z < ez + 1.4 ? -0.1 : 0) + r * 0;
  } });
  P.push({ m: thatch, k: 0.3, lo: [-E - 1, -E - 1, ez - 1.5], hi: [E + 1, E + 1, apex + 1], d: (x, y, z) => {
    const r = Math.max(Math.abs(x), Math.abs(y)), side = (r - E * (apex - z) / H) * (H / Math.hypot(H, E));
    const fray = hash3(Math.floor((Math.abs(x) > Math.abs(y) ? y : x) * 0.9), 0, 5) < 0.4 ? 0.9 : 0;
    return Math.max(side, ez + fray - z - 0.2, -(side + 1.6) /* hollow under the eave */ - Math.max(0, z - ez - 3));
  } });
  P.push(rod([0, 0, apex - 1], [0, 0, apex + 4], 0.6, wood(2, OLDR), 0.5, 0.2));
  // the alarm horn on a strap, and a red rag flying from the roof post
  P.push(rod([10, 10, D + 16], [10.5, 11, D + 13], 0.25, M(ROPER), 0.25, 0.1));
  const horn = M(BONER, { grain: 0.06, spec: 0.2 });
  P.push(rod([10.4, 11, D + 12.6], [14, 13, D + 11.2], 0.5, horn, 0.95, 0.2));
  P.push(rod([14, 13, D + 11.2], [15, 13.5, D + 11], 1.0, M(BONER, { tex: () => -0.08 }), 1.3, 0.2));
  P.push(cloth([0.3, 0, apex + 4], [10, 0, -1], [0, 0, -4.5], M(REDR, { tex: () => -0.05 }), (s) => Math.sin(ph - s * 4.6) * 1.5 * s,
    (s, t) => !(t > 1 - s * 0.5 || (s > 0.6 && hash3(Math.floor(s * 14), Math.floor(t * 5), 2) < 0.25)), 0.4));
  return { prims: P, shadow: [{ u: 2, v: 2, r: 15, a: 0.35 }], cast: 12 };
}

// ---- broken spears in the ground (40x54, origin 20,50): no cloth, where the dead march ----------------------------
export function spearsGround(f: number): PropModel {
  const t = (f / N) * TAU, P: Prim[] = [], old = (b = 0) => wood(2, OLDR, b), steel = iron(0.12);
  // three shafts stuck in at angles, one snapped with a splintered top
  const s1: V3 = [-6, 6, 38], s3: V3 = [7, -7, 36];
  P.push(rod([-4, 4, -1], s1, 0.75, old(), 0.7, 0.3)); P.push(rod(s1, [s1[0] - 0.4, s1[1] + 0.4, s1[2] + 7], 1, steel, 0.05, 0.2));
  P.push(rod([4.5, -4.5, -1], s3, 0.75, old(), 0.7, 0.3)); P.push(rod(s3, [s3[0] + 0.5, s3[1] - 0.5, s3[2] + 7], 1, steel, 0.05, 0.2));
  P.push(rod([-1, -1, -1], [2.2, 1.6, 21], 0.75, old(0.03), 0.6, 0.3));
  P.push(rod([2.2, 1.6, 21], [2.6, 1.6, 23.2], 0.5, old(0.1), 0.1, 0.2)); P.push(rod([2.0, 1.9, 21], [1.7, 2.1, 22.6], 0.35, old(0.1), 0.05, 0.2));
  // frayed rope end swinging from the snapped one
  const sw = Math.sin(t) * 1.2;
  P.push(rod([2.1, 1.8, 20], [2.4 + sw * 0.3, 2.6 + sw, 13], 0.35, M(ROPER), 0.25, 0.2));
  // round shield leaning at the foot, iron rim and boss, facing the viewer
  const Cs: V3 = [4, 4, 5.5], nrm: V3 = (() => { const v: V3 = [0.62, 0.62, 0.48]; const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })(), R = 6;
  const rim = iron(0.05), face: PMat = { ...M(WOODR, { grain: 0.12, tex: (x, y) => (hash3(Math.floor((x - y) / 1.6), 0, 4) - 0.5) * 0.2 - 0.05 }) };
  face.sub = (x, y, z) => {
    const q: V3 = [x - Cs[0], y - Cs[1], z - Cs[2]], n = q[0] * nrm[0] + q[1] * nrm[1] + q[2] * nrm[2];
    const r = Math.hypot(q[0] - nrm[0] * n, q[1] - nrm[1] * n, q[2] - nrm[2] * n);
    return r > R * 0.84 ? rim : undefined;
  };
  P.push({ m: face, k: 0.2, lo: [Cs[0] - R - 1, Cs[1] - R - 1, Cs[2] - R - 1], hi: [Cs[0] + R + 1, Cs[1] + R + 1, Cs[2] + R + 1], d: (x, y, z) => {
    const q: V3 = [x - Cs[0], y - Cs[1], z - Cs[2]], n = q[0] * nrm[0] + q[1] * nrm[1] + q[2] * nrm[2];
    const pl = Math.hypot(q[0] - nrm[0] * n, q[1] - nrm[1] * n, q[2] - nrm[2] * n);
    return Math.max(Math.abs(n - (0.4 - 0.4 * (pl / R) ** 2)) - 0.5, pl - R, -z - 0.5);
  } });
  P.push(blob([Cs[0] + nrm[0] * 0.8, Cs[1] + nrm[1] * 0.8, Cs[2] + nrm[2] * 0.8], 1, 1, 1, iron(0.25), 0.3));
  for (let i = 0; i < 5; i++) { const a = i * 1.7, d = 5 + hash3(i, 3, 1) * 3; P.push(blob([Math.cos(a) * d, Math.sin(a) * d, 0], 1.6, 1.3, 0.8, M([0x1c1610, 0x2a2016, 0x3a2c1e, 0x4a3a28]), 0.6)); } // turned earth
  return { prims: P, shadow: [{ u: 0, v: 0, r: 9, a: 0.3 }], cast: 8 };
}

// ---- Goldenreach cows (96x90, origin 48,88): body centre local (0,0), foot at (17,15) world px --------------------
const PIEBALD = [0x101010, 0x1e1c1c, 0x2e2a2a, 0x423c3a, 0x5a524e];
const WHITE = [0x5a564e, 0x7e786c, 0xa49c8c, 0xc8c0ae, 0xe4ddcc];
const BROWN = [0x2a140a, 0x4a2412, 0x6e3a1c, 0x92522a, 0xb06e3c, 0xc88a54];
const PINK = [0x5a2e2a, 0x84463e, 0xa86458, 0xc88676];
const HORN = [0x4a4232, 0x7a705a, 0xb0a688, 0xd8d0b4];
export const cow = (brown: boolean) => (f: number): PropModel => {
  const K = 1.5, FU = 17, FV = 15, Pp = (u: number, v: number, z: number): V3 => [(u - FU) * K, (v - FV) * K, z * K], Q: Prim[] = [];
  const coat: PMat = brown ? M(BROWN, { grain: 0.1, tex: (x, y, z) => (hash3(Math.floor(x / 3), Math.floor(y / 3), Math.floor(z / 3)) - 0.5) * 0.1 - 0.03 }) : { ...M(WHITE, { grain: 0.06, tex: () => -0.03 }) };
  if (!brown) { const black = M(PIEBALD, { grain: 0.06, tex: () => 0.08 }); coat.sub = (x, y, z) => {
    const u = x / K + FU, v = y / K + FV, w = z / K;
    return Math.sin(u * 0.55) + Math.sin(v * 0.8 + u * 0.2) + Math.sin(w * 0.6 - u * 0.33) > 0.7 ? black : undefined;
  }; }
  const graze = f >= 2 && f <= 4 ? 1 : f === 1 || f === 5 ? 0.5 : 0, swish = Math.sin((f / N) * TAU);
  for (const [u, v] of [[-10, -4], [-10, 4], [10, -4], [10, 4]]) {
    Q.push(rod(Pp(u, v, 1.6), Pp(u + 0.3, v, 11), 1.5 * K, coat, 1.9 * K, 0.6));
    Q.push(rod(Pp(u, v, 0.4), Pp(u, v, 1.6), 1.5 * K, M(PIEBALD, { tex: () => 0.05 }), 1.5 * K, 0.3));
  }
  Q.push(blob(Pp(0, 0, 15.5), 15 * K, 7 * K, 7.5 * K, coat, 2.5));
  Q.push(blob(Pp(-4, 0, 8.6), 3.2 * K, 3 * K, 2.2 * K, M(PINK, { tex: () => 0.1 }), 1));
  const hz = 18.5 - graze * 10, hu = 20 + graze * 2;
  Q.push(rod(Pp(12, 0, 17), Pp(hu - 3, 0, hz), 4.8 * K, coat, 3.8 * K, 2));
  Q.push(blob(Pp(hu, 0, hz), 5 * K, 3.4 * K, 3.6 * K, coat, 1.5));
  Q.push(blob(Pp(hu + 4.6, 0, hz - 1.4), 2.4 * K, 2.8 * K, 2.4 * K, M(PINK, { tex: () => 0.05 }), 1));
  for (const sv of [-1, 1]) {
    Q.push(rod(Pp(hu - 1.5, sv * 2.6, hz + 2.6), Pp(hu - 1, sv * 5, hz + 4.5), 0.7 * K, M(HORN, { spec: 0.2, tex: () => 0.1 }), 0.3 * K, 0.4));
    Q.push(blob(Pp(hu - 2.6, sv * 4, hz + 1.4), 0.9 * K, 1.8 * K, 1 * K, coat, 0.5));
  }
  const eyes = [{ p: Pp(hu + 1.8, 2.7, hz + 1), col: 0x0a0808 }, { p: Pp(hu + 1.8, -2.7, hz + 1), col: 0x0a0808 }];
  const tv = swish * 3.5;
  Q.push(rod(Pp(-15, 0, 19), Pp(-16.5, tv, 7), 0.55 * K, coat, 0.45 * K, 0.4));
  Q.push(blob(Pp(-16.6, tv, 5.6), 1.1 * K, 1.1 * K, 1.8 * K, M(brown ? BROWN : PIEBALD, { tex: () => -0.05 }), 0.4));
  if (graze > 0.6) Q.push(rod(Pp(hu + 6, -1, hz - 2), Pp(hu + 7.5, 1.5, hz - 3), 0.35 * K, M(STRAWR, { tex: () => 0.1 })));
  return { prims: Q, eyes, shadow: [{ u: Pp(0, 0, 0)[0], v: Pp(0, 0, 0)[1], r: 16, a: 0.3 }], cast: 14 };
};

// ---- Millbrook water wheel (236x247, origin 118,245; see client/src/millArt.ts for the layout) --------------------
const WATER = [0x0e1e22, 0x18323a, 0x2a4e56, 0x4a7478, 0x8aaeaa, 0xd4e6e0];
export function millWheel(f: number): PropModel {
  const SC = 1.4, K = 1.5 * SC, FU = 54, FV = 31, Q: Prim[] = [];
  const Pp = (u: number, v: number, z: number): V3 => [(u - FU) * K, (v - FV) * K, z * K];
  const bx = (u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, m: Mat, rr = 0.5) => { const a = Pp(u0, v0, z0), b = Pp(u1, v1, z1); Q.push(box(a[0], b[0], a[1], b[1], a[2], b[2], m, rr)); };
  const rd = (a: V3, b: V3, r: number, m: Mat) => Q.push(rod(Pp(...a), Pp(...b), r * K, m, r * K, 0.4));
  const DU = 30, V0 = -34, V1 = 30, DZ = 6;
  for (const u of [3, 15, 27]) for (const v of [V0 + 2, -2, V1 - 2]) rd([u, v, -4], [u, v, DZ], 1.3, wood(2, WOODR, -0.1));
  for (const v of [V0 + 2, V1 - 2]) rd([3, v, -1], [27, v, DZ - 1], 0.6, wood(0, WOODR, -0.2));
  const plank = (axis: 0 | 1, b = 0) => M(WOODR, { grain: 0.05, tex: (x, y, z) => grain(axis)(x, y, z) + b + (Math.abs(((axis ? x : y) / K) % 3.2) < 0.3 ? -0.15 : 0) });
  bx(0, DU, V0, V1, DZ - 2, DZ, plank(0, 0.05));
  bx(0, DU, V0 - 1.2, V0, DZ, DZ + 36, M(WOODR, { grain: 0.05, tex: (x, y, z) => -0.15 + (Math.abs((x / K) % 3.2) < 0.35 ? -0.12 : 0) + grain(2)(x, y, z) })); // the far wall
  for (const [u, v] of [[DU - 1, V0 + 26], [DU - 1, V0 + 1]]) bx(u - 1.2, u + 1.2, v - 1.2, v + 1.2, DZ, 40, wood(2));
  const roof = M(STRAWR, { grain: 0.18, tex: (x, _y, z) => -0.08 + (((x / K + z / K * 2.5) / 2.4) % 3 < 0.35 ? -0.18 : 0) });
  Q.push(cloth(Pp(-2, V0 - 3, 54), [(DU + 5) * K, 0, -14 * K], [0, 30 * K, 0], roof, (s2, t2) => Math.sin(t2 * 9 + s2 * 2) * 0.3, (s2, t2) => !(s2 > 0.94 && hash3(Math.floor(t2 * 40), 1, 6) < 0.4), 1.4));
  const MU = 13, MV = 15;
  bx(MU - 8, MU + 8, MV - 8, MV + 8, DZ, DZ + 7, wood(0, WOODR, -0.05));
  const stoneM = (turn: number) => M(STONER, { grain: 0.18, tex: (x, y, z) => {
    const c = Pp(MU, MV, 0), a = Math.atan2(y - c[1], x - c[0]) / TAU + turn;
    return 0.08 + ((a * 8 % 1 + 1) % 1 < 0.14 && z > 0 ? -0.25 : 0);
  } });
  const mill = (z0: number, h: number, turn: number) => { const c = Pp(MU, MV, z0), R = 7 * K, Hh = h * K, m = stoneM(turn);
    Q.push({ m, k: 0.3, lo: [c[0] - R - 1, c[1] - R - 1, c[2] - 1], hi: [c[0] + R + 1, c[1] + R + 1, c[2] + Hh + 1], d: (x, y, z) => Math.max(Math.hypot(x - c[0], y - c[1]) - R + Math.max(0, z - c[2] - Hh * 0.6) * 0.8, Math.abs(z - c[2] - Hh / 2) - Hh / 2) }); };
  mill(DZ + 7, 3, 0); mill(DZ + 10.2, 3, f / N / 8);
  { const hb = blob(Pp(MU, MV, DZ + 24), 4.5 * K, 4.5 * K, 5 * K, wood(2, WOODR, -0.05), 0.5), top = Pp(0, 0, DZ + 25)[2], c = Pp(MU, MV, DZ + 25), d0 = hb.d; // hopper: an open bowl
    hb.d = (x, y, z) => Math.max(d0(x, y, z), z - top, -(Math.hypot(x - c[0], y - c[1]) - 3.6 * K) - Math.max(0, top - z - 4)); Q.push(hb); }
  Q.push(rod(Pp(MU, MV, DZ + 13), Pp(MU, MV, DZ + 21), 1.2 * K, wood(2, WOODR, -0.1), 3 * K, 0.4)); // hopper chute
  for (const [du, dv, dz] of [[-6, -24, 0], [-1, -26, 0], [-4, -25, 4.5], [5, -26, 0]]) Q.push(blob(Pp(MU + du, MV + dv, DZ + 3 + dz), 3.4 * K, 2.6 * K, 3 * K, M(STRAWR, { grain: 0.1, tex: () => -0.05 }), 0.8));
  const WU = 37, WV = -4, WZ = 22, R = 24, ang0 = (f / N) * (Math.PI / 4);
  rd([DU - 6, WV, WZ], [WU + 5, WV, WZ], 1.6, wood(0, WOODR, 0.05));
  Q.push(blob(Pp(DU - 5, WV, WZ), 1.8 * K, 6 * K, 6 * K, wood(1, WOODR, -0.05), 0.5));
  const wp = (a: number, r: number, u: number): V3 => [u, WV + Math.cos(a) * r, WZ + Math.sin(a) * r];
  const rimM = M(WOODR, { grain: 0.06, tex: (x, y, z) => { const c = Pp(WU, WV, WZ); return 0.05 + (hash3(Math.floor(Math.atan2(z - c[2], y - c[1]) * 12), 0, 2) - 0.5) * 0.2; } });
  for (const u of [WU - 3.5, WU + 3.5]) { const c = Pp(u, WV, WZ);
    Q.push({ m: rimM, k: 0.2, lo: [c[0] - 2, c[1] - (R + 2) * K, c[2] - (R + 2) * K], hi: [c[0] + 2, c[1] + (R + 2) * K, c[2] + (R + 2) * K], d: (x, y, z) => Math.max(Math.abs(Math.hypot(y - c[1], z - c[2]) - R * K) - 1.6 * K, Math.abs(x - c[0]) - 0.6 * K) }); }
  for (let k = 0; k < 8; k++) { const a = ang0 + (k / 8) * TAU; for (const u of [WU - 3.5, WU + 3.5]) rd(wp(a, 2.5, u), wp(a, R - 1.5, u), 0.85, wood(1, WOODR, 0.05)); }
  for (let k = 0; k < 16; k++) {
    const a = ang0 + (k / 16) * TAU, o = wp(a, R + 0.5, WU - 4.5), e2: V3 = [0, -Math.cos(a) * 5.5 * K, -Math.sin(a) * 5.5 * K];
    Q.push(cloth(Pp(...o), [9 * K, 0, 0], e2, M(WOODR, { grain: 0.06, tex: () => -0.05 }), () => 0, () => true, 0.9));
  }
  Q.push(blob(Pp(WU, WV, WZ), 4 * K, 3.2 * K, 3.2 * K, iron(0.05), 0.5));
  rd([DU - 0.5, V0 + 26, 38], [DU - 0.5, V0 + 26, DZ + 6], 0.3, M(ROPER));
  // churned water and spray as single texels
  const ph = (f / N) * TAU, eyes: { p: V3; col: number }[] = [];
  for (let k = 0; k < 70; k++) {
    const a = hash3(k, 1, 31) * TAU, r = 3 + hash3(k, 2, 31) * 14, du = Math.cos(a) * r * 0.7, dv = Math.sin(a) * r;
    const z = Math.max(0, Math.sin(ph + k) * 1.6) + (hash3(k, 3, 31) < 0.25 ? Math.abs(Math.sin(ph * 2 + k)) * 5 : 0);
    eyes.push({ p: Pp(WU + du, WV + dv, z), col: WATER[3 + Math.floor(hash3(k, 4, 31) * 2.99)] });
  }
  return { prims: Q, eyes, cast: 0 };
}

/** Every baked prop: texture key, frame size, frames, model per frame, painted origin (isoProps). */
export const PROPS3D: { key: string; w: number; h: number; frames: number; ox: number; oy: number; model: (f: number) => PropModel }[] = [
  { key: "wp_lantern_pole", w: 32, h: 90, frames: N, ox: 8, oy: 86, model: lanternPole },
  { key: "wp_dummy", w: 34, h: 58, frames: N, ox: 17, oy: 50, model: dummy },
  { key: "wp_skull_pike", w: 26, h: 72, frames: N, ox: 8, oy: 66, model: skullPike },
  { key: "wp_pennant_red", w: 44, h: 100, frames: N, ox: 8, oy: 97, model: warPennant(REDR, false) },
  { key: "wp_pennant_black", w: 44, h: 100, frames: N, ox: 8, oy: 97, model: warPennant(BLACKR, true) },
  { key: "wp_net_rack", w: 54, h: 50, frames: N, ox: 9, oy: 30, model: netRack },
  { key: "wp_spear_rack", w: 56, h: 80, frames: N, ox: 13, oy: 58, model: spearRack(true) },
  { key: "wp_watchtower", w: 60, h: 126, frames: N, ox: 30, oy: 114, model: watchtower },
  { key: "wp_spears_ground", w: 40, h: 54, frames: N, ox: 20, oy: 50, model: spearsGround },
  { key: "wp_cow0", w: 96, h: 90, frames: N, ox: 48, oy: 88, model: cow(false) },
  { key: "wp_cow1", w: 96, h: 90, frames: N, ox: 48, oy: 88, model: cow(true) },
  { key: "wp_millwheel", w: 236, h: 247, frames: N, ox: 118, oy: 245, model: millWheel },
  { key: "wp_weapon_rack", w: 56, h: 80, frames: 1, ox: 13, oy: 58, model: spearRack(false) },
];
