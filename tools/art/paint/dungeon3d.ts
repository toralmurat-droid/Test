/**
 * Dungeon props (client/src/dungeonArt.ts) rebuilt as 3D models and baked: the fire brazier and torch stakes with
 * live flame, the Hide-Kin drying racks, skull poles and the dripping rock spikes (3 variants each, as the painted
 * sheets have). Frame sizes and feet are the painted ones.
 */
import { mat, hash3, noise3, type Mat, type Prim } from "./mob3d";
import { blob, box, cloth, grain, rod, type PMat, type PropModel, type V3 } from "./prop3d";
import { BONER, IRONR, ROPER, STONER } from "../../../client/src/isoProps";

const TAU = Math.PI * 2;
const M = (pal: number[], o: Parameters<typeof mat>[1] = {}): Mat => mat(0, { ramp: pal, ...o });
const TIMBER = [0x140e0a, 0x22180f, 0x342418, 0x4a3422, 0x60452c, 0x765838];
const ROCK = [0x0e0d10, 0x18161a, 0x242126, 0x322e32, 0x423d40, 0x55504f, 0x6c6560];
const FLAMER = [0x5e1e0c, 0xa83a14, 0xe0641e, 0xffa040, 0xffd36a, 0xfff2b0];
const COALR = [0x2a120a, 0x6e2010, 0xc4461a, 0xffb04a];
const HIDES = [[0x2c1a0e, 0x3c2614, 0x55381f, 0x6e4a2e, 0x86603e], [0x1e1c1a, 0x2e2a26, 0x46413b, 0x5e5850, 0x76706a], [0x2e1e10, 0x3e2a18, 0x5e4228, 0x7a5a3a, 0x94724e]];
const timber = (axis: 0 | 1 | 2, b = 0) => M(TIMBER, { grain: 0.06, tex: (x, y, z) => grain(axis, 0.2)(x, y, z) + b });
const iron = (b = 0) => M(IRONR, { spec: 0.3, shine: 12, grain: 0.08, tex: (x, y, z) => b - 0.12 + (noise3(x * 0.5, y * 0.5, z * 0.5) > 0.7 ? -0.15 : 0) });
const ropeM = M(ROPER, { tex: (x, y, z) => ((x + y + z) * 1.3 % 1 < 0.3 ? -0.15 : -0.05) });

const FLAME = [0xfff2b0, 0xffd36a, 0xffa040, 0xe0641e, 0xa83a14, 0x5e1e0c];
const h2 = (x: number, y: number, s: number) => hash3(x, y, s);
/** Painted flame tongues (the old dungeon flame, over the 3D bowl): half width hw, height H texels, base at screen (cx, fy). */
export function flame2d(px: (x: number, y: number, c: number) => void, cx: number, fy: number, hw: number, H: number, f: number) {
  for (let x = -hw; x <= hw; x++) {
    const base = 1 - Math.abs(x) / (hw + 1);
    const fh = Math.round(H * 0.25 + base * H * (0.7 + 0.3 * Math.sin(f * 1.7 + x * 1.3)) + h2(x, f, 7) * 2.5);
    const lean = Math.round(Math.sin(f * 1.05 + 0.5) * 1.4);
    for (let k = 0; k < fh; k++) {
      const t = k / fh, ci = Math.min(FLAME.length - 1, Math.floor(t * 4.2 + Math.abs(x) * (2 / hw)));
      px(cx + x + (k > fh * 0.55 ? lean : 0), fy - k, FLAME[ci]);
    }
  }
}

// ---- brazier (32x50, origin 16,42) -------------------------------------------------------------------------------
export function brazier(f: number): PropModel {
  const P: Prim[] = [], st = (b: number) => M(STONER, { grain: 0.2, tex: (x, y, z) => b + ((Math.abs(x % 6) < 0.4 || z < 0.6) ? -0.18 : 0) });
  P.push(box(-6, 6, -6, 6, 0, 6, st(0), 0.4)); P.push(box(-4.5, 4.5, -4.5, 4.5, 6, 10, st(0.08), 0.4));
  // the bowl: an iron cone widening upward, hollow, a band of rivets
  const bowl = M(IRONR, { spec: 0.3, shine: 12, grain: 0.08, tex: (x, y, z) => -0.1 + (Math.abs(z - 14) < 0.6 ? (Math.floor(Math.atan2(y, x) / TAU * 8 * 4) % 4 === 0 ? 0.35 : -0.2) : 0) + (noise3(x * 0.6, y * 0.6, z * 0.6) > 0.72 ? -0.15 : 0) });
  P.push({ m: bowl, k: 0.3, lo: [-11, -11, 9.5], hi: [11, 11, 19.5], d: (x, y, z) => {
    const r = Math.hypot(x, y), R = 3.5 + (Math.min(18.5, Math.max(10, z)) - 10) * 0.72;
    return Math.max(Math.abs(r - R) - 0.7, Math.abs(z - 14.25) - 4.25);
  } });
  P.push({ ...rod([0, 0, 10], [0, 0, 11], 3.5, bowl, 3.5, 0.3) });
  P.push(blob([0, 0, 16.6], 8.4, 8.4, 1.4, M(COALR, { emit: 0.35, grain: 0.5, tex: (x, y) => (hash3(Math.floor(x * 1.3), Math.floor(y * 1.3), f) - 0.5) * 0.6 }), 0.3));
  const eyes = [0, 1, 2].map((i) => ({ p: [(hash3(i, f, 8) - 0.5) * 10, (hash3(i, f, 9) - 0.5) * 6, 36 + hash3(i, f, 10) * 6] as V3, col: i ? 0xffb04a : 0xffe08a }));
  return { prims: P, eyes, halos: [{ p: [0, 0, 22], r: 16, col: 0xffa040, a: 0.45 }], shadow: [{ u: 0, v: 0, r: 7, a: 0.4 }], cast: 6, overlay: (px, at) => { const [x, y] = at([0, 0, 17.5]); flame2d(px, Math.floor(x), Math.floor(y), 7, 15, f); } };
}

// ---- torch stake (18x58, origin 9,56) ---------------------------------------------------------------------------
export function torch(f: number): PropModel {
  const P: Prim[] = [];
  P.push(box(-1.3, 1.3, -1.3, 1.3, 0, 36, timber(2), 0.3, 0.3));
  P.push(rod([0, 0, 0], [0, 0, -0.5], 2.4, timber(2, -0.1), 1.6, 0.6));
  for (const z of [10, 26]) P.push(rod([0, 0, z - 0.7], [0, 0, z + 0.7], 1.6, ropeM, 1.6, 0.2));
  P.push({ m: iron(0.05), k: 0.3, lo: [-5, -5, 34], hi: [5, 5, 42.5], d: (x, y, z) => { const r = Math.hypot(x, y), R = 2 + (Math.min(41.5, Math.max(35, z)) - 35) * 0.4; return Math.max(Math.abs(r - R) - 0.6, Math.abs(z - 38.25) - 3.25); } });
  P.push(blob([0, 0, 40.4], 3.6, 3.6, 1.2, M(COALR, { emit: 0.4, grain: 0.5 }), 0.3));
  const eyes = f % 2 === 0 ? [{ p: [((f * 3) % 5) - 2, 0, 56 + (f % 3)] as V3, col: 0xffd36a }] : [];
  return { prims: P, eyes, halos: [{ p: [0, 0, 44], r: 10, col: 0xffa040, a: 0.4 }], shadow: [{ u: 0, v: 0, r: 4, a: 0.4 }], cast: 6, overlay: (px, at) => { const [x, y] = at([0, 0, 41]); flame2d(px, Math.floor(x), Math.floor(y), 4, 10, f); } };
}

// ---- hide drying rack (50x54, origin 25,46), 3 variants ---------------------------------------------------------
export function rack(v: number): PropModel {
  const P: Prim[] = [], A = 11, top = 36;
  for (const u of [-A, A]) { P.push(box(u - 1.4, u + 1.4, -1.4, 1.4, 0, top + 2, timber(2, u < 0 ? 0 : -0.05), 0.3, 0.3)); }
  P.push(rod([-A - 3, 0, top], [A + 3, 0, top], 1.3, timber(0, 0.05), 1.3, 0.4));
  for (const u of [-A, A]) P.push(rod([u, 0, top - 1.8], [u, 0, top + 1.8], 1.8, ropeM, 1.8, 0.2));
  // the hide: ragged, laced into the frame, sagging a little and bellying in the draught
  const pal = HIDES[v % 3];
  const hide = M(v === 1 ? pal : pal,  { grain: 0.12, tex: (x, _y, z) => {
    const n = noise3(x * 0.25 + v, 0, z * 0.25);
    const claw = [-1, 0, 1].some((k) => Math.abs(x - k * 4 - (top - 6 - z) * 0.3) < 0.6 && z > top - 16 && z < top - 7);
    return 0.12 + (n > 0.68 ? -0.18 : 0) + (claw ? -0.55 : 0);
  } });
  const sx = 2 * A - 6, sz = top - 10;
  P.push(cloth([-A + 3, 0.4, top - 3], [sx, 0, 0], [0, 0, -sz], hide, (s, t) => Math.sin(s * Math.PI) * Math.sin(t * Math.PI) * 1.4 + Math.sin(t * Math.PI) * 0.3, (s, t) => {
    const nx = s * 2 - 1, ny = t * 2 - 1, r = Math.max(Math.abs(nx) ** 3, Math.abs(ny) ** 3) + (noise3(s * 6, t * 5, v) - 0.5) * 0.5;
    return r <= 1;
  }, 0.5));
  for (let z = top - 6; z > top - sz; z -= 4) for (const u of [-A + 3, A - 3]) P.push(rod([Math.sign(u) * A, 0, z + 1], [u, 0.4, z], 0.3, ropeM, 0.3, 0.1)); // lacing
  return { prims: P, shadow: [{ u: 0, v: 0, r: 12, a: 0.3 }], cast: 8 };
}

// ---- skull pole (30x58, origin 15,56), 3 variants -----------------------------------------------------------------
export function pole(v: number): PropModel {
  const P: Prim[] = [], eyes: { p: V3; col: number }[] = [], lean = (v % 2) * 0.6;
  P.push(box(-1.6, 1.6, -1.6, 1.6, 0, 40, timber(2), 0.3, 0.3));
  P.push(rod([0, 0, 40], [lean, 0, 46], 0.7, timber(2, 0.05), 0.25, 0.3));
  const C: V3 = [lean * 0.6, 0.6, 44.5], bone = M(BONER, { grain: 0.07 }), dark = M([0x0c0806, 0x120c0a, 0x1c1410]);
  P.push(blob(C, 3.7, 3.7, 3.9, bone, 0.5)); P.push(blob([C[0] + 1.2, C[1] + 1.2, C[2] - 3.2], 2.5, 2.5, 1.6, bone, 0.6));
  const f3 = (a: number, r: number, dz: number): V3 => [C[0] + Math.cos(Math.PI / 4 + a) * r, C[1] + Math.sin(Math.PI / 4 + a) * r, C[2] + dz];
  for (const a of [-0.45, 0.45]) P.push({ ...blob(f3(a, 3.8, 0.2), 0.9, 0.9, 0.95, dark, 0.2), cut: true });
  for (let i = -2; i <= 2; i++) eyes.push({ p: f3(i * 0.2, 3.4, -3.4), col: i % 2 ? BONER[2] : BONER[5] });
  if (v % 3 !== 2) for (const s of [-1, 1]) { // curled horns
    const pts: V3[] = []; for (let k = 0; k <= 6; k++) { const a = k * 0.5; pts.push([C[0] - 0.8 + Math.sin(a) * 0.8 * k * 0.3, C[1] - s * (2.8 + k * 1.3), C[2] + 1.6 + Math.sin(a) * 2.6 - k * 0.2]); }
    for (let k = 1; k < pts.length; k++) P.push(rod(pts[k - 1], pts[k], 1 - k * 0.12, M(BONER, { tex: () => -0.1 - k * 0.04 }), 0.9 - k * 0.12, 0.3));
  }
  // rags hanging from under the skull, a string of teeth round the post
  P.push(cloth([1.4, 1.4, 39], [2.4, 2.4, 0], [0.3, 0.2, -13], M([0x1e120c, 0x3a2418, 0x5a3424, 0x744430]), (s, t) => Math.sin(t * 4 + v) * 0.5 * t + s * 0.4, (s, t) => noise3(s * 4, t * 9, v * 3) < 0.72 - t * 0.2, 0.4));
  for (let k = 0; k < 7; k++) { const a = Math.PI / 4 - 1.2 + k * 0.4, z = 37.5 - Math.sin((k / 6) * Math.PI) * 2; P.push(rod([Math.cos(a) * 1.9, Math.sin(a) * 1.9, z], [Math.cos(a) * 2.2, Math.sin(a) * 2.2, z - 1.4], 0.35, bone, 0.15, 0.1)); }
  return { prims: P, eyes, shadow: [{ u: 0, v: 0, r: 4.5, a: 0.4 }], cast: 6 };
}

// ---- rock spike (22x44, origin 11,41), 3 variants -----------------------------------------------------------------
export function spike(v: number): PropModel {
  const P: Prim[] = [], H = 38 - v * 4, R = 6.5, lean = (v - 1) * 1.6;
  const rock = M(ROCK, { grain: 0.18, spec: 0.25, shine: 10, tex: (x, y, z) => (Math.sin(z * 0.9 + Math.atan2(y, x) * 1.5 + v) > 0.82 ? -0.18 : 0) + (z < 2 ? -0.2 : 0) });
  P.push({ m: rock, k: 0.5, lo: [-R - 2 - Math.abs(lean), -R - 2 - Math.abs(lean), 0], hi: [R + 2 + Math.abs(lean), R + 2 + Math.abs(lean), H + 1], d: (x, y, z) => {
    const t = Math.max(0, Math.min(1, z / H)), cx = lean * t * t, cy = -lean * t * t;
    const r = R * Math.pow(1 - t, 0.85) * (1 + (noise3(x * 0.4, y * 0.4, z * 0.25 + v) - 0.5) * 0.5) + 0.3;
    return Math.max((Math.hypot(x - cx, y - cy) - r) * 0.7, -z, z - H);
  } });
  for (let k = 0; k < 5; k++) { const a = hash3(k, v, 74) * TAU, d = R + 1 + hash3(k, v, 75) * 2; P.push(blob([Math.cos(a) * d, Math.sin(a) * d, 0.3], 1.2, 1, 0.8, rock, 0.5)); }
  return { prims: P, shadow: [{ u: 0, v: 0, r: 7, a: 0.4 }], cast: 8 };
}

export const DUNGEON3D: { key: string; w: number; h: number; frames: number; ox: number; oy: number; model: (f: number) => PropModel }[] = [
  { key: "dg_brazier", w: 32, h: 50, frames: 6, ox: 16, oy: 42, model: brazier },
  { key: "dg_torch", w: 18, h: 58, frames: 6, ox: 9, oy: 55, model: torch },
  { key: "dg_rack", w: 50, h: 54, frames: 3, ox: 25, oy: 47, model: rack },
  { key: "dg_pole", w: 30, h: 58, frames: 3, ox: 15, oy: 55, model: pole },
  { key: "dg_spike", w: 22, h: 44, frames: 3, ox: 11, oy: 39, model: spike },
];

// ---- quest objects: silk cocoon (30x50, origin 15,47) and the Hide Rite totem (40x76, origin 20,73) ---------------
const SILK = [0x4a4840, 0x6e6a60, 0x8e8a7e, 0xb0aca0, 0xc8c4b6, 0xe6e2d4, 0xf4f0e4];
export function cocoon(cut: boolean): PropModel {
  const P: Prim[] = [], eyes: { p: V3; col: number }[] = [];
  const silk = M(SILK, { grain: 0.06, spec: 0.15, shine: 6, tex: (x, y, z) => (Math.sin(z * 1.6 + Math.atan2(y, x) * 2.2) > 0.6 ? -0.28 : 0) });
  if (!cut) {
    // a body wrapped head to foot, hanging from threads, a face and a hand pressed against the silk
    P.push(blob([0, 0, 15], 5.6, 5, 13, silk, 1.5)); P.push(blob([0.4, 0.4, 30], 3.6, 3.4, 4.2, silk, 1.5));
    P.push(blob([3.6, 3.6, 19], 1.4, 1.4, 1.2, M(SILK, { tex: () => -0.05 }), 0.6)); // the hand
    P.push(rod([0.4, 0.4, 33], [0.6, 0.6, 46], 0.3, silk, 0.3, 0.3));
    for (let k = 0; k < 5; k++) { const a = k * 1.3; P.push(rod([Math.cos(a) * 3, Math.sin(a) * 3, 2], [Math.cos(a) * 7, Math.sin(a) * 7, 0], 0.25, silk, 0.25, 0.2)); }
    const F = (du: number, dz: number, col: number) => eyes.push({ p: [0.4 + 3 + du, 0.4 + 3 - du, 30 + dz], col });
    F(-1, 0.6, 0x6a5e50); F(1, 0.6, 0x6a5e50); F(0, -1.2, 0x5a4e42);
  } else {
    // cut down: a torn husk sagging on the floor, threads hanging from above
    const husk = M(SILK, { grain: 0.08, tex: (x, y, z) => -0.08 + (Math.sin(z * 1.6 + Math.atan2(y, x) * 2.2) > 0.6 ? -0.2 : 0) });
    P.push({ m: husk, k: 0.4, lo: [-10, -10, 0], hi: [10, 10, 9], d: (x, y, z) => {
      const r = Math.hypot(x, y), R = 7.5 - z * 0.45 + (noise3(x * 0.5, y * 0.5, 2) - 0.5) * 2;
      const shell = Math.abs(r - R) - 0.7, torn = z - (3 + noise3(Math.atan2(y, x) * 2, 0, 5) * 5);
      return Math.max(shell, torn, -z);
    } });
    for (let k = 0; k < 4; k++) P.push(rod([-4 + k * 2.6, k % 2, 22], [-4 + k * 2.6 + 0.4, k % 2, 13 + k], 0.25, silk, 0.25, 0.1));
  }
  return { prims: P, eyes, shadow: [{ u: 0, v: 0, r: 7, a: 0.35 }], cast: 6 };
}
export function totem(burnt: boolean): PropModel {
  const P: Prim[] = [], eyes: { p: V3; col: number }[] = [];
  const wood = burnt ? M([0x0c0a08, 0x120e0c, 0x241c18, 0x3a302a, 0x4a3e36], { grain: 0.2, tex: (x, y, z) => (noise3(x, y, z * 0.5) > 0.7 ? 0.25 : 0) }) : timber(2);
  P.push(box(-1.6, 1.6, -1.6, 1.6, 0, 58, wood, 0.3, 0.4));
  P.push(rod([-14, 0, 46], [12, 0, 46], 1.2, burnt ? wood : timber(0), 1.2, 0.4)); P.push(rod([0, 0, 44.4], [0, 0, 47.6], 2, ropeM, 2, 0.2));
  if (!burnt) {
    const blood = M([0x2a0806, 0x3e0e0a, 0x6a1a12, 0x80241a]);
    [0, 1, 2].forEach((s) => {
      const hide: PMat = { ...M(HIDES[s], { grain: 0.12, tex: (_x, _y, z) => 0.1 + ((46 - z) % 7 < 0.6 ? -0.35 : 0) }) };
      hide.sub = (x, _y, z) => (Math.abs(x - (-10 + s * 9)) < 0.8 && z > 33 && z < 40 ? blood : undefined);
      P.push(cloth([-14 + s * 9.2, 0.6, 45], [8, 0, 0], [0, 0, -(24 - s * 3)], hide, (s2, t) => Math.sin(t * 3 + s) * 0.5 * t + s2 * 0.3, (s2, t) => !(t > 0.82 && noise3(s2 * 8, t * 6, s) > 0.5), 0.45));
    });
    for (const du of [-9, 8]) { P.push(rod([du, 4, 0], [du, 4, 5.5], 1.4, M(WAXR, { grain: 0.05 }), 1.3, 0.3)); eyes.push({ p: [du, 4, 6.4], col: 0xffd36a }, { p: [du, 4, 7.4], col: 0xff8a3a }); }
  } else {
    for (let s = 0; s < 3; s++) P.push(cloth([-14 + s * 9.2, 0.6, 45], [8, 0, 0], [0, 0, -6], M([0x0c0806, 0x1e1612, 0x2e221a]), () => 0, (s2, t) => noise3(s2 * 6, t * 4, s + 7) < 0.6, 0.45));
    for (let k = 0; k < 8; k++) eyes.push({ p: [(hash3(k, 1, 9) - 0.5) * 24, 1.6, 6 + hash3(k, 2, 9) * 46], col: k % 2 ? 0xff7a2a : 0xc4461a });
  }
  // the horned skull on top
  const C: V3 = [0.4, 0.6, 61.5], bone = M(BONER, { grain: 0.07, tex: () => (burnt ? -0.25 : 0) }), dark = M([0x0c0806, 0x120c0a, 0x1c1410]);
  P.push(blob(C, 3.7, 3.7, 3.9, bone, 0.5)); P.push(blob([C[0] + 1.2, C[1] + 1.2, C[2] - 3.2], 2.5, 2.5, 1.6, bone, 0.6));
  const f3 = (a: number, r: number, dz: number): V3 => [C[0] + Math.cos(Math.PI / 4 + a) * r, C[1] + Math.sin(Math.PI / 4 + a) * r, C[2] + dz];
  for (const a of [-0.45, 0.45]) P.push({ ...blob(f3(a, 3.8, 0.2), 0.9, 0.9, 0.95, dark, 0.2), cut: true });
  for (const s of [-1, 1]) { const pts: V3[] = []; for (let k = 0; k <= 6; k++) { const a = k * 0.5; pts.push([C[0] - 0.8 + Math.sin(a) * 0.3 * k, C[1] - s * (2.8 + k * 1.3), C[2] + 1.6 + Math.sin(a) * 2.6 - k * 0.2]); } for (let k = 1; k < pts.length; k++) P.push(rod(pts[k - 1], pts[k], 1 - k * 0.12, bone, 0.9 - k * 0.12, 0.3)); }
  return { prims: P, eyes, shadow: [{ u: 0, v: 0, r: 8, a: 0.35 }], cast: 8 };
}
const WAXR = [0x4a3e2a, 0x6a5a40, 0x8a7a5a, 0xaa9a74, 0xc8b88e, 0xeae0c0, 0xf6f0dc];
DUNGEON3D.push(
  { key: "qobj_silk", w: 30, h: 50, frames: 1, ox: 15, oy: 46, model: () => cocoon(false) },
  { key: "qobj_silk_cut", w: 30, h: 50, frames: 1, ox: 15, oy: 46, model: () => cocoon(true) },
  { key: "qobj_totem", w: 40, h: 76, frames: 1, ox: 20, oy: 72, model: () => totem(false) },
  { key: "qobj_totem_burnt", w: 40, h: 76, frames: 1, ox: 20, oy: 72, model: () => totem(true) },
);
