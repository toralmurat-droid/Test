/**
 * Trees, bushes and grass rebuilt as 3D models (prop3d.ts) and baked to sheets (Murat 2026-11-20: "redo all trees and
 * vegetation to look nicer, as if there were wind"). Each sheet holds WIND_FRAMES poses from a slight lean upwind to a
 * full lean downwind; client/src/trees3d.ts picks the pose from a gust travelling across the map, so a wood bends in
 * waves and each tree costs one frame change, never a repaint. The bend grows with height (trunks stay rooted), and
 * every leaf clump also flutters on its own, so stepping through the frames reads as rustling, not a rigid tilt.
 * Frames are in world px (1 texel = 1 world px, like every baked prop); the feet (trunk base) sit at (ox, oy).
 */
import { custom, hash3, mat, noise3, rng, type Mat, type Prim } from "./mob3d";
import { blob, rod, type PropModel, type V3 } from "./prop3d";
import { WIND_FRAMES } from "../../../client/src/trees3d";

const TAU = Math.PI * 2;
/** Lean of frame f: -0.35 (a little upwind, the spring back) .. 1 (full gust). */
export const lean = (f: number) => -0.35 + (1.35 * f) / (WIND_FRAMES - 1);

// ---- palettes (dark and weathered, Diablo-ish, with a little life in the sunlit tops) ----------------------------
const LEAF = [0x060a07, 0x0b140d, 0x122013, 0x1a2c19, 0x243a1f, 0x324a26, 0x445c2e, 0x5c7038, 0x768444];
const OLIVE = [0x090b06, 0x12160b, 0x1c2311, 0x283016, 0x363e1c, 0x474e22, 0x5c602a, 0x767434, 0x908a42];
const SICK = [0x100e09, 0x1c180f, 0x2a2416, 0x3a321d, 0x4c4224, 0x62542d, 0x7a6836];
const AUTUMN = [0x120a06, 0x22120a, 0x34200e, 0x4a3012, 0x624016, 0x7e521c, 0x9a6826, 0xb48034];
const NEEDLE = [0x060b0a, 0x0b1512, 0x12201a, 0x1a2c23, 0x24392d, 0x304838, 0x405a45, 0x56704f];
const BARK = [0x0e0b09, 0x19140f, 0x261e17, 0x342a1f, 0x443829, 0x584934, 0x6c5c44];
const BIRCHB = [0x1c1a18, 0x34302c, 0x58524a, 0x7e7668, 0xa49c8a, 0xc6beaa, 0xdcd6c4];
const BERRY = [0x7a1a16, 0xb02a20, 0xd84a34];

const leafMat = (pal: number[], bias = 0): Mat => mat(0, { ramp: pal, grain: 0.1, tex: (x, y, z) => bias + (hash3(Math.floor(x * 0.75), Math.floor(y * 0.75), Math.floor(z * 0.75)) - 0.5) * 0.42 });
const barkMat = (pal = BARK, bias = 0): Mat => mat(0, { ramp: pal, grain: 0.12, tex: (x, y, z) => bias + (hash3(Math.floor((x + y) * 1.3), Math.floor(z / 3), 5) - 0.5) * 0.26 });

/** Screen-right push (wind) of `d` texels, as a (u, v) offset: screen x = u - v, y unchanged. */
const push = (p: V3, d: number): V3 => [p[0] + d / 2, p[1] - d / 2, p[2]];

/**
 * A leafy clump: an ellipsoid whose skin is broken by noise into smaller bunches (radius r across, rz tall). The noise
 * is in the clump's own frame, so a clump keeps its shape as it moves with the wind.
 */
function clump(c: V3, r: number, rz: number, m: Mat, seed: number, amp = 1.3): Prim {
  const R = Math.max(r, rz) + amp + 0.8, f = 2.6 / Math.max(3, Math.min(r, rz) + 2);
  return custom([c[0] - R, c[1] - R, c[2] - R], [c[0] + R, c[1] + R, c[2] + R], (x, y, z) => {
    const a = (x - c[0]) / r, b = (y - c[1]) / r, h = (z - c[2]) / rz, k = Math.hypot(a, b, h);
    const n = noise3((x - c[0]) * f + seed * 7.1, (y - c[1]) * f + seed * 3.3, (z - c[2]) * f * 1.3 + seed) - 0.5;
    return ((k - 1) * Math.min(r, rz) - n * 2 * amp) * 0.62;
  }, m, { k: 1.6 });
}

/** Wind helper for one model: bend(p) moves a point by the lean, growing with (z / H)^1.6; flutter adds a clump's own shiver. */
function windOf(f: number, H: number, A: number) {
  const L = lean(f);
  return {
    L,
    bend: (p: V3): V3 => push(p, A * L * Math.pow(Math.max(0, p[2]) / H, 1.6)),
    flutter: (p: V3, seed: number, k = 0.7): V3 => {
      const ph = seed * TAU, s = Math.sin(f * 2.3 + ph) * k * (0.35 + Math.abs(L));
      return [p[0] + s * 0.5, p[1] - s * 0.5, p[2] + Math.cos(f * 1.7 + ph) * k * 0.4 * Math.abs(L)];
    },
  };
}

/** A tapering limb along bent points (trunk, branch): a chain of rods. */
function limb(P: Prim[], pts: V3[], r0: number, r1: number, m: Mat) {
  for (let i = 1; i < pts.length; i++) P.push(rod(pts[i - 1], pts[i], r0 + (r1 - r0) * ((i - 1) / (pts.length - 1)), m, r0 + (r1 - r0) * (i / (pts.length - 1)), 0.45));
}
/** Points from a to b in n steps, through the wind bend. */
function path(a: V3, b: V3, n: number, bend: (p: V3) => V3, curl = 0): V3[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, w = Math.sin(t * Math.PI) * curl;
    return bend([a[0] + (b[0] - a[0]) * t + w, a[1] + (b[1] - a[1]) * t - w * 0.6, a[2] + (b[2] - a[2]) * t]);
  });
}
/** Roots flaring into the ground round a trunk foot. */
function roots(P: Prim[], r: number, n: number, seed: number, m: Mat) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hash3(i, seed, 3) * 0.8, l = r * (2 + hash3(i, seed, 4) * 1.6);
    P.push(rod([0, 0, r * 1.4], [Math.cos(a) * l, Math.sin(a) * l, -0.4], r * 0.55, m, 0.5, 0.8));
  }
}

// ---- broadleaf (oak) -----------------------------------------------------------------------------------------------
interface Oak { seed: number; pal: number[]; trunkH: number; crownZ: number; crownR: number; crownRz: number; clumps: number; lobes?: [number, number, number, number][]; dead?: number; thin?: number; trunkR?: number }
function oak(o: Oak) {
  return (f: number): PropModel => {
    const top = o.crownZ + o.crownRz, w = windOf(f, top, 7), r = rng(o.seed), P: Prim[] = [];
    const bark = barkMat(), tr = o.trunkR ?? 2.2;
    roots(P, tr, 5, o.seed, bark);
    const trunk = path([0, 0, 0], [0.6, -0.4, o.trunkH], 4, w.bend, 0.6);
    limb(P, trunk, tr, tr * 0.62, bark);
    // main boughs from the trunk top into the crown masses
    const lobes = o.lobes ?? [[0, 0, 0, 1]];
    for (const [du, dv, dz] of lobes) limb(P, path([0.6, -0.4, o.trunkH - 2], [du * 0.8, dv * 0.8, o.crownZ + dz - 3], 3, w.bend, 1), tr * 0.6, tr * 0.28, bark);
    for (let i = 0; i < (o.dead ?? 0); i++) { // bare dead limbs poking out of a thin crown
      const a = r() * TAU, len = o.crownR * (0.9 + r() * 0.4);
      limb(P, path([0.4, -0.2, o.trunkH + 1], [Math.cos(a) * len, Math.sin(a) * len, o.crownZ + o.crownRz * (0.2 + r() * 0.7)], 3, w.bend, 1.2), 0.9, 0.3, barkMat(BARK, 0.06));
    }
        for (const [du, dv, dz, s] of lobes) {
      const c = w.bend([du, dv, o.crownZ + dz]);
      P.push(clump(c, o.crownR * 0.72 * s, o.crownRz * 0.72 * s, leafMat(o.pal, -0.12), o.seed + du, 1.6));
      // smaller clumps round the mass's skin: the bumpy, bunched silhouette
      const n = Math.round(o.clumps * s);
      for (let i = 0; i < n; i++) {
        const a = r() * TAU, el = (r() - 0.25) * 1.2, rr = (o.crownR * s) * (0.62 + r() * 0.3);
        const p: V3 = [du + Math.cos(a) * Math.cos(el) * rr, dv + Math.sin(a) * Math.cos(el) * rr, o.crownZ + dz + Math.sin(el) * o.crownRz * s * 0.8];
        if (o.thin && r() < o.thin) continue;
        const q = w.flutter(w.bend(p), r(), 0.8), sz = (2.6 + r() * 2.6) * Math.sqrt(s);
        P.push(clump(q, sz, sz * 0.85, leafMat(o.pal, (p[2] - o.crownZ) * 0.012), o.seed * 13 + i, 1));
      }
    }
    return { prims: P, shadow: [{ u: 2, v: 2, r: o.crownR * 0.8, a: 0.2 }, { u: 0.5, v: 0.5, r: tr * 2.2, a: 0.4 }] };
  };
}

// ---- conifers (pine) ------------------------------------------------------------------------------------------------
/** A drooping tier of needles: a flat cone whose rim hangs and breaks into ragged sprays. */
function tier(c: V3, R: number, h: number, m: Mat, seed: number): Prim {
  const B = R + 1.6;
  return custom([c[0] - B, c[1] - B, c[2] - 2.6], [c[0] + B, c[1] + B, c[2] + h + 1], (x, y, z) => {
    const dx = x - c[0], dy = y - c[1], q = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const spray = 0.55 + 0.45 * Math.abs(Math.sin(a * 4.5 + seed * 3)) + (noise3(dx * 0.6 + seed, dy * 0.6, z * 0.6) - 0.5) * 0.5;
    const rr = R * spray, droop = (q / R) * (q / R) * 2.2; // the skirt hangs at its rim
    const zz = z - c[2] + droop, cone = (q / rr) * h + zz - h; // > 0 above the cone's slope
    const under = -zz - 0.6; // the tier's underside
    return Math.max(cone * 0.45, under * 0.8, (q - rr) * 0.8);
  }, m, { k: 0.6 });
}
interface Pine { seed: number; tiers: number; H: number; R: number; gaunt?: boolean; pal?: number[] }
function pine(o: Pine) {
  return (f: number): PropModel => {
    const w = windOf(f, o.H, 8), r = rng(o.seed), P: Prim[] = [], bark = barkMat(BARK, -0.04);
    roots(P, 1.6, 4, o.seed, bark);
    limb(P, path([0, 0, 0], [0, 0, o.H], 5, w.bend), 1.7, 0.4, bark);
    const pal = o.pal ?? NEEDLE;
    for (let i = 0; i < o.tiers; i++) {
      const t = i / (o.tiers - 1), z = o.H * (0.2 + t * 0.66) + (r() - 0.5) * 1.2;
      if (o.gaunt && i > 0 && i < o.tiers - 1 && r() < 0.3) { // a bare gap: dead twigs only
        for (const s of [-1, 1]) limb(P, [w.bend([0, 0, z]), w.bend([s * 4, -s * 2, z - 1.2])], 0.4, 0.2, barkMat(BARK, 0.05));
        continue;
      }
      const R = o.R * (1 - t * 0.78) * (0.85 + r() * 0.3) * (o.gaunt ? 0.75 : 1);
      const c = w.flutter(w.bend([(r() - 0.5) * 0.8, (r() - 0.5) * 0.8, z]), r(), 0.45 + t * 0.4);
      P.push(tier(c, R, 3.4 + R * 0.35, leafMat(pal, t * 0.08 - 0.02), o.seed + i));
    }
    const tip = w.bend([0, 0, o.H + 3]);
    P.push(rod(w.bend([0, 0, o.H - 2]), tip, 1.2, leafMat(pal, 0.06), 0.2, 0.4));
    return { prims: P, shadow: [{ u: 1.5, v: 1.5, r: o.R * 0.7, a: 0.2 }, { u: 0.4, v: 0.4, r: 3, a: 0.42 }] };
  };
}

// ---- bare and pale trees --------------------------------------------------------------------------------------------
/** A dead, gnarled tree: each branch forks into two or three thinner, twisting ones. */
function deadTree(seed: number, H: number, pal = BARK) {
  return (f: number): PropModel => {
    const w = windOf(f, H + 18, 2.6), r = rng(seed), P: Prim[] = [], bark = barkMat(pal, 0.02);
    roots(P, 2, 5, seed, bark);
    limb(P, path([0, 0, 0], [0.5, -0.5, H], 4, w.bend, 0.9), 2.2, 1.3, bark);
    const branch = (a: V3, yaw: number, pitch: number, len: number, rad: number, depth: number) => {
      const b: V3 = [a[0] + Math.cos(yaw) * Math.cos(pitch) * len, a[1] + Math.sin(yaw) * Math.cos(pitch) * len, a[2] + Math.sin(pitch) * len];
      limb(P, path(a, b, 2, w.bend, (r() - 0.5) * 1.2), rad, rad * 0.62, bark);
      if (depth <= 0 || rad < 0.3) return;
      const kids = 2 + (r() < 0.35 ? 1 : 0);
      for (let k = 0; k < kids; k++) branch(b, yaw + (k - (kids - 1) / 2) * 0.9 + (r() - 0.5) * 0.5, Math.min(1.35, pitch + (r() - 0.4) * 0.5), len * (0.6 + r() * 0.15), rad * 0.62, depth - 1);
    };
    for (let i = 0; i < 3; i++) branch([0.5, -0.5, H - i * 3], (i / 3) * TAU + r(), 0.7 + r() * 0.4, 9 + r() * 3, 1.3, 3);
    return { prims: P, shadow: [{ u: 0.4, v: 0.4, r: 4, a: 0.4 }] };
  };
}

// ---- bushes ---------------------------------------------------------------------------------------------------------
interface Bush { seed: number; R: number; H: number; pal: number[]; berries?: boolean; lumps: number }
function bush(o: Bush) {
  return (f: number): PropModel => {
    const w = windOf(f, o.H * 2, 3.4), r = rng(o.seed), P: Prim[] = [];
    P.push(clump(w.bend([0, 0, o.H * 0.42]), o.R * 0.8, o.H * 0.5, leafMat(o.pal, -0.04), o.seed, 1.3));
    const eyes: { p: V3; col: number }[] = [];
    for (let i = 0; i < o.lumps; i++) {
      const a = r() * TAU, d = o.R * (0.45 + r() * 0.45), z = o.H * (0.3 + r() * 0.55);
      const c = w.flutter(w.bend([Math.cos(a) * d, Math.sin(a) * d, z]), r(), 0.5), s = 2.4 + r() * 2.2;
      P.push(clump(c, s, s * 0.8, leafMat(o.pal, (z / o.H) * 0.08), o.seed * 7 + i, 0.9));
      if (o.berries && r() < 0.8) {
        const b: V3 = [c[0] + s * 0.75, c[1] + s * 0.75, c[2] + s * 0.2];
        eyes.push({ p: b, col: BERRY[1] }, { p: [b[0], b[1], b[2] + 0.9], col: BERRY[2] });
      }
    }
    return { prims: P, eyes, shadow: [{ u: 0.5, v: 0.5, r: o.R + 1, a: 0.38 }] };
  };
}

// ---- grass ----------------------------------------------------------------------------------------------------------
/** A tuft of tall grass blades: thin bent rods from one foot, tips swept by the wind far more than anything else. */
function grass(seed: number, n: number, H: number, pal: number[], seedHeads = false) {
  return (f: number): PropModel => {
    const L = lean(f), r = rng(seed), P: Prim[] = [], eyes: { p: V3; col: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, sp = 1 + r() * 2.6, h = H * (0.45 + r() * 0.6), ph = r() * TAU;
      const sway = (3.6 + r()) * L + Math.sin(f * 2.4 + ph) * 0.7 * (0.4 + Math.abs(L)), m = leafMat(pal, (r() - 0.5) * 0.2);
      const pts: V3[] = [0, 0.35, 0.7, 1].map((t) => push([Math.cos(a) * sp * (0.3 + t), Math.sin(a) * sp * (0.3 + t), h * t - sway * 0.25 * t * t], sway * t * t));
      for (let k = 1; k < pts.length; k++) P.push(rod(pts[k - 1], pts[k], 0.55 - k * 0.12, m, 0.5 - k * 0.13, 0.15));
      if (seedHeads && r() < 0.5) eyes.push({ p: pts[3], col: 0xb49a5a });
    }
    return { prims: P, eyes, shadow: [{ u: 0.3, v: 0.3, r: 3, a: 0.3 }] };
  };
}

// ---- the sheets -------------------------------------------------------------------------------------------------------
export interface TreeSheet { key: string; w: number; h: number; ox: number; oy: number; model: (f: number) => PropModel }
const T = (key: string, w: number, h: number, ox: number, oy: number, model: (f: number) => PropModel): TreeSheet => ({ key, w, h, ox, oy, model });

/** Act 1 woods: eight broadleaf looks, two pines, two bushes and three grass tufts. Sizes = frame (world px), feet at (ox, oy). */
export const TREES3D: TreeSheet[] = [
  T("tr3_oak_a", 72, 90, 36, 82, oak({ seed: 3, pal: LEAF, trunkH: 20, crownZ: 38, crownR: 17, crownRz: 14, clumps: 26, lobes: [[0, 0, 0, 1], [-5, 6, -4, 0.7], [6, -5, -3, 0.7], [1, 1, 8, 0.65]] })),
  T("tr3_oak_b", 72, 90, 36, 82, oak({ seed: 7, pal: OLIVE, trunkH: 22, crownZ: 40, crownR: 16, crownRz: 13, clumps: 24, lobes: [[0, 0, 0, 1], [5, 5, -5, 0.75], [-4, -5, 4, 0.7]] })),
  T("tr3_oak_c", 80, 90, 40, 82, oak({ seed: 31, pal: LEAF, trunkH: 17, crownZ: 34, crownR: 13, crownRz: 11, clumps: 18, trunkR: 2.8, lobes: [[-9, 5, 0, 1], [8, -6, 3, 0.95], [0, 0, 10, 0.7]] })),
  T("tr3_oak_d", 72, 90, 36, 82, oak({ seed: 53, pal: SICK, trunkH: 22, crownZ: 38, crownR: 14, crownRz: 11, clumps: 22, thin: 0.45, dead: 3, lobes: [[0, 0, 0, 1], [4, -4, 6, 0.6]] })),
  T("tr3_oak_e", 56, 90, 28, 82, oak({ seed: 67, pal: LEAF, trunkH: 22, crownZ: 42, crownR: 10, crownRz: 17, clumps: 20, trunkR: 1.5, lobes: [[0, 0, 0, 1], [0.5, -0.5, 11, 0.6]] })),
  T("tr3_oak_g", 76, 92, 38, 84, oak({ seed: 91, pal: AUTUMN, trunkH: 20, crownZ: 38, crownR: 16, crownRz: 13, clumps: 24, lobes: [[0, 0, 0, 1], [-6, 4, 3, 0.7], [5, -6, -2, 0.7]] })),
  T("tr3_oak_h", 64, 84, 32, 76, oak({ seed: 113, pal: OLIVE, trunkH: 15, crownZ: 30, crownR: 13, crownRz: 11, clumps: 18, lobes: [[0, 0, 0, 1], [3, 3, 6, 0.6]] })),
  T("tr3_oak_f", 72, 84, 36, 76, deadTree(91, 18)),
  T("tr3_pine", 48, 96, 24, 88, pine({ seed: 5, tiers: 7, H: 66, R: 15 })),
  T("tr3_pine_b", 44, 100, 22, 92, pine({ seed: 17, tiers: 8, H: 74, R: 12, gaunt: true })),
  T("tr3_bush", 40, 34, 20, 28, bush({ seed: 11, R: 8, H: 12, pal: LEAF, berries: true, lumps: 9 })),
  T("tr3_bush_b", 44, 34, 22, 28, bush({ seed: 29, R: 9, H: 11, pal: OLIVE, lumps: 10 })),
  T("tr3_grass_a", 28, 26, 14, 22, grass(41, 22, 12, LEAF)),
  T("tr3_grass_b", 28, 28, 14, 24, grass(43, 18, 15, OLIVE, true)),
  T("tr3_grass_c", 28, 24, 14, 20, grass(47, 24, 9, LEAF)),
];

// ---- the other lands ------------------------------------------------------------------------------------------------
const FROND = [0x0a0f07, 0x141c0c, 0x1f2b12, 0x2c3b17, 0x3c4c1d, 0x506024, 0x68752c, 0x828a36];
const PALMB = [0x1a120a, 0x2c2014, 0x40301e, 0x564028, 0x6c5232, 0x84663e, 0x9c7c4c];
const WILLOW = [0x070c09, 0x0e1812, 0x16241a, 0x1f3122, 0x2a3f2a, 0x384f31, 0x4a613a, 0x607443];
const FERN = [0x061009, 0x0c1a0f, 0x142716, 0x1d361c, 0x284622, 0x35582a, 0x466b33];
const GORSE = [0x080b07, 0x10170d, 0x192215, 0x232e1b, 0x2e3a21, 0x3c4828, 0x4c5730];
const THORN = [0x0f0d08, 0x1b170e, 0x292315, 0x37301b, 0x473e22, 0x58502b, 0x6b6234];
const PALE = [0x161412, 0x2a2622, 0x423c35, 0x5c554b, 0x787061, 0x948b79, 0xb0a892];
const REDB = [0x140c09, 0x24150f, 0x361f16, 0x4a2b1e, 0x5e3a28, 0x744c34, 0x8a5e40];

/** A frond / leaf blade: leaflets (flat blobs) along an arching spine from a, out along yaw, drooping at the tip. */
function frond(P: Prim[], a: V3, yaw: number, len: number, rise: number, droop: number, m: Mat, bend: (p: V3) => V3, wide = 2.4, n = 7) {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, d = len * t;
    pts.push(bend([a[0] + Math.cos(yaw) * d, a[1] + Math.sin(yaw) * d, a[2] + rise * t - droop * t * t]));
  }
  limb(P, pts, 0.5, 0.25, m);
  for (let i = 1; i <= n; i++) {
    const t = i / n, w = wide * Math.sin(Math.min(1, t * 1.15) * Math.PI) + 0.4, c = pts[i];
    P.push(blob([c[0], c[1], c[2] - 0.3], w * 0.9, w * 0.9, 0.55, m, 0.6));
  }
}
function palm(seed: number, H: number) {
  return (f: number): PropModel => {
    const w = windOf(f, H + 6, 6), r = rng(seed), P: Prim[] = [], bark = mat(0, { ramp: PALMB, grain: 0.1, tex: (_x, _y, z) => (Math.floor(z / 2.2) % 2 ? -0.12 : 0.06) });
    const lean = (r() - 0.3) * 6;
    const trunk = path([0, 0, 0], [lean, -lean * 0.6, H], 6, w.bend, 2.4);
    limb(P, trunk, 2.3, 1.3, bark);
    const top = trunk[trunk.length - 1];
    for (let i = 0; i < 9; i++) {
      const yaw = (i / 9) * TAU + r() * 0.4, len = 18 + r() * 6;
      frond(P, top, yaw, len, 5 + r() * 3, 14 + r() * 5, leafMat(FROND, (r() - 0.5) * 0.12), (p) => w.flutter(p, seed + i * 0.17, 0.6 * Math.hypot(p[0] - top[0], p[1] - top[1]) / len), 2.6);
    }
    for (let i = 0; i < 4; i++) { const a = r() * TAU; P.push(blob([top[0] + Math.cos(a) * 1.6, top[1] + Math.sin(a) * 1.6, top[2] - 1.6], 1.3, 1.3, 1.4, mat(0, { ramp: PALMB, spec: 0.1 }), 0.3)); }
    return { prims: P, shadow: [{ u: lean / 2 + 2, v: -lean / 3 + 2, r: 13, a: 0.18 }, { u: 0.4, v: 0.4, r: 3.4, a: 0.4 }] };
  };
}
/** A weeping willow: a low broad crown with long curtains of leaves hanging to the ground; the curtains swing most. */
function willow(seed: number) {
  return (f: number): PropModel => {
    const w = windOf(f, 46, 5), r = rng(seed), P: Prim[] = [], bark = barkMat(BARK, -0.02);
    roots(P, 2.6, 6, seed, bark);
    limb(P, path([0, 0, 0], [1, -1, 22], 3, w.bend, 1.4), 2.8, 1.8, bark);
    const crown = w.bend([1, -1, 32]);
    P.push(clump(crown, 15, 9, leafMat(WILLOW, -0.1), seed, 1.6));
    for (let i = 0; i < 34; i++) {
      const a = r() * TAU, d = 9 + r() * 7, z0 = 30 + r() * 6, z1 = 6 + r() * 12;
      const top = w.bend([1 + Math.cos(a) * d, -1 + Math.sin(a) * d, z0]), L = lean(f), ph = r() * TAU;
      const swing = 3.4 * L + Math.sin(f * 2.2 + ph) * 0.9 * (0.4 + Math.abs(L));
      const bot: V3 = [top[0] + Math.cos(a) * 2.2 + swing / 2, top[1] + Math.sin(a) * 2.2 - swing / 2, z1];
      const mid: V3 = [(top[0] + bot[0]) / 2 + Math.cos(a), (top[1] + bot[1]) / 2 + Math.sin(a), (top[2] + bot[2]) / 2];
      const m = leafMat(WILLOW, (r() - 0.4) * 0.16);
      P.push(rod(top, mid, 1.7, m, 1.4, 0.8), rod(mid, bot, 1.4, m, 0.7, 0.6));
    }
    return { prims: P, shadow: [{ u: 2, v: 2, r: 15, a: 0.2 }, { u: 0.4, v: 0.4, r: 4, a: 0.4 }] };
  };
}
function fern(seed: number, n: number, len: number) {
  return (f: number): PropModel => {
    const w = windOf(f, 14, 2.6), r = rng(seed), P: Prim[] = [];
    for (let i = 0; i < n; i++) {
      const yaw = (i / n) * TAU + r() * 0.5, l = len * (0.75 + r() * 0.4);
      frond(P, [0, 0, 1], yaw, l, 9 + r() * 4, 9 + r() * 3, leafMat(FERN, (r() - 0.5) * 0.18), (p) => w.flutter(w.bend(p), seed + i * 0.3, 0.5), 1.5, 8);
    }
    return { prims: P, shadow: [{ u: 0.5, v: 0.5, r: len * 0.7, a: 0.3 }] };
  };
}
/** Gorse: a dark spiny mound starred with yellow flowers. */
function gorse(seed: number, R: number) {
  return (f: number): PropModel => {
    const w = windOf(f, 18, 2.4), r = rng(seed), P: Prim[] = [], eyes: { p: V3; col: number }[] = [];
    const spiny = (pal: number[], b: number): Mat => mat(0, { ramp: pal, grain: 0.18, tex: (x, y, z) => b + (hash3(Math.floor(x * 1.4), Math.floor(y * 1.4), Math.floor(z * 1.4)) < 0.3 ? -0.3 : 0.04) });
    P.push(clump(w.bend([0, 0, 5]), R * 0.8, 5.5, spiny(GORSE, -0.06), seed, 1.6));
    for (let i = 0; i < 10; i++) {
      const a = r() * TAU, d = R * (0.4 + r() * 0.5), z = 4 + r() * 6, c = w.flutter(w.bend([Math.cos(a) * d, Math.sin(a) * d, z]), r(), 0.4), s = 2.4 + r() * 2;
      P.push(clump(c, s, s * 0.8, spiny(GORSE, 0.02), seed * 5 + i, 1.1));
      for (let k = 0; k < 3; k++) if (r() < 0.75) eyes.push({ p: [c[0] + s * (0.4 + r() * 0.5), c[1] + s * (0.4 + r() * 0.5), c[2] + s * (r() - 0.2)], col: r() < 0.5 ? 0xd8b030 : 0xf0d058 });
    }
    return { prims: P, eyes, shadow: [{ u: 0.5, v: 0.5, r: R + 1, a: 0.35 }] };
  };
}
/** Thorn scrub: a low dome of tangled, thorny twigs with small tufts of dry leaves among them. */
function scrub(seed: number, R: number) {
  return (f: number): PropModel => {
    const w = windOf(f, 16, 2.4), r = rng(seed), P: Prim[] = [], twig = barkMat(REDB, 0.06);
    P.push(clump(w.bend([0, 0, 3.4]), R * 0.62, 3.6, leafMat(THORN, -0.16), seed, 1.4));
    for (let i = 0; i < 16; i++) {
      const a = r() * TAU, d = R * (0.55 + r() * 0.55), z = 4 + r() * 7;
      const mid = w.bend([Math.cos(a + 0.4) * d * 0.5, Math.sin(a + 0.4) * d * 0.5, z * 0.6]), tip = w.bend([Math.cos(a) * d, Math.sin(a) * d, z]);
      limb(P, [[Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0.5], mid, tip], 0.55, 0.2, twig);
      if (r() < 0.55) { const s = 1.3 + r() * 1.2; P.push(clump(w.flutter(tip, r(), 0.4), s, s * 0.8, leafMat(THORN, (r() - 0.4) * 0.15), seed + i, 0.6)); }
    }
    return { prims: P, shadow: [{ u: 0.5, v: 0.5, r: R, a: 0.3 }] };
  };
}

/** Act 2-5 trees and bushes: desert palms and dead trees, moors gorse and dead birches, badlands scrub and snags, sinkhole willows and ferns. */
export const LANDS3D: TreeSheet[] = [
  T("tr3_palm_a", 76, 100, 38, 92, palm(201, 50)),
  T("tr3_palm_b", 76, 104, 38, 96, palm(207, 56)),
  T("tr3_palm_c", 76, 92, 38, 84, palm(211, 42)),
  T("tr3_willow_a", 84, 76, 42, 68, willow(301)),
  T("tr3_willow_b", 84, 76, 42, 68, willow(307)),
  T("tr3_fern_a", 40, 30, 20, 24, fern(401, 7, 11)),
  T("tr3_fern_b", 44, 30, 22, 24, fern(409, 9, 12)),
  T("tr3_gorse_a", 40, 30, 20, 25, gorse(501, 8)),
  T("tr3_gorse_b", 44, 30, 22, 25, gorse(507, 9)),
  T("tr3_scrub_a", 40, 30, 20, 25, scrub(601, 8)),
  T("tr3_scrub_b", 40, 30, 20, 25, scrub(611, 9)),
  T("tr3_deadbirch", 60, 84, 30, 76, deadTree(701, 24, PALE)),
  T("tr3_snag", 64, 72, 32, 64, deadTree(801, 14, REDB)),
  T("tr3_deadtree", 64, 72, 32, 64, deadTree(901, 15, PALE)),
];

/** For the other lands' passes. */
export const PALS = { LEAF, OLIVE, SICK, AUTUMN, NEEDLE, BARK, BIRCHB };
export { oak, pine, bush, grass, deadTree, clump, windOf, limb, path, leafMat, barkMat };
