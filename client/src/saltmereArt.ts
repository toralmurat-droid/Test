import Phaser from "phaser";
import { TILE } from "../../shared/constants";
import { EMPTY, GROUND, OBJECTS, T } from "../../shared/map";
import { JETTY_RUNS, SALT_LANE, SALT_PIERS, SALT_RACKS, SALT_SQUARE, SALT_TOWN } from "../../shared/saltmere";
import { ISO } from "./isoflag";
import { isoAnchor } from "./iso";
import { hsh, IsoPaint, mat, ramp, type Mat, type V3 } from "./isoPaint";
import { BONER, BRASSR, IRONR, REDR, ROPER, stone, STONER, WOODR, wood } from "./isoProps";
import { SALT_GLOWS, SALT_PERCHES } from "./saltmereReg";
import { staticObj } from "./staticChunks";
import { sheet } from "./worldProps";

/**
 * Saltmere's harbour (docs/saltmere-rework-progress.md, phase 2): moored fishing smacks at the pier heads, rowboats
 * drawn up on the sand, a bell buoy offshore, mooring posts and lobster pots on the piers, breakwater boulders along the
 * shore east and west of the harbour square, boulders along the harbour-mouth shore between the piers and fish drying on the
 * racks. Cosmetic only: sprites, nothing here touches collisions.
 *
 * Where things stand is read from the map once (piers are BRIDGE tiles over water, the breakwater sits on water tiles
 * that touch the shore, rowboats on beach sand), with the layout constants of shared/saltmere.ts. Props are painted as
 * isometric pixel art with isoPaint.ts at the same 1.5 texels per world px as the other world props.
 */

const TX = 1.5;
const TAU = Math.PI * 2;
const N = 6;

// ---- palettes (dark -> light) ------------------------------------------------------------------------------------
const TAR = [0x0a0807, 0x16110e, 0x241c16, 0x352a20, 0x483a2c, 0x5c4a38];
const PAINT_BLUE = [0x0a1220, 0x14233a, 0x203c60, 0x30588a, 0x4676aa];
const PAINT_GREEN = [0x0a1810, 0x14301e, 0x1f4a2e, 0x2f6a44, 0x468a5c];
const PAINT_OCHRE = [0x2a1c08, 0x4a3410, 0x7a5a1c, 0xa87c2c, 0xd0a444];
const PAINT_CREAM = [0x2c2820, 0x544c3c, 0x847a64, 0xb4a888, 0xdcd2b4];
const SAIL_TAN = [0x2e2820, 0x5a4e3a, 0x8c7c58, 0xb8a678, 0xdccc9c];
const SAIL_GREY = [0x2c3036, 0x4e565e, 0x7a848c, 0xa8b2b8, 0xd0d8dc];
const PLANK = [0x2a1c10, 0x4a3320, 0x6e4e30, 0x92703f, 0xb8925a];
const FOAM = [0x6c98a8, 0x9cc0cc, 0xcfe4ea, 0xeef8fa];
const MOSS = [0x1c2a14, 0x2c4020, 0x40582c, 0x5c7a3c];
const FISH = [0x1e262c, 0x34424a, 0x52646e, 0x7a8e98, 0xa8bcc4, 0xd4e2e6];
const SMOKED = [0x2a1a0c, 0x4a2c14, 0x7a4a20, 0xa8702c, 0xd09a44];
const LAMP = [0xc05a18, 0xf08a2c, 0xffc860, 0xffeaa8, 0xfff8e0];

// ---- shared shapes -------------------------------------------------------------------------------------------------
interface HullSpec {
  /** Length along u, half-beam, sheer height at the middle, extra sheer rise at the bow, keel depth below the sheer. */
  L: number; B: number; zb: number; rise: number; D: number;
  /** Waterline at z = 0 (afloat), or the keel resting on the ground (beached). */
  afloat: boolean;
}
/** A clinker-ish hull's lines: u, half-beam, sheer height, keel depth and the angle where the waterline cuts it. */
function lines(h: HullSpec) {
  const u = (s: number) => h.L / 2 - s * h.L; // bow at +u (s = 0), stern at -u
  const b = (s: number) => (s < 0.45 ? h.B * Math.sqrt(Math.max(0, 1 - Math.pow((0.45 - s) / 0.45, 2.2))) : h.B * (1 - 0.3 * Math.pow((s - 0.45) / 0.55, 2)));
  const zt = (s: number) => h.zb + h.rise * Math.pow(1 - s, 2) + 1.2 * Math.pow(s, 3);
  const D = (s: number) => (h.afloat ? Math.max(h.D * (0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, 0.1 + 0.85 * s))), zt(s) * 1.08) : zt(s));
  const th0 = (s: number) => (h.afloat ? Math.acos(Math.min(1, zt(s) / D(s))) : 0);
  return { u, b, zt, D, th0 };
}

/** Hull planking: clinker seams, a painted sheer strake, a dark boot-top; the far side shows the pale inside. */
const hullMat = (paint: number[], side: number, seed: number): Mat => (l, s, t, x, y) => {
  if (side < 0) return ramp(PLANK, l - 0.12 + (hsh(Math.floor(s * 30), 3, seed) - 0.5) * 0.14 + (Math.floor(s * 22) % 2 ? 0.05 : -0.04), x, y);
  const seam = (t * 4.6) % 1 < 0.09;
  const wear = (hsh(Math.floor(s * 46), Math.floor(t * 9), seed) - 0.5) * 0.2;
  if (t > 0.84) return ramp(paint, l + 0.08 + wear * 0.5 - (seam ? 0.14 : 0), x, y); // sheer strake
  if (t < 0.1) return ramp(MOSS, l - 0.1 + wear, x, y); // weed at the waterline
  return ramp(TAR, l * 1.05 + wear - (seam ? 0.22 : 0.04), x, y);
};

/** The hull shell (both sides), its transom, the rail, the deck and foam round the waterline. Returns the line helpers. */
function paintHull(g: IsoPaint, h: HullSpec, paint: number[], seed: number, upturned = false) {
  const ln = lines(h);
  const { u, b, zt, D, th0 } = ln;
  if (h.afloat) { // foam first, so the hull covers it
    for (let i = 0; i <= 160; i++) {
      const s = i / 160;
      for (const side of [-1, 1]) for (const k of [1.06, 1.16, 1.3]) {
        if (hsh(i, side + k * 10, seed + 4) < 0.28 + (k - 1) * 0.9) continue;
        const hw = b(s) * Math.sin(th0(s)) * k + (k - 1) * 3;
        g.plot(u(s), side * hw, 0, ramp(FOAM, 0.9 - (k - 1) * 2.2 + (hsh(i, 7, seed) - 0.5) * 0.4, i, side), -4);
      }
    }
    for (let a = 0; a < 40; a++) { // bow wave and stern wash
      const an = (a / 40) * Math.PI;
      for (const [end, r] of [[0, 4.5], [1, 6]] as const) {
        if (hsh(a, end, seed + 9) < 0.45) continue;
        g.plot(u(end) + (end ? -1 : 1) * Math.sin(an) * r, Math.cos(an) * r * 1.3, 0, ramp(FOAM, 0.7, a, end), -4);
      }
    }
  }
  if (upturned) {
    g.sheet((s, t) => {
      const ss = s, th = (t - 0.5) * Math.PI;
      return [u(ss), b(ss) * Math.sin(th), 0.6 + zt(ss) * 0.85 * Math.cos(th)];
    }, 110, 40, (l, s, t, x, y) => {
      const seam = (t * 6) % 1 < 0.1;
      if (Math.abs(t - 0.5) < 0.03) return ramp(TAR, 0.18, x, y); // keel strip
      if (t < 0.07 || t > 0.93) return ramp(paint, l + 0.05, x, y);
      return ramp(TAR, l * 1.1 - (seam ? 0.2 : 0) + (hsh(Math.floor(s * 40), Math.floor(t * 8), seed) - 0.5) * 0.2, x, y);
    });
    return ln;
  }
  for (const side of [-1, 1]) {
    g.sheet((s, t) => {
      const th = th0(s) + t * (Math.PI / 2 - th0(s));
      return [u(s), side * b(s) * Math.sin(th), zt(s) - D(s) * Math.cos(th)];
    }, 150, 36, hullMat(paint, side, seed));
  }
  // transom
  g.surf((s, t) => {
    const zl = h.afloat ? 0 : 0.2, z = zl + (zt(1) - zl) * t, hw = b(1) * Math.sqrt(Math.max(0, 1 - Math.pow((zt(1) - z) / D(1), 2)));
    return [[u(1), (s * 2 - 1) * hw, z], [-1, 0, 0]];
  }, 40, 16, (l, s, t, x, y) => ramp(PLANK, l * 0.8 + (Math.floor(t * 4) % 2 ? 0 : 0.06) - 0.05, x, y));
  // rail
  for (const side of [-1, 1]) for (let i = 0; i < 28; i++) {
    const s0 = i / 28, s1 = (i + 1) / 28;
    g.rod([u(s0), side * b(s0), zt(s0)], [u(s1), side * b(s1), zt(s1)], 0.85, wood(WOODR, 0.2, 8));
  }
  return ln;
}

// ---- fishing smack -----------------------------------------------------------------------------------------------
export const SMACK = { W: 176, H: 190, OY: 142, L: 124 };
/** A moored gaff-rigged smack, sail furled on the boom, along u (the sprite is flipped for a berth along v). */
function smack(variant: number) {
  const { W, H, OY } = SMACK;
  return (p: import("./worldProps").Pen) => {
    const g = new IsoPaint(p, W, H, W / 2, OY);
    const paint = [PAINT_BLUE, PAINT_OCHRE][variant % 2], sail = [SAIL_TAN, SAIL_GREY][variant % 2];
    const h: HullSpec = { L: SMACK.L, B: 17, zb: 12.5, rise: 7, D: 18, afloat: true };
    const { u, b, zt } = paintHull(g, h, paint, 11 + variant * 5);
    const deck = (s: number) => zt(s) - 3.6;
    // deck planks
    g.surf((s, t) => [[u(0.04 + s * 0.94), (t * 2 - 1) * b(0.04 + s * 0.94) * 0.9, deck(0.04 + s * 0.94)], [0, 0, 1]], 120, 20,
      (l, s, t, x, y) => ramp(PLANK, l * 0.9 + (Math.floor(t * 9) % 2 ? 0.04 : -0.06) + (hsh(Math.floor(s * 50), Math.floor(t * 9), 3) - 0.5) * 0.1, x, y));
    // doghouse aft
    const cu0 = -44, cu1 = -12, cz = deck(0.75);
    g.box(cu0, cu1, -8.5, 8.5, cz, cz + 11, (l, s, t, x, y) => {
      const win = s > 0.2 && s < 0.8 && t > 0.4 && t < 0.78;
      return win ? ramp([0x0a0e14, 0x1a2a3a, 0x3a5470, 0x6e94b0], 0.35 + t * 0.3, x, y) : ramp(PAINT_CREAM, l + 0.03 + (hsh(Math.floor(s * 20), Math.floor(t * 10), 5) - 0.5) * 0.1, x, y);
    });
    g.box(cu0 - 1.5, cu1 + 1.5, -10, 10, cz + 11, cz + 12.6, wood(WOODR, -0.05, 20)); // roof
    // hatch and a rope coil on the foredeck
    g.box(10, 20, -4.5, 4.5, deck(0.4), deck(0.4) + 3, wood(WOODR, 0.05, 10));
    g.blob([34, 5, deck(0.18) + 0.8], 5, 5, 1.5, mat(ROPER, 0.05));
    g.blob([34, 5, deck(0.18) + 1.9], 2.2, 2.2, 0.7, mat(ROPER, -0.2));
    // lobster pots lashed in the bow
    for (const [pu, pv] of [[42, -4], [46, 3]] as const) g.blob([pu, pv, deck(0.1) + 2.6], 4.2, 3.6, 3.4, (l, s, t, x, y) => ((Math.floor(s * 14) + Math.floor(t * 6)) % 2 ? ramp(ROPER, l * 0.9, x, y) : ramp(WOODR, l - 0.15, x, y)), 0.5, 1);
    // mast with a slight rake, shrouds, forestay
    const mast: V3 = [11, 0, deck(0.4)], top: V3 = [8.5, 0, 92];
    g.rod(mast, top, 1.9, wood(WOODR, 0.1, 80));
    g.blob([top[0], top[1], top[2] + 1], 2.2, 2.2, 1.6, mat(BRASSR, 0.05));
    for (const side of [-1, 1]) {
      g.rod([9.4, side * 0.5, 66], [4, side * (b(0.5) - 0.5), zt(0.5)], 0.35, mat(ROPER, -0.1));
      g.rod([9.4, side * 0.5, 66], [16, side * (b(0.38) - 0.5), zt(0.38)], 0.35, mat(ROPER, -0.1));
    }
    g.rod([top[0], 0, 88], [76, 0, zt(0) + 1], 0.38, mat(ROPER, -0.1));
    g.rod([48, 0, zt(0.08)], [82, 0, zt(0) + 5.5], 1, wood(WOODR, 0.05, 30)); // bowsprit
    // boom with the sail furled on it, gaff lashed alongside
    g.rod([9.5, 0, 25], [-62, 0, 29], 1.3, wood(WOODR, 0.1, 70));
    g.blob([-24, 0.2, 27.7], 36, 3.6, 3.4, (l, s, t, x, y) => ramp(sail, l + (hsh(Math.floor(s * 30), Math.floor(t * 6), 4) - 0.5) * 0.25, x, y));
    for (const bu of [-6, -22, -38, -52]) g.rod([bu, 0, 27.6], [bu + 0.5, 0, 27.6], 3.9, mat(ROPER, -0.1)); // gaskets
    g.rod([8.6, 0, 69], [-26, 0, 31], 0.85, wood(WOODR, 0.05, 45));
    // fenders along the near rail, a lantern on the stern post
    for (const fu of [18, -2]) { const s = (62 - fu) / h.L; g.rod([fu, b(s) + 0.5, zt(s) - 0.5], [fu, b(s) + 1.2, zt(s) - 3], 0.25, mat(ROPER)); g.blob([fu, b(s) + 1.6, zt(s) - 5.2], 1.9, 1.9, 3, mat(PAINT_CREAM, 0.1)); }
    g.rod([-61, 0, zt(1)], [-61, 0, zt(1) + 11], 0.8, wood(WOODR, 0, 12));
    g.box(-62.6, -59.4, -1.6, 1.6, zt(1) + 8, zt(1) + 12.5, (l, s, t, x, y) => ramp(LAMP, 0.25 + l * 0.35, x, y));
  };
}

// ---- rowboat -----------------------------------------------------------------------------------------------------
export const ROWBOAT = { W: 120, H: 84, OY: 56 };
/** A clinker rowboat drawn up on the sand (upright with oars and a coil, or upturned), along u. */
function rowboat(variant: number) {
  const { W, H, OY } = ROWBOAT;
  return (p: import("./worldProps").Pen) => {
    const g = new IsoPaint(p, W, H, W / 2, OY);
    const paint = [PAINT_GREEN, PAINT_OCHRE, PAINT_BLUE][variant % 3];
    const h: HullSpec = { L: 66, B: 13, zb: 7.5, rise: 3.5, D: 8, afloat: false };
    for (const [su, sv] of [[-20, 0], [4, 1], [26, 0]]) g.shadow(su, sv + 3, 13, 0.4);
    if (variant === 1) { paintHull(g, h, paint, 21 + variant, true); g.blob([-8, 26, 0.6], 4, 2.2, 1.2, stone(0.1)); return; }
    const { u, b, zt } = paintHull(g, h, paint, 21 + variant);
    g.surf((s, t) => [[u(0.06 + s * 0.9), (t * 2 - 1) * b(0.06 + s * 0.9) * 0.88, 2.2], [0, 0, 1]], 70, 14, (l, s, t, x, y) => ramp(PLANK, l * 0.85 + (Math.floor(t * 8) % 2 ? 0.04 : -0.05), x, y));
    for (const tu of [12, -6, -22]) { const s = (33 - tu) / h.L; g.box(tu - 2, tu + 2, -b(s) * 0.92, b(s) * 0.92, 4.4, 6, wood(WOODR, 0.12, 10)); } // thwarts
    if (variant === 2) { // a heap of net and floats
      g.blob([-10, 0, 6], 7, 5.5, 3.4, (l, s, t, x, y) => (((x + y) % 3 === 0 || (x - y + 99) % 3 === 0) ? ramp(ROPER, l * 0.9, x, y) : ramp(TAR, 0.2, x, y)), 0.45, 1);
      g.blob([-6, 3, 8.2], 1.5, 1.5, 1.5, mat(REDR, 0.05));
    } else { g.blob([-18, 0, 4.4], 4.2, 4.2, 1.3, mat(ROPER, 0.05)); g.rod([4, -4, 6.5], [30, 3, 7.3], 0.6, wood(WOODR, 0.15, 30)); } // coil, a boathook
    // two oars lying on the sand beside it
    for (const [ou, ov, k] of [[-30, 22, 0], [-24, 26.5, 1]] as const) {
      g.rod([ou, ov, 0.8], [ou + 52, ov + 1.5 - k, 0.8], 0.75, wood(WOODR, 0.1, 50));
      g.box(ou + 50, ou + 62, ov + 0.8 - k, ov + 3.2 - k, 0.5, 1.3, wood(WOODR, 0.2, 12));
    }
  };
}

// ---- bell buoy ---------------------------------------------------------------------------------------------------
export const BUOY = { W: 76, H: 120, OY: 96 };
/** A red and white bell buoy: float, tripod cage, bell and lamp, rocking on the swell (6 frames). */
function bellBuoy(p: import("./worldProps").Pen, f: number) {
  const { W, H, OY } = BUOY;
  const g = new IsoPaint(p, W, H, W / 2, OY), sw = Math.sin((f / N) * TAU), cl = Math.sin((f / N) * TAU * 2 + 1);
  const lean = (z: number): [number, number] => [sw * z * 0.07, -sw * z * 0.04];
  for (let i = 0; i < 70; i++) { // foam ring
    if (hsh(i, 2, 33) < 0.35) continue;
    const a = (i / 70) * TAU, r = 16 + hsh(i, 5, 33) * 6;
    g.plot(Math.cos(a) * r, Math.sin(a) * r, 0, ramp(FOAM, 0.4 + hsh(i, 6, 33) * 0.5, i, 1), -4);
  }
  g.blob([lean(2)[0], lean(2)[1], 0], 13.5, 13.5, 11, (l, s, t, x, y) => ramp(Math.floor(s * 8) % 2 ? REDR : WHITE, l + (t < 0.25 ? -0.25 : 0), x, y), 0.5, 1);
  g.box(-10, 10, -10, 10, 10.5, 12, wood(WOODR, -0.1, 8)); // deck ring is a square plate
  const rim = (k: number): V3 => { const a = (k / 4) * TAU + Math.PI / 4, [lu, lv] = lean(11); return [lu + Math.cos(a) * 9, lv + Math.sin(a) * 9, 11]; };
  for (let k = 0; k < 4; k++) { // cage rods up to the lamp platform
    const a = (k / 4) * TAU + Math.PI / 4, [tu, tv] = lean(46);
    g.rod(rim(k), [tu + Math.cos(a) * 4.6, tv + Math.sin(a) * 4.6, 46], 0.9, (l, s, t, x, y) => ramp(IRONR, l * 0.9 + 0.1, x, y));
  }
  { const [mu, mv] = lean(30); for (const z of [20, 32]) { const [qu, qv] = lean(z), r = 7.6 - (z - 11) * 0.12; for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + Math.PI / 4, a1 = ((k + 1) / 4) * TAU + Math.PI / 4; g.rod([qu + Math.cos(a) * r, qv + Math.sin(a) * r, z], [qu + Math.cos(a1) * r, qv + Math.sin(a1) * r, z], 0.5, mat(IRONR, 0)); } void mu; void mv; } }
  { const [bu, bv] = lean(32); g.blob([bu + cl * 0.9, bv, 29.5], 3.1, 3.1, 3.6, mat(BRASSR, 0.05), 0, 0.85); g.rod([bu, bv, 36], [bu + cl * 0.9, bv, 33], 0.3, mat(IRONR)); } // the bell
  const [pu, pv] = lean(46);
  g.box(pu - 5.5, pu + 5.5, pv - 5.5, pv + 5.5, 45.5, 47, (l, s, t, x, y) => ramp(IRONR, l, x, y));
  const [lu, lv] = lean(54);
  g.box(lu - 2.6, lu + 2.6, lv - 2.6, lv + 2.6, 47, 56, (l, s, t, x, y) => (t > 0.12 && t < 0.88 && s > 0.12 && s < 0.88 ? ramp(LAMP, 0.6 + t * 0.3, x, y) : ramp(IRONR, l, x, y)));
  g.blob([lu, lv, 56.2], 3.6, 3.6, 2.6, (l, s, t, x, y) => ramp(IRONR, l + 0.1, x, y), 0.5, 1);
  g.rod([lu, lv, 58], [lu, lv, 64], 0.4, mat(IRONR));
}
const WHITE = [0x2c3036, 0x5c646c, 0x949ca4, 0xc8d0d4, 0xf0f4f4];

// ---- mooring post, lobster pots, boulders -----------------------------------------------------------------------
export const POST = { W: 24, H: 44, OY: 36, HEIGHT: 22 };
function mooringPost(p: import("./worldProps").Pen) {
  const { W, H, OY } = POST;
  const g = new IsoPaint(p, W, H, W / 2, OY);
  g.shadow(1, 1, 5, 0.4);
  g.rod([0, 0, 0], [0, 0, POST.HEIGHT], 2.7, (l, s, t, x, y) => ramp(WOODR, l * 1.1 + (hsh(Math.floor(s * 7), Math.floor(t * 20), 3) - 0.5) * 0.2, x, y));
  g.blob([0, 0, POST.HEIGHT + 0.4], 3.1, 3.1, 1.3, wood(WOODR, 0.15), 0.5, 1);
  for (const z of [16.2, 17.6]) g.rod([0, 0, z], [0, 0, z + 0.7], 3.3, mat(ROPER, 0.1)); // two turns of rope
  g.rod([0, 0, 3.4], [0, 0, 4.2], 3.1, mat(IRONR, 0.05)); // iron band
  g.blob([5.4, 3.4, 0.7], 3, 2.6, 0.7, mat(ROPER, -0.05)); // the loose end, coiled
  g.rod([2.6, 1.6, 16], [4.6, 3, 1.4], 0.4, mat(ROPER, -0.1));
}

export const POTS = { W: 64, H: 46, OY: 36 };
/** A stack of lobster creels with a red and white float; variant 1 is two pots and a rope coil. */
function lobsterPots(variant: number) {
  const { W, H, OY } = POTS;
  return (p: import("./worldProps").Pen) => {
    const g = new IsoPaint(p, W, H, W / 2, OY);
    g.shadow(0, 2, 11, 0.4);
    const pot = (c: V3, k: number) => {
      g.blob([c[0], c[1], c[2] + 4], 7, 5.6, 4.6, (l, s, t, x, y) => {
        if (t > 0.9) return ramp(WOODR, l, x, y);
        const hoop = Math.floor(t * 7) % 2 === 0, slat = (Math.floor(s * 22) + k) % 3 === 0;
        return hoop ? ramp(WOODR, l * 1.05 + 0.1, x, y) : slat ? ramp(ROPER, l * 0.8, x, y) : ramp(WOODR, l * 0.75 - 0.1, x, y);
      }, 0, 0.95);
      g.box(c[0] - 8, c[0] + 8, c[1] - 6.4, c[1] + 6.4, c[2], c[2] + 1.3, wood(WOODR, -0.05, 10)); // base frame
      g.blob([c[0] + 3.2, c[1] + 4.4, c[2] + 3.4], 2, 1.2, 2.2, mat(TAR, -0.1)); // the funnel's mouth
    };
    if (variant === 0) {
      pot([-8, -2, 0], 0); pot([8, 1, 0], 1); pot([0, -0.5, 9.6], 2);
      g.blob([-14, 8, 2.4], 2.6, 2.6, 2.6, (l, s, t, x, y) => ramp(t > 0.5 ? REDR : WHITE, l, x, y));
    } else {
      pot([-6, 0, 0], 3); pot([8, 3, 0], 0);
      g.blob([4, -9, 1.4], 6, 6, 1.6, mat(ROPER, 0.05)); g.blob([4, -9, 2.8], 3.2, 3.2, 0.8, mat(ROPER, -0.15));
    }
  };
}

export const BOULDER = { W: 60, H: 46, OY: 32 };
/** Breakwater rock: a grey boulder or two, wet and dark at the foot, with foam lapping. */
function boulder(variant: number) {
  const { W, H, OY } = BOULDER;
  return (p: import("./worldProps").Pen) => {
    const g = new IsoPaint(p, W, H, W / 2, OY);
    const sets: [number, number, number, number, number, number][][] = [
      [[0, 0, 0, 15, 12, 10], [-11, 7, 0, 6, 5, 4]], [[0, 0, 0, 14, 11, 9], [10, 6, 0, 7, 6, 5]],
      [[-4, 2, 0, 13, 12, 12], [8, -6, 0, 6, 7, 6], [12, 8, 0, 5, 5, 4]], [[0, 0, 0, 12, 10, 7], [-9, 5, 0, 6, 5, 5]],
    ];
    const blobs = sets[variant % 4];
    for (const [cu, cv, cz, ru, rv, rz] of blobs) {
      for (let i = 0; i < 46; i++) {
        if (hsh(i, cu + variant, 19) < 0.62) continue;
        const a = (i / 46) * TAU, k = 1.12 + hsh(i, 3, 19) * 0.3;
        g.plot(cu + Math.cos(a) * ru * k, cv + Math.sin(a) * rv * k, 0, ramp(FOAM, 0.35 + hsh(i, 4, 19) * 0.5, i, 3), -4);
      }
      g.blob([cu, cv, cz + 1], ru, rv, rz, (l, s, t, x, y) => {
        if (t < 0.3) return ramp(STONER, l * 0.7 - 0.12, x, y); // wet at the foot
        if (t > 0.66 && hsh(Math.floor(s * 16), Math.floor(t * 8), variant) < 0.12) return ramp(MOSS, 0.4 + l * 0.4, x, y);
        return ramp(STONER, l * 1.15 + (hsh(x >> 1, y >> 1, 11) - 0.5) * 0.22 - (hsh(x, y, 12) < 0.07 ? 0.2 : 0), x, y);
      }, 0.3, 1);
    }
  };
}

// ---- fish racks --------------------------------------------------------------------------------------------------
export const FISHRACK = { W: 124, H: 56, OY: 14 };
/** Split fish hung in rows on a drying line along u, swaying (6 frames). The posts are the map's fence. */
function fishLine(p: import("./worldProps").Pen, f: number) {
  const { W, H, OY } = FISHRACK;
  const g = new IsoPaint(p, W, H, 30, OY), ph = (f / N) * TAU;
  const sag = (s: number) => 27 - Math.sin(s * Math.PI) * 2.4;
  for (let i = 0; i < 24; i++) g.rod([i * 4, 0, sag(i / 24)], [(i + 1) * 4, 0, sag((i + 1) / 24)], 0.35, mat(ROPER));
  for (let k = 0; k < 11; k++) {
    const s = (k + 0.5) / 11, x = s * 96, swing = Math.sin(ph + k * 1.7) * 0.7, z0 = sag(s), len = 11 + hsh(k, 1, 41) * 3.5;
    g.rod([x, 0.8, z0], [x + swing * 0.3, 1.2 + swing, z0 - 2.4], 0.22, mat(ROPER, -0.15));
    g.blob([x + swing * 0.3, 1.4 + swing, z0 - 2.4 - len * 0.5], 1.15, 1.9, len * 0.5, (l, s2, t, x2, y2) => ramp(k % 3 ? SMOKED : FISH, l + (t > 0.78 ? 0.14 : 0) - (t < 0.1 ? 0.22 : 0), x2, y2));
  }
}

// ---- placing -----------------------------------------------------------------------------------------------------
const hash = (x: number, y: number, s: number) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const gAt = (x: number, y: number) => GROUND[y]?.[x];
const oAt = (x: number, y: number) => OBJECTS[y]?.[x];
const isWater = (x: number, y: number) => gAt(x, y) === T.WATER;

interface Spot { key: string; x: number; y: number; ox: number; oy: number; flip?: boolean; depth?: number; bob?: number; frames?: number; fps?: number }
let layout: Spot[] | undefined;

/** A pier: the column and the BRIDGE rows over the water; the head row has the T. Data from the map, not hand-listed. */
function piers() {
  const cols: { x: number; rows: number[]; xmin: number; xmax: number; yT: number }[] = [];
  const add = (x: number, y0: number) => {
    const rows: number[] = [];
    for (let y = y0; y < y0 + 40; y++) if (gAt(x, y) === T.BRIDGE) rows.push(y); else if (rows.length) break;
    if (!rows.length) return;
    let yT = rows[rows.length - 1], xmin = x, xmax = x; // yT: the T across the head (the widest row)
    for (const y of rows) {
      let a = x, b = x;
      while (gAt(a - 1, y) === T.BRIDGE) a--;
      while (gAt(b + 1, y) === T.BRIDGE) b++;
      if (b - a >= xmax - xmin && (b - a > 0 || y === rows[0])) { xmin = a; xmax = b; yT = y; }
    }
    cols.push({ x, rows, xmin, xmax, yT });
  };
  for (const px of SALT_PIERS) add(px, SALT_LANE + 1);
  for (const j of JETTY_RUNS) add(j.x, j.y0);
  return cols;
}

function buildLayout(): Spot[] {
  const out: Spot[] = [];
  const SQ = SALT_SQUARE, ST = SALT_TOWN;
  const ps = piers();
  const free = (x: number, y: number) => oAt(x, y) === EMPTY;
  // moored smacks beside each pier head, on the water, and mooring posts / pots on the piers
  ps.forEach((pr, i) => {
    const yh = pr.yT;
    const west = (i % 2 === 0) ? -1 : 1; // alternate sides
    for (const side of [west, -west]) {
      const xc = side > 0 ? pr.xmax + 2.1 : pr.xmin - 1.1, yc = yh - 0.2;
      let ok = true;
      for (let y = Math.floor(yc - 1.6); y <= Math.floor(yc + 1.6); y++) for (let x = Math.floor(xc - 0.9); x <= Math.floor(xc + 0.9); x++) if (!isWater(x, y)) ok = false;
      if (!ok) continue;
      out.push({ key: `salt_smack${i % 2}`, x: xc * TILE, y: yc * TILE, ox: SMACK.W / 2 / SMACK.W, oy: SMACK.OY / SMACK.H, flip: true, bob: 1 + (i % 3) * 0.2 });
      break;
    }
    pr.rows.forEach((row, k) => { // posts every third row at both edges, a pair at the head's ends
      if (k >= 1 && (k - 1) % 3 === 0 && row < yh) for (const e of [pr.x * TILE + 4, (pr.x + 1) * TILE - 4]) out.push({ key: "salt_post", x: e, y: (row + 0.6) * TILE, ox: 0.5, oy: POST.OY / POST.H });
    });
    for (const e of [pr.xmin * TILE + 5, (pr.xmax + 1) * TILE - 5]) out.push({ key: "salt_post", x: e, y: (yh + 0.92) * TILE, ox: 0.5, oy: POST.OY / POST.H });
    const r2 = pr.rows[Math.min(2, pr.rows.length - 1)], r5 = pr.rows[Math.min(5, pr.rows.length - 1)];
    out.push({ key: "salt_pots0", x: (pr.x + 0.3) * TILE, y: (r2 + 0.75) * TILE, ox: 0.5, oy: POTS.OY / POTS.H });
    if (pr.rows.length > 7) out.push({ key: "salt_pots1", x: (pr.x + 0.72) * TILE, y: (r5 + 0.55) * TILE, ox: 0.5, oy: POTS.OY / POTS.H, flip: true });
  });
  // the bell buoy, out in the harbour mouth between the piers
  const bx = SQ.x + SQ.w / 2 + 1, by = SQ.y + SQ.h + 13;
  if (isWater(Math.floor(bx), by)) out.push({ key: "salt_buoy", x: bx * TILE, y: by * TILE, ox: 0.5, oy: BUOY.OY / BUOY.H, bob: 1.3, frames: N, fps: 5 });
  // rowboats drawn up on the beach: sand near the water, off the square and the piers, apart from each other
  const cands: { x: number; y: number; r: number }[] = [];
  for (let y = SALT_LANE + 2; y < ST.y + ST.h; y++) for (let x = ST.x; x < ST.x + ST.w; x++) {
    if (gAt(x, y) !== T.SAND) continue;
    if (x >= SQ.x - 2 && x <= SQ.x + SQ.w + 1) continue;
    let clear = true, water = false;
    for (let j = -1; j <= 1; j++) for (let i = -2; i <= 2; i++) { if (!free(x + i, y + j) || gAt(x + i, y + j) === T.BRIDGE || gAt(x + i, y + j) === T.WATER) clear = false; }
    for (let j = 2; j <= 4; j++) if (isWater(x, y + j)) water = true;
    if (clear && water && !ps.some((pr) => Math.abs(pr.x - x) < 3)) cands.push({ x, y, r: hash(x, y, 501) });
  }
  cands.sort((a, b) => a.r - b.r);
  const boats: typeof cands = [];
  for (const c of cands) if (boats.length < 3 && boats.every((b) => Math.hypot(b.x - c.x, b.y - c.y) > 9)) boats.push(c);
  boats.forEach((c, i) => out.push({ key: `salt_rowboat${i % 3}`, x: (c.x + 0.5) * TILE, y: (c.y + 0.5) * TILE, ox: 0.5, oy: ROWBOAT.OY / ROWBOAT.H, flip: i === 1 }));
  // breakwater: boulders on water tiles that touch the shore, east and west of the harbour mouth
  let nb = 0;
  for (let y = SALT_LANE + 2; y < ST.y + ST.h + 3 && nb < 30; y++) for (let x = ST.x - 4; x < ST.x + ST.w + 4 && nb < 30; x++) {
    if (!isWater(x, y)) continue;
    if (x >= SQ.x - 1 && x <= SQ.x + SQ.w) continue;
    if (ps.some((pr) => x >= pr.xmin - 3 && x <= pr.xmax + 3 && y >= pr.rows[0] - 1)) continue;
    const shore = [[0, -1], [-1, 0], [1, 0]].some(([dx, dy]) => { const g = gAt(x + dx, y + dy); return g !== undefined && g !== T.WATER && g !== T.BRIDGE; });
    if (!shore || hash(x, y, 77) > 0.75) continue;
    for (let k = 0; k < (hash(x, y, 78) < 0.45 ? 2 : 1); k++) {
      out.push({ key: `salt_boulder${Math.floor(hash(x, y, 79 + k) * 4)}`, x: (x + 0.2 + hash(x, y, 80 + k) * 0.6) * TILE, y: (y + 0.5 + hash(x, y, 82 + k) * 0.4) * TILE, ox: 0.5, oy: BOULDER.OY / BOULDER.H, flip: hash(x, y, 84) < 0.5 });
      nb++;
    }
  }
  // The harbour-mouth shore between the two piers is a staircase of sand (1-2 tiles a step), too ragged for a straight stone
  // kerb (which read as a stray wall on the beach when it stood on the square's edge): boulders on the water tiles that
  // touch it instead, never on the piers' own water or the bell buoy's.
  const pw = Math.min(...SALT_PIERS), pe = Math.max(...SALT_PIERS);
  for (let y = SQ.y + SQ.h + 1; y < SQ.y + SQ.h + 12; y++) for (let x = pw + 2; x <= pe - 2; x++) {
    if (!isWater(x, y) || Math.hypot(x + 0.5 - bx, y + 0.5 - by) < 1.6) continue;
    const shore = [[0, -1], [-1, 0], [1, 0]].some(([dx, dy]) => { const g = gAt(x + dx, y + dy); return g !== undefined && g !== T.WATER && g !== T.BRIDGE; });
    if (!shore || hash(x, y, 177) > 0.8) continue;
    for (let k = 0; k < (hash(x, y, 178) < 0.4 ? 2 : 1); k++) {
      out.push({ key: `salt_boulder${Math.floor(hash(x, y, 179 + k) * 4)}`, x: (x + 0.2 + hash(x, y, 180 + k) * 0.6) * TILE, y: (y + 0.45 + hash(x, y, 182 + k) * 0.4) * TILE, ox: 0.5, oy: BOULDER.OY / BOULDER.H, flip: hash(x, y, 184) < 0.5 });
    }
  }
  // fish drying on the racks beside the smokehouse: one line per run of rack tiles
  const racks = new Map<number, number[]>();
  for (const [rx, ry] of SALT_RACKS) { const r = racks.get(ry) ?? []; r.push(rx); racks.set(ry, r); }
  for (const [ry, xs] of racks) {
    xs.sort((a, b) => a - b);
    out.push({ key: "salt_fishline", x: xs[0] * TILE + TILE / 2, y: (ry + 0.5) * TILE, ox: 30 / FISHRACK.W, oy: FISHRACK.OY / FISHRACK.H, frames: N, fps: 3, depth: (ry + 0.5) * TILE + 3 });
  }
  return out;
}

/** Adds Saltmere's harbour props to the scene. `light` lights a lamp after dusk (worldProps.ts passes details.addLight). */
export function addSaltmereProps(scene: Phaser.Scene, light?: (x: number, y: number, lift: number, dx: number) => void) {
  if (!ISO) return;
  layout ??= buildLayout();
  const mk = (key: string, w: number, h: number, frames: number, draw: (p: import("./worldProps").Pen, f: number) => void) => sheet(scene, key, w, h, frames, draw, 0);
  mk("salt_smack0", SMACK.W, SMACK.H, 1, smack(0)); mk("salt_smack1", SMACK.W, SMACK.H, 1, smack(1));
  for (let v = 0; v < 3; v++) mk(`salt_rowboat${v}`, ROWBOAT.W, ROWBOAT.H, 1, rowboat(v));
  mk("salt_buoy", BUOY.W, BUOY.H, N, bellBuoy);
  mk("salt_post", POST.W, POST.H, 1, mooringPost);
  for (let v = 0; v < 2; v++) mk(`salt_pots${v}`, POTS.W, POTS.H, 1, lobsterPots(v));
  for (let v = 0; v < 4; v++) mk(`salt_boulder${v}`, BOULDER.W, BOULDER.H, 1, boulder(v));
  mk("salt_fishline", FISHRACK.W, FISHRACK.H, N, fishLine);
  for (const k of ["salt_buoy", "salt_fishline"]) if (!scene.anims.exists(`${k}_idle`)) scene.anims.create({ key: `${k}_idle`, frames: scene.anims.generateFrameNumbers(k, { start: 0, end: N - 1 }), frameRate: k === "salt_buoy" ? 5 : 3, repeat: -1 });
  const perches = SALT_PERCHES.length;
  for (const s of layout) {
    const spr = scene.add.sprite(s.x, s.y, s.key, 0).setOrigin(s.ox, s.oy).setScale(1 / TX).setDepth(s.depth ?? s.y).setFlipX(!!s.flip);
    if (s.frames) spr.play({ key: `${s.key}_idle`, startFrame: Math.floor(hash(Math.round(s.x), Math.round(s.y), 9) * N) });
    if (s.bob) { // swell: the hull rides up and down a pixel or so, each out of step
      const a = { x: s.x, y: s.y };
      isoAnchor(spr, a);
      scene.tweens.add({ targets: spr, y: s.y - s.bob, duration: 1900 + hash(Math.round(s.x), Math.round(s.y), 3) * 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: hash(Math.round(s.x), 4, 5) * 1500 });
    }
    staticObj(scene, spr);
    if (s.key === "salt_buoy") light?.(s.x, s.y, 54 / TX, 0);
    if (s.key === "salt_post") SALT_PERCHES.push({ x: s.x, y: s.y, z: POST.HEIGHT / TX + 2 });
  }
  void perches;
}

// ---- night glow ------------------------------------------------------------------------------------------------
let glows: Phaser.GameObjects.Image[] | undefined;
let lastDark = -1;
/** Warm light spilled by Saltmere's windows and lanterns; `d` is the night's darkness (0 day .. 1 night). Called every frame. */
export function saltmereNight(scene: Phaser.Scene, d: number) {
  if (!ISO || !SALT_GLOWS.length || !scene.textures.exists("light")) return;
  if (glows && Math.abs(d - lastDark) < 0.004) return;
  lastDark = d;
  if (!glows) {
    glows = SALT_GLOWS.map((gl) => {
      const img = scene.add.image(gl.x, gl.y - gl.z, "light").setTint(0xffb860).setScale(gl.r).setBlendMode(Phaser.BlendModes.ADD).setDepth(27500).setAlpha(0).setVisible(false);
      isoAnchor(img, { x: gl.x, y: gl.y });
      return img;
    });
  }
  glows.forEach((img, i) => { const a = d * SALT_GLOWS[i].k, on = a > 0.01; if (img.visible !== on) img.setVisible(on); if (on) img.setAlpha(a); });
}
