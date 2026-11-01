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
  constructor(private ctx: CanvasRenderingContext2D, private ox: number, seed: number, private oy = 0) { this.s = seed * 7919 + 13; }
  r() { this.s = (this.s * 9301 + 49297) % 233280; return this.s / 233280; }
  ri(n: number) { return Math.floor(this.r() * n); }
  rect(x: number, y: number, w: number, h: number, c: Color) {
    this.ctx.fillStyle = css(c);
    this.ctx.fillRect(this.ox + x, this.oy + y, w, h);
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

/** Wind pattern for swaying grass and flowers (pixel offset per frame). */
const WIND = [0, 0, 1, 1, 1, 0, 0, 0, -1, 0];
const k6 = (p: Painter) => p.ri(6);

// ---------- ruins ----------
// Neighbour masks for connected tiles (walls, palisade): which sides continue into a tile of the same kind.
const N = 1, E = 2, S = 4, W = 8;

/** Worn flagstones: a few large slabs with dark joints, chipped edges and moss. */
const flags = (p: Painter) => {
  p.fill(0x6e6a61);
  const xs = [0, 5 + p.ri(4), 16], cols = [0x8f897c, 0x9a9488, 0x878175, 0xa29c8f];
  for (let r = 0; r < 2; r++) {
    const y0 = r * 8, y1 = y0 + 8, off = r ? p.ri(5) - 2 : 0;
    for (let c = 0; c < 2; c++) {
      const x0 = Math.max(0, xs[c] + (c ? off : 0)), x1 = Math.min(16, xs[c + 1] + (c ? 0 : off));
      const col = cols[p.ri(4)];
      p.rect(x0, y0, x1 - x0 - 1, 7, col);
      p.rect(x0, y0, x1 - x0 - 1, 1, 0xa39d90);
      p.rect(x0, y0 + 6, x1 - x0 - 1, 1, 0x7f7a6f);
      p.speckle(0x807a6e, 4, x0, y0 + 1, Math.max(1, x1 - x0 - 1), 5);
    }
  }
  if (p.r() < 0.6) { const x = 2 + p.ri(11), y = 1 + p.ri(13); p.px(x, y, 0x5f5b53); p.px(x + 1, y + 1, 0x5f5b53); p.px(x + 1, y + 2, 0x5f5b53); }
  p.speckle(0x5f8f3f, 5); p.speckle(0x4a7a32, 3);
};
/** Plank floor: boards of varying tone, staggered joints, the odd missing board. */
const planks = (p: Painter) => {
  p.fill(0x5e4630);
  const tones = [0x8a6a44, 0x84653f, 0x8f6f49, 0x806240];
  for (let y = 0; y < 16; y += 4) {
    const j = 3 + p.ri(10), c = tones[p.ri(4)];
    p.rect(0, y, 16, 3, c); p.rect(0, y, 16, 1, 0x967550);
    p.rect(j, y, 1, 3, 0x5e4630);
    p.px(p.ri(16), y + 1 + p.ri(2), 0x76593a); p.px(p.ri(16), y + 1, 0x76593a);
  }
  if (p.r() < 0.12) { const x = p.ri(10), y = 4 * p.ri(4); p.rect(x, y, 5, 3, 0x4a3828); p.px(x + 1, y + 1, 0x4f6e33); }
  p.speckle(0x5a8a3a, 2);
};
/** Scattered broken stones and splinters on top of whatever is underneath. */
const debris = (p: Painter, n: number) => {
  for (let k = 0; k < n; k++) {
    const x = 1 + p.ri(12), y = 2 + p.ri(11), w = 2 + p.ri(2), c = [0x9a948a, 0x8a847a, 0xa8a296][p.ri(3)];
    p.rect(x, y + 2, w, 1, "rgba(0,0,0,0.28)");
    p.rect(x, y, w, 2, c); p.rect(x, y, w - 1, 1, 0xc0baad);
  }
  if (p.r() < 0.6) { const x = p.ri(10), y = 3 + p.ri(11); p.rect(x, y, 5, 1, 0x4e331c); p.px(x + 4, y, 0x2a1d14); }
};

/** Stone wall seen from above at a slight angle: a light top course and a darker brick face, broken and mossy. */
const ruinWall = (p: Painter, m: number) => {
  const horiz = !!(m & (E | W)) || !(m & (N | S));
  const top = 0xb2ab9c, topJ = 0x8a8477, face = 0x8a8478, mortar = 0x625e56;
  // jagged broken top: higher towards connected sides, crumbling at free ends
  const jag: number[] = [];
  for (let x = 0, h = p.ri(2); x < 16; x++) {
    if (p.r() < 0.3) h = Math.max(0, Math.min(2, h + (p.r() < 0.5 ? -1 : 1)));
    let hh = h;
    if (!(m & W) && x < 4) hh += 4 - x;
    if (!(m & E) && x > 11) hh += x - 11;
    jag.push(hh);
  }
  if (horiz) {
    const x0 = m & W ? 0 : 1, x1 = m & E ? 16 : 15;
    p.rect(x0, 15, x1 - x0, 1, "rgba(0,0,0,0.25)");
    for (let x = x0; x < x1; x++) {
      const t = 1 + jag[x];
      if (t > 12) continue;
      p.rect(x, t, 1, Math.max(0, 7 - t), top);
      p.px(x, t, 0xc8c1b1);
      p.rect(x, Math.max(t, 7), 1, 15 - Math.max(t, 7), face);
    }
    for (const y of [10, 13]) for (let x = x0; x < x1; x++) if (1 + jag[x] < y) p.px(x, y, mortar);
    for (let x = x0 + 2; x < x1; x += 4) if (1 + jag[x] < 8) { p.px(x, 8, mortar); p.px(x, 9, mortar); }
    for (let x = x0; x < x1; x += 4) if (1 + jag[x] < 11) { p.px(x + 1, 11, mortar); p.px(x + 1, 12, mortar); }
    for (let x = x0 + 3; x < x1; x += 5) if (1 + jag[x] < 4) p.px(x, 4, topJ);
    p.rect(x0, 7, x1 - x0, 1, 0x9d968a);
    p.rect(x0, 14, x1 - x0, 1, 0x57534c);
  }
  if (m & (N | S)) {
    const y0 = m & N ? 0 : 1, y1 = m & S ? 16 : 8;
    p.rect(12, y0 + 1, 2, y1 - y0, "rgba(0,0,0,0.2)");
    p.rect(4, y0, 8, y1 - y0, top);
    p.rect(4, y0, 1, y1 - y0, 0xc8c1b1); p.rect(11, y0, 1, y1 - y0, topJ);
    for (let y = y0 + 3; y < y1; y += 4) p.rect(5, y, 6, 1, topJ);
    for (let y = y0 + 1; y < y1; y += 4) p.px(8, y, topJ);
    if (!(m & N)) { p.px(4, y0, 0x8a8477); p.px(10, y0, 0x8a8477); p.rect(5, y0, 3, 1, 0xc8c1b1); }
    if (!(m & S) && !horiz) {
      p.rect(4, 8, 8, 7, face); p.rect(4, 11, 8, 1, mortar); p.px(7, 8, mortar); p.px(7, 9, mortar); p.px(9, 12, mortar); p.px(9, 13, mortar);
      p.rect(4, 14, 8, 1, 0x57534c); p.rect(4, 15, 9, 1, "rgba(0,0,0,0.25)");
    }
  }
  // moss and ivy in the cracks
  for (let k = 0; k < 5; k++) { const x = 3 + p.ri(10), y = 4 + p.ri(9); p.px(x, y, k % 2 ? 0x5f8f3f : 0x4a7a32); }
  // fallen stones at broken ends
  if (horiz && !(m & E)) { p.rect(13, 13, 2, 2, 0x9a948a); p.px(13, 13, 0xc0baad); }
  if (horiz && !(m & W)) { p.rect(1, 13, 2, 2, 0x8a847a); p.px(1, 13, 0xc0baad); }
};

/** Charred timber frame: a sill beam with burnt uprights of uneven height. */
const beamWall = (p: Painter, m: number) => {
  const horiz = !!(m & (E | W)) || !(m & (N | S));
  const post = (x: number, top: number, bot: number) => {
    p.rect(x, top, 4, bot - top, 0x4a3524);
    p.rect(x, top, 1, bot - top, 0x6b4a30); p.rect(x + 3, top, 1, bot - top, 0x2a1d14);
    p.rect(x, top, 4, 1, 0x1a1210); p.px(x + (p.ri(2) ? 0 : 3), top + 1, 0x1a1210); p.px(x + 1, top + 3 + p.ri(3), 0x2a1d14);
  };
  if (horiz) {
    const x0 = m & W ? 0 : 2, x1 = m & E ? 16 : 14;
    p.rect(x0, 14, x1 - x0, 2, "rgba(0,0,0,0.25)");
    post(x0 === 0 ? 1 : 2, 1 + p.ri(4), 14);
    if (p.r() < 0.55) post(8 + p.ri(3), 3 + p.ri(5), 14);
    p.rect(x0, 10, x1 - x0, 5, 0x5a3e28); p.rect(x0, 10, x1 - x0, 1, 0x7a5636); p.rect(x0, 14, x1 - x0, 1, 0x3a2818);
    for (let x = x0 + 2; x < x1 - 1; x += 5) p.px(x, 12, 0x3a2818);
    p.px(x0 + 3 + p.ri(8), 12, 0x1a1210); p.px(x0 + 2 + p.ri(8), 13, 0x2a1d14);
  }
  if (m & (N | S)) {
    const y0 = m & N ? 0 : 3, y1 = m & S ? 16 : 13;
    p.rect(11, y0 + 1, 2, y1 - y0, "rgba(0,0,0,0.25)");
    p.rect(4, y0, 7, y1 - y0, 0x5a3e28); p.rect(4, y0, 1, y1 - y0, 0x7a5636); p.rect(10, y0, 1, y1 - y0, 0x3a2818);
    for (let y = y0 + 2; y < y1; y += 5) p.rect(6, y, 3, 1, 0x3a2818);
    if (!horiz && !(m & S)) post(6, 3 + p.ri(4), 14);
    else if (!horiz && p.r() < 0.5) post(6, 1 + p.ri(4), 8 + p.ri(4));
  }
  p.speckle(0x5a9a3c, 3, 0, 12, 16, 4);
};

/** Pointed log stakes; vertical runs are drawn as a single file of stakes seen side-on. */
const palisade = (p: Painter, m: number) => {
  const stake = (x: number, top: number, bot: number, lean = 0) => {
    p.rect(x + lean, top + 1, 3, bot - top - 1, 0x7a5230);
    p.rect(x + lean, top + 1, 1, bot - top - 1, 0x9a6a40); p.rect(x + 2 + lean, top + 1, 1, bot - top - 1, 0x4e331c);
    p.px(x + 1 + lean, top, 0x9a6a40);
    p.rect(x + lean, bot - 1, 3, 1, 0x3e2814);
  };
  if (m & (E | W) || !(m & (N | S))) {
    const x0 = m & W ? 0 : 1, x1 = m & E ? 16 : 13;
    p.rect(x0, 14, x1 - x0, 2, "rgba(0,0,0,0.22)");
    for (let x = x0; x + 2 < x1 + 1; x += 4) stake(x, 1 + p.ri(3) + (!(m & E) && x > 8 ? 3 : 0) + (!(m & W) && x < 4 ? 3 : 0), 15);
    p.rect(x0, 9, x1 - x0, 1, 0x4e331c); p.rect(x0, 5, x1 - x0, 1, 0x5e3b1f);
  }
  if (m & (N | S)) {
    const y0 = m & N ? -2 : 1;
    p.rect(11, 2, 2, 14, "rgba(0,0,0,0.2)");
    stake(5, Math.max(0, y0), 9); stake(8, Math.max(0, y0) + 2, 11); stake(5, 6, 16); stake(8, 9, 16);
    p.rect(5, 5, 6, 1, 0x4e331c); p.rect(5, 13, 6, 1, 0x4e331c);
  }
};

const LIGHT_GRASS = [0x5a9a3c, 0x4a8532, 0x6fb04a, 0x5a9a3c];

const DRAW: Record<number, (p: Painter, f: number, v: number) => void> = {
  [T.GRASS]: (p) => grass(p),
  [T.GRASS_DARK]: (p, _f, m) => {
    grass(p, 0x4f8c36, 0x427a2c, 0x5f9f42);
    // soft dithered edge towards lighter grass (m has a bit set for each side that is light grass)
    if (!m) return;
    p.each((x, y) => {
      let d = 9;
      if (m & N) d = Math.min(d, y); if (m & S) d = Math.min(d, 15 - y);
      if (m & W) d = Math.min(d, x); if (m & E) d = Math.min(d, 15 - x);
      return d < 4 && p.r() < (4 - d) / 4.5 ? LIGHT_GRASS[p.ri(4)] : undefined;
    });
  },
  [T.TALL_GRASS]: (p, f) => {
    grass(p);
    // tufts of three blades; tips lean with the wind on alternate frames
    const lean = WIND[f % WIND.length];
    for (let k = 0; k < 5; k++) {
      const x = 2 + p.ri(12), y = 4 + p.ri(10), h = 3 + p.ri(2);
      p.rect(x - 1, y, 3, 1, 0x3f7a2a);
      p.rect(x, y - h + 1, 1, h - 1, 0x4a8a30); p.px(x + lean, y - h, 0x7cc455);
      p.rect(x - 1, y - h + 2, 1, h - 2, 0x5a9a3c); p.px(x - 2 + (k % 2 ? lean : 0), y - h + 1, 0x6fb04a);
      p.rect(x + 1, y - h + 3, 1, h - 3, 0x5a9a3c); p.px(x + 2 + (k % 2 ? 0 : lean), y - h + 2, 0x8fd468);
    }
  },
  [T.FLOWERS]: (p, f) => {
    grass(p);
    const cols = [0xf06292, 0xfff176, 0xffffff, 0xba68c8, 0x64b5f6];
    const lean = WIND[f % WIND.length];
    for (let k = 0; k < 5; k++) {
      const x0 = 2 + p.ri(12), y = 2 + p.ri(12), c = cols[k];
      p.px(x0, y + 2, 0x3f7a2a);
      const x = x0 + (k % 2 ? lean : 0);
      p.px(x - 1, y, c); p.px(x + 1, y, c); p.px(x, y - 1, c); p.px(x, y + 1, c); p.px(x, y, 0xffd54f);
    }
  },
  [T.DIRT]: (p) => { p.fill(0xa7814f); p.speckle(0x8f6c3f, 30); p.speckle(0xbd9763, 14); p.speckle(0x7a7a72, 3); },
  [T.COBBLE]: (p) => {
    p.fill(0x77726a);
    const stones = [0x9c978a, 0xa29d90, 0x968f83, 0x908b7f];
    for (let y = 0; y < 16; y += 4) {
      let x = -p.ri(3);
      while (x < 16) {
        const w = 3 + p.ri(3), x0 = Math.max(x, 0), x1 = Math.min(x + w - 1, 16);
        if (x1 > x0) {
          p.rect(x0, y, x1 - x0, 3, stones[p.ri(4)]);
          p.rect(x0, y, x1 - x0, 1, 0xaba699); p.rect(x0, y + 2, x1 - x0, 1, 0x8a8579);
          if (x >= 0) p.px(x0, y + 2, 0x77726a);
        }
        x += w;
      }
    }
    p.speckle(0x5f8f3f, 2);
  },
  [T.SAND]: (p) => { p.fill(0xd9c38a); p.speckle(0xc4ad74, 22); p.speckle(0xe8d6a3, 12); },
  [T.WATER]: (p, f) => {
    p.fill(0x3a78b8); p.speckle(0x2f68a3, 20);
    // ripples drift slowly and twinkle
    for (let k = 0; k < 5; k++) {
      const x = p.ri(12), y = (p.ri(16) + (f >> 1)) % 16, on = (k + f) % 4;
      if (on === 0) continue;
      p.rect(x, y, on === 2 ? 3 : 2, 1, 0x6ea6dc); p.px(x + (on === 2 ? 3 : 2), y, 0x4f8dc8);
    }
    if (f % 6 === k6(p)) p.px(p.ri(14) + 1, p.ri(14) + 1, 0xd8ecff);
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

  [T.FLOOR]: (p) => planks(p),
  [T.FLAGS]: (p) => flags(p),
  [T.RUBBLE]: (p, _f, v) => { // debris over the floor it lies on: 0 flagstones, 1 planks, 2 grass, 3 dirt
    const base = v >> 2;
    if (base === 0) flags(p); else if (base === 1) planks(p); else if (base === 2) grass(p);
    else { p.fill(0xa7814f); p.speckle(0x8f6c3f, 30); p.speckle(0xbd9763, 14); }
    debris(p, base === 2 ? 3 : base === 1 ? 2 : 3);
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
  [T.BEAM]: (p, _f, m) => beamWall(p, m),
  [T.PALISADE]: (p, _f, m) => palisade(p, m),
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
  [T.WHEEL]: (p, f) => {
    const rot = (f % 12) * (Math.PI / 24); // spokes repeat every 45°, so 12 frames make a full loop
    p.each((x, y) => {
      const dx = x + 0.5 - 8, dy = y + 0.5 - 8, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx) - rot;
      if (d < 1.6) return 0x3a3a3a;
      if (d > 5.6 && d < 7.6) return (Math.round(a / (Math.PI / 6)) & 1) ? 0x6b4426 : 0x8b5e34;
      const m = ((a % (Math.PI / 4)) + Math.PI / 4) % (Math.PI / 4); // angle to nearest spoke
      if (d < 6 && (m < 0.18 * (6 / Math.max(d, 1)) || Math.PI / 4 - m < 0.18 * (6 / Math.max(d, 1)))) return 0x8b5e34;
      if (d >= 7.6 && d < 8.2 && (Math.round(a / (Math.PI / 6)) & 1)) return 0x9fd0ff; // water dripping off paddles
      return undefined;
    });
  },
  [T.CAMPFIRE]: (p, f) => {
    p.each((x, y) => {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 10);
      return d > 4.5 && d < 6.2 && (x + y) % 3 ? 0x7a7a7a : undefined;
    });
    p.rect(4, 10, 8, 2, 0x6b4426); p.rect(5, 11, 6, 2, 0x4e301a);
    const fl = [[0, 1, 0], [1, 0, 1], [0, 2, 1], [1, 1, 0]][f % 4];
    p.rect(6, 6 + fl[0], 4, 5 - fl[0], 0xff8c1a); p.rect(7 - fl[2], 4 - fl[1] + 1, 2, 3, 0xffb23a);
    p.rect(7, 7, 2, 3, 0xffe066); p.px(8 + fl[2], 3 - fl[1] + 1, 0xffb23a);
    if (fl[1] === 2) p.px(7, 1, 0xffe066);
  },
  [T.RUIN]: (p, _f, m) => ruinWall(p, m),
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

/**
 * The tileset has ROWS rows. Row 0 is the plain tile; other rows hold variants:
 *  - random look-alikes for ground tiles (rows 0-3), so large areas don't repeat,
 *  - neighbour masks for connected tiles (walls, palisade, dark-grass edges),
 *  - the floor under rubble (rows 0-15 = base * 4 + variant).
 * A tilemap index is `row * TILE_COUNT + id`.
 */
export const ROWS = 16;
const VARIED = new Set<number>([T.GRASS, T.TALL_GRASS, T.FLOWERS, T.DIRT, T.COBBLE, T.SAND, T.WATER, T.FLOOR, T.FLAGS, T.FIELD, T.BRIDGE]);
const CONNECTED = new Set<number>([T.RUIN, T.BEAM, T.PALISADE]);
const LIGHT = new Set<number>([T.GRASS, T.TALL_GRASS, T.FLOWERS]);

const paint = (ctx: CanvasRenderingContext2D, id: number, row: number, f: number) =>
  DRAW[id]?.(new Painter(ctx, id * TILE, id + 1 + row * 131, row * TILE), f, row);

/** Paints every tile and variant onto the given context (TILE_COUNT × ROWS tiles). */
export function drawTileset(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, TILE * TILE_COUNT, TILE * ROWS);
  for (let i = 0; i < TILE_COUNT; i++) {
    const rows = VARIED.has(i) ? 4 : CONNECTED.has(i) || i === T.GRASS_DARK || i === T.RUBBLE ? ROWS : 1;
    for (let r = 0; r < rows; r++) paint(ctx, i, r, 0);
  }
}

const vhash = (x: number, y: number) => { let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h >>> 0) % 4; };

/** Tileset row to use for tile `id` at (x, y) of `grid`. */
export function tileRow(grid: number[][], x: number, y: number): number {
  const id = grid[y][x];
  const at = (i: number, j: number) => grid[j]?.[i] ?? id;
  const mask = (ok: (t: number) => boolean) => (ok(at(x, y - 1)) ? 1 : 0) | (ok(at(x + 1, y)) ? 2 : 0) | (ok(at(x, y + 1)) ? 4 : 0) | (ok(at(x - 1, y)) ? 8 : 0);
  if (CONNECTED.has(id)) return mask((t) => t === id);
  if (id === T.GRASS_DARK) return mask((t) => LIGHT.has(t));
  if (id === T.RUBBLE) {
    let fl = 0, pl = 0, gr = 0;
    for (const [i, j] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) { const t = at(i, j); if (t === T.FLAGS || t === T.COBBLE) fl++; else if (t === T.FLOOR) pl++; else if (LIGHT.has(t) || t === T.GRASS_DARK) gr++; }
    const base = fl >= pl && fl >= gr && fl > 0 ? 0 : pl >= gr && pl > 0 ? 1 : gr > 0 ? 2 : 3;
    return base * 4 + vhash(x, y);
  }
  return VARIED.has(id) ? vhash(x, y) : 0;
}

/** Converts a grid of tile ids to tilemap indices (variants and connections resolved). */
export function displayGrid(grid: number[][]): number[][] {
  return grid.map((row, y) => row.map((id, x) => (id < 0 ? id : tileRow(grid, x, y) * TILE_COUNT + id)));
}

/** Tiles that change over time (see `drawTileFrame`). */
export const ANIMATED_TILES: number[] = [T.WATER, T.WHEEL, T.CAMPFIRE, T.TALL_GRASS, T.FLOWERS];

/** Repaints one tile (all its variant rows) for animation frame `f` (same seeds, so only the moving parts change). */
export function drawTileFrame(ctx: CanvasRenderingContext2D, id: number, f: number) {
  const rows = VARIED.has(id) ? 4 : 1;
  for (let r = 0; r < rows; r++) { ctx.clearRect(id * TILE, r * TILE, TILE, TILE); paint(ctx, id, r, f); }
}

export function createTilesetCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE * TILE_COUNT; c.height = TILE * ROWS;
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
