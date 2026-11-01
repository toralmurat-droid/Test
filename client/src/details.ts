import Phaser from "phaser";
import { MAP_H, MAP_W, TILE } from "../../shared/constants";
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

/** Bakes a Graphics drawing into a static image at the given depth. */
function bake(scene: Phaser.Scene, depth: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
  const g = scene.make.graphics({}, false);
  draw(g);
  const rt = scene.add.renderTexture(0, 0, W, H).setOrigin(0, 0).setDepth(depth);
  rt.draw(g);
  g.destroy();
  return rt;
}

function texture(scene: Phaser.Scene, key: string, w: number, h: number, frames: number, draw: (px: (x: number, y: number, c: number, a?: number) => void, f: number) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w * frames, h)!;
  const ctx = tex.getContext();
  for (let f = 0; f < frames; f++) {
    draw((x, y, c, a = 1) => { ctx.globalAlpha = a; ctx.fillStyle = "#" + c.toString(16).padStart(6, "0"); ctx.fillRect(f * w + x, y, 1, 1); }, f);
    tex.add(f, 0, f * w, 0, w, h);
  }
  ctx.globalAlpha = 1;
  tex.refresh();
}

function makeTextures(scene: Phaser.Scene) {
  texture(scene, "lantern", 5, 9, 1, (px) => {
    for (let x = 0; x < 5; x++) px(x, 0, 0x2a2a2a);
    px(2, 1, 0x2a2a2a);
    for (let y = 2; y < 8; y++) { px(0, y, 0x2a2a2a); px(4, y, 0x2a2a2a); }
    for (let y = 2; y < 8; y++) for (let x = 1; x < 4; x++) px(x, y, y < 4 ? 0xfff2b0 : 0xffc65a);
    for (let x = 0; x < 5; x++) px(x, 8, 0x2a2a2a);
    px(2, 5, 0xffffff);
  });
  texture(scene, "banner", 8, 14, 3, (px, f) => {
    for (let x = 0; x < 8; x++) px(x, 0, 0x5a3a1e);
    const sway = [0, 1, 0][f];
    for (let y = 1; y < 13; y++) {
      const o = y > 6 ? sway * ((y - 6) / 6) : 0;
      for (let x = 1; x < 7; x++) px(Math.round(x + o), y, x < 2 ? 0x7a1c1c : 0xa82a2a);
    }
    // golden oak leaf emblem
    for (const [x, y] of [[3, 4], [4, 4], [3, 5], [4, 5], [2, 5], [5, 5], [3, 6], [4, 6], [3, 7]]) px(x + (y > 6 ? sway : 0), y, 0xe8c060);
    // swallowtail end
    px(Math.round(1 + sway), 13, 0xa82a2a); px(Math.round(6 + sway), 13, 0xa82a2a);
  });
  texture(scene, "duck", 7, 6, 2, (px, f) => {
    const body = 0xf2f2ea, head = 0x2f7a4a;
    for (let x = 0; x < 6; x++) px(x, 3, body);
    for (let x = 1; x < 5; x++) px(x, 2, body);
    px(0, 2, 0xd8d8cc); px(5, 2, head); px(5, 1, head); px(6, 1 + f * 0, 0xf0a020); px(5, 0, head);
    px(5, 1, f ? 0x1a1a1a : head);
    for (let x = 0; x < 6; x++) px(x, 4, 0x9fc8ec, 0.7);
    px(f ? 0 : 6, 5, 0xd8ecff, 0.8);
  });
  texture(scene, "light", 32, 32, 1, (px) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5) / 16;
      if (d < 1) px(x, y, 0xffffff, (1 - d) ** 2);
    }
  });
}

/** Phase of the day: 0..1 darkness and a dusk warmth, shared by every client via the wall clock. */
function dayPhase(nowMs: number): { dark: number; warm: number } {
  const forced = new URLSearchParams(location.search).get("time");
  if (forced === "night") return { dark: 1, warm: 0 };
  if (forced === "dusk") return { dark: 0.45, warm: 1 };
  if (forced === "day") return { dark: 0, warm: 0 };
  const CYCLE = 8 * 60 * 1000; // 8-minute day
  const t = (nowMs % CYCLE) / CYCLE;
  // 0-.55 day, .55-.65 dusk, .65-.9 night, .9-1 dawn
  const ramp = (a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const dark = t < 0.55 ? 0 : t < 0.65 ? ramp(0.55, 0.65) : t < 0.9 ? 1 : 1 - ramp(0.9, 1);
  const warm = t > 0.5 && t < 0.7 ? Math.sin(((t - 0.5) / 0.2) * Math.PI) : t > 0.88 ? Math.sin(((t - 0.88) / 0.12) * Math.PI) * 0.6 : 0;
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

  constructor(private scene: Phaser.Scene) {
    makeTextures(scene);
    this.groundDecals();
    this.roundCorners();
    this.waterDecor();
    this.roofShading();
    this.lanternsAndBanners();
    this.ducksOnPond();
    this.lighting();
  }

  /** Lets the ambient layer brighten fireflies at night. */
  onDarkness(f: (dark: number) => void) { this.fireflies = f; }

  private groundDecals() {
    bake(this.scene, -1.7, (g) => {
      const px = (x: number, y: number, c: number, a = 1) => g.fillStyle(c, a).fillRect(x, y, 1, 1);
      for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
        const t = GROUND[ty][tx], X = tx * TILE, Y = ty * TILE;
        const free = OBJECTS[ty][tx] === EMPTY;
        if (GRASSY.has(t) && free) {
          const h = hash(tx, ty, 1), ox = Math.floor(hash(tx, ty, 2) * 12) + 2, oy = Math.floor(hash(tx, ty, 3) * 12) + 2;
          if (h < 0.08) { px(X + ox, Y + oy, 0x8d8d84); px(X + ox + 1, Y + oy, 0xb0b0a6); px(X + ox + 1, Y + oy + 1, 0x6e6e66); } // pebbles
          else if (h < 0.2) { px(X + ox, Y + oy, 0x2f6b24); px(X + ox + 2, Y + oy, 0x2f6b24); px(X + ox + 1, Y + oy + 1, 0x2f6b24); px(X + ox + 1, Y + oy - 1, 0x86c95a); } // tuft
          else if (h < 0.26) { for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1]]) px(X + ox + dx, Y + oy + dy, 0x4f9a3a); px(X + ox, Y + oy, 0x6fbf55); } // clover
          else if (h < 0.275) { px(X + ox, Y + oy + 1, 0xece0c8); px(X + ox - 1, Y + oy, 0xc0392b); px(X + ox, Y + oy, 0xd84343); px(X + ox + 1, Y + oy, 0xc0392b); px(X + ox, Y + oy - 1, 0xffffff); } // mushroom
          // fallen leaves under nearby oaks
          let oak = false;
          for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) if (obj(tx + dx, ty + dy) === T.TREE) oak = true;
          if (oak) for (let k = 0; k < 4; k++) {
            const lx = Math.floor(hash(tx, ty, 10 + k) * 15), ly = Math.floor(hash(tx, ty, 20 + k) * 15);
            px(X + lx, Y + ly, [0xd98a2b, 0xc8a13a, 0xb5562a, 0x8fae3a][k]);
          }
        }
        // Grass spilling over the edge of roads and the square: breaks up the tile grid
        if (t === T.DIRT || t === T.COBBLE || t === T.SAND) {
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            if (!GRASSY.has(gnd(tx + dx, ty + dy))) continue;
            for (let i = 0; i < 16; i++) {
              const depth = Math.floor(hash(tx * 16 + i, ty, 40 + dx * 3 + dy) * 3.2);
              for (let d = 0; d < depth; d++) {
                const x = dx === 0 ? X + i : dx < 0 ? X + d : X + 15 - d;
                const y = dy === 0 ? Y + i : dy < 0 ? Y + d : Y + 15 - d;
                px(x, y, d === depth - 1 ? 0x3f7a2a : 0x5a9a3c);
              }
            }
          }
          if (t === T.DIRT && hash(tx, ty, 50) < 0.35) { // small stones and ruts on roads
            const ox = Math.floor(hash(tx, ty, 51) * 13) + 1, oy = Math.floor(hash(tx, ty, 52) * 13) + 1;
            px(X + ox, Y + oy, 0x8a7a64); px(X + ox + 1, Y + oy, 0x6e604c);
          }
          if (t === T.COBBLE && hash(tx, ty, 53) < 0.2) { // moss between the cobbles
            const ox = Math.floor(hash(tx, ty, 54) * 14), oy = Math.floor(hash(tx, ty, 55) * 4) * 4 + 3;
            px(X + ox, Y + oy, 0x5f8f3f); px(X + ox + 1, Y + oy, 0x4a7a32);
          }
        }
      }
    });
  }

  /** Rounds the blocky corners of ponds, rivers and sandy banks so shorelines look natural. */
  private roundCorners() {
    const BASE: Record<number, number> = { [T.SAND]: 0xd9c38a, [T.GRASS]: 0x5a9a3c, [T.GRASS_DARK]: 0x4f8c36, [T.TALL_GRASS]: 0x5a9a3c, [T.FLOWERS]: 0x5a9a3c, [T.DIRT]: 0xa7814f };
    const wet = (t: number) => t === T.WATER || t === T.BRIDGE || t === -1;
    bake(this.scene, -1.59, (g) => {
      const R = 7;
      for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
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
            else if (foam && dist > R - 1) g.fillStyle(0xd8ecff, 0.7).fillRect(x, y, 1, 1);
          }
        }
      }
    });
  }

  private waterDecor() {
    bake(this.scene, -1.58, (g) => {
      const px = (x: number, y: number, c: number, a = 1) => g.fillStyle(c, a).fillRect(x, y, 1, 1);
      for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
        const t = GROUND[ty][tx], X = tx * TILE, Y = ty * TILE;
        if (t === T.WATER) {
          const pond = inArea("Mirror Pond", tx, ty);
          if (pond) this.pond.push([tx, ty]);
          if (pond && hash(tx, ty, 60) < 0.3) { // lily pad, sometimes with a flower
            const cx = X + 3 + Math.floor(hash(tx, ty, 61) * 9), cy = Y + 3 + Math.floor(hash(tx, ty, 62) * 9);
            for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) {
              if ((dx * dx) / 9 + (dy * dy) / 4 > 1 || (dx === 1 && dy <= 0 && dy > -2)) continue;
              px(cx + dx, cy + dy, dy > 0 ? 0x2f7a3a : 0x4f9a4a);
            }
            if (hash(tx, ty, 63) < 0.4) { px(cx - 1, cy - 1, 0xffd6e8); px(cx, cy - 2, 0xffffff); px(cx, cy - 1, 0xffd54f); }
          }
        }
        // Reeds and cattails on land right next to water
        if ((t === T.SAND || GRASSY.has(t)) && OBJECTS[ty][tx] === EMPTY) {
          let wet = false;
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) if (gnd(tx + dx, ty + dy) === T.WATER) wet = true;
          if (!wet || hash(tx, ty, 70) > 0.45) continue;
          for (let k = 0; k < 4; k++) {
            const x = X + 2 + Math.floor(hash(tx, ty, 71 + k) * 12), y = Y + 6 + Math.floor(hash(tx, ty, 75 + k) * 8), h = 4 + Math.floor(hash(tx, ty, 79 + k) * 4);
            for (let i = 0; i < h; i++) px(x + (i > h - 2 && k % 2 ? 1 : 0), y - i, i < 2 ? 0x3f6a2a : 0x6a9a3a);
            if (k % 2 === 0) { px(x, y - h, 0x6a4020); px(x, y - h + 1, 0x7a4a24); }
          }
        }
      }
    });
  }

  private roofShading() {
    const g = this.scene.add.graphics().setDepth(-0.95); // few shapes: a plain Graphics is cheaper than a full-map texture
    {
      for (const b of roofGroups()) {
        const X0 = b.x0 * TILE, X1 = (b.x1 + 1) * TILE, Y0 = b.y0 * TILE, Y1 = (b.y1 + 1) * TILE, w = X1 - X0, h = Y1 - Y0;
        const ridge = Y0 + Math.max(4, Math.round(h * 0.38));
        g.fillStyle(0x000000, 0.14).fillRect(X0, Y0, w, ridge - Y0); // far slope in shade
        g.fillStyle(0xffffff, 0.08).fillRect(X0, ridge, w, Y1 - ridge); // near slope catches the light
        g.fillStyle(0x000000, 0.35).fillRect(X0, ridge - 1, w, 1); // ridge cap
        g.fillStyle(0xffffff, 0.25).fillRect(X0, ridge, w, 1);
        for (let x = X0 + 2; x < X1 - 1; x += 4) g.fillStyle(0x000000, 0.25).fillRect(x, ridge - 2, 2, 1);
        g.fillStyle(0xffffff, 0.18).fillRect(X0, Y0, 1, h); // lit west edge
        g.fillStyle(0x000000, 0.22).fillRect(X1 - 2, Y0, 2, h); // shaded east edge
        g.fillStyle(0x000000, 0.25).fillRect(X0, Y0, w, 1);
        // eaves: a dark overhang line and its shadow falling on the wall below
        g.fillStyle(0x000000, 0.45).fillRect(X0 - 1, Y1 - 1, w + 2, 1);
        if (b.roof === T.ROOF_THATCH) for (let x = X0; x < X1; x += 2) g.fillStyle(0xd8b456, 1).fillRect(x, Y1, 1, 1 + ((x >> 1) % 2));
        let wallBelow = false;
        for (let x = b.x0; x <= b.x1; x++) if (WALLS.has(obj(x, b.y1 + 1))) wallBelow = true;
        if (wallBelow) g.fillStyle(0x000000, 0.28).fillRect(X0, Y1, w, 3);
      }
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
      const x = tx * TILE + (side > 0 ? 17 : -1), y = ty * TILE + 3;
      scene.add.image(x, y, "lantern").setOrigin(0.5, 0).setDepth(-0.9);
      this.addLight(x, y + 5, 0xffb347, 2.2, 0.75);
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
      const b = scene.add.sprite((tx + 0.5) * TILE, ty * TILE + 2, "banner").setOrigin(0.5, 0).setDepth(-0.9);
      b.play({ key: flap, startFrame: (tx + ty) % 3 });
      this.addLight((tx + 0.5) * TILE, ty * TILE + 8, 0xffa040, 3, 0.6);
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
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
      const t = OBJECTS[ty][tx];
      if (t === T.WINDOW_TIMBER) this.windows.fillStyle(0xffd27a, 1).fillRect(tx * TILE + 5, ty * TILE + 5, 6, 6);
      if (t === T.WINDOW_STONE) this.windows.fillStyle(0xffe0a0, 1).fillRect(tx * TILE + 6, ty * TILE + 4, 4, 9);
    }
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
      const t = OBJECTS[ty][tx];
      if (t === T.WINDOW_TIMBER || t === T.WINDOW_STONE) this.addLight((tx + 0.5) * TILE, (ty + 0.6) * TILE, 0xffc070, 1.4, 0.45, 0.03);
      if (t === T.CAMPFIRE) this.addLight((tx + 0.5) * TILE, (ty + 0.6) * TILE, 0xff9030, 5, 0.9, 0.15);
    }
  }

  update(now: number, dtMs: number) {
    const { dark, warm } = dayPhase(Date.now());
    this.night.setAlpha(dark * 0.85);
    this.dusk.setAlpha(warm * 0.12);
    this.windows.setAlpha(Math.min(1, dark * 1.2) * 0.9);
    const cam = this.scene.cameras.main.worldView;
    for (const l of this.lights) {
      if (!dark) { if (l.img.alpha) l.img.setAlpha(0); continue; }
      if (!cam.contains(l.img.x, l.img.y) && !cam.contains(l.img.x + 30, l.img.y + 30) && !cam.contains(l.img.x - 30, l.img.y - 30)) continue;
      const f = Math.sin(now / 90 + l.img.x) * 0.5 + Math.sin(now / 37 + l.img.y) * 0.5;
      l.img.setAlpha(dark * (l.base + f * l.flicker));
    }
    this.fireflies?.(dark);

    // Ducks paddle to a random spot on the pond, rest, then paddle on
    for (const d of this.ducks) {
      if (d.wait > 0) { d.wait -= dtMs; d.s.y = d.ty + Math.sin(now / 400 + d.tx) * 0.4; continue; }
      const dx = d.tx - d.s.x, dy = d.ty - d.s.y, dist = Math.hypot(dx, dy);
      if (dist < 1) {
        const [tx, ty] = this.pond[Math.floor(Math.random() * this.pond.length)];
        d.tx = (tx + 0.2 + Math.random() * 0.6) * TILE; d.ty = (ty + 0.2 + Math.random() * 0.6) * TILE;
        d.wait = 1500 + Math.random() * 4000;
        continue;
      }
      const sp = 7 * (dtMs / 1000);
      d.s.x += (dx / dist) * Math.min(sp, dist); d.s.y += (dy / dist) * Math.min(sp, dist);
      d.s.setFlipX(dx < 0).setFrame(Math.floor(now / 300) % 2);
    }
  }
}
