import Phaser from "phaser";
import { MAP_H, MAP_W, TILE } from "../../shared/constants";
import { GROUND, T } from "../../shared/map";

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

/**
 * Builds every bridge and pier and returns the ground grid with water under them.
 * `ground` is the display grid (tile index with its variant row) used by the iso tilemap.
 */
export function buildBridges(scene: Phaser.Scene, ground: number[][]): number[][] {
  const out = ground.map((r) => r.slice());
  const tiles: [number, number][] = [];
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) if (GROUND[ty][tx] === T.BRIDGE) tiles.push([tx, ty]);
  // front to back drawing order inside the same depth: further tiles first
  tiles.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  for (const [tx, ty] of tiles) {
    // water under the deck: borrow a neighbouring water tile's look
    let waterIdx = T.WATER as number;
    for (const [i, j] of [[tx, ty - 1], [tx, ty + 1], [tx - 1, ty], [tx + 1, ty]]) if (gnd(i, j) === T.WATER) { waterIdx = ground[j][i]; break; }
    out[ty][tx] = waterIdx;
    const w: Sides = { n: isWater(tx, ty - 1), e: isWater(tx + 1, ty), s: isWater(tx, ty + 1), w: isWater(tx - 1, ty) };
    // the way runs between the two sides that are not water (or continue the bridge)
    const openX = !w.e || !w.w, openY = !w.n || !w.s;
    const alongX = openX && !openY ? true : openY && !openX ? false
      : isBridge(tx - 1, ty) || isBridge(tx + 1, ty) ? !(isBridge(tx, ty - 1) || isBridge(tx, ty + 1)) || openX : false;
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE, oy = (UP + IH / 2) / HT;
    scene.add.image(cx, cy, deckTexture(scene, alongX, w, Math.floor(hash(tx, ty, 1) * 4))).setOrigin(0.5, oy).setDepth(-0.9);
    if (w.s || w.e) scene.add.image(cx, cy, frontTexture(scene, w)).setOrigin(0.5, oy).setDepth(cy + 16);
  }
  return out;
}
