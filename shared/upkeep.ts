// Gold sinks: gear wear with repairs at the smith, and paid resets of stat points and the skill tree.
// Wear belongs to the hero (not to each item), so swapping gear can never "repair" it for free.
import { gearPrice } from "./shops";

/** Each death wears the hero's gear by `perDeath` points (0-100). Worn gear gives up to `statLoss` less of its stats. */
export const WEAR = { perDeath: 10, max: 100, statLoss: 0.5 } as const;

/** Multiplier on the stats equipped gear gives, at this wear (1 = like new, 0.5 = fully worn). */
export const wearMult = (wear: number) => 1 - WEAR.statLoss * Math.min(WEAR.max, Math.max(0, wear || 0)) / WEAR.max;

/** A full repair (wear 100 -> 0) costs this share of what the equipped gear is worth at the shop. */
export const REPAIR_RATE = 0.15;

/** Gold to repair all equipped gear (0 when nothing is worn or nothing is equipped). */
export function repairCost(equipped: Iterable<string | undefined>, wear: number): number {
  const w = Math.min(WEAR.max, Math.max(0, wear || 0));
  if (!w) return 0;
  let worth = 0;
  for (const id of equipped) if (id) worth += gearPrice(id);
  return worth ? Math.max(1, Math.round(worth * REPAIR_RATE * w / WEAR.max)) : 0;
}

/** Resetting stat points or the skill tree: free up to `freeUpTo`, then `perLevel` gold per hero level, each. */
export const RESPEC = { freeUpTo: 5, perLevel: 15 } as const;
export const respecCost = (level: number) => (level <= RESPEC.freeUpTo ? 0 : RESPEC.perLevel * level);
