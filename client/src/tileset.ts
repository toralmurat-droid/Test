import { ART_K, TILE } from "../../shared/constants";
import { SIGNPOSTS, T, TILE_COUNT, VILLAGE } from "../../shared/map";

/**
 * Procedural 32×32 pixel-art tileset (no image assets needed yet).
 * Pure canvas so both the game (Phaser) and the map viewer can use it.
 * Tile index order matches `T` in shared/map.ts.
 */
type Color = number | string;
const css = (c: Color) => (typeof c === "number" ? "#" + c.toString(16).padStart(6, "0") : c);
const SHADOW = "rgba(0,0,0,0.25)";

/**
 * Paints one tile. Shapes are described on a 16-unit design grid and drawn at full resolution:
 * `rect` and `px` cover K×K screen pixels per unit, while `disc`, `each` and `speckle` work per
 * screen pixel, so curves, shading and texture get the finer 32px detail. `fpx` paints a single
 * screen pixel (0..TILE-1) for hand-placed fine detail.
 */
export class Painter {
  private s: number;
  /** `k`: screen pixels per design unit (smaller props use k < 2 and an offset inside the tile). */
  constructor(private ctx: CanvasRenderingContext2D, private ox: number, seed: number, private oy = 0, private k = K, private lx = 0, private ly = 0) { this.s = seed * 7919 + 13; }
  r() { this.s = (this.s * 9301 + 49297) % 233280; return this.s / 233280; }
  ri(n: number) { return Math.floor(this.r() * n); }
  rect(x: number, y: number, w: number, h: number, c: Color) {
    this.ctx.fillStyle = css(c);
    const k = this.k, x0 = Math.round(x * k), y0 = Math.round(y * k);
    this.ctx.fillRect(this.ox + x0, this.oy + y0, Math.round((x + w) * k) - x0, Math.round((y + h) * k) - y0);
  }
  px(x: number, y: number, c: Color) { this.rect(x, y, 1, 1, c); }
  /** One screen pixel, in screen pixels (0..TILE-1). */
  fpx(x: number, y: number, c: Color) {
    if (x + this.lx < 0 || y + this.ly < 0 || x + this.lx >= TILE || y + this.ly >= TILE) return;
    this.ctx.fillStyle = css(c);
    this.ctx.fillRect(this.ox + x, this.oy + y, 1, 1);
  }
  /** A run of screen pixels. */
  frect(x: number, y: number, w: number, h: number, c: Color) {
    this.ctx.fillStyle = css(c);
    this.ctx.fillRect(this.ox + x, this.oy + y, w, h);
  }
  fill(c: Color) { this.rect(0, 0, 16, 16, c); }
  /** Fine single-pixel grain over a design-unit rectangle (n is in design-pixel terms: ~2.5x as many fine dots). */
  speckle(c: Color, n: number, x0 = 0, y0 = 0, w = 16, h = 16) {
    const m = Math.round(n * this.k * 1.25);
    for (let k = 0; k < m; k++) this.fpx(Math.floor((x0 + this.r() * w) * this.k), Math.floor((y0 + this.r() * h) * this.k), c);
  }
  /** Pixel ellipse (design units), rasterised at full resolution. */
  disc(cx: number, cy: number, rx: number, ry: number, c: Color) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const dx = ((x + 0.5) / this.k - cx) / rx, dy = ((y + 0.5) / this.k - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.fpx(x, y, c);
    }
  }
  /** Per-pixel painter at full resolution. `x`, `y` are design units, so `x + 0.5` is the pixel centre. */
  each(f: (x: number, y: number) => Color | undefined) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const c = f((x + 0.5) / this.k - 0.5, (y + 0.5) / this.k - 0.5);
      if (c !== undefined) this.fpx(x, y, c);
    }
  }
}
const K = ART_K;

// ---------- ground ----------
const SZ = TILE; // screen pixels per tile side
/** Grass at full resolution: soft mottling, fine grain and short blades with lit tips. */
const grass = (p: Painter, base = 0x5a9a3c, dark = 0x4a8532, light = 0x6fb04a, tip = 0x7cc455) => {
  p.fill(base);
  for (let k = 0; k < 5; k++) { // mottled patches: dithered so tiles blend into each other
    const cx = p.ri(SZ), cy = p.ri(SZ), r = 3 + p.ri(4), c = k % 2 ? dark : light;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r * r && ((x + y) & 1) === 0 && p.r() < 0.8) p.fpx((cx + x + SZ) % SZ, (cy + y + SZ) % SZ, c);
  }
  for (let k = 0; k < 70; k++) p.fpx(p.ri(SZ), p.ri(SZ), dark);
  for (let k = 0; k < 30; k++) p.fpx(p.ri(SZ), p.ri(SZ), light);
  for (let k = 0; k < 16; k++) { // blades: dark stem, lighter tip
    const x = p.ri(SZ), y = 3 + p.ri(SZ - 3), h = 2 + p.ri(3), lean = p.r() < 0.3 ? (p.r() < 0.5 ? -1 : 1) : 0;
    for (let i = 0; i < h; i++) p.fpx(x + (i === h - 1 ? lean : 0), y - i, i === h - 1 ? tip : i === 0 ? dark : light);
  }
};
/** Packed earth: fine grain, a few pebbles with lit tops, faint ruts. */
const dirt = (p: Painter) => {
  p.fill(0xa7814f);
  for (let k = 0; k < 90; k++) p.fpx(p.ri(SZ), p.ri(SZ), 0x957244);
  for (let k = 0; k < 40; k++) p.fpx(p.ri(SZ), p.ri(SZ), 0xbd9763);
  for (let k = 0; k < 25; k++) p.fpx(p.ri(SZ), p.ri(SZ), 0x8a6a3e);
  for (let k = 0; k < 3; k++) {
    const x = 2 + p.ri(SZ - 5), y = 2 + p.ri(SZ - 5);
    p.frect(x, y + 2, 3, 1, 0x7a5e38); p.frect(x, y, 3, 2, 0x8a7a64); p.fpx(x, y, 0xb0a08a); p.fpx(x + 1, y, 0xa09078);
  }
  if (p.r() < 0.5) { const y = 4 + p.ri(SZ - 8); for (let x = p.ri(6); x < SZ - p.ri(6); x++) if (p.r() < 0.7) p.fpx(x, y + (x % 7 === 0 ? 1 : 0), 0x926e40); }
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

/**
 * Stockade of log stakes with sharpened pikes jutting outward at uneven angles.
 * v = neighbour mask (bits 0-3) | 16 if the outside is to the south | 32 if the outside is to the east.
 */
const palisade = (p: Painter, v: number) => {
  // Drawn per screen pixel: a low wall of slim sharpened logs (about 2/3 of a hero's height) bound with rope,
  // with thin pikes jutting outward at uneven angles.
  const m = v & 15, outS = !!(v & 16), outE = !!(v & 32);
  const horiz = !!(m & (E | W)) || !(m & (N | S)), vert = !!(m & (N | S));
  const T_ = SZ, cx = outE ? 8 : 16; // x of the 8px log column in vertical runs (room for pikes outside)
  const shade = (c: number, k: number) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; const f = (x: number) => Math.max(0, Math.min(255, Math.round(x * k))); return (f(r) << 16) | (f(g) << 8) | f(b); };
  /** One upright log, 4px wide, with a whittled point. */
  const log = (x: number, top: number, bot: number) => {
    const base = [0x7a5230, 0x84593a, 0x704a2a][p.ri(3)];
    for (let y = top + 2; y < bot; y++) {
      p.fpx(x, y, shade(base, 1.3)); p.fpx(x + 1, y, base); p.fpx(x + 2, y, base); p.fpx(x + 3, y, shade(base, 0.62));
    }
    for (let k = 0; k < 2; k++) p.fpx(x + 1 + p.ri(2), top + 4 + p.ri(Math.max(1, bot - top - 6)), shade(base, 0.8)); // knots
    p.frect(x, top + 1, 4, 1, shade(base, 1.25)); p.fpx(x + 3, top + 1, shade(base, 0.8));
    p.fpx(x + 1, top, 0xd8b88a); p.fpx(x + 2, top, 0xc09a6a); // cut point
    p.fpx(x, bot - 1, 0x3e2814); p.fpx(x + 1, bot - 1, 0x4e331c); p.fpx(x + 2, bot - 1, 0x4e331c); p.fpx(x + 3, bot - 1, 0x2e1e10);
  };
  /** A slim sharpened pike from (x, y) along angle a, 2px thick with a pale tip. */
  const pike = (x: number, y: number, a: number, len: number) => {
    const dx = Math.cos(a), dy = Math.sin(a), steep = Math.abs(dy) > Math.abs(dx);
    for (let t = 0; t <= len; t++) {
      const px = Math.round(x + dx * t), py = Math.round(y + dy * t);
      if (t >= len - 2) { p.fpx(px, py, t === len ? 0xf2e8cc : 0xd8c49a); continue; }
      p.fpx(px, py, 0x9a6a3c);
      p.fpx(px + (steep ? 1 : 0), py + (steep ? 0 : 1), 0x5e3b1f);
    }
  };
  const jitter = () => (p.r() - 0.5) * 0.9; // up to about ±25°
  const rope = (x0: number, x1: number, y: number) => { p.frect(x0, y, x1 - x0, 1, 0x3a2614); for (let x = x0 + (y % 2); x < x1; x += 2) p.fpx(x, y - 1, 0x8a6a40); };

  if (horiz) {
    const x0 = m & W ? 0 : vert ? cx : 2, x1 = m & E ? T_ : vert ? cx + 8 : T_ - 2;
    const top = () => 13 + p.ri(3), bot = 30;
    if (!outS) { // outside is north: pikes rise from behind the wall
      for (let x = x0 + 1 + p.ri(3); x < x1 - 2; x += 6 + p.ri(3)) pike(x, 17, -Math.PI / 2 + jitter(), 13 + p.ri(4));
      p.frect(x0, 30, x1 - x0, 2, "rgba(0,0,0,0.22)");
      for (let x = x0; x + 3 < x1 + 1; x += 4) log(x, top(), bot);
      rope(x0, x1, 18); rope(x0, x1, 25);
    } else { // outside is south: pikes jut out in front of the wall
      p.frect(x0, 29, x1 - x0, 2, "rgba(0,0,0,0.22)");
      for (let x = x0; x + 3 < x1 + 1; x += 4) log(x, 9 + p.ri(3), 26);
      rope(x0, x1, 14); rope(x0, x1, 21);
      for (let x = x0 + 2 + p.ri(3); x < x1 - 2; x += 6 + p.ri(3)) {
        const a = Math.PI / 2 + jitter();
        p.fpx(Math.round(x + Math.cos(a) * 6) + 2, 31, "rgba(0,0,0,0.25)");
        pike(x, 22, a, 7 + p.ri(3));
      }
    }
  }
  if (vert) {
    const y0 = m & N ? 0 : horiz ? (outS ? 9 : 13) : 4, y1 = m & S ? T_ : horiz ? 28 : 28;
    p.frect(cx + 8, y0 + 2, 2, y1 - y0, "rgba(0,0,0,0.22)");
    for (let i = 0; i < 2; i++) { // two logs side by side, seen from above at an angle
      const x = cx + i * 4, base = i ? 0x704a2a : 0x7a5230;
      for (let y = y0; y < y1; y++) { p.fpx(x, y, shade(base, 1.3)); p.fpx(x + 1, y, base); p.fpx(x + 2, y, base); p.fpx(x + 3, y, shade(base, 0.62)); }
      for (let y = y0 + 3 + p.ri(4); y < y1 - 1; y += 5 + p.ri(4)) p.fpx(x + 1 + p.ri(2), y, shade(base, 0.8));
      if (!(m & N)) { p.fpx(x + 1, y0, 0xd8b88a); p.fpx(x + 2, y0, 0xc09a6a); }
    }
    for (let y = y0 + 5; y < y1 - 1; y += 9) { p.frect(cx, y, 8, 1, 0x3a2614); p.fpx(cx + 2, y - 1, 0x8a6a40); p.fpx(cx + 6, y - 1, 0x8a6a40); }
    for (let y = y0 + 3 + p.ri(3); y < y1 - 2; y += 6 + p.ri(3)) {
      if (outE) pike(cx + 8, y, jitter() * 0.8, 8 + p.ri(4));
      else pike(cx - 1, y, Math.PI + jitter() * 0.8, 8 + p.ri(4));
    }
  }
};

const LIGHT_GRASS = [0x5a9a3c, 0x4a8532, 0x6fb04a, 0x5a9a3c];

const DRAW: Record<number, (p: Painter, f: number, v: number) => void> = {
  [T.GRASS]: (p) => grass(p),
  [T.GRASS_DARK]: (p, _f, m) => {
    grass(p, 0x4f8c36, 0x427a2c, 0x5f9f42, 0x6aa84a);
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
    // tufts of tall blades; tips lean with the wind
    const lean = WIND[f % WIND.length];
    for (let k = 0; k < 6; k++) {
      const x = 4 + p.ri(SZ - 8), y = 9 + p.ri(SZ - 10), n = 3 + p.ri(3);
      p.frect(x - 2, y + 1, n + 3, 1, 0x3f7a2a);
      for (let b = 0; b < n; b++) {
        const bx = x + b - 1, h = 6 + p.ri(4) - Math.abs(b - (n >> 1)), side = b < n / 2 ? -1 : 1;
        for (let i = 0; i < h; i++) {
          const top = i >= h - 3, dx = top ? (b % 2 ? lean : side * (i === h - 1 ? 1 : 0)) : 0;
          p.fpx(bx + dx, y - i, i === h - 1 ? 0x8fd468 : i < 2 ? 0x3f7a2a : b % 2 ? 0x5a9a3c : 0x4a8a30);
        }
      }
    }
  },
  [T.FLOWERS]: (p, f) => {
    grass(p);
    const cols = [[0xf06292, 0xc2185b], [0xfff176, 0xd8b02a], [0xffffff, 0xc8d0e0], [0xba68c8, 0x7b3f9a], [0x64b5f6, 0x2e7ac0]];
    const lean = WIND[f % WIND.length];
    for (let k = 0; k < 6; k++) {
      const x0 = 3 + p.ri(SZ - 6), y = 4 + p.ri(SZ - 10), [c, sh] = cols[k % 5];
      const x = x0 + (k % 2 ? lean : 0);
      for (let i = 2; i < 6; i++) p.fpx(x0 + (i < 3 ? x - x0 : 0), y + i, i > 4 ? 0x3f7a2a : 0x4a8a30); p.fpx(x0 + 1, y + 4, 0x5aa845); p.fpx(x0 + 2, y + 3, 0x5aa845);
      // a 4×4 bloom: petals around a yellow heart, shaded underneath
      ([".cc.", "cyyc", "cyys", ".ss."] as const).forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch !== ".") p.fpx(x - 1 + i, y - 2 + j, ch === "c" ? c : ch === "s" ? sh : j === 1 && i === 1 ? 0xfff3a0 : 0xffc83a);
      }));
    }
  },
  [T.DIRT]: (p) => dirt(p),
  [T.COBBLE]: (p) => {
    const mortar = 0x6a655d;
    p.fill(mortar);
    const stones = [0x9c978a, 0xa29d90, 0x968f83, 0x908b7f, 0x8f8a80];
    for (let y = 0; y < SZ; y += 8) {
      let x = -p.ri(6);
      while (x < SZ) {
        const w = 6 + p.ri(5), h = 6 + (p.r() < 0.3 ? 1 : 0), col = stones[p.ri(5)];
        for (let j = 0; j < h; j++) for (let i = 0; i < w - 1; i++) {
          const cx = x + i, cy = y + j;
          if (cx < 0 || cx >= SZ) continue;
          const corner = (i === 0 || i === w - 2) && (j === 0 || j === h - 1);
          if (corner) continue;
          p.fpx(cx, cy, j === 0 || (i === 0 && j < h - 1) ? 0xb3ada0 : j === h - 1 || i === w - 2 ? 0x7f7a6f : col);
        }
        for (let n = 0; n < 2; n++) p.fpx(x + 1 + p.ri(Math.max(1, w - 3)), y + 1 + p.ri(h - 2), 0x88837a);
        x += w;
      }
    }
    for (let k = 0; k < 4; k++) { const x = p.ri(SZ); p.fpx(x, 7 + 8 * p.ri(4), 0x5f8f3f); } // moss in the joints
  },
  [T.SAND]: (p) => {
    p.fill(0xd9c38a);
    for (let k = 0; k < 80; k++) p.fpx(p.ri(SZ), p.ri(SZ), 0xc4ad74);
    for (let k = 0; k < 45; k++) p.fpx(p.ri(SZ), p.ri(SZ), 0xe8d6a3);
    for (let k = 0; k < 3; k++) { const x = 3 + p.ri(SZ - 6), y = 3 + p.ri(SZ - 6); p.fpx(x, y, 0xb59c66); p.fpx(x + 1, y, 0xf5ead0); } // tiny shells and grit
    if (p.r() < 0.4) { const x = 4 + p.ri(SZ - 10), y = 4 + p.ri(SZ - 8); for (let i = 0; i < 5; i++) p.fpx(x + i, y + (i % 2), 0xc9b27c); } // wind ripple
  },
  [T.WATER]: (p, f) => {
    p.fill(0x3a78b8);
    for (let k = 0; k < 70; k++) p.fpx(p.ri(SZ), p.ri(SZ), 0x3370ae);
    for (let k = 0; k < 40; k++) p.fpx(p.ri(SZ), p.ri(SZ), 0x2f68a3);
    // ripples drift slowly and twinkle
    for (let k = 0; k < 7; k++) {
      const x = p.ri(SZ - 8), y = (p.ri(SZ) + (f >> 1)) % SZ, on = (k + f) % 4, len = 3 + p.ri(4);
      if (on === 0) continue;
      const l = on === 2 ? len + 1 : len;
      p.frect(x, y, l, 1, 0x5b95cf); p.frect(x + 1, y, Math.max(1, l - 2), 1, 0x7ab0e2);
      p.fpx(x + 1, y + 1, 0x2f68a3); p.fpx(x + l - 2, y + 1, 0x2f68a3);
    }
    if (f % 6 === k6(p)) { const x = 2 + p.ri(SZ - 4), y = 2 + p.ri(SZ - 4); p.fpx(x, y, 0xd8ecff); p.fpx(x + 1, y, 0xa8d0f4); p.fpx(x - 1, y, 0xa8d0f4); }
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
    else dirt(p);
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
      return d > 4.5 && d < 6.2 && (Math.floor(x * K) + Math.floor(y * K)) % 5 ? 0x7a7a7a : undefined;
    });
    p.rect(4, 10, 8, 2, 0x6b4426); p.rect(5, 11, 6, 2, 0x4e301a);
    const fl = [[0, 1, 0], [1, 0, 1], [0, 2, 1], [1, 1, 0]][f % 4];
    p.rect(6, 6 + fl[0], 4, 5 - fl[0], 0xff8c1a); p.rect(7 - fl[2], 4 - fl[1] + 1, 2, 3, 0xffb23a);
    p.rect(7, 7, 2, 3, 0xffe066); p.px(8 + fl[2], 3 - fl[1] + 1, 0xffb23a);
    if (fl[1] === 2) p.px(7, 1, 0xffe066);
  },
  [T.RUIN]: (p, _f, m) => ruinWall(p, m),
  [T.BONFIRE]: (p) => { p.speckle(0x3a332c, 14); p.speckle(0xc0502a, 3); }, // ash; the fire itself is a sprite (ambient.ts)
  [T.SIGNPOST]: (p, _f, v) => { // a post with one arrow board per road leaving the spot (v: (boards-1)*16 + left-pointing bits)
    const n = (v >> 4) + 1;
    p.disc(8, 15, 4.5, 1.1, SHADOW);
    p.rect(7, 1, 2, 14, 0x6b4426); p.rect(7, 1, 1, 14, 0x8b5e34); p.px(7, 0, 0x8b5e34); p.px(8, 0, 0x6b4426);
    const board = (y: number, left: boolean, len: number) => {
      const x0 = left ? 8 - len : 8, x1 = left ? 8 : 8 + len;
      p.rect(x0, y, x1 - x0, 3, 0xb07a44); p.rect(x0, y, x1 - x0, 1, 0xd09a5c); p.rect(x0, y + 2, x1 - x0, 1, 0x7a522a);
      const tip = left ? x0 - 1 : x1;
      p.px(tip, y + 1, 0xb07a44); p.px(tip, y, 0x7a522a); p.px(tip, y + 2, 0x7a522a);
      for (let x = x0 + 1; x < x1 - 1; x += 2) p.px(x, y + 1, 0x5a3a1e); // carved letters
    };
    const gap = n >= 4 ? 3 : 4;
    for (let i = 0; i < n; i++) board(1 + i * gap, !!(v & (1 << i)), 6 - (i % 2));
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

/**
 * The tileset has ROWS rows. Row 0 is the plain tile; other rows hold variants:
 *  - random look-alikes for ground tiles (rows 0-3), so large areas don't repeat,
 *  - neighbour masks for connected tiles (walls, palisade, dark-grass edges),
 *  - the floor under rubble (rows 0-15 = base * 4 + variant).
 * A tilemap index is `row * TILE_COUNT + id`.
 */
export const ROWS = 64;
const VARIED = new Set<number>([T.GRASS, T.TALL_GRASS, T.FLOWERS, T.DIRT, T.COBBLE, T.SAND, T.WATER, T.FLOOR, T.FLAGS, T.FIELD, T.BRIDGE]);
const CONNECTED = new Set<number>([T.RUIN, T.BEAM, T.PALISADE]);
const LIGHT = new Set<number>([T.GRASS, T.TALL_GRASS, T.FLOWERS]);

/**
 * Small props are painted smaller than their tile so they stay in scale with the heroes (24px tall):
 * screen pixels per design unit, bottom-centred in the tile.
 */
const PROP_K: Partial<Record<number, number>> = {
  [T.GRAVE]: 1.3, [T.BARREL]: 1.45, [T.CRATE]: 1.4, [T.ANVIL]: 1.4, [T.STUMP]: 1.6, [T.HAY]: 1.7, [T.ROCK]: 1.7, [T.SIGN]: 1.6, [T.WELL]: 1.8,
};
const paint = (ctx: CanvasRenderingContext2D, id: number, row: number, f: number) => {
  const k = PROP_K[id] ?? K, lx = Math.round((TILE - 16 * k) / 2), ly = TILE - Math.round(16 * k);
  ctx.save();
  ctx.beginPath(); ctx.rect(id * TILE, row * TILE, TILE, TILE); ctx.clip(); // never bleed into the next tile
  DRAW[id]?.(new Painter(ctx, id * TILE + lx, id + 1 + row * 131, row * TILE + ly, k, lx, ly), f, row);
  ctx.restore();
};

/** Paints every tile and variant onto the given context (TILE_COUNT × ROWS tiles). */
export function drawTileset(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, TILE * TILE_COUNT, TILE * ROWS);
  for (let i = 0; i < TILE_COUNT; i++) {
    const rows = VARIED.has(i) ? 4 : i === T.PALISADE || i === T.SIGNPOST ? 64 : CONNECTED.has(i) || i === T.GRASS_DARK || i === T.RUBBLE ? 16 : 1;
    for (let r = 0; r < rows; r++) paint(ctx, i, r, 0);
  }
}

const vhash = (x: number, y: number) => { let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h >>> 0) % 4; };

/** Tileset row to use for tile `id` at (x, y) of `grid`. */
export function tileRow(grid: number[][], x: number, y: number): number {
  const id = grid[y][x];
  const at = (i: number, j: number) => grid[j]?.[i] ?? id;
  const mask = (ok: (t: number) => boolean) => (ok(at(x, y - 1)) ? 1 : 0) | (ok(at(x + 1, y)) ? 2 : 0) | (ok(at(x, y + 1)) ? 4 : 0) | (ok(at(x - 1, y)) ? 8 : 0);
  if (id === T.SIGNPOST) {
    const sp = SIGNPOSTS.find((s) => s.x === x && s.y === y);
    if (!sp) return 16; // two boards
    const n = Math.max(1, Math.min(4, sp.dirs.length));
    return (n - 1) * 16 + sp.dirs.slice(0, 4).reduce((m, d, i) => m | (Math.cos(d.angle) < 0 ? 1 << i : 0), 0);
  }
  if (id === T.PALISADE) // which way is outside: away from the village centre
    return mask((t) => t === id) | (y > (VILLAGE.y0 + VILLAGE.y1) / 2 ? 16 : 0) | (x > (VILLAGE.x0 + VILLAGE.x1) / 2 ? 32 : 0);
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
