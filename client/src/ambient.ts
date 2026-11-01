import Phaser from "phaser";
import { MAP_H, MAP_W, TILE } from "../../shared/constants";
import { AREAS, EMPTY, GROUND, OBJECTS, T } from "../../shared/map";
import { ANIMATED_TILES, drawTileFrame } from "./tileset";

/**
 * Living-world layer for Oakvale. Purely cosmetic and client-side (collision still comes from shared/map.ts):
 *  - animated tiles (water, mill wheel, campfire, grass and flowers swaying)
 *  - trees and bushes as tall sprites that sway in a travelling wind and hide players walking behind them
 *  - cast shadows from buildings, shoreline foam, chimneys with smoke, campfire sparks
 *  - butterflies, birds with shadows, fireflies in the woods, water ripples, drifting cloud shadows
 */

const WIND_X = 6; // px/s drift for smoke and clouds
const SOLID_BUILDING = new Set<number>([
  T.ROOF_THATCH, T.ROOF_RED, T.ROOF_SLATE, T.WALL_TIMBER, T.WALL_STONE, T.WINDOW_TIMBER, T.WINDOW_STONE, T.DOOR, T.PALISADE, T.RUIN,
]);
const ROOFS = new Set<number>([T.ROOF_THATCH, T.ROOF_RED, T.ROOF_SLATE]);
const TREES = new Set<number>([T.TREE, T.PINE, T.BUSH]);

const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");
const obj = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? EMPTY : OBJECTS[y][x]);
const ground = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? -1 : GROUND[y][x]);

/** Small seeded RNG so decoration placement is the same for everyone. */
function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// ---------- generated textures ----------

type Px = (x: number, y: number, c: number, a?: number) => void;
function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, frames: number, draw: (px: Px, f: number, ox: number) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w * frames, h)!;
  const ctx = tex.getContext();
  for (let f = 0; f < frames; f++) {
    const ox = f * w;
    draw((x, y, c, a = 1) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      ctx.globalAlpha = a; ctx.fillStyle = hex(c); ctx.fillRect(ox + Math.round(x), Math.round(y), 1, 1);
    }, f, ox);
    tex.add(f, 0, ox, 0, w, h);
  }
  ctx.globalAlpha = 1;
  tex.refresh();
}
function disc(px: Px, cx: number, cy: number, rx: number, ry: number, c: number | ((x: number, y: number) => number | undefined), a = 1) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy > 1) continue;
    const col = typeof c === "number" ? c : c(x, y);
    if (col !== undefined) px(x, y, col, a);
  }
}

function makeTextures(scene: Phaser.Scene) {
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
      for (let k = 0; k < 26; k++) {
        const x = 4 + Math.floor(r() * 16), y = 2 + Math.floor(r() * 16);
        const dx = (x - 12) / 10, dy = (y - 10) / 8.5;
        if (dx * dx + dy * dy < 0.85) px(x + s, y, k % 3 ? dark : light);
      }
      px(7 + s, 4, hi); px(8 + s, 4, hi); px(6 + s, 5, hi); px(11 + s, 3, hi);
    });
  }
  // Pine: 20x30, 2 sway frames (top sways more than the bottom).
  canvasTex(scene, "pine", 20, 30, 2, (px, f) => {
    disc(px, 10, 27.5, 6.5, 2, 0x000000, 0.22);
    for (let y = 22; y < 28; y++) { px(9, y, 0x5a3a1e); px(10, y, 0x4a2f18); }
    const tiers: [number, number, number][] = [[0, 9, 1], [6, 16, 2.5], [12, 24, 4]];
    for (const [y0, y1, w0] of tiers) for (let y = y0; y < y1; y++) {
      const half = w0 + (y - y0) * 0.75, sway = f && y < 14 ? 1 : 0;
      const x0 = Math.round(10 - half) + sway, x1 = Math.round(10 + half) + sway;
      for (let x = x0; x < x1; x++) px(x, y, x < (x0 + x1) / 2 ? 0x2b7148 : 0x1f5a3a);
      px(x0 - 1, y, 0x174530); px(x1, y, 0x174530); px(x0, y, 0x3d8a5a);
      if (y === y1 - 1) for (let x = x0; x < x1; x += 2) px(x, y, 0x174530);
    }
    px(10 + f, 0, 0x4e9a6a);
  });
  // Bush: 16x16, 2 frames.
  canvasTex(scene, "bush", 16, 16, 2, (px, f) => {
    disc(px, 8, 14.5, 6.5, 1.6, 0x000000, 0.22);
    disc(px, 8 + f * 0.5, 10.5, 6.8, 5, 0x1f4a1d);
    disc(px, 8 + f * 0.5, 10.5, 6.2, 4.5, 0x2f6b2a);
    disc(px, 7.5 + f, 10, 5, 3.6, 0x3f8a35);
    disc(px, 6 + f, 8.5, 2, 1.4, 0x5aa845);
    px(10 + f, 10, 0xd84343); px(5, 12, 0xd84343); px(11, 12, 0xd84343);
  });
  canvasTex(scene, "chimney", 5, 8, 1, (px) => {
    for (let y = 1; y < 8; y++) for (let x = 0; x < 5; x++) px(x, y, (y + (x >> 1)) % 3 ? 0x8a4a3a : 0x6a362a);
    for (let x = 0; x < 5; x++) px(x, 0, 0x4a4a4a);
    for (let y = 1; y < 8; y++) px(4, y, 0x5a2e22);
  });
  canvasTex(scene, "puff", 8, 8, 1, (px) => disc(px, 4, 4, 3.6, 3.6, (x, y) => (x + y < 7 ? 0xf2f2f2 : 0xc8c8c8)));
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
  });
  canvasTex(scene, "bird", 7, 4, 2, (px, f) => {
    px(3, 2, 0x2a2a30); px(3, 1, 0x2a2a30);
    if (f === 0) { px(0, 0, 0x2a2a30); px(1, 1, 0x2a2a30); px(2, 1, 0x2a2a30); px(4, 1, 0x2a2a30); px(5, 1, 0x2a2a30); px(6, 0, 0x2a2a30); }
    else { px(1, 2, 0x2a2a30); px(2, 2, 0x2a2a30); px(4, 2, 0x2a2a30); px(5, 2, 0x2a2a30); px(0, 3, 0x2a2a30); px(6, 3, 0x2a2a30); }
  });
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

interface Flier { s: Phaser.GameObjects.Sprite; ax: number; ay: number; ph: number; sp: number; r: number }

export class Ambient {
  private frame = 0;
  private tileTimer = 0;
  private swayTimer = 0;
  private trees: Phaser.GameObjects.Sprite[] = [];
  private butterflies: Flier[] = [];
  private fireflies: Flier[] = [];
  private clouds: Phaser.GameObjects.Image[] = [];
  private waterTiles: [number, number][] = [];
  private nextRipple = 0;
  private nextFlock = 4000;
  private dark = 0;

  /** 0 by day, 1 at night (fireflies glow brighter in the dark). */
  setDarkness(d: number) { this.dark = d; }

  constructor(private scene: Phaser.Scene) {
    makeTextures(scene);
    this.buildShadows();
    this.buildShore();
    this.buildTrees();
    this.buildChimneys();
    this.buildCampfires();
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
      if (!isB(x + 1, y)) g.fillRect((x + 1) * TILE, y * TILE + (isB(x + 1, y - 1) || !isB(x, y - 1) ? 4 : 0), tall ? 4 : 2, TILE);
      if (!isB(x, y + 1)) g.fillRect(x * TILE + (isB(x - 1, y + 1) || !isB(x - 1, y) ? 3 : 0), (y + 1) * TILE, TILE + (isB(x + 1, y) ? 0 : tall ? 4 : 2), tall ? 3 : 2);
    }
  }

  private buildShore() {
    // Dark bank under land on the north edge, pale foam where water meets land; the foam gently pulses.
    const bank = this.scene.add.graphics().setDepth(-1.6);
    const foam = this.scene.add.graphics().setDepth(-1.6);
    const water = (x: number, y: number) => { const g = ground(x, y); return g === T.WATER || g === -1; };
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (GROUND[y][x] !== T.WATER) continue;
      this.waterTiles.push([x, y]);
      const X = x * TILE, Y = y * TILE;
      if (!water(x, y - 1)) { bank.fillStyle(0x1d4a7a, 0.55).fillRect(X, Y, TILE, 3); foam.fillStyle(0xd8ecff, 0.8).fillRect(X, Y + 3, TILE, 1); }
      if (!water(x, y + 1)) foam.fillStyle(0xd8ecff, 0.8).fillRect(X, Y + TILE - 1, TILE, 1);
      if (!water(x - 1, y)) { bank.fillStyle(0x1d4a7a, 0.35).fillRect(X, Y, 1, TILE); foam.fillStyle(0xd8ecff, 0.7).fillRect(X + 1, Y, 1, TILE); }
      if (!water(x + 1, y)) foam.fillStyle(0xd8ecff, 0.7).fillRect(X + TILE - 1, Y, 1, TILE);
    }
    this.scene.tweens.add({ targets: foam, alpha: 0.35, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }

  private buildTrees() {
    const r = rng(42);
    const tints = [0xffffff, 0xffffff, 0xf0fae8, 0xe6f2dc, 0xfffbe8];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const t = OBJECTS[y][x];
      if (!TREES.has(t)) continue;
      const key = t === T.PINE ? "pine" : t === T.BUSH ? "bush" : r() < 0.5 ? "oak_a" : "oak_b";
      const s = this.scene.add.sprite((x + 0.5) * TILE + (t === T.BUSH ? 0 : Math.round(r() * 2 - 1)), (y + 1) * TILE, key, 0)
        .setOrigin(0.5, 1).setDepth((y + 1) * TILE - 2).setTint(tints[Math.floor(r() * tints.length)]);
      if (t !== T.BUSH && r() < 0.25) s.setFlipX(true);
      s.setData("ph", r() * 0.6);
      this.trees.push(s);
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
      const cx = (r() < 0.5 ? maxX - 1 : minX + 1) * TILE + 6, cy = minY * TILE + 9;
      this.scene.add.image(cx, cy, "chimney").setOrigin(0.5, 1).setDepth(-0.9);
      if (r() < 0.8) this.smoke(cx, cy - 8, 0.9);
    }
  }

  private smoke(x: number, y: number, scale: number) {
    this.scene.add.particles(x, y, "puff", {
      lifespan: { min: 2600, max: 3600 },
      speedY: { min: -12, max: -7 },
      speedX: { min: WIND_X - 2, max: WIND_X + 3 },
      scale: { start: 0.5 * scale, end: 1.6 * scale },
      alpha: { start: 0.75, end: 0 },
      frequency: 320,
      rotate: { min: 0, max: 360 },
    }).setDepth(25000);
  }

  private buildCampfires() {
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (OBJECTS[y][x] !== T.CAMPFIRE) continue;
      const cx = (x + 0.5) * TILE, cy = y * TILE + 9;
      const glow = this.scene.add.image(cx, cy, "glow").setTint(0xffa040).setScale(6).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD).setDepth(-0.8);
      this.scene.tweens.add({ targets: glow, alpha: 0.4, scale: 6.6, duration: 180, yoyo: true, repeat: -1, ease: "Sine.easeInOut", repeatDelay: 60 });
      this.scene.add.particles(cx, cy - 2, "spark", {
        lifespan: { min: 500, max: 1100 }, speedY: { min: -30, max: -14 }, speedX: { min: -8, max: 10 },
        scale: { start: 1, end: 0.3 }, alpha: { start: 1, end: 0 }, frequency: 140, blendMode: "ADD",
      }).setDepth(25000);
      this.smoke(cx, cy - 6, 0.7);
    }
  }

  private buildButterflies() {
    const r = rng(99);
    const spots: [number, number][] = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (GROUND[y][x] === T.FLOWERS && OBJECTS[y][x] === EMPTY) spots.push([x, y]);
    const cols = [0xffffff, 0xfff176, 0xffb3d9, 0x9ad1ff, 0xffa64d];
    for (let i = 0; i < Math.min(26, spots.length); i++) {
      const [x, y] = spots[Math.floor(r() * spots.length)];
      const s = this.scene.add.sprite((x + 0.5) * TILE, (y + 0.5) * TILE, "butterfly", 0).setTint(cols[i % cols.length]).setDepth(21000);
      this.butterflies.push({ s, ax: s.x, ay: s.y, ph: r() * 100, sp: 0.6 + r() * 0.6, r: 10 + r() * 18 });
    }
  }

  private buildFireflies() {
    const woods = AREAS.find((a) => a.name === "Whispering Woods");
    if (!woods) return;
    const r = rng(5);
    for (let i = 0; i < 40; i++) {
      const x = (woods.x + r() * woods.w) * TILE, y = (woods.y + r() * woods.h) * TILE;
      const s = this.scene.add.sprite(x, y, "glow").setBlendMode(Phaser.BlendModes.ADD).setDepth(21000).setScale(0.7);
      this.fireflies.push({ s, ax: x, ay: y, ph: r() * 100, sp: 0.3 + r() * 0.4, r: 8 + r() * 14 });
    }
  }

  private buildClouds() {
    const r = rng(3);
    for (let i = 0; i < 7; i++) {
      const c = this.scene.add.image(r() * MAP_W * TILE, r() * MAP_H * TILE, "cloud")
        .setScale(2.5 + r() * 2).setAlpha(0.1).setDepth(24000);
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
      const ox = (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 7, oy = Math.ceil(i / 2) * 6 * (fromLeft ? 1 : -1) * (i % 2 ? 1 : -1) * 0.5 + Math.abs(ox) * 0.6;
      const bird = this.scene.add.sprite(x0 - (fromLeft ? Math.abs(ox) : -Math.abs(ox)), y0 + oy, "bird", 0).setDepth(26000).setFlipX(!fromLeft);
      const shadow = this.scene.add.ellipse(bird.x + 18, bird.y + 46, 6, 2, 0x000000, 0.18).setDepth(-1.4);
      bird.play({ key: "bird_flap", frameRate: 6 + Math.random() * 3, startFrame: i % 2 });
      this.scene.tweens.add({
        targets: bird, x: x1 - (fromLeft ? Math.abs(ox) : -Math.abs(ox)), y: bird.y + rise, duration: dur,
        onUpdate: () => shadow.setPosition(bird.x + 18, bird.y + 46),
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
      const ring = this.scene.add.ellipse(x, y, 2, 1).setStrokeStyle(1, 0xd8ecff, 0.8).setDepth(-1.55);
      ring.isFilled = false;
      this.scene.tweens.add({ targets: ring, scaleX: 5, scaleY: 5, alpha: 0, duration: 1300, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
      if (Math.random() < 0.15) { // a fish jumps
        const fish = this.scene.add.rectangle(x, y, 3, 1, 0xc0d8e8).setDepth(-1.5);
        this.scene.tweens.add({ targets: fish, y: y - 6, duration: 220, yoyo: true, onComplete: () => fish.destroy() });
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
      tex.refresh();
    }

    const cam = scene.cameras.main.worldView;
    const t = now / 1000;

    // Trees sway as a gust travels across the map (only those on screen are updated).
    this.swayTimer += dtMs;
    if (this.swayTimer > 110) {
      this.swayTimer = 0;
      for (const s of this.trees) {
        if (s.x < cam.x - 24 || s.x > cam.right + 24 || s.y < cam.y || s.y > cam.bottom + 40) continue;
        const gust = Math.sin(s.x * 0.018 + s.y * 0.006 - t * 1.3) + 0.35 * Math.sin(t * 0.7 + s.getData("ph") * 10);
        s.setFrame(gust > 0.75 ? 1 : 0);
      }
    }

    for (const b of this.butterflies) {
      const k = t * b.sp + b.ph;
      b.s.setPosition(b.ax + Math.sin(k) * b.r + Math.sin(k * 2.3) * 4, b.ay + Math.sin(k * 1.7) * b.r * 0.5 - 6 + Math.sin(k * 6) * 1.5);
      b.s.setFrame(Math.floor(now / 90 + b.ph * 7) % 2);
    }
    for (const f of this.fireflies) {
      const k = t * f.sp + f.ph;
      f.s.setPosition(f.ax + Math.sin(k) * f.r, f.ay + Math.cos(k * 1.3) * f.r * 0.7);
      f.s.setAlpha(Math.max(0, Math.sin(k * 3.1)) * (0.25 + this.dark * 0.75)).setDepth(this.dark > 0.3 ? 27600 : 21000);
    }
    for (const c of this.clouds) {
      c.x += WIND_X * c.getData("v") * (dtMs / 1000);
      c.y += 1.2 * c.getData("v") * (dtMs / 1000);
      if (c.x - c.displayWidth / 2 > MAP_W * TILE) c.x = -c.displayWidth / 2;
      if (c.y - c.displayHeight / 2 > MAP_H * TILE) c.y = -c.displayHeight / 2;
    }

    if (now > this.nextRipple) { this.ripple(); this.nextRipple = now + 350 + Math.random() * 500; }
    if (now > this.nextFlock) this.spawnFlock(now);
  }
}
