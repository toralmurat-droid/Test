import Phaser from "phaser";
import { act2Open, WAYGATES, type Waygate } from "../../shared/act2";
import type { Quester } from "../../shared/quests";
import { hiResTexture } from "./smooth";
import { isoAnchor } from "./iso";
import type { MapMarker } from "./minimap";
import { paintWaygate, WG_H, WG_OX, WG_OY, WG_W } from "./waygateArt";

/**
 * Act 2's waygates (shared/act2.ts): an old stone arch south of Oakvale and its twin in the desert's Sunstone
 * Circle. Asleep (an empty opening) until the local hero has beaten the first zone's two last bosses; then a
 * veil of warm light shimmers between the pillars, and walking into it crosses to the other act (the server moves the
 * hero; the scene shows the loading screen while the other land is drawn).
 */
const FRAMES = 8;

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

  constructor(private scene: Phaser.Scene) {
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

  /** Call every frame with the local hero's quest fields: wakes the gates once Act 2 is open for them. */
  update(me: Quester | undefined) {
    const awake = act2Open(me);
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
