/**
 * Fort ground (Murat 2026-11-17: "there shouldn't be any mobs inside the forts, these should be protected by the clan
 * controlling them"): every tile any clan's fort at any tier could cover at a Hold (holdWalls.ts holdTiles: walls, gates,
 * gaps and courtyard), plus a margin round it. Wild monsters neither spawn nor walk onto it (server/TownRoom.ts spawnMob
 * and canStep), and one whose home lies on it gets a new home outside (server/holdWalls.ts); the holding clan's troopers,
 * heroes' summons and quest monsters still go in (isWildMob).
 *
 * The mask is fixed (the same whoever holds the land and at whatever tier), so a Hold that changes hands or grows never
 * lets a wild monster in, and it is built once from the map alone (deterministic, no seed). It imports shared/spawns.ts,
 * never the other way round (territories.ts is built from SPAWN_ZONES).
 */
import { MAP_H, MAP_W, TILE, type MobKind } from "../constants";
import { isSafeZone, isSolidTile } from "../map";
import { spawnPoint, type SpawnZone } from "../spawns";
import { holdTiles } from "./holdWalls";
import { HOLDS } from "./standards";

/** Tiles of open ground kept round each fort's outline, so a wild monster never brushes its walls or gates either. */
export const FORT_GROUND_MARGIN = 1;
/** How many spawn points a wild monster's spawn rolls before it gives up on a zone that is mostly fort ground. */
export const FORT_SPAWN_TRIES = 12;

let MASK: Uint8Array | undefined;
function mask(): Uint8Array {
  if (MASK) return MASK;
  const g = new Uint8Array(MAP_W * MAP_H), r = FORT_GROUND_MARGIN;
  for (const h of HOLDS) for (const k of holdTiles(h.t)) {
    const tx = k % MAP_W, ty = (k - tx) / MAP_W;
    for (let y = Math.max(0, ty - r); y <= Math.min(MAP_H - 1, ty + r); y++)
      for (let x = Math.max(0, tx - r); x <= Math.min(MAP_W - 1, tx + r); x++) g[y * MAP_W + x] = 1;
  }
  return (MASK = g);
}

/** Is tile (tx, ty) fort ground (any clan's fort at any tier, or its margin)? */
export function fortGroundTile(tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && mask()[ty * MAP_W + tx] === 1;
}
/** Is pixel (px, py) on fort ground? */
export const fortGroundAt = (px: number, py: number): boolean => fortGroundTile(Math.floor(px / TILE), Math.floor(py / TILE));

/** The parts of a monster isWildMob reads (TownRoom's Mob). */
export interface FortMob { kind: string; owner: string; summonFor: string; tide?: boolean; camp?: boolean; guard?: string }
/**
 * A wild monster: kept off fort ground. Not wild: a clan's trooper, a hero's summon or charmed monster (owner), a quest
 * monster (summonFor), a Gloam Tide marcher (it follows its march round the walls; server/tide.ts), and the monsters
 * whose posts were there before the Holds: Redfang camp bandits (the Hollow, Fangrock and Hidehall Holds stand in their
 * camps, shared/bandits.ts) and lair chest guardians (a few lair chests lie in a Hold's courtyard, shared/chests.ts).
 */
export const isWildMob = (m: FortMob): boolean => m.kind !== "trooper" && !m.owner && !m.summonFor && !m.tide && !m.camp && !m.guard;

/** The nearest open tile centre (px) off fort ground within maxTiles of (px, py): where a wild monster's home moves. */
export function nearestOffFort(px: number, py: number, maxTiles = 16): { x: number; y: number } | undefined {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  let best: { x: number; y: number } | undefined, bd = Infinity;
  for (let r = 0; r <= maxTiles; r++) {
    if (best && bd <= r * TILE - TILE) break; // nothing in a farther ring can be nearer
    for (let j = ty - r; j <= ty + r; j++) for (let i = tx - r; i <= tx + r; i++) {
      if (Math.max(Math.abs(i - tx), Math.abs(j - ty)) !== r || fortGroundTile(i, j) || isSolidTile(i, j)) continue;
      const cx = (i + 0.5) * TILE, cy = (j + 0.5) * TILE, d = Math.hypot(cx - px, cy - py);
      if (d < bd && !isSafeZone(cx, cy)) { bd = d; best = { x: cx, y: cy }; }
    }
  }
  return best;
}

/** A spawn point in zone z that is not fort ground (FORT_SPAWN_TRIES rolls), or null when every roll landed on one. */
export function wildSpawnPoint(z: SpawnZone, kind: MobKind, ok: (x: number, y: number) => boolean = () => true): { x: number; y: number; level: number } | null {
  for (let i = 0; i < FORT_SPAWN_TRIES; i++) {
    const pt = spawnPoint(z, kind);
    if (!fortGroundAt(pt.x, pt.y) && ok(pt.x, pt.y)) return pt;
  }
  return null;
}
