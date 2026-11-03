import Phaser from "phaser";
import { ART_K as K } from "../../shared/constants";
import { hiResTexture } from "./smooth";
import { dith, hash, OUT, stoneCol, vnoise, type Px } from "./shrineArt";

/**
 * Hand-built pixel art for the portal stones (shared/portals.ts), in the forest shrine's style (shrineArt.ts): one
 * colour per cell on a half design-unit grid, three-tone stone lit from the top left, ordered dithering, dark outlines.
 * A ring of carved voussoir stones with a keystone stands on a squat plinth over a worn flagstone dais. Each block of
 * the ring bears a carved rune.
 *   "portal_lit": 8 animated frames: the runes burn orange and a slow fire-swirl fills the ring.
 *   "portal_cold": one frame: a dormant ring, runes dark, the opening empty (not found yet).
 */

const W = 128, H = 160, CX = 64, BY = 140; // cells; BY = the dais centre (the sprite's feet)
export const PORTAL_FW = W / 2, PORTAL_FH = H / 2, PORTAL_FOOT = BY / H;
const RC = BY - 62; // ring centre
const RO = 46, RI = 29; // outer / inner radius of the ring
const BLOCKS = 13; // voussoirs round the ring (the keystone is the top one)

/** Portal fire, dark to bright (the village bonfire's ramp). */
const FIRE = ["#3a0f08", "#6e1a0a", "#a82c0c", "#d84a12", "#f2761c", "#ffa22e", "#ffcf52", "#fff0a8"];
const FIRE_T = [0.18, 0.28, 0.38, 0.48, 0.58, 0.69, 0.8, 0.92];
const band = (v: number) => { let i = -1; for (let j = 0; j < FIRE.length; j++) if (v > FIRE_T[j]) i = j; return i; };

/** Carved rune `k` in block-local coords (u along the ring, v across it, both about -1..1): true on its groove. */
function rune(k: number, u: number, v: number): boolean {
  const kind = k % 4, a = Math.abs(u), b = Math.abs(v);
  if (kind === 0) return (a < 0.13 && b < 0.62) || (Math.abs(u - v * 0.6) < 0.12 && v < 0 && v > -0.62); // a branch
  if (kind === 1) return Math.abs(Math.hypot(u, v * 0.9) - 0.42) < 0.12 || (a < 0.12 && b < 0.12); // eye
  if (kind === 2) return (a < 0.12 && b < 0.62) || (b < 0.12 && a < 0.42) || (Math.abs(v + 0.45) < 0.11 && a < 0.3); // cross with a foot
  return Math.abs(Math.abs(u) - (0.55 - b * 0.5)) < 0.13 && b < 0.6; // chevron
}

function paintPortal(g: CanvasRenderingContext2D, f: number, N: number, lit: boolean) {
  g.save();
  g.scale(0.5, 0.5);
  const px: Px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
  const ph = (f / N) * Math.PI * 2, pulse = 0.5 + 0.5 * Math.sin(ph);

  // soft shadow, then the dais: worn flagstones with moss in the joints, grass creeping over the rim
  for (let y = BY - 24; y <= BY + 20; y++) for (let x = 0; x < W; x++) {
    const ex = (x - CX) / 60, ey = (y - BY - 2) / 18, d = ex * ex + ey * ey;
    if (d < 1 && dith(x, y) < (1 - d) * 0.7) px(x, y, "rgba(10,8,6,0.45)");
  }
  for (let y = BY - 18; y <= BY + 16; y++) for (let x = CX - 56; x <= CX + 56; x++) {
    const ex = (x - CX) / 54, ey = (y - BY) / 15.5, d = ex * ex + ey * ey;
    const rim = 1 + (vnoise(x * 0.3, y * 0.5, 999, 161) - 0.5) * 0.22;
    if (d > rim) continue;
    const u = (x - CX) / 10 + vnoise(x * 0.2, y * 0.3, 999, 162) * 0.6, v = (y - BY) / 4.5 + vnoise(x * 0.25, y * 0.2, 999, 163) * 0.5;
    const iu = Math.floor(u + (Math.floor(v) % 2) * 0.5), iv = Math.floor(v);
    const fu = u + (Math.floor(v) % 2) * 0.5 - iu, fv = v - iv;
    const joint = fu < 0.1 || fv < 0.16;
    const tone = 0.76 + hash(iu, iv, 164) * 0.3;
    const lit0 = -fu * 0.3 + (1 - fv) * 0.5 + (dith(x, y) - 0.5) * 0.5 - (d > rim - 0.12 ? 0.6 : 0);
    let c = joint ? (vnoise(x * 0.5, y * 0.5, 999, 165) > 0.45 ? "#2f4a1c" : "#1c1814") : stoneCol(lit0 - 0.15, tone);
    if (!joint && hash(iu, iv, 166) < 0.16 && vnoise(x * 0.3, y * 0.3, 999, 167) > 0.5) c = dith(x, y) < 0.5 ? "#4e6a2a" : "#36501e";
    // portal light spilling on the flags in front of the ring
    if (lit && !joint && c !== OUT) {
      const gl = 1 - Math.hypot((x - CX) / 36, (y - BY + 6) / 11);
      if (gl > 0 && dith(x, y) < gl * (0.5 + 0.2 * pulse)) c = lit0 > 0 ? "#c07a3e" : "#8a4e28";
    }
    if (d > rim - 0.1) c = dith(x, y) < 0.5 ? "#2c4219" : "#3d5822";
    px(x, y, c);
  }

  // the swirl of fire inside the ring (painted first: the ring's inner edge overlaps it)
  if (lit) {
    for (let y = RC - RI; y <= RC + RI; y++) for (let x = CX - RI; x <= CX + RI; x++) {
      const dx = x - CX, dy = y - RC, r = Math.hypot(dx, dy) / RI;
      if (r > 1) continue;
      const a = Math.atan2(dy, dx);
      // spiral bands turning slowly inwards, roughened by looping noise (one full turn per N frames)
      const sw = a / (Math.PI * 2) + r * 0.9 - f / N;
      const n = vnoise(Math.cos(sw * Math.PI * 2) * 2.2 + 3, Math.sin(sw * Math.PI * 2) * 2.2 + r * 3, 999, 181);
      const spiral = 0.5 + 0.5 * Math.sin(sw * Math.PI * 4 + n * 3);
      // dark smouldering heart, brighter flame-bands towards the rim, ragged by the noise
      const val = 0.12 + r * 0.62 + (spiral - 0.5) * 0.24 + (n - 0.5) * 0.55 + (dith(x, y) - 0.5) * 0.12 - (r < 0.3 ? 0.2 * (1 - r / 0.3) : 0);
      const i = band(val);
      px(x, y, i < 0 ? "#240806" : FIRE[Math.min(i, FIRE.length - 1)]);
    }
  }

  // plinth: a squat carved block the ring is set into, with a worn step in front
  const pTop = BY - 26, pBot = BY - 4, pHW = 34;
  for (let y = pTop; y <= pBot + 6; y++) for (let x = CX - pHW - 6; x <= CX + pHW + 6; x++) {
    const step = y > pBot - 2;
    const hw = step ? pHW + 5 : pHW - (y - pTop < 2 ? 1 : 0);
    const dx = x - CX + (vnoise(x * 0.5, y * 0.5, 999, 171) - 0.5) * 1.2;
    if (Math.abs(dx) > hw) continue;
    if (hw - Math.abs(dx) < 1 || y === pTop || y === pBot + 6 || (step && y === pBot - 1)) { px(x, y, OUT); continue; }
    const top = step ? y < pBot + 1 : y < pTop + 4;
    let l = (top ? 0.6 : -dx / hw * 0.7 - 0.15) + (vnoise(x * 0.3, y * 0.3, 999, 172) - 0.5) * 0.5 + (dith(x, y) - 0.5) * 0.45;
    let c = stoneCol(l, 0.86 + vnoise(x * 0.1, y * 0.1, 999, 173) * 0.16);
    if (!step && y === pTop + 9 && Math.abs(dx) < hw - 3) c = "#26231f"; // carved band
    if (!step && y > pTop + 10 && y < pTop + 17 && Math.abs(dx) < hw - 4) { // a row of carved notches, lit when awake
      const k = Math.floor((dx + hw) / 6), lx = (dx + hw) % 6;
      if (lx > 1.5 && lx < 3.5 && (k + y) % 2 === 0) c = lit ? (dith(x, y) < 0.4 + 0.4 * pulse ? FIRE[6] : FIRE[4]) : "#26231f";
    }
    if (hash(x, y, 174) < 0.025) c = "#a7a37a"; // lichen
    if (vnoise(x * 0.25, y * 0.4, 999, 175) > 0.68 && (y > pBot - 6 || Math.abs(dx) > hw - 6)) c = dith(x, y) < 0.5 ? "#3d5822" : "#2c4219"; // moss at the corners
    px(x, y, c);
  }

  // the ring: carved voussoirs with dark joints, a proud keystone, moss on the lit shoulder, one deep crack
  for (let y = RC - RO - 6; y <= RC + RO; y++) for (let x = CX - RO - 2; x <= CX + RO + 2; x++) {
    const dx = x - CX, dy = y - RC, r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx); // 0 = east, -PI/2 = top
    const top = -a - Math.PI / 2; // 0 at the top
    const key = Math.abs(Math.atan2(Math.sin(top), Math.cos(top))) < Math.PI / BLOCKS; // the keystone stands out
    const ro = RO + (key ? 5 : 0) + (vnoise(a * 6 + 9, 0, 999, 141) - 0.5) * 2.2, ri = RI + (vnoise(a * 7 + 4, 1, 999, 142) - 0.5) * 1.2;
    if (r > ro || r < ri) continue;
    if (y > pTop + 1) continue; // the foot of the ring is sunk into the plinth
    if (ro - r < 1.2 || r - ri < 1.2) { px(x, y, OUT); continue; }
    // block index and local coords (blocks are centred so one sits at the top)
    const s = ((top / (Math.PI * 2)) * BLOCKS + 0.5 + BLOCKS * 4) % BLOCKS, bi = Math.floor(s), fu = s - bi;
    const t = (r - ri) / (ro - ri); // 0 inner .. 1 outer
    if (fu < 0.07 || fu > 0.95) { px(x, y, OUT); continue; } // joint between blocks
    // shading: the face is lit from the top left, the inner and outer bevels catch more or less light
    const nx = dx / r, ny = dy / r;
    const bevel = t > 0.82 ? 1 : t < 0.16 ? -1 : 0;
    let l = (-nx - ny) * 0.35 * bevel + 0.12 + (vnoise(x * 0.35, y * 0.25, 999, 143) - 0.5) * 0.6 + (dith(x, y) - 0.5) * 0.45
      + (bevel === -1 ? -0.35 : 0) + (fu < 0.14 ? 0.3 : fu > 0.88 ? -0.35 : 0);
    let c = stoneCol(l, 0.84 + hash(bi, 7, 144) * 0.2);
    const moss = vnoise(x * 0.22, y * 0.2, 999, 145);
    if ((nx < -0.2 && ny < 0.3 && moss > 0.58 && t > 0.5) || (y > pTop - 10 && moss > 0.5)) c = dith(x, y) < 0.5 + (moss - 0.5) ? (l > 0.2 ? "#5c7a30" : "#3d5822") : "#2c4219";
    else if (hash(x, y, 146) < 0.03) c = "#a7a37a";
    // a crack running through the right-hand blocks
    const ca = 0.35 + (r - ri) * 0.012 + Math.sin(r * 0.6) * 0.03;
    if (Math.abs(a + ca) < 0.022 && t > 0.1) c = OUT;
    // the rune on this block, and its glow
    const u = (fu - 0.5) * 2.3, v = (t - 0.5) * 2.4;
    if (rune(bi + (key ? 1 : 0), u, v)) c = lit ? (dith(x, y) < 0.3 + 0.45 * (0.5 + 0.5 * Math.sin(ph + bi * 0.7)) ? FIRE[7] : FIRE[5]) : "#25211c";
    else if (lit && Math.hypot(u, v) < 0.9 && dith(x, y) < (0.9 - Math.hypot(u, v)) * 0.7) c = l > 0 ? "#c88a52" : "#8e5430";
    else if (lit && t < 0.3 && dith(x, y) < (0.3 - t) * 2.2) c = l > 0 ? "#d88a46" : "#9a5228"; // the inner edge lit by the swirl
    px(x, y, c);
  }

  // sparks drifting slowly up from the swirl
  if (lit) {
    for (let k = 0; k < 9; k++) {
      const life = ((f / N) + hash(k, 1, 191)) % 1;
      const x = Math.round(CX + (hash(k, 2, 191) - 0.5) * 40 + Math.sin(life * 6 + k) * 3);
      const y = Math.round(RC + 10 - life * 64 - hash(k, 3, 191) * 8);
      px(x, y, life < 0.35 ? FIRE[7] : life < 0.7 ? FIRE[5] : FIRE[3]);
    }
  }
  g.restore();
}

export const PORTAL_FRAMES = 8;
/** Builds "portal_lit" (animated) and "portal_cold". */
export function portalTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("portal_lit")) return;
  const N = PORTAL_FRAMES;
  hiResTexture(scene, "portal_lit", PORTAL_FW * K, PORTAL_FH * K, N, 4, (g, f) => { g.scale(K, K); paintPortal(g, f, N, true); });
  hiResTexture(scene, "portal_cold", PORTAL_FW * K, PORTAL_FH * K, 1, 4, (g) => { g.scale(K, K); paintPortal(g, 0, N, false); });
  scene.anims.create({ key: "portal_spin", frames: scene.anims.generateFrameNumbers("portal_lit", { start: 0, end: N - 1 }), frameRate: 8, repeat: -1 });
}
