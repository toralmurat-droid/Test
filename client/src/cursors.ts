/**
 * Pixel-art mouse cursors: an ornate golden arrow everywhere, a small jewelled sword over an enemy.
 * Each is painted pixel by pixel on a 32x32 grid from flat colour ramps (Bayer-dithered blends, bevelled edges lit
 * from the top-left, a dark outline and a soft drop shadow), then turned into PNG data URLs for CSS `cursor`
 * (with a 2x copy so it stays crisp on high-DPI screens).
 */

const N = 32;
type RGBA = [number, number, number, number];
type Grid = (RGBA | null)[][];

const hex = (h: string, a = 255): RGBA => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];
const GOLD = ["#3a2408", "#6e4410", "#9a6418", "#c48a26", "#e2b048", "#f6d77a", "#fff4c8"].map(c => hex(c));
const STEEL = ["#2a3038", "#4a5560", "#6f7c88", "#97a4ae", "#c2ccd3", "#eef4f8"].map(c => hex(c));
const RUBY = ["#3c0610", "#7a1020", "#b8202e", "#e8505a", "#ffc0c0"].map(c => hex(c));
const LEATHER = ["#24140a", "#4a2a14", "#6e4020", "#94602e"].map(c => hex(c));
const OUTLINE = hex("#140c04");
const SHADOW = hex("#000000", 90);

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
/** Pick from a colour ramp at a fractional position, dithering between the two nearest tones. */
function ramp(r: RGBA[], t: number, x: number, y: number): RGBA {
  const v = Math.max(0, Math.min(r.length - 1, t * (r.length - 1)));
  const i = Math.floor(v), f = v - i;
  return f > (BAYER[y & 3][x & 3] + 0.5) / 16 ? r[Math.min(i + 1, r.length - 1)] : r[i];
}

const empty = (): Grid => Array.from({ length: N }, () => Array<RGBA | null>(N).fill(null));

/** Dark outline around the shape, then a 1px down-right drop shadow. */
function finish(g: Grid): Grid {
  const o = g.map(r => r.slice());
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (g[y][x]) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (g[y + dy]?.[x + dx]) { near = true; break; }
    if (near) o[y][x] = OUTLINE;
  }
  const s = o.map(r => r.slice());
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!s[y][x] && o[y - 1]?.[x - 1]) s[y][x] = SHADOW;
    if (!s[y][x] && o[y - 2]?.[x - 1] && o[y - 1]?.[x]) s[y][x] = [0, 0, 0, 45];
  }
  return s;
}

function inPoly(px: number, py: number, pts: number[][]): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Ornate golden arrow: bevelled rim, an engraved inner border, a ruby set in the body and a filigree tail. */
function paintArrow(): Grid {
  const g = empty();
  const body = [[1, 1], [1, 23.5], [6.5, 18.5], [10.5, 27.5], [15, 25.5], [11.2, 17], [18.5, 17], [1, 1]];
  const inside = (x: number, y: number) => inPoly(x + 0.5, y + 0.5, body);
  // Distance (in pixels) from the edge, for the bevel and the engraved line.
  const dist: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!inside(x, y)) continue;
    let d = 1;
    while (d < 6) {
      let edge = false;
      for (let dy = -d; dy <= d && !edge; dy++) for (let dx = -d; dx <= d; dx++)
        if (Math.max(Math.abs(dx), Math.abs(dy)) === d && !inside(x + dx, y + dy)) { edge = true; break; }
      if (edge) break;
      d++;
    }
    dist[y][x] = d;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = dist[y][x];
    if (!d) continue;
    // Which side of the shape this edge faces: lit toward the top-left, shaded toward the bottom-right.
    const lit = (!inside(x - 1, y) ? 1 : 0) + (!inside(x, y - 1) ? 1 : 0) + (!inside(x - 1, y - 1) ? 0.5 : 0)
      - (!inside(x + 1, y) ? 1 : 0) - (!inside(x, y + 1) ? 1 : 0) - (!inside(x + 1, y + 1) ? 0.5 : 0);
    let c: RGBA;
    if (d === 1) c = lit > 0 ? GOLD[6] : lit < 0 ? GOLD[1] : GOLD[3];
    else if (d === 2) c = lit > 0 ? GOLD[5] : ramp(GOLD, 0.5 - y / 70, x, y);
    else if (d === 3) c = lit < 0 ? GOLD[5] : GOLD[1]; // engraved inner border (lit on its far wall)
    else {
      // Brushed gold face: brighter near the tip, darker toward the tail, with a soft diagonal sheen.
      const sheen = Math.exp(-(((x - y * 0.45) - 2) ** 2) / 6) * 0.25;
      c = ramp(GOLD, 0.66 - y / 70 + sheen, x, y);
    }
    g[y][x] = c;
  }
  // Ruby cabochon in the widest part of the body.
  const gx = 5.5, gy = 12;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x + 0.5 - gx, dy = y + 0.5 - gy, r = Math.hypot(dx * 1.05, dy * 0.85);
    if (r < 2.6 && dist[y][x] >= 3) {
      if (r > 1.9) g[y][x] = GOLD[1];
      else g[y][x] = ramp(RUBY, 0.55 - (dx + dy) * 0.18, x, y);
    }
  }
  g[11][5] = RUBY[4];
  // Tiny filigree scroll on the tail.
  for (const [x, y] of [[10, 22], [11, 23], [12, 23], [12, 24]]) if (dist[y]?.[x] >= 2) g[y][x] = GOLD[1];
  return finish(g);
}

/** Small sword pointing up-left: fullered steel blade, curled gold quillons with a ruby, wrapped grip, jewelled pommel. */
function paintSword(): Grid {
  const g = empty();
  const R2 = Math.SQRT2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = x + 0.5, py = y + 0.5;
    const s = (px + py) / R2, d = (px - py) / R2, ad = Math.abs(d);
    let c: RGBA | null = null;
    // Blade: tapers to a point, bright edge on the lit side, dark fuller down the middle.
    const half = s < 5 ? s * 0.42 : 2.1;
    if (s > 0.8 && s < 25 && ad <= half) {
      if (ad < 0.45 && s > 5 && s < 23) c = STEEL[1];                 // fuller
      else if (d < 0) c = ramp(STEEL, 0.95 - ad * 0.12 - s / 90, x, y); // lit edge
      else c = ramp(STEEL, 0.55 - ad * 0.1 - s / 80, x, y);             // shaded edge
      if (ad > half - 0.7) c = d < 0 ? STEEL[5] : STEEL[2];             // honed edge line
    }
    // Ricasso / blade root collar.
    if (s >= 24 && s < 25.6 && ad <= 2.4) c = ramp(GOLD, 0.7 - ad * 0.1, x, y);
    // Crossguard with quillons curling toward the blade.
    const curl = ad > 5 ? (ad - 5) * 0.9 : 0;
    if (s >= 25.6 - curl && s < 27.8 - curl && ad <= 7) {
      const top = s < 26.7 - curl;
      c = top ? (d < 0 ? GOLD[6] : GOLD[4]) : (d < 0 ? GOLD[3] : GOLD[2]);
      if (ad > 6.2) c = GOLD[1];
    }
    // Ruby in the guard's centre.
    if (Math.hypot(s - 26.7, d) < 1.1) c = Math.hypot(s - 26.4, d + 0.35) < 0.5 ? RUBY[4] : RUBY[2];
    // Leather-wrapped grip with diagonal bands.
    if (s >= 27.8 && s < 34.5 && ad <= 1.25) {
      const band = Math.floor(s * 1.2 + d * 0.8) % 2 === 0;
      c = band ? (d < 0 ? LEATHER[3] : LEATHER[2]) : LEATHER[1];
    }
    // Pommel: gold ball with a small ruby.
    const pr = Math.hypot(s - 36.4, d);
    if (pr < 2.4) {
      c = ramp(GOLD, 0.75 - (s - 36.4 + d) * 0.16, x, y);
      if (pr < 0.95) c = RUBY[2];
      if (Math.hypot(s - 36.1, d + 0.3) < 0.45) c = RUBY[4];
    }
    if (c) g[y][x] = c;
  }
  return finish(g);
}

function toUrl(g: Grid, scale: number): string {
  const cv = document.createElement("canvas");
  cv.width = N * scale; cv.height = N * scale;
  const ctx = cv.getContext("2d")!;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const c = g[y][x];
    if (!c) continue;
    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`;
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  return cv.toDataURL("image/png");
}

function cursorCss(g: Grid, hx: number, hy: number, fallback: string): string {
  const one = toUrl(g, 1), two = toUrl(g, 2);
  for (const fn of ["image-set", "-webkit-image-set"]) {
    const v = `${fn}(url(${two}) 2x, url(${one}) 1x) ${hx} ${hy}, ${fallback}`;
    if (CSS.supports?.("cursor", v)) return v;
  }
  return `url(${one}) ${hx} ${hy}, ${fallback}`;
}

let arrowCss = "default", swordCss = "crosshair";

/** Builds the cursors and makes the golden arrow the cursor for the whole page (text fields keep the text caret). */
export function installCursors() {
  try {
    arrowCss = cursorCss(paintArrow(), 1, 1, "default");
    swordCss = cursorCss(paintSword(), 1, 1, "crosshair");
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

/** For preview tools. */
export const __cursorArt = { paintArrow, paintSword, toUrl };
