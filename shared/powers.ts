import { CLASSES, ClassKind } from "./classes";

/**
 * Hero stats and level-up powers. Shared so the server (rules) and client (menu, prediction) agree.
 *
 * Stats: the player assigns stat points in the hero panel (C): 1 point per level, 3 at the major levels 3, 5, 8, 10
 * (27 points by level 20). Each class starts from its own base stats:
 *   Stamina  -> max HP (+12 per point) and HP regen (shared/constants.ts)
 *   Strength -> attack damage for Knight/Ninja/Archer/Barbarian (+7% per point), +4 max HP per point
 *   Magic    -> skill damage (+7% per point), skill cooldowns (-2% per point, max -30%), Wizard fireballs
 * Every level also adds HP_PER_LEVEL max HP, so levels matter whatever the build.
 */
export type StatKind = "sta" | "str" | "mag";
export const STAT_NAMES: Record<StatKind, string> = { sta: "Stamina", str: "Strength", mag: "Magic" };
export type Stats = Record<StatKind, number>;

export interface StatDef { base: Stats; attackStat: StatKind }

export const STATS: Record<ClassKind, StatDef> = {
  knight: { base: { sta: 10, str: 8, mag: 2 }, attackStat: "str" },
  ninja: { base: { sta: 6, str: 10, mag: 4 }, attackStat: "str" },
  wizard: { base: { sta: 7, str: 2, mag: 11 }, attackStat: "mag" },
  archer: { base: { sta: 7, str: 9, mag: 4 }, attackStat: "str" },
  barbarian: { base: { sta: 9, str: 10, mag: 1 }, attackStat: "str" },
};

export const HP_PER_STA = 12;
export const HP_PER_STR = 4;
export const HP_PER_LEVEL = 5;
export const DMG_PER_POINT = 0.07;
export const CDR_PER_MAG = 0.02;
export const MAX_CDR = 0.3;

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
export function statsFor(cls: ClassKind, assigned: Stats = { sta: 0, str: 0, mag: 0 }): Stats {
  const b = STATS[cls].base;
  return { sta: b.sta + assigned.sta, str: b.str + assigned.str, mag: b.mag + assigned.mag };
}

export function maxHpFromStats(cls: ClassKind, s: Stats, level = 1): number {
  const b = STATS[cls].base;
  return CLASSES[cls].maxHp + (level - 1) * HP_PER_LEVEL + (s.sta - b.sta) * HP_PER_STA + (s.str - b.str) * HP_PER_STR;
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

export function cooldownMult(cls: ClassKind, s: Stats, learned: Learned): number {
  let m = 1 - Math.min(MAX_CDR, (s.mag - STATS[cls].base.mag) * CDR_PER_MAG);
  if (hasPower(cls, learned, "manaflow")) m *= 0.8;
  return m;
}

// ---- Powers ---------------------------------------------------------------

export const POWER_LEVELS = [1, 3, 5, 8, 10] as const;

export type PowerId =
  | "guard" | "ironskin" | "cleave" | "secondwind" | "earthquake"
  | "dash" | "swift" | "crit" | "shadowstrike" | "bladestorm"
  | "nova" | "manaflow" | "ignite" | "frost" | "meteor"
  | "volley" | "eagleeye" | "pierce" | "pinning" | "arrowrain"
  | "rage" | "bloodthirst" | "groundslam" | "unstoppable" | "leap";

export interface PowerDef { id: PowerId; level: number; name: string; desc: string; key?: "1" | "2" }

export const POWERS: Record<ClassKind, PowerDef[]> = {
  knight: [
    { id: "guard", level: 1, name: "Shield", key: "1", desc: "Block 70% damage and all knockback for 2s." },
    { id: "ironskin", level: 3, name: "Iron Skin", desc: "Passive: take 10% less damage." },
    { id: "cleave", level: 5, name: "Cleave", desc: "Combo finisher hits every enemy around you." },
    { id: "secondwind", level: 8, name: "Second Wind", desc: "Passive: below 25% HP, heal 30% (once per 60s)." },
    { id: "earthquake", level: 10, name: "Earthquake", key: "2", desc: "Slam the ground: damage and stun everything nearby for 1.5s." },
  ],
  ninja: [
    { id: "dash", level: 1, name: "Dash", key: "1", desc: "Blink forward, untouchable for a moment." },
    { id: "swift", level: 3, name: "Swift Feet", desc: "Passive: move 12% faster." },
    { id: "crit", level: 5, name: "Critical Strike", desc: "Passive: 20% chance to deal double damage." },
    { id: "shadowstrike", level: 8, name: "Shadow Strike", desc: "Dash cuts every enemy you pass through." },
    { id: "bladestorm", level: 10, name: "Blade Storm", key: "2", desc: "Spin: 3 quick hits on everything around you." },
  ],
  wizard: [
    { id: "nova", level: 1, name: "Nova", key: "1", desc: "Blast everything around you." },
    { id: "manaflow", level: 3, name: "Mana Flow", desc: "Passive: skills recharge 20% faster." },
    { id: "ignite", level: 5, name: "Ignite", desc: "Fireballs explode, splashing 50% damage nearby." },
    { id: "frost", level: 8, name: "Frost Nova", desc: "Nova also slows enemies by 50% for 2s." },
    { id: "meteor", level: 10, name: "Meteor", key: "2", desc: "Call a meteor ahead of you: huge area damage." },
  ],
  archer: [
    { id: "volley", level: 1, name: "Volley", key: "1", desc: "Fire 3 arrows side by side." },
    { id: "eagleeye", level: 3, name: "Eagle Eye", desc: "Passive: arrows fly 30% farther." },
    { id: "pierce", level: 5, name: "Piercing Arrows", desc: "Arrows pass through up to 2 extra enemies." },
    { id: "pinning", level: 8, name: "Pinning Shot", desc: "Arrows slow enemies for 1.5s." },
    { id: "arrowrain", level: 10, name: "Arrow Rain", key: "2", desc: "Rain arrows on an area ahead: 4 waves of damage." },
  ],
  barbarian: [
    { id: "rage", level: 1, name: "Rage", key: "1", desc: "For 5s: +30% damage and +20% speed." },
    { id: "bloodthirst", level: 3, name: "Bloodthirst", desc: "Passive: heal 15% of the damage you deal." },
    { id: "groundslam", level: 5, name: "Ground Slam", desc: "Combo finisher stuns enemies for 0.6s." },
    { id: "unstoppable", level: 8, name: "Unstoppable", desc: "While raging: immune to stun, slow and knockback." },
    { id: "leap", level: 10, name: "Leap", key: "2", desc: "Leap forward and crash down, hurting everything where you land." },
  ],
};

/**
 * Skills learned in the skill tree (Player.talents): rank per node id. Class skills ("powers") are nodes "pw_<id>".
 * Heroes start with only a basic attack; every class skill must be learned with a skill point. See shared/talents.ts for the tree layout.
 */
export type Learned = { get(id: string): number | undefined } | Record<string, number>;
export const powerNodeId = (id: PowerId) => `pw_${id}`;
const learnedRank = (r: Learned, id: string): number =>
  (typeof (r as any).get === "function" ? (r as any).get(id) : (r as Record<string, number>)[id]) ?? 0;

export function hasPower(cls: ClassKind, learned: Learned, id: PowerId): boolean {
  const p = POWERS[cls].find((x) => x.id === id);
  return !!p && learnedRank(learned, powerNodeId(id)) > 0;
}

/** The class skill on key 1 (level 1) and the ultimate on key 2 (level 10). */
export const specialPower = (cls: ClassKind) => POWERS[cls].find((p) => p.key === "1")!;
export const ultPower = (cls: ClassKind) => POWERS[cls].find((p) => p.key === "2")!;
export const hasSpecial = (cls: ClassKind, learned: Learned) => hasPower(cls, learned, specialPower(cls).id);
export const hasUlt = (cls: ClassKind, learned: Learned) => hasPower(cls, learned, ultPower(cls).id);

// ---- Tuning for the new powers -------------------------------------------
export const IRONSKIN_REDUCTION = 0.1;
export const SECOND_WIND = { threshold: 0.25, heal: 0.3, cooldownMs: 60000 };
export const SWIFT_BONUS = 0.12;
export const CRIT = { chance: 0.2, mult: 2 };
export const SHADOW_STRIKE_DAMAGE = 0.8; // x primary damage
export const IGNITE = { radius: 22, splash: 0.5 };
export const FROST = { slow: 0.5, durationMs: 2000 };
export const SLOW_MOB = 0.5;
export const EAGLE_EYE_RANGE = 1.3;
export const PIERCE_EXTRA = 2;
export const PINNING = { durationMs: 1500 };
export const RAGE = { damage: 1.3, speed: 1.2 };
export const BLOODTHIRST = 0.15;
export const GROUND_SLAM_STUN_MS = 600;

export interface UltDef { name: string; cooldownMs: number; damage: number; radius: number; stunMs?: number; hits?: number; delayMs?: number; ahead?: number }
export const ULTS: Record<ClassKind, UltDef> = {
  knight: { name: "Earthquake", cooldownMs: 18000, damage: 35, radius: 50, stunMs: 1500 },
  ninja: { name: "Blade Storm", cooldownMs: 14000, damage: 16, radius: 36, hits: 3 },
  wizard: { name: "Meteor", cooldownMs: 16000, damage: 60, radius: 46, delayMs: 600, ahead: 56 },
  archer: { name: "Arrow Rain", cooldownMs: 15000, damage: 16, radius: 44, hits: 4, delayMs: 400, ahead: 72 },
  barbarian: { name: "Leap", cooldownMs: 14000, damage: 45, radius: 40, ahead: 64 },
};
export const ULT_LEVEL = 10;

/** Movement speed after passives and slows (used by server and client prediction). */
export function heroSpeed(cls: ClassKind, learned: Learned, slowed: boolean, raging = false): number {
  let s = CLASSES[cls].speed;
  if (hasPower(cls, learned, "swift")) s *= 1 + SWIFT_BONUS;
  if (raging) s *= RAGE.speed;
  if (slowed) s *= 1 - FROST.slow;
  return s;
}
