/**
 * Hero classes. All gameplay numbers live here so the server and client agree.
 * Art convention: the client picks a sprite by `Player.cls` ("knight" | "ninja" | "wizard").
 */
export type ClassKind = "knight" | "ninja" | "wizard";
export const CLASS_KINDS: ClassKind[] = ["knight", "ninja", "wizard"];

export type SpecialKind = "guard" | "dash" | "nova";

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
  projectile?: { speed: number; range: number; radius: number };
  special: {
    kind: SpecialKind;
    name: string;
    cooldownMs: number;
    durationMs?: number; // guard
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
    name: "Ninja", maxHp: 85, speed: 112, damage: 14, attackCooldownMs: 260, attackRange: 18,
    special: { kind: "dash", name: "Dash", cooldownMs: 2500, distance: 56 },
    combo: [
      { damage: 1, knockback: 0.5 },
      { damage: 1, knockback: 0.5 },
      { damage: 1.8, knockback: 1.5, lunge: 14, cooldownMs: 450 }, // lunging finisher
    ],
    blurb: "Fast, rapid strikes. Dash through enemies, briefly untouchable.",
  },
  wizard: {
    name: "Wizard", maxHp: 95, speed: 86, damage: 18, attackCooldownMs: 600, attackRange: 0,
    projectile: { speed: 210, range: 150, radius: 7 },
    special: { kind: "nova", name: "Nova", cooldownMs: 7000, damage: 30, radius: 38 },
    combo: [
      { damage: 1, knockback: 1 },
      { damage: 1, knockback: 1 },
      { damage: 1.7, knockback: 2, shotScale: 1.6, cooldownMs: 900 }, // big fireball
    ],
    blurb: "Ranged fireballs. Nova blasts everything around you.",
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

/** Each level adds 8% max HP and 6% damage. */
export function maxHpFor(cls: ClassKind, level: number): number {
  return Math.round(CLASSES[cls].maxHp * (1 + 0.08 * (level - 1)));
}
export function damageFor(base: number, level: number): number {
  return Math.round(base * (1 + 0.06 * (level - 1)));
}

export function isClassKind(v: unknown): v is ClassKind {
  return typeof v === "string" && (CLASS_KINDS as string[]).includes(v);
}
