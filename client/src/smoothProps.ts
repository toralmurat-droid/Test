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

function witchHut(ctx: Ctx, f: number) {
  const I = new Iso(ctx, 50, 88);
  I.shadow(-20, -16, 20, 16, 6, 0.55);
  // stilts / stone footing
  I.box(-19, 19, -15, 15, 0, 4, 0x5a554c, stones(ctx, 3, 0x5a554c, 0.9));
  // walls of dark planks
  I.box(-17, 17, -13, 13, 4, 30, 0x4a3828, planks(ctx, 9, 0x4e3a28), false);
  // door on the left side (v = 13), round window on the right side (u = 17)
  const d: Pt[] = [I.p(-4, 13, 4), I.p(5, 13, 4), I.p(5, 13, 19), I.p(0.5, 13, 23), I.p(-4, 13, 19)];
  const dg = ctx.createLinearGradient(...d[0], ...d[1]); dg.addColorStop(0, "#5a2a6a"); dg.addColorStop(1, "#2e1238");
  I.poly(d, dg, "#1a0e10", 0.6);
  const [kx, ky] = I.p(3.5, 13, 11); ctx.fillStyle = "#c8a040"; ctx.beginPath(); ctx.arc(kx, ky, 0.7, 0, Math.PI * 2); ctx.fill();
  const [wx, wy] = I.p(17, 0, 19);
  glow(ctx, wx, wy, 9, "rgba(150,255,110,A)", 0.3 + 0.08 * (f % 2));
  ctx.fillStyle = "#1a1410"; ctx.beginPath(); ctx.ellipse(wx, wy, 4.4, 5, -0.45, 0, Math.PI * 2); ctx.fill();
  const wg = ctx.createRadialGradient(wx, wy, 0, wx, wy, 4); wg.addColorStop(0, "#e8ff9a"); wg.addColorStop(1, "#4a9a2a");
  ctx.fillStyle = wg; ctx.beginPath(); ctx.ellipse(wx, wy, 3.5, 4.1, -0.45, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#2a1c10"; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(wx - 3.2, wy + 1.6); ctx.lineTo(wx + 3.2, wy - 1.6); ctx.moveTo(wx - 1, wy - 3.8); ctx.lineTo(wx + 1, wy + 3.8); ctx.stroke();
  // skull over the door
  const [sx, sy] = I.p(0.5, 13, 27);
  ctx.fillStyle = "#e8e0cc"; ctx.beginPath(); ctx.ellipse(sx, sy, 2, 2.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(sx - 1.2, sy + 1, 2.4, 1.6);
  ctx.fillStyle = "#1a1410"; ctx.beginPath(); ctx.arc(sx - 0.8, sy, 0.55, 0, Math.PI * 2); ctx.arc(sx + 0.8, sy, 0.55, 0, Math.PI * 2); ctx.fill();
  // steep, sagging roof: ridge along u, two planes
  const ridgeZ = 58, eave = 26, o = 3;
  const roofPlane = (pts: Pt[], light: number) => {
    const g = ctx.createLinearGradient(...pts[0], ...pts[2]);
    g.addColorStop(0, col(0x3e2a52, light * 1.15)); g.addColorStop(1, col(0x3e2a52, light * 0.75));
    I.poly(pts, g);
    ctx.save(); I.clip(pts);
    // shingle rows
    const r = rng(19);
    for (let t = 0; t < 1; t += 0.085) {
      const a: Pt = [pts[0][0] + (pts[3][0] - pts[0][0]) * t, pts[0][1] + (pts[3][1] - pts[0][1]) * t];
      const b: Pt = [pts[1][0] + (pts[2][0] - pts[1][0]) * t, pts[1][1] + (pts[2][1] - pts[1][1]) * t];
      ctx.strokeStyle = `rgba(15,8,20,${0.55})`; ctx.lineWidth = 0.45;
      ctx.beginPath(); ctx.moveTo(...a); ctx.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 1.2, ...b); ctx.stroke();
      for (let s = 0; s < 12; s++) { const k = r(); ctx.fillStyle = `rgba(${k < 0.5 ? "90,70,110" : "20,12,26"},0.35)`; const x = a[0] + (b[0] - a[0]) * r(), y = a[1] + (b[1] - a[1]) * (x - a[0]) / ((b[0] - a[0]) || 1); ctx.fillRect(x, y - 1.8, 1.4, 1.6); }
    }
    ctx.restore();
  };
  // ridge runs along u: the front plane faces down-left, the right end is a gable
  const gable: Pt[] = [I.p(17, 13, 30), I.p(17, -13, 30), I.p(17, 0, ridgeZ - 2)];
  ctx.save(); I.poly(gable, col(0x3a2a1e, 0.6)); I.clip(gable);
  planks(ctx, 41, 0x3e2e20)("R", I.p(17, 13, 30), [1, -0.5], [0, -1], 26, ridgeZ - 30);
  ctx.restore();
  roofPlane([I.p(-17 - o, 0, ridgeZ), I.p(17 + o, 0, ridgeZ), I.p(17 + o, 13 + o, eave), I.p(-17 - o, 13 + o, eave)], 1.0);
  // thick roof edge over the gable (barge boards)
  ctx.strokeStyle = "#24182c"; ctx.lineWidth = 1.4; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(...I.p(17 + o, 13 + o, eave)); ctx.lineTo(...I.p(17 + o, 0, ridgeZ)); ctx.lineTo(...I.p(17 + o, -13 - o, eave)); ctx.stroke();
  ctx.strokeStyle = "rgba(160,130,190,0.45)"; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(...I.p(-17 - o, 0, ridgeZ)); ctx.lineTo(...I.p(17 + o, 0, ridgeZ)); ctx.stroke();
  // crooked chimney with green smoke
  I.box(-10, -5, 2, 7, 44, 64, 0x5a5048, stones(ctx, 31, 0x5a5048, 0.9));
  const [cx, cy] = I.p(-7.5, 4.5, 64);
  for (let k = 0; k < 4; k++) { const t = (k + f * 0.25) % 4; ctx.fillStyle = `rgba(150,200,130,${0.3 - t * 0.06})`; ctx.beginPath(); ctx.ellipse(cx + t * 2.5, cy - 3 - t * 5, 2.5 + t, 1.8 + t * 0.6, 0, 0, Math.PI * 2); ctx.fill(); }
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
  };
  for (let f = 0; f < 4; f++) paint(`forge_${f}`, forge, f);
  paint("anvil", anvil);
  paint("weapon_rack", weaponRack);
  for (let f = 0; f < 2; f++) paint(`cauldron_${f}`, cauldron, f);
  for (let f = 0; f < 3; f++) paint(`candles_${f}`, candles, f);
  paint("toadstools", toadstools);
  paint("herb_rack", herbRack);
  for (let f = 0; f < 4; f++) paint(`witch_hut_${f}`, witchHut, f);
  overrideTexture(scene, "props", hi);
}

// ---------- upright map props (barrels, crates, well, signs, hay…), one tile each ----------


const UW = 32, UH = 40, UO: Pt = [16, 34]; // texture size; footprint centre (shown at origin 0.5, 0.85)

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
  const ridge = 33, e = 25;
  const roof: Pt[] = [I.p(-12, 0, ridge), I.p(12, 0, ridge), I.p(12, 7, e), I.p(-12, 7, e)];
  const rg = c.createLinearGradient(...roof[0], ...roof[3]); rg.addColorStop(0, "#7a4a2e"); rg.addColorStop(1, "#4a2a18");
  I.poly(roof, rg, "#2a160a", 0.5);
  c.strokeStyle = "rgba(30,14,6,0.6)"; c.lineWidth = 0.3;
  for (let k = 1; k < 4; k++) { const a = I.p(-12, k * 1.75, ridge - k * 2), b = I.p(12, k * 1.75, ridge - k * 2); c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); }
  I.poly([I.p(12, 7, e), I.p(12, -7, e), I.p(12, 0, ridge)], "#3a2414");
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
  I.shadow(-6, -3, 6, 3, 2);
  const [x, y] = I.p(0, 0, 9);
  c.save(); c.translate(x, y); c.transform(1, 0.5, 0, 1, 0, 0);
  c.strokeStyle = "#4a3218"; c.lineWidth = 1.6; c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = "#8a6a42"; c.lineWidth = 0.4; c.beginPath(); c.arc(0, 0, 8.4, Math.PI * 1.1, Math.PI * 1.6); c.stroke();
  c.strokeStyle = "#5a3e22"; c.lineWidth = 0.8;
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 7.5, Math.sin(a) * 7.5); c.stroke(); }
  c.fillStyle = "#3a2814"; c.beginPath(); c.arc(0, 0, 1.8, 0, Math.PI * 2); c.fill();
  c.restore();
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
