import Phaser from "phaser";
import { MAP_H, MAP_W, TILE } from "../../shared/constants";
import { TILE_COUNT } from "../../shared/map";
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
export const ISO = (() => {
  const q = new URLSearchParams(location.search).get("iso");
  if (q !== null) {
    try { localStorage.setItem("iso", q === "0" ? "0" : "1"); } catch { /* private mode */ }
    return q !== "0";
  }
  try { return localStorage.getItem("iso") === "1"; } catch { return false; }
})();

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
    for (const [name, grid, depth] of [["ground", ground, -2], ["objects", objects, -1]] as const) {
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
