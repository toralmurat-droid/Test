/** Isometric view, on by default. `?iso=0` switches to the old top-down view, `?iso=1` back; remembered in localStorage (see iso.ts). */
export const ISO = (() => {
  const q = new URLSearchParams(location.search).get("iso");
  if (q !== null) {
    try { localStorage.setItem("iso", q === "0" ? "0" : "1"); } catch { /* private mode */ }
    return q !== "0";
  }
  try { return localStorage.getItem("iso") !== "0"; } catch { return true; }
})();

/**
 * Smooth (non-pixel) graphics, on by default with the iso view: painted ground, filtered textures.
 * `?pixel=1` brings back the pixel-art look, `?pixel=0` the smooth one; remembered in localStorage.
 */
export const SMOOTH = ISO && (() => {
  const q = new URLSearchParams(location.search).get("pixel");
  if (q !== null) {
    try { localStorage.setItem("pixel", q === "1" ? "1" : "0"); } catch { /* private mode */ }
    return q !== "1";
  }
  try { return localStorage.getItem("pixel") !== "1"; } catch { return true; }
})();

/** Iso characters (assets/hd, WebP) unless `?pixel=1`. Here, not in artAssets.ts, so the start screen can read them without Phaser. */
export const HD_CHARS = SMOOTH;
export const CHAR_BASE = HD_CHARS ? "assets/hd/characters" : "assets/characters";
export const CHAR_EXT = HD_CHARS ? "webp" : "png";
