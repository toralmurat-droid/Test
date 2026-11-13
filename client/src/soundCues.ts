import type Phaser from "phaser";
import { earTip, hintFor, MUFFLED, RINGING, soundOf } from "./songTables";
import { skillIcon } from "./skillIcons";
import { TINY_PX, WT } from "./pixelfont";
import { isoAnchor } from "./iso";

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
   * With `tip` the one-line tooltip is written under the name. Call hideIcons() first each frame.
   */
  drawIcons(scene: Phaser.Scene, label: Phaser.GameObjects.Text, kind: string, depth: number, tip: boolean, font: string, anchor?: { x: number; y: number }) {
    const s = soundOf(kind);
    if (!s || !this.tex(scene, "sgear_" + s.tier)) return;
    const x = label.x + label.displayWidth / 2 + 2, y = label.y - label.displayHeight + 1; // the label's own (anchored) position
    this.ear ??= scene.add.image(0, 0, "icon_sgear_" + s.tier).setOrigin(0, 0).setScale(0.6);
    this.ear.setTexture("icon_sgear_" + s.tier).setPosition(x, y).setDepth(depth).setVisible(true);
    if (anchor) isoAnchor(this.ear, anchor); // upright, following the monster, like its label and bar
    if (s.pitch && this.tex(scene, "sgpitch_" + s.pitch)) {
      this.note ??= scene.add.image(0, 0, "icon_sgpitch_" + s.pitch).setOrigin(0, 0).setScale(0.6);
      this.note.setTexture("icon_sgpitch_" + s.pitch).setPosition(x + 8, y).setDepth(depth).setVisible(true);
      if (anchor) isoAnchor(this.note, anchor);
    }
    if (tip) {
      this.tip ??= scene.add.text(0, 0, "", { fontFamily: font, fontSize: `${TINY_PX + 2}px`, color: "#ffe9a8", stroke: "#000", strokeThickness: 2, wordWrap: { width: 190 }, align: "center" }).setOrigin(0.5, 0).setScale(WT).setResolution(1);
      this.tip.setText(earTip(kind)).setPosition(label.x, label.y + 3).setDepth(depth).setVisible(true);
      if (anchor) isoAnchor(this.tip, anchor);
    }
  }

  /** Hide the nameplate icons (the scene calls this every frame before drawIcons). */
  hideIcons() { this.ear?.setVisible(false); this.note?.setVisible(false); this.tip?.setVisible(false); }
}
