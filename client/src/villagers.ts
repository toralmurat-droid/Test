import Phaser from "phaser";
import { TILE } from "../../shared/constants";
import { isSolidAt, SAFE_ZONE } from "../../shared/map";
import { isDecorSolidAt, NPCS } from "../../shared/npcs";
import { CHAR_ORIGIN, CHAR_SCALE, CharacterName, ensureCharSheet, playCharAnim, SHEET_RANGE } from "./artAssets";
import { faceOf } from "./watch";
import { isoAnchor } from "./iso";
import { speechBubble } from "./weathered";
import { WRATH } from "../../shared/wrath";


/**
 * Townsfolk of Oakvale (Murat 2026-11-03): they idle, stroll about the market square and stop to chat with each other.
 * No dialogue and nothing synced: each client runs its own, it's only life in the background.
 */
const FOLK: CharacterName[] = ["peasant", "farmwife", "labourer", "elder", "goodwife", "villager", "peasant", "farmwife", "labourer"];
/** Where they wander: the square and a ring of street around it (tiles). */
const AREA = { x0: SAFE_ZONE.x - 1.5, y0: SAFE_ZONE.y - 1.5, x1: SAFE_ZONE.x + SAFE_ZONE.w + 1.5, y1: SAFE_ZONE.y + SAFE_ZONE.h + 1.5 };
const KEEP_CLEAR = 0.9 * TILE; // stay off the traders' and the druid's spot

type Mode = "idle" | "walk" | "chat" | "sit" | "mob" | "home";
interface Folk {
  name: CharacterName; sprite: Phaser.GameObjects.Sprite; ready: boolean; // hidden and still until the sheet has loaded
  x: number; y: number; tx: number; ty: number; speed: number;
  mode: Mode; until: number; face: string; anim: string; nextFlavour: number; backAt: number;
  asked?: boolean; nextBlow?: number; nextShout?: number; bubble?: Phaser.GameObjects.Image; stuck?: number;
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
      const sprite = scene.add.sprite(p.x, p.y, "__DEFAULT").setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y).setScale(CHAR_SCALE).setDepth(p.y).setVisible(false);
      const f: Folk = { name, sprite, ready: false, x: p.x, y: p.y, tx: p.x, ty: p.y, speed: rand(17, 25) * (name === "elder" ? 0.7 : 1), mode: "idle", until: scene.time.now + rand(0, 4000), face: faceOf(rand(-1, 1), rand(-1, 1)), anim: "", nextFlavour: 0, backAt: 0 };
      this.folk.push(f);
    }
  }

  private loadAt = 0;
  /** Townsfolk sheets load once the hero is near the square (nearest NPCs go first), one at a time; each person appears as theirs arrives. */
  private loadSheets(me?: { x: number; y: number }) {
    const t = performance.now();
    if (!me || t - this.loadAt < 300) return;
    this.loadAt = t;
    const cx = (AREA.x0 + AREA.x1) / 2 * TILE, cy = (AREA.y0 + AREA.y1) / 2 * TILE;
    if (Math.hypot(cx - me.x, cy - me.y) > SHEET_RANGE + 350) return; // measured from the square's centre: its people stand up to about 340 px from there
    for (const f of this.folk) {
      if (f.ready || f.asked) continue;
      f.asked = true;
      const show = () => { for (const o of this.folk) if (o.name === f.name && !o.ready) { o.ready = true; o.sprite.setTexture(o.name, 0).setVisible(true); this.play(o, "idle", true); } };
      if (ensureCharSheet(this.scene, f.name, show, 400)) show();
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
    const mate = this.folk.find((o) => o !== f && o.ready && o.mode !== "walk" && o.mode !== "sit" && Math.hypot(o.x - f.x, o.y - f.y) < 1.8 * TILE);
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

  /** Step towards (tx, ty), sliding along walls. Returns false when nothing moved. */
  private stepTo(f: Folk, tx: number, ty: number, speed: number, dt: number, stop: number): boolean {
    const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy);
    if (d <= stop) return false;
    const s = Math.min(d - stop, speed * dt), nx = f.x + dx / d * s, ny = f.y + dy / d * s;
    const ox = f.x, oy = f.y;
    if (free(nx, f.y)) f.x = nx;
    if (free(f.x, ny)) f.y = ny;
    f.face = faceOf(dx, dy, f.face);
    f.sprite.setPosition(f.x, f.y).setDepth(f.y);
    return Math.hypot(f.x - ox, f.y - oy) > s * 0.2;
  }

  /** A shout over a villager's head (pixel font), gone after a couple of seconds. */
  private shout(f: Folk, text: string) {
    f.bubble?.destroy();
    const b = speechBubble(this.scene, f.x, f.y - 30, text, "shout");
    isoAnchor(b, f);
    f.bubble = b;
    this.scene.time.delayedCall(2200, () => { if (f.bubble === b) { b.destroy(); f.bubble = undefined; } });
  }

  /** The villager closest to (x, y) shouts this (a hero just cast a spell in the village). */
  shoutNear(x: number, y: number, text: string) {
    let best: Folk | undefined, bd = Infinity;
    for (const f of this.folk) { if (!f.ready) continue; const d = Math.hypot(f.x - x, f.y - y); if (d < bd) { bd = d; best = f; } }
    if (best) { this.shout(best, text); best.nextShout = this.scene.time.now + 2500; }
  }

  /**
   * An outlaw hero is in the village (shared/wrath.ts): every villager runs at the nearest one and lays into them
   * (the server deals the damage). With no outlaw left they walk back to the square.
   */
  private mob(f: Folk, foes: { x: number; y: number }[], now: number, dt: number) {
    let foe = foes[0], bd = Infinity;
    for (const o of foes) { const d = Math.hypot(o.x - f.x, o.y - f.y); if (d < bd) { bd = d; foe = o; } }
    if (f.mode !== "mob") { f.mode = "mob"; f.nextBlow = now + rand(200, 900); f.nextShout = now + rand(0, 2500); f.backAt = 0; }
    if (f.bubble) f.bubble.setPosition(f.x, f.y - 30);
    if (now >= (f.nextShout ?? 0)) {
      f.nextShout = now + rand(3500, 8000);
      if (Math.random() < 0.55) this.shout(f, WRATH.shouts[Math.floor(Math.random() * WRATH.shouts.length)]);
    }
    if (this.stepTo(f, foe.x, foe.y, f.speed * 2.6, dt, 14)) { if (now >= (f.backAt ?? 0)) this.play(f, "run"); return; }
    f.face = faceOf(foe.x - f.x, foe.y - f.y, f.face);
    if (bd <= 22 && now >= (f.nextBlow ?? 0)) {
      f.nextBlow = now + rand(700, 1200);
      this.play(f, Math.random() < 0.5 ? "attack" : "attack2", true);
      f.backAt = now + 450;
    } else if (now >= (f.backAt ?? 0)) this.play(f, bd <= 22 ? "idle" : "cheer");
  }

  update(dtMs: number, foes: { x: number; y: number }[] = [], me?: { x: number; y: number }) {
    const now = this.scene.time.now, dt = dtMs / 1000;
    this.loadSheets(me);
    for (const f of this.folk) {
      if (!f.ready) continue;
      if (foes.length) { this.mob(f, foes, now, dt); continue; }
      if (f.bubble) f.bubble.setPosition(f.x, f.y - 30);
      if (f.mode === "mob") {
        // calm again: back to the square
        const p = this.randomSpot() ?? { x: f.x, y: f.y };
        f.mode = "home"; f.tx = p.x; f.ty = p.y; f.until = now + 15000; f.stuck = 0;
      }
      if (f.mode === "home") {
        if (this.stepTo(f, f.tx, f.ty, f.speed * 1.3, dt, 2)) { f.stuck = 0; this.play(f, "walk"); continue; }
        f.stuck = (f.stuck ?? 0) + dtMs;
        const there = Math.hypot(f.tx - f.x, f.ty - f.y) <= 3;
        if (there || f.stuck > 2500 || now > f.until) {
          if (!there) { // wedged behind a house: pick another spot to head for
            const p = this.randomSpot();
            if (p && now <= f.until) { f.tx = p.x; f.ty = p.y; f.stuck = 0; continue; }
            if (p) { f.x = p.x; f.y = p.y; f.sprite.setPosition(f.x, f.y).setDepth(f.y); }
          }
          f.mode = "idle"; f.until = now + rand(1000, 3000); this.play(f, "idle");
        }
        continue;
      }
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
