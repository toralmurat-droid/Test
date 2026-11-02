import Phaser from "phaser";
import { CHAR_SCALE, CHAR_ORIGIN, playCharAnim } from "./artAssets";
import { allObjects, cocoonPresent, objectDone, QuestObject, QuestState, usableObjects, USE_RANGE } from "../../shared/quests";

/**
 * Quest objects in the world (shared/quests.ts): spirit lanterns in the marsh, rotting shrines in the woods,
 * Tobin's blob cocoon at the lake and the Brood Heart in Thornwood. Each is drawn per player: a lantern you
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

const K = 0x1a1420, WOOD = 0x6e4526, WOOD_L = 0x9c6b3e, IRON = 0x4b5563, IRON_L = 0x8a94a3;
const LANTERN = [
  "....KKK....",
  "...KIIIK...",
  "..KIIIIIK..",
  ".KKKKKKKKK.",
  ".KIGGGGGIK.",
  ".KGGFFFGGK.",
  ".KGFFWFFGK.",
  ".KGFWWWFGK.",
  ".KGGFFFGGK.",
  ".KIGGGGGIK.",
  ".KKKKKKKKK.",
  "....KWK....",
  "....KWK....",
  "....KLK....",
  "....KWK....",
  "....KWK....",
  "....KLK....",
  "....KWK....",
  "...KKWKK...",
  "..KWWWWWK..",
];
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

function textures(scene: Phaser.Scene) {
  const lan = { K, I: IRON, W: WOOD, L: WOOD_L };
  rowsTexture(scene, "qobj_lantern_off", LANTERN, { ...lan, G: 0x2d3a40, F: 0x3e4f57 });
  rowsTexture(scene, "qobj_lantern_on", LANTERN, { ...lan, I: IRON_L, G: 0x2f8f9e, F: 0x7ff3ff, W: 0xe8ffff });
  rowsTexture(scene, "qobj_lantern_on_post", LANTERN, { ...lan, G: 0x2f8f9e, F: 0x7ff3ff });
  const st = { K, S: 0x9aa1a8, L: 0xc9cfd4, D: 0x6b7178 };
  rowsTexture(scene, "qobj_shrine_rot", SHRINE, { ...st, R: 0x4a2f6b, O: 0x6fbf3a, S: 0x7d8a6e });
  rowsTexture(scene, "qobj_shrine_clean", SHRINE, { ...st, R: 0xffd166, O: 0x9aa1a8 });
  rowsTexture(scene, "qobj_heart", HEART, { K, P: 0x9b2c6b, L: 0xe26fa8, V: 0x5a1440, D: 0x6b1d4c, O: 0x4f9d3a });
  rowsTexture(scene, "qobj_heart_burnt", HEART, { K, P: 0x3a3436, L: 0x5a5254, V: 0xff8c42, D: 0x2a2426, O: 0x3a3436 });
}

interface Drawn { o: QuestObject; img: Phaser.GameObjects.Image; glow?: Phaser.GameObjects.Arc; done?: boolean }

export class QuestObjects {
  private drawn: Drawn[] = [];
  private tobin?: Phaser.GameObjects.Sprite;
  private goo?: Phaser.GameObjects.Ellipse;

  constructor(private scene: Phaser.Scene) {
    textures(scene);
    for (const o of allObjects()) {
      if (o.kind === "cocoon") {
        // Tobin, stuck in a wobbling bubble of green goo
        this.tobin = scene.add.sprite(o.x, o.y, "villager", 0).setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y).setScale(CHAR_SCALE).setDepth(o.y);
        playCharAnim(this.tobin, "villager", "idle", "down");
        this.goo = scene.add.ellipse(o.x, o.y - 10, 22, 26, 0x6fd36b, 0.55).setStrokeStyle(1, 0x2f8f2a, 0.9).setDepth(o.y + 1);
        scene.tweens.add({ targets: this.goo, scaleX: 1.08, scaleY: 0.94, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
        continue;
      }
      const key = o.kind === "lantern" ? "qobj_lantern_off" : o.kind === "shrine" ? "qobj_shrine_rot" : "qobj_heart";
      const img = scene.add.image(o.x, o.y, key).setOrigin(0.5, 1).setScale(o.kind === "heart" ? 2 : o.kind === "shrine" ? 1.5 : 1.4).setDepth(o.y);
      const d: Drawn = { o, img };
      if (o.kind === "heart") scene.tweens.add({ targets: img, scaleX: 2.12, scaleY: 2.2, duration: 450, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.drawn.push(d);
    }
  }

  /** Burst of sparks when an object is used. */
  burst(id: string) {
    const o = allObjects().find((x) => x.id === id);
    if (!o) return;
    const d = { o };
    const color = d.o.kind === "lantern" ? 0x7ff3ff : d.o.kind === "shrine" ? 0xffd166 : d.o.kind === "heart" ? 0xff8c42 : 0x9be564;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 14;
      const sp = this.scene.add.rectangle(d.o.x, d.o.y - 10, 2, 2, color).setDepth(d.o.y + 50);
      this.scene.tweens.add({ targets: sp, x: d.o.x + Math.cos(a) * r, y: d.o.y - 10 + Math.sin(a) * r, alpha: 0, duration: 500 + Math.random() * 300, onComplete: () => sp.destroy() });
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
        d.img.setTexture(done ? "qobj_lantern_on_post" : "qobj_lantern_off");
        if (done && !d.glow) {
          d.glow = this.scene.add.circle(d.o.x, d.o.y - 19, 13, 0x7ff3ff, 0.25).setDepth(d.o.y + 1).setBlendMode(Phaser.BlendModes.ADD);
          this.scene.tweens.add({ targets: d.glow, scale: 1.25, alpha: 0.12, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
        }
        d.glow?.setVisible(done);
      } else if (d.o.kind === "shrine") {
        d.img.setTexture(done ? "qobj_shrine_clean" : "qobj_shrine_rot");
      } else if (d.o.kind === "heart") {
        d.img.setTexture(done ? "qobj_heart_burnt" : "qobj_heart");
        if (done) { this.scene.tweens.killTweensOf(d.img); d.img.setScale(2); }
      }
    }
  }
}
