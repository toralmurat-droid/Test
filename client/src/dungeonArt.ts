import Phaser from "phaser";
import { BONE, IRON, OLDWOOD, OUTLINE, Pen, pen, ROPE, sheet, WOOD } from "./worldProps";

/**
 * Pixel art of the Mawdeep Warrens (shared/dungeon.ts), painted in code at 1.5 texels per world px like every
 * other prop: cave wall blocks, braziers, the rope down from the sinkhole, stairs, hide racks, skull poles, bones,
 * webs, the Hide-Mother's bed of hides, and the quest's silk cocoons and hide totems. Dark, weathered palette,
 * light from the top left.
 */
export const TX = 1.5;
const hash = (x: number, y: number, s: number) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const vn = (x: number, y: number, s: number) => {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  let tx = x - x0, ty = y - y0;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash(x0, y0, s), b = hash(x0 + 1, y0, s), c = hash(x0, y0 + 1, s), d = hash(x0 + 1, y0 + 1, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const dth = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

/** Cave rock, darkest to lightest (cold brown-grey). */
const ROCK = [0x120e0d, 0x1d1714, 0x2a221d, 0x3a2f27, 0x4b3e33, 0x5e4f41, 0x736251];
const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** A canvas texture painted texel by texel (no outline). */
function plain(scene: Phaser.Scene, key: string, w: number, h: number, frames: number, draw: (p: Pen, f: number) => void) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w * frames, h)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w * frames, h), out = new Uint32Array(img.data.buffer);
  for (let f = 0; f < frames; f++) {
    const buf = new Uint32Array(w * h);
    draw(pen(buf, w, h), f);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = buf[y * w + x];
      out[y * w * frames + f * w + x] = ((v & 0xff00ff00) | ((v >> 16) & 255) | ((v & 255) << 16)) >>> 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  for (let f = 0; f < frames; f++) tex.add(f, 0, f * w, 0, w, h);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

// ---------------------------------------------------------------------------------------------------------
// Cave walls: one iso block per wall tile (96 x 48 texel top diamond, faces hanging under it)
// ---------------------------------------------------------------------------------------------------------
export const WALL_TALL = 46, WALL_LOW = 9; // world px
export const BLOCK_W = 96, BLOCK_TOP = 48;

/** Open floor around a wall tile: bit 1 north, 2 west, 4 south, 8 east. */
export const OPEN_N = 1, OPEN_W = 2, OPEN_S = 4, OPEN_E = 8;
const VOIDC = 0x100d0f; // the rock mass beyond the walls (groundPaint's VOID)
const PERIOD = 4, FC = 8; // face pattern repeats every 4 tiles (192 texels = 24 chunk cells), so faces run on seamlessly

/**
 * A cave wall tile (Murat 2026-11-07: only the inside should look like a wall, no blocky border): a rock face only on
 * the sides that look onto open floor (south and east faces, which the iso view shows), its pattern carried on from
 * tile to tile so a run of wall reads as one rough face; the top is the dark rock mass itself, with only a crumbly
 * lit lip along the edges that meet the room. Walls with no floor in front are just that dark mass at ground level.
 * `px`/`py` are the tile's position (mod 4) for the seamless faces.
 */
export function wallTexture(scene: Phaser.Scene, hW: number, open: number, px: number, py: number): string {
  const faces = open & (OPEN_S | OPEN_E);
  if (!faces) { px = 0; py = 0; } // a bare top: where it is doesn't matter
  const key = `dg_wall_${hW}_${open}_${px}_${py}`;
  if (scene.textures.exists(key)) return key;
  const HT = Math.round(hW * TX), W = BLOCK_W, H = BLOCK_TOP + HT;
  const tex = scene.textures.createCanvas(key, W, H)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(W, H), d = img.data;
  const set = (x: number, y: number, c: number) => { const o = (y * W + x) * 4; d[o] = (c >> 16) & 255; d[o + 1] = (c >> 8) & 255; d[o + 2] = c & 255; d[o + 3] = 255; };
  const P = PERIOD * 48, cells = P / FC;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ex = Math.abs(x + 0.5 - 48) / 48 + Math.abs(y + 0.5 - 24) / 24;
    if (ex <= 1) {
      // the top: the dark rock mass; a ragged lit lip only along the edges that meet open floor
      let c = vn(x / 7 + px * 13, y / 4 + py * 7, 11) + dth(x, y) * 0.4 > 0.9 ? 0x16120f : VOIDC;
      const north = x >= 48 && y < 24, west = x < 48 && y < 24, south = x < 48 && y >= 24, east = x >= 48 && y >= 24;
      const edgeOpen = (north && open & OPEN_N) || (west && open & OPEN_W) || (south && open & OPEN_S) || (east && open & OPEN_E);
      if (edgeOpen && ex > 0.9 - hash(x, y, 12) * 0.06) c = ex > 0.96 ? ROCK[3] : ROCK[2];
      set(x, y, c);
      continue;
    }
    let face = 0, u = 0, w = 0;
    if (x < 48) { const t = 24 + (x + 0.5) / 2; if (y >= t && y < t + HT) { face = 1; u = x; w = y - t; } }
    else { const t = 24 + (W - x - 0.5) / 2; if (y >= t && y < t + HT) { face = 2; u = x - 48; w = y - t; } }
    if (!face || !(face === 1 ? open & OPEN_S : open & OPEN_E)) continue;
    // world position along the face, so the next tile's face carries on from this one
    const uw = (face === 1 ? px * 48 + u : (((PERIOD - py) % PERIOD) * 48) + u) % P;
    const fu = uw, fv = w * 1.25 + face * 3;
    const gx = Math.floor(fu / FC), gy = Math.floor(fv / FC);
    let d1 = 1e9, d2 = 1e9, cid = 0, bx = 0, by = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cxw = ((gx + i) % cells + cells) % cells, cy = gy + j;
      const ppx = (gx + i + 0.15 + hash(cxw, cy, 21 + face) * 0.7) * FC, ppy = (cy + 0.15 + hash(cxw, cy, 22 + face) * 0.7) * FC;
      const dx = fu - ppx, dy = fv - ppy, dd = Math.sqrt(dx * dx + dy * dy);
      if (dd < d1) { d2 = d1; d1 = dd; cid = cxw * 7919 + cy; bx = dx; by = dy; } else if (dd < d2) d2 = dd;
    }
    const tone = hash(cid, 3, 23 + face), lit = -(bx * (face === 1 ? 0.8 : 0.3) + by) / FC;
    let lv = (face === 1 ? 3.1 : 2.0) + (tone - 0.5) * 1.4 + lit * 1.3 - (d1 / FC) * (d1 / FC) * 0.9 + dth(x, y) * 0.9;
    lv += Math.sin(w * 0.55 + Math.sin(uw / P * Math.PI * 4) * 2.2) * 0.25; // strata
    if (w < 2) lv += 1.2; // the lit lip
    lv -= Math.max(0, w - (HT - 7)) / 7 * 1.6; // damp, dark foot
    if (d2 - d1 < 0.9) lv = w < 2 ? 2 : 0.4; // cracks between chunks
    let c = ROCK[Math.max(0, Math.min(ROCK.length - 1, Math.floor(lv)))];
    // roots and pale threads of fungus hanging from the top of the face
    const col = uw + face * 61;
    if (hash(col, 0, 41) < 0.05 && w < 4 + hash(col, 1, 42) * HT * 0.5) c = (w & 3) === 0 ? 0x2c2016 : 0x46321f;
    if (hash(col, 2, 43) < 0.012 && w < 10) c = 0x8a8a76;
    if (face === 1 && vn(uw / 6, w / 14, 44) > 0.8 && (x + y) % 3 === 0) c = 0x6f6a62; // a wet seep
    set(x, y, c);
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

// ---------------------------------------------------------------------------------------------------------
// Gates: a timber barricade block per gate tile (same iso block as the walls), and the posts it hangs from
// ---------------------------------------------------------------------------------------------------------

/** A gate's opening, in world px: how high the portcullis is, and the frame round it. */
export const GATE_OPEN_H = 34, GATE_FRAME_H = 40, GATE_FRAMES = 8;
export interface GateShape { sx: number; sy: number; len: number; w: number; h: number; ox: number; oy: number }
/**
 * The geometry of a gate seen in iso: `sx, sy` the screen step per world px along the gate's line, `len` its length in
 * world px; texture size `w, h` (texels) and its foot centre `ox, oy` (texels).
 */
export function gateShape(sx: number, sy: number, len: number): GateShape {
  const w = Math.ceil((Math.abs(sx) * len + 20) * TX), h = Math.ceil((GATE_FRAME_H + 16 + Math.abs(sy) * len) * TX);
  return { sx, sy, len, w, h, ox: w / 2, oy: h - Math.ceil((Math.abs(sy) * len / 2 + 4) * TX) };
}

/**
 * A lair gate (Murat 2026-11-07: proper gates with a proper animation): two squared timber posts, a heavy lintel with
 * a horned skull, and a portcullis of iron-shod stakes between them, drawn along the gate's line in iso. Frame f lifts
 * the portcullis f/(GATE_FRAMES-1) of the way up into the lintel, so the sheet plays forward to open, back to shut.
 */
export function gateSheet(scene: Phaser.Scene, key: string, g: GateShape) {
  if (scene.textures.exists(key)) return;
  const L = g.len * TX, sx = g.sx, sy = g.sy, HO = GATE_OPEN_H * TX, HF = GATE_FRAME_H * TX;
  const base = (t: number) => [g.ox + sx * (t - 0.5) * L, g.oy + sy * (t - 0.5) * L]; // t 0..1 along the gate's foot
  const along = Math.hypot(sx, sy) * L; // screen length in texels
  sheet(scene, key, g.w, g.h, GATE_FRAMES, (p, f) => {
    const rise = HO * f / (GATE_FRAMES - 1);
    // the portcullis: stakes every few texels, two iron-banded rails, spiked feet; clipped under the lintel
    const nBars = Math.max(3, Math.round(along / 9));
    for (let b = 0; b <= nBars; b++) {
      const t = 0.04 + 0.92 * b / nBars, [bx, by] = base(t), top = by - HO, x = Math.round(bx);
      const y0 = Math.max(top + 2, by - HO - rise), y1 = by - rise - 2;
      for (let y = Math.ceil(y0); y <= y1; y++) {
        p.px(x - 2, y, OLDWOOD[0]); p.px(x - 1, y, OLDWOOD[1]); p.px(x, y, OLDWOOD[1]); p.px(x + 1, y, OLDWOOD[2]);
        if ((y + b * 3) % 11 === 0) p.px(x - 1, y, OLDWOOD[2]);
      }
      if (by - rise > top + 2) { const ty = Math.round(by - rise - 2); p.rect(x - 2, ty - 1, 4, 2, IRON.lo); p.px(x - 1, ty + 1, IRON.mid); p.px(x, ty + 1, IRON.lo); p.px(x - 1, ty + 2, IRON.hi); } // iron-shod points
    }
    for (const rf of [0.28, 0.72]) {
      for (let k = 0; k <= along; k++) {
        const t = k / along, [bx, by] = base(t), y = by - rise - HO * rf, top = by - HO;
        if (y < top + 3) continue;
        p.px(bx, y, IRON.hi); p.px(bx, y + 1, IRON.mid); p.px(bx, y + 2, IRON.lo);
        if (k % 9 === 4) p.px(bx, y + 1, IRON.hi); // rivets
      }
    }
    // the posts
    for (const t of [0, 1]) {
      const [bx, by] = base(t), x = Math.round(bx) - 5;
      p.shaft(x, by - HF, x, by, 10, OLDWOOD);
      for (const yy of [by - HF + 9, by - HF / 2, by - 8]) { p.rect(x, yy, 10, 3, IRON.lo); p.rect(x, yy, 10, 1, IRON.mid); p.px(x + 2, yy + 1, IRON.hi); p.px(x + 7, yy + 1, IRON.hi); }
    }
    // the lintel, along the top of the opening, heavy and dark, lit on its upper edge
    for (let k = -4; k <= along + 4; k++) {
      const t = k / along, [bx, by] = base(t), y = by - HF;
      for (let j = -2; j < 10; j++) p.px(bx, y + j, j < 0 ? OLDWOOD[0] : j > 7 ? 0x241a12 : (k * 7 + j * 3) % 13 === 0 ? OLDWOOD[2] : j === 4 && k % 14 < 2 ? IRON.mid : OLDWOOD[1]);
    }
    const [mx, my] = base(0.5);
    skull(p, Math.round(mx), Math.round(my - HF - 6), true);
    // ropes from the lintel down to the portcullis' top rail
    if (rise < HO - 6) for (const t of [0.25, 0.75]) {
      const [bx, by] = base(t);
      for (let y = by - HF + 8; y < by - rise - HO * 0.72; y++) p.px(bx + ((y & 1) ? 1 : 0), y, ROPE);
    }
  }, 0);
}


// ---------------------------------------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------------------------------------
export const BRAZIER = { w: 26, h: 44, frames: 6 };
export const ROPE_ART = { w: 16, h: 210, frames: 4 };
export const PIT = { w: 132, h: 64 };
export const STAIR_UP = { w: 84, h: 96 };
export const SINK = { w: 168, h: 92 };

const FLAME = [0xfff2b0, 0xffd36a, 0xffa040, 0xe0641e, 0xa83a14, 0x5e1e0c];

function brazier(p: Pen, f: number) {
  const cx = 13;
  // three splayed iron legs and a ring
  p.line(cx - 2, 26, cx - 9, 43, IRON.mid); p.line(cx - 3, 26, cx - 10, 43, IRON.lo);
  p.line(cx + 2, 26, cx + 9, 43, IRON.lo); p.line(cx + 3, 26, cx + 10, 43, IRON.lo);
  p.line(cx, 27, cx, 43, 0x2e3136);
  p.rect(cx - 6, 34, 13, 1, IRON.lo);
  // the bowl: a riveted iron dish
  for (let y = 18; y <= 26; y++) {
    const hw = Math.round(9 - Math.max(0, y - 21) * 1.3);
    for (let x = -hw; x <= hw; x++) {
      const l = x < -hw + 2 ? IRON.hi : x > hw - 3 ? IRON.lo : y === 18 ? IRON.hi : IRON.mid;
      p.px(cx + x, y, (x + y) % 5 === 0 && y === 22 ? 0x2e3136 : l);
    }
  }
  p.rect(cx - 9, 18, 19, 1, 0x9aa0a8);
  // glowing coals
  for (let x = -8; x <= 8; x++) p.px(cx + x, 17, hash(x, f, 5) < 0.4 ? 0xffb04a : 0xc4461a);
  for (let x = -6; x <= 6; x++) p.px(cx + x, 16, hash(x, f, 6) < 0.5 ? 0xff7a2a : 0x8a2a10);
  // flames: tongues that rise and lick sideways frame by frame
  for (let x = -7; x <= 7; x++) {
    const base = 1 - Math.abs(x) / 8;
    const h = Math.round(4 + base * 13 * (0.7 + 0.3 * Math.sin(f * 1.7 + x * 1.3)) + hash(x, f, 7) * 3);
    const lean = Math.round(Math.sin(f * 1.05 + 0.5) * 1.5);
    for (let k = 0; k < h; k++) {
      const t = k / h, ci = Math.min(FLAME.length - 1, Math.floor(t * 4.2 + Math.abs(x) * 0.22));
      p.px(cx + x + (k > h * 0.55 ? lean : 0), 16 - k, FLAME[ci]);
    }
  }
  // sparks
  for (let i = 0; i < 3; i++) {
    const sx = cx + Math.round((hash(i, f, 8) - 0.5) * 12), sy = 2 + Math.round(hash(i, f, 9) * 8);
    p.px(sx, sy, i ? 0xffb04a : 0xffe08a);
  }
}

function rope(p: Pen, f: number) {
  const H = ROPE_ART.h;
  const sway = Math.sin((f / ROPE_ART.frames) * Math.PI * 2) * 1.6;
  for (let y = 0; y < H - 10; y++) {
    const t = y / H, x = 7 + sway * t * t;
    const twist = (y + Math.round(x)) % 4;
    p.px(x, y, twist < 2 ? ROPE : 0x6e5c3a); p.px(x + 1, y, twist === 1 ? 0xbca474 : 0x7e6a44);
    if (y % 26 === 20) { p.rect(x - 1, y, 4, 2, 0x6e5c3a); p.px(x, y, 0xbca474); } // knots to climb by
  }
  // the end coiled on the floor
  for (let a = 0; a < 26; a++) {
    const an = (a / 26) * Math.PI * 2;
    p.px(8 + Math.cos(an) * 6, H - 6 + Math.sin(an) * 2.5, a % 3 ? ROPE : 0x6e5c3a);
    p.px(8 + Math.cos(an) * 4, H - 6 + Math.sin(an) * 1.6, a % 2 ? 0x7e6a44 : ROPE);
  }
}

/**
 * The stair down: a stone-lined well in the floor (an iso diamond) with steps going down away from the viewer into
 * the dark. The far walls show their courses of blocks, each tread has a lit lip and the shadow of the one above,
 * the treads dim with depth, and a faint warm glow comes up from far below (the next floor's torches), so it reads
 * as a way on, not a pit. A timber frame and big rim stones round the mouth.
 */
function pit(p: Pen) {
  const { w, h } = PIT, cx = w / 2, cy = 30, hw = w / 2 - 12, hh = 26, STEPS = 6, SH = 5, DEEP = STEPS * SH;
  // world square a,b in [-1,1] (a east, b south) seen in iso; z is depth below the floor (texels)
  const scr = (a: number, b: number, z: number) => [cx + (a - b) * hw / 2, cy + (a + b) * hh / 2 + z];
  const inHole = (x: number, y: number) => Math.abs(x + 0.5 - cx) / hw + Math.abs(y + 0.5 - cy) / hh <= 1;
  const stepOf = (b: number) => Math.min(STEPS - 1, Math.floor((1 - b) / 2 * STEPS)); // 0 nearest .. far = deepest
  const zOf = (b: number) => (stepOf(b) + 1) * SH;
  const put = (a: number, b: number, z: number, c: number) => {
    const [x, y] = scr(a, b, z), X = Math.floor(x), Y = Math.floor(y);
    if (inHole(X, Y)) p.px(X, Y, c);
  };
  const N = 220;
  // 1. the west wall (a = -1), its foot following the steps down: in shadow, courses of blocks
  for (let i = 0; i <= N; i++) {
    const b = -1 + 2 * i / N, zf = zOf(b);
    for (let z = 0; z <= zf; z += 0.5) {
      const row = Math.floor(z / 4), u = (b + 1) * 30 + (row % 2) * 4, joint = z % 4 < 0.7 || u % 8 < 0.8;
      let lv = 2.2 - z / DEEP * 1.6 + (hash(Math.floor(u / 8), row, 83) - 0.5) * 0.8 + (joint ? -1.1 : 0);
      if (z < 1.2) lv += 1;
      put(-1, b, z, ROCK[Math.max(0, Math.min(6, Math.round(lv)))]);
    }
  }
  // 2. the north wall (a over -1..1 at b = -1), lit from the west, with the dark arch the stair goes on into
  for (let i = 0; i <= N; i++) {
    const a = -1 + 2 * i / N;
    for (let z = 0; z <= DEEP; z += 0.5) {
      const row = Math.floor(z / 4), u = (a + 1) * 30 + (row % 2) * 4, joint = z % 4 < 0.7 || u % 8 < 0.8;
      let lv = 3.1 - z / DEEP * 1.8 + (hash(Math.floor(u / 8), row, 84) - 0.5) * 0.8 + (joint ? -1.1 : 0);
      if (z < 1.2) lv += 1;
      let c = ROCK[Math.max(0, Math.min(6, Math.round(lv)))];
      const ah = DEEP - z, archH = 17 - Math.max(0, (Math.abs(a) - 0.18) / 0.27) ** 2 * 7;
      if (Math.abs(a) < 0.45 && ah < archH) { // the opening, black, a warm glow from far below at its foot
        c = ah < 3 ? 0x4a220e : ah < 6 ? 0x2a140a : 0x080606;
        if (Math.abs(ah - archH) < 1.2) c = ROCK[4]; // the arch's stones
      }
      put(a, -1, z, c);
    }
  }
  // 3. the treads, far to near: each a little lower than the one before it, lit lip at its far edge
  for (let i = 0; i <= N; i++) {
    const b = -1 + 2 * i / N, k = stepOf(b), z = zOf(b), fr = ((1 - b) / 2 * STEPS) % 1; // fr 0 near edge .. 1 far edge
    for (let jj = 0; jj <= N; jj++) {
      const a = -1 + 2 * jj / N;
      const [x, y] = scr(a, b, z);
      let lv = 5.6 - k * 0.75 + dth(Math.floor(x), Math.floor(y)) * 0.7;
      if (fr > 0.82) lv += 1.2; // the worn lip where it drops to the next step
      if (fr < 0.14) lv -= 1.4; // under the lip of the step above
      if (a < -0.8) lv -= 1.2; // shade of the west wall
      if (hash(Math.floor(a * 30), k, 85) < 0.06) lv -= 1; // chips
      let c = ROCK[Math.max(0, Math.min(6, Math.round(lv)))];
      if (k === STEPS - 1 && Math.abs(a) < 0.45) c = fr > 0.6 ? 0x3a1a0c : 0x2a1810; // the glow on the last step
      put(a, b, z, c);
    }
  }
  // 4. rim stones, and a timber frame along the two near edges
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = Math.abs(x + 0.5 - cx) / hw + Math.abs(y + 0.5 - cy) / hh;
    if (e <= 1 || e > 1.24) continue;
    const a = Math.atan2((y - cy) / hh, (x - cx) / hw), cell = Math.floor((a + Math.PI) * 4.5);
    const ring = (e - 1) / 0.24, near = y > cy + 1;
    if (near && ring < 0.55) {
      const grain = (Math.round(x * 0.5 + (x < cx ? -y : y)) % 5 === 0);
      p.px(x, y, ring < 0.12 ? OLDWOOD[0] : ring > 0.42 ? OUTLINE : grain ? OLDWOOD[2] : OLDWOOD[1]);
      continue;
    }
    const edge = Math.abs(((a + Math.PI) * 4.5) % 1 - 0.5) > 0.42 || ring > 0.85;
    p.px(x, y, edge ? OUTLINE : ROCK[Math.min(6, 3 + (y < cy ? 1 : 0) + (hash(cell, 0, 5) < 0.4 ? 1 : 0) - (ring > 0.6 ? 1 : 0))]);
  }
  for (const [px, py] of [[cx - hw - 4, cy + 1], [cx + hw + 3, cy + 1], [cx, cy + hh + 4]]) { p.px(px, py, IRON.hi); p.px(px + 1, py, IRON.lo); p.px(px, py + 1, IRON.mid); }
}

export const TORCH = { w: 18, h: 58, frames: 6 };
/** A torch on a stake: a squared post, an iron cup, a pitch-soaked rag burning in it. */
function torchPost(p: Pen, f: number) {
  const { h } = TORCH, cx = 9;
  p.shaft(cx - 1, 22, cx - 1, h - 2, 3, OLDWOOD);
  for (const y of [30, h - 10]) { p.px(cx - 1, y, ROPE); p.px(cx, y, ROPE); p.px(cx + 1, y, 0x6e5e3e); }
  // the cup
  for (let y = 16; y <= 22; y++) {
    const hw = Math.round(4 - Math.max(0, y - 19) * 0.8);
    for (let x = -hw; x <= hw; x++) p.px(cx + x, y, x < -hw + 1 ? IRON.hi : x > hw - 1 ? IRON.lo : y === 16 ? IRON.hi : IRON.mid);
  }
  for (let x = -3; x <= 3; x++) p.px(cx + x, 15, hash(x, f, 5) < 0.5 ? 0xffb04a : 0xc4461a);
  // the flame
  for (let x = -4; x <= 4; x++) {
    const base = 1 - Math.abs(x) / 5;
    const fh = Math.round(3 + base * 10 * (0.7 + 0.3 * Math.sin(f * 1.7 + x * 1.3)) + hash(x, f, 7) * 2);
    const lean = Math.round(Math.sin(f * 1.05 + 0.5) * 1.2);
    for (let k = 0; k < fh; k++) {
      const t = k / fh, ci = Math.min(FLAME.length - 1, Math.floor(t * 4.2 + Math.abs(x) * 0.3));
      p.px(cx + x + (k > fh * 0.5 ? lean : 0), 14 - k, FLAME[ci]);
    }
  }
  if (f % 2 === 0) p.px(cx + ((f * 3) % 5) - 2, 1 + (f % 3), 0xffd36a); // a spark
}

/** Steps hewn up into the rock toward a black opening, with a wooden lintel and a skull nailed over it. */
function stairUp(p: Pen) {
  const { w, h } = STAIR_UP, cx = w / 2;
  // the rock outcrop
  for (let y = 8; y < h - 2; y++) for (let x = 0; x < w; x++) {
    const nx = (x + 0.5 - cx) / (w / 2 - 2), ny = (y - h + 2) / (h - 10);
    const r = nx * nx + ny * ny * 0.9 + (vn(x / 6, y / 6, 3) - 0.5) * 0.25;
    if (r > 1) continue;
    const lit = -(nx * 0.7 + ny * 0.3);
    p.px(x, y, ROCK[Math.max(1, Math.min(5, Math.round(2.6 + lit * 1.6 + (vn(x / 3, y / 3, 4) - 0.5) * 1.4 + dth(x, y))))]);
  }
  // the dark opening (an arch)
  const ax = cx, aw = 15, top = 26, bot = 66;
  for (let y = top; y < bot; y++) for (let x = ax - aw; x <= ax + aw; x++) {
    const ar = y < top + aw ? Math.hypot(x - ax, (y - top - aw) * 1.1) <= aw : true;
    if (ar) p.px(x, y, y > bot - 6 ? 0x0b0808 : 0x050404);
  }
  // treads going up into it: each narrower and darker
  for (let k = 0; k < 6; k++) {
    const y0 = h - 6 - k * 6, half = 24 - k * 2;
    for (let x = -half; x <= half; x++) {
      p.px(cx + x, y0, k < 4 ? ROCK[5 - Math.floor(k / 2)] : ROCK[2]);
      p.px(cx + x, y0 + 1, ROCK[4 - Math.floor(k / 2)]);
      for (let j = 2; j < 6; j++) p.px(cx + x, y0 + j, ROCK[Math.max(0, 2 - Math.floor(k / 2))]);
    }
    if (k % 2 === 0) p.px(cx - half + 3 + k * 2, y0, 0x8a7c66);
  }
  // wooden lintel, rope lashings and a horned skull
  p.shaft(ax - aw - 3, top + 1, ax + aw + 3, top + 1, 3, OLDWOOD);
  p.shaft(ax - aw - 2, top + 2, ax - aw - 2, bot - 2, 3, OLDWOOD);
  p.shaft(ax + aw - 1, top + 2, ax + aw - 1, bot - 2, 3, OLDWOOD);
  skull(p, ax, top - 4, true);
}

/** A beast skull (a boar's or a bull's): snout down, eye holes, curved horns. */
function skull(p: Pen, x: number, y: number, horns: boolean) {
  for (let j = -4; j <= 5; j++) for (let i = -4; i <= 4; i++) {
    const hw = j < 1 ? 4 : 4 - Math.floor((j - 1) * 0.7);
    if (Math.abs(i) > hw) continue;
    p.px(x + i, y + j, i < -1 ? BONE.hi : i > 2 ? BONE.lo : BONE.mid);
  }
  p.px(x - 2, y - 1, OUTLINE); p.px(x - 2, y, OUTLINE); p.px(x + 2, y - 1, OUTLINE); p.px(x + 2, y, OUTLINE);
  p.px(x - 1, y + 4, BONE.lo); p.px(x + 1, y + 4, BONE.lo);
  if (horns) for (let k = 0; k < 7; k++) {
    p.px(x - 5 - k, y - 3 - Math.round(Math.sin(k / 6 * 2) * 3), k > 4 ? 0x6a5c48 : BONE.hi);
    p.px(x + 5 + k, y - 3 - Math.round(Math.sin(k / 6 * 2) * 3), k > 4 ? 0x5a4c38 : BONE.mid);
  }
}

/** The sinkhole in the woods: a ragged black mouth, earth and roots round the lip. */
function sinkhole(p: Pen) {
  const { w, h } = SINK, cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x + 0.5 - cx) / (w / 2 - 6), ny = (y + 0.5 - cy) / (h / 2 - 4);
    const a = Math.atan2(ny, nx), wob = 1 + (vn(Math.cos(a) * 3 + 5, Math.sin(a) * 3 + 5, 7) - 0.5) * 0.35;
    const r = Math.hypot(nx, ny) / wob;
    if (r > 1.25) continue;
    if (r <= 0.82) {
      // the throat: earth walls dropping into black (lit on the far side)
      const far = ny < 0 ? 1 - r / 0.82 : 0;
      const lv = r > 0.7 && ny > -0.2 ? 1 : 0;
      p.px(x, y, far > 0.6 || lv ? 0x0c0909 : r > 0.62 && ny < 0 ? 0x2a1d14 : 0x050404);
      if (r > 0.6 && ny < -0.2 && hash(x, y, 3) < 0.25) p.px(x, y, 0x3b2a1c);
    } else {
      // the lip: crumbling earth, stones, roots
      const lip = (r - 0.82) / 0.43, e = vn(x / 4, y / 4, 9);
      const col = lip < 0.25 ? 0x3a2a1c : e > 0.6 ? 0x5b4630 : 0x4a3826;
      if (lip > 0.7 && hash(x, y, 4) < 0.5 + (lip - 0.7) * 1.5) continue; // ragged outer edge
      p.px(x, y, col);
      if (hash(Math.floor(x / 3), Math.floor(y / 3), 5) < 0.08) p.px(x, y, 0x7a6e5e);
    }
  }
  // roots crawling over the lip and down into the hole
  for (let k = 0; k < 9; k++) {
    let x = cx + (hash(k, 1, 11) - 0.5) * w * 0.8, y = cy + (hash(k, 2, 11) < 0.5 ? -1 : 1) * h * 0.38;
    const dx = (cx - x) / 30, dy = (cy - y) / 30;
    for (let s = 0; s < 14 + hash(k, 3, 11) * 10; s++) {
      p.px(x, y, s % 4 ? 0x5a3f28 : 0x3a281a); p.px(x + 1, y, 0x3a281a);
      x += dx + (hash(k, s, 12) - 0.5) * 0.8; y += dy + (hash(k, s, 13) - 0.5) * 0.6;
    }
  }
}

/** A stake hammered in at the lip, the rope tied to it and running down into the hole. */
function ropeStake(p: Pen) {
  p.shaft(6, 6, 6, 34, 3, WOOD);
  p.px(6, 5, WOOD[0]); p.px(7, 4, WOOD[1]);
  for (let k = 0; k < 4; k++) p.rect(5, 12 + k * 2, 5, 1, k % 2 ? ROPE : 0x6e5c3a);
  for (let k = 0; k < 18; k++) p.px(9 + k, 15 + k * 1.1, k % 3 ? ROPE : 0x6e5c3a);
}

export const RACK = { w: 50, h: 54 }, POLE = { w: 30, h: 58 }, BONES = { w: 40, h: 20 }, WEB = { w: 84, h: 46 }, BED = { w: 190, h: 100 }, SPIKE = { w: 22, h: 44 };
const HIDE = [[0x6e4a2e, 0x55381f, 0x3c2614], [0x5e5850, 0x46413b, 0x2e2a26], [0x7a5a3a, 0x5e4228, 0x3e2a18]];

/** A drying rack: two posts, a crossbar, a stretched hide laced to the frame. */
function rack(p: Pen, v: number) {
  const { w, h } = RACK, [hl, hm, hd] = HIDE[v % HIDE.length];
  p.shaft(6, 6, 4, h - 2, 3, OLDWOOD); p.shaft(w - 9, 6, w - 7, h - 2, 3, OLDWOOD);
  p.shaft(2, 8, w - 3, 8, 3, OLDWOOD);
  // the hide: a ragged rounded shape, lighter flesh side with dark patches
  const x0 = 9, x1 = w - 11, y0 = 11, y1 = h - 12;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const nx = (x - (x0 + x1) / 2) / ((x1 - x0) / 2), ny = (y - (y0 + y1) / 2) / ((y1 - y0) / 2);
    const r = Math.max(Math.abs(nx) ** 3, Math.abs(ny) ** 3) + (vn(x / 3, y / 3, v) - 0.5) * 0.5;
    if (r > 1) continue;
    const s = vn(x / 4 + v, y / 4, 31) + dth(x, y) * 0.4;
    p.px(x, y, s > 0.68 ? hd : nx < -0.3 ? hl : hm);
    if (hash(x, y, 33 + v) < 0.02) p.px(x, y, 0x2a1810);
  }
  // lacing
  for (let y = y0 + 2; y < y1; y += 4) { p.px(x0 - 1, y, ROPE); p.px(x0 - 2, y + 1, ROPE); p.px(x1 + 1, y, ROPE); p.px(x1 + 2, y + 1, ROPE); }
  for (let x = x0 + 2; x < x1; x += 5) { p.px(x, y0 - 1, ROPE); p.px(x, y0 - 2, ROPE); }
  // a dark sigil daubed on it (the Hide Rite's mark: three claw strokes)
  for (let k = -1; k <= 1; k++) for (let j = 0; j < 9; j++) p.px((x0 + x1) / 2 + k * 4 + Math.round(j * 0.3), y0 + 8 + j, 0x5a1610);
}

/** A stake topped with a horned skull, rags and a string of teeth. */
function skullPole(p: Pen, v: number) {
  const { w, h } = POLE, cx = Math.round(w / 2);
  p.shaft(cx - 1, 14, cx - 1 + (v % 2), h - 2, 3, OLDWOOD);
  skull(p, cx, 10, v % 3 !== 2);
  // rags
  for (let j = 0; j < 14; j++) for (let i = 0; i < 4; i++) if (hash(i, j, v) < 0.8 - j * 0.03) p.px(cx + 2 + i + Math.round(j * 0.15), 18 + j, j % 4 === 0 ? 0x3a2418 : 0x5a3424);
  // teeth on a thong
  for (let k = 0; k < 7; k++) { const x = cx - 6 + k * 2, y = 20 + Math.round(Math.sin(k / 6 * Math.PI) * 3); p.px(x, y, 0x5a4a38); p.px(x, y + 1, BONE.hi); }
}

function bones(p: Pen, v: number) {
  const { w, h } = BONES;
  for (let k = 0; k < 6; k++) {
    const x = 4 + hash(k, v, 1) * (w - 10), y = 4 + hash(k, v, 2) * (h - 8), a = hash(k, v, 3) * Math.PI, L = 4 + hash(k, v, 4) * 5;
    const dx = Math.cos(a), dy = Math.sin(a) * 0.5;
    for (let s = -L; s <= L; s++) p.px(x + dx * s, y + dy * s, s < 0 ? BONE.hi : BONE.mid);
    p.px(x + dx * L + 1, y + dy * L, BONE.hi); p.px(x - dx * L - 1, y - dy * L, BONE.mid);
  }
  if (v % 2 === 0) skull(p, w / 2, h / 2 - 1, false);
}

/** A sheet of old web strung across the floor: spokes and sagging rings. */
function web(p: Pen, v: number) {
  const { w, h } = WEB, cx = w / 2 + (hash(v, 0, 1) - 0.5) * 10, cy = h / 2;
  const N = 9;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2 + hash(k, v, 2) * 0.4;
    for (let s = 0; s < 46; s++) {
      const x = cx + Math.cos(a) * s, y = cy + Math.sin(a) * s * 0.52;
      if (x < 0 || x >= w || y < 0 || y >= h) break;
      p.px(x, y, 0xb8b4a8, 0.5 - s * 0.008);
    }
  }
  for (let r = 6; r < 44; r += 5 + (r >> 3)) {
    for (let a = 0; a < Math.PI * 2; a += 0.6 / r * 3) {
      const sag = Math.sin(a * N) * 0.8;
      p.px(cx + Math.cos(a) * (r + sag), cy + Math.sin(a) * (r + sag) * 0.52, 0xd0ccc0, 0.42 - r * 0.006);
    }
  }
  // husks caught in it
  for (let k = 0; k < 3; k++) { const x = cx + (hash(k, v, 5) - 0.5) * 50, y = cy + (hash(k, v, 6) - 0.5) * 24; p.rect(x, y, 2, 3, 0x9a968a); p.px(x, y + 3, 0x5a564c); }
}

/** The Hide-Mother's bed: a great heap of hides, furs and bones, a hollow pressed in the middle. */
function hideBed(p: Pen) {
  const { w, h } = BED, cx = w / 2, cy = h / 2;
  for (let k = 0; k < 26; k++) {
    const a = hash(k, 0, 1) * Math.PI * 2, rr = Math.sqrt(hash(k, 1, 1)) * 0.75;
    const bx = cx + Math.cos(a) * rr * (w / 2 - 22), by = cy + Math.sin(a) * rr * (h / 2 - 14);
    const rx = 14 + hash(k, 2, 1) * 16, ry = rx * 0.5, [hl, hm, hd] = HIDE[k % HIDE.length];
    for (let y = Math.floor(by - ry); y <= by + ry; y++) for (let x = Math.floor(bx - rx); x <= bx + rx; x++) {
      const nx = (x - bx) / rx, ny = (y - by) / ry, r = nx * nx + ny * ny + (vn(x / 3, y / 3, k) - 0.5) * 0.4;
      if (r > 1) continue;
      const lit = -(nx + ny) * 0.5, fur = vn(x / 1.3, y / 3.5, k + 9);
      p.px(x, y, r > 0.82 ? hd : lit + fur * 0.6 > 0.45 ? hl : fur > 0.55 ? hd : hm);
    }
  }
  // the hollow where she lies
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x - cx) / 34, ny = (y - cy) / 15;
    const r = nx * nx + ny * ny;
    if (r < 1) p.px(x, y, 0x1a100a, 0.55 * (1 - r));
  }
  for (let k = 0; k < 12; k++) {
    const a = hash(k, 3, 2) * Math.PI * 2, x = cx + Math.cos(a) * (w / 2 - 14), y = cy + Math.sin(a) * (h / 2 - 8), L = 4 + hash(k, 4, 2) * 5, b = hash(k, 5, 2) * Math.PI;
    for (let s = -L; s <= L; s++) p.px(x + Math.cos(b) * s, y + Math.sin(b) * s * 0.5, s < 0 ? BONE.hi : BONE.mid);
  }
  skull(p, cx - 50, cy + 18, true); skull(p, cx + 56, cy + 10, false); skull(p, cx + 18, cy - 30, true);
}

/** A stalagmite: a drip-built spike of pale rock. */
function spike(p: Pen, v: number) {
  const { w, h } = SPIKE, cx = w / 2 + (v % 2 ? 1 : -1);
  for (let y = 2 + v * 3; y < h - 1; y++) {
    const t = (y - 2 - v * 3) / (h - 3 - v * 3), hw = Math.max(0.6, t * (w / 2 - 2) + Math.sin(y * 0.7 + v) * 0.6);
    for (let x = Math.floor(cx - hw); x <= cx + hw; x++) {
      const nx = (x - cx) / hw;
      const lv = Math.round(3.6 - nx * 1.6 + (y % 7 === 0 ? -0.8 : 0) + dth(x, y) * 0.8);
      p.px(x, y, ROCK[Math.max(1, Math.min(6, lv))]);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Quest objects (questObjects.ts): trappers wrapped in silk, the Hide Rite's totems
// ---------------------------------------------------------------------------------------------------------
export const COCOON_ART = { w: 30, h: 50 }, TOTEM = { w: 40, h: 76 };

function cocoon(p: Pen, cut: boolean) {
  const { w, h } = COCOON_ART, cx = w / 2;
  if (!cut) {
    // threads up into the dark and down to the floor
    for (let y = 0; y < 8; y++) p.px(cx + (y % 3 === 0 ? 0 : 1), y, 0xc8c4b8);
    for (let y = 8; y < h - 3; y++) {
      const t = (y - 8) / (h - 11), hw = Math.sin(Math.min(1, t * 1.05) * Math.PI) * 9 + (t > 0.15 && t < 0.3 ? -1.4 : 0); // a head, then shoulders
      for (let x = Math.floor(cx - hw); x <= cx + hw; x++) {
        const nx = (x - cx) / Math.max(1, hw), wrap = Math.sin((y * 1.6 + nx * 3.2)) > 0.6;
        p.px(x, y, wrap ? 0x8e8a7e : nx < -0.35 ? 0xe6e2d4 : nx > 0.45 ? 0x9a968a : 0xc8c4b6);
      }
    }
    // a face pressed against the silk
    p.px(cx - 2, 15, 0x6a5e50); p.px(cx + 2, 15, 0x6a5e50); p.px(cx, 18, 0x5a4e42); p.px(cx - 1, 18, 0x7a6e60);
    // a hand pushing out
    p.rect(cx + 5, 28, 3, 2, 0xb0a08a); p.px(cx + 8, 28, 0xb0a08a);
    for (let k = 0; k < 6; k++) p.px(cx - 8 + k * 3, h - 2, 0xb0aca0);
  } else {
    // cut down: torn husk sagging on the floor, threads hanging
    for (let y = 0; y < 6; y++) p.px(cx + 1, y + 6, 0xc8c4b8);
    for (let y = h - 16; y < h - 2; y++) {
      const t = (y - (h - 16)) / 14, hw = 4 + t * 9;
      for (let x = Math.floor(cx - hw); x <= cx + hw; x++) {
        if (t < 0.5 && Math.abs(x - cx) < hw - 3) continue; // torn open
        p.px(x, y, (x + y) % 3 ? 0xb8b4a6 : 0x8a8678);
      }
    }
    for (let k = 0; k < 4; k++) for (let j = 0; j < 6; j++) p.px(cx - 6 + k * 4 + (j % 2), h - 20 - j, 0xa8a496);
  }
}

function totem(p: Pen, burnt: boolean) {
  const { w, h } = TOTEM, cx = w / 2;
  const wood: [number, number, number] = burnt ? [0x3a302a, 0x241c18, 0x120e0c] : OLDWOOD;
  p.shaft(cx - 2, 10, cx - 2, h - 2, 4, wood);
  p.shaft(cx - 14, 22, cx + 12, 22, 3, wood);
  if (!burnt) {
    // hides hung from the crossbar, sewn in strips (the Rite's patchwork)
    for (let s = 0; s < 3; s++) {
      const x0 = cx - 15 + s * 10, [hl, hm, hd] = HIDE[s];
      for (let y = 24; y < 52 - s * 3; y++) for (let x = x0; x < x0 + 8; x++) {
        if (y > 46 - s * 3 && hash(x, y, s) < 0.5) continue;
        p.px(x, y, (y - 24) % 7 === 6 ? 0x8a6a48 : x === x0 ? hl : x === x0 + 7 ? hd : hm);
      }
    }
    // blood daubs, fat candles at the foot
    for (let k = 0; k < 3; k++) for (let j = 0; j < 7; j++) p.px(cx - 10 + k * 9, 30 + j, 0x6a1a12);
    for (const dx of [-10, 9]) { p.rect(cx + dx, h - 8, 3, 6, 0xd8ccaa); p.px(cx + dx + 1, h - 9, 0xffd36a); p.px(cx + dx + 1, h - 10, 0xff8a3a); }
  } else {
    // charred stumps of hide, embers
    for (let s = 0; s < 3; s++) for (let y = 24; y < 30; y++) for (let x = cx - 15 + s * 10; x < cx - 7 + s * 10; x++) if (hash(x, y, 7) < 0.6) p.px(x, y, 0x1e1612);
    for (let k = 0; k < 8; k++) p.px(cx - 12 + hash(k, 1, 9) * 24, 20 + hash(k, 2, 9) * 50, k % 2 ? 0xff7a2a : 0xc4461a);
  }
  skull(p, cx - 1, 8, true);
}

/** Every dungeon texture (once). */
export function dungeonTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("dg_brazier")) return;
  sheet(scene, "dg_brazier", BRAZIER.w, BRAZIER.h, BRAZIER.frames, brazier, 0.6);
  if (!scene.anims.exists("dg_brazier_burn")) scene.anims.create({ key: "dg_brazier_burn", frames: scene.anims.generateFrameNumbers("dg_brazier", { start: 0, end: BRAZIER.frames - 1 }), frameRate: 9, repeat: -1 });
  sheet(scene, "dg_rope", ROPE_ART.w, ROPE_ART.h, ROPE_ART.frames, rope, 0);
  if (!scene.anims.exists("dg_rope_sway")) scene.anims.create({ key: "dg_rope_sway", frames: scene.anims.generateFrameNumbers("dg_rope", { start: 0, end: ROPE_ART.frames - 1 }), frameRate: 3, repeat: -1, yoyo: true });
  plain(scene, "dg_pit", PIT.w, PIT.h, 1, pit);
  sheet(scene, "dg_torch", TORCH.w, TORCH.h, TORCH.frames, torchPost, 0.5);
  if (!scene.anims.exists("dg_torch_burn")) scene.anims.create({ key: "dg_torch_burn", frames: scene.anims.generateFrameNumbers("dg_torch", { start: 0, end: TORCH.frames - 1 }), frameRate: 10, repeat: -1 });
  sheet(scene, "dg_stair_up", STAIR_UP.w, STAIR_UP.h, 1, stairUp, 0.5);
  plain(scene, "dg_sinkhole", SINK.w, SINK.h, 1, sinkhole);
  sheet(scene, "dg_stake", 32, 36, 1, ropeStake, 0.4);
  sheet(scene, "dg_rack", RACK.w, RACK.h, 3, rack, 0.5);
  sheet(scene, "dg_pole", POLE.w, POLE.h, 3, skullPole, 0.5);
  plain(scene, "dg_bones", BONES.w, BONES.h, 3, bones);
  plain(scene, "dg_web", WEB.w, WEB.h, 3, web);
  plain(scene, "dg_bed", BED.w, BED.h, 1, hideBed);
  sheet(scene, "dg_spike", SPIKE.w, SPIKE.h, 3, spike, 0.5);
  // a pale shaft of daylight falling down the sinkhole
  if (!scene.textures.exists("dg_beam")) {
    const t = scene.textures.createCanvas("dg_beam", 32, 128)!, c = t.getContext();
    const g = c.createLinearGradient(0, 0, 32, 0);
    g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g; c.fillRect(0, 0, 32, 128);
    const v = c.createLinearGradient(0, 0, 0, 128);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(0.6, "rgba(0,0,0,1)"); v.addColorStop(0.88, "rgba(0,0,0,0.8)"); v.addColorStop(1, "rgba(0,0,0,0)");
    c.globalCompositeOperation = "destination-in"; c.fillStyle = v; c.fillRect(0, 0, 32, 128);
    t.refresh();
  }
}

export function dungeonQuestTextures(scene: Phaser.Scene) {
  sheet(scene, "qobj_silk", COCOON_ART.w, COCOON_ART.h, 1, (p) => cocoon(p, false), 0.4);
  sheet(scene, "qobj_silk_cut", COCOON_ART.w, COCOON_ART.h, 1, (p) => cocoon(p, true), 0.4);
  sheet(scene, "qobj_totem", TOTEM.w, TOTEM.h, 1, (p) => totem(p, false), 0.5);
  sheet(scene, "qobj_totem_burnt", TOTEM.w, TOTEM.h, 1, (p) => totem(p, true), 0.5);
}
