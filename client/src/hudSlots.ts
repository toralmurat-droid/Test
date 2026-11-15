import { onWorldScale, uiScale } from "./worldscale";

/**
 * HUD places (PR B of the HUD rework): every HUD element has its own spot, so nothing overlaps.
 * - `#topright`: a flex column (online pill, minimap + dial, location, quest tracker, feed).
 * - `#topleft`: a flex column (war plaque, war news notice, party frame).
 * - `#midstack`: bottom centre above the bar: `#promptstack` (interact prompt, level-up note).
 * - `#statusrow`: one row of 48 px chips at the left end of the plate above the XP bar: mode chip, lockout clock, buffs.
 * - The bottom bar (orbs, skill bar, XP bar) is never drawn below 100%: `--barzoom` (see `barScale`).
 */

export type HudSlotName = "topright" | "topleft" | "promptstack" | "statusrow";

/** The container a HUD widget mounts in (static in index.html; made on the spot if a page lacks it). */
export function hudSlot(name: HudSlotName): HTMLElement {
  let el = document.getElementById(name);
  if (!el) { el = document.createElement("div"); el.id = name; (document.getElementById("hud") ?? document.body).appendChild(el); }
  return el;
}

/** Art pixels (2 CSS px) land on whole device pixels at this size. */
const crisp = (k: number, dpr: number) => { const d = 2 * k * dpr; return Math.abs(d - Math.round(d)) < 0.02; };

/**
 * Size the bottom bar is drawn at, as a share of the window (k = the screen-size setting, uiScale()).
 * At k >= 1 the bar follows k; below 1 it would shrink (slots under 40 px, key labels under 12 px), so it is drawn at
 * the smallest crisp size in [1, 1.25] for this pixel ratio, or 100% when none is crisp.
 */
export function barScale(k: number, dpr: number): number {
  if (k >= 1) return k;
  for (let c = 100; c <= 125; c++) if (crisp(c / 100, dpr)) return c / 100;
  return 1;
}

/** Sets `--barzoom` (the extra CSS zoom of the bottom bar on top of the HUD zoom). Runs on size and window changes. */
export function applyBarScale() {
  const k = uiScale(), z = barScale(k, window.devicePixelRatio || 1) / k;
  const v = String(Math.round(z * 1000) / 1000);
  if (document.documentElement.style.getPropertyValue("--barzoom") !== v) document.documentElement.style.setProperty("--barzoom", v);
}
if (typeof document !== "undefined") { // (the pure helpers below are also imported by tests, in Node)
  applyBarScale();
  onWorldScale(applyBarScale);
  addEventListener("resize", () => { applyBarScale(); refreshHudRects(); });
  // a move to a screen with another pixel ratio can keep the same Screen size: the crisp bar size still changes
  const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener("change", () => { applyBarScale(); watchDpr(); }, { once: true });
  watchDpr();
}

export interface Box { left: number; top: number; right: number; bottom: number }

/** Is the screen point inside any of the boxes? (edges count; `pad` grows the boxes) */
export function boxesHit(boxes: readonly Box[], x: number, y: number, pad = 0): boolean {
  for (const b of boxes) if (x >= b.left - pad && x <= b.right + pad && y >= b.top - pad && y <= b.bottom + pad) return true;
  return false;
}

// The HUD parts world labels hide under: measured on resize and every 250 ms, not once per label
const OCCLUDERS = ["topright", "topleft"];
let boxes: Box[] = [];
let measuredAt = -1e9;
/** Measure the boxes now (screen px). */
export function refreshHudRects() {
  boxes = [];
  measuredAt = performance.now();
  if (document.getElementById("hud")?.hidden !== false) return;
  for (const id of OCCLUDERS) {
    const r = document.getElementById(id)?.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) boxes.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }
  // where the top-left column ends, in HUD px, for the Heat gauge below it (hudSlots.css #overload)
  const hud = document.getElementById("hud")!, tl = document.getElementById("topleft");
  const k = hud.getBoundingClientRect().width / (hud.offsetWidth || 1) || 1, hr = hud.getBoundingClientRect();
  const tb = tl && tl.getBoundingClientRect().height > 0 ? `${Math.round((tl.getBoundingClientRect().bottom - hr.top) / k)}px` : "0px";
  if (document.documentElement.style.getPropertyValue("--topleft-bottom") !== tb) document.documentElement.style.setProperty("--topleft-bottom", tb);
}

/** Is a world label at this screen point (CSS px of the window) under the top-right or top-left column? */
export function hudOccludes(sx: number, sy: number): boolean {
  if (performance.now() - measuredAt > 250) refreshHudRects();
  return boxesHit(boxes, sx, sy);
}
