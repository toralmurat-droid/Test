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
export const HERO_POISE: Record<ClassKind, number> = { knight: 90, barbarian: 80, archer: 55, ninja: 90, wizard: 55, vampire: 70, summoner: 55 };
export const heroPoise = (cls: ClassKind, level: number) => Math.round(HERO_POISE[cls] * (1 + 0.12 * (Math.max(1, level) - 1)));

/** Monster poise (scaled like HP by level) and attack wind-up. */
export const MOB_COMBAT: Record<MobKind, { poise: number; windupMs: number }> = {
  golem_fire: { poise: 140, windupMs: 420 }, golem_cold: { poise: 160, windupMs: 420 },
  golem_poison: { poise: 140, windupMs: 420 }, golem_shock: { poise: 120, windupMs: 380 }, golem_colossus: { poise: 400, windupMs: 560 },
  bride: { poise: 60, windupMs: 140 },
  wisp: { poise: 30, windupMs: 0 },
  slime: { poise: 30, windupMs: 350 },
  skeleton: { poise: 55, windupMs: 300 },
  crawler: { poise: 20, windupMs: 320 },
  demon: { poise: 260, windupMs: 520 },
  motherblob: { poise: 110, windupMs: 500 },
  blobling: { poise: 8, windupMs: 220 },
  shooterblob: { poise: 25, windupMs: 450 },
  warriorblob: { poise: 75, windupMs: 380 },
  healerblob: { poise: 25, windupMs: 300 },
  venomblob: { poise: 35, windupMs: 400 },
  frostblob: { poise: 90, windupMs: 420 },
  fireblob: { poise: 80, windupMs: 380 },
  stormblob: { poise: 45, windupMs: 260 },
  bandit: { poise: 60, windupMs: 300 },
  skeletonmage: { poise: 30, windupMs: 450 },
  necromancer: { poise: 220, windupMs: 500 },
  banditchief: { poise: 260, windupMs: 420 },
  hollowking: { poise: 420, windupMs: 480 },
  gnawkin: { poise: 30, windupMs: 240 },
  tuskborn: { poise: 110, windupMs: 420 },
  silkwretch: { poise: 45, windupMs: 340 },
  duskwing: { poise: 40, windupMs: 280 },
  crowseer: { poise: 40, windupMs: 420 },
  gnasher: { poise: 220, windupMs: 340 },
  weaver: { poise: 230, windupMs: 380 },
  packlord: { poise: 240, windupMs: 360 },
  hornbrute: { poise: 320, windupMs: 480 },
  hidemother: { poise: 400, windupMs: 460 },
  nomad: { poise: 50, windupMs: 260 },
  scorpion: { poise: 90, windupMs: 380 },
  sanddead: { poise: 70, windupMs: 340 },
  veiled: { poise: 40, windupMs: 420 },
  camelfolk: { poise: 140, windupMs: 440 },
  sphinx: { poise: 160, windupMs: 420 },
  sunwright: { poise: 460, windupMs: 480 },
  nightraider: { poise: 3000, windupMs: 460 }, // barely flinches: a hero alone can hardly break it
};

/** Attack speed multiplier from the poise fraction (1 above half, down to minSpeed at 0). */
export function poiseSpeed(frac: number): number {
  if (frac >= POISE.slowBelow) return 1;
  return POISE.minSpeed + (1 - POISE.minSpeed) * Math.max(0, frac) / POISE.slowBelow;
}

/**
 * Hero against hero (balance pass 2026-11-04): damage between heroes shrinks as they level, so high-level duels last
 * a few seconds instead of ending with the first ultimate. Lv 1 = full damage, Lv 10 = 74%, Lv 20 = 57%, Lv 30 = 46%
 * (the two heroes' average level). Monsters are not affected.
 */
export const PVP_DAMAGE = { perLevel: 0.04 } as const;
export function pvpDamageMult(attackerLevel: number, targetLevel: number): number {
  const lvl = ((attackerLevel || 1) + (targetLevel || 1)) / 2;
  return 1 / (1 + PVP_DAMAGE.perLevel * Math.max(0, lvl - 1));
}

/**
 * Newcomer protection: heroes up to this level can't hurt other heroes and can't be hurt by them (both ways).
 * 0 = off (Murat 2026-11-07): any hero can fight any other hero outside the Market Square, at any level.
 */
export const PVP_PROTECT_LEVEL = 0;
export const pvpProtected = (attackerLevel: number, targetLevel: number) =>
  (attackerLevel || 1) <= PVP_PROTECT_LEVEL || (targetLevel || 1) <= PVP_PROTECT_LEVEL;

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

/**
 * Melee reach. A basic swing hits everything whose body is within `range` of a point 12 px in front of the hero
 * (both scaled by long weapons). Monsters have a body: big ones (Mother Blob, Bone Demon, the Chief) can be hit
 * on their edge, not only at their feet. Heroes count as a point, so PvP reach stays as it was.
 */
export const SWING_AHEAD = 12;
const MOB_BODY: Partial<Record<MobKind, number>> = {
  golem_fire: 9, golem_cold: 9, golem_poison: 9, golem_shock: 9, golem_colossus: 14,
  motherblob: 14, demon: 12, hollowking: 13, banditchief: 10, nightraider: 12, necromancer: 8, warriorblob: 7, blobling: 3, crawler: 4,
};
export const mobBody = (kind: MobKind) => MOB_BODY[kind] ?? 6;
/** Farthest a target's feet can be from the hero's feet and still be hit, straight ahead. */
export const meleeReach = (range: number, reachMult: number, body = 0) => (SWING_AHEAD + range) * reachMult + body;

/**
 * Execution (Lot D, 2026-11): breaking a monster's poise pays off. While a monster is broken (dizzy, POISE.mobBrokenMs),
 * the first blow a hero lands on it with their own basic attack or a skill is an execution:
 *  - damage x`mult` (x`bossMult` on elites, mini-bosses, quest bosses and the Night Raiders). A critical execution is not
 *    doubled again: the crit is taken back out first (crits deal x`critMult`, shared/powers.ts), so it stays x`mult`;
 *  - it gives the hero some breath back: Heat drops by `heatBack` (a share of OVERLOAD.max, shared/overload.ts; an
 *    overheated hero's vent gets that much shorter). Classes that pay mostly in Mana (`manaClasses`: Wizard, Summoner)
 *    get `manaBack` of their max Mana instead. One rule per class, no mix, so it reads plainly.
 *  - One execution per break: the monster must be broken again for the next one.
 * Never on heroes (nor on a hero's creatures), and never from a hero's creatures (golems, wisps), runes, thorns or
 * damage over time: only the hero's own blow.
 */
export const EXECUTE = {
  mult: 2,
  bossMult: 1.5,
  critMult: 2,
  heatBack: 0.3, // share of OVERLOAD.max
  manaBack: 0.1, // share of max Mana
  manaClasses: { wizard: true, summoner: true } as Partial<Record<ClassKind, true>>,
};

/** What an execution needs to know about the blow (server HitOpts / skillEngine HitOpts fit). */
export interface ExecBlow { basic?: boolean; skill?: boolean; dot?: boolean; rune?: boolean; thorn?: boolean; pet?: boolean }
/** What it needs to know about the target: broken, and whether this break was already executed. */
export interface ExecTarget { broken: boolean; execSpent?: boolean }

/** The hero's own blow (basic attack or skill), not a creature's, a rune's, a thorn's or a damage-over-time tick. */
export const executingBlow = (o: ExecBlow) => !!(o.basic || o.skill) && !o.dot && !o.rune && !o.thorn && !o.pet;
/** Does this blow execute this monster? (The caller checks it is a monster hit by a hero.) */
export const canExecute = (o: ExecBlow, t: ExecTarget) => t.broken && !t.execSpent && executingBlow(o);
/** Damage of an execution: the blow without its crit, times the execution multiplier. */
export const executeDamage = (dmg: number, crit: boolean, boss: boolean) =>
  (dmg / (crit ? EXECUTE.critMult : 1)) * (boss ? EXECUTE.bossMult : EXECUTE.mult);

/** Gives the executing hero their breath back (see EXECUTE). `heatMax` = OVERLOAD.max. Returns what came back. */
export function executeRefund(u: { energy?: number; mana?: number; maxMana?: number }, cls: ClassKind, heatMax: number): { heat: number; mana: number } {
  if (EXECUTE.manaClasses[cls]) {
    const max = u.maxMana ?? 0, before = u.mana ?? 0;
    u.mana = Math.min(max, before + max * EXECUTE.manaBack);
    return { heat: 0, mana: u.mana - before };
  }
  const e = u.energy ?? 0, back = heatMax * EXECUTE.heatBack;
  u.energy = e < 0 ? Math.min(0, e + back) : Math.max(0, e - back); // Heat goes down; a vent gets shorter
  return { heat: Math.abs(e) - Math.abs(u.energy), mana: 0 };
}
