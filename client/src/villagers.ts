import Phaser from "phaser";
import { TILE } from "../../shared/constants";
import { isSolidAt, SAFE_ZONE } from "../../shared/map";
import { isDecorSolidAt, NPCS } from "../../shared/npcs";
import { CHAR_ORIGIN, CHAR_SCALE, CharacterName, playCharAnim } from "./artAssets";
import { faceOf } from "./watch";

/**
 * Townsfolk of Oakvale (Murat 2026-11-03): they idle, stroll about the market square and stop to chat with each other.
 * No dialogue and nothing synced: each client runs its own, it's only life in the background.
 */
const FOLK: CharacterName[] = ["peasant", "farmwife", "labourer", "elder", "goodwife", "villager", "peasant", "farmwife", "labourer"];
/** Where they wander: the square and a ring of street around it (tiles). */
const AREA = { x0: SAFE_ZONE.x - 1.5, y0: SAFE_ZONE.y - 1.5, x1: SAFE_ZONE.x + SAFE_ZONE.w + 1.5, y1: SAFE_ZONE.y + SAFE_ZONE.h + 1.5 };
const KEEP_CLEAR = 0.9 * TILE; // stay off the traders' and the druid's spot

type Mode = "idle" | "walk" | "chat" | "sit";
interface Folk {
  name: CharacterName; sprite: Phaser.GameObjects.Sprite;
  x: number; y: number; tx: number; ty: number; speed: number;
  mode: Mode; until: number; face: string; anim: string; nextFlavour: number; backAt: number;
}

const free = (x: number, y: number) => {
  for (const [ox, oy] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) if (isSolidAt(x + ox, y + oy) || isDecorSolidAt(x + ox, y + oy)) return false;
  return !NPCS.some((n) => Math.hypot(n.x - x, n.y - y) < KEEP_CLEAR);
};
/** Straight walk from a to b without touching anything solid. */
const clearLine = (ax: number, ay: number, bx: number, by: number) => {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 5);
  for (let i = 1; i <= n; i++) if (!free(ax + (bx - ax) * i / n, ay + (by - ay) * i / n)) return false;
  return true;
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Villagers {
  private folk: Folk[] = [];

  constructor(private scene: Phaser.Scene) {
    for (const name of FOLK) {
      const p = this.randomSpot();
      if (!p) continue;
      const sprite = scene.add.sprite(p.x, p.y, name, 0).setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y).setScale(CHAR_SCALE).setDepth(p.y);
      const f: Folk = { name, sprite, x: p.x, y: p.y, tx: p.x, ty: p.y, speed: rand(17, 25) * (name === "elder" ? 0.7 : 1), mode: "idle", until: scene.time.now + rand(0, 4000), face: faceOf(rand(-1, 1), rand(-1, 1)), anim: "", nextFlavour: 0, backAt: 0 };
      this.folk.push(f);
      this.play(f, "idle");
    }
  }

  private randomSpot(): { x: number; y: number } | undefined {
    for (let i = 0; i < 60; i++) {
      const x = rand(AREA.x0, AREA.x1) * TILE, y = rand(AREA.y0, AREA.y1) * TILE;
      if (free(x, y)) return { x, y };
    }
    return undefined;
  }

  private play(f: Folk, anim: string, force = false) {
    const key = `${anim}|${f.face}`;
    if (!force && f.anim === key) return;
    f.anim = key;
    playCharAnim(f.sprite, f.name, anim, f.face);
  }

  /** Pick what to do next: usually a short stroll, sometimes a sit-down or a chat with someone close by. */
  private next(f: Folk, now: number) {
    const mate = this.folk.find((o) => o !== f && o.mode !== "walk" && o.mode !== "sit" && Math.hypot(o.x - f.x, o.y - f.y) < 1.8 * TILE);
    const r = Math.random();
    if (mate && r < 0.5) {
      // turn to each other and talk a while
      for (const [a, b] of [[f, mate], [mate, f]]) {
        a.mode = "chat"; a.until = now + rand(5000, 9000); a.face = faceOf(b.x - a.x, b.y - a.y, a.face); a.nextFlavour = now + rand(600, 2000);
        this.play(a, "idle");
      }
      return;
    }
    if (r < 0.62 && f.name !== "labourer") { f.mode = "sit"; f.until = now + rand(6000, 12000); this.play(f, "sit"); return; }
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, d = rand(1.5, 5) * TILE;
      const tx = f.x + Math.cos(a) * d, ty = f.y + Math.sin(a) * d;
      if (tx < AREA.x0 * TILE || tx > AREA.x1 * TILE || ty < AREA.y0 * TILE || ty > AREA.y1 * TILE) continue;
      if (!clearLine(f.x, f.y, tx, ty)) continue;
      f.mode = "walk"; f.tx = tx; f.ty = ty; f.until = now + 20000;
      return;
    }
    f.mode = "idle"; f.until = now + rand(1500, 4000);
  }

  update(dtMs: number) {
    const now = this.scene.time.now, dt = dtMs / 1000;
    for (const f of this.folk) {
      if (f.mode === "walk") {
        const dx = f.tx - f.x, dy = f.ty - f.y, d = Math.hypot(dx, dy);
        if (d < 1.5 || now > f.until) { f.mode = "idle"; f.until = now + rand(2000, 6000); f.nextFlavour = now + rand(800, 3000); this.play(f, "idle"); }
        else {
          const s = Math.min(d, f.speed * dt);
          f.x += dx / d * s; f.y += dy / d * s;
          f.face = faceOf(dx, dy, f.face);
          this.play(f, "walk");
        }
        f.sprite.setPosition(f.x, f.y).setDepth(f.y);
        continue;
      }
      if (now >= f.until) {
        if (f.mode === "sit" || f.mode === "chat") { f.mode = "idle"; f.until = now + rand(800, 2500); this.play(f, "idle"); }
        else this.next(f, now);
        continue;
      }
      // Little gestures while standing: chatters laugh and wave, idlers shift their weight and look about
      if (f.mode !== "sit" && now >= f.nextFlavour) {
        f.nextFlavour = now + rand(2500, 6000);
        const pick = f.mode === "chat" ? (Math.random() < 0.5 ? "laugh" : Math.random() < 0.5 ? "wave" : "idle2") : Math.random() < 0.5 ? "idle2" : "idle3";
        this.play(f, pick, true);
        f.backAt = now + (pick === "laugh" || pick === "wave" ? rand(1200, 2000) : 1500);
      } else if (f.backAt && now >= f.backAt && f.mode !== "sit") { f.backAt = 0; this.play(f, "idle"); }
    }
  }
}
