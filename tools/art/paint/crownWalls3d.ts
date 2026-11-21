/**
 * The Crown Keep's walls, 3D-built and baked (Murat 2026-11-21: "replace it with 3d turned isometric stone slabs for
 * the outer one, and a nice wall with some moss on it for the inner one"). One frame per wall piece the Keep uses
 * (client/src/crownWalls.ts wallKey): the tile's wall arms run to its edges where the next wall tile carries on, stop
 * at the core where nothing follows, and crumble into stepped broken courses against a RUIN breach.
 *
 * - "slab": the curtain wall round the bailey. Big cut granite slabs in courses (16 px long, running bond), a wider
 *   battered plinth, a cap course and merlons along both edges of the wall walk. Weathering streaks, pits, the odd
 *   chipped block and a little lichen.
 * - "moss": the Throne Hall's walls. Smaller coursed stones (a third of a tile long) under a rounded coping, moss on
 *   the coping, creeping up from the ground and growing in the joints.
 *
 * Seamless joins: the wall is modelled in each tile's own frame but every pattern repeats every tile (32 px), and the
 * arms reach well past the tile's edge, so each ray sees exactly what the neighbour's would. A ray whose first hit lies
 * outside the tile's footprint is left empty (the neighbour draws it) and is never outlined, so no seam shows.
 * Shading follows prop3d.ts (sun from the top left with soft shadow, ambient occlusion, flat ramps, ordered dither).
 */
import { hash3 } from "./mob3d";
import { mix, OUTLINE, rampAt, type V3 } from "./prop3d";
import { CRW, parseWallKey, type WallStyle } from "../../../client/src/crownWalls";

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dith = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];
const L: V3 = (() => { const l: V3 = [0.32, 0.62, 0.8]; const n = Math.hypot(...l); return [l[0] / n, l[1] / n, l[2] / n]; })();
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Pale weathered granite (the Crown's stone), its mortar, the moss and the lichen. */
const GRANITE = [0x16141a, 0x24212a, 0x353139, 0x48434a, 0x5d5759, 0x746c6a, 0x8c837c, 0xa69c90, 0xbdb3a4];
const HALLSTONE = [0x1a171a, 0x2a2527, 0x3c3534, 0x514843, 0x675c53, 0x7f7264, 0x998a78, 0xb2a28c, 0xc8b89e];
const MOSS = [0x0c120b, 0x141f12, 0x1d2c18, 0x283a1e, 0x334826, 0x40562c, 0x506634, 0x62763e];
const LICHEN = [0x2e2c18, 0x4a4626, 0x6a6434, 0x8a8244, 0xa89e58];

interface Course { z0: number; z1: number; hw: number; len: number; off: number; r: number }
interface Style { half: number; top: number; courses: Course[]; merlon?: { z0: number; z1: number; w: number }; core: number; per: number }
const L3 = 32 / 3;
const STYLES: Record<WallStyle, Style> = {
  slab: {
    half: 12, top: 51, core: 10.4, per: 2,
    courses: [
      { z0: 0, z1: 5, hw: 15, len: 16, off: 0, r: 1 }, { z0: 5, z1: 10, hw: 13.6, len: 16, off: 8, r: 1 },
      { z0: 10, z1: 21, hw: 12, len: 16, off: 0, r: 1.1 }, { z0: 21, z1: 30, hw: 12, len: 16, off: 8, r: 1.1 },
      { z0: 30, z1: 40, hw: 12, len: 16, off: 0, r: 1.1 }, { z0: 40, z1: 48, hw: 12, len: 16, off: 8, r: 1.1 },
      { z0: 48, z1: 51, hw: 13, len: 16, off: 4, r: 0.8 },
    ],
    merlon: { z0: 51, z1: 59, w: 5 },
  },
  moss: {
    half: 8, top: 42, core: 6.6, per: 3,
    courses: [
      { z0: 0, z1: 6, hw: 9.4, len: L3, off: 0, r: 0.9 }, { z0: 6, z1: 12.5, hw: 8, len: L3, off: L3 / 2, r: 0.9 },
      { z0: 12.5, z1: 19, hw: 8, len: L3, off: 0, r: 0.9 }, { z0: 19, z1: 25.5, hw: 8, len: L3, off: L3 / 2, r: 0.9 },
      { z0: 25.5, z1: 32, hw: 8, len: L3, off: 0, r: 0.9 }, { z0: 32, z1: 38.5, hw: 8, len: L3, off: L3 / 2, r: 0.9 },
      { z0: 38.5, z1: 42, hw: 9.6, len: 16, off: 8, r: 1.5 },
    ],
  },
};

/** One straight run of wall in the tile: along axis 0 (u) or 1 (v) from a0 to a1; `crumble` = the end (+1/-1) that breaks off. */
interface Arm { axis: 0 | 1; a0: number; a1: number; crumble: number[] }
const EXT = 18; // how far an arm reaches past the tile edge into the next wall tile

function armsOf(mask: number, ruin: number, half: number): Arm[] {
  // directions: N = -v, E = +u, S = +v, W = -u
  const end = (bit: number, rbit: number, sgn: number) => (mask & bit ? sgn * (16 + EXT) : ruin & rbit ? sgn * 16 : sgn * half);
  const u = (mask | ruin) & 10, v = (mask | ruin) & 5, arms: Arm[] = [];
  const crumbles = (lo: number, hi: number) => [...(ruin & lo ? [-1] : []), ...(ruin & hi ? [1] : [])];
  if (u || !v) arms.push({ axis: 0, a0: end(8, 8, -1), a1: end(2, 2, 1), crumble: crumbles(8, 2) });
  if (v) arms.push({ axis: 1, a0: end(1, 1, -1), a1: end(4, 4, 1), crumble: crumbles(1, 4) });
  return arms;
}

/** Rounded box distance: centre-relative extents. */
function rbox(dx: number, dy: number, dz: number, sx: number, sy: number, sz: number, r: number) {
  const qx = Math.abs(dx) - sx + r, qy = Math.abs(dy) - sy + r, qz = Math.abs(dz) - sz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

/** What a hit landed on, for the colour. */
interface Hit { kind: 0 | 1 | 2; c: number; i: number; axis: 0 | 1 }

/** Builds the distance function of one piece. */
function piece(style: WallStyle, mask: number, ruin: number, variant: number) {
  const S = STYLES[style], arms = armsOf(mask, ruin, S.half), G = 0.55; // half the joint
  /** How high the wall still stands at distance d (px) from a crumbled end: stepped, a little ragged. */
  const zmax = (d: number) => 3 + Math.max(0, d) * (S.top / 11) + (hash3(Math.floor(d / 5), 3, 77 + variant) - 0.5) * 6;
  const crumbleCut = (arm: Arm, al: number) => {
    let m = Infinity;
    for (const s of arm.crumble) m = Math.min(m, s > 0 ? arm.a1 - al : al - arm.a0);
    return m; // distance to the nearest crumbled end
  };
  const blockSkip = (arm: Arm, c: number, a0: number, a1: number, i: number) => {
    if (arm.crumble.length) {
      let d = Infinity; // from the crumbled end to the block's nearer end: higher courses need more wall under them
      for (const sg of arm.crumble) d = Math.min(d, sg > 0 ? arm.a1 - Math.min(a1, arm.a1) : Math.max(a0, arm.a0) - arm.a0);
      if (S.courses[c].z1 > zmax(d)) return true;
    }
    // the variant knocks one block out of the cap course / coping near the middle of the tile
    return c === S.courses.length - 1 && variant === 1 && style === "slab" && a1 <= 4 && a0 >= -12 && mod(i, S.per) === 0;
  };
  const sd = (u: number, v: number, z: number, hit: Hit | null): number => {
    let best = Infinity;
    if (z > S.top + 12 || z < -2) return Math.max(z - S.top - 10, -2 - z, 0.5);
    for (const arm of arms) {
      const al = arm.axis === 0 ? u : v, pp = arm.axis === 0 ? v : u;
      const far = Math.max(arm.a0 - al, al - arm.a1, Math.abs(pp) - S.half - 4) - 2;
      if (far > 2) { best = Math.min(best, far); continue; }
      const crumbleD = arm.crumble.length ? crumbleCut(arm, al) : Infinity;
      // the mortar core: a little inside the faces, up to the cap, keeps the joints from showing through
      const coreTop = Math.min(S.top - 2, zmax(crumbleD - 6) - 3);
      const core = Math.max(Math.abs(pp) - S.core, -z, z - coreTop, arm.a0 - al, al - arm.a1);
      if (core < best) { best = core; if (hit) { hit.kind = 1; hit.c = 0; hit.i = 0; hit.axis = arm.axis; } }
      // which course rows to look at
      let ci = S.courses.findIndex((c) => z < c.z1);
      if (ci < 0) ci = S.courses.length - 1;
      for (let c = Math.max(0, ci - 1); c <= Math.min(S.courses.length - 1, ci + 1); c++) {
        const C = S.courses[c], ib = Math.floor((al + C.off) / C.len);
        for (let i = ib - 1; i <= ib + 1; i++) {
          let b0 = i * C.len - C.off, b1 = b0 + C.len;
          if (b1 <= arm.a0 || b0 >= arm.a1) continue;
          const ii = mod(i, Math.round(32 / C.len));
          if (blockSkip(arm, c, b0, b1, ii)) continue;
          b0 = Math.max(b0, arm.a0); b1 = Math.min(b1, arm.a1);
          const jit = hash3(ii, c, 31), out = (jit - 0.5) * (style === "slab" ? 0.9 : 0.7); // each block stands a little proud or sunk
          const tilt = (hash3(ii, c, 32) - 0.5) * 0.06; // and leans a hair
          const hw = C.hw + out + tilt * (z - (C.z0 + C.z1) / 2);
          const d = rbox(al - (b0 + b1) / 2, pp, z - (C.z0 + C.z1) / 2, (b1 - b0) / 2 - G, hw, (C.z1 - C.z0) / 2 - G, C.r);
          if (d < best) { best = d; if (hit) { hit.kind = 0; hit.c = c; hit.i = ii; hit.axis = arm.axis; } }
        }
      }
      // merlons along both edges of the wall walk (not over a crumbled end)
      if (S.merlon && z > S.merlon.z0 - 2 && crumbleD > 12) {
        const M = S.merlon, im = Math.floor(al / 16);
        for (let i = im - 1; i <= im + 1; i++) {
          let m0 = i * 16 + 3, m1 = m0 + 10;
          if (m1 <= arm.a0 || m0 >= arm.a1) continue;
          const ii = mod(i, 2);
          if (variant === 1 && ii === 1 && m0 > -10 && m1 < 10) continue; // a fallen merlon
          m0 = Math.max(m0, arm.a0); m1 = Math.min(m1, arm.a1);
          if (m1 - m0 < 6) continue; // no slivers where an arm stops
          for (const side of [-1, 1]) {
            const cp = side * (S.half - M.w / 2 - 0.3), hz = (M.z1 - M.z0) / 2 - G + (side > 0 && ii === 0 && variant === 0 ? -1.2 : 0);
            const d = rbox(al - (m0 + m1) / 2, pp - cp, z - (M.z0 + hz + G), (m1 - m0) / 2 - G, M.w / 2, hz, 1);
            if (d < best) { best = d; if (hit) { hit.kind = 2; hit.c = side; hit.i = ii; hit.axis = arm.axis; } }
          }
        }
      }
    }
    return best;
  };
  return { sd, S };
}

/** Periodic value noise along a wall (period 32 px along, free across), 0..1. */
function pnoise(a: number, b: number, cell: number, seed: number) {
  const n = Math.round(32 / cell), x = a / cell, y = b / cell, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const h = (i: number, j: number) => hash3(mod(i, n), j, seed);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (h(xi, yi) * (1 - sx) + h(xi + 1, yi) * sx) * (1 - sy) + (h(xi, yi + 1) * (1 - sx) + h(xi + 1, yi + 1) * sx) * sy;
}

/** Renders one wall piece (frame W x H texels, CRW geometry) as ARGB, with its own outline and contact shadow. */
export function renderWall(key: string): Uint32Array {
  const { style, mask, ruin, v: variant } = parseWallKey(key);
  const { sd: sdf, S } = piece(style, mask, ruin, variant);
  const W = CRW.w, H = CRW.h, TX = CRW.tx;
  const buf = new Uint32Array(W * H), depth = new Float32Array(W * H).fill(-Infinity);
  const state = new Uint8Array(W * H); // 0 empty, 1 drawn, 2 clipped (the neighbour's)
  const sd = (p: V3) => sdf(p[0], p[1], p[2], null);
  const at = (X: number, Y: number, s: number): V3 => [(s + X) / 2, (s - X) / 2, s / 2 - Y];
  const norm = (p: V3): V3 => {
    const e = 0.08, [x, y, z] = p;
    const n: V3 = [sd([x + e, y, z]) - sd([x - e, y, z]), sd([x, y + e, z]) - sd([x, y - e, z]), sd([x, y, z + e]) - sd([x, y, z - e])];
    const l = Math.hypot(...n) || 1; return [n[0] / l, n[1] / l, n[2] / l];
  };
  const sun = (p: V3) => {
    let t = 0.5, k = 1;
    for (let s = 0; s < 64 && t < 90; s++) {
      const q: V3 = [p[0] + L[0] * t, p[1] + L[1] * t, p[2] + L[2] * t];
      if (q[2] > S.top + 10) break;
      const d = sd(q);
      if (d < 0.02) return 0;
      k = Math.min(k, 6 * d / t);
      t += Math.max(0.12, d * 0.9);
    }
    return clamp(k);
  };
  const lim = 16 + EXT + 2, zTop = S.top + 10;
  const hit: Hit = { kind: 0, c: 0, i: 0, axis: 0 };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = (x + 0.5 - CRW.ox) / TX, Y = (y + 0.5 - CRW.oy) / TX;
    const sHi = Math.min(2 * lim - X, 2 * lim + X, 2 * (zTop + Y)), sLo = Math.max(-2 * lim - X, -2 * lim + X, 2 * (-1 + Y));
    if (sHi < sLo) continue;
    let s = sHi, found = false, p: V3 = at(X, Y, s);
    for (let k = 0; k < 400 && s >= sLo; k++) {
      p = at(X, Y, s);
      const d = sd(p);
      if (d < 0.015) { found = true; break; }
      s -= Math.max(0.03, d * 0.9 / 0.866);
    }
    if (!found) continue;
    const a = y * W + x;
    if (Math.abs(p[0]) > 16.02 || Math.abs(p[1]) > 16.02) { state[a] = 2; continue; }
    sdf(p[0], p[1], p[2], hit);
    const n = norm(p);
    const ao = clamp(sd([p[0] + n[0] * 1.5, p[1] + n[1] * 1.5, p[2] + n[2] * 1.5]) / 1.5);
    const dif = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) * (0.3 + 0.7 * sun([p[0] + n[0] * 0.25, p[1] + n[1] * 0.25, p[2] + n[2] * 0.25]));
    let l = (0.3 + 0.78 * dif) * (0.55 + 0.45 * ao) + 0.08 * (0.5 + 0.5 * n[2]) + (style === "moss" ? 0.06 : 0.03);
    const al = hit.axis === 0 ? p[0] : p[1], pp = hit.axis === 0 ? p[1] : p[0], z = p[2];
    const fine = hash3(Math.round(p[0] * 1.5), Math.round(p[1] * 1.5), Math.round(p[2] * 1.5));
    let pal = style === "slab" ? GRANITE : HALLSTONE;
    if (hit.kind === 1) l -= 0.2; // mortar deep in a joint
    else {
      const blk = hash3(hit.i, hit.c + (hit.kind === 2 ? 40 : 0), 51 + (style === "slab" ? 0 : 7));
      l += (blk - 0.5) * (style === "slab" ? 0.16 : 0.2) + (fine - 0.5) * 0.12;
      if (fine < 0.045) l -= 0.18; // pits
      const face = Math.abs(n[2]) < 0.5;
      if (face) {
        // rain streaks under the cap and darker, damp stone near the ground
        const streak = pnoise(al, 0, 2, 61), drip = clamp((S.top - z) / 30);
        if (streak > 0.62) l -= (streak - 0.62) * 0.55 * (1 - drip * 0.6);
        if (z < 9) l -= (9 - z) / 9 * 0.1;
        // hairline cracks across a few blocks, the variant's in the middle of the tile
        const crack = Math.abs(pnoise(al * 1.0, z * 0.9, 4, 71 + hit.c) - 0.5);
        if (crack < 0.018 && hash3(hit.i, hit.c, 72 + variant) < 0.45 && Math.abs(al) < 14) l -= 0.22;
      }
      if (style === "moss") {
        // moss: thick on the coping, creeping up from the ground, tufts in the joints and in damp patches
        const mn = pnoise(al, z + pp * 0.7, 4, 81), mn2 = pnoise(al * 1.7, z * 1.3 + pp, 2, 82);
        const up = n[2] > 0.55, low = clamp((14 - z) / 14), joint = ao < 0.72;
        const centre = Math.abs(al) < 12 ? (variant === 1 ? 0.12 : 0.04) : 0; // the variant's extra patch, kept off the tile edges
        const m = up ? 0.35 + mn * 0.5 + centre : (joint ? 0.3 : 0) + low * 0.6 + (mn - 0.5) * 0.9 + centre + (z > S.top - 9 ? 0.18 : 0) + 0.14;
        if (m + (mn2 - 0.5) * 0.35 > 0.62) { pal = MOSS; l = l * 0.9 + 0.05 + (mn2 - 0.5) * 0.25; }
      } else {
        // granite: rust-gold lichen spots on the cap, the plinth and the merlon tops
        const ln = pnoise(al * 1.3, z + pp, 2, 91);
        if ((n[2] > 0.6 || z < 6) && ln > 0.74) { pal = LICHEN; l = l * 0.9 + 0.08; }
        else if (n[2] < 0.5 && z < 4 && pnoise(al, pp, 4, 92) > 0.58) { pal = MOSS; l = l * 0.85; }
      }
    }
    buf[a] = (0xff000000 | rampAt(pal, l, x, y)) >>> 0;
    depth[a] = s; state[a] = 1;
  }
  // inner lines where a nearer part overlaps a farther one
  const out = new Uint32Array(buf);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = y * W + x; if (state[a] !== 1) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const b = yy * W + xx;
      if (state[b] === 1 && depth[b] - depth[a] > 3) { out[a] = (0xff000000 | mix(buf[a] & 0xffffff, OUTLINE, 0.55)) >>> 0; break; }
    }
  }
  // the outline: only against true empty space, never against the neighbour's part
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = y * W + x; if (state[a] !== 0) continue;
    const solid = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < W && yy < H && state[yy * W + xx] === 1;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) { out[a] = ((0xe0 << 24) | OUTLINE) >>> 0; state[a] = 3; }
  }
  // contact shadow on the ground of this tile's footprint
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = y * W + x; if (state[a] !== 0) continue;
    const X = (x + 0.5 - CRW.ox) / TX, Y = (y + 0.5 - CRW.oy) / TX, g = at(X, Y, 2 * Y);
    if (Math.abs(g[0]) > 16 || Math.abs(g[1]) > 16) continue;
    const d = sd([g[0], g[1], 1]);
    if (d > 0 && d < 6) {
      const al = 0.5 * (1 - d / 6);
      if (al > dith(x, y) * 0.5) out[a] = (Math.round(al * 255) << 24) >>> 0;
    }
  }
  return out;
}
