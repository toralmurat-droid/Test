import Phaser from "phaser";
import { ART_K as K } from "../../shared/constants";
import { hiResTexture } from "./smooth";
import { dith, OUT, vnoise, type Px } from "./shrineArt";

/**
 * Hand-built pixel art for the bounty boards (shared/bounty.ts), in the village bonfire's style like the shrine
 * (shrineArt.ts): one colour per cell on a half design-unit grid, three-tone wood lit from the top left, ordered
 * dithering and dark outlines. Two weathered posts carry a plank notice board under a little shingle roof;
 * three parchment notices are nailed to it (one with a red wax seal, one with a crude drawing of the quarry),
 * moss creeps up the posts and grass tufts hide their feet.
 */
const W = 64, H = 84, CX = 32, BY = 78; // cells; BY = the posts' feet (the sprite's feet)
export const BOARD_FW = W / 2, BOARD_FH = H / 2, BOARD_FOOT = BY / H;

const WOOD = ["#2a1a10", "#3d2817", "#553a22", "#6e4d2e", "#8a6640"]; // dark .. lit
const PAPER = ["#6b5a3e", "#9c8760", "#c4b083", "#e0d0a4"];
const SHINGLE = ["#241914", "#3a2a20", "#54402f", "#6d5640"];

const wood = (lit: number, grain: number) => WOOD[Math.max(0, Math.min(4, Math.round(1.6 + lit * 1.6 + grain)))];

function paintBoard(g: CanvasRenderingContext2D) {
  g.save();
  g.scale(0.5, 0.5);
  const cells = new Map<number, string>();
  const px: Px = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) cells.set(y * W + x, c); };

  // posts: square timbers, lit on the left face, dark on the right
  for (const pxl of [CX - 19, CX + 15]) {
    for (let y = 22; y <= BY; y++) for (let x = pxl; x < pxl + 5; x++) {
      const face = x - pxl < 2 ? 0.7 : x - pxl < 4 ? 0 : -0.8;
      const gr = (vnoise(x * 0.9, y * 0.18, 999, 7) - 0.5) * 1.2;
      px(x, y, wood(face, gr));
      // moss creeping up from the ground
      if (y > BY - 9 && vnoise(x * 0.7, y * 0.5, 999, 3) + (y - (BY - 9)) * 0.06 > 0.85 && dith(x, y) < 0.7) px(x, y, y > BY - 4 ? "#3f5a26" : "#2f4a1e");
    }
  }
  // the board: four planks with gaps, a frame batten top and bottom
  const bx0 = CX - 24, bx1 = CX + 24, by0 = 26, by1 = 56;
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    const plank = Math.floor((y - by0) / 8), edge = (y - by0) % 8 === 7;
    const lit = 0.35 - (x - bx0) / (bx1 - bx0) * 0.6 - (y - by0) / (by1 - by0) * 0.3;
    const gr = (vnoise(x * 0.16 + plank * 9, y * 0.9, 999, 11) - 0.5) * 1.6;
    let c = wood(lit, gr);
    if (edge) c = WOOD[0];
    // weathering: grey sun-bleach on the top planks, a split in the third
    if (plank === 0 && vnoise(x * 0.3, y * 0.6, 999, 5) > 0.62 && dith(x, y) < 0.5) c = "#6f665a";
    if (plank === 2 && x > CX + 6 && x < CX + 17 && y === by0 + 2 * 8 + 3 + ((x >> 2) & 1)) c = WOOD[0];
    px(x, y, c);
  }
  for (const yy of [by0 - 1, by1 + 1]) for (let x = bx0 - 2; x <= bx1 + 2; x++) px(x, yy, wood(yy < by0 ? 0.6 : -0.5, (vnoise(x * 0.3, yy, 999, 9) - 0.5)));
  // little shingle roof
  for (let y = 14; y <= 24; y++) {
    const half = 27 + (y - 14) * 0.6;
    for (let x = Math.round(CX - half); x <= Math.round(CX + half); x++) {
      const row = Math.floor((y - 14) / 3), off = row % 2 ? 2 : 0, seam = ((x + off) % 5 === 0) || (y - 14) % 3 === 2;
      const lit = x < CX ? 1 : 0;
      let c = SHINGLE[seam ? 0 : lit + 1 + (vnoise(x * 0.5, y, 999, 13) > 0.6 ? 1 : 0)];
      if (y === 14 || x === Math.round(CX - half) || x === Math.round(CX + half)) c = OUT;
      if (!seam && vnoise(x * 0.4, y * 0.7, 999, 17) > 0.78 && dith(x, y) < 0.6) c = "#3d5224"; // moss on the roof
      px(x, y, c);
    }
  }
  // three notices: parchment, ruled with "writing", nailed at the top
  const note = (x0: number, y0: number, w: number, h: number, tilt: number, seed: number, mark: "seal" | "map" | "skull") => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = x0 + x + Math.round(y * tilt), sy = y0 + y;
      const curl = (x === w - 1 && y > h - 4) || (x === 0 && y === h - 1);
      if (curl) continue;
      const shade = (x === w - 1 || y === h - 1) ? 0 : vnoise(x * 0.6 + seed, y * 0.6, 999, seed) > 0.7 ? 1 : 2 + (x < 2 && y < 3 ? 1 : 0);
      let c = PAPER[shade];
      if (y >= 4 && y < h - 3 && y % 2 === 0 && x >= 2 && x < w - 2 && vnoise(x * 0.8 + seed * 3, y, 999, seed + 1) > 0.38) c = "#4a3a26"; // writing
      px(sx, sy, c);
    }
    // the drawing at the bottom of the note
    const mx = x0 + Math.round(w / 2) + Math.round((h - 3) * tilt), my = y0 + h - 5;
    if (mark === "seal") { for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [2, 1], [0, 2], [1, 2], [0, -1], [1, -1]]) px(mx + dx, my + dy + 1, dx === 0 && dy <= 0 ? "#c8443a" : "#8e2a22"); }
    if (mark === "skull") { for (const [dx, dy] of [[-1, 0], [0, 0], [1, 0], [-1, 1], [1, 1], [0, 2]]) px(mx + dx, my + dy, "#2a1d12"); }
    if (mark === "map") { for (let i = -3; i <= 3; i++) px(mx + i, my + 1 + (Math.abs(i) === 2 ? -1 : 0), "#7a2a22"); px(mx + 3, my, "#7a2a22"); }
    // nail
    px(x0 + (w >> 1), y0, "#1a1410"); px(x0 + (w >> 1), y0 + 1, "#9a9082");
  };
  note(CX - 20, 29, 12, 15, 0.06, 3, "skull");
  note(CX - 5, 27, 11, 17, -0.04, 7, "seal");
  note(CX + 9, 31, 12, 14, 0.08, 11, "map");
  // a dagger stuck in the board, pinning one more scrap
  for (let i = 0; i < 6; i++) px(CX + 18 - i, 46 + i, i < 2 ? "#3b2a1c" : "#b9b4aa");
  // grass tufts at the posts' feet
  for (let x = CX - 24; x <= CX + 24; x++) {
    const h = Math.round(vnoise(x * 0.7, 3, 999, 23) * 5);
    for (let y = 0; y < h; y++) if (dith(x, y) < 0.8 - y * 0.12) px(x, BY + 1 - y, y > 2 ? "#5c7a32" : "#3f5a26");
  }

  // dark outline round every filled cell (the bonfire style), then a soft shadow under everything
  const filled = new Set(cells.keys());
  for (const k of filled) {
    const x = k % W, y = (k / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nk = (y + dy) * W + (x + dx);
      if (x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H && !filled.has(nk) && !cells.has(nk)) cells.set(nk, OUT);
    }
  }
  for (let y = BY - 4; y <= BY + 5; y++) for (let x = 0; x < W; x++) {
    const ex = (x - CX) / 30, ey = (y - BY - 1) / 5, d = ex * ex + ey * ey;
    if (d < 1 && !cells.has(y * W + x) && dith(x, y) < (1 - d) * 0.8) { g.fillStyle = "rgba(10,8,6,0.45)"; g.fillRect(x, y, 1, 1); }
  }
  for (const [k, c] of cells) { g.fillStyle = c; g.fillRect(k % W, (k / W) | 0, 1, 1); }
  g.restore();
}

export function boardTexture(scene: Phaser.Scene) {
  hiResTexture(scene, "bounty_board", BOARD_FW * K, BOARD_FH * K, 1, 4, (g) => { g.scale(K, K); paintBoard(g); });
}
