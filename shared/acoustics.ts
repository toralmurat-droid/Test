import { MAP_W, TILE } from "./constants";
import { EMPTY, GROUND, isSolidAt, OBJECTS, T } from "./map";

/**
 * Acoustics (the Songweaver, Plan v2): what each tile is made of, for sound. Built from shared/map.ts tiles on first
 * use, so it is the same on the server, the client and in tests (no randomness at all).
 *  - A wave hitting a wall bounces off stone (x0.9 damage), wood (x0.6) and metal (a well or an anvil: x1.0 and it
 *    carries RESONANCE.metal more resonance); foliage, cloth, straw and water swallow it.
 *  - A song ticking near water slows longer, near a well reaches further, between stone rings its low notes louder.
 */
export type Material = "none" | "stone" | "wood" | "metal" | "foliage" | "water";
const MATS: Material[] = ["none", "stone", "wood", "metal", "foliage", "water"];
const M = { none: 0, stone: 1, wood: 2, metal: 3, foliage: 4, water: 5 } as const;

/** Object tiles by material (anything solid that is not listed counts as wood: gates, props). */
const OBJ_MAT: Partial<Record<number, number>> = {
  [T.ROCK]: M.stone, [T.WALL_STONE]: M.stone, [T.WINDOW_STONE]: M.stone, [T.RUIN]: M.stone, [T.ROOF_SLATE]: M.stone,
  [T.ROOF_RED]: M.stone, [T.GRAVE]: M.stone, [T.CLIFF]: M.stone, [T.ADOBE]: M.stone, [T.ADOBE_WALL]: M.stone, [T.BONES]: M.stone,
  [T.PALISADE]: M.wood, [T.FENCE]: M.wood, [T.FENCE_V]: M.wood, [T.WALL_TIMBER]: M.wood, [T.WINDOW_TIMBER]: M.wood, [T.DOOR]: M.wood,
  [T.STALL_RED]: M.wood, [T.STALL_BLUE]: M.wood, [T.BARREL]: M.wood, [T.CRATE]: M.wood, [T.WHEEL]: M.wood, [T.SIGN]: M.wood,
  [T.STUMP]: M.wood, [T.BEAM]: M.wood, [T.SIGNPOST]: M.wood, [T.CAMPFIRE]: M.wood, [T.BONFIRE]: M.wood,
  [T.WELL]: M.metal, [T.ANVIL]: M.metal,
  [T.TREE]: M.foliage, [T.PINE]: M.foliage, [T.BUSH]: M.foliage, [T.PALM]: M.foliage, [T.HAY]: M.foliage,
  [T.ROOF_THATCH]: M.foliage, [T.TENT]: M.foliage,
};

let GRID: Uint8Array | null = null;
const ROWS = OBJECTS.length;
/** The material of every tile (row-major, MAP_W wide). Built once. */
export function materialGrid(): Uint8Array {
  if (GRID) return GRID;
  const g = new Uint8Array(MAP_W * ROWS);
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const o = OBJECTS[ty][tx];
    g[ty * MAP_W + tx] = o !== EMPTY && OBJ_MAT[o] !== undefined ? OBJ_MAT[o]! : GROUND[ty][tx] === T.WATER ? M.water : o !== EMPTY ? M.wood : M.none;
  }
  return (GRID = g);
}

/** Material of a tile; off the map is stone. */
export function materialAt(tx: number, ty: number): Material {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= ROWS) return "stone";
  return MATS[materialGrid()[ty * MAP_W + tx]];
}

/** What a wall does to a wave that runs into it: `null` = it is swallowed. */
export const BOUNCE: Record<Material, { dmg: number; res: number } | null> = {
  none: null, foliage: null, water: null,
  stone: { dmg: 0.9, res: 0 }, wood: { dmg: 0.6, res: 0 }, metal: { dmg: 1, res: 20 },
};
/** Bounce rules: at most this many per wave, and this far in flight between two bounces. */
export const BOUNCE_RULES = { max: 3, minFlight: 24 };

/** Material of the solid thing at a pixel (a gate or a prop that the grid calls none counts as wood). */
export function wallAt(px: number, py: number): Material {
  const m = materialAt(Math.floor(px / TILE), Math.floor(py / TILE));
  return m === "none" && isSolidAt(px, py) ? "wood" : m;
}

/**
 * A wave stepped from (px, py) to (x, y) and ran into a wall: which axis to flip, found with two lookups (one per axis).
 * Both blocked (a corner) flips both.
 */
export function reflectAxis(px: number, py: number, x: number, y: number): { fx: boolean; fy: boolean } {
  const fx = isSolidAt(x, py), fy = isSolidAt(px, y);
  return fx || fy ? { fx, fy } : { fx: true, fy: true };
}

/** Song tick modifiers from the tiles around (x, y), within ACOUSTIC.r: slow x, radius x, low-pitch damage x. */
export const ACOUSTIC = { r: 2, water: 1.3, well: 1.2, stone: 1.15, stoneTiles: 3 };
export interface Acoustic { slow: number; radius: number; low: number }
let NEAR: Uint8Array | null = null; // per tile: 0 = not worked out yet, else 128 | water 1 | well 2 | stone 4
const LOOKS: Acoustic[] = Array.from({ length: 8 }, (_, b) => ({ slow: b & 1 ? ACOUSTIC.water : 1, radius: b & 2 ? ACOUSTIC.well : 1, low: b & 4 ? ACOUSTIC.stone : 1 }));
export function acousticsAt(x: number, y: number): Acoustic {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= ROWS) return LOOKS[0];
  const near = (NEAR ??= new Uint8Array(MAP_W * ROWS)), key = ty * MAP_W + tx;
  if (near[key]) return LOOKS[near[key] & 7];
  const g = materialGrid();
  let bits = 0, stone = 0;
  for (let j = -ACOUSTIC.r; j <= ACOUSTIC.r; j++) for (let i = -ACOUSTIC.r; i <= ACOUSTIC.r; i++) {
    const X = tx + i, Y = ty + j;
    if (X < 0 || Y < 0 || X >= MAP_W || Y >= ROWS) continue;
    const m = g[Y * MAP_W + X];
    if (m === M.water) bits |= 1;
    else if (m === M.stone) stone++;
    else if (m === M.metal && OBJECTS[Y][X] === T.WELL) bits |= 2;
  }
  if (stone >= ACOUSTIC.stoneTiles) bits |= 4;
  near[key] = 128 | bits;
  return LOOKS[bits];
}
