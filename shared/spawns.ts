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
  respawnMs: number;
}

/** Monsters per area. Rects come from the map's AREAS (shared/map.ts), so zones follow the map layout. */
const ZONE_MOBS: { name: string; mobs: Partial<Record<MobKind, number>>; respawnMs: number }[] = [
  { name: "North Meadow", mobs: { slime: 5 }, respawnMs: 10000 },
  { name: "Goldenreach Farms", mobs: { slime: 4 }, respawnMs: 12000 },
  { name: "Mirror Pond", mobs: { slime: 3 }, respawnMs: 12000 },
  { name: "Misty Marsh", mobs: { slime: 4 }, respawnMs: 12000 },
  { name: "Stonecrag Quarry", mobs: { slime: 1, skeleton: 3 }, respawnMs: 16000 },
  { name: "Old Ruins", mobs: { skeleton: 4 }, respawnMs: 20000 },
  { name: "Old Watchtower", mobs: { skeleton: 3 }, respawnMs: 20000 },
  { name: "Whispering Woods", mobs: { slime: 3, skeleton: 3 }, respawnMs: 15000 }, // broad area last: zone lookups take the first match
];

export const SPAWN_ZONES: SpawnZone[] = ZONE_MOBS.flatMap((z) => {
  const a = AREAS.find((area) => area.name === z.name);
  return a ? [{ ...z, x: a.x, y: a.y, w: a.w, h: a.h }] : [];
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
