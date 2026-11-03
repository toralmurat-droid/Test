import Phaser from "phaser";
import { CHAR_ORIGIN, CHAR_SCALE, playCharAnim } from "./artAssets";
import { ISO, screenDir8 } from "./iso";

/** Facing for a world-space vector: 8 ways on screen in the iso view, 4 ways top-down. */
export function faceOf(dx: number, dy: number, fallback = "down"): string {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return fallback;
  if (ISO) return screenDir8(dx, dy, fallback);
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
}

interface Man { sprite: Phaser.GameObjects.Sprite; s: any; x: number; y: number; swing: number; face: string; anim: string; busyUntil: number }

/**
 * The gate watch (server TownRoom.updateWatch, shared/watch.ts): watchman sprites that follow the server, march out to
 * spear monsters near the gates and walk back to their posts.
 */
export class WatchLayer {
  private men = new Map<string, Man>();

  constructor(private scene: Phaser.Scene, watch: any) {
    watch?.onAdd((s: any, id: string) => {
      const sprite = scene.add.sprite(s.x, s.y, "watchman", 0).setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y).setScale(CHAR_SCALE).setDepth(s.y);
      const m: Man = { sprite, s, x: s.x, y: s.y, swing: s.swing, face: faceOf(s.ax, s.ay), anim: "", busyUntil: 0 };
      this.men.set(id, m);
      this.play(m, "idle");
    });
    watch?.onRemove((_s: any, id: string) => { this.men.get(id)?.sprite.destroy(); this.men.delete(id); });
  }

  private play(m: Man, anim: string, force = false) {
    const key = `${anim}|${m.face}`;
    if (!force && m.anim === key) return;
    m.anim = key;
    playCharAnim(m.sprite, "watchman", anim, m.face);
  }

  update(dtMs: number) {
    const now = this.scene.time.now, k = 1 - Math.pow(0.001, dtMs / 1000 * 4); // smooth follow of the 20 Hz server
    for (const m of this.men.values()) {
      const s = m.s;
      m.x += (s.x - m.x) * k; m.y += (s.y - m.y) * k;
      m.sprite.setPosition(m.x, m.y).setDepth(m.y);
      m.face = faceOf(s.ax, s.ay, m.face);
      if (s.swing !== m.swing) {
        m.swing = s.swing;
        this.play(m, m.swing % 2 ? "attack3" : "attack", true); // alternate a hard thrust and a quick jab
        m.busyUntil = now + 450;
        continue;
      }
      if (now < m.busyUntil) continue;
      // walk only while he is really on his way (the sprite still catching up with the server counts too)
      this.play(m, s.moving || Math.hypot(s.x - m.x, s.y - m.y) > 1.5 ? "walk" : "idle");
    }
  }
}
