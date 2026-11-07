/**
 * Pixel-art skill icons, 24x24, one unique picture per skill (shared/skills.ts).
 * Pure code (no DOM): `paintSkill(id)` returns a 24x24 grid of "#rrggbb" colours (or "" for transparent),
 * which client/src/skillIcons.ts turns into an image and the effects layer (skillfx.ts) into a texture.
 *
 * Every icon is: a framed backdrop tinted by the skill's element (the frame gets richer with the tree row),
 * a motif drawn with the helpers below, a dark outline around the motif, then glints and sparks on top.
 */
import { skillById, FxStyle } from "../../shared/skills";

export const ICON = 24;
type Ramp = [dark: string, mid: string, light: string, hi: string];

// Material ramps (dark -> highlight)
const STEEL: Ramp = ["#3a4256", "#6d7d99", "#a9b8d0", "#eef3fb"];
const IRON: Ramp = ["#262a36", "#474e62", "#6d7690", "#9aa3bb"];
const GOLD: Ramp = ["#6b4a12", "#b8860b", "#ffd166", "#fff3b0"];
const WOOD: Ramp = ["#3e2716", "#6d4526", "#9c6b3c", "#c79a63"];
const LEATHER: Ramp = ["#3b2414", "#6b3f22", "#8f5a33", "#b07a4f"];
const FIRE: Ramp = ["#8c1414", "#e63946", "#ff9f1c", "#fff176"];
const ICE: Ramp = ["#1d3f8a", "#2a6fdb", "#4cc9f0", "#d6f6ff"];
const ARC: Ramp = ["#3a0f66", "#7b2cbf", "#c77dff", "#f3d9ff"];
const LIT: Ramp = ["#3949ab", "#80d8ff", "#b3ecff", "#ffffff"];
const SHAD: Ramp = ["#140b2b", "#35208a", "#6a45c2", "#a993e0"];
const POIS: Ramp = ["#1b5e20", "#43a047", "#7cfc00", "#e6ffb3"];
const EARTH: Ramp = ["#3b2a20", "#5d4037", "#8d6e63", "#bcaaa4"];
const BLOOD: Ramp = ["#4a0000", "#9b1b1b", "#e63946", "#ff8a80"];
const WIND: Ramp = ["#2f6b55", "#5fa585", "#9ad1b0", "#e8fff4"];
const SPIRIT: Ramp = ["#0d4d4a", "#26a69a", "#4dd0e1", "#d0fbff"];
const NAT: Ramp = ["#1f3d12", "#33691e", "#689f38", "#b5e06a"];
const BONE: Ramp = ["#5b5140", "#a39782", "#d8cdb6", "#fbf6e8"];
const CLOTH_R: Ramp = ["#5a0d12", "#a4161a", "#e5383b", "#ff8f8f"];
const SKIN: Ramp = ["#5e3a26", "#9a6342", "#c98d63", "#e8b58c"];
const OUT = "#0b0a12";

/** Backdrop colours per element: [deep, glow]. */
const BACK: Record<FxStyle, [string, string]> = {
  steel: ["#151a26", "#34405a"], holy: ["#2a1d08", "#6b5418"], fire: ["#2a0b06", "#6e1e0c"], frost: ["#071a33", "#174a7a"],
  arcane: ["#1a0830", "#45207a"], lightning: ["#0c1430", "#29447a"], shadow: ["#0a0614", "#2a1650"], poison: ["#0a1a08", "#1f4a16"],
  earth: ["#1c140e", "#46321f"], blood: ["#1e0507", "#5a1014"], wind: ["#0b1d18", "#245244"], spirit: ["#061c1e", "#145a5a"],
  nature: ["#0e1a07", "#2d4a14"],
};

class Painter {
  g: string[] = new Array(ICON * ICON).fill("");
  fx: string[] = new Array(ICON * ICON).fill(""); // drawn after the outline (glows, sparks)
  layer: "g" | "fx" = "g";
  get(x: number, y: number) { return this.g[y * ICON + x]; }
  px(x: number, y: number, c: string) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= ICON || y >= ICON || !c) return;
    this[this.layer][y * ICON + x] = c;
  }
  rect(x: number, y: number, w: number, h: number, c: string) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** Line `w` pixels thick (square brush). */
  thick(x0: number, y0: number, x1: number, y1: number, w: number, c: string) {
    const o = Math.floor((w - 1) / 2);
    for (let i = 0; i < w; i++) for (let j = 0; j < w; j++) this.line(x0 + i - o, y0 + j - o, x1 + i - o, y1 + j - o, c);
  }
  disc(cx: number, cy: number, r: number, c: string, ry = r) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const dx = (x - cx) / (r + 0.4), dy = (y - cy) / (ry + 0.4);
      if (dx * dx + dy * dy <= 1) this.px(x, y, c);
    }
  }
  /** Shaded ball: dark rim, light top-left. */
  ball(cx: number, cy: number, r: number, k: Ramp, ry = r) {
    this.disc(cx, cy, r, k[0], ry);
    this.disc(cx - r * 0.12, cy - ry * 0.12, r * 0.82, k[1], ry * 0.82);
    this.disc(cx - r * 0.3, cy - ry * 0.3, r * 0.48, k[2], ry * 0.48);
    this.px(cx - r * 0.45, cy - ry * 0.45, k[3]);
  }
  ring(cx: number, cy: number, r: number, c: string, from = 0, to = Math.PI * 2, ry = r) {
    const n = Math.ceil(r * 8);
    for (let i = 0; i <= n; i++) { const a = from + (to - from) * i / n; this.px(cx + Math.cos(a) * r, cy + Math.sin(a) * ry, c); }
  }
  poly(pts: number[][], c: string) {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) xs.push(ax + (y + 0.5 - ay) / (by - ay) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]) - 1; x++) this.px(x, y, c);
    }
    for (let i = 0; i < pts.length; i++) this.line(pts[i][0], pts[i][1], pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1], c);
  }
  /** 4-point sparkle. */
  spark(x: number, y: number, r: number, c: string, core = "#ffffff") {
    for (let i = 1; i <= r; i++) { this.px(x + i, y, c); this.px(x - i, y, c); this.px(x, y + i, c); this.px(x, y - i, c); }
    this.px(x, y, core);
  }

  /** Straight sword from hilt end (x0,y0) to tip (x1,y1). */
  sword(x0: number, y0: number, x1: number, y1: number, k: Ramp = STEEL, guard: Ramp = GOLD, opts: { wide?: boolean; grip?: number } = {}) {
    const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux;
    const grip = opts.grip ?? 4;
    const gx = x0 + ux * grip, gy = y0 + uy * grip;
    // blade: 2px body, bright edge, dark back edge
    const tx = x1 - ux * 1, ty = y1 - uy * 1;
    if (opts.wide) this.thick(gx, gy, tx, ty, 3, k[1]);
    this.thick(gx, gy, tx, ty, 2, k[2]);
    this.line(gx - nx * (opts.wide ? 1.2 : 0.6), gy - ny * (opts.wide ? 1.2 : 0.6), tx, ty, k[3]);
    this.line(gx + ux * 2 + nx * 0.7, gy + uy * 2 + ny * 0.7, x1 - ux * 4 + nx * 0.7, y1 - uy * 4 + ny * 0.7, k[1]);
    this.px(x1, y1, k[3]);
    // guard
    this.thick(gx + nx * 3, gy + ny * 3, gx - nx * 3, gy - ny * 3, 2, guard[1]);
    this.line(gx - nx * 3, gy - ny * 3, gx + nx * 3, gy + ny * 3, guard[2]);
    this.px(gx - nx * 3, gy - ny * 3, guard[3]);
    // grip + pommel
    this.thick(x0 + ux, y0 + uy, gx - ux * 1.5, gy - uy * 1.5, 2, LEATHER[1]);
    this.line(x0 + ux, y0 + uy, gx - ux * 1.5, gy - uy * 1.5, LEATHER[3]);
    this.ball(x0, y0, 1, guard);
  }
  /** Arrow from nock (x0,y0) to tip (x1,y1). */
  arrow(x0: number, y0: number, x1: number, y1: number, head: Ramp = STEEL, shaft: Ramp = WOOD, fletch = "#e5383b") {
    const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux;
    this.line(x0, y0, x1 - ux * 2, y1 - uy * 2, shaft[2]);
    const hx = x1 - ux * 3, hy = y1 - uy * 3;
    this.poly([[x1, y1], [hx + nx * 1.6, hy + ny * 1.6], [hx - nx * 1.6, hy - ny * 1.6]], head[1]);
    this.line(hx, hy, x1, y1, head[3]);
    this.line(x0, y0, x0 + ux * 2.5 + nx * 1.5, y0 + uy * 2.5 + ny * 1.5, fletch);
    this.line(x0, y0, x0 + ux * 2.5 - nx * 1.5, y0 + uy * 2.5 - ny * 1.5, fletch);
  }
  /** Flame tongue with its base centred at (cx, by), `h` tall, `w` wide. */
  flame(cx: number, by: number, h: number, w: number, k: Ramp = FIRE, lean = 0) {
    for (let lay = 0; lay < 4; lay++) {
      const s = 1 - lay * 0.24, hh = h * s, ww = w * s;
      for (let j = 0; j < hh; j++) {
        const t = j / hh; // 0 at base
        const half = ww / 2 * Math.sin(Math.PI * (0.35 + 0.65 * (1 - t))) * (1 - t * 0.35);
        const x = cx + lean * t * t * h * 0.4 + Math.sin(t * 5 + lay) * 0.6 * t;
        for (let i = Math.round(x - half); i <= Math.round(x + half); i++) this.px(i, by - j - lay * 0.5, k[lay]);
      }
    }
  }
  /** Axe: handle from (x0,y0) to (x1,y1), head at the top end on the side `side` (1/-1). */
  axe(x0: number, y0: number, x1: number, y1: number, side = 1, k: Ramp = STEEL, double = false) {
    const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy * side, ny = ux * side;
    this.thick(x0, y0, x1, y1, 2, WOOD[1]);
    this.line(x0, y0, x1, y1, WOOD[2]);
    const head = (s: number) => {
      const bx = x1 - ux * 3, by = y1 - uy * 3;
      const p = (a: number, b: number) => [bx + ux * a + nx * b * s, by + uy * a + ny * b * s];
      this.poly([p(-1, 1), p(-4, 6), p(0, 7), p(4, 6), p(2, 1)], k[1]);
      this.line(...(p(-4, 6) as [number, number]), ...(p(4, 6) as [number, number]), k[3]);
      this.line(...(p(-3, 5) as [number, number]), ...(p(3, 5) as [number, number]), k[2]);
      this.line(...(p(-1, 1) as [number, number]), ...(p(2, 1) as [number, number]), k[0]);
    };
    head(1); if (double) head(-1);
  }
  /** Simple figure (head + body) standing at (cx, by), for silhouettes. */
  figure(cx: number, by: number, k: Ramp, h = 12) {
    this.ball(cx, by - h + 2, 2, k);
    this.poly([[cx - 2, by - h + 5], [cx + 2, by - h + 5], [cx + 3, by - 3], [cx - 3, by - 3]], k[1]);
    this.line(cx - 2, by - 3, cx - 2, by, k[0]); this.line(cx + 2, by - 3, cx + 2, by, k[0]);
    this.line(cx - 1, by - h + 5, cx - 2, by - 4, k[2]);
  }
  bolt(pts: number[][], k: Ramp = LIT) {
    for (let i = 1; i < pts.length; i++) {
      this.thick(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 2, k[1]);
      this.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], k[3]);
    }
  }
  cloud(cx: number, cy: number, w: number, k: Ramp) {
    this.disc(cx, cy + 1, w / 2, k[0], 2.6);
    this.disc(cx - w / 4, cy, 3, k[1]); this.disc(cx + w / 5, cy - 1, 3.6, k[1]); this.disc(cx, cy - 2, 3, k[2]);
    this.px(cx - 1, cy - 4, k[3]); this.px(cx - w / 4 - 1, cy - 2, k[2]);
  }
  /** Outline every empty pixel that touches the motif. */
  outline(c = OUT) {
    const src = this.g.slice();
    for (let y = 0; y < ICON; y++) for (let x = 0; x < ICON; x++) {
      if (src[y * ICON + x]) continue;
      const n = (i: number, j: number) => i >= 0 && j >= 0 && i < ICON && j < ICON && src[j * ICON + i];
      if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) this.g[y * ICON + x] = c;
    }
    this.layer = "fx";
  }
}

const hexMix = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return "#" + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0");
};

/** Backdrop: dithered radial glow in the element colour, and a frame (iron -> bronze -> gold with gems by row). */
function backdrop(style: FxStyle, row: number, passive: boolean): string[] {
  const [deep, glow] = BACK[style];
  const out: string[] = [];
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < ICON; y++) for (let x = 0; x < ICON; x++) {
    const d = Math.hypot(x - 11.5, y - 10.5) / 15;
    const t = Math.max(0, 1 - d) * 1.1 + (bayer[(y % 4) * 4 + (x % 4)] / 16 - 0.5) * 0.3;
    out.push(t > 0.75 ? glow : t > 0.4 ? hexMix(deep, glow, 0.5) : deep);
  }
  const frame: Ramp = row >= 4 ? GOLD : row >= 2 ? ["#4a2e14", "#8a5a2b", "#c08a4a", "#e8c58a"] : IRON;
  for (let i = 0; i < ICON; i++) {
    out[i] = frame[1]; out[(ICON - 1) * ICON + i] = frame[0];
    out[i * ICON] = frame[1]; out[i * ICON + ICON - 1] = frame[0];
    if (i > 0 && i < ICON - 1) { out[ICON + i] = frame[2]; out[i * ICON + 1] = frame[2]; }
  }
  // corners: rivets, gems on the top row of the tree
  const corner = row >= 4 ? "#e63946" : row >= 3 ? frame[3] : frame[2];
  for (const [x, y] of [[1, 1], [ICON - 2, 1], [1, ICON - 2], [ICON - 2, ICON - 2]]) out[y * ICON + x] = corner;
  if (passive) for (let i = 4; i < ICON - 4; i += 2) { out[(ICON - 1) * ICON + i] = "#7a7a8a"; } // passives: dotted bottom edge
  return out;
}

// ---- One drawing per skill ----------------------------------------------------------------------------------------
type Draw = (p: Painter) => void;

const ART: Record<string, Draw> = {
  // ===== Wizard: basic spells (no tree, cast again and again) =====
  w_spark: (p) => {
    p.bolt([[5, 19], [10, 13], [8, 12], [14, 6], [12, 10], [16, 11], [19, 5]]);
    p.outline();
    p.spark(19, 5, 2, "#ffffff"); p.px(5, 19, LIT[2]); p.px(16, 15, LIT[3]);
  },
  w_firebolt: (p) => {
    p.thick(4, 20, 14, 10, 2, FIRE[1]); p.line(5, 20, 14, 11, FIRE[2]);
    p.poly([[13, 8], [20, 4], [16, 11]], FIRE[2]);
    p.disc(16, 8, 2.5, FIRE[2]); p.disc(16, 8, 1.2, FIRE[3]);
    p.outline();
    p.px(17, 7, "#ffffff"); p.px(3, 21, FIRE[0]); p.px(8, 19, "#fff176");
  },
  w_frostbolt: (p) => {
    p.poly([[20, 4], [7, 14], [10, 17]], ICE[1]); p.poly([[20, 4], [8, 15], [9, 16]], ICE[2]);
    p.line(19, 5, 9, 15, ICE[3]);
    p.line(3, 21, 7, 17, ICE[1]); p.line(5, 21, 8, 18, ICE[2]);
    p.outline();
    p.px(20, 4, "#ffffff"); p.px(4, 17, "#ffffff"); p.px(12, 20, ICE[3]);
  },
  // ===== Knight: Valor =====
  k_lunge: (p) => {
    p.sword(5, 19, 20, 4);
    p.outline();
    for (const [x, y, l] of [[3, 13, 4], [6, 21, 4], [2, 17, 3]]) p.line(x, y, x - l + 1, y + l - 1, "#dfe6f0");
    p.spark(20, 4, 2, "#ffffff");
  },
  k_whirl: (p) => {
    for (let r = 6; r <= 10; r++) p.ring(12, 12, r, r > 8 ? "#a9b8d0" : "#6d7d99", Math.PI * (0.2 + (10 - r) * 0.12), Math.PI * 1.6);
    p.sword(9, 14, 17, 8, STEEL, GOLD, { grip: 3 });
    p.outline();
    p.ring(12, 12, 10, "#eef3fb", Math.PI * 1.15, Math.PI * 1.65);
    p.px(20, 15, "#ffffff"); p.px(4, 9, "#ffffff");
  },
  k_mastery: (p) => {
    p.sword(4, 20, 19, 5); p.sword(20, 20, 5, 5);
    p.outline();
    p.spark(12, 12, 2, "#ffd166", "#fff3b0");
  },
  k_rush: (p) => {
    p.sword(4, 13, 21, 11, STEEL, GOLD);
    for (let i = 0; i < 3; i++) { const x = 3 + i * 4; p.line(x, 6, x + 3, 9, GOLD[2]); p.line(x + 3, 9, x, 12, GOLD[2]); }
    p.outline();
    for (let i = 0; i < 3; i++) { const x = 3 + i * 4; p.line(x, 16, x + 3, 19, GOLD[3]); p.line(x + 3, 19, x, 22, GOLD[1]); }
    p.spark(21, 11, 2, "#fff3b0");
  },
  k_judgement: (p) => {
    for (let i = -4; i <= 4; i += 2) p.line(12 + i, 21, 12 + i * 2.5, 21 - 9, hexMix("#ffd166", "#2a1d08", 0.4));
    p.sword(12, 2, 12, 20, ["#d9b44a", "#ffe08a", "#fff7cf", "#ffffff"], GOLD, { wide: true, grip: 5 });
    p.outline();
    p.line(5, 21, 19, 21, GOLD[2]); p.line(8, 22, 16, 22, GOLD[1]);
    p.spark(12, 20, 3, "#fff3b0"); p.px(5, 8, "#fff3b0"); p.px(19, 6, "#fff3b0");
  },
  // ===== Knight: Bulwark =====
  k_shield: (p) => {
    p.poly([[4, 3], [20, 3], [20, 11], [12, 21], [4, 11]], ICE[0]);
    p.poly([[5, 4], [19, 4], [19, 11], [12, 19], [5, 11]], ICE[1]);
    p.poly([[5, 4], [12, 4], [12, 19], [5, 11]], ICE[2]);
    p.rect(11, 5, 2, 13, "#eef3fb"); p.rect(7, 9, 10, 2, "#eef3fb");
    p.line(4, 3, 20, 3, "#d6f6ff");
    p.outline();
    p.spark(18, 5, 2, "#ffffff");
  },
  k_riposte: (p) => {
    p.sword(3, 20, 18, 5); p.sword(21, 20, 6, 5, IRON, IRON);
    p.outline();
    p.spark(12, 12, 4, "#fff176", "#ffffff"); p.px(10, 10, "#fff176"); p.px(14, 14, "#ffd166"); p.px(14, 10, "#ffffff"); p.px(10, 14, "#ffffff");
  },
  k_ironskin: (p) => {
    p.poly([[5, 5], [10, 4], [14, 4], [19, 5], [20, 12], [17, 20], [7, 20], [4, 12]], STEEL[0]);
    p.poly([[6, 6], [11, 5], [11, 19], [8, 19], [5, 12]], STEEL[2]);
    p.poly([[13, 5], [18, 6], [19, 12], [16, 19], [13, 19]], STEEL[1]);
    p.line(12, 5, 12, 19, STEEL[3]); p.line(6, 12, 18, 12, STEEL[0]);
    p.disc(4, 6, 2, IRON[2]); p.disc(20, 6, 2, IRON[1]);
    p.outline();
    p.px(8, 8, "#ffffff"); p.px(9, 7, "#ffffff");
  },
  k_taunt: (p) => {
    // great helm, front view, roaring red arcs
    p.poly([[7, 5], [17, 5], [18, 16], [12, 19], [6, 16]], STEEL[1]);
    p.poly([[7, 5], [12, 5], [12, 19], [6, 16]], STEEL[2]);
    p.rect(8, 10, 8, 1, OUT); p.rect(11, 12, 2, 4, OUT);
    p.line(12, 3, 12, 5, CLOTH_R[2]); p.line(11, 2, 13, 2, CLOTH_R[2]);
    p.outline();
    for (const r of [3, 5]) { p.ring(4, 12, r, CLOTH_R[2], Math.PI * 0.7, Math.PI * 1.3); p.ring(20, 12, r, CLOTH_R[2], -Math.PI * 0.3, Math.PI * 0.3); }
  },
  k_quake: (p) => {
    p.poly([[1, 15], [23, 14], [23, 23], [1, 23]], EARTH[1]);
    p.line(1, 15, 23, 14, EARTH[2]);
    p.poly([[10, 14], [13, 14], [12, 18], [14, 22], [10, 22], [11, 18]], OUT);
    p.ball(5, 8, 2, EARTH); p.ball(18, 6, 2.5, EARTH); p.ball(12, 4, 1.5, EARTH); p.ball(15, 10, 1, EARTH);
    p.outline();
    p.line(11, 15, 12, 19, "#ffb347"); p.px(12, 20, "#ff9f1c");
    p.px(3, 12, EARTH[3]); p.px(20, 11, EARTH[3]); p.px(8, 12, EARTH[2]);
  },
  // ===== Knight: Crusade =====
  k_holyblade: (p) => {
    p.flame(12, 21, 18, 9, ["#b36b00", "#ffb000", "#ffe066", "#fffbe0"]);
    p.sword(12, 22, 12, 3);
    p.outline();
    p.spark(12, 3, 2, "#fffbe0"); p.px(7, 9, "#fff3b0"); p.px(17, 12, "#fff3b0");
  },
  k_consecrate: (p) => {
    p.disc(12, 17, 10, GOLD[0], 4); p.disc(12, 17, 8.5, GOLD[1], 3.2); p.disc(12, 17, 6, GOLD[2], 2.2);
    p.rect(11, 3, 2, 12, GOLD[2]); p.rect(8, 6, 8, 2, GOLD[2]); p.line(11, 3, 11, 14, GOLD[3]);
    p.outline();
    for (const [x, y] of [[5, 12], [19, 10], [16, 5], [6, 6]]) p.spark(x, y, 1, "#fff3b0");
  },
  k_rally: (p) => {
    p.thick(6, 3, 6, 22, 2, WOOD[1]); p.line(6, 3, 6, 22, WOOD[3]);
    p.poly([[8, 4], [20, 4], [17, 9], [20, 14], [8, 14]], CLOTH_R[1]);
    p.poly([[8, 4], [19, 4], [17, 7], [8, 7]], CLOTH_R[2]);
    p.ball(13, 9, 2, GOLD);
    p.ball(6, 2, 1, GOLD);
    p.outline();
    p.line(2, 16, 4, 14, "#fff3b0"); p.line(2, 20, 4, 18, "#fff3b0");
  },
  k_aura: (p) => {
    for (let a = 0; a < 8; a++) { const t = a * Math.PI / 4; p.line(12 + Math.cos(t) * 7, 12 + Math.sin(t) * 7, 12 + Math.cos(t) * 10, 12 + Math.sin(t) * 10, GOLD[1]); }
    p.ring(12, 12, 6, GOLD[2]); p.ring(12, 12, 5, GOLD[1]);
    p.figure(12, 19, ["#6b5418", "#ffe08a", "#fff7cf", "#ffffff"], 11);
    p.outline();
    p.ring(12, 12, 6, GOLD[3], Math.PI, Math.PI * 1.5);
  },
  k_wrath: (p) => {
    p.cloud(12, 4, 18, ["#4a3a20", "#7a6538", "#a8915a", "#e8d9a8"]);
    for (const x of [5, 12, 19]) { p.rect(x - 1, 7, 3, 14, GOLD[2]); p.line(x, 7, x, 20, "#fffbe0"); }
    p.outline();
    for (const x of [5, 12, 19]) { p.line(x - 3, 21, x + 3, 21, GOLD[2]); p.spark(x, 21, 1, "#fffbe0"); }
  },

  // ===== Ninja: Shadow =====
  n_step: (p) => {
    p.figure(6, 20, ["#0a0614", "#1d1240", "#2a1a5a", "#4a3a7a"]);
    p.figure(11, 20, ["#140b2b", "#2a1a6a", "#4a33a0", "#6a55c0"]);
    p.figure(17, 20, SHAD);
    p.outline("#05030a");
    p.line(17, 9, 21, 9, CLOTH_R[2]); p.px(16, 9, "#ffffff");
    p.px(2, 12, SHAD[3]); p.px(3, 16, SHAD[2]);
  },
  n_smoke: (p) => {
    p.disc(6, 9, 4, "#5a5470"); p.disc(15, 7, 5, "#6f6a88"); p.disc(18, 13, 3.5, "#5a5470"); p.disc(11, 11, 3.5, "#8a85a3");
    p.ball(10, 17, 4.5, ["#111018", "#2d2b3a", "#4a4860", "#8a88a0"]);
    p.line(13, 13, 15, 11, LEATHER[2]);
    p.outline();
    p.spark(15, 11, 1, "#ff9f1c", "#fff176");
    p.px(14, 7, "#b8b3cf"); p.px(5, 7, "#a19cbb");
  },
  n_swift: (p) => {
    p.poly([[5, 17], [10, 17], [12, 14], [13, 9], [16, 9], [17, 15], [20, 18], [19, 20], [5, 20]], SHAD[1]);
    p.poly([[13, 9], [16, 9], [16, 13], [13, 13]], SHAD[2]);
    p.line(5, 20, 19, 20, OUT); p.line(6, 18, 12, 18, SHAD[3]);
    p.outline();
    for (const [y, l] of [[8, 6], [12, 8], [16, 3]]) p.line(2, y, 2 + l, y, WIND[3]);
  },
  n_assassinate: (p) => {
    // a dagger plunging down out of the dark, red eyes watching
    p.sword(19, 3, 7, 19, ["#2a3044", "#5a6580", "#b0bccf", "#ffffff"], IRON, { grip: 3 });
    p.outline();
    p.rect(3, 4, 3, 1, "#ff2d55"); p.rect(8, 4, 3, 1, "#ff2d55"); p.px(4, 4, "#ffd0d8"); p.px(9, 4, "#ffd0d8");
    p.px(6, 20, CLOTH_R[2]); p.px(4, 22, CLOTH_R[2]); p.px(8, 22, CLOTH_R[1]); p.px(5, 17, CLOTH_R[2]);
    p.ring(7, 19, 4, SHAD[3], Math.PI * 0.1, Math.PI * 0.9);
  },
  n_cuts: (p) => {
    const cuts = [[3, 5, 20, 19], [4, 18, 19, 4], [11, 2, 13, 22], [2, 11, 22, 13], [6, 3, 17, 21], [3, 15, 21, 8]];
    cuts.forEach(([a, b, c, d], i) => p.line(a, b, c, d, i % 2 ? SHAD[3] : "#eef3fb"));
    p.outline("#05030a");
    p.spark(12, 12, 3, "#c4b5ff", "#ffffff"); p.px(20, 19, CLOTH_R[2]); p.px(4, 18, CLOTH_R[2]);
  },
  // ===== Ninja: Steel =====
  n_shuriken: (p) => {
    const c = 12, r = 9;
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 - Math.PI / 4, b = a + Math.PI / 2;
      p.poly([[c + Math.cos(a) * r, c + Math.sin(a) * r], [c + Math.cos(a + 0.7) * 3, c + Math.sin(a + 0.7) * 3], [c, c], [c + Math.cos(a - 0.6) * 3, c + Math.sin(a - 0.6) * 3]], k % 2 ? STEEL[1] : STEEL[2]);
      void b;
    }
    p.disc(12, 12, 1.2, OUT);
    p.outline();
    p.ring(12, 12, 10, STEEL[3], Math.PI * 1.1, Math.PI * 1.5);
    p.px(c + 6, c - 6, "#ffffff");
  },
  n_flurry: (p) => {
    // one blade and its blurred afterimages
    p.sword(5, 20, 14, 3, ["#140b2b", "#2a1a6a", "#4a33a0", "#6a55c0"], SHAD, { grip: 3 });
    p.sword(7, 21, 18, 4, ["#2a3044", "#5a6580", "#8a95b0", "#b0bccf"], IRON, { grip: 3 });
    p.sword(9, 22, 22, 6, STEEL, GOLD, { grip: 3 });
    p.outline();
    for (const [x, y] of [[3, 10], [2, 14], [4, 6]]) p.line(x, y, x + 3, y - 2, "#eef3fb");
    p.px(20, 13, CLOTH_R[2]); p.px(21, 15, CLOTH_R[2]);
  },
  n_parry: (p) => {
    p.ring(12, 12, 9, SHAD[2], Math.PI * 0.6, Math.PI * 1.4); p.ring(12, 12, 8, SHAD[3], Math.PI * 0.65, Math.PI * 1.35);
    p.ring(12, 12, 7, SHAD[1], Math.PI * 0.7, Math.PI * 1.3);
    p.sword(18, 19, 8, 4, STEEL, IRON, { grip: 3 });
    p.outline("#05030a");
    p.spark(10, 7, 3, "#c4b5ff", "#ffffff");
    p.line(20, 6, 22, 4, "#eef3fb"); p.line(21, 9, 23, 8, "#eef3fb");
  },
  n_vital: (p) => {
    p.ring(12, 12, 8, BLOOD[2]); p.ring(12, 12, 7, BLOOD[1]);
    p.ring(12, 12, 4, BLOOD[2]);
    p.line(12, 1, 12, 7, BLOOD[3]); p.line(12, 17, 12, 22, BLOOD[3]); p.line(1, 12, 7, 12, BLOOD[3]); p.line(17, 12, 22, 12, BLOOD[3]);
    p.outline();
    p.disc(12, 12, 1.5, "#ffffff"); p.px(12, 12, "#ff2d55");
  },
  n_storm: (p) => {
    p.ring(12, 12, 4, SHAD[2]); p.ring(12, 12, 2, SHAD[3]); p.disc(12, 12, 1, "#ffffff");
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      const x0 = 12 + Math.cos(a) * 5, y0 = 12 + Math.sin(a) * 5;
      const x1 = 12 + Math.cos(a + 0.9) * 10, y1 = 12 + Math.sin(a + 0.9) * 10;
      p.line(x0, y0, x1, y1, STEEL[2]); p.line(x0 + 0.5, y0 + 0.5, x1, y1, STEEL[3]);
      p.px(x0, y0, GOLD[1]);
    }
    p.outline();
    p.ring(12, 12, 11, "#eef3fb", 0, 0.8); p.ring(12, 12, 11, "#eef3fb", Math.PI, Math.PI + 0.8);
  },
  // ===== Ninja: Spirit =====
  n_flame: (p) => {
    // hand sign at left, cone of fire to the right
    p.poly([[7, 12], [22, 4], [23, 20]], FIRE[0]);
    p.poly([[8, 12], [21, 6], [22, 18]], FIRE[1]);
    p.poly([[9, 12], [19, 8], [20, 16]], FIRE[2]);
    p.poly([[10, 12], [16, 10], [16, 14]], FIRE[3]);
    p.ball(5, 12, 4, ["#4a0d12", "#a4161a", "#e5383b", "#ff8f8f"]); p.ring(5, 12, 2, "#ffd166"); p.px(5, 12, "#ffd166");
    p.outline();
    p.px(21, 3, "#fff176"); p.px(22, 21, "#ff9f1c"); p.px(18, 11, "#ffffff");
  },
  n_poison: (p) => {
    p.sword(4, 20, 18, 4, ["#2a4a2a", "#4a7a4a", "#9ac89a", "#e6ffb3"], IRON, { grip: 3 });
    p.outline();
    p.line(14, 9, 14, 11, POIS[2]);
    for (const [x, y] of [[15, 13], [11, 16]]) { p.disc(x, y, 1, POIS[2], 1.5); p.px(x, y - 1, POIS[3]); }
    p.disc(17, 20, 3, POIS[1], 1); p.px(16, 20, POIS[2]); p.px(19, 19, POIS[3]);
  },
  n_caltrops: (p) => {
    const cal = (x: number, y: number) => {
      p.line(x - 3, y + 2, x, y, IRON[2]); p.line(x + 3, y + 2, x, y, IRON[2]); p.line(x, y - 4, x, y, IRON[3]); p.line(x, y, x, y + 3, IRON[1]);
      p.px(x, y - 4, "#eef3fb");
    };
    p.disc(12, 19, 10, EARTH[0], 3);
    cal(6, 16); cal(16, 15); cal(11, 11); cal(19, 9); cal(5, 8);
    p.outline();
    p.px(13, 21, CLOTH_R[2]);
  },
  n_lightning: (p) => {
    p.bolt([[3, 4], [8, 10], [6, 12], [12, 15], [10, 17], [15, 20]]);
    p.line(12, 15, 19, 8, LIT[2]); p.line(15, 20, 21, 18, LIT[2]);
    p.ball(19, 7, 2, ARC); p.ball(21, 18, 2, ARC); p.ball(15, 20, 2, ARC);
    p.outline();
    p.spark(3, 4, 2, "#ffffff");
  },
  n_dragon: (p) => {
    // fire dragon: serpent body coiling up from bottom left, head roaring to the right
    for (let i = 0; i <= 14; i++) { const t = i / 14; p.disc(3 + t * 8, 21 - Math.sin(t * 3.2) * 4 - t * 6, 2.4 - t * 0.6, i % 3 ? FIRE[1] : FIRE[0]); }
    p.poly([[8, 9], [13, 5], [19, 6], [23, 9], [17, 10], [13, 11]], FIRE[2]);
    p.poly([[13, 11], [18, 11], [22, 15], [17, 14], [11, 15]], FIRE[1]);
    p.poly([[9, 8], [13, 6], [17, 7], [13, 9]], FIRE[3]);
    p.line(10, 6, 6, 1, FIRE[2]); p.line(12, 5, 10, 0, FIRE[2]); p.line(9, 9, 4, 6, FIRE[1]);
    p.outline();
    p.rect(14, 7, 2, 1, "#ffffff"); p.px(15, 7, OUT);
    for (const x of [16, 18, 20]) { p.px(x, 10, "#ffffff"); p.px(x - 1, 12, "#ffffff"); }
    p.line(22, 9, 23, 6, FIRE[3]); p.line(21, 15, 23, 18, FIRE[2]);
    p.px(2, 13, "#fff176"); p.px(6, 13, "#ff9f1c");
  },
  // ===== Wizard: Fire =====
  w_wave: (p) => {
    p.poly([[1, 21], [4, 14], [9, 8], [15, 5], [20, 6], [22, 10], [18, 9], [15, 11], [16, 14], [12, 13], [9, 17], [23, 21]], FIRE[1]);
    p.poly([[4, 18], [8, 12], [13, 8], [18, 7], [21, 9], [17, 8], [13, 11], [9, 15]], FIRE[2]);
    p.line(14, 6, 19, 6, FIRE[3]);
    p.rect(1, 20, 22, 2, FIRE[0]);
    p.outline();
    p.px(22, 10, "#fff176"); p.px(5, 12, "#fff176"); p.px(19, 17, "#ff9f1c");
  },
  w_pyro: (p) => {
    // open spellbook with a flame
    p.poly([[2, 15], [11, 17], [11, 22], [2, 20]], ["#5a189a"][0]); p.poly([[13, 17], [22, 15], [22, 20], [13, 22]], "#7b2cbf");
    p.poly([[3, 14], [11, 16], [11, 20], [3, 19]], BONE[2]); p.poly([[13, 16], [21, 14], [21, 19], [13, 20]], BONE[3]);
    p.line(5, 16, 9, 17, BONE[1]); p.line(15, 17, 19, 16, BONE[1]);
    p.flame(12, 15, 13, 8);
    p.outline();
    p.px(8, 4, "#fff176"); p.px(17, 6, "#ff9f1c");
  },
  w_firewall: (p) => {
    for (const [x, h] of [[4, 12], [9, 16], [14, 14], [19, 17]]) p.flame(x, 18, h, 6, FIRE, (x % 2) - 0.5);
    for (let x = 1; x < 23; x += 4) { p.rect(x, 18, 3, 2, EARTH[2]); p.rect(x + 2, 20, 3, 2, EARTH[1]); }
    p.outline();
    p.px(9, 2, "#fff176"); p.px(18, 3, "#fff176");
  },
  w_orb: (p) => {
    p.disc(12, 12, 8, FIRE[0]); p.disc(12, 12, 7, FIRE[1]); p.disc(11, 11, 5, FIRE[2]); p.disc(10, 10, 3, FIRE[3]); p.disc(9, 9, 1, "#ffffff");
    p.ring(12, 12, 5.5, FIRE[1], 0.3, 2.2);
    p.outline();
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + 0.4; p.line(12 + Math.cos(a) * 10, 12 + Math.sin(a) * 10, 12 + Math.cos(a) * 11.5, 12 + Math.sin(a) * 11.5, FIRE[3]); }
  },
  w_meteor: (p) => {
    p.thick(3, 3, 13, 13, 3, FIRE[1]); p.thick(5, 3, 14, 12, 2, FIRE[2]); p.line(2, 6, 12, 15, FIRE[0]);
    p.ball(16, 16, 5, ["#2b1a14", "#5d4037", "#8d6e63", "#ffb347"]);
    p.px(15, 17, "#ff9f1c"); p.px(18, 15, "#ff9f1c"); p.line(14, 19, 17, 19, "#e63946");
    p.outline();
    p.px(2, 2, "#fff176"); p.px(6, 1, "#ff9f1c"); p.px(1, 8, "#ff9f1c"); p.spark(12, 10, 1, "#fff176");
  },
  // ===== Wizard: Frost =====
  w_nova: (p) => {
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, r = k % 2 ? 7 : 10;
      p.poly([[12 + Math.cos(a) * r, 12 + Math.sin(a) * r], [12 + Math.cos(a + 0.35) * 3, 12 + Math.sin(a + 0.35) * 3], [12 + Math.cos(a - 0.35) * 3, 12 + Math.sin(a - 0.35) * 3]], k % 2 ? ICE[1] : ICE[2]);
    }
    p.disc(12, 12, 2.5, ICE[3]);
    p.outline();
    p.disc(12, 12, 1, "#ffffff"); p.px(22, 12, "#ffffff"); p.px(12, 2, "#ffffff");
  },
  w_shards: (p) => {
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 - 0.9 + k * 0.45 + 0.45;
      const x0 = 5 + Math.cos(a) * 4, y0 = 20 + Math.sin(a) * 4, x1 = 5 + Math.cos(a) * 19, y1 = 20 + Math.sin(a) * 19;
      const nx = -Math.sin(a), ny = Math.cos(a);
      p.poly([[x1, y1], [x0 + nx * 1.5, y0 + ny * 1.5], [x0 - nx * 1.5, y0 - ny * 1.5]], ICE[2]);
      p.line(x0, y0, x1, y1, ICE[3]);
    }
    p.outline();
    p.spark(5, 20, 2, "#d6f6ff");
  },
  w_armor: (p) => {
    p.poly([[5, 4], [19, 4], [20, 12], [17, 21], [7, 21], [4, 12]], ICE[1]);
    p.poly([[5, 4], [12, 4], [12, 21], [7, 21], [4, 12]], ICE[2]);
    p.line(5, 9, 12, 13, ICE[3]); p.line(19, 9, 12, 13, ICE[0]); p.line(12, 4, 12, 21, ICE[3]);
    for (const [x, y] of [[3, 3], [21, 3], [2, 13], [22, 13]]) p.poly([[x, y - 3], [x + 1, y], [x, y + 1], [x - 1, y]], ICE[3]);
    p.outline();
    p.px(8, 7, "#ffffff"); p.px(16, 16, "#ffffff");
  },
  w_mirror: (p) => {
    p.poly([[12, 2], [20, 7], [20, 17], [12, 22], [4, 17], [4, 7]], ICE[2]);
    p.poly([[12, 4], [18, 8], [18, 16], [12, 20], [6, 16], [6, 8]], "#bdefff");
    p.line(8, 9, 15, 16, "#ffffff"); p.line(8, 12, 12, 16, "#ffffff"); p.line(16, 9, 17, 10, "#ffffff");
    p.figure(12, 18, ["#6aa6d6", "#8cc6ee", "#a6dcff", "#d6f6ff"], 10);
    p.outline();
    p.spark(19, 5, 2, "#ffffff");
  },
  w_blizzard: (p) => {
    p.cloud(12, 5, 20, ["#4a5a7a", "#8a9ab8", "#c6d4ea", "#ffffff"]);
    p.outline();
    for (const [x, y] of [[5, 12], [12, 15], [18, 11], [8, 19], [16, 20], [20, 17], [3, 18]]) { p.spark(x, y, 1, ICE[3], "#ffffff"); }
    for (const [x, y] of [[9, 11], [14, 18], [21, 21]]) p.line(x, y, x - 2, y + 2, ICE[2]);
  },
  w_frozenorb: (p) => {
    // an ice orb flying right, trailing frost, with small blasts of ice bursting off its path
    for (const [x, y] of [[5, 7], [4, 17]]) { p.spark(x, y, 2, ICE[2], "#ffffff"); }
    p.thick(2, 12, 11, 12, 3, ICE[1]); p.line(3, 12, 11, 12, ICE[2]);
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3, c = Math.cos(a), s = Math.sin(a);
      p.poly([[15 + c * 9, 12 + s * 9], [15 - s * 1.6, 12 + c * 1.6], [15 + s * 1.6, 12 - c * 1.6]], ICE[2]);
    }
    p.ball(15, 12, 5, ICE);
    p.outline();
    p.disc(13, 10, 1.5, "#ffffff");
  },
  // ===== Wizard: Storm =====
  w_missiles: (p) => {
    for (const [y, x] of [[6, 18], [12, 21], [18, 18]]) {
      p.line(2, y + (y - 12) * 0.3, x - 3, y, ARC[1]); p.line(4, y + (y - 12) * 0.2, x - 3, y, ARC[2]);
      p.ball(x, y, 2.5, ARC);
    }
    p.outline();
    for (const [y, x] of [[6, 18], [12, 21], [18, 18]]) p.px(x - 1, y - 1, "#ffffff");
  },
  w_blink: (p) => {
    p.ring(16, 12, 6, ARC[2], 0, Math.PI * 2, 9); p.ring(16, 12, 5, ARC[1], 0, Math.PI * 2, 8);
    p.disc(16, 12, 3.5, ARC[0], 7);
    p.figure(16, 19, ["#7b2cbf", "#c77dff", "#e0b0ff", "#ffffff"], 11);
    p.outline();
    for (const [x, y] of [[2, 14], [5, 13], [8, 13]]) p.px(x, y, ARC[3]);
    p.spark(6, 5, 2, "#e0b0ff"); p.px(22, 4, "#ffffff");
  },
  w_static: (p) => {
    p.ball(12, 12, 5, ["#283593", "#5c6bc0", "#9fa8da", "#ffffff"]);
    p.bolt([[12, 7], [9, 4], [10, 2]]); p.bolt([[16, 10], [19, 8], [21, 9]]); p.bolt([[14, 17], [17, 20], [16, 22]]); p.bolt([[8, 14], [4, 15], [3, 18]]);
    p.outline();
    p.disc(11, 11, 1.5, "#ffffff"); p.px(10, 2, "#ffffff"); p.px(21, 9, "#ffffff"); p.px(3, 18, "#ffffff");
  },
  w_flow: (p) => {
    // hourglass with arcane sand
    p.rect(5, 2, 14, 2, WOOD[2]); p.rect(5, 20, 14, 2, WOOD[1]);
    p.line(6, 4, 6, 19, WOOD[1]); p.line(17, 4, 17, 19, WOOD[1]);
    p.poly([[8, 4], [16, 4], [13, 11], [11, 11]], "#3d2a5a"); p.poly([[11, 13], [13, 13], [16, 19], [8, 19]], "#3d2a5a");
    p.poly([[9, 5], [15, 5], [13, 9], [11, 9]], ARC[2]); p.poly([[10, 16], [14, 16], [15, 19], [9, 19]], ARC[2]);
    p.line(12, 10, 12, 16, ARC[3]);
    p.outline();
    p.px(9, 6, "#ffffff"); p.spark(20, 11, 1, ARC[3]); p.spark(3, 13, 1, ARC[3]);
  },
  w_storm: (p) => {
    p.cloud(12, 5, 20, ["#1a1f3a", "#353d66", "#56609a", "#8a94c8"]);
    p.bolt([[13, 8], [9, 13], [13, 13], [8, 21]]);
    p.outline();
    p.spark(8, 21, 2, "#ffffff"); p.bolt([[19, 9], [21, 13]]); p.px(5, 10, LIT[2]);
  },

  // ===== Archer: Marksman =====
  a_volley: (p) => {
    for (const o of [-5, 0, 5]) p.arrow(4 + o, 20 + o, 19 + o, 5 + o);
    p.outline();
    for (const o of [-5, 0, 5]) p.px(20 + o, 4 + o, "#ffffff");
  },
  a_power: (p) => {
    p.ring(14, 12, 9, WOOD[1], Math.PI * 0.55, Math.PI * 1.45, 10); p.ring(15, 12, 9, WOOD[2], Math.PI * 0.6, Math.PI * 1.4, 10);
    p.line(12, 2, 4, 12, "#dfe6f0"); p.line(4, 12, 12, 22, "#dfe6f0");
    p.arrow(4, 12, 22, 12, WIND, WOOD, WIND[2]);
    p.outline();
    p.line(13, 11, 19, 11, WIND[3]); p.spark(22, 12, 2, "#ffffff", "#e8fff4"); p.px(17, 9, WIND[3]); p.px(18, 15, WIND[3]);
  },
  a_aim: (p) => {
    p.disc(12, 12, 9, CLOTH_R[1]); p.disc(12, 12, 7, BONE[3]); p.disc(12, 12, 5, CLOTH_R[1]); p.disc(12, 12, 3, BONE[3]); p.disc(12, 12, 1.4, CLOTH_R[2]);
    p.outline();
    p.line(12, 0, 12, 6, "#7cfc00"); p.line(12, 18, 12, 23, "#7cfc00"); p.line(0, 12, 6, 12, "#7cfc00"); p.line(18, 12, 23, 12, "#7cfc00");
  },
  a_fan: (p) => {
    for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 - 0.45 + k * 0.33; p.arrow(4 + Math.cos(a) * 6, 21 + Math.sin(a) * 6, 4 + Math.cos(a) * 19, 21 + Math.sin(a) * 19, STEEL, WOOD, "#ffd166"); }
    p.outline();
    p.spark(5, 21, 2, "#fff3b0");
  },
  a_rain: (p) => {
    p.rect(1, 20, 22, 3, EARTH[1]); p.line(1, 20, 22, 20, EARTH[2]);
    for (const [x, y] of [[5, 9], [10, 17], [15, 7], [19, 15]]) p.arrow(x, y - 8, x, y + 2, STEEL, WOOD, "#e5383b");
    p.outline();
    for (const x of [6, 13, 19]) p.px(x, 21, EARTH[3]);
  },
  // ===== Archer: Trapper =====
  a_beartrap: (p) => {
    p.disc(12, 17, 10, IRON[0], 3.5); p.ring(12, 17, 9, IRON[2], 0, Math.PI * 2, 3);
    for (let i = 0; i < 6; i++) { const x = 5 + i * 3; p.poly([[x - 1, 12], [x + 1, 12], [x, 8]], STEEL[2]); p.px(x, 8, STEEL[3]); }
    p.line(3, 13, 21, 13, IRON[2]); p.line(3, 14, 21, 14, IRON[1]);
    p.disc(12, 17, 2, IRON[3], 1.2);
    p.outline();
    p.thick(20, 19, 23, 22, 1, IRON[2]); p.px(10, 8, "#ffffff");
  },
  a_reflex: (p) => {
    p.ring(12, 12, 8, WIND[2], Math.PI * 0.2, Math.PI * 1.75); p.ring(12, 12, 7, WIND[1], Math.PI * 0.25, Math.PI * 1.7);
    p.poly([[18, 3], [22, 6], [17, 8]], WIND[3]);
    for (const o of [-3, 0, 3]) p.arrow(9, 12 + o, 2, 12 + o, STEEL, WOOD, WIND[2]);
    p.outline();
    p.px(13, 4, "#ffffff"); p.px(20, 15, WIND[3]);
  },
  a_explosive: (p) => {
    p.disc(12, 18, 9, EARTH[1], 3.5); p.disc(12, 17, 7, EARTH[2], 2.5);
    p.ball(12, 14, 4, IRON);
    p.flame(12, 12, 11, 12, FIRE);
    p.outline();
    p.disc(12, 15, 1, "#ff2d55"); p.spark(5, 6, 1, "#fff176"); p.spark(19, 5, 1, "#ff9f1c");
  },
  a_net: (p) => {
    for (let i = 0; i <= 4; i++) { p.line(3 + i * 4, 3, 12, 21, BONE[2]); p.line(3, 3 + i * 2.5, 21, 3 + i * 2.5, BONE[1]); }
    p.poly([[3, 3], [21, 3], [12, 21]], "");
    p.ball(3, 3, 1.5, IRON); p.ball(21, 3, 1.5, IRON); p.ball(12, 21, 1.5, IRON);
    p.outline();
    p.px(12, 3, NAT[3]); p.px(8, 10, NAT[3]); p.px(16, 10, NAT[3]);
  },
  a_sentry: (p) => {
    p.rect(8, 6, 8, 16, WOOD[1]); p.rect(8, 6, 3, 16, WOOD[2]); p.line(8, 6, 15, 6, WOOD[3]);
    p.poly([[6, 6], [12, 2], [18, 6]], NAT[1]); p.line(6, 6, 12, 2, NAT[3]);
    p.rect(9, 13, 6, 1, WOOD[0]); p.rect(9, 17, 6, 1, WOOD[0]); p.rect(10, 19, 1, 2, NAT[2]); p.rect(13, 19, 1, 2, NAT[2]);
    p.disc(12, 9, 2, OUT);
    p.outline();
    p.disc(12, 9, 1, "#d4ff8a"); p.line(14, 9, 22, 9, NAT[3]); p.px(22, 9, "#ffffff");
  },
  // ===== Archer: Nature =====
  a_firearrows: (p) => {
    p.arrow(3, 21, 16, 8, IRON, WOOD, "#ffd166");
    p.flame(17, 9, 10, 7, FIRE, 0.6);
    p.outline();
    p.px(21, 2, "#fff176"); p.px(14, 3, "#ff9f1c");
  },
  a_frostarrow: (p) => {
    p.arrow(3, 21, 16, 8, ICE, WOOD, ICE[2]);
    p.poly([[20, 4], [17, 6], [14, 9], [16, 12], [19, 9]], ICE[2]); p.line(20, 4, 15, 10, ICE[3]);
    p.outline();
    p.spark(20, 4, 2, "#ffffff", "#ffffff"); p.px(8, 14, ICE[3]); p.px(5, 18, ICE[3]);
  },
  a_windwalk: (p) => {
    p.ring(12, 12, 9, WIND[2], Math.PI * 0.9, Math.PI * 2.3); p.ring(12, 12, 6, WIND[3], Math.PI * 1.4, Math.PI * 2.7);
    p.ring(12, 12, 3, WIND[2], Math.PI * 1.9, Math.PI * 3.1);
    for (const [x, y] of [[4, 8], [18, 17], [8, 19]]) { p.poly([[x, y], [x + 3, y - 2], [x + 4, y + 1], [x + 1, y + 2]], NAT[2]); p.line(x, y, x + 4, y + 1, NAT[1]); }
    p.outline();
    p.px(21, 12, "#ffffff"); p.px(12, 3, "#ffffff");
  },
  a_feast: (p) => {
    p.ball(10, 10, 6, ["#5a2a14", "#9c4a20", "#c8703a", "#f0a868"]);
    p.thick(14, 14, 19, 19, 2, BONE[2]); p.disc(20, 19, 1.5, BONE[3]); p.disc(19, 20, 1.5, BONE[3]);
    p.outline();
    // small green heart: lifesteal
    p.rect(17, 3, 2, 2, "#7cfc00"); p.rect(20, 3, 2, 2, "#7cfc00"); p.rect(17, 5, 5, 1, "#7cfc00"); p.rect(18, 6, 3, 1, "#7cfc00"); p.px(19, 7, "#7cfc00"); p.px(17, 3, "#e6ffb3");
  },
  a_phoenix: (p) => {
    // spread wings, flame body, tail
    p.poly([[12, 8], [2, 3], [4, 8], [1, 9], [5, 12], [3, 14], [10, 14]], FIRE[1]);
    p.poly([[12, 8], [22, 3], [20, 8], [23, 9], [19, 12], [21, 14], [14, 14]], FIRE[1]);
    p.poly([[12, 8], [4, 5], [7, 10], [10, 12]], FIRE[2]); p.poly([[12, 8], [20, 5], [17, 10], [14, 12]], FIRE[2]);
    p.poly([[10, 13], [14, 13], [15, 18], [12, 22], [9, 18]], FIRE[0]); p.line(12, 14, 12, 21, FIRE[2]);
    p.ball(12, 8, 2, ["#b35c00", "#ff9f1c", "#fff176", "#ffffff"]);
    p.outline();
    p.px(13, 7, OUT); p.px(14, 8, "#ffd166"); p.px(12, 23, "#ff9f1c"); p.spark(3, 3, 1, "#fff176"); p.spark(21, 3, 1, "#fff176");
  },

  // ===== Barbarian: Fury =====
  b_rage: (p) => {
    // furious face: brow, glowing eyes, fangs
    p.poly([[5, 6], [19, 6], [20, 15], [16, 21], [8, 21], [4, 15]], SKIN[1]);
    p.poly([[5, 6], [12, 6], [12, 21], [8, 21], [4, 15]], SKIN[2]);
    p.poly([[4, 7], [11, 11], [11, 9], [5, 5]], "#4a2a14"); p.poly([[20, 7], [13, 11], [13, 9], [19, 5]], "#4a2a14");
    p.rect(7, 16, 10, 3, OUT); p.poly([[8, 16], [9, 16], [8.5, 18]], "#ffffff"); p.poly([[15, 16], [16, 16], [15.5, 18]], "#ffffff");
    p.outline();
    p.rect(7, 11, 3, 1, "#ff2d2d"); p.rect(14, 11, 3, 1, "#ff2d2d"); p.px(8, 11, "#ffff80"); p.px(15, 11, "#ffff80");
    for (const [x, y] of [[3, 3], [21, 3], [12, 2]]) p.line(x, y, x, y - 2, BLOOD[2]);
  },
  b_cleave: (p) => {
    p.ring(12, 14, 10, BLOOD[2], Math.PI * 1.05, Math.PI * 1.95, 8); p.ring(12, 14, 9, BLOOD[1], Math.PI * 1.1, Math.PI * 1.9, 7);
    p.axe(5, 21, 16, 8, 1, STEEL);
    p.outline();
    p.ring(12, 14, 11, BLOOD[3], Math.PI * 1.3, Math.PI * 1.7, 9);
    p.px(20, 10, BLOOD[2]); p.px(22, 13, BLOOD[1]);
  },
  b_bloodthirst: (p) => {
    p.poly([[12, 2], [18, 12], [18, 16], [15, 20], [9, 20], [6, 16], [6, 12]], BLOOD[1]);
    p.poly([[12, 2], [12, 20], [9, 20], [6, 16], [6, 12]], BLOOD[2]);
    p.line(9, 12, 9, 15, BLOOD[3]);
    p.outline();
    p.poly([[7, 21], [9, 21], [8, 23]], "#ffffff"); p.poly([[15, 21], [17, 21], [16, 23]], "#ffffff");
    p.px(9, 10, "#ffffff");
  },
  b_berserk: (p) => {
    p.disc(12, 12, 10, BLOOD[0]); p.disc(12, 12, 8, "#6d0000");
    p.axe(4, 21, 15, 6, 1, STEEL); p.axe(20, 21, 9, 6, -1, STEEL);
    p.outline();
    for (const [x, y] of [[2, 6], [22, 6], [12, 1], [3, 13], [21, 13]]) p.spark(x, y, 1, BLOOD[2], BLOOD[3]);
  },
  b_whirlwind: (p) => {
    // a funnel of red wind with blades flashing in it
    for (let j = 0; j < 18; j++) { const w = 10 - j * 0.45, y = 3 + j, x = 12 + Math.sin(j * 0.5) * 1.5; p.line(x - w, y, x + w, y, j % 4 < 2 ? BLOOD[1] : BLOOD[0]); }
    for (let j = 0; j < 18; j += 4) { const w = 10 - j * 0.45, x = 12 + Math.sin(j * 0.5) * 1.5; p.line(x - w + 1, 3 + j, x + w - 3, 3 + j + 1, BLOOD[2]); }
    p.outline();
    for (const [x0, y0, x1, y1] of [[4, 4, 9, 6], [15, 8, 20, 6], [7, 13, 12, 15], [13, 18, 16, 17]]) p.line(x0, y0, x1, y1, "#eef3fb");
    p.px(9, 6, "#ffffff"); p.px(20, 6, "#ffffff");
  },
  // ===== Barbarian: Warcry =====
  b_battlecry: (p) => {
    // horned helm, open mouth guard, shout waves
    p.poly([[7, 7], [17, 7], [18, 15], [16, 19], [8, 19], [6, 15]], IRON[2]);
    p.poly([[7, 7], [12, 7], [12, 19], [8, 19], [6, 15]], IRON[3]);
    p.poly([[7, 9], [3, 7], [2, 2], [5, 6], [8, 7]], BONE[2]); p.poly([[17, 9], [21, 7], [22, 2], [19, 6], [16, 7]], BONE[2]);
    p.rect(8, 11, 8, 2, OUT); p.disc(12, 16, 2, OUT, 1.5);
    p.outline();
    for (const r of [3, 5]) p.ring(12, 16, r + 4, SPIRIT[2], Math.PI * 0.3, Math.PI * 0.7);
    p.px(2, 2, BONE[3]); p.px(22, 2, BONE[3]);
  },
  b_howl: (p) => {
    // wolf head in profile, muzzle raised to the moon
    const F: Ramp = ["#2e3240", "#555c70", "#7d8598", "#b4bccb"];
    p.poly([[5, 23], [4, 15], [6, 10], [10, 8], [14, 4], [19, 1], [20, 3], [16, 8], [17, 11], [13, 13], [13, 23]], F[1]);
    p.poly([[6, 10], [10, 8], [14, 4], [19, 1], [17, 4], [12, 9]], F[2]);
    p.poly([[6, 11], [5, 4], [9, 9]], F[1]); p.poly([[6, 9], [6, 6], [8, 9]], F[3]);
    p.line(16, 8, 19, 6, OUT); p.line(13, 13, 16, 9, F[0]);
    p.poly([[5, 23], [4, 16], [8, 18], [9, 23]], F[0]);
    p.outline();
    p.px(11, 9, SPIRIT[3]); p.px(19, 1, OUT);
    for (const r of [3, 5]) p.ring(19, 6, r, SPIRIT[2], -Math.PI * 0.2, Math.PI * 0.35);
    p.disc(20, 17, 2, "#e8f0ff"); p.px(19, 16, "#ffffff");
  },
  b_retaliate: (p) => {
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; p.poly([[12 + Math.cos(a) * 11, 12 + Math.sin(a) * 11], [12 + Math.cos(a + 0.3) * 6, 12 + Math.sin(a + 0.3) * 6], [12 + Math.cos(a - 0.3) * 6, 12 + Math.sin(a - 0.3) * 6]], BLOOD[2]); }
    // clenched gauntlet
    p.rect(7, 7, 10, 10, IRON[2]); p.rect(7, 7, 10, 3, IRON[3]);
    for (let i = 0; i < 4; i++) p.line(8 + i * 2.5, 7, 8 + i * 2.5, 10, IRON[1]);
    p.rect(9, 17, 6, 3, LEATHER[2]);
    p.outline();
    p.px(9, 8, "#ffffff");
  },
  b_drums: (p) => {
    p.disc(12, 8, 8, LEATHER[0], 3); p.rect(4, 8, 16, 10, WOOD[1]); p.rect(4, 8, 6, 10, WOOD[2]);
    p.disc(12, 18, 8, WOOD[0], 2.5); p.disc(12, 8, 7, BONE[2], 2.4);
    for (let i = 0; i < 5; i++) { p.line(4 + i * 4, 9, 6 + i * 4, 17, BONE[1]); }
    p.line(2, 1, 9, 7, WOOD[2]); p.line(22, 1, 15, 7, WOOD[2]); p.ball(2, 1, 1, BONE); p.ball(22, 1, 1, BONE);
    p.outline();
    p.spark(12, 7, 2, SPIRIT[3]);
  },
  b_ancestors: (p) => {
    // ghostly horned skull
    p.ball(12, 10, 7, ["#0d4d4a", "#4dd0e1", "#b2ebf2", "#ffffff"], 7);
    p.rect(9, 16, 6, 4, SPIRIT[2]); p.line(10, 17, 10, 19, SPIRIT[0]); p.line(12, 17, 12, 19, SPIRIT[0]); p.line(14, 17, 14, 19, SPIRIT[0]);
    p.poly([[6, 8], [2, 6], [1, 1], [4, 5], [7, 6]], BONE[2]); p.poly([[18, 8], [22, 6], [23, 1], [20, 5], [17, 6]], BONE[2]);
    p.disc(9, 11, 1.6, SPIRIT[0]); p.disc(15, 11, 1.6, SPIRIT[0]); p.poly([[11, 14], [13, 14], [12, 12]], SPIRIT[0]);
    p.outline("#031415");
    p.px(9, 11, "#d0fbff"); p.px(15, 11, "#d0fbff");
    for (const [x, y] of [[3, 15], [21, 14], [5, 21], [19, 21]]) p.line(x, y, x, y + 2, SPIRIT[2]);
  },
  // ===== Barbarian: Earth =====
  b_slam: (p) => {
    p.poly([[1, 18], [23, 18], [23, 23], [1, 23]], EARTH[1]); p.line(1, 18, 23, 18, EARTH[2]);
    p.line(12, 18, 7, 22, OUT); p.line(12, 18, 17, 23, OUT); p.line(12, 18, 12, 23, OUT);
    // fist
    p.rect(7, 7, 10, 10, SKIN[1]); p.rect(7, 7, 10, 3, SKIN[2]);
    for (let i = 0; i < 4; i++) p.line(8 + i * 2.5, 13, 8 + i * 2.5, 16, SKIN[0]);
    p.rect(8, 2, 8, 5, LEATHER[1]); p.rect(8, 2, 8, 1, LEATHER[3]);
    p.outline();
    p.ball(3, 14, 1, EARTH); p.ball(21, 13, 1.5, EARTH); p.line(4, 17, 2, 15, EARTH[3]); p.line(20, 17, 22, 15, EARTH[3]);
  },
  b_leap: (p) => {
    // a high dotted arc ending in a crashing impact
    for (let i = 0; i <= 10; i++) { const t = i / 10; p.disc(2 + t * 15, 19 - Math.sin(t * Math.PI) * 15, 0.6 + t * 0.6, i % 2 ? EARTH[3] : "#ffffff"); }
    p.poly([[13, 9], [18, 15], [16, 15], [16, 19], [14, 19], [14, 15]], "");
    p.poly([[8, 21], [23, 21], [23, 23], [8, 23]], EARTH[1]); p.line(8, 21, 23, 21, EARTH[2]);
    p.disc(17, 21, 4, EARTH[0], 1.5);
    p.outline();
    p.spark(17, 18, 3, "#ffd166", "#ffffff");
    for (const [x, y] of [[11, 15], [22, 14], [13, 12], [21, 17]]) p.px(x, y, EARTH[3]);
    p.line(17, 9, 17, 13, "#ffffff"); p.line(15, 11, 17, 13, "#ffffff"); p.line(19, 11, 17, 13, "#ffffff");
  },
  b_thick: (p) => {
    // bear paw print
    p.ball(12, 15, 6, ["#2b1a10", "#5d3a22", "#7a5034", "#a07050"], 5);
    for (const [x, y] of [[5, 8], [9, 5], [15, 5], [19, 8]]) p.ball(x, y, 2, ["#2b1a10", "#5d3a22", "#7a5034", "#a07050"]);
    p.outline();
    for (const [x, y] of [[5, 5], [9, 2], [15, 2], [19, 5]]) p.px(x, y, BONE[3]);
  },
  b_seismic: (p) => {
    p.rect(0, 20, 24, 4, EARTH[1]); p.line(0, 20, 23, 20, EARTH[2]);
    for (const [x, h] of [[3, 4], [8, 7], [13, 10], [19, 15]]) {
      p.poly([[x - 2 - h / 6, 20], [x, 20 - h], [x + 2 + h / 6, 20]], EARTH[1]); p.line(x, 20 - h, x - 2 - h / 6, 20, EARTH[3]);
    }
    p.outline();
    for (const x of [6, 11, 16]) p.px(x, 21, EARTH[0]);
    p.ball(16, 4, 1, EARTH); p.ball(22, 7, 1, EARTH);
  },
  b_avalanche: (p) => {
    p.poly([[0, 22], [9, 6], [13, 11], [17, 4], [24, 22]], "#5a5a6a"); p.poly([[9, 6], [11, 9], [7, 10]], "#ffffff"); p.poly([[17, 4], [19, 7], [15, 8]], "#ffffff");
    p.ball(6, 15, 3, EARTH); p.ball(14, 18, 3.5, EARTH); p.ball(20, 14, 2.5, EARTH);
    p.outline();
    for (const [x, y] of [[3, 12], [11, 14], [18, 11]]) p.line(x, y, x + 2, y - 2, EARTH[3]);
  },
  // ===== Summoner (golems and elements) =====
  // a small golem of the four elements: fire arm, frost arm, a glowing venom heart, storm crown
  su_golem: (p) => {
    p.ball(12, 15, 7, EARTH, 6); p.ball(12, 7, 3.5, EARTH);
    p.ball(5, 15, 2.6, FIRE); p.ball(19, 15, 2.6, ICE);
    p.ball(12, 15, 2.2, POIS); p.flame(12, 5, 4, 3, LIT);
    p.outline();
    p.px(11, 7, "#ffffff"); p.px(13, 7, "#ffffff");
  },
  // four little stones turning around a ring: the element wheel
  su_attune: (p) => {
    p.ring(12, 12, 8, ARC[2]);
    p.ball(12, 4, 2.6, FIRE); p.ball(20, 12, 2.6, ICE); p.ball(12, 20, 2.6, POIS); p.ball(4, 12, 2.6, LIT);
    p.outline();
    p.line(15, 6, 18, 9, ARC[3]); p.line(18, 15, 15, 18, ARC[3]);
  },
  // a heart joined to a golem fist by a living thread
  su_link: (p) => {
    p.ball(7, 9, 4, BLOOD); p.ball(17, 16, 4.5, EARTH);
    for (let i = 0; i < 6; i++) p.disc(9 + i * 1.4, 11 + i, 0.8, i % 2 ? SPIRIT[2] : SPIRIT[3]);
    p.outline();
  },
  su_stonehide: (p) => {
    p.poly([[5, 5], [19, 5], [19, 13], [12, 21], [5, 13]], EARTH[1]);
    p.poly([[7, 7], [17, 7], [17, 12], [12, 18], [7, 12]], EARTH[2]);
    p.line(9, 8, 12, 12, EARTH[0]); p.line(12, 12, 15, 9, EARTH[0]); p.line(12, 12, 12, 16, EARTH[0]);
    p.outline();
  },
  // a breastplate of stone slabs with a violet rune
  su_armour: (p) => {
    p.poly([[4, 6], [10, 4], [12, 6], [14, 4], [20, 6], [19, 18], [12, 22], [5, 18]], EARTH[1]);
    p.poly([[7, 8], [17, 8], [16, 17], [12, 19], [8, 17]], EARTH[2]);
    p.outline();
    p.line(10, 10, 12, 15, ARC[2]); p.line(12, 15, 14, 10, ARC[2]); p.px(12, 9, ARC[3]);
  },
  // a towering colossus with a burning core, arms raised
  su_colossus: (p) => {
    p.ball(12, 14, 8, EARTH, 7); p.ball(12, 5, 3.5, EARTH);
    p.ball(3, 6, 2.8, EARTH); p.ball(21, 6, 2.8, EARTH);
    p.line(5, 9, 7, 11, EARTH[1]); p.line(19, 9, 17, 11, EARTH[1]);
    p.ball(12, 14, 3, FIRE);
    p.outline();
    p.px(11, 5, "#fff176"); p.px(13, 5, "#fff176");
  },
  // a violet rift with the hero stepping out of it
  su_step: (p) => {
    p.disc(8, 12, 5, ARC[0], 9); p.disc(8, 12, 3, ARC[1], 7); p.disc(8, 12, 1.4, ARC[3], 5);
    p.ball(17, 10, 3, BONE); p.poly([[14, 13], [20, 13], [21, 21], [13, 21]], BONE[2]);
    p.outline();
  },
  su_quick: (p) => {
    p.ring(12, 12, 8, GOLD[2]); p.ring(12, 12, 6, GOLD[1]);
    p.line(12, 12, 12, 6, GOLD[3]); p.line(12, 12, 16, 14, GOLD[3]);
    for (const x of [2, 4]) p.line(x, 9, x, 15, ARC[2]);
    p.outline();
  },
  su_flow: (p) => {
    p.ball(12, 13, 6, ARC); p.poly([[9, 8], [12, 2], [15, 8]], ARC[1]);
    p.outline();
    p.px(10, 11, ARC[3]); p.px(11, 10, "#ffffff");
  },
  su_swift: (p) => {
    for (const [y, l] of [[7, 14], [12, 18], [17, 12]]) { p.line(3, y, 3 + l, y, WIND[2]); p.line(3 + l, y, 1 + l, y - 2, WIND[3]); }
    p.outline();
  },
  // a rift full of the four elements
  su_rift: (p) => {
    p.disc(12, 12, 10, ARC[0], 8); p.disc(12, 12, 7, SHAD[1], 5.5);
    p.flame(8, 16, 7, 3, FIRE); p.poly([[14, 6], [16, 12], [12, 12]], ICE[2]);
    p.bolt([[17, 7], [15, 11], [18, 12], [16, 17]]);
    p.outline();
  },
  su_mote: (p) => {
    p.ball(13, 11, 5, LIT); p.bolt([[13, 11], [8, 15], [10, 16], [4, 21]]);
    p.outline();
    p.px(12, 9, "#ffffff");
  },
  su_ruin: (p) => {
    p.ball(12, 13, 7, EARTH, 6);
    p.flame(12, 16, 10, 4, FIRE);
    p.outline();
  },
  // a spectral blade of pure element
  su_blade: (p) => {
    p.sword(5, 20, 19, 4, ARC, GOLD);
    for (const [x, y] of [[16, 10], [12, 14], [18, 5]]) p.px(x, y, ARC[3]);
  },
  su_mastery: (p) => {
    p.ball(7, 8, 3, FIRE); p.ball(17, 8, 3, ICE); p.ball(7, 17, 3, POIS); p.ball(17, 17, 3, LIT);
    p.ball(12, 12.5, 3.2, ARC);
    p.outline();
  },
  // fire, ice and lightning falling on one spot
  su_cataclysm: (p) => {
    p.disc(12, 20, 9, EARTH[1], 2.5);
    p.flame(6, 18, 10, 3, FIRE); p.poly([[11, 4], [14, 4], [13, 18], [12, 18]], ICE[2]);
    p.bolt([[19, 3], [16, 10], [20, 11], [17, 19]]);
    p.outline();
  },
  // ===== Vampire: Blood =====
  v_link: (p) => {
    // a heart bound by a cord of blood that runs up to a pair of fangs, gulps of blood travelling along it
    p.disc(5, 16, 3.2, BLOOD[1]); p.disc(10, 16, 3.2, BLOOD[1]); p.poly([[2, 17], [13, 17], [7.5, 23]], BLOOD[1]);
    p.disc(5, 15, 2, BLOOD[0]); p.disc(10, 15, 2, BLOOD[0]);
    for (let i = 0; i <= 14; i++) { const t = i / 14; const x = 9 + t * 10, y = 14 - t * 9 + Math.sin(t * Math.PI) * 3; p.disc(x, y, 0.9, BLOOD[2]); }
    for (const t of [0.3, 0.65]) { const x = 9 + t * 10, y = 14 - t * 9 + Math.sin(t * Math.PI) * 3; p.disc(x, y, 1.7, BLOOD[0]); }
    p.poly([[15, 2], [22, 2], [21, 4], [16, 4]], "#e6dcd6");
    p.poly([[16, 4], [17.5, 4], [16.8, 8]], "#f5efe9"); p.poly([[20, 4], [21.5, 4], [20.8, 8]], "#f5efe9");
    p.outline();
    p.px(4, 14, "#ffffff"); p.px(16, 8, BLOOD[2]); p.px(20, 9, BLOOD[2]);
  },
  v_boil: (p) => {
    // a bubbling pool of blood, steaming
    p.disc(12, 18, 10, BLOOD[0], 4); p.disc(12, 17, 9, BLOOD[1], 3.2);
    for (const [x, y, r] of [[8, 15, 2.5], [14, 13, 3], [18, 16, 1.8], [11, 10, 1.6]]) { p.ball(x, y, r, BLOOD); }
    p.outline();
    for (const [x, y] of [[7, 13], [13, 11], [17, 15]]) p.px(x, y, "#ffffff");
    for (const x of [6, 12, 18]) { p.px(x, 6, BLOOD[3]); p.px(x + 1, 4, BLOOD[2]); p.px(x, 2, BLOOD[1]); }
  },
  v_pact: (p) => {
    // a sealed scroll with a blood seal and a dagger
    p.rect(4, 6, 16, 12, BONE[2]); p.rect(4, 6, 16, 2, BONE[3]); p.rect(4, 16, 16, 2, BONE[1]);
    p.disc(4, 12, 2, BONE[1], 6); p.disc(20, 12, 2, BONE[1], 6);
    for (let i = 0; i < 4; i++) p.line(7, 9 + i * 2, 15 - (i % 2) * 3, 9 + i * 2, BONE[0]);
    p.ball(15, 15, 3.2, BLOOD);
    p.outline();
    p.px(14, 14, BLOOD[3]); p.line(15, 18, 15, 21, BLOOD[2]); p.px(15, 22, BLOOD[1]);
  },
  v_exsang: (p) => {
    // streams of blood pulled inward to a dark heart
    p.ball(12, 12, 4, ["#2a0000", "#6d0000", "#b71c1c", "#ff8a80"]);
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + 0.3;
      for (let d = 5; d < 11; d++) { const b = a + (d - 5) * 0.12; p.disc(12 + Math.cos(b) * d, 12 + Math.sin(b) * d, d > 9 ? 1.2 : 0.6, d % 2 ? BLOOD[2] : BLOOD[1]); }
    }
    p.outline();
    p.px(11, 11, "#ffffff");
    for (const [x, y] of [[2, 5], [22, 8], [4, 20], [20, 20]]) p.px(x, y, BLOOD[3]);
  },
  v_tide: (p) => {
    // a rolling wave of blood with spikes rising out of it
    p.rect(0, 19, 24, 5, BLOOD[0]);
    p.poly([[0, 19], [5, 13], [10, 16], [15, 9], [20, 13], [24, 11], [24, 20], [0, 20]], BLOOD[1]);
    for (const [x, h] of [[4, 8], [11, 11], [18, 14]]) { p.poly([[x - 2, 19], [x, 19 - h], [x + 2, 19]], BLOOD[2]); p.line(x, 19 - h, x - 1, 18, BLOOD[3]); }
    p.outline();
    p.px(18, 5, "#ffffff"); p.px(11, 8, "#ffffff");
    for (const x of [2, 8, 14, 21]) p.px(x, 21, BLOOD[2]);
  },
  // ===== Vampire: Night =====
  v_mist: (p) => {
    // a cloaked figure dissolving into red mist
    p.poly([[9, 5], [15, 5], [17, 20], [7, 20]], SHAD[1]); p.poly([[9, 5], [12, 5], [12, 20], [7, 20]], SHAD[2]);
    p.ball(12, 6, 2.6, ["#5e5560", "#bdb0b8", "#e6dcd6", "#ffffff"]);
    p.poly([[8, 7], [12, 10], [16, 7], [17, 3], [12, 8], [7, 3]], CLOTH_R[1]);
    p.outline();
    p.px(11, 6, "#ff2d2d"); p.px(13, 6, "#ff2d2d");
    for (const [x, y, c] of [[18, 12, 2], [20, 15, 1], [19, 18, 2], [21, 10, 3], [22, 16, 1], [17, 21, 2]] as [number, number, number][]) p.px(x, y, CLOTH_R[c]);
  },
  v_bats: (p) => {
    // three bats in flight
    const bat = (x: number, y: number, s: number) => {
      p.poly([[x, y], [x - 5 * s, y - 3 * s], [x - 4 * s, y], [x - 6 * s, y + 1 * s], [x - 2 * s, y + 2 * s]], SHAD[2]);
      p.poly([[x, y], [x + 5 * s, y - 3 * s], [x + 4 * s, y], [x + 6 * s, y + 1 * s], [x + 2 * s, y + 2 * s]], SHAD[1]);
      p.line(x - 1, y, x - 5 * s, y - 3 * s, SHAD[3]); p.line(x + 1, y, x + 5 * s, y - 3 * s, SHAD[2]);
      p.disc(x, y + 0.5 * s, 1.4 * s, "#2a1d3a"); p.px(x - 1, y - 1.2 * s, "#2a1d3a"); p.px(x + 1, y - 1.2 * s, "#2a1d3a");
    };
    bat(12, 8, 1.4); bat(5, 17, 0.9); bat(18, 18, 1);
    p.outline();
    p.px(11, 8, "#ff2d2d"); p.px(13, 8, "#ff2d2d"); p.px(5, 17, "#ff2d2d"); p.px(18, 18, "#ff2d2d");
  },
  v_gaze: (p) => {
    // two burning red eyes in the dark
    p.disc(12, 12, 10, SHAD[0], 6);
    for (const x of [7, 17]) { p.disc(x, 12, 3.5, "#3a0000", 2); p.disc(x, 12, 2.6, "#c0182a", 1.4); p.rect(x, 11, 1, 3, OUT); }
    p.poly([[3, 9], [10, 10], [10, 9], [4, 7]], SHAD[2]); p.poly([[21, 9], [14, 10], [14, 9], [20, 7]], SHAD[2]);
    p.outline();
    p.px(6, 11, "#ffffff"); p.px(16, 11, "#ffffff");
    p.ring(12, 12, 11, BLOOD[1], Math.PI * 0.15, Math.PI * 0.85, 9); p.ring(12, 12, 11, BLOOD[1], Math.PI * 1.15, Math.PI * 1.85, 9);
  },
  v_nightborn: (p) => {
    // a blood-red crescent moon over a pale vampire face with burning eyes
    for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) {
      if (Math.hypot(x - 7, y - 7.5) <= 6 && Math.hypot(x - 9.6, y - 6) > 4.8) p.px(x, y, x + y < 11 ? BLOOD[0] : BLOOD[1]);
    }
    p.disc(15, 16, 5, "#e6dcd6", 6);
    p.poly([[9, 13], [15, 9], [21, 13], [19, 14], [15, 12], [11, 14]], SHAD[0]);
    p.poly([[10, 20], [12, 23], [18, 23], [20, 20], [15, 22]], SHAD[1]);
    p.outline();
    p.rect(12, 16, 2, 1, "#ff2d2d"); p.rect(17, 16, 2, 1, "#ff2d2d");
    p.px(14, 20, "#ffffff"); p.px(16, 20, "#ffffff");
    for (const [x, y] of [[20, 3], [22, 8], [17, 5]]) p.px(x, y, "#fff3c4");
  },
  v_cloak: (p) => {
    // a high-collared cloak spread like wings, lined in red
    p.poly([[12, 4], [22, 8], [20, 21], [12, 17], [4, 21], [2, 8]], SHAD[0]);
    p.poly([[12, 6], [19, 9], [17, 19], [12, 15], [7, 19], [5, 9]], CLOTH_R[0]);
    p.poly([[12, 6], [12, 15], [7, 19], [5, 9]], CLOTH_R[1]);
    p.poly([[8, 3], [12, 7], [16, 3], [16, 7], [12, 10], [8, 7]], SHAD[1]);
    p.outline();
    for (const [x, y] of [[3, 13], [21, 13], [12, 20]]) p.px(x, y, SHAD[3]);
    p.px(12, 11, GOLD[2]);
  },
  v_nightfall: (p) => {
    // a blood moon over a black sky with bats
    p.rect(1, 1, 22, 22, "#07040e");
    p.ball(13, 10, 6.5, ["#4a0000", "#9b1b1b", "#e63946", "#ff8a80"]);
    p.disc(16, 8, 5.5, "#07040e");
    p.poly([[1, 23], [1, 18], [5, 15], [9, 18], [14, 14], [19, 18], [23, 16], [23, 23]], SHAD[0]);
    p.outline();
    p.poly([[5, 7], [2, 5], [4, 8]], OUT); p.poly([[5, 7], [8, 5], [6, 8]], OUT);
    for (const [x, y] of [[3, 3], [20, 4], [21, 12]]) p.px(x, y, SHAD[3]);
  },
  // ===== Vampire: Fang =====
  v_rend: (p) => {
    // a thin blade leaving a red crescent
    p.ring(12, 13, 10, BLOOD[1], Math.PI * 1.0, Math.PI * 1.85, 8); p.ring(12, 13, 9, BLOOD[2], Math.PI * 1.05, Math.PI * 1.8, 7);
    p.sword(5, 20, 18, 5, STEEL, ["#2a0610", "#6d0f1f", "#a8102a", "#ff9aa8"]);
    p.outline();
    for (const [x, y] of [[4, 9], [6, 6], [3, 13]]) { p.px(x, y, BLOOD[2]); p.px(x, y + 1, BLOOD[1]); }
  },
  v_thirst: (p) => {
    // a blade with blood running down it into a goblet
    p.sword(12, 15, 12, 1, STEEL, ["#2a0610", "#6d0f1f", "#a8102a", "#ff9aa8"]);
    p.line(12, 3, 12, 13, BLOOD[2]);
    p.poly([[6, 15], [18, 15], [16, 19], [8, 19]], GOLD[1]); p.poly([[6, 15], [12, 15], [12, 19], [8, 19]], GOLD[2]);
    p.rect(11, 19, 2, 3, GOLD[1]); p.rect(8, 22, 8, 1, GOLD[0]);
    p.disc(12, 15.5, 5, BLOOD[1], 0.8);
    p.outline();
    p.px(7, 16, GOLD[3]); p.px(12, 14, BLOOD[3]);
  },
  v_hunger: (p) => {
    // a pale mouth with long fangs and a drop of blood
    p.poly([[3, 7], [21, 7], [19, 14], [12, 17], [5, 14]], "#5a0d12");
    p.poly([[3, 7], [21, 7], [20, 9], [4, 9]], "#e6dcd6");
    p.poly([[6, 9], [8, 9], [7, 16]], "#ffffff"); p.poly([[16, 9], [18, 9], [17, 16]], "#ffffff");
    for (const x of [9, 11, 13]) p.rect(x, 9, 2, 2, "#f2ece6");
    p.poly([[5, 14], [12, 17], [19, 14], [19, 16], [12, 20], [5, 16]], "#e6dcd6");
    p.outline();
    p.ball(7, 19, 1.4, BLOOD); p.px(7, 17, BLOOD[2]);
  },
  v_pounce: (p) => {
    // a dark shape leaping down with claws out, motion streaks behind
    for (const [x0, y0, x1, y1] of [[1, 4, 8, 9], [2, 9, 8, 12], [3, 1, 9, 6]]) p.line(x0, y0, x1, y1, SHAD[2]);
    p.poly([[8, 7], [15, 8], [20, 14], [17, 19], [11, 15]], SHAD[1]); p.poly([[8, 7], [15, 8], [13, 12]], CLOTH_R[1]);
    p.ball(16, 9, 2.4, ["#5e5560", "#bdb0b8", "#e6dcd6", "#ffffff"]);
    for (const [x, y] of [[18, 19], [20, 18], [22, 16]]) p.line(x, y - 3, x, y, BONE[3]);
    p.outline();
    p.px(17, 9, "#ff2d2d");
    p.spark(20, 21, 2, BLOOD[2], "#ffffff");
  },
  v_frenzy: (p) => {
    // crossed red slashes around a screaming pale face
    p.ball(12, 12, 5, ["#5e5560", "#bdb0b8", "#e6dcd6", "#ffffff"]);
    p.rect(10, 14, 4, 2, "#3a0000"); p.px(10, 14, "#ffffff"); p.px(13, 14, "#ffffff");
    p.poly([[8, 8], [11, 10], [11, 11], [8, 10]], "#1a0a10"); p.poly([[16, 8], [13, 10], [13, 11], [16, 10]], "#1a0a10");
    p.outline();
    p.px(10, 11, "#ff2d2d"); p.px(14, 11, "#ff2d2d");
    p.thick(2, 3, 9, 20, 2, BLOOD[2]); p.thick(22, 3, 15, 20, 2, BLOOD[2]); p.line(3, 3, 9, 19, BLOOD[3]); p.line(21, 3, 15, 19, BLOOD[3]);
    for (const [x, y] of [[4, 22], [20, 22], [12, 2]]) p.px(x, y, BLOOD[1]);
  },
  v_leech: (p) => {
    // a single drop of blood flicked from a pale hand
    p.poly([[2, 20], [8, 15], [11, 16], [9, 19], [5, 22]], "#e6dcd6"); p.poly([[8, 15], [11, 13], [12, 14], [11, 16]], "#bdb0b8");
    p.ball(16, 8, 3.2, BLOOD, 4); p.poly([[14, 5], [16, 1], [18, 5]], BLOOD[2]);
    p.outline();
    p.px(15, 7, "#ffffff");
    for (const [x, y] of [[13, 12], [12, 14]]) p.px(x, y, BLOOD[2]);
  },
};

/** 24x24 colours ("" = transparent) for a skill, or undefined if the skill has no art. */
export function paintSkill(id: string): string[] | undefined {
  const s = skillById(id), draw = ART[id];
  if (!s || !draw) return undefined;
  const p = new Painter();
  draw(p);
  const back = backdrop(s.style, s.row, !!s.passive);
  return back.map((b, i) => p.fx[i] || p.g[i] || b);
}

/** Only the motif (no backdrop): used for the sigil that flashes over a hero when the skill is cast. */
export function paintSigil(id: string): string[] | undefined {
  const draw = ART[id];
  if (!draw) return undefined;
  const p = new Painter();
  draw(p);
  return p.g.map((c, i) => p.fx[i] || c);
}

export const ART_IDS = Object.keys(ART);

// ---- Status icons for the HUD buff row (client/src/buffbar.ts): boons and debuffs that are not skills ----------------
/** [style for the backdrop glow, frame row, harmful]. Debuffs get a blood-red frame so they read as bad at a glance. */
const STATUS_ART: Record<string, [FxStyle, number, boolean, Draw]> = {
  // Shrine Blessing of the Wind: a white feather riding green gusts
  shrine_wind: ["wind", 3, false, (p) => {
    p.poly([[5, 19], [15, 5], [19, 4], [18, 8], [8, 19]], BONE[2]);
    p.line(6, 19, 18, 5, BONE[0]);
    for (const [x, y] of [[9, 13], [11, 11], [13, 9], [15, 7]]) p.line(x, y, x + 3, y + 1, BONE[1]);
    p.outline();
    p.ring(12, 13, 9, WIND[2], Math.PI * 0.9, Math.PI * 1.5);
    p.ring(12, 13, 6, WIND[3], Math.PI * 0.1, Math.PI * 0.7);
    p.line(2, 8, 7, 8, WIND[2]); p.line(16, 17, 21, 17, WIND[2]); p.line(18, 20, 21, 20, WIND[1]);
    p.px(19, 4, "#ffffff");
  }],
  // Stunned: little gold stars circling a dazed head
  stun: ["holy", 0, true, (p) => {
    p.ball(12, 15, 5, SKIN);
    p.outline();
    p.ring(12, 8, 7, GOLD[1], 0, Math.PI * 2, 2.5);
    p.spark(5, 8, 2, GOLD[2]); p.spark(18, 7, 2, GOLD[2]); p.spark(12, 10, 1, GOLD[3]);
    p.line(10, 15, 11, 16, OUT); p.line(11, 15, 10, 16, OUT); p.line(14, 15, 15, 16, OUT); p.line(15, 15, 14, 16, OUT);
  }],
  // Slowed: a frosted hourglass
  slow: ["frost", 0, true, (p) => {
    p.rect(6, 3, 12, 2, WOOD[2]); p.rect(6, 19, 12, 2, WOOD[1]);
    p.poly([[8, 5], [16, 5], [12, 12]], ICE[1]); p.poly([[12, 12], [16, 19], [8, 19]], ICE[1]);
    p.poly([[10, 6], [14, 6], [12, 10]], ICE[3]); p.poly([[12, 14], [15, 19], [9, 19]], ICE[2]);
    p.line(12, 10, 12, 16, ICE[3]);
    p.outline();
    p.spark(18, 11, 2, ICE[3]); p.px(6, 13, ICE[3]);
  }],
  // Burning: a roaring flame
  burn: ["fire", 0, true, (p) => { p.flame(12, 21, 17, 12, FIRE); p.outline(); p.px(7, 6, FIRE[3]); p.px(17, 8, FIRE[2]); }],
  // Marked: a red crosshair (takes more damage)
  mark: ["blood", 0, true, (p) => {
    p.ring(12, 12, 7, BLOOD[2]); p.ring(12, 12, 6, BLOOD[1]);
    p.thick(12, 2, 12, 7, 2, BLOOD[2]); p.thick(12, 17, 12, 22, 2, BLOOD[2]);
    p.thick(2, 12, 7, 12, 2, BLOOD[2]); p.thick(17, 12, 22, 12, 2, BLOOD[2]);
    p.outline();
    p.px(12, 12, "#ffffff"); p.px(13, 12, BLOOD[3]);
  }],
  // Weakened: a sword snapped in two (deals less damage)
  weak: ["shadow", 0, true, (p) => {
    p.sword(4, 20, 11, 13, IRON, IRON);
    p.thick(14, 10, 20, 4, 2, IRON[2]); p.line(14, 10, 20, 4, IRON[3]);
    p.outline();
    p.px(12, 11, SHAD[3]); p.px(13, 12, SHAD[2]); p.px(11, 9, SHAD[2]);
  }],
};

/** 24x24 colours for a status (boon or debuff) that is not a skill, or undefined. */
export function paintStatus(id: string): string[] | undefined {
  const a = STATUS_ART[id];
  if (!a) return undefined;
  const [style, row, bad, draw] = a;
  const p = new Painter();
  draw(p);
  const back = backdrop(style, row, false);
  if (bad) for (let i = 0; i < ICON; i++) {
    back[i] = BLOOD[1]; back[(ICON - 1) * ICON + i] = BLOOD[0]; back[i * ICON] = BLOOD[1]; back[i * ICON + ICON - 1] = BLOOD[0];
  }
  return back.map((b, i) => p.fx[i] || p.g[i] || b);
}
