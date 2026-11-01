export const TILE = 16;
export const MAP_W = 160; // tiles
export const MAP_H = 120; // tiles
export const TICK_RATE = 20; // server updates per second
export const PLAYER_SPEED = 90; // px per second (default; classes override, see classes.ts)
export const PLAYER_RADIUS = 5; // collision half-size in px
export const RESPAWN_MS = 2500;
// HP regeneration: every hero always regenerates a little, ramping up smoothly once out of combat.
export const COMBAT_REGEN_PER_SEC = 0.008; // fraction of max HP per second while fighting
export const REGEN_DELAY_MS = 3000; // no damage taken for this long -> out-of-combat regen starts ramping
export const REGEN_RAMP_MS = 3000; // ramp from combat rate to full rate over this time
export const REGEN_PER_SEC = 0.04; // fraction of max HP per second out of combat
export const SAFE_REGEN_PER_SEC = 0.12; // faster regen on the plaza
export const HIT_RADIUS = 6; // body radius used for projectile / melee hit tests

export type Dir = "up" | "down" | "left" | "right";

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export type MobKind = "slime" | "skeleton" | "motherblob" | "blobling";

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
};

/** Mother Blob brood: every few seconds (random) she may bud a blobling, up to `perMother` alive at once. */
export const BROOD = { minMs: 5000, maxMs: 12000, perMother: 4, worldCap: 40 };
export const MOB_ATTACK_RANGE = 14; // px
