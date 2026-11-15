import { CLANS, type ClanKey } from "../../shared/war/clans";
import type { FortCell, FortKind, HoldFort } from "../../shared/war/holdWalls";
import { dith, hsh, IsoPaint, mat, ramp, type Mat, type V3 } from "./isoPaint";
import { BONER, BRASSR, IRONR, OLDR, ROPER, STONER, STRAWR, WOODR, wood } from "./isoProps";
import type { Pen } from "./worldProps";

/**
 * The clan war Holds as true isometric forts (Murat 2026-11-14: "full isometric style, or even like an encampment";
 * 2026-11-15: "the encampments all look similar in size and shape and my hero can walk through their walls").
 *
 * A Hold is no longer one baked picture. shared/war/holdWalls.ts says what each cell of a clan's fort is (wall, tower,
 * tent, fence, mound, gate, gap, court) and the server makes the wall cells solid, so the art is built from the same
 * cells: `fortLayout(fort)` turns them into pieces, one per cell (a tower or mound that spans several cells is one
 * piece), and `paintPiece` draws each piece once per look with the depth-buffered iso painter (isoPaint.ts: lit and
 * shaded faces, like the bonfire). Walls pick their shape from which neighbours they join (a 4-bit mask, plus diagonals
 * for stair-stepped walls), so a wall is straight, a corner, a T or an end. The pieces are baked at art time into one atlas per clan
 * (tools/art/holds.ts, `npm run art`) and the client only loads it (holdAssets.ts), puts one image on every cell, sorted by depth with heroes, and lays the trampled ground of the
 * whole compound under them as one image (`paintGround` tiles, `groundPlan`).
 *
 * Every piece is painted a little past its cell and then clipped to the cell by the model point each pixel shows, so
 * neighbours meet without a seam and the outline only rings the real silhouette. Units are texels, 1.5 per world px
 * (a tile is 48 units); a piece's origin is the middle of its cell on the ground, u runs east (+x), v south (+y).
 * The walls ARE solid (server and client prediction, shared/war/holdWalls.ts): what is drawn as a wall blocks, gate
 * cells and gaps are open. Art is still cosmetic: nothing here changes what the server sees. Seeded hashes only.
 */
const T = 48, HALF = 24, PAD = 4, E = HALF + PAD;
/** Corner-only joins reach this far into the diagonal neighbour's corner, so a stair-stepped wall does not pinch to a point. */
const DG = HALF + 8;
const OUTLINE = 0x15100d;
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


/** The painter every piece is drawn through: helpers for posts, tents, banners and so on over one IsoPaint. */
class Scene {
  glows: { u: number; v: number; r: number; col: number; a: number }[] = [];
  constructor(public q: IsoPaint) {}
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

// ---- Wardens: timber watchtower ----------------------------------------------------------------------------
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

// ---- pieces ----------------------------------------------------------------------------------------------------
export type PieceKind = "wall" | "fence" | "tower" | "tent" | "mound" | "gate" | "rubble" | "pit";
/** Which neighbours a wall or fence joins (an arm to that cell's edge): +u (east), -u, +v (south), -v; and corner-only joins. */
export const J = { E: 1, W: 2, S: 4, N: 8, SE: 16, NE: 32, SW: 64, NW: 128 } as const;
/** One look of one piece. Unused fields stay 0 so equal looks share one texture. */
export interface PieceSpec {
  clan: ClanKey; kind: PieceKind;
  /** wall / fence: joined neighbours (J bits). */
  mask: number;
  /** Look variant 0..2 (log heights, tent colour, rubble). */
  v: number;
  /** Cluster size in cells (tower, mound); 1x1 for the rest. */
  cw: number; ch: number;
  /** gate: 0 = posts at -v and +v (the way runs along u), 1 = posts at -u and +u. `part` 0 = back post and lintel, 1 = front post. */
  axis: 0 | 1; part: 0 | 1;
  /** wall or fence beside a gap: a broken stub. */
  broken: boolean;
}
export const pieceKey = (s: PieceSpec) => `hp_${s.clan}_${s.kind}_${s.mask}_${s.v}_${s.cw}x${s.ch}_${s.axis}${s.part}${s.broken ? 1 : 0}`;

const armsOf = (mask: number) => ({ e: !!(mask & J.E), w: !!(mask & J.W), s: !!(mask & J.S), n: !!(mask & J.N) });
/** Calls `f` for the boxes of a wall of half-thickness `th`: the middle, an arm to every joined side, a corner block to every corner-only join. */
function armBoxes(mask: number, th: number, f: (u0: number, u1: number, v0: number, v1: number) => void) {
  f(-th, th, -th, th);
  if (mask & J.E) f(0, E, -th, th);
  if (mask & J.W) f(-E, 0, -th, th);
  if (mask & J.S) f(-th, th, 0, E);
  if (mask & J.N) f(-th, th, -E, 0);
  if (mask & J.SE) f(10, DG, 10, DG);
  if (mask & J.NE) f(10, DG, -DG, -10);
  if (mask & J.SW) f(-DG, -10, 10, DG);
  if (mask & J.NW) f(-DG, -10, -DG, -10);
}
/** Unit directions of the arms of a mask. */
function armDirs(mask: number): [number, number][] {
  const d: [number, number][] = [];
  if (mask & J.E) d.push([1, 0]); if (mask & J.W) d.push([-1, 0]); if (mask & J.S) d.push([0, 1]); if (mask & J.N) d.push([0, -1]);
  if (mask & J.SE) d.push([1, 1]); if (mask & J.NE) d.push([1, -1]); if (mask & J.SW) d.push([-1, 1]); if (mask & J.NW) d.push([-1, -1]);
  return d;
}
const BANKR = [0x120c06, 0x22160c, 0x362416, 0x4c3622, 0x62492e, 0x7c5e3c];
const MOSS = [0x1a2410, 0x2a3a18, 0x3e5424, 0x546c30];
const SANDWALL = [0x4a3624, 0x6e5336, 0x93724a, 0xb8955f, 0xd4b378, 0xe8cd94];

// ---- wall materials -----------------------------------------------------------------------------------------
/** Wardens: a double row of sharpened logs on a rammed-earth foot, two rails; a stub beside a gap. */
function palisade(s: Scene, sp: PieceSpec) {
  const base = sp.broken ? 40 : 72, r = 3.2, m = wood(WOODR, 0, 40), seen = new Set<string>(), logs: [number, number, number][] = [];
  const add = (u: number, v: number, seam: boolean, i: number) => {
    const k = `${u},${v}`; if (seen.has(k)) return; seen.add(k);
    const jag = sp.broken ? 0.5 : 0.17;
    logs.push([u, v, base * (seam ? 1 : 1 - jag * hsh(i + Math.round(u), Math.round(v) + sp.v * 7, 1))]);
  };
  armBoxes(sp.mask, 13, (u0, u1, v0, v1) => s.box(u0, u1, v0, v1, 0, 4, rough(BANKR, 0.1, 0.3), 7));
  for (const off of [-5, 5]) {
    add(0, off, false, 0); add(off, 0, false, 1);
  }
  for (const [du, dv] of armDirs(sp.mask)) for (let i = 1; i <= 4; i++) {
    const seam = i === 4;
    if (du && dv) add(du * i * 6, dv * i * 6, seam, i);
    else for (const off of [-5, 5]) add(du ? du * i * 6 : off, dv ? dv * i * 6 : off, seam, i + 3);
  }
  logs.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
  if (!sp.broken) for (const z of [20, 44]) for (const [du, dv] of armDirs(sp.mask)) for (const off of du && dv ? [0] : [-5, 5]) {
    const a: V3 = [0, 0, z], b: V3 = [du * E, dv * E, z];
    if (du && !dv) { a[1] = off; b[1] = off; } else if (dv && !du) { a[0] = off; b[0] = off; }
    s.rod(a, b, 1.1, wood(OLDR, 0.1, 10));
  }
  for (const [u, v, h] of logs) s.post(u, v, h, r, m, true);
}

/** Host and Veiled: blocks of stone or sandstone. `th` = half thickness (24 fills the cell), `cren` merlons on the open sides. */
function blockWall(s: Scene, sp: PieceSpec, o: { pal: number[]; h: number; th: number; cren?: boolean; cornice?: number[]; skulls?: boolean }) {
  const h = sp.broken ? o.h * 0.5 : o.h, m = blocks(o.pal, 2 * E, h, 8, 12);
  armBoxes(sp.mask, o.th, (u0, u1, v0, v1) => s.box(u0, u1, v0, v1, 0, h, m, 6));
  armBoxes(sp.mask, o.th, (u0, u1, v0, v1) => s.box(u0, u1, v0, v1, h, h + 1, rough(o.pal, 0.08, 0.2), 1));
  if (o.cornice && !sp.broken) { const cm = mat(o.cornice, 0); armBoxes(sp.mask, o.th + 1.5, (u0, u1, v0, v1) => s.box(u0, u1, v0, v1, h - 2, h + 4, cm, 7)); }
  const a = armsOf(sp.mask);
  if (sp.broken) { // jagged broken top
    for (let i = 0; i < 5; i++) { const u = -o.th + 4 + hsh(i, sp.v, 40) * (2 * o.th - 8), v = -o.th + 4 + hsh(i, sp.v, 41) * (2 * o.th - 8), w = 4 + hsh(i, sp.v, 42) * 4; s.box(u - w, u + w, v - w, v + w, h, h + 6 + hsh(i, sp.v, 43) * 12, blocks(o.pal, 2 * w, 12, 6, 8)); }
    return;
  }
  if (o.cren) {
    const mer = (u: number, v: number) => s.box(u - 4, u + 4, v - 4, v + 4, h + 1, h + 10, blocks(o.pal, 8, 9, 5, 6));
    const t = o.th - 5;
    if (!a.e) for (const v of [-t + 2, 0, t - 2]) mer(t, v);
    if (!a.w) for (const v of [-t + 2, 0, t - 2]) mer(-t, v);
    if (!a.s) for (const u of [-t + 2, 0, t - 2]) mer(u, t);
    if (!a.n) for (const u of [-t + 2, 0, t - 2]) mer(u, -t);
  }
  if (o.skulls && sp.v === 0) s.skull(o.th - 6, o.th - 6, h + 5, 3.8, hsh(sp.mask, 3, 9) < 0.4);
}

/** Hide-Kin: a rounded bank of earth (a height field following the arms), grassed on top, stones and a few stakes. */
function bank(s: Scene, sp: PieceSpec) {
  const segs = armDirs(sp.mask).map(([du, dv]) => (du && dv ? [du * DG, dv * DG] : [du * E, dv * E])), W = 21, H = sp.broken ? 18 : 36;
  const zf = (u: number, v: number) => {
    let d = Math.hypot(u, v);
    for (const [x, y] of segs) { const t = Math.max(0, Math.min(1, (u * x + v * y) / (x * x + y * y))); d = Math.min(d, Math.hypot(u - x * t, v - y * t)); }
    const t = 1 - d / W;
    return t <= 0 ? 0 : H * Math.min(1, t * 1.9) ** 0.8;
  };
  const N = Math.ceil(DG * 2 * 4.6);
  s.q.sheet((a, b) => { const u = -DG + a * 2 * DG, v = -DG + b * 2 * DG; return [u, v, zf(u, v)]; }, N, N, (l, a, b, x, y) => {
    const u = -DG + a * 2 * DG, v = -DG + b * 2 * DG, z = zf(u, v);
    if (z < 0.7) return undefined;
    const top = z / H, n = hsh(Math.floor(u / 3), Math.floor(v / 3), sp.v + 3);
    if (hsh(Math.floor(u / 5), Math.floor(v / 5), 21) < 0.09 && top < 0.95) return ramp(STONER, l + 0.05 + n * 0.2, x, y);
    if (top > 0.72) return ramp(MOSS, l * 0.95 + (n - 0.5) * 0.4, x, y);
    return ramp(BANKR, l + (n - 0.5) * 0.3 + (hsh(x, y, 5) - 0.5) * 0.1, x, y);
  });
  if (!sp.broken) for (let i = 0; i < 3; i++) { // a few bone-white stakes on the crest
    const ang = hsh(i, sp.v, 50) * 6.283, d = 6 + hsh(i, sp.v, 51) * 8, u = Math.cos(ang) * d, v = Math.sin(ang) * d;
    if (zf(u, v) > H * 0.6) s.rod([u, v, zf(u, v) - 2], [u + 1.4, v, zf(u, v) + 16 + hsh(i, 2, 52) * 8], 1.1, mat(BONER, 0.05));
  }
}

/** A low fence of leaning stakes with one rail (Redfang). */
function fence(s: Scene, sp: PieceSpec) {
  const base = sp.broken ? 14 : 28, seen = new Set<string>(), m = wood(OLDR, 0.05, 30);
  const add = (u: number, v: number, seam: boolean, i: number) => {
    const k = `${u},${v}`; if (seen.has(k)) return; seen.add(k);
    const h = base * (seam ? 1 : 1 - 0.3 * hsh(i + u, v + sp.v * 5, 2)), lean = (hsh(i + u, v, 3) - 0.5) * 0.5;
    s.post(u, v, h, 2.1, m, true, [lean, (hsh(u, v + i, 4) - 0.5) * 0.5]);
  };
  add(0, 0, false, 0);
  for (const [du, dv] of armDirs(sp.mask)) for (let i = 1; i <= 4; i++) add(du * i * 6, dv * i * 6, i === 4, i);
  if (!sp.broken) for (const [du, dv] of armDirs(sp.mask)) s.rod([0, 0, 12], [du * E, dv * E, 12], 0.8, wood(WOODR, 0.1, 10));
  if (!sp.mask) { s.rod([-8, -8, 0], [8, 8, 22], 1.2, m); s.rod([8, -8, 0], [-8, 8, 22], 1.2, m); }
}

// ---- towers (a cluster of cells, drawn as one) -----------------------------------------------------------------
function woodTowerPiece(s: Scene, sp: PieceSpec) {
  const hu = sp.cw * HALF, hv = sp.ch * HALF, A = Math.min(hu, hv) - 4;
  s.box(-hu - PAD, hu + PAD, -hv - PAD, hv + PAD, 0, 9, rough(STONER, -0.05, 0.3)); // a stone footing that meets the walls
  woodTower(s, 0, 0, sp.cw > 1 ? 116 : 90, A, sp.clan, true);
}
function stoneTowerPiece(s: Scene, sp: PieceSpec) {
  const hu = sp.cw * HALF - 1, hv = sp.ch * HALF - 1, H = 92, m = (): Mat => (l, a, t, x, y) => {
    const row = Math.floor(t * H / 8), col = Math.floor(a * 10 + (row % 2) * 0.5), fy = (t * H / 8) % 1, fx = (a * 10 + (row % 2) * 0.5) % 1;
    const win = t > 0.42 && t < 0.62 && Math.abs(a - 0.5) < 0.05 + (sp.cw > 1 ? 0 : 0.03);
    if (win) return ramp(GHOST, 0.5 + hsh(col, row, 3) * 0.4, x, y);
    return ramp(GREYB, l + (hsh(col, row, 8) - 0.5) * 0.3 + (hsh(x, y, 4) - 0.5) * 0.1 - (fy < 0.12 || fx < 0.07 ? 0.28 : 0) - (hsh(col, row, 6) < 0.05 ? 0.3 : 0), x, y);
  };
  s.box(-hu - PAD, hu, -hv - PAD, hv, 0, H, m(), 6);
  s.box(-hu - 3, hu + 3, -hv - 3, hv + 3, H, H + 8, blocks(GREYB, 40, 8, 8, 10, 0.05), 7); // corbel
  s.box(-hu, hu, -hv, hv, H + 8, H + 9, rough(GREYB, -0.1), 1);
  for (let i = 0; i < 2 * (sp.cw + sp.ch) * 2; i++) { // merlons all round, some broken off
    if (hsh(i, sp.cw, 60) < 0.22) continue;
    const per = 2 * (hu + hv), d = (i / (2 * (sp.cw + sp.ch) * 2)) * per; let u: number, v: number;
    if (d < 2 * hu) { u = -hu + d; v = hv - 3; } else if (d < 2 * hu + 2 * hv) { u = hu - 3; v = hv - (d - 2 * hu); } else if (d < 4 * hu + 2 * hv) { u = hu - (d - 2 * hu - 2 * hv); v = -hv + 3; } else { u = -hu + 3; v = -hv + (d - 4 * hu - 2 * hv); }
    s.box(u - 4, u + 4, v - 4, v + 4, H + 9, H + 19 - hsh(i, 2, 61) * 5, blocks(GREYB, 8, 10, 5, 6));
  }
  s.flame(0, 0, H + 8, 6, 20, GHOST);
  for (const [u, v] of [[hu - 8, hv - 8], [-hu + 8, hv - 8]]) s.skull(u, v, H + 12, 4.2, true);
  s.banner(hu - 4, -hv + 6, H + 12, sp.clan, 18, 38, 1);
}
function pylonPiece(s: Scene, sp: PieceSpec) {
  s.box(-22, 22, -22, 22, 0, 8, blocks(SAND, 44, 8, 8, 12), 7);
  s.box(-17, 17, -17, 17, 8, 14, blocks(SAND, 34, 6, 6, 10, 0.05), 7);
  s.stone(0, 0, 13, 96, SAND, [0x9a6a10, 0xd9a030, 0xf6d26b], 4 + sp.v);
  s.q.blob([0, 0, 98], 5, 5, 8, mat(GOLDR, 0.1), 0.35, 1);
  s.rod([0, 0, 104], [0, 0, 122], 0.9, mat(GOLDR));
  s.q.blob([0, 0, 124], 3, 3, 4, mat(GOLDR, 0.2));
}

// ---- gates -------------------------------------------------------------------------------------------------------
function gatePiece(s: Scene, sp: PieceSpec) {
  const sg = sp.part === 0 ? -1 : 1, P = (a: number): [number, number] => (sp.axis === 0 ? [0, sg * a] : [sg * a, 0]);
  const [pu, pv] = P(18), c = sp.clan, back = sp.part === 0;
  const lintel = (z: number, th: number, m: Mat) => { const a = P(-18), b = P(18); s.rod([a[0], a[1], z], [b[0], b[1], z], th, m); };
  if (c === "wardens") {
    s.post(pu, pv, 92, 4.4, wood(WOODR, 0.05, 40), false); s.box(pu - 5, pu + 5, pv - 5, pv + 5, 84, 92, wood(OLDR, 0.1, 10));
    if (back) { s.box(sp.axis === 0 ? -3 : -22, sp.axis === 0 ? 3 : 22, sp.axis === 0 ? -22 : -3, sp.axis === 0 ? 22 : 3, 78, 86, wood(WOODR, 0.1, 30)); s.skull(0, 0, 91, 4.4); }
    else s.brazier(pu + (sp.axis === 0 ? 0 : 0), pv, 28);
  } else if (c === "redfang") {
    s.post(pu, pv, 100, 2.6, wood(OLDR, 0, 40), false);
    s.rod([pu - 8, pv + 8, 84], [pu + 8, pv - 8, 84], 1, wood(OLDR, 0.05, 10));
    s.skull(pu, pv, 103, 4.6, true); s.skull(pu - 6, pv + 6, 84, 3.2); s.skull(pu + 6, pv - 6, 84, 3.2);
    if (back) { lintel(80, 1.3, wood(OLDR, 0.05, 20)); s.banner(0.01, 0, 92, c, 16, 34, 1); }
  } else if (c === "host") {
    s.box(pu - 6, pu + 6, pv - 6, pv + 6, 0, 94, blocks(GREYB, 12, 94, 8, 6), 7); s.box(pu - 7, pu + 7, pv - 7, pv + 7, 94, 100, blocks(GREYB, 14, 6, 6, 6, 0.1), 7);
    s.skull(pu, pv, 107, 5.6, true);
    if (back) for (let i = 0; i < 12; i++) { const t = i / 11, a = P(-18 + 36 * t); s.q.blob([a[0], a[1], 88 + Math.sin(t * Math.PI) * 14], 2.5, 2.5, 2.5, mat(BONER, 0.05)); }
    else s.flame(pu, pv, 100, 4.5, 14, GHOST);
  } else if (c === "hidekin") {
    s.post(pu, pv, 84, 3.6, wood(OLDR, -0.05, 40), false, [0, 0]);
    s.skull(pu, pv, 88, 5, true);
    s.rod([pu, pv, 50], [pu + (sp.axis === 0 ? 0 : -sg * 7), pv + (sp.axis === 0 ? -sg * 7 : 0), 66], 1.1, mat(BONER, 0));
    if (back) lintel(76, 1.6, mat(BONER, -0.05));
    s.q.blob([pu, pv, 3], 7, 7, 4, rough(BANKR, 0.1), 0, 0.6);
  } else {
    s.box(pu - 5, pu + 5, pv - 5, pv + 5, 0, 88, blocks(SAND, 10, 88, 8, 6), 7);
    s.q.blob([pu, pv, 90], 6, 6, 7, mat(GOLDR, 0.05), 0.3, 1);
    s.rod([pu, pv, 96], [pu, pv, 110], 0.9, mat(GOLDR));
    if (back) { lintel(78, 2.4, mat(GOLDR, 0)); const a = P(-18), b = P(18); s.q.quad([a[0], a[1], 78], [b[0] - a[0], b[1] - a[1], 0], [0, 0, -14], cloth(ARCANE, cr(CLANS.veiled.trim), 7)); }
  }
}

// ---- tents, mounds, rubble, hearth -----------------------------------------------------------------------------
function tentPiece(s: Scene, sp: PieceSpec) {
  const red = [0x1e0606, 0x380c0a, 0x561410, 0x761e16, 0x962a1e, 0xb43c28], hide = [0x241810, 0x3c281a, 0x5a3c24, 0x7a5434, 0x9a7048, 0xb8905e];
  const pal = sp.clan === "redfang" ? (sp.v === 1 ? hide : red) : sp.v === 1 ? hide : cr(CLANS[sp.clan].cloth);
  s.cone(0, 0, 19 + sp.v * 1.5, 46 + sp.v * 6, pal, sp.v + 1, true);
  if (sp.v === 2) s.skull(0, 0, 60, 4.2, true);
}
function moundPiece(s: Scene, sp: PieceSpec) {
  const a = sp.cw * HALF + 2, b = sp.ch * HALF + 2, H = 58, dome = (u: number, v: number) => { const q = 1 - (u / a) ** 2 - (v / b) ** 2; return q <= 0 ? 0 : H * Math.sqrt(q); };
  const mouth = (u: number, v: number) => Math.hypot(u - a * 0.5, v - b * 0.55) < 11 && dome(u, v) > 8;
  const NU = Math.ceil(a * 2 * 6), NV = Math.ceil(b * 2 * 6);
  s.q.sheet((p, t) => { const u = -a + p * 2 * a, v = -b + t * 2 * b; return [u, v, dome(u, v)]; }, NU, NV, (l, p, t, x, y) => {
    const u = -a + p * 2 * a, v = -b + t * 2 * b, z = dome(u, v);
    if (z < 0.7) return undefined;
    if (mouth(u, v)) return ramp([0x050403, 0x120c08, 0x24180e], 0.25 + z / H * 0.4 + hsh(x, y, 2) * 0.2, x, y);
    const n = hsh(Math.floor(u / 3), Math.floor(v / 3), 3);
    if (hsh(Math.floor(u / 6), Math.floor(v / 6), 7) < 0.1) return ramp(HIDE, l * 0.9 + 0.05, x, y);
    return ramp(z / H > 0.6 ? MOSS : SOIL, l * 1.05 + (n - 0.5) * 0.3, x, y);
  });
  s.rod([a * 0.5 - 8, b * 0.55 + 4, 12], [a * 0.5 - 8, b * 0.55 + 4, 36], 1.6, mat(BONER, 0)); // a bone frame by the burrow mouth
  s.skull(a * 0.5 - 8, b * 0.55 + 4, 39, 4, true);
}
function rubblePiece(s: Scene, sp: PieceSpec) {
  const wooden = sp.clan === "wardens" || sp.clan === "redfang", pal = wooden ? OLDR : sp.clan === "veiled" ? SAND : sp.clan === "hidekin" ? BANKR : GREYB;
  for (let i = 0; i < 6; i++) {
    const u = (hsh(i, sp.v, 70) - 0.5) * 34, v = (hsh(i, sp.v, 71) - 0.5) * 34, r = 2 + hsh(i, sp.v, 72) * 3;
    if (wooden && i < 2) s.post(u, v, 6 + hsh(i, sp.v, 73) * 8, 3, wood(WOODR, 0, 20), false);
    else s.q.blob([u, v, r * 0.4], r * 1.3, r, r * 0.7, rough(pal, 0.05));
  }
}
function hearthPiece(s: Scene, sp: PieceSpec) {
  const fire = sp.clan === "host" ? GHOST : sp.clan === "veiled" ? ARCANE : FIRE;
  for (let i = 0; i < 9; i++) { const a = i * 0.698; s.q.blob([Math.cos(a) * 11, Math.sin(a) * 11, 1.6], 3.4, 3.2, 2.6, rough(STONER, 0)); }
  s.rod([-6, -3, 2], [6, 3, 3], 1.5, wood([0x0a0605, 0x1c1410, 0x30241a, 0x46362a], 0, 6));
  s.rod([-5, 4, 2], [5, -4, 3], 1.5, wood([0x0a0605, 0x1c1410, 0x30241a, 0x46362a], 0, 6));
  s.flame(0, 0, 3, 5, 12, fire);
}

const ZMAX: Record<PieceKind, number> = { wall: 104, fence: 48, tower: 215, tent: 84, mound: 70, gate: 124, rubble: 24, pit: 40 };
function zmax(sp: PieceSpec) {
  if (sp.kind === "tower") return sp.clan === "host" ? 160 : sp.clan === "veiled" ? 132 : sp.cw > 1 ? 215 : 190;
  if (sp.kind === "wall") return sp.clan === "hidekin" ? 70 : sp.clan === "veiled" ? 84 : ZMAX.wall;
  return ZMAX[sp.kind];
}

function paintBody(s: Scene, sp: PieceSpec) {
  switch (sp.kind) {
    case "wall":
      if (sp.clan === "wardens") return palisade(s, sp);
      if (sp.clan === "host") return blockWall(s, sp, { pal: GREYB, h: 62, th: 24, cren: true, skulls: true });
      if (sp.clan === "veiled") return blockWall(s, sp, { pal: SANDWALL, h: 66, th: 15, cornice: GOLDR });
      if (sp.clan === "hidekin") return bank(s, sp);
      return fence(s, sp);
    case "fence": return fence(s, sp);
    case "tower": return sp.clan === "host" ? stoneTowerPiece(s, sp) : sp.clan === "veiled" ? pylonPiece(s, sp) : woodTowerPiece(s, sp);
    case "gate": return gatePiece(s, sp);
    case "tent": return tentPiece(s, sp);
    case "mound": return moundPiece(s, sp);
    case "rubble": return rubblePiece(s, sp);
    case "pit": return hearthPiece(s, sp);
  }
}

/** A painted piece as RGBA, with the cell's middle on the ground at pixel (ox, oy). */
export interface Painted { w: number; h: number; ox: number; oy: number; data: Uint8ClampedArray }
const up4 = (n: number) => Math.ceil(n / 4) * 4;

/** Draws one piece (art-time or run-time; no DOM): painted a little past its cell, outlined, then clipped to the cell. */
export function paintPiece(sp: PieceSpec): Painted {
  const sizeU = sp.cw + sp.ch, hu = sp.cw * HALF, hv = sp.ch * HALF;
  const w = up4(2 * (sizeU * HALF + 22)), ox = w / 2, oy = up4(zmax(sp) + sizeU * 12 + 8), h = up4(oy + sizeU * 12 + 14);
  const buf = new Uint32Array(w * h), own = new Float32Array(w * h * 2);
  const q = new IsoPaint(bufPen(buf, w, h), w, h, ox, oy);
  q.onPlot = (x, y, u, v) => { const i = (y * w + x) * 2; own[i] = u; own[i + 1] = v; };
  paintBody(new Scene(q), sp);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && buf[y * w + x] >>> 24 > 140;
  const out = new Uint32Array(buf), oo = new Float32Array(own);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (solid(x, y) || (buf[i] >>> 24) > 0) continue;
    const nb = solid(x - 1, y) ? i - 1 : solid(x + 1, y) ? i + 1 : solid(x, y - 1) ? i - w : solid(x, y + 1) ? i + w : -1;
    if (nb < 0) continue;
    out[i] = (0xe0 << 24 | OUTLINE) >>> 0; oo[i * 2] = own[nb * 2]; oo[i * 2 + 1] = own[nb * 2 + 1];
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const c = out[i];
    if (!(c >>> 24)) continue;
    const u = oo[i * 2], v = oo[i * 2 + 1];
    if (u < -hu || u >= hu || v < -hv || v >= hv) { // the neighbouring cell's piece draws this pixel, except a diagonal join's corner overlap
      const corner = sp.mask & 0xf0 && Math.abs(u) > hu - 10 && Math.abs(v) > hv - 10 && Math.abs(u) < hu + 9 && Math.abs(v) < hv + 9;
      if (!corner) continue;
    }
    data[i * 4] = (c >> 16) & 255; data[i * 4 + 1] = (c >> 8) & 255; data[i * 4 + 2] = c & 255; data[i * 4 + 3] = c >>> 24;
  }
  return { w, h, ox, oy, data };
}

function bufPen(buf: Uint32Array, W: number, H: number): Pen {
  const px = (x: number, y: number, c: number, a = 1) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (a >= 1) { buf[i] = (0xff000000 | c) >>> 0; return; }
    const o = buf[i], oa = o >>> 24;
    if (!oa) { buf[i] = ((Math.round(a * 255) << 24) | c) >>> 0; return; }
    buf[i] = ((0xff << 24) | mixc(o & 0xffffff, c, a)) >>> 0;
  };
  return { px } as Pen;
}

// ---- the trampled ground ---------------------------------------------------------------------------------------
interface GroundLook { pal: number[]; edge: number[] }
const GROUND: Record<ClanKey, GroundLook> = {
  wardens: { pal: [0x1c140c, 0x2c2014, 0x40301e, 0x584428, 0x6e5a34, 0x846e44], edge: [0x242a14, 0x34401c, 0x4a5a24, 0x5e7230] },
  redfang: { pal: [0x1a0f0a, 0x2a1810, 0x3e2616, 0x54351e, 0x6c4a2c, 0x84603a], edge: [0x2a2a14, 0x3a4018, 0x4e5a20, 0x627030] },
  host: { pal: [0x0e1110, 0x1a1f1e, 0x262d2c, 0x343e3c, 0x465250, 0x5a6866], edge: [0x1a2018, 0x242c20, 0x303a2a, 0x3c4834] },
  hidekin: { pal: [0x16100a, 0x241a10, 0x382816, 0x4e3a20, 0x645030, 0x7c6640], edge: [0x24280e, 0x343c14, 0x485220, 0x5c6a2c] },
  veiled: { pal: [0x2a2014, 0x44341e, 0x624c2c, 0x80663c, 0xa08450, 0xbea06a], edge: [0x2c3216, 0x3e481e, 0x566428, 0x6c7c32] },
};
export const GROUND_W = 112, GROUND_H = 64, GROUND_OX = 56, GROUND_OY = 32;

/** One cell of the compound's ground. `mask`: which of E, W, S, N continue the compound (J bits); `road`: a gate's packed way. */
export function paintGround(clan: ClanKey, mask: number, v: number, road: boolean): Painted {
  const { pal, edge } = GROUND[clan], W = GROUND_W, H = GROUND_H, buf = new Uint32Array(W * H), g = new IsoPaint(bufPen(buf, W, H), W, H, GROUND_OX, GROUND_OY);
  const open = [!(mask & J.E), !(mask & J.W), !(mask & J.S), !(mask & J.N)];
  const R = HALF + PAD;
  g.surf((s, t) => [[(s - 0.5) * 2 * R, (t - 0.5) * 2 * R, 0], [0, 0, 1]], Math.ceil(R * 5.2), Math.ceil(R * 5.2), (_l, s, t, x, y) => {
    const u = (s - 0.5) * 2 * R, w = (t - 0.5) * 2 * R;
    // ragged dithered edges on the sides where the compound ends
    let e = 99;
    const rag = (c: number, k: number) => 2 + 5 * hsh(Math.floor(c / 3), k, 11 + v);
    if (open[0]) e = Math.min(e, HALF - u - rag(w, 1)); if (open[1]) e = Math.min(e, u + HALF - rag(w, 2));
    if (open[2]) e = Math.min(e, HALF - w - rag(u, 3)); if (open[3]) e = Math.min(e, w + HALF - rag(u, 4));
    if (e < 0 || e + (dith(x, y) - 0.5) * 3 < 0.2) return undefined;
    const noise = (hsh(Math.floor(u / 9), Math.floor(w / 9), 3 + v) - 0.5) * 0.14 + (hsh(Math.floor(u / 3), Math.floor(w / 3), 4) - 0.5) * 0.1;
    if (e < 4.5) return ramp(edge, 0.35 + noise * 2 + e * 0.12, x, y);
    let c = ramp(pal, 0.45 + noise * 2.5 + (road ? 0.18 : 0) + (hsh(x, y, 7) < 0.06 ? 0.2 : 0) - (hsh(x, y, 8) < 0.05 ? 0.15 : 0), x, y);
    const fu = ((u + 600) % 24), fw = ((w + 600) % 24);
    if (clan === "host" && (fu < 0.9 || fw < 0.9)) c = ramp(GREYB, 0.12 + hsh(Math.floor(u / 24), Math.floor(w / 24), 4) * 0.2, x, y);
    else if (clan === "host") c = ramp(GREYB, 0.34 + hsh(Math.floor((u + 600) / 24), Math.floor((w + 600) / 24), 5 + v) * 0.35 + noise, x, y);
    if (clan === "veiled" && (((u + 600) % 16) < 0.8 || ((w + 600) % 16) < 0.8)) c = ramp(SAND, 0.22 + noise, x, y);
    if (clan === "redfang" && hsh(Math.floor(u / 5), Math.floor(w / 5), 9 + v) < 0.07) c = ramp([0x2a0c08, 0x4a1810, 0x6a2418], 0.5, x, y);
    if (clan === "hidekin" && Math.abs(Math.sin(u * 0.19 + w * 0.07 + v * 3)) < 0.05 && hsh(Math.floor(u / 8), 3, v) < 0.6) c = ramp(SOIL, 0.15, x, y);
    if (clan === "wardens" && hsh(x, y, 12) < 0.025) c = ramp(STRAWR, 0.55, x, y);
    return c;
  });
  // litter: pebbles, bones, straw (flat, nothing to bump into)
  const kinds = clan === "host" || clan === "redfang" ? ["bone", "pebble", "bone"] : clan === "wardens" ? ["straw", "pebble", "straw"] : ["pebble", "straw", "pebble"];
  for (let i = 0; i < 3; i++) {
    const u = (hsh(i, v, 80) - 0.5) * 30, w = (hsh(i, v, 81) - 0.5) * 30, k = kinds[i], s1 = 1 + hsh(i, v, 82) * 1.2;
    if (open[0] && u > 14 || open[1] && u < -14 || open[2] && w > 14 || open[3] && w < -14) continue;
    if (k === "pebble") g.blob([u, w, 0.4], s1 * 1.3, s1, s1 * 0.6, rough(STONER, 0.05));
    else if (k === "bone") g.rod([u, w, 0.6], [u + 5 * (hsh(i, v, 83) - 0.5) * 2, w + 4 * (hsh(i, v, 84) - 0.5) * 2, 0.6], 0.8, mat(BONER));
    else g.rod([u, w, 0.4], [u + 6, w + 2 * (hsh(i, v, 85) - 0.5), 0.4], 0.4, mat(STRAWR));
  }
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { const c = buf[i]; data[i * 4] = (c >> 16) & 255; data[i * 4 + 1] = (c >> 8) & 255; data[i * 4 + 2] = c & 255; data[i * 4 + 3] = c >>> 24; }
  return { w: W, h: H, ox: GROUND_OX, oy: GROUND_OY, data };
}

/** Key of one ground tile look (atlas frame name). */
export const groundKey = (clan: ClanKey, mask: number, v: number, road: boolean) => `hg_${clan}_${mask}_${v}_${road ? 1 : 0}`;
export interface GroundPlan {
  /** Size and origin (the middle cell's centre) of the compound's ground image, in texels. */
  w: number; h: number; ox: number; oy: number;
  /** The tiles to lay, back to front, at pixel (x, y) of that image. */
  tiles: { key: string; clan: ClanKey; mask: number; v: number; road: boolean; x: number; y: number }[];
}
/** Which ground tiles, where, make up a fort's compound (tile offsets (dx, dy) sit at ((dx - dy) * 48, (dx + dy) * 24)). */
export function groundPlan(f: HoldFort): GroundPlan {
  const cell = new Set(f.cells.map((c) => `${c.dx},${c.dy}`)), at = (dx: number, dy: number) => cell.has(`${dx},${dy}`);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const c of f.cells) {
    const px = (c.dx - c.dy) * T, py = (c.dx + c.dy) * T / 2;
    x0 = Math.min(x0, px - GROUND_OX); x1 = Math.max(x1, px - GROUND_OX + GROUND_W); y0 = Math.min(y0, py - GROUND_OY); y1 = Math.max(y1, py - GROUND_OY + GROUND_H);
  }
  const tiles: GroundPlan["tiles"] = [];
  for (const c of [...f.cells].sort((a, b) => a.dy + a.dx - b.dy - b.dx)) {
    const mask = (at(c.dx + 1, c.dy) ? J.E : 0) | (at(c.dx - 1, c.dy) ? J.W : 0) | (at(c.dx, c.dy + 1) ? J.S : 0) | (at(c.dx, c.dy - 1) ? J.N : 0);
    const v = Math.floor(hsh(f.cx + c.dx, f.cy + c.dy, 19) * 3), road = c.kind === "gate";
    tiles.push({ key: groundKey(f.clan, mask, v, road), clan: f.clan, mask, v, road, x: (c.dx - c.dy) * T - GROUND_OX - x0, y: (c.dx + c.dy) * T / 2 - GROUND_OY - y0 });
  }
  return { w: x1 - x0, h: y1 - y0, ox: -x0, oy: -y0, tiles };
}

const groundCache = new Map<string, Painted>();
/** The whole compound's ground painted now (previews; the game blits the baked tiles of the atlas instead). */
export function composeGround(f: HoldFort): Painted {
  const plan = groundPlan(f), { w, h } = plan, data = new Uint8ClampedArray(w * h * 4);
  for (const g of plan.tiles) {
    let t = groundCache.get(g.key); if (!t) groundCache.set(g.key, t = paintGround(g.clan, g.mask, g.v, g.road));
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
      const si = (y * t.w + x) * 4;
      if (!t.data[si + 3]) continue;
      const di = ((g.y + y) * w + g.x + x) * 4;
      data[di] = t.data[si]; data[di + 1] = t.data[si + 1]; data[di + 2] = t.data[si + 2]; data[di + 3] = t.data[si + 3];
    }
  }
  return { w, h, ox: plan.ox, oy: plan.oy, data };
}

// ---- the baked atlas (tools/art/holds.ts writes it, holdAssets.ts loads it) -------------------------------------
export const ATLAS_W = 1024, ATLAS_PAD = 2;
/** One clan's atlas: the frame of every piece (`pieceKey`) and ground tile (`groundKey`), with the cell's middle at (ox, oy) in the frame. */
export interface AtlasMeta { w: number; h: number; frames: Record<string, { x: number; y: number; w: number; h: number; ox: number; oy: number }> }
export const atlasFile = (k: ClanKey, ext: "png" | "json") => `atlas_${k}.${ext}`;

// ---- layout: a fort's cells to pieces -----------------------------------------------------------------------
/** A piece placed at a fort: offset in tiles from the Hold's middle tile (clusters sit on a half tile), and `foot` screen px added to its depth. */
export interface PieceInst { spec: PieceSpec; key: string; dx: number; dy: number; foot: number }

const BLOCK_KINDS: ReadonlySet<FortKind> = new Set<FortKind>(["wall", "tower", "tent", "fence", "mound"]);
const WALL_JOIN: ReadonlySet<FortKind> = new Set<FortKind>(["wall", "tower", "gate", "fence"]);
const FENCE_JOIN: ReadonlySet<FortKind> = new Set<FortKind>(["wall", "tower", "gate", "fence", "tent"]);

/**
 * What to draw for the fort as built at one Hold: the pieces for its cells (gate cells are two posts and a lintel,
 * gap cells a little rubble beside a wall, the middle cell a hearth). Same cells the server makes solid.
 */
export function fortLayout(f: HoldFort): PieceInst[] {
  const kinds = new Map<number, FortKind>(), id = (dx: number, dy: number) => (dy + 40) * 96 + dx + 40;
  for (const c of f.cells) kinds.set(id(c.dx, c.dy), c.kind);
  const at = (dx: number, dy: number) => kinds.get(id(dx, dy));
  const mk = (clan: ClanKey, kind: PieceKind, o: Partial<PieceSpec> = {}): PieceSpec => ({ clan, kind, mask: 0, v: 0, cw: 1, ch: 1, axis: 0, part: 0, broken: false, ...o });
  const out: PieceInst[] = [], seen = new Set<number>(), clan = f.clan;
  const push = (spec: PieceSpec, dx: number, dy: number, foot = 0) => out.push({ spec, key: pieceKey(spec), dx, dy, foot });
  const joined = (dx: number, dy: number, join: ReadonlySet<FortKind>) => {
    const j = (a: number, b: number) => { const k = at(dx + a, dy + b); return !!k && join.has(k); };
    let m = (j(1, 0) ? J.E : 0) | (j(-1, 0) ? J.W : 0) | (j(0, 1) ? J.S : 0) | (j(0, -1) ? J.N : 0);
    if (!(m & (J.E | J.S)) && j(1, 1)) m |= J.SE;
    if (!(m & (J.E | J.N)) && j(1, -1)) m |= J.NE;
    if (!(m & (J.W | J.S)) && j(-1, 1)) m |= J.SW;
    if (!(m & (J.W | J.N)) && j(-1, -1)) m |= J.NW;
    return m;
  };
  const beside = (dx: number, dy: number, what: FortKind) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => at(dx + a, dy + b) === what);
  const blockAt = (dx: number, dy: number) => { const k = at(dx, dy); return !!k && BLOCK_KINDS.has(k); };
  for (const c of f.cells) {
    const { dx, dy, kind } = c, variant = Math.floor(hsh(f.cx + dx, f.cy + dy, 17) * 3);
    if (kind === "wall" || kind === "fence") {
      push(mk(clan, kind, { mask: joined(dx, dy, kind === "wall" ? WALL_JOIN : FENCE_JOIN), v: variant, broken: beside(dx, dy, "gap") }), dx, dy);
    } else if (kind === "tent") push(mk(clan, "tent", { v: variant }), dx, dy);
    else if (kind === "gate") {
      const ns = blockAt(dx, dy - 1) && blockAt(dx, dy + 1), ew = blockAt(dx - 1, dy) && blockAt(dx + 1, dy);
      const axis: 0 | 1 = ns ? 0 : ew ? 1 : blockAt(dx, dy - 1) || blockAt(dx, dy + 1) ? 0 : blockAt(dx - 1, dy) || blockAt(dx + 1, dy) ? 1 : 0;
      push(mk(clan, "gate", { axis, part: 0 }), dx, dy, -7); push(mk(clan, "gate", { axis, part: 1 }), dx, dy, 7);
    } else if (kind === "gap") { if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => blockAt(dx + a, dy + b))) push(mk(clan, "rubble", { v: variant }), dx, dy); }
    else if (kind === "court") { if (dx === 0 && dy === 0) push(mk(clan, "pit"), dx, dy); }
    else if ((kind === "tower" || kind === "mound") && !seen.has(id(dx, dy))) {
      // a connected block of cells of this kind is one piece when it is a full rectangle, else one piece per cell
      const comp: [number, number][] = [], q: [number, number][] = [[dx, dy]]; seen.add(id(dx, dy));
      while (q.length) { const [x, y] = q.pop()!; comp.push([x, y]); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(x + a, y + b) === kind && !seen.has(id(x + a, y + b))) { seen.add(id(x + a, y + b)); q.push([x + a, y + b]); } }
      const xs = comp.map((p) => p[0]), ys = comp.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
      if (cw * ch === comp.length && cw <= 3 && ch <= 3) push(mk(clan, kind, { cw, ch, v: kind === "tower" ? variant : 0 }), (x0 + x1) / 2, (y0 + y1) / 2);
      else for (const [x, y] of comp) push(mk(clan, kind, { v: Math.floor(hsh(f.cx + x, f.cy + y, 17) * 3) }), x, y);
    }
  }
  return out;
}

