/**
 * Hero classes. All gameplay numbers live here so the server and client agree.
 * Art convention: the client picks a sprite by `Player.cls` ("knight" | "ninja" | "wizard").
 */
export type ClassKind = "knight" | "ninja" | "wizard" | "archer" | "barbarian" | "vampire" | "summoner";
export const CLASS_KINDS: ClassKind[] = ["knight", "ninja", "wizard", "archer", "barbarian", "vampire", "summoner"];

/**
 * Playable classes (Murat 2026-11-07): only these can be picked, played and are used by balance sims.
 * The rest are archived: code, art and saves are kept, but heroes of those classes cannot be played.
 */
export const ACTIVE_CLASSES: ClassKind[] = ["wizard", "vampire", "summoner"];
export const ARCHIVED_CLASSES: ClassKind[] = CLASS_KINDS.filter((c) => !ACTIVE_CLASSES.includes(c));
export function isActiveClass(v: unknown): v is ClassKind {
  return typeof v === "string" && (ACTIVE_CLASSES as string[]).includes(v);
}

export type SpecialKind = "guard" | "dash" | "nova" | "volley" | "rage" | "drain" | "summon";

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
  /** Summoner: this share of the hit is in the hero's attuned element (shared/summons.ts ATTUNE_ORDER). */
  attune?: number;
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
    name: "Knight", maxHp: 130, speed: 85, damage: 23, attackCooldownMs: 550, attackRange: 22,
    special: { kind: "guard", name: "Shield", cooldownMs: 6000, durationMs: 2000 },
    combo: [
      { damage: 1, knockback: 1 },
      { damage: 1.1, knockback: 1 },
      { damage: 1.6, knockback: 2.5, range: 30, cooldownMs: 800 }, // wide overhead slam
    ],
    blurb: "Tanky sword. Shield blocks 50% damage and knockback.",
  },
  ninja: {
    name: "Ninja", maxHp: 115, speed: 112, damage: 19, attackCooldownMs: 260, attackRange: 18,
    special: { kind: "dash", name: "Dash", cooldownMs: 2500, distance: 56 },
    combo: [
      { damage: 1, knockback: 0.5 },
      { damage: 1, knockback: 0.5 },
      { damage: 1.8, knockback: 1.5, lunge: 14, cooldownMs: 450 }, // lunging finisher
    ],
    blurb: "Fast, rapid strikes. Dash through enemies, briefly untouchable.",
  },
  wizard: {
    name: "Wizard", maxHp: 88, speed: 84, damage: 20, attackCooldownMs: 600, attackRange: 0,
    projectile: { speed: 235, range: 170, radius: 7, kind: "fireball" },
    special: { kind: "nova", name: "Nova", cooldownMs: 7000, damage: 40, radius: 46 },
    combo: [
      { damage: 1, knockback: 1 },
      { damage: 1, knockback: 1 },
      { damage: 1.7, knockback: 2, shotScale: 1.6, cooldownMs: 900 }, // big fireball
    ],
    blurb: "Ranged fireballs. Nova blasts everything around you.",
  },
  archer: {
    name: "Archer", maxHp: 90, speed: 96, damage: 15, attackCooldownMs: 450, attackRange: 0,
    projectile: { speed: 300, range: 175, radius: 4, kind: "arrow" },
    special: { kind: "volley", name: "Volley", cooldownMs: 6000, arrows: 3 },
    combo: [
      { damage: 1, knockback: 0.6 },
      { damage: 1, knockback: 0.6 },
      { damage: 1.8, knockback: 1.6, shotScale: 1.3, cooldownMs: 700 }, // power shot
    ],
    blurb: "Long-range arrows. Volley fires 3 arrows side by side.",
  },
  barbarian: {
    name: "Barbarian", maxHp: 130, speed: 90, damage: 21, attackCooldownMs: 480, attackRange: 20,
    special: { kind: "rage", name: "Rage", cooldownMs: 12000, durationMs: 4000 },
    combo: [
      { damage: 1, knockback: 1.2 },
      { damage: 1.1, knockback: 1.2 },
      { damage: 1.7, knockback: 2.2, range: 26, lunge: 10, cooldownMs: 750 }, // axe smash
    ],
    blurb: "Axe brawler. Rage: hit harder and move faster for 4s.",
  },
  // Warrior and caster in one (Murat 2026-11-05): a pale noble with a thin blade who fights up close and works blood magic.
  // Frailer than the fighters, but almost every skill drinks back part of the damage it deals (HitEffects.drain).
  vampire: {
    name: "Vampire", maxHp: 110, speed: 98, damage: 22, attackCooldownMs: 460, attackRange: 20,
    special: { kind: "drain", name: "Drain", cooldownMs: 8000 },
    combo: [
      { damage: 1, knockback: 0.8 },
      { damage: 1.05, knockback: 0.8 },
      { damage: 1.65, knockback: 1.6, range: 26, lunge: 12, cooldownMs: 700 }, // a lunging thrust that draws blood
    ],
    blurb: "Blade and blood magic. Every hit drinks back some of the life he spills.",
  },
  // The Summoner (Murat 2026-11-07): a masked occultist who fights through elemental golems (shared/summons.ts).
  // Frail and slow, a weak staff bolt of their own: the golems tank and hit, the Summoner keeps them alive and armed.
  summoner: {
    name: "Summoner", maxHp: 100, speed: 86, damage: 17, attackCooldownMs: 650, attackRange: 0,
    projectile: { speed: 230, range: 160, radius: 6, kind: "fireball" },
    special: { kind: "summon", name: "Elemental Golem", cooldownMs: 8000 },
    // Its own staff combo (Murat 2026-11-07): two quick bolts, then an elemental burst in the attuned element
    combo: [
      { damage: 1, knockback: 0.6 },
      { damage: 1.05, knockback: 0.6, cooldownMs: 560 },
      { damage: 1.8, knockback: 2, shotScale: 1.6, attune: 0.5, cooldownMs: 950 }, // elemental burst
    ],
    blurb: "Calls elemental golems that fight for them: cycle the element, then summon fire, frost, venom or storm.",
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

/** Class trait: % of the damage of every basic hit (any weapon) that heals the hero. The vampire drinks what he spills. */
export const BASIC_DRAIN: Partial<Record<ClassKind, number>> = { vampire: 5 };
export const basicDrain = (cls: string) => BASIC_DRAIN[cls as ClassKind] ?? 0;

export const GUARD_REDUCTION = 0.5; // knight shield blocks this fraction of damage
export const DASH_INVULN_MS = 250; // ninja is untouchable right after a dash

/**
 * Stamina: every hero has 100 points that refill fast. The dodge roll and physical skills spend it; basic attacks are
 * free. Spells spend Mana instead (shared/mana.ts). Shown as the yellow bar under the HP bar.
 */
export const ENERGY = { max: 100, regenPerSec: 14, cost: { special: 30, ult: 50, dodge: 20 } };
/**
 * Stamina per second by class: the fighters live on Stamina, the Wizard on Mana (Murat 2026-11-04: "some characters
 * rely more on stamina spend"). Wizard Stamina only pays for the dodge roll and Blink.
 */
export const STAMINA_REGEN: Record<ClassKind, number> = { knight: 16, ninja: 16, wizard: 8, archer: 15, barbarian: 18, vampire: 13, summoner: 9 };
export const staminaRegen = (cls: ClassKind) => STAMINA_REGEN[cls] ?? ENERGY.regenPerSec;
export const energyName = (_cls?: string) => "Stamina";

/** Dodge roll (F) for every hero: a quick roll in the move direction (or facing), untouchable while rolling. */
export const DODGE = { distance: 48, durationMs: 250, invulnMs: 300, cooldownMs: 1500 };

// ---- Levels -------------------------------------------------------------
/** Heroes and monsters both stop at Lv 30 for now (Murat 2026-11-04; was 99). */
export const MAX_LEVEL = 30;
export const PVP_KILL_XP = 20;

/** Total XP needed to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  return 40 * (level - 1) * level;
}

/** XP stops growing at max level. */
export const MAX_XP = xpForLevel(MAX_LEVEL);
export const capLevel = (l: number) => Math.min(MAX_LEVEL, Math.max(1, l));

export function levelFromXp(xp: number): number {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}

/** Level-up stats and powers live in shared/powers.ts. */

export function isClassKind(v: unknown): v is ClassKind {
  return typeof v === "string" && (CLASS_KINDS as string[]).includes(v);
}
