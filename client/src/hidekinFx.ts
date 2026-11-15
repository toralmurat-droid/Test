import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { PALETTE } from "./skillfx";
import type { ElemFxHost } from "./elemFx";

/**
 * The Hide-Kin's moves on screen (server/hidekin.ts, one "hidekin" message, `ev` says which): a burrowing monster
 * sprays dirt, a cracking ring on the ground shows where it will come up (and fills as the time runs out, so step off),
 * an earth burst when it surfaces, a thread between a stitcher and the kinsman it mends. Cosmetic only; no screen shake.
 */
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const GROUND_DEPTH = 2;
const DIRT = [0x5a4326, 0x6d5330, 0x44321c, 0x7a6038];
const STITCH = 0x9be36a;

export function bindHidekinFx(room: Room, h: ElemFxHost) {
  const { scene, fx } = h;
  const dirt = (x: number, y: number, n: number, v: number, up: number) => {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = rnd(v * 0.3, v); fx.p(x + rnd(-4, 4), y, 2, pick(DIRT), { vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5, vz: rnd(up * 0.4, up), g: 160, life: rnd(300, 520), size: pick([1, 2, 2, 3]), size1: 1 }); }
  };
  /** A flat ground painting that redraws every 30 ms for `ms` (f = 0..1). */
  const paint = (ms: number, draw: (g: Phaser.GameObjects.Graphics, f: number) => void) => {
    const g = scene.add.graphics().setDepth(GROUND_DEPTH), t0 = scene.time.now;
    const tick = () => { g.clear(); draw(g, Math.min(1, (scene.time.now - t0) / ms)); };
    tick();
    const ev = scene.time.addEvent({ delay: 30, loop: true, callback: tick });
    scene.time.delayedCall(ms, () => { ev.remove(); g.destroy(); });
  };

  room.onMessage("hidekin", (m: { ev: string; id: string; x: number; y: number; r: number; ms: number; to: string; amount: number }) => {
    const { ev, id } = m, e = h.ent(id);
    if (ev === "burrow") {
      const x = e?.sprite.x ?? m.x, y = e?.sprite.y ?? m.y;
      if (e) h.squash(id, 1.2, 0.7, 260);
      dirt(x, y, 14, 50, 36);
      paint(700, (g, f) => { const a = 1 - f; g.fillStyle(0x2c2010, 0.45 * a).fillEllipse(x, y, 26 + 10 * f, 12 + 4 * f).fillStyle(0x6d5330, 0.35 * a).fillEllipse(x, y, 16, 7); });
    } else if (ev === "mark") {
      const { x, y, r, ms } = m;
      paint(ms, (g, f) => {
        g.fillStyle(0x2c2010, 0.2).fillCircle(x, y, r).lineStyle(1.5, 0xd8a050, 0.55 + 0.4 * f).strokeCircle(x, y, r);
        g.fillStyle(0x8a5a24, 0.22 + 0.2 * f).fillCircle(x, y, r * f);
        for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3, d = r * (0.25 + 0.7 * f) * (0.6 + 0.4 * ((i * 37) % 10) / 10); g.lineStyle(1, 0x1a1008, 0.8).lineBetween(x, y, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6); }
      });
      for (let i = 0; i < 6; i++) scene.time.delayedCall((i * ms) / 6, () => dirt(x + rnd(-r, r) * 0.6, y + rnd(-r, r) * 0.4, 2, 20, 14));
    } else if (ev === "up") {
      const { x, y, r } = m;
      if (e) h.squash(id, 0.8, 1.3, 220);
      if (!r) { dirt(x, y, 8, 35, 28); return; }
      dirt(x, y, 26, r * 1.6, 70);
      fx.ring(x, y, r, "earth", 26, { up: 14, life: 420, size: 2 });
      fx.glow(x, y, 2, r * 0.9, 0xd8a050, 320, 0.4, true);
      paint(900, (g, f) => { const a = 1 - f; g.fillStyle(0x1e1408, 0.5 * a).fillCircle(x, y, r * 0.8).lineStyle(1, 0xd8a050, 0.6 * a).strokeCircle(x, y, r * (0.8 + 0.2 * f)); });
    } else if (ev === "burst") {
      const { x, y, r } = m;
      if (e) h.squash(id, 0.7, 1.4, 260);
      dirt(x, y, 30, (r || 40) * 1.8, 80);
      fx.ring(x, y, r || 40, "earth", 26, { up: 18, life: 440, size: 2 });
      for (let i = 0; i < 8; i++) fx.p(x + rnd(-6, 6), y, 4, pick([0x7a9a3a, 0x9ab84a, 0x4c6a24]), { vx: rnd(-40, 40), vy: rnd(-20, 20), vz: rnd(30, 70), g: 160, life: 480, size: 2, size1: 0 });
      paint(1000, (g, f) => { const a = 1 - f; g.fillStyle(0x1a1208, 0.6 * a).fillCircle(x, y, (r || 40) * 0.7).lineStyle(1.5, 0x7a9a3a, 0.6 * a).strokeCircle(x, y, (r || 40) * (0.7 + 0.3 * f)); });
    } else if (ev === "sew") {
      const t = h.ent(m.to);
      if (!e || !t) return;
      h.say(e.sprite.x, e.sprite.y - e.top - 6, "stitching...", "#9be36a");
      const ms = m.ms || 1200;
      paint(ms, (g, f) => {
        const ax = e.sprite.x, ay = e.sprite.y - e.top * 0.5, bx = t.sprite.x, by = t.sprite.y - t.top * 0.5, n = 10, k = Math.max(1, Math.floor(n * f));
        g.lineStyle(1, STITCH, 0.9);
        for (let i = 0; i < k; i += 2) { const u = i / n, v = Math.min(1, (i + 1) / n); g.lineBetween(ax + (bx - ax) * u, ay + (by - ay) * u + (i % 4 ? 2 : -2), ax + (bx - ax) * v, ay + (by - ay) * v + (i % 4 ? -2 : 2)); }
      });
    } else if (ev === "stitch") {
      const t = h.ent(m.to);
      if (!t) return;
      const x = t.sprite.x, y = t.sprite.y;
      fx.glow(x, y, t.top * 0.5, 14, STITCH, 300, 0.5);
      for (let i = 0; i < 10; i++) fx.p(x + rnd(-6, 6), y, rnd(0, t.top), pick(PALETTE.poison.length ? PALETTE.poison : [STITCH]), { vz: rnd(15, 34), life: 520, size: 1, size1: 0 });
      h.say(x, y - t.top - 6, `+${m.amount}`, "#7cfc00");
    }
  });
}
