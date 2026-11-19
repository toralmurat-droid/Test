/**
 * Smooth painted ground for the isometric view (no pixel art): grass, dirt roads, cobbles, sand, water and fields
 * are painted per screen pixel at high resolution, with soft, wavy borders between them.
 * Runs inside a Web Worker (groundWorker.ts), so painting never stalls the game.
 *
 * A chunk is a rectangle of iso screen space (sx, sy). Each output pixel is mapped back to the world
 * (wx = sy + sx / 2, wy = sy - sx / 2), the ground tiles around it are blended, and the material colours are made
 * from layered value noise, Voronoi stones and furrows.
 */

import { crownCliffTopPixel, paintCrownGround } from "./crownPaint";

export interface GroundData {
  w: number; h: number; tile: number;
  /** shared/map.ts TILE_COUNT: display grids hold row * TILE_COUNT + id. */
  tileCount?: number;
  /** Ground tile id per tile (bridges already turned to water). */
  ground: Int16Array;
  /** 1 where a solid thing stands (walls, palisade, rocks): ground around it gets a soft contact shadow. */
  solid: Uint8Array;
  /** The elemental wilds (shared/map.ts ELEMENT_LANDS): rects in tiles whose ground turns blighted, frosted, burned or storm-scoured. */
  lands?: { x: number; y: number; w: number; h: number; el: string }[];
  /**
   * The underground band (shared/dungeon.ts): from row y0 the sea fades into the dark, from row rock on, solid tiles
   * are bare black rock and the open ones the dank earth of the Mawdeep's floors.
   */
  cave?: { y0: number; rock: number; end?: number; deep?: [number, number] };
  /** Act 2's desert band (shared/desert.ts), rows y0..y1: the same ground ids paint as dune sand, baked clay, sandstone. */
  desert?: { y0: number; y1: number };
  /** 1 on the desert's cliff tiles: their ground is the mountains' rock top (the outer steps stand up as blocks, iso.ts). */
  cliff?: Uint8Array;
  /** 1 on the desert's rim (shared/desert.ts DESERT_DUNES): rolling sand dunes, ray-traced in 3D by paintChunk (duneGrid). */
  dune?: Uint8Array;
  /** Act 3's moors band (shared/moors.ts), rows y0..y1: cool grey-green heath, peat, bog and granite; the cliffs' top is grey rock. */
  moors?: { y0: number; y1: number };
  /** Act 4's badlands band (shared/badlands.ts), rows y0..y1: red sand, cracked clay, gravel riverbeds; the mesas' top is red rock. */
  badlands?: { y0: number; y1: number };
  /** Act 5's sinkholes band (shared/sinkholes.ts), rows y0..y1: mossy damp earth, dark loam trails, green-brown grass; the loam cliffs' top is brown earth. */
  sinkholes?: { y0: number; y1: number };
  /** Act 6's Crown band (shared/crown.ts), rows y0..y1: cream marble courts, pale granite flags, wild green gardens; the granite cliffs' top is pale rock. */
  crown?: { y0: number; y1: number };
  /**
   * The capitals' band (shared/capitals.ts), rows y0 down: the usual Oakvale grounds (not the dark Mawdeep ones), each city tinted in its
   * clan's stone colour (`tints`, one [r, g, b] multiplier per plot; plot = floor((tile x - x0 + 2) / stride)); `rock` marks the solid
   * rock round the plots (black).
   */
  /** The capitals' band: per plot its tint and its homeland's act (the city's ground is painted like that land's). */
  cities?: { y0: number; x0: number; stride: number; tints: number[][]; acts: number[]; rock: Uint8Array };
}

// Tile ids (shared/map.ts T)
const GRASS = 0, GRASS_DARK = 1, TALL = 2, FLOWERS = 3, DIRT = 4, COBBLE = 5, SAND = 6, WATER = 7, BRIDGE = 8, FIELD = 9, CROPS = 10;
const FLOOR = 39, RUBBLE = 40, FLAGS = 42;
/** Painting a desert pixel (set per pixel in paintChunk): the grounds take their Act 2 looks. */
let DESERT = false;
/** Painting a moors pixel: the grounds take their Act 3 looks (moorsMaterial). */
let MOORS = false;
/** Painting a badlands pixel: the grounds take their Act 4 looks (badlandsMaterial). */
let BADLANDS = false;
/** Painting a sinkholes pixel: the grounds take their Act 5 looks (sinkholesMaterial). */
let SINKHOLES = false;
/** Painting a Crown pixel: the grounds take their Act 6 looks (crownMaterial). */
let CROWN = false;
/** Painting a capital-city pixel (set per pixel in paintChunk): no cave darkness, the city stone tint, black rock round the plots. */
let CITY = false;
const pal = (a: string[]) => a.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const HEATHP = pal(["#2c2c36", "#3e3a4a", "#544c60", "#6c6078", "#84788f", "#9a90a4"]);
const PEATP = pal(["#2a2824", "#3a3730", "#4c473d", "#605a4c", "#766f5e", "#8c846f"]);
const MOORGRASS = pal(["#2a3430", "#37453d", "#475a4b", "#5a705c", "#6f8570", "#849a84"]);
const BOGP = pal(["#141c1a", "#1d2a27", "#283a35", "#364b44", "#455c53", "#58705f"]);
const GRANITE = pal(["#3a3d42", "#50545a", "#686c72", "#82868c", "#9ca0a5", "#b4b7ba"]);
const SANDP = ["#7e5a30", "#9c7340", "#b88c50", "#cfa262", "#e0b676", "#eccb8e"].map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const CLAYP = ["#6a4028", "#7e5032", "#94623e", "#a8744a", "#ba8658", "#c99868"].map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const SSTONE = ["#4f3a28", "#6d5236", "#8a6c48", "#a6875c", "#bea06f", "#d2b684"].map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const REDSAND = pal(["#6e3a24", "#8a4a2c", "#a85e38", "#c27444", "#d68b54", "#e4a46e"]);
const REDCLAY = pal(["#4e2a1e", "#633426", "#7c4330", "#94523a", "#aa6444", "#bc7852"]);
const GRAVELP = pal(["#4a3a34", "#625047", "#7a665a", "#927c6c", "#a9927f", "#bea993"]);
const SCRUBP = pal(["#4a4426", "#5e5630", "#756b3c", "#8c8148", "#a2975a", "#b8ad70"]);
const REDSTONE = pal(["#5a2e22", "#78402e", "#95533a", "#b0684a", "#c97f5a", "#dc9a74"]);
const MOSSP = pal(["#1f2c1a", "#2c3d22", "#3b5029", "#4d6532", "#617c3d", "#789350"]);
const LOAMP = pal(["#2e2218", "#40301f", "#54402a", "#6a5236", "#81674a", "#977d5c"]);
const DAMPGRASS = pal(["#26301a", "#34421f", "#455529", "#586a33", "#6d7f40", "#839650"]);
const LOAMSTONE = pal(["#3a2e24", "#51412f", "#69553d", "#816b4e", "#9a8261", "#b09876"]);
const NT = 68; // shared/map.ts TILE_COUNT
/** Kernel radius in tiles: how far grounds reach into each other. */
const KR = 1.8;

function hash2(x: number, y: number, s: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise in [0, 1). */
function vn(x: number, y: number, s: number) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  let tx = x - x0, ty = y - y0;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, s), b = hash2(x0 + 1, y0, s), c = hash2(x0, y0 + 1, s), d = hash2(x0 + 1, y0 + 1, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
const fbm = (x: number, y: number, s: number) => vn(x, y, s) * 0.55 + vn(x * 2.03, y * 2.03, s + 11) * 0.3 + vn(x * 4.1, y * 4.1, s + 23) * 0.15;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Precomputed fields at tile resolution, interpolated per pixel. */
export interface Fields { depth: Float32Array; ao: Float32Array; rock?: Float32Array; cliff?: Float32Array; dune?: Float32Array }

export function makeFields(g: GroundData): Fields {
  const { w, h, ground, solid } = g;
  // Water depth: tiles from the nearest land (BFS), 0 on land
  const depth = new Float32Array(w * h).fill(99);
  const q: number[] = [];
  for (let i = 0; i < w * h; i++) if (ground[i] !== WATER && ground[i] !== BRIDGE) { depth[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % w, y = (i / w) | 0, d = depth[i] + 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (depth[j] > d) { depth[j] = d; q.push(j); }
    }
  }
  // Contact shadow: solid tiles blurred over their neighbours
  const ao = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const nx = x + a, ny = y + b;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (solid[ny * w + nx]) s += a === 0 && b === 0 ? 0.5 : a === 0 || b === 0 ? 0.14 : 0.07;
    }
    ao[y * w + x] = Math.min(1, s);
  }
  // Rock mass of the underground: solid tiles below the sea band (black past the cave walls)
  let rock: Float32Array | undefined;
  if (g.cave) {
    rock = new Float32Array(w * h);
    for (let y = g.cave.rock; y < (g.cave.end ?? h); y++) for (let x = 0; x < w; x++) rock[y * w + x] = solid[y * w + x];
    if (g.cave.deep) for (let y = g.cave.deep[0]; y < g.cave.deep[1]; y++) for (let x = 0; x < w; x++) rock[y * w + x] = solid[y * w + x]; // the deep band under the desert
  }
  if (g.cities) { // the rock round the capitals' plots
    rock ??= new Float32Array(w * h);
    for (let y = g.cities.y0 - 4; y < h; y++) for (let x = 0; x < w; x++) rock[y * w + x] = g.cities.rock[y * w + x];
  }
  const cliff = g.cliff ? Float32Array.from(g.cliff) : undefined;
  // Dune depth: tiles in from the open desert (BFS inside the dune tiles, capped), 0 off the dunes
  let dune: Float32Array | undefined;
  if (g.dune && g.desert) {
    dune = new Float32Array(w * h);
    const dq: number[] = [], y0 = g.desert.y0, y1 = Math.min(h, g.desert.y1);
    for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (g.dune[i]) dune[i] = 99; else dq.push(i); }
    for (let k = 0; k < dq.length; k++) {
      const i = dq[k], x = i % w, y = (i / w) | 0, d = dune[i] + 1;
      if (d > DUNE_CAP) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < y0 || nx >= w || ny >= y1) continue;
        const j = ny * w + nx;
        if (dune[j] > d) { dune[j] = d; dq.push(j); }
      }
    }
    for (let i = 0; i < w * h; i++) if (dune[i] > DUNE_CAP) dune[i] = DUNE_CAP;
  }
  return { depth, ao, rock, cliff, dune };
}

const out3 = new Float32Array(3);
/** How much of the material owns this spot (1 deep inside, ~0.3 at a border): old roads crumble near their edges. */
let OWN = 1;
/**
 * Grass is one material (Murat 2026-11-07: the ground looked ugly): the plain, dark, tall and flowery grass tiles are
 * not painted as separate grounds with borders between them (that drew stepped rings round every clearing), but as
 * one grass whose darkness, height and flowers follow the mix of those tiles around the pixel, smoothly.
 */
let G_DARK = 0, G_TALL = 0, G_FLOW = 0;

/**
 * Colour + "height" of one material at a world point. The height lets materials poke into each other at
 * borders (cobbles over grass, grass over dirt) instead of a plain cross-fade.
 */
const hx = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const COB = ["#3a3632", "#524d47", "#6a645b", "#837b70", "#9d9486"].map(hx);
const COB_WARM = ["#3d342c", "#574b3f", "#706152", "#8a7966", "#a4917b"].map(hx);
const COB_COOL = ["#33353a", "#4a4d52", "#62646a", "#7b7d82", "#95969a"].map(hx);
/** The black of solid rock and of the dark past the sea (a touch above the page background). */
const VOID = [16, 13, 15];
const COB_LINE = hx("#1b1714"), JOINT = ["#241c15", "#3a2e22", "#4f4030"].map(hx), MOSSG = ["#2a3a1a", "#3e5424", "#566e30"].map(hx);

function material(t: number, wx: number, wy: number, sx: number, sy: number, depth: number, now: number): number {
  if (DESERT && t !== WATER && t !== BRIDGE) return desertMaterial(t, wx, wy, sx, sy);
  if (MOORS && t !== WATER && t !== BRIDGE) return moorsMaterial(t, wx, wy, sx, sy);
  if (BADLANDS && t !== WATER && t !== BRIDGE) return badlandsMaterial(t, wx, wy, sx, sy);
  if (CROWN && t !== WATER && t !== BRIDGE) return crownMaterial(t, wx, wy, sx, sy);
  if (SINKHOLES && t !== WATER && t !== BRIDGE) return sinkholesMaterial(t, wx, wy, sx, sy);
  let r = 0, g = 0, b = 0, ht = 0.5;
  // big, slow grime and damp patches shared by every land material (muted, weathered look)
  const grime = fbm(wx / 110, wy / 110, 91);
  const grain = hash2(Math.floor(sx * 2), Math.floor(sy * 2), 92) - 0.5;
  switch (t) {
    case GRASS: case GRASS_DARK: case TALL: case FLOWERS: {
      const m = fbm(wx / 150, wy / 150, 3);
      const p = vn(wx / 22, wy / 22, 5);
      // blades lean a different way patch to patch (rotated noise), so the grass does not read as one vertical streak
      const lean = (vn(wx / 40, wy / 40, 31) - 0.5) * 1.4, cl = Math.cos(lean), sl = Math.sin(lean);
      const bx = sx * cl - sy * sl, by = sx * sl + sy * cl;
      const blade = vn(bx / 1.1, by / 4.6, 7) * 0.55 + vn(bx / 0.7, by / 2.8, 8) * 0.45;
      // how dark / tall the grass is here: the blend of grass tiles around, plus big soft noise so it never steps
      const dk = clamp01(G_DARK + (fbm(wx / 90, wy / 90, 21) - 0.5) * 0.5), tl = clamp01(G_TALL + (vn(wx / 60, wy / 60, 22) - 0.5) * 0.3);
      const dark = dk > 0.5, tall = tl > 0.5;
      // gloomy: dark moss and dead olive, dry brown-grey patches, never bright green
      r = 52 + 16 * m + (34 + 10 * m - (52 + 16 * m)) * dk;
      g = 62 + 13 * m + (44 + 9 * m - (62 + 13 * m)) * dk;
      b = 42 + 6 * m + (34 + 5 * m - (42 + 6 * m)) * dk;
      const dry = sstep(0.5, 0.78, fbm(wx / 70, wy / 70, 4)) * (0.8 - 0.45 * dk);
      r += (92 - r) * dry * 0.6; g += (82 - g) * dry * 0.5; b += (60 - b) * dry * 0.45;
      r += 8 * tl; g += 4 * tl;
      const k = (0.8 + 0.34 * p) * ((0.76 - 0.06 * tl) + (0.44 + 0.11 * tl) * blade);
      r *= k; g *= k; b *= k;
      // moss cushions: deep, soft green-black patches
      const moss = sstep(0.62, 0.8, fbm(wx / 26, wy / 26, 33)) * (0.4 + 0.6 * dk);
      if (moss > 0) { const mk = 0.85 + 0.25 * vn(wx / 2, wy / 2, 34); r += (26 * mk - r) * moss * 0.7; g += (40 * mk - g) * moss * 0.7; b += (24 * mk - b) * moss * 0.7; }
      // bare earth showing through worn spots
      const bare = sstep(0.72, 0.86, vn(wx / 38, wy / 38, 6) * 0.7 + p * 0.3 + (0.5 - blade) * 0.25) * (dark ? 0.4 : 0.9);
      if (bare > 0) {
        const e = 0.7 + 0.35 * vn(wx / 5, wy / 5, 12) + 0.25 * vn(wx / 1.6, wy / 1.6, 11);
        r += (84 * e - r) * bare; g += (66 * e - g) * bare; b += (46 * e - b) * bare;
      }
      // fallen leaves, twigs and small stones
      const cx = Math.floor(wx / 4), cy = Math.floor(wy / 4), hc = hash2(cx, cy, 13);
      const litter = 0.07 + 0.09 * dk; // more fallen leaves on the darker forest floor
      if (hc > 0.97) { // a fallen twig: a thin dark line across the cell
        const an = hash2(cx, cy, 19) * 3.14, ca = Math.cos(an), sa = Math.sin(an);
        const dx = wx - (cx + 0.5) * 4, dy = wy - (cy + 0.5) * 4, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
        if (Math.abs(u) < 1.8 && Math.abs(v) < 0.16) { r = 46; g = 36; b = 26; }
      } else if (hc < litter) {
        const px = (cx + 0.5) * 4 + (hash2(cx, cy, 14) - 0.5) * 2.4, py = (cy + 0.5) * 4 + (hash2(cx, cy, 15) - 0.5) * 2.4;
        const dx = wx - px, dy = wy - py;
        if (hc < litter * 0.5) { // leaf: a small rotated ellipse in ochre / rust
          const an = hash2(cx, cy, 16) * 3.14, ca = Math.cos(an), sa = Math.sin(an);
          const u = (dx * ca + dy * sa) / 1.1, v = (-dx * sa + dy * ca) / 0.55;
          if (u * u + v * v < 1) { const c = hash2(cx, cy, 17); r = c < 0.5 ? 128 : 104; g = c < 0.5 ? 86 : 60; b = c < 0.5 ? 36 : 32; r *= 0.85 + 0.3 * (1 - u * u); g *= 0.85 + 0.3 * (1 - u * u); }
        } else { // pebble with a shadow
          const rr = 0.5 + hash2(cx, cy, 18) * 0.6, d2 = dx * dx + dy * dy;
          if (d2 < rr * rr) { const lit = clamp01(0.55 - (dx + dy) / (rr * 2)); r = 72 + 40 * lit; g = 70 + 36 * lit; b = 62 + 30 * lit; }
          else if (d2 < (rr + 0.5) * (rr + 0.5) && dx + dy > 0) { r *= 0.7; g *= 0.7; b *= 0.7; }
        }
      }
      const f = hash2(Math.floor(sx * 1.5), Math.floor(sy * 1.5), 9);
      if (f > 0.99) { r += 26; g += 26; b += 8; }
      if (G_FLOW > 0.3 && f < 0.012 * G_FLOW) { // a few wilted flowers, muted
        const c = hash2(Math.floor(sx * 1.5), Math.floor(sy * 1.5), 10); r = c < 0.33 ? 120 : c < 0.66 ? 140 : 104; g = c < 0.33 ? 64 : c < 0.66 ? 122 : 88; b = c < 0.33 ? 72 : c < 0.66 ? 70 : 120;
      }
      ht = 0.35 + 0.35 * p + 0.25 * blade - bare * 0.2;
      break;
    }
    case DIRT: {
      const m = fbm(wx / 50, wy / 50, 13), p = vn(wx / 8, wy / 8, 14);
      r = 80 + 18 * m; g = 66 + 14 * m; b = 54 + 10 * m; // grey-brown mud, not orange
      const damp = sstep(0.6, 0.8, fbm(wx / 40, wy / 40, 19));
      const k = (0.84 + 0.26 * p + grain * 0.08) * (1 - damp * 0.25);
      r *= k; g *= k; b *= k;
      // dried cracks: thin dark lines along big Voronoi edges
      const C = 22, gx = Math.floor(wx / C), gy = Math.floor(wy / C);
      let d1 = 1e9, d2 = 1e9;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const qx = (gx + i + hash2(gx + i, gy + j, 101)) * C, qy = (gy + j + hash2(gx + i, gy + j, 102)) * C;
        const d = Math.hypot(wx - qx, wy - qy);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      if (d2 - d1 < 0.6 && vn(wx / 12, wy / 12, 103) > 0.62) { r *= 0.8; g *= 0.8; b *= 0.8; }
      // gravel and stones
      const cx = Math.floor(wx / 3.5), cy = Math.floor(wy / 3.5);
      if (hash2(cx, cy, 16) < 0.22) {
        const px = (cx + 0.2 + hash2(cx, cy, 17) * 0.6) * 3.5, py = (cy + 0.2 + hash2(cx, cy, 18) * 0.6) * 3.5;
        const dx = wx - px, dy = wy - py, d2s = dx * dx + dy * dy, rr = 0.45 + hash2(cx, cy, 19) * 0.9;
        if (d2s < rr * rr) { const lit = clamp01(0.55 - (dx + dy) / (rr * 2)); const tone = 0.8 + hash2(cx, cy, 20) * 0.4; r = (96 + 54 * lit) * tone; g = (90 + 48 * lit) * tone; b = (80 + 42 * lit) * tone; ht = 0.9; }
        else if (d2s < (rr + 0.5) * (rr + 0.5) && dx + dy > 0) { r *= 0.68; g *= 0.68; b *= 0.68; }
      }
      ht = Math.max(ht, 0.25 + 0.4 * p);
      break;
    }
    case COBBLE: {
      // worn, irregular hand-laid setts: uneven sizes, sunken and tilted stones, chips, cracks, earth in the joints
      const w1 = 3, w2 = 0.8;
      const ux = wx + (vn(wx / 9, wy / 9, 27) - 0.5) * w1 * 2 + (vn(wx / 2.6, wy / 2.6, 37) - 0.5) * w2;
      const uy = wy + (vn(wx / 9, wy / 9, 28) - 0.5) * w1 * 2 + (vn(wx / 2.6, wy / 2.6, 38) - 0.5) * w2;
      const C = 5.8;
      const gx = Math.floor(ux / C), gy = Math.floor(uy / C);
      let d1 = 1e9, d2 = 1e9, best = 0, bx = 0, by = 0, cid = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = gx + i, cy = gy + j;
        const px = (cx + 0.1 + hash2(cx, cy, 21) * 0.8) * C, py = (cy + 0.1 + hash2(cx, cy, 22) * 0.8) * C;
        const dx = ux - px, dy = uy - py, d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; best = hash2(cx, cy, 23); bx = dx; by = dy; cid = cx * 7919 + cy; } else if (d < d2) d2 = d;
      }
      const edge = d2 - d1;
      // patches where the setts are gone: packed earth and gravel show through
      const decay = clamp01((0.85 - OWN) * 1.6);
      const hole = sstep(0.72, 0.8, vn(wx / 30, wy / 30, 39) * 0.75 + hash2(cid, 5, 40) * 0.25 + decay * 0.35);
      const missing = hash2(cid, 3, 29) < 0.04 + decay * 0.45 || hole > 0.5;
      // Drawn like the bonfire: each sett a few flat tones from a stone ramp with ordered dithering, a dark outline,
      // a lit rim on the top-left, so the square reads as hand-made pixel art rather than soft shading.
      const tone = 0.7 + best * 0.42, warm = hash2(cid, 1, 24);
      const tilt = (hash2(cid, 6, 41) - 0.5) * 0.9, sink = hash2(cid, 7, 42);
      const n = d1 / (C * 0.6), lit = -(bx * (1 + tilt) + by * (1 - tilt)) / (C * 0.6);
      const st = vn(wx * 0.8, wy * 0.8, 25) * 0.6 + vn(wx * 2.2, wy * 2.2, 26) * 0.4; // stone grain and chips
      const dx0 = Math.floor(sx * 1.5), dy0 = Math.floor(sy * 1.5), dth = BAYER4[(dy0 & 3) * 4 + (dx0 & 3)];
      let lv = (tone - 0.7) * 4 + 1.2 - n * n * 1.3 + lit * n * 1.4 + (st - 0.5) * 1.4 + dth * 0.9 + (sink < 0.12 ? -0.7 : sink > 0.9 ? 0.4 : 0);
      if (hash2(cid, 8, 43) < 0.1) { // hairline cracks across some stones
        const an = hash2(cid, 9, 44) * Math.PI, cr = Math.abs(bx * Math.sin(an) - by * Math.cos(an) + (vn(wx * 1.3, wy * 1.3, 45) - 0.5) * 0.9);
        if (cr < 0.22) lv = -1;
      }
      const rp = warm < 0.22 ? COB_WARM : warm > 0.9 ? COB_COOL : COB;
      let c = lv < 0 ? COB_LINE : rp[Math.min(rp.length - 1, Math.floor(lv))];
      const jw = 0.35 + 0.5 * vn(wx / 14, wy / 14, 46);
      const mortar = missing ? 0 : edge > jw + 0.55 ? 1 : edge > jw ? 0.5 : 0;
      if (mortar === 0.5) c = lit > 0.25 && n > 0.6 ? rp[rp.length - 2] : COB_LINE; // outline, catching light on the lit side
      else if (mortar === 0) c = (grain + dth) > 0.55 ? JOINT[1] : JOINT[0];
      if (missing) { // loose gravel and earth in the gaps
        const gc = hash2(Math.floor(wx * 1.1), Math.floor(wy * 1.1), 47);
        c = gc < 0.12 ? COB[3] : gc < 0.3 ? COB[1] : (grain + dth) > 0.6 ? JOINT[2] : JOINT[1];
      }
      if (mortar < 1 && vn(wx / 24, wy / 24, 26) + dth * 0.12 > 0.68) c = MOSSG[(grain + dth) > 0.55 ? 2 : (grain + dth) > 0.2 ? 1 : 0]; // moss in the joints
      r = c[0]; g = c[1]; b = c[2];
      ht = (missing ? 0.3 : 0.55 + 0.4 * mortar) + (sink - 0.5) * 0.2;
      break;
    }
    case SAND: {
      const m = fbm(wx / 60, wy / 60, 31);
      const rip = Math.sin((wx * 0.55 + wy * 0.25) / 2.2 + vn(wx / 20, wy / 20, 32) * 6) * 0.04;
      r = 158 + 18 * m; g = 140 + 14 * m; b = 104 + 10 * m;
      const k = 0.92 + rip + grain * 0.07;
      r *= k; g *= k; b *= k;
      const cx = Math.floor(wx / 5), cy = Math.floor(wy / 5);
      if (hash2(cx, cy, 34) < 0.08) { // shell bits and pebbles
        const dx = wx - (cx + 0.5) * 5, dy = wy - (cy + 0.5) * 5;
        if (dx * dx + dy * dy < 0.5) { r = 196; g = 186; b = 166; }
      }
      ht = 0.3 + 0.2 * m;
      break;
    }
    case WATER: case BRIDGE: {
      const dd = sstep(0.2, 3.2, depth);
      r = 58 + (16 - 58) * dd; g = 86 + (38 - 86) * dd; b = 72 + (48 - 72) * dd;
      const w1 = vn(sx / 14 + now * 0.3, sy / 3.2, 41), w2 = vn(sx / 7, sy / 1.8 - now * 0.2, 42);
      const wave = w1 * 0.6 + w2 * 0.4;
      const k = 0.9 + wave * 0.16;
      r *= k; g *= k; b *= k;
      if (wave > 0.74) { const s = (wave - 0.74) * 2.4; r += 70 * s; g += 76 * s; b += 70 * s; }
      ht = 0.5;
      break;
    }
    case FIELD: case CROPS: {
      const m = fbm(wx / 80, wy / 80, 51);
      const fur = Math.sin(wy * (Math.PI * 2 / 8) + vn(wx / 30, wy / 30, 52) * 1.5);
      r = 84 + 16 * m; g = 62 + 12 * m; b = 42 + 6 * m;
      const k = 0.86 + fur * 0.16 + grain * 0.08;
      r *= k; g *= k; b *= k;
      if (fur > 0.7 && hash2(Math.floor(wx * 1.5), Math.floor(wy * 1.5), 54) < 0.12) { r = 112; g = 104; b = 58; } // straw
      ht = 0.4 + 0.15 * fur;
      break;
    }
    case FLOOR: { // worn flagstones of the old village: cracked, sunk, some lifted out with grass and earth below
      const C = 15, ox = (vn(wx / 20, wy / 20, 76) - 0.5) * 2.5, oy = (vn(wx / 20, wy / 20, 77) - 0.5) * 2.5;
      const qx = wx + ox, qy = wy + oy;
      const row = Math.floor(qy / C), shift = (row % 2) * 0.5 + hash2(row, 0, 78) * 0.3;
      const gx = Math.floor(qx / C + shift), gy = row;
      const lx = qx / C + shift - gx, ly = qy / C - gy;
      const e = Math.min(lx, 1 - lx, ly, 1 - ly) * C;
      const gone = hash2(gx, gy, 79) < 0.14 || vn(wx / 40, wy / 40, 80) > 0.7;
      if (gone) { // the slab is missing: earth, weeds and stone bits
        const m = vn(wx / 4, wy / 4, 81), gr = vn(wx / 9, wy / 9, 82);
        r = 70 + 18 * m; g = 60 + 14 * m; b = 44 + 8 * m;
        if (gr > 0.45) { const k = 0.8 + 0.4 * vn(sx / 1.1, sy / 3.2, 83); r = 62 * k; g = 80 * k; b = 40 * k; }
        if (hash2(Math.floor(wx), Math.floor(wy), 84) < 0.08) { r = 112; g = 106; b = 94; }
        { const t = BAYER4[(Math.floor(sy * 1.5) & 3) * 4 + (Math.floor(sx * 1.5) & 3)]; r = Math.round(r / 14 + t) * 14; g = Math.round(g / 14 + t) * 14; b = Math.round(b / 14 + t) * 14; }
        ht = 0.35;
        break;
      }
      const tone = 0.74 + hash2(gx, gy, 71) * 0.34, m = fbm(wx / 12, wy / 12, 72);
      // each slab sits a little tilted: light falls off across it
      const tilt = (hash2(gx, gy, 85) - 0.5) * 0.3, sl = 1 + tilt * ((lx - 0.5) + (ly - 0.5));
      const kk = tone * (0.86 + 0.26 * m) * sl;
      r = 108 * kk; g = 102 * kk; b = 90 * kk;
      if (hash2(gx, gy, 73) < 0.45) { // cracks running across the slab
        const an = hash2(gx, gy, 86) * Math.PI, d = Math.abs((lx - 0.5) * Math.sin(an) - (ly - 0.5) * Math.cos(an) + (vn(wx / 2, wy / 2, 87) - 0.5) * 0.12);
        if (d < 0.025) { r *= 0.58; g *= 0.58; b *= 0.58; }
      }
      if (hash2(gx, gy, 88) < 0.3 && lx + ly < 0.45) { r *= 0.7; g *= 0.68; b *= 0.66; } // chipped corner
      const j = sstep(0.3, 1.6, e);
      r = 48 + (r - 48) * j; g = 44 + (g - 44) * j; b = 36 + (b - 36) * j;
      if (j < 0.75 && vn(wx / 14, wy / 14, 75) > 0.42) { r = 56 + grain * 14; g = 74 + grain * 14; b = 36; } // grass in the joints
      if (vn(wx / 10, wy / 10, 89) > 0.7) { r = r * 0.6 + 50 * 0.4; g = g * 0.6 + 70 * 0.4; b = b * 0.6 + 34 * 0.4; } // moss creeping over
      { // pixel style like the bonfire: flat dithered tone steps and a dark edge on each slab
        const t = BAYER4[(Math.floor(sy * 1.5) & 3) * 4 + (Math.floor(sx * 1.5) & 3)];
        r = Math.round(r / 14 + t) * 14; g = Math.round(g / 14 + t) * 14; b = Math.round(b / 14 + t) * 14;
        if (e > 0.25 && e < 0.85) { r = 30; g = 26; b = 22; } else if (e >= 0.85 && e < 1.4 && lx + ly < 1) { r *= 1.15; g *= 1.15; b *= 1.15; }
      }
      ht = 0.5 + 0.3 * j;
      break;
    }
    case RUBBLE: {
      const m = fbm(wx / 30, wy / 30, 81);
      r = 82 + 16 * m; g = 70 + 14 * m; b = 54 + 10 * m;
      const cx = Math.floor(wx / 6), cy = Math.floor(wy / 6);
      const px = (cx + 0.5) * 6 + (hash2(cx, cy, 82) - 0.5) * 3, py = (cy + 0.5) * 6 + (hash2(cx, cy, 83) - 0.5) * 3;
      const dx = wx - px, dy = wy - py, rr = 1.2 + hash2(cx, cy, 84) * 1.6;
      if (hash2(cx, cy, 85) < 0.55 && dx * dx + dy * dy < rr * rr) { const lit = clamp01(0.6 - (dx + dy) / (rr * 2)); const t2 = 84 + 66 * lit; r = t2; g = t2 * 0.95; b = t2 * 0.86; }
      ht = 0.6;
      break;
    }
    default: { // any other ground (e.g. the war-camp FLAGS tiles): dark grass. A flat colour here drew stepped rings.
      const save = G_DARK; G_DARK = Math.max(G_DARK, 0.6);
      const h = material(GRASS, wx, wy, sx, sy, depth, now);
      G_DARK = save;
      return h;
    }
  }
  if (t !== WATER && t !== BRIDGE) {
    const k = 0.78 + 0.3 * grime; // weathering: darker, damp patches (the desert's grounds return before this)
    r *= k; g *= k; b *= k;
  }
  out3[0] = r; out3[1] = g; out3[2] = b;
  return ht;
}

/** One colour from a palette ramp at level lv (0..len-1), with ordered dithering between steps (the bonfire's pixel look). */
function ramp(p: number[][], lv: number, sx: number, sy: number) {
  const d = BAYER4[(Math.floor(sy * 1.5) & 3) * 4 + (Math.floor(sx * 1.5) & 3)];
  const c = p[Math.max(0, Math.min(p.length - 1, Math.floor(lv + 0.5 + d * 0.9)))];
  out3[0] = c[0]; out3[1] = c[1]; out3[2] = c[2];
}

/**
 * Act 3's grounds, in the desert's dithered ramp style but cold: HEATHER = grey-violet heath with pale bloom specks,
 * BOG = near-black murk with green sheen, GRASS kinds = grey-green moor grass, DIRT / SAND = peat and gravel,
 * COBBLE / FLAGS / FLOOR / RUBBLE = grey granite slabs.
 */
function moorsMaterial(t: number, wx: number, wy: number, sx: number, sy: number): number {
  const m = fbm(wx / 60, wy / 60, 501), n = vn(wx / 6, wy / 6, 502);
  switch (t) {
    case 51: { // heather
      const bloom = hash2(Math.floor(wx * 0.9), Math.floor(wy * 0.9), 503) > 0.9;
      ramp(HEATHP, 2.2 + (m - 0.5) * 2.2 + (n - 0.5) * 1.2 + (bloom ? 1.1 : 0), sx, sy);
      return 0.5;
    }
    case 52: { // bog: dark water-logged ground, a faint sheen where the puddles lie
      const sheen = vn(wx / 12, wy / 9, 504);
      ramp(BOGP, 1.6 + (m - 0.5) * 1.6 + (sheen > 0.68 ? 1.4 : 0), sx, sy);
      return 0.2;
    }
    case DIRT: case SAND: case FIELD: case CROPS: {
      ramp(PEATP, 2.4 + (m - 0.5) * 2 + (hash2(Math.floor(wx), Math.floor(wy), 505) > 0.94 ? 1.2 : 0), sx, sy);
      return 0.3;
    }
    case COBBLE: case FLAGS: case FLOOR: case RUBBLE: {
      const cx = Math.floor(wx / 8), cy = Math.floor(wy / 8), e = Math.min(wx - cx * 8, (cx + 1) * 8 - wx, wy - cy * 8, (cy + 1) * 8 - wy);
      if (e < 0.7) { ramp(GRANITE, 0.6, sx, sy); return 0.35; }
      ramp(GRANITE, 2.6 + (hash2(cx, cy, 506) - 0.5) * 1.6 + (n - 0.5), sx, sy);
      return 0.65;
    }
    default: { // the grasses: cold moor grass with paler tussocks
      ramp(MOORGRASS, 2.3 + (m - 0.5) * 2.4 + (n - 0.5) * 1.4 + (hash2(Math.floor(wx * 1.2), Math.floor(wy * 1.2), 507) > 0.93 ? 0.9 : 0), sx, sy);
      return 0.45;
    }
  }
}

/**
 * Act 4's grounds, the desert's dithered ramps but red and harsh: SAND = red sand with wind ripples, CLAY (56) = flats of
 * cracked clay (polygon cracks), GRAVEL (57) = grey-brown riverbed shingle, DIRT = packed trail earth, GRASS kinds = dry
 * tan scrub, COBBLE / FLAGS / FLOOR / RUBBLE = red sandstone slabs.
 */
function badlandsMaterial(t: number, wx: number, wy: number, sx: number, sy: number): number {
  const m = fbm(wx / 70, wy / 70, 601), n = vn(wx / 6, wy / 6, 602);
  switch (t) {
    case SAND: {
      const rip = Math.sin((wx * 0.7 - wy * 0.4) / 2.1 + vn(wx / 18, wy / 18, 603) * 6);
      ramp(REDSAND, 2.7 + (m - 0.5) * 2.4 + (rip > 0.74 ? 0.6 : rip < -0.8 ? -0.5 : 0) + (n - 0.5) * 0.6, sx, sy);
      return 0.4;
    }
    case 56: { // cracked clay: Voronoi plates, dark cracks between them
      const cs = 9, cx = Math.floor(wx / cs), cy = Math.floor(wy / cs);
      let d1 = 9, d2 = 9, id = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const px = (cx + i + 0.15 + hash2(cx + i, cy + j, 604) * 0.7) * cs, py = (cy + j + 0.15 + hash2(cx + i, cy + j, 605) * 0.7) * cs;
        const d = Math.hypot(wx - px, wy - py) / cs;
        if (d < d1) { d2 = d1; d1 = d; id = hash2(cx + i, cy + j, 606) > 0 ? (cx + i) * 131 + (cy + j) : 0; } else if (d < d2) d2 = d;
      }
      if (d2 - d1 < 0.07) { ramp(REDCLAY, 0.4, sx, sy); return 0.2; }
      ramp(REDCLAY, 2.6 + (hash2(id, 607, 608) - 0.5) * 1.6 + (m - 0.5) * 1.4, sx, sy);
      return 0.45;
    }
    case 57: { // riverbed shingle: grey-brown pebbles
      const pb = hash2(Math.floor(wx * 1.1), Math.floor(wy * 1.1), 609);
      ramp(GRAVELP, 2.2 + (m - 0.5) * 1.6 + (pb > 0.8 ? 1.3 : pb < 0.15 ? -1 : 0), sx, sy);
      return 0.3;
    }
    case DIRT: case FIELD: case CROPS: {
      ramp(REDCLAY, 3 + (m - 0.5) * 1.8 + (hash2(Math.floor(wx), Math.floor(wy), 610) > 0.94 ? 1 : 0), sx, sy);
      return 0.3;
    }
    case COBBLE: case FLAGS: case FLOOR: case RUBBLE: {
      const cx = Math.floor(wx / 8), cy = Math.floor(wy / 8), e = Math.min(wx - cx * 8, (cx + 1) * 8 - wx, wy - cy * 8, (cy + 1) * 8 - wy);
      if (e < 0.7) { ramp(REDSTONE, 0.5, sx, sy); return 0.35; }
      ramp(REDSTONE, 2.6 + (hash2(cx, cy, 611) - 0.5) * 1.6 + (n - 0.5), sx, sy);
      return 0.65;
    }
    default: { // the grasses: dry tan scrub
      ramp(SCRUBP, 2.3 + (m - 0.5) * 2.2 + (n - 0.5) * 1.4 + (hash2(Math.floor(wx * 1.2), Math.floor(wy * 1.2), 612) > 0.93 ? 0.9 : 0), sx, sy);
      return 0.45;
    }
  }
}

/**
 * Act 5's grounds, dithered ramps in damp green-brown: MOSS (60) = mossy earth with dark wet patches, DIRT = dark loam trail
 * mud, GRASS kinds = sodden grass, COBBLE / FLAGS / FLOOR / RUBBLE = loam-brown slabs and rubble, the rest (SAND, fields) = loam.
 */
function sinkholesMaterial(t: number, wx: number, wy: number, sx: number, sy: number): number {
  const m = fbm(wx / 70, wy / 70, 701), n = vn(wx / 6, wy / 6, 702), wet = vn(wx / 22, wy / 22, 703);
  switch (t) {
    case 60: { // moss: soft, patchy, with damp dark pools and pale tufts
      const tuft = hash2(Math.floor(wx * 1.2), Math.floor(wy * 1.2), 704);
      ramp(MOSSP, 2.5 + (m - 0.5) * 2.2 + (n - 0.5) * 1.2 + (wet > 0.68 ? -0.9 : 0) + (tuft > 0.93 ? 1 : tuft < 0.05 ? -0.8 : 0), sx, sy);
      return 0.5;
    }
    case DIRT: {
      ramp(LOAMP, 2.1 + (m - 0.5) * 1.8 + (wet > 0.66 ? -0.8 : 0) + (hash2(Math.floor(wx), Math.floor(wy), 705) > 0.94 ? 1 : 0), sx, sy);
      return 0.3;
    }
    case COBBLE: case FLAGS: case FLOOR: case RUBBLE: {
      const cx = Math.floor(wx / 8), cy = Math.floor(wy / 8), e = Math.min(wx - cx * 8, (cx + 1) * 8 - wx, wy - cy * 8, (cy + 1) * 8 - wy);
      if (e < 0.7) { ramp(LOAMSTONE, 0.5, sx, sy); return 0.35; }
      ramp(LOAMSTONE, 2.5 + (hash2(cx, cy, 706) - 0.5) * 1.6 + (n - 0.5), sx, sy);
      return 0.65;
    }
    case SAND: case FIELD: case CROPS: case 56: case 57: {
      ramp(LOAMP, 3 + (m - 0.5) * 1.8, sx, sy);
      return 0.3;
    }
    default: { // the grasses: sodden green-brown
      ramp(DAMPGRASS, 2.4 + (m - 0.5) * 2.2 + (n - 0.5) * 1.4 + (wet > 0.7 ? -0.7 : 0), sx, sy);
      return 0.45;
    }
  }
}

/** Act 6's grounds: crownPaint.ts paints them (marble flags, paving, dust, wild grass) with this file's ramp and noise. */
const CROWN_KIT = { ramp, fbm, vn, hash2 };
function crownMaterial(t: number, wx: number, wy: number, sx: number, sy: number): number {
  const kind = t === 64 ? "marble" : t === COBBLE || t === FLAGS || t === FLOOR || t === RUBBLE ? "paving" : t === DIRT || t === SAND || t === FIELD || t === CROPS ? "dust" : "grass";
  return paintCrownGround(kind, wx, wy, sx, sy, CROWN_KIT);
}

/**
 * Act 2's grounds (Murat 2026-11-08: all desert themed), in the same dithered pixel style as the rest:
 * SAND = dunes with wind ripples, lit on the slopes facing the top-left sun; DIRT = baked red clay with polygon cracks
 * and gravel; GRASS = the oases' dusty green; COBBLE / FLAGS / FLOOR / RUBBLE = sandstone paving, slabs and rubble.
 */
function desertMaterial(t: number, wx: number, wy: number, sx: number, sy: number): number {
  switch (t) {
    case SAND: {
      // big dunes: a height field; slopes facing the light (top-left) are bright, the lee sides in shade
      const hgt = (x: number, y: number) => vn(x / 90, y / 70, 401) * 0.7 + vn(x / 34, y / 28, 402) * 0.3;
      const e = 2, slope = (hgt(wx - e, wy - e) - hgt(wx + e, wy + e)) * 28;
      // wind ripples: fine wavy lines across the dune, bent by the dune shape
      const rip = Math.sin((wx * 0.8 + wy * 0.35) / 1.9 + vn(wx / 16, wy / 16, 403) * 7 + hgt(wx, wy) * 9);
      const m = fbm(wx / 70, wy / 70, 404);
      let lv = 3.1 + slope * 1.6 + (m - 0.5) * 1.2 + (rip > 0.72 ? 0.55 : rip < -0.8 ? -0.5 : 0);
      ramp(SANDP, lv, sx, sy);
      // a few pebbles and dry grass tufts
      const cx = Math.floor(wx / 6), cy = Math.floor(wy / 6), hc = hash2(cx, cy, 405);
      if (hc < 0.05) {
        const dx = wx - (cx + 0.3 + hash2(cx, cy, 406) * 0.4) * 6, dy = wy - (cy + 0.3 + hash2(cx, cy, 407) * 0.4) * 6;
        if (dx * dx + dy * dy < 0.45) { lv = dx + dy < 0 ? 5 : 1; ramp(CLAYP, lv, sx, sy); }
      }
      return 0.35 + 0.2 * m + slope * 0.1;
    }
    case DIRT: { // baked clay: flat, reddish, cracked into plates, gravel strewn
      const m = fbm(wx / 40, wy / 40, 411), p = vn(wx / 7, wy / 7, 412);
      let lv = 2.6 + (m - 0.5) * 1.6 + (p - 0.5) * 0.8;
      const C = 15, gx = Math.floor(wx / C), gy = Math.floor(wy / C);
      let d1 = 1e9, d2 = 1e9;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const qx = (gx + i + hash2(gx + i, gy + j, 413)) * C, qy = (gy + j + hash2(gx + i, gy + j, 414)) * C;
        const d = Math.hypot(wx - qx, wy - qy);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      const edge = d2 - d1;
      if (edge < 0.4 && vn(wx / 10, wy / 10, 418) > 0.45) lv = 1.2; else if (edge < 1) lv -= 0.4; // fine cracks, here and there
      // drifts of sand blown over the clay
      const drift = sstep(0.5, 0.7, vn(wx / 26, wy / 26, 415) * 0.8 + vn(wx / 5, wy / 5, 419) * 0.2);
      if (drift > 0.5) { ramp(SANDP, 3 + (p - 0.5), sx, sy); return 0.4; }
      ramp(CLAYP, lv, sx, sy);
      const cx = Math.floor(wx / 4), cy = Math.floor(wy / 4); // gravel
      if (hash2(cx, cy, 416) < 0.12) {
        const dx = wx - (cx + 0.5) * 4, dy = wy - (cy + 0.5) * 4, rr = 0.5 + hash2(cx, cy, 417) * 0.6;
        if (dx * dx + dy * dy < rr * rr) ramp(SSTONE, dx + dy < 0 ? 4.5 : 2.2, sx, sy);
      }
      return 0.3 + 0.3 * p;
    }
    case GRASS: case GRASS_DARK: case TALL: case FLOWERS: { // the oasis: a dusty olive green, tufts, a little sand through it
      const m = fbm(wx / 50, wy / 50, 421), blade = vn(sx / 1.1, sy / 4.2, 422) * 0.6 + vn(sx / 0.7, sy / 2.4, 423) * 0.4;
      const bare = sstep(0.62, 0.8, vn(wx / 18, wy / 18, 424));
      if (bare > 0.5) { ramp(SANDP, 2.6 + blade, sx, sy); return 0.3; }
      const lv = 1.4 + m * 1.6 + (blade - 0.5) * 2.2;
      const G = [[30, 40, 22], [44, 58, 28], [62, 76, 34], [86, 96, 44], [112, 116, 58]];
      ramp(G, lv, sx, sy);
      return 0.45 + 0.3 * blade;
    }
    case COBBLE: case FLAGS: case FLOOR: { // sandstone slabs in courses, worn and sand-filled
      const C = t === COBBLE ? 7 : 12, ox = (vn(wx / 20, wy / 20, 431) - 0.5) * 2, oy = (vn(wx / 20, wy / 20, 432) - 0.5) * 2;
      const qx = wx + ox, qy = wy + oy;
      const row = Math.floor(qy / C), shift = (row % 2) * 0.5 + hash2(row, 0, 433) * 0.3;
      const gx = Math.floor(qx / C + shift), lx = qx / C + shift - gx, ly = qy / C - row;
      const e = Math.min(lx, 1 - lx, ly, 1 - ly) * C;
      const gone = hash2(gx, row, 434) < 0.08 || vn(wx / 36, wy / 36, 435) > 0.74;
      if (gone) { ramp(SANDP, 2.8 + (vn(wx / 3, wy / 3, 436) - 0.5), sx, sy); return 0.3; }
      const tone = hash2(gx, row, 437), m = fbm(wx / 10, wy / 10, 438);
      let lv = 2.2 + tone * 1.6 + (m - 0.5) * 1.2 + ((0.5 - lx) + (0.5 - ly)) * 0.8;
      if (hash2(gx, row, 439) < 0.35) { // a crack across the slab
        const an = hash2(gx, row, 440) * Math.PI, d = Math.abs((lx - 0.5) * Math.sin(an) - (ly - 0.5) * Math.cos(an));
        if (d < 0.03) lv = 0.3;
      }
      if (e < 0.5) { ramp(SANDP, 1.2, sx, sy); return 0.35; } // sand in the joints
      if (e < 1.1) lv = lx + ly < 1 ? lv + 0.8 : 0.6; // lit and shaded rims
      ramp(SSTONE, lv, sx, sy);
      return 0.55;
    }
    case RUBBLE: {
      const cx = Math.floor(wx / 5), cy = Math.floor(wy / 5);
      const px = (cx + 0.5) * 5 + (hash2(cx, cy, 441) - 0.5) * 2.5, py = (cy + 0.5) * 5 + (hash2(cx, cy, 442) - 0.5) * 2.5;
      const dx = wx - px, dy = wy - py, rr = 1 + hash2(cx, cy, 443) * 1.4;
      if (hash2(cx, cy, 444) < 0.6 && dx * dx + dy * dy < rr * rr) { ramp(SSTONE, 2.6 - (dx + dy) / rr * 1.4, sx, sy); return 0.65; }
      ramp(SANDP, 2.4 + (vn(wx / 4, wy / 4, 445) - 0.5), sx, sy);
      return 0.4;
    }
    default: ramp(SANDP, 3, sx, sy); return 0.4;
  }
}

/**
 * Paints the screen rectangle [sx0, sx0 + cw) x [sy0, sy0 + ch) at `res` pixels per screen px into RGBA `px`.
 */
/**
 * The ground of an elemental land over the normal ground colour (k = how deep inside, 0..1, wavy at the edges).
 * Poison: sickly yellow-green bog with oily sheen on the pools. Cold: hoar-frost on the grass, the tarn iced over
 * with cracks. Fire: ash and char with glowing ember cracks. Shock: slate-grey scoured earth with glassy blue scorch lines.
 */
function landTint(el: string, k: number, r: number, g: number, b: number, wx: number, wy: number, sx: number, sy: number, wet: boolean): [number, number, number] {
  const lum = (r * 0.3 + g * 0.55 + b * 0.15) / 255, dth = BAYER4[(Math.floor(sy * 1.5) & 3) * 4 + (Math.floor(sx * 1.5) & 3)];
  let tr = r, tg = g, tb = b;
  if (el === "poison") {
    if (wet) { const s = vn(sx / 6, sy / 2.5, 301); tr = 46 + 30 * s; tg = 70 + 40 * s; tb = 22 + 12 * s; if (s > 0.78) { tr = 150; tg = 118; tb = 170; } } // oily violet sheen
    else { tr = 40 + 120 * lum; tg = 46 + 118 * lum; tb = 14 + 34 * lum; if (vn(wx / 9, wy / 9, 302) > 0.74) { tr *= 0.7; tg *= 0.62; tb *= 0.7; } }
  } else if (el === "cold") {
    if (wet) { // ice: pale blue-grey, cracks along Voronoi-ish lines, a little shine
      const c = Math.abs(vn(wx / 7, wy / 7, 311) - vn(wx / 7 + 3.1, wy / 7, 312));
      tr = 120 + 40 * lum; tg = 150 + 40 * lum; tb = 170 + 30 * lum;
      if (c < 0.035) { tr *= 0.72; tg *= 0.78; tb *= 0.85; } else if (vn(sx / 10, sy / 3, 313) > 0.75) { tr += 40; tg += 40; tb += 34; }
    } else {
      const rime = vn(wx / 14, wy / 14, 314) * 0.6 + vn(wx / 3, wy / 3, 315) * 0.4 + dth * 0.2;
      tr = 60 + 110 * lum; tg = 72 + 112 * lum; tb = 84 + 120 * lum;
      if (rime > 0.55) { tr = 178 + 30 * lum; tg = 196 + 30 * lum; tb = 212 + 30 * lum; } // white frost patches
    }
  } else if (el === "fire") {
    tr = 38 + 70 * lum; tg = 32 + 56 * lum; tb = 28 + 44 * lum; // ash and char
    if (vn(wx / 20, wy / 20, 321) > 0.6) { tr *= 0.6; tg *= 0.55; tb *= 0.55; } // burned black patches
    const C = 26, gx = Math.floor(wx / C), gy = Math.floor(wy / C); // ember cracks: glowing lines on big cells
    let d1 = 1e9, d2 = 1e9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const qx = (gx + i + hash2(gx + i, gy + j, 322)) * C, qy = (gy + j + hash2(gx + i, gy + j, 323)) * C;
      const d = Math.hypot(wx - qx, wy - qy);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    const e = d2 - d1;
    if (e < 0.9 && vn(wx / 10, wy / 10, 324) > 0.5) { const hot = vn(wx / 4, wy / 4, 325); tr = 200 + 55 * hot; tg = 70 + 80 * hot; tb = 20 + 20 * hot; }
    else if (e < 2) { tr *= 0.7; tg *= 0.62; tb *= 0.6; }
  } else if (el === "shock") {
    tr = 52 + 80 * lum; tg = 56 + 82 * lum; tb = 70 + 96 * lum; // slate, scoured
    const fl = Math.abs(vn(wx / 16, wy / 16, 331) - 0.5) * 2; // lightning scars: thin glassy streaks
    if (fl < 0.035 && vn(wx / 30, wy / 30, 332) > 0.55) { tr = 150; tg = 170; tb = 255; }
    else if (fl < 0.08 && vn(wx / 30, wy / 30, 332) > 0.55) { tr *= 0.6; tg *= 0.6; tb *= 0.7; }
  }
  return [r + (tr - r) * k, g + (tg - g) * k, b + (tb - b) * k];
}

// ---------- Act 2's rim: 3D dunes (Murat 2026-11-19: "make the borders nice 3d dunes turned to isometric") ----------

/** Dune depth cap in tiles (the dunes are as big as they get this far in). */
const DUNE_CAP = 12;
/** Tallest dune, in world px (a cliff's top step is 106). */
const DUNE_MAX = 76;
/** Height grid spacing in world px. */
const DUNE_S = 4;
/** The sun, from the upper left like the cliffs' lit faces (normalised). */
const SUN = (() => { const v = [-0.62, -0.28, 0.73], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();
const SUN_XY = Math.hypot(SUN[0], SUN[1]);
/** Dune sand: a longer, warmer ramp than SANDP, from the slip faces' shade to the crests' glare. */
const DUNEP = pal(["#5e3e22", "#7a5230", "#96683c", "#b2804a", "#c99a5c", "#ddb070", "#ebc688", "#f4daa4"]);

/**
 * The dunes' height (world px) at a world point: zero on open ground, rising over the first few tiles of the rim, then
 * long transverse dunes, gentle windward backs facing west into the sun and short steep slip faces to the east, their
 * crest lines bent by noise and swelling into big mounds and hollows.
 */
function duneHeight(dd: number, wx: number, wy: number): number {
  if (dd <= 0.25) return 0;
  const r0 = sstep(0.3, 4.2, dd + (vn(wx / 26, wy / 26, 470) - 0.5) * 1.1);
  if (r0 <= 0) return 0;
  const rise = r0 * (0.35 + 0.65 * r0); // a long low apron first, so the trails and passes stay in sight
  const big = fbm(wx / 300, wy / 300, 471);
  const p = (wx * 0.93 + wy * 0.36) / 300 + fbm(wx / 260, wy / 260, 472) * 2.2 + vn(wx / 90, wy / 90, 473) * 0.35;
  const fr = p - Math.floor(p);
  const prof = fr < 0.72 ? Math.pow(fr / 0.72, 1.7) : Math.pow((1 - fr) / 0.28, 0.75);
  const amp = 0.6 + 0.4 * sstep(4, 10, dd);
  // a second, smaller set of dunes riding on the big ones, crossing them at an angle
  const q = (wx * 0.8 - wy * 0.6) / 120 + fbm(wx / 110, wy / 110, 474) * 1.6, fq = q - Math.floor(q);
  const prof2 = fq < 0.75 ? Math.pow(fq / 0.75, 1.8) : Math.pow((1 - fq) / 0.25, 0.8);
  const hgt = rise * (6 + amp * (14 * big + 44 * prof * (0.5 + 0.5 * big) + 13 * prof2 * (1 - 0.5 * prof)));
  return hgt < 52 ? hgt : Math.min(DUNE_MAX, 52 + (hgt - 52) * 0.5); // the tallest crests squeezed, never cut flat
}

/** The dunes' heights over one chunk's world box, on a DUNE_S grid; `near` says how far (in cells) the next dune cell is down-right along the view diagonal. */
interface DuneGrid { x0: number; y0: number; nx: number; ny: number; h: Float32Array; near: Uint8Array }

function duneGrid(g: GroundData, f: Fields, bx0: number, bx1: number, by0: number, by1: number): DuneGrid | undefined {
  if (!f.dune || !g.desert) return undefined;
  const { w, tile } = g, d0 = g.desert.y0, d1 = g.desert.y1;
  if (by1 < d0 || by0 > d1) return undefined;
  const tx0 = Math.max(0, Math.floor(bx0)), tx1 = Math.min(w - 1, Math.ceil(bx1)), ty0 = Math.max(d0, Math.floor(by0)), ty1 = Math.min(d1 - 1, Math.ceil(by1));
  let any = false;
  for (let y = ty0; y <= ty1 && !any; y++) for (let x = tx0; x <= tx1; x++) if (f.dune[y * w + x] > 0) { any = true; break; }
  if (!any) return undefined;
  const x0 = Math.floor(bx0 * tile / DUNE_S), y0 = Math.floor(by0 * tile / DUNE_S);
  const nx = Math.ceil(bx1 * tile / DUNE_S) - x0 + 2, ny = Math.ceil(by1 * tile / DUNE_S) - y0 + 2;
  const h = new Float32Array(nx * ny);
  const dd = (fx: number, fy: number) => { // dune depth, bilinear; rows held inside the band so the dunes run on to its edge
    fy = Math.max(d0, Math.min(d1 - 1, fy));
    const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
    const q = (x: number, y: number) => f.dune![Math.max(d0, Math.min(d1 - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
    return (q(ix, iy) * (1 - ax) + q(ix + 1, iy) * ax) * (1 - ay) + (q(ix, iy + 1) * (1 - ax) + q(ix + 1, iy + 1) * ax) * ay;
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const wx = (x0 + i) * DUNE_S, wy = (y0 + j) * DUNE_S, ty = wy / tile;
    if (ty < d0 - 1 || ty > d1 + 1) continue;
    h[j * nx + i] = duneHeight(dd(wx / tile - 0.5, wy / tile - 0.5), wx, wy);
  }
  // near: cells to the next dune cell along +x+y (the way a view ray runs back to the ground), capped
  const near = new Uint8Array(nx * ny).fill(255);
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i;
    if (h[k] > 0) near[k] = 0;
    else if (i + 1 < nx && j + 1 < ny) near[k] = Math.min(255, near[(j + 1) * nx + i + 1] + 1);
  }
  return { x0, y0, nx, ny, h, near };
}

/** Bilinear dune height at a world point (0 off the grid). */
function duneAt(G: DuneGrid, wx: number, wy: number): number {
  const fx = wx / DUNE_S - G.x0, fy = wy / DUNE_S - G.y0;
  const i = Math.floor(fx), j = Math.floor(fy);
  if (i < 0 || j < 0 || i >= G.nx - 1 || j >= G.ny - 1) return 0;
  const ax = fx - i, ay = fy - j, k = j * G.nx + i, h = G.h;
  return (h[k] * (1 - ax) + h[k + 1] * ax) * (1 - ay) + (h[k + G.nx] * (1 - ax) + h[k + G.nx + 1] * ax) * ay;
}

/**
 * Where the view ray through a ground point first meets the dunes: the screen pixel that shows ground point (wx, wy)
 * at height 0 shows (wx + z, wy + z) at height z, so walk z down from the top and take the highest z the dunes reach.
 * Returns that z (0 = the flat ground itself).
 */
function duneHit(G: DuneGrid, wx: number, wy: number): number {
  const fx = Math.floor(wx / DUNE_S - G.x0), fy = Math.floor(wy / DUNE_S - G.y0);
  if (fx >= 0 && fy >= 0 && fx < G.nx && fy < G.ny && G.near[fy * G.nx + fx] > DUNE_MAX / DUNE_S + 2) return 0;
  for (let z = DUNE_MAX; z > 0; z -= 2) {
    if (duneAt(G, wx + z, wy + z) >= z) {
      let lo = z, hi = z + 2; // refine: lo is under the surface, hi above it
      for (let k = 0; k < 4; k++) { const m = (lo + hi) / 2; if (duneAt(G, wx + m, wy + m) >= m) lo = m; else hi = m; }
      return lo;
    }
  }
  return 0;
}

/**
 * The colour of the dune surface at a world point at height z (into out3): lit by the sun from its slope, shadowed where a
 * crest stands between it and the sun, with wind ripples on the backs, a bright lip along the crests and a dark slip face.
 */
function duneColour(G: DuneGrid, wx: number, wy: number, z: number, sx: number, sy: number) {
  const e = 2;
  const gx = (duneAt(G, wx + e, wy) - duneAt(G, wx - e, wy)) / (2 * e), gy = (duneAt(G, wx, wy + e) - duneAt(G, wx, wy - e)) / (2 * e);
  const nl = Math.hypot(gx, gy, 1);
  const lam = (-gx * SUN[0] - gy * SUN[1] + SUN[2]) / nl;
  // cast shadow: walk toward the sun; a dune above the sun line hides it
  let shade = 0;
  for (let t = 5; t <= 70; t += 5) {
    const hz = z + t * SUN[2] / SUN_XY;
    if (hz > DUNE_MAX) break;
    if (duneAt(G, wx - SUN[0] / SUN_XY * t, wy - SUN[1] / SUN_XY * t) > hz + 0.5) { shade = 1; break; }
  }
  const steep = Math.hypot(gx, gy);
  // wind ripples: fine bent lines across the gentle backs, gone on the steep slip faces
  const rip = Math.sin((wx * 0.93 + wy * 0.36) / 2.2 + vn(wx / 30, wy / 30, 475) * 4 + z * 0.08);
  const ripK = (1 - sstep(0.25, 0.6, steep)) * (shade ? 0.5 : 1);
  // the crest lip: where the slope flips from the lit back to the slip face
  const ahead = duneAt(G, wx + 3 * 0.93, wy + 3 * 0.36), behind = duneAt(G, wx - 3 * 0.93, wy - 3 * 0.36), here = duneAt(G, wx, wy);
  const crest = here > ahead + 1.2 && here >= behind - 0.2 ? 1 : 0;
  const m = vn(wx / 40, wy / 40, 476) + (hash2(Math.floor(wx * 1.5), Math.floor(wy * 1.5), 477) - 0.5) * 0.5; // broad tone + sand grain
  let lv = -0.9 + Math.max(0, lam) * 8.4 + (m - 0.5) * 0.4 + (rip > 0.9 ? 0.5 : rip < -0.93 ? -0.45 : 0) * ripK;
  if (shade) lv = Math.min(lv, 1.2 + lam * 1.4);
  if (crest && !shade) lv += 1.1;
  lv -= (1 - sstep(4, 26, z)) * 0.4; // the hollows between dunes a touch duskier
  ramp(DUNEP, lv, sx, sy);
}

export function paintChunk(g: GroundData, f: Fields, sx0: number, sy0: number, cw: number, ch: number, res: number, px: Uint8ClampedArray) {
  const { w, h, tile, ground } = g;
  // lands that touch this chunk (world box of the iso rectangle, in tiles, with a margin)
  const wxs = [sy0 + sx0 / 2, sy0 + (sx0 + cw) / 2, sy0 + ch + sx0 / 2, sy0 + ch + (sx0 + cw) / 2], wys = [sy0 - sx0 / 2, sy0 - (sx0 + cw) / 2, sy0 + ch - sx0 / 2, sy0 + ch - (sx0 + cw) / 2];
  const bx0 = Math.min(...wxs) / tile - 3, bx1 = Math.max(...wxs) / tile + 3, by0 = Math.min(...wys) / tile - 3, by1 = Math.max(...wys) / tile + 3;
  const lands = (g.lands ?? []).filter((l) => l.x < bx1 && l.x + l.w > bx0 && l.y < by1 && l.y + l.h > by0);
  const reach = DUNE_MAX / tile + 1; // a view ray can meet a dune this far down-right of its ground point
  const dunes = duneGrid(g, f, bx0, bx1 + reach, by0, by1 + reach);
  const W = Math.round(cw * res), H = Math.round(ch * res);
  const wt = new Float32Array(NT);
  const gw = new Float32Array(NT); // weights of the grass kinds (they all paint as GRASS)
  const types: number[] = [];
  const at = (x: number, y: number) => ground[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)];
  const field = (arr: Float32Array, fx: number, fy: number) => {
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const g = (x: number, y: number) => arr[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)];
    return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
  };
  const c1 = new Float32Array(3), c2 = new Float32Array(3);
  const add = (t: number, k: number) => {
    if (k <= 0) return;
    t %= g.tileCount ?? 68; // display grids carry art-row variants (shared/map.ts TILE_COUNT = 68; not imported: map.ts builds the world on load; tests/badlandsClient.test.ts keeps the literal in step)
    if (t === BRIDGE) t = WATER;
    if (t === GRASS_DARK || t === TALL || t === FLOWERS || t === GRASS) { gw[t] += k; t = GRASS; } // one grass, see G_DARK
    if (wt[t] === 0) types.push(t);
    wt[t] += k;
  };
  for (let j = 0; j < H; j++) {
    const sy = sy0 + (j + 0.5) / res;
    for (let i = 0; i < W; i++) {
      const sx = sx0 + (i + 0.5) / res;
      let wx = sy + sx / 2, wy = sy - sx / 2;
      // the desert's dunes stand up: this pixel shows the dune surface the view ray meets first, so paint the ground there
      const dz = dunes ? duneHit(dunes, wx, wy) : 0;
      if (dz > 0) { wx += dz; wy += dz; }
      MOORS = !!g.moors && wy / tile >= g.moors.y0 - 2 && wy / tile < g.moors.y1;
      BADLANDS = !!g.badlands && wy / tile >= g.badlands.y0 - 2 && wy / tile < g.badlands.y1;
      SINKHOLES = !!g.sinkholes && wy / tile >= g.sinkholes.y0 - 2 && wy / tile < g.sinkholes.y1;
      CROWN = !!g.crown && wy / tile >= g.crown.y0 - 2 && wy / tile < g.crown.y1;
      CITY = !!g.cities && wy / tile >= g.cities.y0 - 2;
      DESERT = !!g.desert && wy / tile >= g.desert.y0 - 2 && wy / tile < g.desert.y1;
      if (CITY) { // a capital's ground is its homeland's (Duskveil the desert's, Marrowkeep the moors', ...); Hearthhold Oakvale's
        const c = g.cities!, act = c.acts[Math.max(0, Math.min(c.acts.length - 1, Math.floor((wx / tile - c.x0 + 2) / c.stride)))];
        DESERT = act === 2; MOORS = act === 3; BADLANDS = act === 4; SINKHOLES = act === 5; CROWN = false;
      }
      // wavy borders: warp the lookup point
      const u = wx + (vn(wx / 45, wy / 45, 3) - 0.5) * 18 + (vn(wx / 15, wy / 15, 1) - 0.5) * 10 + (vn(wx / 4, wy / 4, 4) - 0.5) * 4;
      const v = wy + (vn(wx / 45, wy / 45, 5) - 0.5) * 18 + (vn(wx / 15, wy / 15, 2) - 0.5) * 10 + (vn(wx / 4, wy / 4, 6) - 0.5) * 4;
      // wide tent kernel over the tiles around: a broad zone where neighbouring grounds mix
      const fx = u / tile - 0.5, fy = v / tile - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      types.length = 0;
      let tot = 0;
      for (let b2 = -1; b2 <= 2; b2++) {
        const ky = 1 - Math.abs(fy - (y0 + b2)) / KR;
        if (ky <= 0) continue;
        for (let a2 = -1; a2 <= 2; a2++) {
          const kx = 1 - Math.abs(fx - (x0 + a2)) / KR;
          if (kx <= 0) continue;
          add(at(x0 + a2, y0 + b2), kx * ky); tot += kx * ky;
        }
      }
      for (const t of types) wt[t] /= tot;
      { const gs = gw[GRASS] + gw[GRASS_DARK] + gw[TALL] + gw[FLOWERS];
        G_DARK = gs ? gw[GRASS_DARK] / gs : 0; G_TALL = gs ? gw[TALL] / gs : 0; G_FLOW = gs ? gw[FLOWERS] / gs : 0;
        gw[GRASS] = gw[GRASS_DARK] = gw[TALL] = gw[FLOWERS] = 0; }
      const depth = field(f.depth, wx / tile - 0.5, wy / tile - 0.5);
      let s1 = -9, s2 = -9, t1 = types[0], t2 = -1;
      let ar = 0, ag = 0, ab = 0, al = 0; // weighted mean colour of the land grounds here (dust, sand and earth carry over)
      for (const t of types) {
        OWN = wt[t];
        const ht = material(t, wx, wy, sx, sy, depth, 0);
        // patches: each ground spills into its neighbour as islands and specks, bigger blobs then fine scatter
        const wet = t === WATER;
        const patch = vn(wx / 16, wy / 16, 70 + t) * 0.55 + vn(wx / 5, wy / 5, 80 + t) * 0.3 + hash2(Math.floor(wx / 1.5), Math.floor(wy / 1.5), 60 + t) * 0.15;
        const s = wt[t] + (wet ? 0.3 : 1.15) * (patch - 0.5) + (wet ? 0.2 : 0.4) * (ht - 0.5);
        if (s > s1) { s2 = s1; t2 = t1; s1 = s; t1 = t; c2.set(c1); c1.set(out3); }
        else if (s > s2) { s2 = s; t2 = t; c2.set(out3); }
        if (!wet) { ar += out3[0] * wt[t]; ag += out3[1] * wt[t]; ab += out3[2] * wt[t]; al += wt[t]; }
      }
      let r = c1[0], gg = c1[1], b = c1[2];
      if (t1 !== WATER && al > 0 && wt[t1] < 0.98) {
        const k = 0.45 * (1 - wt[t1]);
        c1[0] += (ar / al - c1[0]) * k; c1[1] += (ag / al - c1[1]) * k; c1[2] += (ab / al - c1[2]) * k;
        r = c1[0]; gg = c1[1]; b = c1[2];
      }
      if (t2 >= 0 && t2 !== t1) {
        const soft = t1 <= FLOWERS && t2 <= FLOWERS; // grass into grass: a wide, soft blend, no earth band
        const a = clamp01(0.5 + (s1 - s2) / (soft ? 0.5 : 0.09));
        r = c1[0] * a + c2[0] * (1 - a); gg = c1[1] * a + c2[1] * (1 - a); b = c1[2] * a + c2[2] * (1 - a);
        // worn earth and scattered gravel along borders between land materials
        if (!soft && t1 !== WATER && t2 !== WATER && t1 !== DIRT) {
          const band = clamp01(1 - (s1 - s2) / 0.18) * (0.55 + 0.45 * vn(wx / 6, wy / 6, 64));
          if (band > 0.15) {
            material(DIRT, wx, wy, sx, sy, 0, 0);
            const e = band * 0.75;
            r += (out3[0] * 0.92 - r) * e; gg += (out3[1] * 0.92 - gg) * e; b += (out3[2] * 0.92 - b) * e;
          }
        }
        // foam where water meets land, wet darker ground just above it
        if ((t1 === WATER) !== (t2 === WATER)) {
          const foam = 1 - Math.abs(a - 0.5) * 2;
          const fo = foam * foam * (0.55 + 0.45 * vn(sx / 3, sy / 1.5, 61));
          r += (190 - r) * fo * 0.7; gg += (196 - gg) * fo * 0.7; b += (184 - b) * fo * 0.7;
        }
      }
      if (t1 !== WATER) {
        const wet = (wt[WATER] || 0);
        if (wet > 0) { const k = 1 - 0.3 * Math.min(1, wet * 2); r *= k; gg *= k; b *= k * 1.02; }
        // contact shadow around walls, rocks and posts
        const ao = field(f.ao, wx / tile - 0.5, wy / tile - 0.5);
        if (ao > 0) { const k = 1 - 0.45 * ao; r *= k; gg *= k; b *= k; }
      }
      if (CITY) { // a capital: its homeland's grounds in the clan's stone tint; the rock round the plots is bare black
        const c = g.cities!, pl = Math.max(0, Math.min(c.tints.length - 1, Math.floor((wx / tile - c.x0 + 2) / c.stride))), tn = c.tints[pl];
        if (tn) { r *= tn[0]; gg *= tn[1]; b *= tn[2]; }
        const rk = field(f.rock!, wx / tile - 0.5, wy / tile - 0.5) + (vn(wx / 6, wy / 6, 352) - 0.5) * 0.3, k = sstep(0.3, 0.62, rk);
        r += (VOID[0] - r) * k; gg += (VOID[1] - gg) * k; b += (VOID[2] - b) * k;
      } else if (g.cave && wy / tile >= g.cave.y0 - 8 && !DESERT && !MOORS && !BADLANDS && !SINKHOLES && !CROWN) {
        const ty = wy / tile, cv = g.cave;
        const deep = !!cv.deep && ty >= cv.deep[0] - 0.5 && ty < cv.deep[1] + 0.5;
        if (cv.end !== undefined && ty >= cv.end && !deep) { r = VOID[0]; gg = VOID[1]; b = VOID[2]; } // the rock between the Mawdeep and the desert
        else if (ty < cv.rock && !deep) { // the open sea runs out into the dark
          const k = sstep(cv.y0 - 8, cv.rock, ty + (vn(wx / 30, wy / 30, 350) - 0.5) * 3);
          r += (VOID[0] - r) * k; gg += (VOID[1] - gg) * k; b += (VOID[2] - b) * k;
        } else {
          // dank cave earth: cold, dim, damp; the tunnels' floors are what the wall blocks stand round
          const lum = r * 0.3 + gg * 0.55 + b * 0.15, damp = vn(wx / 18, wy / 18, 351);
          r = (lum * 0.92 + r * 0.08) * 0.64 * (0.9 + 0.2 * damp); gg = (lum * 0.92 + gg * 0.08) * 0.58 * (0.9 + 0.2 * damp); b = (lum * 0.92 + b * 0.08) * 0.56 * (0.92 + 0.2 * damp);
          if (damp > 0.72) { r *= 0.8; gg *= 0.86; b *= 0.9; } // seeping wet patches
          const rk = field(f.rock!, wx / tile - 0.5, wy / tile - 0.5) + (vn(wx / 6, wy / 6, 352) - 0.5) * 0.3;
          const k = sstep(0.3, 0.62, rk);
          r += (VOID[0] - r) * k; gg += (VOID[1] - gg) * k; b += (VOID[2] - b) * k;
        }
      }
      if (DESERT && f.cliff) { // the mountains' rock top, up on the plateau
        const ck = field(f.cliff, wx / tile - 0.5, wy / tile - 0.5) + (vn(wx / 5, wy / 5, 460) - 0.5) * 0.35;
        if (ck > 0.55) {
          const pit = hash2(Math.floor(wx * 1.3), Math.floor(wy * 1.3), 462);
          r = 0xb8; gg = 0x86; b = 0x4e; // desertArt.ts TOP: the cliffs' sunlit top
          if (pit < 0.08) { r = 0xcf; gg = 0x9e; b = 0x62; } else if (pit > 0.93) { r = 0x9a; gg = 0x6a; b = 0x40; }
        }
      }
      if (MOORS && f.cliff) { // the crags' top: weathered grey granite
        const ck = field(f.cliff, wx / tile - 0.5, wy / tile - 0.5) + (vn(wx / 5, wy / 5, 560) - 0.5) * 0.35;
        if (ck > 0.55) {
          const pit = hash2(Math.floor(wx * 1.3), Math.floor(wy * 1.3), 562);
          r = 0x8a; gg = 0x8e; b = 0x94; // cool grey top (tileset.ts / moors cliff art: keep in step)
          if (pit < 0.08) { r = 0xa6; gg = 0xaa; b = 0xb0; } else if (pit > 0.93) { r = 0x6e; gg = 0x72; b = 0x78; }
        }
      }
      if (BADLANDS && f.cliff) { // the mesas' top: sun-baked red rock
        const ck = field(f.cliff, wx / tile - 0.5, wy / tile - 0.5) + (vn(wx / 5, wy / 5, 660) - 0.5) * 0.35;
        if (ck > 0.55) {
          const pit = hash2(Math.floor(wx * 1.3), Math.floor(wy * 1.3), 662);
          r = 0xa8; gg = 0x58; b = 0x3a; // red mesa top
          if (pit < 0.08) { r = 0xc4; gg = 0x72; b = 0x4c; } else if (pit > 0.93) { r = 0x86; gg = 0x44; b = 0x2e; }
        }
      }
      if (SINKHOLES && f.cliff) { // the loam cliffs' top: packed brown earth
        const ck = field(f.cliff, wx / tile - 0.5, wy / tile - 0.5) + (vn(wx / 5, wy / 5, 760) - 0.5) * 0.35;
        if (ck > 0.55) {
          const pit = hash2(Math.floor(wx * 1.3), Math.floor(wy * 1.3), 762);
          r = 0x6a; gg = 0x52; b = 0x36; // loam top (sinkholesArt.ts: keep in step)
          if (pit < 0.08) { r = 0x80; gg = 0x66; b = 0x44; } else if (pit > 0.93) { r = 0x52; gg = 0x3e; b = 0x28; }
        }
      }
      if (CROWN && f.cliff) { // the granite cliffs' top: pale weathered rock
        const ck = field(f.cliff, wx / tile - 0.5, wy / tile - 0.5) + (vn(wx / 5, wy / 5, 860) - 0.5) * 0.35;
        if (ck > 0.55) {
          [r, gg, b] = crownCliffTopPixel(wx, wy); // pale granite top (crownPaint.ts)
        }
      }
      if (lands.length) {
        const tx = wx / tile, ty = wy / tile;
        for (const l of lands) {
          const d = Math.min(tx - l.x, l.x + l.w - tx, ty - l.y, l.y + l.h - ty) + (vn(wx / 40, wy / 40, 340) - 0.5) * 5 + (vn(wx / 9, wy / 9, 341) - 0.5) * 1.5;
          if (d <= 0) continue;
          [r, gg, b] = landTint(l.el, Math.min(1, d / 3.5) * 0.9, r, gg, b, wx, wy, sx, sy, t1 === WATER);
        }
      }
      if (dz > 0) { // up on a dune: its own lit sand, blending into the ground at its foot
        duneColour(dunes!, wx, wy, dz, sx, sy);
        const a = sstep(0, 7, dz);
        r += (out3[0] - r) * a; gg += (out3[1] - gg) * a; b += (out3[2] - b) * a;
      }
      for (const t of types) wt[t] = 0;
      const o = (j * W + i) * 4;
      px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = 255;
    }
  }
}
