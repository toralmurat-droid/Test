/**
 * The clan war's Hold works (art keys war_work_<kind>_<clan>, sheets mob_war_work_<kind>_<clan> from paint/mobs.ts): the
 * destructible things inside a clan fort, 3D-built like the carts (siege3d.ts, mob3d.ts). Art-only keys: no MobKind, no
 * gameplay table. Four kinds per clan: a barracks (soldiers come out of it), supply stores (a lean-to over crates, sacks
 * and barrels), a weapon rack with a brazier, and a rubble heap (drawn over a wrecked tower or gate, a smoke wisp over it).
 * Same 14-frame layout as the carts: 0-11 the intact object (idle: a banner stirring, fire flickering), 12 shaken by a blow
 * (jolted, chips flying), 13 wrecked (the rubble heap repeats frame 0). Everything faces the camera (model +x toward the
 * viewer, y across the screen, z up), the ground line sits at oy ~ 0.9 of the frame like the carts.
 * Colours: cloth / trim / sigil come from shared/war/clans.ts.
 */
import { cap, chain, cone, custom, ell, mat, mixc, rbox, sphere, torus, type Mat, type Model, type Prim, type V3 } from "./mob3d";
import { dk, gold, remap, shiftModel, tip } from "./siege3d";

export const WORK_FRAMES = 14;
export const WORK_CLANS = ["wardens", "redfang", "host", "hidekin", "veiled"] as const;
export const WORK_KINDS = ["barracks", "stores", "rack", "rubble"] as const;
export type WorkClan = (typeof WORK_CLANS)[number];
export type WorkKind = (typeof WORK_KINDS)[number];
/** Frame size in world px (the sheet is baked at 1.5 texels per px) and the ground line, per kind. */
export const WORK_SIZE: Record<WorkKind, { w: number; h: number; oy: number }> = {
  barracks: { w: 88, h: 64, oy: 58 },
  stores: { w: 48, h: 40, oy: 36 },
  rack: { w: 44, h: 44, oy: 40 },
  rubble: { w: 40, h: 36, oy: 32 },
};
export interface WarWork { key: string; kind: WorkKind; clan: WorkClan; w: number; h: number; oy: number }
/** Every works sheet: key (the mob_ sheet is "mob_" + key), frame size, ground line (px from the top of the frame). */
export const WAR_WORKS: WarWork[] = WORK_KINDS.flatMap((kind) => WORK_CLANS.map((clan) => ({ key: `war_work_${kind}_${clan}`, kind, clan, ...WORK_SIZE[kind] })));

// ---------------------------------------------------------------- palettes
interface Pal { wall: number; wallD: number; roof: number; stone: number; cloth: number; trim: number; sigil: number; glow: number }
const PAL: Record<WorkClan, Pal> = {
  wardens: { wall: 0x6b4a2a, wallD: 0x3e2a18, roof: 0x4a5a64, stone: 0x86827a, cloth: 0x3b4a2c, trim: 0xd9822b, sigil: 0xf0b44a, glow: 0xffb040 },
  redfang: { wall: 0x7a5a3a, wallD: 0x3e2c22, roof: 0x6e4c30, stone: 0x6a6a68, cloth: 0x7e1d16, trim: 0x1a1414, sigil: 0xe3d6b8, glow: 0xff7a2a },
  host: { wall: 0x2c2620, wallD: 0x1a1612, roof: 0x24302c, stone: 0x4a4a46, cloth: 0x1f2422, trim: 0x4f7d6a, sigil: 0xd8cfb2, glow: 0x4fe8c0 },
  hidekin: { wall: 0x8a5f2a, wallD: 0x4a3018, roof: 0x4e3222, stone: 0x6e4a30, cloth: 0x8a5f2a, trim: 0x6e1d18, sigil: 0xe2c79a, glow: 0xffa040 },
  veiled: { wall: 0xcdb27a, wallD: 0x8a7a5a, roof: 0xd6bd86, stone: 0xb39a6a, cloth: 0x2a2a5a, trim: 0xe0a030, sigil: 0xf6d26b, glow: 0xb070ff },
};
const BONE = 0xd8cfb2, IRON = 0x6a6a68, TEAL = 0x4fe8c0, PALE = 0xb4d4be;

// ---------------------------------------------------------------- small helpers
interface Cx { P: Prim[]; eyes: NonNullable<Model["eyes"]>; halos: NonNullable<Model["halos"]> }
const hs = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
const glowM = (col: number) => mat(col, { emit: 1, lo: 0.85, hi: 1.5 });
const wd = (col: number, tex?: Mat["tex"]) => dk(col, 0.45, 1.45, { grain: 0.35, tex });
const bone = () => dk(BONE, 0.4, 1.18, { grain: 0.15, spec: 0.15 });
const iron = () => dk(IRON, 0.4, 1.45, { spec: 0.8, shine: 22, grain: 0.1 });
const stoneM = (col: number) => dk(col, 0.4, 1.4, { grain: 0.5 });
const cloth = (col: number) => dk(col, 0.45, 1.35, { grain: 0.3 });
const DARK = () => dk(0x120c08, 0.8, 1.2);
/** Vertical planks seen from the front: board edges and a little shade jitter along y. */
const vplank = (w: number, amp = 0.05): Mat["tex"] => (_x, y) => { const u = y / w, c = Math.floor(u); return (hs(c, 1) - 0.5) * amp * 2 - (u - c < 0.09 ? 0.1 : 0); };
/** Shingle rows climbing a slope: edges and per-shingle shade. */
const shingle = (rw: number, rh: number): Mat["tex"] => (_x, y, z) => { const r = Math.floor(z / rh), u = (y + hs(r, 3) * rw) / rw, c = Math.floor(u); return (hs(c, r) - 0.5) * 0.34 - (z / rh - r < 0.2 ? 0.22 : 0); };
/** Patched hide or canvas: blocks of a slightly different shade. */
const patchy = (s: number, amp = 0.16): Mat["tex"] => (x, y, z) => (hs(Math.floor(y / s), Math.floor((z + x * 0.6) / s)) - 0.5) * amp;
const stripes = (w: number, a = 0.1): Mat["tex"] => (_x, y) => (Math.floor(y / w) & 1 ? a : -a * 0.4);

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const pole = (cx: Cx, x: number, y: number, z0: number, z1: number, col: number, r = 0.85) => cx.P.push(cap([x, y, z0], [x, y, z1], r, r * 0.8, wd(col), { k: 0.1 }));
const stake = (cx: Cx, x: number, y: number, h: number, col: number, lean = 0) => {
  cx.P.push(cap([x, y, 0], [x + lean * 0.4, y, h], 1.25, 1.1, wd(col), { k: 0.1 }), cone([x + lean * 0.4, y, h - 0.5], [x + lean, y, h + 3.6], 1.2, wd(col), { k: 0.05 }));
};
const door = (cx: Cx, x: number, y: number, zc: number, hx: number, hy: number, hz: number) => cx.P.push(rbox([x, y, zc], [hx, hy, hz], 0.5, DARK(), { cut: true, k: 0.4 }));
/** A pennant hanging from a pole top at (bx, by, zt), `len` long along y (dir -1 / 1), swaying with phase `ph`. */
function flag(cx: Cx, bx: number, by: number, zt: number, len: number, hh: number, col: number, trim: number | null, ph: number, dir = 1) {
  const wv = (u: number) => Math.sin(ph + u * 3.2) * 0.9 * u;
  const layer = (h: number, zc: number, c: number, th: number) => cx.P.push(custom([bx - 3, Math.min(by, by + dir * len) - 1, zt - hh - 1], [bx + 3, Math.max(by, by + dir * len) + 1, zt + 1], (x, y, z) => {
    const u = ((y - by) * dir) / len, e = (h / 2) * (1 - 0.45 * Math.max(0, Math.min(1, u)));
    return Math.max(Math.abs(x - bx - wv(u)) - th, -u * len, u * len - len, Math.abs(z - zc) - e);
  }, cloth(c), { k: 0.1 }));
  layer(hh, zt - hh / 2, col, 0.3);
  if (trim !== null) layer(hh * 0.28, zt - hh * 0.5, trim, 0.42);
}
/** A torn cloth lying on the ground, ragged at one end. */
function clothFlat(cx: Cx, x0: number, y0: number, w: number, h: number, yaw: number, col: number, trim?: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw), R = Math.hypot(w, h) / 2 + 2;
  const mk = (hh: number, th: number, m: Mat) => cx.P.push(custom([x0 - R, y0 - R, -1], [x0 + R, y0 + R, 3], (x, y, z) => {
    const a = (x - x0) * c + (y - y0) * s, b = -(x - x0) * s + (y - y0) * c, rag = (Math.sin(b * 2.3) * 0.5 + 0.5) * 2.6;
    return Math.max(Math.abs(z - 0.7 - Math.sin(a * 0.5) * 0.35) - th, Math.abs(a) - w / 2 + (a > 0 ? rag : 0), Math.abs(b) - hh / 2 * (1 - 0.25 * (a / w + 0.5)));
  }, m, { k: 0.1 }));
  mk(h, 0.4, cloth(col)); if (trim !== undefined) mk(h * 0.26, 0.55, cloth(trim));
}
function fire(cx: Cx, x: number, y: number, z: number, r: number, col: number, fl: number, hr = 4) {
  cx.P.push(sphere([x, y, z], r * (0.9 + 0.25 * fl), glowM(col), { k: 0.2 }), sphere([x, y, z + r * 0.5 * (0.6 + fl)], r * 0.55, glowM(mixc(col, 0xffffff, 0.45)), { k: 0.2 }));
  cx.halos.push({ p: [x, y, z], r: r * hr, col, a: 0.35 + 0.22 * fl });
}
/** A small skull facing +x. */
function skull(cx: Cx, c: V3, r: number, eye?: number) {
  cx.P.push(sphere(c, r, bone(), { k: 0.2 }), ell(add(c, [r * 0.55, 0, -r * 0.55]), [r * 0.55, r * 0.6, r * 0.45], bone(), { k: 0.3 }));
  for (const s of [-1, 1]) { cx.P.push(sphere(add(c, [r * 0.8, s * r * 0.38, 0]), r * 0.3, dk(0x1a1410, 1, 1), { k: 0.1, cut: true })); if (eye !== undefined) cx.eyes.push({ p: add(c, [r * 0.85, s * r * 0.38, 0]), col: eye }); }
}
/** A gable roof prism along y, wall top at H, ridge at H + Rh; `drop` thickens the eaves downward. */
function gable(cx: Cx, m: Mat, D: number, L: number, H: number, Rh: number, ov = 3, drop = 1.2) {
  const Dr = D + ov, s = Rh / Dr, n = Math.hypot(1, s), ye = L + ov;
  cx.P.push(custom([-Dr - 1, -ye - 1, H - drop - 1], [Dr + 1, ye + 1, H + Rh + 1], (x, y, z) => Math.max(((z - H) - Rh + s * Math.abs(x)) / n, H - drop - z, Math.abs(y) - ye), m, { k: 0.3 }));
}
/** A band on the front slope of such a roof, t0..t1 along it from the eave to the ridge, w wide at y0. */
function roofBand(cx: Cx, m: Mat, D: number, H: number, Rh: number, ov: number, y0: number, w: number, t0: number, t1: number, off = 0.3) {
  const Dr = D + ov, s = Rh / Dr, n = Math.hypot(1, s);
  cx.P.push(custom([0, y0 - w / 2 - 1, H - 1], [Dr + 2, y0 + w / 2 + 1, H + Rh + 1], (x, y, z) => Math.max(Math.abs(((z - H) - Rh + s * x) / n - off) - 0.5, Math.abs(y - y0) - w / 2, -x, Math.abs(z - (H + (Rh * (t0 + t1)) / 2)) - (Rh * (t1 - t0)) / 2), m, { k: 0.12 }));
}
/** Chips and splinters flung out by a blow (frame 12) and a few dust puffs. */
function chips(cx: Cx, pal: Pal, R: number, n = 8, dust = true) {
  for (let i = 0; i < n; i++) { const a = hs(i, 5) * Math.PI * 2, d = R * (0.55 + hs(i, 9) * 0.5); cx.P.push(rbox([Math.cos(a) * d * 0.6 + 4, Math.sin(a) * d, 4 + hs(i, 2) * 11], [1.5 + hs(i, 3) * 1.8, 0.5, 0.4], 0.15, wd(i % 3 ? pal.wall : pal.wallD), { yaw: i * 1.3, pitch: i * 0.7, k: 0.05 })); }
  if (dust) for (let i = 0; i < 5; i++) cx.P.push(sphere([10 + hs(i, 4) * 6, (hs(i, 6) - 0.5) * R * 1.6, 1.4 + hs(i, 8) * 3], 1.5 + hs(i, 1), dk(0xb8ae98, 0.8, 1.1), { k: 0.4 }));
}

// ================================================================ barracks
function barracks(cx: Cx, clan: WorkClan, ph: number) {
  const { P } = cx, a = PAL[clan], fl = 0.5 + 0.5 * Math.sin(ph * 2 + 1);
  switch (clan) {
    case "wardens": {
      const D = 13, L = 34, H = 22, Rh = 13;
      P.push(rbox([0, 0, 1.6], [D + 1.2, L + 1.2, 1.6], 0.5, stoneM(a.stone), { k: 0.1 }));
      P.push(rbox([0, 0, 3 + (H - 3) / 2], [D, L, (H - 3) / 2], 0.4, wd(a.wall, vplank(2.6)), { k: 0.1 }));
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) P.push(cap([sx * D, sy * L, 1], [sx * D, sy * L, H + 1.5], 1.4, 1.3, wd(a.wallD), { k: 0.1 }));
      for (const z of [8.5, H - 0.6]) P.push(rbox([D + 0.3, 0, z], [0.7, L, 0.8], 0.2, wd(a.wallD), { k: 0.1 }));
      for (const y of [-22, -10, 10, 22]) P.push(cap([D + 0.2, y, 3], [D + 0.2, y, H], 0.7, 0.7, wd(a.wallD), { k: 0.1 })); // door-side studs
      for (const y of [-17, 17]) { P.push(rbox([D, y, 11], [2.5, 3, 2.6], 0.4, DARK(), { cut: true, k: 0.3 })); P.push(rbox([D + 0.6, y - 3.8, 11], [0.5, 1.2, 2.8], 0.2, wd(a.wallD), { k: 0.1 }), rbox([D + 0.6, y + 3.8, 11], [0.5, 1.2, 2.8], 0.2, wd(a.wallD), { k: 0.1 }), rbox([D + 0.8, y, 8.2], [1.4, 3.6, 0.6], 0.2, wd(a.wallD), { k: 0.1 })); }
      gable(cx, dk(a.roof, 0.45, 1.45, { grain: 0.3, tex: shingle(3.2, 2.2) }), D, L, H, Rh, 3.5);
      roofBand(cx, cloth(a.cloth), D, H, Rh, 3.5, 0, 11, 0.12, 0.55); // the clan cloth hung over the door gable
      roofBand(cx, cloth(a.trim), D, H, Rh, 3.5, 0, 11, 0.55, 0.62, 0.45);
      P.push(cap([0, -L - 3, H + Rh + 0.5], [0, L + 3, H + Rh + 0.5], 1.6, 1.6, wd(a.wallD), { k: 0.1 }));
      door(cx, D, 0, 3 + 7.2, 4.5, 4.8, 7.2);
      for (const s of [-1, 1]) pole(cx, D + 0.8, s * 5.6, 3, 17, a.wallD, 1.1);
      P.push(rbox([D + 0.8, 0, 17.6], [1.2, 6.8, 1.0], 0.3, wd(a.wallD), { k: 0.1 }), rbox([D + 2.4, 0, 1.1], [2.4, 6, 1.1], 0.3, stoneM(a.stone), { k: 0.1 }));
      P.push(ell([D + 1.6, 0, 21], [0.8, 3.6, 3.6], gold(), { k: 0.2 })); // the sigil shield over the door
      P.push(cap([D + 1, 7.5, 17.2], [D + 4, 7.5, 17.2], 0.4, 0.4, iron(), { k: 0.1 }), sphere([D + 4, 7.5, 15.8], 1.2, glowM(a.glow), { k: 0.1 }));
      cx.halos.push({ p: [D + 4, 7.5, 15.8], r: 6, col: a.glow, a: 0.4 + 0.2 * fl });
      for (const y of [-30, -35, -40, 30, 35, 40]) stake(cx, D + 4, y, 12 + hs(y, 1) * 3, 0x7a5a38, (y > 0 ? 1 : -1) * 0.6);
      for (const s of [-1, 1]) P.push(rbox([D + 4, s * 35, 7], [0.5, 6, 0.6], 0.2, wd(a.wallD), { k: 0.1 }));
      pole(cx, D - 2, -L + 2, H + 6, H + Rh + 17, a.wallD, 0.9); P.push(sphere([D - 2, -L + 2, H + Rh + 17.6], 1.2, gold(), { k: 0.1 }));
      flag(cx, D - 2, -L + 2.6, H + Rh + 16, 15, 11, a.cloth, a.trim, ph);
      break;
    }
    case "redfang": {
      const D = 15, L = 33, Rh = 21;
      gable(cx, dk(a.roof, 0.45, 1.45, { grain: 0.4, tex: patchy(3.4, 0.2) }), D, L, 4, Rh, 1.5, 4);
      for (const [y, w, t0, t1] of [[-21, 9, 0.18, 0.55], [12, 7, 0.45, 0.85], [26, 8, 0.1, 0.4], [-6, 6, 0.6, 0.92]] as const) roofBand(cx, cloth(a.cloth), D, 4, Rh, 1.5, y, w, t0, t1, 0.35);
      for (const y of [-27, -15, -3, 9, 21, 31]) roofBand(cx, dk(0xb49a6a, 0.45, 1.3, { grain: 0.3 }), D, 4, Rh, 1.5, y, 0.9, 0.02, 0.96, 0.5); // rope lashings
      P.push(cap([0, -L - 7, 4 + Rh + 0.5], [0, L + 7, 4 + Rh + 0.5], 1.5, 1.3, wd(0x2a1c14), { k: 0.1 }));
      for (const s of [-1, 1]) { P.push(cap([0, s * (L - 1), 17], [1, s * (L + 5), 31], 1, 0.8, wd(0x2a1c14), { k: 0.1 }), cap([0, s * (L + 5), 17], [1, s * (L - 1), 31], 1, 0.8, wd(0x2a1c14), { k: 0.1 })); skull(cx, [1.4, s * (L + 6.4), 25.8], 1.5); }
      door(cx, D - 1, 0, 6.5, 5, 4.4, 7);
      for (const s of [-1, 1]) P.push(cap([D - 1, s * 5.4, 0], [D - 1, s * 4.8, 15], 1.2, 1.1, wd(0x2a1c14), { k: 0.1 }));
      P.push(rbox([D - 1, 0, 14.6], [1.2, 6.2, 1.1], 0.3, wd(0x2a1c14), { k: 0.1 }));
      skull(cx, [D, 0, 18.6], 1.8);
      P.push(cap([D + 2, -8.4, 0], [D + 2, -8.4, 12], 0.7, 0.6, wd(0x2a1c14), { k: 0.1 })); fire(cx, D + 2, -8.4, 13.6, 1.6, a.glow, fl, 5); // torch
      for (const y of [-12, 12]) P.push(rbox([D + 1.4, y, 3.4], [1.2, 2.2, 1.2], 0.2, wd(0x5a3820), { yaw: y * 0.01, k: 0.1 })); // crates by the door
      for (const [y, s] of [[-36, -1], [-41, -1], [36, 1], [41, 1]] as const) { P.push(cap([D + 2, y, 0], [D + 9, y + s * 1, 9], 1.2, 0.9, wd(0x4a3420), { k: 0.1 }), cone([D + 8.4, y + s * 0.9, 8.6], [D + 11.4, y + s * 1.2, 11.6], 1.1, iron(), { k: 0.05 })); }
      for (const s of [-1, 1]) { pole(cx, D + 3, s * 30, 0, 40, 0x2a1c14, 0.8); flag(cx, D + 3, s * 30, 39, 11 * s, 8, a.cloth, a.trim, ph + (s > 0 ? 1.2 : 0), s); }
      break;
    }
    case "host": {
      const D = 15, L = 32, H = 9;
      P.push(rbox([0, 0, 1.5], [D + 2, L + 2, 1.5], 0.5, stoneM(a.stone), { k: 0.1 }));
      P.push(rbox([0, 0, 3 + (H - 3) / 2], [D - 1, L, (H - 3) / 2], 0.4, wd(a.wall, vplank(2.4)), { k: 0.1 }));
      P.push(custom([-D - 1, -L - 2, H - 2], [D + 1, L + 2, H + D + 1], (x, y, z) => Math.max(Math.hypot(x, z - H) - D, H - 1.5 - z, Math.abs(y) - L - 1), dk(a.roof, 0.45, 1.5, { grain: 0.3, tex: stripes(3.1, 0.06) }), { k: 0.3 }));
      for (let i = 0; i <= 8; i++) { const y = -L + 4 + i * ((2 * L - 8) / 8), pts: V3[] = []; for (let j = 0; j <= 10; j++) { const t = (j / 10) * Math.PI; pts.push([Math.cos(t) * (D + 0.6), y, H + Math.sin(t) * (D + 0.6)]); } P.push(...chain(pts, 0.95, 0.95, bone())); }
      P.push(...chain([[0, -L - 1, H + D + 0.9], [0, 0, H + D + 1.1], [0, L + 1, H + D + 0.9]], 0.85, 0.85, bone()));
      for (let i = 0; i < 12; i++) { const y = -L + 3 + i * ((2 * L - 6) / 11); P.push(cone([D - 0.4, y, H], [D - 0.2, y, H - 3.4], 0.6, bone())); }
      P.push(custom([-1, -5.2, 0], [D + 2, 5.2, 18], (x, y, z) => Math.max(Math.hypot(y / 5.2, (z - 2) / 12.4) - 1, D - 6 - x) * 5, dk(0x0c1412, 0.8, 1.2), { k: 0.5, cut: true }));
      P.push(rbox([D - 5.6, 0, 6], [0.6, 4, 6], 0.3, glowM(0x2f9f84), { k: 0.1 }));
      cx.halos.push({ p: [D - 3, 0, 6], r: 10, col: TEAL, a: 0.3 + 0.15 * fl });
      { const pts: V3[] = []; for (let j = 0; j <= 10; j++) { const t = (j / 10) * Math.PI; pts.push([D + 0.4, Math.cos(t) * 5.8, 2 + Math.sin(t) * 12.6]); } P.push(...chain(pts, 0.9, 0.9, bone())); }
      for (const s of [-1, 1]) { pole(cx, D + 2, s * 9.4, 3, 17, 0x4a4038, 0.8); skull(cx, [D + 2, s * 9.4, 18.4], 1.7, 0x9ffff0); cx.halos.push({ p: [D + 3.6, s * 9.4, 18.4], r: 4, col: TEAL, a: 0.4 }); }
      P.push(rbox([D + 3, 0, 1.2], [3, 7, 1.2], 0.3, stoneM(a.stone), { k: 0.1 }));
      pole(cx, D - 4, -L + 3, H + 6, 46, 0x4a4038, 1.1); skull(cx, [D - 4, -L + 3, 48], 2.4, 0x9ffff0); cx.halos.push({ p: [D - 2, -L + 3, 48], r: 8, col: TEAL, a: 0.5 });
      flag(cx, D - 4, -L + 4, 44, 14, 12, PALE, a.trim, ph);
      for (const s of [-1, 1]) P.push(...chain([[0, s * (L - 1), H + D - 2], [1, s * (L + 3), H + D + 5], [1, s * (L + 1), H + D + 12]], 1.5, 0.4, bone())); // ridge horns
      for (let i = 0; i < 3; i++) { const w = ph + i * 2.1; P.push(sphere([D + 4 + Math.sin(w) * 2, -20 + i * 18 + Math.cos(w) * 2, 22 + i * 3 + Math.sin(w * 1.3) * 2], 0.9, glowM(0x9ffff0), { k: 0.2 })); cx.halos.push({ p: [D + 4, -20 + i * 18, 22 + i * 3], r: 4, col: TEAL, a: 0.3 }); }
      break;
    }
    case "hidekin": {
      const D = 16, L = 37;
      P.push(ell([0, 0, 0], [D, L, 20], dk(0x4e3222, 0.45, 1.45, { grain: 0.35 }), { k: 1 }));
      for (let i = 0; i < 20; i++) { const u = hs(i, 2), v = hs(i, 4), yy = (u - 0.5) * 2 * (L - 3), xx = (v - 0.3) * D * 1.5, h = 20 * Math.max(0, 1 - Math.hypot(xx / D, yy / L)); P.push(sphere([xx, yy, h * 0.9], 2 + v * 2, i % 3 ? dk(0x6e4a30, 0.45, 1.4, { grain: 0.3 }) : dk(0x4e3222, 0.45, 1.4, { grain: 0.3 }), { k: 0.8 })); }
      for (const [y, v, r] of [[-26, 0.3, 5], [-12, 0.7, 6], [14, 0.4, 5.5], [28, 0.6, 5], [4, 1.05, 4.6]] as const) { const h = 20 * Math.sqrt(Math.max(0, 1 - (y / L) ** 2)) * 0.62, x = D * Math.sqrt(Math.max(0, 1 - (h / 20) ** 2 - (y / L) ** 2)) * 0.97; P.push(ell([x, y, h], [3.4, r, r * 0.8], dk(v > 0.5 ? 0x8a5f2a : 0x6a4624, 0.45, 1.35, { grain: 0.4 }), { k: 0.5 })); }
      for (const y of [-30, -20, -10, 10, 20, 30]) { const pts: V3[] = []; for (let j = 0; j <= 10; j++) { const t = (j / 10) * Math.PI, yy = y * Math.sqrt(Math.max(0, 1 - (Math.cos(t) * 0.8) ** 2)); pts.push([Math.cos(t) * (D + 0.5), yy, Math.sin(t) * (20 * Math.sqrt(Math.max(0, 1 - (y / L) ** 2)) + 0.8)]); } P.push(...chain(pts, 0.8, 0.8, bone())); }
      for (let i = 0; i < 9; i++) { const y = -28 + i * 7, r = Math.sin(i * 7.3) * 0.5; P.push(...chain([[-2, y, 17], [-1 + r * 4, y + r * 3, 23], [r * 6, y + r * 6, 27]], 0.6, 0.2, wd(0x4a3018))); }
      P.push(custom([-1, -6, 0], [D + 2, 6, 14], (x, y, z) => Math.max(Math.hypot(y / 5.8, z / 11) - 1, 5 - x) * 6, dk(0x0b0705, 1, 1.4), { k: 0.6, cut: true }));
      P.push(ell([D - 2, 0, 0], [3, 5.4, 1.4], dk(0x2a1a10, 0.6, 1.4, { grain: 0.4 }), { k: 0.5 }));
      cx.halos.push({ p: [D - 4, 0, 4], r: 9, col: 0xb06a2a, a: 0.14 + 0.1 * fl });
      for (const s of [-1, 1]) { P.push(...chain([[D + 0.5, s * 8, 0], [D + 1.6, s * 9.4, 8], [D + 1.8, s * 7.6, 15], [D + 1.4, s * 3.4, 19]], 1.7, 0.35, dk(0xe2c79a, 0.45, 1.2, { grain: 0.15, spec: 0.15 }))); }
      P.push(rbox([D - 0.4, 11, 7.4], [0.7, 3, 6], 0.3, dk(0x8a5f2a, 0.45, 1.35, { grain: 0.4 }), { roll: 0.05, k: 0.1 })); // a hide flap
      skull(cx, [D + 0.6, 0, 22.4], 1.9); cx.P.push(cap([D, 0, 19], [D, 0, 21], 0.5, 0.5, wd(0x4a3018)));
      for (const s of [-1, 1]) { pole(cx, D + 4, s * 18, 0, 25, 0xe2c79a, 0.9); skull(cx, [D + 4, s * 18, 27], 1.6); }
      pole(cx, 3, -L + 6, 14, 46, 0xe2c79a, 0.9); P.push(sphere([3, -L + 6, 46.4], 1.3, bone(), { k: 0.1 }));
      flag(cx, 3.4, -L + 6.6, 45, 15, 11, a.cloth, a.trim, ph);
      P.push(cone([-4, 14, 19], [-4, 14, 27], 1.7, dk(0x2a2622, 0.6, 1.4), { k: 0.1 })); cx.halos.push({ p: [-4, 14, 26], r: 4, col: 0xff8a30, a: 0.22 + 0.12 * fl });
      break;
    }
    case "veiled": {
      const D = 14, L = 34, H = 15, Rh = 19;
      P.push(rbox([0, 0, 1.4], [D + 3.4, L + 3.4, 1.4], 0.5, stoneM(a.stone), { k: 0.1 }));
      P.push(rbox([0, 0, 2.8 + (H - 2.8) / 2], [D, L, (H - 2.8) / 2], 0.4, dk(a.wall, 0.45, 1.4, { grain: 0.2, tex: stripes(3, 0.08) }), { k: 0.1 }));
      gable(cx, dk(a.roof, 0.45, 1.45, { grain: 0.2, tex: patchy(5, 0.07) }), D, L, H, Rh, 3);
      for (const y of [-30, -18, -6, 6, 18, 30]) roofBand(cx, cloth(a.cloth), D, H, Rh, 3, y, 4.4, 0.02, 0.97, 0.3);
      P.push(rbox([D + 0.5, 0, H - 2.4], [0.7, L, 1.6], 0.3, cloth(a.cloth), { k: 0.1 }), cap([D + 1.1, -L, H - 0.7], [D + 1.1, L, H - 0.7], 0.5, 0.5, gold(), { k: 0.05 }), cap([D + 1.1, -L, H - 4.1], [D + 1.1, L, H - 4.1], 0.4, 0.4, gold(), { k: 0.05 }));
      P.push(cap([0, -L - 3, H + Rh + 0.5], [0, L + 3, H + Rh + 0.5], 1.2, 1.2, gold(), { k: 0.05 }));
      for (const s of [-1, 1]) { P.push(sphere([0, s * (L + 3.4), H + Rh + 0.6], 2.2, gold(), { k: 0.2 })); pole(cx, 0, s * (L + 3.4), H + Rh + 2, H + Rh + 14, a.trim, 0.5); flag(cx, 0, s * (L + 3.4), H + Rh + 13, 5 * s, 5, a.cloth, a.sigil, ph + (s > 0 ? 1.5 : 0), s); }
      door(cx, D, 0, 2.8 + 7.6, 4, 5.2, 7.6);
      P.push(rbox([D - 3.4, 0, 9], [0.4, 4.6, 6.6], 0.3, glowM(0x6a3aa8), { k: 0.1 })); cx.halos.push({ p: [D - 2, 0, 9], r: 9, col: 0xb070ff, a: 0.22 + 0.12 * fl });
      for (const s of [-1, 1]) P.push(rbox([D + 0.5, s * 6.4, 10.6], [0.6, 2.2, 8], 0.3, cloth(a.cloth), { k: 0.1 }), cap([D + 1.2, s * 4.2, 2.8], [D + 1.2, s * 4.2, 18.6], 0.4, 0.4, gold(), { k: 0.05 }));
      P.push(rbox([D + 6, 0, 22.6], [6.4, 9, 0.5], 0.3, dk(a.wall, 0.45, 1.4, { grain: 0.2, tex: stripes(3, 0.08) }), { pitch: 0.28, k: 0.1 }), rbox([D + 11.8, 0, 20.6], [0.7, 9, 1.4], 0.3, cloth(a.cloth), { k: 0.1 }));
      for (const s of [-1, 1]) P.push(cap([D + 11, s * 8.4, 2.8], [D + 11, s * 8.4, 21], 0.55, 0.5, gold(), { k: 0.05 }), sphere([D + 11, s * 8.4, 21.4], 0.9, gold(), { k: 0.1 }));
      for (const s of [-1, 1]) { const x = D + 7.4, y = s * 27; P.push(rbox([x, y, 7.4], [1.5, 2.8, 6.4], 0.4, stoneM(0x8a7a5a), { k: 0.1 })); for (let i = 0; i < 3; i++) P.push(rbox([x + 1.5, y + (i - 1) * 1.7, 7 + (i % 2) * 2.6], [0.3, 0.45, 1.3], 0.1, glowM(i === 1 ? 0xffd060 : 0xb070ff), { k: 0.05 })); cx.halos.push({ p: [x + 1.6, y, 8], r: 6, col: i0(s, fl), a: 0.35 + 0.2 * fl }); }
      break;
    }
  }
}
const i0 = (s: number, fl: number) => (s > 0 ? (fl > 0.5 ? 0xb070ff : 0xc490ff) : 0xb070ff);

// ================================================================ stores (a lean-to over goods)
function crate(cx: Cx, x: number, y: number, z: number, s: number, col: number, yaw = 0) {
  cx.P.push(rbox([x, y, z + s / 2], [s / 2, s / 2, s / 2], 0.3, wd(col, vplank(2)), { yaw, k: 0.1 }), rbox([x, y, z + s / 2], [s / 2 + 0.1, s / 2 + 0.1, 0.45], 0.1, wd(mixc(col, 0, 0.45)), { yaw, k: 0.05 }));
}
function sack(cx: Cx, x: number, y: number, z: number, r: number, col: number) {
  cx.P.push(ell([x, y, z + r * 0.8], [r, r * 0.9, r * 0.85], dk(col, 0.45, 1.3, { grain: 0.35 }), { k: 0.5 }), cap([x, y, z + r * 1.5], [x, y, z + r * 2.0], r * 0.35, r * 0.25, dk(mixc(col, 0, 0.3), 0.5, 1.2), { k: 0.1 }));
}
function barrel(cx: Cx, x: number, y: number, z: number, r: number, h: number, col: number) {
  cx.P.push(cap([x, y, z], [x, y, z + h], r, r, wd(col), { k: 0.2 }), sphere([x, y, z + h / 2], r * 1.07, wd(col), { k: 0.3 }));
  for (const f of [0.2, 0.8]) cx.P.push(torus([x, y, z + h * f], r * 0.98, 0.35, iron(), { k: 0.05 }));
}
function stores(cx: Cx, clan: WorkClan, ph: number) {
  const { P } = cx, a = PAL[clan], fl = 0.5 + 0.5 * Math.sin(ph * 2 + 1);
  const D = 10, L = 17;
  // the roof: one plane falling toward the front; the high back wall behind
  const slab = (m: Mat, zf: number, zb: number, ov = 2, th = 0.9) => {
    const sl = (zb - zf) / (2 * D), n = Math.hypot(1, sl), zm = (z: number, x: number) => z - (zf + (D - x) * sl);
    P.push(custom([-D - ov - 1, -L - ov - 1, zf - 3], [D + ov + 1, L + ov + 1, zb + 3], (x, y, z) => Math.max(Math.abs(zm(z, x)) / n - th, Math.abs(x) - D - ov, Math.abs(y) - L - ov), m, { k: 0.2 }));
  };
  const zf = 22, zb = 27;
  const backWall = (m: Mat) => P.push(rbox([-D + 0.4, 0, 12], [0.9, L - 0.4, 12], 0.3, m, { k: 0.1 }));
  const post = (col: number) => { for (const sy of [-1, 1]) { pole(cx, D - 0.6, sy * (L - 0.6), 0, zf + 0.6, col, 1.2); pole(cx, -D + 0.8, sy * (L - 0.6), 0, zb + 0.6, col, 1.2); } };
  switch (clan) {
    case "wardens":
      P.push(rbox([-1, 0, 0.7], [D + 1, L + 1, 0.7], 0.3, stoneM(a.stone), { k: 0.1 }));
      backWall(wd(a.wall, vplank(2.4))); post(a.wallD); slab(dk(a.roof, 0.45, 1.45, { grain: 0.3, tex: shingle(3.2, 2.2) }), zf, zb);
      roofBand2(cx, a.cloth, zf, zb, D, L); P.push(rbox([D - 0.4, 0, zf - 1.8], [0.6, L, 0.9], 0.2, cloth(a.cloth), { k: 0.1 }));
      crate(cx, -5, -11, 1.2, 8, a.wall, 0.1); crate(cx, -5, -2, 1.2, 7, 0x7a5a38, -0.1); crate(cx, -4.6, -6.6, 9.2, 6, 0x7a5a38, 0.2);
      barrel(cx, -4, 9, 1.2, 3.8, 9, 0x5a3820); barrel(cx, 2, 13, 1.2, 3.4, 8, 0x6a4528); sack(cx, 3, -12, 1.2, 4, 0xc9b27a); sack(cx, 4, -5, 1.2, 3.6, 0xb8a06a); sack(cx, 1, 3, 1.2, 3.8, 0xc9b27a);
      P.push(cap([D - 1, 0, zf - 2.4], [D - 1, 0, zf - 5.4], 0.3, 0.3, iron())); P.push(sphere([D - 1, 0, zf - 6.4], 1.2, glowM(a.glow), { k: 0.1 })); cx.halos.push({ p: [D - 1, 0, zf - 6.4], r: 6, col: a.glow, a: 0.35 + 0.2 * fl });
      break;
    case "redfang":
      backWall(wd(a.wall, patchy(3, 0.2))); post(0x2a1c14); slab(dk(a.roof, 0.45, 1.45, { grain: 0.4, tex: patchy(3.4, 0.2) }), zf, zb);
      roofBand2(cx, a.cloth, zf, zb, D, L);
      for (const y of [-8, 8]) P.push(cap([D + 2, y, 0], [D + 5, y, 8], 1, 0.7, wd(0x4a3420), { k: 0.1 }), cone([D + 5, y, 7.6], [D + 7, y, 10.6], 0.9, iron(), { k: 0.05 }));
      crate(cx, -5, -11, 1.2, 8, 0x5a3820, 0.1); crate(cx, -4, 11, 1.2, 8, 0x4a3022, -0.2); sack(cx, 3, -5, 1.2, 4, 0xa08a5a); sack(cx, 4, 4, 1.2, 3.6, 0x7a6a48); sack(cx, -3, 0, 1.2, 4.4, 0xa08a5a);
      P.push(rbox([2, 12, 3.6], [3.4, 3, 2.6], 0.4, wd(0x5a3820), { k: 0.2 }), cap([-1.4, 12, 6.2], [5.4, 12, 6.2], 2.8, 2.8, wd(0x6a4528), { k: 0.4 }), rbox([2, 12, 3.8], [3.5, 3.1, 0.3], 0.1, iron(), { k: 0.05 }));
      for (let i = 0; i < 9; i++) P.push(sphere([6 + (i % 3) * 1.1, 6 + (i >> 1) * 0.7, 1.6 + (i % 4) * 0.3], 0.6, gold(), { k: 0.3 }));
      skull(cx, [D - 1, 0, zf - 3], 1.4);
      break;
    case "host":
      backWall(wd(a.wall, vplank(2.4))); P.push(rbox([-D + 1.2, 0, 22], [0.5, L - 1, 1.4], 0.2, bone(), { k: 0.05 })); post(0x4a4038);
      slab(dk(a.roof, 0.45, 1.5, { grain: 0.3, tex: stripes(3, 0.06) }), zf, zb);
      for (let i = -2; i <= 2; i++) { const y = i * 6.6; P.push(...chain([[D + 1, y, zf - 0.6], [0, y, (zf + zb) / 2 + 1.6], [-D, y, zb + 0.6]], 0.8, 0.8, bone())); }
      for (let i = 0; i < 8; i++) P.push(cone([D + 1.4, -L + 2 + i * 4.8, zf - 0.8], [D + 1.4, -L + 2 + i * 4.8, zf - 3.6], 0.6, bone()));
      crate(cx, -5, -11, 1.2, 7.4, a.wall, 0.1); crate(cx, -5, -3, 1.2, 7, 0x3a3228, -0.1);
      for (const [y, r] of [[8, 3.6], [13, 3]] as const) { P.push(ell([-1, y, 1.2 + r * 1.2], [r, r, r * 1.3], dk(0x2f3836, 0.5, 1.4, { grain: 0.2, spec: 0.2 }), { k: 0.4 }), ell([-1, y, 1.2 + r * 2.4], [r * 0.6, r * 0.6, r * 0.5], glowM(0x2f9f84), { k: 0.2 })); cx.halos.push({ p: [-1, y, 1.2 + r * 2.4], r: 5, col: TEAL, a: 0.35 + 0.15 * fl }); }
      skull(cx, [4, -8, 1.2 + 1.6], 1.6, 0x9ffff0); for (let i = 0; i < 6; i++) P.push(cap([2 + i * 1.2, -2 + (i % 2) * 2, 1.4], [3 + i * 1.2, -1 + (i % 2) * 2, 1.7], 0.4, 0.35, bone(), { k: 0.1 }));
      P.push(rbox([4, 3, 3.6], [2.6, 2.6, 2.4], 0.4, wd(0x3a3228), { k: 0.1 }), ell([4, 3, 6.4], [2.6, 2.6, 0.7], glowM(0x2f9f84), { k: 0.1 }));
      break;
    case "hidekin":
      backWall(dk(a.wall, 0.45, 1.35, { grain: 0.4, tex: patchy(3, 0.2) })); post(0xe2c79a);
      slab(dk(0x4e3222, 0.45, 1.45, { grain: 0.4 }), zf, zb, 2, 1.6); for (let i = 0; i < 14; i++) P.push(sphere([(hs(i, 1) - 0.5) * 2 * D, (hs(i, 2) - 0.5) * 2 * L, zb - (D - ((hs(i, 1) - 0.5) * 2 * D)) * 0.25 + 1.3], 1.8 + hs(i, 3) * 1.4, i % 3 ? dk(0x6e4a30, 0.45, 1.4, { grain: 0.3 }) : dk(0x56622e, 0.45, 1.4, { grain: 0.3 }), { k: 0.6 })); // a sod roof
      for (let i = 0; i < 6; i++) P.push(cone([D + 0.6, -L + 4 + i * 6.2, zf - 1], [D + 0.9, -L + 4 + i * 6.2, zf - 4], 0.7, bone()));
      for (const [y, r] of [[-11, 4], [-3, 3.6], [6, 4.2]] as const) P.push(ell([2, y, 1.2 + r * 0.8], [r, r * 1.05, r * 0.85], dk(0x8a5f2a, 0.45, 1.35, { grain: 0.4 }), { k: 0.5 }), torus([2, y, 1.2 + r * 1.5], r * 0.4, 0.3, dk(0xb49a6a), { k: 0.05 }));
      barrel(cx, -4, 12, 1.2, 3.4, 8, 0x8a5e30); P.push(ell([4, 13, 3], [3, 3, 3.4], dk(0xa86a3a, 0.45, 1.35, { grain: 0.3 }), { k: 0.4 })); // clay jar
      for (let i = 0; i < 4; i++) P.push(cap([5 - i * 0.2, -L + 6 + i * 3.4, zf - 2], [5 - i * 0.2, -L + 6 + i * 3.4, zf - 8 - (i % 2) * 2], 0.5, 0.6, dk(0x8a3a2a, 0.5, 1.3, { grain: 0.4 }), { k: 0.2 })); // dried meat on a line
      skull(cx, [D, 0, zf - 3.4], 1.5); P.push(cone([-6, 10, 1.2], [-6, 10, 10], 1.2, bone()), cone([-3, -8, 1.2], [-3, -8, 8], 1.0, bone()));
      break;
    case "veiled":
      P.push(rbox([-1, 0, 0.7], [D + 1.4, L + 1.4, 0.7], 0.3, stoneM(a.stone), { k: 0.1 }));
      backWall(dk(a.wall, 0.45, 1.4, { grain: 0.2, tex: stripes(3, 0.08) })); post(0xe0a030); for (const sy of [-1, 1]) P.push(sphere([D - 0.6, sy * (L - 0.6), zf + 1.6], 1.1, gold(), { k: 0.1 }));
      slab(dk(a.roof, 0.45, 1.45, { grain: 0.2 }), zf, zb);
      for (const y of [-12, 0, 12]) { const sl = (zb - zf) / (2 * D); P.push(custom([-D, y - 3, zf], [D + 3, y + 3, zb + 2], (x, yy, z) => Math.max(Math.abs(z - (zf + (D - x) * sl) - 1.0) - 0.4, Math.abs(yy - y) - 2.2, Math.abs(x) - D - 2), cloth(a.cloth), { k: 0.1 })); }
      P.push(rbox([D + 1.4, 0, zf - 1.2], [0.7, L + 1, 1.6], 0.3, cloth(a.cloth), { k: 0.1 }), cap([D + 2, -L - 1, zf - 2.8], [D + 2, L + 1, zf - 2.8], 0.4, 0.4, gold(), { k: 0.05 }));
      for (const [y, r] of [[-11, 3.4], [-4, 3.8]] as const) P.push(ell([-3, y, 1.2 + r * 1.3], [r, r, r * 1.3], dk(0xa86a3a, 0.45, 1.35, { grain: 0.3 }), { k: 0.4 }), cap([-3, y, 1.2 + r * 2.4], [-3, y, 1.2 + r * 2.9], r * 0.6, r * 0.5, gold(), { k: 0.1 }));
      P.push(cap([2, 8, 4], [2, 14, 4], 2.4, 2.4, dk(0x8a3a9a, 0.45, 1.4, { grain: 0.2 }), { k: 0.3 }), cap([4, 9, 4], [4, 15, 4], 2.4, 2.4, cloth(a.cloth), { k: 0.3 })); // rolled carpets
      P.push(rbox([0, 8, 7.6], [3.8, 3.6, 2.8], 0.5, wd(0x3a3a82), { k: 0.2 }), rbox([0, 8, 10.6], [3.9, 3.7, 0.3], 0.1, gold(), { k: 0.05 }));
      for (let i = 0; i < 3; i++) P.push(rbox([3.4, 6.6 + i * 1.8, 7.4 + (i % 2) * 2.4], [0.3, 0.45, 1.1], 0.1, glowM(0xb070ff), { k: 0.05 }));
      cx.halos.push({ p: [3.6, 8, 8], r: 7, col: 0xb070ff, a: 0.3 + 0.2 * fl });
      break;
  }
}
/** Two cloth bands down the lean-to roof in the clan colours. */
function roofBand2(cx: Cx, col: number, zf: number, zb: number, D: number, L: number) {
  const sl = (zb - zf) / (2 * D);
  for (const y of [-9, 9]) cx.P.push(custom([-D, y - 3, zf], [D + 3, y + 3, zb + 2], (x, yy, z) => Math.max(Math.abs(z - (zf + (D - x) * sl) - 1.0) - 0.4, Math.abs(yy - y) - 2.4, Math.abs(x) - D - 2), cloth(col), { k: 0.1 }));
  void L;
}

// ================================================================ weapon rack (with a brazier)
function rack(cx: Cx, clan: WorkClan, ph: number) {
  const { P } = cx, a = PAL[clan], fl = 0.5 + 0.5 * Math.sin(ph * 2 + 1), fl2 = 0.5 + 0.5 * Math.sin(ph * 3 + 2);
  const wood = clan === "host" ? 0x3a3228 : clan === "veiled" ? 0x6a4a30 : clan === "hidekin" ? 0x5a4028 : clan === "redfang" ? 0x4a3022 : 0x6b4a2a;
  const Y = 9;
  // frame: two uprights, two crossbars, feet
  for (const s of [-1, 1]) { P.push(cap([0, s * Y, 0], [0, s * Y, 22], 1.5, 1.3, wd(wood), { k: 0.1 }), rbox([0, s * Y, 0.9], [4.4, 1.6, 0.9], 0.3, wd(wood), { k: 0.1 })); P.push(sphere([0, s * Y, 22.6], 1.5, clan === "host" ? bone() : clan === "veiled" ? gold() : wd(wood), { k: 0.1 })); }
  P.push(cap([0, -Y, 17], [0, Y, 17], 1.1, 1.1, wd(wood), { k: 0.1 }), cap([0, -Y, 7.4], [0, Y, 7.4], 1.1, 1.1, wd(wood), { k: 0.1 }));
  const shaft = clan === "host" ? bone() : wd(0x8a6a44);
  const head = clan === "host" ? bone() : clan === "hidekin" ? bone() : iron();
  const lean = (y: number, h: number, sw: number) => { P.push(cap([3.4, y, 0.6], [1.2 - sw, y + sw * 0.6, h], 0.65, 0.55, shaft, { k: 0.1 }), cone([1.2 - sw, y + sw * 0.6, h - 0.4], [0.9 - sw, y + sw * 0.7, h + 5.4], 1.1, head, { k: 0.05 })); };
  // spears leaning on the top bar (swords / axes for some clans lower down)
  for (let i = 0; i < 4; i++) lean(-Y + 3 + i * 2.4, 34 - (i % 2) * 3, 1.4 + (i % 2) * 0.6);
  if (clan === "redfang") for (let i = 0; i < 3; i++) { const y = 3 + i * 3; P.push(cap([2.4, y, 4], [2.4, y, 17.6], 0.55, 0.5, shaft, { k: 0.1 }), rbox([2.6, y - 2.2 * (i % 2 ? -1 : 1) * 0 + 1.6, 18.2], [0.3, 2.6, 1.9], 0.2, iron(), { k: 0.05 })); }
  else if (clan === "veiled") for (let i = 0; i < 3; i++) { const y = 3 + i * 3; P.push(cap([2.4, y, 4], [2.4, y, 22 + (i % 2) * 3], 0.5, 0.4, gold(), { k: 0.1 }), sphere([2.4, y, 23.6 + (i % 2) * 3], 1.4, glowM(i === 1 ? 0xffd060 : 0xb070ff), { k: 0.1 })); cx.halos.push({ p: [2.4, y, 23.6 + (i % 2) * 3], r: 5, col: 0xb070ff, a: 0.35 + 0.15 * fl2 }); }
  else for (let i = 0; i < 3; i++) { const y = 3 + i * 3; P.push(rbox([2.4, y, 11], [0.35, 0.8, 7.2], 0.2, iron(), { k: 0.05 }), rbox([2.4, y, 4.6], [0.4, 2.2, 0.5], 0.2, wd(wood), { k: 0.05 }), cap([2.4, y, 3.2], [2.4, y, 4.6], 0.5, 0.5, wd(0x3a2818), { k: 0.1 })); }
  // shields hung on the lower bar, facing the viewer
  const shield = (y: number, z: number, r: number, face: number, rim: number) => {
    P.push(cap([1.6, y, z], [2.8, y, z], r, r, wd(face), { k: 0.1 }), torus([2.4, y, z], r - 0.2, 0.55, clan === "host" ? bone() : wd(rim), { tilt: Math.PI / 2, k: 0.05 }), sphere([3, y, z], 1.3, clan === "host" ? bone() : iron(), { k: 0.1 }));
  };
  switch (clan) {
    case "wardens": shield(-6.6, 12, 5.2, a.cloth, a.trim); shield(0.4, 12, 5.2, a.trim, a.cloth); break;
    case "redfang": shield(-6.4, 12, 5, a.cloth, 0x1a1414); P.push(cone([3.4, -6.4, 12], [5.6, -6.4, 12], 0.9, iron(), { k: 0.05 })); break;
    case "host": shield(-6.6, 12, 5, 0x1f2422, BONE); skull(cx, [3.6, -6.6, 12.2], 1.8, 0x9ffff0); break;
    case "hidekin": shield(-6.4, 12, 5.2, 0x8a5f2a, 0xe2c79a); for (const s of [-1, 1]) P.push(cone([3.2, -6.4 + s * 2, 15], [4.6, -6.4 + s * 4, 18], 0.9, bone(), { k: 0.05 })); break;
    case "veiled": shield(-6.4, 12, 5.2, 0x2a2a5a, 0xe0a030); P.push(ell([3.4, -6.4, 12], [0.4, 1.6, 1.6], glowM(0xffd060), { k: 0.05 })); break;
  }
  if (clan === "wardens" || clan === "redfang") P.push(rbox([2.4, 7.2, 12], [0.7, 3.4, 4.2], 0.3, wd(0x5a3820), { k: 0.1 })); // a stack of spare handles
  // clan colours: a short cloth tied to the top bar
  flag(cx, 0.6, -Y + 1, 20, 9, 6, a.cloth, a.trim, ph);
  // the brazier on three legs beside it
  const by = 15.2;
  for (let i = 0; i < 3; i++) { const t = i * 2.094 + 0.5; P.push(cap([Math.cos(t) * 4.4, by + Math.sin(t) * 4.4, 0.4], [Math.cos(t) * 2.2, by + Math.sin(t) * 2.2, 8], 0.8, 0.7, iron(), { k: 0.1 })); }
  P.push(ell([0, by, 8.6], [4.6, 4.6, 2.2], clan === "hidekin" ? dk(0x8a5e30, 0.45, 1.35, { grain: 0.4 }) : iron(), { k: 0.3 }), torus([0, by, 9.6], 4.4, 0.5, iron(), { k: 0.05 }));
  const fc = clan === "host" ? 0x4fe8c0 : clan === "veiled" ? 0xb070ff : 0xff8a30;
  P.push(ell([0, by, 10], [3.4, 3.4, 1.0], dk(0x201814, 0.6, 1.3), { k: 0.2 }));
  fire(cx, 0, by, 11.4 + fl * 0.6, 2.6, fc, fl, 5);
  P.push(cone([0.6 + (fl2 - 0.5), by + (fl - 0.5), 12.6], [0.6 + (fl2 - 0.5) * 1.4, by + (fl - 0.5) * 1.8, 17.4 + fl2 * 1.6], 1.5, glowM(mixc(fc, 0xffffff, 0.2)), { k: 0.2 }));
}

// ================================================================ rubble heap with a smoke wisp
function rubble(cx: Cx, clan: WorkClan, f: number) {
  const { P } = cx, a = PAL[clan];
  P.push(ell([0, 0, 0.5], [11, 17, 4.6], clan === "hidekin" ? dk(0x4e3222, 0.45, 1.45, { grain: 0.35 }) : dk(clan === "veiled" ? 0xa08a5a : 0x3a3228, 0.45, 1.45, { grain: 0.4 }), { k: 0.8 }));
  const piece = (i: number, m: () => Prim) => { void i; P.push(m()); };
  switch (clan) {
    case "wardens":
      for (let i = 0; i < 9; i++) { const y = -13 + i * 3.3, yaw = (hs(i, 1) - 0.5) * 1.2, x = (hs(i, 2) - 0.5) * 6, z = 2 + (i % 3) * 1.9; P.push(rbox([x, y, z], [3 + hs(i, 3) * 4, 1.7, 1.7], 0.5, wd(i % 2 ? 0x7a5a38 : a.wall), { yaw, pitch: (hs(i, 4) - 0.5) * 0.5, k: 0.1 }), rbox([x + 5, y, z], [0.3, 1.5, 1.5], 0.2, wd(0xb09060), { yaw, k: 0.05 })); }
      for (const [x, y] of [[6, -12], [7, 10], [-6, 14]] as const) P.push(rbox([x, y, 2.4], [2.2, 2.2, 1.8], 0.7, stoneM(a.stone), { yaw: x, k: 0.2 }));
      P.push(cap([-6, -4, 2], [2, -2, 11], 1.4, 1.1, wd(a.wallD), { k: 0.1 }), cone([2, -2, 10.6], [3.4, -1.6, 13.4], 1.1, wd(a.wallD), { k: 0.05 }));
      clothFlat(cx, 8, 2, 8, 6, 0.5, a.cloth, a.trim);
      break;
    case "redfang":
      for (let i = 0; i < 9; i++) P.push(rbox([(hs(i, 2) - 0.5) * 7, -13 + i * 3.3, 2 + (i % 3) * 1.5], [3 + hs(i, 3) * 4, 1.5, 0.45], 0.15, wd(i % 2 ? 0x6a4528 : 0x4a3420), { yaw: (hs(i, 1) - 0.5) * 1.6, pitch: (hs(i, 4) - 0.5) * 0.7, roll: hs(i, 5) - 0.5, k: 0.1 }));
      clothFlat(cx, 5, -6, 11, 7, 0.4, a.cloth); clothFlat(cx, -3, 9, 8, 6, -0.6, 0x8a6c48);
      for (const y of [-6, 4, 12]) P.push(cone([0, y, 3], [1, y + 1, 9], 0.9, iron(), { k: 0.05 }));
      skull(cx, [7, 11, 2.6], 1.5); P.push(cap([-6, -9, 2], [3, -4, 14], 0.9, 0.7, wd(0x2a1c14), { k: 0.1 }));
      break;
    case "host":
      for (let i = 0; i < 8; i++) P.push(rbox([(hs(i, 2) - 0.5) * 7, -13 + i * 3.6, 2 + (i % 3) * 1.5], [3 + hs(i, 3) * 3.6, 1.5, 1.2], 0.4, wd(i % 2 ? a.wall : 0x4a4038), { yaw: (hs(i, 1) - 0.5) * 1.5, pitch: (hs(i, 4) - 0.5) * 0.6, k: 0.1 }));
      for (let i = 0; i < 12; i++) { const x = (hs(i, 6) - 0.5) * 12, y = (hs(i, 7) - 0.5) * 30, z = 3 + hs(i, 8) * 3, r = 0.6 + hs(i, 9) * 0.5; P.push(i % 3 ? cone([x, y, z - 1], [x + (hs(i, 3) - 0.5) * 6, y + (hs(i, 4) - 0.5) * 6, z + 3.6], r * 1.2, bone(), { k: 0.05 }) : cap([x, y, z], [x + 4, y + (hs(i, 5) - 0.5) * 6, z + 0.6], r, r * 0.8, bone(), { k: 0.1 })); }
      skull(cx, [6, 8, 3], 2, 0x9ffff0); cx.halos.push({ p: [6, 8, 3], r: 6, col: TEAL, a: 0.4 }); cx.halos.push({ p: [-2, -6, 4], r: 7, col: TEAL, a: 0.22 });
      clothFlat(cx, 6, -9, 8, 5, 0.3, PALE);
      break;
    case "hidekin":
      for (let i = 0; i < 16; i++) { const y = (hs(i, 1) - 0.5) * 31, x = (hs(i, 2) - 0.5) * 12; P.push(sphere([x, y, 2.4 + hs(i, 3) * 3], 1.8 + hs(i, 4) * 2.4, i % 3 ? dk(0x6e4a30, 0.45, 1.4, { grain: 0.3 }) : dk(0x4e3222, 0.45, 1.4, { grain: 0.3 }), { k: 0.8 })); }
      for (const [x, y, s] of [[5, -8, 1], [4, 10, -1]] as const) P.push(...chain([[x, y, 1.6], [x + 2, y + s * 4, 5], [x, y + s * 8, 4.4]], 1.7, 0.4, dk(0xe2c79a, 0.45, 1.2, { grain: 0.15, spec: 0.15 })));
      clothFlat(cx, 6, 2, 8, 7, 0.2, 0x8a5f2a, 0x6e1d18); P.push(cap([-6, -12, 2], [2, -4, 10], 0.9, 0.7, bone(), { k: 0.1 }));
      for (let i = 0; i < 3; i++) P.push(cap([-3 + i * 3, -14, 2], [-1 + i * 3, -12, 8], 0.5, 0.3, wd(0x4a3018), { k: 0.1 }));
      break;
    case "veiled":
      for (let i = 0; i < 8; i++) P.push(rbox([(hs(i, 2) - 0.5) * 9, -13 + i * 3.7, 2.4 + (i % 3) * 1.4], [2 + hs(i, 3) * 2.2, 2 + hs(i, 4) * 1.6, 1.6 + hs(i, 5)], 0.6, stoneM(i % 2 ? a.stone : 0x8a7a5a), { yaw: hs(i, 1) * 3, pitch: (hs(i, 6) - 0.5) * 0.5, k: 0.15 }));
      clothFlat(cx, 4, -5, 12, 8, 0.4, 0xcdb27a); clothFlat(cx, 6, 6, 7, 5, -0.4, a.cloth, a.trim);
      P.push(rbox([-3, 7, 4.6], [1.6, 2.8, 5.2], 0.4, stoneM(0x8a7a5a), { roll: 1.1, yaw: 0.4, k: 0.1 })); // a rune stone fallen over, a crack of light along it
      for (let i = 0; i < 3; i++) P.push(rbox([-1.6 + i * 1.5, 7.4, 8.6 - i * 0.6], [0.35, 0.4, 1.1], 0.1, glowM(i === 1 ? 0xffd060 : 0xb070ff), { roll: 1.1, k: 0.05 }));
      cx.halos.push({ p: [-1, 7, 7], r: 6, col: 0xb070ff, a: 0.4 });
      break;
  }
  void piece;
  // a smoulder in the heap and the wisp drifting up (loops over the 12 idle frames)
  cx.halos.push({ p: [-1, 0, 4], r: 7, col: clan === "host" ? TEAL : 0xff7a2a, a: 0.16 });
  const smoke = dk(0xa8a49c, 0.6, 1.3, { grain: 0.2 }), N = 9;
  for (let i = 0; i < N; i++) {
    const u = (((i / N) + f / 12) % 1), z = 7 + u * 21, r = 0.5 + Math.sin(Math.min(1, u * 1.1) * Math.PI) * 0.9 + u * 0.7;
    P.push(sphere([-1 + Math.sin(u * 5 + i) * 1.4 + u * 3, -2 + Math.cos(u * 4 + i * 2) * 1.8 + u * 5, z], u > 0.88 ? r * (1 - (u - 0.88) / 0.12) : r, smoke, { k: 0.5 }));
  }
}

// ================================================================ wrecks (frame 13)
function wreck(cx: Cx, kind: WorkKind, clan: WorkClan) {
  const { P } = cx, a = PAL[clan];
  const roofM = () => dk(a.roof, 0.45, 1.45, { grain: 0.35, tex: clan === "wardens" ? shingle(3.2, 2.2) : patchy(3.4, 0.16) });
  const wallM = () => (clan === "hidekin" ? dk(0x4e3222, 0.45, 1.45, { grain: 0.35 }) : wd(a.wall, vplank(2.6)));
  const burnt = (rx: number, ry: number) => P.push(ell([0, 0, 0.1], [rx, ry, 0.7], dk(0x1c1612, 0.6, 1.2, { grain: 0.4 }), { k: 0.3 }));
  const lumps = (n: number, rx: number, ry: number, top: number) => { for (let i = 0; i < n; i++) { const y = (hs(i, 1) - 0.5) * 2 * ry, x = (hs(i, 2) - 0.5) * 2 * rx, h = top * Math.max(0, 1 - Math.hypot(x / rx, y / ry)); P.push(sphere([x, y, h * 0.8], 1.4 + hs(i, 3) * 1.8, i % 3 ? dk(0x6e4a30, 0.45, 1.4, { grain: 0.3 }) : dk(0x4e3222, 0.45, 1.4, { grain: 0.3 }), { k: 0.8 })); } };
  if (kind === "barracks") {
    const D = 14, L = 33;
    burnt(D + 5, L);
    if (clan === "hidekin") { P.push(ell([0, 0, 0], [D, L, 7], dk(0x4e3222, 0.45, 1.45, { grain: 0.35 }), { k: 1 })); lumps(24, D - 2, L - 3, 9); }
    for (let i = 0; i < 9; i++) { const y = -L + 3 + i * ((2 * L - 6) / 8), h = 2.5 + hs(i, 2) * 7 * (i % 3 ? 0.6 : 1), x = i % 2 ? -D : D * 0.8; if (clan !== "hidekin") P.push(rbox([x, y, 1.5 + h / 2], [1.3, 2.3, h / 2], 0.3, wallM(), { yaw: (hs(i, 3) - 0.5) * 0.4, pitch: (hs(i, 4) - 0.5) * 0.2, k: 0.1 })); }
    for (const s of [-1, 1]) P.push(rbox([-D + 3, s * (L - 1), 5], [2, 1.3, 4.5], 0.3, wallM(), { k: 0.1 }));
    // the roof come down in slabs, one propped on the stubs
    P.push(rbox([-3, -14, 6], [12, 15, 0.9], 0.4, roofM(), { roll: 0.32, pitch: 0.12, k: 0.1 }), rbox([4, 15, 3.4], [11, 13, 0.9], 0.4, roofM(), { yaw: 0.35, roll: -0.22, pitch: -0.1, k: 0.1 }), rbox([9, -2, 2.2], [6, 8, 0.8], 0.4, roofM(), { yaw: -0.5, roll: 0.1, k: 0.1 }));
    P.push(cap([-10, 5, 3], [4, -6, 12], 1.5, 1.3, wd(a.wallD), { k: 0.1 }), cap([6, 4, 2.2], [14, 22, 2.8], 1.4, 1.2, wd(a.wall), { k: 0.1 }), cap([-8, -24, 2], [8, -20, 4], 1.3, 1.1, wd(a.wallD), { k: 0.1 }));
    for (let i = 0; i < 8; i++) P.push(rbox([6 + hs(i, 1) * 10, (hs(i, 2) - 0.5) * 60, 0.9], [2 + hs(i, 3) * 2, 0.5, 0.35], 0.15, wd(i % 2 ? a.wall : a.wallD), { yaw: hs(i, 4) * 3, k: 0.05 }));
    P.push(sphere([-4, 0, 3], 4.5, dk(0x1c1612, 0.6, 1.2, { grain: 0.4 }), { k: 0.8 })); cx.halos.push({ p: [-4, 0, 4], r: 12, col: clan === "host" ? TEAL : 0xff7a2a, a: 0.2 });
    switch (clan) {
      case "wardens": for (const y of [-31, -36, 33, 38]) P.push(cap([16, y, 0], [18, y + 1, 5 + (y % 2 ? 3 : 0)], 1.2, 1, wd(0x7a5a38), { k: 0.1 })); P.push(cap([10, -L + 2, 1.4], [8, -L + 18, 3], 0.9, 0.8, wd(a.wallD), { k: 0.1 })); clothFlat(cx, 14, -24, 14, 9, 0.5, a.cloth, a.trim); break;
      case "redfang": clothFlat(cx, 14, -22, 13, 8, 0.4, a.cloth); clothFlat(cx, 12, 20, 11, 8, -0.5, a.cloth); skull(cx, [18, 6, 2], 1.7); for (const y of [-36, 36]) P.push(cap([16, y, 0], [22, y + (y > 0 ? 2 : -2), 3], 1.1, 0.8, wd(0x4a3420), { k: 0.1 })); break;
      case "host": for (let i = 0; i < 20; i++) P.push(i % 3 ? cap([8 + hs(i, 1) * 12, (hs(i, 2) - 0.5) * 66, 0.8], [10 + hs(i, 1) * 12, (hs(i, 2) - 0.5) * 66 + 3, 1], 0.5, 0.4, bone(), { k: 0.1 }) : cone([8 + hs(i, 1) * 12, (hs(i, 2) - 0.5) * 66, 0.6], [9 + hs(i, 1) * 12, (hs(i, 2) - 0.5) * 66 + 2, 4], 0.7, bone(), { k: 0.05 })); skull(cx, [18, -10, 2.2], 2, 0x9ffff0); cx.halos.push({ p: [18, -10, 2.4], r: 7, col: TEAL, a: 0.5 }); P.push(...chain([[2, 20, 2], [3, 24, 9], [4, 28, 12]], 0.9, 0.7, bone())); clothFlat(cx, 14, 22, 9, 6, 0.4, PALE); break;
      case "hidekin": for (const [y, s] of [[-12, 1], [16, -1]] as const) P.push(...chain([[16, y, 1.6], [18, y + s * 5, 4], [16, y + s * 10, 3.4]], 1.7, 0.4, dk(0xe2c79a, 0.45, 1.2, { grain: 0.15, spec: 0.15 }))); clothFlat(cx, 18, 0, 11, 8, 0.1, 0x8a5f2a, 0x6e1d18); break;
      case "veiled": P.push(rbox([14, -24, 4.2], [1.6, 2.8, 5], 0.4, stoneM(0x8a7a5a), { roll: 1.2, yaw: 0.5, k: 0.1 }), rbox([14, 26, 3.4], [1.5, 2.6, 4], 0.4, stoneM(0x8a7a5a), { roll: -1.0, yaw: -0.3, k: 0.1 })); for (let i = 0; i < 3; i++) P.push(rbox([15 + i * 0.1, -22 - i * 1.4, 7.4 - i * 0.5], [0.3, 0.4, 0.9], 0.1, glowM(0xb070ff), { roll: 1.2, k: 0.05 })); cx.halos.push({ p: [14, -23, 6], r: 7, col: 0xb070ff, a: 0.3 }); clothFlat(cx, 15, 8, 14, 9, 0.3, a.roof); clothFlat(cx, 13, -8, 9, 6, -0.3, a.cloth, a.trim); break;
    }
  } else if (kind === "stores") {
    burnt(12, 18);
    P.push(rbox([-8, -8, 2.4], [1, 9, 2.4], 0.3, wd(a.wall), { roll: 0.4, yaw: 0.1, k: 0.1 }));
    P.push(rbox([-1, -3, 7.4], [11, 15, 0.9], 0.4, dk(a.roof, 0.45, 1.45, { grain: 0.3, tex: patchy(3.4, 0.16) }), { roll: 0.3, pitch: 0.28, yaw: 0.1, k: 0.1 }), rbox([6, 12, 2.2], [7, 7, 0.8], 0.4, dk(a.roof, 0.45, 1.45, { grain: 0.3 }), { yaw: 0.5, roll: -0.15, k: 0.1 }));
    P.push(cap([-8, 8, 1], [2, 12, 9], 1.3, 1.1, wd(a.wallD), { k: 0.1 }), cap([6, -10, 1.4], [12, -4, 3], 1.2, 1, wd(a.wall), { k: 0.1 }));
    crate(cx, 2, -12, 0.8, 7, a.wall, 0.6); P.push(rbox([6, -8, 1.2], [3, 0.5, 2.6], 0.15, wd(a.wallD), { yaw: 0.8, pitch: 0.5, k: 0.05 }), rbox([10, 6, 0.8], [3, 0.5, 0.4], 0.15, wd(a.wall), { yaw: 0.4, k: 0.05 }));
    P.push(cap([5, 6, 2.6], [12, 12, 2.6], 3.4, 3.4, wd(0x5a3820), { k: 0.3 })); // a barrel rolled out
    P.push(ell([8, -1, 0.8], [4.5, 3.4, 0.9], dk(clan === "host" ? 0xb4b09a : 0xc9b27a, 0.45, 1.3, { grain: 0.4 }), { k: 0.5 })); sack(cx, 4, 3, 0.4, 3.2, 0xb8a06a);
    switch (clan) {
      case "wardens": clothFlat(cx, 12, -12, 8, 5, 0.5, a.cloth, a.trim); for (let i = 0; i < 6; i++) P.push(ell([11 + (i % 3) * 1.4, 2 + (i >> 1) * 1.2, 0.5], [0.7, 0.7, 0.25], gold(), { k: 0.1 })); break;
      case "redfang": clothFlat(cx, 12, -12, 8, 5, 0.5, a.cloth); for (let i = 0; i < 9; i++) P.push(ell([10 + (i % 3) * 1.4, 1 + (i >> 1) * 1.2, 0.5], [0.7, 0.7, 0.25], gold(), { k: 0.1 })); break;
      case "host": skull(cx, [11, -10, 1.6], 1.7, 0x9ffff0); cx.halos.push({ p: [11, -10, 2], r: 6, col: TEAL, a: 0.45 }); for (let i = 0; i < 5; i++) P.push(cap([10 + i * 1.6, 2 - i * 0.8, 0.6], [11 + i * 1.6, 3 - i * 0.5, 0.8], 0.4, 0.35, bone(), { k: 0.1 })); clothFlat(cx, 12, 10, 7, 5, 0.3, PALE); break;
      case "hidekin": clothFlat(cx, 12, -12, 9, 6, 0.2, 0x8a5f2a, 0x6e1d18); P.push(...chain([[10, 8, 1], [12, 11, 3.4], [10, 15, 3]], 1.2, 0.3, dk(0xe2c79a, 0.45, 1.2, { grain: 0.15 }))); break;
      case "veiled": P.push(ell([12, 8, 1.6], [2.6, 2.6, 2], dk(0xa86a3a, 0.45, 1.35, { grain: 0.3 }), { k: 0.3 }), sphere([12, 8, 2.8], 1, glowM(0xb070ff), { k: 0.1 })); cx.halos.push({ p: [12, 8, 3], r: 6, col: 0xb070ff, a: 0.4 }); clothFlat(cx, 12, -12, 9, 6, 0.3, a.cloth, a.trim); break;
    }
  } else if (kind === "rack") {
    burnt(14, 22);
    const wood = clan === "host" ? 0x3a3228 : clan === "veiled" ? 0x6a4a30 : clan === "hidekin" ? 0x5a4028 : clan === "redfang" ? 0x4a3022 : 0x6b4a2a;
    P.push(cap([-2, -10, 1.2], [3, -9, 7], 1.5, 1.3, wd(wood), { k: 0.1 }), cap([0, 8, 1.4], [14, 10, 3.2], 1.5, 1.3, wd(wood), { k: 0.1 }), cap([-6, -14, 2.4], [6, 8, 3], 1.1, 1.1, wd(wood), { k: 0.1 }), rbox([-2, -9, 1], [4, 1.6, 0.9], 0.3, wd(wood), { k: 0.1 }));
    const sh = clan === "host" ? bone() : wd(0x8a6a44), hd = clan === "host" || clan === "hidekin" ? bone() : iron();
    for (let i = 0; i < 5; i++) { const x = 4 + hs(i, 1) * 8, y = -9 + i * 4.6 + hs(i, 2) * 2, yaw = (hs(i, 3) - 0.5) * 1.6; P.push(cap([x, y, 1], [x + Math.cos(yaw) * 14, y + Math.sin(yaw) * 14, 1.4], 0.6, 0.55, sh, { k: 0.1 }), cone([x + Math.cos(yaw) * 14, y + Math.sin(yaw) * 14, 1.4], [x + Math.cos(yaw) * 19, y + Math.sin(yaw) * 19, 1.6], 1.1, hd, { k: 0.05 })); }
    const sc = clan === "host" ? 0x1f2422 : clan === "hidekin" ? 0x8a5f2a : clan === "veiled" ? 0x2a2a5a : a.cloth;
    P.push(cap([10, -4, 1], [10.6, -4, 1.9], 5.2, 5.2, wd(sc), { k: 0.1 }), torus([10.3, -4, 1.6], 5, 0.55, clan === "host" ? bone() : wd(a.trim), { k: 0.05 }), sphere([10.3, -4, 2.8], 1.3, clan === "host" ? bone() : iron(), { k: 0.1 }));
    P.push(rbox([6, -8, 1.2], [4.6, 0.5, 0.35], 0.15, wd(sc), { yaw: 0.9, k: 0.05 })); // a shield cracked in two
    clothFlat(cx, 12, 8, 9, 6, 0.5, a.cloth, a.trim);
    P.push(cap([-8, 9, 1.5], [-4, 13, 4], 0.8, 0.7, iron(), { k: 0.1 }), ell([-8, 12, 2], [4.4, 4.4, 2.6], clan === "hidekin" ? dk(0x8a5e30, 0.45, 1.35, { grain: 0.4 }) : iron(), { k: 0.3, yaw: 0.5, pitch: 0.5 })); // the brazier tipped over
    const fc = clan === "host" ? TEAL : clan === "veiled" ? 0xb070ff : 0xff7a2a;
    for (let i = 0; i < 4; i++) P.push(sphere([-4 + i * 1.6, 15 + hs(i, 1) * 5, 0.7], 0.7, glowM(fc), { k: 0.1 })); cx.halos.push({ p: [-4, 17, 1.4], r: 7, col: fc, a: 0.4 });
  }
  void chain; void cone;
}

// ================================================================ the model of one frame
/** One frame of a works sheet as a model facing the camera. */
export function workModel(kind: WorkKind, clan: WorkClan, f: number): { m: Model; dir: "down" } {
  const cx: Cx = { P: [], eyes: [], halos: [] };
  const ph = (f / 12) * Math.PI * 2, sz = WORK_SIZE[kind];
  const ff = kind === "rubble" && f >= 12 ? 0 : f;
  let sh = { x: 0, y: 0, rx: 20, ry: 40, a: 0.42 };
  const R = { barracks: 38, stores: 20, rack: 20, rubble: 18 }[kind];
  if (f === 13 && kind !== "rubble") { wreck(cx, kind, clan); sh = { x: 3, y: 0, rx: kind === "barracks" ? 14 : 8, ry: kind === "barracks" ? 38 : 20, a: 0.42 }; }
  else {
    if (kind === "barracks") barracks(cx, clan, ph); else if (kind === "stores") stores(cx, clan, ph); else if (kind === "rack") rack(cx, clan, ph); else rubble(cx, clan, ff);
    if (kind === "barracks") sh = { x: 3, y: 0, rx: 13, ry: 40, a: 0.42 }; else if (kind === "stores") sh = { x: 1, y: 0, rx: 9, ry: 21, a: 0.42 }; else if (kind === "rack") sh = { x: 1, y: 4, rx: 6, ry: 22, a: 0.42 }; else sh = { x: 0, y: 0, rx: 8, ry: 19, a: 0.38 };
    if (f === 12 && kind !== "rubble") {
      const jolt = kind === "barracks" ? 0.035 : 0.07;
      cx.P = tip(cx.P, [0, 0, 0], -jolt * 0.7, jolt);
      cx.P = remap(cx.P, (q) => [q[0], q[1], q[2] + 0.4], (q) => [q[0], q[1], q[2] - 0.4]);
      chips(cx, PAL[clan], R, kind === "barracks" ? 10 : 7);
    }
  }
  void sz;
  // pull the model back so its front edge stays above the sheet's bottom (depth drops half a px per px toward the viewer)
  return { m: shiftModel({ prims: cx.P, eyes: cx.eyes, halos: cx.halos, shadow: sh }, { barracks: -7, stores: -5, rack: -3, rubble: -3 }[kind]), dir: "down" };
}
