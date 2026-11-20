/**
 * What the town stewards say (W6, shared/war/towns.ts): a steward per capturable town, whose name, look and lines follow
 * the town's holder. Each clan has its own voice (Wardens a stern reeve, Redfang a scarred quartermaster, Host an ossuary clerk, Hide-Kin a burrow-warden, Veiled a masked envoy).
 * Pure data; the client picks a line by the hero and the towns view.
 */
import type { ClanKey } from "./clans";
import type { TownId } from "./towns";

/** The steward's name per clan and town. */
export const STEWARD_NAMES: Record<ClanKey, Record<TownId, string>> = {
  wardens: { saltmere: "Reeve Aldous Marsh", rustwater: "Reeve Gwen Tallow", ropewell: "Reeve Osric Fenn", millbrook: "Reeve Hob Threshold",
    turfhallow: "Reeve Agna Peatfield", staithe: "Reeve Dunstan Wade", barrowstead: "Reeve Cuthbert Lowe", redlode: "Reeve Marta Slag", hornstead: "Reeve Tobias Fenn",
    windlass: "Reeve Gilbert Cable", hempfield: "Reeve Maud Rettery", saltglass: "Reeve Anselm White", lastwell: "Reeve Ida Drywater" },
  redfang: { saltmere: "Quartermaster Scar-Jory", rustwater: "Quartermaster Dagna Nine-Toes", ropewell: "Quartermaster Rusk", millbrook: "Quartermaster Fat Merrick",
    turfhallow: "Quartermaster Smoke-Tam", staithe: "Quartermaster Eelbite", barrowstead: "Quartermaster Grave-Hal", redlode: "Quartermaster Red Ottla", hornstead: "Quartermaster Branded Wil",
    windlass: "Quartermaster Long Drop", hempfield: "Quartermaster Rope-Neck", saltglass: "Quartermaster Salt-Eye", lastwell: "Quartermaster Dry Gullet" },
  host: { saltmere: "Clerk Ossian Vale", rustwater: "Clerk Hollis Grey", ropewell: "Clerk Mirren Ash", millbrook: "Clerk Thane Dust",
    turfhallow: "Clerk Aldwin Moss", staithe: "Clerk Merrow Still", barrowstead: "Clerk Edric Pale", redlode: "Clerk Ivo Cinder", hornstead: "Clerk Selby Horne",
    windlass: "Clerk Orrin Deep", hempfield: "Clerk Linnet Flax", saltglass: "Clerk Corvin Brine", lastwell: "Clerk Hesper Sand" },
  hidekin: { saltmere: "Burrow-Warden Gnarl", rustwater: "Burrow-Warden Snuff", ropewell: "Burrow-Warden Old Root", millbrook: "Burrow-Warden Mudtooth",
    turfhallow: "Burrow-Warden Peatnose", staithe: "Burrow-Warden Wetwhisker", barrowstead: "Burrow-Warden Bonedigger", redlode: "Burrow-Warden Rustclaw", hornstead: "Burrow-Warden Hoofmark",
    windlass: "Burrow-Warden Pitpaw", hempfield: "Burrow-Warden Stalkchew", saltglass: "Burrow-Warden Saltlick", lastwell: "Burrow-Warden Dustnose" },
  veiled: { saltmere: "Envoy Sera of the Mask", rustwater: "Envoy Calder Veil", ropewell: "Envoy Isolde Noon", millbrook: "Envoy Wren the Quiet",
    turfhallow: "Envoy Aster of the Smoke", staithe: "Envoy Lior Stillwater", barrowstead: "Envoy Maren the Pale", redlode: "Envoy Cassia Red", hornstead: "Envoy Darius Dust",
    windlass: "Envoy Soren of the Rope", hempfield: "Envoy Briar Greenhand", saltglass: "Envoy Yasmin the White", lastwell: "Envoy Tariq of the Wells" },
};

/** Talk lines per clan; `{town}` is the town's name. */
export const STEWARD_LINES: Record<ClanKey, string[]> = {
  wardens: [
    "{town} is under the Wardens' care. Keep the peace and pay your fair price.",
    "The watch walks the gate of {town} day and night. Sleep easy.",
    "Written law, plain scales and an open road. That is all the Wardens ask of {town}.",
    "Brawlers sleep in the cold, friend. {town} has no cell to spare.",
  ],
  redfang: [
    "{town} pays the Compact now. Keep your hands where I can count them.",
    "Every crate in {town} is tallied twice. Do not make me count you.",
    "Buy, sell, trade in {town}. Just do not bleed on the stores.",
    "This scar? A man who shorted the Compact in {town}. Mind your coin.",
  ],
  host: [
    "The Host keeps {town}. The living may go about their business.",
    "I keep the roll of {town}, every name, living or not. Yours is easy to spell.",
    "Do not mind the quiet. Everything in {town} is in good order.",
    "All debts in {town} are collected in time. We are patient clerks.",
  ],
  hidekin: [
    "The Hide-Kin hold {town}. Mind your feet and your purse.",
    "Wide ways under {town}, wide ways. Do not dig where we have dug.",
    "Warm hall, full larder, good tunnels. {town} is a fine burrow.",
    "Bring {town} no trouble. We bite quick and we bite low.",
  ],
  veiled: [
    "{town} rests under the Veil. Be welcome.",
    "I speak for the Circle in {town}. The sun has foretold your visit.",
    "Behind the mask is only patience. Trade and rest in {town}, and walk in light.",
    "All that happens in {town} was seen. We wish you no harm.",
  ],
};
/** Said to a hero the holder wants (feuds.ts Wanted): a cold word, nothing more. */
export const STEWARD_WANTED = "I know your name from the rolls. Do your business and go.";
/** Said while the town is contested; `{by}` is the contesting clan's name. */
export const STEWARD_CONTESTED = "{by} are at the gate. Nothing is settled yet. Keep your head down.";
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
