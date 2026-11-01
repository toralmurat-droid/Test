import { MobKind, TILE } from "./constants";
import { AREAS, isSafeZone, isSolidAt, VILLAGE } from "./map";

/**
 * Monster spawn zones. Each zone keeps up to `mobs[kind]` monsters alive. Every `respawnMs` its timer fires
 * and brings back ONE missing monster (so a cleared zone refills gradually, not all at once).
 * Rects are in tiles; names match the map areas shown in the area banner.
 */
export interface SpawnZone {
  name: string;
  x: number; y: number; w: number; h: number;
  mobs: Partial<Record<MobKind, number>>;
  levels: [number, number]; // min, max monster level in this zone
  respawnMs: number;
}

/** Random level within the zone's range. */
export function rollLevel(z: SpawnZone): number {
  const [lo, hi] = z.levels;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Monsters per area. Rects come from the map's AREAS (shared/map.ts), so zones follow the map layout. */
const ZONE_MOBS: { name: string; mobs: Partial<Record<MobKind, number>>; respawnMs: number }[] = [
  // Levels come from the distance to Oakvale (see zoneLevels)
  { name: "North Meadow", mobs: { slime: 11, motherblob: 1 }, respawnMs: 6000 },
  { name: "Goldenreach Farms", mobs: { slime: 12, motherblob: 1 }, respawnMs: 6000 },
  { name: "Mirror Pond", mobs: { slime: 8, motherblob: 1 }, respawnMs: 7000 },
  { name: "Misty Marsh", mobs: { slime: 10, motherblob: 2 }, respawnMs: 6000 },
  { name: "Stonecrag Quarry", mobs: { slime: 3, skeleton: 5 }, respawnMs: 10000 },
  { name: "Old Ruins", mobs: { skeleton: 7 }, respawnMs: 12000 },
  { name: "Old Watchtower", mobs: { skeleton: 5 }, respawnMs: 12000 },
  // The wider world: further from Oakvale, tougher monsters
  { name: "Sunken Lake", mobs: { slime: 10, motherblob: 2 }, respawnMs: 8000 },
  { name: "Barrow Downs", mobs: { skeleton: 9 }, respawnMs: 10000 },
  { name: "Thornwood", mobs: { slime: 6, skeleton: 6, motherblob: 1 }, respawnMs: 9000 },
  { name: "Greywatch Keep", mobs: { skeleton: 10 }, respawnMs: 11000 },
  { name: "Whispering Woods", mobs: { slime: 9, skeleton: 6, motherblob: 1 }, respawnMs: 8000 }, // broad area last: zone lookups take the first match
];

/**
 * Monster levels grow with distance from the village centre: zones next to Oakvale are level 1-3,
 * and every 8 tiles further out adds a level (each zone spans 3 levels).
 */
export function zoneLevels(a: { x: number; y: number; w: number; h: number }): [number, number] {
  const cx = (VILLAGE.x0 + VILLAGE.x1) / 2, cy = (VILLAGE.y0 + VILLAGE.y1) / 2;
  const d = Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy);
  const lo = 1 + Math.floor(Math.max(0, d - 40) / 8);
  return [lo, lo + 2];
}

export const SPAWN_ZONES: SpawnZone[] = ZONE_MOBS.flatMap((z) => {
  const a = AREAS.find((area) => area.name === z.name);
  return a ? [{ ...z, levels: zoneLevels(a), x: a.x, y: a.y, w: a.w, h: a.h }] : [];
});

export function zoneCap(z: SpawnZone): number {
  return Object.values(z.mobs).reduce((a, b) => a + (b ?? 0), 0);
}

/** Random walkable point inside a zone (never in the village or the safe zone). */
export function randomPointInZone(z: SpawnZone): { x: number; y: number } {
  const v = VILLAGE;
  for (let i = 0; i < 200; i++) {
    const tx = z.x + Math.floor(Math.random() * z.w);
    const ty = z.y + Math.floor(Math.random() * z.h);
    if (tx >= v.x0 - 2 && tx <= v.x1 + 2 && ty >= v.y0 - 2 && ty <= v.y1 + 2) continue;
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (isSafeZone(x, y)) continue;
    if (!isSolidAt(x - 6, y - 6) && !isSolidAt(x + 6, y + 6) && !isSolidAt(x - 6, y + 6) && !isSolidAt(x + 6, y - 6)) return { x, y };
  }
  return { x: (z.x + z.w / 2) * TILE, y: (z.y + z.h / 2) * TILE };
}
