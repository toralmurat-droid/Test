/**
 * Skill slots on keys 1..9 and 0. They start empty; the player clicks a slot to pick a learned active skill
 * (or scrolls the mouse wheel over a slot, or hovers a skill in the tree and presses a number key).
 * A slot holds a skill id from shared/skills.ts. One skill per slot, each skill in one slot.
 */
export const SLOT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;
export const SLOT_COUNT = SLOT_KEYS.length;
export { activeSkills, skillLearned } from "./skills";
