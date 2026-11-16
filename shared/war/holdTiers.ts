/**
 * Holds grow with their garrison (W3, Murat 2026-11-16): a land its holder keeps quietly grows from an outpost into a camp
 * and then a fortress (bigger walls in the clan's own style, more guards: holdWalls.ts planOf, patrols.ts garrisonCount);
 * a shaken land (Control down) shrinks back and a taken land starts again as an outpost. The tier is read from values the
 * war already keeps and saves: WarState.fort (built-up time, grown on quiet ticks, reset by a flip, cut by a sack) and the
 * holder's Control. So it needs no save field, changes only on a war tick or a sack, and shows a fight value the war sim
 * already uses (defence x (1 + fort)). A clan's capital is always a fortress. A front land (one bordering a land held by a
 * clan its holder is at war with, feuds.ts atWar) is at most a camp: the fortresses stand in the quiet inner lands, and
 * the map shows where the front runs. Display and guards only: the war sim does not read the tier.
 */
import type { ClanKey } from "./clans";
import { atWar } from "./feuds";
import { TERRITORIES } from "./territories";
import { WAR, type WarState } from "./rules";

/** Are two clans at war (feuds.ts atWar: the live relations, the server's or, on the client, WarView.wars)? */
export type AtWar = (a: ClanKey, b: ClanKey) => boolean;
type TierState = Pick<WarState, "owner" | "fort" | "control">;

/** 0 outpost, 1 camp, 2 fortress. */
export type HoldTier = 0 | 1 | 2;
export const HOLD_TIERS: readonly HoldTier[] = [0, 1, 2];
/** Code names of the tiers (the names players read come per clan from the client). */
export const HOLD_TIER_KEYS = ["outpost", "camp", "fortress"] as const;

/**
 * The thresholds. A camp needs `fort` >= camp.fort (20 quiet ticks: 3 h 20 min, the Wardens half) and Control above
 * WAR.siegeAt (a besieged Hold is an outpost); a fortress needs `fort` >= fortress.fort (60 quiet ticks: 10 h, the
 * Wardens half) and Control >= fortress.control.
 */
export const HOLD_TIER = {
  camp: { fort: 0.2, control: WAR.siegeAt },
  fortress: { fort: 0.6, control: 50 },
};

/** Does territory t border a land held by a clan its holder is at war with? */
export function frontLand(s: Pick<WarState, "owner">, t: number, war: AtWar = atWar): boolean {
  const own = s.owner[t];
  return !!own && !!TERRITORIES[t]?.near.some((n) => { const o = s.owner[n]; return !!o && o !== own && war(own, o); });
}

/** Tier of territory t's Hold in war state `s` (no holder: an outpost; a front land: a camp at most). `war`: the clans at war. */
export function holdTier(s: TierState, t: number, war: AtWar = atWar): HoldTier {
  const own = s.owner[t];
  if (!own) return 0;
  if (TERRITORIES[t]?.capitalOf === own) return 2;
  const fort = Number.isFinite(s.fort[t]) ? s.fort[t] : 0, control = Number.isFinite(s.control[t]) ? s.control[t] : 0;
  if (fort >= HOLD_TIER.fortress.fort && control >= HOLD_TIER.fortress.control && !frontLand(s, t, war)) return 2;
  return fort >= HOLD_TIER.camp.fort && control > HOLD_TIER.camp.control ? 1 : 0;
}

/** Every territory's Hold tier, by territory id (what WarView.tier carries and holdWalls.ts setHoldOwners takes). */
export const holdTiers = (s: TierState, war: AtWar = atWar): HoldTier[] => s.owner.map((_, t) => holdTier(s, t, war));

/**
 * Did territory t's Hold grow by building (its `fort` crossed a tier's threshold) between `before` and `after`, with the
 * same holder? Returns the new tier (camp or fortress) for the Herald, else undefined. A Hold that only regains a tier as
 * its Control recovers is not announced again (a front land near the siege line would be every other tick).
 */
export function holdGrew(before: TierState, after: TierState, t: number, war: AtWar = atWar): HoldTier | undefined {
  if (!after.owner[t] || before.owner[t] !== after.owner[t]) return undefined;
  const was = holdTier(before, t, war), now = holdTier(after, t, war);
  if (now <= was) return undefined;
  const need = now === 2 ? HOLD_TIER.fortress.fort : HOLD_TIER.camp.fort;
  return (before.fort[t] ?? 0) < need && (after.fort[t] ?? 0) >= need ? now : undefined;
}
