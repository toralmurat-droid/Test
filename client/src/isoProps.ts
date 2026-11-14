import type { Pen } from "./worldProps";
import { hsh, IsoPaint, mat, ramp, type Mat, type V3 } from "./isoPaint";

/**
 * World props rebuilt as true isometric pixel art (Murat 2026-11-13: the old ones looked flat, drawn face-on):
 * lantern poles, war pennants, training dummies, net racks, skull pikes, spear racks and the Redfang watchtowers.
 * Each is modelled with rods, boxes, blobs and cloth in isoPaint.ts, so posts show two lit faces, beams run along
 * the world axes and cloth folds catch the light. Frame sizes and feet are the old ones (worldProps.ts places them).
 */
export const WOODR = [0x160e08, 0x241710, 0x3a2716, 0x523822, 0x6c4c2e, 0x88633c, 0xa07a4a];
export const OLDR = [0x141210, 0x221e1a, 0x342e28, 0x4a4238, 0x605648, 0x786c5a];
export const IRONR = [0x0e1014, 0x1c1f24, 0x2e3238, 0x464c54, 0x666e78, 0x929ca6, 0xc4ccd2];
export const STONER = [0x121116, 0x1e1c22, 0x2c2930, 0x3c383e, 0x4f4a4e, 0x655e5e, 0x7c7470];
export const STRAWR = [0x2e2210, 0x4a3818, 0x6e5626, 0x927434, 0xb4944a, 0xd2b466, 0xe6cc88];
export const ROPER = [0x2e2414, 0x4a3c22, 0x6a5834, 0x8a7448, 0xa89060];
export const BONER = [0x2a241c, 0x4a4234, 0x746a56, 0x9e947c, 0xc6bca2, 0xe6dec8];
export const REDR = [0x1e0606, 0x380c0a, 0x561410, 0x761e16, 0x962a1e, 0xb43c28, 0xcc5a3a];
export const BLACKR = [0x0c0a0e, 0x16131a, 0x221e26, 0x302a34, 0x403a44, 0x524a56];
export const BRASSR = [0x2a1c0a, 0x4a3412, 0x72521e, 0x9a742c, 0xc49c44, 0xe8cc78];
const GLOW = [0xc05a18, 0xf08a2c, 0xffc860, 0xffeaa8, 0xfff8e0];
const SACK = [0x2a2218, 0x463a28, 0x66563c, 0x86744e, 0xa49266, 0xc0b084];
const FISH = [0x1e262c, 0x34424a, 0x52646e, 0x7a8e98, 0xa8bcc4, 0xd4e2e6];
const THATCH = [0x1e180c, 0x342a14, 0x4e3e1c, 0x6a5426, 0x866a32, 0xa08240];

const N = 6;
const TAU = Math.PI * 2;

/** Wood with grain running along the piece (s = along). */
export const wood = (pal = WOODR, bias = 0, len = 30): Mat => (l, s, t, x, y) => {
  const g = (hsh(Math.floor(t * 6), Math.floor(s * len / 3), 7) - 0.5) * 0.18 + (hsh(x, y, 3) < 0.05 ? -0.15 : 0);
  return ramp(pal, l + g + bias, x, y);
};
/** Rough stone: blotchy, with dark pits. */
export const stone = (bias = 0): Mat => (l, s, t, x, y) => ramp(STONER, l + bias + (hsh(x >> 1, y >> 1, 11) - 0.5) * 0.22 - (hsh(x, y, 12) < 0.08 ? 0.2 : 0), x, y);
const metal = (bias = 0): Mat => (l, _s, _t, x, y) => ramp(IRONR, l * 1.1 + bias - 0.05, x, y);
const glow: Mat = (_l, _s, t, x, y) => ramp(GLOW, 0.35 + t * 0.65, x, y);

/** A few field stones round a post's foot. */
function cairn(g: IsoPaint, r: number, n: number, seed: number) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hsh(i, seed, 1), d = r * (0.7 + hsh(i, seed, 2) * 0.4), s = 1.4 + hsh(i, seed, 3) * 1.2;
    g.blob([Math.cos(a) * d, Math.sin(a) * d, s * 0.4], s, s * 0.9, s * 0.8, stone(-0.05));
  }
}

// ---- lantern pole ------------------------------------------------------------------------------------------
/** 32x90: a square post on a stone footing, an arm along the road with a brace, a swinging iron lantern (lit glass). */
export function lanternPole(p: Pen, f: number) {
  const g = new IsoPaint(p, 32, 90, 8, 86), sw = Math.sin((f / N) * TAU);
  g.shadow(1, 1, 5);
  g.box(-3, 3, -3, 3, 0, 4, stone());
  g.box(-1.4, 1.4, -1.4, 1.4, 4, 84, wood(WOODR, 0, 80));
  g.box(-2, 2, -2, 2, 84, 86, wood(WOODR, 0.05));
  g.box(-0.8, 15.5, -0.9, 0.9, 80, 82, wood(WOODR, 0, 16));
  g.rod([1.2, 0, 67], [9, 0, 80.5], 0.7, wood(WOODR, -0.05, 14));
  g.box(13.4, 14.6, -0.5, 0.5, 79, 80, metal()); // hook
  // the lantern swings on its ring under the hook
  const lu = 14 + sw * 1.1, lv = -sw * 0.5, l = (z: number): V3 => [lu, lv, z];
  g.rod(l(79.5), [lu, lv, 78.4], 0.35, metal(-0.1));
  g.box(lu - 2.6, lu + 2.6, lv - 2.6, lv + 2.6, 76.6, 78, metal(0.1));
  g.box(lu - 1.4, lu + 1.4, lv - 1.4, lv + 1.4, 78, 79, metal(0));
  g.box(lu - 2.1, lu + 2.1, lv - 2.1, lv + 2.1, 69.4, 76.6, (li, s, t, x, y) => (s < 0.18 || s > 0.82 ? ramp(IRONR, li * 0.9, x, y) : glow(li, s, t, x, y)));
  g.box(lu - 2.6, lu + 2.6, lv - 2.6, lv + 2.6, 68.4, 69.4, metal(-0.05));
}

// ---- war pennant -------------------------------------------------------------------------------------------
/** 44x100: a tall pole with a brass finial and a long streamer flying out along the road axis, folds catching light. */
export const warPennant = (col: number[], torn: boolean) => (p: Pen, f: number) => {
  const g = new IsoPaint(p, 44, 100, 8, 97), ph = (f / N) * TAU;
  g.shadow(1, 1, 4);
  cairn(g, 2.6, 6, torn ? 3 : 5);
  g.rod([0, 0, 0], [0, 0, 90], 1.3, wood(torn ? OLDR : WOODR, 0, 90));
  g.blob([0, 0, 91.5], 1.8, 1.8, 2, mat(BRASSR, 0.05));
  g.rod([0, 0, 93], [0, 0, 95], 0.5, mat(BRASSR));
  const L = 31, Hh = 17;
  g.rod([0, 0.4, 86.5], [0, 0.4, 86.5 - Hh], 0.6, mat(BRASSR, -0.1)); // the batten the streamer is laced to
  g.quad([0.8, 0, 86.5], [L, 0, -4], [0, 0, -Hh], (li, s, t, x, y) => {
    if (t > 1 - s * 0.55) return undefined; // tapers to a tail
    if (s > 0.86 && Math.abs(t - (1 - s * 0.55) / 2) < 0.08) return undefined; // swallow-tail notch
    if (torn && s > 0.35 && (hsh(Math.floor(s * 22), Math.floor(t * 10), 4) < 0.16 || (t > 0.8 - s * 0.55 && hsh(Math.floor(s * 30), 1, 5) < 0.5))) return undefined;
    const stripe = !torn && Math.abs(s - 0.32) < 0.035;
    return ramp(stripe ? BRASSR : col, li + (t < 0.06 ? 0.08 : 0), x, y);
  }, (s, t) => Math.sin(ph - s * 5.2) * 2.2 * s + Math.sin(ph * 2 - s * 9) * 0.5 * s * t);
};

// ---- training dummy ----------------------------------------------------------------------------------------
/** 34x58: a straw man on a post with crossed foot beams, rope bands, a sack head under a dented pot, swaying. */
export function dummy(p: Pen, f: number) {
  const g = new IsoPaint(p, 34, 58, 17, 50), sw = Math.sin((f / N) * TAU) * 1.3;
  const at = (z: number): [number, number] => [sw * z / 46, -sw * z / 92]; // lean with height
  g.shadow(0.5, 0.5, 7);
  g.box(-8, 8, -1.4, 1.4, 0, 2.4, wood(WOODR, 0, 16));
  g.box(-1.4, 1.4, -8, 8, 0, 2.4, wood(WOODR, 0, 16));
  const [tu, tv] = at(44);
  g.rod([0, 0, 2], [tu, tv, 44], 1.2, wood(WOODR, 0, 44));
  const [bu, bv] = at(24);
  const strawM: Mat = (li, s, t, x, y) => {
    if (Math.abs(t - 0.3) < 0.035 || Math.abs(t - 0.74) < 0.035) return ramp(ROPER, li * 0.95, x, y);
    return ramp(STRAWR, li + (hsh(Math.floor(s * 46), Math.floor(t * 12), 9) - 0.5) * 0.28, x, y);
  };
  g.blob([bu, bv, 24], 6, 6, 10.5, strawM);
  const [au, av] = at(31);
  g.rod([au - 10, av + 1, 31], [au + 10, av - 1, 31], 0.9, wood(WOODR, 0, 20));
  for (const k of [-1, 1]) g.blob([au + k * 11, av - k * 1.1, 31], 1.8, 1.8, 2.4, strawM);
  const [hu, hv] = at(40);
  g.blob([hu, hv, 39.5], 4.2, 4.2, 4.6, mat(SACK, 0.02));
  // stitched face toward the viewer: two cross-stitch eyes and a mouth seam
  const face = (du: number, dv: number, dz: number, c: number) => g.plot(hu + 3 + du, hv + 3 + dv, 39.5 + dz, c, 3);
  for (const e of [-1, 1]) { face(e * 1.3, -e * 1.3, 1.2, 0x241a12); face(e * 1.3 + 0.4, -e * 1.3 - 0.4, 0.6, 0x241a12); }
  for (let i = -2; i <= 2; i++) face(i * 0.6, -i * 0.6, -1.6, i % 2 ? 0x3a2c1e : 0x5e4c34);
  g.blob([hu, hv, 42.4], 4.5, 4.5, 3.4, metal(0.08), 0.5, 1);
  g.rod([hu, hv, 42.2], [hu, hv, 42.7], 4.8, metal(-0.05));
  g.plot(hu - 1, hv - 2, 45.6, IRONR[2], 2); // dent
}

// ---- fishing-net rack --------------------------------------------------------------------------------------
/** 54x50: two posts along the shore, a sagging rope, a net hanging and swaying, three fish on strings. */
export function netRack(p: Pen, f: number) {
  const g = new IsoPaint(p, 54, 50, 9, 30), sw = Math.sin((f / N) * TAU);
  for (const u of [0, 34]) { g.shadow(u + 1, 1, 3.5, 0.4); cairn(g, 1.8, 4, u); g.rod([u, 0, 0], [u, 0, 30], 1.1, wood(OLDR, 0, 30)); g.blob([u, 0, 30.3], 1.3, 1.3, 0.8, wood(OLDR, 0.05)); }
  const sag = (s: number) => 28.6 - Math.sin(s * Math.PI) * 3;
  for (let i = 0; i < 17; i++) { const s0 = i / 17, s1 = (i + 1) / 17; g.rod([s0 * 34, 0, sag(s0)], [s1 * 34, 0, sag(s1)], 0.45, mat(ROPER)); }
  const H = 20;
  g.quad([1.5, 0.6, 28.6], [31, 0, 0], [0, 0, -H], (li, s, t, x, y) => {
    if (t * H < 28.6 - sag(s) - 0.3) return undefined;
    const S = s * 31 / 1.6, T = t * H / 1.6, a = (S + T) % 2, b = ((S - T) % 2 + 2) % 2;
    if (t > 0.95) return (Math.round(s * 31) % 4 === 0) ? ramp(BONER, li + 0.1, x, y) : undefined; // cork floats
    if (a > 0.3 && b > 0.3) return undefined;
    return ramp(ROPER, li - t * 0.15, x, y);
  }, (s, t) => sw * 2.2 * t * t + Math.sin(s * Math.PI) * 0.6);
  // fish hung on strings from the rope, in front of the net
  [[8, 0], [17, 1.6], [26, 3.1]].forEach(([u, ph]) => {
    const z0 = sag(u / 34) - 0.4, swing = Math.sin((f / N) * TAU + ph) * 0.9;
    g.rod([u, 1.6, z0], [u + swing * 0.3, 2.6 + swing, z0 - 5], 0.25, mat(ROPER, -0.15));
    g.blob([u + swing * 0.3, 2.8 + swing, z0 - 8.6], 1, 1.7, 3.6, (li, s, t, x, y) => ramp(FISH, li + (t > 0.75 ? 0.1 : 0) - (t < 0.12 ? 0.2 : 0), x, y));
  });
}

// ---- skull pike --------------------------------------------------------------------------------------------
/** 26x72: a sharpened pole in a stone cairn, a skull on top grinning at the viewer, a red rag knotted under it. */
export function skullPike(p: Pen, f: number) {
  const g = new IsoPaint(p, 26, 72, 8, 66), ph = (f / N) * TAU;
  g.shadow(1, 1, 4.5);
  cairn(g, 3, 7, 2);
  g.rod([0, 0, 0], [0, 0, 57], 1, wood(OLDR, 0, 57));
  g.rod([0, 0, 57], [0, 0, 63], 0.45, wood(OLDR, 0.05, 6));
  const C: V3 = [0, 0, 51.5];
  g.blob(C, 3.5, 3.5, 3.8, mat(BONER, 0.04));
  g.blob([1.2, 1.2, 48.3], 2.3, 2.3, 1.5, mat(BONER, -0.05));
  // eye sockets, nose and teeth on the side facing the viewer (+u +v)
  const f3 = (a: number, dz: number, r = 3.6): V3 => [C[0] + Math.cos(Math.PI / 4 + a) * r, C[1] + Math.sin(Math.PI / 4 + a) * r, C[2] + dz];
  for (const a of [-0.42, 0.42]) for (const [da, dz] of [[0, 0], [0.12, 0], [0, -0.8], [0.12, -0.8]]) { const q = f3(a + da * Math.sign(a), dz + 0.2, 3.4); g.plot(q[0], q[1], q[2], 0x120c0a, 3); }
  { const q = f3(0, -1.6, 3.3); g.plot(q[0], q[1], q[2], 0x2a1e16, 3); }
  for (let i = -2; i <= 2; i++) { const q = f3(i * 0.2, -3.1, 3.2); g.plot(q[0], q[1], q[2], i % 2 ? BONER[2] : BONER[5], 3); }
  // rag knotted round the pole, its loose end flying along the wind
  g.rod([0, 0, 45.2], [0, 0, 44], 1.6, mat(REDR, -0.1));
  g.quad([1, 0, 45.2], [12, 0, -2], [0, 0, -6], (li, s, t, x, y) => {
    if (t > 1 - s * 0.5 || (s > 0.55 && hsh(Math.floor(s * 16), Math.floor(t * 6), 8) < 0.22)) return undefined;
    return ramp(REDR, li - 0.05, x, y);
  }, (s) => Math.sin(ph - s * 5) * 1.6 * s);
}

// ---- spear rack --------------------------------------------------------------------------------------------
/** 56x80: an A-frame trestle along the road, spears, a halberd and an axe leaning on its bar, a shield at the end. */
export const spearRack = (pennants: boolean) => (p: Pen, f: number) => {
  const g = new IsoPaint(p, 56, 80, 13, 58), ph = (f / N) * TAU;
  g.shadow(15, 2, 13, 0.35);
  for (const u of [1, 29]) {
    g.rod([u, -5.5, 0], [u, 0, 30], 1, wood(WOODR, -0.05, 30));
    g.rod([u, 5.5, 0], [u, 0, 30], 1, wood(WOODR, 0, 30));
    g.rod([u, -3.4, 10], [u, 3.4, 10], 0.7, wood(WOODR, 0, 8));
  }
  g.rod([-1.5, 0, 30.5], [31.5, 0, 30.5], 1.3, wood(WOODR, 0.05, 33));
  g.rod([0, 4.2, 8], [30, 4.2, 8], 0.9, wood(WOODR, 0, 30)); // front rail the feet rest behind
  for (let u = 3; u < 28; u += 6) g.box(u, u + 0.8, 4.8, 5.4, 7.6, 8.8, metal(0.1)); // pegs
  const shaft = (u: number, top: V3) => g.rod([u, 6.4, 0.4], top, 0.65, wood(WOODR, 0.02, 48));
  const head = (q: V3, len: number) => g.blob([q[0], q[1] - 0.3, q[2] + len * 0.45], 0.85, 0.85, len * 0.55, metal(0.15));
  // spears
  for (const [u, h] of [[5, 47], [17, 50], [23, 45]] as const) {
    const top: V3 = [u + 0.6, -2.2, h];
    shaft(u, top); head(top, 6);
    g.rod([top[0], top[1] + 0.3, h - 1], [top[0], top[1] + 0.35, h - 0.2], 1, mat(REDR, -0.1)); // binding
    if (pennants && u !== 17) g.quad([top[0], top[1] + 0.2, h - 1.5], [8, 0, -1.5], [0, 0, -4], (li, s, t, x, y) => (t > 1 - s * 0.6 ? undefined : ramp(u === 5 ? REDR : [0x0e1424, 0x18223a, 0x243256, 0x324474, 0x445a92], li, x, y)), (s) => Math.sin(ph + u - s * 5) * 1.2 * s);
  }
  { // halberd
    const u = 11, top: V3 = [u + 0.5, -2.4, 52];
    shaft(u, top);
    g.box(top[0] - 0.4, top[0] + 0.4, top[1] - 0.2, top[1] + 0.6, 52, 56, metal(0.15));
    g.box(top[0] - 0.4, top[0] + 4.2, top[1] - 0.1, top[1] + 0.4, 46, 51, (li, s, t, x, y) => ramp(IRONR, li + 0.1 - s * 0.1, x, y));
    g.box(top[0] - 2.6, top[0] - 0.4, top[1] - 0.1, top[1] + 0.4, 48.5, 49.8, metal(0));
  }
  { // axe
    const u = 27, top: V3 = [u + 0.4, -2, 38];
    shaft(u, top);
    g.box(top[0] - 0.2, top[0] + 3.8, top[1] - 0.1, top[1] + 0.5, 33.5, 38.6, (li, s, t, x, y) => ramp(IRONR, li + 0.08 + (s > 0.8 ? 0.15 : 0), x, y));
  }
  // round shield leaning on the far trestle: planks quartered red and bare, iron rim and boss
  const Cs: V3 = [32.2, 1.5, 8.5], e1: V3 = [0, 1, 0], e2: V3 = [-0.28, 0, 0.96], R = 7.6;
  g.surf((s, t) => {
    const r = s * R, a = t * TAU, q: V3 = [Cs[0] + (e1[0] * Math.cos(a) + e2[0] * Math.sin(a)) * r, Cs[1] + (e1[1] * Math.cos(a) + e2[1] * Math.sin(a)) * r, Cs[2] + (e1[2] * Math.cos(a) + e2[2] * Math.sin(a)) * r];
    return [q, [0.96, 0, 0.28]];
  }, 40, 120, (li, s, t, x, y) => {
    if (s > 0.86) return ramp(IRONR, li + 0.1, x, y);
    if (s < 0.2) return ramp(IRONR, li + 0.2 - s, x, y);
    const red = Math.floor(t * 4) % 2 === 0;
    return ramp(red ? REDR : WOODR, li + (hsh(Math.floor(t * 40), Math.floor(s * 6), 3) - 0.5) * 0.2, x, y);
  });
  g.blob([Cs[0] + 0.5, Cs[1], Cs[2] + 0.1], 1.1, 1.6, 1.6, metal(0.25));
};

// ---- Redfang watchtower ------------------------------------------------------------------------------------
/** 60x126: four legs leaning in, X-braces, a ladder, a planked deck with a rail (deck top 57 texels up), a thatch roof. */
export function watchtower(p: Pen, f: number) {
  const g = new IsoPaint(p, 60, 126, 30, 114), ph = (f / N) * TAU, D = 45, A = 11, B = 8;
  g.shadow(2, 2, 15, 0.45);
  const leg = (su: number, sv: number): [V3, V3] => [[su * A, sv * A, 0], [su * B, sv * B, D]];
  for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) { const [a, b] = leg(su, sv); g.rod(a, b, 1.5, wood(WOODR, su + sv < 0 ? -0.12 : 0, 46)); }
  const lerp = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const brace = (c0: [number, number], c1: [number, number], k0: number, k1: number) => {
    const [a0, b0] = leg(...c0), [a1, b1] = leg(...c1);
    g.rod(lerp(a0, b0, k0), lerp(a1, b1, k1), 0.75, wood(OLDR, 0.05, 20));
  };
  for (const [c0, c1] of [[[-1, 1], [1, 1]], [[1, 1], [1, -1]], [[-1, -1], [-1, 1]], [[1, -1], [-1, -1]]] as [[number, number], [number, number]][]) {
    brace(c0, c1, 0.08, 0.5); brace(c1, c0, 0.08, 0.5); brace(c0, c1, 0.5, 0.92); brace(c1, c0, 0.5, 0.92); brace(c0, c1, 0.5, 0.5);
  }
  // ladder up the south-west face
  for (const u of [-2.4, 2.4]) g.rod([u, A + 3.5, 0], [u, B + 1.2, D], 0.6, wood(WOODR, 0.05, 46));
  for (let k = 0.1; k < 0.98; k += 0.13) { const v = A + 3.5 + (B + 1.2 - A - 3.5) * k; g.rod([-2.4, v, k * D], [2.4, v, k * D], 0.4, wood(WOODR, 0.1, 5)); }
  // deck: planks along u, a beam rim
  g.box(-10.5, 10.5, -10.5, 10.5, D - 3, D, (li, s, t, x, y) => ramp(WOODR, li + (Math.floor(t * 21 / 2.6) % 2 ? -0.06 : 0.04) + (hsh(Math.floor(t * 8), Math.floor(s * 6), 5) - 0.5) * 0.12, x, y));
  // rail posts, rails, roof posts
  for (const [u, v] of [[-10, -10], [10, -10], [-10, 10], [10, 10], [0, 10], [10, 0]]) g.rod([u, v, D], [u, v, D + 12], 0.7, wood(WOODR, 0, 12));
  for (const z of [D + 6, D + 11.5]) for (const [a, b] of [[[-10, 10], [10, 10]], [[10, 10], [10, -10]], [[-10, -10], [10, -10]], [[-10, -10], [-10, 10]]] as [[number, number], [number, number]][]) g.rod([a[0], a[1], z], [b[0], b[1], z], 0.55, wood(OLDR, 0.05, 20));
  for (const [u, v] of [[-9.5, -9.5], [9.5, -9.5], [-9.5, 9.5], [9.5, 9.5]]) g.rod([u, v, D + 12], [u, v, D + 24], 0.7, wood(OLDR, 0, 12));
  // pyramid thatch roof with a ragged eave
  const apex: V3 = [0, 0, D + 40], E = 14, ez = D + 23;
  const corners: V3[] = [[-E, -E, ez], [E, -E, ez], [E, E, ez], [-E, E, ez]];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    const n = (() => { const e1: V3 = [b[0] - a[0], b[1] - a[1], 0], e2: V3 = [apex[0] - a[0], apex[1] - a[1], apex[2] - a[2]]; const c: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const m = Math.hypot(...c); return [c[0] / m, c[1] / m, c[2] / m] as V3; })();
    g.surf((s, t) => { const e = lerp(a, b, s); return [lerp(e, apex, t), n]; }, 70, 50, (li, s, t, x, y) => {
      if (t < 0.07 && hsh(Math.floor(s * 40), 0, i) < 0.4) return undefined; // frayed eave
      const strand = (hsh(Math.floor(s * 44 * (1 - t) + 0.5), Math.floor(t * 9), i + 3) - 0.5) * 0.3;
      return ramp(THATCH, li + strand + (t < 0.1 ? -0.1 : 0) + (Math.floor(t * 9) % 3 === 0 ? -0.06 : 0), x, y);
    });
  }
  g.rod([0, 0, D + 39], [0, 0, D + 44], 0.6, wood(OLDR, 0, 6));
  // the alarm horn on a strap, and a red rag flying from the roof post
  g.rod([10, 10, D + 16], [10.5, 11, D + 13], 0.25, mat(ROPER));
  g.rod([10.4, 11, D + 12.6], [14, 13, D + 11.2], 0.9, mat(BONER, 0.05));
  g.rod([14, 13, D + 11.2], [15, 13.5, D + 11], 1.3, mat(BONER, -0.05));
  g.quad([0.3, 0, D + 44], [10, 0, -1], [0, 0, -4.5], (li, s, t, x, y) => (t > 1 - s * 0.5 || (s > 0.6 && hsh(Math.floor(s * 14), Math.floor(t * 5), 2) < 0.25) ? undefined : ramp(REDR, li - 0.05, x, y)), (s) => Math.sin(ph - s * 4.6) * 1.5 * s);
}
