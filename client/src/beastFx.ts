import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { PALETTE, SkillFx } from "./skillfx";

/**
 * The beast-folk's moves on screen (server: TownRoom.beastSpecial, numbers in shared/constants.ts BEAST). Every move is
 * painted flat on the ground first ("bwind": a lane, a target circle, a cone, a ring) so it can be dodged, then lands
 * ("bhit") with dust, claw marks, sound rings or falling stones. Rushes ("brush") glide the beast along with a dust trail.
 * No screen shake or flash (Murat's fluid combat rule).
 */
interface Ent { sprite: Phaser.GameObjects.Sprite; top: number; leapUntil?: number }
export interface BeastFxHost {
  scene: Phaser.Scene;
  fx: SkillFx;
  ent: (id: string) => Ent | undefined;
  say: (x: number, y: number, text: string, color: string) => void;
  squash: (id: string, kx: number, ky: number, ms: number) => void;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const GROUND = 2; // flat paintings at a low depth lie on the iso ground
const DUST = [0x8a7a66, 0x6e604f, 0x52473b, 0xa89880];
const STONE = [0x6a625a, 0x857b70, 0x4a443e, 0x9a9086];
const SILK = [0xf2efe6, 0xd8d2c4, 0xb8b0a0];

/** Shout over the beast when it starts a move, and its colour. */
const CALL: Record<string, [string, string]> = {
  gore: ["GORE!", "#ffb07a"], stampede: ["STAMPEDE!", "#ff8a5c"], web: ["", ""], screech: ["SCREECH!", "#d8b8ff"], swoop: ["", ""],
  pounce: ["POUNCE!", "#ffc27a"], howl: ["AWOOOO!", "#e8d8b0"], stomp: ["STOMP!", "#ffb07a"], maul: ["MAUL!", "#ff7a6a"],
  roar: ["ROAR!", "#ffcf8a"], brood: ["COME, MY CHILDREN!", "#e8c890"], rockfall: ["THE ROOF! IT FALLS!", "#ffd27a"],
};

/** A flat ground painting that redraws itself every 30 ms for `ms` (f = 0..1 progress), then goes. */
function mark(scene: Phaser.Scene, ms: number, draw: (g: Phaser.GameObjects.Graphics, f: number) => void) {
  const g = scene.add.graphics().setDepth(GROUND), t0 = scene.time.now;
  const tick = () => { g.clear(); draw(g, Math.min(1, (scene.time.now - t0) / ms)); };
  tick();
  const ev = scene.time.addEvent({ delay: 30, loop: true, callback: tick });
  scene.time.delayedCall(ms, () => { ev.remove(); g.destroy(); });
}
function wedge(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, a: number, half: number) {
  g.beginPath(); g.moveTo(x, y);
  for (let i = 0; i <= 12; i++) { const t = a - half + (half * 2 * i) / 12; g.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r); }
  g.closePath();
}
/** A lane from (x0,y0) to (x1,y1), `w` wide. */
function lane(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, w: number) {
  const d = Math.max(1, Math.hypot(x1 - x0, y1 - y0)), nx = -(y1 - y0) / d * w / 2, ny = (x1 - x0) / d * w / 2;
  g.beginPath(); g.moveTo(x0 + nx, y0 + ny); g.lineTo(x1 + nx, y1 + ny); g.lineTo(x1 - nx, y1 - ny); g.lineTo(x0 - nx, y0 - ny); g.closePath();
}

export function bindBeastFx(room: Room, h: BeastFxHost) {
  const { scene, fx } = h;
  const dust = (x: number, y: number, n: number, spread: number, up = 20) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = rnd(spread * 0.4, spread);
      fx.p(x + rnd(-3, 3), y + rnd(-2, 2), 1, pick(DUST), { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.55, vz: rnd(up * 0.4, up), g: 60, drag: 2.5, life: rnd(420, 700), size: pick([1, 2, 2, 3]), size1: 1, alpha: 0.75, add: false });
    }
  };

  // Wind-ups: the beast gathers itself, the ground shows where the move lands
  room.onMessage("bwind", ({ id, kind, ms, x, y, x2, y2, w, tx, ty, r, ax, ay, reach, half, pts }) => {
    const e = h.ent(id), [label, col] = CALL[kind] ?? ["", ""];
    if (e && label) h.say(e.sprite.x, e.sprite.y - e.top - 6, label, col);
    const cx = () => e?.sprite.x ?? x, cy = () => e?.sprite.y ?? y;
    if (kind === "gore" || kind === "stampede") {
      if (e) h.squash(id, 1.12, 0.9, ms); // head down, pawing the ground
      for (let i = 0; i < 6; i++) scene.time.delayedCall(i * ms / 6, () => dust(cx(), cy() + 2, 2, 14, 10));
      mark(scene, ms, (g, f) => {
        g.fillStyle(0x3a1c0c, 0.22); lane(g, x, y, x2, y2, w); g.fillPath();
        g.lineStyle(1.5, 0xffa060, 0.8); lane(g, x, y, x2, y2, w); g.strokePath();
        g.fillStyle(0xc8541c, 0.3); lane(g, x, y, x + (x2 - x) * f, y + (y2 - y) * f, w); g.fillPath();
      });
    } else if (kind === "web" || kind === "pounce") {
      if (e) h.squash(id, kind === "pounce" ? 1.15 : 1.1, kind === "pounce" ? 0.82 : 1.1, ms);
      const c = kind === "web" ? 0xe8e4d8 : 0xffb060;
      mark(scene, ms, (g, f) => {
        g.fillStyle(kind === "web" ? 0x2a2a30 : 0x3a1c0c, 0.22).fillCircle(tx, ty, r).lineStyle(1.5, c, 0.85).strokeCircle(tx, ty, r);
        g.fillStyle(c, 0.22).fillCircle(tx, ty, r * f);
        if (kind === "web") for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.lineStyle(1, c, 0.35).lineBetween(tx, ty, tx + Math.cos(a) * r, ty + Math.sin(a) * r); }
      });
    } else if (kind === "screech" || kind === "maul") {
      const a = Math.atan2(ay, ax), c = kind === "screech" ? 0xc8a8ff : 0xff6a5a;
      if (e) h.squash(id, kind === "maul" ? 1.15 : 0.9, kind === "maul" ? 1.12 : 1.15, ms);
      mark(scene, ms, (g, f) => {
        g.fillStyle(kind === "screech" ? 0x241838 : 0x3a100c, 0.24); wedge(g, cx(), cy(), reach, a, half); g.fillPath();
        g.lineStyle(1.5, c, 0.85); wedge(g, cx(), cy(), reach, a, half); g.strokePath();
        g.fillStyle(c, 0.25); wedge(g, cx(), cy(), reach * f, a, half); g.fillPath();
      });
    } else if (kind === "stomp" || kind === "roar" || kind === "howl") {
      if (e) h.squash(id, 1.1, 1.16, ms);
      const c = kind === "stomp" ? 0xffa060 : kind === "roar" ? 0xffcf8a : 0xe8d8b0;
      if (kind === "howl") { // the wolf throws back its head; no ground mark, it is a call, not a blow
        for (let i = 0; i < 4; i++) scene.time.delayedCall(i * ms / 4, () => fx.ring(cx(), cy(), 18 + i * 10, "spirit", 10, { up: (e?.top ?? 20) * 0.8, life: 360, size: 1 }));
        return;
      }
      mark(scene, ms, (g, f) => {
        g.fillStyle(0x2a1a0c, 0.2).fillCircle(cx(), cy(), r).lineStyle(1.5, c, 0.85).strokeCircle(cx(), cy(), r);
        g.fillStyle(c, 0.22).fillCircle(cx(), cy(), r * f);
      });
    } else if (kind === "rockfall") {
      if (e) h.squash(id, 1.18, 1.1, ms);
      for (const [px, py] of pts as [number, number][]) {
        mark(scene, ms, (g, f) => {
          g.fillStyle(0x14100c, 0.25 + 0.3 * f).fillEllipse(px, py, r * 2, r * 1.7).lineStyle(1.5, 0xffd27a, 0.8).strokeEllipse(px, py, r * 2, r * 1.7);
        });
        // grit trickling down from the roof before the stones come
        for (let i = 0; i < 6; i++) scene.time.delayedCall(i * ms / 6, () => fx.p(px + rnd(-r * 0.6, r * 0.6), py + rnd(-r * 0.4, r * 0.4), rnd(70, 110), pick(DUST), { vz: -rnd(60, 90), g: 200, life: 500, size: 1, size1: 1, add: false }));
      }
    } else if (kind === "brood") {
      if (e) h.squash(id, 1.08, 1.14, ms);
      for (let i = 0; i < 5; i++) scene.time.delayedCall(i * ms / 5, () => { const a = Math.random() * Math.PI * 2; dust(cx() + Math.cos(a) * 50, cy() + Math.sin(a) * 36, 4, 18, 14); });
    } else if (kind === "swoop" && e) {
      h.squash(id, 0.9, 1.15, ms); // wings up
    }
  });

  // A rush: the beast glides fast along its line, kicking up dust (bats leave no dust: they fly)
  room.onMessage("brush", ({ id, kind, ms }) => {
    const e = h.ent(id);
    if (!e) return;
    e.leapUntil = scene.time.now + ms + 250;
    if (kind === "pounce") h.squash(id, 0.85, 1.25, ms / 2);
    if (kind === "swoop") return;
    const n = Math.ceil(ms / 50);
    for (let i = 0; i < n; i++) scene.time.delayedCall(i * 50, () => dust(e.sprite.x, e.sprite.y + 1, kind === "stampede" ? 3 : 2, 16, 12));
  });
  room.onMessage("bturn", ({ id }) => { const e = h.ent(id); if (e) dust(e.sprite.x, e.sprite.y, 6, 26, 16); });

  // Silk spat in a lump: it arcs to the mark and bursts into a sticky web that stays a moment
  room.onMessage("bshot", ({ x0, y0, x, y, ms, r }) => {
    const glob = scene.add.circle(x0, y0, 2.5, 0xf2efe6).setStrokeStyle(1, 0x6a6458).setDepth(9500);
    const t0 = scene.time.now, d = Math.hypot(x - x0, y - y0), H = 14 + d * 0.22;
    const ev = scene.time.addEvent({ delay: 16, loop: true, callback: () => {
      const f = Math.min(1, (scene.time.now - t0) / ms), z = Math.sin(f * Math.PI) * H;
      glob.setPosition(x0 + (x - x0) * f, y0 + (y - y0) * f - z);
      if (Math.random() < 0.5) fx.p(glob.x, glob.y + z, z, pick(SILK), { g: 40, life: 300, size: 1, size1: 0, add: false });
    } });
    scene.time.delayedCall(ms, () => {
      ev.remove(); glob.destroy();
      const g = scene.add.graphics().setDepth(GROUND);
      g.fillStyle(0xe8e4d8, 0.18).fillCircle(x, y, r);
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + rnd(-0.15, 0.15); g.lineStyle(1, 0xf2efe6, 0.75).lineBetween(x, y, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.85); }
      for (const k of [0.35, 0.6, 0.85]) { g.lineStyle(1, 0xd8d2c4, 0.6); g.beginPath(); for (let i = 0; i <= 9; i++) { const a = i / 9 * Math.PI * 2; const px = x + Math.cos(a) * r * k, py = y + Math.sin(a) * r * k * 0.85; if (i) g.lineTo(px, py); else g.moveTo(px, py); } g.strokePath(); }
      scene.tweens.add({ targets: g, alpha: 0, duration: 700, delay: 1100, onComplete: () => g.destroy() });
      for (let i = 0; i < 10; i++) { const a = Math.random() * Math.PI * 2; fx.p(x, y, 3, pick(SILK), { vx: Math.cos(a) * rnd(20, 50), vy: Math.sin(a) * rnd(10, 25), vz: rnd(10, 30), g: 140, life: 380, size: 1, size1: 1, add: false }); }
    });
  });

  // Landings
  room.onMessage("bhit", ({ id, kind, x, y, r, ax, ay, reach, half, pts, heal }) => {
    const e = h.ent(id);
    if (kind === "gore" || kind === "stampede") { dust(x, y, kind === "stampede" ? 16 : 10, 40, 24); return; }
    if (kind === "pounce" || kind === "stomp") {
      fx.ring(x, y, r, "earth", 20, { up: 8, life: 420, size: 2 });
      dust(x, y, 14, r * 0.9, 22);
      const g = scene.add.graphics().setDepth(GROUND);
      g.fillStyle(0x1a120a, 0.35).fillCircle(x, y, r * 0.55);
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + rnd(-0.2, 0.2); g.lineStyle(1, 0x2a1e12, 0.7).lineBetween(x + Math.cos(a) * 4, y + Math.sin(a) * 3, x + Math.cos(a) * r * rnd(0.5, 0.9), y + Math.sin(a) * r * rnd(0.4, 0.8)); }
      scene.tweens.add({ targets: g, alpha: 0, duration: 900, delay: 400, onComplete: () => g.destroy() });
      return;
    }
    if (kind === "screech") {
      // rings of sound rolling out along the cone
      const a = Math.atan2(ay, ax);
      for (let k = 0; k < 4; k++) scene.time.delayedCall(k * 70, () => mark(scene, 260, (g, f) => {
        const rr = reach * (0.25 + f * 0.75), al = (1 - f) * 0.8;
        g.lineStyle(2, 0xd8b8ff, al); g.beginPath();
        for (let i = 0; i <= 10; i++) { const t = a - half + (half * 2 * i) / 10, px = x + Math.cos(t) * rr, py = y + Math.sin(t) * rr; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
        g.strokePath();
      }));
      return;
    }
    if (kind === "maul") {
      // three raking claw marks across the cone, left on the ground a moment
      const a = Math.atan2(ay, ax), g = scene.add.graphics().setDepth(GROUND);
      for (let k = -1; k <= 1; k++) {
        const t = a + k * half * 0.45, r0 = reach * 0.25, r1 = reach * 0.95;
        const sx = x + Math.cos(t) * r0, sy = y + Math.sin(t) * r0, ex = x + Math.cos(t + 0.35) * r1, ey = y + Math.sin(t + 0.35) * r1;
        g.lineStyle(3, 0x2a0e0a, 0.6).lineBetween(sx, sy, ex, ey).lineStyle(1, 0xff8a7a, 0.8).lineBetween(sx, sy, ex, ey);
        for (let i = 0; i < 4; i++) { const f = Math.random(); fx.p(sx + (ex - sx) * f, sy + (ey - sy) * f, 6, pick(PALETTE.blood), { vz: rnd(10, 30), g: 140, life: 360, size: 1, size1: 1, add: false }); }
      }
      scene.tweens.add({ targets: g, alpha: 0, duration: 700, delay: 350, onComplete: () => g.destroy() });
      return;
    }
    if (kind === "roar" || kind === "howl") {
      for (let k = 0; k < 3; k++) scene.time.delayedCall(k * 120, () => {
        const ring = scene.add.circle(x, y, 6).setStrokeStyle(2, kind === "roar" ? 0xffcf8a : 0xe8d8b0, 0.7).setDepth(GROUND);
        scene.tweens.add({ targets: ring, radius: kind === "roar" ? r : 90, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
      });
      if (kind === "howl") for (const [px, py] of (pts ?? []) as [number, number][]) dust(px, py, 8, 20, 18);
      return;
    }
    if (kind === "brood") { for (const [px, py] of (pts ?? []) as [number, number][]) dust(px, py, 12, 26, 22); return; }
    if (kind === "rockfall") {
      for (const [px, py] of pts as [number, number][]) {
        // stones crash down out of the dark and shatter
        for (let i = 0; i < 4; i++) fx.p(px + rnd(-r * 0.5, r * 0.5), py + rnd(-r * 0.4, r * 0.4), 0, pick(STONE), { vx: rnd(-40, 40), vy: rnd(-20, 20), vz: rnd(30, 60), g: 260, life: 500, size: 3, size1: 2, add: false });
        dust(px, py, 10, r, 22);
        const g = scene.add.graphics().setDepth(GROUND);
        for (let i = 0; i < 5; i++) g.fillStyle(pick(STONE), 0.95).fillRect(px + rnd(-r * 0.6, r * 0.6), py + rnd(-r * 0.45, r * 0.45), rnd(2, 4), rnd(2, 3));
        scene.tweens.add({ targets: g, alpha: 0, duration: 900, delay: 1600, onComplete: () => g.destroy() });
      }
      return;
    }
    if (kind === "swoop" && e) {
      // it drinks: red motes flow from the bite into the bat
      for (let i = 0; i < 8; i++) fx.p(x + rnd(-6, 6), y + rnd(-4, 4), 6, pick(PALETTE.blood), { vz: rnd(10, 25), life: 380, size: 1, size1: 0 });
      if (heal) h.say(e.sprite.x, e.sprite.y - e.top - 4, `+${heal}`, "#ff6a6a");
    }
  });

  // The Hide-Mother heaves herself up off her bed of hides
  room.onMessage("beastrise", ({ id, x, y }) => {
    dust(x, y, 26, 50, 30);
    const e = h.ent(id);
    if (e) h.say(x, y - (e.top ?? 60) - 14, "THE HIDE-MOTHER WAKES!", "#ffcf8a");
  });
}
