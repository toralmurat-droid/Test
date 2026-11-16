import { hsh, mat, ramp, type IsoPaint } from "./isoPaint";
import { BONER, BRASSR, IRONR, REDR, ROPER, WOODR, wood } from "./isoProps";
import { SALT_GLOWS } from "./saltmereReg";

/**
 * The trade of Saltmere's three public buildings (shared/saltmere.ts SALT_BUILDINGS), painted on the house canvas by
 * houseLife.ts dressHouse() the way the fisher style paints nets and creels: the Gull & Anchor tavern, the Chandlery
 * and the Smokehouse. Lamp glow after dusk is registered in SALT_GLOWS (ambient.ts lights it). Cosmetic only.
 */

/** A window pane on the front wall (world px: x range, z range). */
export interface WinRect { x0: number; x1: number; z0: number; z1: number }

const AMBER = [0x7a3a10, 0xb8601a, 0xe8a030, 0xffd070, 0xfff0b0];
const SOOT = [0x1a1612, 0x2c2620, 0x3e362c, 0x5a3a1a, 0x8a5a24, 0xb8803a];
const SIGN_BOARD = [0x0e1c26, 0x18303c, 0x244858, 0x34627a];
const SIGN_CREAM = [0x6a5a38, 0x9a8858, 0xc8b878, 0xe8dca0];
const SIGN_WHITE = [0x5a6068, 0x9aa2aa, 0xd0d8dc, 0xf4f8f8];
const LAMPR = [0xc05a18, 0xf08a2c, 0xffc860, 0xffeaa8, 0xfff8e0];
const HERRING = [0x1e262c, 0x34424a, 0x52646e, 0x7a8e98, 0xa8bcc4, 0xd4e2e6];
/** The Gull & Anchor's sign: a gull over an anchor (W gull, C anchor, . sea). */
const GULL_ANCHOR = [
  "..............", ".WW........WW.", "..WWW....WWW..", "....WWWWWW....", ".......WW.....", "......CC......", ".....CCCC.....",
  "......CC......", "..C...CC...C..", "..CC..CC..CC..", "...CCCCCCCC...",
];
/** The chandlery's sign: a coil of rope. */
const ROPE_COIL = ["..........", "...CCCC...", "..C....C..", ".C..CC..C.", ".C..CC..C.", "..C....C..", "...CCCC...", ".........."];

/** A board hanging from a bracket that sticks out of the front wall at x, showing a pixel picture on its east face. */
function hangingSign(q: IsoPaint, x: number, Y1: number, zTop: number, pic: string[]) {
  const rows = pic.length, cols = pic[0].length, w = cols + 2, h = rows + 2, v0 = Y1 + 4;
  q.rod([x, Y1 + 0.8, zTop + 2.4], [x, v0 + w + 2, zTop + 2.4], 0.75, wood(WOODR, 0.05, 20));
  q.rod([x, Y1 + 0.8, zTop - 4], [x, Y1 + 12, zTop + 2.4], 0.55, wood(WOODR, 0, 16));
  q.blob([x, v0 + w + 2.4, zTop + 2.4], 0.9, 0.9, 0.9, mat(IRONR, 0.1)); // scroll end
  for (const v of [v0 + 1, v0 + w - 1]) q.rod([x, v, zTop + 2.4], [x, v, zTop], 0.3, mat(IRONR, 0));
  q.box(x - 0.8, x + 0.8, v0, v0 + w, zTop - h, zTop, wood(WOODR, 0.05, 14));
  q.quad([x + 0.85, v0, zTop], [0, w, 0], [0, 0, -h], (l, s, t, px, py) => {
    const c = Math.floor(s * w) - 1, r = Math.floor(t * h) - 1;
    if (c < 0 || r < 0 || c >= cols || r >= rows) return ramp(WOODR, 0.55 + l * 0.2, px, py); // the frame
    const ch = pic[r][c];
    return ch === "W" ? ramp(SIGN_WHITE, 0.55 + l * 0.5, px, py) : ch === "C" ? ramp(SIGN_CREAM, 0.5 + l * 0.5, px, py) : ramp(SIGN_BOARD, 0.35 + l * 0.7, px, py);
  }, undefined, 0.6);
}
/** A stave barrel standing at (x, y) with iron hoops. */
function barrel(q: IsoPaint, x: number, y: number, h = 9) {
  q.rod([x, y, 0], [x, y, h], 4.2, (l, s, _t, px, py) => ramp(WOODR, l * 1.05 + (Math.floor(s * 12) % 2 ? 0.05 : -0.07), px, py));
  for (const z of [1.6, h - 1.8]) q.rod([x, y, z], [x, y, z + 0.6], 4.45, mat(IRONR, 0.05));
  q.blob([x, y, h], 3.9, 3.9, 0.6, wood(WOODR, 0.1, 8), 0.5, 1);
}
/** A lantern hung from a bracket at x; it also gets a warm glow after dusk (ambient.ts). */
function bracketLantern(q: IsoPaint, x: number, Y1: number, z: number) {
  q.rod([x, Y1 + 0.5, z + 5], [x, Y1 + 7.5, z + 5], 0.55, mat(IRONR, 0));
  q.rod([x, Y1 + 7.5, z + 5], [x, Y1 + 7.5, z + 4], 0.3, mat(IRONR, 0));
  q.box(x - 1.9, x + 1.9, Y1 + 5.6, Y1 + 9.4, z, z + 4, (l, s, t, px, py) => (s > 0.15 && s < 0.85 && t > 0.15 && t < 0.85 ? ramp(LAMPR, 0.55 + t * 0.4, px, py) : ramp(IRONR, l, px, py)));
  q.blob([x, Y1 + 7.5, z + 4.2], 2.3, 2.3, 1.2, mat(IRONR, 0.1), 0.5, 1);
  SALT_GLOWS.push({ x, y: Y1 + 7.5, z: z + 2, r: 1.1, k: 0.8 });
}

/** Paints one of the three buildings' trade on the front and east walls (`q` paints in the house's world px). */
export function dressSalt(ctx: CanvasRenderingContext2D, q: IsoPaint, left: number, topY: number, style: "tavern" | "smokehouse" | "chandlery",
  b: { X0: number; X1: number; Y0: number; Y1: number; wallH: number; wins?: WinRect[] }, R: (k: number) => number,
  doorX: number, clear: (x0: number, x1: number) => boolean) {
  const { X0, X1, Y0, Y1, wallH } = b;
  const S = (x: number, y: number, z = 0) => ({ x: x - y - left, y: (x + y) / 2 - z - topY });
  const poly = (pts: { x: number; y: number }[], fill: string) => { ctx.fillStyle = fill; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); };
  const dx = doorX > -1e8 ? doorX : X0 + (X1 - X0) / 2 - 16;
  if (style === "tavern") {
    // lamplit windows: amber panes with a mullion cross, glowing at night (SALT_GLOWS)
    for (const w of b.wins ?? []) {
      q.quad([w.x0 + 0.5, Y1 + 0.5, w.z1 - 0.5], [w.x1 - w.x0 - 1, 0, 0], [0, 0, -(w.z1 - w.z0 - 1)], (_l, s, t, px, py) => {
        if (Math.abs(s - 0.5) < 0.07 || Math.abs(t - 0.45) < 0.06) return ramp(WOODR, 0.4, px, py);
        return ramp(AMBER, 0.62 + (1 - t) * 0.38 + (hsh(px, py, 9) - 0.5) * 0.1, px, py);
      }, undefined, 0.6);
      SALT_GLOWS.push({ x: (w.x0 + w.x1) / 2, y: Y1 + 1, z: (w.z0 + w.z1) / 2, r: 0.85, k: 0.5 });
    }
    hangingSign(q, X1 - 12, Y1, 49, GULL_ANCHOR);
    bracketLantern(q, dx - 5, Y1, 22);
    // a bench along the front, barrels by the door
    const bx = Math.max(X0 + 8, dx - 62);
    if (clear(bx, bx + 36)) {
      q.box(bx, bx + 36, Y1 + 3, Y1 + 9.5, 7.2, 9, wood(WOODR, 0.1, 24));
      for (const lx of [bx + 3, bx + 31]) q.box(lx, lx + 2.4, Y1 + 4, Y1 + 8.5, 0, 7.2, wood(WOODR, -0.05, 8));
      q.blob([bx + 12, Y1 + 6, 10.6], 1.4, 1.4, 1.8, mat(BRASSR, 0.05)); // a forgotten tankard
    }
    const rx = dx + 42;
    if (rx + 12 < X1 - 2) { barrel(q, rx, Y1 + 7); barrel(q, rx + 11, Y1 + 8, 10); barrel(q, rx + 5.5, Y1 + 6, 9); }
    return;
  }
  if (style === "chandlery") {
    // coils of rope and a line of floats on the wall, a barrel of oars and lanterns at the door, a small sign
    for (const [cx, cz, r] of [[X0 + 12, 24, 6.2], [X0 + 24, 14, 4.6]] as const) {
      q.blob([cx, Y1 + 1.6, cz], r, 1.8, r, (l, _s, t, px, py) => ramp(ROPER, l * 0.95 + (Math.floor(t * 6) % 2 ? 0.05 : -0.12), px, py));
      q.rod([cx - 2, Y1 + 0.4, cz + r + 1.5], [cx + 2, Y1 + 0.4, cz + r + 1.5], 0.7, mat(IRONR, 0.1)); // its peg
    }
    q.rod([X0 + 3, Y1 + 1.8, 30], [X0 + 30, Y1 + 1.8, 30], 0.35, mat(ROPER, -0.1));
    for (let k = 0; k < 6; k++) q.blob([X0 + 5 + k * 4.6, Y1 + 2.2, 28.4], 1.3, 1.3, 1.5, (l, _s, _t, px, py) => ramp(k % 2 ? BONER : REDR, l, px, py));
    bracketLantern(q, dx - 5, Y1, 22);
    bracketLantern(q, dx + 37, Y1, 22);
    hangingSign(q, X1 - 10, Y1, 50, ROPE_COIL);
    const bx = dx + 46;
    if (bx + 8 < X1) {
      barrel(q, bx, Y1 + 7, 10);
      for (const [k, lean] of [[0, -0.2], [1, 0.1], [2, 0.3]] as const) { // oars standing in it
        const ox = bx - 2 + k * 2, top: [number, number, number] = [ox + lean * 10, Y1 + 6 - lean * 6, 44 + k * 2];
        q.rod([ox, Y1 + 7, 8], top, 0.7, wood(WOODR, 0.15, 36));
        q.box(top[0] - 1.4, top[0] + 1.4, top[1] - 0.6, top[1] + 0.6, top[2] - 1, top[2] + 7, wood(WOODR, 0.2, 8));
      }
    }
    return;
  }
  // smokehouse: soot over the door, fish smoking under the eaves, a woodpile, barrels and a crate of herring
  for (let k = 0; k < 3; k++) {
    const x0 = dx + 7 + k * 6, h = 14 + R(k + 1) * 14;
    poly([S(x0, Y1 + 0.2, 25), S(x0 + 7, Y1 + 0.2, 25), S(x0 + 5, Y1 + 0.2, 25 + h), S(x0 + 2, Y1 + 0.2, 25 + h * 0.7)], "rgba(14,10,8,0.3)");
  }
  const fy = wallH - 6, fx0 = X0 + 6, fx1 = X1 - 10;
  q.rod([fx0, Y1 + 1.5, fy + 3], [fx1, Y1 + 1.5, fy + 3], 0.3, mat(ROPER));
  for (let x = fx0 + 3; x < fx1 - 2; x += 3.6 + R(x) * 1.6) if (clear(x, x + 1)) q.blob([x, Y1 + 2, fy - 1.5], 0.95, 0.6, 3.6, (l, _s, t, px, py) => ramp(SOOT, 0.2 + l * 0.35 + t * 0.35, px, py));
  const bx = dx + 44;
  if (bx + 10 < X1) { barrel(q, bx, Y1 + 7); barrel(q, bx + 10, Y1 + 8.5, 8); }
  if (dx - 24 > X0 + 4) {
    q.box(dx - 24, dx - 8, Y1 + 3, Y1 + 9, 0, 4, wood(WOODR, 0, 12));
    for (let k = 0; k < 3; k++) q.blob([dx - 20 + k * 5, Y1 + 6, 4.6], 1.5, 3, 1.3, (l, _s, _t, px, py) => ramp(HERRING, l + 0.1, px, py));
  }
  for (let row = 0; row < 3; row++) for (let i = 0; i < 6 - row; i++) { // woodpile against the east wall
    const v = Y0 + 12 + i * 4.4 + row * 2.2, z = 2 + row * 3.6;
    q.rod([X1 + 1.6, v, z], [X1 + 9, v, z], 1.9, (l, _s, _t, px, py) => ramp(WOODR, l * 0.9 + 0.05 + (hsh(i, row, 4) - 0.5) * 0.15, px, py));
    q.blob([X1 + 9, v, z], 0.5, 1.7, 1.7, (l, _s, _t, px, py) => ramp(i % 2 ? [0x6a4a2a, 0x92703f, 0xb8925a] : [0x5a3c20, 0x80602e, 0xa8824a], 0.6 + l * 0.3, px, py));
  }
}
