import Phaser from "phaser";
import { TILE } from "../../shared/constants";
import { EMPTY, GROUND, OBJECTS, T, isSolidAt } from "../../shared/map";
import { isDecorSolidAt } from "../../shared/npcs";
import { WATCH, WATCH_POSTS, WatchPost } from "../../shared/watch";
import { FIRE, FIRE_T, dith, hash, vnoise } from "./bonfireArt";
import { DAY_CYCLE_MS, dayPhase, dayTime } from "./details";
import { isoAnchor } from "./iso";
import { hiResTexture } from "./smooth";

/**
 * Gate torches (Murat 2026-11-03: "the light at the village entrance must come from something you can see"). A tall
 * torch is planted in the ground just inside each gate post of the Oakvale stockade, one per watchman. Cold by day;
 * at dusk each watchman walks over, kneels to light his torch and walks back to his post. They burn all night and
 * gutter out at dawn. Everything follows the shared day clock, so every player sees the same thing (client only).
 * Drawn in the bonfire's pixel style (bonfireArt.ts): flat tones, ordered dithering, dark outlines, two cells per unit.
 */

/** Day-clock points: the first watchman lights his torch here, the other one a moment later; dawn puts them out. */
const LIGHT_AT = 0.634, LIGHT_STAGGER = 0.004, OUT_AT = 0.955, OUT_FADE = 0.008;
/** The lighting errand (ms): walk over, kneel and strike for KNEEL ms (the torch takes on the last moment), stand back, walk home. */
const KNEEL = 2200, LINGER = 700, GROW = 900;

/** Torch body (world px) and where the flame sits on it. */
const TW = 14, TH = 42, HEAD = 33; // the flame's base is HEAD px above the foot
const FW = 12, FH = 26;

export interface GateTorch { id: string; x: number; y: number; post: WatchPost; litAt: number; stand: { x: number; y: number } }

const ROAD = new Set<number>([T.COBBLE, T.DIRT]);
const walkable = (x: number, y: number) => !isSolidAt(x, y) && !isDecorSolidAt(x, y);

/** One torch per watch post: beside the gate post on that guard's side of the opening, just inside the wall. */
function buildTorches(): GateTorch[] {
  const out: GateTorch[] = [];
  WATCH_POSTS.forEach((p, i) => {
    const ax = p.ny !== 0 ? 1 : 0, ay = p.nx !== 0 ? 1 : 0; // along the wall
    const side = Math.sign((p.x - p.gx) * ax + (p.y - p.gy) * ay) || 1;
    // walk along the wall line from the middle of the opening to the first palisade post
    let along = TILE;
    for (let k = 0.5; k <= 4; k += 0.5) {
      const tx = Math.floor((p.gx + ax * side * k * TILE) / TILE), ty = Math.floor((p.gy + ay * side * k * TILE) / TILE);
      if (OBJECTS[ty]?.[tx] !== EMPTY) { along = (k - 0.5) * TILE + TILE * 0.35; break; }
    }
    let x = p.gx + ax * side * along + p.nx * 0.75 * TILE, y = p.gy + ay * side * along + p.ny * 0.75 * TILE;
    // keep it off the road and out of the way: slide along the wall until it stands on grass, then step in if blocked
    const onRoad = (x: number, y: number) => ROAD.has(GROUND[Math.floor(y / TILE)]?.[Math.floor(x / TILE)]);
    for (let d = 0; d < 8 && onRoad(x, y); d++) { x += ax * side * 0.25 * TILE; y += ay * side * 0.25 * TILE; }
    for (let d = 0; d < 6 && !walkable(x, y); d++) { x += p.nx * 0.2 * TILE; y += p.ny * 0.2 * TILE; }
    // where the watchman kneels: beside the torch, on the side nearest the viewer (lowest on screen) so the torch doesn't hide him
    const options = [[p.nx, p.ny], [ax, ay], [-ax, -ay]].map(([dx, dy]) => ({ x: x + dx * 13, y: y + dy * 13 })).filter((o) => walkable(o.x, o.y));
    const stand = options.sort((a, b) => b.x + b.y - (a.x + a.y))[0] ?? { x: x + p.nx * 13, y: y + p.ny * 13 };
    out.push({ id: p.id, x, y, post: p, litAt: LIGHT_AT + (i % 2) * LIGHT_STAGGER, stand });
  });
  return out;
}

export const GATE_TORCHES: GateTorch[] = buildTorches();

type Px = (x: number, y: number, c: string) => void;

/** Torch body: a split ash stake planted in packed stones, an iron cresset on top stuffed with pitch-soaked rags. */
function paintTorch(g: CanvasRenderingContext2D, lit: boolean) {
  g.save();
  g.scale(0.5, 0.5);
  const px: Px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
  const W = TW * 2, CX = W / 2, BY = TH * 2 - 4; // cells; BY = foot
  // shadow
  for (let y = BY - 4; y <= BY + 3; y++) for (let x = 0; x < W; x++) {
    const ex = (x - CX - 2) / 12, ey = (y - BY) / 3.5, d = ex * ex + ey * ey;
    if (d < 1 && dith(x, y) < (1 - d) * 0.8) px(x, y, "rgba(10,7,5,0.5)");
  }
  // the stake, slightly tapered, lit from the top left; bark ridges and a split down the middle
  const top = BY - (HEAD - 4) * 2;
  for (let y = top; y <= BY; y++) {
    const t = (y - top) / (BY - top), half = 2.2 + t * 1.2;
    for (let x = Math.floor(CX - half - 1); x <= Math.ceil(CX + half); x++) {
      const s = (x - CX + 0.5) / half;
      if (Math.abs(s) > 1.25) continue;
      if (Math.abs(s) > 0.9) { px(x, y, "#140c08"); continue; }
      const r = vnoise(x * 0.9, y * 0.18, 999, 3) + (dith(x, y) - 0.5) * 0.3;
      let c = s < -0.35 ? "#8a6a46" : s < 0.3 ? "#6a4e32" : "#46321f";
      if (r < 0.3) c = "#2e2014";
      else if (r > 0.8 && s < 0.2) c = "#a4845a";
      if (lit && s < 0.1 && y < top + 14 && dith(x, y) < 0.6 - (y - top) / 28) c = s < -0.35 ? "#d0884a" : "#a0603a"; // firelight down the stake
      px(x, y, c);
    }
  }
  // rope lashing under the cresset
  for (let y = top + 3; y < top + 8; y++) for (let x = CX - 3; x <= CX + 3; x++) {
    if (x === CX - 3 || x === CX + 3) { px(x, y, "#140c08"); continue; }
    px(x, y, (y + (x >> 1)) % 2 ? "#8a7448" : "#5e4c2c");
  }
  // packed field stones at the foot
  const stones = [[-6, 0, 3, 2], [5, -1, 3, 2], [-1, 2, 4, 2], [8, 2, 2, 1.5], [-8, 3, 2, 1.5]];
  stones.forEach(([dx, dy, w, h], k) => {
    for (let y = -Math.ceil(h); y <= Math.ceil(h); y++) for (let x = -w; x <= w; x++) {
      const d = (x / w) ** 2 + (y / h) ** 2;
      if (d > 1.05) continue;
      const ax = CX + dx + x, ay = BY + dy + y;
      if (d > 0.62) { px(ax, ay, "#17120f"); continue; }
      const l = -x / w * 0.5 - y / h * 0.8 + (dith(ax, ay) - 0.5) * 0.5 + (hash(k, 1, 4) - 0.5) * 0.3;
      px(ax, ay, l > 0.4 ? "#a8a092" : l > -0.1 ? "#7c766c" : "#524d47");
    }
  });
  // iron cresset: a bowl of bands and three uprights, rags heaped inside
  const cy0 = top - 12, cy1 = top + 2; // cells
  for (let y = cy0; y <= cy1; y++) {
    const t = (y - cy0) / (cy1 - cy0), half = 6.5 - t * 3.2;
    for (let x = Math.floor(CX - half - 1); x <= Math.ceil(CX + half); x++) {
      const s = (x - CX + 0.5) / half;
      if (Math.abs(s) > 1.2) continue;
      const band = y === cy0 + 1 || y === cy0 + 7 || y === cy1, upright = Math.abs(s) > 0.9 || Math.abs(s) < 0.12;
      if (Math.abs(s) > 1.02 || y === cy0) { px(x, y, "#0e0c0c"); continue; }
      if (band || upright) {
        const c = s < -0.3 ? "#6a686c" : s < 0.4 ? "#46444a" : "#2a282c";
        px(x, y, lit && s < 0.5 && y < cy0 + 3 ? "#c87a3a" : c);
        continue;
      }
      // the rags between the bars
      const n = vnoise(x * 0.6, y * 0.6, 999, 9) + (dith(x, y) - 0.5) * 0.35;
      if (lit) px(x, y, n > 0.6 ? "#ffb040" : n > 0.42 ? "#d04a12" : n > 0.3 ? "#6a1c0a" : "#2a1410");
      else px(x, y, n > 0.68 ? "#5a4636" : n > 0.4 ? "#33261c" : "#1a1310");
    }
  }
  // the heaped top of the rag bundle above the rim (charred and cold, or glowing embers)
  for (let y = cy0 - 4; y < cy0; y++) for (let x = CX - 6; x <= CX + 6; x++) {
    const ex = (x - CX + 0.5) / 6.2, ey = (y - cy0 + 0.5) / 4.2;
    if (ex * ex + ey * ey > 1 || ey > 0) continue;
    const edge = ex * ex + ey * ey > 0.7;
    const n = vnoise(x * 0.7, y * 0.7, 999, 11) + (dith(x, y) - 0.5) * 0.3;
    if (lit) px(x, y, edge ? "#6a1c0a" : n > 0.55 ? "#ffcf52" : n > 0.35 ? "#f2761c" : "#a82c0c");
    else px(x, y, edge ? "#0e0c0c" : n > 0.62 ? "#4a3a2e" : n > 0.38 ? "#2a2018" : "#161110");
  }
  g.restore();
}

/** One flame frame: looping rising noise banded into the bonfire's fire palette. `hotOnly` keeps just the bright core (night copy). */
function paintFlame(g: CanvasRenderingContext2D, f: number, N: number, hotOnly: boolean) {
  g.save();
  g.scale(0.5, 0.5);
  const W = FW * 2, CX = W / 2, BY = FH * 2 - 2, HF = 38, P = 6, rise = (f / N) * P;
  for (let y = 0; y <= BY; y++) for (let x = 0; x < W; x++) {
    const h = BY - y, ht = h / HF;
    const sway = Math.sin(ht * 3 + (f / N) * Math.PI * 2) * ht * ht * 4;
    const u = (x - CX + 0.5 - sway) / (8.5 * Math.max(0.05, 1 - ht) ** 0.7 + 1);
    const body = 1 - Math.abs(u) ** 1.6 - ht * 0.85;
    const n = vnoise(x * 0.2, y * 0.11 + rise, P, 21) * 0.6 + vnoise(x * 0.42, y * 0.22 + rise * 2, P * 2, 22) * 0.4;
    const v = body + (n - 0.5) * (1 + ht * 0.6) + 0.06 + (dith(x, y) - 0.5) * 0.09;
    let i = -1;
    for (let j = 0; j < FIRE.length; j++) if (v > FIRE_T[j]) i = j;
    if (i < 0 || (i === 0 && dith(x, y) > 0.55)) continue;
    i = Math.min(i, 7);
    if (hotOnly && i < 3) continue;
    g.fillStyle = FIRE[i]; g.fillRect(x, y, 1, 1);
  }
  // a lick torn off the top
  const life = (f / N + 0.3) % 1, lx = Math.round(CX + Math.sin(life * 6) * 2), ly = Math.round(BY - HF * 0.8 - life * 10);
  g.fillStyle = life < 0.5 ? "#ffcf52" : "#f2761c"; g.fillRect(lx, ly, 2, 2);
  g.restore();
}

const N = 8;
function makeTextures(scene: Phaser.Scene) {
  hiResTexture(scene, "gate_torch", TW, TH, 2, 4, (g, f) => paintTorch(g, f === 1));
  hiResTexture(scene, "torch_flame", FW, FH, N, 4, (g, f) => paintFlame(g, f, N, false));
  hiResTexture(scene, "torch_flame_lit", FW, FH, N, 4, (g, f) => paintFlame(g, f, N, true));
  for (const k of ["torch_flame", "torch_flame_lit"]) {
    if (!scene.anims.exists(`${k}_burn`)) scene.anims.create({ key: `${k}_burn`, frames: scene.anims.generateFrameNumbers(k, { start: 0, end: N - 1 }), frameRate: 10, repeat: -1 });
  }
}

interface Live {
  t: GateTorch;
  body: Phaser.GameObjects.Image;
  flame: Phaser.GameObjects.Sprite;
  flameLit: Phaser.GameObjects.Sprite;
  light: Phaser.GameObjects.Image;
  sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  strike: Phaser.GameObjects.Particles.ParticleEmitter;
}

/** What the watchman of a post is doing for his torch right now (client-side errand), or null when he is at his post. */
export interface Errand { x: number; y: number; dx: number; dy: number; anim: "walk" | "idle" | "skill" }

/** Milliseconds from now to `at` on the day clock, wrapped to (-half a day, half a day]. */
function msUntil(at: number, t: number) {
  let d = (at - t) % 1;
  if (d > 0.5) d -= 1;
  if (d <= -0.5) d += 1;
  return d * DAY_CYCLE_MS;
}

export class GateTorches {
  private live: Live[] = [];

  constructor(private scene: Phaser.Scene) {
    makeTextures(scene);
    for (const t of GATE_TORCHES) {
      const foot = { x: t.x, y: t.y };
      const body = scene.add.image(t.x, t.y, "gate_torch", 0).setOrigin(0.5, (TH - 2) / TH).setDepth(t.y);
      const flame = scene.add.sprite(t.x, t.y - HEAD, "torch_flame", 0).setOrigin(0.5, 1).setDepth(t.y + 0.2).setVisible(false);
      const flameLit = scene.add.sprite(t.x, t.y - HEAD, "torch_flame_lit", 0).setOrigin(0.5, 1).setDepth(27600).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      const start = Math.floor(hash(Math.round(t.x), Math.round(t.y), 3) * N);
      flame.play({ key: "torch_flame_burn", startFrame: start });
      flameLit.play({ key: "torch_flame_lit_burn", startFrame: start });
      isoAnchor(flame, foot); isoAnchor(flameLit, foot);
      const light = scene.add.image(t.x, t.y - 6, "light").setTint(0xffa040).setScale(2.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(27500).setAlpha(0);
      isoAnchor(light, foot);
      // sparks rise slowly from the flame (like the bonfire's); a few flint sparks fly while he strikes
      const sparks = scene.add.particles(t.x, t.y - HEAD - 8, "spark", {
        lifespan: { min: 1200, max: 2000 }, speedY: { min: -14, max: -6 }, speedX: { min: -2, max: 2 }, scale: { start: 0.7, end: 0.2 },
        frequency: 420, alpha: { start: 1, end: 0 }, blendMode: "ADD", emitting: false,
      }).setDepth(25000);
      const strike = scene.add.particles(t.x, t.y - HEAD + 2, "spark", {
        lifespan: { min: 200, max: 450 }, speed: { min: 12, max: 34 }, angle: { min: 200, max: 340 }, gravityY: 60, scale: { start: 0.8, end: 0.1 },
        frequency: 260, quantity: 2, blendMode: "ADD", emitting: false,
      }).setDepth(25001);
      isoAnchor(sparks, foot); isoAnchor(strike, foot);
      this.live.push({ t, body, flame, flameLit, light, sparks, strike });
    }
  }

  /** How much the torch burns (0 cold .. 1 full) at day-clock `t`. */
  private burn(g: GateTorch, t: number) {
    const sinceLit = -msUntil(g.litAt, t), toOut = msUntil(OUT_AT, t);
    if (sinceLit < 0 || sinceLit > DAY_CYCLE_MS * (OUT_AT - g.litAt + OUT_FADE)) return 0;
    if (toOut < 0) return Math.max(0, 1 + toOut / (OUT_FADE * DAY_CYCLE_MS)); // guttering out at dawn
    return Math.min(1, sinceLit / GROW);
  }

  /** The lighting errand for a post: walk over, kneel and strike, stand a moment, walk back. Null outside it. */
  errand(postId: string, from: { x: number; y: number }): Errand | null {
    const g = this.live.find((l) => l.t.id === postId)?.t;
    if (!g) return null;
    const walk = (Math.hypot(g.stand.x - from.x, g.stand.y - from.y) / WATCH.speed) * 1000 * 1.6; // an unhurried pace
    const e = -msUntil(g.litAt, dayTime(Date.now())) + KNEEL; // ms since he reached the torch
    const lerp = (k: number, a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    const to = { dx: g.x - g.stand.x, dy: g.y - g.stand.y };
    if (e < -walk || e > KNEEL + LINGER + walk) return null;
    if (e < 0) { const p = lerp(1 + e / walk, from, g.stand); return { ...p, dx: g.stand.x - from.x, dy: g.stand.y - from.y, anim: "walk" }; }
    if (e < KNEEL) return { ...g.stand, ...to, anim: "skill" };
    if (e < KNEEL + LINGER) return { ...g.stand, ...to, anim: "idle" };
    const p = lerp((e - KNEEL - LINGER) / walk, g.stand, from);
    return { ...p, dx: from.x - g.stand.x, dy: from.y - g.stand.y, anim: "walk" };
  }

  update(now: number, striking: (postId: string) => boolean) {
    const t = dayTime(Date.now()), { dark } = dayPhase(t);
    for (const l of this.live) {
      const b = this.burn(l.t, t), on = b > 0;
      l.body.setFrame(on ? 1 : 0);
      l.flame.setVisible(on).setScale(0.35 + 0.65 * b);
      l.flameLit.setVisible(on && dark > 0).setScale(0.35 + 0.65 * b).setAlpha(dark * 0.7);
      l.sparks.emitting = b > 0.6;
      l.strike.emitting = striking(l.t.id);
      const f = Math.sin(now / 90 + l.t.x) * 0.5 + Math.sin(now / 37 + l.t.y) * 0.5;
      l.light.setAlpha(on ? b * (0.25 + 0.55 * dark + f * 0.07) : 0);
    }
  }
}
