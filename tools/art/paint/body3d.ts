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
  cape?: { col: number; collar?: number; short?: boolean };
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
function ramp(col: number, n = 7, lo = 0.34, hi = 1.32): number[] {
  // very dark cloth still needs a readable light side: stretch the top of the ramp
  const mx = Math.max((col >> 16) & 255, (col >> 8) & 255, col & 255) / 255;
  hi = Math.max(hi, Math.min(2.8, 0.62 / Math.max(mx, 0.05)));
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
const mat = (col: number, o: Partial<Mat> & { lo?: number; hi?: number; n?: number } = {}): Mat =>
  ({ ramp: ramp(col, o.n ?? 7, o.lo ?? 0.34, o.hi ?? 1.32), spec: o.spec ?? 0, grain: o.grain ?? 0, glow: o.glow });

// ---- signed distance primitives (world space) -----------------------------------------------------------------
interface Prim { d: (x: number, y: number, z: number) => number; m: Mat; k: number; tag: number; lo: V3; hi: V3 }
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

export function build3D(L: Look, w: Dress3D, r: Rig3): Built {
  const f = facingOf(r), s: P = [f[1], -f[0]]; // s = the body's right side (the weapon side)
  const dep = (a: number, si: number) => a * f[1] + si * s[1]; // depth of a point `a` forward, `si` to the right
  const b = r.b, P: Prim[] = [];
  const skin = mat(L.skin, { lo: 0.5, hi: 1.1 });
  const atk = r.attack >= 0 ? 1 : 0;
  // joints in 3D: x/height straight from the rig, depth from where that joint sits on the body
  const SW = 3.2 * b;
  const nearS = lift(r.nearS, dep(0, SW)), farS = lift(r.farS, dep(0, -SW));
  const handA = 1.2 + atk * 2.2;
  const nearH = lift(r.nearH, dep(handA, SW * 0.85)), farH = lift(r.farH, dep(r.dir === "right" ? 0.6 : 0.8, -SW * 0.85));
  const nearE = lift(r.nearE, (nearS[1] + nearH[1]) / 2 + dep(-0.6, 0.6)), farE = lift(r.farE, (farS[1] + farH[1]) / 2 + dep(-0.6, -0.6));
  const strideA = r.stride * (r.run ? 4.3 : 3.5);
  const hipD = [dep(0, 1.55 * b), dep(0, -1.55 * b)];
  const footD = [dep(-strideA, 1.75 * b), dep(strideA, -1.75 * b)];
  // the rig's "near" leg 0 is the back one when facing right; for down/up the rig spreads them sideways
  const hips = [lift(r.hips[0], hipD[0]), lift(r.hips[1], hipD[1])];
  const feet = [0, 1].map((i) => { const ft = r.feet[i]; const d = footD[i]; return [ft[0], d, Math.max(0.9, (29 - ft[1]) / COS - (r.dir === "right" ? 0 : d * 0.25))] as V3; });
  const knees = [0, 1].map((i) => { const k = lift(r.knees[i], (hipD[i] + footD[i]) / 2 + dep(0.9, 0)); return k; });
  const head = lift([r.head[0], r.head[1] + 0.7], dep(0.2, 0));
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
        : mat(w.torsoCol, { grain: 0.05, lo: 0.36, hi: 1.38 });
  const trimM = w.trim !== undefined ? mat(w.trim, { spec: 0.7, lo: 0.45, hi: 1.45, n: 5 }) : null;
  const armArm = w.armour;
  const sleeveM = armArm ? mat(armArm.col, { spec: 0.8, lo: 0.3, hi: 1.45 }) : w.arms === "bare" ? skin : mat(w.sleeve, { grain: 0.05 });
  const handM = w.glove !== undefined ? mat(w.glove, { lo: 0.4, hi: 1.5 }) : skin;
  const linen = mat(LINEN, { lo: 0.45, hi: 1.12 });

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
    const top = pelvis[2] + 1.6, len = w.torso === "leather" ? 3.2 : 6.6, bot = top - len;
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

  // ---- neck, head, hair, face
  const neckTop: V3 = [head[0], head[1], head[2] - 2.0];
  P.push(cap([chest[0], chest[1], chest[2] + 2.6], neckTop, 1.05, 0.95, skin, 0.6));
  P.push(ell(head, f, [2.2, 2.1, 2.5], skin, 0.7));
  P.push(ell([head[0] + f[0] * 0.55, head[1] + f[1] * 0.55, head[2] - 1.4], f, [1.65, 1.6, 1.35], skin, 0.8)); // jaw
  P.push(ell([head[0] + f[0] * 2.1, head[1] + f[1] * 2.1, head[2] - 0.2], f, [0.55, 0.38, 0.75], skin, 0.3)); // nose
  const hg = w.head;
  const hairM = L.hair !== undefined ? mat(L.hair, { lo: 0.5, hi: 1.9, grain: 0.06 }) : null;
  if (hairM && L.hairStyle !== "bald" && L.hairStyle !== "none" && hg !== "helm" && hg !== "greathelm") {
    // swept back: a cap over the crown and down the back of the head
    P.push(ell([head[0] - f[0] * 0.6, head[1] - f[1] * 0.6, head[2] + 0.85], f, [2.3, 2.25, 1.9], hairM, 0.5));
    P.push(ell([head[0] - f[0] * 1.15, head[1] - f[1] * 1.15, head[2] - 0.5], f, [1.4, 2.0, 2.0], hairM, 0.6));
    if (L.hairStyle === "long") P.push(ell([head[0] - f[0] * 1.6, head[1] - f[1] * 1.6, head[2] - 3.2], f, [1.0, 2.3, 2.8], hairM, 0.8));
  }
  const eyes: V3[] = [];
  if (!r.blink) for (const sg of [-1, 1]) eyes.push([head[0] + f[0] * 2.05 + s[0] * sg * 0.95, head[1] + f[1] * 2.05 + s[1] * sg * 0.95, head[2] + 0.15]);

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

  // ---- cape and collar
  if (w.cape) {
    const cm = mat(w.cape.col, { lo: 0.4, hi: 2.6, n: 8 });
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
    if (want && di < best) { best = di; want.m = p.m; want.tag = p.tag; }
    if (d === Infinity) d = di;
    else if (di - d > p.k) { /* no blend */ }
    else if (d - di > p.k) d = di;
    else { const kk = p.k, h = clamp(0.5 + 0.5 * (di - d) / kk); d = di * (1 - h) + d * h - kk * h * (1 - h); }
  }
  return d;
}

export interface Ray3Out { rgba: Uint8ClampedArray; tag: Uint8Array; depth: Float32Array; handNear: P; handFar: P }

/** Ray-casts the model into a W x W frame (W = 32 * texels per rig unit). Hand points come back in rig units on screen. */
export function render3D(model: Built, W: number): Ray3Out {
  const k = W / 32, ps = model.prims;
  const rgba = new Uint8ClampedArray(W * W * 4), tag = new Uint8Array(W * W), depth = new Float32Array(W * W).fill(Infinity);
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
  for (let j = 0; j < W; j++) {
    const V = 29 - (j + 0.5) / k;
    if (V < v0 || V > v1) continue;
    for (let i = 0; i < W; i++) {
      const X = (i + 0.5) / k;
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
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const a = j * W + i; if (depth[a] === Infinity) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= W) continue;
      const bb = jj * W + ii;
      if (depth[bb] !== Infinity && depth[a] - depth[bb] > 2.2) { for (let c = 0; c < 3; c++) out[a * 4 + c] = Math.round(out[a * 4 + c] * 0.5 + [0x1a, 0x14, 0x20][c] * 0.5); break; }
    }
  }
  // eyes: one burning texel each where it can be seen
  for (const ew of model.eyes) {
    const V = ew[1] * SIN + ew[2] * COS, i = Math.floor(ew[0] * k), j = Math.floor((29 - V) * k);
    if (i < 0 || j < 0 || i >= W || j >= W) continue;
    const a = j * W + i, tt = (ew[1] + 16) / COS; // t of the eye along its ray
    if (depth[a] === Infinity || tt > depth[a] + 0.9) continue;
    out[a * 4] = (model.eyeCol >> 16) & 255; out[a * 4 + 1] = (model.eyeCol >> 8) & 255; out[a * 4 + 2] = model.eyeCol & 255; tag[a] = TAG_EYE;
  }
  const scr = (p: V3): P => [p[0], 29 - (p[1] * SIN + p[2] * COS)];
  return { rgba: out, tag, depth, handNear: scr(model.handNear), handFar: scr(model.handFar) };
}
