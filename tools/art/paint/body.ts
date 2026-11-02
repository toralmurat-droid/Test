import type { GearDef } from "../../../shared/gear";
import { HiCanvas } from "../canvas";
import {
  C2, P, blobPath, canvas, clipTo, css, curve, ellipseP, fillShape, glow, grain, hashStr, ik, limb, line, metal, mix, poly, rad, rng, sh, Shape, vol,
} from "./brush";
import { HeadGear, Look, LOOKS, MOB_LOOKS, TorsoKind } from "./look";

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
export const hasLook = (name: string) => !!(LOOKS[name] ?? MOB_LOOKS[name]);
const lookOf = (name: string) => LOOKS[name] ?? MOB_LOOKS[name];

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
  const ux = lean + (p.run && R ? 1 : 0), uy = p.bob + p.crouch + ly, lx = lean;
  const cx = 16 + ux, sy = 12.7 + uy;
  const hipY = 19.5 + p.crouch * 0.95 + ly + p.bob * 0.45;
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
    const back = Math.min(f0[0], f1[0]) - 1.6, front = Math.max(f0[0], f1[0]) + 1.9;
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
    if (!gear || gear.slot !== "armour") clipTo(c, s, () => {
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
    } else if (tk.kind === "shirt") {
      if (down) { curve(c, [cx - 1.2, sy - 1.1], [cx, sy + 0.4], [cx + 1.2, sy - 1.1], sh(col, 0.55), 0.3, 0.8); line(c, [[cx, sy - 0.2], [cx, sy + 1.6]], sh(col, 0.6), 0.18, 0.6); }
      for (let k = -1; k <= 1; k += 2) curve(c, [cx + k * 1.5, sy + 1], [cx + k * 2.2, sy + 3.5], [cx + k * 1.4, hipY - 0.5], fold, 0.2, 0.45);
    }
  }
  if (!gear || gear.slot !== "armour") {
    if (L.vest) vest(c, r, s);
    if (L.apron) apron(c, r);
    if (L.tabard) tabard(c, r);
  }
  // belt / sash
  const by = hipY - 1.1;
  const beltCol = L.sash ?? L.belt;
  if (beltCol !== undefined) clipTo(c, s, () => {
    const bs = poly([[cx - 5, by - 0.55], [cx + 5, by - 0.55], [cx + 5, by + 0.55], [cx - 5, by + 0.55]]);
    vol(c, bs, C(beltCol), [cx - 4, by - 0.6, 8, 1.2], { ao: 0.2 });
  });
  if (L.buckle !== undefined && !r.p.dir.startsWith("u")) {
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
  if (L.back === "cape") {
    const col = C(L.capeCol!), flut = Math.sin(r.p.t * 1.1) * 0.5 + (r.p.run ? 1.2 : 0) + Math.abs(r.p.stride) * 0.4;
    if (r.dir === "up" && front) {
      const s = blobPath([[cx - 3.4 * r.b, sy - 0.8], [cx + 3.4 * r.b, sy - 0.8], [cx + 3.9 * r.b + flut * 0.3, sy + 6], [cx + 3.6, hipY + 5.6], [cx, hipY + 6.4 + flut * 0.3], [cx - 3.6, hipY + 5.6], [cx - 3.9 * r.b - flut * 0.3, sy + 6]]);
      vol(c, s, col, [cx - 4, sy - 1, 8, hipY - sy + 7], { ao: 0.35 });
      grain(c, s, [cx - 4, sy - 1, 8, hipY - sy + 7], col, r.seed + 21, 30, 0.18, 1.4, 1.5);
      for (let k = -1; k <= 1; k++) curve(c, [cx + k * 1.6, sy + 1], [cx + k * 2.0, sy + 6], [cx + k * 2.3, hipY + 5.4], sh(col, 0.55), 0.3, 0.55);
    } else if (r.dir === "right" && !front) {
      const s = blobPath([[cx - 1.4, sy - 0.9], [cx + 0.6, sy - 0.6], [cx - 1.5, hipY + 4.8], [cx - 3.3 - flut, hipY + 5.4], [cx - 3.9 - flut * 1.3, hipY + 1.5], [cx - 2.4 - flut * 0.5, sy + 2]]);
      vol(c, s, col, [cx - 4.5, sy - 1, 5, hipY - sy + 7], { ao: 0.35 });
      curve(c, [cx - 1.6, sy + 1], [cx - 2.4 - flut * 0.5, sy + 5], [cx - 2.8 - flut, hipY + 4.8], sh(col, 0.55), 0.3, 0.55);
    } else if (r.dir === "down" && !front) {
      // only the edges show beside the legs
      const s = blobPath([[cx - 3.6 * r.b, sy - 0.4], [cx + 3.6 * r.b, sy - 0.4], [cx + 4.1 + flut * 0.2, hipY + 5.3], [cx, hipY + 5.8], [cx - 4.1 - flut * 0.2, hipY + 5.3]]);
      vol(c, s, sh(col, 0.75), [cx - 4, sy, 8, hipY - sy + 6], { ao: 0.3 });
    }
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
  // pauldron
  if (plate || armoured) {
    const pc = C(armoured ? gear!.color : L.sleeve);
    const ps = ellipseP(s[0] + (r.R ? 0.2 : 0), s[1] - 0.1, 1.85 * r.b, 1.45, r.R ? 0 : (s[0] < r.cx ? -0.3 : 0.3));
    metal(c, ps, pc, [s[0] - 1.6, s[1] - 1.4], [s[0] + 1.6, s[1] + 1.2], 0.7);
    if (armoured || L.trim) clipTo(c, ps, () => { c.beginPath(); ps(c); c.strokeStyle = css(C(armoured ? gear!.accent : L.trim!), 0.9); c.lineWidth = 0.4; c.stroke(); });
  }
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

function headGear(r: Rig): HeadGear | "crown" {
  if (gear?.slot === "hat") return gear.style === "crown" ? "crown" : gear.style === "helm" ? "helm" : "cap";
  return r.L.head;
}

function head(c: C2, r: Rig) {
  const L = r.L, [hx, hy] = r.head, dir = r.dir, skin = C(L.skin);
  const hg = r.L.head, worn = headGear(r);
  const covered = hg === "greathelm" || hg === "ninjahood";
  if (L.skull) { skull(c, r); if (worn !== "none") hat(c, r, worn); return; }
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
  if (worn !== "none") hat(c, r, worn);
}

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
    case "helm": {
      const dome = blobPath([[hx - 2.75, hy - 0.1], [hx - 2.5, hy - 2.5], [hx, hy - 3.5], [hx + 2.5, hy - 2.5], [hx + 2.75, hy - 0.1]]);
      metal(c, dome, col, [hx - 2.6, hy - 3], [hx + 2.6, hy], 0.8);
      line(c, [[hx - 2.9, hy - 0.25], [hx + 2.9, hy - 0.25]], sh(col, 0.55), 0.55, 0.95);
      if (dir === "down") metal(c, (cc) => cc.rect(qx - 0.32, hy - 0.4, 0.64, 2.1), col, [qx - 0.3, hy], [qx + 0.3, hy + 1]);
      if (dir !== "up") line(c, [[hx - 0.2, hy - 3.4], [hx + (r.R ? 1.2 : 0), hy - 0.8]], sh(col, 1.45), 0.25, 0.6);
      if (g) glow(c, hx, hy - 3.5, 0.8, trim, 0.6);
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
  return { blade: g ? g.color : STEEL, accent: g ? g.accent : 0, long: g?.style.startsWith("long") ? 1 + (g.bonus.reach ?? 0) * 0.9 : 1, glowing: !!g && g.style.endsWith("glow"), g };
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
  const at = (t: number, o = 0): P => [h[0] + u[0] * t + n[0] * o, h[1] + u[1] * t + n[1] * o];
  const W = weaponCols(r);
  const glowAlong = (t0: number, t1: number, col: number) => { for (let t = t0; t <= t1; t += 1.2) glow(c, at(t)[0], at(t)[1], 1.5, col, 0.35); };
  switch (L.weapon) {
    case "sword": {
      const len = 10.5 * W.long;
      if (W.glowing) glowAlong(1.5, len, W.accent);
      blade(c, h, u, n, 1.0, len, 1.05, W.blade);
      line(c, [at(1.3), at(len * 0.75)], sh(W.blade, 0.55), 0.18, 0.8);
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
      glow(c, ox[0], ox[1], 3.0, orb, 0.55 + (r.p.attack >= 0 ? 0.25 : 0));
      vol(c, ellipseP(ox[0], ox[1], 1.25, 1.25), orb, [ox[0] - 1.3, ox[1] - 1.3, 2.6, 2.6], { ao: 0.15, hi: 1.6, spec: 0.8 });
      if (W.glowing) glowAlong(-4, len, W.accent);
      break;
    }
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
    case "hammer": {
      const len = 8.5 * W.long;
      limb(c, at(-2.2), at(len), 0.7, 0.65, C(WOOD));
      const hd = poly([at(len - 0.8, -2.0), at(len - 0.8, 2.0), at(len + 1.6, 2.0), at(len + 1.6, -2.0)]);
      metal(c, hd, W.g ? W.blade : C(0x6f7883), at(len, -2), at(len + 1.6, 2), 0.5);
      if (W.glowing) glowAlong(len - 1, len + 1, W.accent);
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
  const style = g ? (g.style === "round" ? "round" : "kite") : L.shield!.style;
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
  const s = style === "round" ? ellipseP(cx, cy, 3.1, 3.3)
    : blobPath([[cx - 2.9, cy - 3.4], [cx, cy - 3.8], [cx + 2.9, cy - 3.4], [cx + 2.8, cy + 0.6], [cx + 1.3, cy + 3.3], [cx, cy + 4.6], [cx - 1.3, cy + 3.3], [cx - 2.8, cy + 0.6]]);
  const box: [number, number, number, number] = [cx - 3, cy - 3.8, 6, 8.4];
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
    // heraldry: a lion-ish cross device
    line(c, [[cx, cy - 2.8], [cx, cy + 3.4]], emb, 0.75); line(c, [[cx - 2.2, cy - 0.6], [cx + 2.2, cy - 0.6]], emb, 0.75);
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
    case "bow":
      if (ph === 2 || ph === 3) arrowFly(c, [hx, hy], u, ph === 2 ? 9 : 15);
      return;
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
export function paintFrame(name: string, p: PoseLike, info: FrameInfo, withShadow: boolean, flash: number, K: number, alt?: DiagAlt): HiCanvas {
  const S = PIX ? 8 : K * SS, N = Math.round(32 * S);
  const body = scratch("body", N, N), c = body.getContext("2d");
  c.scale(S, S);
  const r = alt ? blendRig(rig(name, p, info), rig(name, alt.p, alt.info), alt.diag) : rig(name, p, info), L = r.L, dir = r.dir;
  const under = scratch("under", N, N), uc = under.getContext("2d"); uc.scale(S, S);

  const legs = () => {
    if (L.legs === "robe" || L.legs === "dress") { for (const i of [0, 1]) leg(c, r, i); skirt(c, r); }
    else if (r.R) { far(() => leg(c, r, 0), 0.8); leg(c, r, 1); }
    else { leg(c, r, 0); leg(c, r, 1); }
    if (L.legs === "fur") furKilt(c, r);
  };
  const farArm = () => { far(() => arm(c, r, "far")); };
  const shieldNow = () => { shield(c, r); };
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
    head(c, r);
    if (!behind) weaponNow();
  } else if (dir === "down" && r.diag) {
    // facing down-right: the far (left) arm goes behind the torso, the shield stays in front
    backItem(c, r, false);
    if (!bowHidesFar && !p.farHand) farArm();
    legs(); torso(c, r); backItem(c, r, true); rangedGear(c, r); head(c, r);
    if (p.farHand) farArm(); shieldNow();
    weaponNow(); arm(c, r, "near");
  } else if (dir === "up") {
    const behind = p.attack < 1 || p.attack === 3;
    if (behind) weaponNow();
    legs(); torso(c, r); rangedGear(c, r);
    backItem(c, r, true);
    if (!bowHidesFar) farArm(); shieldNow();
    arm(c, r, "near");
    head(c, r);
    if (!behind) weaponNow();
  } else if (dir === "down") {
    backItem(c, r, false);
    legs(); torso(c, r); backItem(c, r, true); rangedGear(c, r); head(c, r);
    if (!bowHidesFar) farArm(); shieldNow();
    weaponNow(); arm(c, r, "near");
  } else {
    backItem(c, r, false);
    if (!p.farHand && !bowHidesFar) farArm();
    legs(); torso(c, r); backItem(c, r, true); rangedGear(c, r);
    if (!p.farHand) shieldNow();
    head(c, r);
    if (p.farHand) farArm();
    weaponNow(); arm(c, r, "near");
  }

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

// ---------------------------------------------------------------- pixel-art output
const OUTLINE = 0x1a1420;
/**
 * Turns a painted RGBA image (already scaled to the target size) into pixel art in place: alpha becomes 0 or 255,
 * colours are posterized, the top-left edge gets a lighter rim and the silhouette a 1px outline in a deep shade
 * of the colour it wraps.
 */
export function pixelize(d: Uint8ClampedArray | Uint8Array, w: number, h: number, outline = true) {
  const STEP = 12;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 120) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; continue; }
    d[i + 3] = 255;
    for (let k = 0; k < 3; k++) d[i + k] = Math.min(255, Math.round(d[i + k] / STEP) * STEP);
  }
  const hc = new HiCanvas(w, h, 1);
  hc.data.set(d);
  hc.rim(1.16);
  if (outline) hc.selout(OUTLINE);
  d.set(hc.data);
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

function pixelFrame(body: ReturnType<typeof canvas>, under: ReturnType<typeof canvas>, r: Rig, K: number, S: number, flash: number, withShadow: boolean): HiCanvas {
  const W = Math.round(32 * K), N = body.width;
  const b = shrink(body, "pxb", W, W);
  pixelize(b, W, W);
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
