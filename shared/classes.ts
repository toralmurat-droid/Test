/**
 * Hero classes. All gameplay numbers live here so the server and client agree.
 * Art convention: the client picks a sprite by `Player.cls` ("knight" | "ninja" | "wizard").
 */
export type ClassKind = "knight" | "ninja" | "wizard" | "archer" | "barbarian";
export const CLASS_KINDS: ClassKind[] = ["knight", "ninja", "wizard", "archer", "barbarian"];

export type SpecialKind = "guard" | "dash" | "nova" | "volley" | "rage";

/**
 * One hit of the 3-hit attack combo. Pressing attack again within COMBO_WINDOW_MS after the previous hit's
 * cooldown chains to the next hit; otherwise the combo restarts at hit 1. Art convention: the client plays
 * the attack animation for `Player.combo` (0, 1, 2) and the "swing" message carries `step`.
 */
export interface ComboHit {
  damage: number; // multiplier on the class damage
  range?: number; // melee reach override, px
  knockback: number; // multiplier on normal knockback
  lunge?: number; // px the hero steps forward with the hit
  shotScale?: number; // wizard: projectile size multiplier
  cooldownMs?: number; // override of attackCooldownMs before the next input counts
}

export const COMBO_WINDOW_MS = 700;

export interface ClassDef {
  name: string;
  maxHp: number;
  speed: number; // px per second
  damage: number; // base primary-attack damage
  attackCooldownMs: number;
  /** Melee: hit everything within `attackRange` of a point 12px in front. */
  attackRange: number;
  /** Ranged: primary attack fires a projectile instead of a melee swing. */
  projectile?: { speed: number; range: number; radius: number; kind: "fireball" | "arrow" };
  special: {
    kind: SpecialKind;
    name: string;
    cooldownMs: number;
    durationMs?: number; // guard, rage
    arrows?: number; // volley
    distance?: number; // dash, px
    damage?: number; // nova
    radius?: number; // nova, px
  };
  combo: [ComboHit, ComboHit, ComboHit];
  blurb: string;
}

export const CLASSES: Record<ClassKind, ClassDef> = {
  knight: {
    name: "Knight", maxHp: 140, speed: 78, damage: 24, attackCooldownMs: 550, attackRange: 22,
    special: { kind: "guard", name: "Shield", cooldownMs: 6000, durationMs: 2000 },
    combo: [
      { damage: 1, knockback: 1 },
      { damage: 1.1, knockback: 1 },
      { damage: 1.6, knockback: 2.5, range: 30, cooldownMs: 800 }, // wide overhead slam
    ],
    blurb: "Tanky sword. Shield blocks 70% damage and knockback.",
  },
  ninja: {
    name: "Ninja", maxHp: 85, speed: 112, damage: 12, attackCooldownMs: 260, attackRange: 18,
    special: { kind: "dash", name: "Dash", cooldownMs: 2500, distance: 56 },
    combo: [
      { damage: 1, knockback: 0.5 },
      { damage: 1, knockback: 0.5 },
      { damage: 1.8, knockback: 1.5, lunge: 14, cooldownMs: 450 }, // lunging finisher
    ],
    blurb: "Fast, rapid strikes. Dash through enemies, briefly untouchable.",
  },
  wizard: {
    name: "Wizard", maxHp: 95, speed: 86, damage: 22, attackCooldownMs: 550, attackRange: 0,
    projectile: { speed: 210, range: 150, radius: 7, kind: "fireball" },
    special: { kind: "nova", name: "Nova", cooldownMs: 7000, damage: 30, radius: 38 },
    combo: [
      { damage: 1, knockback: 1 },
      { damage: 1, knockback: 1 },
      { damage: 1.7, knockback: 2, shotScale: 1.6, cooldownMs: 900 }, // big fireball
    ],
    blurb: "Ranged fireballs. Nova blasts everything around you.",
  },
  archer: {
    name: "Archer", maxHp: 85, speed: 96, damage: 15, attackCooldownMs: 450, attackRange: 0,
    projectile: { speed: 300, range: 190, radius: 4, kind: "arrow" },
    special: { kind: "volley", name: "Volley", cooldownMs: 6000, arrows: 3 },
    combo: [
      { damage: 1, knockback: 0.6 },
      { damage: 1, knockback: 0.6 },
      { damage: 1.8, knockback: 1.6, shotScale: 1.3, cooldownMs: 700 }, // power shot
    ],
    blurb: "Long-range arrows. Volley fires 3 arrows side by side.",
  },
  barbarian: {
    name: "Barbarian", maxHp: 110, speed: 90, damage: 20, attackCooldownMs: 480, attackRange: 20,
    special: { kind: "rage", name: "Rage", cooldownMs: 12000, durationMs: 5000 },
    combo: [
      { damage: 1, knockback: 1.2 },
      { damage: 1.1, knockback: 1.2 },
      { damage: 1.7, knockback: 2.2, range: 26, lunge: 10, cooldownMs: 750 }, // axe smash
    ],
    blurb: "Axe brawler. Rage: hit harder and move faster for 5s.",
  },
};

/**
 * Normal (non-finisher) attacks pick one of ATTACK_VARIANTS moves at random, never the same twice in a row.
 * Art convention: animations swing1..swing4; the "swing" message carries `variant` (0-based).
 */
export const ATTACK_VARIANTS = 4;

/** Chat commands like "/wave". Art convention: animation names match. Moving or fighting cancels them. */
export const EMOTES = ["wave", "cheer", "laugh", "sit", "sleep"] as const;
export type Emote = (typeof EMOTES)[number];

export const GUARD_REDUCTION = 0.7; // knight shield blocks this fraction of damage
export const DASH_INVULN_MS = 250; // ninja is untouchable right after a dash

/**
 * Stamina (Magic for the Wizard): every hero has 100 points that refill over time. Skills, the ultimate and the
 * dodge roll spend it; basic attacks are free. Shown as the blue bar under the HP bar.
 */
export const ENERGY = { max: 100, regenPerSec: 14, cost: { special: 30, ult: 50, dodge: 20 } };
export const energyName = (cls: string) => (cls === "wizard" ? "Magic" : "Stamina");

/** Dodge roll (F) for every hero: a quick roll in the move direction (or facing), untouchable while rolling. */
export const DODGE = { distance: 48, durationMs: 250, invulnMs: 300, cooldownMs: 1500 };

// ---- Levels -------------------------------------------------------------
export const MAX_LEVEL = 20;
export const PVP_KILL_XP = 20;

/** Total XP needed to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  return 40 * (level - 1) * level;
}

export function levelFromXp(xp: number): number {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}

/** Level-up stats and powers live in shared/powers.ts. */

export function isClassKind(v: unknown): v is ClassKind {
  return typeof v === "string" && (CLASS_KINDS as string[]).includes(v);
}
