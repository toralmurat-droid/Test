import { dayPhase, dayTime } from "./details";

const N = 78; // canvas pixels across (shown at 3x, like the minimap); 3px margin so sun/moon never clip
const C = N / 2, R_IN = 29.5, R_OUT = 35.5, R_ICON = 32.5;
const SUNRISE = 0.95, SUNSET = 0.685; // middle of dawn and dusk in the day cycle

/**
 * Day/night dial around the round minimap: the upper half of the ring is the sky, the lower half the ground.
 * The sun and the moon sit on opposite sides and turn around the map with the 30-minute day cycle: the sun
 * rises on the right, crosses the top during the day and sets on the left, then the moon takes over.
 */
export class DayDial {
  private ctx: CanvasRenderingContext2D;
  private last = -1;

  constructor(private el: HTMLCanvasElement) {
    el.width = el.height = N;
    this.ctx = el.getContext("2d")!;
    el.title = "Time of day";
  }

  /** Sun angle (radians, 0 = right horizon, π/2 = top): daytime fills the upper half, night the lower half. */
  static sunAngle(t: number) {
    const day = (t - SUNRISE + 1) % 1, len = (SUNSET - SUNRISE + 1) % 1;
    return day < len ? (day / len) * Math.PI : Math.PI + ((day - len) / (1 - len)) * Math.PI;
  }

  draw(nowMs: number) {
    if (nowMs - this.last < 500 && this.last >= 0) return;
    this.last = nowMs;
    const t = dayTime(Date.now()), { dark, warm } = dayPhase(t);
    const g = this.ctx, img = g.createImageData(N, N), d = img.data;
    const mix = (a: number[], b: number[], k: number) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
    let sky = mix([110, 190, 240], [26, 35, 80], dark);
    sky = mix(sky, [240, 140, 70], warm * 0.6);
    const skyHi = mix(sky, [255, 255, 255], 0.18);
    const earth = mix([74, 56, 34], [28, 22, 18], dark), earthHi = mix(earth, [255, 255, 255], 0.1);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - C, dy = y + 0.5 - C, r = Math.hypot(dx, dy), o = (y * N + x) * 4;
      if (r > R_OUT + 1 || r < R_IN - 0.5) continue;
      let col: number[];
      if (r > R_OUT || r < R_IN + 0.5) col = [26, 18, 12]; // dark rims
      else if (Math.abs(dy) < 0.6) col = [200, 170, 110]; // horizon line
      else if (dy < 0) col = r < R_IN + 2 ? skyHi : sky;
      else col = r < R_IN + 2 ? earthHi : earth;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const a = DayDial.sunAngle(t);
    this.sun(C + Math.cos(a) * R_ICON, C - Math.sin(a) * R_ICON);
    this.moon(C - Math.cos(a) * R_ICON, C + Math.sin(a) * R_ICON);
    this.el.title = `Time of day: ${dark > 0.6 ? "night" : warm > 0.4 ? (t > 0.8 ? "dawn" : "dusk") : "day"}`;
  }

  private dot(x: number, y: number, c: string) { this.ctx.fillStyle = c; this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }

  private sun(cx: number, cy: number) {
    const x0 = Math.round(cx), y0 = Math.round(cy);
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const r = Math.hypot(x, y);
      if (r <= 2.6) this.dot(x0 + x - 0.5, y0 + y - 0.5, r < 1.3 ? "#fff6b0" : "#ffd23a");
      else if (r <= 3.3) this.dot(x0 + x - 0.5, y0 + y - 0.5, "#c86a10");
      else if (r <= 4.4 && (x === 0 || y === 0 || Math.abs(x) === Math.abs(y))) this.dot(x0 + x - 0.5, y0 + y - 0.5, "#ffb020"); // rays
    }
  }

  /** Pixel-art crescent (~11px): bright outer limb fading towards the terminator, two craters, crisp dark outline. */
  private moon(cx: number, cy: number) {
    const x0 = Math.round(cx), y0 = Math.round(cy);
    const BX = 2.4, BY = -1.4, BR = 3.9; // the shadow disc that bites the full moon into a crescent
    const lit = (x: number, y: number) => Math.hypot(x, y) <= 4.6 && Math.hypot(x - BX, y - BY) > BR;
    const craters = new Set(["-3,1", "-1,3", "-2,-1"]);
    for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
      const px = x0 + x - 0.5, py = y0 + y - 0.5;
      if (lit(x, y)) {
        const depth = Math.hypot(x - BX, y - BY) - BR; // 0 at the terminator, grows towards the outer limb
        let c = depth > 2.6 ? "#fffef2" : depth > 1.5 ? "#f1ecc8" : depth > 0.7 ? "#d9d2a6" : "#b3ab84";
        if (craters.has(`${x},${y}`)) c = depth > 1.5 ? "#cfc79c" : "#a59e78";
        this.dot(px, py, c);
      } else if (lit(x + 1, y) || lit(x - 1, y) || lit(x, y + 1) || lit(x, y - 1)) {
        this.dot(px, py, "#141830");
      }
    }
  }
}
