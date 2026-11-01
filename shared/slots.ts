import { ClassKind } from "./classes";
import { hasPower, Learned, powerNodeId, specialPower, ultPower } from "./powers";

/**
 * Skill slots on keys 1..9 and 0. They start empty; the player puts learned active skills in them from the skill
 * tree (drag a skill onto a slot, or hover it and press a number key). One skill per slot, each skill in one slot.
 */
export const SLOT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;
export const SLOT_COUNT = SLOT_KEYS.length;

export type SlotSkill = "special" | "ult";
export interface ActiveSkill { id: SlotSkill; node: string; name: string }

/** The active skills a class can put in a slot (class skill Lv1 and ultimate Lv10). */
export function activeSkills(cls: ClassKind): ActiveSkill[] {
  const sp = specialPower(cls), u = ultPower(cls);
  return [
    { id: "special", node: powerNodeId(sp.id), name: sp.name },
    { id: "ult", node: powerNodeId(u.id), name: u.name },
  ];
}

export const activeByNode = (cls: ClassKind, node: string) => activeSkills(cls).find((a) => a.node === node);

export function skillLearned(cls: ClassKind, learned: Learned, skill: SlotSkill): boolean {
  return hasPower(cls, learned, skill === "special" ? specialPower(cls).id : ultPower(cls).id);
}
