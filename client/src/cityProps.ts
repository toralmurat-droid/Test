import type { CityGate, CityPropKind } from "../../shared/capitals";
import { TILE } from "../../shared/constants";
import { CLANS, type ClanKey } from "../../shared/war/clans";
import { dith, hsh, IsoPaint, mat, ramp, type Mat, type V3 } from "./isoPaint";
import { BRASSR, dummy, IRONR, ROPER, STONER, WOODR, wood } from "./isoProps";
import type Phaser from "phaser";
import type { Pen } from "./worldProps";

/**
 * Baked prop art for the clan capitals (W7), one set per city in its clan's colours (PALS): oath altar, war table,
 * quartermaster's stash, training dummy, weapon rack and wall banner. Same isometric pixel painter and palettes as isoProps.ts, so they sit with
 * the bonfire and the village props. Cosmetic and client-only: walk-through art placed by the city painter; the blocking
 * boxes are CITY_TEMPLATE `solid`, which this file never touches.
 *
 * Use: `cityPropTextures(scene, clan)` once per city, then for a prop of kind K put a sprite with texture `cityPropKey(K, clan)` at the prop's
 * foot (world px of the tile x, y), origin `CITY_PROPS[K].ox / w, CITY_PROPS[K].oy / h`, depth by foot y. `frames` > 1 means
 * a spritesheet (flames, cloth): animate frames 0..frames-1 at about 6 fps.
 */
export interface CityPropArt { w: number; h: number; /** foot anchor in the frame, texels */ ox: number; oy: number; frames: number; draw: (p: Pen, f: number) => void }

const N = 6, TAU = Math.PI * 2;
/** A six-step shade ramp round a base colour (index 3 = the colour), for the clans' cloth, trim and stone. */
function shades(c: number): number[] {
  const ch = (sh: number, f: number) => { const v = (c >> sh) & 255; return Math.round(f <= 1 ? v * f : v + (255 - v) * (f - 1) * 0.6); };
  return [0.25, 0.45, 0.7, 1, 1.3, 1.6].map((f) => (Math.min(255, ch(16, f)) << 16) | (Math.min(255, ch(8, f)) << 8) | Math.min(255, ch(0, f)));
}
/** A city's prop colours: its clan's cloth and trim (shared/war/clans.ts CLANS, as in the Hold standards), the foe's pawns on the war table, its stone. */
interface PropPal { cloth: number[]; trim: number[]; foe: number[]; stone: number[] }
const PALS: Record<ClanKey, PropPal> = {
  // Hearthhold: the Wardens' green cloth (0x3b4a2c) and orange trim (0xd9822b), red foes, grey stone
  wardens: {
    cloth: [0x0e140a, 0x1c2614, 0x2c3a20, 0x3b4a2c, 0x546a3c, 0x6f8a4e], trim: [0x3a1a08, 0x7a3a0c, 0xb4601c, 0xd9822b, 0xf0b44a, 0xffd88a],
    foe: [0x1e0606, 0x561410, 0x962a1e, 0xcc5a3a], stone: STONER,
  },
  // Duskveil: violet cloth with gold, sandstone; the Host's teal on the war table
  veiled: { cloth: shades(0x4a3a8a), trim: shades(CLANS.veiled.trim), foe: shades(CLANS.host.trim), stone: shades(0xa08a6a) },
  // Marrowkeep: black cloth trimmed in teal, black stone; the Hide-Kin's brown on the war table
  host: { cloth: shades(0x2c3632), trim: shades(CLANS.host.trim), foe: shades(CLANS.hidekin.cloth), stone: shades(0x3a3e3e) },
  // Scarwall: red cloth trimmed in bone, red stone; the Circle's violet on the war table
  redfang: { cloth: shades(CLANS.redfang.cloth), trim: shades(0xb8a888), foe: shades(0x4a4a9a), stone: shades(0x6a3e32) },
  // Deepden: brown hide trimmed in blood red, earth-brown stone; the Wardens' green on the war table
  hidekin: { cloth: shades(CLANS.hidekin.cloth), trim: shades(0xa8342a), foe: shades(CLANS.wardens.cloth), stone: shades(0x5e5040) },
};
/** The palette being baked (bakeCityProp sets it). */
let PAL: PropPal = PALS.wardens;
const IVORY = [0x2a261e, 0x4a4436, 0x7a705a, 0xa89c80, 0xd0c4a4, 0xece2c8];
const FLAME = [0xc05a18, 0xf08a2c, 0xffc860, 0xffeaa8, 0xfff8e0];
const SACKP = [0x2a2218, 0x463a28, 0x66563c, 0x86744e, 0xa49266, 0xc0b084];
const metal = (bias = 0): Mat => (l, _s, _t, x, y) => ramp(IRONR, l * 1.1 + bias - 0.05, x, y);
const brass = (bias = 0): Mat => (l, _s, _t, x, y) => ramp(BRASSR, l + bias, x, y);
const stone = (bias = 0): Mat => (l, _s, _t, x, y) => ramp(PAL.stone, l + bias + (hsh(x >> 1, y >> 1, 11) - 0.5) * 0.22 - (hsh(x, y, 12) < 0.07 ? 0.2 : 0), x, y);
const cloth = (pal: number[], bias = 0): Mat => (l, s, t, x, y) => ramp(pal, l + bias + (hsh(Math.floor(s * 40), Math.floor(t * 60), 5) - 0.5) * 0.08, x, y);

/** A candle: wax stub with a flickering flame (f = frame). */
function candle(g: IsoPaint, u: number, v: number, z: number, h: number, f: number, seed: number) {
  g.rod([u, v, z], [u, v, z + h], 0.9, mat(IVORY, 0.1));
  const fl = 0.8 + 0.35 * Math.sin((f / N) * TAU * 2 + seed * 2.1);
  g.blob([u + Math.sin((f + seed) * 1.3) * 0.25, v, z + h + 1.6 * fl], 0.8, 0.8, 1.7 * fl, (_l, _s, t, x, y) => ramp(FLAME, 0.3 + t * 0.7, x, y));
}

// ---- oath altar --------------------------------------------------------------------------------------------
/** A stone altar on two steps, a blue runner, an open oath book, a brass bowl, two flickering candles. */
function altar(p: Pen, f: number) {
  const g = new IsoPaint(p, 64, 80, 30, 62);
  g.shadow(2, 2, 17, 0.45);
  g.box(-15, 15, -10, 10, 0, 3, stone(-0.08));
  g.box(-12, 12, -7.5, 7.5, 3, 6, stone(0));
  g.box(-9, 9, -5, 5, 6, 22, stone(0.04));
  g.box(-10, 10, -6, 6, 22, 25, stone(0.12)); // slab
  g.box(-9.1, 9.1, 5.05, 5.15, 15, 16, brass(-0.1), 2); // gold inlay band on the front faces
  g.box(9.05, 9.15, -5.1, 5.1, 15, 16, brass(-0.1), 4);
  // runner over the slab and down the front (+u) face
  g.quad([-3, -5.4, 25.3], [6, 0, 0], [0, 10.8, 0], cloth(PAL.cloth, 0.02));
  g.quad([3, -5, 25.2], [0.4, 0, -12], [0, 10, 0], cloth(PAL.cloth, -0.04), (s) => Math.sin(s * Math.PI * 3) * 0.3);
  g.box(3.1, 3.5, -5, 5, 12.6, 13.4, brass(0), 4);
  // open book on a wooden stand
  g.box(-6, 1, -3.5, 3.5, 25, 26.2, wood(WOODR, -0.1, 8));
  g.quad([-5.6, -3.2, 26.4], [6.2, 0, 0.7], [0, 6.4, 0], (l, s, t, x, y) => (Math.abs(s - 0.5) < 0.02 ? ramp(IVORY, 0.15, x, y) : (t * 9) % 2 < 0.4 ? ramp(IVORY, l - 0.2, x, y) : ramp(IVORY, l + 0.1, x, y)));
  // brass offering bowl with a little wine
  g.blob([6, 2.8, 27.4], 2.6, 2.6, 1.9, brass(0), 0, 0.5);
  g.blob([6, 2.8, 27.6], 2, 2, 1, (_l, _s, _t, x, y) => ramp([0x3a1810, 0x7a2a18, 0xb43c28], 0.5, x, y), 0.5, 1);
  for (const v of [-4.6, 4.6]) { g.rod([-8, v, 25], [-8, v, 31], 0.6, brass(0.05)); g.blob([-8, v, 31], 1.4, 1.4, 0.7, brass(0)); candle(g, -8, v, 31.5, 4.5, f, v); }
}

// ---- war table ---------------------------------------------------------------------------------------------
/** A plank table on trestles, a parchment map with coast, roads, river, forests and peaks, blue and red markers, a pinned dagger, a candle. */
function wartable(p: Pen, f: number) {
  const g = new IsoPaint(p, 92, 70, 28, 50);
  g.shadow(18, 7, 26, 0.4);
  const U = 50, V = 22, Z = 17;
  for (const u of [5, U - 5]) {
    for (const v of [3, V - 3]) g.rod([u, v, 0], [u, V / 2, Z - 0.5], 1.1, wood(WOODR, v < V / 2 ? -0.08 : 0, 18));
    g.rod([u, 4.5, 6], [u, V - 4.5, 6], 0.8, wood(WOODR, 0, 14));
  }
  g.rod([5, V / 2, 5], [U - 5, V / 2, 5], 0.9, wood(WOODR, -0.04, 40));
  g.box(0, U, 0, V, Z, Z + 3, wood(WOODR, 0.04, 36));
  g.box(0.8, U - 0.8, 0.8, V - 0.8, Z + 3, Z + 3.2, wood(WOODR, -0.15, 36), 1);
  const zt = Z + 3.3;
  g.quad([2.5, 2.2, zt], [U - 5, 0, 0], [0, V - 4.4, 0], (l, s, t, x, y) => {
    const X = s * (U - 5), Y = t * (V - 4.4);
    if (Math.min(s, 1 - s, t * 2, (1 - t) * 2) < 0.02 && hsh(x, y, 3) < 0.8) return ramp(IVORY, l * 0.6, x, y);
    if (X < 16 && Y > 7 + Math.sin(X * 0.5) * 2) return ramp([0x1a2a3a, 0x2a4256, 0x3e5e72, 0x5a7e92], l * 0.9 + (hsh(x, y, 9) - 0.5) * 0.15, x, y);
    if (X > 12 && Math.abs(Y - (9 + Math.sin(X * 0.3) * 3 - X * 0.12)) < 0.55) return ramp([0x2a4256, 0x3e5e72, 0x5a7e92], l, x, y);
    if (Math.abs(Y - (11 + Math.sin(X * 0.45) * 1.2)) < 0.4 && ((X * 1.7) | 0) % 3 !== 0) return ramp([0x3a2a18, 0x5e4426], l, x, y);
    if (hsh(Math.floor(X / 3), Math.floor(Y / 3), 21) < 0.2 && X % 3 < 2 && Y % 3 < 2) return ramp([0x3a342a, 0x5a5242, 0x8a8068], l + (X % 3 < 1 ? -0.1 : 0.1), x, y);
    if (hsh(Math.floor(X / 2), Math.floor(Y / 2), 22) < 0.22 && hsh(x, y, 4) < 0.6) return ramp([0x1c2a18, 0x2e4426, 0x486a34], l, x, y);
    return ramp([0x5a4c34, 0x8a7a56, 0xb0a07a, 0xcdbe96], l * 0.9 + (hsh(x >> 1, y >> 1, 6) - 0.5) * 0.18, x, y);
  });
  const pawn = (u: number, v: number, pal: number[], h = 3.6) => { g.rod([u, v, zt], [u, v, zt + h], 0.9, mat(pal, 0.05)); g.blob([u, v, zt + h + 0.4], 1.1, 1.1, 1.1, mat(pal, 0.1)); };
  for (const [u, v] of [[14, 6], [18, 9], [22, 6.5], [11, 11]]) pawn(u, v, PAL.cloth);
  for (const [u, v] of [[34, 14], [38, 12], [30, 16]]) pawn(u, v, PAL.foe);
  g.rod([8, 17, zt], [11.5, 18.2, zt + 0.6], 0.5, metal(0.1)); // pinned dagger
  g.blob([7.4, 16.8, zt + 0.6], 0.8, 0.8, 0.8, brass(0));
  g.blob([44, 18, zt + 0.2], 2.2, 2.2, 0.6, brass(0.05), 0, 0.5); // brass ring weight
  g.blob([2, V + 0.6, Z + 3.4], 1.6, 1.6, 0.8, brass(0), 0, 0.5); // candle dish
  candle(g, 2, V + 0.6, Z + 3.8, 4, f, 1);
}

// ---- quartermaster's stash ---------------------------------------------------------------------------------
/** An iron-banded chest with a rounded lid and brass lock, a hooped barrel and two grain sacks. */
function stash(p: Pen, _f: number) {
  const g = new IsoPaint(p, 60, 46, 30, 36);
  g.shadow(4, 3, 14, 0.4);
  g.box(-9, 9, -5.5, 5.5, 0, 9, wood(WOODR, -0.14, 18));
  g.box(-9.1, 9.1, -5.6, 5.6, 8, 9.2, metal(-0.05), 6); g.box(-9.1, 9.1, -5.6, 5.6, 0, 1.4, metal(-0.1), 6);
  g.surf((s, t) => { const a = t * Math.PI; return [[-9 + s * 18, Math.cos(a) * 5.5, 9 + Math.sin(a) * 4], [0, Math.cos(a), Math.sin(a)]]; }, 40, 24, wood(WOODR, 0.16, 18));
  g.surf((s, t) => { const a = t * Math.PI; return [[9, Math.cos(a) * 5.5 * s, 9 + Math.sin(a) * 4 * s], [1, 0, 0]]; }, 12, 24, wood(WOODR, -0.05, 18));
  for (const u of [-6.8, 6.8]) {
    g.box(u - 0.8, u + 0.8, -5.6, 5.6, 0, 9, metal(0), 2);
    g.surf((s, t) => { const a = t * Math.PI; return [[u - 0.8 + s * 1.6, Math.cos(a) * 5.7, 9 + Math.sin(a) * 4.15], [0, Math.cos(a), Math.sin(a)]]; }, 4, 20, metal(0.05));
  }
  g.box(9.05, 9.15, -5.6, 5.6, 0.5, 1.8, metal(-0.05), 4);
  g.box(8.9, 9.4, -1.2, 1.2, 5.5, 9, brass(0), 4);
  g.plot(9.5, 0, 6.6, 0x120c0a, 3);
  const bar: Mat = (l, s, t, x, y) => (Math.abs(t - 0.2) < 0.045 || Math.abs(t - 0.8) < 0.045 ? ramp(IRONR, l, x, y) : ramp(WOODR, l + (hsh(Math.floor(s * 28), 1, 4) - 0.5) * 0.25, x, y));
  g.blob([-16, 3, 7.5], 4.8, 4.8, 8, bar);
  for (const [u, v, h] of [[11, 10.5, 6.5], [15.5, 6, 5.5]] as const) {
    g.blob([u, v, h * 0.55], 3.6, 3.6, h * 0.6, (l, s, t, x, y) => ramp(SACKP, l + (hsh(Math.floor(s * 20), Math.floor(t * 9), 6) - 0.5) * 0.2, x, y));
    g.rod([u, v, h * 1.05], [u, v, h * 1.2], 1.5, mat(ROPER, -0.1));
  }
}

// ---- weapon rack -------------------------------------------------------------------------------------------
/** A trestle rack: two arming swords stood hilt-up, a mace, a halberd, a quiver of wooden blades and a blue Wardens shield. */
function rack(p: Pen) {
  const g = new IsoPaint(p, 60, 70, 13, 54);
  g.shadow(14, 3, 14, 0.35);
  for (const u of [1, 29]) {
    g.rod([u, -5, 0], [u, 0, 28], 1, wood(WOODR, -0.05, 28));
    g.rod([u, 5, 0], [u, 0, 28], 1, wood(WOODR, 0, 28));
    g.rod([u, -3.2, 10], [u, 3.2, 10], 0.7, wood(WOODR, 0, 8));
  }
  g.rod([-1.5, 0, 28.5], [31.5, 0, 28.5], 1.3, wood(WOODR, 0.05, 33));
  g.rod([0, 3.8, 8], [30, 3.8, 8], 0.9, wood(WOODR, 0, 30));
  for (const u of [5, 9]) {
    g.rod([u, 3.6, 1], [u, 3.6, 36], 0.6, metal(0.12));
    g.box(u - 2.3, u + 2.3, 3.2, 4, 36, 37, brass(-0.05));
    g.rod([u, 3.6, 37], [u, 3.6, 41], 0.55, wood(WOODR, -0.1, 4));
    g.blob([u, 3.6, 41.8], 0.9, 0.9, 0.9, brass(0));
  }
  g.rod([14, 5.4, 0.4], [14.5, -1.6, 46], 0.6, wood(WOODR, 0.02, 44)); // mace
  g.blob([14.5, -1.7, 49], 1.7, 1.7, 2.2, metal(0.1));
  g.rod([19, 5.4, 0.4], [19.5, -2.2, 50], 0.6, wood(WOODR, 0.02, 48)); // halberd
  g.box(19.1, 19.9, -2.4, -1.6, 50, 54, metal(0.15));
  g.box(19.1, 23.5, -2.3, -1.8, 44, 49.4, (l, s, _t, x, y) => ramp(IRONR, l + 0.1 - s * 0.1, x, y));
  g.blob([24.5, 2.6, 6.5], 2.4, 2.4, 6.5, wood([0x1a1208, 0x3a2a18, 0x58421f, 0x7a5c30, 0xa07a46], 0, 6)); // quiver of practice blades
  for (const [du, dv, h] of [[-0.8, 0, 17], [0.8, 0.6, 19.5], [0, -0.8, 15]] as const) g.rod([24.5 + du, 2.6 + dv, 11], [24.5 + du, 2.6 + dv, h], 0.55, wood(WOODR, 0.12, 8));
  // shield leaning on the far trestle: blue, a gold hearth-flame, iron rim
  const Cs: V3 = [32, 1.5, 9], e1: V3 = [0, 1, 0], e2: V3 = [-0.28, 0, 0.96];
  g.surf((s, t) => {
    const a = t * TAU, r = s * 7.4, c = Math.cos(a) * 0.85, d = Math.sin(a);
    return [[Cs[0] + (e1[0] * c + e2[0] * d) * r, Cs[1] + (e1[1] * c + e2[1] * d) * r, Cs[2] + (e1[2] * c + e2[2] * d) * r], [0.96, 0, 0.28]];
  }, 36, 110, (l, s, t, x, y) => {
    if (s > 0.9) return ramp(IRONR, l + 0.1, x, y);
    const a = t * TAU, cy = Math.cos(a) * s, cz = Math.sin(a) * s;
    if (Math.abs(cy) < 0.16 && cz > -0.25 && cz < 0.5 - Math.abs(cy) * 1.8) return ramp(BRASSR, l + 0.15, x, y);
    return ramp(PAL.cloth, l + (hsh(Math.floor(a * 8), Math.floor(s * 9), 3) - 0.5) * 0.12, x, y);
  });
}

// ---- Wardens wall banner -----------------------------------------------------------------------------------
/** A tall pole by a wall: crossbar with brass finials, a swallow-tailed green banner with orange trim and a hearth-flame, stirring in the wind. */
function banner(p: Pen, f: number) {
  const g = new IsoPaint(p, 40, 112, 14, 104), ph = (f / N) * TAU;
  g.shadow(1, 1, 6, 0.4);
  g.box(-4, 4, -4, 4, 0, 4, stone());
  g.rod([0, 0, 4], [0, 0, 92], 1.3, wood(WOODR, 0, 88));
  g.blob([0, 0, 94], 1.9, 1.9, 2, brass(0.05));
  g.rod([0, 0, 95], [0, 0, 101], 0.5, brass(0));
  g.rod([-1.4, 0, 86], [15.4, 0, 86], 0.9, wood(WOODR, 0.05, 17));
  for (const u of [-1.6, 15.6]) g.blob([u, 0, 86], 1.1, 1.1, 1.1, brass(0.05));
  const W = 14, H = 56;
  g.quad([0.2, 0.6, 85], [W, 0, 0], [0, 0, -H], (l, s, t, x, y) => {
    const m = Math.abs(s - 0.5) * 2;
    if (t > 1 - 0.14 * (1 - m)) return undefined; // swallow tail
    if (m > 0.9 || t < 0.04 || t > 0.9 - 0.14 * (1 - m)) return ramp(PAL.trim, l * 0.9 + 0.05, x, y);
    const ft = (t - 0.2) / 0.55;
    if (ft > 0 && ft < 1) {
      const w = 0.42 * Math.pow(Math.sin(Math.PI * Math.pow(ft, 0.8)), 0.9) * (1 - 0.2 * Math.sin(ft * 9));
      if (m < w) return ramp(PAL.trim, l + 0.15 - (m / Math.max(0.01, w)) * 0.15, x, y);
    }
    if (t > 0.78 && t < 0.83 && m < 0.5) return ramp(PAL.trim, l, x, y);
    return ramp(PAL.cloth, l + (hsh(Math.floor(s * 30), Math.floor(t * 70), 5) - 0.5) * 0.06 + t * 0.05, x, y);
  }, (s, t) => Math.sin(ph - t * 3.4 + s * 1.3) * (0.6 + 2.4 * t) * 0.8);
}

/** Frame metrics and painters by CITY_TEMPLATE prop kind (the dummy is the village's straw man). */
export const CITY_PROPS: Record<CityPropKind, CityPropArt> = {
  altar: { w: 64, h: 80, ox: 30, oy: 62, frames: N, draw: altar },
  wartable: { w: 92, h: 70, ox: 28, oy: 50, frames: N, draw: wartable },
  stash: { w: 60, h: 46, ox: 30, oy: 36, frames: 1, draw: stash },
  dummy: { w: 34, h: 58, ox: 17, oy: 50, frames: N, draw: dummy },
  rack: { w: 60, h: 70, ox: 13, oy: 54, frames: 1, draw: rack },
  banner: { w: 40, h: 112, ox: 14, oy: 104, frames: N, draw: banner },
};
export const CITY_PROP_KINDS = Object.keys(CITY_PROPS) as CityPropKind[];
/** Texture key of a city prop's spritesheet in a clan's colours. */
export const cityPropKey = (kind: CityPropKind, clan: ClanKey = "wardens") => `cityprop_${clan}_${kind}`;

const OUTLINE = 0x15100d;
/** One frame as RGBA bytes, with the 1px dark outline round the silhouette (no Phaser: the preview tool uses it too). */
export function bakeCityProp(kind: CityPropKind, f: number, clan: ClanKey = "wardens"): Uint8ClampedArray {
  const { w, h, draw } = CITY_PROPS[kind], buf = new Uint32Array(w * h);
  PAL = PALS[clan];
  const px = (x: number, y: number, c: number, a = 1) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x, o = buf[i];
    if (a >= 1 || !(o >>> 24)) { buf[i] = ((a >= 1 ? 255 : Math.round(a * 255)) << 24 | c) >>> 0; return; }
    const mix = (sh: number) => Math.round(((o >> sh) & 255) * (1 - a) + ((c >> sh) & 255) * a) << sh;
    buf[i] = (0xff000000 | mix(16) | mix(8) | mix(0)) >>> 0;
  };
  draw({ px } as Pen, f);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && buf[y * w + x] >>> 24 > 140;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = buf[y * w + x];
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) v = (0xe0 << 24 | OUTLINE) >>> 0;
    const j = (y * w + x) * 4;
    out[j] = (v >> 16) & 255; out[j + 1] = (v >> 8) & 255; out[j + 2] = v & 255; out[j + 3] = v >>> 24;
  }
  return out;
}

/** Paints every prop spritesheet of one clan's city into the scene's texture manager (once; frames 0..frames-1, NEAREST). */
export function cityPropTextures(scene: Phaser.Scene, clan: ClanKey) {
  for (const k of CITY_PROP_KINDS) {
    const key = cityPropKey(k, clan);
    if (scene.textures.exists(key)) continue;
    const { w, h, frames } = CITY_PROPS[k], tex = scene.textures.createCanvas(key, w * frames, h)!, ctx = tex.getContext();
    for (let f = 0; f < frames; f++) { const img = ctx.createImageData(w, h); img.data.set(bakeCityProp(k, f, clan)); ctx.putImageData(img, f * w, 0); tex.add(f, 0, f * w, 0, w, h); }
    tex.refresh();
    tex.setFilter(1 /* Phaser.Textures.FilterMode.NEAREST */);
  }
}

// ---- gatehouses --------------------------------------------------------------------------------------------
/**
 * Oblique version of the iso painter for the gatehouses: ground stays square (screen x = u, y = v) and height lifts
 * straight up, so a gate that runs along the wall lines up with the flat wall tiles. Only top and front (+v) faces are seen.
 * Screen point of (u, v, z): x = ox + u, y = oy + v - z. Nearer to the viewer = larger v + z.
 */
class FrontPaint extends IsoPaint {
  private zq: Float32Array;
  constructor(p: Pen, private w: number, private h: number, ox: number, oy: number) { super(p, w, h, ox, oy); this.zq = new Float32Array(w * h).fill(-1e9); }
  x(u: number, _v: number) { return this.ox + u; }
  y(_u: number, v: number, z: number) { return this.oy + v - z; }
  plot(u: number, v: number, z: number, c: number | undefined, bias = 0) {
    if (c === undefined) return false;
    const x = Math.round(this.x(u, v) - 0.5), y = Math.round(this.y(u, v, z) - 0.5);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    const d = v + z + bias, i = y * this.w + x;
    if (d < this.zq[i]) return false;
    this.zq[i] = d; this.p.px(x, y, c);
    return true;
  }
  shadow(u: number, v: number, r: number, a = 0.4) {
    const cx = this.x(u, v), cy = this.y(u, v, 0);
    for (let y = Math.floor(cy - r * 0.5); y <= cy + r * 0.5; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = (x - cx) / r, dy = (y - cy) / (r * 0.5);
      if (dx * dx + dy * dy <= 1 && dith(x, y) < 0.7 && x >= 0 && y >= 0 && x < this.w && y < this.h && this.zq[y * this.w + x] < -1e8) this.p.px(x, y, 0x000000, a);
    }
  }
}

const GT = 96, GW = 44, GSPRING = 46, GCROWN = 64, GLINTEL = 88, GTOWER = 96; // tower height, arch (half-width, springing, crown), lintel top
/** Running-bond stone courses with a little tone noise: for the vertical faces of towers and the arch wall. */
const brickWall = (bias = 0): Mat => (l, s, _t, x, y) => {
  const row = Math.floor(y / 5), xo = x + (row & 1) * 5, col = Math.floor(xo / 10);
  const mortar = y % 5 === 0 || xo % 10 === 0;
  const edge = s < 0.05 ? 0.1 : s > 0.95 ? -0.12 : 0;
  return ramp(PAL.stone, l + bias + edge + (hsh(col, row, 13) - 0.5) * 0.2 - (mortar ? 0.2 : 0), x, y);
};
/** Crenellations round a rectangle's edges at height z (merlons 7 wide, 5 gaps; `sides` false = front and back only). */
function merlons(g: IsoPaint, u0: number, u1: number, v0: number, v1: number, z: number, sides: boolean) {
  const n = Math.max(1, Math.round((u1 - u0 - 7) / 12));
  for (let i = 0; i <= n; i++) {
    const u = u0 + ((u1 - u0 - 7) * i) / n;
    g.box(u, u + 7, v1 - 5, v1, z, z + 7, brickWall(0.05));
    g.box(u, u + 7, v0, v0 + 5, z, z + 7, stone(0.0), 3);
  }
  if (!sides) return;
  const m = Math.max(1, Math.round((v1 - v0 - 17) / 12));
  for (let i = 1; i <= m; i++) {
    const v = v0 + 5 + ((v1 - v0 - 17) * i) / (m + 1);
    g.box(u0, u0 + 5, v, v + 7, z, z + 7, stone(0.0), 3); g.box(u1 - 5, u1, v, v + 7, z, z + 7, stone(0.0), 7);
  }
}
/** One gate tower on the wall: plinth, brick shaft, trim band, arrow slits, crenellated top, a pennant and a hanging banner. */
function gateTower(g: IsoPaint, uc: number, v0: number, v1: number, TH = GTOWER) {
  const u0 = uc - 20, u1 = uc + 20;
  g.shadow(uc, v1 + 2, 30, 0.4);
  g.box(u0 - 2, u1 + 2, v0, v1 + 1, 0, 7, stone(-0.18), 3);
  g.box(u0, u1, v0, v1, 7, TH, brickWall(), 3);
  g.box(u0 - 1.5, u1 + 1.5, v0, v1 + 1.5, TH - 14, TH - 10, mat(PAL.trim, -0.05), 3); // clan trim band
  g.box(u0 - 1.5, u1 + 1.5, v0, v1 + 1.5, TH - 2, TH, stone(0.15), 3); // corbel course under the parapet
  for (const du of [-14, 14]) g.quad([uc + du - 1.6, v1 + 0.1, TH - 20], [3.2, 0, 0], [0, 0, -Math.min(18, TH - 30)], (_l, _s, t, x, y) => ramp([0x050403, 0x120e0a, 0x241c14], t < 0.1 ? 0.8 : 0.3, x, y));
  merlons(g, u0, u1, v0, v1, TH, true);
  // pennant on a brass-tipped staff in the tower's back corner
  g.rod([uc + 8, v0 + 9, TH], [uc + 8, v0 + 9, TH + 26], 0.55, wood(WOODR, 0, 24));
  g.blob([uc + 8, v0 + 9, TH + 27], 1, 1, 1, brass(0.05));
  g.quad([uc + 8.5, v0 + 9, TH + 24], [13, 0, 0], [0, 0, -8], (l, s, t, x, y) => (s > 1 - Math.abs(t - 0.5) * 1.1 ? undefined : ramp(t < 0.12 || t > 0.88 ? PAL.trim : PAL.cloth, l + 0.1, x, y)), (s) => Math.sin(s * 3) * 0.8);
  // banner hung from a crossbar high on the front
  const bz = TH - 18, bv = v1 + 1.2;
  g.rod([uc - 10, bv, bz + 1], [uc + 10, bv, bz + 1], 0.8, wood(WOODR, 0.05, 20));
  for (const du of [-10.4, 10.4]) g.blob([uc + du, bv, bz + 1], 1.1, 1.1, 1.1, brass(0.05));
  const W = 15, H = Math.min(46, TH - 24);
  g.quad([uc - W / 2, bv + 0.4, bz], [W, 0, 0], [0, 0, -H], (l, s, t, x, y) => {
    const m = Math.abs(s - 0.5) * 2;
    if (t > 1 - 0.16 * (1 - m)) return undefined;
    if (m > 0.88 || t < 0.05 || t > 0.9 - 0.16 * (1 - m)) return ramp(PAL.trim, l * 0.9 + 0.05, x, y);
    const ft = (t - 0.22) / 0.5;
    if (ft > 0 && ft < 1 && m < 0.42 * Math.pow(Math.sin(Math.PI * Math.pow(ft, 0.8)), 0.9)) return ramp(PAL.trim, l + 0.15, x, y); // hearth-flame
    return ramp(PAL.cloth, l + (hsh(Math.floor(s * 30), Math.floor(t * 70), 5) - 0.5) * 0.06 + t * 0.05, x, y);
  }, (s, t) => Math.sin(t * 2.6 + s * 1.2) * (0.2 + 1.2 * t));
}

/** South gatehouse (gate runs along u, a 3-tile gap): two towers, a round-headed arch in a crenellated lintel, a raised portcullis behind it. */
function gatehouseS(p: Pen) {
  const g = new FrontPaint(p, 180, 176, 90, 168), A = GW;
  gateTower(g, -A - 20 + 4, -34, 0); gateTower(g, A + 20 - 4, -34, 0);
  // lintel wall: brick face with the arch cut out (voussoir ring), then its parapet
  g.quad([-A, -2, 0], [2 * A, 0, 0], [0, 0, GLINTEL], (l, s, t, x, y) => {
    const u = -A + s * 2 * A, z = t * GLINTEL, top = GSPRING + (GCROWN - GSPRING) * Math.sqrt(Math.max(0, 1 - (u / A) ** 2));
    if (z < top) return undefined;
    if (z < top + 6) {
      const ang = Math.atan2(z - GSPRING, u) / (Math.PI / 11);
      if (z < GSPRING) return ramp(PAL.stone, l + 0.18 - (Math.floor(z / 8) * 8 === Math.floor(z) ? 0.2 : 0), x, y);
      return ramp(PAL.stone, l + 0.2 - (ang - Math.floor(ang) < 0.1 ? 0.22 : 0), x, y);
    }
    if (z > GLINTEL - 5 && z < GLINTEL - 1) return ramp(PAL.trim, l, x, y);
    return brickWall()(l, s, t, x, y);
  });
  g.box(-A, A, -32, -2, GLINTEL - 1, GLINTEL, stone(0.12), 1);
  merlons(g, -A, A, -32, -2, GLINTEL, false);
  // keystone shield with the clan's trim over the arch
  g.box(-5, 5, -2.6, -1.9, GCROWN + 6, GCROWN + 17, mat(PAL.trim, 0), 2);
  g.box(-2, 2, -2.7, -1.9, GCROWN + 9, GCROWN + 14, mat(PAL.cloth, 0.05), 2);
  // portcullis, raised: its lowest teeth hang into the arch
  const bars = (l: number, s: number, t: number, x: number, y: number) => {
    const u = -42 + s * 84, z = 44 + t * 40, ph = ((u + 42) % 8 + 8) % 8, d = Math.abs(ph - 4);
    if (d < 1.1) return ramp(IRONR, l * 1.05 - 0.1 + (z < 49 ? 0.25 : 0), x, y);
    if (Math.abs(z - 58) < 1.3 || Math.abs(z - 72) < 1.3) return ramp(IRONR, l - 0.1, x, y);
    return undefined;
  };
  g.quad([-42, -16, 44], [84, 0, 0], [0, 0, 40], bars);
  g.rod([-42, -16, 61], [42, -16, 61], 0.5, metal(-0.1)); // chain cross-bar
}

/** Side gatehouse (west / east wall, the gate runs along v, a 3-tile gap): two towers joined by a crenellated arch walk, seen from the south. */
function gatehouseW(p: Pen) {
  const g = new FrontPaint(p, 60, 268, 30, 176);
  const TW = 62;
  gateTower(g, 0, -82, -46, TW); gateTower(g, 0, 46, 82, TW);
  // the arch's springers reach out from both towers over the road (the road itself stays open under them), and a raised portcullis
  // shows its iron teeth below the northern one
  for (const [v0, v1] of [[-46, -36], [36, 46]] as const) {
    g.box(-11, 11, v0, v1, TW - 14, TW, brickWall(0.04), 3);
    g.box(-12, 12, v0, v1 + 0.5, TW - 16, TW - 13, mat(PAL.trim, -0.05), 3);
  }
  g.quad([-10, -35.5, TW - 16], [20, 0, 0], [0, 0, -9], (l, s, t, x, y) => {
    const ph = ((s * 20) % 5 + 5) % 5, d = Math.abs(ph - 2.5);
    return d < 0.9 && t < 0.5 + 0.5 * (1 - d / 0.9) * 0 + 0.55 - (d / 0.9) * 0.3 ? ramp(IRONR, l * 1.05 - 0.1, x, y) : t < 0.16 ? ramp(IRONR, l - 0.15, x, y) : undefined;
  });
}

/** Frame metrics of the two gatehouse sheets: the anchor is the foot (south front) of the building, texels. */
export const GATEHOUSES = {
  south: { w: 180, h: 176, ox: 90, oy: 168, draw: gatehouseS },
  side: { w: 60, h: 268, ox: 30, oy: 258, draw: gatehouseW },
};
export const gatehouseKey = (side: CityGate["side"], clan: ClanKey = "wardens") => `gatehouse_${clan}_${side === "south" ? "south" : "side"}`;

/** One gatehouse sheet as RGBA bytes with the 1px outline (the preview tool uses it too). */
export function bakeGatehouse(side: CityGate["side"], clan: ClanKey = "wardens"): Uint8ClampedArray {
  const { w, h, draw } = GATEHOUSES[side === "south" ? "south" : "side"], buf = new Uint32Array(w * h);
  PAL = PALS[clan];
  const px = (x: number, y: number, c: number, a = 1) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x, o = buf[i];
    if (a >= 1 || !(o >>> 24)) { buf[i] = ((a >= 1 ? 255 : Math.round(a * 255)) << 24 | c) >>> 0; return; }
    const mix = (sh: number) => Math.round(((o >> sh) & 255) * (1 - a) + ((c >> sh) & 255) * a) << sh;
    buf[i] = (0xff000000 | mix(16) | mix(8) | mix(0)) >>> 0;
  };
  draw({ px } as Pen);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && buf[y * w + x] >>> 24 > 140;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = buf[y * w + x];
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) v = (0xe0 << 24 | OUTLINE) >>> 0;
    const j = (y * w + x) * 4;
    out[j] = (v >> 16) & 255; out[j + 1] = (v >> 8) & 255; out[j + 2] = v & 255; out[j + 3] = v >>> 24;
  }
  return out;
}

/**
 * Paints a city gate's gatehouse (cosmetic, client-only, no collision): two towers on the wall tiles flanking the 3-tile gap, a
 * crenellated arch over it with a raised portcullis and clan banners in the clan's colours. The south gate faces down; the
 * west and east gates share one sheet seen from the south. Returns the sprite so the caller can destroy it with the city.
 * `gate.tiles` are map tiles; the sprite sits at the building's foot, depth by foot y like the city props.
 */
export function paintGatehouse(scene: Phaser.Scene, gate: CityGate, clan: string): Phaser.GameObjects.Image {
  const ck = (clan in PALS ? clan : "wardens") as ClanKey, key = gatehouseKey(gate.side, ck), a = GATEHOUSES[gate.side === "south" ? "south" : "side"];
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, a.w, a.h)!, ctx = tex.getContext(), img = ctx.createImageData(a.w, a.h);
    img.data.set(bakeGatehouse(gate.side, ck)); ctx.putImageData(img, 0, 0);
    tex.refresh();
    tex.setFilter(1 /* Phaser.Textures.FilterMode.NEAREST */);
  }
  const t = gate.tiles, mid = t[Math.floor(t.length / 2)];
  // south: centred on the gap, foot at the wall row's bottom edge; side: centred on the wall column, foot at the south tower's front
  const x = (mid.x + 0.5) * TILE, y = gate.side === "south" ? (mid.y + 1) * TILE : (mid.y + 0.5) * TILE + 82;
  return scene.add.image(x, y, key).setOrigin(a.ox / a.w, a.oy / a.h).setDepth(y);
}
