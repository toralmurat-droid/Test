import Phaser from "phaser";
import { CHAR_SCALE, CHAR_ORIGIN, playCharAnim } from "./artAssets";
import { allObjects, cocoonPresent, objectDone, QuestObject, Quester, usableObjects, USE_RANGE } from "../../shared/quests";

import "../../shared/siege"; // puts the quest's siege engines (ENGINES) on the skeletons' work sites

type QuestState = Quester;
import { TILE as TILE_PX } from "../../shared/constants";
import { sheet } from "./worldProps";
import { standingStone, STONE_H, STONE_W } from "./throneArt";
import { heartShard, LandEl, SHARD_H, SHARD_W } from "./elementArt";
import { dungeonQuestTextures } from "./dungeonArt";
import { isoAnchor } from "./iso";
import { LANTERN_FRAMES, LANTERN_H, LANTERN_LIFT, LANTERN_W, spiritLantern } from "./lanternArt";

/**
 * Quest objects in the world (shared/quests.ts): spirit lanterns in the marsh, rotting shrines in the woods,
 * Tobin's blob cocoon at the lake and the Brood Heart in the wreck on Heronwreck Strand. Each is drawn per player: a lantern you
 * lit stays lit for you, the cocoon is gone once you freed Tobin.
 */

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
function rowsTexture(scene: Phaser.Scene, key: string, rows: string[], pal: Record<string, number>): string {
  if (scene.textures.exists(key)) return key;
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const c = pal[ch];
    if (c === undefined) return;
    ctx.fillStyle = hex(c);
    ctx.fillRect(x, y, 1, 1);
  }));
  tex.refresh();
  return key;
}

const K = 0x1a1420, IRON = 0x4b5563, IRON_L = 0x8a94a3;
const SHRINE = [
  ".....KKKK.....",
  "....KSSSSK....",
  "...KSLLSSSK...",
  "..KSLSSSSSSK..",
  "..KSSSRRSSOK..",
  "..KSSRSSRSOK..",
  "..KOSSRRSSSK..",
  "..KOSRSSRSSK..",
  "..KSSSRRSOSK..",
  "..KSSSSSSOOK..",
  "..KSOSSSSSOK..",
  "..KOOSSSSSSK..",
  ".KDDDDDDDDDDK.",
  "KDDOODDDDDODDK",
  "KDDDDDDDDDDDDK",
  ".KKKKKKKKKKKK.",
];
const HEART = [
  ".......KKKKKK.......",
  ".....KKPPPPPPKK.....",
  "...KKPPLLPPPPPPKK...",
  "..KPPLLPPVPPPPPPPK..",
  ".KPPLPPPVPPPPVPPPPK.",
  ".KPPPPPVPPPPPVPPPPK.",
  "KPPPPPPVVPPPVPPPPPPK",
  "KPPVPPPPPVVVPPPPVPPK",
  "KPPPVVPPPPVPPPPVPPDK",
  "KPPPPPVPPPVPPVVPPPDK",
  ".KPPPPPVVPPPVPPPPDK.",
  ".KDPPPPPPVVVPPPPDDK.",
  "..KDDPPPPPPPPPDDDK..",
  "...KKDDDDDDDDDDKK...",
  "..OOOKKKKKKKKKKOOO..",
  ".OOOOOOOOOOOOOOOOOO.",
];

// Skeleton chain objects: green signal brazier, crypt seal, the Pale Marshal's phylactery (+ flames on burned siege engines)
const BEACON = [
  ".....F....F.....",
  "....FF...FWF....",
  "...FWF..FWWF.F..",
  "..FWWWFFWWWFFWF.",
  "..FWWWWWWWWWWWF.",
  "...FWWYWWWYWWF..",
  "....FWYYYYYWF...",
  "..KKKKKKKKKKKK..",
  ".KIIIIIIIIIIIIK.",
  ".KILIILIILIILIK.",
  "..KIIIIIIIIIIK..",
  "...KKKKKKKKKK...",
  "......KIIK......",
  ".....KIIIIK.....",
  "....KIILLIIK....",
  "...KKKKKKKKKK...",
];
const CRYPT = [
  "...KKKKKKKKKK...",
  "..KSSSSSSSSSSK..",
  ".KSLLSSSSSSSSSK.",
  ".KSKKKKKKKKKKSK.",
  ".KSKDDDDDDDDKSK.",
  ".KSKDGDDDDGDKSK.",
  ".KSKDDDGGDDDKSK.",
  ".KSKDDGGGGDDKSK.",
  ".KSKDDDGGDDDKSK.",
  ".KSKDGDDDDGDKSK.",
  ".KSKDDDDDDDDKSK.",
  ".KSKDDDDDDDDKSK.",
  "KSSSSSSSSSSSSSSK",
  "KKKKKKKKKKKKKKKK",
];
const PHYLAC = [
  "......KKKK......",
  ".....KBBBBK.....",
  "....KBLBBBBK....",
  "...KKKKKKKKKK...",
  "...KGGGWGGGGK...",
  "..KGGWWWWGGGGK..",
  "..KGWWYWWWGGGK..",
  "..KGGWWWWGGGGK..",
  "..KGGGWGGGGGGK..",
  "...KGGGGGGGGK...",
  "...KKKKKKKKKK...",
  "....KBBLBBBK....",
  "...KBBBBBBBBK...",
  "..KSSSSSSSSSSK..",
  ".KSLSSSSSSSSSSK.",
  "KKKKKKKKKKKKKKKK",
];

function textures(scene: Phaser.Scene) {
  // The Hollow Throne's ward-stones: painted like the world props (throneArt.ts), still burning, then broken
  sheet(scene, "qobj_ward", STONE_W, STONE_H, 1, (p, f) => standingStone(p, f, 1), 0);
  for (const el of ["poison", "cold", "fire", "shock"] as LandEl[]) { // the Heart Shards of the elemental wilds (6-frame pulse)
    sheet(scene, `qobj_shard_${el}`, SHARD_W, SHARD_H, 6, (p, f) => heartShard(p, f, el, false), 0.5);
    sheet(scene, `qobj_shard_${el}_broken`, SHARD_W, SHARD_H, 1, (p, f) => heartShard(p, f, el, true), 0.5);
  }
  sheet(scene, "qobj_ward_broken", STONE_W, STONE_H, 1, (p, f) => standingStone(p, f, 2), 0);
  // The siege engines themselves are the skeletons' work-site props (siegeArt.ts): a burned one just gets flames
  rowsTexture(scene, "qobj_engine_fire", BEACON.slice(0, 7), { F: 0xb8461f, W: 0xff8c42, Y: 0xffe08a });
  const br = { K, I: IRON, L: IRON_L };
  rowsTexture(scene, "qobj_beacon", BEACON, { ...br, F: 0x2f8f3a, W: 0x7dff6a, Y: 0xe8ffd0 });
  rowsTexture(scene, "qobj_beacon_out", BEACON.map((r, i) => (i < 7 ? r.replace(/[FWY]/g, ".") : r)), br);
  const stn = { K, S: 0x8a8f96, L: 0xb9bec4 };
  rowsTexture(scene, "qobj_crypt", CRYPT, { ...stn, D: 0x14101a, G: 0x5fe36a });
  rowsTexture(scene, "qobj_crypt_sealed", CRYPT, { ...stn, D: 0x6b7178, G: 0xffd166 });
  rowsTexture(scene, "qobj_phylactery", PHYLAC, { K, B: 0xd8cfb8, L: 0xf4eedc, S: 0x6b7178, G: 0x2f8f3a, W: 0x7dff6a, Y: 0xe8ffd0 });
  rowsTexture(scene, "qobj_phylactery_broken", PHYLAC.map((r, i) => (i >= 3 && i <= 9 ? (i % 2 ? r.replace(/[GWY]/g, ".") : r.replace(/[GWY]/g, "B")) : r)),
    { K, B: 0x8f877a, L: 0xb9b1a0, S: 0x6b7178 });

  // Spirit lanterns: iso pixel art like the village bonfire (lanternArt.ts), dark or burning with a cold spirit flame
  sheet(scene, "qobj_lantern_off", LANTERN_W, LANTERN_H, 1, (p, f) => spiritLantern(p, f, false), 0.5);
  sheet(scene, "qobj_lantern_lit", LANTERN_W, LANTERN_H, LANTERN_FRAMES, (p, f) => spiritLantern(p, f, true), 0.5);
  if (!scene.anims.exists("qobj_lantern_burn")) scene.anims.create({ key: "qobj_lantern_burn", frames: scene.anims.generateFrameNumbers("qobj_lantern_lit", { start: 0, end: LANTERN_FRAMES - 1 }), frameRate: 7, repeat: -1 });
  const st = { K, S: 0x9aa1a8, L: 0xc9cfd4, D: 0x6b7178 };
  rowsTexture(scene, "qobj_shrine_rot", SHRINE, { ...st, R: 0x4a2f6b, O: 0x6fbf3a, S: 0x7d8a6e });
  rowsTexture(scene, "qobj_shrine_clean", SHRINE, { ...st, R: 0xffd166, O: 0x9aa1a8 });
  rowsTexture(scene, "qobj_heart", HEART, { K, P: 0x9b2c6b, L: 0xe26fa8, V: 0x5a1440, D: 0x6b1d4c, O: 0x4f9d3a });
  rowsTexture(scene, "qobj_heart_burnt", HEART, { K, P: 0x3a3436, L: 0x5a5254, V: 0xff8c42, D: 0x2a2426, O: 0x3a3436 });
}

/** First look and size of each kind, and its look once done. */
const START: Record<string, string> = {
  lantern: "qobj_lantern_off", shrine: "qobj_shrine_rot", heart: "qobj_heart",
  engine: "qobj_engine_fire", beacon: "qobj_beacon", crypt: "qobj_crypt", phylactery: "qobj_phylactery", ward: "qobj_ward",
  silk: "qobj_silk", totem: "qobj_totem",
};
const DONE: Record<string, string> = { engine: "qobj_engine_fire", beacon: "qobj_beacon_out", crypt: "qobj_crypt_sealed", phylactery: "qobj_phylactery_broken", ward: "qobj_ward_broken", silk: "qobj_silk_cut", totem: "qobj_totem_burnt" };
const SCALE: Record<string, number> = { lantern: 1 / 1.5, shard: 1 / 1.5, heart: 2, shrine: 1.5, engine: 2.4, beacon: 1.4, crypt: 1.5, phylactery: 1.3, ward: 1 / 1.5, silk: 1 / 1.5, totem: 1 / 1.5 };
/** Coloured light some objects give off until done. */
const GLOW: Record<string, number> = { beacon: 0x7dff6a, crypt: 0x5fe36a, phylactery: 0x7dff6a, ward: 0x9dff6a, totem: 0xff6a2a };

interface Drawn { o: QuestObject; img: Phaser.GameObjects.Image; glow?: Phaser.GameObjects.Arc; light?: Phaser.GameObjects.Image; done?: boolean; anim?: Phaser.GameObjects.Sprite }

export class QuestObjects {
  private drawn: Drawn[] = [];
  private tobin?: Phaser.GameObjects.Sprite;
  private goo?: Phaser.GameObjects.Ellipse;

  constructor(private scene: Phaser.Scene) {
    textures(scene);
    dungeonQuestTextures(scene);
    for (const o of allObjects()) {
      if (o.kind === "cocoon") {
        // Tobin, stuck in a wobbling bubble of green goo
        this.tobin = scene.add.sprite(o.x, o.y, "villager", 0).setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y).setScale(CHAR_SCALE).setDepth(o.y);
        playCharAnim(this.tobin, "villager", "idle", "down");
        this.goo = scene.add.ellipse(o.x, o.y - 10, 22, 26, 0x6fd36b, 0.55).setStrokeStyle(1, 0x2f8f2a, 0.9).setDepth(o.y + 1);
        scene.tweens.add({ targets: this.goo, scaleX: 1.08, scaleY: 0.94, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
        continue;
      }
      const key = o.kind === "shard" ? `qobj_${o.id}` : START[o.kind];
      const img = scene.add.image(o.x, o.y, key).setOrigin(0.5, 1).setScale(SCALE[o.kind] ?? 1.4).setDepth(o.y);
      const d: Drawn = { o, img };
      if (o.kind === "engine") { img.setVisible(false).setPosition(o.x, o.y - TILE_PX * 0.6).setDepth(o.y + 40); }
      if (GLOW[o.kind]) {
        d.glow = isoAnchor(scene.add.circle(o.x, o.y - img.displayHeight * 0.6, 14, GLOW[o.kind], 0.22).setDepth(o.y + 1).setBlendMode(Phaser.BlendModes.ADD), o) as Phaser.GameObjects.Arc;
        scene.tweens.add({ targets: d.glow, scale: 1.3, alpha: 0.1, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      }
      if (o.kind === "shard") { // pulses with the heart-flesh inside it, glowing in its element
        const el = o.id.slice(6) as LandEl, c = ({ poison: 0x9be564, cold: 0x8fd8ff, fire: 0xff8a3c, shock: 0xa8b8ff } as const)[el];
        d.glow = isoAnchor(scene.add.circle(o.x, o.y - 18, 16, c, 0.2).setDepth(o.y + 1).setBlendMode(Phaser.BlendModes.ADD), o) as Phaser.GameObjects.Arc;
        scene.tweens.add({ targets: d.glow, scale: 1.3, alpha: 0.08, duration: 800, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
        if (!scene.anims.exists(`${key}_pulse`)) scene.anims.create({ key: `${key}_pulse`, frames: scene.anims.generateFrameNumbers(key, { start: 0, end: 5 }), frameRate: 6, repeat: -1 });
        d.anim = scene.add.sprite(o.x, o.y, key, 0).setOrigin(0.5, 1).setScale(1 / 1.5).setDepth(o.y).play(`${key}_pulse`);
        img.setVisible(false);
      }
      if (o.kind === "lantern") {
        d.anim = scene.add.sprite(o.x, o.y, "qobj_lantern_lit", 0).setOrigin(0.5, 1).setScale(1 / 1.5).setDepth(o.y).setVisible(false);
        d.anim.anims.play({ key: "qobj_lantern_burn", startFrame: Math.floor(Math.random() * LANTERN_FRAMES) });
      }
      if (o.kind === "heart") scene.tweens.add({ targets: img, scaleX: 2.12, scaleY: 2.2, duration: 450, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.drawn.push(d);
    }
  }

  /**
   * Night light of the lit spirit lanterns (Details.addLight: shines through the dark at night), in the glass.
   * Hidden on lanterns this player has not lit yet.
   */
  setLight(light: (x: number, y: number, lift: number) => Phaser.GameObjects.Image | undefined) {
    for (const d of this.drawn) if (d.o.kind === "lantern" && !d.light) d.light = light(d.o.x, d.o.y, LANTERN_LIFT)?.setVisible(!!d.done);
  }

  /** Burst of sparks when an object is used. */
  burst(id: string) {
    const o = allObjects().find((x) => x.id === id);
    if (!o) return;
    const d = { o };
    const color = d.o.kind === "shard" ? ({ poison: 0x9be564, cold: 0xd6f6ff, fire: 0xffa848, shock: 0xbcd0ff } as Record<string, number>)[d.o.id.slice(6)] ?? 0xffffff : d.o.kind === "lantern" ? 0x7ff3ff : d.o.kind === "shrine" || d.o.kind === "crypt" ? 0xffd166
      : d.o.kind === "heart" || d.o.kind === "engine" ? 0xff8c42 : d.o.kind === "phylactery" ? 0xe8ffd0 : d.o.kind === "ward" ? 0xc8ff8a : d.o.kind === "silk" ? 0xe8e4d4 : d.o.kind === "totem" ? 0xff7a2a : 0x9be564;
    const lift = d.o.kind === "lantern" ? LANTERN_LIFT : 10;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 14;
      const sp = isoAnchor(this.scene.add.rectangle(d.o.x, d.o.y - lift, 2, 2, color).setDepth(d.o.y + 50), { x: d.o.x, y: d.o.y }) as Phaser.GameObjects.Rectangle;
      this.scene.tweens.add({ targets: sp, x: d.o.x + Math.cos(a) * r, y: d.o.y - lift + Math.sin(a) * r, alpha: 0, duration: 500 + Math.random() * 300, onComplete: () => sp.destroy() });
    }
  }

  /** Object you can use right now (standing next to it on the right step). */
  near(me: { x: number; y: number } | undefined, q: QuestState | undefined): QuestObject | undefined {
    if (!me) return undefined;
    return usableObjects(q).map(({ o }) => o).find((o) => Math.hypot(o.x - me.x, o.y - me.y) <= USE_RANGE);
  }

  update(q: QuestState | undefined) {
    const there = cocoonPresent(q);
    this.tobin?.setVisible(there);
    this.goo?.setVisible(there);
    for (const d of this.drawn) {
      const done = objectDone(d.o, q);
      if (done === d.done) continue;
      d.done = done;
      if (d.o.kind === "lantern") {
        d.img.setVisible(!done);
        d.anim?.setVisible(done);
        if (done && !d.glow) {
          // the glow sits in the glass, held up there in iso (anchored to the lantern's foot)
          d.glow = isoAnchor(this.scene.add.circle(d.o.x, d.o.y - LANTERN_LIFT, 13, 0x7ff3ff, 0.25).setDepth(d.o.y + 1).setBlendMode(Phaser.BlendModes.ADD), d.o) as Phaser.GameObjects.Arc;
          this.scene.tweens.add({ targets: d.glow, scale: 1.25, alpha: 0.12, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
        }
        d.glow?.setVisible(done);
        d.light?.setVisible(done);
      } else if (d.o.kind === "shard") {
        d.anim?.setVisible(!done); d.glow?.setVisible(!done);
        d.img.setTexture(`qobj_${d.o.id}_broken`).setVisible(done);
      } else if (d.o.kind === "shrine") {
        d.img.setTexture(done ? "qobj_shrine_clean" : "qobj_shrine_rot");
      } else if (d.o.kind === "engine") {
        // flames on the engine once this player burned it (the engine itself is a world prop)
        d.img.setVisible(done);
        if (done) this.scene.tweens.add({ targets: d.img, scaleY: 2.8, scaleX: 2.2, duration: 260, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
        else this.scene.tweens.killTweensOf(d.img);
      } else if (DONE[d.o.kind]) {
        d.img.setTexture(done ? DONE[d.o.kind] : START[d.o.kind]);
        d.glow?.setVisible(!done);
      } else if (d.o.kind === "heart") {
        d.img.setTexture(done ? "qobj_heart_burnt" : "qobj_heart");
        if (done) { this.scene.tweens.killTweensOf(d.img); d.img.setScale(2); }
      }
    }
  }
}
