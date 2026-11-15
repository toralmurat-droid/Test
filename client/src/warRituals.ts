/**
 * Veiled Circle rituals in the world (server/warRituals.ts sends "rituals"): a rune circle on the ground in the Veiled
 * colours, drawn in code as 2 px pixel blocks, with a slow glow pulse, a progress ring round it, cracks and gaps once
 * broken, and a brief flare when it completes; a soft hum near a channelling circle. Cosmetic only: the server decides.
 */
import Phaser from "phaser";
import { CLANS } from "../../shared/war/clans";
import type { RitualView } from "../../shared/war/rituals";
import { play } from "./sfx";

const P = 2; // world px per art pixel (all world art is drawn at 2x)
const R = 56; // circle radius (world px)
const V = CLANS.veiled, CLOTH = V.cloth, TRIM = V.trim, SIGIL = V.sigil;
/** Past this from the hero (px) the circle is neither drawn nor redrawn. */
const FAR_PX = 30 * 32;
const GREY = 0x8a7fa8, DARK = 0x0e0c16, PAUSED = 0x9aa0c8;
/** A rune: 3x4 art pixels as rows of bits (msb left). Eight of them sit between the two rings. */
const RUNES = [[0b010, 0b111, 0b010, 0b010], [0b101, 0b010, 0b101, 0b010], [0b110, 0b011, 0b110, 0b100], [0b111, 0b101, 0b001, 0b011],
  [0b010, 0b101, 0b111, 0b101], [0b100, 0b110, 0b101, 0b111], [0b011, 0b100, 0b010, 0b110], [0b101, 0b111, 0b101, 0b101]];
/** Cracks of a broken circle: zigzags out from the middle (angle, length share). */
const CRACKS = [[0.4, 1.05], [1.9, 0.8], [3.0, 1.1], [4.4, 0.7], [5.4, 0.95]];

export class WarRituals {
  private g: Phaser.GameObjects.Graphics;
  private v?: RitualView;
  private flareAt = 0;
  private drawn = 0;
  private nextHum = 0;

  constructor(private scene: Phaser.Scene) {
    // a Graphics at (0, 0) drawing in world coordinates: the iso view lays it flat on the ground (iso.ts isFlat)
    this.g = scene.add.graphics().setDepth(-1.4).setVisible(false);
  }

  /** The server's view of the room's circle (t -1: none). */
  set(m: RitualView) {
    if (!m || typeof m.t !== "number" || typeof m.x !== "number" || typeof m.y !== "number") return;
    if (m.t >= 0 && m.state === "done" && this.v?.state !== "done") this.flareAt = performance.now();
    this.v = m.t >= 0 ? { ...m, progress: Math.max(0, Math.min(1, +m.progress || 0)) } : undefined;
    this.drawn = 0;
  }

  /** "Ritual n%" for the war plaque while the hero stands in land t, or "". */
  line(t: number): string {
    const v = this.v;
    if (!v || v.t !== t) return "";
    return v.state === "done" ? "Ritual complete" : v.state === "broken" ? "Ritual broken" : `Ritual ${Math.round(v.progress * 100)}%${v.state === "paused" ? " (paused)" : ""}`;
  }

  /** Every frame: redraw about ten times a second (the pulse), hum near a channelling circle. */
  update(hero: { x: number; y: number } | undefined, now = performance.now()) {
    const v = this.v;
    // nothing to draw with no circle, or with the hero far from it (no redrawing ~2500 pixels ten times a second for nobody)
    if (!v || !hero || Math.hypot(hero.x - v.x, hero.y - v.y) > FAR_PX) { if (this.g.visible) { this.g.clear().setVisible(false); this.drawn = 0; } return; }
    if (v.state === "channel" && Date.now() >= this.nextHum && Math.hypot(hero.x - v.x, hero.y - v.y) < 9 * 32) {
      this.nextHum = Date.now() + 2600;
      play("ritual_hum", v.x, v.y, 0.7, undefined, { key: "ritualhum", minGap: 2000 });
    }
    if (now - this.drawn < 100) return;
    this.drawn = now;
    this.draw(v, now);
  }

  private draw(v: RitualView, now: number) {
    const g = this.g.clear().setVisible(true), broken = v.state === "broken", done = v.state === "done";
    const cx = Math.round(v.x / P) * P, cy = Math.round(v.y / P) * P;
    const pulse = broken ? 0.35 : done ? 0.95 : 0.6 + 0.3 * Math.sin(now / (v.state === "paused" ? 1400 : 700));
    const px = (x: number, y: number, col: number, a: number) => { g.fillStyle(col, a); g.fillRect(cx + Math.round(x / P) * P - P / 2, cy + Math.round(y / P) * P - P / 2, P, P); };
    // the ground: a dark disc in the Veiled cloth (grey when broken)
    g.fillStyle(broken ? DARK : CLOTH, broken ? 0.5 : 0.42 + 0.12 * pulse); g.fillCircle(cx, cy, R);
    // two rings of pixels (the broken one has gaps)
    const ring = (r: number, col: number, a: number, gaps: boolean) => {
      const n = Math.ceil((2 * Math.PI * r) / P);
      for (let i = 0; i < n; i++) {
        if (gaps && (i * 7) % 23 < 6) continue;
        const ang = (i / n) * Math.PI * 2;
        px(Math.cos(ang) * r, Math.sin(ang) * r, col, a);
      }
    };
    const ringCol = broken ? GREY : TRIM;
    // each ring two pixels thick with a dark outline, so it reads on light and dark ground alike
    for (const [r, a] of [[R, 1], [R - 14, 0.85]]) {
      ring(r + P, DARK, 0.55, false); ring(r - 2 * P, DARK, 0.45, false);
      ring(r, ringCol, (broken ? 0.75 : 0.55 + 0.45 * pulse) * a, broken); ring(r - P, ringCol, (broken ? 0.6 : 0.45 + 0.4 * pulse) * a, broken);
    }
    // runes between the rings, and a star in the middle
    RUNES.forEach((rows, k) => {
      const ang = (k / RUNES.length) * Math.PI * 2 + now / 20000 * (broken ? 0 : 1), rx = Math.cos(ang) * (R - 7), ry = Math.sin(ang) * (R - 7);
      rows.forEach((bits, y) => { for (let x = 0; x < 3; x++) if (bits & (4 >> x)) px(rx + (x - 1) * P, ry + (y - 1.5) * P, broken ? GREY : SIGIL, broken ? 0.55 : 0.6 + 0.4 * pulse); });
    });
    for (let s = 0; s < 2; s++) { // two triangles: a six-point star
      const pts = [0, 1, 2].map((i) => { const a = -Math.PI / 2 + s * Math.PI + (i * 2 * Math.PI) / 3; return [Math.cos(a) * (R - 22), Math.sin(a) * (R - 22)]; });
      for (let i = 0; i < 3; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % 3], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / P);
        for (let j = 0; j <= n; j++) if (!broken || (j + i * 3) % 5 > 1) px(x0 + ((x1 - x0) * j) / n, y0 + ((y1 - y0) * j) / n, broken ? GREY : TRIM, broken ? 0.6 : 0.5 + 0.4 * pulse);
      }
    }
    px(0, 0, broken ? GREY : SIGIL, broken ? 0.5 : pulse); px(P, 0, broken ? GREY : SIGIL, 0.6 * pulse); px(-P, 0, broken ? GREY : SIGIL, 0.6 * pulse); px(0, P, broken ? GREY : SIGIL, 0.6 * pulse); px(0, -P, broken ? GREY : SIGIL, 0.6 * pulse);
    if (broken) { // cracks out from the middle, past the rim
      for (const [a0, len] of CRACKS) {
        let x = 0, y = 0;
        for (let j = 0; j < (R * len) / P; j++) {
          const a = a0 + (j % 4 < 2 ? 0.25 : -0.25);
          x += Math.cos(a) * P; y += Math.sin(a) * P;
          px(x, y, DARK, 0.95); px(x + P, y, DARK, 0.7);
          if (j % 3 === 0) px(x, y + P, TRIM, 0.4); // a dying ember along the crack
        }
      }
      return;
    }
    // the progress ring just outside: bright where channelled (clockwise from the top), dim ahead
    const pr = R + 6, n = Math.ceil((2 * Math.PI * pr) / P), lit = Math.round(n * v.progress), col = v.state === "paused" ? PAUSED : SIGIL;
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2, x = Math.cos(ang) * pr, y = Math.sin(ang) * pr;
      px(Math.cos(ang) * (pr + 2 * P), Math.sin(ang) * (pr + 2 * P), DARK, 0.5); px(Math.cos(ang) * (pr - P), Math.sin(ang) * (pr - P), DARK, 0.5);
      if (i < lit) { px(x, y, col, 1); px(Math.cos(ang) * (pr + P), Math.sin(ang) * (pr + P), col, 0.6 + 0.4 * pulse); } else { px(x, y, DARK, 0.6); if (i % 2 === 0) px(Math.cos(ang) * (pr + P), Math.sin(ang) * (pr + P), col, 0.18); }
    }
    // completion: a short flare, a ring of light rushing out
    const f = (now - this.flareAt) / 1200;
    if (done && f >= 0 && f < 1) {
      g.fillStyle(SIGIL, 0.35 * (1 - f)); g.fillCircle(cx, cy, R + 4);
      ring(R + 8 + f * 48, SIGIL, 0.9 * (1 - f), false);
      ring(R + 4 + f * 30, TRIM, 0.7 * (1 - f), false);
    }
  }

  destroy() { this.g.destroy(); }
}
