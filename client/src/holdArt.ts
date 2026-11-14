import type Phaser from "phaser";
import { ART_K as K } from "../../shared/constants";
import { CLANS, type ClanKey } from "../../shared/war/clans";

/**
 * Hand-built pixel art for the clan war Holds (the keep of whoever owns a war territory), one style per clan, in the
 * village bonfire's look: one colour per art pixel, three-tone materials lit from the top left, ordered dithering and
 * an automatic dark outline. Wardens: timber watchtower in a palisade. Redfang: hide-tent war camp. Host: ruined grey
 * tower with bone buttresses and ghost-fire. Hide-Kin: burrow mound framed by tusks and hides. Veiled: sandstone
 * shrine-pavilion with indigo drapes. Drawn once at 1 art pixel = ART_K world px; seeded hashes only (deterministic).
 * Cosmetic: nothing here touches what the server sees.
 */
const W = 60, H = 64, FEET = 60; // art px; FEET = the row below the last ground row
/** Origin y (0..1) of the ground line: place the sprite with setOrigin(0.5, HOLD_FOOT) on the Hold's tile. */
export const HOLD_FOOT = FEET / H;
/** World px size of a Hold sprite. */
export const HOLD_SIZE = { w: W * K, h: H * K };

const OUT = "#15110e";
const hash = (a: number, b: number, s = 0) => {
  let h = Math.imul(a * 73 + 11 + s * 977, 374761393) ^ Math.imul(b + 5 + s * 131, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
const vnoise = (x: number, y: number, s: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dith = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
const mix = (a: string, b: string, t: number) => {
  const x = rgb(a), y = rgb(b);
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
};
const clanRamp = (c: number) => { const h = hex(c); return [mix(h, "#000000", 0.6), mix(h, "#000000", 0.35), h, mix(h, "#ffffff", 0.22)]; };

const WOOD = ["#2a1a10", "#3d2817", "#553a22", "#6e4d2e", "#8a6640"];
const STONE = ["#25221f", "#3a3632", "#524d46", "#6d675d", "#8c8577"];
const GREY = ["#1a1e1d", "#2a302f", "#3e4745", "#58625f", "#7a8582"];
const SAND = ["#5a4228", "#7d5f3a", "#a07f4e", "#c4a368", "#e0c48a"];
const SOIL = ["#1f150d", "#33231a", "#4a3524", "#63492f", "#7c5e3d"];
const HIDE = ["#4a3320", "#6e4e30", "#8f6a42", "#b08a58", "#cfae78"];
const BONE = ["#4f4838", "#7d7459", "#a89d7e", "#cfc4a2", "#ece3c4"];
const IRON = ["#16181a", "#2a2e32", "#444a50", "#6a727a"];
const FIREC = ["#6e1a0a", "#a82c0c", "#d84a12", "#f2761c", "#ffa22e", "#ffcf52", "#fff0a8"];
const TEAL = ["#0f2a24", "#1d5546", "#2f8a70", "#4fc9a0", "#9af0d0", "#e0fff0"];
const GOLD = ["#6b4a12", "#a8761c", "#d9a030", "#f6d26b", "#fff2b0"];

/** Three layers: ground (no outline), objects (outlined), fx (flames and glow, drawn last, no outline). */
class Art {
  ground: string[] = new Array(W * H).fill("");
  obj: string[] = new Array(W * H).fill("");
  fx: string[] = new Array(W * H).fill("");
  constructor(public s: number) {}
  private set(l: string[], x: number, y: number, c: string) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) l[y * W + x] = c; }
  p(x: number, y: number, c: string) { this.set(this.obj, x, y, c); }
  gp(x: number, y: number, c: string) { this.set(this.ground, x, y, c); }
  fp(x: number, y: number, c: string) { this.set(this.fx, x, y, c); }
  has(x: number, y: number) { return x >= 0 && y >= 0 && x < W && y < H && this.obj[y * W + x] !== ""; }
  /** Pick a ramp colour for light l (0 dark .. 1 lit) with ordered dithering. */
  sh(r: string[], l: number, x: number, y: number, grain = 0.3) {
    const v = Math.max(0, Math.min(0.999, l + (dith(Math.round(x), Math.round(y)) - 0.5) * grain));
    return r[Math.floor(v * r.length)];
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: string) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.p(x, y, c); }
  /** A box of one material lit from the top left, with grain noise and a bright left / dark right edge. */
  box(x0: number, y0: number, x1: number, y1: number, r: string[], seed = 0, base = 0.62, grain = 0.28) {
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let l = base - ((x - x0) / w) * 0.3 - ((y - y0) / h) * 0.1 + (vnoise(x * 0.7, y * 0.5, this.s + seed) - 0.5) * grain;
      if (x === x0) l += 0.2; if (x === x1) l -= 0.25; if (y === y0) l += 0.12; if (y === y1) l -= 0.1;
      this.p(x, y, this.sh(r, l, x, y));
    }
  }
  /** A thick segment (log, bone, tusk, stake): lit on the upper-left side. */
  seg(x0: number, y0: number, x1: number, y1: number, rad: number, r: string[], seed = 0, taper = 0) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const sg = nx * -0.7 + ny * -0.7 >= 0 ? 1 : -1;
    for (let y = Math.floor(Math.min(y0, y1) - rad - 1); y <= Math.ceil(Math.max(y0, y1) + rad + 1); y++)
      for (let x = Math.floor(Math.min(x0, x1) - rad - 1); x <= Math.ceil(Math.max(x0, x1) + rad + 1); x++) {
        const t = ((x - x0) * dx + (y - y0) * dy) / (L * L);
        if (t < 0 || t > 1) continue;
        const rr = rad * (1 - taper * t), s = (((x - x0) * nx + (y - y0) * ny) / rr) * sg;
        if (Math.abs(s) > 1) continue;
        const l = 0.55 + 0.4 * s + (vnoise(x * 0.8, y * 0.8, this.s + seed) - 0.5) * 0.3;
        this.p(x, y, this.sh(r, l, x, y, 0.25));
      }
  }
  /** Torn cloth hanging from (x, y): cloth ramp, trim edge, folds, optional swallow tail, tatter and a lozenge sigil. */
  banner(x: number, y: number, w: number, h: number, k: ClanKey, o: { tail?: boolean; tatter?: number; sigil?: boolean; wave?: number } = {}) {
    const cl = CLANS[k], cr = clanRamp(k === "host" ? 0x38403d : cl.cloth), trim = hex(cl.trim);
    const wave = o.wave ?? 0;
    for (let i = 0; i < w; i++) {
      const dx = Math.round(Math.sin(i * 0.5 + 1) * wave);
      let bot = h - 1 - (o.tail ? Math.round(Math.abs(i - (w - 1) / 2) < 1.5 ? 4 : 0) : 0);
      if (o.tatter) bot -= Math.floor(hash(i, 3, this.s) * o.tatter * (i % 2 ? 1 : 0.4));
      for (let j = 0; j <= bot; j++) {
        const fold = Math.sin(i * 1.3 + j * 0.15) * 0.18, edge = i === 0 || i === w - 1 || j === 0 || j === bot;
        if (o.tatter && j > 3 && hash(i, j, this.s + 5) < o.tatter * 0.025) continue;
        this.p(x + i + dx * (j / h), y + j, edge && j !== bot ? trim : edge ? mix(trim, "#000000", 0.2) : this.sh(cr, 0.6 - i / w * 0.25 + fold, x + i, y + j, 0.22));
      }
    }
    if (o.sigil !== false && w >= 7) {
      const sx = x + Math.floor(w / 2), sy = y + Math.floor(h * 0.42), c = hex(cl.sigil);
      for (const [a, b] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) this.p(sx + a + Math.round(Math.sin(1) * wave * (h * 0.42 / h)), sy + b, c);
    }
  }
  /** Warm light spilled on nearby object pixels (dithered, falls off with distance). */
  glow(cx: number, cy: number, rad: number, col: string, power = 0.55) {
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      const d = Math.hypot(x - cx, (y - cy) * 1.15) / rad;
      if (d >= 1 || !this.has(x, y)) continue;
      if (dith(x, y) < (1 - d) * power * 1.6) this.p(x, y, mix(this.obj[y * W + x], col, 0.45 + 0.35 * (1 - d)));
    }
  }
  /** A small fire on the fx layer: tongue shape, heat colours from the ramp, hot white core. */
  flame(cx: number, baseY: number, w: number, h: number, ramp: string[], seed = 0) {
    for (let j = 0; j < h; j++) {
      const t = j / h, hw = (w / 2) * Math.pow(Math.sin(Math.PI * Math.min(1, (t * 0.85 + 0.12))), 0.8) * (1 - t * 0.35);
      for (let x = Math.ceil(cx - hw - 1); x <= Math.floor(cx + hw + 1); x++) {
        const d = Math.abs(x - cx), ragged = (vnoise(x * 0.9, j * 0.6, this.s + seed) - 0.5) * 1.6;
        if (d > hw + ragged) continue;
        const heat = 1 - (d / (hw + 0.5)) * 0.55 - t * 0.55 + (vnoise(x, j * 0.8, this.s + seed + 7) - 0.5) * 0.3;
        this.fp(x, baseY - j, ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(heat * ramp.length)))]);
      }
    }
  }
  /** Ground patch (no outline): dirt/sand with noise, dark rim and pebbles. */
  dirt(cx: number, cy: number, rx: number, ry: number, r: string[]) {
    for (let y = cy - ry - 1; y <= cy + ry + 1; y++) for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (vnoise(x * 0.6, y * 0.9, this.s + 40) - 0.5) * 0.35;
      if (d > 1) continue;
      this.gp(x, y, this.sh(r, 0.38 + (1 - d) * 0.25 + (vnoise(x * 0.4, y * 0.7, this.s + 41) - 0.5) * 0.4, x, y, 0.4));
      if (d > 0.82 && hash(x, y, this.s) < 0.6) this.gp(x, y, r[0]);
    }
    for (let i = 0; i < 9; i++) { const x = cx + Math.round((hash(i, 1, this.s + 42) - 0.5) * rx * 1.6), y = cy + Math.round((hash(i, 2, this.s + 42) - 0.5) * ry * 1.2); this.gp(x, y, r[3]); this.gp(x + 1, y, r[1]); }
  }
  /** The final canvas: ground, then an outline round every object pixel, then objects, then fx. */
  render(): HTMLCanvasElement {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d")!;
    const put = (x: number, y: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (this.ground[y * W + x]) put(x, y, this.ground[y * W + x]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (this.obj[y * W + x]) continue;
      if (this.has(x - 1, y) || this.has(x + 1, y) || this.has(x, y - 1) || this.has(x, y + 1)) put(x, y, OUT);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (this.obj[y * W + x]) put(x, y, this.obj[y * W + x]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (this.fx[y * W + x]) put(x, y, this.fx[y * W + x]);
    return c;
  }
}

/** Pitched shingle roof from apex (ax, ay): rows widen by `slope` per row down to y = by, seams every 3 rows. */
function roof(a: Art, ax: number, ay: number, by: number, slope: number, r: string[]) {
  for (let y = ay; y <= by; y++) {
    const hw = Math.round((y - ay + 1) * slope);
    for (let x = ax - hw; x <= ax + hw; x++) {
      const u = (x - ax) / (hw || 1), seam = (y - ay) % 3 === 2, off = ((y - ay) / 3 | 0) % 2 ? 2 : 0, cut = (x + off) % 4 === 0 && !seam;
      let l = 0.62 - u * 0.3 - (y - ay) / (by - ay + 1) * 0.1 + (vnoise(x * 0.8, y * 0.8, a.s) - 0.5) * 0.25;
      if (seam) l -= 0.32; if (cut) l -= 0.18; if (y === by) l -= 0.2;
      a.p(x, y, a.sh(r, l, x, y, 0.18));
    }
  }
}

function brickJoints(a: Art, x0: number, y0: number, x1: number, y1: number, col: string, rowH = 4, bw = 6) {
  for (let y = y0; y <= y1; y++) for (let x = x0 + 1; x < x1; x++) {
    const row = Math.floor((y - y0) / rowH);
    if ((y - y0) % rowH === rowH - 1 || (x - x0 + (row % 2) * 3) % bw === 0) if (hash(x, y, a.s + 3) < 0.8) a.p(x, y, col);
  }
}

function grassTuft(a: Art, x: number, y: number, k: number, cols = ["#2f4a1e", "#4e6a2a", "#6d8a3a"]) {
  for (let i = -1; i <= 1; i++) { const h = 1 + Math.floor(hash(x + i, k, 9) * 3); for (let j = 0; j < h; j++) a.p(x + i, y - j, cols[(i + 1 + j) % 3]); }
}

/** Timber log wall: horizontal courses with dark joins and knots. */
function timberWall(a: Art, x0: number, y0: number, x1: number, y1: number) {
  a.box(x0, y0, x1, y1, WOOD, 3, 0.58, 0.3);
  for (let y = y0 + 2; y <= y1; y += 3) for (let x = x0; x <= x1; x++) if (hash(x, y, a.s) < 0.9) a.p(x, y, WOOD[0]);
  for (let i = 0; i < 4; i++) { const x = x0 + 1 + Math.floor(hash(i, 1, a.s + 8) * (x1 - x0 - 1)), y = y0 + 1 + Math.floor(hash(i, 2, a.s + 8) * (y1 - y0 - 1)); a.p(x, y, WOOD[0]); }
}

// ---- Hearthbound Wardens: watchtower in a palisade -------------------------------------------------------------

function wardens(a: Art) {
  a.dirt(30, 57, 28, 4, SOIL);
  // sharpened-log palisade wings (behind the tower), crossbar, ropes
  const wing = (x0: number, x1: number, seed: number) => {
    for (let x = x0; x <= x1; x += 3) {
      const top = 41 + Math.floor(hash(x, seed, a.s) * 4);
      for (let y = top; y <= 58; y++) for (let i = 0; i < 3; i++) {
        const dy = y - top;
        if ((dy === 0 && i !== 1) || (dy === 1 && i === 2 && false)) continue;
        const l = 0.74 - i * 0.2 + (vnoise(x + i, y * 0.5, a.s + 11) - 0.5) * 0.35;
        a.p(x + i, y, i === 2 ? WOOD[1] : a.sh(WOOD, l, x + i, y, 0.2));
      }
      for (let y = top + 3; y < 58; y += 4) a.p(x + 1, y, WOOD[0]);
    }
    for (let x = x0; x <= x1 + 2; x++) { a.p(x, 50, WOOD[4 - (x & 1)]); a.p(x, 51, WOOD[2]); a.p(x, 52, WOOD[0]); }
    for (let x = x0 + 1; x <= x1; x += 6) { a.p(x, 50, "#b8a070"); a.p(x, 51, "#8a7448"); }
  };
  wing(2, 17, 1); wing(42, 57, 2);
  // stone footing with joints and moss
  a.box(19, 46, 41, 59, STONE, 5, 0.6, 0.3);
  brickJoints(a, 19, 46, 41, 59, STONE[0]);
  for (let x = 20; x < 41; x++) if (hash(x, 1, a.s + 6) < 0.5) a.p(x, 46, mix(STONE[3], "#6d8a3a", 0.4));
  a.rect(27, 52, 33, 59, "#120d0a"); a.rect(28, 51, 32, 51, "#120d0a"); a.rect(29, 50, 31, 50, "#120d0a");
  for (let x = 27; x <= 33; x++) a.p(x, 59, WOOD[1]);
  // tower: timber body, banner, window, platform with rail, cabin and shingle roof
  timberWall(a, 23, 29, 37, 45);
  a.box(21, 45, 39, 46, WOOD, 4, 0.55);
  a.banner(27, 31, 7, 14, "wardens", { tail: true, wave: 0.6 });
  for (let x = 27; x <= 33; x++) a.p(x, 30, WOOD[0]);
  a.box(17, 27, 43, 29, WOOD, 6, 0.65);
  for (let x = 18; x <= 42; x += 4) { a.box(x, 22, x + 1, 26, WOOD, 7, 0.6); }
  a.rect(18, 22, 42, 22, WOOD[3]);
  timberWall(a, 22, 12, 38, 26);
  a.rect(28, 16, 32, 22, "#120d0a"); a.rect(27, 15, 33, 15, WOOD[0]); a.rect(27, 23, 33, 23, WOOD[4]);
  a.rect(29, 18, 31, 21, "#5a2a10");
  roof(a, 30, 3, 12, 1.9, ["#2a1d17", "#42322a", "#5e4636", "#7a5e48"]);
  a.rect(30, 0, 30, 2, WOOD[1]);
  a.rect(31, 0, 34, 1, hex(CLANS.wardens.trim));
  // brazier on a tripod in front of the left wing
  for (const [x0, x1] of [[7, 9], [15, 13], [11, 11]] as const) a.seg(x0, 58, x1, 50, 0.9, IRON, 2);
  a.box(8, 47, 14, 50, IRON, 9, 0.55); a.rect(8, 47, 14, 47, "#9a4a14");
  for (let x = 9; x <= 13; x++) a.p(x, 47, FIREC[2 + (x & 1)]);
  a.flame(11, 47, 7, 10, FIREC, 3);
  for (let i = 0; i < 4; i++) a.fp(9 + Math.round(hash(i, 1, 13) * 5), 34 - i * 2, FIREC[4]);
  a.glow(11, 46, 12, "#ff9030", 0.3);
  a.glow(11, 46, 7, "#ffb050", 0.3);
  grassTuft(a, 4, 59, 1); grassTuft(a, 56, 59, 2); grassTuft(a, 42, 59, 3);
}

// ---- Redfang Compact: hide-tent war camp ----------------------------------------------------------------------

function redfang(a: Art) {
  a.dirt(30, 57, 28, 4, SOIL);
  // the tent: patched hides, left face lit, door slit, crossed poles at the apex
  for (let y = 20; y <= 58; y++) {
    const hw = Math.round(((y - 20) / 38) * 17 + 1);
    for (let x = 28 - hw; x <= 28 + hw; x++) {
      const u = (x - 28) / hw, patch = vnoise(x * 0.35, y * 0.35, a.s + 2) > 0.62;
      let l = 0.7 - (u + 1) * 0.28 - (y - 20) / 60 + (vnoise(x * 0.6, y * 0.4, a.s) - 0.5) * 0.3;
      if (patch) l -= 0.18;
      if (Math.abs(x - 28) < 1 && y < 56 && false) l = 0;
      a.p(x, y, a.sh(HIDE.map((c) => mix(c, "#4a1a10", 0.25)), l + 0.2, x, y, 0.22));
    }
  }
  for (let y = 22; y <= 56; y += 1) { const hw = Math.round(((y - 20) / 38) * 17 + 1); if (y % 4 === 0) for (const sgn of [-1, 1]) a.p(28 + sgn * Math.round(hw * 0.5), y, HIDE[0]); }
  for (let y = 21; y <= 58; y++) { a.p(28, y, HIDE[0]); if (y % 3 === 0) a.p(27 + (y & 1) * 2, y, "#d8c8a0"); } // centre seam, lacing
  for (let y = 44; y <= 58; y++) { const hw = Math.round((y - 44) / 14 * 4 + 2); for (let x = 28 - hw; x <= 28 + hw; x++) a.p(x, y, y < 46 ? "#2a1810" : "#0e0806"); }
  for (let y = 58 - 13; y < 58; y++) a.p(28 - Math.round((y - 44) / 14 * 4 + 2) - 1, y, HIDE[0]);
  a.seg(24, 17, 31, 24, 0.7, WOOD, 3); a.seg(33, 15, 25, 25, 0.7, WOOD, 4);
  a.seg(28, 20, 28, 6, 0.6, WOOD, 5);
  a.banner(29, 5, 12, 9, "redfang", { tatter: 3, wave: 1, sigil: true });
  // skull on a pike (right), swinging a few tatters
  a.seg(54, 59, 54, 31, 0.8, WOOD, 6);
  a.seg(54, 31, 54, 26, 0.5, IRON, 7);
  for (const [dx, dy] of [[-2, -1], [-1, -2], [0, -2], [1, -2], [2, -1], [-2, 0], [2, 0], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [-1, -1], [0, -1], [1, -1], [0, 0]]) a.p(54 + dx, 28 + dy, BONE[dx < 0 ? 4 : dx > 0 ? 2 : 3]);
  a.p(53, 28, "#15110e"); a.p(55, 28, "#15110e"); a.p(54, 29, BONE[1]); a.p(53, 30, BONE[3]); a.p(55, 30, BONE[3]);
  a.p(53, 29, "#15110e"); a.p(55, 29, "#15110e");
  // crates (left)
  const crate = (x0: number, y0: number, s: number) => {
    a.box(x0, y0, x0 + s, y0 + s, WOOD, x0, 0.62);
    for (let i = 0; i <= s; i++) { a.p(x0 + i, y0 + (i < s ? i : s), WOOD[1]); a.p(x0 + s - i, y0 + (i < s ? i : s), WOOD[1]); }
    a.rect(x0, y0, x0 + s, y0, WOOD[4]); a.rect(x0, y0 + s, x0 + s, y0 + s, WOOD[0]);
    a.p(x0 + 1, y0 + 1, "#a08a60"); a.p(x0 + s - 1, y0 + s - 1, "#a08a60");
  };
  crate(2, 49, 9); crate(5, 40, 7); crate(12, 53, 5);
  a.p(7, 44, hex(CLANS.redfang.cloth)); a.p(8, 44, hex(CLANS.redfang.cloth)); a.p(7, 43, hex(CLANS.redfang.cloth));
  // spiked barricade: crossed sharpened stakes, lashed
  const stakes = (x0: number, x1: number, sd: number) => {
    for (let x = x0; x <= x1; x += 5) {
      a.seg(x - 3, 59, x + 3, 42 + Math.floor(hash(x, sd, a.s) * 3), 0.9, WOOD, x, 0.5);
      a.seg(x + 3, 59, x - 3, 43 + Math.floor(hash(x, sd + 1, a.s) * 3), 0.9, WOOD, x + 1, 0.5);
      a.p(x, 52, "#a08a60"); a.p(x, 53, "#6e5a38");
    }
    for (let x = x0 - 2; x <= x1 + 2; x++) { a.p(x, 51, WOOD[3]); a.p(x, 52, WOOD[1]); }
  };
  stakes(15, 20, 1); stakes(39, 49, 2);
  grassTuft(a, 50, 59, 1, ["#5a4a2a", "#7a6638", "#8c7a44"]);
  // fire pot glow of a night camp: embers by the door
  a.fp(24, 59, FIREC[3]); a.fp(25, 59, FIREC[5]); a.fp(25, 58, FIREC[4]);
}

// ---- Ossuary Host: ruined tower, bone buttresses, ghost-fire ---------------------------------------------------

function host(a: Art) {
  a.dirt(30, 57, 28, 4, ["#141816", "#222826", "#323a37", "#46514d", "#5c6965"]);
  // rubble and bones scattered
  // tower body with a broken, jagged top
  const topAt = (x: number) => 14 + Math.round(vnoise(x * 0.5, 2, a.s) * 6) + (x > 33 ? 5 : 0) + (x >= 26 && x <= 29 ? 5 : 0);
  for (let x = 18; x <= 42; x++) for (let y = topAt(x); y <= 58; y++) {
    const l = 0.6 - ((x - 18) / 25) * 0.32 - (y - 14) / 90 + (vnoise(x * 0.6, y * 0.5, a.s + 1) - 0.5) * 0.35 + (x === 18 ? 0.2 : 0) + (x === 42 ? -0.22 : 0) + (y === topAt(x) ? 0.15 : 0);
    a.p(x, y, a.sh(GREY, l, x, y, 0.28));
  }
  brickJoints(a, 18, 15, 42, 58, GREY[0], 4, 6);
  for (let x = 18; x <= 42; x++) for (let y = 15; y < 58; y++) if (a.has(x, y) && vnoise(x * 0.5, y * 0.3, a.s + 9) > 0.7 && y > 16) a.p(x, y, GREY[hash(x, y, 2) < 0.5 ? 0 : 1]); // missing stones and cracks
  for (let y = 24; y < 52; y++) a.p(36 + Math.round(Math.sin(y * 0.6) * 1.5), y, GREY[0]);
  // breach at the base, a skull above the arch
  a.rect(26, 50, 34, 58, "#0b0e0d"); a.rect(27, 48, 33, 49, "#0b0e0d"); a.rect(29, 47, 31, 47, "#0b0e0d");
  for (let x = 26; x <= 34; x++) a.p(x, 58, GREY[1]);
  for (const [dx, dy] of [[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) a.p(30 + dx, 43 + dy, BONE[dx < 0 ? 4 : 3]);
  a.p(29, 43, "#15110e"); a.p(31, 43, "#15110e");
  // window with ghost-fire
  a.rect(26, 24, 34, 36, GREY[0]); a.rect(27, 22, 33, 23, GREY[0]); a.rect(28, 21, 32, 21, GREY[0]);
  a.rect(27, 24, 33, 36, "#06120f"); a.rect(28, 23, 32, 23, "#06120f");
  for (let x = 25; x <= 35; x++) a.p(x, 37, GREY[4]);
  // bone buttresses: two slanted spars each side with knobbed feet
  for (const [fx, tx, ty, sd] of [[8, 18, 30, 1], [13, 19, 40, 2], [52, 42, 30, 3], [47, 41, 40, 4]] as const) {
    a.seg(fx, 59, tx, ty, 2, BONE, sd, 0.2);
    for (const [dx, dy] of [[-1, 0], [0, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) a.p(fx + dx, 58 + dy, BONE[dx <= 0 ? 4 : 2]);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, -1], [-1, 0]]) a.p(tx + dx, ty + dy, BONE[3]);
  }
  for (let i = 0; i < 4; i++) { const t = i / 4, x = 9 + t * 8, y = 56 - t * 25; a.seg(x + 2, y, x + 6, y - 2, 0.7, BONE, 6 + i); a.seg(51 - t * 8 - 2, y, 51 - t * 8 - 6, y - 2, 0.7, BONE, 12 + i); }
  // tattered black banner on a bent pole from the broken top
  a.seg(37, 20, 37, 3, 0.6, IRON, 3);
  a.seg(37, 3, 44, 3, 0.5, IRON, 4);
  a.banner(38, 4, 6, 15, "host", { tatter: 5, wave: 1.2, sigil: true });
  // ghost-fire: window flame, glow on the stone, wisps
  a.flame(30, 36, 6, 12, TEAL, 5);
  a.glow(30, 30, 11, "#4fc9a0", 0.3);
  for (let i = 0; i < 5; i++) a.fp(29 + Math.round((hash(i, 3, 21) - 0.5) * 6), 20 - i * 2 - (i & 1), TEAL[3 + (i & 1)]);
  // rubble
  for (const [x, y, w] of [[12, 58, 3], [44, 58, 4], [49, 57, 2], [20, 59, 2], [38, 59, 3]] as const) { a.box(x, y - 1, x + w, y, GREY, x, 0.62); }
  for (const [x, y] of [[15, 59], [23, 59], [47, 59]] as const) { a.p(x, y, BONE[4]); a.p(x + 1, y, BONE[3]); a.p(x + 2, y, BONE[2]); }
}

// ---- Hide-Kin of Mawdeep: burrow mound, tusks, hides -----------------------------------------------------------

function hidekin(a: Art) {
  a.dirt(30, 57, 28, 4, SOIL);
  // earth mound dome
  for (let y = 24; y <= 58; y++) for (let x = 2; x <= 56; x++) {
    const dx = (x - 28) / 27, dy = (y - 58) / 34, d = dx * dx + dy * dy * (dy < 0 ? 1 : 3) + (vnoise(x * 0.3, y * 0.3, a.s) - 0.5) * 0.12;
    if (d > 1) continue;
    let l = 0.62 - (dx + 1) * 0.2 + (-dy) * 0.12 + (vnoise(x * 0.5, y * 0.6, a.s + 1) - 0.5) * 0.4 - (d > 0.8 ? 0.12 : 0);
    const topGrass = y < 36 + Math.round(vnoise(x * 0.4, 1, a.s) * 4) && d > 0.35;
    a.p(x, y, topGrass ? a.sh(["#1f3414", "#2f4a1e", "#4e6a2a", "#6d8a3a"], l, x, y, 0.35) : a.sh(SOIL, l, x, y, 0.3));
  }
  for (let i = 0; i < 24; i++) { const x = 4 + Math.floor(hash(i, 1, a.s + 3) * 50), y = 30 + Math.floor(hash(i, 2, a.s + 3) * 27); if (a.has(x, y)) { a.p(x, y, STONE[2]); a.p(x + 1, y, STONE[4]); a.p(x, y + 1, STONE[0]); } }
  // burrow mouth
  for (let y = 38; y <= 58; y++) { const hw = Math.round(Math.sqrt(Math.max(0, 1 - ((y - 50) / 12) ** 2 * (y < 50 ? 1 : 0))) * 8 + (y >= 50 ? 8 : 0)); for (let x = 30 - hw; x <= 30 + hw; x++) a.p(x, y, y < 41 ? "#1c120a" : "#0b0705"); }
  for (let x = 24; x <= 36; x++) a.p(x, 58, SOIL[0]);
  a.p(28, 52, "#e0b040"); a.p(33, 49, "#e0b040"); // eyes in the dark
  // tusks framing the entrance, curving in
  const tusk = (sgn: number) => {
    const pts = [[30 + sgn * 11, 59], [30 + sgn * 12, 53], [30 + sgn * 11, 46], [30 + sgn * 8, 40], [30 + sgn * 4, 37]];
    for (let i = 0; i + 1 < pts.length; i++) a.seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 2.2 - i * 0.4, BONE, 10 + i + (sgn > 0 ? 5 : 0), 0.25);
    for (let i = 0; i < 3; i++) a.p(30 + sgn * 11 + (sgn > 0 ? -1 : 1) * 1, 55 - i * 2, BONE[0]);
  };
  tusk(-1); tusk(1);
  // stretched hides on frames either side
  const rack = (x0: number, y0: number, sd: number) => {
    a.seg(x0, 58, x0, y0, 0.8, WOOD, sd); a.seg(x0 + 9, 58, x0 + 9, y0, 0.8, WOOD, sd + 1);
    a.seg(x0 - 1, y0, x0 + 10, y0, 0.7, WOOD, sd + 2); a.seg(x0 - 1, y0 + 17, x0 + 10, y0 + 17, 0.7, WOOD, sd + 3);
    for (let y = y0 + 1; y < y0 + 17; y++) for (let x = x0 + 1; x < x0 + 9; x++) {
      const e = Math.min(y - y0, y0 + 17 - y, x - x0, x0 + 9 - x), l = 0.6 - ((x - x0) / 9) * 0.2 + (vnoise(x * 0.5, y * 0.5, a.s + sd) - 0.5) * 0.35 + (e < 2 ? -0.15 : 0.06);
      a.p(x, y, a.sh(HIDE, l, x, y, 0.28));
    }
    for (let i = 0; i < 4; i++) { a.p(x0 + 1, y0 + 2 + i * 4, "#d8c8a0"); a.p(x0 + 8, y0 + 2 + i * 4, "#d8c8a0"); }
    const red = hex(CLANS.hidekin.trim);
    for (let i = 0; i < 3; i++) a.p(x0 + 3 + i, y0 + 6 + (i & 1), red); a.p(x0 + 4, y0 + 9, red);
  };
  rack(3, 31, 20); rack(48, 31, 24);
  // leather banner on a crossbar over the mound
  a.seg(30, 36, 30, 4, 0.7, WOOD, 5); a.seg(24, 8, 36, 8, 0.6, WOOD, 6);
  a.banner(25, 9, 10, 17, "hidekin", { tail: true, tatter: 1, wave: 0.8, sigil: true });
  // dug soil: a fresh spoil heap and spade
  for (let y = 53; y <= 59; y++) { const hw = (y - 52) * 1.4; for (let x = Math.round(46 - hw); x <= Math.round(46 + hw); x++) a.p(x, y, a.sh(SOIL.map((c) => mix(c, "#a07040", 0.25)), 0.7 - (x - 46) / 14 + (hash(x, y, 4) - 0.5) * 0.4, x, y, 0.4)); }
  a.seg(52, 59, 50, 50, 0.6, WOOD, 7); a.rect(49, 49, 51, 50, IRON[3]);
  for (let i = 0; i < 6; i++) a.p(6 + Math.round(hash(i, 5, 8) * 10), 59 - (i & 1), SOIL[4 - (i % 3)]);
  grassTuft(a, 21, 59, 1); grassTuft(a, 41, 59, 3);
}

// ---- Veiled Circle: sandstone shrine-pavilion -----------------------------------------------------------------

function veiled(a: Art) {
  a.dirt(30, 57, 28, 4, ["#6a5230", "#8a6c40", "#ae8a54", "#cfaa6c", "#e6c888"]);
  // stepped plinth
  a.box(5, 55, 55, 59, SAND, 1, 0.64); a.box(8, 51, 52, 54, SAND, 2, 0.68);
  brickJoints(a, 5, 55, 55, 59, SAND[1], 2, 8); brickJoints(a, 8, 51, 52, 54, SAND[1], 2, 7);
  // back wall (dark) with the gold sun disc
  a.box(14, 22, 46, 50, SAND.map((c) => mix(c, "#1a1028", 0.5)), 3, 0.55, 0.2);
  const sx = 30, sy = 35;
  for (let y = sy - 8; y <= sy + 8; y++) for (let x = sx - 8; x <= sx + 8; x++) {
    const d = Math.hypot(x - sx, y - sy), ang = Math.atan2(y - sy, x - sx);
    if (d <= 5.2) a.p(x, y, d > 4.2 ? GOLD[1] : a.sh(GOLD, 0.8 - (x - sx) / 14 - (y - sy) / 20 + (d < 2 ? 0.1 : 0), x, y, 0.2));
    else if (d > 5.8 && d <= 7.8 && Math.cos(ang * 8) > 0.45) a.p(x, y, d > 7 ? GOLD[2] : GOLD[3]);
  }
  a.p(29, 34, GOLD[1]); a.p(31, 34, GOLD[1]); a.p(30, 37, GOLD[1]);
  // pillars with capitals
  for (const x0 of [10, 45]) {
    a.box(x0, 24, x0 + 4, 51, SAND, x0, 0.66);
    for (let y = 26; y < 50; y += 5) { a.rect(x0, y, x0 + 4, y, SAND[1]); }
    a.box(x0 - 1, 22, x0 + 5, 24, SAND, x0 + 1, 0.72); a.box(x0 - 1, 50, x0 + 5, 51, SAND, x0 + 2, 0.6);
  }
  // cornice and domed roof
  a.box(7, 16, 53, 21, SAND, 4, 0.72);
  for (let x = 8; x <= 52; x += 2) a.p(x, 19, SAND[1]);
  const gcol = hex(CLANS.veiled.trim);
  for (let x = 7; x <= 53; x++) { a.p(x, 21, mix(gcol, "#000000", 0.25)); a.p(x, 16, GOLD[3]); }
  for (let y = 4; y <= 15; y++) {
    const hw = Math.round(14 * Math.sqrt(Math.max(0, 1 - ((15 - y) / 12) ** 2 * (y < 15 ? 1 : 0))));
    for (let x = 30 - hw; x <= 30 + hw; x++) a.p(x, y, a.sh(["#1a1a40", "#24244e", "#2f2f66", "#44448a"], 0.62 - (x - 30) / (hw * 2.2 + 1) - (15 - y) / 40 + (x - 30 < -hw * 0.5 && y < 12 ? 0.18 : 0) + (vnoise(x * 0.6, y * 0.6, a.s + 2) - 0.5) * 0.2, x, y, 0.25));
    if (y === 15) for (let x = 30 - hw; x <= 30 + hw; x++) a.p(x, y, GOLD[2]);
  }
  a.seg(30, 6, 30, 1, 0.6, GOLD, 1); a.p(30, 0, GOLD[4]); a.p(30, 1, GOLD[3]); a.p(29, 3, GOLD[2]); a.p(31, 3, GOLD[1]);
  // indigo drapes: swagged from the cornice, gold hem, tassels
  const drape = (x0: number, x1: number, bot: number, sd: number) => {
    const cr = clanRamp(CLANS.veiled.cloth).concat([mix(hex(CLANS.veiled.cloth), "#8a8ae0", 0.35)]);
    for (let x = x0; x <= x1; x++) {
      const b = bot - Math.round(Math.sin(((x - x0) / (x1 - x0)) * Math.PI) * -4 + (x < (x0 + x1) / 2 === (x0 < 30) ? 0 : 0)) - Math.round(Math.abs(Math.sin((x - x0) * 0.9)) * 2);
      for (let y = 22; y <= b; y++) {
        const fold = Math.sin((x - x0) * 1.15 + y * 0.05), l = 0.55 + fold * 0.3 - (x - x0) / (x1 - x0) * 0.15 + (vnoise(x * 0.8, y * 0.3, a.s + sd) - 0.5) * 0.15;
        a.p(x, y, a.sh(cr, l, x, y, 0.2));
      }
      a.p(x, b, gcol); a.p(x, b - 1, GOLD[1]);
      if ((x - x0) % 4 === 0) { a.p(x, b + 1, GOLD[2]); a.p(x, b + 2, GOLD[1]); }
    }
  };
  drape(16, 26, 46, 1); drape(34, 43, 46, 2);
  for (let x = 16; x <= 43; x++) if (x < 27 || x > 33) { a.p(x, 22, GOLD[2]); a.p(x, 23, GOLD[1]); }
  // lanterns on arms beside the pillars
  for (const lx of [5, 54]) {
    a.seg(lx, 20, lx, 28, 0.5, IRON, 1);
    a.box(lx - 2, 28, lx + 2, 36, IRON, lx, 0.5);
    a.rect(lx - 1, 29, lx + 1, 35, "#ffcf52"); a.rect(lx, 30, lx, 34, "#fff0a8");
    a.p(lx - 2, 27, IRON[3]); a.p(lx + 2, 27, IRON[3]); a.rect(lx - 1, 37, lx + 1, 37, IRON[1]); a.p(lx, 38, GOLD[2]);
    a.glow(lx, 32, 10, "#ffb040", 0.7);
    for (const [dx, dy] of [[-4, 0], [4, 0], [-3, 3], [3, 3], [-3, -3], [3, -3], [0, 6]]) a.fp(lx + dx, 32 + dy, dith(lx + dx, 32 + dy) < 0.5 ? "#ffcf5288" : "#ffb04066");
  }
  for (const x of [20, 40]) { a.p(x, 52, GOLD[3]); a.p(x, 53, GOLD[2]); } // incense bowls on the steps
  grassTuft(a, 3, 59, 5, ["#6a6a2a", "#8a8a3a", "#a8a850"]); grassTuft(a, 57, 59, 6, ["#6a6a2a", "#8a8a3a", "#a8a850"]);
}

const PAINT: Record<ClanKey, (a: Art) => void> = { wardens, redfang, host, hidekin, veiled };
const SEEDS: Record<ClanKey, number> = { wardens: 11, redfang: 23, host: 37, hidekin: 41, veiled: 53 };

/** Draw one Hold on a W x H art-pixel canvas (one canvas pixel per art pixel). Exported so a page or tool can draw it without Phaser. */
export function paintHold(k: ClanKey): HTMLCanvasElement {
  const a = new Art(SEEDS[k]);
  PAINT[k](a);
  return a.render();
}

/** Builds (once) and returns the texture key of the Hold in the style of clan `k`: `hold_<k>`, HOLD_SIZE world px, hard pixels. */
export function holdTexture(scene: Phaser.Scene, k: ClanKey): string {
  const key = `hold_${k}`;
  if (scene.textures.exists(key)) return key;
  const art = paintHold(k);
  const tex = scene.textures.createCanvas(key, W * K, H * K)!;
  const g = tex.getContext();
  g.imageSmoothingEnabled = false;
  g.drawImage(art, 0, 0, W * K, H * K);
  tex.refresh();
  return key;
}
