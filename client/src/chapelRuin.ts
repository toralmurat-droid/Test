import Phaser from "phaser";
import { CHAPEL_RUIN, TANKARD_RUIN } from "../../shared/map";
import { canvasPen, hsh, IsoPaint, ramp, type Mat, type V3 } from "./isoPaint";
import { BLACKR, IRONR } from "./isoProps";
import { hiResTexture } from "./smooth";

/**
 * Oakvale's two named ruins, redrawn wall tile by wall tile (Murat 2026-11-13): the Chapel of the Dawn gets real
 * chapel architecture (buttressed corner piers, tall lancet windows, a broken gable with the ring of a rose window,
 * shattered stained glass on the east side, carved stone and slates fallen everywhere), the Rusty Tankard a properly
 * burnt timber frame (charred posts split and alligatored, glowing-edged planks, ash and fallen rafters).
 *
 * Each wall tile of the ruin is its own image (iso.ts sorts it by its tile, so heroes walk in and around), but its
 * shape comes from world coordinates, so walls, windows and the gable run on across tiles.
 */
type Ruin = typeof CHAPEL_RUIN;
const inRuin = (r: Ruin, tx: number, ty: number) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h;
/** Which special ruin a wall tile belongs to, if any. */
export const specialRuin = (tx: number, ty: number): "chapel" | "tankard" | undefined =>
  inRuin(CHAPEL_RUIN, tx, ty) ? "chapel" : inRuin(TANKARD_RUIN, tx, ty) ? "tankard" : undefined;

const LIME = [0x1c1a18, 0x2a2724, 0x3a3631, 0x4c4740, 0x605950, 0x766d61, 0x8c8272, 0xa29684];
const MOSS = [0x1e2a14, 0x2e4018, 0x40561e, 0x546c28];
const GLASS = [[0x4a0c0c, 0x8a1a14, 0xc8402a], [0x0c1a4a, 0x1a3a8a, 0x3a6ac8], [0x4a3a08, 0x9a7a14, 0xe0c040], [0x0e3a16, 0x1e6a2a, 0x4aa04a]];
const CHAR = [0x070605, 0x110d0a, 0x1c1610, 0x2a2018, 0x3a2c20, 0x4e3c2a];
const EMBER = [0x3a1206, 0x6a2a0c, 0x9a4a14];
const ASH = [0x2a2826, 0x46423e, 0x64605a, 0x86817a];
const SLATE = [0x14161a, 0x22262c, 0x343a42, 0x4a525c];
const MAXH = 70, PAD = 10, K = 1.5;

/**
 * The image of one wall tile of a special ruin (mask: neighbours that are the same wall, N=1 E=2 S=4 W=8).
 * `up`: texels from the image top to the tile's centre, for the origin.
 */
export function specialRuinTexture(scene: Phaser.Scene, kind: "chapel" | "tankard", mask: number, tx: number, ty: number) {
  const key = `rw_${kind}_${tx}_${ty}`;
  const W = 64, H = 32 + MAXH + PAD;
  if (!scene.textures.exists(key)) hiResTexture(scene, key, W, H, 1, 6, (c) => {
    const q = new IsoPaint(canvasPen(c, K), Math.ceil(W * K), Math.ceil(H * K), 32 * K, (MAXH + PAD) * K);
    if (kind === "chapel") chapelTile(q, mask, tx, ty); else tankardTile(q, mask, tx, ty);
  });
  return { key, up: MAXH + PAD + 16 };
}

const C = 16;
/** Wall boxes from the tile centre out along each arm of the mask, `each` gets the box and its middle (tile-local). */
function arms(mask: number, T: number, step: number, each: (u0: number, u1: number, v0: number, v1: number, um: number, vm: number) => void) {
  each(C - T, C + T, C - T, C + T, C, C);
  const dirs: [number, number, number][] = [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]];
  for (const [bit, dx, dy] of dirs) {
    if (!(mask & bit)) continue;
    for (let d = T; d < 16; d += step) {
      const d1 = Math.min(16, d + step);
      if (dx) each(dx > 0 ? C + d : C - d1, dx > 0 ? C + d1 : C - d, C - T, C + T, C + dx * (d + d1) / 2, C);
      else each(C - T, C + T, dy > 0 ? C + d : C - d1, dy > 0 ? C + d1 : C - d, C, C + dy * (d + d1) / 2);
    }
  }
}

/**
 * Box with its three visible faces, where `solid(x, y, z)` (tile-local) can cut holes (windows) through it.
 * Materials get the tile-local point of each sample, so courses and stains line up across faces and tiles.
 */
function holeBox(q: IsoPaint, u0: number, u1: number, v0: number, v1: number, z0: number, z1: number,
  m: (l: number, x: number, y: number, z: number, px: number, py: number, top: boolean) => number | undefined, solid?: (x: number, y: number, z: number) => boolean) {
  if (z1 <= z0) return;
  const P = (u: number, v: number, z: number): V3 => [u * K, v * K, z * K];
  const k = 1.3; // samples per pixelize cell: enough to leave no gaps, cheap enough for 26 tiles at load
  const face = (f: (s: number, t: number) => [number, number, number], n: V3, ns: number, nt: number, top = false) =>
    q.surf((s, t) => { const [x, y, z] = f(s, t); return [P(x, y, z), n]; }, ns, nt, (l, s, t, px, py) => {
      const [x, y, z] = f(s, t);
      if (solid && !solid(x, y, z)) return undefined;
      return m(l, x, y, z, px, py, top);
    });
  face((s, t) => [u0 + s * (u1 - u0), v0 + t * (v1 - v0), z1], [0, 0, 1], Math.ceil((u1 - u0) * k * K) + 1, Math.ceil((v1 - v0) * k * K) + 1, true);
  face((s, t) => [u0 + s * (u1 - u0), v1, z0 + t * (z1 - z0)], [0, 1, 0], Math.ceil((u1 - u0) * k * K) + 1, Math.ceil((z1 - z0) * k * K) + 1);
  face((s, t) => [u1, v0 + s * (v1 - v0), z0 + t * (z1 - z0)], [1, 0, 0], Math.ceil((v1 - v0) * k * K) + 1, Math.ceil((z1 - z0) * k * K) + 1);
}

// ---------------------------------------------------------------------------------------------------------------
// The chapel

/** Dressed limestone in courses, with weathering, moss low down and soot where the roof burnt. */
const ashlar = (wx: number, wy: number) => (l: number, x: number, y: number, z: number, px: number, py: number, top: boolean) => {
  const X = wx + x, Y = wy + y;
  if (top) return ramp(hsh(px >> 1, py >> 1, 3) < 0.25 ? MOSS : LIME, l * 0.85 + 0.05 + (hsh(px, py, 4) - 0.5) * 0.2, px, py);
  const course = Math.floor(z / 5), along = (X + Y) + (course % 2) * 4.5, joint = z % 5 < 0.7 || along % 9 < 0.8;
  const stain = (hsh(Math.floor(along / 9), course, 7) - 0.5) * 0.22, soot = z > 30 ? (z - 30) * 0.006 : 0;
  if (z < 6 && hsh(px, py >> 1, 8) < 0.35 - z * 0.05) return ramp(MOSS, l * 0.8, px, py);
  return ramp(LIME, l * 0.95 + stain - soot - (joint ? 0.2 : 0) - (hsh(px, py, 9) < 0.04 ? 0.15 : 0), px, py);
};

/** Wall height along the chapel (world px, from the tile and the point on it): a gable on the north wall. */
function chapelHeight(tx: number, ty: number, x: number, y: number) {
  const r = CHAPEL_RUIN, wx = tx * 32 + x, wy = ty * 32 + y, N = ty === r.y, S = ty === r.y + r.h - 1;
  const jag = (hsh(Math.floor((wx + wy) / 5), 3, 41) - 0.5) * 9 + (hsh(Math.floor((wx + wy) / 13), 5, 42) < 0.25 ? -10 : 0);
  if (S) return 10 + hsh(Math.floor((wx + wy) / 6), 1, 43) * 9; // the front fell inward: low stumps you see over
  if (N) {
    const mid = (r.x + r.w / 2) * 32, span = r.w * 16, gable = Math.max(0, 1 - Math.abs(wx - mid) / span);
    return 40 + gable * 26 + jag * (1 - gable * 0.6);
  }
  return 40 + jag; // the long walls
}

/** Lancet window (pointed arch) centred on each long-wall tile, and the rose window high in the gable. */
function chapelSolid(tx: number, ty: number) {
  const r = CHAPEL_RUIN, N = ty === r.y, side = tx === r.x || tx === r.x + r.w - 1, mid = tx === r.x + Math.floor(r.w / 2);
  const cornerY = ty === r.y || ty === r.y + r.h - 1;
  return (x: number, y: number, z: number) => {
    if (side && !cornerY) { // a lancet along v on the tile: sill at z 10, pointed head up to z 40, 12 px wide
      const d = Math.abs(y - C), top = 30, w = 6;
      if (z > 10 && d < w && (z < top || d < w - (z - top) * 0.6)) return false;
    }
    if (N && mid) { const d = Math.hypot(x - C, z - 46); if (d < 8 && !(d < 2.2) && Math.abs(Math.sin(Math.atan2(z - 46, x - C) * 4)) > 0.3) return false; }
    return true;
  };
}

function chapelTile(q: IsoPaint, mask: number, tx: number, ty: number) {
  const r = CHAPEL_RUIN, wx = tx * 32, wy = ty * 32, stone = ashlar(wx, wy), sol = chapelSolid(tx, ty);
  // dressed voussoirs round each opening: a lighter rim where solid stone meets a window, so the arches read
  const m = (l: number, x: number, y: number, z: number, px: number, py: number, top: boolean) => {
    if (!top && (!sol(x, y + 1.3, z) || !sol(x, y - 1.3, z) || !sol(x, y, z - 1.3) || !sol(x + 1.3, y, z) || !sol(x - 1.3, y, z))) return ramp(LIME, l + 0.18, px, py);
    return stone(l, x, y, z, px, py, top);
  };
  const corner = (tx === r.x || tx === r.x + r.w - 1) && (ty === r.y || ty === r.y + r.h - 1);
  const solid = chapelSolid(tx, ty), eastWall = tx === r.x + r.w - 1 && !corner, S = ty === r.y + r.h - 1;
  const T = 6;
  arms(mask, T, 4, (u0, u1, v0, v1, um, vm) => holeBox(q, u0, u1, v0, v1, 0, chapelHeight(tx, ty, um, vm), m, solid));
  // a plinth and a string course (a moulded band) run along the outside of the walls you see: chapel, not barn
  const along = (mask & 5) && !(mask & 10), across = (mask & 10) && !(mask & 5);
  if (along && tx === r.x + r.w - 1) for (const [z0, z1, e] of [[0, 3, 1.6], [16, 17.6, 1]]) holeBox(q, C + T, C + T + e, mask & 1 ? 0 : C - T, mask & 4 ? 32 : C + T, z0, z1, m);
  if (across && S) holeBox(q, mask & 8 ? 0 : C - T, mask & 2 ? 32 : C + T, C + T, C + T + 1.6, 0, 3, m);
  // pilaster buttresses between the windows of the east wall, stepping back as they rise
  if (along && tx === r.x + r.w - 1 && !corner) for (const v of [0, 32]) if (v === 0 ? mask & 1 : mask & 4) {
    holeBox(q, C + T, C + T + 4, v - 2.5, v + 2.5, 0, 22, m);
    holeBox(q, C + T, C + T + 2.4, v - 2.2, v + 2.2, 22, 34, m);
  }
  if (corner && !S) { // a buttressed corner pier: taller, stepping out on the outside corner
    const ox = tx === r.x ? -1 : 1, oy = ty === r.y ? -1 : 1, h = chapelHeight(tx, ty, C, C) + 8;
    holeBox(q, C - 7, C + 7, C - 7, C + 7, 0, h, m);
    for (let k = 0; k < 3; k++) {
      const e = 7 + k * 3.2, z1 = h * (0.62 - k * 0.2);
      holeBox(q, ox > 0 ? C + 3 : C - e - 3, ox > 0 ? C + e + 3 : C - 3, oy > 0 ? C + 3 : C - e - 3, oy > 0 ? C + e + 3 : C - 3, 0, z1, m);
    }
  }
  if (eastWall) { // broken stained glass in the lancet: leaded panes of red, blue, gold and green, half shattered
    q.surf((s, t) => [[C * K, (C - 6 + s * 12) * K, (10 + t * 30) * K], [1, 0, 0]], 54, 110, (l, s, t, px, py) => {
      const y = C - 6 + s * 12, z = 10 + t * 30, d = Math.abs(y - C);
      if (z > 30 && d >= 6 - (z - 30) * 0.6) return undefined;
      if (z > chapelHeight(tx, ty, C, y)) return undefined; // no glass above the broken wall top
      if (d < 0.7 && z < 33) return ramp(LIME, 0.5 + l * 0.4, px, py); // the stone mullion
      const cy = Math.floor((y + 10) / 2.2), cz = Math.floor(z / 2.6) + (cy % 2);
      if (hsh(cy, cz, tx * 7 + ty) < 0.18 + t * 0.3) return undefined; // shattered panes, most gone near the top
      if ((y + 10) % 2.2 < 0.45 || z % 2.6 < 0.45) return ramp(BLACKR, 0.3, px, py); // lead cames
      const g = GLASS[Math.floor(hsh(cy, cz, 77) * GLASS.length)];
      return ramp(g, 0.35 + l * 0.6 + (hsh(px, py, 5) < 0.12 ? 0.3 : 0), px, py);
    });
    // glass glinting in the grass below, outside and in
    for (let k = 0; k < 26; k++) {
      const u = C + (hsh(k, 1, tx * 3 + ty) - 0.3) * 22, v = 2 + hsh(k, 2, ty) * 28, g = GLASS[k % GLASS.length];
      q.plot(u * K, v * K, 0.2, g[1 + (k % 2)], -2);
    }
  }
  // fallen work all round: carved blocks, a broken pillar drum, slates and a charred roof beam
  const R = (k: number) => hsh(tx * 31 + k, ty * 17, 91);
  for (let k = 0; k < 9; k++) {
    const u = 2 + R(k) * 28, v = 2 + R(k + 20) * 28;
    if (Math.abs(u - C) < T + 2 && (mask & 5 || Math.abs(v - C) < T + 2)) continue;
    if (Math.abs(v - C) < T + 2 && (mask & 10)) continue;
    const s = 1.5 + R(k + 40) * 2.6, h = 1 + R(k + 60) * 2.2;
    holeBox(q, u - s, u + s, v - s * 0.8, v + s * 0.8, 0, h, m);
  }
  if (R(80) < 0.5) {
    const a = R(81) * Math.PI, u = 8 + R(82) * 16, v = 8 + R(83) * 16;
    if (!(Math.abs(u - C) < T + 4 && Math.abs(v - C) < T + 4)) q.rod([(u - Math.cos(a) * 6) * K, (v - Math.sin(a) * 6) * K, 2.5 * K], [(u + Math.cos(a) * 6) * K, (v + Math.sin(a) * 6) * K, 2.5 * K], 2.4 * K, (l, s, t, px, py) => ramp(LIME, l * 0.9 + (s * 5 % 1 < 0.08 ? -0.2 : 0), px, py));
  }
  for (let k = 0; k < 7; k++) { // slates from the fallen roof
    const u = 2 + R(100 + k) * 28, v = 2 + R(120 + k) * 28;
    if (Math.abs(u - C) < T + 1 && Math.abs(v - C) < T + 1) continue;
    q.quad([u * K, v * K, 0.4 * K], [3 * K, R(140 + k) * 1.5 * K, 0], [-R(160 + k) * K, 2.2 * K, 0.4 * K], (l, s, t, px, py) => ramp(SLATE, l, px, py));
  }
  if (R(200) < 0.45) {
    const u = 6 + R(201) * 20, v = 6 + R(202) * 20, a = R(203) * Math.PI;
    if (!(Math.abs(u - C) < T + 4 && Math.abs(v - C) < T + 4)) q.rod([(u - Math.cos(a) * 9) * K, (v - Math.sin(a) * 9) * K, 1.4 * K], [(u + Math.cos(a) * 9) * K, (v + Math.sin(a) * 9) * K, 0.9 * K], 1.4 * K, charred);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The Rusty Tankard

/** Charred timber: deep black with the alligator cracks of burnt wood, ember-brown in the cracks, ash on top. */
const charred: Mat = (l, s, t, px, py) => {
  const crack = ((px * 3 + (py >> 1) * 5) % 7 === 0) || ((py + (px >> 2)) % 5 === 0);
  if (crack && hsh(px, py, 3) < 0.6) return ramp(hsh(px, py, 4) < 0.05 ? EMBER : CHAR, 0.55 + l * 0.3, px, py);
  return ramp(CHAR, l * 0.75 + (hsh(px >> 1, py >> 1, 5) - 0.5) * 0.25, px, py);
};

function tankardTile(q: IsoPaint, mask: number, tx: number, ty: number) {
  const r = TANKARD_RUIN, R = (k: number) => hsh(tx * 29 + k, ty * 13, 57);
  const P = (u: number, v: number, z: number): V3 => [u * K, v * K, z * K];
  const corner = (tx === r.x || tx === r.x + r.w - 1) && (ty === r.y || ty === r.y + r.h - 1);
  const S = ty === r.y + r.h - 1, N = ty === r.y;
  // the stone footing the frame stood on, cracked by the heat
  arms(mask, 4.5, 8, (u0, u1, v0, v1) => holeBox(q, u0, u1, v0, v1, 0, 4, (l, x, y, z, px, py, top) => ramp(top ? ASH : LIME.slice(0, 5), l * 0.55 - 0.1 + (hsh(px, py, 6) - 0.5) * 0.25, px, py)));
  // posts: the corner and middle posts still stand, split and leaning, burnt thinner towards the top
  const postH = corner ? 46 + R(1) * 10 : S ? 14 + R(1) * 10 : 22 + R(1) * 22;
  const lean: V3 = [(R(2) - 0.5) * 6, (R(3) - 0.5) * 6, 0];
  q.rod(P(C, C, 3), P(C + lean[0], C + lean[1], postH), 3 * K, charred);
  q.rod(P(C + lean[0] * 0.9, C + lean[1] * 0.9, postH - 2), P(C + lean[0] * 1.1 + 1.5, C + lean[1] * 1.1, postH + 4), 1.4 * K, charred); // split, burnt-thin top
  // planks between the posts, burnt off at ragged heights, glowing at the edges here and there
  const dirs: [number, number, number][] = [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]];
  for (const [bit, dx, dy] of dirs) {
    if (!(mask & bit)) continue;
    for (let d = 3; d < 16; d += 2.2) {
      const h = (S ? 6 : 10) + hsh(Math.round((tx * 32 + C + dx * d) + (ty * 32 + C + dy * d)), 9, 33) * (S ? 8 : 20) * (1 - d / 22);
      const x = C + dx * d, y = C + dy * d, w = 1;
      holeBox(q, dx ? x - w : C - 1.4, dx ? x + w : C + 1.4, dx ? C - 1.4 : y - w, dx ? C + 1.4 : y + w, 4, 4 + h, (l, xx, yy, z, px, py, top) =>
        top || z > 4 + h - 1.2 ? ramp(hsh(px, py, 2) < 0.07 ? EMBER : hsh(px, py, 12) < 0.5 ? ASH : CHAR, 0.15 + l * 0.45, px, py) : charred(l, 0, 0, px, py));
    }
  }
  // a cross brace or a rafter still hanging from a tall post, others fallen in the ash
  if (corner || (N && R(4) < 0.6)) {
    const a = R(5) * Math.PI * 2;
    q.rod(P(C + lean[0], C + lean[1], postH - 4), P(C + Math.cos(a) * 14, C + Math.sin(a) * 14, 3), 1.5 * K, charred);
  }
  for (let k = 0; k < 4; k++) {
    const u = 3 + R(10 + k) * 26, v = 3 + R(20 + k) * 26, a = R(30 + k) * Math.PI, L = 4 + R(40 + k) * 8;
    if (Math.abs(u - C) < 6 && Math.abs(v - C) < 6) continue;
    q.rod(P(u - Math.cos(a) * L, v - Math.sin(a) * L, 1.2), P(u + Math.cos(a) * L, v + Math.sin(a) * L, 1), (0.9 + R(50 + k)) * K, charred);
  }
  // ash drifts and a few iron bits (hoops of the burnt barrels, a pot hook)
  for (let k = 0; k < 40; k++) { const u = 1 + R(60 + k) * 30, v = 1 + R(110 + k) * 30; q.plot(u * K, v * K, 0.1, ramp(ASH, R(160 + k), k, ty), -3); }
  if (R(200) < 0.5) {
    const u = 6 + R(201) * 20, v = 6 + R(202) * 20;
    if (!(Math.abs(u - C) < 6 && Math.abs(v - C) < 6)) q.surf((s, t) => { const a = s * Math.PI * 2, rr = 4 + t * 0.6; return [P(u + Math.cos(a) * rr, v + Math.sin(a) * rr * 0.8, 0.6 + t * 0.6), [0, 0, 1]]; }, 40, 3, (l, s, t, px, py) => ramp(IRONR, l * 0.6 - 0.1, px, py));
  }
}
