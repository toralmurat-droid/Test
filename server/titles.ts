import { earnTitle, ownedTitles, pickTitle, TITLES, unpackCosmetics } from "../shared/cosmetics";
import { META, metaOf } from "../shared/questSteps";
import { setMeta, type StepHero } from "./questSteps";

/**
 * Titles on a hero (shared/cosmetics.ts has the rules): the shown one in Player.cosm (public), the earned ones in the
 * plain Player.titles mask (saved, sent as "title"). Every title award (rumours, the Apprentice) goes through `award`,
 * so a new title never covers the one a hero picked.
 */
export type TitleHero = StepHero & { titles?: number };

/** The hero earned TITLES[i]: owned from now on, shown if no title is showing. True when it is new to them. */
export function award(p: TitleHero, i: number): boolean {
  const r = earnTitle(metaOf(p, META.cosm), p.titles ?? 0, i);
  p.titles = r.owned;
  setMeta(p, META.cosm, r.cosm);
  return r.fresh;
}

/** "title" {i, owned}: the title showing and the ones the hero may pick (TITLES indices). */
export const titleState = (p: TitleHero) => ({ i: unpackCosmetics(metaOf(p, META.cosm)).title, owned: ownedTitles(p.titles ?? 0) });

/**
 * "title" from the client: {i} shows owned title i (0 = none); {} just asks for the state. Anything else, or a title
 * not earned, changes nothing. TownRoom has already rate-limited it. The reply (always sent) is titleState.
 */
export function titleMsg(p: TitleHero, m: unknown): ReturnType<typeof titleState> {
  if (m && typeof m === "object") {
    const i = (m as { i?: unknown }).i;
    if (typeof i === "number" && Number.isInteger(i) && i >= 0 && i < TITLES.length) {
      const c = pickTitle(metaOf(p, META.cosm), p.titles ?? 0, i);
      if (c !== undefined) setMeta(p, META.cosm, c);
    }
  }
  return titleState(p);
}
