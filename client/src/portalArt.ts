import Phaser from "phaser";
import { ART_K as K } from "../../shared/constants";
import { dropHiRes, hiResTexture } from "./smooth";
import { dith as dith1, hash, OUT, stoneCol, vnoise, type Px } from "./shrineArt";

/** Ordered dither on the coarse 2x2-cell pixel (see chunky()), so each final pixel is one clean tone. */
const dith = (x: number, y: number) => dith1(x >> 1, y >> 1);

/**
 * Hand-built pixel art for the portal stones (shared/portals.ts), in the forest shrine's style (shrineArt.ts): one
 * colour per cell on a half design-unit grid, three-tone stone lit from the top left, ordered dithering, dark outlines.
 * Built as real isometric solids (Murat 2026-11-03: the first, front-on ring looked flat): a two-tier flagstone
 * platform and a carved plinth, each with a lit top, a mid-tone left face and a dark right face, carrying a thick ring
 * of carved voussoirs set along the world x axis. The ring is drawn in depth slices, so its inner and outer rims
 * show as side faces, and it faces the arrival side (world +y, screen down-left).
 *   "portal_lit_<v>_<mask>": 8 animated frames: a slow fire-swirl fills the ring.
 *   "portal_cold_<v>_<mask>": one frame: a dormant ring, the opening empty (not found yet).
 * The ring has one block per portal; a block's rune burns once that portal is woken (bit k of mask = stone k of its land, shared/portals.ts PORTAL_LANDS).
 */

const W = 128, H = 184, CX = 64, BY = 140; // cells; BY = the platform's centre on the ground (the sprite's feet)
export const PORTAL_FW = W / 2, PORTAL_FH = H / 2, PORTAL_FOOT = BY / H;

// Iso axes in cells: world x runs down-right, world y down-left, height straight up (2:1 like the map tiles)
const UX = 1, UY = 0.5, NX = -1, NY = 0.5;
const ZTOP1 = 6, ZTOP2 = 11; // platform tiers' tops
const PL = { a: 23, b: 9, z: 16 }; // plinth half-extents and height, on top of the upper tier
const ZP = ZTOP2 + PL.z; // plinth top
const RO = 37, RI = 23, DEPTH = 6; // ring outer / inner radius, half thickness (world y)
const ZC = ZP + RO - 6; // ring centre height: its foot sinks into the plinth
/** One voussoir per portal stone of this stone's land (Murat 2026-11-04, by land since 2026-11-19): block b burns once
 * this hero has woken the land's stone (KEY + b) % BLOCKS, so the keystone at the top is always this stone's own portal.
 * A land with few stones still gets MIN_BLOCKS blocks (the spare ones never burn). Set per stone by paintPortal. */
const MIN_BLOCKS = 6;
let BLOCKS = MIN_BLOCKS, KEY = 0, STONES = 0;
/** Which stone is being painted (its index in PORTALS): every portal wears differently (Murat 2026-11-04: "too perfect"). */
let V = 0;
const hv = (a: number, b: number, s: number) => hash(a, b, s + V * 1013);
const nv = (x: number, y: number, s: number) => vnoise(x, y, 999, s + V * 131);

/** Portal fire, dark to bright (the village bonfire's ramp). */
const FIRE = ["#3a0f08", "#6e1a0a", "#a82c0c", "#d84a12", "#f2761c", "#ffa22e", "#ffcf52", "#fff0a8"];
const FIRE_T = [0.18, 0.28, 0.38, 0.48, 0.58, 0.69, 0.8, 0.92];
const band = (v: number) => { let i = -1; for (let j = 0; j < FIRE.length; j++) if (v > FIRE_T[j]) i = j; return i; };

/** Screen cell of a world point (a along x, b along y, z up), relative to the feet. */
const scr = (a: number, b: number, z: number) => ({ x: CX + a * UX + b * NX, y: BY + a * UY + b * NY - z });

/** Carved rune `k` in block-local coords (u along the ring, v across it, about -1..1): true on its groove. */
function rune(k: number, u: number, v: number): boolean {
  const kind = k % 4, a = Math.abs(u), b = Math.abs(v);
  if (kind === 0) return (a < 0.18 && b < 0.62) || (Math.abs(u - v * 0.6) < 0.18 && v < 0 && v > -0.62);
  if (kind === 1) return Math.abs(Math.hypot(u, v * 0.9) - 0.42) < 0.18 || (a < 0.18 && b < 0.18);
  if (kind === 2) return (a < 0.18 && b < 0.62) || (b < 0.18 && a < 0.42) || (Math.abs(v + 0.45) < 0.18 && a < 0.3);
  return Math.abs(Math.abs(u) - (0.55 - b * 0.5)) < 0.18 && b < 0.6;
}

type Face = "top" | "left" | "right";
/**
 * An iso box standing on (0, 0, z0) in world coords, half-extents A (x) and B (y), height h. `col` colours a cell of a
 * face from the face's own coords (s, t, each 0..1 across the face) and returns undefined to use the plain stone.
 */
function isoBox(px: Px, z0: number, A: number, B: number, h: number, tone: number, seed: number,
  col?: (face: Face, s: number, t: number, x: number, y: number, lit: number) => string | undefined) {
  const top = scr(0, 0, z0 + h);
  const x0 = Math.floor(CX - A - B - 1), x1 = Math.ceil(CX + A + B + 1);
  const y0 = Math.floor(top.y - (A + B) * 0.5 - 1), y1 = Math.ceil(scr(A, B, z0).y + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const qx = x + 0.5 - CX, qy = y + 0.5 - BY;
    // top face: q = a*U + b*N - (z0+h)*Z
    const ty = qy + z0 + h;
    const a = (qx + 2 * ty) / 2, b = (2 * ty - qx) / 2; // inverse of x = a - b, y = (a + b) / 2
    let face: Face | undefined, s = 0, t = 0, edge = false;
    if (Math.abs(a) <= A && Math.abs(b) <= B) {
      face = "top"; s = (a + A) / (2 * A); t = (b + B) / (2 * B);
      edge = A - Math.abs(a) < 0.9 || B - Math.abs(b) < 0.9;
    } else {
      // left face (b = +B): x = a - B, y = (a + B)/2 - z
      const al = qx + B, zl = (al + B) / 2 - qy;
      if (Math.abs(al) <= A && zl >= z0 && zl <= z0 + h) {
        face = "left"; s = (al + A) / (2 * A); t = (zl - z0) / h;
        edge = A - Math.abs(al) < 0.8 || zl - z0 < 0.9 || z0 + h - zl < 0.6;
      } else {
        // right face (a = +A): x = A - b, y = (A + b)/2 - z
        const br = A - qx, zr = (A + br) / 2 - qy;
        if (Math.abs(br) <= B && zr >= z0 && zr <= z0 + h) {
          face = "right"; s = (br + B) / (2 * B); t = (zr - z0) / h;
          edge = B - Math.abs(br) < 0.8 || zr - z0 < 0.9 || z0 + h - zr < 0.6;
        }
      }
    }
    if (!face) continue;
    // wear: the edges are chipped and the corners crumbled (a dark broken face where stone has flaked off)
    const ea = face === "top" ? Math.min(A - Math.abs(a), B - Math.abs(b)) : face === "left" ? Math.min(A - Math.abs(qx + B), z0 + h - ((qx + 2 * B) / 2 - qy)) : Math.min(B - Math.abs(A - qx), z0 + h - ((2 * A - qx) / 2 - qy));
    const chip = nv(x * 0.22, y * 0.22, seed + 7);
    if (ea < 3.2 && chip > 0.66) {
      if (ea < 1.6 && chip > 0.72) continue; // a bite out of the silhouette
      px(x, y, dith(x, y) < 0.5 ? "#2a2622" : "#3a3631");
      continue;
    }
    if (edge) { px(x, y, OUT); continue; }
    const n = (vnoise(x * 0.3, y * 0.3, 999, seed) - 0.5) * 0.5 + (dith(x, y) - 0.5) * 0.45;
    const lit = (face === "top" ? 0.62 : face === "left" ? 0.05 : -0.55) + n;
    px(x, y, col?.(face, s, t, x, y, lit) ?? stoneCol(lit, tone));
  }
}

function paintPortal(g: CanvasRenderingContext2D, f: number, N: number, lit: boolean, variant: number, ring: PortalRing) {
  V = variant; KEY = ring.key; STONES = ring.stones; BLOCKS = Math.max(MIN_BLOCKS, ring.stones);
  const woke = (bi: number) => { const k = (KEY + bi) % BLOCKS; return k < STONES ? (ring.mask >> k) & 1 : 0; };
  // painted one colour per cell on a scratch canvas, then coarsened to the decor's chunkier pixel (chunky() below)
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const o = cv.getContext("2d")!;
  const px: Px = (x, y, c) => { o.fillStyle = c; o.fillRect(x, y, 1, 1); };
  const ph = (f / N) * Math.PI * 2, pulse = 0.5 + 0.5 * Math.sin(ph);
  /** Portal light falling on a top face: strongest in front of the ring. */
  const glowAt = (x: number, y: number) => {
    if (!lit) return 0;
    const c = scr(0, 4, ZP);
    return Math.max(0, 1 - Math.hypot((x - c.x) / 40, (y - c.y) / 22));
  };

  // soft shadow on the grass
  for (let y = BY - 30; y <= BY + 40; y++) for (let x = 0; x < W; x++) {
    const ex = (x - CX - 4) / 62, ey = (y - BY - 6) / 32, d = ex * ex + ey * ey;
    if (d < 1 && dith(x, y) < (1 - d) * 0.6) px(x, y, "rgba(10,8,6,0.45)");
  }

  // lower tier: a broad, sunken flagstone platform, moss in its joints and creeping up its sides
  const flags = (face: Face, s: number, t: number, x: number, y: number, l: number, A: number, B: number, seed: number) => {
    if (face === "top") {
      const u = s * A / 9 + (Math.floor(t * B / 9) % 2) * 0.5, v = t * B / 9;
      const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
      if (fu < 0.1 || fv < 0.1) return nv(x * 0.5, y * 0.5, seed + 1) > 0.45 ? "#2f4a1c" : "#1c1814";
      const slab = hv(iu, iv, seed + 6);
      if (slab < 0.09) return nv(x * 0.4, y * 0.4, seed + 8) > 0.5 ? (dith(x, y) < 0.5 ? "#3d5822" : "#2c4219") : "#3a2e22"; // a slab gone: earth and grass
      const sunk = slab > 0.82; // sunk or tilted: darker, its far edge in shadow
      if (sunk && fv < 0.24) return "#24201c";
      let c = stoneCol(l - 0.1 - (sunk ? 0.35 : 0) + (1 - fv) * (slab > 0.7 ? 0.45 : 0.2), 0.7 + hv(iu, iv, seed + 2) * 0.32);
      if (Math.abs(nv(x * 0.12, y * 0.12, seed + 9) - 0.5) < 0.025) c = "#1c1814"; // cracks wandering across the slabs
      if (hv(iu, iv, seed + 3) < 0.22 && nv(x * 0.3, y * 0.3, seed + 4) > 0.45) c = dith(x, y) < 0.5 ? "#4e6a2a" : "#36501e";
      else if (hv(x, y, seed + 10) < 0.03) c = "#a7a37a"; // lichen
      const gl = glowAt(x, y);
      if (gl > 0 && dith(x, y) < gl * (0.55 + 0.2 * pulse)) c = l > 0.6 ? "#c88a52" : "#9a5a30";
      return c;
    }
    // sides: courses of dressed blocks
    const rows = 2, row = Math.floor(t * rows), span = face === "left" ? A : B;
    const k = s * span / 5 + row * 0.5, fk = k - Math.floor(k);
    if (fk < 0.1 || Math.abs(t * rows - Math.round(t * rows)) < 0.12) return "#1c1814";
    if (t < 0.5 && nv(x * 0.3, y * 0.4, seed + 5) > 0.5) return dith(x, y) < 0.5 ? "#3d5822" : "#2c4219";
    const blk = hv(Math.floor(k), row, seed + 11);
    if (blk < 0.18) return stoneCol(l - 0.4, 0.72); // a weathered, darker block
    return undefined;
  };
  isoBox(px, 0, 30, 28, ZTOP1, 0.8, 211, (fc, s, t, x, y, l) => flags(fc, s, t, x, y, l, 30, 28, 220));
  // upper tier
  isoBox(px, ZTOP1, 26, 19, ZTOP2 - ZTOP1, 0.86, 212, (fc, s, t, x, y, l) => flags(fc, s, t, x, y, l, 26, 19, 230));

  // fallen chips of stone lying on the lower tier and in the grass
  for (let k = 0; k < 4; k++) {
    const onTier = k < 2, side = hv(k, 1, 160) < 0.5;
    const a0 = onTier ? (side ? (hv(k, 2, 160) - 0.5) * 44 : 27.5) : (hv(k, 2, 160) - 0.5) * 50;
    const b0 = onTier ? (side ? 23.5 : (hv(k, 3, 160) - 0.5) * 40) : 31 + hv(k, 3, 160) * 4;
    const c = scr(a0, b0, onTier ? ZTOP1 : 0), rw = 2.6 + hv(k, 4, 160) * 2, rh = 1.6 + hv(k, 5, 160);
    for (let y = Math.floor(c.y - rh - 3); y <= c.y + 1; y++) for (let x = Math.floor(c.x - rw - 1); x <= c.x + rw + 1; x++) {
      const dx = (x - c.x) / rw, dy = (y - c.y + rh) / (rh + 1.5), d = dx * dx + dy * dy;
      if (d > 1) continue;
      px(x, y, d > 0.6 ? OUT : stoneCol(-dx * 0.6 - dy * 0.5 + (dith(x, y) - 0.5) * 0.4, 0.8));
    }
  }

  // plinth: a carved block with a band of notches that burn when the portal is awake
  isoBox(px, ZTOP2, PL.a, PL.b, PL.z, 0.88, 213, (fc, s, t, x, y, l) => {
    if (fc === "top") return undefined;
    if (Math.abs(t - 0.62) < 0.05) return "#26231f"; // carved band
    if (t > 0.2 && t < 0.5) {
      const span = fc === "left" ? PL.a * 2 : PL.b * 2, k = s * span / 5, fk = k - Math.floor(k);
      if (fk > 0.35 && fk < 0.65) return lit ? (dith(x, y) < 0.4 + 0.4 * pulse ? FIRE[6] : FIRE[4]) : "#26231f";
    }
    if (hv(x, y, 214) < 0.03) return "#a7a37a";
    if (t < 0.4 && nv(x * 0.25, y * 0.4, 215) > 0.52) return dith(x, y) < 0.5 ? "#3d5822" : "#2c4219";
    // a crack running down the long face, and dark rain streaks under the band
    const cs = 0.3 + hv(1, 2, 216) * 0.4;
    if (fc === "left" && Math.abs(s - cs - (1 - t) * 0.06 - Math.sin(t * 9) * 0.015) < 0.012) return OUT;
    if (t < 0.58 && hv(Math.floor(x / 2), 0, 217) < 0.3 && nv(x * 0.6, y * 0.05, 218) > 0.45) return stoneCol(l - 0.45, 0.8);
    return undefined;
  });

  // the ring, in depth slices from the back (world -y) to the front face
  const C0 = scr(0, 0, ZC);
  const slice = (b: number, front: boolean) => {
    const cx = C0.x + b * NX, cy = C0.y + b * NY;
    for (let y = Math.floor(cy - RO * 1.2 - 7); y <= Math.ceil(cy + RO * 1.2); y++) for (let x = Math.floor(cx - RO - 2); x <= Math.ceil(cx + RO + 2); x++) {
      const qx = x + 0.5 - cx, qy = y + 0.5 - cy;
      const s = qx / UX, v = s * UY - qy; // along the ring (world x) and up
      const r = Math.hypot(s, v);
      const top = Math.atan2(s, v); // 0 at the top
      const key = Math.abs(top) < Math.PI / BLOCKS;
      const bs = ((top / (Math.PI * 2)) * BLOCKS + 0.5 + BLOCKS * 4) % BLOCKS, bi = Math.floor(bs), fu = bs - bi;
      // every block sits a little proud or sunk, and two of them have lost a chunk off their outer edge
      const lump = (hv(bi, 3, 148) - 0.5) * 4.5 + (nv(top * 6 + 9, 0, 141) - 0.5) * 2.4;
      const broken = bi === Math.floor(hv(0, 1, 149) * BLOCKS) || bi === Math.floor(hv(0, 2, 149) * BLOCKS);
      const bite = broken ? Math.max(0, 7 - Math.abs(fu - 0.5 - (hv(bi, 4, 150) - 0.5) * 0.4) * 22) * (0.7 + nv(top * 30, 2, 151) * 0.6) : 0;
      const ro = RO + (key ? 5 : 0) + lump - bite, ri = RI + (nv(top * 7 + 4, 1, 142) - 0.5) * 1.6;
      if (r > ro || r < ri || ZC + v < ZP) continue; // the foot is sunk into the plinth
      if (!front) {
        // a rim: outer rims face up and out, inner rims (the tunnel) face down and in; lit from the top left
        const outer = r > (ro + ri) / 2;
        const ny = v / r, nx = s / r;
        let l = outer ? ny * 0.75 - nx * 0.25 - 0.35 : -ny * 0.65 + nx * 0.2 - 0.6;
        l += (dith(x, y) - 0.5) * 0.45 + (vnoise(x * 0.3, y * 0.3, 999, 147) - 0.5) * 0.3;
        let c = fu < 0.06 || fu > 0.96 ? "#1c1814" : stoneCol(l, 0.84 + hash(bi, 7, 144) * 0.2);
        if (lit && !outer) c = l > -0.7 + (pulse - 0.5) * 0.2 ? "#b8642a" : "#8a3e18"; // the tunnel lit by the swirl
        px(x, y, c);
        continue;
      }
      if (ro - r < 1.1 || r - ri < 1.1 || ZC + v - ZP < 0.8) { px(x, y, OUT); continue; }
      const t = (r - ri) / (ro - ri);
      // the joints round a woken portal's block glow, so even the blocks seen edge-on show which portals are found
      if (fu < 0.07 || fu > 0.95) { px(x, y, woke(bi) && t > 0.12 && t < 0.9 ? FIRE[4] : OUT); continue; }
      const nx = s / r, ny = v / r;
      const bevel = t > 0.82 ? 1 : t < 0.16 ? -1 : 0;
      let l = (ny * 0.6 - nx * 0.4) * 0.45 * bevel + 0.08 + (vnoise(x * 0.35, y * 0.25, 999, 143) - 0.5) * 0.55 + (dith(x, y) - 0.5) * 0.45
        + (bevel === -1 ? -0.3 : 0) + (fu < 0.14 ? 0.28 : fu > 0.88 ? -0.32 : 0);
      let c = stoneCol(l, 0.84 + hash(bi, 7, 144) * 0.2);
      const moss = vnoise(x * 0.22, y * 0.2, 999, 145);
      if ((nx < -0.2 && ny > -0.3 && moss > 0.58 && t > 0.5) || (ZC + v - ZP < 9 && moss > 0.5)) c = dith(x, y) < 0.5 + (moss - 0.5) ? (l > 0.2 ? "#5c7a30" : "#3d5822") : "#2c4219";
      else if (hash(x, y, 146) < 0.03) c = "#a7a37a";
      for (let k = 0; k < 3; k++) { // cracks through a few blocks, wandering as they run outwards
        const ca = (hv(k, 5, 152) - 0.5) * 5.6 + (r - ri) * (hv(k, 6, 152) - 0.5) * 0.03 + Math.sin(r * 0.7 + k) * 0.03;
        if (Math.abs(top - ca) < 0.026 && t > 0.12 + k * 0.15) c = OUT;
      }
      if (ny < 0.2 && hv(Math.floor(x / 2), bi, 153) < 0.25 && nv(x * 0.7, y * 0.06, 154) > 0.5 && t > 0.2) c = stoneCol(l - 0.45, 0.8); // rain streaks on the lower blocks
      // the rune keeps its size on the wider blocks; it burns only once its portal is woken
      const u = (fu - 0.5) * 2.3 * 9 / BLOCKS, w = (t - 0.5) * 2.4, on = woke(bi);
      if (rune(bi + V, u, w)) c = on ? (0.5 + 0.5 * Math.sin(ph + bi * 0.7) > 0.5 ? FIRE[6] : FIRE[5]) : "#25211c";
      else if (on && dith(x, y) < 0.22 - Math.abs(fu - 0.5) * 0.2) c = l > 0.1 ? FIRE[4] : FIRE[3]; // embers glowing in the stone
      else if (lit && t < 0.3 && dith(x, y) < (0.3 - t) * 2.2) c = l > 0 ? "#d88a46" : "#9a5228";
      px(x, y, c);
    }
  };

  // the fire swirl: a tunnel of fire sinking back through the ring (world -y, screen up-right) to a dark eye. Each
  // pixel shows the deepest ring of the tunnel that still covers it, so the walls recede and the centre falls away.
  const DEEP = 34, SHIFT = RI * 0.42, SHRINK = 0.74;
  const swirl = () => {
    const cx = C0.x, cy = C0.y;
    for (let y = Math.floor(cy - RI * 1.2); y <= Math.ceil(cy + RI * 1.2); y++) for (let x = Math.floor(cx - RI); x <= Math.ceil(cx + RI); x++) {
      const qx = x + 0.5 - cx, qy = y + 0.5 - cy;
      const s0 = qx / UX, v0 = s0 * UY - qy;
      if (Math.hypot(s0, v0) > RI - 0.5) continue;
      let d = 0, a = 0, rr = 0;
      for (let k = DEEP; k >= 0; k--) {
        const t = k / DEEP, R = (RI - 0.5) * (1 - SHRINK * t);
        const ds = s0 - SHIFT * t, dv = v0 - SHIFT * t, rk = Math.hypot(ds, dv);
        if (rk <= R) { d = t; a = Math.atan2(dv, ds); rr = rk / R; break; }
      }
      // bands spiral down the tunnel and turn slowly (one turn per N frames); deeper = darker
      const sw = a / (Math.PI * 2) + d * 1.6 - f / N;
      const n = vnoise(Math.cos(sw * Math.PI * 2) * 2 + 3, Math.sin(sw * Math.PI * 2) * 2 + d * 4, 999, 181);
      const spiral = 0.5 + 0.5 * Math.sin(sw * Math.PI * 6 + n * 2.5);
      const val = 0.98 - d * 0.82 + (spiral - 0.5) * 0.3 + (n - 0.5) * 0.35 + (rr > 0.9 ? 0.08 : 0) + (dith(x, y) - 0.5) * 0.1;
      const i = band(val);
      px(x, y, d > 0.97 ? "#120403" : i < 0 ? "#240806" : FIRE[Math.min(i, FIRE.length - 1)]);
    }
  };

  for (let b = -DEPTH; b < 0; b += 0.5) slice(b, false);
  if (lit) swirl();
  for (let b = 0; b < DEPTH; b += 0.5) slice(b, false);
  slice(DEPTH, true);

  // pixels of fire escaping out of the tunnel towards the viewer (world +y, screen down-left), growing as they come
  const sparks: [number, number, number, string][] = [];
  if (lit) {
    for (let k = 0; k < 32; k++) {
      const life = ((f / N) + hash(k, 1, 191)) % 1;
      const a0 = hash(k, 2, 191) * Math.PI * 2, r0 = (0.25 + hash(k, 3, 191) * 0.5) * RI;
      const spread = 1 + life * 1.6, rise = k % 3 === 0 ? life * 26 : life * 6; // every third one drifts up like an ember
      const s = Math.cos(a0) * r0 * spread, v = Math.sin(a0) * r0 * spread + rise;
      const b = DEPTH + life * 46; // out along world +y, over the platform and the grass
      // snapped to the coarse 2x2 pixel (chunky()), so each spark survives as a clean block
      const x = Math.round(C0.x + s * UX + b * NX) & ~1, y = Math.round(C0.y + s * UY - v + b * NY) & ~1;
      const sz = life < 0.7 && k % 2 === 0 ? 6 : 4;
      const c = life < 0.3 ? FIRE[7] : life < 0.6 ? FIRE[6] : life < 0.85 ? FIRE[5] : FIRE[3];
      sparks.push([x, y, sz, c]);
    }
  }
  const out = chunky(o);
  // the sparks go on after chunky(), so they keep their glow and get no dark outline
  const oc = out.getContext("2d")!;
  for (const [x, y, sz, c] of sparks) { oc.fillStyle = c; oc.fillRect(x >> 1, y >> 1, sz >> 1, sz >> 1); }
  g.save();
  g.scale(0.5, 0.5);
  g.imageSmoothingEnabled = false;
  g.drawImage(out, 0, 0, W, H);
  g.restore();
}

/**
 * Murat 2026-11-04: the fine one-cell painting stood out next to the trees and palisade. Each 2x2 block of cells
 * becomes one pixel of its most common colour (darker wins a tie), tones are muted towards the world's weathered
 * greys, and the silhouette gets a solid dark outline one block thick, like the rest of the decor.
 */
function chunky(o: CanvasRenderingContext2D): HTMLCanvasElement {
  const B = 2, CW = W / B, CH = H / B;
  const src = o.getImageData(0, 0, W, H).data;
  const res = document.createElement("canvas");
  res.width = CW; res.height = CH;
  const rc = res.getContext("2d")!, img = rc.createImageData(CW, CH), d = img.data;
  const solid = new Uint8Array(CW * CH); // 1 = opaque art, 2 = see-through shadow
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    const votes = new Map<number, number>();
    let opaque = 0;
    for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) {
      const k = ((cy * B + j) * W + cx * B + i) * 4;
      if (src[k + 3] < 8) continue;
      opaque++;
      const key = (src[k] << 24 | src[k + 1] << 16 | src[k + 2] << 8 | src[k + 3]) >>> 0;
      votes.set(key, (votes.get(key) ?? 0) + 1);
    }
    let best = -1, bn = 0, bl = 1e9;
    for (const [key, n] of votes) {
      const l = (key >>> 24) + ((key >>> 16) & 255) + ((key >>> 8) & 255);
      if (n > bn || (n === bn && l < bl)) { best = key; bn = n; bl = l; }
    }
    if (best < 0 || opaque < 2) continue;
    let r = best >>> 24, gg = (best >>> 16) & 255, b = (best >>> 8) & 255;
    const a = best & 255, q = (cy * CW + cx) * 4;
    // mute: pull towards a warm dark grey, keep fire colours bright
    const hot = r > gg + 40 && r > 150;
    if (!hot) { const m = (r + gg + b) / 3; r = (r * 0.7 + m * 0.3) * 0.86 + 6; gg = (gg * 0.7 + m * 0.3) * 0.84 + 4; b = (b * 0.7 + m * 0.3) * 0.8; }
    d[q] = r; d[q + 1] = gg; d[q + 2] = b; d[q + 3] = a;
    solid[cy * CW + cx] = a > 200 ? 1 : 2;
  }
  // outline: an art pixel next to empty or shadow becomes the dark outline colour
  const edge: number[] = [];
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    if (solid[cy * CW + cx] !== 1) continue;
    const open = (x: number, y: number) => x < 0 || y < 0 || x >= CW || y >= CH || solid[y * CW + x] !== 1;
    if (open(cx - 1, cy) || open(cx + 1, cy) || open(cx, cy - 1) || open(cx, cy + 1)) edge.push(cy * CW + cx);
  }
  for (const e of edge) { const q = e * 4; d[q] = 0x15; d[q + 1] = 0x11; d[q + 2] = 0x0e; d[q + 3] = 255; }
  rc.putImageData(img, 0, 0);
  return res;
}

export const PORTAL_FRAMES = 8;
/** A stone's ring: `stones` in its land, its own index `key` among them, and `mask` (bit k = the land's stone k is woken). */
export interface PortalRing { key: number; stones: number; mask: number }
/**
 * Builds stone `v`'s art, each worn its own way, for its ring `ring`: "portal_lit_<v>_<mask>" (animated,
 * anim "portal_spin_<v>_<mask>") or "portal_cold_<v>_<mask>". Painted on demand, so only the stones a hero actually sees
 * cost anything. Returns the "<v>_<mask>" id.
 */
export function portalTexture(scene: Phaser.Scene, v: number, lit: boolean, ring: PortalRing) {
  const N = PORTAL_FRAMES, id = `${v}_${ring.mask}`;
  if (lit && !scene.textures.exists(`portal_lit_${id}`)) {
    hiResTexture(scene, `portal_lit_${id}`, PORTAL_FW * K, PORTAL_FH * K, N, 4, (g, f) => { g.scale(K, K); paintPortal(g, f, N, true, v, ring); });
    scene.anims.create({ key: `portal_spin_${id}`, frames: scene.anims.generateFrameNumbers(`portal_lit_${id}`, { start: 0, end: N - 1 }), frameRate: 8, repeat: -1 });
  }
  if (!lit && !scene.textures.exists(`portal_cold_${id}`)) hiResTexture(scene, `portal_cold_${id}`, PORTAL_FW * K, PORTAL_FH * K, 1, 4, (g) => { g.scale(K, K); paintPortal(g, 0, N, false, v, ring); });
  return id;
}

/** Drops a stone's old art once it shows a newer one (each woken portal changes every stone's blocks). */
export function dropPortalTexture(scene: Phaser.Scene, lit: boolean, id: string) {
  const key = `portal_${lit ? "lit" : "cold"}_${id}`;
  if (lit) scene.anims.remove(`portal_spin_${id}`);
  scene.textures.remove(key);
  dropHiRes(key);
}

