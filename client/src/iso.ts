import Phaser from "phaser";
import { MAP_H, MAP_W, TILE } from "../../shared/constants";
import { T, TILE_COUNT } from "../../shared/map";
import { ROWS, ANIMATED_TILES } from "./tileset";

/**
 * Isometric view (phase 1). The game world (server, collisions, movement, every x/y in the client) stays the
 * same top-down grid. Only the drawing is projected: a world point (x, y) is shown at
 *   screen x = x - y,  screen y = (x + y) / 2
 * so one 32x32 world tile becomes a 64x32 diamond.
 *
 * How it works without touching the rest of the client:
 * - Ground and object tiles: an ISOMETRIC Phaser tilemap with a diamond tileset derived from the square one.
 * - Flat things painted in world coordinates (shadows, shore, baked detail chunks, lit windows, night tint):
 *   moved into a container whose transform is exactly the projection, so they are skewed onto the ground.
 * - Everything else (heroes, monsters, NPCs, trees, props, labels, effects): just before each frame is drawn,
 *   its position is swapped to the projected one (and back right after), and its depth is re-sorted by
 *   screen height, so front/back order is right.
 * Turned on with ?iso=1 in the address (or localStorage "iso" = "1").
 */
export { ISO } from "./isoflag";
import { ISO } from "./isoflag";

export const isoX = (x: number, y: number) => x - y;
export const isoY = (x: number, y: number) => (x + y) / 2;
/** Screen point back to the world (inverse of the projection). */
export const fromIso = (sx: number, sy: number) => ({ x: sy + sx / 2, y: sy - sx / 2 });

/** Diamond tile size (screen px) and the bleed added around each diamond so neighbours overlap without seams. */
const IW = TILE * 2, IH = TILE, BLEED = 1;

/** Objects at or above this depth are overlays (effects, texts, night tint): their depth is kept as is. */
const OVERLAY_DEPTH = 5000;

// Upright graphics drawn in world coordinates around an entity (HP bars, shield ring): projected as a block
// following that entity, not skewed.
const anchors = new WeakMap<Phaser.GameObjects.GameObject, { x: number; y: number }>();
export function isoAnchor(g: Phaser.GameObjects.GameObject, to: { x: number; y: number }) {
  if (ISO) anchors.set(g, to);
  return g;
}

/** Screen direction (anim facing) of a world-space movement or aim vector. */
export function screenDir(dx: number, dy: number, fallback: string): "up" | "down" | "left" | "right" {
  if (!ISO) return fallback as any;
  const sx = dx - dy, sy = (dx + dy) / 2;
  if (Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6) return fallback as any;
  // Diamonds are twice as wide as tall: compare the screen vector with that ratio in mind.
  if (Math.abs(sx) > Math.abs(sy) * 2) return sx > 0 ? "right" : "left";
  return sy > 0 ? "down" : "up";
}

/** Keyboard on screen axes (W = up the screen) turned into world input. */
export function isoInput(up: boolean, down: boolean, left: boolean, right: boolean) {
  if (!ISO) return { up, down, left, right };
  // Screen up = world (-1,-1), screen right = world (1,-1)
  const v = +right - +left, h = +down - +up; // screen right/down amounts
  const wx = v + h, wy = h - v;
  return { up: wy < 0, down: wy > 0, left: wx < 0, right: wx > 0 };
}

/** Builds the diamond tileset texture "tiles_iso" from the square "tiles" canvas. */
function bakeIsoTiles(scene: Phaser.Scene, ids?: number[]) {
  const src = (scene.textures.get("tiles") as Phaser.Textures.CanvasTexture).getSourceImage() as HTMLCanvasElement;
  let tex = scene.textures.exists("tiles_iso") ? scene.textures.get("tiles_iso") as Phaser.Textures.CanvasTexture : undefined;
  const CW = IW + BLEED * 2, CH = IH + BLEED * 2;
  if (!tex) tex = scene.textures.createCanvas("tiles_iso", TILE_COUNT * CW, ROWS * CH)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  const cols = ids ?? [...Array(TILE_COUNT).keys()];
  for (let row = 0; row < ROWS; row++) for (const id of cols) {
    const ox = id * CW, oy = row * CH;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(ox, oy, CW, CH);
    // (0,0)->(top vertex) (T,0)->(right) (0,T)->(left) (T,T)->(bottom); slightly enlarged into the bleed
    const k = 1 + (BLEED * 2) / IH;
    ctx.setTransform(k, k / 2, -k, k / 2, ox + CW / 2, oy);
    ctx.drawImage(src, id * TILE, row * TILE, TILE, TILE, 0, 0, TILE, TILE);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  tex.refresh();
}

/** Only the tiles whose diamond is on screen (Phaser's own iso cull walks the whole map every frame). */
function isoCull(layer: Phaser.Tilemaps.LayerData, camera: Phaser.Cameras.Scene2D.Camera, out: Phaser.Tilemaps.Tile[]) {
  out.length = 0;
  const v = camera.worldView, m = 2;
  // centre of tile (tx, ty) on screen: x = (tx - ty) * IW/2, y = (tx + ty + 1) * IH/2
  const d0 = Math.floor(v.x / (IW / 2)) - m, d1 = Math.ceil(v.right / (IW / 2)) + m;
  const s0 = Math.floor(v.y / (IH / 2)) - 1 - m, s1 = Math.ceil(v.bottom / (IH / 2)) + m;
  const rows = layer.data;
  for (let ty = Math.max(0, Math.floor((s0 - d1) / 2)); ty <= Math.min(layer.height - 1, Math.ceil((s1 - d0) / 2)); ty++) {
    const a = Math.max(0, ty + d0, s0 - ty), b = Math.min(layer.width - 1, ty + d1, s1 - ty);
    const row = rows[ty];
    for (let tx = a; tx <= b; tx++) {
      const t = row[tx];
      if (t && t.index !== -1 && t.visible && t.alpha !== 0) out.push(t);
    }
  }
  return out;
}

export class IsoView {
  private flat = new Map<number, Phaser.GameObjects.Container>();
  private flatSet = new Set<Phaser.GameObjects.Container>();
  /** Objects projected this frame (their world x/y are kept on them as __isoX/__isoY and put back after drawing). */
  private saved: Phaser.GameObjects.GameObject[] = [];
  private hidden: Phaser.GameObjects.GameObject[] = [];
  private seen = new WeakSet<Phaser.GameObjects.GameObject>();
  private frame = 0;
  private tileTimer = 0;

  /** Iso tilemap layers in place of the square ones (same data, same tile indices). */
  static tilemap(scene: Phaser.Scene, ground: number[][], objects: number[][]) {
    bakeIsoTiles(scene);
    // The orientation has to be known when the Tilemap is built (it picks its coordinate helpers then)
    const data = new Phaser.Tilemaps.MapData({
      width: MAP_W, height: MAP_H, tileWidth: IW, tileHeight: IH, orientation: Phaser.Tilemaps.Orientation.ISOMETRIC,
    } as any);
    const map = new Phaser.Tilemaps.Tilemap(scene, data);
    const tiles = map.addTilesetImage("tiles_iso", "tiles_iso", IW + BLEED * 2, IH + BLEED * 2, 0, 0, 0, { x: BLEED, y: BLEED })!;
    const flatObjects = isoStanding(scene, objects);
    for (const [name, grid, depth] of [["ground", ground, -2], ["objects", flatObjects, -1]] as const) {
      const layer = map.createBlankLayer(name, tiles, -IW / 2, 0)!;
      layer.putTilesAt(grid as number[][], 0, 0).setDepth(depth);
      (layer as any).cullCallback = isoCull;
    }
    return map;
  }

  constructor(private scene: Phaser.Scene) {
    const ev = scene.game.events;
    const pre = () => this.pre(), post = () => this.post();
    ev.on(Phaser.Core.Events.PRE_RENDER, pre);
    ev.on(Phaser.Core.Events.POST_RENDER, post);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { ev.off(Phaser.Core.Events.PRE_RENDER, pre); ev.off(Phaser.Core.Events.POST_RENDER, post); });
    const cam = scene.cameras.main;
    cam.removeBounds();
    // Clicks (e.g. on NPCs) are tested between frames, when objects are back at world x/y: project them for the test
    const mgr = scene.input.manager as any, hit = mgr.hitTest;
    if (!mgr.__iso) {
      mgr.__iso = true;
      mgr.hitTest = function (pointer: any, objects: any[], camera: any, output?: any) {
        const back: [any, number, number][] = [];
        for (const o of objects) if (o.scrollFactorX !== 0 && o.x !== undefined && o.parentContainer == null) {
          back.push([o, o.x, o.y]); const x = o.x, y = o.y; o.x = isoX(x, y); o.y = isoY(x, y);
        }
        try { return hit.call(this, pointer, objects, camera, output); } finally { for (const [o, x, y] of back) { o.x = x; o.y = y; } }
      };
    }
  }

  /** Keep animated tiles (water, grass, wheel, fire) moving in the diamond tileset too. */
  update(dtMs: number) {
    this.tileTimer += dtMs;
    if (this.tileTimer > 160) { this.tileTimer = 0; bakeIsoTiles(this.scene, ANIMATED_TILES); }
  }

  /** Flat ground painting in world coordinates: skew it into the iso ground plane. */
  private isFlat(o: any): boolean {
    if (anchors.has(o)) return false;
    if (o.type === "Graphics") return o.x === 0 && o.y === 0;
    if (o.type === "RenderTexture") return true;
    if ((o.type === "Image" || o.type === "Rectangle") && o.originX === 0 && o.originY === 0 && o.displayWidth >= TILE * 8) return true;
    return false;
  }

  private flatLayer(depth: number) {
    let c = this.flat.get(depth);
    if (!c) {
      // scaleY(1/2) * rotate(45deg) * scale(sqrt 2) maps (x, y) to (x - y, (x + y) / 2)
      const inner = this.scene.add.container(0, 0).setRotation(Math.PI / 4).setScale(Math.SQRT2);
      c = this.scene.add.container(0, 0, [inner]).setScale(1, 0.5).setDepth(depth);
      this.flat.set(depth, c);
      this.flatSet.add(c);
    }
    return c.list[0] as Phaser.GameObjects.Container;
  }

  private pre() {
    const list = this.scene.children.list as any[];
    const flatContainers = this.flatSet;
    const frame = ++this.frame;
    const cam = this.scene.cameras.main as any, follow = cam._follow;
    const v = cam.worldView as Phaser.Geom.Rectangle, M = 256; // world box seen last frame (set in post), plus a margin
    const vx0 = v.x - M, vy0 = v.y - M, vx1 = v.right + M, vy1 = v.bottom + M;
    const saved = this.saved as any[], hidden = this.hidden as any[];
    saved.length = 0; hidden.length = 0;
    let moved: any[] | undefined;
    // Pass 1: remember world positions; new flat paintings move into the ground plane
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.scrollFactorX === 0 || o.type === "TilemapLayer" || o.x === undefined || flatContainers.has(o)) continue;
      if (!this.seen.has(o)) {
        this.seen.add(o);
        if (this.isFlat(o)) { (moved ??= []).push(o); continue; }
      }
      if (!o.visible) continue;
      if (o.depth < OVERLAY_DEPTH && (o.x < vx0 || o.x > vx1 || o.y < vy0 || o.y > vy1) && o !== follow && !anchors.has(o)) {
        // Far off screen: not drawn this frame (its world x/y would land somewhere random on screen)
        o.visible = false; hidden.push(o);
        continue;
      }
      o.__isoF = frame; o.__isoX = o.x; o.__isoY = o.y;
      saved.push(o);
    }
    if (moved) for (const o of moved) { this.scene.children.remove(o); this.flatLayer(o.depth).add(o); }
    // Pass 2: project
    for (let i = 0; i < saved.length; i++) {
      const o = saved[i];
      const wx = o.__isoX, wy = o.__isoY;
      const a = anchors.get(o);
      let ax = wx, ay = wy;
      if (a) { const r = a as any; ax = r.__isoF === frame ? r.__isoX : r.x; ay = r.__isoF === frame ? r.__isoY : r.y; }
      o.x = wx + isoX(ax, ay) - ax;
      o.y = wy + isoY(ax, ay) - ay;
      // Depth: overlays and ground decorations keep theirs; the rest sorts by the screen height of the feet
      const g = o.__isoD;
      const orig = g !== undefined && g === o.depth ? o.__isoO : o.depth;
      if (orig >= OVERLAY_DEPTH || orig < 0) { if (o.depth !== orig) o.setDepth(orig); o.__isoD = undefined; continue; }
      const mine = orig - ay + isoY(ax, ay);
      if (o.depth !== mine) o.setDepth(mine);
      o.__isoD = mine; o.__isoO = orig;
    }
  }

  private post() {
    const saved = this.saved as any[];
    for (let i = 0; i < saved.length; i++) { const o = saved[i]; o.x = o.__isoX; o.y = o.__isoY; }
    for (const o of this.hidden as any[]) o.visible = true;
    saved.length = 0; this.hidden.length = 0;
    // The rest of the client culls with cam.worldView in world coordinates: give it the world box seen on screen.
    const cam = this.scene.cameras.main, v = cam.worldView;
    const pts = [fromIso(v.x, v.y), fromIso(v.right, v.y), fromIso(v.x, v.bottom), fromIso(v.right, v.bottom)];
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    v.setTo(x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0);
  }
}

// ---------- phase 2: standing objects ----------

const id = (index: number) => (index < 0 ? -1 : index % TILE_COUNT);
const ROOF_IDS = new Set<number>([T.ROOF_THATCH, T.ROOF_RED, T.ROOF_SLATE]);
const FACADE = new Set<number>([T.WALL_TIMBER, T.WALL_STONE, T.WINDOW_TIMBER, T.WINDOW_STONE, T.DOOR]);
/** Block height (screen px) of each wall-like object; their tile art goes on the top and both visible sides. */
const BLOCK_H: Partial<Record<number, number>> = {
  [T.ROOF_THATCH]: 44, [T.ROOF_RED]: 44, [T.ROOF_SLATE]: 44,
  [T.WALL_TIMBER]: 44, [T.WALL_STONE]: 44, [T.WINDOW_TIMBER]: 44, [T.WINDOW_STONE]: 44, [T.DOOR]: 44,
  [T.RUIN]: 22, [T.BEAM]: 18, [T.STALL_RED]: 14, [T.STALL_BLUE]: 14,
};
/** Small things drawn upright from their (3/4 view) tile art, standing on the tile. */
const UPRIGHT = new Set<number>([
  T.ROCK, T.WELL, T.BARREL, T.CRATE, T.ANVIL, T.GRAVE, T.HAY, T.WHEEL, T.SIGN, T.STUMP, T.SIGNPOST,
]);

/** Tile image (square, from "tiles") as a frame name, added on first use. */
function tileFrame(scene: Phaser.Scene, index: number) {
  const tex = scene.textures.get("tiles"), name = `t${index}`;
  if (!tex.has(name)) tex.add(name, 0, (index % TILE_COUNT) * TILE, Math.floor(index / TILE_COUNT) * TILE, TILE, TILE);
  return name;
}

/**
 * A wall-like tile as an iso block: `top` tile art on the top diamond, `side` tile art on the two faces we see
 * (south-west and south-east), the faces shaded.
 */
function blockTexture(scene: Phaser.Scene, top: number, side: number, h: number) {
  const key = `blk_${top}_${side}_${h}`;
  if (scene.textures.exists(key)) return key;
  const src = (scene.textures.get("tiles") as Phaser.Textures.CanvasTexture).getSourceImage() as HTMLCanvasElement;
  const tex = scene.textures.createCanvas(key, IW, IH + h)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  const sx = (i: number) => (i % TILE_COUNT) * TILE, sy = (i: number) => Math.floor(i / TILE_COUNT) * TILE;
  const face = (a: number, b: number, e: number, f: number, shade: number) => {
    ctx.save();
    ctx.beginPath();
    if (b > 0) { ctx.moveTo(0, IH / 2); ctx.lineTo(IW / 2, IH); ctx.lineTo(IW / 2, IH + h); ctx.lineTo(0, IH / 2 + h); }
    else { ctx.moveTo(IW / 2, IH); ctx.lineTo(IW, IH / 2); ctx.lineTo(IW, IH / 2 + h); ctx.lineTo(IW / 2, IH + h); }
    ctx.closePath(); ctx.clip();
    ctx.setTransform(a, b, 0, (h + 1) / TILE, e, f);
    ctx.drawImage(src, sx(side), sy(side), TILE, TILE, 0, 0, TILE + 1, TILE);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(20,16,40,${shade})`;
    ctx.fillRect(0, 0, IW, IH + h);
    ctx.restore();
  };
  // the faces hang under the top diamond's lower edges
  face(1, 0.5, 0, IH / 2, 0.22);
  face(1, -0.5, IW / 2, IH, 0.4);
  ctx.setTransform(1, 0.5, -1, 0.5, IW / 2, 0);
  ctx.drawImage(src, sx(top), sy(top), TILE, TILE, 0, 0, TILE + 0.5, TILE + 0.5);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // a thin dark rim where the top meets the faces
  ctx.strokeStyle = "rgba(20,16,40,0.35)";
  ctx.beginPath(); ctx.moveTo(0, IH / 2); ctx.lineTo(IW / 2, IH); ctx.lineTo(IW, IH / 2); ctx.stroke();
  tex.refresh();
  return key;
}

const FENCES = new Set<number>([T.FENCE, T.FENCE_V]);

/**
 * Palisade and fences: wooden posts along the line to each connected neighbour (mask bits N=1 E=2 S=4 W=8).
 * Palisade posts are tall pointed stakes, fences low posts with two rails. `broken` knocks some stakes down.
 */
function stakesTexture(scene: Phaser.Scene, fence: boolean, mask: number, broken: boolean) {
  const key = `stk_${fence ? "f" : "p"}_${mask}_${broken ? 1 : 0}`;
  if (scene.textures.exists(key)) return key;
  const H = fence ? 12 : 30, W = IW, HT = IH + H;
  const tex = scene.textures.createCanvas(key, W, HT)!;
  const ctx = tex.getContext();
  // footprint centre of the tile in this canvas, and the screen step of one world px along x / y
  const c = { x: IW / 2, y: H + IH / 2 };
  const along = (wx: number, wy: number) => ({ x: c.x + (wx - wy), y: c.y + (wx + wy) / 2 });
  const dirs: [number, number, number][] = [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]];
  const pts: { x: number; y: number; k: number }[] = [];
  let k = 0;
  const step = fence ? 8 : 4;
  for (const [bit, dx, dy] of dirs) if (mask & bit) for (let d = 0; d <= TILE / 2; d += step) pts.push({ ...along(dx * d, dy * d), k: k++ });
  if (!mask || !pts.length) pts.push({ ...along(0, 0), k: 0 });
  const seen = new Set<string>();
  const posts = pts.filter((p) => { const s = `${Math.round(p.x)},${Math.round(p.y)}`; if (seen.has(s)) return false; seen.add(s); return true; })
    .sort((a, b) => a.y - b.y);
  const wood = ["#6b4a2b", "#7d5733", "#5e4026"], dark = "#3b2817", light = "#a07448";
  if (fence) {
    // two rails between the posts
    for (const [bit, dx, dy] of dirs) if (mask & bit) {
      const a = along(0, 0), b = along(dx * TILE / 2, dy * TILE / 2);
      for (const hh of [4, 9]) { ctx.strokeStyle = "#7d5733"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a.x, a.y - hh); ctx.lineTo(b.x, b.y - hh); ctx.stroke(); }
    }
  }
  posts.forEach((p, i) => {
    let h = fence ? H : H - ((i * 7 + mask) % 3) * 2;
    if (broken && (i * 13 + mask * 5) % 4 === 0) h = Math.round(h * 0.35);
    const x = Math.round(p.x) - 1, y = Math.round(p.y);
    ctx.fillStyle = wood[i % 3]; ctx.fillRect(x - 1, y - h, 3, h);
    ctx.fillStyle = light; ctx.fillRect(x - 1, y - h, 1, h);
    ctx.fillStyle = dark; ctx.fillRect(x + 1, y - h, 1, h);
    if (!fence && h > 10) { ctx.fillStyle = wood[i % 3]; ctx.fillRect(x, y - h - 2, 1, 2); } // pointed tip
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x - 1, y, 4, 1); // contact shadow
  });
  tex.refresh();
  return key;
}

/**
 * Object tiles that stand up: walls, houses, ruins and the palisade become blocks, small props stand upright.
 * Returns the object grid with those removed (what is left is drawn flat by the tilemap).
 */
export function isoStanding(scene: Phaser.Scene, objects: number[][]): number[][] {
  const out = objects.map((r) => r.slice());
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? -1 : objects[y][x]);
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const index = objects[ty][tx], t = id(index);
    if (t < 0) continue;
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    const h = BLOCK_H[t];
    if (t === T.PALISADE || FENCES.has(t)) {
      const same = (x: number, y: number) => { const n = id(at(x, y)); return t === T.PALISADE ? n === T.PALISADE : FENCES.has(n); };
      const mask = (same(tx, ty - 1) ? 1 : 0) | (same(tx + 1, ty) ? 2 : 0) | (same(tx, ty + 1) ? 4 : 0) | (same(tx - 1, ty) ? 8 : 0);
      const broken = t === T.PALISADE && (Math.floor(index / TILE_COUNT) & 64) !== 0;
      const key = stakesTexture(scene, t !== T.PALISADE, mask, broken);
      const H = t === T.PALISADE ? 30 : 12;
      scene.add.image(cx, cy, key).setOrigin(0.5, (H + IH / 2) / (IH + H)).setDepth(cy);
      out[ty][tx] = -1;
    } else if (h !== undefined) {
      // A house facade shows the roof above it on top; its own art (windows, door) goes on the sides.
      let top = index, side = index;
      if (FACADE.has(t)) {
        for (let k = 1; k < 8; k++) { const up = at(tx, ty - k); if (ROOF_IDS.has(id(up))) { top = up; break; } if (!FACADE.has(id(up))) break; }
      } else if (ROOF_IDS.has(t)) {
        for (let k = 1; k < 16; k++) { const dn = at(tx, ty + k); if (FACADE.has(id(dn))) { side = dn; break; } if (!ROOF_IDS.has(id(dn))) break; }
      }
      const key = blockTexture(scene, top, side, h);
      // origin = the centre of the footprint diamond, so the block stands on its tile
      scene.add.image(cx, cy, key).setOrigin(0.5, (IH / 2 + h) / (IH + h)).setDepth(cy);
      out[ty][tx] = -1;
    } else if (UPRIGHT.has(t)) {
      // 3/4 view art: its bottom edge stands on the tile's centre, a little forward
      scene.add.image(cx, cy, "tiles", tileFrame(scene, index)).setOrigin(0.5, 0.85).setDepth(cy);
      out[ty][tx] = -1;
    }
  }
  return out;
}
