import Phaser from "phaser";
import { sheet, type Pen } from "./worldProps";
import { hash, dith } from "./bonfireArt";
import { IsoPaint, ramp, type V3 } from "./isoPaint";

/**
 * Morwen's camp on the west side of the market square: a patched crimson bell tent with its flap tied open (a
 * lantern swinging in the doorway, charms hanging off the guy ropes, a pennant on the pole), and her alchemy rig: a glass
 * bulb of glowing red brew bubbling over a coal brazier, a copper still dripping into a little flask, and three
 * rune stones turning slowly in the air above it.
 *
 * Bonfire-style pixel art at 1.5 texels per world px: flat colour ramps, ordered dithering, dark outline,
 * light from the top left. Cosmetic only (collision is NPC_DECOR.solid in shared/npcs.ts).
 */
export const TX = 1.5;
export const CAMP_FRAMES = 12;
const N = CAMP_FRAMES;

const step = (pal: number[], v: number, x: number, y: number) => {
  const c = Math.max(0, Math.min(pal.length - 1, v)), i = Math.floor(c);
  return pal[Math.min(pal.length - 1, c - i > dith(x, y) ? i + 1 : i)];
};

const CRIMSON = [0x200a0e, 0x3c1016, 0x5e161e, 0x7e2226, 0x9e3630, 0xb8523e]; // sun-faded, soot-stained red canvas
const SOOT = [0x120e12, 0x1e181c, 0x2c2428, 0x3c3236, 0x4e4246];
const BURLAP = [0x2e2214, 0x4a3820, 0x66502e, 0x84683e, 0x9e8250];
const INSIDE = [0x0c070a, 0x180c10, 0x2a1414, 0x4a2216, 0x7a3c1c, 0xb0602a];
const WOOD = [0x24160c, 0x3e2816, 0x5a3c22, 0x7a5634];
const ROPE = 0x8a7450, ROPE_D = 0x5e4e34;
const GOLD = [0x5a3a10, 0x8a6020, 0xc0902e, 0xe8c25a];
const IRON = [0x16181c, 0x2a2e34, 0x464c54, 0x6c747e, 0x9aa4ae];
const COPPER = [0x2e140a, 0x5a2c14, 0x8e4a22, 0xc0743a, 0xe8a868];
const BREW = [0x22040c, 0x4e0a18, 0x841826, 0xb82c2c, 0xf06a3a, 0xffc890]; // blood-red brew glowing orange where it is hottest
const COALS = [0x1a0e0a, 0x3a120a, 0x7a1e0a, 0xc8460e, 0xff9a2a, 0xffe08a];
const GLASS = [0x1c2228, 0x34404a, 0x5a6c78, 0x9ab4c0, 0xdceef2];
const SLATE = [0x15151a, 0x26262e, 0x3a3a44, 0x54545e, 0x707080];
const RUNE = [0x8a1a10, 0xd8401c, 0xff7a3a, 0xffd08a];

// ---- tent --------------------------------------------------------------------------------------------------
export const TENT_W = 132, TENT_H = 110, TENT_BY = 80; // base centre (pivot) row
const CX = 66, RX = 42, RY = 20, APEX = 20;
const A0 = Math.PI / 2 + 0.12; // the opening faces the viewer, a little to the right
/** Bell tent profile: a short upright wall, then the roof curving in to the pole. */
const prof = (t: number) => (t < 0.12 ? 1 - t * 0.15 : 0.982 * Math.pow((1 - t) / 0.88, 0.92));
const surf = (t: number, a: number, k = 1): [number, number] => [CX + RX * prof(t) * Math.cos(a) * k, TENT_BY - t * (TENT_BY - APEX) + RY * prof(t) * Math.sin(a) * k];
const openW = (t: number) => (t < 0.6 ? 0.46 * (1 - t / 0.6) ** 0.8 : 0);
const PATCHES: [number, number, number, number][] = [[2.55, 0.34, 0.22, 0.13], [0.62, 0.46, 0.2, 0.1], [2.05, 0.7, 0.16, 0.08], [1.0, 0.16, 0.14, 0.1]];

function tent(p: Pen, f: number) {
  const ph = (f / N) * Math.PI * 2;
  // soft shadow on the ground, pushed away from the light
  for (let y = TENT_BY - RY - 4; y <= TENT_BY + RY + 8; y++) for (let x = CX - RX - 10; x <= CX + RX + 18; x++) {
    const dx = (x - CX - 7) / (RX * 1.12), dy = (y - TENT_BY - 4) / (RY * 1.18);
    if (dx * dx + dy * dy <= 1 && dith(x, y) < 0.75) p.px(x, y, 0x000000, 0.4);
  }
  // canvas: forward-map the surface with a depth buffer (front faces win)
  const z = new Float32Array(TENT_W * TENT_H).fill(-9);
  const col = new Uint32Array(TENT_W * TENT_H);
  for (let t = 0; t <= 1.0001; t += 0.004) {
    const hemCut = t < 0.02;
    for (let a = -0.25; a <= Math.PI + 0.25; a += 0.004) {
      const [sx, sy] = surf(t, a), x = Math.round(sx), y = Math.round(sy), d = Math.sin(a);
      if (x < 0 || y < 0 || x >= TENT_W || y >= TENT_H) continue;
      const i = y * TENT_W + x;
      if (d < z[i]) continue;
      if (hemCut && hash(Math.round(a * 60), 1, 3) < 0.35 && t < 0.012) continue; // ragged hem
      z[i] = d;
      let c: number;
      const off = a - A0, w = openW(t);
      if (Math.abs(off) < w) {
        // dark inside, lit by the lantern
        const lx = CX + RX * 0.06, ly = TENT_BY - 15, dd = Math.hypot(x - lx, (y - ly) * 1.3);
        let v = 0.6 + Math.max(0, 1 - dd / 22) * 3.6;
        if (t < 0.05) v += 0.6; // floor
        c = step(INSIDE, v, x, y);
        if (t < 0.06 && ((x + y) % 5 === 0)) c = CRIMSON[2]; // the rug inside
      } else if (Math.abs(off) < w + 0.09 && t < 0.62) {
        // the flap folded back on each side: inner lining catching the light, a fold line
        const k = (Math.abs(off) - w) / 0.09;
        c = step(CRIMSON, 3.6 - k * 1.6 + (off < 0 ? 0.4 : -0.3), x, y);
        if (k > 0.45 && k < 0.6) c = CRIMSON[1];
      } else {
        const pk = a * 9 / Math.PI, panel = Math.floor(pk + 9) % 3, frac = pk - Math.floor(pk);
        const pal = panel === 1 ? SOOT : CRIMSON;
        let v = (pal === SOOT ? 2.0 : 2.6) - Math.cos(a) * 1.1 - Math.max(0, Math.sin(a) - 0.6) * 0.4 + t * 1.1 + (hash(x >> 1, y >> 1, 5) - 0.5) * 0.6;
        if (t < 0.1) v -= (1 - t / 0.1) * 1.3; // mud splashed up the wall
        if (frac < 0.05 || frac > 0.97) v -= 1.2; // stitched seams
        c = step(pal, v, x, y);
        // patches sewn over the tears, with big crude stitches
        for (const [pa, pt, pw, phh] of PATCHES) {
          if (Math.abs(a - pa) < pw / 2 && Math.abs(t - pt) < phh / 2) {
            const edge = Math.abs(a - pa) > pw / 2 - 0.02 || Math.abs(t - pt) > phh / 2 - 0.012;
            c = edge ? ((x + y) % 2 ? GOLD[1] : BURLAP[0]) : step(BURLAP, 2.4 - Math.cos(a) + t, x, y);
          }
        }
        // soot-black valance with scallops where the wall meets the roof
        if (t > 0.115 && t < 0.165 && t - 0.115 > 0.042 * Math.abs(Math.sin(a * 13)) && pal !== SOOT) c = step(SOOT, 2.4 - Math.cos(a), x, y);
        if (t > 0.163 && t < 0.172) c = GOLD[1 + ((x >> 1) & 1)];
        if (t < 0.05 && hash(x, y, 8) < 0.06) c = INSIDE[0]; // small holes near the hem
      }
      col[i] = c;
    }
  }
  for (let y = 0; y < TENT_H; y++) for (let x = 0; x < TENT_W; x++) if (z[y * TENT_W + x] > -9) p.px(x, y, col[y * TENT_W + x]);

  // lantern hanging inside the doorway, swinging a little
  {
    const sw = Math.sin(ph) * 1.4, top = Math.round(TENT_BY - 27), lx = Math.round(CX + RX * 0.06 + sw);
    p.line(CX + Math.round(RX * 0.06), top, lx, top + 5, ROPE_D);
    p.rect(lx - 2, top + 6, 5, 1, IRON[2]);
    for (let j = 0; j < 4; j++) for (let i = -2; i <= 2; i++) p.px(lx + i, top + 7 + j, Math.abs(i) === 2 ? IRON[1] : j === 0 || j === 3 ? IRON[2] : step(RUNE, 2.4 + (1 - Math.abs(i)) * 0.8 + Math.sin(ph * 2) * 0.3, lx + i, top + j));
    p.rect(lx - 1, top + 11, 3, 1, IRON[1]);
  }

  // tie-back cords on the flaps
  for (const s of [-1, 1]) {
    const t = 0.3, [kx, ky] = surf(t, A0 + s * (openW(t) + 0.05));
    p.px(kx, ky, GOLD[3]); p.px(kx + 1, ky, GOLD[2]); p.px(kx, ky + 1, GOLD[1]);
    p.line(kx, ky + 1, kx + s, ky + 5, GOLD[1]); p.px(kx + s, ky + 6, GOLD[2]);
  }

  // centre pole above the apex, crow feathers bound round it, a red pennant
  const [ax, ay] = surf(1, 0);
  for (let y = ay - 13; y <= ay + 1; y++) { p.px(ax - 1, y, WOOD[3]); p.px(ax, y, WOOD[2]); p.px(ax + 1, y, WOOD[1]); }
  p.px(ax, ay - 14, GOLD[3]); p.px(ax - 1, ay - 14, GOLD[2]); p.px(ax, ay - 15, GOLD[2]);
  for (let k = 0; k < 4; k++) { const fx = ax - 3 + k * 2, sw2 = Math.round(Math.sin(ph + k) * 0.6); p.line(fx, ay - 1, fx + (k - 1.5) * 1.5 + sw2, ay + 5, k % 2 ? SOOT[1] : SOOT[3]); }
  for (let i = 0; i < 14; i++) {
    const k = i / 14, hgt = Math.max(1, Math.round(5 * (1 - k * 0.8))), dy = Math.round(Math.sin(ph + i * 0.5) * (0.4 + k * 2));
    for (let j = 0; j < hgt; j++) {
      const lit = Math.sin(ph + i * 0.5 + 1.2);
      p.px(ax + 2 + i, ay - 12 + j + dy, j === hgt - 1 ? CRIMSON[1] : lit > 0.3 ? CRIMSON[4] : lit < -0.4 ? CRIMSON[2] : CRIMSON[3]);
    }
  }

  // guy ropes to stakes, with charms hanging off them (bone, feather, bead) swaying in the wind
  const ropes: [number, number][] = [[Math.PI - 0.45, 0.5], [0.42, 0.5], [Math.PI - 0.05, 0.62]];
  ropes.forEach(([a, t], ri) => {
    const [x0, y0] = surf(t, a), [x1, y1] = surf(0, a, 1.5);
    const sx = Math.round(x1), sy = Math.round(y1);
    for (let j = 0; j < 6; j++) { p.px(sx, sy - j + 2, WOOD[2]); p.px(sx + 1, sy - j + 2, WOOD[0]); } // stake
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0;
    for (let i = 0; i <= n; i++) { const k = i / n; p.px(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * 2, i % 3 ? ROPE : ROPE_D); }
    if (ri === 2) return;
    for (const [k, kind] of [[0.3, 0], [0.55, 1], [0.78, 2]] as const) {
      const hx = x0 + (x1 - x0) * k, hy = y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * 2;
      const sw = Math.sin(ph + k * 5 + ri * 2) * 1.6, len = 4 + kind;
      p.line(hx, hy, hx + sw, hy + len, ROPE_D);
      const ex = Math.round(hx + sw), ey = Math.round(hy + len);
      if (kind === 0) { p.px(ex, ey + 1, 0xd8ceb4); p.px(ex, ey + 2, 0xb0a68c); p.px(ex - 1, ey + 3, 0xd8ceb4); p.px(ex + 1, ey + 3, 0x8a806a); } // finger bone
      else if (kind === 1) { for (let j = 1; j < 6; j++) p.px(ex + (j > 3 ? 1 : 0), ey + j, j === 1 ? SOOT[4] : SOOT[2]); } // crow feather
      else { p.px(ex, ey + 1, RUNE[1]); p.px(ex + 1, ey + 1, RUNE[0]); p.px(ex, ey + 2, RUNE[0]); } // red glass bead
    }
  });
}

// ---- alchemy rig --------------------------------------------------------------------------------------------
const RS = 0.72; // the rig is drawn on an 80x100 design grid and placed at this scale, one texel per pixel
const RW0 = 80, RH0 = 100, RBY0 = 92;
export const RIG_W = Math.ceil(RW0 * RS), RIG_H = Math.ceil(RH0 * RS), RIG_BY = Math.round(RBY0 * RS);
const BX = 30; // brazier / bulb column




/**
 * The alchemy rig, modelled in 3D (isoPaint.ts; Murat 2026-11-13: the face-on version looked flat): a brazier bowl on
 * three legs, an iron tripod holding the glass bulb of brew over it, a copper still running off to a flask on a stump,
 * and three rune stones circling above.
 */
function rig(p0: Pen, f: number) {
  const g = new IsoPaint(p0, RIG_W, RIG_H, 21, RIG_BY - 2), ph = (f / N) * Math.PI * 2;
  const m = (pal: number[], b = 0) => (l: number, _s: number, _t: number, x: number, y: number) => ramp(pal, l + b, x, y);
  g.shadow(5, 3, 15, 0.4);
  // rune stones on a slow orbit above the bulb: one full turn per loop of the sheet
  const stone = (k: number) => {
    const a = ph + k * (Math.PI * 2 / 3), u = Math.cos(a) * 11, v = Math.sin(a) * 11, z = 48 + Math.sin(ph * 2 + k * 2) * 1.2;
    const glow = 0.45 + Math.sin(ph * 2 + k * 2.1) * 0.35;
    g.box(u - 1.3, u + 1.3, v - 1, v + 1, z - 2.4, z + 2.4, (l, s2, t, x, y) => {
      const gx = Math.round(s2 * 4), gy = Math.round(t * 5);
      const glyph = [[2, 1], [2, 2], [2, 3], [1, 2], [3, 3], [2, 4]].some(([i, j]) => ((i + k) % 4 || 1) === gx && j === gy);
      return glyph ? ramp(RUNE, glow + 0.2, x, y) : ramp(SLATE, l + (hash(x, y, 11) < 0.1 ? -0.15 : 0), x, y);
    });
  };
  [0, 1, 2].forEach(stone);
  // brazier: an iron bowl of coals on three short legs
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; g.rod([Math.cos(a) * 4, Math.sin(a) * 4, 6], [Math.cos(a) * 6.5, Math.sin(a) * 6.5, 0], 0.5, m(IRON, -0.1)); }
  g.blob([0, 0, 7], 6.5, 6.5, 3.6, m(IRON, -0.05), 0, 0.5);
  g.surf((r, a) => [[Math.cos(a * 6.283) * r * 6, Math.sin(a * 6.283) * r * 6, 7 + (1 - r) * 0.6], [0, 0, 1]], 14, 70, (_l, r, _a, x, y) => ramp(COALS, 0.75 - r * 0.35 + (hash(x, y, f >> 1) - 0.5) * 0.4, x, y));
  // tripod up to the ring the bulb sits in
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + 1.4; g.rod([Math.cos(a) * 9, Math.sin(a) * 9, 0], [Math.cos(a) * 4.6, Math.sin(a) * 4.6, 27], 0.55, m(IRON)); }
  for (let i = 0; i < 24; i++) { const a0 = i / 24 * 6.283, a1 = (i + 1) / 24 * 6.283; g.rod([Math.cos(a0) * 4.8, Math.sin(a0) * 4.8, 27], [Math.cos(a1) * 4.8, Math.sin(a1) * 4.8, 27], 0.5, m(IRON, 0.05)); }
  // the glass bulb: red brew glowing from the coals below the rocking meniscus, clear glass above
  const BZ = 33, R = 7, level = BZ + 0.6 + Math.sin(ph * 2) * 0.4;
  g.blob([0, 0, BZ], R, R, R, (l, _s, t, x, y) => {
    const z = BZ - R + t * 2 * R;
    if (z < level) return ramp(BREW, 0.5 + l * 0.35 - (z - (BZ - R)) * 0.02 + (z < BZ - R + 3 ? 0.15 : 0), x, y);
    return l > 0.92 || dith(x, y) < 0.16 ? ramp(GLASS, l - 0.1, x, y) : undefined;
  });
  for (let i = 0; i < 5; i++) { // bubbles rising in the brew
    const k = ((f + i * 2.4) % N) / N, z = BZ - R + 1 + k * (level - BZ + R - 1);
    g.plot(Math.cos(i * 2) * 3 + 4, Math.sin(i * 2) * 3 + 4, z, BREW[5], 2);
  }
  g.rod([0, 0, BZ + R - 1], [0, 0, BZ + R + 4], 1, m(GLASS));
  // copper still: from the neck, over, through a cooling coil, down into the flask
  const tube: V3[] = [[0, 0, BZ + R + 4], [3, -1, BZ + R + 6.5], [9, -1, BZ + R + 6], [15, -1, BZ + 3], [18, -1, 15]];
  for (let i = 0; i < tube.length - 1; i++) g.rod(tube[i], tube[i + 1], 0.6, m(COPPER, 0.05));
  for (let i = 0; i < 4; i++) { const k = i / 4, q: V3 = [9 + 6 * k, -1, BZ + R + 6 - (BZ + R + 6 - BZ - 3) * k]; g.blob(q, 1.4, 1.4, 0.6, m(COPPER, 0.1)); }
  // stump with the receiving flask, a drip falling into it
  g.rod([18, -1, 0], [18, -1, 6], 4, (l, _s, _t, x, y) => ramp(WOOD, l - 0.05 + (hash(x, y >> 1, 2) - 0.5) * 0.2, x, y));
  g.surf((r, a) => [[18 + Math.cos(a * 6.283) * r * 4, -1 + Math.sin(a * 6.283) * r * 4, 6], [0, 0, 1]], 10, 50, (l, r, _a, x, y) => (Math.round(r * 5) % 2 ? WOOD[1] : ramp(WOOD, l, x, y)));
  g.blob([18, -1, 9.5], 3.4, 3.4, 3.4, (l, _s, t, x, y) => (t < 0.55 ? ramp(BREW, 0.45 + l * 0.3, x, y) : l > 0.8 || dith(x, y) < 0.25 ? ramp(GLASS, l, x, y) : undefined));
  g.rod([18, -1, 12.5], [18, -1, 14.6], 0.8, m(GLASS));
  const dk = (f % 6) / 6; g.plot(18, -1, 14.6 - dk * 2, BREW[4], 3);
  // embers drifting up off the coals
  for (let i = 0; i < 4; i++) { const k = ((f + i * 3) % N) / N; g.plot(Math.cos(i * 1.7) * 4, Math.sin(i * 1.7) * 4 + 4, 8 + k * 14, k < 0.5 ? RUNE[3] : RUNE[1], 1); }
}

/** Paints the camp textures and their idle animations. */
export function witchCampTextures(scene: Phaser.Scene) {
  sheet(scene, "wc_tent", TENT_W, TENT_H, N, tent, 0);
  sheet(scene, "wc_rig", RIG_W, RIG_H, N, rig, 0);
  for (const [k, fps] of [["wc_tent", 6], ["wc_rig", 8]] as const) {
    if (!scene.anims.exists(`${k}_idle`)) scene.anims.create({ key: `${k}_idle`, frames: scene.anims.generateFrameNumbers(k, { start: 0, end: N - 1 }), frameRate: fps, repeat: -1 });
  }
}

/** Pivot (origin y) of each camp texture: the tent stands on its base centre, the rig on its feet. */
export const CAMP_PIVOT: Record<string, number> = { wc_tent: TENT_BY / TENT_H, wc_rig: RIG_BY / RIG_H };
