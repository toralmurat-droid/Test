import Phaser from "phaser";

/**
 * Screen shake, kept calm (Murat 2026-11-04: the whole screen stuttering on every hit made combat confusing).
 * At 3x zoom even a "small" shake moves every pixel on screen, so ordinary hits, swings and skills no longer
 * shake at all. Only big blows (boss slams, a demon's hellfire, huge skills) give one short, soft nudge, and a
 * shake that is already running is never restarted or stacked.
 *
 * Hero skills and spells NEVER shake the screen (Murat 2026-11-07), for every class. Only monsters, bosses and the
 * world may call this. tests/no-hero-shake.test.ts fails CI on a shake in a hero FX file, and in dev builds a call
 * coming from one is refused with a console warning.
 */
const HERO_FX = /(skillfx|skillMoves|skillMoveData|elemFx|gearfx|beastFx)\.ts/;
export function quake(scene: Phaser.Scene, ms: number, k: number) {
  if (import.meta.env?.DEV && HERO_FX.test(new Error().stack ?? "")) {
    console.warn("[camfx] Screen shake refused: hero skills/spells must not shake the screen (Murat's rule).");
    return;
  }
  if (k < 0.006) return;
  const cam = scene.cameras.main;
  if (cam.shakeEffect.isRunning) return;
  cam.shake(Math.min(ms, 160), 0.0012);
}
