import type Phaser from "phaser";
import { MUFFLED, RINGING } from "./songTables";

/**
 * Songweaver sound-hit cues (cosmetic): the "soundhit" sfx event says how a monster heard a hit. The server sends the
 * matching "hit" first, then "soundhit" in the same tick (the hit, then afterHit; a killing blow sends no soundhit),
 * so the damage number is tinted gold (ringing) or grey (muffled) after the fact. The ear and note icons and the
 * sound hint text are in the monster plate (monsterBar.ts), no longer in chat.
 */
export class SoundCues {
  private lastNum = new Map<string, { t: number; obj: Phaser.GameObjects.Text }>();
  private wordAt = new Map<string, number>();

  /** The colour a sound hit gets, or undefined for a plain one. */
  private static tint(tier: string, match: boolean) {
    return match || tier === "keen" || tier === "fragile" ? RINGING : tier === "deaf" || tier === "dull" ? MUFFLED : undefined;
  }

  /** A damage number was just shown for monster `id` (call from the "hit" handler). */
  numberShown(id: string, obj: Phaser.GameObjects.Text | undefined, now: number) {
    if (!obj) return;
    if (this.lastNum.size > 80) this.lastNum.clear();
    this.lastNum.set(id, { t: now, obj });
  }

  /** The "soundhit" event. `word` prints a short label (throttled per monster). */
  onSoundHit(ev: { id: string; tier: string; match?: boolean }, now: number, word: (text: string, col: string) => void) {
    const col = SoundCues.tint(ev.tier, !!ev.match);
    if (col) {
      const n = this.lastNum.get(ev.id);
      if (n && now - n.t < 450 && n.obj.active) { n.obj.setColor(col); this.lastNum.delete(ev.id); }
      if (now - (this.wordAt.get(ev.id) ?? 0) > 1200) {
        this.wordAt.set(ev.id, now);
        word(col === RINGING ? (ev.match ? "in tune" : "ringing") : "muffled", col);
      }
    }
  }
}
