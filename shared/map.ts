import { MAP_H, MAP_W, PLAYER_RADIUS, TILE } from "./constants";

/**
 * Oakvale — the starting region.
 *
 * The world is two tile layers that share one tileset:
 *  - ground:  always filled (grass, roads, water…)
 *  - objects: EMPTY or something standing on the ground (trees, walls, roofs, props). All objects are solid.
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

export interface Area { name: string; x: number; y: number; w: number; h: number }

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

/** Oakvale's palisade bounds (tiles, inclusive). */
export const VILLAGE = { x0: 22, y0: 14, x1: 64, y1: 56 };

/** Column of the river's center for a given row. */
export const riverCenter = (y: number) => Math.round(74 + 3 * Math.sin(y / 9) + 1.5 * Math.sin(y / 4.3));

function buildWorld() {
  const grid = (v: number) => Array.from({ length: MAP_H }, () => Array<number>(MAP_W).fill(v));
  const ground = grid(T.GRASS);
  const objects = grid(EMPTY);
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  const setG = (x: number, y: number, t: number) => { if (inMap(x, y)) ground[y][x] = t; };
  const setO = (x: number, y: number, t: number) => { if (inMap(x, y)) objects[y][x] = t; };
  const each = (x: number, y: number, w: number, h: number, f: (x: number, y: number) => void) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inMap(i, j)) f(i, j);
  };
  const rectG = (x: number, y: number, w: number, h: number, t: number) => each(x, y, w, h, (i, j) => setG(i, j, t));
  const rectO = (x: number, y: number, w: number, h: number, t: number) => each(x, y, w, h, (i, j) => setO(i, j, t));
  const clearO = (x: number, y: number, w: number, h: number) => rectO(x, y, w, h, EMPTY);
  const isGrass = (t: number) => t === T.GRASS || t === T.GRASS_DARK || t === T.TALL_GRASS || t === T.FLOWERS;
  /** Road tile: becomes a bridge over water and clears whatever stood there. */
  const road = (x: number, y: number, w: number, h: number, t: number) => each(x, y, w, h, (i, j) => {
    setG(i, j, ground[j][i] === T.WATER ? T.BRIDGE : t);
    setO(i, j, EMPTY);
  });
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
  /** Roof on top, two rows of wall, door centered on the bottom row. Returns the door tile. */
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

  // ---------- 1. Ground: grass with patches of dark and tall grass, wildflowers ----------
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const n = noise(x, y, 7, 3);
    const h = hash(x, y, 9);
    ground[y][x] = n > 0.68 ? T.TALL_GRASS : n < 0.32 ? T.GRASS_DARK : h < 0.04 ? T.FLOWERS : T.GRASS;
  }

  // ---------- 2. River Ashwell (north → south, east of the village) and Mirror Pond ----------
  for (let y = 0; y < MAP_H; y++) {
    const cx = riverCenter(y);
    rectG(cx - 2, y, 4, 1, T.WATER);
    if (ground[y][cx - 3] !== T.WATER) setG(cx - 3, y, T.SAND);
    if (ground[y][cx + 2] !== T.WATER) setG(cx + 2, y, T.SAND);
  }
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const dx = (x - 11) / 6.5, dy = (y - 61) / 4.3, d = dx * dx + dy * dy;
    if (d < 1) setG(x, y, T.WATER);
    else if (d < 1.6) setG(x, y, T.SAND);
  }

  // ---------- 3. Forests: a ragged border all around and the dense Whispering Woods east of the river ----------
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (!isGrass(ground[y][x])) continue;
    const d = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
    const edge = d < 3 + noise(x, y, 6, 11) * 6;
    const woods = x >= 80 + Math.round(noise(x, y, 5, 23) * 3);
    const h = hash(x, y, 5);
    const pine = noise(x, y, 8, 31) > (woods ? 0.4 : 0.6);
    if ((edge && h < 0.8) || (woods && h < 0.7) || h < 0.035) setO(x, y, pine ? T.PINE : T.TREE);
    else if ((edge || woods) && h < 0.88) setO(x, y, T.BUSH);
    else if (h > 0.993) setO(x, y, T.ROCK);
    else if (h > 0.985) setO(x, y, T.BUSH);
  }

  // ---------- 4. Clearings ----------
  clearO(20, 12, 47, 47); // village + margin
  clearO(3, 26, 19, 30);  // farms
  clearO(4, 55, 16, 11);  // pond
  clearO(26, 3, 40, 10);  // north meadow
  const mx = riverCenter(20) - 8; // mill sits right on the west bank
  clearO(mx - 2, 14, 10, 11);
  const ruins = { x: 88, y: 36 };
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const d = Math.hypot(x - ruins.x, y - ruins.y);
    if (d < 6.5) setO(x, y, EMPTY);
    if (d < 3.5 + hash(x, y, 77) * 1.5 && isGrass(ground[y][x])) setG(x, y, T.DIRT);
  }

  // ---------- 5. Roads ----------
  road(0, 35, MAP_W, 2, T.DIRT);  // King's Road, west ↔ east (bridge over the river)
  road(46, 0, 2, MAP_H, T.DIRT);  // north ↔ south
  for (const y of [34, 37]) each(0, y, MAP_W, 1, (i, j) => { if (objects[j][i] === T.TREE || objects[j][i] === T.PINE) setO(i, j, EMPTY); });
  for (const x of [45, 48]) each(x, 0, 1, MAP_H, (i, j) => { if (objects[j][i] === T.TREE || objects[j][i] === T.PINE) setO(i, j, EMPTY); });

  // ---------- 6. Oakvale village (palisade 22..64 × 14..56) ----------
  const V = VILLAGE;
  for (let x = V.x0; x <= V.x1; x++) for (const y of [V.y0, V.y1]) if (x !== 46 && x !== 47) setO(x, y, T.PALISADE);
  for (let y = V.y0; y <= V.y1; y++) for (const x of [V.x0, V.x1]) if (y !== 35 && y !== 36) setO(x, y, T.PALISADE);

  // Lanes (dirt) then the main streets and market square (cobble)
  road(24, 24, 22, 1, T.DIRT);
  road(24, 45, 40, 1, T.DIRT);
  road(33, 53, 31, 1, T.DIRT);
  road(V.x0, 35, V.x1 - V.x0 + 1, 2, T.COBBLE);
  road(46, V.y0, 2, V.y1 - V.y0 + 1, T.COBBLE);
  road(38, 29, 18, 14, T.COBBLE);

  // Market square
  setO(42, 32, T.WELL);
  setO(40, 38, T.STALL_RED); setO(41, 38, T.STALL_RED);
  setO(51, 38, T.STALL_BLUE); setO(52, 38, T.STALL_BLUE);
  setO(51, 31, T.STALL_RED); setO(52, 31, T.STALL_RED);
  setO(39, 31, T.BARREL); setO(54, 41, T.BARREL); setO(54, 30, T.CRATE); setO(39, 41, T.CRATE);
  setO(44, 30, T.SIGN); // notice board

  // Chapel + graveyard (north-east)
  const chapel = building(50, 17, 8, 9, T.ROOF_SLATE, T.WALL_STONE, T.WINDOW_STONE, true);
  road(chapel.x, chapel.y + 1, 1, 3, T.COBBLE);
  rectG(59, 17, 4, 9, T.GRASS_DARK);
  fenceBox(58, 16, 6, 11, [[60, 26]]);
  for (const [gx, gy] of [[59, 18], [61, 18], [59, 21], [61, 21], [59, 24]]) setO(gx, gy, T.GRAVE);
  setO(62, 24, T.BUSH);
  const neHouse = house(57, 28, 6, 5, T.ROOF_RED);
  road(neHouse.x, neHouse.y + 1, 1, 2, T.DIRT);

  // North-west quarter
  house(25, 18, 5, 6);
  house(32, 19, 6, 5, T.ROOF_RED);
  house(39, 18, 5, 6);
  const nwHouse = house(24, 28, 5, 6);
  road(nwHouse.x, nwHouse.y + 1, 1, 1, T.DIRT);
  building(30, 29, 6, 6, T.ROOF_SLATE, T.WALL_STONE, T.WINDOW_STONE);
  setO(36, 33, T.ANVIL); setO(36, 31, T.BARREL); setO(36, 32, T.CRATE);
  setO(24, 16, T.TREE); setO(37, 16, T.TREE); setO(31, 16, T.BUSH); setO(43, 15, T.CRATE); setO(44, 15, T.BARREL);

  // South-west quarter: houses and a vegetable garden
  house(25, 39, 6, 6);
  house(33, 39, 5, 6, T.ROOF_RED);
  rectG(24, 48, 8, 5, T.CROPS);
  fenceBox(23, 47, 10, 7, [[27, 47], [28, 47]]);
  house(34, 47, 6, 6);
  house(41, 48, 4, 5, T.ROOF_RED);

  // South-east: The Rusty Tankard tavern and two houses
  building(57, 38, 7, 7, T.ROOF_RED, T.WALL_TIMBER, T.WINDOW_TIMBER, true);
  setO(56, 42, T.BARREL); setO(56, 43, T.BARREL);
  house(49, 47, 6, 6);
  house(57, 47, 6, 6, T.ROOF_RED);
  setO(25, 55, T.HAY); setO(62, 55, T.TREE); setO(55, 55, T.BUSH);

  // Signposts at the gates
  setO(44, 12, T.SIGN); setO(20, 33, T.SIGN); setO(66, 33, T.SIGN); setO(44, 58, T.SIGN);

  // ---------- 7. Goldenreach Farms (west) ----------
  const barn = building(7, 28, 8, 6, T.ROOF_RED, T.WALL_TIMBER, T.WINDOW_TIMBER);
  road(barn.x, barn.y + 1, 1, 1, T.DIRT);
  setO(16, 31, T.HAY); setO(16, 32, T.HAY); setO(5, 32, T.HAY); setO(15, 33, T.CRATE);
  rectG(5, 39, 14, 14, T.FIELD);
  fenceBox(4, 38, 16, 16, [[11, 38], [12, 38]]);
  road(11, 37, 2, 1, T.DIRT);
  setO(8, 44, T.HAY); setO(15, 48, T.HAY);
  setO(16, 57, T.STUMP); setO(5, 58, T.ROCK);

  // ---------- 8. Millbrook watermill ----------
  const mill = building(mx, 17, 6, 6, T.ROOF_THATCH, T.WALL_TIMBER, T.WINDOW_TIMBER);
  setO(riverCenter(20) - 2, 20, T.WHEEL);
  road(mill.x, mill.y + 1, 1, 34 - mill.y, T.DIRT);
  setO(mx - 1, 21, T.CRATE); setO(mx - 1, 22, T.BARREL);

  // ---------- 9. North meadow ----------
  each(26, 3, 40, 10, (x, y) => {
    if (ground[y][x] === T.DIRT) return;
    const h = hash(x, y, 41);
    if (h < 0.12) setG(x, y, T.FLOWERS);
    else if (h > 0.985) setO(x, y, T.ROCK);
    else if (h > 0.975) setO(x, y, T.BUSH);
  });

  // ---------- 10. Old ruins in the Whispering Woods ----------
  for (const [rx, ry] of [[84, 31], [85, 31], [86, 31], [84, 32], [84, 33], [91, 31], [92, 31], [92, 32], [91, 41], [92, 40]]) setO(rx, ry, T.RUIN);
  setO(88, 39, T.CAMPFIRE); setO(86, 40, T.STUMP); setO(90, 40, T.STUMP); setO(90, 33, T.ROCK);

  const areas: Area[] = [
    { name: "Market Square", x: 38, y: 29, w: 18, h: 14 },
    { name: "Chapel of the Dawn", x: 49, y: 15, w: 15, h: 13 },
    { name: "The Rusty Tankard", x: 56, y: 37, w: 8, h: 9 },
    { name: "Oakvale", x: V.x0, y: V.y0, w: V.x1 - V.x0 + 1, h: V.y1 - V.y0 + 1 },
    { name: "Millbrook Mill", x: mx - 2, y: 14, w: 10, h: 11 },
    { name: "Old Ruins", x: 81, y: 29, w: 14, h: 14 },
    { name: "Whispering Woods", x: 79, y: 0, w: MAP_W - 79, h: MAP_H },
    { name: "River Ashwell", x: 66, y: 0, w: 13, h: MAP_H },
    { name: "Goldenreach Farms", x: 3, y: 26, w: 19, h: 29 },
    { name: "Mirror Pond", x: 3, y: 55, w: 17, h: 13 },
    { name: "North Meadow", x: 24, y: 0, w: 44, h: 14 },
  ];
  return { ground, objects, areas };
}

export const WORLD = buildWorld();
export const GROUND = WORLD.ground;
export const OBJECTS = WORLD.objects;
export const AREAS = WORLD.areas;

export function isSolidTile(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return OBJECTS[ty][tx] !== EMPTY || GROUND[ty][tx] === T.WATER;
}

export function isSolidAt(px: number, py: number): boolean {
  return isSolidTile(Math.floor(px / TILE), Math.floor(py / TILE));
}

/** Name of the area at a pixel position (first match wins, so specific areas come first). */
export function areaAt(px: number, py: number): string {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  const a = AREAS.find((a) => tx >= a.x && ty >= a.y && tx < a.x + a.w && ty < a.y + a.h);
  return a?.name ?? "Oakvale Outskirts";
}

export function randomSpawn(): { x: number; y: number } {
  // Somewhere free in the market square
  const r = PLAYER_RADIUS;
  for (let i = 0; i < 100; i++) {
    const x = (39 + Math.random() * 16) * TILE;
    const y = (30 + Math.random() * 12) * TILE;
    if (![[-r, -r], [r, -r], [-r, r], [r, r]].some(([dx, dy]) => isSolidAt(x + dx, y + dy))) return { x, y };
  }
  return { x: 46.5 * TILE, y: 36 * TILE };
}

/** The market square is a safe zone: no damage there, and monsters will not enter. */
export const SAFE_ZONE = { x: 38, y: 29, w: 18, h: 14 }; // tiles, matches the cobbled Market Square
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
    if (!isSolidAt(x - 6, y - 6) && !isSolidAt(x + 6, y + 6) && !isSolidAt(x - 6, y + 6) && !isSolidAt(x + 6, y - 6)) return { x, y };
  }
}
