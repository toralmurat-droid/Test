import type Phaser from "phaser";
import { HINTS, MUFFLED, RINGING, soundOf, TIER_COLOR, type MobSound } from "./songTables";

/**
 * Songweaver sound-hit cues (cosmetic): the "soundhit" sfx event says how a monster heard a hit. It can arrive before
 * or after the matching "hit" message, so both orders are handled: the damage number is tinted gold (ringing) or grey
 * (muffled) either way. Also the ear icon by a monster's name and the once-per-kind chat hint.
 */
export class SoundCues {
  private lastNum = new Map<string, { t: number; obj: Phaser.GameObjects.Text }>();
  private pending = new Map<string, { t: number; col: string }>();
  private wordAt = new Map<string, number>();
  private hinted = new Set<string>();

  /** The colour a sound hit gets, or undefined for a plain one. */
  private static tint(tier: string, match: boolean) {
    return match || tier === "keen" || tier === "fragile" ? RINGING : tier === "deaf" || tier === "dull" ? MUFFLED : undefined;
  }

  /** A damage number was just shown for monster `id` (call from the "hit" handler). */
  numberShown(id: string, obj: Phaser.GameObjects.Text | undefined, now: number) {
    if (!obj) return;
    const p = this.pending.get(id);
    if (p && now - p.t < 450) { obj.setColor(p.col); this.pending.delete(id); return; }
    if (this.lastNum.size > 80) this.lastNum.clear();
    this.lastNum.set(id, { t: now, obj });
  }

  /**
   * The "soundhit" event. `word` prints a short label (throttled per monster). Returns the chat hint to show, if this
   * is the first time this monster kind was heard (the caller says whether the hit is mine / close).
   */
  onSoundHit(ev: { id: string; tier: string; match?: boolean }, now: number, word: (text: string, col: string) => void, hint?: { kind: string; name: string }): string | undefined {
    const col = SoundCues.tint(ev.tier, !!ev.match);
    if (col) {
      const n = this.lastNum.get(ev.id);
      if (n && now - n.t < 450 && n.obj.active) { n.obj.setColor(col); this.lastNum.delete(ev.id); }
      else { if (this.pending.size > 80) this.pending.clear(); this.pending.set(ev.id, { t: now, col }); }
      if (now - (this.wordAt.get(ev.id) ?? 0) > 1200) {
        this.wordAt.set(ev.id, now);
        word(col === RINGING ? (ev.match ? "in tune" : "ringing") : "muffled", col);
      }
    }
    if (hint && !this.hinted.has(hint.kind)) {
      this.hinted.add(hint.kind);
      const t = HINTS[ev.tier as keyof typeof HINTS];
      if (t) return t.replace("{name}", hint.name);
    }
    return undefined;
  }

  /**
   * A small ear (tier colour) with a pitch arrow, drawn beside a monster's name. Placeholder pixel art: swap for the
   * skillIcons ear once the art agent adds one. `x`,`y` is the icon's top-left.
   */
  drawEar(g: Phaser.GameObjects.Graphics, x: number, y: number, kind: string) {
    const s: MobSound | undefined = soundOf(kind);
    if (!s) return;
    const c = TIER_COLOR[s.tier] ?? 0xe8e8e8;
    g.fillStyle(0x000000, 0.6).fillRect(x - 1, y - 1, 7, 9);
    g.fillStyle(c, 1).fillRect(x + 1, y, 3, 1).fillRect(x, y + 1, 5, 1).fillRect(x, y + 2, 2, 3).fillRect(x + 3, y + 2, 2, 2).fillRect(x + 1, y + 5, 3, 1).fillRect(x + 2, y + 6, 1, 1);
    if (s.tier === "deaf") g.fillStyle(0xff5252, 1).fillRect(x, y + 6, 1, 1).fillRect(x + 1, y + 5, 1, 1).fillRect(x + 4, y + 1, 1, 1).fillRect(x + 3, y + 2, 1, 1);
    if (s.tier === "fragile") g.fillStyle(0x000000, 1).fillRect(x + 2, y + 2, 1, 1).fillRect(x + 3, y + 3, 1, 1);
    // pitch arrow: up for high, down for low, a bar for mid
    const ax = x + 8;
    if (s.pitch === "H") g.fillStyle(0xffffff, 1).fillRect(ax + 1, y, 1, 1).fillRect(ax, y + 1, 3, 1).fillRect(ax + 1, y + 2, 1, 5);
    else if (s.pitch === "L") g.fillStyle(0xffffff, 1).fillRect(ax + 1, y, 1, 5).fillRect(ax, y + 5, 3, 1).fillRect(ax + 1, y + 6, 1, 1);
    else if (s.pitch === "M") g.fillStyle(0xffffff, 1).fillRect(ax, y + 3, 3, 1);
  }
}
