export const TILE = 16;
export const MAP_W = 160; // tiles
export const MAP_H = 120; // tiles
export const TICK_RATE = 20; // server updates per second
export const PLAYER_SPEED = 90; // px per second (default; classes override, see classes.ts)
export const PLAYER_RADIUS = 5; // collision half-size in px
export const RESPAWN_MS = 2500;
export const REGEN_DELAY_MS = 5000; // no damage taken for this long -> regenerate
export const REGEN_PER_SEC = 0.03; // fraction of max HP per second
export const SAFE_REGEN_PER_SEC = 0.12; // faster regen on the plaza
export const HIT_RADIUS = 6; // body radius used for projectile / melee hit tests

export type Dir = "up" | "down" | "left" | "right";

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export type MobKind = "slime" | "skeleton";

export interface MobDef {
  name: string;
  maxHp: number;
  speed: number; // px per second
  damage: number;
  attackCooldownMs: number;
  aggroRange: number; // px
  leash: number; // max chase distance from home, px
  xp: number;
  count: number; // how many live in the world
  respawnMs: number;
}

export const MOBS: Record<MobKind, MobDef> = {
  slime: { name: "Slime", maxHp: 40, speed: 45, damage: 8, attackCooldownMs: 1000, aggroRange: 80, leash: 140, xp: 10, count: 14, respawnMs: 8000 },
  skeleton: { name: "Skeleton", maxHp: 80, speed: 62, damage: 14, attackCooldownMs: 900, aggroRange: 110, leash: 200, xp: 25, count: 6, respawnMs: 12000 },
};
export const MOB_ATTACK_RANGE = 14; // px
