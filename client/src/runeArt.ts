import Phaser from "phaser";
import { parseRune, Rune, RUNES } from "../../shared/runes";

/**
 * Rune stones (shared/runes.ts), drawn in code as 16x16 pixel art: a weathered stone with its glyph carved in and
 * glowing in the rune's colour. Rank changes the stone: Lesser = brown field stone, plain = slate, Greater = black
 * glass with a gold rim. One cached canvas per rune and rank; Phaser textures `rune_<key><rank>` for the ground.
 */
const S = 16;
// stone silhouette, '#' = stone
const SHAPE = [
  "................",
  ".....######.....",
  "...##########...",
  "..############..",
  "..############..",
  ".##############.",
  ".##############.",
  ".##############.",
  ".##############.",
  ".##############.",
  ".##############.",
  "..############..",
  "..############..",
  "...##########...",
  ".....######.....",
  "................",
];
const STONE = [0, 0x7a6a55, 0x5c6470, 0x24202c];
const RIM = [0, 0x2a2018, 0x1c2026, 0xb08a3a];

const mix = (a: number, b: number, t: number) => {
  const c = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (c(16) << 16) | (c(8) << 8) | c(0);
};
const mul = (a: number, f: number) => {
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((a >> s) & 255) * f)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
};
const lighten = (a: number, f: number) => mix(a, 0xffffff, f);
const css = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

const cache = new Map<string, HTMLCanvasElement>();

/** The 16x16 stone of a rune. */
export function runeStone(r: Rune): HTMLCanvasElement {
  const k = `${r.key}${r.rank}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
  const d = RUNES[r.key], base = STONE[r.rank], rim = RIM[r.rank];
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && SHAPE[y][x] === "#";
  // glyph cells (5x7 at 5..9, 4..10)
  const glyph = (x: number, y: number) => {
    const gx = x - 5, gy = y - 4;
    return gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && ((d.glyph[gy] >> (4 - gx)) & 1) === 1;
  };
  const near = (x: number, y: number) => !glyph(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => glyph(x + dx, y + dy));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!inside(x, y)) continue;
    let col: number;
    const edge = !inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1);
    if (edge) col = rim;
    else if (glyph(x, y)) col = lighten(d.color, (x + y) % 3 === 0 ? 0.35 : 0.1);
    else if (near(x, y)) col = mix(base, d.color, 0.35);
    else {
      // light from the top left, a few grains and pits (fixed per pixel, so the stone never flickers)
      const lit = 1.15 - ((x + y) / (S * 2)) * 0.55;
      const grain = ((x * 7 + y * 13 + r.rank * 5) % 11) / 11;
      col = mul(base, lit + (grain > 0.82 ? 0.18 : grain < 0.12 ? -0.16 : 0));
      if (x + y < 14 && (!inside(x - 2, y) || !inside(x, y - 2))) col = lighten(col, 0.18); // top-left highlight
    }
    ctx.fillStyle = css(col);
    ctx.fillRect(x, y, 1, 1);
  }
  // a chip of the rune's colour on a Greater rune's rim
  if (r.rank === 3) { ctx.fillStyle = css(lighten(rim, 0.4)); ctx.fillRect(7, 1, 2, 1); }
  cache.set(k, c);
  return c;
}

/** A rune icon for the menus, scaled up with crisp pixels. */
export function runeCanvas(id: string, size = 32): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const r = parseRune(id);
  if (!r) return c;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(runeStone(r), 0, 0, size, size);
  return c;
}

/** Phaser texture key of a rune stone (registered on first use). */
export function runeTexture(scene: Phaser.Scene, r: Rune): string {
  const key = `rune_${r.key}${r.rank}`;
  if (!scene.textures.exists(key)) {
    scene.textures.addCanvas(key, runeStone(r));
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  return key;
}

export const runeCss = (r: Rune) => css(RUNES[r.key].color);
