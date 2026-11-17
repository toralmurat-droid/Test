/**
 * The necromancers' siege works (client/src/siegeArt.ts) rebuilt as 3D models and baked: a half-built catapult, a
 * battering ram under a half-planked roof, a three-storey siege tower with a crane on top, the lumber pile and a
 * sawhorse. Frame sizes and feet (bottom centre) are the painted ones; the hanging parts swing over the 6 frames.
 */
import { mat, hash3, type Mat, type Prim } from "./mob3d";
import { blob, box, cloth, grain, rod, scaleProp, type PMat, type PropModel, type V3 } from "./prop3d";
import { BONER, IRONR, OLDR, ROPER, STONER, WOODR } from "../../../client/src/isoProps";

const N = 6, TAU = Math.PI * 2;
const FRESHR = [0x2e2014, 0x4a3420, 0x6a4c2e, 0x8c6a42, 0xb08a5a, 0xc8a676, 0xdcc096];
const DARKR = [0x120c08, 0x1e140c, 0x2c1e12, 0x3a2a1c, 0x4e3a28, 0x624a34];
const BARKR = [0x16100a, 0x2c2218, 0x463626, 0x5e4a36, 0x76604a];
const GHOSTR = [0x2a6a40, 0x4f9a66, 0x6fd38a, 0xa8f0bc];
const M = (pal: number[], o: Parameters<typeof mat>[1] = {}): Mat => mat(0, { ramp: pal, ...o });
const wd = (axis: 0 | 1 | 2, pal = WOODR, b = 0) => M(pal, { grain: 0.05, tex: (x, y, z) => grain(axis)(x, y, z) + b });
const iron = (b = 0) => M(IRONR, { spec: 0.35, shine: 14, grain: 0.06, tex: () => b - 0.04 });
const ropeM = M(ROPER, { tex: (x, y, z) => ((x + y + z) * 1.3 % 1 < 0.3 ? -0.15 : 0) });
const sway = (f: number) => Math.sin((f / N) * TAU);

/** Wooden wheel standing upright, axle along v (or along u with `alongU`): rim, six spokes, iron hub. */
function wheel(P: Prim[], c: V3, R: number, pal: number[], alongU = false, turn = 0.3) {
  const m = M(pal, { grain: 0.06, tex: (x, y, z) => (hash3(Math.floor(Math.atan2(z - c[2], (alongU ? y - c[1] : x - c[0])) * 4), 1, 2) - 0.5) * 0.15 });
  P.push({ m, k: 0.2, lo: [c[0] - R - 2, c[1] - R - 2, c[2] - R - 2], hi: [c[0] + R + 2, c[1] + R + 2, c[2] + R + 2], d: (x, y, z) => {
    const a = alongU ? y - c[1] : x - c[0], ax = alongU ? x - c[0] : y - c[1];
    return Math.max(Math.abs(Math.hypot(a, z - c[2]) - R + 0.9) - 1.1, Math.abs(ax) - 1.1);
  } });
  for (let k = 0; k < 6; k++) {
    const a = turn + (k / 6) * TAU, e: V3 = alongU ? [0, Math.cos(a), Math.sin(a)] : [Math.cos(a), 0, Math.sin(a)];
    P.push(rod(c, [c[0] + e[0] * (R - 1), c[1] + e[1] * (R - 1), c[2] + e[2] * (R - 1)], 0.55, m, 0.55, 0.2));
  }
  P.push(alongU ? rod([c[0] - 1.6, c[1], c[2]], [c[0] + 1.6, c[1], c[2]], 1.6, iron(0.05), 1.6, 0.3) : rod([c[0], c[1] - 1.6, c[2]], [c[0], c[1] + 1.6, c[2]], 1.6, iron(0.05), 1.6, 0.3));
}
/** A few turns of rope round a joint. */
const lash = (P: Prim[], c: V3, r = 1.6, axis: 0 | 1 | 2 = 2) => { const a: V3 = [...c], b: V3 = [...c]; a[axis] -= 1.2; b[axis] += 1.2; P.push(rod(a, b, r, ropeM, r, 0.3)); };
/** A skull facing the viewer (+u +v), the necromancers' mark. */
function skull(P: Prim[], eyes: { p: V3; col: number }[], c: V3, glow = false) {
  const bone = M(BONER, { grain: 0.07 }), dark = M([0x0c0806, 0x120c0a, 0x1c1410]);
  P.push(blob(c, 2.6, 2.6, 2.8, bone, 0.5));
  P.push(blob([c[0] + 0.9, c[1] + 0.9, c[2] - 2.2], 1.7, 1.7, 1.1, bone, 0.6));
  const f = (a: number, r: number, dz: number): V3 => [c[0] + Math.cos(Math.PI / 4 + a) * r, c[1] + Math.sin(Math.PI / 4 + a) * r, c[2] + dz];
  for (const a of [-0.45, 0.45]) P.push({ ...blob(f(a, 2.7, 0), 0.65, 0.65, 0.7, dark, 0.2), cut: true });
  if (glow) for (const a of [-0.45, 0.45]) eyes.push({ p: f(a, 2.2, 0), col: 0x8af0a8 });
  for (let i = -2; i <= 2; i++) eyes.push({ p: f(i * 0.2, 2.4, -2.4), col: i % 2 ? BONER[2] : BONER[5] });
}

// ---- half-built catapult (152x118) ------------------------------------------------------------------------------
export function catapult(f: number): PropModel {
  const s = sway(f), P: Prim[] = [], eyes: { p: V3; col: number }[] = [];
  const fresh = (a: 0 | 1 | 2, b = 0) => wd(a, FRESHR, b), dark = (a: 0 | 1 | 2) => wd(a, DARKR);
  // base frame: side beams along u, cross beams
  for (const v of [-12, 12]) P.push(box(-34, 34, v - 1.6, v + 1.6, 6, 9.5, v < 0 ? dark(0) : wd(0), 0.4));
  for (const u of [-30, 0, 30]) P.push(box(u - 1.6, u + 1.6, -13, 13, 6.5, 9.5, wd(1), 0.4));
  wheel(P, [-24, -15, 9], 9, DARKR); wheel(P, [24, -15, 9], 9, DARKR); wheel(P, [24, 15, 9], 9, WOODR);
  P.push(box(-27, -21, 12, 16, 0, 6.5, wd(2, OLDR), 0.5)); // chock under the wheelless corner
  // the fourth wheel lying in the grass
  { const c: V3 = [-22, 32, 1.2], m = wd(0, FRESHR);
    P.push({ m, k: 0.2, lo: [c[0] - 11, c[1] - 11, -0.5], hi: [c[0] + 11, c[1] + 11, 3], d: (x, y, z) => Math.max(Math.abs(Math.hypot(x - c[0], y - c[1]) - 8.4) - 1.1, Math.abs(z - c[2]) - 1.1) });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; P.push(rod(c, [c[0] + Math.cos(a) * 8, c[1] + Math.sin(a) * 8, c[2]], 0.55, m, 0.55, 0.2)); }
    P.push(blob(c, 1.8, 1.8, 1.4, iron(0.05), 0.3)); }
  // A-frame uprights and crossbars
  for (const v of [-11, 11]) {
    P.push(rod([-9, v, 8], [-1, v, 46], 1.6, v < 0 ? dark(2) : wd(2), 1.5, 0.3));
    P.push(rod([9, v, 8], [1, v, 46], 1.6, v < 0 ? dark(2) : wd(2), 1.5, 0.3));
    P.push(rod([-5, v, 27], [5, v, 27], 1.1, wd(0), 1.1, 0.3)); lash(P, [-5, v, 27], 1.4, 0); lash(P, [5, v, 27], 1.4, 0);
  }
  P.push(rod([0, -14, 46.5], [0, 14, 46.5], 1.8, wd(1, WOODR, 0.05), 1.8, 0.4));
  for (const v of [-11, 11]) P.push(box(-1.8, 1.8, v - 1.8, v + 1.8, 44.6, 48.6, iron(-0.05), 0.3));
  // the throwing arm, fresh timber, propped on the crossbar, its cup block not fitted yet
  P.push(rod([-30, 2, 5], [30, 3, 50], 1.9, fresh(0), 1.6, 0.3)); lash(P, [3.5, 2.5, 30], 2.2, 0);
  P.push(box(28.5, 34, 0.2, 6, 48.5, 53, fresh(1, 0.05), 0.5));
  P.push(rod([32, 5.5, 49], [35, 7, 38], 0.35, ropeM)); P.push(rod([35, 7, 38], [33.5, 7.5, 33], 0.35, ropeM));
  // pulley block swinging from the crossbar
  const bu = s * 2.5, bz = 31;
  for (const dv of [-1, 1]) P.push(rod([0, 4 + dv, 45], [bu, 4 + dv * 0.6, bz + 4], 0.3, ropeM, 0.3, 0.1));
  P.push(box(bu - 1.6, bu + 1.6, 2.8, 5.2, bz, bz + 4.5, iron(0), 0.4));
  P.push(rod([bu, 4, bz], [bu + 0.6, 4, bz - 2.5], 0.45, iron(0.1), 0.35, 0.2)); P.push(rod([bu + 0.6, 4, bz - 2.5], [bu + 1.6, 4, bz - 1.6], 0.4, iron(0.1), 0.3, 0.2));
  // ladder against the frame
  for (const u of [5, 11]) P.push(rod([u + 10, 22, 0], [u, 13, 42], 0.65, wd(2, OLDR), 0.65, 0.2));
  for (let k = 0.08; k < 0.95; k += 0.12) P.push(rod([15 - k * 10, 22 - k * 9, k * 42], [21 - k * 10, 22 - k * 9, k * 42], 0.45, wd(0, OLDR, 0.08), 0.45, 0.2));
  // ammunition, and a skull lashed to the front beam
  for (const [u, v, r] of [[38, 16, 3.6], [43, 10, 3.2], [35, 22, 3], [45, 16, 2.8], [40, 14, 2.6]] as const) P.push(blob([u, v, r * 0.7 + (u === 40 ? 3.4 : 0)], r, r * 0.9, r * 0.8, M(STONER, { grain: 0.22, tex: () => 0.1 }), 0.3));
  skull(P, eyes, [34, 12.5, 14]); lash(P, [34, 12, 9], 1.8, 2);
  return { prims: P, eyes, shadow: [{ u: 0, v: 0, r: 30, a: 0.25 }], cast: 14 };
}

// ---- battering ram (144x104) ------------------------------------------------------------------------------------
export function ram(f: number): PropModel {
  const s = sway(f), P: Prim[] = [], eyes: { p: V3; col: number }[] = [];
  for (const v of [-11, 11]) {
    const m0 = v < 0 ? wd(0, DARKR) : wd(0);
    P.push(box(-40, 40, v - 1.8, v + 1.8, 6, 10, m0, 0.4));
    P.push(box(-40, 40, v - 1.6, v + 1.6, 38, 41.5, m0, 0.4));
    for (const u of [-36, 0, 36]) P.push(box(u - 1.7, u + 1.7, v - 1.7, v + 1.7, 9, 39, v < 0 ? wd(2, DARKR) : wd(2), 0.4));
  }
  P.push(box(-40, 40, -1.4, 1.4, 50, 52.5, wd(0, DARKR), 0.4)); // ridge
  for (const u of [-36, 0, 36]) P.push(box(u - 1.2, u + 1.2, -1.2, 1.2, 41, 50.5, wd(2, DARKR), 0.3));
  P.push(rod([-36, 11, 22], [0, 11, 36], 0.9, wd(0), 0.9, 0.3)); lash(P, [-18, 11, 29], 1.3, 0);
  // rafters both sides, planks over the back half only, one loose plank
  for (let u = -38; u <= 38; u += 9.5) for (const v of [-11, 11]) P.push(rod([u, v, 41.5], [u, 0, 52], 0.7, wd(2, WOODR, -0.03), 0.7, 0.2));
  const planks = M(OLDR, { grain: 0.06, tex: (x, y, z) => (Math.floor((z - 41) / 1.8) % 2 ? -0.06 : 0.05) + grain(0)(x, y, z) });
  for (const v of [-11, 11]) P.push(cloth([-40, v, 41.8], [40, 0, 0], [0, -v, 10.6], planks, () => 0, (_s, t) => !(v > 0 && t < 0.25), 0.55));
  P.push(box(4, 18, 4, 6.4, 46, 47.2, wd(0, FRESHR, 0.05), 0.2));
  // the ram log on chains, an iron head with curled horns and an ember eye
  const du = s * 2.2, lz = 22, link = M(IRONR, { spec: 0.4, tex: (_x, _y, z) => (Math.floor(z * 0.8) % 2 ? -0.1 : 0.05) });
  for (const cu of [-20, 20]) P.push(rod([cu, 0, 50], [cu + du, 0, lz + 3.5], 0.5, link, 0.5, 0.2));
  P.push(rod([-34 + du, 0, lz], [36 + du, 0, lz + 0.6], 4.2, M(BARKR, { grain: 0.12, tex: (x, y, z) => (hash3(Math.floor(x / 3), Math.floor(Math.atan2(z - lz, y) * 3), 4) - 0.5) * 0.25 }), 4.2, 0.5));
  P.push(rod([-34 + du, 0, lz], [-46 + du, 0, lz - 0.2], 4.8, iron(0.05), 2.4, 0.6));
  P.push(rod([-31 + du, 0, lz], [-33 + du, 0, lz], 4.8, iron(-0.1), 4.8, 0.2));
  for (const sv of [-1, 1]) {
    const pts: V3[] = []; for (let a = 0; a <= 6; a++) { const ang = a * 0.75; pts.push([-38 + du - Math.sin(ang) * (3.5 - a * 0.3), sv * (4.4 + Math.cos(ang) * 0.6), lz + 2 + Math.cos(ang) * (3.6 - a * 0.35) - 1]); }
    for (let i = 1; i < pts.length; i++) P.push(rod(pts[i - 1], pts[i], 1.1 - i * 0.12, iron(0.08), 1.0 - i * 0.12, 0.3));
  }
  eyes.push({ p: [-42 + du, 2.6, lz + 1.4], col: 0xff4a3a });
  for (const [u, v] of [[-30, -14], [30, -14], [-30, 14], [30, 14]] as const) wheel(P, [u, v + (v > 0 ? 1.5 : -1.5), 9], 9, v < 0 ? DARKR : WOODR);
  skull(P, eyes, [0, 1.5, 55.5], true);
  return { prims: P, eyes, shadow: [{ u: 0, v: 0, r: 28, a: 0.25 }], cast: 12 };
}

// ---- siege tower (116x192) --------------------------------------------------------------------------------------
export function tower(f: number): PropModel {
  const s = sway(f), P: Prim[] = [], eyes: { p: V3; col: number }[] = [], E = 14;
  const post = (u: number, v: number, z1: number) => P.push(box(u - 1.8, u + 1.8, v - 1.8, v + 1.8, 8, z1, u + v < 0 ? wd(2, DARKR) : wd(2), 0.4));
  post(-E, -E, 150); post(E, -E, 150); post(-E, E, 150); post(E, E, 96); // the near post isn't finished
  for (const z of [10, 54, 98]) for (const [a, b] of [[[-E, -E], [E, -E]], [[-E, -E], [-E, E]], [[-E, E], [E, E]], [[E, -E], [E, E]]] as [[number, number], [number, number]][]) {
    const along: 0 | 1 = a[1] === b[1] ? 0 : 1;
    P.push(box(Math.min(a[0], b[0]) - 1.6, Math.max(a[0], b[0]) + 1.6, Math.min(a[1], b[1]) - 1.6, Math.max(a[1], b[1]) + 1.6, z - 1.8, z + 1.8, wd(along, a[0] + a[1] + b[0] + b[1] < 0 ? DARKR : WOODR), 0.4));
  }
  // X braces on the near faces of the middle storey
  for (const [a, b] of [[[E, -E, 56], [E, E, 96]], [[E, E, 56], [E, -E, 96]], [[-E, E, 56], [E, E, 96]], [[E, E, 56], [-E, E, 96]]] as [V3, V3][]) P.push(rod([a[0] + (a[0] === b[0] ? 0.8 : 0), a[1] + (a[1] === b[1] ? 0.8 : 0), a[2]], [b[0] + (a[0] === b[0] ? 0.8 : 0), b[1] + (a[1] === b[1] ? 0.8 : 0), b[2]], 1, wd(2), 1, 0.3));
  // the lowest storey planked on the near faces (two planks missing), a sigil daubed on the left face
  const sigil = M(GHOSTR, { emit: 0.5 });
  const plank: PMat = { ...M(OLDR, { grain: 0.07, tex: (x, y, z) => (Math.abs(((z - 12) % 4)) < 0.5 ? -0.2 : 0) + grain(0)(x, y, z) * 0.6 }) };
  plank.sub = (x, y, z) => {
    if (y < E) return undefined;
    const du = x, dz = z - 33, r = Math.hypot(du, dz);
    if (Math.abs(r - 9) < 0.7 && Math.floor((Math.atan2(dz, du) + Math.PI) * 6) % 7 !== 3) return sigil;
    for (let a = 0; a < 5; a++) { // five-pointed star
      const a0 = Math.PI / 2 + (a * 4 * Math.PI) / 5, a1 = Math.PI / 2 + ((a + 1) * 4 * Math.PI) / 5;
      const p0 = [Math.cos(a0) * 7.5, Math.sin(a0) * 7.5], p1 = [Math.cos(a1) * 7.5, Math.sin(a1) * 7.5];
      const ex = p1[0] - p0[0], ez = p1[1] - p0[1], h = Math.max(0, Math.min(1, ((du - p0[0]) * ex + (dz - p0[1]) * ez) / (ex * ex + ez * ez)));
      if (Math.hypot(du - p0[0] - ex * h, dz - p0[1] - ez * h) < 0.6) return sigil;
    }
    return undefined;
  };
  const gaps = (_s: number, t: number) => { const z = 12 + t * 40; return !((z > 26 && z < 29.5) || (z > 40 && z < 43.5)); };
  P.push(cloth([-E, E + 1.4, 12], [2 * E, 0, 0], [0, 0, 40], plank, () => 0, gaps, 0.6));
  P.push(cloth([E + 1.4, -E, 12], [0, 2 * E, 0], [0, 0, 40], plank, () => 0, (s2, t) => gaps(s2, t) && !(s2 > 0.7 && t > 0.75), 0.6));
  for (const [u, v] of [[-10, -E - 2], [10, -E - 2], [-10, E + 2.5], [10, E + 2.5]] as const) wheel(P, [u, v, 8], 8, v < 0 ? DARKR : WOODR);
  // top storey: the crane boom and a beam swinging on its rope
  P.push(rod([-E, -E, 150], [-E, E, 150], 1.4, wd(1, FRESHR), 1.4, 0.3));
  P.push(rod([-E, -E, 140], [-E - 2, -E - 22, 166], 1.4, wd(2, FRESHR), 1.2, 0.3)); lash(P, [-E, -E, 146], 1.8, 2);
  const tip: V3 = [-E - 2, -E - 22, 166], hz = 128, hv = -E - 22 + s * 3;
  P.push(rod(tip, [-E - 2, hv, hz + 2], 0.3, ropeM, 0.3, 0.1)); P.push(rod(tip, [-E, -E + 1, 148], 0.3, ropeM, 0.3, 0.1));
  P.push(box(-E - 16, -E + 12, hv - 1.6, hv + 1.6, hz - 1.6 + s, hz + 1.6 - s, wd(0, FRESHR, 0.05), 0.4));
  for (const du of [-8, 6]) P.push(rod([-E - 2, hv, hz + 2], [-E - 2 + du, hv, hz + 1.4], 0.3, ropeM, 0.3, 0.1));
  skull(P, eyes, [E + 2.4, E + 2.4, 86]);
  return { prims: P, eyes, shadow: [{ u: 0, v: 0, r: 22, a: 0.25 }], cast: 14 };
}

// ---- lumber pile (112x62) and sawhorse (60x40) -----------------------------------------------------------------
export function lumber(): PropModel {
  const P: Prim[] = [], bark = M(BARKR, { grain: 0.12, tex: (x, y, z) => (hash3(Math.floor(x / 4), Math.floor(y * 0.6 + z * 0.6), 2) - 0.5) * 0.2 });
  const ends = M(FRESHR, { tex: (x, y, z) => 0.1 + (Math.hypot(y % 7, z % 7) % 2 < 0.4 ? -0.15 : 0) * 0 });
  const log = (v: number, z: number, r: number) => { P.push(rod([-26, v, z], [10, v, z], r, bark, r, 0.2)); P.push(box(9.5, 11, v - r + 0.4, v + r - 0.4, z - r + 0.4, z + r - 0.4, ends, r * 0.8)); };
  for (const v of [-9, -2, 5, 12]) log(v, 3.4, 3.4);
  for (const v of [-5.5, 1.5, 8.5]) log(v, 9.6, 3.4);
  for (const v of [-2, 5]) log(v, 15.8, 3.3);
  // stacked planks
  for (let k = 0; k < 5; k++) P.push(box(16, 40, -12 + (k % 2) * 0.6, -2 + (k % 2) * 0.6, k * 1.6, k * 1.6 + 1.4, wd(0, FRESHR, k * 0.02), 0.2));
  // a stump with an axe in it
  P.push(rod([30, 14, 0], [30, 14, 6], 4.4, M(BARKR, { grain: 0.12 }), 4.0, 0.4));
  P.push(blob([30, 14, 6], 4.0, 4.0, 0.6, M(FRESHR, { tex: (x, y) => (Math.hypot(x - 30, y - 14) % 1.4 < 0.35 ? -0.12 : 0.05) }), 0.2));
  P.push(rod([30, 14, 6.5], [33, 18, 17], 0.6, wd(2), 0.6, 0.2));
  P.push(box(28.6, 31.4, 13.6, 14.4, 5.4, 9.2, iron(0.15), 0.2));
  return { prims: P, shadow: [{ u: 0, v: 0, r: 22, a: 0.25 }], cast: 10 };
}
export function sawhorse(): PropModel {
  const P: Prim[] = [];
  for (const u of [-9, 9]) { P.push(rod([u, -5, 0], [u, 2, 12], 0.8, wd(2), 0.8, 0.2)); P.push(rod([u, 5, 0], [u, -2, 12], 0.8, wd(2), 0.8, 0.2)); }
  P.push(box(-12, 12, -1.2, 1.2, 11, 13.4, wd(0, WOODR, 0.04), 0.3));
  P.push(rod([-16, 0, 16.4], [12, 0, 16.4], 3, M(BARKR, { grain: 0.12 }), 3, 0.3)); // half-sawn log
  P.push(box(11.6, 12.6, -2.6, 2.6, 13.6, 19.2, M(FRESHR, { tex: () => 0.1 }), 1));
  P.push({ ...box(2, 2.6, -4, 4, 16.4, 20, M(FRESHR, { tex: () => -0.1 }), 0.1), cut: true }); // the saw cut
  return { prims: P, shadow: [{ u: 0, v: 0, r: 13, a: 0.25 }], cast: 8 };
}

/** Sheets for bake-props.ts: key, frame size, frames, origin (bottom centre of the painted sprite). */
export const SIEGE_WORKS: { key: string; w: number; h: number; frames: number; ox: number; oy: number; model: (f: number) => PropModel }[] = [
  { key: "siege_catapult", w: 152, h: 118, frames: N, ox: 80, oy: 76, model: (f) => scaleProp(catapult(f), 1.25) },
  { key: "siege_ram", w: 144, h: 104, frames: N, ox: 72, oy: 71, model: (f) => scaleProp(ram(f), 1.15) },
  { key: "siege_tower", w: 116, h: 192, frames: N, ox: 58, oy: 172, model: tower },
  { key: "siege_lumber", w: 112, h: 62, frames: 1, ox: 54, oy: 46, model: lumber },
  { key: "siege_sawhorse", w: 60, h: 40, frames: 1, ox: 30, oy: 32, model: sawhorse },
];
