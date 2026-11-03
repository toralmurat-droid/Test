import { ClassKind } from "./classes";
import { MobKind } from "./constants";

/**
 * Initiative ("poise"): a hidden bar on every hero and monster that decides who controls a fight.
 *  - Every hit drains the target's poise by the damage dealt (skills drain more, a raised shield much less).
 *  - Getting hit makes you flinch: your next attack is pushed back a little, and a monster's wind-up is cancelled,
 *    so whoever lands the first hit keeps the upper hand instead of both sides trading blows at the same time.
 *  - Below half poise you attack slower (down to 60% speed at 0).
 *  - At 0 the target is broken (dizzy): it cannot attack or use skills for a moment. Monsters turn and try to
 *    get away; heroes can still move and dodge. Then poise refills completely and the target is steady (can't
 *    be broken again) for a short time, so nobody gets locked forever.
 *  - Poise comes back on its own after a short time without being hit.
 * Monsters also wind up before each attack (a short telegraph), which a hit interrupts.
 */
export const POISE = {
  regenDelayMs: 1500, // no poise damage for this long -> poise refills
  regenPerSec: 0.35, // fraction of max poise per second
  heroBrokenMs: 1200,
  mobBrokenMs: 1800,
  steadyMs: 1500, // after recovering, poise can't be drained for this long
  skillMult: 1.3, // skills and ultimates break poise faster
  guardMult: 0.3, // Knight shield
  heroFlinchMs: 120, // a hero hit while attacking waits this much longer for the next attack
  mobFlinchMs: 350, // a monster hit cancels its wind-up and waits at least this long
  slowBelow: 0.5, // below this fraction of poise, attacks get slower
  minSpeed: 0.6, // attack speed multiplier at 0 poise
  fleeSpeed: 0.9, // broken monsters run away at this fraction of their speed
} as const;

/** Base poise per hero (+12% per level above 1, so it keeps up with damage growth). Heavy fighters hold their ground longer. */
export const HERO_POISE: Record<ClassKind, number> = { knight: 90, barbarian: 80, archer: 55, ninja: 70, wizard: 55 };
export const heroPoise = (cls: ClassKind, level: number) => Math.round(HERO_POISE[cls] * (1 + 0.12 * (Math.max(1, level) - 1)));

/** Monster poise (scaled like HP by level) and attack wind-up. */
export const MOB_COMBAT: Record<MobKind, { poise: number; windupMs: number }> = {
  slime: { poise: 30, windupMs: 350 },
  skeleton: { poise: 55, windupMs: 300 },
  crawler: { poise: 20, windupMs: 320 },
  motherblob: { poise: 110, windupMs: 500 },
  blobling: { poise: 8, windupMs: 220 },
  shooterblob: { poise: 25, windupMs: 450 },
  warriorblob: { poise: 75, windupMs: 380 },
  healerblob: { poise: 25, windupMs: 300 },
  bandit: { poise: 60, windupMs: 300 },
  skeletonmage: { poise: 30, windupMs: 450 },
  necromancer: { poise: 220, windupMs: 500 },
};

/** Attack speed multiplier from the poise fraction (1 above half, down to minSpeed at 0). */
export function poiseSpeed(frac: number): number {
  if (frac >= POISE.slowBelow) return 1;
  return POISE.minSpeed + (1 - POISE.minSpeed) * Math.max(0, frac) / POISE.slowBelow;
}

/** Attack speed bonus while raging (Barbarian). */
export const RAGE_ATTACK_SPEED = 1.15;

/**
 * Level difference: hitting a higher-level opponent drains less poise (-15% per level above you, down to 20%),
 * a lower-level one drains more (+10% per level below, up to +50%). Works the same for monsters hitting heroes.
 */
export const POISE_LEVEL = { perLevelAbove: 0.15, perLevelBelow: 0.1, min: 0.2, max: 1.5 } as const;
export function poiseLevelMult(attackerLevel: number, targetLevel: number): number {
  const d = (targetLevel || 1) - (attackerLevel || 1);
  const m = d > 0 ? 1 - POISE_LEVEL.perLevelAbove * d : 1 - POISE_LEVEL.perLevelBelow * d;
  return Math.min(POISE_LEVEL.max, Math.max(POISE_LEVEL.min, m));
}
