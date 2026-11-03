import Phaser from "phaser";
import { TILE } from "../../shared/constants";
import { AREAS, EMPTY, GROUND, OBJECTS, SIGNPOSTS, T, VILLAGE } from "../../shared/map";
import { NPCS, NPC_DECOR } from "../../shared/npcs";
import { CHESTS } from "../../shared/chests";
import { SIEGE_SITES } from "../../shared/siege";

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

// ---- the props ------------------------------------------------------------------------------------------
const N = 6; // animation frames per prop

function makeTextures(scene: Phaser.Scene) {
  // Spear rack: A-frame with five spears, two carrying pennants
  sheet(scene, "wp_spear_rack", 42, 66, N, (p, f) => {
    const t = (f / N) * Math.PI * 2;
    p.shaft(4, 64, 8, 30, 2); p.shaft(34, 64, 30, 30, 2); // side legs
    p.shaft(7, 30, 34, 30, 2); p.rect(6, 58, 30, 2, WOOD[1]); p.rect(6, 58, 30, 1, WOOD[0]); // top bar and base
    for (let k = 0; k < 5; k++) {
      const x = 10 + k * 5;
      p.shaft(x - 1, 61, x + 1, 9 + (k % 2) * 3, 1, WOOD);
      spearHead(p, x + 1, 2 + (k % 2) * 3);
    }
    p.line(7, 31, 34, 31, WOOD[2]);
    pennant(p, 12, 12, 10, 4, t, RED);
    pennant(p, 27, 12, 10, 4, t + 1.7, BLUE);
  });

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

// ---- placement -------------------------------------------------------------------------------------------
type Kind = "wp_spear_rack" | "wp_pennant_red" | "wp_pennant_black" | "wp_dummy" | "wp_lantern_pole" | "wp_skull_pike" | "wp_net_rack" | "wp_spears_ground";
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
  // Oakvale: lantern poles along the roads, a spear rack and pennants by the smithy, dummies to practise on
  scatter(out, "Oakvale", "wp_spear_rack", 1, 3, (tx) => tx < VILLAGE.x0 + 10); // west side, by the smithy
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
  scatter(out, "Redfang Hollow", "wp_skull_pike", 6, 3);
  scatter(out, "Redfang Hollow", "wp_spear_rack", 1, 4);
  // Saltmere: nets drying by the beach, lantern poles on the lane
  scatter(out, "Saltmere", "wp_net_rack", 3, 5);
  scatter(out, "Saltmere", "wp_lantern_pole", 3, 6);
  return out;
}

/** World-space height (px) of each prop: textures are 1.5 texels per world px. */
const SIZE: Record<Kind, number> = {
  wp_spear_rack: 66, wp_pennant_red: 100, wp_pennant_black: 100, wp_dummy: 58, wp_lantern_pole: 90, wp_skull_pike: 72, wp_net_rack: 50, wp_spears_ground: 54,
};
const FPS: Record<Kind, number> = {
  wp_spear_rack: 6, wp_pennant_red: 7, wp_pennant_black: 6, wp_dummy: 3, wp_lantern_pole: 3, wp_skull_pike: 6, wp_net_rack: 3, wp_spears_ground: 5,
};

export const WORLD_PROP_SPOTS = spots();

/** Adds the props to the scene. `light` gets called for every lantern (the day/night layer lights it after dusk). */
export function addWorldProps(scene: Phaser.Scene, light?: (x: number, y: number) => void) {
  makeTextures(scene);
  for (const kind of Object.keys(SIZE) as Kind[]) {
    const key = `${kind}_idle`;
    if (!scene.anims.exists(key)) scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(kind, { start: 0, end: N - 1 }), frameRate: FPS[kind], repeat: -1 });
  }
  for (const s of WORLD_PROP_SPOTS) {
    const spr = scene.add.sprite(s.x, s.y, s.kind, 0).setOrigin(0.5, 1).setScale(1 / TX).setDepth(s.y).setFlipX(!!s.flip);
    // out of step with each other, so a row of them doesn't move as one
    spr.play({ key: `${s.kind}_idle`, startFrame: Math.floor(hash(Math.round(s.x), Math.round(s.y), 9) * N) });
    if (s.kind === "wp_lantern_pole") light?.(s.x, s.y);
  }
}
