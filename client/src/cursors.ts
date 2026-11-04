/**
 * Pixel-art mouse cursors: a golden arrow everywhere, a small sword over an enemy.
 * Drawn once from tiny pixel grids (dark outline + flat colour ramps), scaled up with hard edges,
 * and turned into PNG data URLs for CSS `cursor`.
 */

const SCALE = 2;

const PAL: Record<string, string> = {
  O: "#1a1108", // outline
  D: "#6e4a14", // gold, shadow
  M: "#b8862a", // gold, mid
  L: "#e8b94a", // gold, light
  H: "#fff0b0", // gold, highlight
  W: "#eef3f6", // steel, edge highlight
  S: "#a7b2bb", // steel, mid
  G: "#5a6670", // steel, shadow
  B: "#5a3418", // leather grip
  b: "#7e4c26", // leather grip, light
  R: "#a3202a", // pommel gem
};

// Golden arrow, tip at (0, 0).
const ARROW = [
  "O...............",
  "OO..............",
  "OHO.............",
  "OHLO............",
  "OHLLO...........",
  "OHLLMO..........",
  "OHLLMMO.........",
  "OHLLMMDO........",
  "OHLLMMDDO.......",
  "OHLMMMDDDO......",
  "OHLMMDOOOOO.....",
  "OHMDOMDO........",
  "OMDO.OMDO.......",
  "ODO...OMDO......",
  "OO....OMDO......",
  ".......OO.......",
];

/** Small sword pointing up-left (tip at the top-left corner): steel blade, gold guard, leather grip, gold pommel. */
function swordGrid(): string[] {
  const n = 16;
  const g: string[][] = Array.from({ length: n }, () => Array(n).fill("."));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const s = x + y, d = x - y, ad = Math.abs(d);
    let c = "";
    if (s <= 17 && ad <= 1 && !(s < 2 && ad > 0)) c = d === 0 ? "W" : d < 0 ? "S" : "G";
    else if (s >= 18 && s <= 19 && ad <= 5) c = s === 18 ? (ad >= 4 ? "M" : "L") : (ad >= 4 ? "D" : "M");
    else if (s >= 20 && s <= 23 && ad <= 1) c = (s + (d < 0 ? 1 : 0)) % 2 ? "b" : "B";
    else if (s >= 24 && s <= 26 && ad <= 2) c = s === 24 && ad === 0 ? "R" : s === 24 ? "L" : "M";
    if (c) g[y][x] = c;
  }
  // Dark outline around every filled pixel.
  const out = g.map(r => r.slice());
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (g[y][x] !== ".") continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const v = g[y + dy]?.[x + dx];
      if (v && v !== ".") out[y][x] = "O";
    }
  }
  return out.map(r => r.join(""));
}

function toUrl(grid: string[]): string {
  const h = grid.length, w = grid[0].length;
  const cv = document.createElement("canvas");
  cv.width = w * SCALE; cv.height = h * SCALE;
  const ctx = cv.getContext("2d")!;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const col = PAL[grid[y][x]];
    if (!col) continue;
    ctx.fillStyle = col;
    ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
  }
  return cv.toDataURL("image/png");
}

let arrowCss = "default", swordCss = "crosshair";

/** Builds the cursors and makes the golden arrow the cursor for the whole page (text fields keep the text caret). */
export function installCursors() {
  try {
    arrowCss = `url(${toUrl(ARROW)}) 0 0, default`;
    swordCss = `url(${toUrl(swordGrid())}) 1 1, crosshair`;
  } catch { return; }
  const st = document.createElement("style");
  st.id = "pixel-cursors";
  st.textContent = `*, *::before, *::after { cursor: ${arrowCss} !important; }
input[type=text], input[type=password], input:not([type]), textarea { cursor: text !important; }`;
  document.head.appendChild(st);
}

/** Cursor over the game world: the sword over an enemy, else the golden arrow. */
export function setWorldCursor(el: HTMLElement, enemy: boolean) {
  if (enemy) el.style.setProperty("cursor", swordCss, "important");
  else el.style.removeProperty("cursor");
}
