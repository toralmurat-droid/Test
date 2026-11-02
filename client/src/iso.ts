import Phaser from "phaser";
import { MAP_H, MAP_W, TILE } from "../../shared/constants";
import { T, TILE_COUNT } from "../../shared/map";
import { ROWS, ANIMATED_TILES } from "./tileset";
import { BUILDINGS, buildBarns, buildHouses, buildStalls, ruinWallTexture } from "./isobuild";
import { buildBridges } from "./isobridge";

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
import { ISO, SMOOTH } from "./isoflag";
import { SmoothGround } from "./smoothground";
import { hiResTexture } from "./smooth";
import { uprightTexture } from "./smoothProps";

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

// Things already drawn in screen (iso) coordinates, e.g. chunks of upright grass and flowers: left as they are.
const screenSpace = new WeakSet<Phaser.GameObjects.GameObject>();
export function isoScreen<O extends Phaser.GameObjects.GameObject>(o: O) { screenSpace.add(o); return o; }

/** Screen direction (anim facing) of a world-space movement or aim vector. */
export function screenDir(dx: number, dy: number, fallback: string): "up" | "down" | "left" | "right" {
  if (!ISO) return fallback as any;
  const sx = dx - dy, sy = (dx + dy) / 2;
  if (Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6) return fallback as any;
  // Diamonds are twice as wide as tall: compare the screen vector with that ratio in mind.
  if (Math.abs(sx) > Math.abs(sy) * 2) return sx > 0 ? "right" : "left";
  return sy > 0 ? "down" : "up";
}

const DIR8 = ["right", "downright", "down", "downleft", "left", "upleft", "up", "upright"] as const;
/** Like screenDir but with the four diagonals too (heroes have 3/4 facings in the iso sheets). */
export function screenDir8(dx: number, dy: number, fallback: string): string {
  if (!ISO) return fallback;
  const sx = dx - dy, sy = dx + dy; // screen vector with the diamond's 2:1 squash undone
  if (Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6) return fallback;
  return DIR8[((Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) % 8) + 8) % 8];
}

/** Keyboard on screen axes (W = up the screen) turned into world input. */
export function isoInput(up: boolean, down: boolean, left: boolean, right: boolean) {
  if (!ISO) return { up, down, left, right };
  // Screen up = world (-1,-1), screen right = world (1,-1)
  const v = +right - +left, h = +down - +up; // screen right/down amounts
  const wx = v + h, wy = h - v;
  return { up: wy < 0, down: wy > 0, left: wx < 0, right: wx > 0 };
}

const BAKE_FROM: Partial<Record<number, number>> = { [T.FLOWERS]: T.GRASS, [T.FIELD]: T.DIRT, [T.CROPS]: T.DIRT };

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
    const from = BAKE_FROM[id] ?? id; // flowers stand up as their own sprites (details.ts): plain grass under them
    ctx.drawImage(src, from * TILE, row * TILE, TILE, TILE, 0, 0, TILE, TILE);
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
  static ground?: SmoothGround;
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
    isoCrops(scene, ground, objects);
    const water = buildBridges(scene, ground); // bridges stand over the water
    if (SMOOTH) IsoView.ground = new SmoothGround(scene, water, (img) => isoScreen(img));
    for (const [name, grid, depth] of [["ground", water, -2], ["objects", flatObjects, -1]] as const) {
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
    // Big soft glows (fires, lamps) are tiny textures scaled up: smooth them instead of showing blocky squares
    for (const k of ["glow", "light"]) if (scene.textures.exists(k)) scene.textures.get(k).setFilter(Phaser.Textures.FilterMode.LINEAR);
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
    const cam = this.scene.cameras.main;
    IsoView.ground?.update(cam.midPoint.x, cam.midPoint.y, cam.width / cam.zoom, cam.height / cam.zoom);
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
      if (o.scrollFactorX === 0 || o.type === "TilemapLayer" || o.x === undefined || flatContainers.has(o) || screenSpace.has(o)) continue;
      if (!this.seen.has(o)) {
        this.seen.add(o);
        if (this.isFlat(o)) { (moved ??= []).push(o); continue; }
        // Ambient chimneys sat on flat roofs; iso houses draw their own
        if (o.texture?.key === "chimney") o.visible = false;
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
    this.fadeBuildings(follow);
  }

  /** A house in front of the hero (camera target) turns see-through so the hero stays visible. */
  private fadeBuildings(follow: any) {
    if (!follow || follow.__isoF !== this.frame) return;
    const fx = follow.x, fy = follow.y, fd = follow.depth;
    for (const b of BUILDINGS) {
      let behind = false;
      if (fx > b.left && fx < b.right && fy > b.top && fy - 24 < b.bottom) {
        // depth of the house slice under the hero's x
        let best: any;
        for (const st of b.strips) if (!best || Math.abs((st as any).x - fx) < Math.abs(best.x - fx)) best = st;
        behind = !!best && fd < best.depth;
      }
      if (behind !== b.faded) { b.faded = behind; for (const st of b.strips) st.setAlpha(behind ? b.fadeTo ?? 0.45 : 1); }
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

const hashXY = (x: number, y: number) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
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
type Src = { img: CanvasImageSource; sx: number; sy: number };
function blockTexture(scene: Phaser.Scene, key: string, topSrc: Src, sideSrc: Src, h: number) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, IW, IH + h)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  const face = (a: number, b: number, e: number, f: number, shade: number) => {
    ctx.save();
    ctx.beginPath();
    if (b > 0) { ctx.moveTo(0, IH / 2); ctx.lineTo(IW / 2, IH); ctx.lineTo(IW / 2, IH + h); ctx.lineTo(0, IH / 2 + h); }
    else { ctx.moveTo(IW / 2, IH); ctx.lineTo(IW, IH / 2); ctx.lineTo(IW, IH / 2 + h); ctx.lineTo(IW / 2, IH + h); }
    ctx.closePath(); ctx.clip();
    ctx.setTransform(a, b, 0, (h + 1) / TILE, e, f);
    ctx.drawImage(sideSrc.img, sideSrc.sx, sideSrc.sy, TILE, TILE, 0, 0, TILE + 1, TILE);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(20,16,40,${shade})`;
    ctx.fillRect(0, 0, IW, IH + h);
    ctx.restore();
  };
  // the faces hang under the top diamond's lower edges
  face(1, 0.5, 0, IH / 2, 0.22);
  face(1, -0.5, IW / 2, IH, 0.4);
  ctx.setTransform(1, 0.5, -1, 0.5, IW / 2, 0);
  ctx.drawImage(topSrc.img, topSrc.sx, topSrc.sy, TILE, TILE, 0, 0, TILE + 0.5, TILE + 0.5);
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
/**
 * A rough-built palisade: uneven logs leaning a little this way and that, a few missing or snapped, and on the
 * outside a ragged row of sharpened stakes driven into the dirt at an angle, pointing out. Weeds, ivy and
 * moss creep over it. `out`: 1 = outside to the south, 2 = to the east (else north / west).
 */
function wildPalisade(c: CanvasRenderingContext2D, posts: { x: number; y: number; k: number }[],
  along: (wx: number, wy: number) => { x: number; y: number }, mask: number, broken: boolean, out: number, variant: number, H: number) {
  let seed = (mask * 977 + variant * 7919 + out * 131 + (broken ? 5 : 0)) | 1;
  const R = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const horiz = !!(mask & 10) && !(mask & 5), vert = !!(mask & 5) && !(mask & 10);
  let ox = horiz ? 0 : out & 2 ? 1 : -1, oy = vert ? 0 : out & 1 ? 1 : -1;
  const n = Math.hypot(ox, oy) || 1; ox /= n; oy /= n;
  const log = (x0: number, y0: number, x1: number, y1: number, w: number, tone: number, tip: boolean) => {
    // a tapered round log from (x0,y0) foot to (x1,y1) top, lit from the left
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const tw = tip ? 0.15 : w * 0.85;
    const g = c.createLinearGradient(x0 - nx * w, y0 - ny * w, x0 + nx * w, y0 + ny * w);
    g.addColorStop(0, `rgb(${34 * tone},${24 * tone},${15 * tone})`); g.addColorStop(0.6, `rgb(${92 * tone},${66 * tone},${42 * tone})`); g.addColorStop(1, `rgb(${126 * tone},${96 * tone},${64 * tone})`);
    c.fillStyle = g;
    c.beginPath(); c.moveTo(x0 + nx * w, y0 + ny * w); c.lineTo(x1 + nx * tw, y1 + ny * tw); c.lineTo(x1 - nx * tw, y1 - ny * tw); c.lineTo(x0 - nx * w, y0 - ny * w); c.closePath(); c.fill();
    if (tip) { // pale cut face near the point
      c.fillStyle = `rgba(${196 * tone},${162 * tone},${116 * tone},0.85)`;
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - dx / L * 3 + nx * w * 0.8, y1 - dy / L * 3 + ny * w * 0.8); c.lineTo(x1 - dx / L * 2.6, y1 - dy / L * 2.6); c.closePath(); c.fill();
    }
    c.strokeStyle = "rgba(20,12,6,0.5)"; c.lineWidth = 0.18; // bark cracks
    for (let k = 0; k < 2; k++) { const f = 0.3 + k * 0.35; c.beginPath(); c.moveTo(x0 + nx * w * (f - 0.5), y0 + ny * w * (f - 0.5)); c.lineTo(x0 + dx * 0.7 + nx * w * (f - 0.6), y0 + dy * 0.7 + ny * w * (f - 0.6)); c.stroke(); }
  };
  const foot = (x: number, y: number, r: number, a = 0.5) => {
    const sh = c.createRadialGradient(x + 1, y, 0, x + 1, y, r);
    sh.addColorStop(0, `rgba(8,6,4,${a})`); sh.addColorStop(1, "rgba(8,6,4,0)");
    c.fillStyle = sh; c.beginPath(); c.ellipse(x + 1, y, r, r / 2, 0, 0, Math.PI * 2); c.fill();
  };
  const weed = (x: number, y: number, big = 1) => {
    c.lineCap = "round";
    const m = 3 + Math.floor(R() * 4);
    for (let i = 0; i < m; i++) {
      const a = -Math.PI / 2 + (R() - 0.5) * 1.9, L = (1.4 + R() * 2.4) * big;
      c.strokeStyle = ["#3c5a26", "#4e6c2e", "#62783a", "#7a7a40"][Math.floor(R() * 4)]; c.lineWidth = 0.4;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * L * 0.4, y + Math.sin(a) * L * 0.6, x + Math.cos(a) * L, y + Math.sin(a) * L * 0.7); c.stroke();
    }
  };
  const leaf = (x: number, y: number) => {
    const g = ["#2c4a22", "#3a5a28", "#4e6c30", "#1e3418"][Math.floor(R() * 4)], s0 = 0.45 + R() * 0.45;
    c.fillStyle = g; c.beginPath(); c.ellipse(x, y, s0, s0 * 0.7, R() * 3, 0, Math.PI * 2); c.fill();
  };
  // the outside spike row: sharpened stakes driven in at an angle, pointing out, some fallen or missing
  const spikes: (() => void)[] = [];
  const along2 = posts.length > 1 ? posts : [posts[0]];
  for (let i = 0; i < along2.length; i += 1) {
    if (R() < 0.3) continue;
    const p = along2[i];
    const off = 3 + R() * 4, lean = 0.85 + R() * 0.4; // distance out from the wall, angle up from the ground (rad)
    const L = 10 + R() * 5, side = (R() - 0.5) * 0.9;
    const bx = p.x + (ox - oy) * off + (R() - 0.5) * 2, by = p.y + (ox + oy) / 2 * off;
    const fallen = R() < 0.08, pair = !fallen && R() < 0.45;
    for (const sd of pair ? [side + 0.45, side - 0.45] : [side]) {
    const hx = ox + (-oy) * sd, hy = oy + ox * sd; // horizontal pointing direction (world)
    const up = fallen ? 0.6 : L * Math.sin(lean), fw = L * Math.cos(fallen ? 0.05 : lean);
    const tx = bx + (hx - hy) * fw, ty = by + (hx + hy) / 2 * fw - up;
    spikes.push(() => {
      foot(bx, by, 2.2, 0.4);
      log(bx, by, tx, ty, 1.5 + R() * 0.4, 0.95 + R() * 0.3, true);
      if (R() < 0.35) for (let k = 0; k < 6; k++) { const f = R() * 0.6; leaf(bx + (tx - bx) * f + (R() - 0.5), by + (ty - by) * f + (R() - 0.5)); }
      if (R() < 0.6) weed(bx + (R() - 0.5) * 2, by + 0.4, 0.9);
    });
    }
  }
  const behind = ox + oy < 0; // pointing up-screen: drawn before the wall
  if (behind) spikes.forEach((f) => f());
  // the wall: uneven logs, leaning, a few snapped short or missing
  posts.forEach((p, i) => {
    if (R() < 0.06) return; // a gap
    let h = H - R() * 7;
    if (broken && R() < 0.35) h = H * (0.25 + R() * 0.25);
    else if (R() < 0.07) h *= 0.55;
    const x = p.x + (R() - 0.5) * 0.6, y = p.y + (R() - 0.5) * 0.4, w = 1.55 + R() * 0.45, tone = 0.75 + R() * 0.35;
    const lx = (R() - 0.5) * 3.2; // lean
    foot(x, y, 4);
    const sharp = h > H * 0.6;
    log(x, y, x + lx, y - h, w, tone, sharp);
    if (!sharp) { c.fillStyle = `rgba(${150 * tone},${120 * tone},${84 * tone},1)`; c.beginPath(); c.ellipse(x + lx, y - h, w * 0.85, w * 0.4, 0, 0, Math.PI * 2); c.fill(); }
    if (R() < 0.4) { const ry = y - 4 - R() * 4; c.strokeStyle = "rgba(150,124,80,0.9)"; c.lineWidth = 0.5; c.beginPath(); c.ellipse(x + lx * (y - ry) / h, ry, w, w * 0.4, 0, 0, Math.PI); c.stroke(); }
    // moss at the foot, ivy climbing some logs
    c.fillStyle = "rgba(60,80,34,0.65)"; c.beginPath(); c.ellipse(x - w * 0.3, y - 0.7, w * 0.9, 0.7, 0, 0, Math.PI * 2); c.fill();
    if (R() < 0.3) { const reach = h * (0.3 + R() * 0.6); for (let k = 0; k < 14; k++) { const z = reach * Math.pow(R(), 1.4); leaf(x + lx * z / h + (R() - 0.5) * w * 1.6, y - z); } }
    if (R() < 0.7) weed(x + (R() - 0.5) * 3, y + 0.8, R() < 0.15 ? 1.8 : 1);
  });
  if (!behind) spikes.forEach((f) => f());
}

function stakesTexture(scene: Phaser.Scene, fence: boolean, mask: number, broken: boolean, out = 0, variant = 0) {
  const key = `stk_${fence ? "f" : "p"}_${mask}_${broken ? 1 : 0}${SMOOTH ? `_${out}_${variant}` : ""}`;
  if (scene.textures.exists(key)) return key;
  const H = fence ? 12 : 30, W = IW, HT = IH + H;
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
  if (SMOOTH && !fence) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    hiResTexture(scene, key, W, HT, 1, 6, (c) => wildPalisade(c, posts, along, mask, broken, out, variant, H));
    return key;
  }
  if (SMOOTH) {
    // painted at 6x: round logs with bark, sharpened tips, rope lashings and soft shadows
    if (scene.textures.exists(key)) scene.textures.remove(key);
    hiResTexture(scene, key, W, HT, 1, 6, (c) => {
      const logGrad = (x: number, w: number, tone: number) => {
        const g = c.createLinearGradient(x - w, 0, x + w, 0);
        g.addColorStop(0, `rgb(${120 * tone},${92 * tone},${62 * tone})`); g.addColorStop(0.35, `rgb(${92 * tone},${66 * tone},${42 * tone})`);
        g.addColorStop(1, `rgb(${34 * tone},${24 * tone},${15 * tone})`);
        return g;
      };
      if (fence) for (const [bit, dx, dy] of dirs) if (mask & bit) {
        const a = along(0, 0), b = along(dx * TILE / 2, dy * TILE / 2);
        for (const hh of [4, 9]) {
          c.strokeStyle = "#2a1c10"; c.lineWidth = 1.9; c.beginPath(); c.moveTo(a.x, a.y - hh + 0.4); c.lineTo(b.x, b.y - hh + 0.4); c.stroke();
          c.strokeStyle = "#6e5236"; c.lineWidth = 1.3; c.beginPath(); c.moveTo(a.x, a.y - hh); c.lineTo(b.x, b.y - hh); c.stroke();
          c.strokeStyle = "rgba(200,170,120,0.35)"; c.lineWidth = 0.3; c.beginPath(); c.moveTo(a.x, a.y - hh - 0.5); c.lineTo(b.x, b.y - hh - 0.5); c.stroke();
        }
      }
      posts.forEach((p, i) => {
        let h = fence ? H : H - ((i * 7 + mask) % 3) * 2;
        if (broken && (i * 13 + mask * 5) % 4 === 0) h = Math.round(h * 0.35);
        const x = p.x + (((i * 5 + mask) % 3) - 1) * 0.3, y = p.y, w = fence ? 1.3 : 1.75, tone = 0.85 + ((i * 7 + mask * 3) % 5) * 0.06;
        const sh = c.createRadialGradient(x + 1, y, 0, x + 1, y, 4);
        sh.addColorStop(0, "rgba(8,6,4,0.55)"); sh.addColorStop(1, "rgba(8,6,4,0)");
        c.fillStyle = sh; c.beginPath(); c.ellipse(x + 1, y, 4, 2, 0, 0, Math.PI * 2); c.fill();
        const top = y - h, tip = !fence && h > 10;
        c.fillStyle = logGrad(x, w, tone);
        c.beginPath(); c.moveTo(x - w, y); c.lineTo(x - w, top + (tip ? 0 : 0.5)); c.lineTo(x + w, top + (tip ? 0 : 0.5)); c.lineTo(x + w, y);
        c.ellipse(x, y, w, w * 0.45, 0, 0, Math.PI); c.closePath(); c.fill();
        // bark: a few dark vertical cracks
        c.strokeStyle = "rgba(20,12,6,0.55)"; c.lineWidth = 0.18;
        for (let k = 0; k < 3; k++) { const bx = x - w * 0.5 + k * w * 0.5; c.beginPath(); c.moveTo(bx, y - 1); c.quadraticCurveTo(bx + 0.2, (y + top) / 2, bx - 0.1, top + 2); c.stroke(); }
        if (tip) { // sharpened point: cone with a pale cut face on the lit side
          c.fillStyle = logGrad(x, w, tone * 0.95);
          c.beginPath(); c.moveTo(x - w, top); c.lineTo(x + 0.2, top - 3.6); c.lineTo(x + w, top); c.closePath(); c.fill();
          c.fillStyle = `rgba(${200 * tone},${168 * tone},${120 * tone},0.9)`;
          c.beginPath(); c.moveTo(x - w, top); c.lineTo(x + 0.2, top - 3.6); c.lineTo(x - 0.1, top + 0.3); c.closePath(); c.fill();
          // rope lashing
          for (const ry of [top + 4, y - 6]) { c.strokeStyle = "rgba(150,124,80,0.95)"; c.lineWidth = 0.55; c.beginPath(); c.ellipse(x, ry, w, w * 0.4, 0, 0, Math.PI); c.stroke(); }
        } else {
          c.fillStyle = `rgba(${150 * tone},${120 * tone},${84 * tone},1)`; c.beginPath(); c.ellipse(x, top + 0.5, w, w * 0.45, 0, 0, Math.PI * 2); c.fill();
          c.strokeStyle = "rgba(60,40,20,0.6)"; c.lineWidth = 0.15; c.beginPath(); c.ellipse(x, top + 0.5, w * 0.5, w * 0.22, 0, 0, Math.PI * 2); c.stroke();
        }
        // a little moss at the foot
        c.fillStyle = "rgba(60,80,34,0.6)"; c.beginPath(); c.ellipse(x - w * 0.3, y - 0.6, w * 0.8, 0.6, 0, 0, Math.PI * 2); c.fill();
      });
    });
    return key;
  }
  const tex = scene.textures.createCanvas(key, W, HT)!;
  const ctx = tex.getContext();
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
  const houses = buildHouses(scene);
  for (const k of buildStalls(scene)) houses.add(k);
  for (const k of buildBarns(scene)) houses.add(k);
  const src = (scene.textures.get("tiles") as Phaser.Textures.CanvasTexture).getSourceImage() as HTMLCanvasElement;
  const tileSrc = (i: number): Src => ({ img: src, sx: (i % TILE_COUNT) * TILE, sy: Math.floor(i / TILE_COUNT) * TILE });
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? -1 : objects[y][x]);
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const index = objects[ty][tx], t = id(index);
    if (t < 0) continue;
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    if (houses.has(ty * MAP_W + tx)) { out[ty][tx] = -1; continue; }
    if (t === T.CAMPFIRE) { out[ty][tx] = -1; continue; } // an upright fire sprite (ambient.ts)
    let h = BLOCK_H[t];
    if (t === T.PALISADE || FENCES.has(t)) {
      const same = (x: number, y: number) => { const n = id(at(x, y)); return t === T.PALISADE ? n === T.PALISADE : FENCES.has(n); };
      const mask = (same(tx, ty - 1) ? 1 : 0) | (same(tx + 1, ty) ? 2 : 0) | (same(tx, ty + 1) ? 4 : 0) | (same(tx - 1, ty) ? 8 : 0);
      const broken = t === T.PALISADE && (Math.floor(index / TILE_COUNT) & 64) !== 0;
      const row = Math.floor(index / TILE_COUNT);
      const outDir = t === T.PALISADE ? (row & 16 ? 1 : 0) | (row & 32 ? 2 : 0) : 0;
      const variant = t === T.PALISADE ? ((tx * 73856093) ^ (ty * 19349663)) >>> 0 : 0;
      const key = stakesTexture(scene, t !== T.PALISADE, mask, broken, outDir, variant % 6);
      const H = t === T.PALISADE ? 30 : 12;
      scene.add.image(cx, cy, key).setOrigin(0.5, (H + IH / 2) / (IH + H)).setDepth(cy);
      out[ty][tx] = -1;
    } else if (h !== undefined) {
      let key: string;
      if (t === T.RUIN || t === T.BEAM) {
        // Broken walls: thin stone or charred timber walls along the wall line, with rubble
        const same = (x: number, y: number) => id(at(x, y)) === t;
        const mask = (same(tx, ty - 1) ? 1 : 0) | (same(tx + 1, ty) ? 2 : 0) | (same(tx, ty + 1) ? 4 : 0) | (same(tx - 1, ty) ? 8 : 0);
        const w = ruinWallTexture(scene, t === T.RUIN, mask, tx, ty);
        const img = scene.add.image(cx, cy, w.key);
        img.setOrigin(0.5, w.up / img.height).setDepth(cy);
        out[ty][tx] = -1;
        continue;
      } else {
        // Other blocks (stalls, stray roof/wall tiles): their own art on top and sides
        key = blockTexture(scene, `blk_${index}_${h}`, tileSrc(index), tileSrc(index), h!);
      }
      // origin = the centre of the footprint diamond, so the block stands on its tile
      scene.add.image(cx, cy, key).setOrigin(0.5, (IH / 2 + h) / (IH + h)).setDepth(cy);
      out[ty][tx] = -1;
    } else if (UPRIGHT.has(t)) {
      // 3/4 view art: its bottom edge stands on the tile's centre, a little forward
      const painted = SMOOTH ? uprightTexture(scene, t) : undefined; // detailed iso art in place of the 3/4 tile
      if (painted) scene.add.image(cx, cy, painted).setOrigin(0.5, 0.85).setDepth(cy);
      else scene.add.image(cx, cy, "tiles", tileFrame(scene, index)).setOrigin(0.5, 0.85).setDepth(cy);
      out[ty][tx] = -1;
    }
  }
  return out;
}

// ---------- crops ----------

/**
 * Crop fields stand up: every FIELD tile gets a patch of wheat stalks, every CROPS tile rows of leafy vegetables,
 * sorted with the heroes like any prop (a hero walking through the wheat is hidden to the knees).
 */
function isoCrops(scene: Phaser.Scene, ground: number[][], objects: number[][]) {
  const UP = 22, W = IW, H = IH + UP;
  const hsh = (x: number, y: number, s: number) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const make = (kind: "wheat" | "veg", v: number) => {
    const key = `crop_${kind}_${v}`;
    if (scene.textures.exists(key)) return key;
    const tex = scene.textures.createCanvas(key, W, H)!;
    const c = tex.getContext();
    const S = (x: number, y: number) => ({ x: Math.round(x - y + W / 2), y: Math.round((x + y) / 2 + UP) });
    const px = (x: number, y: number, col: string, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    const pts: [number, number][] = [];
    if (kind === "wheat") {
      for (let y = 2; y < TILE; y += 4) for (let x = 1 + (y % 8 ? 2 : 0); x < TILE; x += 4) pts.push([x, y]);
    } else {
      for (const y of [4, 12, 20, 28]) for (const x of [4, 12, 20, 28]) pts.push([x, y]);
    }
    pts.sort((a, b) => a[0] + a[1] - b[0] - b[1]); // back to front
    pts.forEach(([x, y], i) => {
      const r = (k: number) => hsh(x + v * 37, y, k);
      const p = S(x, y);
      if (kind === "wheat") {
        const h = 11 + Math.floor(r(1) * 6), lean = r(2) < 0.3 ? -1 : r(2) > 0.7 ? 1 : 0;
        px(p.x, p.y - 1, "rgba(60,40,10,0.35)", 2, 1);
        for (let k = 0; k < h; k++) px(p.x + (k > h * 0.6 ? lean : 0), p.y - k, k < 3 ? "#9a7a26" : "#c7a43c");
        const hx = p.x + lean, hy = p.y - h;
        px(hx - 1, hy - 4, "#e8cc66", 2, 4); px(hx, hy - 5, "#f4dc84"); px(hx + 1, hy - 3, "#c9a640", 1, 3);
        if (i % 3 === 0) px(hx + 1, hy - 6, "#d8b84a");
      } else {
        // a soil ridge and a leafy plant: cabbages and lettuces
        px(p.x - 4, p.y, "#5a3d22", 9, 1);
        const big = r(3) < 0.5, w = big ? 11 : 8, h = big ? 8 : 7;
        const dark = big ? "#3f7f2e" : "#4f9a3a", mid = big ? "#5aa845" : "#6fbf55", lite = big ? "#8fd36a" : "#a6e07c";
        px(p.x - (w >> 1), p.y - 2, "rgba(0,0,0,0.25)", w, 2);
        for (let k = 0; k < h; k++) { const ww = Math.max(1, Math.round(w * Math.sin(((k + 0.5) / h) * Math.PI))); px(p.x - (ww >> 1), p.y - 1 - k, k < 2 ? dark : mid, ww, 1); }
        if (big) { // cabbage: pale heart, curled outer leaves
          px(p.x - 2, p.y - h + 1, lite, 4, 2); px(p.x - 1, p.y - h, lite, 2, 1); px(p.x - 3, p.y - 3, "#2f6b24", 1, 2); px(p.x + 3, p.y - 4, "#2f6b24", 1, 2);
          px(p.x - (w >> 1), p.y - 3, dark, 2, 1); px(p.x + (w >> 1) - 1, p.y - 3, dark, 2, 1);
        } else { // leafy greens: a few leaves standing up
          for (const [dx, hh] of [[-3, 3], [-1, 5], [1, 4], [3, 2]]) { px(p.x + dx, p.y - h - hh + 2, mid, 1, hh); px(p.x + dx, p.y - h - hh + 1, lite); }
        }
      }
    });
    tex.refresh();
    return key;
  };
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const g = ground[ty][tx] % TILE_COUNT;
    if ((g !== T.FIELD && g !== T.CROPS) || objects[ty][tx] >= 0) continue;
    const key = make(g === T.FIELD ? "wheat" : "veg", (tx * 7 + ty * 3) % 4);
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    scene.add.image(cx, cy, key).setOrigin(0.5, (UP + IH / 2) / H).setDepth(cy);
  }
}
