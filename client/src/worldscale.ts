/**
 * Screen size (Murat 2026-11-07): the whole game screen (world, menus, bars) fits the window, bigger or smaller.
 *
 * World: the game draws into a canvas `1/k` the size of the window and the browser scales it by `k` with
 * nearest-neighbour, so the world itself (camera zoom 3, pixel grid, world text) is untouched.
 * HUD and overlays: CSS `zoom: k` (see style.css, `--uiscale`). Code that turns on-screen positions
 * (getBoundingClientRect, clientX, innerWidth) into CSS lengths inside them divides by `uiScale()`.
 *
 * "Sharp" sizes put one art pixel (2 CSS px) on a whole number of the screen's real pixels. Auto picks the sharp
 * size closest to window height / 1000 px, so small or high-DPI-scaled screens zoom out and big ones zoom in.
 * Bigger sizes draw fewer pixels per frame (faster), smaller ones more.
 * Picked from the dropdown in the game menu (Esc), remembered in the browser.
 */

const STORE = "worldscale";
export const SCREEN_SIZES = [0.5, 2 / 3, 0.75, 0.8, 0.9, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
/** Window height (CSS px) the game was designed around: at this height Auto is 100%. */
const DESIGN_H = 1000;

type Setting = "auto" | number;

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
const find = (n: number) => SCREEN_SIZES.find((k) => near(k, n));

let setting: Setting = (() => {
  try {
    const v = localStorage.getItem(STORE);
    if (!v || v === "auto") return "auto";
    const n = Number(v);
    return find(n) ?? find(n / 100) ?? "auto"; // stored as a percentage (older builds: a fraction)
  } catch { return "auto"; }
})();
const listeners: (() => void)[] = [];
let game: { scale: { getParentBounds(): boolean; refresh(): unknown } } | undefined;

const dpr = () => window.devicePixelRatio || 1;

/** True when an art pixel lands on a whole number of device pixels at this size. */
export function isSharp(k: number) { const d = 2 * k * dpr(); return Math.abs(d - Math.round(d)) < 0.02; }

function autoScale(): number {
  const want = window.innerHeight / DESIGN_H;
  const sharp = SCREEN_SIZES.filter(isSharp);
  let best = 1;
  for (const k of sharp.length ? sharp : SCREEN_SIZES) if (Math.abs(k - want) < Math.abs(best - want)) best = k;
  return best;
}

export const pct = (k: number) => `${Math.round(k * 100)}%`;
/** The size in use now. */
export const worldScale = () => (setting === "auto" ? autoScale() : setting);
/** Zoom of the HUD and overlays (same as the world). */
export const uiScale = worldScale;
export const worldScaleSetting = () => setting;
export const worldScaleName = () => (setting === "auto" ? `Auto (${pct(autoScale())})` : pct(setting));

/** The world canvas size (CSS px) for the current window. */
export function worldCanvasSize() {
  const k = worldScale();
  return { width: Math.ceil(window.innerWidth / k), height: Math.ceil(window.innerHeight / k) };
}

let last = "";
function layout() {
  const k = worldScale();
  document.documentElement.style.setProperty("--uiscale", String(k));
  const box = document.getElementById("game");
  if (box) {
    const { width, height } = worldCanvasSize();
    box.style.right = box.style.bottom = "auto";
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
    box.style.setProperty("--worldscale", String(k));
  }
  if (game) { game.scale.getParentBounds(); game.scale.refresh(); }
  const now = `${setting}|${k}`;
  if (now !== last) { last = now; for (const f of listeners) f(); }
}

let started = false;
/** Call once before the Phaser game is made; `attach` it when it exists so size changes reach it. */
export function initWorldScale() {
  layout();
  if (started) return;
  started = true;
  addEventListener("resize", layout);
  // moving the window to another screen changes the pixel ratio (and which sizes are sharp)
  const watchDpr = () => matchMedia(`(resolution: ${dpr()}dppx)`).addEventListener("change", () => { layout(); watchDpr(); }, { once: true });
  watchDpr();
}

export function attachWorldScale(g: typeof game) { game = g; layout(); }

export function setWorldScale(s: Setting) {
  setting = s === "auto" ? "auto" : find(s) ?? "auto";
  try { localStorage.setItem(STORE, setting === "auto" ? "auto" : String(Math.round(setting * 100))); } catch { /* storage off */ }
  layout();
}

export function onWorldScale(f: () => void) { listeners.push(f); }
