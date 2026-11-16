import Phaser from "phaser";
import { ISO } from "./isoflag";
import { dayPhase, dayTime } from "./details";

/**
 * Depth for heroes and monsters (Murat 2026-11-16, "shadows + height"), cosmetic only:
 *  - Cast shadows: each body throws its own silhouette onto the ground, the same frame of the same texture drawn
 *    flat and dark, so it batches with the sprites and costs one quad per character. The sun turns it over the day
 *    (long in the morning and evening, short at noon, light always from the top-left like the art); the moon leaves a
 *    faint one at night; underground it is a short dark pool under the feet.
 *  - Height: a leap, a pounce or a hard blow lifts the body off the ground along an arc while its shadow stays down,
 *    shrinking and fading as it rises. Only the drawing is lifted (iso.ts reads `__z` after projecting), so positions,
 *    movement smoothing, depth sorting and hit tests are untouched.
 */

/** Shadow colour, and its strength by day / by moonlight. */
const INK = 0x0d0a12, DAY_ALPHA = 0.5, MOON_ALPHA = 0.18, CAVE_ALPHA = 0.32;
/** Just above every ground painting (ground -2 .. -1.7, ground decals) and under everything standing. */
const DEPTH = -1.3;
/** The sun's time is read again this often (ms): it turns slowly. */
const SUN_EVERY = 1000;

interface Hop { t0: number; ms: number; h: number }
type Body = { sprite: Phaser.GameObjects.Sprite; mob: boolean; state: any };

export class CastShadows {
  private shadows = new Map<string, Phaser.GameObjects.Image>();
  private hops = new Map<string, Hop>();
  private seen = new Map<string, number>();
  private frame = 0;
  private sunAt = -1e9;
  // the light now: shadow rotation (rad), length and width factors, strength
  private rot = 0; private len = 0.6; private wid = 0.85; private alpha = DAY_ALPHA;

  constructor(private scene: Phaser.Scene, private underground: () => boolean) {}

  /** A body leaves the ground for `ms` along an arc `h` px high at its top (cosmetic). */
  hop(id: string, ms: number, h: number) {
    const cur = this.hops.get(id), now = this.scene.time.now;
    if (cur && now - cur.t0 < cur.ms && cur.h >= h) return; // already higher up
    this.hops.set(id, { t0: now, ms: Math.max(60, ms), h });
  }

  /** Call before the frame's bodies are synced. */
  begin(now: number) {
    this.frame++;
    if (now - this.sunAt >= SUN_EVERY) { this.sunAt = now; this.light(); }
  }

  /**
   * Lift and shadow of one body this frame: call after its sprite has its position, frame, flip and visibility, and
   * before anything that copies the sprite (gear overlays read the lift from it).
   */
  sync(id: string, e: Body, now: number) {
    const s = e.sprite as Phaser.GameObjects.Sprite & { __z?: number };
    // height off the ground
    let z = 0;
    const hop = this.hops.get(id);
    if (hop) {
      const u = (now - hop.t0) / hop.ms;
      if (u >= 1 || u < 0) this.hops.delete(id); else z = Math.sin(u * Math.PI) * hop.h;
    }
    s.__z = ISO && z > 0.25 ? Math.round(z) : 0;
    const p = e.state;
    const show = ISO && s.visible && s.alpha > 0.5 && !p.dead && !p.hidden && this.alpha > 0;
    let sh = this.shadows.get(id);
    if (!show) { if (sh?.visible) sh.setVisible(false); return; }
    if (!sh) {
      sh = this.scene.add.image(s.x, s.y, s.texture.key, s.frame.name).setTintFill(INK).setDepth(DEPTH);
      this.shadows.set(id, sh);
    }
    this.seen.set(id, this.frame);
    if (sh.texture !== s.texture || sh.frame !== s.frame) sh.setTexture(s.texture.key, s.frame.name);
    // in the air: the shadow shrinks and fades as the body rises
    const air = z > 0 ? Math.max(0.55, 1 - z / 60) : 1;
    sh.setPosition(s.x, s.y).setOrigin(s.originX, s.originY).setFlipX(s.flipX).setRotation(this.rot)
      .setScale(s.scaleX * this.wid * air, s.scaleY * this.len * air).setAlpha(this.alpha * air).setVisible(true);
  }

  /** Call after the frame's bodies: shadows of bodies not synced this frame (off screen, gone from view) hide. */
  end() {
    for (const [id, sh] of this.shadows) if (this.seen.get(id) !== this.frame && sh.visible) sh.setVisible(false);
  }

  drop(id: string) {
    this.shadows.get(id)?.destroy();
    this.shadows.delete(id); this.hops.delete(id); this.seen.delete(id);
  }

  /** Where the light comes from now: the sun's arc by day, the moon at night, a lamp overhead underground. */
  private light() {
    // Screen direction the shadow falls, in degrees (0 = right, 90 = down the screen), and its length
    let ang: number, len: number, alpha: number;
    if (this.underground()) { ang = 90; len = 0.32; alpha = CAVE_ALPHA; }
    else {
      const t = dayTime(Date.now()), { dark } = dayPhase(t);
      // the sun's way over the day: t 0.9 (dawn) .. 1 .. 0.65 (dusk), as 0 (morning) .. 1 (evening)
      const s = Math.min(1, Math.max(0, (t >= 0.9 ? t - 0.9 : t + 0.1) / 0.75));
      ang = 12 + 50 * s; // morning: falls to the right; evening: down the screen (light stays top-left)
      len = 0.5 + 0.45 * Math.abs(2 * s - 1); // long low sun, short at noon
      alpha = DAY_ALPHA * (1 - dark) + MOON_ALPHA * dark;
      if (dark > 0.5) { ang = 40; len = 0.55; } // moonlight: one soft angle all night
    }
    // The sprite's "up" (feet to head) is turned to point where the shadow falls
    this.rot = Phaser.Math.DegToRad(ang + 90);
    this.len = len; this.wid = 0.8; this.alpha = alpha;
  }
}
