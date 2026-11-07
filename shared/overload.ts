import { STAMINA_REGEN, type ClassKind } from "./classes";

/**
 * Overload (Murat 2026-11-07: "instead of a stamina bar, a stamina overload mechanism"). Physical skills and the dodge
 * roll no longer spend a Stamina pool: they build Heat. Heat cools by itself all the time (per class, STAMINA_REGEN).
 * A skill can always be used while the hero is not overheated, even when it pushes Heat past the top: then the hero
 * overloads and every Heat skill (and the dodge) is locked for OVERLOAD.ventMs while the gauge drains to empty.
 *
 * Player.energy (synced) carries it in one number: 0..max = Heat, below 0 = overheated (-energy = Heat still venting).
 * Shown by client/src/overloadGauge.ts on the left side of the screen.
 */
export const OVERLOAD = {
  max: 100,
  ventMs: 3500, // locked out this long after overloading
  dodge: 20, // Heat of a dodge roll
};

export interface Heated { energy?: number }

export const isOverheated = (u: Heated) => (u.energy ?? 0) < 0;
/** Heat 0..max, venting or not. */
export const heatOf = (u: Heated) => Math.min(OVERLOAD.max, Math.abs(u.energy ?? 0));

/** Adds Heat; past the top the hero overloads. Returns true when this push overloaded. */
export function addHeat(u: Heated, amount: number): boolean {
  if (amount <= 0 || isOverheated(u)) return false; // venting: nothing more goes in (callers check first anyway)
  const e = (u.energy ?? 0) + amount;
  if (e >= OVERLOAD.max) { u.energy = -OVERLOAD.max; return true; }
  u.energy = e;
  return false;
}

/** Heat per second a class sheds while not overheated. */
export const coolRate = (cls: ClassKind) => STAMINA_REGEN[cls] ?? 12;

/** Cools for dt seconds: steady per-class cooling, or the fixed vent while overheated. Returns true when a vent ends. */
export function coolHeat(u: Heated, cls: ClassKind, dt: number): boolean {
  const e = u.energy ?? 0;
  if (e < 0) {
    const v = e + (OVERLOAD.max / (OVERLOAD.ventMs / 1000)) * dt;
    u.energy = v >= 0 ? 0 : v;
    return v >= 0;
  }
  if (e > 0) u.energy = Math.max(0, e - coolRate(cls) * dt);
  return false;
}

/** Seconds of lockout left (0 when not overheated). */
export const ventLeft = (u: Heated) => isOverheated(u) ? (heatOf(u) / OVERLOAD.max) * OVERLOAD.ventMs / 1000 : 0;
