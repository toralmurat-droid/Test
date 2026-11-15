import { NOTES } from "../../shared/songs";

/**
 * The Songweaver's chord lockout as a little clock on the Song orb (owner only, cosmetic). It shows while her `chlock`
 * status word is on; a dark wedge sweeps clockwise from 12 o'clock over a bronze-framed note tile and the tile is fully
 * dark when NOTES.lockMs has passed. The server owns the lockout: the word going off hides the clock, whatever it shows.
 * The client has no owner-only remaining time (no field in Player.me), so the sweep starts when it first sees the word.
 */
const PX = 16; // art pixels; drawn at 2 CSS px each (see orbs.css .lockclock)
const STEPS = 48; // redraw only when the sweep moves one step
const NOTE = [
  "...22..",
  "...222.",
  "...2.22",
  "...2...",
  "...2...",
  ".222...",
  "22222..",
  ".222...",
];
const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

export class LockClock {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private from = 0;
  private shown = -1;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("canvas");
    this.el.width = this.el.height = PX; this.el.className = "lockclock"; this.el.title = "Chords locked";
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.ctx = this.el.getContext("2d")!;
  }

  /** `locked`: her chlock word is on. `now`: performance.now() (ms). */
  update(locked: boolean, now: number) {
    if (!locked) { if (!this.el.hidden) this.el.hidden = true; this.from = 0; this.shown = -1; return; }
    if (!this.from) this.from = now;
    const q = Math.floor(Math.min(1, (now - this.from) / NOTES.lockMs) * STEPS);
    if (q === this.shown) return;
    this.shown = q;
    this.el.hidden = false;
    this.draw(q / STEPS);
  }

  private draw(p: number) {
    const c = this.ctx, img = c.createImageData(PX, PX), d = img.data;
    for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
      const edge = Math.min(x, y, PX - 1 - x, PX - 1 - y);
      let col: number[];
      if (edge === 0) col = [26, 18, 10]; // dark outline
      else if (edge === 1) col = x + y < PX ? [224, 178, 90] : [92, 62, 26]; // bronze frame, lit top left
      else {
        col = [70, 72, 96]; // lit tile
        if (NOTE[y - 4]?.[x - 5] === "2") col = [200, 202, 226]; // note glyph at (5,4)
        // clockwise from 12 o'clock: 0 at the top, 1 after a full turn
        const a = Math.atan2(x + 0.5 - PX / 2, -(y + 0.5 - PX / 2)), turn = (a < 0 ? a + Math.PI * 2 : a) / (Math.PI * 2);
        if (turn < p) col = lerp(col, [6, 6, 12], 0.88);
      }
      const o = (y * PX + x) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }
}
