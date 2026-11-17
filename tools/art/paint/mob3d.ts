/**
 * 3D-built monsters (Murat 2026-11-17: "rebuild all mobs in 3D turned to isometric, like the vampire"). A monster is a
 * small model of soft shapes (signed distance fields) built in its own frame (x forward, y to its left, z up, units =
 * world px), turned to a facing and ray-cast from the game's iso camera (30 degrees down) straight onto the mob sheet's
 * texel grid (1.5 texels per world px). Same light as body3d.ts (upper left), real occlusion, ambient occlusion in the
 * folds, wet/metal glints, emissive parts (fire, runes, eyes) and see-through jelly that shows what floats inside.
 * The result is ordinary pixel art in the old sheet format, baked at build time: the game pays nothing extra.
 */
import { shade } from "../canvas";

export type V3 = [number, number, number];
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const SIN = 0.5, COS = Math.sqrt(3) / 2;

// ---- materials -------------------------------------------------------------------------------------------------
/** A ramp dark -> light plus how the surface reacts: glints, grain, glow, see-through jelly. */
export interface Mat {
  ramp: number[];
  /** Specular glint strength (wet slime, metal). */ spec: number;
  /** Fine surface noise (stone, rust, fur). */ grain: number;
  /** Lit from inside: never darker than this (0..1). */ emit: number;
  /** 0..1: how much of what floats inside shows through. */ jelly: number;
  /** Specular sharpness. */ shine: number;
}
const rampCache = new Map<string, number[]>();
/** A ramp from one colour with the house hue shift (cool shadows, warm lights), like body3d.ts. */
export function ramp(col: number, n = 7, lo = 0.34, hi = 1.32): number[] {
  const mx = Math.max((col >> 16) & 255, (col >> 8) & 255, col & 255) / 255;
  hi = Math.max(hi, Math.min(2.8, 0.62 / Math.max(mx, 0.05)));
  const key = `${col}:${n}:${lo}:${hi}`;
  let r = rampCache.get(key);
  if (!r) {
    r = Array.from({ length: n }, (_, i) => {
      const f = lo + (hi - lo) * (i / (n - 1));
      if (f <= 1.2) return shade(col, f);
      const c = shade(col, 1.2), k = f / 1.2;
      const ch = (v: number) => Math.min(255, Math.round(v * k + (k - 1) * 6));
      return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
    });
    rampCache.set(key, r);
  }
  return r;
}
export type MatOpts = Partial<Omit<Mat, "ramp">> & { lo?: number; hi?: number; n?: number; ramp?: number[] };
export const mat = (col: number, o: MatOpts = {}): Mat => ({
  ramp: o.ramp ?? ramp(col, o.n ?? 7, o.lo ?? 0.34, o.hi ?? 1.32),
  spec: o.spec ?? 0, grain: o.grain ?? 0, emit: o.emit ?? 0, jelly: o.jelly ?? 0, shine: o.shine ?? 18,
});

// ---- signed distance primitives (model space) -------------------------------------------------------------------
/** `k` = how softly it melts into what came before; `cut` carves it out instead; `inner` floats inside jelly. */
export interface Prim { d: (x: number, y: number, z: number) => number; m: Mat; k: number; lo: V3; hi: V3; cut?: boolean; inner?: boolean }
type Extra = { k?: number; cut?: boolean; inner?: boolean };
const box3 = (c: V3, r: number): [V3, V3] => [[c[0] - r, c[1] - r, c[2] - r], [c[0] + r, c[1] + r, c[2] + r]];

export function sphere(c: V3, r: number, m: Mat, o: Extra = {}): Prim {
  const [lo, hi] = box3(c, r + 0.5);
  return { m, k: o.k ?? 0.6, cut: o.cut, inner: o.inner, lo, hi, d: (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r };
}
/** Ellipsoid with radii r (x forward, y side, z up), optionally tipped by `pitch` (about y, + lifts the front). */
export function ell(c: V3, r: V3, m: Mat, o: Extra & { pitch?: number; yaw?: number } = {}): Prim {
  const [lo, hi] = box3(c, Math.max(...r) + 0.5);
  const cp = Math.cos(o.pitch ?? 0), sp = Math.sin(o.pitch ?? 0), cy = Math.cos(o.yaw ?? 0), sy = Math.sin(o.yaw ?? 0);
  return { m, k: o.k ?? 1, cut: o.cut, inner: o.inner, lo, hi, d: (x, y, z) => {
    let qx = x - c[0], qy = y - c[1], qz = z - c[2];
    if (o.yaw) { const a = qx * cy + qy * sy; qy = -qx * sy + qy * cy; qx = a; }
    if (o.pitch) { const a = qx * cp + qz * sp; qz = -qx * sp + qz * cp; qx = a; }
    const a = qx / r[0], b = qy / r[1], h = qz / r[2];
    const k0 = Math.hypot(a, b, h), k1 = Math.hypot(a / r[0], b / r[1], h / r[2]);
    return k1 === 0 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
  } };
}
/** Tapered capsule a (radius ra) -> b (radius rb). */
export function cap(a: V3, b: V3, ra: number, rb: number, m: Mat, o: Extra = {}): Prim {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], bb = bx * bx + by * by + bz * bz || 1e-6, R = Math.max(ra, rb) + 0.5;
  return { m, k: o.k ?? 0.5, cut: o.cut, inner: o.inner,
    lo: [Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.min(a[2], b[2]) - R], hi: [Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R, Math.max(a[2], b[2]) + R],
    d: (x, y, z) => {
      const px = x - a[0], py = y - a[1], pz = z - a[2];
      const h = clamp((px * bx + py * by + pz * bz) / bb);
      return Math.hypot(px - bx * h, py - by * h, pz - bz * h) - (ra + (rb - ra) * h);
    } };
}
/** A chain of capsules through the points (tapering from r0 to r1). */
export function chain(pts: V3[], r0: number, r1: number, m: Mat, o: Extra = {}): Prim[] {
  return pts.slice(1).map((p, i) => cap(pts[i], p, r0 + (r1 - r0) * (i / (pts.length - 1)), r0 + (r1 - r0) * ((i + 1) / (pts.length - 1)), m, { k: 0.2, ...o }));
}
/** Torus lying flat (axis z) of ring radius R and tube radius r, tilted by `tilt` about x. */
export function torus(c: V3, R: number, r: number, m: Mat, o: Extra & { tilt?: number } = {}): Prim {
  const [lo, hi] = box3(c, R + r + 0.5), ct = Math.cos(o.tilt ?? 0), st = Math.sin(o.tilt ?? 0);
  return { m, k: o.k ?? 0.2, cut: o.cut, inner: o.inner, lo, hi, d: (x, y, z) => {
    let qy = y - c[1], qz = z - c[2]; const qx = x - c[0];
    if (o.tilt) { const a = qy * ct + qz * st; qz = -qy * st + qz * ct; qy = a; }
    return Math.hypot(Math.hypot(qx, qy) - R, qz) - r;
  } };
}
/** Rounded box with half sizes s, turned by yaw about z and pitch about y. */
export function rbox(c: V3, s: V3, rr: number, m: Mat, o: Extra & { yaw?: number; pitch?: number; roll?: number } = {}): Prim {
  const [lo, hi] = box3(c, Math.hypot(...s) + rr + 0.5);
  const cy = Math.cos(o.yaw ?? 0), sy = Math.sin(o.yaw ?? 0), cp = Math.cos(o.pitch ?? 0), sp = Math.sin(o.pitch ?? 0), cr = Math.cos(o.roll ?? 0), sr = Math.sin(o.roll ?? 0);
  return { m, k: o.k ?? 0.2, cut: o.cut, inner: o.inner, lo, hi, d: (x, y, z) => {
    let qx = x - c[0], qy = y - c[1], qz = z - c[2];
    if (o.yaw) { const a = qx * cy + qy * sy; qy = -qx * sy + qy * cy; qx = a; }
    if (o.pitch) { const a = qx * cp + qz * sp; qz = -qx * sp + qz * cp; qx = a; }
    if (o.roll) { const a = qy * cr + qz * sr; qz = -qy * sr + qz * cr; qy = a; }
    const dx = Math.abs(qx) - s[0], dy = Math.abs(qy) - s[1], dz = Math.abs(qz) - s[2];
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dy, dz), 0) - rr;
  } };
}
/** Cone from base centre b (radius r) to tip t. */
export function cone(b: V3, t: V3, r: number, m: Mat, o: Extra = {}): Prim { return cap(b, t, r, 0.05, m, { k: 0.15, ...o }); }
export function custom(lo: V3, hi: V3, d: Prim["d"], m: Mat, o: Extra = {}): Prim { return { m, k: o.k ?? 0.4, cut: o.cut, inner: o.inner, lo, hi, d }; }

// ---- noise ------------------------------------------------------------------------------------------------------
export function hash3(x: number, y: number, z: number) { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function noise3(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const s = (t: number) => t * t * (3 - 2 * t), ux = s(fx), uy = s(fy), uz = s(fz);
  let r = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
    r += hash3(ix + dx, iy + dy, iz + dz) * (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
  }
  return r;
}
/** Seeded random in [0,1). */
export function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ---- the model and the camera ---------------------------------------------------------------------------------
export interface Model {
  prims: Prim[];
  /** Points that glow as single texels where they can be seen (eyes, gems), in model space. */
  eyes?: { p: V3; col: number }[];
  /** Soft light round emissive parts: tints the body texels near it and the ground under it. */
  halos?: { p: V3; r: number; col: number; a: number }[];
  /** Ground shadow ellipse (model space, z = 0). */
  shadow: { x: number; y: number; rx: number; ry: number; a: number };
  /** Lift the whole model off its shadow (flyers, bobbing). */
  lift?: number;
}

const LIGHT: V3 = (() => { const v: V3 = [-0.55, -0.45, 0.72]; const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();
const VIEW: V3 = [0, -COS, SIN];
const HALF: V3 = (() => { const v: V3 = [LIGHT[0] + VIEW[0], LIGHT[1] + VIEW[1], LIGHT[2] + VIEW[2]]; const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
/** Facings of the mob sheets (left = flipped right): yaw of the model's forward axis in the world. */
export const YAW = { down: -Math.PI / 2, up: Math.PI / 2, right: 0 } as const;

function scene(ps: Prim[], x: number, y: number, z: number, want: { m: Mat | null } | null): number {
  let d = Infinity, best = Infinity;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const ox = Math.max(p.lo[0] - x, 0, x - p.hi[0]), oy = Math.max(p.lo[1] - y, 0, y - p.hi[1]), oz = Math.max(p.lo[2] - z, 0, z - p.hi[2]);
    const out = Math.hypot(ox, oy, oz);
    const di = out > 1.5 + p.k ? out : p.d(x, y, z);
    if (p.cut) { // smooth subtraction: carve it out of what is there
      if (d === Infinity) continue;
      const kk = p.k, h = clamp(0.5 - 0.5 * (d + di) / kk), nd = d * (1 - h) + -di * h + kk * h * (1 - h);
      if (want && Math.abs(di) < 0.35 && d < 0.35) { want.m = p.m; best = Math.abs(di); } // the hole's wall takes the cutter's colour
      d = nd;
      continue;
    }
    if (want && di < best) { best = di; want.m = p.m; }
    if (d === Infinity) d = di;
    else if (di - d > p.k) { /* no blend */ }
    else if (d - di > p.k) d = di;
    else { const kk = p.k, h = clamp(0.5 + 0.5 * (di - d) / kk); d = di * (1 - h) + d * h - kk * h * (1 - h); }
  }
  return d;
}

export interface MobFrame { body: Uint8ClampedArray; under: Uint8ClampedArray }

/**
 * Ray-casts `model` facing `yaw` into a frame of w x h world px (tw x th texels at `tx` per px), the model's origin
 * (its feet) at (w/2, oy) world px from the frame's top-left. Returns the body and, separately, the soft layer under it
 * (ground shadow, halos) so the caller can pixelize the body alone.
 */
export function renderMob(model: Model, yaw: number, w: number, h: number, oy: number, tx = 1.5): MobFrame {
  const tw = Math.round(w * tx), th = Math.round(h * tx);
  const body = new Uint8ClampedArray(tw * th * 4), under = new Uint8ClampedArray(tw * th * 4);
  const depth = new Float32Array(tw * th).fill(Infinity);
  const cy = Math.cos(yaw), sy = Math.sin(yaw), lift = model.lift ?? 0;
  // world -> model: undo the yaw, undo the lift
  const outer = model.prims.filter((p) => !p.inner), inner = model.prims.filter((p) => p.inner);
  // screen bounds of the model
  let x0 = Infinity, x1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of model.prims) for (let c = 0; c < 8; c++) {
    const lx = c & 1 ? p.hi[0] : p.lo[0], ly = c & 2 ? p.hi[1] : p.lo[1], lz = (c & 4 ? p.hi[2] : p.lo[2]) + lift;
    const X = lx * cy - ly * sy, Y = lx * sy + ly * cy, V = Y * SIN + lz * COS;
    x0 = Math.min(x0, X); x1 = Math.max(x1, X); v0 = Math.min(v0, V); v1 = Math.max(v1, V);
  }
  const want = { m: null as Mat | null };
  const loc = (X: number, Y: number, Z: number): V3 => [X * cy + Y * sy, -X * sy + Y * cy, Z - lift];
  const rotN = (n: V3): V3 => [n[0] * cy - n[1] * sy, n[0] * sy + n[1] * cy, n[2]];
  const norm = (ps: Prim[], p: V3): V3 => {
    const e = 0.12, [x, y, z] = p;
    const nx = scene(ps, x + e, y, z, null) - scene(ps, x - e, y, z, null);
    const ny = scene(ps, x, y + e, z, null) - scene(ps, x, y - e, z, null);
    const nz = scene(ps, x, y, z + e, null) - scene(ps, x, y, z - e, null);
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
  const shadeAt = (ps: Prim[], m: Mat, p: V3, i: number, j: number, inside = false): { li: number; nw: V3 } => {
    const n = norm(ps, p), nw = rotN(n);
    const ao = clamp(scene(ps, p[0] + n[0] * 1.1, p[1] + n[1] * 1.1, p[2] + n[2] * 1.1, null) / 1.1);
    const dif = Math.max(0, nw[0] * LIGHT[0] + nw[1] * LIGHT[1] + nw[2] * LIGHT[2]);
    const sky = 0.5 + 0.5 * nw[2];
    let v = (0.03 + dif * 0.72 + sky * 0.15) * (0.45 + 0.55 * ao);
    if (m.spec && !inside) v += Math.pow(Math.max(0, nw[0] * HALF[0] + nw[1] * HALF[1] + nw[2] * HALF[2]), m.shine) * m.spec;
    if (m.grain) v += (hash3(Math.round(p[0] * 2.2), Math.round(p[1] * 2.2), Math.round(p[2] * 2.2)) - 0.5) * m.grain;
    if (m.jelly && !inside) v += m.jelly * 0.22 * (1 - Math.abs(nw[0] * VIEW[0] + nw[1] * VIEW[1] + nw[2] * VIEW[2])); // light through the thin rim
    if (m.emit) v = Math.max(v, m.emit + (v - m.emit) * 0.4);
    const N = m.ramp.length, bay = (BAYER[j & 3][i & 3] + 0.5) / 16 - 0.5;
    return { li: clamp(Math.floor(clamp(v) * N + bay * 0.6), 0, N - 1), nw };
  };
  const put = (a: number, c: number) => { body[a * 4] = (c >> 16) & 255; body[a * 4 + 1] = (c >> 8) & 255; body[a * 4 + 2] = c & 255; body[a * 4 + 3] = 255; };
  for (let j = 0; j < th; j++) {
    const V = oy - (j + 0.5) / tx;
    if (V < v0 - 0.5 || V > v1 + 0.5) continue;
    for (let i = 0; i < tw; i++) {
      const X = (i + 0.5) / tx - w / 2;
      if (X < x0 - 0.5 || X > x1 + 0.5) continue;
      const D0 = -40, Z0 = (V - D0 * SIN) / COS;
      let t = 0, hit = false, p: V3 = [0, 0, 0];
      for (let s = 0; s < 160; s++) {
        const Y = D0 + t * COS, Z = Z0 - t * SIN;
        if (Z < -3 || t > 120) break;
        p = loc(X, Y, Z);
        const d = scene(outer, p[0], p[1], p[2], null);
        if (d < 0.025) { hit = true; break; }
        t += Math.max(0.03, d * 0.8);
      }
      if (!hit) continue;
      want.m = null; scene(outer, p[0], p[1], p[2], want);
      const m = want.m!;
      const { li } = shadeAt(outer, m, p, i, j);
      let col = m.ramp[li];
      // jelly: look on into the body for what floats inside
      if (m.jelly && inner.length) {
        let tt = t, thick = 0;
        for (let s = 0; s < 80; s++) {
          tt += 0.3; thick += 0.3;
          const q = loc(X, D0 + tt * COS, Z0 - tt * SIN);
          if (scene(outer, q[0], q[1], q[2], null) > 0.05) break; // out the back
          const di = scene(inner, q[0], q[1], q[2], null);
          if (di < 0.03) {
            want.m = null; scene(inner, q[0], q[1], q[2], want);
            const im = want.m!, r = shadeAt(inner, im, q, i, j, true);
            const ic = im.ramp[r.li], k = clamp(m.jelly * (1.15 - thick * 0.06));
            col = mixc(col, ic, k);
            break;
          }
        }
      }
      put(j * tw + i, col);
      depth[j * tw + i] = t;
    }
  }
  // inner lines: a part seen just behind a nearer one gets a darker edge
  const out = new Uint8ClampedArray(body);
  for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
    const a = j * tw + i; if (depth[a] === Infinity) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= tw || jj >= th) continue;
      const b = jj * tw + ii;
      if (depth[b] !== Infinity && depth[a] - depth[b] > 2.0) { for (let c = 0; c < 3; c++) out[a * 4 + c] = Math.round(out[a * 4 + c] * 0.5 + [0x1a, 0x14, 0x20][c] * 0.5); break; }
    }
  }
  body.set(out);
  const scr = (q: V3): [number, number, number] => {
    const X = q[0] * cy - q[1] * sy, Y = q[0] * sy + q[1] * cy, Z = q[2] + lift;
    return [(X + w / 2) * tx, (oy - (Y * SIN + Z * COS)) * tx, (Y + 40) / COS]; // texel x, y, t along its ray (D0 = -40)
  };
  // halos: light spilling onto the body near the source and onto the ground under it
  for (const H of model.halos ?? []) {
    const [hx, hy] = scr(H.p), R = H.r * tx;
    for (let j = Math.max(0, Math.floor(hy - R)); j < Math.min(th, Math.ceil(hy + R)); j++) for (let i = Math.max(0, Math.floor(hx - R)); i < Math.min(tw, Math.ceil(hx + R)); i++) {
      const q = Math.hypot(i + 0.5 - hx, j + 0.5 - hy) / R; if (q >= 1) continue;
      const a = (j * tw + i) * 4, k = H.a * (1 - q) * (1 - q);
      if (body[a + 3]) { for (let c = 0; c < 3; c++) body[a + c] = Math.min(255, body[a + c] + ((H.col >> (16 - c * 8)) & 255) * k * 0.55); }
      else {
        const na = Math.min(255, under[a + 3] + k * 200);
        for (let c = 0; c < 3; c++) under[a + c] = (H.col >> (16 - c * 8)) & 255;
        under[a + 3] = na;
      }
    }
  }
  // eyes / gems: single bright texels where they show
  for (const e of model.eyes ?? []) {
    const [ex, ey, et] = scr(e.p), i = Math.floor(ex), j = Math.floor(ey);
    if (i < 0 || j < 0 || i >= tw || j >= th) continue;
    const a = j * tw + i;
    if (depth[a] === Infinity || et > depth[a] + 0.7) continue;
    put(a, e.col);
  }
  // ground shadow (under the halos)
  const sh = model.shadow;
  for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
    const a = (j * tw + i) * 4; if (body[a + 3]) continue;
    const X = (i + 0.5) / tx - w / 2, Y = (oy - (j + 0.5) / tx) / SIN; // ground point seen through this texel
    const lx = X * cy + Y * sy - sh.x, ly = -X * sy + Y * cy - sh.y;
    const q = (lx / sh.rx) ** 2 + (ly / sh.ry) ** 2;
    if (q >= 1) continue;
    const sa = Math.round(sh.a * 255 * (q < 0.5 ? 1 : 0.62));
    if (under[a + 3] > sa) continue;
    under[a] = 6; under[a + 1] = 4; under[a + 2] = 10; under[a + 3] = sa;
  }
  return { body, under };
}

export function mixc(a: number, b: number, k: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
