import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { PALETTE, SkillFx } from "./skillfx";

/**
 * The elemental blobs' moves on screen (server: TownRoom.elemSpecial / stormSparks, numbers in shared/constants.ts
 * ELEM_BLOB). Every move is painted flat on the ground first (a ring, a cone, a target mark) so it can be dodged, then
 * lands with particles in its element. No screen shake or flash (Murat's fluid combat rule).
 */
interface Ent { sprite: Phaser.GameObjects.Sprite; top: number }
export interface ElemFxHost {
  scene: Phaser.Scene;
  fx: SkillFx;
  ent: (id: string) => Ent | undefined;
  say: (x: number, y: number, text: string, color: string) => void;
  squash: (id: string, kx: number, ky: number, ms: number) => void;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const GROUND_DEPTH = 2; // flat paintings at a low depth lie on the iso ground

/** A flat ground painting that redraws itself every 30 ms for `ms` (f = 0..1 progress), then goes. */
function mark(scene: Phaser.Scene, ms: number, draw: (g: Phaser.GameObjects.Graphics, f: number) => void) {
  const g = scene.add.graphics().setDepth(GROUND_DEPTH), t0 = scene.time.now;
  const tick = () => { g.clear(); draw(g, Math.min(1, (scene.time.now - t0) / ms)); };
  tick();
  const ev = scene.time.addEvent({ delay: 30, loop: true, callback: tick });
  scene.time.delayedCall(ms, () => { ev.remove(); g.destroy(); });
}
/** A wedge from (x, y) along angle `a`, `half` radians each side. */
function wedge(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, a: number, half: number) {
  g.beginPath(); g.moveTo(x, y);
  for (let i = 0; i <= 12; i++) { const t = a - half + (half * 2 * i) / 12; g.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r); }
  g.closePath();
}

export function bindElemFx(room: Room, h: ElemFxHost) {
  const { scene, fx } = h;

  // Wind-ups: the blob gathers itself, and the ground shows where the move will land
  room.onMessage("elemwind", ({ id, kind, ms, x, y, r, ax, ay, reach, half }) => {
    const e = h.ent(id);
    if (kind === "nova") {
      if (e) { h.squash(id, 1.25, 1.2, ms); h.say(e.sprite.x, e.sprite.y - e.top - 6, "FROST NOVA!", "#8fd8ff"); }
      mark(scene, ms, (g, f) => {
        g.fillStyle(0x1e3e64, 0.22).fillCircle(x, y, r).lineStyle(1.5, 0xb0e4ff, 0.9).strokeCircle(x, y, r);
        g.fillStyle(0x6eb0e0, 0.3).fillCircle(x, y, r * f);
      });
      // frost gathering on it while it swells
      for (let i = 0; i < 10; i++) scene.time.delayedCall(i * ms / 10, () => { if (e) fx.p(e.sprite.x + rnd(-8, 8), e.sprite.y + rnd(-3, 3), rnd(2, 10), pick(PALETTE.frost), { vz: rnd(4, 12), life: 300, size: 1, size1: 0 }); });
    } else if (kind === "breath") {
      const a = Math.atan2(ay, ax);
      if (e) { h.squash(id, 0.85, 1.2, ms); h.say(e.sprite.x, e.sprite.y - e.top - 6, "FIRE BREATH!", "#ff9a4a"); }
      mark(scene, ms, (g, f) => {
        const cx = e?.sprite.x ?? x, cy = e?.sprite.y ?? y;
        g.fillStyle(0x5a1a0c, 0.24); wedge(g, cx, cy, reach, a, half); g.fillPath();
        g.lineStyle(1.5, 0xffa848, 0.85); wedge(g, cx, cy, reach, a, half); g.strokePath();
        g.fillStyle(0xe0661c, 0.32); wedge(g, cx, cy, reach * f, a, half); g.fillPath();
      });
      // smoke curling out of its maw as it draws breath
      for (let i = 0; i < 8; i++) scene.time.delayedCall(i * ms / 8, () => { if (e) fx.p(e.sprite.x + ax * 5, e.sprite.y + ay * 3, e.top * 0.45, pick([0x4a4440, 0x3a3532, 0xa83a12]), { vz: rnd(8, 16), vx: rnd(-4, 4), life: 420, size: 2, size1: 1, alpha: 0.6 }); });
    } else if (kind === "splurt" && e) {
      h.squash(id, 1.2, 0.8, ms);
      for (let i = 0; i < 5; i++) fx.p(e.sprite.x + rnd(-5, 5), e.sprite.y, e.top * 0.6, pick(PALETTE.poison.slice(1)), { vz: rnd(10, 25), g: 120, life: 360, size: 1, size1: 1 });
    }
  });

  // Venom glob: arcs through the air to the marked spot, splashes, and leaves a bubbling puddle
  room.onMessage("venomspit", ({ x0, y0, x, y, ms, r, puddleMs }) => {
    mark(scene, ms, (g, f) => { g.lineStyle(1.5, 0xb4e04e, 0.5 + f * 0.4).strokeCircle(x, y, r); g.fillStyle(0x4a6a1c, 0.12 + f * 0.25).fillCircle(x, y, r * f); });
    const glob = scene.add.circle(x0, y0, 3, 0x8fd13a).setStrokeStyle(1, 0x2a3e12).setDepth(9500);
    const t0 = scene.time.now, d = Math.hypot(x - x0, y - y0), H = 16 + d * 0.25;
    const ev = scene.time.addEvent({ delay: 16, loop: true, callback: () => {
      const f = Math.min(1, (scene.time.now - t0) / ms), z = Math.sin(f * Math.PI) * H;
      glob.setPosition(x0 + (x - x0) * f, y0 + (y - y0) * f - z);
      if (Math.random() < 0.4) fx.p(glob.x, glob.y + z, z, pick(PALETTE.poison.slice(2)), { g: 120, life: 260, size: 1, size1: 0 });
    } });
    scene.time.delayedCall(ms, () => {
      ev.remove(); glob.destroy();
      for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, v = rnd(25, 60); fx.p(x, y, 2, pick(PALETTE.poison.slice(1)), { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5, vz: rnd(20, 45), g: 160, life: rnd(300, 460), size: pick([1, 2]), size1: 1 }); }
      // the puddle: lumpy green pool with bubbles, fading out at the end
      const g = scene.add.graphics().setDepth(GROUND_DEPTH), blobs = [...Array(6)].map(() => [rnd(-r * 0.5, r * 0.5), rnd(-r * 0.4, r * 0.4), rnd(r * 0.35, r * 0.6)]);
      const p0 = scene.time.now;
      const ev2 = scene.time.addEvent({ delay: 60, loop: true, callback: () => {
        const f = (scene.time.now - p0) / puddleMs, a = f > 0.8 ? (1 - f) * 5 : 1;
        g.clear();
        for (const [bx, by, br] of blobs) g.fillStyle(0x2a3e12, 0.5 * a).fillEllipse(x + bx, y + by, br * 2.2, br * 1.5);
        for (const [bx, by, br] of blobs) g.fillStyle(0x78a82c, 0.45 * a).fillEllipse(x + bx - 1, y + by - 1, br * 1.6, br * 1.0);
        if (Math.random() < 0.35) fx.p(x + rnd(-r * 0.7, r * 0.7), y + rnd(-r * 0.5, r * 0.5), 1, pick(PALETTE.poison.slice(0, 3)), { vz: rnd(6, 14), life: 260, size: 1, size1: 0 });
      } });
      scene.time.delayedCall(puddleMs, () => { ev2.remove(); g.destroy(); });
    });
  });

  // Frost Nova: a ring of ice bursts out, a frost circle stays on the ground for a moment
  room.onMessage("frostnova", ({ x, y, r }) => {
    fx.ring(x, y, r, "frost", 30, { up: 18, life: 480, size: 2 });
    fx.ring(x, y, r * 0.6, "frost", 18, { up: 10, life: 380, size: 1 });
    fx.glow(x, y, 0, r * 0.9, 0x8fd8ff, 380, 0.5, true);
    const g = scene.add.graphics().setDepth(GROUND_DEPTH);
    g.fillStyle(0xb0e4ff, 0.35).fillCircle(x, y, r).lineStyle(2, 0xf2fcff, 0.7).strokeCircle(x, y, r * 0.98);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, d = r * rnd(0.3, 0.95); g.lineStyle(1, 0xf2fcff, 0.8).lineBetween(x, y, x + Math.cos(a) * d, y + Math.sin(a) * d); }
    scene.tweens.add({ targets: g, alpha: 0, duration: 900, delay: 200, onComplete: () => g.destroy() });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; fx.p(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, 2, pick(PALETTE.frost), { vz: rnd(20, 40), g: 140, life: rnd(380, 520), size: 2, size1: 1 }); }
  });

  // Fire Breath: a roaring stream of flame along the cone, the ground scorched where it passed
  room.onMessage("firebreath", ({ id, x, y, ax, ay, reach, half }) => {
    const a = Math.atan2(ay, ax), e = h.ent(id), z = (e?.top ?? 14) * 0.45;
    if (e) h.squash(id, 1.15, 0.85, 200);
    const scorch = scene.add.graphics().setDepth(GROUND_DEPTH);
    scorch.fillStyle(0x1e0a06, 0.4); wedge(scorch, x, y, reach * 0.95, a, half * 0.85); scorch.fillPath();
    scene.tweens.add({ targets: scorch, alpha: 0, duration: 1200, delay: 300, onComplete: () => scorch.destroy() });
    for (let k = 0; k < 14; k++) scene.time.delayedCall(k * 30, () => {
      for (let i = 0; i < 5; i++) {
        const t = a + rnd(-half, half) * 0.9, v = reach * rnd(1.6, 2.4);
        fx.p(x + ax * 6, y + ay * 6, z, pick(PALETTE.fire), { vx: Math.cos(t) * v, vy: Math.sin(t) * v, vz: rnd(-14, 10), drag: 2.4, life: rnd(330, 460), size: pick([1, 2, 2, 3]), size1: 0, add: true });
      }
    });
    fx.glow(x + ax * reach * 0.5, y + ay * reach * 0.5, 4, reach * 0.55, 0xff9f1c, 420, 0.45, true);
  });

  // Storm sparks: little crackling points on the ground that live a moment
  room.onMessage("sparks", ({ id, pts, ms, r }) => {
    const e = h.ent(id), sx = e?.sprite.x, sy = e?.sprite.y;
    for (const [x, y] of pts as [number, number][]) {
      if (sx !== undefined && sy !== undefined) fx.bolt(sx, sy, (e?.top ?? 12) * 0.5, x, y, 1, PALETTE.lightning, 1, 140);
      mark(scene, ms, (g, f) => {
        const a = f > 0.8 ? (1 - f) * 5 : 1;
        g.fillStyle(0x2a2470, 0.25 * a).fillCircle(x, y, r).lineStyle(1, 0xbcd0ff, 0.6 * a).strokeCircle(x, y, r * (0.7 + 0.3 * Math.random()));
      });
      const n = Math.floor(ms / 140);
      for (let i = 0; i < n; i++) scene.time.delayedCall(i * 140 + rnd(0, 60), () => {
        const a1 = Math.random() * Math.PI * 2, a2 = a1 + rnd(1.5, 3.5);
        fx.bolt(x + Math.cos(a1) * r * 0.8, y + Math.sin(a1) * r * 0.5, rnd(1, 6), x + Math.cos(a2) * r * 0.8, y + Math.sin(a2) * r * 0.5, rnd(0, 4), PALETTE.lightning, 1, 110);
        if (Math.random() < 0.5) fx.p(x, y, 2, pick(PALETTE.lightning), { vx: rnd(-30, 30), vy: rnd(-15, 15), vz: rnd(10, 30), drag: 4, life: 160, size: 1, size1: 0, add: true });
      });
    }
  });

  // Electric: a hero's shock leaps from one monster to the next
  room.onMessage("arc", ({ x0, y0, x1, y1 }) => fx.bolt(x0, y0, 10, x1, y1, 10, PALETTE.lightning, 1, 180));
}
