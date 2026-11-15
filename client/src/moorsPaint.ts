/**
 * Act 3's Grey Barrow Moors art (shared/moors.ts), painted per pixel in code with no canvas or Phaser dependency, so the
 * preview script (tools/art/preview/moors-tiles.ts) runs it in node. Everything is a small iso heightfield or solid
 * "splatted" into a bitmap at game-pixel resolution: shaded from the top left by the surface normal, quantised to a
 * 5-6 tone ramp with ordered dithering (the bonfire's pixel look), then outlined. Textures live in moorsArt.ts.
 *
 * Geometry is the props' (smoothProps.ts Iso): a point (u, v, z) of a tile (u along world x, v along world y, both
 * -16..16 on the tile, z up) is drawn at x = ox + (u - v), y = oy + (u + v) / 2 - z.
 */
export type V3 = [number, number, number];
export type RGB = [number, number, number];

const hx = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const pal = (a: string[]) => a.map(hx);
/** Cold ramps, dark to bright. */
export const GRASS = pal(["#1b2620", "#28372e", "#38503f", "#4c684f", "#658364", "#84a07a"]);
export const HEATH = pal(["#25202f", "#372f44", "#4c4059", "#645670", "#7f708a", "#9a8ea4"]);
export const PEAT = pal(["#14120f", "#241f1a", "#38312a", "#4e453a", "#675b4b"]);
export const GRANITE = pal(["#17191d", "#2b2f35", "#444950", "#5f656d", "#7d848b", "#9ea5aa", "#bcc2c4"]);
export const MOSS = pal(["#1f2b1c", "#2f4127", "#44593a", "#5e7650", "#7f9868"]);
export const BONE = pal(["#242a24", "#3d463a", "#5e6a56", "#848f74", "#aab592", "#cdd6b6"]);
export const BIRCH = pal(["#26272a", "#4a4c4d", "#75776f", "#a2a398", "#cbccc0"]);
export const GORSE = pal(["#161d12", "#222d1a", "#33421f", "#475a27", "#5f7530"]);
const OUTL: RGB = [16, 14, 16];

export const hash = (a: number, b: number, s = 0) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Smooth value noise in [0, 1). */
export const vn = (x: number, y: number, s: number) => {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** A colour of ramp `r` at level t (0..1), dithered between steps by screen pixel. */
export const tone = (r: RGB[], t: number, sx: number, sy: number): RGB => {
  const d = BAYER[(sy & 3) * 4 + (sx & 3)] - 0.5;
  return r[Math.max(0, Math.min(r.length - 1, Math.floor(t * (r.length - 1) + 0.5 + d * 0.85)))];
};
export const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** RGBA bitmap with a depth buffer (nearer = larger u + v + z). */
export class Bmp {
  d: Uint8ClampedArray; z: Float32Array;
  constructor(public w: number, public h: number) { this.d = new Uint8ClampedArray(w * h * 4); this.z = new Float32Array(w * h).fill(-1e9); }
  put(x: number, y: number, c: RGB, depth: number, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (depth < this.z[i]) return;
    this.z[i] = depth;
    this.d[i * 4] = c[0]; this.d[i * 4 + 1] = c[1]; this.d[i * 4 + 2] = c[2]; this.d[i * 4 + 3] = a;
  }
  solid(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[(y * this.w + x) * 4 + 3] > 200; }
  clone() { const c = new Bmp(this.w, this.h); c.d.set(this.d); c.z.set(this.z); return c; }
  /** Blends colour c over an existing solid pixel (k 0..1), keeping its depth: light on the ground, mist. */
  tint(x: number, y: number, c: RGB, k: number) {
    if (!this.solid(x, y)) return;
    const i = (y * this.w + x) * 4;
    for (let q = 0; q < 3; q++) this.d[i + q] += (c[q] - this.d[i + q]) * k;
  }
  /** Darkens pixels that stand clearly in front of what is behind them (the edge of a skull over the heap, a bone over a bone). */
  depthEdges(thresh: number, k = 0.45) {
    const hit: number[] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.solid(x, y)) continue;
      const zi = this.z[y * this.w + x];
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (this.solid(x + dx, y + dy) && zi - this.z[(y + dy) * this.w + x + dx] > thresh) { hit.push((y * this.w + x) * 4); break; }
      }
    }
    for (const i of hit) for (let c = 0; c < 3; c++) this.d[i + c] *= k;
  }
  /** Silhouette outline: edge pixels turn to a dark tint of themselves (what the bonfire and the gates do). */
  outline(k = 0.3) {
    const edge: number[] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.solid(x, y)) continue;
      if (!this.solid(x - 1, y) || !this.solid(x + 1, y) || !this.solid(x, y - 1) || !this.solid(x, y + 1)) edge.push((y * this.w + x) * 4);
    }
    for (const i of edge) for (let c = 0; c < 3; c++) this.d[i + c] = this.d[i + c] * k + OUTL[c] * (1 - k) * 0.8;
  }
}

/** Direction to the light: top left of the screen (the left face is mid-lit, the right face dark, tops bright). */
const LN = Math.hypot(-0.38, 0.46, 0.8), L: V3 = [-0.38 / LN, 0.46 / LN, 0.8 / LN];
export interface Hit { a: number; c: number; p: V3; n: V3; lit: number; sx: number; sy: number; tag: number }
/** 0..1 from the surface normal: ambient plus the top-left light. */
const litOf = (n: V3) => Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);

/**
 * Paints a parametric surface P(a, c) by dense sampling (na x nc samples), z-buffered by screen depth. `mat` returns the
 * colour of a sample or null to leave it out. Normals come from finite differences, flipped to face the viewer.
 */
export function splat(b: Bmp, ox: number, oy: number, P: (a: number, c: number) => V3, a0: number, a1: number, na: number, c0: number, c1: number, nc: number,
  mat: (h: Hit) => RGB | null | undefined, tag = 0, shade = true) {
  const da = (a1 - a0) / na, dc = (c1 - c0) / nc;
  for (let i = 0; i <= na; i++) for (let j = 0; j <= nc; j++) {
    const a = a0 + da * i, c = c0 + dc * j, p = P(a, c);
    let n: V3 = [0, 0, 1];
    if (shade) {
      const pa = P(a + da * 0.5, c), pc = P(a, c + dc * 0.5);
      const ta: V3 = [pa[0] - p[0], pa[1] - p[1], pa[2] - p[2]], tc: V3 = [pc[0] - p[0], pc[1] - p[1], pc[2] - p[2]];
      n = [ta[1] * tc[2] - ta[2] * tc[1], ta[2] * tc[0] - ta[0] * tc[2], ta[0] * tc[1] - ta[1] * tc[0]];
      const m = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / m, n[1] / m, n[2] / m];
      if (n[0] + n[1] + n[2] < 0) n = [-n[0], -n[1], -n[2]];
    }
    const sx = Math.round(ox + p[0] - p[1]), sy = Math.round(oy + (p[0] + p[1]) / 2 - p[2]);
    const col = mat({ a, c, p, n, lit: litOf(n), sx, sy, tag });
    if (col) b.put(sx, sy, col, p[0] + p[1] + p[2]);
  }
}

/** An axis-aligned box [u0,u1] x [v0,v1] x [z0,z1]: its top, its +v face (down-left on screen) and its +u face (down-right). */
export function box(b: Bmp, ox: number, oy: number, u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, mat: (h: Hit) => RGB | null | undefined) {
  const du = u1 - u0, dv = v1 - v0, dz = z1 - z0, q = 2.2;
  splat(b, ox, oy, (a, c) => [u0 + a * du, v0 + c * dv, z1], 0, 1, Math.ceil(du * q), 0, 1, Math.ceil(dv * q), mat, 0);
  splat(b, ox, oy, (a, c) => [u0 + a * du, v1, z0 + c * dz], 0, 1, Math.ceil(du * q), 0, 1, Math.ceil(dz * q), mat, 1);
  splat(b, ox, oy, (a, c) => [u1, v0 + a * dv, z0 + c * dz], 0, 1, Math.ceil(dv * q), 0, 1, Math.ceil(dz * q), mat, 2);
}

/** An ellipsoid centred at c with radii r; `rough` jitters the radius per sample (spiky gorse, lumpy stones). */
export function ellipsoid(b: Bmp, ox: number, oy: number, c: V3, r: V3, mat: (h: Hit) => RGB | null | undefined, rough?: (th: number, ph: number) => number) {
  const n = Math.ceil((r[0] + r[1] + r[2]) * 2.6);
  splat(b, ox, oy, (th, ph) => {
    const k = rough ? rough(th, ph) : 1;
    return [c[0] + Math.cos(ph) * Math.cos(th) * r[0] * k, c[1] + Math.cos(ph) * Math.sin(th) * r[1] * k, c[2] + Math.sin(ph) * r[2] * k];
  }, 0, Math.PI * 2, n * 2, -Math.PI / 2, Math.PI / 2, n, mat);
}

/** A rod from p0 to p1 with radius r (fatter at the ends if `knob`): a long bone, a branch. */
export function rod(b: Bmp, ox: number, oy: number, p0: V3, p1: V3, r: number, mat: (h: Hit) => RGB | null | undefined, knob = 0) {
  const d: V3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], len = Math.hypot(...d) || 1;
  const dn: V3 = [d[0] / len, d[1] / len, d[2] / len];
  let e1: V3 = [dn[1], -dn[0], 0];
  if (Math.hypot(e1[0], e1[1]) < 0.1) e1 = [1, 0, 0];
  const m = Math.hypot(...e1); e1 = [e1[0] / m, e1[1] / m, e1[2] / m];
  const e2: V3 = [dn[1] * e1[2] - dn[2] * e1[1], dn[2] * e1[0] - dn[0] * e1[2], dn[0] * e1[1] - dn[1] * e1[0]];
  splat(b, ox, oy, (t, ang) => {
    const rr = r * (1 + knob * Math.max(0, 1 - Math.min(t, 1 - t) * 9));
    return [p0[0] + d[0] * t + rr * (Math.cos(ang) * e1[0] + Math.sin(ang) * e2[0]), p0[1] + d[1] * t + rr * (Math.cos(ang) * e1[1] + Math.sin(ang) * e2[1]), p0[2] + d[2] * t + rr * (Math.cos(ang) * e1[2] + Math.sin(ang) * e2[2])];
  }, 0, 1, Math.ceil(len * 3), 0, Math.PI * 2, Math.ceil(r * 9 + 6), mat);
}

/** A soft dark pool on the ground under something: dithered half-transparent pixels (no depth, so everything covers it). */
export function shadow(b: Bmp, ox: number, oy: number, u: number, v: number, rx: number, ry: number, a = 120) {
  const cx = ox + u - v, cy = oy + (u + v) / 2;
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (d < 1 && BAYER[(y & 3) * 4 + (x & 3)] < (1 - d) * 1.4) b.put(x, y, [8, 8, 10], -1e8, a);
  }
}

// ---------- materials ----------

/** Granite: lichen (pale green-grey, a little rust orange), moss at the foot, cracks and rain streaks. `h` 0 = low, 1 = high on the object. */
export function graniteAt(hit: Hit, seed: number, height01: number, ax = 9, cy = 9, k = 1): RGB {
  const { sx, sy, lit, a, c } = hit;
  const wx = a * ax, wy = c * cy;
  let t = 0.18 + lit * 0.78 + (vn(sx * 0.35, sy * 0.35, seed) - 0.5) * 0.2 * k;
  const crack = Math.abs(vn(wx * 0.22, wy * 0.07, seed + 3) - 0.5);
  if (crack < 0.012) t -= 0.35;
  if (vn(wx * 0.08 + 7, wy * 0.5, seed + 4) > 0.72 && hit.n[2] < 0.6) t -= 0.14; // rain streaks down the faces
  let col = tone(GRANITE, t, sx, sy);
  const lich = vn(sx * 0.17, sy * 0.21, seed + 5) + (hash(sx, sy, seed + 6) - 0.5) * 0.25;
  if (lich > 0.66) col = mix(col, tone(MOSS, 0.55 + lit * 0.6, sx, sy), 0.78);
  else if (lich < 0.1 && hash(sx >> 1, sy >> 1, seed + 7) < 0.5) col = mix(col, [150, 120, 70], 0.55);
  if (height01 < 0.2 && vn(sx * 0.3, sy * 0.4, seed + 8) > 0.35 + height01 * 1.6) col = tone(MOSS, 0.25 + lit * 0.6, sx, sy);
  return col;
}

// ---------- objects ----------

export interface Sprite { b: Bmp; ox: number; oy: number }
const rnd = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

/**
 * A burial mound `n` tiles long (one long hump along world x: the tiles of a run share one profile, so they join),
 * grass and heather over a peat toe with lichen boulders sunk round it, and, at tile `mouth` (-1 = none), a stone-lined
 * door: two jambs and a lintel set into the slope over a flagged forecourt, black inside. The sprite's origin (ox, oy)
 * is the centre of the first tile.
 */
export function paintBarrow(n: number, mouth: number, seed: number): Sprite {
  const R = rnd(seed * 7 + n), H = 17 + R() * 4 + n * 1.5, a = 16 * n - 1.2, bb = 12.4, uc = 16 * n - 16;
  const oy = Math.ceil(H) + 19, b = new Bmp(32 * n + 34, oy + 16 * n + 3), ox = 33;
  const bAt = (u: number) => bb * (1 + (vn(u * 0.07, 3, seed + 9) - 0.5) * 0.22);
  const sOf = (u: number, v: number) => ((u - uc) / a) ** 2 + (v / bAt(u)) ** 2;
  const zf = (u: number, v: number) => {
    const s = sOf(u, v);
    if (s >= 1) return 0;
    return H * Math.sin((Math.PI / 2) * (1 - s)) * (1 + (vn(u * 0.11, v * 0.11, seed) - 0.5) * 0.16) + (vn(u * 0.35, v * 0.35, seed + 1) - 0.5) * 1.1 * (1 - s);
  };
  const u0 = mouth * 32, X = u0 - uc, vd = mouth >= 0 ? bAt(u0) * Math.sqrt(Math.max(0.2, 0.9 - (X / a) ** 2)) : 99;
  shadow(b, ox, oy, uc, 1, a + 5, bb + 3, 110);
  splat(b, ox, oy, (u, v) => [u, v, zf(u, v)], uc - a, uc + a, Math.ceil(a * 7.2), -bb - 1, bb + 1, Math.ceil(bb * 7.5), (h) => {
    const [u, v, z] = h.p, s = sOf(u, v);
    if (s >= 1 || z < 0.25) return null;
    if (mouth >= 0 && Math.abs(u - u0) < 9.2 && v > vd - 3.4) return null; // the cutting to the door
    let t = 0.12 + h.lit * 0.8 + (vn(h.sx * 0.5, h.sy * 0.5, seed + 2) - 0.5) * 0.18;
    const patch = vn(u * 0.12, v * 0.17, seed + 3);
    let col: RGB;
    if (s > 0.84) col = mix(tone(GRASS, t, h.sx, h.sy), tone(PEAT, t * 1.1 + 0.12, h.sx, h.sy), Math.min(1, (s - 0.84) * 9)); // bare peat at the toe
    else if (patch > 0.57) col = tone(HEATH, t + 0.08, h.sx, h.sy);
    else col = tone(GRASS, t, h.sx, h.sy);
    const g = hash(h.sx, h.sy, seed + 4);
    if (g < 0.05 && s < 0.85) col = tone(patch > 0.57 ? HEATH : GRASS, t + 0.32, h.sx, h.sy); // a blade of lit grass
    else if (g > 0.955 && s < 0.9) col = tone(GRASS, t - 0.28, h.sx, h.sy);
    if (s < 0.6 && vn(u * 0.3, v * 0.5, seed + 5) > 0.74) col = mix(col, tone(GRANITE, 0.3 + h.lit * 0.5, h.sx, h.sy), 0.7); // stone showing through the turf
    return col;
  });
  // lichen boulders sunk round the toe, and a few on the crest
  for (let k = 0; k < n * 5; k++) {
    const ang = R() * Math.PI * 2, rr = 0.9 + R() * 0.08, u = uc + a * rr * Math.cos(ang), v = bAt(u) * rr * Math.sin(ang);
    if (mouth >= 0 && Math.abs(u - u0) < 12 && v > vd - 6) continue;
    const sz = 1.5 + R() * 1.8;
    ellipsoid(b, ox, oy, [u, v, 0.6], [sz * 1.3, sz, sz * 0.9], (h) => graniteAt(h, seed + k, 0.5, 6, 6), (th, ph) => 1 + (hash((th * 4) | 0, (ph * 4) | 0, seed + k) - 0.5) * 0.3);
  }
  if (mouth >= 0) {
    const sm = (h: Hit, sd: number) => (h.tag === 0 ? graniteAt(h, sd, 0.9, 3, 3) : graniteAt(h, sd, 0.5, 3, 3));
    // forecourt flags and a step
    splat(b, ox, oy, (u, v) => [u, v, 0.15], u0 - 7.5, u0 + 7.5, 60, vd + 1, vd + 8, 60, (h) => {
      const fu = ((h.p[0] + 100) * 0.16) % 1, fv = ((h.p[1] + 100) * 0.22 + Math.floor((h.p[0] + 100) * 0.16) * 0.37) % 1;
      if (fu < 0.07 || fv < 0.09) return tone(PEAT, 0.25, h.sx, h.sy);
      return h.p[1] > vd + 6.2 && vn(h.sx * 0.3, h.sy * 0.4, seed + 6) > 0.4 ? tone(MOSS, 0.4, h.sx, h.sy) : tone(GRANITE, 0.34 + h.lit * 0.3 + (hash(Math.floor(h.p[0] * 0.16), Math.floor(h.p[1] * 0.22), seed) - 0.5) * 0.2, h.sx, h.sy);
    }, 0, false);
    // the dark inside, a cold breath at the floor
    splat(b, ox, oy, (a2, c) => [u0 + a2, vd - 0.4, c], -4.2, 4.2, 40, 0, 11, 60, (h) => (h.p[2] < 1.6 && BAYER[(h.sy & 3) * 4 + (h.sx & 3)] > h.p[2] / 1.6 ? [34, 44, 52] : [9, 10, 13]), 0, false);
    box(b, ox, oy, u0 - 6.8, u0 - 4.1, vd - 1.6, vd + 1.8, 0, 11.4, (h) => sm(h, seed + 20));
    box(b, ox, oy, u0 + 4.1, u0 + 6.8, vd - 1.6, vd + 1.8, 0, 10.6, (h) => sm(h, seed + 21));
    box(b, ox, oy, u0 - 8.6, u0 + 8.4, vd - 3.2, vd + 2.4, 11.4, 15, (h) => sm(h, seed + 22));
    box(b, ox, oy, u0 - 6, u0 + 6, vd + 1.8, vd + 5, 0, 1.4, (h) => sm(h, seed + 23));
  }
  b.outline();
  return { b, ox, oy };
}

/**
 * A standing stone: a tall, leaning slab of lichen-crusted granite, rough and tapering, with a slanted top. kind 0 =
 * the usual ring stone, 1 = a squat broad one, 2 = the king-stone (tallest, with a cup-and-ring carving on its face).
 */
export function paintStone(kind: number, seed: number): Sprite {
  const R = rnd(seed * 13 + kind * 101 + 5);
  const H = kind === 2 ? 58 + R() * 6 : kind === 1 ? 30 + R() * 5 : 42 + R() * 10;
  const rx = kind === 1 ? 8.8 : kind === 2 ? 8.4 : 6.2 + R() * 1.4, ry = kind === 1 ? 5.4 : kind === 2 ? 5.2 : 3.7 + R() * 0.9;
  const rot = (R() - 0.5) * 0.7, cr = Math.cos(rot), sr = Math.sin(rot), taper = 0.18 + R() * 0.16, lean: [number, number] = [(R() - 0.5) * 6, (R() - 0.5) * 3], slant = (R() - 0.5) * 0.7;
  const oy = Math.ceil(H) + 24, b = new Bmp(48, oy + 14), ox = 24;
  const bnd = (th: number, t: number) => {
    const cs = Math.cos(th), sn = Math.sin(th), p = 2 / 3.4;
    const sc = (1 - taper * Math.pow(t, 1.3) + 0.1 * Math.pow(1 - t, 4) + (vn(th * 1.4 + seed, t * 5, seed) - 0.5) * 0.14) * (1 - 0.05 * (vn(th * 3, t * 11, seed + 1) > 0.78 ? 1 : 0));
    const x = rx * sc * Math.sign(cs) * Math.pow(Math.abs(cs), p), y = ry * sc * Math.sign(sn) * Math.pow(Math.abs(sn), p);
    return [x * cr - y * sr + lean[0] * Math.pow(t, 1.3), x * sr + y * cr + lean[1] * Math.pow(t, 1.3), x] as V3;
  };
  const th0 = Math.PI / 2 - rot;
  shadow(b, ox, oy, 2, 2, rx + 7, ry + 5, 120);
  // tussocks and heather at the foot
  for (let k = 0; k < 9; k++) {
    const ang = R() * Math.PI * 2, u = Math.cos(ang) * (rx + 2.5), v = Math.sin(ang) * (ry + 2);
    ellipsoid(b, ox, oy, [u, v, 0.5], [2.4, 1.8, 1.4], (h) => tone(k % 3 ? GRASS : HEATH, 0.3 + h.lit * 0.65, h.sx, h.sy), (th, ph) => 1 + (hash((th * 3) | 0, (ph * 3) | 0, seed + k) - 0.5) * 0.35);
  }
  const gl = bnd(th0, 0.52), gx = Math.round(ox + gl[0] - gl[1]), gy = Math.round(oy + (gl[0] + gl[1]) / 2 - H * 0.52);
  const sideMat = (h: Hit) => {
    let col = graniteAt(h, seed, h.c, 7, H * 0.16);
    if (kind !== 1 && h.n[1] > 0.55) { // cup and ring: the carving the old people left on the face looking at the road
      const r = Math.hypot(h.sx - gx, (h.sy - gy) * 1.25);
      if (r < 1.1 || (r > 2.6 && r < 3.5) || (r > 5.3 && r < 6.2 && Math.abs(h.sx - gx) < 5.6 && h.sy > gy - 6)) col = tone(GRANITE, 0.06 + h.lit * 0.2, h.sx, h.sy);
    }
    return col;
  };
  splat(b, ox, oy, (th, t) => { const q = bnd(th, t); return [q[0], q[1], H * t]; }, 0, Math.PI * 2, 260, 0, 1, Math.ceil(H * 3.4), sideMat, 0);
  // the slanted, weathered top
  splat(b, ox, oy, (th, rho) => { const q = bnd(th, 1); return [q[0] * rho + lean[0] * 0.0, q[1] * rho, H + slant * q[2] * rho - 1.6 * rho * rho * (1 - rho) + (vn(q[0] * rho * 0.5, q[1] * rho, seed + 2) - 0.5) * 1.6] as V3; },
    0, Math.PI * 2, 200, 0, 1, 40, (h) => {
      let col = graniteAt(h, seed + 40, 1, 7, 7);
      if (vn(h.sx * 0.25, h.sy * 0.4, seed + 41) > 0.5) col = tone(MOSS, 0.4 + h.lit * 0.5, h.sx, h.sy);
      return col;
    }, 1);
  b.outline();
  return { b, ox, oy };
}

/** A heap of bones and skulls, grey-green with age (the desert's bones are bleached white): long bones crossed over a peaty mound, three skulls. */
export function paintBones(seed: number): Sprite {
  const R = rnd(seed * 31 + 17), oy = 30, b = new Bmp(44, 44), ox = 22;
  shadow(b, ox, oy, 0, 1, 15, 8, 120);
  const heap = (u: number, v: number) => Math.max(0, 1 - (u / 10.5) ** 2 - (v / 7) ** 2);
  const hm: V3 = [0, 0, 0];
  ellipsoid(b, ox, oy, hm, [10, 6.5, 2.6], (h) => {
    const n1 = vn(h.p[0] * 0.5 + 9, h.p[1] * 0.6, seed), n2 = hash(h.sx >> 1, h.sy, seed + 3);
    if (n1 > 0.62 && n2 > 0.5) return tone(BONE, 0.2 + h.lit * 0.5 + (n2 - 0.5) * 0.3, h.sx, h.sy); // small bones and shards in the heap
    return tone(PEAT, 0.1 + h.lit * 0.6, h.sx, h.sy);
  }, (th, ph) => 1 + (vn(th * 3 + seed, ph * 3, seed + 1) - 0.5) * 0.3);
  const boneMat = (h: Hit) => tone(BONE, 0.3 + h.lit * 0.8 + (hash(h.sx, h.sy, seed + 9) - 0.5) * 0.12, h.sx, h.sy);
  for (let k = 0; k < 8; k++) {
    const u = (R() - 0.5) * 17, v = (R() - 0.5) * 11, ang = R() * Math.PI, len = 5 + R() * 4.5, z = 0.9 + heap(u, v) * 2.6;
    const du = Math.cos(ang) * len, dv = Math.sin(ang) * len * 0.7, dz = (R() - 0.3) * 2.2;
    rod(b, ox, oy, [u - du, v - dv, z - dz], [u + du, v + dv, z + dz + 0.5], 1.05 + R() * 0.3, boneMat, 1.1);
  }
  // ribs: a few curved arcs in the heap's front
  for (let k = 0; k < 4; k++) {
    const u = -5 + k * 2.2 + (R() - 0.5), v = 2 + R() * 2.5;
    rod(b, ox, oy, [u, v - 2.6, 1.2], [u + 0.7, v + 0.8, 3.8 + heap(u, v) * 2.5], 0.55, boneMat);
  }
  for (const [u, v, yaw, s] of [[-5.2, 1.8, 0.2, 1.05], [4.6, 3.6, -0.7, 0.95], [0.4, -2.6, 0.9, 0.9]] as const) {
    const r = 3.3 * s, c: V3 = [u, v, 0.8 + heap(u, v) * 2 + r * 0.55], F: V3 = [Math.cos(0.78 + yaw), Math.sin(0.78 + yaw), 0], Lx: V3 = [-F[1], F[0], 0];
    ellipsoid(b, ox, oy, c, [r, r, r * 0.92], (h) => {
      const q: V3 = [(h.p[0] - c[0]) / r, (h.p[1] - c[1]) / r, (h.p[2] - c[2]) / r], qf = q[0] * F[0] + q[1] * F[1], ql = q[0] * Lx[0] + q[1] * Lx[1];
      if (qf > 0.42 && Math.abs(ql) > 0.2 && Math.abs(ql) < 0.62 && q[2] > -0.1 && q[2] < 0.42) return [8, 10, 8]; // eye sockets
      if (qf > 0.55 && Math.abs(ql) < 0.15 && q[2] > -0.34 && q[2] < 0.02) return [12, 14, 12]; // nose
      if (qf > 0.35 && q[2] < -0.42 && q[2] > -0.8 && ((h.sx + h.sy) & 1)) return tone(BONE, 0.12, h.sx, h.sy); // teeth
      return boneMat(h);
    });
  }
  b.depthEdges(2.2, 0.4);
  b.outline();
  return { b, ox, oy };
}

/** A dead birch: a pale, black-marked trunk with a few bare, crooked branches. kind 2 is a snapped stump with moss and a bracket fungus. */
export function paintBirch(kind: number, seed: number): Sprite {
  const R = rnd(seed * 17 + kind * 53 + 2), H = kind === 2 ? 22 + R() * 5 : 38 + R() * 12, oy = Math.ceil(H) + 22, b = new Bmp(52, oy + 12), ox = 26;
  const lean: [number, number] = [(R() - 0.5) * 9, (R() - 0.5) * 5];
  const C = (t: number): V3 => [lean[0] * t * t + Math.sin(t * 5 + seed) * 0.8, lean[1] * t * t, H * t];
  const r0 = kind === 2 ? 4.2 : 3, rOf = (t: number) => r0 * (1 - 0.45 * t) * (1 + 0.35 * Math.pow(1 - t, 6));
  shadow(b, ox, oy, 1, 1, 11, 5, 100);
  const bark = (h: Hit, sd: number) => {
    const z = h.p[2], mark = hash(Math.floor(z / 1.7), Math.floor(h.a * 2.4), sd) < 0.3 && hash(Math.floor(z * 3), Math.floor(h.a * 5), sd + 1) < 0.8;
    let t = 0.3 + h.lit * 0.72 + (hash(h.sx, h.sy, sd + 2) - 0.5) * 0.15;
    if (mark) t -= 0.55;
    let col = tone(BIRCH, t, h.sx, h.sy);
    if (z < 5 && vn(h.sx * 0.4, h.sy * 0.5, sd + 3) > 0.35 + z * 0.08) col = tone(MOSS, 0.25 + h.lit * 0.55, h.sx, h.sy);
    return col;
  };
  // roots
  for (let k = 0; k < 4; k++) { const a = k * 1.7 + R(), l = 4 + R() * 3; rod(b, ox, oy, [0, 0, 2.2], [Math.cos(a) * l, Math.sin(a) * l * 0.8, 0.2], 1.1 - k * 0.1, (h) => bark(h, seed + 5)); }
  const topT = kind === 2 ? 1 : 0.96;
  splat(b, ox, oy, (t, ang) => { const c = C(t), r = rOf(t) * (1 + (vn(ang * 2 + seed, t * 8, seed) - 0.5) * 0.25); return [c[0] + Math.cos(ang) * r, c[1] + Math.sin(ang) * r * 0.9, c[2]]; },
    0, topT, Math.ceil(H * 3.4), 0, Math.PI * 2, 48, (h) => {
      if (kind === 2) { const j = vn(h.a * 5 + h.c * 3, 0, seed + 6) * 4.5; if (h.p[2] > H - 1 - j) return null; } // snapped off, jagged
      return bark(h, seed);
    }, 0);
  if (kind === 2) {
    const c = C(0.9); // the break: a ragged, pale heartwood top
    splat(b, ox, oy, (ang, rho) => [c[0] + Math.cos(ang) * rho * rOf(0.9), c[1] + Math.sin(ang) * rho * rOf(0.9) * 0.9, H - 2.2 + Math.cos(ang * 2 + seed) * 1.2 + rho * 0.8], 0, Math.PI * 2, 60, 0, 1, 12, (h) => tone(BIRCH, 0.45 + h.lit * 0.5, h.sx, h.sy), 1);
    ellipsoid(b, ox, oy, [C(0.25)[0] + 2.6, C(0.25)[1] + 2.4, H * 0.25], [2.4, 2, 0.9], (h) => tone(HEATH, 0.35 + h.lit * 0.6, h.sx, h.sy)); // a bracket fungus
  } else {
    const nb = 3 + (R() * 3 | 0);
    for (let k = 0; k < nb; k++) {
      const t = 0.42 + k * 0.1 + R() * 0.08, p0 = C(t), ang = R() * Math.PI * 2 + k * 2.2, l = 8 + R() * 9 * (1.1 - t);
      let p: V3 = [p0[0], p0[1], p0[2]], dir = ang, rad = 1.25 - t * 0.5;
      for (let seg = 0; seg < 3; seg++) {
        const q: V3 = [p[0] + Math.cos(dir) * l / 3, p[1] + Math.sin(dir) * l / 3 * 0.8, p[2] + (seg === 0 ? 3 : 2.2) - seg * 0.5];
        rod(b, ox, oy, p, q, rad, (h) => bark(h, seed + 10 + k));
        if (seg === 1) { const q2: V3 = [q[0] + Math.cos(dir + 1) * 3.2, q[1] + Math.sin(dir + 1) * 2.5, q[2] + 2.2]; rod(b, ox, oy, q, q2, rad * 0.6, (h) => bark(h, seed + 30 + k)); }
        p = q; dir += (R() - 0.5) * 1.1; rad *= 0.7;
      }
    }
    // the crooked top
    const c = C(1), q: V3 = [c[0] + 2.5, c[1] - 1, c[2] + 5];
    rod(b, ox, oy, c, q, 0.8, (h) => bark(h, seed + 50));
  }
  b.outline();
  return { b, ox, oy };
}

/** A gorse bush: a dense, spiny, dark clump studded with yellow bloom (walk-through scrub). */
export function paintGorse(seed: number): Sprite {
  const R = rnd(seed * 23 + 9), oy = 30, b = new Bmp(52, 40), ox = 26;
  shadow(b, ox, oy, 0, 1, 15, 7, 110);
  const lumps: [number, number, number, number][] = [];
  for (let k = 0; k < 9; k++) { const a = R() * Math.PI * 2, d = R() * 8; lumps.push([Math.cos(a) * d, Math.sin(a) * d * 0.7, 3 + R() * 3.5, 4.5 + R() * 3.5]); }
  lumps.sort((p, q) => p[0] + p[1] - q[0] - q[1]);
  for (const [u, v, z, r] of lumps) {
    ellipsoid(b, ox, oy, [u, v, z], [r, r * 0.9, r * 0.75], (h) => {
      const t = 0.12 + h.lit * 0.85 + (hash(h.sx, h.sy, seed) - 0.5) * 0.35;
      const g = hash(h.sx, h.sy, seed + 1);
      if (g > 0.86 && h.lit > 0.2) return g > 0.95 ? [226, 200, 84] : [190, 160, 52]; // bloom
      if (g < 0.1) return tone(GORSE, 0, h.sx, h.sy);
      return tone(GORSE, t, h.sx, h.sy);
    }, (th, ph) => 1 + (hash((th * 7) | 0, (ph * 6) | 0, seed + 2) - 0.45) * 0.3);
  }
  b.outline(0.4);
  return { b, ox, oy };
}

// ---------- the moorgate ----------

/** The gate's cold light, dark to bright (grey-blue, like fog over water). */
export const COLD = pal(["#0c141c", "#16283a", "#274862", "#3f7394", "#6aa6c4", "#a4d4e4", "#e6f6fa"]);
export const GATE_W = 150, GATE_H = 150, GATE_OX = 75, GATE_OY = 118;
const GP = 26, GPH = 66, GZ0 = 8; // pillar centre (world x), pillar top, where the opening starts

const gateBase = new Map<string, Bmp>();
/**
 * The moorgate's still part: a barrow-stone trilithon (two rough uprights and a lintel) on two worn steps and a dais.
 * Side "forest" is Oakvale's end (a flagged dais in the pines: moss, needles, ferns); "moors" is the far end (cracked
 * flags in the peat, heather). Awake, the runes on the stones are lit.
 */
function gateStatic(side: "forest" | "moors", awake: boolean): Bmp {
  const key = side + (awake ? 1 : 0), have = gateBase.get(key);
  if (have) return have;
  const forest = side === "forest", seed = forest ? 61 : 67, b = new Bmp(GATE_W, GATE_H), ox = GATE_OX, oy = GATE_OY, R = rnd(seed);
  // ground round the dais: moss and needles, or peat and heather, thinning into the surroundings
  const ground = forest ? [MOSS, PEAT] : [PEAT, HEATH];
  splat(b, ox, oy, (u, v) => [u, v, 0], -66, 66, 260, -36, 46, 160, (h) => {
    const [u, v] = h.p, d = Math.hypot(u / 66, (v - 6) / 38) + (vn(u * 0.07, v * 0.1, seed) - 0.5) * 0.5;
    if (d > 1 || (d > 0.78 && BAYER[(h.sy & 3) * 4 + (h.sx & 3)] > (1 - d) * 4.5)) return null;
    const n = vn(u * 0.2, v * 0.25, seed + 1);
    let col = tone(ground[0], 0.35 + n * 0.5, h.sx, h.sy);
    if (vn(u * 0.1 + 5, v * 0.13, seed + 2) > 0.58) col = tone(ground[1], 0.3 + n * 0.5, h.sx, h.sy);
    if (hash(h.sx, h.sy, seed + 3) < 0.04) col = tone(forest ? GRASS : HEATH, 0.7, h.sx, h.sy);
    return col;
  }, 0, false);
  shadow(b, ox, oy, 0, 4, 58, 26, 110);
  const flags = (h: Hit, sd: number) => {
    const [u, v] = h.p;
    if (h.tag === 0) { // a worn flagstone top
      const fu = ((u + 200) * 0.11) % 1, fv = ((v + 200) * 0.17 + Math.floor((u + 200) * 0.11) * 0.41) % 1;
      if (fu < 0.06 || fv < 0.08) return tone(PEAT, 0.2, h.sx, h.sy);
      let col = graniteAt(h, sd + Math.floor((u + 200) * 0.11) * 3, 0.9, 4, 4, 1.4);
      const m = vn(u * 0.09, v * 0.13, sd + 9);
      if (m > (forest ? 0.5 : 0.68)) col = tone(forest ? MOSS : HEATH, 0.3 + h.lit * 0.55, h.sx, h.sy);
      return col;
    }
    const k = (h.tag === 1 ? u : v) * 0.11 % 1;
    if (Math.abs(k) < 0.07 || (h.p[2] % 4 < 0.4)) return tone(PEAT, 0.18, h.sx, h.sy);
    let col = graniteAt(h, sd + 5, 0.4, 4, 4, 1.2);
    if (forest && vn(h.sx * 0.2, h.sy * 0.3, sd + 6) > 0.52 && h.p[2] < 6) col = tone(MOSS, 0.3 + h.lit * 0.5, h.sx, h.sy);
    return col;
  };
  box(b, ox, oy, -50, 50, -18, 20, 0, 3.6, (h) => flags(h, seed + 10));
  box(b, ox, oy, -41, 41, -12, 13, 3.6, GZ0, (h) => flags(h, seed + 20));
  // the uprights
  const rune = (h: Hit, lu: number, z: number, sd: number): RGB | undefined => {
    const cell = Math.floor(z / 4.6);
    if (z < GZ0 + 6 || z > GPH - 5 || z % 4.6 > 3 || Math.abs(lu) > 3.6) return undefined;
    const col = Math.floor((lu + 3.6) / 1.2), row = Math.floor((z % 4.6) / 1);
    const on = hash(cell * 7 + col, row, sd) < 0.5 || (col === 2 && row === 1) || (hash(cell, 9, sd) < 0.5 && row === 0);
    return on ? (awake ? tone(COLD, 0.55 + hash(cell, 3, sd) * 0.35, h.sx, h.sy) : tone(GRANITE, 0.02, h.sx, h.sy)) : undefined;
  };
  const pillar = (cu: number, sd: number, tall: number) => {
    const rx = 9.4, ry = 7, H = GPH + tall, rot = (R() - 0.5) * 0.18, cr = Math.cos(rot), sr = Math.sin(rot), taper = 0.1 + R() * 0.06;
    const bnd = (th: number, t: number) => {
      const cs = Math.cos(th), sn = Math.sin(th), p = 2 / 4.4;
      const sc = (1 - taper * t + 0.1 * Math.pow(1 - t, 5) + (vn(th * 1.6 + sd, t * 6, sd) - 0.5) * 0.12) * (1 - (vn(th * 3, t * 14, sd + 1) > 0.8 ? 0.06 : 0));
      const x = rx * sc * Math.sign(cs) * Math.pow(Math.abs(cs), p), y = ry * sc * Math.sign(sn) * Math.pow(Math.abs(sn), p);
      return [cu + x * cr - y * sr, x * sr + y * cr] as const;
    };
    splat(b, ox, oy, (th, t) => { const q = bnd(th, t); return [q[0], q[1], GZ0 + (H - GZ0) * t]; }, 0, Math.PI * 2, 300, 0, 1, Math.ceil((H - GZ0) * 3.4), (h) => {
      const r = h.n[1] > 0.45 ? rune(h, h.p[0] - cu, h.p[2], sd) : undefined;
      return r ?? graniteAt(h, sd, h.c * 0.9, 8, (H - GZ0) * 0.15);
    }, 0);
    splat(b, ox, oy, (th, rho) => { const q = bnd(th, 1); return [cu + (q[0] - cu) * rho, q[1] * rho, H + (q[0] - cu) * rho * 0.05 - 1.4 * rho * rho * (1 - rho)]; }, 0, Math.PI * 2, 200, 0, 1, 40, (h) => {
      let col = graniteAt(h, sd + 40, 1, 7, 7);
      if (vn(h.sx * 0.25, h.sy * 0.4, sd + 41) > 0.5) col = tone(forest ? MOSS : HEATH, 0.4 + h.lit * 0.5, h.sx, h.sy);
      return col;
    }, 1);
  };
  pillar(-GP, seed + 30, 2);
  pillar(GP, seed + 31, -3);
  // the lintel: a long slab, its ends chipped, a ring-and-dots sign on its face (lit when awake)
  const ZL0 = GPH - 3, ZL1 = ZL0 + 13.5;
  box(b, ox, oy, -GP - 15, GP + 14, -6.5, 6.5, ZL0, ZL1, (h) => {
    const [u, v, z] = h.p, e = Math.min(u + GP + 15, GP + 14 - u);
    if (e < 3 && vn(h.sx * 0.5, h.sy * 0.5, seed + 50) > 0.45 + e * 0.1) return null;
    if (h.tag === 1) {
      const r = Math.hypot(u + 1, (z - (ZL0 + ZL1) / 2) * 1.0);
      const ring = (r > 3.6 && r < 5.2) || r < 1.3 || (Math.abs(Math.abs(u + 1) - 8.5) < 1.2 && Math.abs(z - (ZL0 + ZL1) / 2) < 1.2);
      if (ring) return awake ? tone(COLD, 0.7 + hash(h.sx, h.sy, 3) * 0.3, h.sx, h.sy) : tone(GRANITE, 0.02, h.sx, h.sy);
      const rr = rune(h, ((u + 60) % 8) - 4, ((z - ZL0) * 0.3 + 10) * 4.6 - 0.2, seed + 51);
      if (Math.abs(u) > 12 && Math.abs(u) < 44 && z > ZL0 + 3 && z < ZL1 - 3 && rr) return rr;
    }
    return graniteAt(h, seed + 52, 1, 6, 6, 1.1);
  });
  // fallen chips and heather round the feet
  for (let k = 0; k < 7; k++) {
    const u = (R() - 0.5) * 100, v = 20 + R() * 20, sz = 1.8 + R() * 2.2;
    ellipsoid(b, ox, oy, [u, v, 0.7], [sz * 1.3, sz, sz * 0.8], (h) => graniteAt(h, seed + 70 + k, 0.4, 6, 6), (th, ph) => 1 + (hash((th * 4) | 0, (ph * 4) | 0, seed + k) - 0.5) * 0.3);
  }
  for (let k = 0; k < 14; k++) {
    const u = (R() - 0.5) * 118, v = -18 + R() * 62;
    if (Math.abs(u) < 44 && v < 22 && v > -14) continue;
    const r = 2 + R() * 2.2, rampT = forest ? (k % 3 ? GRASS : MOSS) : (k % 2 ? HEATH : GRASS);
    ellipsoid(b, ox, oy, [u, v, 0.8], [r * 1.5, r, r * 0.8], (h) => tone(rampT, 0.25 + h.lit * 0.7 + (hash(h.sx, h.sy, seed + 80) - 0.5) * 0.3, h.sx, h.sy), (th, ph) => 1 + (hash((th * 6) | 0, (ph * 5) | 0, seed + k) - 0.4) * 0.35);
  }
  b.depthEdges(5, 0.55);
  b.outline(0.35);
  gateBase.set(key, b);
  return b;
}

/**
 * Frame f of N of the moorgate. Asleep: the stones and the empty opening, no light. Awake: a veil of cold fog fills the
 * opening, drifting and eddying (the loop is seamless), the runes burn pale blue, light spills on the steps and wisps of
 * mist float out towards the viewer.
 */
export function paintGate(side: "forest" | "moors", awake: boolean, f: number, N: number): Bmp {
  const b = gateStatic(side, awake).clone();
  if (!awake) return b;
  const ph = (f / N) * Math.PI * 2, pulse = 0.5 + 0.5 * Math.sin(ph), ox = GATE_OX, oy = GATE_OY, GAP = GP - 9.6;
  // light on the dais, the steps and the ground in front of the opening
  const cx = ox + 0, cy = oy + 14;
  for (let y = cy - 34; y < cy + 34; y++) for (let x = cx - 70; x < cx + 70; x++) {
    const d = Math.hypot((x - cx) / 62, (y - cy) / 26);
    if (d >= 1 || y < oy - 4) continue;
    const k = (1 - d) * (0.5 + 0.22 * pulse), flick = BAYER[(y & 3) * 4 + (x & 3)];
    if (flick < k) b.tint(x, y, COLD[flick < k * 0.4 ? 5 : 4], 0.55);
  }
  // the veil: fog in the opening, banded and swirling, bright at the rim
  splat(b, ox, oy, (u, z) => [u, 0.2, z], -GAP, GAP, 120, GZ0, GPH, 130, (h) => {
    const u = h.p[0], z = h.p[2], uu = u / GAP, w = (z - GZ0) / (GPH - GZ0);
    const sw = vn(u * 0.11 + Math.cos(ph) * 2.2, z * 0.09 + Math.sin(ph) * 2.2, 71) * 0.6 + vn(u * 0.26 - Math.sin(ph) * 1.6, z * 0.2 + Math.cos(ph) * 1.6, 72) * 0.4;
    const band = Math.sin(z * 0.42 + uu * 2 - ph + sw * 4) * 0.5 + 0.5;
    let t = 0.18 + sw * 0.45 + band * 0.22 + (1 - Math.abs(uu)) * 0.12 - w * 0.08;
    const edge = Math.min(GAP - Math.abs(u), z - GZ0, GPH - z);
    if (edge < 0.9 + pulse * 0.7) t = 0.92;
    else if (edge < 4.5) t += 0.26 * (1 - (edge - 0.9) / 3.6);
    return tone(COLD, Math.min(1, t), h.sx, h.sy);
  }, 0, false);
  // wisps floating out of the veil, rising and thinning
  for (let k = 0; k < 30; k++) {
    const life = (f / N + hash(k, 1, 91)) % 1, u0 = (hash(k, 2, 91) - 0.5) * 2 * (GAP - 3), z0 = GZ0 + 6 + hash(k, 3, 91) * (GPH - GZ0 - 16);
    const v = 2 + life * (22 + hash(k, 4, 91) * 20), z = z0 + life * 9 + Math.sin(life * 6 + k) * 1.5, u = u0 * (1 + life * 0.5) + Math.sin(life * 5 + k) * 2;
    const x = Math.round(ox + u - v), y = Math.round(oy + (u + v) / 2 - z);
    const c = COLD[life < 0.5 ? 6 : life < 0.8 ? 5 : 4];
    b.put(x, y, c, 1e6); if (k % 3 === 0 && life < 0.7) b.put(x + 1, y, COLD[5], 1e6);
  }
  return b;
}
