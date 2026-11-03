/**
 * Pixel-art ornaments for the opened world map: a dark, weathered iron-and-oak frame with riveted bands,
 * iron corner plates set with blood-red gems, and wrought clasps on each side. Everything is painted
 * procedurally on small canvases (1 design pixel = S screen pixels) and shown with hard pixels.
 */
const S = 3; // screen pixels per design pixel
export const FRAME = 12; // frame thickness in design pixels (border is FRAME * S css px)
const EDGE = 12; // length of one repeating edge tile

const C = {
  ink: "#07060a", ironD: "#1f1d1c", iron: "#3a3633", ironL: "#5d5751", ironH: "#8a837a",
  woodD: "#1e140c", wood: "#33231a", woodL: "#4a3424", rust: "#6b3a1f",
  gemD: "#4a0c0c", gem: "#8f1d1a", gemL: "#d2483a", gemH: "#ffb08a", gold: "#8a6a2e", goldL: "#c69a45",
};

/** Small deterministic hash for weathering speckles. */
const h = (x: number, y: number, k = 0) => {
  let n = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

function canvas(w: number, hgt: number) {
  const c = document.createElement("canvas");
  c.width = w * S; c.height = hgt * S;
  const g = c.getContext("2d")!;
  const px = (x: number, y: number, col: string) => { g.fillStyle = col; g.fillRect(x * S, y * S, S, S); };
  return { c, g, px };
}

/** Colour of the frame band at depth t (0 = outer edge .. FRAME-1 = inner edge), position u along it. */
function band(t: number, u: number): string {
  if (t === 0 || t === FRAME - 1) return C.ink;
  if (t === 1) return h(u, 1) < 0.15 ? C.iron : C.ironL;
  if (t === 2) return C.iron;
  if (t === 3) return C.ironD;
  if (t === FRAME - 2) return C.ironL;
  if (t === FRAME - 3) return C.ironD;
  // weathered oak in the middle, with grain lines and worn spots
  const r = h(u, t, 3);
  if ((t === 5 && (u % 7 === 2 || u % 7 === 3)) || (t === 7 && u % 5 === 0)) return C.woodD;
  if (r < 0.12) return C.woodD;
  if (r > 0.9) return C.woodL;
  return C.wood;
}

/** Rivet at band centre. */
function rivet(px: (x: number, y: number, c: string) => void, x: number, y: number) {
  px(x, y, C.ironH); px(x + 1, y, C.ironL); px(x, y + 1, C.ironL); px(x + 1, y + 1, C.ironD);
}

/** Iron corner plate (FRAME x FRAME) with a red gem, drawn for the top-left corner. */
function corner(px: (x: number, y: number, c: string) => void) {
  for (let y = 0; y < FRAME; y++) for (let x = 0; x < FRAME; x++) {
    const edge = x === 0 || y === 0 || x === FRAME - 1 || y === FRAME - 1;
    let col = edge ? C.ink : x === 1 || y === 1 ? C.ironL : x === FRAME - 2 || y === FRAME - 2 ? C.ironD : C.iron;
    if (!edge && col === C.iron && h(x, y, 9) < 0.14) col = C.rust;
    px(x, y, col);
  }
  // gem: diamond in the middle
  const m = FRAME / 2 - 0.5;
  for (let y = 2; y < FRAME - 2; y++) for (let x = 2; x < FRAME - 2; x++) {
    const d = Math.abs(x - m) + Math.abs(y - m);
    if (d <= 3.5) px(x, y, d > 2.5 ? C.ink : x + y < 2 * m - 1 ? C.gemL : x + y > 2 * m + 1 ? C.gemD : C.gem);
  }
  px(5, 4, C.gemH);
  // rivets in the four plate corners
  for (const [x, y] of [[2, 2], [FRAME - 4, 2], [2, FRAME - 4], [FRAME - 4, FRAME - 4]]) rivet(px, x, y);
}

/** Border-image for the frame: corners + repeating edge tiles. Returns the CSS values to use. */
export function frameBorderImage(): string {
  const N = FRAME * 2 + EDGE;
  const { c, px } = canvas(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const inX = x >= FRAME && x < FRAME + EDGE, inY = y >= FRAME && y < FRAME + EDGE;
    if (inX && inY) continue; // centre stays empty
    if (inX) { const t = y < FRAME ? y : N - 1 - y; px(x, y, band(t, x)); }
    else if (inY) { const t = x < FRAME ? x : N - 1 - x; px(x, y, band(t, y)); }
  }
  // rivets on each edge tile, centred in the oak
  rivet(px, FRAME + 5, 5); rivet(px, FRAME + 5, N - 7);
  rivet(px, 5, FRAME + 5); rivet(px, N - 7, FRAME + 5);
  // corners: mirror the top-left plate into all four
  const plate = canvas(FRAME, FRAME); corner(plate.px);
  const g = c.getContext("2d")!;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    g.save();
    g.translate(sx < 0 ? N * S : 0, sy < 0 ? N * S : 0);
    g.scale(sx, sy);
    g.drawImage(plate.c, 0, 0);
    g.restore();
  }
  return `url(${c.toDataURL()}) ${FRAME * S} / ${FRAME * S}px repeat`;
}

/** Wrought-iron clasp with a small gem, for the middle of the left / right / bottom edges (horizontal form). */
export function clasp(vertical = false): HTMLCanvasElement {
  const W = 22, H = 14;
  const { c, px } = canvas(vertical ? H : W, vertical ? W : H);
  const P = (x: number, y: number, col: string) => (vertical ? px(y, x, col) : px(x, y, col));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = Math.abs(x - (W - 1) / 2), dy = Math.abs(y - (H - 1) / 2);
    // pointed lozenge plate with curled ends
    const inside = dy <= 6.5 - dx * 0.55 || (dx > 7 && dx < 10.5 && dy < 2.5);
    if (!inside) continue;
    const rim = dy > 5.5 - dx * 0.55 && !(dx > 7 && dy < 2);
    P(x, y, rim ? C.ink : y < (H - 1) / 2 - 2 ? C.ironL : y > (H - 1) / 2 + 2 ? C.ironD : C.iron);
  }
  for (const x of [1, W - 2]) for (let y = 5; y <= 8; y++) P(x, y, C.ink);
  // gem
  for (let y = 4; y <= 9; y++) for (let x = 8; x <= 13; x++) {
    const d = Math.abs(x - 10.5) + Math.abs(y - 6.5);
    if (d <= 3) P(x, y, d > 2 ? C.ink : x + y < 17 ? C.gemL : x + y > 17 ? C.gemD : C.gem);
  }
  P(10, 5, C.gemH);
  rivet(P, 4, 6); rivet(P, W - 6, 6);
  c.className = "wm-orn";
  return c;
}

/** Title plaque: a dark iron plate with gilded trim and riveted ends, sized to fit the title canvas. */
export function plaque(titleW: number, titleH: number): HTMLCanvasElement {
  const W = Math.ceil(titleW / S) + 20, H = Math.ceil(titleH / S) + 6;
  const { c, px } = canvas(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // notched (cut) ends
    const end = Math.min(x, W - 1 - x), dy = Math.abs(y - (H - 1) / 2);
    if (end < 4 && dy > end + (H - 1) / 2 - 4) continue;
    const rim = end === 0 || y === 0 || y === H - 1 || (end < 4 && dy > end + (H - 1) / 2 - 5);
    let col = rim ? C.ink : y === 1 || y === H - 2 ? C.gold : y === 2 ? C.goldL : C.ironD;
    if (col === C.ironD && h(x, y, 5) < 0.06) col = C.iron;
    if (col === C.ironD && h(x, y, 6) < 0.03) col = C.rust;
    px(x, y, col);
  }
  const my = Math.floor(H / 2) - 1;
  rivet(px, 5, my); rivet(px, W - 7, my);
  c.className = "wm-plaque";
  return c;
}
