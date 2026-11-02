export const TILE = 32; // px per tile (same pixel size as the 32px heroes)
/** Tile art was first designed on a 16-unit grid: K = fine pixels per design unit. */
export const ART_K = TILE / 16;
export const MAP_W = 288; // tiles
export const MAP_H = 216; // tiles
export const TICK_RATE = 20; // server updates per second
export const PLAYER_SPEED = 90; // px per second (default; classes override, see classes.ts)
export const PLAYER_RADIUS = 5; // collision half-size in px
export const RESPAWN_MS = 2500;
// HP regeneration is based on the hero's Stamina stat (HP per second per Stamina point): every hero always
// regenerates a little, ramping up smoothly once out of combat, 3x faster on the plaza.
// e.g. Knight Lv1 (10 Stamina): 1 HP/s in combat, 5 HP/s out of combat, 15 HP/s on the plaza.
export const COMBAT_REGEN_PER_STA = 0.1;
export const REGEN_DELAY_MS = 3000; // no damage taken for this long -> out-of-combat regen starts ramping
export const REGEN_RAMP_MS = 3000; // ramp from combat rate to full rate over this time
export const REGEN_PER_STA = 0.5;
export const SAFE_REGEN_MULT = 3;
/** HP per second from Stamina: [in combat, out of combat]. */
export const regenFromStamina = (sta: number) => [sta * COMBAT_REGEN_PER_STA, sta * REGEN_PER_STA] as const;
export const HIT_RADIUS = 6; // body radius used for projectile / melee hit tests

export type Dir = "up" | "down" | "left" | "right";

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export type MobKind = "slime" | "skeleton" | "motherblob" | "blobling" | "shooterblob" | "warriorblob" | "healerblob" | "bandit" | "skeletonmage" | "necromancer";

export interface MobDef {
  name: string;
  maxHp: number;
  speed: number; // px per second
  damage: number;
  attackCooldownMs: number;
  aggroRange: number; // px
  leash: number; // max chase distance from home, px
  xp: number;
}

export const MOBS: Record<MobKind, MobDef> = {
  slime: { name: "Slime", maxHp: 40, speed: 45, damage: 8, attackCooldownMs: 1000, aggroRange: 80, leash: 140, xp: 10 },
  skeleton: { name: "Skeleton", maxHp: 80, speed: 62, damage: 14, attackCooldownMs: 900, aggroRange: 110, leash: 200, xp: 25 },
  // Big, slow slime that buds off bloblings now and then (see BROOD)
  motherblob: { name: "Mother Blob", maxHp: 200, speed: 28, damage: 12, attackCooldownMs: 1300, aggroRange: 70, leash: 120, xp: 60 },
  // Tiny, quick, fragile children of a Mother Blob; they never respawn on their own
  blobling: { name: "Blobling", maxHp: 14, speed: 58, damage: 4, attackCooldownMs: 800, aggroRange: 90, leash: 160, xp: 3 },
  // Higher-level blob zones: a ranged spitter, a helmeted brawler and a healer that keeps the others alive (see BLOB_AI)
  shooterblob: { name: "Shooter Blob", maxHp: 50, speed: 40, damage: 10, attackCooldownMs: 1800, aggroRange: 130, leash: 180, xp: 18 },
  warriorblob: { name: "Warrior Blob", maxHp: 110, speed: 52, damage: 16, attackCooldownMs: 1100, aggroRange: 100, leash: 170, xp: 26 },
  healerblob: { name: "Healer Blob", maxHp: 60, speed: 42, damage: 5, attackCooldownMs: 1200, aggroRange: 110, leash: 160, xp: 22 },
  // Outlaws of Redfang Hollow: quick, hit hard, hood and red bandana
  bandit: { name: "Bandit", maxHp: 95, speed: 64, damage: 15, attackCooldownMs: 950, aggroRange: 120, leash: 200, xp: 30 },
  // Higher skeleton zones: a robed caster that throws magic bolts from range, and the elite Necromancer (see SKELETON_AI)
  skeletonmage: { name: "Skeleton Mage", maxHp: 60, speed: 50, damage: 13, attackCooldownMs: 1900, aggroRange: 140, leash: 200, xp: 32 },
  necromancer: { name: "Necromancer", maxHp: 520, speed: 38, damage: 18, attackCooldownMs: 1700, aggroRange: 150, leash: 230, xp: 240 },
};

/** Elite monsters: much tougher than the rest of their zone, with a bigger look and an "Elite" tag. */
export const ELITE: Partial<Record<MobKind, true>> = { necromancer: true };

/**
 * Skeleton casters. Distances in px.
 * Mage: keeps its distance and throws magic bolts.
 * Necromancer: shadow bolts, raises skeletons around it, and Death Circle: a big telegraphed blast on the ground where you stand.
 */
export const SKELETON_AI = {
  mage: { range: 120, keepAway: 60, shotSpeed: 140, shotRadius: 3 },
  necro: {
    range: 140, keepAway: 70, shotSpeed: 165, shotRadius: 4, boltMult: 1.3,
    raise: { everyMs: 10000, count: 2, max: 5, spread: 22, castMs: 800 },
    circle: { range: 150, radius: 38, windupMs: 1300, cooldownMs: 7500, dmgMult: 2 },
  },
};

/** Special blob behaviour. Distances in px. */
export const BLOB_AI = {
  shooter: { range: 110, keepAway: 55, shotSpeed: 150, shotRadius: 3 }, // spits slime balls from a distance
  warrior: { chargeMin: 26, chargeMax: 72, chargeMs: 320, chargeMult: 3, cooldownMs: 4000 }, // lunges at you
  healer: { range: 70, everyMs: 3000, frac: 0.15, keepAway: 50 }, // heals the most hurt blob nearby, stays back
};

/**
 * Mother Blob grows with her level: a new look per tier (more armour the higher she is) and special moves.
 * Lv 5+: Belly Bounce, a short-range shockwave that knocks players back.
 * Lv 10+: Ground Slam, a big hit around her that also calls a swarm of bloblings.
 */
export const MOTHER = {
  tier: (level: number) => (level >= 10 ? 3 : level >= 5 ? 2 : 1),
  bounce: { level: 5, range: 34, radius: 42, windupMs: 600, cooldownMs: 7000, dmgMult: 0.8, knockback: 3 },
  slam: { level: 10, range: 70, radius: 66, windupMs: 900, cooldownMs: 15000, dmgMult: 1.8, knockback: 2, swarm: 5 },
};

/** Mother Blob brood: every few seconds (random) she may bud a blobling, up to `perMother` alive at once. */
export const BROOD = { minMs: 5000, maxMs: 12000, perMother: 4, worldCap: 160 };
/** How a monster's level scales its base stats (level 1 = the MOBS numbers). */
export const MOB_LEVEL = { hp: 0.3, damage: 0.12, xp: 0.25, gold: 0.2 }; // +x per level above 1
export function mobScale(level: number, stat: keyof typeof MOB_LEVEL): number {
  return 1 + MOB_LEVEL[stat] * (Math.max(1, level) - 1);
}

export const MOB_ATTACK_RANGE = 14; // px
