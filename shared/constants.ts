export const TILE = 16;
export const MAP_W = 64; // tiles
export const MAP_H = 48; // tiles
export const TICK_RATE = 20; // server updates per second
export const PLAYER_SPEED = 90; // px per second
export const PLAYER_RADIUS = 5; // collision half-size in px
export const MAX_HP = 100;
export const ATTACK_DAMAGE = 20;
export const ATTACK_RANGE = 22; // px
export const ATTACK_COOLDOWN_MS = 450;
export const RESPAWN_MS = 2500;

export type Dir = "up" | "down" | "left" | "right";

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}
