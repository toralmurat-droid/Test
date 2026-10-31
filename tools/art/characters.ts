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

// ---------- generic humans (archer, barbarian, NPCs) ----------
interface HumanOpts {
  name: string;
  skin: number; hair: number; eye?: number;
  hairStyle: "short" | "long" | "bald" | "ponytail";
  beard?: number;                 // beard colour
  hat?: { kind: "hood" | "horned" | "cap" | "helm" | "bandana" | "wide"; col: number; trim?: number };
  shirt: number; pants: number; boots: number; belt?: number;
  bareChest?: boolean;
  apron?: number; vest?: number; tabard?: { col: number; emblem: number };
  sleeve?: number;
  weapon: "bow" | "axe" | "hammer" | "spear" | "dagger" | "none";
  quiver?: boolean;
  fxCol?: number;
}

function human(o: HumanOpts): Hero {
  const eye = o.eye ?? 0x111111;
  const sleeve = o.bareChest ? o.skin : o.sleeve ?? o.shirt;
  const swing: Record<HumanOpts["weapon"], number[]> = {
    bow: [0, 0, 0, 0], axe: [-140, -50, 30, 60], hammer: [-150, -70, 10, 40], spear: [-20, 0, 0, 0], dagger: [-90, -20, 30, 50], none: [-60, -10, 20, 30],
  };
  const idle: Record<HumanOpts["weapon"], Record<Dir, number>> = {
    bow: { down: 180, up: 0, right: 0 }, axe: { down: 100, up: 110, right: 75 }, hammer: { down: 100, up: 110, right: 80 },
    spear: { down: -95, up: -85, right: -80 }, dagger: { down: 110, up: 110, right: 100 }, none: { down: 90, up: 90, right: 90 },
  };
  const hat = o.hat;
  const H: Hero = {
    name: o.name,
    swing: swing[o.weapon],
    idleAngle: idle[o.weapon],
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
          const ph = d.p.attack, pull = ph === 0 ? 2 : ph === 1 ? 4 : 0;
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
  vest: 0x6e4526, weapon: "bow", quiver: true,
});
const barbarian = human({
  name: "barbarian", skin: 0xe0a77a, hair: 0xd9792b, hairStyle: "long", beard: 0xd9792b,
  hat: { kind: "horned", col: 0x8a939b, trim: 0x5b6470 }, shirt: 0, bareChest: true, pants: 0x7a5230, boots: 0x4a3020, belt: 0x3a2a1a,
  weapon: "axe", fxCol: 0xffe0c0,
});
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

export const HEROES: Hero[] = [ninja, wizard, knight, archer, barbarian];
export const NPCS: Hero[] = [blacksmith, merchant, villager, guard];

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
