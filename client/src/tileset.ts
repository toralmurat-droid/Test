import { TILE } from "../../shared/constants";
import { T, TILE_COUNT } from "../../shared/map";

/**
 * Procedural 16×16 pixel-art tileset (no image assets needed yet).
 * Pure canvas so both the game (Phaser) and the map viewer can use it.
 * Tile index order matches `T` in shared/map.ts.
 */
type Color = number | string;
const css = (c: Color) => (typeof c === "number" ? "#" + c.toString(16).padStart(6, "0") : c);
const SHADOW = "rgba(0,0,0,0.25)";

class Painter {
  private s: number;
  constructor(private ctx: CanvasRenderingContext2D, private ox: number, seed: number) { this.s = seed * 7919 + 13; }
  r() { this.s = (this.s * 9301 + 49297) % 233280; return this.s / 233280; }
  ri(n: number) { return Math.floor(this.r() * n); }
  rect(x: number, y: number, w: number, h: number, c: Color) {
    this.ctx.fillStyle = css(c);
    this.ctx.fillRect(this.ox + x, y, w, h);
  }
  px(x: number, y: number, c: Color) { this.rect(x, y, 1, 1, c); }
  fill(c: Color) { this.rect(0, 0, TILE, TILE, c); }
  speckle(c: Color, n: number, x0 = 0, y0 = 0, w = TILE, h = TILE) {
    for (let k = 0; k < n; k++) this.px(x0 + this.ri(w), y0 + this.ri(h), c);
  }
  /** Pixel ellipse. */
  disc(cx: number, cy: number, rx: number, ry: number, c: Color) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.px(x, y, c);
    }
  }
  /** Per-pixel painter: return a color or undefined to skip. */
  each(f: (x: number, y: number) => Color | undefined) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const c = f(x, y); if (c !== undefined) this.px(x, y, c); }
  }
}

// ---------- ground ----------
const grass = (p: Painter, base = 0x5a9a3c, dark = 0x4a8532, light = 0x6fb04a) => {
  p.fill(base); p.speckle(dark, 22); p.speckle(light, 12);
  for (let k = 0; k < 4; k++) { const x = p.ri(16), y = p.ri(15); p.px(x, y, 0x7cc455); p.px(x, y + 1, dark); }
};
const bricks = (p: Painter, base: number, line: number, hi: number, rowH = 4, joint = 8) => {
  p.fill(base);
  for (let y = 0, i = 0; y < 16; y += rowH, i++) {
    p.rect(0, y + rowH - 1, 16, 1, line);
    for (let x = (i % 2) * (joint / 2); x < 16; x += joint) { p.rect(x, y, 1, rowH - 1, line); if (x + 1 < 16) p.rect(x + 1, y, Math.min(3, 15 - x), 1, hi); }
  }
};
const timberWall = (p: Painter) => {
  p.fill(0xe6d8b8); p.speckle(0xd6c6a2, 12);
  p.rect(0, 0, 16, 2, 0x5a3a1e); p.rect(0, 0, 1, 16, 0x5a3a1e); p.rect(15, 0, 1, 16, 0x5a3a1e); p.rect(0, 15, 16, 1, 0x4a2f18);
};
const stoneWall = (p: Painter) => { bricks(p, 0x9a948a, 0x77726a, 0xaea89d); p.speckle(0x8a847a, 8); };
const roof = (p: Painter, base: number, line: number, hi: number) => {
  p.fill(base);
  for (let y = 0, i = 0; y < 16; y += 4, i++) {
    p.rect(0, y + 3, 16, 1, line);
    for (let x = (i % 2) * 4; x < 16; x += 8) { p.rect(x, y, 1, 3, line); p.rect(x + 1, y, Math.min(5, 15 - x), 1, hi); }
  }
};
const stall = (p: Painter, c: number) => {
  for (let x = 0; x < 16; x += 4) { p.rect(x, 1, 2, 6, c); p.rect(x + 2, 1, 2, 6, 0xf2efe6); }
  for (let x = 0; x < 16; x += 2) p.px(x, 7, c);
  p.rect(0, 0, 16, 1, 0x5a3a1e);
  p.rect(1, 7, 1, 8, 0x6b4426); p.rect(14, 7, 1, 8, 0x6b4426);
  p.rect(0, 10, 16, 5, 0x8b5e34); p.rect(0, 10, 16, 1, 0xa8774a); p.rect(0, 14, 16, 1, 0x5e3b1a);
  for (const x of [3, 5, 4]) p.px(x, 9, 0xd84343); p.px(4, 8, 0xd84343);
  p.rect(8, 8, 3, 2, 0xd9a35a); p.px(9, 8, 0xe8bd7a);
  p.rect(12, 9, 2, 1, 0x6fbf55); p.px(12, 8, 0x4f9a3a);
};

const DRAW: Record<number, (p: Painter) => void> = {
  [T.GRASS]: (p) => grass(p),
  [T.GRASS_DARK]: (p) => grass(p, 0x4f8c36, 0x427a2c, 0x5f9f42),
  [T.TALL_GRASS]: (p) => {
    grass(p);
    for (let k = 0; k < 14; k++) {
      const x = p.ri(16), y = 2 + p.ri(10), h = 2 + p.ri(4);
      p.rect(x, y, 1, h, k % 2 ? 0x3f7a2a : 0x7cc455);
      p.px(x, y, 0x8fd468);
    }
  },
  [T.FLOWERS]: (p) => {
    grass(p);
    const cols = [0xf06292, 0xfff176, 0xffffff, 0xba68c8, 0x64b5f6];
    for (let k = 0; k < 5; k++) {
      const x = 2 + p.ri(12), y = 2 + p.ri(12), c = cols[k];
      p.px(x - 1, y, c); p.px(x + 1, y, c); p.px(x, y - 1, c); p.px(x, y + 1, c); p.px(x, y, 0xffd54f);
    }
  },
  [T.DIRT]: (p) => { p.fill(0xa7814f); p.speckle(0x8f6c3f, 30); p.speckle(0xbd9763, 14); p.speckle(0x7a7a72, 3); },
  [T.COBBLE]: (p) => {
    p.fill(0x6f6a60);
    const stones = [0x9e998c, 0xa8a396, 0x938e81];
    for (let y = 0, i = 0; y < 16; y += 4, i++) for (let x = (i % 2) ? -3 : 0; x < 16; x += 5) {
      const x0 = Math.max(x, 0), x1 = Math.min(x + 4, 16);
      p.rect(x0, y, x1 - x0, 3, stones[p.ri(3)]);
      if (x >= 0) p.px(x, y, 0xbab5a8);
    }
  },
  [T.SAND]: (p) => { p.fill(0xd9c38a); p.speckle(0xc4ad74, 22); p.speckle(0xe8d6a3, 12); },
  [T.WATER]: (p) => {
    p.fill(0x3a78b8); p.speckle(0x2f68a3, 20);
    for (let k = 0; k < 4; k++) { const x = p.ri(12), y = p.ri(15); p.rect(x, y, 3, 1, 0x6ea6dc); p.px(x + 3, y, 0x4f8dc8); }
  },
  [T.BRIDGE]: (p) => {
    p.fill(0x8b5a2b); p.speckle(0xa06a35, 18); p.speckle(0x7a4e24, 10);
    for (const x of [0, 4, 8, 12]) p.rect(x, 0, 1, 16, 0x5e3b1a);
    for (const x of [2, 6, 10, 14]) { p.px(x, 3, 0x3a2410); p.px(x, 12, 0x3a2410); }
  },
  [T.FIELD]: (p) => {
    p.fill(0xc9a640);
    for (let x = 1; x < 16; x += 3) p.rect(x, 0, 1, 16, 0xa88a2e);
    for (let x = 1; x < 16; x += 3) for (let y = 1 + (x % 2); y < 16; y += 4) { p.px(x + 1, y, 0xe8cc66); p.px(x + 1, y + 1, 0xd8b84a); }
  },
  [T.CROPS]: (p) => {
    p.fill(0x6b4a2b);
    for (const y of [3, 7, 11, 15]) p.rect(0, y, 16, 1, 0x5a3d22);
    for (const y of [1, 5, 9, 13]) for (const x of [2, 6, 10, 14]) {
      p.px(x, y, 0x4f9a3a); p.px(x - 1, y, 0x3f7f2e); p.px(x + 1, y, 0x3f7f2e); p.px(x, y - 1, 0x6fbf55);
    }
  },

  // ---------- objects (transparent background) ----------
  [T.TREE]: (p) => {
    p.disc(8, 14.5, 6, 1.8, SHADOW);
    p.rect(7, 10, 2, 5, 0x6b4426); p.rect(8, 10, 1, 5, 0x4e301a);
    p.disc(8, 6.5, 6.8, 6, 0x2f6b2a);
    p.disc(7.5, 5.8, 5.6, 4.9, 0x3f8a35);
    p.disc(6, 4, 2.6, 1.9, 0x5aa845);
    p.px(10, 4, 0x5aa845); p.px(11, 7, 0x2f6b2a); p.px(4, 8, 0x2f6b2a); p.px(9, 9, 0x2f6b2a);
  },
  [T.PINE]: (p) => {
    p.disc(8, 14.5, 5, 1.6, SHADOW);
    p.rect(7, 12, 2, 3, 0x5a3a1e);
    const tiers = [[0, 5, 1], [4, 10, 2], [8, 13, 3]];
    for (const [y0, y1, w0] of tiers) for (let y = y0; y < y1; y++) {
      const half = w0 + (y - y0) * 0.9;
      const x0 = Math.round(8 - half), x1 = Math.round(8 + half);
      p.rect(x0, y, x1 - x0, 1, 0x1f5a3a);
      p.rect(x0, y, Math.max(1, Math.floor((x1 - x0) / 2)), 1, 0x2b7148);
      p.px(x0, y, 0x3d8a5a);
    }
  },
  [T.BUSH]: (p) => {
    p.disc(8, 14.5, 6, 1.5, SHADOW);
    p.disc(8, 10.5, 6.2, 4.5, 0x2f6b2a);
    p.disc(7.5, 10, 5, 3.6, 0x3f8a35);
    p.disc(6, 8.5, 2, 1.4, 0x5aa845);
    p.px(10, 10, 0xd84343); p.px(5, 12, 0xd84343); p.px(11, 12, 0xd84343);
  },
  [T.ROCK]: (p) => {
    p.disc(8, 14, 6.5, 1.8, SHADOW);
    p.disc(8, 10.5, 6.2, 4.6, 0x6e6e6e);
    p.disc(7.5, 9.8, 5.4, 3.8, 0x8d8d8d);
    p.disc(6, 8.2, 2.2, 1.2, 0xb0b0b0);
    p.px(10, 11, 0x5a5a5a); p.px(11, 12, 0x5a5a5a);
  },
  [T.PALISADE]: (p) => {
    for (const x of [0, 4, 8, 12]) {
      p.rect(x, 2, 4, 14, 0x7a5230);
      p.rect(x, 2, 1, 14, 0x5e3b1f); p.rect(x + 3, 2, 1, 14, 0x4e331c);
      p.rect(x + 1, 3, 1, 12, 0x9a6a40);
      p.rect(x + 1, 1, 2, 1, 0x7a5230); p.px(x + 1, 0, 0x9a6a40);
    }
    p.rect(0, 9, 16, 1, 0x4e331c);
  },
  [T.FENCE]: (p) => {
    p.rect(0, 8, 16, 2, 0x8b5e34); p.rect(0, 12, 16, 2, 0x8b5e34); p.rect(0, 8, 16, 1, 0xa8774a);
    p.rect(1, 5, 2, 11, 0x6b4426); p.rect(13, 5, 2, 11, 0x6b4426); p.px(1, 5, 0x8b5e34); p.px(13, 5, 0x8b5e34);
  },
  [T.FENCE_V]: (p) => {
    p.rect(7, 0, 2, 16, 0x8b5e34); p.rect(7, 0, 1, 16, 0xa8774a);
    p.rect(6, 2, 4, 4, 0x6b4426); p.rect(6, 10, 4, 4, 0x6b4426);
  },
  [T.ROOF_THATCH]: (p) => {
    p.fill(0xc9a24a);
    for (let y = 3; y < 16; y += 4) p.rect(0, y, 16, 1, 0xa8832f);
    for (let k = 0; k < 22; k++) p.rect(p.ri(16), p.ri(15), 1, 2, 0xddb95e);
    p.speckle(0xb08b36, 10);
  },
  [T.ROOF_RED]: (p) => roof(p, 0xa8432f, 0x7f2f22, 0xc25a42),
  [T.ROOF_SLATE]: (p) => roof(p, 0x5b6573, 0x47505c, 0x6f7a89),
  [T.WALL_TIMBER]: timberWall,
  [T.WALL_STONE]: stoneWall,
  [T.WINDOW_TIMBER]: (p) => {
    timberWall(p);
    p.rect(2, 4, 2, 8, 0x3f6a3a); p.rect(12, 4, 2, 8, 0x3f6a3a);
    p.rect(4, 4, 8, 8, 0x5a3a1e); p.rect(5, 5, 6, 6, 0x2f4a66);
    p.rect(7, 5, 1, 6, 0x5a3a1e); p.rect(5, 7, 6, 1, 0x5a3a1e);
    p.px(5, 5, 0x9fc3e0); p.px(8, 8, 0x9fc3e0);
    p.rect(3, 12, 10, 1, 0x7a5230);
  },
  [T.WINDOW_STONE]: (p) => {
    stoneWall(p);
    p.rect(5, 4, 6, 10, 0x4a4a52); p.rect(6, 3, 4, 1, 0x4a4a52);
    p.rect(6, 5, 2, 4, 0xe8c060); p.rect(8, 5, 2, 4, 0x5a8fd0);
    p.rect(6, 9, 2, 4, 0xd05a5a); p.rect(8, 9, 2, 4, 0xe8c060);
    p.rect(6, 4, 4, 1, 0xe8c060);
  },
  [T.DOOR]: (p) => {
    p.fill(0x5a3a1e);
    p.rect(3, 2, 10, 14, 0x7a4a24); p.rect(4, 1, 8, 1, 0x7a4a24);
    for (const x of [5, 8, 11]) p.rect(x, 2, 1, 14, 0x5e3a1c);
    p.rect(3, 5, 4, 1, 0x3a3a3a); p.rect(3, 12, 4, 1, 0x3a3a3a);
    p.px(10, 9, 0xd4af37);
  },
  [T.WELL]: (p) => {
    p.disc(8, 15, 7, 1.5, SHADOW);
    p.rect(2, 2, 1, 7, 0x6b4426); p.rect(13, 2, 1, 7, 0x6b4426);
    p.rect(1, 0, 14, 3, 0x7a3f2a); p.rect(1, 2, 14, 1, 0x5a2f1f); p.rect(1, 0, 14, 1, 0x9a553a);
    p.rect(3, 4, 10, 1, 0x6b4426); p.rect(7, 5, 2, 2, 0x8b5e34);
    p.rect(2, 9, 12, 6, 0x8d8d8d); p.rect(2, 12, 12, 1, 0x6e6e6e);
    for (const x of [5, 9, 12]) p.px(x, 10, 0x6e6e6e);
    for (const x of [3, 7, 11]) p.px(x, 13, 0x6e6e6e);
    p.rect(2, 8, 12, 1, 0xb0b0b0); p.rect(4, 9, 8, 1, 0x1f3550);
  },
  [T.STALL_RED]: (p) => stall(p, 0xc0392b),
  [T.STALL_BLUE]: (p) => stall(p, 0x2e6eb5),
  [T.BARREL]: (p) => {
    p.disc(8, 14.8, 5.5, 1.4, SHADOW);
    p.rect(4, 3, 8, 12, 0x8b5a2b); p.rect(3, 5, 10, 8, 0x8b5a2b);
    p.rect(6, 3, 1, 12, 0x7a4e24); p.rect(9, 3, 1, 12, 0x7a4e24);
    p.rect(3, 5, 10, 1, 0x4a4a4a); p.rect(3, 11, 10, 1, 0x4a4a4a);
    p.rect(4, 3, 8, 1, 0xa06a35);
  },
  [T.CRATE]: (p) => {
    p.disc(8, 15, 7, 1.2, SHADOW);
    p.rect(2, 3, 12, 12, 0xa0703c);
    for (let i = 0; i < 10; i++) { p.px(3 + i, 4 + i, 0x7a522a); p.px(12 - i, 4 + i, 0x7a522a); }
    p.rect(2, 3, 12, 1, 0x6b4a24); p.rect(2, 14, 12, 1, 0x6b4a24); p.rect(2, 3, 1, 12, 0x6b4a24); p.rect(13, 3, 1, 12, 0x6b4a24);
    p.rect(3, 4, 10, 1, 0xc08a50);
  },
  [T.ANVIL]: (p) => {
    p.disc(8, 15, 6, 1.2, SHADOW);
    p.rect(2, 6, 12, 3, 0x4a4a55); p.rect(0, 7, 3, 1, 0x4a4a55);
    p.rect(6, 9, 4, 3, 0x3a3a44); p.rect(4, 12, 8, 3, 0x3a3a44);
    p.rect(3, 6, 10, 1, 0x6a6a78);
  },
  [T.GRAVE]: (p) => {
    p.disc(8, 14.5, 4.5, 1.2, SHADOW);
    p.rect(5, 4, 6, 10, 0x9a9a9a); p.rect(6, 3, 4, 1, 0x9a9a9a);
    p.rect(5, 4, 1, 10, 0xb5b5b5); p.rect(10, 4, 1, 10, 0x7a7a7a);
    p.rect(7, 6, 2, 5, 0x6a6a6a); p.rect(6, 7, 4, 1, 0x6a6a6a);
    p.rect(4, 14, 8, 1, 0x4a8532);
  },
  [T.HAY]: (p) => {
    p.disc(8, 15, 7.5, 1.2, SHADOW);
    p.rect(1, 5, 14, 10, 0xd8b84a); p.rect(1, 5, 14, 2, 0xe8cc66);
    p.rect(1, 9, 14, 1, 0xb8962e); p.rect(1, 12, 14, 1, 0xb8962e);
    p.rect(4, 5, 1, 10, 0x8b5e34); p.rect(11, 5, 1, 10, 0x8b5e34);
  },
  [T.WHEEL]: (p) => p.each((x, y) => {
    const dx = x + 0.5 - 8, dy = y + 0.5 - 8, d = Math.hypot(dx, dy);
    if (d < 1.6) return 0x3a3a3a;
    if (d > 5.6 && d < 7.6) return (Math.round(Math.atan2(dy, dx) / (Math.PI / 6)) % 2) ? 0x6b4426 : 0x8b5e34;
    if (d < 6 && (Math.abs(dx) < 0.8 || Math.abs(dy) < 0.8 || Math.abs(dx - dy) < 0.9 || Math.abs(dx + dy) < 0.9)) return 0x8b5e34;
    return undefined;
  }),
  [T.CAMPFIRE]: (p) => {
    p.each((x, y) => {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 10);
      return d > 4.5 && d < 6.2 && (x + y) % 3 ? 0x7a7a7a : undefined;
    });
    p.rect(4, 10, 8, 2, 0x6b4426); p.rect(5, 11, 6, 2, 0x4e301a);
    p.rect(6, 6, 4, 5, 0xff8c1a); p.rect(7, 4, 2, 3, 0xffb23a); p.rect(7, 7, 2, 3, 0xffe066); p.px(8, 3, 0xffb23a);
  },
  [T.RUIN]: (p) => {
    p.rect(1, 6, 14, 9, 0x8a857a); p.rect(1, 4, 5, 2, 0x8a857a); p.rect(9, 2, 4, 4, 0x8a857a);
    for (const y of [8, 11]) p.rect(1, y, 14, 1, 0x6a665e);
    for (const [x, y] of [[5, 6], [10, 9], [4, 12], [12, 12], [11, 3]]) p.rect(x, y, 1, 2, 0x6a665e);
    p.rect(1, 6, 14, 1, 0xa39e92); p.rect(9, 2, 4, 1, 0xa39e92);
    p.speckle(0x5f8f3f, 10, 1, 4, 14, 11);
    p.rect(1, 15, 14, 1, 0x5a564f);
  },
  [T.SIGN]: (p) => {
    p.disc(8, 15, 4, 1, SHADOW);
    p.rect(7, 8, 2, 7, 0x6b4426);
    p.rect(2, 2, 12, 7, 0xa0703c); p.rect(2, 2, 12, 1, 0xc08a50); p.rect(2, 8, 12, 1, 0x6b4a24);
    p.rect(4, 4, 8, 1, 0x5a3a1e); p.rect(4, 6, 6, 1, 0x5a3a1e);
  },
  [T.STUMP]: (p) => {
    p.disc(8, 14, 6.5, 1.6, SHADOW);
    p.rect(3, 8, 10, 6, 0x6b4426); p.rect(3, 8, 1, 6, 0x4e301a);
    p.disc(8, 8, 5, 2.2, 0xb08a5a); p.disc(8, 8, 2.8, 1.1, 0x8b6a40);
    p.px(2, 13, 0x4e301a); p.px(13, 13, 0x4e301a);
  },
};

/** Paints every tile into a single row on the given context (TILE_COUNT × TILE wide). */
export function drawTileset(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, TILE * TILE_COUNT, TILE);
  for (let i = 0; i < TILE_COUNT; i++) DRAW[i]?.(new Painter(ctx, i * TILE, i + 1));
}

export function createTilesetCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE * TILE_COUNT; c.height = TILE;
  drawTileset(c.getContext("2d")!);
  return c;
}

/** Average opaque color of each tile — used for the minimap. */
export function tileColors(tileset: HTMLCanvasElement): string[] {
  const data = tileset.getContext("2d")!.getImageData(0, 0, tileset.width, TILE).data;
  return Array.from({ length: TILE_COUNT }, (_, i) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const o = (y * tileset.width + i * TILE + x) * 4;
      if (data[o + 3] < 200) continue;
      r += data[o]; g += data[o + 1]; b += data[o + 2]; n++;
    }
    return n ? `rgb(${(r / n) | 0},${(g / n) | 0},${(b / n) | 0})` : "#000";
  });
}
