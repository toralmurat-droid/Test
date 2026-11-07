import Phaser from "phaser";

/**
 * Screen shake, kept calm (Murat 2026-11-04: the whole screen stuttering on every hit made combat confusing).
 * At 3x zoom even a "small" shake moves every pixel on screen, so ordinary hits, swings and skills no longer
 * shake at all. Only the whitelisted moments below give one short, soft nudge, and a
 * shake that is already running is never restarted or stacked.
 *
 * Very few shakes (Murat 2026-11-07): ONLY major bosses, level-up and the village guards' wrath. Hero skills and
 * spells NEVER shake the screen, for every class. Every call names its reason; tests/no-hero-shake.test.ts holds the
 * whitelist of allowed calls and fails CI on any other. In dev builds a call from a hero FX file is refused with a
 * console warning.
 */
const HERO_FX = /(skillfx|skillMoves|skillMoveData|elemFx|gearfx|beastFx)\.ts/;
export type ShakeReason = "major-boss" | "level-up" | "village-guards";
export function quake(scene: Phaser.Scene, ms: number, k: number, _why: ShakeReason) {
  if (import.meta.env?.DEV && HERO_FX.test(new Error().stack ?? "")) {
    console.warn("[camfx] Screen shake refused: hero skills/spells must not shake the screen (Murat's rule).");
    return;
  }
  if (k < 0.006) return;
  const cam = scene.cameras.main;
  if (cam.shakeEffect.isRunning) return;
  cam.shake(Math.min(ms, 160), 0.0012);
}
