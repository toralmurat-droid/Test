import "./overloadGauge.css";
import { heatOf, isOverheated, OVERLOAD, ventLeft } from "../../shared/overload";

/**
 * Overload gauge on the left side of the screen (Murat 2026-11-07: "instead of a stamina bar, a stamina overload
 * mechanism ... the bar appears on the left side, when overloaded it cools down for a few seconds").
 *
 * A bronze-framed glass tube of glowing embers, drawn per pixel (1 canvas px per CSS px, like the orbs): it fills with
 * Heat as physical skills and dodge rolls are used and cools by itself. The top quarter of the glass is darker red:
 * the danger band. Past the top the hero overloads: the embers turn white-hot, the rivets glow, a small fire burns on
 * the cap and the tube drains for OVERLOAD.ventMs while those skills are locked. No screen flash, only the gauge glows.
 * Fades in when Heat builds and out a moment after it is gone.
 */

const W = 40, H = 232;
const TX0 = 13, TX1 = 27; // tube inside, x from..to (exclusive)
const TY0 = 32, TY1 = 210; // tube inside, y from..to
const TUBE_H = TY1 - TY0;

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const OUTLINE: RGB = [18, 12, 7];
const BRONZE_D: RGB = [92, 62, 26], BRONZE_L: RGB = [224, 178, 90], RIVET: RGB = [250, 222, 150];
const GLASS: RGB = [14, 9, 8], DANGER: RGB = [46, 10, 10];
// ember ramp from the bottom of the column to its surface
const EMBER: RGB[] = [[72, 10, 6], [150, 30, 10], [214, 82, 18], [246, 150, 40], [255, 214, 120]];
const WHITE_HOT: RGB = [255, 244, 214];

function ramp(t: number): RGB {
  const x = Math.max(0, Math.min(0.999, t)) * (EMBER.length - 1), i = Math.floor(x);
  return mix(EMBER[i], EMBER[i + 1], x - i);
}

/** Stable per-pixel noise (no flicker from Math.random between frames). */
const hash = (x: number, y: number) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };

function draw(img: ImageData, frac: number, hot: boolean, t: number) {
  const d = img.data;
  d.fill(0);
  const put = (x: number, y: number, c: RGB, a = 255) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = a;
  };
  const surface = TY1 - frac * TUBE_H; // y of the ember surface
  const pulse = hot ? 0.5 + 0.5 * Math.sin(t * 9) : 0;

  // ---- frame: two bronze rails, outlined, lit from the top left
  for (let y = TY0 - 4; y < TY1 + 4; y++) {
    for (const [x0, x1] of [[TX0 - 5, TX0 - 1], [TX1 + 1, TX1 + 5]]) {
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1;
        const light = (x1 - x) / (x1 - x0) * 0.6 + 0.4 * (1 - (y - TY0) / TUBE_H);
        let c: RGB = edge ? OUTLINE : mix(BRONZE_D, BRONZE_L, light * (x0 < TX0 ? 1 : 0.55));
        if (!edge && hash(x, y) > 0.86) c = mix(c, OUTLINE, 0.35); // worn metal
        put(x, y, c);
      }
    }
  }
  // glass walls (1 px, dark) between the rails and the tube
  for (let y = TY0 - 1; y <= TY1; y++) { put(TX0 - 1, y, OUTLINE); put(TX1, y, OUTLINE); }

  // ---- tube: dark glass, the top quarter a deeper red (danger), embers from the bottom up to the surface
  for (let y = TY0; y < TY1; y++) for (let x = TX0; x < TX1; x++) {
    const across = (x - TX0 + 0.5) / (TX1 - TX0); // 0..1 left to right
    const round = 1 - Math.abs(across - 0.42) * 1.4; // glass lit a little left of the middle
    let c: RGB;
    if (y + 0.5 >= surface && frac > 0) {
      const up = (TY1 - y) / TUBE_H; // 0 bottom .. 1 top of the tube
      const depth = Math.min(1, (y - surface) / 14); // just under the surface is brightest
      c = ramp(Math.min(1, up * 0.55 + frac * 0.45 + (1 - depth) * 0.25));
      // slowly rising streaks of brighter embers
      const streak = Math.sin(x * 1.7 + (y + t * 22) * 0.45) * Math.sin(x * 0.6 - (y + t * 14) * 0.21);
      if (streak > 0.55) c = mix(c, EMBER[4], 0.35);
      if (streak < -0.7) c = mix(c, EMBER[0], 0.4);
      if (hot) c = mix(c, WHITE_HOT, 0.25 + 0.35 * pulse * (1 - depth));
      c = mix(c, [0, 0, 0], Math.max(0, 0.45 - round * 0.5)); // rounded glass: darker at the sides
      if (y - surface < 1.2) c = mix(c, hot ? WHITE_HOT : EMBER[4], 0.7); // the glowing surface line
    } else {
      c = (TY1 - y) / TUBE_H > 0.75 ? DANGER : GLASS;
      c = mix(c, [0, 0, 0], Math.max(0, 0.4 - round * 0.4));
      if (hot) c = mix(c, [90, 16, 10], 0.25 + 0.25 * pulse);
    }
    if (x === TX0 + 2 && y > TY0 + 4 && y < TY1 - 6 && y % 9 !== 0) c = mix(c, [255, 255, 255], 0.22); // glass highlight
    put(x, y, c);
  }
  // sparks rising above the surface
  if (frac > 0.05) {
    const n = hot ? 6 : Math.round(1 + frac * 3);
    for (let i = 0; i < n; i++) {
      const life = ((t * (0.9 + i * 0.23) + i * 0.37) % 1);
      const sx = TX0 + 1 + Math.floor(hash(i, Math.floor(t * (0.9 + i * 0.23) + i * 0.37)) * (TX1 - TX0 - 2));
      const sy = Math.round(surface - 1 - life * 10);
      if (sy > TY0) put(sx, sy, mix(EMBER[4], EMBER[1], life), Math.round(255 * (1 - life)));
    }
  }

  // ---- tick marks at the quarters, with rivets on the left rail
  for (let q = 1; q < 4; q++) {
    const y = Math.round(TY1 - (q / 4) * TUBE_H);
    put(TX1 - 1, y, OUTLINE); put(TX1 - 2, y, OUTLINE);
    const rv = hot ? mix(RIVET, [255, 90, 50], pulse) : RIVET;
    put(TX0 - 3, y, rv); put(TX0 - 3, y - 1, mix(rv, OUTLINE, 0.4));
    put(TX1 + 3, y, mix(rv, BRONZE_D, 0.4));
  }

  // ---- cap: a small iron brazier bowl on top, a flame that grows with the heat
  for (let x = TX0 - 6; x <= TX1 + 5; x++) {
    for (let y = TY0 - 8; y <= TY0 - 4; y++) {
      const edge = y === TY0 - 8 || y === TY0 - 4 || x === TX0 - 6 || x === TX1 + 5;
      const inset = y === TY0 - 4 && (x < TX0 - 4 || x > TX1 + 3);
      if (inset) continue;
      put(x, y, edge ? OUTLINE : mix(BRONZE_D, BRONZE_L, y === TY0 - 7 ? 0.95 : 0.45));
    }
  }
  const flame = hot ? 1 : Math.max(0, (frac - 0.15) / 0.85);
  if (flame > 0) {
    const fh = Math.round(4 + flame * 16 + (hot ? Math.sin(t * 13) * 1.5 : Math.sin(t * 8) * 0.8));
    const mid = (TX0 + TX1) / 2 - 0.5;
    for (let y = 0; y < fh; y++) {
      const k = y / fh; // 0 base .. 1 tip
      const half = (1 - k) * (3 + flame * 4) + Math.sin(t * 11 + y) * 0.6;
      const sway = Math.sin(t * 6 + y * 0.5) * k * 1.4;
      for (let x = Math.floor(mid - half + sway); x <= Math.ceil(mid + half + sway); x++) {
        const inner = Math.abs(x - mid - sway) < half * 0.45;
        const c = k > 0.7 ? EMBER[2] : inner ? (hot ? WHITE_HOT : EMBER[4]) : EMBER[3];
        put(x, TY0 - 9 - y, c, k > 0.85 ? 170 : 255);
      }
    }
  }

  // ---- foot: a bronze plinth
  for (let x = TX0 - 6; x <= TX1 + 5; x++) for (let y = TY1 + 4; y <= TY1 + 9; y++) {
    const edge = y === TY1 + 4 || y === TY1 + 9 || x === TX0 - 6 || x === TX1 + 5;
    put(x, y, edge ? OUTLINE : mix(BRONZE_D, BRONZE_L, y === TY1 + 5 ? 0.9 : 0.35));
  }
  for (let x = TX0 - 4; x <= TX1 + 3; x++) put(x, TY1 + 10, OUTLINE);
  put(TX0 - 3, TY1 + 7, RIVET); put(TX1 + 2, TY1 + 7, RIVET);
}

export class OverloadGauge {
  private root: HTMLElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private label: HTMLElement;
  private secs: HTMLElement;
  private last = { frac: -1, hot: false, at: 0, seenHeat: 0 };

  constructor(hud: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "overload";
    this.root.dataset.tiphead = "Heat";
    this.root.dataset.tip = "Physical skills and dodge rolls build Heat; it cools by itself. Fill it to the top and you overload: " +
      `those skills and the roll lock for ${OVERLOAD.ventMs / 1000} seconds while it cools. Spells (mana) still work.`;
    this.root.innerHTML = `<canvas width="${W}" height="${H}"></canvas><b class="ol-label">HEAT</b><span class="ol-secs"></span>`;
    hud.appendChild(this.root);
    const cv = this.root.querySelector("canvas") as HTMLCanvasElement;
    this.ctx = cv.getContext("2d")!;
    this.img = this.ctx.createImageData(W, H);
    this.label = this.root.querySelector(".ol-label") as HTMLElement;
    this.secs = this.root.querySelector(".ol-secs") as HTMLElement;
  }

  /** `energy` = Player.energy (shared/overload.ts). Returns "overload" / "cooled" on the frame the state flips. */
  update(energy: number): "" | "overload" | "cooled" {
    const now = performance.now();
    const u = { energy }, hot = isOverheated(u), frac = heatOf(u) / OVERLOAD.max;
    let flip: "" | "overload" | "cooled" = "";
    if (hot !== this.last.hot) {
      flip = hot ? "overload" : "cooled";
      this.root.classList.toggle("hot", hot);
      this.label.textContent = hot ? "OVERLOAD" : "HEAT";
      if (!hot) this.secs.textContent = "";
    }
    if (hot) {
      const s = ventLeft(u).toFixed(1);
      if (this.secs.textContent !== s) this.secs.textContent = s;
    }
    // shown while there is heat, and a little while after it is gone
    if (frac > 0 || hot) this.last.seenHeat = now;
    const shown = now - this.last.seenHeat < 1400;
    if (shown !== this.root.classList.contains("on")) this.root.classList.toggle("on", shown);
    this.root.classList.toggle("warn", !hot && frac >= 0.75);
    // redraw ~30 times a second while visible and moving (embers drift), else only on a change
    if (shown && (Math.abs(frac - this.last.frac) > 0.002 || hot !== this.last.hot || (frac > 0 && now - this.last.at > 33))) {
      draw(this.img, frac, hot, now / 1000);
      this.ctx.putImageData(this.img, 0, 0);
      this.last.frac = frac; this.last.at = now;
    }
    this.last.hot = hot;
    return flip;
  }
}
