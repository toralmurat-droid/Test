import { col, Iso, planks, rng, stones, type Pt as IPt } from "./smoothProps";
import { hiResTexture } from "./smooth";
import { SMOOTH } from "./isoflag";
import Phaser from "phaser";
import { TILE } from "../../shared/constants";
import { BARNS, OBJECTS, T, TILE_COUNT } from "../../shared/map";

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
  /** Alpha when see-through (default 0.45). */
  fadeTo?: number;
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

/**
 * Time on a lived-in house: moss and lichen patches and slipped shingles on the front roof slope, damp and grime
 * rising at the wall foot, ivy on some walls, weeds and a few dropped things around the base. Pixel-sized marks,
 * painted on the house canvas (before it is enlarged), so it keeps the shared pixel density.
 */
function weatherHouse(ctx: CanvasRenderingContext2D, S: (x: number, y: number, z?: number) => Pt,
  b: { X0: number; X1: number; Y0: number; Y1: number; o: number; top: number; eave: number; facadeH: number; alongX: boolean }, seed: number) {
  const R = rng(seed);
  const { X0, X1, Y0, Y1, o, top, eave, facadeH, alongX } = b;
  const dot = (p: Pt, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(p.x), Math.round(p.y), w, h); };
  // a point on the front slope: s along the ridge (0..1), t from ridge (0) to eave (1)
  const slope = (s0: number, t0: number): Pt => alongX
    ? S(X0 - o + s0 * (X1 - X0 + 2 * o), (Y0 + Y1) / 2 + t0 * ((Y1 - Y0) / 2 + o), top + t0 * (eave - top))
    : S((X0 + X1) / 2 + t0 * ((X1 - X0) / 2 + o), Y0 - o + s0 * (Y1 - Y0 + 2 * o), top + t0 * (eave - top));
  // moss and lichen: clumps of a few pixels, gathered in two or three patches, more towards the eaves
  const patches = 2 + Math.floor(R() * 3);
  for (let k = 0; k < patches; k++) {
    const ps = R(), pt = 0.35 + R() * 0.6, n = 40 + Math.floor(R() * 60);
    for (let i = 0; i < n; i++) {
      const p = slope(Math.min(1, Math.max(0, ps + (R() - 0.5) * 0.22)), Math.min(0.98, Math.max(0.05, pt + (R() - 0.5) * 0.3 * R())));
      const c = R() < 0.75 ? ["rgba(78,98,46,0.75)", "rgba(96,112,52,0.7)", "rgba(60,78,38,0.8)"][Math.floor(R() * 3)] : "rgba(160,150,96,0.6)";
      dot(p, 1 + Math.floor(R() * 2), 1 + Math.floor(R() * 1.6), c);
    }
  }
  // slipped or missing shingles: dark gaps with a light lower lip
  const gaps = 1 + Math.floor(R() * 4);
  for (let k = 0; k < gaps; k++) {
    const p = slope(0.08 + R() * 0.84, 0.2 + R() * 0.7);
    dot(p, 3, 2, "rgba(20,14,10,0.75)"); dot({ x: p.x, y: p.y + 2 }, 3, 1, "rgba(200,180,150,0.25)");
  }
  // damp and grime rising from the wall foot (front and side faces): a soft band with a ragged top
  const foot = (a0: Pt, a1: Pt, ph: number) => {
    const n = Math.ceil(Math.abs(a1.x - a0.x));
    for (let i = 0; i <= n; i++) {
      const f = i / Math.max(1, n), x = a0.x + (a1.x - a0.x) * f, y = a0.y + (a1.y - a0.y) * f;
      const h = 4 + 3 * Math.sin(f * 9 + ph) + 2 * Math.sin(f * 23 + ph * 2) + R() * 1.5;
      ctx.fillStyle = "rgba(34,30,20,0.16)"; ctx.fillRect(Math.round(x), Math.round(y - h), 1, Math.round(h));
      ctx.fillStyle = "rgba(34,30,20,0.18)"; ctx.fillRect(Math.round(x), Math.round(y - 2), 1, 2);
    }
  };
  foot(S(X0, Y1, 0), S(X1, Y1, 0), R() * 6); foot(S(X1, Y1, 0), S(X1, Y0, 0), R() * 6);
  // streaks running down from the eaves
  for (let i = 0; i < 6; i++) {
    const f = R(), a = S(X0 + f * (X1 - X0), Y1, facadeH - 2);
    ctx.fillStyle = "rgba(24,20,14,0.18)"; ctx.fillRect(Math.round(a.x), Math.round(a.y), 1, 6 + Math.floor(R() * 12));
  }
  // ivy climbing one corner of some houses
  if (R() < 0.5) {
    const onFront = R() < 0.5, f0 = R() < 0.5 ? 0.02 : 0.8, reach = facadeH * (0.4 + R() * 0.6);
    for (let i = 0; i < 70; i++) {
      const z = reach * Math.pow(R(), 1.5), f = f0 + R() * 0.18 * (1 - z / reach + 0.3);
      const p = onFront ? S(X0 + f * (X1 - X0), Y1, z) : S(X1, Y0 + f * (Y1 - Y0), z);
      dot(p, 1 + Math.floor(R() * 2), 1, ["#2c4a22", "#3a5a28", "#4e6c30", "#1e3418"][Math.floor(R() * 4)]);
    }
  }
  // weeds along the base
  for (let i = 0; i < 18; i++) {
    const f = R(), front = R() < 0.6;
    const p = front ? S(X0 + f * (X1 - X0), Y1 + 1 + R() * 3, 0) : S(X1 + 1 + R() * 3, Y0 + f * (Y1 - Y0), 0);
    const h = 2 + Math.floor(R() * 4), c = ["#3c5a26", "#4e6c2e", "#62783a"][Math.floor(R() * 3)];
    dot({ x: p.x, y: p.y - h }, 1, h, c);
    if (R() < 0.6) dot({ x: p.x + 1, y: p.y - h + 1 }, 1, h - 1, c);
    if (R() < 0.5) dot({ x: p.x - 1, y: p.y - h + 2 }, 1, Math.max(1, h - 2), c);
  }
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
  if (SMOOTH) weatherHouse(ctx, S, { X0, X1, Y0, Y1, o, top, eave, facadeH, alongX }, x0 * 131 + y0 * 17);
  tex.refresh();

  sliced(scene, key, X0, Y0, X1, Y1, left, topY, cw, ch, true);
}

/**
 * Shows a canvas covering a footprint as slices a few pixels wide, each sorted by the point of the front edge
 * under it, so heroes in front of or behind any part are drawn in the right order. `fade`: see-through when
 * the hero walks behind it.
 */
function sliced(scene: Phaser.Scene, key: string, X0: number, Y0: number, X1: number, Y1: number,
  left: number, topY: number, cw: number, ch: number, fade: boolean, fadeTo?: number) {
  const b: Building = { X0, Y0, X1, Y1, strips: [], left, right: left + cw, top: topY, bottom: topY + ch, faded: false, fadeTo };
  const SW = 8;
  const front = P(X1, Y1).x; // screen x of the front corner
  for (let x = 0; x < cw; x += SW) {
    const sx = left + x + SW / 2;
    let wx: number, wy: number;
    if (sx <= front) { wy = Y1; wx = Math.min(X1, Math.max(X0, sx + Y1)); } else { wx = X1; wy = Math.min(Y1, Math.max(Y0, X1 - sx)); }
    const s = P(wx, wy);
    const img = scene.add.image(wx, wy, key).setOrigin((s.x - left) / cw, (s.y - topY) / ch).setDepth(wy + 0.5);
    img.setCrop(x, 0, Math.min(SW, cw - x), ch);
    b.strips.push(img);
  }
  if (fade) BUILDINGS.push(b);
}

// ---------- market stalls ----------

const STALLS = new Set<number>([T.STALL_RED, T.STALL_BLUE]);

/** Market stalls: each run of stall tiles becomes one wooden stall with a striped awning. Returns the tiles used. */
export function buildStalls(scene: Phaser.Scene): Set<number> {
  const used = new Set<number>();
  const H = OBJECTS.length, W = OBJECTS[0].length;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = OBJECTS[y][x];
    if (!STALLS.has(t) || used.has(y * W + x)) continue;
    let x1 = x, y1 = y;
    while (OBJECTS[y][x1 + 1] === t) x1++;
    while (OBJECTS[y1 + 1]?.[x] === t && x1 === x) y1++;
    for (let j = y; j <= y1; j++) for (let i = x; i <= x1; i++) used.add(j * W + i);
    stall(scene, x, y, x1, y1, t === T.STALL_RED ? 0xc0392b : 0x2e6fb0);
  }
  return used;
}

function stall(scene: Phaser.Scene, x0: number, y0: number, x1: number, y1: number, color: number) {
  // footprint inside the tiles, a little inset
  const X0 = x0 * TILE + 3, Y0 = y0 * TILE + 6, X1 = (x1 + 1) * TILE - 3, Y1 = (y1 + 1) * TILE - 4;
  const COUNTER = 13, POST = 36, FRONT_EAVE = 27, OV = 7;
  const left = P(X0 - OV, Y1 + OV).x - 3, right = P(X1 + OV, Y0 - OV).x + 3;
  const topY = P(X0, Y0, POST + 6).y - 4, bottom = P(X1 + 4, Y1 + OV).y + 4;
  const cw = Math.ceil(right - left), ch = Math.ceil(bottom - topY);
  const key = `stall_${x0}_${y0}`;
  const tex = scene.textures.createCanvas(key, cw, ch)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  const S = (x: number, y: number, z = 0): Pt => { const p = P(x, y, z); return { x: p.x - left, y: p.y - topY }; };
  const poly = (pts: Pt[], fill: string, stroke?: string) => {
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  };
  const hex = (c: number, k = 1) => {
    const r = Math.min(255, ((c >> 16) & 255) * k) | 0, g = Math.min(255, ((c >> 8) & 255) * k) | 0, b = Math.min(255, (c & 255) * k) | 0;
    return `rgb(${r},${g},${b})`;
  };
  const post = (x: number, y: number, h: number) => {
    const a = S(x, y, h), b = S(x, y, 0);
    ctx.fillStyle = "#5a3a1e"; ctx.fillRect(Math.round(a.x) - 1, Math.round(a.y), 3, Math.round(b.y - a.y));
    ctx.fillStyle = "#7d5733"; ctx.fillRect(Math.round(a.x) - 1, Math.round(a.y), 1, Math.round(b.y - a.y));
  };
  // ground shadow
  poly([S(X0, Y1), S(X1, Y1), S(X1 + 8, Y1 + 6), S(X1 + 8, Y0 + 6), S(X1, Y0)], "rgba(0,0,0,0.18)");
  // back posts (taller: the awning slopes down to the front)
  post(X0, Y0, POST); post(X1, Y0, POST);
  // counter: a wooden box with planks
  const plank = (pts: Pt[], base: string, k: number) => { poly(pts, base); ctx.save(); ctx.clip(); ctx.restore(); void k; };
  plank([S(X0, Y0, COUNTER), S(X1, Y0, COUNTER), S(X1, Y1, COUNTER), S(X0, Y1, COUNTER)], "#a0744a", 0);
  plank([S(X0, Y1, COUNTER), S(X1, Y1, COUNTER), S(X1, Y1, 0), S(X0, Y1, 0)], "#7d5733", 0);
  plank([S(X1, Y0, COUNTER), S(X1, Y1, COUNTER), S(X1, Y1, 0), S(X1, Y0, 0)], "#5e4026", 0);
  for (let z = 3; z < COUNTER; z += 4) { // plank seams
    const a = S(X0, Y1, z), b = S(X1, Y1, z), c = S(X1, Y0, z);
    ctx.strokeStyle = "rgba(40,26,14,0.55)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.stroke();
  }
  // a cloth hanging over the front of the counter in the stall colour
  poly([S(X0 + 2, Y1, COUNTER), S(X1 - 2, Y1, COUNTER), S(X1 - 2, Y1, COUNTER - 6), S(X0 + 2, Y1, COUNTER - 6)], hex(color, 0.85));
  line(ctx, S(X0, Y1, COUNTER), S(X1, Y1, COUNTER), "#c89a68");
  line(ctx, S(X1, Y1, COUNTER), S(X1, Y0, COUNTER), "#c89a68");
  // goods on the counter: crates of produce, jars, bread
  const goods = ["#e74c3c", "#f1c40f", "#27ae60", "#e67e22", "#8e44ad", "#d35400", "#ecf0f1"];
  let gi = Math.floor(hash(x0, y0, 5) * goods.length);
  for (let gx = X0 + 4; gx < X1 - 6; gx += 9) {
    const gy = (Y0 + Y1) / 2 - 2;
    // little crate
    poly([S(gx, gy, COUNTER + 4), S(gx + 7, gy, COUNTER + 4), S(gx + 7, gy + 6, COUNTER + 4), S(gx, gy + 6, COUNTER + 4)], "#8a6239");
    poly([S(gx, gy + 6, COUNTER + 4), S(gx + 7, gy + 6, COUNTER + 4), S(gx + 7, gy + 6, COUNTER), S(gx, gy + 6, COUNTER)], "#6b4a2d");
    // heap of produce
    const col = goods[gi++ % goods.length];
    for (let k = 0; k < 4; k++) {
      const p = S(gx + 1.5 + (k % 2) * 3.5, gy + 1 + Math.floor(k / 2) * 2.5, COUNTER + 5 + (k === 3 ? 1 : 0));
      ctx.fillStyle = col; ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 2);
      ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 1, 1);
    }
  }
  // front posts
  post(X0, Y1, FRONT_EAVE); post(X1, Y1, FRONT_EAVE);
  // striped awning: sloped canvas from the back (high) to the front (low), stripes running front to back
  const n = Math.max(4, Math.round((X1 - X0 + 2 * OV) / 6));
  for (let i = 0; i < n; i++) {
    const ax = X0 - OV + ((X1 - X0 + 2 * OV) * i) / n, bx = X0 - OV + ((X1 - X0 + 2 * OV) * (i + 1)) / n;
    poly([S(ax, Y0 - 2, POST), S(bx, Y0 - 2, POST), S(bx, Y1 + OV, FRONT_EAVE), S(ax, Y1 + OV, FRONT_EAVE)], i % 2 ? "#f4efe6" : hex(color));
  }
  // scalloped valance along the front edge
  for (let i = 0; i < n; i++) {
    const ax = X0 - OV + ((X1 - X0 + 2 * OV) * i) / n, bx = X0 - OV + ((X1 - X0 + 2 * OV) * (i + 1)) / n;
    const a = S(ax, Y1 + OV, FRONT_EAVE), b = S(bx, Y1 + OV, FRONT_EAVE), m = S((ax + bx) / 2, Y1 + OV, FRONT_EAVE - 4);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(m.x, m.y + 2, b.x, b.y); ctx.closePath();
    ctx.fillStyle = i % 2 ? "#ddd6c9" : hex(color, 0.8); ctx.fill();
  }
  // the awning's side edge (east) shows its thickness, plus a shade line
  poly([S(X1 + OV, Y0 - 2, POST), S(X1 + OV, Y1 + OV, FRONT_EAVE), S(X1 + OV, Y1 + OV, FRONT_EAVE - 2), S(X1 + OV, Y0 - 2, POST - 2)], hex(color, 0.55));
  line(ctx, S(X0 - OV, Y1 + OV, FRONT_EAVE), S(X1 + OV, Y1 + OV, FRONT_EAVE), "rgba(60,20,20,0.5)");
  tex.refresh();
  sliced(scene, key, X0, Y0, X1, Y1, left, topY, cw, ch, false);
}

// ---------- ruined walls (thin, broken, with rubble) ----------

/**
 * One tile of a ruined wall: a wall about a third of a tile thick running from the tile centre towards each
 * connected neighbour (mask bits N=1 E=2 S=4 W=8), its top broken into uneven steps, stone or charred timber,
 * with fallen stones / splinters at its foot. Returns the texture key and the canvas height above the tile centre.
 */
/** One ivy leaf: a small dark-green blob lit on its top-left. */
function leaf(c: CanvasRenderingContext2D, x: number, y: number, R: () => number, k: number) {
  const g = [0x2c4a22, 0x3a5a28, 0x4a6a30, 0x5e7a38][Math.floor(R() * 4)];
  const s = 0.55 + R() * 0.55;
  c.fillStyle = col(g, 0.55 * k); c.beginPath(); c.ellipse(x + 0.25, y + 0.3, s, s * 0.75, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = col(g, k); c.beginPath(); c.ellipse(x, y, s, s * 0.75, R() * 3, 0, Math.PI * 2); c.fill();
  c.fillStyle = col(g, 1.35 * k, 0.7); c.beginPath(); c.ellipse(x - s * 0.3, y - s * 0.3, s * 0.4, s * 0.3, 0, 0, Math.PI * 2); c.fill();
}
/** A rough fallen stone: an irregular lit top over a darker side, with a shadow. */
function chunk(c: CanvasRenderingContext2D, I: Iso, u: number, v: number, r0: number, R: () => number, base: number) {
  const n = 6, top: IPt[] = [], foot: IPt[] = [];
  const h = r0 * (0.6 + R() * 0.5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, rr = r0 * (0.7 + R() * 0.5);
    top.push(I.p(u + Math.cos(a) * rr * 0.8, v + Math.sin(a) * rr * 0.8, h));
    foot.push(I.p(u + Math.cos(a) * rr, v + Math.sin(a) * rr, 0));
  }
  const [sx, sy] = I.p(u + 0.8, v + 0.8, 0);
  c.fillStyle = "rgba(0,0,0,0.3)"; c.beginPath(); c.ellipse(sx, sy, r0 * 1.5, r0 * 0.7, 0, 0, Math.PI * 2); c.fill();
  const tone = 0.8 + R() * 0.35;
  I.poly(foot, col(base, 0.6 * tone));
  for (let i = 0; i < n; i++) { // side facets between the top and foot rings
    const j = (i + 1) % n, lit = Math.cos((i / n) * Math.PI * 2 + 0.8);
    I.poly([top[i], top[j], foot[j], foot[i]], col(base, (0.62 + 0.18 * lit) * tone));
  }
  I.poly(top, col(base, 1.08 * tone), "rgba(20,16,12,0.5)", 0.25);
  if (R() < 0.5) { const [mx, my] = I.p(u - 0.2, v - 0.2, h); c.fillStyle = "rgba(78,102,46,0.75)"; c.beginPath(); c.ellipse(mx, my, r0 * 0.6, r0 * 0.3, 0, 0, Math.PI * 2); c.fill(); }
}
/** A weed tuft (k > 2: a small fern / sapling). */
function tuft(c: CanvasRenderingContext2D, x: number, y: number, R: () => number, k: number) {
  const n = k > 2 ? 9 : 4 + Math.floor(R() * 4);
  c.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (R() - 0.5) * 2.0, L = (1.8 + R() * 2.4) * k;
    const g = [0x3c5a26, 0x4e6c2e, 0x62783a, 0x7a7a40][Math.floor(R() * 4)];
    c.strokeStyle = col(g, 0.9 + R() * 0.3); c.lineWidth = k > 2 ? 0.6 : 0.4;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * L * 0.4, y + Math.sin(a) * L * 0.6, x + Math.cos(a) * L, y + Math.sin(a) * L * 0.7); c.stroke();
  }
}

export function ruinWallTexture(scene: Phaser.Scene, stone: boolean, mask: number, tx: number, ty: number) {
  const variant = Math.floor(hash(tx, ty, 77) * 6);
  const key = `rw_${stone ? "s" : "w"}_${mask}_${variant}`;
  const MAXH = stone ? 30 : 36, PAD = 8;
  const W = 64, H = 32 + MAXH + PAD;
  if (scene.textures.exists(key)) return { key, up: MAXH + PAD + 16 };
  // local world coords (0..32 on the tile) to canvas
  const S = (x: number, y: number, z: number): Pt => ({ x: x - y + 32, y: (x + y) / 2 - z + MAXH + PAD });
  const r = (k: number) => hash(variant * 31 + k, mask, stone ? 5 : 9);

  /** A box from (x0,y0) to (x1,y1), h high: top, south-west and south-east faces. */
  let ctx!: CanvasRenderingContext2D, face: any, cap: any;
  const box = (x0: number, y0: number, x1: number, y1: number, h: number, shadeK = 1) => {
    if (h <= 0) return;
    const top = [S(x0, y0, h), S(x1, y0, h), S(x1, y1, h), S(x0, y1, h)];
    const sw = [S(x0, y1, h), S(x1, y1, h), S(x1, y1, 0), S(x0, y1, 0)];
    const se = [S(x1, y0, h), S(x1, y1, h), S(x1, y1, 0), S(x1, y0, 0)];
    // faces textured in world px (so bricks keep their size), offset by position for variety
    texPoly(ctx, sw, face, 0, 0, S(x0, y1, h), { x: 1, y: 0.5 }, { x: 0, y: 1 }, Math.ceil((x1 - x0) / TILE) + 1, Math.ceil(h / TILE) + 1, 0.12 * shadeK);
    texPoly(ctx, se, face, 0, 0, S(x1, y0, h), { x: -1, y: 0.5 }, { x: 0, y: 1 }, Math.ceil((y1 - y0) / TILE) + 1, Math.ceil(h / TILE) + 1, 0.36 * shadeK);
    texPoly(ctx, top, cap, 0, 0, S(x0, y0, h), { x: 1, y: 0.5 }, { x: -1, y: 0.5 }, 2, 2, 0);
    line(ctx, S(x0, y1, h), S(x1, y1, h), "rgba(255,250,235,0.18)");
  };

  const T2 = stone ? 5 : 3; // half thickness
  const c = 16;
  type Seg = { x0: number; y0: number; x1: number; y1: number; h: number };
  const segs: Seg[] = [];
  // broken height profile: a few steps along each arm, lower towards the ends of a break
  const height = (k: number) => {
    const base = stone ? 14 : 18;
    const v = base + r(k) * (MAXH - base);
    return Math.round(v / 3) * 3;
  };
  const STEP = stone ? 6 : 4;
  const arms: [number, number, number][] = [[1, 0, -1], [8, -1, 0], [2, 1, 0], [4, 0, 1]];
  let k = 0;
  for (const [bit, dx, dy] of arms) {
    if (!(mask & bit)) continue;
    for (let d = T2; d < 16; d += STEP) {
      const d1 = Math.min(16, d + STEP);
      let h = height(k++);
      if (!stone && (k % 3)) h = Math.round(h * 0.45); // timber: posts stand tall, the planks between are burnt low
      const a = dx !== 0
        ? { x0: dx > 0 ? c + d : c - d1, x1: dx > 0 ? c + d1 : c - d, y0: c - T2, y1: c + T2 }
        : { y0: dy > 0 ? c + d : c - d1, y1: dy > 0 ? c + d1 : c - d, x0: c - T2, x1: c + T2 };
      segs.push({ ...a, h });
    }
  }
  segs.push({ x0: c - T2, y0: c - T2, x1: c + T2, y1: c + T2, h: mask ? height(99) : Math.round(height(99) * 0.7) });
  // rubble: fallen stones / splinters beside the wall
  const rubble: Seg[] = [];
  const n = 3 + Math.floor(r(50) * 4);
  for (let i = 0; i < n; i++) {
    const px0 = 3 + r(60 + i) * 24, py0 = 3 + r(70 + i) * 24;
    if (Math.abs(px0 - c) < T2 + 2 && Math.abs(py0 - c) < T2 + 2) continue;
    const s = stone ? 2 + Math.floor(r(80 + i) * 3) : 1 + Math.floor(r(80 + i) * 2);
    rubble.push({ x0: px0, y0: py0, x1: px0 + (stone ? s : 6), y1: py0 + s, h: stone ? 1 + Math.floor(r(90 + i) * 3) : 1 });
  }
  if (SMOOTH) {
    // painted at 6x: stone courses or charred planks with real shading, moss and a broken top
    hiResTexture(scene, key, W, H, 1, 6, (c) => {
      const I = new Iso(c, 32, MAXH + PAD);
      for (const sg of segs) I.shadow(sg.x0, sg.y0, sg.x1, sg.y1, 2, 0.35);
      const all = [...segs.map((sg) => ({ sg, rub: false })), ...rubble.map((sg) => ({ sg, rub: true }))];
      all.sort((a, b) => (a.sg.x0 + a.sg.y0) - (b.sg.x0 + b.sg.y0));
      for (const { sg, rub } of all) {
        if (sg.h <= 0) continue;
        const base = stone ? (rub ? 0x6a655c : 0x7a7468) : (rub ? 0x3a2a1c : 0x4a3424);
        const seed = Math.round(sg.x0 * 7 + sg.y0 * 13 + variant);
        I.box(sg.x0, sg.x1, sg.y0, sg.y1, 0, sg.h, base, stone ? stones(c, seed, base, 1) : planks(c, seed, base));
        if (!rub) { // jagged broken top with moss / char
          const [tx0, ty0] = I.p((sg.x0 + sg.x1) / 2, (sg.y0 + sg.y1) / 2, sg.h);
          c.fillStyle = stone ? "rgba(74,96,44,0.55)" : "rgba(20,14,10,0.7)";
          c.beginPath(); c.ellipse(tx0, ty0, 3 + (seed % 3), 1.4, 0, 0, Math.PI * 2); c.fill();
          // nature taking over: ivy climbing the two visible faces, thicker low down
          const ivy = r(200 + seed % 17);
          if (ivy < (stone ? 0.7 : 0.45)) {
            const reach = sg.h * (0.35 + r(210 + seed % 13) * 0.65);
            const R = rng(seed * 3 + 1);
            const nLeaf = Math.round((sg.x1 - sg.x0 + sg.y1 - sg.y0) * reach * 0.12);
            for (let i = 0; i < nLeaf; i++) {
              const z = reach * Math.pow(R(), 1.6);
              const onL = R() < 0.55;
              const [lx, ly] = onL ? I.p(sg.x0 + R() * (sg.x1 - sg.x0), sg.y1, z) : I.p(sg.x1, sg.y0 + R() * (sg.y1 - sg.y0), z);
              leaf(c, lx, ly, R, onL ? 1 : 0.72);
            }
          }
        }
      }
      // fallen pieces scattered on the ground: rough stones or charred beams, some half sunk in grass
      const R = rng(variant * 101 + mask * 7 + (stone ? 1 : 2));
      const nDebris = 4 + Math.floor(R() * 6);
      for (let i = 0; i < nDebris; i++) {
        const u = 1 + R() * 30, v = 1 + R() * 30;
        if (segs.some((sg) => u > sg.x0 - 1 && u < sg.x1 + 1 && v > sg.y0 - 1 && v < sg.y1 + 1)) continue;
        if (stone || R() < 0.4) chunk(c, I, u, v, 0.8 + R() * 1.8, R, stone ? 0x77716a : 0x6a6258);
        else { // a fallen charred beam lying at an angle
          const L = 6 + R() * 8, an = R() * Math.PI;
          const du = Math.cos(an) * L / 2, dv = Math.sin(an) * L / 2;
          const a = I.p(u - du, v - dv, 0.9), b = I.p(u + du, v + dv, 0.9);
          c.lineCap = "butt";
          c.strokeStyle = "rgba(0,0,0,0.35)"; c.lineWidth = 2.4; c.beginPath(); c.moveTo(a[0] + 0.6, a[1] + 1.2); c.lineTo(b[0] + 0.6, b[1] + 1.2); c.stroke();
          c.strokeStyle = "#2a1d14"; c.lineWidth = 1.9; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
          c.strokeStyle = "rgba(120,90,60,0.6)"; c.lineWidth = 0.5; c.beginPath(); c.moveTo(a[0], a[1] - 0.6); c.lineTo(b[0], b[1] - 0.6); c.stroke();
          c.fillStyle = "rgba(10,8,6,0.8)"; c.fillRect(b[0] - 0.6, b[1] - 0.9, 1.2, 1.2); // burnt end
        }
      }
      // weeds, ferns and the odd sapling at the wall foot and among the debris
      const nWeed = 6 + Math.floor(R() * 8);
      for (let i = 0; i < nWeed; i++) {
        let u = 1 + R() * 30, v = 1 + R() * 30;
        const sg = segs[Math.floor(R() * segs.length)];
        if (R() < 0.6 && sg) { u = sg.x0 + R() * (sg.x1 - sg.x0); v = sg.y1 + 0.6 + R() * 1.5; }
        const [wx0, wy0] = I.p(u, v, 0);
        tuft(c, wx0, wy0, R, R() < 0.12 ? 2.6 : 1);
      }
    });
    return { key, up: MAXH + PAD + 16 };
  }
  const tex = scene.textures.createCanvas(key, W, H)!;
  ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  face = stone ? stoneFace() : woodFace(); cap = stone ? stoneCap() : woodCap();
  // soft shadow at the wall foot
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  for (const s of segs) {
    const p = [S(s.x0, s.y1, 0), S(s.x1 + 3, s.y1 + 3, 0), S(s.x1 + 3, s.y0 + 3, 0), S(s.x1, s.y0, 0)];
    ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.fill();
  }
  // back to front
  const all = [...segs.map((s) => ({ s, k: 1 })), ...rubble.map((s) => ({ s, k: 0.8 }))];
  all.sort((a, b) => (a.s.x0 + a.s.y0) - (b.s.x0 + b.s.y0));
  for (const { s, k: shadeK } of all) box(s.x0, s.y0, s.x1, s.y1, s.h, shadeK);
  tex.refresh();
  return { key, up: MAXH + PAD + 16 };
}

// ---------- walk-in barns ----------

/** Red barn boards, upright, with dark seams and weathering. */
const barnFace = () => mat("barnFace", (c) => {
  const tones = ["#a23324", "#9a2e20", "#ad3a2a", "#932b1e"];
  for (let i = 0; i < 8; i++) {
    px(c, i * 4, 0, 4, 32, tones[Math.floor(hash(i, 2, 31) * tones.length)]);
    px(c, i * 4, 0, 1, 32, "#6e1d14");
    px(c, i * 4 + 1, 0, 1, 32, "rgba(255,190,160,0.12)");
    for (let k = 0; k < 3; k++) if (hash(i, k, 32) < 0.5) px(c, i * 4 + 2, Math.floor(hash(i, k, 33) * 30), 1, 2, "#7f2418");
  }
});
/** Weathered grey-brown wooden shingles. */
const barnRoof = () => mat("barnRoof", (c) => {
  const tones = ["#5d5048", "#544840", "#665850", "#4d423b", "#6c5e54"];
  for (let r = 0; r < 8; r++) for (let b = -1; b < 6; b++) {
    const x = b * 6 + (r % 2 ? 3 : 0), y = r * 4;
    px(c, x, y, 6, 4, tones[Math.floor(hash(b + 7, r, 41) * tones.length)]);
    px(c, x, y + 3, 6, 1, "#3a302a");
    px(c, x + 5, y, 1, 4, "#41372f");
    px(c, x, y, 5, 1, "rgba(255,240,220,0.10)");
  }
});
const barnCap = () => mat("barnCap", (c) => {
  px(c, 0, 0, 32, 32, "#e8e0d0");
  for (let i = 0; i < 8; i++) px(c, 0, i * 4 + 3, 32, 1, "#c9bfae");
});

const BARN_H = 40, BARN_T = 9; // wall height and plank wall thickness (world px)

/** The barns of BARNS: plank walls you can walk between, open doors, a gambrel roof that fades when you go in. */
export function buildBarns(scene: Phaser.Scene): Set<number> {
  const used = new Set<number>();
  const W = OBJECTS[0].length;
  for (const b of BARNS) {
    for (let ty = b.y; ty < b.y + b.h; ty++) for (let tx = b.x; tx < b.x + b.w; tx++) {
      const edge = tx === b.x || tx === b.x + b.w - 1 || ty === b.y || ty === b.y + b.h - 1;
      if (!edge) continue;
      const door = ty === b.y + b.h - 1 && tx >= b.door0 && tx <= b.door1;
      if (!door) barnWall(scene, b, tx, ty);
      used.add(ty * W + tx);
    }
    barnRoofImage(scene, b);
  }
  return used;
}

type Box = { x0: number; y0: number; x1: number; y1: number; z0?: number; h: number; door?: boolean };

function barnWall(scene: Phaser.Scene, b: typeof BARNS[number], tx: number, ty: number) {
  const boxes: Box[] = [], T2 = BARN_T;
  const back = ty === b.y, front = ty === b.y + b.h - 1, west = tx === b.x, east = tx === b.x + b.w - 1;
  if (back) boxes.push({ x0: 0, y0: 0, x1: 32, y1: T2, h: BARN_H });
  if (west) boxes.push({ x0: 0, y0: 0, x1: T2, y1: 32, h: BARN_H });
  if (east) boxes.push({ x0: 32 - T2, y0: 0, x1: 32, y1: 32, h: BARN_H });
  if (front) boxes.push({ x0: 0, y0: 32 - T2, x1: 32, y1: 32, h: BARN_H });
  // big doors swung open flat against the front wall
  if (front && tx === b.door0 - 1) boxes.push({ x0: -16, y0: 32, x1: 32, y1: 35, h: BARN_H - 6, door: true });
  if (front && tx === b.door1 + 1) boxes.push({ x0: 0, y0: 32, x1: 48, y1: 35, h: BARN_H - 6, door: true });
  const key = `barnwall_${tx}_${ty}`;
  const CW = 128, PAD = BARN_H + 12, CH = 32 + 32 + PAD;
  const tex = scene.textures.createCanvas(key, CW, CH)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  const S = (x: number, y: number, z: number): Pt => ({ x: x - y + CW / 2, y: (x + y) / 2 - z + PAD });
  const face = barnFace(), cap = barnCap();
  boxes.sort((a, c) => (a.x0 + a.y0) - (c.x0 + c.y0));
  // contact shadow
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  for (const q of boxes) {
    const p = [S(q.x0, q.y1, 0), S(q.x1 + 4, q.y1 + 4, 0), S(q.x1 + 4, q.y0 + 4, 0), S(q.x1, q.y0, 0)];
    ctx.beginPath(); p.forEach((r, i) => (i ? ctx.lineTo(r.x, r.y) : ctx.moveTo(r.x, r.y))); ctx.closePath(); ctx.fill();
  }
  for (const q of boxes) {
    const { x0, y0, x1, y1, h } = q;
    const top = [S(x0, y0, h), S(x1, y0, h), S(x1, y1, h), S(x0, y1, h)];
    const sw = [S(x0, y1, h), S(x1, y1, h), S(x1, y1, 0), S(x0, y1, 0)];
    const se = [S(x1, y0, h), S(x1, y1, h), S(x1, y1, 0), S(x1, y0, 0)];
    texPoly(ctx, sw, face, 0, 0, S(x0, y1, h), { x: 1, y: 0.5 }, { x: 0, y: 1 }, Math.ceil((x1 - x0) / TILE) + 1, 2, 0.1);
    texPoly(ctx, se, face, 0, 0, S(x1, y0, h), { x: -1, y: 0.5 }, { x: 0, y: 1 }, Math.ceil((y1 - y0) / TILE) + 1, 2, 0.34);
    texPoly(ctx, top, cap, 0, 0, S(x0, y0, h), { x: 1, y: 0.5 }, { x: -1, y: 0.5 }, 2, 2, 0);
    // white trim: top rail and foot board
    line(ctx, S(x0, y1, h - 1), S(x1, y1, h - 1), "#eee6d6", 2);
    line(ctx, S(x1, y1, h - 1), S(x1, y0, h - 1), "#c9bfae", 2);
    line(ctx, S(x0, y1, 1), S(x1, y1, 1), "rgba(60,20,10,0.6)", 2);
    if (q.door) {
      // white frame and cross brace on the door leaf
      const a = S(x0 + 2, y1, h - 2), bb = S(x1 - 2, y1, h - 2), c = S(x1 - 2, y1, 2), d = S(x0 + 2, y1, 2);
      ctx.strokeStyle = "#f0e8d8"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(bb.x, bb.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.moveTo(bb.x, bb.y); ctx.lineTo(d.x, d.y); ctx.stroke();
      const m = S((x0 + x1) / 2, y1, h / 2);
      ctx.fillStyle = "#3a2a1e"; ctx.fillRect(Math.round(m.x) - 1, Math.round(m.y) - 1, 2, 2);
    }
  }
  // white corner boards on the outside corners
  const corner = (x: number, y: number) => line(ctx, S(x, y, BARN_H), S(x, y, 0), "#e8e0d0", 3);
  if (front && east) corner(32, 32);
  if (front && west) corner(0, 32);
  if (back && east) corner(32, 0);
  tex.refresh();
  const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
  scene.add.image(cx, cy, key).setOrigin(0.5, (16 + PAD) / CH).setDepth(cy);
}

function barnRoofImage(scene: Phaser.Scene, b: typeof BARNS[number]) {
  const X0 = b.x * TILE, X1 = (b.x + b.w) * TILE, Y0 = b.y * TILE, Y1 = (b.y + b.h) * TILE;
  const E = BARN_H, D = Y1 - Y0, KI = Math.round(D * 0.22), KZ = 36, RZ = KZ + 20, o = 7;
  const ym = (Y0 + Y1) / 2, eaveZ = E - Math.round((o * KZ) / KI);
  const left = P(X0 - o, Y1 + o).x - 4, right = P(X1 + o, Y0 - o).x + 4;
  const topY = P(X0 - o, Y0 - o, E + RZ + 24).y - 6, bottom = P(X1 + o, Y1 + o, eaveZ).y + 6;
  const cw = Math.ceil(right - left), ch = Math.ceil(bottom - topY);
  const key = `barnroof_${b.x}_${b.y}`;
  const tex = scene.textures.createCanvas(key, cw, ch)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  const S = (x: number, y: number, z = 0): Pt => { const p = P(x, y, z); return { x: p.x - left, y: p.y - topY }; };
  const sub = (a: Pt, c: Pt): Pt => ({ x: a.x - c.x, y: a.y - c.y });
  const poly = (pts: Pt[], fill: string) => {
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  };
  const roof = barnRoof(), face = barnFace();
  // a roof plane from an eave line (ya, za) up to (yb, zb), along the whole length: shingles in world px
  const plane = (ya: number, za: number, yb: number, zb: number, shade: number) => {
    const A = S(X0 - o, ya, za), B = S(X1 + o, ya, za), C = S(X1 + o, yb, zb), Dd = S(X0 - o, yb, zb);
    const len = Math.hypot(yb - ya, zb - za);
    const v = { x: (Dd.x - A.x) / len, y: (Dd.y - A.y) / len };
    texPoly(ctx, [A, B, C, Dd], roof, 0, 0, A, { x: 1, y: 0.5 }, v, Math.ceil((X1 - X0 + 2 * o) / TILE) + 1, Math.ceil(len / TILE) + 1, shade);
  };
  // back slopes (only their top shows)
  plane(Y0 - o, eaveZ, Y0 + KI, E + KZ, 0.5);
  plane(Y0 + KI, E + KZ, ym, E + RZ, 0.4);
  // east gable: the wall goes on up under the roof, with a hayloft door
  const g = [S(X1, Y0, E), S(X1, Y0 + KI, E + KZ), S(X1, ym, E + RZ), S(X1, Y1 - KI, E + KZ), S(X1, Y1, E)];
  texPoly(ctx, g, face, 0, 0, S(X1, Y0, E + RZ), { x: -1, y: 0.5 }, { x: 0, y: 1 }, Math.ceil(D / TILE) + 1, Math.ceil(RZ / TILE) + 1, 0.34);
  line(ctx, S(X1, Y0, E), S(X1, Y1, E), "#e8e0d0", 2);
  const hw = 14, hz0 = E + 6, hz1 = E + 34;
  const hd = [S(X1, ym - hw, hz1), S(X1, ym + hw, hz1), S(X1, ym + hw, hz0), S(X1, ym - hw, hz0)];
  poly(hd, "#7a2318");
  ctx.strokeStyle = "#f0e8d8"; ctx.lineWidth = 2;
  ctx.beginPath(); hd.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
  ctx.moveTo(hd[0].x, hd[0].y); ctx.lineTo(hd[2].x, hd[2].y); ctx.moveTo(hd[1].x, hd[1].y); ctx.lineTo(hd[3].x, hd[3].y); ctx.stroke();
  // hay beam sticking out above the loft door, with a pulley
  const bm0 = S(X1, ym, E + RZ - 8), bm1 = S(X1 + 14, ym, E + RZ - 8);
  line(ctx, bm0, bm1, "#4a3020", 3);
  line(ctx, S(X1 + 12, ym, E + RZ - 9), S(X1 + 12, ym, E + RZ - 20), "#2a1e14", 1);
  // lintel over the open doorway
  const dx0 = b.door0 * TILE, dx1 = (b.door1 + 1) * TILE, LZ = E - 9;
  poly([S(dx0, Y1, E), S(dx1, Y1, E), S(dx1, Y1, LZ), S(dx0, Y1, LZ)], "#8a281c");
  poly([S(dx0, Y1, LZ), S(dx1, Y1, LZ), S(dx1, Y1 - BARN_T, LZ), S(dx0, Y1 - BARN_T, LZ)], "#4a1a12");
  line(ctx, S(dx0, Y1, LZ), S(dx1, Y1, LZ), "#eee6d6", 2);
  line(ctx, S(dx0, Y1, E - 1), S(dx1, Y1, E - 1), "#eee6d6", 2);
  // front slopes: steep lower, shallow upper
  plane(Y1 + o, eaveZ, Y1 - KI, E + KZ, 0.04);
  plane(Y1 - KI, E + KZ, ym, E + RZ, 0);
  // edges: eave boards, the knee, the gable rake and the ridge
  line(ctx, S(X0 - o, Y1 + o, eaveZ), S(X1 + o, Y1 + o, eaveZ), "#e8e0d0", 2);
  line(ctx, S(X0 - o, Y1 - KI, E + KZ), S(X1 + o, Y1 - KI, E + KZ), "rgba(30,22,16,0.55)", 1);
  ctx.strokeStyle = "#e8e0d0"; ctx.lineWidth = 2; ctx.beginPath();
  for (const [i, p] of [S(X1 + o, Y1 + o, eaveZ), S(X1 + o, Y1 - KI, E + KZ), S(X1 + o, ym, E + RZ), S(X1 + o, Y0 + KI, E + KZ), S(X1 + o, Y0 - o, eaveZ)].entries()) i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
  ctx.stroke();
  line(ctx, S(X0 - o, ym, E + RZ + 1), S(X1 + o, ym, E + RZ + 1), "#3a302a", 2);
  // a little louvred cupola on the ridge with a weather vane
  const cx = (X0 + X1) / 2, cs = 9, cz0 = E + RZ - 4, cz1 = E + RZ + 12;
  const cube = (z0: number, z1: number, col1: string, col2: string, s2 = cs) => {
    poly([S(cx - s2, ym + s2, z1), S(cx + s2, ym + s2, z1), S(cx + s2, ym + s2, z0), S(cx - s2, ym + s2, z0)], col1);
    poly([S(cx + s2, ym - s2, z1), S(cx + s2, ym + s2, z1), S(cx + s2, ym + s2, z0), S(cx + s2, ym - s2, z0)], col2);
  };
  cube(cz0, cz1, "#b03a2a", "#8a281c");
  for (let k = 0; k < 3; k++) line(ctx, S(cx - cs + 2, ym + cs, cz0 + 5 + k * 3), S(cx + cs - 2, ym + cs, cz0 + 5 + k * 3), "#3a1a12");
  const apex = S(cx, ym, cz1 + 10);
  poly([S(cx - cs - 2, ym + cs + 2, cz1), S(cx + cs + 2, ym + cs + 2, cz1), apex], "#5d5048");
  poly([S(cx + cs + 2, ym - cs - 2, cz1), S(cx + cs + 2, ym + cs + 2, cz1), apex], "#4a3f38");
  line(ctx, apex, S(cx, ym, cz1 + 20), "#2a2a2a", 1);
  line(ctx, S(cx - 5, ym, cz1 + 17), S(cx + 5, ym, cz1 + 17), "#2a2a2a", 1);
  void sub;
  tex.refresh();
  sliced(scene, key, X0, Y0, X1, Y1, left, topY, cw, ch, true, 0.22);
}
