import { ClassKind } from "./classes";
import { POWER_LEVELS } from "./powers";

/**
 * Skill tree (press T). Every level after 1 gives 1 skill point. Each hero has 3 branches of 3 skills;
 * each skill has up to 3 ranks. A branch's 2nd skill needs 2 points spent in that branch, the 3rd needs 4.
 * 19 points (level 20) can't fill all 27 ranks, so players choose a build. Respec is free (out of combat).
 *
 * Powers path: the class powers (shared/powers.ts) sit at the top of the tree. The level 1 power is free; the next ones
 * become available at levels 3, 5, 8 and 10 and are learned in order for 1 skill point each (key POWER_KEY = how many).
 *
 * Effects are generic so the server applies them in one place each:
 *   dmg       all damage dealt +x%          skill   skill + ultimate damage +x%
 *   crit      x% chance for double damage   lifesteal heal x% of damage dealt
 *   hp        max HP +x%                    armor   damage taken -x%
 *   speed     move speed +x%                cdr     skill + ultimate cooldowns -x%
 *   regen     +x% max HP per second regen
 */
export type TalentEffect = "dmg" | "skill" | "crit" | "lifesteal" | "hp" | "armor" | "speed" | "cdr" | "regen";

export interface TalentDef { id: string; name: string; effect: TalentEffect; perRank: number }
export interface BranchDef { name: string; color: string; talents: [TalentDef, TalentDef, TalentDef] }

export const MAX_RANK = 3;
export const TIER_POINTS = [0, 2, 4]; // points needed in the branch to unlock skill 1, 2, 3

const t = (id: string, name: string, effect: TalentEffect, perRank: number): TalentDef => ({ id, name, effect, perRank });

export const TREES: Record<ClassKind, [BranchDef, BranchDef, BranchDef]> = {
  knight: [
    { name: "Blade", color: "#e63946", talents: [t("k_edge", "Sharp Edge", "dmg", 4), t("k_precision", "Precision", "crit", 4), t("k_valor", "Valor", "skill", 8)] },
    { name: "Bulwark", color: "#4cc9f0", talents: [t("k_vigor", "Vigor", "hp", 5), t("k_plate", "Heavy Plate", "armor", 3), t("k_recovery", "Recovery", "regen", 0.4)] },
    { name: "Command", color: "#ffd166", talents: [t("k_drill", "Drill", "cdr", 4), t("k_march", "March", "speed", 3), t("k_zeal", "Zeal", "lifesteal", 3)] },
  ],
  ninja: [
    { name: "Shadow", color: "#9d4edd", talents: [t("n_blades", "Twin Blades", "dmg", 4), t("n_vital", "Vital Points", "crit", 5), t("n_leech", "Blood Leech", "lifesteal", 3)] },
    { name: "Agility", color: "#4cc9f0", talents: [t("n_light", "Light Step", "speed", 4), t("n_focus", "Focus", "cdr", 5), t("n_evade", "Evasion", "armor", 3)] },
    { name: "Endurance", color: "#7cfc00", talents: [t("n_tough", "Toughness", "hp", 5), t("n_breath", "Breathing", "regen", 0.4), t("n_kunai", "Kunai Arts", "skill", 8)] },
  ],
  wizard: [
    { name: "Fire", color: "#f77f00", talents: [t("w_flame", "Flame", "dmg", 4), t("w_inferno", "Inferno", "skill", 8), t("w_spark", "Spark", "crit", 4)] },
    { name: "Arcane", color: "#4cc9f0", talents: [t("w_haste", "Haste", "cdr", 5), t("w_flow", "Life Flow", "regen", 0.4), t("w_blink", "Swiftness", "speed", 3)] },
    { name: "Ward", color: "#7cfc00", talents: [t("w_barrier", "Barrier", "hp", 6), t("w_shield", "Mana Shield", "armor", 3), t("w_drain", "Drain", "lifesteal", 3)] },
  ],
  archer: [
    { name: "Marksman", color: "#e63946", talents: [t("a_aim", "Steady Aim", "dmg", 4), t("a_head", "Headshot", "crit", 5), t("a_storm", "Storm of Arrows", "skill", 8)] },
    { name: "Ranger", color: "#7cfc00", talents: [t("a_fleet", "Fleet Foot", "speed", 4), t("a_quiver", "Quick Quiver", "cdr", 4), t("a_herbs", "Herbs", "regen", 0.4)] },
    { name: "Survival", color: "#4cc9f0", talents: [t("a_hardy", "Hardy", "hp", 5), t("a_leather", "Leather", "armor", 3), t("a_hunt", "Hunter's Feast", "lifesteal", 3)] },
  ],
  barbarian: [
    { name: "Fury", color: "#e63946", talents: [t("b_brute", "Brute", "dmg", 4), t("b_savage", "Savage", "lifesteal", 3), t("b_crush", "Crushing Blow", "crit", 4)] },
    { name: "Hide", color: "#a68a64", talents: [t("b_thick", "Thick Skin", "hp", 6), t("b_scars", "Scars", "armor", 3), t("b_feast", "Feast", "regen", 0.4)] },
    { name: "Warcry", color: "#ffd166", talents: [t("b_roar", "Roar", "skill", 8), t("b_drums", "War Drums", "cdr", 4), t("b_charge", "Charge", "speed", 3)] },
  ],
};

export const EFFECT_TEXT: Record<TalentEffect, (v: number) => string> = {
  dmg: (v) => `+${v}% damage`,
  skill: (v) => `+${v}% skill & ultimate damage`,
  crit: (v) => `+${v}% chance to deal double damage`,
  lifesteal: (v) => `Heal ${v}% of damage dealt`,
  hp: (v) => `+${v}% max HP`,
  armor: (v) => `-${v}% damage taken`,
  speed: (v) => `+${v}% move speed`,
  cdr: (v) => `-${v}% skill & ultimate cooldowns`,
  regen: (v) => `+${v}% max HP regen per second`,
};

/** Ranks per talent id. Works with a plain object or a Colyseus MapSchema. */
export type Ranks = { get(id: string): number | undefined } | Record<string, number>;
const rankOf = (r: Ranks, id: string): number =>
  (typeof (r as any).get === "function" ? (r as any).get(id) : (r as Record<string, number>)[id]) ?? 0;

export function talentPoints(level: number): number { return Math.max(0, level - 1); }

export const POWER_KEY = "_powers";
/** How many powers past the level 1 one have been learned (0..4). */
export const powersLearned = (r: Ranks) => rankOf(r, POWER_KEY);
/** Level of the highest learned power (1, 3, 5, 8 or 10): pass this as `level` to hasPower(). */
export const powerLevel = (r: Ranks) => POWER_LEVELS[Math.min(powersLearned(r), POWER_LEVELS.length - 1)];
/** Can the next power be learned? (right level reached + a free point) */
export function canLearnPower(cls: ClassKind, level: number, r: Ranks): boolean {
  const n = powersLearned(r);
  return n < POWER_LEVELS.length - 1 && level >= POWER_LEVELS[n + 1] && spentPoints(cls, r) < talentPoints(level);
}

export function spentPoints(cls: ClassKind, r: Ranks): number {
  return TREES[cls].reduce((sum, b) => sum + branchPoints(b, r), 0) + powersLearned(r);
}

export function branchPoints(b: BranchDef, r: Ranks): number {
  return b.talents.reduce((s, x) => s + rankOf(r, x.id), 0);
}

export function rank(r: Ranks, id: string): number { return rankOf(r, id); }

/** Can one more rank be put in talent `id`? */
export function canLearn(cls: ClassKind, level: number, r: Ranks, id: string): boolean {
  if (id === POWER_KEY) return canLearnPower(cls, level, r);
  if (spentPoints(cls, r) >= talentPoints(level)) return false;
  for (const b of TREES[cls]) {
    const i = b.talents.findIndex((x) => x.id === id);
    if (i < 0) continue;
    return rankOf(r, id) < MAX_RANK && branchPoints(b, r) >= TIER_POINTS[i];
  }
  return false;
}

/** Total bonus for an effect, in percent (e.g. 12 = +12%). */
export function talentBonus(cls: ClassKind, r: Ranks, effect: TalentEffect): number {
  let v = 0;
  for (const b of TREES[cls]) for (const x of b.talents) if (x.effect === effect) v += x.perRank * rankOf(r, x.id);
  return v;
}

/** Multiplier helpers (1 when no ranks). */
export const talentMult = (cls: ClassKind, r: Ranks, effect: TalentEffect) => 1 + talentBonus(cls, r, effect) / 100;
export const talentReduce = (cls: ClassKind, r: Ranks, effect: TalentEffect) => 1 - talentBonus(cls, r, effect) / 100;
