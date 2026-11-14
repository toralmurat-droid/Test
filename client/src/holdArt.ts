import { CLANS, type ClanKey } from "../../shared/war/clans";
import { dith, hsh, IsoPaint, mat, ramp, type Mat, type V3 } from "./isoPaint";
import { BONER, BRASSR, IRONR, OLDR, REDR, ROPER, STONER, STRAWR, WOODR, wood } from "./isoProps";
import type { Pen } from "./worldProps";
import { HOLD_H, HOLD_OX, HOLD_OY, HOLD_W } from "./holdAssets";

/**
 * The clan war Holds as true isometric forts and camps (Murat 2026-11-14: "the holds look terrible, they should be in
 * full isometric style, or even like an encampment"). Each clan's compound is built from volumes with the depth-buffered
 * iso painter (isoPaint.ts: lit and shaded faces, like the bonfire): Wardens a palisade fort with gate and watchtower,
 * Redfang a hide-tent war camp, the Ossuary Host a crooked bone-and-stone keep, the Hide-Kin earthworks round a burrow
 * mound, the Veiled Circle a walled sandstone shrine. About 7 tiles across on the ground.
 *
 * Two layers: the trampled ground (its own image, drawn under heroes so they can walk the compound) and the standing
 * parts (outlined, sorted by the Hold's foot). Only tools/art/holds.ts imports this file; the game loads the baked PNGs. Units are texels, 1.5 per world px (a tile is 48 units); the compound's
 * centre is the origin. Cosmetic only: a Hold has no collision. Seeded hashes only (deterministic).
 */
const TX = 1.5, T = 48;
const OUTLINE = 0x15100d;

const hex = (n: number) => n;
const mixc = (a: number, b: number, t: number) => {
  const m = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
  return m(16) | m(8) | m(0);
};
/** Five-step ramp of one colour, dark to light. */
const cr = (c: number) => [mixc(c, 0, 0.75), mixc(c, 0, 0.5), mixc(c, 0, 0.22), c, mixc(c, 0xffffff, 0.18), mixc(c, 0xffffff, 0.4)];
const FIRE = [0x5a1408, 0x9a2c0c, 0xd2480e, 0xf2761c, 0xffa22e, 0xffd25a, 0xfff0a8];
const GHOST = [0x0c3a30, 0x16664f, 0x2f9a78, 0x4fc9a0, 0x9af0d0, 0xe0fff0];
const ARCANE = [0x2a1a5a, 0x4a30a0, 0x7a58e0, 0xa890ff, 0xd8ccff];
const GOLDR = [0x3a2808, 0x6b4a12, 0xa8761c, 0xd9a030, 0xf6d26b, 0xfff2b0];
const SAND = [0x3a2a1a, 0x5a4228, 0x7d5f3a, 0xa07f4e, 0xc4a368, 0xe0c48a];
const SOIL = [0x140d08, 0x24180f, 0x3a281a, 0x52392a, 0x6c4e36, 0x86664a];
const HIDE = [0x2a1c10, 0x4a3320, 0x6e4e30, 0x8f6a42, 0xb08a58, 0xcfae78];
const GREYB = [0x0e1210, 0x1a2020, 0x2a3230, 0x3e4846, 0x58625f, 0x7a8582];
const STICK = [0x2a2218, 0x463a28, 0x66563c, 0x86744e, 0xa49266, 0xc0b084];

// ---- materials ----------------------------------------------------------------------------------------------
const rough = (pal: number[], bias = 0, g = 0.18): Mat => (l, _s, _t, x, y) => ramp(pal, l + bias + (hsh(x >> 1, y >> 1, 5) - 0.5) * g - (hsh(x, y, 6) < 0.05 ? 0.2 : 0), x, y);
/** Courses of blocks: `ch` texels high, `bw` wide, on a face of `sw` x `th` texels. */
const blocks = (pal: number[], sw: number, th: number, ch = 7, bw = 11, bias = 0): Mat => (l, s, t, x, y) => {
  const row = Math.floor(t * th / ch), col = Math.floor(s * sw / bw + (row % 2) * 0.5), fy = (t * th / ch) % 1, fx = (s * sw / bw + (row % 2) * 0.5) % 1;
  const mortar = fy < 0.12 || fx < 0.08;
  return ramp(pal, l + bias + (hsh(col, row, 9) - 0.5) * 0.3 + (hsh(x, y, 4) - 0.5) * 0.1 - (mortar ? 0.28 : 0) + (fy > 0.85 ? 0.08 : 0), x, y);
};
const cloth = (pal: number[], stripe?: number[], n = 0, bias = 0): Mat => (l, s, t, x, y) => {
  const st = n > 0 && Math.floor(s * n) % 2 === 1;
  return ramp(st && stripe ? stripe : pal, l + bias + Math.sin(s * 30 + t * 3) * 0.05 + (hsh(x, y, 2) - 0.5) * 0.08, x, y);
};

/** One clan's compound is drawn through this: a ground layer and a standing layer sharing a coordinate system. */
class Scene {
  q: IsoPaint; g: IsoPaint;
  glows: { u: number; v: number; r: number; col: number; a: number }[] = [];
  holes: ((u: number, v: number) => boolean)[] = [];
  constructor(pg: Pen, pq: Pen) {
    this.g = new IsoPaint(pg, HOLD_W, HOLD_H, HOLD_OX, HOLD_OY);
    this.q = new IsoPaint(pq, HOLD_W, HOLD_H, HOLD_OX, HOLD_OY);
  }
  rod(a: V3, b: V3, r: number, m: Mat) { this.q.rod(a, b, r, m); }
  box(u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, m: Mat, f = 7) { this.q.box(u0, u1, v0, v1, z0, z1, m, f); }
  /** A post with a sharpened (or flat) top. */
  post(u: number, v: number, h: number, r: number, m: Mat, tip = true, lean: [number, number] = [0, 0]) {
    const top: V3 = [u + lean[0] * h, v + lean[1] * h, h];
    this.rod([u, v, 0], top, r, m);
    if (tip) this.q.blob([top[0], top[1], top[2] - r * 0.3], r, r, r * 2.2, m, 0.5, 1);
  }
  /** A closed surface of revolution round (cu, cv): radius r(t), t = 0 bottom .. 1 top, leaning `lean` per unit height. */
  lathe(cu: number, cv: number, z0: number, z1: number, rad: (t: number) => number, m: Mat, lean: [number, number] = [0, 0], wob = 0) {
    const R = rad(0.5) + 4;
    this.q.surf((s, t) => {
      const a = s * Math.PI * 2, z = z0 + (z1 - z0) * t, r = rad(t) * (1 + wob * (hsh(Math.floor(s * 24), Math.floor(t * 6), 3) - 0.5)), dr = (rad(Math.min(1, t + 0.02)) - rad(t)) / (0.02 * (z1 - z0));
      const n: V3 = [Math.cos(a), Math.sin(a), -dr];
      return [[cu + lean[0] * z + Math.cos(a) * r, cv + lean[1] * z + Math.sin(a) * r, z], n];
    }, Math.ceil(R * 7), Math.ceil((z1 - z0) * 2.4), m);
  }
  disc(cu: number, cv: number, z: number, r: number, m: Mat, lean: [number, number] = [0, 0]) {
    this.q.surf((s, t) => { const a = s * Math.PI * 2; return [[cu + lean[0] * z + Math.cos(a) * r * t, cv + lean[1] * z + Math.sin(a) * r * t, z], [0, 0, 1]]; }, Math.ceil(r * 7), Math.ceil(r * 2), m);
  }
  /** Pitched tent of two cloth slopes with a ridge along u (axis 0) or v (axis 1), open dark gable at the front. */
  tent(cu: number, cv: number, len: number, wid: number, h: number, pal: number[], stripe: number[] | undefined, axis: 0 | 1, trim = ROPER) {
    const P = (a: number, b: number, z: number): V3 => (axis === 0 ? [cu + a, cv + b, z] : [cu + b, cv + a, z]);
    const sl = (sgn: number) => this.q.sheet((s, t) => {
      const a = (s - 0.5) * 2 * len, b = sgn * wid * (1 - t);
      return P(a, b, h * t + Math.sin(s * 22 + sgn) * 0.5 * t * (1 - t));
    }, Math.ceil(len * 5), Math.ceil(wid * 3), cloth(pal, stripe, 9), 0);
    sl(1); sl(-1);
    // the dark gable (front end) with a flap
    const dark: Mat = (l, s, t, x, y) => (t > 0.66 && Math.abs(s - 0.5) < 0.1 + (1 - t) * 0.3 ? ramp([0x050403, 0x0e0a08, 0x1a120d], t - 0.4, x, y) : ramp(pal, l * 0.9, x, y));
    this.q.surf((s, t) => [P(len, (s - 0.5) * 2 * wid * (1 - t), h * t), axis === 0 ? [1, 0, 0] : [0, 1, 0]], Math.ceil(wid * 5), Math.ceil(h * 3), dark);
    // ridge pole ends and guy ropes
    this.rod(P(-len - 4, 0, h + 1), P(len + 6, 0, h + 1), 0.9, wood(WOODR, 0.1, 20));
    for (const sg of [-1, 1]) this.rod(P(len + 3, sg * (wid + 8), 0), P(len, sg * wid * 0.2, h * 0.8), 0.35, mat(trim));
  }
  /** Round hide tent (a cone with a pole crown). */
  cone(cu: number, cv: number, r: number, h: number, pal: number[], seed = 0, door = true) {
    this.lathe(cu, cv, 0, h, (t) => r * (1 - t) ** 0.9 + 0.2, (l, s, t, x, y) => {
      const patch = hsh(Math.floor(s * 14), Math.floor(t * 8), seed) < 0.18 ? -0.12 : 0;
      const door_ = door && s > 0.18 && s < 0.32 && t < 0.5 - (s - 0.25) ** 2 * 0 ;
      if (door_) return ramp([0x050403, 0x120c08, 0x1e140e], t + 0.2, x, y);
      return ramp(pal, l + patch + (hsh(x, y, 1) - 0.5) * 0.1 + (t > 0.97 ? 0.1 : 0), x, y);
    }, [0, 0], 0.05);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + seed; this.rod([cu + Math.cos(a) * 1.5, cv + Math.sin(a) * 1.5, h - 4], [cu + Math.cos(a) * 5, cv + Math.sin(a) * 5, h + 10], 0.7, wood(WOODR, 0.05, 10)); }
  }
  /** Hanging cloth on a pole: banner of the clan. */
  banner(u: number, v: number, h: number, k: ClanKey, w = 20, len = 38, axis: 0 | 1 = 1) {
    const c = CLANS[k], cl = cr(k === "host" ? 0x38403d : c.cloth), trim = cr(c.trim);
    this.post(u, v, h + 6, 1.6, wood(WOODR, 0, 40), false);
    this.q.blob([u, v, h + 8], 2.4, 2.4, 2.4, mat(BRASSR));
    const P = (a: number, z: number): V3 => (axis === 1 ? [u, v + a, z] : [u + a, v, z]);
    this.rod(P(0, h), P(w + 2, h), 0.7, wood(WOODR, 0.05, 10));
    this.q.sheet((s, t) => {
      const wave = Math.sin(s * 5 + 1) * 1.6 * t;
      const p = P(s * w, h - t * len);
      return axis === 1 ? [p[0] + wave, p[1], p[2]] : [p[0], p[1] + wave, p[2]];
    }, Math.ceil(w * 2.4), Math.ceil(len * 2.4), (l, s, t, x, y) => {
      const bot = len * (1 - t), swallow = s > 0.5 ? 0 : 0;
      if (t > 0.97 - 0.12 * Math.abs(s - 0.5) * 2 + swallow && t > 0.9) return undefined;
      if (s < 0.07 || s > 0.93 || t < 0.04) return ramp(trim, l * 0.9, x, y);
      const sig = Math.abs(s - 0.5) + Math.abs(t - 0.42) * 0.9 < 0.2;
      if (sig) return ramp(cr(c.sigil), l * 0.9, x, y);
      return ramp(cl, l * 0.95 + Math.sin(s * 14 + t * 2) * 0.05 - (bot < 4 && hsh(Math.floor(s * 12), 0, 7) < 0.4 ? 0.2 : 0), x, y);
    });
  }
  /** Iron bowl on a tripod with flames; `pal` picks the fire colour. */
  brazier(u: number, v: number, h = 22, pal = FIRE, light = 0xffa040) {
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; this.rod([u + Math.cos(a) * 7, v + Math.sin(a) * 7, 0], [u + Math.cos(a) * 2, v + Math.sin(a) * 2, h - 2], 0.9, mat(IRONR, -0.05)); }
    this.q.blob([u, v, h], 7, 7, 4.5, mat(IRONR, 0), 0, 0.5);
    this.q.blob([u, v, h + 1], 5.5, 5.5, 3, mat([0x3a1004, 0x6a2008, 0xa03a0c], 0), 0.5, 1);
    this.flame(u, v, h + 2, 5, 14, pal);
    this.glows.push({ u, v, r: 52, col: light, a: 0.5 });
  }
  flame(u: number, v: number, z: number, r: number, h: number, pal = FIRE) {
    const f: Mat = (_l, _s, t, x, y) => ramp(pal, 0.25 + t * 0.7 + (dith(x, y) - 0.5) * 0.2, x, y);
    this.q.blob([u, v, z + h * 0.3], r, r, h * 0.5, f, 0.25, 1);
    this.q.blob([u + 1.2, v - 1, z + h * 0.55], r * 0.6, r * 0.6, h * 0.5, (_l, _s, t, x, y) => ramp(pal, 0.55 + t * 0.45, x, y), 0.3, 1);
  }
  /** Crates and barrels clutter. */
  crate(u: number, v: number, s: number, h: number, pal = WOODR) { this.box(u - s, u + s, v - s, v + s, 0, h, wood(pal, 0, 12)); this.box(u - s - 0.3, u + s + 0.3, v - s - 0.3, v + s + 0.3, h * 0.45, h * 0.55, wood(OLDR, -0.1, 12)); }
  barrel(u: number, v: number, r = 6, h = 12) {
    this.lathe(u, v, 0, h, (t) => r * (1 + Math.sin(t * Math.PI) * 0.14), wood(WOODR, 0, 14));
    this.disc(u, v, h, r * 0.95, wood(WOODR, 0.08, 10));
    for (const t of [0.2, 0.8]) this.lathe(u, v, h * t - 0.6, h * t + 0.6, () => r * (1 + Math.sin(t * Math.PI) * 0.14) + 0.35, mat(IRONR, -0.1));
  }
  /** A line of upright logs/stakes along (a -> b); `skip` leaves gaps (t ranges), `h` varies per log. */
  row(a: [number, number], b: [number, number], o: { h: number; r?: number; step?: number; pal?: number[]; skip?: [number, number][]; seed?: number; lean?: [number, number]; rails?: number[]; tip?: boolean; jag?: number; mat?: Mat }) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), r = o.r ?? 3.4, step = o.step ?? r * 2.05, n = Math.max(1, Math.floor(len / step));
    const m = o.mat ?? wood(o.pal ?? WOODR, 0, 40), logs: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (o.skip?.some(([s0, s1]) => t >= s0 && t <= s1)) continue;
      const h = o.h * (1 - (o.jag ?? 0.18) * hsh(i, o.seed ?? 0, 1));
      const u = a[0] + (b[0] - a[0]) * t, v = a[1] + (b[1] - a[1]) * t, jx = (hsh(i, o.seed ?? 0, 2) - 0.5) * 1.2;
      this.post(u + jx, v - jx, h, r * (0.9 + hsh(i, o.seed ?? 0, 3) * 0.2), m, o.tip ?? true, o.lean);
      logs.push([u, v, h]);
    }
    for (const z of o.rails ?? []) for (let i = 1; i < logs.length; i++) {
      const p = logs[i - 1], q = logs[i];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) > step * 2.5) continue;
      this.rod([p[0], p[1], z], [q[0], q[1], z], r * 0.4, wood(OLDR, 0.1, 10));
    }
  }
  /** Stone/sandstone wall run: box with crenels. */
  wall(a: [number, number], b: [number, number], h: number, th: number, pal: number[], cren = true, skip: [number, number][] = []) {
    const alongU = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
    const lo = alongU ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]), hi = alongU ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]), c = alongU ? a[1] : a[0];
    const L = hi - lo;
    const seg = (s0: number, s1: number) => {
      const x0 = lo + s0 * L, x1 = lo + s1 * L, m = blocks(pal, x1 - x0, h, 8, 12);
      if (alongU) this.box(x0, x1, c - th, c + th, 0, h, m); else this.box(c - th, c + th, x0, x1, 0, h, m);
      if (cren) for (let x = x0 + 3; x < x1 - 4; x += 12) {
        if (alongU) this.box(x, x + 6, c - th, c + th, h, h + 6, blocks(pal, 6, 6, 6, 6)); else this.box(c - th, c + th, x, x + 6, h, h + 6, blocks(pal, 6, 6, 6, 6));
      }
    };
    let s = 0;
    for (const [k0, k1] of [...skip].sort((p, q) => p[0] - q[0])) { if (k0 > s) seg(s, k0); s = k1; }
    if (s < 1) seg(s, 1);
  }
  /** Standing stone with a glowing rune column. */
  stone(u: number, v: number, w: number, h: number, pal: number[], rune: number[] | undefined, seed = 0) {
    const m: Mat = (l, s, t, x, y) => {
      if (rune && t > 0.2 && t < 0.88 && s > 0.2 && s < 0.8) {
        const cx = Math.floor(s * 5), cy = Math.floor(t * 9);
        const on = cx === 2 || (hsh(cx, cy, seed) < 0.45 && (cy % 2 === 0 || cx !== 1));
        if (on && hsh(cx, cy, seed + 3) < 0.85) return ramp(rune, 0.7 + hsh(cx, cy, seed) * 0.3, x, y);
      }
      return ramp(pal, l + (hsh(x >> 1, y >> 1, seed) - 0.5) * 0.25, x, y);
    };
    const taper = (z: number) => w * (1 - 0.22 * z / h);
    for (const [fu, fv, nrm] of [[1, 0, 4], [0, 1, 2]] as const) {
      this.q.surf((s, t) => {
        const z = t * h, ww = taper(z);
        return fu ? [[u + ww, v - ww + s * 2 * ww, z], [1, 0, 0.15]] : [[u - ww + s * 2 * ww, v + ww, z], [0, 1, 0.15]];
      }, Math.ceil(w * 5), Math.ceil(h * 2.4), m); void nrm;
    }
    this.q.surf((s, t) => [[u - w * 0.78 + s * w * 1.56, v - w * 0.78 + t * w * 1.56, h], [0, 0, 1]], 12, 12, rough(pal, 0.05));
    this.q.shadow(u, v, w * 1.1, 0.35);
    if (rune) this.glows.push({ u, v, r: 36, col: rune[2], a: 0.35 });
  }
  /** Skull on a pole top: a bone ellipsoid with dark sockets and a jaw. */
  skull(u: number, v: number, z: number, s = 4.2, horn = false) {
    this.q.blob([u, v, z], s, s * 0.9, s * 0.95, mat(BONER, 0.05));
    this.q.blob([u + s * 0.5, v + s * 0.5, z - s * 0.8], s * 0.6, s * 0.6, s * 0.4, mat(BONER, -0.1));
    for (const o of [-0.45, 0.45]) this.q.blob([u + s * 0.82 + 0.2, v + s * 0.82 * (o > 0 ? 0.1 : 0.9) - s * 0.4 + 0.1, z + s * 0.1], s * 0.3, s * 0.3, s * 0.32, mat([0x050403, 0x0a0806], 0));
    if (horn) for (const sg of [-1, 1]) this.rod([u - sg * s * 0.4, v + sg * s * 0.4, z + s * 0.7], [u - sg * s * 1.6, v + sg * s * 1.6, z + s * 2.6], 1, mat(BONER, 0.05));
  }
  /** Soft warm/cold pools on the ground, applied when the ground is painted. */
  light(u: number, v: number, r: number, col: number, a = 0.5) { this.glows.push({ u, v, r, col, a }); }
  /** The trampled ground: a rounded patch with ragged dithered edges; `hole` carves trenches. */
  floor(R: number, pal: number[], edge: number[], inner?: (u: number, v: number) => number | undefined) {
    this.g.surf((s, t) => [[(s - 0.5) * 2 * R, (t - 0.5) * 2 * R, 0], [0, 0, 1]], Math.ceil(R * 5), Math.ceil(R * 5), (l, s, t, x, y) => {
      const u = (s - 0.5) * 2 * R, v = (t - 0.5) * 2 * R;
      const d = Math.hypot(u, v) / R, rr = Math.max(Math.abs(u), Math.abs(v)) / R, e = Math.min(1, (d * 0.7 + rr * 0.3));
      const noise = (hsh(Math.floor(u / 9), Math.floor(v / 9), 3) - 0.5) * 0.14 + (hsh(Math.floor(u / 3), Math.floor(v / 3), 4) - 0.5) * 0.1;
      if (e + noise > 0.97 || e + noise + (dith(x, y) - 0.5) * 0.12 > 0.92) return undefined;
      if (this.holes.some((h) => h(u, v))) return undefined;
      const special = inner?.(u, v);
      if (special !== undefined) return special;
      let c = ramp(pal, 0.45 + noise * 2.5 + (hsh(x, y, 7) < 0.06 ? 0.2 : 0) - (hsh(x, y, 8) < 0.05 ? 0.15 : 0), x, y);
      if (e > 0.78) c = ramp(edge, 0.4 + noise * 2 + (0.92 - e) * 2, x, y);
      for (const g of this.glows) {
        const dd = Math.hypot(u - g.u, v - g.v) / g.r;
        if (dd < 1 && dith(x, y) < (1 - dd) * g.a * 1.7) c = mixc(c, g.col, 0.35 + 0.3 * (1 - dd));
      }
      return c;
    });
  }
  /** Sparse ground litter drawn on the standing layer: pebbles, bones, tufts. */
  litter(R: number, n: number, kinds: ("pebble" | "bone" | "tuft" | "straw")[], seed: number, avoid: (u: number, v: number) => boolean = () => false) {
    for (let i = 0; i < n; i++) {
      const a = hsh(i, seed, 1) * 6.283, d = Math.sqrt(hsh(i, seed, 2)) * R * 0.95, u = Math.cos(a) * d, v = Math.sin(a) * d * 0.95;
      if (avoid(u, v) || this.holes.some((h) => h(u, v))) continue;
      const k = kinds[i % kinds.length], s = 1 + hsh(i, seed, 3) * 1.4;
      if (k === "pebble") this.q.blob([u, v, 0.5], s * 1.3, s, s * 0.7, rough(STONER, 0.05));
      else if (k === "bone") this.rod([u, v, 0.6], [u + 5 * (hsh(i, seed, 4) - 0.5) * 2, v + 4 * (hsh(i, seed, 5) - 0.5) * 2, 0.6], 0.8, mat(BONER));
      else if (k === "straw") this.rod([u, v, 0.4], [u + 6, v + 2 * (hsh(i, seed, 5) - 0.5), 0.4], 0.4, mat(STRAWR));
      else for (let b = 0; b < 3; b++) this.rod([u + b - 1, v, 0], [u + b * 1.6 - 2.2, v - 1, 3 + hsh(i, b, seed) * 3], 0.35, mat([0x2a3a14, 0x4a5c20, 0x6c8030]));
    }
  }
  /** Spear/weapon rack. */
  rack(u: number, v: number, axis: 0 | 1 = 0, n = 5) {
    const P = (a: number, b: number, z: number): V3 => (axis === 0 ? [u + a, v + b, z] : [u + b, v + a, z]);
    for (const a of [-12, 12]) this.rod(P(a, 0, 0), P(a, 0, 26), 1.2, wood(WOODR, 0, 20));
    this.rod(P(-14, 0, 14), P(14, 0, 14), 0.9, wood(OLDR, 0.05, 20));
    this.rod(P(-14, 0, 22), P(14, 0, 22), 0.9, wood(OLDR, 0.05, 20));
    for (let i = 0; i < n; i++) {
      const a = -10 + i * (20 / (n - 1)), lean = (i % 2 ? 1 : -1) * 1.5;
      this.rod(P(a, 2, 0), P(a + lean, 2, 36 + hsh(i, 3, 9) * 4), 0.55, wood(WOODR, 0.1, 20));
      this.rod(P(a + lean, 2, 36 + hsh(i, 3, 9) * 4), P(a + lean, 2, 43 + hsh(i, 3, 9) * 4), 0.7, mat(IRONR, 0.15));
    }
    this.q.shadow(u, v, 14, 0.3);
  }
  /** Round cauldron on a tripod over a fire. */
  cookfire(u: number, v: number) {
    for (let i = 0; i < 8; i++) { const a = i * 0.785; this.q.blob([u + Math.cos(a) * 9, v + Math.sin(a) * 9, 1.5], 3, 3, 2.4, rough(STONER, 0)); }
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.3; this.rod([u + Math.cos(a) * 9, v + Math.sin(a) * 9, 0], [u, v, 26], 0.9, wood(OLDR, 0, 12)); }
    this.rod([u - 5, v - 3, 2], [u + 5, v + 3, 3], 1.6, wood([0x0a0605, 0x1c1410, 0x30241a, 0x46362a], 0, 6));
    this.flame(u, v, 2, 5.5, 13);
    this.q.blob([u, v, 17], 8, 8, 6.5, mat(IRONR, -0.05), 0, 1);
    this.q.blob([u, v, 22.5], 6.6, 6.6, 1.4, (_l, _s, t, x, y) => ramp([0x3a2a10, 0x5a3c14, 0x7a5a1c], 0.4 + t * 0.4, x, y), 0.5, 1);
    this.glows.push({ u, v, r: 60, col: 0xff9a30, a: 0.55 });
  }
  shadowAt(u: number, v: number, r: number, a = 0.4) { this.q.shadow(u, v, r, a); }
}

// ---- Wardens: palisade fort ---------------------------------------------------------------------------------
/** A square wooden tower: four legs, X braces, a deck with rails and a shingle roof. */
function woodTower(s: Scene, u: number, v: number, h: number, half: number, k: ClanKey, rooftop = true) {
  const A = half, B = half * 0.72;
  for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s.rod([u + su * A, v + sv * A, 0], [u + su * B, v + sv * B, h], 2.2, wood(WOODR, su + sv < 0 ? -0.1 : 0, 50));
  for (const f of [0.34, 0.68]) {
    const a = A + (B - A) * f, z = h * f;
    for (const [p, q] of [[[-1, 1], [1, 1]], [[1, 1], [1, -1]], [[-1, -1], [1, -1]], [[-1, -1], [-1, 1]]]) s.rod([u + p[0] * a, v + p[1] * a, z], [u + q[0] * a, v + q[1] * a, z], 1.1, wood(OLDR, 0.05, 20));
    for (const [p, q] of [[[-1, 1], [1, 1]], [[1, 1], [1, -1]]]) s.rod([u + p[0] * A, v + p[1] * A, z - h * 0.34], [u + q[0] * a, v + q[1] * a, z], 0.7, wood(OLDR, 0.05, 20));
  }
  const D = half * 0.72 + 6;
  s.box(u - D, u + D, v - D, v + D, h - 4, h, wood(WOODR, 0.05, 20));
  for (const [pu, pv] of [[-D + 1, -D + 1], [D - 1, -D + 1], [-D + 1, D - 1], [D - 1, D - 1]]) s.rod([u + pu, v + pv, h], [u + pu, v + pv, h + 34], 1.1, wood(WOODR, 0, 20));
  for (const [a, b] of [[[-1, 1], [1, 1]], [[1, 1], [1, -1]], [[-1, -1], [1, -1]], [[-1, -1], [-1, 1]]]) {
    for (const z of [h + 9, h + 15]) s.rod([u + a[0] * (D - 1), v + a[1] * (D - 1), z], [u + b[0] * (D - 1), v + b[1] * (D - 1), z], 0.7, wood(OLDR, 0.1, 20));
    s.rod([u + a[0] * (D - 1), v + a[1] * (D - 1), h + 34], [u + b[0] * (D - 1), v + b[1] * (D - 1), h + 34], 0.7, wood(OLDR, 0.05, 20));
  }
  if (!rooftop) return;
  // shingle pyramid roof in dark timber with amber ridge trim
  const E = D + 7, ez = h + 33, apex: V3 = [u, v, h + 62], corners: V3[] = [[u - E, v - E, ez], [u + E, v - E, ez], [u + E, v + E, ez], [u - E, v + E, ez]];
  const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    const e1: V3 = [b[0] - a[0], b[1] - a[1], 0], e2: V3 = [apex[0] - a[0], apex[1] - a[1], apex[2] - a[2]];
    let n: V3 = [e1[1] * e2[2], -e1[0] * e2[2] + e1[2] * e2[0], e1[0] * e2[1] - e1[1] * e2[0]]; const m = Math.hypot(...n); n = [n[0] / m, n[1] / m, n[2] / m];
    if (n[0] * (a[0] - u) + n[1] * (a[1] - v) < 0) n = [-n[0], -n[1], -n[2]];
    s.q.surf((ss, t) => [lerp(lerp(a, b, ss), apex, t), n], 60, 40, (l, ss, t, x, y) => {
      if (t < 0.06 && hsh(Math.floor(ss * 30), 0, i) < 0.3) return undefined;
      const row = Math.floor(t * 9), col = Math.floor(ss * 14 * (1 - t) + row * 0.5), mortar = (t * 9) % 1 < 0.15;
      if (t > 0.92) return ramp(cr(CLANS[k].trim), l, x, y);
      return ramp(OLDR, l * 1.05 + (hsh(col, row, i) - 0.5) * 0.35 - (mortar ? 0.25 : 0), x, y);
    });
  }
  s.rod([u, v, h + 60], [u, v, h + 84], 0.9, wood(WOODR, 0, 20));
  s.banner(u + 0.01, v, h + 80, k, 16, 30, 1);
  s.shadowAt(u, v, A * 1.1, 0.4);
}

function wardens(s: Scene) {
  const k: ClanKey = "wardens", R = 138, clan = CLANS.wardens;
  s.holes = [];
  s.light(0, 10, 60, 0xff9a30, 0.45);
  const gate: [number, number] = [-0.5, 0.5];
  s.floor(R + 22, [0x1c140c, 0x2c2014, 0x40301e, 0x584428, 0x6e5a34, 0x846e44], [0x242a14, 0x34401c, 0x4a5a24, 0x5e7230],
    (u, v) => (Math.abs(v) < 16 && u > 0 ? ramp([0x2a2014, 0x3a2c1c, 0x4e3c26, 0x66503a], 0.4 + (hsh(Math.floor(u / 4), Math.floor(v / 6), 2) - 0.5) * 0.3, Math.floor(u), Math.floor(v)) : undefined));
  s.litter(R + 10, 40, ["straw", "pebble", "tuft"], 11);
  // palisade: back sides full, the front (u = +R) with a gate, the v = +R side short
  const o = { h: 60, r: 3.6, rails: [18, 40], seed: 3 };
  s.row([-R, -R], [-R, R], o); s.row([-R, -R], [R, -R], { ...o, seed: 4 });
  s.row([R, -R], [R, R], { ...o, seed: 5, skip: [[0.4, 0.62]] });
  s.row([-R, R], [-30, R], { ...o, seed: 6 });
  s.row([70, R], [R, R], { ...o, seed: 7 });
  // the gate: two tall posts, a lintel and open doors, a gate tower pair with banners
  const gv = [-R * 0.2 - 0 + 6, R * 0.1 + 6];
  for (const v of [gv[0] - 4, gv[1] + 4]) { s.post(R, v, 88, 4.4, wood(WOODR, 0.05, 40), false); s.box(R - 5, R + 5, v - 5, v + 5, 84, 92, wood(OLDR, 0.1, 10)); }
  s.box(R - 3, R + 3, gv[0] - 6, gv[1] + 6, 78, 86, wood(WOODR, 0.1, 30));
  s.skull(R + 3.5, (gv[0] + gv[1]) / 2, 90, 4.4);
  for (const sg of [0, 1]) { const v0 = sg ? gv[1] + 2 : gv[0] - 2; s.q.quad([R + 1, v0, 0], [14, sg ? 14 : -14, 0], [0, 0, 64], wood(WOODR, -0.1, 10)); }
  woodTower(s, R - 14, gv[0] - 40, 86, 14, k, true);
  woodTower(s, R - 14, gv[1] + 40, 86, 14, k, true);
  s.brazier(R + 22, gv[0] - 14); s.brazier(R + 22, gv[1] + 14);
  s.banner(R + 36, gv[0] - 34, 100, k, 22, 46, 1); s.banner(R + 36, gv[1] + 30, 100, k, 22, 46, 1);
  // the great watchtower in the back corner
  woodTower(s, -R + 26, -R + 26, 140, 20, k, true);
  // tents (olive canvas with amber stripes), a store hut with crates, a training dummy
  const cl = cr(clan.cloth), amb = cr(clan.trim);
  s.tent(-52, 34, 26, 17, 34, cl.map((c) => mixc(c, 0x4a5a30, 0.2)), amb, 0);
  s.tent(-14, -60, 26, 17, 34, cl.map((c) => mixc(c, 0x4a5a30, 0.2)), amb, 1);
  s.tent(-78, -34, 22, 15, 30, cl.map((c) => mixc(c, 0x4a5a30, 0.2)), amb, 0);
  s.crate(26, -52, 7, 12); s.crate(38, -46, 6, 9); s.barrel(30, -34); s.barrel(42, -32, 5.5, 11);
  s.crate(-100, 60, 7, 12); s.barrel(-90, 72); s.barrel(-110, 76, 5.5, 11);
  s.rack(44, 70, 0, 5);
  // a hearth fire in the middle with log seats, a banner pole beside it
  s.cookfire(8, 18);
  s.rod([-10, 40, 2], [20, 42, 2], 3, wood(WOODR, 0, 12)); s.rod([-20, 6, 2], [-18, 30, 2], 3, wood(WOODR, 0, 12));
  s.banner(34, -8, 96, k, 24, 50, 1);
  // outside: a sharpened-stake ditch edge at the front corners
  for (let i = 0; i < 6; i++) s.post(R + 26 + i * 4, -R + 8 + i * 6 - 0, 20, 1.6, wood(WOODR, 0, 10), true, [0.4, 0]);
}

// ---- Redfang: hide-tent war camp ---------------------------------------------------------------------------
function redfang(s: Scene) {
  const R = 132, red = [0x1e0606, 0x380c0a, 0x561410, 0x761e16, 0x962a1e, 0xb43c28], hide = [0x241810, 0x3c281a, 0x5a3c24, 0x7a5434, 0x9a7048, 0xb8905e];
  s.light(14, 20, 70, 0xff7a20, 0.55);
  s.floor(R + 24, [0x1a0f0a, 0x2a1810, 0x3e2616, 0x54351e, 0x6c4a2c, 0x84603a], [0x2a2a14, 0x3a4018, 0x4e5a20, 0x627030],
    (u, v) => (hsh(Math.floor(u / 5), Math.floor(v / 5), 9) < 0.07 && Math.hypot(u, v) < 90 ? ramp([0x2a0c08, 0x4a1810, 0x6a2418], 0.5, Math.floor(u), Math.floor(v)) : undefined));
  s.litter(R + 8, 50, ["bone", "pebble", "straw", "bone"], 23);
  // stake line: leaning sharpened stakes, with a gap for the way in, plus crossed stakes at the gap
  const st = { h: 44, r: 2.4, step: 6.2, seed: 7, jag: 0.4, lean: [0.22, 0.22] as [number, number], pal: OLDR, rails: [14] };
  s.row([-R, -R], [-R, R * 0.7], { ...st, lean: [0.28, 0], seed: 1 });
  s.row([-R, -R], [R * 0.7, -R], { ...st, lean: [0, 0.28], seed: 2 });
  s.row([R, -R], [R, -20], { ...st, lean: [-0.28, 0], seed: 3 });
  s.row([-R * 0.5, R], [R * 0.35, R], { ...st, lean: [0, -0.28], seed: 4 });
  for (const [u, v] of [[R - 6, 6], [R - 6, 40], [R - 8, 70]] as const) {
    s.rod([u - 8, v - 8, 0], [u + 8, v + 8, 36], 1.4, wood(OLDR, 0, 30)); s.rod([u + 8, v - 8, 0], [u - 8, v + 8, 36], 1.4, wood(OLDR, 0, 30));
    s.rod([u, v - 9, 16], [u, v + 9, 16], 1, wood(OLDR, 0.05, 10));
  }
  // crude lookout tower: lashed poles, a ragged deck, a rag banner
  const TU = -R + 20, TV = -R + 32, D = 38, A = 15, B = 9;
  for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s.rod([TU + su * A, TV + sv * A, 0], [TU + su * B + su * 1.2, TV + sv * B, D * 3], 2, wood(OLDR, -0.05, 60));
  for (const z of [30, 62, 94]) { const a = A + (B - A) * z / (D * 3); for (const [p, q] of [[[-1, 1], [1, 1]], [[1, 1], [1, -1]], [[-1, -1], [1, -1]], [[-1, -1], [-1, 1]]]) s.rod([TU + p[0] * a, TV + p[1] * a, z], [TU + q[0] * a, TV + q[1] * a, z + (hsh(z, p[0] + 3, 1) - 0.5) * 4], 1, mat(ROPER)); }
  for (let i = 0; i < 5; i++) s.rod([TU - A, TV + A + 4, 8 + i * 22], [TU + A * 0.5, TV + A + 4, 8 + i * 22], 0.8, wood(WOODR, 0.1, 8));
  const DZ = D * 3;
  for (let i = 0; i < 8; i++) { const o = -B - 2 + i * 3.4; s.rod([TU + o, TV - B - 3, DZ], [TU + o, TV + B + 3, DZ + (hsh(i, 5, 2) - 0.5) * 2], 1.7, wood(i % 3 ? WOODR : OLDR, 0, 14)); }
  for (const [pu, pv] of [[-B - 2, -B - 2], [B + 2, -B - 2], [-B - 2, B + 2], [B + 2, B + 2]]) s.post(TU + pu, TV + pv, DZ + 26, 1.2, wood(OLDR, 0, 18), true);
  s.rod([TU - B - 2, TV + B + 2, DZ + 12], [TU + B + 2, TV + B + 2, DZ + 12], 0.7, wood(OLDR, 0.05, 10));
  s.rod([TU + B + 2, TV - B - 2, DZ + 12], [TU + B + 2, TV + B + 2, DZ + 12], 0.7, wood(OLDR, 0.05, 10));
  s.q.sheet((a, b) => [TU - B - 4 + a * (2 * B + 8), TV - B - 4 + b * (2 * B + 8), DZ + 24 + Math.sin(a * 6 + b * 4) * 1.4 - a * 3], 24, 24, (l, a, b, x, y) => ramp(hide, l * 0.9 - 0.15 + (hsh(x, y, 2) - 0.5) * 0.15, x, y));
  s.banner(TU + B + 2, TV + B + 2, DZ + 28, "redfang", 16, 30, 1);
  s.shadowAt(TU, TV, 24, 0.4);
  // hide tents with painted fangs, one big war-chief tent with a skull crown
  s.cone(-34, 10, 30, 62, red, 1); s.cone(-70, -40, 24, 50, hide, 2); s.cone(-14, -64, 26, 54, red, 3); s.cone(40, -56, 22, 46, hide, 4);
  s.cone(-64, 62, 22, 44, hide, 5);
  s.skull(-34, 10, 74, 5, true);
  // cook fire in the open middle, weapon racks, loot crates
  s.cookfire(38, 24);
  s.rack(70, -12, 1, 6); s.rack(-6, 60, 0, 5);
  s.crate(78, 40, 7, 12); s.crate(90, 50, 6, 9); s.barrel(80, 60, 5, 10); s.crate(-96, 20, 7, 11);
  // skull totems on lashed poles at the entrance and the corners
  const tot = (u: number, v: number, h: number) => {
    s.post(u, v, h, 2.2, wood(OLDR, 0, 40), false);
    s.rod([u - 8, v + 8, h - 16], [u + 8, v - 8, h - 16], 1, wood(OLDR, 0.05, 10));
    s.skull(u, v, h + 3, 4.6, true); s.skull(u - 6, v + 6, h - 16, 3.2); s.skull(u + 6, v - 6, h - 16, 3.2); s.skull(u, v, h - 30, 3.6);
    s.q.shadow(u, v, 5, 0.3);
  };
  tot(R + 12, -20, 100); tot(R + 12, 100, 92); tot(-R + 10, R - 10, 84);
  s.brazier(R + 4, 24, 20); s.brazier(R + 4, 80, 20);
  s.banner(R - 18, 52, 104, "redfang", 22, 44, 1);
}

// ---- Ossuary Host: bone-and-stone keep ---------------------------------------------------------------------
function host(s: Scene) {
  const R = 136;
  s.light(-50, -50, 80, 0x4fc9a0, 0.5); s.light(R, 40, 56, 0x4fc9a0, 0.45);
  s.floor(R + 24, [0x0e1110, 0x1a1f1e, 0x262d2c, 0x343e3c, 0x465250, 0x5a6866], [0x1a2018, 0x242c20, 0x303a2a, 0x3c4834],
    (u, v) => (Math.abs(((u + 300) % 22) - 11) < 0.6 || Math.abs(((v + 300) % 22) - 11) < 0.6) && Math.hypot(u, v) < 100 ? ramp(GREYB, 0.18 + hsh(Math.floor(u / 22), Math.floor(v / 22), 4) * 0.2, Math.floor(u), Math.floor(v)) : undefined);
  s.litter(R + 8, 60, ["bone", "pebble", "bone", "tuft"], 31);
  // bone palisade: tall pale stakes with skull caps, in rows with ribs
  const bone = (h: number, seed: number, skip?: [number, number][]) => ({ h, r: 2.6, step: 5.6, jag: 0.35, seed, skip, mat: mat(BONER, 0.05) as Mat, rails: [] as number[] });
  s.row([-R, -R], [-R, R], bone(58, 1)); s.row([-R, -R], [R, -R], bone(58, 2));
  s.row([R, -R], [R, R], bone(54, 3, [[0.34, 0.66]])); s.row([-R, R], [R * 0.2, R], bone(46, 4));
  for (let i = 0; i < 14; i++) { const u = -R + 12 + i * 18, v = -R; s.skull(u, v, 60 + hsh(i, 4, 1) * 8, 3.6, i % 4 === 0); }
  for (let i = 0; i < 9; i++) { const v = -R + 14 + i * 28; s.skull(-R, v, 58 + hsh(i, 5, 1) * 8, 3.6, i % 3 === 0); }
  // ribbed gate: a great arch of two curved rib bones
  const gv0 = -R * 0.32, gv1 = R * 0.32;
  for (const v of [gv0, gv1]) { s.post(R, v, 96, 5, mat(BONER, 0), false); s.skull(R, v, 100, 6, true); s.q.blob([R, v, 4], 8, 8, 5, rough(GREYB, 0.1)); }
  for (let i = 0; i < 16; i++) { const t = i / 15, a = t * Math.PI; s.q.blob([R, (gv0 + gv1) / 2 + Math.cos(a) * (gv1 - gv0) / 2, 92 + Math.sin(a) * 20], 2.6, 2.6, 2.6, mat(BONER, 0.05)); }
  s.brazier(R + 14, gv0 - 12, 26, GHOST, 0x4fc9a0); s.brazier(R + 14, gv1 + 12, 26, GHOST, 0x4fc9a0);
  // the crooked keep: a leaning round stone tower with a broken crown, teal-lit windows, a lower broken wall run
  const lean: [number, number] = [0.22, 0.12], TH = 190;
  const rad = (t: number) => 34 - t * 9 + (t < 0.08 ? 4 : 0) + (t > 0.9 ? 5 : 0);
  const tm = (l: number, sx: number, t: number, x: number, y: number) => {
    const row = Math.floor(t * TH / 8), col = Math.floor(sx * 26 + (row % 2) * 0.5), fy = (t * TH / 8) % 1, fx = (sx * 26 + (row % 2) * 0.5) % 1;
    const win = [0.3, 0.55, 0.78].some((tt) => Math.abs(t - tt) < 0.035) && Math.abs(((sx * 5 + t * 0.7) % 1) - 0.5) < 0.09 && sx > 0.1 && sx < 0.45;
    if (win) return ramp(GHOST, 0.55 + hsh(col, row, 3) * 0.35, x, y);
    return ramp(GREYB, l + (hsh(col, row, 8) - 0.5) * 0.3 + (hsh(x, y, 4) - 0.5) * 0.1 - (fy < 0.12 || fx < 0.07 ? 0.28 : 0) - (hsh(col, row, 6) < 0.05 ? 0.3 : 0), x, y);
  };
  void tm;
  const TU = -52, TV = -46;
  s.lathe(TU, TV, 0, TH, rad, (l, sx, t, x, y) => {
    const row = Math.floor(t * TH / 8), col = Math.floor(sx * 26 + (row % 2) * 0.5), fy = (t * TH / 8) % 1, fx = (sx * 26 + (row % 2) * 0.5) % 1;
    const win = [0.3, 0.52, 0.74].some((tt) => Math.abs(t - tt) < 0.03) && Math.abs(sx - 0.14) < 0.022;
    if (win) return ramp(GHOST, 0.55 + hsh(col, row, 3) * 0.4, x, y);
    return ramp(GREYB, l + (hsh(col, row, 8) - 0.5) * 0.3 + (hsh(x, y, 4) - 0.5) * 0.1 - (fy < 0.12 || fx < 0.07 ? 0.28 : 0) - (hsh(col, row, 6) < 0.05 ? 0.3 : 0), x, y);
  }, lean, 0.01);
  // a broken battlement: only some merlons left
  for (let i = 0; i < 12; i++) {
    if (hsh(i, 2, 77) < 0.35) continue;
    const a = (i / 12) * 6.283, r = rad(1) - 2, z = TH, bu = TU + lean[0] * z + Math.cos(a) * r, bv = TV + lean[1] * z + Math.sin(a) * r;
    s.box(bu - 4, bu + 4, bv - 4, bv + 4, z - 2, z + 8 + hsh(i, 9, 2) * 8, blocks(GREYB, 8, 10, 5, 6));
  }
  s.disc(TU, TV, TH - 6, 26, rough(GREYB, -0.1), lean);
  s.flame(TU + lean[0] * TH, TV + lean[1] * TH, TH - 2, 6, 20, GHOST);
  s.light(TU, TV, 90, 0x4fc9a0, 0.4);
  s.shadowAt(TU + 30, TV + 24, 44, 0.45);
  // buttressing bone ribs against the tower
  for (let i = 0; i < 5; i++) { const a = 0.4 + i * 0.35; s.rod([TU + Math.cos(a) * 46, TV + Math.sin(a) * 46, 0], [TU + Math.cos(a) * 28 + lean[0] * 70, TV + Math.sin(a) * 28 + lean[1] * 70, 78], 3, mat(BONER, 0)); }
  // broken stone wall pieces and a ruined shed
  s.wall([-R + 6, 40], [-R + 6, 112], 34, 5, GREYB, true, [[0.35, 0.5]]);
  s.wall([-100, R - 6], [-20, R - 6], 22, 5, GREYB, false, [[0.5, 0.7]]);
  s.box(30, 78, -90, -50, 0, 22, blocks(GREYB, 48, 22, 7, 12)); s.box(34, 74, -86, -54, 22, 25, rough(GREYB, -0.1));
  s.box(30, 52, -90, -72, 22, 36, blocks(GREYB, 20, 14, 7, 10));
  // spikes with skulls on the ground, grave markers, bone piles
  for (const [u, v, h] of [[40, 30, 46], [62, 6, 38], [54, 62, 42], [18, 86, 40], [-30, 70, 36], [90, -10, 40]] as const) {
    s.rod([u, v, 0], [u, v, h], 1.2, mat(IRONR, 0)); s.skull(u, v, h + 3, 3.8); s.q.shadow(u, v, 3, 0.3);
  }
  for (const [u, v] of [[-8, 36], [10, 54], [-22, 18], [96, 60], [70, 90]] as const) {
    s.box(u - 4, u + 4, v - 2, v + 2, 0, 18, rough(GREYB, 0.05)); s.box(u - 5, u + 5, v - 2.5, v + 2.5, 18, 20, rough(GREYB, 0.1));
    s.q.blob([u + 8, v + 8, 0], 8, 6, 3, mat(BONER, -0.1), 0, 0.6);
  }
  s.banner(R - 24, gv0 - 50, 108, "host", 20, 46, 1);
  s.banner(R - 24, gv1 + 50, 108, "host", 20, 46, 1);
  for (let i = 0; i < 7; i++) s.skull(-30 + i * 9, 100 + (i % 2) * 6, 4, 3.4);
}

// ---- Hide-Kin: earthworks and burrow ------------------------------------------------------------------------
function hidekin(s: Scene) {
  const R = 136, hide = HIDE;
  // trenches (ground carved) in a broken ring, one along each front side
  const tr: [number, number, number, number][] = [[-96, 96, 66, 78], [90, 102, -80, 40], [-110, -98, -90, 30]]; // u0,u1,v0,v1
  const inTr = (u: number, v: number) => tr.some(([a, b, c, d]) => u > a && u < b && v > c && v < d);
  s.holes = [inTr];
  s.light(10, 10, 60, 0xff8a30, 0.25);
  s.floor(R + 24, [0x16100a, 0x241a10, 0x382816, 0x4e3a20, 0x645030, 0x7c6640], [0x24280e, 0x343c14, 0x485220, 0x5c6a2c],
    (u, v) => (Math.hypot(u + 40, v + 20) < 66 ? ramp(SOIL, 0.3 + hsh(Math.floor(u / 3), Math.floor(v / 3), 3) * 0.3, Math.floor(u), Math.floor(v)) : undefined));
  s.litter(R + 8, 50, ["bone", "pebble", "tuft", "pebble"], 41, inTr);
  // trench floors and walls, berms of heaped earth on the near lips
  for (const [a, b, c, d] of tr) {
    s.q.surf((ss, t) => [[a + (b - a) * ss, c + (d - c) * t, -9], [0, 0, 1]], Math.ceil((b - a) * 2), Math.ceil((d - c) * 2), (l, ss, t, x, y) => ramp([0x0a0705, 0x140d08, 0x201610], 0.4 + (hsh(x, y, 1) - 0.5) * 0.4, x, y));
    s.q.surf((ss, t) => [[a + (b - a) * ss, c, -9 + t * 9], [0, 1, 0]], Math.ceil((b - a) * 2), 24, rough(SOIL, 0.05, 0.3));
    s.q.surf((ss, t) => [[a, c + (d - c) * ss, -9 + t * 9], [1, 0, 0]], Math.ceil((d - c) * 2), 24, rough(SOIL, 0.1, 0.3));
    // sharpened stakes at the bottom
    for (let i = 0; i < Math.floor((b - a) / 14); i++) s.rod([a + 7 + i * 14, (c + d) / 2, -9], [a + 7 + i * 14, (c + d) / 2, 0], 0.9, wood(OLDR, 0, 8));
    for (let i = 0; i < Math.floor((b - a) / 9); i++) { const u = a + 3 + i * 9 + hsh(i, c, 1) * 4; s.q.blob([u, d + 4, 0], 6, 4, 4 + hsh(i, c, 2) * 3, rough(SOIL, 0.1, 0.3), 0.45, 1); }
  }
  // burrow mound with a tunnel mouth facing the viewer
  const MU = -40, MV = -20, MR = 76, MH = 70;
  s.q.sheet((ss, t) => {
    const a = ss * Math.PI * 2, r = MR * t, h = MH * Math.pow(Math.max(0, 1 - t * t), 0.8) * (1 + (hsh(Math.floor(a * 6), Math.floor(t * 8), 3) - 0.5) * 0.12);
    return [MU + Math.cos(a) * r * 1.05, MV + Math.sin(a) * r, h];
  }, 520, 140, (l, ss, t, x, y) => {
    const a = ss * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    const mouth = c > 0.55 && sn > 0.45 && t > 0.3 && t < 0.88 && Math.abs(a - 0.78) < 0.2 - (0.88 - t) * 0.12 && false;
    void mouth;
    const grass = t < 0.35 && hsh(Math.floor(a * 9), Math.floor(t * 12), 1) < 0.3;
    if (t > 0.9) return ramp([0x1a2610, 0x2a3a18, 0x3a4c20], 0.3 + (t - 0.9) * 3, x, y);
    return ramp(grass ? [0x2a3a14, 0x44581e, 0x62802c] : [0x1a1009, 0x2e2014, 0x46321f, 0x5e4630, 0x78603f], l * 1.1 + 0.02 + (hsh(x >> 1, y >> 1, 3) - 0.5) * 0.3 - (hsh(x, y, 5) < 0.06 ? 0.2 : 0), x, y);
  });
  // the tunnel mouth: a timber-framed black opening on the +u/+v face, with a spoil apron
  const mu = MU + Math.cos(0.8) * MR * 0.8 * 1.05, mv = MV + Math.sin(0.8) * MR * 0.8;
  const dark: Mat = (l, ss, t, x, y) => ramp([0x020101, 0x080504, 0x120b07], t * 0.9, x, y);
  s.box(mu - 4, mu + 9, mv - 17, mv + 17, 0, 34, dark, 6);
  s.box(mu + 8, mu + 12, mv - 17, mv + 17, 0, 1.2, rough(SOIL, 0.2, 0.3), 1);
  for (const v of [mv - 19, mv + 19]) s.rod([mu + 9.5, v, 0], [mu + 9.5, v, 38], 2.6, wood(WOODR, 0.05, 30));
  s.rod([mu + 9.5, mv - 20, 36], [mu + 9.5, mv + 20, 36], 2.8, wood(WOODR, 0.1, 20));
  s.rod([mu + 9.5, mv - 17, 33], [mu + 9.5, mv - 9, 36], 1.6, wood(OLDR, 0.05, 20)); s.rod([mu + 9.5, mv + 17, 33], [mu + 9.5, mv + 9, 36], 1.6, wood(OLDR, 0.05, 20));
  for (const v of [mv - 16, mv + 16]) { s.q.blob([mu + 8, v, 38], 3, 3, 4, mat(BONER, 0), 0.4, 1); }
  s.skull(mu + 10, mv, 44, 5, true);
  s.q.shadow(mu + 8, mv, 26, 0.25);
  // root-and-log barricades: criss-crossed logs and roots on the east and south edges
  const barr = (u0: number, v0: number, u1: number, v1: number, seed: number) => {
    const n = Math.floor(Math.hypot(u1 - u0, v1 - v0) / 10);
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = u0 + (u1 - u0) * t, v = v0 + (v1 - v0) * t;
      s.rod([u - 8, v - 6, 0], [u + 8, v + 6, 22 + hsh(i, seed, 1) * 8], 2.6, wood(i % 2 ? WOODR : OLDR, 0, 20));
      s.rod([u + 8, v - 6, 0], [u - 8, v + 6, 20 + hsh(i, seed, 2) * 8], 2.4, wood(i % 2 ? OLDR : WOODR, 0, 20));
    }
    for (let i = 0; i < n; i++) s.rod([u0 + (u1 - u0) * i / n, v0 + (v1 - v0) * i / n, 10], [u0 + (u1 - u0) * (i + 1) / n + 2, v0 + (v1 - v0) * (i + 1) / n, 11], 1.1, mat([0x1e1408, 0x34220e, 0x4a3414]));
  };
  barr(R - 2, -R + 20, R - 2, -30, 1); barr(R - 2, 36, R - 2, R - 10, 2); barr(-R + 30, R - 4, 30, R - 4, 3); barr(-R + 4, -R + 30, -R + 4, 10, 4);
  // totems: carved posts with tusks, hide banners and a horned beast skull
  const tot = (u: number, v: number, h: number) => {
    s.post(u, v, h, 3.8, wood(WOODR, -0.05, 40), false);
    for (const [dz, w] of [[0.3, 7], [0.55, 6], [0.8, 5]]) { s.q.blob([u + 2, v + 2, h * dz], w * 0.55, w * 0.55, 4, mat(HIDE, -0.1), 0, 1); s.rod([u - w * 0.5, v + w * 0.5, h * dz - 2], [u - w * 1.4, v + w * 1.4, h * dz + 6], 1.2, mat(BONER, 0.05)); s.rod([u + w * 0.5, v - w * 0.5, h * dz - 2], [u + w * 1.4, v - w * 1.4, h * dz + 6], 1.2, mat(BONER, 0.05)); }
    s.skull(u, v, h + 4, 6, true);
    s.q.shadow(u, v, 6, 0.3);
  };
  tot(R - 14, 10, 96); tot(-R + 20, R - 24, 84); tot(30, -R + 20, 92);
  // hide windbreaks (lean-tos) and fires, burrow holes with spoil heaps
  s.tent(-30, 104, 20, 14, 28, cr(CLANS.hidekin.cloth), cr(CLANS.hidekin.trim), 0);
  s.tent(70, -40, 18, 13, 26, cr(CLANS.hidekin.cloth), undefined, 1);
  s.cone(-84, 56, 20, 36, hide, 7);
  for (const [u, v] of [[20, 20], [-90, -60], [60, 100], [100, 20]] as const) {
    s.q.blob([u, v, 0], 9, 7, 5, rough(SOIL, 0.1, 0.3), 0.45, 1);
    s.q.surf((ss, t) => { const a = ss * Math.PI * 2; return [[u + Math.cos(a) * 5 * t + 2, v + Math.sin(a) * 4 * t + 2, 4.6], [0, 0, 1]]; }, 12, 4, mat([0x030201, 0x0a0705]));
  }
  s.cookfire(84, 78); s.brazier(R - 6, 60, 20);
  s.banner(R - 30, -40, 90, "hidekin", 22, 42, 1);
  s.crate(-100, 20, 6, 10); s.barrel(-110, 34, 5, 10);
}

// ---- Veiled Circle: walled shrine camp ---------------------------------------------------------------------
function veiled(s: Scene) {
  const R = 136, clan = CLANS.veiled, indigo = cr(clan.cloth).map((c, i) => (i > 2 ? mixc(c, 0x6a6ad0, 0.25) : c));
  s.light(0, -30, 70, 0xa890ff, 0.4); s.light(R - 10, 60, 50, 0xf6d26b, 0.35);
  s.floor(R + 24, [0x4a3a24, 0x6a5232, 0x8a6e44, 0xa8885a, 0xc4a672, 0xdcc48c], [0x6a5a32, 0x84743c, 0x9c8a4a, 0xb0a058],
    (u, v) => (Math.hypot(u, v - 0) < 60 ? ramp([0x4a3a28, 0x6a5238, 0x8a6e48, 0xa88a5a], 0.35 + ((Math.floor(u / 12) + Math.floor(v / 12)) % 2) * 0.2, Math.floor(u), Math.floor(v)) : undefined));
  s.litter(R + 8, 40, ["pebble", "pebble", "tuft"], 51);
  // sandstone walls: back sides full with crenels, the front sides broken with a gate arch
  s.wall([-R, -R], [-R, R], 44, 8, SAND, true); s.wall([-R, -R], [R, -R], 44, 8, SAND, true);
  s.wall([R, -R], [R, R], 36, 7, SAND, true, [[0.36, 0.66]]);
  s.wall([-R, R], [R * 0.1, R], 30, 7, SAND, true, [[0.55, 0.8]]);
  // corner turrets with domes
  for (const [u, v] of [[-R, -R], [R, -R], [-R, R]] as const) {
    s.lathe(u, v, 0, 60, () => 16, blocks(SAND, 100, 60, 8, 12), [0, 0], 0);
    s.q.blob([u, v, 60], 17, 17, 18, (l, ss, t, x, y) => ramp(indigo, l * 1.05 + (t > 0.95 ? 0.15 : 0), x, y), 0.5, 1);
    s.rod([u, v, 76], [u, v, 90], 0.9, mat(GOLDR)); s.q.blob([u, v, 92], 2.4, 2.4, 3, mat(GOLDR, 0.1));
  }
  // the gate: two pillars with a pointed arch, gold trim, hanging silk
  const gv0 = -R * 0.18, gv1 = R * 0.3, gm = (gv0 + gv1) / 2;
  for (const v of [gv0, gv1]) { s.box(R - 8, R + 8, v - 8, v + 8, 0, 78, blocks(SAND, 16, 78, 8, 12, 0.05)); s.box(R - 10, R + 10, v - 10, v + 10, 78, 86, rough(SAND, 0.1)); s.q.blob([R, v, 86], 7, 7, 14, mat(indigo), 0.5, 1); s.rod([R, v, 98], [R, v, 108], 0.8, mat(GOLDR)); }
  for (let i = 0; i <= 24; i++) { const t = i / 24, v = gv0 + (gv1 - gv0) * t, z = 78 + Math.sin(t * Math.PI) ** 0.7 * 26; s.q.blob([R, v, z], 5, 5, 4.2, blocks(SAND, 10, 10, 5, 6, 0.08), 0.1, 0.9); s.q.blob([R + 4, v, z + 0.5], 1.8, 1.8, 2, mat(GOLDR)); }
  s.q.sheet((ss, t) => [R + 6, gv0 + 6 + ss * (gv1 - gv0 - 12), 84 - t * 30 + Math.sin(ss * 12) * 0.8 * t], 30, 14, cloth(indigo, cr(clan.trim), 7, -0.05));
  s.brazier(R + 18, gv0 - 14, 24, ARCANE, 0xa890ff); s.brazier(R + 18, gv1 + 14, 24, ARCANE, 0xa890ff);
  // the shrine: a stepped sandstone base, a drum and a gilded dome, a lit doorway
  const SU = -34, SV = -34;
  s.box(SU - 44, SU + 44, SV - 44, SV + 44, 0, 8, blocks(SAND, 88, 8, 8, 14)); s.box(SU - 36, SU + 36, SV - 36, SV + 36, 8, 16, blocks(SAND, 72, 8, 8, 14, 0.05));
  s.lathe(SU, SV, 16, 74, (t) => 26 + (t < 0.06 ? 3 : 0) + (t > 0.94 ? 3 : 0), (l, ss, t, x, y) => {
    const door = Math.abs(ss - 0.125) < 0.05 && t < 0.52;
    if (door) return ramp([0x2a1a5a, 0x5a40b0, 0xa890ff, 0xe8e0ff], 0.5 + t * 0.9 + hsh(x, y, 1) * 0.2, x, y);
    const win = [0.18, 0.4].some((a) => Math.abs(ss - a) < 0.014) && t > 0.6 && t < 0.86;
    if (win) return ramp(GOLDR, 0.7 + hsh(x, y, 2) * 0.3, x, y);
    return ramp(SAND, l + (hsh(Math.floor(ss * 36), Math.floor(t * 8), 3) - 0.5) * 0.25 - ((t * 58) % 8 < 1 ? 0.2 : 0) + (hsh(x, y, 4) - 0.5) * 0.1, x, y);
  });
  s.q.blob([SU, SV, 74], 30, 30, 38, (l, ss, t, x, y) => ramp(indigo, l * 1.1 + (Math.floor(ss * 16) % 2 ? 0.04 : -0.04) + (t > 0.5 && ((t * 11) % 1) < 0.1 ? 0.12 : 0), x, y), 0.5, 1);
  s.rod([SU, SV, 108], [SU, SV, 132], 1, mat(GOLDR)); s.q.blob([SU, SV, 118], 3.4, 3.4, 3.4, mat(GOLDR, 0.1)); s.q.blob([SU, SV, 134], 2.8, 2.8, 4, mat(GOLDR, 0.2));
  for (const [du, dv] of [[-30, -30], [30, -30], [-30, 30], [30, 30]]) { s.rod([SU + du, SV + dv, 16], [SU + du, SV + dv, 50], 1.8, mat(SAND, 0.05)); s.q.blob([SU + du, SV + dv, 50], 2.2, 2.2, 6, mat(GOLDR, 0), 0.4, 1); }
  s.light(SU + 24, SV + 24, 40, 0xa890ff, 0.5);
  s.shadowAt(SU + 10, SV + 10, 50, 0.4);
  // silk awnings on poles, with cushions and a low table
  const awning = (cu: number, cv: number, w: number, d: number, h: number, seed: number) => {
    for (const [a, b] of [[-w, -d], [w, -d], [-w, d], [w, d]]) s.rod([cu + a, cv + b, 0], [cu + a, cv + b, h + (a > 0 ? 0 : 8)], 1.1, wood(WOODR, 0.05, 20));
    s.q.sheet((ss, t) => [cu - w - 3 + ss * (2 * w + 6), cv - d - 3 + t * (2 * d + 6), h + 8 - ss * 8 + Math.sin(ss * 8 + t * 5 + seed) * 1.6], 36, 30, cloth(indigo, cr(clan.trim), 8, 0.02));
    s.q.shadow(cu, cv, w * 0.9, 0.3);
    for (let i = 0; i < 3; i++) s.q.blob([cu - w * 0.5 + i * w * 0.5, cv + d * 0.2, 3.4], 5, 4, 3, mat(cr(i % 2 ? clan.trim : 0x8a3a5a)), 0, 1);
  };
  awning(52, -64, 24, 16, 38, 1); awning(-76, 52, 22, 15, 34, 2); awning(66, 58, 18, 13, 32, 3);
  // standing stones with glowing runes in a half ring, the shrine well between
  s.stone(8, 52, 9, 62, GREYB, ARCANE, 1); s.stone(-30, 74, 8, 52, GREYB, ARCANE, 2); s.stone(-70, 38, 7.5, 58, GREYB, ARCANE, 3);
  s.stone(100, -28, 8, 54, GREYB, [0x9a6a10, 0xd9a030, 0xf6d26b], 4); s.stone(86, 86, 7, 46, GREYB, [0x9a6a10, 0xd9a030, 0xf6d26b], 5);
  s.q.blob([20, 8, 2], 14, 14, 5, blocks(SAND, 60, 14, 6, 10), 0, 0.5); s.q.blob([20, 8, 5], 10, 10, 1, (l, ss, t, x, y) => ramp(ARCANE, 0.5 + hsh(x, y, 2) * 0.4, x, y), 0.6, 1);
  s.light(20, 8, 40, 0xa890ff, 0.45);
  s.banner(R - 26, gv0 - 46, 112, "veiled", 22, 48, 1); s.banner(R - 26, gv1 + 46, 112, "veiled", 22, 48, 1);
  s.crate(-104, -4, 6, 11); s.barrel(-100, 14, 5, 10);
}

const PAINT: Record<ClanKey, (s: Scene) => void> = { wardens, redfang, host, hidekin, veiled };

/** Painted Hold as two RGBA layers (art-time only: tools/art/holds.ts bakes them to PNG, the client loads those) (ground and standing), HOLD_W x HOLD_H each, standing layer with its outline. */
export function paintHoldLayers(k: ClanKey): { ground: Uint8ClampedArray; stand: Uint8ClampedArray } {
  const make = () => { const buf = new Uint32Array(HOLD_W * HOLD_H); return { buf, pen: bufPen(buf) }; };
  const g = make(), q = make();
  const s = new Scene(g.pen, q.pen);
  PAINT[k](s);
  // outline the standing layer
  const { buf } = q, solid = (x: number, y: number) => x >= 0 && y >= 0 && x < HOLD_W && y < HOLD_H && buf[y * HOLD_W + x] >>> 24 > 140;
  const ol = new Uint32Array(buf);
  for (let y = 0; y < HOLD_H; y++) for (let x = 0; x < HOLD_W; x++) {
    if (solid(x, y) || (buf[y * HOLD_W + x] >>> 24) > 0) continue;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) ol[y * HOLD_W + x] = (0xe0 << 24 | OUTLINE) >>> 0;
  }
  const toRGBA = (b: Uint32Array) => {
    const out = new Uint8ClampedArray(b.length * 4);
    for (let i = 0; i < b.length; i++) { const v = b[i]; out[i * 4] = (v >> 16) & 255; out[i * 4 + 1] = (v >> 8) & 255; out[i * 4 + 2] = v & 255; out[i * 4 + 3] = v >>> 24; }
    return out;
  };
  return { ground: toRGBA(g.buf), stand: toRGBA(ol) };
}

function bufPen(buf: Uint32Array): Pen {
  const px = (x: number, y: number, c: number, a = 1) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= HOLD_W || y >= HOLD_H) return;
    const i = y * HOLD_W + x;
    if (a >= 1) { buf[i] = (0xff000000 | c) >>> 0; return; }
    const o = buf[i], oa = o >>> 24;
    if (!oa) { buf[i] = ((Math.round(a * 255) << 24) | c) >>> 0; return; }
    buf[i] = ((0xff << 24) | mixc(o & 0xffffff, c, a)) >>> 0;
  };
  return { px } as Pen;
}
void hex;
