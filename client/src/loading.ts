// Loading screen: a pixel bonfire on a dark field that covers the game from the moment the player presses Play
// (or comes back after a server update) until the art is loaded, the hero has joined, the camera has settled
// and the painted ground around it is done, then it fades out. The "Game is upgrading!" notice
// (reconnect.ts) sits above it, and the first quest banner waits for it to be gone (afterLoading).
import { paintBonfire } from "./bonfireArt";

export const FRAMES = 8, FW = 96, FH = 112; // bonfire art is 48x56 design units, drawn at 2 cells per unit
const FADE_MS = 450;

let box: HTMLDivElement | null = null;
let fill: HTMLDivElement | null = null;
let label: HTMLDivElement | null = null;
let timer = 0;
let shown = 0;
let waiting: (() => void)[] = [];

const TIPS = [
  "Watch the wind-up of big enemies and roll away with F.",
  "Hold Shift and left-click to attack where you stand, toward the mouse.",
  "Left-click the ground to walk there. Hold the button to keep walking.",
  "Left-click a monster to attack it. Hold the button to keep hitting for a 3-hit combo.",
  "Press 1 to 0 to pick your active skill, then right-click to cast it.",
  "Buffs and war cries go off on you; blasts, traps and leaps land where you right-click; shots fly toward it.",
  "Click villagers, chests, shrines and portal stones to use them.",
  "Loot chests fill up again after a while. Click one to open it.",
  "The forest shrine grants a random boon to whoever prays first.",
  "Quest givers have a mark over their heads. Press J for your quest log.",
  "Zones get harder the further you go from Oakvale.",
];

/** All bonfire frames side by side, FW x FH each (also used by the fireside start screen). */
export function bonfireStrip(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = FW * FRAMES; c.height = FH;
  const g = c.getContext("2d")!;
  for (let f = 0; f < FRAMES; f++) {
    g.save();
    g.setTransform(2, 0, 0, 2, f * FW, 0); // paintBonfire works in design units and halves them itself
    g.beginPath(); g.rect(0, 0, FW / 2, FH / 2); g.clip();
    paintBonfire(g, f, FRAMES);
    g.restore();
  }
  return c;
}

/** Cover the screen. Safe to call more than once. */
export function showLoading(title = "Lighting the fires…") {
  if (box) return;
  shown = performance.now();
  box = document.createElement("div");
  box.id = "loading";
  box.innerHTML =
    `<canvas width="${FW}" height="${FH}"></canvas>` +
    `<div class="ld-title">${title}</div>` +
    `<div class="ld-bar"><div></div></div>` +
    `<div class="ld-step">Loading the art</div>` +
    `<div class="ld-tip">${TIPS[Math.floor(Math.random() * TIPS.length)]}</div>`;
  document.body.appendChild(box);
  fill = box.querySelector(".ld-bar > div");
  label = box.querySelector(".ld-step");
  const view = box.querySelector("canvas")!.getContext("2d")!;
  let strip: HTMLCanvasElement | null = null;
  let f = 0;
  const tick = () => {
    strip ??= bonfireStrip();
    view.clearRect(0, 0, FW, FH);
    view.drawImage(strip, f * FW, 0, FW, FH, 0, 0, FW, FH);
    f = (f + 1) % FRAMES;
  };
  tick();
  timer = window.setInterval(tick, 110);
}

/** Show what is happening and how far along (0..1). The bar never goes backwards. */
export function setLoading(step: string, done: number) {
  if (!box) return;
  if (label && label.textContent !== step) label.textContent = step;
  if (fill) {
    const cur = parseFloat(fill.style.width) || 0;
    const pct = Math.max(cur, Math.min(100, Math.round(done * 100)));
    fill.style.width = `${pct}%`;
  }
}

export function loadingActive() { return !!box; }

/** Fade the screen out (instant = just remove it, e.g. when the login failed and the form must come back). */
export function hideLoading(instant = false) {
  if (!box) return;
  const el = box;
  box = fill = label = null;
  const done = () => { clearInterval(timer); el.remove(); const w = waiting; waiting = []; w.forEach((cb) => cb()); };
  if (instant) { done(); return; }
  setLoading("Ready", 1);
  el.querySelector<HTMLDivElement>(".ld-bar > div")!.style.width = "100%";
  el.classList.add("out");
  setTimeout(done, FADE_MS);
}

/** Run now, or once the loading screen is gone (used by the first quest banner). */
export function afterLoading(cb: () => void) {
  if (box) waiting.push(cb); else cb();
}

/** How long the screen has been up, in ms. */
export function loadingFor() { return box ? performance.now() - shown : 0; }
