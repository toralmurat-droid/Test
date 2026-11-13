import { Canvas, HiCanvas, shade } from "./canvas";
import { DiagAlt, FrameInfo, hasLook, paintFrame, setPaintPixel } from "./paint/body";
import { MOVE_HEROES, MOVE_SHEET } from "../../client/src/skillMoveData";

export type Dir = "down" | "up" | "right";
export const DIRS: Dir[] = ["down", "up", "right"];
/** Logical frame size (all drawing code works on this 32x32 grid). */
export const LW = 32, LH = 32, COLS = 6;
/**
 * Painted sheets: two extra 3/4 facings (downright, upright; flipX gives downleft, upleft) and 8-frame
 * walk/run cycles, so rows are anim x 5 dirs and 8 columns.
 */
export type SheetDir = Dir | "downright" | "upright";
export const PAINT_DIRS: SheetDir[] = ["down", "up", "right", "downright", "upright"];
export const PAINT_COLS = 8;
const FLUID = new Set(["walk", "run", "walk2"]);
/** Attacks drawn as 8 in-between frames in painted sheets (same duration as the 4-frame ones). */
const SWING8 = new Set(["attack", "attack2", "attack3", "attack4", "attack5"]);
/** Animation list for a sheet: painted sheets get 8-frame (smoother) walk/run cycles and attack swings. */
export function animsOf(painted: boolean) {
  return ANIMS.map((a) => !painted ? a
    : FLUID.has(a.name) ? { ...a, frames: PAINT_COLS, fps: Math.round(a.fps * 8 / 6) }
    : SWING8.has(a.name) ? { ...a, frames: PAINT_COLS, fps: a.fps * 2 } : a);
}
/** Value of a 4-key attack table at a fractional phase (extrapolates a little before 0 for anticipation). */
const keyAt = (arr: number[], t: number) => {
  if (t <= 0) return arr[0] + (arr[0] - arr[1]) * -t;
  const i = Math.min(2, Math.floor(t)), f = Math.min(1, t - i);
  return arr[i] + (arr[i + 1] - arr[i]) * f;
};
/** Fine pixels per logical pixel: frames are rendered at K x the logical size. */
export let K = 2;
/** Output frame size in pixels. */
export let FW = LW * K, FH = LH * K;
/**
 * Painted mode: characters with a look in paint/look.ts are drawn by the smooth painter (paint/body.ts) instead of
 * the pixel code, at k fine pixels per logical pixel. Small effects (sparks, stars, dust) become soft dots.
 */
export let PAINTED = false;
/** Painted, then turned into crisp pixel art (hard edges, posterized colours, 1px outline) at k texels per unit. */
export let PIXEL = false;
export function setPainted(on: boolean, k: number, pixel = false) { PAINTED = on; PIXEL = on && pixel; K = k; FW = Math.round(LW * K); FH = Math.round(LH * K); setPaintPixel(PIXEL); }

/** HiCanvas whose logical "pixels" are soft round dots (for effects painted onto smooth frames). */
class SoftCanvas extends HiCanvas {
  px(x: number, y: number, c: number, a = 255) {
    if (this.nat) return Canvas.prototype.px.call(this, x, y, c, a);
    const k = this.k, cx = (x + 0.5) * k, cy = (y + 0.5) * k, r = k * 0.75;
    for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++) for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) {
      const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy) / r;
      if (d < 1) Canvas.prototype.px.call(this, i, j, c, Math.round(a * Math.min(1, (1 - d) * 1.8)));
    }
  }
}
/** A fresh frame canvas: logical 32x32 drawing, rendered K times finer. */
export const mk = (): HiCanvas => PAINTED && !PIXEL ? new SoftCanvas(LW, LH, K) : new HiCanvas(LW, LH, K);
const OUTLINE = 0x1a1420;

export interface Pose {
  dir: Dir;
  t: number;          // frame counter (for little flutters)
  bob: number;        // upper body y offset
  stride: number;     // -1..1 walking leg offset
  lean: number;       // whole-body x push (hit knockback), in facing-space
  crouch: number;     // KO kneel
  attack: number;     // -1 none, 0 windup, 1 swing, 2 impact, 3 recover
  move?: MoveId;      // which attack in the combo (default a1)
  expr: "n" | "squint" | "x" | "blink" | "happy";
  headDx?: number;               // head turn / look around
  hand?: [number, number];       // override weapon-hand position
  wAng?: number;                 // override weapon angle (absolute)
  farHand?: [number, number];    // free hand goes here (wave, cheer, scratch)
  noWeapon?: boolean;
  run?: boolean;
  phase?: number;     // painted walk cycles: continuous step phase (radians), drives smooth leg lift
  attackT?: number;   // painted swings: continuous attack phase (-0.5..3) between the 4 key poses; attack = rounded
}

export const ANIMS: { name: string; frames: number; fps: number; loop: boolean }[] = [
  { name: "idle", frames: 6, fps: 5, loop: true },
  { name: "walk", frames: 6, fps: 11, loop: true },
  { name: "attack", frames: 4, fps: 14, loop: false },
  { name: "attack2", frames: 4, fps: 14, loop: false },
  { name: "attack3", frames: 4, fps: 12, loop: false },
  { name: "attack4", frames: 4, fps: 14, loop: false },
  { name: "attack5", frames: 4, fps: 14, loop: false },
  { name: "hit", frames: 2, fps: 10, loop: false },
  { name: "ko", frames: 4, fps: 6, loop: false },
  { name: "skill", frames: 4, fps: 10, loop: false },
  // flavour animations (no gameplay effect)
  { name: "idle2", frames: 6, fps: 4, loop: false },  // look around
  { name: "idle3", frames: 6, fps: 9, loop: false },  // weapon flourish / fidget
  { name: "run", frames: 6, fps: 14, loop: true },
  { name: "wave", frames: 4, fps: 6, loop: true },
  { name: "cheer", frames: 4, fps: 8, loop: true },
  { name: "laugh", frames: 4, fps: 8, loop: true },
  { name: "sit", frames: 4, fps: 3, loop: true },
  { name: "sleep", frames: 4, fps: 2, loop: true },
  // alternative versions of the basic movements
  { name: "walk2", frames: 6, fps: 9, loop: true },   // per-hero gait: sneak, march, float, swagger, light step
  { name: "dodge", frames: 6, fps: 16, loop: false },  // roll
  { name: "jump", frames: 6, fps: 12, loop: false },
  { name: "block", frames: 4, fps: 10, loop: false },
  { name: "hit2", frames: 3, fps: 10, loop: false },   // heavy knockback
  { name: "ko2", frames: 4, fps: 6, loop: false },     // falls forward
];

/**
 * Skill moves (Murat 2026-11-05): whole-body poses for the big melee skills, played as micro sequences by the client
 * (client/src/skillMoves.ts). Painted heroes only, in their own sheet ({hero}-moves.webp) so the base sheets and their
 * gear overlays stay as they are. 8 frames each: see skillPose for what each frame is.
 */
export const MOVE_ANIMS: { name: string; frames: number; fps: number; loop: boolean }[] =
  MOVE_SHEET.map((name) => ({ name, frames: PAINT_COLS, fps: 20, loop: false }));
export { MOVE_HEROES };

interface D {
  c: Canvas; p: Pose;
  /** box/rect helpers in body space: U = upper body (bob/crouch), L = legs */
  U(x: number, y: number, w: number, h: number, col: number, top?: boolean): void;
  Ur(x: number, y: number, w: number, h: number, col: number): void;
  Up(x: number, y: number, col: number): void;
  ux: number; uy: number; lx: number;
}

/** facing unit vector in screen space */
const FACE: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], right: [1, 0] };
const FACE_ANGLE: Record<Dir, number> = { down: 90, up: -90, right: 0 };
const rad = (d: number) => (d * Math.PI) / 180;

export type MoveId = "a1" | "a2" | "a3" | "a4" | "a5";
type MoveKind = "slash" | "thrust" | "spin" | "bash" | "slam" | "cast" | "double" | "charged" | "bonk" | "shot";
interface Move { swing: number[]; reach?: number[]; lift?: number[]; abs?: boolean; kind: MoveKind; fx?: number }
interface Hero {
  name: string;
  legs(d: D, legTop: number): void;
  torso(d: D): void;
  head(d: D): void;
  arm(d: D, which: "near" | "far", hand: [number, number]): void;
  weapon(d: D, hand: [number, number], angle: number): void;
  shield?(d: D): void;
  /** effects painted after the outline (slashes, magic) */
  fx?(d: D, hand: [number, number], angle: number): void;
  swing: number[]; // weapon angles relative to facing for attack phases 0..3
  kind1?: MoveKind;
  moves?: { a2: Move; a3: Move; a4: Move };
  aura?: number;   // skill glow colour
  cols: { sleeve: number; hand: number };
  gait?: "sneak" | "march" | "float" | "swagger" | "light" | "stroll";
  weaponKind: string;
  idleAngle: Record<Dir, number>;
  hipHand?: boolean;
}

// ---------- shared body bits ----------
function eyes(d: D, xs: number[], y: number, col: number) {
  for (const x of xs) {
    if (d.p.expr === "x") {
      for (const [a, b] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]) d.Up(x + a, y + b, col);
    } else if (d.p.expr === "squint") {
      const s = x === xs[0] ? 1 : -1; // > <
      d.Up(x - s, y - 1, col); d.Up(x, y, col); d.Up(x - s, y + 1, col);
    } else if (d.p.expr === "happy") {
      d.Up(x - 1, y + 1, col); d.Up(x, y, col); d.Up(x + 1, y + 1, col);
    } else if (d.p.expr === "blink") {
      d.Up(x, y + 1, col);
    } else {
      d.Up(x, y, col); d.Up(x, y + 1, col);
    }
  }
}

function standardLegs(d: D, legTop: number, pants: number, boots: number) {
  const { p } = d, s = p.stride, h = 28 - legTop;
  if (p.dir === "right") {
    const k = p.run ? 3 : 2, back = -Math.round(s * k), front = Math.round(s * k);
    for (const [off, f] of [[back, 0.8], [front, 1]] as const) {
      const x = 14 + off + d.lx;
      d.c.box(x, legTop, 3, h, shade(pants, f));
      d.c.box(x, 27, 4, 2, shade(boots, f));
    }
  } else {
    const lift = (i: number) => (s === 0 ? 0 : (i === 0) === s > 0 ? (p.run && Math.abs(s) >= 1 ? 2 : 1) : 0);
    [12, 17].forEach((x, i) => {
      const up = lift(i);
      d.c.box(x + d.lx, legTop, 3, h - up, pants);
      d.c.box(x + d.lx, 27 - up, 3, 2, boots);
    });
  }
}

function handPos(p: Pose, hero: Hero): [number, number] {
  if (p.hand) return [p.hand[0], p.hand[1] + p.bob + p.crouch];
  const [fx, fy] = FACE[p.dir];
  const base: Record<Dir, [number, number]> = { down: [hero.name === "wizard" ? 9 : 10, 22], up: [21, 22], right: [16, 22] };
  let [x, y] = base[p.dir];
  if (p.attack >= 0) {
    const mv = moveOf(hero, p);
    const at = p.attackT ?? p.attack;
    const reach = keyAt(mv.reach ?? [0, 3, 4, 2], at), lift = keyAt(mv.lift ?? [5, 2, 0, 0], at);
    x += fx * reach; y += fy * reach - lift;
    if (p.dir === "down") x += keyAt([1, 2, 3, 2], at);
  } else if (p.dir === "right") {
    x += Math.round(-p.stride * 1.5);
  } else {
    y += p.stride === 0 ? 0 : p.dir === "down" ? -p.stride : p.stride;
  }
  return [x + p.lean * (p.dir === "right" ? 1 : 0), y + p.bob + p.crouch];
}

function moveOf(hero: Hero, p: Pose): Move {
  if (!p.move || p.move === "a1" || !hero.moves) return { swing: hero.swing, kind: hero.kind1 ?? "slash" };
  // a5: a lower, flatter take on the basic attack (4th normal-attack variant)
  if (p.move === "a5") return hero.kind1 === "shot"
    ? { swing: hero.swing.map((v) => v - 15), reach: [0, 0, -1, -2], lift: [3, 2, 1, 1], kind: "shot" }
    : { swing: [-70, -20, 40, 20], reach: [2, 5, 6, 3], lift: [2, 1, 0, 0], kind: hero.kind1 ?? "slash" };
  return hero.moves[p.move];
}

function weaponAngle(p: Pose, hero: Hero) {
  if (p.wAng !== undefined) return p.wAng;
  if (p.attack < 0) return hero.idleAngle[p.dir];
  const mv = moveOf(hero, p);
  let a = p.attackT !== undefined ? keyAt(mv.swing, p.attackT) : mv.swing[p.attack];
  if (mv.abs) return a;
  if (p.dir === "up") a = -a; // sweep the other way so it reads the same
  a += FACE_ANGLE[p.dir];
  // facing down, a blade pointing straight down leaves the 32px frame: keep swings at least 50° off vertical
  if (p.dir === "down" && (mv.kind === "slash" || mv.kind === "bonk" || mv.kind === "slam")) {
    const n = ((a % 360) + 360) % 360;
    if (n > 40 && n < 140) a += (n < 90 ? 40 - n : 140 - n);
  }
  return a;
}

// ---------- NINJA ----------
const NJ = { suit: 0x2f3150, hood: 0x262840, band: 0xd62839, skin: 0xf1c27d, eye: 0x111111, sash: 0x8d99ae, wrap: 0xc9cdd6, boot: 0x17182a, blade: 0xe6edf5, hilt: 0x9b1d2a, guard: 0xf2c14e };
const ninja: Hero = {
  name: "ninja",
  swing: [-130, -40, 35, 60],
  idleAngle: { down: 115, up: 120, right: 110 },
  aura: 0x9fb6ff, cols: { sleeve: NJ.suit, hand: NJ.wrap }, weaponKind: "katana", gait: "sneak",
  moves: {
    a2: { swing: [0, 0, 0, 0], reach: [-3, 5, 7, 3], lift: [1, 0, 0, 0], kind: "thrust" },
    a3: { swing: [-20, -20, -20, -20], reach: [2, 3, 3, 2], lift: [2, 2, 2, 2], kind: "spin" },
    a4: { swing: [80, 40, -45, -75], reach: [-1, 2, 4, 2], lift: [-2, 0, 3, 3], kind: "slash" },
  },
  legs(d, top) { standardLegs(d, top, NJ.suit, NJ.boot); if (d.p.dir !== "right") { d.c.rect(12 + d.lx, 25, 3, 1, NJ.wrap); d.c.rect(17 + d.lx, 25, 3, 1, NJ.wrap); } },
  torso(d) {
    if (d.p.dir === "right") { d.U(12, 16, 8, 8, NJ.suit, true); d.Ur(12, 21, 8, 1, NJ.sash); d.Ur(11, 21, 1, 2, NJ.sash); }
    else {
      d.U(11, 16, 10, 8, NJ.suit, true);
      if (d.p.dir === "down") { d.Up(15, 17, shade(NJ.suit, 0.75)); d.Up(16, 17, shade(NJ.suit, 0.75)); d.Ur(14, 18, 4, 1, shade(NJ.suit, 0.8)); }
      d.Ur(11, 21, 10, 1, NJ.sash); d.Ur(11, 22, 10, 1, shade(NJ.sash, 0.7));
      if (d.p.dir === "up") { d.Ur(15, 22, 2, 2, NJ.sash); }
    }
  },
  head(d) {
    const tail = d.p.t % 2;
    if (d.p.dir === "right") {
      d.U(11, 5, 10, 11, NJ.hood, true);
      d.Ur(16, 9, 5, 3, NJ.skin); eyes(d, [18], 10, NJ.eye);
      d.Ur(11, 7, 10, 2, NJ.band); d.Up(20, 7, shade(NJ.band, 1.3));
      d.Ur(9, 7, 2, 2, NJ.band); // knot
      for (const [x, y] of [[8, 9], [7, 9 + tail], [6, 10 + tail], [8, 10], [7, 11], [6, 12 - tail]]) d.Up(x, y, NJ.band);
    } else if (d.p.dir === "down") {
      d.U(10, 5, 12, 11, NJ.hood, true);
      d.Ur(12, 9, 8, 3, NJ.skin); eyes(d, [13, 18], 10, NJ.eye);
      d.Ur(10, 7, 12, 2, NJ.band); d.Ur(11, 7, 3, 1, shade(NJ.band, 1.3));
    } else {
      d.U(10, 5, 12, 11, NJ.hood, true);
      d.Ur(10, 7, 12, 2, NJ.band);
      d.Ur(15, 7, 2, 3, shade(NJ.band, 0.8));
      for (const [x, y] of [[15, 10], [15, 11], [14, 12 + tail], [16, 10], [17, 11], [17, 12], [18, 13 - tail]]) d.Up(x, y, shade(NJ.band, 0.85));
    }
  },
  arm(d, which, [hx, hy]) {
    const p = d.p;
    if (p.dir === "right") {
      if (which === "far") { d.c.box(17 + d.ux - (p.attack >= 0 ? 0 : Math.round(p.stride * 1.5)), 17 + d.uy, 2, 5, shade(NJ.suit, 0.75)); return; }
      armTo(d, 15, 17, hx, hy, NJ.suit, NJ.wrap);
    } else {
      const other: [number, number] = p.dir === "down" ? [21, 17] : [9, 17];
      const weaponSide: [number, number] = p.dir === "down" ? [9, 17] : [21, 17];
      if (which === "far") { const sw = p.attack >= 0 ? 0 : (p.dir === "down" ? p.stride : -p.stride); d.c.box(other[0] + d.ux, other[1] + d.uy, 2, 5 + sw, NJ.suit); d.c.rect(other[0] + d.ux, other[1] + d.uy + 5 + sw, 2, 1, NJ.wrap); return; }
      armTo(d, weaponSide[0], weaponSide[1], hx, hy, NJ.suit, NJ.wrap);
    }
  },
  weapon(d, [hx, hy], a) {
    const ux = Math.cos(rad(a)), uy = Math.sin(rad(a));
    d.c.line(hx - ux * 3, hy - uy * 3, hx, hy, NJ.hilt);
    d.c.px(hx + ux, hy + uy, NJ.guard);
    d.c.line(hx + ux * 2, hy + uy * 2, hx + ux * 12, hy + uy * 12, NJ.blade);
    d.c.line(hx + ux * 2 + 0.6 * -uy, hy + uy * 2 + 0.6 * ux, hx + ux * 10 + 0.6 * -uy, hy + uy * 10 + 0.6 * ux, shade(NJ.blade, 0.75));
  },
  fx(d, hand, a) { if (d.p.attack === 2) slash(d, hand, a, 0xffffff, 13); if (d.p.attack === 1) slash(d, hand, a, 0xbfd7ff, 12, 0.5); },
};

// ---------- KNIGHT ----------
const KN = { steel: 0xb4bcc6, dark: 0x6f7883, slit: 0x14141c, plume: 0xd62839, tabard: 0x2a5db0, gold: 0xf2c14e, mail: 0x8a939b, boot: 0x4f5560, blade: 0xeef3f7, hilt: 0x6b4226, shield: 0x2a5db0 };
const knight: Hero = {
  name: "knight",
  swing: [-120, -30, 40, 70],
  idleAngle: { down: 100, up: 110, right: 70 },
  aura: 0xffd166, cols: { sleeve: KN.steel, hand: KN.dark }, weaponKind: "sword", gait: "march",
  moves: {
    a2: { swing: [110, 40, -35, -60], reach: [0, 3, 4, 2], lift: [0, 1, 0, 0], kind: "slash", fx: 0xfff6c8 },
    a3: { swing: [140, 140, 140, 140], reach: [-1, 1, 1, 0], lift: [0, 0, 0, 0], kind: "bash" },
    a4: { swing: [-175, -100, 10, 25], reach: [-1, 1, 4, 3], lift: [8, 7, 0, 0], kind: "slash", fx: 0xfff6c8 },
  },
  legs(d, top) { standardLegs(d, top, KN.mail, KN.boot); if (d.p.dir !== "right") { d.c.rect(12 + d.lx, top, 3, 1, KN.steel); d.c.rect(17 + d.lx, top, 3, 1, KN.steel); } },
  torso(d) {
    if (d.p.dir === "right") {
      d.U(12, 16, 8, 8, KN.steel, true); d.Ur(13, 18, 6, 6, KN.tabard); d.Ur(13, 18, 6, 1, KN.gold);
      d.Ur(12, 22, 8, 1, 0x5a3a22);
    } else {
      d.U(11, 16, 10, 8, KN.steel, true);
      if (d.p.dir === "down") { d.Ur(12, 18, 8, 6, KN.tabard); d.Ur(15, 18, 2, 6, KN.gold); d.Ur(13, 20, 6, 1, KN.gold); d.Ur(12, 18, 1, 6, shade(KN.tabard, 1.2)); }
      d.Ur(11, 22, 10, 1, 0x5a3a22); if (d.p.dir === "down") d.Ur(15, 22, 2, 1, KN.gold);
      d.U(9, 15, 4, 3, KN.steel, true); d.U(19, 15, 4, 3, KN.steel, true); // pauldrons
    }
  },
  head(d) {
    const dir = d.p.dir;
    const plume = (pts: number[][]) => pts.forEach(([x, y, k]) => d.Up(x, y, k ? shade(KN.plume, 0.75) : KN.plume));
    if (dir === "right") {
      d.U(11, 5, 10, 11, KN.steel, true); d.c.clear(11 + d.ux, 5 + d.uy); d.c.clear(20 + d.ux, 5 + d.uy);
      d.Ur(16, 10, 5, 1, KN.slit); d.Ur(18, 12, 1, 2, KN.slit); d.Ur(11, 13, 10, 1, KN.dark);
      d.Ur(13, 8, 1, 5, KN.dark);
      plume([[14, 4, 0], [15, 4, 0], [16, 4, 0], [13, 3, 0], [12, 3, 0], [11, 3, 1], [10, 4, 1], [9, 5, 1], [15, 3, 0], [14, 3, 0], [16, 3, 0], [10, 5, 1]]);
    } else {
      d.U(10, 5, 12, 11, KN.steel, true); d.c.clear(10 + d.ux, 5 + d.uy); d.c.clear(21 + d.ux, 5 + d.uy);
      if (dir === "down") {
        d.Ur(12, 10, 8, 1, KN.slit); d.Ur(15, 11, 2, 3, KN.slit); d.Ur(15, 6, 2, 4, KN.dark);
        for (const x of [12, 13, 18, 19]) d.Up(x, 13, KN.dark);
        if (d.p.expr === "x") { d.Ur(12, 10, 8, 1, 0xff5050); }
      } else { d.Ur(15, 6, 2, 9, KN.dark); d.Ur(10, 13, 12, 1, KN.dark); }
      plume([[14, 4, 0], [15, 4, 0], [16, 4, 0], [17, 4, 0], [14, 3, 0], [15, 2, 0], [16, 2, 0], [17, 3, 1], [15, 3, 0], [16, 3, 0]]);
    }
  },
  arm(d, which, [hx, hy]) {
    const p = d.p;
    if (p.dir === "right") {
      if (which === "far") return;
      armTo(d, 15, 17, hx, hy, KN.steel, KN.dark);
    } else {
      const weaponSide: [number, number] = p.dir === "down" ? [9, 17] : [21, 17];
      if (which === "far") { const x = p.dir === "down" ? 21 : 9; d.c.box(x + d.ux, 17 + d.uy, 2, 6, KN.steel); return; }
      armTo(d, weaponSide[0], weaponSide[1], hx, hy, KN.steel, KN.dark);
    }
  },
  shield(d) {
    const dir = d.p.dir, guard = d.p.attack >= 0 ? 0 : 0;
    if (dir === "right") {
      const x = 19 + d.ux + (d.p.attack === 0 ? 1 : 0);
      d.c.box(x, 16 + d.uy, 3, 9, KN.shield); d.c.rect(x, 16 + d.uy, 3, 1, KN.gold); d.c.rect(x, 24 + d.uy, 3, 1, KN.gold); d.c.rect(x + 2, 17 + d.uy, 1, 7, KN.gold);
    } else {
      const x = (dir === "down" ? 19 : 8) + d.ux + guard, y = 17 + d.uy;
      d.c.box(x, y, 6, 8, KN.shield);
      d.c.rect(x, y, 6, 1, KN.gold); d.c.rect(x, y, 1, 7, KN.gold); d.c.rect(x + 5, y, 1, 7, KN.gold);
      d.c.rect(x + 1, y + 7, 4, 1, KN.gold); d.c.px(x + 2, y + 8, KN.gold); d.c.px(x + 3, y + 8, KN.gold);
      if (dir === "down") { d.c.rect(x + 2, y + 2, 2, 4, KN.gold); d.c.rect(x + 1, y + 3, 4, 1, KN.gold); }
    }
  },
  weapon(d, [hx, hy], a) {
    const ux = Math.cos(rad(a)), uy = Math.sin(rad(a)), nx = -uy, ny = ux;
    d.c.line(hx - ux * 2, hy - uy * 2, hx, hy, KN.hilt);
    d.c.px(hx - ux * 3, hy - uy * 3, KN.gold);
    d.c.line(hx + ux + nx * 1.6, hy + uy + ny * 1.6, hx + ux - nx * 1.6, hy + uy - ny * 1.6, KN.gold);
    d.c.line(hx + ux * 2, hy + uy * 2, hx + ux * 11, hy + uy * 11, KN.blade);
    d.c.line(hx + ux * 2 + nx * 0.7, hy + uy * 2 + ny * 0.7, hx + ux * 10 + nx * 0.7, hy + uy * 10 + ny * 0.7, shade(KN.blade, 0.72));
  },
  fx(d, hand, a) { if (d.p.attack === 2) slash(d, hand, a, 0xfff6c8, 12); },
};

// ---------- WIZARD ----------
const WZ = { robe: 0x6a3fb5, trim: 0xf2c14e, hat: 0x5a34a0, beard: 0xeeeef4, skin: 0xf1c8a0, eye: 0x111111, shoe: 0x5a3a22, wood: 0x8b5a2b, orb: 0x5ee6ff, glow: 0xc8fbff };
const wizard: Hero = {
  name: "wizard",
  swing: [-110, -55, -25, -15],
  idleAngle: { down: -97, up: -83, right: -78 },
  kind1: "shot",
  aura: 0x5ee6ff, cols: { sleeve: WZ.robe, hand: WZ.skin }, weaponKind: "staff", gait: "float",
  moves: {
    a2: { swing: [-150, -70, 20, 45], reach: [0, 3, 4, 2], lift: [5, 2, 0, 0], kind: "bonk", fx: 0xc8fbff },
    a3: { swing: [-90, -90, -90, -90], abs: true, reach: [0, 0, 0, 0], lift: [3, 6, 6, 3], kind: "cast" },
    a4: { swing: [-35, -28, -22, -25], reach: [-6, -2, 0, -2], lift: [2, 1, 1, 0], kind: "thrust", fx: 0xc8fbff },
  },
  legs(d, top) {
    // robe skirt covers legs; feet peek out
    const s = d.p.stride, x0 = d.lx;
    if (d.p.dir === "right") {
      d.c.box(14 + x0 + Math.round(s * 2), 27, 4, 2, WZ.shoe); d.c.box(14 + x0 - Math.round(s * 2), 27, 4, 2, shade(WZ.shoe, 0.8));
      d.c.box(11 + x0, Math.max(top, 23), 10, 28 - Math.max(top, 23), WZ.robe); d.c.rect(11 + x0, 27, 10, 1, WZ.trim);
    } else {
      d.c.box(12 + x0, 28 - (s > 0 ? 1 : 0), 3, 2, WZ.shoe); d.c.box(17 + x0, 28 - (s < 0 ? 1 : 0), 3, 2, WZ.shoe);
      d.c.box(10 + x0, Math.max(top, 23), 12, 28 - Math.max(top, 23), WZ.robe); d.c.rect(10 + x0, 27, 12, 1, WZ.trim);
      if (d.p.dir === "down") d.c.rect(15 + x0, Math.max(top, 23), 2, 4, WZ.trim);
    }
  },
  torso(d) {
    if (d.p.dir === "right") { d.U(12, 16, 8, 8, WZ.robe, true); d.Ur(12, 21, 8, 1, WZ.trim); }
    else {
      d.U(11, 16, 10, 8, WZ.robe, true); d.Ur(11, 21, 10, 1, WZ.trim);
      if (d.p.dir === "down") d.Ur(15, 16, 2, 8, WZ.trim);
    }
  },
  head(d) {
    const dir = d.p.dir;
    const cone = (cx: number, lean: number) => {
      // rows from brim upward: width shrinks, tip bends toward -lean
      const rows = [[10, 0], [8, 0], [7, 0], [6, 1], [5, 1], [3, 2], [2, 3], [1, 4]];
      rows.forEach(([w, off], i) => { const y = 6 - i; d.Ur(cx - (w >> 1) + off * lean, y, w, 1, WZ.hat); d.Up(cx - (w >> 1) + off * lean, y, shade(WZ.hat, 1.25)); });
      d.Ur(cx - 5, 5, 10, 1, WZ.trim);
    };
    if (dir === "right") {
      d.U(12, 8, 9, 8, WZ.skin); d.Ur(12, 8, 3, 7, WZ.beard);
      eyes(d, [18], 10, WZ.eye); d.Up(21, 11, WZ.skin);
      d.Ur(16, 12, 5, 4, WZ.beard); d.Ur(17, 16, 4, 2, WZ.beard); d.Ur(19, 18, 2, 1, WZ.beard); d.Up(17, 13, shade(WZ.beard, 0.82)); d.Up(19, 16, shade(WZ.beard, 0.82));
      d.Ur(14, 7, 7, 1, shade(WZ.beard, 0.9));
      d.U(9, 6, 14, 2, WZ.hat, true); cone(15, -1);
      d.Up(17, 3, WZ.trim);
    } else if (dir === "down") {
      d.U(11, 8, 10, 8, WZ.skin); d.Ur(10, 8, 2, 6, WZ.beard); d.Ur(20, 8, 2, 6, WZ.beard);
      eyes(d, [13, 18], 10, WZ.eye); d.Ur(13, 9, 2, 1, WZ.beard); d.Ur(17, 9, 2, 1, WZ.beard);
      d.Up(15, 11, shade(WZ.skin, 0.8)); d.Up(16, 11, shade(WZ.skin, 0.8));
      d.Ur(12, 12, 8, 4, WZ.beard); d.Ur(13, 16, 6, 2, WZ.beard); d.Ur(14, 18, 4, 1, WZ.beard); d.Ur(15, 19, 2, 1, WZ.beard);
      d.Ur(14, 12, 4, 1, shade(WZ.beard, 0.8)); d.Up(13, 15, shade(WZ.beard, 0.82)); d.Up(18, 16, shade(WZ.beard, 0.82)); d.Up(15, 17, shade(WZ.beard, 0.82));
      d.U(8, 6, 16, 2, WZ.hat, true); cone(16, 1);
      d.Up(15, 3, WZ.trim); d.Up(14, 2, shade(WZ.trim, 1.2));
    } else {
      d.U(11, 8, 10, 7, WZ.beard); d.Ur(12, 15, 8, 1, WZ.beard);
      for (const x of [13, 16, 19]) d.Ur(x, 10, 1, 4, shade(WZ.beard, 0.82));
      d.U(8, 6, 16, 2, WZ.hat, true); cone(16, -1);
    }
  },
  arm(d, which, [hx, hy]) {
    const p = d.p;
    if (p.dir === "right") { if (which === "near") armTo(d, 15, 17, hx, hy, WZ.robe, WZ.skin, 3); return; }
    const weaponSide: [number, number] = p.dir === "down" ? [9, 17] : [21, 17];
    if (which === "far") { const x = p.dir === "down" ? 21 : 8; d.c.box(x + d.ux, 17 + d.uy, 3, 5, WZ.robe); d.c.rect(x + d.ux, 21 + d.uy, 3, 1, WZ.trim); d.c.rect(x + d.ux + 1, 22 + d.uy, 2, 1, WZ.skin); return; }
    armTo(d, weaponSide[0] - (p.dir === "down" ? 1 : 0), weaponSide[1], hx, hy, WZ.robe, WZ.skin, 3);
  },
  weapon(d, [hx, hy], a) {
    const ux = Math.cos(rad(a)), uy = Math.sin(rad(a));
    d.c.line(hx - ux * 5, hy - uy * 5, hx + ux * 14, hy + uy * 14, WZ.wood);
    d.c.line(hx - ux * 4 + 0.7 * -uy, hy - uy * 4 + 0.7 * ux, hx + ux * 12 + 0.7 * -uy, hy + uy * 12 + 0.7 * ux, shade(WZ.wood, 0.75));
    const ox = hx + ux * 16, oy = hy + uy * 16;
    d.c.ellipse(ox, oy, 1.6, 1.6, WZ.orb); d.c.px(ox - 1, oy - 1, WZ.glow);
    d.c.px(hx + ux * 14 - uy * 1.5, hy + uy * 14 + ux * 1.5, WZ.trim); d.c.px(hx + ux * 14 + uy * 1.5, hy + uy * 14 - ux * 1.5, WZ.trim);
  },
  fx(d, [hx, hy], a) {
    const ux = Math.cos(rad(a)), uy = Math.sin(rad(a)), ox = hx + ux * 16, oy = hy + uy * 16;
    const ph = d.p.attack;
    if (ph < 0) { if (d.p.t % 4 === 0) d.c.px(ox + 2, oy - 2, WZ.glow, 200); return; }
    if (ph === 0) { d.c.ellipse(ox, oy, 2.5, 2.5, WZ.orb, 90); }
    if (ph === 1) { d.c.ellipse(ox, oy, 3, 3, WZ.orb, 120); d.c.px(ox - 3, oy - 3, WZ.glow); d.c.px(ox + 3, oy - 2, WZ.glow); }
    if (ph === 2) {
      const bx = ox + ux * 5, by = oy + uy * 5;
      d.c.ellipse(bx, by, 4, 4, 0x9a6bff, 110); d.c.ellipse(bx, by, 2.5, 2.5, WZ.orb, 220); d.c.ellipse(bx, by, 1, 1, 0xffffff);
      for (const [sx, sy] of [[-5, 0], [5, 0], [0, -5], [0, 5]]) d.c.px(bx + sx, by + sy, WZ.glow);
    }
    if (ph === 3) {
      const bx = ox + ux * 7, by = oy + uy * 7;
      for (const [sx, sy] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, -4], [0, 4], [-4, 0], [4, 0]]) d.c.px(bx + sx, by + sy, WZ.glow, 200);
    }
  },
};

/** Arm from shoulder to hand with sleeve then hand pixel(s). */
function armTo(d: D, sx: number, sy: number, hx: number, hy: number, sleeve: number, hand: number, w = 2) {
  const ax = sx + d.ux, ay = sy + d.uy;
  for (let k = 0; k < w; k++) d.c.line(ax + k, ay, hx + (k - (w >> 1)), hy - 1, k === 0 ? shade(sleeve, 1.15) : sleeve);
  d.c.rect(hx - 1, hy - 1, 2, 2, hand);
}

function slash(d: D, [hx, hy]: [number, number], a: number, col: number, r: number, alpha = 1) {
  const dirSign = d.p.dir === "up" ? 1 : -1;
  for (let k = 0; k <= 70; k += 4) {
    const ang = rad(a + dirSign * k);
    const fade = Math.round((1 - k / 80) * 230 * alpha);
    d.c.px(hx + Math.cos(ang) * r, hy + Math.sin(ang) * r, col, fade);
    if (k < 45) d.c.px(hx + Math.cos(ang) * (r - 1), hy + Math.sin(ang) * (r - 1), col, fade * 0.6);
  }
}

// ---------- generic humans (archer, barbarian, NPCs) ----------
interface HumanOpts {
  name: string;
  skin: number; hair: number; eye?: number;
  hairStyle: "short" | "long" | "bald" | "ponytail";
  beard?: number;                 // beard colour
  hat?: { kind: "hood" | "horned" | "cap" | "helm" | "bandana" | "wide" | "witch"; col: number; trim?: number };
  shirt: number; pants: number; boots: number; belt?: number;
  bareChest?: boolean;
  apron?: number; vest?: number; tabard?: { col: number; emblem: number };
  sleeve?: number;
  weapon: "bow" | "axe" | "hammer" | "spear" | "dagger" | "staff" | "none";
  quiver?: boolean;
  fxCol?: number;
  aura?: number;
  gait?: Hero["gait"];
  hipHand?: boolean; // idles with the free hand on the hip
}

function human(o: HumanOpts): Hero {
  const eye = o.eye ?? 0x111111;
  const sleeve = o.bareChest ? o.skin : o.sleeve ?? o.shirt;
  const swing: Record<HumanOpts["weapon"], number[]> = {
    bow: [0, 0, 0, 0], axe: [-140, -50, 30, 60], hammer: [-150, -70, 10, 40], spear: [-20, 0, 0, 0], dagger: [-90, -20, 30, 50], staff: [-120, -60, 10, 40], none: [-60, -10, 20, 30],
  };
  const idle: Record<HumanOpts["weapon"], Record<Dir, number>> = {
    bow: { down: 180, up: 0, right: 0 }, axe: { down: 100, up: 110, right: 75 }, hammer: { down: 100, up: 110, right: 80 },
    spear: { down: -95, up: -85, right: -80 }, dagger: { down: 110, up: 110, right: 100 }, staff: { down: -95, up: -85, right: -85 }, none: { down: 90, up: 90, right: 90 },
  };
  const hat = o.hat;
  const backhand = (sw: number[]): Move => ({ swing: [-sw[0] * 0.8, -sw[1], -sw[2], -sw[3]], kind: "slash", fx: o.fxCol });
  const moves: Record<HumanOpts["weapon"], { a2: Move; a3: Move; a4: Move }> = {
    bow: { a2: { swing: [0, 0, 0, 0], reach: [0, 1, 1, 0], lift: [1, 1, 1, 1], kind: "double" }, a3: { swing: [0, 0, 0, 0], reach: [-2, -3, 1, 0], lift: [1, 1, 0, 0], kind: "charged" }, a4: { swing: [-25, -25, -20, -20], reach: [-1, 0, 0, 0], lift: [2, 2, 2, 2], kind: "shot" } },
    axe: { a2: backhand(swing.axe), a3: { swing: [-160, -95, 30, 40], reach: [-1, 0, 4, 3], lift: [7, 8, -1, -1], kind: "slam" }, a4: { swing: [80, 40, -45, -75], reach: [-1, 2, 4, 2], lift: [-2, 0, 3, 3], kind: "slash", fx: o.fxCol } },
    hammer: { a2: backhand(swing.hammer), a3: { swing: [-160, -95, 30, 40], reach: [-1, 0, 4, 3], lift: [7, 8, -1, -1], kind: "slam" }, a4: { swing: [80, 40, -45, -75], reach: [-1, 2, 4, 2], lift: [-2, 0, 3, 3], kind: "slash", fx: o.fxCol } },
    spear: { a2: { swing: [-70, -30, 35, 55], kind: "slash" }, a3: { swing: [0, 0, 0, 0], reach: [-4, 4, 7, 2], lift: [0, 0, 0, 0], kind: "thrust" }, a4: { swing: [-175, -100, 10, 25], reach: [-1, 1, 4, 3], lift: [8, 7, 0, 0], kind: "slash" } },
    dagger: { a2: { swing: [0, 0, 0, 0], reach: [-3, 4, 6, 2], lift: [1, 0, 0, 0], kind: "thrust" }, a3: backhand(swing.dagger), a4: { swing: [80, 40, -45, -75], reach: [-1, 2, 4, 2], lift: [-2, 0, 3, 3], kind: "slash" } },
    staff: { a2: backhand(swing.staff), a3: { swing: [-160, -95, 30, 40], reach: [-1, 0, 4, 3], lift: [7, 8, -1, -1], kind: "slam" }, a4: { swing: [0, 0, 0, 0], reach: [-3, 3, 5, 1], lift: [0, 0, 0, 0], kind: "thrust" } },
    none: { a2: { swing: [0, 0, 0, 0], reach: [-2, 4, 5, 2], lift: [1, 0, 0, 0], kind: "thrust" }, a3: { swing: [0, 0, 0, 0], reach: [-1, 3, 5, 1], lift: [0, 0, 0, 0], kind: "bash" }, a4: { swing: [0, 0, 0, 0], reach: [0, 2, 4, 1], lift: [-1, 2, 4, 1], kind: "thrust" } },
  };
  const H: Hero = {
    name: o.name,
    swing: swing[o.weapon],
    kind1: o.weapon === "bow" ? "shot" : o.weapon === "spear" ? "thrust" : "slash",
    moves: moves[o.weapon],
    aura: o.aura, cols: { sleeve, hand: o.skin }, weaponKind: o.weapon, gait: o.gait ?? "stroll",
    idleAngle: idle[o.weapon], hipHand: o.hipHand,
    legs(d, top) { standardLegs(d, top, o.pants, o.boots); },
    torso(d) {
      const dir = d.p.dir;
      const top = o.bareChest ? o.skin : o.shirt;
      if (dir === "right") {
        if (o.quiver) { d.U(9, 14, 3, 8, 0x8b5a2b); d.Ur(9, 12, 1, 2, 0xf3ead8); d.Ur(10, 12, 1, 2, 0xd62839); d.Ur(11, 13, 1, 1, 0xf3ead8); }
        d.U(12, 16, 8, 8, top, true);
        if (o.bareChest) { d.Ur(17, 18, 2, 1, shade(o.skin, 0.8)); d.Ur(12, 16, 8, 1, 0x7a5230); }
        if (o.vest) d.Ur(12, 16, 4, 6, o.vest);
        if (o.apron) d.Ur(16, 17, 4, 7, o.apron);
        if (o.tabard) d.Ur(14, 17, 5, 7, o.tabard.col);
        if (o.belt) d.Ur(12, 21, 8, 1, o.belt);
      } else {
        if (o.quiver && dir === "up") { d.U(17, 13, 3, 9, 0x8b5a2b); d.Ur(17, 12, 1, 1, 0xf3ead8); d.Ur(18, 11, 1, 2, 0xd62839); d.Ur(19, 12, 1, 1, 0xf3ead8); }
        d.U(11, 16, 10, 8, top, true);
        if (o.bareChest && dir === "down") { d.Ur(13, 18, 2, 1, shade(o.skin, 0.8)); d.Ur(17, 18, 2, 1, shade(o.skin, 0.8)); d.Ur(15, 20, 2, 1, shade(o.skin, 0.85)); }
        if (o.bareChest) d.c.line(11 + d.ux, 16 + d.uy, 20 + d.ux, 22 + d.uy, 0x7a5230);
        if (o.quiver && dir === "down") d.c.line(20 + d.ux, 16 + d.uy, 12 + d.ux, 21 + d.uy, 0x8b5a2b);
        if (o.vest && dir === "down") { d.Ur(11, 16, 3, 7, o.vest); d.Ur(18, 16, 3, 7, o.vest); }
        if (o.vest && dir === "up") d.Ur(11, 16, 10, 7, o.vest);
        if (o.apron && dir === "down") { d.Ur(12, 17, 8, 7, o.apron); d.Ur(13, 16, 1, 1, o.apron); d.Ur(18, 16, 1, 1, o.apron); d.Ur(14, 19, 4, 2, shade(o.apron, 0.8)); }
        if (o.apron && dir === "up") d.Ur(11, 20, 10, 1, o.apron);
        if (o.tabard && dir === "down") { d.Ur(12, 17, 8, 7, o.tabard.col); d.Ur(15, 18, 2, 4, o.tabard.emblem); d.Ur(14, 19, 4, 1, o.tabard.emblem); }
        if (o.tabard && dir === "up") d.Ur(12, 17, 8, 7, o.tabard.col);
        if (o.belt) { d.Ur(11, 21, 10, 1, o.belt); if (dir === "down") d.Up(15, 21, 0xf2c14e); }
      }
    },
    head(d) {
      const dir = d.p.dir, hr = o.hair, sk = o.skin;
      if (dir === "right") {
        d.U(11, 5, 10, 11, sk, true);
        if (o.hairStyle !== "bald") {
          d.Ur(11, 5, 10, 3, hr); d.Ur(11, 8, 4, o.hairStyle === "long" ? 7 : 4, hr); d.Ur(15, 8, 1, 1, hr);
          if (o.hairStyle === "ponytail") { d.Ur(9, 8, 2, 2, hr); d.Ur(8, 10, 2, 3, hr); d.Up(8, 13, hr); }
          d.Up(12, 6, shade(hr, 1.25)); d.Up(14, 5, shade(hr, 1.25));
        }
        d.Ur(14, 10, 1, 2, shade(sk, 0.85)); // ear
        eyes(d, [18], 10, eye); d.Up(21, 11, sk);
        if (o.beard !== undefined) { d.Ur(15, 12, 6, 3, o.beard); d.Ur(16, 15, 4, 1, o.beard); }
      } else if (dir === "down") {
        d.U(10, 5, 12, 11, sk, true);
        if (o.hairStyle !== "bald") {
          d.Ur(10, 5, 12, 3, hr); d.Ur(10, 8, 1, o.hairStyle === "long" ? 7 : 3, hr); d.Ur(21, 8, 1, o.hairStyle === "long" ? 7 : 3, hr);
          d.Ur(11, 8, 3, 1, hr); d.Up(18, 8, hr); d.Ur(12, 5, 3, 1, shade(hr, 1.25));
        }
        eyes(d, [13, 18], 10, eye);
        d.Up(10, 11, shade(sk, 0.85)); d.Up(21, 11, shade(sk, 0.85));
        if (o.beard !== undefined) { d.Ur(11, 12, 10, 3, o.beard); d.Ur(12, 15, 8, 1, o.beard); d.Ur(14, 13, 4, 1, shade(sk, 0.7)); }
        else d.Ur(15, 13, 2, 1, shade(sk, 0.75));
      } else {
        d.U(10, 5, 12, 11, o.hairStyle === "bald" ? sk : hr, true);
        if (o.hairStyle === "bald") d.Ur(10, 13, 12, 1, shade(sk, 0.85));
        else if (o.hairStyle !== "long") d.Ur(11, 14, 10, 2, sk);
        if (o.hairStyle === "ponytail") { d.Ur(15, 13, 2, 4, hr); }
        if (o.hairStyle !== "bald") for (const x of [13, 16, 19]) d.Ur(x, 7, 1, 5, shade(hr, 0.82));
      }
      if (!hat) return;
      const hc = hat.col, tr = hat.trim ?? shade(hc, 0.75);
      if (hat.kind === "hood") {
        if (dir === "right") { d.U(10, 4, 11, 5, hc, true); d.Ur(10, 9, 5, 7, hc); d.Ur(9, 9, 2, 6, hc); d.Ur(20, 6, 1, 3, tr); }
        else if (dir === "down") { d.U(9, 4, 14, 4, hc, true); d.Ur(9, 8, 2, 8, hc); d.Ur(21, 8, 2, 8, hc); d.Ur(11, 8, 10, 1, tr); }
        else { d.U(9, 4, 14, 12, hc, true); d.Ur(15, 6, 2, 9, tr); }
      } else if (hat.kind === "horned") {
        const horn = 0xefe3c8;
        if (dir === "right") { d.U(11, 4, 10, 4, hc, true); d.Ur(11, 7, 10, 1, tr); for (const [x, y] of [[13, 3], [12, 2], [12, 1], [13, 0]]) d.Up(x, y, horn); }
        else { d.U(10, 4, 12, 4, hc, true); d.Ur(10, 7, 12, 1, tr); if (dir === "down") d.Ur(15, 4, 2, 4, tr);
          for (const [x, y] of [[9, 5], [8, 4], [7, 3], [7, 2], [8, 1], [22, 5], [23, 4], [24, 3], [24, 2], [23, 1]]) d.Up(x, y, horn); }
      } else if (hat.kind === "cap") {
        if (dir === "right") { d.U(11, 3, 9, 4, hc, true); d.Ur(19, 6, 4, 1, tr); if (hat.trim) d.Ur(11, 6, 8, 1, hat.trim); d.Up(13, 2, 0xd62839); d.Up(12, 1, 0xd62839); }
        else { d.U(10, 3, 12, 4, hc, true); d.Ur(10, 6, 12, 1, tr); if (dir === "down") { d.Up(18, 2, 0xd62839); d.Up(19, 1, 0xd62839); } }
      } else if (hat.kind === "helm") {
        if (dir === "right") { d.U(11, 3, 10, 6, hc, true); d.Ur(11, 8, 10, 1, tr); d.Ur(19, 8, 1, 4, tr); }
        else { d.U(10, 3, 12, 6, hc, true); d.Ur(10, 8, 12, 1, tr); if (dir === "down") d.Ur(15, 8, 2, 4, tr); }
        d.Ur(15, 2, 2, 1, tr);
      } else if (hat.kind === "bandana") {
        if (dir === "right") { d.Ur(11, 5, 10, 3, hc); d.Ur(9, 7, 2, 2, hc); d.Up(8, 9, hc); }
        else { d.Ur(10, 5, 12, 3, hc); d.Up(12, 6, tr); d.Up(17, 6, tr); if (dir === "up") { d.Ur(15, 8, 2, 3, hc); } }
      } else if (hat.kind === "wide") {
        if (dir === "right") { d.U(12, 2, 8, 4, hc, true); d.U(8, 5, 16, 2, hc); d.Ur(12, 4, 8, 1, tr); }
        else { d.U(11, 1, 10, 5, hc, true); d.U(7, 5, 18, 2, hc); d.Ur(11, 4, 10, 1, tr); }
      } else if (hat.kind === "witch") {
        // Tall pointed hat with the tip bent over, wide brim and a coloured band
        if (dir === "right") {
          d.U(8, 6, 16, 2, hc, true); d.U(12, 3, 9, 3, hc, true); d.Ur(13, 1, 6, 2, hc); d.Ur(11, 0, 4, 1, hc); d.Up(10, 1, hc);
          d.Ur(12, 5, 9, 1, tr);
        } else {
          d.U(6, 6, 20, 2, hc, true); d.U(11, 3, 10, 3, hc, true); d.Ur(12, 1, 8, 2, hc); d.Ur(15, 0, 5, 1, hc); d.Up(20, 1, hc); d.Up(21, 2, hc);
          d.Ur(11, 5, 10, 1, tr); if (dir === "down") d.Up(15, 5, 0xf2c14e);
        }
      }
    },
    arm(d, which, [hx, hy]) {
      const p = d.p;
      if (p.dir === "right") {
        if (which === "far") { d.c.box(17 + d.ux - (p.attack >= 0 ? 0 : Math.round(p.stride * 1.5)), 17 + d.uy, 2, 5, shade(sleeve, 0.75)); return; }
        armTo(d, 15, 17, hx, hy, sleeve, o.skin);
        return;
      }
      if (which === "far") {
        const x = p.dir === "down" ? 21 : 9, sw = p.attack >= 0 ? 0 : (p.dir === "down" ? p.stride : -p.stride);
        if (o.weapon === "bow" && p.attack >= 0) return; // both hands on the bow
        d.c.box(x + d.ux, 17 + d.uy, 2, 5 + sw, sleeve); d.c.rect(x + d.ux, 22 + d.uy + sw, 2, 1, o.skin); return;
      }
      armTo(d, p.dir === "down" ? 9 : 21, 17, hx, hy, sleeve, o.skin);
    },
    weapon(d, [hx, hy], a) {
      const ux = Math.cos(rad(a)), uy = Math.sin(rad(a)), nx = -uy, ny = ux;
      const W = 0x8b5a2b, STEEL = 0xd5dce4;
      switch (o.weapon) {
        case "bow": {
          const ph = d.p.attack, ch = d.p.move === "a3", pull = ph === 0 ? (ch ? 4 : 2) : ph === 1 ? (ch ? 5 : 4) : 0;
          const pts: [number, number][] = [];
          for (let t = -7; t <= 7; t++) { const bend = 3 * (1 - (t / 7) ** 2); pts.push([hx + nx * t + ux * bend, hy + ny * t + uy * bend]); }
          for (let i = 1; i < pts.length; i++) d.c.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], i === 1 || i === pts.length - 1 ? shade(W, 0.7) : W);
          const sx = hx - ux * pull, sy = hy - uy * pull;
          d.c.line(pts[0][0], pts[0][1], sx, sy, 0xf3ead8, 200); d.c.line(pts[pts.length - 1][0], pts[pts.length - 1][1], sx, sy, 0xf3ead8, 200);
          if (ph === 0 || ph === 1) { d.c.line(sx, sy, sx + ux * 10, sy + uy * 10, 0xc9a26a); d.c.px(sx + ux * 11, sy + uy * 11, STEEL); d.c.px(sx, sy, 0xd62839); }
          break;
        }
        case "axe": {
          d.c.line(hx - ux * 2, hy - uy * 2, hx + ux * 10, hy + uy * 10, W);
          const bx = hx + ux * 8, by = hy + uy * 8;
          for (let t = 1; t <= 4; t++) d.c.line(bx + nx * t, by + ny * t, bx + nx * t + ux * (3 + (t > 2 ? 1 : 0)), by + ny * t + uy * (3 + (t > 2 ? 1 : 0)), t === 4 ? 0xf3f6f9 : STEEL);
          d.c.line(bx - nx, by - ny, bx - nx + ux * 2, by - ny + uy * 2, shade(STEEL, 0.7));
          break;
        }
        case "hammer": {
          d.c.line(hx - ux * 2, hy - uy * 2, hx + ux * 8, hy + uy * 8, W);
          const bx = hx + ux * 8, by = hy + uy * 8;
          for (let t = -2; t <= 2; t++) d.c.line(bx + nx * t, by + ny * t, bx + nx * t + ux * 2, by + ny * t + uy * 2, t === -2 ? 0x8a939b : 0x5b6470);
          break;
        }
        case "spear": {
          d.c.line(hx - ux * 6, hy - uy * 6, hx + ux * 14, hy + uy * 14, W);
          const tx = hx + ux * 14, ty = hy + uy * 14;
          d.c.line(tx, ty, tx + ux * 4, ty + uy * 4, STEEL); d.c.px(tx + nx, ty + ny, STEEL); d.c.px(tx - nx, ty - ny, STEEL);
          d.c.px(tx - ux, ty - uy, 0xd62839);
          break;
        }
        case "dagger": {
          d.c.line(hx - ux * 1, hy - uy * 1, hx, hy, 0x5a3a22);
          d.c.line(hx + ux, hy + uy, hx + ux * 6, hy + uy * 6, STEEL);
          break;
        }
        case "staff": {
          // Gnarled oak staff with a glowing leaf-green stone in its crook
          const G = 0x6e4526;
          d.c.line(hx - ux * 7, hy - uy * 7, hx + ux * 11, hy + uy * 11, G);
          d.c.px(hx + ux * 3 + nx, hy + uy * 3 + ny, shade(G, 0.7));
          const tx = hx + ux * 11, ty = hy + uy * 11;
          d.c.px(tx + nx, ty + ny, G); d.c.px(tx + ux + nx * 2, ty + uy + ny * 2, G); d.c.px(tx + ux * 2 + nx, ty + uy * 2 + ny, G);
          const gem = o.fxCol ?? 0x9be564;
          d.c.px(tx + ux, ty + uy, gem); d.c.px(tx + ux * 2, ty + uy * 2, shade(gem, 1.35));
          d.c.px(tx - nx, ty - ny, shade(gem, 0.7));
          break;
        }
        case "none": break;
      }
    },
    fx(d, hand, a) {
      const ph = d.p.attack;
      if (o.weapon === "bow") {
        if (ph === 2 || ph === 3) {
          const ux = Math.cos(rad(a)), uy = Math.sin(rad(a)), [hx, hy] = hand, k = ph === 2 ? 8 : 13;
          d.c.line(hx + ux * k, hy + uy * k, hx + ux * (k + 7), hy + uy * (k + 7), 0xc9a26a);
          d.c.px(hx + ux * (k + 8), hy + uy * (k + 8), 0xffffff);
          d.c.line(hx + ux * (k - 3), hy + uy * (k - 3), hx + ux * (k - 1), hy + uy * (k - 1), 0xffffff, 120);
        }
        return;
      }
      if (o.weapon === "spear" && ph === 2) {
        const ux = Math.cos(rad(a)), uy = Math.sin(rad(a)), [hx, hy] = hand;
        for (const k of [20, 22]) d.c.px(hx + ux * k, hy + uy * k, 0xffffff, 200);
        return;
      }
      if (o.weapon !== "none" && ph === 2) slash(d, hand, a, o.fxCol ?? 0xffffff, o.weapon === "dagger" ? 9 : 12);
    },
  };
  return H;
}

const archer = human({
  name: "archer", skin: 0xf1c27d, hair: 0xc8792b, hairStyle: "ponytail",
  hat: { kind: "hood", col: 0x3f7d3a, trim: 0x2c5a29 }, shirt: 0x5b9a45, sleeve: 0x4a7f38, pants: 0x6b4a2e, boots: 0x3d2a1a, belt: 0x5a3a22,
  vest: 0x6e4526, weapon: "bow", quiver: true, aura: 0x9be564, gait: "light",
});
const barbarian = human({
  name: "barbarian", skin: 0xe0a77a, hair: 0xd9792b, hairStyle: "long", beard: 0xd9792b,
  hat: { kind: "horned", col: 0x8a939b, trim: 0x5b6470 }, shirt: 0, bareChest: true, pants: 0x7a5230, boots: 0x4a3020, belt: 0x3a2a1a,
  weapon: "axe", fxCol: 0xffe0c0, aura: 0xff5a3c, gait: "swagger",
});
// Pale noble of the night: wine coat, black cape, thin blade. Fights with the knight's sword cuts (no shield) and sneaks.
const vampire: Hero = {
  ...human({
    name: "vampire", skin: 0xddd0ca, hair: 0x15111a, hairStyle: "short", eye: 0xc0182a,
    shirt: 0x3a1422, sleeve: 0x3a1422, vest: 0x17101a, pants: 0x1c1820, boots: 0x1a1216, belt: 0xb08a3a,
    weapon: "dagger", fxCol: 0xff5a6a, aura: 0xc1121f, gait: "sneak",
  }),
  swing: knight.swing, kind1: knight.kind1, moves: knight.moves, idleAngle: knight.idleAngle, weaponKind: "sword",
};
const blacksmith = human({
  name: "blacksmith", skin: 0xd99a6c, hair: 0x2b2b2b, hairStyle: "bald", beard: 0x2b2b2b,
  shirt: 0xb8a48a, pants: 0x4a4a52, boots: 0x2a2a2a, apron: 0x6e4526, weapon: "hammer", fxCol: 0xffb703,
});
const merchant = human({
  name: "merchant", skin: 0xf1c8a0, hair: 0x6b4a2e, hairStyle: "short", beard: 0x6b4a2e,
  hat: { kind: "wide", col: 0x7a2e5a, trim: 0xf2c14e }, shirt: 0xe9dcc2, vest: 0x9c2f5a, pants: 0x3d4a6b, boots: 0x3d2a1a, belt: 0xf2c14e,
  weapon: "none",
});
const villager = human({
  name: "villager", skin: 0xf1c27d, hair: 0x8b4a2b, hairStyle: "long",
  hat: { kind: "bandana", col: 0xd9c08a, trim: 0xb89a5e }, shirt: 0x8fb3d9, pants: 0x6b5a45, boots: 0x4a3828, apron: 0xf3ead8,
  weapon: "none",
});
const guard = human({
  name: "guard", skin: 0xf1c27d, hair: 0x4e342e, hairStyle: "short",
  hat: { kind: "helm", col: 0xa7b0ba, trim: 0x6f7883 }, shirt: 0x8a939b, pants: 0x4a3828, boots: 0x2e2a28, belt: 0x5a3a22,
  tabard: { col: 0xb5262f, emblem: 0xf2c14e }, weapon: "spear",
});

// The Summoner casts like the wizard (staff bolts, the same poses and float); its painted look is look.ts summoner
const summoner: Hero = { ...wizard, name: "summoner", aura: 0xb68cff, weaponKind: "witchstaff" };
/**
 * The Songweaver (minstrel, caster pose family: a plucked wave from mid range, then a strum). Deliberately NOT in
 * HEROES yet: that list is walked with `h.name as ClassKind` by the gear and pose tools, which need the class to exist
 * in shared/. Built by tools/art/proposals/songweaver.ts until then.
 */
export const SONGWEAVER: Hero = { ...wizard, name: "songweaver", aura: 0xffd27a, weaponKind: "lute" };
export const HEROES: Hero[] = [ninja, wizard, knight, archer, barbarian, vampire, summoner];

/**
 * A hero holding a weapon of another family (shared/weapons.ts POSE_FAMILY): same body and look, but the idle stance
 * and attack swings of the hero who fights that way (melee: the barbarian's chops, bow: the archer's draw, caster:
 * the wizard's casts). The name stays the hero's own, so the painted look is unchanged.
 */
export function poseVariant(hero: Hero, family: "melee" | "bow" | "caster"): Hero {
  const donor = family === "melee" ? barbarian : family === "bow" ? archer : wizard;
  return { ...hero, swing: donor.swing, kind1: donor.kind1, moves: donor.moves, idleAngle: donor.idleAngle, weaponKind: donor.weaponKind };
}
const druid = human({
  name: "druid", skin: 0xe8b68c, hair: 0xe9e4d8, hairStyle: "long", beard: 0xf3efe6,
  hat: { kind: "hood", col: 0x4f6b32, trim: 0x8a6a3a }, shirt: 0x5f7f3a, sleeve: 0x4f6b32, vest: 0x7a5a32,
  pants: 0x46602c, boots: 0x4a3420, belt: 0xb08a4a, weapon: "staff", fxCol: 0x9be564, aura: 0x9be564, gait: "stroll",
});

const witch = human({
  name: "witch", skin: 0xf0c8a8, hair: 0x1c1216, hairStyle: "long", eye: 0xd4a017,
  hat: { kind: "witch", col: 0x1e181e, trim: 0xb02a2e }, shirt: 0xb02a2e, sleeve: 0xf0c8a8, vest: 0x1e1418,
  pants: 0x9a1e24, boots: 0x1a1214, belt: 0x2a1610, weapon: "none", fxCol: 0xff6a3a, gait: "swagger", hipHand: true,
});

// Townsfolk who idle and wander about the village centre, and the watchmen holding the gates (client/src/villagers.ts, server watch)
const folk = (name: string, gait: Hero["gait"] = "stroll") => human({
  name, skin: 0xe0b08a, hair: 0x5a3a22, hairStyle: "short", shirt: 0x8a7a60, pants: 0x5a4a3a, boots: 0x3a2a1e, weapon: "none", gait,
});
const watchman = human({
  name: "watchman", skin: 0xe0b08a, hair: 0x3a2a20, hairStyle: "short", beard: 0x3a2a20,
  hat: { kind: "helm", col: 0x7d8288, trim: 0x55595e }, shirt: 0x6e7378, pants: 0x4a3a2a, boots: 0x2a2420, belt: 0x3a2618,
  tabard: { col: 0x5e1e1e, emblem: 0xb08a3a }, weapon: "spear", gait: "march",
});
export const FOLK = ["peasant", "farmwife", "labourer", "elder", "goodwife"] as const;

// Kel Ashar, the desert village of Act 2
const wellkeeper = human({
  name: "wellkeeper", skin: 0xb07a50, hair: 0xd8d2c4, hairStyle: "long",
  hat: { kind: "hood", col: 0xe2d6bc, trim: 0x3a6a8a }, shirt: 0x2e5a7a, pants: 0x284e6a, boots: 0x6a4a2e, belt: 0xc89a40, weapon: "none", gait: "stroll",
});
const sandcaptain = human({
  name: "sandcaptain", skin: 0x9a663e, hair: 0x1a1410, hairStyle: "short", beard: 0x1a1410,
  hat: { kind: "helm", col: 0xc8a050, trim: 0xece2c8 }, shirt: 0xa88a52, pants: 0xe2d6bc, boots: 0x5a3a22, belt: 0x4a2e1a,
  tabard: { col: 0xd88a20, emblem: 0xffd060 }, weapon: "spear", gait: "march",
});
const spicetrader = human({
  name: "spicetrader", skin: 0xb07a50, hair: 0x1a1210, hairStyle: "long",
  hat: { kind: "bandana", col: 0xe0a020, trim: 0xa8301e }, shirt: 0xf0e2c4, vest: 0xa8301e, pants: 0x5a2a3a, boots: 0x6a4028, belt: 0xe0a020, weapon: "none", gait: "swagger",
});
const desertsmith = human({
  name: "desertsmith", skin: 0x8a5a36, hair: 0x1a1410, hairStyle: "bald", beard: 0x2a201a,
  shirt: 0xc8b48a, vest: 0x5a3a22, apron: 0x6a4428, pants: 0x6a5238, boots: 0x3a2a1e, belt: 0x2e2014, weapon: "hammer",
});
export const DESERT_NPCS = ["wellkeeper", "sandcaptain", "spicetrader", "desertsmith"] as const;

// The armourers, one per village (shared/npcs.ts): Hilda of Oakvale, Dorran of Saltmere, Idris of Kel Ashar
const armourer = human({
  name: "armourer", skin: 0xe8b08a, hair: 0xa8401e, hairStyle: "long",
  shirt: 0x8a939e, vest: 0x5a1a18, pants: 0x4a3a2a, boots: 0x2a2420, belt: 0x4a2e1a,
  tabard: { col: 0x7a2620, emblem: 0xe0b440 }, weapon: "hammer", gait: "march",
});
const saltarmourer = human({
  name: "saltarmourer", skin: 0xc8916a, hair: 0x8a8a86, hairStyle: "short", beard: 0x9a9a94,
  hat: { kind: "cap", col: 0x285058, trim: 0x1a3a42 }, shirt: 0x4a3628, vest: 0x36261e, pants: 0x3a4a52, boots: 0x221814, belt: 0xc89c44,
  weapon: "none", gait: "stroll",
});
const sandarmourer = human({
  name: "sandarmourer", skin: 0x8a5a36, hair: 0x1a1410, hairStyle: "short", beard: 0x1a1410,
  hat: { kind: "bandana", col: 0xece2c8, trim: 0x302e72 }, shirt: 0xc89c44, vest: 0x302e72, pants: 0xe2d6bc, boots: 0x4a2e1a, belt: 0x302e72,
  weapon: "none", gait: "march",
});
export const ARMOURERS = ["armourer", "saltarmourer", "sandarmourer"] as const;

// The zone quest givers (Murat 2026-11-10): people who live out in the zones and give the local quest arcs (shared/npcs.ts)
const huntsman = human({
  name: "huntsman", skin: 0xd8a27a, hair: 0x6a4424, hairStyle: "short", beard: 0x6a4424,
  hat: { kind: "hood", col: 0x3e5a2c, trim: 0x2a3e1e }, shirt: 0x5a4630, vest: 0x3e5a2c, pants: 0x4a3a28, boots: 0x3a2a1a, belt: 0x2a1c10,
  weapon: "bow", quiver: true, gait: "march",
});
const miller = human({
  name: "miller", skin: 0xe8b890, hair: 0xb8b0a0, hairStyle: "short", beard: 0xc8c0b0,
  hat: { kind: "cap", col: 0xd8ccb0, trim: 0xb8aa88 }, shirt: 0xe0d6c0, apron: 0xc8bc9c, pants: 0x6a5a44, boots: 0x3a2a1e, belt: 0x5a4028,
  weapon: "none", gait: "stroll", hipHand: true,
});
const forester = human({
  name: "forester", skin: 0xe0ae86, hair: 0xa8642e, hairStyle: "ponytail",
  shirt: 0x5a6e3a, vest: 0x4a3420, pants: 0x3e4a2a, boots: 0x3a2818, belt: 0x6a4a28, weapon: "axe", gait: "march",
});
const beachcomber = human({
  name: "beachcomber", skin: 0xc8916a, hair: 0x2a2a2e, hairStyle: "long",
  hat: { kind: "bandana", col: 0x2e5a6a, trim: 0x1e3e4a }, shirt: 0xd8ccb0, vest: 0x3e4e58, pants: 0x5a6a72, boots: 0x4a3a2e, belt: 0x6a4a2a,
  weapon: "spear", gait: "stroll",
});
const prospector = human({
  name: "prospector", skin: 0xd8a27a, hair: 0x8a3a1a, hairStyle: "short", beard: 0x8a3a1a,
  hat: { kind: "helm", col: 0x6a6258, trim: 0x8a8070 }, shirt: 0x7a5a3a, apron: 0x5a4028, pants: 0x4a4038, boots: 0x2a2018, belt: 0x2e2014,
  weapon: "hammer", gait: "march",
});
const caravaneer = human({
  name: "caravaneer", skin: 0x9a663e, hair: 0x1a1410, hairStyle: "short", beard: 0x2a201a,
  hat: { kind: "wide", col: 0xc8a060, trim: 0x8a5a2a }, shirt: 0xe8dcc0, vest: 0x8a3a2a, pants: 0x5a4a3a, boots: 0x5a3a22, belt: 0xd8a840,
  weapon: "none", gait: "swagger", hipHand: true,
});
const hermit = human({
  name: "hermit", skin: 0x8a5a36, hair: 0xe0dcd0, hairStyle: "long", beard: 0xece8de,
  hat: { kind: "hood", col: 0x8a6a48, trim: 0x5a4430 }, shirt: 0x7a5e40, pants: 0x6a5238, boots: 0x4a3420, belt: 0x3a2818,
  weapon: "staff", gait: "stroll",
});
const dunescout = human({
  name: "dunescout", skin: 0xa8744c, hair: 0x1a1210, hairStyle: "ponytail",
  hat: { kind: "bandana", col: 0xd89a30, trim: 0x8a4a1a }, shirt: 0xe2d2a8, vest: 0x8a6a3a, pants: 0xc8a870, boots: 0x6a4a2a, belt: 0x5a3018,
  weapon: "bow", quiver: true, gait: "march",
});
const defector = human({
  name: "defector", skin: 0xb07a50, hair: 0x1a1410, hairStyle: "long",
  hat: { kind: "hood", col: 0x2e2a5e, trim: 0xd8a840 }, shirt: 0x2e2a5e, sleeve: 0x26224e, vest: 0x1e1a40, pants: 0x26224e, boots: 0x3a2a1e, belt: 0xd8a840,
  weapon: "staff", fxCol: 0xffb040, gait: "stroll",
});
// The two deep dungeons' quest givers (shared/dungeon.ts): the last lamplighter monk, and a tomb-robber at the Kharsun well
const monk = human({
  name: "monk", skin: 0xe0b08a, hair: 0x9a9690, hairStyle: "bald",
  hat: { kind: "hood", col: 0x4a4038, trim: 0x2e2822 }, shirt: 0x4a4038, pants: 0x3e362e, boots: 0x2a221c, belt: 0x8a6a3a,
  weapon: "staff", fxCol: 0xffd070, gait: "stroll",
});
const tombrobber = human({
  name: "tombrobber", skin: 0xa06a40, hair: 0x1a1410, hairStyle: "short", beard: 0x1a1410,
  hat: { kind: "bandana", col: 0x5a3a2a, trim: 0x2e1e14 }, shirt: 0x8a7656, vest: 0x3a2e24, pants: 0x5a4a38, boots: 0x3a2a1a, belt: 0x2a1c12,
  weapon: "dagger", gait: "swagger",
});
export const ZONE_NPCS = ["huntsman", "miller", "forester", "beachcomber", "prospector", "caravaneer", "hermit", "dunescout", "defector", "monk", "tombrobber"] as const;

export const NPCS: Hero[] = [blacksmith, merchant, villager, guard, druid, witch, watchman, ...FOLK.map((n) => folk(n)), wellkeeper, sandcaptain, spicetrader, desertsmith, armourer, saltarmourer, sandarmourer,
  huntsman, miller, forester, beachcomber, prospector, caravaneer, hermit, dunescout, defector, monk, tombrobber];
/** Pose data for monsters painted with the character painter (paint/mobs.ts); never drawn as pixel art. */
const mobPose = (name: string, weapon: HumanOpts["weapon"]) => human({ name, skin: 0, hair: 0, hairStyle: "bald", shirt: 0, pants: 0, boots: 0, weapon });
export const MOB_POSES: Record<string, Hero> = {
  skeleton: mobPose("skeleton", "axe"), skeleton_axe: mobPose("skeleton_axe", "axe"),
  skeleton_spear: mobPose("skeleton_spear", "spear"), skeleton_bow: mobPose("skeleton_bow", "bow"), bandit: mobPose("bandit", "dagger"),
  bandit_brute: mobPose("bandit_brute", "axe"), bandit_archer: mobPose("bandit_archer", "bow"), banditchief: mobPose("banditchief", "axe"),
  skeletonmage: mobPose("skeletonmage", "staff"), necromancer: mobPose("necromancer", "staff"), bride: mobPose("bride", "none"),
  demon: mobPose("demon", "axe"), demon1: mobPose("demon1", "axe"), demon2: mobPose("demon2", "axe"), demon3: mobPose("demon3", "axe"), demon4: mobPose("demon4", "axe"),
  hollowking: mobPose("hollowking", "axe"),
  gnawkin: mobPose("gnawkin", "dagger"), tuskborn: mobPose("tuskborn", "hammer"), silkwretch: mobPose("silkwretch", "none"), duskwing: mobPose("duskwing", "dagger"),
  gnawkin_folk: mobPose("gnawkin_folk", "none"), tuskborn_folk: mobPose("tuskborn_folk", "axe"), silkwretch_folk: mobPose("silkwretch_folk", "none"),
  duskwing_folk: mobPose("duskwing_folk", "dagger"), crowseer: mobPose("crowseer", "staff"), gnasher: mobPose("gnasher", "axe"), weaver: mobPose("weaver", "staff"),
  packlord: mobPose("packlord", "axe"), hornbrute: mobPose("hornbrute", "hammer"), hidemother: mobPose("hidemother", "staff"),
  nomad: mobPose("nomad", "axe"), nomad_folk: mobPose("nomad_folk", "bow"), sanddead: mobPose("sanddead", "axe"),
  veiled: mobPose("veiled", "staff"), camelfolk: mobPose("camelfolk", "spear"), sphinx: mobPose("sphinx", "axe"), sunwright: mobPose("sunwright", "staff"),
};
/** Poses for the humanoid champions' sheets (paint/look.ts CHAMP_WEAPONS): the grip follows their champion weapon. */
export function addChampPose(key: string, weapon: string) {
  const w: HumanOpts["weapon"] = weapon === "hammer" || weapon === "spear" || weapon === "dagger" || weapon === "bow" ? weapon : weapon.endsWith("staff") ? "staff" : weapon === "none" ? "none" : "axe";
  MOB_POSES[key] ??= mobPose(key, w);
}
export const posed = (hero: Hero, p: Partial<Pose> & { dir: Dir }, shadow = true) => renderFrame(hero, { t: 0, bob: 0, stride: 0, lean: 0, crouch: 0, attack: -1, expr: "n", ...p }, shadow);

export type GearPart = "legs" | "torso" | "head" | "weapon" | "shield";
/** Extra pose info for the gear generator: body offset, weapon hand/angle, and a way to redraw the weapon elsewhere. */
export interface GearCtx { ux: number; uy: number; hand: [number, number]; ang: number; hasShield: boolean; redraw: (dx: number, dy: number) => Canvas }
/** Set by tools/art/gear.ts while it renders gear overlays: recolours `main` where the part (`mask`) is visible. */
export let gearHook: ((part: GearPart, main: Canvas, mask: Canvas, p: Pose, hero: string, g: GearCtx) => void) | null = null;
export function setGearHook(fn: typeof gearHook) { gearHook = fn; }

/** Render one frame into a fresh frame canvas. */
let canvasFactory: () => Canvas = mk;
/** Swap the canvas renderFrame draws into. */
export function setCanvasFactory(f: () => Canvas) { canvasFactory = f; }

export function renderFrame(hero: Hero, p: Pose, withShadow = true, flash = 0): Canvas {
  if (PAINTED && hasLook(hero.name)) {
    const infoOf = (p: Pose): FrameInfo => {
      const hp = handPos({ ...p, lean: 0 }, hero);
      const lean = p.dir === "right" ? -p.lean : 0, ly = p.dir === "down" ? -Math.min(p.lean, 1) : p.dir === "up" ? Math.min(p.lean, 1) : 0;
      const ux = lean + (p.run && p.dir === "right" ? 1 : 0);
      return {
        hand: [hp[0] + ux, hp[1] + ly], ang: weaponAngle(p, hero), mv: moveOf(hero, p),
        prevAng: (i) => weaponAngle({ ...p, attack: i, attackT: undefined }, hero), hasShieldMove: !!hero.shield,
      };
    };
    if (diagRec) { diagRec.push({ p, info: infoOf(p) }); return mk(); }
    let alt: DiagAlt | undefined;
    if (diagUse) {
      const rec = diagUse.poses[diagUse.i++];
      if (rec && rec.p.dir === "right" && p.dir === diagUse.base) alt = { p: rec.p, info: rec.info, diag: diagUse.dir };
    }
    const f = paintFrame(hero.name, p, infoOf(p), withShadow, flash, K, alt);
    const soft = mk();
    soft.data = f.data;
    return soft;
  }
  const c = canvasFactory();
  const lean = p.dir === "right" ? -p.lean : 0; // knock back opposite facing
  const ly = p.dir === "down" ? -Math.min(p.lean, 1) : p.dir === "up" ? Math.min(p.lean, 1) : 0;
  const d: D = {
    c, p, ux: lean, uy: p.bob + p.crouch + ly, lx: lean,
    U: (x, y, w, h, col, top) => d.c.box(x + d.ux, y + d.uy, w, h, col, { top }),
    Ur: (x, y, w, h, col) => d.c.rect(x + d.ux, y + d.uy, w, h, col),
    Up: (x, y, col) => d.c.px(x + d.ux, y + d.uy, col),
  };
  if (p.run) { if (p.dir === "right") d.ux += 1; }
  const hp = handPos({ ...p, lean: 0 }, hero);
  const hand: [number, number] = [hp[0] + d.ux, hp[1] + ly];
  const ang = weaponAngle(p, hero);
  const legTop = 24 + p.crouch;
  const mv = moveOf(hero, p);
  const shieldAt = () => part("shield", () => {
    if (!hero.shield) return; // heroes without one still go through `part`, so gear can add a shield
    const push = mv.kind === "bash" && p.attack >= 0 ? (p.dir === "right" ? [-1, 2, 2, 1] : [-1, 3, 4, 2])[p.attack] : 0;
    const [sx, sy] = [FACE[p.dir][0] * push, FACE[p.dir][1] * push];
    d.ux += sx; d.uy += sy; hero.shield(d); d.ux -= sx; d.uy -= sy;
  });
  // Each body part goes through `part` so the gear generator (tools/art/gear.ts) can recolour it
  const part = (slot: GearPart, fn: () => void) => {
    fn();
    if (!gearHook) return;
    const main = d.c, mask = mk();
    d.c = mask; fn(); d.c = main;
    const redraw = (dx: number, dy: number) => {
      const m = mk(), keep = d.c;
      d.c = m; hero.weapon(d, [hand[0] + dx, hand[1] + dy], ang); d.c = keep;
      return m;
    };
    gearHook(slot, main, mask, p, hero.name, { ux: d.ux, uy: d.uy, hand, ang, hasShield: !!hero.shield, redraw });
  };
  const head = () => part("head", () => { const hd = p.headDx ?? 0; d.ux += hd; hero.head(d); d.ux -= hd; });
  const legs = () => part("legs", () => hero.legs(d, legTop));
  const torso = () => part("torso", () => hero.torso(d));
  const farArm = () => {
    if (!p.farHand) { hero.arm(d, "far", hand); shieldAt(); return; }
    const sh: Record<Dir, [number, number]> = { down: [21, 17], up: [9, 17], right: [17, 17] };
    armTo(d, sh[p.dir][0], sh[p.dir][1], p.farHand[0] + d.ux, p.farHand[1] + d.uy, hero.cols.sleeve, hero.cols.hand);
  };
  const weapon = () => { if (!p.noWeapon) part("weapon", () => hero.weapon(d, hand, ang)); };
  const weaponBehind = p.dir === "up" ? p.attack < 1 || p.attack === 3 : hero.name === "wizard" && p.dir === "right" && p.attack < 0 ? false : false;

  if (p.dir === "up") {
    if (weaponBehind) weapon();
    legs(); torso();
    farArm(); hero.arm(d, "near", hand);
    head();
    if (!weaponBehind) weapon();
  } else if (p.dir === "down") {
    legs(); torso(); head();
    farArm();
    weapon(); hero.arm(d, "near", hand);
  } else {
    if (!p.farHand) hero.arm(d, "far", hand);
    legs(); torso(); if (!p.farHand) shieldAt(); head();
    if (p.farHand) farArm();
    weapon(); hero.arm(d, "near", hand);
  }
  if (c instanceof HiCanvas) c.smooth();
  if (flash) c.tint(0xffffff, flash);
  c.rim();
  c.selout(OUTLINE);
  if (p.attack < 0 || !p.move || p.move === "a1" || mv.kind === "double" || mv.kind === "charged" || mv.kind === "shot" || p.move === "a5") hero.fx?.(d, hand, ang);
  if (p.attack >= 0) moveFx(d, hero, mv, hand, ang);
  if (withShadow) c.under((s) => s.ellipse(16 + d.lx, 29, 6, 1.5, 0x000000, 70));
  return c;
}

const rgbMix = (a: number, b: number, t: number) => {
  const m = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
};

function arc(c: Canvas, cx: number, cy: number, r: number, a0: number, a1: number, col: number, alpha: number, width = 1) {
  const n = Math.max(6, Math.abs(a1 - a0) / 5) * c.k;
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n), fade = 0.35 + 0.65 * (i / n);
    for (let w = 0; w < width * c.k; w++) { const rr = r - w / c.k; c.dot(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, col, alpha * fade * (w >= c.k ? 0.6 : 1)); }
  }
}

/** Effects shared by all combo moves: smears, speed lines, dust, magic circles. */
function moveFx(d: D, hero: Hero, mv: Move, [hx, hy]: [number, number], a: number) {
  const c = d.c, ph = d.p.attack, [fx, fy] = FACE[d.p.dir], col = mv.fx ?? 0xffffff;
  const ux = Math.cos(rad(a)), uy = Math.sin(rad(a));
  const prev = (i: number) => weaponAngle({ ...d.p, attack: i }, hero);
  if ((mv.kind === "slash" || mv.kind === "bonk" || mv.kind === "slam") && ph === 1) {
    // smear: a pale wedge from the wind-up angle to the swing angle, painted behind the body
    const a0 = prev(0), a1 = a;
    c.under((s) => { for (let r = 5; r <= 12; r++) arc(s, hx, hy, r, a0, a1, rgbMix(col, 0xbfd7ff, 0.3), r > 9 ? 120 : 60); });
  }
  if ((mv.kind === "slash" || mv.kind === "bonk") && ph === 2 && d.p.move !== "a1") arc(c, hx, hy, 12, prev(1), a + (a - prev(1)) * 0.3, col, 230, 2);
  if (mv.kind === "thrust" && (ph === 1 || ph === 2)) {
    const tipx = hx + ux * 12, tipy = hy + uy * 12, nx = -uy, ny = ux;
    for (const o of [-3, 0, 3]) c.line(tipx - ux * (6 + Math.abs(o)) + nx * o, tipy - uy * (6 + Math.abs(o)) + ny * o, tipx - ux * (2 + Math.abs(o)) + nx * o, tipy - uy * (2 + Math.abs(o)) + ny * o, 0xffffff, ph === 2 ? 170 : 90);
    if (ph === 2) { c.px(tipx + ux * 2, tipy + uy * 2, 0xffffff); c.px(tipx + ux * 2 + nx, tipy + uy * 2 + ny, 0xffffff, 150); c.px(tipx + ux * 2 - nx, tipy + uy * 2 - ny, 0xffffff, 150); }
  }
  if (mv.kind === "bash" && ph === 2) {
    const bx = 16 + fx * 11 + d.ux, by = 20 + fy * 9 + d.uy;
    for (const [sx, sy] of [[0, -3], [0, 3], [-3, 0], [3, 0], [-2, -2], [2, 2], [2, -2], [-2, 2]]) c.px(bx + sx, by + sy, 0xfff3b0, 230);
    c.px(bx, by, 0xffffff);
  }
  if (mv.kind === "slam" && ph >= 2) {
    const gx = Math.max(4, Math.min(27, hx + ux * 9)), gy = Math.min(29, Math.max(24, hy + uy * 9 + 3));
    const r = ph === 2 ? 4 : 7, al = ph === 2 ? 220 : 120;
    c.ellipse(gx, gy, r, r * 0.35, 0xd9c8a8, al * 0.35);
    for (const s of [-1, 1]) { c.px(gx + s * r, gy, 0xe8dcc4, al); c.px(gx + s * (r - 1), gy - 1, 0xe8dcc4, al); c.px(gx + s * (r + 1), gy - 2 - (ph - 2), 0xbfb39a, al); }
    if (ph === 2) { c.line(gx - 2, gy + 1, gx + 2, gy + 1, 0x3a2a1a, 200); c.px(gx - 3, gy, 0x3a2a1a, 200); c.px(gx + 3, gy + 2, 0x3a2a1a, 200); }
  }
  if (mv.kind === "cast") {
    const al = [120, 200, 230, 110][ph];
    c.under((s) => {
      s.ellipse(16 + d.lx, 28, 11, 3.2, 0x9a6bff, al * 0.25);
      for (let i = 0; i < 16; i++) { const t = rad(i * 22.5 + ph * 11); s.px(16 + d.lx + Math.cos(t) * 11, 28 + Math.sin(t) * 3.2, i % 4 ? 0x9a6bff : 0x5ee6ff, al); }
    });
    if (ph >= 1) for (let i = 0; i < 5; i++) c.px(8 + ((i * 7 + ph * 3) % 17) + d.lx, 26 - ((i * 5 + ph * 4) % 14), 0xc8fbff, 200);
    if (ph === 2) { const ox = hx + ux * 16, oy = hy + uy * 16; c.ellipse(ox, oy, 4, 4, 0x9a6bff, 110); c.ellipse(ox, oy, 2, 2, 0xffffff, 230); for (const [sx, sy] of [[-6, 0], [6, 0], [0, -6], [-4, -4], [4, -4]]) c.px(ox + sx, oy + sy, 0xc8fbff); }
  }
  if (mv.kind === "double" && ph >= 2) {
    const nx = -uy, ny = ux, k = ph === 2 ? 6 : 11;
    for (const o of [3, -3]) { const sx = hx + nx * o, sy = hy + ny * o; c.line(sx + ux * k, sy + uy * k, sx + ux * (k + 6), sy + uy * (k + 6), 0xc9a26a); c.px(sx + ux * (k + 7), sy + uy * (k + 7), 0xffffff); }
  }
  if (mv.kind === "charged") {
    if (ph <= 1) { const r = ph ? 3 : 2; c.ellipse(hx + ux * 9, hy + uy * 9, r, r, 0xffd166, 90 + ph * 60); c.px(hx + ux * 9, hy + uy * 9, 0xffffff); }
    if (ph >= 2) {
      const nx = -uy, ny = ux, k0 = ph === 2 ? 4 : 10, k1 = ph === 2 ? 22 : 26;
      for (const o of [-1, 0, 1]) c.line(hx + ux * k0 + nx * o, hy + uy * k0 + ny * o, hx + ux * k1 + nx * o, hy + uy * k1 + ny * o, o ? 0xffd166 : 0xffffff, o ? 120 : 230);
    }
  }
}

function aura(c: Canvas, col: number, t: number, strong: boolean) {
  c.under((s) => { s.ellipse(16, 18, 10, 12, col, strong ? 70 : 40); s.ellipse(16, 28, 10, 2.5, col, 90); });
  for (let i = 0; i < 7; i++) {
    const x = 6 + ((i * 5 + t * 3) % 21), y = 27 - ((i * 7 + t * 5) % 22);
    c.px(x, y, rgbMix(col, 0xffffff, 0.5), 230); if (strong) c.px(x, y - 1, col, 150);
  }
}

function ghostsBehind(dst: Canvas, src: Canvas, dx: number, dy: number, col: number) {
  for (const [k, a] of [[2.4, 60], [1.3, 110]] as const) {
    const g = mk();
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const [pc, al] = src.get(x, y); if (al > 200) g.pxN(x, y, rgbMix(pc, col, 0.45), a); }
    dst.under((s) => s.blit(g, Math.round(-dx * k), Math.round(-dy * k)));
  }
}

/** Lift a shadowless frame off the ground by j px, keeping (and shrinking) the ground shadow. */
/** Ground shadow: a hard pixel ellipse, or a soft one on painted frames. */
function groundShadow(o: Canvas, cx: number, cy: number, rx: number, ry: number, a: number) {
  if (!PAINTED || PIXEL) { o.ellipse(cx, cy, rx, ry, 0x000000, a); return; }
  const k = K, CX = cx * k + k / 2, CY = cy * k + k / 2, RX = (rx + 1) * k, RY = (ry + 0.6) * k;
  for (let y = Math.floor(CY - RY); y <= Math.ceil(CY + RY); y++) for (let x = Math.floor(CX - RX); x <= Math.ceil(CX + RX); x++) {
    const d = Math.hypot((x + 0.5 - CX) / RX, (y + 0.5 - CY) / RY);
    if (d < 1) o.pxN(x, y, 0x000000, Math.round(a * 1.5 * Math.min(1, (1 - d) * 1.6)));
  }
}

function jumped(f: Canvas, j: number): Canvas {
  const o = mk();
  groundShadow(o, 16, 29, 6 - Math.min(j, 3), 1.5, 70 - j * 10);
  o.blit(f, 0, -j);
  return o;
}

function zLetter(c: Canvas, x: number, y: number, n: number) {
  const col = 0xe8f0ff;
  for (let i = 0; i < n; i++) { c.px(x + i, y, col); c.px(x + i, y + n - 1, col); c.px(x + n - 1 - i, y + i, col); }
}

/** Rotate a frame by k quarter-turns clockwise about its centre (for rolls). */
function rot90(src: Canvas, k: number, cy = 20): Canvas {
  const o = mk();
  k = ((k % 4) + 4) % 4;
  const cxN = 16 * K + (K - 1) / 2, cyN = cy * K + (K - 1) / 2;
  o.blit(src, 0, 0, (x, y) => {
    const dx = x - cxN, dy = y - cyN;
    const [rx, ry] = k === 1 ? [-dy, dx] : k === 2 ? [-dx, -dy] : k === 3 ? [dy, -dx] : [dx, dy];
    return [cxN + rx, cyN + ry];
  });
  return o;
}

/** Face-down fall: rotate counter-clockwise so the head ends up on the left. */
function fallForward(src: Canvas): Canvas {
  const r = mk();
  r.blit(src, 0, 0, (x, y) => [y, FW - 1 - x]);
  let maxY = 0, minX = FW, maxX = 0;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (r.alpha(x, y)) { maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  const out = mk();
  groundShadow(out, 16, 29, 11, 1.5, 70);
  out.blit(r, Math.round((FW - 1 - maxX - minX) / 2) / K, (30 * K + K - 1 - maxY) / K);
  return out;
}

function dust(c: Canvas, x: number, y: number, size: number, alpha = 170) {
  for (const [dx, dy] of [[0, 0], [-1, -1], [1, -1], [-2, 0], [2, 0], [0, -2]].slice(0, 2 + size * 2)) c.px(x + dx, y + dy, 0xd9cdb4, alpha);
}

function rotateLying(src: Canvas): Canvas {
  // rotate 90° clockwise so the head ends up on the right, then sit it on the ground line
  const r = mk();
  r.blit(src, 0, 0, (x, y) => [FW - 1 - y, x]);
  let maxY = 0, minX = FW, maxX = 0;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (r.alpha(x, y)) { maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  const out = mk();
  groundShadow(out, 16, 29, 11, 1.5, 70);
  out.blit(r, Math.round((FW - 1 - maxX - minX) / 2) / K, (30 * K + K - 1 - maxY) / K);
  return out;
}

function stars(c: Canvas, t: number) {
  const pts = [[0, 0], [5, -1], [10, 0]];
  pts.forEach(([x, y], i) => {
    const bx = 19 + x - 5 + (t % 2 ? 1 : -1) * (i - 1), by = 13 + y + ((i + t) % 2);
    c.px(bx, by, 0xffe066); c.px(bx - 1, by, 0xffb703, 200); c.px(bx + 1, by, 0xffb703, 200); c.px(bx, by - 1, 0xffb703, 200); c.px(bx, by + 1, 0xffb703, 200);
  });
}

const base = (dir: Dir, t: number): Pose => ({ dir, t, bob: 0, stride: 0, lean: 0, crouch: 0, attack: -1, expr: "n" });
/** Painted sheets use 8-frame movement cycles. */
let fluidHero = false;
const fluid = () => fluidHero;
const cycle = () => [...Array(PAINT_COLS).keys()].map((t) => (t * 2 * Math.PI) / PAINT_COLS);

/**
 * An attack as 8 frames between its 4 key poses: a pull-back past the wind-up (anticipation), a fast arc,
 * the impact held for two frames and an easing follow-through back toward guard.
 */
const SWING_T = [-0.2, -0.45, 0.35, 1.0, 1.7, 2.0, 2.5, 3.0];
function swing8(hero: Hero, B: (t: number) => Pose, move?: MoveId, leanIn = false): Canvas[] {
  return SWING_T.map((at, t) => {
    const attack = Math.max(0, Math.min(3, Math.round(at)));
    const dip = Math.max(0, 1 - Math.abs(at - 2) * 1.4); // body drops into the blow
    return renderFrame(hero, {
      ...B(t), attack, attackT: at, move,
      bob: at < 0 ? -0.5 * -at / 0.45 : dip, crouch: dip * 0.6,
      lean: leanIn ? -keyAt([0, 1, 2, 1], Math.max(0, at)) : at < 0 ? 0.6 * -at / 0.45 : 0,
      expr: at > 1.5 && at < 2.6 ? "squint" : "n",
    });
  });
}

/** Per-hero gait (walk2) on the smooth 8-frame cycle. */
function walk2Fluid(hero: Hero, dir: Dir, B: (t: number) => Pose): Canvas[] {
  const g = hero.gait ?? "stroll";
  return cycle().map((ph, t) => {
    const c = Math.cos(ph), s = Math.abs(Math.sin(ph));
    switch (g) {
      case "sneak":
        return renderFrame(hero, { ...B(t), stride: c * 0.6, phase: ph, crouch: 2, lean: dir === "right" ? -1 : 0, bob: -0.7 * s, headDx: dir === "right" ? 1 : 0 });
      case "march":
        return renderFrame(hero, { ...B(t), stride: c, phase: ph, bob: Math.abs(c) * 1.1 - s * 0.9 });
      case "float": {
        const h = Math.round(3 + Math.sin(ph));
        const f = jumped(renderFrame(hero, { ...B(t), stride: 0, bob: 0.5 + 0.5 * Math.cos(ph * 2) }, false), h);
        if (t % 2 === 0) f.px(12 + t, 29, 0xc8fbff, 160);
        return f;
      }
      case "swagger":
        return renderFrame(hero, { ...B(t), stride: c, phase: ph, bob: Math.abs(c) - s, headDx: dir === "right" ? 0 : Math.sin(ph) * 0.9 });
      case "light":
        return jumped(renderFrame(hero, { ...B(t), stride: c, phase: ph, bob: Math.abs(c) }, false), Math.round(2 * s));
      default:
        return renderFrame(hero, { ...B(t), stride: c * 0.8, phase: ph, bob: -0.8 * s, expr: t === 5 ? "blink" : "n" });
    }
  });
}

/** The weapon shoulder of the old 32px rig, per facing (hands are placed relative to it). */
const SHOULDER: Record<Dir, [number, number]> = { down: [9.5, 17.5], up: [21.5, 17.5], right: [15.5, 17.5] };
/**
 * One skill-move pose. f = hand forward along the facing, u = hand up, s = hand out to the weapon side;
 * rel = blade angle from the facing (mirrored facing up, kept off straight-down facing down so it stays in the frame).
 */
interface SkillKey { f: number; u: number; s?: number; rel: number; abs?: boolean; crouch?: number; lean?: number; stride?: number; run?: boolean; bob?: number;
  jump?: number; two?: boolean; expr?: Pose["expr"]; dust?: number }
function skillPose(hero: Hero, dir: Dir, t: number, k: SkillKey): Canvas {
  const [fx, fy] = FACE[dir], [sx, sy] = SHOULDER[dir];
  const side = k.s ?? 0;
  const hand: [number, number] = [sx + fx * k.f + (dir === "down" ? -side : dir === "up" ? side : 0), sy + fy * k.f - k.u + (dir === "right" ? side * 0.5 : 0)];
  let ang = k.abs ? k.rel : FACE_ANGLE[dir] + (dir === "up" ? -k.rel : k.rel);
  if (!k.abs && dir === "down") { const n = ((ang % 360) + 360) % 360; if (n > 40 && n < 140) ang += n <= 100 ? 40 - n : 140 - n; }
  // two-handed grip: the free hand closes on the haft just below the weapon hand
  const far: [number, number] | undefined = k.two && !hero.shield ? [hand[0] + (dir === "down" ? 2 : dir === "up" ? -2 : -1), hand[1] + 1] : undefined;
  const pose: Pose = { ...base(dir, t), hand, wAng: ang, farHand: far, crouch: k.crouch ?? 0, lean: k.lean ?? 0, stride: k.stride ?? 0,
    run: k.run, bob: k.bob ?? 0, expr: k.expr ?? "n" };
  const f = k.jump ? jumped(renderFrame(hero, pose, false), k.jump) : renderFrame(hero, pose);
  if (k.dust) { dust(f, 16 - fx * 6 - 4, 29, k.dust); dust(f, 16 - fx * 6 + 5, 29, k.dust); }
  return f;
}

/** Frames of a skill move (MOVE_ANIMS). */
function skillMoveFrames(hero: Hero, anim: string, dir: Dir): Canvas[] {
  const KEYS: Record<string, SkillKey[]> = {
    // coil back on the rear foot, drive forward into a long low thrust, hold it, step back into guard
    lunge: [
      { f: -2.5, u: 1, rel: -8, crouch: 1.5, lean: 1, stride: -0.3 },
      { f: -4, u: 0.5, rel: -12, crouch: 2.5, lean: 1.8, stride: -0.5, expr: "squint" },
      { f: 2, u: 1, rel: -2, crouch: 1.6, lean: -1.5, stride: 0.8, run: true },
      { f: 5, u: 1, rel: 0, crouch: 2, lean: -2.6, stride: 1, run: true, expr: "squint", dust: 1 },
      { f: 5, u: 1.2, rel: 2, crouch: 2, lean: -2.6, stride: 1, run: true, expr: "squint" },
      { f: 4.5, u: 1, rel: 6, crouch: 1.8, lean: -2.2, stride: 1, run: true },
      { f: 2, u: 0, rel: 25, crouch: 1.2, lean: -1, stride: 0.6 },
      { f: 1, u: 0, rel: 45, crouch: 0.5, stride: 0.3 },
    ],
    // blade cocked behind, then the spin pose (the client turns it through every facing), then unwinding
    whirl: [
      { f: -3, u: 0, s: 2, rel: 165, crouch: 1.5, lean: 1, expr: "squint" },
      { f: 3, u: 1, s: 2, rel: 55, crouch: 1.8, stride: 0.4 },
      { f: 4.5, u: 1.5, rel: 0, crouch: 1.8, stride: 0.4, expr: "squint" },
      { f: 3, u: 1, s: -2, rel: -55, crouch: 1.8, stride: 0.4 },
      { f: 3, u: 1, rel: 25, crouch: 1.2, stride: 0.3 },
      { f: 2, u: 0.5, rel: 50, crouch: 0.8 },
      { f: 1.5, u: 0, rel: 70, crouch: 0.4 },
      { f: 1, u: 0, rel: 80 },
    ],
    // gather low, heave the weapon high over the head on the toes, crash it into the ground, rise
    slam: [
      { f: -1, u: -2, rel: 150, crouch: 2, two: true },
      { f: -1.5, u: 3.5, rel: -145, bob: -1, two: true },
      { f: -2.5, u: 4, rel: -165, two: true, jump: 2, expr: "squint" },
      { f: 4, u: -2, rel: 35, crouch: 2.5, lean: -1.5, stride: 0.6, two: true, expr: "squint" },
      { f: 5, u: -4, rel: 55, crouch: 3.6, lean: -2, stride: 0.7, two: true, expr: "squint", dust: 2 },
      { f: 5, u: -4, rel: 58, crouch: 3.3, lean: -2, stride: 0.7, two: true },
      { f: 3, u: -2, rel: 50, crouch: 1.8, lean: -1, stride: 0.4 },
      { f: 1.5, u: 0, rel: 65, crouch: 0.6 },
    ],
    // deep crouch, spring up with the weapon raised, tuck at the top, swing down, land hard and rise
    leap: [
      { f: -2, u: -1, rel: 160, crouch: 3.2, lean: 1, expr: "squint" },
      { f: 0, u: 5, rel: -120, stride: 0.6, jump: 2, two: true },
      { f: -2, u: 4, rel: -160, crouch: 1.5, stride: 0.4, jump: 4, two: true },
      { f: -2.5, u: 3.5, rel: -172, crouch: 1, jump: 4, two: true },
      { f: 3, u: 2, rel: -30, stride: 0.6, jump: 2, two: true, expr: "squint" },
      { f: 5, u: -4, rel: 58, crouch: 3.6, lean: -2, stride: 0.8, two: true, expr: "squint", dust: 2 },
      { f: 3, u: -2, rel: 50, crouch: 2, lean: -1, stride: 0.5 },
      { f: 1.5, u: 0, rel: 65, crouch: 0.6 },
    ],
    // twist far back, the weapon behind the shoulders, then one huge sweep across the front carried by the hips
    cleave: [
      { f: -3, u: 2, s: -2, rel: 200, crouch: 1, lean: 1.5, stride: 0.3, two: true },
      { f: -4, u: 3, s: -2, rel: 218, crouch: 1.6, lean: 2, stride: 0.4, two: true, expr: "squint" },
      { f: 1, u: 2, rel: 290, crouch: 2, stride: 0.8, two: true },
      { f: 4.5, u: 0, rel: 0, crouch: 2.6, lean: -1.6, stride: 1, run: true, two: true, expr: "squint" },
      { f: 3.5, u: -1.5, s: 2, rel: 55, crouch: 2.6, lean: -2, stride: 1, run: true, expr: "squint", dust: 1 },
      { f: 1.5, u: -2.5, s: 3, rel: 105, crouch: 2.2, lean: -1.5, stride: 0.9, run: true },
      { f: 1, u: -1, rel: 85, crouch: 1.4, lean: -0.5, stride: 0.5 },
      { f: 1, u: 0, rel: 65, crouch: 0.5, stride: 0.2 },
    ],
    // the blade raised straight to the sky in both hands (held while charging), breathing
    raise: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ f: 0, u: 6, rel: -90, abs: true, two: true, bob: i % 4 < 2 ? -0.5 : 0, crouch: i === 0 ? 1 : 0, stride: 0.2 })),
  };
  return KEYS[anim].map((k, t) => skillPose(hero, dir, t, k));
}

export function animFrames(hero: Hero, anim: string, dir: Dir): Canvas[] {
  if (MOVE_ANIMS.some((a) => a.name === anim)) { fluidHero = PAINTED && hasLook(hero.name); return skillMoveFrames(hero, anim, dir); }
  fluidHero = PAINTED && hasLook(hero.name);
  const B = (t: number) => base(dir, t);
  switch (anim) {
    case "idle": {
      // hand on the hip, weight on one leg (Morwen)
      const hip: Record<Dir, [number, number]> | undefined = hero.hipHand ? { down: [21.6, 21.0], up: [9.4, 21.0], right: [16.6, 21.2] } : undefined;
      const palm: Record<Dir, [number, number]> = { down: [9.6, 20.4], up: [22.4, 20.4], right: [18.6, 19.6] }; // the other hand held open at the waist
      return [0, 0, 0, 1, 1, 1].map((bob, t) => renderFrame(hero, { ...B(t), bob, expr: t === 5 ? "blink" : "n", farHand: hip?.[dir], hand: hip ? palm[dir] : undefined, headDx: hip && dir !== "right" ? (t < 3 ? 0.6 : 0.3) : undefined }));
    }
    case "idle2": {
      const look = dir === "right" ? [0, -1, -1, -1, 0, 0] : [0, -1, -1, 1, 1, 0];
      return look.map((headDx, t) => renderFrame(hero, { ...B(t), headDx, bob: t === 5 ? 1 : 0, expr: t === 2 ? "blink" : "n" }));
    }
    case "idle3": {
      const chest: Record<Dir, [number, number]> = { down: [12, 19], up: [20, 19], right: [17, 19] };
      const wk = hero.weaponKind;
      if (wk === "bow") return [0, 15, 25, 15, -10, 0].map((w, t) => renderFrame(hero, { ...B(t), wAng: hero.idleAngle[dir] + w, expr: t === 3 ? "happy" : "n", bob: t === 2 ? 1 : 0 }));
      if (wk === "none") {
        const head: Record<Dir, [number, number]> = { down: [22, 9], up: [9, 9], right: [17, 7] };
        return [0, 1, 0, 1, 0, 1].map((k, t) => renderFrame(hero, { ...B(t), farHand: [head[dir][0] - k, head[dir][1] + k], expr: t >= 4 ? "happy" : "blink" }));
      }
      return [0, 1, 2, 3, 4, 5].map((i) => {
        const f = renderFrame(hero, { ...B(i), hand: chest[dir], wAng: -90 + i * 72 + (i === 5 ? -72 * 5 + hero.idleAngle[dir] + 90 : 0), expr: i === 5 ? "happy" : "n" });
        if (i > 0 && i < 5) arc(f, chest[dir][0], chest[dir][1], wk === "staff" || wk === "spear" ? 15 : 11, -90 + (i - 1) * 72, -90 + i * 72, 0xffffff, 110);
        return f;
      });
    }
    case "run": {
      if (fluid()) return cycle().map((ph, t) => {
        // 8-frame run: legs on a continuous phase, body dips at each footfall and floats between
        const c = Math.cos(ph), air = Math.abs(Math.sin(ph));
        const f = renderFrame(hero, { ...B(t), stride: c, phase: ph, run: true, bob: 0.9 * Math.abs(c) - 1.4 * air }, true);
        if (Math.abs(c) > 0.99) { const [fx] = FACE[dir]; const bx = dir === "right" ? 12 : c > 0 ? 11 : 20; for (const [x, y] of [[0, 0], [-1, -1], [-2, 0], [1, -1]]) f.px(bx + x - fx, 28 + y, 0xd9cdb4, 170); }
        return f;
      });
      return [1, 0.5, -0.5, -1, -0.5, 0.5].map((stride, t) => {
        const contact = Math.abs(stride) === 1;
        const f = jumped(renderFrame(hero, { ...B(t), stride, run: true, bob: contact ? 1 : 0 }, false), contact ? 0 : 1);
        if (contact) { const [fx] = FACE[dir]; const bx = dir === "right" ? 12 : t === 0 ? 11 : 20; for (const [x, y] of [[0, 0], [-1, -1], [-2, 0], [1, -1]]) f.px(bx + x - fx, 28 + y, 0xd9cdb4, 170); }
        return f;
      });
    }
    case "wave": {
      const wv: Record<Dir, [number, number]> = { down: [24, 9], up: [7, 9], right: [21, 9] };
      return [0, 1, 0, 1].map((k, t) => renderFrame(hero, { ...B(t), farHand: [wv[dir][0] + (dir === "up" ? k : -k) * 2, wv[dir][1] - k], expr: "happy" }));
    }
    case "cheer": {
      const nearUp: Record<Dir, [number, number]> = { down: [8, 9], up: [24, 9], right: [19, 8] };
      const farUp: Record<Dir, [number, number]> = { down: [24, 9], up: [7, 9], right: [15, 8] };
      return [0, 3, 2, 0].map((j, t) => jumped(renderFrame(hero, { ...B(t), hand: [nearUp[dir][0], nearUp[dir][1] + (j ? 0 : 2)], wAng: -95, farHand: [farUp[dir][0], farUp[dir][1] + (j ? 0 : 2)], expr: "happy", crouch: j ? 0 : 1 }, false), j));
    }
    case "laugh": {
      const belly: Record<Dir, [number, number]> = { down: [19, 21], up: [12, 21], right: [18, 21] };
      return [0, 1, 0, 1].map((bob, t) => {
        const f = renderFrame(hero, { ...B(t), bob, expr: "happy", farHand: belly[dir], headDx: t === 2 && dir !== "right" ? 1 : 0 });
        if (dir !== "up") for (const [x, y] of t % 2 ? [[24, 6], [25, 5], [7, 7]] : [[25, 7], [26, 6], [6, 6]]) f.px(x, y, 0xffffff, 220);
        return f;
      });
    }
    case "sit": return [0, 0, 1, 1].map((bob, t) => renderFrame(hero, { ...B(t), crouch: 4, bob, expr: t === 3 ? "blink" : "n" }));
    case "sleep": {
      return [0, 1, 2, 3].map((t) => {
        const f = rotateLying(renderFrame(hero, { ...B(t), expr: "blink" }, false));
        const zs = [[0, 0], [3, -4], [6, -8]];
        zs.forEach(([x, y], i) => { if (i <= t % 3 + (t === 3 ? 0 : 0)) zLetter(f, 21 + x, 13 + y - (t % 2), i === 2 ? 4 : 3); });
        return f;
      });
    }
    case "walk":
      if (fluid()) return cycle().map((ph, t) => renderFrame(hero, { ...B(t), stride: Math.cos(ph), phase: ph, bob: -0.9 * Math.abs(Math.sin(ph)), expr: t === 6 ? "blink" : "n" }));
      return [1, 0.5, -0.5, -1, -0.5, 0.5].map((stride, t) => renderFrame(hero, { ...B(t), stride, bob: Math.abs(stride) === 1 ? 0 : -1 }));
    case "walk2": {
      if (fluid()) return walk2Fluid(hero, dir, B);
      const strides = [1, 0.5, -0.5, -1, -0.5, 0.5];
      const g = hero.gait ?? "stroll";
      return strides.map((stride, t) => {
        const contact = Math.abs(stride) === 1;
        switch (g) {
          case "sneak": // low, careful steps
            return renderFrame(hero, { ...B(t), stride: stride * 0.6, crouch: 2, lean: dir === "right" ? -1 : 0, bob: contact ? 0 : -1, headDx: dir === "right" ? 1 : 0 });
          case "march": // stiff, heavy steps
            return renderFrame(hero, { ...B(t), stride, bob: contact ? 1 : -1, expr: "n" });
          case "float": { // hovers above the ground
            const h = [2, 3, 4, 4, 3, 2][t];
            const f = jumped(renderFrame(hero, { ...B(t), stride: 0, bob: t % 3 === 0 ? 1 : 0 }, false), h);
            if (t % 2 === 0) f.px(12 + t, 29, 0xc8fbff, 160);
            return f;
          }
          case "swagger": // wide sway
            return renderFrame(hero, { ...B(t), stride, bob: contact ? 1 : -1, headDx: dir === "right" ? 0 : stride > 0 ? 1 : -1, lean: dir === "right" ? 0 : 0 });
          case "light": // bouncy hop step
            return jumped(renderFrame(hero, { ...B(t), stride, bob: contact ? 1 : 0 }, false), contact ? 0 : 2);
          default:
            return renderFrame(hero, { ...B(t), stride: stride * 0.8, bob: contact ? 0 : -1, expr: t === 4 ? "blink" : "n" });
        }
      });
    }
    case "dodge": {
      const [fx, fy] = FACE[dir];
      const crouchF = renderFrame(hero, { ...B(0), crouch: 3, noWeapon: false }, false);
      const spin = (k: number, sh: number) => { const o = mk(); groundShadow(o, 16, 29, 5, 1.2, 50); o.blit(rot90(crouchF, dir === "right" ? k : dir === "down" ? k : -k), Math.round(fx * sh), Math.round(fy * sh * 0.5)); return o; };
      const f0 = renderFrame(hero, { ...B(0), crouch: 3 });
      const f1 = spin(1, 1), f2 = spin(2, 2), f3 = spin(3, 2);
      dust(f2, 16 - fx * 8, 29, 2); dust(f3, 16 - fx * 9, 29, 1, 120);
      const f4 = renderFrame(hero, { ...B(4), crouch: 2 }); dust(f4, 16 - fx * 9, 29, 1, 90);
      const f5 = renderFrame(hero, { ...B(5) });
      return [f0, f1, f2, f3, f4, f5];
    }
    case "jump": {
      const up: Record<Dir, [number, number]> = { down: [24, 10], up: [7, 10], right: [14, 10] };
      return [0, 2, 4, 4, 2, 0].map((h, t) => {
        const peak = h >= 4;
        const f = jumped(renderFrame(hero, { ...B(t), crouch: t === 0 || t === 5 ? 2 : 0, farHand: peak ? up[dir] : undefined, expr: peak ? "happy" : "n", stride: h ? (t < 3 ? 0.5 : -0.5) : 0 }, false), h);
        if (t === 5) dust(f, 10, 29, 2); if (t === 5) dust(f, 22, 29, 2);
        return f;
      });
    }
    case "block": {
      // guard: weapon across the body (knight raises the shield instead)
      const guard: Record<Dir, [number, number]> = { down: [12, 20], up: [20, 19], right: [19, 19] };
      const ang = dir === "right" ? -70 : dir === "down" ? -20 : 200;
      return [0, 1, 2, 3].map((t) => {
        const isShield = !!hero.shield;
        const f = renderFrame(hero, isShield ? { ...B(t), attack: 1, move: "a3", crouch: 1 } : { ...B(t), hand: guard[dir], wAng: ang, crouch: 1, expr: t === 2 ? "squint" : "n" });
        if (t === 2) { const [fx, fy] = FACE[dir]; const bx = 16 + fx * 10, by = 18 + fy * 8; for (const [x, y] of [[0, -2], [0, 2], [-2, 0], [2, 0], [0, 0]]) f.px(bx + x, by + y, 0xffffff, 230); }
        return f;
      });
    }
    case "hit2": {
      const a = jumped(renderFrame(hero, { ...B(0), lean: 3, expr: "squint" }, false, 0.6), 2);
      const b = jumped(renderFrame(hero, { ...B(1), lean: 3, expr: "x" }, false), 3);
      const c = renderFrame(hero, { ...B(2), lean: 2, crouch: 2, expr: "squint" });
      dust(c, 16 + (dir === "right" ? -6 : 0), 29, 2);
      return [a, b, c];
    }
    case "ko2": {
      const lying = fallForward(renderFrame(hero, { ...B(0), expr: "x" }, false));
      const last = fallForward(renderFrame(hero, { ...B(0), expr: "x" }, false));
      dust(lying, 6, 29, 2); dust(lying, 26, 29, 2);
      stars(last, 1);
      return [
        renderFrame(hero, { ...B(0), lean: 2, expr: "squint", bob: 1 }),
        renderFrame(hero, { ...B(1), crouch: 3, lean: 2, expr: "x" }),
        lying, last,
      ];
    }
    case "attack": if (fluid()) return swing8(hero, B); return [0, 1, 2, 3].map((attack, t) => renderFrame(hero, { ...B(t), attack, bob: attack === 2 ? 1 : 0 }));
    case "attack2": if (fluid()) return swing8(hero, B, "a2"); return [0, 1, 2, 3].map((attack, t) => renderFrame(hero, { ...B(t), attack, move: "a2", bob: attack === 2 ? 1 : 0 }));
    case "attack5": if (fluid()) return swing8(hero, B, "a5", dir === "right"); return [0, 1, 2, 3].map((attack, t) => renderFrame(hero, { ...B(t), attack, move: "a5", bob: attack === 2 ? 1 : 0, lean: dir === "right" ? -[0, 1, 2, 1][attack] : 0 }));
    case "attack4": if (fluid()) return swing8(hero, B, "a4"); return [0, 1, 2, 3].map((attack, t) => renderFrame(hero, { ...B(t), attack, move: "a4", bob: attack === 2 ? 1 : 0 }));
    case "attack3": {
      if (hero.moves?.a3.kind === "spin") {
        // spin on the spot: face each way in turn, ending where we started
        const ring: (Dir | "left")[] = ["down", "left", "up", "right"];
        const start = ring.indexOf(dir);
        const spin = [1, 2, 3, 0].map((k, i) => {
          const fd = ring[(start + k) % 4], real: Dir = fd === "left" ? "right" : fd;
          const f = renderFrame(hero, { ...B(i), dir: real, attack: Math.min(i + 1, 3), move: "a3", crouch: i === 3 ? 0 : 1 });
          if (fd === "left") f.mirror();
          if (i < 3) { arc(f, 16, 20, 13, i * 120 - 60, i * 120 + 100, 0xffffff, 200, 2); arc(f, 16, 20, 11, i * 120 - 20, i * 120 + 90, 0xbfd7ff, 120); }
          return f;
        });
        return fluid() ? spin.flatMap((f) => [f, f]) : spin; // 8 columns in painted sheets
      }
      if (fluid()) return swing8(hero, B, "a3");
      return [0, 1, 2, 3].map((attack, t) => renderFrame(hero, { ...B(t), attack, move: "a3", bob: attack === 2 ? 1 : 0 }));
    }
    case "skill": {
      const col = hero.aura ?? 0xffffff;
      if (hero.name === "ninja") {
        // shadow dash: lunge forward leaving afterimages
        const [fx, fy] = FACE[dir];
        const shift = (f: Canvas, k: number) => { const o = mk(); o.blit(f, fx * k, fy * k); return o; };
        const f0 = renderFrame(hero, { ...B(0), attack: 0, move: "a2", crouch: 2 });
        aura(f0, col, 0, false);
        const f1 = shift(renderFrame(hero, { ...B(1), attack: 1, move: "a2" }, false), 3); ghostsBehind(f1, f1, fx * 3, fy * 3, col);
        const f2 = shift(renderFrame(hero, { ...B(2), attack: 2 }, false), 4); ghostsBehind(f2, f2, fx * 3, fy * 3, col);
        const f3 = shift(renderFrame(hero, { ...B(3), attack: 3 }), 2);
        return [f0, f1, f2, f3];
      }
      return [0, 1, 2, 3].map((attack, t) => {
        const f = renderFrame(hero, { ...B(t), attack, move: "a3", bob: attack === 2 ? 1 : 0, crouch: attack === 0 ? 1 : 0 });
        aura(f, col, t, attack >= 1);
        if (attack === 2) { arc(f, 16, 19, 14, 0, 359, rgbMix(col, 0xffffff, 0.4), 160); }
        if (attack === 3) { arc(f, 16, 19, 15, 0, 359, col, 80); }
        return f;
      });
    }
    case "hit": {
      const a = renderFrame(hero, { ...B(0), lean: 2, expr: "squint" }, true, 0.55);
      return [a, renderFrame(hero, { ...B(1), lean: 1, expr: "squint" })];
    }
    case "ko": {
      const lying = rotateLying(renderFrame(hero, { ...B(0), expr: "x" }, false));
      const last = rotateLying(renderFrame(hero, { ...B(0), expr: "x" }, false));
      stars(last, 0);
      return [
        renderFrame(hero, { ...B(0), lean: 2, expr: "squint" }),
        renderFrame(hero, { ...B(1), crouch: 3, lean: 1, expr: "x" }),
        lying, last,
      ];
    }
  }
  throw new Error(anim);
}

// 3/4 facings: the same animation is first "rendered" facing right only to record its poses, then rendered facing
// down (or up) with each frame blended with the matching right-facing pose (see paint/body.ts blendRig).
let diagRec: { p: Pose; info: FrameInfo }[] | null = null;
let diagUse: { dir: "downright" | "upright"; base: Dir; poses: { p: Pose; info: FrameInfo }[]; i: number } | null = null;

/** Frames of one animation for any sheet direction (diagonals only for painted characters). */
export function sheetFrames(hero: Hero, anim: string, dir: SheetDir): Canvas[] {
  if (dir !== "downright" && dir !== "upright") return animFrames(hero, anim, dir);
  const base: Dir = dir === "downright" ? "down" : "up";
  diagRec = [];
  try { animFrames(hero, anim, "right"); } finally { /* keep what was recorded */ }
  const poses = diagRec; diagRec = null;
  diagUse = { dir, base, poses, i: 0 };
  try { return animFrames(hero, anim, base); } finally { diagUse = null; }
}

export function buildSheet(hero: Hero) {
  const painted = PAINTED && hasLook(hero.name);
  const dirs: SheetDir[] = painted ? PAINT_DIRS : DIRS, cols = painted ? PAINT_COLS : COLS, anims = animsOf(painted);
  const sheet = new Canvas(FW * cols, FH * anims.length * dirs.length);
  anims.forEach((a, ai) => dirs.forEach((dir, di) => {
    sheetFrames(hero, a.name, dir).forEach((f, fi) => sheet.blit(f, fi * FW, (ai * dirs.length + di) * FH));
  }));
  return sheet;
}

/** The skill-move sheet of a painted hero: MOVE_ANIMS x PAINT_DIRS rows of PAINT_COLS frames. */
export function buildMovesSheet(hero: Hero) {
  const dirs = PAINT_DIRS, cols = PAINT_COLS;
  const sheet = new Canvas(FW * cols, FH * MOVE_ANIMS.length * dirs.length);
  MOVE_ANIMS.forEach((a, ai) => dirs.forEach((dir, di) => {
    sheetFrames(hero, a.name, dir).forEach((f, fi) => sheet.blit(f, fi * FW, (ai * dirs.length + di) * FH));
  }));
  return sheet;
}
