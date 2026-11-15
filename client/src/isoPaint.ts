import type { Pen } from "./worldProps";

/**
 * A tiny 3D painter for props drawn as true isometric pixel art: shapes are built in world-like space (u runs down-right
 * on screen, v down-left, z up, all in texels) and sampled densely onto the pen, with a depth buffer so nearer parts
 * hide farther ones whatever order they are drawn in. Faces are lit from the top left by their normal and shaded in
 * flat colour steps with ordered dithering, like the bonfire. The sheet() outline then rings the silhouette.
 *
 * Screen point of (u, v, z): x = ox + u - v, y = oy + (u + v) / 2 - z. Nearer to the viewer = larger u + v + z.
 */
export type V3 = [number, number, number];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const dith = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];
/** Deterministic 0..1 noise for grain, knots and wear. */
export const hsh = (a: number, b: number, s = 0) => {
  let h = Math.imul(Math.round(a) * 73 + 11 + s * 977, 374761393) ^ Math.imul(Math.round(b) + 5 + s * 131, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Light comes from the top left of the screen: strongest on tops, then the v (left) faces, weakest on u (right) faces. */
const L: V3 = (() => { const l: V3 = [0.32, 0.62, 0.8]; const n = Math.hypot(...l); return [l[0] / n, l[1] / n, l[2] / n]; })();
const VIEW: V3 = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];

/** Colour of a ramp at light `l` (0 dark .. 1 lit), with the step between two tones dithered. */
export function ramp(pal: number[], l: number, x: number, y: number) {
  const c = Math.max(0, Math.min(pal.length - 1, l * (pal.length - 1))), i = Math.floor(c);
  return pal[Math.min(pal.length - 1, c - i > dith(x, y) ? i + 1 : i)];
}

/** Paints a surface sample: `l` is the light on it (0..1), (s, t) where it is on the surface, (x, y) the screen pixel. */
export type Mat = (l: number, s: number, t: number, x: number, y: number) => number | undefined;
/** Plain material from a ramp, `bias` shifts it lighter (+) or darker (-). */
export const mat = (pal: number[], bias = 0, k = 1): Mat => (l, _s, _t, x, y) => ramp(pal, l * k + bias, x, y);

export class IsoPaint {
  private zb: Float32Array;
  /** Optional: told which model point (u, v, z) won each pixel, so a caller can clip or outline by ownership. */
  onPlot?: (x: number, y: number, u: number, v: number, z: number) => void;
  constructor(public p: Pen, public W: number, public H: number, public ox: number, public oy: number) {
    this.zb = new Float32Array(W * H).fill(-1e9);
  }
  x(u: number, v: number) { return this.ox + u - v; }
  y(u: number, v: number, z: number) { return this.oy + (u + v) / 2 - z; }
  /** Light on a surface with normal n (flipped toward the viewer, so cloth is lit on whichever side we see). */
  light(n: V3) {
    let d = n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2];
    const s = d < 0 ? -1 : 1;
    d = (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) * s;
    return Math.max(0, Math.min(1, 0.3 + 0.72 * d));
  }
  /** One sample; returns true if it was drawn (nearer than what is there). `bias` lets a decal win over its own surface. */
  plot(u: number, v: number, z: number, c: number | undefined, bias = 0) {
    if (c === undefined) return false;
    const x = Math.round(this.x(u, v) - 0.5), y = Math.round(this.y(u, v, z) - 0.5);
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return false;
    const d = u + v + z + bias, i = y * this.W + x;
    if (d < this.zb[i]) return false;
    this.zb[i] = d; this.p.px(x, y, c); this.onPlot?.(x, y, u, v, z);
    return true;
  }
  /** A parametric surface (s, t in 0..1) returning its point and normal; sampled finely enough to leave no holes. */
  surf(f: (s: number, t: number) => [V3, V3], ns: number, nt: number, m: Mat, bias = 0) {
    for (let j = 0; j <= nt; j++) for (let i = 0; i <= ns; i++) {
      const s = i / ns, t = j / nt, [q, n] = f(s, t);
      const x = Math.round(this.x(q[0], q[1]) - 0.5), y = Math.round(this.y(q[0], q[1], q[2]) - 0.5);
      this.plot(q[0], q[1], q[2], m(this.light(n), s, t, x, y), bias);
    }
  }
  /** A surface given only by its points; normals come from neighbouring points (cloth, fronds, a sagging roof). */
  sheet(f: (s: number, t: number) => V3, ns: number, nt: number, m: Mat, bias = 0) {
    const e = 1e-3;
    this.surf((s, t) => {
      const q = f(s, t), a = f(Math.min(1, s + e), t), b = f(s, Math.min(1, t + e)), a0 = f(Math.max(0, s - e), t), b0 = f(s, Math.max(0, t - e));
      return [q, norm(cross([a[0] - a0[0], a[1] - a0[1], a[2] - a0[2]], [b[0] - b0[0], b[1] - b0[1], b[2] - b0[2]]))];
    }, ns, nt, m, bias);
  }
  /** Axis box [u0,u1]x[v0,v1]x[z0,z1]; `m` gets (s, t) along the face (s across, t up; on the top s = u, t = v). */
  box(u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, m: Mat, faces = 7) {
    const du = u1 - u0, dv = v1 - v0, dz = z1 - z0, k = 2.2;
    if (faces & 1) this.surf((s, t) => [[u0 + s * du, v0 + t * dv, z1], [0, 0, 1]], Math.ceil(du * k) + 1, Math.ceil(dv * k) + 1, m);
    if (faces & 2) this.surf((s, t) => [[u0 + s * du, v1, z0 + t * dz], [0, 1, 0]], Math.ceil(du * k) + 1, Math.ceil(dz * k) + 1, m);
    if (faces & 4) this.surf((s, t) => [[u1, v0 + s * dv, z0 + t * dz], [1, 0, 0]], Math.ceil(dv * k) + 1, Math.ceil(dz * k) + 1, m);
  }
  /** Round rod from a to b, radius r (a stick, a pole, a spear shaft). `s` runs along it. */
  rod(a: V3, b: V3, r: number, m: Mat) {
    const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d) || 1;
    const t: V3 = [d[0] / len, d[1] / len, d[2] / len];
    const ref: V3 = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let e1 = cross(t, ref); e1 = norm(e1); const e2 = cross(t, e1);
    this.surf((s, a2) => {
      const ang = a2 * Math.PI * 2, c = Math.cos(ang), sn = Math.sin(ang);
      const n: V3 = [e1[0] * c + e2[0] * sn, e1[1] * c + e2[1] * sn, e1[2] * c + e2[2] * sn];
      return [[a[0] + d[0] * s + n[0] * r, a[1] + d[1] * s + n[1] * r, a[2] + d[2] * s + n[2] * r], n];
    }, Math.ceil(len * 2.4) + 1, Math.max(8, Math.ceil(r * 14)), m);
  }
  /** Ellipsoid centred at c with radii (ru, rv, rz); `s` = around, `t` = bottom (0) to top (1). */
  blob(c: V3, ru: number, rv: number, rz: number, m: Mat, t0 = 0, t1 = 1) {
    const big = Math.max(ru, rv, rz);
    this.surf((s, t) => {
      const th = s * Math.PI * 2, ph = (t0 + (t1 - t0) * t) * Math.PI - Math.PI / 2;
      const cx = Math.cos(ph) * Math.cos(th), cy = Math.cos(ph) * Math.sin(th), cz = Math.sin(ph);
      return [[c[0] + cx * ru, c[1] + cy * rv, c[2] + cz * rz], norm([cx / ru, cy / rv, cz / rz])];
    }, Math.ceil(big * 10) + 8, Math.ceil(big * 5) + 6, m);
  }
  /** Flat quad from corner a along edges e1 and e2 (cloth, a board, a net). */
  quad(a: V3, e1: V3, e2: V3, m: Mat, warp?: (s: number, t: number) => number, bias = 0) {
    const n = norm(cross(e1, e2)), l1 = Math.hypot(...e1), l2 = Math.hypot(...e2);
    this.surf((s, t) => {
      const w = warp ? warp(s, t) : 0;
      // a warped cloth leans its normal with the slope of the wave, so folds catch the light
      let nn = n;
      if (warp) { const ds = (warp(Math.min(1, s + 0.02), t) - w) / (0.02 * l1); nn = norm([n[0] - e1[0] / l1 * ds, n[1] - e1[1] / l1 * ds, n[2] - e1[2] / l1 * ds]); }
      return [[a[0] + e1[0] * s + e2[0] * t + n[0] * w, a[1] + e1[1] * s + e2[1] * t + n[1] * w, a[2] + e1[2] * s + e2[2] * t + n[2] * w], nn];
    }, Math.ceil(l1 * 2.4) + 1, Math.ceil(l2 * 2.4) + 1, m, bias);
  }
  /** Dithered contact shadow on the ground, an ellipse under (u, v) of world radius r. */
  shadow(u: number, v: number, r: number, a = 0.45) {
    const cx = this.x(u, v), cy = this.y(u, v, 0), rx = r * 1.42, ry = r * 0.71;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1 && dith(x, y) < 0.7 && x >= 0 && y >= 0 && x < this.W && y < this.H && this.zb[y * this.W + x] < -1e8) this.p.px(x, y, 0x000000, a);
    }
  }
}

/**
 * A pen onto a hiResTexture canvas (drawn in texture units): one IsoPaint pixel is one pixelize cell, so the 3D
 * painters can feed the ds_/up_ textures at the same art resolution as their neighbours. `k` = cells per unit.
 */
export function canvasPen(c: CanvasRenderingContext2D, k: number): Pen {
  const px = (x: number, y: number, col: number, a = 1) => {
    c.fillStyle = `rgba(${(col >> 16) & 255},${(col >> 8) & 255},${col & 255},${a})`;
    c.fillRect(x / k, y / k, 1 / k, 1 / k);
  };
  return { px } as Pen;
}

export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): V3 => { const n = Math.hypot(...a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
