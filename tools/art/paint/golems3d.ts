/**
 * The Summoner's elemental golems, the Colossus they fuse into and the elemental wisps, 3D-built (mob3d.ts, Murat
 * 2026-11-17). A golem is a hulk of its element (basalt with lava in the cracks, ice, mossy stone oozing poison,
 * storm-dark stone crawling with sparks) with a burning core that shows through the seams. Models in world px:
 * x forward, y its left, z up.
 */
import { cap, cone, ell, mat, rng, sphere, type Mat, type Model, type Prim, type V3 } from "./mob3d";
import { GOLEM_ELEMENT, type GolemElement } from "./golems";
import type { WispElement } from "./wisps";
import { scaleModel } from "./beasts3d";

type Pose = "stand" | "step" | "wind" | "strike";
const v = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function stoneOf(el: GolemElement): Mat {
  const E = GOLEM_ELEMENT[el];
  if (el === "cold") return mat(E.stone, { lo: 0.45, hi: 1.35, jelly: 0.35, spec: 1, shine: 40, grain: 0.08 });
  return mat(E.stone, { lo: 0.32, hi: 1.35, grain: el === "poison" ? 0.35 : 0.25, spec: el === "shock" ? 0.3 : 0.1 });
}

/** A golem of one element; `colossus` is the fused form (the client draws it 1.6x): spikier, a crown of shards. */
export function golem(el: GolemElement, pose: Pose, f: number, colossus = false): Model {
  const E = GOLEM_ELEMENT[el], P: Prim[] = [], step = pose === "step", wind = pose === "wind", strike = pose === "strike";
  const S = el === "fire" ? mat(0x8a4426, { lo: 0.32, hi: 1.45, grain: 0.3, emit: 0.12 }) : stoneOf(el), D = mat(E.dark, { lo: 0.3, hi: 1.3, grain: 0.25 }), glow = mat(E.glow, { emit: 1, lo: 0.7, hi: 1.4 }), hot = mat(E.hot, { emit: 1, lo: 0.8, hi: 1.3 });
  const r = rng(colossus ? 31 : 7), bob = step ? 0.6 : 0, lean = strike ? 2.2 : wind ? -1.4 : 0;
  // legs: two stumpy pillars of rock, stepping in turn
  const hipZ = 13 + bob;
  for (const s of [-1, 1]) {
    const fw = step ? s * 2.2 : 0, lift = step && s > 0 ? 1.2 : 0;
    const hip: V3 = [0, s * 4.2, hipZ], foot: V3 = [fw + 0.6, s * 4.8, 2.4 + lift];
    P.push(cap(hip, foot, 3.6, 3.2, S, { k: 1.0 }), ell(v(foot, [0.8, 0, -0.9]), [4.0, 3.4, 2.0], D, { k: 0.8 }));
  }
  // the body: a pelvis rock, a huge chest boulder leaning into the blow, a small head sunk between the shoulders
  P.push(ell([lean * 0.3, 0, hipZ + 1.5], [5.0, 6.4, 3.6], S, { k: 1.2 }));
  const ch: V3 = [lean, 0, hipZ + 10.5];
  P.push(ell(ch, [7.0, 9.0, 8.4], S, { k: 1.6 }));
  for (let i = 0; i < 6; i++) { // lumps on the boulder, each a different rock
    const a = r() * Math.PI * 2, b = (r() - 0.3) * 1.2;
    P.push(ell(v(ch, [Math.cos(a) * 5.8 * Math.cos(b), Math.sin(a) * 7.4 * Math.cos(b), Math.sin(b) * 6.6]), [2.6 + r() * 1.4, 2.6 + r() * 1.4, 2.2 + r()], i % 2 ? D : S, { k: 0.9 }));
  }
  // seams in the chest, cut through to the glowing core under the rock
  const nSeam = el === "fire" ? 10 : 6;
  for (let i = 0; i < nSeam; i++) {
    const a = (r() - 0.5) * 2.6, a0: V3 = v(ch, [Math.cos(a) * 6.6, Math.sin(a) * 8.6, (r() - 0.5) * 11]), a1 = v(a0, [0, (r() - 0.5) * 6, (r() - 0.5) * 6]);
    P.push({ ...cap(a0, a1, el === "fire" ? 0.8 : 0.6, 0.45, D, { k: 0.1 }), cut: true });
  }
  P.push(ell(ch, [6.2, 8.1, 7.4], glow, { k: 0.4 })); // the core, seen through the seams
  P.push(ell(v(ch, [6.6, 0, 0.5]), [0.9, 1.9, 1.9], hot, { k: 0.3 })); // its heart, a hot knot in the middle of the chest
  const hd: V3 = v(ch, [2.4 + lean * 0.3, 0, 8.4]);
  P.push(ell(hd, [3.2, 3.6, 3.0], S, { k: 0.8 }), ell(v(hd, [-0.6, 0, 1.6]), [2.6, 3.0, 1.6], D, { k: 0.6 }));
  // arms: boulder shoulders, thick forearms, huge fists; the near fist raised on the wind-up, slammed down on the strike
  for (const s of [-1, 1]) {
    const sh: V3 = v(ch, [0, s * 9.4, 4.2]);
    const raise = wind ? 22 : 0, slam = strike ? 7 : 0;
    const hand: V3 = [lean + (strike ? 8.5 : wind ? -1.5 : 2.4) + (step ? -s * 1.5 : 0), s * (wind ? 11.5 : 12.4), Math.max(5, hipZ - 2 + raise - slam)];
    const el2: V3 = [(sh[0] + hand[0]) / 2 - 1.2, s * 12.8, (sh[2] + hand[2]) / 2 + (wind ? 2 : 0)];
    P.push(ell(sh, [4.4, 4.2, 4.0], S, { k: 1.0 }), cap(sh, el2, 3.0, 2.6, D, { k: 0.8 }), cap(el2, hand, 2.8, 3.4, S, { k: 0.8 }));
    P.push(ell(hand, [3.8, 3.6, 3.6], S, { k: 0.8 }));
    for (let k = -1; k <= 1; k++) P.push(sphere(v(hand, [2.6, k * 1.6, -0.6]), 1.25, D, { k: 0.4 })); // knuckles
  }
  // the element's own signs
  const shoulders = [-1, 1].map((s) => v(ch, [0, s * 9.4, 7.6]));
  if (el === "fire") { // flames licking off shoulders, head and fists
    for (let k = 0; k < 8; k++) { // tongues of flame all over the hulk
      const a = (r() - 0.5) * 3.4, b = v(ch, [Math.cos(a) * 7.0, Math.sin(a) * 8.8, -2 + r() * 7]);
      P.push(cone(b, v(b, [-0.8, Math.sin(a) * 1.2, 3.5 + r() * 3 + (f % 2)]), 1.1, k % 2 ? glow : hot));
    }
    for (const q of [...shoulders, v(hd, [0, 0, 2.6])]) for (let k = 0; k < 3; k++) {
      const b = v(q, [(r() - 0.5) * 2.5, (r() - 0.5) * 3, 0]);
      P.push(cone(b, v(b, [-1.2 - r(), (r() - 0.5) * 1.5, 4.5 + r() * 4 + (f % 2) * 1.2]), 1.3, k ? glow : hot));
    }
  } else if (el === "cold") { // ice shards growing out of the back and shoulders
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI / 2 + (k / 8) * Math.PI, b = v(ch, [-4.5, Math.sin(a) * 8, 4 + Math.cos(a) * 2]);
      P.push(cone(b, v(b, [-2.5 - r() * 2, Math.sin(a) * 4, 5 + r() * 5]), 1.5 + r() * 0.6, S));
    }
  } else if (el === "poison") { // green ooze welling from the cracks and dripping off the fists
    for (let k = 0; k < 7; k++) { const a = r() * Math.PI * 2; P.push(ell(v(ch, [Math.cos(a) * 6.5, Math.sin(a) * 8.3, (r() - 0.4) * 8]), [1.4, 1.4, 1.1], glow, { k: 0.5 })); }
    for (const s of [-1, 1]) P.push(cap([lean + 2.4, s * 12.4, hipZ - 5], [lean + 2.6, s * 12.4, hipZ - 8 - (f % 3)], 0.6, 0.35, glow, { k: 0.3 }));
  } else { // shock: rock shards hanging in the air round the shoulders, sparks between them
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
      const q = v(shoulders[s > 0 ? 1 : 0], [-1 + k * 2, s * (2.5 + k * 1.5), 3 + k * 2.4 + Math.sin(f + k) * 0.8]);
      P.push(cone(v(q, [0, 0, -1.4]), v(q, [0, 0, 1.8]), 1.2, D));
    }
    for (let k = 0; k < 3; k++) { // zigzag bolts running down the chest and the legs
      let q = v(ch, [6.9 - Math.abs(k - 1) * 1.2, -5 + k * 5, 6]);
      for (let j = 0; j < 4; j++) { const n = v(q, [0.1, (j % 2 ? -1.6 : 1.6), -3.4]); P.push(cap(q, n, 0.38, 0.34, hot, { k: 0.04 })); q = n; }
    }
    for (const s of [-1, 1]) { let q: V3 = [3.4, s * 4.6, hipZ - 1]; for (let j = 0; j < 3; j++) { const n = v(q, [0, s * (j % 2 ? -1.0 : 1.0), -3.4]); P.push(cap(q, n, 0.34, 0.3, hot, { k: 0.04 })); q = n; } }
  }
  if (colossus) { // the fused form: a crown of shards, a spined back, a second ring of core light at the hips
    for (let k = 0; k < 5; k++) { const a = (k - 2) * 0.55; P.push(cone(v(hd, [-0.5, Math.sin(a) * 2.6, 2.2]), v(hd, [-1 - Math.abs(a), Math.sin(a) * 4.5, 6.5 - Math.abs(a) * 1.5]), 1.0, k === 2 ? hot : D)); }
    for (let k = 0; k < 4; k++) P.push(cone(v(ch, [-6, (k - 1.5) * 3.5, 3]), v(ch, [-11, (k - 1.5) * 4.5, 6 + (k % 2) * 3]), 1.6, D));
    P.push(ell([lean * 0.3 + 4.2, 0, hipZ + 2], [1.2, 4.5, 1.0], glow, { k: 0.2 }));
  }
  const eyes = [-1, 1].map((s) => ({ p: v(hd, [3.0, s * 1.3, 0.2]) as V3, col: E.hot }));
  return scaleModel({ prims: P, eyes, halos: [{ p: v(ch, [6.6, 0, 0.5]), r: 9, col: E.glow, a: el === "fire" ? 0.4 : 0.28 }], shadow: { x: lean * 0.5, y: 0, rx: 15, ry: 7.5, a: 0.42 } }, 0.82);
}

/** A small wisp of the element, floating over its shadow with one eye: a flame, a spiked ice star, a dripping bulb, a spark ball. */
export function wisp(el: WispElement, pose: Pose, f: number): Model {
  const E = GOLEM_ELEMENT[el], P: Prim[] = [], wind = pose === "wind", strike = pose === "strike";
  const shell = mat(E.glow, { lo: 0.55, hi: 1.35, jelly: 0.5, emit: 0.35, spec: 0.8, shine: 30 }), core = mat(E.hot, { emit: 1, lo: 0.8, hi: 1.3 });
  const R = (wind ? 3.2 : strike ? 3.8 : 3.4) + (f % 2) * 0.15, c: V3 = [strike ? 1.2 : 0, 0, 9.5];
  P.push(sphere(c, R, shell, { k: 0.5 }));
  P.push({ ...sphere(c, R * 0.55, core, { k: 0.3 }), inner: true });
  P.push({ ...ell(v(c, [R * 0.85, 0, 0.2]), [0.6, 1.0, 1.0], mat(0x1a1420, { lo: 0.6, hi: 1 }), { k: 0.2 }), cut: true }); // the eye socket
  if (el === "fire") P.push(cone(v(c, [-0.4, 0, R * 0.6]), v(c, [-1.6, 0, R + 3.6 + (f % 2)]), R * 0.6, shell));
  else if (el === "cold") for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + f * 0.2; P.push(cone(v(c, [0, Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7]), v(c, [0, Math.cos(a) * (R + 2.4), Math.sin(a) * (R + 2.4)]), 0.6, shell)); }
  else if (el === "poison") { P.push(cone(v(c, [0, 0, -R * 0.6]), v(c, [0.3, 0, -R - 2.2]), R * 0.55, shell)); P.push(sphere(v(c, [-1, 2.2, R + 1.4 - (f % 3) * 0.5]), 0.7, shell, { k: 0.1 })); }
  else for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + f * 0.5; P.push(cone(v(c, [Math.cos(a) * R * 0.4, Math.sin(a) * R * 0.7, Math.cos(a * 1.7) * R * 0.6]), v(c, [Math.cos(a) * 1.5, Math.sin(a) * (R + 2.2), Math.cos(a * 1.7) * (R + 1.8)]), 0.55, shell)); }
  const eye = lerp(c, v(c, [R, 0, 0.2]), 0.95);
  return { prims: P, eyes: [{ p: eye, col: 0x1a1420 }], halos: [{ p: c, r: R + 3, col: E.glow, a: 0.3 }], shadow: { x: 0, y: 0, rx: 3.5, ry: 2.2, a: 0.35 }, lift: Math.sin(f * 1.7) * 0.8 };
}
