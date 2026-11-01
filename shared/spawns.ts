import { MobKind, TILE } from "./constants";
import { isSafeZone, isSolidAt, VILLAGE } from "./map";

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

export const SPAWN_ZONES: SpawnZone[] = [
  { name: "North Meadow", x: 24, y: 1, w: 42, h: 11, mobs: { slime: 5 }, respawnMs: 10000 },
  { name: "Goldenreach Farms", x: 3, y: 26, w: 18, h: 28, mobs: { slime: 4 }, respawnMs: 12000 },
  { name: "Mirror Pond", x: 3, y: 56, w: 16, h: 12, mobs: { slime: 3 }, respawnMs: 12000 },
  { name: "Southern Fields", x: 22, y: 59, w: 44, h: 11, mobs: { slime: 3, skeleton: 1 }, respawnMs: 14000 },
  { name: "Whispering Woods", x: 80, y: 1, w: 15, h: 26, mobs: { slime: 2, skeleton: 3 }, respawnMs: 15000 },
  { name: "Old Ruins", x: 81, y: 29, w: 14, h: 14, mobs: { skeleton: 4 }, respawnMs: 20000 },
];

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
