// Keeps players in the game when the server restarts (every deploy restarts it).
// When the connection drops, a notice appears, we wait until the new server answers /health,
// then reload the page and log the player straight back in with the same hero.
const KEY = "rejoin";
const PIXEL_FONT = "'Pixelify Sans', monospace";

export interface Rejoin { name: string; password: string; cls: string; color: number }

/** Login saved by a previous reconnect (read once, then forgotten). */
export function takeRejoin(): Rejoin | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw);
    // Only use it if it is fresh: a manual reload later shows the normal login screen
    return Date.now() - (r.at ?? 0) < 5 * 60_000 ? r : null;
  } catch { return null; }
}

let started = false;
/**
 * Show a notice and come back as soon as the server answers again. `upgrading` = the server closed the
 * connection on purpose (a deploy shuts it down gracefully, close code 4000); otherwise the connection was lost.
 */
export function reconnectSoon(login: Rejoin, upgrading = false) {
  if (started) return;
  started = true;
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;" +
    "background:rgba(10,10,16,.72);color:#f4e9d0;text-align:center;font:20px " + PIXEL_FONT + ";";
  box.innerHTML = upgrading
    ? "<div>Game is upgrading!<br><small style='font-size:14px;opacity:.8'>Back in a moment, your hero is saved.</small></div>"
    : "<div>Connection lost<br><small style='font-size:14px;opacity:.8'>Reconnecting... your hero is saved.</small></div>";
  document.body.appendChild(box);
  const base = import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2567` : "";
  const tryAgain = async () => {
    try {
      const r = await fetch(`${base}/health`, { cache: "no-store" });
      if (r.ok) {
        try { sessionStorage.setItem(KEY, JSON.stringify({ ...login, at: Date.now() })); } catch { /* ignore */ }
        location.reload();
        return;
      }
    } catch { /* server still restarting */ }
    setTimeout(tryAgain, 2000);
  };
  // Give the old server a moment to hand over to the new one
  setTimeout(tryAgain, upgrading ? 1500 : 500);
}
