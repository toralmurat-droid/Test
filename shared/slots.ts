import { ClassKind } from "./classes";
import { hasPower, Learned, powerNodeId, specialPower, ultPower } from "./powers";

/**
 * Skill slots on keys 1..9 and 0. They start empty; the player clicks a slot to pick a learned skill from a list
 * (or scrolls the mouse wheel over a slot, or hovers a skill in the tree and presses a number key).
 * One skill per slot, each skill in one slot.
 */
export const SLOT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;
export const SLOT_COUNT = SLOT_KEYS.length;

export type SlotSkill = "special" | "ult";
export interface ActiveSkill { id: SlotSkill; node: string; name: string; power: string; level: number; desc: string }

/** The active skills a class can put in a slot (class skill Lv1 and ultimate Lv10). */
export function activeSkills(cls: ClassKind): ActiveSkill[] {
  const sp = specialPower(cls), u = ultPower(cls);
  return [
    { id: "special", node: powerNodeId(sp.id), name: sp.name, power: sp.id, level: sp.level, desc: sp.desc },
    { id: "ult", node: powerNodeId(u.id), name: u.name, power: u.id, level: u.level, desc: u.desc },
  ];
}

export const activeByNode = (cls: ClassKind, node: string) => activeSkills(cls).find((a) => a.node === node);

export function skillLearned(cls: ClassKind, learned: Learned, skill: SlotSkill): boolean {
  return hasPower(cls, learned, skill === "special" ? specialPower(cls).id : ultPower(cls).id);
}
