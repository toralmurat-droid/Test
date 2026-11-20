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
/** Mud-brick heights: a house's ground storey, the upper storey raised on its inner tiles (by house variant; 0 = none, a palm-frond shade instead), the town wall. */
export const ADOBE_H = 38, ADOBE_UP = [20, 26, 0, 22], ADOBE_WALL_H = 14;
/** House texture headroom above the ground plane, and the margin below it (corner piers and spouts stand a little proud of the tile). */
export const ADOBE_PAD = 4, ADOBE_SIDE = 4;
/** Headroom a house tile's texture needs above the ground plane (sized per tile: most tiles have no upper storey). */
export const adobeHead = (look: AdobeLook) => ADOBE_H + (look.inner ? ADOBE_UP[look.hv] : 0) + 12;
/** Plaster tints by house variant: ochre, rose, pale lime-wash, dusty brown. */
const PLASTER = [0xb98a5c, 0xb88068, 0xc9a882, 0xa88058];

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

/** What one house tile shows besides its own walls: the house's look and its raised upper storey, if any. */
export interface AdobeLook {
  /** House variant 0..3 (same for every tile of a house): plaster tint and upper-storey height. */
  hv: number;
  /** The tile is inside the house (all eight neighbours are house): it carries the upper storey or a shade on the roof. */
  inner: boolean;
  /** Upper-storey faces and parapet edges, as `faces` / `edges` but against the other inner tiles. */
  uf: number; ue: number;
}

/**
 * One tile of a Kel Ashar mud-brick house (Murat 2026-11-13: "rework"): plastered walls on the open faces (`faces` as
 * for cliffs) with a plinth and a moulded band in relief, beam ends, drain spouts with their stains, deep windows or a
 * wooden lattice bay, an arched door in a painted lime frame (`door`: on the south-west face) and buttress piers on
 * the corners. On top, a packed-mud roof terrace behind a toothed parapet with horned corners (`edges`: N=1 E=2 S=4
 * W=8 open sides) and the clutter of roof life, or, on a house's inner tiles, a raised upper storey.
 */
export function adobeTexture(scene: Phaser.Scene, faces: number, edges: number, door: boolean, v: number, look: AdobeLook): string {
  const { hv, inner, uf, ue } = look, uh = inner ? ADOBE_UP[hv] : 0, head = adobeHead(look);
  v &= 1; // two looks per tile kind are plenty: every variant is a texture held in memory
  const key = `dsb_adobe_${faces}_${edges}_${door ? 1 : 0}_${v}_${hv}_${inner ? 1 : 0}_${uf}_${ue}`;
  const h = ADOBE_H, top = h + uh, tint = PLASTER[hv], roofC = col(tint, 0.8);
  // scale 3, not 6: about a hundred of these, all painted at load (cliffs use 3 for the same reason)
  hiResTexture(scene, key, IW + 2 * ADOBE_SIDE, IH + head + ADOBE_PAD, 1, 3, (c) => {
    const I = new Iso(c, IW / 2 + ADOBE_SIDE, head + IH / 2), R = rng(faces * 13 + edges * 31 + v * 97 + (door ? 7 : 0) + hv * 211 + uf * 5 + ue * 3);
    /** A plastered wall on one open face between heights z0 and z1. */
    const wall = (side: "L" | "R", z0: number, z1: number, ground: boolean) => {
      const P = (u: number, z: number) => (side === "L" ? I.p(u, 16, z) : I.p(16, -u, z));
      const k = side === "L" ? 0.9 : 0.64, H = z1 - z0;
      const pts: Pt[] = [P(-16, z0), P(16, z0), P(16, z1), P(-16, z1)];
      I.poly(pts, col(tint, k));
      c.save(); I.clip(pts);
      // hand-smoothed plaster: blotches, vertical trowel streaks, a patch fallen off to the bricks beneath
      for (let n = 0; n < 16; n++) { const [x, y] = P(-16 + R() * 32, z0 + R() * H); c.fillStyle = col(tint, k * (R() < 0.5 ? 1.1 : 0.88), 0.55); c.beginPath(); c.ellipse(x, y, 2 + R() * 4, 1 + R() * 2.2, 0, 0, Math.PI * 2); c.fill(); }
      c.lineWidth = 0.5;
      for (let n = 0; n < 5; n++) { const u = -15 + R() * 30, a = z0 + R() * H * 0.5; c.strokeStyle = col(tint, k * 1.08, 0.35); c.beginPath(); c.moveTo(...P(u, a)); c.lineTo(...P(u + 0.5, a + 6 + R() * 8)); c.stroke(); }
      if (R() < 0.55) {
        const u0 = -12 + R() * 18, b0 = z0 + 6 + R() * Math.max(1, H - 18);
        I.poly([P(u0 - 0.6, b0 - 0.6), P(u0 + 10.4, b0 - 0.6), P(u0 + 8.6, b0 + 7.4), P(u0 + 0.6, b0 + 6.6)], col(0x4a2e1c, k));
        for (let row = 0; row < 3; row++) for (let b = 0; b < 3 - (row === 2 ? 1 : 0); b++) {
          const u = u0 + b * 3.4 + (row % 2) * 1.7, z = b0 + row * 2.4;
          I.poly([P(u, z), P(u + 3, z), P(u + 3, z + 2), P(u, z + 2)], col(0x8a5a38, k * (0.85 + R() * 0.3)));
        }
      }
      // fine cracks running down from the top
      c.strokeStyle = col(0x3a2416, 1, 0.55); c.lineWidth = 0.35;
      for (let n = 0; n < 1 + (R() < 0.5 ? 1 : 0); n++) {
        let u = -12 + R() * 24, z = z1 - 1; c.beginPath(); c.moveTo(...P(u, z));
        for (let s = 0; s < 4; s++) { u += (R() - 0.5) * 3; z -= 2 + R() * 3; c.lineTo(...P(u, z)); }
        c.stroke();
      }
      if (ground) {
        // the plinth, a thicker course of mud at the foot: darker, with a lit lip on top and damp below
        I.poly([P(-16, 0), P(16, 0), P(16, 4.5), P(-16, 4.5)], col(MUD_DARK, k * 1.08));
        I.poly([P(-16, 4.5), P(16, 4.5), P(16, 5.3), P(-16, 5.3)], col(tint, k * 1.25));
        const g = c.createLinearGradient(...P(0, 0), ...P(0, 4));
        g.addColorStop(0, col(0x3a2416, 1, 0.5)); g.addColorStop(1, col(0x3a2416, 1, 0));
        c.fillStyle = g; c.fillRect(0, 0, IW + 2 * ADOBE_SIDE, IH + head + ADOBE_PAD);
      }
      // a moulded band under the beam ends: lit bead on top, shadow under it
      const sb = z1 - 9.5;
      I.poly([P(-16, sb), P(16, sb), P(16, sb + 1.4), P(-16, sb + 1.4)], col(tint, k * 1.22));
      I.poly([P(-16, sb - 0.8), P(16, sb - 0.8), P(16, sb), P(-16, sb)], col(0x3a2416, 1, 0.45));
      // roof beam ends (vigas) with the stain they weep
      for (let u = -12; u <= 12; u += 8) {
        const [x, y] = P(u + (R() - 0.5), z1 - 5.5);
        c.fillStyle = col(0x3a2416, 1, 0.3); c.fillRect(x - 0.6, y, 1.2, 4 + R() * 3);
        c.fillStyle = col(0x3e2a1a); c.beginPath(); c.ellipse(x, y, 1.5, 1.25, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = col(0x86603c); c.beginPath(); c.ellipse(x - 0.35, y - 0.35, 0.75, 0.6, 0, 0, Math.PI * 2); c.fill();
      }
      const isDoor = ground && door && side === "L";
      if (isDoor) {
        // an arched doorway in a lime-washed frame painted with a zigzag, a studded plank door, a stone step
        const arch = (r: number, spring: number): Pt[] => {
          const q: Pt[] = [P(-r, 0)];
          for (let i = 0; i <= 10; i++) { const a = Math.PI - (i / 10) * Math.PI; q.push(P(Math.cos(a) * r, spring + Math.sin(a) * r * 0.9)); }
          q.push(P(r, 0)); return q;
        };
        I.poly(arch(7, 16), col(0xe6d8bc, k));
        c.fillStyle = col(hv % 2 ? 0x2a3a72 : 0x8a3424, k);
        for (let i = 0; i < 9; i++) { // painted teeth round the arch
          const a = Math.PI - ((i + 0.5) / 9) * Math.PI, [x, y] = P(Math.cos(a) * 6.1, 16 + Math.sin(a) * 6.1 * 0.9);
          c.beginPath(); c.moveTo(x - 0.7, y + 0.5); c.lineTo(x + 0.7, y + 0.5); c.lineTo(x, y - 0.7); c.fill();
        }
        for (const s of [-1, 1]) for (let z = 2; z < 15; z += 3) { const [x, y] = P(s * 6.1, z); c.fillRect(x - 0.5, y - 0.5, 1, 1.2); }
        I.poly(arch(5, 16), col(0x1a100a));
        I.poly(arch(4.3, 16), col([0x2a6a6a, 0x6a4426, 0x2a4a7a, 0x7a3a2a][(hv + v) % 4], k));
        c.strokeStyle = col(0x2a1a10, 1, 0.8); c.lineWidth = 0.3;
        for (let u = -2.2; u <= 2.2; u += 2.2) { c.beginPath(); c.moveTo(...P(u, 0)); c.lineTo(...P(u, 19.5 - Math.abs(u) * 0.6)); c.stroke(); }
        c.fillStyle = col(0xd0a858);
        for (const z of [3, 9, 14]) for (const u of [-3.2, -1.1, 1.1, 3.2]) { const [x, y] = P(u, z); c.fillRect(x - 0.35, y - 0.35, 0.7, 0.7); }
        const [kx, ky] = P(2.2, 8); c.fillStyle = col(0x2a1a10); c.beginPath(); c.arc(kx, ky, 0.8, 0, Math.PI * 2); c.fill();
        c.restore(); // a striped cloth awning on two sticks, out over the step
        const aw = (a: number, b: number, z: number) => I.p(a, 16 + b, z);
        const stripes = [0xc8a050, hv % 2 ? 0x2a3a72 : 0x8a3424];
        for (let i = 0; i < 6; i++) { const a = -8 + i * (16 / 6), b = a + 16 / 6; I.poly([aw(a, 0, 27), aw(b, 0, 27), aw(b, 4.5, 24), aw(a, 4.5, 24)], col(stripes[i % 2], 0.95)); }
        c.strokeStyle = col(0x4a3020); c.lineWidth = 0.5;
        for (const a of [-7.5, 7.5]) { c.beginPath(); c.moveTo(...aw(a, 4.5, 24)); c.lineTo(...aw(a, 5.5, 19)); c.stroke(); }
        c.save(); I.clip(pts);
      } else {
        const kind = R(), u = (side === "L" ? -1 : 1) * (2 + R() * 7), z = z0 + H * 0.42 + R() * 3;
        if (kind < 0.45) { // a small deep window with a wooden lintel, now and then lamplit
          I.poly([P(u - 2.4, z), P(u + 2.4, z), P(u + 2.4, z + 5), P(u - 2.4, z + 5)], col(0x140c08));
          I.poly([P(u - 2.4, z + 4), P(u + 2.4, z + 4), P(u + 2.4, z + 5), P(u - 2.4, z + 5)], col(0x3a2416, 1, 0.8));
          I.poly([P(u - 3.6, z + 5), P(u + 3.6, z + 5), P(u + 3.6, z + 6.3), P(u - 3.6, z + 6.3)], col(0x5a3a22, k));
          I.poly([P(u - 3, z - 0.8), P(u + 3, z - 0.8), P(u + 3, z), P(u - 3, z)], col(tint, k * 1.2));
          if (R() < 0.35) { c.fillStyle = "rgba(255,190,90,0.4)"; const [x, y] = P(u, z + 2); c.fillRect(x - 1.4, y - 1.4, 2.8, 2.8); }
        } else if (kind < 0.7) { // a row of triangular vents high up
          c.fillStyle = col(0x140c08);
          for (let i = -1; i <= 1; i++) { const [x, y] = P(u + i * 3, z1 - 14); c.beginPath(); c.moveTo(x - 0.9, y + 0.8); c.lineTo(x + 0.9, y + 0.8); c.lineTo(x, y - 1); c.fill(); }
        }
        c.restore();
        if (kind >= 0.7) { // a wooden lattice bay standing out of the wall
          const wz = z - 1;
          if (side === "L") lattice(I, c, [u - 3.4, u + 3.4], [16, 18], [wz, wz + 9], "L");
          else lattice(I, c, [16, 18], [-u - 3.4, -u + 3.4], [wz, wz + 9], "R");
        }
        c.save(); I.clip(pts);
      }
      c.restore();
      // a drain spout (canale) poking out under the parapet, its stain running down the wall
      if (R() < 0.45) {
        const u = (R() < 0.5 ? -1 : 1) * (5 + R() * 7), z = z1 - 2.5;
        c.save(); I.clip(pts);
        const g = c.createLinearGradient(...P(u, z), ...P(u, z - 16));
        g.addColorStop(0, col(0x3a2416, 1, 0.55)); g.addColorStop(1, col(0x3a2416, 1, 0));
        c.fillStyle = g; I.poly([P(u - 1.2, z), P(u + 1.2, z), P(u + 1.6, z - 16), P(u - 1.6, z - 16)], g);
        c.restore();
        if (side === "L") I.box(u - 0.9, u + 0.9, 16, 19.5, z - 0.6, z + 0.8, 0x6a4426);
        else I.box(16, 19.5, -u - 0.9, -u + 0.9, z - 0.6, z + 0.8, 0x6a4426);
      }
    };
    /** Buttress pier on a corner, stepped in once: stands a little proud of the walls and of the parapet. */
    const pier = (u0: number, u1: number, v0: number, v1: number, z1: number) => {
      I.box(u0, u1, v0, v1, 0, z1 * 0.55, tint);
      I.box(u0 + 0.6, u1 - 0.6, v0 + 0.6, v1 - 0.6, z1 * 0.55, z1, tint);
      I.box(u0 + 1.2, u1 - 1.2, v0 + 1.2, v1 - 1.2, z1, z1 + 2.2, tint);
    };
    /** A rib standing out of the wall at a tile's back end, rising through the parapet into a rounded pinnacle, palm-wood pegs (toron) sticking out of it. */
    const rib = (side: "L" | "R", z1: number) => {
      const [u0, u1, v0, v1] = side === "L" ? [-16, -13.2, 16, 17.6] : [16, 17.6, -16, -13.2];
      I.box(u0, u1, v0, v1, 0, z1, tint);
      I.box(u0 + 0.5, u1 - 0.5, v0 + 0.4, v1 - 0.4, z1, z1 + 2.6, tint);
      for (let z = 9; z < z1 - 4; z += 10) {
        const [x, y] = side === "L" ? I.p((u0 + u1) / 2, v1 + 1.2, z) : I.p(u1 + 1.2, (v0 + v1) / 2, z);
        c.fillStyle = col(0x4a3020); c.fillRect(x - 0.5, y - 0.4, 1, 0.9);
      }
    };
    if (faces & 1) wall("L", 0, h, true);
    if (faces & 2) wall("R", 0, h, true);
    if (door && (faces & 1)) I.box(-6, 6, 16, 18.6, 0, 1.3, 0x9a8a70);
    if ((faces & 1) && !(edges & 8)) rib("L", h + 3);
    if ((faces & 2) && !(edges & 1)) rib("R", h + 3);
    if (faces === 3) pier(12.5, 18.5, 12.5, 18.5, h + 3);
    if ((faces & 1) && (edges & 8)) pier(-16, -12, 16, 18.5, h + 3);
    if ((faces & 2) && (edges & 1)) pier(16, 18.5, -16, -12, h + 3);

    // the roof: either a terrace on the ground storey or the upper storey's walls and its own roof
    if (uh > 0) {
      if (uf & 1) wall("L", h, top, false);
      if (uf & 2) wall("R", h, top, false);
      if (uf === 3) pier(13, 17.5, 13, 17.5, top + 3);
    }
    const roof: Pt[] = [I.p(-16, -16, top), I.p(16, -16, top), I.p(16, 16, top), I.p(-16, 16, top)];
    I.poly(roof, roofC);
    c.save(); I.clip(roof);
    for (let n = 0; n < 3; n++) { // patches of fresher mud where the roof was mended
      const u = -12 + R() * 24, vv = -12 + R() * 24, w = 4 + R() * 6, d = 3 + R() * 5;
      I.poly([I.p(u, vv, top), I.p(u + w, vv, top), I.p(u + w, vv + d, top), I.p(u, vv + d, top)], col(tint, R() < 0.5 ? 0.78 : 0.95, 0.8));
    }
    for (let n = 0; n < 36; n++) { const [x, y] = I.p(-15 + R() * 30, -15 + R() * 30, top); c.fillStyle = col(tint, R() < 0.5 ? 0.7 : 0.98, 0.8); c.fillRect(x, y, 1.1, 0.6); }
    c.restore();
    // parapet and roof clutter, painted back to front
    const ed = uh > 0 ? ue : edges, items: [number, () => void][] = [];
    const T = 1.8, PH = 3; // parapet thickness and height
    const runs: [number, number, number, number][] = [];
    if (ed & 1) runs.push([-16, 16, -16, -16 + T]);
    if (ed & 8) runs.push([-16, -16 + T, -16, 16]);
    if (ed & 2) runs.push([16 - T, 16, -16, 16]);
    if (ed & 4) runs.push([-16, 16, 16 - T, 16]);
    for (const [u0, u1, v0, v1] of runs) {
      const alongU = u1 - u0 > v1 - v0;
      for (let s = 0; s < 32; s += 4) { // a run of short boxes, a tooth on every other one
        const a = -16 + s, b = a + 4, tooth = (s / 4) % 2 === 1;
        const bu0 = alongU ? a : u0, bu1 = alongU ? b : u1, bv0 = alongU ? v0 : a, bv1 = alongU ? v1 : b;
        items.push([(bu0 + bu1 + bv0 + bv1) / 2, () => {
          I.box(bu0, bu1, bv0, bv1, top, top + PH, tint);
          if (tooth) I.box(bu0 + (alongU ? 0.9 : 0.2), bu1 - (alongU ? 0.9 : 0.2), bv0 + (alongU ? 0.2 : 0.9), bv1 - (alongU ? 0.2 : 0.9), top + PH, top + PH + 2, tint);
        }]);
      }
    }
    // horned corners where two open edges meet (a little pinnacle, the Saharan way)
    const horn = (u: number, vv: number) => items.push([u + vv + 3, () => { // keyed on its far corner, after the parapet boxes it stands in
      I.box(u - 1.6, u + 1.6, vv - 1.6, vv + 1.6, top, top + PH + 3, tint);
      I.box(u - 0.8, u + 0.8, vv - 0.8, vv + 0.8, top + PH + 3, top + PH + 5.5, tint);
    }]);
    if ((ed & 1) && (ed & 8)) horn(-15, -15);
    if ((ed & 1) && (ed & 2)) horn(15, -15);
    if ((ed & 4) && (ed & 8)) horn(-15, 15);
    if ((ed & 4) && (ed & 2) && !(faces === 3 && uh === 0) && !(uf === 3)) horn(15, 15);
    // roof life on a terrace (one thing per tile at most), a shade of palm fronds over a house's heart
    if (uh === 0) {
      const pick = R(), cu = -6 + R() * 12, cv = -6 + R() * 12;
      if (inner) items.push([0, () => frondShade(I, c, top, R, ue)]);
      else if (pick < 0.24) items.push([cu + cv, () => { jar(I, c, cu, cv, top, 0x9a4a2a); if (R() < 0.6) jar(I, c, cu + 3, cv + 2.5, top, 0x8a5a3a, 0.8); }]);
      else if (pick < 0.4) items.push([-30, () => rug(I, c, cu, cv, top, hv)]);
      else if (pick < 0.56) items.push([cu + cv, () => basket(I, c, cu, cv, top)]);
      else if (pick < 0.68) items.push([cu + cv, () => hatch(I, c, cu, cv, top)]);
      else if (pick < 0.8) items.push([cu + cv, () => firewood(I, c, cu, cv, top, R)]);
    } else if (R() < 0.3) { const cu = -5 + R() * 10, cv = -5 + R() * 10; items.push([cu + cv, () => jar(I, c, cu, cv, top, 0x9a4a2a, 0.9)]); }
    items.sort((a, b) => a[0] - b[0]);
    for (const [, draw] of items) draw();
  });
  return key;
}

/** A wooden lattice window bay (mashrabiya) standing out of a wall: a box with a fine grid and a little roof. */
function lattice(I: Iso, c: Ctx, [u0, u1]: number[], [v0, v1]: number[], [z0, z1]: number[], side: "L" | "R") {
  I.box(u0, u1, v0, v1, z0 - 0.8, z0, 0x5a3a22);
  I.box(u0 + 0.2, u1 - 0.2, v0, v1 - 0.2, z0, z1, 0x7a5232);
  const P = (s: number, z: number) => (side === "L" ? I.p(u0 + 0.2 + s * (u1 - u0 - 0.4), v1 - 0.2, z) : I.p(u1 - 0.2, v0 + s * (v1 - v0 - 0.2), z));
  c.strokeStyle = col(0x2a1a10, 1, 0.9); c.lineWidth = 0.35;
  for (let s = 0.2; s < 1; s += 0.2) { c.beginPath(); c.moveTo(...P(s, z0 + 0.6)); c.lineTo(...P(s, z1 - 0.6)); c.stroke(); }
  for (let z = z0 + 1.6; z < z1 - 0.5; z += 1.6) { c.beginPath(); c.moveTo(...P(0.05, z)); c.lineTo(...P(0.95, z)); c.stroke(); }
  I.box(u0 - 0.4, u1 + 0.4, v0, v1 + 0.5, z1, z1 + 1, 0x4a3020);
}
/** A clay water jar standing on a roof. */
function jar(I: Iso, c: Ctx, u: number, v: number, z: number, tone: number, s = 1) {
  const [x, y] = I.p(u, v, z);
  c.fillStyle = "rgba(20,12,8,0.35)"; c.beginPath(); c.ellipse(x + 1, y + 0.4, 2.6 * s, 1.1 * s, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = col(tone, 0.8); c.beginPath(); c.ellipse(x, y - 2.6 * s, 2.3 * s, 2.7 * s, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = col(tone, 1.15); c.beginPath(); c.ellipse(x - 0.8 * s, y - 3.2 * s, 0.9 * s, 1.4 * s, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = col(tone, 0.7); c.fillRect(x - 1 * s, y - 6.2 * s, 2 * s, 1.2 * s);
  c.fillStyle = col(0x1a100a); c.beginPath(); c.ellipse(x, y - 6.2 * s, 0.9 * s, 0.4 * s, 0, 0, Math.PI * 2); c.fill();
}
/** A striped rug laid out on the roof to air. */
function rug(I: Iso, c: Ctx, u: number, v: number, z: number, hv: number) {
  const base = [0x8a2a24, 0x2a3a6a, 0x7a4a2a, 0x5a2a4a][hv], w = 9, d = 6;
  I.poly([I.p(u - w / 2, v - d / 2, z), I.p(u + w / 2, v - d / 2, z), I.p(u + w / 2, v + d / 2, z), I.p(u - w / 2, v + d / 2, z)], col(base));
  for (let i = 1; i < 5; i++) { const a = u - w / 2 + (i * w) / 5; I.poly([I.p(a - 0.4, v - d / 2, z), I.p(a + 0.4, v - d / 2, z), I.p(a + 0.4, v + d / 2, z), I.p(a - 0.4, v + d / 2, z)], col(i % 2 ? 0xd0a050 : 0xe0d0b0, 0.9)); }
}
/** A wide basket of dates. */
function basket(I: Iso, c: Ctx, u: number, v: number, z: number) {
  const [x, y] = I.p(u, v, z);
  c.fillStyle = col(0x8a6a3a, 0.75); c.beginPath(); c.ellipse(x, y - 1, 3.4, 1.8, 0, 0, Math.PI); c.lineTo(x - 3.4, y - 2.2); c.fill();
  c.fillStyle = col(0x6a2a1a); c.beginPath(); c.ellipse(x, y - 2.2, 3.2, 1.5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = col(0xa8542a); for (let i = 0; i < 6; i++) c.fillRect(x - 2.4 + i * 0.9, y - 2.8 + (i % 2) * 0.8, 0.7, 0.6);
  c.strokeStyle = col(0xb08a4a); c.lineWidth = 0.4; c.beginPath(); c.ellipse(x, y - 2.2, 3.4, 1.6, 0, 0, Math.PI * 2); c.stroke();
}
/** A roof hatch with a ladder's ends poking out of it. */
function hatch(I: Iso, c: Ctx, u: number, v: number, z: number) {
  I.poly([I.p(u - 3, v - 3, z), I.p(u + 3, v - 3, z), I.p(u + 3, v + 3, z), I.p(u - 3, v + 3, z)], col(0x140c08));
  c.strokeStyle = col(0x8a6440); c.lineWidth = 0.6;
  for (const s of [-1.4, 1.4]) { c.beginPath(); c.moveTo(...I.p(u + s, v - 1, z - 3)); c.lineTo(...I.p(u + s, v - 1.6, z + 5)); c.stroke(); }
  for (let k = 0; k < 2; k++) { c.beginPath(); c.moveTo(...I.p(u - 1.4, v - 1.3, z + 1 + k * 2.5)); c.lineTo(...I.p(u + 1.4, v - 1.3, z + 1 + k * 2.5)); c.stroke(); }
}
/** A stack of firewood and palm ribs. */
function firewood(I: Iso, c: Ctx, u: number, v: number, z: number, R: () => number) {
  for (let k = 0; k < 5; k++) {
    const a = I.p(u - 3, v + (k % 3) - 1, z + Math.floor(k / 3) * 1.1 + 0.5), b = I.p(u + 3, v + (k % 3) - 1 + (R() - 0.5), z + Math.floor(k / 3) * 1.1 + 0.5);
    c.strokeStyle = col(0x4a3020); c.lineWidth = 1.1; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke();
    c.strokeStyle = col(0x8a6440); c.lineWidth = 0.4; c.beginPath(); c.moveTo(a[0], a[1] - 0.3); c.lineTo(b[0], b[1] - 0.3); c.stroke();
  }
}
/** A shade of palm fronds over the middle of a roof, one mat across the inner tiles, poles at its corners (`open`: its open sides, N=1 E=2 S=4 W=8). */
function frondShade(I: Iso, c: Ctx, z: number, R: () => number, open: number) {
  const ph = 11, u0 = open & 8 ? -13 : -16, u1 = open & 2 ? 13 : 16, v0 = open & 1 ? -13 : -16, v1 = open & 4 ? 13 : 16;
  const pole = (u: number, v: number) => I.box(u - 0.8, u + 0.8, v - 0.8, v + 0.8, z, z + ph, 0x5a3a20, undefined, false);
  const corners: [number, number, boolean][] = [[u0 + 1, v0 + 1, !!(open & 9)], [u1 - 1, v0 + 1, !!(open & 3)], [u0 + 1, v1 - 1, !!(open & 12)], [u1 - 1, v1 - 1, !!(open & 6)]];
  const want = ([, , ok]: [number, number, boolean], i: number) => ok && ((i === 0 && (open & 9) === 9) || (i === 1 && (open & 3) === 3) || (i === 2 && (open & 12) === 12) || (i === 3 && (open & 6) === 6));
  I.poly([I.p(u0 + 2, v0 + 3, z), I.p(u1 + 2, v0 + 3, z), I.p(u1 + 2, v1 + 3, z), I.p(u0 + 2, v1 + 3, z)], "rgba(20,12,8,0.28)");
  corners.forEach((k, i) => { if (i < 3 && want(k, i)) pole(k[0], k[1]); });
  const mat: Pt[] = [I.p(u0, v0, z + ph), I.p(u1, v0, z + ph), I.p(u1, v1, z + ph), I.p(u0, v1, z + ph)];
  I.poly(mat, col(0x7a6a3a));
  c.save(); I.clip(mat);
  for (let k = -16; k < 16; k += 1.4) {
    c.strokeStyle = col(R() < 0.5 ? 0x9a8a4a : 0x5a5a2a); c.lineWidth = 0.6;
    c.beginPath(); c.moveTo(...I.p(k, v0, z + ph)); c.lineTo(...I.p(k + (R() - 0.5), v1, z + ph)); c.stroke();
  }
  c.restore();
  c.strokeStyle = col(0xb0a060, 1, 0.7); c.lineWidth = 0.4; // the lit, ragged front edges
  if (open & 4) { c.beginPath(); c.moveTo(...I.p(u0, v1, z + ph)); c.lineTo(...I.p(u1, v1, z + ph)); c.stroke(); }
  if (open & 2) { c.beginPath(); c.moveTo(...I.p(u1, v0, z + ph)); c.lineTo(...I.p(u1, v1, z + ph)); c.stroke(); }
  if (want(corners[3], 3)) pole(corners[3][0], corners[3][1]);
}

/**
 * A stretch of Kel Ashar's mud-brick town wall (Murat 2026-11-13: "more relief, partly crumbled"): a post with arms
 * toward each connected neighbour (mask N=1 E=2 S=4 W=8), built of brick courses half under plaster, a toothed
 * crest and a stepped pier on the post. `broken` walls have lost their top in a jagged, brick-stepped line, with the
 * fallen bricks heaped at their foot.
 */
export function adobeWallTexture(scene: Phaser.Scene, mask: number, v: number, broken: boolean): string {
  const key = `dsb_awall_${mask}_${v}_${broken ? 1 : 0}`;
  const h = ADOBE_WALL_H;
  hiResTexture(scene, key, IW + 2 * ADOBE_SIDE, IH + h + 10 + ADOBE_PAD, 1, 6, (c) => {
    const I = new Iso(c, IW / 2 + ADOBE_SIDE, h + 10 + IH / 2), R = rng(mask * 17 + v * 59 + (broken ? 991 : 1));
    const t = 4.5, cap = 2.2, step = 2;
    // crest height along a run, from absolute position s (-16..16) and run id: teeth, or a jagged broken line
    const seedA = R() * 10, depth = 0.45 + R() * 0.25;
    const crest = (s: number, run: number) => {
      if (!broken) return h + ((s + 16) % 8 < 2 ? cap : 0); // a merlon every quarter tile
      const n = Math.sin(s * 0.35 + seedA + run) * 0.5 + Math.sin(s * 0.9 + run * 3) * 0.25 + 0.5;
      return Math.max(4, Math.round((h * (1 - depth * n)) / 2.4) * 2.4);
    };
    const bricks = (P: (u: number, z: number) => Pt, a: number, b: number, z1: number, k: number) => {
      // courses of brick, plaster clinging in patches (more of it low down)
      for (let z = 0, row = 0; z < z1; z += 2.4, row++) for (let u = a - ((row % 2) ? 1.7 : 0) - ((a + 16) % 3.4); u < b; u += 3.4) {
        const u0 = Math.max(a, u), u1 = Math.min(b, u + 3.4), zz = Math.min(z1, z + 2.4);
        if (u1 <= u0) continue;
        const plaster = hsh(Math.floor(u * 2), row, v * 7 + mask) < 0.62 - z * 0.025;
        I.poly([P(u0, z), P(u1, z), P(u1, zz), P(u0, zz)], col(plaster ? 0xc2925e : 0x9a6a42, k * (0.88 + hsh(Math.floor(u), row, 3) * 0.24)));
        I.poly([P(u0, zz - 0.45), P(u1, zz - 0.45), P(u1, zz), P(u0, zz)], col(0x5a3a24, k, plaster ? 0.35 : 1));
        if (!plaster) I.poly([P(u0, z), P(u0 + 0.45, z), P(u0 + 0.45, zz), P(u0, zz)], col(0x5a3a24, k));
      }
      const g = c.createLinearGradient(...P(0, 0), ...P(0, 4));
      g.addColorStop(0, "rgba(60,36,20,0.55)"); g.addColorStop(1, "rgba(60,36,20,0)");
      c.fillStyle = g; c.fillRect(0, 0, IW + 2 * ADOBE_SIDE, IH + h + 10 + ADOBE_PAD);
    };
    /** A slice of wall [u0,u1]x[v0,v1] up to z1, its two visible faces bricked, its top lit. */
    const slice = (u0: number, u1: number, v0: number, v1: number, z1: number) => {
      const L: Pt[] = [I.p(u0, v1, 0), I.p(u1, v1, 0), I.p(u1, v1, z1), I.p(u0, v1, z1)];
      const Rr: Pt[] = [I.p(u1, v1, 0), I.p(u1, v0, 0), I.p(u1, v0, z1), I.p(u1, v1, z1)];
      c.save(); I.clip(L); bricks((u, z) => I.p(u, v1, z), u0, u1, z1, 0.86); c.restore();
      c.save(); I.clip(Rr); bricks((u, z) => I.p(u1, -u, z), -v1, -v0, z1, 0.6); c.restore();
      I.poly([I.p(u0, v0, z1), I.p(u1, v0, z1), I.p(u1, v1, z1), I.p(u0, v1, z1)], col(broken ? 0xa87a50 : 0xd2a272));
      c.strokeStyle = col(0xe0b880, 1, 0.6); c.lineWidth = 0.35;
      c.beginPath(); c.moveTo(...I.p(u0, v1, z1)); c.lineTo(...I.p(u1, v1, z1)); c.stroke();
    };
    // an arm is cut into thin slices along its length (painted back to front) so the crest can rise and fall
    const arm = (u0: number, u1: number, v0: number, v1: number, run: number) => {
      if (u1 - u0 >= v1 - v0) for (let a = u0; a < u1 - 0.01; a += step) slice(a, Math.min(u1, a + step), v0, v1, crest(a + step / 2, run));
      else for (let a = v0; a < v1 - 0.01; a += step) slice(u0, u1, a, Math.min(v1, a + step), crest(a + step / 2, run));
    };
    // fallen bricks and drifted sand at the foot of a broken stretch, mostly on the visible (south and east) side
    const rubble = (near: boolean) => {
      for (let n = 0; n < (near ? 6 : 3); n++) {
        const side = near, along = -12 + R() * 24, off = t + 1 + R() * 5;
        const u = mask & 10 ? along : (side ? off : -off), vv = mask & 10 ? (side ? off : -off) : along;
        const rot = R() < 0.5, w = rot ? 1.4 : 3, d = rot ? 3 : 1.4;
        I.box(u - w / 2, u + w / 2, vv - d / 2, vv + d / 2, 0, 1.2 + (R() < 0.3 ? 1.2 : 0), R() < 0.5 ? 0x9a6a42 : 0xb88a5a);
      }
    };
    if (broken) {
      const [x, y] = I.p(mask & 10 ? 0 : t + 3, mask & 10 ? t + 3 : 0, 0);
      c.fillStyle = col(0xc89a62, 0.9, 0.6); c.beginPath(); c.ellipse(x, y, 13, 4, 0, 0, Math.PI * 2); c.fill();
    }
    if (broken) rubble(false); // the far side's bricks, behind the wall
    if (mask & 1) arm(-t, t, -16, -t, 1);
    if (mask & 8) arm(-16, -t, -t, t, 2);
    // the post: a stepped pier, or a stump of one where the wall is broken
    const ph = broken ? Math.max(5, crest(0, 0) + 1) : h + 3;
    I.box(-t - 1, t + 1, -t - 1, t + 1, 0, ph * 0.6, 0xb98a5c);
    I.box(-t - 0.4, t + 0.4, -t - 0.4, t + 0.4, ph * 0.6, ph, 0xb98a5c);
    if (!broken) I.box(-t + 0.8, t - 0.8, -t + 0.8, t - 0.8, ph, ph + 2.4, 0xc9a070);
    if (mask & 2) arm(t + 1, 16, -t, t, 3);
    if (mask & 4) arm(-t, t, t + 1, 16, 4);
    if (broken) rubble(true);
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

/** Height of a wind-catcher above the roof it stands on. */
export const CATCHER_H = 34;
/**
 * A wind-catcher (settlement network step 3, "land identity": the Sunscar's house look) on a Kel Ashar house's upper
 * storey: a square plastered tower at the back of the tile, louvred vents up top on the faces the wind comes from, a
 * striped cloth flap over the front vent and a lip of beams at the cap. `base`: the roof height it stands on.
 * The image's ground point is the tile centre, like the house tiles: origin (0.5, (IH / 2 + base + CATCHER_H + 6) / height).
 */
export function windCatcherTexture(scene: Phaser.Scene, hv: number, base: number): string {
  const key = `dsb_catcher_${hv}_${base}`, head = base + CATCHER_H + 8, tint = PLASTER[hv];
  hiResTexture(scene, key, IW, IH + head, 1, 3, (c) => {
    const I = new Iso(c, IW / 2, head + IH / 2), R = rng(hv * 7 + base);
    const u0 = -12, u1 = 2, v0 = -12, v1 = 2, z0 = base - 2, z1 = base + CATCHER_H;
    I.box(u0, u1, v0, v1, z0, z1, tint);
    // hand-smoothed plaster blotches on both faces
    for (let n = 0; n < 14; n++) {
      const L = R() < 0.5, a = u0 + R() * (u1 - u0), z = z0 + R() * (z1 - z0);
      const [x, y] = L ? I.p(a, v1, z) : I.p(u1, v0 + R() * (v1 - v0), z);
      c.fillStyle = col(tint, (L ? 0.78 : 0.62) * (R() < 0.5 ? 1.1 : 0.9), 0.5); c.beginPath(); c.ellipse(x, y, 1.6, 1, 0, 0, Math.PI * 2); c.fill();
    }
    // the vents: three tall slots on each face, dark inside, with the mullions between lit on their edge
    const vz0 = z1 - 15, vz1 = z1 - 4;
    for (let k = 0; k < 3; k++) {
      const a = u0 + 2.2 + k * 4, b = a + 2.4;
      I.poly([I.p(a, v1, vz0), I.p(b, v1, vz0), I.p(b, v1, vz1), I.p(a, v1, vz1)], col(0x140c08));
      const e = v0 + 2.2 + k * 4, f = e + 2.4;
      I.poly([I.p(u1, e, vz0), I.p(u1, f, vz0), I.p(u1, f, vz1), I.p(u1, e, vz1)], col(0x100806));
    }
    // a lip of beam ends under the cap, and the cap itself
    for (let a = u0 + 1.5; a < u1; a += 3.5) { const [x, y] = I.p(a, v1 + 0.6, z1 - 1.5); c.fillStyle = col(0x3e2a1a); c.fillRect(x - 0.7, y - 0.6, 1.4, 1.2); }
    I.box(u0 - 1, u1 + 1, v0 - 1, v1 + 1, z1, z1 + 2.2, tint);
    // a striped cloth flap tied over the front vents, lifting at its hem
    const stripes = [0xc8a050, hv % 2 ? 0x2a3a72 : 0x8a3424];
    for (let i = 0; i < 5; i++) {
      const a = u0 + 0.5 + i * ((u1 - u0 - 1) / 5), b = a + (u1 - u0 - 1) / 5;
      I.poly([I.p(a, v1 + 0.4, z1 - 0.5), I.p(b, v1 + 0.4, z1 - 0.5), I.p(b, v1 + 3.6, vz1 - 4), I.p(a, v1 + 3.6, vz1 - 4)], col(stripes[i % 2], 0.95));
    }
    c.strokeStyle = col(0x4a3020); c.lineWidth = 0.4;
    c.beginPath(); c.moveTo(...I.p(u0 + 0.5, v1 + 3.6, vz1 - 4)); c.lineTo(...I.p(u1 - 0.5, v1 + 3.6, vz1 - 4)); c.stroke();
    // a crack and the stain of a drain under the cap
    c.strokeStyle = col(0x3a2416, 1, 0.5); c.lineWidth = 0.35;
    c.beginPath(); c.moveTo(...I.p(u1, v0 + 4, z1 - 1)); c.lineTo(...I.p(u1, v0 + 5, z1 - 9)); c.lineTo(...I.p(u1, v0 + 4, z1 - 14)); c.stroke();
  });
  return key;
}
