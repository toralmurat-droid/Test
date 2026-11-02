import Phaser from "phaser";
import { Chest, CHESTS, CHEST_NAMES, CHEST_RANGE, ChestTier } from "../../shared/chests";
import { isoAnchor } from "./iso";

/**
 * Loot chests (shared/chests.ts). The art is rendered here at start-up by casting rays through a small 3D model
 * in the isometric view direction, so the chest sits in the iso world like the buildings do: plank body, rounded
 * lid, metal bands, lock plate; the open version shows the lid swung back and a heap of coins.
 * Each player sees their own chests: emptied ones stay open until they refill.
 */

// Model size in units (1 unit = S texture px). x = long side, y = depth, z = up.
const W = 10.5, D = 7, H = 5.4, R = D / 2, S = 2;
const TEX = 64; // texture size (px)
const proj = (x: number, y: number, z: number) => ({ sx: (x - y) * S, sy: ((x + y) / 2 - z) * S });
// Base centre of the chest lands on this texture pixel (the sprite's feet)
const BASE = proj(W / 2, D / 2, 0);
const OX = TEX / 2 - BASE.sx, OY = TEX - 10 - BASE.sy;

type Rgb = [number, number, number];
const rgb = (c: number): Rgb => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
interface Palette { wood: number[]; band: number[]; lock: number[]; inside: number[]; gold: number[]; outline: number }
// Ramps go dark -> light (hue-shifted: cool shadows, warm lights)
const PALETTES: Record<ChestTier, Palette> = {
  1: { wood: [0x3b2216, 0x5e3a22, 0x86552f, 0xae7843, 0xcf9b5e], band: [0x2a2a35, 0x454654, 0x636676, 0x8c90a0, 0xb4b9c6],
    lock: [0x6b4a12, 0x9c6f1c, 0xc9962b, 0xe9c35a, 0xfff0a0], inside: [0x1c120c, 0x2c1c12, 0x3d281a, 0x4e3422, 0x5c3f2a],
    gold: [0x7a4e0e, 0xb07a14, 0xe0a826, 0xffd45a, 0xfff6c0], outline: 0x1a1018 },
  2: { wood: [0x231a1e, 0x3a2a2a, 0x553d36, 0x735443, 0x8f6d55], band: [0x30384a, 0x55617a, 0x8392aa, 0xb3c2d6, 0xe4eefa],
    lock: [0x30384a, 0x55617a, 0x8392aa, 0xb3c2d6, 0xffffff], inside: [0x120c10, 0x22161a, 0x341f22, 0x45292a, 0x553331],
    gold: [0x7a4e0e, 0xb07a14, 0xe0a826, 0xffd45a, 0xfff6c0], outline: 0x10101a },
  3: { wood: [0x2a0f22, 0x4a1530, 0x701c38, 0x952a40, 0xb8434c], band: [0x6b3f0c, 0xa0671a, 0xd49a2c, 0xf3c95a, 0xfff2a8],
    lock: [0x6b3f0c, 0xa0671a, 0xd49a2c, 0xf3c95a, 0xffffff], inside: [0x1d0820, 0x32103a, 0x481852, 0x5c2166, 0x6e2a78],
    gold: [0x7a4e0e, 0xb07a14, 0xe0a826, 0xffd45a, 0xfff6c0], outline: 0x1a0812 },
};

const enum M { NONE, WOOD, SEAM, BAND, RIVET, LOCK, HOLE, INSIDE, GOLD }

const OPEN_ANGLE = (105 * Math.PI) / 180;
const LID_T = 0.9; // shell thickness when open

/** What is at world point (x,y,z) of the chest model? */
function sample(x: number, y: number, z: number, open: boolean): M {
  if (x < 0 || x > W) return M.NONE;
  const band = (x > 1.3 && x < 2.4) || (x > W - 2.4 && x < W - 1.3);
  const corner = (x < 0.8 || x > W - 0.8) && (y < 0.8 || y > D - 0.8);
  // Body
  if (y >= 0 && y <= D && z >= 0 && z <= H) {
    const shell = x < LID_T || x > W - LID_T || y < LID_T || y > D - LID_T || z < LID_T;
    if (open && !shell) {
      // heap of coins inside, a little domed
      const top = H - 1.6 + 1.2 * (1 - ((x - W / 2) / (W / 2)) ** 2) * (1 - ((y - D / 2) / (D / 2)) ** 2);
      return z <= top ? M.GOLD : M.NONE;
    }
    if (open && z > H - 0.01) return M.NONE;
    if (corner) return M.BAND;
    if (band) return M.BAND;
    if (y > D - 0.5 && Math.abs(x - W / 2) < 1.1 && z > H - 2.9 && z < H - 0.5) return M.LOCK;
    if (!open && z > H - 0.45) return M.SEAM; // gap under the lid
    return M.WOOD;
  }
  // Lid: half cylinder along x, hinged at the back top edge (y=0, z=H)
  let ly = y, lz = z - H;
  if (open) {
    // rotate the point back into the closed lid's frame
    const c = Math.cos(-OPEN_ANGLE), s = Math.sin(-OPEN_ANGLE);
    const ry = y * c - lz * s, rz = y * s + lz * c;
    ly = ry; lz = rz;
  }
  if (lz < 0) return M.NONE;
  const r = Math.hypot(ly - R, lz);
  if (r > R) return M.NONE;
  if (open && r < R - LID_T && lz > 0.05) return M.NONE; // hollow lid: the open side shows its lining
  if (open && (r < R - LID_T + 0.01 || lz <= 0.05)) return M.INSIDE;
  if (band || corner) return M.BAND;
  if (!open && ly > D - 0.6 && lz < 1.3 && Math.abs(x - W / 2) < 0.6) return M.LOCK; // hasp
  return M.WOOD;
}

interface Hit { m: M; x: number; y: number; z: number; n: [number, number, number] }

function cast(px: number, py: number, open: boolean): Hit | undefined {
  const sx = (px + 0.5 - OX) / S, sy = (py + 0.5 - OY) / S;
  const x0 = sy + sx / 2, y0 = sy - sx / 2;
  const at = (t: number) => sample(x0 + t, y0 + t, t, open);
  let prev = 24;
  for (let t = 24; t >= -2; t -= 0.12) {
    if (at(t) !== M.NONE) {
      let hi = prev, lo = t; // hi empty, lo solid
      for (let i = 0; i < 8; i++) { const mid = (hi + lo) / 2; if (at(mid) !== M.NONE) lo = mid; else hi = mid; }
      const x = x0 + lo, y = y0 + lo, z = lo;
      const e = 0.35, m = sample(x, y, z, open);
      const occ = (a: number, b: number, c: number) => (sample(a, b, c, open) !== M.NONE ? 1 : 0);
      let n: [number, number, number] = [occ(x - e, y, z) - occ(x + e, y, z), occ(x, y - e, z) - occ(x, y + e, z), occ(x, y, z - e) - occ(x, y, z + e)];
      if (!n[0] && !n[1] && !n[2]) n = [0, 0, 1];
      return { m, x, y, z, n };
    }
    prev = t;
  }
  return undefined;
}

function shadeIndex(n: [number, number, number]): number {
  const l = Math.hypot(...n) || 1;
  const L = [0.25, 0.55, 0.8], ll = Math.hypot(...L);
  const d = (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / (l * ll);
  return d > 0.8 ? 3 : d > 0.45 ? 2 : d > 0.1 ? 1 : 0;
}

function colorFor(h: Hit, pal: Palette): number {
  let i = shadeIndex(h.n);
  switch (h.m) {
    case M.WOOD: {
      // plank seams: horizontal on the body, along the curve on the lid; a little grain
      const onLid = h.z > H + 0.01 || (h.n[2] !== 0 && h.n[1] !== 0);
      const seam = onLid ? false : h.z % 2.2 < 0.45 && h.z > 0.5;
      const grain = ((Math.floor(h.x * 1.7) * 7 + Math.floor(h.z * 2) * 3) % 11) === 0;
      if (seam) return pal.wood[Math.max(0, i - 2)];
      return pal.wood[Math.max(0, Math.min(4, i + (grain ? -1 : 0)))];
    }
    case M.BAND: {
      const rivet = (Math.abs(h.z - 1.3) < 0.4 || Math.abs(h.z - H + 1.1) < 0.4) && h.n[2] === 0;
      return pal.band[Math.min(4, i + (rivet ? 1 : 0))];
    }
    case M.LOCK: {
      const hole = Math.abs(h.x - W / 2) < 0.3 && Math.abs(h.z - (H - 1.8)) < 0.5 && h.n[1] > 0;
      return hole ? pal.outline : pal.lock[Math.min(4, i + 1)];
    }
    case M.SEAM: return pal.wood[0];
    case M.INSIDE: return pal.inside[Math.max(0, Math.min(4, i + 1))];
    case M.GOLD: {
      const glint = ((Math.floor(h.x * 2.3) * 5 + Math.floor(h.y * 2.3) * 3) % 7) === 0;
      return pal.gold[Math.min(4, i + 1 + (glint ? 1 : 0))];
    }
    default: return pal.outline;
  }
}

function paint(scene: Phaser.Scene, key: string, tier: ChestTier, open: boolean) {
  if (scene.textures.exists(key)) return;
  const pal = PALETTES[tier];
  const col = new Int32Array(TEX * TEX).fill(-1);
  for (let py = 0; py < TEX; py++) for (let px = 0; px < TEX; px++) {
    const h = cast(px, py, open);
    if (h) col[py * TEX + px] = colorFor(h, pal);
  }
  const tex = scene.textures.createCanvas(key, TEX, TEX)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(TEX, TEX);
  const put = (i: number, c: number, a = 255) => { const [r, g, b] = rgb(c); img.data.set([r, g, b, a], i * 4); };
  // soft ground shadow (projected footprint, a bit wider), drawn first
  for (let py = 0; py < TEX; py++) for (let px = 0; px < TEX; px++) {
    const sx = (px + 0.5 - OX) / S, sy = (py + 0.5 - OY) / S;
    const x = sy + sx / 2, y = sy - sx / 2;
    if (x > -1.2 && x < W + 1.6 && y > -0.6 && y < D + 1.8) put(py * TEX + px, 0x000000, 70);
  }
  // outline: empty pixels next to the chest
  for (let py = 0; py < TEX; py++) for (let px = 0; px < TEX; px++) {
    const i = py * TEX + px;
    if (col[i] >= 0) { put(i, col[i]); continue; }
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const x = px + dx, y = py + dy;
      return x >= 0 && y >= 0 && x < TEX && y < TEX && col[y * TEX + x] >= 0;
    });
    if (nb) put(i, pal.outline);
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}

const keyFor = (tier: ChestTier, open: boolean) => `chest_${tier}_${open ? "open" : "shut"}`;

interface Drawn { c: Chest; img: Phaser.GameObjects.Image; open: boolean }

export class ChestLayer {
  private drawn: Drawn[] = [];
  /** chest id -> local time it refills (opened by this account) */
  private refill = new Map<string, number>();
  private prompt = document.createElement("div");
  near?: Chest;

  constructor(private scene: Phaser.Scene, private send: (type: string, msg?: unknown) => void) {
    for (const t of [1, 2, 3] as ChestTier[]) { paint(scene, keyFor(t, false), t, false); paint(scene, keyFor(t, true), t, true); }
    for (const c of CHESTS) {
      const img = scene.add.image(c.x, c.y, keyFor(c.tier, false))
        .setOrigin((OX + BASE.sx) / TEX, (OY + BASE.sy) / TEX).setScale(1 / S).setDepth(c.y);
      this.drawn.push({ c, img, open: false });
    }
    this.prompt.id = "chestprompt";
    this.prompt.onclick = () => this.interact();
    document.getElementById("hud")!.append(this.prompt);
    // now and then a closed chest near the player glints
    scene.time.addEvent({ delay: 1400, loop: true, callback: () => this.glint() });
  }

  /** Chests this account emptied, with ms left until each refills (sent on join). */
  setOpened(left: Record<string, number>) {
    const now = Date.now();
    for (const [id, ms] of Object.entries(left ?? {})) if (ms > 0) this.refill.set(id, now + ms);
  }

  /** The server confirmed we opened it: lid up, coins fly. */
  opened(id: string, ms: number) {
    this.refill.set(id, Date.now() + ms);
    const d = this.drawn.find((x) => x.c.id === id);
    if (!d) return;
    this.setOpen(d, true);
    this.scene.tweens.add({ targets: d.img, scaleY: { from: 0.42, to: 1 / S }, duration: 260, ease: "Back.easeOut" });
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, r = 10 + Math.random() * 16;
      const sp = this.scene.add.rectangle(d.c.x, d.c.y - 6, 2, 2, Math.random() < 0.7 ? 0xffd45a : 0xfff6c0).setDepth(6000);
      const anchor = { x: d.c.x, y: d.c.y };
      isoAnchor(sp, anchor);
      this.scene.tweens.add({ targets: sp, x: d.c.x + Math.cos(a) * r, y: d.c.y - 6 + Math.sin(a) * r, alpha: 0,
        duration: 500 + Math.random() * 350, onComplete: () => sp.destroy() });
    }
  }

  private setOpen(d: Drawn, open: boolean) {
    if (d.open === open) return;
    d.open = open;
    d.img.setTexture(keyFor(d.c.tier, open));
  }

  private isOpen(id: string, now = Date.now()) {
    const t = this.refill.get(id);
    if (t === undefined) return false;
    if (t > now) return true;
    this.refill.delete(id);
    return false;
  }

  /** E key: open the chest you stand next to. Returns true if it did something. */
  interact(): boolean {
    if (!this.near) return false;
    this.send("chest", { id: this.near.id });
    return true;
  }

  private me?: { x: number; y: number };

  update(me: { x: number; y: number } | undefined, blocked: boolean) {
    this.me = me;
    const now = Date.now();
    let best: Chest | undefined, bd = CHEST_RANGE;
    for (const d of this.drawn) {
      const open = this.isOpen(d.c.id, now);
      this.setOpen(d, open);
      if (!me || open) continue;
      const dist = Math.hypot(d.c.x - me.x, d.c.y - me.y);
      if (dist <= bd) { bd = dist; best = d.c; }
    }
    this.near = blocked ? undefined : best;
    this.prompt.classList.toggle("open", !!this.near);
    if (this.near) {
      const html = `<kbd>E</kbd> Open ${CHEST_NAMES[this.near.tier]} <span class="lv">Lv ${this.near.level}</span>`;
      if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    }
  }

  private glint() {
    const me = this.me;
    if (!me) return;
    const close = this.drawn.filter((d) => !d.open && Math.hypot(d.c.x - me.x, d.c.y - me.y) < 14 * 32);
    const d = close[Math.floor(Math.random() * close.length)];
    if (!d) return;
    const x = d.c.x + (Math.random() - 0.5) * 12, y = d.c.y - 6 - Math.random() * 8;
    const star = this.scene.add.star(x, y, 4, 0.6, 2.6, 0xfff6c0).setDepth(6000).setScale(0.2).setAlpha(0.95);
    isoAnchor(star, { x: d.c.x + (x - d.c.x), y: d.c.y });
    this.scene.tweens.add({ targets: star, scale: 1, angle: 45, duration: 260, yoyo: true, onComplete: () => star.destroy() });
  }
}
