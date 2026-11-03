import { TILE } from "./constants";
import { SHRINE_SPOT } from "./map";
import { xpForLevel } from "./classes";
import type { BuffDef } from "./skills";

/**
 * The Whispering Woods shrine (Murat 2026-11-03): an old standing stone in a clearing beside the Bandit Trail.
 * Pray at it (E) for a random boon: mending (full health and stamina), insight (some XP) or the Blessing of
 * the Wind (faster movement for a while). Then it is spent for everyone until SHRINE_COOLDOWN_MS has passed:
 * its rune stones light again one by one as it recharges.
 */
export const SHRINE = { x: (SHRINE_SPOT.x + 0.5) * TILE, y: (SHRINE_SPOT.y + 0.6) * TILE, name: "Wayshrine of the Wisp" };
export const SHRINE_RANGE = TILE * 1.4; // px from the shrine's foot to pray at it
export const SHRINE_COOLDOWN_MS = 5 * 60 * 1000;
/** Rune stones around the shrine: they relight one by one while it recharges. */
export const SHRINE_RUNES = 8;

export type Boon = "heal" | "xp" | "speed";
export const BOON_NAMES: Record<Boon, string> = { heal: "Mending", xp: "Insight", speed: "Blessing of the Wind" };

/** Blessing of the Wind: a timed buff (pushed into the hero's skill buffs, so the speed reaches movement as usual). */
export const WIND_BLESSING_ID = "shrine_wind";
export const WIND_BLESSING: BuffDef = { ms: 90 * 1000, speed: 30 };

/** XP from Insight: a third of what this level needs to reach the next one. */
export const shrineXp = (level: number) => Math.round((xpForLevel(level + 1) - xpForLevel(level)) / 3);

/** Pick a boon. Mending is left out when the hero is already at full health (it would be wasted). */
export function rollBoon(hurt: boolean, rnd = Math.random): Boon {
  const pool: Boon[] = hurt ? ["heal", "xp", "speed"] : ["xp", "speed"];
  return pool[Math.floor(rnd() * pool.length)];
}

/** Rune stones lit, from the ms left until the shrine is ready again. */
export const runesLit = (msLeft: number) =>
  msLeft <= 0 ? SHRINE_RUNES : Math.min(SHRINE_RUNES - 1, Math.floor((1 - msLeft / SHRINE_COOLDOWN_MS) * SHRINE_RUNES));
