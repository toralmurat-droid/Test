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
  /** Summoner: this share of the hit is in the element of the hero's first golem (grimoire page 1, shared/summons.ts). */
  attune?: number;
  /** The bolt bursts where it lands: other foes within this many px take half its damage (the Summoner's finisher). */
  burst?: number;
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
  /** `portal`: the bolt comes out of a Void portal next to the foe (the Summoner, shared/summons.ts PORTAL). */
  projectile?: { speed: number; range: number; radius: number; kind: "fireball" | "arrow"; portal?: boolean };
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
    // Void Lord rework (Murat 2026-11-08): the staff bolt goes through a Void portal, longer reach (220 px, was 160)
    projectile: { speed: 230, range: 220, radius: 6, kind: "fireball", portal: true },
    special: { kind: "summon", name: "Elemental Golem", cooldownMs: 8000 },
    // Its own staff combo (Murat 2026-11-07): two quick bolts, then a burst half in the element of the first golem (grimoire)
    combo: [
      { damage: 1, knockback: 0.6 },
      { damage: 1.05, knockback: 0.6, cooldownMs: 560 },
      { damage: 1.8, knockback: 2, shotScale: 1.6, attune: 0.5, burst: 30, cooldownMs: 950 }, // elemental burst
    ],
    blurb: "Lord of the Void: permanent elemental golems, wisps and Void weapons fight for them; black holes swallow foes and projectiles.",
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
 * Heat cooling per second by class (shared/overload.ts): the fighters shed Heat fast, the casters slowly (they live on
 * Mana). Was the Stamina refill rate before the overload gauge replaced Stamina (Murat 2026-11-07).
 */
export const STAMINA_REGEN: Record<ClassKind, number> = { knight: 16, ninja: 16, wizard: 8, archer: 15, barbarian: 18, vampire: 13, summoner: 9 };

/** Dodge roll (F) for every hero: a quick roll in the move direction (or facing), untouchable while rolling. */
export const DODGE = { distance: 48, durationMs: 250, invulnMs: 300, cooldownMs: 1500 };

// ---- Levels -------------------------------------------------------------
/**
 * Heroes and monsters stop at Lv 50 (Murat 2026-11-08): the first zone (Oakvale) covers Lv 1-30, the desert of Act 2
 * Lv 30-50 (REGION_LEVEL / ACT2_LEVEL in constants.ts). Was 30 (2026-11-04), 99 before that.
 */
export const MAX_LEVEL = 50;
export const PVP_KILL_XP = 20;

/**
 * XP from `level` to the next (Murat 2026-11-08: leveling slows down as you go). Each level costs ~4.5% more than a straight
 * line, so on-level kills per level climb from ~3 at Lv 2 to ~26 at Lv 29; Act 2 (Lv 30+, where monsters give about twice
 * the XP) costs another x1.35, climbing from ~19 kills at Lv 30 to ~46 at Lv 49. Was a flat 80 x level.
 */
export function xpStep(level: number): number {
  return Math.round((80 * level * Math.pow(1.045, level - 1) * (level >= 30 ? 1.35 : 1)) / 10) * 10;
}

const XP_TABLE: number[] = [0, 0];
for (let l = 2; l <= MAX_LEVEL; l++) XP_TABLE[l] = XP_TABLE[l - 1] + xpStep(l - 1);

/** Total XP needed to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return XP_TABLE[l] + (level > MAX_LEVEL ? xpStep(MAX_LEVEL) * (Math.floor(level) - MAX_LEVEL) : 0);
}

/** The XP curve before 2026-11-08 (80 x level per level): saves without `xpv` are converted from it. */
export const XP_CURVE_VERSION = 2;
export const oldXpForLevel = (level: number) => 40 * (level - 1) * level;

/** Carry a hero's XP from the old curve to this one: same level, same share of the way to the next. */
export function convertOldXp(xp: number, level: number): number {
  const L = capLevel(level);
  if (L >= MAX_LEVEL) return xpForLevel(MAX_LEVEL);
  const lo = oldXpForLevel(L), hi = oldXpForLevel(L + 1);
  const frac = Math.min(0.99, Math.max(0, (xp - lo) / (hi - lo)));
  return xpForLevel(L) + Math.floor(frac * (xpForLevel(L + 1) - xpForLevel(L)));
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
