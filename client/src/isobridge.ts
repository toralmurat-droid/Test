import Phaser from "phaser";
import { MAP_H, MAP_W, TILE } from "../../shared/constants";
import { GROUND, T } from "../../shared/map";
import { SMOOTH } from "./isoflag";
import { hiResTexture } from "./smooth";

/**
 * Isometric wooden bridges and piers. The bridge tiles keep their place in the game world (you walk on them as
 * before); only the drawing changes: water flows under them, and each tile becomes a plank deck with a thick
 * beam side, piles standing in the water, a shadow on the water and a railing along the water sides.
 * The deck sits at ground level; the water is drawn as lying below it.
 */

const IW = TILE * 2, IH = TILE;
/** Room above the deck for railings, and below it for the beam, piles and shadow (screen px). */
const UP = 16, DOWN = 16;
const BEAM = 5, RAIL = 11;
const HT = UP + IH + DOWN;

const gnd = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? -1 : GROUND[y][x]);
const isWater = (x: number, y: number) => { const g = gnd(x, y); return g === T.WATER || g === -1; };
const isBridge = (x: number, y: number) => gnd(x, y) === T.BRIDGE;
const hash = (x: number, y: number, s: number) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");

/** Screen point (in a bridge texture) of a world-local point (0..TILE) on the deck, lifted by `up` px. */
const P = (x: number, y: number, up = 0) => ({ x: IW / 2 + x - y, y: UP + (x + y) / 2 - up });

const PLANKS = [0x8b5a2b, 0x94622f, 0x7f5226, 0x9a6834, 0x86572a];
const BEAM_C = 0x5a3a1c, BEAM_DARK = 0x452b14, POST = 0x6b4424, POST_LIT = 0x8d5e32, POST_DARK = 0x3e2711;

interface Sides { n: boolean; e: boolean; s: boolean; w: boolean } // true = water on that side

/** The deck: shadow and piles in the water, beam sides, planks, and the railing on the far (north, west) sides. */
function deckTexture(scene: Phaser.Scene, alongX: boolean, w: Sides, v: number) {
  const key = `bridge_deck_${alongX ? "x" : "y"}_${+w.n}${+w.e}${+w.s}${+w.w}_${v}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, IW, HT)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  const poly = (pts: { x: number; y: number }[], c: string) => { ctx.fillStyle = c; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); };
  const L = P(0, TILE), B = P(TILE, TILE), R = P(TILE, 0);

  // Shadow cast on the water in front of the deck
  if (w.s) poly([L, B, { x: B.x + 4, y: B.y + BEAM + 7 }, { x: L.x + 4, y: L.y + BEAM + 7 }], "rgba(10,30,60,0.32)");
  if (w.e) poly([B, R, { x: R.x + 4, y: R.y + BEAM + 7 }, { x: B.x + 4, y: B.y + BEAM + 7 }], "rgba(10,30,60,0.32)");

  // Piles going down into the water, with a ring of ripples where they enter it
  const pile = (p: { x: number; y: number }) => {
    const x = Math.round(p.x) - 2, y = Math.round(p.y) + BEAM, h = 8;
    ctx.fillStyle = hex(POST_DARK); ctx.fillRect(x, y, 4, h);
    ctx.fillStyle = hex(POST); ctx.fillRect(x, y, 3, h);
    ctx.fillStyle = hex(POST_LIT); ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = "rgba(216,236,255,0.75)"; ctx.fillRect(x - 2, y + h, 8, 1);
    ctx.fillStyle = "rgba(216,236,255,0.35)"; ctx.fillRect(x - 3, y + h - 1, 1, 1); ctx.fillRect(x + 6, y + h - 1, 1, 1);
  };
  const pileAt = alongX ? [TILE / 2] : [TILE / 2];
  if (w.s) for (const t of pileAt) pile(P(t, TILE));
  if (w.e) for (const t of pileAt) pile(P(TILE, t));
  if (w.s && w.e) pile(B);

  // Beam sides (the thickness of the deck), lit on the south-west, shaded on the south-east
  const face = (a: { x: number; y: number }, b: { x: number; y: number }, base: number, shade: number, ends: boolean) => {
    poly([a, b, { x: b.x, y: b.y + BEAM }, { x: a.x, y: a.y + BEAM }], hex(base));
    ctx.fillStyle = `rgba(20,12,4,${shade})`;
    poly([a, b, { x: b.x, y: b.y + BEAM }, { x: a.x, y: a.y + BEAM }], `rgba(20,12,4,${shade})`);
    ctx.strokeStyle = "rgba(255,220,170,0.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a.x, a.y + 0.5); ctx.lineTo(b.x, b.y + 0.5); ctx.stroke();
    // plank ends seen from the side, or the long stringer with its bolts
    const n = Math.round(Math.abs(b.x - a.x) / 5);
    for (let i = 1; i < n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n, y = a.y + ((b.y - a.y) * i) / n;
      ctx.fillStyle = hex(BEAM_DARK);
      if (ends) ctx.fillRect(Math.round(x), Math.round(y) + 1, 1, BEAM - 1);
      else if (i % 3 === 0) ctx.fillRect(Math.round(x), Math.round(y) + 2, 1, 1);
    }
  };
  if (w.s) face(L, B, BEAM_C, 0.05, !alongX);
  if (w.e) face(B, R, BEAM_C, 0.3, alongX);

  // Planks across the way, drawn on the deck plane
  ctx.save();
  ctx.setTransform(1, 0.5, -1, 0.5, IW / 2, UP);
  const N = 6, pw = TILE / N;
  for (let i = 0; i < N; i++) {
    const c = PLANKS[Math.floor(hash(i, v, 3) * PLANKS.length)];
    const a = i * pw, off = (hash(i, v, 4) - 0.5) * 1.2;
    ctx.fillStyle = hex(c);
    if (alongX) ctx.fillRect(a, -0.3, pw + 0.1, TILE + 0.6); else ctx.fillRect(-0.3, a, TILE + 0.6, pw + 0.1);
    ctx.fillStyle = "rgba(0,0,0,0.13)"; // grain
    for (let g = 0; g < 2; g++) {
      const q = a + 1.2 + g * 2 + off, s = TILE * hash(i, v, 5 + g);
      if (alongX) ctx.fillRect(q, s * 0.4, 0.6, TILE * 0.45); else ctx.fillRect(s * 0.4, q, TILE * 0.45, 0.6);
    }
    ctx.fillStyle = "rgba(255,230,180,0.18)"; // worn lit edge
    if (alongX) ctx.fillRect(a, 0, 0.8, TILE); else ctx.fillRect(0, a, TILE, 0.8);
    ctx.fillStyle = "rgba(30,15,5,0.7)"; // gap between planks
    if (alongX) ctx.fillRect(a + pw - 0.7, 0, 0.7, TILE); else ctx.fillRect(0, a + pw - 0.7, TILE, 0.7);
    ctx.fillStyle = "#3a2410"; // nails over the stringers
    for (const s of [3, TILE - 4]) if (alongX) ctx.fillRect(a + pw / 2 - 0.5, s, 1, 1); else ctx.fillRect(s, a + pw / 2 - 0.5, 1, 1);
  }
  // darker stringer boards along the water sides
  ctx.fillStyle = hex(BEAM_C);
  if (w.n) ctx.fillRect(0, 0, TILE, 2.2);
  if (w.s) ctx.fillRect(0, TILE - 2.2, TILE, 2.2);
  if (w.w) ctx.fillRect(0, 0, 2.2, TILE);
  if (w.e) ctx.fillRect(TILE - 2.2, 0, 2.2, TILE);
  ctx.restore();

  // Railing along the far sides (behind anyone on the bridge)
  const T0 = P(0, 0);
  if (w.n) railing(ctx, T0, R, !w.w, !w.e);
  if (w.w) railing(ctx, T0, L, !w.n, !w.s);
  tex.refresh();
  return key;
}

/** Posts and two rails from a to b; `capA`/`capB` = the railing ends there (taller end post with a cap). */
function railing(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }, capA: boolean, capB: boolean) {
  const lerp = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const posts = [0, 0.5, 1];
  // rails first on the far side of the posts' tops
  for (const [h, c] of [[RAIL - 1, POST_LIT], [RAIL / 2, POST]] as const) {
    ctx.strokeStyle = hex(POST_DARK); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y - h + 1); ctx.lineTo(b.x, b.y - h + 1); ctx.stroke();
    ctx.strokeStyle = hex(c); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a.x, a.y - h + 0.5); ctx.lineTo(b.x, b.y - h + 0.5); ctx.stroke();
  }
  for (const t of posts) {
    const p = lerp(t), end = (t === 0 && capA) || (t === 1 && capB);
    const h = end ? RAIL + 3 : RAIL, x = Math.round(p.x) - 1, y = Math.round(p.y);
    ctx.fillStyle = hex(POST_DARK); ctx.fillRect(x, y - h, 3, h);
    ctx.fillStyle = hex(POST); ctx.fillRect(x, y - h, 2, h);
    ctx.fillStyle = hex(POST_LIT); ctx.fillRect(x, y - h, 1, h);
    if (end) { ctx.fillStyle = hex(POST_DARK); ctx.fillRect(x - 1, y - h - 1, 5, 2); ctx.fillStyle = hex(POST_LIT); ctx.fillRect(x - 1, y - h - 1, 4, 1); }
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x - 1, y, 4, 1);
  }
}

/** The railing on the near sides (south, east): drawn in front of anyone on the bridge. */
function frontTexture(scene: Phaser.Scene, w: Sides) {
  const key = `bridge_front_${+w.n}${+w.e}${+w.s}${+w.w}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, IW, HT)!;
  const ctx = tex.getContext();
  const L = P(0, TILE), B = P(TILE, TILE), R = P(TILE, 0);
  if (w.e) railing(ctx, R, B, !w.n, !w.s);
  if (w.s) railing(ctx, L, B, !w.w, !w.e);
  tex.refresh();
  return key;
}

// ---------------------------------------------------------------------------------------------------------------
// Weathered pixel bridges: every texel painted from colour ramps with ordered dithering. Planks follow world
// coordinates, so they run on across tiles with no seams. Some planks are split, missing or sunk, some rails snapped:
// the damage is placed on purpose (hash per plank and per segment), never along a tile edge.
// ---------------------------------------------------------------------------------------------------------------

const S = 2; // texels per world px (about the shared pixel grid's density)
const CW = IW * S, CH = HT * S;
type RGB = readonly [number, number, number];
const rgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const ramp = (...c: string[]) => c.map(rgb);
const WOOD = [
  ramp("#1e150e", "#38291c", "#504029", "#675339", "#7f6a4c", "#998462"), // brown
  ramp("#1d1611", "#372c22", "#4f4234", "#685847", "#82705c", "#9c8a74"), // grey-brown, sun bleached
  ramp("#1a1715", "#302b27", "#47413a", "#5f574e", "#796f63", "#958a7c"), // grey, old
];
const MOSS = ramp("#1f2a14", "#30411d", "#465c28", "#5e7634");
const STONE = ramp("#1b1a19", "#33302d", "#4d4944", "#6a655d", "#8a847a");
const WATERD = ramp("#0e1c1e", "#16302f", "#22433f", "#6f8f8a");
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const dith = (X: number, Y: number) => BAY[(Y & 3) * 4 + (X & 3)];
const sm = (t: number) => t * t * (3 - 2 * t);
const vn = (x: number, y: number, s: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = sm(x - ix), fy = sm(y - iy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};
const pick = (r: RGB[], l: number) => r[Math.max(0, Math.min(r.length - 1, Math.round(l)))];

class Buf {
  d: Uint8ClampedArray;
  constructor() { this.d = new Uint8ClampedArray(CW * CH * 4); }
  set(X: number, Y: number, c: RGB, a = 1) {
    X = Math.round(X); Y = Math.round(Y);
    if (X < 0 || Y < 0 || X >= CW || Y >= CH) return;
    const i = (Y * CW + X) * 4, d = this.d, k = d[i + 3] / 255;
    if (a >= 1 || k === 0) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = Math.max(d[i + 3], a * 255); return; }
    d[i] = d[i] + (c[0] - d[i]) * a; d[i + 1] = d[i + 1] + (c[1] - d[i + 1]) * a; d[i + 2] = d[i + 2] + (c[2] - d[i + 2]) * a; d[i + 3] = Math.min(255, d[i + 3] + a * 255);
  }
  dark(X: number, Y: number, a: number) { this.set(X, Y, [8, 16, 24], a); }
}
/** Texel of a deck-local point (0..TILE) lifted by `up` world px. */
const TX = (x: number, y: number, up = 0) => ({ X: (IW / 2 + x - y) * S, Y: (UP + (x + y) / 2 - up) * S });

interface Tile { tx: number; ty: number; alongX: boolean; w: Sides; br: Sides /* neighbour is bridge */ }

/** Plank state at world position `a` along the way (one plank ≈ 5 px), seeded by the bridge row/column. */
function plank(a: number, lane: number) {
  const pi = Math.floor(a / 5.2), ta = a / 5.2 - pi, h = (s: number) => hash(pi, lane, s);
  const r = h(1);
  return { pi, ta, wood: WOOD[h(2) < 0.22 ? 0 : h(2) < 0.75 ? 1 : 2], tone: (h(3) - 0.5) * 0.7, missing: r < 0.035, split: r >= 0.035 && r < 0.09, sunk: r >= 0.09 && r < 0.17, endA: h(4) * 1.6, endB: h(5) * 1.6, breakAt: 0.3 + h(6) * 0.4 };
}

function paintDeck(b: Buf, t: Tile, landEnd: boolean) {
  const { tx, ty, alongX, w, br } = t, lane = alongX ? ty : tx;
  if (+br.n + +br.e + +br.s + +br.w >= 3) landEnd = true; // junctions stay whole
  const edgeA = alongX ? !br.n : !br.w, edgeB = alongX ? !br.s : !br.e; // the bridge's long sides
  for (let Y = 0; Y < CH; Y++) for (let X = 0; X < CW; X++) {
    const u = (X + 0.5) / S - IW / 2, v = 2 * ((Y + 0.5) / S - UP), x = (u + v) / 2, y = (v - u) / 2;
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) continue;
    const wx = tx * TILE + x, wy = ty * TILE + y, a = alongX ? wx : wy, c = alongX ? y : x, cw = alongX ? wy : wx;
    const p = plank(a, lane);
    const wet = (edgeA && c < 3 ? 1 - c / 3 : 0) + (edgeB && c > TILE - 3 ? 1 - (TILE - c) / 3 : 0);
    // ragged plank ends on the open sides; under them the stringer beam shows
    const cut = (edgeA && c < p.endA) || (edgeB && c > TILE - p.endB);
    const stringer = c < 4.5 || c > TILE - 4.5 || Math.abs(c - TILE / 2) < 1.6;
    // the deck is always whole where people walk: damage shows as split, sunk or patched planks, never as holes
    if (cut) { b.set(X, Y, pick(WOOD[2], 1.2 + dith(X, Y) + (stringer ? 0.4 : 0))); continue; } // ragged plank ends over the beam
    if (p.split && !landEnd) {
      const jag = (vn(cw * 0.9, p.pi, 5) - 0.5) * 3.5;
      if (Math.abs(c - TILE * p.breakAt + jag) < 0.5) { b.set(X, Y, pick(WOOD[0], 0.3 + dith(X, Y) * 0.6)); continue; }
    }
    // the plank: shading across it (rounded worn top), grain along it, knots, cracks, wet sides, moss in the seams
    const seam = p.ta < 0.13 || p.ta > 0.96;
    if (seam) { b.set(X, Y, pick(WOOD[0], 0.4 + dith(X, Y) * 0.8 + (p.sunk ? -0.5 : 0))); if (vn(wx * 0.7, wy * 0.7, 11) > 0.7) b.set(X, Y, pick(MOSS, 1 + dith(X, Y) * 2)); continue; }
    const grain = vn(c * 0.35 + p.pi * 7, p.ta * 3, 12), knot = vn(c * 0.8, a * 0.8, 13) > 0.86;
    let l = 3 + p.tone + (p.ta < 0.3 ? 0.55 : p.ta > 0.8 ? -0.6 : 0) + (grain - 0.5) * 1.6 + dith(X, Y) * 0.9 - wet * 1.2;
    if (p.sunk) l -= 0.45;
    if (knot) l -= 1.6;
    if (vn(c * 0.25, p.pi * 3.1, 14) > 0.8 && Math.abs(p.ta - 0.55) < 0.06) l = 0.6; // a crack along the grain
    // nails over the stringers
    if (Math.abs(p.ta - 0.55) < 0.08 && (Math.abs(c - 3) < 0.45 || Math.abs(c - TILE + 3) < 0.45)) { b.set(X, Y, rgb(hash(p.pi, 7, 2) < 0.5 ? "#2a2522" : "#6a3a1e")); continue; }
    let col = pick(p.missing ? WOOD[0] : p.wood, p.missing ? l + 0.8 : l); // a newer patch board where one rotted away
    const mz = vn(wx * 0.18, wy * 0.18, 15) * 0.8 + vn(wx * 0.6, wy * 0.6, 16) * 0.2 + wet * 0.3 + (p.ta < 0.22 || p.ta > 0.88 ? 0.1 : 0);
    if (mz > 0.8) col = pick(MOSS, 0.8 + (mz - 0.8) * 8 + dith(X, Y));
    b.set(X, Y, col);
  }
}

/** The thick side beam below a long open side, with plank ends, a wet algae band and the water line. */
function paintFace(b: Buf, t: Tile, side: "s" | "e") {
  const shade = side === "s" ? 0 : -0.8, along = (side === "s") === t.alongX;
  for (let q = 0; q <= TILE; q += 0.25) for (let d = 0; d <= BEAM; d += 0.25) {
    const o = side === "s" ? TX(q, TILE) : TX(TILE, q), X = o.X, Y = o.Y + d * S;
    const wq = (side === "s" ? t.tx : t.ty) * TILE + q;
    let l = 2.4 + shade + (d < 0.6 ? 1 : 0) + (vn(wq * 0.25, d * 2, 21) - 0.5) * 1.4 + dith(Math.round(X), Math.round(Y)) * 0.8;
    if (!along && ((wq / 5.2) % 1) < 0.14) l -= 1.4; // plank ends seen from the side
    if (along && Math.abs(d - BEAM * 0.5) < 0.3 && (wq % 9) < 0.5) { b.set(X, Y, rgb("#211915")); continue; } // bolts on the stringer
    let col = pick(WOOD[1], l);
    if (d > BEAM - 1.6 && vn(wq * 0.4, d, 22) > 0.35) col = pick(MOSS, l * 0.6);
    if (d > BEAM - 0.4) col = pick(WOOD[0], 0.6);
    b.set(X, Y, col);
  }
}

/** A thick, slightly leaning pile from the beam into the water, algae at the water line, ripples around it. */
function pile(b: Buf, x: number, y: number, k: number) {
  const o = TX(x, y), lean = (hash(k, 1, 31) - 0.5) * 1.2, H = 9 + hash(k, 2, 31) * 2;
  for (let d = 0; d <= H; d += 0.25) for (let wv = -1.7; wv <= 1.7; wv += 0.25) {
    const X = o.X + (wv + lean * (d / H)) * S, Y = o.Y + (BEAM + d) * S;
    const edge = Math.abs(wv) > 1.35;
    let l = edge ? 0.4 : 2.6 - wv * 0.8 + (vn(d * 2, wv * 2 + k, 32) - 0.5) + dith(Math.round(X), Math.round(Y)) * 0.8;
    let col = pick(WOOD[2], l);
    if (d > H - 3 && !edge) col = pick(MOSS, 0.6 + l * 0.4);
    if (d > H - 1) col = pick(WOOD[0], 0.6);
    b.set(X, Y, col);
  }
  const wl = o.Y + (BEAM + H) * S;
  for (let i = -6; i <= 6; i++) { const X = o.X + lean * S + i * 1.1 + 0.5; if (hash(k, i, 33) < 0.75) b.set(X, wl + (Math.abs(i) > 4 ? -1 : 0), rgb("#bcd6d2"), 0.55 - Math.abs(i) * 0.05); }
}

/** Field stones and packed earth where the bridge comes down onto the bank. */
function abutment(b: Buf, t: Tile, side: "n" | "e" | "s" | "w") {
  const pts: [number, number][] = [];
  for (let i = 0; i < 7; i++) {
    const q = 2 + (i / 6) * (TILE - 4) + (hash(t.tx * 7 + i, t.ty, 41) - 0.5) * 3, o = 0.5 + hash(i, t.tx + t.ty, 42) * 2.5;
    pts.push(side === "n" ? [q, -o] : side === "s" ? [q, TILE + o] : side === "w" ? [-o, q] : [TILE + o, q]);
  }
  for (const [x, y] of pts) {
    const o = TX(x, y), r = 1.6 + hash(Math.round(x * 3), Math.round(y * 3), 43) * 1.6, k = x * 13 + y;
    for (let j = -r * 0.75; j <= r * 0.4; j += 0.25) for (let i = -r; i <= r; i += 0.25) {
      const dd = (i / r) ** 2 + (j / (r * 0.7)) ** 2;
      if (dd > 1) continue;
      const X = o.X + i * S, Y = o.Y + j * S;
      const l = dd > 0.75 ? 0.4 : 2.6 - i / r * 0.6 - j / r * 1.4 + dith(Math.round(X), Math.round(Y)) * 0.8 + (hash(k | 0, 1, 44) - 0.5);
      b.set(X, Y, l > 2.9 && j < -r * 0.3 && hash(k | 0, 2, 44) < 0.4 ? pick(MOSS, 2) : pick(STONE, l));
    }
  }
}

/** Posts and two rails from local a to b. Crooked posts, sagging rails, now and then a snapped rail hanging down. */
function rail(b: Buf, ax: number, ay: number, bx: number, by: number, endA: boolean, endB: boolean, seed: number) {
  const brk = hash(seed, 3, 51) < 0.16, brkAt = 0.35 + hash(seed, 4, 51) * 0.3;
  const sag = 0.6 + hash(seed, 5, 51) * 0.8;
  const rails = [RAIL - 1, RAIL * 0.5];
  rails.forEach((h, ri) => {
    const snapped = brk && ri === 0;
    for (let t = 0; t <= 1; t += 0.01) {
      let x = ax + (bx - ax) * t, y = ay + (by - ay) * t, up = h - Math.sin(t * Math.PI) * sag;
      if (snapped && t > brkAt) {
        if (t > brkAt + 0.28) break; // the loose end hangs down from the break
        const k = (t - brkAt) / 0.28; up -= k * 6; x -= (bx - ax) * (t - brkAt) * 0.4; y -= (by - ay) * (t - brkAt) * 0.4;
      }
      const o = TX(x, y, up);
      for (let d = 0; d < 3; d++) b.set(o.X, o.Y + d, d === 0 ? pick(WOOD[1], 4) : d === 1 ? pick(WOOD[1], 2.6 + dith(Math.round(o.X), 0)) : pick(WOOD[0], 0.8));
    }
  });
  const post = (x: number, y: number, end: boolean, k: number) => {
    const o = TX(x, y), H = (end ? RAIL + 3 : RAIL) + hash(k, 1, 52) * 1.5, lean = (hash(k, 2, 52) - 0.5) * 1.6;
    for (let d = 0; d <= H; d += 0.25) for (let wv = -1.2; wv <= 1.2; wv += 0.25) {
      const X = o.X + (wv + lean * (d / H)) * S, Y = o.Y - d * S;
      const edge = Math.abs(wv) > 0.9 || d > H - 0.3;
      let col = edge ? pick(WOOD[0], 0.5) : pick(WOOD[1], 3 - wv * 1.2 + dith(Math.round(X), Math.round(Y)) * 0.8 + (vn(d, wv + k, 53) - 0.5));
      if (d < 2.5 && !edge && vn(d * 2, wv * 3 + k, 54) > 0.45) col = pick(MOSS, 1.5 + dith(Math.round(X), Math.round(Y)) * 2);
      b.set(X, Y, col);
    }
    // rope lashing where the top rail meets it
    const r = TX(x, y, RAIL - 1);
    for (let i = -2; i <= 2; i++) b.set(r.X + i + lean * S * 0.8, r.Y + 1 + (i & 1), rgb("#9a8a62"));
  };
  post(ax, ay, endA, seed * 3 + 1);
  if (hash(seed, 6, 51) > 0.12) post((ax + bx) / 2, (ay + by) / 2, false, seed * 3 + 2); // a middle post fell out here and there
  if (endB) post(bx, by, true, seed * 3 + 3);
}

function hiCanvas(scene: Phaser.Scene, key: string, draw: (b: Buf) => void) {
  if (scene.textures.exists(key)) return key;
  const b = new Buf();
  draw(b);
  hiResTexture(scene, key, IW, HT, 1, S, (ctx) => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.putImageData(new ImageData(b.d, CW, CH), 0, 0); });
  return key;
}

/** Long sides get railings whatever is under them; a dead end in the water gets one too; land ends stay open. */
function railSides(t: Tile) {
  const long = t.alongX ? { n: true, s: true, e: false, w: false } : { n: false, s: false, e: true, w: true };
  const on = (k: keyof Sides) => !t.br[k] && (long[k] || t.w[k]);
  return { n: on("n"), e: on("e"), s: on("s"), w: on("w") };
}

function deckTex(scene: Phaser.Scene, t: Tile) {
  return hiCanvas(scene, `bridge_deck_${t.tx}_${t.ty}`, (b) => {
    const { w, br } = t;
    // shadow on the water in front, piles, side beams
    const sh = (pts: { X: number; Y: number }[]) => {
      const ys = pts.map((p) => p.Y), xs = pts.map((p) => p.X);
      for (let Y = Math.min(...ys) | 0; Y <= Math.max(...ys); Y++) for (let X = Math.min(...xs) | 0; X <= Math.max(...xs); X++) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const a = pts[i], c = pts[j];
          if ((a.Y > Y) !== (c.Y > Y) && X < ((c.X - a.X) * (Y - a.Y)) / (c.Y - a.Y) + a.X) inside = !inside;
        }
        if (inside) b.dark(X, Y, 0.28);
      }
    };
    const L = TX(0, TILE), B = TX(TILE, TILE), R = TX(TILE, 0), off = (p: { X: number; Y: number }) => ({ X: p.X + 5 * S, Y: p.Y + (BEAM + 8) * S });
    if (w.s) sh([L, B, off(B), off(L)]);
    if (w.e) sh([B, R, off(R), off(B)]);
    const k = t.tx * 31 + t.ty * 17;
    if (w.s && !br.s) { pile(b, TILE * 0.5, TILE, k); if (w.e || !br.e) pile(b, TILE - 1, TILE, k + 1); }
    if (w.e && !br.e) { pile(b, TILE, TILE * 0.5, k + 2); }
    // far-side footings go under the deck
    for (const s of ["n", "w"] as const) if (!br[s] && !w[s]) abutment(b, t, s);
    paintDeck(b, t, !w.n && !br.n || !w.s && !br.s || !w.e && !br.e || !w.w && !br.w);
    if (!br.s && (w.s || !t.alongX)) paintFace(b, t, "s");
    if (!br.e && (w.e || t.alongX)) paintFace(b, t, "e");
    const rs = railSides(t), T0 = { x: 0, y: 0 };
    if (rs.n) rail(b, T0.x, T0.y, TILE, 0, !br.w, !br.e && !rs.e, t.tx * 7 + t.ty * 3);
    if (rs.w) rail(b, 0, 0, 0, TILE, !br.n && !rs.n, !br.s, t.tx * 5 + t.ty * 11);
  });
}

function frontTex(scene: Phaser.Scene, t: Tile) {
  const rs = railSides(t), land = { s: !t.w.s && !t.br.s, e: !t.w.e && !t.br.e };
  if (!rs.s && !rs.e && !land.s && !land.e) return null;
  return hiCanvas(scene, `bridge_front_${t.tx}_${t.ty}`, (b) => {
    if (land.s) abutment(b, t, "s");
    if (land.e) abutment(b, t, "e");
    if (rs.e) rail(b, TILE, 0, TILE, TILE, !t.br.n && !rs.n, !t.br.s, t.tx * 13 + t.ty * 5);
    if (rs.s) rail(b, 0, TILE, TILE, TILE, !t.br.w, !t.br.e, t.tx * 3 + t.ty * 19);
  });
}

/**
 * Builds every bridge and pier and returns the ground grid with water under them.
 * `ground` is the display grid (tile index with its variant row) used by the iso tilemap.
 */
export function buildBridges(scene: Phaser.Scene, ground: number[][]): number[][] {
  const out = ground.map((r) => r.slice());
  const tiles: [number, number][] = [];
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) if (GROUND[ty][tx] === T.BRIDGE) tiles.push([tx, ty]);
  tiles.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  for (const [tx, ty] of tiles) {
    let waterIdx = T.WATER as number;
    for (const [i, j] of [[tx, ty - 1], [tx, ty + 1], [tx - 1, ty], [tx + 1, ty]]) if (gnd(i, j) === T.WATER) { waterIdx = ground[j][i]; break; }
    out[ty][tx] = waterIdx;
    const w: Sides = { n: isWater(tx, ty - 1), e: isWater(tx + 1, ty), s: isWater(tx, ty + 1), w: isWater(tx - 1, ty) };
    const br: Sides = { n: isBridge(tx, ty - 1), e: isBridge(tx + 1, ty), s: isBridge(tx, ty + 1), w: isBridge(tx - 1, ty) };
    const openX = !w.e || !w.w, openY = !w.n || !w.s;
    const alongX = openX && !openY ? true : openY && !openX ? false
      : br.w || br.e ? !(br.n || br.s) || openX : false;
    const t: Tile = { tx, ty, alongX, w, br };
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE, oy = (UP + IH / 2) / HT;
    if (!SMOOTH) {
      scene.add.image(cx, cy, deckTexture(scene, alongX, w, Math.floor(hash(tx, ty, 1) * 4))).setOrigin(0.5, oy).setDepth(-0.9);
      if (w.s || w.e) scene.add.image(cx, cy, frontTexture(scene, w)).setOrigin(0.5, oy).setDepth(cy + 16);
      continue;
    }
    scene.add.image(cx, cy, deckTex(scene, t)).setOrigin(0.5, oy).setDepth(-0.9);
    const f = frontTex(scene, t);
    if (f) scene.add.image(cx, cy, f).setOrigin(0.5, oy).setDepth(cy + 16);
  }
  return out;
}
