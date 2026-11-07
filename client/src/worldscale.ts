/**
 * World size on screen (Murat 2026-11-07: "make the game resolution adapt to screen, or a menu option").
 *
 * The game draws its world into a canvas `1/k` the size of the window and the browser blows it up by `k` with
 * nearest-neighbour scaling, so everything in the world (camera zoom 3, pixel grid, world text) stays exactly as it
 * is, just bigger or smaller on screen. The HUD is HTML and is not scaled.
 *
 * Only sizes where one art pixel (2 canvas px) lands on a whole number of the screen's real pixels are offered,
 * so the pixel art stays crisp. Bigger sizes also draw fewer pixels per frame (faster), smaller ones more.
 *
 * Auto (default): 100% up to ~1000 px tall windows, then grows with the window (1440p ≈ 150%, 4K ≈ 200%).
 * Picked in the game menu (Esc), remembered in the browser.
 */

const STORE = "worldscale";
const ALL = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
/** Window height (CSS px) the game was designed around: at this height Auto is 100%. */
const DESIGN_H = 1000;

type Setting = "auto" | number;

let setting: Setting = (() => {
  try {
    const v = localStorage.getItem(STORE);
    const n = Number(v);
    return v && v !== "auto" && ALL.includes(n) ? n : "auto";
  } catch { return "auto"; }
})();
const listeners: (() => void)[] = [];
let game: { scale: { getParentBounds(): boolean; refresh(): unknown } } | undefined;

const dpr = () => window.devicePixelRatio || 1;

/** Sizes that keep the pixels even on this screen (an art pixel = a whole number of device pixels). */
export function worldScales(): number[] {
  const crisp = ALL.filter((k) => { const d = 2 * k * dpr(); return Math.abs(d - Math.round(d)) < 0.02; });
  return crisp.length >= 3 ? crisp : ALL;
}

function autoScale(): number {
  const want = window.innerHeight / DESIGN_H;
  let best = 1;
  for (const k of worldScales()) if (k >= 1 && Math.abs(k - want) < Math.abs(best - want)) best = k;
  return best;
}

/** The size in use now. */
export const worldScale = () => (setting === "auto" ? autoScale() : setting);
export const worldScaleSetting = () => setting;
export const worldScaleName = () =>
  setting === "auto" ? `Auto (${Math.round(autoScale() * 100)}%)` : `${Math.round(setting * 100)}%`;

/** The world canvas size (CSS px) for the current window. */
export function worldCanvasSize() {
  const k = worldScale();
  return { width: Math.ceil(window.innerWidth / k), height: Math.ceil(window.innerHeight / k) };
}

/** Sizes the game box so Phaser makes a canvas 1/k of the window, which CSS then scales up by k. */
function layout() {
  const box = document.getElementById("game");
  if (!box) return;
  const k = worldScale(), { width, height } = worldCanvasSize();
  box.style.right = box.style.bottom = "auto";
  box.style.width = `${width}px`;
  box.style.height = `${height}px`;
  box.style.setProperty("--worldscale", String(k));
  if (game) { game.scale.getParentBounds(); game.scale.refresh(); }
  for (const f of listeners) f();
}

/** Call once before the Phaser game is made; `attach` it when it exists so size changes reach it. */
let started = false;
export function initWorldScale() {
  layout();
  if (started) return;
  started = true;
  addEventListener("resize", layout);
  // moving the window to another screen changes the pixel ratio (and which sizes stay crisp)
  const watchDpr = () => matchMedia(`(resolution: ${dpr()}dppx)`).addEventListener("change", () => {
    if (setting !== "auto" && !worldScales().includes(setting)) setting = "auto";
    layout(); watchDpr();
  }, { once: true });
  watchDpr();
}

export function attachWorldScale(g: typeof game) { game = g; layout(); }

/** Next size in the menu cycle: Auto, then each crisp size from small to big. */
export function cycleWorldScale() {
  const list = worldScales();
  const i = setting === "auto" ? -1 : list.indexOf(setting);
  setting = i + 1 >= list.length ? "auto" : list[i + 1];
  try { localStorage.setItem(STORE, String(setting)); } catch { /* storage off */ }
  layout();
}

export function onWorldScale(f: () => void) { listeners.push(f); }
