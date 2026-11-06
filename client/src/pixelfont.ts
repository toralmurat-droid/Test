/**
 * The game's bitmap pixel fonts (client/public/fonts, built by tools/font/build-fonts.py, styles in pixelfont.css).
 * Every font pixel is shown as exactly 2x2 screen pixels, the same grid as the world art (pixelgrid.ts).
 */
export const TEXT_FONT = "'Oakvale Text', 'Pixelify Sans', monospace";
export const TITLE_FONT = "'Oakvale Title', 'Oakvale Text', 'Pixelify Sans', monospace";
export const TINY_FONT = "'Oakvale Tiny', 'Oakvale Text', 'Pixelify Sans', monospace";
/** Design em of each font in font pixels: draw canvas/Phaser text at these sizes (or whole multiples). */
export const TEXT_PX = 9, TITLE_PX = 11, TINY_PX = 6;
/** Scale for world text drawn at TEXT_PX/TITLE_PX (resolution 1): one font pixel = 2 screen pixels at the default zoom 3. */
export const WT = 2 / 3;

/** Resolves once the three fonts are ready, so canvas and Phaser text never bake in a fallback font. */
export const fontsReady: Promise<unknown> = typeof document === "undefined" ? Promise.resolve() : Promise.all(
  [`18px 'Oakvale Text'`, `22px 'Oakvale Title'`, `12px 'Oakvale Tiny'`].map((f) => document.fonts.load(f).catch(() => undefined)),
).then(() => undefined);
