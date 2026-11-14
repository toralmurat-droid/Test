import type { MobKind } from "./constants";
import { hasTrait, type TraitId } from "./cosmetics";

/** Skill tree helpers live in shared/skills.ts; re-exported here for older imports. */
export {
  canLearn, EFFECT_TEXT, lockReason, MAX_RANK, rankOf as nodeRank, spentPoints, talentBonus, talentMult, talentPoints, talentReduce,
  type TalentEffect, type LockReason, type Ranks,
} from "./skills";

/**
 * Talents a quest trait brings (shared/cosmetics.ts TRAITS), not learned in the tree. Hidebound: a hero who took the
 * Hide-Mother's bargain (docs/quest-concepts-progress.md, decision 6) takes `taken` times the damage from beast-folk
 * (shared/quests.ts BEAST_FOLK, plus the crowseer). On at 0.95 (Mehmet 2026-11-14); 1.0 switches it off.
 */
export const TRAIT_TALENTS: Record<"hidebound", { trait: TraitId; from: readonly MobKind[]; taken: number }> = {
  hidebound: { trait: "beast", from: ["gnawkin", "tuskborn", "silkwretch", "duskwing", "crowseer"], taken: 0.95 },
};
/** Damage taken multiplier from a monster of `kind` for a hero with cosmetics number `cosm` (Player.cosm); 1 = none. */
export function traitTakenMult(kind: MobKind, cosm: number): number {
  let k = 1;
  for (const t of Object.values(TRAIT_TALENTS)) if (t.taken !== 1 && t.from.includes(kind) && hasTrait(cosm, t.trait)) k *= t.taken;
  return k;
}
