import type Phaser from "phaser";
import { earTip, hintFor, MUFFLED, RINGING, soundOf } from "./songTables";
import { skillIcon } from "./skillIcons";

/**
 * Songweaver sound-hit cues (cosmetic): the "soundhit" sfx event says how a monster heard a hit. The server sends the
 * matching "hit" first, then "soundhit" in the same tick (the hit, then afterHit; a killing blow sends no soundhit),
 * so the damage number is tinted gold (ringing) or grey (muffled) after the fact. Also the ear and note icons by a
 * monster's name and the once-per-kind chat hint.
 */
export class SoundCues {
  private lastNum = new Map<string, { t: number; obj: Phaser.GameObjects.Text }>();
  private wordAt = new Map<string, number>();
  private hinted = new Set<string>();
  private ear?: Phaser.GameObjects.Image;
  private note?: Phaser.GameObjects.Image;
  private tip?: Phaser.GameObjects.Text;
  private asked = new Set<string>();

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

  /**
   * The "soundhit" event. `word` prints a short label (throttled per monster). Returns the chat hint to show, if this
   * is the first time this monster kind was heard (the caller says whether the hit is mine / close).
   */
  onSoundHit(ev: { id: string; tier: string; match?: boolean }, now: number, word: (text: string, col: string) => void, hint?: { kind: string; name: string }): string | undefined {
    const col = SoundCues.tint(ev.tier, !!ev.match);
    if (col) {
      const n = this.lastNum.get(ev.id);
      if (n && now - n.t < 450 && n.obj.active) { n.obj.setColor(col); this.lastNum.delete(ev.id); }
      if (now - (this.wordAt.get(ev.id) ?? 0) > 1200) {
        this.wordAt.set(ev.id, now);
        word(col === RINGING ? (ev.match ? "in tune" : "ringing") : "muffled", col);
      }
    }
    if (hint && !this.hinted.has(hint.kind)) {
      this.hinted.add(hint.kind);
      const t = hintFor(hint.kind);
      if (t) return `${hint.name}: ${t}`;
    }
    return undefined;
  }

  /** Load a skillIcons data URL as a Phaser texture once; true when it can be drawn. */
  private tex(scene: Phaser.Scene, id: string): boolean {
    const key = "icon_" + id;
    if (scene.textures.exists(key)) return true;
    if (!this.asked.has(key)) { this.asked.add(key); const u = skillIcon(id); if (u) scene.textures.addBase64(key, u); }
    return false;
  }

  /**
   * The ear icon (tier) and note icon (favourite note) beside a monster's name, from skillIcons (sgear_*, sgpitch_*).
   * With `tip` the one-line tooltip is written under the name. `x`,`y` is the ear's top-left. Call hideIcons() first each frame.
   */
  drawIcons(scene: Phaser.Scene, x: number, y: number, kind: string, depth: number, tip: boolean, font: string) {
    const s = soundOf(kind);
    if (!s || !this.tex(scene, "sgear_" + s.tier)) return;
    this.ear ??= scene.add.image(0, 0, "icon_sgear_" + s.tier).setOrigin(0, 0);
    this.ear.setTexture("icon_sgear_" + s.tier).setPosition(x, y).setDepth(depth).setVisible(true);
    if (s.pitch && this.tex(scene, "sgpitch_" + s.pitch)) {
      this.note ??= scene.add.image(0, 0, "icon_sgpitch_" + s.pitch).setOrigin(0, 0);
      this.note.setTexture("icon_sgpitch_" + s.pitch).setPosition(x + 13, y).setDepth(depth).setVisible(true);
    }
    if (tip) {
      this.tip ??= scene.add.text(0, 0, "", { fontFamily: font, fontSize: "8px", color: "#ffe9a8", stroke: "#000", strokeThickness: 2, wordWrap: { width: 150 }, align: "center" }).setOrigin(0.5, 0);
      this.tip.setText(earTip(kind)).setPosition(x + 4, y + 14).setDepth(depth).setVisible(true);
    }
  }

  /** Hide the nameplate icons (the scene calls this every frame before drawIcons). */
  hideIcons() { this.ear?.setVisible(false); this.note?.setVisible(false); this.tip?.setVisible(false); }
}
