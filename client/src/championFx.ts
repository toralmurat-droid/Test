import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { AFFIXES, FAMILIES, FAMILY_OF, overlayPlace, unpackAffixes, type AffixKey } from "../../shared/champions";
import type { MobKind } from "../../shared/constants";
import { isoAnchor } from "./iso";
import { PALETTE, SkillFx } from "./skillfx";
import { champOverlayTexture } from "./textures";

/**
 * Champions on screen (shared/champions.ts, server/champions.ts). (a) the family tint, a glowing outline (WebGL glow,
 * else a stronger ring), a ring of the family's colour under the feet (the affix icons and texts are in the top monster bar, monsterBar.ts);
 * (b) a humanoid carries its champion weapon (its own sheet, textures.ts mobTexture); blobs and scorpions get the
 * painted detail of their affix (tools/art/paint/mobs.ts champOverlay) laid over them. Plus the
 * affixes' moments: puddles, the ballista, getting back up, splitting, sinking into the sand, the brand flaring.
 */
interface Ent { sprite: Phaser.GameObjects.Sprite; top: number; bar: Phaser.GameObjects.Graphics; statusTint?: boolean }
export interface ChampFxHost {
  scene: Phaser.Scene;
  fx: SkillFx;
  ent: (id: string) => Ent | undefined;
  say: (x: number, y: number, text: string, color: string) => void;
  squash: (id: string, kx: number, ky: number, ms: number) => void;
}
interface Look { key: number; affixes: AffixKey[]; okeys: AffixKey[]; tint: number; aura: number; overlays: Phaser.GameObjects.Sprite[]; ring: Phaser.GameObjects.Graphics; glow?: Phaser.FX.Glow }

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const GROUND_DEPTH = 2;
const EL_COLORS: Record<string, [number, number]> = { poison: [0x2a3e12, 0x78a82c], fire: [0x5a1a0c, 0xe0661c], cold: [0x1e3e64, 0x8fd8ff], shock: [0x26206e, 0xb8a8ff] };

export class ChampionFx {
  private looks = new Map<string, Look>();
  private ballistae = new Map<string, Phaser.GameObjects.Container>();

  constructor(private h: ChampFxHost, room: Room) {
    room.onMessage("champ", (d: any) => this.event(d));
    this.ballistaTexture();
  }

  /** Every frame for a monster on screen: returns true when it drew it as a champion (the caller skips its own tint). */
  sync(id: string, e: Ent, p: any, x: number, y: number, now: number): boolean {
    const n = p.champion | 0;
    let L = this.looks.get(id);
    if (L && (L.key !== n || p.dead)) { this.drop(id); L = undefined; }
    if (!n || p.dead) return false;
    if (!L) L = this.build(id, e, n, p.kind);
    const show = !p.hidden && e.sprite.visible;
    // (a) tint (status flickers win), ring under the feet
    if (!e.statusTint) e.sprite.setTint(L.tint);
    L.ring.clear().setVisible(show).setDepth(e.sprite.y - 1);
    if (show) {
      const w = Math.max(16, e.top * 0.9), pulse = 0.2 + 0.08 * Math.sin(now / 260);
      L.ring.fillStyle(L.aura, L.glow ? pulse : pulse + 0.12).fillEllipse(x, y, w, w * 0.38);
      if (!L.glow) L.ring.lineStyle(1, L.aura, 0.8).strokeEllipse(x, y, w, w * 0.38);
    }
    // (b) the painted details, following its feet and its facing
    const frame = Math.floor(now / 320) % 2;
    L.overlays.forEach((o, i) => {
      const P = overlayPlace(L!.okeys[i], e.top);
      o.setVisible(show).setPosition(x, y + P.dy).setOrigin(0.5, P.oy).setScale(P.scale).setDepth(e.sprite.y + 0.5 + i * 0.01).setFlipX(e.sprite.flipX);
      if (o.frame.name !== String(frame) && o.texture.has(String(frame))) o.setFrame(frame);
    });
    return true;
  }

  private build(id: string, e: Ent, n: number, kind: MobKind): Look {
    const { scene } = this.h, affixes = unpackAffixes(n), fam = FAMILIES[FAMILY_OF[kind] ?? "gloam"];
    const ring = isoAnchor(scene.add.graphics(), e.sprite) as Phaser.GameObjects.Graphics;
    // only the affixes whose painted sheet is loaded get a detail (the pixel look has none): icons and tint still show
    const okeys = affixes.filter((k) => AFFIXES[k].overlay && !!champOverlayTexture(scene, k));
    const overlays = okeys.map((k) => isoAnchor(scene.add.sprite(e.sprite.x, e.sprite.y, champOverlayTexture(scene, k)!, 0), e.sprite) as Phaser.GameObjects.Sprite);
    const fx = (e.sprite as any).preFX as Phaser.GameObjects.Components.FX | null | undefined;
    const glow = fx ? fx.addGlow(fam.aura, 3, 0, false, 0.1, 8) : undefined;
    const L: Look = { key: n, affixes, okeys, tint: fam.tint, aura: fam.aura, overlays, ring, glow };
    this.looks.set(id, L);
    return L;
  }

  /** The monster left the screen or stopped being a champion. */
  drop(id: string) {
    const L = this.looks.get(id);
    if (!L) return;
    this.looks.delete(id);
    const e = this.h.ent(id);
    if (L.glow && e) (e.sprite as any).preFX?.remove(L.glow);
    if (e && !e.statusTint) e.sprite.clearTint();
    L.ring.destroy();
    for (const o of L.overlays) o.destroy();
  }

  // ---- The affixes' moments ("champ" messages) ----

  private event(d: any) {
    const { scene, fx } = this.h, e = d.id ? this.h.ent(d.id) : undefined;
    const sx = e?.sprite.x ?? d.x, sy = e?.sprite.y ?? d.y, top = e?.top ?? 20;
    switch (d.ev) {
      case "pool": { // Tainted / Deep-Venomed: a small lumpy puddle that fades
        const [dark, lite] = EL_COLORS[d.el] ?? EL_COLORS.poison, r = d.r, x = d.x, y = d.y;
        const g = scene.add.graphics().setDepth(GROUND_DEPTH), blobs = [...Array(4)].map(() => [rnd(-r * 0.4, r * 0.4), rnd(-r * 0.3, r * 0.3), rnd(r * 0.4, r * 0.65)]);
        for (const [bx, by, br] of blobs) g.fillStyle(dark, 0.5).fillEllipse(x + bx, y + by, br * 2.2, br * 1.4);
        for (const [bx, by, br] of blobs) g.fillStyle(lite, 0.45).fillEllipse(x + bx - 1, y + by - 1, br * 1.5, br * 0.9);
        scene.tweens.add({ targets: g, alpha: 0, delay: d.ms * 0.75, duration: d.ms * 0.25, onComplete: () => g.destroy() });
        break;
      }
      case "build": if (e) { this.h.say(sx, sy - top - 14, "BALLISTA!", "#e0c090"); this.h.squash(d.id, 0.9, 1.1, d.ms); } break;
      case "ballista": this.addBallista(d.id, d.x, d.y, d.ms); break;
      case "ballistaend": { const b = this.ballistae.get(d.id); if (b) { this.ballistae.delete(d.id); fx.ring(b.x, b.y, 10, "earth", 10, { up: 10, life: 360 }); b.destroy(); } break; }
      case "fire": { const b = this.ballistae.get(d.id); if (b) { const arm = b.getAt(1) as Phaser.GameObjects.Image; arm.setRotation(Math.atan2(d.y - b.y, d.x - b.x)); scene.tweens.add({ targets: arm, scaleX: 0.8, duration: 80, yoyo: true }); } break; }
      case "rise": // Risen: purple light and a cry as it gets back up
        this.h.say(sx, sy - top - 14, "RISEN!", "#c8a8ff");
        fx.ring(sx, sy, 14, "shadow", 18, { up: 16, life: 520, size: 2 });
        fx.glow(sx, sy, top * 0.5, top * 0.8, 0xa070ff, 500, 0.6);
        break;
      case "split": this.h.say(sx, sy - top - 14, "SPLITS!", "#a8ff80"); fx.ring(sx, sy, 12, "poison", 16, { up: 12, life: 420, size: 2 }); this.h.squash(d.id, 1.4, 0.7, 260); break;
      case "shift": this.h.say(sx, sy - top - 14, "OTHER SKIN!", "#ff9a6a"); fx.ring(sx, sy, 12, "blood", 18, { up: 14, life: 460, size: 2 }); break;
      case "gang": this.h.say(sx, sy - top - 14, "BOYS!", "#ff6a5a"); break;
      case "burrow": case "surface": // Sand-Buried: a fountain of sand where it goes down or comes up
        for (let i = 0; i < 18; i++) { const a = Math.random() * Math.PI * 2, v = rnd(15, 45); fx.p(d.x, d.y, 1, pick(PALETTE.earth.slice(0, 3)), { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5, vz: rnd(20, 50), g: 160, life: rnd(300, 520), size: pick([1, 2]), size1: 1 }); }
        break;
      case "veil": case "unveil":
        fx.ring(d.x, d.y, 10, "arcane", 14, { up: 18, life: 420, size: 1 });
        fx.glow(d.x, d.y, 10, 14, 0xb4a4ff, 380, 0.5);
        break;
      case "brand": { const h = this.h.ent(d.hero); if (h) this.h.say(h.sprite.x, h.sprite.y - h.top - 8, `BRAND ${d.n}/3`, "#ffb060"); break; }
      case "flare": { const h = this.h.ent(d.hero); if (h) { fx.ring(h.sprite.x, h.sprite.y, 14, "fire", 20, { up: 20, life: 480, size: 2 }); fx.glow(h.sprite.x, h.sprite.y, h.top * 0.5, 18, 0xff9830, 420, 0.7); this.h.say(h.sprite.x, h.sprite.y - h.top - 8, "BRANDED!", "#ff9830"); } break; }
    }
  }

  /** A small wooden ballista, drawn once into a texture: base and the bow arm (turned at its target). */
  private ballistaTexture() {
    const { scene } = this.h;
    if (scene.textures.exists("champ_ballista_base")) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x3a2410).fillRect(1, 9, 16, 3).fillStyle(0x6a4422).fillRect(2, 6, 14, 4).fillStyle(0x8a5a2a).fillRect(3, 6, 12, 1);
    g.fillStyle(0x2a1a0c).fillCircle(4, 12, 2).fillCircle(14, 12, 2).fillStyle(0x8a8e98).fillCircle(4, 12, 1).fillCircle(14, 12, 1);
    g.fillStyle(0x6a4422).fillRect(8, 2, 2, 6);
    g.generateTexture("champ_ballista_base", 18, 14); g.clear();
    g.fillStyle(0x8a5a2a).fillRect(0, 3, 14, 2).fillStyle(0x5a3a1a).fillRect(3, 0, 2, 8).fillStyle(0xd8d0b8).fillRect(4, 0, 1, 8);
    g.fillStyle(0xb8bcc8).fillTriangle(14, 2, 17, 4, 14, 6);
    g.generateTexture("champ_ballista_arm", 18, 8); g.destroy();
  }
  private addBallista(key: string, x: number, y: number, ms: number) {
    const { scene, fx } = this.h;
    const base = scene.add.image(0, 0, "champ_ballista_base").setOrigin(0.5, 0.9);
    const arm = scene.add.image(0, -9, "champ_ballista_arm").setOrigin(0.3, 0.5);
    const c = scene.add.container(x, y, [base, arm]).setDepth(y);
    isoAnchor(c, { x, y });
    this.ballistae.set(key, c);
    fx.ring(x, y, 10, "earth", 12, { up: 12, life: 380 });
    scene.time.delayedCall(ms + 200, () => { if (this.ballistae.get(key) === c) { this.ballistae.delete(key); c.destroy(); } });
  }
}
