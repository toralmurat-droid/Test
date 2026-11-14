/**
 * Renown (roadmap M2): what a sworn hero has done for the war. Each full minute at a standard that reports valor
 * (server/warHeroes.ts) earns the same amount of renown, so a hero far above a land earns a quarter there too.
 * Renown stays with the hero when they change clan: it is the hero's name in the Marches, not the clan's.
 */
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
