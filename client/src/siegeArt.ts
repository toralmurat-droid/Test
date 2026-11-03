import Phaser from "phaser";
import { SIEGE_SITES, EngineKind } from "../../shared/siege";
import { BONE, IRON, OLDWOOD, Pen, ROPE, sheet, WOOD } from "./worldProps";

/**
 * The necromancer's siege works (shared/siege.ts): half-built catapults, battering rams and siege towers, lumber
 * yards and sawhorses, plus the tools skeleton workers handle (saw, plank, rope).
 *
 * Same pixel style as worldProps.ts / the village bonfire: 1.5 texels per world px, a few flat tones per material,
 * ordered dithering between tones, light from the top left, 1px dark outline. Walk-through, client only.
 */
export const TX = 1.5;
const N = 6; // animation frames (pulleys and hanging beams swing)

type C3 = [number, number, number];
const FRESH: C3 = [0xb08a5a, 0x8c6a42, 0x5e462c]; // newly cut timber
const BARK: C3 = [0x5e4a36, 0x463626, 0x2c2218];
const DARK: C3 = [0x4e3a28, 0x3a2a1c, 0x261a12]; // back beams, in shadow
const STONE: C3 = [0x9a968c, 0x6e6a62, 0x48453f];
const GHOST = 0x6fd38a; // necromantic sigils
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered dither: true where tone t (0..1) shows at (x, y). */
const dith = (x: number, y: number, t: number) => t * 16 > BAYER[((Math.round(y) & 3) << 2) | (Math.round(x) & 3)];
const sway = (f: number) => Math.sin((f / N) * Math.PI * 2);

/** A timber beam from (x0,y0) to (x1,y1), `w` texels thick: lit edge on the upper-left side, grain and knots. */
function beam(p: Pen, x0: number, y0: number, x1: number, y1: number, w: number, c: C3, seed = 0) {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux;
  const litLow = nx + ny > 0; // the k = 0 edge faces up-left
  for (let s = 0; s <= L; s += 0.5) for (let k = 0; k < w; k++) {
    const o = k - (w - 1) / 2, x = x0 + ux * s + nx * o, y = y0 + uy * s + ny * o;
    const edgeLit = litLow ? k === 0 : k === w - 1, edgeDark = litLow ? k === w - 1 : k === 0;
    let col = edgeLit ? c[0] : edgeDark ? c[2] : c[1];
    if (!edgeLit && !edgeDark && w > 3 && ((Math.floor(s) * 7 + k * 3 + seed) % 13 === 0)) col = c[2]; // grain
    if (!edgeLit && !edgeDark && w > 2 && dith(x, y, 0.18) && k === 1) col = c[0];
    p.px(x, y, col);
  }
}

/** A filled ellipse with top-left light and dithered shading. */
function blob(p: Pen, cx: number, cy: number, rx: number, ry: number, c: C3) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, d = dx * dx + dy * dy;
    if (d > 1) continue;
    const l = -dx * 0.6 - dy * 0.8; // light from top left
    p.px(x, y, l > 0.45 ? c[0] : l > 0.1 ? (dith(x, y, (l - 0.1) / 0.35) ? c[0] : c[1]) : l < -0.45 ? c[2] : l < -0.1 ? (dith(x, y, (-l - 0.1) / 0.35) ? c[2] : c[1]) : c[1]);
  }
}

/** A spoked wooden wheel, seen from the side. */
function wheel(p: Pen, cx: number, cy: number, r: number, c: C3) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x, y);
    if (d > r + 0.3 || d < r - 2.6) continue;
    p.px(cx + x, cy + y, d > r - 0.8 ? (x + y < 0 ? IRON.mid : IRON.lo) : x + y < -r * 0.3 ? c[0] : x + y > r * 0.3 ? c[2] : c[1]); // iron tyre
  }
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * Math.PI * 2 + 0.3;
    for (let s = 2; s < r - 2; s += 0.5) p.px(cx + Math.cos(ang) * s, cy + Math.sin(ang) * s, Math.cos(ang) + Math.sin(ang) < 0 ? c[0] : c[1]);
  }
  p.rect(cx - 2, cy - 2, 4, 4, IRON.lo); p.px(cx - 1, cy - 1, IRON.hi); p.px(cx, cy - 1, IRON.mid);
}

/** A rope from (x0,y0) to (x1,y1), slightly sagging, two-tone twist. */
function rope(p: Pen, x0: number, y0: number, x1: number, y1: number, sag = 0) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = Math.sin(t * Math.PI) * sag;
    p.px(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + s, i % 2 ? ROPE : 0x6a5a3a);
  }
}

/** A small skull, facing the viewer, top left at (x, y) (7x7). */
function skull(p: Pen, x: number, y: number) {
  blob(p, x + 3, y + 3, 3.4, 3.2, [BONE.hi, BONE.mid, BONE.lo]);
  p.px(x + 2, y + 3, 0x1a1210); p.px(x + 4, y + 3, 0x1a1210); p.px(x + 3, y + 5, 0x3a2a20);
  for (let i = 1; i < 6; i++) p.px(x + i, y + 7, i % 2 ? BONE.lo : BONE.mid);
}

/** Lashing: a few turns of rope around a joint. */
function lash(p: Pen, x: number, y: number) {
  for (let k = -2; k <= 2; k++) { p.px(x - 2, y + k, ROPE); p.px(x - 1, y + k + 1, 0x6a5a3a); p.px(x + 1, y + k, ROPE); }
}

function makeTextures(scene: Phaser.Scene) {
  // ---- Half-built catapult: base on wheels (one still lying in the grass), A-frame, the throwing arm propped up
  // unfinished, a pulley block swinging from the crossbar, a ladder, and a pile of stones for ammunition.
  sheet(scene, "siege_catapult", 152, 118, N, (p, f) => {
    const s = sway(f);
    blob(p, 16, 110, 13, 4.2, FRESH); blob(p, 16, 109.5, 3, 1.2, [IRON.hi, IRON.mid, IRON.lo]); // wheel lying flat
    for (let a = 0; a < 6; a++) { const ang = (a / 6) * Math.PI * 2; p.line(16, 110, 16 + Math.cos(ang) * 10, 110 + Math.sin(ang) * 3.2, FRESH[2]); }
    wheel(p, 38, 96, 11, DARK); wheel(p, 118, 96, 11, DARK); // far wheels
    beam(p, 28, 92, 130, 92, 4, DARK, 1); // far side beam
    beam(p, 74, 98, 78, 40, 4, DARK, 2); beam(p, 92, 98, 84, 40, 4, DARK, 3); // far upright pair
    beam(p, 22, 102, 126, 102, 5, WOOD, 4); // near side beam
    for (const x of [30, 74, 120]) beam(p, x, 102, x + 6, 92, 3, WOOD, x);
    wheel(p, 112, 104, 12, WOOD); // near wheel (the other one is still on the ground)
    p.rect(30, 103, 3, 9, WOOD[2]); p.rect(29, 110, 5, 2, OLDWOOD[1]); // a chock block holding up the wheelless corner
    beam(p, 66, 102, 70, 36, 5, WOOD, 5); beam(p, 86, 102, 78, 36, 5, WOOD, 6); // near upright pair
    beam(p, 60, 38, 92, 38, 4, WOOD, 7); p.rect(73, 36, 6, 5, IRON.lo); p.px(74, 37, IRON.hi); // crossbar, axle cap
    beam(p, 68, 70, 84, 70, 3, WOOD, 8); lash(p, 68, 70); lash(p, 84, 70);
    // throwing arm, fresh timber, leaning on the crossbar waiting to be fitted
    beam(p, 34, 100, 124, 22, 5, FRESH, 9); lash(p, 76, 64);
    p.rect(120, 18, 7, 6, FRESH[2]); p.rect(121, 18, 5, 2, FRESH[1]); // unfinished cup block
    rope(p, 124, 24, 128, 40, 2); rope(p, 128, 40, 126, 48, 0);
    // pulley on the crossbar
    const bx = 82 + Math.round(s * 2.5);
    rope(p, 82, 40, bx, 58); rope(p, 84, 40, bx + 2, 58);
    p.rect(bx - 2, 58, 6, 7, IRON.lo); p.rect(bx - 1, 59, 4, 5, IRON.mid); p.px(bx - 1, 59, IRON.hi); p.px(bx + 1, 61, 0x2a2a2e);
    p.px(bx, 66, IRON.mid); p.px(bx + 1, 67, IRON.mid); p.px(bx + 2, 66, IRON.lo); // hook
    // ladder against the frame
    beam(p, 98, 114, 88, 48, 2, OLDWOOD, 10); beam(p, 105, 114, 95, 48, 2, OLDWOOD, 11);
    for (let y = 54; y < 112; y += 8) { const t = (y - 48) / 66; p.line(89 + t * 10, y, 95 + t * 10, y, OLDWOOD[1]); }
    // stones for the catapult, and a skull lashed to the front beam (the necromancer's mark)
    for (const [x, y, r] of [[134, 110, 5], [144, 111, 4.4], [139, 104, 4.6], [128, 113, 3.4], [147, 105, 3]] as const) blob(p, x, y, r, r * 0.85, STONE);
    skull(p, 122, 93); lash(p, 125, 101);
  }, 0.55);

  // ---- Battering ram: wheeled frame with half its roof planked, the iron-headed log hanging from chains and swaying.
  sheet(scene, "siege_ram", 144, 104, N, (p, f) => {
    const s = sway(f);
    wheel(p, 36, 88, 10, DARK); wheel(p, 122, 88, 10, DARK);
    beam(p, 26, 84, 134, 84, 3, DARK, 1);
    for (const x of [30, 76, 124]) beam(p, x + 8, 84, x + 8, 22, 3, DARK, x); // far posts
    beam(p, 30, 18, 134, 18, 3, DARK, 2); // far top beam (ridge)
    // roof: rafters from the near top beam to the ridge, planks over the left half only
    for (let x = 20; x <= 120; x += 14) beam(p, x, 32, x + 10, 18, 2, WOOD, x);
    for (let y = 19; y < 32; y += 2) for (let x = 20 + (32 - y) * 0.7; x < 66 + (32 - y) * 0.7; x++) p.px(x, y, (y >> 1) % 2 ? OLDWOOD[1] : OLDWOOD[0]);
    for (let y = 19; y < 32; y += 4) p.line(20 + (32 - y) * 0.7, y + 1, 66 + (32 - y) * 0.7, y + 1, OLDWOOD[2]);
    p.rect(72, 25, 14, 2, FRESH[1]); p.rect(72, 25, 14, 1, FRESH[0]); // a loose plank
    // the ram log on chains
    const dx = Math.round(s * 2.2);
    for (const cx of [46, 100]) for (let y = 33; y < 58; y += 2) { p.px(cx + (dx * (y - 33)) / 25, y, y % 4 ? IRON.mid : IRON.lo); }
    beam(p, 18 + dx, 60, 118 + dx, 58, 8, BARK, 12);
    for (let x = 30; x < 112; x += 12) p.line(x + dx, 56, x + 2 + dx, 63, BARK[2]); // bark cracks
    // iron ram head with curled horns
    for (let j = -5; j <= 5; j++) for (let i = 0; i < 12 - Math.abs(j); i++) p.px(6 + dx + i + Math.abs(j), 60 + j, j < -2 ? IRON.hi : j > 2 ? IRON.lo : IRON.mid);
    for (const sgn of [-1, 1]) for (let a = 0; a < 9; a++) { const ang = a * 0.7; p.px(16 + dx + Math.cos(ang) * (4 - a * 0.3), 60 + sgn * (5 + Math.sin(ang) * (3 - a * 0.2)), a < 4 ? IRON.mid : IRON.lo); }
    p.rect(20 + dx, 56, 2, 9, IRON.lo); p.px(10 + dx, 59, 0xff4a3a); // band, a red ember of an eye
    // near frame
    beam(p, 16, 92, 128, 92, 4, WOOD, 3);
    for (const x of [22, 68, 116]) beam(p, x, 92, x, 30, 4, WOOD, x + 1);
    beam(p, 16, 32, 124, 32, 4, WOOD, 4);
    beam(p, 22, 64, 68, 40, 2, WOOD, 5); lash(p, 45, 52); // a brace
    wheel(p, 28, 92, 11, WOOD); wheel(p, 112, 92, 11, WOOD);
    skull(p, 64, 22);
  }, 0.55);

  // ---- Siege tower: three storeys of timber frame, the lowest half planked (a sigil daubed on it), the top still open,
  // a crane boom lifting the next beam on a swinging rope.
  sheet(scene, "siege_tower", 116, 192, N, (p, f) => {
    const s = sway(f);
    wheel(p, 30, 180, 9, DARK); wheel(p, 100, 180, 9, DARK);
    for (const x of [26, 98]) beam(p, x, 180, x, 14, 4, DARK, x); // far posts
    for (const y of [128, 74, 22]) beam(p, 26, y, 98, y, 3, DARK, y);
    // near frame
    beam(p, 14, 184, 88, 184, 4, WOOD, 1);
    beam(p, 16, 186, 16, 24, 5, WOOD, 2); beam(p, 86, 186, 86, 70, 5, WOOD, 3); // the near right post isn't finished
    for (const y of [130, 76]) beam(p, 14, y, 88, y, 4, WOOD, y);
    beam(p, 18, 128, 84, 80, 3, WOOD, 4); beam(p, 18, 80, 84, 128, 3, WOOD, 5); // X brace, middle storey
    // planks on the lowest storey (two missing), with a necromantic sigil daubed in pale green
    for (let y = 136; y < 182; y += 4) {
      if (y === 152 || y === 168) continue;
      for (let x = 19; x < 84; x++) p.px(x, y, x === 19 ? OLDWOOD[0] : OLDWOOD[1]); for (let x = 19; x < 84; x++) { p.px(x, y + 1, OLDWOOD[1]); p.px(x, y + 2, (x * 5 + y) % 11 === 0 ? OLDWOOD[2] : OLDWOOD[1]); p.px(x, y + 3, OLDWOOD[2]); }
    }
    for (let a = 0; a < 5; a++) { // five-pointed star in a ring
      const a0 = -Math.PI / 2 + (a * 4 * Math.PI) / 5, a1 = -Math.PI / 2 + ((a + 1) * 4 * Math.PI) / 5;
      p.line(51 + Math.cos(a0) * 9, 160 + Math.sin(a0) * 9, 51 + Math.cos(a1) * 9, 160 + Math.sin(a1) * 9, GHOST);
    }
    for (let a = 0; a < 40; a++) if (a % 7 !== 3) p.px(51 + Math.cos(a / 40 * Math.PI * 2) * 11, 160 + Math.sin(a / 40 * Math.PI * 2) * 11, 0x4f9a66);
    wheel(p, 22, 186, 10, WOOD); wheel(p, 82, 186, 10, WOOD);
    // top storey: one corner post, the crane boom and a beam on the rope
    beam(p, 16, 26, 60, 26, 3, FRESH, 6);
    beam(p, 18, 40, 4, 4, 3, FRESH, 7); lash(p, 16, 30);
    const hx = 2 + Math.round(s * 3);
    rope(p, 4, 5, hx, 46); rope(p, 4, 5, 18, 36, 1);
    beam(p, hx - 12, 50 + Math.round(s), hx + 16, 48 - Math.round(s), 4, FRESH, 8); rope(p, hx, 46, hx - 6, 49); rope(p, hx, 46, hx + 8, 48);
    skull(p, 84, 60);
  }, 0.5);

  // ---- Lumber yard: a pyramid of logs, a stack of fresh planks, a stump with an axe in it.
  sheet(scene, "siege_lumber", 112, 62, 1, (p) => {
    const log = (x0: number, x1: number, y: number, r: number) => {
      beam(p, x0, y, x1, y, r * 2, BARK, x0 + y);
      blob(p, x1, y, r * 0.8, r, FRESH);
      for (let k = 1; k < r; k += 2) for (let a = 0; a < 20; a++) p.px(x1 + Math.cos(a / 20 * Math.PI * 2) * k * 0.8, y + Math.sin(a / 20 * Math.PI * 2) * k, FRESH[2]); // rings
    };
    for (const i of [0, 1, 2]) log(6 + i * 2, 48 + i * 2, 54, 4.5);
    for (const i of [0, 1]) log(10 + i * 2, 46 + i * 2 + 4, 46, 4.5);
    log(14, 52, 38, 4.5);
    for (let k = 0; k < 6; k++) { const y = 58 - k * 3; beam(p, 62 + (k % 2) * 2, y, 100 + (k % 2) * 2, y, 3, FRESH, k * 5); }
    blob(p, 98, 34, 7, 3, FRESH); beam(p, 92, 36, 92, 44, 1, BARK); beam(p, 104, 36, 104, 44, 1, BARK); for (let x = 91; x <= 105; x++) p.px(x, 37 + Math.round(Math.abs(x - 98) * 0.2), BARK[1]);
    beam(p, 96, 34, 86, 20, 2, WOOD, 3); for (let j = 0; j < 6; j++) for (let i = 0; i < 4; i++) p.px(95 + i - j * 0.3, 30 + j, i === 0 ? IRON.hi : IRON.mid); // axe
    for (let i = 0; i < 18; i++) p.px(60 + ((i * 37) % 44), 60 + (i % 2), FRESH[(i % 3)]); // wood chips
  }, 0.5);

  // ---- Sawhorse with a half-sawn log and sawdust.
  sheet(scene, "siege_sawhorse", 60, 40, 1, (p) => {
    for (const x of [12, 44]) { beam(p, x - 6, 38, x + 3, 20, 2, OLDWOOD, x); beam(p, x + 6, 38, x - 3, 20, 2, OLDWOOD, x + 1); }
    beam(p, 2, 18, 58, 18, 7, BARK, 5);
    blob(p, 58, 18, 3, 3.5, FRESH);
    for (let y = 14; y < 22; y++) p.px(30, y, 0x1e140c); p.px(29, 14, FRESH[0]); p.px(31, 14, FRESH[2]); // the cut so far
    for (let i = 0; i < 16; i++) blob(p, 30 + ((i * 7) % 9) - 4, 37, 1.2, 0.8, [0xd8bc86, 0xc0a06a, 0x9a7a4e]); // sawdust
  }, 0.4);

  // ---- Tools the workers handle
  sheet(scene, "siege_saw", 26, 9, 1, (p) => {
    for (let x = 0; x < 19; x++) { const h = 4 - Math.floor(x / 8); for (let y = 0; y < h; y++) p.px(x, 2 + y, y === 0 ? IRON.hi : IRON.mid); if (x % 2 === 0) p.px(x, 2 + h, IRON.lo); }
    p.rect(19, 1, 6, 5, WOOD[1]); p.rect(19, 1, 6, 1, WOOD[0]); p.rect(21, 3, 2, 2, 0x1e140c);
  }, 0);
  sheet(scene, "siege_plank", 40, 7, 1, (p) => { beam(p, 1, 3, 38, 3, 4, FRESH, 2); }, 0);
  sheet(scene, "siege_rope", 4, 2, 1, (p) => { p.px(0, 0, ROPE); p.px(1, 0, 0x6a5a3a); p.px(2, 0, ROPE); p.px(3, 0, 0x6a5a3a); }, 0);
  sheet(scene, "siege_chip", 3, 3, 1, (p) => { p.px(1, 1, FRESH[0]); p.px(2, 1, FRESH[1]); }, 0);
}

/** World-space size of each engine (texture texels / TX), for depth and placement. */
const ENGINE_KEY: Record<EngineKind, string> = { catapult: "siege_catapult", ram: "siege_ram", tower: "siege_tower" };

/** Adds every site's engine, lumber yard and sawhorse to the scene. */
export function addSiegeWorks(scene: Phaser.Scene) {
  makeTextures(scene);
  for (const key of Object.values(ENGINE_KEY)) {
    if (!scene.anims.exists(`${key}_idle`)) scene.anims.create({ key: `${key}_idle`, frames: scene.anims.generateFrameNumbers(key, { start: 0, end: N - 1 }), frameRate: 4, repeat: -1 });
  }
  SIEGE_SITES.forEach((s, i) => {
    const key = ENGINE_KEY[s.engine];
    const e = scene.add.sprite(s.x, s.y, key, 0).setOrigin(0.5, 1).setScale(1 / TX).setDepth(s.y).setFlipX(s.flip);
    e.play({ key: `${key}_idle`, startFrame: i % N });
    scene.add.image(s.lumber.x, s.lumber.y, "siege_lumber").setOrigin(0.5, 1).setScale(1 / TX).setDepth(s.lumber.y).setFlipX(s.flip);
    scene.add.image(s.saw.x, s.saw.y, "siege_sawhorse").setOrigin(0.5, 1).setScale(1 / TX).setDepth(s.saw.y).setFlipX(s.flip);
  });
}
