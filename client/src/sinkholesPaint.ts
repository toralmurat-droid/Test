import { BLEACH, DEADWOOD } from "./badlandsPaint";
import { BAYER, Bmp, box, ellipsoid, hash, mix, pal, rod, shadow, splat, tone, vn, type Hit, type RGB, type Sprite, type V3 } from "./moorsPaint";

/**
 * Act 5's Mawdeep Sinkholes art (shared/sinkholes.ts), painted per pixel in code with no canvas or Phaser dependency, so
 * the preview script (tools/art/preview/sinkholes-tiles.ts) runs it in node. Same method as the moors and badlands
 * (moorsPaint.ts): iso solids and surfaces "splatted" into a bitmap, shaded from the top left, quantised to a short ramp
 * with ordered dithering, then outlined. Textures live in sinkholesArt.ts.
 *
 * Geometry is the props' (smoothProps.ts Iso): a point (u, v, z) of a tile (u along world x, v along world y, both
 * -16..16 on the tile, z up) is drawn at x = ox + (u - v), y = oy + (u + v) / 2 - z. Negative z is below the ground:
 * the pits are drawn sunk into the sprite.
 */
/** Damp loam, dark to bright: black-brown mud through wet umber to pale clay on lit edges. */
export const LOAM = pal(["#140e09", "#251810", "#3a281a", "#52392a", "#6c4c34", "#88664a", "#a88866"]);
/** Wet moss and turf. */
export const MOSSY = pal(["#0e1a10", "#1a2c18", "#2a4422", "#3f5f2c", "#5a7e3a", "#7ea050"]);
export const FERN = pal(["#0a1a10", "#14301a", "#224c26", "#36703a", "#54983f", "#82c060"]);
export const WILLOW = pal(["#181a0c", "#2c3616", "#44561f", "#62782a", "#86a038", "#aebe58"]);
export const BARK = pal(["#100c0a", "#221813", "#382a20", "#52402f", "#6e5a42", "#8e7a5c"]);
/** Cenote water: black-teal depths to a pale glassy green at the rim. */
export const DEEP = pal(["#04120f", "#0a2824", "#124038", "#1c5e52", "#2f8670", "#64b898"]);
/** Tanned hide (Hide-Kin flags and flaps) and its dyed accents. */
export const HIDE = pal(["#1a110a", "#38240f", "#5a3a1a", "#80562a", "#a87a3c", "#cca468"]);
export const DYE = pal(["#180a0a", "#3a1410", "#62241a", "#8c3a24", "#b4582e"]);
/** Beach dunes at the coast gate. */
export const DUNE = pal(["#3a2e20", "#5c4a32", "#82694a", "#a8896a", "#c8ac84", "#e2cba0"]);
/** The sinkway's spore light: deep teal-green to a pale lime glow. */
export const SPORE = pal(["#06140e", "#0e3022", "#1a5c3a", "#34964f", "#72cc5a", "#c0ee86", "#f0ffc8"]);

const rnd = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const cl = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

/**
 * Damp loam: wavy earthen courses every ~6 px of height with a shadow line under each, pebbles, rain streaks and
 * roots running down the faces, moss over the lit tops. `fade` darkens (the deeper in a pit, the darker).
 */
export function loamAt(hit: Hit, seed: number, k = 1, fade = 0): RGB {
  const { sx, sy, lit, p } = hit, z = p[2];
  const wave = (vn(p[0] * 0.07 + p[1] * 0.06, z * 0.05, seed) - 0.5) * 5;
  const bi = Math.floor((z + wave) / 6), bk = hash(bi, 7, seed), edge = (z + wave) / 6 - bi;
  let t = 0.14 + lit * 0.72 + (vn(sx * 0.4, sy * 0.4, seed + 1) - 0.5) * 0.26 * k + (bk - 0.5) * 0.14 - fade;
  if (edge < 0.1 && hit.n[2] < 0.7) t -= 0.12;
  if (vn((p[0] + p[1]) * 0.11 + 5, z * 0.45, seed + 3) > 0.76 && hit.n[2] < 0.6) t -= 0.14; // rain streaks
  let col = tone(LOAM, t, sx, sy);
  if (hash(sx, sy, seed + 4) < 0.03) col = tone(LOAM, t + 0.3, sx, sy); // pebbles
  if (hit.n[2] > 0.62 && vn(sx * 0.15, sy * 0.2, seed + 5) + (hash(sx, sy, seed + 6) - 0.5) * 0.2 > 0.42) col = mix(col, tone(MOSSY, 0.3 + lit * 0.6 - fade, sx, sy), 0.8);
  else if (hit.n[2] < 0.7 && vn(sx * 0.1, sy * 0.5, seed + 7) > 0.8) col = mix(col, tone(MOSSY, 0.2 + lit * 0.5, sx, sy), 0.7); // green creeping down the wet faces
  return col;
}

const hide = (h: Hit, seed: number, extra = 0): RGB => tone(HIDE, 0.18 + h.lit * 0.62 + extra + (hash(h.sx, h.sy, seed) - 0.5) * 0.2, h.sx, h.sy);

// ---------- small parts ----------

/** A fern: `n` arching fronds from (u, v, z), each a spine with paired leaflets, curving up then drooping. */
export function fern(b: Bmp, ox: number, oy: number, u: number, v: number, z: number, len: number, n: number, seed: number, glow = 0) {
  const R = rnd(seed * 13 + 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + R() * 0.8, l = len * (0.7 + R() * 0.5), up = 0.55 + R() * 0.5;
    const at = (t: number): V3 => [u + Math.cos(a) * l * t, v + Math.sin(a) * l * t * 0.9, z + l * (up * 1.35 * t - 0.95 * t * t) + 0.6];
    const steps = Math.max(5, Math.round(l / 1.7));
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps, t1 = (s + 1) / steps, q0 = at(t0), q1 = at(t1);
      rod(b, ox, oy, q0, q1, 0.36, (h) => tone(FERN, 0.08 + h.lit * 0.5, h.sx, h.sy));
      const w = (1 - t0) * 2.4 + 0.5;
      for (const sg of [-1, 1]) {
        const px = -Math.sin(a) * sg * w, py = Math.cos(a) * sg * w * 0.9;
        ellipsoid(b, ox, oy, [q1[0] + px * 0.5, q1[1] + py * 0.5, q1[2] - 0.5], [Math.abs(px) * 0.6 + 0.7, Math.abs(py) * 0.6 + 0.7, 0.5], (h) => tone(FERN, 0.06 + h.lit * 0.58 + (hash(h.sx, h.sy, seed + s) - 0.5) * 0.26 + glow, h.sx, h.sy));
      }
    }
  }
}

/** A pennant of hide on a bone stake at (u, v), `hh` tall, hanging toward +u; `mark` paints a dyed (or, awake, glowing) glyph. */
export function flagStake(b: Bmp, ox: number, oy: number, u: number, v: number, hh: number, seed: number, awake = false) {
  const R = rnd(seed * 7 + 3), lean = (R() - 0.5) * 1.2;
  rod(b, ox, oy, [u, v, -0.5], [u + lean, v, hh], 0.95, (h) => tone(BLEACH, 0.26 + h.lit * 0.7 + (hash(h.sx, h.sy, seed) - 0.5) * 0.12, h.sx, h.sy), 1);
  ellipsoid(b, ox, oy, [u + lean, v, hh + 0.7], [1.3, 1.3, 1.1], (h) => tone(BLEACH, 0.35 + h.lit * 0.6, h.sx, h.sy));
  const len = 8 + R() * 3, wid = 5 + R() * 2.5, kind = seed % 3, wave = R() * 6;
  splat(b, ox, oy, (a, c) => [u + lean + 0.6 + a * wid * (1 - c * 0.3), v + 0.7 + Math.sin(a * 3 + wave) * 0.5, hh - 0.6 - c * len + Math.sin(a * 4 + wave) * 0.5 * a], 0, 1, 24, 0, 1, Math.ceil(len * 2.6), (h) => {
    const a = h.a, c = h.c;
    if (c > 1 - a * 0.92 * (1 - c * 0.0) && c > 0.35 + (1 - a) * 0.0 && a + c > 1.12 + hash(Math.floor(a * 6), seed, 1) * 0.15) return null; // the swallow-tail cut and frayed lower edge
    const glyph = kind === 0 ? Math.abs(c - 0.34) < 0.09 : kind === 1 ? Math.abs(a - 0.4) < 0.1 && c < 0.7 : Math.hypot((a - 0.38) * 1.3, c - 0.4) < 0.2 && Math.hypot((a - 0.38) * 1.3, c - 0.4) > 0.09;
    if (glyph) return awake ? tone(SPORE, 0.7 + hash(h.sx, h.sy, 3) * 0.3, h.sx, h.sy) : tone(DYE, 0.4 + h.lit * 0.4, h.sx, h.sy);
    return hide(h, seed, -c * 0.18);
  }, 0, true);
}

/** A bone-and-hide string of flags: stakes of different heights along an arc. */
function flagRing(b: Bmp, ox: number, oy: number, cu: number, cv: number, ru: number, rv: number, a0: number, a1: number, n: number, seed: number, awake: boolean) {
  const R = rnd(seed);
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * (i + 0.5)) / n + (R() - 0.5) * 0.12;
    flagStake(b, ox, oy, cu + Math.cos(a) * ru, cv + Math.sin(a) * rv, 11 + R() * 7, seed * 3 + i, awake);
  }
}

// ---------- the pit ----------

interface PitOpts {
  /** Radius of the opening on the ground (uv units). */
  R: number;
  /** Depth of the floor below the lip. */
  D: number;
  flooded: boolean;
  seed: number;
  /** Ferns, hanging roots and moss all round the lip (an overgrown pit). */
  lush: boolean;
  /** Beach sand over the lip and the upper wall (the coast gate), with a slumped ramp of sand down the near side. */
  sandy?: boolean;
}
/** The opening's radius at angle th: lumpy, with bites where the edge has crumbled. */
const rim = (o: PitOpts, th: number) => o.R * (1 + (vn(Math.cos(th) * 1.5 + o.seed * 3, Math.sin(th) * 1.5, o.seed + 2) - 0.5) * 0.34 + (o.sandy ? Math.max(0, Math.cos(th - 1.0)) * 0.12 : 0));

/**
 * A sinkhole sunk into the ground, centred on (cu, cv): a crumbling lip with an apron of fallen clods, a sheer wall of
 * layered loam that darkens with depth, and either a black floor of rubble or (`flooded`) a still green cenote with
 * a pale foam ring. Only the far half of the wall is drawn (the near half faces away); the near lip hides the rest.
 */
export function drawPit(b: Bmp, ox: number, oy: number, o: PitOpts, cu = 0, cv = 0) {
  const { R: Rad, D, seed } = o, rr = (th: number) => rim(o, th), water = -D * 0.46, sandy = !!o.sandy;
  const at = (th: number, r: number, z: number): V3 => [cu + Math.cos(th) * r, cv + Math.sin(th) * r * 1, z];
  const ground = (h: Hit, base: number) => {
    if (sandy) {
      const rip = Math.sin((h.p[0] * 0.9 + h.p[1] * 0.4) + vn(h.sx * 0.1, h.sy * 0.1, seed) * 5) * 0.08;
      return tone(DUNE, 0.28 + h.lit * 0.6 + rip + (hash(h.sx, h.sy, seed + 1) - 0.5) * 0.14, h.sx, h.sy);
    }
    return loamAt(h, seed + base, 1.1);
  };
  /** Is this pixel inside the opening as drawn? Walls, floor and water show only there: the ground in front of the lip hides the rest. */
  const inside = (h: Hit) => {
    const sum = 2 * (h.sy - oy + 1.2), dif = h.sx - ox, u = (sum + dif) / 2 - cu, w = (sum - dif) / 2 - cv;
    return Math.hypot(u, w) < rr(Math.atan2(w, u) + (Math.atan2(w, u) < 0 ? 6.2832 : 0)) - 0.2;
  };
  // the apron: clods and turf fading out into the ground
  splat(b, ox, oy, (th, c) => at(th, rr(th) + 1.2 + c * 7, 1.3 - c * 1.3 + (vn(th * 3 + c, c * 4, seed) - 0.5) * 0.8), 0, Math.PI * 2, 170, 0, 1, 14, (h) => {
    if (h.c > 0.55 && BAYER[(h.sy & 3) * 4 + (h.sx & 3)] < (h.c - 0.55) * 2.2) return null;
    return ground(h, 1);
  }, 0);
  // the lip: a raised, rounded ridge of earth (with moss on it unless sand)
  splat(b, ox, oy, (th, c) => at(th, rr(th) - 0.8 + c * 3.2, 0.6 + Math.sin(c * 3.14) * 1.7 + (vn(th * 4, 1, seed + 3) - 0.5) * 0.8), 0, Math.PI * 2, 200, 0, 1, 8, (h) => ground(h, 2), 0);
  // the wall (far half only): undercut a little, layered, dark below
  const wallTop = o.flooded ? -water / D : 1, t0 = 3 * Math.PI / 4 - 0.3, t1 = 7 * Math.PI / 4 + 0.3;
  splat(b, ox, oy, (th, t) => at(th, rr(th) * (1 - 0.26 * t * t), 0.5 - t * D), t0, t1, 150, 0, wallTop, Math.ceil(D * 3.4), (h) => {
    if (!inside(h)) return null;
    const dep = -h.p[2] / D;
    let c = loamAt(h, seed + 9, 1, dep * 0.34);
    if (sandy && h.p[2] > -2.2 - vn(h.sx * 0.2, 3, seed) * 2.4) c = tone(DUNE, 0.14 + h.lit * 0.6 - dep * 0.2, h.sx, h.sy);
    if (o.flooded && h.p[2] < water + 2.6) c = mix(c, tone(DEEP, 0.24 + h.lit * 0.4, h.sx, h.sy), 0.6); // wet line above the water
    return c;
  }, 1);
  if (o.flooded) {
    const sky = (h: Hit) => {
      if (!inside(h)) return null;
      const [u, v] = [h.p[0] - cu, h.p[1] - cv], d = Math.hypot(u, v) / (Rad * 0.95);
      let t = 0.22 + (1 - d) * 0.0 + vn(u * 0.35 + seed, v * 0.5 + seed, seed + 11) * 0.3 + d * 0.28 + (u + v < 0 ? 0.1 : 0);
      if (vn(u * 0.5, v * 0.9, seed + 12) > 0.8) t += 0.18; // glints
      let col = tone(DEEP, t, h.sx, h.sy);
      if (vn(u * 0.28 + 20, v * 0.36, seed + 13) > 0.7 + d * 0.1 && d > 0.3) col = mix(col, tone(MOSSY, 0.5 + h.lit * 0.2, h.sx, h.sy), 0.75); // duckweed
      if (d > 0.93 && hash(h.sx, h.sy, seed + 14) < 0.7) col = tone(DEEP, 0.9, h.sx, h.sy); // foam ring
      return col;
    };
    splat(b, ox, oy, (th, rho) => at(th, rr(th) * (1 - 0.26 * wallTop * wallTop) * rho, water), 0, Math.PI * 2, 170, 0, 1, 26, sky, 2, false);
  } else {
    splat(b, ox, oy, (th, rho) => at(th, rr(th) * 0.74 * rho, 0.5 - D), 0, Math.PI * 2, 120, 0, 1, 18, (h) => {
      if (!inside(h)) return null;
      const n = vn(h.p[0] * 0.3, h.p[1] * 0.3, seed + 15);
      let col = tone(LOAM, 0.04 + n * 0.14, h.sx, h.sy);
      if (hash(h.sx, h.sy, seed + 16) < 0.06) col = tone(BLEACH, 0.15, h.sx, h.sy); // old bones in the rubble
      return col;
    }, 3, false);
    const R2 = rnd(seed * 5 + 1);
    for (let k = 0; k < 5; k++) { const a = R2() * 6.28, d = R2() * rr(a) * 0.5; ellipsoid(b, ox, oy, at(a, d, 1.2 - D), [1.8 + R2() * 1.6, 1.5 + R2(), 1.2], (h) => (inside(h) ? loamAt(h, seed + 30 + k, 1, 0.45) : null)); }
  }
  // the slumped ramp: sand and loam sliding down the near side into the hole
  if (sandy) {
    splat(b, ox, oy, (th, t) => at(th, rr(th) * (1 - 0.5 * t) + 1, 1.2 - t * (D * 0.78)), 0.72, 1.15, 50, 0, 1, 40, (h) => {
      if (!inside(h)) return null;
      const w = vn(h.p[0] * 0.2, h.p[1] * 0.2, seed + 20) + h.c * 0.7;
      return w > 0.7 || h.c > 0.35 ? tone(LOAM, 0.2 + h.lit * 0.5 - h.c * 0.45, h.sx, h.sy) : tone(DUNE, 0.2 + h.lit * 0.6 - h.c * 0.6 + (hash(h.sx, h.sy, seed + 21) - 0.5) * 0.16, h.sx, h.sy);
    }, 4);
  }
  // roots, ferns and moss
  const R = rnd(seed * 11 + 7), nr = o.lush ? 8 : 3;
  for (let i = 0; i < nr; i++) { // roots hanging over the far lip
    const th = 3.5 + R() * 2.6, r0 = rr(th), p0 = at(th, r0 + 0.8, 1.8), len = 5 + R() * (o.flooded ? 5 : D * 0.7);
    const p1 = at(th, r0 * 0.84, -len), mid: V3 = [(p0[0] + p1[0]) / 2 + (R() - 0.5) * 2, (p0[1] + p1[1]) / 2 + (R() - 0.5) * 2, p0[2] * 0.4 + p1[2] * 0.6 + 1];
    rod(b, ox, oy, p0, mid, 0.7, (h) => tone(BARK, 0.2 + h.lit * 0.8, h.sx, h.sy), 0.4);
    rod(b, ox, oy, mid, p1, 0.45, (h) => (inside(h) ? tone(BARK, 0.15 + h.lit * 0.8, h.sx, h.sy) : null));
  }
  const nf = o.lush ? 5 : 2;
  for (let i = 0; i < nf; i++) {
    const th = (i / nf) * 6.28 + R() * 0.6, r = rr(th) + 1.5 + R() * 3;
    if (th > 0.3 && th < 1.4 && sandy) continue;
    fern(b, ox, oy, cu + Math.cos(th) * r, cv + Math.sin(th) * r, 1.4, 4 + R() * 3 + (o.lush ? 1.5 : 0), o.lush ? 5 : 4, seed + i * 3);
  }
  if (o.lush) for (let i = 0; i < 4; i++) { // moss cushions on the lip
    const th = R() * 6.28, r = rr(th) + 0.8;
    ellipsoid(b, ox, oy, at(th, r, 1.2), [2.6 + R() * 1.4, 2.2, 1.4], (h) => tone(MOSSY, 0.28 + h.lit * 0.72 + (hash(h.sx, h.sy, seed + i) - 0.5) * 0.28, h.sx, h.sy), (a, p) => 1 + (hash((a * 5) | 0, (p * 4) | 0, seed + i) - 0.4) * 0.3);
  }
}

/** The PIT object: a sinkhole (open and black-floored, or a flooded cenote) in the loam, `v` picks the shape and how overgrown it is. */
export function paintPit(flooded: boolean, v: number): Sprite {
  const oy = 38, ox = 48, b = new Bmp(96, 70);
  drawPit(b, ox, oy, { R: 14.2 + (v % 3) * 0.5, D: flooded ? 13 : 17, flooded, seed: v * 17 + (flooded ? 5 : 1), lush: v % 3 !== 0 });
  b.depthEdges(3, 0.6);
  b.outline(0.35);
  return { b, ox, oy };
}

// ---------- the burrow mound ----------

/**
 * A Hide-Kin burrow mound (BURROW, solid): a turfed dome with exposed loam and clods, a round-topped door in a timber
 * frame with a hide flap rolled over it, an antler crown, a smoke vent of stones and a flag on a bone stake.
 */
export function paintBurrow(v: number): Sprite {
  const R = rnd(v * 29 + 11), seed = v * 13 + 3, ox = 36, oy = 40, b = new Bmp(72, 66), Hd = 11 + R() * 2.5, Rd = 13.2;
  shadow(b, ox, oy, 0, 3, 18, 9, 120);
  // trodden earth in front of the door
  splat(b, ox, oy, (u, w) => [u, 11 + w * 8, 0.1], -9, 9, 40, 0, 1, 20, (h) => {
    if (h.c > 0.6 && BAYER[(h.sy & 3) * 4 + (h.sx & 3)] < (h.c - 0.6) * 2.4) return null;
    return tone(LOAM, 0.22 + vn(h.sx * 0.3, h.sy * 0.3, seed) * 0.3 + (hash(h.sx, h.sy, seed + 1) - 0.5) * 0.12, h.sx, h.sy);
  }, 0, false);
  const door = (u: number, z: number) => Math.abs(u) < 4.2 && z < 7.6 * Math.sqrt(Math.max(0, 1 - (u / 4.6) ** 2)) + 0.4;
  ellipsoid(b, ox, oy, [0, 0, 0], [Rd, Rd - 0.5, Hd], (h) => {
    const [u, w, z] = h.p;
    if (z < 0.2) return null;
    if (w > 5 && door(u, z)) return tone(LOAM, 0.02 + (z / 8) * 0.05, h.sx, h.sy);
    const n = vn(h.sx * 0.2, h.sy * 0.25, seed), clod = hash(h.sx >> 1, h.sy >> 1, seed + 2);
    if (h.n[2] < 0.55 && n > 0.45 && z < 6) return loamAt(h, seed + 3, 1.2);
    let t = 0.16 + h.lit * 0.78 + (n - 0.5) * 0.3 + (clod - 0.5) * 0.14 - Math.max(0, 1.8 - z) * 0.08;
    if (vn(h.sx * 0.5, h.sy * 0.9, seed + 4) > 0.8) t += 0.2; // tufts
    return tone(MOSSY, t, h.sx, h.sy);
  }, (th, ph) => 1 + (vn(th * 1.8 + seed, ph * 2, seed + 1) - 0.5) * 0.12);
  // the door frame and the rolled flap
  const wood = (h: Hit) => tone(DEADWOOD, 0.12 + h.lit * 0.8, h.sx, h.sy);
  const dv = Rd - 0.6;
  for (const s of [-1, 1]) rod(b, ox, oy, [s * 5.2, dv - 0.2, 0], [s * 5.2, dv - 1.1, 8.6], 0.95, wood, 0.4);
  rod(b, ox, oy, [-6.3, dv - 1.2, 8.6], [6.3, dv - 1.2, 8.6], 0.95, wood, 0.3);
  rod(b, ox, oy, [-5, dv - 1.6, 10.2], [5, dv - 1.6, 10.2], 0.85, (h) => hide(h, seed, 0.1), 0.2);
  for (let k = 0; k < 4; k++) rod(b, ox, oy, [-3.6 + k * 2.4, dv - 1.6, 10], [-3.6 + k * 2.4 + 0.3, dv - 1.6, 7.6 - (k % 2)], 0.45, (h) => hide(h, seed + k, -0.1)); // the fringe
  // antler crown above the door
  for (const s of [-1, 1]) {
    const q: V3 = [s * 2.2, dv - 1.8, 11.8], t: V3 = [s * 5.4, dv - 1.8, 16.4];
    rod(b, ox, oy, [s * 0.8, dv - 1.8, 10.6], q, 0.55, (h) => tone(BLEACH, 0.3 + h.lit * 0.7, h.sx, h.sy));
    rod(b, ox, oy, q, t, 0.45, (h) => tone(BLEACH, 0.3 + h.lit * 0.7, h.sx, h.sy));
    rod(b, ox, oy, [q[0] + s * 1.2, q[1], q[2] + 1.8], [q[0] + s * 3.8, q[1], q[2] + 5.4], 0.35, (h) => tone(BLEACH, 0.35 + h.lit * 0.7, h.sx, h.sy));
  }
  // the smoke vent: a ring of stones and a clay pipe on the crown
  const vx = -3.4, vy = -2.6, vz = Hd * 0.86;
  for (let k = 0; k < 6; k++) { const a = k * 1.05; ellipsoid(b, ox, oy, [vx + Math.cos(a) * 2.5, vy + Math.sin(a) * 2.3, vz], [1.2, 1.1, 0.9], (h) => tone(LOAM, 0.3 + h.lit * 0.7, h.sx, h.sy)); }
  rod(b, ox, oy, [vx, vy, vz], [vx, vy, vz + 3.4], 1.35, (h) => tone(LOAM, 0.4 + h.lit * 0.6, h.sx, h.sy));
  // dye-red hide on a stake and a clay pot by the door
  flagStake(b, ox, oy, 11, 14, 14, seed + 5);
  ellipsoid(b, ox, oy, [-9.2, 14, 1.8], [2.2, 2.2, 2], (h) => tone(HIDE, 0.12 + h.lit * 0.7, h.sx, h.sy));
  fern(b, ox, oy, -11.5, 6, 0.4, 6, 4, seed + 7);
  fern(b, ox, oy, 12, -2, 0.4, 5, 3, seed + 8);
  b.depthEdges(2.4, 0.55);
  b.outline(0.35);
  return { b, ox, oy };
}

// ---------- the cave mouth ----------

/** The tall loam block the cave is cut into (matches the cliff block: 64 px wide, ground plane at (32, CAVE_H + 16)). */
export const CAVE_H = 40;
const caveArch = (u: number, hw: number, hh: number) => Math.abs(u) >= hw ? 0 : hh * Math.pow(1 - (u / hw) ** 2, 0.5);

/**
 * A cave mouth in a loam cliff (CAVE, solid): a full cliff block (both faces) with a dark arch cut in the south-west face,
 * a lit lip of loam round it, roots and moss over the brow, a spill of rubble in front, hide flags on bone stakes either side.
 */
export function paintCaveMouth(v: number): Sprite {
  const R = rnd(v * 37 + 9), seed = v * 19 + 5, H = CAVE_H, ox = 40, oy = H + 20, b = new Bmp(80, H + 20 + 26), hw = 8.6, hh = 17;
  shadow(b, ox, oy, 0, 20, 22, 7, 90);
  // the dark inside first: the back wall, the left jamb, a floor sloping in
  splat(b, ox, oy, (u, z) => [u, 7, z], -hw, hw, 30, 0, hh, 30, () => [8, 6, 6], 5, false);
  splat(b, ox, oy, (d, z) => [-hw, 16 - d * 9, z * caveArch(-hw + 0.6, hw, hh)], 0, 1, 20, 0, 1, 20, (h) => tone(LOAM, 0.05 + h.lit * 0.2 - h.a * 0.04, h.sx, h.sy), 6);
  splat(b, ox, oy, (u, d) => [u, 16 - d * 9, 0.2], -hw, hw, 30, 0, 1, 20, (h) => tone(LOAM, 0.08 + (1 - h.c) * 0.34 + (hash(h.sx, h.sy, seed) - 0.5) * 0.1, h.sx, h.sy), 7, false);
  box(b, ox, oy, -16, 16, -16, 16, 0, H, (h) => {
    const [u, , z] = h.p;
    if (h.tag === 1) {
      const a = caveArch(u + (vn(z * 0.3, 2, seed) - 0.5) * 1.4, hw, hh + (vn(u * 0.3, 5, seed) - 0.5) * 2);
      if (z < a) return null; // the opening
      const e = z - a;
      if (e < 1.7 && u > -hw - 1.5 && z < hh + 2.4) return tone(LOAM, 0.55 + h.lit * 0.4 - e * 0.1, h.sx, h.sy); // the lit lip of the mouth
      return loamAt(h, seed, 1, z < 6 ? 0 : 0.05);
    }
    if (h.tag === 0) {
      let c = tone(MOSSY, 0.3 + h.lit * 0.55 + (vn(h.sx * 0.3, h.sy * 0.4, seed + 3) - 0.5) * 0.3 + (hash(h.sx, h.sy, seed + 4) - 0.5) * 0.14, h.sx, h.sy);
      if (vn(h.sx * 0.12, h.sy * 0.2, seed + 6) > 0.62) c = tone(LOAM, 0.34 + h.lit * 0.5, h.sx, h.sy);
      return c;
    }
    return loamAt(h, seed + 2, 1);
  });
  // brow: moss curtain and roots over the opening
  for (let i = 0; i < 9; i++) {
    const u = -13 + i * 3.3 + R() * 2, z0 = H + 0.4 - R() * 1.5, hang = 5 + R() * 13 + (Math.abs(u) < hw ? 4 : 0);
    rod(b, ox, oy, [u, 16.4, z0], [u + (R() - 0.5) * 2, 16.9, z0 - hang], 0.5 + R() * 0.3, (h) => tone(i % 3 ? BARK : MOSSY, 0.25 + h.lit * 0.75, h.sx, h.sy), 0.3);
  }
  for (let i = 0; i < 6; i++) ellipsoid(b, ox, oy, [-13 + i * 5.5 + R() * 2, 16.2, H - 0.6 + R()], [2.6, 1.4, 1.6], (h) => tone(MOSSY, 0.3 + h.lit * 0.7 + (hash(h.sx, h.sy, i) - 0.5) * 0.3, h.sx, h.sy));
  fern(b, ox, oy, -9, 9, H, 6, 5, seed + 1);
  fern(b, ox, oy, 8, -4, H, 5, 4, seed + 2);
  // rubble spill and fallen clods in front
  for (let i = 0; i < 9; i++) {
    const u = (R() - 0.5) * 16, w = 17 + R() * 6, r = 1 + R() * 2;
    ellipsoid(b, ox, oy, [u, w, r * 0.5], [r * 1.4, r, r * 0.8], (h) => loamAt(h, seed + 40 + i, 1.3), (th, ph) => 1 + (hash((th * 4) | 0, (ph * 4) | 0, seed + i) - 0.5) * 0.3);
  }
  flagStake(b, ox, oy, -17, 19, 15, seed + 6);
  flagStake(b, ox, oy, 15, 21, 17, seed + 7);
  b.depthEdges(3.5, 0.6);
  b.outline(0.35);
  return { b, ox, oy };
}

// ---------- ferns, willows ----------

/**
 * Ambient undergrowth (walk-through): kind 0 a fern clump, kind 1 tall bracken with a few bare stems and bracket
 * fronds, kind 2 a cluster of pale toadstools in a moss tuft.
 */
export function paintFern(kind: number, seed: number): Sprite {
  const R = rnd(seed * 23 + kind * 7 + 9), oy = 32, b = new Bmp(56, 46), ox = 28;
  shadow(b, ox, oy, 0, 1, kind === 2 ? 9 : 13, 5, 90);
  if (kind === 2) {
    for (let k = 0; k < 5; k++) { const a = R() * 6.28, d = R() * 5; ellipsoid(b, ox, oy, [Math.cos(a) * d, Math.sin(a) * d * 0.8, 1], [2.8 + R() * 1.4, 2.4, 1.6], (h) => tone(MOSSY, 0.28 + h.lit * 0.72 + (hash(h.sx, h.sy, seed) - 0.5) * 0.3, h.sx, h.sy)); }
    for (let k = 0; k < 6; k++) {
      const a = R() * 6.28, d = 1 + R() * 5, u = Math.cos(a) * d, w = Math.sin(a) * d * 0.8, hh = 3 + R() * 5.5, cr = 2 + R() * 2.2;
      rod(b, ox, oy, [u, w, 0.5], [u, w, hh], 0.75, (h) => tone(BLEACH, 0.3 + h.lit * 0.7, h.sx, h.sy));
      ellipsoid(b, ox, oy, [u, w, hh + 0.3], [cr, cr, cr * 0.55], (h) => {
        const spot = hash(h.sx >> 1, h.sy >> 1, seed + k) < 0.13 && h.n[2] > 0.4;
        return spot ? tone(BLEACH, 0.7, h.sx, h.sy) : tone(k % 3 === 0 ? DYE : HIDE, 0.2 + h.lit * 0.75, h.sx, h.sy);
      });
    }
  } else {
    const nf = kind === 1 ? 7 : 8;
    fern(b, ox, oy, 0, 0, 0.5, kind === 1 ? 14 : 10, nf, seed);
    if (kind === 1) fern(b, ox, oy, 4, 2, 0.5, 9, 5, seed + 3);
    else for (let k = 0; k < 3; k++) fern(b, ox, oy, (R() - 0.5) * 10, (R() - 0.5) * 6, 0.4, 6, 4, seed + 5 + k);
  }
  b.outline(0.4);
  return { b, ox, oy };
}

/**
 * A weeping willow for TREE tiles in the band: a thick, leaning, knuckled trunk with exposed roots in the wet ground, a
 * few forked limbs and a crown whose long yellow-green strands hang almost to the ground.
 */
export function paintWillow(seed: number): Sprite {
  const R = rnd(seed * 41 + 7), H = 36 + R() * 8, ox = 52, oy = Math.ceil(H) + 40, b = new Bmp(104, oy + 18);
  const lean: [number, number] = [(R() - 0.5) * 9, (R() - 0.5) * 4];
  const C = (t: number): V3 => [lean[0] * t * t + Math.sin(t * 5 + seed) * 1.2, lean[1] * t * t + Math.cos(t * 4 + seed) * 0.9, H * t];
  const r0 = 4.4, rOf = (t: number) => r0 * (1 - 0.4 * t) * (1 + 0.55 * Math.pow(1 - t, 7));
  shadow(b, ox, oy, 0, 2, 26, 11, 105);
  const bark = (h: Hit, sd: number) => {
    const grain = vn(h.c * 8 + sd, h.a * 2.2, sd), fur = vn(h.c * 14, h.a * 9, sd + 1) > 0.75;
    let t = 0.2 + h.lit * 0.75 + (grain - 0.5) * 0.4 + (hash(h.sx, h.sy, sd + 2) - 0.5) * 0.12;
    if (fur) t -= 0.3;
    let col = tone(BARK, t, h.sx, h.sy);
    if (vn(h.sx * 0.2, h.sy * 0.25, sd + 3) > 0.7 && h.p[2] < H * 0.7) col = mix(col, tone(MOSSY, 0.3 + h.lit * 0.6, h.sx, h.sy), 0.75); // moss up the wet side
    return col;
  };
  for (let k = 0; k < 5; k++) { const a = k * 1.3 + R(), l = 6 + R() * 6; rod(b, ox, oy, [0, 0, 3.2], [Math.cos(a) * l, Math.sin(a) * l * 0.8, -0.4], 1.5 - k * 0.1, (h) => bark(h, seed + 5), 0.3); }
  splat(b, ox, oy, (t, ang) => { const c = C(t), r = rOf(t) * (1 + (vn(ang * 2 + seed, t * 7, seed) - 0.5) * 0.28); return [c[0] + Math.cos(ang) * r, c[1] + Math.sin(ang) * r * 0.9, c[2]]; }, 0, 0.62, Math.ceil(H * 3), 0, Math.PI * 2, 48, (h) => bark(h, seed), 0);
  const tip = C(0.6), limbs: V3[] = [];
  for (let l = 0; l < 4; l++) { // limbs, each kinking once
    const dir = l * 1.57 + R() * 0.8, p0: V3 = [tip[0], tip[1], tip[2] - R() * 4], p1: V3 = [p0[0] + Math.cos(dir) * (7 + R() * 5), p0[1] + Math.sin(dir) * (6 + R() * 4), p0[2] + 9 + R() * 4];
    const p2: V3 = [p1[0] + Math.cos(dir + 0.4) * 8, p1[1] + Math.sin(dir + 0.4) * 6, p1[2] + 6 + R() * 4];
    rod(b, ox, oy, p0, p1, 2, (h) => bark(h, seed + 10 + l), 0.3);
    rod(b, ox, oy, p1, p2, 1.3, (h) => bark(h, seed + 20 + l), 0.2);
    limbs.push(p1, p2);
  }
  // the crown: sparse leaf mass on top, then the curtain of hanging strands
  for (const q of limbs) {
    ellipsoid(b, ox, oy, [q[0], q[1], q[2] + 3], [10 + R() * 3, 9 + R() * 2, 5], (h) => (hash(h.sx, h.sy, seed + 31) < 0.34 + h.lit * 0.3 ? null : tone(WILLOW, 0.22 + h.lit * 0.85 + (hash(h.sx >> 1, h.sy >> 1, seed + 32) - 0.5) * 0.3, h.sx, h.sy)), (th, ph) => 1 + (hash((th * 5) | 0, (ph * 4) | 0, seed) - 0.5) * 0.4);
  }
  for (let k = 0; k < 64; k++) {
    const q = limbs[k % limbs.length], a = R() * 6.28, d = 2 + R() * 10, sx = q[0] + Math.cos(a) * d, sy = q[1] + Math.sin(a) * d * 0.8, top = q[2] + 1 + R() * 3, bot = 5 + R() * 12, ph = R() * 6.28;
    const P = (t: number): V3 => [sx + Math.sin(t * 3 + ph) * 1.1, sy + Math.cos(t * 2.4 + ph) * 0.8, top - (top - bot) * t];
    for (let s = 0; s < 6; s++) rod(b, ox, oy, P(s / 6), P((s + 1) / 6), 0.55 - s * 0.03, (h) => (hash(h.sx, h.sy, seed + k) < 0.12 ? null : tone(WILLOW, 0.16 + h.lit * 0.85 + (1 - s / 6) * 0.14 + (hash(h.sx, h.sy, seed + 33) - 0.5) * 0.3, h.sx, h.sy)));
  }
  b.depthEdges(3, 0.7);
  b.outline(0.4);
  return { b, ox, oy };
}

// ---------- the Sinkway gate ----------

export const GATE_W = 150, GATE_H = 150, GATE_OX = 75, GATE_OY = 118;
const gateBase = new Map<string, Bmp>();
const PIT_V = 12, PIT_R = 25, PIT_D = 20, CAVE_U = 15;

function coastStatic(awake: boolean): Bmp {
  const seed = 91, b = new Bmp(GATE_W, GATE_H), ox = GATE_OX, oy = GATE_OY, R = rnd(seed);
  const po: PitOpts = { R: PIT_R, D: PIT_D, flooded: false, seed: seed + 1, lush: false, sandy: true };
  // a patch of beach: dunes with wind ripples, dithered at the edge
  splat(b, ox, oy, (u, v) => [u, v, 0], -68, 68, 270, -36, 48, 160, (h) => {
    const [u, v] = h.p, d = Math.hypot(u / 68, (v - 6) / 40) + (vn(u * 0.07, v * 0.1, seed) - 0.5) * 0.5;
    if (Math.hypot(u, v - PIT_V) < rim(po, Math.atan2(v - PIT_V, u) + (v < PIT_V ? 6.2832 : 0)) + 0.5) return null; // the hole is cut out of the sand
    if (d > 1 || (d > 0.78 && BAYER[(h.sy & 3) * 4 + (h.sx & 3)] > (1 - d) * 4.5)) return null;
    const rip = Math.sin((u * 0.5 + v * 0.35) + vn(u * 0.1, v * 0.1, seed + 1) * 6) * 0.1;
    let col = tone(DUNE, 0.34 + vn(u * 0.12, v * 0.16, seed + 2) * 0.4 + rip, h.sx, h.sy);
    if (hash(h.sx, h.sy, seed + 3) < 0.04) col = tone(DUNE, 0.1, h.sx, h.sy);
    return col;
  }, 0, false);
  shadow(b, ox, oy, 0, PIT_V, 50, 26, 110);
  for (const [u, v, rx, ry, hz] of [[-52, -4, 16, 9, 4.5], [50, -8, 18, 10, 5], [-30, -22, 20, 10, 5.5], [26, -24, 22, 10, 6]]) // dune humps behind
    ellipsoid(b, ox, oy, [u, v, 0], [rx, ry, hz], (h) => tone(DUNE, 0.22 + h.lit * 0.78 + Math.sin(h.p[0] * 0.8 + h.p[1] * 0.4) * 0.07 + (hash(h.sx, h.sy, seed + 5) - 0.5) * 0.14, h.sx, h.sy));
  drawPit(b, ox, oy, po, 0, PIT_V);
  flagRing(b, ox, oy, 0, PIT_V, PIT_R + 7, PIT_R * 0.8 + 6, 3.45, 5.97, 7, seed + 7, awake);
  flagRing(b, ox, oy, 0, PIT_V, PIT_R + 8, PIT_R * 0.8 + 7, 6.4, 7.0, 2, seed + 17, awake);
  flagRing(b, ox, oy, 0, PIT_V, PIT_R + 8, PIT_R * 0.8 + 7, 2.5, 3.0, 1, seed + 27, awake);
  // driftwood, shells and a washed-up antler on the sand
  for (let k = 0; k < 7; k++) {
    const u = (R() - 0.5) * 112, v = 22 + R() * 22, sz = 1.4 + R() * 1.6;
    if (Math.abs(u) < 34 && v < 40) continue;
    if (k % 2) rod(b, ox, oy, [u - 5, v, 0.8], [u + 5, v + 1.5, 1.4], 1 + R() * 0.4, (h) => tone(DEADWOOD, 0.2 + h.lit * 0.8, h.sx, h.sy), 0.3);
    else ellipsoid(b, ox, oy, [u, v, 0.5], [sz * 1.4, sz, sz * 0.5], (h) => tone(BLEACH, 0.35 + h.lit * 0.7, h.sx, h.sy));
  }
  for (let k = 0; k < 6; k++) fern(b, ox, oy, (R() < 0.5 ? -1 : 1) * (32 + R() * 24), -8 + R() * 30, 0.4, 4.5 + R() * 2, 3, seed + 40 + k);
  b.depthEdges(5, 0.55);
  b.outline(0.35);
  return b;
}

function caveStatic(awake: boolean): Bmp {
  const seed = 93, b = new Bmp(GATE_W, GATE_H), ox = GATE_OX, oy = GATE_OY, R = rnd(seed), HW = 17, HH = 36, VF = 12, BH = 52;
  splat(b, ox, oy, (u, v) => [u, v, 0], -66, 66, 260, -20, 50, 160, (h) => {
    const [u, v] = h.p, d = Math.hypot(u / 66, (v - 14) / 36) + (vn(u * 0.07, v * 0.1, seed) - 0.5) * 0.5;
    if (d > 1 || (d > 0.78 && BAYER[(h.sy & 3) * 4 + (h.sx & 3)] > (1 - d) * 4.5)) return null;
    let col = tone(LOAM, 0.28 + vn(u * 0.2, v * 0.25, seed + 1) * 0.4, h.sx, h.sy);
    if (vn(u * 0.1 + 5, v * 0.13, seed + 2) > 0.56) col = tone(MOSSY, 0.28 + vn(u * 0.25, v * 0.3, seed + 4) * 0.4, h.sx, h.sy);
    if (hash(h.sx, h.sy, seed + 3) < 0.04) col = tone(LOAM, 0.6, h.sx, h.sy);
    return col;
  }, 0, false);
  shadow(b, ox, oy, 0, 6, 56, 22, 110);
  // the dark inside: back wall, left jamb, the floor running in
  splat(b, ox, oy, (u, z) => [u, VF - 9, z], -HW, HW, 60, 0, HH, 50, () => [7, 6, 6], 5, false);
  splat(b, ox, oy, (d, z) => [-HW, VF - d * 9, z * caveArch(-HW + 0.8, HW, HH)], 0, 1, 24, 0, 1, 40, (h) => tone(LOAM, 0.05 + h.lit * 0.2, h.sx, h.sy), 6);
  splat(b, ox, oy, (u, d) => [u, VF - d * 9, 0.3], -HW, HW, 40, 0, 1, 24, (h) => tone(LOAM, 0.06 + (1 - h.c) * 0.3, h.sx, h.sy), 7, false);
  // the hill: a loam face with a rounded arch, flanking spurs and a turfed brow
  box(b, ox, oy, -42, 42, -12, VF, 0, BH, (h) => {
    const [u, , z] = h.p;
    if (h.tag === 1) {
      const a = caveArch(u + (vn(z * 0.25, 2, seed) - 0.5) * 2, HW, HH + (vn(u * 0.2, 5, seed) - 0.5) * 3);
      if (z < a) return null;
      const e = z - a;
      if (e < 2 && u > -HW - 2) return tone(LOAM, 0.55 + h.lit * 0.4 - e * 0.1, h.sx, h.sy);
      return loamAt(h, seed, 1.1, e < 5 ? 0.08 : 0);
    }
    if (h.tag === 0) {
      let c = tone(MOSSY, 0.3 + h.lit * 0.55 + (vn(h.sx * 0.3, h.sy * 0.4, seed + 3) - 0.5) * 0.3 + (hash(h.sx, h.sy, seed + 4) - 0.5) * 0.14, h.sx, h.sy);
      if (vn(h.sx * 0.12, h.sy * 0.2, seed + 6) > 0.64) c = tone(LOAM, 0.34 + h.lit * 0.5, h.sx, h.sy);
      return c;
    }
    return loamAt(h, seed + 2, 1);
  });
  for (const s of [-1, 1]) ellipsoid(b, ox, oy, [s * 42, 4, 0], [11, 15, 17], (h) => (h.p[2] < 0.3 ? null : loamAt(h, seed + 20, 1.2)), (th, ph) => 1 + (vn(th * 2 + s, ph * 2, seed) - 0.5) * 0.25);
  // timber door frame lashed with hide, an antler crown, a hanging fringe
  const wood = (h: Hit) => tone(DEADWOOD, 0.12 + h.lit * 0.85 + (hash(h.sx, h.sy, seed + 9) - 0.5) * 0.1, h.sx, h.sy);
  for (const s of [-1, 1]) {
    rod(b, ox, oy, [s * (HW + 3.4), VF + 3, -0.5], [s * (HW + 3.4), VF + 2.6, HH * 0.84 + 3], 1.9, wood, 0.5);
    for (let k = 0; k < 3; k++) rod(b, ox, oy, [s * (HW + 3.4) - 1.5, VF + 3.6, 6 + k * 9], [s * (HW + 3.4) + 1.5, VF + 3.6, 7 + k * 9], 0.55, (h) => hide(h, seed + k)); // the lashings
  }
  rod(b, ox, oy, [-HW - 6.4, VF + 2.4, HH * 0.84 + 3.4], [HW + 6.4, VF + 2.4, HH * 0.84 + 3.4], 1.8, wood, 0.4);
  for (let k = 0; k < 9; k++) rod(b, ox, oy, [-HW + 1.6 + k * 3.7, VF + 2.3, HH * 0.84 + 2.5], [-HW + 1.6 + k * 3.7 + (R() - 0.5), VF + 2.3, HH * 0.84 - 3 - (k % 3) * 2.2], 0.6, (h) => hide(h, seed + 30 + k, -0.05));
  for (const s of [-1, 1]) {
    const q: V3 = [s * 5, VF + 2.4, HH * 0.84 + 6.6], t: V3 = [s * 12, VF + 2.4, HH * 0.84 + 13];
    rod(b, ox, oy, [s * 1.2, VF + 2.4, HH * 0.84 + 4.2], q, 1, (h) => tone(BLEACH, 0.3 + h.lit * 0.7, h.sx, h.sy));
    rod(b, ox, oy, q, t, 0.85, (h) => tone(BLEACH, 0.3 + h.lit * 0.7, h.sx, h.sy));
    rod(b, ox, oy, [q[0] + s * 2, q[1], q[2] + 2], [q[0] + s * 6, q[1], q[2] + 8], 0.6, (h) => tone(BLEACH, 0.35 + h.lit * 0.7, h.sx, h.sy));
    rod(b, ox, oy, [q[0] + s * 4.4, q[1], q[2] + 4], [q[0] + s * 4.4 + s * 3, q[1], q[2] + 10], 0.5, (h) => tone(BLEACH, 0.35 + h.lit * 0.7, h.sx, h.sy));
  }
  // flags and bone stakes along the approach, roots over the brow
  const fl: [number, number][] = [[-42, 16], [-33, 22], [-24, 28], [24, 28], [33, 22], [42, 16], [-12, 34], [12, 34]];
  fl.forEach(([u, v], i) => flagStake(b, ox, oy, u, v, 12 + R() * 6, seed * 3 + i, awake));
  for (let i = 0; i < 11; i++) {
    const u = -38 + i * 7.6 + R() * 3, hang = 6 + R() * 12;
    rod(b, ox, oy, [u, VF + 0.4, BH + 0.2], [u + (R() - 0.5) * 2, VF + 0.9, BH - hang], 0.5, (h) => tone(i % 3 ? BARK : MOSSY, 0.25 + h.lit * 0.75, h.sx, h.sy), 0.3);
  }
  for (let k = 0; k < 7; k++) fern(b, ox, oy, -38 + k * 12.5 + R() * 4, -8 + R() * 10, BH - 1, 5 + R() * 3, 4, seed + 50 + k);
  // rubble and bones at the feet
  for (let k = 0; k < 8; k++) {
    const u = (R() - 0.5) * 80, v = 18 + R() * 16, sz = 1.4 + R() * 2;
    if (Math.abs(u) < 14 && v < 30) continue;
    if (k % 2) rod(b, ox, oy, [u - 3, v, 0.8], [u + 3, v + 1, 1.2], 0.9, (h) => tone(BLEACH, 0.3 + h.lit * 0.7, h.sx, h.sy), 1.1);
    else ellipsoid(b, ox, oy, [u, v, 0.7], [sz * 1.3, sz, sz * 0.8], (h) => loamAt(h, seed + 70 + k, 1.3), (th, ph) => 1 + (hash((th * 4) | 0, (ph * 4) | 0, seed + k) - 0.5) * 0.3);
  }
  b.depthEdges(5, 0.55);
  b.outline(0.35);
  return b;
}

/**
 * Frame f of N of the Sinkway gate. Side "coast": a collapsed sinkhole in beach dunes, ringed with hide flags on bone
 * stakes, a ramp of slumped sand running down into the dark. Side "sinkholes": a cave mouth in a loam hill, framed with
 * timber, antlers and hide. Asleep both are dark and cold; awake the opening fills with swirling spore light, the flag
 * glyphs glow, light spills on the ground and motes drift up.
 */
export function paintSinkway(side: "coast" | "sinkholes", awake: boolean, f: number, N: number): Bmp {
  const coast = side === "coast", key = side + (awake ? 1 : 0);
  let base = gateBase.get(key);
  if (!base) { base = coast ? coastStatic(awake) : caveStatic(awake); gateBase.set(key, base); }
  const b = base.clone();
  if (!awake) return b;
  const ph = (f / N) * Math.PI * 2, pulse = 0.5 + 0.5 * Math.sin(ph), ox = GATE_OX, oy = GATE_OY;
  if (coast) {
    // the opening's screen ellipse: the pit's floor, wall and the ramp glow from below
    const cx = ox - PIT_V, cy = oy + PIT_V / 2 - 1.5, rx = PIT_R * 1.41, ry = PIT_R * 0.71;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x - cx) / (rx * 0.93), dy = (y - cy) / (ry * 0.93), d = dx * dx + dy * dy;
      if (d >= 1 || !b.solid(x, y)) continue;
      const low = cl((dy + 1) / 2), sw = vn(x * 0.09 + Math.cos(ph) * 2.2, y * 0.16 + Math.sin(ph) * 2.2, 191) * 0.6 + vn(x * 0.21 - Math.sin(ph) * 1.6, y * 0.3 + Math.cos(ph) * 1.6, 192) * 0.4;
      const k = cl((0.18 + low * 0.7) * (0.62 + sw * 0.7) * (0.82 + 0.18 * pulse) - d * 0.18), flick = BAYER[(y & 3) * 4 + (x & 3)];
      if (flick < k) b.tint(x, y, SPORE[k > 0.62 ? 5 : k > 0.42 ? 4 : 3], 0.78);
      else b.tint(x, y, SPORE[1], 0.35);
    }
    // a halo of light on the sand round the lip
    for (let y = Math.floor(cy - ry - 12); y < cy + ry + 14; y++) for (let x = Math.floor(cx - rx - 14); x < cx + rx + 14; x++) {
      const d = Math.hypot((x - cx) / (rx + 12), (y - cy) / (ry + 8));
      if (d >= 1 || d < 0.84 || !b.solid(x, y)) continue;
      const k = (1 - d) * 2.6 * (0.5 + 0.3 * pulse);
      if (BAYER[(y & 3) * 4 + (x & 3)] < k) b.tint(x, y, SPORE[3], 0.4);
    }
    // a column of motes and mist
    for (let k = 0; k < 34; k++) {
      const life = (f / N + hash(k, 1, 195)) % 1, a = (hash(k, 2, 195) - 0.5) * 2, x = Math.round(cx + a * rx * 0.7 * (1 - life * 0.35) + Math.sin(life * 6 + k) * 2.5), y = Math.round(cy + 4 - life * (42 + hash(k, 3, 195) * 22));
      b.put(x, y, SPORE[life < 0.4 ? 6 : life < 0.75 ? 5 : 4], 1e6, life < 0.8 ? 255 : 150);
      if (k % 3 === 0) { b.put(x + 1, y, SPORE[4], 1e6, 120); b.put(x, y + 1, SPORE[3], 1e6, 100); }
    }
  } else {
    // the veil in the arch (a plane in front of the back wall), swirling upward, bright at the rim
    const VFp = 12, arch = (u: number) => caveArch(u, 17, 36);
    splat(b, ox, oy, (u, z) => [u, VFp - 6.5, z], -17, 17, 130, 0.5, 36, 130, (h) => {
      const u = h.p[0], z = h.p[2], tp = arch(u) - 0.8;
      if (z > tp) return null;
      const uu = u / 17, w = z / 36;
      const sw = vn(u * 0.12 + Math.cos(ph) * 2.4, z * 0.07 + Math.sin(ph) * 2.4, 171) * 0.6 + vn(u * 0.27 - Math.sin(ph) * 1.7, z * 0.2 + Math.cos(ph) * 1.7, 172) * 0.4;
      const lick = Math.sin(z * 0.34 + uu * 2.2 + sw * 5 - ph * 2) * 0.5 + 0.5;
      let t = 0.16 + sw * 0.42 + lick * 0.2 + (1 - Math.abs(uu)) * 0.12 - w * 0.12 + (1 - w) * 0.1;
      const edge = Math.min(17 - Math.abs(u), z, tp - z);
      if (edge < 0.9 + pulse * 0.7) t = 0.92;
      else if (edge < 5) t += 0.26 * (1 - (edge - 0.9) / 4.1);
      return tone(SPORE, Math.min(1, t), h.sx, h.sy);
    }, 0, false);
    // light on the floor and the trodden approach
    const cx = ox - 22, cy = oy + 12;
    for (let y = cy - 20; y < cy + 26; y++) for (let x = cx - 48; x < cx + 48; x++) {
      const d = Math.hypot((x - cx) / 44, (y - cy) / 20);
      if (d >= 1 || y < cy - 8 || !b.solid(x, y)) continue;
      const k = (1 - d) * (0.55 + 0.25 * pulse);
      if (BAYER[(y & 3) * 4 + (x & 3)] < k) b.tint(x, y, SPORE[BAYER[(y & 3) * 4 + (x & 3)] < k * 0.4 ? 5 : 4], 0.5);
    }
    for (let k = 0; k < 32; k++) {
      const life = (f / N + hash(k, 1, 197)) % 1, u = (hash(k, 2, 197) - 0.5) * 2 * 14, v = VFp - 5 + life * (8 + hash(k, 4, 197) * 22), z = 4 + hash(k, 3, 197) * 20 + life * 12 + Math.sin(life * 6 + k) * 1.4;
      const x = Math.round(ox + u * (1 + life * 0.2) - v), y = Math.round(oy + (u + v) / 2 - z);
      b.put(x, y, SPORE[life < 0.5 ? 6 : life < 0.8 ? 5 : 4], 1e6, life < 0.85 ? 255 : 140);
      if (k % 3 === 0 && life < 0.6) b.put(x, y - 1, SPORE[4], 1e6, 130);
    }
  }
  return b;
}

/**
 * Recolours one pixel of the desert's grey-scale-ish sandstone cliff (desertArt.ts cliffTexture) into damp loam: wavy
 * earthen courses with a shadow line under each, rain-dark streaks, moss and turf on the lit tops. `lum` is the source
 * pixel's brightness 0..1, (gx, gy) its art-pixel position in the texture, `v` the cliff variant.
 */
export function loamCliffPixel(lum: number, gx: number, gy: number, v: number): RGB {
  const wave = Math.sin(gx * 0.17 + v * 2) * 1.5 + Math.sin(gx * 0.06 + gy * 0.05) * 1.1, band = Math.floor((gy + wave) / 5), bk = hash(band, 5, 53);
  let t = cl(lum) * 0.88 + (bk - 0.5) * 0.12;
  if ((gy + wave) / 5 - band < 0.14) t -= 0.12;
  if (vn(gx * 0.5 + v * 7, gy * 0.07, 57) > 0.8 && lum < 0.62) t -= 0.12; // wet streaks
  let col = tone(LOAM, t, gx, gy);
  if (lum > 0.62 && vn(gx * 0.22 + v * 9, gy * 0.3, 59) + (hash(gx, gy, 60) - 0.5) * 0.2 > 0.42) col = mix(col, tone(MOSSY, 0.3 + lum * 0.5, gx, gy), 0.78); // moss and turf on the tops
  else if (lum < 0.62 && vn(gx * 0.12, gy * 0.4, 61) > 0.82) col = mix(col, tone(MOSSY, 0.2 + lum * 0.5, gx, gy), 0.65);
  return col;
}
