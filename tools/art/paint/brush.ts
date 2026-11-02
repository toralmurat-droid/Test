import { createCanvas, type Canvas as NCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { shade } from "../canvas";

/**
 * Painting primitives for the smooth (non-pixel) character art: soft volumes lit from the top-left,
 * tapered limbs, polished metal, cloth folds and grain. Everything works in logical 32px-frame units;
 * the context is pre-scaled so a unit is several real pixels.
 */
export type C2 = SKRSContext2D;
export type P = [number, number];

export const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
export const sh = shade;
export const mix = (a: number, b: number, t: number) => {
  const m = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
};
export const rad = (d: number) => (d * Math.PI) / 180;

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
export function hashStr(s: string) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }

/** Direction the light comes from (screen top-left). */
const LX = -0.55, LY = -0.83;

export function canvas(w: number, h: number): NCanvas { return createCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))); }

/** Builds a closed path on ctx. */
export type Shape = (c: C2) => void;

export function poly(pts: P[]): Shape {
  return (c) => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };
}
/** Smooth closed curve through points (quadratic midpoints). */
export function blobPath(pts: P[]): Shape {
  return (c) => {
    const n = pts.length, mid = (i: number): P => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
    const m0 = mid(n - 1);
    c.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) { const m = mid(i); c.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
    c.closePath();
  };
}
export function ellipseP(x: number, y: number, rx: number, ry: number, rot = 0): Shape {
  return (c) => { c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2); };
}

export function fillShape(c: C2, s: Shape, style: string | CanvasGradient | any) {
  c.beginPath(); s(c); c.fillStyle = style; c.fill();
}
export function clipTo(c: C2, s: Shape, fn: () => void) {
  c.save(); c.beginPath(); s(c); c.clip(); fn(); c.restore();
}

export interface VolOpts { hi?: number; lo?: number; ao?: number; spec?: number }
/**
 * A soft volume: radial light from the top-left of its box, darker toward the bottom-right,
 * with a faint occlusion band along its edge.
 */
export function vol(c: C2, s: Shape, col: number, box: [number, number, number, number], o: VolOpts = {}) {
  const [x, y, w, h] = box;
  const r = Math.max(w, h) * 0.95;
  const g = c.createRadialGradient(x + w * 0.32, y + h * 0.25, 0, x + w * 0.45, y + h * 0.45, r);
  g.addColorStop(0, css(sh(col, o.hi ?? 1.22)));
  g.addColorStop(0.4, css(col));
  g.addColorStop(1, css(sh(col, o.lo ?? 0.4)));
  fillShape(c, s, g);
  const ao = (o.ao ?? 0.45) * 1.25;
  if (ao > 0) clipTo(c, s, () => {
    c.beginPath(); s(c);
    c.strokeStyle = css(sh(col, 0.32), ao); c.lineWidth = Math.min(w, h) * 0.22; c.stroke();
  });
  if (o.spec) clipTo(c, s, () => {
    const sg = c.createRadialGradient(x + w * 0.3, y + h * 0.22, 0, x + w * 0.3, y + h * 0.22, Math.min(w, h) * 0.45);
    sg.addColorStop(0, `rgba(255,248,225,${o.spec})`); sg.addColorStop(1, "rgba(255,248,225,0)");
    c.fillStyle = sg; c.fillRect(x, y, w, h);
  });
}

/** Polished metal: banded gradient along an axis (sharp highlight + dark core), plus a specular glint. */
export function metal(c: C2, s: Shape, col: number, a: P, b: P, glint = 0.55) {
  const g = c.createLinearGradient(a[0], a[1], b[0], b[1]);
  g.addColorStop(0, css(sh(col, 0.5)));
  g.addColorStop(0.18, css(sh(col, 1.08)));
  g.addColorStop(0.3, css(sh(col, 1.28)));
  g.addColorStop(0.42, css(sh(col, 0.85)));
  g.addColorStop(0.7, css(sh(col, 0.45)));
  g.addColorStop(0.88, css(sh(col, 0.62)));
  g.addColorStop(1, css(sh(col, 0.34)));
  fillShape(c, s, g);
  // worn, scratched surface
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 2;
  grain(c, s, [Math.min(a[0], b[0]) - len, Math.min(a[1], b[1]) - len, len * 2 + Math.abs(b[0] - a[0]), len * 2 + Math.abs(b[1] - a[1])], col, ((a[0] * 73 + a[1] * 151) | 0) >>> 0, Math.min(60, len * 6) | 0, 0.22, 0.5, 0.3);
  if (glint > 0) clipTo(c, s, () => {
    const gx = a[0] + (b[0] - a[0]) * 0.28, gy = a[1] + (b[1] - a[1]) * 0.28;
    const rg = c.createRadialGradient(gx, gy, 0, gx, gy, 1.6);
    rg.addColorStop(0, `rgba(255,246,220,${glint})`); rg.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = rg; c.fillRect(gx - 2, gy - 2, 4, 4);
  });
}

/** Tapered capsule from a to b, shaded across its width toward the light. */
export function limb(c: C2, a: P, b: P, wa: number, wb: number, col: number, o: { metal?: boolean; lo?: number; hi?: number } = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 0.001;
  const nx = -dy / len, ny = dx / len, ang = Math.atan2(dy, dx);
  const s: Shape = (cc) => {
    cc.moveTo(a[0] + nx * wa / 2, a[1] + ny * wa / 2);
    cc.lineTo(b[0] + nx * wb / 2, b[1] + ny * wb / 2);
    cc.arc(b[0], b[1], wb / 2, ang + Math.PI / 2, ang - Math.PI / 2, true);
    cc.lineTo(a[0] - nx * wa / 2, a[1] - ny * wa / 2);
    cc.arc(a[0], a[1], wa / 2, ang - Math.PI / 2, ang + Math.PI / 2, true);
    cc.closePath();
  };
  const lit = nx * LX + ny * LY > 0 ? 1 : -1, w = Math.max(wa, wb) / 2;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const p0: P = [mx + nx * w * lit, my + ny * w * lit], p1: P = [mx - nx * w * lit, my - ny * w * lit];
  if (o.metal) { metal(c, s, col, p0, p1, 0.5); return s; }
  const g = c.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
  g.addColorStop(0, css(sh(col, o.hi ?? 1.22)));
  g.addColorStop(0.3, css(sh(col, 1.04)));
  g.addColorStop(0.62, css(sh(col, 0.9)));
  g.addColorStop(1, css(sh(col, o.lo ?? 0.42)));
  fillShape(c, s, g);
  return s;
}

/** A thin stroked line (detail work: seams, straps, folds). */
export function line(c: C2, pts: P[], col: number, w: number, a = 1, cap: CanvasLineCap = "round") {
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.strokeStyle = css(col, a); c.lineWidth = w; c.lineCap = cap; c.lineJoin = "round"; c.stroke();
}
export function curve(c: C2, a: P, ctl: P, b: P, col: number, w: number, al = 1) {
  c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(ctl[0], ctl[1], b[0], b[1]);
  c.strokeStyle = css(col, al); c.lineWidth = w; c.lineCap = "round"; c.stroke();
}

/** Painterly grain inside a shape: many short low-contrast strokes, darker low and right. */
export function grain(c: C2, s: Shape, box: [number, number, number, number], col: number, seed: number, n = 40, amt = 0.18, len = 0.6, ang = -0.5) {
  const r = rng(seed);
  const [x, y, w, h] = box;
  clipTo(c, s, () => {
    c.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const px = x + r() * w, py = y + r() * h;
      const lit = (-(px - x) / w - (py - y) / h) * 0.5 + 0.5 + (r() - 0.5) * 0.6;
      c.strokeStyle = css(sh(col, lit > 0.55 ? 1.35 : 0.55), amt * (0.5 + r() * 0.5));
      c.lineWidth = 0.12 + r() * 0.14;
      const a = ang + (r() - 0.5) * 0.8, l = len * (0.5 + r());
      c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); c.stroke();
    }
  });
}

/** Soft glow (additive-looking light blob). */
export function glow(c: C2, x: number, y: number, r: number, col: number, a = 0.8) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, css(mix(col, 0xffffff, 0.6), a)); g.addColorStop(0.35, css(col, a * 0.6)); g.addColorStop(1, css(col, 0));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}

/** Two-bone IK: elbow/knee for a joint chain from s to h; `pick` scores the two candidate bends. */
export function ik(s: P, h: P, l1: number, l2: number, pick: (e: P) => number): [P, P] {
  let dx = h[0] - s[0], dy = h[1] - s[1], d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.02;
  let end: P = h;
  if (d > max) { end = [s[0] + dx / d * max, s[1] + dy / d * max]; dx = end[0] - s[0]; dy = end[1] - s[1]; d = max; }
  if (d < 0.01) return [[s[0], s[1] + l1], end];
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const bx = s[0] + dx * a / d, by = s[1] + dy * a / d, px = -dy / d, py = dx / d;
  const e1: P = [bx + px * hh, by + py * hh], e2: P = [bx - px * hh, by - py * hh];
  return [pick(e1) >= pick(e2) ? e1 : e2, end];
}
