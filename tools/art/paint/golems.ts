// Golems for the Summoner, painted with the monster brushes (brush.ts) and turned into pixel art the same way as
// paint/mobs.ts. Three styles to choose from (proposals) x the elements of shared/elements.ts.
import type { Element } from "../../../shared/elements";
import { C2, P, css, ellipseP, fillShape, glow, limb, line, metal, poly, rng, sh, vol } from "./brush";

export type GolemStyle = "monolith" | "elemental" | "runic";
export type GolemElement = Exclude<Element, "faith">;
export type GolemDir = "down" | "up" | "right";
export type GolemPose = "stand" | "step" | "wind" | "strike";

/** Body stone and glow colour per element. */
export const GOLEM_ELEMENT: Record<GolemElement, { stone: number; dark: number; glow: number; hot: number }> = {
  fire: { stone: 0x4a3a34, dark: 0x2a201c, glow: 0xff6a1f, hot: 0xffd27a },
  cold: { stone: 0x8fb4cc, dark: 0x4e6b80, glow: 0x6fe3ff, hot: 0xe8fbff },
  poison: { stone: 0x4c5a32, dark: 0x2c341c, glow: 0x8cff4a, hot: 0xe2ffb0 },
  shock: { stone: 0x575d76, dark: 0x30344a, glow: 0x9ab8ff, hot: 0xfff6a8 },
};

/** Frame size in world px (feet at y = FOOT). Golems stand a head taller than a hero. */
export const GOLEM_W = 40, GOLEM_H = 46, FOOT = 43;

/** A lumpy rock outline around a centre (seeded, so every frame of one golem has the same rocks). */
function rock(cx: number, cy: number, rx: number, ry: number, seed: number, n = 7): P[] {
  const r = rng(seed), pts: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.4, k = 0.8 + r() * 0.3;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}

/** Glowing cracks: jagged lines with a soft halo. */
function cracks(c: C2, from: P, n: number, len: number, col: number, hot: number, seed: number) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    let [x, y] = from; const pts: P[] = [[x, y]];
    const a0 = r() * Math.PI * 2;
    for (let k = 0; k < 3; k++) { const a = a0 + (r() - 0.5) * 1.4; x += Math.cos(a) * len / 3; y += Math.sin(a) * len / 3; pts.push([x, y]); }
    line(c, pts, col, 1.1, 0.55);
    line(c, pts, hot, 0.45, 0.95);
  }
}

interface Rig {
  dir: GolemDir; side: number; bob: number;
  hip: P; chest: P; head: P;
  shN: P; shF: P; hN: P; hF: P; // near / far shoulder and fist
  fN: P; fF: P; // near / far foot
}

/** Where the big parts go for this facing and pose (shared by the three styles). */
function rigFor(dir: GolemDir, pose: GolemPose): Rig {
  const bob = pose === "step" ? -0.8 : pose === "wind" ? -0.4 : 0;
  const cx = GOLEM_W / 2, side = dir === "right" ? 1 : 0;
  const hip: P = [cx, 31 + bob], chest: P = [cx, 22 + bob], head: P = [cx + side * 1.5, 13.5 + bob];
  let shN: P, shF: P, hN: P, hF: P, fN: P, fF: P;
  if (dir === "right") {
    shN = [cx - 1, 19 + bob]; shF = [cx + 2, 18 + bob];
    hN = [cx + 1, 33 + bob]; hF = [cx + 4, 32 + bob];
    fN = [cx - 3, FOOT]; fF = [cx + 3, FOOT];
    if (pose === "step") { fN = [cx - 6, FOOT]; fF = [cx + 5, FOOT]; hN = [cx + 4, 32]; hF = [cx - 1, 32]; }
    if (pose === "wind") { hN = [cx - 6, 12]; }
    if (pose === "strike") { hN = [cx + 15, 30]; shN = [cx + 2, 19]; }
  } else {
    const s = dir === "down" ? 1 : -1;
    shN = [cx - 9 * s, 18 + bob]; shF = [cx + 9 * s, 18 + bob];
    hN = [cx - 13 * s, 33 + bob]; hF = [cx + 13 * s, 33 + bob];
    fN = [cx - 5, FOOT]; fF = [cx + 5, FOOT];
    if (pose === "step") { fN = [cx - 5, FOOT - 1.5]; hN = [cx - 12 * s, 31]; hF = [cx + 13 * s, 34]; }
    if (pose === "wind") { hN = [cx - 10 * s, 8]; hF = [cx + 10 * s, 8]; }
    if (pose === "strike") { hN = [cx - 7 * s, 38]; hF = [cx + 7 * s, 38]; }
  }
  return { dir, side, bob, hip, chest, head, shN, shF, hN, hF, fN, fF };
}

/** Paint one golem frame in world px on `c` (already scaled to the hi-res factor). */
export function paintGolem(c: C2, style: GolemStyle, el: GolemElement, dir: GolemDir, pose: GolemPose, seed = 7, shadow: C2 = c) {
  const E = GOLEM_ELEMENT[el], g = rigFor(dir, pose), front = dir === "down";
  // ground shadow (on its own layer in the monster sheets, so pixelize keeps it)
  fillShape(shadow, ellipseP(GOLEM_W / 2, FOOT + 0.5, 13, 3.2), "rgba(0,0,0,0.32)");
  const parts = PAINTERS[style];
  // far limbs first, then body, near limbs, head
  if (dir !== "up") { parts.leg(c, g, g.fF, E, seed + 1, true); parts.arm(c, g, g.shF, g.hF, E, seed + 2, true); }
  else { parts.leg(c, g, g.fN, E, seed + 3, true); parts.arm(c, g, g.shN, g.hN, E, seed + 4, true); }
  parts.leg(c, g, dir !== "up" ? g.fN : g.fF, E, seed + 5, false);
  parts.body(c, g, E, seed + 6, front);
  if (dir !== "up") parts.arm(c, g, g.shN, g.hN, E, seed + 7, false);
  else parts.arm(c, g, g.shF, g.hF, E, seed + 8, false);
  parts.head(c, g, E, seed + 9, dir);
  if (pose === "strike") glow(c, g.hN[0], g.hN[1], 7, E.glow, 0.55);
}

interface Painter {
  body(c: C2, g: Rig, E: typeof GOLEM_ELEMENT.fire, seed: number, front: boolean): void;
  head(c: C2, g: Rig, E: typeof GOLEM_ELEMENT.fire, seed: number, dir: GolemDir): void;
  arm(c: C2, g: Rig, sh0: P, fist: P, E: typeof GOLEM_ELEMENT.fire, seed: number, far: boolean): void;
  leg(c: C2, g: Rig, foot: P, E: typeof GOLEM_ELEMENT.fire, seed: number, far: boolean): void;
}

const dim = (col: number, far: boolean) => (far ? sh(col, 0.72) : col);

// ---- A: Monolith — stacked boulders, glowing cracks and a molten core -------------------------------------
const monolith: Painter = {
  body(c, g, E, seed, front) {
    const [x, y] = g.chest, w = g.dir === "right" ? 9 : 12;
    const torso = rock(x, y + 1, w, 9.5, seed, 8);
    vol(c, poly(torso), E.stone, [x - w, y - 9, w * 2, 20], { ao: 0.5 });
    const belly = rock(g.hip[0], g.hip[1], w * 0.75, 4.5, seed + 3, 7);
    vol(c, poly(belly), sh(E.stone, 0.85), [g.hip[0] - w, g.hip[1] - 4, w * 2, 9]);
    if (front) {
      glow(c, x, y + 1, 6, E.glow, 0.85);
      cracks(c, [x, y + 1], 5, 8, E.glow, E.hot, seed);
      fillShape(c, ellipseP(x, y + 1, 1.8, 2.2), css(E.hot));
    } else if (g.dir === "right") cracks(c, [x + 3, y + 2], 2, 6, E.glow, E.hot, seed);
    else cracks(c, [x, y + 3], 3, 7, sh(E.glow, 0.7), E.glow, seed);
  },
  head(c, g, E, seed, dir) {
    const [x, y] = g.head;
    vol(c, poly(rock(x, y, 4.6, 3.8, seed, 7)), sh(E.stone, 1.05), [x - 5, y - 4, 10, 8]);
    if (dir === "down") for (const s of [-1, 1]) { glow(c, x + s * 1.8, y + 0.3, 2.2, E.glow, 0.9); fillShape(c, ellipseP(x + s * 1.8, y + 0.3, 0.7, 0.45), css(E.hot)); }
    if (dir === "right") { glow(c, x + 2.8, y + 0.3, 2, E.glow, 0.9); fillShape(c, ellipseP(x + 2.8, y + 0.3, 0.6, 0.45), css(E.hot)); }
  },
  arm(c, g, s0, fist, E, seed, far) {
    const elbow: P = [(s0[0] + fist[0]) / 2 + (s0[0] < g.chest[0] ? -2 : 2), (s0[1] + fist[1]) / 2];
    vol(c, poly(rock(s0[0], s0[1], 4.5, 4, seed, 6)), dim(E.stone, far), [s0[0] - 5, s0[1] - 4, 10, 8]);
    vol(c, poly(rock(elbow[0], elbow[1], 3.6, 4.2, seed + 1, 6)), dim(sh(E.stone, 0.92), far), [elbow[0] - 4, elbow[1] - 4, 8, 8]);
    vol(c, poly(rock(fist[0], fist[1], 4.4, 4, seed + 2, 7)), dim(E.stone, far), [fist[0] - 5, fist[1] - 4, 10, 8], { ao: 0.55 });
    if (!far) cracks(c, elbow, 1, 4, E.glow, E.hot, seed);
  },
  leg(c, g, foot, E, seed, far) {
    const knee: P = [(g.hip[0] + foot[0]) / 2 + (foot[0] - g.hip[0]) * 0.2, (g.hip[1] + foot[1]) / 2 + 1];
    vol(c, poly(rock(knee[0], knee[1], 3.6, 4.5, seed, 6)), dim(sh(E.stone, 0.9), far), [knee[0] - 4, knee[1] - 5, 8, 9]);
    vol(c, poly(rock(foot[0], foot[1] - 2, 4.4, 2.6, seed + 1, 6)), dim(sh(E.stone, 0.8), far), [foot[0] - 5, foot[1] - 5, 10, 5]);
  },
};

// ---- B: Elemental — a body made of the element itself (fire, ice shards, ooze, storm) -------------------------
function substance(c: C2, el: GolemEl, cx: number, cy: number, rx: number, ry: number, E: typeof GOLEM_ELEMENT.fire, seed: number, far: boolean) {
  const r = rng(seed), base = far ? sh(E.glow, 0.7) : E.glow;
  if (el === "cold") {
    // a cluster of ice crystals
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 2.2, len = ry * (0.9 + r() * 0.7), w = rx * (0.35 + r() * 0.25);
      const bx = cx + (r() - 0.5) * rx, by = cy + ry * 0.4;
      const tip: P = [bx + Math.cos(a) * len, by + Math.sin(a) * len];
      const shard: P[] = [[bx - w, by], tip, [bx + w, by], [bx, by + w]];
      vol(c, poly(shard), dim(E.stone, far), [bx - w, by - len, w * 2, len + w], { spec: 0.5, ao: 0.3 });
      line(c, [[bx, by], tip], E.hot, 0.35, 0.8);
    }
    glow(c, cx, cy, rx, E.glow, 0.35);
    return;
  }
  if (el === "fire") {
    vol(c, poly(rock(cx, cy, rx, ry, seed, 9)), dim(E.stone, far), [cx - rx, cy - ry, rx * 2, ry * 2]);
    glow(c, cx, cy, Math.max(rx, ry) * 1.2, base, 0.8);
    for (let i = 0; i < 6; i++) {
      const fx = cx + (r() - 0.5) * rx * 1.6, fy = cy - ry * 0.3 + r() * ry * 0.6, h = ry * (0.7 + r() * 0.8);
      fillShape(c, poly([[fx - 1.6, fy], [fx + (r() - 0.5) * 2, fy - h], [fx + 1.6, fy]]), css(i % 2 ? E.hot : base, 0.9));
    }
    return;
  }
  if (el === "poison") {
    vol(c, ellipseP(cx, cy, rx, ry), dim(E.stone, far), [cx - rx, cy - ry, rx * 2, ry * 2], { spec: 0.6 });
    for (let i = 0; i < 4; i++) { const bx = cx + (r() - 0.5) * rx * 1.4, by = cy + (r() - 0.2) * ry; fillShape(c, ellipseP(bx, by, 0.9 + r(), 0.9 + r()), css(E.hot, 0.8)); }
    for (let i = 0; i < 2; i++) { const dx = cx + (r() - 0.5) * rx; fillShape(c, ellipseP(dx, cy + ry + 1 + r() * 2, 0.8, 1.4), css(base, 0.9)); }
    return;
  }
  // shock: a storm cloud with lightning inside
  for (let i = 0; i < 5; i++) {
    const bx = cx + (r() - 0.5) * rx * 1.4, by = cy + (r() - 0.5) * ry;
    vol(c, ellipseP(bx, by, rx * 0.55, ry * 0.5), dim(E.stone, far), [bx - rx * 0.6, by - ry * 0.5, rx * 1.2, ry]);
  }
  let x = cx - rx * 0.4, y = cy - ry * 0.6; const pts: P[] = [[x, y]];
  for (let k = 0; k < 4; k++) { x += (k % 2 ? -1 : 1) * rx * 0.4; y += ry * 0.35; pts.push([x, y]); }
  line(c, pts, base, 1.2, 0.6); line(c, pts, E.hot, 0.5, 1);
}
type GolemEl = GolemElement;
let curEl: GolemEl = "fire";

const elemental: Painter = {
  body(c, g, E, seed) {
    const w = g.dir === "right" ? 8 : 10.5;
    substance(c, curEl, g.chest[0], g.chest[1] + 2, w, 9, E, seed, false);
    substance(c, curEl, g.hip[0], g.hip[1], w * 0.7, 4, E, seed + 2, false);
  },
  head(c, g, E, seed, dir) {
    const [x, y] = g.head;
    substance(c, curEl, x, y, 4.2, 3.6, E, seed, false);
    if (dir === "down") for (const s of [-1, 1]) fillShape(c, ellipseP(x + s * 1.7, y + 0.4, 0.8, 0.55), css(0xffffff, 0.95));
    if (dir === "right") fillShape(c, ellipseP(x + 2.6, y + 0.4, 0.7, 0.5), css(0xffffff, 0.95));
  },
  arm(c, g, s0, fist, E, seed, far) {
    const m: P = [(s0[0] + fist[0]) / 2, (s0[1] + fist[1]) / 2];
    substance(c, curEl, m[0], m[1], 3.4, Math.abs(fist[1] - s0[1]) / 2 + 2, E, seed, far);
    substance(c, curEl, fist[0], fist[1], 3.6, 3.4, E, seed + 1, far);
  },
  leg(c, g, foot, E, seed, far) {
    substance(c, curEl, (g.hip[0] + foot[0]) / 2, (g.hip[1] + foot[1]) / 2 + 1, 3.6, 6, E, seed, far);
  },
};

// ---- C: Runic construct — dressed masonry held by iron bands, a glowing rune plate ----------------------------
const IRON = 0x5c5a5e;
function block(c: C2, x: number, y: number, w: number, h: number, col: number, seed: number, far: boolean) {
  const r = rng(seed), j = () => (r() - 0.5) * 0.8;
  const pts: P[] = [[x - w / 2 + j(), y - h / 2 + j()], [x + w / 2 + j(), y - h / 2 + j()], [x + w / 2 + j(), y + h / 2 + j()], [x - w / 2 + j(), y + h / 2 + j()]];
  vol(c, poly(pts), dim(col, far), [x - w / 2, y - h / 2, w, h], { ao: 0.6 });
  line(c, [[x - w / 2 + 0.6, y], [x + w / 2 - 0.6, y + j() * 0.5]], sh(col, 0.5), 0.35, 0.7); // mortar
}
function band(c: C2, x: number, y: number, w: number, far: boolean) {
  metal(c, poly([[x - w / 2, y - 0.8], [x + w / 2, y - 0.8], [x + w / 2, y + 0.8], [x - w / 2, y + 0.8]]), dim(IRON, far), [x, y - 1], [x, y + 1], 0.4);
  for (const s of [-1, 1]) fillShape(c, ellipseP(x + s * (w / 2 - 1), y, 0.45, 0.45), css(sh(IRON, 1.5)));
}
const runic: Painter = {
  body(c, g, E, seed, front) {
    const [x, y] = g.chest, w = g.dir === "right" ? 15 : 21;
    block(c, x, y - 3, w, 8, E.stone, seed, false);
    block(c, x, y + 4.5, w * 0.86, 7, sh(E.stone, 0.92), seed + 1, false);
    block(c, g.hip[0], g.hip[1] + 1, w * 0.66, 5, sh(E.stone, 0.85), seed + 2, false);
    band(c, x, y + 0.6, w + 1, false);
    if (front) {
      metal(c, poly([[x - 3.5, y - 6], [x + 3.5, y - 6], [x + 3, y - 0.6], [x - 3, y - 0.6]]), 0x8a7a5a, [x, y - 6], [x, y], 0.5);
      glow(c, x, y - 3.3, 4.5, E.glow, 0.7);
      line(c, [[x - 1.5, y - 5], [x, y - 2], [x + 1.5, y - 5]], E.hot, 0.55, 1);
      line(c, [[x, y - 2], [x, y - 1.2]], E.hot, 0.55, 1);
    }
  },
  head(c, g, E, seed, dir) {
    const [x, y] = g.head;
    block(c, x, y, dir === "right" ? 7 : 8.5, 6.5, sh(E.stone, 1.06), seed, false);
    band(c, x, y - 2.2, dir === "right" ? 7.5 : 9, false);
    if (dir === "down") { fillShape(c, poly([[x - 3, y + 0.2], [x + 3, y + 0.2], [x + 2.6, y + 1.2], [x - 2.6, y + 1.2]]), css(E.dark)); glow(c, x, y + 0.7, 3.5, E.glow, 0.8); line(c, [[x - 2.4, y + 0.7], [x + 2.4, y + 0.7]], E.hot, 0.5, 1); }
    if (dir === "right") { glow(c, x + 3, y + 0.7, 2.4, E.glow, 0.8); line(c, [[x + 1.6, y + 0.7], [x + 3.6, y + 0.7]], E.hot, 0.5, 1); }
  },
  arm(c, g, s0, fist, E, seed, far) {
    block(c, s0[0], s0[1], 8, 6, E.stone, seed, far);
    band(c, s0[0], s0[1] + 1.5, 8.5, far);
    limb(c, s0, fist, 4.5, 4, dim(sh(E.stone, 0.9), far));
    block(c, fist[0], fist[1], 7.5, 6.5, sh(E.stone, 1.02), seed + 1, far);
    if (!far) { band(c, fist[0], fist[1] - 1.8, 8, far); glow(c, fist[0], fist[1] + 1, 2, E.glow, 0.5); }
  },
  leg(c, g, foot, E, seed, far) {
    const knee: P = [(g.hip[0] + foot[0]) / 2, (g.hip[1] + foot[1]) / 2 + 1];
    block(c, knee[0], knee[1], 6.5, 8, sh(E.stone, 0.9), seed, far);
    block(c, foot[0], foot[1] - 2, 8, 4, sh(E.stone, 0.78), seed + 1, far);
    band(c, foot[0], foot[1] - 3.4, 8.5, far);
  },
};

const PAINTERS: Record<GolemStyle, Painter> = { monolith, elemental, runic };

/** paintGolem with the element the elemental style draws its substance with. */
export function paintGolemFrame(c: C2, style: GolemStyle, el: GolemElement, dir: GolemDir, pose: GolemPose, seed = 7, shadow?: C2) {
  curEl = el;
  paintGolem(c, style, el, dir, pose, seed, shadow ?? c);
}

