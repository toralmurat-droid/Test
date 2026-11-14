import Phaser from "phaser";
import { ART_K as K } from "../../shared/constants";
import { hiResTexture } from "./smooth";
import { dith, OUT, vnoise, type Px } from "./shrineArt";
import { IsoPaint, ramp, hsh as hash } from "./isoPaint";

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


function paintBoard(g: CanvasRenderingContext2D) {
  g.save();
  g.scale(0.5, 0.5);
  const cells = new Map<number, string>();
  const px: Px = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) cells.set(y * W + x, c); };

  // Modelled in 3D (isoPaint.ts; Murat 2026-11-13: the face-on board looked flat): the board faces down-left like the
  // other village props, two square posts, a little gable roof of shingles over it, the notices nailed on its face.
  const n = (c: string) => parseInt(c.slice(1), 16), N = (pal: string[]) => pal.map(n);
  const WOODN = N(WOOD), PAPERN = N(PAPER), SHN = N(SHINGLE);
  const pen = { px: (x: number, y: number, c: number) => px(Math.round(x), Math.round(y), "#" + c.toString(16).padStart(6, "0")), line() {}, rect() {}, shaft() {} };
  const q = new IsoPaint(pen, W, H, CX, BY - 1);
  const timber = (l: number, s: number, t: number, x: number, y: number) => ramp(WOODN, l + (vnoise(s * 3, t * 20, 999, 5) - 0.5) * 0.3, x, y);
  for (const u of [-14, 14]) { q.box(u - 1.8, u + 1.8, -1.8, 1.8, 0, 50, timber); q.blob([u, 0, 1], 2.8, 2.8, 1.6, (l, _s, _t, x, y) => ramp([0x2a3a1c, 0x3f5a26, 0x5c7a32], l, x, y), 0.5, 1); }
  // the board: planks running along it, a frame round the edge
  q.box(-15.5, 15.5, 1.8, 3, 20, 44, (l, s2, t, x, y) => {
    const edge = s2 < 0.04 || s2 > 0.96 || t < 0.06 || t > 0.94;
    return ramp(WOODN, l - (edge ? 0 : 0.1) + (Math.floor(t * 8) !== Math.floor((t + 0.012) * 8) ? -0.3 : 0) + (vnoise(s2 * 30, t * 6, 999, 2) - 0.5) * 0.25, x, y);
  }, 6);
  // gable roof of shingles along the board, its ridge over the posts
  for (const side of [-1, 1]) q.quad([-18, 0, 55], [36, 0, 0], [0, side * 7.5, -6], (l, s2, t, x, y) => {
    const row = Math.floor(t * 4), off = row % 2 ? 0.5 : 0;
    return ramp(SHN, l + ((Math.floor(s2 * 12 + off) % 2) ? 0.06 : -0.04) - (t * 4 - row > 0.8 ? 0.2 : 0) + (hash(Math.floor(s2 * 24), row, 3) < 0.1 ? -0.25 : 0), x, y);
  });
  q.box(-18.5, 18.5, -0.7, 0.7, 54.4, 56, timber); // ridge beam
  // notices nailed to the face: a sealed decree, a list, a crude map of the quarry
  const note = (u0: number, z0: number, w: number, h: number, kind: "seal" | "list" | "map") => {
    q.quad([u0, 3.1, z0], [w, 0, 0], [0, 0.15, -h], (l, s2, t, x, y) => {
      if (t > 0.92 && hash(Math.floor(s2 * 10), 1, 4) < 0.4) return undefined; // torn bottom edge
      if (kind === "seal" && Math.hypot(s2 - 0.5, t - 0.8) < 0.14) return ramp([0x3a0a0a, 0x7a1414, 0xb02a20], l + 0.1, x, y);
      if (kind === "list" && t > 0.15 && t < 0.85 && Math.floor(t * 12) % 2 === 0 && s2 > 0.15 && s2 < 0.85 - hash(Math.floor(t * 12), 0, 7) * 0.4) return 0x4a3a28;
      if (kind === "map" && (Math.abs(Math.sin(s2 * 9 + t * 3) * 0.3 + 0.5 - t) < 0.05 || Math.hypot(s2 - 0.66, t - 0.4) < 0.08)) return 0x5a2a1a;
      if (kind === "seal" && t > 0.2 && t < 0.6 && Math.floor(t * 14) % 2 === 0 && s2 > 0.2 && s2 < 0.8) return 0x4a3a28;
      return ramp(PAPERN, l + 0.05 - t * 0.15, x, y);
    }, undefined, 0.5);
    q.plot(u0 + w / 2, 3.4, z0 - 0.6, 0x3a3634, 1);
  };
  note(-13, 42, 8, 10, "seal"); note(-3.5, 41, 7, 12, "list"); note(5, 42.5, 8.5, 9.5, "map");
  // a dagger stuck in the board, pinning one more scrap
  note(7, 31, 5, 6, "list");
  q.rod([9.5, 6.5, 30], [9.5, 3, 28.4], 0.35, (l, _s, _t, x, y) => ramp([0x5a5a5e, 0x8a8a90, 0xb9b4aa], l, x, y));
  q.box(9, 10, 5.8, 7.8, 29.6, 30.4, () => 0x3b2a1c);
  // grass tufts round the posts' feet
  for (let i = 0; i < 40; i++) {
    const u = (hash(i, 1, 23) - 0.5) * 36, v = (hash(i, 2, 23) - 0.5) * 8, h = 1 + Math.round(hash(i, 3, 23) * 3);
    for (let z = 0; z < h; z++) q.plot(u, v, z, z > 1 ? 0x5c7a32 : 0x3f5a26);
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
