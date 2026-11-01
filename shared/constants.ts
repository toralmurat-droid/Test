export const TILE = 32; // px per tile (same pixel size as the 32px heroes)
/** Tile art was first designed on a 16-unit grid: K = fine pixels per design unit. */
export const ART_K = TILE / 16;
export const MAP_W = 224; // tiles
export const MAP_H = 168; // tiles
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

export type MobKind = "slime" | "skeleton" | "motherblob" | "blobling" | "shooterblob" | "warriorblob" | "healerblob";

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
};

/** Special blob behaviour. Distances in px. */
export const BLOB_AI = {
  shooter: { range: 110, keepAway: 55, shotSpeed: 150, shotRadius: 3 }, // spits slime balls from a distance
  warrior: { chargeMin: 26, chargeMax: 72, chargeMs: 320, chargeMult: 3, cooldownMs: 4000 }, // lunges at you
  healer: { range: 70, everyMs: 3000, frac: 0.15, keepAway: 50 }, // heals the most hurt blob nearby, stays back
};

/** Mother Blob brood: every few seconds (random) she may bud a blobling, up to `perMother` alive at once. */
export const BROOD = { minMs: 5000, maxMs: 12000, perMother: 4, worldCap: 40 };
/** How a monster's level scales its base stats (level 1 = the MOBS numbers). */
export const MOB_LEVEL = { hp: 0.3, damage: 0.12, xp: 0.25, gold: 0.2 }; // +x per level above 1
export function mobScale(level: number, stat: keyof typeof MOB_LEVEL): number {
  return 1 + MOB_LEVEL[stat] * (Math.max(1, level) - 1);
}

export const MOB_ATTACK_RANGE = 14; // px
