/** The painter the props draw with (structurally the Pen of worldProps.ts, so this file needs no Phaser). */
export interface Pen { px(x: number, y: number, c: number, a?: number): void; line(x0: number, y0: number, x1: number, y1: number, c: number): void; rect(x: number, y: number, w: number, h: number, c: number): void }
const hash = (a: number, b: number, s = 0) => {
  let h = Math.imul(a * 73 + 11 + s * 977, 374761393) ^ Math.imul(b + 5 + s * 131, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dith = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

/**
 * Wren the lute-maker's stall (props for shared/npcs.ts NPC_DECOR, ids "lu_*"): a workbench with a lute being built,
 * a clamp, plane and chisels and a drift of shavings, and a rack with three finished lutes hanging from cords.
 *
 * Same bonfire-style pixel art as the armourers (armoury.ts): 1.5 texels per world px, flat ramps with ordered dithering,
 * light from the top left, a dark outline. The hanging lutes sway a little. Cosmetic only (collision is NPC_DECOR.solid).
 */
export const LU_FRAMES = 12;
const N = LU_FRAMES;

const step = (pal: number[], v: number, x: number, y: number) => {
  const c = Math.max(0, Math.min(pal.length - 1, v)), i = Math.floor(c);
  return pal[Math.min(pal.length - 1, c - i > dith(x, y) ? i + 1 : i)];
};

const WOOD = [0x1c120a, 0x2e1e10, 0x45301a, 0x5e4426, 0x7a5a34, 0x94703f];
const IRON = [0x0e1014, 0x1c1f24, 0x2e3238, 0x464c54, 0x666e78, 0x929ca6, 0xc4ccd2, 0xeef2f4];
const BRASS = [0x241808, 0x3a2a10, 0x6a4c1c, 0x9a722c, 0xc89c44, 0xead07a, 0xfff0b8];
const LEATHER = [0x1a0f0a, 0x321e12, 0x4c2e1a, 0x6a4226, 0x8a5a34, 0xa47446];
const MAPLE = [0x3a2210, 0x5e3a1c, 0x8a5a2c, 0xb88048, 0xd9a868, 0xf0cc92];
const WALNUT = [0x120a06, 0x24160c, 0x3a2414, 0x54361e, 0x6e4a2a, 0x88603a];
const CHERRY = [0x2a0e08, 0x4a1a10, 0x6e2a18, 0x923c22, 0xb8583a, 0xd6805a];
const SHAVE = [0x8a6a3c, 0xb88c52, 0xdcb678, 0xf2d8a0];
const TEAL = [0x0e2a28, 0x16423e, 0x1f5c56, 0x2e7d74, 0x4aa094];
const GOLD = 0xe8d070;

function ellipse(p: Pen, cx: number, cy: number, rx: number, ry: number, fn: (x: number, y: number, dx: number, dy: number) => number | undefined) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (dx * dx + dy * dy > 1) continue;
    const c = fn(x, y, dx, dy);
    if (c !== undefined) p.px(x, y, c);
  }
}

/**
 * A lute lying or hanging: pear body at (cx, cy) with radius rx x ry, the neck going `dir` (unit vector) with its peg head.
 * `shift(y)` bends the whole thing sideways for the sway.
 */
function lute(p: Pen, cx: number, cy: number, rx: number, ry: number, pal: number[], dir: [number, number], shift: (y: number) => number = () => 0) {
  const put = (x: number, y: number, c: number) => p.px(x + shift(y), y, c);
  // neck first (behind the body's top edge): a tapering board with a pale fingerboard
  const len = ry * 1.9;
  for (let i = 0; i <= len; i++) {
    const x = cx + dir[0] * (ry * 0.6 + i), y = cy + dir[1] * (ry * 0.6 + i), w = i > len - 4 ? 2 : 1.4;
    for (let k = -w; k <= w; k++) {
      const nx = x + -dir[1] * k, ny = y + dir[0] * k;
      put(nx, ny, Math.abs(k) < 0.7 ? WALNUT[1] : step(pal, 3.6 - k * 0.5, nx, ny));
    }
  }
  // peg head, bent back: a small block with three pegs
  const hx = cx + dir[0] * (ry * 0.6 + len + 1.5), hy = cy + dir[1] * (ry * 0.6 + len + 1.5);
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) put(hx + i, hy + j, step(pal, 3 - (i + j) * 0.2, hx + i, hy + j));
  for (const k of [-1, 1]) { put(hx + k * 3 * Math.abs(dir[1]), hy + k * 3 * Math.abs(dir[0]), BRASS[4]); put(hx + k * 2 * Math.abs(dir[1]), hy + k * 2 * Math.abs(dir[0]), WALNUT[1]); }
  // the belly: lit from the top left, a darker rim, an inlaid rosette round the sound hole
  ellipse(p, cx, cy, rx, ry, (x, y, dx, dy) => {
    const rim = Math.hypot(dx, dy) > 0.86;
    const grain = (Math.floor((x - cx) * 0.8 + (y - cy) * 0.3) & 1) ? 0.25 : 0;
    const c = step(pal, (rim ? 1.4 : 3.8) - dx * 1.2 - dy * 1.1 + grain, x, y);
    p.px(x + shift(y), y, c);
    return undefined;
  });
  const sx = cx + dir[0] * -ry * 0.1, sy = cy + dir[1] * -ry * 0.1;
  ellipse(p, sx, sy, rx * 0.36, rx * 0.36, (x, y, dx, dy) => { p.px(x + shift(y), y, Math.hypot(dx, dy) > 0.7 ? GOLD : WALNUT[0]); return undefined; });
  // bridge and strings
  const bx = cx - dir[0] * ry * 0.5, by = cy - dir[1] * ry * 0.5;
  for (let k = -2; k <= 2; k++) put(bx + k * Math.abs(dir[1]), by + k * Math.abs(dir[0]), WALNUT[1]);
  for (const o of [-0.8, 0, 0.8]) for (let i = 0; i < len + ry * 0.4; i++) {
    const x = bx + dir[0] * i + -dir[1] * o, y = by + dir[1] * i + dir[0] * o;
    if (i > ry * 0.3) put(x, y, IRON[6]);
  }
}

// ---- the workbench ----------------------------------------------------------------------------------------
export const BN_W = 90, BN_H = 56, BN_BX = 45, BN_BY = 52;

function bench() {
  return (p: Pen, f: number) => {
    const wind = Math.sin((f / N) * Math.PI * 2);
    const top = 24, lx = 6, rx = BN_W - 7;
    // legs and a low shelf with planks
    for (const px0 of [lx + 2, rx - 5]) for (let y = top + 6; y <= BN_BY - 2; y++) { p.px(px0, y, WOOD[4]); p.px(px0 + 1, y, WOOD[3]); p.px(px0 + 2, y, WOOD[3]); p.px(px0 + 3, y, WOOD[1]); }
    for (let x = lx + 3; x <= rx - 3; x++) for (let j = 0; j < 2; j++) p.px(x, BN_BY - 14 + j, step(WOOD, 3.6 - j * 1.4 - ((x % 11) === 0 ? 0.8 : 0), x, BN_BY - 14 + j));
    // planks of tonewood stacked on the shelf, and a bucket of shavings beside them
    for (let k = 0; k < 3; k++) for (let x = lx + 8; x < lx + 38; x++) for (let j = 0; j < 3; j++) {
      const y = BN_BY - 15 - k * 3 - j;
      p.px(x, y, j === 0 ? MAPLE[4] : step(MAPLE, 3 - j * 0.8 - k * 0.2 - (hash(x, y, 801) < 0.12 ? 0.8 : 0), x, y));
    }
    for (let y = BN_BY - 13; y < BN_BY - 3; y++) for (let x = rx - 22; x < rx - 10; x++) p.px(x, y, step(WOOD, 3.4 - (x - rx + 22) / 8 - (y === BN_BY - 13 ? -0.6 : 0) - ((x + y) % 6 === 0 ? 0.6 : 0), x, y));
    for (let x = rx - 22; x < rx - 10; x++) p.px(x, BN_BY - 8, IRON[3]);
    // the slab: a lit top face, a thick front edge
    for (let y = top; y < top + 8; y++) for (let x = lx; x <= rx; x++) {
      const v = 4.6 - (x - lx) / (rx - lx) * 0.9 - (y - top) * 0.1 + (Math.floor((x * 0.7 + y * 2.2)) % 7 === 0 ? -0.55 : 0) + (hash(x, y, 802) < 0.04 ? -0.8 : 0);
      p.px(x, y, step(WOOD, v, x, y));
    }
    for (let y = top + 8; y < top + 13; y++) for (let x = lx; x <= rx; x++) p.px(x, y, step(WOOD, 2.8 - (y - top - 8) * 0.35 - (x - lx) / (rx - lx) * 0.6, x, y));
    for (let x = lx; x <= rx; x++) p.px(x, top, WOOD[5]);
    // a lute half-built on the slab: body face-down with the neck to the right
    lute(p, 36, top - 4, 12, 8.5, MAPLE, [1, 0]);
    // a bar clamp holding a rib at the left end
    for (let y = top - 11; y < top; y++) { p.px(lx + 6, y, IRON[4]); p.px(lx + 7, y, IRON[2]); }
    for (let x = lx + 6; x < lx + 16; x++) { p.px(x, top - 11, IRON[5]); p.px(x, top - 10, IRON[2]); }
    for (let y = top - 9; y < top - 3; y++) for (let x = lx + 13; x < lx + 16; x++) p.px(x, y, step(IRON, 4.4 - (x - lx - 13) * 0.8, x, y));
    for (let x = lx + 4; x < lx + 10; x++) p.px(x, top - 1, IRON[5]);
    // a hand plane, chisels and a mallet on the right
    const pl = rx - 36;
    for (let x = pl; x < pl + 14; x++) for (let j = 0; j < 4; j++) p.px(x, top - 4 + j, step(WOOD, 4.2 - j * 0.9 - (x - pl) * 0.04, x, top - 4 + j));
    for (let x = pl + 3; x < pl + 10; x++) p.px(x, top, IRON[5]);
    p.px(pl + 11, top - 6, LEATHER[4]); p.px(pl + 11, top - 5, LEATHER[3]); p.px(pl + 12, top - 6, LEATHER[3]);
    for (let k = 0; k < 3; k++) { const x = rx - 18 + k * 3; p.line(x, top - 1, x + 2, top - 9, IRON[5]); p.line(x + 1, top - 1, x + 3, top - 9, IRON[3]); p.rect(x - 1, top - 1, 2, 2, LEATHER[4]); }
    for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) p.px(rx - 6 + i, top - 5 + j, step(MAPLE, 4 - i * 0.2 - j * 0.5, rx - 6 + i, top - 5 + j));
    p.px(rx - 4, top - 1, WOOD[1]); p.px(rx - 4, top - 2, WOOD[2]);
    // shavings: pale curls drifting over the slab and onto the floor (they twitch in the draught)
    for (const [sx, sy] of [[58, top - 2], [62, top - 1], [54, top - 1], [26, top + 14], [22, BN_BY - 2], [64, BN_BY - 1], [40, BN_BY], [70, top + 17]] as const) {
      p.px(sx, sy, SHAVE[3]); p.px(sx + 1, sy, SHAVE[2]); p.px(sx + Math.round(wind * 0.4), sy - 1, SHAVE[1]);
    }
  };
}

// ---- the rack: three finished lutes on cords -------------------------------------------------------------
export const RK_W = 96, RK_H = 76, RK_BX = 48, RK_BY = 72;

function rack() {
  return (p: Pen, f: number) => {
    const wind = Math.sin((f / N) * Math.PI * 2 + 1);
    // base board and two posts with a top beam
    for (let y = RK_BY - 5; y <= RK_BY - 1; y++) for (let x = 4; x <= RK_W - 5; x++) p.px(x, y, step(WOOD, (y < RK_BY - 3 ? 4 : 2) - (x / RK_W) * 1.2 - ((x % 9) === 0 ? 0.8 : 0), x, y));
    for (const px0 of [7, RK_W - 10]) for (let y = 9; y <= RK_BY - 4; y++) { p.px(px0, y, WOOD[4]); p.px(px0 + 1, y, WOOD[3]); p.px(px0 + 2, y, WOOD[1]); }
    for (let x = 5; x <= RK_W - 6; x++) for (let j = 0; j < 3; j++) p.px(x, 9 + j, step(WOOD, 4.4 - j * 1.2 - (hash(x, j, 811) < 0.07 ? 1 : 0), x, 9 + j));
    // three lutes hanging by their peg heads, swaying in turn
    const pals = [MAPLE, WALNUT, CHERRY];
    pals.forEach((pal, i) => {
      const cx = 28 + i * 18, amp = 1.1 * (i === 1 ? -1 : 1);
      // cord up to the beam
      for (let y = 12; y < 20; y++) p.px(cx, y, LEATHER[3]);
      lute(p, cx, 48, 7.5, 9.5, pal, [0, -1], (y) => Math.round(wind * amp * Math.max(0, y - 14) / 30));
    });
    // a little sign board hanging from the beam: a gold lute on teal
    const sx = RK_W - 24; // the sign hangs right of the lutes
    for (const k of [0, 9]) for (let y = 12; y < 17; y++) p.px(sx + k, y, LEATHER[2]);
    for (let y = 17; y < 29; y++) for (let x = sx - 1; x < sx + 11; x++) {
      const edge = x === sx - 1 || x === sx + 10 || y === 17 || y === 28;
      p.px(x, y, edge ? WOOD[4] : step(TEAL, 3.6 - (x - sx) * 0.1 - (y - 17) * 0.06, x, y));
    }
    ellipse(p, sx + 4, 25, 3, 3, (x, y, dx, dy) => step(BRASS, 5 - dx - dy, x, y));
    p.line(sx + 5, 24, sx + 9, 19, BRASS[5]);
    p.px(sx + 4, 25, WOOD[0]);
  };
}

/** Frame painters and sizes (the Phaser glue is lutierArt.ts; the art preview draws these directly). */
export const LUTIER_DRAW = {
  lu_bench: { w: BN_W, h: BN_H, frames: N, draw: bench() },
  lu_rack: { w: RK_W, h: RK_H, frames: N, draw: rack() },
};
