// Full screen mode (Esc menu entry or Alt+Enter): the browser Fullscreen API on the whole page.
// The screen size (worldscale.ts) follows on its own: it re-lays out on window resize.

type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void>; webkitFullscreenEnabled?: boolean };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
const doc = document as FsDoc;

export const fullscreenSupported = () => !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
export const isFullscreen = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);

export function toggleFullscreen() {
  try {
    if (isFullscreen()) void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())?.catch(() => {});
    else {
      const el = document.documentElement as FsEl;
      void (el.requestFullscreen?.({ navigationUI: "hide" }) ?? el.webkitRequestFullscreen?.())?.catch(() => {});
    }
  } catch { /* refused by the browser */ }
}

export function onFullscreen(cb: () => void) {
  document.addEventListener("fullscreenchange", cb);
  document.addEventListener("webkitfullscreenchange", cb);
}

// Alt+Enter toggles anywhere (also while typing in chat)
window.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && ev.altKey && !ev.repeat) { ev.preventDefault(); ev.stopPropagation(); toggleFullscreen(); }
}, true);
