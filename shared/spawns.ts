import { MobKind, regionMobLevel, TILE } from "./constants";
import { AREAS, isSafeZone, isSolidAt, OBJECTS, T, VILLAGE } from "./map";
import { CAMP_POSTS } from "./bandits";

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
  /** Broad wild zone: spawns skip the named areas inside it, and levels follow the distance of each spawn point. */
  wild?: boolean;
}

/** Random level within the zone's range. */
export function rollLevel(z: SpawnZone): number {
  const [lo, hi] = z.levels;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Peaceful places inside monster zones (with a margin in tiles): nothing spawns or walks in there. */
export const NO_MOB_AREAS = ["Saltmere"];
const NO_MOB_RECTS = NO_MOB_AREAS.flatMap((n) => AREAS.filter((a) => a.name === n)).map((a) => ({ x0: a.x - 2, y0: a.y - 2, x1: a.x + a.w + 2, y1: a.y + a.h + 2 }));
/** True where monsters may not go (pixel coords). */
export function noMobsAt(px: number, py: number): boolean {
  const tx = px / TILE, ty = py / TILE;
  return NO_MOB_RECTS.some((r) => tx >= r.x0 && tx < r.x1 && ty >= r.y0 && ty < r.y1);
}

/** Mother Blobs keep this many tiles away from Oakvale's stockade (Murat 2026-11-03): no spawning, no wandering in. */
export const MOTHER_KEEP_OUT = 16;
/** Distance in tiles from a pixel point to the village stockade rect (0 inside). */
export function villageDist(px: number, py: number): number {
  const v = VILLAGE, tx = px / TILE, ty = py / TILE;
  const dx = Math.max(v.x0 - tx, 0, tx - (v.x1 + 1)), dy = Math.max(v.y0 - ty, 0, ty - (v.y1 + 1));
  return Math.hypot(dx, dy);
}
/** True where a monster of this kind may not stand because it is too close to the village. */
export function tooNearVillage(kind: MobKind, px: number, py: number): boolean {
  return kind === "motherblob" && villageDist(px, py) < MOTHER_KEEP_OUT;
}

/** Monsters per area. Rects come from the map's AREAS (shared/map.ts), so zones follow the map layout. */
const ZONE_MOBS: { name: string; mobs: Partial<Record<MobKind, number>>; respawnMs: number; wild?: boolean; fixed?: boolean; levels?: [number, number] }[] = [
  // Levels come from the distance to Oakvale (see zoneLevels)
  // Blob zones above Lv 3 add shooter + warrior blobs, above Lv 5 healer blobs too.
  // Skeleton zones from Lv 5 add skeleton mages; the deepest ones (Barrow Downs, the Keep) an elite Necromancer too.
  // Blobs live in the green and wet places (meadows, fields, ponds, forests), skeletons where the dead lie (graveyards, ruins)
  { name: "North Meadow", mobs: { slime: 16, motherblob: 2 }, respawnMs: 4500 },
  { name: "Goldenreach Farms", mobs: { slime: 18, motherblob: 2 }, respawnMs: 4500 },
  { name: "Mirror Pond", mobs: { slime: 8, shooterblob: 3, warriorblob: 3, motherblob: 2 }, respawnMs: 5250 },
  { name: "Misty Marsh", mobs: { slime: 15, motherblob: 2 }, respawnMs: 4500 },
  // Set-level zones span the quest's minimum level to +3 (Murat 2026-11-04: average to difficult). Nothing regular
  // goes past REGION_LEVEL.mob (25) in this region.
  // The undead are the Pale Marshal's army (skeleton quest chain): their zones have set levels, a step tougher than
  // the blobs around them, so the chain starts mid-way through the blob story and climbs along beside it (Murat 2026-11-03).
  { name: "Stonecrag Quarry", mobs: { skeleton: 10 }, respawnMs: 7500, levels: [6, 9] },
  { name: "Old Ruins", mobs: { skeleton: 10, skeletonmage: 3 }, respawnMs: 8250, levels: [8, 11] },
  { name: "Old Watchtower", mobs: { skeleton: 7, skeletonmage: 3 }, respawnMs: 8250, levels: [10, 13] },
  // The wider world: further from Oakvale, tougher monsters
  { name: "Sunken Lake", mobs: { slime: 8, shooterblob: 4, warriorblob: 4, healerblob: 3, motherblob: 2 }, respawnMs: 6000 },
  { name: "Barrow Downs", mobs: { skeleton: 14, skeletonmage: 5, necromancer: 1 }, respawnMs: 6750, levels: [12, 15] },
  { name: "Gravemoor Cemetery", mobs: { skeleton: 14, skeletonmage: 5, necromancer: 2 }, respawnMs: 6750, levels: [15, 18] },
  { name: "Thornwood", mobs: { slime: 8, shooterblob: 6, warriorblob: 6, healerblob: 4, motherblob: 2 }, respawnMs: 6000 },
  { name: "Greywatch Keep", mobs: { skeleton: 11, skeletonmage: 5, necromancer: 2 }, respawnMs: 8250, levels: [19, 22] },
  // The coast and the far east (Saltmere itself stays monster-free, see NO_MOB_AREAS)
  // Redfang Hollow is a small organised camp (shared/bandits.ts): one bandit per post, no density scaling
  { name: "Redfang Hollow", mobs: { bandit: CAMP_POSTS.length }, respawnMs: 20000, fixed: true, levels: [19, 22] },
  // The west coast, where the Gloam's story ends (blob quests 6 and 7): set levels so the chain climbs evenly
  { name: "Brinewood", mobs: { slime: 8, shooterblob: 6, warriorblob: 6, healerblob: 5, motherblob: 2 }, respawnMs: 6000, levels: [10, 13] },
  { name: "Heronwreck Strand", mobs: { slime: 8, shooterblob: 5, warriorblob: 5, healerblob: 4, motherblob: 3 }, respawnMs: 6000, levels: [12, 15] },
  // Redfang raiders pillaging the Saltmere fishers' smokehouse (Redfang quest chain), on the coast well away from their camp
  { name: "Gullrock Cove", mobs: { bandit: 6 }, respawnMs: 12000, fixed: true, levels: [17, 20] },
  // The elemental wilds deep in the eastern woods (blob quests 8-11): each its own elemental blob, set levels from the end
  // of the Gloam's first story (Lv 12-15) up to the region's ceiling, climbing toward the Hollow Crown (Lv 24+)
  { name: "Blightmire Fen", mobs: { venomblob: 10, slime: 3, healerblob: 3, motherblob: 1 }, respawnMs: 6000, levels: [14, 17] },
  { name: "Rimewater Hollow", mobs: { frostblob: 10, warriorblob: 3, healerblob: 2, motherblob: 1 }, respawnMs: 6000, levels: [17, 20] },
  { name: "Cinder Scar", mobs: { fireblob: 10, warriorblob: 3, shooterblob: 3, motherblob: 1 }, respawnMs: 6000, levels: [20, 23] },
  { name: "Stormbreak Crags", mobs: { stormblob: 12, warriorblob: 3, shooterblob: 3, motherblob: 2 }, respawnMs: 6000, levels: [22, 25] },
  { name: "Saltwind Coast", mobs: { slime: 14, shooterblob: 5, warriorblob: 5, healerblob: 4, motherblob: 2 }, respawnMs: 4500 },
  { name: "Whispering Woods", mobs: { slime: 10, shooterblob: 4, warriorblob: 4, healerblob: 3, motherblob: 2 }, respawnMs: 5250, wild: true }, // broad areas last: zone lookups take the first match
  // Everything west of the river that no named area covers: fields, roads and woods around Oakvale
  { name: "Oakvale Countryside", mobs: { slime: 10, shooterblob: 3, warriorblob: 3, healerblob: 2, motherblob: 2 }, respawnMs: 5250, wild: true },
];
/** Wild zones that are not map areas (no banner, no map label): their rect in tiles. */
const WILD_RECTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  "Oakvale Countryside": { x: 0, y: 0, w: 109, h: 184 },
};

/**
 * Density (Murat wants monsters everywhere): every zone keeps at least one monster per this many walkable tiles.
 * Wild zones are a bit thinner than the named hunting grounds. Elites (necromancers) keep their hand-set count.
 */
export const DENSITY = { tilesPerMob: 9, wildTilesPerMob: 12 };
/** Blob variants only appear from these levels (Murat: shooter + warrior above Lv 3, healer above Lv 5). */
export const KIND_MIN_LEVEL: Partial<Record<MobKind, number>> = { shooterblob: 4, warriorblob: 4, healerblob: 6, venomblob: 12, frostblob: 14, fireblob: 16, stormblob: 18 };

/**
 * Monster levels grow with distance from the village centre: zones next to Oakvale are level 1-3,
 * and every 8 tiles further out adds a level (each zone spans 3 levels).
 */
export function zoneLevels(a: { x: number; y: number; w: number; h: number }): [number, number] {
  const lo = baseLevelAt(a.x + a.w / 2, a.y + a.h / 2);
  return [lo, lo + 2];
}
/** Lowest monster level at a tile, from its distance to the village centre (a spot spans this level to +2). */
export function baseLevelAt(tx: number, ty: number): number {
  const cx = (VILLAGE.x0 + VILLAGE.x1) / 2, cy = (VILLAGE.y0 + VILLAGE.y1) / 2;
  return 1 + Math.floor(Math.max(0, Math.hypot(tx - cx, ty - cy) - 40) / 8);
}

const inRect = (r: { x: number; y: number; w: number; h: number }, tx: number, ty: number) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h;
/** Named areas (and Oakvale's surroundings) a wild zone leaves alone: its monsters stay in their own biome. */
function claimedByArea(name: string, tx: number, ty: number): boolean {
  return AREAS.some((a) => a.name !== name && a.name !== "Whispering Woods" && a.name !== "River Ashwell" && inRect(a, tx, ty));
}
/** Tiles where this zone may spawn a monster. */
function spawnable(z: { name: string; wild?: boolean }, tx: number, ty: number): boolean {
  const v = VILLAGE;
  if (tx >= v.x0 - 2 && tx <= v.x1 + 2 && ty >= v.y0 - 2 && ty <= v.y1 + 2) return false;
  if (z.wild && claimedByArea(z.name, tx, ty)) return false;
  const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
  if (isSafeZone(x, y) || noMobsAt(x, y)) return false;
  return !isSolidAt(x - 6, y - 6) && !isSolidAt(x + 6, y + 6) && !isSolidAt(x - 6, y + 6) && !isSolidAt(x + 6, y - 6);
}

export const SPAWN_ZONES: SpawnZone[] = ZONE_MOBS.flatMap((z) => {
  const a = AREAS.find((area) => area.name === z.name) ?? WILD_RECTS[z.name];
  if (!a) return [];
  const r = { x: a.x, y: a.y, w: a.w, h: a.h };
  // Walkable tiles -> how many monsters (kinds keep their mix, elites stay as set)
  let tiles = 0, lo = 99, hi = 0;
  for (let ty = r.y; ty < r.y + r.h; ty++) for (let tx = r.x; tx < r.x + r.w; tx++) {
    if (!spawnable(z, tx, ty)) continue;
    tiles++;
    if (z.wild) { const l = baseLevelAt(tx, ty); lo = Math.min(lo, l); hi = Math.max(hi, l + 2); }
  }
  const base = Object.values(z.mobs).reduce((n, c) => n + (c ?? 0), 0);
  const want = Math.round(tiles / (z.wild ? DENSITY.wildTilesPerMob : DENSITY.tilesPerMob));
  const f = z.fixed ? 1 : Math.max(1, want / base); // fixed: hand-set count
  const mobs: Partial<Record<MobKind, number>> = {};
  for (const [k, n] of Object.entries(z.mobs) as [MobKind, number][]) mobs[k] = k === "necromancer" ? n : k === "motherblob" ? Math.max(n, Math.round(n * f / 4)) : Math.round(n * f); // big ones grow slower
  const raw: [number, number] = z.levels ?? (z.wild && hi > 0 ? [lo, hi] : zoneLevels(r));
  const levels: [number, number] = [regionMobLevel(raw[0]), regionMobLevel(raw[1])];
  return [{ ...z, ...r, mobs, levels, respawnMs: Math.max(800, Math.round(z.respawnMs / f)) }];
});

export function zoneCap(z: SpawnZone): number {
  return Object.values(z.mobs).reduce((a, b) => a + (b ?? 0), 0);
}

/** Random walkable point inside a zone (never in the village or the safe zone; wild zones skip named areas). */
export function randomPointInZone(z: SpawnZone, kind?: MobKind): { x: number; y: number } {
  for (let i = 0; i < 300; i++) {
    const tx = z.x + Math.floor(Math.random() * z.w);
    const ty = z.y + Math.floor(Math.random() * z.h);
    if (kind && tooNearVillage(kind, (tx + 0.5) * TILE, (ty + 0.5) * TILE)) continue;
    if (spawnable(z, tx, ty)) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  return { x: (z.x + z.w / 2) * TILE, y: (z.y + z.h / 2) * TILE };
}

/** Where and at what level a monster of this kind appears. In wild zones the level follows the spot. */
export function spawnPoint(z: SpawnZone, kind: MobKind): { x: number; y: number; level: number } {
  const min = KIND_MIN_LEVEL[kind] ?? 1;
  if (!z.wild) return { ...randomPointInZone(z, kind), level: regionMobLevel(Math.max(min, rollLevel(z))) };
  let best = randomPointInZone(z, kind), lvl = 0;
  for (let i = 0; i < 25; i++) {
    const p = i ? randomPointInZone(z, kind) : best;
    const l = baseLevelAt(p.x / TILE, p.y / TILE) + Math.floor(Math.random() * 3);
    if (l > lvl) { best = p; lvl = l; }
    if (l >= min) break; // variants only out where the levels are high enough
  }
  return { ...best, level: regionMobLevel(Math.max(min, lvl)) };
}

/** The monster zone a tile belongs to (wild zones leave out the named areas inside them). */
export function zoneAt(tx: number, ty: number): SpawnZone | undefined {
  return SPAWN_ZONES.find((z) => inRect(z, tx, ty) && !(z.wild && claimedByArea(z.name, tx, ty)));
}

/** Level range shown for a zone at a tile: wild zones show the local range. */
export function levelsAt(z: SpawnZone, tx: number, ty: number): [number, number] {
  if (!z.wild) return z.levels;
  const l = baseLevelAt(tx, ty);
  return [regionMobLevel(l), regionMobLevel(l + 2)];
}

/**
 * Hiding: skeletons slip into graves, slimes and bloblings into trees. A hidden monster can't be hit or seen
 * (only its eyes peek out) and jumps out when a player walks close. Dizzy (broken) monsters run for cover too.
 */
export const HIDE = {
  spots: { skeleton: [T.GRAVE], skeletonmage: [T.GRAVE], slime: [T.TREE, T.PINE], blobling: [T.TREE, T.PINE], shooterblob: [T.TREE, T.PINE], healerblob: [T.TREE, T.PINE], frostblob: [T.PINE] } as Partial<Record<MobKind, number[]>>,
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
