import { MAP_H, MAP_W, TILE } from "./constants";

// Tile ids (index into the generated tileset)
export const T = {
  GRASS: 0,
  ROAD: 1,
  WALL: 2,
  ROOF: 3,
  WATER: 4,
  TREE: 5,
  DOOR: 6,
  FLOWER: 7,
  PLAZA: 8,
} as const;

const SOLID = new Set<number>([T.WALL, T.ROOF, T.WATER, T.TREE]);

// Deterministic pseudo-random so server and client build the same map
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function buildTown(): number[][] {
  const rand = rng(1337);
  const m: number[][] = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(T.GRASS));
  const set = (x: number, y: number, t: number) => {
    if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) m[y][x] = t;
  };
  const rect = (x: number, y: number, w: number, h: number, t: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, t);
  };

  // Flowers scattered on grass
  for (let i = 0; i < 120; i++) set(Math.floor(rand() * MAP_W), Math.floor(rand() * MAP_H), T.FLOWER);

  // Main roads
  rect(0, 22, MAP_W, 3, T.ROAD);
  rect(30, 0, 3, MAP_H, T.ROAD);
  rect(8, 8, 48, 2, T.ROAD);
  rect(8, 37, 48, 2, T.ROAD);
  rect(8, 8, 2, 31, T.ROAD);
  rect(54, 8, 2, 31, T.ROAD);

  // Central plaza
  rect(26, 19, 11, 9, T.PLAZA);

  // Houses: roof on top, wall below with a door
  const house = (x: number, y: number, w: number, h: number) => {
    rect(x, y, w, h - 2, T.ROOF);
    rect(x, y + h - 2, w, 2, T.WALL);
    set(x + Math.floor(w / 2), y + h - 1, T.DOOR);
  };
  house(13, 11, 6, 5);
  house(21, 11, 6, 6);
  house(36, 11, 7, 5);
  house(46, 11, 5, 5);
  house(13, 28, 7, 6);
  house(23, 29, 5, 5);
  house(37, 28, 6, 6);
  house(46, 29, 6, 5);

  // Pond
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const dx = (x - 58) / 4.5, dy = (y - 43) / 3;
      if (dx * dx + dy * dy < 1) set(x, y, T.WATER);
    }

  // Tree border with gaps where roads exit
  for (let x = 0; x < MAP_W; x++) {
    for (const y of [0, 1, MAP_H - 1, MAP_H - 2]) if (m[y][x] === T.GRASS || m[y][x] === T.FLOWER) set(x, y, T.TREE);
  }
  for (let y = 0; y < MAP_H; y++) {
    for (const x of [0, 1, MAP_W - 1, MAP_W - 2]) if (m[y][x] === T.GRASS || m[y][x] === T.FLOWER) set(x, y, T.TREE);
  }
  // A few random trees on open grass
  for (let i = 0; i < 40; i++) {
    const x = 3 + Math.floor(rand() * (MAP_W - 6));
    const y = 3 + Math.floor(rand() * (MAP_H - 6));
    if (m[y][x] === T.GRASS) set(x, y, T.TREE);
  }
  return m;
}

export const TOWN_MAP = buildTown();

export function isSolidAt(px: number, py: number): boolean {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  // Map edges are solid
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return SOLID.has(TOWN_MAP[ty][tx]);
}

export function randomSpawn(): { x: number; y: number } {
  // Spawn around the plaza
  const x = (27 + Math.random() * 9) * TILE;
  const y = (20 + Math.random() * 7) * TILE;
  return { x, y };
}

/** The plaza is a safe zone: no damage there, and monsters will not enter. */
export function isSafeZone(px: number, py: number): boolean {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && TOWN_MAP[ty][tx] === T.PLAZA;
}

/** Random walkable point in the outskirts (outside the ring road), where monsters live. */
export function randomOutskirtsPoint(): { x: number; y: number } {
  for (;;) {
    const tx = 2 + Math.floor(Math.random() * (MAP_W - 4));
    const ty = 2 + Math.floor(Math.random() * (MAP_H - 4));
    const inside = tx >= 7 && tx <= 56 && ty >= 7 && ty <= 39;
    if (inside) continue;
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (!isSolidAt(x - 6, y - 6) && !isSolidAt(x + 6, y + 6) && !isSolidAt(x - 6, y + 6) && !isSolidAt(x + 6, y - 6)) return { x, y };
  }
}
