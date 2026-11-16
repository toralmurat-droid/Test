/**
 * Clan war W6 town banners: a long cloth banner on a crossbar with two hanging tassels, in each clan's cloth, trim and
 * sigil (shared/war/clans.ts), plus a plain grey one for a town nobody holds. Hung on building walls or poles.
 * Cosmetic: the server decides who holds a town.
 */
import type Phaser from "phaser";
import { CLANS, CLAN_KEYS, type ClanKey } from "../../shared/war/clans";

export const TOWN_BANNER_W = 16;
export const TOWN_BANNER_H = 40;
/** Texture key of a town banner: `townbanner_<clan>`, or `townbanner_neutral` for no holder. */
export const townBannerKey = (clan?: ClanKey | null) => `townbanner_${clan ?? "neutral"}`;

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
/** A colour scaled by f (darker below 1). */
const lerp = (n: number, f: number) => {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return hex(c((n >> 16) & 255) << 16 | c((n >> 8) & 255) << 8 | c(n & 255));
};

/** Paints one banner at art px size TOWN_BANNER_W x TOWN_BANNER_H (drawn 2x on the texture). */
function paintBanner(cloth: number, trim: number, sigil: number, neutral: boolean): HTMLCanvasElement {
  const W = TOWN_BANNER_W, H = TOWN_BANNER_H, c = document.createElement("canvas");
  c.width = W * 2; c.height = H * 2;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.scale(2, 2);
  const px = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  px(0, 0, W, 2, "#1a1008"); px(1, 0, W - 2, 1, "#6a4a28"); // the crossbar
  px(0, 0, 2, 3, "#c8a040"); px(W - 2, 0, 2, 3, "#c8a040"); // gilt ends
  const top = 2, bot = H - 2, tail = 7;
  for (let y = top; y < bot; y++) {
    const cut = y >= bot - tail ? y - (bot - tail) + 1 : 0; // swallow-tail notch
    for (let x = 2; x < W - 2; x++) {
      const mid = Math.abs(x - (W - 1) / 2);
      if (cut && mid < cut * 0.9) continue;
      const edge = x === 2 || x === W - 3 || y === bot - 1 || (cut > 0 && mid < cut * 0.9 + 1.2);
      const fold = x % 5 === 0 ? 0.88 : 1; // vertical cloth folds
      const wear = !neutral && (x * 13 + y * 7) % 23 === 0 ? 0.8 : 1; // weathering
      px(x, y, 1, 1, edge ? hex(trim) : lerp(cloth, (y < top + 3 ? 0.8 : 1) * fold * wear));
    }
  }
  px(2, top + 1, W - 4, 1, hex(trim)); // a hem stripe under the bar
  px(2, bot - tail - 2, W - 4, 1, hex(trim)); // and one above the tail
  if (!neutral) { // the sigil: a diamond ring with a centre dot
    const cx = 7, cy = 15, d = [[0, -4], [-1, -3], [1, -3], [-2, -2], [2, -2], [-3, -1], [3, -1], [-4, 0], [4, 0], [-3, 1], [3, 1], [-2, 2], [2, 2], [-1, 3], [1, 3], [0, 4]];
    for (const [dx, dy] of d) { px(cx + dx, cy + dy, 1, 1, hex(sigil)); px(cx + dx + 1, cy + dy, 1, 1, hex(sigil)); }
    px(cx, cy - 1, 2, 3, hex(sigil));
  } else { px(5, 13, 6, 1, "#8a847a"); px(5, 16, 6, 1, "#8a847a"); } // a plain pair of stripes
  px(7, bot - 1, 2, 3, "#c8a040"); // a tassel
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(W - 3, top, 1, bot - top - tail); // a shaded side
  return c;
}

/** Registers `townbanner_<clan>` for the five clans and `townbanner_neutral`; safe to call again. */
export function registerTownBanners(scene: Phaser.Scene): void {
  for (const k of CLAN_KEYS) {
    const key = townBannerKey(k);
    if (scene.textures.exists(key)) continue;
    const cl = CLANS[k];
    scene.textures.addCanvas(key, paintBanner(cl.cloth, cl.trim, cl.sigil, false));
  }
  const nk = townBannerKey(null);
  if (!scene.textures.exists(nk)) scene.textures.addCanvas(nk, paintBanner(0x5a5650, 0x3a3632, 0x8a847a, true));
}

/** Banner canvases for tools and previews (same drawing as the textures). */
export function townBannerCanvas(clan?: ClanKey | null): HTMLCanvasElement {
  if (!clan) return paintBanner(0x5a5650, 0x3a3632, 0x8a847a, true);
  const cl = CLANS[clan];
  return paintBanner(cl.cloth, cl.trim, cl.sigil, false);
}
