import { ClassKind } from "./classes";
import { POWER_LEVELS, POWERS, powerNodeId } from "./powers";

/**
 * Skill tree (press T). Every level after 1 gives 1 skill point. One tree holds the class skills (E, R and the
 * other shared/powers.ts skills) and 3 branches of passive skills (3 ranks each); see treeNodes() for the layout.
 * Heroes start with only a basic attack. 19 points (level 20) can't fill all 32 ranks, so players choose a build. Respec is free (out of combat).
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

// ---- One tree: class skills and passive skills together ---------------------------------------------
/**
 * Each hero's tree is a 3-column grid with rows at levels 1, 3, 5, 8 and 10. The class skills (shared/powers.ts,
 * 1 rank) and the passive skills (3 ranks) are both nodes. A node needs its row's level
 * and at least 1 rank in the node before it (drawn below it) in the same column. Every node rank costs 1 skill point.
 *   column 0: branch 0 skill 1 · class skill Lv3 · branch 0 skill 2 · class skill Lv8 · branch 0 skill 3
 *   column 1: class skill Lv1 · branch 1 skill 1 · branch 1 skill 2 · branch 1 skill 3 · ultimate Lv10
 *   column 2: branch 2 skill 1 · branch 2 skill 2 · class skill Lv5 · branch 2 skill 3 · (empty)
 */
export const TREE_LEVELS = POWER_LEVELS;

export interface TreeNode {
  id: string; name: string; desc: string; level: number; col: number; row: number; max: number;
  kind: "power" | "passive"; key?: "1" | "2"; color: string; talent?: TalentDef;
}

export function treeNodes(cls: ClassKind): TreeNode[] {
  const b = TREES[cls], pw = POWERS[cls];
  const passive = (bi: number, ti: number, col: number, row: number): TreeNode => {
    const t = b[bi].talents[ti];
    return { id: t.id, name: t.name, desc: "", level: TREE_LEVELS[row], col, row, max: MAX_RANK, kind: "passive", color: b[bi].color, talent: t };
  };
  const power = (pi: number, col: number, row: number): TreeNode => {
    const p = pw[pi];
    return { id: powerNodeId(p.id), name: p.name, desc: p.desc, level: p.level, col, row, max: 1, kind: "power", key: p.key, color: "#ffd166" };
  };
  return [
    passive(0, 0, 0, 0), power(1, 0, 1), passive(0, 1, 0, 2), power(3, 0, 3), passive(0, 2, 0, 4),
    power(0, 1, 0), passive(1, 0, 1, 1), passive(1, 1, 1, 2), passive(1, 2, 1, 3), power(4, 1, 4),
    passive(2, 0, 2, 0), passive(2, 1, 2, 1), power(2, 2, 2), passive(2, 2, 2, 3),
  ];
}

export const nodeRank = (_cls: ClassKind, r: Ranks, id: string): number => rankOf(r, id);

export function spentPoints(cls: ClassKind, r: Ranks): number {
  return treeNodes(cls).reduce((s, n) => s + rankOf(r, n.id), 0);
}

export function branchPoints(b: BranchDef, r: Ranks): number {
  return b.talents.reduce((s, x) => s + rankOf(r, x.id), 0);
}

export function rank(r: Ranks, id: string): number { return rankOf(r, id); }

export type LockReason = "" | "max" | "level" | "above" | "points";
/** Why node `id` can't take one more rank right now ("" = it can). */
export function lockReason(cls: ClassKind, level: number, r: Ranks, id: string): LockReason {
  const nodes = treeNodes(cls);
  const n = nodes.find((x) => x.id === id);
  if (!n || nodeRank(cls, r, id) >= n.max) return "max";
  if (level < n.level) return "level";
  const above = nodes.find((x) => x.col === n.col && x.row === n.row - 1);
  if (above && nodeRank(cls, r, above.id) < 1) return "above";
  if (spentPoints(cls, r) >= talentPoints(level)) return "points";
  return "";
}

export const canLearn = (cls: ClassKind, level: number, r: Ranks, id: string) => lockReason(cls, level, r, id) === "";

/** Total bonus for an effect, in percent (e.g. 12 = +12%). */
export function talentBonus(cls: ClassKind, r: Ranks, effect: TalentEffect): number {
  let v = 0;
  for (const b of TREES[cls]) for (const x of b.talents) if (x.effect === effect) v += x.perRank * rankOf(r, x.id);
  return v;
}

/** Multiplier helpers (1 when no ranks). */
export const talentMult = (cls: ClassKind, r: Ranks, effect: TalentEffect) => 1 + talentBonus(cls, r, effect) / 100;
export const talentReduce = (cls: ClassKind, r: Ranks, effect: TalentEffect) => 1 - talentBonus(cls, r, effect) / 100;
