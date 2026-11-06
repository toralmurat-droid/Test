import Phaser from "phaser";
import { runesLit, SHRINE, SHRINE_RANGE, SHRINE_RUNES } from "../../shared/shrine";
import { ART_K as K } from "../../shared/constants";
import { shrineTextures, SHRINE_FOOT } from "./shrineArt";
import { isoAnchor } from "./iso";
import { TEXT_FONT, TEXT_PX, WT } from "./pixelfont";

/**
 * The Whispering Woods shrine (shared/shrine.ts). Ready: the wisp flame burns, the rune glows and every rune stone
 * shines. Spent: the bowl is cold and the rune stones relight one by one as it recharges, with the time left
 * floating over it when you are close. E (or a click on the prompt) prays at it.
 */
const SCALE = 0.62;

export class ShrineLayer {
  private img: Phaser.GameObjects.Sprite;
  private glow: Phaser.GameObjects.Image;
  private timer: Phaser.GameObjects.Text;
  private prompt = document.createElement("div");
  /** Local time when the shrine is ready again (0 = ready). */
  private readyAt = 0;
  private shown = -1; // runes lit currently drawn (SHRINE_RUNES = ready)
  near = false;

  constructor(private scene: Phaser.Scene, private send: (type: string, msg?: unknown) => void, font: string) {
    shrineTextures(scene);
    const { x, y } = SHRINE;
    this.img = scene.add.sprite(x, y, "shrine_ready", 0).setOrigin(0.5, SHRINE_FOOT).setScale(SCALE).setDepth(y);
    this.glow = scene.add.image(x, y - 14, "glow").setTint(0x52dcc2).setScale(4 * K).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD).setDepth(-0.8);
    scene.tweens.add({ targets: this.glow, alpha: 0.34, scale: 4.4 * K, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.timer = scene.add.text(x, y - 74, "", { fontFamily: TEXT_FONT, fontSize: `${TEXT_PX}px`, color: "#9cf3dc", stroke: "#000", strokeThickness: 2 })
      .setOrigin(0.5, 1).setScale(WT).setResolution(1).setDepth(29000).setVisible(false);
    isoAnchor(this.timer, { x, y });
    this.prompt.id = "shrineprompt";
    this.prompt.onclick = () => this.interact();
    document.getElementById("hud")!.append(this.prompt);
    this.draw(SHRINE_RUNES);
  }

  /** The server told us how long until the shrine is ready again. */
  setLeft(ms: number) { this.readyAt = ms > 0 ? Date.now() + ms : 0; }

  /** Someone just prayed: a burst of wisp light rising from the bowl. */
  used() {
    const { x, y } = SHRINE;
    for (let i = 0; i < 22; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, r = 14 + Math.random() * 22;
      const sp = this.scene.add.rectangle(x, y - 10, 2, 2, Math.random() < 0.6 ? 0x9cf3dc : 0xe2fff4).setDepth(6000).setBlendMode(Phaser.BlendModes.ADD);
      isoAnchor(sp, { x, y });
      this.scene.tweens.add({ targets: sp, x: x + Math.cos(a) * r * 0.6, y: y - 10 + Math.sin(a) * r * 1.4, alpha: 0,
        duration: 700 + Math.random() * 500, onComplete: () => sp.destroy() });
    }
  }

  private draw(lit: number) {
    if (lit === this.shown) return;
    this.shown = lit;
    if (lit >= SHRINE_RUNES) { this.img.play("shrine_glow"); this.glow.setVisible(true); }
    else { this.img.stop(); this.img.setTexture("shrine_spent", lit); this.glow.setVisible(false); }
  }

  interact(): boolean {
    if (!this.near) return false;
    if (this.left() > 0) return true; // spent: the prompt already says when
    this.send("pray");
    return true;
  }

  private left() { return this.readyAt ? Math.max(0, this.readyAt - Date.now()) : 0; }

  update(me: { x: number; y: number } | undefined, blocked: boolean) {
    const left = this.left();
    this.draw(runesLit(left));
    const d = me ? Math.hypot(SHRINE.x - me.x, SHRINE.y - me.y) : Infinity;
    const secs = Math.ceil(left / 1000), clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    // the time left floats over the spent shrine when you are nearby
    const showTimer = left > 0 && d < 9 * 32;
    this.timer.setVisible(showTimer);
    if (showTimer && this.timer.text !== clock) this.timer.setText(clock);
    this.near = !blocked && d <= SHRINE_RANGE;
    this.prompt.classList.toggle("open", this.near);
    this.prompt.classList.toggle("spent", left > 0);
    if (this.near) {
      const html = left > 0
        ? `${SHRINE.name} <span class="why">The wisp sleeps. It wakes in ${clock}</span>`
        : `<kbd>E</kbd> Pray at the ${SHRINE.name}`;
      if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    }
  }
}
