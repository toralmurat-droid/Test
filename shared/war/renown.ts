/**
 * Renown (roadmap M2): what a sworn hero has done for the war. Each full minute at a standard that reports valor
 * (server/warHeroes.ts) earns the same amount of renown, so a hero far above a land earns a quarter there too.
 * Renown stays with the hero when they change clan: it is the hero's name in the Marches, not the clan's.
 */
import type { ClanKey } from "./clans";

export const RENOWN_RANKS: { at: number; name: string }[] = [
  { at: 0, name: "Sworn" },
  { at: 30, name: "Shieldbearer" },
  { at: 120, name: "Standard-bearer" },
  { at: 360, name: "Banneret" },
  { at: 900, name: "Warlord" },
  { at: 2000, name: "Hero of the Marches" },
];

/** Index of the rank a hero with `renown` holds. */
export function rankOf(renown: number): number {
  let i = 0;
  while (i + 1 < RENOWN_RANKS.length && renown >= RENOWN_RANKS[i + 1].at) i++;
  return i;
}

/** Old or broken save values become 0 (renown is never negative). */
export const cleanRenown = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** A hero's oath as the "oaths" message carries it (server/warOaths.ts): clan and index into RENOWN_RANKS. */
export type Oath = [ClanKey, number];
/** Server -> client "oaths": `full` replaces the map (on join), otherwise `o` adds or changes entries and `gone` drops them. */
export interface OathsMsg { full?: true; o: Record<string, Oath>; gone?: string[] }

/** How a rank title names the clan: "Banneret of the Redfang". */
const CLAN_OF: Record<ClanKey, string> = { wardens: "Wardens", redfang: "Redfang", host: "Host", hidekin: "Hide-Kin", veiled: "Veiled Circle" };
/** The title shown in a hero's name tag (rank above Sworn), or "" for Sworn and unknown ranks. A rank that already
 *  says "of" takes the clan after a comma: "Hero of the Marches, Hide-Kin". */
export function rankTitle(o: Oath): string {
  const r = o[1] > 0 ? RENOWN_RANKS[o[1]] : undefined, c = CLAN_OF[o[0]];
  if (!r || !c) return "";
  return r.name.includes(" of ") ? `${r.name}, ${c}` : `${r.name} of the ${c}`;
}
