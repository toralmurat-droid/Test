import Phaser from "phaser";
import { ART_K as K, DESERT_Y0, MAP_H, MAP_W, TILE } from "../../shared/constants";
import { AREAS, elementLandAt, EMPTY, GROUND, OBJECTS, T } from "../../shared/map";
import { LAND_TREE_TINT } from "./elementArt";
import { DESERT_BUSH_TINT, palmTexture } from "./desertArt";
import { ANIMATED_TILES, animatedRows, drawTileFrame } from "./tileset";
import { refreshRegions } from "./texupload";
import { ISO, isoAnchor, isoX, isoY } from "./iso";
import { StaticChunks, staticObj } from "./staticChunks";
import { SMOOTH } from "./isoflag";
import { smoothTrees } from "./smoothArt";
import { hiResTexture } from "./smooth";
import { paintBonfire, smokeTexture } from "./bonfireArt";

/**
 * Living-world layer for Oakvale. Purely cosmetic and client-side (collision still comes from shared/map.ts):
 *  - animated tiles (water, mill wheel, campfire, grass and flowers swaying)
 *  - trees and bushes as tall sprites that sway in a travelling wind and hide players walking behind them
 *  - cast shadows from buildings, shoreline foam, chimneys with smoke, campfire sparks
 *  - butterflies, birds with shadows, fireflies in the woods, water ripples, drifting cloud shadows
 */

const WIND_X = 6; // px/s drift for smoke and clouds
const SOLID_BUILDING = new Set<number>([
  T.ROOF_THATCH, T.ROOF_RED, T.ROOF_SLATE, T.WALL_TIMBER, T.WALL_STONE, T.WINDOW_TIMBER, T.WINDOW_STONE, T.DOOR,
]);
const ROOFS = new Set<number>([T.ROOF_THATCH, T.ROOF_RED, T.ROOF_SLATE]);
const TREES = new Set<number>([T.TREE, T.PINE, T.BUSH, T.PALM]);

const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");
const obj = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? EMPTY : OBJECTS[y][x]);
const ground = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? -1 : GROUND[y][x]);

/** Small seeded RNG so decoration placement is the same for everyone. */
function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Screen box (iso px) a smoke or spark column can fill, for an emitter at world (x, y) anchored at (ax, ay). */
const plumeBox = (x: number, y: number, ax = x, ay = y): [number, number, number, number] => {
  const sx = x - ax + isoX(ax, ay), sy = y - ay + isoY(ax, ay);
  return [sx - 64, sy - 200, sx + 192, sy + 48];
};

// ---------- generated textures ----------

/** Paints one design pixel (k×k screen pixels); `fine` paints single screen pixels for full-resolution detail. */
type Px = ((x: number, y: number, c: number, a?: number) => void) & { k: number; fine: (x: number, y: number, c: number, a?: number) => void };
/** A generated spritesheet of `frames` frames, each w×h design pixels drawn k screen pixels wide. */
function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, frames: number, draw: (px: Px, f: number, ox: number) => void, k = 1) {
  if (scene.textures.exists(key)) return;
  const W = w * k, H = h * k;
  const tex = scene.textures.createCanvas(key, W * frames, H)!;
  const ctx = tex.getContext();
  for (let f = 0; f < frames; f++) {
    const ox = f * W;
    const fine = (x: number, y: number, c: number, a = 1) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      ctx.globalAlpha = a; ctx.fillStyle = hex(c); ctx.fillRect(ox + x, y, 1, 1);
    };
    const px = ((x: number, y: number, c: number, a = 1) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      ctx.globalAlpha = a; ctx.fillStyle = hex(c); ctx.fillRect(ox + x * k, y * k, k, k);
    }) as Px;
    px.k = k; px.fine = fine;
    draw(px, f, ox);
    tex.add(f, 0, ox, 0, W, H);
  }
  ctx.globalAlpha = 1;
  tex.refresh();
}
/** Filled ellipse in design pixels, rasterised per screen pixel (smooth edges at k > 1). */
function disc(px: Px, cx: number, cy: number, rx: number, ry: number, c: number | ((x: number, y: number) => number | undefined), a = 1) {
  const k = px.k;
  for (let y = Math.floor((cy - ry) * k); y <= (cy + ry) * k; y++) for (let x = Math.floor((cx - rx) * k); x <= (cx + rx) * k; x++) {
    const X = (x + 0.5) / k, Y = (y + 0.5) / k;
    const dx = (X - cx) / rx, dy = (Y - cy) / ry;
    if (dx * dx + dy * dy > 1) continue;
    const col = typeof c === "number" ? c : c(X - 0.5, Y - 0.5);
    if (col !== undefined) px.fine(x, y, col, a);
  }
}

function makeTextures(scene: Phaser.Scene) {
  if (SMOOTH) smoothTrees(scene, K); // painted trees and bushes (same keys: the pixel ones below are then skipped)
  // Oak: 24x28, 2 sway frames. Trunk base sits at the bottom centre (the collision tile).
  for (const [key, seed, dark, mid, light, hi] of [
    ["oak_a", 3, 0x2a5f26, 0x3a8031, 0x4f9c3e, 0x74bf55],
    ["oak_b", 7, 0x2d6329, 0x3f8a35, 0x56a845, 0x7cc95e],
  ] as const) {
    canvasTex(scene, key, 24, 28, 2, (px, f) => {
      const r = rng(seed);
      disc(px, 12, 25.5, 8, 2.2, 0x000000, 0.22);
      for (let y = 15; y < 26; y++) { px(11, y, 0x6b4426); px(12, y, 0x5a3820); px(13, y, 0x4e301a); }
      px(10, 25, 0x5a3820); px(14, 25, 0x4e301a);
      const s = f; // canopy shifts one pixel with the wind
      const lobes: [number, number, number, number][] = [[12, 11, 10.5, 8.5], [7, 13, 5.5, 4.5], [17, 13, 5.5, 4.5], [12, 6, 7, 5.5]];
      for (const [cx, cy, rx, ry] of lobes) disc(px, cx + s, cy, rx + 0.6, ry + 0.6, 0x1f4a1d);
      for (const [cx, cy, rx, ry] of lobes) disc(px, cx + s, cy, rx, ry, (x, y) => (y - cy > ry * 0.25 || x - cx > rx * 0.45 ? dark : mid));
      disc(px, 10 + s, 7.5, 6, 4.5, mid);
      disc(px, 9 + s, 6, 4, 2.8, light);
      // leaf clusters: small two-tone clumps at full resolution
      for (let k = 0; k < 70; k++) {
        const x = 4 + r() * 16, y = 2 + r() * 16;
        const dx = (x - 12) / 10, dy = (y - 10) / 8.5;
        if (dx * dx + dy * dy >= 0.85) continue;
        const fx = Math.floor((x + s) * K), fy = Math.floor(y * K), c = k % 3 ? dark : light;
        px.fine(fx, fy, c); px.fine(fx + 1, fy, c); px.fine(fx, fy + 1, k % 3 ? 0x1f4a1d : mid);
      }
      for (const [x, y] of [[7, 4], [8, 4], [6, 5], [11, 3], [9, 3.5], [5, 6.5]]) { px.fine((x + s) * K, y * K, hi); px.fine((x + s) * K + 1, y * K, hi); px.fine((x + s) * K, y * K + 1, light); }
      // bark texture
      for (let y = 15; y < 26; y += 2) px.fine(11 * K + 1 + ((y * 3) % 3), y * K, 0x3e2614);
    }, K);
  }
  // Pine: 20x30 design pixels, 2 sway frames (top sways more than the bottom). Drawn per screen pixel.
  canvasTex(scene, "pine", 20, 30, 2, (px, f) => {
    disc(px, 10, 27.5, 6.5, 2, 0x000000, 0.22);
    for (let y = 22 * K; y < 28 * K; y++) for (let x = 9 * K; x < 11 * K; x++) px.fine(x, y, x < 10 * K ? 0x5a3a1e : 0x4a2f18);
    const tiers: [number, number, number][] = [[0, 9, 1], [6, 16, 2.5], [12, 24, 4]];
    for (const [y0, y1, w0] of tiers) for (let fy = y0 * K; fy < y1 * K; fy++) {
      const y = fy / K, half = w0 + (y - y0) * 0.75, sway = f && y < 14 ? K * (1 - y / 14) * 1.5 : 0;
      const x0 = Math.round((10 - half) * K + sway), x1 = Math.round((10 + half) * K + sway);
      const edge = fy >= y1 * K - 2; // the needle fringe at the bottom of each tier
      for (let x = x0; x < x1; x++) {
        if (edge && (x + fy) % 3 === 0) continue;
        px.fine(x, fy, x < (x0 + x1) / 2 - 1 ? ((x + fy * 2) % 7 === 0 ? 0x3d8a5a : 0x2b7148) : (x + fy) % 6 === 0 ? 0x174530 : 0x1f5a3a);
      }
      px.fine(x0 - 1, fy, 0x174530); px.fine(x1, fy, 0x174530); px.fine(x0, fy, 0x3d8a5a);
      if (edge) for (let x = x0; x < x1; x += 3) px.fine(x, fy + 1, 0x174530);
    }
    px.fine(10 * K + f, 0, 0x4e9a6a); px.fine(10 * K + f - 1, 1, 0x4e9a6a);
  }, K);
  // Bush: 16x16, 2 frames.
  canvasTex(scene, "bush", 16, 16, 2, (px, f) => {
    disc(px, 8, 14.5, 6.5, 1.6, 0x000000, 0.22);
    disc(px, 8 + f * 0.5, 10.5, 6.8, 5, 0x1f4a1d);
    disc(px, 8 + f * 0.5, 10.5, 6.2, 4.5, 0x2f6b2a);
    disc(px, 7.5 + f, 10, 5, 3.6, 0x3f8a35);
    disc(px, 6 + f, 8.5, 2, 1.4, 0x5aa845);
    for (const [x, y] of [[10 + f, 10], [5, 12], [11, 12], [8, 13]]) { px(x, y, 0xd84343); px.fine(x * K, y * K, 0xff8a80); }
    for (let k = 0; k < 24; k++) { const a = k * 2.4, d = (k % 5) / 5; px.fine((8 + f * 0.5 + Math.cos(a) * 5.5 * d) * K, (10.5 + Math.sin(a) * 4 * d) * K, k % 2 ? 0x2f6b2a : 0x4f9a3a); }
  }, K);
  canvasTex(scene, "chimney", 5, 8, 1, (px) => {
    for (let y = 1; y < 8; y++) for (let x = 0; x < 5; x++) px(x, y, (y + (x >> 1)) % 3 ? 0x8a4a3a : 0x6a362a);
    for (let x = 0; x < 5; x++) px(x, 0, 0x4a4a4a);
    for (let y = 1; y < 8; y++) px(4, y, 0x5a2e22);
  }, K);
  canvasTex(scene, "puff", 8, 8, 1, (px) => disc(px, 4, 4, 3.6, 3.6, (x, y) => (x + y < 7 ? 0xf2f2f2 : 0xc8c8c8)), K);
  canvasTex(scene, "spark", 2, 2, 1, (px) => { px(0, 0, 0xffe066); px(1, 0, 0xffb23a); px(0, 1, 0xffb23a); px(1, 1, 0xff8c1a); });
  canvasTex(scene, "glow", 9, 9, 1, (px) => {
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const d = Math.hypot(x - 4, y - 4);
      if (d < 4.5) px(x, y, d < 1 ? 0xffffd0 : 0xd8ff6a, Math.max(0, 1 - d / 4.5) ** 1.6);
    }
  });
  canvasTex(scene, "butterfly", 5, 4, 2, (px, f) => {
    px(2, 1, 0x3a2a1a); px(2, 2, 0x3a2a1a);
    if (f === 0) { px(0, 0, 0xffffff); px(1, 0, 0xffffff); px(1, 1, 0xffffff); px(3, 0, 0xffffff); px(4, 0, 0xffffff); px(3, 1, 0xffffff); px(0, 2, 0xffffff); px(4, 2, 0xffffff); }
    else { px(1, 1, 0xffffff); px(1, 2, 0xffffff); px(3, 1, 0xffffff); px(3, 2, 0xffffff); }
  }, K);
  canvasTex(scene, "bird", 7, 4, 2, (px, f) => {
    px(3, 2, 0x2a2a30); px(3, 1, 0x2a2a30);
    if (f === 0) { px(0, 0, 0x2a2a30); px(1, 1, 0x2a2a30); px(2, 1, 0x2a2a30); px(4, 1, 0x2a2a30); px(5, 1, 0x2a2a30); px(6, 0, 0x2a2a30); }
    else { px(1, 2, 0x2a2a30); px(2, 2, 0x2a2a30); px(4, 2, 0x2a2a30); px(5, 2, 0x2a2a30); px(0, 3, 0x2a2a30); px(6, 3, 0x2a2a30); }
  }, K);
  canvasTex(scene, "cloud", 96, 56, 1, (px) => {
    const r = rng(11);
    const blobs = Array.from({ length: 7 }, () => [16 + r() * 64, 18 + r() * 20, 14 + r() * 14, 10 + r() * 8]);
    for (let y = 0; y < 56; y++) for (let x = 0; x < 96; x++) {
      let v = 0;
      for (const [cx, cy, rx, ry] of blobs) { const dx = (x - cx) / rx, dy = (y - cy) / ry; v = Math.max(v, 1 - (dx * dx + dy * dy)); }
      if (v > 0) px(x, y, 0x0a1a30, Math.min(1, v * 1.8));
    }
  });
}

// ---------- the ambient layer ----------

interface Flier { s: Phaser.GameObjects.Image; ax: number; ay: number; ph: number; sp: number; r: number }

export class Ambient {
  private frame = 0;
  private tileTimer = 0;
  private swayTimer = 0;
  private trees: Phaser.GameObjects.Image[] = [];
  /** Trees in the display list (iso: only those near the view, staticChunks.ts); the sway only touches these. */
  private liveTrees = new Set<Phaser.GameObjects.Image>();
  private butterflies: Flier[] = [];
  private fireflies: Flier[] = [];
  private clouds: Phaser.GameObjects.Image[] = [];
  private waterTiles: [number, number][] = [];
  private nextRipple = 0;
  private nextFlock = 4000;
  private dark = 0;

  /** 0 by day, 1 at night (fireflies glow brighter in the dark). */
  setDarkness(d: number) { this.dark = d; for (const o of this.fireLit) o.setAlpha(d * 0.6); }
  /** Additive copies of the fires above the night tint, so flames keep their colour in the dark. */
  private fireLit: Phaser.GameObjects.Image[] = [];
  private litCopy(s: Phaser.GameObjects.Sprite) {
    if (!SMOOTH) return s;
    const o = this.scene.add.image(s.x, s.y, "bonfire_lit", 0).setOrigin(s.originX, s.originY).setScale(s.scaleX).setBlendMode(Phaser.BlendModes.ADD).setDepth(27600).setAlpha(this.dark * 0.6);
    s.on(Phaser.Animations.Events.ANIMATION_UPDATE, () => o.setFrame(s.frame.name));
    this.fireLit.push(staticObj(this.scene, o));
    return s;
  }

  constructor(private scene: Phaser.Scene) {
    makeTextures(scene);
    this.buildShadows();
    this.buildShore();
    this.buildTrees();
    this.buildChimneys();
    this.buildCampfires();
    this.buildBonfires();
    this.buildButterflies();
    this.buildFireflies();
    this.buildClouds();
  }

  /** OBJECTS with trees removed — the tilemap object layer uses this; trees are drawn as sprites instead. */
  static objectLayerData(): number[][] {
    return OBJECTS.map((row) => row.map((t) => (TREES.has(t) ? EMPTY : t)));
  }

  private buildShadows() {
    // Buildings cast a soft shadow to the south-east onto the ground.
    const g = this.scene.add.graphics().setDepth(-1.5);
    g.fillStyle(0x000000, 0.18);
    const isB = (x: number, y: number) => SOLID_BUILDING.has(obj(x, y));
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (!isB(x, y)) continue;
      const tall = obj(x, y) !== T.PALISADE;
      if (!isB(x + 1, y)) g.fillRect((x + 1) * TILE, y * TILE + (isB(x + 1, y - 1) || !isB(x, y - 1) ? 4 * K : 0), (tall ? 4 : 2) * K, TILE);
      if (!isB(x, y + 1)) g.fillRect(x * TILE + (isB(x - 1, y + 1) || !isB(x - 1, y) ? 3 * K : 0), (y + 1) * TILE, TILE + (isB(x + 1, y) ? 0 : (tall ? 4 : 2) * K), (tall ? 3 : 2) * K);
    }
  }

  private buildShore() {
    // The shoreline itself (curved banks, wet sand, foam) is painted by details.ts; here only the water tiles are
    // listed for the sparkles.
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (GROUND[y][x] === T.WATER) this.waterTiles.push([x, y]);
  }

  private buildTrees() {
    const r = rng(42);
    const tints = SMOOTH ? [0xd4d8d4, 0xc6ccc8, 0xdcdfd8, 0xbcc4c0, 0xcfd2cc] : [0xffffff, 0xffffff, 0xf0fae8, 0xe6f2dc, 0xfffbe8]; // painted world: cold, dim
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const t = OBJECTS[y][x];
      if (!TREES.has(t)) continue;
      const oaks = SMOOTH ? ["oak_a", "oak_b", "oak_c", "oak_d", "oak_e", "oak_a", "oak_b", "oak_f"] : ["oak_a", "oak_b"];
      const pines = SMOOTH ? ["pine", "pine", "pine_b"] : ["pine"];
      const desert = y >= DESERT_Y0;
      const key = t === T.PALM ? palmTexture(this.scene, Math.floor(r() * 3)) : t === T.PINE ? pines[Math.floor(r() * pines.length)] : t === T.BUSH ? "bush" : oaks[Math.floor(r() * oaks.length)];
      const s = this.scene.add.image((x + 0.5) * TILE + (t === T.BUSH ? 0 : Math.round((r() * 2 - 1) * K)), (y + 1) * TILE, key, 0)
        .setOrigin(0.5, 1).setDepth((y + 1) * TILE - 2).setTint(tints[Math.floor(r() * tints.length)]);
      const land = elementLandAt(x + 0.5, y + 0.5, 3); // the elemental wilds: frosted, blighted, charred or storm-grey trees
      if (land && ((x * 7919 + y * 104729) % 97) / 97 < 0.35 + land.k * 0.65) s.setTint(LAND_TREE_TINT[land.land.el]);
      if (desert && t === T.BUSH) s.setTint(DESERT_BUSH_TINT); // thorn scrub, sun-bleached
      if (t === T.PALM) s.setTint(0xffffff);
      if (r() < (SMOOTH ? 0.5 : t === T.BUSH ? 0 : 0.25)) s.setFlipX(true);
      if (SMOOTH) s.setScale(t === T.BUSH ? 0.85 + r() * 0.3 : 0.82 + r() * 0.36); // no two trees the same size
      s.setData("ph", r() * 0.6);
      this.trees.push(staticObj(this.scene, s, { onLive: (on) => { if (on) this.liveTrees.add(s); else this.liveTrees.delete(s); } }));
    }
  }

  private buildChimneys() {
    // One chimney per roof (flood-filled groups of roof tiles), most of them smoking.
    const seen = new Set<number>();
    const r = rng(7);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (!ROOFS.has(OBJECTS[y][x]) || seen.has(y * MAP_W + x)) continue;
      const stack = [[x, y]]; let minY = y, maxX = x, minX = x;
      seen.add(y * MAP_W + x);
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        minY = Math.min(minY, cy); maxX = Math.max(maxX, cx); minX = Math.min(minX, cx);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          const k = ny * MAP_W + nx;
          if (ROOFS.has(obj(nx, ny)) && !seen.has(k)) { seen.add(k); stack.push([nx, ny]); }
        }
      }
      if (maxX - minX < 2) continue;
      const cx = (r() < 0.5 ? maxX - 1 : minX + 1) * TILE + 6 * K, cy = minY * TILE + 9 * K;
      staticObj(this.scene, this.scene.add.image(cx, cy, "chimney").setOrigin(0.5, 1).setDepth(-0.9));
      if (r() < 0.8) staticObj(this.scene, this.smoke(cx, cy - 8 * K, 0.9), { box: plumeBox(cx, cy - 8 * K), warm: SMOOTH ? 6500 : 3800 });
    }
  }

  private smoke(x: number, y: number, scale: number) {
    if (SMOOTH) {
      // pixel smoke in the fire's style: dithered grey puffs that rise slowly, spread and fade, drifting with the wind
      smokeTexture(this.scene);
      return this.scene.add.particles(x, y, "smoke_px", {
        frame: [0, 1, 2, 3],
        lifespan: { min: 4200, max: 6200 },
        speedY: { min: -6 * K, max: -3.5 * K },
        speedX: { min: (WIND_X * 0.3 - 1) * K, max: (WIND_X * 0.3 + 1.2) * K },
        accelerationX: WIND_X * 0.25 * K,
        scale: { start: 0.45 * scale, end: 1.5 * scale },
        alpha: { start: 0.5, end: 0 },
        frequency: 420,
      }).setDepth(25000);
    }
    return this.scene.add.particles(x, y, "puff", {
      lifespan: { min: 2600, max: 3600 },
      speedY: { min: -12 * K, max: -7 * K },
      speedX: { min: (WIND_X - 2) * K, max: (WIND_X + 3) * K },
      scale: { start: 0.5 * scale, end: 1.6 * scale },
      alpha: { start: 0.75, end: 0 },
      frequency: 320,
      rotate: { min: 0, max: 360 },
    }).setDepth(25000);
  }

  private buildCampfires() {
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (OBJECTS[y][x] !== T.CAMPFIRE) continue;
      const cx = (x + 0.5) * TILE, cy = y * TILE + 9 * K;
      if (ISO) {
        // Iso: a small upright fire (stone ring, crossed logs, flames) instead of the flat tile; sparks and smoke rise from its flames
        const fy = (y + 0.5) * TILE;
        this.bonfireTexture();
        staticObj(this.scene, this.litCopy(this.scene.add.sprite(cx, fy, "bonfire", 0).setOrigin(0.5, 46 / 56).setScale(0.42).setDepth(fy)).play({ key: "bonfire_burn", startFrame: (x + y) % 6 }));
        const glow = staticObj(this.scene, this.scene.add.image(cx, fy, "glow").setTint(0xffa040).setScale(6 * K).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD).setDepth(-0.8));
        this.scene.tweens.add({ targets: glow, alpha: 0.4, scale: 6.6 * K, duration: 180, yoyo: true, repeat: -1, ease: "Sine.easeInOut", repeatDelay: 60 });
        const sparks = this.scene.add.particles(cx, fy - 9 * K, "spark", {
          ...(SMOOTH
            ? { lifespan: { min: 1300, max: 2200 }, speedY: { min: -12 * K, max: -5 * K }, speedX: { min: -2 * K, max: 2 * K }, accelerationX: WIND_X * 0.4 * K, scale: { start: 0.8, end: 0.2 }, frequency: 260 }
            : { lifespan: { min: 500, max: 1100 }, speedY: { min: -30 * K, max: -14 * K }, speedX: { min: -8 * K, max: 10 * K }, scale: { start: 1.5, end: 0.4 }, frequency: 140 }),
          alpha: { start: 1, end: 0 }, blendMode: "ADD",
        }).setDepth(25000);
        isoAnchor(sparks, { x: cx, y: fy });
        staticObj(this.scene, sparks, { box: plumeBox(cx, fy - 9 * K, cx, fy), warm: 2800 });
        staticObj(this.scene, isoAnchor(this.smoke(cx, fy - 14 * K, 0.7), { x: cx, y: fy }), { box: plumeBox(cx, fy - 14 * K, cx, fy), warm: SMOOTH ? 6500 : 3800 });
        continue;
      }
      const glow = this.scene.add.image(cx, cy, "glow").setTint(0xffa040).setScale(6 * K).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD).setDepth(-0.8);
      this.scene.tweens.add({ targets: glow, alpha: 0.4, scale: 6.6 * K, duration: 180, yoyo: true, repeat: -1, ease: "Sine.easeInOut", repeatDelay: 60 });
      this.scene.add.particles(cx, cy - 2 * K, "spark", {
        lifespan: { min: 500, max: 1100 }, speedY: { min: -30 * K, max: -14 * K }, speedX: { min: -8 * K, max: 10 * K },
        scale: { start: 1.5, end: 0.4 }, alpha: { start: 1, end: 0 }, frequency: 140, blendMode: "ADD",
      }).setDepth(25000);
      this.smoke(cx, cy - 6 * K, 0.7);
    }
  }

  /** Paints the bonfire spritesheet: a ring of stones, crossed logs and a tall flickering fire (6 frames of 48x56). */
  private bonfireTexture() {
    const FW = 48, FH = 56, N = 6;
    if (this.scene.textures.exists("bonfire")) return;
    if (SMOOTH) {
      // hand-built pixel fire with depth: pit, stone ring, leaning pyre and a dithered fire field (bonfireArt.ts)
      const M = 8;
      hiResTexture(this.scene, "bonfire", FW * K, FH * K, M, 4, (g, f) => { g.scale(K, K); paintBonfire(g, f, M); });
      hiResTexture(this.scene, "bonfire_lit", FW * K, FH * K, M, 4, (g, f) => { g.scale(K, K); paintBonfire(g, f, M, true); });
      this.scene.anims.create({ key: "bonfire_burn", frames: this.scene.anims.generateFrameNumbers("bonfire", { start: 0, end: M - 1 }), frameRate: 10, repeat: -1 });
      return;
    }
    const tex = this.scene.textures.createCanvas("bonfire", FW * N * K, FH * K)!;
    const g = tex.getContext();
    g.save(); g.scale(K, K); // drawn on the design grid, scaled up (ellipses and flames stay smooth)
    const px = (x: number, y: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
    for (let f = 0; f < N; f++) {
      const ox = f * FW, cx = ox + 24, by = 46;
      // shadow and ring of stones
      g.fillStyle = "rgba(0,0,0,0.3)"; g.beginPath(); g.ellipse(cx, by + 2, 21, 8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#2b2420"; g.beginPath(); g.ellipse(cx, by, 15, 6, 0, 0, Math.PI * 2); g.fill();
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2, sx = Math.round(cx + Math.cos(a) * 17 - 2), sy = Math.round(by + Math.sin(a) * 7 - 2);
        g.fillStyle = "#5c5850"; g.fillRect(sx, sy + 1, 5, 3);
        g.fillStyle = k % 3 ? "#8f897c" : "#a39d90"; g.fillRect(sx, sy, 5, 3);
        g.fillStyle = "#c0baad"; g.fillRect(sx + 1, sy, 2, 1);
      }
      // crossed logs and embers
      for (const [x0, y0, x1, y1] of [[cx - 12, by + 3, cx + 10, by - 4], [cx - 10, by - 4, cx + 12, by + 3], [cx - 3, by + 4, cx + 2, by - 6]]) {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let t = 0; t <= n; t++) {
          const x = Math.round(x0 + ((x1 - x0) * t) / n), y = Math.round(y0 + ((y1 - y0) * t) / n);
          px(x, y, "#6b4426"); px(x, y + 1, "#6b4426"); px(x, y + 2, "#3e2814");
          if ((t + f) % 5 === 0) px(x, y, "#ff7a1a");
        }
      }
      for (let k = 0; k < 10; k++) px(cx - 9 + ((k * 7 + f * 3) % 19), by - 1 + ((k * 5) % 4), k % 2 ? "#ffb33a" : "#ff6a1a");
      // flames: three layered tongues that sway and stretch frame to frame
      const layer = (w: number, h: number, col: string, phase: number) => {
        g.fillStyle = col;
        for (let y = 0; y < h; y++) {
          const t = y / h, sway = Math.sin(f * 1.05 + phase + t * 3) * 3 * t;
          const half = w * Math.sqrt(1 - t) * (0.85 + 0.15 * Math.sin(f * 2.1 + y * 0.7 + phase));
          if (half < 0.5) continue;
          g.fillRect(Math.round(cx + sway - half), by - 3 - y, Math.max(1, Math.round(half * 2)), 1);
        }
        // detached licks of flame
        const ly = by - 3 - h - 2 - ((f * 3 + phase * 5) % 6);
        g.fillRect(Math.round(cx + Math.sin(f + phase) * 4), Math.round(ly), 2, 2);
      };
      layer(11, 30 + (f % 3) * 2, "#e8501a", 0);
      layer(8, 24 + ((f + 1) % 3) * 2, "#ff9a2a", 1.3);
      layer(5, 16 + ((f + 2) % 3), "#ffd65a", 2.1);
      layer(2, 8, "#fff6c0", 2.8);
    }
    g.restore();
    for (let f = 0; f < N; f++) tex.add(f, 0, f * FW * K, 0, FW * K, FH * K);
    tex.refresh();
    this.scene.anims.create({ key: "bonfire_burn", frames: this.scene.anims.generateFrameNumbers("bonfire", { start: 0, end: N - 1 }), frameRate: 9, repeat: -1 });
  }

  /** The great bonfire in the square: a 2x2 BONFIRE block gets one big animated fire, glow, sparks and smoke. */
  private buildBonfires() {
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (OBJECTS[y][x] !== T.BONFIRE || OBJECTS[y - 1]?.[x] === T.BONFIRE || OBJECTS[y][x - 1] === T.BONFIRE) continue;
      this.bonfireTexture();
      const cx = (x + 1) * TILE, cy = (y + 1) * TILE + 6 * K;
      staticObj(this.scene, this.litCopy(this.scene.add.sprite(cx, cy - 4 * K, "bonfire", 0).setOrigin(0.5, 46 / 56).setScale(0.68).setDepth(cy)).play("bonfire_burn")); // in scale with the heroes
      const glow = staticObj(this.scene, this.scene.add.image(cx, cy - 10 * K, "glow").setTint(0xffa040).setScale(10 * K).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(-0.8));
      this.scene.tweens.add({ targets: glow, alpha: 0.45, scale: 11 * K, duration: 220, yoyo: true, repeat: -1, ease: "Sine.easeInOut", repeatDelay: 40 });
      const sparks = this.scene.add.particles(cx, cy - 14 * K, "spark", {
        ...(SMOOTH
          ? { lifespan: { min: 1600, max: 2800 }, speedY: { min: -16 * K, max: -7 * K }, speedX: { min: -3 * K, max: 3 * K }, accelerationX: WIND_X * 0.4 * K, scale: { start: 0.9, end: 0.2 }, frequency: 170 }
          : { lifespan: { min: 700, max: 1600 }, speedY: { min: -45 * K, max: -18 * K }, speedX: { min: -14 * K, max: 14 * K }, scale: { start: 2, end: 0.3 }, frequency: 60 }),
        alpha: { start: 1, end: 0 }, blendMode: "ADD",
      }).setDepth(25000);
      staticObj(this.scene, sparks, { box: plumeBox(cx, cy - 14 * K), warm: 2800 });
      staticObj(this.scene, this.smoke(cx, cy - 24 * K, 1.1), { box: plumeBox(cx, cy - 24 * K), warm: SMOOTH ? 6500 : 3800 });
    }
  }

  private buildButterflies() {
    const r = rng(99);
    const spots: [number, number][] = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (GROUND[y][x] === T.FLOWERS && OBJECTS[y][x] === EMPTY) spots.push([x, y]);
    const cols = [0xffffff, 0xfff176, 0xffb3d9, 0x9ad1ff, 0xffa64d];
    for (let i = 0; i < Math.min(60, spots.length); i++) {
      const [x, y] = spots[Math.floor(r() * spots.length)];
      const s = this.scene.add.image((x + 0.5) * TILE, (y + 0.5) * TILE, "butterfly", 0).setTint(cols[i % cols.length]).setDepth(21000);
      this.butterflies.push({ s, ax: s.x, ay: s.y, ph: r() * 100, sp: 0.6 + r() * 0.6, r: 10 + r() * 18 });
    }
  }

  private buildFireflies() {
    const woods = AREAS.find((a) => a.name === "Whispering Woods");
    if (!woods) return;
    const r = rng(5);
    for (let i = 0; i < 80; i++) {
      const x = (woods.x + r() * woods.w) * TILE, y = (woods.y + r() * woods.h) * TILE;
      const s = this.scene.add.image(x, y, "glow").setBlendMode(Phaser.BlendModes.ADD).setDepth(21000).setScale(0.7);
      this.fireflies.push({ s, ax: x, ay: y, ph: r() * 100, sp: 0.3 + r() * 0.4, r: 8 + r() * 14 });
    }
  }

  private buildClouds() {
    const r = rng(3);
    for (let i = 0; i < 16; i++) {
      const c = this.scene.add.image(r() * MAP_W * TILE, r() * MAP_H * TILE, "cloud")
        .setScale((2.5 + r() * 2) * K).setAlpha(0.1).setDepth(24000);
      c.setData("v", 0.6 + r() * 0.8);
      this.clouds.push(c);
    }
  }

  private spawnFlock(now: number) {
    const cam = this.scene.cameras.main.worldView;
    const fromLeft = Math.random() < 0.5;
    const n = 3 + Math.floor(Math.random() * 4);
    const y0 = cam.y + Math.random() * cam.height;
    const x0 = fromLeft ? cam.x - 30 : cam.right + 30, x1 = fromLeft ? cam.right + 60 : cam.x - 60;
    const dur = 7000 + Math.random() * 3000, rise = (Math.random() - 0.5) * cam.height * 0.6;
    for (let i = 0; i < n; i++) {
      const ox = (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 7 * K, oy = Math.ceil(i / 2) * 6 * K * (fromLeft ? 1 : -1) * (i % 2 ? 1 : -1) * 0.5 + Math.abs(ox) * 0.6;
      const bird = this.scene.add.sprite(x0 - (fromLeft ? Math.abs(ox) : -Math.abs(ox)), y0 + oy, "bird", 0).setDepth(26000).setFlipX(!fromLeft);
      const shadow = this.scene.add.ellipse(bird.x + 18 * K, bird.y + 46 * K, 6 * K, 2 * K, 0x000000, 0.18).setDepth(-1.4);
      bird.play({ key: "bird_flap", frameRate: 6 + Math.random() * 3, startFrame: i % 2 });
      this.scene.tweens.add({
        targets: bird, x: x1 - (fromLeft ? Math.abs(ox) : -Math.abs(ox)), y: bird.y + rise, duration: dur,
        onUpdate: () => shadow.setPosition(bird.x + 18 * K, bird.y + 46 * K),
        onComplete: () => { bird.destroy(); shadow.destroy(); },
      });
    }
    this.nextFlock = now + 9000 + Math.random() * 9000;
  }

  private ripple() {
    if (!this.waterTiles.length) return;
    const cam = this.scene.cameras.main.worldView;
    for (let tries = 0; tries < 12; tries++) {
      const [tx, ty] = this.waterTiles[Math.floor(Math.random() * this.waterTiles.length)];
      const x = (tx + Math.random()) * TILE, y = (ty + Math.random()) * TILE;
      if (!cam.contains(x, y)) continue;
      const ring = this.scene.add.ellipse(x, y, 4, 2).setStrokeStyle(1, 0xd8ecff, 0.8).setDepth(-1.55);
      ring.isFilled = false;
      this.scene.tweens.add({ targets: ring, scaleX: 5, scaleY: 5, alpha: 0, duration: 1300, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
      if (Math.random() < 0.15) { // a fish jumps
        const fish = this.scene.add.rectangle(x, y, 3 * K, K, 0xc0d8e8).setDepth(-1.5);
        this.scene.tweens.add({ targets: fish, y: y - 6 * K, duration: 220, yoyo: true, onComplete: () => fish.destroy() });
      }
      return;
    }
  }

  update(now: number, dtMs: number) {
    const scene = this.scene;
    if (!scene.anims.exists("bird_flap")) scene.anims.create({ key: "bird_flap", frames: scene.anims.generateFrameNumbers("bird", { start: 0, end: 1 }), repeat: -1 });

    // Animated tiles: repaint the moving tiles of the shared tileset texture.
    this.tileTimer += dtMs;
    if (this.tileTimer > 160) {
      this.tileTimer = 0;
      this.frame++;
      const tex = scene.textures.get("tiles") as Phaser.Textures.CanvasTexture;
      const ctx = tex.getContext();
      for (const id of ANIMATED_TILES) {
        if (id === T.TALL_GRASS || id === T.FLOWERS) { if (this.frame % 2) continue; drawTileFrame(ctx, id, this.frame >> 1); }
        else drawTileFrame(ctx, id, this.frame);
      }
      // upload just the repainted tiles, not the whole 1440x4096 tileset
      refreshRegions(scene, tex, ANIMATED_TILES.map((id) => [id * TILE, 0, TILE, animatedRows(id) * TILE]));
    }

    const cam = scene.cameras.main.worldView;
    const t = now / 1000;

    // Trees sway as a gust travels across the map (only those on screen are updated).
    this.swayTimer += dtMs;
    if (this.swayTimer > 110) {
      this.swayTimer = 0;
      for (const s of StaticChunks.get(scene) ? this.liveTrees : this.trees) {
        const on = !(s.x < cam.x - 24 * K || s.x > cam.right + 24 * K || s.y < cam.y || s.y > cam.bottom + 40 * K);
        if (s.visible !== on) s.setVisible(on); // off-screen trees are skipped entirely by the renderer
        if (!on) continue;
        const gust = Math.sin((s.x * 0.018 + s.y * 0.006) / K - t * 1.3) + 0.35 * Math.sin(t * 0.7 + s.getData("ph") * 10);
        s.setFrame(gust > 0.75 ? 1 : 0);
      }
    }

    for (const b of this.butterflies) {
      const k = t * b.sp + b.ph;
      b.s.setPosition(b.ax + Math.sin(k) * b.r + Math.sin(k * 2.3) * 4, b.ay + Math.sin(k * 1.7) * b.r * 0.5 - 6 * K + Math.sin(k * 6) * 1.5);
      b.s.setFrame(Math.floor(now / 90 + b.ph * 7) % 2);
    }
    for (const f of this.fireflies) {
      const k = t * f.sp + f.ph;
      f.s.setPosition(f.ax + Math.sin(k) * f.r, f.ay + Math.cos(k * 1.3) * f.r * 0.7);
      f.s.setAlpha(Math.max(0, Math.sin(k * 3.1)) * (0.25 + this.dark * 0.75)).setDepth(this.dark > 0.3 ? 27600 : 21000);
    }
    for (const c of this.clouds) {
      c.x += WIND_X * K * c.getData("v") * (dtMs / 1000);
      c.y += 1.2 * K * c.getData("v") * (dtMs / 1000);
      if (c.x - c.displayWidth / 2 > MAP_W * TILE) c.x = -c.displayWidth / 2;
      if (c.y - c.displayHeight / 2 > MAP_H * TILE) c.y = -c.displayHeight / 2;
    }

    if (now > this.nextRipple) { this.ripple(); this.nextRipple = now + 350 + Math.random() * 500; }
    if (now > this.nextFlock) this.spawnFlock(now);
  }
}
