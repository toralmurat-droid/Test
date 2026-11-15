import { TILE } from "./constants";
import { npcById } from "./npcs";
import { PORTAL_COMBAT_MS } from "./portals";
import { chainDone, RED_CHAIN, type Quester } from "./quests";
import { SALT_JETTIES } from "./saltmere";

/**
 * Pell's ferry (Saltmere rework phase 7, owner 2026-11-15): once "The Redfang Chief" is down, Garrick's grandson rows a
 * hero between Saltmere's Harbour Street pier, the Gullrock Cove jetty and the Heronwreck Strand jetty for a small fee.
 * It saves the walk along the coast between places already reached, so, like a portal stone, it is no escape from a
 * fight. The server (server/ferry.ts) decides every ride; the client only asks for one.
 */
export type FerryStopId = keyof typeof SALT_JETTIES;
export interface FerryStop {
  id: FerryStopId;
  name: string;
  /** The jetty head (map tiles): the plank T over the water where the boat ties up. */
  tile: { x: number; y: number };
  /** Where a hero steps off (px): the centre of the plank one tile landward of the head, always walkable. */
  x: number;
  y: number;
}

/** Every jetty runs north to the beach, so one tile up from the head is a step toward land. */
const stop = (id: FerryStopId, name: string): FerryStop => {
  const t = SALT_JETTIES[id];
  return { id, name, tile: { x: t.x, y: t.y }, x: (t.x + 0.5) * TILE, y: (t.y - 0.5) * TILE };
};
/** The three stops, home port first (the order a dialog lists them in). */
export const FERRY_STOPS: readonly FerryStop[] = [
  stop("saltmere", "Saltmere"),
  stop("gullrock", "Gullrock Cove"),
  stop("heronwreck", "Heronwreck Strand"),
];
/** A stop by id, for the server's payload check and the client's list (unknown input gives undefined). */
export const ferryStopById = (id: unknown): FerryStop | undefined => FERRY_STOPS.find((s) => s.id === id);

/** Gold per leg, any two stops: a small fee (owner: 10-20 gold), so a ride is a convenience, not a gold sink. */
export const FERRY_FEE = 12;
/**
 * How close (px) a hero must stand to a stop's jetty head, or to Pell for the Saltmere stop (his boat is at the pier
 * root; the head is six tiles out). Wide enough to cover the 3-tile T head and the arrival plank.
 */
export const FERRY_RANGE = TILE * 2.5;
/** No ride this soon after taking a hit: the same rule, and the same number, as a portal stone. */
export const FERRY_COMBAT_MS = PORTAL_COMBAT_MS;

const PELL = npcById("pell")!;

/** Pell is back at his boat, and rows, once the Redfang chain is done (the same gate as his PRESENCE in shared/quests.ts). */
export const ferryOpen = (p: Quester | undefined) => chainDone(p, RED_CHAIN);

/** The stop a hero at pixel (x, y) can board from, if any. `range` lets the server allow some lag slack. */
export function ferryStopNear(x: number, y: number, range = FERRY_RANGE): FerryStop | undefined {
  let best: FerryStop | undefined, bd = range;
  for (const s of FERRY_STOPS) {
    const d = Math.min(Math.hypot((s.tile.x + 0.5) * TILE - x, (s.tile.y + 0.5) * TILE - y), Math.hypot(s.x - x, s.y - y),
      s.id === "saltmere" ? Math.hypot(PELL.x - x, PELL.y - y) : Infinity);
    if (d <= bd) { bd = d; best = s; }
  }
  return best;
}
