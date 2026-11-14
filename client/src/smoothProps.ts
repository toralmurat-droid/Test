import { pixelize } from "./pixelize";
import Phaser from "phaser";
import { hiResTexture, overrideTexture, smoothCopy } from "./smooth";
import { T } from "../../shared/map";

/**
 * Painted isometric versions of the front-view props around the witch and the blacksmith (forge, anvil, weapon
 * rack, cauldron, candles, toadstools, herb rack, witch hut). They are painted straight into a high-resolution copy
 * of the "props" atlas at the same frame rectangles, so frame names, pivots and animations stay the same.
 *
 * Geometry: a point (u, v, z) in a frame (u along world x, v along world y, z up) is drawn at
 * x = ox + (u - v), y = oy + (u + v) / 2 - z, with (ox, oy) the footprint centre.
 */
const S = 4; // texture px per atlas px

export type Pt = [number, number];
type Ctx = CanvasRenderingContext2D;

export function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}
export const col = (c: number, k = 1, a = 1) => `rgba(${Math.min(255, ((c >> 16) & 255) * k) | 0},${Math.min(255, ((c >> 8) & 255) * k) | 0},${Math.min(255, (c & 255) * k) | 0},${a})`;

export class Iso {
  constructor(public ctx: Ctx, public ox: number, public oy: number) {}
  p(u: number, v: number, z = 0): Pt { return [this.ox + (u - v), this.oy + (u + v) / 2 - z]; }
  poly(pts: Pt[], fill: string | CanvasGradient, stroke?: string, lw = 0.3) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts.slice(1)) c.lineTo(q[0], q[1]);
    c.closePath(); c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }
  /** Soft contact shadow under a footprint. */
  shadow(u0: number, v0: number, u1: number, v1: number, spread = 3, a = 0.5) {
    const c = this.ctx, [cx, cy] = this.p((u0 + u1) / 2, (v0 + v1) / 2);
    const rx = ((u1 - u0) + (v1 - v0)) / 2 + spread * 2, ry = rx / 2;
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, `rgba(8,6,4,${a})`); g.addColorStop(0.6, `rgba(8,6,4,${a * 0.55})`); g.addColorStop(1, "rgba(8,6,4,0)");
    c.save(); c.translate(cx, cy); c.scale(1, ry / rx); c.translate(-cx, -cy);
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, rx, 0, Math.PI * 2); c.fill(); c.restore();
  }
  /**
   * Box [u0,u1]x[v0,v1]x[z0,z1]: the two visible sides (left = the v1 side facing down-left, right = the u1 side
   * facing down-right) and the top. `face` paints texture onto a side, clipped to it.
   */
  box(u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, base: number,
    face?: (side: "L" | "R", o: Pt, du: Pt, dz: Pt, len: number, h: number) => void, top = true) {
    const P = this.p.bind(this);
    const L: Pt[] = [P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z1), P(u0, v1, z1)];
    const R: Pt[] = [P(u1, v1, z0), P(u1, v0, z0), P(u1, v0, z1), P(u1, v1, z1)];
    const T: Pt[] = [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)];
    this.poly(L, col(base, 0.78));
    if (face) { this.ctx.save(); this.clip(L); face("L", P(u0, v1, z0), [1, 0.5], [0, -1], u1 - u0, z1 - z0); this.ctx.restore(); }
    this.poly(R, col(base, 0.56));
    if (face) { this.ctx.save(); this.clip(R); face("R", P(u1, v1, z0), [1, -0.5], [0, -1], v1 - v0, z1 - z0); this.ctx.restore(); }
    if (top) this.poly(T, col(base, 1.05));
    // edge light on the front vertical edge and the top rim
    const c = this.ctx;
    c.strokeStyle = col(base, 1.35, 0.55); c.lineWidth = 0.35;
    c.beginPath(); c.moveTo(...P(u1, v1, z0)); c.lineTo(...P(u1, v1, z1)); c.stroke();
    if (top) { c.beginPath(); c.moveTo(...P(u0, v1, z1)); c.lineTo(...P(u1, v1, z1)); c.lineTo(...P(u1, v0, z1)); c.stroke(); }
  }
  clip(pts: Pt[]) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts.slice(1)) c.lineTo(q[0], q[1]);
    c.closePath(); c.clip();
  }
}

/** Stone courses on a box side: staggered blocks with varied tone, dark joints and a lit top edge. */
export function stones(ctx: Ctx, seed: number, base: number, shade: number) {
  const r = rng(seed);
  return (side: "L" | "R", o: Pt, du: Pt, dz: Pt, len: number, h: number) => {
    const bh = 3.4, k = side === "L" ? 0.8 : 0.58;
    for (let row = 0, z = 0; z < h; row++, z += bh) {
      let u = row % 2 ? -2.5 : 0;
      while (u < len) {
        const w = 3.5 + r() * 3;
        const t = (0.82 + r() * 0.3) * k * shade;
        const a: Pt = [o[0] + du[0] * u + dz[0] * z, o[1] + du[1] * u + dz[1] * z];
        const q = (uu: number, zz: number): Pt => [a[0] + du[0] * uu + dz[0] * zz, a[1] + du[1] * uu + dz[1] * zz];
        const pts = [q(0.25, 0.25), q(w - 0.25, 0.25), q(w - 0.25, bh - 0.25), q(0.25, bh - 0.25)];
        ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.closePath();
        const g = ctx.createLinearGradient(...q(0, bh), ...q(0, 0));
        g.addColorStop(0, col(base, t * 0.85)); g.addColorStop(1, col(base, t * 1.12));
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = col(base, t * 1.4, 0.5); ctx.lineWidth = 0.2;
        ctx.beginPath(); ctx.moveTo(...q(0.3, bh - 0.3)); ctx.lineTo(...q(w - 0.3, bh - 0.3)); ctx.stroke();
        if (r() < 0.18) { ctx.fillStyle = "rgba(70,90,40,0.45)"; ctx.beginPath(); ctx.ellipse(...q(w * r(), 0.5), 1.2, 0.5, 0, 0, Math.PI * 2); ctx.fill(); } // moss
        u += w;
      }
    }
  };
}

/** Vertical wooden planks on a box side. */
export function planks(ctx: Ctx, seed: number, base: number) {
  const r = rng(seed);
  return (side: "L" | "R", o: Pt, du: Pt, dz: Pt, len: number, h: number) => {
    const k = side === "L" ? 0.82 : 0.6;
    for (let u = 0; u < len; ) {
      const w = 2.4 + r() * 1.2, t = (0.85 + r() * 0.3) * k;
      const q = (uu: number, zz: number): Pt => [o[0] + du[0] * uu + dz[0] * zz, o[1] + du[1] * uu + dz[1] * zz];
      const g = ctx.createLinearGradient(...q(u, 0), ...q(u + w, 0));
      g.addColorStop(0, col(base, t * 1.1)); g.addColorStop(1, col(base, t * 0.8));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(...q(u, 0)); ctx.lineTo(...q(u + w, 0)); ctx.lineTo(...q(u + w, h + 2)); ctx.lineTo(...q(u, h + 2)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(20,12,6,0.6)"; ctx.lineWidth = 0.25;
      ctx.beginPath(); ctx.moveTo(...q(u, 0)); ctx.lineTo(...q(u, h + 2)); ctx.stroke();
      ctx.strokeStyle = col(base, t * 0.7, 0.5); ctx.lineWidth = 0.12; // grain
      for (let gr = 0; gr < 2; gr++) { const x = u + w * (0.3 + gr * 0.4); ctx.beginPath(); ctx.moveTo(...q(x, 0.5)); ctx.bezierCurveTo(...q(x + 0.3, h * 0.3), ...q(x - 0.3, h * 0.6), ...q(x + 0.1, h)); ctx.stroke(); }
      u += w;
    }
    // grime at the bottom
    const q = (uu: number, zz: number): Pt => [o[0] + du[0] * uu + dz[0] * zz, o[1] + du[1] * uu + dz[1] * zz];
    const g = ctx.createLinearGradient(...q(0, 0), ...q(0, h * 0.5));
    g.addColorStop(0, "rgba(15,10,5,0.55)"); g.addColorStop(1, "rgba(15,10,5,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(...q(0, 0)); ctx.lineTo(...q(len, 0)); ctx.lineTo(...q(len, h)); ctx.lineTo(...q(0, h)); ctx.closePath(); ctx.fill();
  };
}

function glow(ctx: Ctx, x: number, y: number, r: number, c: string, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, c.replace("A", String(a))); g.addColorStop(1, c.replace("A", "0"));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

function flame(ctx: Ctx, x: number, y: number, h: number, w: number, f: number) {
  const sway = Math.sin(f * 1.9) * w * 0.3;
  const g = ctx.createLinearGradient(x, y, x, y - h);
  g.addColorStop(0, "rgba(255,120,30,0.95)"); g.addColorStop(0.5, "rgba(255,200,80,0.95)"); g.addColorStop(1, "rgba(255,250,210,0.9)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(x - w, y);
  ctx.bezierCurveTo(x - w, y - h * 0.5, x + sway, y - h * 0.7, x + sway * 1.5, y - h);
  ctx.bezierCurveTo(x + sway, y - h * 0.6, x + w, y - h * 0.4, x + w, y);
  ctx.closePath(); ctx.fill();
}

// ---------- the props ----------

function forge(ctx: Ctx, f: number) {
  const I = new Iso(ctx, 34, 57);
  I.shadow(-14, -10, 14, 10, 4);
  // coal bin and bellows on the left
  I.box(-16, -8, 6, 13, 0, 4, 0x4a3420, planks(ctx, 5, 0x5a4028));
  for (let k = 0; k < 9; k++) { const [x, y] = I.p(-15 + (k % 3) * 2.4, 7.5 + Math.floor(k / 3) * 1.8, 4.6); ctx.fillStyle = col(0x2a2622, 0.8 + (k % 3) * 0.15); ctx.beginPath(); ctx.ellipse(x, y, 1, 0.6, 0, 0, Math.PI * 2); ctx.fill(); }
  // body
  I.box(-12, 12, -9, 9, 0, 19, 0x7a7266, stones(ctx, 11, 0x7a7266, 1));
  // hearth top: a shallow coal bed glowing
  const [hx, hy] = I.p(0, 0, 19);
  const hot = 0.75 + 0.25 * Math.sin(f * 1.7);
  ctx.fillStyle = "#2a201a"; ctx.beginPath(); ctx.ellipse(hx, hy, 12, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 11);
  g.addColorStop(0, `rgba(255,220,120,${hot})`); g.addColorStop(0.4, `rgba(255,120,30,${hot * 0.9})`); g.addColorStop(1, "rgba(120,30,10,0.2)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(hx, hy, 10.5, 4.6, 0, 0, Math.PI * 2); ctx.fill();
  const r = rng(40 + f);
  for (let k = 0; k < 18; k++) { ctx.fillStyle = `rgba(${200 + r() * 55},${80 + r() * 120},30,0.9)`; ctx.beginPath(); ctx.arc(hx + (r() - 0.5) * 16, hy + (r() - 0.5) * 6, 0.5 + r() * 0.6, 0, Math.PI * 2); ctx.fill(); }
  // fire mouth on the right side
  const m: Pt[] = [I.p(12, 4, 3), I.p(12, -4, 3), I.p(12, -4, 11), I.p(12, 0, 14), I.p(12, 4, 11)];
  I.poly(m, "#1a120c");
  ctx.save(); I.clip(m);
  const [fx, fy] = I.p(12, 0, 4);
  glow(ctx, fx, fy, 9, "rgba(255,140,40,A)", 0.9 * hot);
  for (let k = 0; k < 3; k++) flame(ctx, fx - 3 + k * 3, fy + 1, 5 + ((k + f) % 3) * 1.5, 1.4, f + k);
  ctx.restore();
  ctx.strokeStyle = "rgba(40,30,24,0.9)"; ctx.lineWidth = 0.6; ctx.beginPath(); for (const [i, q] of m.entries()) i ? ctx.lineTo(...q) : ctx.moveTo(...q); ctx.closePath(); ctx.stroke();
  // chimney hood and stack at the back
  I.box(-10, -2, -8, 0, 19, 46, 0x6a6258, stones(ctx, 23, 0x6a6258, 0.95));
  // warm light spilling on the ground and the hearth
  glow(ctx, fx + 6, fy + 6, 14, "rgba(255,130,40,A)", 0.28 * hot);
  glow(ctx, hx, hy - 2, 12, "rgba(255,170,60,A)", 0.3 * hot);
  // bellows
  const [bx, by] = I.p(-13, 2, 6);
  ctx.fillStyle = "#5a3a22"; ctx.beginPath(); ctx.moveTo(bx - 6, by - 2); ctx.lineTo(bx + 2, by - 4); ctx.lineTo(bx + 2, by + 1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#3a2414"; ctx.beginPath(); ctx.moveTo(bx - 6, by - 2); ctx.lineTo(bx + 2, by + 1); ctx.lineTo(bx - 5, by + 1); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#8a6a44"; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(bx - 6, by - 2); ctx.lineTo(bx - 10, by - 4); ctx.stroke();
}

function anvil(ctx: Ctx) {
  const I = new Iso(ctx, 16, 28);
  I.shadow(-6, -6, 6, 6, 2);
  // stump
  const [sx, sy] = I.p(0, 0, 0);
  const sg = ctx.createLinearGradient(sx - 6, 0, sx + 6, 0);
  sg.addColorStop(0, "#6e5038"); sg.addColorStop(0.5, "#4e3624"); sg.addColorStop(1, "#2a1c10");
  ctx.fillStyle = sg; ctx.fillRect(sx - 6, sy - 9, 12, 9);
  ctx.beginPath(); ctx.ellipse(sx, sy, 6, 3, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = "#8a6a48"; ctx.beginPath(); ctx.ellipse(sx, sy - 9, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(60,40,20,0.6)"; ctx.lineWidth = 0.25;
  for (const rr of [1.5, 3, 4.5]) { ctx.beginPath(); ctx.ellipse(sx, sy - 9, rr, rr / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
  // anvil: waist, body and horn, dark steel with a bright worn face
  const top = sy - 15;
  const steel = (x0: number, x1: number) => { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, "#5c6268"); g.addColorStop(0.5, "#33373c"); g.addColorStop(1, "#16181b"); return g; };
  ctx.fillStyle = steel(sx - 3, sx + 3); ctx.beginPath(); ctx.moveTo(sx - 4, sy - 9.5); ctx.lineTo(sx - 2, top + 3); ctx.lineTo(sx + 2, top + 3); ctx.lineTo(sx + 4, sy - 9.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = steel(sx - 9, sx + 7);
  ctx.beginPath(); ctx.moveTo(sx - 11, top + 0.5); ctx.quadraticCurveTo(sx - 7, top + 3.8, sx - 3, top + 3.6); ctx.lineTo(sx + 7, top + 3.2); ctx.lineTo(sx + 7, top - 0.5); ctx.lineTo(sx - 4, top - 0.5); ctx.quadraticCurveTo(sx - 8, top - 0.2, sx - 11, top + 0.5); ctx.closePath(); ctx.fill();
  const fg = ctx.createLinearGradient(sx - 4, top - 2, sx + 7, top);
  fg.addColorStop(0, "#9aa2aa"); fg.addColorStop(1, "#5a6066");
  ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(sx - 4, top - 0.5); ctx.lineTo(sx + 7, top - 0.5); ctx.lineTo(sx + 8.5, top - 1.6); ctx.lineTo(sx - 2.5, top - 1.6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(220,230,240,0.7)"; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(sx - 10.5, top + 0.4); ctx.quadraticCurveTo(sx - 7, top - 0.3, sx - 4, top - 0.5); ctx.lineTo(sx + 7, top - 0.5); ctx.stroke();
  // tongs and a hammer leaning on the stump
  ctx.strokeStyle = "#2a2a2e"; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(sx + 5, sy - 1); ctx.lineTo(sx + 8, sy - 10); ctx.moveTo(sx + 6, sy - 1); ctx.lineTo(sx + 8.6, sy - 10); ctx.stroke();
}

function weaponRack(ctx: Ctx) {
  const I = new Iso(ctx, 32, 58);
  I.shadow(-16, -4, 16, 4, 3, 0.45);
  const wood = (u: number, v: number, z0: number, z1: number, w = 1.2) => I.box(u - w / 2, u + w / 2, v - w / 2, v + w / 2, z0, z1, 0x5e4228);
  // weapons first (behind the front rail)
  const blade = (u: number, z0: number, len: number, kind: number) => {
    const [x0, y0] = I.p(u, 0, z0), [x1, y1] = I.p(u, 0, z0 + len);
    if (kind === 0) { // sword
      const g = ctx.createLinearGradient(x0 - 1, 0, x0 + 1, 0); g.addColorStop(0, "#e8eef4"); g.addColorStop(0.5, "#9aa4ae"); g.addColorStop(1, "#4a5058");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0 - 0.9, y0 - 6); ctx.lineTo(x1, y1 - 2); ctx.lineTo(x0 + 0.9, y0 - 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#8a6a2a"; ctx.fillRect(x0 - 2.6, y0 - 6.5, 5.2, 1); ctx.fillStyle = "#3a2414"; ctx.fillRect(x0 - 0.6, y0 - 5.5, 1.2, 5);
      ctx.fillStyle = "#c8a040"; ctx.beginPath(); ctx.arc(x0, y0, 0.9, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 1) { // axe
      ctx.strokeStyle = "#5a3a20"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const g = ctx.createLinearGradient(x1, y1, x1 + 6, y1); g.addColorStop(0, "#5a6068"); g.addColorStop(1, "#cfd6dc");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x1, y1 + 1); ctx.quadraticCurveTo(x1 + 7, y1 - 1, x1 + 6, y1 + 7); ctx.quadraticCurveTo(x1 + 3, y1 + 4, x1, y1 + 4.5); ctx.closePath(); ctx.fill();
    } else { // spear
      ctx.strokeStyle = "#6a4a2a"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.fillStyle = "#b8c0c8"; ctx.beginPath(); ctx.moveTo(x1 - 1.3, y1 + 2); ctx.lineTo(x1, y1 - 5); ctx.lineTo(x1 + 1.3, y1 + 2); ctx.closePath(); ctx.fill();
    }
  };
  wood(-14, 0, 0, 24); wood(14, 0, 0, 24);
  I.box(-15, 15, -0.6, 0.6, 21, 22.4, 0x5e4228); // top bar
  blade(-9, 4, 28, 2); blade(-4, 3, 20, 0); blade(1, 3, 21, 0); blade(6, 2, 16, 1); blade(10.5, 3, 19, 0);
  I.box(-15, 15, 1.5, 2.8, 6, 7.4, 0x6e4e30); // front rail
  // a round shield leaning against the right post
  const [sx, sy] = I.p(15, 3, 6);
  const sg = ctx.createRadialGradient(sx - 1.5, sy - 2, 0, sx, sy, 6);
  sg.addColorStop(0, "#a0442e"); sg.addColorStop(1, "#4a160e");
  ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(sx, sy, 4.6, 6, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#8a8a8a"; ctx.lineWidth = 0.7; ctx.stroke();
  ctx.fillStyle = "#c0c4c8"; ctx.beginPath(); ctx.arc(sx, sy, 1.2, 0, Math.PI * 2); ctx.fill();
}

function cauldron(ctx: Ctx, f: number) {
  const x = 16, y = 26;
  const sh = ctx.createRadialGradient(x, y + 2, 0, x, y + 2, 10); sh.addColorStop(0, "rgba(8,6,4,0.55)"); sh.addColorStop(1, "rgba(8,6,4,0)");
  ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(x, y + 2, 11, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  // embers and logs below
  ctx.fillStyle = "#3a2414"; ctx.save(); ctx.translate(x, y + 1); ctx.rotate(0.3); ctx.fillRect(-7, -0.8, 14, 1.6); ctx.rotate(-0.6); ctx.fillRect(-7, -0.8, 14, 1.6); ctx.restore();
  glow(ctx, x, y, 7, "rgba(255,120,30,A)", 0.55 + 0.2 * f);
  // pot body
  const g = ctx.createRadialGradient(x - 3, y - 9, 1, x, y - 6, 9);
  g.addColorStop(0, "#5a5e62"); g.addColorStop(0.5, "#24272a"); g.addColorStop(1, "#0c0d0e");
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - 6, 8.5, 7, 0, 0, Math.PI * 2); ctx.fill();
  // legs
  ctx.fillStyle = "#16181a"; for (const dx of [-5, 5]) { ctx.beginPath(); ctx.moveTo(x + dx - 0.8, y - 2); ctx.lineTo(x + dx * 1.15, y + 1.2); ctx.lineTo(x + dx + 0.8, y - 2); ctx.closePath(); ctx.fill(); }
  // rim and the green brew
  ctx.fillStyle = "#3a3e42"; ctx.beginPath(); ctx.ellipse(x, y - 11.5, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
  const b = ctx.createRadialGradient(x, y - 11.5, 0, x, y - 11.5, 7);
  b.addColorStop(0, "#d8ff7a"); b.addColorStop(0.5, "#6ad040"); b.addColorStop(1, "#1e5a1a");
  ctx.fillStyle = b; ctx.beginPath(); ctx.ellipse(x, y - 11.4, 6.8, 2.3, 0, 0, Math.PI * 2); ctx.fill();
  const r = rng(77 + f * 13);
  for (let k = 0; k < 5; k++) { ctx.strokeStyle = "rgba(220,255,160,0.85)"; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.arc(x + (r() - 0.5) * 9, y - 11.6 + (r() - 0.5) * 2, 0.5 + r() * 0.8, 0, Math.PI * 2); ctx.stroke(); }
  glow(ctx, x, y - 13, 10, "rgba(140,255,90,A)", 0.35);
  // vapour
  for (let k = 0; k < 3; k++) { ctx.fillStyle = `rgba(170,230,150,${0.16 - k * 0.04})`; ctx.beginPath(); ctx.ellipse(x - 2 + k * 2 + f, y - 16 - k * 3.5, 3 + k, 1.6 + k * 0.5, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = "rgba(160,170,180,0.5)"; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.ellipse(x, y - 11.5, 8, 3, 0, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke();
}

function candles(ctx: Ctx, f: number) {
  const x = 16, y = 28;
  // a flat stone slab
  const sl = ctx.createLinearGradient(0, y - 4, 0, y + 1); sl.addColorStop(0, "#6a665e"); sl.addColorStop(1, "#2e2c28");
  ctx.fillStyle = "rgba(8,6,4,0.5)"; ctx.beginPath(); ctx.ellipse(x, y + 0.5, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = sl; ctx.beginPath(); ctx.ellipse(x, y - 1.5, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#7a766c"; ctx.beginPath(); ctx.ellipse(x, y - 2.3, 10.5, 3.6, 0, 0, Math.PI * 2); ctx.fill();
  const set: [number, number, number][] = [[-6, -1.6, 7], [-2, -3, 12], [2.5, -1.2, 9], [6, -2.6, 5], [0, 0.6, 4]];
  for (const [i, [dx, dy, h]] of [...set.entries()].sort((a, b) => a[1][1] - b[1][1])) {
    const cx = x + dx, cy = y - 2 + dy;
    const g = ctx.createLinearGradient(cx - 1.4, 0, cx + 1.4, 0); g.addColorStop(0, "#f4ead0"); g.addColorStop(0.6, "#d8c8a0"); g.addColorStop(1, "#9a8a68");
    ctx.fillStyle = g; ctx.fillRect(cx - 1.3, cy - h, 2.6, h);
    ctx.beginPath(); ctx.ellipse(cx, cy, 1.3, 0.5, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = "#fffaf0"; ctx.beginPath(); ctx.ellipse(cx, cy - h, 1.3, 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e8dcc0"; ctx.beginPath(); ctx.ellipse(cx + 0.6, cy - h + 1.5 + i % 2, 0.4, 1.4, 0, 0, Math.PI * 2); ctx.fill(); // drip
    glow(ctx, cx, cy - h - 2, 5, "rgba(255,190,90,A)", 0.4);
    flame(ctx, cx, cy - h - 0.3, 2.6 + ((i + f) % 3) * 0.5, 0.55, f * 2 + i);
  }
}

function toadstools(ctx: Ctx) {
  const shrooms: [number, number, number, number][] = [[10, 27, 5, 7], [17, 28, 7, 10], [23, 27, 4, 5], [13, 30, 3, 3.5], [21, 30.5, 3.2, 3]];
  ctx.fillStyle = "rgba(8,6,4,0.45)"; ctx.beginPath(); ctx.ellipse(16, 29.5, 12, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  for (const [x, y, r, h] of shrooms.sort((a, b) => a[1] - b[1])) {
    const sg = ctx.createLinearGradient(x - r * 0.3, 0, x + r * 0.3, 0); sg.addColorStop(0, "#efe4cc"); sg.addColorStop(1, "#9a8c74");
    ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(x - r * 0.28, y); ctx.quadraticCurveTo(x - r * 0.2, y - h * 0.6, x - r * 0.18, y - h); ctx.lineTo(x + r * 0.18, y - h); ctx.quadraticCurveTo(x + r * 0.25, y - h * 0.6, x + r * 0.3, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#3a2440"; ctx.beginPath(); ctx.ellipse(x, y - h + 0.3, r * 0.95, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    const cg = ctx.createRadialGradient(x - r * 0.35, y - h - r * 0.45, 0, x, y - h, r * 1.1);
    cg.addColorStop(0, "#c88ae0"); cg.addColorStop(0.5, "#7a3a9a"); cg.addColorStop(1, "#2e1240");
    ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(x, y - h, r, r * 0.62, 0, Math.PI, Math.PI * 2); ctx.quadraticCurveTo(x, y - h + r * 0.3, x - r, y - h); ctx.fill();
    const rr = rng(Math.round(x * 31 + y));
    for (let k = 0; k < 4; k++) { ctx.fillStyle = "rgba(240,230,250,0.85)"; ctx.beginPath(); ctx.ellipse(x + (rr() - 0.5) * r * 1.2, y - h - rr() * r * 0.45, 0.45, 0.3, 0, 0, Math.PI * 2); ctx.fill(); }
    glow(ctx, x, y - h, r * 1.3, "rgba(190,120,255,A)", 0.12);
  }
}

function herbRack(ctx: Ctx) {
  const I = new Iso(ctx, 32, 30);
  I.shadow(-14, -2, 14, 2, 2, 0.4);
  for (const u of [-13, 13]) I.box(u - 0.6, u + 0.6, -0.6, 0.6, 0, 20, 0x5a4028);
  I.box(-14, 14, -0.5, 0.5, 19, 20.2, 0x6a4a2c);
  const herbs = [0x6a7a3a, 0x8a5a7a, 0x9a8a3a, 0x4a6a4a, 0x7a3a3a, 0x5a7a6a, 0x8a7a4a];
  for (let k = 0; k < 7; k++) {
    const u = -11 + k * 3.6, [x, y] = I.p(u, 0, 19);
    ctx.strokeStyle = "#c8b890"; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 2); ctx.stroke();
    const c = herbs[k];
    for (let s = 0; s < 6; s++) {
      const a = -0.5 + s * 0.2, l = 6 + (s % 3);
      ctx.strokeStyle = col(c, 0.75 + (s % 2) * 0.35); ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.quadraticCurveTo(x + Math.sin(a) * 2, y + 2 + l * 0.6, x + Math.sin(a) * 2.6, y + 2 + l); ctx.stroke();
    }
    ctx.fillStyle = "#8a6a3a"; ctx.fillRect(x - 0.8, y + 1.6, 1.6, 0.8);
  }
}

/**
 * Old Morwen's hut, in the village's look: a low, crooked hovel of weathered grey planks on a fieldstone footing,
 * under a heavy, sagging thatch gone green with moss. A patched door, a shuttered window with a faint sickly glow,
 * herbs and bones hanging from the eave, a leaning stone chimney. Pixelized with the other props.
 */
const HUT_PIVOT = 85 / 96; // pivot row of the 96 px tall witch_hut frames
function witchHut(ctx: Ctx, f: number) {
  // footprint centre 8 px above the pivot row (HUT_PIVOT), with room below for the front corner of the footing
  const I = new Iso(ctx, 50, 77), r = rng(61);
  I.shadow(-19, -15, 19, 15, 0, 0.55); // kept inside the frame
  // a footing of rough field stones, half sunk in the earth, with weeds
  I.box(-19, 19, -15, 15, 0, 4, 0x4e4a42, stones(ctx, 3, 0x4e4a42, 0.85));
  // walls: weathered grey-brown planks, darker and mossy toward the ground
  I.box(-17, 17, -13, 13, 4, 31, 0x4c4236, planks(ctx, 9, 0x4c4236), false);
  const grime = (pts: Pt[]) => { const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[3][0], pts[3][1]); g.addColorStop(0, "rgba(30,34,18,0.7)"); g.addColorStop(1, "rgba(30,34,18,0)"); I.poly(pts, g); };
  grime([I.p(-17, 13, 4), I.p(17, 13, 4), I.p(17, 13, 13), I.p(-17, 13, 13)]);
  grime([I.p(17, 13, 4), I.p(17, -13, 4), I.p(17, -13, 12), I.p(17, 13, 12)]);
  // corner posts, a little crooked
  for (const [u, v] of [[-17, 13], [17, 13], [17, -13]] as const) {
    ctx.strokeStyle = "#2e261e"; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(...I.p(u, v, 4)); ctx.lineTo(...I.p(u + 0.6, v, 32)); ctx.stroke();
    ctx.strokeStyle = "#5e5244"; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(...I.p(u - 0.4, v, 4)); ctx.lineTo(...I.p(u + 0.2, v, 32)); ctx.stroke();
  }
  // a patch board nailed over a split, and a missing board showing the dark inside
  I.poly([I.p(-15, 13, 17), I.p(-10, 13, 17), I.p(-10, 13, 25), I.p(-15, 13, 25)], "#5a4e3e");
  I.poly([I.p(10, 13, 6), I.p(12, 13, 6), I.p(12, 13, 19), I.p(10, 13, 19)], "#16100c");
  // the door: old planks with iron straps, sagging on its hinges
  const d: Pt[] = [I.p(-4.5, 13, 4), I.p(5, 13, 4), I.p(5, 13, 25.5), I.p(-4.5, 13, 26.5)];
  I.poly([I.p(-5.5, 13, 4), I.p(6, 13, 4), I.p(6, 13, 27.5), I.p(-5.5, 13, 28.5)], "#6a5c48"); // door frame
  I.poly(d, "#2a2018", "#16100c", 0.6);
  ctx.strokeStyle = "rgba(200,170,90,0.55)"; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(...I.p(5, 13, 5)); ctx.lineTo(...I.p(5, 13, 25)); ctx.stroke(); // candlelight through the gap
  for (const z of [8, 20]) { ctx.strokeStyle = "#5a5650"; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(...I.p(-4, 13, z + 0.3)); ctx.lineTo(...I.p(4.5, 13, z)); ctx.stroke(); }
  for (let u = -2; u < 4.5; u += 2.2) { ctx.strokeStyle = "#241c14"; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(...I.p(u, 13, 4)); ctx.lineTo(...I.p(u, 13, 26)); ctx.stroke(); }
  const [kx, ky] = I.p(3.6, 13, 14); ctx.fillStyle = "#6a6050"; ctx.fillRect(kx - 0.5, ky - 0.5, 1, 1);
  // antlers nailed over the door instead of a sign
  const [ax, ay] = I.p(0.3, 13, 29);
  ctx.strokeStyle = "#c8bc9c"; ctx.lineWidth = 0.6;
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax + sd * 3, ay - 1, ax + sd * 4, ay - 4); ctx.moveTo(ax + sd * 2.4, ay - 1.2); ctx.lineTo(ax + sd * 2.2, ay - 3.2); ctx.stroke(); }
  // a small window on the right side: a faint sickly glow behind a shutter that hangs askew
  const W: Pt[] = [I.p(17, 4, 16), I.p(17, -4, 16), I.p(17, -4, 23), I.p(17, 4, 23)];
  const [wx, wy] = I.p(17, 0, 19.5);
  glow(ctx, wx, wy, 7, "rgba(150,200,90,A)", 0.16 + 0.05 * (f % 2));
  I.poly(W, "#141a0e");
  I.poly([I.p(17, 3, 17), I.p(17, -3, 17), I.p(17, -3, 22), I.p(17, 3, 22)], f % 2 ? "#6a8a3a" : "#5a7a32");
  ctx.strokeStyle = "#2a2018"; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(...I.p(17, 0, 16)); ctx.lineTo(...I.p(17, 0, 23)); ctx.moveTo(...I.p(17, 4, 19.5)); ctx.lineTo(...I.p(17, -4, 19.5)); ctx.stroke();
  I.poly([I.p(17, -4, 23), I.p(17, -9, 21.5), I.p(17, -9.5, 14.5), I.p(17, -4.5, 16)], "#3e3428", "#16100c", 0.4); // loose shutter
  // heavy thatch: two sagging planes, ragged eaves, mossy and dark with rot
  const ridgeZ = 56, eave = 28, o = 4;
  const thatch = (pts: Pt[], light: number, seed: number) => {
    const g = ctx.createLinearGradient(...pts[0], ...pts[2]);
    g.addColorStop(0, col(0x6a5c3a, light * 1.05)); g.addColorStop(1, col(0x4a4028, light * 0.8));
    I.poly(pts, g);
    ctx.save(); I.clip(pts);
    const rr = rng(seed);
    for (let k = 0; k < 520; k++) { // straw strokes running down the slope
      const t = rr(), s2 = rr();
      const x = pts[0][0] + (pts[1][0] - pts[0][0]) * t + (pts[3][0] - pts[0][0]) * s2, y = pts[0][1] + (pts[1][1] - pts[0][1]) * t + (pts[3][1] - pts[0][1]) * s2;
      const dx = (pts[3][0] - pts[0][0]) * 0.06, dy = (pts[3][1] - pts[0][1]) * 0.06;
      ctx.strokeStyle = rr() < 0.5 ? col(0x8a7a52, light * (0.8 + rr() * 0.35)) : col(0x3a3020, light);
      ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
    }
    for (let k = 0; k < 7; k++) { // moss
      const t = rr(), s2 = 0.2 + rr() * 0.75;
      const x = pts[0][0] + (pts[1][0] - pts[0][0]) * t + (pts[3][0] - pts[0][0]) * s2, y = pts[0][1] + (pts[1][1] - pts[0][1]) * t + (pts[3][1] - pts[0][1]) * s2;
      ctx.fillStyle = rr() < 0.5 ? "rgba(70,92,40,0.85)" : "rgba(52,70,30,0.85)";
      ctx.beginPath(); ctx.ellipse(x, y, 2 + rr() * 3.5, 1.2 + rr() * 1.6, -0.45, 0, Math.PI * 2); ctx.fill();
    }
    // a rotten hollow where the thatch has slumped
    ctx.fillStyle = "rgba(26,20,12,0.75)"; const hx = pts[0][0] + (pts[1][0] - pts[0][0]) * 0.62 + (pts[3][0] - pts[0][0]) * 0.45, hy = pts[0][1] + (pts[1][1] - pts[0][1]) * 0.62 + (pts[3][1] - pts[0][1]) * 0.45;
    ctx.beginPath(); ctx.ellipse(hx, hy, 3.2, 1.6, -0.45, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  // gable end (right): weathered boards
  const gable: Pt[] = [I.p(17, 13, 31), I.p(17, -13, 31), I.p(17, 0, ridgeZ - 2)];
  ctx.save(); I.poly(gable, col(0x3e362a, 0.62)); I.clip(gable);
  planks(ctx, 41, 0x3e362a)("R", I.p(17, 13, 31), [1, -0.5], [0, -1], 26, ridgeZ - 31);
  ctx.restore();
  // the front slope sags in the middle: built from two halves with a lower midpoint
  const sag = 2.5;
  // back slope first (seen above the ridge), darker
  thatch([I.p(-17 - o, -13 - o, eave), I.p(17 + o, -13 - o, eave), I.p(17 + o, 0, ridgeZ), I.p(-17 - o, 0, ridgeZ - 1)], 0.72, 4);
  thatch([I.p(-17 - o, 0, ridgeZ - 1), I.p(0, 0, ridgeZ - sag), I.p(0, 13 + o, eave - sag), I.p(-17 - o, 13 + o, eave)], 1, 5);
  thatch([I.p(0, 0, ridgeZ - sag), I.p(17 + o, 0, ridgeZ), I.p(17 + o, 13 + o, eave), I.p(0, 13 + o, eave - sag)], 0.97, 6);
  // ragged eave: straw hanging below the edge
  for (let k = 0; k <= 40; k++) {
    const u = -17 - o + ((34 + 2 * o) * k) / 40, z = eave - (Math.abs(u) < 8 ? sag * (1 - Math.abs(u) / 8) : 0);
    const [x, y] = I.p(u, 13 + o, z), L = 1 + r() * 2.8;
    ctx.strokeStyle = r() < 0.6 ? "#5a4c30" : "#3a3020"; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(x, y - 0.5); ctx.lineTo(x + (r() - 0.5), y + L); ctx.stroke();
  }
  // the gable's barge edge and a ridge of turf
  ctx.strokeStyle = "#2a2218"; ctx.lineWidth = 1.4; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(...I.p(17 + o, 13 + o, eave)); ctx.lineTo(...I.p(17 + o, 0, ridgeZ)); ctx.lineTo(...I.p(17 + o, -13 - o, eave)); ctx.stroke();
  ctx.strokeStyle = "#3e5226"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(...I.p(-17 - o, 0, ridgeZ - 1)); ctx.quadraticCurveTo(...I.p(0, 0, ridgeZ - sag - 1), ...I.p(17 + o, 0, ridgeZ)); ctx.stroke();
  // herbs and bones hanging under the eave
  for (const [u, kind] of [[-12, 0], [-8.5, 1], [7, 0], [11, 2]] as const) {
    const [x, y] = I.p(u, 13 + o - 1, eave - 1);
    ctx.strokeStyle = "#8a7a5a"; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 2.5); ctx.stroke();
    if (kind === 1) { ctx.fillStyle = "#c8bc9c"; ctx.fillRect(x - 0.4, y + 2.5, 0.8, 3); ctx.fillRect(x - 1, y + 2.5, 2, 0.7); }
    else { ctx.fillStyle = kind ? "#6a5a3a" : "#4e6030"; ctx.beginPath(); ctx.moveTo(x - 1.4, y + 2.5); ctx.lineTo(x + 1.4, y + 2.5); ctx.lineTo(x + 0.3, y + 7); ctx.lineTo(x - 0.4, y + 7); ctx.closePath(); ctx.fill(); }
  }
  // a leaning chimney of rough stones, with thin grey pixel smoke
  I.box(-11, -6, 2, 7, 44, 61, 0x4e4a42, stones(ctx, 31, 0x4e4a42, 0.85));
  const [cx, cy] = I.p(-8.5, 4.5, 61);
  for (let k = 0; k < 3; k++) { // short drift so the puffs stay inside the frame
    const t = (k + f * 0.75) % 3, px = cx + t * 2, py = cy - 2 - t * 2.6, rad = 1.4 + t * 0.6;
    ctx.fillStyle = `rgba(${120 - t * 8},${124 - t * 8},${110 - t * 8},${0.5 * (1 - t / 3)})`;
    ctx.beginPath(); ctx.ellipse(px, py, rad, rad * 0.75, 0, 0, Math.PI * 2); ctx.fill();
  }
  // weeds along the footing
  for (let k = 0; k < 14; k++) {
    const onL = r() < 0.6, u = onL ? -19 + r() * 38 : 19, v = onL ? 15 : -15 + r() * 30;
    const [x, y] = I.p(u, v, 0), h = 2 + r() * 3.5;
    ctx.strokeStyle = r() < 0.5 ? "#4e6030" : "#3a4a24"; ctx.lineWidth = 0.4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 2, y - h); ctx.stroke();
  }
}

/** Paints the props into a hi-res atlas copy and swaps it in. Call once after the "props" atlas has loaded. */
export function paintSmoothProps(scene: Phaser.Scene) {
  if (!scene.textures.exists("props")) return;
  const tex = scene.textures.get("props");
  const img = tex.getSourceImage() as HTMLImageElement;
  const base = smoothCopy(img, "props");
  if (!base) return;
  const hi = document.createElement("canvas");
  hi.width = img.width * S; hi.height = img.height * S;
  const ctx = hi.getContext("2d")!;
  ctx.drawImage(base, 0, 0, hi.width, hi.height);
  const paint = (name: string, draw: (c: Ctx, f: number) => void, f = 0) => {
    if (!tex.has(name)) return;
    const fr = tex.get(name);
    ctx.save();
    ctx.clearRect(fr.cutX * S, fr.cutY * S, fr.cutWidth * S, fr.cutHeight * S);
    ctx.beginPath(); ctx.rect(fr.cutX * S, fr.cutY * S, fr.cutWidth * S, fr.cutHeight * S); ctx.clip();
    ctx.setTransform(S, 0, 0, S, fr.cutX * S, fr.cutY * S);
    draw(ctx, f);
    ctx.restore();
    pixelize(ctx, fr.cutWidth * S, fr.cutHeight * S, 3, { ox: fr.cutX * S, oy: fr.cutY * S, step: 12, outline: 0.55 });
  };
  for (let f = 0; f < 4; f++) paint(`forge_${f}`, forge, f);
  paint("anvil", anvil);
  paint("weapon_rack", weaponRack);
  for (let f = 0; f < 2; f++) paint(`cauldron_${f}`, cauldron, f);
  for (let f = 0; f < 3; f++) paint(`candles_${f}`, candles, f);
  paint("toadstools", toadstools);
  paint("herb_rack", herbRack);
  for (let f = 0; f < 4; f++) {
    paint(`witch_hut_${f}`, witchHut, f);
    // the painted hut stands higher in its frame (see witchHut): move the pivot up with it so it stays on its spot
    if (tex.has(`witch_hut_${f}`)) { const fr = tex.get(`witch_hut_${f}`) as any; fr.customPivot = true; fr.pivotX = 0.5; fr.pivotY = HUT_PIVOT; }
  }
  overrideTexture(scene, "props", hi);
}

// ---------- upright map props (barrels, crates, well, signs, hay…), one tile each ----------


// texture size and footprint centre: roomy enough that wide art (the well's roof, hay, wheels) and soft shadows
// are never cut at the edge. iso.ts shows them at origin (0.5, UPRIGHT_OY), so the footprint stands on the tile.
const UW = 52, UH = 58, UO: Pt = [26, 44];
export const UPRIGHT_OY = UO[1] / UH;

function barrel(c: Ctx, I: Iso) {
  I.shadow(-6, -6, 6, 6, 2);
  const [x, y] = I.p(0, 0, 0), r = 6.5, h = 13;
  const g = c.createLinearGradient(x - r, 0, x + r, 0);
  g.addColorStop(0, "#8a6038"); g.addColorStop(0.35, "#6a4628"); g.addColorStop(1, "#2a1a0c");
  c.fillStyle = g;
  c.beginPath(); c.moveTo(x - r * 0.9, y); c.quadraticCurveTo(x - r * 1.12, y - h / 2, x - r * 0.9, y - h);
  c.lineTo(x + r * 0.9, y - h); c.quadraticCurveTo(x + r * 1.12, y - h / 2, x + r * 0.9, y); c.ellipse(x, y, r * 0.9, r * 0.42, 0, 0, Math.PI); c.fill();
  c.strokeStyle = "rgba(20,12,6,0.6)"; c.lineWidth = 0.25;
  for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x + k * 2.4, y + 1.5 - Math.abs(k) * 0.4); c.quadraticCurveTo(x + k * 2.9, y - h / 2, x + k * 2.4, y - h + 0.3); c.stroke(); }
  for (const hy of [2.2, h / 2, h - 2.2]) { // iron hoops
    const w = r * (hy === h / 2 ? 1.1 : 0.98);
    c.strokeStyle = "#2a2826"; c.lineWidth = 1; c.beginPath(); c.ellipse(x, y - hy, w, w * 0.42, 0, 0, Math.PI); c.stroke();
    c.strokeStyle = "rgba(170,170,160,0.5)"; c.lineWidth = 0.3; c.beginPath(); c.ellipse(x, y - hy - 0.4, w, w * 0.42, 0, Math.PI * 0.55, Math.PI * 0.95); c.stroke();
  }
  c.fillStyle = V === 1 ? "#1e140c" : "#7a5a38"; c.beginPath(); c.ellipse(x, y - h, r * 0.9, r * 0.4, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#2a2826"; c.lineWidth = 0.7; c.stroke();
  if (V === 1) { // lid gone: dark inside, rain water glint
    c.fillStyle = "rgba(90,110,110,0.45)"; c.beginPath(); c.ellipse(x - 1, y - h + 0.8, r * 0.5, r * 0.18, 0, 0, Math.PI * 2); c.fill();
    return;
  }
  if (V === 2) { c.strokeStyle = "rgba(140,70,30,0.7)"; c.lineWidth = 0.7; c.beginPath(); c.ellipse(x, y - h / 2, r * 1.1, r * 0.46, 0, 0.2, Math.PI * 0.8); c.stroke(); }
  c.strokeStyle = "rgba(40,26,12,0.5)"; c.lineWidth = 0.2; for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(x - r * 0.8, y - h + k * 1.1); c.lineTo(x + r * 0.8, y - h + k * 1.1); c.stroke(); }
}

function crate(c: Ctx, I: Iso) {
  I.shadow(-6, -6, 6, 6, 2);
  const s = 5.5, h = 11;
  I.box(-s, s, -s, s, 0, h, 0x7a5a36, planks(c, 7, 0x7a5a36));
  // cross braces and frame on both sides
  for (const side of ["L", "R"] as const) {
    const P = (a: number, z: number) => side === "L" ? I.p(-s + a * 2 * s, s, z) : I.p(s, s - a * 2 * s, z);
    c.strokeStyle = side === "L" ? "#4a3218" : "#33220f"; c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(...P(0.05, 0.6)); c.lineTo(...P(0.95, h - 0.6)); c.stroke();
    c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(...P(0, 0.4)); c.lineTo(...P(1, 0.4)); c.moveTo(...P(0, h - 0.4)); c.lineTo(...P(1, h - 0.4)); c.stroke();
  }
  const top: Pt[] = [I.p(-s, -s, h), I.p(s, -s, h), I.p(s, s, h), I.p(-s, s, h)];
  I.poly(top, "#8a6a42", "#4a3218", 0.6);
  if (V === 1 || V === 3) { // a split plank: dark gap with splinters
    const a = I.p(-s + 2, s, h * 0.55), b = I.p(-s + 7, s, h * 0.62);
    c.strokeStyle = "#140c06"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(...a); c.lineTo(b[0], b[1] + 0.6); c.lineTo(...b); c.stroke();
    c.strokeStyle = "#b08a5a"; c.lineWidth = 0.3; c.beginPath(); c.moveTo(b[0], b[1] - 0.7); c.lineTo(b[0] + 1.2, b[1] - 1.4); c.stroke();
  }
  c.strokeStyle = "rgba(40,26,12,0.6)"; c.lineWidth = 0.25;
  for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(...I.p(-s + k * 2.75, -s, h)); c.lineTo(...I.p(-s + k * 2.75, s, h)); c.stroke(); }
}

function well(c: Ctx, I: Iso) {
  I.shadow(-11, -11, 11, 11, 3);
  // round stone wall
  const [x, y] = I.p(0, 0, 0), rx = 11, ry = 5.5, h = 8;
  const r = rng(5);
  for (let row = 0; row < 3; row++) for (let k = 0; k < 14; k++) {
    const a0 = (k + (row % 2) * 0.5) / 14 * Math.PI, a1 = a0 + Math.PI / 14;
    const yy = y - row * (h / 3);
    const t = 0.7 + r() * 0.35, lit = 0.65 + 0.45 * Math.cos(a0 + 0.3);
    c.fillStyle = col(0x8a8478, t * lit);
    c.beginPath(); c.ellipse(x, yy, rx, ry, 0, a0, a1); c.lineTo(x + Math.cos(a1) * rx, yy - h / 3 + Math.sin(a1) * ry); c.ellipse(x, yy - h / 3, rx, ry, 0, a1, a0, true); c.closePath(); c.fill();
    c.strokeStyle = "rgba(30,26,22,0.6)"; c.lineWidth = 0.25; c.stroke();
  }
  c.fillStyle = "#9a948a"; c.beginPath(); c.ellipse(x, y - h, rx, ry, 0, 0, Math.PI * 2); c.fill();
  const wg = c.createRadialGradient(x, y - h, 0, x, y - h, rx * 0.8);
  wg.addColorStop(0, "#0a1418"); wg.addColorStop(0.7, "#1a2a2e"); wg.addColorStop(1, "#2a2a26");
  c.fillStyle = wg; c.beginPath(); c.ellipse(x, y - h, rx * 0.78, ry * 0.72, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "rgba(120,150,150,0.35)"; c.beginPath(); c.ellipse(x - 2, y - h + 0.6, 2.5, 0.8, 0, 0, Math.PI * 2); c.fill();
  // posts, roof and windlass
  for (const u of [-9, 9]) I.box(u - 0.9, u + 0.9, -0.9, 0.9, h - 1, 27, 0x5a3e22);
  const [ax, ay] = I.p(-9, 0, 20), [bx, by] = I.p(9, 0, 20);
  c.strokeStyle = "#4a3218"; c.lineWidth = 1.4; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
  c.strokeStyle = "#8a7a5a"; c.lineWidth = 0.35; c.beginPath(); c.moveTo((ax + bx) / 2, (ay + by) / 2); c.lineTo((ax + bx) / 2, (ay + by) / 2 + 9); c.stroke();
  c.fillStyle = "#4a3824"; c.fillRect((ax + bx) / 2 - 1.3, (ay + by) / 2 + 8, 2.6, 2.6);
  // shingled roof: rows of flat-coloured wooden shakes, each a few art pixels, staggered and uneven, so it reads as
  // pixel art and not a smooth sheet. Gable end in dark planks, a ridge beam on top.
  const ridge = 33, e = 25, rows = 5, rr = rng(31 + V * 7);
  const SH = [0x3a2012, 0x4e2c18, 0x63391f, 0x784628, 0x8c5532];
  I.poly([I.p(12, 7.6, e - 0.6), I.p(12, -7, e), I.p(12, 0, ridge)], "#2e1a0e");
  for (let k = 0; k < 3; k++) { c.fillStyle = "#4a2c18"; c.fillRect(...I.p(12, -5 + k * 4.5, e + 2 + (k === 1 ? 4 : 0)), 0.8, 1.6); }
  for (let k = rows - 1; k >= 0; k--) {
    const v0 = k * 7.6 / rows - 0.2, v1 = (k + 1) * 7.6 / rows, z0 = ridge - v0 * 8 / 7, z1 = ridge - v1 * 8 / 7 - 0.6;
    const off = (k % 2) * 1.5;
    for (let u = -12.5 - off; u < 12.5; u += 3) {
      const a = Math.max(-12.5, u), b = Math.min(12.5, u + 3 - 0.35);
      if (b - a < 0.6) continue;
      const tone = Math.max(0, Math.min(SH.length - 1, Math.round(2.6 - k * 0.45 + (rr() - 0.5) * 1.6 + (V === 2 && rr() < 0.15 ? -2 : 0))));
      if (V === 3 && k === 2 && u > 2 && u < 6) continue; // a missing shake: the batten shows through
      const drop = rr() * 0.5;
      I.poly([I.p(a, v0, z0), I.p(b, v0, z0), I.p(b, v1 + drop, z1 - drop), I.p(a, v1 + drop, z1 - drop)], col(SH[tone]));
      // lit top edge and dark butt end of each shake
      const zb = z1 - drop, vb = v1 + drop;
      I.poly([I.p(a, v0, z0), I.p(b, v0, z0), I.p(b, v0 + 0.4, z0 - 0.45), I.p(a, v0 + 0.4, z0 - 0.45)], col(SH[Math.min(SH.length - 1, tone + 1)]));
      I.poly([I.p(a, vb - 0.3, zb + 0.35), I.p(b, vb - 0.3, zb + 0.35), I.p(b, vb, zb), I.p(a, vb, zb)], "#24140a");
    }
  }
  if (V === 3) I.poly([I.p(2.5, 3.6, ridge - 4.1), I.p(5.5, 3.6, ridge - 4.1), I.p(5.5, 4.6, ridge - 5.3), I.p(2.5, 4.6, ridge - 5.3)], "#140a04");
  I.box(-13, 13, -0.6, 0.6, ridge - 0.6, ridge + 0.8, 0x5a3a20);
}

function signpost(c: Ctx, I: Iso, boards: number) {
  I.shadow(-3, -3, 3, 3, 2);
  I.box(-0.9, 0.9, -0.9, 0.9, 0, 24, 0x5a3e22);
  const board = (z: number, dir: 1 | -1, len: number) => {
    const a = I.p(0, 1, z), b = I.p(dir * len, 1, z + dir * 0.5);
    const g = c.createLinearGradient(a[0], a[1] - 3, a[0], a[1] + 3); g.addColorStop(0, "#9a7448"); g.addColorStop(1, "#5a3e22");
    c.fillStyle = g;
    c.beginPath(); c.moveTo(a[0], a[1] - 2.6); c.lineTo(b[0], b[1] - 2.6); c.lineTo(b[0] + dir * 2, b[1]); c.lineTo(b[0], b[1] + 2.6); c.lineTo(a[0], a[1] + 2.6); c.closePath(); c.fill();
    c.strokeStyle = "#2a1a0c"; c.lineWidth = 0.4; c.stroke();
    c.strokeStyle = "rgba(30,18,8,0.7)"; c.lineWidth = 0.35; // carved letters
    for (let k = 0; k < 3; k++) { const t = 0.2 + k * 0.22; c.beginPath(); c.moveTo(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); c.lineTo(a[0] + (b[0] - a[0]) * (t + 0.14), a[1] + (b[1] - a[1]) * (t + 0.14)); c.stroke(); }
  };
  board(21, 1, 10);
  if (boards > 1) board(16, -1, 9);
}

function hay(c: Ctx, I: Iso) {
  const lr = rng(40 + V);
  // loose straw blown around the bale
  for (let k = 0; k < 40; k++) {
    const a = lr() * Math.PI * 2, d = 7 + lr() * 6, [px, py] = I.p(Math.cos(a) * d, Math.sin(a) * d, 0);
    c.strokeStyle = col(lr() < 0.5 ? 0xc8a848 : 0x8a6a2a, 0.9); c.lineWidth = 0.25;
    c.beginPath(); c.moveTo(px, py); c.lineTo(px + (lr() - 0.5) * 3, py + (lr() - 0.5) * 1); c.stroke();
  }
  if (V >= 2) { // a round bale lying on its side, a little slumped
    I.shadow(-8, -7, 8, 7, 2);
    const [x, y] = I.p(0, 0, 0), r = 7, L = 6;
    const g = c.createLinearGradient(x - 9, 0, x + 9, 0); g.addColorStop(0, "#d8b850"); g.addColorStop(0.5, "#a88a34"); g.addColorStop(1, "#5a4618");
    c.fillStyle = g; c.beginPath(); c.ellipse(x + L * 0.5, y - r + L * 0.25, r * 0.8, r, 0, -Math.PI / 2, Math.PI / 2); c.lineTo(x - L * 0.5, y + L * -0.25 + 0); c.ellipse(x - L * 0.5, y - r - L * 0.25, r * 0.8, r, 0, Math.PI / 2, Math.PI * 1.5); c.closePath(); c.fill();
    c.fillStyle = "#c8a440"; c.beginPath(); c.ellipse(x - L * 0.5, y - r - L * 0.25, r * 0.8, r * 0.98, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "rgba(110,84,30,0.8)"; c.lineWidth = 0.3;
    for (const rr of [1.5, 3, 4.5, 6]) { c.beginPath(); c.ellipse(x - L * 0.5, y - r - L * 0.25, rr * 0.8, rr, 0, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = "rgba(70,60,30,0.35)"; c.beginPath(); c.ellipse(x - L * 0.5 + 1, y - r - L * 0.25 + 2, r * 0.5, r * 0.5, 0, 0, Math.PI * 2); c.fill(); // weathered grey core
    return;
  }
  I.shadow(-8, -6, 8, 6, 2);
  const s = 7, d = 5, h = 9;
  I.box(-s, s, -d, d, 0, h, 0xb8963c);
  const r = rng(9);
  // straw strands over the sides and top
  for (let k = 0; k < 160; k++) {
    const side = k % 3, u = r(), z = r();
    let a: Pt;
    if (side === 0) a = I.p(-s + u * 2 * s, d, z * h); else if (side === 1) a = I.p(s, d - u * 2 * d, z * h); else a = I.p(-s + u * 2 * s, -d + z * 2 * d, h);
    const t = side === 0 ? 0.85 : side === 1 ? 0.62 : 1.05;
    c.strokeStyle = col(r() < 0.5 ? 0xd8b850 : 0x9a7a2a, t); c.lineWidth = 0.22;
    c.beginPath(); c.moveTo(...a); c.lineTo(a[0] + (r() - 0.5) * 3, a[1] + (r() - 0.5) * 1.2); c.stroke();
  }
  for (const k of [-3.5, 3.5]) { // twine
    c.strokeStyle = "#5a3a1a"; c.lineWidth = 0.5;
    c.beginPath(); c.moveTo(...I.p(k, d, 0)); c.lineTo(...I.p(k, d, h)); c.lineTo(...I.p(k, -d, h)); c.stroke();
  }
}

function rock(c: Ctx, I: Iso, seed: number) {
  I.shadow(-7, -6, 7, 6, 2);
  const [x, y] = I.p(0, 0, 0), r = rng(seed);
  const pts: Pt[] = [];
  for (let k = 0; k < 9; k++) { const a = Math.PI + (k / 8) * Math.PI, rr = 7 + r() * 2.5; pts.push([x + Math.cos(a) * rr * 1.1, y + Math.sin(a) * rr * 1.1 - 1]); }
  pts.push([x + 7, y + 1.5], [x - 7, y + 1.5]);
  const g = c.createLinearGradient(x - 6, y - 10, x + 5, y);
  g.addColorStop(0, "#a8a296"); g.addColorStop(0.5, "#6e6a62"); g.addColorStop(1, "#33302c");
  I.poly(pts, g);
  c.strokeStyle = "rgba(20,18,16,0.6)"; c.lineWidth = 0.3;
  c.beginPath(); c.moveTo(x - 1, y - 9); c.lineTo(x + 1, y - 4); c.lineTo(x + 4, y - 2); c.stroke();
  c.fillStyle = "rgba(80,104,44,0.6)"; c.beginPath(); c.ellipse(x - 3, y - 7.5, 3, 1.2, -0.3, 0, Math.PI * 2); c.fill();
}

function stump(c: Ctx, I: Iso) {
  I.shadow(-6, -6, 6, 6, 2);
  const [x, y] = I.p(0, 0, 0), r = 5.5, h = 5;
  const g = c.createLinearGradient(x - r, 0, x + r, 0); g.addColorStop(0, "#7a5a3a"); g.addColorStop(0.5, "#4e3624"); g.addColorStop(1, "#22160c");
  c.fillStyle = g;
  c.beginPath(); c.moveTo(x - r - 1.5, y + 0.5); c.lineTo(x - r, y - h); c.lineTo(x + r, y - h); c.lineTo(x + r + 1.5, y + 0.5); c.ellipse(x, y + 0.5, r + 1.5, (r + 1.5) * 0.4, 0, 0, Math.PI); c.fill();
  c.fillStyle = "#a08058"; c.beginPath(); c.ellipse(x, y - h, r, r * 0.45, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "rgba(90,60,30,0.7)"; c.lineWidth = 0.22;
  for (const rr of [1.4, 2.8, 4.2]) { c.beginPath(); c.ellipse(x, y - h, rr, rr * 0.45, 0, 0, Math.PI * 2); c.stroke(); }
  c.strokeStyle = "rgba(20,12,6,0.5)"; c.beginPath(); c.moveTo(x, y - h); c.lineTo(x + 3, y - h + 1); c.stroke();
}

function grave(c: Ctx, I: Iso) {
  I.shadow(-5, -3, 5, 3, 2);
  const h = 13;
  I.box(-4.5, 4.5, -1.2, 1.2, 0, h - 3, 0x77736a, stones(c, 3, 0x77736a, 1));
  const [a, b] = [I.p(-4.5, 1.2, h - 3), I.p(4.5, 1.2, h - 3)];
  c.fillStyle = "#6a665e"; c.beginPath(); c.moveTo(...a); c.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 7, ...b); c.closePath(); c.fill();
  c.strokeStyle = "rgba(20,18,16,0.7)"; c.lineWidth = 0.5;
  const m = I.p(0, 1.2, h - 4);
  c.beginPath(); c.moveTo(m[0], m[1] - 3); c.lineTo(m[0], m[1] + 4); c.moveTo(m[0] - 2, m[1] - 0.5); c.lineTo(m[0] + 2, m[1] + 0.5); c.stroke();
  c.fillStyle = "rgba(70,92,40,0.6)"; c.beginPath(); c.ellipse(...I.p(-3, 1.2, 1), 2.5, 1, 0, 0, Math.PI * 2); c.fill();
}

function wheel(c: Ctx, I: Iso) {
  // the mill's paddle wheel: two rims tied by paddles, turning in the stream, on a timber frame with an axle
  const [x, y] = I.p(0, 0, 12);
  const R0 = 12.5;
  // frame posts and the axle beam into the mill
  I.box(-1, 1, -7, -5.5, -3, 15, 0x4a3420);
  I.box(-1, 1, 5.5, 7, -3, 15, 0x3e2c1a);
  const draw = (off: number, front: boolean) => {
    c.save(); c.translate(x + off, y + off * 0.5); c.transform(1, 0.5, 0, 1, 0, 0);
    c.strokeStyle = front ? "#4a3218" : "#2e1e10"; c.lineWidth = 1.6; c.beginPath(); c.arc(0, 0, R0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = front ? "#5a3e22" : "#3a2814"; c.lineWidth = 0.9;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + 0.2; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * R0, Math.sin(a) * R0); c.stroke(); }
    if (front) {
      c.strokeStyle = "rgba(150,120,80,0.6)"; c.lineWidth = 0.4; c.beginPath(); c.arc(0, 0, R0 + 0.4, Math.PI * 1.05, Math.PI * 1.6); c.stroke();
      c.strokeStyle = "rgba(70,96,44,0.85)"; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, R0, Math.PI * 0.15, Math.PI * 0.85); c.stroke(); // wet moss low on the rim
      c.fillStyle = "#2a1c0e"; c.beginPath(); c.arc(0, 0, 2, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#6a6a66"; c.beginPath(); c.arc(-0.4, -0.4, 0.9, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  };
  draw(-3, false);
  // paddles between the rims
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6;
    const px = Math.cos(a) * R0, py = Math.sin(a) * R0;
    const p0 = [x - 3 + px, y - 1.5 + py + px * 0.5], p1 = [x + 3 + px, y + 1.5 + py + px * 0.5];
    c.strokeStyle = Math.sin(a) > 0.3 ? "#2a1c10" : "#6a4a2a"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke();
  }
  draw(3, true);
  // churned water and spray at the foot
  const [wx, wy] = I.p(0, 0, 0);
  c.fillStyle = "rgba(200,214,206,0.55)"; c.beginPath(); c.ellipse(wx + 1, wy + 1, 11, 3, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "rgba(240,248,244,0.7)";
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; c.beginPath(); c.arc(wx + Math.cos(a) * (6 + (k % 3) * 2), wy + Math.sin(a) * 2 - (k % 2) * 1.5, 0.6 + (k % 3) * 0.3, 0, Math.PI * 2); c.fill(); }
}

function anvilTile(c: Ctx, I: Iso) { c.save(); c.translate(0, 6); anvil(c); c.restore(); void I; }

const UPRIGHT_ART: Partial<Record<number, (c: Ctx, I: Iso) => void>> = {
  [T.BARREL]: barrel, [T.CRATE]: crate, [T.WELL]: well, [T.SIGN]: (c, I) => signpost(c, I, 1), [T.SIGNPOST]: (c, I) => signpost(c, I, 2),
  [T.HAY]: hay, [T.ROCK]: (c, I) => rock(c, I, 7 + V * 13), [T.STUMP]: stump, [T.GRAVE]: grave, [T.WHEEL]: wheel, [T.ANVIL]: anvilTile,
};

/** Painted iso texture for an upright prop tile id, or undefined to keep the tile art. */
/** Which variant is being painted (0..VARIANTS-1): art functions read it so no two props look stamped out. */
let V = 0;
export const UPRIGHT_VARIANTS = 4;

export function uprightTexture(scene: Phaser.Scene, id: number, variant = 0): string | undefined {
  const art = UPRIGHT_ART[id];
  if (!art) return;
  const key = `up_${id}_${variant}`;
  hiResTexture(scene, key, UW, UH, 1, 6, (c) => {
    V = variant;
    const I = new Iso(c, UO[0], UO[1]);
    const R = rng(id * 131 + variant * 977 + 3);
    // signs, graves and stumps sit a little crooked; others keep their footing
    const lean = id === T.SIGN || id === T.SIGNPOST || id === T.GRAVE ? (R() - 0.5) * 0.22 : 0;
    if (lean) { c.save(); c.translate(UO[0], UO[1]); c.rotate(lean); c.translate(-UO[0], -UO[1]); }
    art(c, I);
    if (lean) c.restore();
    agePass(c, I, R, id);
  });
  return key;
}

/**
 * Time on a prop: lichen and moss on the upper, damp-catching surfaces, grime at the foot, chips and cracks,
 * and a ring of weeds, pebbles and leaves where it meets the ground. Differs per variant.
 */
function agePass(c: Ctx, I: Iso, R: () => number, id: number) {
  const [x, y] = I.p(0, 0, 0);
  // moss and lichen specks, only where there is already paint (source-atop)
  c.save(); c.globalCompositeOperation = "source-atop";
  const mossy = id === T.ROCK || id === T.GRAVE || id === T.STUMP || id === T.WELL ? 1 : 0.45;
  const nm = Math.round((20 + R() * 50) * mossy);
  const mx = x + (R() - 0.5) * 6, my = y - 4 - R() * 8;
  for (let k = 0; k < nm; k++) {
    const px = mx + (R() - 0.5) * 12, py = my + (R() - 0.5) * 8;
    c.fillStyle = R() < 0.8 ? ["rgba(70,92,40,0.75)", "rgba(92,110,50,0.7)", "rgba(56,74,34,0.8)"][Math.floor(R() * 3)] : "rgba(170,160,110,0.55)";
    c.beginPath(); c.ellipse(px, py, 0.4 + R() * 0.7, 0.3 + R() * 0.4, 0, 0, Math.PI * 2); c.fill();
  }
  // grime rising from the ground
  const g = c.createLinearGradient(0, y + 2, 0, y - 6);
  g.addColorStop(0, "rgba(28,22,14,0.45)"); g.addColorStop(1, "rgba(28,22,14,0)");
  c.fillStyle = g; c.fillRect(x - 16, y - 6, 32, 9);
  // chips and hairline cracks
  for (let k = 0; k < 2 + Math.floor(R() * 3); k++) {
    const px = x + (R() - 0.5) * 10, py = y - 2 - R() * 12;
    c.strokeStyle = "rgba(16,12,8,0.55)"; c.lineWidth = 0.25;
    c.beginPath(); c.moveTo(px, py); c.lineTo(px + (R() - 0.5) * 2, py + 1 + R() * 2); c.lineTo(px + (R() - 0.5) * 3, py + 2 + R() * 2.5); c.stroke();
  }
  c.restore();
  // weeds, pebbles and fallen leaves around the foot
  const ring = 6 + R() * 5;
  for (let k = 0; k < 4 + Math.floor(R() * 6); k++) {
    const a = R() * Math.PI * 2, d = ring * (0.75 + R() * 0.45);
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.5;
    if (Math.sin(a) < -0.2 && R() < 0.7) continue; // mostly in front and at the sides
    const kind = R();
    if (kind < 0.6) { // tuft
      c.lineCap = "round";
      for (let i = 0; i < 3 + Math.floor(R() * 4); i++) {
        const an = -Math.PI / 2 + (R() - 0.5) * 1.8, L = 1.5 + R() * 2.6;
        c.strokeStyle = ["#3c5a26", "#4e6c2e", "#62783a", "#7a7a40"][Math.floor(R() * 4)]; c.lineWidth = 0.4;
        c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(px + Math.cos(an) * L * 0.4, py + Math.sin(an) * L * 0.6, px + Math.cos(an) * L, py + Math.sin(an) * L * 0.7); c.stroke();
      }
    } else if (kind < 0.85) { // pebble
      c.fillStyle = "rgba(0,0,0,0.3)"; c.beginPath(); c.ellipse(px + 0.4, py + 0.3, 1, 0.5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = col(0x7a746a, 0.8 + R() * 0.4); c.beginPath(); c.ellipse(px, py, 0.9, 0.55, 0, 0, Math.PI * 2); c.fill();
    } else { // leaf
      c.fillStyle = R() < 0.5 ? "#7a5a2a" : "#6a3a20"; c.beginPath(); c.ellipse(px, py, 0.9, 0.45, R() * 3, 0, Math.PI * 2); c.fill();
    }
  }
}
