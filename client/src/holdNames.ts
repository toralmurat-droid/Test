import type { ClanKey } from "../../shared/war/clans";

/** What each clan calls its Hold at each tier (outpost, camp, fortress; holdTiers.ts HOLD_TIER_KEYS). */
/** Names are the clans' own words; the tier key (outpost, camp, fortress) is shown beside them. */
export const FORT: Record<ClanKey, [string, string, string]> = {
  wardens: ["Watch post", "Palisade fort", "Warden keep"],
  redfang: ["Raider tents", "war camp", "Fang citadel"],
  host: ["Charnel picket", "Bone keep", "Ossuary citadel"],
  hidekin: ["Burrow den", "Burrow-fort", "Deep warren"],
  veiled: ["Veil shrine", "Sanctum", "Moonless spire"],
};
