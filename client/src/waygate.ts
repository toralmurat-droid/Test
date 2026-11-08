import Phaser from "phaser";
import { act2Open, WAYGATES, type Waygate } from "../../shared/act2";
import type { Quester } from "../../shared/quests";
import { hiResTexture } from "./smooth";
import { col, Iso, rng, type Pt } from "./smoothProps";
import { isoAnchor } from "./iso";
import type { MapMarker } from "./minimap";

/**
 * Act 2's waygates (shared/act2.ts): an old sandstone arch south of Oakvale and its twin in the desert's Sunstone
 * Circle. Asleep (dark, sand in the carvings) until the local hero has beaten the first zone's two last bosses; then a
 * veil of warm light shimmers between the pillars, and walking into it crosses to the other act (the server moves the
 * hero; the scene shows the loading screen while the other land is drawn).
 */
const W = 96, H = 120, OX = 48, OY = 104; // texture size and the gate's foot (texture px)
const FRAMES = 6;

/** The arch: two carved pillars and a cracked lintel with a sun disc; `awake` adds the light veil (animated frames). */
function gateTexture(scene: Phaser.Scene, awake: boolean): string {
  const key = `ds_waygate_${awake ? 1 : 0}`;
  hiResTexture(scene, key, W, H, awake ? FRAMES : 1, 5, (c, f) => {
    const I = new Iso(c, OX, OY), R = rng(17);
    I.shadow(-26, -8, 26, 8, 4, 0.5);
    const S = [0x3a2418, 0x5a3a24, 0x7a5232, 0x9a6a40, 0xb8844e, 0xcf9e62];
    // the steps it stands on
    I.box(-30, 30, -10, 10, 0, 4, S[3]);
    I.box(-26, 26, -7, 7, 4, 7, S[4]);
    const pillar = (u: number) => I.box(u - 5, u + 5, -5, 5, 7, 72, S[3], (side, o, du, dz, len, h) => {
      for (let z = 4; z < h; z += 9) { // drums of stone, a carved band now and then
        const q = (uu: number, zz: number): Pt => [o[0] + du[0] * uu + dz[0] * zz, o[1] + du[1] * uu + dz[1] * zz];
        c.strokeStyle = col(S[0], 1, 0.7); c.lineWidth = 0.5; c.beginPath(); c.moveTo(...q(0, z)); c.lineTo(...q(len, z)); c.stroke();
        if ((z / 9) % 3 === 1) { c.fillStyle = col(S[1], side === "L" ? 0.9 : 0.7); for (let uu = 1.5; uu < len - 1; uu += 3) { const [x, y] = q(uu, z + 4); c.fillRect(x - 0.6, y - 0.6, 1.2, 1.2); } }
      }
      const q = (uu: number, zz: number): Pt => [o[0] + du[0] * uu + dz[0] * zz, o[1] + du[1] * uu + dz[1] * zz];
      c.strokeStyle = col(S[0], 1, 0.8); c.lineWidth = 0.4; c.beginPath(); c.moveTo(...q(len * 0.3, h)); c.lineTo(...q(len * 0.5, h * 0.7)); c.lineTo(...q(len * 0.35, h * 0.45)); c.stroke(); // a crack
    });
    // the veil sits between the pillars, behind the right pillar and in front of the left one's back
    pillar(-21);
    if (awake) {
      const t = f / FRAMES;
      const top = 70, pts: Pt[] = [I.p(-16, 0, 7), I.p(16, 0, 7), I.p(16, 0, top), I.p(-16, 0, top)];
      c.save(); I.clip(pts);
      const g = c.createLinearGradient(...I.p(0, 0, 7), ...I.p(0, 0, top));
      g.addColorStop(0, "rgba(255,170,70,0.85)"); g.addColorStop(0.5, "rgba(255,210,130,0.6)"); g.addColorStop(1, "rgba(255,150,60,0.4)");
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      for (let k = 0; k < 14; k++) { // rising motes and ripples
        const u = -15 + ((k * 37) % 30), z = 7 + ((k * 13 + t * 60) % (top - 8));
        const [x, y] = I.p(u, 0, z);
        c.fillStyle = `rgba(255,240,200,${0.5 + 0.4 * Math.sin(k + t * 6.28)})`; c.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
      }
      c.strokeStyle = "rgba(255,235,180,0.55)"; c.lineWidth = 0.8;
      for (let k = 0; k < 3; k++) { const z = 7 + ((k * 22 + t * 66) % (top - 8)); c.beginPath(); c.moveTo(...I.p(-16, 0, z)); c.quadraticCurveTo(...I.p(0, 0, z + 4), ...I.p(16, 0, z)); c.stroke(); }
      c.restore();
    } else { // asleep: a dark, dusty gap
      I.poly([I.p(-16, 0, 7), I.p(16, 0, 7), I.p(16, 0, 70), I.p(-16, 0, 70)], "rgba(20,12,8,0.18)");
    }
    pillar(21);
    // the lintel, with a sun disc carved in the middle (glowing when the gate is awake)
    I.box(-28, 28, -6, 6, 72, 82, S[4], (side, o, du, dz, len, h) => {
      const q = (uu: number, zz: number): Pt => [o[0] + du[0] * uu + dz[0] * zz, o[1] + du[1] * uu + dz[1] * zz];
      c.strokeStyle = col(S[0], 1, 0.6); c.lineWidth = 0.4; c.beginPath(); c.moveTo(...q(0, h * 0.5)); c.lineTo(...q(len, h * 0.5)); c.stroke();
      if (side === "L") {
        const [x, y] = q(len / 2, h / 2);
        c.strokeStyle = col(S[0], 1, 0.9); c.lineWidth = 0.7; c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.stroke();
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; c.beginPath(); c.moveTo(x + Math.cos(a) * 3.8, y + Math.sin(a) * 3.8); c.lineTo(x + Math.cos(a) * 5.2, y + Math.sin(a) * 5.2); c.stroke(); }
        c.fillStyle = awake ? "rgba(255,200,100,0.95)" : "rgba(60,40,24,0.8)"; c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill();
      }
    });
    // a broken corner of the lintel and sand in the joints
    c.fillStyle = col(0xd8b07a, 1, 0.9); c.beginPath(); c.ellipse(...I.p(-24, 6, 0.5), 7, 2, 0, 0, Math.PI * 2); c.fill();
    void R;
  });
  return key;
}

export class WaygateLayer {
  private gates: { g: Waygate; img: Phaser.GameObjects.Sprite; glow: Phaser.GameObjects.Image }[] = [];
  private awake?: boolean;

  constructor(private scene: Phaser.Scene) {
    gateTexture(scene, false);
    for (const g of WAYGATES) {
      const img = scene.add.sprite(g.x, g.y, gateTexture(scene, false)).setOrigin(OX / W, OY / H).setDepth(g.y);
      const glow = scene.add.image(g.x, g.y - 30, "glow").setTint(0xffa040).setScale(7).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(-0.8);
      isoAnchor(glow, { x: g.x, y: g.y });
      this.gates.push({ g, img, glow });
    }
  }

  /** Map markers for the gates (Murat 2026-11-08: "where is the portal to Act 2?"): gold once awake, grey while asleep. */
  markers(): MapMarker[] {
    return WAYGATES.map((g) => ({ x: g.x, y: g.y, glyph: "◆", color: this.awake ? "#ffb347" : "#8a7a66",
      label: g.id === "oakvale" ? (this.awake ? "Waygate to the Sunscar (Act 2)" : "Old waygate (asleep)") : "Waygate home to Oakvale" }));
  }

  /** Call every frame with the local hero's quest fields: wakes the gates once Act 2 is open for them. */
  update(me: Quester | undefined) {
    const awake = act2Open(me);
    if (awake === this.awake) return;
    this.awake = awake;
    if (awake) {
      const key = gateTexture(this.scene, true);
      if (!this.scene.anims.exists(key)) this.scene.anims.create({ key, frames: this.scene.anims.generateFrameNumbers(key, { start: 0, end: FRAMES - 1 }), frameRate: 8, repeat: -1 });
      for (const { img, glow } of this.gates) {
        img.setTexture(key, 0).play(key);
        glow.setAlpha(0.3);
        this.scene.tweens.add({ targets: glow, alpha: 0.45, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      }
    } else for (const { img, glow } of this.gates) { img.stop(); img.setTexture(gateTexture(this.scene, false)); glow.setAlpha(0); }
  }
}
