/**
 * The Hollow Crown's element props (client/src/elementArt.ts) and the crown-stones / ward-stones of the Hollow
 * Throne's ring (client/src/throneArt.ts standingStone) rebuilt as 3D models and baked. Glow, drips, sparks, embers
 * and the lightning crackle stay painted over the 3D (PropModel.overlay), frame by frame like the painted props.
 */
import { mat, hash3, noise3, cone, rbox, type Mat, type Prim } from "./mob3d";
import { blob, rod, type PMat, type PropModel, type V3 } from "./prop3d";
import { LAND_PAL } from "../../../client/src/elementArt";

const N = 6, TAU = Math.PI * 2;
const M = (pal: number[], o: Parameters<typeof mat>[1] = {}): Mat => mat(0, { ramp: pal, ...o });
const STONE = [0x0e0d12, 0x141318, 0x24222a, 0x36343b, 0x4a484e, 0x5f5c60, 0x787574, 0x948f88];
const GRANITE = [0x0e0d12, 0x16141a, 0x26242b, 0x38363d, 0x4c4a50, 0x625f63, 0x7c7a7a, 0x9a9690];
const MOSS = [0x121a0e, 0x1a2414, 0x2a3a1c, 0x3e5226, 0x56682e];
const ASH = [0x1a1714, 0x2a2622, 0x463f38, 0x645a50];
const IRON = [0x101114, 0x18191d, 0x2c2f35, 0x4a4f57, 0x737a84, 0x9aa2ac];
const GLOAM = [0x0e2a10, 0x1f5216, 0x3e8a22, 0x6fdc3a, 0xc8ff8a, 0xf4ffe0];
const CAP_P = [0x1a0818, 0x2a1028, 0x4a1c46, 0x6e2a62, 0x9a4888, 0xc87ab4, 0xe8a8d8];
const STALK = [0x3a3428, 0x5a5040, 0x7e745e, 0xa89c80, 0xd0c4a4];
const rockTex = (s: number, amt = 0.5) => (x: number, y: number, z: number) => (noise3(x * 0.35, y * 0.35, z * 0.35 + s) - 0.5) * amt + (noise3(x * 1.1, y * 1.1, z * 1.1 + s) - 0.5) * amt * 0.45;
type Px = (x: number, y: number, c: number) => void;

// ---- venom caps (34x30): bruised toadstools in a green ooze puddle, venom dripping, bubbles popping ---------------
export function venomCaps(f: number): PropModel {
  const P: Prim[] = [], G = LAND_PAL.poison, t = (f / N) * TAU;
  const ooze = M(G, { spec: 0.5, shine: 10, grain: 0.15, tex: (x, y) => (noise3(x * 0.3, y * 0.3, f * 0.3) - 0.5) * 0.5 - 0.3 });
  P.push(blob([0, 0, 0], 11, 11, 1.4, ooze, 0.6, 0));
  const stalk = M(STALK, { grain: 0.06 });
  const caps: [number, number, number, number][] = [[-4, 3, 6, 11], [1, -3, 7.5, 16], [6, 0, 4.2, 8], [-1, 6, 3.4, 6]];
  const rims: V3[] = [];
  caps.forEach(([u, v, r, h], i) => {
    const sw = Math.sin(t + i) * 0.5, top: V3 = [u + sw, v - sw, h];
    P.push(rod([u, v, 0], top, Math.max(0.9, r * 0.2), stalk, Math.max(0.8, r * 0.17), 0.4));
    const capM: PMat = { ...M(CAP_P, { grain: 0.1, spec: 0.25, shine: 10, tex: (x, y, z) => (noise3(x * 0.5, y * 0.5, z * 0.5 + i) - 0.5) * 0.3 - 0.22 }) };
    const wart = M(CAP_P.slice(3), { grain: 0.05 });
    capM.sub = (x, y, z) => hash3(Math.round(x * 1.3), Math.round(y * 1.3), Math.round(z * 1.3) + i * 9) < 0.07 && z > h + 0.8 ? wart : undefined;
    P.push(blob([top[0], top[1], h - 0.6], r, r, r * 0.62, capM, 0.4, h - 0.8));
    rims.push([top[0] + r * 0.55, top[1] + r * 0.55, h - 0.6]);
  });
  return { prims: P, cast: 14,
    overlay: (px: Px, at) => {
      rims.forEach((q, i) => { const [x, y] = at(q), dl = (f + i) % 3, dx = Math.round(x) + ((f + i * 2) % 4) - 2; for (let k = 0; k <= dl; k++) px(dx, Math.round(y) + 1 + k, G[4 - Math.min(2, k)]); });
      for (let i = 0; i < 3; i++) {
        const ph = ((f + i * 2) % 6) / 6, [x, y] = at([-7 + i * 6, 6 - i * 4, 1]), yy = Math.round(y - ph * 9);
        if (ph < 0.85) { px(x, yy, G[4]); px(x + 1, yy, G[3]); } else { px(x - 1, yy, G[4]); px(x + 1, yy, G[4]); }
      }
    } };
}

// ---- ice spikes (34x40): jagged ice pushing up through frosted stones, glints running up the facets ----------------
export function iceSpikes(f: number): PropModel {
  const P: Prim[] = [], I = LAND_PAL.cold;
  const frost = M(STONE, { grain: 0.15, tex: rockTex(3, 0.4) }), rime = M(I.slice(2), { grain: 0.2 });
  const stone: PMat = { ...frost, sub: (x, y, z) => (noise3(x * 0.6, y * 0.6, z * 0.6) > 0.6 || z > 2.2 ? rime : undefined) };
  for (const [u, v, r] of [[-6, 4, 4], [3, 7, 4.5], [7, -3, 3.5], [-3, -5, 3], [0, 1, 5]] as const) P.push(blob([u, v, 0], r, r * 0.9, r * 0.6, stone, 0.8, 0));
  const ice = M(I, { spec: 0.9, shine: 22, grain: 0.06, tex: (x, y, z) => (Math.abs(((x - y + z * 0.6) % 3 + 3) % 3 - 1.5) < 0.3 ? 0.18 : 0) });
  const S: [V3, V3, number][] = [[[-6, 3, 0], [-9, 5, 17], 3.6], [[3, -2, 0], [6, -5, 21], 4], [[-1, 1, 0], [-1, -1, 32], 4.8], [[6, 4, 0], [9, 6, 10], 2.4], [[-3, -4, 0], [-4, -7, 12], 2.4]];
  for (const [b, tp, r] of S) P.push(cone(b, tp, r, ice, { k: 0.4 }));
  return { prims: P, cast: 30, shadow: [{ u: 0, v: 0, r: 11, a: 0.3 }],
    overlay: (px: Px, at) => {
      [[-7, 4, 2], [-1, 0, 5], [4, -3, 3]].forEach(([u, v, sp], i) => {
        const k = (f + i * 2) % 6; if (k >= 4) return;
        const [x, y] = at([u, v, 3 + k * sp]); px(x, y, 0xffffff); px(x - 1, y, I[5]); px(x + 1, y, I[5]); px(x, y - 1, I[5]);
      });
    } };
}

// ---- ember vent (34x34): a cracked black boulder split over a glowing seam, embers and smoke rising --------------
export function emberVent(f: number): PropModel {
  const P: Prim[] = [], F = LAND_PAL.fire, glow = 0.5 + 0.5 * Math.sin((f / N) * TAU);
  const rock: PMat = { ...M(STONE.slice(0, 6), { grain: 0.2, tex: rockTex(5, 0.6) }) };
  const lip = M(F.slice(1), { emit: 0.4 + glow * 0.3 });
  const seam = (x: number, y: number) => x - y + Math.sin((x + y) * 0.5) * 1.2;            // the split runs front to back
  rock.sub = (x, y, z) => (Math.abs(seam(x, y)) < 3.4 && hash3(Math.round(x * 2), Math.round(y * 2), Math.round(z * 2)) < 0.3 + glow * 0.2 ? lip : undefined);
  P.push({ ...blob([0, 0, 2], 11, 10, 9, rock, 0.6, 0) });
  P.push({ m: rock, k: 0.6, cut: true, lo: [-14, -14, 0], hi: [14, 14, 14], d: (x, y, z) => Math.abs(seam(x, y)) - 2 - Math.max(0, z - 4) * 0.3 });
  P.push(blob([0, 0, 0.5], 8, 8, 3.5, M(F, { emit: 0.7 + glow * 0.25, grain: 0.3 }), 0.4, 0));
  return { prims: P, cast: 12,
    halos: [{ p: [0, 0, 8], r: 12, col: F[3], a: 0.25 + glow * 0.15 }],
    overlay: (px: Px, at) => {
      const [cx, cy] = at([0, 0, 10]);
      for (let i = 0; i < 9; i++) {
        const ph = ((f / 6 + i / 9) % 1), x = Math.round(cx + Math.sin(ph * 5 + i) * (2 + ph * 5)), y = Math.round(cy - 4 - ph * 14);
        if (ph < 0.6 && (i + f) % 2 === 0) px(x, y, ph < 0.3 ? 0x4a4440 : 0x3a3532);
      }
      for (let i = 0; i < 5; i++) {
        const ph = ((f + i * 1.3) % 6) / 6, x = Math.round(cx + Math.sin(i * 2.1 + ph * 3) * (2 + ph * 4)), y = Math.round(cy + 2 - ph * 16);
        px(x, y, F[ph < 0.4 ? 5 : ph < 0.7 ? 4 : 3]);
      }
    } };
}

// ---- storm stone (30x50): a standing stone split by lightning, a blue arc crackling across the split -------------
export function stormStone(f: number): PropModel {
  const P: Prim[] = [], S = LAND_PAL.shock, H = 42;
  const glass = M(S.slice(0, 4), { spec: 0.6, shine: 16 });
  const stone: PMat = { ...M(STONE, { grain: 0.15, tex: rockTex(7, 0.6) }), sub: (x, y, z) => (noise3(x * 0.6, y * 0.6, z * 0.35) > 0.8 ? glass : undefined) };
  const hw = (z: number) => { const k = z / H; return 6.4 - k * 1.8 - (k > 0.86 ? (k - 0.86) * 22 : 0) + (noise3(z * 0.3, 0, 7) - 0.5) * 1.2; };
  P.push({ m: stone, k: 0.4, lo: [-9, -9, 0], hi: [9, 9, H + 1], d: (x, y, z) => Math.max((Math.max(Math.abs(x) - hw(z), Math.abs(y) - hw(z) * 0.62)) * 0.8, -z, z - H) });
  const split = (x: number, y: number, z: number) => Math.abs((x - y) * 0.7 - Math.sin(z * 0.45) * 1.2);
  P.push({ m: M(S, { emit: 0.6 }), k: 0.2, cut: true, lo: [-9, -9, 3], hi: [9, 9, H + 1], d: (x, y, z) => split(x, y, z) - (z < H * 0.75 ? 0.9 : 0.4) });
  P.push(rod([0, 0, 2], [0, 0, H * 0.8], 0.6, M(S, { emit: 0.85 }), 0.4, 0.2));
  return { prims: P, cast: 20, shadow: [{ u: 0, v: 0, r: 8, a: 0.3 }],
    overlay: (px: Px, at) => {
      if (f % 2 === 0 || f === 3) {
        const [x0, y0] = at([0, 0, 30 - (f * 7) % 18]);
        let x = Math.round(x0) - 7, y = Math.round(y0);
        while (x <= x0 + 7) { px(x, y, S[5]); x++; y += hash3(x, f, 73) < 0.5 ? -1 : 1; }
      }
      for (let i = 0; i < 4; i++) { const [x, y] = at([(hash3(i, f, 74) - 0.5) * 18, (hash3(f, i, 75) - 0.5) * 18, 0]); px(x, y, S[4 + (i & 1)]); }
    } };
}

// ---- crown-stones and ward-stones (30x54): kind 0 plain (variant v), 1 ward holding, 2 ward broken -------------------
export function standingStone(kind: 0 | 1 | 2, v = 0, f = 0): PropModel {
  const P: Prim[] = [], eyes: { p: V3; col: number }[] = [], t = (f / N) * TAU;
  const hgt = kind === 2 ? 28 : kind === 1 ? 46 : [43, 37, 46][v % 3], lean = kind === 1 ? 0 : [0.06, -0.08, 0.02][v % 3], seed = 100 + v * 7 + kind * 13;
  const moss = M(MOSS, { grain: 0.2 });
  const stone: PMat = { ...M(GRANITE, { grain: 0.12, tex: rockTex(seed, 0.7) }), sub: (x, y, z) => (noise3(x * 0.3, y * 0.3, z * 0.3 + seed) > 0.66 - (1 - z / hgt) * 0.2 ? moss : undefined) };
  const hw = (z: number) => { const k = z / hgt; return 6.4 - k * 1.8 - (k > 0.85 ? (k - 0.85) * 26 : 0) + (noise3(z * 0.12, seed, 1) - 0.5) * 1.1; };
  const sl = (x: number, z: number) => x - lean * z; // lean toward u
  P.push({ m: stone, k: 0.4, lo: [-12, -10, 0], hi: [12, 10, hgt + 1], d: (x, y, z) => {
    const X = sl(x, z), Y = y + lean * z * 0.5;
    let d = Math.max(Math.max(Math.abs(X) - hw(z), Math.abs(Y) - hw(z) * 0.72) * 0.8, -z, z - hgt);
    if (kind === 2) d = Math.max(d, z - hgt + 4 + (noise3(x * 0.6, y * 0.6, seed) - 0.5) * 7); // snapped
    return d;
  } });
  // sigil carved on the face toward the viewer: a little crown, and for wards a column of runes
  const glow = kind === 1, rune = M(glow ? GLOAM : GRANITE.slice(0, 3), { emit: glow ? 0.55 + 0.25 * Math.sin(t) : 0 });
  const face = (z: number, s: number): V3 => [lean * z + s, -lean * z * 0.5 + hw(z) * 0.72 + 0.1, z]; // on the side toward the viewer
  if (kind !== 2) for (const s of [-2.8, 0, 2.8]) P.push({ ...rod(face(hgt - 11, s), face(hgt - 9 + (s === 0 ? 0.8 : 0), s), 0.6, rune, 0.6, 0.1), cut: !glow });
  if (kind !== 2) P.push({ ...rod(face(hgt - 12.5, -3), face(hgt - 12.5, 3), 0.6, rune, 0.6, 0.1), cut: !glow });
  if (kind !== 0) for (let r = 0; r < 4; r++) { const z = hgt - (kind === 2 ? 9 : 18) - r * 5; if (z < 4) break; P.push({ ...rod(face(z, r % 2 ? 1 : -1), face(z - 2.6, (r % 2 ? 1 : -1) + 0.6), 0.55, rune, 0.55, 0.1), cut: !glow }); }
  if (kind === 1) for (const z of [hgt - 15, 12]) P.push({ m: M(IRON, { spec: 0.5, shine: 14, grain: 0.05 }), k: 0.2, lo: [-12, -10, z - 2], hi: [12, 10, z + 2], d: (x, y, zz) => {
    const X = x, Y = y; return Math.max(Math.abs(Math.max(Math.abs(X) - hw(zz), Math.abs(Y) - hw(zz) * 0.72) * 0.8 - 0.5) - 0.7, Math.abs(zz - z) - 1);
  } });
  if (kind === 2) {
    const top = { ...stone, sub: undefined } as Mat;
    P.push(blob([8, 5, 3], 7, 4, 3.2, top, 0.4, 0));
    for (const [u, vv] of [[-8, 3], [-6, 7], [9, -3], [4, 10]]) P.push(blob([u, vv, 0.3], 1.2, 1, 0.8, top, 0.2));
  }
  const ash = M(ASH, { grain: 0.3 });
  P.push(blob([0, 0, 0], 9, 8, 0.8, ash, 1.2, 0));
  return { prims: P, eyes, cast: 18,
    halos: kind === 1 ? [{ p: [0, 0, hgt * 0.55], r: 16, col: GLOAM[3], a: 0.2 + 0.1 * Math.sin(t) }] : undefined };
}


// ---- the Hollow Throne (108x120): crown-backed throne on a stepped dais, green Gloam welling over the steps -------
/** Facing the viewer: X across the screen (texels), D toward the viewer, Z up (world texels). */
const R2 = Math.SQRT2, YAW = -Math.PI / 4;
const fw = (X: number, D: number, Z: number): V3 => [X / 2 + D / R2, -X / 2 + D / R2, Z];
/** Box facing the viewer: X0..X1 across (screen texels), D0..D1 depth, Z0..Z1. */
const fbox = (X0: number, X1: number, D0: number, D1: number, Z0: number, Z1: number, m: Mat, rr = 0.6, k = 0.3) =>
  rbox(fw((X0 + X1) / 2, (D0 + D1) / 2, (Z0 + Z1) / 2), [(X1 - X0) / 2 / R2 - rr, (D1 - D0) / 2 - rr, (Z1 - Z0) / 2 - rr], rr, m, { yaw: YAW, k });
export function throne(f: number): PropModel {
  const P: Prim[] = [], eyes: { p: V3; col: number }[] = [], t = (f / N) * TAU, pulse = 0.5 + 0.5 * Math.sin(t);
  const moss = M(MOSS, { grain: 0.2 });
  const stoneM = (seed: number, mossy = 0.72): PMat => ({ ...M(GRANITE, { grain: 0.12, tex: rockTex(seed, 0.7) }), sub: (x, y, z) => (noise3(x * 0.3, y * 0.3, z * 0.3 + seed) > mossy ? moss : undefined) });
  // the dais: three worn steps, each set back
  const steps: [number, number, number, number][] = [[52, 10, 0, 7], [44, 4, 7, 13], [37, -2, 13, 19]];
  steps.forEach(([hw, d1, z0, z1], i) => {
    P.push(fbox(-hw, hw, -26, d1, z0, z1, stoneM(20 + i, 0.62 + i * 0.04), 0.8, 0.2));
    P.push({ ...fbox(-hw - 2, -hw + 4 + i * 2, d1 - 5, d1 + 2, z1 - 3, z1 + 2, stoneM(0)), cut: true, k: 0.8 }); // chipped corner
  });
  const B = 26, top = 19, BH = 42;
  // the back: a slab crowned with five points, the left one snapped off; a recessed panel with the carved crown
  const gold = M([0x3a2a10, 0x6a4c1c, 0x9a7430, 0xc8a050, 0xf0d890], { spec: 0.5, shine: 12 });
  const back = stoneM(40, 0.8), DB = -24, panel = M(GRANITE.slice(0, 5), { grain: 0.12, tex: rockTex(44, 0.5) });
  back.sub = (x, y, z) => {
    const X = x - y, D = (x + y) / R2; // screen X, depth
    if (D > DB + 0.6 && Math.abs(X) < 11 && z > top + 26 && z < top + 36) {
      const yy = top + 36 - z, xx = Math.abs(X);
      if ((yy < 4 || [0, 4, 8].some((c) => Math.abs(xx - c) < 1.6 - (yy - 4) * 0.15)) && hash3(Math.round(X), Math.round(z), 41) < 0.6) return gold;
    }
    if (D > DB + 0.4 && D < DB + 1.8 && Math.abs(X) < B - 6.5 && z > top + 12.5 && z < top + BH - 4.5) return panel;
    return noise3(x * 0.3, y * 0.3, z * 0.3 + 40) > 0.8 ? moss : undefined;
  };
  P.push(fbox(-B, B, DB - 2, DB + 2, top, top + BH, back, 0.8, 0.2));
  const pts: [number, number][] = [[-20, 8], [-10, 11], [0, 19], [10, 11], [20, 13]];
  pts.forEach(([X, h], i) => { if (i === 0) return; P.push(cone(fw(X, DB, top + BH - 2), fw(X, DB, top + BH - 2 + h), 4.6, back, { k: 0.8 })); });
  P.push(fbox(-B, -B + 8, DB - 2, DB + 2, top + BH - 2, top + BH + 3, back, 0.8, 0.6)); // the snapped stump
  P.push({ ...fbox(-B + 6, B - 6, DB + 1.2, DB + 3, top + 12, top + BH - 4, back), cut: true, k: 0.6 }); // recessed panel
  // the gem in the middle point: the Gloam's green, pulsing
  P.push(blob(fw(0, DB + 2.2, top + BH + 8), 2.6, 2.6, 3.6, M(GLOAM, { emit: 0.6 + pulse * 0.3, spec: 0.8, shine: 20 }), 0.3));
  // seat and armrests, the right one ending in a skull, the left broken
  const seat = stoneM(50, 0.85);
  P.push(fbox(-30, 30, DB, -8, top, top + 10, seat, 0.8, 0.3));
  P.push(fbox(-37, -27, DB, -8, top + 10, top + 16, seat, 0.8, 0.3));
  P.push(fbox(27, 37, DB, -8, top + 10, top + 22, seat, 0.8, 0.3));
  const bone = M([0x4a4438, 0x6a6252, 0x8e8672, 0xb8ae94, 0xd8d0b8], { grain: 0.08 });
  const skull = (c: V3) => { P.push(blob(c, 3.4, 3.4, 3.8, bone, 0.4)); for (const s of [-1.3, 1.3]) eyes.push({ p: [c[0] + 2.6 + s * 0.7, c[1] + 2.6 - s * 0.7, c[2] + 0.4], col: 0x141014 }); };
  skull(fw(32, -7, top + 25));
  skull(fw(-42, 6, 14)); // the left knob lies broken on the step
  // the Gloam welling from under the seat and running down the steps, a pool on the top step
  const ooze = M(GLOAM, { emit: 0.35 + pulse * 0.15, spec: 0.6, shine: 12, grain: 0.15 });
  P.push(blob(fw(0, -4, top), 22 / R2, 5, 0.7, M(GLOAM, { emit: 0.25, spec: 0.6, shine: 12, grain: 0.2, tex: () => -0.25 }), 0.8, top - 0.3));
  for (let i = 0; i < 7; i++) {
    const X = -16 + i * 5.3 + (hash3(i, 0, 70) - 0.5) * 3, len = 0.4 + 0.6 * hash3(i, 1, 71) * (1 - Math.abs(i - 3) / 5);
    for (const [d0, z0, z1] of [[-2, 19, 13], [4, 13, 7], [10, 7, 0]] as const) {
      if (z0 < 13 && hash3(i, z0, 74) > len) continue;
      P.push(rod(fw(X, d0 + 0.6, z0), fw(X + (hash3(i, z0, 72) - 0.5) * 2, d0 + 1, Math.max(z1, z0 - (z0 - z1) * (len + 0.3))), 0.6 + hash3(i, 2, 73) * 0.5, ooze, 0.4, 0.6));
    }
  }
  // dead ivy creeping up the back
  const ivy = M(MOSS, { grain: 0.3 });
  for (const [X, D, n] of [[-B + 3, DB + 2.4, 9], [B - 3, DB + 2.4, 7]] as const) { let p0 = fw(X, D, top); for (let k = 1; k <= n; k++) { const p1 = fw(X + (noise3(k * 0.5, X, 3) - 0.5) * 6, D, top + k * 5); P.push(rod(p0, p1, 0.7, ivy, 0.6, 0.2)); p0 = p1; } }
  // rubble on the steps
  for (const [X, D, Z, r] of [[-46, 6, 7, 3], [40, -4, 13, 2.4], [50, 10, 0, 3], [-30, 11, 0, 2.4]] as const) P.push(blob(fw(X, D, Z + r * 0.4), r, r * 0.9, r * 0.7, stoneM(90), 0.4));
  // two braziers burning green either side
  const iron = M(IRON, { spec: 0.5, shine: 14, grain: 0.05 });
  const flames: V3[] = [];
  for (const sg of [-1, 1]) {
    const c = fw(sg * 47, -8, 7);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + 0.5; P.push(rod([c[0] + Math.cos(a) * 4.5, c[1] + Math.sin(a) * 4.5, 7], [c[0] + Math.cos(a) * 1.5, c[1] + Math.sin(a) * 1.5, 26], 0.7, iron, 0.6, 0.2)); }
    P.push({ m: iron, k: 0.3, lo: [c[0] - 8, c[1] - 8, 22], hi: [c[0] + 8, c[1] + 8, 31], d: (x, y, z) => { const r = Math.hypot(x - c[0], y - c[1]), dz = z - 30; return Math.max(Math.abs(Math.hypot(r, dz) - 6.5) - 0.8, dz); } });
    P.push(blob([c[0], c[1], 28.5], 5.4, 5.4, 1.4, M(GLOAM, { emit: 0.8 }), 0.3));
    flames.push([c[0], c[1], 30]);
  }
  return { prims: P, eyes, cast: 30,
    halos: [...flames.map((q) => ({ p: [q[0], q[1], q[2] + 6] as V3, r: 18, col: GLOAM[3], a: 0.28 })), { p: fw(0, DB + 2, top + BH + 8), r: 12, col: GLOAM[3], a: 0.2 + pulse * 0.2 }],
    overlay: (px: Px, at) => flames.forEach((q, sgi) => {
      const [bx, by] = at(q), tt = t + (sgi ? 1 : -1);
      for (let k = 0; k < 14; k++) {
        const ph = tt + k * 0.9, hgt = 9 + 5 * Math.sin(ph) * 0.5 + (k % 3) * 2, x0 = bx - 5 + (k % 6) * 2, sw = Math.sin(ph * 1.3) * 1.5;
        for (let j = 0; j < hgt; j++) {
          const qq = j / hgt; if (qq > 0.7 && hash3(k, j, Math.round(tt * 10)) < 0.4) continue;
          const lv = 5 - qq * 3.6 - (k % 4 === 0 ? 0.6 : 0);
          px(Math.round(x0 + sw * qq + (k % 2 ? 1 : -1) * qq * 1.5), Math.round(by - 1 - j), GLOAM[Math.max(0, Math.min(5, Math.round(lv)))]);
        }
      }
    }) };
}

type Entry = { key: string; w: number; h: number; frames: number; ox: number; oy: number; shadow?: number; model: (f: number) => PropModel };
export const ELEMENTS3D: Entry[] = [
  { key: "wp_venom_caps", w: 34, h: 30, frames: N, ox: 17, oy: 25, shadow: 0.4, model: venomCaps },
  { key: "wp_ice_spikes", w: 34, h: 40, frames: N, ox: 17, oy: 34, shadow: 0.45, model: iceSpikes },
  { key: "wp_ember_vent", w: 34, h: 34, frames: N, ox: 17, oy: 29, shadow: 0.4, model: emberVent },
  { key: "wp_storm_stone", w: 30, h: 50, frames: N, ox: 15, oy: 45, shadow: 0.5, model: stormStone },
  { key: "wp_hollow_throne", w: 108, h: 120, frames: N, ox: 54, oy: 111, model: throne },
  ...[0, 1, 2].map((v) => ({ key: `wp_crownstone${v}`, w: 30, h: 54, frames: N, ox: 15, oy: 48, model: () => standingStone(0, v) })),
  { key: "qobj_ward", w: 30, h: 54, frames: 1, ox: 15, oy: 48, model: (f: number) => standingStone(1, 0, f) },
  { key: "qobj_ward_broken", w: 30, h: 54, frames: 1, ox: 15, oy: 48, model: () => standingStone(2, 0) },
];
