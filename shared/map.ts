import { MAP_H, MAP_W, PLAYER_RADIUS, TILE, type MobKind } from "./constants";

/**
 * Oakvale and its surroundings — the starting region (160×120 tiles).
 *
 * The world is two tile layers that share one tileset:
 *  - ground:  always filled (grass, roads, water…)
 *  - objects: EMPTY or something standing on the ground (trees, walls, roofs, props). Objects are solid except bushes.
 * The map is generated deterministically, so the server and every client build the exact same world.
 */
export const T = {
  // ground
  GRASS: 0, GRASS_DARK: 1, TALL_GRASS: 2, FLOWERS: 3, DIRT: 4, COBBLE: 5, SAND: 6, WATER: 7, BRIDGE: 8,
  FIELD: 9, CROPS: 10,
  // objects
  TREE: 11, PINE: 12, BUSH: 13, ROCK: 14, PALISADE: 15, FENCE: 16, ROOF_THATCH: 17, ROOF_RED: 18,
  ROOF_SLATE: 19, WALL_TIMBER: 20, WALL_STONE: 21, WINDOW_TIMBER: 22, WINDOW_STONE: 23, DOOR: 24, WELL: 25,
  STALL_RED: 26, STALL_BLUE: 27, BARREL: 28, CRATE: 29, ANVIL: 30, GRAVE: 31, HAY: 32, WHEEL: 33,
  CAMPFIRE: 34, RUIN: 35, SIGN: 36, STUMP: 37, FENCE_V: 38,
} as const;
export const TILE_COUNT = 39;
export const EMPTY = -1;

/** A named region. `mobs` hints which monsters belong there (empty or missing = none, e.g. inside the village). */
export interface Area { name: string; x: number; y: number; w: number; h: number; mobs?: MobKind[] }

// ---------- deterministic noise ----------
function hash(x: number, y: number, seed: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
function noise(x: number, y: number, scale: number, seed: number) {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = smooth(fx - x0), ty = smooth(fy - y0);
  const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed), c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}


// ---------- layout (tile coords) ----------

/** Oakvale's palisade bounds (tiles, inclusive). */
export const VILLAGE = { x0: 54, y0: 38, x1: 106, y1: 82 };
/** The two main roads (3 tiles wide): King's Road runs west↔east on rows RY..RY+2, North Road north↔south on columns RX..RX+2. */
export const ROADS = { RX: 79, RY: 59 };
/** Cobbled market square in the middle of the village. It is the safe zone. */
export const SAFE_ZONE = { x: 70, y: 52, w: 21, h: 17 };

/** Column of the river's center for a given row (River Ashwell, east of the village). */
export const riverCenter = (y: number) => Math.round(118 + 3 * Math.sin(y / 11) + 1.5 * Math.sin(y / 5));

/** Objects you can walk through (purely decorative, drawn over the player when they stand behind them). */
const WALKABLE_OBJECTS = new Set<number>([T.BUSH]);
const NATURE = new Set<number>([T.TREE, T.PINE, T.BUSH, T.ROCK, T.STUMP]);

function buildWorld() {
  const grid = (v: number) => Array.from({ length: MAP_H }, () => Array<number>(MAP_W).fill(v));
  const ground = grid(T.GRASS);
  const objects = grid(EMPTY);
  const roads = new Set<number>(); // every road/bridge tile, kept clear of obstacles
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  const setG = (x: number, y: number, t: number) => { if (inMap(x, y)) ground[y][x] = t; };
  const setO = (x: number, y: number, t: number) => { if (inMap(x, y)) objects[y][x] = t; };
  const each = (x: number, y: number, w: number, h: number, f: (x: number, y: number) => void) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inMap(i, j)) f(i, j);
  };
  const disk = (cx: number, cy: number, rx: number, ry: number, f: (x: number, y: number, d: number) => void) =>
    each(Math.floor(cx - rx - 1), Math.floor(cy - ry - 1), Math.ceil(rx * 2 + 3), Math.ceil(ry * 2 + 3), (x, y) => {
      const dx = (x - cx) / rx, dy = (y - cy) / ry, d = dx * dx + dy * dy;
      if (d < 1) f(x, y, d);
    });
  const rectG = (x: number, y: number, w: number, h: number, t: number) => each(x, y, w, h, (i, j) => setG(i, j, t));
  const rectO = (x: number, y: number, w: number, h: number, t: number) => each(x, y, w, h, (i, j) => setO(i, j, t));
  const clearO = (x: number, y: number, w: number, h: number) => rectO(x, y, w, h, EMPTY);
  const isGrass = (t: number) => t === T.GRASS || t === T.GRASS_DARK || t === T.TALL_GRASS || t === T.FLOWERS;
  /** Road tile: becomes a bridge over water and clears whatever stood there. */
  const road = (x: number, y: number, w: number, h: number, t: number = T.DIRT) => each(x, y, w, h, (i, j) => {
    setG(i, j, ground[j][i] === T.WATER || ground[j][i] === T.BRIDGE ? T.BRIDGE : t);
    setO(i, j, EMPTY);
    roads.add(j * MAP_W + i);
  });
  /** Fence around a box, with openings: a list of [x, y] tiles left open. */
  const fenceBox = (x: number, y: number, w: number, h: number, gaps: [number, number][] = []) => {
    const gap = (i: number, j: number) => gaps.some(([gx, gy]) => gx === i && gy === j);
    for (let i = x; i < x + w; i++) {
      if (!gap(i, y)) setO(i, y, T.FENCE);
      if (!gap(i, y + h - 1)) setO(i, y + h - 1, T.FENCE);
    }
    for (let j = y + 1; j < y + h - 1; j++) {
      if (!gap(x, j)) setO(x, j, T.FENCE_V);
      if (!gap(x + w - 1, j)) setO(x + w - 1, j, T.FENCE_V);
    }
  };
  /** Openings of `n` tiles centered on each side of a box (for fences with several ways in). */
  const sideGaps = (x: number, y: number, w: number, h: number, n = 3): [number, number][] => {
    const g: [number, number][] = [];
    const cx = x + Math.floor((w - n) / 2), cy = y + Math.floor((h - n) / 2);
    for (let k = 0; k < n; k++) g.push([cx + k, y], [cx + k, y + h - 1], [x, cy + k], [x + w - 1, cy + k]);
    return g;
  };
  /** Roof on top, two rows of wall, door centered on the bottom row, with a clear doorstep. Returns the door tile. */
  const building = (
    x: number, y: number, w: number, h: number,
    roof: number, wall: number, win: number, upperWindows = false,
  ) => {
    rectO(x, y, w, h - 2, roof);
    rectO(x, y + h - 2, w, 2, wall);
    const door = x + Math.floor(w / 2);
    setO(door, y + h - 1, T.DOOR);
    for (const wx of [x + 1, x + w - 2]) if (wx !== door) setO(wx, y + h - 1, win);
    if (upperWindows) for (let wx = x + 1; wx < x + w - 1; wx += 2) setO(wx, y + h - 2, win);
    return { x: door, y: y + h - 1 };
  };
  const house = (x: number, y: number, w: number, h: number, roof: number = T.ROOF_THATCH) =>
    building(x, y, w, h, roof, T.WALL_TIMBER, T.WINDOW_TIMBER);
  /** Path from a door straight down to the next road. */
  const doorPath = (d: { x: number; y: number }, t: number = T.DIRT) => {
    for (let y = d.y + 1; y < MAP_H && !roads.has(y * MAP_W + d.x) && y < d.y + 12; y++) road(d.x, y, 1, 1, t);
  };
  /** Winding 2-wide trail (in the woods): follows a sine around a base line. */
  const trailH = (x0: number, x1: number, y0: number, amp: number, period: number, t: number = T.DIRT) => {
    for (let x = x0; x <= x1; x++) road(x, y0 + Math.round(amp * Math.sin(x / period)), 1, 2, t);
  };
  const trailV = (y0: number, y1: number, x0: number, amp: number, period: number, t: number = T.DIRT) => {
    for (let y = y0; y <= y1; y++) road(x0 + Math.round(amp * Math.sin(y / period)), y, 2, 1, t);
  };

  const V = VILLAGE, { RX, RY } = ROADS, SQ = SAFE_ZONE;

  // ---------- 1. Ground: grass with patches of dark and tall grass, wildflowers ----------
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const n = noise(x, y, 7, 3);
    const h = hash(x, y, 9);
    ground[y][x] = n > 0.68 ? T.TALL_GRASS : n < 0.32 ? T.GRASS_DARK : h < 0.04 ? T.FLOWERS : T.GRASS;
  }

  // ---------- 2. Water: River Ashwell, Mirror Pond, and the pools of Misty Marsh ----------
  for (let y = 0; y < MAP_H; y++) {
    const cx = riverCenter(y);
    each(cx - 2, y, 4, 1, (x) => setG(x, y, T.WATER));
    for (const x of [cx - 3, cx + 2]) if (ground[y][x] !== T.WATER) setG(x, y, T.SAND);
  }
  const pond = { x: 24, y: 94, rx: 9, ry: 6 };
  disk(pond.x, pond.y, pond.rx * 1.3, pond.ry * 1.35, (x, y) => setG(x, y, T.SAND));
  disk(pond.x, pond.y, pond.rx, pond.ry, (x, y) => setG(x, y, T.WATER));
  const marsh = { x: 36, y: 92, w: 38, h: 22 };
  each(marsh.x, marsh.y, marsh.w, marsh.h, (x, y) => {
    const n = noise(x, y, 4, 61);
    if (n > 0.72) setG(x, y, T.WATER);
    else if (n > 0.64) setG(x, y, T.SAND);
    else if (hash(x, y, 62) < 0.5) setG(x, y, n < 0.45 ? T.GRASS_DARK : T.TALL_GRASS);
  });

  // ---------- 3. Forest: a ragged border all around, groves, and the Whispering Woods east of the river ----------
  const woodsX = riverCenter(60) + 7;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (!isGrass(ground[y][x])) continue;
    const d = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
    const h = hash(x, y, 5);
    const pine = noise(x, y, 8, 31) > 0.55;
    const edge = d < 3 + noise(x, y, 6, 11) * 5;
    const woods = x >= woodsX + Math.round(noise(x, y, 5, 23) * 3) && noise(x, y, 6, 71) > 0.42;
    const grove = noise(x, y, 9, 17) > 0.72;
    if ((edge && h < 0.85) || (woods && h < 0.62) || (grove && h < 0.5) || h < 0.004) setO(x, y, pine ? T.PINE : T.TREE);
    else if ((edge || woods || grove) && h < 0.75) setO(x, y, T.BUSH);
    else if (h > 0.985) setO(x, y, T.BUSH); // bushes are walk-through decoration
  }

  // ---------- 4. Clearings ----------
  clearO(V.x0 - 4, V.y0 - 4, V.x1 - V.x0 + 9, V.y1 - V.y0 + 9); // village + margin
  clearO(10, 34, 40, 46);  // farms
  disk(pond.x, pond.y, pond.rx + 4, pond.ry + 4, (x, y) => setO(x, y, EMPTY));
  clearO(86, 6, 30, 28);   // north meadow
  each(marsh.x, marsh.y, marsh.w, marsh.h, (x, y) => { if (objects[y][x] === T.TREE || objects[y][x] === T.PINE) setO(x, y, hash(x, y, 63) < 0.15 ? T.BUSH : EMPTY); });
  const quarry = { x: 86, y: 92, w: 28, h: 22 };
  clearO(quarry.x, quarry.y, quarry.w, quarry.h);
  const camp = { x: 26, y: 20 }, ruins = { x: 140, y: 60 }, tower = { x: 142, y: 22 };
  disk(camp.x, camp.y, 8, 7, (x, y) => setO(x, y, EMPTY));
  disk(ruins.x, ruins.y, 9, 8, (x, y, d) => { setO(x, y, EMPTY); if (d < 0.45 + hash(x, y, 77) * 0.2 && isGrass(ground[y][x])) setG(x, y, T.DIRT); });
  disk(tower.x, tower.y, 8, 7, (x, y) => setO(x, y, EMPTY));
  const mx = riverCenter(44) - 9; // the mill sits on the west bank
  clearO(mx - 3, 36, 13, 14);

  // ---------- 5. Roads ----------
  road(0, RY, MAP_W, 3);                   // King's Road, west ↔ east (bridged over the river)
  road(RX, 0, 3, MAP_H);                   // North Road, north ↔ south
  road(16, 20, RX - 16, 2);                // Hunter's Trail: North Road → Hunter's Camp
  road(RX + 3, 20, tower.x - RX - 3, 2);   // Watchtower Trail (bridged)
  road(34, RY + 3, 2, 26);                 // Pond Path: King's Road → Mirror Pond
  road(36, 71, V.x0 - 36 + 4, 2);          // West lane: Pond Path → village side gate
  road(65, 21, 2, V.y0 - 21 + 4);          // North lane: Hunter's Trail → village side gate
  road(V.x1 - 3, 47, mx - V.x1 + 3, 2);    // Mill lane: village side gate → Millbrook Mill
  road(95, V.y1 - 3, 2, 96 - V.y1 + 3);    // Quarry lane: village side gate → Quarry Road
  road(RX + 3, 96, 140 - RX - 3, 2);       // Quarry Road (bridged) → east woods
  road(marsh.x + 2, 102, RX - marsh.x - 2, 2); // Marsh road (boardwalk over the pools)
  // A shallow ford crosses the river south of the bridge
  for (let y = 79; y < 82; y++) { const cx = riverCenter(y); each(cx - 2, y, 4, 1, (x) => setG(x, y, T.SAND)); }
  road(V.x1 - 3, 80, riverCenter(80) - V.x1 + 1, 1, T.DIRT);
  road(riverCenter(80) + 3, 80, 12, 1, T.DIRT);
  // Woodland trails east of the river
  trailH(woodsX - 2, MAP_W - 1, 34, 3, 7);
  trailH(woodsX - 2, MAP_W - 1, 84, 3, 8);
  trailV(4, MAP_H - 4, 146, 3, 6);

  // ---------- 6. Oakvale village (palisade with 4 main gates and 4 side gates) ----------
  for (let x = V.x0; x <= V.x1; x++) for (const y of [V.y0, V.y1]) setO(x, y, T.PALISADE);
  for (let y = V.y0; y <= V.y1; y++) for (const x of [V.x0, V.x1]) setO(x, y, T.PALISADE);
  // inner ring lane just inside the palisade
  road(V.x0 + 3, V.y0 + 3, V.x1 - V.x0 - 5, 2);
  road(V.x0 + 3, V.y1 - 4, V.x1 - V.x0 - 5, 2);
  road(V.x0 + 3, V.y0 + 3, 2, V.y1 - V.y0 - 5);
  road(V.x1 - 4, V.y0 + 3, 2, V.y1 - V.y0 - 5);
  // gates: wide openings where roads cross the palisade
  const gateH = (x: number, w: number) => { for (const y of [V.y0, V.y1]) each(x, y, w, 1, (i, j) => setO(i, j, EMPTY)); };
  const gateV = (y: number, h: number) => { for (const x of [V.x0, V.x1]) each(x, y, 1, h, (i, j) => setO(i, j, EMPTY)); };
  gateH(RX - 2, 7); gateV(RY - 2, 7);       // main gates
  each(64, V.y0, 4, 1, (x, y) => setO(x, y, EMPTY));      // north side gate
  each(94, V.y1, 4, 1, (x, y) => setO(x, y, EMPTY));      // south side gate
  each(V.x0, 70, 1, 4, (x, y) => setO(x, y, EMPTY));      // west side gate
  each(V.x1, 46, 1, 4, (x, y) => setO(x, y, EMPTY));      // east side gate
  each(V.x1, 79, 1, 3, (x, y) => setO(x, y, EMPTY));      // ford gate
  road(V.x0 - 3, RY, 7, 3, T.COBBLE); road(V.x1 - 3, RY, 7, 3, T.COBBLE);
  road(RX, V.y0 - 3, 3, 7, T.COBBLE); road(RX, V.y1 - 3, 3, 7, T.COBBLE);
  // main streets and market square are cobbled
  road(V.x0, RY, V.x1 - V.x0 + 1, 3, T.COBBLE);
  road(RX, V.y0, 3, V.y1 - V.y0 + 1, T.COBBLE);
  road(SQ.x, SQ.y, SQ.w, SQ.h, T.COBBLE);

  // Market square: well, stalls and a few barrels, all on the edges so the middle stays open
  setO(75, 55, T.WELL);
  setO(72, 66, T.STALL_RED); setO(73, 66, T.STALL_RED);
  setO(87, 66, T.STALL_BLUE); setO(88, 66, T.STALL_BLUE);
  setO(87, 54, T.STALL_RED); setO(88, 54, T.STALL_RED);
  setO(71, 53, T.BARREL); setO(89, 67, T.BARREL); setO(89, 53, T.CRATE); setO(71, 67, T.CRATE);
  setO(77, 53, T.SIGN); // notice board

  // North-west quarter: two cottages and the smithy
  doorPath(house(60, 44, 6, 6));
  doorPath(house(68, 44, 6, 6, T.ROOF_RED));
  const smithy = building(60, 51, 7, 6, T.ROOF_SLATE, T.WALL_STONE, T.WINDOW_STONE);
  doorPath(smithy);
  setO(67, 56, T.ANVIL); setO(67, 52, T.BARREL); setO(68, 52, T.CRATE);

  // North-east quarter: Chapel of the Dawn and its graveyard, a cottage
  const chapel = building(84, 43, 9, 9, T.ROOF_SLATE, T.WALL_STONE, T.WINDOW_STONE, true);
  doorPath(chapel, T.COBBLE);
  rectG(95, 44, 6, 8, T.GRASS_DARK);
  fenceBox(94, 43, 8, 10, [[97, 52], [98, 52]]);
  for (const [gx, gy] of [[96, 45], [99, 45], [96, 48], [99, 48]]) setO(gx, gy, T.GRAVE);
  doorPath(house(93, 54, 6, 5, T.ROOF_RED));

  // South-west quarter: cottages and a vegetable garden
  doorPath(house(60, 64, 6, 6));
  doorPath(house(68, 70, 6, 6, T.ROOF_RED));
  rectG(61, 72, 5, 3, T.CROPS);
  fenceBox(60, 71, 7, 5, [[63, 71], [63, 75]]);

  // South-east quarter: The Rusty Tankard tavern and two houses
  const tavern = building(92, 63, 9, 7, T.ROOF_RED, T.WALL_TIMBER, T.WINDOW_TIMBER, true);
  doorPath(tavern);
  setO(91, 67, T.BARREL); setO(91, 68, T.BARREL);
  doorPath(house(84, 70, 6, 6));
  doorPath(house(92, 72, 5, 5, T.ROOF_RED));

  // A few shade trees and hay bales, kept away from paths
  for (const [x, y] of [[58, 48], [58, 66], [102, 60], [77, 47], [83, 74]]) setO(x, y, T.TREE);
  setO(103, 76, T.HAY); setO(57, 76, T.HAY);

  // Signposts outside the main gates
  setO(RX - 2, V.y0 - 4, T.SIGN); setO(V.x0 - 4, RY - 2, T.SIGN); setO(V.x1 + 4, RY - 2, T.SIGN); setO(RX - 2, V.y1 + 4, T.SIGN);

  // ---------- 7. Goldenreach Farms (west): barn, two fenced fields with openings on every side ----------
  const barn = building(14, 38, 9, 6, T.ROOF_RED, T.WALL_TIMBER, T.WINDOW_TIMBER);
  doorPath(barn);
  for (const [x, y] of [[24, 40], [24, 41], [12, 42], [24, 43]]) setO(x, y, T.HAY);
  rectG(29, 39, 16, 15, T.FIELD);
  fenceBox(28, 38, 18, 17, sideGaps(28, 38, 18, 17));
  setO(33, 44, T.HAY); setO(40, 49, T.HAY);
  rectG(13, 66, 14, 9, T.CROPS);
  fenceBox(12, 65, 16, 11, sideGaps(12, 65, 16, 11));

  // ---------- 8. Millbrook watermill ----------
  const mill = building(mx, 41, 6, 6, T.ROOF_THATCH, T.WALL_TIMBER, T.WINDOW_TIMBER);
  setO(riverCenter(44) - 2, 44, T.WHEEL);
  doorPath(mill);
  setO(mx - 1, 45, T.CRATE); setO(mx - 1, 46, T.BARREL);

  // ---------- 9. North Meadow: flowers and a few boulders ----------
  each(86, 6, 30, 28, (x, y) => {
    if (roads.has(y * MAP_W + x)) return;
    const h = hash(x, y, 41);
    if (h < 0.12) setG(x, y, T.FLOWERS);
    else if (h > 0.992) setO(x, y, T.ROCK);
    else if (h > 0.97) setO(x, y, T.BUSH);
  });

  // ---------- 10. Hunter's Camp (north-west woods) ----------
  setO(camp.x, camp.y - 3, T.CAMPFIRE);
  for (const [x, y] of [[camp.x - 2, camp.y - 3], [camp.x + 2, camp.y - 3], [camp.x, camp.y - 5]]) setO(x, y, T.STUMP);
  setO(camp.x - 5, camp.y - 4, T.HAY); setO(camp.x - 5, camp.y - 3, T.HAY); setO(camp.x + 5, camp.y - 4, T.CRATE); setO(camp.x + 5, camp.y - 3, T.BARREL);
  setO(camp.x + 3, camp.y + 3, T.SIGN);

  // ---------- 11. Old Ruins (on the King's Road, deep in the woods) and the Old Watchtower ----------
  for (const [dx, dy] of [[-6, -5], [-5, -5], [-4, -5], [-6, -4], [-6, -3], [4, -5], [5, -5], [5, -4], [4, 4], [5, 3], [-6, 3], [-5, 4]]) setO(ruins.x + dx, ruins.y + dy, T.RUIN);
  setO(ruins.x + 1, ruins.y + 5, T.CAMPFIRE); setO(ruins.x - 1, ruins.y + 6, T.STUMP); setO(ruins.x + 3, ruins.y + 6, T.STUMP);
  for (let a = 0; a < 16; a++) { // broken ring of the watchtower, with wide gaps
    if (a % 4 === 0 || a % 4 === 1) continue;
    const ang = (a / 16) * Math.PI * 2;
    setO(Math.round(tower.x + Math.cos(ang) * 4), Math.round(tower.y + Math.sin(ang) * 3), T.RUIN);
  }
  setO(tower.x, tower.y, T.RUIN);

  // ---------- 12. Stonecrag Quarry (south-east): bare stone, boulders around the rim ----------
  each(quarry.x, quarry.y, quarry.w, quarry.h, (x, y) => {
    if (roads.has(y * MAP_W + x) || ground[y][x] === T.WATER) return;
    const n = noise(x, y, 5, 91), edge = Math.min(x - quarry.x, y - quarry.y, quarry.x + quarry.w - 1 - x, quarry.y + quarry.h - 1 - y);
    setG(x, y, n > 0.55 ? T.COBBLE : n > 0.35 ? T.DIRT : T.SAND);
    if (edge < 2 && hash(x, y, 92) < 0.35) setO(x, y, T.ROCK);
    else if (hash(x, y, 93) < 0.015) setO(x, y, T.ROCK);
  });
  for (const [x, y] of [[96, 104], [97, 104], [104, 100], [108, 108]]) setO(x, y, T.RUIN);
  setO(100, 99, T.CRATE); setO(101, 99, T.CRATE); setO(100, 100, T.BARREL);

  // ---------- 13. Keep every road clear, with a 1-tile verge ----------
  for (const k of roads) {
    const x = k % MAP_W, y = (k / MAP_W) | 0;
    each(x - 1, y - 1, 3, 3, (i, j) => { if (NATURE.has(objects[j][i])) setO(i, j, EMPTY); });
  }

  // ---------- 14. Reachability: carve through nature to any pocket the player can't reach ----------
  const solid = (x: number, y: number) => !inMap(x, y) || (objects[y][x] !== EMPTY && !WALKABLE_OBJECTS.has(objects[y][x])) || ground[y][x] === T.WATER;
  const flood = (sx: number, sy: number) => {
    const seen = new Uint8Array(MAP_W * MAP_H);
    const q = [sy * MAP_W + sx]; seen[q[0]] = 1;
    for (let i = 0; i < q.length; i++) {
      const x = q[i] % MAP_W, y = (q[i] / MAP_W) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const k = ny * MAP_W + nx;
        if (!solid(nx, ny) && !seen[k]) { seen[k] = 1; q.push(k); }
      }
    }
    return seen;
  };
  for (let pass = 0; pass < 3000; pass++) {
    const main = flood(RX + 1, RY + 1);
    let pocket = -1;
    for (let k = 0; k < MAP_W * MAP_H && pocket < 0; k++) if (!main[k] && !solid(k % MAP_W, (k / MAP_W) | 0)) pocket = k;
    if (pocket < 0) break;
    const px = pocket % MAP_W, py = (pocket / MAP_W) | 0;
    if (Math.min(px, py, MAP_W - 1 - px, MAP_H - 1 - py) < 9) { // a hollow in the border forest: just grow it over
      const seal = flood(px, py);
      for (let k = 0; k < seal.length; k++) if (seal[k]) objects[(k / MAP_W) | 0][k % MAP_W] = hash(k, 0, 97) < 0.7 ? T.TREE : T.PINE;
      continue;
    }
    // shortest path from the pocket to the main area, allowed through nature (and fences) only
    const prev = new Int32Array(MAP_W * MAP_H).fill(-2);
    const q = [pocket]; prev[pocket] = -1;
    let hit = -1;
    for (let i = 0; i < q.length && hit < 0; i++) {
      const x = q[i] % MAP_W, y = (q[i] / MAP_W) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (!inMap(nx, ny)) continue;
        const k = ny * MAP_W + nx, o = objects[ny][nx];
        if (prev[k] !== -2 || ground[ny][nx] === T.WATER) continue;
        if (o !== EMPTY && !NATURE.has(o) && o !== T.FENCE && o !== T.FENCE_V) continue;
        prev[k] = q[i];
        if (main[k]) { hit = k; break; }
        q.push(k);
      }
    }
    if (hit < 0) { // sealed in by water or buildings: fill it so nothing spawns there
      const seal = flood(pocket % MAP_W, (pocket / MAP_W) | 0);
      for (let k = 0; k < seal.length; k++) if (seal[k]) objects[(k / MAP_W) | 0][k % MAP_W] = T.TREE;
      continue;
    }
    for (let k = hit; k >= 0; k = prev[k]) { const x = k % MAP_W, y = (k / MAP_W) | 0; if (objects[y][x] !== EMPTY && !WALKABLE_OBJECTS.has(objects[y][x])) objects[y][x] = EMPTY; }
  }

  const areas: Area[] = [
    { name: "Market Square", ...SQ },
    { name: "Chapel of the Dawn", x: 83, y: 42, w: 20, h: 11 },
    { name: "The Rusty Tankard", x: 90, y: 62, w: 12, h: 9 },
    { name: "The Smithy", x: 59, y: 50, w: 10, h: 8 },
    { name: "Oakvale", x: V.x0, y: V.y0, w: V.x1 - V.x0 + 1, h: V.y1 - V.y0 + 1 },
    { name: "Millbrook Mill", x: mx - 3, y: 36, w: 13, h: 14 },
    { name: "Old Ruins", x: ruins.x - 9, y: ruins.y - 8, w: 19, h: 17, mobs: ["skeleton"] },
    { name: "Old Watchtower", x: tower.x - 8, y: tower.y - 7, w: 17, h: 15, mobs: ["skeleton"] },
    { name: "Hunter's Camp", x: camp.x - 8, y: camp.y - 7, w: 17, h: 15 },
    { name: "Stonecrag Quarry", ...quarry, mobs: ["skeleton"] },
    { name: "Misty Marsh", ...marsh, mobs: ["slime"] },
    { name: "Mirror Pond", x: pond.x - 13, y: pond.y - 9, w: 26, h: 18, mobs: ["slime"] },
    { name: "Goldenreach Farms", x: 10, y: 34, w: 40, h: 46, mobs: ["slime"] },
    { name: "North Meadow", x: 86, y: 4, w: 30, h: 30, mobs: ["slime"] },
    { name: "River Ashwell", x: riverCenter(60) - 6, y: 0, w: 12, h: MAP_H },
    { name: "Whispering Woods", x: woodsX - 2, y: 0, w: MAP_W - woodsX + 2, h: MAP_H, mobs: ["slime", "skeleton"] },
  ];
  return { ground, objects, areas };
}

export const WORLD = buildWorld();
export const GROUND = WORLD.ground;
export const OBJECTS = WORLD.objects;
export const AREAS = WORLD.areas;

export function isSolidTile(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  const o = OBJECTS[ty][tx];
  return (o !== EMPTY && !WALKABLE_OBJECTS.has(o)) || GROUND[ty][tx] === T.WATER;
}

export function isSolidAt(px: number, py: number): boolean {
  return isSolidTile(Math.floor(px / TILE), Math.floor(py / TILE));
}

/** Name of the area at a pixel position (first match wins, so specific areas come first). */
export function areaAt(px: number, py: number): string {
  return areaInfoAt(px, py)?.name ?? "Oakvale Outskirts";
}

/** The area record at a pixel position, if any. */
export function areaInfoAt(px: number, py: number): Area | undefined {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  return AREAS.find((a) => tx >= a.x && ty >= a.y && tx < a.x + a.w && ty < a.y + a.h);
}

const clearAt = (x: number, y: number, r = 6) =>
  ![[-r, -r], [r, -r], [-r, r], [r, r]].some(([dx, dy]) => isSolidAt(x + dx, y + dy));

export function randomSpawn(): { x: number; y: number } {
  // Somewhere free in the market square
  const z = SAFE_ZONE;
  for (let i = 0; i < 200; i++) {
    const x = (z.x + 1 + Math.random() * (z.w - 2)) * TILE;
    const y = (z.y + 1 + Math.random() * (z.h - 2)) * TILE;
    if (clearAt(x, y, PLAYER_RADIUS)) return { x, y };
  }
  return { x: (ROADS.RX + 1.5) * TILE, y: (ROADS.RY + 1.5) * TILE };
}

/** The market square is a safe zone: no damage there, and monsters will not enter. */
export function isSafeZone(px: number, py: number): boolean {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  const z = SAFE_ZONE;
  return tx >= z.x && ty >= z.y && tx < z.x + z.w && ty < z.y + z.h;
}

/** Random walkable point outside the village palisade, where monsters live. */
export function randomOutskirtsPoint(): { x: number; y: number } {
  const v = VILLAGE;
  for (;;) {
    const tx = 2 + Math.floor(Math.random() * (MAP_W - 4));
    const ty = 2 + Math.floor(Math.random() * (MAP_H - 4));
    if (tx >= v.x0 - 2 && tx <= v.x1 + 2 && ty >= v.y0 - 2 && ty <= v.y1 + 2) continue;
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (clearAt(x, y)) return { x, y };
  }
}

/** Random walkable point inside a named area (for per-zone monster spawns). Undefined if the area has no free tile. */
export function randomPointInArea(name: string): { x: number; y: number } | undefined {
  const a = AREAS.find((z) => z.name === name);
  if (!a) return undefined;
  for (let i = 0; i < 400; i++) {
    const x = (a.x + 0.5 + Math.random() * (a.w - 1)) * TILE, y = (a.y + 0.5 + Math.random() * (a.h - 1)) * TILE;
    if (clearAt(x, y) && !isSafeZone(x, y) && areaInfoAt(x, y) === a) return { x, y };
  }
  return undefined;
}
