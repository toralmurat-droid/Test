import { MobKind, TILE } from "./constants";
import { AREAS, isSafeZone, isSolidAt, OBJECTS, T, VILLAGE } from "./map";

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
  // Blob zones above Lv 3 add shooter + warrior blobs, above Lv 5 healer blobs too.
  // Skeleton zones from Lv 5 add skeleton mages; the deepest ones (Barrow Downs, the Keep) an elite Necromancer too.
  // Blobs live in the green and wet places (meadows, fields, ponds, forests), skeletons where the dead lie (graveyards, ruins)
  { name: "North Meadow", mobs: { slime: 16, motherblob: 2 }, respawnMs: 4500 },
  { name: "Goldenreach Farms", mobs: { slime: 18, motherblob: 2 }, respawnMs: 4500 },
  { name: "Mirror Pond", mobs: { slime: 8, shooterblob: 3, warriorblob: 3, motherblob: 2 }, respawnMs: 5250 },
  { name: "Misty Marsh", mobs: { slime: 15, motherblob: 2 }, respawnMs: 4500 },
  { name: "Stonecrag Quarry", mobs: { skeleton: 10 }, respawnMs: 7500 },
  { name: "Old Ruins", mobs: { skeleton: 12 }, respawnMs: 8250 },
  { name: "Old Watchtower", mobs: { skeleton: 7, skeletonmage: 3 }, respawnMs: 8250 },
  // The wider world: further from Oakvale, tougher monsters
  { name: "Sunken Lake", mobs: { slime: 8, shooterblob: 4, warriorblob: 4, healerblob: 3, motherblob: 2 }, respawnMs: 6000 },
  { name: "Barrow Downs", mobs: { skeleton: 14, skeletonmage: 5, necromancer: 1 }, respawnMs: 6750 },
  { name: "Thornwood", mobs: { slime: 8, shooterblob: 6, warriorblob: 6, healerblob: 4, motherblob: 2 }, respawnMs: 6000 },
  { name: "Greywatch Keep", mobs: { skeleton: 11, skeletonmage: 5, necromancer: 2 }, respawnMs: 8250 },
  // The coast and the far east (Saltmere itself stays monster-free, see NO_MOB_AREAS)
  { name: "Redfang Hollow", mobs: { bandit: 14 }, respawnMs: 6000 },
  { name: "Saltwind Coast", mobs: { slime: 14, shooterblob: 5, warriorblob: 5, healerblob: 4, motherblob: 2 }, respawnMs: 4500 },
  { name: "Whispering Woods", mobs: { slime: 10, shooterblob: 4, warriorblob: 4, healerblob: 3, motherblob: 2 }, respawnMs: 5250 }, // broad area last: zone lookups take the first match
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

/** Peaceful places inside monster zones (with a margin in tiles): nothing spawns or walks in there. */
export const NO_MOB_AREAS = ["Saltmere"];
const NO_MOB_RECTS = NO_MOB_AREAS.flatMap((n) => AREAS.filter((a) => a.name === n)).map((a) => ({ x0: a.x - 2, y0: a.y - 2, x1: a.x + a.w + 2, y1: a.y + a.h + 2 }));
/** True where monsters may not go (pixel coords). */
export function noMobsAt(px: number, py: number): boolean {
  const tx = px / TILE, ty = py / TILE;
  return NO_MOB_RECTS.some((r) => tx >= r.x0 && tx < r.x1 && ty >= r.y0 && ty < r.y1);
}

/** Random walkable point inside a zone (never in the village or the safe zone). */
export function randomPointInZone(z: SpawnZone): { x: number; y: number } {
  const v = VILLAGE;
  for (let i = 0; i < 200; i++) {
    const tx = z.x + Math.floor(Math.random() * z.w);
    const ty = z.y + Math.floor(Math.random() * z.h);
    if (tx >= v.x0 - 2 && tx <= v.x1 + 2 && ty >= v.y0 - 2 && ty <= v.y1 + 2) continue;
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (isSafeZone(x, y) || noMobsAt(x, y)) continue;
    if (!isSolidAt(x - 6, y - 6) && !isSolidAt(x + 6, y + 6) && !isSolidAt(x - 6, y + 6) && !isSolidAt(x + 6, y - 6)) return { x, y };
  }
  return { x: (z.x + z.w / 2) * TILE, y: (z.y + z.h / 2) * TILE };
}

/**
 * Hiding: skeletons slip into graves, slimes and bloblings into trees. A hidden monster can't be hit or seen
 * (only its eyes peek out) and jumps out when a player walks close. Dizzy (broken) monsters run for cover too.
 */
export const HIDE = {
  spots: { skeleton: [T.GRAVE], skeletonmage: [T.GRAVE], slime: [T.TREE, T.PINE], blobling: [T.TREE, T.PINE], shooterblob: [T.TREE, T.PINE], healerblob: [T.TREE, T.PINE] } as Partial<Record<MobKind, number[]>>,
  idleChance: 0.06, // per wander decision, chance an idle monster goes to hide
  idleRadius: 7, // tiles from home to look for a spot
  fleeRadius: 6, // tiles from the monster when it's dizzy
  ambushRange: 40, // px: a player this close makes a hidden monster jump out
  minMs: 10000, maxMs: 25000, // how long it stays hidden if nobody comes by
  regenPerSec: 0.04, // fraction of max HP healed per second while hidden
  seekMs: 7000, // give up walking to a spot after this long
};

export interface HideSpot { key: string; x: number; y: number; outX: number; outY: number }

/** Nearest free hiding spot for `kind` within `radius` tiles of (px,py), with a walkable tile next to it to step in from. */
export function findHideSpot(kind: MobKind, px: number, py: number, radius: number, taken: Set<string>): HideSpot | undefined {
  const ids = HIDE.spots[kind];
  if (!ids) return undefined;
  const cx = Math.floor(px / TILE), cy = Math.floor(py / TILE);
  let best: HideSpot | undefined, bestD = Infinity;
  for (let ty = cy - radius; ty <= cy + radius; ty++) {
    for (let tx = cx - radius; tx <= cx + radius; tx++) {
      const o = OBJECTS[ty]?.[tx];
      if (o === undefined || !ids.includes(o) || taken.has(`${tx},${ty}`)) continue;
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
      if (isSafeZone(x, y)) continue;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const ox = x + dx * TILE, oy = y + dy * TILE;
        if (isSafeZone(ox, oy) || isSolidAt(ox - 5, oy - 5) || isSolidAt(ox + 5, oy + 5) || isSolidAt(ox - 5, oy + 5) || isSolidAt(ox + 5, oy - 5)) continue;
        const d = Math.hypot(ox - px, oy - py);
        if (d < bestD) { bestD = d; best = { key: `${tx},${ty}`, x, y, outX: ox, outY: oy }; }
      }
    }
  }
  return best;
}
