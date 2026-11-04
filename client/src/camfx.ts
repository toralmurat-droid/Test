import Phaser from "phaser";

/**
 * Screen shake, kept calm (Murat 2026-11-04: the whole screen stuttering on every hit made combat confusing).
 * At 3x zoom even a "small" shake moves every pixel on screen, so ordinary hits, swings and skills no longer
 * shake at all. Only big blows (boss slams, a demon's hellfire, huge skills) give one short, soft nudge, and a
 * shake that is already running is never restarted or stacked.
 */
export function quake(scene: Phaser.Scene, ms: number, k: number) {
  if (k < 0.006) return;
  const cam = scene.cameras.main;
  if (cam.shakeEffect.isRunning) return;
  cam.shake(Math.min(ms, 160), 0.0012);
}
