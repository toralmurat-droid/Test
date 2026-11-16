import Phaser from "phaser";
import type { ClanKey } from "../../shared/war/clans";
import { paintBanner } from "./townBanners";

/**
 * Art of the clans' capital cities (W7, shared/capitals.ts), drawn in code from existing building blocks until the art
 * branch's own props land: the city banners (the town banner's cloth in the city's heraldry), the war table and the oath
 * altar. Painted at 2 texels per world px like the other code-made props. Cosmetic only.
 */

/** A city's heraldry (cloth, trim, sigil) and the tint its stone takes. The Wardens' Hearthhold flies blue and gold over warm stone. */
export const CITY_LOOK: Record<ClanKey, { cloth: number; trim: number; sigil: number; stone: number }> = {
  wardens: { cloth: 0x2a4a8a, trim: 0xe0b040, sigil: 0xf6dc78, stone: 0xffe2b8 },
  veiled: { cloth: 0x4a3a8a, trim: 0xc8c0f0, sigil: 0xe8e0ff, stone: 0xe0dcff },
  host: { cloth: 0x2a6a60, trim: 0xd8d0b0, sigil: 0xf0ecd0, stone: 0xd8ece4 },
  redfang: { cloth: 0x8a2a20, trim: 0xe8a050, sigil: 0xffd080, stone: 0xffd0c0 },
  hidekin: { cloth: 0x7a5426, trim: 0x4a1814, sigil: 0xe2c79a, stone: 0xf0dcc0 },
};

/** Texture key of a city's banner. */
export const cityBannerKey = (clan: ClanKey) => `citybanner_${clan}`;
export const WARTABLE_KEY = "city_wartable", ALTAR_KEY = "city_altar";
/** Banner texels per world px (the banner is drawn 2x). */
export const CITY_ART_K = 2;

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
const mk = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d")!; g.imageSmoothingEnabled = false; return { c, g, px: (x: number, y: number, ww: number, hh: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); } }; };

/** The war table: a trestle table under a parchment map of the Marches, with clan markers and a few figurines (72x44 art px, feet at the bottom middle). */
function paintWarTable(clan: ClanKey) {
  const { c, g, px } = mk(72, 44), L = CITY_LOOK[clan];
  px(6, 34, 5, 9, "#2a1a0e"); px(61, 34, 5, 9, "#2a1a0e"); px(7, 34, 1, 8, "#6a4a2a"); px(62, 34, 1, 8, "#6a4a2a"); // legs
  px(30, 36, 12, 2, "#2a1a0e"); // the stretcher
  px(3, 26, 66, 9, "#3a2616"); px(3, 26, 66, 1, "#8a6a40"); px(4, 27, 64, 1, "#6a4a2a"); px(3, 34, 66, 1, "#1a0e06"); // the front apron of the slab
  px(2, 12, 68, 15, "#4a3220"); px(3, 13, 66, 13, "#d8c89a"); // the slab and the parchment
  px(3, 13, 66, 1, "#efe2b4"); px(3, 25, 66, 1, "#b8a876");
  g.fillStyle = "#a89868"; // the coast: a ragged outline
  for (let x = 6; x < 66; x += 2) { const y = 17 + Math.round(Math.sin(x * 0.45) * 2 + Math.sin(x * 0.17) * 3); g.fillRect(x, y, 2, 1); }
  for (let x = 12; x < 60; x += 3) g.fillRect(x, 21 + ((x * 7) % 3), 1, 1);
  const pins: [number, number, string][] = [[14, 17, "#e08a2a"], [26, 20, "#d03a2a"], [38, 16, "#5fb0a0"], [50, 21, "#a0703a"], [58, 17, "#7a7aff"], [34, 22, hex(L.trim)]];
  for (const [x, y, col] of pins) { px(x, y - 3, 1, 3, "#1a1008"); px(x - 1, y - 4, 3, 2, col); }
  px(32, 18, 5, 1, hex(L.cloth)); px(33, 17, 3, 1, hex(L.trim)); // the city's own flag
  px(2, 12, 68, 1, "#8a6a40"); px(2, 12, 1, 15, "#2a1a0e"); px(69, 12, 1, 15, "#2a1a0e");
  px(8, 8, 2, 4, "#d9c9a0"); px(8, 6, 2, 2, "#f0e0b0"); px(60, 8, 2, 4, hex(L.cloth)); px(60, 6, 2, 2, hex(L.trim)); // a candle and a blue figurine
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(3, 42, 66, 2);
  return c;
}

/** The oath altar: a stepped stone block with a gilt-edged cloth, a chalice and two candles (40x48 art px). */
function paintAltar(clan: ClanKey) {
  const { c, g, px } = mk(40, 48), L = CITY_LOOK[clan];
  px(2, 40, 36, 7, "#6a6254"); px(2, 40, 36, 1, "#9a9080"); px(3, 41, 34, 1, "#847a6a"); px(2, 46, 36, 1, "#2a261e"); // the lower step
  px(6, 32, 28, 9, "#847a6a"); px(6, 32, 28, 1, "#b0a690"); px(6, 40, 28, 1, "#3a342a"); // the block
  for (const x of [10, 17, 24, 31]) px(x, 33, 1, 7, "#6a6254");
  px(4, 28, 32, 5, hex(L.cloth)); px(4, 28, 32, 1, hex(L.trim)); px(4, 32, 32, 1, hex(L.trim)); // the altar cloth with its gold hem
  px(18, 29, 4, 3, hex(L.sigil)); px(19, 28, 2, 5, hex(L.sigil)); // the sigil
  px(18, 20, 4, 1, "#e8c050"); px(19, 21, 2, 4, "#c8a030"); px(17, 25, 6, 3, "#e8c050"); px(18, 25, 4, 1, "#fff0a0"); // a chalice
  for (const x of [8, 31]) { px(x, 21, 2, 7, "#e8dcc0"); px(x, 21, 1, 7, "#fff6e0"); px(x, 18, 2, 3, "#ffb030"); px(x, 16, 2, 2, "#fff0a0"); } // candles with flames
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(2, 46, 36, 2);
  return c;
}

/** Registers the banner, war table and altar textures of a city (safe to call again). */
export function cityTextures(scene: Phaser.Scene, clan: ClanKey) {
  const reg = (key: string, make: () => HTMLCanvasElement) => { if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make())?.setFilter(Phaser.Textures.FilterMode.NEAREST); };
  const L = CITY_LOOK[clan];
  reg(cityBannerKey(clan), () => paintBanner(L.cloth, L.trim, L.sigil, false));
  reg(`${WARTABLE_KEY}_${clan}`, () => paintWarTable(clan));
  reg(`${ALTAR_KEY}_${clan}`, () => paintAltar(clan));
}
