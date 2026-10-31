import { Canvas, shade } from "./canvas";

export type Dir = "down" | "up" | "right";
export const DIRS: Dir[] = ["down", "up", "right"];
export const FW = 32, FH = 32, COLS = 4;
const OUTLINE = 0x1a1420;

export interface Pose {
  dir: Dir;
  t: number;          // frame counter (for little flutters)
  bob: number;        // upper body y offset
  stride: number;     // -1..1 walking leg offset
  lean: number;       // whole-body x push (hit knockback), in facing-space
  crouch: number;     // KO kneel
  attack: number;     // -1 none, 0 windup, 1 swing, 2 impact, 3 recover
  expr: "n" | "squint" | "x";
}

export const ANIMS: { name: string; frames: number; fps: number; loop: boolean }[] = [
  { name: "idle", frames: 4, fps: 4, loop: true },
  { name: "walk", frames: 4, fps: 8, loop: true },
  { name: "attack", frames: 4, fps: 14, loop: false },
  { name: "hit", frames: 2, fps: 10, loop: false },
  { name: "ko", frames: 4, fps: 6, loop: false },
];

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
  idleAngle: Record<Dir, number>;
}

// ---------- shared body bits ----------
function eyes(d: D, xs: number[], y: number, col: number) {
  for (const x of xs) {
    if (d.p.expr === "x") {
      for (const [a, b] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]) d.Up(x + a, y + b, col);
    } else if (d.p.expr === "squint") {
      d.Up(x - 1, y + 1, col); d.Up(x, y, col); d.Up(x + 1, y + 1, col);
    } else {
      d.Up(x, y, col); d.Up(x, y + 1, col);
    }
  }
}

function standardLegs(d: D, legTop: number, pants: number, boots: number) {
  const { p } = d, s = p.stride, h = 28 - legTop;
  if (p.dir === "right") {
    const back = -Math.round(s * 2), front = Math.round(s * 2);
    for (const [off, f] of [[back, 0.8], [front, 1]] as const) {
      const x = 14 + off + d.lx;
      d.c.box(x, legTop, 3, h, shade(pants, f));
      d.c.box(x, 27, 4, 2, shade(boots, f));
    }
  } else {
    const lift = (i: number) => (s === 0 ? 0 : (i === 0) === s > 0 ? 1 : 0);
    [12, 17].forEach((x, i) => {
      const up = lift(i);
      d.c.box(x + d.lx, legTop, 3, h - up, pants);
      d.c.box(x + d.lx, 27 - up, 3, 2, boots);
    });
  }
}

function handPos(p: Pose, hero: Hero): [number, number] {
  const [fx, fy] = FACE[p.dir];
  const base: Record<Dir, [number, number]> = { down: [hero.name === "wizard" ? 9 : 10, 22], up: [21, 22], right: [16, 22] };
  let [x, y] = base[p.dir];
  if (p.attack >= 0) {
    const reach = [0, 3, 4, 2][p.attack], lift = [5, 2, 0, 0][p.attack];
    x += fx * reach; y += fy * reach - lift;
    if (p.dir === "down") x += [1, 2, 3, 2][p.attack];
  } else if (p.dir === "right") {
    x += Math.round(-p.stride * 1.5);
  } else {
    y += p.stride === 0 ? 0 : p.dir === "down" ? -p.stride : p.stride;
  }
  return [x + p.lean * (p.dir === "right" ? 1 : 0), y + p.bob + p.crouch];
}

function weaponAngle(p: Pose, hero: Hero) {
  if (p.attack < 0) return hero.idleAngle[p.dir];
  let a = hero.swing[p.attack];
  if (p.dir === "up") a = -a; // sweep the other way so it reads the same
  return FACE_ANGLE[p.dir] + a;
}

// ---------- NINJA ----------
const NJ = { suit: 0x2f3150, hood: 0x262840, band: 0xd62839, skin: 0xf1c27d, eye: 0x111111, sash: 0x8d99ae, wrap: 0xc9cdd6, boot: 0x17182a, blade: 0xe6edf5, hilt: 0x9b1d2a, guard: 0xf2c14e };
const ninja: Hero = {
  name: "ninja",
  swing: [-130, -40, 35, 60],
  idleAngle: { down: 115, up: 120, right: 110 },
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

export const HEROES: Hero[] = [ninja, wizard, knight];

/** Render one frame into a fresh 32x32 canvas. */
export function renderFrame(hero: Hero, p: Pose, withShadow = true, flash = 0): Canvas {
  const c = new Canvas(FW, FH);
  const [fx] = FACE[p.dir];
  const lean = p.dir === "right" ? -p.lean : 0; // knock back opposite facing
  const ly = p.dir === "down" ? -Math.min(p.lean, 1) : p.dir === "up" ? Math.min(p.lean, 1) : 0;
  const d: D = {
    c, p, ux: lean, uy: p.bob + p.crouch + ly, lx: lean,
    U: (x, y, w, h, col, top) => c.box(x + d.ux, y + d.uy, w, h, col, { top }),
    Ur: (x, y, w, h, col) => c.rect(x + d.ux, y + d.uy, w, h, col),
    Up: (x, y, col) => c.px(x + d.ux, y + d.uy, col),
  };
  void fx;
  const hp = handPos({ ...p, lean: 0 }, hero);
  const hand: [number, number] = [hp[0] + d.ux, hp[1] + ly];
  const ang = weaponAngle(p, hero);
  const legTop = 24 + p.crouch;
  const weaponBehind = p.dir === "up" ? p.attack < 1 || p.attack === 3 : hero.name === "wizard" && p.dir === "right" && p.attack < 0 ? false : false;

  if (p.dir === "up") {
    if (weaponBehind) hero.weapon(d, hand, ang);
    hero.legs(d, legTop); hero.torso(d);
    hero.arm(d, "far", hand); hero.shield?.(d); hero.arm(d, "near", hand);
    hero.head(d);
    if (!weaponBehind) hero.weapon(d, hand, ang);
  } else if (p.dir === "down") {
    hero.legs(d, legTop); hero.torso(d); hero.head(d);
    hero.arm(d, "far", hand); hero.shield?.(d);
    hero.weapon(d, hand, ang); hero.arm(d, "near", hand);
  } else {
    hero.arm(d, "far", hand);
    hero.legs(d, legTop); hero.torso(d); hero.shield?.(d); hero.head(d);
    hero.weapon(d, hand, ang); hero.arm(d, "near", hand);
  }
  if (flash) c.tint(0xffffff, flash);
  c.outline(OUTLINE);
  hero.fx?.(d, hand, ang);
  if (withShadow) c.under((s) => s.ellipse(16 + d.lx, 29, 6, 1.5, 0x000000, 70));
  return c;
}

function rotateLying(src: Canvas): Canvas {
  // rotate 90° clockwise so the head ends up on the right, then sit it on the ground line
  const r = new Canvas(FW, FH);
  r.blit(src, 0, 0, (x, y) => [FW - 1 - y, x]);
  let maxY = 0, minX = FW, maxX = 0;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (r.alpha(x, y)) { maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  const out = new Canvas(FW, FH);
  out.ellipse(16, 29, 11, 1.5, 0x000000, 70);
  out.blit(r, Math.round((FW - 1 - maxX - minX) / 2), 30 - maxY);
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

export function animFrames(hero: Hero, anim: string, dir: Dir): Canvas[] {
  const B = (t: number) => base(dir, t);
  switch (anim) {
    case "idle": return [0, 0, 1, 1].map((bob, t) => renderFrame(hero, { ...B(t), bob }));
    case "walk": return [1, 0, -1, 0].map((stride, t) => renderFrame(hero, { ...B(t), stride, bob: stride === 0 ? -1 : 0 }));
    case "attack": return [0, 1, 2, 3].map((attack, t) => renderFrame(hero, { ...B(t), attack, bob: attack === 2 ? 1 : 0 }));
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

export function buildSheet(hero: Hero) {
  const sheet = new Canvas(FW * COLS, FH * ANIMS.length * DIRS.length);
  ANIMS.forEach((a, ai) => DIRS.forEach((dir, di) => {
    animFrames(hero, a.name, dir).forEach((f, fi) => sheet.blit(f, fi * FW, (ai * DIRS.length + di) * FH));
  }));
  return sheet;
}
