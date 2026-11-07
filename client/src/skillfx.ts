import Phaser from "phaser";
import { quake } from "./camfx";
import { ISO } from "./isoflag";
import { AreaLook, BLOOD_RITE_MS, FxStyle, impactMs, LEAP_MS, RAIN_FALL_MS, skillById, SkillDef, SWORD_FALL_MS } from "../../shared/skills";
import { paintSigil, ICON } from "./skillArt";
import { MIST_DISSOLVE_MS, MIST_LINGER_MS, MIST_REFORM_AT_MS, MIST_REFORM_MS, MIST_REVEAL_MS } from "./skillMoveData";

/**
 * Skill visuals (shared/skills.ts): particles, light, lightning, falling blades and meteors, auras, enchanted
 * weapons and ground effects. No hit-area outlines (Murat): what you see is the magic itself.
 *
 * Particles are tiny square sprites with a height (z) above the ground, so they rise and fall correctly in both
 * the top-down and the isometric view (the iso view projects every sprite's world x/y each frame, see iso.ts).
 * The server sends "sfx" events (shared/skillEngine.ts); statuses and ground effects come from the room state.
 * Higher-row skills get more particles, more light and screen shake (TIER).
 */

export const PALETTE: Record<FxStyle, number[]> = {
  steel: [0xffffff, 0xdfe6f0, 0xa9b8d0, 0x6d7d99],
  holy: [0xfffbe0, 0xfff3b0, 0xffd166, 0xffaa33],
  fire: [0xfff7c2, 0xfff176, 0xff9f1c, 0xf3722c, 0xe63946],
  frost: [0xffffff, 0xd6f6ff, 0xa2e8ff, 0x4cc9f0, 0x2a6fdb],
  arcane: [0xfbeaff, 0xe0b0ff, 0xc77dff, 0x9d4edd, 0x5a189a],
  lightning: [0xffffff, 0xe8fbff, 0xb3ecff, 0x80d8ff, 0xb388ff],
  shadow: [0xd1c4e9, 0x9575cd, 0x5e35b1, 0x311b92, 0x1a1033],
  poison: [0xe6ffb3, 0xb2ff59, 0x7cfc00, 0x43a047, 0x1b5e20],
  earth: [0xefebe9, 0xd7ccc8, 0xa1887f, 0x795548, 0x4e342e],
  blood: [0xffcdd2, 0xff8a80, 0xe63946, 0xb71c1c, 0x6d0000],
  wind: [0xffffff, 0xe8fff4, 0xc8f2dc, 0x9ad1b0],
  spirit: [0xf0fdff, 0xb2ebf2, 0x80deea, 0x4dd0e1, 0x26a69a],
  nature: [0xf1ffd6, 0xd4ff8a, 0x9ccc65, 0x689f38, 0x33691e],
};

/** Effect strength by tree row (Lv 1 .. Lv 10). */
const TIER = [1, 1.35, 1.8, 2.4, 3.2];
const DEPTH = 9500;
const ARROW_DROP_MS = 150; // one arrow of a rain falling from the sky
const GROUND_DEPTH = 9400;

interface P {
  img: Phaser.GameObjects.Image; x: number; y: number; z: number; vx: number; vy: number; vz: number;
  g: number; drag: number; t: number; life: number; s0: number; s1: number; a0: number; spin?: number;
}

interface Emitter { until: number; next: number; every: number; fn: () => void }

export interface FxEntity {
  sprite: Phaser.GameObjects.Sprite; top: number; state: any; hero?: string;
  gear?: { each(fn: (s: Phaser.GameObjects.Sprite) => void): void }; // worn gear overlays (gear.ts GearLayer)
}

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Goo of the shooter blob's spit (not a skill style). */
const GOO = [0xf3e5ff, 0xd1a6ff, 0xb57cff, 0x8e4fd6, 0x5b2c91];
/** Basic and monster projectiles drawn here too (not only skill shots): their trails and impacts. */
const BASIC_SHOTS = new Set(["fireball", "arrow", "bolt", "knife", "stone", "slimeball", "magicbolt", "shadowbolt", "skelthrow"]);

/** World offset that shows as `h` px straight up on screen. */
const lift = (h: number): [number, number] => (ISO ? [-h, -h] : [0, -h]);
/** Screen-space vector between two world points (for drawing lightning and blades in a block). */
const screenDelta = (dx: number, dy: number): [number, number] => (ISO ? [dx - dy, (dx + dy) / 2] : [dx, dy]);
/** World offset that shows as `sx` px to the right on screen. */
const side = (sx: number): [number, number] => (ISO ? [sx / 2, -sx / 2] : [sx, 0]);

export class SkillFx {
  private parts: P[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  private emitters: Emitter[] = [];
  private fields = new Map<string, { f: any; objs: Phaser.GameObjects.GameObject[]; born: number }>();
  private shots = new Map<string, { s: any; g: Phaser.GameObjects.GameObject & { x: number; y: number }; look: string; born: number }>();
  private t = 0;

  constructor(private scene: Phaser.Scene, private ent: (id: string) => FxEntity | undefined, private meId: () => string) {
    const make = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
      if (scene.textures.exists(key)) return;
      const tex = scene.textures.createCanvas(key, w, h)!;
      draw(tex.getContext());
      tex.refresh();
    };
    make("fx_px", 1, 1, (c) => { c.fillStyle = "#fff"; c.fillRect(0, 0, 1, 1); });
    // Soft round light, stepped in 4 rings so it still reads as pixel art
    make("fx_glow", 32, 32, (c) => {
      for (let i = 4; i >= 1; i--) {
        c.fillStyle = `rgba(255,255,255,${0.12 + (4 - i) * 0.12})`;
        c.beginPath(); c.arc(16, 16, i * 4, 0, Math.PI * 2); c.fill();
      }
    });
  }

  // ---- particles ----------------------------------------------------------------------------------------

  private img(): Phaser.GameObjects.Image {
    const i = this.pool.pop() ?? this.scene.add.image(0, 0, "fx_px").setBlendMode(Phaser.BlendModes.ADD);
    return i.setVisible(true).setActive(true);
  }

  /** One particle at world (x, y), height z. */
  p(x: number, y: number, z: number, color: number, o: Partial<{ vx: number; vy: number; vz: number; g: number; drag: number; life: number; size: number; size1: number; alpha: number; add: boolean; depth: number; spin: number }> = {}) {
    if (this.parts.length > 2600) return;
    const img = this.img().setTint(color).setDepth(o.depth ?? DEPTH).setBlendMode(o.add === false ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
    const size = o.size ?? 1;
    this.parts.push({ img, x, y, z, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0, g: o.g ?? 0, drag: o.drag ?? 0, t: 0, life: o.life ?? 500,
      s0: size, s1: o.size1 ?? size, a0: o.alpha ?? 1, spin: o.spin });
  }

  private emit(ms: number, every: number, fn: () => void) {
    this.emitters.push({ until: this.t + ms, next: this.t, every, fn });
  }

  /** Burst in all directions along the ground (an expanding ring of sparks, dust, ice...). */
  ring(x: number, y: number, r: number, style: FxStyle, n: number, o: { z?: number; up?: number; life?: number; size?: number; add?: boolean } = {}) {
    const pal = PALETTE[style];
    const life = o.life ?? 420;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.1, 0.1);
      const sp = (r / (life / 1000)) * rnd(0.7, 1.1);
      this.p(x, y, o.z ?? rnd(0, 4), pick(pal), { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(0, o.up ?? 20), g: 60, drag: 2.2, life: life * rnd(0.8, 1.2), size: o.size ?? pick([1, 1, 2]), size1: 0, add: o.add });
    }
  }

  /** Sparks flying up and out from a point. */
  burst(x: number, y: number, z: number, style: FxStyle, n: number, speed = 70, life = 450, size = 1) {
    const pal = PALETTE[style];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * rnd(0.3, 1);
      this.p(x, y, z, pick(pal), { vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: rnd(10, speed), g: 140, drag: 1.5, life: life * rnd(0.6, 1.2), size: pick([size, size + 1]), size1: 0 });
    }
  }

  /** Motes rising from inside a disc. */
  rise(x: number, y: number, r: number, style: FxStyle, n: number, h = 30, life = 800) {
    const pal = PALETTE[style];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      this.p(x + Math.cos(a) * d, y + Math.sin(a) * d, 0, pick(pal), { vz: h / (life / 1000) * rnd(0.6, 1.2), vx: rnd(-4, 4), vy: rnd(-4, 4), life: life * rnd(0.7, 1.2), size: pick([1, 1, 2]), size1: 0 });
    }
  }

  /** Soft light that swells and fades. */
  glow(x: number, y: number, z: number, r: number, color: number, ms = 300, alpha = 0.7, flat = false) {
    const [lx, ly] = lift(z);
    r = Math.min(r * 0.75, 48); alpha *= 0.6;
    const g = this.scene.add.image(x + lx, y + ly, "fx_glow").setTint(color).setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(flat ? GROUND_DEPTH : DEPTH + 1).setAlpha(alpha).setScale(r / 16, (r / 16) * (flat && ISO ? 0.5 : flat ? 0.7 : 1));
    this.scene.tweens.add({ targets: g, alpha: 0, scaleX: g.scaleX * 1.4, scaleY: g.scaleY * 1.4, duration: ms, onComplete: () => g.destroy() });
    return g;
  }

  /** Jagged lightning between two world points (z = height above each). */
  bolt(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, colors = PALETTE.lightning, width = 1, ms = 160) {
    const [ax, ay] = lift(z1);
    const g = this.scene.add.graphics().setDepth(DEPTH + 2).setBlendMode(Phaser.BlendModes.ADD);
    g.setPosition(x1 + ax + 0.01, y1 + ay + 0.01);
    const [sx, sy] = screenDelta(x2 - x1, y2 - y1);
    const ex = sx, ey = sy - z2 + z1;
    const segs = Math.max(4, Math.round(Math.hypot(ex, ey) / 7));
    const pts: [number, number][] = [[0, 0]];
    const nx = -ey / (Math.hypot(ex, ey) || 1), ny = ex / (Math.hypot(ex, ey) || 1);
    for (let i = 1; i < segs; i++) { const t = i / segs, j = rnd(-5, 5); pts.push([ex * t + nx * j, ey * t + ny * j]); }
    pts.push([ex, ey]);
    const stroke = (w: number, c: number, a: number) => {
      g.lineStyle(w, c, a).beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts.slice(1)) g.lineTo(px, py);
      g.strokePath();
    };
    stroke(width + 2, colors[colors.length - 1], 0.45); stroke(width, colors[1], 1); stroke(Math.max(1, width - 1), 0xffffff, 1);
    // A forked branch
    if (segs > 5) {
      const k = Math.floor(segs / 2), [bx, by] = pts[k];
      g.lineStyle(1, colors[2], 0.9).beginPath(); g.moveTo(bx, by); g.lineTo(bx + rnd(-14, 14), by + rnd(4, 14)); g.strokePath();
    }
    this.scene.tweens.add({ targets: g, alpha: 0, duration: ms, delay: 40, onComplete: () => g.destroy() });
  }

  /** Bright crescent swipe around a point (weapon trail). */
  slash(x: number, y: number, r: number, style: FxStyle, ang = Math.random() * Math.PI * 2, sweep = 2.4) {
    const g = this.scene.add.graphics().setDepth(DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD);
    g.setPosition(x + 0.01, y - 6);
    const pal = PALETTE[style];
    const sq = ISO ? 0.55 : 0.75;
    for (let k = 0; k < 3; k++) {
      g.lineStyle(3 - k, pal[k] ?? 0xffffff, 1 - k * 0.25).beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = ang - sweep / 2 + (sweep * i) / 12, rr = r * (0.75 + 0.25 * Math.sin((i / 12) * Math.PI)) - k * 2;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr * sq;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.strokePath();
    }
    this.scene.tweens.add({ targets: g, alpha: 0, angle: 25, duration: 220, onComplete: () => g.destroy() });
  }

  /** Column of light from the sky. */
  pillar(x: number, y: number, style: FxStyle, h = 90, w = 8, ms = 450) {
    const pal = PALETTE[style];
    const [lx, ly] = lift(0);
    const col = this.scene.add.image(x + lx, y + ly + 2, "fx_px").setOrigin(0.5, 1).setDisplaySize(w, h).setTint(pal[2])
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH + 1).setAlpha(0.85);
    const core = this.scene.add.image(x + lx, y + ly + 2, "fx_px").setOrigin(0.5, 1).setDisplaySize(Math.max(2, w / 3), h).setTint(0xffffff)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH + 2);
    this.scene.tweens.add({ targets: [col, core], alpha: 0, scaleX: 0.01, duration: ms, ease: "Quad.easeIn", onComplete: () => { col.destroy(); core.destroy(); } });
    this.glow(x, y, 4, w * 4, pal[2], ms, 0.8, true);
  }

  /** Afterimage of an entity sprite. */
  ghost(e: FxEntity, x: number, y: number, tint: number, alpha = 0.45, ms = 260) {
    const s = e.sprite;
    const g = this.scene.add.sprite(x, y, s.texture.key, s.frame.name).setOrigin(s.originX, s.originY).setFlipX(s.flipX)
      .setScale(s.scaleX, s.scaleY).setTintFill(tint).setAlpha(alpha).setDepth(s.depth - 0.1).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: ms, onComplete: () => g.destroy() });
    return g;
  }

  /** A meteor / boulder / blade falling from the sky onto (x, y) in `ms`, then `land`. */
  private fall(x: number, y: number, style: FxStyle, ms: number, size: number, land: () => void, kind: "rock" | "orb" = "orb") {
    const pal = PALETTE[style];
    const h0 = 150, dx0 = -40;
    const head = this.scene.add.image(0, 0, kind === "rock" ? "fx_px" : "fx_glow").setDepth(DEPTH + 3)
      .setTint(kind === "rock" ? pal[3] : pal[1]).setBlendMode(kind === "rock" ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
    if (kind === "rock") head.setDisplaySize(size, size); else head.setScale(size / 12);
    const start = this.t;
    this.emit(ms, 16, () => {
      const k = Math.min(1, (this.t - start) / ms), kk = k * k;
      const wx = x + dx0 * (1 - kk), z = h0 * (1 - kk);
      const [lx, ly] = lift(z);
      head.setPosition(wx + lx, y + ly);
      for (let i = 0; i < (kind === "rock" ? 1 : 3); i++) this.p(wx + rnd(-2, 2), y + rnd(-2, 2), z + rnd(-2, 2), pick(pal), { vz: rnd(10, 30), life: rnd(200, 400), size: pick([1, 2]), size1: 0 });
    });
    this.scene.time.delayedCall(ms, () => { head.destroy(); land(); });
  }

  // ---- skill sigils -------------------------------------------------------------------------------------

  /** Texture of a skill's motif (the picture on its icon, client/src/skillArt.ts), made once. */
  private sigilTex(id: string): string | undefined {
    const key = "sig_" + id;
    if (this.scene.textures.exists(key)) return key;
    const art = paintSigil(id);
    if (!art) return undefined;
    const tex = this.scene.textures.createCanvas(key, ICON, ICON)!;
    const c = tex.getContext();
    art.forEach((col, i) => { if (col) { c.fillStyle = col; c.fillRect(i % ICON, Math.floor(i / ICON), 1, 1); } });
    tex.refresh();
    return key;
  }

  /**
   * The skill's own picture flashes above the hero and bursts into its pixels, so every skill is recognizable
   * at a glance. Top-row skills show it bigger, with a ring of light behind it.
   */
  sigil(id: string, skill: string, tier: number, big = false) {
    const e = this.ent(id);
    const key = this.sigilTex(skill);
    const art = paintSigil(skill);
    if (!e || !key || !art) return;
    const s = skillById(skill);
    const pal = PALETTE[s?.style ?? "steel"];
    // whole screen pixels at zoom 3: 2/3 (2 px per art pixel), 1 for big ones
    const scale = big || tier >= 3 ? 1 : 2 / 3;
    const z = e.top + 14 + ICON * scale / 2; // above the name tag
    const at = (): [number, number] => { const [lx, ly] = lift(z); return [e.sprite.x + lx, e.sprite.y + ly]; };
    const [x0, y0] = at();
    const img = this.scene.add.image(x0, y0, key).setDepth(DEPTH + 4).setScale(scale * 0.4).setAlpha(0);
    if (tier >= 2.4 || big) this.glow(e.sprite.x, e.sprite.y, z, ICON * scale * 0.9, pal[2], 600, 0.7);
    const hold = 380 + tier * 60;
    this.scene.tweens.add({ targets: img, scale, alpha: 1, duration: 110, ease: "Back.Out" });
    const follow = this.scene.time.addEvent({ delay: 16, loop: true, callback: () => { const ent = this.ent(id); if (ent) { const [lx, ly] = lift(z); img.setPosition(ent.sprite.x + lx, ent.sprite.y + ly); } } });
    this.scene.time.delayedCall(hold, () => {
      follow.remove();
      const ent = this.ent(id) ?? e;
      img.destroy();
      // dissolve: every second pixel of the picture flies off as a spark of its own colour
      for (let i = 0; i < art.length; i++) {
        const col = art[i];
        if (!col || (i + Math.floor(i / ICON)) % 2) continue;
        const ax = (i % ICON) - ICON / 2 + 0.5, ay = ICON / 2 - Math.floor(i / ICON) - 0.5;
        const [sx, sy] = side(ax * scale);
        const c = parseInt(col.slice(1), 16);
        this.p(ent.sprite.x + sx, ent.sprite.y + sy, z + ay * scale, c, {
          vx: side(ax * 3)[0] + rnd(-6, 6), vy: side(ax * 3)[1] + rnd(-6, 6), vz: ay * 3 + rnd(10, 30), g: 40, drag: 2,
          life: rnd(300, 520), size: scale * 1.5, size1: 0, add: false, depth: DEPTH + 3,
        });
      }
    });
  }

  // ---- server events ------------------------------------------------------------------------------------

  /** An "sfx" event from the server (shared/skillEngine.ts). */
  onEvent(ev: any) {
    const s = skillById(ev.s);
    const style: FxStyle = s?.style ?? "steel";
    const tier = TIER[s?.row ?? 0];
    const pal = PALETTE[style];
    const e = ev.id ? this.ent(ev.id) : undefined;
    const near = this.nearMe(ev.x ?? e?.sprite.x, ev.y ?? e?.sprite.y);
    switch (ev.ev) {
      case "cast": {
        if (!e) break;
        // Flash on the hero; buildups gather energy for the charge time
        this.glow(e.sprite.x, e.sprite.y, e.top * 0.5, 10 + 4 * tier, pal[2], 260, 0.6);
        this.sigil(ev.id, ev.s, tier, s?.row === 4);
        if (ev.stacks > 0) this.burst(e.sprite.x, e.sprite.y, e.top * 0.6, style, 6 * ev.stacks, 60);
        if (ev.charge > 0) this.gather(ev.id, style, ev.charge, tier);
        break;
      }
      case "fizzle":
        if (e) this.burst(e.sprite.x, e.sprite.y, e.top * 0.5, "earth", 8, 30, 300);
        break;
      case "move": this.showMove(ev, s, style, e); break;
      case "area": this.showArea(ev, s, style, tier, near); break;
      case "cry": {
        // A shockwave of sound: three fast rings of dust and colour, the hero flashes
        for (let k = 0; k < 3; k++) this.scene.time.delayedCall(k * 90, () => this.ring(ev.x, ev.y, ev.r * (0.6 + k * 0.25), style, Math.round(26 * tier), { life: 380, up: 6 }));
        this.ring(ev.x, ev.y, ev.r * 0.7, "earth", 18, { life: 500, add: false });
        if (e) { this.glow(ev.x, ev.y, e.top * 0.7, 16 * tier, pal[1], 400, 0.8); this.flashSprite(e, pal[1]); }
        if (near) quake(this.scene, 140, 0.003 * tier);
        break;
      }
      case "buff": {
        if (!e) break;
        const def = s;
        if (def?.type === "Enchant") {
          // Weapon lights up
          const [hx, hy] = this.hand(e);
          this.burst(hx, hy, e.top * 0.55, style, Math.round(12 * tier), 50, 500);
          this.glow(hx, hy, e.top * 0.55, 12, pal[1], 500, 0.8);
        } else {
          this.rise(e.sprite.x, e.sprite.y, 14, style, Math.round(20 * tier), e.top + 10, 700);
          this.ring(e.sprite.x, e.sprite.y, 22, style, Math.round(16 * tier), { life: 350 });
          this.glow(e.sprite.x, e.sprite.y, e.top * 0.5, 14 + 3 * tier, pal[2], 450, 0.7);
        }
        break;
      }
      case "counter":
        if (e) { this.glow(e.sprite.x, e.sprite.y, e.top * 0.5, 14, pal[1], 250, 0.7); this.burst(e.sprite.x, e.sprite.y, e.top * 0.6, style, 8, 30, 300); }
        break;
      case "countered": {
        if (!e) break;
        // The parry: a white flash where the blow was stopped, then the riposte
        this.glow(ev.fx, ev.fy, e.top * 0.5, 22, 0xffffff, 220, 1);
        this.burst(ev.fx, ev.fy, e.top * 0.5, style, 22, 110, 350);
        this.burst(ev.fx, ev.fy, e.top * 0.5, "steel", 10, 140, 250);
        if (ev.x !== ev.fx || ev.y !== ev.fy) for (let i = 0; i < 4; i++) this.ghost(e, ev.fx + (ev.x - ev.fx) * i / 4, ev.fy + (ev.y - ev.fy) * i / 4, pal[2], 0.4);
        if (ev.tx !== undefined) this.slash(ev.tx, ev.ty, 18, style, Math.atan2(ev.ty - ev.y, ev.tx - ev.x), 2.8);
        if (near) quake(this.scene, 90, 0.004);
        break;
      }
      case "chain": {
        const pts: [number, number][] = ev.pts;
        for (let i = 1; i < pts.length; i++) {
          this.scene.time.delayedCall(i * 40, () => {
            this.bolt(pts[i - 1][0], pts[i - 1][1], 10, pts[i][0], pts[i][1], 10, PALETTE.lightning, 2);
            this.burst(pts[i][0], pts[i][1], 10, "lightning", 10, 60, 250);
          });
        }
        break;
      }
      case "zap": {
        if (ev.sky) this.thunderStrike(ev.x2, ev.y2); else {
          const z1 = e ? e.top * 0.7 : 14;
          this.bolt(ev.x1, ev.y1, z1, ev.x2, ev.y2, 10, PALETTE.lightning, 1);
          this.burst(ev.x2, ev.y2, 10, "lightning", 6, 50, 200);
        }
        break;
      }
      case "turret": {
        const f = [...this.fields.values()].find((x) => x.f.owner === ev.id && x.f.kind === "sentry");
        this.glow(ev.x, ev.y, 18, 10, 0x9ccc65, 200, 1);
        if (f) this.burst(ev.x, ev.y, 18, "nature", 4, 30, 200);
        break;
      }
      case "siphon": this.siphon(ev); break;
      case "rupture": {
        // Hemorrhage: the bleed bursts all at once, a fountain of blood out of the victim
        const v = this.ent(ev.t);
        const x = v?.sprite.x ?? ev.x, y = v?.sprite.y ?? ev.y, z = (v?.top ?? 16) * 0.5;
        this.burst(x, y, z, "blood", 22, 110, 480);
        for (let i = 0; i < 10; i++) this.p(x + rnd(-2, 2), y, z, pick(PALETTE.blood.slice(1, 4)), { vx: rnd(-40, 40), vy: rnd(-20, 20), vz: rnd(60, 110), g: 320, life: rnd(400, 600), size: pick([1, 2, 2]), size1: 1, add: false });
        this.glow(x, y, z, 14, 0xb71c1c, 260, 0.7);
        break;
      }
      case "charm": {
        // Charm: a red stare locks on; a ring of shadow closes round the victim and its eyes glow under the spell
        const v = this.ent(ev.t);
        if (e && v) this.bolt(e.sprite.x, e.sprite.y, e.top * 0.8, v.sprite.x, v.sprite.y, v.top * 0.7, PALETTE.shadow, 1, 220);
        const x = v?.sprite.x ?? ev.x, y = v?.sprite.y ?? ev.y, top = v?.top ?? 16;
        this.ring(x, y, 16, "shadow", 22, { life: 520, up: 6 });
        this.rise(x, y, 10, "shadow", 14, top, 700);
        this.glow(x, y, top * 0.8, 9, 0xff2d6f, 500, 0.8);
        if (v) this.flashSprite(v, 0x9575cd);
        break;
      }
      case "brides": {
        // The Brides rise: a column of pale mist and a ring of blood at each one's feet, their red eyes lighting up
        const ids: string[] = ev.ids ?? [];
        ids.forEach((bid, i) => this.scene.time.delayedCall(i * 90, () => {
          const b = this.ent(bid);
          const x = b?.sprite.x ?? ev.x, y = b?.sprite.y ?? ev.y, top = b?.top ?? 22;
          this.rise(x, y, 8, "shadow", 16, top, 650);
          for (let k = 0; k < 14; k++) this.p(x + rnd(-6, 6), y + rnd(-3, 3), rnd(0, 6), pick([0xf3e5f5, 0xe1bee7, 0xffffff]), { vz: rnd(20, 45), vx: rnd(-8, 8), life: rnd(500, 800), size: pick([2, 3]), size1: 0, alpha: 0.6, add: false });
          this.ring(x, y, 10, "blood", 12, { life: 420, up: 2, add: false });
          this.glow(x, y, top * 0.85, 7, 0xff2d2d, 420, 0.8);
          if (b) this.flashSprite(b, 0xffffff);
        }));
        if (e) this.glow(e.sprite.x, e.sprite.y, e.top * 0.5, 18, 0x9575cd, 380, 0.5);
        break;
      }
      case "uncharm": {
        // The spell breaks: a puff of violet dust
        const v = this.ent(ev.t);
        this.burst(v?.sprite.x ?? ev.x, v?.sprite.y ?? ev.y, (v?.top ?? 16) * 0.7, "shadow", 12, 60, 360);
        break;
      }
      case "rise": {
        // Rise Again: a pool of blood spreads under the fallen vampire, then surges up round him as he stands
        if (!e) break;
        const x = e.sprite.x, y = e.sprite.y;
        this.ring(x, y, 22, "blood", 30, { life: 600, up: 2, add: false });
        this.rise(x, y, 18, "blood", 40, e.top, 900);
        this.glow(x, y, e.top * 0.5, 22, 0xe63946, 700, 0.8);
        this.scene.time.delayedCall(250, () => { const m = this.ent(ev.id); if (m) this.flashSprite(m, 0xe63946); });
        if (near) quake(this.scene, 120, 0.004);
        break;
      }
      case "fang": {
        // Devour / Bite: the jaws snap shut on the victim, two white fangs and a spurt of blood
        const v = this.ent(ev.t);
        const x = v?.sprite.x ?? ev.x, y = v?.sprite.y ?? ev.y, z = (v?.top ?? 16) * 0.6;
        for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
          this.p(x + side * (6 - i * 1.5), y, z + side * (5 - i), 0xffffff, { vx: -side * 40, vz: -side * 30, life: 120, size: 1, size1: 1, add: false });
        }
        this.burst(x, y, z, "blood", 10, 60, 320);
        this.glow(x, y, z, 10, 0xb71c1c, 220, 0.6);
        break;
      }
      case "devour": {
        // Eaten whole: chunks of the victim are torn off and gulped into the vampire, who flushes red
        const me = this.ent(ev.id);
        if (!me) break;
        const col = ({ blob: [0x7cb342, 0x9ccc65, 0x558b2f], gloam: [0x4cc9f0, 0xff9f1c, 0xc77dff], outlaw: [0xc98d63, 0x9b1b1b, 0x6d4526], beast: [0x8d6e63, 0x5d4037, 0x9b1b1b] } as Record<string, number[]>)[ev.fam] ?? PALETTE.blood;
        const dx = me.sprite.x - ev.x, dy = me.sprite.y - ev.y;
        for (let i = 0; i < 16; i++) {
          const T = rnd(0.22, 0.4);
          this.p(ev.x + rnd(-5, 5), ev.y + rnd(-3, 3), rnd(4, 14), pick(i % 3 ? col : PALETTE.blood.slice(1, 4)),
            { vx: dx / T, vy: dy / T, vz: (me.top * 0.55 - 8) / T + 60, g: 300, life: T * 1000, size: pick([2, 2, 3]), size1: 1, add: false });
        }
        this.burst(ev.x, ev.y, 8, "blood", 18, 80, 420);
        this.scene.time.delayedCall(320, () => {
          const m2 = this.ent(ev.id);
          if (!m2) return;
          this.glow(m2.sprite.x, m2.sprite.y, m2.top * 0.5, 16, 0xe63946, 380, 0.7);
          this.ring(m2.sprite.x, m2.sprite.y, 18, "blood", 20, { life: 360, up: 10 });
          this.flashSprite(m2, 0xe63946);
        });
        break;
      }
      case "thrall": {
        // The bitten one gets back up: dark mist rises round it and its eyes catch red
        this.smoke(ev.x, ev.y, 14, 14);
        this.rise(ev.x, ev.y, 10, "shadow", 22, 30, 800);
        this.ring(ev.x, ev.y, 16, "blood", 18, { life: 500, up: 4 });
        this.scene.time.delayedCall(500, () => {
          const t = this.ent(ev.t);
          if (!t) return;
          this.glow(t.sprite.x, t.sprite.y, t.top * 0.7, 8, 0xff1744, 400, 0.8);
          this.flashSprite(t, 0x9b1b1b);
        });
        break;
      }
      case "enchanthit": this.burst(ev.x, ev.y, 8, style, 6, 50, 300); break;
      case "thorns": this.burst(ev.x, ev.y, 10, style, 12, 70, 300); break;
      case "drain": {
        // The vampire drinks: drops of blood fly from the victim back into him, and he flushes red for a moment
        const v = this.ent(ev.t);
        if (!e || !v) break;
        const x0 = v.sprite.x, y0 = v.sprite.y, z0 = v.top * 0.55;
        const dx = e.sprite.x - x0, dy = e.sprite.y - y0, d = Math.max(8, Math.hypot(dx, dy));
        const ms = Math.min(420, 140 + d * 2.2);
        for (let i = 0; i < 7; i++) {
          const k = 1000 / (ms * rnd(0.85, 1.1));
          this.p(x0 + rnd(-3, 3), y0 + rnd(-2, 2), z0 + rnd(-3, 3), pick(PALETTE.blood.slice(1, 4)),
            { vx: dx * k, vy: dy * k, vz: (e.top * 0.55 - z0) * k + rnd(-10, 10), life: ms, size: pick([1, 1, 2]), size1: 0, add: false });
        }
        this.scene.time.delayedCall(ms * 0.8, () => { const me = this.ent(ev.id); if (me) this.glow(me.sprite.x, me.sprite.y, me.top * 0.5, 9, 0xe63946, 220, 0.45); });
        break;
      }
    }
  }

  /**
   * Exsanguinate: the blood is torn out of every victim in arcing streams that pour into the vampire for ~0.7 s; each
   * victim spurts as the stream starts, and the vampire is wrapped in a red vortex that flares when the last drops land.
   */
  private siphon(ev: any) {
    const pts: [number, number][] = ev.pts ?? [];
    const me0 = this.ent(ev.id);
    if (!me0 || !pts.length) return;
    const STREAM = 900, FLY = 420, G = 300;
    for (const [vx, vy] of pts) {
      this.burst(vx, vy, 10, "blood", 16, 70, 420);
      this.glow(vx, vy, 8, 12, 0xb71c1c, 300, 0.7);
    }
    this.emit(STREAM, 24, () => {
      const me = this.ent(ev.id);
      if (!me) return;
      const hx = me.sprite.x, hy = me.sprite.y, hz = me.top * 0.55;
      for (const [vx, vy] of pts) {
        for (let k = 0; k < 6; k++) {
          const T = FLY * rnd(0.85, 1.15) / 1000;
          const x0 = vx + rnd(-3, 3), y0 = vy + rnd(-2, 2), z0 = rnd(6, 14);
          const vz = (hz - z0 + (G * T * T) / 2) / T; // an arc that lands on the vampire's chest after T
          this.p(x0, y0, z0, pick(PALETTE.blood.slice(1, 5)), { vx: (hx - x0) / T, vy: (hy - y0) / T, vz, g: G, life: T * 1000, size: pick([2, 3, 3, 4]), size1: 2, add: false });
        }
      }
      // the vortex round the vampire
      const a = this.t / 70;
      for (let i = 0; i < 3; i++) {
        const b = a + (i * Math.PI * 2) / 3, rr = rnd(9, 15);
        this.p(hx + Math.cos(b) * rr, hy + Math.sin(b) * rr * 0.6, rnd(2, me.top), pick(PALETTE.blood), { vx: -Math.sin(b) * 90, vy: Math.cos(b) * 50, vz: rnd(10, 30), life: 220, size: pick([1, 2]), size1: 0 });
      }
    });
    this.scene.time.delayedCall(STREAM + FLY * 0.8, () => {
      const me = this.ent(ev.id);
      if (!me) return;
      this.glow(me.sprite.x, me.sprite.y, me.top * 0.5, 18 + 3 * pts.length, 0xe63946, 450, 0.8);
      this.ring(me.sprite.x, me.sprite.y, 34, "blood", 44, { life: 420, up: 16, size: 2 });
      this.rise(me.sprite.x, me.sprite.y, 10, "blood", 26, me.top + 16, 650);
      this.bloodBeam(me.sprite.x, me.sprite.y, 96, 16, 560);
      this.flashSprite(me, 0xe63946);
    });
  }

  /**
   * Exsanguinate's ritual (BLOOD_RITE_MS, the damage lands at its end): the vampire raises his blade and blood spills out
   * of him onto the ground all round; the pool lifts off in spiralling threads that gather into a beating crimson orb
   * high over his head; the orb shrinks, then bursts and crashes down on him, and the blood mist of the whole area
   * collapses into him (the streams out of every victim come with the server's "siphon" at the same moment).
   */
  private bloodRite(ev: any, r: number) {
    const T = BLOOD_RITE_MS, start = this.t;
    const SPILL = 0.32, LIFT = 0.82; // phases, as parts of T: spill, lift into the orb, then the orb pulls in
    const H = 42; // the orb's height over the ground (well over the head)
    const dark = PALETTE.blood.slice(2, 5), bright = PALETTE.blood.slice(1, 4);
    const pool: [number, number][] = []; // spots of spilled blood round the feet (offsets from the vampire)
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + rnd(-0.2, 0.2), d = rnd(10, 26); pool.push([Math.cos(a) * d, Math.sin(a) * d * 0.8]); }
    this.emit(T, 20, () => {
      const me = this.ent(ev.id);
      if (!me) return;
      const x = me.sprite.x, y = me.sprite.y, k = (this.t - start) / T, top = me.top;
      if (k < SPILL) {
        // Blood pours out of the vampire's chest and splashes down round him, spreading into a dark pool
        for (let i = 0; i < 3; i++) {
          const [ox, oy] = pick(pool), F = rnd(0.22, 0.3), z0 = top * 0.55;
          this.p(x + rnd(-2, 2), y, z0, pick(bright), { vx: ox / F, vy: oy / F, vz: (-z0 + 160 * F * F) / F, g: 320, life: F * 1000, size: pick([1, 2, 2]), size1: 1, add: false });
        }
        for (let i = 0; i < 2; i++) {
          const [ox, oy] = pick(pool);
          this.p(x + ox * k / SPILL, y + oy * k / SPILL, 0, pick(dark), { vx: ox * 0.6, vy: oy * 0.6, life: T * (1 - k) * 0.9, size: pick([2, 3]), size1: 3, alpha: 0.9, add: false, depth: GROUND_DEPTH });
        }
      } else if (k < LIFT) {
        // The pool lifts off the ground: threads of blood spiral up from it into the orb over his head
        const u = (k - SPILL) / (LIFT - SPILL);
        // three helices of blood climbing from the pool into the orb, narrowing as they rise
        for (let j = 0; j < 3; j++) {
          for (let n = 0; n < 8; n++) {
            const h = rnd(0, H) * Math.min(1, u * 2.5), rad = 3 + 14 * (1 - h / H), a = this.t / 90 + (j * Math.PI * 2) / 3 + h / 9;
            this.p(x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.7, h, pick(n % 3 ? bright : dark), { vz: 60, vx: -Math.sin(a) * 20, vy: Math.cos(a) * 14, life: 200, size: 2, size1: 1, add: false });
          }
        }
        // the pool drains away into them
        for (let i = 0; i < 2; i++) { const [ox, oy] = pick(pool); this.p(x + ox, y + oy, 1, pick(dark), { vx: -ox * 1.5, vy: -oy * 1.5, vz: 30, life: 260, size: 2, size1: 1, add: false }); }
        this.orb(x, y, H, 3 + u * 9, k);
      } else {
        // The orb pulls in on itself, beating faster, before it breaks
        const u = (k - LIFT) / (1 - LIFT);
        this.orb(x, y, H, 12 - u * 7, k);
        for (let i = 0; i < 3; i++) { const a = Math.random() * Math.PI * 2, d = rnd(14, 22); this.p(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, H + rnd(-8, 8), pick(bright), { vx: -Math.cos(a) * d * 6, vy: -Math.sin(a) * d * 3.6, life: 160, size: 1, size1: 0 }); }
      }
    });
    // a low red light under the vampire while the pool lies there
    const me0 = this.ent(ev.id);
    if (me0) this.glow(me0.sprite.x, me0.sprite.y, 2, 30, 0x6d0000, T * 0.8, 0.45, true);
    this.scene.time.delayedCall(T, () => {
      const me = this.ent(ev.id);
      if (!me) return;
      const x = me.sprite.x, y = me.sprite.y;
      // The orb breaks: blood crashes straight down on the vampire...
      for (let i = 0; i < 26; i++) this.p(x + rnd(-6, 6), y + rnd(-4, 4), H + rnd(-6, 6), pick(bright), { vx: rnd(-20, 20), vy: rnd(-12, 12), vz: rnd(-260, -160), g: 200, life: 280, size: pick([1, 2, 2]), size1: 1, add: false });
      this.glow(x, y, H, 22, 0xff1744, 260, 0.9);
      this.bloodBeam(x, y, H + 24, 12, 380, true);
      // ...and the blood mist all round the area collapses into him (the Exsanguinate look from before)
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2, F = rnd(0.35, 0.5);
        this.p(x + Math.cos(a) * r, y + Math.sin(a) * r, rnd(2, 10), pick(PALETTE.blood.slice(1, 5)), { vx: -Math.cos(a) * r / F, vy: -Math.sin(a) * r / F, vz: rnd(10, 30), life: F * 1000, size: pick([2, 2, 3]), size1: 1, add: false });
      }
      this.ring(x, y, r, "blood", 60, { life: 380, up: 10 });
      this.ring(x, y, r * 0.6, "blood", 26, { life: 300, up: 30, size: 2 });
      this.glow(x, y, 2, r, 0x6d0000, 500, 0.5, true);
    });
  }

  /**
   * A thick column of blood in chunky pixel blocks (Exsanguinate): a ragged dark rim, red body, bright core, redrawn every
   * few frames so the edges churn; `down` pours it from the top onto the ground first. Drops spray off its sides.
   */
  private bloodBeam(x: number, y: number, h: number, w: number, ms: number, down = false) {
    const g = this.scene.add.graphics().setDepth(DEPTH + 1);
    g.setPosition(x + 0.01, y + 0.01);
    const start = this.t, ROW = 2;
    const draw = () => {
      const k = Math.min(1, (this.t - start) / ms);
      g.clear();
      const grow = down ? Math.min(1, k / 0.18) : Math.min(1, k / 0.12); // how much of the height is there yet
      const thin = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45; // it narrows away at the end
      const top = -h, bottom = down ? -h + h * grow : 0, from = down ? top : -h * grow;
      g.setAlpha(Math.min(1, 1.6 - k));
      for (let ry = Math.floor(from / ROW) * ROW; ry < bottom; ry += ROW) {
        const u = -ry / h; // 0 ground .. 1 top
        const flare = 1 + 0.6 * Math.max(0, 0.25 - u) * 4; // wider where it hits the ground
        const half = Math.max(1, Math.round((w / 2) * thin * flare * (0.85 + Math.random() * 0.3)));
        const core = Math.max(0, Math.round(half * 0.35)), inner = Math.max(1, Math.round(half * 0.65));
        const jl = Math.round(Math.random() * 2) - 1, jr = Math.round(Math.random() * 2) - 1;
        g.fillStyle(0x4a0000, 0.9).fillRect(-half - 1 + jl, ry, half * 2 + 2 - jl + jr, ROW);
        g.fillStyle(0xb71c1c, 1).fillRect(-half + jl, ry, half * 2 - jl + jr, ROW);
        g.fillStyle(0xe63946, 1).fillRect(-inner, ry, inner * 2, ROW);
        if (core) g.fillStyle(0xffcdd2, 1).fillRect(-core, ry, core * 2, ROW);
      }
    };
    draw();
    this.emit(ms, 40, () => {
      draw();
      // chunky drops flung off the column
      const z = rnd(4, h * 0.9);
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        this.p(x, y, z, pick(PALETTE.blood.slice(1, 5)), { vx: Math.cos(a) * rnd(30, 70), vy: Math.sin(a) * rnd(18, 40), vz: rnd(10, 60), g: 260, life: rnd(350, 600), size: pick([2, 3, 3]), size1: 1, add: false });
      }
    });
    this.scene.time.delayedCall(ms, () => g.destroy());
    // a splash where it meets the ground, and a red light round it
    this.scene.time.delayedCall(down ? ms * 0.18 : 0, () => {
      this.ring(x, y, w * 2.2, "blood", 30, { life: 420, up: 24, size: 2, add: false });
      this.glow(x, y, h * 0.4, w * 2.5, 0xe63946, ms, 0.6);
      this.glow(x, y, 2, w * 3, 0x6d0000, ms, 0.5, true);
    });
  }

  /** The beating crimson orb of the blood ritual: a dark core with bright drops orbiting it. */
  private orb(x: number, y: number, h: number, rad: number, k: number) {
    const beat = 1 + 0.25 * Math.sin(k * Math.PI * 2 * (3 + k * 5));
    const rr = rad * beat;
    for (let i = 0; i < 3; i++) {
      const a = this.t / 60 + (i * Math.PI * 2) / 3 + rnd(-0.3, 0.3);
      this.p(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.5, h + Math.sin(a * 1.7) * rr * 0.6, pick(PALETTE.blood.slice(0, 3)), { vx: -Math.sin(a) * rr * 5, vy: Math.cos(a) * rr * 2.5, life: 110, size: pick([1, 2]), size1: 0 });
    }
    for (let i = 0; i < 2; i++) this.p(x + rnd(-1, 1) * rr * 0.5, y + rnd(-1, 1) * rr * 0.3, h + rnd(-1, 1) * rr * 0.5, pick(PALETTE.blood.slice(2, 5)), { life: 90, size: Math.max(2, Math.round(rr * 0.7)), size1: 1, add: false });
    if (Math.random() < 0.25) this.glow(x, y, h, rr * 2, 0xb71c1c, 180, 0.5);
  }

  /** Boil Blood took hold: the victim's blood erupts out of it once (then bubbles while it boils, see status()). */
  private boilErupt(e: FxEntity) {
    const x = e.sprite.x, y = e.sprite.y, top = e.top;
    this.glow(x, y, top * 0.5, 14, 0xff1744, 380, 0.8);
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, sp = rnd(15, 45);
      this.p(x + rnd(-4, 4), y + rnd(-2, 2), rnd(top * 0.3, top * 0.8), pick(PALETTE.blood.slice(1, 5)), { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(40, 90), g: 220, life: rnd(450, 700), size: pick([1, 2, 2, 3]), size1: 1, add: false });
    }
    for (let i = 0; i < 6; i++) this.p(x + rnd(-5, 5), y, rnd(top * 0.5, top), pick([0xd7ccc8, 0xbcaaa4, 0xefebe9]), { vz: rnd(14, 26), vx: rnd(-5, 5), life: rnd(600, 900), size: 2, size1: 5, alpha: 0.35, add: false });
    this.flashSprite(e, 0xff1744);
  }
  private boiling = new WeakSet<object>();
  private linkPulse = new WeakMap<object, number>();

  private nearMe(x?: number, y?: number) {
    const me = this.ent(this.meId());
    return x !== undefined && y !== undefined && !!me && Math.hypot(me.sprite.x - x, me.sprite.y - y) < 220;
  }

  private flashSprite(e: FxEntity, color: number) {
    e.sprite.setTintFill(color);
    this.scene.time.delayedCall(90, () => e.sprite.clearTint());
  }

  /** Where the weapon hand is (in front of the hero). */
  private hand(e: FxEntity): [number, number] {
    const ax = e.state.ax ?? 0, ay = e.state.ay ?? 1;
    return [e.sprite.x + ax * 6, e.sprite.y + ay * 6];
  }

  /** Buildup: energy streams into the hero, the glow grows, then it is released. */
  private gather(id: string, style: FxStyle, ms: number, tier: number) {
    const pal = PALETTE[style];
    const glow = this.scene.add.image(0, 0, "fx_glow").setTint(pal[2]).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH + 1).setAlpha(0.2).setScale(0.3);
    const start = this.t;
    this.emit(ms, 30, () => {
      const e = this.ent(id);
      if (!e) return;
      const k = (this.t - start) / ms;
      const [lx, ly] = lift(e.top * 0.55);
      glow.setPosition(e.sprite.x + lx, e.sprite.y + ly).setScale(0.3 + k * 0.5 * tier / 2).setAlpha(0.15 + k * 0.3);
      for (let i = 0; i < Math.ceil(2 * tier); i++) {
        const a = Math.random() * Math.PI * 2, d = rnd(22, 34) * (1 + tier * 0.2);
        const life = 260;
        this.p(e.sprite.x + Math.cos(a) * d, e.sprite.y + Math.sin(a) * d * 0.7, rnd(0, e.top + 6), pick(pal), {
          vx: -Math.cos(a) * d / (life / 1000), vy: -Math.sin(a) * d * 0.7 / (life / 1000), vz: (e.top * 0.55 - 6) / (life / 1000) * 0.5, life, size: pick([1, 2]), size1: 0,
        });
      }
    });
    this.scene.time.delayedCall(ms, () => {
      const e = this.ent(id);
      glow.destroy();
      if (e) { this.glow(e.sprite.x, e.sprite.y, e.top * 0.55, 18 * tier, pal[1], 300, 1); this.flashSprite(e, pal[0]); }
    });
  }

  private showMove(ev: any, s: SkillDef | undefined, style: FxStyle, e?: FxEntity) {
    const pal = PALETTE[style];
    if (e && ev.kind !== "dash") e.sprite.setPosition(ev.x, ev.y); // a dash glides there (TownScene eases to the server spot)
    const n = 6;
    if (s?.id === "v_mist" && ev.kind === "blink") { this.mistForm(ev, e); return; }
    if (ev.kind === "blink" || ev.kind === "back" || ev.kind === "behind") {
      // Vanish in a puff, reappear in another
      for (const [x, y, k] of [[ev.fx, ev.fy, 1], [ev.x, ev.y, 0.8]] as const) {
        this.ring(x, y, 16, style, 16, { life: 320, up: 14 });
        this.rise(x, y, 8, style, 10, 22, 450);
        this.glow(x, y, 8, 12 * k, pal[2], 260, 0.7);
      }
      if (e && ev.kind !== "back") for (let i = 1; i < 4; i++) this.ghost(e, ev.fx + (ev.x - ev.fx) * i / 4, ev.fy + (ev.y - ev.fy) * i / 4, pal[2], 0.25, 200);
      if (ev.i !== undefined && e) this.slash(ev.x, ev.y, 16, style);
      return;
    }
    // Dash / leap: afterimages and a trail of sparks along the path
    const leap = ev.kind === "leap";
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ev.fx + (ev.x - ev.fx) * t, y = ev.fy + (ev.y - ev.fy) * t;
      const z = leap ? Math.sin(t * Math.PI) * 26 : 0;
      if (e && i < n) { const [lx, ly] = lift(z); this.ghost(e, x + lx, y + ly, pal[2], 0.35, 180 + i * 30); }
      this.p(x, y, z + 6, pick(pal), { vz: 10, life: 350, size: 2, size1: 0 });
      if (!leap) this.burst(x, y, 2, style, 2, 30, 300);
    }
    if (leap && e) {
      // Hop the sprite along an arc for the look
      const sp = e.sprite, start = this.t, ms = LEAP_MS;
      this.emit(ms, 16, () => { const k = Math.min(1, (this.t - start) / ms); sp.y = ev.y - Math.sin(k * Math.PI) * 10; });
    }
  }

  private showArea(ev: any, s: SkillDef | undefined, style: FxStyle, tier: number, near: boolean) {
    const look: AreaLook = ev.look;
    const { x, y, r } = ev;
    const pal = PALETTE[style];
    const shake = (ms: number, k: number) => { if (near) quake(this.scene, ms, k); };
    // Cast while enchanted (Holy Blade + Cleave, Fire Arrows + Arrow Rain...): the blast also flares in the enchantment's colour
    const imb = ev.imb as FxStyle;
    if (PALETTE[imb] && imb !== style) {
      this.ring(x, y, r * 0.8, imb, Math.round(14 * tier), { life: 360, up: 12 });
      this.burst(x, y, 4, imb, Math.round(8 * tier), 60, 380);
      if (imb === "fire") this.smoke(x, y, r * 0.4, 2);
    }
    switch (look) {
      case "bloodrite": this.bloodRite(ev, r); break;
      case "slash": {
        const e = this.ent(ev.id);
        const ang = e ? Math.atan2(e.state.ay ?? 1, e.state.ax ?? 0) + (ev.i % 2 ? Math.PI : 0) : Math.random() * 6;
        this.slash(x, y, Math.min(r, 34), style, ang + rnd(-0.4, 0.4), r > 30 ? 4.4 : 2.6);
        this.burst(x, y, 8, style, Math.round(8 * tier), 80, 300);
        if (tier > 1.5) this.ring(x, y, r, style, Math.round(12 * tier), { life: 260, up: 4 });
        break;
      }
      case "nova": {
        this.ring(x, y, r, style, Math.round(36 * tier), { life: 380, up: 10 });
        this.ring(x, y, r * 0.6, style, Math.round(16 * tier), { life: 300, up: 30, size: 2 });
        this.glow(x, y, 6, r * 0.9, pal[2], 320, 0.6, true);
        if (style === "frost") for (let i = 0; i < 10 * tier; i++) this.ice(x, y, r);
        break;
      }
      case "slam": {
        // Cracks, flying rocks and a dust ring
        this.cracks(x, y, r, style === "earth" ? 0x3e2723 : pal[3]);
        this.ring(x, y, r, "earth", Math.round(30 * tier), { life: 480, up: 26, add: false, size: 2 });
        this.burst(x, y, 2, style, Math.round(14 * tier), 90, 600, 2);
        for (let i = 0; i < 4 * tier; i++) this.rock(x, y, r);
        this.glow(x, y, 2, r, pal[2], 260, 0.4, true);
        shake(200, 0.004 * tier);
        break;
      }
      case "spikes": {
        for (let i = 0; i < 3 + tier * 2; i++) {
          const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.8;
          this.spike(x + Math.cos(a) * d, y + Math.sin(a) * d, style, 6 + tier * 2);
        }
        this.ring(x, y, r, "earth", Math.round(10 * tier), { life: 300, add: false });
        shake(80, 0.002 * tier);
        break;
      }
      case "pillar": {
        this.pillar(x, y, style, 110, 6 + tier, 420);
        this.ring(x, y, r, style, Math.round(18 * tier), { life: 360, up: 18 });
        this.burst(x, y, 2, style, Math.round(10 * tier), 70, 500);
        shake(90, 0.003);
        break;
      }
      case "sword": {
        this.blade(x, y, style, r, () => {
          this.cracks(x, y, r, pal[3]);
          this.ring(x, y, r, style, 90, { life: 520, up: 40, size: 2 });
          this.ring(x, y, r * 1.2, "earth", 40, { life: 600, add: false, size: 2 });
          this.pillar(x, y, style, 160, 14, 600);
          this.glow(x, y, 4, r * 1.2, pal[1], 600, 0.6, true);
          if (near) { quake(this.scene, 320, 0.012); }
        });
        break;
      }
      case "meteor": {
        const big = r >= 40;
        this.fall(x, y, style === "earth" ? "earth" : "fire", impactMs("meteor", r), big ? 14 : 7, () => {
          this.ring(x, y, r, "fire", big ? 80 : 24, { life: 500, up: 40, size: 2 });
          this.ring(x, y, r * 0.8, "earth", big ? 40 : 12, { life: 600, add: false, size: 2 });
          this.burst(x, y, 2, style === "earth" ? "earth" : "fire", big ? 50 : 14, big ? 140 : 80, 700, 2);
          this.glow(x, y, 4, r * (big ? 1.8 : 1.2), 0xff9f1c, 500, 1, true);
          this.cracks(x, y, r * 0.8, 0x2b1d12);
          if (near) quake(this.scene, big ? 300 : 120, big ? 0.012 : 0.004);
        }, style === "earth" ? "rock" : "orb");
        break;
      }
      case "rain": {
        // A volley of arrows falling across the area
        for (let i = 0; i < 6 + 3 * tier; i++) {
          const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
          const ax = x + Math.cos(a) * d, ay = y + Math.sin(a) * d;
          // each arrow falls ARROW_DROP_MS; they land spread around RAIN_FALL_MS, when the rain hurts
          this.scene.time.delayedCall(Math.max(0, RAIN_FALL_MS - ARROW_DROP_MS + rnd(-60, 60)), () => this.arrowDrop(ax, ay));
        }
        break;
      }
      case "spirit": {
        // Ghost warriors rise around the hero and slam down
        const e = this.ent(ev.id);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + ev.i * 0.6, d = r * 0.6;
          const gx = x + Math.cos(a) * d, gy = y + Math.sin(a) * d;
          if (e) {
            const g = this.ghost(e, gx, gy, pal[2], 0.6, 420);
            g.setScale(e.sprite.scaleX * 1.4, e.sprite.scaleY * 1.4);
            this.scene.tweens.add({ targets: g, y: g.y - 6, duration: 200, yoyo: true });
          }
          this.rise(gx, gy, 6, style, 8, 30, 500);
        }
        this.ring(x, y, r, style, Math.round(40 * tier / 2), { life: 450, up: 16 });
        this.cracks(x, y, r * 0.7, pal[4]);
        shake(160, 0.006);
        break;
      }
      case "flame": {
        const e = this.ent(ev.id);
        const ax = e?.state.ax ?? 0, ay = e?.state.ay ?? 1;
        const ox = e ? e.sprite.x : x, oy = e ? e.sprite.y : y;
        for (let i = 0; i < 40 * tier; i++) {
          const spread = rnd(-0.5, 0.5), c = Math.cos(spread), sn = Math.sin(spread);
          const dx = ax * c - ay * sn, dy = ax * sn + ay * c, sp = rnd(80, 170);
          this.p(ox + ax * 6, oy + ay * 6, 10, pick(PALETTE.fire), { vx: dx * sp, vy: dy * sp, vz: rnd(0, 25), drag: 2.5, life: rnd(250, 450), size: pick([1, 2, 2]), size1: 0 });
        }
        this.glow(x, y, 8, r, 0xff9f1c, 300, 0.7);
        break;
      }
      case "smoke": this.smoke(x, y, r, 10); break;
      case "bolt": this.bolt(x, y, 140, x, y, 0); break;
      default: {
        this.ring(x, y, r, style, Math.round(30 * tier), { life: 360, up: 16 });
        this.burst(x, y, 4, style, Math.round(16 * tier), 90, 450);
        this.glow(x, y, 6, r * 1.1, pal[2], 300, 0.8, true);
        shake(100, 0.003 * tier);
      }
    }
  }

  private ice(x: number, y: number, r: number) {
    const a = Math.random() * Math.PI * 2, d = rnd(0.3, 1) * r;
    this.p(x + Math.cos(a) * d, y + Math.sin(a) * d, 0, pick(PALETTE.frost), { vz: rnd(20, 50), g: 120, life: rnd(400, 700), size: 2, size1: 1, add: false });
  }

  private rock(x: number, y: number, r: number) {
    const a = Math.random() * Math.PI * 2, sp = rnd(r, r * 2);
    this.p(x, y, 2, pick([0x5d4037, 0x795548, 0x8d6e63, 0x4e342e]), { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(60, 120), g: 320, life: rnd(500, 750), size: pick([2, 2, 3]), add: false });
  }

  /**
   * Thunder (Murat 2026-11-08: "big explosion and earth shaking, a ripping effect crawling from the point of impact"):
   * a thick bolt from high up with a second one beside it, a white flash, a shock ring of sparks and dust, rocks
   * thrown up, a ripple running out over the ground, and glowing cracks that tear outwards and cool down.
   */
  private thunderStrike(x: number, y: number) {
    this.bolt(x + rnd(-8, 8), y, 240, x, y, 0, PALETTE.lightning, 3, 260);
    this.scene.time.delayedCall(45, () => this.bolt(x + rnd(-14, 14), y, 220, x + rnd(-3, 3), y + rnd(-2, 2), 0, PALETTE.lightning, 1, 180));
    this.glow(x, y, 30, 48, 0xffffff, 140, 1);
    this.glow(x, y, 2, 48, 0xb3ecff, 520, 1, true);
    this.glow(x, y, 2, 30, 0xffffff, 240, 1, true);
    this.burst(x, y, 4, "lightning", 30, 130, 380);
    this.ring(x, y, 46, "lightning", 34, { life: 360, up: 10 });
    this.ring(x, y, 34, "earth", 22, { life: 600, up: 30, add: false, size: 2 });
    for (let i = 0; i < 7; i++) this.rock(x, y, 30);
    this.smoke(x, y, 14, 3);
    this.ripple(x, y, 58, 0xb3ecff, 420);
    this.scene.time.delayedCall(90, () => this.ripple(x, y, 40, 0xffffff, 320));
    this.crawl(x, y, 54, 0x9be8ff, 0x1b1410);
    if (this.nearMe(x, y)) { const cam = this.scene.cameras.main; if (!cam.shakeEffect.isRunning) cam.shake(240, 0.0042); }
  }

  /** A ring running out over the ground from a point (flat, squashed by the iso view). */
  private ripple(x: number, y: number, r: number, color: number, ms: number) {
    const g = this.scene.add.graphics().setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.addCounter({ from: 0, to: 1, duration: ms, ease: "Cubic.easeOut",
      onUpdate: (tw) => { const k = tw.getValue() ?? 0; g.clear().lineStyle(3 - 2 * k, color, 0.9 * (1 - k)).strokeCircle(x, y, 4 + r * k); },
      onComplete: () => g.destroy() });
  }

  /** Cracks that tear outwards from a point, glowing hot at first, then cooling into dark scars that fade. */
  private crawl(x: number, y: number, r: number, hot: number, cold: number) {
    const arms: [number, number][][] = [];
    const n = 7 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3), px = x, py = y;
      const pts: [number, number][] = [[px, py]], len = r * rnd(0.55, 1);
      for (let d = 0; d < len; d += 5) { a += rnd(-0.55, 0.55); px += Math.cos(a) * 5; py += Math.sin(a) * 5; pts.push([px, py]); }
      arms.push(pts);
      // a side split on the longer arms
      if (pts.length > 6 && Math.random() < 0.6) {
        const k = 2 + Math.floor(Math.random() * (pts.length - 4)); let [bx, by] = pts[k]; let b = a + (Math.random() < 0.5 ? 1 : -1) * rnd(0.6, 1.1);
        const side: [number, number][] = [[bx, by]];
        for (let d = 0; d < len * 0.4; d += 5) { b += rnd(-0.5, 0.5); bx += Math.cos(b) * 5; by += Math.sin(b) * 5; side.push([bx, by]); }
        arms.push(side);
      }
    }
    const g = this.scene.add.graphics().setDepth(1);
    const glowG = this.scene.add.graphics().setDepth(1.1).setBlendMode(Phaser.BlendModes.ADD);
    const draw = (gr: Phaser.GameObjects.Graphics, w: number, c: number, a: number, k: number) => {
      gr.lineStyle(w, c, a);
      for (const pts of arms) {
        const m = Math.max(1, Math.round((pts.length - 1) * k));
        gr.beginPath(); gr.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i <= m; i++) gr.lineTo(pts[i][0], pts[i][1]);
        gr.strokePath();
      }
    };
    this.scene.tweens.addCounter({ from: 0, to: 1, duration: 320, ease: "Quad.easeOut",
      onUpdate: (tw) => { const k = tw.getValue() ?? 0; g.clear(); draw(g, 2, cold, 0.85, k); glowG.clear(); draw(glowG, 3, hot, 0.55, k); draw(glowG, 1, 0xffffff, 0.9, k); },
      onComplete: () => {
        // sparks along the fresh cracks, then the glow cools off and the scars fade
        for (const pts of arms) { const [ex, ey] = pts[pts.length - 1]; this.burst(ex, ey, 1, "lightning", 2, 40, 260); }
        this.scene.tweens.add({ targets: glowG, alpha: 0, duration: 500, onComplete: () => glowG.destroy() });
        this.scene.tweens.add({ targets: g, alpha: 0, delay: 1300, duration: 900, onComplete: () => g.destroy() });
      } });
  }

  /** Dark cracks drawn flat on the ground (a Graphics at 0,0 is laid onto the ground plane by the iso view). */
  private cracks(x: number, y: number, r: number, color: number) {
    const g = this.scene.add.graphics().setDepth(1);
    g.lineStyle(1, color, 0.9);
    for (let i = 0; i < 7; i++) {
      let a = (i / 7) * Math.PI * 2 + rnd(-0.3, 0.3), px = x, py = y;
      g.beginPath(); g.moveTo(px, py);
      const len = r * rnd(0.6, 1);
      for (let d = 0; d < len; d += 6) { a += rnd(-0.5, 0.5); px += Math.cos(a) * 6; py += Math.sin(a) * 6; g.lineTo(px, py); }
      g.strokePath();
    }
    this.scene.tweens.add({ targets: g, alpha: 0, delay: 900, duration: 900, onComplete: () => g.destroy() });
  }

  /** A stone (or ice) spike bursting out of the ground and sinking back. */
  private spike(x: number, y: number, style: FxStyle, h: number) {
    const pal = PALETTE[style === "earth" ? "earth" : style];
    const g = this.scene.add.graphics().setDepth(DEPTH).setPosition(x + 0.01, y + 0.01);
    g.fillStyle(pal[3], 1).fillTriangle(-3, 0, 3, 0, 0, -h);
    g.fillStyle(pal[1], 1).fillTriangle(-1, 0, 1, 0, 0, -h + 1);
    g.setScale(1, 0.1);
    this.scene.tweens.add({ targets: g, scaleY: 1, duration: 90, yoyo: true, hold: 260, onComplete: () => g.destroy() });
    this.burst(x, y, 1, "earth", 4, 40, 300);
  }

  private arrowDrop(x: number, y: number) {
    const [lx, ly] = lift(70);
    const a = this.scene.add.image(x + lx, y + ly, "fx_px").setDisplaySize(1, 8).setTint(0xe8d8b0).setDepth(DEPTH);
    const [gx, gy] = lift(4);
    this.scene.tweens.add({ targets: a, x: x + gx, y: y + gy, duration: ARROW_DROP_MS, ease: "Quad.easeIn", onComplete: () => {
      a.destroy();
      this.burst(x, y, 1, "earth", 3, 30, 250);
      const stuck = this.scene.add.image(x + gx, y + gy, "fx_px").setDisplaySize(1, 4).setTint(0x8d6e63).setDepth(y);
      this.scene.tweens.add({ targets: stuck, alpha: 0, delay: 500, duration: 400, onComplete: () => stuck.destroy() });
    } });
  }

  /** Judgement Blade: a giant sword of light falls point first. */
  private blade(x: number, y: number, style: FxStyle, r: number, land: () => void) {
    const pal = PALETTE[style];
    const g = this.scene.add.graphics().setDepth(DEPTH + 3).setBlendMode(Phaser.BlendModes.ADD);
    const L = 60, W = 7;
    // blade, fuller, guard, grip, pommel (point at 0,0 = the ground)
    g.fillStyle(pal[2], 0.9).fillTriangle(-W, -14, W, -14, 0, 0).fillRect(-W, -L, W * 2, L - 14);
    g.fillStyle(0xffffff, 1).fillRect(-1, -L + 2, 2, L - 6);
    g.fillStyle(pal[3], 1).fillRect(-W - 8, -L - 4, W * 2 + 16, 4);
    g.fillStyle(pal[1], 1).fillRect(-2, -L - 18, 4, 14).fillRect(-4, -L - 22, 8, 5);
    const [lx, ly] = lift(160), [gx, gy] = lift(0);
    g.setPosition(x + lx, y + ly).setAlpha(0);
    this.scene.tweens.add({ targets: g, alpha: 1, duration: 80 });
    this.scene.tweens.add({ targets: g, x: x + gx, y: y + gy, duration: SWORD_FALL_MS, ease: "Quad.easeIn", onComplete: () => {
      land();
      this.scene.tweens.add({ targets: g, alpha: 0, duration: 700, delay: 250, onComplete: () => g.destroy() });
    } });
    this.emit(SWORD_FALL_MS, 20, () => this.p(g.x - lx * 0 + rnd(-W, W), g.y, 0, pick(pal), { vz: 0, vy: rnd(-10, 10), life: 300, size: 2, size1: 0, depth: DEPTH + 2 }));
    void r;
  }

  /** One soft puff of night mist that swirls round (cx, cy) as it drifts and swells. */
  private mistPuff(x: number, y: number, cx: number, cy: number, life = rnd(700, 1200), big = 1) {
    const a = Math.atan2(y - cy, x - cx), sw = rnd(14, 26);
    this.p(x, y, rnd(0, 12), pick([0xc9c2d9, 0xa99fc0, 0x8a80a8, 0xe0dbea, 0x6f6690]), {
      vx: -Math.sin(a) * sw + rnd(-5, 5), vy: Math.cos(a) * sw * 0.6 + rnd(-4, 4), vz: rnd(2, 9), drag: 0.8, life,
      size: pick([4, 5, 6, 7]) * big, size1: rnd(9, 13) * big, alpha: rnd(0.32, 0.5), add: false, depth: DEPTH - 1,
    });
  }

  /**
   * The hero as it looks right now (body + worn gear overlays), as coloured pixels: screen offsets from the feet,
   * one per texel. For effects that take the hero apart and put it back together (Mist Form).
   */
  private heroPixels(e: FxEntity): { dx: number; dy: number; h: number; c: number }[] {
    const layers: Phaser.GameObjects.Sprite[] = [e.sprite];
    e.gear?.each((g) => layers.push(g));
    const s = e.sprite, W = s.frame.cutWidth, H = s.frame.cutHeight;
    const grid = new Map<number, number>(); // texel -> colour, the top layer wins
    for (const l of layers) {
      const data = this.frameData(l.texture.key, l.frame.name);
      if (!data || data.w !== W || data.h !== H) continue;
      for (let i = 0; i < W * H; i++) if (data.px[i * 4 + 3] > 140) grid.set(i, (data.px[i * 4] << 16) | (data.px[i * 4 + 1] << 8) | data.px[i * 4 + 2]);
    }
    const out: { dx: number; dy: number; h: number; c: number }[] = [];
    const sx = s.scaleX * (s.flipX ? -1 : 1), sy = s.scaleY;
    for (const [i, c] of grid) {
      const px = i % W, py = Math.floor(i / W);
      const dy = (py + 0.5 - s.originY * H) * sy;
      out.push({ dx: (px + 0.5 - s.originX * W) * sx, dy, h: Math.max(0, -dy), c });
    }
    return out;
  }

  private frames = new Map<string, { w: number; h: number; px: Uint8ClampedArray } | null>();
  /** The RGBA texels of one texture frame (cached). */
  private frameData(key: string, name: string | number) {
    const id = `${key}#${name}`;
    if (this.frames.has(id)) return this.frames.get(id);
    let res: { w: number; h: number; px: Uint8ClampedArray } | null = null;
    try {
      const f = this.scene.textures.getFrame(key, name);
      const img = f?.source?.image as CanvasImageSource | undefined;
      if (f && img) {
        const c = document.createElement("canvas");
        c.width = f.cutWidth; c.height = f.cutHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
        res = { w: f.cutWidth, h: f.cutHeight, px: ctx.getImageData(0, 0, f.cutWidth, f.cutHeight).data };
      }
    } catch { res = null; } // a tainted or missing image: no pixels, the mist alone still plays
    if (this.frames.size > 400) this.frames.clear();
    this.frames.set(id, res);
    return res;
  }

  /**
   * Mist Form: the vampire comes apart into mist, top first, pixel by pixel; each grain pales into the mist colour
   * and swirls off into a rolling cloud. A ribbon of mist drifts along his path, the mist gathers again where he
   * lands and he is rebuilt from it, feet first. The cloud he left keeps rolling a moment, then thins away.
   */
  private mistForm(ev: any, e?: FxEntity) {
    const { fx, fy, x, y } = ev;
    const MIST = [0xc9c2d9, 0xa99fc0, 0x8a80a8, 0xe0dbea, 0x6f6690];
    const shape = e ? this.heroPixels(e) : [];
    const H = shape.reduce((m, q) => Math.max(m, q.h), 1);
    const depth = e ? e.sprite.depth : DEPTH - 1;
    const mix = (a: number, b: number, k: number) => {
      const ch = (sh: number) => Math.round(((a >> sh) & 255) + (((b >> sh) & 255) - ((a >> sh) & 255)) * k);
      return (ch(16) << 16) | (ch(8) << 8) | ch(0);
    };
    const px = Math.max(1, e ? Math.abs(e.sprite.scaleX) : 1);

    // 1. Dissolve where he stood (a copy of him, as he is drawn now)
    if (shape.length) {
      const g = this.scene.add.graphics().setDepth(depth).setPosition(fx, fy);
      const grains = shape.map((q) => {
        const a = Math.atan2(q.dy + H * 0.5, q.dx) + rnd(-0.6, 0.6);
        return { ...q, at: (1 - q.h / H) * MIST_DISSOLVE_MS * 0.55 + rnd(0, MIST_DISSOLVE_MS * 0.3), life: rnd(240, 380),
          vx: Math.cos(a) * rnd(8, 22) + rnd(-6, 6), vy: -rnd(10, 26), sw: rnd(-1, 1), m: pick(MIST), puff: Math.random() < 0.06 };
      });
      const t0 = this.t;
      this.emit(MIST_DISSOLVE_MS + 420, 16, () => {
        const t = this.t - t0;
        g.clear();
        for (const q of grains) {
          const k = (t - q.at) / q.life;
          if (k >= 1) continue;
          if (k <= 0) { g.fillStyle(q.c, 1).fillRect(q.dx - px / 2, q.dy - px / 2, px, px); continue; }
          if (q.puff && k > 0.5) { q.puff = false; this.mistPuff(fx + q.dx * 0.6, fy + 2, fx, fy, rnd(900, 1400), 0.8); }
          const s = k * q.life / 1000, sw = Math.sin(k * Math.PI * 1.5) * 5 * q.sw;
          g.fillStyle(mix(q.c, q.m, Math.min(1, k * 2.2)), 1 - k * k)
            .fillRect(q.dx + q.vx * s + sw - px / 2, q.dy + q.vy * s - px / 2, px, px);
        }
      });
      this.scene.time.delayedCall(MIST_DISSOLVE_MS + 460, () => g.destroy());
    }
    // the cloud swells as he comes apart, then keeps rolling where he stood (the chilling mist that hurts)...
    const t0 = this.t;
    // (it builds up from his feet as the grains drift off, so he is still seen coming apart at first)
    this.emit(MIST_DISSOLVE_MS, 30, () => {
      const k = (this.t - t0) / MIST_DISSOLVE_MS;
      for (let i = 0; i < Math.round(k * 5); i++) { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 16; this.mistPuff(fx + Math.cos(a) * d, fy + Math.sin(a) * d * 0.7 + 3, fx, fy, rnd(900, 1400), 0.6 + k * 0.6); }
    });
    this.glow(fx, fy, 10, 16, 0x9575cd, 360, 0.35);
    // ...and lingers a moment, thinning out, before it is gone
    this.emit(MIST_LINGER_MS, 50, () => {
      const k = (this.t - t0) / MIST_LINGER_MS, n = k < 0.45 ? 3 : Math.random() < 1.6 * (1 - k) ? 1 : 0;
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 22; this.mistPuff(fx + Math.cos(a) * d, fy + Math.sin(a) * d * 0.7, fx, fy, rnd(1000, 1600), 1 - k * 0.3); }
    });

    // 2. The path: a ribbon of mist drifting from there to here
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, qx = fx + (x - fx) * t, qy = fy + (y - fy) * t;
      this.scene.time.delayedCall(MIST_DISSOLVE_MS * 0.5 + i * 18, () => { for (let k = 0; k < 3; k++) this.mistPuff(qx + rnd(-4, 4), qy + rnd(-3, 3), qx, qy, rnd(600, 1000), 0.85); });
    }

    // 3. Reform: the mist gathers where he lands and he is rebuilt from it, feet first
    const reformAt = MIST_REFORM_AT_MS - 140;
    this.scene.time.delayedCall(reformAt, () => {
      for (let i = 0; i < 18; i++) { const a = Math.random() * Math.PI * 2, d = rnd(10, 20); this.mistPuff(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, x, y, rnd(500, 800), 0.9); }
    });
    if (shape.length) this.scene.time.delayedCall(MIST_REFORM_AT_MS, () => {
      // rebuilt into the pose he shows when he appears (his hidden frame by now), else the one he left in
      const me = e && this.ent(ev.id);
      const now = me ? this.heroPixels(me) : [];
      const to = now.length ? now : shape, H2 = to.reduce((m, q) => Math.max(m, q.h), 1);
      const g = this.scene.add.graphics().setDepth(me ? me.sprite.depth + 0.5 : depth).setPosition(x, y);
      const grains = to.map((q) => {
        const a = Math.random() * Math.PI * 2, d = rnd(8, 20);
        return { ...q, at: (q.h / H2) * MIST_REFORM_MS * 0.45 + rnd(0, MIST_REFORM_MS * 0.2), life: rnd(140, 220),
          ox: Math.cos(a) * d, oy: Math.sin(a) * d * 0.6 + rnd(0, 6), m: pick(MIST) };
      });
      const t1 = this.t, ms = MIST_REVEAL_MS - MIST_REFORM_AT_MS;
      this.emit(ms, 16, () => {
        const t = this.t - t1;
        g.clear();
        for (const q of grains) {
          const k = Math.min(1, (t - q.at) / q.life);
          if (k <= 0) continue;
          const ease = 1 - (1 - k) * (1 - k), sw = (1 - ease);
          g.fillStyle(mix(q.m, q.c, ease), 0.35 + 0.65 * ease)
            .fillRect(q.dx + q.ox * sw - px / 2, q.dy + q.oy * sw - px / 2, px, px);
        }
      });
      this.scene.time.delayedCall(ms + 20, () => g.destroy());
    });
    else this.scene.time.delayedCall(MIST_REFORM_AT_MS, () => this.glow(x, y, 8, 12, 0xb39ddb, 260, 0.5));
    // a few wisps stay round his feet a moment after he is whole again
    this.scene.time.delayedCall(MIST_REVEAL_MS - 60, () => {
      const t2 = this.t;
      this.emit(900, 70, () => {
        if (Math.random() > 1.2 * (1 - (this.t - t2) / 900)) return;
        const a = Math.random() * Math.PI * 2, d = rnd(6, 14);
        this.mistPuff(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, x, y, rnd(800, 1200), 0.75);
      });
    });
  }

  private smoke(x: number, y: number, r: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      this.p(x + Math.cos(a) * d, y + Math.sin(a) * d, rnd(0, 10), pick([0x9e9e9e, 0x757575, 0xbdbdbd, 0x616161]), {
        vx: rnd(-6, 6), vy: rnd(-6, 6), vz: rnd(2, 8), life: rnd(900, 1400), size: pick([4, 5, 6]), size1: 8, alpha: 0.35, add: false, depth: DEPTH - 1,
      });
    }
  }

  // ---- ground effects (room state "fields") ---------------------------------------------------------------

  addField(id: string, f: any) {
    const objs: Phaser.GameObjects.GameObject[] = [];
    const k = f.kind as string;
    if (k === "bloodlink") {
      // Blood Link: the cord is redrawn every frame between the vampire and his victim (tickFields)
      objs.push(this.scene.add.graphics().setDepth(DEPTH - 2));
      this.ring(f.x, f.y, 14, "blood", 14, { life: 300, up: 10 });
      // The cord lashes out: a whip of blood shoots from the vampire into the victim and bursts out of it
      const o = this.ent(f.owner), t = f.target ? this.ent(f.target) : undefined;
      if (o && t) {
        const x0 = o.sprite.x, y0 = o.sprite.y, z0 = o.top * 0.55, x1 = t.sprite.x, y1 = t.sprite.y, z1 = t.top * 0.5, T = 0.14;
        for (let i = 0; i < 16; i++) {
          const k = i / 16;
          this.p(x0, y0, z0, pick(PALETTE.blood.slice(0, 4)), { vx: (x1 - x0) / T, vy: (y1 - y0) / T, vz: (z1 - z0) / T, life: T * 1000 * (0.4 + k * 0.6), size: 2, size1: 1, add: false });
        }
        this.scene.time.delayedCall(T * 1000, () => { const v = this.ent(f.target); if (v) { this.burst(v.sprite.x, v.sprite.y, v.top * 0.5, "blood", 18, 70, 380); this.glow(v.sprite.x, v.sprite.y, v.top * 0.5, 12, 0xe63946, 260, 0.7); } });
      }
    } else if (k === "gravesoil") {
      // Native Soil: a patch of dark grave earth spilled on the ground, clods and a few bone chips
      const g = this.scene.add.graphics().setPosition(f.x + 0.01, f.y + 0.01).setDepth(GROUND_DEPTH);
      const sq = ISO ? 0.5 : 0.7;
      g.fillStyle(0x1b120d, 0.75).fillEllipse(0, 0, f.r * 2, f.r * 2 * sq);
      g.fillStyle(0x2e1f16, 0.8).fillEllipse(0, 0, f.r * 1.6, f.r * 1.6 * sq);
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * f.r * 0.85;
        const px = Math.round(Math.cos(a) * d), py = Math.round(Math.sin(a) * d * sq);
        g.fillStyle(pick([0x3e2a1d, 0x4a3324, 0x24170f])).fillRect(px, py, pick([2, 2, 3]), pick([1, 2]));
      }
      g.fillStyle(0xd8d0b8);
      for (let i = 0; i < 4; i++) { const a = Math.random() * Math.PI * 2, d = rnd(4, f.r * 0.7); g.fillRect(Math.round(Math.cos(a) * d), Math.round(Math.sin(a) * d * sq), 2, 1); }
      objs.push(g);
      this.rise(f.x, f.y, f.r * 0.8, "shadow", 16, 20, 700);
    } else if (k === "beartrap" || k === "firetrap" || k === "sentry" || k === "caltrops") {
      const g = this.scene.add.graphics().setPosition(f.x + 0.01, f.y + 0.01).setDepth(f.y - 1);
      if (k === "beartrap") {
        // Iron jaws, open
        g.fillStyle(0x37474f).fillEllipse(0, 0, 18, 8);
        g.fillStyle(0x263238).fillEllipse(0, 0, 10, 4);
        g.fillStyle(0xb0bec5);
        for (let i = -3; i <= 3; i++) { g.fillTriangle(i * 2.4 - 1, -3, i * 2.4 + 1, -3, i * 2.4, -6); g.fillTriangle(i * 2.4 - 1, 3, i * 2.4 + 1, 3, i * 2.4, 5); }
      } else if (k === "firetrap") {
        g.fillStyle(0x4e342e).fillEllipse(0, 0, 14, 6);
        g.fillStyle(0x6d4c41).fillEllipse(0, -1, 10, 4);
      } else if (k === "sentry") {
        // A carved wooden totem with a glowing eye
        g.fillStyle(0x000000, 0.3).fillEllipse(0, 1, 12, 4);
        g.fillStyle(0x5d4037).fillRect(-4, -22, 8, 22);
        g.fillStyle(0x795548).fillRect(-3, -22, 2, 22);
        g.fillStyle(0x3e2723).fillRect(-5, -24, 10, 3).fillRect(-6, -10, 12, 2);
        g.fillStyle(0x8d6e63).fillTriangle(-6, -24, 0, -30, 6, -24);
        g.fillStyle(0x1b0f0a).fillRect(-2, -17, 4, 3);
        const eye = this.scene.add.image(f.x, f.y, "fx_glow").setTint(0x9ccc65).setBlendMode(Phaser.BlendModes.ADD).setScale(0.35).setDepth(DEPTH);
        (eye as any).__eye = true;
        objs.push(eye);
      } else {
        // Caltrops: little iron spikes scattered
        for (let i = 0; i < 18; i++) {
          const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * f.r;
          const px = Math.cos(a) * d, py = Math.sin(a) * d * (ISO ? 0.5 : 0.8);
          g.fillStyle(0x90a4ae).fillRect(px - 1, py, 3, 1).fillRect(px, py - 2, 1, 3);
          g.fillStyle(0xeceff1).fillRect(px, py - 2, 1, 1);
        }
      }
      objs.push(g);
    }
    this.fields.set(id, { f, objs, born: this.t });
  }

  removeField(id: string) {
    const v = this.fields.get(id);
    if (!v) return;
    const f = v.f;
    if (f.kind === "bloodlink") {
      // The cord snaps: a spray of blood where it was
      const o = this.ent(f.owner), t = this.ent(f.target);
      if (o && t) this.burst((o.sprite.x + t.sprite.x) / 2, (o.sprite.y + t.sprite.y) / 2, 14, "blood", 14, 60, 360);
    }
    if (f.kind === "beartrap") {
      // Snap!
      this.burst(f.x, f.y, 2, "steel", 14, 60, 300);
      this.glow(f.x, f.y, 4, 14, 0xffffff, 150, 0.8);
    }
    for (const o of v.objs) o.destroy();
    this.fields.delete(id);
  }

  private tickFields(dt: number) {
    for (const { f, objs, born } of this.fields.values()) {
      // A field that moves with its caster (Blizzard, auras) is drawn on the caster's sprite: the synced position lags
      // behind a walking hero, so the storm trailed off-centre
      const o = f.follow ? this.ent(f.owner) : undefined;
      const x = o ? o.sprite.x : f.x, y = o ? o.sprite.y : f.y, r = f.r;
      const area = Math.max(1, (r * r) / 900); // particle rate scales with size
      const chance = (perSec: number) => Math.random() < perSec * dt;
      const n = (perSec: number) => { let c = Math.floor(perSec * dt); if (Math.random() < perSec * dt - c) c++; return c; };
      const s = skillById(f.skill), tier = TIER[s?.row ?? 0];
      switch (f.kind) {
        case "consecrate": case "sacred":
          this.rise(x, y, r, "holy", n(18 * area * tier), 24, 900);
          if (chance(3)) this.glow(x + rnd(-r, r) * 0.5, y + rnd(-r, r) * 0.5, 0, r * 0.5, 0xffd166, 700, 0.25, true);
          if (f.kind === "sacred") {
            // Orbiting motes around the knight
            const a = this.t / 300;
            for (let i = 0; i < 3; i++) { const b = a + (i * Math.PI * 2) / 3; this.p(x + Math.cos(b) * r * 0.5, y + Math.sin(b) * r * 0.5, 10, 0xfff3b0, { life: 260, size: 2, size1: 0 }); }
          }
          break;
        case "smoke": this.smoke(x, y, r, n(14 * area)); break;
        case "fire":
          for (let i = 0; i < n(40 * area); i++) {
            const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
            this.p(x + Math.cos(a) * d, y + Math.sin(a) * d, 0, pick(PALETTE.fire), { vz: rnd(25, 55), vx: rnd(-5, 5), life: rnd(300, 600), size: pick([1, 2, 2, 3]), size1: 0 });
          }
          if (chance(4 * area)) this.smoke(x, y, r * 0.7, 1);
          if (chance(4)) this.glow(x + rnd(-r, r) * 0.4, y + rnd(-r, r) * 0.4, 2, r * 0.6, 0xff7b00, 500, 0.3, true);
          break;
        case "caltrops": if (chance(3)) this.p(x + rnd(-r, r) * 0.7, y + rnd(-r, r) * 0.5, 1, 0xffffff, { life: 200, size: 1 }); break;
        case "frostwhirl": {
          // The wizard's Blizzard (Murat 2026-11-07): a storm turning round the hero. Three spiral arms of snow and ice
          // sweep round (the arms rotate, each flake is thrown along the turn), fast flakes whip round the rim.
          const spin = this.t / 260;
          for (let i = 0; i < n(210 * area); i++) { // denser (Murat 2026-11-08); still capped by the particle pool
            const arm = Math.floor(Math.random() * 3), u = Math.random();
            const d = r * (0.25 + 0.75 * u), a = spin + arm * (Math.PI * 2 / 3) + u * 2.2 + rnd(-0.18, 0.18);
            const ca = Math.cos(a), sa = Math.sin(a), sp = 70 + 60 * u; // outer flakes move faster
            this.p(x + ca * d, y + sa * d, rnd(4, 26), pick([0xffffff, 0xd6f6ff, 0xa2e8ff, 0x4cc9f0]), { vx: -sa * sp, vy: ca * sp, vz: rnd(-10, 10), life: rnd(260, 460), size: pick([1, 2, 2, 3]), size1: 1, add: true });
          }
          // a white haze of driven snow inside the storm (soft, not additive: it whitens the ground under it)
          for (let i = 0; i < n(26 * area); i++) {
            const a = spin + Math.random() * Math.PI * 2, d = r * Math.sqrt(Math.random()) * 0.95, ca = Math.cos(a), sa = Math.sin(a);
            this.p(x + ca * d, y + sa * d, rnd(2, 20), pick([0xffffff, 0xe8f8ff, 0xcfefff]), { vx: -sa * 60, vy: ca * 60, life: rnd(380, 600), size: pick([3, 4]), size1: 5, alpha: 0.28, add: false });
          }
          // ice shards whipped round in the wind
          for (let i = 0; i < n(18 * area); i++) {
            const a = Math.random() * Math.PI * 2, d = r * rnd(0.4, 1), ca = Math.cos(a), sa = Math.sin(a);
            this.p(x + ca * d, y + sa * d, rnd(6, 24), pick([0xa2e8ff, 0x4cc9f0, 0xffffff]), { vx: -sa * 150, vy: ca * 150, vz: rnd(-20, 20), life: rnd(240, 380), size: 2, size1: 1, add: false });
          }
          for (let i = 0; i < n(70 * area); i++) { // the rim: a fast white ring
            const a = Math.random() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
            this.p(x + ca * r, y + sa * r, rnd(2, 18), 0xe8f8ff, { vx: -sa * 150, vy: ca * 150, life: 220, size: 2, size1: 0, add: true });
          }
          if (chance(14)) this.glow(x, y, 6, r * 1.05, 0xa2e8ff, 450, 0.35, true);
          for (let i = 0; i < n(12); i++) this.ice(x + rnd(-r, r) * 0.6, y + rnd(-r, r) * 0.6, r * 0.4);
          break;
        }
        case "blizzard":
          for (let i = 0; i < n(50 * area); i++) {
            const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
            this.p(x + Math.cos(a) * d - 15, y + Math.sin(a) * d, 70, pick(PALETTE.frost), { vx: 25, vz: -rnd(80, 120), life: 650, size: pick([1, 1, 2]), add: false });
          }
          if (chance(6)) this.ice(x, y, r);
          if (chance(5)) this.glow(x + rnd(-r, r) * 0.5, y + rnd(-r, r) * 0.5, 0, r * 0.7, 0xa2e8ff, 900, 0.2, true);
          break;
        case "static":
          for (let i = 0; i < n(14); i++) {
            const a = Math.random() * Math.PI * 2, d = rnd(6, 14);
            this.p(x + Math.cos(a) * d, y + Math.sin(a) * d, rnd(4, 22), pick(PALETTE.lightning), { life: 120, size: 1 });
          }
          if (chance(4)) { const a = Math.random() * Math.PI * 2; this.bolt(x, y, 14, x + Math.cos(a) * 16, y + Math.sin(a) * 16, rnd(0, 20), PALETTE.lightning, 1, 80); }
          break;
        case "storm":
          // Storm clouds overhead, and rain
          for (let i = 0; i < n(20); i++) {
            const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
            this.p(x + Math.cos(a) * d, y + Math.sin(a) * d, rnd(110, 130), pick([0x37474f, 0x455a64, 0x263238, 0x546e7a]), { vx: rnd(-6, 6), life: rnd(900, 1300), size: pick([6, 8, 10]), size1: 10, alpha: 0.55, add: false, depth: DEPTH + 4 });
          }
          for (let i = 0; i < n(60 * area); i++) {
            const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
            this.p(x + Math.cos(a) * d, y + Math.sin(a) * d, 110, 0x90caf9, { vz: -260, life: 420, size: 1, alpha: 0.6 });
          }
          break;
        case "beartrap": if (chance(1.5)) this.p(x + rnd(-6, 6), y + rnd(-2, 2), 4, 0xffffff, { life: 200 }); break;
        case "firetrap":
          if (chance(4)) this.p(x + rnd(-3, 3), y, 2, pick(PALETTE.fire), { vz: 20, life: 400, size: 1, size1: 0 });
          if (chance(1.2)) this.glow(x, y, 2, 6, 0xff3d00, 400, 0.6);
          break;
        case "sentry": {
          const eye = objs.find((o) => (o as any).__eye) as Phaser.GameObjects.Image | undefined;
          if (eye) { const [lx, ly] = lift(16); eye.setPosition(x + lx, y + ly).setScale(0.3 + 0.08 * Math.sin(this.t / 120)); }
          if (chance(3)) this.p(x + rnd(-2, 2), y, 16, 0x9ccc65, { vz: 15, life: 500, size: 1, size1: 0 });
          if (this.t - born < 300) this.rise(x, y, 10, "nature", 3, 30, 500);
          break;
        }
        case "whirlwind": {
          // A spinning vortex of steel and blood around the barbarian
          const a = this.t / 60;
          for (let i = 0; i < 6; i++) {
            const b = a + (i * Math.PI * 2) / 6, rr = r * rnd(0.5, 0.95);
            this.p(x + Math.cos(b) * rr, y + Math.sin(b) * rr, rnd(2, 18), pick(i % 2 ? PALETTE.blood : PALETTE.steel), { vx: -Math.sin(b) * 120, vy: Math.cos(b) * 120, life: 140, size: pick([1, 2]), size1: 0 });
          }
          if (chance(10)) this.ring(x, y, r * 0.7, "earth", 3, { life: 300, add: false });
          break;
        }
        case "bloodlink": {
          const g = objs[0] as Phaser.GameObjects.Graphics | undefined;
          const o = this.ent(f.owner), tg = f.target ? this.ent(f.target) : undefined;
          if (!g) break;
          g.clear();
          if (!o || !tg) break;
          // From the victim's chest to the vampire's, sagging a little; a darker sheath with a pulsing bright core
          const [ol, om] = lift(o.top * 0.55), [tl, tm] = lift(tg.top * 0.5);
          const x0 = tg.sprite.x + tl, y0 = tg.sprite.y + tm, x1 = o.sprite.x + ol, y1 = o.sprite.y + om;
          const len = Math.hypot(x1 - x0, y1 - y0), sag = Math.min(14, len * 0.12);
          const at = (u: number): [number, number] => [x0 + (x1 - x0) * u + Math.sin(u * 9 + this.t / 90) * 0.8, y0 + (y1 - y0) * u - Math.sin(u * Math.PI) * sag]; // arches up like the stream of drops
          const SEG = Math.max(6, Math.round(len / 5));
          const beat = 0.5 + 0.5 * Math.sin(this.t / 110);
          // drawn in whole pixel blocks (no smooth lines): a dark sheath, a red body and a core that throbs
          const steps = Math.max(8, Math.round(len));
          for (let i = 0; i <= steps; i++) {
            const [px, py] = at(i / steps), qx = Math.round(px), qy = Math.round(py);
            g.fillStyle(0x4a0000, 0.8).fillRect(qx - 1, qy - 1, 3, 3);
          }
          for (let i = 0; i <= steps; i++) {
            const [px, py] = at(i / steps), qx = Math.round(px), qy = Math.round(py);
            const wave = Math.sin(i / steps * 14 - this.t / (f.ally ? -60 : 60)); // bulges running along it toward the drinker
            g.fillStyle(wave > 0.6 ? 0xff5252 : 0xb71c1c, 1).fillRect(qx, qy - (wave > 0.6 ? 1 : 0), wave > 0.6 ? 2 : 1, wave > 0.6 ? 2 : 1);
            if (wave > 0.9 && beat > 0.5) g.fillStyle(0xffcdd2, 1).fillRect(qx, qy - 1, 1, 1);
          }
          // Blood torn out of the victim flies to the vampire in a steady arcing stream, as in Exsanguinate
          // (Transfusion: it runs the other way, out of the vampire into the ally)
          const [src, dst] = f.ally ? [o, tg] : [tg, o];
          const sx = src.sprite.x, sy = src.sprite.y, sz = src.top * 0.5, dx = dst.sprite.x, dy = dst.sprite.y, dz = dst.top * 0.55;
          const G = 260;
          const drop = (big: boolean) => {
            const T = rnd(0.3, 0.42) * (big ? 0.9 : 1), x0 = sx + rnd(-3, 3), y0 = sy + rnd(-2, 2), z0 = sz + rnd(-3, 3);
            this.p(x0, y0, z0, pick(big ? PALETTE.blood.slice(1, 4) : PALETTE.blood.slice(1, 5)), {
              vx: (dx - x0) / T, vy: (dy - y0) / T, vz: (dz - z0 + (G * T * T) / 2) / T, g: G, life: T * 1000,
              size: big ? pick([3, 3, 4]) : pick([2, 2, 3]), size1: big ? 2 : 1.5, add: false });
          };
          for (let i = n(140); i > 0; i--) drop(false);
          // Each pulse of the link (a hit) gulps a thick spurt out of the source, and the drinker flares as it lands
          const pulse = Math.floor((this.t - born) / (f.tickMs || 300));
          if (pulse !== this.linkPulse.get(f)) {
            this.linkPulse.set(f, pulse);
            for (let i = 0; i < 10; i++) drop(true);
            this.burst(sx, sy, sz, "blood", 6, 45, 300);
            this.glow(sx, sy, sz, 7, 0xb71c1c, 220, 0.5);
            this.scene.time.delayedCall(330, () => { const d = this.ent(f.ally ? f.target : f.owner); if (d) this.glow(d.sprite.x, d.sprite.y, d.top * 0.55, 10, 0xe63946, 240, 0.55); });
          }
          // a small red vortex round the drinker, where the stream pours in
          const va = this.t / 70;
          for (let i = 0; i < n(40); i++) {
            const bb = va + rnd(0, Math.PI * 2), rr = rnd(6, 10);
            this.p(dx + Math.cos(bb) * rr, dy + Math.sin(bb) * rr * 0.6, rnd(dz * 0.4, dz * 1.3), pick(PALETTE.blood), { vx: -Math.sin(bb) * 60, vy: Math.cos(bb) * 34, vz: rnd(5, 20), life: 200, size: pick([1, 2]), size1: 0 });
          }
          if (chance(10)) { const [px, py] = at(Math.random()); this.p(px, py, 0, pick(PALETTE.blood.slice(2, 5)), { vy: 18, g: 0, life: 300, size: 1, size1: 0, add: false }); }
          break;
        }
        case "bloodward": {
          // Sanguine Ward: a shell of hardened blood turning round the vampire, glinting
          const a = this.t / 160;
          for (let i = 0; i < 8; i++) {
            const b = a + (i * Math.PI * 2) / 8, z = 6 + ((i % 3) * 7);
            this.p(x + Math.cos(b) * 13, y + Math.sin(b) * 13 * 0.6, z, i % 2 ? 0xb71c1c : 0x6d0000, { life: 60, size: 2, size1: 2, add: false });
          }
          if (chance(6)) this.p(x + rnd(-10, 10), y + rnd(-4, 4), rnd(4, 22), 0xffcdd2, { life: 140, size: 1, size1: 0 });
          if (chance(3)) this.glow(x, y, 12, 14, 0xb71c1c, 260, 0.3);
          break;
        }
        case "batring": {
          // Bats left behind whirl round the vampire as a living shield
          const a = this.t / 180;
          for (let i = 0; i < 5; i++) {
            const b = a + (i * Math.PI * 2) / 5, rr = r * (0.75 + 0.2 * Math.sin(this.t / 90 + i)), z = 10 + 6 * Math.sin(this.t / 70 + i * 2);
            const flap = Math.abs(Math.sin(this.t / 30 + i)) > 0.5 ? 3 : 1;
            const bx = x + Math.cos(b) * rr, by = y + Math.sin(b) * rr * 0.6;
            this.p(bx, by, z, 0x1a1033, { life: 50, size: flap, size1: flap, add: false });
            this.p(bx, by, z + 1, 0xff2d2d, { life: 50, size: 1, size1: 1, add: false });
          }
          break;
        }
        case "gravesoil": {
          // Grave dust and pale motes of the dead rising from the earth; red ones run into the vampire standing on it
          if (chance(10 * area)) this.p(x + rnd(-r, r) * 0.8, y + rnd(-r, r) * 0.4, 0, pick([0x4a3324, 0x5d4037, 0x3e2a1d]), { vz: rnd(6, 14), life: rnd(500, 800), size: 2, size1: 3, alpha: 0.5, add: false, depth: GROUND_DEPTH + 1 });
          if (chance(6 * area)) this.p(x + rnd(-r, r) * 0.7, y + rnd(-r, r) * 0.35, 1, pick([0xd1c4e9, 0x9575cd]), { vz: rnd(12, 24), life: rnd(600, 900), size: 1, size1: 0 });
          const me = this.ent(f.owner);
          if (me && Math.hypot(me.sprite.x - x, me.sprite.y - y) <= r && chance(8)) this.p(me.sprite.x + rnd(-6, 6), me.sprite.y + rnd(-2, 2), 0, pick(PALETTE.blood.slice(1, 4)), { vz: rnd(20, 40), life: 400, size: 1, size1: 0 });
          break;
        }
        case "nightfall": {
          // A starless dark settles on the ground; motes of blood rise from it toward the caster
          for (let i = 0; i < n(40 * area); i++) {
            const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
            this.p(x + Math.cos(a) * d, y + Math.sin(a) * d, rnd(0, 4), pick([0x07040e, 0x140b2b, 0x1a1033, 0x311b92]), { vx: rnd(-4, 4), vy: rnd(-4, 4), vz: rnd(1, 4), life: rnd(700, 1100), size: pick([4, 5, 6]), size1: 7, alpha: 0.5, add: false, depth: GROUND_DEPTH });
          }
          for (let i = 0; i < n(10 * area); i++) {
            const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
            this.p(x + Math.cos(a) * d, y + Math.sin(a) * d, 1, pick(PALETTE.blood.slice(1, 4)), { vz: rnd(15, 30), life: rnd(500, 800), size: 1, size1: 0 });
          }
          // ...and a cold fog rolling low over it
          for (let i = 0; i < n(8 * area); i++) {
            const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
            this.p(x + Math.cos(a) * d, y + Math.sin(a) * d, rnd(2, 8), pick([0x9e9eb8, 0xbdbdd0, 0x7e7e98]), { vx: rnd(-8, 8), vy: rnd(-3, 3), life: rnd(1200, 1800), size: pick([6, 8]), size1: 10, alpha: 0.18, add: false, depth: DEPTH - 1 });
          }
          if (this.t - born < 400) this.ring(x, y, r, "shadow", 20, { life: 500, up: 6, add: false });
          break;
        }
        case "drums": {
          // A beat every 0.8 s: a pulse of spirit light
          const beat = Math.floor((this.t - born) / 800), last = (f as any).__beat ?? -1;
          if (beat !== last) { (f as any).__beat = beat; this.ring(x, y, r, "spirit", 24, { life: 420, up: 4 }); this.glow(x, y, 2, r * 0.6, 0x4dd0e1, 300, 0.35, true); }
          if (chance(8)) this.rise(x, y, r * 0.5, "spirit", 1, 26, 700);
          break;
        }
      }
    }
  }

  /**
   * How much a Nightfall near (x, y) darkens the world (0..1): it is night there while it lasts, fading in and out.
   * TownScene feeds it to the day/night tint (client/src/details.ts nightOverride).
   */
  nightK(x: number, y: number): number {
    let k = 0;
    for (const { f, born } of this.fields.values()) {
      if (f.kind !== "nightfall") continue;
      const age = this.t - born, left = f.ms - age;
      if (left <= 0) continue;
      const fade = Math.min(1, age / 700, left / 900);
      const d = Math.hypot(x - f.x, y - f.y), edge = f.r + 140;
      if (d < edge) k = Math.max(k, fade * Math.min(1, (edge - d) / 120));
    }
    return k;
  }

  // ---- projectiles --------------------------------------------------------------------------------------

  /** Visual for a skill projectile, or undefined to let the scene draw a basic one. */
  addShot(id: string, s: any): (Phaser.GameObjects.GameObject & { x: number; y: number; setPosition(x: number, y: number): any }) | undefined {
    const look = s.kind as string;
    const size = s.size || 1;
    const ang = Math.atan2(s.vy ?? 0, s.vx ?? 1);
    const deg = ang * 180 / Math.PI;
    let g: any;
    const glow = (tint: number, sc: number) => this.scene.add.image(s.x, s.y, "fx_glow").setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(sc).setDepth(DEPTH);
    switch (look) {
      case "shuriken": {
        g = this.scene.add.graphics().setPosition(s.x, s.y).setDepth(DEPTH);
        g.fillStyle(0xdfe6f0).fillTriangle(-4, 0, 0, -1, 0, 1).fillTriangle(4, 0, 0, -1, 0, 1).fillTriangle(0, -4, -1, 0, 1, 0).fillTriangle(0, 4, -1, 0, 1, 0);
        g.fillStyle(0x37474f).fillRect(-0.5, -0.5, 1, 1);
        break;
      }
      case "net": {
        g = this.scene.add.graphics().setPosition(s.x, s.y).setDepth(DEPTH);
        g.lineStyle(1, 0xa1887f);
        for (let i = -4; i <= 4; i += 2) { g.lineBetween(i, -4, i, 4); g.lineBetween(-4, i, 4, i); }
        g.fillStyle(0x5d4037).fillRect(-5, -5, 2, 2).fillRect(3, -5, 2, 2).fillRect(-5, 3, 2, 2).fillRect(3, 3, 2, 2);
        break;
      }
      case "powerarrow": case "frostarrow": {
        g = this.scene.add.rectangle(s.x, s.y, 10 * size, 1.5 * size, look === "frostarrow" ? 0xd6f6ff : 0xfffbe0).setAngle(deg).setDepth(DEPTH);
        break;
      }
      case "lightning": g = glow(0xb3ecff, 0.45); break;
      case "dragon": g = glow(0xff9f1c, 0.8 * size); break;
      case "phoenix": g = glow(0xffb347, 0.7 * size); break;
      case "inferno": g = glow(0xff7b00, 0.55 * size); break;
      case "flamewave": g = glow(0xff9f1c, 0.4 * size); break;
      case "iceshard": {
        g = this.scene.add.graphics().setPosition(s.x, s.y).setDepth(DEPTH).setAngle(deg);
        g.fillStyle(0xa2e8ff).fillTriangle(-4, -1.5, -4, 1.5, 4, 0);
        g.fillStyle(0xffffff).fillTriangle(-2, -0.5, -2, 0.5, 4, 0);
        break;
      }
      case "frozenorb": {
        // A ball of frozen magic: cold glow, pale shell, white heart, and a few ice spikes that turn (tickShots)
        const d = this.scene.add.graphics();
        for (let k = 0; k < 6; k++) {
          const a = k * Math.PI / 3, c = Math.cos(a), sn = Math.sin(a), L = 5.5 * size, w = 0.9 * size;
          d.fillStyle(0x4cc9f0).fillTriangle(c * L, sn * L, -sn * w, c * w, sn * w, -c * w);
        }
        d.fillStyle(0x2a6fdb).fillCircle(0, 0, 3.4 * size).fillStyle(0x8be9ff).fillCircle(0, 0, 2.7 * size)
          .fillStyle(0xd6f6ff).fillCircle(-0.5 * size, -0.5 * size, 1.6 * size).fillStyle(0xffffff).fillCircle(-0.8 * size, -0.8 * size, 0.7 * size);
        g = this.scene.add.container(s.x, s.y, [glow(0x8be9ff, 0.5 * size).setPosition(0, 0), d]).setDepth(DEPTH);
        break;
      }
      case "arcane": g = glow(0xc77dff, 0.3 * size); break;
      case "bloodbolt": {
        // A clot of dark blood with a bright wet heart, wobbling as it flies (tickShots leaves the drips)
        const d = this.scene.add.graphics();
        d.fillStyle(0x6d0000).fillCircle(0, 0.3, 3.1 * size).fillStyle(0xb71c1c).fillCircle(0, 0, 2.6 * size)
          .fillStyle(0xe63946).fillCircle(-0.4 * size, -0.4 * size, 1.6 * size).fillStyle(0xffcdd2).fillRect(-1.2 * size, -1.3 * size, 0.9, 0.9);
        g = this.scene.add.container(s.x, s.y, [glow(0xb71c1c, 0.32 * size).setPosition(0, 0).setAlpha(0.6), d]).setDepth(DEPTH);
        break;
      }
      case "bloodlance": {
        // A spear of dark, set blood: a long shaft with a bright wet point, drawn along the flight
        const d = this.scene.add.graphics();
        d.fillStyle(0x4a0000).fillRect(-9, -1, 12, 2);
        d.fillStyle(0x9b1b1b).fillRect(-8, -0.5, 11, 1);
        d.fillStyle(0xe63946).fillTriangle(3, -2.2, 3, 2.2, 9, 0);
        d.fillStyle(0xffcdd2).fillTriangle(4, -0.6, 4, 0.6, 8, 0);
        g = this.scene.add.container(s.x, s.y, [glow(0xb71c1c, 0.3).setPosition(2, 0).setAlpha(0.6), d]).setDepth(DEPTH).setAngle(deg);
        break;
      }
      case "rat": {
        // A plague rat scurrying: grey-brown body, pink tail, beady red eye (tickShots makes it scamper)
        const d = this.scene.add.graphics();
        d.fillStyle(0x000000, 0.25).fillEllipse(0, 2.2, 7, 2);
        d.fillStyle(0xd48a9a).fillRect(-7, 0.5, 4, 0.8);
        d.fillStyle(0x4e4038).fillEllipse(-0.5, 0, 6.5, 3.6);
        d.fillStyle(0x6d5b50).fillEllipse(-0.5, -0.6, 4.5, 1.8);
        d.fillStyle(0x4e4038).fillTriangle(2, -1.6, 2, 1.6, 4.8, 0.2);
        d.fillStyle(0x8d7b70).fillRect(1.4, -2.4, 1, 1);
        d.fillStyle(0xff2d2d).fillRect(3, -0.8, 0.8, 0.8);
        g = this.scene.add.container(s.x, s.y, [d]).setDepth(DEPTH);
        if (Math.abs(deg) > 90) d.setScale(-1, 1);
        break;
      }
      case "bat": {
        // A little bat: dark body, two wings that beat in tickShots, red eyes
        const d = this.scene.add.graphics();
        const wing = (k: number) => { d.fillStyle(0x2a1d3a).fillTriangle(0, 0, k * 5.5, -2.5, k * 4.5, 1.5); d.fillStyle(0x5e35b1).fillTriangle(0, -0.3, k * 5.5, -2.5, k * 3, -0.6); };
        wing(-1); wing(1);
        d.fillStyle(0x1a1033).fillCircle(0, 0.3, 1.6).fillRect(-1.2, -2, 0.8, 1.2).fillRect(0.4, -2, 0.8, 1.2);
        d.fillStyle(0xff2d2d).fillRect(-0.9, -0.3, 0.6, 0.6).fillRect(0.3, -0.3, 0.6, 0.6);
        g = this.scene.add.container(s.x, s.y, [d]).setDepth(DEPTH);
        break;
      }
      default:
        if (!BASIC_SHOTS.has(look)) return undefined;
        g = this.basicShot(look, s, size);
    }
    // Enchanted (Fire Arrows + Volley...): the shot glows in the enchantment's colour; tickShots adds its flames
    const imb = PALETTE[s.imb as FxStyle];
    if (imb && g instanceof Phaser.GameObjects.Container) {
      const light = this.scene.add.image(0, 0, "fx_glow").setTint(imb[1]).setBlendMode(Phaser.BlendModes.ADD).setScale(0.32 * size).setAlpha(0.7);
      g.addAt(light, 0);
    }
    this.shots.set(id, { s, g, look, born: this.t });
    return g;
  }

  /** Screen angle (degrees) of a world direction: in the iso view a world heading turns on screen. */
  private screenDeg(vx: number, vy: number) {
    const [dx, dy] = screenDelta(vx, vy);
    return Math.atan2(dy, dx) * 180 / Math.PI;
  }

  /** Look of basic and monster projectiles: a small drawn object, mostly with a soft light around it. */
  private basicShot(look: string, s: any, size: number) {
    const sc = this.scene, deg = this.screenDeg(s.vx ?? 1, s.vy ?? 0);
    const light = (tint: number, k: number, a = 0.8) => sc.add.image(0, 0, "fx_glow").setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(k).setAlpha(a);
    const box = (...objs: Phaser.GameObjects.GameObject[]) => sc.add.container(s.x, s.y, objs).setDepth(DEPTH);
    const d = sc.add.graphics();
    switch (look) {
      case "fireball": {
        // Hot white core inside orange flame, flickering (see tickShots)
        d.fillStyle(0xd62800, 0.85).fillCircle(0, 0, 3.6 * size).fillStyle(0xff9f1c).fillCircle(0, 0, 2.7 * size)
          .fillStyle(0xfff176).fillCircle(0, 0, 1.8 * size).fillStyle(0xffffff).fillCircle(-0.4, -0.4, 1 * size);
        return box(light(0xff3d00, 0.75 * size, 0.55), light(0xffb347, 0.4 * size), d);
      }
      case "arrow": case "bolt": {
        // Wooden shaft, steel head, feathers (bolts: shorter, thicker, dark wood)
        const bolt = look === "bolt", L = (bolt ? 7 : 9) * size, w = bolt ? 1.4 : 0.9;
        d.fillStyle(bolt ? 0x6d4c33 : 0xd8b98a).fillRect(-L / 2, -w / 2, L, w);
        d.fillStyle(0xdfe6f0).fillTriangle(L / 2 - 0.5, -1.6, L / 2 - 0.5, 1.6, L / 2 + 2.6, 0);
        d.fillStyle(0x6d7d99).fillTriangle(L / 2 - 0.5, 0, L / 2 - 0.5, 1.6, L / 2 + 2.6, 0);
        d.fillStyle(bolt ? 0x37474f : 0xe63946).fillTriangle(-L / 2, -w / 2, -L / 2 + 2.5, -w / 2, -L / 2 - 0.5, -2.2).fillTriangle(-L / 2, w / 2, -L / 2 + 2.5, w / 2, -L / 2 - 0.5, 2.2);
        return box(d).setAngle(deg);
      }
      case "knife": {
        d.fillStyle(0xdfe6f0).fillTriangle(-0.5, -1.2, -0.5, 1.2, 4.5, 0);
        d.fillStyle(0xffffff).fillTriangle(-0.5, -1.2, -0.5, 0, 4.5, 0);
        d.fillStyle(0x5d4037).fillRect(-3.5, -0.8, 3, 1.6).fillStyle(0xffd166).fillRect(-0.9, -1.6, 0.8, 3.2);
        return box(light(0xffffff, 0.12, 0.5), d).setAngle(deg);
      }
      case "stone": {
        d.fillStyle(0x6d6d6d).fillPoints([{ x: -2, y: -1 }, { x: -0.5, y: -2.2 }, { x: 1.8, y: -1.5 }, { x: 2.3, y: 0.8 }, { x: 0.6, y: 2 }, { x: -1.8, y: 1.6 }], true);
        d.fillStyle(0xa9a9a9).fillCircle(-0.4, -0.7, 0.9);
        return box(d);
      }
      case "slimeball": {
        // A wobbling glob of purple goo with a wet shine
        d.fillStyle(0x5b2c91).fillCircle(0, 0.4, 2.9).fillStyle(0xb57cff).fillCircle(0, 0, 2.6).fillStyle(0xd1a6ff).fillCircle(-0.8, -0.9, 1).fillStyle(0xffffff).fillRect(-1.2, -1.4, 0.8, 0.8);
        return box(light(0x9d4edd, 0.26, 0.6), d);
      }
      case "skelthrow": {
        // A whole skeleton, curled up and tumbling: skull, rib cage, flailing arms and legs
        const B = 0xe8e2d0, S = 0x8f887a;
        d.lineStyle(1.2, S).lineBetween(-1, 1, -5, 4).lineBetween(1, 1, 5, 3.5).lineBetween(-1, -1, -4.5, -3.5).lineBetween(1, 2, 3, 6);
        d.lineStyle(1, B).lineBetween(-1, 1, -5, 4).lineBetween(1, 1, 5, 3.5).lineBetween(-1, -1, -4.5, -3.5).lineBetween(1, 2, 3, 6);
        d.fillStyle(S).fillEllipse(0, 1, 5, 6).fillStyle(B).fillEllipse(0, 0.6, 4.2, 5.2);
        d.lineStyle(0.6, S).lineBetween(-1.8, 0, 1.8, 0).lineBetween(-1.6, 1.4, 1.6, 1.4).lineBetween(-1.3, 2.7, 1.3, 2.7);
        d.fillStyle(B).fillCircle(0.5, -4, 2.6).fillStyle(0x1a1a1a).fillRect(-0.7, -4.6, 1, 1).fillRect(1, -4.6, 1, 1);
        d.fillStyle(0xff5a3c).fillRect(-0.5, -4.4, 0.6, 0.6).fillRect(1.2, -4.4, 0.6, 0.6);
        return box(d);
      }
      case "magicbolt": {
        d.fillStyle(0x4cc9f0).fillCircle(0, 0, 2.4).fillStyle(0xd6f6ff).fillCircle(0, 0, 1.5).fillStyle(0xffffff).fillCircle(0, 0, 0.8);
        return box(light(0x4cc9f0, 0.4), d);
      }
      default: { // shadowbolt: dark heart in a sickly green glow
        d.fillStyle(0x43a047).fillCircle(0, 0, 3.3).fillStyle(0x1a1033).fillCircle(0, 0, 2.2).fillStyle(0x7dff6a).fillCircle(0.6, -0.6, 0.8);
        return box(light(0x7cfc00, 0.55, 0.7), d);
      }
    }
  }

  removeShot(id: string) { this.shots.delete(id); }

  private tickShots(dt: number) {
    for (const { s, g, look, born } of this.shots.values()) {
      const x = g.x, y = g.y, z = 6;
      const ax = s.vx ?? 1, ay = s.vy ?? 0;
      const age = this.t - born;
      const n = (perSec: number) => { let c = Math.floor(perSec * dt); if (Math.random() < perSec * dt - c) c++; return c; };
      // Enchanted shot: the head burns (or drips poison, shines holy...) with a short trail in that colour
      const imb = s.imb as FxStyle;
      if (PALETTE[imb]) {
        for (let i = 0; i < n(70 * (s.size || 1)); i++) this.p(x + ax * rnd(0, 4), y + ay * rnd(0, 4), z + rnd(-1, 1), pick(PALETTE[imb]), { vx: -ax * 25 + rnd(-6, 6), vy: -ay * 25 + rnd(-6, 6), vz: rnd(3, 12), life: rnd(160, 320), size: pick([1, 1, 2]), size1: 0 });
        if (imb === "fire" && Math.random() < 4 * dt) this.p(x - ax * 5, y - ay * 5, 2, pick([0x4a4a4a, 0x6d6d6d]), { vz: 10, life: 420, size: 2, size1: 3, alpha: 0.3, add: false, depth: DEPTH - 1 });
      }
      switch (look) {
        case "shuriken": (g as any).angle += 1400 * dt; if (Math.random() < 0.4) this.p(x, y, 0, 0xffffff, { life: 120, depth: DEPTH - 1 }); break;
        case "net": (g as any).angle += 400 * dt; break;
        case "frozenorb": {
          (g as any).angle += 240 * dt;
          // ice splinters spin off the orb in every direction, and a frosty mist trails behind it
          for (let i = 0; i < n(90); i++) {
            const a = Math.random() * Math.PI * 2, v = rnd(25, 55);
            this.p(x + Math.cos(a) * 4, y + Math.sin(a) * 4, z + rnd(-2, 2), pick(PALETTE.frost), { vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(200, 380), size: pick([1, 1, 2]), size1: 0 });
          }
          for (let i = 0; i < n(40); i++) this.p(x - ax * 6 + rnd(-3, 3), y - ay * 6 + rnd(-3, 3), 0, 0xd6f6ff, { life: 420, size: 2, size1: 0 });
          break;
        }
        case "lightning":
          for (let i = 0; i < n(80); i++) this.p(x + rnd(-3, 3), y + rnd(-3, 3), rnd(-2, 2), pick(PALETTE.lightning), { life: 120, size: 1 });
          if (Math.random() < 0.5) this.bolt(x - ax * 14, y - ay * 14, 0, x, y, 0, PALETTE.lightning, 1, 60);
          break;
        case "dragon": {
          // A serpent of fire: the body waves behind the glowing head
          for (let i = 0; i < n(160); i++) {
            const w = Math.sin(age / 60 + i) * 5;
            this.p(x - ax * rnd(0, 8) - ay * w, y - ay * rnd(0, 8) + ax * w, rnd(0, 6), pick(PALETTE.fire), { vx: -ax * 30, vy: -ay * 30, vz: rnd(5, 20), life: rnd(300, 550), size: pick([2, 2, 3]), size1: 0 });
          }
          (g as any).setScale(0.8 * (s.size || 1) * (1 + 0.1 * Math.sin(age / 50)));
          // eyes
          this.p(x + ax * 3 - ay * 2, y + ay * 3 + ax * 2, 8, 0xfff176, { life: 40, size: 1 });
          this.p(x + ax * 3 + ay * 2, y + ay * 3 - ax * 2, 8, 0xfff176, { life: 40, size: 1 });
          break;
        }
        case "phoenix": {
          // Wings flapping, a long flame tail
          const flap = Math.sin(age / 45) * 9;
          for (const side of [-1, 1]) for (let k = 1; k <= 3; k++) {
            this.p(x - ay * side * k * 3 - ax * k, y + ax * side * k * 3 - ay * k, z + flap * (k / 3), pick(PALETTE.fire), { life: 70, size: 2 });
          }
          for (let i = 0; i < n(110); i++) this.p(x - ax * 6, y - ay * 6, z, pick(PALETTE.fire), { vx: -ax * 50 + rnd(-10, 10), vy: -ay * 50 + rnd(-10, 10), vz: rnd(0, 10), life: rnd(250, 500), size: pick([1, 2]), size1: 0 });
          break;
        }
        case "inferno":
          (g as any).setScale(0.55 * (s.size || 1) * (1 + 0.15 * Math.sin(age / 40)));
          for (let i = 0; i < n(90); i++) {
            const a = age / 80 + i * 2.1;
            this.p(x + Math.cos(a) * 7, y + Math.sin(a) * 7, z + rnd(-3, 3), pick(PALETTE.fire), { vz: 10, life: 260, size: pick([1, 2]), size1: 0 });
          }
          break;
        case "flamewave":
          for (let i = 0; i < n(140); i++) {
            const w = rnd(-12, 12);
            this.p(x - ay * w, y + ax * w, 0, pick(PALETTE.fire), { vz: rnd(30, 60), vx: ax * 20, vy: ay * 20, life: rnd(250, 400), size: pick([1, 2, 2]), size1: 0 });
          }
          break;
        case "iceshard": if (Math.random() < 0.6) this.p(x, y, 0, pick(PALETTE.frost), { life: 200, size: 1 }); break;
        case "arcane": {
          const a = age / 40;
          this.p(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 0, pick(PALETTE.arcane), { life: 260, size: 1, size1: 0 });
          this.p(x - Math.cos(a) * 3, y - Math.sin(a) * 3, 0, pick(PALETTE.arcane), { life: 260, size: 1, size1: 0 });
          break;
        }
        case "bloodbolt": {
          const sz = s.size || 1;
          (g as any).setScale(1 + 0.12 * Math.sin(age / 40), 1 - 0.1 * Math.sin(age / 40));
          for (let i = 0; i < n(55 * sz); i++) this.p(x - ax * rnd(1, 4), y - ay * rnd(1, 4), rnd(-1, 1), pick(PALETTE.blood.slice(2)), { vx: -ax * 18, vy: -ay * 18, vz: -rnd(5, 15), g: 90, life: rnd(220, 380), size: pick([1, 1, 2]), size1: 0, add: false });
          break;
        }
        case "bloodlance":
          for (let i = 0; i < n(70); i++) this.p(x - ax * rnd(4, 9), y - ay * rnd(4, 9), rnd(-1, 1), pick(PALETTE.blood.slice(2)), { vx: -ax * 15, vy: -ay * 15, vz: -rnd(4, 12), g: 90, life: rnd(200, 340), size: 1, size1: 0, add: false });
          break;
        case "rat": {
          // A seething wave: each rat wanders on its own (sideways, a little ahead and behind its true spot), hops,
          // tumbles over the others now and then, kicks up dust; stray rats and green sickness boil round the mass
          const c = g as Phaser.GameObjects.Container, d = c.list[0] as Phaser.GameObjects.Graphics | undefined;
          const ph = (s.__ph ??= Math.random() * 100), fq = (s.__fq ??= rnd(0.6, 1.5)), sz = (s.__sz ??= rnd(0.8, 1.25));
          const side = Math.sin(age / (110 * fq) + ph) * 5 + Math.sin(age / (47 * fq) + ph * 3) * 2;
          const fwd = Math.sin(age / (160 * fq) + ph * 2) * 5;
          const hop = Math.abs(Math.sin(age / (40 * fq) + ph)) * 2 + (Math.sin(age / 300 + ph) > 0.85 ? 3 : 0);
          if (d) { d.setPosition(ax * fwd - ay * side, ay * fwd + ax * side - hop); d.setScale((s.vx < 0 ? -1 : 1) * sz, sz); d.setAngle(Math.sin(age / 60 + ph) * 12); }
          if (Math.random() < 7 * dt) this.p(x + rnd(-4, 4), y + rnd(-2, 2), 0, pick([0x6d5b50, 0x8d7b70, 0x4e4038]), { vz: rnd(4, 10), vx: -ax * 10, vy: -ay * 10, life: 320, size: pick([1, 2]), size1: 0, add: false, depth: GROUND_DEPTH + 1 });
          if (Math.random() < 3 * dt) this.p(x + rnd(-8, 8), y + rnd(-5, 5), 0, 0x3a2e28, { vx: ax * rnd(30, 60) + rnd(-25, 25), vy: ay * rnd(30, 60) + rnd(-15, 15), life: 260, size: 2, size1: 1, add: false }); // a stray rat darting
          if (Math.random() < 3 * dt) this.p(x, y, 4, pick(PALETTE.poison.slice(1, 4)), { vz: 12, life: 420, size: 1, size1: 0, alpha: 0.7 });
          break;
        }
        case "bat": {
          // Bats pouring out of the cloak, each on its own erratic flight: ragged start times, different sizes and wing
          // beats, wide swoops that drift and change side, and now and then a sharp dart or dip like a real bat
          const c = g as Phaser.GameObjects.Container, d = c.list[0] as Phaser.GameObjects.Graphics | undefined;
          const ph = (s.__ph ??= Math.random() * 100), fq = (s.__fq ??= rnd(0.6, 1.5)), late = (s.__late ??= Math.random() ** 1.6 * 220);
          const sz = (s.__sz ??= rnd(0.75, 1.2)), sw = (s.__sw ??= rnd(2.5, 8) * (Math.random() < 0.5 ? -1 : 1));
          const out = Math.min(1, Math.max(0, age - late) / 140); // 0 -> 1 as it leaves the cloak
          c.setAlpha(out);
          // Darts: a short jerk sideways/up at random moments, eased back out
          if (out >= 1 && !(s.__dt > 0) && Math.random() < 2.2 * dt) { s.__dt = 1; s.__dx = rnd(-7, 7); s.__dy = rnd(-6, 3); }
          if (s.__dt > 0) s.__dt = Math.max(0, s.__dt - dt * rnd(3, 6));
          const dart = s.__dt > 0 ? Math.sin(s.__dt * Math.PI) : 0;
          const side = (Math.sin(age / (140 * fq) + ph) * sw + Math.sin(age / (53 * fq) + ph * 2.3) * 2 + (s.__dx ?? 0) * dart) * out;
          const bob = (Math.sin(age / (90 * fq) + ph * 1.7) * 2.5 + (s.__dy ?? 0) * dart) * out - 2 - 3 * (1 - out);
          if (d) d.setPosition(-ay * side, ax * side + bob);
          d?.setScale((0.6 + 0.4 * out) * sz, (0.45 + 0.55 * Math.abs(Math.sin(age / (22 * fq) + ph))) * (0.6 + 0.4 * out) * sz);
          if (out > 0.5 && Math.random() < 2.5 * dt) this.p(x - ax * 3, y - ay * 3, 4, pick(PALETTE.shadow.slice(2)), { vx: -ax * 12, vy: -ay * 12, life: 260, size: 2, size1: 0, alpha: 0.4, add: false });
          break;
        }
        case "powerarrow": for (let i = 0; i < n(60); i++) this.p(x - ax * 5, y - ay * 5, 0, pick(PALETTE.wind), { life: 250, size: 1, size1: 0 }); break;
        case "frostarrow": for (let i = 0; i < n(50); i++) this.p(x - ax * 5, y - ay * 5, 0, pick(PALETTE.frost), { life: 300, size: 1, size1: 0 }); break;
        // ---- basic and monster shots
        case "fireball": {
          const sz = s.size || 1;
          (g as any).setScale(1 + 0.12 * Math.sin(age / 35));
          for (let i = 0; i < n(150 * sz); i++) this.p(x - ax * rnd(1, 6), y - ay * rnd(1, 6), rnd(-1.5, 1.5), pick(PALETTE.fire), { vx: -ax * 30 + rnd(-8, 8), vy: -ay * 30 + rnd(-8, 8), vz: rnd(4, 14), life: rnd(250, 520), size: pick([1, 2, 2, 3]), size1: 0 });
          // two flame ribbons twisting round the trail
          const tw = age / 45, px = -ay, py = ax;
          for (let k = 0; k < 2; k++) { const o = Math.sin(tw + k * Math.PI) * 3.2 * sz; this.p(x - ax * 3 + px * o, y - ay * 3 + py * o, Math.cos(tw + k * Math.PI) * 2, k ? 0xfff176 : 0xff6d00, { vx: -ax * 18, vy: -ay * 18, life: 300, size: 2, size1: 0 }); }
          // embers flicking off
          if (Math.random() < 14 * dt) this.p(x, y, 1, pick([0xffd166, 0xff9f1c]), { vx: rnd(-30, 30), vy: rnd(-30, 30), vz: rnd(20, 50), g: 90, life: rnd(400, 700), size: 1 });
          if (Math.random() < 6 * dt) this.p(x - ax * 5, y - ay * 5, 2, pick([0x4a4a4a, 0x6d6d6d]), { vz: 12, life: 500, size: 2, size1: 3, alpha: 0.35, add: false, depth: DEPTH - 1 });
          break;
        }
        case "arrow": case "bolt":
          // Faint air streak behind the feathers
          for (let i = 0; i < n(45); i++) this.p(x - ax * 6, y - ay * 6, 0, 0xffffff, { vx: -ax * 10, vy: -ay * 10, life: 160, size: 1, size1: 0, alpha: 0.45 });
          break;
        case "knife":
          (g as any).angle += 1100 * dt;
          if (Math.random() < 0.35) this.p(x, y, 0, pick(PALETTE.steel), { life: 140, size: 1 });
          break;
        case "stone":
          (g as any).angle += 500 * dt;
          if (Math.random() < 12 * dt) this.p(x, y, 0, pick(PALETTE.earth), { vz: -5, g: 60, life: 300, size: 1, add: false });
          break;
        case "skelthrow":
          (g as any).angle += 620 * dt; // tumbling end over end
          if (Math.random() < 10 * dt) this.p(x, y, 4, pick([0xe8e2d0, 0xd8d0b8]), { vz: -8, g: 120, life: 420, size: 1, add: false }); // bits snapping off
          break;
        case "slimeball": {
          const wob = 1 + 0.14 * Math.sin(age / 45);
          (g as any).setScale(wob, 2 - wob);
          // Drips that fall to the ground and a goo trail
          if (Math.random() < 14 * dt) this.p(x + rnd(-1, 1), y, 0, pick(GOO), { vz: -10, g: 120, life: 450, size: pick([1, 2]), add: false });
          for (let i = 0; i < n(30); i++) this.p(x - ax * 3, y - ay * 3, 0, pick(GOO), { life: 220, size: 1, size1: 0 });
          break;
        }
        case "magicbolt": {
          // Two frost sparks spiral around the bolt, a glittering tail
          const a = age / 35;
          for (const k of [1, -1]) this.p(x - ay * Math.cos(a) * 3 * k, y + ax * Math.cos(a) * 3 * k, Math.sin(a) * 3 * k, pick(PALETTE.frost), { life: 240, size: 1, size1: 0 });
          for (let i = 0; i < n(40); i++) this.p(x - ax * 3, y - ay * 3, rnd(-1, 1), pick(PALETTE.frost), { vx: -ax * 15, vy: -ay * 15, life: 300, size: 1, size1: 0 });
          break;
        }
        case "shadowbolt": {
          (g as any).setScale(1 + 0.1 * Math.sin(age / 60));
          const a = age / 50;
          for (let k = 0; k < 3; k++) {
            const b = a + k * 2.1;
            this.p(x + Math.cos(b) * 4.5, y + Math.sin(b) * 4.5, rnd(-1, 1), pick(PALETTE.shadow), { life: 200, size: pick([1, 2]), size1: 0, add: false });
          }
          for (let i = 0; i < n(60); i++) this.p(x - ax * 4, y - ay * 4, rnd(-2, 2), pick(PALETTE.poison), { vx: -ax * 20 + rnd(-6, 6), vy: -ay * 20 + rnd(-6, 6), vz: rnd(0, 8), life: rnd(250, 450), size: pick([1, 2]), size1: 0 });
          break;
        }
      }
    }
  }

  /** Impact of a skill projectile ("boom" message). */
  impact(x: number, y: number, kind: string, r: number, imb?: string) {
    const ip = PALETTE[imb as FxStyle];
    if (ip) { this.burst(x, y, 4, imb as FxStyle, r > 0 ? 18 : 8, 60, 320); if (r > 0) this.ring(x, y, r, imb as FxStyle, 20, { life: 380, up: 10 }); }
    if (BASIC_SHOTS.has(kind)) { this.basicImpact(x, y, kind, r); return true; }
    const style: FxStyle | undefined = ({ shuriken: "steel", lightning: "lightning", dragon: "fire", phoenix: "fire", inferno: "fire", flamewave: "fire",
      iceshard: "frost", frozenorb: "frost", arcane: "arcane", powerarrow: "wind", frostarrow: "frost", net: "nature", bloodbolt: "blood", bat: "shadow", bloodlance: "blood", rat: "poison" } as Record<string, FxStyle>)[kind];
    if (!style) return false;
    if (r > 0) {
      const big = r >= 44;
      this.ring(x, y, r, style, big ? 70 : 34, { life: 450, up: big ? 40 : 18, size: big ? 2 : 1 });
      this.burst(x, y, 4, style, big ? 40 : 16, big ? 120 : 80, 600);
      this.glow(x, y, 4, r * 1.3, PALETTE[style][2], 450, 0.9, true);
      if (style === "fire") this.smoke(x, y, r * 0.5, big ? 10 : 4);
      if (kind === "net") this.ring(x, y, r, "earth", 12, { life: 300, add: false });
      if (big && this.nearMe(x, y)) quake(this.scene, 220, 0.008);
    } else this.burst(x, y, 4, style, 8, 60, 300);
    return true;
  }

  /** Impacts of basic and monster shots: sparks, splinters, goo and light; the fireball's splash puffs up bigger. */
  private basicImpact(x: number, y: number, kind: string, r: number) {
    switch (kind) {
      case "fireball": {
        const k = r > 0 ? Math.min(2.4, 1 + r / 25) : 1;
        // a white-hot flash, a fireball that swells, a ring of flame along the ground, embers and smoke going up
        this.glow(x, y, 4, 10 * k, 0xffffff, 120, 1);
        this.glow(x, y, 4, 22 * k, 0xff9f1c, 380, 0.95);
        this.glow(x, y, 0, 26 * k, 0xff3d00, 600, 0.6, true);
        this.burst(x, y, 3, "fire", Math.round(26 * k), 90 * k, 480);
        this.ring(x, y, 18 * k, "fire", Math.round(18 * k), { life: 320, up: 8 });
        for (let i = 0; i < Math.round(10 * k); i++) this.p(x + rnd(-4, 4), y + rnd(-3, 3), 4, pick([0xffd166, 0xff9f1c, 0xffffff]), { vx: rnd(-25, 25), vy: rnd(-25, 25), vz: rnd(50, 110), g: 120, life: rnd(600, 1000), size: 1 });
        this.smoke(x, y, 5 * k, Math.round(3 * k));
        this.ripple(x, y, 16 * k, 0xff9f1c, 280);
        if (r > 0) this.cracks(x, y, 10 * k, 0x2a1408); // a scorch where a blast went off
        break;
      }
      case "arrow": case "bolt": this.burst(x, y, 2, "earth", 6, 45, 300); this.burst(x, y, 2, "steel", 3, 35, 180); break;
      case "knife": this.burst(x, y, 3, "steel", 8, 60, 240); this.glow(x, y, 3, 6, 0xffffff, 150); break;
      case "stone": this.burst(x, y, 1, "earth", 9, 50, 380, 1); break;
      case "slimeball":
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2, sp = rnd(20, 55);
          this.p(x, y, 3, pick(GOO), { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(15, 45), g: 160, drag: 1.5, life: rnd(350, 600), size: pick([1, 2, 2]), add: false });
        }
        this.glow(x, y, 0, 9, 0x9d4edd, 260, 0.6, true);
        break;
      case "skelthrow":
        // it shatters: bones scatter over the ground
        for (let i = 0; i < 16; i++) {
          const a = Math.random() * Math.PI * 2, sp = rnd(25, 70);
          this.p(x, y, 4, pick([0xe8e2d0, 0xd8d0b8, 0x8f887a]), { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(20, 50), g: 170, drag: 2, life: rnd(500, 800), size: pick([1, 2]), add: false });
        }
        this.burst(x, y, 1, "earth", 8, 45, 380, 1);
        if (this.nearMe(x, y)) quake(this.scene, 120, 0.004);
        break;
      case "magicbolt": this.burst(x, y, 3, "frost", 12, 60, 380); this.glow(x, y, 3, 12, 0x4cc9f0, 260); break;
      default: // shadowbolt
        this.ring(x, y, 14, "shadow", 14, { life: 380, up: 10, add: false });
        this.burst(x, y, 3, "poison", 12, 55, 420);
        this.glow(x, y, 3, 16, 0x7cfc00, 320);
    }
  }

  // ---- statuses on heroes and monsters -------------------------------------------------------------------

  /** Effects on an entity this frame from its status words (Player.fx / Mob.fx). Draws marks into `g` (the entity's HUD graphics). */
  status(e: FxEntity, g: Phaser.GameObjects.Graphics, dt: number) {
    const fx: string = e.state.fx ?? "";
    if (!fx || e.state.dead) return;
    const x = e.sprite.x, y = e.sprite.y, top = e.top;
    const xs = Math.round(x), ys = Math.round(y);
    const chance = (perSec: number) => Math.random() < perSec * dt;
    const words = fx.split(",");
    // Boil Blood: erupts once when it takes hold
    if (words.includes("boil")) { if (!this.boiling.has(e.state)) { this.boiling.add(e.state); this.boilErupt(e); } }
    else this.boiling.delete(e.state);
    for (const w of words) {
      if (w === "bleed") {
        // Bleeding (vampire Leech, Crimson Slash, Thirst): drops of blood run off the body and fall
        if (chance(9)) this.p(x + rnd(-4, 4), y + rnd(-1, 2), rnd(top * 0.3, top * 0.75), pick(PALETTE.blood.slice(2, 5)), { vx: rnd(-6, 6), vz: rnd(-4, 8), g: 160, life: rnd(400, 650), size: pick([1, 1, 2]), size1: 1, add: false });
        if (chance(1.5)) this.p(x + rnd(-5, 5), y + rnd(0, 2), 0, 0x6d0000, { life: 900, size: 2, size1: 2, alpha: 0.6, add: false, depth: GROUND_DEPTH });
      } else if (w === "boil") {
        // Boiling blood: red bubbles swell on the body and pop, a little steam rises, the victim glows from within
        if (chance(14)) {
          const bx = x + rnd(-5, 5), bz = rnd(top * 0.2, top * 0.85), life = rnd(250, 420);
          this.p(bx, y + rnd(-1, 1), bz, pick([0xff1744, 0xe63946, 0xff5252]), { vz: rnd(4, 12), life, size: 1, size1: pick([3, 4]), add: false });
          this.scene.time.delayedCall(life, () => { for (let i = 0; i < 4; i++) this.p(bx, y, bz + 4, pick(PALETTE.blood.slice(1, 4)), { vx: rnd(-25, 25), vy: rnd(-10, 10), vz: rnd(10, 35), g: 180, life: 260, size: 1, size1: 0, add: false }); });
        }
        if (chance(4)) this.p(x + rnd(-4, 4), y, top * rnd(0.6, 1), pick([0xd7ccc8, 0xefebe9]), { vz: rnd(14, 24), vx: rnd(-4, 4), life: 700, size: 2, size1: 4, alpha: 0.25, add: false });
        if (chance(3)) this.glow(x, y, top * 0.5, 9, 0xff1744, 260, 0.35);
      } else if (w === "burn") {
        if (chance(22)) this.p(x + rnd(-4, 4), y + rnd(-2, 2), rnd(2, top), pick(PALETTE.fire), { vz: rnd(15, 35), life: rnd(250, 450), size: pick([1, 2]), size1: 0 });
      } else if (w === "mark") {
        // A red sigil turning over the head
        const a = this.t / 250, sy = ys - top - 9;
        g.fillStyle(0xe63946, 0.9);
        for (let i = 0; i < 4; i++) { const b = a + (i * Math.PI) / 2; g.fillRect(xs + Math.cos(b) * 4 - 0.5, sy + Math.sin(b) * 1.5 - 0.5, 1.5, 1.5); }
        g.fillStyle(0xff8a80).fillRect(xs - 0.5, sy - 0.5, 1.5, 1.5);
      } else if (w === "weak") {
        if (chance(6)) this.p(x + rnd(-5, 5), y, top, pick(PALETTE.shadow), { vz: -12, life: 500, size: 1, add: false });
      } else if (w === "shrine_wind") {
        // Blessing of the Wind (forest shrine): pale green-blue gusts swirling round the feet and trailing behind
        if (chance(20)) {
          const a = this.t / 160 + Math.random() * 6;
          this.p(x + Math.cos(a) * 7, y + Math.sin(a) * 3, rnd(0, 5), pick([0x9cf3dc, 0x52dcc2, 0xe2fff4]), { vz: rnd(4, 14), vx: -Math.sin(a) * 18, vy: Math.cos(a) * 8, life: rnd(300, 520), size: 1, size1: 0 });
        }
      } else if (w === "charge") {
        // handled by the gather effect
      } else if (w.startsWith("counter:")) {
        // Ready stance: a steel glint flickering on the weapon
        const [hx, hy] = this.hand(e);
        if (chance(14)) this.p(hx + rnd(-2, 2), hy, top * 0.5 + rnd(-3, 3), 0xffffff, { life: 90, size: 2, size1: 0 });
        g.fillStyle(0xffffff, 0.5 + 0.5 * Math.sin(this.t / 40)).fillRect(Math.round(hx) - 2, Math.round(hy - top * 0.5), 4, 1).fillRect(Math.round(hx) - 0.5, Math.round(hy - top * 0.5) - 1.5, 1, 4);
      } else {
        const s = skillById(w);
        if (!s || s.id === "k_shield") continue; // the shield bubble is drawn by the scene
        const pal = PALETTE[s.style], tier = TIER[s.row];
        if (s.type === "Enchant") {
          // Enchanted weapon: sparks of its element on the blade / arrowhead
          const [hx, hy] = this.hand(e);
          if (chance(18 * tier)) this.p(hx + rnd(-2, 2), hy + rnd(-2, 2), top * 0.45 + rnd(-3, 4), pick(pal), { vz: rnd(5, 20), life: rnd(200, 400), size: 1, size1: 0 });
          if (s.buff?.armor && chance(10)) { const a = this.t / 200 + Math.random() * 6; this.p(x + Math.cos(a) * 9, y + Math.sin(a) * 4, rnd(2, top), pick(pal), { life: 300, size: 1, size1: 0 }); }
        } else {
          // Aura / war cry buff: motes rising and circling around the hero
          if (chance(16 * tier)) {
            const a = Math.random() * Math.PI * 2;
            this.p(x + Math.cos(a) * 8, y + Math.sin(a) * 4, rnd(0, 6), pick(pal), { vz: rnd(18, 34), vx: -Math.sin(a) * 10, vy: Math.cos(a) * 5, life: rnd(400, 700), size: pick([1, 1, 2]), size1: 0 });
          }
          if (s.id === "b_rage" || s.id === "b_berserk") {
            if (chance(30)) this.p(x + rnd(-5, 5), y, rnd(0, top), pick(PALETTE.blood), { vz: rnd(20, 40), life: 300, size: pick([1, 2]), size1: 0 });
          }
        }
      }
    }
  }

  // ---- frame --------------------------------------------------------------------------------------------

  update(dtMs: number) {
    const dt = Math.min(0.05, dtMs / 1000);
    this.t += dtMs;
    for (const em of this.emitters) if (this.t >= em.next) { em.next = this.t + em.every; em.fn(); }
    this.emitters = this.emitters.filter((em) => this.t < em.until);
    this.tickFields(dt);
    this.tickShots(dt);
    const out: P[] = [];
    for (const p of this.parts) {
      p.t += dtMs;
      if (p.t >= p.life) { p.img.setVisible(false).setActive(false); this.pool.push(p.img); continue; }
      const k = 1 - p.drag * dt;
      p.vx *= k; p.vy *= k; p.vz = p.vz * k - p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.z < 0) { p.z = 0; p.vz = -p.vz * 0.3; p.vx *= 0.6; p.vy *= 0.6; }
      const f = p.t / p.life;
      const [lx, ly] = lift(p.z);
      const size = p.s0 + (p.s1 - p.s0) * f;
      p.img.setPosition(p.x + lx, p.y + ly).setDisplaySize(Math.max(0.5, size), Math.max(0.5, size)).setAlpha(p.a0 * (1 - f * f));
      out.push(p);
    }
    this.parts = out;
  }
}
