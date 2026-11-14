import Phaser from "phaser";
import { act2Open, WAYGATE_RANGE, waygateArrival, waygateById, WAYGATES, type Waygate } from "../../shared/act2";
import type { Quester } from "../../shared/quests";
import { hiResTexture } from "./smooth";
import { isoAnchor, isoX, isoY, IsoView } from "./iso";
import type { MapMarker } from "./minimap";
import { paintWaygate, WG_H, WG_OX, WG_OY, WG_W } from "./waygateArt";
import { hudSlot } from "./hudSlots";

/**
 * Act 2's waygates (shared/act2.ts): an old stone arch south of Oakvale and its twin in the desert's Sunstone
 * Circle. Asleep (an empty opening) until the local hero has beaten the first zone's two last bosses; then a
 * veil of warm light shimmers between the pillars. Clicking it, or pressing E next to it, crosses to the other act
 * like a portal stone (the server moves the hero; the scene shows the loading screen while the other land is drawn).
 */
const FRAMES = 8;
/** Within this many px of an awake gate, the ground at the other end is painted ahead (smoothground.ts pin()). */
const PREPAINT_RANGE = 24 * 32;

/** Both sides (Murat 2026-11-08), painted in waygateArt.ts: Oakvale's in dark ivy-grown stone with desert sand
 * spilling round it, the Sunscar's in sun-bleached sandstone half buried in dunes, the valley's grass creeping out. */
function newTexture(scene: Phaser.Scene, desert: boolean, awake: boolean): string {
  const key = `wg_${desert ? "sun" : "oak"}_${awake ? 1 : 0}`;
  hiResTexture(scene, key, WG_W, WG_H, awake ? FRAMES : 1, 4, (c, f) => paintWaygate(c, f, FRAMES, awake, desert));
  return key;
}
/** The art for gate `g`, asleep or awake, and where its feet sit in the texture. */
function texFor(scene: Phaser.Scene, g: Waygate, awake: boolean) {
  return { key: newTexture(scene, g.id === "desert", awake), ox: WG_OX / WG_W, oy: WG_OY / WG_H };
}

export class WaygateLayer {
  private gates: { g: Waygate; img: Phaser.GameObjects.Sprite; glow: Phaser.GameObjects.Image }[] = [];
  private awake?: boolean;
  private prompt = document.createElement("div");
  private at?: Waygate; // the gate we stand at
  near = false;

  constructor(private scene: Phaser.Scene, private send: (type: string) => void) {
    this.prompt.id = "gateprompt";
    this.prompt.onclick = () => this.interact();
    hudSlot("promptstack").append(this.prompt);
    for (const g of WAYGATES) {
      const t = texFor(scene, g, false);
      const img = scene.add.sprite(g.x, g.y, t.key).setOrigin(t.ox, t.oy).setDepth(g.y);
      const glow = scene.add.image(g.x, g.y - 30, "glow").setTint(0xffa040).setScale(7).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(-0.8);
      isoAnchor(glow, { x: g.x, y: g.y });
      this.gates.push({ g, img, glow });
    }
  }

  /** Map markers for the gates (Murat 2026-11-08: "where is the portal to Act 2?"): gold once awake, grey while asleep. */
  markers(): MapMarker[] {
    return WAYGATES.map((g) => ({ x: g.x, y: g.y, glyph: "", gate: this.awake ? "awake" as const : "asleep" as const, color: this.awake ? "#ffb347" : "#9a8a74",
      label: g.id === "oakvale" ? (this.awake ? "Waygate to Act 2" : "Waygate (asleep)") : "Waygate to Oakvale" }));
  }

  /** Step through the gate we stand at (E, the prompt, or a click on the gate). */
  interact(): boolean {
    if (!this.near) return false;
    this.send("waygate");
    return true;
  }

  /**
   * Call every frame with the local hero (feet and quest fields): wakes the gates once Act 2 is open for them, shows
   * the prompt next to one, and has the ground round the far gate's arrival spot painted ahead while the hero is near
   * this one, so crossing doesn't wait for a whole screen of freshly painted ground.
   */
  update(me: Quester | undefined, pos: { x: number; y: number } | undefined, blocked: boolean) {
    const open = act2Open(me);
    let at: Waygate | undefined, ahead: Waygate | undefined;
    if (pos) for (const g of WAYGATES) {
      const d = Math.hypot(g.x - pos.x, g.y - pos.y);
      if (d <= WAYGATE_RANGE) at = g;
      if (open && d <= PREPAINT_RANGE) ahead = g;
    }
    this.at = at;
    this.near = !blocked && !!at;
    this.prompt.classList.toggle("open", this.near);
    if (this.near && at) {
      const html = `<kbd>E</kbd> ${open ? "Step through the waygate" : "The waygate is cold"} <span class="why">${at.id === "oakvale" ? "To the Sunscar (Act 2)" : "Home to Oakvale (Act 1)"}</span>`;
      if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    }
    const dest = ahead && waygateById(ahead.to);
    const pin = dest ? waygateArrival(dest) : undefined;
    if (pin?.x !== this.pinned?.x || pin?.y !== this.pinned?.y) {
      this.pinned = pin;
      IsoView.ground?.pin(pin ? [{ x: isoX(pin.x, pin.y), y: isoY(pin.x, pin.y) }] : []);
    }
    this.wake(open);
  }
  private pinned?: { x: number; y: number };

  private wake(awake: boolean) {
    if (awake === this.awake) return;
    this.awake = awake;
    for (const { g, img, glow } of this.gates) {
      const { key, ox, oy } = texFor(this.scene, g, awake);
      img.setOrigin(ox, oy);
      if (awake) {
        if (!this.scene.anims.exists(key)) this.scene.anims.create({ key, frames: this.scene.anims.generateFrameNumbers(key, { start: 0, end: FRAMES - 1 }), frameRate: 8, repeat: -1 });
        img.setTexture(key, 0).play(key);
        glow.setAlpha(0.3);
        this.scene.tweens.add({ targets: glow, alpha: 0.45, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      } else { img.stop(); img.setTexture(key); glow.setAlpha(0); }
    }
  }
}
