import { ISO } from "./isoflag";
import { isoAnchor, isoScreen } from "./iso";
import Phaser from "phaser";
import { ART_K as K, MAP_H, MAP_W, TILE } from "../../shared/constants";
import { AREAS, EMPTY, GROUND, OBJECTS, T, VILLAGE } from "../../shared/map";

/**
 * Fine detail for Oakvale, all cosmetic and client-side:
 *  - roof shading (ridge, eaves, lit/shaded edges) so buildings read as volumes
 *  - ground decals (pebbles, tufts, clover, mushrooms, fallen leaves) and grass spilling over road edges
 *  - reeds and lily pads, ducks paddling on Mirror Pond
 *  - door lanterns, gate banners, lit windows and a gentle day/night cycle
 * Static detail is baked once into render textures, so it costs nothing per frame.
 */

export const ROOFS = new Set<number>([T.ROOF_THATCH, T.ROOF_RED, T.ROOF_SLATE]);
const WALLS = new Set<number>([T.WALL_TIMBER, T.WALL_STONE, T.WINDOW_TIMBER, T.WINDOW_STONE, T.DOOR]);
const GRASSY = new Set<number>([T.GRASS, T.GRASS_DARK, T.TALL_GRASS, T.FLOWERS]);
const W = MAP_W * TILE, H = MAP_H * TILE;

const obj = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? EMPTY : OBJECTS[y][x]);
const gnd = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? -1 : GROUND[y][x]);
function hash(x: number, y: number, s: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const inArea = (name: string, tx: number, ty: number) => {
  const a = AREAS.find((z) => z.name === name);
  return !!a && tx >= a.x && ty >= a.y && tx < a.x + a.w && ty < a.y + a.h;
};

export interface Box { x0: number; y0: number; x1: number; y1: number; roof: number }

/** Connected groups of roof tiles (one per building), as tile bounding boxes. */
export function roofGroups(): Box[] {
  const seen = new Set<number>();
  const out: Box[] = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (!ROOFS.has(OBJECTS[y][x]) || seen.has(y * MAP_W + x)) continue;
    const b: Box = { x0: x, y0: y, x1: x, y1: y, roof: OBJECTS[y][x] };
    const stack = [[x, y]];
    seen.add(y * MAP_W + x);
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      b.x0 = Math.min(b.x0, cx); b.x1 = Math.max(b.x1, cx); b.y0 = Math.min(b.y0, cy); b.y1 = Math.max(b.y1, cy);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        const k = ny * MAP_W + nx;
        if (ROOFS.has(obj(nx, ny)) && !seen.has(k)) { seen.add(k); stack.push([nx, ny]); }
      }
    }
    out.push(b);
  }
  return out;
}

const CHUNK = 16; // tiles per side of a baked chunk

/**
 * A static detail layer baked into render textures, chunk by chunk, only around the camera:
 * a full-map texture at 32px tiles would take hundreds of MB of video memory.
 */
class ChunkLayer {
  private live = new Map<number, Phaser.GameObjects.RenderTexture>();
  constructor(private scene: Phaser.Scene, private depth: number, private draw: (g: Phaser.GameObjects.Graphics, tx0: number, ty0: number, tx1: number, ty1: number) => void) {}
  update(view: Phaser.Geom.Rectangle) {
    const S = CHUNK * TILE, m = TILE * 4;
    const cx0 = Math.max(0, Math.floor((view.x - m) / S)), cy0 = Math.max(0, Math.floor((view.y - m) / S));
    const cx1 = Math.min(Math.ceil(MAP_W / CHUNK) - 1, Math.floor((view.right + m) / S)), cy1 = Math.min(Math.ceil(MAP_H / CHUNK) - 1, Math.floor((view.bottom + m) / S));
    const want = new Set<number>();
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const k = cy * 1000 + cx;
      want.add(k);
      if (this.live.has(k)) continue;
      const g = this.scene.make.graphics({}, false);
      const tx0 = cx * CHUNK, ty0 = cy * CHUNK;
      g.setPosition(-tx0 * TILE, -ty0 * TILE);
      this.draw(g, tx0, ty0, Math.min(MAP_W, tx0 + CHUNK), Math.min(MAP_H, ty0 + CHUNK));
      const rt = this.scene.add.renderTexture(tx0 * TILE, ty0 * TILE, S, S).setOrigin(0, 0).setDepth(this.depth);
      rt.draw(g);
      g.destroy();
      this.live.set(k, rt);
    }
    for (const [k, rt] of this.live) if (!want.has(k)) { rt.destroy(); this.live.delete(k); }
  }
}

/** Like ChunkLayer, but painted pixel by pixel into a canvas texture (fast for dense, full-tile detail). */
class PixelChunkLayer {
  private live = new Map<number, { img: Phaser.GameObjects.Image; key: string }>();
  constructor(private scene: Phaser.Scene, private depth: number, private paint: (d: Uint8ClampedArray, S: number, tx0: number, ty0: number, tx1: number, ty1: number) => void) {}
  update(view: Phaser.Geom.Rectangle) {
    const S = CHUNK * TILE, m = TILE * 4;
    const cx0 = Math.max(0, Math.floor((view.x - m) / S)), cy0 = Math.max(0, Math.floor((view.y - m) / S));
    const cx1 = Math.min(Math.ceil(MAP_W / CHUNK) - 1, Math.floor((view.right + m) / S)), cy1 = Math.min(Math.ceil(MAP_H / CHUNK) - 1, Math.floor((view.bottom + m) / S));
    const want = new Set<number>();
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const k = cy * 1000 + cx;
      want.add(k);
      if (this.live.has(k)) continue;
      const key = `blend_${this.depth}_${k}`;
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
      const tex = this.scene.textures.createCanvas(key, S, S)!;
      const ctx = tex.getContext(), img = ctx.createImageData(S, S);
      const tx0 = cx * CHUNK, ty0 = cy * CHUNK;
      this.paint(img.data, S, tx0, ty0, Math.min(MAP_W, tx0 + CHUNK), Math.min(MAP_H, ty0 + CHUNK));
      ctx.putImageData(img, 0, 0);
      tex.refresh();
      this.live.set(k, { img: this.scene.add.image(tx0 * TILE, ty0 * TILE, key).setOrigin(0, 0).setDepth(this.depth), key });
    }
    for (const [k, l] of this.live) if (!want.has(k)) { l.img.destroy(); this.scene.textures.remove(l.key); this.live.delete(k); }
  }
}

/**
 * Iso only: small upright things (grass tufts, mushrooms, flowers) painted straight in screen space, chunk by chunk,
 * so they stand up instead of lying skewed on the ground. Drawn just above the ground, under everything else.
 */
class IsoUprightLayer {
  private live = new Map<number, Phaser.GameObjects.RenderTexture>();
  constructor(private scene: Phaser.Scene, private depth: number) {}
  update(view: Phaser.Geom.Rectangle) {
    const S = CHUNK * TILE, m = TILE * 4, UP = 24;
    const cx0 = Math.max(0, Math.floor((view.x - m) / S)), cy0 = Math.max(0, Math.floor((view.y - m) / S));
    const cx1 = Math.min(Math.ceil(MAP_W / CHUNK) - 1, Math.floor((view.right + m) / S)), cy1 = Math.min(Math.ceil(MAP_H / CHUNK) - 1, Math.floor((view.bottom + m) / S));
    const want = new Set<number>();
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const k = cy * 1000 + cx;
      want.add(k);
      if (this.live.has(k)) continue;
      const tx0 = cx * CHUNK, ty0 = cy * CHUNK, tx1 = Math.min(MAP_W, tx0 + CHUNK), ty1 = Math.min(MAP_H, ty0 + CHUNK);
      // screen box of the chunk's diamond, plus room above for things standing up
      const left = (tx0 - ty1) * TILE, top = ((tx0 + ty0) * TILE) / 2 - UP;
      const w = (tx1 - tx0 + ty1 - ty0) * TILE, h = ((tx1 - tx0 + ty1 - ty0) * TILE) / 2 + UP;
      const g = this.scene.make.graphics({}, false);
      g.setPosition(-left, -top);
      drawUpright(g, tx0, ty0, tx1, ty1);
      const rt = this.scene.add.renderTexture(left, top, w, h).setOrigin(0, 0).setDepth(this.depth);
      rt.draw(g);
      g.destroy();
      isoScreen(rt);
      this.live.set(k, rt);
    }
    for (const [k, rt] of this.live) if (!want.has(k)) { rt.destroy(); this.live.delete(k); }
  }
}

/** Upright tufts, mushrooms and flowers of tiles [x0,x1)×[y0,y1), at their iso screen points. */
function drawUpright(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number) {
  const px = (x: number, y: number, c: number, a = 1) => g.fillStyle(c, a).fillRect(x, y, 1, 1);
  const R = TILE - 8;
  const at = (wx: number, wy: number) => [Math.round(wx - wy), Math.round((wx + wy) / 2)];
  const items: [number, () => void][] = []; // drawn back to front
  const FLOWER_COLS = [[0xf06292, 0xc2185b], [0xfff176, 0xd8b02a], [0xffffff, 0xc8d0e0], [0xba68c8, 0x7b3f9a], [0x64b5f6, 0x2e7ac0]];
  for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
    const t = GROUND[ty][tx], X = tx * TILE, Y = ty * TILE;
    if (!GRASSY.has(t) || OBJECTS[ty][tx] !== EMPTY) continue;
    const h = hash(tx, ty, 1), wx = X + 4 + Math.floor(hash(tx, ty, 2) * R), wy = Y + 5 + Math.floor(hash(tx, ty, 3) * R);
    const [x, y] = at(wx, wy);
    if (h >= 0.08 && h < 0.2) items.push([wx + wy, () => { // tuft of grass blades
      for (let b = 0; b < 5; b++) {
        const hh = 4 + ((b * 7 + tx) % 3) - Math.abs(b - 2);
        for (let i = 0; i < hh + 2; i++) px(x + b - 2 + (i > hh && b !== 2 ? Math.sign(b - 2) : 0), y - i, i === hh + 1 ? 0x86c95a : i < 2 ? 0x2f6b24 : 0x3f7a2a);
      }
    }]);
    else if (h >= 0.26 && h < 0.275) items.push([wx + wy, () => { // red cap mushroom on a pale stem, and a small one beside it
      g.fillStyle(0x000000, 0.25).fillRect(x - 3, y, 7, 2);
      g.fillStyle(0xece0c8, 1).fillRect(x - 1, y - 4, 3, 5); px(x + 1, y - 1, 0xc8b89a); px(x + 1, y - 2, 0xc8b89a);
      g.fillStyle(0x8f2a20, 1).fillRect(x - 4, y - 5, 9, 1);
      g.fillStyle(0xc0392b, 1).fillRect(x - 4, y - 7, 9, 2); g.fillStyle(0xd84343, 1).fillRect(x - 3, y - 8, 7, 1); g.fillStyle(0xd84343, 1).fillRect(x - 2, y - 9, 5, 1);
      px(x - 2, y - 7, 0xffffff); px(x + 1, y - 8, 0xffffff); px(x + 3, y - 6, 0xffffff);
      g.fillStyle(0xece0c8, 1).fillRect(x + 5, y - 2, 2, 3); g.fillStyle(0xc0392b, 1).fillRect(x + 4, y - 4, 4, 2); px(x + 5, y - 4, 0xffffff);
    }]);
    if (t === T.FLOWERS) for (let k = 0; k < 6; k++) { // upright flowers on stems
      const fx = X + 3 + Math.floor(hash(tx, ty, 30 + k) * (TILE - 6)), fy = Y + 3 + Math.floor(hash(tx, ty, 40 + k) * (TILE - 6));
      const [sx, sy] = at(fx, fy), [c, sh] = FLOWER_COLS[(k + tx + ty) % 5], st = 4 + Math.floor(hash(tx, ty, 50 + k) * 4);
      items.push([fx + fy, () => {
        g.fillStyle(0x1e4a14, 0.3).fillRect(sx - 1, sy, 3, 1);
        g.fillStyle(0x3f7a2a, 1).fillRect(sx, sy - st, 1, st); px(sx + 1, sy - 2, 0x5aa845); px(sx - 1, sy - 3, 0x5aa845);
        const by = sy - st - 3;
        g.fillStyle(c, 1).fillRect(sx - 1, by, 3, 3); px(sx, by - 1, c); px(sx - 2, by + 1, c); px(sx + 2, by + 1, sh); px(sx, by + 3, sh);
        px(sx, by + 1, 0xffd23a);
      }]);
    }
  }
  items.sort((a, b) => a[0] - b[0]);
  for (const [, f] of items) f();
}

const ROADY = new Set<number>([T.DIRT, T.COBBLE]);
const GRASS_PAL = [0x5a9a3c, 0x5a9a3c, 0x5a9a3c, 0x4a8532, 0x6fb04a], DARK_PAL = [0x4f8c36, 0x4f8c36, 0x427a2c, 0x5f9f42];
const DIRT_PAL = [0xa7814f, 0xa7814f, 0xa7814f, 0x957244, 0xbd9763, 0x8a6a3e];
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Smooth transitions between ground types, painted per pixel over the tilemap:
 *  - roads and the cobbled square get organic, rounded edges into the grass (diagonal roads become smooth bands),
 *    with a darker rut on dirt and kerb stones on cobbles,
 *  - cobbled streets break up into dirt roads: stones thin out and scatter as loose cobbles.
 * Each pixel samples a field interpolated between tile centres (1 = road, 0 = grass), plus a little noise.
 */
function paintTransitions(d: Uint8ClampedArray, S: number, tx0: number, ty0: number, tx1: number, ty1: number) {
  const set = (lx: number, ly: number, c: number) => { const o = (ly * S + lx) * 4; d[o] = c >> 16; d[o + 1] = (c >> 8) & 255; d[o + 2] = c & 255; d[o + 3] = 255; };
  const pick = (pal: number[], wx: number, wy: number) => pal[Math.floor(hash(wx, wy, 7) * pal.length)];
  const wobble = (wx: number, wy: number) => 0.09 * Math.sin(wx * 0.29 + wy * 0.13) + 0.06 * Math.sin(wy * 0.41 - wx * 0.17 + 1.3) + (hash(wx >> 1, wy >> 1, 9) - 0.5) * 0.08;
  for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) {
    const t = gnd(tx, ty), road = ROADY.has(t), grassy = GRASSY.has(t);
    if (!road && !grassy) continue;
    let nRoad = false, nGrass = false, nDirt = false, nCobble = false;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const n = gnd(tx + i, ty + j);
      if (ROADY.has(n)) nRoad = true; if (GRASSY.has(n)) nGrass = true; if (n === T.DIRT) nDirt = true; if (n === T.COBBLE) nCobble = true;
    }
    if (grassy && !nDirt) continue; // grass is only painted over by dirt
    if (road && !nGrass && !(t === T.COBBLE && nDirt) && !(t === T.DIRT && nCobble)) continue;
    const own = road ? 1 : 0;
    // field values at the 4x4 surrounding tile centres (neutral tiles take this tile's value)
    const R = (i: number, j: number) => { const n = gnd(i, j); return ROADY.has(n) ? 1 : GRASSY.has(n) ? 0 : own; };
    const ownD = t === T.DIRT ? 1 : t === T.COBBLE ? 0 : 0.5;
    const D = (i: number, j: number) => { const n = gnd(i, j); return n === T.DIRT ? 1 : n === T.COBBLE ? 0 : ownD; };
    const dark = t === T.GRASS_DARK;
    const field = (F: (i: number, j: number) => number, wx: number, wy: number) => {
      const fx = (wx + 0.5) / TILE - 0.5, fy = (wy + 0.5) / TILE - 0.5, i0 = Math.floor(fx), j0 = Math.floor(fy);
      const u = smoothstep(fx - i0), v = smoothstep(fy - j0);
      const a = F(i0, j0), b = F(i0 + 1, j0), c = F(i0, j0 + 1), e = F(i0 + 1, j0 + 1);
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v;
    };
    for (let py = 0; py < TILE; py++) for (let px = 0; px < TILE; px++) {
      const wx = tx * TILE + px, wy = ty * TILE + py, lx = wx - tx0 * TILE, ly = wy - ty0 * TILE;
      const f = field(R, wx, wy) + wobble(wx, wy);
      if (grassy) {
        if (f > 0.5) { // the dirt road spills smoothly into this grass tile
          if (field(D, wx, wy) < 0.5) continue; // cobbles keep their own edge
          set(lx, ly, f < 0.55 ? 0x8f6c3f : pick(DIRT_PAL, wx, wy));
        } else if (f > 0.46 && hash(wx, wy, 11) < 0.6) set(lx, ly, dark ? 0x3a6e26 : 0x3f7a2a); // grass lip along the road
        continue;
      }
      // road tile
      if (f < 0.5) { // grass reclaims the edge and rounds the corners
        set(lx, ly, f > 0.46 && hash(wx, wy, 11) < 0.6 ? 0x3f7a2a : f > 0.43 && hash(wx, wy, 12) < 0.25 ? 0x6fb04a : pick(dark ? DARK_PAL : GRASS_PAL, wx, wy));
        continue;
      }
      if (f < 0.56) { // worn rut on dirt, kerb stones on cobbles
        if (t === T.DIRT) { if (hash(wx, wy, 13) < 0.7) set(lx, ly, 0x8f6c3f); }
        else set(lx, ly, ((wx + wy) >> 2) % 3 === 0 ? 0x5e5a52 : f < 0.53 ? 0x8a857a : 0xa9a497);
        continue;
      }
      if (t === T.COBBLE && nDirt) { // cobbles thin out towards a dirt road
        const dv = field(D, wx, wy) + wobble(wx + 50, wy + 30);
        if (dv > 0.22) {
          const keep = hash(Math.floor(wx / 6), Math.floor(wy / 8), 15) < (0.72 - dv) * 1.9; // whole stones survive here and there
          if (!keep) set(lx, ly, pick(DIRT_PAL, wx, wy));
        }
      } else if (t === T.DIRT && nCobble) { // loose cobbles scattered on the dirt near the paving
        const dv = field(D, wx, wy) + wobble(wx + 50, wy + 30);
        const cx = Math.floor(wx / 6), cy = Math.floor(wy / 5), sx = wx - cx * 6, sy = wy - cy * 5;
        if (dv < 0.88 && hash(cx, cy, 16) < (0.88 - dv) * 1.3 && sx >= 1 && sx <= 4 && sy >= 1 && sy <= 3 && !((sx === 1 || sx === 4) && (sy === 1 || sy === 3)))
          set(lx, ly, sy === 1 ? 0xb3ada0 : sy === 3 ? 0x7f7a6f : sx === 4 ? 0x88837a : 0x9c978a);
        else if (dv < 0.88 && hash(cx, cy, 16) < (0.88 - dv) * 1.3 && sy === 4 && sx >= 1 && sx <= 4) set(lx, ly, 0x7a5e38); // stone's shadow
      }
    }
  }
}

/** A small generated texture. `px` paints in screen pixels: draw at `k` = 1 for full detail, or pass k to scale a design. */
function texture(scene: Phaser.Scene, key: string, w: number, h: number, frames: number, draw: (px: (x: number, y: number, c: number, a?: number) => void, f: number) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w * frames, h)!;
  const ctx = tex.getContext();
  for (let f = 0; f < frames; f++) {
    draw((x, y, c, a = 1) => { if (x < 0 || y < 0 || x >= w || y >= h) return; ctx.globalAlpha = a; ctx.fillStyle = "#" + c.toString(16).padStart(6, "0"); ctx.fillRect(f * w + x, y, 1, 1); }, f);
    tex.add(f, 0, f * w, 0, w, h);
  }
  ctx.globalAlpha = 1;
  tex.refresh();
}

function makeTextures(scene: Phaser.Scene) {
  texture(scene, "lantern", 10, 18, 1, (px) => {
    const iron = 0x2a2a2a, rim = 0x4a4a4a;
    px(4, 0, iron); px(5, 0, iron); px(3, 1, iron); px(6, 1, iron); // hanging ring
    for (let x = 2; x < 8; x++) px(x, 2, iron);
    for (let x = 1; x < 9; x++) px(x, 3, x === 1 ? iron : rim);
    for (let y = 4; y < 15; y++) { px(0, y, iron); px(9, y, iron); px(1, y, rim); px(8, y, 0x1a1a1a); }
    for (let y = 4; y < 15; y++) for (let x = 2; x < 8; x++) px(x, y, y < 7 ? 0xfff6c8 : y < 11 ? 0xffd77a : 0xffb347);
    for (let x = 2; x < 8; x++) px(x, 9, iron); // cross bar
    px(3, 5, 0xffffff); px(3, 6, 0xffffff); px(4, 11, 0xfff2b0); // glints and flame
    for (let x = 0; x < 10; x++) px(x, 15, iron);
    for (let x = 2; x < 8; x++) px(x, 16, rim);
    px(4, 17, iron); px(5, 17, iron);
  });
  texture(scene, "banner", 16, 28, 3, (px, f) => {
    for (let x = 0; x < 16; x++) { px(x, 0, 0x7a5230); px(x, 1, 0x5a3a1e); }
    px(0, 0, 0xc8a050); px(15, 0, 0xc8a050);
    const sway = [0, 1, 0][f];
    const off = (y: number) => Math.round(y > 12 ? sway * 2 * ((y - 12) / 13) : 0);
    for (let y = 2; y < 26; y++) for (let x = 2; x < 14; x++)
      px(x + off(y), y, x < 4 ? 0x7a1c1c : x > 11 ? 0x8f2222 : (x + y) % 9 === 0 ? 0x9c2626 : 0xa82a2a);
    for (let y = 2; y < 26; y++) { px(2 + off(y), y, 0xc8a050); px(13 + off(y), y, 0xb08840); } // gold trim
    // golden oak leaf emblem
    const leaf = ["..##..", ".####.", "######", ".####.", "######", ".####.", "..##..", "..#...", "..#..."];
    leaf.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === "#") px(5 + i + off(7 + j), 7 + j, j < 3 ? 0xf2d27a : 0xe8c060); }));
    for (let j = 1; j < 7; j++) px(7 + off(7 + j), 7 + j, 0xb8902e); // leaf vein
    // swallowtail end
    for (let i = 0; i < 4; i++) { px(3 + i + off(26), 26, 0xa82a2a); px(9 + i + off(26), 26, 0xa82a2a); }
    for (let i = 0; i < 2; i++) { px(3 + i + off(27), 27, 0x8f2222); px(11 + i + off(27), 27, 0x8f2222); }
  });
  texture(scene, "duck", 14, 12, 2, (px, f) => {
    const body = 0xf2f2ea, shade = 0xd8d8cc, head = 0x2f7a4a;
    for (let y = 4; y < 9; y++) for (let x = 0; x < 11; x++) {
      const dx = (x - 5) / 5.5, dy = (y - 7) / 2.6;
      if (dx * dx + dy * dy <= 1) px(x, y, y > 7 ? shade : x < 3 && y < 6 ? 0xffffff : body);
    }
    px(0, 5, shade); px(0, 4, shade); // tail
    for (let x = 3; x < 8; x++) px(x, 6, 0xc8c8bc); // folded wing
    for (let y = 0; y < 5; y++) for (let x = 8; x < 12; x++) if ((x - 9.8) ** 2 + (y - 2.2) ** 2 <= 4.2) px(x, y, head);
    px(9, 4, 0xffffff); px(10, 4, 0xffffff); // neck ring
    px(12, 2, 0xf0a020); px(13, 2, 0xf0a020); px(12, 3, 0xd08010);
    px(10, 1, f ? 0x1a1a1a : head);
    for (let x = 0; x < 12; x++) px(x, 9, 0x9fc8ec, 0.7);
    for (let x = 1; x < 10; x += 3) px(x + f, 10, 0xd8ecff, 0.6);
    px(f ? 0 : 12, 10, 0xd8ecff, 0.8); px(f ? 13 : 1, 11, 0xd8ecff, 0.5);
  });
  texture(scene, "light", 64, 64, 1, (px) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x - 31.5, y - 31.5) / 32;
      if (d < 1) px(x, y, 0xffffff, (1 - d) ** 2);
    }
  });
}

/** Time of day as 0..1 of the 30-minute cycle, shared by every client via the wall clock (?time=day|dusk|night forces it). */
export function dayTime(nowMs: number): number {
  const forced = new URLSearchParams(location.search).get("time");
  if (forced === "night") return 0.81;
  if (forced === "dusk") return 0.685;
  if (forced === "day") return 0.3;
  const CYCLE = 30 * 60 * 1000; // 30-minute day: about 19 min daylight, 2 min dusk, 6 min night, 3 min dawn
  return (nowMs % CYCLE) / CYCLE;
}

/** Phase of the day: 0..1 darkness and a dusk warmth. t: 0-.65 day, .65-.72 dusk, .72-.9 night, .9-1 dawn. */
export function dayPhase(t: number): { dark: number; warm: number } {
  const ramp = (a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const dark = t < 0.65 ? 0 : t < 0.72 ? ramp(0.65, 0.72) : t < 0.9 ? 1 : 1 - ramp(0.9, 1);
  const warm = t > 0.61 && t < 0.76 ? Math.sin(((t - 0.61) / 0.15) * Math.PI) : t > 0.88 ? Math.sin(((t - 0.88) / 0.12) * Math.PI) * 0.6 : 0;
  return { dark, warm };
}

interface Duck { s: Phaser.GameObjects.Sprite; tx: number; ty: number; wait: number }

export class Details {
  private night!: Phaser.GameObjects.Rectangle;
  private dusk!: Phaser.GameObjects.Rectangle;
  private lights: { img: Phaser.GameObjects.Image; base: number; flicker: number }[] = [];
  private windows!: Phaser.GameObjects.Graphics;
  private ducks: Duck[] = [];
  private pond: [number, number][] = [];
  private fireflies?: (dark: number) => void;

  private layers: { update(view: Phaser.Geom.Rectangle): void }[] = [];

  constructor(private scene: Phaser.Scene) {
    makeTextures(scene);
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) if (GROUND[ty][tx] === T.WATER && inArea("Mirror Pond", tx, ty)) this.pond.push([tx, ty]);
    this.layers.push(new PixelChunkLayer(scene, -1.75, paintTransitions));
    this.layers.push(new ChunkLayer(scene, -1.7, (g, x0, y0, x1, y1) => this.groundDecals(g, x0, y0, x1, y1)));
    this.layers.push(new ChunkLayer(scene, -1.59, (g, x0, y0, x1, y1) => this.roundCorners(g, x0, y0, x1, y1)));
    this.layers.push(new ChunkLayer(scene, -1.58, (g, x0, y0, x1, y1) => this.waterDecor(g, x0, y0, x1, y1)));
    if (ISO) this.layers.push(new IsoUprightLayer(scene, -1.5));
    this.roofShading();
    this.lanternsAndBanners();
    this.ducksOnPond();
    this.lighting();
  }

  /** Lets the ambient layer brighten fireflies at night. */
  onDarkness(f: (dark: number) => void) { this.fireflies = f; }

  /** Pebbles, tufts, clover, mushrooms, fallen leaves, grass spilling over road edges, ruts and moss. Screen-pixel detail. */
  private groundDecals(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number) {
    const px = (x: number, y: number, c: number, a = 1) => g.fillStyle(c, a).fillRect(x, y, 1, 1);
    const R = TILE - 8; // keep decals off the tile edge
    for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
      const t = GROUND[ty][tx], X = tx * TILE, Y = ty * TILE;
      const free = OBJECTS[ty][tx] === EMPTY;
      if (GRASSY.has(t) && free) {
        const h = hash(tx, ty, 1), x = X + 4 + Math.floor(hash(tx, ty, 2) * R), y = Y + 5 + Math.floor(hash(tx, ty, 3) * R);
        if (h < 0.08) { // pebbles
          for (const [dx, dy, w] of [[0, 0, 3], [4, 1, 2], [2, 3, 2]]) {
            g.fillStyle(0x3f6e2a, 0.6).fillRect(x + dx, y + dy + 2, w, 1);
            g.fillStyle(0x8d8d84, 1).fillRect(x + dx, y + dy, w, 2);
            px(x + dx, y + dy, 0xb8b8ae); px(x + dx + w - 1, y + dy + 1, 0x6e6e66);
          }
        } else if (ISO && h >= 0.08 && h < 0.275 && !(h >= 0.2 && h < 0.26)) { // tufts and mushrooms stand up (IsoUprightLayer)
        } else if (h < 0.2) { // tuft
          for (let b = 0; b < 5; b++) {
            const hh = 3 + ((b * 7 + tx) % 3) - Math.abs(b - 2);
            for (let i = 0; i < hh + 2; i++) px(x + b + (i > hh && b !== 2 ? Math.sign(b - 2) : 0), y - i, i === hh + 1 ? 0x86c95a : i < 2 ? 0x2f6b24 : 0x3f7a2a);
          }
        } else if (h < 0.26) { // clover
          for (const [dx, dy] of [[0, 0], [3, 0], [1.5, -2]]) {
            g.fillStyle(0x4f9a3a, 1).fillRect(x + Math.round(dx), y + Math.round(dy), 2, 2);
            px(x + Math.round(dx), y + Math.round(dy), 0x6fbf55);
          }
          px(x + 2, y + 2, 0x3f7a2a); px(x + 2, y + 3, 0x3f7a2a);
        } else if (h < 0.275) { // mushroom
          g.fillStyle(0xece0c8, 1).fillRect(x + 1, y + 1, 2, 3); px(x + 2, y + 3, 0xc8b89a);
          g.fillStyle(0xc0392b, 1).fillRect(x - 1, y - 1, 6, 2); g.fillStyle(0xd84343, 1).fillRect(x, y - 2, 4, 1);
          px(x, y - 1, 0xffffff); px(x + 3, y - 2, 0xffffff); px(x + 4, y, 0x8f2a20);
          g.fillStyle(0x000000, 0.25).fillRect(x, y + 4, 4, 1);
        }
        // fallen leaves under nearby oaks
        let oak = false;
        for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) if (obj(tx + dx, ty + dy) === T.TREE) oak = true;
        if (oak) for (let k = 0; k < 6; k++) {
          const lx = X + Math.floor(hash(tx, ty, 10 + k) * (TILE - 2)), ly = Y + Math.floor(hash(tx, ty, 20 + k) * (TILE - 1));
          const c = [0xd98a2b, 0xc8a13a, 0xb5562a, 0x8fae3a, 0xd98a2b, 0xa8682a][k];
          px(lx, ly, c); px(lx + 1, ly, c); if (k % 2) px(lx + 1, ly + 1, 0x7a4a1e);
        }
      }
      if (t === T.DIRT || t === T.COBBLE || t === T.SAND) {
        if (t === T.DIRT && hash(tx, ty, 50) < 0.35) { // small stones on roads
          const ox = X + 2 + Math.floor(hash(tx, ty, 51) * (TILE - 6)), oy = Y + 2 + Math.floor(hash(tx, ty, 52) * (TILE - 6));
          g.fillStyle(0x7a6448, 1).fillRect(ox, oy + 1, 3, 1); g.fillStyle(0x9a8a72, 1).fillRect(ox, oy, 3, 1); px(ox, oy, 0xb8a88e);
          px(ox + 5, oy + 2, 0x8a7a64); px(ox + 6, oy + 2, 0x6e604c);
        }
        if (t === T.COBBLE && hash(tx, ty, 53) < 0.2) { // moss between the cobbles
          const ox = X + Math.floor(hash(tx, ty, 54) * (TILE - 4)), oy = Y + Math.floor(hash(tx, ty, 55) * 4) * 8 + 7;
          px(ox, oy, 0x5f8f3f); px(ox + 1, oy, 0x4a7a32); px(ox + 2, oy, 0x5f8f3f); px(ox + 1, oy - 1, 0x6fa04a);
        }
      }
    }
  }

  /** Rounds the blocky corners of ponds, rivers and sandy banks so shorelines look natural. */
  private roundCorners(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number) {
    const BASE: Record<number, number> = { [T.SAND]: 0xd9c38a, [T.GRASS]: 0x5a9a3c, [T.GRASS_DARK]: 0x4f8c36, [T.TALL_GRASS]: 0x5a9a3c, [T.FLOWERS]: 0x5a9a3c, [T.DIRT]: 0xa7814f };
    const wet = (t: number) => t === T.WATER || t === T.BRIDGE || t === -1;
    const R = 7 * K;
    for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
      const t = GROUND[ty][tx], X = tx * TILE, Y = ty * TILE;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const a = gnd(tx + sx, ty), b = gnd(tx, ty + sy), d = gnd(tx + sx, ty + sy);
        let fill: number | undefined, foam = false;
        if (t === T.WATER && !wet(a) && !wet(b) && a === b && BASE[a] !== undefined) { fill = BASE[a]; foam = true; } // land pokes into water
        else if (t === T.SAND && GRASSY.has(a) && a === b && GRASSY.has(d)) fill = BASE[a]; // grass rounds off sandy banks
        else if (!wet(t) && BASE[t] !== undefined && wet(a) && wet(b) && wet(d) && a !== -1) fill = 0x3a78b8; // water bites into land
        if (fill === undefined) continue;
        // corner square of R×R pixels: paint everything outside the quarter circle
        const cx = sx < 0 ? X + R : X + TILE - R, cy = sy < 0 ? Y + R : Y + TILE - R;
        for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
          const x = sx < 0 ? X + i : X + TILE - 1 - i, y = sy < 0 ? Y + j : Y + TILE - 1 - j;
          const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (dist > R) g.fillStyle(fill, 1).fillRect(x, y, 1, 1);
          else if (foam && dist > R - 1.5) g.fillStyle(0xd8ecff, 0.7).fillRect(x, y, 1, 1);
          else if (foam && dist > R - 3) g.fillStyle(0xd8ecff, 0.25).fillRect(x, y, 1, 1);
        }
      }
    }
  }

  /** Lily pads on Mirror Pond, reeds and cattails along the water. */
  private waterDecor(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number) {
    const px = (x: number, y: number, c: number, a = 1) => g.fillStyle(c, a).fillRect(x, y, 1, 1);
    for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
      const t = GROUND[ty][tx], X = tx * TILE, Y = ty * TILE;
      if (t === T.WATER && inArea("Mirror Pond", tx, ty) && hash(tx, ty, 60) < 0.3) { // lily pad, sometimes with a flower
        const cx = X + 7 + Math.floor(hash(tx, ty, 61) * 18), cy = Y + 7 + Math.floor(hash(tx, ty, 62) * 18);
        for (let dy = -4; dy <= 4; dy++) for (let dx = -6; dx <= 6; dx++) {
          const e = (dx * dx) / 36 + (dy * dy) / 16;
          if (e > 1 || (dx >= 0 && dx <= 1 + (dy + 4) / 3 && dy <= 0 && dy > -5 && dx < 4)) continue; // notch
          px(cx + dx, cy + dy, e > 0.7 ? 0x2f7a3a : dy > 1 ? 0x3f8a40 : 0x4f9a4a);
        }
        px(cx - 3, cy - 1, 0x6fbf60); px(cx - 2, cy - 2, 0x6fbf60);
        g.fillStyle(0x1d4a7a, 0.4).fillRect(cx - 5, cy + 5, 11, 1);
        if (hash(tx, ty, 63) < 0.4) {
          for (const [dx, dy] of [[-2, -1], [2, -1], [0, -3], [-1, -2], [1, -2]]) px(cx + dx, cy + dy, 0xffd6e8);
          px(cx, cy - 4, 0xffffff); px(cx - 1, cy - 1, 0xf0a0c0); px(cx + 1, cy - 1, 0xf0a0c0); px(cx, cy - 1, 0xffd54f); px(cx, cy - 2, 0xffd54f);
        }
      }
      // Reeds and cattails on land right next to water
      if ((t === T.SAND || GRASSY.has(t)) && OBJECTS[ty][tx] === EMPTY) {
        let wetSide = false;
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) if (gnd(tx + dx, ty + dy) === T.WATER) wetSide = true;
        if (!wetSide || hash(tx, ty, 70) > 0.45) continue;
        for (let k = 0; k < 6; k++) {
          const x = X + 3 + Math.floor(hash(tx, ty, 71 + k) * 26), y = Y + 12 + Math.floor(hash(tx, ty, 75 + k) * 18), h = 8 + Math.floor(hash(tx, ty, 79 + k) * 8);
          for (let i = 0; i < h; i++) px(x + (i > h - 3 && k % 2 ? 1 : 0), y - i, i < 3 ? 0x3f6a2a : i % 4 === 0 ? 0x5a8a32 : 0x6a9a3a);
          if (k % 3 === 0) { // cattail head
            g.fillStyle(0x6a4020, 1).fillRect(x - 1, y - h - 1, 2, 4); px(x - 1, y - h - 1, 0x8a5a30); px(x, y - h - 2, 0x6a9a3a);
          } else if (k % 3 === 1) px(x - 1, y - Math.floor(h / 2), 0x7aaa48); // a leaf
        }
      }
    }
  }

  private roofShading() {
    const g = this.scene.add.graphics().setDepth(-0.95); // few shapes: a plain Graphics is cheaper than a full-map texture
    for (const b of roofGroups()) {
      const X0 = b.x0 * TILE, X1 = (b.x1 + 1) * TILE, Y0 = b.y0 * TILE, Y1 = (b.y1 + 1) * TILE, w = X1 - X0, h = Y1 - Y0;
      const ridge = Y0 + Math.max(4 * K, Math.round(h * 0.38));
      // the slopes darken gradually away from the light
      for (let y = Y0; y < ridge; y += 2) g.fillStyle(0x000000, 0.08 + 0.1 * ((y - Y0) / (ridge - Y0))).fillRect(X0, y, w, 2); // far slope in shade
      for (let y = ridge; y < Y1; y += 2) g.fillStyle(0xffffff, 0.11 - 0.07 * ((y - ridge) / (Y1 - ridge))).fillRect(X0, y, w, 2); // near slope catches the light
      g.fillStyle(0x000000, 0.35).fillRect(X0, ridge - 2, w, 2); // ridge cap
      g.fillStyle(0xffffff, 0.3).fillRect(X0, ridge, w, 1);
      g.fillStyle(0xffffff, 0.15).fillRect(X0, ridge + 1, w, 1);
      for (let x = X0 + 3; x < X1 - 2; x += 6) { g.fillStyle(0x000000, 0.25).fillRect(x, ridge - 4, 3, 2); g.fillStyle(0xffffff, 0.15).fillRect(x, ridge - 4, 3, 1); }
      g.fillStyle(0xffffff, 0.18).fillRect(X0, Y0, 2, h); // lit west edge
      g.fillStyle(0x000000, 0.22).fillRect(X1 - 4, Y0, 4, h); // shaded east edge
      g.fillStyle(0x000000, 0.12).fillRect(X1 - 6, Y0, 2, h);
      g.fillStyle(0x000000, 0.25).fillRect(X0, Y0, w, 2);
      // eaves: a dark overhang line and its shadow falling on the wall below
      g.fillStyle(0x000000, 0.45).fillRect(X0 - 2, Y1 - 2, w + 4, 2);
      if (b.roof === T.ROOF_THATCH) for (let x = X0; x < X1; x += 2) g.fillStyle(x % 4 ? 0xd8b456 : 0xc49a40, 1).fillRect(x, Y1, 2, 1 + ((x * 7) >> 2) % 4);
      let wallBelow = false;
      for (let x = b.x0; x <= b.x1; x++) if (WALLS.has(obj(x, b.y1 + 1))) wallBelow = true;
      if (wallBelow) { g.fillStyle(0x000000, 0.28).fillRect(X0, Y1, w, 4); g.fillStyle(0x000000, 0.14).fillRect(X0, Y1 + 4, w, 3); }
    }
  }

  private addLight(x: number, y: number, color: number, scale: number, base: number, flicker = 0.08) {
    const img = this.scene.add.image(x, y, "light").setTint(color).setScale(scale).setBlendMode(Phaser.BlendModes.ADD).setDepth(27500).setAlpha(0);
    this.lights.push({ img, base, flicker });
  }

  private lanternsAndBanners() {
    const scene = this.scene;
    // A lantern beside every door
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
      if (OBJECTS[ty][tx] !== T.DOOR) continue;
      const side = WALLS.has(obj(tx + 1, ty)) && obj(tx + 1, ty) !== T.DOOR ? 1 : -1;
      const x = tx * TILE + (side > 0 ? 17 : -1) * K, y = ty * TILE + 3 * K;
      if (ISO) {
        // iso: hangs on the front wall of the house, about head height
        const foot = { x, y: (ty + 1) * TILE };
        isoAnchor(scene.add.image(x, foot.y - 30, "lantern").setOrigin(0.5, 0).setDepth(foot.y + 1), foot);
        this.addLight(x, foot.y, 0xffb347, 2.2, 0.75);
        continue;
      }
      scene.add.image(x, y, "lantern").setOrigin(0.5, 0).setDepth(-0.9);
      this.addLight(x, y + 5 * K, 0xffb347, 2.2, 0.75);
    }
    // Banners hang on the palisade either side of each gate, lanterns light the way in
    const flap = "banner_flap";
    if (!scene.anims.exists(flap)) scene.anims.create({ key: flap, frames: scene.anims.generateFrameNumbers("banner", { frames: [0, 1, 2, 1] }), frameRate: 4, repeat: -1 });
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
      if (OBJECTS[ty][tx] !== T.PALISADE) continue;
      // gate posts: the last palisade post before an opening in the wall
      const onTopBottom = ty === VILLAGE.y0 || ty === VILLAGE.y1, onSide = tx === VILLAGE.x0 || tx === VILLAGE.x1;
      const gateH = onTopBottom && (obj(tx + 1, ty) === EMPTY || obj(tx - 1, ty) === EMPTY);
      const gateV = onSide && !onTopBottom && (obj(tx, ty + 1) === EMPTY || obj(tx, ty - 1) === EMPTY);
      if (!gateH && !gateV) continue;
      let byRoad = false; // only posts beside a cobbled road get a banner, not every breach in the old wall
      for (let d = -3; d <= 3; d++) if ((gateH ? GROUND[ty][tx + d] : GROUND[ty + d]?.[tx]) === T.COBBLE) byRoad = true;
      if (!byRoad) continue;
      if (ISO) {
        // iso: a flag on its own pole standing on the gate post's tile
        const foot = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
        isoAnchor(scene.add.rectangle(foot.x, foot.y, 3, 66, 0x5a3a1e).setOrigin(0.5, 1).setStrokeStyle(0.5, 0x2e1d0e).setDepth(foot.y + 0.5), foot);
        isoAnchor(scene.add.circle(foot.x, foot.y - 67, 2, 0xc8a050).setDepth(foot.y + 0.6), foot);
        const fb = scene.add.sprite(foot.x, foot.y - 62, "banner").setOrigin(0.5, 0).setDepth(foot.y + 1);
        isoAnchor(fb, foot);
        fb.play({ key: flap, startFrame: (tx + ty) % 3 });
        this.addLight(foot.x, foot.y, 0xffa040, 3, 0.6);
        continue;
      }
      const b = scene.add.sprite((tx + 0.5) * TILE, ty * TILE + 5 * K, "banner").setOrigin(0.5, 0).setDepth(-0.9);
      b.play({ key: flap, startFrame: (tx + ty) % 3 });
      this.addLight((tx + 0.5) * TILE, ty * TILE + 8 * K, 0xffa040, 3, 0.6);
    }
  }

  private ducksOnPond() {
    if (this.pond.length < 4) return;
    for (let i = 0; i < 4; i++) {
      const [tx, ty] = this.pond[Math.floor(hash(i, 0, 90) * this.pond.length)];
      const s = this.scene.add.sprite((tx + 0.5) * TILE, (ty + 0.5) * TILE, "duck", 0).setDepth(-1.5);
      this.ducks.push({ s, tx: s.x, ty: s.y, wait: 0 });
    }
  }

  private lighting() {
    // Night: multiply the world by a cool blue. Dusk: a warm orange wash. Lights are additive on top.
    this.night = this.scene.add.rectangle(0, 0, W, H, 0x2a3870).setOrigin(0, 0).setDepth(27000).setBlendMode(Phaser.BlendModes.MULTIPLY).setAlpha(0);
    this.dusk = this.scene.add.rectangle(0, 0, W, H, 0xff8a3a).setOrigin(0, 0).setDepth(27001).setAlpha(0);
    // Lit windows: warm panes baked once, faded in at night
    this.windows = this.scene.add.graphics().setDepth(27200).setAlpha(0);
    // (iso view: windows are on upright walls, the flat panes would land on the ground)
    if (!ISO) for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
      const t = OBJECTS[ty][tx];
      if (t === T.WINDOW_TIMBER) this.windows.fillStyle(0xffd27a, 1).fillRect(tx * TILE + 5 * K, ty * TILE + 5 * K, 6 * K, 6 * K);
      if (t === T.WINDOW_STONE) this.windows.fillStyle(0xffe0a0, 1).fillRect(tx * TILE + 6 * K, ty * TILE + 4 * K, 4 * K, 9 * K);
    }
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
      const t = OBJECTS[ty][tx];
      if (t === T.WINDOW_TIMBER || t === T.WINDOW_STONE) this.addLight((tx + 0.5) * TILE, (ty + 0.6) * TILE, 0xffc070, 1.4, 0.45, 0.03);
      if (t === T.CAMPFIRE) this.addLight((tx + 0.5) * TILE, (ty + 0.6) * TILE, 0xff9030, 5, 0.9, 0.15);
      if (t === T.BONFIRE && OBJECTS[ty - 1]?.[tx] !== T.BONFIRE && OBJECTS[ty][tx - 1] !== T.BONFIRE) this.addLight((tx + 1) * TILE, (ty + 0.8) * TILE, 0xff9030, 12, 1, 0.2);
    }
  }

  update(now: number, dtMs: number) {
    const { dark, warm } = dayPhase(dayTime(Date.now()));
    this.night.setAlpha(dark * 0.85);
    this.dusk.setAlpha(warm * 0.12);
    this.windows.setAlpha(Math.min(1, dark * 1.2) * 0.9);
    const cam = this.scene.cameras.main.worldView;
    for (const l of this.layers) l.update(cam);
    for (const l of this.lights) {
      if (!dark) { if (l.img.alpha) l.img.setAlpha(0); continue; }
      if (!cam.contains(l.img.x, l.img.y) && !cam.contains(l.img.x + 60, l.img.y + 60) && !cam.contains(l.img.x - 60, l.img.y - 60)) continue;
      const f = Math.sin(now / 90 + l.img.x) * 0.5 + Math.sin(now / 37 + l.img.y) * 0.5;
      l.img.setAlpha(dark * (l.base + f * l.flicker));
    }
    this.fireflies?.(dark);

    // Ducks paddle to a random spot on the pond, rest, then paddle on
    for (const d of this.ducks) {
      if (d.wait > 0) { d.wait -= dtMs; d.s.y = d.ty + Math.sin(now / 400 + d.tx) * 0.8; continue; }
      const dx = d.tx - d.s.x, dy = d.ty - d.s.y, dist = Math.hypot(dx, dy);
      if (dist < 1) {
        const [tx, ty] = this.pond[Math.floor(Math.random() * this.pond.length)];
        d.tx = (tx + 0.2 + Math.random() * 0.6) * TILE; d.ty = (ty + 0.2 + Math.random() * 0.6) * TILE;
        d.wait = 1500 + Math.random() * 4000;
        continue;
      }
      const sp = 7 * K * (dtMs / 1000);
      d.s.x += (dx / dist) * Math.min(sp, dist); d.s.y += (dy / dist) * Math.min(sp, dist);
      d.s.setFlipX(dx < 0).setFrame(Math.floor(now / 300) % 2);
    }
  }
}
