import Phaser from "phaser";
import { hiResTexture } from "./smooth";
import { canvasPen, IsoPaint, mat, ramp, type Mat, type V3 } from "./isoPaint";
import { BRASSR, ROPER, WOODR, wood } from "./isoProps";
import { col, Iso, rng, type Pt } from "./smoothProps";

/**
 * Act 2's desert art (shared/desert.ts), painted in code at high resolution and then pixelized in the bonfire's style
 * (keys start with "ds_", or "dsb_" for blocks that join without an outline; see PIXEL_STYLE in smooth.ts): sandstone cliffs and mesas, mud-brick houses and town walls,
 * nomad tents, bleached bones, date palms, sandstone boulders and dead trees.
 *
 * Geometry is the props' (smoothProps.ts Iso): a point (u, v, z) of a tile (u along world x, v along world y, both
 * -16..16 on the tile, z up) is drawn at x = ox + (u - v), y = oy + (u + v) / 2 - z.
 */
type Ctx = CanvasRenderingContext2D;
const IW = 64, IH = 32;

/** Sandstone: deep shade .. sunlit top. */
const STONE = [0x3a2418, 0x5a3a24, 0x7a5232, 0x9a6a40, 0xb8844e, 0xcf9e62, 0xe0b878];
/** The cliffs' sunlit top (the same as the plateau's rock top in groundPaint.ts). */
export const TOP = 0xb8864e;
/** Mud plaster of the houses. */
const MUD = 0xb98a5c, MUD_DARK = 0x7a5436;

const hsh = (a: number, b: number, s: number) => {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Cliff height (screen px) by distance from the cliff's edge: terraces that climb toward the peaks. */
export const CLIFF_STEP = [0, 24, 46, 66, 82, 96, 106];
/** Deepest step drawn as a block; further in, the ground painter paints the rock top. */
export const CLIFF_DEPTH = 6;
/** A cliff tile's height: its step plus a little noise, more of it deeper in (crags and peaks rather than a flat table). */
export function cliffHeight(d: number, x: number, y: number): number {
  if (d <= 0) return 0;
  const n = (hsh(x >> 1, y >> 1, 91) * 0.6 + hsh(x, y, 92) * 0.4) - 0.5;
  return Math.round((CLIFF_STEP[Math.min(d, CLIFF_DEPTH)] + n * 6 * Math.min(d, 4)) / 8) * 8; // in steps of 8: few textures
}
/** Mud-brick house and town-wall heights. */
export const ADOBE_H = 38, ADOBE_WALL_H = 14;

/**
 * One tile of sandstone cliff: a block `h` px tall with banded strata on the faces that look out over lower ground
 * (`faces`: 1 = the south-west face, 2 = the south-east face), cracks and erosion streaks, a sandy, pitted top with a
 * lit rim on the open edges. Strata follow absolute height, so neighbouring blocks line up.
 * Returns the key; the image's origin is (0.5, (IH / 2 + h) / (IH + h)) like the other blocks.
 */
export function cliffTexture(scene: Phaser.Scene, h: number, faces: number, v: number): string {
  const key = `dsb_cliff_${h}_${faces}_${v}`;
  hiResTexture(scene, key, IW, IH + h, 1, 3, (c) => { // scale 3: up to a hundred of these, keep them light
    const I = new Iso(c, IW / 2, h + IH / 2), R = rng(h * 31 + faces * 7 + v * 101 + 5);
    const face = (side: "L" | "R") => {
      const pts: Pt[] = side === "L"
        ? [I.p(-16, 16, 0), I.p(16, 16, 0), I.p(16, 16, h), I.p(-16, 16, h)]
        : [I.p(16, 16, 0), I.p(16, -16, 0), I.p(16, -16, h), I.p(16, 16, h)];
      c.save(); I.clip(pts);
      const k = side === "L" ? 0.86 : 0.62;
      // strata: bands every ~5-7 px of height, each a slightly different tone, wavy
      for (let z = 0; z < h + 2; z += 1) {
        const band = Math.floor((z + 3 * Math.sin(z * 0.37 + v)) / 6);
        const tone = STONE[1 + ((band * 7 + 3) % 4)];
        const lit = z > h - 3 ? 1.18 : 1; // the top course catches the sun
        c.fillStyle = col(tone, k * lit);
        const a = side === "L" ? I.p(-17, 16, z) : I.p(16, 17, z), b = side === "L" ? I.p(17, 16, z) : I.p(16, -17, z);
        c.beginPath(); c.moveTo(a[0], a[1] + 0.6); c.lineTo(b[0], b[1] + 0.6); c.lineTo(b[0], b[1] - 0.6); c.lineTo(a[0], a[1] - 0.6); c.fill();
      }
      // dark seams between some strata
      c.strokeStyle = col(STONE[0], 1, 0.55); c.lineWidth = 0.35;
      for (let z = 6; z < h; z += 6 + Math.floor(R() * 4)) {
        const a = side === "L" ? I.p(-16, 16, z) : I.p(16, 16, z), b = side === "L" ? I.p(16, 16, z + (R() - 0.5) * 2) : I.p(16, -16, z + (R() - 0.5) * 2);
        c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke();
      }
      // vertical cracks and rain-streaks
      for (let n = 0; n < 2 + Math.floor(h / 22); n++) {
        const u = -14 + R() * 28, z0 = h * (0.3 + R() * 0.7), z1 = Math.max(0, z0 - 8 - R() * 18);
        const P = (uu: number, zz: number) => (side === "L" ? I.p(uu, 16, zz) : I.p(16, -uu, zz));
        c.strokeStyle = col(STONE[0], 1, 0.7); c.lineWidth = 0.4;
        c.beginPath(); c.moveTo(...P(u, z0)); c.lineTo(...P(u + (R() - 0.5) * 3, (z0 + z1) / 2)); c.lineTo(...P(u + (R() - 0.5) * 3, z1)); c.stroke();
        c.strokeStyle = col(STONE[5], k, 0.35); c.lineWidth = 0.3;
        c.beginPath(); c.moveTo(...P(u - 0.6, z0)); c.lineTo(...P(u - 0.6, z1 + 2)); c.stroke();
      }
      // a few ledges and holes
      for (let n = 0; n < Math.floor(h / 18); n++) {
        const u = -12 + R() * 24, z = 4 + R() * (h - 8);
        const P = (uu: number, zz: number) => (side === "L" ? I.p(uu, 16, zz) : I.p(16, -uu, zz));
        const [x, y] = P(u, z);
        c.fillStyle = col(STONE[0], 1, 0.8); c.beginPath(); c.ellipse(x, y, 1.4 + R(), 0.9, 0, 0, Math.PI * 2); c.fill();
      }
      // sand drifted against the foot
      const g = c.createLinearGradient(...(side === "L" ? I.p(0, 16, 0) : I.p(16, 0, 0)), ...(side === "L" ? I.p(0, 16, 7) : I.p(16, 0, 7)));
      g.addColorStop(0, col(0xc89a62, 0.95, 0.95)); g.addColorStop(1, col(0xc89a62, 0.95, 0));
      c.fillStyle = g; c.fillRect(0, 0, IW, IH + h);
      c.restore();
    };
    if (faces & 1) face("L");
    if (faces & 2) face("R");
    // the top: weathered sandstone with sand pockets, pebbles, a tuft of dry grass now and then
    const top: Pt[] = [I.p(-16, -16, h), I.p(16, -16, h), I.p(16, 16, h), I.p(-16, 16, h)];
    // one even tone (the ground painter paints the plateau beyond in the same tone, so no tile seams), fine grit only
    I.poly(top, col(TOP));
    c.save(); I.clip(top);
    for (let n = 0; n < 40; n++) {
      const [x, y] = I.p(-15 + R() * 30, -15 + R() * 30, h);
      c.fillStyle = col(R() < 0.5 ? STONE[5] : STONE[3], 1, 0.7);
      c.fillRect(x, y, 0.8, 0.6);
    }
    if (R() < 0.35) { const [x, y] = I.p(-8 + R() * 16, -8 + R() * 16, h); c.strokeStyle = col(0x8a8040, 1, 0.9); c.lineWidth = 0.4; for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + (k - 2) * 0.9, y - 2.5 - R()); c.stroke(); } }
    c.restore();
    // lit rim on the open edges
    c.strokeStyle = col(STONE[6], 1, 0.85); c.lineWidth = 0.6;
    if (faces & 1) { c.beginPath(); c.moveTo(...I.p(-16, 16, h)); c.lineTo(...I.p(16, 16, h)); c.stroke(); }
    if (faces & 2) { c.beginPath(); c.moveTo(...I.p(16, 16, h)); c.lineTo(...I.p(16, -16, h)); c.stroke(); }
  });
  return key;
}

/**
 * One tile of a flat-roofed mud-brick house: plastered walls on the open faces (`faces` as for cliffs), roof beam
 * ends poking out under the parapet, small dark windows, a plank door (`door`: on the south-west face), and on top
 * a packed-mud roof with a raised parapet along the edges (`edges`: N=1 E=2 S=4 W=8 open sides).
 */
export function adobeTexture(scene: Phaser.Scene, faces: number, edges: number, door: boolean, v: number): string {
  const key = `dsb_adobe_${faces}_${edges}_${door ? 1 : 0}_${v}`;
  const h = ADOBE_H;
  hiResTexture(scene, key, IW, IH + h + 4, 1, 6, (c) => {
    const I = new Iso(c, IW / 2, h + 4 + IH / 2), R = rng(faces * 13 + edges * 31 + v * 97 + (door ? 7 : 0));
    const wall = (side: "L" | "R") => {
      const pts: Pt[] = side === "L"
        ? [I.p(-16, 16, 0), I.p(16, 16, 0), I.p(16, 16, h), I.p(-16, 16, h)]
        : [I.p(16, 16, 0), I.p(16, -16, 0), I.p(16, -16, h), I.p(16, 16, h)];
      const k = side === "L" ? 0.9 : 0.66;
      I.poly(pts, col(MUD, k));
      c.save(); I.clip(pts);
      const P = (u: number, z: number) => (side === "L" ? I.p(u, 16, z) : I.p(16, -u, z));
      // uneven plaster: blotches, flaked patches showing the bricks under it
      for (let n = 0; n < 18; n++) { const [x, y] = P(-16 + R() * 32, R() * h); c.fillStyle = col(R() < 0.5 ? 0xc99a6a : 0xa77a50, k, 0.6); c.beginPath(); c.ellipse(x, y, 2 + R() * 4, 1 + R() * 2.5, 0, 0, Math.PI * 2); c.fill(); }
      if (R() < 0.7) { // bare bricks where the plaster fell
        const u0 = -12 + R() * 16, z0 = 4 + R() * (h - 16);
        for (let row = 0; row < 3; row++) for (let b = 0; b < 3; b++) {
          const a = P(u0 + b * 3.4 + (row % 2) * 1.7, z0 + row * 2.4), q = P(u0 + b * 3.4 + (row % 2) * 1.7 + 3, z0 + row * 2.4 + 2);
          c.fillStyle = col(0x8a5a38, k); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(q[0], a[1] + (q[1] - a[1]) * 0); c.lineTo(q[0], q[1]); c.lineTo(a[0], q[1]); c.fill();
        }
      }
      // damp and dirt at the foot
      const g = c.createLinearGradient(...P(0, 0), ...P(0, 9));
      g.addColorStop(0, col(0x4a3020, 1, 0.55)); g.addColorStop(1, col(0x4a3020, 1, 0));
      c.fillStyle = g; c.fillRect(0, 0, IW, IH + h + 4);
      // roof beam ends (vigas) under the parapet
      for (let u = -12; u <= 12; u += 8) { const [x, y] = P(u + (R() - 0.5), h - 6); c.fillStyle = col(0x4a3220, 1); c.beginPath(); c.ellipse(x, y, 1.3, 1.1, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = col(0x7a5838, 1); c.beginPath(); c.ellipse(x - 0.3, y - 0.3, 0.6, 0.5, 0, 0, Math.PI * 2); c.fill(); }
      const isDoor = door && side === "L";
      if (isDoor) {
        const q: Pt[] = [P(-5, 0), P(5, 0), P(5, 17), P(3, 20), P(-3, 20), P(-5, 17)];
        I.poly(q, col(0x2a1a10));
        const d: Pt[] = [P(-4, 0), P(4, 0), P(4, 16.5), P(-4, 16.5)];
        I.poly(d, col(0x6a4426, k));
        c.strokeStyle = col(0x2a1a10, 1, 0.8); c.lineWidth = 0.3;
        for (let u = -2; u <= 2; u += 2) { c.beginPath(); c.moveTo(...P(u, 0)); c.lineTo(...P(u, 16.5)); c.stroke(); }
        c.fillStyle = col(0xc8a050); const [kx, ky] = P(2.6, 8); c.fillRect(kx - 0.5, ky - 0.5, 1, 1);
        // a cloth awning over the door
        const aw: Pt[] = [P(-7, 22), P(7, 22), P(7, 21), P(-7, 21)];
        I.poly(aw, col(v % 2 ? 0x8a3a2a : 0x2a5a6a, k));
      } else if (R() < 0.75) { // a small deep window with a wooden lintel
        const u = -6 + R() * 12, z = 16 + R() * 6;
        I.poly([P(u - 2.6, z), P(u + 2.6, z), P(u + 2.6, z + 5), P(u - 2.6, z + 5)], col(0x1a100a));
        I.poly([P(u - 3.6, z + 5), P(u + 3.6, z + 5), P(u + 3.6, z + 6.2), P(u - 3.6, z + 6.2)], col(0x5a3a22, k));
        if (R() < 0.4) { c.fillStyle = "rgba(255,190,90,0.35)"; const [x, y] = P(u, z + 2.5); c.fillRect(x - 1.5, y - 1.5, 3, 3); }
      }
      c.restore();
    };
    if (faces & 1) wall("L");
    if (faces & 2) wall("R");
    // roof: packed mud, a little straw, a raised parapet along the open edges
    const top: Pt[] = [I.p(-16, -16, h), I.p(16, -16, h), I.p(16, 16, h), I.p(-16, 16, h)];
    I.poly(top, col(0xa87a50));
    c.save(); I.clip(top);
    for (let n = 0; n < 30; n++) { const [x, y] = I.p(-15 + R() * 30, -15 + R() * 30, h); c.fillStyle = col(R() < 0.5 ? 0x9a6c44 : 0xb88a5c, 1, 0.8); c.fillRect(x, y, 1, 0.6); }
    if (R() < 0.25) { const [x, y] = I.p(-4 + R() * 8, -4 + R() * 8, h); c.fillStyle = col(0x7a5a8a); c.fillRect(x - 3, y - 1, 6, 2); c.fillStyle = col(0xa08040); c.fillRect(x - 2, y - 2.5, 3, 1.5); } // a rug and a pot drying on the roof
    c.restore();
    const par = (a: Pt, b: Pt, lit: number) => {
      const A = I.p(a[0], a[1], h), B = I.p(b[0], b[1], h);
      c.fillStyle = col(MUD, lit); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.lineTo(B[0], B[1] - 3.5); c.lineTo(A[0], A[1] - 3.5); c.fill();
      c.fillStyle = col(0xd8aa78); c.beginPath(); c.moveTo(A[0], A[1] - 3.5); c.lineTo(B[0], B[1] - 3.5); c.lineTo(B[0], B[1] - 4.4); c.lineTo(A[0], A[1] - 4.4); c.fill();
    };
    if (edges & 1) par([-16, -15], [16, -15], 0.7);
    if (edges & 8) par([-15, 16], [-15, -16], 0.8);
    if (edges & 2) par([15, -16], [15, 16], 0.66);
    if (edges & 4) par([16, 15], [-16, 15], 0.9);
  });
  return key;
}

/**
 * A stretch of Kel Ashar's low mud-brick wall: a thick post with arms toward each connected neighbour
 * (mask N=1 E=2 S=4 W=8), a rounded cap, chipped here and there.
 */
export function adobeWallTexture(scene: Phaser.Scene, mask: number, v: number): string {
  const key = `dsb_awall_${mask}_${v}`;
  const h = ADOBE_WALL_H;
  hiResTexture(scene, key, IW, IH + h + 4, 1, 6, (c) => {
    const I = new Iso(c, IW / 2, h + 4 + IH / 2), R = rng(mask * 17 + v * 59 + 1);
    const t = 4.5; // half thickness
    const seg = (u0: number, u1: number, v0: number, v1: number) => {
      const hh = h - (R() < 0.2 ? 3 : 0);
      I.box(u0, u1, v0, v1, 0, hh, MUD, (side, o, du, dz, len, hgt) => {
        for (let n = 0; n < 6; n++) { const uu = R() * len, zz = R() * hgt; c.fillStyle = col(R() < 0.5 ? 0xc99a6a : MUD_DARK, side === "L" ? 0.85 : 0.6, 0.6); c.beginPath(); c.ellipse(o[0] + du[0] * uu + dz[0] * zz, o[1] + du[1] * uu + dz[1] * zz, 1.5 + R() * 2, 0.8 + R(), 0, 0, Math.PI * 2); c.fill(); }
        const g = c.createLinearGradient(o[0], o[1], o[0] + dz[0] * 5, o[1] + dz[1] * 5); g.addColorStop(0, "rgba(60,36,20,0.55)"); g.addColorStop(1, "rgba(60,36,20,0)"); c.fillStyle = g; c.fillRect(0, 0, IW, IH + h + 4);
      });
      I.poly([I.p(u0, v0, hh), I.p(u1, v0, hh), I.p(u1, v1, hh), I.p(u0, v1, hh)], col(0xd2a272));
    };
    if (mask & 1) seg(-t, t, -16, -t);
    if (mask & 8) seg(-16, -t, -t, t);
    seg(-t - 0.5, t + 0.5, -t - 0.5, t + 0.5);
    if (mask & 2) seg(t, 16, -t, t);
    if (mask & 4) seg(-t, t, t, 16);
  });
  return key;
}

/** A ramp of `n` tones from deep shade to lit for a base colour (cloth dyes, leaves). */
const rampOf = (c: number, n = 6, lo = 0.32, hi = 1.3) => Array.from({ length: n }, (_, i) => {
  const k = lo + (hi - lo) * i / (n - 1), ch = (sh: number) => Math.min(255, Math.round(((c >> sh) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
});
/** pixelize cells per texture unit at a hiResTexture scale (one IsoPaint pixel = one art pixel). */
const cellsPer = (scale: number) => scale / Math.max(1, Math.round(scale * 2 / 3));

/**
 * A nomad tent: a long, low roof of striped goat-hair cloth sagging between three poles, walls hung from the eaves,
 * the front wall rolled up and the end open on a rug and cushions, guy ropes to pegs. Modelled in 3D (IsoPaint) so
 * it reads as a whole tent from the iso view, not half a prism.
 */
export function tentTexture(scene: Phaser.Scene, v: number): string {
  const key = `ds_tent_${v}`;
  hiResTexture(scene, key, 84, 70, 1, 6, (c) => {
    const I = new Iso(c, 42, 56), K = cellsPer(6);
    I.shadow(-22, -16, 22, 16, 3, 0.55);
    const q = new IsoPaint(canvasPen(c, K), Math.ceil(84 * K), Math.ceil(70 * K), 42 * K, 56 * K);
    const P = (u: number, vv: number, z: number): V3 => [u * K, vv * K, z * K];
    const CLOTH = rampOf([0x4a3428, 0x5a3424, 0x6a4a30, 0x463840][v % 4], 6, 0.3, 1.25);
    const STRIPE = rampOf([0xb89060, 0x9a3a2a, 0xd0c0a0, 0x8a6a40][v % 4], 5, 0.4, 1.15);
    const RUG = rampOf([0x8a2a1a, 0x2a4a6a, 0x7a2a3a, 0x8a5a1a][v % 4], 5, 0.35, 1.2), RUG2 = rampOf(0xc8a060, 4, 0.4, 1.1);
    const RIDGE = 21, EAVE = 8, HALF = 15, WALL = 13;
    const peak = (u: number) => RIDGE - 3.2 * Math.sin(Math.PI * u / 16) ** 2 - Math.max(0, Math.abs(u) - 16) * 1.4;
    const roofZ = (u: number, vv: number) => EAVE + (peak(u) - EAVE) * Math.pow(Math.max(0, 1 - Math.abs(vv) / HALF), 0.85);
    // goat-hair cloth: woven panels running along the tent, a pale band every few hands, darker seams
    const cloth = (bias: number): Mat => (l, _s, t, x, y) => {
      const vv = Math.abs(-HALF + 2 * HALF * t), band = (vv / 5.2 + 0.3) % 1;
      if (band < 0.1) return ramp(STRIPE, l + bias - 0.05, x, y);
      return ramp(CLOTH, l + bias + (hsh(x >> 1, y, 3 + v) - 0.5) * 0.18 - (band > 0.9 ? 0.18 : 0), x, y);
    };
    const wallM = (bias: number, hole?: (s: number, t: number) => boolean): Mat => (l, s, t, x, y) =>
      hole?.(s, t) ? undefined : ramp(CLOTH, l + bias + (hsh(x, y >> 1, 9 + v) - 0.5) * 0.16 - ((s * 9) % 1 < 0.1 ? 0.15 : 0), x, y);
    // inside first: rug spilling out of the open end, cushions, a brass pot, all in the tent's shade
    q.quad(P(-15, -10, 0.15), P(40, 0, 0), P(0, 22, 0), (l, s, t, x, y) => {
      const e = Math.min(s, 1 - s, t * 0.6, (1 - t) * 0.6);
      if (e < 0.03) return ramp(RUG2, l - 0.1, x, y);
      const d = Math.abs(((s * 8) % 2) - 1) + Math.abs(((t * 5) % 2) - 1);
      return ramp(d < 0.5 ? RUG2 : RUG, l - (s < 0.83 ? 0.35 : 0) + (e < 0.08 ? -0.15 : 0), x, y);
    });
    for (const [u, vv, r] of [[-8, -8, 3], [-2, -9, 2.6], [6, -8.5, 3]] as const) q.blob(P(u, vv, 1.6), r * K, 2.4 * K, 1.8 * K, mat(v % 2 ? STRIPE : RUG, -0.3));
    q.blob(P(10, 6, 2), 1.8 * K, 1.8 * K, 2 * K, mat(BRASSR, -0.15));
    // back wall and the far end (inner faces show through the openings, kept dark)
    q.sheet((s, t) => { const u = -19 + 38 * s; return P(u, -WALL, t * (roofZ(u, -WALL) - 0.3)); }, 60, 24, wallM(-0.32));
    q.sheet((s, t) => { const vv = -WALL + 2 * WALL * s; return P(-19, vv, t * (roofZ(-19, vv) - 0.3)); }, 40, 24, wallM(-0.1));
    // front wall: hung on the left half, rolled up under the eave on the right
    q.sheet((s, t) => { const u = -19 + 15 * s; return P(u, WALL, t * (roofZ(u, WALL) - 0.2)); }, 26, 20, wallM(0));
    q.rod(P(-4, WALL + 0.6, roofZ(0, WALL) - 1.4), P(19, WALL + 0.6, roofZ(19, WALL) - 1.4), 1.1 * K, cloth(-0.05));
    // the open end: a doorway, the flap pinned back
    q.sheet((s, t) => { const vv = -WALL + 2 * WALL * s; return P(19, vv, t * (roofZ(19, vv) - 0.3)); }, 40, 24,
      wallM(-0.05, (s, t) => Math.abs(s - 0.5) < 0.24 && t < 0.92 - Math.abs(s - 0.5) * 0.6));
    q.sheet((s, t) => P(19 + s * 4, 6 + s * 2.5 - t * 0.5, t * (roofZ(19, 6) - 1) * (1 - s * 0.35)), 12, 20, cloth(0.08));
    // the roof
    q.sheet((s, t) => { const u = -21 + 42 * s, vv = -HALF + 2 * HALF * t; return P(u, vv, roofZ(u, vv)); }, 140, 90, cloth(0));
    // poles poking through, guy ropes and pegs
    for (const u of [-16, 0, 16]) q.rod(P(u, 0, peak(u) - 1), P(u, 0, peak(u) + 2.4), 0.55 * K, wood(WOODR, -0.05, 6));
    const ropes: [V3, V3][] = [[[-16, 0, peak(-16)], [-24, 0, 0]], [[16, 0, peak(16)], [24, 0, 0]],
      [[-10, HALF, EAVE], [-11, 19.5, 0]], [[8, HALF, EAVE], [9, 19.5, 0]], [[-10, -HALF, EAVE], [-11, -19.5, 0]], [[8, -HALF, EAVE], [9, -19.5, 0]]];
    for (const [a, b] of ropes) {
      q.rod(P(...a), P(...b), 0.3 * K, mat(ROPER, 0.05));
      q.rod(P(b[0], b[1], -0.3), P(b[0], b[1], 1.4), 0.4 * K, wood(WOODR, 0.1, 3));
    }
  });
  return key;
}

/** Bleached bones in the sand: a camel's ribcage and skull, or a scatter of long bones and a horned skull. */
export function bonesTexture(scene: Phaser.Scene, v: number): string {
  const key = `ds_bones_${v}`;
  hiResTexture(scene, key, 52, 40, 1, 6, (c) => {
    const I = new Iso(c, 26, 30), R = rng(v * 37 + 3);
    I.shadow(-10, -7, 10, 7, 2, 0.35);
    const bone = "#e8dcc0", dark = "#8a7a60";
    if (v % 2 === 0) { // ribcage
      for (let k = 0; k < 6; k++) {
        const u = -9 + k * 3.4, [x, y] = I.p(u, 0, 0);
        c.strokeStyle = dark; c.lineWidth = 1.5; c.beginPath(); c.ellipse(x, y - 4, 2.2, 5.5 - Math.abs(k - 2.5) * 0.5, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
        c.strokeStyle = bone; c.lineWidth = 0.9; c.beginPath(); c.ellipse(x - 0.3, y - 4.3, 2.2, 5.5 - Math.abs(k - 2.5) * 0.5, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
      }
      c.strokeStyle = bone; c.lineWidth = 1.2; c.beginPath(); c.moveTo(...I.p(-12, 0, 0.5)); c.lineTo(...I.p(10, 0, 0.5)); c.stroke(); // spine
    } else { // long bones
      for (let k = 0; k < 3; k++) { const a = I.p(-8 + R() * 6, -6 + R() * 12, 0.3), b = I.p(2 + R() * 6, -6 + R() * 12, 0.3); c.strokeStyle = dark; c.lineWidth = 1.6; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); c.strokeStyle = bone; c.lineWidth = 1; c.beginPath(); c.moveTo(a[0], a[1] - 0.3); c.lineTo(b[0], b[1] - 0.3); c.stroke(); }
    }
    // the skull with a horn
    const [sx, sy] = I.p(10, 4, 0);
    c.fillStyle = dark; c.beginPath(); c.ellipse(sx, sy - 2, 3.4, 2.4, -0.3, 0, Math.PI * 2); c.fill();
    c.fillStyle = bone; c.beginPath(); c.ellipse(sx - 0.3, sy - 2.4, 3, 2, -0.3, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#2a2018"; c.fillRect(sx - 1.6, sy - 3, 1, 1); c.fillRect(sx + 0.4, sy - 3.2, 1, 1);
    c.strokeStyle = bone; c.lineWidth = 0.8; c.beginPath(); c.moveTo(sx - 2, sy - 3.6); c.quadraticCurveTo(sx - 5, sy - 7, sx - 2.5, sy - 9); c.stroke();
  });
  return key;
}

/**
 * Date palms (ambient tree sprites, bottom-centre origin): a ringed, leaning trunk of old frond bases, a crown of
 * long feathered fronds arching out and drooping, a skirt of dead brown fronds, and hanging date clusters. Modelled in
 * 3D (IsoPaint) so the crown has depth: near fronds over the trunk, far ones behind it. 2 frames: the fronds stir.
 */
export const PALM_W = 64, PALM_H = 96;
const LEAF = [0x0e180a, 0x1a2a10, 0x2a4016, 0x3c561c, 0x527024, 0x6c8a2e, 0x8aa640];
const DEADLEAF = [0x2a1c0e, 0x4a3218, 0x6a4a24, 0x8a6632, 0xa88444];
const BARK = [0x1e140c, 0x34241a, 0x4e3824, 0x6a4e30, 0x86663e, 0xa2804e];
const DATES = [0x2a0c06, 0x4e160a, 0x76280e, 0x9a4214, 0xc0661e, 0xd88a30];
export function palmTexture(scene: Phaser.Scene, v: number): string {
  const key = `ds_palm_${v}`;
  hiResTexture(scene, key, PALM_W, PALM_H, 2, 5, (c, f) => {
    const R = rng(v * 131 + 17), K = cellsPer(5);
    const bx = PALM_W / 2, by = PALM_H - 4;
    c.fillStyle = "rgba(10,6,2,0.4)"; c.beginPath(); c.ellipse(bx, by, 9, 3.5, 0, 0, Math.PI * 2); c.fill();
    const q = new IsoPaint(canvasPen(c, K), Math.ceil(PALM_W * K), Math.ceil(PALM_H * K), bx * K, by * K);
    const P = (u: number, vv: number, z: number): V3 => [u * K, vv * K, z * K];
    // trunk: leans and curves; the ring at each old frond base is a darker, rougher band
    // lean mostly toward or away from the viewer (u + v), little sideways (u - v), so the crown stays inside the texture
    const H = 56 + R() * 12, side = (R() - 0.5) * 5, depth = (R() - 0.5) * 14, lu = (depth + side) / 2, lv = (depth - side) / 2;
    const at = (t: number): V3 => [lu * t * t, lv * t * t, H * t];
    const trunk: Mat = (l, s, _t, x, y) => {
      const ring = (s * 26) % 1;
      return ramp(BARK, l * 1.05 - (ring < 0.22 ? 0.22 : 0) + (hsh(x, y, 5 + v) - 0.5) * 0.18 - (1 - s) * 0.08, x, y);
    };
    q.surf((s, a) => {
      const [x0, y0, z0] = at(s), r = 2.9 - s * 1.1 + ((s * 26) % 1 < 0.22 ? 0.3 : 0) + (s < 0.06 ? (0.06 - s) * 18 : 0);
      const ang = a * Math.PI * 2, cu = Math.cos(ang), sv = Math.sin(ang);
      return [P(x0 + cu * r, y0 + sv * r, z0), [cu, sv, 0.15]];
    }, Math.ceil(H * K * 1.6), 26, trunk);
    const [cu0, cv0, cz0] = at(1), C: V3 = [cu0, cv0, cz0 + 1];
    const stir = f ? 1 : 0;
    // a frond: a stiff spine that rises from the crown, arches and droops, with narrow leaflets hanging off both
    // sides in a comb (each its own strip, so the light shows between them, as on a real palm)
    const frond = (a: number, len: number, rise: number, droop: number, pal: number[], bias: number, dead = false) => {
      const du = Math.cos(a), dv = Math.sin(a), pu = -dv, pv = du;
      const wob = stir * (0.6 + R() * 0.8) * (R() < 0.5 ? -1 : 1);
      const spine = (s: number): V3 => [C[0] + du * len * s + pu * wob * s * s, C[1] + dv * len * s + pv * wob * s * s,
        C[2] + rise * s - (rise + droop) * s * s - (dead ? len * s * 0.9 : 0)];
      q.rod(P(...spine(0)), P(...spine(0.5)), 0.45 * K, mat(dead ? DEADLEAF : BARK, 0.1));
      q.rod(P(...spine(0.5)), P(...spine(0.96)), 0.35 * K, mat(pal, bias));
      const nl = Math.round(len * (dead ? 0.45 : 0.62));
      for (let i = 1; i < nl; i++) for (const side of [-1, 1]) {
        const s0 = i / nl, b = spine(s0), w = (dead ? 2.6 : 5) * Math.pow(Math.sin(Math.PI * Math.min(1, s0 * 1.05 + 0.08)), 0.6);
        const hang = dead ? 0.5 : 0.9 + 0.5 * s0, sw = 0.7, tone = bias + (hsh(i, side + 3, a * 100 + v) - 0.5) * 0.18;
        // a leaflet: out to the side and down, pointing a little toward the tip
        q.sheet((s, t) => {
          const o = (t - 0.5) * sw;
          return P(b[0] + (pu * side * s * 0.75 + du * s * 0.4) * w + du * o, b[1] + (pv * side * s * 0.75 + dv * s * 0.4) * w + dv * o, b[2] - s * w * hang);
        }, Math.ceil(w * K * 2.4) + 1, 2, (l, s, _t, x, y) => ramp(pal, l * 0.85 + tone - s * 0.12, x, y));
      }
    };
    // dead skirt under the crown, then dates, then the living fronds (depth sorts them)
    for (let k = 0; k < 6; k++) frond(k / 6 * Math.PI * 2 + R(), 9 + R() * 3, 0, 2, DEADLEAF, -0.05, true);
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * Math.PI * 2 + 0.5 + R(), d: V3 = [C[0] + Math.cos(a) * 2.6, C[1] + Math.sin(a) * 2.6, C[2] - 4];
      q.blob(P(...d), 2.1 * K, 2.1 * K, 3 * K, (l, s, t, x, y) => ramp(DATES, l + (hsh(x, y, 7) < 0.3 ? -0.2 : 0.05), x, y));
    }
    const n = 9;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + R() * 0.4, up = k % 3 === 0;
      frond(a, 16 + R() * 4, up ? 7 : 3 + R() * 3, up ? 12 : 17 + R() * 6, LEAF, -0.05 + R() * 0.12);
    }
  });
  return key;
}

/** Sandstone boulders and dead trees for the desert (in place of the valley's grey rocks and stumps). */
export function desertRockTexture(scene: Phaser.Scene, v: number): string {
  const key = `ds_rock_${v}`;
  hiResTexture(scene, key, 52, 58, 1, 6, (c) => {
    const I = new Iso(c, 26, 44), R = rng(v * 53 + 11);
    I.shadow(-8, -7, 8, 7, 2);
    const [x, y] = I.p(0, 0, 0), hgt = 9 + R() * 6;
    const pts: Pt[] = [];
    for (let k = 0; k < 10; k++) { const a = Math.PI + (k / 9) * Math.PI, rr = 8 + R() * 2.5; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * (hgt * (0.8 + R() * 0.3)) - 1]); }
    pts.push([x + 8, y + 2], [x - 8, y + 2]);
    const g = c.createLinearGradient(x - 7, y - hgt, x + 6, y);
    g.addColorStop(0, col(STONE[6])); g.addColorStop(0.45, col(STONE[4])); g.addColorStop(1, col(STONE[1]));
    I.poly(pts, g);
    // wind-carved bands
    c.strokeStyle = col(STONE[2], 1, 0.6); c.lineWidth = 0.5;
    for (let k = 1; k < 3; k++) { c.beginPath(); c.moveTo(x - 7, y - k * hgt / 3); c.quadraticCurveTo(x, y - k * hgt / 3 + 1.5, x + 7, y - k * hgt / 3 - 0.5); c.stroke(); }
    c.fillStyle = col(0xd8b07a, 1, 0.9); c.beginPath(); c.ellipse(x + 3, y + 1.5, 6, 1.6, 0, 0, Math.PI * 2); c.fill(); // sand at the foot
  });
  return key;
}

export function deadTreeTexture(scene: Phaser.Scene, v: number): string {
  const key = `ds_deadtree_${v}`;
  hiResTexture(scene, key, 52, 58, 1, 6, (c) => {
    const R = rng(v * 29 + 5);
    const x = 26, y = 46;
    c.fillStyle = "rgba(10,6,2,0.35)"; c.beginPath(); c.ellipse(x + 2, y, 7, 2.5, 0, 0, Math.PI * 2); c.fill();
    const branch = (x0: number, y0: number, a: number, len: number, w: number, d: number) => {
      const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
      c.strokeStyle = col(0x5a4a3a); c.lineWidth = w; c.lineCap = "round"; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = col(0xb8a890, 1, 0.8); c.lineWidth = w * 0.4; c.beginPath(); c.moveTo(x0 - w * 0.25, y0); c.lineTo(x1 - w * 0.25, y1); c.stroke();
      if (d > 0) { branch(x1, y1, a - 0.5 - R() * 0.3, len * 0.66, w * 0.65, d - 1); branch(x1, y1, a + 0.45 + R() * 0.3, len * 0.6, w * 0.6, d - 1); }
    };
    branch(x, y, -Math.PI / 2 + (R() - 0.5) * 0.3, 14, 3.2, 3);
  });
  return key;
}

/** Tint for things the desert shares with the valley (thorn scrub uses the bush sprite, sun-bleached). */
export const DESERT_BUSH_TINT = 0xc8b088;

/** Distance (in tiles, 4-way steps, capped at `cap`) from each cliff tile to the nearest open tile; 0 elsewhere. */
export function cliffDistance(objects: number[][], cliffId: number, w: number, y0: number, y1: number, cap = 6): Uint8Array {
  const H = y1 - y0, d = new Uint8Array(w * H).fill(255), q: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) {
    if (objects[y + y0][x] !== cliffId) { d[y * w + x] = 0; q.push(y * w + x); }
  }
  for (let i = 0; i < q.length; i++) {
    const k = q[i], x = k % w, y = (k / w) | 0, nd = d[k] + 1;
    if (nd > cap) continue;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= H) continue;
      const j = ny * w + nx;
      if (d[j] > nd) { d[j] = nd; q.push(j); }
    }
  }
  for (let i = 0; i < d.length; i++) if (d[i] === 255) d[i] = cap;
  return d;
}
export const cliffVariant = (x: number, y: number) => Math.floor(hsh(x, y, 77) * 2);

/** A sun-stone: a tall weathered sandstone menhir with a sun disc carved near its top (the Sunstone Circle, the Sun Furnace). */
export function sunStoneTexture(scene: Phaser.Scene, v: number): string {
  const key = `ds_sunstone_${v}`;
  hiResTexture(scene, key, 52, 90, 1, 6, (c) => {
    const I = new Iso(c, 26, 78), R = rng(v * 41 + 23);
    I.shadow(-7, -6, 7, 6, 2, 0.5);
    const h = 44 + R() * 10, lean = (R() - 0.5) * 4;
    const top = (u: number, vv: number, z: number): Pt => { const [x, y] = I.p(u, vv, z); return [x + lean * (z / h), y]; };
    // two visible faces, tapering toward the top
    const w0 = 6, w1 = 4;
    const L: Pt[] = [top(-w0, w0, 0), top(w0, w0, 0), top(w1, w1, h), top(-w1, w1, h - 2)];
    const Rr: Pt[] = [top(w0, w0, 0), top(w0, -w0, 0), top(w1, -w1, h - 3), top(w1, w1, h)];
    I.poly(L, col(STONE[4], 0.95));
    I.poly(Rr, col(STONE[3], 0.8));
    I.poly([top(-w1, w1, h - 2), top(w1, w1, h), top(w1, -w1, h - 3), top(-w1, -w1, h - 4)], col(STONE[5]));
    // strata and cracks
    c.strokeStyle = col(STONE[1], 1, 0.6); c.lineWidth = 0.4;
    for (let z = 6; z < h - 4; z += 5 + R() * 4) { c.beginPath(); c.moveTo(...top(-w0 + z * 0.04, w0 - z * 0.04, z)); c.lineTo(...top(w0 - z * 0.04, w0 - z * 0.04, z + (R() - 0.5) * 2)); c.lineTo(...top(w0 - z * 0.04, -w0 + z * 0.04, z + (R() - 0.5) * 2)); c.stroke(); }
    // the carved sun: a ring with rays, faintly glowing
    const [sx, sy] = top(0, 5, h - 12);
    c.strokeStyle = col(0x3a2418, 1, 0.9); c.lineWidth = 0.7; c.beginPath(); c.arc(sx, sy, 2.6, 0, Math.PI * 2); c.stroke();
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; c.beginPath(); c.moveTo(sx + Math.cos(a) * 3.4, sy + Math.sin(a) * 3.4); c.lineTo(sx + Math.cos(a) * 4.8, sy + Math.sin(a) * 4.8); c.stroke(); }
    c.fillStyle = "rgba(255,200,110,0.55)"; c.beginPath(); c.arc(sx, sy, 1.6, 0, Math.PI * 2); c.fill();
    // sand heaped at the foot
    c.fillStyle = col(0xd8b07a, 1, 0.95); c.beginPath(); c.ellipse(...I.p(2, 2, 0), 8, 2.6, 0, 0, Math.PI * 2); c.fill();
  });
  return key;
}
