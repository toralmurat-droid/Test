import Phaser from "phaser";
import { SIEGE_SITES, WORK_SLOTS, ropeTop } from "../../shared/siege";
import { ISO, isoAnchor, isoX, isoY, screenDir } from "./iso";
import { TX } from "./siegeArt";

/** Sprite frames of a monster sheet: walk pairs, then wind-up / strike pairs (see TownScene FRAME_BASE/ATTACK_BASE). */
const FRAME_BASE: Record<string, number> = { down: 0, up: 2, right: 4, left: 4 };
const ATTACK_BASE: Record<string, number> = { down: 6, up: 8, right: 10, left: 10 };

interface Worker { sprite: Phaser.GameObjects.Sprite; top: number; vdir?: string }
interface Tools { plank?: Phaser.GameObjects.Image; saw?: Phaser.GameObjects.Image; rope?: Phaser.GameObjects.Image; nextChip: number; lastStrike: number }

/**
 * Skeleton workers at the siege works (server TownRoom.work): poses and tools.
 *  - hammer: raises its weapon and knocks it on the engine, wood chips fly
 *  - saw:    saws the log on the sawhorse, the saw slides back and forth, sawdust drops
 *  - carry:  a plank over its head on the way to the engine (fetch: empty-handed on the way back)
 *  - haul:   leans back on a rope tied high on the engine
 * When a hero comes near the server sends "workdrop": a "!" and the plank / saw falls to the ground.
 */
export class SiegeWork {
  private tools = new Map<string, Tools>();
  private dropped: Phaser.GameObjects.Image[] = [];

  constructor(private scene: Phaser.Scene) {}

  /** Per frame for a visible monster. Returns the sheet frame to show while working, or undefined. */
  update(id: string, e: Worker, p: any, now: number, moving: boolean): number | undefined {
    const work: string = p.dead || p.hidden ? "" : p.work ?? "";
    const w = p.job >= 0 ? WORK_SLOTS[p.job] : undefined;
    let t = this.tools.get(id);
    if (!work || !w) { if (t) this.clear(id); return undefined; }
    if (!t) { t = { nextChip: 0, lastStrike: 0 }; this.tools.set(id, t); }
    const x = e.sprite.x, y = e.sprite.y;
    // face the work (iso: on screen)
    const lx = work === "fetch" ? x + (x - w.lookX) : w.lookX, ly = work === "fetch" ? y + (y - w.lookY) : w.lookY;
    let dir = (p.dir as string) ?? "down";
    if (!moving) {
      dir = ISO ? screenDir(isoX(lx, ly) - isoX(x, y), isoY(lx, ly) - isoY(x, y), dir) : Math.abs(lx - x) > Math.abs(ly - y) ? (lx > x ? "right" : "left") : (ly > y ? "down" : "up");
      e.vdir = dir;
    }
    const attack = e.sprite.texture.frameTotal > 12;
    this.plank(t, work === "carry", x, y - e.top + 5, e.sprite); // on its head, under the HP bar
    this.saw(t, work === "saw", w, now);
    this.rope(t, work === "haul", e, w);
    if (moving) return undefined;
    const A = ATTACK_BASE[dir] ?? 6, F = FRAME_BASE[dir] ?? 0;
    if (work === "hammer") {
      const ph = (now + (id.length * 97 + id.charCodeAt(id.length - 1) * 13)) % 1100;
      const strike = ph > 760 && ph < 900;
      if (strike && now - t.lastStrike > 600) { t.lastStrike = now; this.chips(w.lookX + (x - w.lookX) * 0.35, w.lookY + (y - w.lookY) * 0.35 - 10, 4); }
      return attack ? (strike ? A + 1 : ph > 300 ? A : F) : F;
    }
    if (work === "saw") {
      if (now > t.nextChip) { t.nextChip = now + 260; this.dust(SIEGE_SITES[w.site].saw.x + (Math.random() - 0.5) * 3, SIEGE_SITES[w.site].saw.y - 4); }
      return attack ? (Math.floor(now / 230) % 2 ? A : A + 1) : F + (Math.floor(now / 230) % 2);
    }
    if (work === "haul") return attack ? A : F; // leaning back on the rope
    return undefined;
  }

  /** The monster went off screen or away: its tools go with it. */
  clear(id: string) {
    const t = this.tools.get(id);
    if (!t) return;
    t.plank?.destroy(); t.saw?.destroy(); t.rope?.destroy();
    this.tools.delete(id);
  }

  /** Interrupted by a hero: the plank or saw drops (and lies there a while). */
  drop(id: string, work: string, x: number, y: number) {
    this.clear(id);
    if (work === "carry") {
      const pl = this.scene.add.image(x + 6, y - 22, "siege_plank").setOrigin(0.5, 1).setScale(1 / TX).setDepth(y);
      isoAnchor(pl, { x, y }); // falls straight down on screen
      this.scene.tweens.add({ targets: pl, y: y + 3, angle: 8 + Math.random() * 10, duration: 320, ease: "Quad.easeIn", onComplete: () => this.chips(x + 6, y, 3) });
      this.keep(pl);
    } else if (work === "saw") {
      const sw = this.scene.add.image(x - 4, y - 8, "siege_saw").setOrigin(0.5, 1).setScale(1 / TX).setDepth(y);
      isoAnchor(sw, { x, y });
      this.scene.tweens.add({ targets: sw, y: y + 2, angle: -70, duration: 260, ease: "Quad.easeIn" });
      this.keep(sw);
    }
  }

  private keep(o: Phaser.GameObjects.Image) {
    this.dropped.push(o);
    this.scene.time.delayedCall(14000, () => this.scene.tweens.add({ targets: o, alpha: 0, duration: 900, onComplete: () => { o.destroy(); this.dropped = this.dropped.filter((d) => d !== o); } }));
    while (this.dropped.length > 40) this.dropped.shift()!.destroy();
  }

  private plank(t: Tools, on: boolean, x: number, y: number, anchor: Phaser.GameObjects.Sprite) {
    if (!on) { t.plank?.destroy(); t.plank = undefined; return; }
    if (!t.plank) { t.plank = this.scene.add.image(x, y, "siege_plank").setOrigin(0.5, 1).setScale(1 / TX); isoAnchor(t.plank, anchor); }
    t.plank.setPosition(x, y + (Math.floor(this.scene.time.now / 150) % 2)).setDepth(anchor.y + 0.5);
  }

  private saw(t: Tools, on: boolean, w: (typeof WORK_SLOTS)[number], now: number) {
    if (!on) { t.saw?.destroy(); t.saw = undefined; return; }
    const s = SIEGE_SITES[w.site].saw, flip = SIEGE_SITES[w.site].flip;
    if (!t.saw) { t.saw = this.scene.add.image(s.x, s.y, "siege_saw").setOrigin(0.5, 1).setScale(1 / TX).setFlipX(!flip); isoAnchor(t.saw, s); }
    const k = Math.sin(now / 230 * Math.PI) * 4;
    t.saw.setPosition(s.x + (flip ? 3 : -3) + k, s.y - 9).setAngle(flip ? -35 : 35).setDepth(s.y + 1);
  }

  private rope(t: Tools, on: boolean, e: Worker, w: (typeof WORK_SLOTS)[number]) {
    if (!on) { t.rope?.destroy(); t.rope = undefined; return; }
    const r = ropeTop(SIEGE_SITES[w.site]);
    const hx = e.sprite.x, hy = e.sprite.y - e.top * 0.55;
    // the rope's other end on screen, relative to the hand (anchored to the worker, so drawn in its screen offset)
    const dx = ISO ? isoX(r.x, r.y) - isoX(e.sprite.x, e.sprite.y) : r.x - e.sprite.x;
    const dy = (ISO ? isoY(r.x, r.y) - isoY(e.sprite.x, e.sprite.y) : r.y - e.sprite.y) - r.lift + e.top * 0.55;
    if (!t.rope) { t.rope = this.scene.add.image(hx, hy, "siege_rope").setOrigin(0, 0.5); isoAnchor(t.rope, e.sprite); }
    const len = Math.hypot(dx, dy);
    t.rope.setPosition(hx, hy).setAngle(Math.atan2(dy, dx) * 180 / Math.PI).setDisplaySize(len, 1).setDepth(e.sprite.y - 1);
  }

  private chips(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const c = this.scene.add.image(x, y, "siege_chip").setScale(1 / TX).setDepth(y + 2);
      isoAnchor(c, { x, y });
      const vx = (Math.random() - 0.5) * 22, up = 8 + Math.random() * 8;
      this.scene.tweens.add({ targets: c, x: x + vx, y: { from: y, to: y - up }, duration: 160, ease: "Quad.easeOut", yoyo: true, onComplete: () => c.destroy() });
    }
  }

  private dust(x: number, y: number) {
    const c = this.scene.add.image(x, y, "siege_chip").setScale(1 / TX).setDepth(y + 2).setTint(0xd8bc86);
    isoAnchor(c, { x, y });
    this.scene.tweens.add({ targets: c, y: y + 8, x: x + (Math.random() - 0.5) * 4, alpha: 0.3, duration: 500, onComplete: () => c.destroy() });
  }
}
