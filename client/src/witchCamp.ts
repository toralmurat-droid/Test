import Phaser from "phaser";
import { sheet, type Pen } from "./worldProps";
import { hash, dith } from "./bonfireArt";

/**
 * Morwen's camp on the west side of the market square: a patched crimson bell tent with its flap tied open (a
 * lantern swinging in the doorway, charms hanging off the guy ropes, a pennant on the pole), and her alchemy rig: a glass
 * bulb of glowing red brew bubbling over a coal brazier, a copper still dripping into a little flask, and three
 * rune stones turning slowly in the air above it.
 *
 * Bonfire-style pixel art at 1.5 texels per world px: flat colour ramps, ordered dithering, dark outline,
 * light from the top left. Cosmetic only (collision is NPC_DECOR.solid in shared/npcs.ts).
 */
export const TX = 1.5;
export const CAMP_FRAMES = 12;
const N = CAMP_FRAMES;

const step = (pal: number[], v: number, x: number, y: number) => {
  const c = Math.max(0, Math.min(pal.length - 1, v)), i = Math.floor(c);
  return pal[Math.min(pal.length - 1, c - i > dith(x, y) ? i + 1 : i)];
};

const CRIMSON = [0x200a0e, 0x3c1016, 0x5e161e, 0x7e2226, 0x9e3630, 0xb8523e]; // sun-faded, soot-stained red canvas
const SOOT = [0x120e12, 0x1e181c, 0x2c2428, 0x3c3236, 0x4e4246];
const BURLAP = [0x2e2214, 0x4a3820, 0x66502e, 0x84683e, 0x9e8250];
const INSIDE = [0x0c070a, 0x180c10, 0x2a1414, 0x4a2216, 0x7a3c1c, 0xb0602a];
const WOOD = [0x24160c, 0x3e2816, 0x5a3c22, 0x7a5634];
const ROPE = 0x8a7450, ROPE_D = 0x5e4e34;
const GOLD = [0x5a3a10, 0x8a6020, 0xc0902e, 0xe8c25a];
const IRON = [0x16181c, 0x2a2e34, 0x464c54, 0x6c747e, 0x9aa4ae];
const COPPER = [0x2e140a, 0x5a2c14, 0x8e4a22, 0xc0743a, 0xe8a868];
const BREW = [0x22040c, 0x4e0a18, 0x841826, 0xb82c2c, 0xf06a3a, 0xffc890]; // blood-red brew glowing orange where it is hottest
const COALS = [0x1a0e0a, 0x3a120a, 0x7a1e0a, 0xc8460e, 0xff9a2a, 0xffe08a];
const GLASS = [0x1c2228, 0x34404a, 0x5a6c78, 0x9ab4c0, 0xdceef2];
const SLATE = [0x15151a, 0x26262e, 0x3a3a44, 0x54545e, 0x707080];
const RUNE = [0x8a1a10, 0xd8401c, 0xff7a3a, 0xffd08a];

// ---- tent --------------------------------------------------------------------------------------------------
export const TENT_W = 132, TENT_H = 110, TENT_BY = 80; // base centre (pivot) row
const CX = 66, RX = 42, RY = 20, APEX = 20;
const A0 = Math.PI / 2 + 0.12; // the opening faces the viewer, a little to the right
/** Bell tent profile: a short upright wall, then the roof curving in to the pole. */
const prof = (t: number) => (t < 0.12 ? 1 - t * 0.15 : 0.982 * Math.pow((1 - t) / 0.88, 0.92));
const surf = (t: number, a: number, k = 1): [number, number] => [CX + RX * prof(t) * Math.cos(a) * k, TENT_BY - t * (TENT_BY - APEX) + RY * prof(t) * Math.sin(a) * k];
const openW = (t: number) => (t < 0.6 ? 0.46 * (1 - t / 0.6) ** 0.8 : 0);
const PATCHES: [number, number, number, number][] = [[2.55, 0.34, 0.22, 0.13], [0.62, 0.46, 0.2, 0.1], [2.05, 0.7, 0.16, 0.08], [1.0, 0.16, 0.14, 0.1]];

function tent(p: Pen, f: number) {
  const ph = (f / N) * Math.PI * 2;
  // soft shadow on the ground, pushed away from the light
  for (let y = TENT_BY - RY - 4; y <= TENT_BY + RY + 8; y++) for (let x = CX - RX - 10; x <= CX + RX + 18; x++) {
    const dx = (x - CX - 7) / (RX * 1.12), dy = (y - TENT_BY - 4) / (RY * 1.18);
    if (dx * dx + dy * dy <= 1 && dith(x, y) < 0.75) p.px(x, y, 0x000000, 0.4);
  }
  // canvas: forward-map the surface with a depth buffer (front faces win)
  const z = new Float32Array(TENT_W * TENT_H).fill(-9);
  const col = new Uint32Array(TENT_W * TENT_H);
  for (let t = 0; t <= 1.0001; t += 0.004) {
    const hemCut = t < 0.02;
    for (let a = -0.25; a <= Math.PI + 0.25; a += 0.004) {
      const [sx, sy] = surf(t, a), x = Math.round(sx), y = Math.round(sy), d = Math.sin(a);
      if (x < 0 || y < 0 || x >= TENT_W || y >= TENT_H) continue;
      const i = y * TENT_W + x;
      if (d < z[i]) continue;
      if (hemCut && hash(Math.round(a * 60), 1, 3) < 0.35 && t < 0.012) continue; // ragged hem
      z[i] = d;
      let c: number;
      const off = a - A0, w = openW(t);
      if (Math.abs(off) < w) {
        // dark inside, lit by the lantern
        const lx = CX + RX * 0.06, ly = TENT_BY - 15, dd = Math.hypot(x - lx, (y - ly) * 1.3);
        let v = 0.6 + Math.max(0, 1 - dd / 22) * 3.6;
        if (t < 0.05) v += 0.6; // floor
        c = step(INSIDE, v, x, y);
        if (t < 0.06 && ((x + y) % 5 === 0)) c = CRIMSON[2]; // the rug inside
      } else if (Math.abs(off) < w + 0.09 && t < 0.62) {
        // the flap folded back on each side: inner lining catching the light, a fold line
        const k = (Math.abs(off) - w) / 0.09;
        c = step(CRIMSON, 3.6 - k * 1.6 + (off < 0 ? 0.4 : -0.3), x, y);
        if (k > 0.45 && k < 0.6) c = CRIMSON[1];
      } else {
        const pk = a * 9 / Math.PI, panel = Math.floor(pk + 9) % 3, frac = pk - Math.floor(pk);
        const pal = panel === 1 ? SOOT : CRIMSON;
        let v = (pal === SOOT ? 2.0 : 2.6) - Math.cos(a) * 1.1 - Math.max(0, Math.sin(a) - 0.6) * 0.4 + t * 1.1 + (hash(x >> 1, y >> 1, 5) - 0.5) * 0.6;
        if (t < 0.1) v -= (1 - t / 0.1) * 1.3; // mud splashed up the wall
        if (frac < 0.05 || frac > 0.97) v -= 1.2; // stitched seams
        c = step(pal, v, x, y);
        // patches sewn over the tears, with big crude stitches
        for (const [pa, pt, pw, phh] of PATCHES) {
          if (Math.abs(a - pa) < pw / 2 && Math.abs(t - pt) < phh / 2) {
            const edge = Math.abs(a - pa) > pw / 2 - 0.02 || Math.abs(t - pt) > phh / 2 - 0.012;
            c = edge ? ((x + y) % 2 ? GOLD[1] : BURLAP[0]) : step(BURLAP, 2.4 - Math.cos(a) + t, x, y);
          }
        }
        // soot-black valance with scallops where the wall meets the roof
        if (t > 0.115 && t < 0.165 && t - 0.115 > 0.042 * Math.abs(Math.sin(a * 13)) && pal !== SOOT) c = step(SOOT, 2.4 - Math.cos(a), x, y);
        if (t > 0.163 && t < 0.172) c = GOLD[1 + ((x >> 1) & 1)];
        if (t < 0.05 && hash(x, y, 8) < 0.06) c = INSIDE[0]; // small holes near the hem
      }
      col[i] = c;
    }
  }
  for (let y = 0; y < TENT_H; y++) for (let x = 0; x < TENT_W; x++) if (z[y * TENT_W + x] > -9) p.px(x, y, col[y * TENT_W + x]);

  // lantern hanging inside the doorway, swinging a little
  {
    const sw = Math.sin(ph) * 1.4, top = Math.round(TENT_BY - 27), lx = Math.round(CX + RX * 0.06 + sw);
    p.line(CX + Math.round(RX * 0.06), top, lx, top + 5, ROPE_D);
    p.rect(lx - 2, top + 6, 5, 1, IRON[2]);
    for (let j = 0; j < 4; j++) for (let i = -2; i <= 2; i++) p.px(lx + i, top + 7 + j, Math.abs(i) === 2 ? IRON[1] : j === 0 || j === 3 ? IRON[2] : step(RUNE, 2.4 + (1 - Math.abs(i)) * 0.8 + Math.sin(ph * 2) * 0.3, lx + i, top + j));
    p.rect(lx - 1, top + 11, 3, 1, IRON[1]);
  }

  // tie-back cords on the flaps
  for (const s of [-1, 1]) {
    const t = 0.3, [kx, ky] = surf(t, A0 + s * (openW(t) + 0.05));
    p.px(kx, ky, GOLD[3]); p.px(kx + 1, ky, GOLD[2]); p.px(kx, ky + 1, GOLD[1]);
    p.line(kx, ky + 1, kx + s, ky + 5, GOLD[1]); p.px(kx + s, ky + 6, GOLD[2]);
  }

  // centre pole above the apex, crow feathers bound round it, a red pennant
  const [ax, ay] = surf(1, 0);
  for (let y = ay - 13; y <= ay + 1; y++) { p.px(ax - 1, y, WOOD[3]); p.px(ax, y, WOOD[2]); p.px(ax + 1, y, WOOD[1]); }
  p.px(ax, ay - 14, GOLD[3]); p.px(ax - 1, ay - 14, GOLD[2]); p.px(ax, ay - 15, GOLD[2]);
  for (let k = 0; k < 4; k++) { const fx = ax - 3 + k * 2, sw2 = Math.round(Math.sin(ph + k) * 0.6); p.line(fx, ay - 1, fx + (k - 1.5) * 1.5 + sw2, ay + 5, k % 2 ? SOOT[1] : SOOT[3]); }
  for (let i = 0; i < 14; i++) {
    const k = i / 14, hgt = Math.max(1, Math.round(5 * (1 - k * 0.8))), dy = Math.round(Math.sin(ph + i * 0.5) * (0.4 + k * 2));
    for (let j = 0; j < hgt; j++) {
      const lit = Math.sin(ph + i * 0.5 + 1.2);
      p.px(ax + 2 + i, ay - 12 + j + dy, j === hgt - 1 ? CRIMSON[1] : lit > 0.3 ? CRIMSON[4] : lit < -0.4 ? CRIMSON[2] : CRIMSON[3]);
    }
  }

  // guy ropes to stakes, with charms hanging off them (bone, feather, bead) swaying in the wind
  const ropes: [number, number][] = [[Math.PI - 0.45, 0.5], [0.42, 0.5], [Math.PI - 0.05, 0.62]];
  ropes.forEach(([a, t], ri) => {
    const [x0, y0] = surf(t, a), [x1, y1] = surf(0, a, 1.5);
    const sx = Math.round(x1), sy = Math.round(y1);
    for (let j = 0; j < 6; j++) { p.px(sx, sy - j + 2, WOOD[2]); p.px(sx + 1, sy - j + 2, WOOD[0]); } // stake
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0;
    for (let i = 0; i <= n; i++) { const k = i / n; p.px(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * 2, i % 3 ? ROPE : ROPE_D); }
    if (ri === 2) return;
    for (const [k, kind] of [[0.3, 0], [0.55, 1], [0.78, 2]] as const) {
      const hx = x0 + (x1 - x0) * k, hy = y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * 2;
      const sw = Math.sin(ph + k * 5 + ri * 2) * 1.6, len = 4 + kind;
      p.line(hx, hy, hx + sw, hy + len, ROPE_D);
      const ex = Math.round(hx + sw), ey = Math.round(hy + len);
      if (kind === 0) { p.px(ex, ey + 1, 0xd8ceb4); p.px(ex, ey + 2, 0xb0a68c); p.px(ex - 1, ey + 3, 0xd8ceb4); p.px(ex + 1, ey + 3, 0x8a806a); } // finger bone
      else if (kind === 1) { for (let j = 1; j < 6; j++) p.px(ex + (j > 3 ? 1 : 0), ey + j, j === 1 ? SOOT[4] : SOOT[2]); } // crow feather
      else { p.px(ex, ey + 1, RUNE[1]); p.px(ex + 1, ey + 1, RUNE[0]); p.px(ex, ey + 2, RUNE[0]); } // red glass bead
    }
  });
}

// ---- alchemy rig --------------------------------------------------------------------------------------------
const RS = 0.72; // the rig is drawn on an 80x100 design grid and placed at this scale, one texel per pixel
const RW0 = 80, RH0 = 100, RBY0 = 92;
export const RIG_W = Math.ceil(RW0 * RS), RIG_H = Math.ceil(RH0 * RS), RIG_BY = Math.round(RBY0 * RS);
const BX = 30; // brazier / bulb column

function disc(p: Pen, cx: number, cy: number, rx: number, ry: number, fn: (x: number, y: number, dx: number, dy: number) => number | undefined) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (dx * dx + dy * dy > 1) continue;
    const c = fn(x, y, dx, dy);
    if (c !== undefined) p.px(x, y, c);
  }
}

function runeStone(p: Pen, x: number, y: number, k: number, ph: number, near: boolean) {
  const w = near ? 3 : 2, h = near ? 4 : 3;
  for (let j = -h; j <= h; j++) for (let i = -w; i <= w; i++) {
    if (Math.abs(i) === w && Math.abs(j) >= h - 1) continue; // chipped corners
    if (hash(i + k * 7, j, 11) < 0.12 && (Math.abs(i) === w || Math.abs(j) === h)) continue;
    p.px(x + i, y + j, step(SLATE, 2.4 - i * 0.45 - j * 0.3 + (near ? 0.4 : 0), x + i, y + j));
  }
  // carved glyph, pulsing
  const g = 1.6 + Math.sin(ph * 2 + k * 2.1) * 1.2 + (near ? 0.4 : 0);
  const glyphs = [[[0, -2], [0, -1], [0, 0], [0, 1], [-1, -1], [1, 0]], [[-1, -2], [0, -1], [1, 0], [0, 1], [-1, 2], [1, -2]], [[-1, -1], [0, -1], [1, -1], [0, 0], [0, 1], [-1, 2], [1, 2]]];
  for (const [gx, gy] of glyphs[k % 3]) { if (!near && Math.abs(gy) > 1) continue; p.px(x + gx, y + gy, step(RUNE, g, x + gx, y + gy)); }
  // a faint ember halo
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + ph; p.px(x + Math.cos(a) * (w + 2), y + Math.sin(a) * (h + 1), RUNE[1], 0.25); }
}

/** Pen that shrinks the design grid by RS onto the texture (every texture pixel still gets one flat colour). */
function scaled(p: Pen): Pen {
  return {
    px: (x, y, c, a) => p.px(Math.floor(x * RS), Math.floor(y * RS), c, a),
    line: (x0, y0, x1, y1, c) => p.line(x0 * RS, y0 * RS, x1 * RS, y1 * RS, c),
    rect: (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p.px(Math.floor((x + i) * RS), Math.floor((y + j) * RS), c); },
    shaft: p.shaft,
  };
}

function rig(p0: Pen, f: number) {
  const p = scaled(p0), RIG_BY = RBY0, RIG_W = RW0;
  const ph = (f / N) * Math.PI * 2;
  // ground shadow (on the texture grid itself, so the dither stays even)
  for (let y = Math.round((RIG_BY - 6) * RS); y <= Math.round((RIG_BY + 7) * RS); y++) for (let x = 0; x < RIG_W * RS; x++) {
    const dx = (x / RS - BX - 14) / 32, dy = (y / RS - RIG_BY - 1) / 6.5;
    if (dx * dx + dy * dy <= 1 && dith(x, y) < 0.7) p0.px(x, y, 0x000000, 0.4);
  }

  // rune stones on a slow orbit above the bulb: one full turn per loop of the sheet
  const stones = [0, 1, 2].map((k) => {
    const a = ph + k * (Math.PI * 2 / 3);
    return { k, x: BX + Math.cos(a) * 19, y: 19 + Math.sin(a) * 5 + Math.sin(ph * 2 + k * 2) * 1.2, near: Math.sin(a) > 0 };
  });
  for (const s of stones) if (!s.near) runeStone(p, Math.round(s.x), Math.round(s.y), s.k, ph, false);

  // brazier: an iron bowl of coals on three short legs
  for (const [lx, l2] of [[BX - 8, BX - 11], [BX + 8, BX + 11], [BX + 1, BX + 1]] as const) p.line(lx, RIG_BY - 10, l2, RIG_BY - (lx === BX + 1 ? 2 : 0), IRON[1]);
  disc(p, BX, RIG_BY - 12, 10, 4, (x, y, dx, dy) => (dy < -0.2 ? undefined : step(IRON, 2.6 - dx * 1.2 + dy * 0.4, x, y)));
  disc(p, BX, RIG_BY - 13, 9, 2.6, (x, y, dx) => {
    const heat = 2.2 + hash(x, y, f >> 1) * 2.2 - Math.abs(dx) * 1.2;
    return step(COALS, heat - 0.6, x, y);
  });
  // three iron rods up to the ring holding the bulb
  for (const [x0, x1] of [[BX - 12, BX - 7], [BX + 12, BX + 7]]) p.line(x0, RIG_BY - 1, x1, RIG_BY - 34, IRON[2]);
  p.line(BX + 1, RIG_BY - 4, BX + 1, RIG_BY - 34, IRON[1]);

  // the glass bulb: red brew glowing from the coals, bubbles rising, the meniscus rocking
  const bx = BX, by = RIG_BY - 46, R = 10;
  const level = by - 1 + Math.sin(ph * 2) * 0.6;
  disc(p, bx, by, R, R, (x, y, dx, dy) => {
    const rim = dx * dx + dy * dy > 0.78;
    if (y > level) {
      const v = 3.4 - dy * 0.4 - dx * 0.8 + (y > by + R - 4 ? 0.8 : 0);
      return rim ? step(BREW, v - 1.6, x, y) : step(BREW, v, x, y);
    }
    if (rim) return step(GLASS, 2.4 - dx * 1.4 - dy, x, y);
    return dith(x, y) < 0.22 ? GLASS[2] : undefined; // see-through upper glass
  });
  // bubbles
  for (let i = 0; i < 5; i++) {
    const k = ((f + i * 2.4) % N) / N, x = Math.round(bx - 5 + i * 2.4 + Math.sin(k * 6 + i) * 1), y = Math.round(by + R - 3 - k * (R + 2));
    if (y > level) p.px(x, y, BREW[5]); else if (y > level - 2) p.px(x, y, BREW[4]); // pops at the surface
  }
  p.px(bx - 5, by - 6, GLASS[4]); p.px(bx - 6, by - 5, GLASS[4]); p.px(bx - 6, by - 4, GLASS[3]); p.px(bx - 4, by - 7, GLASS[3]); // glint
  // iron ring the bulb sits in
  for (let i = -9; i <= 9; i++) p.px(bx + i, by + 7 + Math.round(Math.abs(i) * 0.12), step(IRON, 2.8 - i * 0.12, bx + i, by + 7));
  // neck and the copper still running down to the receiving flask
  for (let y = by - R - 6; y <= by - R + 1; y++) { p.px(bx - 1, y, GLASS[3]); p.px(bx, y, GLASS[2]); p.px(bx + 1, y, GLASS[1]); }
  const tube: [number, number][] = [[bx, by - R - 6], [bx + 3, by - R - 10], [bx + 10, by - R - 12], [bx + 20, by - R - 8], [bx + 28, by - 4], [bx + 32, by + 10]];
  for (let s = 0; s < tube.length - 1; s++) {
    const [x0, y0] = tube[s], [x1, y1] = tube[s + 1], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; p.px(x, y, COPPER[3]); p.px(x, y + 1, COPPER[1]); p.px(x + 0.5, y - 1, COPPER[4]); }
  }
  // coil wound round the tube's middle (cooling worm)
  for (let i = 0; i < 4; i++) { const x = bx + 20 + i * 2, y = by - R - 8 + i * 3.2; p.px(x - 1, y, COPPER[4]); p.px(x, y + 1, COPPER[2]); p.px(x + 1, y + 2, COPPER[1]); }

  // stump with the receiving flask
  const rx = bx + 34, ry = RIG_BY - 8;
  for (let y = ry; y <= RIG_BY - 1; y++) for (let x = rx - 7; x <= rx + 7; x++) p.px(x, y, step(WOOD, 2.6 - (x - rx) * 0.25 + (hash(x, y >> 1, 2) - 0.5), x, y));
  disc(p, rx, ry, 7, 2.5, (x, y, dx) => ((Math.round(Math.hypot((x - rx) / 1, (y - ry) * 2.8)) % 3 === 0) ? WOOD[1] : step(WOOD, 3 - dx, x, y)));
  disc(p, rx - 1, ry - 7, 5, 5.5, (x, y, dx, dy) => {
    const rim = dx * dx + dy * dy > 0.7;
    if (dy > 0.1) return rim ? BREW[1] : step(BREW, 3 - dx - dy * 0.5, x, y);
    return rim ? step(GLASS, 2.6 - dx * 1.4, x, y) : dith(x, y) < 0.22 ? GLASS[2] : undefined;
  });
  p.px(rx - 3, ry - 10, GLASS[4]);
  for (let y = ry - 15; y <= ry - 12; y++) { p.px(rx - 2, y, GLASS[3]); p.px(rx - 1, y, GLASS[2]); }
  // drip falling from the still into the flask
  const dk = (f % 6) / 6, dy = Math.round(by + 11 + dk * 11);
  p.px(bx + 32, dy, BREW[4]); if (dk > 0.2) p.px(bx + 32, dy - 1, BREW[3]);

  // embers drifting up off the coals
  for (let i = 0; i < 4; i++) {
    const k = ((f + i * 3) % N) / N, x = Math.round(BX - 6 + i * 4 + Math.sin(k * 7 + i) * 2), y = Math.round(RIG_BY - 14 - k * 16);
    if (x < BX - 9 || x > BX + 9 || y > by + 6) p.px(x, y, k < 0.5 ? RUNE[3] : RUNE[1], 1 - k * 0.6); // stay out of the bulb
  }

  for (const s of stones) if (s.near) runeStone(p, Math.round(s.x), Math.round(s.y), s.k, ph, true);
}

/** Paints the camp textures and their idle animations. */
export function witchCampTextures(scene: Phaser.Scene) {
  sheet(scene, "wc_tent", TENT_W, TENT_H, N, tent, 0);
  sheet(scene, "wc_rig", RIG_W, RIG_H, N, rig, 0);
  for (const [k, fps] of [["wc_tent", 6], ["wc_rig", 8]] as const) {
    if (!scene.anims.exists(`${k}_idle`)) scene.anims.create({ key: `${k}_idle`, frames: scene.anims.generateFrameNumbers(k, { start: 0, end: N - 1 }), frameRate: fps, repeat: -1 });
  }
}

/** Pivot (origin y) of each camp texture: the tent stands on its base centre, the rig on its feet. */
export const CAMP_PIVOT: Record<string, number> = { wc_tent: TENT_BY / TENT_H, wc_rig: RIG_BY / RIG_H };
