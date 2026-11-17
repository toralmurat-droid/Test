/**
 * 3D-built world props (Murat 2026-11-17: "rebuild decor in 3D like the vampire", baked into image sheets). A prop is
 * a small model of soft shapes (signed distance fields, the prims of mob3d.ts) built in the frame of the runtime prop
 * painter client/src/isoPaint.ts (u down-right, v down-left, z up, all in texels; screen x = ox + u - v,
 * y = oy + (u + v) / 2 - z), so the bake lands exactly where the painted prop stood. Each texel is ray-cast along the
 * view: real occlusion, soft self-shadow from the top-left light, ambient occlusion in the joints, metal glints, glow,
 * and a contact shadow cast by the model's own feet. Shading uses the same flat ramps and ordered dither as the
 * painted props, and the same 1px outline as worldProps.sheet(), so the baked sheet drops in under the same key.
 */
import { hash3, scene, type Mat, type Prim, type V3 } from "./mob3d";

export type { V3 };
/** A prop model: prims plus glowing texels, light spill and a ground ellipse under it (model space, texels). */
export interface PropModel {
  prims: Prim[];
  eyes?: { p: V3; col: number }[];
  halos?: { p: V3; r: number; col: number; a: number }[];
  /** Soft ellipse on the ground (u, v, world radius r), like IsoPaint.shadow. */
  shadow?: { u: number; v: number; r: number; a?: number }[];
  /** Height (texels) of the parts that throw a real shadow on the ground (0 = none). */
  cast?: number;
  /** Painted effects over the model (flames, sparks): px(x, y, colour) in frame texels; `at` = screen point of a model point. */
  overlay?: (px: (x: number, y: number, c: number) => void, at: (q: V3) => [number, number]) => void;
}
/** Per-material colour switch (stripes, quartered shields): another material where `sub` says so. */
export type PMat = Mat & { sub?: (x: number, y: number, z: number) => Mat | undefined };

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dith = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];
const L: V3 = (() => { const l: V3 = [0.32, 0.62, 0.8]; const n = Math.hypot(...l); return [l[0] / n, l[1] / n, l[2] / n]; })();
const VIEW: V3 = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];
const HALF: V3 = (() => { const v: V3 = [L[0] + VIEW[0], L[1] + VIEW[1], L[2] + VIEW[2]]; const n = Math.hypot(...v); return [v[0] / n, v[1] / n, v[2] / n]; })();
export const OUTLINE = 0x15100d;

/** Ramp colour at light l (0..1), the step between two tones dithered (isoPaint.ramp). */
export function rampAt(pal: number[], l: number, x: number, y: number) {
  const c = clamp(l, 0, 1) * (pal.length - 1), i = Math.floor(c);
  return pal[Math.min(pal.length - 1, c - i > dith(x, y) ? i + 1 : i)];
}

/**
 * Renders one frame into an ARGB buffer (0xAARRGGBB, like worldProps.pen) of W x H texels, model origin at (ox, oy).
 * No outline: bakeSheet adds it once per frame, exactly as sheet() does at runtime.
 */
export function renderProp(model: PropModel, W: number, H: number, ox: number, oy: number): Uint32Array {
  const buf = new Uint32Array(W * H), depth = new Float32Array(W * H).fill(-Infinity);
  const ps = model.prims.filter((p) => !p.inner);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of ps) { u0 = Math.min(u0, p.lo[0]); u1 = Math.max(u1, p.hi[0]); v0 = Math.min(v0, p.lo[1]); v1 = Math.max(v1, p.hi[1]); z0 = Math.min(z0, p.lo[2]); z1 = Math.max(z1, p.hi[2]); }
  const at = (X: number, Y: number, s: number): V3 => [(s + X) / 2, (s - X) / 2, s / 2 - Y];
  const sd = (p: V3) => scene(ps, p[0], p[1], p[2], null);
  const norm = (p: V3): V3 => {
    const e = 0.1, [x, y, z] = p;
    const n: V3 = [scene(ps, x + e, y, z, null) - scene(ps, x - e, y, z, null), scene(ps, x, y + e, z, null) - scene(ps, x, y - e, z, null), scene(ps, x, y, z + e, null) - scene(ps, x, y, z - e, null)];
    const l = Math.hypot(...n) || 1; return [n[0] / l, n[1] / l, n[2] / l];
  };
  /** Soft shadow toward the light: 1 = lit, 0 = fully shaded. */
  const sun = (p: V3, maxT = 70) => {
    let t = 0.6, k = 1;
    for (let s = 0; s < 64 && t < maxT; s++) {
      const q: V3 = [p[0] + L[0] * t, p[1] + L[1] * t, p[2] + L[2] * t];
      if (q[2] > z1 + 1) break;
      const d = sd(q);
      if (d < 0.02) return 0;
      k = Math.min(k, 5 * d / t);
      t += Math.max(0.15, d * 0.9);
    }
    return clamp(k);
  };
  const want = { m: null as Mat | null };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = x + 0.5 - ox, Y = y + 0.5 - oy;
    // depth s = u + v runs along the ray; clip it to the model's box
    const sHi = Math.min(2 * u1 - X, 2 * v1 + X, 2 * (z1 + Y)), sLo = Math.max(2 * u0 - X, 2 * v0 + X, 2 * (z0 + Y));
    if (sHi < sLo) continue;
    let s = sHi, hit = false, p: V3 = at(X, Y, s);
    for (let k = 0; k < 220 && s >= sLo; k++) {
      p = at(X, Y, s);
      const d = sd(p);
      if (d < 0.02) { hit = true; break; }
      s -= Math.max(0.04, d * 0.9 / 0.866);
    }
    if (!hit) continue;
    want.m = null; scene(ps, p[0], p[1], p[2], want);
    let m = want.m! as PMat;
    const alt = m.sub?.(p[0], p[1], p[2]); if (alt) m = alt as PMat;
    const n = norm(p);
    const ao = clamp(sd([p[0] + n[0] * 1.4, p[1] + n[1] * 1.4, p[2] + n[2] * 1.4]) / 1.4);
    const dif = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) * (0.35 + 0.65 * sun([p[0] + n[0] * 0.25, p[1] + n[1] * 0.25, p[2] + n[2] * 0.25]));
    let l = (0.28 + 0.74 * dif) * (0.62 + 0.38 * ao) + 0.06 * (0.5 + 0.5 * n[2]);
    if (m.spec) l += Math.pow(Math.max(0, n[0] * HALF[0] + n[1] * HALF[1] + n[2] * HALF[2]), m.shine) * m.spec;
    if (m.grain) l += (hash3(Math.round(p[0] * 1.6), Math.round(p[1] * 1.6), Math.round(p[2] * 1.6)) - 0.5) * m.grain;
    if (m.tex) l += m.tex(p[0], p[1], p[2]);
    if (m.emit) l = Math.max(l, m.emit + (l - m.emit) * 0.4);
    buf[y * W + x] = (0xff000000 | rampAt(m.ramp, l, x, y)) >>> 0;
    depth[y * W + x] = s;
  }
  // inner lines: a part seen just in front of a farther one gets a dark edge on the far side
  const out = new Uint32Array(buf);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = y * W + x; if (depth[a] === -Infinity) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const b = yy * W + xx;
      if (depth[b] !== -Infinity && depth[b] - depth[a] > 3) { out[a] = (0xff000000 | mix(buf[a] & 0xffffff, OUTLINE, 0.55)) >>> 0; break; }
    }
  }
  buf.set(out);
  const scr = (q: V3) => [ox + q[0] - q[1], oy + (q[0] + q[1]) / 2 - q[2], q[0] + q[1]];
  for (const Hh of model.halos ?? []) {
    const [hx, hy] = scr(Hh.p);
    for (let y = Math.max(0, Math.floor(hy - Hh.r)); y < Math.min(H, Math.ceil(hy + Hh.r)); y++) for (let x = Math.max(0, Math.floor(hx - Hh.r)); x < Math.min(W, Math.ceil(hx + Hh.r)); x++) {
      const q = Math.hypot(x + 0.5 - hx, y + 0.5 - hy) / Hh.r, a = y * W + x; if (q >= 1 || !(buf[a] >>> 24)) continue;
      const k = Hh.a * (1 - q) * (1 - q);
      if (k > dith(x, y) * 0.5) buf[a] = (0xff000000 | mix(buf[a] & 0xffffff, Hh.col, Math.min(0.6, k))) >>> 0;
    }
  }
  for (const e of model.eyes ?? []) {
    const [ex, ey, es] = scr(e.p), x = Math.floor(ex), y = Math.floor(ey);
    if (x < 0 || y < 0 || x >= W || y >= H || es < depth[y * W + x] - 0.8) continue;
    buf[y * W + x] = (0xff000000 | e.col) >>> 0;
  }
  // ground: the feet's own shadow (low parts toward the light), then soft ellipses, both dithered like IsoPaint.shadow
  const cast = model.cast ?? 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = y * W + x; if (buf[a] >>> 24) continue;
    const X = x + 0.5 - ox, Y = y + 0.5 - oy, g = at(X, Y, 2 * Y); // ground point (z = 0) seen through this texel
    let al = 0;
    if (cast > 0 && g[0] > u0 - 30 && g[1] > v0 - 30 && g[0] < u1 + 4 && g[1] < v1 + 4) {
      const sh = 1 - sun([g[0], g[1], 0.05], cast / L[2]);
      if (sh > 0.05) al = 0.42 * sh;
    }
    for (const e of model.shadow ?? []) {
      const cx = ox + e.u - e.v, cy = oy + (e.u + e.v) / 2, dx = (x - cx) / (e.r * 1.42), dy = (y - cy) / (e.r * 0.71);
      if (dx * dx + dy * dy <= 1) al = Math.max(al, e.a ?? 0.45);
    }
    if (al > 0 && dith(x, y) < 0.7) buf[a] = (Math.round(al * 255) << 24) >>> 0;
  }
  model.overlay?.((x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) buf[y * W + x] = (0xff000000 | c) >>> 0; }, (q) => [ox + q[0] - q[1], oy + (q[0] + q[1]) / 2 - q[2]]);
  return buf;
}

export function mix(a: number, b: number, k: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k) << s;
  return ch(16) | ch(8) | ch(0);
}

/** worldProps.sheet(): 1px dark outline round each frame's silhouette and the optional soft foot shadow, frames side by side. */
export function bakeSheet(w: number, h: number, frames: number, draw: (f: number) => Uint32Array, shadow = 0): Uint32Array {
  const sheet = new Uint32Array(w * frames * h);
  for (let f = 0; f < frames; f++) {
    const buf = draw(f);
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && buf[y * w + x] >>> 24 > 140;
    const ol = new Uint32Array(buf);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) ol[y * w + x] = ((0xe0 << 24) | OUTLINE) >>> 0;
    }
    if (shadow > 0) for (let y = h - 4; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w * 0.42), dy = (y - (h - 2)) / 2.2;
      if (dx * dx + dy * dy <= 1 && !(ol[y * w + x] >>> 24)) ol[y * w + x] = (Math.round(shadow * 120) << 24) >>> 0;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sheet[y * w * frames + f * w + x] = ol[y * w + x];
  }
  return sheet;
}

// ---- prop building blocks (isoPaint-shaped, so models port one call at a time) ----------------------------------
const lohi = (a: V3, b: V3, r: number): [V3, V3] => [[Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r], [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r]];
/** Axis box [u0,u1]x[v0,v1]x[z0,z1] with edges rounded by rr. */
export function box(u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, m: Mat, rr = 0.3, k = 0.3): Prim {
  const c: V3 = [(u0 + u1) / 2, (v0 + v1) / 2, (z0 + z1) / 2], s: V3 = [(u1 - u0) / 2 - rr, (v1 - v0) / 2 - rr, (z1 - z0) / 2 - rr];
  const [lo, hi] = lohi([u0, v0, z0], [u1, v1, z1], 0.5);
  return { m, k, lo, hi, d: (x, y, z) => {
    const dx = Math.abs(x - c[0]) - s[0], dy = Math.abs(y - c[1]) - s[1], dz = Math.abs(z - c[2]) - s[2];
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dy, dz), 0) - rr;
  } };
}
/** Round rod a -> b (radius r, or ra -> rb tapering). */
export function rod(a: V3, b: V3, r: number, m: Mat, rb = r, k = 0.35): Prim {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], bb = bx * bx + by * by + bz * bz || 1e-6;
  const [lo, hi] = lohi(a, b, Math.max(r, rb) + 0.5);
  return { m, k, lo, hi, d: (x, y, z) => {
    const px = x - a[0], py = y - a[1], pz = z - a[2], h = clamp((px * bx + py * by + pz * bz) / bb);
    return Math.hypot(px - bx * h, py - by * h, pz - bz * h) - (r + (rb - r) * h);
  } };
}
/** Ellipsoid at c with radii (ru, rv, rz); `zCut` keeps only the part above that height (a pot's dome). */
export function blob(c: V3, ru: number, rv: number, rz: number, m: Mat, k = 0.5, zCut = -Infinity): Prim {
  const R = Math.max(ru, rv, rz);
  return { m, k, lo: [c[0] - ru - 0.5, c[1] - rv - 0.5, Math.max(c[2] - rz, zCut) - 0.5], hi: [c[0] + ru + 0.5, c[1] + rv + 0.5, c[2] + rz + 0.5], d: (x, y, z) => {
    const a = (x - c[0]) / ru, b = (y - c[1]) / rv, h = (z - c[2]) / rz;
    const k0 = Math.hypot(a, b, h), k1 = Math.hypot(a / ru, b / rv, h / rz);
    const d = k1 === 0 ? -R : (k0 * (k0 - 1)) / k1;
    return zCut > -Infinity ? Math.max(d, zCut - z) : d;
  } };
}
/**
 * Cloth / net / board: a thin sheet from corner a along e1 (s) and e2 (t), pushed along its normal by warp(s, t).
 * `keep(s, t)` false = a hole (tapered tails, rips, net mesh). Thickness th texels.
 */
export function cloth(a: V3, e1: V3, e2: V3, m: Mat, warp: (s: number, t: number) => number = () => 0, keep: (s: number, t: number) => boolean = () => true, th = 0.45): Prim {
  const l1 = Math.hypot(...e1), l2 = Math.hypot(...e2);
  const u1: V3 = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
  // e2 made orthogonal to e1 so (s, t) are a true frame on the sheet
  const dd = e2[0] * u1[0] + e2[1] * u1[1] + e2[2] * u1[2], w2: V3 = [e2[0] - u1[0] * dd, e2[1] - u1[1] * dd, e2[2] - u1[2] * dd], lw = Math.hypot(...w2);
  const u2: V3 = [w2[0] / lw, w2[1] / lw, w2[2] / lw];
  const n: V3 = [u1[1] * u2[2] - u1[2] * u2[1], u1[2] * u2[0] - u1[0] * u2[2], u1[0] * u2[1] - u1[1] * u2[0]];
  let wmax = 0; for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) wmax = Math.max(wmax, Math.abs(warp(i / 8, j / 8)));
  const far: V3 = [a[0] + e1[0] + e2[0], a[1] + e1[1] + e2[1], a[2] + e1[2] + e2[2]];
  const pts = [a, [a[0] + e1[0], a[1] + e1[1], a[2] + e1[2]], [a[0] + e2[0], a[1] + e2[1], a[2] + e2[2]], far] as V3[];
  const R = wmax + th + 0.6;
  const lo: V3 = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i])) - R) as V3, hi: V3 = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i])) + R) as V3;
  return { m, k: 0.15, lo, hi, d: (x, y, z) => {
    const px = x - a[0], py = y - a[1], pz = z - a[2];
    const S = px * u1[0] + py * u1[1] + pz * u1[2], T = px * u2[0] + py * u2[1] + pz * u2[2], N = px * n[0] + py * n[1] + pz * n[2];
    const s = S / l1, t = T / lw;
    const cs = clamp(s), ct = clamp(t);
    const off = Math.hypot((s - cs) * l1, (t - ct) * lw); // distance past the edge, in the plane
    const dn = Math.abs(N - warp(cs, ct)) * 0.6 - th;
    if (off > 0) return keep(cs, ct) ? Math.max(dn, off) : Math.max(dn, off, 0.35);
    return keep(s, t) ? dn : Math.max(dn, 0.35);
  } };
}
/** Wood grain along an axis ("u" | "v" | "z"): long streaks and the odd dark knot. */
export const grain = (axis: 0 | 1 | 2, amt = 0.16) => (x: number, y: number, z: number) => {
  const p = [x, y, z], a = p[axis], b = p[(axis + 1) % 3], c = p[(axis + 2) % 3];
  return (hash3(Math.floor(b * 1.4 + c * 1.4), Math.floor(a / 4), 7) - 0.5) * amt + (hash3(Math.floor(a), Math.floor(b * 2), Math.floor(c * 2)) < 0.03 ? -0.14 : 0);
};

/** The whole model `k` times bigger (about its foot): for props modelled small, to fill their painted frame. */
export function scaleProp(m: PropModel, k: number): PropModel {
  const sv = (p: V3): V3 => [p[0] * k, p[1] * k, p[2] * k];
  return {
    ...m,
    prims: m.prims.map((p) => ({ ...p, lo: sv(p.lo), hi: sv(p.hi), k: p.k * k, d: (x: number, y: number, z: number) => p.d(x / k, y / k, z / k) * k })),
    eyes: m.eyes?.map((e) => ({ ...e, p: sv(e.p) })), overlay: m.overlay && ((px, at) => m.overlay!(px, (q) => at(sv(q)))), halos: m.halos?.map((h) => ({ ...h, p: sv(h.p), r: h.r * k })),
    shadow: m.shadow?.map((s) => ({ ...s, u: s.u * k, v: s.v * k, r: s.r * k })), cast: (m.cast ?? 0) * k,
  };
}
