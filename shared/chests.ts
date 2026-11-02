import { ROADS, T, AREAS, Area, GROUND, OBJECTS, EMPTY, SAFE_ZONE, VILLAGE, areaInfoAt, isSolidTile } from "./map";
import { MAP_W, MAP_H, TILE } from "./constants";
import { zoneLevels } from "./spawns";
import { GEAR, GEAR_IDS, LOOT_LEVEL } from "./gear";

/**
 * Loot chests scattered over the world. Placement is deterministic (seeded), so server and clients agree.
 * Each account opens a chest once; it refills CHEST_RESPAWN_MS later (one day/night cycle).
 * Loot scales with the chest level, which follows the zone level (distance from Oakvale, see zoneLevels).
 */
export type ChestTier = 1 | 2 | 3; // wooden, iron-bound, gilded
export interface Chest { id: string; x: number; y: number; level: number; tier: ChestTier; area: string }

export const CHEST_RANGE = TILE * 1.1; // px from the chest's feet to open it
export const CHEST_RESPAWN_MS = 30 * 60 * 1000;
export const CHEST_NAMES = ["", "Wooden Chest", "Iron-bound Chest", "Gilded Chest"];

export const chestTier = (level: number): ChestTier => (level >= 11 ? 3 : level >= 5 ? 2 : 1);

/** Tiny seeded random generator (mulberry32) so the layout never changes between builds. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PATHS = new Set<number>([T.DIRT, T.COBBLE, T.BRIDGE, T.WATER]);
/** A good spot: open ground (not a road), free all around, but with something (tree, rock, wall) close by to tuck against. */
function goodSpot(tx: number, ty: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (isSolidTile(tx + dx, ty + dy) || PATHS.has(GROUND[ty + dy]?.[tx + dx])) return false;
  }
  if (OBJECTS[ty][tx] !== EMPTY) return false; // not inside a bush
  let cover = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (isSolidTile(tx + dx, ty + dy)) cover++;
  return cover >= 2 && cover <= 9;
}

/** How many chests an area gets: by size, at least one, more in the huge wild areas. */
function chestCount(a: Area): number {
  return Math.max(1, Math.min(a.name === "Whispering Woods" ? 9 : a.name === "Saltwind Coast" ? 5 : 3, Math.round((a.w * a.h) / 260)));
}

/** Towns get no chests (nothing to loot in a safe street). */
const VILLAGE_AREAS = new Set(["Market Square", "Chapel of the Dawn", "The Rusty Tankard", "The Smithy", "Oakvale", "River Ashwell", "Saltmere"]);

function placeChests(): Chest[] {
  const rnd = seeded(0xc4e57);
  const out: Chest[] = [];
  const far = (tx: number, ty: number, d: number) => out.every((c) => Math.hypot(c.x / TILE - tx, c.y / TILE - ty) >= d);
  for (const a of AREAS) {
    if (VILLAGE_AREAS.has(a.name)) continue;
    const [, hi] = zoneLevels(a);
    const want = chestCount(a);
    const minGap = Math.max(6, Math.min(24, Math.sqrt((a.w * a.h) / want) * 0.6));
    let placed = 0;
    for (let tries = 0; tries < 4000 && placed < want; tries++) {
      const tx = a.x + 1 + Math.floor(rnd() * Math.max(1, a.w - 2));
      const ty = a.y + 1 + Math.floor(rnd() * Math.max(1, a.h - 2));
      if (tx < 2 || ty < 2 || tx >= MAP_W - 2 || ty >= MAP_H - 2) continue;
      const x = (tx + 0.5) * TILE, y = (ty + 0.6) * TILE;
      if (areaInfoAt(x, y) !== a || !goodSpot(tx, ty) || !far(tx, ty, minGap)) continue;
      if (tx >= VILLAGE.x0 - 3 && tx <= VILLAGE.x1 + 3 && ty >= VILLAGE.y0 - 3 && ty <= VILLAGE.y1 + 3) continue;
      if (Math.hypot(tx - ROADS.RX, ty - ROADS.RY) < 20 || (tx >= SAFE_ZONE.x && ty >= SAFE_ZONE.y && tx < SAFE_ZONE.x + SAFE_ZONE.w && ty < SAFE_ZONE.y + SAFE_ZONE.h)) continue;
      // Wilder spots further inside an area are a touch richer
      const level = Math.max(1, hi + (rnd() < 0.3 ? 1 : 0));
      out.push({ id: `c${out.length + 1}`, x, y, level, tier: chestTier(level), area: a.name });
      placed++;
    }
  }
  return out;
}

export const CHESTS: Chest[] = placeChests();
export const chestById = (id: unknown) => CHESTS.find((c) => c.id === id);

export interface ChestLoot { gold: number; potions: number; gear: string[] }

/**
 * Chest contents for a chest level. Gold grows with level, potions are likely, and there is a good chance of gear
 * whose tier odds use the same level rules as monster loot (LOOT_LEVEL in gear.ts), a bit kinder.
 */
export function rollChest(level: number, tier: ChestTier, rnd = Math.random): ChestLoot {
  const n = Math.max(0, level - 1), L = LOOT_LEVEL;
  const gold = Math.round((12 + 7 * level) * (0.8 + rnd() * 0.5) * (1 + 0.25 * (tier - 1)));
  const potions = (rnd() < Math.min(0.9, 0.45 + 0.04 * n) ? 1 : 0) + (rnd() < Math.min(0.5, 0.1 + 0.02 * n) ? 1 : 0);
  const gearChance = Math.min(0.95, 0.4 + 0.04 * n + 0.15 * (tier - 1));
  const gear: string[] = [];
  const pieces = (rnd() < gearChance ? 1 : 0) + (tier === 3 && rnd() < 0.35 ? 1 : 0);
  for (let i = 0; i < pieces; i++) {
    const epic = Math.min(L.maxEpic, 0.03 + L.epic * n + (tier === 3 ? 0.08 : 0));
    const rare = Math.min(L.maxRare, 0.15 + L.rare * n);
    const r = rnd();
    const t = r < epic ? 3 : r < epic + rare ? 2 : 1;
    const pool = GEAR_IDS.filter((id) => GEAR[id].tier === t);
    gear.push(pool[Math.floor(rnd() * pool.length)]);
  }
  return { gold, potions, gear };
}
