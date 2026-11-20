/**
 * The Mawdeep Sinkholes' land kit (settlement network step 3): rope and lifts. Coils of rope on a pallet, a rope walk
 * where the strands are twisted (the jack's hooks turning), a tripod gantry with a cage basket for the pit rims, and
 * the Ropewell Lift: a windlass gantry over the tame sinkhole in Ropewell's square, its basket going up and down.
 * 3D-built like oakvale.ts, baked by tools/art/bake-props.ts; frame sizes from client/src/landKitSheets.ts.
 */
import { hash3, mat, type Mat, type Prim } from "../mob3d";
import { blob, box, grain, rod, type PropModel, type V3 } from "../prop3d";
import { IRONR, OLDR, ROPER, STONER, WOODR } from "../../../../client/src/isoProps";
import { LK_SHEETS, type LkKind } from "../../../../client/src/landKitSheets";

const N = 6, TAU = Math.PI * 2;
/** New hemp rope, paler than the old (ROPER). */
const HEMP = [0x3a2c18, 0x5a4626, 0x7c6438, 0x9c844e, 0xbaa266, 0xd2bc82];
const WICKER = [0x2a1a0c, 0x463018, 0x664826, 0x866236, 0xa47c48];

const M = (pal: number[], o: Parameters<typeof mat>[1] = {}): Mat => mat(0, { ramp: pal, ...o });
const wood = (axis: 0 | 1 | 2, pal = WOODR, bias = 0) => M(pal, { tex: (x, y, z) => grain(axis)(x, y, z) + bias, grain: 0.05 });
const iron = (bias = 0) => M(IRONR, { spec: 0.35, shine: 14, tex: () => bias - 0.05, grain: 0.06 });
/** Rope: the twist shows as light and dark bands slanting round it. */
const rope = (pal = HEMP, bias = 0) => M(pal, { grain: 0.06, tex: (x, y, z) => bias + (((x + y + z * 1.6) % 2.4 + 2.4) % 2.4 < 0.8 ? -0.2 : 0.04) });

/** A torus (ring of rope) at c, radius R, thickness r, lying flat. */
function ring(c: V3, R: number, r: number, m: Mat): Prim {
  return { m, k: 0.2, lo: [c[0] - R - r - 0.5, c[1] - R - r - 0.5, c[2] - r - 0.5], hi: [c[0] + R + r + 0.5, c[1] + R + r + 0.5, c[2] + r + 0.5],
    d: (x, y, z) => Math.hypot(Math.hypot(x - c[0], y - c[1]) - R, z - c[2]) - r };
}
/** A coil of rope: rings stacked, each a little smaller, the loose end trailing. */
function coil(P: Prim[], c: V3, R: number, turns: number, m: Mat, r = 1.3) {
  for (let k = 0; k < turns; k++) P.push(ring([c[0], c[1], c[2] + r + k * r * 1.7], R - (k % 2) * 0.6, r, m));
}
/** A prim moved by d. */
const shift = (p: Prim, d: V3): Prim => ({ ...p, lo: [p.lo[0] + d[0], p.lo[1] + d[1], p.lo[2] + d[2]], hi: [p.hi[0] + d[0], p.hi[1] + d[1], p.hi[2] + d[2]], d: (x, y, z) => p.d(x - d[0], y - d[1], z - d[2]) });

/** A cage basket: wicker sides banded with iron, slings up to a ring at `top`. */
function cage(P: Prim[], c: V3, r: number, h: number, top: number) {
  const [u, v, z] = c, wk = M(WICKER, { grain: 0.08, tex: (x, y, zz) => ((Math.floor(Math.atan2(y - v, x - u) * 8) + Math.floor(zz / 2)) % 2 ? -0.16 : 0.06) });
  P.push({ m: wk, k: 0.3, lo: [u - r - 1, v - r - 1, z], hi: [u + r + 1, v + r + 1, z + h], d: (x, y, zz) => Math.max(Math.abs(Math.hypot(x - u, y - v) - r + 0.8) - 0.9, Math.abs(zz - z - h / 2) - h / 2) });
  P.push({ m: wk, k: 0.2, lo: [u - r, v - r, z - 0.5], hi: [u + r, v + r, z + 1.5], d: (x, y, zz) => Math.max(Math.hypot(x - u, y - v) - r + 0.5, Math.abs(zz - z - 0.6) - 0.6) });
  for (const zz of [z + 1.2, z + h - 1]) P.push(ring([u, v, zz], r, 0.7, iron(0.04)));
  for (const a of [0.4, 0.4 + TAU / 3, 0.4 + (2 * TAU) / 3]) P.push(rod([u + Math.cos(a) * r, v + Math.sin(a) * r, z + h - 1], [u, v, top], 0.35, rope(ROPER), 0.35, 0.1));
  P.push(ring([u, v, top], 1.2, 0.45, iron(0.1)));
}

// ---- rope coils: three coils on a pallet, a fourth hung on a peg post -------------------------------------------
export function ropeCoil(): PropModel {
  const P: Prim[] = [];
  for (let i = -2; i <= 2; i++) P.push(box(i * 6 - 2.4, i * 6 + 2.4, -12, 12, 0, 2.2, wood(1, OLDR, -0.02 + hash3(i, 3, 71) * 0.08), 0.3));
  for (const s of [-1, 1]) P.push(box(-15, 15, s * 9 - 1.4, s * 9 + 1.4, 2.2, 3.6, wood(0, OLDR), 0.3));
  coil(P, [-6, -4, 3.6], 7.5, 4, rope());
  coil(P, [7, 2, 3.6], 6.5, 3, rope(ROPER, 0.02));
  coil(P, [-1, 1, 3.6 + 4 * 1.3 * 1.7 + 0.2], 5.5, 2, rope(HEMP, 0.06), 1.1); // a smaller one stacked on top
  // a loose end trailing to the ground
  P.push(rod([12, 8, 4.5], [17, 12, 0.8], 1.1, rope(ROPER), 1.1, 0.2), rod([17, 12, 0.8], [22, 9, 0.8], 1.1, rope(ROPER), 1.1, 0.2));
  // the peg post behind with a coil hung over it
  P.push(rod([-14, -12, 0], [-14, -12, 26], 1.5, wood(2), 1.3, 0.3), rod([-14, -12, 22], [-10, -12, 23], 0.8, wood(0), 0.8, 0.2));
  P.push({ m: rope(), k: 0.2, lo: [-14, -21, 6], hi: [-6, -3, 24], d: (x, y, z) => Math.hypot(Math.hypot(y + 12, z - 15) - 7.5, x + 9.5) - 1.3 });
  return { prims: P, shadow: [{ u: 0, v: 0, r: 17, a: 0.3 }], cast: 10 };
}

// ---- rope walk: a row of stakes with T-heads, strands strung from the jack (its hooks turning) to the traveller --
export function ropeWalk(f: number): PropModel {
  const P: Prim[] = [], ph = (f / N) * TAU, L = 66;
  // stakes along the walk, a T-bar on each with pegs holding the strands
  for (const u of [-40, -14, 12, 38]) {
    P.push(rod([u, 0, 0], [u, 0, 20], 1.3, wood(2, OLDR, hash3(u, 1, 72) * 0.08), 1.1, 0.3));
    P.push(rod([u, -6, 20], [u, 6, 20], 0.9, wood(1, OLDR), 0.9, 0.2));
  }
  // the jack at the west end: a wheel frame on two posts, three hooks on a turning plate
  const J = -L + 4;
  for (const s of [-1, 1]) P.push(rod([J - 3, s * 8, 0], [J, s * 7, 28], 1.6, wood(2), 1.4, 0.3), rod([J + 4, s * 8, 0], [J, s * 7, 26], 1.2, wood(2, OLDR), 1.1, 0.3));
  P.push(box(J - 2, J + 2, -9, 9, 26, 30, wood(1), 0.4));
  P.push({ m: wood(0, WOODR, 0.04), k: 0.2, lo: [J, -11, 8], hi: [J + 3, 11, 30], d: (x, y, z) => Math.max(Math.hypot(y, z - 19) - 9, Math.abs(x - J - 1.5) - 1) });
  for (let k = 0; k < 3; k++) {
    const a = ph / 3 + (k / 3) * TAU, hy = Math.cos(a) * 4, hz = 19 + Math.sin(a) * 4;
    P.push(rod([J + 2, hy, hz], [J + 6, hy, hz], 0.5, iron(0.05), 0.5, 0.1));
    // a strand from each hook down the walk, sagging between the stakes and twisting together at the far end
    let prev: V3 = [J + 6, hy, hz];
    for (const [u, frac] of [[-27, 0.15], [-14, 0.35], [-1, 0.55], [12, 0.72], [25, 0.86], [38, 0.95], [L - 8, 1]] as const) {
      const sag = u === -14 || u === 12 || u === 38 ? 0 : 1.6, sp = 1 - frac;
      const next: V3 = [u, (k - 1) * 2.2 * sp, 20 - sag + (hz - 19) * sp * 0.4];
      P.push(rod(prev, next, 0.45, rope(HEMP, 0.02 * k), 0.45, 0.1));
      prev = next;
    }
  }
  // the traveller at the east end: a sledge with a top (the grooved cone the strands lay through) and a stone weight
  const E = L - 6;
  P.push(box(E - 3, E + 9, -7, 7, 0, 3, wood(0, OLDR), 0.5), box(E, E + 4, -5, 5, 3, 18, wood(2), 0.5));
  P.push({ m: wood(0, WOODR, 0.08), k: 0.2, lo: [E - 6, -4, 16], hi: [E, 4, 24], d: (x, y, z) => Math.max(Math.hypot(y, z - 20) - (x - E + 6) * 0.6, E - 6 - x, x - E) });
  P.push(blob([E + 7, 0, 5.5], 3.6, 4, 2.8, M(STONER, { grain: 0.2 }), 0.6));
  // a finished coil and a tub of tar by the jack
  coil(P, [J + 2, 14, 0], 5.5, 3, rope(ROPER));
  P.push({ m: wood(2, OLDR), k: 0.3, lo: [J + 10, 9, 0], hi: [J + 20, 19, 9], d: (x, y, z) => Math.max(Math.hypot(x - J - 15, y - 14) - 4.4, Math.abs(z - 4) - 4) });
  P.push(box(J + 11.2, J + 18.8, 10.2, 17.8, 6.5, 7.6, M([0x050404, 0x0e0a08, 0x1a1410], { spec: 0.6, shine: 30 }), 0.3));
  // run north-south (down-left on screen): it fits the narrow yards between Ropewell's palisade and its crates
  return { prims: P.map((p) => turnZ(p, Math.PI / 2 - 0.12)), shadow: [{ u: 0, v: -L + 6, r: 14, a: 0.28 }, { u: 0, v: 0, r: 20, a: 0.12 }, { u: 0, v: L - 4, r: 12, a: 0.25 }], cast: 14 };
}

/** A prim turned `phi` about z (SDF and texture in the turned frame). */
function turnZ(p: Prim, phi: number): Prim {
  const c = Math.cos(phi), s = Math.sin(phi), loc = (x: number, y: number): [number, number] => [x * c + y * s, -x * s + y * c];
  const m0 = p.m as Mat & { tex?: (x: number, y: number, z: number) => number }, m = { ...m0 };
  if (m0.tex) m.tex = (x, y, z) => { const [a, b] = loc(x, y); return m0.tex!(a, b, z); };
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const a of [p.lo[0], p.hi[0]]) for (const b of [p.lo[1], p.hi[1]]) { const u = a * c - b * s, v = a * s + b * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  return { ...p, m, lo: [u0, v0, p.lo[2]], hi: [u1, v1, p.hi[2]], d: (x, y, z) => { const [a, b] = loc(x, y); return p.d(a, b, z); } };
}

// ---- pit gantry: a tripod of poles over a pit's rim, a pulley, a cage basket swinging on its rope ---------------
export function gantry(f: number): PropModel {
  const P: Prim[] = [], ph = (f / N) * TAU, HZ = 74;
  const head: V3 = [4, 0, HZ];
  for (const a of [0.5, 0.5 + TAU / 3, 0.5 + (2 * TAU) / 3]) P.push(rod([Math.cos(a) * 26, Math.sin(a) * 26, 0], head, 1.7, wood(2, OLDR, hash3(Math.round(a * 9), 2, 73) * 0.08), 1.2, 0.3));
  P.push(rod([4, -3, HZ + 2], [4, 3, HZ + 2], 1.6, M(ROPER), 1.6, 0.3)); // the lashing
  P.push({ m: iron(0.05), k: 0.2, lo: [-2, -2, HZ - 12], hi: [10, 2, HZ], d: (x, y, z) => Math.max(Math.abs(Math.hypot(x - 4, z - HZ + 6) - 4.2) - 1, Math.abs(y) - 0.9) });
  // the basket swings a little on its rope (out of step with the next gantry: the view starts each on its own frame)
  const sw = Math.sin(ph) * 3, bz = 22 + Math.sin(ph * 2) * 1.2, bc: V3 = [8.2 + sw, Math.cos(ph) * 1.5, bz];
  P.push(rod([8.2, 0, HZ - 6], [bc[0], bc[1], bz + 20], 0.45, rope(ROPER), 0.45, 0.1));
  cage(P, bc, 7, 11, bz + 20);
  // the hauling rope down the back leg to a cleat, the rest coiled at its foot
  P.push(rod([0, 0, HZ - 6], [-11, -9, 14], 0.45, rope(ROPER), 0.45, 0.1));
  coil(P, [-14, -12, 0], 5, 3, rope(ROPER), 1.1);
  return { prims: P, shadow: [{ u: 0, v: 0, r: 26, a: 0.24 }], cast: 40 };
}

// ---- the Ropewell Lift: two A-frames astride the sinkhole, a head beam, the pulley, a windlass, the cage going down
function liftModel(f: number): PropModel {
  const P: Prim[] = [], ph = (f / LK_SHEETS.lk_lift.frames) * TAU, S = 44, HZ = 150;
  const timber = (axis: 0 | 1 | 2, b = 0) => M(WOODR, { grain: 0.06, tex: (x, y, z) => grain(axis)(x, y, z) + b + (hash3(Math.floor(x / 6), Math.floor(y / 6), Math.floor(z / 9)) - 0.5) * 0.1 });
  // a plank collar round the rim (the pit tiles hold it): sleepers at the corners the legs stand on
  for (const s of [-1, 1]) for (const t of [-1, 1]) P.push(box(s * S - 6, s * S + 6, t * S - 6, t * S + 6, 0, 4, timber(0, -0.04), 0.6));
  for (const s of [-1, 1]) P.push(box(s * S - 3, s * S + 3, -S + 6, S - 6, 1, 3.6, timber(1, -0.06), 0.4));
  // the A-frames: on the west and east rims, legs from the corners leaning in to a cap
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) P.push(rod([s * S, t * S, 4], [s * (S - 4), t * 5, HZ - 2], 2.6, timber(2, 0.03), 2.1, 0.4));
    for (const k of [0.32, 0.62]) { const z = 4 + (HZ - 6) * k, w = S * (1 - k) + 5 * k; P.push(rod([s * (S - 4 * k), -w, z], [s * (S - 4 * k), w, z], 1.4, timber(1, -0.03), 1.4, 0.3)); }
    P.push(rod([s * S, -S, 6], [s * (S - 2.6), S * 0.38, 4 + (HZ - 6) * 0.62], 1.1, timber(2, -0.07), 1.1, 0.3)); // a long brace
    P.push(box(s * (S - 4) - 4, s * (S - 4) + 4, -9, 9, HZ - 3, HZ + 3, timber(1, 0.04), 0.6));
  }
  // the head beam across the pit, and the pulley hung under its middle
  P.push(box(-S - 2, S + 2, -3.5, 3.5, HZ + 1, HZ + 8, timber(0, 0.05), 0.8));
  const WR = 9, WZ = HZ - 8, spin = ph;
  P.push({ m: iron(0.04), k: 0.2, lo: [-WR - 2, -2, WZ - WR - 2], hi: [WR + 2, 2, WZ + WR + 2], d: (x, y, z) => Math.max(Math.abs(Math.hypot(x, z - WZ) - WR + 1) - 1.3, Math.abs(y) - 1.2) });
  for (let k = 0; k < 4; k++) { const a = spin + (k / 4) * Math.PI; P.push(rod([Math.cos(a) * -(WR - 1.5), 0, WZ - Math.sin(a) * (WR - 1.5)], [Math.cos(a) * (WR - 1.5), 0, WZ + Math.sin(a) * (WR - 1.5)], 0.6, iron(0), 0.6, 0.2)); }
  for (const s of [-1, 1]) P.push(rod([0, s * 2.2, HZ + 1], [0, s * 2.2, WZ], 0.9, iron(0.02), 0.9, 0.2));
  // the cage: up out of the pit and down into it again over the loop (below the rim it is in the dark of the hole)
  const bz = 8 + (1 - Math.cos(ph)) * 0.5 * 84;
  P.push(rod([WR, 0, WZ], [WR, 0, bz + 34], 0.6, rope(HEMP), 0.6, 0.1));
  cage(P, [WR, 0, bz], 13, 18, bz + 34);
  if (bz > 40) for (const [du, dv, dz] of [[-4, 3, 2], [4, -4, 2]]) P.push(blob([WR + du, dv, bz + dz + 3], 3.4, 2.8, 3, M([0x2a2218, 0x42382a, 0x5e5240, 0x7a6c54, 0x968868]), 0.5)); // sacks riding up
  // the windlass on the east frame: a drum between the legs, rope wound on it, a crank wheel with spokes
  const DU = S - 4, DZ = 36;
  P.push({ m: M(HEMP, { grain: 0.1, tex: (_x, y) => ((y + 40) % 1.8 < 0.5 ? -0.2 : 0.04) }), k: 0.3, lo: [DU - 7, -24, DZ - 7], hi: [DU + 7, 24, DZ + 7], d: (x, y, z) => Math.max(Math.hypot(x - DU, z - DZ) - 6, Math.abs(y) - 22) });
  P.push(rod([DU - 5, 0, DZ + 5], [-WR, 0, WZ], 0.6, rope(HEMP), 0.6, 0.1)); // up from the drum to the pulley's far side
  const cw = (y0: number) => {
    P.push({ m: timber(1, -0.02), k: 0.3, lo: [DU - 14, y0 - 1.5, DZ - 14], hi: [DU + 14, y0 + 1.5, DZ + 14], d: (x, y, z) => Math.max(Math.abs(Math.hypot(x - DU, z - DZ) - 12) - 1.4, Math.abs(y - y0) - 1) });
    for (let k = 0; k < 4; k++) { const a = -spin + (k / 4) * Math.PI; P.push(rod([DU - Math.cos(a) * 12, y0, DZ - Math.sin(a) * 12], [DU + Math.cos(a) * 12, y0, DZ + Math.sin(a) * 12], 0.8, timber(0, -0.04), 0.8, 0.2)); }
    for (let k = 0; k < 8; k++) { const a = -spin + (k / 8) * TAU; P.push(rod([DU + Math.cos(a) * 12.6, y0, DZ + Math.sin(a) * 12.6], [DU + Math.cos(a) * 16, y0, DZ + Math.sin(a) * 16], 0.6, timber(0, 0.02), 0.6, 0.2)); }
  };
  cw(-26); cw(26);
  // a lantern hung on the west frame, a coil of spare rope on the collar
  P.push(rod([-S + 4, S * 0.5, 60], [-S + 4, S * 0.5, 52], 0.3, iron(0), 0.3, 0.1));
  P.push(box(-S + 1.6, -S + 6.4, S * 0.5 - 2.4, S * 0.5 + 2.4, 44, 52, M([0x1a1208, 0x3a2a10, 0x6a5020, 0xd8a040, 0xffd070], { emit: 0.6, tex: () => 0.25 }), 0.5));
  coil(P, [-S + 2, -S + 2, 4], 6, 3, rope(ROPER));
  return { prims: P, shadow: [{ u: 0, v: 0, r: 52, a: 0.18 }], cast: 70 };
}
/** Over the 2x2 pit (shared/landmarks.ts "lift": the pit tiles already block, so it needs no box of its own). */
export const lift = (f: number) => liftModel(f);

const sheet = (key: LkKind, model: (f: number) => PropModel) => ({ key, ...LK_SHEETS[key], model });
/** The Sinkholes' kit for bake-props.ts. */
export const SINKHOLES_KIT = [sheet("lk_rope_coil", ropeCoil), sheet("lk_rope_walk", ropeWalk), sheet("lk_gantry", gantry), sheet("lk_lift", lift)];
export { shift };
