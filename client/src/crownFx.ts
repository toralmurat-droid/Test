import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { PALETTE } from "./skillfx";
import type { ElemFxHost } from "./elemFx";

/**
 * The Crown court's moves on screen (server/crownMobs.ts, one "crown" message, `ev` says which): a crownguard's raised
 * shield, a herald's decree ringing out (and its hush when broken), a magus' blink, the Thronewarden's rampart, the
 * Pretender's usurping swap, and the Riven King's telegraphs (the blade line, mirror shards, Kingsfall) painted flat on
 * the ground first so they can be dodged. Cosmetic only; no screen shake or flash.
 */
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const GROUND_DEPTH = 2;
const GOLD = 0xe8c060, GOLD_DARK = 0x8a6a24, GLASS = [0xffffff, 0xd6f6ff, 0xb8c8ff, 0x9a8ad8], RED = 0xc8343c;

export function bindCrownFx(room: Room, h: ElemFxHost) {
  const { scene, fx } = h;
  /** A flat ground painting that redraws every 30 ms for `ms` (f = 0..1). */
  const paint = (ms: number, draw: (g: Phaser.GameObjects.Graphics, f: number) => void, depth = GROUND_DEPTH) => {
    const g = scene.add.graphics().setDepth(depth), t0 = scene.time.now;
    const tick = () => { g.clear(); draw(g, Math.min(1, (scene.time.now - t0) / ms)); };
    tick();
    const ev = scene.time.addEvent({ delay: 30, loop: true, callback: tick });
    scene.time.delayedCall(ms, () => { ev.remove(); g.destroy(); });
  };
  const sparks = (x: number, y: number, z: number, n: number, cols: number[], v = 40) => {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = rnd(v * 0.3, v); fx.p(x, y, z, pick(cols), { vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5, vz: rnd(10, 40), g: 60, life: rnd(320, 560), size: pick([1, 1, 2]), size1: 0 }); }
  };
  const puff = (x: number, y: number) => { fx.glow(x, y, 10, 16, 0xc77dff, 280, 0.5); sparks(x, y, 10, 12, PALETTE.arcane, 50); };

  room.onMessage("crown", (m: { ev: string; id: string; to: string; ids: string[]; x: number; y: number; x0: number; y0: number; x2: number; y2: number;
    ax: number; ay: number; ms: number; r: number; w: number; phase: number; pts: [number, number][] }) => {
    const { ev, id } = m, e = h.ent(id);
    if (ev === "oath") {
      if (!e) return;
      h.say(e.sprite.x, e.sprite.y - e.top - 6, "oath unbroken!", "#ff6a5a");
      fx.glow(e.sprite.x, e.sprite.y, e.top * 0.5, 18, RED, 420, 0.55);
      h.squash(id, 1.15, 0.9, 220);
    } else if (ev === "ward") {
      if (!e) return;
      const ms = m.ms || 2000;
      paint(ms, (g, f) => { // a shield arc in front of the guard, fading as the guard drops it
        const x = e.sprite.x, y = e.sprite.y, a0 = Math.atan2(m.ay, m.ax), a = 0.8 * (1 - f * 0.6);
        g.lineStyle(3, GOLD, 0.75 * (1 - f * 0.7)).beginPath().arc(x, y - 6, 16, a0 - 0.9, a0 + 0.9).strokePath();
        g.lineStyle(1, 0xffffff, a).beginPath().arc(x, y - 6, 18, a0 - 0.6, a0 + 0.6).strokePath();
      }, 6);
    } else if (ev === "proclaim") {
      if (!e) return;
      const ms = m.ms || 1000, r = m.r || 200, x = e.sprite.x, y = e.sprite.y;
      h.say(x, y - e.top - 6, "hear the decree!", "#ffd166");
      paint(ms, (g, f) => { g.lineStyle(1.5, GOLD, 0.25 + 0.5 * f).strokeCircle(x, y, r * f).fillStyle(GOLD, 0.06 + 0.08 * f).fillCircle(x, y, 22); });
      fx.glow(x, y, e.top * 0.7, 12, GOLD, ms, 0.4);
    } else if (ev === "decree") {
      for (const a of m.ids ?? []) { const t = h.ent(a); if (t) { fx.glow(t.sprite.x, t.sprite.y, t.top * 0.5, 14, GOLD, 360, 0.5); sparks(t.sprite.x, t.sprite.y, t.top * 0.5, 6, PALETTE.holy, 30); } }
      if (e) fx.ring(e.sprite.x, e.sprite.y, m.r || 200, "holy", 28, { up: 10, life: 520, size: 1 });
    } else if (ev === "hush") {
      if (!e) return;
      h.say(e.sprite.x, e.sprite.y - e.top - 6, "silenced", "#b0b8c8");
      sparks(e.sprite.x, e.sprite.y, e.top * 0.7, 8, [0x8a8f9a, 0xb0b8c8], 25);
    } else if (ev === "blink") {
      puff(m.x0, m.y0); puff(m.x, m.y);
      fx.bolt(m.x0, m.y0, 12, m.x, m.y, 12, PALETTE.arcane, 1, 180);
    } else if (ev === "hunt") {
      for (const a of m.ids ?? []) { const t = h.ent(a); if (t) { h.say(t.sprite.x, t.sprite.y - t.top - 6, "!", "#ff6a5a"); fx.glow(t.sprite.x, t.sprite.y, t.top * 0.5, 12, RED, 320, 0.45); } }
    } else if (ev === "rampart") {
      const t = h.ent(m.to);
      if (!t) return;
      if (e) fx.bolt(e.sprite.x, e.sprite.y, e.top * 0.6, t.sprite.x, t.sprite.y, t.top * 0.6, [0xfff3b0, GOLD, GOLD_DARK], 1, 260);
      h.say(t.sprite.x, t.sprite.y - t.top - 6, "warded", "#ffd166");
      paint(m.ms || 4000, (g, f) => { const x = t.sprite.x, y = t.sprite.y; g.lineStyle(1.5, GOLD, 0.7 * (1 - f * 0.6)).strokeEllipse(x, y - t.top * 0.45, 26, t.top + 8); }, 6);
    } else if (ev === "usurp") {
      const t = h.ent(m.to);
      puff(m.x0, m.y0); puff(m.x, m.y);
      if (e) h.say(e.sprite.x, e.sprite.y - e.top - 6, "usurped!", "#ff6a5a");
      if (t) h.squash(m.to, 0.8, 1.2, 220);
    } else if (ev === "phase") {
      if (!e) return;
      const x = e.sprite.x, y = e.sprite.y;
      fx.ring(x, y, 60, m.phase >= 3 ? "blood" : "frost", 30, { up: 20, life: 600, size: 2 });
      fx.glow(x, y, e.top * 0.5, 30, m.phase >= 3 ? RED : 0xb8c8ff, 500, 0.5);
      h.squash(id, 1.2, 0.85, 300);
    } else if (ev === "edge") {
      const { x, y, x2, y2, w = 20, ms = 900 } = m, a = Math.atan2(y2 - y, x2 - x), nx = -Math.sin(a) * w / 2, ny = Math.cos(a) * w / 2;
      paint(ms, (g, f) => {
        g.fillStyle(RED, 0.12 + 0.15 * f).fillPoints([{ x: x + nx, y: y + ny }, { x: x2 + nx, y: y2 + ny }, { x: x2 - nx, y: y2 - ny }, { x: x - nx, y: y - ny }], true);
        g.lineStyle(1, 0xffb0a0, 0.5 + 0.4 * f).lineBetween(x, y, x + (x2 - x) * f, y + (y2 - y) * f);
      });
    } else if (ev === "edgecut") {
      const { x, y, x2, y2 } = m;
      fx.bolt(x, y, 8, x2, y2, 8, [0xffffff, 0xd6f6ff, 0xa9b8d0], 2, 200);
      for (let i = 0; i < 8; i++) { const u = i / 7; sparks(x + (x2 - x) * u, y + (y2 - y) * u, 6, 2, PALETTE.steel, 30); }
    } else if (ev === "shards") {
      const r = m.r || 24, ms = m.ms || 1200;
      for (const [x, y] of m.pts ?? []) paint(ms, (g, f) => {
        g.fillStyle(0x9a8ad8, 0.12 + 0.12 * f).fillCircle(x, y, r).lineStyle(1, 0xd6f6ff, 0.5 + 0.4 * f).strokeCircle(x, y, r);
        g.fillStyle(0xb8c8ff, 0.2).fillCircle(x, y, r * f);
      });
    } else if (ev === "shardfall") {
      const r = m.r || 24;
      for (const [x, y] of m.pts ?? []) { fx.ring(x, y, r, "frost", 14, { up: 16, life: 380, size: 1 }); sparks(x, y, 4, 12, GLASS, r * 1.6); fx.glow(x, y, 2, r * 0.8, 0xd6f6ff, 260, 0.4, true); }
    } else if (ev === "fall") {
      const { x, y } = m, r = m.r || 100, ms = m.ms || 2000;
      if (e) h.say(e.sprite.x, e.sprite.y - e.top - 8, "KINGSFALL", "#ff6a5a");
      paint(ms, (g, f) => {
        g.fillStyle(0x1a0a0c, 0.18 + 0.12 * f).fillCircle(x, y, r).lineStyle(2, RED, 0.5 + 0.45 * f).strokeCircle(x, y, r);
        g.fillStyle(RED, 0.12 + 0.14 * f).fillCircle(x, y, r * f);
      });
    } else if (ev === "fallen") {
      const { x, y } = m, r = m.r || 100;
      if (e) h.squash(id, 0.75, 1.3, 300);
      fx.ring(x, y, r, "earth", 40, { up: 24, life: 560, size: 2 });
      fx.ring(x, y, r * 0.6, "blood", 24, { up: 14, life: 480, size: 1 });
      fx.glow(x, y, 2, r * 0.9, RED, 380, 0.4, true);
      paint(900, (g, f) => { const a = 1 - f; g.lineStyle(2, GOLD, 0.6 * a).strokeCircle(x, y, r * (0.7 + 0.3 * f)); });
    }
  });
}
