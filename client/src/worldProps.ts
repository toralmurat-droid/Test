import Phaser from "phaser";
import { TILE } from "../../shared/constants";
import { AREAS, EMPTY, GROUND, HOLLOW, HOLLOW_WARDS, OBJECTS, REDFANG_TOWERS, SIGNPOSTS, T, VILLAGE, WRECK } from "../../shared/map";
import { standingStone, STONE_H, STONE_W, throne, THRONE_H, THRONE_W } from "./throneArt";
import { NPCS, NPC_DECOR } from "../../shared/npcs";
import { CHESTS } from "../../shared/chests";
import { SIEGE_SITES } from "../../shared/siege";
import { ELEMENT_LANDS } from "../../shared/map";
import { emberVent, iceSpikes, ICE_H, ICE_W, stormStone, STORM_H, STORM_W, venomCaps, VENOM_H, VENOM_W, VENT_H, VENT_W } from "./elementArt";

/**
 * Standing world props with idle animations: spear racks with fluttering pennants, war pennants on tall poles,
 * swaying training dummies, lantern poles with swinging lanterns (lit at night), bandit skull pikes with flapping
 * rags, fishing-net racks with fish swinging in the wind, and broken spears left on old battlefields.
 *
 * Pixel art painted in code at 1.5 texels per world px (the world's pixel grid, see pixelgrid.ts), light from the
 * top left, weathered dark palette, 1px dark outline. Purely cosmetic: walk-through, client only.
 */
const TX = 1.5; // texels per world px
export const OUTLINE = 0x15100d;

// ---- painter -------------------------------------------------------------------------------------------
export type Px = (x: number, y: number, c: number, a?: number) => void;
export interface Pen {
  px: Px;
  line(x0: number, y0: number, x1: number, y1: number, c: number): void;
  rect(x: number, y: number, w: number, h: number, c: number): void;
  /** Wooden shaft from (x0,y0) to (x1,y1): light left edge, dark right edge. */
  shaft(x0: number, y0: number, x1: number, y1: number, w?: number, cols?: [number, number, number]): void;
}

export function pen(buf: Uint32Array, W: number, H: number): Pen {
  const px: Px = (x, y, c, a = 1) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (a >= 1) { buf[i] = 0xff000000 | c; return; }
    const o = buf[i], oa = o >>> 24;
    if (!oa) { buf[i] = (Math.round(a * 255) << 24) | c; return; }
    const mixc = (s: number) => Math.round(((o >> s) & 255) * (1 - a) + ((c >> s) & 255) * a) << s;
    buf[i] = (0xff000000 | mixc(16) | mixc(8) | mixc(0)) >>> 0;
  };
  const line = (x0: number, y0: number, x1: number, y1: number, c: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c);
  };
  const rect = (x: number, y: number, w: number, h: number, c: number) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
  const shaft = (x0: number, y0: number, x1: number, y1: number, w = 2, cols: [number, number, number] = WOOD) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
      for (let k = 0; k < w; k++) px(x + k, y, k === 0 ? cols[0] : k === w - 1 ? cols[2] : cols[1]);
      if (((i * 7) % 11) === 3) px(x + Math.floor(w / 2), y, cols[2]); // grain knots
    }
  };
  return { px, line, rect, shaft };
}

/** Paints `frames` frames side by side, outlines each silhouette, and registers the spritesheet texture. */
export function sheet(scene: Phaser.Scene, key: string, w: number, h: number, frames: number, draw: (p: Pen, f: number) => void, shadow = 0.5) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w * frames, h)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w * frames, h);
  const out = new Uint32Array(img.data.buffer);
  for (let f = 0; f < frames; f++) {
    const buf = new Uint32Array(w * h);
    draw(pen(buf, w, h), f);
    // 1px dark outline around the silhouette
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && buf[y * w + x] >>> 24 > 140;
    const ol = new Uint32Array(buf);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) ol[y * w + x] = (0xe0 << 24 | OUTLINE) >>> 0;
    }
    // soft contact shadow at the foot
    if (shadow > 0) for (let y = h - 4; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w * 0.42), dy = (y - (h - 2)) / 2.2;
      if (dx * dx + dy * dy <= 1 && !(ol[y * w + x] >>> 24)) ol[y * w + x] = (Math.round(shadow * 120) << 24) >>> 0;
    }
    // RGBA byte order in the ImageData: swap red and blue
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = ol[y * w + x];
      out[y * w * frames + f * w + x] = ((v & 0xff00ff00) | ((v >> 16) & 255) | ((v & 255) << 16)) >>> 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  for (let f = 0; f < frames; f++) tex.add(f, 0, f * w, 0, w, h);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

// ---- palette (dark, weathered) -------------------------------------------------------------------------
export const WOOD: [number, number, number] = [0x7d5c3c, 0x5a3f28, 0x3a281a];
export const OLDWOOD: [number, number, number] = [0x6e665a, 0x504a40, 0x34302a];
export const IRON = { hi: 0xb4b8bc, mid: 0x7a7f86, lo: 0x43474d };
export const ROPE = 0x9a8458;
export const BONE = { hi: 0xe2dac4, mid: 0xb8ae94, lo: 0x7a705c };
const STRAW = [0xd2b46a, 0xb0924e, 0x86703a];
const sway = (f: number, n: number) => Math.sin((f / n) * Math.PI * 2);

/** Spear head pointing up with its tip at (x, y). */
export function spearHead(p: Pen, x: number, y: number) {
  for (let j = 0; j < 7; j++) {
    const half = j < 3 ? j * 0.5 : (6 - j) * 0.45 + 0.4;
    for (let i = -Math.round(half); i <= Math.round(half); i++) p.px(x + i, y + j, i < 0 ? IRON.hi : i > 0 ? IRON.lo : IRON.mid);
  }
  p.px(x, y + 7, IRON.lo); p.px(x - 1, y + 8, ROPE); p.px(x, y + 8, ROPE); p.px(x + 1, y + 8, 0x6a5a3a); // socket binding
}

/** Small pennant streaming right from (x, y), waving with phase `t`. */
function pennant(p: Pen, x: number, y: number, len: number, hgt: number, t: number, col: [number, number, number]) {
  for (let i = 0; i < len; i++) {
    const k = i / len, h = Math.max(1, Math.round(hgt * (1 - k * 0.85)));
    const dy = Math.round(Math.sin(t + i * 0.55) * (0.4 + k * 1.6));
    for (let j = 0; j < h; j++) {
      const shade = Math.sin(t + i * 0.55 + 1.2) > 0.3 ? col[0] : Math.sin(t + i * 0.55 + 1.2) < -0.4 ? col[2] : col[1];
      p.px(x + i, y + j + dy, j === h - 1 && h > 2 ? col[2] : shade);
    }
    if (i === len - 1 || (k > 0.75 && i % 3 === 0)) p.px(x + i + 1, y + dy + Math.floor(h / 2), col[2]); // frayed tip
  }
}

const RED: [number, number, number] = [0xa83232, 0x7e2424, 0x521616];
const BLUE: [number, number, number] = [0x3f5f9a, 0x2c4474, 0x1c2c4c];
const BLACK: [number, number, number] = [0x4a4448, 0x34303a, 0x201c24];
const RAG: [number, number, number] = [0x8a3a2a, 0x6a2a20, 0x401a14];

// ---- weapon rack ---------------------------------------------------------------------------------------
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dith = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];
/** Colour for a continuous shade `v` (0 = darkest step) with the fraction between two steps dithered. */
const step = (pal: number[], v: number, x: number, y: number) => {
  const c = Math.max(0, Math.min(pal.length - 1, v)), i = Math.floor(c);
  return pal[Math.min(pal.length - 1, c - i > dith(x, y) ? i + 1 : i)];
};
const RW = [0x24160c, 0x3e2816, 0x5a3c22, 0x7a5634, 0x9a7448]; // weathered wood
const RI = [0x23262b, 0x3f454d, 0x67707a, 0x98a2ac, 0xd2d9df]; // iron
const RG = [0x5a3a10, 0x8a6020, 0xc0902e, 0xe8c25a];           // brass
const RL = [0x2a1a12, 0x4a2c1a, 0x6e4426];                     // leather grips

function weaponRack(p: Pen, f: number, pennants: boolean) {
  const t = (f / N) * Math.PI * 2;
  const yb = (x: number) => 58 + (x - 10) * 0.5; // the rack runs along a world axis: down-right on screen
  const grain = (x: number, y: number) => (hash(x, y >> 1, 3) - 0.5) * 0.7;
  /** A beam along the rack, `off` px above the ground line, lit on top. */
  const beam = (x0: number, x1: number, off: number, th: number) => {
    for (let x = x0; x <= x1; x++) for (let j = 0; j < th; j++) {
      const y = Math.round(yb(x) - off) + j;
      p.px(x, y, step(RW, 3.6 - j * (3 / Math.max(1, th - 1)) + grain(x, y), x, y));
    }
  };
  /** An upright post, lit from the left. */
  const post = (x: number, h: number, back = false) => {
    const y0 = Math.round(yb(x));
    for (let y = y0 - h; y <= y0; y++) for (let k = 0; k < 3; k++) p.px(x + k, y, step(RW, (back ? 1.6 : 3.2) - k * 1.1 + grain(x + k, y), x + k, y));
    for (let k = -1; k < 4; k++) p.px(x + k, y0 - h - 1, step(RW, back ? 1.8 : 3.8 - (k + 1) * 0.5, x + k, y0 - h)); // cap
  };
  const shaftUp = (x: number, y0: number, y1: number, lean: number, pal = RW, w = 2) => {
    for (let y = y1; y <= y0; y++) {
      const xx = Math.round(x + lean * (y0 - y) / (y0 - y1));
      for (let k = 0; k < w; k++) p.px(xx + k, y, step(pal, (w === 1 ? 2.6 : 3.3 - k * 1.6) + grain(xx, y) * 0.6, xx + k, y));
    }
  };
  const blade = (x: number, y0: number, y1: number, pal = RI) => { // two-tone blade with a dithered sheen, tip at y1
    for (let y = y1; y <= y0; y++) {
      const tip = y - y1 < 2;
      p.px(x, y, step(pal, 3.6 - (y - y1) / (y0 - y1) * 0.8, x, y));
      if (!tip) p.px(x + 1, y, step(pal, 1.7 + ((y * 3) % 7 === 0 ? 1 : 0), x + 1, y));
    }
    p.px(x, y0 - 2, pal[2]); // fuller notch
  };

  // back trestle legs and the top bar (behind the weapons)
  for (const x of [11, 43]) { const y0 = Math.round(yb(x)); for (let k = 0; k < 26; k++) { const xx = x + 4 - Math.round(k * 0.18), yy = y0 - 3 - k; p.px(xx, yy, step(RW, 1.4 + grain(xx, yy), xx, yy)); p.px(xx + 1, yy, RW[0]); } }
  post(11, 30, true); post(43, 30, true);
  beam(11, 45, 29, 3);

  // weapons resting against the bar: spear, sword, halberd, sword, axe
  const base = (x: number) => Math.round(yb(x) - 6);
  { // spear
    const x = 16, top = base(x) - 46;
    shaftUp(x, base(x), top, 1, RW, 1);
    for (let j = 0; j < 7; j++) { const h = j < 3 ? j * 0.5 : (6 - j) * 0.45 + 0.4; for (let i = -Math.round(h); i <= Math.round(h); i++) p.px(x + 1 + i, top - 7 + j, step(RI, 2.8 - i * 1.2, x + i, top + j)); }
    p.px(x + 1, top, RL[2]); p.px(x, top + 1, RL[1]); p.px(x + 1, top + 1, RL[2]);
    if (pennants) pennant(p, x + 2, top + 2, 9, 4, t, RED);
  }
  for (const [x, pal] of [[22, RI], [34, RI]] as const) { // swords standing point-down, hilt above the bar
    const b0 = base(x), guard = b0 - 27;
    blade(x, b0 - 1, guard + 1, pal as number[]);
    for (let i = -2; i <= 3; i++) p.px(x + i, guard, step(x === 22 ? RG : RI, 3 - Math.abs(i - 0.5) * 0.6, x + i, guard)); // cross-guard
    for (let y = guard - 5; y < guard; y++) { p.px(x, y, step(RL, 2 - ((y & 1) ? 0.8 : 0), x, y)); p.px(x + 1, y, RL[0]); } // wrapped grip
    p.px(x, guard - 6, x === 22 ? RG[3] : RI[4]); p.px(x + 1, guard - 6, x === 22 ? RG[1] : RI[2]); p.px(x, guard - 7, x === 22 ? RG[2] : RI[3]); // pommel
  }
  { // halberd
    const x = 28, top = base(x) - 48;
    shaftUp(x, base(x), top, 0, RW, 2);
    for (let j = 0; j < 4; j++) p.px(x + 1, top - 4 + j, step(RI, 3.5 - j * 0.4, x, top + j)); // spike
    for (let j = 0; j < 8; j++) { const w = j < 2 ? 2 + j : j < 6 ? 4 + (j > 3 ? 1 : 0) : 7 - j; for (let i = 0; i < w; i++) p.px(x + 2 + i, top + 2 + j, step(RI, 3.6 - i * 0.55 - j * 0.12, x + i, top + j)); }
    for (let j = 0; j < 3; j++) p.px(x - 1 - j, top + 4 + j, RI[2 - Math.min(1, j)]); // back hook
    if (pennants) pennant(p, x + 2, top + 12, 8, 3, t + 1.9, BLUE);
  }
  { // axe
    const x = 39, top = base(x) - 34;
    shaftUp(x, base(x), top, 0, RW, 2);
    for (let j = 0; j < 9; j++) { const w = j < 1 || j > 7 ? 3 : j < 3 || j > 5 ? 4 : 5; for (let i = 0; i < w; i++) p.px(x + 2 + i, top + j, step(RI, (i === w - 1 ? 4 : 3.1) - j * 0.18 - (i < 1 ? 1 : 0), x + i, top + j)); }
    p.px(x, top - 1, RW[3]); p.px(x + 1, top - 1, RW[2]);
  }

  // front rail, front posts and the foot plank cover the weapons' lower ends
  beam(11, 45, 9, 3);
  post(9, 30); post(41, 30);
  beam(8, 46, 1, 2);
  for (const x of [17, 29]) { const y = Math.round(yb(x) - 8); p.px(x, y, RI[1]); p.px(x + 1, y, RI[3]); } // iron pegs

  // round shield leaning on the right post: painted planks, iron rim and boss
  const sx = 46, sy = Math.round(yb(46) - 9);
  for (let y = sy - 8; y <= sy + 8; y++) for (let x = sx - 7; x <= sx + 6; x++) {
    const dx = (x - sx + 0.3) / 6.4, dy = (y - sy) / 8.2, d = dx * dx + dy * dy;
    if (d > 1) continue;
    const lit = 2.2 - dx * 1.1 - dy * 0.7;
    if (d > 0.74) p.px(x, y, step(RI, lit + 0.6, x, y));
    else {
      const half = (x - sx) * 0.4 + (y - sy) * 0.9 < 0; // quartered: faded red and bare wood
      p.px(x, y, half ? step([0x3a0e0a, 0x5e1a12, 0x86281a, 0xa8402a], lit, x, y) : step(RW, lit + 0.4, x, y));
      if ((x - sx + 20) % 3 === 0 && !half) p.px(x, y, RW[1]); // plank seams
    }
  }
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) p.px(sx + i, sy + j, step(RI, 3 - i - j, sx + i, sy + j));
  p.px(sx - 1, sy - 1, RI[4]);
}

// ---- the props ------------------------------------------------------------------------------------------
const N = 6; // animation frames per prop

function makeTextures(scene: Phaser.Scene) {
  // Weapon racks (smithy and camps): iso-facing trestle rack with spears, swords, a halberd and an axe; the camp
  // version flies two small pennants. Bonfire-style pixel art: flat colour steps, ordered dithering, dark outline.
  sheet(scene, "wp_spear_rack", 56, 80, N, (p, f) => weaponRack(p, f, true), 0.45);
  sheet(scene, "wp_venom_caps", VENOM_W, VENOM_H, N, venomCaps, 0.4);
  sheet(scene, "wp_ice_spikes", ICE_W, ICE_H, N, iceSpikes, 0.45);
  sheet(scene, "wp_ember_vent", VENT_W, VENT_H, N, emberVent, 0.4);
  sheet(scene, "wp_storm_stone", STORM_W, STORM_H, N, stormStone, 0.5);
  sheet(scene, "wp_weapon_rack", 56, 80, 1, (p, f) => weaponRack(p, f, false), 0.45);

  // War pennant: a tall pole with a long streamer flying right
  const warPole = (key: string, col: [number, number, number], torn: boolean) => sheet(scene, key, 44, 100, N, (p, f) => {
    const t = (f / N) * Math.PI * 2;
    p.shaft(6, 99, 6, 6, 3, torn ? OLDWOOD : WOOD);
    p.rect(5, 2, 5, 4, 0xc8a050); p.px(6, 2, 0xf0d890); p.rect(6, 5, 3, 1, 0x8a6a30); // finial
    for (let i = 0; i < 34; i++) {
      const k = i / 34, hgt = Math.round(16 * (1 - k * 0.55));
      const dy = Math.round(Math.sin(t + i * 0.32) * (0.5 + k * 3));
      for (let j = 0; j < hgt; j++) {
        if (torn && k > 0.4 && ((i * 13 + j * 7) % 17 === 0 || (j > hgt - 3 && (i % 4 === 1)))) continue; // holes and ragged edge
        const lit = Math.sin(t + i * 0.32 + 1.3);
        const c = j === 0 ? col[0] : j === hgt - 1 ? col[2] : lit > 0.35 ? col[0] : lit < -0.45 ? col[2] : col[1];
        p.px(9 + i, 8 + j + dy, c);
      }
      if (!torn && i > 3 && i < 30 && i % 9 === 4) for (let j = 4; j < hgt - 4; j++) p.px(9 + i, 8 + j + dy, 0xc8a050); // gold stripe
    }
    if (!torn) p.rect(9, 7, 2, 18, 0x8a6a30);
  }, 0.45);
  warPole("wp_pennant_red", RED, false);
  warPole("wp_pennant_black", BLACK, true);

  // Training dummy: straw body on a post, sways when the wind pushes it
  sheet(scene, "wp_dummy", 34, 58, N, (p, f) => {
    const s = sway(f, N) * 1.4;
    const X = (x: number, y: number) => x + s * Math.max(0, (44 - y) / 34);
    p.shaft(16, 57, X(16, 8), 8, 3);
    p.rect(12, 54, 11, 2, WOOD[2]); p.rect(12, 54, 11, 1, WOOD[1]); // foot plank
    // straw body
    for (let y = 18; y < 42; y++) for (let x = 8; x < 27; x++) {
      const dx = (x - 17) / 9, dy = (y - 30) / 12;
      if (dx * dx + dy * dy > 1) continue;
      const c = dx < -0.4 || dy < -0.6 ? STRAW[0] : dx > 0.45 || dy > 0.6 ? STRAW[2] : STRAW[1];
      p.px(X(x, y), y, (x * 3 + y * 5) % 7 === 0 ? STRAW[2] : c);
    }
    for (const y of [24, 35]) for (let x = 9; x < 26; x++) p.px(X(x, y), y, x < 13 ? 0x8a7448 : ROPE); // rope bands
    // cross-arm with straw tufts
    for (let x = 3; x < 32; x++) { p.px(X(x, 21), 21, WOOD[0]); p.px(X(x, 22), 22, WOOD[2]); }
    for (const [x, d] of [[2, -1], [31, 1]] as const) for (let k = 0; k < 3; k++) p.px(X(x + d * (k % 2), 19 + k * 2), 19 + k * 2, STRAW[k]);
    // sack head with stitched face and a dented pot helm
    for (let y = 8; y < 18; y++) for (let x = 12; x < 22; x++) {
      const dx = (x - 16.5) / 5, dy = (y - 13) / 5;
      if (dx * dx + dy * dy <= 1) p.px(X(x, y), y, dx < -0.3 ? 0xcab890 : dx > 0.4 ? 0x8a7a58 : 0xab9a70);
    }
    for (const x of [14, 18]) { p.px(X(x, 13), 13, 0x2a1f18); p.px(X(x + 1, 14), 14, 0x2a1f18); p.px(X(x + 1, 13), 13, 0x2a1f18); p.px(X(x, 14), 14, 0x2a1f18); }
    for (let x = 14; x < 20; x++) p.px(X(x, 16), 16, x % 2 ? 0x3a2a1e : 0x6a5a3e);
    for (let y = 5; y < 10; y++) for (let x = 11; x < 23; x++) {
      if (y === 5 && (x < 13 || x > 20)) continue;
      p.px(X(x, y), y, y === 9 ? IRON.lo : x < 14 ? IRON.hi : x > 19 ? IRON.lo : IRON.mid);
    }
    p.px(X(17, 6), 6, 0x55595f); p.px(X(18, 7), 7, 0x55595f); // dent
  });

  // Lantern pole: crooked arm, chain and a swinging lantern
  sheet(scene, "wp_lantern_pole", 32, 90, N, (p, f) => {
    const s = sway(f, N);
    p.shaft(6, 89, 6, 5, 3);
    p.shaft(7, 7, 24, 7, 1); p.line(7, 8, 24, 8, WOOD[2]);
    p.line(9, 17, 17, 9, WOOD[1]); p.line(10, 17, 18, 9, WOOD[2]); // brace
    p.rect(5, 3, 5, 3, WOOD[2]); p.px(6, 3, WOOD[0]);
    const cx = 22 + Math.round(s * 2), top = 13;
    p.line(22, 9, cx, top - 1, 0x3a3a3e); // chain
    for (let y = 9; y < top; y += 2) p.px(22 + (cx - 22) * (y - 9) / (top - 9), y, 0x6a6a70);
    // lantern body
    p.rect(cx - 3, top, 7, 2, 0x2a2a2e); p.px(cx - 2, top, 0x55555c);
    for (let y = top + 2; y < top + 11; y++) for (let x = cx - 3; x <= cx + 3; x++) {
      const edge = x === cx - 3 || x === cx + 3;
      p.px(x, y, edge ? (x < cx ? 0x4a4a50 : 0x1e1e22) : y < top + 5 ? 0xfff0b8 : y < top + 8 ? 0xffc860 : 0xf09030);
    }
    p.line(cx - 2, top + 6, cx + 2, top + 6, 0x2a2a2e); p.px(cx, top + 4, 0xffffff);
    p.rect(cx - 2, top + 11, 5, 1, 0x2a2a2e); p.px(cx, top + 12, 0x2a2a2e);
  }, 0.4);

  // Bandit skull pike: sharpened pole, a skull, a red rag knotted under it
  sheet(scene, "wp_skull_pike", 26, 72, N, (p, f) => {
    const t = (f / N) * Math.PI * 2;
    p.shaft(7, 71, 7, 4, 2, OLDWOOD);
    p.px(7, 2, OLDWOOD[0]); p.px(7, 3, OLDWOOD[0]); p.px(8, 3, OLDWOOD[2]);
    // skull
    for (let y = 7; y < 16; y++) for (let x = 3; x < 13; x++) {
      const dx = (x - 7.5) / 4.6, dy = (y - 11) / 4.4;
      if (dx * dx + dy * dy > 1) continue;
      p.px(x, y, dx < -0.35 || dy < -0.55 ? BONE.hi : dx > 0.45 ? BONE.lo : BONE.mid);
    }
    for (let x = 5; x < 11; x++) p.px(x, 16, x % 2 ? BONE.lo : BONE.mid); // teeth
    p.rect(5, 11, 2, 2, 0x1a1210); p.rect(9, 11, 2, 2, 0x1a1210); p.px(8, 14, 0x3a2a20); // sockets, nose
    p.px(6, 8, 0xf4eedc); p.px(5, 9, 0xf4eedc);
    // rag
    for (let i = 0; i < 13; i++) {
      const dy = Math.round(Math.sin(t + i * 0.5) * (0.4 + i * 0.16)), h = Math.max(2, 7 - Math.floor(i / 2.5));
      for (let j = 0; j < h; j++) if (!(i > 7 && (i + j) % 4 === 0)) p.px(9 + i, 19 + j + dy, j === 0 ? RAG[0] : j === h - 1 ? RAG[2] : RAG[1]);
    }
    p.rect(6, 19, 4, 2, RAG[2]);
  }, 0.4);

  // Fishing-net rack: two posts, a sagging net and fish on strings
  sheet(scene, "wp_net_rack", 54, 50, N, (p, f) => {
    const s = sway(f, N);
    p.shaft(3, 49, 3, 5, 2, OLDWOOD); p.shaft(48, 49, 48, 5, 2, OLDWOOD);
    const sag = (x: number) => 8 + Math.round(3 * Math.sin(((x - 4) / 44) * Math.PI));
    for (let x = 4; x < 48; x++) p.px(x, sag(x), ROPE);
    // net: a diamond mesh hanging from the rope, its lower edge swaying
    for (let x = 5; x < 47; x++) for (let y = sag(x) + 1; y < 36; y++) {
      const k = (y - sag(x)) / (36 - sag(x)), xx = x + s * 2 * k;
      if ((x + y) % 4 === 0 || (x - y + 400) % 4 === 0) p.px(xx, y, k > 0.85 ? 0x5a5040 : 0x7a6c50, 0.9);
    }
    for (let x = 5; x < 47; x += 3) p.px(x + s * 2, 36, 0x9a8a60); // floats along the bottom
    // fish
    for (const [fx, ph] of [[14, 0], [26, 1.4], [38, 2.6]] as const) {
      const sw = Math.round(Math.sin((f / N) * Math.PI * 2 + ph) * 1.5), top = sag(fx) + 1;
      p.line(fx, top, fx + sw, top + 4, 0x4a4030);
      const x0 = fx + sw;
      for (let y = 0; y < 9; y++) {
        const half = y < 2 ? 1 : y < 6 ? 2 : y === 6 ? 1 : 0;
        for (let i = -half; i <= half; i++) p.px(x0 + i, top + 5 + y, i < 0 ? 0xc4d0d6 : i > 0 ? 0x5e6c74 : 0x92a2aa);
      }
      p.px(x0 - 1, top + 14, 0x5e6c74); p.px(x0 + 1, top + 14, 0x5e6c74); p.px(x0, top + 6, 0x101418); // tail, eye
    }
  }, 0.4);

  // Broken spears stuck in the ground, a rope end on one, a shield half buried
  sheet(scene, "wp_spears_ground", 40, 54, N, (p, f) => {
    const t = (f / N) * Math.PI * 2;
    p.shaft(9, 52, 15, 12, 2, OLDWOOD); spearHead(p, 16, 5);
    p.shaft(22, 52, 18, 26, 2, OLDWOOD); p.px(17, 25, OLDWOOD[0]); p.px(19, 24, OLDWOOD[2]); // snapped
    p.shaft(30, 52, 34, 18, 2, OLDWOOD); spearHead(p, 35, 11);
    // a frayed rope binding swinging from the snapped shaft (no cloth: no flags where the dead march)
    for (let i = 0; i < 6; i++) p.px(19 + Math.round(Math.sin(t) * i * 0.25), 27 + i, i % 2 ? ROPE : 0x6a5a3a);
    // round shield leaning at the foot
    for (let y = 40; y < 53; y++) for (let x = 17; x < 31; x++) {
      const dx = (x - 24) / 7, dy = (y - 47) / 6.2;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      p.px(x, y, d > 0.72 ? (dx < 0 ? 0x8a8e94 : 0x4a4e54) : (x + y) % 5 === 0 ? 0x4a3420 : dx < -0.2 && dy < 0 ? 0x7a5634 : 0x5e4028);
    }
    p.rect(23, 46, 3, 2, IRON.mid); p.px(23, 46, IRON.hi);
  }, 0.5);
}

/** Redfang watchtower (shared/bandits.ts): four leaning legs, braces, a ladder, a railed platform under a thatch roof, a red rag. */
function watchtower(scene: Phaser.Scene) {
  sheet(scene, "wp_watchtower", 60, 126, N, (p, f) => {
    const t = (f / N) * Math.PI * 2;
    const deck = 126 - 57; // platform top: PERCH_LIFT (38 world px) above the foot
    // back legs (darker), then the front ones leaning in
    p.shaft(18, 118, 20, deck - 2, 2, OLDWOOD); p.shaft(40, 118, 38, deck - 2, 2, OLDWOOD);
    p.shaft(7, 125, 13, deck, 3); p.shaft(50, 125, 44, deck, 3);
    // cross braces and lashings
    p.line(10, 120, 45, deck + 12, WOOD[2]); p.line(10, 119, 45, deck + 11, WOOD[1]);
    p.line(48, 120, 13, deck + 12, WOOD[2]); p.line(48, 119, 13, deck + 11, WOOD[1]);
    p.shaft(9, 100, 48, 100, 2); p.line(9, 101, 48, 101, WOOD[2]);
    for (const [x, y] of [[9, 100], [47, 100], [12, deck + 4], [45, deck + 4]]) { p.px(x, y + 1, ROPE); p.px(x + 1, y + 2, ROPE); }
    // ladder up the front
    p.shaft(24, 125, 25, deck, 1); p.shaft(33, 125, 32, deck, 1);
    for (let y = deck + 5; y < 124; y += 6) { p.line(25, y, 32, y, WOOD[0]); p.line(25, y + 1, 32, y + 1, WOOD[2]); }
    // platform deck
    p.rect(4, deck - 5, 52, 6, WOOD[1]);
    for (let x = 4; x < 56; x += 5) p.line(x, deck - 5, x, deck, WOOD[2]);
    p.line(4, deck - 5, 55, deck - 5, WOOD[0]); p.line(4, deck + 1, 55, deck + 1, 0x2a1d13);
    // railing
    for (const x of [5, 29, 53]) p.shaft(x, deck - 5, x, deck - 20, 2);
    p.shaft(5, deck - 20, 54, deck - 20, 2); p.line(6, deck - 13, 53, deck - 13, WOOD[1]);
    // roof posts and a ragged thatch roof
    p.shaft(6, deck - 20, 8, 24, 2, OLDWOOD); p.shaft(52, deck - 20, 50, 24, 2, OLDWOOD);
    for (let y = 4; y < 25; y++) {
      const half = 6 + (y - 4) * 1.25;
      for (let x = Math.round(30 - half); x <= Math.round(30 + half); x++) {
        const edge = y > 21 && (x * 7 + y) % 3 === 0; // frayed eave
        if (edge) continue;
        const k = (x - (30 - half)) / (half * 2);
        p.px(x, y, (x + y * 3) % 7 === 0 ? STRAW[2] : k < 0.35 ? STRAW[0] : k > 0.75 ? STRAW[2] : STRAW[1]);
      }
    }
    p.line(24, 3, 36, 3, STRAW[2]); p.px(30, 2, OLDWOOD[1]); p.px(30, 1, OLDWOOD[1]);
    // the alarm horn hanging from a post
    p.line(50, deck - 22, 51, deck - 18, ROPE);
    for (let i = 0; i < 7; i++) p.px(51 + i * 0.6, deck - 17 + i * 0.4, i < 2 ? BONE.lo : i < 5 ? BONE.mid : BONE.hi);
    p.px(55, deck - 15, 0x2a1d13);
    // red rag flying from the roof
    pennant(p, 4, 20, 12, 5, t, RAG);
  }, 0.55);
}


// ---- the wreck of the Grey Heron (Heronwreck Strand, blob quest chain) -------------------------------------
const SAIL = [0x3a3226, 0x5e5240, 0x837458, 0xa8987a, 0xc8baa0];     // salt-stained canvas
const HULL = [0x1a120c, 0x2e2016, 0x463222, 0x5e4630, 0x7a5e42, 0x96785a]; // sea-bleached planks
const DECK = [0x2a1e14, 0x463424, 0x624a34, 0x7e6248];
const WEED = [0x16200f, 0x223218, 0x34481f];
const OOZE = [0x2a0e20, 0x5a1440, 0x9b2c6b, 0xe26fa8, 0xffc4e2];
const GLOAM_GREEN = [0x1e3a18, 0x3a6a2a, 0x6aa848];
const wHash = (x: number, y: number, s: number) => { let h = Math.imul(x * 73 + 11 + s * 977, 374761393) ^ Math.imul(y + 5 + s * 131, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const wNoise = (x: number, y: number, s: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = wHash(ix, iy, s), b = wHash(ix + 1, iy, s), c = wHash(ix, iy + 1, s), d = wHash(ix + 1, iy + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};
export const WRECK_W = 300, WRECK_H = 200;

/**
 * A merchant cog lying on the sand, bow raised to the upper left, her stern smashed into the surf at the lower right.
 * The hull runs along the world x axis, so in the iso view she lies along the shore. Planked side lit from the top
 * left with sea-bleached strakes, weed and barnacles at the waterline, a sliver of broken deck, a breach in her side
 * showing the ribs and the hold (where the Brood Heart glows), a snapped mast with a torn sail flapping on its yard.
 */
function shipwreck(p: Pen, f: number) {
  const t = (f / N) * Math.PI * 2;
  // the breach sits right above the sprite's foot (x 150, bottom), so the Brood Heart drawn there stands in it
  const X0 = 14, X1 = 262;                  // bow tip .. smashed stern
  const keel = (u: number) => 126 + u * 112 + Math.sin(u * Math.PI) * 4 - (u > 0.55 ? (u - 0.55) * 95 : 0)
    - (u < 0.16 ? Math.pow((0.16 - u) / 0.16, 1.6) * 44 : 0); // keel line, bow up (curving up into the stem), stern down in the surf
  const side = (u: number) => (u < 0.1 ? 0.35 + 6.5 * u : 1) * (50 + 34 * Math.pow(1 - u, 2)); // side height, the bow rises high
  const gun = (u: number) => keel(u) - side(u) - (u < 0.12 ? (0.12 - u) * 90 : 0);  // gunwale with the bow's sheer
  const deckW = (u: number) => Math.max(0, 26 * Math.pow(Math.sin(Math.min(1, u * 1.15) * Math.PI), 0.7) - 2); // she heels toward us: we see her deck
  // breach in her side (the hold), with a ragged edge
  const breach = (x: number, y: number, u: number) => {
    const v = (y - gun(u)) / (keel(u) - gun(u));
    const cu = (u - 0.55) / 0.12, cv = (v - 0.56) / 0.4;
    return cu * cu + cv * cv < 0.75 + 0.5 * wNoise(x * 0.25, y * 0.25, 3);
  };
  // the stern is smashed: planks end raggedly
  const smashed = (x: number, y: number, u: number) => u > 0.86 && (u - 0.86) * 9 > 0.25 + 0.75 * wNoise(x * 0.12, y * 0.6, 4) + ((y >> 2) % 2) * 0.12;

  // --- her shadow on the sand ---
  for (let x = X0 - 4; x <= X1 - 4; x++) {
    const u = Math.min(1, Math.max(0, (x - X0) / (X1 - X0))), k = keel(u);
    for (let j = -2; j < 9; j++) if (wHash(x, j, 24) < 0.92) p.px(x + 4, k + j, 0x0e0a08, j < 3 ? 0.42 : 0.42 - (j - 3) * 0.06);
  }
  // --- snapped mast behind the hull, a yard hanging askew with a torn sail ---
  const mu = 0.34, mx = X0 + (X1 - X0) * mu, mBase = gun(mu) - deckW(mu) * 0.5;
  const mTop = 18, lean = -10;
  const mastX = (y: number) => mx + lean * (mBase - y) / (mBase - mTop);
  for (let y = mTop; y < mBase; y++) for (let k = 0; k < 5; k++) p.px(mastX(y) - 2 + k, y, k === 0 ? HULL[5] : k < 2 ? HULL[4] : k < 4 ? HULL[3] : HULL[1]);
  for (let k = 0; k < 6; k++) p.px(mastX(mTop) - 2 + k, mTop - 1 - (k % 3 === 1 ? 3 : k % 2), HULL[k < 3 ? 4 : 2]); // splintered top
  for (const y of [40, 66, 92]) { p.line(mastX(y) - 3, y, mastX(y) + 3, y, ROPE); p.line(mastX(y) - 3, y + 1, mastX(y) + 3, y + 1, 0x6a5a3a); } // iron bands, rope lashings
  // a gull keeps watch on the stump
  { const gx = mastX(mTop) - 1, gy = mTop - 4, bob = f % 3 === 0 ? 0 : 0;
    p.rect(gx - 3, gy - 3 + bob, 7, 3, 0xe8e4dc); p.rect(gx - 2, gy - 6 + bob, 3, 3, 0xf4f0ea); p.px(gx - 3, gy - 5 + bob, 0xe0a030);
    p.px(gx - 1, gy - 5 + bob, 0x101010); p.rect(gx + 1, gy - 3 + bob, 4, 1, 0x7a7e86); p.px(gx + 4, gy - 2 + bob, 0x5a5e66); }
  // yard: hangs from one rope, tilted, swinging a little
  const sw = Math.sin(t) * 1.5;
  const yA = { x: mastX(44) - 34, y: 36 + sw }, yB = { x: mastX(44) + 46, y: 58 - sw };
  p.line(mastX(30), 30, yA.x + 8, yA.y, ROPE); p.line(mastX(38), 38, yB.x - 6, yB.y, ROPE);
  // sail: hangs from the yard, torn, the loose end flapping
  for (let i = 0; i <= 80; i++) {
    const k = i / 80, tx = yA.x + (yB.x - yA.x) * k, ty = yA.y + (yB.y - yA.y) * k;
    const len = 26 + 34 * Math.sin(k * Math.PI * 0.9) * (0.6 + 0.4 * wNoise(i * 0.3, 0, 7)) - (k > 0.7 ? (k - 0.7) * 60 : 0);
    for (let j = 2; j < len; j++) {
      const fl = Math.sin(t + k * 4 + j * 0.08) * (j / 60) * 4, x = tx + fl + j * 0.12, y = ty + j;
      const hole = wNoise(x * 0.18, j * 0.18, 8) > 0.72 && j > 6;
      if (hole) continue;
      const fold = Math.sin(k * 22 + t * 0.5 + j * 0.02);
      let lv = 2.6 + fold * 0.9 - j / len * 1.2 - k * 0.6;
      if (j > len - 3) lv -= 1.2; // ragged dark hem
      const c = step(SAIL, lv, Math.round(x), y);
      p.px(x, y, wHash(Math.round(x), y, 9) < 0.04 ? 0x4a3e2c : c); // salt stains
    }
  }
  for (let i = 0; i <= 80; i++) { const k = i / 80; p.px(yA.x + (yB.x - yA.x) * k, yA.y + (yB.y - yA.y) * k, HULL[4]); p.px(yA.x + (yB.x - yA.x) * k, yA.y + (yB.y - yA.y) * k + 1, HULL[2]); }
  // rigging: slack stays to the bow and to the stern
  const sag = (x0: number, y0: number, x1: number, y1: number, d: number) => { for (let i = 0; i <= 120; i++) { const k = i / 120; p.px(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * d, 0x4a3e2c); } };
  sag(mastX(24), 24, X0 + 6, gun(0.02) - 12, 10);
  sag(mastX(50), 50, X0 + (X1 - X0) * 0.8, gun(0.8) - 4, 16 + Math.sin(t) * 2);

  // --- deck (seen past the gunwale, tilted toward us) ---
  for (let x = X0; x <= X1; x++) {
    const u = (x - X0) / (X1 - X0), g = gun(u), dw = deckW(u);
    for (let y = Math.round(g - dw); y < g; y++) {
      if (u > 0.84 && wNoise(x * 0.2, y * 0.3, 11) > 0.45) continue; // stern deck is gone
      if (u > 0.55 && u < 0.72 && y > g - dw * 0.7 && wNoise(x * 0.15, y * 0.3, 12) > 0.5) { p.px(x, y, HULL[0]); continue; } // stove-in deck
      const seam = Math.round(y - (g - dw)) % 4 === 0, butt = (x + Math.floor((y - g) / 4) * 13) % 23 === 0;
      p.px(x, y, seam || butt ? DECK[0] : step(DECK, 2.2 - (g - y) / Math.max(1, dw) * 0.8 + (wNoise(x * 0.3, y, 13) - 0.5), x, y));
    }
    // a cargo hatch, its cover gone: a dark square hole in the deck
    if (u > 0.2 && u < 0.27 && dw > 8) for (let y = Math.round(g - dw * 0.75); y < g - dw * 0.25; y++) p.px(x, y, u < 0.205 || y < g - dw * 0.72 ? DECK[3] : HULL[0]);
    // the far bulwark along the top of the deck, broken in places
    if (dw > 2 && u < 0.84 && wNoise(x * 0.09, 0, 23) > 0.3) { const y = Math.round(g - dw); p.px(x, y - 2, HULL[4]); p.px(x, y - 1, HULL[3]); p.px(x, y, HULL[1]); if (x % 11 === 0) for (let k = 0; k < 4; k++) p.px(x, y - 2 - k, HULL[k < 2 ? 3 : 4]); }
  }
  // --- hull side ---
  for (let x = X0; x <= X1; x++) {
    const u = (x - X0) / (X1 - X0), g = gun(u), kl = keel(u);
    for (let y = Math.round(g); y <= kl; y++) {
      if (smashed(x, y, u)) continue;
      const v = (y - g) / Math.max(1, kl - g);
      if (breach(x, y, u)) {
        // the hold: dark inside, ribs, and the Gloam's ooze glowing at the bottom
        const ribs = (x + Math.round(v * 4)) % 9 < 3;
        const glow = v > 0.55 ? (v - 0.55) * 2.2 * (0.75 + 0.25 * Math.sin(t + x * 0.05)) : 0;
        if (ribs) p.px(x, y, (x + Math.round(v * 4)) % 9 === 0 ? HULL[3] : HULL[1]);
        else if (glow > 0.25) p.px(x, y, step(OOZE, glow * 3.2 + wNoise(x * 0.2, y * 0.2 + t, 14) - 0.5, x, y));
        else p.px(x, y, (x + y) % 7 === 0 ? HULL[1] : HULL[0]);
        continue;
      }
      const strake = Math.floor(v * 9), sv = v * 9 - strake;
      let lv = 4.6 - Math.pow(v, 0.8) * 3.4 + (v < 0.12 ? 0.3 : 0) - (u > 0.8 ? (u - 0.8) * 4 : 0) + (wNoise(x * 0.08, strake * 3, 15) - 0.5) * 0.9 - (u < 0.06 ? 0.6 : 0);
      if (sv < 0.14) lv = 0.6;                                   // seam between strakes
      else if (sv > 0.82) lv -= 0.7;                             // underside of each plank
      if ((x + strake * 31) % 37 === 0) lv = 0.5;                 // butt joints
      let c = step(HULL, lv, x, y);
      if (v > 0.74 && wNoise(x * 0.15, y * 0.4, 16) > 0.5 - (v - 0.74) * 1.4) c = step(WEED, (wNoise(x * 0.3, y * 0.3, 17)) * 3, x, y); // weed at the waterline
      if (v > 0.7 && wHash(x, y, 18) < 0.018) c = BONE.lo;      // barnacles
      if (v > 0.8) c = step(HULL, Math.min(lv, 1.6) - (v - 0.8) * 3, x, y) === HULL[0] && wHash(x, y, 25) < 0.5 ? HULL[0] : c; // the bilge turns under, into shadow
      if (wHash(x >> 1, y >> 2, 19) < 0.012) c = 0x6a3a22;      // rust weeping from the nails
      p.px(x, y, c);
    }
    // gunwale rail
    if (!smashed(x, Math.round(g), u) && !(u > 0.86 && wNoise(x * 0.2, 0, 20) > 0.5)) { p.px(x, g - 1, HULL[5]); p.px(x, g, HULL[4]); p.px(x, g + 1, HULL[2]); }
  }
  // breach edge: splintered plank ends around the hole
  for (let x = X0; x <= X1; x++) {
    const u = (x - X0) / (X1 - X0), g = gun(u), kl = keel(u);
    for (let y = Math.round(g); y <= kl; y++) {
      if (!breach(x, y, u) || breach(x, y - 1, u) && breach(x - 1, y, u) && breach(x + 1, y, u) && breach(x, y + 1, u)) continue;
      p.px(x, y, HULL[5]);
      if (wHash(x, y, 21) < 0.25) p.px(x + 1, y + (y > (g + kl) / 2 ? 2 : -2), HULL[4]);
    }
  }
  // ooze spilling out of the breach onto the sand, a pink drip pulsing
  for (let i = 0; i < 30; i++) {
    const u = 0.5 + i * 0.0035, x = X0 + (X1 - X0) * u, y0 = keel(u) - 6;
    const len = 4 + Math.round(6 * wHash(i, 0, 22) + (i % 5 === 2 ? 1 + Math.sin(t) * 2 : 0));
    for (let j = 0; j < len; j++) p.px(x, y0 + j, j === len - 1 ? GLOAM_GREEN[0] : step(GLOAM_GREEN, 2.4 - j / len * 1.6, Math.round(x), y0 + j));
  }
  // bowsprit and figurehead stump
  p.shaft(X0 + 2, gun(0.01) + 2, X0 - 10, gun(0) - 26, 3, OLDWOOD);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 6; x++) if ((x - 2.5) ** 2 / 9 + (y - 4) ** 2 / 16 < 1) p.px(X0 + 1 + x, gun(0.01) + 4 + y, x < 2 ? HULL[4] : HULL[2]); // the heron, worn to a lump
  // broken stern timbers sticking up out of the surf
  for (const [x, h] of [[240, 26], [250, 18], [259, 30]] as const) { const u = (x - X0) / (X1 - X0); p.shaft(x, keel(u), x + 3, keel(u) - h, 2, HULL.slice(2, 5) as [number, number, number]); }
}

// ---- placement -------------------------------------------------------------------------------------------
type Kind = "wp_hollow_throne" | "wp_crownstone0" | "wp_crownstone1" | "wp_crownstone2" | "wp_shipwreck" | "wp_spear_rack" | "wp_pennant_red" | "wp_pennant_black" | "wp_dummy" | "wp_lantern_pole" | "wp_skull_pike" | "wp_net_rack" | "wp_spears_ground" | "wp_watchtower"
  | "wp_venom_caps" | "wp_ice_spikes" | "wp_ember_vent" | "wp_storm_stone";
interface Spot { kind: Kind; x: number; y: number; flip?: boolean }

const hash = (x: number, y: number, s: number) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const BAD_GROUND = new Set<number>([T.WATER, T.COBBLE, T.BRIDGE, T.CROPS, T.FIELD]);

/** Free tile for a standing prop: nothing on it or right around it, not on a road or in water, away from NPCs and chests. */
function free(tx: number, ty: number, taken: Spot[], gap: number): boolean {
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const o = OBJECTS[ty + j]?.[tx + i], g = GROUND[ty + j]?.[tx + i];
    if (o === undefined || o !== EMPTY || (i === 0 && j === 0 && BAD_GROUND.has(g)) || g === T.WATER) return false;
  }
  const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
  if (taken.some((s) => Math.hypot(s.x - cx, s.y - cy) < gap * TILE)) return false;
  if (NPCS.some((n) => Math.hypot(n.x - cx, n.y - cy) < 2.5 * TILE)) return false;
  if (NPC_DECOR.some((d) => Math.hypot(d.x * TILE - cx, d.y * TILE - cy) < 2 * TILE)) return false;
  if (CHESTS.some((c) => Math.hypot(c.x - cx, c.y - cy) < 2 * TILE)) return false;
  if (SIGNPOSTS.some((s) => Math.hypot((s.x + 0.5) * TILE - cx, (s.y + 0.5) * TILE - cy) < 2 * TILE)) return false;
  if (SIEGE_SITES.some((s) => Math.abs(s.tx - tx) <= 9 && Math.abs(s.ty - ty) <= 4)) return false; // siege works
  return true;
}

/** Up to `n` spots for `kind` inside the named area (deterministic, same on every client). */
function scatter(out: Spot[], area: string, kind: Kind, n: number, gap = 4, near?: (tx: number, ty: number) => boolean) {
  const a = AREAS.find((r) => r.name === area);
  if (!a) return;
  let placed = 0;
  for (let k = 0; k < 400 && placed < n; k++) {
    const tx = a.x + Math.floor(hash(k, n, kind.length * 31 + area.length) * a.w), ty = a.y + Math.floor(hash(n, k, kind.length * 17 + area.length * 3) * a.h);
    if (!free(tx, ty, out, gap) || (near && !near(tx, ty))) continue;
    out.push({ kind, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, flip: hash(tx, ty, 5) < 0.5 && kind !== "wp_pennant_red" && kind !== "wp_pennant_black" && kind !== "wp_lantern_pole" });
    placed++;
  }
}

/** Within `r` tiles of a cobbled road (lantern poles line the roads). */
const byRoad = (r: number) => (tx: number, ty: number) => {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (GROUND[ty + j]?.[tx + i] === T.COBBLE) return true;
  return false;
};

function spots(): Spot[] {
  const out: Spot[] = [];
  // Oakvale: lantern poles along the roads, pennants, dummies to practise on (the smithy has its own weapon rack)
  scatter(out, "Oakvale", "wp_dummy", 2, 5, (tx, ty) => tx < VILLAGE.x0 + 9);
  scatter(out, "Oakvale", "wp_pennant_red", 2, 8);
  scatter(out, "Oakvale", "wp_lantern_pole", 6, 4, byRoad(1));
  // Hunter's Camp: a spear rack and a dummy
  scatter(out, "Hunter's Camp", "wp_spear_rack", 1, 3);
  scatter(out, "Hunter's Camp", "wp_dummy", 1, 3);
  // Skeleton lands (Watchtower, Keep, Barrows, Ruins): no flags or pennants, the dead don't camp. Their siege
  // works are in siegeArt.ts; only old broken spears lie around.
  scatter(out, "Old Watchtower", "wp_spears_ground", 2, 4);
  scatter(out, "Greywatch Keep", "wp_spears_ground", 4, 4);
  scatter(out, "Barrow Downs", "wp_spears_ground", 4, 6);
  scatter(out, "Old Ruins", "wp_spears_ground", 2, 5);
  // Redfang Hollow: skull pikes and the bandits' spear rack
  // the watchtowers first (fixed spots by the gates, manned by lookouts), so nothing else is put under them
  for (const [tx, ty] of REDFANG_TOWERS) out.push({ kind: "wp_watchtower", x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });
  scatter(out, "Redfang Hollow", "wp_skull_pike", 6, 3);
  scatter(out, "Redfang Hollow", "wp_spear_rack", 1, 4);
  // Heronwreck Strand: the Grey Heron (fixed spot, see WRECK in shared/map.ts)
  out.push({ kind: "wp_shipwreck", x: (WRECK.x + 0.5) * TILE, y: (WRECK.y + 0.6) * TILE });
  // The Hollow Throne: Ostrevar's throne on its dais, and a ring of crown-stones round the clearing (the three
  // ward-stones on the ring are quest objects, client/src/questObjects.ts)
  out.push({ kind: "wp_hollow_throne", x: (HOLLOW.cx + 0.5) * TILE, y: (HOLLOW.cy - 3.6) * TILE });
  const wardAng = HOLLOW_WARDS.map(([x, y]) => Math.atan2(y - HOLLOW.cy, x - HOLLOW.cx));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2;
    if (wardAng.some((w) => Math.abs(Math.atan2(Math.sin(a - w), Math.cos(a - w))) < 0.4)) continue;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.3) continue; // the King's Way comes in from the south
    const tx = HOLLOW.cx + 0.5 + Math.cos(a) * HOLLOW.r * 1.1, ty = HOLLOW.cy + 0.5 + Math.sin(a) * HOLLOW.r;
    out.push({ kind: `wp_crownstone${i % 3}` as Kind, x: tx * TILE, y: ty * TILE, flip: hash(i, 3, 7) < 0.5 });
  }
  // Saltmere: nets drying by the beach, lantern poles on the lane
  scatter(out, "Saltmere", "wp_net_rack", 3, 5);
  scatter(out, "Saltmere", "wp_lantern_pole", 3, 6);
  // The elemental wilds (elementArt.ts): each land's own growths and scars
  const LAND_PROP = { poison: "wp_venom_caps", cold: "wp_ice_spikes", fire: "wp_ember_vent", shock: "wp_storm_stone" } as const;
  for (const l of ELEMENT_LANDS) scatter(out, l.name, LAND_PROP[l.el], Math.round(l.w * l.h / 90), 4);
  return out;
}

/** World-space height (px) of each prop: textures are 1.5 texels per world px. */
const SIZE: Record<Kind, number> = {
  wp_hollow_throne: THRONE_H / TX, wp_crownstone0: STONE_H / TX, wp_crownstone1: STONE_H / TX, wp_crownstone2: STONE_H / TX,
  wp_shipwreck: WRECK_H / TX,
  wp_spear_rack: 80, wp_pennant_red: 100, wp_pennant_black: 100, wp_dummy: 58, wp_lantern_pole: 90, wp_skull_pike: 72, wp_net_rack: 50, wp_spears_ground: 54,
  wp_watchtower: 84,
  wp_venom_caps: VENOM_H / TX, wp_ice_spikes: ICE_H / TX, wp_ember_vent: VENT_H / TX, wp_storm_stone: STORM_H / TX,
};
const FPS: Record<Kind, number> = {
  wp_hollow_throne: 6, wp_crownstone0: 1, wp_crownstone1: 1, wp_crownstone2: 1,
  wp_shipwreck: 4,
  wp_spear_rack: 6, wp_pennant_red: 7, wp_pennant_black: 6, wp_dummy: 3, wp_lantern_pole: 3, wp_skull_pike: 6, wp_net_rack: 3, wp_spears_ground: 5,
  wp_watchtower: 6,
  wp_venom_caps: 4, wp_ice_spikes: 4, wp_ember_vent: 6, wp_storm_stone: 8,
};

export const WORLD_PROP_SPOTS = spots();

/** Paints the prop textures if needed (npcs.ts uses wp_weapon_rack for Brann's smithy). */
export function worldPropTextures(scene: Phaser.Scene) { makeTextures(scene); }

const LANTERN_LIFT = 71 / TX, LANTERN_DX = 6 / TX;

/** Adds the props to the scene. `light` gets called for every lantern (the day/night layer lights it after dusk). */
export function addWorldProps(scene: Phaser.Scene, light?: (x: number, y: number, lift: number, dx: number) => void) {
  makeTextures(scene);
  watchtower(scene);
  sheet(scene, "wp_shipwreck", WRECK_W, WRECK_H, N, shipwreck, 0);
  sheet(scene, "wp_hollow_throne", THRONE_W, THRONE_H, N, throne, 0);
  for (const v of [0, 1, 2]) sheet(scene, `wp_crownstone${v}`, STONE_W, STONE_H, N, (p, f) => standingStone(p, f, 0, v), 0);
  for (const kind of Object.keys(SIZE) as Kind[]) {
    const key = `${kind}_idle`;
    if (!scene.anims.exists(key)) scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(kind, { start: 0, end: N - 1 }), frameRate: FPS[kind], repeat: -1 });
  }
  for (const s of WORLD_PROP_SPOTS) {
    const spr = scene.add.sprite(s.x, s.y, s.kind, 0).setOrigin(0.5, 1).setScale(1 / TX).setDepth(s.y).setFlipX(!!s.flip);
    // out of step with each other, so a row of them doesn't move as one
    spr.play({ key: `${s.kind}_idle`, startFrame: Math.floor(hash(Math.round(s.x), Math.round(s.y), 9) * N) });
    // the glow sits in the lantern: it hangs at texel x 22 of 32 (6 right of the sprite's centre), its middle ~71 texels above the foot
    if (s.kind === "wp_lantern_pole") light?.(s.x, s.y, LANTERN_LIFT, LANTERN_DX);
  }
}
