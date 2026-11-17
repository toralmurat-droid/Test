import type { GearDef } from "../../../shared/gear";
import { HiCanvas } from "../canvas";
import {
  C2, P, blobPath, canvas, clipTo, css, curve, ellipseP, fillShape, glow, grain, hashStr, ik, limb, line, metal, mix, poly, rad, rng, sh, Shape, vol,
} from "./brush";
import { drawFormWeapon, formOf } from "./weaponArt";
import { build3D, Dress3D, render3D, setMonster3D, TAG_HAND, type Frame3 } from "./body3d";
import { BOOKS, paintBook } from "./books";
import { HeadGear, HERO_BODIES, LINEN, Look, LOOKS, MOB_LOOKS, TorsoKind } from "./look";

/**
 * Painted characters: the same poses as the pixel heroes (characters.ts works out hand position, weapon angle and
 * move), drawn as smooth shaded volumes in a darker, more realistic style. One call paints one frame.
 */
type Dir = "down" | "up" | "right";
interface PoseLike {
  dir: Dir; t: number; bob: number; stride: number; lean: number; crouch: number; attack: number; move?: string;
  expr: string; headDx?: number; hand?: [number, number]; farHand?: [number, number]; noWeapon?: boolean; run?: boolean; wAng?: number;
  phase?: number;
}
/** A 3/4 (diagonal) frame: the same pose facing right, blended with the down/up one. */
export interface DiagAlt { p: PoseLike; info: FrameInfo; diag: "downright" | "upright" }
export interface MoveLike { kind: string; fx?: number }
export interface FrameInfo { hand: P; ang: number; mv: MoveLike; prevAng: (phase: number) => number; hasShieldMove: boolean }

/** Supersampling: frames are painted SS times bigger, then scaled down. */
const SS = 2;
let gear: GearDef | null = null;
let PIX = false;
/** Pixel-art output: hard edges, posterized colours, rim and 1px coloured outline (see pixelize). */
export function setPaintPixel(on: boolean) { PIX = on; }
/** The item being "worn" while the gear generator renders overlay sheets (null = plain hero). */
export function setPaintGear(g: GearDef | null) { gear = g; }
let form: GearDef | null = null;
/** The weapon item (found gear or class kit) being drawn: it picks the weapon's own form (weaponArt.ts). */
export function setPaintForm(d: GearDef | null) { form = d; }
let kit: Partial<Look> | null = null;
/** A class-kit item being "worn" (look.ts KITS): its Look fields go on top of the bare hero body. */
export function setPaintKit(k: Partial<Look> | null) { kit = k; }
export const hasLook = (name: string) => !!(LOOKS[name] ?? MOB_LOOKS[name]);
function lookOf(name: string): Look {
  const L = LOOKS[name] ?? MOB_LOOKS[name];
  if (!HERO_BODIES[name]) return L;
  if (kit) return { ...L, ...kit };
  // found gear on a bare hero: weapons take the class's weapon shape, body armour comes with matching leg wear
  // typed weapons (GearDef.wtype) keep their own shape in any hero's hands: a sword on the archer, a bow on the knight
  if (gear?.slot === "weapon" && L.weapon === "none" && gear.wtype && gear.wtype !== "fists") return { ...L, weapon: gear.wtype };
  if (gear?.slot === "weapon" && L.weapon === "none" && L.weaponKind) return { ...L, weapon: L.weaponKind };
  if (gear?.slot === "armour" && L.legs === "bare") {
    return gear.style === "plain" ? { ...L, legs: "trousers", legCol: sh(gear.color, 0.62) } : { ...L, legs: "mail", legCol: sh(gear.color, 0.78) };
  }
  return L;
}

interface Rig {
  name: string; L: Look; p: PoseLike; dir: Dir; R: boolean; b: number;
  cx: number; sy: number; hipY: number; lx: number; uy: number;
  head: P; nearS: P; farS: P; nearH: P; farH: P; nearE: P; farE: P;
  hips: [P, P]; knees: [P, P]; feet: [P, P];
  ang: number; u: P; n: P; seed: number; info: FrameInfo;
  /** facing on screen (unit-ish) */
  face: P;
  /** 3/4 view: +1 down-right, -1 up-right, 0 straight. Front details are shifted by fo, the torso narrowed. */
  diag: number; fo: number; narrow: number; sil: number;
}

const OLD_NEAR: Record<Dir, P> = { down: [9.5, 17.5], up: [21.5, 17.5], right: [15.5, 17.5] };
const OLD_FAR: Record<Dir, P> = { down: [21.5, 17.5], up: [9.5, 17.5], right: [17.5, 17.5] };
const ARM = 1.65, REACH = 8.1;
const clampLen = (v: P, m: number): P => { const l = Math.hypot(v[0], v[1]); return l > m ? [v[0] / l * m, v[1] / l * m] : v; };
const add = (a: P, b: P, k = 1): P => [a[0] + b[0] * k, a[1] + b[1] * k];

function rig(name: string, p: PoseLike, info: FrameInfo): Rig {
  const L = lookOf(name), dir = p.dir, R = dir === "right", b = L.build ?? 1;
  const lean = R ? -p.lean : 0;
  const ly = dir === "down" ? -Math.min(p.lean, 1) : dir === "up" ? Math.min(p.lean, 1) : 0;
  const stoop = L.stoop ?? 0, ux = lean + (p.run && R ? 1 : 0) + (R ? stoop * 0.8 : 0), uy = p.bob + p.crouch + ly + stoop, lx = lean;
  const cx = 16 + ux, sy = 12.7 + uy;
  const hipY = 19.5 + (p.crouch + stoop * 0.7) * 0.95 + ly + p.bob * 0.45;
  const SW = 3.45 * b;
  const nearS: P = dir === "down" ? [cx - SW, sy + 0.2] : dir === "up" ? [cx + SW, sy + 0.2] : [cx - 0.3, sy + 0.3];
  const farS: P = dir === "down" ? [cx + SW, sy + 0.2] : dir === "up" ? [cx - SW, sy + 0.2] : [cx + 0.9, sy];
  // weapon hand: the pixel rig's hand, moved onto the taller body
  const oh = info.hand, on = OLD_NEAR[dir];
  const nearH = add(nearS, clampLen([(oh[0] - on[0] - ux) * ARM, (oh[1] - on[1] - uy) * ARM], REACH));
  let farH: P;
  if (p.farHand) {
    const of = OLD_FAR[dir];
    farH = add(farS, clampLen([(p.farHand[0] - of[0]) * ARM, (p.farHand[1] - of[1]) * ARM], REACH));
  } else if (R) {
    farH = add(farS, [(p.attack >= 0 ? 0.6 : -p.stride * 1.7) + 0.5, 7.0]);
  } else {
    const sw = p.attack >= 0 ? 0 : (dir === "down" ? p.stride : -p.stride);
    farH = add(farS, [dir === "down" ? 0.5 : -0.5, 7.7 + sw * 0.9]);
  }
  const bend = (s: P) => (e: P) => R ? -(e[0] - cx) + e[1] * 0.25 : (e[0] - cx) * Math.sign(s[0] - cx) + e[1] * 0.35;
  const [nearE, nH] = ik(nearS, nearH, 4.1, 4.1, bend(nearS));
  const [farE, fH] = ik(farS, farH, 4.1, 4.1, bend(farS));
  // legs
  const s = p.stride;
  let hips: [P, P], feet: [P, P];
  if (p.phase !== undefined) {
    // smooth cycle: the foot swinging forward lifts on an arc, the planted one slides back
    const ph = p.phase, sn = Math.sin(ph);
    const lift = p.run ? 2.1 : 1.3;
    const l0 = Math.max(0, sn) * lift, l1 = Math.max(0, -sn) * lift;
    if (R) {
      const k = p.run ? 4.3 : 3.5; // s is cos(ph) scaled by the gait
      hips = [[16 + lx - 0.2, hipY], [16 + lx + 0.5, hipY]];
      feet = [[16 + lx - s * k, 29 - l0], [16 + lx + s * k, 29 - l1]];
    } else {
      const dep = (dir === "down" ? 0.7 : -0.5) * s;
      hips = [[16 + lx - 1.5 * b, hipY], [16 + lx + 1.5 * b, hipY]];
      feet = [[16 + lx - 1.8 * b, 29 - l0 + dep], [16 + lx + 1.8 * b, 29 - l1 - dep]];
    }
  } else if (R) {
    const k = p.run ? 4.3 : 3.5, lift = p.run ? 1.7 : 1.1;
    const half = Math.abs(s) === 0.5;
    const backSw = half && (p.t === 1 || p.t === 2), frontSw = half && (p.t === 4 || p.t === 5);
    hips = [[16 + lx - 0.2, hipY], [16 + lx + 0.5, hipY]];
    feet = [[16 + lx - s * k, 29 - (backSw ? lift : 0)], [16 + lx + s * k, 29 - (frontSw ? lift : 0)]];
  } else {
    const liftOf = (i: number) => (s === 0 ? 0 : (i === 0) === s > 0 ? (p.run && Math.abs(s) >= 1 ? 2.4 : 1.3) : 0);
    hips = [[16 + lx - 1.5 * b, hipY], [16 + lx + 1.5 * b, hipY]];
    feet = [[16 + lx - 1.8 * b, 29 - liftOf(0)], [16 + lx + 1.8 * b, 29 - liftOf(1)]];
  }
  const knee = (i: number) => ik(hips[i], feet[i], 4.95, 4.95, (e) => R ? e[0] : (e[0] - 16 - lx) * (i ? 1 : -1) * 0.2 + e[1] * 0.1)[0];
  const ang = info.ang;
  return {
    name, L, p, dir, R, b, cx, sy, hipY, lx, uy,
    head: [cx + (p.headDx ?? 0) * 0.75 + (R ? 0.5 : 0), 7.3 + uy],
    nearS, farS, nearH: nH, farH: fH, nearE, farE, hips, knees: [knee(0), knee(1)], feet,
    ang, u: [Math.cos(rad(ang)), Math.sin(rad(ang))], n: [-Math.sin(rad(ang)), Math.cos(rad(ang))],
    seed: hashStr(name) ^ (p.t * 7919), info,
    face: dir === "down" ? [0, 1] : dir === "up" ? [0, -1] : [1, 0], diag: 0, fo: 0, narrow: 1, sil: 0,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpP = (a: P, b: P, t: number): P => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
function lerpAng(a: number, b: number, t: number) { let d = ((b - a) % 360 + 540) % 360 - 180; return a + d * t; }

/**
 * 3/4 view: the down (or up) rig and the right-facing rig of the same pose, half way between. Parts are still
 * drawn with the down/up painters, with the torso narrowed and front details shifted toward the facing side.
 */
function blendRig(a: Rig, b: Rig, diag: "downright" | "upright"): Rig {
  const t = 0.5, dn = diag === "downright";
  const r: Rig = { ...a };
  r.cx = lerp(a.cx, b.cx, t); r.sy = lerp(a.sy, b.sy, t); r.hipY = lerp(a.hipY, b.hipY, t); r.uy = lerp(a.uy, b.uy, t);
  r.head = lerpP(a.head, b.head, t);
  r.nearS = lerpP(a.nearS, b.nearS, t); r.farS = lerpP(a.farS, b.farS, t);
  r.nearH = lerpP(a.nearH, b.nearH, t); r.farH = lerpP(a.farH, b.farH, t);
  r.hips = [lerpP(a.hips[0], b.hips[0], t), lerpP(a.hips[1], b.hips[1], t)];
  // feet: the step also goes into the screen (diagonal travel), the back foot further away
  const fx = (i: number) => b.feet[i][0] - (16 + b.lx);
  r.feet = [0, 1].map((i) => {
    const f = lerpP(a.feet[i], b.feet[i], t);
    return [f[0] + fx(i) * 0.25, f[1] + fx(i) * (dn ? 0.42 : -0.42)] as P;
  }) as [P, P];
  const bend = (s: P) => (e: P) => (e[0] - r.cx) * Math.sign(s[0] - r.cx || 1) + e[1] * 0.35;
  const [nearE, nH] = ik(r.nearS, r.nearH, 4.1, 4.1, bend(r.nearS));
  const [farE, fH] = ik(r.farS, r.farH, 4.1, 4.1, bend(r.farS));
  r.nearE = nearE; r.nearH = nH; r.farE = farE; r.farH = fH;
  const knee = (i: number) => ik(r.hips[i], r.feet[i], 4.95, 4.95, (e) => e[0] * 0.6 + (e[0] - 16) * (i ? 1 : -1) * 0.2)[0];
  r.knees = [knee(0), knee(1)];
  r.ang = lerpAng(a.ang, b.ang, t);
  r.u = [Math.cos(rad(r.ang)), Math.sin(rad(r.ang))]; r.n = [-Math.sin(rad(r.ang)), Math.cos(rad(r.ang))];
  r.face = dn ? [0.8, 0.6] : [0.8, -0.6];
  r.diag = dn ? 1 : -1; r.fo = dn ? 0.85 : 0; r.narrow = 0.84;
  // front centre line moves toward the facing side (down-right) or away from it (the back, up-right)
  r.sil = dn ? 0.55 : -0.45; r.cx += r.sil;
  return r;
}

// ---------------------------------------------------------------- colour dimming for far-side parts
let dim = 1;
const C = (c: number) => (dim === 1 ? c : sh(c, dim));
function far(fn: () => void, f = 0.78) { const o = dim; dim = f; fn(); dim = o; }

// ---------------------------------------------------------------- legs & boots
function boots(c: C2, r: Rig, i: number, ankle: P, foot: P) {
  const L = r.L, st = gear?.slot === "shoes" ? (gear.style === "plain" ? "leather" : "leather") : L.bootStyle ?? "leather";
  const col = C(gear?.slot === "shoes" ? gear.color : L.boots);
  const fw = r.R ? 1 : 0;
  if (st === "bare") {
    // bare foot: a skin-coloured foot with a darker toe line
    const fx = foot[0] + fw * 0.6, fy = foot[1] - 0.4;
    vol(c, ellipseP(fx, fy, r.R ? 1.3 : 0.85, 0.6), C(L.skin), [fx - 1.3, fy - 0.6, 2.6, 1.2], { ao: 0.25 });
    line(c, [[fx - (r.R ? -0.6 : 0.5), fy + 0.25], [fx + (r.R ? 1.2 : 0.5), fy + 0.25]], sh(C(L.skin), 0.55), 0.18, 0.7);
    return;
  }
  if (st !== "shoe") {
    const top: P = [ankle[0], ankle[1] - (st === "greave" ? 3.2 : 2.1)];
    limb(c, top, ankle, 1.95, 1.85, col, { metal: st === "greave" });
    if (st === "wrap") for (let k = 0; k < 3; k++) line(c, [[top[0] - 0.9, top[1] + 0.6 + k * 0.7], [top[0] + 0.9, top[1] + 0.9 + k * 0.7]], C(0x3a3c55), 0.22, 0.8);
    else if (gear?.slot === "shoes") line(c, [[top[0] - 1, top[1] + 0.2], [top[0] + 1, top[1] + 0.2]], C(gear.accent), 0.45);
    else line(c, [[top[0] - 0.95, top[1] + 0.25], [top[0] + 0.95, top[1] + 0.25]], sh(col, 1.35), 0.3, 0.8);
  }
  const fx = foot[0] + fw * 0.75, fy = foot[1] - 0.45;
  const fs = ellipseP(fx, fy, r.R ? 1.55 : 1.05, 0.72);
  if (st === "greave") metal(c, fs, col, [fx - 1, fy - 1], [fx + 1, fy + 1], 0.4);
  else vol(c, fs, col, [fx - 1.6, fy - 0.8, 3.2, 1.6], { ao: 0.2 });
  if (gear?.slot === "shoes" && gear.style === "wings") {
    for (const sgn of r.R ? [-1] : [i ? 1 : -1]) {
      const wx = ankle[0] + sgn * 0.9, wy = ankle[1] - 1.4;
      const w: Shape = (cc) => { cc.moveTo(wx, wy); cc.quadraticCurveTo(wx + sgn * 1.6, wy - 2.2, wx + sgn * 2.6, wy - 1.8); cc.quadraticCurveTo(wx + sgn * 1.6, wy - 1.0, wx + sgn * 2.1, wy - 0.6); cc.quadraticCurveTo(wx + sgn * 1.0, wy - 0.2, wx, wy + 0.3); cc.closePath(); };
      vol(c, w, 0xf4f1e8, [wx - 1, wy - 2.4, 3.6, 2.8], { ao: 0.2 });
      line(c, [[wx + sgn * 0.5, wy - 0.4], [wx + sgn * 2, wy - 1.5]], 0xd9a93a, 0.18, 0.8);
    }
  }
}

function leg(c: C2, r: Rig, i: number) {
  const L = r.L, hip = r.hips[i], kn = r.knees[i], ft = r.feet[i];
  const ankle: P = [ft[0], ft[1] - 1.3];
  const kind = L.legs;
  if (kind === "robe" || kind === "dress") { boots(c, r, i, ankle, ft); return; }
  if (L.bones) {
    const bone = C(L.skin);
    limb(c, hip, kn, 1.05, 0.8, bone); limb(c, kn, ankle, 0.85, 0.65, bone);
    vol(c, ellipseP(kn[0], kn[1], 0.7, 0.6), bone, [kn[0] - 0.7, kn[1] - 0.6, 1.4, 1.2], { ao: 0.2 });
    vol(c, ellipseP(ft[0] + (r.R ? 0.7 : 0), ft[1] - 0.45, r.R ? 1.3 : 0.8, 0.5), bone, [ft[0] - 1, ft[1] - 1, 2.4, 1], { ao: 0.25 });
    if (L.rags && i === 1) { const rg = C(L.rags); fillShape(c, poly([[hip[0] - 1.4, hip[1] - 0.4], [hip[0] + 1.6, hip[1] - 0.4], [kn[0] + 1.0, kn[1] - 1.3], [kn[0] + 0.1, kn[1] - 0.4], [kn[0] - 0.6, kn[1] - 1.6], [kn[0] - 1.3, kn[1] - 0.8]]), css(rg, 0.9)); }
    return;
  }
  const col = C(L.legCol);
  if (kind === "bare") {
    // bare skin with linen braies down to mid-thigh
    const skin = C(L.skin), mid: P = [hip[0] + (kn[0] - hip[0]) * 0.62, hip[1] + (kn[1] - hip[1]) * 0.62];
    limb(c, hip, kn, 2.2, 1.75, skin);
    limb(c, kn, ankle, 1.75, 1.3, skin);
    line(c, [[kn[0] - 0.2, kn[1] - 0.3], [kn[0] + 0.3, kn[1] + 0.5]], sh(skin, 0.6), 0.16, 0.55);
    limb(c, [hip[0], hip[1] - 0.6], mid, 2.75, 2.45, col);
    line(c, [[mid[0] - 1.2, mid[1] + 0.1], [mid[0] + 1.2, mid[1] + 0.2]], sh(col, 0.55), 0.2, 0.7); // hem
    boots(c, r, i, ankle, ft);
    return;
  }
  if (kind === "mail") {
    limb(c, hip, kn, 2.5, 2.0, col);
    limb(c, kn, ankle, 2.0, 1.6, col);
    grainMail(c, hip, kn, ankle, r);
    // knee cop
    metal(c, ellipseP(kn[0] + (r.R ? 0.3 : 0), kn[1], 1.15, 1.0), C(0xb9c2cc), [kn[0] - 1, kn[1] - 1], [kn[0] + 1, kn[1] + 1], 0.6);
  } else {
    limb(c, hip, kn, 2.55, 2.05, col);
    limb(c, kn, ankle, 2.05, 1.6, col);
    if (kind === "wrapped") for (let k = 0; k < 3; k++) { const t = 0.35 + k * 0.2, x = kn[0] + (ankle[0] - kn[0]) * t, y = kn[1] + (ankle[1] - kn[1]) * t; line(c, [[x - 0.95, y - 0.2], [x + 0.95, y + 0.25]], C(0xa9aec0), 0.3, 0.85); }
    else line(c, [[kn[0] - 0.2, kn[1] - 0.3], [kn[0] + 0.3, kn[1] + 0.5]], sh(col, 0.55), 0.18, 0.6); // knee crease
  }
  boots(c, r, i, ankle, ft);
}
function grainMail(c: C2, hip: P, kn: P, ankle: P, r: Rig) {
  const rr = rng(r.seed + 11);
  for (let k = 0; k < 14; k++) {
    const t = rr(), a = t < 0.5 ? hip : kn, b = t < 0.5 ? kn : ankle, tt = (t % 0.5) * 2;
    const x = a[0] + (b[0] - a[0]) * tt + (rr() - 0.5) * 1.4, y = a[1] + (b[1] - a[1]) * tt;
    c.beginPath(); c.arc(x, y, 0.28, 0, Math.PI); c.strokeStyle = css(C(0xd5dce4), 0.35); c.lineWidth = 0.12; c.stroke();
  }
}

/** Long robe or dress skirt hanging from the hips over the legs. */
function skirt(c: C2, r: Rig) {
  const L = r.L, col = C(L.legCol), [f0, f1] = r.feet, hy = r.hipY - 0.6;
  const hw = 2.9 * r.b, hem = 28.1;
  let pts: P[];
  if (r.R) {
    const flare = L.legs === "dress" ? 0.9 : 0; // a dress falls wider than a robe
    const back = Math.min(f0[0], f1[0]) - 1.6 - flare, front = Math.max(f0[0], f1[0]) + 1.9 + flare;
    pts = [[r.cx - 2.0, hy], [r.cx + 2.1, hy], [front - 0.4, hem - 2.5], [front, hem], [(front + back) / 2, hem + 0.45], [back, hem], [back + 0.2, hem - 2]];
  } else {
    const sw = r.p.stride * 0.6;
    pts = [[r.cx - hw, hy], [r.cx + hw, hy], [16 + r.lx + 3.6 + sw, hem - 1.6], [16 + r.lx + 3.9 + sw, hem], [16 + r.lx, hem + 0.55], [16 + r.lx - 3.9 + sw, hem], [16 + r.lx - 3.6 + sw, hem - 1.6]];
  }
  const s = blobPath(pts);
  vol(c, s, col, [r.cx - 4, hy, 8, hem - hy + 0.5], { ao: 0.35 });
  grain(c, s, [r.cx - 4, hy, 8, hem - hy], col, r.seed + 3, 26, 0.16, 1.4, 1.5);
  // folds
  const rr = rng(hashStr(r.name) + 5);
  for (let k = 0; k < 4; k++) {
    const x = r.cx - 2.4 + k * 1.6 + (rr() - 0.5) * 0.4;
    curve(c, [x, hy + 2], [x + 0.3 + r.p.stride * 0.4, (hy + hem) / 2 + 1], [x + (k - 1.5) * 0.5 + r.p.stride * 0.6, hem - 0.2], sh(col, 0.55), 0.25, 0.55);
  }
  if (L.trim) clipTo(c, s, () => {
    c.beginPath(); s(c); c.save(); c.translate(0, -0.1);
    line(c, [[r.cx - 6, hem - 0.25], [r.cx + 6, hem - 0.25]], C(L.trim!), 0.55, 0.9); c.restore();
  });
  if (L.legs === "dress") clipTo(c, s, () => { line(c, [[r.cx - 6, hem - 0.9], [r.cx + 6, hem - 0.9]], sh(col, 0.6), 0.25, 0.6); });
}

/** Linen underwear: the band over the hips joining the two legs (bare heroes). */
function braies(c: C2, r: Rig) {
  const col = C(r.L.legCol), y0 = r.hipY - 1.5, y1 = r.hipY + 1.3, hw = 2.75 * r.b * (r.R ? 0.8 : 1);
  const x = r.cx - r.sil * 0.5 + (r.R ? -0.3 : 0);
  const s = blobPath([[x - hw, y0], [x + hw, y0], [x + hw + 0.2, y1 - 0.4], [x + 0.6, y1 + 0.3], [x, y1 - 0.2], [x - 0.6, y1 + 0.3], [x - hw - 0.2, y1 - 0.4]]);
  vol(c, s, col, [x - hw, y0, 2 * hw, y1 - y0 + 0.5], { ao: 0.3 });
  grain(c, s, [x - hw, y0, 2 * hw, y1 - y0 + 0.5], col, r.seed + 9, 24, 0.22, 0.8, 1.3);
  line(c, [[x - hw, y0 + 0.35], [x + hw, y0 + 0.35]], sh(col, 0.6), 0.25, 0.8); // drawstring fold
  if (r.dir === "down") curve(c, [x - 0.3, y0 + 0.4], [x - 0.6, y0 + 1.2], [x - 0.2, y0 + 1.6], sh(col, 0.55), 0.15, 0.7);
}

/** Fur kilt over the barbarian's hips. */
function furKilt(c: C2, r: Rig) {
  const y0 = r.hipY - 0.9, y1 = r.hipY + 2.9, hw = 3.3 * r.b, rr = rng(31);
  const pts: P[] = [[r.cx - hw + (r.R ? 0.8 : 0), y0], [r.cx + hw - (r.R ? 0.4 : 0), y0]];
  const n = 8;
  for (let k = 0; k <= n; k++) {
    const x = r.cx + hw - (r.R ? 0.4 : 0) - (k / n) * (2 * hw - (r.R ? 1.2 : 0));
    pts.push([x + (rr() - 0.5) * 0.4, y1 + (k % 2 ? -0.9 : 0.2) + (rr() - 0.5) * 0.5]);
  }
  const s = poly(pts), col = C(r.L.capeCol ?? 0x8a6a48);
  vol(c, s, col, [r.cx - hw, y0, 2 * hw, y1 - y0], { ao: 0.25 });
  grain(c, s, [r.cx - hw, y0, 2 * hw, y1 - y0 + 1], col, 77, 60, 0.4, 0.9, 1.4);
}

// ---------------------------------------------------------------- torso
function torsoShape(r: Rig, widen = 0): { s: Shape; box: [number, number, number, number] } {
  const { sy, hipY, b } = r, belly = r.L.belly ? 0.9 : 0;
  if (r.R) {
    const cx = r.cx;
    const pts: P[] = [[cx - 1.3, sy - 1.1], [cx + 1.1, sy - 1.1], [cx + 2.0 * b + widen, sy + 0.9], [cx + 2.3 * b + widen + belly * 0.4, sy + 3.0], [cx + 1.7 + belly + widen, hipY - 1.7],
      [cx + 1.9 + widen, hipY + 0.9], [cx - 1.9 - widen, hipY + 0.9], [cx - 1.7 - widen, hipY - 2.0], [cx - 2.2 * b - widen, sy + 2.3], [cx - 1.9 * b - widen, sy - 0.2]];
    return { s: blobPath(pts), box: [cx - 2.4 * b, sy - 1.2, 4.8 * b + 0.6, hipY - sy + 2.2] };
  }
  const k = r.narrow, cx = r.cx - r.sil;
  const w = (3.65 * b + widen) * k, ww = (2.55 * b + widen + belly) * k, hw = (2.85 * b + widen) * k;
  const pts: P[] = [[cx - w * 0.5, sy - 1.25], [cx - w, sy - 0.55], [cx - w * 1.02, sy + 1.7], [cx - ww, hipY - 2.1], [cx - hw, hipY + 0.9],
    [cx + hw, hipY + 0.9], [cx + ww, hipY - 2.1], [cx + w * 1.02, sy + 1.7], [cx + w, sy - 0.55], [cx + w * 0.5, sy - 1.25]];
  return { s: blobPath(pts), box: [cx - w, sy - 1.3, 2 * w, hipY - sy + 2.3] };
}

function torsoKind(r: Rig): { kind: TorsoKind; col: number; trim?: number } {
  if (gear?.slot === "armour") {
    if (gear.style === "mail") return { kind: "mail", col: gear.color, trim: gear.accent };
    if (gear.style === "trim") return { kind: "plate", col: gear.color, trim: gear.accent };
    return { kind: "leather", col: gear.color, trim: gear.accent };
  }
  return { kind: r.L.torso, col: r.L.torsoCol, trim: r.L.trim };
}

function torso(c: C2, r: Rig) {
  const L = r.L, { cx, sy, hipY } = r, down = r.dir === "down", up = r.dir === "up";
  const tk = torsoKind(r), col = C(tk.col);
  const { s, box } = torsoShape(r, tk.kind === "plate" && gear ? 0.25 : 0);
  if (L.bones && tk.kind === "bare" && !gear) { ribcage(c, r); return; }
  if (tk.kind === "plate") {
    metal(c, s, col, [box[0], box[1]], [box[0] + box[2], box[1] + box[3] * 0.7], 0.7);
    // breastplate edge, lames, ridge
    const e = sh(col, 0.45);
    if (!r.R) {
      if (down) line(c, [[cx, sy - 0.6], [cx, sy + 3.8]], sh(col, 1.5), 0.3, 0.7);
      curve(c, [cx - 3.1 * r.b, sy + 3.9], [cx, sy + 5.3], [cx + 3.1 * r.b, sy + 3.9], e, 0.3, 0.8);
      for (let k = 0; k < 2; k++) curve(c, [cx - 2.5 * r.b, sy + 5.0 + k * 1.15], [cx, sy + 5.8 + k * 1.15], [cx + 2.5 * r.b, sy + 5.0 + k * 1.15], e, 0.22, 0.7);
    } else {
      curve(c, [cx + 2.2, sy + 3.6], [cx + 0.3, sy + 4.6], [cx - 1.9, sy + 4.0], e, 0.3, 0.8);
      curve(c, [cx + 1.8, sy + 5.0], [cx, sy + 5.8], [cx - 1.7, sy + 5.3], e, 0.22, 0.7);
    }
    if (tk.trim && gear) clipTo(c, s, () => { c.beginPath(); s(c); c.strokeStyle = css(C(tk.trim!), 0.95); c.lineWidth = 0.7; c.stroke(); if (!r.R) line(c, [[cx, sy - 1], [cx, hipY + 1]], C(tk.trim!), 0.5, 0.9); });
  } else if (tk.kind === "mail") {
    vol(c, s, col, box, { ao: 0.4, lo: 0.42 });
    clipTo(c, s, () => {
      for (let y = box[1] + 0.3; y < box[1] + box[3]; y += 0.62) for (let x = box[0] + ((y * 1.6) % 0.7); x < box[0] + box[2]; x += 0.7) {
        const lit = 1 - ((x - box[0]) / box[2]) * 0.5 - ((y - box[1]) / box[3]) * 0.5;
        c.beginPath(); c.arc(x, y, 0.3, 0.1, Math.PI - 0.1); c.strokeStyle = css(sh(col, 0.9 + lit * 0.7), 0.55); c.lineWidth = 0.13; c.stroke();
      }
    });
    if (gear && tk.trim) clipTo(c, s, () => { c.beginPath(); s(c); c.strokeStyle = css(C(tk.trim!), 0.8); c.lineWidth = 0.5; c.stroke(); });
  } else if (tk.kind === "bare") {
    vol(c, s, col, box, { ao: 0.3, spec: 0.12 });
    const m = sh(col, 0.62);
    if (down) {
      curve(c, [cx - 3.0, sy + 2.6], [cx - 1.4, sy + 3.6], [cx - 0.1, sy + 2.9], m, 0.3, 0.75);
      curve(c, [cx + 3.0, sy + 2.6], [cx + 1.4, sy + 3.6], [cx + 0.1, sy + 2.9], m, 0.3, 0.75);
      line(c, [[cx, sy + 0.6], [cx, hipY - 1.6]], m, 0.2, 0.45);
      for (let k = 0; k < 2; k++) { line(c, [[cx - 1.4, sy + 4.6 + k * 1.2], [cx - 0.3, sy + 4.8 + k * 1.2]], m, 0.18, 0.45); line(c, [[cx + 0.3, sy + 4.8 + k * 1.2], [cx + 1.4, sy + 4.6 + k * 1.2]], m, 0.18, 0.45); }
      glow(c, cx - 1.6, sy + 1.6, 1.4, 0xfff0d0, 0.18);
    } else if (up) {
      line(c, [[cx, sy], [cx, hipY - 1]], m, 0.28, 0.55);
      curve(c, [cx - 2.6, sy + 1.5], [cx - 1.4, sy + 3.2], [cx - 0.5, sy + 1.4], m, 0.25, 0.5);
      curve(c, [cx + 2.6, sy + 1.5], [cx + 1.4, sy + 3.2], [cx + 0.5, sy + 1.4], m, 0.25, 0.5);
    } else {
      curve(c, [cx + 2.2, sy + 2.8], [cx + 0.8, sy + 3.8], [cx - 0.4, sy + 2.6], m, 0.3, 0.7);
      line(c, [[cx + 1.2, sy + 4.8], [cx + 1.9, sy + 4.9]], m, 0.18, 0.45);
    }
    // leather harness strap across the chest
    if (L.harness && (!gear || gear.slot !== "armour")) clipTo(c, s, () => {
      const a: P = r.R ? [cx - 1, sy - 1] : down ? [cx - 3.2, sy - 0.6] : [cx + 3.2, sy - 0.6];
      const bb: P = r.R ? [cx + 1.6, hipY - 1] : down ? [cx + 2.8, hipY - 1.2] : [cx - 2.8, hipY - 1.2];
      line(c, [a, bb], C(0x4a2e18), 0.95); line(c, [a, bb], C(0x7a5232), 0.3, 0.7);
      if (down) { const m2: P = [(a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2]; metal(c, ellipseP(m2[0], m2[1], 0.55, 0.55), 0xb8b8b8, [m2[0] - 0.5, m2[1] - 0.5], [m2[0] + 0.5, m2[1] + 0.5]); }
    });
  } else {
    // cloth / leather
    vol(c, s, col, box, { ao: 0.42 });
    grain(c, s, box, col, r.seed + 1, 45, 0.16, 0.8, 1.2);
    const fold = sh(col, 0.55);
    if (tk.kind === "wrap") {
      if (L.rags !== undefined) { // grave-wrappings: bands of lighter cloth wound across the chest, loose ends hanging off the belt
        const bc = C(L.rags);
        clipTo(c, s, () => { for (let k = 0; k < 5; k++) { const y = sy - 0.4 + k * 1.35; line(c, [[cx - 4, y + 1.2], [cx + 4, y - 0.9]], k % 2 ? bc : sh(bc, 0.8), 0.5, 0.9); line(c, [[cx - 4, y + 1.6], [cx + 4, y - 0.5]], sh(bc, 0.5), 0.15, 0.7); } });
        const sw = Math.sin(r.p.t * 1.2) * 0.35;
        if (!r.R) for (const [dx, len] of [[-1.8, 3.2], [0.4, 4.2], [2.0, 2.8]]) limb(c, [cx + dx, hipY], [cx + dx + sw * (dx > 0 ? 1 : -1), hipY + len], 0.9, 0.35, sh(bc, 0.75));
        else limb(c, [cx - 1.4, hipY], [cx - 2.2 + sw, hipY + 3.6], 0.9, 0.35, sh(bc, 0.75));
      }
      if (down) { curve(c, [cx - 2.4, sy - 0.9], [cx - 0.6, sy + 1.4], [cx + 1.4, sy + 4.2], fold, 0.32, 0.8); curve(c, [cx + 2.4, sy - 0.9], [cx + 1.2, sy + 0.8], [cx + 0.3, sy + 2.2], sh(col, 1.4), 0.2, 0.5); }
      else if (r.R) curve(c, [cx + 1.0, sy - 0.9], [cx + 1.8, sy + 1.8], [cx + 0.6, sy + 4.2], fold, 0.3, 0.8);
      else line(c, [[cx, sy - 0.5], [cx, hipY - 1.5]], fold, 0.25, 0.5);
    } else if (tk.kind === "robe") {
      if (down) {
        fillShape(c, poly([[cx - 1.6, sy - 1.1], [cx, sy + 2.4], [cx + 1.6, sy - 1.1]]), css(sh(col, 0.5)));
        if (tk.trim) { line(c, [[cx - 1.6, sy - 1.0], [cx, sy + 2.4], [cx + 1.6, sy - 1.0]], C(tk.trim), 0.38, 0.95); line(c, [[cx, sy + 2.4], [cx, hipY + 1]], C(tk.trim), 0.5, 0.9); }
      } else if (r.R && tk.trim) line(c, [[cx + 1.4, sy - 0.8], [cx + 2.2, sy + 2.4], [cx + 1.8, hipY + 0.8]], C(tk.trim), 0.4, 0.9);
      for (let k = -1; k <= 1; k += 2) curve(c, [cx + k * 1.8, sy + 1.5], [cx + k * 2.1, sy + 4], [cx + k * 1.6, hipY], fold, 0.22, 0.5);
    } else if (tk.kind === "jerkin" || tk.kind === "leather") {
      // stitched seams and chest lacing
      const st = C(tk.kind === "leather" && tk.trim ? tk.trim : sh(tk.col, 1.5));
      if (down) {
        line(c, [[cx, sy - 0.8], [cx, hipY]], sh(col, 0.5), 0.3, 0.8);
        for (let k = 0; k < 3; k++) { const y = sy + 0.3 + k * 1.1; line(c, [[cx - 0.6, y], [cx + 0.6, y + 0.6]], st, 0.15, 0.85); line(c, [[cx + 0.6, y], [cx - 0.6, y + 0.6]], st, 0.15, 0.85); }
      } else if (r.R) line(c, [[cx + 1.6, sy], [cx + 2.0, sy + 3.2], [cx + 1.5, hipY]], sh(col, 0.5), 0.25, 0.8);
      c.setLineDash([0.3, 0.3]);
      clipTo(c, s, () => { c.beginPath(); s(c); c.strokeStyle = css(st, 0.6); c.lineWidth = 0.14; c.save(); c.stroke(); c.restore(); });
      c.setLineDash([]);
      if (tk.kind === "leather") clipTo(c, s, () => { for (let k = 0; k < 2; k++) line(c, [[cx - 4, sy + 2.5 + k * 2.4], [cx + 4, sy + 2.1 + k * 2.4]], sh(col, 0.5), 0.3, 0.6); });
    } else if (tk.kind === "tailcoat") tailcoatFront(c, r, s, col, tk.trim);
    else if (tk.kind === "shirt") {
      if (down) { curve(c, [cx - 1.2, sy - 1.1], [cx, sy + 0.4], [cx + 1.2, sy - 1.1], sh(col, 0.55), 0.3, 0.8); line(c, [[cx, sy - 0.2], [cx, sy + 1.6]], sh(col, 0.6), 0.18, 0.6); }
      for (let k = -1; k <= 1; k += 2) curve(c, [cx + k * 1.5, sy + 1], [cx + k * 2.2, sy + 3.5], [cx + k * 1.4, hipY - 0.5], fold, 0.2, 0.45);
    }
  }
  if ((L.boneArmour ?? 0) >= 2) boneCuirass(c, r, s);
  if (!gear || gear.slot !== "armour") {
    if (L.vest && tk.kind !== "tailcoat") vest(c, r, s);
    if (L.apron) apron(c, r);
    if (L.tabard) tabard(c, r);
    if (L.corset !== undefined) corset(c, r, s);
  }
  // belt / sash
  const by = hipY - 1.1;
  const beltCol = tk.kind === "tailcoat" ? undefined : L.sash ?? L.belt;
  if (beltCol !== undefined) clipTo(c, s, () => {
    const bs = poly([[cx - 5, by - 0.55], [cx + 5, by - 0.55], [cx + 5, by + 0.55], [cx - 5, by + 0.55]]);
    vol(c, bs, C(beltCol), [cx - 4, by - 0.6, 8, 1.2], { ao: 0.2 });
  });
  if (L.buckle !== undefined && tk.kind !== "tailcoat" && !r.p.dir.startsWith("u")) {
    const bx = r.R ? cx + 1.6 : cx;
    metal(c, (cc) => cc.rect(bx - 0.6, by - 0.55, 1.2, 1.1), C(L.buckle), [bx - 0.6, by - 0.6], [bx + 0.6, by + 0.6], 0.5);
  }
  if (L.sash && down && L.torso === "wrap") {
    // knot with hanging tails
    const k: P = [cx + 1.5, by + 0.2];
    vol(c, ellipseP(k[0], k[1], 0.7, 0.55), C(L.sash), [k[0] - 0.7, k[1] - 0.6, 1.4, 1.2]);
    const sway = Math.sin(r.p.t * 1.3) * 0.4;
    limb(c, [k[0], k[1] + 0.3], [k[0] + 0.5 + sway, k[1] + 3.2], 0.7, 0.5, C(sh(L.sash, 0.85)));
  }
}

/** Skeleton chest: spine, ribs and pelvis, with a torn rag hanging off one shoulder. */
function ribcage(c: C2, r: Rig) {
  const L = r.L, { cx, sy, hipY } = r, bone = C(L.skin), dk = sh(bone, 0.45);
  const spineX = r.R ? cx - 0.8 : cx;
  limb(c, [spineX, sy - 0.8], [spineX, hipY - 0.6], 0.75, 0.7, bone);
  for (let k = 0; k < 4; k++) {
    const y = sy + 0.4 + k * 1.15, w = (3.0 - k * 0.3) * r.b;
    if (r.R) curve(c, [spineX, y], [cx + 2.4, y + 0.1], [cx + 1.6, y + 1.0], bone, 0.5);
    else for (const sg of [-1, 1]) {
      curve(c, [cx, y], [cx + sg * w, y - 0.2], [cx + sg * (w - 0.6), y + 1.0], dk, 0.65, 0.9);
      curve(c, [cx, y], [cx + sg * w, y - 0.2], [cx + sg * (w - 0.6), y + 1.0], bone, 0.45);
    }
  }
  // pelvis
  vol(c, blobPath([[cx - 2.0, hipY - 1.3], [cx + 2.0, hipY - 1.3], [cx + 1.4, hipY + 0.6], [cx, hipY + 0.2], [cx - 1.4, hipY + 0.6]]), bone, [cx - 2, hipY - 1.4, 4, 2], { ao: 0.35 });
  if (L.belt) line(c, [[cx - 2.2, hipY - 1.0], [cx + 2.2, hipY - 1.2]], C(L.belt), 0.5, 0.9);
  if (L.rags) {
    const rg = C(L.rags), sw = Math.sin(r.p.t * 1.3) * 0.3;
    const pts: P[] = r.R ? [[cx - 1.8, sy - 1.0], [cx + 1.2, sy - 1.0], [cx + 0.6, sy + 2.6], [cx - 0.2 + sw, sy + 4.4], [cx - 1.0, sy + 3.0], [cx - 2.0 + sw, sy + 4.8]]
      : [[cx - 3.6, sy - 0.6], [cx - 0.4, sy - 1.0], [cx - 0.6, sy + 2.0], [cx - 1.6 + sw, sy + 4.4], [cx - 2.3, sy + 2.8], [cx - 3.4 + sw, sy + 5.0], [cx - 3.9, sy + 2.0]];
    const s = poly(pts);
    vol(c, s, rg, [cx - 4, sy - 1, 5, 6], { ao: 0.3 });
    grain(c, s, [cx - 4, sy - 1, 5, 6], rg, 7, 20, 0.3, 0.8, 1.5);
  }
}

function vest(c: C2, r: Rig, s: Shape) {
  const { cx, sy, hipY } = r, col = C(r.L.vest!);
  clipTo(c, s, () => {
    if (r.dir === "down") {
      for (const k of [-1, 1]) {
        const v = poly([[cx + k * 0.9, sy - 1.3], [cx + k * 5, sy - 1.3], [cx + k * 5, hipY + 1], [cx + k * 0.6, hipY + 1], [cx + k * 1.2, sy + 3]]);
        vol(c, v, col, [cx - 4, sy - 1.2, 8, hipY - sy + 2], { ao: 0.25 });
        line(c, [[cx + k * 0.9, sy - 1.2], [cx + k * 1.2, sy + 3], [cx + k * 0.6, hipY + 1]], 0xe0b440, 0.25, 0.85);
      }
      for (let k = 0; k < 3; k++) glow(c, cx - 1.4, sy + 1.6 + k * 1.3, 0.35, 0xe0b440, 0.9);
    } else if (r.R) {
      const v = poly([[cx - 2.5, sy - 1.2], [cx + 1.2, sy - 1.2], [cx + 1.8, sy + 3], [cx + 1.3, hipY + 1], [cx - 2.5, hipY + 1]]);
      vol(c, v, col, [cx - 2.5, sy - 1.2, 4.6, hipY - sy + 2], { ao: 0.25 });
    } else vol(c, (cc) => cc.rect(cx - 5, sy - 2, 10, hipY - sy + 3), col, [cx - 4, sy - 1.2, 8, hipY - sy + 2], { ao: 0.25 });
  });
}

/** Laced waist cincher over a dress bodice: dark, pointed at the front, gold lacing up the middle. */
function corset(c: C2, r: Rig, s: Shape) {
  const { cx, sy, hipY } = r, col = C(r.L.corset!), lace = 0xd9a93a, y0 = sy + 2.4, y1 = hipY + 0.6;
  clipTo(c, s, () => {
    const v = r.R ? poly([[cx - 2.6, y0 + 0.4], [cx + 2.2, y0 - 0.2], [cx + 2.4, y1 - 0.4], [cx + 1.6, y1 + 0.5], [cx - 2.6, y1]])
      : poly([[cx - 5, y0 + 0.5], [cx, y0 - 0.5], [cx + 5, y0 + 0.5], [cx + 5, y1 - 0.4], [cx, y1 + 0.8], [cx - 5, y1 - 0.4]]);
    vol(c, v, col, [cx - 4, y0, 8, y1 - y0 + 1], { ao: 0.25 });
    const zig: P[] = [];
    for (let k = 0; k <= 5; k++) zig.push([cx + (k % 2 ? 0.45 : -0.45) + (r.R ? 1.7 : 0), y0 + 0.2 + k * (y1 - y0 - 0.4) / 5]);
    if (r.dir !== "up" || !r.R) line(c, zig, lace, 0.16, r.dir === "up" ? 0.55 : 0.8);
  });
}

function apron(c: C2, r: Rig) {
  const { cx, sy, hipY } = r, col = C(r.L.apron!);
  if (r.dir === "up") { line(c, [[cx - 2, sy - 0.8], [cx + 1.6, hipY - 1]], sh(col, 0.8), 0.4, 0.9); line(c, [[cx + 2, sy - 0.8], [cx - 1.6, hipY - 1]], sh(col, 0.8), 0.4, 0.9); return; }
  const x0 = r.R ? cx + 0.4 : cx - 2.4, x1 = r.R ? cx + 2.4 : cx + 2.4, y0 = sy + 0.6, y1 = hipY + 5.2;
  const s = blobPath([[x0 + 0.3, y0], [x1 - 0.3, y0], [x1, y0 + 2], [x1 + 0.3, y1], [(x0 + x1) / 2, y1 + 0.3], [x0 - 0.3, y1], [x0, y0 + 2]]);
  vol(c, s, col, [x0, y0, x1 - x0, y1 - y0], { ao: 0.3 });
  grain(c, s, [x0, y0, x1 - x0, y1 - y0], col, r.seed + 9, 22, 0.18, 1.0, 1.5);
  if (!r.R) { line(c, [[x0 + 0.3, y0], [cx - 3, sy - 1]], sh(col, 0.8), 0.3); line(c, [[x1 - 0.3, y0], [cx + 3, sy - 1]], sh(col, 0.8), 0.3); }
  if (r.L.apron === 0x5e3b20) for (let k = 0; k < 4; k++) glow(c, x0 + 0.8 + k * 1.1, y0 + 3 + (k % 2) * 2.4, 0.4, 0xff8a3c, 0.25); // forge scorch
}

function tabard(c: C2, r: Rig) {
  const t = r.L.tabard!, { cx, sy, hipY } = r, col = C(t.col);
  if (r.R) {
    const s = poly([[cx + 0.2, sy + 0.2], [cx + 2.0, sy + 0.6], [cx + 1.8, hipY + 3.6], [cx - 0.2, hipY + 3.4]]);
    vol(c, s, col, [cx - 0.2, sy, 2.4, hipY - sy + 4], { ao: 0.25 });
    line(c, [[cx + 2.0, sy + 0.6], [cx + 1.8, hipY + 3.6]], C(t.trim), 0.3, 0.9);
    return;
  }
  const w = 1.75, sway = r.p.stride * 0.3;
  const s = poly([[cx - w, sy - 0.6], [cx + w, sy - 0.6], [cx + w + 0.2 + sway, hipY + 3.8], [cx - w + 0.2 + sway, hipY + 3.8]]);
  vol(c, s, col, [cx - w, sy, 2 * w, hipY - sy + 4], { ao: 0.3 });
  grain(c, s, [cx - w, sy, 2 * w, hipY - sy + 4], col, r.seed + 4, 18, 0.15, 1.2, 1.5);
  clipTo(c, s, () => { c.beginPath(); s(c); c.strokeStyle = css(C(t.trim), 0.95); c.lineWidth = 0.55; c.stroke(); });
  if (r.dir === "down") {
    // heraldic cross with a rounded boss
    const ex = cx + sway * 0.4, ey = sy + 3.3;
    line(c, [[ex, ey - 1.7], [ex, ey + 1.9]], C(t.emblem), 0.55); line(c, [[ex - 1.15, ey - 0.4], [ex + 1.15, ey - 0.4]], C(t.emblem), 0.55);
    glow(c, ex, ey - 0.4, 0.8, C(t.emblem), 0.5);
  }
}

// ---------------------------------------------------------------- back items (cape, quiver, pelt)
function backItem(c: C2, r: Rig, front: boolean) {
  const L = r.L, { cx, sy, hipY } = r;
  if ((r.dir === "up") === front) beastParts(c, r);
  if (front) fetishes(c, r);
  coatTails(c, r, front);
  if (L.scarf) scarfEnds(c, r, front);
  if (L.back === "cape") {
    const hp = hipY + (L.capeShort ? -4.2 : 0); // a short shoulder cape ends at the waist
    const col = C(L.capeCol!), flut = Math.sin(r.p.t * 1.1) * 0.5 + (r.p.run ? 1.2 : 0) + Math.abs(r.p.stride) * 0.4;
    if (r.dir === "up" && front) {
      const s = blobPath([[cx - 3.4 * r.b, sy - 0.8], [cx + 3.4 * r.b, sy - 0.8], [cx + 3.9 * r.b + flut * 0.3, sy + 6], [cx + 3.6, hp + 5.6], [cx, hp + 6.4 + flut * 0.3], [cx - 3.6, hp + 5.6], [cx - 3.9 * r.b - flut * 0.3, sy + 6]]);
      vol(c, s, col, [cx - 4, sy - 1, 8, hp - sy + 7], { ao: 0.35 });
      grain(c, s, [cx - 4, sy - 1, 8, hp - sy + 7], col, r.seed + 21, 30, 0.18, 1.4, 1.5);
      for (let k = -1; k <= 1; k++) curve(c, [cx + k * 1.6, sy + 1], [cx + k * 2.0, sy + 6], [cx + k * 2.3, hp + 5.4], sh(col, 0.55), 0.3, 0.55);
    } else if (r.dir === "right" && !front) {
      const s = blobPath([[cx - 1.4, sy - 0.9], [cx + 0.6, sy - 0.6], [cx - 1.5, hp + 4.8], [cx - 3.3 - flut, hp + 5.4], [cx - 3.9 - flut * 1.3, hp + 1.5], [cx - 2.4 - flut * 0.5, sy + 2]]);
      vol(c, s, col, [cx - 4.5, sy - 1, 5, hp - sy + 7], { ao: 0.35 });
      curve(c, [cx - 1.6, sy + 1], [cx - 2.4 - flut * 0.5, sy + 5], [cx - 2.8 - flut, hp + 4.8], sh(col, 0.55), 0.3, 0.55);
    } else if (r.dir === "down" && !front) {
      // only the edges show beside the legs
      const s = blobPath([[cx - 3.6 * r.b, sy - 0.4], [cx + 3.6 * r.b, sy - 0.4], [cx + 4.1 + flut * 0.2, hp + 5.3], [cx, hp + 5.8], [cx - 4.1 - flut * 0.2, hp + 5.3]]);
      vol(c, s, sh(col, 0.75), [cx - 4, sy, 8, hp - sy + 6], { ao: 0.3 });
    }
    if (L.collar !== undefined) capeCollar(c, r, front);
  } else if (L.back === "quiver") {
    const draw = () => {
      const qa: P = r.dir === "up" ? [cx + 2.1, sy - 1.8] : r.R ? [cx - 2.4, sy - 1.6] : [cx + 2.6, sy - 1.6];
      const qb: P = r.dir === "up" ? [cx - 0.8, hipY - 0.5] : r.R ? [cx - 1.6, hipY - 0.7] : [cx + 0.9, hipY - 0.6];
      for (let k = 0; k < 4; k++) { // arrows
        const ox = (k - 1.5) * 0.45, tip: P = [qa[0] + ox + (qa[0] - qb[0]) * 0.28, qa[1] + (qa[1] - qb[1]) * 0.28];
        line(c, [[qa[0] + ox, qa[1]], tip], C(0x8a6a3c), 0.2);
        fillShape(c, poly([[tip[0] - 0.35, tip[1] + 0.3], [tip[0], tip[1] - 0.8], [tip[0] + 0.35, tip[1] + 0.3]]), css(C(k % 2 ? 0xe9e2d0 : 0xb5262f)));
      }
      limb(c, qa, qb, 1.9, 1.5, C(0x6b4423));
      line(c, [[qa[0] - 0.9, qa[1] + 0.5], [qa[0] + 0.9, qa[1] + 0.5]], C(0xc9a050), 0.3);
    };
    if ((r.dir === "up") === front) draw();
  } else if (L.back === "pelt" && front) {
    // fur mantle over the shoulders
    const col = C(L.capeCol!), rr = rng(41);
    const pts: P[] = [];
    const w = 4.0 * r.b;
    if (r.R) {
      pts.push([cx - 2.6, sy - 1.6], [cx + 1.4, sy - 1.4]);
      for (let k = 0; k <= 5; k++) pts.push([cx + 1.6 - k * 0.9, sy + 0.8 + (k % 2) * 0.8 + rr() * 0.3]);
    } else {
      pts.push([cx - w, sy - 1.0], [cx - w * 0.4, sy - 1.8], [cx + w * 0.4, sy - 1.8], [cx + w, sy - 1.0]);
      for (let k = 0; k <= 8; k++) pts.push([cx + w + 0.3 - k * (2 * w + 0.6) / 8, sy + 0.9 + (k % 2) * 0.9 + rr() * 0.3 - (r.dir === "down" && k > 2 && k < 6 ? 0.6 : 0)]);
    }
    const s = blobPath(pts);
    vol(c, s, col, [cx - w, sy - 2, 2 * w, 4], { ao: 0.3 });
    grain(c, s, [cx - w, sy - 2, 2 * w, 4], col, 43, 70, 0.5, 0.8, 1.3);
  }
}

/**
 * What the Hide Rite grew on the beast-folk's backs (look.ts): a naked rat's tail, spider legs, bat or crow wings
 * (beating with the frame). Drawn behind the body, or over it from the back.
 */
function beastParts(c: C2, r: Rig) {
  const L = r.L, { cx, sy, hipY } = r, t = r.p.t, R = r.R, up = r.dir === "up";
  if (L.quills !== undefined) {
    // a porcupine's back: banded quills fanning out of the spine; behind the body from the front, over it from behind
    const dark = C(L.quills), n = up ? 26 : 16;
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n, rs = (k * 7919 % 13) / 13;
      let a: P, b: P;
      if (up) { const bx = cx + (u - 0.5) * 7, by = sy + 1 + ((k * 5) % 6) * 1.5; a = [bx, by]; b = [bx + (u - 0.5) * 5, by - 2.6 - rs * 2.2]; }
      else if (R) { const ang = -2.6 + u * 1.9; a = [cx - 1.4 + Math.cos(ang) * 1.0, sy + 2.2 + Math.sin(ang) * 1.0 + u * 2]; b = [a[0] + Math.cos(ang) * (4 + rs * 2.4), a[1] + Math.sin(ang) * (4 + rs * 2.4)]; }
      else { const ang = -Math.PI + u * Math.PI, side = Math.cos(ang); a = [cx + side * 3.0, sy + 0.8 + Math.sin(ang) * -0.5]; b = [a[0] + side * (2.6 + rs * 1.8), a[1] - 3.4 - rs * 2.4 + Math.abs(side) * 1.2]; }
      line(c, [a, b], sh(0x2a2220, 0.6), 0.62, 1); line(c, [a, lerpP(a, b, 0.62)], dark, 0.4, 1); line(c, [lerpP(a, b, 0.55), b], 0xe8dfc4, 0.36, 1);
    }
  }
  if (L.tail !== undefined) {
    const col = C(L.tail), sw = Math.sin(t * 1.3) * 0.8;
    const pts: P[] = R ? [[cx - 1.2, hipY], [cx - 4.5, hipY + 3.5], [cx - 7.5 + sw, 28.6]] : [[cx + 0.6, hipY + 0.4], [cx + 3.2 + sw, hipY + 4.5], [cx + 5.5 + sw, 28.8]];
    limb(c, pts[0], pts[1], 0.75, 0.5, col); limb(c, pts[1], pts[2], 0.5, 0.22, sh(col, 0.85));
    if (L.beast === "lion") { // a lion's tail: smooth fur, a dark tuft at the tip
      const q = pts[2];
      vol(c, ellipseP(q[0], q[1] - 0.3, 0.75, 1.0, R ? 0.6 : -0.4), C(0x5a3418), [q[0] - 0.8, q[1] - 1.3, 1.6, 2], { ao: 0.3 });
    } else for (let k = 1; k < 5; k++) { const q = lerpP(pts[0], pts[1], k / 5); line(c, [[q[0] - 0.3, q[1] - 0.3], [q[0] + 0.3, q[1] + 0.3]], sh(col, 0.6), 0.08, 0.6); }
  }
  if (L.spiderLegs !== undefined) {
    const col = C(L.spiderLegs), wig = Math.sin(t * 1.9) * 0.6;
    const sides = R ? [-1] : [-1, 1];
    for (const sg of sides) for (let k = 0; k < 2; k++) {
      const root: P = [cx + sg * (R ? 0.5 : 1.3), sy + 1 + k * 1.4];
      const knee: P = [root[0] + sg * (4.2 + k * 0.8) + (R ? -2 : 0), sy - 3.6 + k * 1.2 + (k ? wig : -wig)];
      const tip: P = [knee[0] + sg * (2.2 + k), sy + 6 + k * 2];
      limb(c, root, knee, 0.55, 0.42, col); limb(c, knee, tip, 0.42, 0.15, sh(col, 0.8));
      fillShape(c, ellipseP(knee[0], knee[1], 0.35, 0.35), css(mix(col, 0x8a7a8a, 0.4)));
    }
  }
  if (L.wings) {
    // resting wings (the sphinx) stay half-folded up its back and only stir; the others beat
    const rest = !!L.wings.rest, col = C(L.wings.col), bat = L.wings.kind === "bat", flap = Math.sin(t * 1.7) * (rest ? 0.25 : 1);
    const sides = R ? [-1] : [-1, 1];
    for (const sg of sides) {
      const root: P = [cx + sg * (R ? 0.2 : 1.2), sy + 0.6];
      const span = rest ? (R ? 6.5 : 7.5) : (R ? 8.5 : 10.5), lift = (rest ? 7.5 : 4.5) + flap * 3.2;
      const elbow: P = [root[0] + sg * span * 0.42 + (R ? -2 : 0), root[1] - lift];
      const tip: P = [root[0] + sg * span + (R ? -4 : 0), root[1] - lift * 0.35 + 1.5];
      // trailing edge: scalloped between the finger bones (bat) or ragged primaries (crow)
      const low: P[] = [];
      for (let k = 4; k >= 1; k--) {
        const u = k / 4.5, dip = k % 2 ? 0 : (bat ? -1.4 : -0.5);
        low.push([root[0] + sg * span * u * 0.95 + (R ? -4 * u : 0), root[1] + 3.6 - u * 2.6 + dip + flap * 0.5]);
      }
      const s = blobPath([root, elbow, tip, ...low]);
      vol(c, s, bat ? col : sh(col, 0.9), [Math.min(root[0], tip[0]) - 1, root[1] - lift - 1, span + 2, lift + 6], { ao: 0.35 });
      if (bat) for (const q of low) line(c, [elbow, q], sh(col, 0.5), 0.14, 0.8); // finger bones
      else for (let k = 0; k < 6; k++) { const a = lerpP(elbow, tip, k / 6), b: P = [a[0] - sg * 0.3, a[1] + 3.2 - k * 0.3]; line(c, [a, b], sh(col, 0.55), 0.16, 0.8); } // primaries
      if (!bat && L.wings.tip !== undefined) { // painted feathers: a band of lapis along the trailing edge, coverts in rows
        for (let k = 0; k < 7; k++) { const a = lerpP(root, tip, 0.25 + k * 0.11), b: P = [a[0] - sg * 0.2, a[1] + 2.2]; line(c, [lerpP(a, b, 0.55), b], C(L.wings.tip), 0.32, 0.9); }
        for (let k = 0; k < 4; k++) { const a = lerpP(root, elbow, 0.3 + k * 0.17); line(c, [a, [a[0] + sg * 0.9, a[1] + 1.0]], mix(col, 0xffffff, 0.35), 0.14, 0.7); }
      }
      limb(c, root, elbow, 0.55, 0.4, sh(col, 0.7)); limb(c, elbow, tip, 0.4, 0.15, sh(col, 0.7));
    }
  }
}

/** Bone and charm fetishes hanging on cords from the belt (the Hide-Kin shamans, the trappers' lodge charms). */
function fetishes(c: C2, r: Rig) {
  const L = r.L; if (L.fetishes === undefined) return;
  const col = C(L.fetishes), { cx, hipY } = r, t = r.p.t, R = r.R;
  const spots: [number, number][] = R ? [[-0.8, 0], [0.6, 0.4], [-2.0, 0.6]] : r.dir === "up" ? [[-2.4, 0], [2.4, 0.3]] : [[-2.8, 0.2], [-1.3, 0.7], [2.6, 0.2], [1.2, 0.6]];
  spots.forEach(([dx, dy], i) => {
    const x = cx + dx, y = hipY - 1.6 + dy, sw = Math.sin(t * 1.3 + i * 1.7) * 0.3, len = 2.2 + (i % 2) * 1.2;
    line(c, [[x, y], [x + sw, y + len]], 0x2a1c12, 0.14, 0.9);
    if (i % 3 === 0) fillShape(c, poly([[x + sw - 0.6, y + len], [x + sw + 0.6, y + len], [x + sw + 0.35, y + len + 1.6], [x + sw - 0.35, y + len + 1.6]]), css(col)); // a bone
    else if (i % 3 === 1) { fillShape(c, ellipseP(x + sw, y + len + 0.5, 0.65, 0.75), css(col)); fillShape(c, ellipseP(x + sw - 0.2, y + len + 0.4, 0.14, 0.14), css(0x1a1008)); fillShape(c, ellipseP(x + sw + 0.2, y + len + 0.4, 0.14, 0.14), css(0x1a1008)); } // a tiny skull
    else { fillShape(c, ellipseP(x + sw, y + len + 0.4, 0.6, 0.6), css(0x7a2a1a)); fillShape(c, ellipseP(x + sw, y + len + 0.4, 0.28, 0.28), css(0xd8a040)); } // a clay charm
  });
}

// ---------------------------------------------------------------- arms
function arm(c: C2, r: Rig, which: "near" | "far") {
  const L = r.L, isNear = which === "near";
  const s = isNear ? r.nearS : r.farS, e = isNear ? r.nearE : r.farE, h = isNear ? r.nearH : r.farH;
  const armoured = gear?.slot === "armour" && gear.style === "trim";
  const kind = L.arms;
  const sleeve = C(kind === "bare" ? L.skin : L.sleeve), skin = C(L.skin);
  const robe = L.torso === "robe";
  const plate = kind === "plate";
  if (L.bones && kind === "bare") {
    const bone = C(L.skin);
    limb(c, s, e, 0.9, 0.75, bone); limb(c, e, h, 0.75, 0.6, bone);
    vol(c, ellipseP(e[0], e[1], 0.55, 0.55), bone, [e[0] - 0.6, e[1] - 0.6, 1.2, 1.2], { ao: 0.2 });
    vol(c, ellipseP(s[0], s[1], 0.95, 0.85), bone, [s[0] - 1, s[1] - 0.9, 2, 1.8], { ao: 0.25 });
    for (const a of [-0.5, 0, 0.5]) line(c, [h, [h[0] + Math.cos(Math.atan2(h[1] - e[1], h[0] - e[0]) + a) * 1.0, h[1] + Math.sin(Math.atan2(h[1] - e[1], h[0] - e[0]) + a) * 1.0]], bone, 0.28);
    return;
  }
  limb(c, s, e, 2.0 * r.b, 1.65, sleeve, { metal: plate });
  if (robe) {
    // bell sleeve opening toward the wrist
    const w: P = [h[0] - (h[0] - e[0]) * 0.2, h[1] - (h[1] - e[1]) * 0.2];
    limb(c, e, w, 1.7, 2.5, sleeve);
    if (L.trim) { const dx = w[0] - e[0], dy = w[1] - e[1], l = Math.hypot(dx, dy) || 1; line(c, [[w[0] - dy / l * 1.2, w[1] + dx / l * 1.2], [w[0] + dy / l * 1.2, w[1] - dx / l * 1.2]], C(L.trim), 0.4, 0.9); }
  } else limb(c, e, h, 1.65, 1.3, sleeve, { metal: plate });
  if (kind === "wrap" || L.bracer !== undefined) {
    const t0: P = [e[0] + (h[0] - e[0]) * 0.35, e[1] + (h[1] - e[1]) * 0.35], t1: P = [e[0] + (h[0] - e[0]) * 0.88, e[1] + (h[1] - e[1]) * 0.88];
    if (kind === "wrap") { limb(c, t0, t1, 1.6, 1.4, C(L.glove ?? 0xbfc4cf)); line(c, [t0, t1], C(0x8a8fa0), 0.12, 0.6); }
    else limb(c, t0, t1, 1.75, 1.55, C(L.bracer!));
  }
  // hand
  const hc = C(plate ? (L.glove ?? 0x6f7883) : L.glove !== undefined && kind !== "wrap" ? L.glove : L.skin);
  const hs = ellipseP(h[0], h[1], 0.85, 0.8);
  if (plate) metal(c, hs, hc, [h[0] - 0.8, h[1] - 0.8], [h[0] + 0.8, h[1] + 0.8], 0.4); else vol(c, hs, hc, [h[0] - 0.9, h[1] - 0.9, 1.8, 1.8], { ao: 0.2 });
  void skin;
  if (L.claws !== undefined) { // great digging claws: three long curved nails past the knuckles
    const dx = h[0] - e[0], dy = h[1] - e[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, cc = C(L.claws);
    for (const o of [-0.8, 0, 0.8]) { const bx = h[0] - uy * o * 0.9, by = h[1] + ux * o * 0.9, tx = bx + ux * 2.4 - uy * o * 0.7, ty = by + uy * 2.4 + ux * o * 0.7;
      limb(c, [bx, by], [tx, ty], 0.55, 0.12, sh(cc, 0.5)); limb(c, [bx, by], [tx, ty], 0.4, 0.06, cc); }
  }
  // pauldron
  if (plate || armoured) {
    const pc = C(armoured ? gear!.color : L.sleeve);
    const ps = ellipseP(s[0] + (r.R ? 0.2 : 0), s[1] - 0.1, 1.85 * r.b, 1.45, r.R ? 0 : (s[0] < r.cx ? -0.3 : 0.3));
    metal(c, ps, pc, [s[0] - 1.6, s[1] - 1.4], [s[0] + 1.6, s[1] + 1.2], 0.7);
    if (armoured || L.trim) clipTo(c, ps, () => { c.beginPath(); ps(c); c.strokeStyle = css(C(armoured ? gear!.accent : L.trim!), 0.9); c.lineWidth = 0.4; c.stroke(); });
  }
  if ((L.boneArmour ?? 0) >= 1) bonePauldron(c, r, s, isNear);
}

// ---------------------------------------------------------------- warlock tailcoat and scarf (the Summoner)
/** 0 at rest, 0.5 walking, 1 running: how hard cloth streams behind. */
const motion = (r: Rig) => (r.p.run ? 1 : r.p.phase !== undefined || r.p.stride !== 0 ? 0.5 : 0);
/** Phase of the cloth wave: the gait cycle when moving (loops with it), the frame index at rest (8-frame loop). */
const wavePh = (r: Rig) => (r.p.phase !== undefined ? r.p.phase * (r.p.run ? 2 : 1) : r.p.t * Math.PI / 4);

/** Tailcoat body: an open front over the waistcoat, lapels and piping in the trim colour, two buttons. */
function tailcoatFront(c: C2, r: Rig, s: Shape, col: number, trim?: number) {
  const L = r.L, { cx, sy, hipY } = r, tc = C(trim ?? sh(L.torsoCol, 1.6)), wc = C(L.vest ?? sh(L.torsoCol, 0.7));
  const btn = C(L.buckle ?? 0xb0b4c0), dk = sh(col, 0.5);
  if (r.dir === "down") {
    const o = r.fo * 0.6;
    clipTo(c, s, () => {
      // the waistcoat in the opening, cut square at the waist where the coat front stops
      const w = blobPath([[cx - 1.2 + o, sy - 1.2], [cx + 1.2 + o, sy - 1.2], [cx + 1.5 + o, hipY - 0.2], [cx + o, hipY + 0.4], [cx - 1.5 + o, hipY - 0.2]]);
      vol(c, w, wc, [cx - 1.6, sy - 1.2, 3.2, hipY - sy + 1.4], { ao: 0.35 });
      line(c, [[cx + o, sy + 1.2], [cx + o, hipY]], sh(wc, 0.55), 0.15, 0.7);
      for (const k of [0, 1, 2]) fillShape(c, ellipseP(cx + o, sy + 1.9 + k * 1.3, 0.22, 0.22), css(sh(btn, 0.85)));
      // lapels: dark silk with a violet edge, rolling down to the first button
      for (const sg of [-1, 1]) {
        const lap = poly([[cx + o + sg * 1.25, sy - 1.25], [cx + o + sg * 2.6, sy - 0.3], [cx + o + sg * 1.7, sy + 1.5], [cx + o + sg * 0.55, sy + 2.9]]);
        vol(c, lap, sh(col, 0.72), [cx - 3, sy - 1.3, 6, 4.4], { ao: 0.2, hi: 1.35 });
        line(c, [[cx + o + sg * 1.25, sy - 1.2], [cx + o + sg * 0.55, sy + 2.9], [cx + o + sg * 1.45, hipY - 0.4], [cx + o + sg * 2.7, hipY + 0.8]], tc, 0.32, 0.95);
      }
      // the coat's two front buttons on the near panel
      for (const k of [0, 1]) metal(c, ellipseP(cx + o - 1.7, sy + 3.6 + k * 1.4, 0.32, 0.32), btn, [cx + o - 2, sy + 3.3 + k * 1.4], [cx + o - 1.4, sy + 3.9 + k * 1.4], 0.5);
    });
    for (const sg of [-1, 1]) curve(c, [cx + o + sg * 2.4, sy + 1.4], [cx + o + sg * 2.9, sy + 4], [cx + o + sg * 2.5, hipY], dk, 0.2, 0.5);
  } else if (r.R) {
    clipTo(c, s, () => {
      const w = poly([[cx + 1.0, sy - 1.2], [cx + 2.6, sy + 0.6], [cx + 2.4, hipY + 0.5], [cx + 1.4, hipY + 0.5]]);
      vol(c, w, wc, [cx + 1, sy - 1.2, 2, hipY - sy + 2], { ao: 0.3 });
      const lap = poly([[cx + 0.6, sy - 1.2], [cx + 1.6, sy - 0.8], [cx + 2.1, sy + 2.6], [cx + 1.2, sy + 1.2]]);
      vol(c, lap, sh(col, 0.72), [cx, sy - 1.2, 2.4, 4], { ao: 0.2, hi: 1.35 });
      line(c, [[cx + 1.0, sy - 1.1], [cx + 2.1, sy + 2.6], [cx + 1.5, hipY - 0.2], [cx - 0.4, hipY + 0.9]], tc, 0.32, 0.95);
      metal(c, ellipseP(cx + 1.9, sy + 3.8, 0.3, 0.3), btn, [cx + 1.6, sy + 3.5], [cx + 2.2, sy + 4.1], 0.5);
    });
    curve(c, [cx - 0.6, sy + 1], [cx - 1.4, sy + 3.6], [cx - 1.1, hipY], dk, 0.22, 0.55);
  } else {
    // from behind: a centre seam down to the waist, where the tails split (coatTails)
    line(c, [[cx, sy - 0.6], [cx, hipY]], dk, 0.25, 0.7);
    for (const sg of [-1, 1]) curve(c, [cx + sg * 2.0, sy + 1.2], [cx + sg * 2.5, sy + 3.8], [cx + sg * 1.9, hipY - 0.4], dk, 0.2, 0.5);
    for (const sg of [-1, 1]) metal(c, ellipseP(cx + sg * 1.0, hipY - 1.0, 0.3, 0.3), btn, [cx + sg - 0.3, hipY - 1.3], [cx + sg + 0.3, hipY - 0.7], 0.5);
  }
}

/** The tailcoat's two tails to mid-thigh: behind the legs from the front and the side, over them from behind. They swing with the gait and stream back at a run. */
function coatTails(c: C2, r: Rig, front: boolean) {
  const L = r.L;
  if (L.torso !== "tailcoat" || torsoKind(r).kind !== "tailcoat" || (r.dir === "up") !== front) return;
  const col = C(L.torsoCol), tc = C(L.trim ?? sh(L.torsoCol, 1.6)), mv = motion(r), ph = wavePh(r), { cx, hipY } = r;
  const y0 = hipY - 1.4, hem = hipY + 3.3;
  const tail = (pts: P[], shade: number) => {
    const s = blobPath(pts), cc = sh(col, shade * 1.12);
    vol(c, s, cc, [cx - 5, y0, 10, hem - y0 + 2], { ao: 0.3, hi: 1.35 });
    grain(c, s, [cx - 5, y0, 10, hem - y0 + 2], cc, r.seed + 51, 18, 0.16, 1.0, 1.5);
    clipTo(c, s, () => { c.beginPath(); s(c); c.strokeStyle = css(tc, 0.9); c.lineWidth = 0.4; c.stroke(); });
  };
  if (r.R) {
    // side view: both tails hang behind the seat; walking they swing, running they fly back
    for (const i of [0, 1]) {
      const sw = Math.sin(ph + i * Math.PI) * (0.3 + mv * 0.6), back = 0.4 + mv * 2.4 + sw, lift = mv * 1.6 + Math.max(0, sw) * 0.4;
      const x0 = cx - 1.9 + i * 0.5;
      tail([[x0 + 1.6, y0], [x0 - 0.2, y0 + 0.2], [x0 - 0.9 - back * 0.6, hem - 1.4 - lift * 0.5], [x0 - 1.2 - back, hem - lift], [x0 - back * 0.6, hem + 0.3 - lift * 0.8], [x0 + 1.0, hipY + 1.2]], i ? 1 : 0.8);
    }
  } else if (r.dir === "down") {
    // seen from the front only the tails' edges show past the hips; they flare as the legs move
    for (const sg of [-1, 1]) {
      const sw = Math.sin(ph + (sg > 0 ? Math.PI : 0)) * mv * 0.5, fl = mv * 0.9 + sw;
      const x = cx - r.sil * 0.5 + r.fo * 0.3;
      tail([[x + sg * 1.4, y0], [x + sg * 3.1, y0 + 0.2], [x + sg * (3.6 + fl), hem - 0.6], [x + sg * (3.2 + fl), hem + 0.2], [x + sg * 1.4, hem - 0.3]], 0.75);
    }
  } else {
    // from behind: the two tails over the legs, split up the middle, swinging in turn
    for (const sg of [-1, 1]) {
      const sw = Math.sin(ph + (sg > 0 ? Math.PI : 0)) * (0.25 + mv * 0.55), fl = mv * 0.6;
      const x = cx;
      tail([[x + sg * 0.15, y0], [x + sg * 3.2, y0 - 0.1], [x + sg * (3.5 + fl) + sw, hem - 1], [x + sg * (2.9 + fl) + sw, hem + 0.2 - mv * 0.4], [x + sg * 0.5 + sw * 0.6, hem - 0.4 - mv * 0.3], [x + sg * 0.2, hipY + 0.4]], 1);
    }
  }
}

/** One floating scarf end: a cloth ribbon from `root`, bending along a travelling wave, a coloured band near the fringed tip. */
function ribbon(c: C2, r: Rig, root: P, ang: number, len: number, amp: number, ph: number, w: number, shade: number) {
  const sc = r.L.scarf!, col = C(sh(sc.col, shade)), n = 7, pts: P[] = [root];
  let p = root;
  for (let i = 1; i <= n; i++) {
    const k = i / n, a = ang + amp * Math.sin(ph - i * 0.85) * k;
    p = [p[0] + Math.cos(a) * len / n, p[1] + Math.sin(a) * len / n];
    pts.push(p);
  }
  const side = (sg: number) => pts.map((q, i) => {
    const a = i === 0 ? ang : Math.atan2(q[1] - pts[i - 1][1], q[0] - pts[i - 1][0]), ww = w * (1 - 0.2 * i / n) / 2;
    return [q[0] - Math.sin(a) * ww * sg, q[1] + Math.cos(a) * ww * sg] as P;
  });
  const a = side(1), b = side(-1).reverse();
  const s = blobPath([...a, ...b]);
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const box: [number, number, number, number] = [Math.min(...xs) - w, Math.min(...ys) - w, Math.max(...xs) - Math.min(...xs) + 2 * w, Math.max(...ys) - Math.min(...ys) + 2 * w];
  vol(c, s, col, box, { ao: 0.25 });
  // a fold along the ribbon, then the violet band and the fringe at the tip
  line(c, pts.slice(1, -1), sh(col, 0.6), 0.16, 0.6);
  if (sc.band !== undefined) {
    const q0 = pts[n - 2], q1 = pts[n - 1], a1 = Math.atan2(q1[1] - q0[1], q1[0] - q0[0]);
    const ww = w * 0.42, m: P = [(q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2];
    line(c, [[m[0] - Math.sin(a1) * ww, m[1] + Math.cos(a1) * ww], [m[0] + Math.sin(a1) * ww, m[1] - Math.cos(a1) * ww]], C(sc.band), 0.42, 0.95);
  }
  const e = pts[n], ea = Math.atan2(e[1] - pts[n - 1][1], e[0] - pts[n - 1][0]);
  for (const k of [-1, 0, 1]) {
    const o: P = [e[0] - Math.sin(ea) * k * w * 0.3, e[1] + Math.cos(ea) * k * w * 0.3];
    line(c, [o, [o[0] + Math.cos(ea + k * 0.2) * 0.7, o[1] + Math.sin(ea + k * 0.2) * 0.7]], sh(col, 0.8), 0.14, 0.85);
  }
}

/**
 * The scarf's two long ends. At rest they stir; walking they swing; running they stream back. Facing us they hang
 * down the chest (front pass) and fly up past the shoulders at a run (back pass); from the side they trail behind
 * the neck; from behind they hang down the back (front pass).
 */
function scarfEnds(c: C2, r: Rig, front: boolean) {
  const mv = motion(r), ph = wavePh(r), { cx, sy } = r, D = Math.PI / 180;
  if (r.R) {
    if (front) return;
    const base = (100 + mv * 66) * D, amp = 0.12 + mv * 0.34;
    ribbon(c, r, [cx - 0.9, sy - 0.9], base + 8 * D, 7.6, amp, ph + 1.3, 1.25, 0.72);
    ribbon(c, r, [cx - 1.2, sy - 0.6], base, 9.2, amp, ph, 1.35, 0.95);
  } else if (r.dir === "down") {
    const tilt = r.diag * 14 * D, o = r.fo * 0.7;
    if (r.p.run) {
      if (front) return;
      for (const sg of [-1, 1]) ribbon(c, r, [cx + o + sg * 1.3, sy - 0.8], (sg > 0 ? -35 : -145) * D + tilt * 1.5, 6.4, 0.42, ph + (sg > 0 ? 1.4 : 0), 1.25, sg > 0 ? 0.75 : 0.9);
      return;
    }
    if (!front) return;
    // the two ends fall either side of the coat's opening, the waistcoat showing between them
    const amp = 0.1 + mv * 0.42;
    ribbon(c, r, [cx + o + 1.55, sy - 0.4], 84 * D + tilt, 6.6, amp, ph + 1.6, 1.0, 0.82);
    ribbon(c, r, [cx + o - 1.6, sy - 0.4], 95 * D + tilt, 7.8, amp, ph, 1.05, 1);
  } else {
    if (!front) return;
    const tilt = r.diag ? -12 * D : 0, k = r.p.run ? 0.7 : 1, spread = (4 + mv * 18) * D, amp = 0.12 + mv * 0.36;
    ribbon(c, r, [cx - 0.6, sy - 0.5], 90 * D + spread + tilt, 8.6 * k, amp, ph, 1.35, 0.95);
    ribbon(c, r, [cx + 0.6, sy - 0.5], 90 * D - spread + tilt, 7.4 * k, amp, ph + 1.4, 1.25, 0.82);
  }
}

/** The scarf wound twice round the neck, over the collar (drawn after the head). */
function scarfWrap(c: C2, r: Rig) {
  const sc = r.L.scarf!, col = C(sc.col), { sy } = r, x = r.R ? r.cx + 0.2 : r.cx + r.fo * 0.7;
  const w = r.R ? 1.8 : 2.4, y0 = sy - 1.55, y1 = sy + 0.45;
  const s = blobPath([[x - w, y0 + 0.5], [x - w * 0.5, y0], [x + w * 0.5, y0], [x + w, y0 + 0.5], [x + w + 0.2, y1 - 0.4], [x + w * 0.4, y1 + 0.2], [x - w * 0.4, y1 + 0.2], [x - w - 0.2, y1 - 0.4]]);
  vol(c, s, col, [x - w, y0, 2 * w, y1 - y0 + 0.4], { ao: 0.3, hi: 1.3 });
  // the two turns of cloth
  curve(c, [x - w + 0.2, y0 + 1.1], [x, y0 + 1.6], [x + w - 0.2, y0 + 1.1], sh(col, 0.5), 0.22, 0.8);
  if (sc.band !== undefined) curve(c, [x - w + 0.3, y1 - 0.5], [x, y1 - 0.1], [x + w - 0.3, y1 - 0.5], C(sc.band), 0.18, 0.55);
}

/**
 * A tall stand-up collar on the cape (the vampire's Nightcoat): stiff dark cloth flaring up behind the head, lined in
 * `collar`. Behind the head when it faces us or the side, a low band across the nape seen from behind.
 */
function capeCollar(c: C2, r: Rig, front: boolean) {
  const L = r.L, { cx, sy } = r, hy = r.head[1], col = C(L.capeCol!), lin = C(L.collar!);
  if (r.dir === "up") {
    if (!front) return;
    const s = blobPath([[cx - 3.2 * r.b, sy + 0.4], [cx - 3.3 * r.b, hy + 0.9], [cx - 1.2, hy + 1.9], [cx + 1.2, hy + 1.9], [cx + 3.3 * r.b, hy + 0.9], [cx + 3.2 * r.b, sy + 0.4]]);
    vol(c, s, col, [cx - 3.4, hy, 6.8, sy - hy + 1], { ao: 0.35 });
    curve(c, [cx - 3.0, hy + 1.1], [cx, hy + 2.4], [cx + 3.0, hy + 1.1], sh(col, 1.5), 0.25, 0.7);
    return;
  }
  if (front) return;
  if (r.R && !r.diag) {
    // side view: the collar stands up behind the nape
    const s = blobPath([[cx - 0.4, sy - 0.2], [cx - 2.4, hy + 0.2], [cx - 3.2, hy + 0.8], [cx - 2.6, sy + 0.8]]);
    vol(c, s, col, [cx - 3.5, hy, 3.5, sy - hy + 1], { ao: 0.35 });
    fillShape(c, blobPath([[cx - 0.7, sy - 0.3], [cx - 2.2, hy + 0.6], [cx - 2.0, sy + 0.2]]), css(lin));
    return;
  }
  // facing us (or turned 3/4): a red-lined fan rising from the shoulders to above the ears
  const o = r.diag ? -0.5 : 0, w = 3.7 * r.b;
  const s = blobPath([[cx - w + o, sy + 0.6], [cx - w - 0.3 + o, hy + 0.2], [cx - 2.0 + o, hy + 1.4], [cx + 2.0 + o, hy + 1.4], [cx + w + 0.3 + o, hy + 0.2], [cx + w + o, sy + 0.6]]);
  vol(c, s, col, [cx - w - 1, hy, 2 * w + 2, sy - hy + 1], { ao: 0.3 });
  const inner = blobPath([[cx - w + 0.7 + o, sy + 0.2], [cx - w + 0.3 + o, hy + 0.8], [cx - 2.0 + o, hy + 1.9], [cx + 2.0 + o, hy + 1.9], [cx + w - 0.3 + o, hy + 0.8], [cx + w - 0.7 + o, sy + 0.2]]);
  vol(c, inner, lin, [cx - w, hy + 0.5, 2 * w, sy - hy], { ao: 0.4, hi: 1.15 });
}

// ---------------------------------------------------------------- head
function eyesFront(c: C2, r: Rig, hx: number, hy: number, xs: number[]) {
  const ex = r.p.expr, col = r.L.eye ?? 0x1a1010;
  for (const x of xs) {
    const y = hy + 0.25;
    if (ex === "x") { line(c, [[x - 0.4, y - 0.4], [x + 0.4, y + 0.4]], col, 0.22); line(c, [[x + 0.4, y - 0.4], [x - 0.4, y + 0.4]], col, 0.22); }
    else if (ex === "blink") line(c, [[x - 0.4, y + 0.1], [x + 0.4, y + 0.1]], col, 0.2);
    else if (ex === "happy") curve(c, [x - 0.45, y + 0.25], [x, y - 0.45], [x + 0.45, y + 0.25], col, 0.2);
    else if (ex === "squint") { const sgn = x < hx ? 1 : -1; line(c, [[x - 0.4 * sgn, y - 0.35], [x + 0.3 * sgn, y], [x - 0.4 * sgn, y + 0.35]], col, 0.2); }
    else {
      fillShape(c, ellipseP(x, y, 0.42, 0.3), css(0xefe6dc, 0.9));
      fillShape(c, ellipseP(x + 0.05, y + 0.02, 0.24, 0.27), css(col));
      fillShape(c, ellipseP(x - 0.06, y - 0.08, 0.07, 0.07), "rgba(255,255,255,0.9)");
    }
    line(c, [[x - 0.5, y - 0.6], [x + 0.45, y - 0.55]], sh(r.L.hair ?? r.L.skin, 0.45), 0.2, 0.8); // brow
  }
}

function skull(c: C2, r: Rig) {
  const L = r.L, [hx, hy] = r.head, dir = r.dir, bone = C(L.skin), dk = sh(bone, 0.3), glowC = L.eyeGlow ?? 0xff5a3c;
  limb(c, [r.cx, r.sy - 0.6], [hx, hy + 1.6], 0.7, 0.7, sh(bone, 0.8));
  const fx = r.R ? hx - 0.2 : hx;
  // jaw then cranium
  const jaw = r.R ? blobPath([[hx - 0.6, hy + 0.8], [hx + 1.9, hy + 1.0], [hx + 1.7, hy + 2.6], [hx + 0.2, hy + 2.7]]) : blobPath([[hx - 1.6, hy + 0.8], [hx + 1.6, hy + 0.8], [hx + 1.3, hy + 2.6], [hx, hy + 3.0], [hx - 1.3, hy + 2.6]]);
  vol(c, jaw, bone, [hx - 1.6, hy + 0.8, 3.2, 2.2], { ao: 0.35 });
  const cran = ellipseP(fx, hy - 0.4, 2.3, 2.25);
  vol(c, cran, bone, [fx - 2.3, hy - 2.7, 4.6, 4.5], { ao: 0.35, spec: 0.25 });
  if (dir === "up") { line(c, [[hx, hy - 2.6], [hx, hy + 1]], sh(bone, 0.6), 0.15, 0.6); return; }
  const qx = hx + r.fo;
  const sockets: P[] = r.R ? [[hx + 1.1, hy - 0.1]] : [[qx - 0.85, hy - 0.1], [qx + 0.85, hy - 0.1]];
  for (const [x, y] of sockets) {
    fillShape(c, ellipseP(x, y, 0.7, 0.65), css(dk));
    glow(c, x, y, 1.1, glowC, 0.75);
    fillShape(c, ellipseP(x, y, 0.22, 0.22), css(mix(glowC, 0xffffff, 0.6)));
  }
  const nx = r.R ? hx + 1.9 : qx;
  fillShape(c, poly([[nx - 0.3, hy + 1.0], [nx, hy + 0.4], [nx + 0.3, hy + 1.0]]), css(dk));
  // teeth
  const t0 = r.R ? hx + 0.4 : qx - 1.1, t1 = r.R ? hx + 1.9 : qx + 1.1;
  line(c, [[t0, hy + 1.75], [t1, hy + 1.75]], dk, 0.18, 0.9);
  for (let x = t0 + 0.35; x < t1; x += 0.45) line(c, [[x, hy + 1.35], [x, hy + 2.15]], dk, 0.1, 0.8);
}

// ---------------------------------------------------------------- beast-folk heads (Mawdeep Warrens)
/**
 * The animal head a beast-folk wears: the hide of a rat, boar, spider, bat, wolf, bull or bear sewn over a man's
 * or woman's skull by the Hide-Mother's rite (a stitched seam where hide meets the neck). Painted in the rig's
 * head units, facing down / up / right like the faces.
 */
const BEAST: Record<NonNullable<Look["beast"]>, { fur: number; muz: number; nose: number; rx: number; ry: number }> = {
  rat: { fur: 0x6e655c, muz: 0x8a8076, nose: 0xc08a84, rx: 2.0, ry: 2.0 },
  boar: { fur: 0x3e3028, muz: 0x7a5e4e, nose: 0x8a6a5a, rx: 2.55, ry: 2.25 },
  spider: { fur: 0x2a2228, muz: 0x3a3036, nose: 0x1a1418, rx: 2.3, ry: 2.15 },
  bat: { fur: 0x2e2426, muz: 0x4a3a3a, nose: 0x6a4a4a, rx: 2.15, ry: 2.05 },
  wolf: { fur: 0x6a6866, muz: 0xa8a29a, nose: 0x1a1616, rx: 2.3, ry: 2.2 },
  bull: { fur: 0x3a2a24, muz: 0x8a7a6a, nose: 0x5a4a44, rx: 2.6, ry: 2.4 },
  bear: { fur: 0x4a3626, muz: 0x8a6a4a, nose: 0x1a1210, rx: 2.75, ry: 2.5 },
  crow: { fur: 0x1e1a24, muz: 0x4a4650, nose: 0x2a2830, rx: 2.15, ry: 2.15 },
  camel: { fur: 0xb88a58, muz: 0xd0aa78, nose: 0x5a3a24, rx: 1.9, ry: 2.0 },
  lion: { fur: 0xc8923a, muz: 0xe2c690, nose: 0x3a2018, rx: 2.15, ry: 2.15 },
  mole: { fur: 0x54483e, muz: 0xb89a8a, nose: 0xd89a98, rx: 2.2, ry: 2.05 },
  hyena: { fur: 0x9a7a4a, muz: 0x3e2e22, nose: 0x120c0a, rx: 2.3, ry: 2.1 },
  stag: { fur: 0x6a4a34, muz: 0xc0a080, nose: 0x1a1210, rx: 2.1, ry: 2.25 },
  quill: { fur: 0x3e3228, muz: 0x8a7a68, nose: 0x1a1210, rx: 2.3, ry: 2.15 },
};
function beastHead(c: C2, r: Rig, hood = false) {
  const L = r.L, kind = L.beast!, B = BEAST[kind], [hx, hy] = r.head, dir = r.dir, R = r.R, fo = r.fo, qx = hx + fo;
  const fur = C(B.fur), muz = C(B.muz), dk = sh(fur, 0.45), eyeC = hood ? 0x3a2a22 : L.eyeGlow ?? 0xff3a2a; // a flayed hood's eyes are dead
  const ivory = 0xe2d8bc, horn = 0xcfc2a2;
  if (!hood && kind !== "camel" && kind !== "lion") {
    // neck in hide, a stitched seam round it
    limb(c, [r.cx + (R ? 0.2 : 0), r.sy - 0.9], [hx, hy + 1.6], 1.7, 1.6, sh(fur, 0.8));
    const seamY = r.sy - 0.7;
    line(c, [[hx - 1.6, seamY], [hx + 1.6, seamY]], 0x2a1a12, 0.16, 0.8);
    for (let x = hx - 1.4; x <= hx + 1.4; x += 0.55) line(c, [[x - 0.15, seamY - 0.3], [x + 0.15, seamY + 0.3]], 0xb8a888, 0.1, 0.9);
  }
  const fx = R ? hx - 0.2 : hx;
  // ears and horns behind the head
  const ear = (x: number, y: number, w: number, h: number, tilt: number, round: boolean, inner: number) => {
    const s = round ? ellipseP(x, y, w, h, tilt) : poly([[x - w, y + h * 0.4], [x + Math.sin(tilt) * h, y - h], [x + w, y + h * 0.4]]);
    vol(c, s, fur, [x - w, y - h, w * 2, h * 2], { ao: 0.3 });
    if (dir !== "up") fillShape(c, round ? ellipseP(x, y + 0.1, w * 0.55, h * 0.55, tilt) : poly([[x - w * 0.5, y + h * 0.25], [x + Math.sin(tilt) * h * 0.6, y - h * 0.55], [x + w * 0.5, y + h * 0.25]]), css(C(inner), 0.9));
  };
  const sides = R ? [-1] : [-1, 1];
  const earAt = (sx: number, dx: number, dy: number) => R ? hx - 0.6 + dx * 0.4 : (dir === "up" ? hx : qx) + sx * dx;
  if (kind === "rat") for (const sx of sides) ear(earAt(sx, 1.8, 0), hy - 1.9, 1.05, 1.05, 0, true, 0x9a6a64);
  if (kind === "boar") for (const sx of sides) ear(earAt(sx, 1.7, 0), hy - 2.0, 0.6, 1.2, sx * 0.5, false, 0x6a4a3e);
  if (kind === "bat") for (const sx of sides) ear(earAt(sx, 1.5, 0), hy - 2.6, 0.9, 2.1, sx * 0.25, false, 0x7a4a4a);
  if (kind === "wolf") for (const sx of sides) ear(earAt(sx, 1.4, 0), hy - 2.4, 0.8, 1.6, sx * 0.15, false, 0x5a4a44);
  if (kind === "bear") for (const sx of sides) ear(earAt(sx, 2.0, 0), hy - 2.0, 0.85, 0.8, 0, true, 0x2e2018);
  if (kind === "mole") for (const sx of sides) ear(earAt(sx, 1.9, 0.2), hy - 1.2, 0.5, 0.5, 0, true, 0x8a6a5c);
  if (kind === "hyena") for (const sx of sides) ear(earAt(sx, 2.0, 0), hy - 2.0, 1.15, 1.15, 0, true, 0x2a1a14);
  if (kind === "quill") for (const sx of sides) ear(earAt(sx, 1.9, 0), hy - 1.5, 0.7, 0.7, 0, true, 0x6a5a48);
  if (kind === "stag") {
    for (const sx of sides) ear(earAt(sx, 2.0, 0), hy - 1.1, 0.5, 1.3, sx * 1.1, false, 0x8a5a44);
    // antlers: a main beam rising and curving, tines branching forward and out; bone, darkening toward the tips
    const AN = 0xd8cdae, shaft = (a: P, b: P, w: number) => { limb(c, a, b, w, w * 0.6, C(sh(AN, 0.55))); limb(c, a, b, w * 0.7, w * 0.4, C(AN)); };
    for (const sx of sides) {
      const b0: P = R ? [hx - 0.6, hy - 2.0] : [hx + sx * 1.2, hy - 2.0], b1: P = R ? [hx - 1.4, hy - 4.6] : [hx + sx * 2.3, hy - 4.5], b2: P = R ? [hx - 0.2, hy - 7.2] : [hx + sx * 1.8, hy - 7.4];
      shaft(b0, b1, 0.9); shaft(b1, b2, 0.7);
      shaft(b1, R ? [hx + 1.2, hy - 5.8] : [hx + sx * 4.1, hy - 5.8], 0.45);
      shaft(lerpP(b0, b1, 0.55), R ? [hx + 0.8, hy - 3.9] : [hx + sx * 3.9, hy - 3.2], 0.4);
      shaft(b2, R ? [hx + 1.4, hy - 8.6] : [hx + sx * 3.0, hy - 8.8], 0.4);
      shaft(b2, R ? [hx - 1.6, hy - 8.8] : [hx + sx * 0.6, hy - 9.2], 0.36);
    }
  }
  if (kind === "camel") {
    // a long neck rising out of the shoulders, then little round ears
    if (!hood) limb(c, [r.cx + (R ? -0.4 : 0), r.sy - 0.6], [hx - (R ? 0.6 : 0), hy + 1.2], 2.0, 1.5, sh(fur, 0.85));
    for (const sx of sides) ear(earAt(sx, 1.5, 0), hy - 1.9, 0.5, 0.7, sx * 0.4, true, 0x7a5434);
  }
  if (kind === "bull") {
    // horns: thick roots, curving out and up, darkening to the tips
    const hornPath = (sx: number): P[] => R
      ? [[hx - 0.4, hy - 1.5], [hx + 1.2, hy - 2.6], [hx + 2.4, hy - 3.2], [hx + 2.8, hy - 4.6]]
      : [[hx + sx * 1.9, hy - 1.3], [hx + sx * 3.4, hy - 1.7], [hx + sx * 4.6, hy - 2.4], [hx + sx * 4.9, hy - 3.9]];
    for (const sx of sides) {
      const pts = hornPath(sx);
      for (let k = 0; k < pts.length - 1; k++) limb(c, pts[k], pts[k + 1], 1.0 - k * 0.28, 0.75 - k * 0.24, k < 2 ? C(horn) : C(sh(horn, 0.55)));
      for (let k = 0; k < 3; k++) { const p0 = pts[0], p1 = pts[1], t = 0.3 + k * 0.25; const x = p0[0] + (p1[0] - p0[0]) * t, y = p0[1] + (p1[1] - p0[1]) * t; line(c, [[x - 0.2, y - 0.4], [x + 0.2, y + 0.4]], sh(horn, 0.6), 0.1, 0.7); }
    }
  }
  // the sphinx: a lion's mane round the face, under the royal headcloth (nemes) whose striped lappets fall to the chest
  const GOLD = 0xd8a838, LAPIS = 0x24418a, mane = 0x8a5222;
  const stripes = (s: Shape, box: [number, number, number, number], slope: number) => clipTo(c, s, () => {
    for (let y = box[1] - 2; y < box[1] + box[3] + 2; y += 0.62) line(c, [[box[0] - 1, y], [box[0] + box[2] + 1, y + slope]], LAPIS, 0.3, 0.95);
  });
  if (kind === "lion") {
    const mx = R ? hx - 0.9 : hx, mS = ellipseP(mx, hy + 0.5, R ? 2.9 : 3.3, 3.0);
    vol(c, mS, C(mane), [mx - 3.3, hy - 2.5, 6.6, 6], { ao: 0.4 });
    grain(c, mS, [mx - 3.3, hy - 2.5, 6.6, 6], C(mane), r.seed + 77, 60, 0.5, 1.1, 1.4);
    // the lappets (front, side) or the cloth's back with its bound tail (up)
    const lap = (x0: number, x1: number, y0: number, w: number) => {
      const s = poly([[x0 - w, y0], [x0 + w, y0], [x1 + w * 0.85, r.sy + 2.6], [x1 - w * 0.85, r.sy + 2.6]]);
      vol(c, s, C(GOLD), [Math.min(x0, x1) - w, y0, Math.abs(x1 - x0) + w * 2, r.sy + 2.6 - y0], { ao: 0.25, spec: 0.3 });
      stripes(s, [Math.min(x0, x1) - w, y0, Math.abs(x1 - x0) + w * 2, r.sy + 2.6 - y0], 0);
      line(c, [[x1 - w * 0.85, r.sy + 2.6], [x1 + w * 0.85, r.sy + 2.6]], C(GOLD), 0.28, 1);
    };
    if (dir === "up") {
      const back = poly([[hx - 2.7, hy - 1.2], [hx + 2.7, hy - 1.2], [hx + 3.2, hy + 2.2], [hx + 1.6, r.sy + 1.4], [hx - 1.6, r.sy + 1.4], [hx - 3.2, hy + 2.2]]);
      vol(c, back, C(GOLD), [hx - 3.2, hy - 1.2, 6.4, r.sy - hy + 2.6], { ao: 0.3 });
      stripes(back, [hx - 3.2, hy - 1.2, 6.4, r.sy - hy + 2.6], 0);
      limb(c, [hx, r.sy - 0.4], [hx, r.sy + 3.6], 0.9, 0.6, C(GOLD)); // the cloth gathered into a tail down the back
      for (let k = 0; k < 4; k++) line(c, [[hx - 0.7, r.sy + 0.2 + k * 0.9], [hx + 0.7, r.sy + 0.2 + k * 0.9]], C(LAPIS), 0.28, 0.95);
    } else if (R) lap(hx - 1.6, hx - 0.8, hy - 0.4, 1.0);
    else for (const sg of [-1, 1]) lap(qx + sg * 2.5, qx + sg * 2.2, hy - 0.5, 0.95);
  }
  // the head
  const cran = ellipseP(fx, hy - 0.3, B.rx, B.ry);
  vol(c, cran, fur, [fx - B.rx, hy - 0.3 - B.ry, B.rx * 2, B.ry * 2], { ao: 0.35, spec: kind === "spider" ? 0.55 : 0.15 });
  if (kind !== "spider") grain(c, cran, [fx - B.rx, hy - 0.3 - B.ry, B.rx * 2, B.ry * 2], fur, r.seed + 51, 50, 0.45, 0.8, dir === "up" ? 1.4 : -0.6);
  if (kind === "lion") {
    // the headcloth's cap over the crown: flaring wings of cloth at the temples, a gold brow band, the rearing cobra
    const cap = dir === "up" ? ellipseP(fx, hy - 0.5, B.rx + 0.5, B.ry + 0.3)
      : R ? blobPath([[hx + 1.5, hy - 1.0], [hx + 0.6, hy - 2.5], [hx - 1.0, hy - 2.85], [hx - 2.6, hy - 1.9], [hx - 3.0, hy - 0.2], [hx - 1.6, hy - 0.6]])
      : blobPath([[qx - 3.3, hy - 0.1], [qx - 2.5, hy - 2.2], [qx, hy - 2.95], [qx + 2.5, hy - 2.2], [qx + 3.3, hy - 0.1], [qx + 1.6, hy - 1.5], [qx, hy - 1.25], [qx - 1.6, hy - 1.5]]);
    const box: [number, number, number, number] = [hx - 3.4, hy - 3, 6.8, 3.2];
    vol(c, cap, C(GOLD), box, { ao: 0.3, spec: 0.35 });
    stripes(cap, box, R ? -0.6 : 0);
    if (dir !== "up") {
      line(c, R ? [[hx + 1.5, hy - 1.05], [hx - 1.4, hy - 0.75]] : [[qx - 2.3, hy - 1.15], [qx + 2.3, hy - 1.15]], C(0xf0c850), 0.38, 1); // brow band
      const ux = R ? hx + 1.1 : qx, uy = hy - 1.15;
      limb(c, [ux, uy], [ux + (R ? 0.25 : 0), uy - 1.3], 0.42, 0.3, C(0xf0c850)); // the uraeus, the cobra over the brow
      fillShape(c, ellipseP(ux + (R ? 0.3 : 0), uy - 1.45, 0.42, 0.36), css(C(0xf0c850)));
      fillShape(c, ellipseP(ux + (R ? 0.35 : 0), uy - 1.45, 0.14, 0.14), css(C(0xd03020)));
    }
  }
  if (kind === "crow") { // ragged feathers sticking up off the crown and the nape
    for (let k = -2; k <= 2; k++) { const x = hx + k * 0.6 + (R ? -1 : 0), y = hy - B.ry + 0.2; line(c, [[x, y + 0.6], [x + (R ? -0.9 : k * 0.25), y - 0.9 - (k % 2 ? 0.3 : 0)]], sh(fur, 0.7), 0.3, 0.95); }
  }
  if (kind === "quill") { // quills sprouting off the crown and the nape, banded
    for (let k = -3; k <= 3; k++) { const x = hx + k * 0.55 + (R ? -0.8 : 0), y = hy - B.ry + 0.3 + Math.abs(k) * 0.15; line(c, [[x, y + 0.5], [x + (R ? -0.8 : k * 0.28), y - 1.9 + Math.abs(k) * 0.25]], 0x2a2220, 0.26, 0.95); line(c, [[x + (R ? -0.5 : k * 0.17), y - 0.9], [x + (R ? -0.8 : k * 0.28), y - 1.9 + Math.abs(k) * 0.25]], 0xe8dfc4, 0.2, 0.95); }
  }
  if (kind === "hyena") { // a dark ragged crest and spots on the crown
    for (let k = -3; k <= 3; k++) { const x = hx + k * 0.5 + (R ? -0.8 : 0), y = hy - B.ry - 0.1 + Math.abs(k) * 0.15; line(c, [[x, y + 0.6], [x + (R ? -0.6 : k * 0.1), y - 0.9 - (k % 2 ? 0.3 : 0)]], 0x2a1a12, 0.24, 0.95); }
    for (const [dx, dy] of dir === "up" ? [[-1, -1], [0.8, -0.2], [-0.4, 0.8], [1.2, 1]] : [[-1.4, -1.4], [1.3, -1.2], [-0.2, -1.9]]) fillShape(c, ellipseP((R ? hx - 0.6 : qx) + dx, hy + dy, 0.3, 0.26), css(0x3a2616));
  }
  if (kind === "boar" || kind === "wolf") { // bristle mane along the crown
    for (let k = -3; k <= 3; k++) { const x = hx + k * 0.45 + (R ? -0.8 : 0), y = hy - B.ry - 0.1 + Math.abs(k) * 0.12; line(c, [[x, y + 0.6], [x + (R ? -0.4 : k * 0.08), y - 0.5]], sh(fur, 0.6), 0.22, 0.9); }
  }
  // stitched patches: the hide is sewn together from pieces
  if (dir !== "up" && kind !== "spider" && kind !== "camel" && kind !== "lion") {
    const sx0 = R ? hx - 1.2 : qx - 1.4, sy0 = hy - 1.6;
    line(c, [[sx0, sy0], [sx0 + 1.0, sy0 + 1.1]], 0x2a1a12, 0.12, 0.7);
    for (let k = 0; k < 3; k++) { const x = sx0 + k * 0.35, y = sy0 + k * 0.38; line(c, [[x - 0.18, y + 0.15], [x + 0.18, y - 0.15]], 0xb8a888, 0.08, 0.8); }
  }
  if (dir === "up") return;
  const eye = (x: number, y: number, rr: number) => {
    fillShape(c, ellipseP(x, y, rr * 1.4, rr * 1.2), css(sh(dk, 0.6)));
    glow(c, x, y, rr * 2.4, eyeC, 0.7);
    fillShape(c, ellipseP(x, y, rr, rr), css(mix(eyeC, 0xffffff, 0.25)));
  };
  const muzzle = (len: number, w: number, h: number, drop: number) => {
    // front: a muzzle below the eyes; side: pushed out ahead of the face
    const s = R ? blobPath([[hx + 0.6, hy - 0.5 + drop * 0.3], [hx + 1.6 + len, hy + drop * 0.6], [hx + 1.7 + len, hy + h + drop * 0.6], [hx + 0.8, hy + h + 0.6 + drop * 0.3]])
      : ellipseP(qx, hy + 0.9 + drop, w, h);
    vol(c, s, muz, R ? [hx + 0.6, hy - 0.6, len + 1.2, h + 1.4] : [qx - w, hy + 0.9 + drop - h, w * 2, h * 2], { ao: 0.3, hi: 1.15 });
    return s;
  };
  const nose = (x: number, y: number, w: number, h: number) => fillShape(c, ellipseP(x, y, w, h), css(C(B.nose)));
  const tip = (len: number, drop: number): P => R ? [hx + 1.6 + len, hy + drop * 0.6 + 0.2] : [qx, hy + 0.9 + drop + 0.5];
  if (kind === "rat") {
    muzzle(2.6, 1.05, 1.25, 0.4);
    const t = tip(2.6, 0.4); nose(t[0] + (R ? 0.2 : 0), t[1] - (R ? 0.2 : 0.2), 0.45, 0.35);
    // yellow incisors
    if (R) fillShape(c, poly([[t[0] - 0.4, t[1] + 0.5], [t[0], t[1] + 0.5], [t[0] - 0.2, t[1] + 1.4]]), css(C(0xe8d070)));
    else { fillShape(c, poly([[qx - 0.35, hy + 2.3], [qx + 0.35, hy + 2.3], [qx + 0.25, hy + 3.1], [qx - 0.25, hy + 3.1]]), css(C(0xe8d070))); line(c, [[qx, hy + 2.3], [qx, hy + 3.1]], 0x6a5a30, 0.08); }
    for (const sg of R ? [1] : [-1, 1]) for (let k = 0; k < 3; k++) line(c, [[t[0] + sg * 0.3, t[1]], [t[0] + sg * (R ? 2.0 : 1.9), t[1] - 0.6 + k * 0.6]], 0xc8c0b0, 0.06, 0.6);
    if (R) eye(hx + 0.9, hy - 0.5, 0.32); else { eye(qx - 0.85, hy - 0.4, 0.3); eye(qx + 0.85, hy - 0.4, 0.3); }
  } else if (kind === "boar") {
    muzzle(1.6, 1.35, 1.0, 0.4);
    const t = tip(1.6, 0.4);
    if (R) { fillShape(c, ellipseP(t[0] + 0.15, t[1], 0.35, 0.75), css(C(B.nose))); }
    else { nose(qx, hy + 1.4, 0.95, 0.65); fillShape(c, ellipseP(qx - 0.35, hy + 1.4, 0.16, 0.22), css(0x1a1210)); fillShape(c, ellipseP(qx + 0.35, hy + 1.4, 0.16, 0.22), css(0x1a1210)); }
    // tusks curling up from the mouth
    if (R) curve(c, [t[0] - 0.8, t[1] + 0.8], [t[0] + 0.2, t[1] + 0.9], [t[0] - 0.1, t[1] - 0.4], ivory, 0.32);
    else for (const sg of [-1, 1]) curve(c, [qx + sg * 1.0, hy + 2.0], [qx + sg * 1.9, hy + 2.1], [qx + sg * 1.9, hy + 0.8], ivory, 0.32);
    if (R) eye(hx + 0.6, hy - 0.7, 0.26); else { eye(qx - 1.0, hy - 0.5, 0.25); eye(qx + 1.0, hy - 0.5, 0.25); }
  } else if (kind === "spider") {
    // a cluster of glowing eyes, the two big ones low
    const E: [number, number, number][] = R ? [[1.3, -0.1, 0.42], [0.6, -0.9, 0.26], [1.6, -0.9, 0.24], [0.2, -0.2, 0.2]]
      : [[-0.7, 0, 0.45], [0.7, 0, 0.45], [-1.4, -0.7, 0.26], [1.4, -0.7, 0.26], [-0.6, -1.1, 0.22], [0.6, -1.1, 0.22], [-1.7, 0.2, 0.18], [1.7, 0.2, 0.18]];
    for (const [ex, ey, er] of E) eye((R ? hx : qx) + ex, hy + ey, er);
    // fangs (chelicerae) with red tips
    const fang = (x: number, y: number, sg: number) => { limb(c, [x, y], [x + sg * 0.25, y + 1.2], 0.55, 0.3, C(0x3a3036)); fillShape(c, ellipseP(x + sg * 0.3, y + 1.35, 0.18, 0.25), css(C(0x8a1a12))); };
    if (R) fang(hx + 1.6, hy + 1.2, 1); else { fang(qx - 0.6, hy + 1.5, -1); fang(qx + 0.6, hy + 1.5, 1); }
    // silk threads stuck to the head
    for (let k = 0; k < 4; k++) line(c, [[hx - 2 + k * 1.2, hy - 1.8 + (k % 2) * 0.4], [hx - 1.4 + k * 1.1, hy + 1.8]], 0xd0ccc0, 0.07, 0.45);
  } else if (kind === "bat") {
    muzzle(0.8, 0.95, 0.75, 0.5);
    const t = tip(0.8, 0.5);
    fillShape(c, poly(R ? [[t[0] - 0.2, t[1] - 0.8], [t[0] + 0.4, t[1] - 0.2], [t[0] - 0.1, t[1] + 0.1]] : [[qx - 0.45, hy + 1.2], [qx, hy + 0.4], [qx + 0.45, hy + 1.2]]), css(C(B.nose))); // nose leaf
    const fy = R ? t[1] + 0.6 : hy + 2.0;
    for (const sg of R ? [0] : [-1, 1]) fillShape(c, poly([[(R ? t[0] - 0.6 : qx + sg * 0.5) - 0.18, fy], [(R ? t[0] - 0.6 : qx + sg * 0.5) + 0.18, fy], [(R ? t[0] - 0.6 : qx + sg * 0.5), fy + 0.8]]), css(C(0xf0e8d8)));
    if (R) eye(hx + 0.8, hy - 0.4, 0.3); else { eye(qx - 0.85, hy - 0.3, 0.3); eye(qx + 0.85, hy - 0.3, 0.3); }
  } else if (kind === "wolf") {
    muzzle(2.4, 1.15, 1.2, 0.35);
    const t = tip(2.4, 0.35);
    nose(t[0] + (R ? 0.15 : 0), t[1] - (R ? 0.35 : 0.5), R ? 0.42 : 0.55, 0.38);
    // bared fangs
    if (R) { line(c, [[hx + 1.0, t[1] + 0.7], [t[0], t[1] + 0.5]], 0x2a1414, 0.18); for (const x of [t[0] - 0.5, hx + 1.6]) fillShape(c, poly([[x - 0.15, t[1] + 0.5], [x + 0.15, t[1] + 0.5], [x, t[1] + 1.2]]), css(C(0xf0e8d8))); }
    else { line(c, [[qx - 0.8, hy + 2.0], [qx + 0.8, hy + 2.0]], 0x2a1414, 0.2); for (const sg of [-1, 1]) fillShape(c, poly([[qx + sg * 0.55 - 0.15, hy + 2.0], [qx + sg * 0.55 + 0.15, hy + 2.0], [qx + sg * 0.55, hy + 2.75]]), css(C(0xf0e8d8))); }
    if (R) eye(hx + 0.8, hy - 0.6, 0.28); else { eye(qx - 0.85, hy - 0.5, 0.27); eye(qx + 0.85, hy - 0.5, 0.27); }
    // an old scar over one eye
    line(c, [[(R ? hx + 0.4 : qx + 0.5), hy - 1.6], [(R ? hx + 1.2 : qx + 1.2), hy + 0.2]], 0xc8b8a8, 0.12, 0.7);
  } else if (kind === "bull") {
    muzzle(1.4, 1.6, 1.15, 0.55);
    const t = tip(1.4, 0.55);
    if (R) fillShape(c, ellipseP(t[0], t[1] - 0.1, 0.3, 0.3), css(0x1a1210));
    else { fillShape(c, ellipseP(qx - 0.55, hy + 1.6, 0.2, 0.26), css(0x1a1210)); fillShape(c, ellipseP(qx + 0.55, hy + 1.6, 0.2, 0.26), css(0x1a1210)); }
    // brass ring through the nose
    c.beginPath(); c.arc(R ? t[0] - 0.1 : qx, (R ? t[1] : hy + 1.75) + 0.5, 0.55, 0, Math.PI); c.strokeStyle = css(C(0xc9a050)); c.lineWidth = 0.22; c.stroke();
    if (R) eye(hx + 0.7, hy - 0.6, 0.27); else { eye(qx - 1.15, hy - 0.4, 0.27); eye(qx + 1.15, hy - 0.4, 0.27); }
    // a heavy brow
    line(c, R ? [[hx + 0.1, hy - 1.0], [hx + 1.4, hy - 0.8]] : [[qx - 1.8, hy - 1.0], [qx + 1.8, hy - 1.0]], sh(fur, 0.5), 0.35, 0.9);
  } else if (kind === "crow") {
    // a long, hooked beak: dark horn with a pale ridge
    const beak = R ? poly([[hx + 0.9, hy - 0.6], [hx + 4.4, hy + 0.5], [hx + 4.0, hy + 1.0], [hx + 0.9, hy + 1.1]]) : poly([[qx - 0.9, hy + 0.1], [qx + 0.9, hy + 0.1], [qx + 0.15, hy + 3.4], [qx - 0.15, hy + 3.4]]);
    vol(c, beak, C(B.muz), R ? [hx + 0.9, hy - 0.6, 3.6, 1.8] : [qx - 0.9, hy, 1.8, 3.4], { ao: 0.25, spec: 0.4 });
    line(c, R ? [[hx + 1.0, hy - 0.4], [hx + 4.2, hy + 0.55]] : [[qx, hy + 0.2], [qx, hy + 3.2]], 0x8a8690, 0.12, 0.8);
    if (R) eye(hx + 0.5, hy - 0.5, 0.3); else { eye(qx - 1.0, hy - 0.4, 0.3); eye(qx + 1.0, hy - 0.4, 0.3); }
  } else if (kind === "camel") {
    // a long, soft muzzle with a split, drooping upper lip; slit nostrils; heavy-lidded eyes; a shaggy tuft on the crown
    muzzle(3.0, 1.15, 1.35, 0.9);
    const t = tip(3.0, 0.9);
    if (R) { line(c, [[t[0] - 0.4, t[1] - 0.6], [t[0], t[1] - 0.2]], 0x3a2214, 0.18); curve(c, [hx + 2.0, t[1] + 0.9], [t[0] - 0.2, t[1] + 1.4], [t[0] + 0.1, t[1] + 0.6], 0x5a3a24, 0.2); }
    else {
      for (const sg of [-1, 1]) line(c, [[qx + sg * 0.35, hy + 2.6], [qx + sg * 0.6, hy + 2.2]], 0x3a2214, 0.16);
      line(c, [[qx, hy + 2.8], [qx, hy + 3.3]], 0x5a3a24, 0.14); curve(c, [qx - 0.8, hy + 3.3], [qx, hy + 3.6], [qx + 0.8, hy + 3.3], 0x5a3a24, 0.18);
    }
    if (R) eye(hx + 0.4, hy - 0.6, 0.24); else { eye(qx - 0.95, hy - 0.5, 0.24); eye(qx + 0.95, hy - 0.5, 0.24); }
    line(c, R ? [[hx - 0.1, hy - 0.95], [hx + 0.9, hy - 0.85]] : [[qx - 1.4, hy - 0.85], [qx - 0.5, hy - 0.85]], sh(fur, 0.55), 0.3, 0.9); // drooping lids
    if (!R) line(c, [[qx + 0.5, hy - 0.85], [qx + 1.4, hy - 0.85]], sh(fur, 0.55), 0.3, 0.9);
    for (let k = -2; k <= 2; k++) { const x = (R ? hx - 0.6 : hx) + k * 0.4, y = hy - B.ry + 0.2; line(c, [[x, y + 0.5], [x + k * 0.15 - (R ? 0.3 : 0), y - 0.6]], sh(fur, 0.7), 0.26, 0.9); }
  } else if (kind === "lion") {
    // a broad, short muzzle, a dark T of nose, fangs, golden eyes ringed in kohl drawn out to the temples
    muzzle(1.3, 1.25, 1.05, 0.5);
    const t = tip(1.3, 0.5);
    if (R) { fillShape(c, poly([[t[0] - 0.45, t[1] - 0.6], [t[0] + 0.15, t[1] - 0.5], [t[0], t[1] - 0.05]]), css(C(B.nose))); line(c, [[hx + 1.1, t[1] + 0.65], [t[0] - 0.1, t[1] + 0.55]], 0x2a1410, 0.18); fillShape(c, poly([[t[0] - 0.6, t[1] + 0.55], [t[0] - 0.3, t[1] + 0.55], [t[0] - 0.45, t[1] + 1.15]]), css(C(0xf0e8d8))); }
    else {
      fillShape(c, poly([[qx - 0.6, hy + 1.1], [qx + 0.6, hy + 1.1], [qx, hy + 1.75]]), css(C(B.nose)));
      line(c, [[qx, hy + 1.7], [qx, hy + 2.1]], 0x2a1410, 0.14); curve(c, [qx - 0.85, hy + 2.05], [qx, hy + 2.45], [qx + 0.85, hy + 2.05], 0x2a1410, 0.16);
      for (const sg of [-1, 1]) {
        fillShape(c, poly([[qx + sg * 0.5 - 0.13, hy + 2.15], [qx + sg * 0.5 + 0.13, hy + 2.15], [qx + sg * 0.5, hy + 2.75]]), css(C(0xf0e8d8)));
        for (let k = 0; k < 3; k++) fillShape(c, ellipseP(qx + sg * (0.55 + k * 0.32), hy + 1.65 + (k % 2) * 0.22, 0.07, 0.07), css(C(0x6a4220)));
      }
    }
    const kohl = (x: number, y: number, sg: number) => line(c, [[x - sg * 0.45, y - 0.3], [x + sg * 0.8, y - 0.3], [x + sg * 1.2, y + 0.15]], 0x1a1210, 0.2, 0.95);
    if (R) { eye(hx + 0.7, hy - 0.3, 0.36); kohl(hx + 0.7, hy - 0.3, -1); }
    else for (const sg of [-1, 1]) { eye(qx + sg * 1.0, hy - 0.2, 0.36); kohl(qx + sg * 1.0, hy - 0.2, sg); }
  } else if (kind === "mole") {
    // a long pale snout ending in a pink star of feelers; eyes are specks buried in the fur
    muzzle(3.0, 1.0, 1.2, 0.6);
    const t = tip(3.0, 0.6);
    const sx0 = R ? t[0] + 0.5 : qx, sy0 = R ? t[1] - 0.1 : hy + 1.8;
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; line(c, [[sx0, sy0], [sx0 + Math.cos(a) * (R ? 0.9 : 1.2), sy0 + Math.sin(a) * 0.9]], 0xe8aaa4, 0.2, 0.95); }
    fillShape(c, ellipseP(sx0, sy0, 0.45, 0.4), css(C(B.nose)));
    // two chisel incisors under it
    if (!R) for (const sg of [-1, 1]) fillShape(c, poly([[qx + sg * 0.4 - 0.25, hy + 3.2], [qx + sg * 0.4 + 0.25, hy + 3.2], [qx + sg * 0.4, hy + 4.0]]), css(C(ivory)));
    else fillShape(c, poly([[t[0] - 0.6, t[1] + 0.9], [t[0] - 0.1, t[1] + 0.9], [t[0] - 0.3, t[1] + 1.7]]), css(C(ivory)));
    const sp = (x: number, y: number) => { fillShape(c, ellipseP(x, y, 0.2, 0.2), css(0x0c0806)); fillShape(c, ellipseP(x + 0.05, y - 0.05, 0.07, 0.07), css(C(eyeC))); };
    if (R) sp(hx + 0.9, hy - 0.4); else { sp(qx - 1.0, hy - 0.3); sp(qx + 1.0, hy - 0.3); }
  } else if (kind === "hyena") {
    // a heavy, dark muzzle drawn back in a wide grin, big teeth, a pale chin, bright amber eyes
    muzzle(2.2, 1.3, 1.25, 0.4);
    const t = tip(2.2, 0.4);
    nose(t[0] + (R ? 0.2 : 0), t[1] - (R ? 0.35 : 0.55), R ? 0.45 : 0.6, 0.4);
    if (R) {
      line(c, [[hx + 0.2, t[1] + 0.6], [t[0], t[1] + 0.5]], 0x1a0c08, 0.26);
      for (const x of [t[0] - 0.4, t[0] - 1.2, hx + 0.8]) fillShape(c, poly([[x - 0.18, t[1] + 0.5], [x + 0.18, t[1] + 0.5], [x, t[1] + 1.3]]), css(C(0xf0e8d8)));
    } else {
      curve(c, [qx - 1.4, hy + 1.9], [qx, hy + 3.0], [qx + 1.4, hy + 1.9], 0x1a0c08, 0.26);
      for (const sg of [-1, 0, 1]) fillShape(c, poly([[qx + sg * 0.75 - 0.17, hy + 2.45 - Math.abs(sg) * 0.35], [qx + sg * 0.75 + 0.17, hy + 2.45 - Math.abs(sg) * 0.35], [qx + sg * 0.75, hy + 3.2 - Math.abs(sg) * 0.3]]), css(C(0xf0e8d8)));
    }
    if (R) eye(hx + 0.7, hy - 0.6, 0.3); else { eye(qx - 0.95, hy - 0.5, 0.3); eye(qx + 0.95, hy - 0.5, 0.3); }
  } else if (kind === "stag") {
    // a long, narrow muzzle with a dark wet nose, large dark eyes set wide
    muzzle(2.8, 1.0, 1.3, 0.7);
    const t = tip(2.8, 0.7);
    nose(t[0] + (R ? 0.2 : 0), t[1] - (R ? 0.2 : 0.3), R ? 0.45 : 0.65, 0.42);
    if (R) line(c, [[hx + 1.2, t[1] + 0.6], [t[0], t[1] + 0.5]], 0x2a1a12, 0.16);
    else line(c, [[qx, hy + 2.4], [qx, hy + 3.2]], 0x2a1a12, 0.14);
    if (R) eye(hx + 0.4, hy - 0.5, 0.3); else { eye(qx - 1.15, hy - 0.4, 0.3); eye(qx + 1.15, hy - 0.4, 0.3); }
    line(c, R ? [[hx + 0.1, hy + 0.9], [hx + 1.3, hy + 0.7]] : [[qx - 1.6, hy + 0.7], [qx - 0.8, hy + 0.9]], 0x2a1a12, 0.12, 0.6); // tear-track
  } else if (kind === "quill") {
    // a blunt, bulbous snout with a big dark nose, whiskers, small bright eyes under a bristling brow
    muzzle(1.4, 1.15, 1.0, 0.4);
    const t = tip(1.4, 0.4);
    if (R) fillShape(c, ellipseP(t[0] + 0.1, t[1] - 0.1, 0.5, 0.55), css(C(B.nose)));
    else nose(qx, hy + 1.5, 0.8, 0.55);
    if (R) fillShape(c, poly([[t[0] - 0.5, t[1] + 0.6], [t[0] - 0.1, t[1] + 0.6], [t[0] - 0.3, t[1] + 1.6]]), css(C(0xe8d070)));
    else for (const sg of [-1, 1]) fillShape(c, poly([[qx + sg * 0.3 - 0.25, hy + 2.4], [qx + sg * 0.3 + 0.25, hy + 2.4], [qx + sg * 0.3, hy + 3.4]]), css(C(0xe8d070)));
    for (const sg of R ? [1] : [-1, 1]) for (let k = 0; k < 3; k++) line(c, [[(R ? t[0] : qx) + sg * 0.5, hy + 1.6], [(R ? t[0] : qx) + sg * 2.2, hy + 0.9 + k * 0.7]], 0xe8dfc4, 0.06, 0.7);
    if (R) eye(hx + 0.6, hy - 0.5, 0.28); else { eye(qx - 0.95, hy - 0.4, 0.27); eye(qx + 0.95, hy - 0.4, 0.27); }
  } else if (kind === "bear") {
    muzzle(1.7, 1.4, 1.15, 0.45);
    const t = tip(1.7, 0.45);
    nose(t[0] + (R ? 0.1 : 0), t[1] - (R ? 0.3 : 0.55), R ? 0.45 : 0.7, 0.45);
    if (R) line(c, [[hx + 1.0, t[1] + 0.7], [t[0], t[1] + 0.55]], 0x2a1414, 0.2);
    else { line(c, [[qx, hy + 1.3], [qx, hy + 1.9]], 0x2a1414, 0.14); curve(c, [qx - 0.8, hy + 2.0], [qx, hy + 2.4], [qx + 0.8, hy + 2.0], 0x2a1414, 0.18); }
    if (R) eye(hx + 0.6, hy - 0.6, 0.25); else { eye(qx - 1.0, hy - 0.5, 0.24); eye(qx + 1.0, hy - 0.5, 0.24); }
    // a brow band of finger bones and teeth: the Hide-Mother's crown
    for (let k = -3; k <= 3; k++) {
      if (R && k < -1) continue;
      const x = (R ? hx + 0.2 : qx) + k * 0.62, y = hy - B.ry + 0.55 + Math.abs(k) * 0.12;
      limb(c, [x, y + 0.2], [x + k * 0.05, y - 0.9 - (k % 2 ? 0 : 0.4)], 0.32, 0.22, C(ivory));
    }
    line(c, R ? [[hx - 1.4, hy - 1.7], [hx + 2.0, hy - 1.6]] : [[qx - 2.2, hy - 1.75], [qx + 2.2, hy - 1.75]], 0x5a1a12, 0.3, 0.95);
  }
}

function headGear(r: Rig): HeadGear | "crown" {
  if (gear?.slot === "hat") return gear.style === "crown" ? "crown" : gear.style === "helm" ? "helm" : "cap";
  return r.L.head;
}

function head(c: C2, r: Rig) {
  const L = r.L, [hx, hy] = r.head, dir = r.dir, skin = C(L.skin);
  const hg = r.L.head, worn = headGear(r);
  const covered = hg === "greathelm" || hg === "ninjahood";
  if (L.skull) { skull(c, r); if (worn !== "none") hat(c, r, worn); if ((L.boneArmour ?? 0) >= 4) boneCrown(c, r); return; }
  if (L.beast && !L.beastHood) { // the animal head reads bigger than a man's: it is what you see of them
    const k = L.beast === "bull" || L.beast === "bear" || L.beast === "lion" ? 1.4 : L.beast === "stag" ? 1.15 : 1.3;
    c.save(); c.translate(r.head[0], r.head[1] + 1.4); c.scale(k, k); c.translate(-r.head[0], -r.head[1] - 1.4);
    beastHead(c, r); c.restore(); return;
  }
  // neck
  if (!covered) limb(c, [r.cx + (r.R ? 0.2 : 0), r.sy - 0.9], [hx, hy + 1.6], 1.6, 1.5, sh(skin, 0.75));
  // long hair behind the head
  if (!covered && L.hairStyle === "long" && L.hair !== undefined) {
    const hc = C(L.hair);
    const s = r.R ? blobPath([[hx - 2.4, hy - 1.5], [hx + 0.6, hy - 2.6], [hx - 0.4, hy + 2], [hx - 1.6, r.sy + 2.6], [hx - 3.0, r.sy + 2.2], [hx - 2.9, hy + 1]])
      : dir === "up" ? blobPath([[hx - 2.6, hy - 1.2], [hx + 2.6, hy - 1.2], [hx + 2.9, r.sy + 1.4], [hx + 1.6, r.sy + 2.6], [hx - 1.6, r.sy + 2.6], [hx - 2.9, r.sy + 1.4]])
      // facing us: two locks falling beside the face onto the shoulders
      : (cc: C2) => { for (const sg of [-1, 1]) blobPath([[hx + sg * 1.6, hy - 1.4], [hx + sg * 2.7, hy - 0.8], [hx + sg * 3.0, r.sy + 1.6], [hx + sg * 2.2, r.sy + 2.3], [hx + sg * 1.6, hy + 1.6]])(cc); };
    vol(c, s, dir === "up" ? hc : sh(hc, 0.7), [hx - 3, hy - 2, 6, r.sy - hy + 5], { ao: 0.3 });
    grain(c, s, [hx - 3, hy - 2, 6, r.sy - hy + 5], hc, r.seed + 31, 40, 0.35, 1.2, 1.5);
  }
  // skull / face
  const fx = r.R ? hx - 0.2 : hx;
  const face = ellipseP(fx, hy, 2.3, 2.62);
  vol(c, face, skin, [fx - 2.3, hy - 2.6, 4.6, 5.2], { ao: 0.32, hi: 1.25 });
  if (r.R) {
    // nose, chin, ear
    fillShape(c, blobPath([[hx + 1.7, hy - 0.3], [hx + 2.65, hy + 0.85], [hx + 1.8, hy + 1.1]]), css(sh(skin, 0.95)));
    fillShape(c, ellipseP(hx + 1.2, hy + 2.0, 1.0, 0.6), css(sh(skin, 0.9)));
    vol(c, ellipseP(hx - 0.6, hy + 0.4, 0.55, 0.75), sh(skin, 0.85), [hx - 1.2, hy - 0.4, 1.2, 1.6], { ao: 0.3 });
  }
  const fo = r.fo, qx = hx + fo; // 3/4 view: features slide toward the facing side
  if (r.diag && !covered) {
    // ear on the side we now see (left for down-right, right for the back view)
    const ex = r.diag > 0 ? hx - 2.05 : hx + 2.05;
    vol(c, ellipseP(ex, hy + 0.4, 0.5, 0.75), sh(skin, 0.85), [ex - 0.6, hy - 0.4, 1.2, 1.6], { ao: 0.3 });
  }
  if (dir === "down" && !covered) {
    eyesFront(c, r, qx, hy, fo ? [qx - 0.8, qx + 0.85] : [hx - 0.95, hx + 0.95]);
    line(c, [[qx + 0.12 + fo * 0.4, hy + 0.5], [qx + 0.28 + fo * 0.5, hy + 1.25], [qx - 0.05, hy + 1.35]], sh(skin, 0.6), 0.18, 0.7);
    if (!L.beard || L.beardStyle === "stubble") {
      if (r.p.expr === "happy") curve(c, [qx - 0.6, hy + 1.75], [qx, hy + 2.25], [qx + 0.6, hy + 1.75], sh(skin, 0.4), 0.2);
      else if (L.lips !== undefined) { fillShape(c, ellipseP(qx + 0.1, hy + 1.85, 0.62, 0.3), css(C(L.lips))); line(c, [[qx - 0.4, hy + 1.85], [qx + 0.65, hy + 1.75]], sh(L.lips, 0.55), 0.14, 0.9); }
      else line(c, [[qx - 0.45, hy + 1.85], [qx + 0.45, hy + 1.85]], sh(skin, 0.5), 0.2, 0.8);
    }
  } else if (r.R && !covered) {
    const ey = hy + 0.25, ex = hx + 1.25, col = L.eye ?? 0x1a1010;
    if (r.p.expr === "n" || r.p.expr === "squint") { fillShape(c, ellipseP(ex, ey, 0.3, 0.3), css(col)); }
    else if (r.p.expr === "x") { line(c, [[ex - 0.35, ey - 0.35], [ex + 0.35, ey + 0.35]], col, 0.2); line(c, [[ex + 0.35, ey - 0.35], [ex - 0.35, ey + 0.35]], col, 0.2); }
    else if (r.p.expr === "happy") curve(c, [ex - 0.4, ey + 0.2], [ex, ey - 0.4], [ex + 0.4, ey + 0.2], col, 0.2);
    else line(c, [[ex - 0.35, ey + 0.1], [ex + 0.35, ey + 0.1]], col, 0.2);
    line(c, [[ex - 0.5, ey - 0.6], [ex + 0.5, ey - 0.55]], sh(L.hair ?? skin, 0.45), 0.2, 0.8);
  }
  if (L.eyeGlow !== undefined && !covered && dir !== "up") { // the cold light of the barrow dead behind a living face
    if (!r.R) for (const sg of [-1, 1]) curve(c, [qx + sg * 1.9, hy + 0.5], [qx + sg * 1.5, hy + 1.6], [qx + sg * 0.7, hy + 2.3], sh(skin, 0.55), 0.35, 0.7); // hollow cheeks
    for (const [x, y] of (r.R ? [[hx + 1.25, hy + 0.25]] : (fo ? [qx - 0.8, qx + 0.85] : [hx - 0.95, hx + 0.95]).map((v) => [v, hy + 0.25])) as P[]) {
      fillShape(c, ellipseP(x, y, 0.78, 0.62), css(0x0a1014, 0.85)); // sunken socket
      glow(c, x, y, 1.05, L.eyeGlow, 0.7); fillShape(c, ellipseP(x, y, 0.4, 0.26), css(mix(L.eyeGlow, 0xffffff, 0.8)));
    }
  }
  if (L.faceMask !== undefined && dir !== "up") { // a beaten gold funeral mask: calm brow, slit eyes, a long nose, a closed mouth
    const g = C(L.faceMask), mx = r.R ? hx + 0.5 : qx;
    const m = r.R ? blobPath([[hx - 0.5, hy - 2.5], [hx + 2.1, hy - 2.1], [hx + 2.7, hy + 0.9], [hx + 1.4, hy + 2.9], [hx - 0.4, hy + 2.6]])
      : blobPath([[mx - 2.4, hy - 2.2], [mx, hy - 2.9], [mx + 2.4, hy - 2.2], [mx + 2.3, hy + 0.9], [mx + 1.2, hy + 2.7], [mx, hy + 3.1], [mx - 1.2, hy + 2.7], [mx - 2.3, hy + 0.9]]);
    vol(c, m, g, [mx - 2.4, hy - 2.9, 4.8, 6], { hi: 1.35, ao: 0.3, spec: 0.6 });
    line(c, [[mx - 1.9, hy - 0.9], [mx - 0.5, hy - 0.5]], sh(g, 0.55), 0.28, 0.9); line(c, [[mx + 1.9, hy - 0.9], [mx + 0.5, hy - 0.5]], sh(g, 0.55), 0.28, 0.9);
    for (const x of r.R ? [hx + 1.35] : [mx - 1.0, mx + 1.0]) { fillShape(c, ellipseP(x, hy + 0.1, 0.55, 0.2), css(0x0a0c10)); glow(c, x, hy + 0.1, 1.2, L.eyeGlow ?? 0x9fe4ff, 0.7); }
    line(c, [[mx + (r.R ? 0.9 : 0), hy + 0.2], [mx + (r.R ? 1.4 : 0.1), hy + 1.5]], sh(g, 0.5), 0.2, 0.8);
    line(c, [[mx - 0.7 + (r.R ? 0.9 : 0), hy + 2.0], [mx + 0.7 + (r.R ? 0.9 : 0), hy + 2.0]], sh(g, 0.5), 0.2, 0.9);
    line(c, [[mx - 1.8, hy - 2.1], [mx - 1.0, hy + 2.0]], sh(g, 1.5), 0.18, 0.5);
  }
  if (L.mask !== undefined && dir !== "up") {
    const mc = C(L.mask);
    const m = r.R ? blobPath([[hx - 0.4, hy + 0.7], [hx + 2.8, hy + 0.6], [hx + 2.2, hy + 2.6], [hx + 0.2, hy + 2.9]])
      : blobPath([[qx - 2.4 + fo * 0.5, hy + 0.6], [qx + 2.4 - fo, hy + 0.6], [qx + 2.0 - fo, hy + 2.4], [qx, hy + 3.1], [qx - 2.0 + fo * 0.5, hy + 2.4]]);
    vol(c, m, mc, [hx - 2.4, hy + 0.5, 4.8, 2.7], { ao: 0.3 });
    curve(c, [hx - 1.4, hy + 1.6], [hx, hy + 2.2], [hx + 1.4, hy + 1.6], sh(mc, 0.6), 0.18, 0.7);
  }
  // hair on top
  if (!covered && L.hair !== undefined && L.hairStyle !== "bald" && L.hairStyle !== "none") {
    const hc = C(L.hair);
    let s: Shape;
    if (dir === "up") s = ellipseP(hx, hy - 0.1, 2.45, 2.75);
    else if (r.R) s = blobPath([[hx - 2.6, hy + 0.9], [hx - 2.5, hy - 2.4], [hx + 0.2, hy - 3.1], [hx + 2.2, hy - 1.6], [hx + 1.2, hy - 1.3], [hx - 0.2, hy - 0.8], [hx - 1.0, hy + 1.4]]);
    else s = blobPath([[hx - 2.55, hy + 0.8], [hx - 2.45, hy - 2.3], [hx, hy - 3.05], [hx + 2.45, hy - 2.3], [hx + 2.55, hy + 0.8], [hx + 1.8, hy - 1.0], [hx, hy - 1.5], [hx - 1.8, hy - 1.0]]);
    vol(c, s, hc, [hx - 2.6, hy - 3, 5.2, 4.5], { ao: 0.25, spec: 0.25 });
    grain(c, s, [hx - 2.6, hy - 3, 5.2, 5.5], hc, r.seed + 33, 40, 0.4, 0.9, 1.3);
    if (L.hairStyle === "ponytail") {
      const sw = Math.sin(r.p.t * 1.4) * 0.5;
      const a: P = r.R ? [hx - 2.1, hy - 0.8] : [hx, hy - 0.6];
      if (dir !== "down") limb(c, a, [a[0] - (r.R ? 1.6 + sw : sw * 0.6), r.sy + 1.6], 1.3, 0.6, hc);
      if (dir !== "down") fillShape(c, ellipseP(a[0], a[1], 0.6, 0.45), css(C(0x6b4423)));
    }
  } else if (!covered && L.hairStyle === "bald") {
    glow(c, hx - 0.9, hy - 1.7, 1.0, 0xfff4e0, 0.35);
  }
  // beard
  if (!covered && L.beard !== undefined && dir !== "up") {
    const bc = C(L.beard);
    if (L.beardStyle === "stubble") clipTo(c, face, () => fillShape(c, ellipseP(hx + (r.R ? 0.9 : 0), hy + 2.0, r.R ? 1.6 : 2.0, 1.2), css(bc, 0.3)));
    else {
      const long = L.beardStyle === "long";
      const bottom = long ? r.sy + 3.6 : hy + 3.4;
      const s = r.R ? blobPath([[hx - 0.6, hy + 0.3], [hx + 2.0, hy + 0.9], [hx + 1.9, hy + 2.2], [hx + 0.9 + (long ? 0.5 : 0), bottom], [hx - 0.3, hy + 2.6]])
        : blobPath([[qx - 2.25 + fo * 0.4, hy + 0.7], [qx - 1.0, hy + 1.7], [qx + 1.0, hy + 1.7], [qx + 2.25 - fo, hy + 0.7], [qx + 1.9 - fo, hy + 2.6], [qx + (long ? 0.3 : 0.9), bottom], [qx - (long ? 0.3 : 0.9), bottom], [qx - 1.9 + fo * 0.4, hy + 2.6]]);
      vol(c, s, bc, [hx - 2.3, hy, 4.6, bottom - hy], { ao: 0.25 });
      grain(c, s, [hx - 2.3, hy, 4.6, bottom - hy], bc, r.seed + 35, 45, 0.45, 0.9, 1.5);
      if (dir === "down") { line(c, [[qx - 0.7, hy + 1.45], [qx + 0.7, hy + 1.45]], sh(bc, 0.4), 0.3, 0.9); curve(c, [qx - 1.4, hy + 1.2], [qx, hy + 0.85], [qx + 1.4, hy + 1.2], sh(bc, 0.85), 0.45); }
    }
  }
  if (L.beast && L.beastHood) { // the animal's flayed head worn as a hood over a man's face
    c.save(); c.translate(r.head[0], r.head[1] - 2.3); c.scale(0.95, 0.95); c.translate(-r.head[0], -r.head[1]);
    beastHead(c, r, true); c.restore();
  }
  if (worn !== "none") hat(c, r, worn);
  if (L.torc !== undefined) torc(c, r);
  if (L.reeds !== undefined) reeds(c, r);
}

/** Bog reeds and a few sundew sprigs tucked in the hair (Look.reeds), swaying a little. */
function reeds(c: C2, r: Rig) {
  const [hx, hy] = r.head, col = C(r.L.reeds!), sw = Math.sin(r.p.t * 0.9) * 0.3, back = r.R ? -1 : 0;
  for (const [dx, h, a] of [[-1.6, 5.0, -0.5], [-0.4, 6.2, 0.1], [1.2, 4.6, 0.6]] as number[][]) {
    const b: P = [hx + dx + back * 0.6, hy - 2.4], tip: P = [b[0] + a * 1.8 + sw, b[1] - h];
    curve(c, b, [b[0] + a * 0.4, b[1] - h * 0.6], tip, sh(col, 0.8), 0.3, 1);
    fillShape(c, ellipseP(tip[0], tip[1] + 0.5, 0.35, 0.9, a * 0.4), css(sh(col, 0.55)));
  }
  for (const [dx, dy] of [[-2.2, -0.4], [2.2, -1.2], [-1.0, -2.8]] as P[]) { // sundew: sticky red drops on green sprigs
    fillShape(c, ellipseP(hx + dx + back * 0.5, hy + dy, 0.5, 0.4), css(C(0x5a7a30)));
    glow(c, hx + dx + back * 0.5, hy + dy - 0.3, 0.8, 0xe04a4a, 0.55); fillShape(c, ellipseP(hx + dx + back * 0.5, hy + dy - 0.3, 0.22, 0.22), css(0xff7a6a));
  }
}

/** A bronze neck-ring with ball ends, worn by the barrow dead (Look.torc). */
function torc(c: C2, r: Rig) {
  const col = C(L_TORC(r)), { cx, sy } = r, y = sy - 0.9;
  if (r.dir === "up") { line(c, [[cx - 1.5, y - 0.3], [cx + 1.5, y - 0.3]], sh(col, 0.7), 0.4, 0.9); return; }
  const w = r.R ? 1.2 : 2.1, x0 = cx + (r.R ? 0.4 : 0);
  c.beginPath(); c.moveTo(x0 - w, y - 0.4); c.quadraticCurveTo(x0, y + 1.6, x0 + w, y - 0.4);
  c.strokeStyle = css(sh(col, 0.5)); c.lineWidth = 0.75; c.lineCap = "round"; c.stroke();
  c.beginPath(); c.moveTo(x0 - w, y - 0.4); c.quadraticCurveTo(x0, y + 1.6, x0 + w, y - 0.4);
  c.strokeStyle = css(sh(col, 1.25)); c.lineWidth = 0.4; c.stroke();
  for (const sg of r.R ? [1] : [-1, 1]) metal(c, ellipseP(x0 + sg * w, y - 0.4, 0.5, 0.5), col, [x0 + sg * w - 0.5, y - 0.9], [x0 + sg * w + 0.5, y + 0.1], 0.6);
}
const L_TORC = (r: Rig) => r.L.torc!;

function hat(c: C2, r: Rig, hg: HeadGear | "crown") {
  const L = r.L, [hx, hy] = r.head, dir = r.dir, fo = r.fo, qx = hx + fo;
  const g = gear?.slot === "hat" ? gear : null;
  const col = C(g ? g.color : L.headCol ?? 0x888888), trim = C(g ? g.accent : L.headTrim ?? 0xd9a93a);
  const t = r.p.t;
  switch (hg) {
    case "greathelm": {
      const s = blobPath([[hx - 2.75, hy + 2.9], [hx - 2.85, hy - 1.2], [hx - 2.3, hy - 3.0], [hx, hy - 3.45], [hx + 2.3, hy - 3.0], [hx + 2.85, hy - 1.2], [hx + 2.75, hy + 2.9], [hx, hy + 3.3]]);
      metal(c, s, col, [hx - 2.8, hy - 2], [hx + 2.8, hy + 1.5], 0.8);
      if (dir === "down") {
        fillShape(c, (cc) => cc.rect(hx - 2.2 + fo * 1.2, hy - 0.05, 4.4 - fo * 0.9, 0.5), css(0x0c0a10));
        line(c, [[qx, hy - 3.3], [qx, hy + 3.1]], sh(col, 1.45), 0.35, 0.7);
        for (let k = 0; k < 3; k++) fillShape(c, ellipseP(qx + 0.9, hy + 1.3 + k * 0.5, 0.12, 0.12), css(0x0c0a10));
        line(c, [[hx - 2.7, hy - 1.3], [hx + 2.7, hy - 1.3]], trim, 0.38, 0.9);
      } else if (r.R) {
        fillShape(c, (cc) => cc.rect(hx + 0.4, hy - 0.05, 2.5, 0.5), css(0x0c0a10));
        line(c, [[hx - 2.7, hy - 1.3], [hx + 2.8, hy - 1.3]], trim, 0.38, 0.9);
      } else line(c, [[hx - 2.7, hy - 1.3], [hx + 2.7, hy - 1.3]], trim, 0.38, 0.9);
      // plume: a crest of red feathers
      const pl = C(L.plume ?? 0xc0262f), back = r.R ? -1 : 0, sway = Math.sin(t * 1.2) * 0.3;
      for (let k = 0; k < 7; k++) {
        const a: P = [hx + (r.R ? 0.6 - k * 0.45 : (dir === "up" ? 0 : 0)), hy - 3.3];
        const end: P = r.R ? [hx - 1.2 - k * 0.55 + sway, hy - 4.6 + k * 0.45] : [hx + (k - 3) * 0.35 + sway, hy - 5.3 + Math.abs(k - 3) * 0.3];
        curve(c, a, [end[0] + back, end[1] - 0.7], end, k % 2 ? sh(pl, 1.25) : pl, 0.75 - Math.abs(k - 3) * 0.06, 0.95);
      }
      break;
    }
    case "ninjahood": {
      const s = ellipseP(hx + (r.R ? -0.1 : 0), hy - 0.1, 2.55, 2.85);
      vol(c, s, col, [hx - 2.6, hy - 3, 5.2, 5.8], { ao: 0.35 });
      grain(c, s, [hx - 2.6, hy - 3, 5.2, 5.8], col, r.seed + 51, 25, 0.2, 0.8, 1);
      if (dir === "down") {
        clipTo(c, s, () => vol(c, (cc) => cc.rect(hx - 1.9 + fo * 1.2, hy - 0.45, 3.8 - fo * 0.4, 1.45), C(L.skin), [hx - 2, hy - 0.5, 4, 1.5], { ao: 0.2 }));
        eyesFront(c, r, qx, hy - 0.05, fo ? [qx - 0.8, qx + 0.85] : [hx - 0.9, hx + 0.9]);
      } else if (r.R) {
        clipTo(c, s, () => vol(c, (cc) => cc.rect(hx + 0.5, hy - 0.45, 2.3, 1.45), C(L.skin), [hx + 0.5, hy - 0.5, 2.3, 1.5], { ao: 0.2 }));
        fillShape(c, ellipseP(hx + 1.35, hy + 0.2, 0.28, 0.3), css(L.eye ?? 0x111111));
      }
      // headband + flapping tails
      clipTo(c, s, () => vol(c, (cc) => cc.rect(hx - 3, hy - 1.75, 6, 0.85), trim, [hx - 3, hy - 1.8, 6, 0.9], { ao: 0.15 }));
      const fl = Math.sin(t * 1.7) * 0.6 + (r.p.run ? 0.8 : 0);
      const knot: P = dir === "up" ? [hx, hy - 1.3] : r.R ? [hx - 2.4, hy - 1.3] : [hx + 2.3, hy - 1.5];
      if (dir !== "down" || true) {
        const dx = r.R ? -1 : dir === "up" ? 0.3 : 1;
        limb(c, knot, [knot[0] + dx * (3.2 + fl), knot[1] + 1.6 - fl * 0.4], 0.75, 0.45, sh(trim, 0.9));
        limb(c, knot, [knot[0] + dx * (2.4 + fl * 0.6), knot[1] + 2.9], 0.7, 0.4, sh(trim, 0.75));
        vol(c, ellipseP(knot[0], knot[1], 0.6, 0.5), trim, [knot[0] - 0.6, knot[1] - 0.5, 1.2, 1]);
      }
      break;
    }
    case "wizardhat": case "witch": {
      const witch = hg === "witch";
      const by = hy - 1.6, bw = witch ? 4.0 : 4.3;
      const brim = ellipseP(hx, by, bw, r.R ? 0.85 : 1.2);
      // brim shadow on the face
      if (dir !== "up") clipTo(c, ellipseP(r.R ? hx - 0.2 : hx, hy, 2.3, 2.62), () => fillShape(c, (cc) => cc.rect(hx - 3, hy - 3, 6, 2.6), css(0x100818, 0.45)));
      vol(c, brim, col, [hx - bw, by - 1.2, 2 * bw, 2.4], { ao: 0.35 });
      const sway = Math.sin(t * 0.9) * 0.4, tipX = hx + (r.R ? -2.6 : witch ? 2.2 : -1.8) + sway, tipY = hy - (witch ? 9.6 : 10.2);
      const cone = (cc: C2) => {
        cc.moveTo(hx - 2.3, by + 0.1);
        cc.quadraticCurveTo(hx - 1.6, by - 4.5, tipX - 0.2, tipY + 0.3);
        cc.lineTo(tipX, tipY);
        cc.quadraticCurveTo(hx + 0.9, by - 4.8, hx + 2.3, by + 0.1);
        cc.closePath();
      };
      vol(c, cone, col, [hx - 2.4, tipY, 4.8, by - tipY + 0.5], { ao: 0.35 });
      grain(c, cone, [hx - 2.4, tipY, 4.8, by - tipY], col, r.seed + 61, 30, 0.22, 1.2, -1.4);
      clipTo(c, cone, () => vol(c, (cc) => cc.rect(hx - 3, by - 1.15, 6, 0.95), trim, [hx - 3, by - 1.2, 6, 1], { ao: 0.15 }));
      if (dir !== "up") {
        if (witch) metal(c, (cc) => cc.rect(hx - 0.55, by - 1.2, 1.1, 1.05), 0xd9a93a, [hx - 0.5, by - 1.2], [hx + 0.5, by]);
        else { // little star
          const sx = hx + 0.6, sy2 = by - 3.2;
          fillShape(c, poly([[sx, sy2 - 0.7], [sx + 0.2, sy2 - 0.2], [sx + 0.7, sy2], [sx + 0.2, sy2 + 0.2], [sx, sy2 + 0.7], [sx - 0.2, sy2 + 0.2], [sx - 0.7, sy2], [sx - 0.2, sy2 - 0.2]]), css(0xffe9a0));
        }
      }
      break;
    }
    case "hood": {
      const s = r.R ? blobPath([[hx - 3.2, hy + 3.4], [hx - 3.5, hy - 0.8], [hx - 2.4, hy - 3.2], [hx + 0.4, hy - 3.4], [hx + 2.4, hy - 1.8], [hx + 2.5, hy + 0.2], [hx + 1.3, hy - 1.2], [hx - 0.6, hy - 0.4], [hx - 0.3, hy + 3.4]])
        : dir === "up" ? blobPath([[hx - 3.2, hy + 3.6], [hx - 3.0, hy - 1.4], [hx - 1.4, hy - 3.2], [hx, hy - 3.6], [hx + 1.4, hy - 3.2], [hx + 3.0, hy - 1.4], [hx + 3.2, hy + 3.6], [hx, hy + 4.4]])
        : blobPath([[hx - 3.2, hy + 3.6], [hx - 3.0, hy - 1.4], [hx - 1.4, hy - 3.25], [hx, hy - 3.5], [hx + 1.4, hy - 3.25], [hx + 3.0, hy - 1.4], [hx + 3.2, hy + 3.6], [hx + 1.9, hy + 2.6], [hx + 2.2, hy - 0.4], [hx, hy - 2.1], [hx - 2.2, hy - 0.4], [hx - 1.9, hy + 2.6]]);
      if (dir === "down") clipTo(c, ellipseP(hx, hy, 2.3, 2.62), () => fillShape(c, (cc) => cc.rect(hx - 3, hy - 3, 6, 2.6), css(0x0c140a, 0.5)));
      void qx;
      vol(c, s, col, [hx - 3.4, hy - 3.6, 6.8, 7.5], { ao: 0.4 });
      grain(c, s, [hx - 3.4, hy - 3.6, 6.8, 7.5], col, r.seed + 71, 40, 0.22, 1, 1.2);
      if (dir === "down") curve(c, [hx - 2.1, hy + 2.6], [hx - 2.3, hy - 1.9], [hx, hy - 2.2], sh(col, 1.35), 0.25, 0.6);
      break;
    }
    case "horned": {
      const dome = blobPath([[hx - 2.6, hy - 0.4], [hx - 2.3, hy - 2.4], [hx, hy - 3.35], [hx + 2.3, hy - 2.4], [hx + 2.6, hy - 0.4]]);
      for (const sgn of r.R ? [-0.4, 1] : [-1, 1]) { // horns (in profile one sweeps forward, the other peeks behind)
        const base: P = [hx + sgn * 2.2, hy - 1.6];
        const tip: P = r.R ? [hx + sgn * 3.6, hy - 5.6] : [hx + sgn * 4.6, hy - 5.0];
        const ctl: P = r.R ? [hx + sgn * 4.4, hy - 2.2] : [hx + sgn * 5.0, hy - 1.6];
        const hs: Shape = (cc) => { cc.moveTo(base[0], base[1] - 0.75); cc.quadraticCurveTo(ctl[0], ctl[1] - 0.6, tip[0], tip[1]); cc.quadraticCurveTo(ctl[0] - sgn * 0.6, ctl[1] + 0.9, base[0], base[1] + 0.75); cc.closePath(); };
        vol(c, hs, sgn === -0.4 ? sh(trim, 0.7) : trim, [Math.min(base[0], tip[0]) - 0.5, tip[1], Math.abs(tip[0] - base[0]) + 1.2, base[1] - tip[1] + 1], { ao: 0.2, spec: 0.3 });
        for (let k = 1; k < 4; k++) { const q = k / 4.2, x = base[0] + (tip[0] - base[0]) * q + sgn * 0.6 * Math.sin(q * 3), y = base[1] + (tip[1] - base[1]) * q; line(c, [[x - 0.4, y - 0.3], [x + 0.4, y + 0.3]], sh(trim, 0.6), 0.14, 0.6); }
      }
      metal(c, dome, col, [hx - 2.5, hy - 3], [hx + 2.5, hy], 0.7);
      line(c, [[hx - 2.6, hy - 0.55], [hx + 2.6, hy - 0.55]], sh(col, 0.6), 0.55, 0.9);
      for (let k = -2; k <= 2; k++) fillShape(c, ellipseP(hx + k * 1.0, hy - 0.55, 0.16, 0.16), css(sh(col, 1.5)));
      if (dir === "down") metal(c, (cc) => cc.rect(qx - 0.3, hy - 0.6, 0.6, 2.0), col, [qx - 0.3, hy], [qx + 0.3, hy + 1]);
      break;
    }
    case "kettle": { // a kettle hat: round dome, a wide flat brim all round, rivets, an optional plume
      const brim = ellipseP(hx, hy - 0.45, 3.75, 1.05);
      metal(c, brim, sh(col, 0.85), [hx - 3.7, hy - 1], [hx + 3.7, hy + 0.3], 0.6);
      const dome = blobPath([[hx - 2.55, hy - 0.5], [hx - 2.4, hy - 2.7], [hx, hy - 3.75], [hx + 2.4, hy - 2.7], [hx + 2.55, hy - 0.5]]);
      metal(c, dome, col, [hx - 2.5, hy - 3.2], [hx + 2.5, hy - 0.3], 0.85);
      line(c, [[hx - 2.5, hy - 0.8], [hx + 2.5, hy - 0.8]], sh(col, 0.5), 0.35, 0.9);
      if (dir !== "up") line(c, [[hx - 0.3, hy - 3.6], [hx + (r.R ? 1.1 : 0), hy - 1.0]], sh(col, 1.5), 0.25, 0.6);
      for (let k = -1; k <= 1; k++) fillShape(c, ellipseP(hx + k * 1.5 + (r.R ? 0.3 : 0), hy - 0.45, 0.2, 0.16), css(trim));
      if (L.plume !== undefined) {
        const pl = C(L.plume), back = r.R ? -1 : 0, sway = Math.sin(t * 1.2) * 0.3;
        for (let k = 0; k < 7; k++) {
          const a: P = [hx + (r.R ? 0.4 - k * 0.3 : 0), hy - 3.6];
          const end: P = r.R ? [hx - 1.0 - k * 0.6 + sway, hy - 4.9 + k * 0.5] : [hx + (k - 3) * 0.4 + sway, hy - 5.6 + Math.abs(k - 3) * 0.35];
          curve(c, a, [end[0] + back, end[1] - 0.7], end, k % 2 ? sh(pl, 1.25) : pl, 0.7 - Math.abs(k - 3) * 0.05, 0.95);
        }
      }
      break;
    }
    case "helm": {
      const dome = blobPath([[hx - 2.75, hy - 0.1], [hx - 2.5, hy - 2.5], [hx, hy - 3.5], [hx + 2.5, hy - 2.5], [hx + 2.75, hy - 0.1]]);
      metal(c, dome, col, [hx - 2.6, hy - 3], [hx + 2.6, hy], 0.8);
      line(c, [[hx - 2.9, hy - 0.25], [hx + 2.9, hy - 0.25]], sh(col, 0.55), 0.55, 0.95);
      if (dir === "down") metal(c, (cc) => cc.rect(qx - 0.32, hy - 0.4, 0.64, 2.1), col, [qx - 0.3, hy], [qx + 0.3, hy + 1]);
      if (dir !== "up") line(c, [[hx - 0.2, hy - 3.4], [hx + (r.R ? 1.2 : 0), hy - 0.8]], sh(col, 1.45), 0.25, 0.6);
      if (g) glow(c, hx, hy - 3.5, 0.8, trim, 0.6);
      if (L.plume !== undefined) { // a horsehair crest along the dome (front-to-back from the side, a comb from the front)
        const pl = C(L.plume), sway = Math.sin(t * 1.1) * 0.25;
        if (dir === "down") { const cr = poly([[hx - 0.55, hy - 3.2], [hx - 0.9, hy - 5.1], [hx - 0.3, hy - 5.7 + sway], [hx + 0.3, hy - 5.7 - sway], [hx + 0.9, hy - 5.1], [hx + 0.55, hy - 3.2]]); vol(c, cr, pl, [hx - 1, hy - 5.8, 2, 2.6], { ao: 0.3 }); }
        else { const cr = blobPath([[hx - 2.4, hy - 1.4 + (r.R ? 0 : 0)], [hx - 2.0, hy - 4.6 + sway], [hx - 0.2, hy - 5.7], [hx + 1.8, hy - 4.9], [hx + 2.2, hy - 3.2], [hx + 0.2, hy - 3.6], [hx - 1.4, hy - 2.8]]); vol(c, cr, pl, [hx - 2.4, hy - 5.8, 4.6, 4.4], { ao: 0.3 }); grain(c, cr, [hx - 2.4, hy - 5.8, 4.6, 4.4], pl, 17, 30, 0.4, 0.9, 1.5); }
      }
      break;
    }
    case "cap": {
      const s = blobPath([[hx - 2.7, hy - 0.6], [hx - 2.3, hy - 2.6], [hx + 0.2, hy - 3.4], [hx + 2.4, hy - 2.5], [hx + 2.8, hy - 0.6]]);
      vol(c, s, col, [hx - 2.7, hy - 3.4, 5.5, 3], { ao: 0.3 });
      line(c, [[hx - 2.8, hy - 0.75], [hx + 2.9, hy - 0.75]], sh(col, 0.6), 0.5);
      const fa: P = [hx + (r.R ? -1.6 : 1.7), hy - 2.4], fb: P = [fa[0] + (r.R ? -2.6 : 2.0), fa[1] - 3.0];
      const fs: Shape = (cc) => { cc.moveTo(fa[0], fa[1]); cc.quadraticCurveTo(fa[0] + (fb[0] - fa[0]) * 0.2 + 1, fb[1] + 1, fb[0], fb[1]); cc.quadraticCurveTo(fa[0] + (fb[0] - fa[0]) * 0.6 - 0.8, fa[1] - 0.5, fa[0], fa[1]); cc.closePath(); };
      vol(c, fs, trim, [Math.min(fa[0], fb[0]), fb[1], 3, 3.5], { ao: 0.2 });
      curve(c, fa, [fa[0] + (fb[0] - fa[0]) * 0.4, fb[1] + 1.4], fb, sh(trim, 0.6), 0.12);
      break;
    }
    case "crown": {
      const y0 = hy - 2.2, w = 2.5;
      const s = poly([[hx - w, y0 + 1.2], [hx - w, y0 - 0.9], [hx - w * 0.55, y0 + 0.1], [hx - w * 0.3, y0 - 1.4], [hx, y0 - 0.1], [hx + w * 0.3, y0 - 1.4], [hx + w * 0.55, y0 + 0.1], [hx + w, y0 - 0.9], [hx + w, y0 + 1.2]]);
      metal(c, s, col, [hx - w, y0 - 1.4], [hx + w, y0 + 1.2], 0.9);
      if (dir !== "up") { glow(c, hx, y0 + 0.5, 0.7, trim, 0.9); fillShape(c, ellipseP(hx, y0 + 0.5, 0.35, 0.35), css(trim)); }
      break;
    }
    case "stonecrown": { // a ring of standing-stone shards (the Cairn-Lord)
      const base = hy - 2.0, n = 7;
      for (let k = 0; k < n; k++) {
        const t = (k - (n - 1) / 2) / ((n - 1) / 2), x = hx + t * 2.5 + (r.R ? -0.3 : 0), hgt = (2.6 + ((k * 5) % 3) * 0.9 - Math.abs(t) * 0.9) * 1.0;
        const lean = ((k * 7) % 3 - 1) * 0.35, w = 0.75 + ((k * 3) % 2) * 0.3;
        const sp = poly([[x - w, base + 0.5], [x - w * 0.8 + lean * 0.5, base - hgt * 0.6], [x + lean, base - hgt], [x + w * 0.8 + lean * 0.5, base - hgt * 0.5], [x + w, base + 0.5]]);
        vol(c, sp, k % 2 ? sh(col, 0.85) : col, [x - w, base - hgt, w * 2, hgt + 0.5], { ao: 0.4, spec: 0.15 });
        line(c, [[x - w * 0.3, base - hgt * 0.8], [x - w * 0.4, base]], sh(col, 1.35), 0.14, 0.6);
      }
      metal(c, poly([[hx - 2.7, base + 0.3], [hx + 2.7, base + 0.3], [hx + 2.6, base + 1.1], [hx - 2.6, base + 1.1]]), trim, [hx - 2.7, base], [hx + 2.7, base + 1.2], 0.5);
      break;
    }
    case "bandana": {
      const s = blobPath([[hx - 2.55, hy - 0.5], [hx - 2.3, hy - 2.5], [hx, hy - 3.15], [hx + 2.3, hy - 2.5], [hx + 2.55, hy - 0.5], [hx, hy - 1.2]]);
      vol(c, s, col, [hx - 2.6, hy - 3.2, 5.2, 2.8], { ao: 0.3 });
      for (let k = 0; k < 5; k++) fillShape(c, ellipseP(hx - 1.6 + k * 0.8, hy - 2.0 + (k % 2) * 0.4, 0.18, 0.18), css(sh(col, 1.4), 0.8));
      if (dir !== "down") { const k: P = r.R ? [hx - 2.4, hy - 1.1] : [hx, hy - 1.0]; limb(c, k, [k[0] - (r.R ? 1.3 : 0.4), k[1] + 1.9], 0.8, 0.45, trim); }
      break;
    }
    case "wide": {
      const by = hy - 1.7;
      if (dir !== "up") clipTo(c, ellipseP(r.R ? hx - 0.2 : hx, hy, 2.3, 2.62), () => fillShape(c, (cc) => cc.rect(hx - 3, hy - 3, 6, 2.4), css(0x100818, 0.4)));
      vol(c, ellipseP(hx, by, 4.6, r.R ? 0.9 : 1.35, r.R ? -0.08 : 0), col, [hx - 4.6, by - 1.3, 9.2, 2.6], { ao: 0.35 });
      const crownS = blobPath([[hx - 2.3, by + 0.2], [hx - 2.1, by - 2.6], [hx, by - 3.0], [hx + 2.1, by - 2.6], [hx + 2.3, by + 0.2]]);
      vol(c, crownS, col, [hx - 2.3, by - 3, 4.6, 3.2], { ao: 0.3 });
      clipTo(c, crownS, () => vol(c, (cc) => cc.rect(hx - 3, by - 1.0, 6, 0.85), trim, [hx - 3, by - 1, 6, 0.9]));
      const fa: P = [hx + (r.R ? -1.8 : 1.6), by - 1.0];
      curve(c, fa, [fa[0] + (r.R ? -1.8 : 2.4), fa[1] - 1.8], [fa[0] + (r.R ? -3.0 : 3.2), fa[1] - 0.2], 0xe9e2d0, 0.55, 0.95);
      break;
    }
    default: break;
  }
}

// ---------------------------------------------------------------- weapons
const WOOD = 0x7a4f2a, STEEL = 0xc9d2dc;

function weaponCols(r: Rig) {
  const g = gear?.slot === "weapon" ? gear : null;
  return { blade: g ? g.color : r.L.bladeCol ?? STEEL, accent: g ? g.accent : 0, long: g?.style.startsWith("long") ? 1 + (g.bonus.reach ?? 0) * 0.9 : 1, glowing: !!g && g.style.endsWith("glow"), g };
}

function blade(c: C2, a: P, u: P, n: P, from: number, to: number, w: number, col: number, curveAmt = 0) {
  const pt = (t: number, side: number): P => {
    const k = (t - from) / (to - from), bend = curveAmt * k * k;
    const wd = w * (k > 0.82 ? Math.max(0.05, (1 - k) / 0.18) : 1) * (side < 0 ? 1 : 1);
    return [a[0] + u[0] * t + n[0] * (bend + side * wd / 2), a[1] + u[1] * t + n[1] * (bend + side * wd / 2)];
  };
  const pts: P[] = [];
  for (let i = 0; i <= 8; i++) pts.push(pt(from + (to - from) * i / 8, 1));
  for (let i = 8; i >= 0; i--) pts.push(pt(from + (to - from) * i / 8, -1));
  const s = poly(pts);
  const m: P = [a[0] + u[0] * (from + to) / 2, a[1] + u[1] * (from + to) / 2];
  metal(c, s, col, [m[0] + n[0] * w, m[1] + n[1] * w], [m[0] - n[0] * w, m[1] - n[1] * w], 0);
  line(c, [pt(from + 0.4, 0.15), pt(to - (to - from) * 0.25, 0.15)], sh(col, 1.6), 0.14, 0.8); // edge glint
  return s;
}

function weapon(c: C2, r: Rig) {
  const L = r.L, h = r.nearH, u = r.u, n = r.n;
  if (L.basket !== undefined && L.weapon === "none") { // a woven basket hung from the crook of the arm, herbs spilling over the rim
    const bx = h[0] + (r.R ? 0.6 : 0), by = h[1] + 1.6, wv = C(L.basket);
    line(c, [[bx - 1.6, by - 0.4], [bx, by - 2.2], [bx + 1.6, by - 0.4]], sh(wv, 0.7), 0.3, 1);
    for (const [dx, hh, col] of [[-1.2, 2.2, 0x5a8a3a], [-0.3, 2.8, 0x8a6ab0], [0.7, 2.3, 0x6a9a44], [1.4, 1.9, 0xb8a0d0]] as number[][]) { line(c, [[bx + dx, by + 0.2], [bx + dx * 1.3, by - hh * 0.8]], col, 0.45, 1); fillShape(c, ellipseP(bx + dx * 1.3, by - hh * 0.8, 0.4, 0.4), css(col)); }
    const b = blobPath([[bx - 2.4, by], [bx + 2.4, by], [bx + 1.9, by + 2.3], [bx, by + 2.9], [bx - 1.9, by + 2.3]]);
    vol(c, b, wv, [bx - 2.4, by, 4.8, 3], { ao: 0.4 });
    clipTo(c, b, () => { for (let k = 0; k < 4; k++) line(c, [[bx - 3, by + 0.4 + k * 0.7], [bx + 3, by + 0.4 + k * 0.7]], sh(wv, 0.55), 0.14, 0.8); for (let k = -2; k <= 2; k++) line(c, [[bx + k * 0.9, by], [bx + k * 0.7, by + 3]], sh(wv, 1.3), 0.1, 0.5); });
  }
  const at = (t: number, o = 0): P => [h[0] + u[0] * t + n[0] * o, h[1] + u[1] * t + n[1] * o];
  const W = weaponCols(r);
  const glowAlong = (t0: number, t1: number, col: number) => { for (let t = t0; t <= t1; t += 1.2) glow(c, at(t)[0], at(t)[1], 1.5, col, 0.35); };
  const f = form ? formOf(form.id, L.weapon) : null;
  if (f && form && drawFormWeapon({ c, h, u, n, kind: L.weapon, f, blade: C(form.color), accent: form.accent, long: W.long, attack: r.p.attack, move: r.p.move, C })) return;
  switch (L.weapon) {
    case "sword": {
      const big = L.bladeLen ?? 1, len = 10.5 * W.long * big;
      if (W.glowing) glowAlong(1.5, len, W.accent);
      blade(c, h, u, n, 1.0, len, 1.05 * Math.sqrt(big), W.blade);
      if (big > 1) { line(c, [at(1.6), at(len * 0.8)], sh(W.blade, 0.4), 0.22, 0.9); glowAlong(len * 0.35, len * 0.75, L.fx); } // fuller, and the Gloam's light along it
      line(c, [at(1.3), at(len * 0.75)], sh(W.blade, 0.55), 0.18, 0.8);
      if (L.notched) for (const [t, sd] of [[3.3, 1], [5.5, -1], [7.8, 1], [9.0, -1]]) fillShape(c, poly([at(t - 0.5, sd * 0.75), at(t, sd * 0.1), at(t + 0.5, sd * 0.75)]), css(sh(W.blade, 0.22)));
      metal(c, poly([at(0.75, -1.7), at(0.75, 1.7), at(1.25, 1.7), at(1.25, -1.7)]), C(L.buckle ?? 0xd9a93a), at(0.5, -1.7), at(1.5, 1.7), 0.5);
      limb(c, at(-1.6), at(0.6), 0.6, 0.6, C(0x4a2a14));
      metal(c, ellipseP(at(-1.9)[0], at(-1.9)[1], 0.55, 0.55), C(0xd9a93a), at(-2.3), at(-1.5), 0.5);
      break;
    }
    case "katana": {
      const len = 11.5 * W.long;
      if (W.glowing) glowAlong(1.5, len, W.accent);
      blade(c, h, u, n, 0.9, len, 0.85, W.blade, -0.9);
      line(c, [at(-2.6), at(0.6)], C(0x1a1424), 0.65);
      for (let k = 0; k < 4; k++) line(c, [at(-2.3 + k * 0.75, -0.3), at(-2.0 + k * 0.75, 0.3)], C(0x8a1d2a), 0.18, 0.9);
      metal(c, ellipseP(at(0.75)[0], at(0.75)[1], 0.85, 0.85), C(0xc9a050), at(0.2, -1), at(1.2, 1), 0.4);
      break;
    }
    case "staff": case "druidstaff": case "witchstaff": {
      const len = 13 * W.long, druid = L.weapon !== "staff";
      const wood = C(druid ? 0x5e3d22 : WOOD);
      limb(c, at(-6), at(len), 0.75, 0.65, W.g ? W.blade : wood);
      for (const t of [-2.5, 3, 8]) line(c, [at(t, -0.4), at(t + 0.5, 0.4)], sh(wood, 0.5), 0.18, 0.7);
      const ox = at(len + 2.2);
      const orb = W.g ? W.accent : (L.orb ?? 0x5ee6ff);
      // claws holding the stone
      for (const s of [-1, 1]) curve(c, at(len - 0.3, s * 0.3), at(len + 1.2, s * 1.7), at(len + 3.2, s * 0.9), wood, 0.4);
      if (L.weapon === "druidstaff") for (let k = 0; k < 3; k++) { const lf = at(len - 1 - k * 1.3, (k % 2 ? 1 : -1) * 0.8); fillShape(c, ellipseP(lf[0], lf[1], 0.65, 0.32, Math.atan2(u[1], u[0]) + (k % 2 ? 0.6 : -0.6)), css(C(0x6fae3a))); }
      if (L.lantern !== undefined) { // a little cage-lantern swinging from a hook on the crook
        const sw = Math.sin(r.p.t * 1.1) * 0.5, hk = at(len - 0.6, 1.6), lx = hk[0] + sw, ly = hk[1] + 3.2;
        line(c, [hk, [lx, ly - 1]], 0x2a2418, 0.22, 0.9);
        glow(c, lx, ly, 2.6, L.lantern, 0.6);
        vol(c, (cc) => cc.rect(lx - 0.8, ly - 1, 1.6, 2.2), L.lantern, [lx - 0.8, ly - 1, 1.6, 2.2], { ao: 0.2, hi: 1.7, spec: 0.5 });
        line(c, [[lx - 1.0, ly - 1.1], [lx + 1.0, ly - 1.1]], 0x1e1a12, 0.35, 1); line(c, [[lx - 1.0, ly + 1.25], [lx + 1.0, ly + 1.25]], 0x1e1a12, 0.35, 1);
        line(c, [[lx - 0.8, ly - 1], [lx - 0.8, ly + 1.2]], 0x1e1a12, 0.16, 0.9); line(c, [[lx + 0.8, ly - 1], [lx + 0.8, ly + 1.2]], 0x1e1a12, 0.16, 0.9);
      }
      if (L.lantern !== undefined) vol(c, ellipseP(ox[0], ox[1], 0.9, 1.1), wood, [ox[0] - 1, ox[1] - 1.2, 2, 2.4], { ao: 0.3 }); // a bog-oak knot instead of a stone
      else {
      glow(c, ox[0], ox[1], 3.0, orb, 0.55 + (r.p.attack >= 0 ? 0.25 : 0));
      vol(c, ellipseP(ox[0], ox[1], 1.25, 1.25), orb, [ox[0] - 1.3, ox[1] - 1.3, 2.6, 2.6], { ao: 0.15, hi: 1.6, spec: 0.8 });
      }
      if (W.glowing) glowAlong(-4, len, W.accent);
      break;
    }
    case "lute": drawFormWeapon({ c, h, u, n, kind: "lute", f: {}, blade: 0, accent: 0, long: 1, attack: r.p.attack, C }); break; // art: paint/weaponArt.ts
    case "bow": {
      const ph = r.p.attack, ch = r.p.move === "a3", pull = ph === 0 ? (ch ? 4 : 2) : ph === 1 ? (ch ? 5 : 4) : 0;
      const half = 7.6 * W.long, wood = W.g ? W.blade : C(0x6b4423);
      const pts: P[] = [];
      for (let t = -1; t <= 1.0001; t += 0.125) { const bend = 2.6 * (1 - t * t) - 0.5 * Math.abs(t) ** 3; pts.push(at(bend, t * half)); }
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) c.lineTo(q[0], q[1]);
      c.strokeStyle = css(sh(wood, 0.6)); c.lineWidth = 0.75; c.lineCap = "round"; c.stroke();
      c.strokeStyle = css(wood); c.lineWidth = 0.5; c.stroke();
      c.strokeStyle = css(sh(wood, 1.4), 0.7); c.lineWidth = 0.15; c.stroke();
      const sp = at(-pull * 1.3);
      line(c, [pts[0], sp, pts[pts.length - 1]], 0xeee6d2, 0.12, 0.85);
      limb(c, at(-0.7), at(0.9), 0.8, 0.8, C(0x3e2715)); // grip
      if (ph === 0 || ph === 1) {
        const tip = at(-pull * 1.3 + 11);
        line(c, [sp, tip], C(0xa07a48), 0.22);
        fillShape(c, poly([[tip[0] + u[0] * 0.9, tip[1] + u[1] * 0.9], [tip[0] + n[0] * 0.45, tip[1] + n[1] * 0.45], [tip[0] - n[0] * 0.45, tip[1] - n[1] * 0.45]]), css(STEEL));
        for (const s of [-1, 1]) line(c, [[sp[0] + u[0] * 0.3, sp[1] + u[1] * 0.3], [sp[0] + u[0] * 1.3 + n[0] * s * 0.5, sp[1] + u[1] * 1.3 + n[1] * s * 0.5]], C(0xb5262f), 0.3);
      }
      if (W.glowing) glowAlong(-half * 0.2, half * 0.2, W.accent);
      break;
    }
    case "axe": {
      const len = 10.5 * W.long;
      limb(c, at(-2.8), at(len), 0.75, 0.7, C(WOOD));
      for (const t of [0, 1.2, 2.4]) line(c, [at(t - 0.2, -0.45), at(t + 0.2, 0.45)], C(0x3a2414), 0.25, 0.9);
      const b0 = len - 3.3;
      if (W.glowing) glowAlong(b0, len, W.accent);
      const head = blobPath([at(b0, 0.3), at(b0 - 1.2, 2.2), at(b0 - 1.4, 4.4), at(b0 + 1.7, 4.0), at(b0 + 4.4, 4.6), at(b0 + 3.2, 2.2), at(b0 + 2.6, 0.3)]);
      metal(c, head, W.blade, at(b0, 4.5), at(b0 + 3, 0.5), 0.6);
      curve(c, at(b0 - 1.3, 4.3), at(b0 + 1.6, 3.6), at(b0 + 4.3, 4.5), sh(W.blade, 1.6), 0.3, 0.9);
      fillShape(c, poly([at(b0 + 0.4, -0.3), at(b0 + 1.2, -2.2), at(b0 + 2.0, -0.3)]), css(sh(W.blade, 0.7)));
      break;
    }
    case "pick": { // a digger's pick: a long haft and a curved double-spiked iron head across the end (Hide-Kin)
      const len = 10 * W.long * (L.bladeLen ?? 1);
      limb(c, at(-2.6), at(len), 0.75, 0.7, C(WOOD));
      for (const t of [0, 1.2]) line(c, [at(t - 0.2, -0.45), at(t + 0.2, 0.45)], C(0x3a2414), 0.25, 0.9);
      const iron = W.g ? W.blade : C(0x7a828a);
      for (const sg of [-1, 1]) {
        const head = blobPath([at(len - 0.6, sg * 0.4), at(len - 1.2, sg * 2.4), at(len - 2.8, sg * 4.4), at(len - 0.8, sg * 3.3), at(len + 0.4, sg * 2.4), at(len + 0.7, sg * 0.4)]);
        metal(c, head, sg > 0 ? iron : sh(iron, 0.8), at(len - 1, sg * 4), at(len, 0), 0.6);
      }
      limb(c, at(len - 1.2), at(len + 1.4), 0.9, 0.5, sh(iron, 0.7));
      if (W.glowing) glowAlong(len - 1, len + 1, W.accent);
      break;
    }
    case "hammer": {
      const len = 8.5 * W.long;
      limb(c, at(-2.2), at(len), 0.7, 0.65, C(WOOD));
      const hd = poly([at(len - 0.8, -2.0), at(len - 0.8, 2.0), at(len + 1.6, 2.0), at(len + 1.6, -2.0)]);
      metal(c, hd, W.g ? W.blade : C(0x6f7883), at(len, -2), at(len + 1.6, 2), 0.5);
      if (W.glowing) glowAlong(len - 1, len + 1, W.accent);
      break;
    }
    case "mace": { // the barrow-key mace: a long haft, a heavy flanged bronze head and the great key's bow at its end
      const len = 9 * W.long * (L.bladeLen ?? 1), bz = W.blade, hd = at(len + 1.6);
      limb(c, at(-2.6), at(len), 0.8, 0.75, C(WOOD));
      for (const t of [0, 1.3, 2.6]) line(c, [at(t - 0.2, -0.5), at(t + 0.2, 0.5)], C(0x2a1a10), 0.25, 0.9);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, o = [Math.cos(a) * 3.0, Math.sin(a) * 3.0]; metal(c, poly([at(len + 1.6 + o[0] * 0.55, o[1] * 0.55 - 0.6), at(len + 1.6 + o[0] * 0.55, o[1] * 0.55 + 0.6), at(len + 1.6 + o[0], o[1])]), sh(bz, 0.8), at(len + 1.6, 0), at(len + 1.6 + o[0], o[1]), 0.3); }
      metal(c, ellipseP(hd[0], hd[1], 2.1, 2.1), bz, [hd[0] - 2, hd[1] - 2], [hd[0] + 2, hd[1] + 2], 0.7);
      line(c, [at(len + 0.2, -1.2), at(len + 3.0, -1.2)], sh(bz, 1.5), 0.2, 0.7);
      const kb = at(len + 4.6);
      c.beginPath(); c.arc(kb[0], kb[1], 1.0, 0, Math.PI * 2); c.strokeStyle = css(sh(bz, 0.9)); c.lineWidth = 0.55; c.stroke();
      glow(c, hd[0], hd[1], 2.8, L.fx, 0.28);
      if (W.glowing) glowAlong(len, len + 3, W.accent);
      break;
    }
    case "spade": {
      // The sexton's spade: a long ash shaft with a T-grip and a worn iron blade, earth still on it
      const len = 12 * W.long;
      limb(c, at(-3.0), at(len), 0.7, 0.62, C(WOOD));
      line(c, [at(-3.0, -1.5), at(-3.0, 1.5)], C(WOOD), 0.5, 1);
      const bl = poly([at(len - 0.3, -1.3), at(len - 0.3, 1.3), at(len + 3.2, 1.7), at(len + 4.4, 0), at(len + 3.2, -1.7)]);
      metal(c, bl, W.g ? W.blade : C(0x8a9098), at(len, -1.7), at(len + 4.4, 1.7), 0.5);
      line(c, [at(len + 2.4, -1.3), at(len + 3.6, 0)], C(0x4a3a28), 0.5, 0.9);
      if (W.glowing) glowAlong(len - 1, len + 3, W.accent);
      break;
    }
    case "spear": {
      const len = 14 * W.long;
      limb(c, at(-6.5), at(len), 0.6, 0.55, C(WOOD));
      const tip = blade(c, at(len), u, n, 0, 4.2, 1.2, W.blade);
      void tip;
      for (const s of [-1, 1]) limb(c, at(len - 0.2, s * 0.2), at(len - 1.6 + Math.sin(r.p.t) * 0.2, s * 0.7), 0.5, 0.25, C(0xb5262f));
      if (W.glowing) glowAlong(len, len + 4, W.accent);
      break;
    }
    case "boneblade": {
      // Bone Demon's harvest: a femur hilt, a jawbone guard and a jagged blade of fused ribs
      const bone = C(BONE), len = 11.5;
      limb(c, at(-2.4), at(1.0), 0.8, 0.7, sh(bone, 0.82));
      const kn = at(-2.6);
      vol(c, ellipseP(kn[0], kn[1], 0.95, 0.85), bone, [kn[0] - 1, kn[1] - 1, 2, 2], { ao: 0.3 });
      const pts: P[] = [at(1.1, -0.75)];
      for (let t = 1.1; t < len - 1; t += 1.35) pts.push(at(t + 0.55, 1.75), at(t + 1.35, 1.0)); // serrated edge
      pts.push(at(len + 1.5, 0.1), at(len - 0.4, -0.85));
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      vol(c, poly(pts), bone, [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)], { ao: 0.4, spec: 0.25 });
      line(c, [at(1.6, 0.2), at(len - 0.5, 0.2)], sh(bone, 0.55), 0.16, 0.85); // marrow groove
      for (const t of [3.2, 6.1, 8.7]) line(c, [at(t, -0.6), at(t + 0.4, 0.5)], sh(bone, 0.5), 0.12, 0.8); // where the ribs are fused
      limb(c, at(1.0, -2.0), at(1.0, 2.0), 0.65, 0.55, sh(bone, 0.92)); // jawbone guard
      for (const k of [-1.4, -0.5, 0.4, 1.3]) fillShape(c, ellipseP(at(1.35, k)[0], at(1.35, k)[1], 0.16, 0.16), css(sh(bone, 1.3))); // its teeth
      break;
    }
    case "wand": {
      // a short rod with a glowing stone at the tip
      const len = 6.8, wood = W.g ? W.blade : C(WOOD), stone = W.g ? W.accent : 0x9be8ff;
      limb(c, at(-1.2), at(len), 0.5, 0.38, wood);
      line(c, [at(0.4, -0.25), at(len - 0.6, -0.25)], sh(wood, 1.5), 0.1, 0.7);
      limb(c, at(-1.4), at(0.8), 0.62, 0.62, C(0x3e2715)); // grip wrap
      const tip = at(len + 0.9);
      glow(c, tip[0], tip[1], 2.2, stone, 0.5 + (r.p.attack >= 0 ? 0.3 : 0));
      vol(c, ellipseP(tip[0], tip[1], 0.8, 0.8), stone, [tip[0] - 0.9, tip[1] - 0.9, 1.8, 1.8], { ao: 0.15, hi: 1.6, spec: 0.8 });
      break;
    }
    case "dagger": {
      blade(c, h, u, n, 0.8, 5 * W.long, 0.8, W.blade);
      limb(c, at(-1), at(0.6), 0.55, 0.55, C(0x5a3a22));
      break;
    }
    default: break;
  }
}

// ---------------------------------------------------------------- shield
function shield(c: C2, r: Rig) {
  const L = r.L, g = gear?.slot === "shield" ? gear : null;
  if (!L.shield && !g) return;
  const bookId = g ? g.id : L.shield?.style === "book" ? L.shield.book : undefined;
  if (bookId && BOOKS[bookId]) { // a book on the arm (paint/books.ts) instead of a shield
    const fh = r.farH, face = r.face;
    if (r.R) paintBook(c, bookId, r.cx + 2.6 + (r.p.attack === 0 ? 0.5 : 0), r.sy + 1.4, "edge", C);
    else paintBook(c, bookId, fh[0] + (r.dir === "down" ? 0.6 : -0.6) + face[0] * 0.3, fh[1] - 1.6, r.dir === "up" ? "back" : "front", C);
    return;
  }
  const style = g ? (g.style === "round" ? "round" : "kite") : L.shield!.style === "round" ? "round" : L.shield!.style === "tower" ? "tower" : "kite";
  const col = C(g ? g.color : L.shield!.col), trim = C(g ? g.accent : L.shield!.trim), emb = C(g ? g.accent : L.shield!.emblem);
  const push = r.info.mv.kind === "bash" && r.p.attack >= 0 ? (r.R ? [-1, 2, 2, 1] : [-1, 3, 4, 2])[r.p.attack] : 0;
  const face = r.face;
  const fh = r.farH;
  if (r.R) {
    const x = r.cx + 2.6 + face[0] * push * 1.2 + (r.p.attack === 0 ? 0.5 : 0), y = r.sy + 1.4;
    const s = blobPath([[x - 0.5, y - 0.4], [x + 0.6, y - 0.5], [x + 0.9, y + 4], [x + 0.4, y + 8.2], [x - 0.3, y + 8], [x - 0.6, y + 4]]);
    vol(c, s, col, [x - 0.7, y - 0.5, 1.7, 8.8], { ao: 0.3 });
    line(c, [[x + 0.6, y - 0.4], [x + 0.9, y + 4], [x + 0.4, y + 8.1]], trim, 0.4);
    return;
  }
  const up = r.dir === "up";
  const cx = fh[0] + (r.dir === "down" ? 0.6 : -0.6) + face[0] * push, cy = fh[1] - 2.4 + face[1] * push * 0.8;
  const tw = style === "tower";
  const s = tw ? blobPath([[cx - 3.2, cy - 4.3], [cx, cy - 4.6], [cx + 3.2, cy - 4.3], [cx + 3.35, cy + 4.6], [cx + 3.0, cy + 6.2], [cx - 3.0, cy + 6.2], [cx - 3.35, cy + 4.6]])
    : style === "round" ? ellipseP(cx, cy, 3.1, 3.3)
    : blobPath([[cx - 2.9, cy - 3.4], [cx, cy - 3.8], [cx + 2.9, cy - 3.4], [cx + 2.8, cy + 0.6], [cx + 1.3, cy + 3.3], [cx, cy + 4.6], [cx - 1.3, cy + 3.3], [cx - 2.8, cy + 0.6]]);
  const box: [number, number, number, number] = tw ? [cx - 3.3, cy - 4.5, 6.6, 10.7] : [cx - 3, cy - 3.8, 6, 8.4];
  if (up) {
    // the back: planks and straps
    vol(c, s, C(0x6b4a2c), box, { ao: 0.45 });
    clipTo(c, s, () => { for (let k = -2; k <= 2; k++) line(c, [[cx + k * 1.2, cy - 4], [cx + k * 1.2, cy + 5]], C(0x3e2a18), 0.15, 0.7); });
    line(c, [[cx - 2, cy - 0.6], [cx + 2, cy - 0.6]], C(0x3a2414), 0.6);
    line(c, [[cx - 2, cy + 1.5], [cx + 2, cy + 1.5]], C(0x3a2414), 0.6);
  } else if (style === "round" && g?.id === "sh_wood") {
    vol(c, s, col, box, { ao: 0.4 });
    clipTo(c, s, () => { for (let k = -3; k <= 3; k++) line(c, [[cx + k * 1.0, cy - 4], [cx + k * 1.0, cy + 4]], sh(col, 0.6), 0.14, 0.7); });
    metal(c, ellipseP(cx, cy, 1.0, 1.0), trim, [cx - 1, cy - 1], [cx + 1, cy + 1], 0.7);
  } else {
    vol(c, s, col, box, { ao: 0.45, spec: 0.2 });
    grain(c, s, box, col, 91, 30, 0.12, 1.0, 1.4);
    if (tw) { // the Ossuary Host's bone sigil: a skull over crossed bones, studded at the corners
      vol(c, ellipseP(cx, cy - 1.2, 1.35, 1.45), emb, [cx - 1.4, cy - 2.7, 2.8, 3], { ao: 0.25, spec: 0.3 });
      fillShape(c, poly([[cx - 0.75, cy + 0.0], [cx + 0.75, cy + 0.0], [cx + 0.55, cy + 0.9], [cx - 0.55, cy + 0.9]]), css(emb));
      for (const sx of [-0.55, 0.55]) fillShape(c, ellipseP(cx + sx, cy - 1.1, 0.34, 0.4), css(0x14181a));
      line(c, [[cx - 2.3, cy + 1.6], [cx + 2.3, cy + 4.4]], emb, 0.5); line(c, [[cx + 2.3, cy + 1.6], [cx - 2.3, cy + 4.4]], emb, 0.5);
      for (const [bx, by] of [[-2.5, -3.4], [2.5, -3.4], [-2.5, 5.2], [2.5, 5.2]]) fillShape(c, ellipseP(cx + bx, cy + by, 0.32, 0.32), css(sh(trim, 1.2)));
    } else {
    // heraldry: a lion-ish cross device
    line(c, [[cx, cy - 2.8], [cx, cy + 3.4]], emb, 0.75); line(c, [[cx - 2.2, cy - 0.6], [cx + 2.2, cy - 0.6]], emb, 0.75);
    }
    if (g?.id === "sh_dragon") { glow(c, cx, cy - 0.6, 2.2, 0xff8a3c, 0.5); }
  }
  // rim
  clipTo(c, s, () => { c.beginPath(); s(c); c.strokeStyle = css(up ? C(0x8a939e) : trim); c.lineWidth = 0.9; c.stroke(); c.strokeStyle = css(sh(up ? 0x8a939e : (g ? g.accent : L.shield!.trim), 1.5), 0.6); c.lineWidth = 0.25; c.stroke(); });
}

// ---------------------------------------------------------------- secondary ranged weapon worn on the body
function rangedGear(c: C2, r: Rig) {
  if (gear?.slot !== "ranged") return;
  const g = gear, { cx, sy, hipY } = r, strap = sh(g.accent, 0.7);
  if (r.dir === "down") line(c, [[cx - 3, sy - 0.6], [cx + 2.6, hipY - 1]], strap, 0.5);
  else if (r.dir === "up") line(c, [[cx + 3, sy - 0.6], [cx - 2.6, hipY - 1]], strap, 0.5);
  const at: P = r.dir === "down" ? [cx + 2.6, hipY - 0.2] : r.dir === "up" ? [cx - 2.4, sy + 2.6] : [cx - 1.6, hipY - 0.6];
  if (g.style === "sling") {
    curve(c, [at[0] - 1, at[1] - 1], [at[0], at[1] + 2], [at[0] + 1, at[1] - 1], C(g.color), 0.35);
    vol(c, ellipseP(at[0], at[1] + 0.8, 0.8, 0.6), C(g.color), [at[0] - 0.8, at[1], 1.6, 1.4]);
  } else if (g.style === "knives") {
    for (let k = -1; k <= 1; k++) { const x = at[0] + k * 0.6; metal(c, poly([[x - 0.22, at[1] - 1.4], [x, at[1] - 2.5], [x + 0.22, at[1] - 1.4]]), C(g.color), [x - 0.3, at[1] - 2], [x + 0.3, at[1] - 1]); limb(c, [x, at[1] - 1.3], [x, at[1] + 0.4], 0.4, 0.4, C(g.accent)); }
    vol(c, (cc) => cc.rect(at[0] - 1.2, at[1] - 0.6, 2.4, 1.2), C(0x4a2e18), [at[0] - 1.2, at[1] - 0.6, 2.4, 1.2]);
  } else {
    const p0: P = [at[0] - 1.6, at[1] - 1.8], p1: P = [at[0] + 1.6, at[1] + 1.4];
    limb(c, p0, p1, 0.8, 0.7, C(g.color));
    curve(c, [at[0] - 1.8, at[1] + 1.2], [at[0] - 0.3, at[1] - 0.6], [at[0] + 1.4, at[1] - 2.1], C(g.accent), 0.4);
  }
}

// ---------------------------------------------------------------- effects
function arcStroke(c: C2, cx: number, cy: number, r0: number, a0: number, a1: number, col: number, w: number, alpha: number) {
  const n = 18;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    c.beginPath(); c.arc(cx, cy, r0, rad(a0 + (a1 - a0) * t0), rad(a0 + (a1 - a0) * t1), a1 < a0);
    c.strokeStyle = css(col, alpha * (0.15 + 0.85 * t1)); c.lineWidth = w * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, t1 * 1.15))); c.lineCap = "round"; c.stroke();
  }
}
function swoosh(c: C2, cx: number, cy: number, r0: number, a0: number, a1: number, col: number, alpha = 1) {
  arcStroke(c, cx, cy, r0 - 0.6, a0, a1, mix(col, 0x8fb4ff, 0.4), 2.0, 0.35 * alpha);
  arcStroke(c, cx, cy, r0, a0, a1, col, 0.9, 0.95 * alpha);
  arcStroke(c, cx, cy, r0 + 0.2, a0 + (a1 - a0) * 0.4, a1, 0xffffff, 0.35, alpha);
}

function moveFx(c: C2, r: Rig, under: C2) {
  const p = r.p, ph = p.attack, mv = r.info.mv, col = mv.fx ?? 0xffffff, [hx, hy] = r.nearH, a = r.ang, u = r.u, n = r.n;
  const face = r.face;
  const L = 1.45;
  if (ph < 0) return;
  if ((mv.kind === "slash" || mv.kind === "bonk" || mv.kind === "slam") && ph === 1) {
    // pale smear wedge behind the body
    const a0 = rad(r.info.prevAng(0)), a1 = rad(a);
    const g = under.createRadialGradient(hx, hy, 3, hx, hy, 15);
    g.addColorStop(0, css(mix(col, 0xbfd7ff, 0.3), 0)); g.addColorStop(0.7, css(mix(col, 0xbfd7ff, 0.3), 0.18)); g.addColorStop(1, css(mix(col, 0xbfd7ff, 0.3), 0.4));
    under.beginPath(); under.moveTo(hx, hy); under.arc(hx, hy, 15, Math.min(a0, a1), Math.max(a0, a1)); under.closePath(); under.fillStyle = g; under.fill();
  }
  if ((mv.kind === "slash" || mv.kind === "bonk") && ph === 2 && p.move !== "a1") {
    const pa = r.info.prevAng(1);
    swoosh(c, hx, hy, 12 * L * 0.85, pa, a + (a - pa) * 0.3, col);
  }
  if (mv.kind === "thrust" && (ph === 1 || ph === 2)) {
    const len = r.L.weapon === "staff" ? 17 : r.L.weapon === "spear" ? 19 : 12.5;
    const tip: P = [hx + u[0] * len, hy + u[1] * len];
    for (const o of [-1.6, 0, 1.6]) line(c, [[tip[0] - u[0] * (5 + Math.abs(o)) + n[0] * o, tip[1] - u[1] * (5 + Math.abs(o)) + n[1] * o], [tip[0] - u[0] * (1 + Math.abs(o)) + n[0] * o, tip[1] - u[1] * (1 + Math.abs(o)) + n[1] * o]], 0xffffff, 0.3, ph === 2 ? 0.75 : 0.4);
    if (ph === 2) glow(c, tip[0] + u[0] * 1.5, tip[1] + u[1] * 1.5, 2.2, 0xffffff, 0.8);
  }
  if (mv.kind === "bash" && ph === 2) {
    const bx = 16 + face[0] * 9 + (r.cx - 16), by = 19 + face[1] * 7 + r.uy;
    glow(c, bx, by, 3.5, 0xfff3b0, 0.85);
    for (let k = 0; k < 8; k++) { const t = k * Math.PI / 4; line(c, [[bx + Math.cos(t) * 1.6, by + Math.sin(t) * 1.6], [bx + Math.cos(t) * 3.4, by + Math.sin(t) * 3.4]], 0xfff3b0, 0.25, 0.85); }
  }
  if (mv.kind === "slam" && ph >= 2) {
    const gx = Math.max(5, Math.min(27, hx + u[0] * 11)), gy = Math.min(29, Math.max(25, hy + u[1] * 11 + 3));
    const rr = ph === 2 ? 4.5 : 7.5, al = ph === 2 ? 0.85 : 0.45;
    under.save(); under.translate(gx, gy); under.scale(1, 0.35);
    const g = under.createRadialGradient(0, 0, rr * 0.4, 0, 0, rr);
    g.addColorStop(0, "rgba(217,200,168,0)"); g.addColorStop(0.8, `rgba(217,200,168,${al * 0.5})`); g.addColorStop(1, "rgba(217,200,168,0)");
    under.fillStyle = g; under.beginPath(); under.arc(0, 0, rr, 0, Math.PI * 2); under.fill(); under.restore();
    const rk = rng(p.t + 5);
    for (let k = 0; k < 6; k++) { const t = rk() * Math.PI * 2; fillShape(c, ellipseP(gx + Math.cos(t) * rr * 0.8, gy - 0.5 - rk() * (ph === 2 ? 2 : 3.5), 0.35, 0.3), css(0x8a7a5a, al)); }
    if (ph === 2) line(c, [[gx - 2.2, gy + 0.6], [gx - 0.6, gy], [gx + 0.4, gy + 0.8], [gx + 2.2, gy + 0.3]], 0x2a1e12, 0.3, 0.8);
  }
  if (mv.kind === "cast") {
    const al = [0.45, 0.8, 0.95, 0.4][ph], cx = 16 + (r.cx - 16);
    under.save(); under.translate(cx, 28.2); under.scale(1, 0.32);
    const g = under.createRadialGradient(0, 0, 6, 0, 0, 12);
    g.addColorStop(0, "rgba(154,107,255,0)"); g.addColorStop(0.75, `rgba(154,107,255,${al * 0.35})`); g.addColorStop(0.92, `rgba(94,230,255,${al * 0.9})`); g.addColorStop(1, "rgba(94,230,255,0)");
    under.fillStyle = g; under.beginPath(); under.arc(0, 0, 12, 0, Math.PI * 2); under.fill();
    for (let k = 0; k < 6; k++) { const t = k * Math.PI / 3 + ph * 0.4; under.fillStyle = `rgba(200,251,255,${al})`; under.beginPath(); under.arc(Math.cos(t) * 9.5, Math.sin(t) * 9.5, 0.9, 0, Math.PI * 2); under.fill(); }
    under.restore();
    if (ph >= 1) { const rk = rng(ph + 1); for (let k = 0; k < 6; k++) glow(c, cx - 7 + rk() * 14, 27 - rk() * 14, 0.9, 0xc8fbff, 0.8); }
    if (ph === 2) { const o: P = [hx + u[0] * 19, hy + u[1] * 19]; glow(c, o[0], o[1], 5, 0x9a6bff, 0.7); glow(c, o[0], o[1], 2.2, 0xffffff, 0.95); }
  }
  if (mv.kind === "double" && ph >= 2) {
    const k = ph === 2 ? 7 : 12;
    for (const o of [1.6, -1.6]) arrowFly(c, [hx + n[0] * o, hy + n[1] * o], u, k);
  }
  if (mv.kind === "charged") {
    if (ph <= 1) { const q: P = [hx + u[0] * 12, hy + u[1] * 12]; glow(c, q[0], q[1], ph ? 3.4 : 2.4, 0xffd166, 0.7 + ph * 0.2); }
    if (ph >= 2) {
      const k0 = ph === 2 ? 4 : 10, k1 = ph === 2 ? 26 : 30;
      line(c, [[hx + u[0] * k0, hy + u[1] * k0], [hx + u[0] * k1, hy + u[1] * k1]], 0xffd166, 1.6, 0.45);
      line(c, [[hx + u[0] * k0, hy + u[1] * k0], [hx + u[0] * k1, hy + u[1] * k1]], 0xffffff, 0.5, 0.95);
    }
  }
}

function arrowFly(c: C2, from: P, u: P, k: number) {
  const a: P = [from[0] + u[0] * k, from[1] + u[1] * k], b: P = [a[0] + u[0] * 8, a[1] + u[1] * 8];
  line(c, [[a[0] - u[0] * 3, a[1] - u[1] * 3], a], 0xffffff, 0.25, 0.4);
  line(c, [a, b], 0xa07a48, 0.25);
  glow(c, b[0], b[1], 0.9, 0xffffff, 0.9);
}

/** Per-weapon effects outside the combo moves (basic swing trails, magic orb, flying arrows). */
function heroFx(c: C2, r: Rig) {
  const p = r.p, ph = p.attack, L = r.L, [hx, hy] = r.nearH, a = r.ang, u = r.u;
  const basic = ph < 0 || !p.move || p.move === "a1" || ["double", "charged", "shot"].includes(r.info.mv.kind) || p.move === "a5";
  if (!basic) return;
  const dirSign = r.dir === "up" ? 1 : -1;
  switch (L.weapon) {
    case "staff": case "druidstaff": case "witchstaff": {
      const len = 13 * weaponCols(r).long + 2.2, o: P = [hx + u[0] * len, hy + u[1] * len], orb = L.orb ?? 0x5ee6ff;
      if (L.weapon !== "staff") { if (ph === 2) swoosh(c, hx, hy, 14, a - dirSign * 70, a, L.fx); return; }
      if (ph < 0) { if (p.t % 3 === 0) glow(c, o[0] + 1.6, o[1] - 1.6, 1.0, 0xc8fbff, 0.8); return; }
      if (ph === 0) glow(c, o[0], o[1], 3.2, orb, 0.6);
      if (ph === 1) { glow(c, o[0], o[1], 4.2, orb, 0.75); glow(c, o[0] - 2.5, o[1] - 2.2, 0.8, 0xc8fbff, 0.9); glow(c, o[0] + 2.6, o[1] - 1.5, 0.8, 0xc8fbff, 0.9); }
      if (ph === 2) { const b: P = [o[0] + u[0] * 5, o[1] + u[1] * 5]; glow(c, b[0], b[1], 5.5, 0x9a6bff, 0.6); glow(c, b[0], b[1], 3, orb, 0.9); glow(c, b[0], b[1], 1.3, 0xffffff, 1); }
      if (ph === 3) { const b: P = [o[0] + u[0] * 7, o[1] + u[1] * 7]; for (let k = 0; k < 8; k++) { const t = k * Math.PI / 4; glow(c, b[0] + Math.cos(t) * 3.4, b[1] + Math.sin(t) * 3.4, 0.8, 0xc8fbff, 0.8); } }
      return;
    }
    case "lute": {
      // plucked sound: a few notes drift off the strings at rest, then gold arcs ring out along the aim
      const bt = ph < 0 ? 3.1 : -3.9, b: P = [hx + u[0] * bt, hy + u[1] * bt], gold = L.fx; // at rest the belly is carried at the waist (weaponArt lute)
      const arcs = (d0: number, k: number, al: number) => { for (let i = 0; i < k; i++) {
        const d = d0 + i * 2.4, rr = 2.2 + i * 0.9;
        c.beginPath(); c.arc(hx + u[0] * d, hy + u[1] * d, rr, rad(a - 52), rad(a + 52));
        c.strokeStyle = css(i ? gold : 0xffffff, al * (1 - i * 0.25)); c.lineWidth = 0.55 - i * 0.08; c.lineCap = "round"; c.stroke();
      } };
      if (ph < 0) { if (p.t % 4 === 0) glow(c, b[0] + 2.2, b[1] - 2.8, 0.8, gold, 0.8); return; }
      if (ph === 0) glow(c, b[0], b[1], 3.0, gold, 0.4);
      if (ph === 1) { glow(c, b[0], b[1], 4.0, gold, 0.55); arcs(-1, 1, 0.5); }
      if (ph === 2) { glow(c, b[0], b[1], 4.5, gold, 0.5); arcs(8, 3, 0.95); }
      if (ph === 3) arcs(14, 2, 0.6);
      return;
    }
    case "bow":
      if (ph === 2 || ph === 3) arrowFly(c, [hx, hy], u, ph === 2 ? 9 : 15);
      return;
    case "wand": {
      const o: P = [hx + u[0] * 7.7, hy + u[1] * 7.7], st = weaponCols(r).g?.accent ?? 0x9be8ff;
      if (ph === 0 || ph === 1) glow(c, o[0], o[1], 2.6 + ph, st, 0.7);
      if (ph === 2) { glow(c, o[0] + u[0] * 4, o[1] + u[1] * 4, 3.5, 0x9a6bff, 0.6); glow(c, o[0] + u[0] * 4, o[1] + u[1] * 4, 1.4, 0xffffff, 1); }
      return;
    }
    case "spear":
      if (ph === 2) glow(c, hx + u[0] * 21, hy + u[1] * 21, 1.6, 0xffffff, 0.9);
      return;
    case "none": return;
    default: {
      const rr = (L.weapon === "dagger" ? 8 : 11) * weaponCols(r).long;
      if (ph === 2) swoosh(c, hx, hy, rr, a - dirSign * 75, a, L.fx);
      if (ph === 1 && L.weapon === "katana") swoosh(c, hx, hy, rr, a - dirSign * 60, a, 0xbfd7ff, 0.5);
    }
  }
}

// ---------------------------------------------------------------- frame assembly
/** Scratch canvases are reused: native canvas memory is invisible to the JS garbage collector. */
const pool = new Map<string, ReturnType<typeof canvas>>();
function scratch(id: string, w: number, h: number) {
  const k = `${id}:${w}x${h}`;
  let cv = pool.get(k);
  if (!cv) { cv = canvas(w, h); pool.set(k, cv); }
  const c = cv.getContext("2d");
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
  c.clearRect(0, 0, w, h);
  return cv;
}
function post(src: ReturnType<typeof canvas>, S: number) {
  const W = src.width, H = src.height;
  const ctx = src.getContext("2d");
  // warm rim light along top-left edges
  const rim = scratch("rim", W, H), rc = rim.getContext("2d");
  rc.drawImage(src, 0, 0);
  rc.globalCompositeOperation = "source-in"; rc.fillStyle = "rgb(255,226,172)"; rc.fillRect(0, 0, W, H);
  rc.globalCompositeOperation = "destination-out"; rc.drawImage(src, 0.42 * S, 0.5 * S);
  ctx.save(); ctx.globalCompositeOperation = "source-atop"; ctx.globalAlpha = 0.5; ctx.drawImage(rim, 0, 0);
  // grounding tone: darker and cooler toward the feet
  ctx.globalAlpha = 1;
  const g = ctx.createLinearGradient(0, 4 * S, 0, 29 * S);
  g.addColorStop(0, "rgba(255,236,200,0.05)"); g.addColorStop(0.55, "rgba(40,20,50,0)"); g.addColorStop(1, "rgba(25,12,40,0.32)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // soft dark outline
  const sil = scratch("sil", W, H), sc = sil.getContext("2d");
  sc.drawImage(src, 0, 0);
  sc.globalCompositeOperation = "source-in"; sc.fillStyle = "rgb(16,11,20)"; sc.fillRect(0, 0, W, H);
  const out = scratch("out", W, H), oc = out.getContext("2d");
  const d = 0.32 * S;
  oc.globalAlpha = 0.75;
  for (let k = 0; k < 8; k++) { const t = k * Math.PI / 4; oc.drawImage(sil, Math.cos(t) * d, Math.sin(t) * d); }
  oc.globalAlpha = 1;
  oc.drawImage(src, 0, 0);
  return out;
}

/** Paint one frame of a character. Returns a HiCanvas (32x32 logical, K fine pixels each) like renderFrame. */
/** Body points of the last painted frame, in the 32-unit painter space (paint/mobs.ts exports the demon's hands). */
export let lastRig: Record<"nearH" | "farH" | "nearS" | "farS" | "head" | "chest", P> | null = null;

// ---------------------------------------------------------------- Bone Demon's harvested bone armour (Look.boneArmour)
const BONE = 0xe2dbc6;

/** 1: a cracked skull strapped on each shoulder, two rib spikes sweeping out of it. */
function bonePauldron(c: C2, r: Rig, s: P, isNear: boolean) {
  const out = r.R ? (isNear ? -0.35 : 0.7) : Math.sign(s[0] - r.cx) || 1, bone = C(BONE), b = r.b;
  const cx = s[0] + (r.R ? 0.15 : out * 0.4), cy = s[1] - 0.45, rx = (r.R ? 1.7 : 1.9) * b, ry = 1.35 * b;
  for (const [k, len] of [[-0.7, 2.4], [0.45, 3.2]]) {
    const ax = cx + out * rx * 0.35 + k * 0.9 * (r.R ? 1 : out), ay = cy - ry * 0.45, tip: P = [ax + out * len * 0.7, ay - len];
    fillShape(c, poly([[ax - 0.55, ay + 0.3], [ax + 0.55, ay + 0.3], tip]), css(sh(bone, 0.86)));
    line(c, [[ax - 0.15, ay], tip], sh(bone, 1.25), 0.16, 0.8);
  }
  const cap = ellipseP(cx, cy, rx, ry, r.R ? 0 : out * 0.22);
  vol(c, cap, bone, [cx - rx, cy - ry, 2 * rx, 2 * ry], { ao: 0.4, spec: 0.3 });
  if (r.dir !== "up") {
    // the skull's empty eye and a crack across the cap
    fillShape(c, ellipseP(cx + out * rx * 0.38, cy + ry * 0.12, 0.5, 0.42), css(sh(bone, 0.28)));
    fillShape(c, ellipseP(cx + out * rx * 0.05, cy + ry * 0.2, 0.32, 0.3), css(sh(bone, 0.35)));
  }
  line(c, [[cx - rx * 0.55, cy - ry * 0.25], [cx - rx * 0.1, cy + ry * 0.05], [cx + rx * 0.15, cy - ry * 0.4]], sh(bone, 0.48), 0.13, 0.85);
  line(c, [[cx - rx * 0.85, cy + ry * 0.75], [cx + rx * 0.85, cy + ry * 0.85]], C(0x3a2014), 0.42, 0.95); // strap
}

/** 2: a cuirass of ribs and a sternum lashed over the chest (the spine and shoulder blades seen from behind). */
function boneCuirass(c: C2, r: Rig, s: Shape) {
  const { cx, sy, hipY } = r, bone = C(BONE), dk = sh(bone, 0.42), b = r.b;
  const rib = (a: P, ctl: P, e: P, w: number) => {
    curve(c, a, ctl, e, dk, w + 0.35, 0.95); curve(c, a, ctl, e, bone, w, 1);
    curve(c, [a[0], a[1] - 0.18], [ctl[0], ctl[1] - 0.2], [e[0], e[1] - 0.15], sh(bone, 1.3), 0.16, 0.75);
  };
  clipTo(c, s, () => {
    if (r.dir === "up") {
      for (const k of [-1, 1]) {
        const sp = blobPath([[cx + k * 0.9, sy - 0.2], [cx + k * 3.2 * b, sy + 0.3], [cx + k * 2.5 * b, sy + 3.8], [cx + k * 1.0, sy + 2.8]]);
        vol(c, sp, bone, [cx - 3.5 * b, sy - 0.3, 7 * b, 4.2], { ao: 0.4 });
      }
      for (let y = sy - 0.4; y < hipY - 1.6; y += 1.05) vol(c, ellipseP(cx, y, 0.8, 0.5), bone, [cx - 0.8, y - 0.5, 1.6, 1], { ao: 0.35 });
      return;
    }
    if (r.R) {
      for (let i = 0; i < 4; i++) { const y = sy + 1.0 + i * 1.4; rib([cx + 2.3 * b - i * 0.15, y], [cx + 0.2, y - 1.0], [cx - 2.0 * b, y + 0.6], 0.6 - i * 0.04); }
      limb(c, [cx + 2.0 * b, sy - 0.1], [cx + 1.7 * b, sy + 6.0], 0.7, 0.55, bone);
      return;
    }
    const mx = cx + r.fo * 0.6;
    for (let i = 0; i < 4; i++) {
      const y = sy + 1.0 + i * 1.45, w = 3.4 * b - i * 0.3;
      for (const k of [-1, 1]) rib([mx + k * 0.3, y], [mx + k * w * 0.7, y - 1.1], [mx + k * w, y + 0.8], 0.62 - i * 0.05);
    }
    limb(c, [mx, sy - 0.3], [mx, sy + 6.4], 0.85, 0.6, bone); // sternum
    vol(c, ellipseP(mx, sy - 0.1, 1.0, 0.7), bone, [mx - 1, sy - 0.8, 2, 1.4], { ao: 0.3 }); // collar knot
  });
}

/** 4: a crown of finger bones round the horned helm, a little skull on its brow. */
function boneCrown(c: C2, r: Rig) {
  const [hx, hy] = r.head, bone = C(BONE), y = hy - 1.9, qx = hx + (r.R ? 0.6 : r.fo);
  const xs = r.R ? [-1.7, -0.6, 0.5, 1.6] : [-2.3, -1.15, 0, 1.15, 2.3];
  for (const dx of xs) {
    const x = hx + dx + (r.R ? 0.4 : 0), hgt = 1.6 + (Math.abs(dx) < 0.6 ? 0.9 : 0) - Math.abs(dx) * 0.15;
    const sp = poly([[x - 0.45, y + 0.2], [x - 0.2, y - hgt], [x + 0.1, y - hgt - 0.3], [x + 0.45, y + 0.2]]);
    vol(c, sp, bone, [x - 0.5, y - hgt - 0.3, 1, hgt + 0.5], { ao: 0.3, spec: 0.3 });
  }
  line(c, [[hx - 2.7, y + 0.35], [hx + 2.7, y + 0.35]], sh(bone, 0.45), 0.95, 1);
  line(c, [[hx - 2.6, y + 0.25], [hx + 2.6, y + 0.25]], bone, 0.55, 1);
  if (r.dir !== "up") {
    vol(c, ellipseP(qx, y + 0.2, 0.95, 0.85), bone, [qx - 1, y - 0.7, 2, 1.8], { ao: 0.3, spec: 0.3 });
    for (const k of r.R ? [0.3] : [-0.35, 0.35]) fillShape(c, ellipseP(qx + k, y + 0.2, 0.22, 0.22), css(sh(bone, 0.25)));
  }
}

export function paintFrame(name: string, p: PoseLike, info: FrameInfo, withShadow: boolean, flash: number, K: number, alt?: DiagAlt): HiCanvas {
  const S = PIX ? 8 : K * SS, N = Math.round(32 * S);
  const body = scratch("body", N, N), c = body.getContext("2d");
  c.scale(S, S);
  const r = alt ? blendRig(rig(name, p, info), rig(name, alt.p, alt.info), alt.diag) : rig(name, p, info), L = r.L, dir = r.dir;
  lastRig = { nearH: r.nearH, farH: r.farH, nearS: r.nearS, farS: r.farS, head: r.head, chest: [r.cx, r.sy + 3] };
  if (mob3D && is3D(name)) { lastMob3D = paint3DPix(r, p, 8, flash, true, mob3D); return new HiCanvas(32, 32, 1); }
  if (PIX && RAY3D.has(name) && ray3d) return paint3D(r, p, K, S, flash, withShadow);
  const under = scratch("under", N, N), uc = under.getContext("2d"); uc.scale(S, S);

  const legs = () => {
    if (L.legs === "robe" || L.legs === "dress") { for (const i of [0, 1]) leg(c, r, i); skirt(c, r); }
    else if (r.R) { far(() => leg(c, r, 0), 0.8); leg(c, r, 1); }
    else { leg(c, r, 0); leg(c, r, 1); }
    if (L.legs === "fur") furKilt(c, r);
    if (L.legs === "bare") braies(c, r);
  };
  const farArm = () => { far(() => arm(c, r, "far")); };
  const shieldNow = () => { shield(c, r); };
  const headNow = () => { head(c, r); if (L.scarf) scarfWrap(c, r); };
  const weaponNow = () => { if (!p.noWeapon) weapon(c, r); };
  const bowHidesFar = L.weapon === "bow" && p.attack >= 0 && !p.farHand;

  if (dir === "up" && r.diag) {
    // seen from behind, turned right: the far (left) arm tucks behind the body
    const behind = p.attack < 1 || p.attack === 3;
    if (behind) weaponNow();
    if (!bowHidesFar && !p.farHand) farArm();
    legs(); torso(c, r); rangedGear(c, r);
    backItem(c, r, true);
    if (p.farHand) farArm(); shieldNow();
    arm(c, r, "near");
    headNow();
    if (!behind) weaponNow();
  } else if (dir === "down" && r.diag) {
    // facing down-right: the far (left) arm goes behind the torso, the shield stays in front
    backItem(c, r, false);
    if (!bowHidesFar && !p.farHand) farArm();
    legs(); torso(c, r); backItem(c, r, true); rangedGear(c, r); headNow();
    if (p.farHand) farArm(); shieldNow();
    weaponNow(); arm(c, r, "near");
  } else if (dir === "up") {
    const behind = p.attack < 1 || p.attack === 3;
    if (behind) weaponNow();
    legs(); torso(c, r); rangedGear(c, r);
    backItem(c, r, true);
    if (!bowHidesFar) farArm(); shieldNow();
    arm(c, r, "near");
    headNow();
    if (!behind) weaponNow();
  } else if (dir === "down") {
    backItem(c, r, false);
    legs(); torso(c, r); backItem(c, r, true); rangedGear(c, r); headNow();
    if (!bowHidesFar) farArm(); shieldNow();
    weaponNow(); arm(c, r, "near");
  } else {
    backItem(c, r, false);
    if (!p.farHand && !bowHidesFar) farArm();
    legs(); torso(c, r); backItem(c, r, true); rangedGear(c, r);
    if (!p.farHand) shieldNow();
    headNow();
    if (p.farHand) farArm();
    weaponNow(); arm(c, r, "near");
  }

  if (L.palmFlame !== undefined && p.attack < 0 && dir !== "up") palmFlame(c, r, L.palmFlame);
  if (L.mist !== undefined) coldMist(c, r, L.mist);
  if (PIX) return pixelFrame(body, under, r, K, S, flash, withShadow);
  const out = post(body, S), oc = out.getContext("2d");
  oc.save(); oc.scale(S, S);
  heroFx(oc, r);
  moveFx(oc, r, uc);
  oc.restore();
  if (flash) { oc.save(); oc.globalCompositeOperation = "source-atop"; oc.fillStyle = `rgba(255,255,255,${flash})`; oc.fillRect(0, 0, N, N); oc.restore(); }
  // things behind the body: smears, magic circles, ground shadow
  oc.save(); oc.globalCompositeOperation = "destination-over"; oc.drawImage(under, 0, 0);
  if (withShadow) {
    oc.scale(S, S); oc.translate(16 + r.lx, 29); oc.scale(1, 0.3);
    const g = oc.createRadialGradient(0, 0, 0, 0, 0, 7);
    g.addColorStop(0, "rgba(0,0,0,0.45)"); g.addColorStop(0.6, "rgba(0,0,0,0.28)"); g.addColorStop(1, "rgba(0,0,0,0)");
    oc.fillStyle = g; oc.beginPath(); oc.arc(0, 0, 7, 0, Math.PI * 2); oc.fill();
  }
  oc.restore();
  // down-sample to the sheet resolution
  const fin = scratch("fin", 32 * K, 32 * K), fc = fin.getContext("2d");
  fc.imageSmoothingEnabled = true; (fc as any).imageSmoothingQuality = "high";
  fc.drawImage(out, 0, 0, 32 * K, 32 * K);
  const img = fc.getImageData(0, 0, 32 * K, 32 * K);
  const hc = new HiCanvas(32, 32, K);
  hc.data.set(img.data);
  return hc;
}

/** Cold mist pouring off the body and pooling round the feet (Look.mist): drifting puffs, thicker low down. */
function coldMist(c: C2, r: Rig, col: number) {
  const rr = rng(77), t = r.p.t, pale = mix(col, 0xffffff, 0.55);
  // low wisps curling along the ground round the feet (drifting with the frame)
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9 + t * 0.3, x = r.cx + Math.cos(a) * (4.2 + (k % 3)) , y = 28.3 + Math.sin(a * 1.7) * 0.7 + (k % 2) * 0.5, w = 2.4 + rr() * 1.6;
    c.beginPath(); c.moveTo(x - w, y + 0.2); c.quadraticCurveTo(x - w * 0.2, y - 1.0 - rr() * 0.6, x + w, y - 0.1);
    c.strokeStyle = css(pale, 0.5); c.lineWidth = 0.9; c.lineCap = "round"; c.stroke();
    c.strokeStyle = css(col, 0.28); c.lineWidth = 1.8; c.stroke();
  }
}

/** A small witch-fire dancing a little above the open near hand: red-orange tongue, yellow heart (a Void flame for the Summoner: violet, pale heart). */
function palmFlame(c: C2, r: Rig, col: number) {
  const [x, y0] = r.nearH, t = r.p.t, sw = Math.sin(t * 1.9) * 0.45, y = y0 - 1.1 - Math.abs(Math.sin(t * 1.3)) * 0.3;
  const tall = 3.4 + Math.sin(t * 2.3) * 0.5;
  const outer = blobPath([[x - 1.25, y], [x - 1.0, y - 1.3], [x - 0.3 + sw * 0.5, y - tall * 0.7], [x + sw, y - tall], [x + 0.6 + sw * 0.4, y - tall * 0.55], [x + 1.25, y - 0.9], [x + 1.0, y + 0.45], [x, y + 0.75]]);
  fillShape(c, outer, css(sh(col, 0.85)));
  const warm = ((col >> 16) & 255) > (col & 255); // a fire flame (red over blue) keeps its orange and yellow heart
  fillShape(c, blobPath([[x - 0.75, y], [x - 0.2 + sw * 0.4, y - tall * 0.55], [x + 0.5 + sw * 0.3, y - tall * 0.35], [x + 0.75, y - 0.2], [x, y + 0.45]]), css(C(warm ? 0xffa040 : mix(col, 0xffffff, 0.35))));
  fillShape(c, ellipseP(x + sw * 0.15, y - 0.35, 0.42, 0.55), css(C(warm ? 0xffe08a : mix(col, 0xffffff, 0.8))));
}

// ---------------------------------------------------------------- pixel-art output
const OUTLINE = 0x1a1420;
/**
 * Turns a painted RGBA image (already scaled to the target size) into pixel art in place: alpha becomes 0 or 255,
 * colours are posterized, the top-left edge gets a lighter rim and the silhouette a 1px outline in a deep shade
 * of the colour it wraps.
 */
export function pixelize(d: Uint8ClampedArray | Uint8Array, w: number, h: number, outline = true, wear?: Wear) {
  const STEP = 12;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 120) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; continue; }
    d[i + 3] = 255;
    if (wear) weather(d, i, Math.floor(i / 4 / w), (i / 4) % w, wear);
    for (let k = 0; k < 3; k++) d[i + k] = Math.min(255, Math.round(d[i + k] / STEP) * STEP);
  }
  const hc = new HiCanvas(w, h, 1);
  hc.data.set(d);
  hc.rim(1.16);
  if (outline) hc.selout(OUTLINE);
  d.set(hc.data);
}

/**
 * Weathering so characters sit in the aged decor: colours pulled toward the world's earthy palette, warm-brown
 * shadows, and road dust / mud creeping up from the feet (rows y0..y1, strongest at the ground), in a fixed
 * ordered-dither pattern so it reads as pixel texture rather than a smooth gradient.
 */
export interface Wear { y0: number; y1: number; sat?: number; mud?: number }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function weather(d: Uint8ClampedArray | Uint8Array, i: number, y: number, x: number, o: Wear) {
  let r = d[i], g = d[i + 1], b = d[i + 2];
  const l = r * 0.3 + g * 0.59 + b * 0.11;
  if (r + g + b > 700) return; // keep sparks, glints and glowing eyes bright
  const sat = o.sat ?? 0.8;
  r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
  // shadows lean warm brown (like the decor's), lights stay
  const sh = Math.max(0, 1 - l / 110);
  r += 6 * sh; g += 2 * sh; b -= 5 * sh;
  // dust and mud up the legs, dithered
  if (y > o.y0) {
    const t = Math.min(1, (y - o.y0) / Math.max(1, o.y1 - o.y0)) * (o.mud ?? 0.38);
    const th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
    const k = t * (th < t * 1.6 ? 1 : 0.35);
    const mr = 0x5a, mg = 0x48, mb = 0x34;
    r += (mr - r) * k; g += (mg - g) * k; b += (mb - b) * k;
  }
  d[i] = Math.max(0, Math.min(255, r)); d[i + 1] = Math.max(0, Math.min(255, g)); d[i + 2] = Math.max(0, Math.min(255, b));
}

/** Effects / shadows layer: keep soft colour but snap alpha to a few steps so it reads as pixels. */
export function pixelAlpha(d: Uint8ClampedArray) {
  for (let i = 3; i < d.length; i += 4) { const a = d[i]; d[i] = a < 40 ? 0 : a < 110 ? 85 : a < 190 ? 160 : 255; }
}

export function shrink(src: ReturnType<typeof canvas>, id: string, w: number, h: number) {
  const fin = scratch(id, w, h), fc = fin.getContext("2d");
  fc.imageSmoothingEnabled = true; (fc as any).imageSmoothingQuality = "high";
  fc.drawImage(src, 0, 0, w, h);
  return fc.getImageData(0, 0, w, h).data;
}

// ---------------------------------------------------------------- 3D-built heroes (body3d.ts)
/** Heroes whose body is modelled in 3D and ray-cast (Murat 2026-11-16: the vampire first). Held items stay painted. */
export const RAY3D = new Set(["vampire"]);
let ray3d = true;
/** Turn the 3D body off (to compare with the painted one). */
export function setRay3D(on: boolean) { ray3d = on; }

/** What the body wears for the 3D model: the Look plus the found item being rendered, resolved like the painters do. */
function dress3D(r: Rig): Dress3D {
  const L = r.L, tk = torsoKind(r), hg = headGear(r);
  const hat = gear?.slot === "hat" ? gear : null, shoes = gear?.slot === "shoes" ? gear : null;
  return {
    torso: tk.kind, torsoCol: tk.col, trim: tk.trim,
    head: hg, headCol: hat ? hat.color : L.headCol ?? 0x888888, headTrim: hat ? hat.accent : L.headTrim ?? 0xd9a93a,
    plume: hg === "cap" ? (hat ? hat.accent : L.plume ?? L.headTrim) : hg === "helm" && mob3D ? L.plume : undefined,
    legs: L.legs, legCol: L.legCol,
    boots: shoes ? shoes.color : L.boots, bootStyle: shoes ? "leather" : L.bootStyle ?? "leather",
    wings: shoes?.style === "wings" ? shoes.accent : undefined,
    sleeve: L.sleeve, arms: L.arms, glove: L.glove,
    armour: gear?.slot === "armour" && gear.style === "trim" ? { col: gear.color, trim: gear.accent } : undefined,
    belt: L.belt, buckle: L.buckle,
    cape: L.back === "cape" ? { col: L.capeCol ?? 0x2a2a2a, collar: L.collar, short: L.capeShort } : L.back === "pelt" && mob3D ? { col: L.capeCol ?? 0x3a2a1e, short: true, fur: true } : undefined,
  };
}

function paint3D(r: Rig, p: PoseLike, K: number, S: number, flash: number, withShadow: boolean): HiCanvas {
  const W = Math.round(32 * K), hc = new HiCanvas(32, 32, K);
  hc.data.set(paint3DPix(r, p, S, flash, withShadow, { tw: W, th: W, k: W / 32, x0: 0, y0: 0 }));
  return hc;
}

/**
 * Monsters built in 3D the same way (paint/mobs.ts, Murat 2026-11-17): while a frame is set, paintFrame renders bodies
 * that is3D() names straight onto the monster sheet's texel grid and leaves the finished pixels in lastMob3D.
 */
let mob3D: Frame3 | null = null;
export let lastMob3D: Uint8ClampedArray | null = null;
export function setMob3D(fr: Frame3 | null) { mob3D = fr; lastMob3D = null; setMonster3D(!!fr); }
/** Monster bodies modelled in 3D (base kind before any _variant / _champ). */
export const MOB3D = new Set<string>(["skeleton", "skeletonmage", "necromancer", "bandit", "bandit_brute", "bandit_archer", "banditchief", "outrider", "crossbowman", "firebrand", "redcaptain", "rourke", "gnawkin", "tuskborn", "silkwretch", "duskwing", "crowseer", "gnasher", "weaver", "packlord", "hornbrute", "hidemother", "nomad", "sanddead", "veiled", "camelfolk", "sphinx", "sunwright", "wight", "boghag", "legionary", "cairnlord", "barrowking", "delver", "cackler", "stagkin", "quillback", "stitcher", "hidechief", "mawfather", "oathbreaker", "crownguard", "hollowherald", "courtmagus", "pretender", "thronewarden", "rivenking", "bride", "hollowking", "demon", "demon1", "demon2", "demon3", "demon4", "war_warden", "war_warden_cap", "war_redfang", "war_redfang_chief", "war_host", "war_host_cap", "war_hidekin", "war_hidekin_chief", "war_veiled", "war_veiled_adept"]);
const is3D = (name: string) => MOB3D.has(name) || MOB3D.has(name.replace(/_(axe|spear|bow|champ|folk)$/, "")) || MOB3D.has(name.replace(/_champ$/, ""));

/** The 3D body plus its painted weapons, effects and shadow, finished pixels in frame `F` (rig units -> texels). */
function paint3DPix(r: Rig, p: PoseLike, S: number, flash: number, withShadow: boolean, F: Frame3): Uint8ClampedArray {
  const W = F.tw, TH = F.th, PS = S * Math.max(1, F.k / 1.5); // canvas px per rig unit for the painted layers
  const NW = Math.ceil(W / F.k * PS), NH = Math.ceil(TH / F.k * PS);
  const toCanvas = (c: C2) => c.setTransform(PS, 0, 0, PS, -F.x0 * PS, -F.y0 * PS);
  const model = build3D(r.L, dress3D(r), {
    dir: r.dir, diag: r.diag, b: r.b, cx: r.cx, sy: r.sy, hipY: r.hipY,
    head: r.head, nearS: r.nearS, farS: r.farS, nearE: r.nearE, farE: r.farE, nearH: r.nearH, farH: r.farH,
    hips: r.hips, knees: r.knees, feet: r.feet,
    stride: p.stride, phase: p.phase, run: p.run, t: p.t, attack: p.attack, crouch: p.crouch, headDx: p.headDx ?? 0,
    moving: motion(r), wave: wavePh(r), blink: p.expr === "blink" || p.expr === "x",
  });
  const m = render3D(model, F);
  const b = m.rgba;
  pixelize(b, W, TH, true, { y0: Math.round((r.hipY + 3 - F.y0) * F.k), y1: Math.round((29.5 - F.y0) * F.k), mud: r.L.bones ? 0.2 : 0.28 });
  // held items keep their painted look, moved onto where the 3D hands ended up on screen
  const dn: P = [m.handNear[0] - r.nearH[0], m.handNear[1] - r.nearH[1]], df: P = [m.handFar[0] - r.farH[0], m.handFar[1] - r.farH[1]];
  const layer = (id: string, fn: (c: C2) => void) => {
    const cv = scratch(id, NW, NH), c = cv.getContext("2d");
    toCanvas(c); fn(c);
    const d = shrink(cv, id + "s", W, TH);
    pixelize(d, W, TH, true);
    return d;
  };
  const at = (c: C2, d: P, fn: () => void) => { c.save(); c.translate(d[0], d[1]); fn(); c.restore(); };
  const behind = r.dir === "up" && (p.attack < 1 || p.attack === 3);
  const weaponNow = (c: C2) => { if (!p.noWeapon) at(c, dn, () => weapon(c, r)); };
  const back = layer("w3b", (c) => { if (behind) weaponNow(c); });
  const front = layer("w3f", (c) => {
    rangedGear(c, r); at(c, df, () => shield(c, r)); if (!behind) weaponNow(c);
    if (r.L.palmFlame !== undefined && p.attack < 0 && r.dir !== "up") palmFlame(c, r, r.L.palmFlame);
    if (r.L.mist !== undefined) coldMist(c, r, r.L.mist); // painted wisps over the 3D feet
  });
  // effects in front, and behind (smears, circles, the ground shadow)
  const under = scratch("under", NW, NH), uc0 = under.getContext("2d"); toCanvas(uc0);
  const fx = scratch("fx", NW, NH), fc = fx.getContext("2d");
  toCanvas(fc); heroFx(fc, r); moveFx(fc, r, uc0);
  const f = shrink(fx, "pxf", W, TH); pixelAlpha(f);
  if (withShadow && !F.noShadow) {
    const uc = under.getContext("2d");
    uc.save(); toCanvas(uc); uc.translate(16 + r.lx, 29 + (F.lift ?? 0)); uc.scale(1, 0.28);
    uc.fillStyle = "rgba(0,0,0,0.38)"; uc.beginPath(); uc.arc(0, 0, 6.6, 0, Math.PI * 2); uc.fill(); uc.restore();
  }
  const u = shrink(under, "pxu", W, TH); pixelAlpha(u);
  if (flash) for (let i = 0; i < b.length; i += 4) if (b[i + 3]) for (let k = 0; k < 3; k++) b[i + k] += (255 - b[i + k]) * flash;
  const o = new Uint8ClampedArray(W * TH * 4);
  const over = (src: Uint8ClampedArray, i: number) => {
    const a = src[i + 3] / 255; if (!a) return;
    const oa = o[i + 3] / 255, na = a + oa * (1 - a);
    for (let k = 0; k < 3; k++) o[i + k] = Math.round((src[i + k] * a + o[i + k] * oa * (1 - a)) / na);
    o[i + 3] = Math.round(na * 255);
  };
  const handOnTop = r.dir !== "up";
  for (let i = 0; i < o.length; i += 4) {
    over(u, i); over(back, i); over(b, i); over(front, i);
    if (handOnTop && m.tag[i / 4] === TAG_HAND && b[i + 3]) over(b, i);
    over(f, i);
  }
  return o;
}

function pixelFrame(body: ReturnType<typeof canvas>, under: ReturnType<typeof canvas>, r: Rig, K: number, S: number, flash: number, withShadow: boolean): HiCanvas {
  const W = Math.round(32 * K), N = body.width;
  const b = shrink(body, "pxb", W, W);
  // dust from the knees down (frame rows: knees ~ 23/32, ground 29/32), shifted with crouch/jumps via the hip line
  pixelize(b, W, W, true, { y0: Math.round((r.hipY + 3) / 32 * W), y1: Math.round(29.5 / 32 * W), mud: r.L.skull ? 0.25 : 0.5 });
  if (flash) for (let i = 0; i < b.length; i += 4) if (b[i + 3]) for (let k = 0; k < 3; k++) b[i + k] += (255 - b[i + k]) * flash;
  // effects in front
  const fx = scratch("fx", N, N), fc = fx.getContext("2d");
  fc.scale(S, S); heroFx(fc, r); moveFx(fc, r, under.getContext("2d"));
  const f = shrink(fx, "pxf", W, W); pixelAlpha(f);
  // behind: smears, circles and the ground shadow
  if (withShadow) {
    const uc = under.getContext("2d");
    uc.save(); uc.setTransform(S, 0, 0, S, 0, 0); uc.translate(16 + r.lx, 29); uc.scale(1, 0.28);
    uc.fillStyle = "rgba(0,0,0,0.38)"; uc.beginPath(); uc.arc(0, 0, 6.2, 0, Math.PI * 2); uc.fill(); uc.restore();
  }
  const u = shrink(under, "pxu", W, W); pixelAlpha(u);
  const hc = new HiCanvas(32, 32, K);
  const o = hc.data;
  const over = (src: Uint8ClampedArray, i: number) => {
    const a = src[i + 3] / 255; if (!a) return;
    const oa = o[i + 3] / 255, na = a + oa * (1 - a);
    for (let k = 0; k < 3; k++) o[i + k] = Math.round((src[i + k] * a + o[i + k] * oa * (1 - a)) / na);
    o[i + 3] = Math.round(na * 255);
  };
  for (let i = 0; i < o.length; i += 4) { over(u, i); over(b, i); over(f, i); }
  return hc;
}

// ---------------------------------------------------------------- weapon icons (bag, menus, drops)
/**
 * A weapon item painted on its own, laid diagonally (grip bottom-left, tip top-right) with the same form as on the
 * hero (weaponArt.ts), fitted into a `px` x `px` pixel-art icon. Returns RGBA data, or null if it has no form.
 */
export function paintWeaponIcon(d: GearDef, kind: string, px: number): Uint8ClampedArray | null {
  const f = formOf(d.id, kind);
  if (!f) return null;
  const U = 48, S = 8, N = U * S;
  const cv = scratch("icon", N, N), c = cv.getContext("2d");
  c.scale(S, S);
  const u: P = [Math.SQRT1_2, -Math.SQRT1_2], n: P = [Math.SQRT1_2, Math.SQRT1_2];
  const long = d.style.startsWith("long") ? 1 + (d.bonus.reach ?? 0) * 0.9 : 1;
  const ok = drawFormWeapon({ c, h: [17, 31], u, n, kind, f, blade: d.color, accent: d.accent, long, attack: -1, C: (x) => x, icon: true });
  if (!ok) return null;
  // fit the painted weapon into the icon, keeping its aspect
  const img = c.getImageData(0, 0, N, N).data;
  let x0 = N, y0 = N, x1 = 0, y1 = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (img[(y * N + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0) return null;
  const side = Math.max(x1 - x0, y1 - y0) + 1, pad = side * 0.08;
  const out = scratch("iconfit", px, px), oc = out.getContext("2d");
  oc.imageSmoothingEnabled = true; (oc as any).imageSmoothingQuality = "high";
  const k = px / (side + pad * 2);
  oc.drawImage(cv, x0 - pad - (side - (x1 - x0 + 1)) / 2, y0 - pad - (side - (y1 - y0 + 1)) / 2, side + pad * 2, side + pad * 2, 0, 0, px, px);
  void k;
  const data = oc.getImageData(0, 0, px, px).data;
  pixelize(data, px, px, true);
  return data;
}
