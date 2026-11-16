import { BAYER, Bmp, box, ellipsoid, hash, mix, pal, rod, shadow, splat, tone, vn, type Hit, type RGB, type Sprite, type V3 } from "./moorsPaint";

/**
 * Act 6's Crown of the Marches art (shared/crown.ts), painted per pixel in code with no canvas or Phaser dependency, so
 * the preview script (tools/art/preview/crown-tiles.ts) runs it in node. Same method as the moors, badlands and sinkholes
 * (moorsPaint.ts): iso solids and surfaces "splatted" into a bitmap, shaded from the top left, quantised to a short ramp
 * with ordered dithering, then outlined. Textures live in crownArt.ts.
 *
 * What is here:
 *  - the ground: `paintCrownGround` (the band's materials for groundPaint.ts, same call shape as the other acts'),
 *    `crownCliffTopPixel` (the pale granite cliffs' top) and `crownCliffPixel` (recolours the desert's cliff block);
 *  - the standing props: `paintStatue` (STATUE), `paintSpire` (SPIRE), `paintBrazier` (BRAZIER, animated flame);
 *  - the five Crownway gates: `paintCrownGate`.
 *
 * Geometry is the props' (smoothProps.ts Iso): a point (u, v, z) of a tile (u along world x, v along world y, both
 * -16..16 on the tile, z up) is drawn at x = ox + (u - v), y = oy + (u + v) / 2 - z.
 */

/** Cold white marble, dark to bright: blue-black joints through grey to a warm white. */
export const MARB = pal(["#14161b", "#272a32", "#41454f", "#646873", "#8c909b", "#b4b7bf", "#d6d7da", "#efede6"]);
/** Gold leaf and gilt veining. */
export const GOLDP = pal(["#241706", "#5a3a0e", "#8c6016", "#bf8c26", "#e4b43a", "#ffdf72", "#fff4b8"]);
/** Pale granite of the Crown's cliffs and spires: cool grey with a hint of bone. */
export const PALEG = pal(["#16171b", "#2c2e34", "#494b52", "#6c6d73", "#908f92", "#b1aeaa", "#d0cbc0"]);
/** Wrought iron. */
export const IRONP = pal(["#09090b", "#17171b", "#26262d", "#3a3a45", "#555563", "#74747f"]);
/** Gone-wild garden growth: ivy, weeds and long grass in the cracks. */
export const WILD = pal(["#0f1a0d", "#1b2e15", "#2b4a1d", "#42682a", "#62903a", "#8fb850"]);
/** Brazier fire: soot red to a white-yellow core. */
export const FLAME = pal(["#2a0804", "#6e1608", "#b83a0e", "#e8701a", "#ffa830", "#ffd864", "#fff6b0"]);
/** The gates' light: warm old gold to near white. */
export const GLOW = pal(["#160c03", "#3e220a", "#7c4c12", "#be8622", "#e8b848", "#fbe08c", "#fffbe6"]);
/** Dusty earth, dead grass and rust-brown paving of the Crown's paths. */
const DUST = pal(["#2a241c", "#3e362a", "#554a3a", "#6d604b", "#867862", "#a09379"]);
const WILDGRASS = pal(["#252a18", "#343c20", "#47502b", "#5b6538", "#707a46", "#8a8f58"]);
const SLAB = pal(["#26272b", "#3a3b40", "#52535a", "#6b6c72", "#85857a", "#a09d92"]);

/** An accent colour per homeland (banner cloth, the crown's gem, the glow's tint). */
export type CrownFrom = "oakvale" | "moors" | "badlands" | "sinkholes" | "sunscar";
export const HOME_ACCENT: Record<CrownFrom, { cloth: RGB[]; glow: RGB }> = {
  oakvale: { cloth: pal(["#0a1c0e", "#14381a", "#22602a", "#38903e", "#62c05a"]), glow: [110, 220, 100] },
  moors: { cloth: pal(["#0a1220", "#14243e", "#264a78", "#4278b4", "#74a8de"]), glow: [130, 180, 240] },
  badlands: { cloth: pal(["#1c0806", "#42120c", "#721e14", "#a8321e", "#d85a34"]), glow: [240, 100, 70] },
  sinkholes: { cloth: pal(["#06181a", "#0e3a38", "#1a6458", "#2e9680", "#60c8a8"]), glow: [100, 230, 190] },
  sunscar: { cloth: pal(["#201004", "#4a2808", "#84480e", "#c07a1a", "#eeb048"]), glow: [255, 190, 80] },
};

const rnd = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const cl = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

// ---------- the ground (groundPaint.ts) ----------

/**
 * What groundPaint.ts passes in: its own `ramp` (writes the dithered colour of palette `p` at level `lv` to the pixel the
 * painter is on), noise and hash. Kept as a parameter so this file needs nothing from groundPaint.
 */
export interface GroundKit {
  ramp: (p: number[][], lv: number, sx: number, sy: number) => void;
  fbm: (x: number, y: number, s: number) => number;
  vn: (x: number, y: number, s: number) => number;
  hash2: (x: number, y: number, s: number) => number;
}
const rp = (a: RGB[]) => a as unknown as number[][];

/**
 * The Crown's ground at world pixel (wx, wy) (tile = 32 units) for tile id `t`, screen pixel (sx, sy) for the dither; the
 * colour is left in the caller's out3 (through `k.ramp`) and the return is the pixel's roughness 0..1 like the other acts'.
 * MARBLE (64) = cracked white flagstones in a running bond (32 x 16 units), gold veins, dark joints, weeds in the gaps;
 * COBBLE / FLAGS / FLOOR / RUBBLE / WALL-foot grounds = pale grey-brown paving; DIRT / SAND / fields = dusty earth;
 * the grasses = tall dead-gold and green garden grass gone wild. Pass the tile-id numbers you map in groundPaint.ts via `kind`.
 */
export function paintCrownGround(kind: "marble" | "paving" | "dust" | "grass", wx: number, wy: number, sx: number, sy: number, k: GroundKit): number {
  const m = k.fbm(wx / 70, wy / 70, 901), n = k.vn(wx / 6, wy / 6, 902), wet = k.vn(wx / 24, wy / 24, 903);
  switch (kind) {
    case "marble": {
      const row = Math.floor(wy / 16), off = (row & 1) * 16, cx = Math.floor((wx + off) / 32);
      const fx = (wx + off) - cx * 32, fy = wy - row * 16, e = Math.min(fx, 32 - fx, fy, 16 - fy);
      const sh = k.hash2(cx, row, 904);
      if (e < 0.75) { k.ramp(rp(MARB), 0.3 + (e < 0.3 ? 0 : 0.5), sx, sy); return 0.3; }
      // a slab: pale, each one a shade of its own, a lit rim on its top-left edges
      let lv = 4.6 + (sh - 0.5) * 1.5 + (n - 0.5) * 0.9 + (m - 0.5) * 1.3 + (fx < 2 || fy < 2 ? 0.45 : 0) - (wet > 0.7 ? 0.8 : 0);
      // gilt veining wandering across (domain-warped, so it does not repeat tile to tile)
      const w = k.vn(wx / 46 + k.vn(wx / 17, wy / 17, 905) * 1.6, wy / 46 + sh * 4, 906);
      const vein = Math.abs(w - 0.5);
      if (vein < 0.012 && sh > 0.35) { k.ramp(rp(GOLDP), 3.4 + (n - 0.5) * 1.6, sx, sy); return 0.5; }
      if (vein < 0.04) lv -= 0.75; // grey veining beside the gold
      // hairline cracks
      const cr = Math.abs(k.vn(wx / 15 + sh * 9, wy / 8, 907) - 0.5);
      if (cr < 0.011) lv -= 3;
      // wild growth: moss in the joints and corners, tufts of weed
      const g = k.fbm(wx / 30, wy / 30, 908) + (e < 3 ? 0.2 : 0) + (k.hash2(Math.floor(wx), Math.floor(wy), 909) - 0.5) * 0.25;
      if (g > 0.77) { k.ramp(rp(WILD), 1.8 + (n - 0.5) * 2 + (e < 3 ? -0.5 : 0.3), sx, sy); return 0.55; }
      k.ramp(rp(MARB), lv, sx, sy);
      return 0.7;
    }
    case "paving": {
      const cx = Math.floor(wx / 16), cy = Math.floor(wy / 16), e = Math.min(wx - cx * 16, (cx + 1) * 16 - wx, wy - cy * 16, (cy + 1) * 16 - wy);
      if (e < 0.7) { k.ramp(rp(SLAB), 0.4, sx, sy); return 0.35; }
      let lv = 2.6 + (k.hash2(cx, cy, 910) - 0.5) * 1.6 + (n - 0.5) * 1.1;
      if (k.fbm(wx / 26, wy / 26, 911) > 0.7) { k.ramp(rp(WILD), 1.6 + (n - 0.5) * 2, sx, sy); return 0.5; }
      if (Math.abs(k.vn(wx / 12 + cx * 3, wy / 7, 912) - 0.5) < 0.012) lv -= 2;
      k.ramp(rp(SLAB), lv, sx, sy);
      return 0.65;
    }
    case "dust": {
      k.ramp(rp(DUST), 2.4 + (m - 0.5) * 1.9 + (n - 0.5) * 1 + (wet > 0.68 ? -0.8 : 0) + (k.hash2(Math.floor(wx), Math.floor(wy), 913) > 0.95 ? 1 : 0), sx, sy);
      return 0.3;
    }
    default: {
      const tuft = k.hash2(Math.floor(wx * 1.2), Math.floor(wy * 1.2), 914);
      const gold = k.vn(wx / 40, wy / 40, 915) > 0.6 ? 1.2 : 0; // seeded to dead gold in drifts
      k.ramp(rp(WILDGRASS), 2.3 + (m - 0.5) * 2.2 + (n - 0.5) * 1.4 + gold + (tuft > 0.94 ? 1 : tuft < 0.05 ? -0.8 : 0) + (wet > 0.7 ? -0.6 : 0), sx, sy);
      return 0.45;
    }
  }
}

/** The pale granite cliffs' top pixel at world pixel (wx, wy): packed grey-bone rock, a few pits and flecks (keep in step with the cliff block). */
export function crownCliffTopPixel(wx: number, wy: number): RGB {
  const pit = hash(Math.floor(wx * 1.3), Math.floor(wy * 1.3), 862), n = vn(wx / 7, wy / 7, 861);
  let c: RGB = [0xa6, 0xa2, 0x9a];
  if (n > 0.62) c = [0x9a, 0x97, 0x92];
  if (pit < 0.08) c = [0xbe, 0xba, 0xb0]; else if (pit > 0.93) c = [0x7e, 0x7c, 0x78];
  return c;
}

/**
 * Recolours one pixel of the desert's sandstone cliff (desertArt.ts cliffTexture) into pale granite: weathered ashlar-ish
 * courses with a shadow line under each, rust-gold stains down the faces, a little wild green on the lit tops. `lum` is the
 * source pixel's brightness 0..1, (gx, gy) its art-pixel position in the texture, `v` the cliff variant.
 */
export function crownCliffPixel(lum: number, gx: number, gy: number, v: number): RGB {
  const wave = Math.sin(gx * 0.19 + v * 2) * 1.2 + Math.sin(gx * 0.07 + gy * 0.05) * 1.4, band = Math.floor((gy + wave) / 6), bk = hash(band, 5, 71);
  let t = cl(lum) * 0.9 + (bk - 0.5) * 0.1 + 0.12;
  if ((gy + wave) / 6 - band < 0.14) t -= 0.1;
  if (vn(gx * 0.5 + v * 7, gy * 0.06, 73) > 0.8 && lum < 0.62) t -= 0.1; // rain streaks
  let col = tone(PALEG, t, gx, gy);
  if (lum < 0.62 && vn(gx * 0.3 + v * 5, gy * 0.08, 75) > 0.84) col = mix(col, [168, 128, 70], 0.2); // iron-gold stains
  if (lum > 0.62 && vn(gx * 0.22 + v * 9, gy * 0.3, 77) + (hash(gx, gy, 78) - 0.5) * 0.2 > 0.6) col = mix(col, tone(WILD, 0.3 + lum * 0.45, gx, gy), 0.7); // a little growth on the tops
  return col;
}

// ---------- materials ----------

/**
 * White marble: a lit face with lazy gilt veins, grey veining, hairline cracks, rain streaks, and wild green creeping up from
 * the foot (`moss` 0..1 how much; also on up-facing surfaces). `fade` darkens (shaded or sunk parts).
 */
export function marbleAt(hit: Hit, seed: number, moss = 0.5, fade = 0, gold = true): RGB {
  const { sx, sy, lit, p, n } = hit, z = p[2];
  let t = 0.24 + lit * 0.7 + (vn(sx * 0.3, sy * 0.3, seed) - 0.5) * 0.16 - fade;
  const q1 = p[0] * 0.06 + z * 0.045, q2 = p[1] * 0.06 - z * 0.05;
  const w = vn(q1 + vn(q2 * 2.2, q1 * 2.2, seed + 9) * 1.5, q2, seed + 1), vein = Math.abs(w - 0.5);
  if (vein < 0.013 && gold) return tone(GOLDP, 0.32 + lit * 0.55 + (hash(sx, sy, seed + 2) - 0.5) * 0.2, sx, sy);
  if (vein < 0.045) t -= 0.1;
  if (Math.abs(vn(q1 * 2.9 + 3, q2 * 2.9, seed + 4) - 0.5) < 0.009) t -= 0.36; // hairline cracks
  if (vn((p[0] + p[1]) * 0.09 + 5, z * 0.42, seed + 3) > 0.78 && n[2] < 0.6) t -= 0.14; // rain streaks
  let col = tone(MARB, t, sx, sy);
  if (hash(sx, sy, seed + 5) < 0.025) col = tone(MARB, t - 0.22, sx, sy); // pitting
  const g = vn(sx * 0.16, sy * 0.2, seed + 6) + (hash(sx, sy, seed + 7) - 0.5) * 0.24 + Math.max(0, (7 - z) / 7) * 0.3 * moss + (n[2] > 0.62 ? 0.12 * moss : 0);
  if (g > 0.86 - moss * 0.34) col = mix(col, tone(WILD, 0.28 + lit * 0.55 - fade, sx, sy), 0.82);
  return col;
}
/** Pale granite masonry: courses of blocks of `bh` high, joints, weathering. */
export function graniteBlock(hit: Hit, seed: number, bh = 5, bw = 9, moss = 0.3, fade = 0): RGB {
  const { sx, sy, lit, p, n } = hit, z = p[2], u = hit.tag === 2 ? p[1] : p[0];
  const row = Math.floor(z / bh), off = (row & 1) * bw * 0.5, col0 = Math.floor((u + off + 200) / bw);
  const fz = z / bh - row, fu = (u + off + 200) / bw - col0;
  let t = 0.2 + lit * 0.72 + (hash(col0, row, seed) - 0.5) * 0.18 + (vn(sx * 0.35, sy * 0.35, seed + 1) - 0.5) * 0.18 - fade;
  if (fz < 0.1 && n[2] < 0.7) t -= 0.2; // joint under each course
  if ((fu < 0.05 || fu > 0.96) && n[2] < 0.7) t -= 0.16;
  if (hash(sx, sy, seed + 4) < 0.03) t += 0.2;
  let col = tone(PALEG, t, sx, sy);
  if (vn(u * 0.4 + 3, z * 0.06, seed + 6) > 0.8 && n[2] < 0.7) col = mix(col, [150, 116, 66], 0.3); // rust-gold stains
  const g = vn(sx * 0.15, sy * 0.2, seed + 7) + (hash(sx, sy, seed + 8) - 0.5) * 0.22 + Math.max(0, (6 - z) / 6) * 0.3 * moss;
  if (g > 0.88 - moss * 0.3) col = mix(col, tone(WILD, 0.25 + lit * 0.55 - fade, sx, sy), 0.8);
  return col;
}
const ironAt = (h: Hit, seed: number, extra = 0): RGB => tone(IRONP, 0.14 + h.lit * 0.7 + extra + (hash(h.sx, h.sy, seed) - 0.5) * 0.14, h.sx, h.sy);
const goldAt = (h: Hit, seed: number, extra = 0): RGB => tone(GOLDP, 0.22 + h.lit * 0.7 + extra + (hash(h.sx, h.sy, seed) - 0.5) * 0.16, h.sx, h.sy);

/** Fresh-broken stone: a rough, paler fracture surface at height z0 over an ellipse, edges jagged. */
function fracture(b: Bmp, ox: number, oy: number, cu: number, cv: number, z0: number, ru: number, rv: number, seed: number, jag = 1.4) {
  splat(b, ox, oy, (th, r) => [cu + Math.cos(th) * ru * r, cv + Math.sin(th) * rv * r, z0 + (vn(Math.cos(th) * r * 2 + seed, Math.sin(th) * r * 2, seed) - 0.5) * jag * 2], 0, Math.PI * 2, 120, 0, 1, 24, (h) => {
    const t = 0.55 + h.lit * 0.4 + (hash(h.sx, h.sy, seed + 3) - 0.5) * 0.3;
    return tone(MARB, t, h.sx, h.sy);
  }, 5);
}
const lump = (seed: number) => (th: number, ph: number) => 1 + (hash((th * 4) | 0, (ph * 4) | 0, seed) - 0.5) * 0.3;
/** A heap of broken marble and granite chips round a foot at (u, v). */
function chips(b: Bmp, ox: number, oy: number, R: () => number, n: number, cu: number, cv: number, spread: number, seed: number, marble = true) {
  for (let k = 0; k < n; k++) {
    const a = R() * 6.28, d = 6 + R() * spread, u = cu + Math.cos(a) * d, v = cv + Math.sin(a) * d * 0.8, sz = 1.3 + R() * 2.2;
    ellipsoid(b, ox, oy, [u, v, 0.6], [sz * 1.3, sz, sz * 0.7], (h) => (marble && k % 2 ? marbleAt(h, seed + k, 0.5) : graniteBlock(h, seed + k, 99, 99, 0.6)), lump(seed + k));
  }
}
/** Ivy and weed clumps at the foot: small dark-green mounds. */
function weeds(b: Bmp, ox: number, oy: number, R: () => number, n: number, cu: number, cv: number, spread: number, seed: number) {
  for (let k = 0; k < n; k++) {
    const a = R() * 6.28, d = 4 + R() * spread, u = cu + Math.cos(a) * d, v = cv + Math.sin(a) * d * 0.8, r = 1.6 + R() * 1.8;
    ellipsoid(b, ox, oy, [u, v, 0.4], [r * 1.4, r, r * 0.9], (h) => tone(WILD, 0.2 + h.lit * 0.75 + (hash(h.sx, h.sy, seed + k) - 0.5) * 0.3, h.sx, h.sy), lump(seed + k * 3));
  }
}
/** An ivy strand down a surface: a thin vine of leaf blobs from (u, v, z0) down by `len`. */
function ivy(b: Bmp, ox: number, oy: number, u: number, v: number, z0: number, len: number, seed: number) {
  const R = rnd(seed);
  for (let s = 0; s < len; s += 1.8) {
    const zz = z0 - s, du = Math.sin(s * 0.4 + seed) * 1.2;
    ellipsoid(b, ox, oy, [u + du + (R() - 0.5) * 1.6, v + (R() - 0.5) * 0.8, zz], [1.1 + R() * 0.7, 0.8, 1], (h) => tone(WILD, 0.18 + h.lit * 0.8 + (hash(h.sx, h.sy, seed) - 0.5) * 0.3, h.sx, h.sy));
  }
}

// ---------- the statue ----------

/**
 * A broken statue of a crowned king or knight (STATUE, solid), a marble figure on a stepped plinth with a gilt band, cracked,
 * veined with gold, wild green climbing it. Variants: 0 the king upright with his sword point-down, crown on, a hand lost;
 * 1 a headless knight with a shield, his head and crown at his feet; 2 snapped at the waist, the torso toppled beside it;
 * 3 only the robe's skirt and a stump of sword left, an ivy-choked plinth. Origin = tile centre.
 */
export function paintStatue(v: number): Sprite {
  const seed = 400 + v * 17, R = rnd(seed), W = 88, ox = 44, oy = 96, b = new Bmp(W, 120);
  shadow(b, ox, oy, 0, 2, 19, 11, 120);
  // plinth: a base slab, a die with a gilt band, a cap; a chipped corner
  const chip = (h: Hit, s: number) => (vn(h.sx * 0.45, h.sy * 0.45, s) > 0.8 && (Math.abs(h.p[0]) > 7.4 || Math.abs(h.p[1]) > 7.4) ? null : undefined);
  box(b, ox, oy, -10.8, 10.8, -10.8, 10.8, 0, 3, (h) => (chip(h, seed + 1) === null ? null : marbleAt(h, seed + 2, 0.7, 0.0)));
  box(b, ox, oy, -8.2, 8.2, -8.2, 8.2, 3, 10.4, (h) => {
    if (h.tag !== 0 && Math.abs(h.p[2] - 7) < 0.8) return goldAt(h, seed + 3, h.lit * 0.1);
    return marbleAt(h, seed + 4, 0.55, -0.04);
  });
  box(b, ox, oy, -9.2, 9.2, -9.2, 9.2, 10.4, 12.2, (h) => (chip(h, seed + 5) === null ? null : marbleAt(h, seed + 6, 0.15, -0.04)));
  const Z0 = 12.2, S = 1.32;
  // figure-local helpers: coordinates and radii are scaled by S and stand on the plinth
  const fp = (x: number, y: number, z: number): V3 => [x * S, y * S, Z0 + z * S];
  const fE = (c: V3, r: V3, m: (h: Hit) => RGB | null | undefined, rough?: (th: number, ph: number) => number) => ellipsoid(b, ox, oy, fp(...c), [r[0] * S, r[1] * S, r[2] * S], m, rough);
  const fR = (p0: V3, p1: V3, r: number, m: (h: Hit) => RGB | null | undefined, knob = 0) => rod(b, ox, oy, fp(...p0), fp(...p1), r * S, m, knob);
  const stone = (h: Hit, s: number) => marbleAt(h, s, 0.25, -0.1);
  const jag = (u: number, w: number, s: number) => (vn(u * 0.6 + s, w * 0.6, s) - 0.5) * 4;
  const crown = (cx: number, cy: number, cz: number, broken: boolean) => {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 6.28, px = cx + Math.cos(a) * 3.1, py = cy + Math.sin(a) * 3.1;
      fE([px, py, cz], [1, 1, 0.9], (h) => goldAt(h, seed + 30));
      if (i % 3 === 0 && !(broken && i === 3)) fR([px, py, cz + 0.4], [px, py, cz + 3.4], 0.65, (h) => goldAt(h, seed + 31, 0.08), 1);
    }
  };
  const sword = (cx: number, cy: number, top: number, bot: number) => {
    fR([cx, cy, top], [cx, cy, bot], 0.9, (h) => (hash(h.sx, h.sy, seed + 8) < 0.05 ? marbleAt(h, seed + 9, 0.2) : tone(MARB, 0.4 + h.lit * 0.6, h.sx, h.sy)), 0.4);
    fR([cx - 3.4, cy + 3.4, top - 0.4], [cx + 3.4, cy - 3.4, top - 0.4], 0.85, (h) => goldAt(h, seed + 10), 1);
    fE([cx, cy, top + 2.2], [1.2, 1.2, 1.3], (h) => goldAt(h, seed + 11));
  };
  const L = (s: number): [number, number] => [-0.7 * s, 0.7 * s]; // the figure's left-right axis on the ground plane
  if (v < 3) {
    const cut = v === 2 ? 25 + R() * 2 : 99;
    // robe / mail skirt (flares at the hem), torso, chest, cloak behind
    fE([0, 0, 11], [6, 5.4, 11.6], (h) => ((h.p[2] - Z0) / S > cut + jag(h.p[0], h.p[1], seed) ? null : h.p[2] < Z0 ? null : stone(h, seed + 12)), (th, ph) => 1 + Math.sin(th * 7) * 0.05 + (ph < 0 ? 0.08 : 0));
    if (v === 2) {
      fractureAt(b, ox, oy, fp(0, 0, cut), 5.6 * S, 5 * S, seed + 13);
      // the torso, head and crown toppled beside the plinth
      ellipsoid(b, ox, oy, [10, 17, 4.6], [5.8, 8.4, 4.6], (h) => stone(h, seed + 14), lump(seed + 15));
      ellipsoid(b, ox, oy, [11, 27, 4], [3.6, 3.6, 3.4], (h) => stone(h, seed + 16));
      for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.28; ellipsoid(b, ox, oy, [11 + Math.cos(a) * 3.8, 27 + Math.sin(a) * 3.8, 7], [1.1, 1.1, 1], (h) => goldAt(h, seed + 32)); }
      rod(b, ox, oy, [4, 20, 3.2], [-1, 14, 4.6], 2.2, (h) => stone(h, seed + 17), 0.5);
    } else {
      fE([-1.8, -1.8, 24], [4.4, 3.9, 9.4], (h) => marbleAt(h, seed + 18, 0.3, 0.02)); // cloak
      fE([0.6, 0.6, 22.4], [5, 4.3, 7.8], (h) => stone(h, seed + 19));
      for (const sg of [-1, 1]) {
        const [lu, lv] = L(sg);
        fE([lu * 6, lv * 6, 28], [3.1, 3.1, 2.8], (h) => stone(h, seed + 20 + sg));
        fR([lu * 6, lv * 6, 27.4], [2 + lu * 3, 2 + lv * 3, 17.5], 2.1, (h) => stone(h, seed + 22 + sg), 0.3);
      }
      fE([3, 3, 16.6], [2, 2, 1.8], (h) => stone(h, seed + 24)); // hands
      if (v === 0) {
        sword(3, 3, 18.8, -0.4);
        fE([0.6, 0.6, 30.2], [2.8, 2.8, 2.2], (h) => stone(h, seed + 25)); // neck / gorget
        fE([1, 1, 34.8], [3.6, 3.4, 4.2], (h) => stone(h, seed + 26)); // head
        crown(1, 1, 37.8, false);
      } else {
        // a headless knight: the neck snapped, a shield on the left arm, the head on the ground
        fR([0.8, 0.8, 29], [0.9, 0.9, 31 + R()], 2.1, (h) => stone(h, seed + 27));
        fractureAt(b, ox, oy, fp(0.9, 0.9, 32), 2.2 * S, 2 * S, seed + 28);
        const [lu, lv] = L(-1), su = lu * 8, sv = lv * 8;
        box(b, ox, oy, su * S - 1.6, su * S + 1.6, sv * S - 1.6, sv * S + 1.6, Z0 + 8 * S, Z0 + 27 * S, (h) => {
          if (h.tag === 0) return stone(h, seed + 29);
          const cu = h.tag === 1 ? h.p[0] - su * S : h.p[1] - sv * S, cz = h.p[2] - (Z0 + 17.5 * S);
          if (Math.hypot(cu * 1.1, cz * 0.75) < 2.8) return goldAt(h, seed + 40); // a gilt boss
          return stone(h, seed + 30);
        });
        ellipsoid(b, ox, oy, [13, 9, 4], [3.6, 3.6, 3.4], (h) => stone(h, seed + 31)); // the head on the ground
        for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.28; ellipsoid(b, ox, oy, [13 + Math.cos(a) * 3.8, 9 + Math.sin(a) * 3.8, 3.8], [1.1, 1.1, 1], (h) => goldAt(h, seed + 33)); }
      }
    }
  } else {
    // 3: skirt and a sword stump; the plinth swallowed by ivy
    const cut = 8 + R() * 3;
    fE([0, 0, cut * 0.5], [6, 5.4, cut * 0.5 + 1], (h) => (((h.p[2] - Z0) / S > cut + jag(h.p[0], h.p[1], seed) || h.p[2] < Z0) ? null : stone(h, seed + 12)), (th) => 1 + Math.sin(th * 7) * 0.05);
    fractureAt(b, ox, oy, fp(0, 0, cut), 5.6 * S, 5 * S, seed + 13);
    sword(3, 3, 9, -0.4);
    rod(b, ox, oy, [-10, 13, 1.6], [3, 18, 3], 1.8, (h) => stone(h, seed + 50), 0.4); // the lost half of the sword on the ground
    ellipsoid(b, ox, oy, [-4, -14, 3.4], [4.6, 5.8, 3.2], (h) => stone(h, seed + 51), lump(seed + 52));
  }
  // growth: ivy strands down the plinth and the figure, weeds and chips round the foot
  ivy(b, ox, oy, -5 + R() * 4, 8.4, 12, 9 + R() * 4, seed + 60);
  ivy(b, ox, oy, 8.4, 3 + R() * 3, 11, 8, seed + 61);
  if (v < 2) ivy(b, ox, oy, 3.5, 4.4, Z0 + 18 * S, 7 + R() * 4, seed + 62);
  weedsSmall(b, ox, oy, R, 4, 0, 0, 11, seed + 70);
  chips(b, ox, oy, R, v === 3 ? 6 : 3, 0, 0, 8, seed + 80);
  b.depthEdges(4, 0.62);
  b.outline(0.4);
  return { b, ox, oy };
}
/** A fracture disc at a point (see `fracture`). */
function fractureAt(b: Bmp, ox: number, oy: number, c: V3, ru: number, rv: number, seed: number) { fracture(b, ox, oy, c[0], c[1], c[2], ru, rv, seed, 0.9); }
/** Smaller, flatter weed clumps than `weeds`. */
function weedsSmall(b: Bmp, ox: number, oy: number, R: () => number, n: number, cu: number, cv: number, spread: number, seed: number) {
  for (let k = 0; k < n; k++) {
    const a = R() * 6.28, d = 8 + R() * spread, u = cu + Math.cos(a) * d, v = cv + Math.sin(a) * d * 0.8, r = 1 + R() * 1.1;
    ellipsoid(b, ox, oy, [u, v, 0.3], [r * 1.4, r, r * 0.7], (h) => tone(WILD, 0.2 + h.lit * 0.75 + (hash(h.sx, h.sy, seed + k) - 0.5) * 0.3, h.sx, h.sy), lump(seed + k * 3));
  }
}

// ---------- the spire ----------

/**
 * A snapped spire of pale granite (SPIRE, solid): a tapering square tower of ashlar courses with lancet slits, a gold-stained
 * string course, the top shattered along a diagonal fracture, fallen masonry and ivy at the foot. Variants: 0 tall and
 * snapped high, 1 a stump with the broken top lying beside it, 2 mid height with a lancet window and heavy ivy,
 * 3 a leaning-crack tall shaft with a corbelled ledge. Origin = tile centre.
 */
export function paintSpire(v: number): Sprite {
  const seed = 500 + v * 19, R = rnd(seed), W = 92, ox = 46;
  const H = [66, 38, 52, 74][v % 4], oy = Math.ceil(H) + 26, b = new Bmp(W, oy + 22);
  const w0 = 8.6, w1 = 4.4; // half-width at the foot and at the (unbroken) top z = 80
  const wAt = (z: number) => w0 + (w1 - w0) * Math.min(1, z / 80);
  const zb = (u: number, w: number) => H + (u - w) * (v === 3 ? 0.45 : 0.35) + (vn(u * 0.4 + seed, w * 0.4, seed) - 0.5) * 6;
  shadow(b, ox, oy, 0, 3, 18, 10, 120);
  // plinth course: a wider base of three steps
  box(b, ox, oy, -11, 11, -11, 11, 0, 2.6, (h) => graniteBlock(h, seed + 1, 99, 9, 0.9, 0.05));
  box(b, ox, oy, -9.6, 9.6, -9.6, 9.6, 2.6, 5, (h) => graniteBlock(h, seed + 2, 99, 9, 0.6));
  const ZS = 5;
  // the two visible faces of the tower, broken along zb
  const face = (side: 0 | 1) => splat(b, ox, oy, (a, z) => {
    const w = wAt(z);
    return side === 0 ? [a * w, w, z] : [w, a * w, z];
  }, -1, 1, 70, ZS, 80, 300, (h) => {
    const [pu, pv, z] = h.p, u = side === 0 ? pu : pv, w = wAt(z);
    if (z > zb(side === 0 ? pu : w, side === 0 ? w : pv)) return null;
    // lancet slits
    const sl = (zz: number, uu: number) => Math.abs(u - uu) < 1.05 && z > zz && z < zz + 8 - Math.abs(u - uu) * 3.2;
    if (sl(22, 0) || (v !== 1 && sl(42, 0)) || (v === 2 && sl(34, 0.2) && false)) return tone(PALEG, 0.0 + (z - 22) * 0.002, h.sx, h.sy);
    // a gilt-stained string course
    if (z > 30.5 && z < 32.4) { const t = 0.35 + h.lit * 0.5; return mix(tone(PALEG, t, h.sx, h.sy), tone(GOLDP, 0.3 + h.lit * 0.5, h.sx, h.sy), 0.4); }
    const hh = { ...h, tag: side === 0 ? 1 : 2 };
    return graniteBlock(hh, seed + 3 + side, 5.2, 8.8, 0.45 + (v === 2 ? 0.45 : 0), side === 1 ? 0 : 0);
  }, 0, true);
  face(0); face(1);
  // the fracture across the top
  splat(b, ox, oy, (a, c) => {
    const u = a * 1, w = c * 1, z = zb(u, w);
    return [u, w, z];
  }, -w0, w0, 60, -w0, w0, 60, (h) => {
    const [u, w, z] = h.p, hw = wAt(z) - 0.4;
    if (Math.abs(u) > hw || Math.abs(w) > hw) return null;
    // hollow inside: the masonry is a shell, a dark core visible down the break
    if (Math.abs(u) < hw - 2.2 && Math.abs(w) < hw - 2.2) return tone(PALEG, 0.04 + h.lit * 0.2 + (hash(h.sx, h.sy, seed + 9) - 0.5) * 0.1, h.sx, h.sy);
    return tone(PALEG, 0.55 + h.lit * 0.4 + (hash(h.sx, h.sy, seed + 10) - 0.5) * 0.3, h.sx, h.sy);
  }, 3, false);
  if (v === 3) { // a corbelled ledge half-way up, a cracked band
    box(b, ox, oy, -wAt(46) - 1.6, wAt(46) + 1.6, -wAt(46) - 1.6, wAt(46) + 1.6, 44, 47, (h) => graniteBlock(h, seed + 11, 99, 9, 0.3));
  }
  // fallen masonry and, for the stump, the lopped top lying on the ground
  if (v === 1) {
    box(b, ox, oy, 6, 14, 11, 16, 0, 6.5, (h) => graniteBlock(h, seed + 12, 4.5, 6, 0.5));
    rod(b, ox, oy, [-14, 12, 3.2], [-3, 18, 3.4], 3.4, (h) => graniteBlock({ ...h, tag: 1 }, seed + 13, 4.5, 8, 0.6), 0.2);
  }
  for (let k = 0; k < 7; k++) {
    const a = R() * 6.28, d = 10 + R() * 11, u = Math.cos(a) * d, w = Math.sin(a) * d * 0.8, sz = 1.4 + R() * 2.4;
    ellipsoid(b, ox, oy, [u, w, 0.7], [sz * 1.4, sz, sz * 0.8], (h) => graniteBlock({ ...h, tag: 1 }, seed + 20 + k, 99, 99, 0.7), lump(seed + 20 + k));
  }
  ivy(b, ox, oy, 4 + R() * 3, wAt(10) + 0.3, 24 + R() * 8, 16 + R() * 8, seed + 30);
  ivy(b, ox, oy, wAt(10) + 0.3, -2 + R() * 4, 20, 14 + R() * 6, seed + 31);
  if (v === 2) { ivy(b, ox, oy, -4, wAt(10) + 0.3, 38, 30, seed + 32); ivy(b, ox, oy, wAt(10) + 0.3, 4, 36, 26, seed + 33); }
  weeds(b, ox, oy, R, 5, 0, 0, 12, seed + 40);
  b.depthEdges(4, 0.62);
  b.outline(0.4);
  return { b, ox, oy };
}

// ---------- the brazier ----------

export const BRAZIER_FRAMES = 6;
const brazierBase = new Map<number, Bmp>();
const BRZ = { ox: 36, oy: 66, w: 72, h: 86 };
/**
 * An iron brazier of the old court (BRAZIER, solid): three scrolled iron legs on a worn granite drum, a riveted bowl with a
 * studded rim, heaped coals, and a fire that never went out. Animated, `f` of `N` frames (a seamless loop); the fire
 * throws a pool of warm light on the ground. Origin = tile centre.
 */
export function paintBrazier(v: number, f: number, N: number): Sprite {
  const ox = BRZ.ox, oy = BRZ.oy;
  let base = brazierBase.get(v);
  if (!base) {
    const seed = 600 + v * 13, b = new Bmp(BRZ.w, BRZ.h), R = rnd(seed);
    shadow(b, ox, oy, 0, 2, 16, 9, 120);
    // the drum: two stepped courses of pale granite with a gilt ring
    box(b, ox, oy, -9, 9, -9, 9, 0, 2.8, (h) => graniteBlock(h, seed + 1, 99, 8, 0.8, 0.04));
    box(b, ox, oy, -7, 7, -7, 7, 2.8, 8, (h) => (h.tag !== 0 && Math.abs(h.p[2] - 5.6) < 0.6 ? goldAt(h, seed + 2, 0.05) : graniteBlock(h, seed + 3, 5.2, 7, 0.4)));
    box(b, ox, oy, -8, 8, -8, 8, 8, 9.6, (h) => graniteBlock(h, seed + 4, 99, 8, 0.1));
    // three scrolled legs from the drum up to the bowl: out then in
    const legs: [number, number][] = [[-5.2, 4.6], [5.4, 4.6], [0, -6.4]];
    for (const [lu, lv] of legs) {
      const p0: V3 = [lu, lv, 9.2], p1: V3 = [lu * 1.3, lv * 1.3, 13], p2: V3 = [lu * 0.95, lv * 0.95, 19];
      rod(b, ox, oy, p0, p1, 1.1, (h) => ironAt(h, seed + 5), 0.5);
      rod(b, ox, oy, p1, p2, 1.0, (h) => ironAt(h, seed + 6), 0.4);
      ellipsoid(b, ox, oy, [lu * 1.5, lv * 1.5, 12.4], [1.3, 1.3, 1.3], (h) => ironAt(h, seed + 7)); // a scroll boss
    }
    // a bowl: the lower half of a sphere, riveted bands, a studded rim; the inside seen from above is dark with coals
    const BC = 24, BR = 10.4;
    ellipsoid(b, ox, oy, [0, 0, BC], [BR, BR, 8.4], (h) => {
      if (h.p[2] > BC + 0.4) return null;
      const z = h.p[2] - BC, band = Math.abs(((z + 20) % 3.6) - 1.8) < 0.3;
      if (band) return ironAt(h, seed + 8, 0.2);
      const rivet = hash(Math.round(h.p[0] * 0.8), Math.round(h.p[1] * 0.8) + Math.round(z), seed + 9) < 0.06;
      return ironAt(h, seed + 10, rivet ? 0.35 : 0);
    });
    // rim: a ring of short rods
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * 6.28, a2 = ((i + 1) / 20) * 6.28;
      rod(b, ox, oy, [Math.cos(a) * BR, Math.sin(a) * BR, BC + 0.4], [Math.cos(a2) * BR, Math.sin(a2) * BR, BC + 0.4], 0.95, (h) => ironAt(h, seed + 11, 0.12));
      if (i % 2 === 0) ellipsoid(b, ox, oy, [Math.cos(a) * (BR + 0.3), Math.sin(a) * (BR + 0.3), BC + 0.5], [0.9, 0.9, 0.9], (h) => goldAt(h, seed + 12, -0.1));
    }
    // coals: a glowing heap inside the bowl
    splat(b, ox, oy, (th, r) => [Math.cos(th) * (BR - 1) * r, Math.sin(th) * (BR - 1) * r, BC - 1.4 + (1 - r * r) * 2.6 + (vn(Math.cos(th) * r * 3, Math.sin(th) * r * 3, seed + 14) - 0.5) * 1.4], 0, Math.PI * 2, 150, 0, 1, 30, (h) => {
      const g = vn(h.sx * 0.45, h.sy * 0.5, seed + 15) + (hash(h.sx, h.sy, seed + 16) - 0.5) * 0.4;
      return tone(FLAME, 0.15 + g * 0.5 + (1 - Math.hypot(h.p[0], h.p[1]) / BR) * 0.2, h.sx, h.sy);
    }, 4, false);
    // wild creeper at the drum
    weeds(b, ox, oy, R, 4, 0, 0, 7, seed + 20);
    b.depthEdges(4, 0.62);
    b.outline(0.4);
    brazierBase.set(v, base = b);
  }
  const b = base.clone();
  const ph = (f / N) * Math.PI * 2, BC = 24;
  // light on the ground: a dithered warm pool (alpha) under everything
  const cx = ox, cy = oy + 2;
  for (let y = cy - 18; y < cy + 20; y++) for (let x = cx - 40; x < cx + 40; x++) {
    const d = Math.hypot((x - cx) / 38, (y - cy) / 18);
    if (d >= 1) continue;
    const k = (1 - d) * (0.62 + 0.12 * Math.sin(ph));
    if (BAYER[(y & 3) * 4 + (x & 3)] < k * 0.55) b.put(x, y, FLAME[2], -1e8, 46);
  }
  // the fire: tongues of fire from the coals, each a chain of shrinking ellipsoids swaying with its own phase
  const nT = 6;
  for (let i = 0; i < nT; i++) {
    const a0 = (i / nT) * 6.28 + 0.4, rr = i === 0 ? 0 : 4.2, bu = Math.cos(a0) * rr, bv = Math.sin(a0) * rr;
    const hgt = (i === 0 ? 20 : 11) + (i === 0 ? 3 : 4) * Math.sin(ph + i * 1.9) + (i % 2) * 2.5;
    const sway = 1.8 + (i === 0 ? 0.6 : 1.3);
    const steps = 6;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, k = 1 - t * 0.8;
      const px = bu + Math.sin(ph + i * 2.1 + t * 2.4) * sway * t + (i === 0 ? 0 : Math.cos(a0) * t * 1.4);
      const py = bv + Math.cos(ph * 1 + i * 1.3 + t * 2) * sway * 0.6 * t + (i === 0 ? 0 : Math.sin(a0) * t * 1.4);
      const rad = (i === 0 ? 4.6 : 3.2) * k + 0.4;
      ellipsoid(b, ox, oy, [px, py, BC + 0.4 + hgt * t], [rad, rad, rad * 1.5 + 1], (h) => {
        const core = 1 - Math.hypot(h.p[0] - px, h.p[1] - py) / (rad + 0.2);
        const q = 0.62 - t * 0.42 + core * 0.32 + (hash(h.sx, h.sy, 77 + f) - 0.5) * 0.14;
        if (t > 0.86 && hash(h.sx, h.sy, 78 + f + i) < 0.4) return null; // frayed tips
        return tone(FLAME, q, h.sx, h.sy);
      });
    }
  }
  // sparks
  for (let k = 0; k < 7; k++) {
    const life = (f / N + hash(k, 1, 611)) % 1, a = (hash(k, 2, 611) - 0.5) * 8, x = Math.round(ox + a + Math.sin(life * 6 + k) * 3), y = Math.round(oy - BC - 4 - life * (22 + hash(k, 3, 611) * 12));
    b.put(x, y, FLAME[life < 0.5 ? 6 : life < 0.8 ? 5 : 4], 1e6, life < 0.85 ? 255 : 140);
  }
  return { b, ox, oy };
}

// ---------- the Crownway gates ----------

export const GATE_W = 150, GATE_H = 150, GATE_OX = 75, GATE_OY = 118;
const gateBase = new Map<string, Bmp>();
const GP = 27, GHW = 8.2, GGAP = GP - GHW, GSP = 38, GAR = GGAP, GZ0 = 6; // pillar centre, half-width, opening half-width, springing height, arch radius, opening floor
const GFV = 7.2; // the front face (v)
/** The ground a homeland's gate stands in (its ramp, and a tuft ramp), for the patch round the dais on the homeland side. */
const HOME_GROUND: Record<CrownFrom, { a: RGB[]; b: RGB[] }> = {
  oakvale: { a: pal(["#161f12", "#26361c", "#3a522a", "#4f6c36", "#678a44"]), b: pal(["#2a2216", "#3e3220", "#54442c", "#6c5a3a"]) },
  moors: { a: pal(["#22202c", "#322e40", "#463e58", "#5c5272", "#74688c"]), b: pal(["#14120f", "#241f1a", "#38312a", "#4e453a"]) },
  badlands: { a: pal(["#3e2016", "#58301f", "#744128", "#925436", "#b06a44"]), b: pal(["#4a3a34", "#625047", "#7a665a", "#927c6c"]) },
  sinkholes: { a: pal(["#17241a", "#25382a", "#36502e", "#4a6a38", "#628848"]), b: pal(["#251810", "#3a281a", "#52392a", "#6c4c34"]) },
  sunscar: { a: pal(["#4a3a26", "#6e5a3c", "#947c58", "#b89a72", "#d4b88c"]), b: pal(["#5a4430", "#7e6244", "#a08060", "#c2a47c"]) },
};

/** Where the broken crown on the keystone is, in the gate's (u, z) plane: shape test for a pixel, the returned shade 0..1 (gold lightness) or -1 outside. */
function crownShape(u: number, z: number, z0: number): number {
  const lu = u + 0.2, band = Math.abs(lu) <= 7.4 && z >= z0 && z <= z0 + 3.6;
  if (band) return 0.5 + (z - z0) / 3.6 * 0.35 - (Math.abs(lu) > 6.2 ? 0.2 : 0);
  // points: left whole with a ball, centre tall, right snapped to a jagged stub
  const pts: [number, number, number][] = [[-5.6, 6.6, 0], [0, 9.2, 0], [5.6, 3.1, 1]];
  for (const [pu, ph, br] of pts) {
    const t = (z - (z0 + 3.6)) / ph;
    if (t >= 0 && t <= 1 && Math.abs(lu - pu) < 1.9 * (1 - t) + 0.25) return 0.62 + t * 0.2 - (br ? 0.1 : 0);
    if (!br && Math.abs(lu - pu) < 1.05 && Math.hypot(lu - pu, z - (z0 + 3.6 + ph + 0.8)) < 1.25) return 0.95; // a ball finial
  }
  return -1;
}

/** The still part of a Crownway gate, `side` "crown" (a marble dais on the Crown's rim) or "home" (the homeland end, the same arch half sunk in the homeland's ground). */
function gateStatic(from: CrownFrom, side: "crown" | "home", awake: boolean): Bmp {
  const key = `${from}_${side}_${awake ? 1 : 0}`, have = gateBase.get(key);
  if (have) return have;
  const home = side === "home", seed = 700 + ["oakvale", "moors", "badlands", "sinkholes", "sunscar"].indexOf(from) * 11 + (home ? 5 : 0);
  const b = new Bmp(GATE_W, GATE_H), ox = GATE_OX, oy = GATE_OY, R = rnd(seed), acc = HOME_ACCENT[from], gp = HOME_GROUND[from];
  // the ground: on the Crown's side flagstones of grey paving going wild; on the homeland side that land's own ground
  splat(b, ox, oy, (u, w) => [u, w, 0], -68, 68, 280, -38, 50, 170, (h) => {
    const [u, w] = h.p, d = Math.hypot(u / 68, (w - 6) / 40) + (vn(u * 0.07, w * 0.1, seed) - 0.5) * 0.5;
    if (d > 1 || (d > 0.78 && BAYER[(h.sy & 3) * 4 + (h.sx & 3)] > (1 - d) * 4.5)) return null;
    const n = vn(u * 0.2, w * 0.25, seed + 1);
    if (home) {
      let col = tone(gp.a, 0.3 + n * 0.55, h.sx, h.sy);
      if (vn(u * 0.1 + 5, w * 0.13, seed + 2) > 0.58) col = tone(gp.b, 0.25 + n * 0.5, h.sx, h.sy);
      return hash(h.sx, h.sy, seed + 3) < 0.04 ? tone(gp.a, 0.85, h.sx, h.sy) : col;
    }
    const cu = Math.floor((u + 100) / 14), cw = Math.floor((w + 100) / 14);
    const fu = ((u + 100) / 14) % 1, fw = ((w + 100) / 14) % 1;
    if (fu < 0.07 || fw < 0.09) return tone(SLAB, 0.2, h.sx, h.sy);
    let col = tone(SLAB, 0.4 + (hash(cu, cw, seed + 4) - 0.5) * 0.4 + n * 0.3, h.sx, h.sy);
    if (vn(u * 0.1 + 9, w * 0.13, seed + 5) > 0.64) col = tone(WILD, 0.25 + n * 0.5, h.sx, h.sy);
    return col;
  }, 0, false);
  shadow(b, ox, oy, 0, 4, 60, 27, 110);
  // the dais: two marble steps, gilt border inlay, wild green in the cracks (more of it, sunk and soiled, at the homeland end)
  const slab = (h: Hit, sd: number, top: number) => {
    const [u, w] = h.p;
    if (h.tag === 0) {
      const eu = Math.min(u - (top === 1 ? -50 : -41), (top === 1 ? 50 : 41) - u), ew = Math.min(w - (top === 1 ? -18 : -12), (top === 1 ? 20 : 13) - w), e = Math.min(eu, ew);
      if (e > 2.4 && e < 3.6) return goldAt(h, sd, 0.05); // the gilt inlay line
      const fu = ((u + 200) * 0.09) % 1, fw = ((w + 200) * 0.14 + Math.floor((u + 200) * 0.09) * 0.37) % 1;
      if (fu < 0.05 || fw < 0.08) return tone(MARB, 0.14, h.sx, h.sy);
      const g = vn(u * 0.09, w * 0.12, sd + 3) + (home ? 0.16 : 0) + (e < 4 ? 0.12 : 0);
      if (g > 0.74) return tone(WILD, 0.12 + h.lit * 0.38, h.sx, h.sy);
      return marbleAt(h, sd + Math.floor((u + 200) * 0.09) * 3, 0.2 + (home ? 0.4 : 0), 0.02);
    }
    return marbleAt(h, sd + 7, 0.65, 0.04);
  };
  box(b, ox, oy, -50, 50, -18, 20, 0, 3.4, (h) => slab(h, seed + 10, 1));
  box(b, ox, oy, -41, 41, -12, 13, 3.4, GZ0, (h) => slab(h, seed + 20, 2));
  // pillars: a moulded plinth, a fluted shaft that tapers a little, a gilt collar and a carved capital
  const pillar = (cu: number, sd: number, broken: number) => {
    box(b, ox, oy, cu - GHW - 1.6, cu + GHW + 1.6, -GHW * 0.85 - 1.6, GHW * 0.85 + 1.6, GZ0, GZ0 + 4.4, (h) => graniteBlock(h, sd + 1, 99, 9, 0.35));
    const H = 66 - broken;
    splat(b, ox, oy, (th, t) => {
      const sc = 1 - t * 0.09, cs = Math.cos(th), sn = Math.sin(th), p = 2 / 4;
      return [cu + GHW * sc * Math.sign(cs) * Math.pow(Math.abs(cs), p), GHW * 0.85 * sc * Math.sign(sn) * Math.pow(Math.abs(sn), p), GZ0 + 4.4 + (H - GZ0 - 4.4 - 6) * t];
    }, 0, Math.PI * 2, 260, 0, 1, 190, (h) => {
      const fl = Math.cos(Math.atan2(h.p[1] / 0.85, h.p[0] - cu) * 9);
      let c = marbleAt(h, sd + 2, 0.35, -0.12);
      if (fl < -0.6 && h.n[2] < 0.7) c = tone(MARB, 0.22 + h.lit * 0.42, h.sx, h.sy); // the flutes
      return c;
    }, 0, true);
    // gilt collar and capital
    box(b, ox, oy, cu - GHW - 0.4, cu + GHW + 0.4, -GHW * 0.85 - 0.4, GHW * 0.85 + 0.4, H - 6, H - 4.2, (h) => goldAt(h, sd + 3, 0.04));
    box(b, ox, oy, cu - GHW - 2.6, cu + GHW + 2.6, -GHW * 0.85 - 2.6, GHW * 0.85 + 2.6, H - 4.2, H, (h) => graniteBlock(h, sd + 4, 99, 9, 0.1));
  };
  pillar(-GP, seed + 30, 0);
  pillar(GP, seed + 40, 0);
  // the arch: front face voussoirs and spandrels, the tunnel under it, a cornice on top
  const FACE = GSP + GAR + 7; // the top of the wall above the arch
  const ZTOP = 72;
  // spandrels and voussoirs on the front face (v = GFV)
  splat(b, ox, oy, (u, z) => [u, GFV, z], -GP - GHW, GP + GHW, 200, GSP - 0.6, ZTOP - 3.4, 140, (h) => {
    const u = h.p[0], z = h.p[2], r = Math.hypot(u, z - GSP);
    if (r < GAR - 0.2 && z >= GSP - 0.4) return null;
    if (Math.abs(u) > GP + GHW) return null;
    if (r < GAR + 0.9) return goldAt(h, seed + 50, 0.1); // gilt inner moulding
    if (r < GAR + 7) { // voussoirs: radial blocks
      const ang = Math.atan2(z - GSP, u), blk = Math.floor(ang / (Math.PI / 11)), e = ang / (Math.PI / 11) - blk;
      let c = tone(MARB, 0.28 + h.lit * 0.5 + (hash(blk, 1, seed) - 0.5) * 0.2 + (vn(h.sx * 0.3, h.sy * 0.3, seed + 51) - 0.5) * 0.14, h.sx, h.sy);
      if (e < 0.07 || e > 0.94) c = tone(MARB, 0.1, h.sx, h.sy);
      if (r > GAR + 5.6 && r < GAR + 6.5) c = goldAt(h, seed + 52, -0.1);
      if (hash(h.sx, h.sy, seed + 53) < 0.03) c = tone(MARB, 0.62, h.sx, h.sy);
      return c;
    }
    // spandrel panels of dressed granite with a carved wreath ring and a gilt dot
    let c = graniteBlock({ ...h, tag: 1 }, seed + 54, 6, 10, 0.25 + (home ? 0.2 : 0));
    const cu = Math.sign(u) * (GAR + 13.5), cz = GSP + GAR + 5.6, rr = Math.hypot(u - cu, (z - cz) * 1.1);
    if (rr < 1.4) c = goldAt(h, seed + 55, 0.1); else if (rr > 3.2 && rr < 4.2) c = tone(PALEG, 0.1 + h.lit * 0.3, h.sx, h.sy);
    return c;
  }, 1, true);
  // the intrados: the underside of the arch, dark and carved with gilt rosettes
  splat(b, ox, oy, (th, w) => [Math.cos(th) * (GAR - 0.2), -GFV + w * GFV * 2, GSP + Math.sin(th) * (GAR - 0.2)], 0, Math.PI, 90, 0, 1, 20, (h) => {
    const r = h.a / Math.PI, rose = Math.abs(((r * 9) % 1) - 0.5) < 0.12 && Math.abs(h.c - 0.5) < 0.12;
    if (rose) return tone(GOLDP, 0.45 + h.lit * 0.4, h.sx, h.sy);
    return tone(MARB, 0.1 + h.lit * 0.34 + (hash(h.sx, h.sy, seed + 56) - 0.5) * 0.1, h.sx, h.sy);
  }, 1, true);
  // the cornice course, the carved frieze below it, a pediment step in the middle for the crown
  box(b, ox, oy, -GP - GHW - 2.6, GP + GHW + 2.6, -GFV - 1.6, GFV + 1.4, ZTOP - 3.4, ZTOP, (h) => graniteBlock(h, seed + 57, 99, 11, 0.12));
  box(b, ox, oy, -GP - GHW - 1.4, GP + GHW + 1.4, -GFV - 0.6, GFV + 2.2, ZTOP - 5.2, ZTOP - 3.4, (h) => (h.tag !== 0 ? goldAt(h, seed + 58, -0.02) : graniteBlock(h, seed + 59, 99, 9, 0.1)));
  // the keystone, a tall carved block over the arch with the crown broken on it
  const KZ = GSP + GAR;
  box(b, ox, oy, -5.4, 5.4, -GFV - 0.4, GFV + 1.8, KZ - 6.6, KZ + 4.6, (h) => (h.tag === 1 ? marbleAt(h, seed + 60, 0.1, 0, false) : marbleAt(h, seed + 61, 0.1, 0.02, false)));
  // the crown: a plane just in front of the keystone, with a crack running through it
  const zc = KZ - 1.3;
  splat(b, ox, oy, (u, z) => [u, GFV + 2.0, z], -9, 9, 90, zc - 1, zc + 14, 90, (h) => {
    const s = crownShape(h.p[0], h.p[2], zc);
    if (s < 0) return null;
    const crack = Math.abs(h.p[0] - 2.4 - Math.sin(h.p[2] * 0.9) * 0.7) < 0.35 && h.p[2] > zc - 0.2 && h.p[2] < zc + 4 + 1;
    if (crack) return tone(GOLDP, 0.05, h.sx, h.sy);
    const gem = Math.hypot(h.p[0] + 0.2, (h.p[2] - (zc + 1.8)) * 1.2) < 1.25;
    if (gem) return awake ? tone(acc.cloth, 0.95, h.sx, h.sy) : tone(acc.cloth, 0.4 + h.lit * 0.3, h.sx, h.sy);
    return awake ? tone(GOLDP, 0.62 + s * 0.38 + (hash(h.sx, h.sy, seed + 62) - 0.5) * 0.1, h.sx, h.sy) : tone(GOLDP, s * 0.7 + (hash(h.sx, h.sy, seed + 62) - 0.5) * 0.12, h.sx, h.sy);
  }, 2, false);
  // a snapped-off crown point lying at the foot of the right pillar
  rod(b, ox, oy, [GP + 4, GFV + 12, 0.9], [GP + 8, GFV + 14, 1.5], 1.2, (h) => goldAt(h, seed + 63), 0.6);
  // the banners: each homeland hangs its colour from its pillar's capital, tattered (the far homeland's on the other side)
  const banner = (cu: number, sd: number) => {
    const len = 24 + R() * 3, wid = 5.4;
    splat(b, ox, oy, (a, c) => [cu + a * wid, GFV + 1.4 + Math.sin(c * 5 + sd) * 0.4, 56 - c * len + Math.sin(a * 3 + sd) * 0.3], -1, 1, 30, 0, 1, Math.ceil(len * 3), (h) => {
      const a = h.a, c = h.c;
      if (c > 0.8 && (Math.abs(a) < (c - 0.8) * 5 || hash(Math.round(a * 4), sd, 1) < (c - 0.78))) return null; // the swallow tail and frayed foot
      if (Math.abs(a) > 0.86 && hash(h.sx, h.sy, sd) < 0.3) return null;
      if (c < 0.07) return goldAt(h, sd, 0.05);
      if (Math.hypot(a * 1.7, c - 0.38) < 0.28 && Math.hypot(a * 1.7, c - 0.38) > 0.14) return goldAt(h, sd, 0.1 + (awake ? 0.2 : 0)); // a ring of gold
      return tone(acc.cloth, 0.22 + h.lit * 0.5 + (vn(h.sx * 0.5, h.sy * 0.3, sd) - 0.5) * 0.3 - c * 0.14, h.sx, h.sy);
    }, 3, false);
    rod(b, ox, oy, [cu - wid - 0.6, GFV + 1.2, 57], [cu + wid + 0.6, GFV + 1.2, 57], 0.7, (h) => goldAt(h, sd + 1), 1.2);
  };
  banner(-GP, seed + 70);
  banner(GP, seed + 71);
  // fallen masonry, gilt shards, ivy and weeds at the feet; more growth at the homeland end
  chips(b, ox, oy, R, 6, 0, 24, 26, seed + 80);
  for (let k = 0; k < 5; k++) {
    const u = (R() - 0.5) * 96, w = 24 + R() * 16, sz = 1.2 + R() * 1.4;
    ellipsoid(b, ox, oy, [u, w, 0.5], [sz * 1.3, sz, sz * 0.6], (h) => goldAt(h, seed + 90 + k), lump(seed + 90 + k));
  }
  weeds(b, ox, oy, R, home ? 13 : 8, 0, 14, 52, seed + 100);
  for (const cu of [-GP, GP]) { ivy(b, ox, oy, cu + (R() - 0.5) * 6, GHW * 0.85 + 1.2, 50, 16 + R() * 10, seed + 110 + cu); ivy(b, ox, oy, cu + (R() - 0.5) * 6, GFV + 0.5, 36, 12 + R() * 8, seed + 120 + cu); }
  b.depthEdges(5, 0.55);
  b.outline(0.35);
  gateBase.set(key, b);
  return b;
}

/**
 * Frame f of N of the Crownway gate to/from the homeland `from`. `side` "crown": on the Crown's rim, the arch on a marble dais
 * in paving going wild; "home": the homeland's end, the same arch with that land's ground piled round the dais. A regal
 * arch of white marble and pale granite on fluted pillars, gilt moulding, a banner in the homeland's colour on each pillar and
 * a crown carved on the keystone with one point snapped off. Asleep the opening is empty and the crown dull; awake a
 * veil of molten gold (tinted a little to the homeland) fills it, the crown and rings burn bright, light spills on the dais
 * and gold motes drift up.
 */
export function paintCrownGate(from: CrownFrom, side: "crown" | "home", awake: boolean, f: number, N: number): Bmp {
  const b = gateStatic(from, side, awake).clone();
  if (!awake) return b;
  const ph = (f / N) * Math.PI * 2, pulse = 0.5 + 0.5 * Math.sin(ph), ox = GATE_OX, oy = GATE_OY, acc = HOME_ACCENT[from].glow;
  // light on the dais and the ground in front
  const cx = ox, cy = oy + 14;
  for (let y = cy - 34; y < cy + 34; y++) for (let x = cx - 70; x < cx + 70; x++) {
    const d = Math.hypot((x - cx) / 62, (y - cy) / 26);
    if (d >= 1 || y < oy - 4) continue;
    const k = (1 - d) * (0.5 + 0.22 * pulse), flick = BAYER[(y & 3) * 4 + (x & 3)];
    if (flick < k) b.tint(x, y, GLOW[flick < k * 0.4 ? 5 : 4], 0.52);
  }
  // the veil: molten gold in the opening, banded and swirling, bright at the rim, a breath of the homeland's colour
  splat(b, ox, oy, (u, z) => [u, 0.2, z], -GAR, GAR, 130, GZ0 + 3.4, GSP + GAR, 150, (h) => {
    const u = h.p[0], z = h.p[2], tp = GSP + Math.sqrt(Math.max(0, GAR * GAR - u * u)) - 0.9;
    if (z > tp) return null;
    const uu = u / GAR, w = (z - GZ0) / (GSP + GAR - GZ0);
    const sw = vn(u * 0.11 + Math.cos(ph) * 2.2, z * 0.08 + Math.sin(ph) * 2.2, 171) * 0.6 + vn(u * 0.26 - Math.sin(ph) * 1.6, z * 0.2 + Math.cos(ph) * 1.6, 172) * 0.4;
    const band = Math.sin(z * 0.4 + uu * 2.2 - ph * 2 + sw * 5) * 0.5 + 0.5, rise = Math.sin(z * 0.22 - ph * 2 + u * 0.1) * 0.5 + 0.5;
    let t = 0.06 + sw * 0.5 + band * 0.26 + rise * 0.12 + (1 - Math.abs(uu)) * 0.1 - w * 0.12;
    const edge = Math.min(GAR - Math.abs(u), z - GZ0 - 3.4, tp - z);
    if (edge < 0.9 + pulse * 0.7) t = 0.95;
    else if (edge < 5) t += 0.3 * (1 - (edge - 0.9) / 4.1);
    t = Math.min(1, Math.max(0, t));
    const c = tone(GLOW, t, h.sx, h.sy);
    return mix(c, acc, 0.34 * (1 - t) * (1 - t) + 0.06);
  }, 0, false);
  // the crown on the keystone burns
  const KZ = GSP + GAR, zc = KZ - 1.3;
  for (let y = oy - KZ - 14; y < oy - KZ + 14; y++) for (let x = ox - 30; x < ox + 30; x++) {
    const d = Math.hypot((x - (ox - GFV - 2)) / 17, (y - (oy + (GFV + 2) / 2 - zc - 5)) / 13);
    if (d >= 1 || !b.solid(x, y)) continue;
    if (BAYER[(y & 3) * 4 + (x & 3)] < (1 - d) * (0.55 + 0.3 * pulse)) b.tint(x, y, GLOW[5], 0.45);
  }
  // gold motes rising from the veil
  for (let k = 0; k < 30; k++) {
    const life = (f / N + hash(k, 1, 191)) % 1, u0 = (hash(k, 2, 191) - 0.5) * 2 * (GAR - 3), z0 = GZ0 + 8 + hash(k, 3, 191) * 40;
    const w = 2 + life * (20 + hash(k, 4, 191) * 18), z = z0 + life * 12 + Math.sin(life * 6 + k) * 1.5, u = u0 * (1 + life * 0.45) + Math.sin(life * 5 + k) * 2;
    const x = Math.round(ox + u - w), y = Math.round(oy + (u + w) / 2 - z);
    b.put(x, y, GLOW[life < 0.5 ? 6 : life < 0.8 ? 5 : 4], 1e6, life < 0.85 ? 255 : 150);
    if (k % 3 === 0 && life < 0.7) b.put(x + 1, y, GLOW[5], 1e6, 130);
  }
  return b;
}

/** The gate sprite's anchor, for the texture origin. */
export const crownGateOrigin = { x: GATE_OX / GATE_W, y: GATE_OY / GATE_H };
export type { Sprite };
