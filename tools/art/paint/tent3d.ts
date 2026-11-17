/**
 * Morwen's bell tent (client/src/witchCamp.ts tent) rebuilt as a 3D model and baked: a patched crimson-and-soot
 * canvas bell on its pole, the door flap tied open on a dark inside lit by a swinging lantern, guy ropes to stakes
 * with charms swaying on them, crow feathers and a red pennant at the top. 12 frames, like the painted sheet.
 */
import { mat, hash3, noise3, type Mat, type Prim } from "./mob3d";
import { blob, cloth, rod, type PMat, type PropModel, type V3 } from "./prop3d";

const N = 12, TAU = Math.PI * 2;
const M = (pal: number[], o: Parameters<typeof mat>[1] = {}): Mat => mat(0, { ramp: pal, ...o });
const CRIMSON = [0x14060a, 0x200a0e, 0x3c1016, 0x5e161e, 0x7e2226, 0x9e3630, 0xb8523e, 0xd06a4e];
const SOOT = [0x0a080a, 0x120e12, 0x1e181c, 0x2c2428, 0x3c3236, 0x4e4246, 0x605458];
const BURLAP = [0x1e160c, 0x2e2214, 0x4a3820, 0x66502e, 0x84683e, 0x9e8250];
const INSIDE = [0x0c070a, 0x180c10, 0x2a1414, 0x4a2216, 0x7a3c1c, 0xb0602a];
const WOOD = [0x1a1008, 0x24160c, 0x3e2816, 0x5a3c22, 0x7a5634, 0x94704a];
const ROPER = [0x2e2414, 0x5e4e34, 0x8a7450, 0xa89068];
const GOLD = [0x3a2408, 0x5a3a10, 0x8a6020, 0xc0902e, 0xe8c25a];
const IRON = [0x0e1014, 0x16181c, 0x2a2e34, 0x464c54, 0x6c747e, 0x9aa4ae];
const RUNE = [0x8a1a10, 0xd8401c, 0xff7a3a, 0xffd08a];

const R = 29.5, H = 60;                                // ground radius and apex height (texels)
const A0 = Math.PI / 2 + 0.12, PHI0 = A0 - Math.PI / 4; // the door faces the viewer, a little to the left
/** Bell profile (painted prof): a short upright wall, then the roof curving in to the pole. */
const prof = (t: number) => (t < 0.12 ? 1 - t * 0.15 : 0.982 * Math.pow(Math.max(0, (1 - t) / 0.88), 0.92));
const openW = (t: number) => (t < 0.6 ? 0.46 * Math.pow(1 - t / 0.6, 0.8) : 0);
const PATCHES: [number, number, number, number][] = [[2.55, 0.34, 0.22, 0.13], [0.62, 0.46, 0.2, 0.1], [2.05, 0.7, 0.16, 0.08], [1.0, 0.16, 0.14, 0.1]];
/** World point on the canvas at height fraction t, screen angle a (the painted parametrisation), radius scale k. */
const surf = (t: number, a: number, k = 1): V3 => { const r = R * prof(t) * k, p = a - Math.PI / 4; return [Math.cos(p) * r, Math.sin(p) * r, t * H]; };
const angOf = (x: number, y: number) => { let a = Math.atan2(y, x) + Math.PI / 4; if (a < -Math.PI / 2) a += TAU; return a; };
const wrap = (d: number) => Math.atan2(Math.sin(d), Math.cos(d));

export function tent(f: number): PropModel {
  const P: Prim[] = [], ph = (f / N) * TAU;
  // ---- the canvas: a thin shell of revolution, the door cut out of it ----
  const crimson = M(CRIMSON, { grain: 0.08 }), soot = M(SOOT, { grain: 0.08 }), burlap = M(BURLAP, { grain: 0.15 });
  const lining = M(CRIMSON.slice(1, 7), { grain: 0.05, tex: () => -0.14 }), gold = M(GOLD, { spec: 0.4, shine: 12 }), inside = M(INSIDE, { grain: 0.1, tex: (x, y, z) => -0.42 + Math.max(0, 1 - Math.hypot(x - Math.cos(PHI0) * 9, y - Math.sin(PHI0) * 9, z - 18) / 16) * 0.5 });
  const stitch = M([0x2e2214, 0x5a3a10, 0x8a6020]);
  const canvas: PMat = { ...crimson, tex: (x, y, z) => {
    const t = z / H, a = angOf(x, y), pk = a * 9 / Math.PI, frac = pk - Math.floor(pk);
    let l = (hash3(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2)) - 0.5) * 0.08 + t * 0.12 - 0.16;
    if (t < 0.1) l -= (1 - t / 0.1) * 0.22;             // mud splashed up the wall
    if (frac < 0.05 || frac > 0.97) l -= 0.2;           // stitched seams
    return l;
  } };
  canvas.sub = (x, y, z) => {
    const t = z / H, a = angOf(x, y), r = Math.hypot(x, y);
    if (r < R * prof(t) - 0.35) return inside;                                      // the inner face: dark, lantern-lit
    const off = Math.abs(wrap(Math.atan2(y, x) - PHI0)), w = openW(t);
    if (off < w + 0.09 && t < 0.62) return lining;                                   // the flap folded back
    for (const [pa, pt, pw, phh] of PATCHES) if (Math.abs(a - pa) < pw / 2 && Math.abs(t - pt) < phh / 2)
      return Math.abs(a - pa) > pw / 2 - 0.02 || Math.abs(t - pt) > phh / 2 - 0.012 ? stitch : burlap;
    if (t > 0.163 && t < 0.172) return gold;                                        // gold braid under the valance
    const panel = ((Math.floor(a * 9 / Math.PI + 9) % 3) + 3) % 3;
    if (t > 0.115 && t < 0.165 && t - 0.115 > 0.042 * Math.abs(Math.sin(a * 13)) && panel !== 1) return soot; // scalloped valance
    if (t < 0.05 && hash3(Math.round(x), Math.round(y), 8) < 0.05) return inside;   // small holes near the hem
    return panel === 1 ? soot : undefined;
  };
  P.push({ m: canvas, k: 0.3, lo: [-R - 1, -R - 1, 0], hi: [R + 1, R + 1, H + 1], d: (x, y, z) => {
    const t = Math.max(0, Math.min(1, z / H)), r = Math.hypot(x, y), rr = R * prof(t);
    const slope = t < 0.12 ? 1 : 1 / Math.sqrt(1 + Math.pow(R * 1.1 / H, 2));
    let d = Math.max(Math.abs(r - rr + 0.45) * slope - 0.5, -z, z - H);
    const off = Math.abs(wrap(Math.atan2(y, x) - PHI0)), w = openW(t);
    if (w > 0) d = Math.max(d, (w - off) * Math.max(4, r));                          // the doorway
    if (t < 0.012 && hash3(Math.round(Math.atan2(y, x) * 40), 1, 3) < 0.35) d = Math.max(d, 0.2); // ragged hem
    return d;
  } });
  // the flaps, folded back either side of the door, tie-back cords
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const t0 = i * 0.1, t1 = t0 + 0.1, w0 = openW(t0) + 0.1, w1 = openW(t1) + 0.1;
      const a = surf(t0, A0 + s * w0, 1.04), b = surf(Math.min(0.6, t1), A0 + s * w1, 1.04);
      P.push(rod(a, b, 0.9, lining, 0.7, 0.4));
    }
    const k = surf(0.3, A0 + s * (openW(0.3) + 0.05), 1.07);
    P.push(blob(k, 1, 1, 1, gold, 0.3));
    P.push(rod(k, [k[0], k[1], k[2] - 4], 0.35, gold, 0.3, 0.1));
  }
  // rug on the floor inside
  P.push(blob([Math.cos(PHI0) * 2, Math.sin(PHI0) * 2, 0], 13, 13, 0.5, M(CRIMSON.slice(0, 4), { tex: (x, y) => ((Math.round(x) + Math.round(y)) % 5 === 0 ? 0.1 : -0.3) }), 0.4, 0));
  // the lantern hanging inside the doorway, swinging
  const sw = Math.sin(ph) * 1.2, lt: V3 = [Math.cos(PHI0) * 9, Math.sin(PHI0) * 9, 27], lb: V3 = [lt[0] + sw, lt[1] - sw, 21];
  const iron = M(IRON, { spec: 0.5, shine: 14 });
  P.push(rod(lt, lb, 0.3, M(ROPER), 0.3, 0.1));
  P.push(rod([lb[0], lb[1], lb[2] - 0.5], [lb[0], lb[1], lb[2] - 5], 1.6, M(RUNE, { emit: 0.85 + Math.sin(ph * 2) * 0.1 }), 1.6, 0.2));
  P.push(rod([lb[0], lb[1], lb[2] - 0.2], [lb[0], lb[1], lb[2] + 0.4], 1.9, iron, 1.9, 0.1));
  P.push(rod([lb[0], lb[1], lb[2] - 5.4], [lb[0], lb[1], lb[2] - 4.8], 1.9, iron, 1.9, 0.1));
  // ---- the pole above the apex, a gold knob, crow feathers bound round it, the red pennant ----
  const wood = M(WOOD, { grain: 0.06 });
  P.push(rod([0, 0, H - 4], [0, 0, H + 14], 1.1, wood, 0.9, 0.2));
  P.push(blob([0, 0, H + 15], 1.3, 1.3, 1.5, gold, 0.3));
  const feath = M(SOOT.slice(1), { grain: 0.1, spec: 0.3, shine: 10 });
  for (let k = 0; k < 4; k++) { const a = k * 1.6 + 0.4, s2 = Math.sin(ph + k) * 0.6; P.push(rod([0, 0, H + 1], [Math.cos(a) * 4 + s2, Math.sin(a) * 4 - s2, H - 4], 0.6, feath, 0.25, 0.2)); }
  const pen = M(CRIMSON.slice(2), { grain: 0.06 });
  P.push(cloth([0.8, -0.8, H + 13], [10, -10, 0], [0, 0, -5], pen,
    (s, tt) => Math.sin(ph + s * 7) * (0.4 + s * 2.2) + tt * 0.2, (s, tt) => tt < 1 - s * 0.8, 0.5));
  // ---- guy ropes to stakes, charms swaying on them ----
  const rope = M(ROPER, { tex: (x, y, z) => ((x + y + z) * 1.4 % 1 < 0.3 ? -0.15 : 0) });
  const bone = M([0x6a6252, 0x8a806a, 0xb0a68c, 0xd8ceb4]), bead = M(RUNE, { spec: 0.7, shine: 18 });
  const ropes: [number, number][] = [[Math.PI - 0.45, 0.5], [0.42, 0.5], [Math.PI - 0.05, 0.62]];
  ropes.forEach(([a, t], ri) => {
    const p0 = surf(t, a, 1.02), p1 = surf(0, a, 1.5);
    P.push(rod([p1[0], p1[1], -0.5], [p1[0], p1[1], 5], 0.8, wood, 0.6, 0.2)); // stake
    const top: V3 = [p1[0], p1[1], 4.2];
    let prev = p0;
    for (let i = 1; i <= 6; i++) { const k = i / 6, q: V3 = [p0[0] + (top[0] - p0[0]) * k, p0[1] + (top[1] - p0[1]) * k, p0[2] + (top[2] - p0[2]) * k - Math.sin(k * Math.PI) * 1.6]; P.push(rod(prev, q, 0.35, rope, 0.35, 0.05)); prev = q; }
    if (ri === 2) return;
    ([[0.3, 0], [0.55, 1], [0.78, 2]] as const).forEach(([k, kind]) => {
      const h: V3 = [p0[0] + (top[0] - p0[0]) * k, p0[1] + (top[1] - p0[1]) * k, p0[2] + (top[2] - p0[2]) * k - Math.sin(k * Math.PI) * 1.6];
      const s3 = Math.sin(ph + k * 5 + ri * 2) * 1.2, len = 3.5 + kind, e: V3 = [h[0] + s3, h[1] - s3, h[2] - len];
      P.push(rod(h, e, 0.25, rope, 0.25, 0.05));
      if (kind === 0) P.push(rod(e, [e[0], e[1], e[2] - 2.6], 0.55, bone, 0.4, 0.2));
      else if (kind === 1) P.push(rod(e, [e[0] + 0.6, e[1], e[2] - 4], 0.7, feath, 0.2, 0.2));
      else P.push(blob([e[0], e[1], e[2] - 1], 0.9, 0.9, 1, bead, 0.2));
    });
  });
  return { prims: P, cast: 34, shadow: [{ u: 2, v: 2, r: R + 4, a: 0.32 }],
    halos: [{ p: [lb[0], lb[1], lb[2] - 3], r: 20, col: 0xff7a3a, a: 0.32 + Math.sin(ph * 2) * 0.05 }],
    eyes: [{ p: [lb[0] + 1.7, lb[1] + 1.7, lb[2] - 2.5], col: RUNE[3] }] };
}

export const TENT3D = [{ key: "wc_tent", w: 132, h: 110, frames: N, ox: 66, oy: 80, model: tent }];
