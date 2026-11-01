import Phaser from "phaser";
import { TILE } from "../../shared/constants";
import { OBJECTS, T, TILE_COUNT } from "../../shared/map";

/**
 * Iso buildings (phase 4 polish): whole houses with walls and a pitched roof, and the materials used for
 * ruined walls. Everything is painted into canvases from the square tileset plus a few procedural textures.
 *
 * Screen projection of a world point (x, y) at height z: (x - y, (x + y) / 2 - z).
 */

const P = (x: number, y: number, z = 0) => ({ x: x - y, y: (x + y) / 2 - z });
type Pt = { x: number; y: number };

const ROOFS = new Set<number>([T.ROOF_THATCH, T.ROOF_RED, T.ROOF_SLATE]);
export const FACADE = new Set<number>([T.WALL_TIMBER, T.WALL_STONE, T.WINDOW_TIMBER, T.WINDOW_STONE, T.DOOR]);
const obj = (x: number, y: number) => OBJECTS[y]?.[x] ?? -1;

function hash(x: number, y: number, s: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------- procedural materials (32x32) ----------

const mats = new Map<string, HTMLCanvasElement>();
function mat(name: string, paint: (c: CanvasRenderingContext2D) => void) {
  let c = mats.get(name);
  if (!c) {
    c = document.createElement("canvas"); c.width = TILE; c.height = TILE;
    paint(c.getContext("2d")!);
    mats.set(name, c);
  }
  return c;
}
const px = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, h); };

/** Weathered stone blocks with mortar and moss, for ruin wall faces. */
export const stoneFace = () => mat("stoneFace", (c) => {
  px(c, 0, 0, 32, 32, "#5d5a58");
  const tones = ["#8d8882", "#9a948c", "#827d77", "#a29b92", "#787470"];
  for (let r = 0; r < 4; r++) {
    const off = r % 2 ? 5 : 0;
    for (let b = -1; b < 3; b++) {
      const x = b * 12 + off, w = 11;
      px(c, x, r * 8, w, 7, tones[Math.floor(hash(b + 9, r, 3) * tones.length)]);
      px(c, x, r * 8, w, 1, "#b2aba1"); // lit top edge
      px(c, x, r * 8 + 6, w, 1, "#6a6662");
      if (hash(b, r, 4) < 0.35) px(c, x + 2 + Math.floor(hash(b, r, 5) * 6), r * 8 + 2, 2, 1, "#6e6a66"); // crack
    }
  }
  for (let i = 0; i < 18; i++) { // moss creeping up from the ground
    const x = Math.floor(hash(i, 1, 7) * 32), y = 22 + Math.floor(hash(i, 2, 7) * 10);
    px(c, x, y, 2, 1, i % 3 ? "#5f7f3a" : "#4c6b2e");
  }
});
/** Top of a broken wall: rough capstones with moss. */
export const stoneCap = () => mat("stoneCap", (c) => {
  px(c, 0, 0, 32, 32, "#8a847c");
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(hash(i, 3, 11) * 31), y = Math.floor(hash(i, 4, 11) * 31);
    px(c, x, y, 2, 2, ["#9e978d", "#7a756e", "#a8a197", "#6f8f45"][i % 4]);
  }
});
/** Charred wooden planks, for the ruined timber frames. */
export const woodFace = () => mat("woodFace", (c) => {
  const tones = ["#5b3f26", "#6b4a2d", "#4f361f", "#634428"];
  for (let i = 0; i < 8; i++) {
    px(c, i * 4, 0, 4, 32, tones[i % 4]);
    px(c, i * 4, 0, 1, 32, "#7c5934");
    px(c, i * 4 + 3, 0, 1, 32, "#3a2716");
    if (hash(i, 0, 21) < 0.5) px(c, i * 4 + 1, Math.floor(hash(i, 1, 21) * 28), 2, 2, "#2e2013"); // knot / scorch
  }
  px(c, 0, 0, 32, 2, "#3a2716"); px(c, 0, 30, 32, 2, "#3a2716");
});
export const woodCap = () => mat("woodCap", (c) => {
  px(c, 0, 0, 32, 32, "#6b4a2d");
  for (let i = 0; i < 8; i++) { px(c, 0, i * 4, 32, 1, "#7c5934"); px(c, 0, i * 4 + 3, 32, 1, "#4f361f"); }
});

// ---------- drawing helpers ----------

/** Fill a polygon with a texture mapped by an affine transform (origin o, u = screen step per texel x, v = per texel y). */
function texPoly(ctx: CanvasRenderingContext2D, poly: Pt[], img: CanvasImageSource, sx: number, sy: number,
  o: Pt, u: Pt, v: Pt, nu: number, nv: number, shade = 0) {
  ctx.save();
  ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.clip();
  ctx.setTransform(u.x, u.y, v.x, v.y, o.x, o.y);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) ctx.drawImage(img, sx, sy, TILE, TILE, i * TILE, j * TILE, TILE + 0.6, TILE + 0.6);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (shade) { ctx.fillStyle = `rgba(24,18,44,${shade})`; ctx.fill(); }
  ctx.restore();
}
function line(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, col: string, w = 1) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}

// ---------- houses ----------

export interface Building {
  /** Footprint in world px. */
  X0: number; Y0: number; X1: number; Y1: number;
  strips: Phaser.GameObjects.Image[];
  /** Screen box (projected coordinates). */
  left: number; right: number; top: number; bottom: number;
  faded: boolean;
}
export const BUILDINGS: Building[] = [];

const WALL_H = 34;

/** Houses as whole buildings: one per connected roof, with the facade rows under it. Returns the tiles they cover. */
export function buildHouses(scene: Phaser.Scene): Set<number> {
  const covered = new Set<number>();
  const seen = new Set<number>();
  const H = OBJECTS.length, W = OBJECTS[0].length;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!ROOFS.has(OBJECTS[y][x]) || seen.has(y * W + x)) continue;
    let x0 = x, x1 = x, y0 = y, y1 = y;
    const roof = OBJECTS[y][x];
    const stack = [[x, y]]; seen.add(y * W + x);
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (ROOFS.has(obj(nx, ny)) && !seen.has(ny * W + nx)) { seen.add(ny * W + nx); stack.push([nx, ny]); }
      }
    }
    // facade rows right under the roof
    let yb = y1;
    while (yb + 1 < H && [...Array(x1 - x0 + 1).keys()].some((i) => FACADE.has(obj(x0 + i, yb + 1)))) yb++;
    for (let ty = y0; ty <= yb; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (ROOFS.has(obj(tx, ty)) || FACADE.has(obj(tx, ty))) covered.add(ty * W + tx);
    }
    house(scene, x0, y0, x1, yb, roof);
  }
  return covered;
}

function house(scene: Phaser.Scene, x0: number, y0: number, x1: number, yb: number, roof: number) {
  const src = (scene.textures.get("tiles") as Phaser.Textures.CanvasTexture).getSourceImage() as HTMLCanvasElement;
  const tsx = (id: number) => (id % TILE_COUNT) * TILE, tsy = (id: number) => Math.floor(id / TILE_COUNT) * TILE;
  const X0 = x0 * TILE, X1 = (x1 + 1) * TILE, Y0 = y0 * TILE, Y1 = (yb + 1) * TILE;
  const wTiles = x1 - x0 + 1, dTiles = yb - y0 + 1;
  const alongX = wTiles >= dTiles; // ridge direction: along the longer side
  const half = (alongX ? Y1 - Y0 : X1 - X0) / 2;
  const RH = Math.round(half * 0.8) + 4; // ridge height above the walls
  const o = 6; // eaves overhang
  const top = WALL_H + RH, eave = WALL_H - 3;
  // canvas covering the whole building
  const left = P(X0 - o, Y1 + o).x - 2, right = P(X1 + o, Y0 - o).x + 2;
  const topY = P(X0, Y0, top + 26).y - 4, bottom = P(X1 + o, Y1 + o).y + 4;
  const cw = Math.ceil(right - left), ch = Math.ceil(bottom - topY);
  const key = `house_${x0}_${y0}`;
  const tex = scene.textures.createCanvas(key, cw, ch)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  const S = (x: number, y: number, z = 0): Pt => { const p = P(x, y, z); return { x: p.x - left, y: p.y - topY }; };
  const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
  const scale = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });

  // wall art: the facade's bottom row (door, windows), plain wall for the sides
  const facadeRow = (i: number) => obj(x0 + i, yb);
  const wallId = [...Array(wTiles).keys()].map(facadeRow).find((t) => t === T.WALL_TIMBER || t === T.WALL_STONE) ?? T.WALL_TIMBER;
  const winId = wallId === T.WALL_STONE ? T.WINDOW_STONE : T.WINDOW_TIMBER;

  // 1. soft contact shadow on the ground (south-east)
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  for (const p of [S(X1, Y0 + 8), S(X1 + 10, Y0 + 14), S(X1 + 10, Y1 + 10), S(X0 + 8, Y1 + 10), S(X0, Y1)]) ctx.lineTo(p.x, p.y);
  ctx.closePath(); ctx.fill();

  // 2. back roof slope (only its rim shows behind the ridge)
  const roofSlope = (eaveA: Pt, eaveB: Pt, ridgeA: Pt, ridgeB: Pt, shade: number) => {
    const u = sub(ridgeB, ridgeA), v = sub(eaveA, ridgeA);
    const lu = Math.hypot(alongX ? X1 - X0 + 2 * o : Y1 - Y0 + 2 * o, 0), lv = Math.hypot(half + o, top - eave);
    const nu = Math.ceil(lu / TILE), nv = Math.ceil(lv / TILE);
    texPoly(ctx, [ridgeA, ridgeB, eaveB, eaveA], src, tsx(roof), tsy(roof), ridgeA, scale(u, 1 / lu), scale(v, 1 / lv), nu, nv, shade);
  };
  if (alongX) {
    const ym = (Y0 + Y1) / 2;
    roofSlope(S(X0 - o, Y0 - o, eave), S(X1 + o, Y0 - o, eave), S(X0 - o, ym, top), S(X1 + o, ym, top), 0.45);
  } else {
    const xm = (X0 + X1) / 2;
    roofSlope(S(X0 - o, Y0 - o, eave), S(X0 - o, Y1 + o, eave), S(xm, Y0 - o, top), S(xm, Y1 + o, top), 0.45);
  }

  // 3. chimney (behind the ridge, so the front slope hides its foot)
  const chim = (cxW: number, cyW: number) => {
    const b = S(cxW, cyW, top - 18), t = S(cxW, cyW, top + 14);
    ctx.fillStyle = "#6e665e"; ctx.fillRect(Math.round(t.x) - 4, Math.round(t.y), 8, Math.round(b.y - t.y));
    ctx.fillStyle = "#8c837a"; ctx.fillRect(Math.round(t.x) - 4, Math.round(t.y), 4, Math.round(b.y - t.y));
    ctx.fillStyle = "#4a4440"; ctx.fillRect(Math.round(t.x) - 5, Math.round(t.y) - 2, 10, 3);
    ctx.fillStyle = "#2a2624"; ctx.fillRect(Math.round(t.x) - 3, Math.round(t.y) - 2, 6, 1);
  };
  if (wTiles >= 3) {
    if (alongX) chim(X1 - TILE * 1.2, (Y0 + Y1) / 2 - 10);
    else chim((X0 + X1) / 2 - 10, Y0 + TILE * 1.2);
  }

  // 4. walls: south facade (left face) and east side (right face)
  const facadeH = WALL_H;
  for (let i = 0; i < wTiles; i++) {
    const a = S(X0 + i * TILE, Y1, facadeH), b = S(X0 + (i + 1) * TILE, Y1, facadeH);
    const poly = [a, b, S(X0 + (i + 1) * TILE, Y1, 0), S(X0 + i * TILE, Y1, 0)];
    texPoly(ctx, poly, src, tsx(facadeRow(i) >= 0 ? facadeRow(i) : wallId), tsy(0), a, scale(sub(b, a), 1 / TILE), { x: 0, y: facadeH / TILE }, 1, 1, 0.1);
  }
  for (let j = 0; j < dTiles; j++) {
    const a = S(X1, Y0 + j * TILE, facadeH), b = S(X1, Y0 + (j + 1) * TILE, facadeH);
    const poly = [a, b, S(X1, Y0 + (j + 1) * TILE, 0), S(X1, Y0 + j * TILE, 0)];
    const art = dTiles >= 4 && j % 2 === 1 && j < dTiles - 1 ? winId : wallId;
    texPoly(ctx, poly, src, tsx(art), tsy(art), a, scale(sub(b, a), 1 / TILE), { x: 0, y: facadeH / TILE }, 1, 1, 0.34);
  }
  // corner post and wall foot
  line(ctx, S(X1, Y1, facadeH), S(X1, Y1, 0), "rgba(40,26,16,0.8)", 2);
  line(ctx, S(X0, Y1, 0), S(X1, Y1, 0), "rgba(30,20,12,0.5)");
  line(ctx, S(X1, Y1, 0), S(X1, Y0, 0), "rgba(30,20,12,0.5)");

  // 5. gable end (triangle of wall under the roof) and the front slope
  const gableArt = { id: wallId };
  if (alongX) {
    const ym = (Y0 + Y1) / 2;
    const g = [S(X1, Y0, facadeH), S(X1, Y1, facadeH), S(X1, ym, top - 2)];
    texPoly(ctx, g, src, tsx(gableArt.id), tsy(gableArt.id), S(X1, Y0, top), scale(sub(S(X1, Y1, top), S(X1, Y0, top)), 1 / TILE), { x: 0, y: 1 }, dTiles, Math.ceil(RH / TILE) + 1, 0.38);
    roofSlope(S(X0 - o, Y1 + o, eave), S(X1 + o, Y1 + o, eave), S(X0 - o, ym, top), S(X1 + o, ym, top), 0);
    // roof edge on the gable side (its thickness) and the ridge cap
    line(ctx, S(X1 + o, ym, top), S(X1 + o, Y1 + o, eave), "rgba(30,20,12,0.7)", 2);
    line(ctx, S(X1 + o, ym, top), S(X1 + o, Y0 - o, eave), "rgba(30,20,12,0.55)", 2);
    line(ctx, S(X0 - o, ym, top + 1), S(X1 + o, ym, top + 1), "rgba(40,28,20,0.85)", 2);
    line(ctx, S(X0 - o, Y1 + o, eave), S(X1 + o, Y1 + o, eave), "rgba(30,20,12,0.6)", 1);
  } else {
    const xm = (X0 + X1) / 2;
    const g = [S(X0, Y1, facadeH), S(X1, Y1, facadeH), S(xm, Y1, top - 2)];
    texPoly(ctx, g, src, tsx(gableArt.id), tsy(gableArt.id), S(X0, Y1, top), scale(sub(S(X1, Y1, top), S(X0, Y1, top)), 1 / TILE), { x: 0, y: 1 }, wTiles, Math.ceil(RH / TILE) + 1, 0.16);
    roofSlope(S(X1 + o, Y0 - o, eave), S(X1 + o, Y1 + o, eave), S(xm, Y0 - o, top), S(xm, Y1 + o, top), 0.12);
    line(ctx, S(xm, Y1 + o, top), S(X0 - o, Y1 + o, eave), "rgba(30,20,12,0.7)", 2);
    line(ctx, S(xm, Y1 + o, top), S(X1 + o, Y1 + o, eave), "rgba(30,20,12,0.55)", 2);
    line(ctx, S(xm, Y0 - o, top + 1), S(xm, Y1 + o, top + 1), "rgba(40,28,20,0.85)", 2);
    line(ctx, S(X1 + o, Y0 - o, eave), S(X1 + o, Y1 + o, eave), "rgba(30,20,12,0.6)", 1);
  }
  tex.refresh();

  // Slices a few pixels wide, each sorted by the point of the front wall under it, so heroes in front or
  // behind any part of the house are drawn in the right order.
  const b: Building = { X0, Y0, X1, Y1, strips: [], left, right, top: topY, bottom, faded: false };
  const SW = 8;
  const front = P(X1, Y1).x; // screen x of the front corner
  for (let x = 0; x < cw; x += SW) {
    const sx = left + x + SW / 2;
    // world point on the front wall foot under this slice
    let wx: number, wy: number;
    if (sx <= front) { wy = Y1; wx = Math.min(X1, Math.max(X0, sx + Y1)); } else { wx = X1; wy = Math.min(Y1, Math.max(Y0, X1 - sx)); }
    const s = P(wx, wy);
    const img = scene.add.image(wx, wy, key).setOrigin((s.x - left) / cw, (s.y - topY) / ch).setDepth(wy + 0.5);
    img.setCrop(x, 0, Math.min(SW, cw - x), ch);
    b.strips.push(img);
  }
  BUILDINGS.push(b);
}
