/**
 * 3D-built heroes (Murat 2026-11-16, "make the vampire look more 3D"): the painted rig (body.ts) still decides every
 * pose, but instead of painting flat shapes the body is lifted into a small 3D model of soft shapes (signed distance
 * fields, like the beast forms in beastForms.ts) and ray-cast from the game's iso camera straight onto the sheet's
 * pixel grid. Every facing gets the same light from the upper left, real occlusion, ambient occlusion in folds and
 * glints on metal; the cape and coat skirts hang and swing as cloth. Output is ordinary pixel art at the same frame
 * size, so the game draws it exactly as before (no runtime cost).
 *
 * Coordinates: rig units (a frame is 32 wide; 1.5 texels each). World X = rig x (screen right), D = depth away from
 * the camera, Z = height above the ground. The camera looks 30 degrees down: screen up V = D*sin30 + Z*cos30.
 */
import { shade } from "../canvas";
import type { HeadGear, Look, TorsoKind } from "./look";

type V3 = [number, number, number];
type P = [number, number];
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const SIN = 0.5, COS = Math.sqrt(3) / 2;

/** What the body wears, already resolved from the Look plus the item being rendered (body.ts dress3D). */
export interface Dress3D {
  torso: TorsoKind; torsoCol: number; trim?: number;
  head: HeadGear | "crown"; headCol: number; headTrim: number; plume?: number;
  legs: Look["legs"]; legCol: number;
  boots: number; bootStyle: NonNullable<Look["bootStyle"]>; bootTrim?: number; wings?: number;
  sleeve: number; arms: Look["arms"]; glove?: number; armour?: { col: number; trim: number };
  belt?: number; buckle?: number;
  cape?: { col: number; collar?: number; short?: boolean; fur?: boolean };
}

/** The rig as body.ts computed it (screen positions in rig units) plus the pose bits the cloth needs. */
export interface Rig3 {
  dir: "down" | "up" | "right"; diag: number; b: number;
  cx: number; sy: number; hipY: number;
  head: P; nearS: P; farS: P; nearE: P; farE: P; nearH: P; farH: P; hips: [P, P]; knees: [P, P]; feet: [P, P];
  stride: number; phase?: number; run?: boolean; t: number; attack: number; crouch: number; headDx: number;
  moving: number; wave: number; blink: boolean;
}

// ---- materials: ramps built from a single colour with the house hue shift (cool shadows, warm lights) ---------
interface Mat { ramp: number[]; spec: number; grain: number; glow?: boolean }
const rampCache = new Map<string, number[]>();
/** How far a dark colour's ramp may be stretched up (heroes 2.8 so black cloth still reads; monsters stay dark and weathered). */
let rampCap = 2.8, monster = false;
/** Monster mode (paint/mobs.ts): darker ramps, and the monster-only gear (masks, beards, tabards...) is built. */
export function setMonster3D(on: boolean) { monster = on; rampCap = on ? 1.7 : 2.8; }
let heroFull = false;
/** Heroes after the vampire (Murat 2026-11-17) also get the hats, hoods, beards, robes and faces built for monsters. */
export function setHeroFull3D(on: boolean) { heroFull = on; if (!monster) rampCap = on ? 1.6 : 2.8; }
function ramp(col: number, n = 7, lo = 0.34, hi = 1.32): number[] {
  // very dark cloth still needs a readable light side: stretch the top of the ramp
  const mx = Math.max((col >> 16) & 255, (col >> 8) & 255, col & 255) / 255;
  hi = Math.max(hi, Math.min(rampCap, 0.62 / Math.max(mx, 0.05)));
  const key = `${col}:${n}:${lo}:${hi}`;
  let r = rampCache.get(key);
  if (!r) {
    r = Array.from({ length: n }, (_, i) => {
      const f = lo + (hi - lo) * (i / (n - 1));
      if (f <= 1.2) return shade(col, f);
      // past a mild warm lift, brighten without turning the hue (a wine coat must not go olive)
      const c = shade(col, 1.2), k = f / 1.2;
      const ch = (v: number) => Math.min(255, Math.round(v * k + (k - 1) * 6));
      return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
    });
    rampCache.set(key, r);
  }
  return r;
}
/** White cloth would blow out under the stretched highlight ramp: keep its lights near the cloth's own colour. */
const clothHi = (col: number, hi: number) => (((col >> 16) & 255) * 0.3 + ((col >> 8) & 255) * 0.59 + (col & 255) * 0.11) / 255 > 0.78 ? 1.06 : hi;
const mat = (col: number, o: Partial<Mat> & { lo?: number; hi?: number; n?: number } = {}): Mat =>
  ({ ramp: ramp(col, o.n ?? 7, o.lo ?? 0.34, o.hi ?? 1.32), spec: o.spec ?? 0, grain: o.grain ?? 0, glow: o.glow });

// ---- signed distance primitives (world space) -----------------------------------------------------------------
interface Prim { d: (x: number, y: number, z: number) => number; m: Mat; k: number; tag: number; lo: V3; hi: V3; /** carved out of what came before */ cut?: boolean }
export const TAG_BODY = 1, TAG_HAND = 2, TAG_EYE = 3;

function bounds(c: V3, r: number): [V3, V3] { return [[c[0] - r, c[1] - r, c[2] - r], [c[0] + r, c[1] + r, c[2] + r]]; }
function sphere(c: V3, r: number, m: Mat, k = 0.6, tag = TAG_BODY): Prim {
  const [lo, hi] = bounds(c, r + 1);
  return { m, k, tag, lo, hi, d: (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r };
}
/** Ellipsoid with its axes along the frame f (forward), s (side), up (Z). */
function ell(c: V3, f: P, r: V3, m: Mat, k = 1, tag = TAG_BODY): Prim {
  const s: P = [f[1], -f[0]];
  const [lo, hi] = bounds(c, Math.max(...r) + 1);
  return { m, k, tag, lo, hi, d: (x, y, z) => {
    const qx = x - c[0], qy = y - c[1], qz = z - c[2];
    const a = (qx * f[0] + qy * f[1]) / r[0], b = (qx * s[0] + qy * s[1]) / r[1], h = qz / r[2];
    const k0 = Math.hypot(a, b, h), k1 = Math.hypot(a / r[0], b / r[1], h / r[2]);
    return k1 === 0 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
  } };
}
/** Tapered capsule a (radius ra) -> b (radius rb). */
function cap(a: V3, b: V3, ra: number, rb: number, m: Mat, k = 0.8, tag = TAG_BODY): Prim {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], bb = bx * bx + by * by + bz * bz || 1e-6;
  const R = Math.max(ra, rb) + 1;
  return { m, k, tag, lo: [Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.min(a[2], b[2]) - R], hi: [Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R, Math.max(a[2], b[2]) + R],
    d: (x, y, z) => {
      const px = x - a[0], py = y - a[1], pz = z - a[2];
      const h = clamp((px * bx + py * by + pz * bz) / bb);
      return Math.hypot(px - bx * h, py - by * h, pz - bz * h) - (ra + (rb - ra) * h);
    } };
}
function custom(lo: V3, hi: V3, d: Prim["d"], m: Mat, k = 0.4, tag = TAG_BODY): Prim { return { m, k, tag, lo, hi, d }; }

// ---- the model --------------------------------------------------------------------------------------------------
const LINEN = 0xe2dccb;
function facingOf(r: Rig3): P {
  const q = Math.SQRT1_2;
  if (r.dir === "right") return [1, 0];
  if (r.dir === "down") return r.diag ? [q, -q] : [0, -1];
  return r.diag ? [q, q] : [0, 1];
}

/** Rig point (screen, rig units) + a guessed depth -> world. The rig is drawn flat, so its y is height only. */
function lift(p: P, depth: number, zMin = -99): V3 { return [p[0], depth, Math.max(zMin, (29 - p[1]) / COS)]; }

interface Built { prims: Prim[]; eyes: V3[]; eyeCol: number; handNear: V3; handFar: V3 }

/**
 * Run cycle joints (3D, rig units). Each leg: a short stance (the foot planted and sliding back under the body at
 * ground speed), then a swing where the heel kicks up behind and the knee drives forward; both feet are off the ground
 * between strides. Arms pump bent at the elbow, opposite to the legs; the upper body leans into the run.
 * Leg 0 touches down at phase 0, leg 1 half a cycle later. With RUN_A below, one cycle covers 2 x 2 x RUN_A / RUN_STANCE
 * of ground at the speed where the feet do not slide (the client scales the animation to the hero's real speed).
 */
export const RUN_STANCE = 0.32, RUN_A = 5.6;
function runJoints(ph: number, f: P, s: P, hips: V3[], nearS0: V3, farS0: V3, head0: V3, lean: number) {
  const fw = (p: V3, k: number, up = 0): V3 => [p[0] + f[0] * k, p[1] + f[1] * k, p[2] + up];
  const nearS = fw(nearS0, lean, -0.3), farS = fw(farS0, lean, -0.3), head = fw(head0, lean * 1.25, -0.35);
  const t0 = (((ph / (2 * Math.PI)) % 1) + 1) % 1;
  const L1 = 5.3, L2 = 5.3, A = RUN_A, H = 4.2;
  const feet: V3[] = [], knees: V3[] = [];
  for (const i of [0, 1]) {
    const t = (t0 + i * 0.5) % 1, hp = hips[i];
    let u: number, h: number;
    if (t < RUN_STANCE) { const q = t / RUN_STANCE; u = A * (1 - 2 * q); h = 0; }
    else {
      const q = (t - RUN_STANCE) / (1 - RUN_STANCE);
      u = -A + 2 * A * (1 - Math.cos(Math.PI * Math.pow(q, 1.35))) / 2; // lingers behind (heel kick), then reaches forward
      h = H * Math.pow(Math.sin(Math.PI * Math.pow(q, 0.8)), 1.2);
    }
    // feet land a little closer to the line under the body than the hips
    const side = (hp[0] - (hips[0][0] + hips[1][0]) / 2) * s[0] + (hp[1] - (hips[0][1] + hips[1][1]) / 2) * s[1];
    let ft: V3 = [hp[0] + f[0] * u - s[0] * side * 0.25, hp[1] + f[1] * u - s[1] * side * 0.25, 0.9 + h];
    // a leg can't stretch past its length: the foot rolls up onto the toe at the ends of the stance
    let dx = ft[0] - hp[0], dy = ft[1] - hp[1], dz = ft[2] - hp[2], D = Math.hypot(dx, dy, dz);
    const M = (L1 + L2) * 0.995;
    if (D > M) { ft = [hp[0] + dx / D * M, hp[1] + dy / D * M, hp[2] + dz / D * M]; dx *= M / D; dy *= M / D; dz *= M / D; D = M; }
    // knee: two-bone IK, bending forward
    const ux = dx / D, uy = dy / D, uz = dz / D;
    const fd = f[0] * ux + f[1] * uy; // forward part along the leg
    let px = f[0] - ux * fd, py = f[1] - uy * fd, pz = -uz * fd;
    const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
    const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D), k = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    knees.push([hp[0] + ux * a + px * k, hp[1] + uy * a + py * k, hp[2] + uz * a + pz * k]);
    feet.push(ft);
  }
  // arms: the near (weapon) arm swings with leg 1, the far one with leg 0; bent ~80 degrees at the elbow
  const arm = (S: V3, w: number, amp: number, sg: number): [V3, V3] => {
    const al = amp * w, be = 1.35 + 0.25 * Math.max(0, w);
    const Lu = 3.9, Lf = 3.7;
    const E: V3 = [S[0] + (f[0] * Math.sin(al) + s[0] * sg * 0.18) * Lu, S[1] + (f[1] * Math.sin(al) + s[1] * sg * 0.18) * Lu, S[2] - Math.cos(al) * Lu];
    const Hd: V3 = [E[0] + (f[0] * Math.sin(al + be) - s[0] * sg * 0.3) * Lf, E[1] + (f[1] * Math.sin(al + be) - s[1] * sg * 0.3) * Lf, E[2] - Math.cos(al + be) * Lf];
    return [E, Hd];
  };
  const c = Math.cos(2 * Math.PI * t0);
  const [nearE, nearH] = arm(nearS, -c, 0.6, 1), [farE, farH] = arm(farS, c, 0.85, -1);
  return { feet, knees, nearS, farS, head, nearE, nearH, farE, farH };
}

export function build3D(L: Look, w: Dress3D, r: Rig3): Built {
  const f = facingOf(r), s: P = [f[1], -f[0]]; // s = the body's right side (the weapon side)
  const dep = (a: number, si: number) => a * f[1] + si * s[1]; // depth of a point `a` forward, `si` to the right
  const b = r.b, P: Prim[] = [];
  const skin = mat(L.skin, { lo: 0.5, hi: 1.1 });
  const atk = r.attack >= 0 ? 1 : 0;
  // joints in 3D: x/height straight from the rig, depth from where that joint sits on the body
  const SW = 3.2 * b;
  let nearS = lift(r.nearS, dep(0, SW)), farS = lift(r.farS, dep(0, -SW));
  const handA = 1.2 + atk * 2.2;
  let nearH = lift(r.nearH, dep(handA, SW * 0.85)), farH = lift(r.farH, dep(r.dir === "right" ? 0.6 : 0.8, -SW * 0.85));
  let nearE = lift(r.nearE, (nearS[1] + nearH[1]) / 2 + dep(-0.6, 0.6)), farE = lift(r.farE, (farS[1] + farH[1]) / 2 + dep(-0.6, -0.6));
  const strideA = r.stride * (r.run ? 4.3 : 3.5);
  const hipD = [dep(0, 1.55 * b), dep(0, -1.55 * b)];
  const footD = [dep(-strideA, 1.75 * b), dep(strideA, -1.75 * b)];
  // the rig's "near" leg 0 is the back one when facing right; for down/up the rig spreads them sideways
  const hips = [lift(r.hips[0], hipD[0]), lift(r.hips[1], hipD[1])];
  let feet = [0, 1].map((i) => { const ft = r.feet[i]; const d = footD[i]; return [ft[0], d, Math.max(0.9, (29 - ft[1]) / COS - (r.dir === "right" ? 0 : d * 0.25))] as V3; });
  let knees = [0, 1].map((i) => { const k = lift(r.knees[i], (hipD[i] + footD[i]) / 2 + dep(0.9, 0)); return k; });
  let head = lift([r.head[0], r.head[1] + 0.7], dep(0.2, 0));
  if (r.run && r.phase !== undefined && !atk) {
    // a real run in 3D, the same for every facing (Murat 2026-11-19: "running, not shuffling")
    const J = runJoints(r.phase, f, s, hips, nearS, farS, head, r.dir === "right" ? 0.5 : 1.3);
    ({ feet, knees, nearS, farS, head, nearE, nearH, farE, farH } = J);
  }
  const chest: V3 = [(nearS[0] + farS[0]) / 2, (nearS[1] + farS[1]) / 2, (nearS[2] + farS[2]) / 2 - 2.2];
  const pelvis: V3 = [(hips[0][0] + hips[1][0]) / 2, (hips[0][1] + hips[1][1]) / 2, (hips[0][2] + hips[1][2]) / 2 + 0.6];
  const waist: V3 = [(chest[0] + pelvis[0]) / 2, (chest[1] + pelvis[1]) / 2, (chest[2] + pelvis[2]) / 2];

  // ---- materials of what is worn
  const legCol = w.legs === "bare" ? L.skin : w.legCol;
  const legM = w.legs === "mail" ? mat(w.legCol, { spec: 0.5, grain: 0.18 }) : w.legs === "bare" ? skin : mat(legCol, { grain: 0.04 });
  const bootM = w.bootStyle === "bare" ? skin : mat(w.boots, { spec: w.bootStyle === "greave" ? 0.6 : 0.15, lo: 0.3, hi: 1.4 });
  const torsoM = w.torso === "bare" ? skin
    : w.torso === "mail" ? mat(w.torsoCol, { spec: 0.55, grain: 0.2, lo: 0.3, hi: 1.35 })
      : w.torso === "plate" ? mat(w.torsoCol, { spec: 0.8, lo: 0.3, hi: 1.45 })
        : mat(w.torsoCol, { grain: heroFull ? 0.12 : 0.05, lo: 0.36, hi: heroFull ? 1.18 : 1.38 });
  const trimM = w.trim !== undefined ? mat(w.trim, { spec: 0.7, lo: 0.45, hi: 1.45, n: 5 }) : null;
  const armArm = w.armour;
  const sleeveM = armArm ? mat(armArm.col, { spec: 0.8, lo: 0.3, hi: 1.45 }) : w.arms === "bare" ? skin : mat(w.sleeve, { grain: 0.05 });
  const handM = w.glove !== undefined ? mat(w.glove, { lo: 0.4, hi: 1.5 }) : skin;
  const linen = mat(LINEN, { lo: 0.45, hi: 1.12 });

  if (L.bones) bones3D(L, w, r, P, f, s, { nearS, farS, nearE, farE, nearH, farH, hips, knees, feet, chest, pelvis, waist, head });
  else {
  // ---- legs
  const covered = w.torso === "jerkin" || w.torso === "robe";
  for (const i of [0, 1]) {
    const thighR = 1.42 * b, shinR = 1.08;
    P.push(cap(hips[i], knees[i], thighR, shinR + 0.1, legM, 0.9));
    const bootTop = w.bootStyle === "bare" ? 0 : 0.55;
    const kneeToFoot = (t: number): V3 => [knees[i][0] + (feet[i][0] - knees[i][0]) * t, knees[i][1] + (feet[i][1] - knees[i][1]) * t, knees[i][2] + (feet[i][2] - knees[i][2]) * t];
    if (bootTop) {
      P.push(cap(knees[i], kneeToFoot(bootTop), shinR, shinR * 0.95, legM, 0.5));
      P.push(cap(kneeToFoot(bootTop - 0.08), feet[i], shinR * 1.12, 1.0, bootM, 0.4));
      P.push(ell(kneeToFoot(bootTop - 0.05), f, [1.3, 1.3, 0.45], bootM, 0.3)); // turned-down cuff
    } else P.push(cap(knees[i], feet[i], shinR, 0.9, legM, 0.6));
    // foot: points where the body faces
    const toe: V3 = [feet[i][0] + f[0] * 1.5, feet[i][1] + f[1] * 1.5, Math.max(0.55, feet[i][2] - 0.4)];
    P.push(ell(toe, f, [1.9, 1.05, 0.75], bootM, 0.5));
    if (w.wings !== undefined) {
      const wm = mat(w.wings, { lo: 0.6, hi: 1.3, n: 5 });
      for (const sg of [-1, 1]) P.push(cap([feet[i][0], feet[i][1], feet[i][2] + 1.4], [feet[i][0] - f[0] * 2.2 + s[0] * sg * 0.9, feet[i][1] - f[1] * 2.2 + s[1] * sg * 0.9, feet[i][2] + 3.0], 0.55, 0.15, wm, 0.2));
    }
  }
  // linen braies on a bare body (and under a short coat they never show)
  if (w.legs === "bare") P.push(ell([pelvis[0], pelvis[1], pelvis[2] - 0.5], f, [2.2 * b, 2.85 * b, 2.0], linen, 1.0));

  // ---- torso
  const tw = w.torso === "plate" ? 1.08 : 1;
  P.push(ell(chest, f, [2.05 * b * tw, 3.0 * b * tw, 3.0], torsoM, 1.4));
  P.push(ell(waist, f, [1.75 * b, 2.45 * b, 2.6], torsoM, 1.4));
  P.push(ell(pelvis, f, [1.85 * b, 2.6 * b, 1.9], w.torso === "bare" ? (w.legs === "bare" ? linen : legM) : torsoM, 1.2));
  if (w.torso === "plate" && trimM) {
    // a gilt edge round the breastplate and a ridge down its middle
    P.push(custom([chest[0] - 5, chest[1] - 5, chest[2] - 4], [chest[0] + 5, chest[1] + 5, chest[2] + 4], (x, y, z) => {
      const qx = x - chest[0], qy = y - chest[1], qz = z - chest[2] + 2.6;
      const a = qx * f[0] + qy * f[1], si = qx * s[0] + qy * s[1];
      return Math.max(Math.hypot(a / (2.25 * b), si / (3.2 * b)) - 1, Math.abs(qz) - 0.32);
    }, trimM, 0.15));
  }
  if (w.torso === "jerkin" || w.torso === "leather" || w.torso === "tailcoat") {
    // coat skirts: a flared cone round the hips, open at the front so the legs stride through
    const top = pelvis[2] + 1.6, len = w.torso === "leather" || (heroFull && w.torso === "jerkin") ? 3.4 : 6.6, bot = top - len;
    const sw = r.moving * Math.sin(r.wave) * 0.6;
    P.push(custom([pelvis[0] - 8, pelvis[1] - 8, bot - 1], [pelvis[0] + 8, pelvis[1] + 8, top + 1], (x, y, z) => {
      const qx = x - pelvis[0], qy = y - pelvis[1];
      const a = qx * f[0] + qy * f[1], si = qx * s[0] + qy * s[1];
      const down = clamp((top - z) / len);
      const R = 2.75 * b + down * 1.7 + Math.sin(Math.atan2(si, -a) * 5 + r.wave * 0.5) * 0.18 * down;
      const ac = a + down * down * (0.5 + r.moving * 0.9) + sw * down;
      const rad = Math.hypot(ac * 1.25, si) - R;
      const ang = Math.atan2(si, ac); // 0 = straight ahead
      const open = 0.42 - Math.abs(Math.abs(ang) < Math.PI ? Math.min(Math.abs(ang), 9) : 9);
      return Math.max(Math.abs(rad) - 0.42, Math.max(z - top, Math.max(bot - z, open * 2.5)));
    }, torsoM, 0.5));
    if (trimM) {
      // a gold edge down the front opening and at the hem
      for (const sg of [-1, 1]) {
        const c0: V3 = [chest[0] + f[0] * 1.95 * b + s[0] * sg * 0.55, chest[1] + f[1] * 1.95 * b + s[1] * sg * 0.55, chest[2] + 2.2];
        const c1: V3 = [pelvis[0] + f[0] * 2.0 * b + s[0] * sg * 0.75, pelvis[1] + f[1] * 2.0 * b + s[1] * sg * 0.75, pelvis[2] - 0.2];
        P.push(cap(c0, c1, 0.3, 0.3, trimM, 0.05));
      }
    }
  }
  if (w.torso === "mail" || w.torso === "leather") {
    // a padded collar / shoulder edge so the vest reads as worn over the body
    P.push(ell([chest[0], chest[1], chest[2] + 2.5], f, [1.9 * b, 2.6 * b, 0.9], trimM ?? torsoM, 0.6));
  }
  if (w.torso !== "bare") P.push(ell([chest[0] - f[0] * 0.2, chest[1] - f[1] * 0.2, chest[2] + 3.1], f, [1.55, 1.9, 1.05], torsoM, 0.5)); // collar
  if (w.belt !== undefined || w.torso !== "bare") {
    const beltM = mat(w.belt ?? 0x2b1d14, { lo: 0.4, hi: 1.4, n: 5 });
    P.push(ell([pelvis[0], pelvis[1], pelvis[2] + 1.4], f, [2.0 * b, 2.75 * b, 0.55], beltM, 0.2));
    if (w.buckle !== undefined) P.push(ell([pelvis[0] + f[0] * 2.05 * b, pelvis[1] + f[1] * 2.05 * b, pelvis[2] + 1.4], f, [0.4, 0.75, 0.55], mat(w.buckle, { spec: 0.9, lo: 0.5, hi: 1.5, n: 5 }), 0.05));
  }
  if (heroFull && L.vest !== undefined && w.torso !== "bare") { // the waistcoat showing in the coat's open front
    const vm = mat(L.vest, { grain: 0.1, lo: 0.4, hi: clothHi(L.vest, 1.4) });
    P.push(ell([chest[0] + f[0] * 1.8 * b, chest[1] + f[1] * 1.8 * b, chest[2] - 0.2], f, [0.7, 1.3 * b, 3.1], vm, 0.25));
  }
  if (w.torso === "jerkin" && trimM) {
    for (const z of [2.1, 0.5, -1.1]) P.push(sphere([chest[0] + f[0] * 2.0 * b, chest[1] + f[1] * 2.0 * b, chest[2] + z], 0.36, trimM, 0.05));
  }

  // ---- arms (pauldrons on plate)
  for (const [S, E, H, near] of [[nearS, nearE, nearH, true], [farS, farE, farH, false]] as [V3, V3, V3, boolean][]) {
    P.push(sphere(S, 1.55 * b, armArm ? sleeveM : w.torso === "bare" ? skin : torsoM, 0.9));
    if (armArm) P.push(ell([S[0], S[1], S[2] + 0.4], f, [1.9, 2.0, 1.2], sleeveM, 0.4));
    P.push(cap(S, E, 1.15, 1.0, sleeveM, 0.7));
    P.push(cap(E, H, 1.0, 0.82, sleeveM, 0.6));
    P.push(sphere(H, 0.92, handM, 0.4, near ? TAG_HAND : TAG_BODY));
  }

  }
  // ---- neck, head, hair, face
  const headStart = P.length;
  const neckTop: V3 = [head[0], head[1], head[2] - 2.0];
  const eyes: V3[] = [], hg = w.head;
  if (L.skull) skull3D(L, r, P, f, s, head, chest, eyes);
  else if (monster && L.beast && !L.beastHood) beastHead3D(L, r, P, f, s, head, chest, eyes, false);
  else {
  P.push(cap([chest[0], chest[1], chest[2] + 2.6], neckTop, 1.05, 0.95, skin, 0.6));
  P.push(ell(head, f, [2.2, 2.1, 2.5], skin, 0.7));
  P.push(ell([head[0] + f[0] * 0.55, head[1] + f[1] * 0.55, head[2] - 1.4], f, [1.65, 1.6, 1.35], skin, 0.8)); // jaw
  P.push(ell([head[0] + f[0] * 2.1, head[1] + f[1] * 2.1, head[2] - 0.2], f, [0.55, 0.38, 0.75], skin, 0.3)); // nose
  const hairLight = L.hair !== undefined && (((L.hair >> 16) & 255) * 0.3 + ((L.hair >> 8) & 255) * 0.59 + (L.hair & 255) * 0.11) / 255 > 0.62;
  const hairM = L.hair !== undefined ? mat(L.hair, { lo: heroFull && hairLight ? 0.42 : 0.5, hi: heroFull && hairLight ? 1.12 : 1.9, grain: heroFull ? 0.14 : 0.06 }) : null;
  if (hairM && L.hairStyle !== "bald" && L.hairStyle !== "none" && hg !== "helm" && hg !== "greathelm") {
    // swept back: a cap over the crown and down the back of the head
    P.push(ell([head[0] - f[0] * 0.6, head[1] - f[1] * 0.6, head[2] + 0.85], f, [2.3, 2.25, 1.9], hairM, 0.5));
    P.push(ell([head[0] - f[0] * 1.15, head[1] - f[1] * 1.15, head[2] - 0.5], f, [1.4, 2.0, 2.0], hairM, 0.6));
    if (L.hairStyle === "long" && heroFull) { // falling to the shoulder blades in locks, narrowing
      P.push(ell([head[0] - f[0] * 1.5, head[1] - f[1] * 1.5, head[2] - 2.6], f, [0.95, 2.15, 2.3], hairM, 0.8));
      for (const sg of [-1, 0, 1]) P.push(cap([head[0] - f[0] * 1.6 + s[0] * sg * 1.1, head[1] - f[1] * 1.6 + s[1] * sg * 1.1, head[2] - 3.4], [head[0] - f[0] * (1.9 + r.moving * 0.4) + s[0] * sg * 1.0, head[1] - f[1] * (1.9 + r.moving * 0.4) + s[1] * sg * 1.0, head[2] - 6.0 - Math.abs(sg) * 0.4], 0.75, 0.35, hairM, 0.4));
    } else if (L.hairStyle === "long") P.push(ell([head[0] - f[0] * 1.6, head[1] - f[1] * 1.6, head[2] - 3.2], f, [1.0, 2.3, 2.8], hairM, 0.8));
  }
  if (!r.blink) for (const sg of [-1, 1]) eyes.push([head[0] + f[0] * 2.05 + s[0] * sg * 0.95, head[1] + f[1] * 2.05 + s[1] * sg * 0.95, head[2] + 0.15]);
  }

  // ---- head gear
  const metalM = (c: number) => mat(c, { spec: 0.8, lo: 0.3, hi: 1.22 });
  if (hg === "crown") {
    const cm = metalM(w.headCol), gem = mat(w.headTrim, { lo: 0.5, hi: 1.7, n: 5, glow: true });
    const cz = head[2] + 1.45, cr = 2.18;
    P.push(custom([head[0] - 4, head[1] - 4, cz - 1.5], [head[0] + 4, head[1] + 4, cz + 3.5], (x, y, z) => {
      const qx = x - head[0], qy = y - head[1], qz = z - cz;
      return Math.hypot(Math.hypot(qx, qy) - cr, Math.max(Math.abs(qz) - 0.22, 0)) - 0.24;
    }, cm, 0.1));
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + Math.atan2(f[1], f[0]);
      const base: V3 = [head[0] + Math.cos(a) * cr, head[1] + Math.sin(a) * cr, cz + 0.2];
      P.push(cap(base, [base[0] * 1 + Math.cos(a) * 0.15, base[1] + Math.sin(a) * 0.15, cz + (i === 0 ? 1.5 : 1.0)], 0.32, 0.05, cm, 0.05));
    }
    P.push(sphere([head[0] + f[0] * (cr + 0.35), head[1] + f[1] * (cr + 0.35), cz + 0.1], 0.36, gem, 0.02));
  } else if (hg === "helm" || hg === "greathelm") {
    const hm = metalM(w.headCol);
    P.push(ell([head[0], head[1], head[2] + 0.75], f, [2.75, 2.75, 2.75], hm, 0.3));
    P.push(ell([head[0], head[1], head[2] - 0.25], f, [2.95, 2.95, 0.42], mat(w.headTrim, { spec: 0.8, lo: 0.35, hi: 1.4 }), 0.1));
    P.push(cap([head[0] + f[0] * 2.65, head[1] + f[1] * 2.65, head[2] + 0.2], [head[0] + f[0] * 2.75, head[1] + f[1] * 2.75, head[2] - 1.8], 0.38, 0.3, hm, 0.1));
    if ((monster || heroFull) && w.plume !== undefined) { // a horsehair crest from brow to nape
      const pm = mat(w.plume, { lo: 0.4, hi: 1.35, grain: 0.25 });
      const at = (a: number, z: number): V3 => [head[0] + f[0] * a, head[1] + f[1] * a, head[2] + z];
      P.push(cap(at(1.6, 3.3), at(-0.6, 4.1), 0.75, 0.85, pm, 0.4), cap(at(-0.6, 4.1), at(-2.9, 2.2 - r.moving * 0.4), 0.85, 0.45, pm, 0.4));
    }
  } else if ((monster || heroFull) && (hg === "wizardhat" || hg === "witch" || hg === "wide")) {
    // a tall pointed hat (a wide-brimmed one for "wide"), its tip bent back and drooping
    const hm = mat(w.headCol, { lo: 0.36, hi: 1.4, grain: 0.12 }), band = mat(w.headTrim, { spec: 0.5, lo: 0.4, hi: 1.4, n: 5 });
    const at = (a: number, z: number): V3 => [head[0] + f[0] * a, head[1] + f[1] * a, head[2] + z];
    const brim = hg === "wide" ? 4.0 : hg === "witch" ? 3.6 : 3.1, tall = hg === "wide" ? 1.6 : 5.6;
    P.push(ell(at(0.1, 1.45), f, [brim, brim, 0.3], hm, 0.3));
    P.push(cap(at(-0.1, 1.5), at(-0.6, 1.5 + tall * 0.6), 2.15, 1.1, hm, 0.5), cap(at(-0.6, 1.5 + tall * 0.6), at(-2.0 - r.moving * 0.4, 1.5 + tall * 0.85), 1.1, 0.15, hm, 0.4));
    P.push(ell(at(-0.05, 1.95), f, [2.25, 2.25, 0.36], band, 0.1));
  } else if ((hg === "hood" || (hg === "horned" && L.bones)) && L.skull) {
    // a deep cowl: the skull sits back in its shadow, only the burning eyes and teeth show
    const cm = mat(w.headCol, { lo: 0.32, hi: 1.35, grain: 0.1 }), inside = mat(0x0c080c, { lo: 0.7, hi: 1.3, n: 3 });
    const at = (a: number, si: number, z: number): V3 => [head[0] + f[0] * a + s[0] * si, head[1] + f[1] * a + s[1] * si, head[2] + z];
    P.push(ell(at(-0.35, 0, 0.55), f, [2.95, 2.75, 3.0], cm, 0.5));
    P.push(cap(at(-1.6, 0, 2.2), at(-3.2, 0, 1.2), 1.2, 0.2, cm, 0.6)); // the cowl's point falling back
    P.push(ell(at(-0.4, 0, -2.6), f, [2.4, 3.3, 1.3], cm, 0.9)); // folds over the shoulders
    P.push({ ...ell(at(2.0, 0, -0.35), f, [1.55, 1.9, 2.25], inside, 0.35), cut: true }); // the opening round the face
    if (hg === "horned") {
      const hm = mat(w.headTrim, { lo: 0.38, hi: 1.25, grain: 0.12, spec: 0.2 });
      for (const sg of [-1, 1]) {
        const pts: V3[] = [at(0.3, sg * 2.0, 1.6), at(0.0, sg * 3.1, 2.6), at(-0.9, sg * 3.6, 3.9), at(-1.4, sg * 3.2, 5.0)];
        for (let k = 1; k < pts.length; k++) P.push(cap(pts[k - 1], pts[k], 0.85 - k * 0.22, 0.85 - (k + 1) * 0.22 + 0.05, hm, 0.2));
      }
    }
  } else if (hg === "hood" && (monster || heroFull)) {
    // a hood: put in before the head so the face opening carves the hood, not the face
    const cm = mat(w.headCol, { lo: 0.32, hi: clothHi(w.headCol, 1.35), grain: 0.1 }), inside = mat(shade(w.headCol, 0.35), { lo: 0.7, hi: 1.2, n: 3 });
    const at = (a: number, si: number, z: number): V3 => [head[0] + f[0] * a + s[0] * si, head[1] + f[1] * a + s[1] * si, head[2] + z];
    P.splice(headStart, 0,
      ell(at(-0.45, 0, 0.45), f, [2.85, 2.7, 2.95], cm, 0.5),
      cap(at(-1.6, 0, 2.1), at(-3.0, 0, 0.9), 1.1, 0.2, cm, 0.6),
      ell(at(-0.4, 0, -2.5), f, [2.3, 3.2, 1.25], cm, 0.9),
      { ...ell(at(2.0, 0, -0.45), f, [1.5, 1.75, 2.1], inside, 0.35), cut: true });
  } else if (hg === "bandana" && (monster || heroFull)) {
    const cm = mat(w.headCol, { lo: 0.36, hi: 1.35, grain: 0.08 });
    const at = (a: number, si: number, z: number): V3 => [head[0] + f[0] * a + s[0] * si, head[1] + f[1] * a + s[1] * si, head[2] + z];
    P.push(ell(at(-0.25, 0, 0.75), f, [2.4, 2.3, 1.95], cm, 0.3));
    P.push(cap(at(-2.3, 0, 0.6), at(-3.4, 0.5, -1.4), 0.45, 0.25, cm, 0.2), cap(at(-2.3, 0, 0.6), at(-3.2, -0.6, -1.2), 0.42, 0.22, cm, 0.2)); // knot tails
  } else if (hg === "kettle" && (monster || heroFull)) {
    const hm = mat(w.headCol, { spec: 0.6, lo: 0.3, hi: 1.25, grain: 0.15 });
    P.push(ell([head[0], head[1], head[2] + 1.0], f, [2.55, 2.55, 2.4], hm, 0.3));
    P.push(ell([head[0], head[1], head[2] + 0.55], f, [3.7, 3.7, 0.38], hm, 0.15)); // the wide brim
  } else if (hg === "horned" && (monster || heroFull)) {
    const hm = mat(w.headCol, { spec: 0.7, lo: 0.3, hi: 1.25, grain: 0.12 }), horn = mat(w.headTrim, { lo: 0.38, hi: 1.25, grain: 0.12, spec: 0.2 });
    const at = (a: number, si: number, z: number): V3 => [head[0] + f[0] * a + s[0] * si, head[1] + f[1] * a + s[1] * si, head[2] + z];
    P.push(ell(at(0, 0, 0.8), f, [2.6, 2.6, 2.55], hm, 0.3));
    P.push(cap(at(2.4, 0, 1.0), at(2.6, 0, -1.4), 0.4, 0.3, hm, 0.1)); // nasal
    for (const sg of [-1, 1]) {
      const pts: V3[] = [at(0.2, sg * 2.2, 1.3), at(0.4, sg * 3.6, 2.0), at(0.6, sg * 4.3, 3.5), at(0.9, sg * 4.0, 4.9)];
      for (let k = 1; k < pts.length; k++) P.push(cap(pts[k - 1], pts[k], 0.95 - k * 0.24, 0.95 - (k + 1) * 0.24 + 0.06, horn, 0.2));
    }
  } else if (hg === "cap" || hg === "hood" || hg === "wide" || hg === "bandana") {
    const cm = mat(w.headCol, { lo: 0.38, hi: 1.35, grain: 0.04 });
    P.push(ell([head[0] - f[0] * 0.3, head[1] - f[1] * 0.3, head[2] + 1.35], f, [2.75, 2.6, 1.75], cm, 0.3));
    P.push(ell([head[0] + f[0] * 1.6, head[1] + f[1] * 1.6, head[2] + 0.75], f, [1.6, 2.2, 0.35], cm, 0.2)); // brim
    if (w.plume !== undefined) {
      const pm = mat(w.plume, { lo: 0.5, hi: 1.4, n: 5 });
      const p0: V3 = [head[0] - s[0] * 2.3, head[1] - s[1] * 2.3, head[2] + 1.6];
      P.push(cap(p0, [p0[0] - f[0] * 3.6, p0[1] - f[1] * 3.6, p0[2] + 2.6], 0.55, 0.12, pm, 0.1));
    }
  }

  if (monster && L.beast && L.beastHood) beastHead3D(L, r, P, f, s, head, chest, eyes, true);
  if ((monster || heroFull) && !L.skull && !(L.beast && !L.beastHood)) face3D(L, P, f, s, head);
  if (monster) beastParts3D(L, r, P, f, s, { nearS, farS, nearE, farE, nearH, farH, hips, knees, feet, chest, pelvis, waist, head });
  if ((monster || heroFull) && !L.bones) extras3D(L, w, r, P, f, s, { nearS, farS, nearE, farE, nearH, farH, hips, knees, feet, chest, pelvis, waist, head });
  // ---- cape and collar
  if (w.cape) {
    const cm = mat(w.cape.col, { lo: 0.4, hi: Math.min(2.6, rampCap - 0.2), n: 8, grain: w.cape.fur ? 0.35 : 0 });
    const lin = w.cape.collar !== undefined ? mat(w.cape.collar, { lo: 0.36, hi: 1.3 }) : cm;
    const top = chest[2] + 3.1, bot = w.cape.short ? pelvis[2] - 1 : 1.8 + r.crouch * 0.4;
    const len = top - bot;
    const flow = 0.6 + r.moving * 2.4; // the hem streams back when walking or running
    const cx = chest[0], cy = chest[1];
    const capeD = (x: number, y: number, z: number, inner: number) => {
      const qx = x - cx, qy = y - cy;
      const a = qx * f[0] + qy * f[1], si = qx * s[0] + qy * s[1];
      const down = clamp((top - z) / len);
      const ang = Math.atan2(si, -a); // 0 = straight back
      const fold = (Math.abs(Math.sin(ang * 3.5 + r.wave * 0.35)) - 0.5) * 0.9 * (0.25 + down);
      const R = 3.05 * b + down * 1.9 + fold - inner;
      const ac = a + 1.05 + down * down * flow + Math.sin(r.wave) * r.moving * 0.5 * down;
      const rad = Math.hypot(ac * 1.3, si) - R;
      const side = Math.abs(ang) - (1.25 - down * 0.12);
      const hem = bot + Math.sin(ang * 4 + r.wave) * 0.5 * (1 + r.moving);
      return Math.max(Math.abs(rad) - 0.33, Math.max(side * 2.5, Math.max(z - top, hem - z)));
    };
    const box: [V3, V3] = [[cx - 10, cy - 10, bot - 2], [cx + 10, cy + 10, top + 1]];
    P.push(custom(box[0], box[1], (x, y, z) => capeD(x, y, z, 0), cm, 0.5));
    P.push(custom(box[0], box[1], (x, y, z) => capeD(x, y, z, 0.45) + 0.08, lin, 0.15));
    if (w.cape.collar !== undefined) {
      // tall stand-up collar behind the neck: black outside, coloured inside
      const nz = chest[2] + 2.6;
      const collarD = (x: number, y: number, z: number, inner: number) => {
        const qx = x - neckTop[0], qy = y - neckTop[1], qz = z - nz;
        const a = qx * f[0] + qy * f[1], si = qx * s[0] + qy * s[1];
        const ang = Math.atan2(si, -a);
        const R = 2.5 + clamp(qz, 0, 6) * 0.3 - inner;
        const rad = Math.hypot(a * 1.15, si) - R;
        const h = 4.6 - Math.abs(ang) * 1.5;
        return Math.max(Math.abs(rad) - 0.28, Math.max(Math.abs(ang) - 1.7, Math.max(qz - h, -qz)));
      };
      const cb: [V3, V3] = [[neckTop[0] - 6, neckTop[1] - 6, nz - 1], [neckTop[0] + 6, neckTop[1] + 6, nz + 6]];
      P.push(custom(cb[0], cb[1], (x, y, z) => collarD(x, y, z, 0), cm, 0.2));
      P.push(custom(cb[0], cb[1], (x, y, z) => collarD(x, y, z, 0.3) + 0.05, lin, 0.1));
    }
  }
  return { prims: P, eyes, eyeCol: L.eyeGlow ?? L.eye ?? 0x1a1418, handNear: nearH, handFar: farH };
}


// ---- human monsters (bandits, raiders, soldiers): masks, beards, tabards, fur kilts, straps, quivers -----------------
function face3D(L: Look, P: Prim[], f: P, s: P, head: V3) {
  const at = (a: number, si: number, z: number): V3 => [head[0] + f[0] * a + s[0] * si, head[1] + f[1] * a + s[1] * si, head[2] + z];
  if (L.beard !== undefined && L.beardStyle !== "stubble") {
    if (heroFull) { // a hero's beard: shaded locks under a moustache, the face left free above it
      const bm = mat(L.beard, { lo: 0.38, hi: 1.08, grain: 0.3 });
      P.push(ell(at(1.25, 0, -2.15), f, [1.2, 1.6, 1.25], bm, 0.4));
      for (const sg of [-1, 1]) P.push(cap(at(1.95, sg * 0.25, -1.15), at(1.75, sg * 1.25, -1.75), 0.36, 0.22, bm, 0.15));
      if (L.beardStyle === "long") for (const sg of [-0.5, 0.5]) P.push(cap(at(1.5, sg, -2.6), at(1.9 + Math.abs(sg) * 0.1, sg * 0.6, -5.6 + Math.abs(sg)), 0.95, 0.3, bm, 0.5));
    } else {
    const bm = mat(L.beard, { lo: 0.45, hi: 1.7, grain: 0.22 });
    P.push(ell(at(1.15, 0, -1.75), f, [1.35, 1.85, 1.5], bm, 0.5));
    if (L.beardStyle === "long") P.push(cap(at(1.4, 0, -2.4), at(1.9, 0, -5.4), 1.3, 0.45, bm, 0.6));
    }
  }
  if (L.mask !== undefined) { // a cloth tied over nose and mouth
    const mm = mat(L.mask, { lo: 0.4, hi: 1.35, grain: 0.1 });
    P.push(ell(at(0.75, 0, -1.25), f, [1.75, 2.25, 1.25], mm, 0.3));
  }
  if (L.faceMask !== undefined) P.push(ell(at(1.35, 0, -0.4), f, [0.9, 1.9, 2.2], mat(L.faceMask, { spec: 0.9, lo: 0.4, hi: 1.4 }), 0.2));
}

/** Monster-only gear over a living body (heroes never wear these, so the vampire stays as it was). */
function extras3D(L: Look, w: Dress3D, r: Rig3, P: Prim[], f: P, s: P, J: Joints) {
  const b = r.b, { chest, pelvis } = J;
  if (w.legs === "robe" || w.legs === "dress") robe3D(w, r, P, f, s, J);
  if (L.sash !== undefined) P.push(ell([pelvis[0], pelvis[1], pelvis[2] + 1.6], f, [2.1 * b, 2.9 * b, 0.62], mat(L.sash, { lo: 0.4, hi: 1.4, n: 5 }), 0.2)); // a sash knotted at the waist
  const off = (p: V3, a: number, si: number, z = 0): V3 => [p[0] + f[0] * a + s[0] * si, p[1] + f[1] * a + s[1] * si, p[2] + z];
  if (L.tabard) { // a long cloth panel front and back over the armour, the clan's sign on the chest
    const tm = mat(L.tabard.col, { lo: 0.36, hi: 1.38, grain: 0.1 }), trm = mat(L.tabard.trim, { lo: 0.4, hi: 1.3, n: 5 });
    const sway = Math.sin(r.wave) * r.moving * 0.5;
    for (const side of [1, -1]) {
      const top = off(chest, side * 2.05 * b, 0, 2.2), bot = off(pelvis, side * (2.15 * b + 0.6 + (side > 0 ? sway : -sway)), 0, -4.2);
      const mid: V3 = [(top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2], half = (top[2] - bot[2]) / 2;
      P.push(custom([mid[0] - 6, mid[1] - 6, bot[2] - 1], [mid[0] + 6, mid[1] + 6, top[2] + 1], (x, y, z) => {
        const t = clamp((top[2] - z) / (top[2] - bot[2]));
        const cx = top[0] + (bot[0] - top[0]) * t, cy = top[1] + (bot[1] - top[1]) * t;
        const qx = x - cx, qy = y - cy, a = qx * f[0] + qy * f[1], si = qx * s[0] + qy * s[1];
        return Math.max(Math.abs(a) - 0.3, Math.abs(si) - (1.55 * b + t * 0.25), Math.abs(z - mid[2]) - half);
      }, tm, 0.3));
      if (side > 0) {
        P.push(ell(off(chest, 2.4 * b, 0, -0.2), f, [0.3, 0.75, 1.15], mat(L.tabard.emblem, { lo: 0.5, hi: 1.4, n: 5 }), 0.05));
        P.push(ell(off(pelvis, 2.3 * b + 0.6, 0, -4.0), f, [0.4, 1.65 * b, 0.3], trm, 0.1)); // hem
      }
    }
  }
  if (L.legs === "fur") { // a shaggy fur kilt to the knees
    const fm = mat(L.legCol, { lo: 0.36, hi: 1.5, grain: 0.4 });
    const top = pelvis[2] + 1.5, bot = Math.max(J.knees[0][2], J.knees[1][2]) - 0.5, len = top - bot;
    P.push(custom([pelvis[0] - 7, pelvis[1] - 7, bot - 1], [pelvis[0] + 7, pelvis[1] + 7, top + 1], (x, y, z) => {
      const qx = x - pelvis[0], qy = y - pelvis[1], a = qx * f[0] + qy * f[1], si = qx * s[0] + qy * s[1];
      const down = clamp((top - z) / len), ang = Math.atan2(si, a);
      const R = 2.45 * b + down * 1.1 + Math.sin(ang * 7) * 0.2 * down;
      const hem = bot + (Math.sin(ang * 11 + 0.7) * 0.5 + 0.5) * 0.9;
      return Math.max(Math.hypot(a * 1.1, si) - R, Math.max(z - top, hem - z));
    }, fm, 0.4));
  }
  if (L.harness) P.push(cap(off(J.nearS, 0.6, 0.2, -0.6), off(J.farH === J.farH ? pelvis : pelvis, 2.0 * b, -1.6 * b, 1.4), 0.38, 0.38, mat(0x2a1c14, { lo: 0.4, hi: 1.4, n: 5 }), 0.15));
  if (L.bracer !== undefined) {
    const bm = mat(L.bracer, { lo: 0.38, hi: 1.4, grain: 0.1, spec: 0.2 });
    for (const [E, H] of [[J.nearE, J.nearH], [J.farE, J.farH]] as [V3, V3][]) P.push(cap(lerp3(E, H, 0.3), lerp3(E, H, 0.78), 1.12, 1.05, bm, 0.2));
  }
  if (L.back === "quiver") { // a quiver slung across the back, fletchings over the shoulder
    const qm = mat(L.capeCol ?? 0x3a2a1e, { lo: 0.36, hi: 1.38, grain: 0.1 }), fl = mat(0xd8d0b8, { lo: 0.5, hi: 1.2, n: 4 });
    const top = off(chest, -2.4 * b, 1.1, 3.2), bot = off(pelvis, -2.3 * b, -0.9, 0.2);
    P.push(cap(top, bot, 0.95, 0.85, qm, 0.3));
    for (let k = 0; k < 3; k++) P.push(cap(top, off(top, -0.2 + k * 0.25, -0.5 + k * 0.5, 1.6 + (k % 2) * 0.3), 0.18, 0.3, fl, 0.05));
  }
  if (L.scarf) { // wound round the neck, the ends hanging
    const sm = mat(L.scarf.col, { lo: 0.38, hi: 1.38, grain: 0.1 });
    const n = off(chest, 0, 0, 3.2);
    P.push(ell(n, f, [1.85, 2.15, 0.85], sm, 0.3));
    const sw = Math.sin(r.wave) * (0.4 + r.moving);
    P.push(cap(off(n, -1.4, 0.6), off(n, -2.4 - r.moving * 1.5, 1.0 + sw * 0.3, -3.6 + r.moving * 1.2), 0.5, 0.35, sm, 0.2));
  }
}

// ---- the dead (Look.bones / skull / rags): skeletal limbs, ribcage and spine, a bare skull, tattered rags ---------
interface Joints { nearS: V3; farS: V3; nearE: V3; farE: V3; nearH: V3; farH: V3; hips: V3[]; knees: V3[]; feet: V3[]; chest: V3; pelvis: V3; waist: V3; head: V3 }
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Old bone: yellowed, pitted, darker in the cracks. */
const boneMat = (c: number) => mat(c, { lo: 0.36, hi: 1.22, grain: 0.16, spec: 0.12 });

function bones3D(L: Look, w: Dress3D, r: Rig3, P: Prim[], f: P, s: P, J: Joints) {
  const bm = boneMat(L.skin), dark = mat(shade(L.skin, 0.3), { lo: 0.5, hi: 1, n: 3 });
  const off = (p: V3, a: number, si: number, z = 0): V3 => [p[0] + f[0] * a + s[0] * si, p[1] + f[1] * a + s[1] * si, p[2] + z];
  // legs: thigh and shin bones with knobbed joints, splayed bony feet
  for (const i of [0, 1]) {
    const hip = J.hips[i], kn = J.knees[i], ft = J.feet[i];
    P.push(cap(hip, kn, 0.55, 0.45, bm, 0.2));
    P.push(sphere(kn, 0.72, bm, 0.25));
    P.push(cap(kn, ft, 0.45, 0.38, bm, 0.2));
    P.push(sphere([ft[0], ft[1], ft[2] + 0.1], 0.6, bm, 0.2));
    const toe = off([ft[0], ft[1], Math.max(0.45, ft[2] - 0.45)], 1.4, 0);
    P.push(ell(toe, f, [1.35, 0.8, 0.4], bm, 0.3));
  }
  // pelvis: a bony saddle, the spine rising from it in knuckled vertebrae
  const pv = J.pelvis;
  P.push(ell([pv[0], pv[1], pv[2] + 0.3], f, [1.2, 2.25 * r.b, 1.05], bm, 0.5));
  P.push(ell(off(pv, 0.5, 0, 0.1), f, [0.9, 1.0, 0.7], dark, 0.2)); // the hollow at its front, in shadow
  const neck: V3 = [J.head[0], J.head[1], J.head[2] - 2.1];
  const spineTop: V3 = [J.chest[0], J.chest[1], J.chest[2] + 2.4];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8, c = lerp3(off(pv, -0.6, 0, 0.6), spineTop, t);
    P.push(sphere(off(c, -0.25 * Math.sin(t * Math.PI), 0), 0.5 - t * 0.08, bm, 0.3));
  }
  P.push(cap(spineTop, neck, 0.42, 0.38, bm, 0.2));
  // ribcage: hooped ribs round the chest, open at the belly, a sternum down the front (hidden under a robe or armour)
  const rc = J.chest;
  if (w.torso === "bare") {
  P.push(ell([rc[0] - f[0] * 0.35, rc[1] - f[1] * 0.35, rc[2] + 0.4], f, [1.25, 1.95 * r.b, 2.2], mat(0x16100f, { lo: 0.6, hi: 1.4, n: 3 }), 0.3)); // the hollow inside, dark between the ribs
  for (let k = 0; k < 3; k++) {
    const z = rc[2] + 2.0 - k * 1.45, ra = 1.8 - k * 0.15, rs = (2.6 - k * 0.2) * r.b, sag = 0.35;
    P.push(custom([rc[0] - 5, rc[1] - 5, z - 2], [rc[0] + 5, rc[1] + 5, z + 1.5], (x, y, zz) => {
      const qx = x - rc[0], qy = y - rc[1], a = qx * f[0] + qy * f[1], si = qx * s[0] + qy * s[1];
      const ang = Math.atan2(si, a); // 0 = straight ahead
      const zc = z - sag * (1 - Math.cos(ang)) * 0.5 - Math.max(0, Math.cos(ang)) * 0.45; // ribs dip toward the front
      const ring = Math.hypot(Math.hypot(a / ra, si / rs) - 1, (zz - zc) / 1.6) * 1.6;
      const gap = Math.cos(ang) > 0.93 ? (Math.cos(ang) - 0.93) * 12 : 0; // they meet the sternum, not each other
      return ring - 0.3 + gap;
    }, bm, 0.15));
  }
  P.push(cap(off(rc, 1.65, 0, 2.2), off(rc, 1.75, 0, -0.9), 0.36, 0.3, bm, 0.2)); // sternum
  }
  // collarbones, then arm bones
  for (const [S, E, H] of [[J.nearS, J.nearE, J.nearH], [J.farS, J.farE, J.farH]] as [V3, V3, V3][]) {
    P.push(cap(off(spineTop, 0.9, 0, 0.1), S, 0.33, 0.33, bm, 0.15));
    P.push(sphere(S, 0.78, bm, 0.3));
    P.push(cap(S, E, 0.48, 0.4, bm, 0.2));
    P.push(sphere(E, 0.58, bm, 0.2));
    P.push(cap(E, H, 0.4, 0.36, bm, 0.2));
    P.push(sphere(H, 0.68, bm, 0.3, TAG_HAND));
  }
  if (L.rags !== undefined) rags3D(L.rags, r, P, f, s, J);
  garb3D(L, w, r, P, f, s, J);
}

/** What the dead wear over their bones: a robe (body and a long skirt to the ground), sleeves, a sash. */
function garb3D(L: Look, w: Dress3D, r: Rig3, P: Prim[], f: P, s: P, J: Joints) {
  const robe = w.torso === "robe" || w.legs === "robe";
  if (!robe && w.torso === "bare") return;
  const tm = mat(w.torsoCol, { grain: 0.1, lo: 0.36, hi: clothHi(w.torsoCol, 1.38) });
  const b = r.b, { chest, waist, pelvis } = J;
  if (w.torso !== "bare") {
    P.push(ell(chest, f, [1.95 * b, 2.9 * b, 2.9], tm, 1.2));
    P.push(ell(waist, f, [1.6 * b, 2.3 * b, 2.5], tm, 1.2));
    P.push(ell([chest[0] - f[0] * 0.2, chest[1] - f[1] * 0.2, chest[2] + 3.0], f, [1.5, 1.85, 0.9], tm, 0.5)); // collar
  }
  if (robe) robe3D(w, r, P, f, s, J);
  // sash or belt round the waist
  const beltCol = L.sash ?? w.belt;
  if (beltCol !== undefined) P.push(ell([pelvis[0], pelvis[1], pelvis[2] + 1.6], f, [2.05 * b, 2.85 * b, 0.6], mat(beltCol, { lo: 0.4, hi: 1.4, n: 5 }), 0.2));
  // sleeves over the arm bones, wide at the wrist
  if (w.arms === "cloth" || w.arms === "plate" || w.arms === "wrap") {
    const sm = w.arms === "plate" ? mat(w.sleeve, { spec: 0.7, lo: 0.3, hi: 1.4 }) : mat(w.sleeve, { grain: 0.1, lo: 0.36, hi: clothHi(w.sleeve, 1.38) });
    for (const [S, E, H] of [[J.nearS, J.nearE, J.nearH], [J.farS, J.farE, J.farH]] as [V3, V3, V3][]) {
      P.push(sphere(S, 1.4 * b, sm, 0.8));
      P.push(cap(S, E, 1.05, 0.95, sm, 0.6));
      const cuff = lerp3(E, H, 0.72);
      P.push(cap(E, cuff, 0.95, w.arms === "cloth" ? 1.3 : 0.9, sm, 0.5));
    }
  }
}

/** A long robe hanging from the hips to the ground (the dead's grave-robes, living adepts' and priests' robes). */
function robe3D(w: Dress3D, r: Rig3, P: Prim[], f: P, s: P, J: Joints) {
  const b = r.b, { pelvis } = J, lm = mat(w.legCol, { grain: 0.1, lo: 0.36, hi: clothHi(w.legCol, 1.38) });
  const trimM = w.trim !== undefined ? mat(w.trim, { spec: 0.5, lo: 0.45, hi: 1.45, n: 5 }) : null;
  {
    // a long robe hanging from the hips to the ground, swinging with the stride, its hem frayed and dragged in the dirt
    const top = pelvis[2] + 1.8, len = top - 0.25, sw = r.moving * Math.sin(r.wave) * 0.5;
    const skirt = (x: number, y: number, z: number, grow: number) => {
      const qx = x - pelvis[0], qy = y - pelvis[1], a = qx * f[0] + qy * f[1], si = qx * s[0] + qy * s[1];
      const down = clamp((top - z) / len);
      const ang = Math.atan2(si, a);
      const R = 2.35 * b + down * 1.55 + Math.sin(ang * 6 + r.wave * 0.4) * 0.16 * down + grow;
      const ac = a - down * down * (0.3 + r.moving * 0.6) * (1 + sw);
      const hem = 0.25 + (Math.sin(ang * 9 + 1.7) * 0.5 + 0.5) * 0.7 * down;
      return Math.max(Math.hypot(ac * 1.15, si) - R, Math.max(z - top, hem - z));
    };
    const box: [V3, V3] = [[pelvis[0] - 8, pelvis[1] - 8, -1], [pelvis[0] + 8, pelvis[1] + 8, top + 1]];
    P.push(custom(box[0], box[1], (x, y, z) => skirt(x, y, z, 0), lm, 0.6));
    if (trimM) P.push(custom(box[0], box[1], (x, y, z) => Math.max(skirt(x, y, z, 0.12), z - 1.15), trimM, 0.1)); // a band at the hem
  }
}

/** Tattered cloth: a loincloth hanging front and back in torn strips. */
function rags3D(col: number, r: Rig3, P: Prim[], f: P, s: P, J: Joints) {
  const rm = mat(col, { lo: 0.42, hi: 1.5, grain: 0.14 });
  const pv = J.pelvis, sway = Math.sin(r.wave) * r.moving;
  for (const side of [1, -1]) { // front, back
    for (let k = -2; k <= 2; k++) {
      const len = 3.2 + ((k * 7 + side * 3 + 11) % 5) * 0.55, top: V3 = [pv[0] + f[0] * side * 1.25 + s[0] * k * 0.62, pv[1] + f[1] * side * 1.25 + s[1] * k * 0.62, pv[2] + 1.2];
      const lean = side * (0.4 + r.moving * 0.3) - sway * 0.4;
      const bot: V3 = [top[0] + f[0] * lean, top[1] + f[1] * lean, top[2] - len];
      P.push(cap(top, bot, 0.42, 0.26, rm, 0.25));
    }
  }
  P.push(ell([pv[0], pv[1], pv[2] + 1.25], f, [1.45, 2.5 * r.b, 0.55], rm, 0.3)); // the knotted band
}

/** A bare skull: domed cranium, deep sockets with a burning light in each, a gaping nasal hole, a loose jaw of teeth. */
function skull3D(L: Look, r: Rig3, P: Prim[], f: P, s: P, head: V3, chest: V3, eyes: V3[]) {
  const bm = boneMat(L.skin), hole = mat(0x120d10, { lo: 0.7, hi: 1.2, n: 3 }), tooth = mat(shade(L.skin, 1.1), { lo: 0.5, hi: 1.1, n: 4 });
  const off = (a: number, si: number, z: number): V3 => [head[0] + f[0] * a + s[0] * si, head[1] + f[1] * a + s[1] * si, head[2] + z];
  P.push(cap([chest[0], chest[1], chest[2] + 2.4], off(-0.3, 0, -1.9), 0.42, 0.4, bm, 0.2)); // neck vertebrae
  P.push(ell(off(-0.35, 0, 0.5), f, [2.35, 2.0, 2.15], bm, 0.6)); // cranium, long to the back
  P.push(ell(off(0.9, 0, -0.9), f, [1.55, 1.6, 1.15], bm, 0.7)); // cheekbones and upper teeth
  const open = r.attack >= 0 ? 0.55 : 0.15;
  P.push(ell(off(0.85, 0, -2.0 - open), f, [1.2, 1.25, 0.55], bm, 0.25)); // jaw, hanging a little open
  P.push(ell(off(1.55, 0, -1.45 - open * 0.5), f, [0.6, 1.0, 0.25 + open * 0.5], hole, 0.15)); // the dark between the teeth
  for (let k = -2; k <= 2; k++) P.push(sphere(off(2.0 - Math.abs(k) * 0.12, k * 0.38, -1.42), 0.26, tooth, 0.05));
  for (const sg of [-1, 1]) {
    const c = off(1.55, sg * 0.85, 0.05);
    P.push({ ...sphere(c, 0.78, hole, 0.3), cut: true });
    if (!r.blink) eyes.push(off(1.9, sg * 0.8, -0.05));
  }
  P.push({ ...ell(off(2.1, 0, -0.75), f, [0.6, 0.32, 0.45], hole, 0.15), cut: true }); // nose hole
  P.push({ ...ell(off(0.1, 0.4, 2.55), f, [1.5, 0.16, 0.6], mat(shade(L.skin, 0.4), { lo: 0.6, hi: 1, n: 3 }), 0.1), cut: true }); // a crack across the crown
}

// ---- beast-folk of the Mawdeep and the Hide-Kin (Look.beast / beastHood / tail / spiderLegs / wings / quills / claws) --
/** Each animal head: fur, muzzle and nose colours, skull radii (forward, side, up), snout length and thickness, ears. */
const BEAST3: Record<NonNullable<Look["beast"]>, { fur: number; muz: number; nose: number; r: V3; sn: number; sr: number; ear: "round" | "point" | "big" | "none"; k: number }> = {
  rat: { fur: 0x6e655c, muz: 0x8a8076, nose: 0xc08a84, r: [2.0, 1.8, 1.9], sn: 2.5, sr: 0.95, ear: "round", k: 1.25 },
  boar: { fur: 0x3e3028, muz: 0x7a5e4e, nose: 0x8a6a5a, r: [2.4, 2.2, 2.1], sn: 2.0, sr: 1.35, ear: "point", k: 1.3 },
  spider: { fur: 0x2a2228, muz: 0x3a3036, nose: 0x1a1418, r: [2.3, 2.2, 2.0], sn: 0, sr: 0, ear: "none", k: 1.25 },
  bat: { fur: 0x2e2426, muz: 0x4a3a3a, nose: 0x6a4a4a, r: [2.0, 1.95, 1.95], sn: 1.1, sr: 0.95, ear: "big", k: 1.25 },
  wolf: { fur: 0x6a6866, muz: 0xa8a29a, nose: 0x1a1616, r: [2.2, 2.0, 2.0], sn: 2.6, sr: 1.05, ear: "point", k: 1.3 },
  bull: { fur: 0x3a2a24, muz: 0x8a7a6a, nose: 0x5a4a44, r: [2.4, 2.3, 2.2], sn: 1.7, sr: 1.5, ear: "point", k: 1.4 },
  bear: { fur: 0x4a3626, muz: 0x8a6a4a, nose: 0x1a1210, r: [2.6, 2.45, 2.3], sn: 1.7, sr: 1.25, ear: "round", k: 1.4 },
  crow: { fur: 0x1e1a24, muz: 0x4a4650, nose: 0x2a2830, r: [2.1, 1.95, 2.0], sn: 0, sr: 0, ear: "none", k: 1.25 },
  camel: { fur: 0xb88a58, muz: 0xd0aa78, nose: 0x5a3a24, r: [1.9, 1.75, 1.9], sn: 2.6, sr: 1.05, ear: "round", k: 1.3 },
  lion: { fur: 0xc8923a, muz: 0xe2c690, nose: 0x3a2018, r: [2.2, 2.1, 2.1], sn: 1.4, sr: 1.25, ear: "round", k: 1.4 },
  mole: { fur: 0x54483e, muz: 0xb89a8a, nose: 0xd89a98, r: [2.2, 2.05, 1.9], sn: 1.8, sr: 0.85, ear: "none", k: 1.3 },
  hyena: { fur: 0x9a7a4a, muz: 0x3e2e22, nose: 0x120c0a, r: [2.2, 2.0, 2.0], sn: 2.2, sr: 1.15, ear: "round", k: 1.3 },
  stag: { fur: 0x6a4a34, muz: 0xc0a080, nose: 0x1a1210, r: [2.0, 1.9, 2.1], sn: 2.3, sr: 0.9, ear: "point", k: 1.15 },
  quill: { fur: 0x3e3228, muz: 0x8a7a68, nose: 0x1a1210, r: [2.2, 2.1, 2.0], sn: 1.9, sr: 0.9, ear: "round", k: 1.3 },
};

/**
 * The animal head a beast-folk wears, built in the rig's head frame. `hood`: the flayed head worn back over a man's
 * face (bigger, set up and back, dead-eyed), otherwise it is the whole head, with burning eyes.
 */
function beastHead3D(L: Look, r: Rig3, P: Prim[], f: P, s: P, head: V3, chest: V3, eyes: V3[], hood: boolean) {
  const kind = L.beast!, B = BEAST3[kind], K = hood ? 1.0 : B.k;
  const c: V3 = hood ? [head[0] - f[0] * 0.75, head[1] - f[1] * 0.75, head[2] + 0.95] : [head[0], head[1], head[2] + 0.2];
  const at = (a: number, si: number, z: number): V3 => [c[0] + (f[0] * a + s[0] * si) * K, c[1] + (f[1] * a + s[1] * si) * K, c[2] + z * K];
  const furM = mat(B.fur, { lo: 0.36, hi: 1.45, grain: 0.32 }), muzM = mat(B.muz, { lo: 0.38, hi: 1.35, grain: 0.15 });
  const noseM = mat(B.nose, { lo: 0.4, hi: 1.35, spec: 0.5 }), dark = mat(0x160c10, { lo: 0.6, hi: 1.1, n: 3 }), mouth = mat(0x4a1018, { lo: 0.5, hi: 1.2, n: 4 });
  const ivory = mat(0xe2d8bc, { lo: 0.45, hi: 1.15, n: 5, spec: 0.2 }), hornM = mat(0xcfc2a2, { lo: 0.36, hi: 1.22, grain: 0.18 });
  const sc = (v: V3): V3 => [v[0] * K, v[1] * K, v[2] * K];
  const open = r.attack >= 0 ? 0.8 : 0.12;
  if (hood) P.push(cap(at(-1.2, 0, 0.6), [chest[0] - f[0] * 2.2, chest[1] - f[1] * 2.2, chest[2] + 1.0], 1.9 * K, 2.4, furM, 0.8)); // the hide hanging down the back
  else P.push(cap([chest[0], chest[1], chest[2] + 2.2], at(-0.5, 0, -1.4), 1.55 * K, 1.35 * K, furM, 0.7)); // a thick furred neck
  P.push(ell(at(-0.2, 0, 0.15), f, hood ? [B.r[0] * 1.05, Math.max(B.r[1], 2.35), B.r[2] * 0.85] : sc(B.r), furM, 0.7));
  const ey = B.r[1] * 0.55, ea = B.r[0] * 0.72, ez = 0.45;
  // the snout, nose and jaw
  if (B.sn > 0) {
    const hz = hood ? 0.9 : 0;
    const s0 = at(B.r[0] * 0.55, 0, -0.45 + hz), droop = kind === "camel" ? 0.9 : kind === "rat" || kind === "mole" ? 0.6 : 0.3;
    const s1 = at(B.r[0] * 0.55 + B.sn * (hood ? 0.6 : 1), 0, -0.45 - droop * (hood ? 0.3 : 1) + hz);
    P.push(cap(s0, s1, B.sr * K, B.sr * 0.72 * K, muzM, 0.6));
    if (!hood) P.push(cap(at(B.r[0] * 0.4, 0, -1.2), at(B.r[0] * 0.5 + B.sn * 0.85, 0, -1.3 - droop - open), B.sr * 0.62 * K, B.sr * 0.42 * K, kind === "hyena" ? muzM : furM, 0.4)); // lower jaw
    if (open > 0.5 && !hood) P.push(cap(at(B.r[0] * 0.7, 0, -1.0), at(B.r[0] * 0.5 + B.sn * 0.8, 0, -1.0 - droop - open * 0.5), B.sr * 0.5 * K, B.sr * 0.3 * K, mouth, 0.2));
    const tip = hood ? s1 : at(B.r[0] * 0.55 + B.sn + B.sr * 0.45, 0, -0.45 - droop + 0.1);
    if (kind === "boar") P.push(ell(tip, f, sc([0.35, 1.1, 0.85]), noseM, 0.2));
    else if (kind === "mole") for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; P.push(cap(tip, [tip[0] + (f[0] * 0.3 + s[0] * Math.cos(a) * 0.8) * K, tip[1] + (f[1] * 0.3 + s[1] * Math.cos(a) * 0.8) * K, tip[2] + Math.sin(a) * 0.8 * K], 0.3 * K, 0.2 * K, noseM, 0.15)); }
    else P.push(sphere(tip, (kind === "rat" || kind === "bat" ? 0.45 : 0.6) * K, noseM, 0.2));
    if (kind === "bull") P.push(custom([tip[0] - 3, tip[1] - 3, tip[2] - 3], [tip[0] + 3, tip[1] + 3, tip[2] + 2], (x, y, z) => { // iron nose ring
      const qx = x - tip[0], qy = y - tip[1], qz = z - (tip[2] - 0.9 * K), a = qx * f[0] + qy * f[1], si = qx * s[0] + qy * s[1];
      return Math.hypot(Math.hypot(a - 0.2, qz) - 0.75 * K, si) - 0.2;
    }, mat(0x8a8a86, { spec: 0.9, lo: 0.35, hi: 1.3 }), 0.05));
    // teeth: incisors (rat), tusks (boar), fangs (the rest), shown more when the jaw drops
    if (hood) { /* a flayed hood keeps no teeth worth showing */ }
    else if (kind === "rat") for (const sg of [-0.3, 0.3]) P.push(cap(at(B.r[0] * 0.55 + B.sn + 0.2, sg, -1.1 - droop), at(B.r[0] * 0.55 + B.sn + 0.3, sg, -1.9 - droop), 0.22 * K, 0.18 * K, ivory, 0.05));
    else if (kind === "boar") for (const sg of [-1, 1]) P.push(cap(at(B.r[0] + B.sn * 0.55, sg * B.sr * 0.8, -1.4), at(B.r[0] + B.sn * 0.75, sg * B.sr * 1.2, 0.2), 0.32 * K, 0.08 * K, ivory, 0.1));
    else if (kind !== "camel" && kind !== "mole" && open > 0.5) for (const sg of [-1, 1]) P.push(cap(at(B.r[0] * 0.5 + B.sn * 0.8, sg * B.sr * 0.45, -0.9 - droop), at(B.r[0] * 0.5 + B.sn * 0.8, sg * B.sr * 0.45, -1.7 - droop), 0.2 * K, 0.05 * K, ivory, 0.05));
  } else if (kind === "crow") { // a long hooked beak
    const b0 = at(B.r[0] * 0.6, 0, -0.2), b1 = at(B.r[0] * 0.6 + 3.0, 0, -0.9);
    P.push(cap(b0, b1, 0.95 * K, 0.12 * K, noseM, 0.3));
    P.push(cap(at(B.r[0] * 0.6, 0, -0.85), at(B.r[0] * 0.6 + 2.2, 0, -1.2 - open), 0.6 * K, 0.1 * K, noseM, 0.2));
    P.push(cap(at(-0.6, 0, B.r[2] * 0.9), at(-2.2, 0, B.r[2] * 1.2), 0.7 * K, 0.1 * K, furM, 0.3)); // a ragged crest
  } else if (kind === "spider") { // chelicerae with black fangs under a cluster of eyes
    for (const sg of [-1, 1]) {
      const a0 = at(B.r[0] * 0.65, sg * 0.75, -0.9), a1 = at(B.r[0] * 0.8 + 0.8, sg * (0.6 - open * 0.3), -2.0);
      P.push(cap(a0, a1, 0.62 * K, 0.42 * K, muzM, 0.3), cap(a1, at(B.r[0] * 0.8 + 0.7, sg * (0.2 - open * 0.3), -3.0 - open * 0.4), 0.3 * K, 0.06 * K, dark, 0.1));
    }
  }
  // ears, horns, antlers, mane
  for (const sg of [-1, 1]) {
    if (B.ear === "round") P.push(ell(at(-0.7, sg * B.r[1] * 0.78, B.r[2] * 0.85), f, sc([0.32, 0.9, 0.95]), furM, 0.4));
    else if (B.ear === "point") P.push(cap(at(-0.5, sg * B.r[1] * 0.65, B.r[2] * 0.6), at(-1.0, sg * B.r[1] * (kind === "stag" || kind === "bull" ? 1.45 : 0.85), B.r[2] * (kind === "stag" || kind === "bull" ? 0.75 : 1.5)), 0.7 * K, 0.08 * K, furM, 0.3));
    else if (B.ear === "big") P.push(cap(at(-0.6, sg * B.r[1] * 0.7, B.r[2] * 0.55), at(-1.0, sg * B.r[1] * 1.3, B.r[2] * 2.0), 1.05 * K, 0.08 * K, furM, 0.3));
    if (kind === "bull") { // horns: out to the sides, then up and forward
      const h0 = at(-0.2, sg * B.r[1] * 0.75, B.r[2] * 0.6), h1 = at(0.1, sg * (B.r[1] + 1.7), B.r[2] * 0.8), h2 = at(0.7, sg * (B.r[1] + 2.4), B.r[2] * 0.8 + 1.9);
      P.push(cap(h0, h1, 0.62 * K, 0.45 * K, hornM, 0.2), cap(h1, h2, 0.45 * K, 0.06 * K, hornM, 0.15));
    }
    if (kind === "stag") { // antlers: a beam back and up with three tines
      const a0 = at(-0.4, sg * B.r[1] * 0.45, B.r[2] * 0.85), a1 = at(-1.2, sg * (B.r[1] + 1.4), B.r[2] + 2.4), a2 = at(-1.8, sg * (B.r[1] + 2.0), B.r[2] + 4.6);
      P.push(cap(a0, a1, 0.36 * K, 0.3 * K, hornM, 0.15), cap(a1, a2, 0.3 * K, 0.12 * K, hornM, 0.1));
      for (const [p, d] of [[lerp3(a0, a1, 0.5), [0.9, 0, 1.4]], [a1, [0.8, 0.3 * sg, 1.6]], [lerp3(a1, a2, 0.6), [0.6, 0.5 * sg, 1.2]]] as [V3, number[]][])
        P.push(cap(p, [p[0] + (f[0] * d[0] + s[0] * d[1]) * K, p[1] + (f[1] * d[0] + s[1] * d[1]) * K, p[2] + d[2] * K], 0.22 * K, 0.07 * K, hornM, 0.08));
    }
  }
  if (kind === "lion" && !hood) { // the sphinx's royal headcloth: gold and lapis stripes over the crown, lappets to the chest
    const gold = mat(0xe0b040, { spec: 0.4, lo: 0.4, hi: 1.35, grain: 0.05 }), lapis = mat(0x2a4a9a, { lo: 0.4, hi: 1.4, grain: 0.05 });
    const striped = (base: Prim) => { P.push(base); P.push(custom(base.lo, base.hi, (x, y, z) => Math.max(base.d(x, y, z) - 0.07, (Math.abs((((z / (1.1 * K)) % 1) + 1) % 1 - 0.5) - 0.24) * K), lapis, 0.02)); };
    striped(ell(at(-0.45, 0, 0.75), f, sc([2.55, 2.75, 2.15]), gold, 0.5));
    for (const sg of [-1, 1]) striped(ell(at(0.35, sg * 2.45, -2.4), f, sc([0.55, 1.25, 2.6]), gold, 0.4));
    P.push(ell(at(0.25, 0, 0.55), f, sc([2.35, 2.62, 0.3]), mat(0xf0c850, { spec: 0.9, lo: 0.4, hi: 1.4 }), 0.05)); // brow band
    P.push(cap(at(2.35, 0, 0.6), at(2.6, 0, 1.6), 0.28 * K, 0.38 * K, mat(0xf0c850, { spec: 0.9, lo: 0.4, hi: 1.4 }), 0.05)); // the rearing cobra
  }
  if (kind === "lion" && !hood) P.push(custom(at(-6, -6, -6), at(6, 6, 6), (x, y, z) => { // a heavy mane round the face
    const qx = x - c[0], qy = y - c[1], qz = z - (c[2] - 0.3 * K), a = (qx * f[0] + qy * f[1]) / K, si = (qx * s[0] + qy * s[1]) / K, h = qz / K;
    const R = 3.2 + Math.sin(Math.atan2(h, si) * 9) * 0.25;
    return Math.max((Math.hypot(si, h) - R) * K, (Math.abs(a + 0.9) - 1.2) * K);
  }, mat(0x8a5420, { lo: 0.36, hi: 1.4, grain: 0.4 }), 0.6));
  if (kind === "hyena" || kind === "boar" || kind === "quill") for (let i = 0; i < 5; i++) { // a bristling crest over the crown
    const p = at(0.6 - i * 0.75, 0, B.r[2] * (0.95 - i * 0.08));
    P.push(cap(p, at(0.1 - i * 0.85, (i % 2 ? 0.25 : -0.25), B.r[2] * (0.95 - i * 0.08) + (kind === "quill" ? 1.9 : 1.1)), 0.42 * K, 0.06 * K, kind === "quill" ? hornM : mat(shade(B.fur, 0.6), { lo: 0.4, hi: 1.3, grain: 0.2 }), 0.15));
  }
  // eyes: burning on the beast, dead and dark on a flayed hood
  if (kind === "spider") {
    const pts: [number, number, number][] = [[0.95, 0.42, 0.55], [0.85, 1.05, 0.75], [0.6, 1.35, 0.25], [0.9, 0.45, 1.1]];
    for (const [a, si, z] of pts) for (const sg of [-1, 1]) {
      const p = at(B.r[0] * a, sg * si, z);
      if (hood) P.push(sphere(p, 0.3 * K, dark, 0.05)); else if (!r.blink) eyes.push(p);
    }
  } else for (const sg of [-1, 1]) {
    const p = at(ea + (kind === "crow" ? -0.2 : 0), sg * ey, ez + (hood ? 0.9 : 0));
    if (hood || kind === "mole") P.push(sphere(p, (kind === "mole" ? 0.22 : 0.32) * K, dark, 0.05));
    if (!hood && !r.blink && kind !== "mole") eyes.push(p);
  }
  // the stitched seam where hide meets the man (a dark band round the neck or under the hood's rim)
  if (!hood) P.push(ell([c[0], c[1], c[2] - 2.2 * K], f, [1.6 * K, 1.6 * K, 0.22], mat(0x2a1c18, { lo: 0.5, hi: 1.2, n: 4 }), 0.1));
}

/** What the Hide Rite grew on their backs, and the claws and charms they carry: tail, spider legs, wings, quills. */
function beastParts3D(L: Look, r: Rig3, P: Prim[], f: P, s: P, J: Joints) {
  const b = r.b, { chest, pelvis, waist } = J, t = r.t;
  const off = (p: V3, a: number, si: number, z = 0): V3 => [p[0] + f[0] * a + s[0] * si, p[1] + f[1] * a + s[1] * si, p[2] + z];
  if (L.tail !== undefined) {
    const tm = mat(L.tail, { lo: 0.38, hi: 1.35, grain: L.beast === "lion" ? 0.2 : 0.05 }), sw = Math.sin(t * 1.3) * 0.9;
    const p0 = off(pelvis, -1.8 * b, 0, -0.6), p1 = off(pelvis, -4.0, sw * 0.6, -2.2), p2 = off(pelvis, -6.8, sw * 1.4, -pelvis[2] + 0.5);
    P.push(cap(p0, p1, 0.72, 0.5, tm, 0.3), cap(p1, p2, 0.5, 0.18, tm, 0.2));
    if (L.beast === "lion") P.push(ell(p2, f, [1.0, 0.8, 0.8], mat(0x5a3418, { lo: 0.4, hi: 1.3, grain: 0.3 }), 0.2));
  }
  if (L.spiderLegs !== undefined) {
    const lm = mat(L.spiderLegs, { lo: 0.36, hi: 1.35, spec: 0.35, grain: 0.1 }), wig = Math.sin(t * 1.9) * 0.7;
    for (const sg of [-1, 1]) for (let k = 0; k < 2; k++) {
      const root = off(chest, -1.6 * b, sg * 1.3 * b, 0.6 - k * 1.5);
      const knee = off(root, -1.6 - k * 0.6, sg * (4.0 + k * 0.9), 3.4 - k * 1.0 + (k ? wig : -wig));
      const tip = off(knee, -0.8 + k * 0.6, sg * (2.0 + k), -(knee[2] - 1.5 - k * 2.0));
      P.push(cap(root, knee, 0.55, 0.45, lm, 0.2), sphere(knee, 0.5, lm, 0.1), cap(knee, tip, 0.45, 0.12, lm, 0.15));
    }
  }
  if (L.wings) {
    const rest = !!L.wings.rest, bat = L.wings.kind === "bat", flap = Math.sin(t * 1.7) * (rest ? 0.25 : 1);
    const wm = mat(L.wings.col, { lo: 0.34, hi: 1.4, grain: bat ? 0.06 : 0.3 }), bone = mat(shade(L.wings.col, 0.7), { lo: 0.4, hi: 1.3 });
    const tipM = L.wings.tip !== undefined ? mat(L.wings.tip, { lo: 0.4, hi: 1.4, grain: 0.2 }) : wm;
    for (const sg of [-1, 1]) {
      const root = off(chest, -1.7 * b, sg * 1.2 * b, 1.6);
      const span = rest ? 7.5 : 11, lift = (rest ? 7.0 : 5.0) + flap * 3.2;
      const elbow = off(root, -0.9, sg * span * 0.42, lift), tip = off(root, -1.4, sg * span, lift * 0.45 - 0.6);
      const low: V3[] = [];
      for (let k = 4; k >= 1; k--) { const u = k / 4.5, dip = k % 2 ? 0 : bat ? 1.2 : 0.4; low.push(off(root, -1.2 * u - 0.4, sg * span * u * 0.95, -3.4 + u * 2.6 + dip + flap * 0.5)); }
      const poly = [root, elbow, tip, ...low];
      const tris: [V3, V3, V3][] = [];
      for (let i = 1; i < poly.length - 1; i++) tris.push([root, poly[i], poly[i + 1]]);
      const lo: V3 = [Math.min(...poly.map((p) => p[0])) - 1, Math.min(...poly.map((p) => p[1])) - 1, Math.min(...poly.map((p) => p[2])) - 1];
      const hi: V3 = [Math.max(...poly.map((p) => p[0])) + 1, Math.max(...poly.map((p) => p[1])) + 1, Math.max(...poly.map((p) => p[2])) + 1];
      P.push(custom(lo, hi, (x, y, z) => { let d = Infinity; for (const T of tris) d = Math.min(d, triDist([x, y, z], T[0], T[1], T[2])); return d - 0.28; }, wm, 0.3));
      P.push(cap(root, elbow, 0.55, 0.4, bone, 0.15), cap(elbow, tip, 0.4, 0.12, bone, 0.1));
      if (bat) for (const q of low) P.push(cap(elbow, q, 0.2, 0.1, bone, 0.08)); // finger bones through the membrane
      else for (let k = 0; k < 6; k++) { const a = lerp3(elbow, tip, k / 6); P.push(cap(a, off(a, -0.6, -sg * 0.2, -3.0 + k * 0.3), 0.3, 0.12, k > 1 ? tipM : wm, 0.1)); } // primaries
    }
  }
  if (L.quills !== undefined) { // a porcupine's back: banded quills fanning out of the spine
    const qd = mat(L.quills, { lo: 0.4, hi: 1.3 }), qt = mat(0xe8dfc4, { lo: 0.45, hi: 1.15, n: 5 });
    for (let k = 0; k < 18; k++) {
      const u = (k + 0.5) / 18, side = Math.cos(u * Math.PI * 5.3) * (0.4 + u * 0.6), rs = ((k * 7919) % 13) / 13;
      const a = off(chest, -2.0 * b, side * 2.2 * b, 2.0 - u * 5.0);
      const len = 3.6 + rs * 2.0, dir: V3 = [-f[0] * 0.75 + s[0] * side * 0.6, -f[1] * 0.75 + s[1] * side * 0.6, 0.65 - u * 0.4];
      const m = lerp3(a, [a[0] + dir[0] * len, a[1] + dir[1] * len, a[2] + dir[2] * len], 0.6), e: V3 = [a[0] + dir[0] * len, a[1] + dir[1] * len, a[2] + dir[2] * len];
      P.push(cap(a, m, 0.32, 0.22, qd, 0.1), cap(m, e, 0.22, 0.05, qt, 0.05));
    }
  }
  if (L.claws !== undefined) { // big digging claws on both hands
    const cm = mat(L.claws, { lo: 0.4, hi: 1.25, spec: 0.3 });
    for (const H of [J.nearH, J.farH]) for (let k = -1; k <= 1; k++) P.push(cap(off(H, 0.5, k * 0.45, -0.2), off(H, 1.6, k * 0.6, -1.4), 0.3, 0.06, cm, 0.08));
  }
  const ba = L.boneArmour ?? 0;
  if (ba) { // the Bone Demon's harvested skeletons: skull pauldrons, a rib cuirass, a crown of finger bones
    const bm = boneMat(0xd8ccb0), hole = mat(0x120d10, { lo: 0.7, hi: 1.2, n: 3 });
    for (const S of [J.nearS, J.farS]) {
      P.push(ell(off(S, 0, 0, 1.1), f, [2.4, 2.4, 1.8], bm, 0.3));
      P.push({ ...sphere(off(S, 2.0, -0.6, 1.3), 0.5, hole, 0.1), cut: true }, { ...sphere(off(S, 2.0, 0.6, 1.3), 0.5, hole, 0.1), cut: true });
      P.push(cap(off(S, -0.4, 0, 2.2), off(S, -1.0, 0, 3.6), 0.4, 0.08, bm, 0.1));
    }
    if (ba >= 2) for (let i = 0; i < 4; i++) { // ribs hooped round the chest, the sternum down the front
      const z = chest[2] + 1.6 - i * 1.25;
      P.push(custom([chest[0] - 6, chest[1] - 6, z - 1], [chest[0] + 6, chest[1] + 6, z + 1], (x, y, zz) => {
        const qx = x - chest[0], qy = y - chest[1], a = qx * f[0] + qy * f[1], si = qx * s[0] + qy * s[1];
        return Math.max(Math.hypot(Math.hypot(a / (2.6 * b), si / (3.4 * b)) - 1, (zz - z) / 0.35) * 2.4 - 0.36, -a);
      }, bm, 0.1));
    }
    if (ba >= 2) P.push(cap(off(chest, 2.65 * b, 0, 2.2), off(chest, 2.45 * b, 0, -2.6), 0.45, 0.4, bm, 0.1));
    if (ba >= 4) for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; P.push(cap([J.head[0] + Math.cos(a) * 1.9, J.head[1] + Math.sin(a) * 1.9, J.head[2] + 1.6], [J.head[0] + Math.cos(a) * 2.3, J.head[1] + Math.sin(a) * 2.3, J.head[2] + 3.4 + (k % 2) * 0.8], 0.32, 0.08, bm, 0.08)); }
  }
  if (L.fetishes !== undefined) { // bone and charm fetishes on cords from the belt
    const cord = mat(L.fetishes, { lo: 0.4, hi: 1.3 }), bone = boneMat(0xd8ccb0), sw = Math.sin(r.wave) * r.moving * 0.5;
    for (const [a, si, n] of [[1.6, 1.6, 2.6], [1.8, -0.4, 3.4], [0.6, -1.9, 2.2]] as const) {
      const top = off(waist, a * b, si * b, -0.4), bot = off(top, sw, 0, -n);
      P.push(cap(top, bot, 0.12, 0.12, cord, 0.05), sphere(bot, 0.55, n > 3 ? bone : cord, 0.1));
    }
  }
}

/** Distance from p to the triangle abc (exact, unsigned). */
function triDist(p: V3, a: V3, b: V3, c: V3): number {
  const sub = (u: V3, v: V3): V3 => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u: V3, v: V3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const crs = (u: V3, v: V3): V3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const ba = sub(b, a), pa = sub(p, a), cb = sub(c, b), pb = sub(p, b), ac = sub(a, c), pc = sub(p, c), n = crs(ba, ac);
  const sg = Math.sign(dot(crs(ba, n), pa)) + Math.sign(dot(crs(cb, n), pb)) + Math.sign(dot(crs(ac, n), pc));
  if (sg < 2) {
    const seg = (e: V3, q: V3) => { const h = clamp(dot(e, q) / (dot(e, e) || 1e-6)); return Math.hypot(e[0] * h - q[0], e[1] * h - q[1], e[2] * h - q[2]); };
    return Math.min(seg(ba, pa), seg(cb, pb), seg(ac, pc));
  }
  return Math.abs(dot(n, pa)) / (Math.hypot(...n) || 1e-6);
}

// ---- ray casting ------------------------------------------------------------------------------------------------
const LIGHT: V3 = (() => { const v: V3 = [-0.55, -0.45, 0.72]; const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();
const VIEW: V3 = [0, -COS, SIN]; // toward the camera
const HALF: V3 = (() => { const v: V3 = [LIGHT[0] + VIEW[0], LIGHT[1] + VIEW[1], LIGHT[2] + VIEW[2]]; const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
function hash3(x: number, y: number, z: number) { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

function scene(ps: Prim[], x: number, y: number, z: number, want: { m: Mat | null; tag: number } | null): number {
  let d = Infinity, best = Infinity;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    // cheap reject: far outside the prim's box, its exact distance cannot matter for the blend
    const ox = Math.max(p.lo[0] - x, 0, x - p.hi[0]), oy = Math.max(p.lo[1] - y, 0, y - p.hi[1]), oz = Math.max(p.lo[2] - z, 0, z - p.hi[2]);
    const out = Math.hypot(ox, oy, oz);
    const di = out > 2 ? out : p.d(x, y, z);
    if (p.cut) {
      if (d === Infinity) continue;
      const kk = p.k, h = clamp(0.5 - 0.5 * (d + di) / kk), nd = d * (1 - h) - di * h + kk * h * (1 - h);
      if (want && Math.abs(di) < 0.3 && d < 0.3) { want.m = p.m; want.tag = p.tag; best = Math.abs(di); }
      d = nd;
      continue;
    }
    if (want && di < best) { best = di; want.m = p.m; want.tag = p.tag; }
    if (d === Infinity) d = di;
    else if (di - d > p.k) { /* no blend */ }
    else if (d - di > p.k) d = di;
    else { const kk = p.k, h = clamp(0.5 + 0.5 * (di - d) / kk); d = di * (1 - h) + d * h - kk * h * (1 - h); }
  }
  return d;
}

export interface Ray3Out { rgba: Uint8ClampedArray; tag: Uint8Array; depth: Float32Array; handNear: P; handFar: P }

/**
 * Where a frame sits on the rig: tw x th texels, k texels per rig unit, its top-left at rig (x0, y0). Heroes use the
 * whole 32x32 rig square (Frame3.hero); monsters (paint/mobs.ts) put the rig's feet where their sheet wants them.
 */
export interface Frame3 { tw: number; th: number; k: number; x0: number; y0: number; /** no ground shadow (the toppled fall frames draw their own) */ noShadow?: boolean; /** a flier hovers this many rig units over its ground shadow */ lift?: number }
export const heroFrame3 = (W: number): Frame3 => ({ tw: W, th: W, k: W / 32, x0: 0, y0: 0 });

/** Ray-casts the model into a frame (a number W = the hero's W x W square). Hand points come back in rig units on screen. */
export function render3D(model: Built, fr: number | Frame3): Ray3Out {
  const F = typeof fr === "number" ? heroFrame3(fr) : fr, W = F.tw, TH = F.th;
  const k = F.k, ps = model.prims;
  const rgba = new Uint8ClampedArray(W * TH * 4), tag = new Uint8Array(W * TH), depth = new Float32Array(W * TH).fill(Infinity);
  // screen bounds of the model (skip empty texels)
  let x0 = Infinity, x1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of ps) {
    x0 = Math.min(x0, p.lo[0]); x1 = Math.max(x1, p.hi[0]);
    for (const dd of [p.lo[1], p.hi[1]]) for (const zz of [p.lo[2], p.hi[2]]) { const v = dd * SIN + zz * COS; v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  }
  const want = { m: null as Mat | null, tag: 0 };
  // each prim's box on screen: a ray only looks at the prims whose box it crosses (blends reach k further)
  const sb = ps.map((p) => {
    const m = Math.max(p.k, 1.3) + 0.3;
    let a = Infinity, bb = -Infinity;
    for (const dd of [p.lo[1], p.hi[1]]) for (const zz of [p.lo[2], p.hi[2]]) { const v = dd * SIN + zz * COS; a = Math.min(a, v); bb = Math.max(bb, v); }
    return [p.lo[0] - m, p.hi[0] + m, a - m, bb + m];
  });
  const local: Prim[] = [];
  for (let j = 0; j < TH; j++) {
    const V = 29 - (F.y0 + (j + 0.5) / k);
    if (V < v0 || V > v1) continue;
    for (let i = 0; i < W; i++) {
      const X = F.x0 + (i + 0.5) / k;
      if (X < x0 || X > x1) continue;
      local.length = 0;
      for (let q = 0; q < ps.length; q++) { const B = sb[q]; if (X >= B[0] && X <= B[1] && V >= B[2] && V <= B[3]) local.push(ps[q]); }
      if (!local.length) continue;
      const ps2 = local;
      // march along the view ray: start in front (toward the camera) and step away
      let t = 0, hit = false;
      const D0 = -16, Z0 = (V - D0 * SIN) / COS;
      let x = X, y = D0, z = Z0;
      for (let s = 0; s < 120; s++) {
        y = D0 + t * COS; z = Z0 - t * SIN;
        if (z < -2 || t > 40) break;
        const d = scene(ps2, x, y, z, null);
        if (d < 0.03) { hit = true; break; }
        t += Math.max(0.04, d * 0.85);
      }
      if (!hit) continue;
      scene(ps2, x, y, z, want);
      const m = want.m!, e = 0.18;
      let nx = scene(ps2, x + e, y, z, null) - scene(ps2, x - e, y, z, null);
      let ny = scene(ps2, x, y + e, z, null) - scene(ps2, x, y - e, z, null);
      let nz = scene(ps2, x, y, z + e, null) - scene(ps2, x, y, z - e, null);
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const ao = clamp(scene(ps2, x + nx * 1.3, y + ny * 1.3, z + nz * 1.3, null) / 1.3);
      const dif = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      const sky = 0.5 + 0.5 * nz;
      let v = (0.06 + dif * 0.74 + sky * 0.2) * (0.55 + 0.45 * ao);
      if (m.spec) v += Math.pow(Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]), 18) * m.spec * 0.9;
      if (m.grain) v += (hash3(Math.round(x * 3), Math.round(y * 3), Math.round(z * 3)) - 0.5) * m.grain;
      if (m.glow) v = Math.max(v, 0.62);
      const n = m.ramp.length;
      const bay = (BAYER[j & 3][i & 3] + 0.5) / 16 - 0.5;
      const li = clamp(Math.floor(clamp(v) * n + bay * 0.6), 0, n - 1);
      const c = m.ramp[li], a = (j * W + i) * 4;
      rgba[a] = (c >> 16) & 255; rgba[a + 1] = (c >> 8) & 255; rgba[a + 2] = c & 255; rgba[a + 3] = 255;
      tag[j * W + i] = want.tag; depth[j * W + i] = t;
    }
  }
  // inner lines: a part seen behind a nearer one (an arm before the body) gets a darker edge
  const out = new Uint8ClampedArray(rgba);
  for (let j = 0; j < TH; j++) for (let i = 0; i < W; i++) {
    const a = j * W + i; if (depth[a] === Infinity) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= TH) continue;
      const bb = jj * W + ii;
      if (depth[bb] !== Infinity && depth[a] - depth[bb] > 2.2) { for (let c = 0; c < 3; c++) out[a * 4 + c] = Math.round(out[a * 4 + c] * 0.5 + [0x1a, 0x14, 0x20][c] * 0.5); break; }
    }
  }
  // eyes: one burning texel each where it can be seen
  for (const ew of model.eyes) {
    const V = ew[1] * SIN + ew[2] * COS, i = Math.floor((ew[0] - F.x0) * k), j = Math.floor((29 - V - F.y0) * k);
    if (i < 0 || j < 0 || i >= W || j >= TH) continue;
    const a = j * W + i, tt = (ew[1] + 16) / COS; // t of the eye along its ray
    if (depth[a] === Infinity || tt > depth[a] + 0.9) continue;
    out[a * 4] = (model.eyeCol >> 16) & 255; out[a * 4 + 1] = (model.eyeCol >> 8) & 255; out[a * 4 + 2] = model.eyeCol & 255; tag[a] = TAG_EYE;
  }
  const scr = (p: V3): P => [p[0], 29 - (p[1] * SIN + p[2] * COS)];
  return { rgba: out, tag, depth, handNear: scr(model.handNear), handFar: scr(model.handFar) };
}
