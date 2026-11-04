// Keeps players in the game when the server restarts (every deploy restarts it).
// When the connection drops, a notice appears, we wait until the new server answers /health,
// then reload the page and log the player straight back in with the same hero.
// An update (the server said "upgrading", closed with code 4000, or came back as a new build) gets a cheerful
// gilded "New lands are being forged!" notice; anything else gets a plain "Connection lost" one.

const KEY = "rejoin";

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

const base = import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2567` : "";
/** The build that served this page (server header X-Build), so a restart into a new build reads as an update. */
let myBuild: string | null = null;
async function health(): Promise<string | null | false> {
  const r = await fetch(`${base}/health`, { cache: "no-store" });
  return r.ok ? r.headers.get("X-Build") : false;
}
/** Called once in the game: remember which build we joined. */
export function noteBuild() {
  if (myBuild === null) health().then((b) => { if (b) myBuild = b; }).catch(() => { /* ignore */ });
}

let upgradeSaid = false;
/** The server announced it is restarting for an update (sent just before it closes). */
export function upgradeAnnounced() { upgradeSaid = true; box && show(true); }

const LINES = [
  "The smiths are hammering in something new...",
  "Fresh adventures are being carted to Oakvale...",
  "The bards are tuning up new tales...",
  "Stoking the bonfire for your return...",
];

let box: HTMLDivElement | null = null;
let shownUpgrade = false;
function show(upgrade: boolean) {
  if (!box) {
    box = document.createElement("div");
    box.id = "reconnectnote";
    document.body.appendChild(box);
  }
  if (box.childElementCount && shownUpgrade === upgrade) return;
  shownUpgrade = upgrade;
  box.className = upgrade ? "upgrade" : "lost";
  box.replaceChildren();
  const card = document.createElement("div");
  card.className = "card";
  // Same clean gold heading as the Esc menu (the outlined pixelText title was too heavy to read at this size)
  const title = document.createElement("h2");
  title.textContent = upgrade ? "New lands are being forged!" : "Connection lost";
  card.append(title);
  const sub = document.createElement("p");
  sub.textContent = upgrade ? "An update is on its way. Your hero is saved and will be back in a moment!" : "Reconnecting... your hero is saved.";
  card.append(sub);
  if (upgrade) {
    const flav = document.createElement("small");
    let i = Math.floor(Math.random() * LINES.length);
    flav.textContent = LINES[i];
    const t = window.setInterval(() => { if (!box?.contains(flav)) { clearInterval(t); return; } i = (i + 1) % LINES.length; flav.textContent = LINES[i]; }, 3500);
    card.append(flav);
  }
  box.append(card);
}

let started = false;
/**
 * Show a notice and come back as soon as the server answers again. `upgrading` = the server closed the
 * connection on purpose (a deploy shuts it down gracefully, close code 4000); otherwise the connection was lost.
 */
export function reconnectSoon(login: Rejoin, upgrading = false) {
  if (started) return;
  started = true;
  show(upgrading || upgradeSaid);
  const tryAgain = async () => {
    try {
      const b = await health();
      if (b !== false) {
        const fresh = b !== null && myBuild !== null && b !== myBuild;
        try { sessionStorage.setItem(KEY, JSON.stringify({ ...login, at: Date.now() })); } catch { /* ignore */ }
        if (fresh && !shownUpgrade) { show(true); setTimeout(() => location.reload(), 1800); return; } // let them see it
        location.reload();
        return;
      }
    } catch { /* server still restarting */ }
    setTimeout(tryAgain, 2000);
  };
  // Give the old server a moment to hand over to the new one
  setTimeout(tryAgain, upgrading || upgradeSaid ? 1500 : 500);
}

const BACK_KEY = "backtostart";

/** "Save and return to start screen": stops the auto-reconnect, remembers the login, reloads to the fireside. */
export function returnToStart(login: { name: string; password: string }) {
  started = true; // the room closing now is on purpose: no "Connection lost" notice
  try { sessionStorage.setItem(BACK_KEY, JSON.stringify({ ...login, at: Date.now() })); } catch { /* ignore */ }
  location.reload();
}

/** Login left by returnToStart (read once): the start screen logs in and shows Resume / New game. */
export function takeBackToStart(): { name: string; password: string } | null {
  try {
    const raw = sessionStorage.getItem(BACK_KEY);
    sessionStorage.removeItem(BACK_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw);
    return Date.now() - (r.at ?? 0) < 60_000 ? r : null;
  } catch { return null; }
}

/** True once the game is leaving on purpose or reconnecting (later drops are ignored). */
export function leaving() { return started; }
