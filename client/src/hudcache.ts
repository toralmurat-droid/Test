import { onWorldScale } from "./worldscale";

/**
 * Cached HUD measurements. Reading offsetWidth / getBoundingClientRect forces a layout, which the HUD did several
 * times per frame. The values only change on a resize, a Screen size change or when the skill bar is rebuilt, so they
 * are read again then (and at most once a second as a safety net).
 */
let dirty = true, at = 0;
let barW = 0;
let canvasRect: DOMRect | undefined, hudRect: DOMRect | undefined, hudW = 0;

/** Call when something that moves or resizes the HUD happened. */
export function invalidateHud() { dirty = true; }
addEventListener("resize", invalidateHud);
onWorldScale(invalidateHud);

function refresh(canvas?: HTMLCanvasElement) {
  const now = performance.now();
  if (!dirty && now - at < 1000) return;
  dirty = false; at = now;
  const bar = document.getElementById("hudbar") ?? document.getElementById("hotbar");
  barW = bar ? bar.offsetWidth : 0;
  const hud = document.getElementById("hud");
  hudRect = hud?.getBoundingClientRect(); hudW = hud?.offsetWidth ?? 0;
  canvasRect = canvas?.getBoundingClientRect();
}

/** Width of the skill bar (CSS px, before the HUD zoom). */
export function hotbarWidth(): number { refresh(); return barW; }

/** Canvas and HUD boxes on the screen, and the HUD's own width. */
export function hudRects(canvas: HTMLCanvasElement) {
  refresh(canvas);
  if (!canvasRect) canvasRect = canvas.getBoundingClientRect();
  if (!hudRect) hudRect = document.getElementById("hud")!.getBoundingClientRect();
  return { cr: canvasRect, hr: hudRect, hudW };
}
