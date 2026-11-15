import Phaser from "phaser";
import { gateOpen, homelandGate, isBadlandsGate, isCrownGate, isMoorsGate, isSinkholesGate, WAYGATE_RANGE, waygateArrival, waygateById, WAYGATES, type Waygate } from "../../shared/act2";
import type { Quester } from "../../shared/quests";
import { moorgateTexture, MOORGATE_FRAMES } from "./moorsArt";
import { redPassTexture, REDPASS_FRAMES } from "./badlandsArt";
import { SINKWAY_FRAMES, sinkwayTexture } from "./sinkholesArt";
import { CROWNGATE_FRAMES, crownGateTexture } from "./crownArt";
import { crownwayFrom, type CrownwayFrom } from "../../shared/crown";
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
  const key = `wg_${desert ? "sun" : "oak"}_${awake ? 1 : 0}`; // (the moorgates borrow the valley's arch until art-audio paints their own)
  hiResTexture(scene, key, WG_W, WG_H, awake ? FRAMES : 1, 4, (c, f) => paintWaygate(c, f, FRAMES, awake, desert));
  return key;
}
/** The art for gate `g`, asleep or awake, and where its feet sit in the texture. */
function texFor(scene: Phaser.Scene, g: Waygate, awake: boolean) {
  if (isMoorsGate(g)) return moorgateTexture(scene, g.id === "moorsgate" ? "forest" : "moors", awake);
  if (isBadlandsGate(g)) return redPassTexture(scene, g.id === "redpass" ? "forest" : "badlands", awake);
  if (isSinkholesGate(g)) return sinkwayTexture(scene, g.id === "sinkway" ? "coast" : "sinkholes", awake);
  if (isCrownGate(g)) return crownGateTexture(scene, crownFromId(g), g.id.startsWith("crown_") ? "crown" : "home", awake);
  return { key: newTexture(scene, g.id === "desert", awake), ox: WG_OX / WG_W, oy: WG_OY / WG_H };
}

/** Which homeland a Crownway gate (crown_<land> or crownway_<land>) belongs to. */
const crownFromId = (g: Waygate) => g.id.replace(/^crown(way)?_/, "") as CrownwayFrom;

/** Glow colour of an awake gate: gold, cold blue for the moorgates, warm orange for the rest incl. the Red Pass. */
const glowFor = (g: Waygate) => (isCrownGate(g) ? 0xffc860 : isMoorsGate(g) ? 0x7fb0d8 : isSinkholesGate(g) ? 0x9ac86a : 0xffa040);
/** The marker's name and colour on the maps (an awake / asleep gate). */
const nameFor = (g: Waygate) => (isCrownGate(g) ? crownwayFrom(crownFromId(g)).name : g.id === "moorsgate" ? "The Moorgate" : g.id === "redpass" || g.id === "badlands" ? "The Red Pass" : isSinkholesGate(g) ? "The Sinkway" : g.label);

export class WaygateLayer {
  private gates: { g: Waygate; img: Phaser.GameObjects.Sprite; glow: Phaser.GameObjects.Image }[] = [];
  private awake = new Map<string, boolean>(); // per gate: the moorgates open by level, the Sunscar's by quests
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
      const glow = scene.add.image(g.x, g.y - 30, "glow").setTint(glowFor(g)).setScale(7).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(-0.8);
      isoAnchor(glow, { x: g.x, y: g.y });
      this.gates.push({ g, img, glow });
    }
  }

  /** Map markers for the gates (Murat 2026-11-08: "where is the portal to Act 2?"): gold once awake, grey while asleep. */
  markers(): MapMarker[] {
    return WAYGATES.map((g) => ({ x: g.x, y: g.y, glyph: "", gate: this.awake.get(g.id) ? "awake" as const : "asleep" as const, color: this.awake.get(g.id) ? (isCrownGate(g) ? "#f0d080" : isMoorsGate(g) ? "#b8c4d8" : isBadlandsGate(g) ? "#ff9a60" : isSinkholesGate(g) ? "#a8d070" : "#ffb347") : "#9a8a74",
      label: nameFor(g) }));
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
  update(me: (Quester & { level: number }) | undefined, pos: { x: number; y: number } | undefined, blocked: boolean) {
    const openOf = (g: Waygate) => gateOpen(g, me);
    let at: Waygate | undefined, ahead: Waygate | undefined;
    if (pos) for (const g of WAYGATES) {
      const d = Math.hypot(g.x - pos.x, g.y - pos.y);
      if (d <= WAYGATE_RANGE) at = g;
      if (openOf(g) && d <= PREPAINT_RANGE) ahead = g;
    }
    this.at = at;
    this.near = !blocked && !!at;
    this.prompt.classList.toggle("open", this.near);
    if (this.near && at) {
      const open = openOf(at);
      const home = homelandGate(at); // the moors' and the badlands' gates open by hero level
      const shut = isCrownGate(at) ? "The road is barred." : isSinkholesGate(at) ? "The Sinkway is caved in" : isBadlandsGate(at) ? "The Red Pass is held shut" : isMoorsGate(at) ? "The Moorgate is shut" : "The waygate is cold";
      const html = `<kbd>E</kbd> ${open ? at.label : shut}${!open && home && (at.id === "moorsgate" || at.id === "redpass" || at.id === "sinkway" || isCrownGate(at)) ? ` <span class="why">Opens at level ${home.level}</span>` : ""}`;
      if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    }
    const dest = ahead && waygateById(ahead.to);
    const pin = dest ? waygateArrival(dest) : undefined;
    if (pin?.x !== this.pinned?.x || pin?.y !== this.pinned?.y) {
      this.pinned = pin;
      IsoView.ground?.pin(pin ? [{ x: isoX(pin.x, pin.y), y: isoY(pin.x, pin.y) }] : []);
    }
    for (const { g } of this.gates) this.wake(g.id, openOf(g));
  }
  private pinned?: { x: number; y: number };

  private wake(id: string, awake: boolean) {
    if (awake === this.awake.get(id)) return;
    this.awake.set(id, awake);
    for (const { g, img, glow } of this.gates) {
      if (g.id !== id) continue;
      const { key, ox, oy } = texFor(this.scene, g, awake);
      img.setOrigin(ox, oy);
      if (awake) {
        if (!this.scene.anims.exists(key)) this.scene.anims.create({ key, frames: this.scene.anims.generateFrameNumbers(key, { start: 0, end: (isMoorsGate(g) ? MOORGATE_FRAMES : isBadlandsGate(g) ? REDPASS_FRAMES : isSinkholesGate(g) ? SINKWAY_FRAMES : isCrownGate(g) ? CROWNGATE_FRAMES : FRAMES) - 1 }), frameRate: 8, repeat: -1 });
        img.setTexture(key, 0).play(key);
        glow.setAlpha(0.3);
        this.scene.tweens.add({ targets: glow, alpha: 0.45, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      } else { img.stop(); img.setTexture(key); glow.setAlpha(0); }
    }
  }
}
