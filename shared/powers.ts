import { CLASSES, ClassKind } from "./classes";
import { Ranks, talentReduce } from "./skills";

/**
 * Hero stats. (Skills: shared/skills.ts.) Shared so the server (rules) and client (menu, prediction) agree.
 *
 * Stats: the player assigns stat points in the hero panel (C): 1 point per level, 3 at the major levels 3, 5, 8, 10
 * (27 points by level 20). Each class starts from its own base stats:
 *   Stamina  -> max HP (+12 per point) and HP regen (shared/constants.ts)
 *   Strength -> attack damage for Knight/Ninja/Archer/Barbarian (+7% per point), +4 max HP per point
 *   Magic    -> skill damage (+7% per point), skill cooldowns (-2% per point, max -30%), Wizard fireballs and +4 max HP per point
 *   Dexterity -> critical hits: 1% chance per point (class base included), crits deal double damage; skills crit too
 * Every level also adds HP_PER_LEVEL max HP, so levels matter whatever the build.
 */
export type StatKind = "sta" | "str" | "mag" | "dex";
export const STAT_KINDS: StatKind[] = ["sta", "str", "mag", "dex"];
export const STAT_NAMES: Record<StatKind, string> = { sta: "Stamina", str: "Strength", mag: "Magic", dex: "Dexterity" };
export type Stats = Record<StatKind, number>;

export interface StatDef { base: Stats; attackStat: StatKind }

export const STATS: Record<ClassKind, StatDef> = {
  knight: { base: { sta: 10, str: 8, mag: 2, dex: 3 }, attackStat: "str" },
  ninja: { base: { sta: 6, str: 10, mag: 4, dex: 9 }, attackStat: "str" },
  wizard: { base: { sta: 7, str: 2, mag: 11, dex: 3 }, attackStat: "mag" },
  archer: { base: { sta: 7, str: 9, mag: 4, dex: 8 }, attackStat: "str" },
  barbarian: { base: { sta: 9, str: 10, mag: 1, dex: 4 }, attackStat: "str" },
  vampire: { base: { sta: 7, str: 8, mag: 8, dex: 5 }, attackStat: "str" },
};

export const HP_PER_STA = 12;
export const HP_PER_STR = 4;
export const HP_PER_LEVEL = 5;
export const DMG_PER_POINT = 0.07;
export const CDR_PER_MAG = 0.02;
export const MAX_CDR = 0.3;
export const CRIT_PER_DEX = 0.01;
export const MAX_CRIT = 0.6;

/** Levels that give 3 stat points instead of 1. */
export const MAJOR_LEVELS = [3, 5, 8, 10];
export const pointsAtLevel = (level: number) => (level <= 1 ? 0 : MAJOR_LEVELS.includes(level) ? 3 : 1);
/** Total stat points earned by `level`. */
export function statPoints(level: number): number {
  let n = 0;
  for (let l = 2; l <= level; l++) n += pointsAtLevel(l);
  return n;
}

/** Class base stats plus the points the player assigned. */
export function statsFor(cls: ClassKind, assigned: Partial<Stats> = {}): Stats {
  const b = STATS[cls].base;
  return { sta: b.sta + (assigned.sta ?? 0), str: b.str + (assigned.str ?? 0), mag: b.mag + (assigned.mag ?? 0), dex: b.dex + (assigned.dex ?? 0) };
}

/** Chance (0..MAX_CRIT) that a hit is critical (double damage), from Dexterity plus the skill tree's crit passives (%). */
export function critChance(s: Stats, passivePct = 0): number {
  return Math.min(MAX_CRIT, (s.dex ?? 0) * CRIT_PER_DEX + passivePct / 100);
}

export function maxHpFromStats(cls: ClassKind, s: Stats, level = 1): number {
  const b = STATS[cls].base;
  // Strength gives HP; a Magic-based hero (Wizard) gets the same from Magic so it isn't squishier for using its attack stat
  const magHp = STATS[cls].attackStat === "mag" ? (s.mag - b.mag) * HP_PER_STR : 0;
  return CLASSES[cls].maxHp + (level - 1) * HP_PER_LEVEL + (s.sta - b.sta) * HP_PER_STA + (s.str - b.str) * HP_PER_STR + magHp;
}

/** Multiplier for the primary attack, from the class's attack stat. */
export function attackMult(cls: ClassKind, s: Stats): number {
  const k = STATS[cls].attackStat;
  return 1 + (s[k] - STATS[cls].base[k]) * DMG_PER_POINT;
}

/** Multiplier for skill / ultimate damage (always Magic, but every hero has some). */
export function magicMult(cls: ClassKind, s: Stats): number {
  return 1 + (s.mag - STATS[cls].base.mag) * DMG_PER_POINT + (cls === "wizard" ? 0 : 0.03 * (s.str - STATS[cls].base.str));
}

/** Skill cooldown multiplier from Magic and the skill tree's cooldown passives. */
export function cooldownMult(cls: ClassKind, s: Stats, learned: Ranks): number {
  return (1 - Math.min(MAX_CDR, (s.mag - STATS[cls].base.mag) * CDR_PER_MAG)) * talentReduce(cls, learned, "cdr");
}

/** Movement speed before gear: class speed, slowed, times skill buffs and passives (`mult`). */
export const SLOW = 0.5;
export function heroSpeed(cls: ClassKind, slowed: boolean, mult = 1): number {
  return CLASSES[cls].speed * mult * (slowed ? 1 - SLOW : 1);
}
export const SLOW_MOB = 0.5;
