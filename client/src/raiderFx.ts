import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { TILE } from "../../shared/constants";
import { actAt } from "../../shared/act2";
import type { SkillFx } from "./skillfx";

/**
 * The Night Raiders on screen (server: TownRoom.raidArrive / raiderStep / raiderGone, numbers in shared/raiders.ts).
 * Their black cloaks smoke behind them as they ride, hooves kick up dust on a charge, and when one falls or rides off
 * it comes apart in a cloud of dust and black rags. No screen shake or flash (Murat's fluid combat rule).
 */
interface Ent { sprite: Phaser.GameObjects.Sprite; top: number; state?: any; wisp?: number }
export interface RaiderFxHost {
  fx: SkillFx;
  scene: Phaser.Scene;
  ent: (id: string) => Ent | undefined;
  /** My hero (for "is this in my act / near me") */
  me: () => { x: number; y: number } | undefined;
  feed: (text: string) => void;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const DUST = [0x8a7a66, 0x6e604f, 0x52473b, 0xa89880, 0x7a6c5a];
const RAG = [0x0e0c10, 0x18141a, 0x241e26, 0x2e2630];
const nameOf = (title: string) => (title || "A Night Raider").split(",")[0];

export function bindRaiderFx(room: Room, h: RaiderFxHost) {
  const { fx, scene } = h;
  const dust = (x: number, y: number, n: number, spread: number, up: number, big = 1) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = rnd(spread * 0.3, spread);
      fx.p(x + rnd(-6, 6), y + rnd(-3, 3), rnd(0, 10), pick(DUST), { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5, vz: rnd(up * 0.3, up), g: 8, drag: 1.6,
        life: rnd(900, 1700), size: pick([2, 3, 3, 4]) * big, size1: 5 * big, alpha: 0.6, add: false });
    }
  };
  const rags = (x: number, y: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = rnd(6, 22);
      fx.p(x + rnd(-8, 8), y + rnd(-3, 3), rnd(14, 34), pick(RAG), { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5, vz: rnd(10, 26), g: -4, drag: 1.2,
        life: rnd(1200, 2000), size: pick([2, 3]), size1: 0, alpha: 0.9, add: false, spin: rnd(-4, 4) });
    }
  };
  const near = (x: number, y: number, r: number) => { const m = h.me(); return !!m && Math.hypot(m.x - x, m.y - y) < r; };
  const sameAct = (x: number, y: number) => { const m = h.me(); return !!m && actAt(m.y, m.x) === actAt(y, x); };

  // One comes out of the dark (off screen): hoofbeats for everyone riding that act
  room.onMessage("raider", ({ x, y, title }) => {
    if (sameAct(x, y)) h.feed(`Hoofbeats in the dark... ${nameOf(title)} rides tonight.`);
    rags(x, y, 10);
    dust(x, y, 12, 18, 14);
  });
  // Spurring the horse at someone: a burst of dust and a trail under the hooves
  room.onMessage("raidercharge", ({ id }) => {
    const e = h.ent(id);
    if (!e) return;
    dust(e.sprite.x, e.sprite.y, 8, 26, 12, 0.7);
    for (let i = 1; i < 7; i++) scene.time.delayedCall(i * 100, () => { if (e.sprite.active) dust(e.sprite.x, e.sprite.y + 1, 3, 14, 8, 0.6); });
  });
  // It falls (or rides off at dawn): the rider, the horse and the cloak come apart in a cloud of dust
  room.onMessage("raiderdust", ({ x, y, title, killed, by }) => {
    dust(x, y, 46, 34, 26, 1);
    dust(x, y - 14, 18, 20, 18, 0.8);
    rags(x, y, killed ? 22 : 12);
    if (near(x, y, 20 * TILE)) h.feed(killed ? `${nameOf(title)} falls to dust${by ? ` before ${by}` : ""}.` : `${nameOf(title)} rides off into the dark.`);
  });
}

/** Every frame for a riding raider: its cloak smokes behind it, hooves kick up dust at a gallop. */
export function raiderTrail(fx: SkillFx, e: Ent, moving: boolean, now: number) {
  if (now < (e.wisp ?? 0)) return;
  e.wisp = now + (moving ? 70 : 160);
  const s = e.sprite, back = s.flipX ? 1 : -1;
  // black wisps peeling off the cloak's edge, rising and fading
  fx.p(s.x + back * rnd(4, 12), s.y + rnd(-2, 2), rnd(e.top * 0.45, e.top * 0.85), pick(RAG), {
    vx: back * rnd(4, 14), vy: rnd(-3, 3), vz: rnd(4, 10), g: -6, drag: 1, life: rnd(600, 1000), size: pick([2, 2, 3]), size1: 0, alpha: 0.75, add: false,
  });
  if (moving && Math.random() < 0.5) fx.p(s.x + rnd(-6, 6), s.y + rnd(-1, 2), 0, pick(DUST), { vx: back * rnd(4, 12), vy: rnd(-2, 2), vz: rnd(3, 8), g: 30, drag: 2, life: rnd(400, 650), size: pick([1, 2]), size1: 2, alpha: 0.5, add: false });
}
