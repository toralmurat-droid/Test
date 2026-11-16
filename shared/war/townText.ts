/**
 * What the town stewards say (W6, shared/war/towns.ts): a steward per capturable town, whose name, look and lines follow
 * the town's holder. PLACEHOLDER lines for now: the content writer fills the clan x town names and the talk lines.
 * Pure data; the client picks a line by the hero and the towns view.
 */
import type { ClanKey } from "./clans";
import type { TownId } from "./towns";

/** The steward's name per clan and town (placeholders). */
export const STEWARD_NAMES: Record<ClanKey, Record<TownId, string>> = {
  wardens: { saltmere: "Warden Steward", rustwater: "Warden Steward", ropewell: "Warden Steward", millbrook: "Warden Reeve" },
  redfang: { saltmere: "Redfang Steward", rustwater: "Redfang Steward", ropewell: "Redfang Steward", millbrook: "Redfang Reeve" },
  host: { saltmere: "Ossuary Steward", rustwater: "Ossuary Steward", ropewell: "Ossuary Steward", millbrook: "Ossuary Reeve" },
  hidekin: { saltmere: "Hide-Kin Steward", rustwater: "Hide-Kin Steward", ropewell: "Hide-Kin Steward", millbrook: "Hide-Kin Reeve" },
  veiled: { saltmere: "Veiled Steward", rustwater: "Veiled Steward", ropewell: "Veiled Steward", millbrook: "Veiled Reeve" },
};

/** Talk lines per clan; `{town}` is the town's name (placeholders). */
export const STEWARD_LINES: Record<ClanKey, string[]> = {
  wardens: ["{town} is under the Wardens' care. Trade freely."],
  redfang: ["{town} pays the Compact now. Keep the peace and so will we."],
  host: ["The Host keeps {town}. The living may go about their business."],
  hidekin: ["The Hide-Kin hold {town}. Mind your feet and your purse."],
  veiled: ["{town} rests under the Veil. Be welcome."],
};
/** Said to a hero the holder wants (feuds.ts Wanted): a cold word, nothing more. */
export const STEWARD_WANTED = "I know your face. Do your business and go.";
/** Said while the town is contested; `{by}` is the contesting clan's name. */
export const STEWARD_CONTESTED = "{by} are at the gate. Nothing is settled yet.";
/** Said by the steward's own clan's sworn heroes: they get the discount. */
export const STEWARD_SWORN = "One of ours. The traders here give you a better price.";

/** The steward's name for this town and holder. */
export const stewardName = (k: ClanKey, town: TownId): string => STEWARD_NAMES[k]?.[town] ?? "Steward";
/** A talk line (picked by `seed`), with the town's name filled in. */
export function stewardLine(k: ClanKey, townName: string, seed = 0): string {
  const ls = STEWARD_LINES[k] ?? [];
  return (ls[Math.abs(Math.floor(seed)) % Math.max(1, ls.length)] ?? "").replace(/\{town\}/g, townName);
}
/** The steward's character sheet for a holder (client/public/assets/characters: steward_<clan>, steward_neutral). */
export const stewardSprite = (k?: ClanKey): string => `steward_${k ?? "neutral"}`;
