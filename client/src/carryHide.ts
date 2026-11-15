import { chainState, questStep, type Quester } from "../../shared/quests";

/** The lantern's quest object (shared/quests.ts LAST_LANTERN): its take-spot copy is hidden while the lantern is out. */
export const LANTERN_OBJECT = "lantern_last";

/**
 * Which take-spot drawing to hide while a carry is on: the take object of the hero's current carry step in that chain,
 * whatever its id (The Last Lantern, Garrick's storm lantern...). Falls back to the Last Lantern while the step is not
 * known yet (a "qstate" can arrive just before the patch that starts the step).
 */
export function carryHiddenId(hero: Quester | undefined, chain: number): string {
  const s = Number.isInteger(chain) && chain >= 0 ? questStep(chainState(hero, chain)) : undefined;
  return s?.type === "carry" && s.carry ? s.carry.take.id : LANTERN_OBJECT;
}
