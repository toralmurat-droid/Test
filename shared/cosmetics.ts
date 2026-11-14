/**
 * Cosmetics (docs/quest-concepts-progress.md, decision 12): a title shown under the name and permanent look traits.
 * One number in the reserved arcs key `$c` (shared/questSteps.ts META.cosm), so nothing new is synced on Player:
 * bits 0-7 = the title (index in TITLES, 0 = none), bits 8-23 = one bit per trait (TRAITS). Both lists are append-only.
 * Traits come from quests (beast: took the Hide-Mother's bargain, server/questSteps.ts); a trait may bring a talent
 * (shared/talents.ts TRAIT_TALENTS). Titles come with the Apprentice (WP7) and the rumours (WP6).
 */
export const TITLES = ["", "Mentor", "Captain's Own", "Warden of Oakvale", "Rumour-Chaser"] as const;
/** Trait bit per id (beast: the hide sewn in at the Hide-Mother's bargain; permanent, Penance keeps it). */
export const TRAITS = { beast: 0 } as const;
export type TraitId = keyof typeof TRAITS;

export interface Cosmetics { title: number; traits: number }

const TITLE_MASK = 0xff, TRAIT_SHIFT = 8, TRAIT_MASK = 0xffff;

/** Pack a title and trait bits into the `$c` number (out-of-range titles are dropped). */
export function packCosmetics(c: Cosmetics): number {
  const title = Number.isInteger(c.title) && c.title > 0 && c.title < TITLES.length ? c.title : 0;
  return (title | ((c.traits & TRAIT_MASK) << TRAIT_SHIFT)) >>> 0;
}
/** The `$c` number back into a title and trait bits (garbage reads as none). */
export function unpackCosmetics(n: number): Cosmetics {
  const v = Number.isFinite(n) ? n >>> 0 : 0, title = v & TITLE_MASK;
  return { title: title < TITLES.length ? title : 0, traits: (v >>> TRAIT_SHIFT) & TRAIT_MASK };
}
/** Does the packed number carry this trait? */
export const hasTrait = (n: number, t: TraitId) => !!(unpackCosmetics(n).traits & (1 << TRAITS[t]));
/** The packed number with this trait added. */
export const withTrait = (n: number, t: TraitId) => { const c = unpackCosmetics(n); return packCosmetics({ ...c, traits: c.traits | (1 << TRAITS[t]) }); };
/** The packed number with this title (0 = none). */
export const withTitle = (n: number, title: number) => packCosmetics({ ...unpackCosmetics(n), title });

/**
 * Titles a hero has earned: bit i = TITLES[i] (bit 0 unused), saved as HeroSave.titles. Earning one shows it only
 * when no title is showing, so a later title never pushes out the one the hero chose; "title" {i} swaps between owned ones.
 */
const okTitle = (i: number) => Number.isInteger(i) && i > 0 && i < TITLES.length && i < 32;
/** Has the hero earned title i? */
export const ownsTitle = (owned: number, i: number) => okTitle(i) && !!((owned >>> i) & 1);
/** The owned titles as TITLES indices (for the client's picker). */
export const ownedTitles = (owned: number) => TITLES.map((_, i) => i).filter((i) => ownsTitle(owned, i));
/** Title i earned: the new owned mask and `$c` number, and whether it is new to this hero. */
export function earnTitle(cosm: number, owned: number, i: number): { cosm: number; owned: number; fresh: boolean } {
  if (!okTitle(i)) return { cosm, owned, fresh: false };
  const fresh = !ownsTitle(owned, i), shown = unpackCosmetics(cosm).title;
  return { cosm: shown ? cosm : withTitle(cosm, i), owned: (owned | (1 << i)) >>> 0, fresh };
}
/** The `$c` number showing title i (0 = none), or undefined when the hero hasn't earned it. */
export function pickTitle(cosm: number, owned: number, i: number): number | undefined {
  if (i === 0) return withTitle(cosm, 0);
  return ownsTitle(owned, i) ? withTitle(cosm, i) : undefined;
}
/** The owned mask from a save: garbage reads as none, and a title already showing (saves from before the list) counts as earned. */
export function cleanOwned(v: unknown, cosm: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v >>> 0 : 0, shown = unpackCosmetics(cosm).title;
  let out = 0;
  for (let i = 1; i < TITLES.length && i < 32; i++) if ((n >>> i) & 1 || i === shown) out |= 1 << i;
  return out >>> 0;
}
