/**
 * Beasts, 3D-built (mob3d.ts, Murat 2026-11-17): the war-hound and the Crown's gildhound, the bone hound of the moors,
 * the carrion vulture and the crown crow, the giant rattler, the desert scorpion and the gullet worm. Each is a model
 * of soft shapes in world px (x forward, y its left, z up) posed per sheet frame (stand, step, wind-up, strike).
 */
import { cap, chain, cone, custom, ell, mat, noise3, rng, sphere, torus, type Model, type Prim, type V3 } from "./mob3d";
import type { HoundPalette, BirdPalette } from "./badlands";

/** The same model S times bigger (a distance field scales as S * d(p / S)). */
function scaleModel(m: Model, S: number): Model {
  const sv = (p: V3): V3 => [p[0] * S, p[1] * S, p[2] * S];
  return {
    ...m, prims: m.prims.map((p) => ({ ...p, k: p.k * S, lo: sv(p.lo), hi: sv(p.hi), d: (x: number, y: number, z: number) => S * p.d(x / S, y / S, z / S) })),
    eyes: m.eyes?.map((e) => ({ ...e, p: sv(e.p) })), halos: m.halos?.map((h) => ({ ...h, p: sv(h.p), r: h.r * S })),
    shadow: { ...m.shadow, x: m.shadow.x * S, y: m.shadow.y * S, rx: m.shadow.rx * S, ry: m.shadow.ry * S }, lift: m.lift !== undefined ? m.lift * S : undefined,
  };
}

export type Pose = "stand" | "step" | "wind" | "strike";
const v = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const fur = (c: number, g = 0.3) => mat(c, { lo: 0.36, hi: 1.3, grain: g });
const boneM = (c = 0xd6ceb4) => mat(c, { lo: 0.36, hi: 1.22, grain: 0.18, spec: 0.12 });

// ------------------------------------------------------------------ hounds
/** A heavy war dog (or a lean sighthound with `lean`): deep chest, studded collar, paint on the shoulder, bristling mane. */
export function hound(pal: HoundPalette, pose: Pose, f: number, o: { lean?: boolean } = {}): Model {
  const P: Prim[] = [], step = pose === "step", wind = pose === "wind", strike = pose === "strike";
  const F = fur(pal.fur), D = fur(pal.furD), Lm = fur(pal.furL, 0.2), iron = mat(pal.iron, { spec: 0.8, lo: 0.3, hi: 1.3, grain: 0.15 });
  const stud = mat(pal.stud, { spec: 1, lo: 0.4, hi: 1.3 }), paint = mat(pal.paint, { lo: 0.4, hi: 1.25, grain: 0.15 });
  const k = o.lean ? 0.88 : 1, kw = (o.lean ? 1.15 : 1.32) * k, bz = 8.6 * (o.lean ? 1.05 : 1) - (wind ? 1.1 : 0), bx = strike ? 2.2 : wind ? -1.4 : 0;
  const at = (x: number, y: number, z: number): V3 => [bx + x, y, z + (wind ? -x * 0.05 : strike ? x * 0.04 : 0)];
  // body: haunch, barrel, deep chest, pale underside, dark mane along the back
  P.push(ell(at(-5.4, 0, bz + 0.3), [4.4, 3.5 * kw, 4.2], F, { k: 1.6 }));
  P.push(ell(at(0, 0, bz + 0.4), [6.4, 3.2 * kw, 3.6 * k], F, { k: 1.6 }));
  P.push(ell(at(4.8, 0, bz + 0.6), [4.4, 3.6 * kw, 4.6], F, { k: 1.6, pitch: -0.15 }));
  P.push(ell(at(3.2, 0, bz - 2.6), [4.6, 2.4 * kw, 2.0], Lm, { k: 1.2 }));
  for (let i = 0; i < 9; i++) { const x = -7 + i * 1.75; P.push(cone(at(x, 0, bz + 2.8 + Math.abs(x - 1) * -0.06), at(x - 0.9, (i % 2 ? 0.4 : -0.4), bz + 4.6 + (i % 3) * 0.3), 0.85, D)); }
  // war-paint stripes on the near and far shoulder
  for (const s of [1, -1]) for (const dx of [0, 1.5, 3.0]) P.push(ell(at(3.0 + dx, s * 3.3 * kw, bz + 1.2), [0.35, 0.3, 2.0], paint, { k: 0.2, pitch: 0.3 }));
  // neck, collar, head
  const hd = at(10.2 + (strike ? 1.6 : 0), 0, bz + (wind ? 1.4 : 2.6) + (strike ? -0.6 : 0));
  P.push(cap(at(6.5, 0, bz + 1.4), hd, 3.4 * k, 2.6 * k, F, { k: 1.2 }));
  const cc = at(7.9, 0, bz + 2.2);
  P.push(torus(cc, 2.6 * k, 0.55, iron, { tilt: 0 }));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, q: V3 = [cc[0], cc[1] + Math.cos(a) * 3.1 * k, cc[2] + Math.sin(a) * 3.1 * k]; P.push(cone(q, [q[0], cc[1] + Math.cos(a) * 4.3 * k, cc[2] + Math.sin(a) * 4.3 * k], 0.42, stud)); }
  P.push(ell(hd, [3.3, 3.0 * k, 2.8], F, { k: 0.8 }));
  const open = wind ? 1.2 : strike ? 1.8 : step ? 0.35 : 0.2;
  const mu = v(hd, [2.2, 0, -0.4]);
  P.push(cap(mu, v(mu, [3.6, 0, -0.2]), 1.6 * k, 1.1, Lm, { k: 0.6 })); // muzzle
  P.push(sphere(v(mu, [3.9, 0, 0.0]), 0.7, mat(0x120808, { lo: 0.5, hi: 1.4 }), { k: 0.2 })); // nose
  P.push(cap(v(hd, [1.6, 0, -1.8]), v(hd, [5.0, 0, -1.8 - open]), 1.05, 0.7, D, { k: 0.4 })); // lower jaw
  const tooth = mat(pal.tooth, { lo: 0.5, hi: 1.1, n: 4 });
  if (open > 0.5) {
    P.push(cap(v(hd, [2.6, 0, -1.2]), v(hd, [4.4, 0, -1.4 - open * 0.5]), 0.8, 0.6, mat(0x3a0a0e), { k: 0.2 }));
    for (const s of [-1, 1]) { P.push(cone(v(mu, [3.0, s * 0.8, -0.9]), v(mu, [3.1, s * 0.8, -2.0]), 0.32, tooth)); P.push(cone(v(hd, [4.4, s * 0.6, -1.6 - open]), v(hd, [4.4, s * 0.6, -0.6 - open]), 0.3, tooth)); }
  }
  for (const s of [-1, 1]) { const e = v(hd, [-0.8, s * 1.7 * k, 1.6]); P.push(cone(e, v(e, [-1.4, s * 0.5, s > 0 ? 2.6 : 2.0]), 1.0, D)); } // ears (one torn short)
  // legs: trot in diagonal pairs on the step frame
  const legs = [{ x: 5.0, s: 1, front: true, ph: 0 }, { x: 5.0, s: -1, front: true, ph: 1 }, { x: -5.4, s: 1, front: false, ph: 1 }, { x: -5.4, s: -1, front: false, ph: 0 }];
  for (const L of legs) {
    const swing = step ? (L.ph ? 1.8 : -1.6) : wind ? (L.front ? -0.8 : 1.2) : strike ? (L.front ? 2.4 : -2.0) : 0;
    const lift = step && L.ph ? 1.4 : 0;
    const hip = at(L.x, L.s * 2.6 * kw, bz - 1.2), paw: V3 = [hip[0] + swing + (L.front ? 0.6 : -0.4), L.s * 3.1 * kw, 0.75 + lift];
    const knee: V3 = L.front ? [(hip[0] + paw[0]) / 2 - 0.3, L.s * 3.0 * kw, (hip[2] + paw[2]) / 2 + 0.2] : [(hip[0] + paw[0]) / 2 - 1.6, L.s * 3.0 * kw, (hip[2] + paw[2]) / 2 + 1.2];
    P.push(cap(hip, knee, L.front ? 2.0 : 2.5, 1.2, F, { k: 1.0 }));
    P.push(cap(knee, paw, 1.15, 0.9, F, { k: 0.6 }));
    P.push(ell(v(paw, [0.6, 0, -0.05]), [1.35, 1.0, 0.7], D, { k: 0.4 }));
  }
  // tail: a thick brush held low
  const tw = step ? 0.8 : -0.4;
  P.push(...chain([at(-9.0, 0, bz + 1.4), at(-12.0, tw, bz + 0.4), at(-13.4, tw * 1.5, bz - 2.2)], 1.5, 0.9, F));
  const eyes = [-1, 1].map((s) => ({ p: v(hd, [2.3, s * 1.3 * k, 0.75]) as V3, col: pal.eye }));
  return { prims: P, eyes, shadow: { x: bx, y: 0, rx: 13, ry: 5.2, a: 0.42 } };
}

/** The bone hound of the moors: a hound's skeleton running low, scraps of hide on its haunch, a bronze collar, cold eyes. */
export function boneHound(pose: Pose, f: number): Model {
  const P: Prim[] = [], step = pose === "step", wind = pose === "wind", strike = pose === "strike";
  const B = boneM(), hide = mat(0x3a3430, { lo: 0.4, hi: 1.3, grain: 0.3 }), bronze = mat(0xa07a3a, { spec: 0.8, lo: 0.35, hi: 1.3 }), dark = mat(0x120d10, { lo: 0.6, hi: 1 });
  const bz = 7.4 - (wind ? 1 : 0), bx = strike ? 2 : wind ? -1.2 : 0;
  const at = (x: number, y: number, z: number): V3 => [bx + x, y, z];
  // spine: vertebrae from the tail root to the skull, ribs hooped under it
  for (let i = 0; i <= 10; i++) { const x = -6.5 + i * 1.35; P.push(sphere(at(x, 0, bz + 1.6 + Math.sin(i / 10 * Math.PI) * 0.6), 0.62, B, { k: 0.3 })); P.push(cone(at(x, 0, bz + 2.0), at(x - 0.4, 0, bz + 3.0), 0.3, B)); }
  P.push(ell(at(3.6, 0, bz - 0.2), [3.2, 3.2, 2.9], dark, { k: 0.3 })); // the hollow of the chest, dark between the ribs
  for (let i = 0; i < 4; i++) {
    const x = 1.8 + i * 1.2;
    P.push(custom(at(x - 1, -4, bz - 4), at(x + 1, 4, bz + 3), (px, py, pz) => {
      const qy = py, qz = pz - (bz - 0.2);
      const ring = Math.hypot(Math.hypot(qy / 3.6, qz / 3.2) - 1, (px - bx - x) / 0.4) * 2.4;
      return Math.max(ring - 0.32, -(qz + 2.4));
    }, B, { k: 0.15 }));
  }
  P.push(ell(at(-5.5, 0, bz + 0.6), [2.4, 2.8, 1.7], B, { k: 0.5 })); // pelvis
  P.push(ell(at(-5.6, 0, bz + 0.2), [2.8, 3.3, 2.4], hide, { k: 0.3, pitch: 0.2 })); // hide scraps on the haunch
  // skull on the neck
  const hd = at(8.6 + (strike ? 1.6 : 0), 0, bz + (wind ? 1.2 : 2.4));
  P.push(...chain([at(6.4, 0, bz + 1.8), at(7.6, 0, bz + 2.3), hd], 0.6, 0.55, B));
  P.push(torus(at(6.9, 0, bz + 2.0), 1.4, 0.38, bronze));
  P.push(cap(at(6.9, -1.0, bz + 1.0), at(6.4, -1.6, bz - 1.4), 0.25, 0.25, bronze, { k: 0.1 })); // chain stub
  P.push(ell(hd, [2.6, 2.2, 2.0], B, { k: 0.5 }));
  const open = wind ? 1 : strike ? 1.6 : 0.3;
  P.push(cap(v(hd, [1.2, 0, -0.1]), v(hd, [4.2, 0, -0.4]), 1.05, 0.7, B, { k: 0.4 }));
  P.push(cap(v(hd, [1.0, 0, -1.2]), v(hd, [3.8, 0, -1.3 - open]), 0.65, 0.45, B, { k: 0.2 }));
  for (const s of [-1, 1]) { P.push({ ...sphere(v(hd, [1.5, s * 1.25, 0.5]), 0.8, dark, { k: 0.2 }), cut: true }); P.push(cone(v(hd, [0.0, s * 1.0, 1.0]), v(hd, [-1.2, s * 1.2, 2.4]), 0.55, B)); }
  for (let k = 0; k < 3; k++) P.push(cone(v(hd, [2.4 + k * 0.6, 0.5 - k * 0.5, -0.8]), v(hd, [2.5 + k * 0.6, 0.5 - k * 0.5, -1.6]), 0.22, mat(0xf0ead8, { lo: 0.6, hi: 1.1, n: 3 })));
  const legs = [{ x: 4.2, s: 1, front: true, ph: 0 }, { x: 4.2, s: -1, front: true, ph: 1 }, { x: -5.4, s: 1, front: false, ph: 1 }, { x: -5.4, s: -1, front: false, ph: 0 }];
  for (const L of legs) {
    const swing = step ? (L.ph ? 1.6 : -1.4) : wind ? (L.front ? -0.8 : 1.0) : strike ? (L.front ? 2.2 : -1.8) : 0, lift = step && L.ph ? 1.3 : 0;
    const hip = at(L.x, L.s * 2.5, bz - 0.6), paw: V3 = [hip[0] + swing, L.s * 3.0, 0.5 + lift];
    const knee: V3 = L.front ? [(hip[0] + paw[0]) / 2 - 0.3, L.s * 2.9, (hip[2] + paw[2]) / 2 + 0.2] : [(hip[0] + paw[0]) / 2 - 1.4, L.s * 2.9, (hip[2] + paw[2]) / 2 + 1.0];
    P.push(cap(hip, knee, 0.7, 0.55, B, { k: 0.2 }), sphere(knee, 0.75, B, { k: 0.2 }), cap(knee, paw, 0.45, 0.38, B, { k: 0.2 }), ell(v(paw, [0.5, 0, 0]), [1.0, 0.7, 0.4], B, { k: 0.2 }));
  }
  P.push(...chain([at(-7.6, 0, bz + 1.4), at(-9.4, step ? 0.6 : -0.3, bz + 0.6), at(-10.8, step ? 0.9 : -0.5, bz - 0.8)], 0.5, 0.3, B));
  const eyes = [-1, 1].map((s) => ({ p: v(hd, [1.5, s * 1.2, 0.5]) as V3, col: 0x9ae4ff }));
  return { prims: P, eyes, shadow: { x: bx, y: 0, rx: 11, ry: 4.2, a: 0.4 } };
}

// ------------------------------------------------------------------ birds
/** A carrion bird hanging over its prey: broad ragged wings, a bare head on a long neck out of a ruff, a hooked beak, talons. */
export function bird(pal: BirdPalette, pose: Pose, f: number, o: { bald?: boolean } = {}): Model {
  const P: Prim[] = [], step = pose === "step", wind = pose === "wind", strike = pose === "strike";
  const PL = fur(pal.plume, 0.25), PLL = fur(pal.plumeL, 0.25), ruff = fur(pal.ruff, 0.35), skin = mat(pal.skin, { lo: 0.4, hi: 1.3, grain: 0.15 });
  const beak = mat(pal.beak, { spec: 0.6, lo: 0.4, hi: 1.25 }), talon = mat(pal.talon, { lo: 0.4, hi: 1.3 });
  const z0 = 14 + (step ? 1.2 : 0) + (wind ? 2 : 0) - (strike ? 2.5 : 0), bx = strike ? 2.5 : wind ? -1 : 0;
  const tilt = strike ? 0.5 : wind ? -0.25 : 0.12;
  const at = (x: number, y: number, z: number): V3 => [bx + x * Math.cos(tilt), y, z0 + z - x * Math.sin(tilt)];
  P.push(ell(at(0, 0, 0), [5.2, 3.4, 3.4], PL, { k: 1.2, pitch: -tilt }));
  P.push(ell(at(-5.5, 0, 0.6), [3.6, 2.6, 0.9], PL, { k: 0.8, pitch: -tilt - 0.2 })); // tail fan
  P.push(ell(at(3.4, 0, 1.4), [2.2, 3.0, 2.4], ruff, { k: 0.9 })); // ruff round the neck
  const hd = at(6.2 + (strike ? 1 : 0), 0, (wind ? 4.4 : 3.4) - (strike ? 1.4 : 0));
  P.push(cap(at(4.0, 0, 2.0), hd, 1.1, 0.95, o.bald ? skin : PL, { k: 0.6 }));
  P.push(ell(hd, [1.5, 1.25, 1.3], o.bald ? skin : PL, { k: 0.5 }));
  const tip = v(hd, [2.8, 0, -1.2]);
  P.push(cap(v(hd, [1.0, 0, 0]), v(hd, [2.4, 0, -0.2]), 0.75, 0.55, beak, { k: 0.3 }), cap(v(hd, [2.4, 0, -0.2]), tip, 0.55, 0.15, beak, { k: 0.2 }));
  if (wind || strike) P.push(cap(v(hd, [1.1, 0, -0.7]), v(hd, [2.3, 0, -1.4]), 0.4, 0.25, beak, { k: 0.1 }));
  // wings: broad ragged sails of feathers, beating per frame (down on the step, up and back on the wind-up)
  const flap = wind ? 0.9 : strike ? -0.5 : step ? -0.25 : 0.35 + Math.sin(f * 1.3) * 0.15;
  for (const s of [-1, 1]) {
    const root = at(0.6, s * 2.6, 1.4), dir: V3 = [-0.15, s * Math.cos(flap), Math.sin(flap)];
    const n = 6;
    for (let i = 0; i < n; i++) { // primaries: long flat feathers fanning from the arm
      const t = i / (n - 1), along = 3 + t * 9, base = v(root, [dir[0] * along - 0.3, dir[1] * along, dir[2] * along]);
      const len = 5.2 - Math.abs(t - 0.7) * 3.5, fx = -0.65 - t * 0.35;
      const end: V3 = v(base, [fx * len, dir[1] * len * 0.35, dir[2] * len * 0.35 - 0.6]);
      P.push(cap(base, end, 1.2 - t * 0.3, 0.35, i % 2 ? PL : PLL, { k: 0.4 }));
    }
    P.push(cap(root, v(root, [dir[0] * 12, dir[1] * 12, dir[2] * 12]), 1.5, 0.8, PL, { k: 0.8 })); // the arm
  }
  // legs hang with talons out
  const reach = strike ? 2.2 : 0.4;
  for (const s of [-1, 1]) {
    const hip = at(0.5, s * 1.4, -2.2), foot: V3 = v(hip, [reach + 0.6, s * 0.3, -3.2]);
    P.push(cap(hip, foot, 0.65, 0.45, skin, { k: 0.3 }));
    for (const a of [-0.6, 0, 0.6]) P.push(cone(foot, v(foot, [Math.cos(a) * 1.4, s * 0 + Math.sin(a) * 1.2, -0.8]), 0.28, talon));
  }
  const eyes = [-1, 1].map((s) => ({ p: v(hd, [1.0, s * 1.05, 0.35]) as V3, col: pal.eye }));
  return { prims: P, eyes, shadow: { x: bx, y: 0, rx: 9, ry: 6, a: 0.32 } };
}

// ------------------------------------------------------------------ the rattler
/** A giant rattlesnake in a coil, head raised, rattle up behind it; the diamond back shows on every ring. */
export function rattler(pose: Pose, f: number): Model {
  const P: Prim[] = [], step = pose === "step", wind = pose === "wind", strike = pose === "strike";
  const scale = mat(0xa6824a, { lo: 0.36, hi: 1.3, grain: 0.25 }), dia = mat(0x4a301c, { lo: 0.45, hi: 1.25, grain: 0.15 }), belly = mat(0xd8c49a, { lo: 0.45, hi: 1.2 });
  const rattle = mat(0xc8b48a, { lo: 0.4, hi: 1.25, grain: 0.1 });
  // the coil: a spiral of fat rings on the ground
  const pts: V3[] = [];
  for (let i = 0; i <= 22; i++) { const t = i / 22, a = -0.6 + t * Math.PI * 3.1 + (step ? 0.2 : 0), r = 7.4 - t * 4.0; pts.push([-1.6 + Math.cos(a) * r, Math.sin(a) * r, 2.0 + t * 1.6]); }
  for (let i = 1; i < pts.length; i++) {
    P.push(cap(pts[i - 1], pts[i], 2.4 - i * 0.025, 2.4 - i * 0.025, scale, { k: 0.4 }));
    if (i % 2 === 0) P.push(ell(v(pts[i], [0, 0, 1.9]), [1.2, 1.2, 0.5], dia, { k: 0.2, yaw: Math.PI / 4 }));
  }
  // the neck rears up out of the coil, S-curved back on the wind-up, thrown forward on the strike
  const last = pts[pts.length - 1];
  const rear = wind ? [-1.0, 11.5] : strike ? [6.5, 7.0] : [1.4, 10.4 + (step ? 0.6 : 0)];
  const neck: V3[] = [last, v(last, [1.8, 0, 2.4]), [rear[0] * 0.6 + 1, 0, rear[1] - 2], [rear[0] + 2, 0, rear[1]]];
  for (let i = 1; i < neck.length; i++) P.push(cap(neck[i - 1], neck[i], 2.2 - i * 0.2, 2.2 - (i + 1) * 0.2, scale, { k: 0.5 }));
  P.push(ell(v(neck[2], [0.9, 0, -0.4]), [0.6, 1.0, 1.8], belly, { k: 0.4 }));
  const hd = v(neck[3], [1.6, 0, 0.3]);
  P.push(ell(hd, [3.0, 2.3, 1.3], scale, { k: 0.6, pitch: strike ? -0.2 : 0 }));
  P.push(ell(v(hd, [-0.2, 0, 0.95]), [1.9, 1.6, 0.35], dia, { k: 0.2 }));
  if (wind || strike) { // jaws open, fangs out
    const open = strike ? 1.8 : 1.1;
    P.push(ell(v(hd, [1.2, 0, -1.0 - open * 0.4]), [1.6, 1.3, 0.45], belly, { k: 0.3, pitch: -0.5 }));
    P.push(ell(v(hd, [1.3, 0, -0.75]), [1.2, 1.0, 0.5], mat(0x5a1018), { k: 0.2 }));
    for (const s of [-1, 1]) P.push(cone(v(hd, [2.0, s * 0.6, -0.7]), v(hd, [2.3, s * 0.6, -0.7 - open]), 0.25, mat(0xf4ecd8, { lo: 0.6, hi: 1.1, n: 3 })));
  }
  // the rattle stands up from the coil's tail end
  const t0 = pts[0], buzz = (f % 2 ? 0.35 : -0.35) * (wind ? 1.6 : 1);
  for (let i = 0; i < 5; i++) P.push(ell(v(t0, [-0.6 - i * 0.1, buzz * i * 0.3, 1.6 + i * 0.95]), [0.75 - i * 0.06, 0.6, 0.48], rattle, { k: 0.1 }));
  const eyes = [-1, 1].map((s) => ({ p: v(hd, [1.5, s * 1.5, 0.55]) as V3, col: 0xffd040 }));
  return { prims: P, eyes, shadow: { x: -1, y: 0, rx: 10.5, ry: 9, a: 0.42 } };
}

// ------------------------------------------------------------------ the scorpion
/** A desert scorpion: plated body, eight jointed legs, two big pincers, a segmented tail arched over its back with a venom sting. */
export function scorpion(pose: Pose, f: number): Model {
  const P: Prim[] = [], step = pose === "step", wind = pose === "wind", strike = pose === "strike";
  const SH = mat(0x8a4220, { spec: 0.6, shine: 22, lo: 0.32, hi: 1.3, grain: 0.1 }), DK = mat(0x3a2412, { spec: 0.4, lo: 0.4, hi: 1.3 });
  const sting = mat(0x24160c, { spec: 0.8, lo: 0.4, hi: 1.4 }), venom = mat(0x9dff6a, { emit: 0.8, lo: 0.6, hi: 1.3 });
  const bz = 3.2, bx = strike ? 1.2 : wind ? -0.8 : 0;
  const at = (x: number, y: number, z: number): V3 => [bx + x, y, z];
  // body plates: head-shield, then the back plates
  P.push(ell(at(3.2, 0, bz), [3.0, 3.2, 1.4], SH, { k: 0.5 }));
  for (let i = 0; i < 4; i++) P.push(ell(at(0.6 - i * 2.0, 0, bz + 0.2), [1.4, 3.3 - i * 0.25, 1.5], SH, { k: 0.25 }));
  P.push(ell(at(-1.6, 0, bz - 0.9), [4.6, 2.6, 0.8], DK, { k: 0.5 }));
  // eight legs, four a side, alternating on the step
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const hip = at(2.0 - i * 1.8, s * 2.6, bz - 0.3), ph = (i + (s > 0 ? 0 : 1)) % 2 ? 1 : -1, sw = step ? ph * 0.9 : 0;
    const knee = at(2.6 - i * 2.2 + sw, s * 5.6, bz + 1.5), foot = at(3.0 - i * 2.6 + sw * 1.4, s * 7.2, 0.25 + (step && ph > 0 ? 0.8 : 0));
    P.push(cap(hip, knee, 0.55, 0.42, DK, { k: 0.2 }), cap(knee, foot, 0.42, 0.18, DK, { k: 0.15 }));
  }
  // pincers on long arms, opening on the wind-up, snapping on the strike
  const reach = strike ? 3.2 : wind ? -0.6 : 0, gape = wind ? 0.7 : strike ? 0.1 : 0.35;
  for (const s of [-1, 1]) {
    const sh = at(4.4, s * 2.2, bz + 0.3), el = at(7.0 + reach * 0.5, s * 4.6, bz + 1.0), cl = at(9.6 + reach, s * 3.6, bz + 1.2);
    P.push(cap(sh, el, 0.8, 0.75, SH, { k: 0.2 }), cap(el, cl, 0.75, 1.1, SH, { k: 0.2 }));
    P.push(ell(cl, [1.9, 1.3, 1.1], SH, { k: 0.4, yaw: -s * 0.4 }));
    P.push(cap(v(cl, [1.2, -s * 0.2, 0.2]), v(cl, [3.6, -s * (0.5 + gape), 0.3]), 0.55, 0.15, SH, { k: 0.15 }));
    P.push(cap(v(cl, [1.0, s * 0.4, -0.1]), v(cl, [3.3, s * (0.9 - gape * 0.4), -0.1]), 0.5, 0.15, DK, { k: 0.15 }));
  }
  // tail: five segments arching up and over, the sting curling forward
  const arch = wind ? 1.25 : strike ? 0.55 : 1, fw = strike ? 4 : 0;
  const tail: V3[] = [at(-7.0, 0, bz + 0.6), at(-9.6, 0, bz + 2.6 * arch), at(-10.6, 0, bz + 6.0 * arch), at(-9.4 + fw * 0.4, 0, bz + 9.2 * arch), at(-6.6 + fw, 0, bz + 10.6 * arch - fw * 0.5), at(-4.2 + fw * 1.4, 0, bz + 9.8 * arch - fw)];
  for (let i = 1; i < tail.length; i++) { P.push(cap(tail[i - 1], tail[i], 1.25 - i * 0.07, 1.2 - i * 0.07, SH, { k: 0.15 })); P.push(sphere(tail[i], 1.25 - i * 0.07, SH, { k: 0.2 })); }
  const tip = tail[tail.length - 1];
  P.push(ell(v(tip, [0.8, 0, -0.2]), [1.4, 1.0, 1.0], venom, { k: 0.4 }));
  P.push(cone(v(tip, [1.6, 0, -0.4]), v(tip, [2.4, 0, -2.0]), 0.5, sting));
  const eyes = [-1, 1].map((s) => ({ p: at(5.6, s * 0.8, bz + 1.0), col: 0xffb030 }));
  return { prims: P, eyes, halos: [{ p: v(tip, [0.8, 0, -0.2]), r: 2.4, col: 0x9dff6a, a: 0.3 }], shadow: { x: bx - 1, y: 0, rx: 11, ry: 7.5, a: 0.42 } };
}

// ------------------------------------------------------------------ the gullet worm
/** Bone-pale and ringed, rearing out of a mound of spoil, no eyes, a round maw of teeth in rings. */
export function sinkworm(pose: Pose, f: number): Model {
  const P: Prim[] = [], step = pose === "step", wind = pose === "wind", strike = pose === "strike";
  const earth = mat(0x5a4632, { lo: 0.36, hi: 1.3, grain: 0.45 }), stone = mat(0x7a756a, { lo: 0.4, hi: 1.25, grain: 0.2 }), moss = mat(0x4a5a2a, { lo: 0.4, hi: 1.2, grain: 0.3 });
  const pale = mat(0xd8ccb4, { lo: 0.34, hi: 1.25, grain: 0.1, spec: 0.35 }), crease = mat(0x6a5a4a, { lo: 0.4, hi: 1.1 });
  const r = rng(77);
  // the mound
  P.push(custom([-9, -9, -0.5], [9, 9, 5], (x, y, z) => {
    const d = Math.hypot(x / 8.4, y / 7.6, z / 3.6) - 1;
    return Math.max(d * 3 + (noise3(x * 0.7, y * 0.7, z * 0.7) - 0.5) * 0.9, -z);
  }, earth, { k: 0.3 }));
  for (let i = 0; i < 5; i++) { const a = r() * 6.3, d = 4 + r() * 3.5; P.push(ell([Math.cos(a) * d, Math.sin(a) * d, 1.4], [1.1, 0.9, 0.7], stone, { k: 0.3, yaw: a })); }
  P.push(ell([-3.2, 3.4, 2.8], [2.2, 1.6, 0.5], moss, { k: 0.6 }));
  // the body: rings from the mound up to the maw, swaying
  const rise = wind ? 1.1 : strike ? 0.85 : step ? 0.95 : 1;
  const lean = wind ? -2.0 : strike ? 4.5 : step ? 0.6 : 0;
  const pts: V3[] = [];
  for (let i = 0; i <= 9; i++) { const t = i / 9; pts.push([lean * t * t + Math.sin(t * 3 + f * 0.6) * 0.6, Math.cos(t * 2.4) * 0.5 - 0.5, 1.5 + t * 11 * rise - (strike ? t * t * 3 : 0)]); }
  for (let i = 1; i < pts.length; i++) {
    const rr = 4.3 - i * 0.1;
    P.push(cap(pts[i - 1], pts[i], rr, rr - 0.07, pale, { k: 0.4 }));
    if (i < pts.length - 1) P.push(torus(pts[i], rr - 0.05, 0.36, crease, { k: 0.15 }));
  }
  // the maw: a flared lip facing forward and up, teeth in rings spiralling inward
  const top = pts[pts.length - 1], mc: V3 = v(top, [1.4 + (strike ? 1 : 0), 0, 0.4]);
  const tiltM = strike ? 0.6 : wind ? -0.2 : 0.25;
  P.push(ell(mc, [2.4, 4.8, 4.8], pale, { k: 0.6, pitch: tiltM }));
  P.push({ ...ell(v(mc, [1.6, 0, 0.3]), [1.8, 3.6, 3.6], mat(0x2a0a10, { lo: 0.5, hi: 1.2 }), { k: 0.3, pitch: tiltM }), cut: true });
  const tooth = mat(0xf0e8d0, { lo: 0.55, hi: 1.15, n: 4 });
  for (const [ring, n, len] of [[3.3, 13, 1.2], [2.2, 10, 0.95], [1.2, 7, 0.7]] as const) for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + ring, q: V3 = v(mc, [1.5 - (3.3 - ring) * 0.6, Math.cos(a) * ring, Math.sin(a) * ring * Math.cos(tiltM) + 0.3]);
    P.push(cone(q, v(q, [0.2, -Math.cos(a) * len, -Math.sin(a) * len]), 0.28, tooth));
  }
  return { prims: P, shadow: { x: 0, y: 0, rx: 9, ry: 8, a: 0.35 } };
}

// ------------------------------------------------------------------ the crawler
/** The top half of a skeleton dragging itself along on its arms: skull up, ribs on the ground, a broken spine trailing. */
export function crawler(pose: Pose, f: number): Model {
  const P: Prim[] = [], step = pose === "step", wind = pose === "wind", strike = pose === "strike";
  const B = boneM(), dark = mat(0x120d10, { lo: 0.6, hi: 1 }), rag = mat(0x3b3640, { lo: 0.4, hi: 1.3, grain: 0.3 });
  const bx = (strike ? 2.4 : wind ? -1.2 : 0) - 2.6, rise = wind ? 2.2 : strike ? 0.6 : 0;
  const at = (x: number, y: number, z: number): V3 => [bx + x, y, z];
  // spine from the broken end up to the neck, ribcage hooped round it
  const sp: V3[] = [at(-9, 0.4, 1.4), at(-6, 0, 2.2), at(-3, 0, 3.0 + rise * 0.3), at(0.5, 0, 4.0 + rise * 0.6), at(3.5, 0, 5.2 + rise)];
  P.push(...chain(sp, 0.55, 0.65, B));
  for (let i = 0; i < sp.length; i++) P.push(sphere(sp[i], 0.75, B, { k: 0.2 }));
  P.push(ell(at(-0.6, 0, 3.0 + rise * 0.5), [3.0, 2.6, 2.2], dark, { k: 0.3 }));
  for (let i = 0; i < 4; i++) {
    const x = -2.6 + i * 1.2, cz = 3.0 + rise * 0.5;
    P.push(custom(at(x - 1, -4, cz - 4), at(x + 1, 4, cz + 4), (px, py, pz) => {
      const ring = Math.hypot(Math.hypot(py / 2.9, (pz - cz) / 2.4) - 1, (px - bx - x) / 0.42) * 2.3;
      return Math.max(ring - 0.32, -(pz - 0.6));
    }, B, { k: 0.15 }));
  }
  P.push(ell(at(-8.6, 0.4, 1.6), [1.4, 1.6, 0.9], rag, { k: 0.5 })); // grave-rag on the broken end
  // the skull, raised, jaw working
  const hd = at(5.8, 0, 7.0 + rise);
  P.push(ell(hd, [2.3, 2.0, 2.1], B, { k: 0.5 }), ell(v(hd, [1.2, 0, -1.3]), [1.5, 1.5, 1.0], B, { k: 0.6 }));
  const open = strike ? 0.9 : wind ? 0.6 : 0.2;
  P.push(ell(v(hd, [1.2, 0, -2.3 - open]), [1.2, 1.2, 0.5], B, { k: 0.2 }));
  for (const s of [-1, 1]) P.push({ ...sphere(v(hd, [1.7, s * 0.85, 0.1]), 0.75, dark, { k: 0.3 }), cut: true });
  // arms: one reaching forward to claw the ground, the other pulling back, swapping on the step
  for (const s of [-1, 1]) {
    const reach = (step ? (s > 0 ? 1 : -1) : 0) * 2.4 + (strike ? 3.5 : wind ? -1 : 0) + (s > 0 ? 0.8 : -0.8);
    const sh = at(2.4, s * 2.6, 4.6 + rise), hand: V3 = at(6.5 + reach, s * 4.0, 0.6 + (strike && s > 0 ? 3 : 0));
    const el: V3 = [(sh[0] + hand[0]) / 2 - 0.6, s * 4.6, Math.max(sh[2], hand[2]) + 1.6];
    P.push(cap(sh, el, 0.6, 0.5, B, { k: 0.2 }), sphere(el, 0.7, B, { k: 0.2 }), cap(el, hand, 0.5, 0.4, B, { k: 0.2 }));
    for (let k = -1; k <= 1; k++) P.push(cap(hand, v(hand, [1.4, k * 0.5, -0.4]), 0.25, 0.12, B, { k: 0.1 }));
  }
  const eyes = [-1, 1].map((s) => ({ p: v(hd, [1.9, s * 0.8, 0.1]) as V3, col: 0xff5a3c }));
  return scaleModel({ prims: P, eyes, shadow: { x: bx, y: 0, rx: 11, ry: 5.5, a: 0.4 } }, 1.28);
}

// ------------------------------------------------------------------ the mist wraith
/** A hooded shape of grey-white mist, no legs, its body trailing to a swaying tail; long thin hands, a cold core, two cold eyes. */
export function mistWraith(pose: Pose, f: number): Model {
  const P: Prim[] = [], wind = pose === "wind", strike = pose === "strike";
  const mist = mat(0xb8c4cc, { lo: 0.4, hi: 1.25, jelly: 0.45, spec: 0.3, grain: 0.15 }), core = mat(0x7ae8ff, { emit: 1, lo: 0.7, hi: 1.4 });
  const hoodIn = mat(0x0c1014, { lo: 0.6, hi: 1 }), hand = mat(0xd0dce2, { lo: 0.45, hi: 1.2, jelly: 0.25 });
  const sw = Math.sin(f * 1.3) * 1.2, lean = strike ? 2.2 : wind ? -1.2 : 0;
  // the body: a cloak of mist from the hood down to a tail curling behind
  const pts: V3[] = [[lean, 0, 21], [lean * 0.7, 0, 16], [-0.4, sw * 0.4, 10.5], [-1.4, sw, 5.5], [-2.2, sw * 1.8, 1.2]];
  const rs = [3.5, 4.7, 4.1, 2.5, 0.6];
  for (let i = 1; i < pts.length; i++) P.push(cap(pts[i - 1], pts[i], rs[i - 1], rs[i], mist, { k: 0.8 }));
  const hd: V3 = [lean + 0.6, 0, 22.2];
  P.push(ell(hd, [3.0, 3.0, 3.2], mist, { k: 0.8 }));
  P.push({ ...ell(v(hd, [2.3, 0, -0.5]), [1.6, 1.9, 2.1], hoodIn, { k: 0.3 }), cut: true });
  P.push({ ...ell([lean * 0.7 + 0.4, 0, 16], [1.5, 1.5, 1.7], core, { k: 0.4 }), inner: true });
  // long thin arms reaching out, clawing on the strike
  for (const s of [-1, 1]) {
    const sh: V3 = [lean * 0.8, s * 3.6, 18.5], reach = strike ? 6 : wind ? 1.5 : 3.0, up = wind ? 4 : strike ? -1 : 0;
    const hnd: V3 = [lean + reach * 0.5, s * (wind ? 10 : 8.5), 13 + up + (s > 0 ? sw * 0.4 : -sw * 0.4)];
    const elb: V3 = [(sh[0] + hnd[0]) / 2, s * 6.4, (sh[2] + hnd[2]) / 2 + 0.6];
    P.push(cap(sh, elb, 1.0, 0.5, mist, { k: 0.6 }), cap(elb, hnd, 0.45, 0.32, hand, { k: 0.3 }));
    for (let k = -1; k <= 1; k++) P.push(cap(hnd, v(hnd, [0.6, s * 1.4, -1.0 + k * 0.7]), 0.25, 0.08, hand, { k: 0.1 }));
  }
  const eyes = [-1, 1].map((s) => ({ p: v(hd, [2.0, s * 0.8, -0.2]) as V3, col: 0x9ae4ff }));
  return { prims: P, eyes, halos: [{ p: [lean * 0.7 + 0.4, 0, 16], r: 4, col: 0x7ae8ff, a: 0.25 }], shadow: { x: 0, y: 0, rx: 6.5, ry: 4, a: 0.35 }, lift: 3 + Math.sin(f * 1.7) * 1.2 };
}
