import type { MobKind } from "./constants";

/**
 * The world clock (shared by server and every client through the wall clock): a 30-minute day of about
 * 19 min daylight, 2 min dusk, 6 min night and 3 min dawn. t is 0..1 of the cycle (see client dayPhase).
 */
export const DAY_CYCLE_MS = 30 * 60 * 1000;

export function dayFrac(nowMs: number): number {
  return (((nowMs % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS) / DAY_CYCLE_MS;
}

/**
 * The dead keep the night (Murat 2026-11-05): by day most skeletons lie in the earth and their bosses do not walk;
 * they climb out from the middle of dusk until late in the dawn (about 8.5 of the 30 minutes).
 */
export const UNDEAD_NIGHT = {
  from: 0.68, to: 0.965,
  /** Share of a skeleton zone's monsters still up by day (busy at the siege works, a few on watch) */
  dayShare: 0.3,
  /** By night an undead zone below its count gets one climbing out of the ground this often (ms) */
  riseMs: 700,
  /** By day the dead only sink into the ground with no hero this close (px) */
  sinkClear: 14 * 32,
};

/** Bosses of the dead: only about at night (zone elites, ritual and quest demons, the Pale Marshal, the Hollow King). */
export const NIGHT_BOSSES: MobKind[] = ["necromancer", "demon", "hollowking"];

export function isUndeadNight(t: number): boolean {
  return t >= UNDEAD_NIGHT.from && t < UNDEAD_NIGHT.to;
}

/** Ms until the dead next rise (0 when they are up). */
export function msUntilUndeadNight(t: number): number {
  if (isUndeadNight(t)) return 0;
  return ((UNDEAD_NIGHT.from - t + 1) % 1) * DAY_CYCLE_MS;
}
