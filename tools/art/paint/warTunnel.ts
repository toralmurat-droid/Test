import { C2, blobPath, css, curve, ellipseP, fillShape, glow, grain, limb, line, poly, rng, sh, vol } from "./brush";
import { CART_FRAMES, G, SKIN, disc, shadow } from "./warCarts";

/**
 * The Hide-Kin's tunnel mouth (art key war_tunnel_hidekin, sheet mob_war_tunnel_hidekin from paint/mobs.ts): a dark burrow
 * ringed by heaped soil, broken root timbers and crude hide-and-bone shoring, a small hide banner on a bone pole. Art-only,
 * 80 x 44 frames in the carts' 14-frame layout: 0-5 open idle (trickle, twitching roots), 6-8 digging / dust burst,
 * 9-11 open idle again, 12 hit (dirt spray, shaken timbers), 13 collapsed rubble mound.
 * Colours come from shared/war/clans.ts (hidekin: cloth 0x8a5f2a, trim 0x6e1d18, sigil 0xe2c79a).
 */
export const TUNNEL_W = 80, TUNNEL_H = 44, TUNNEL_FRAMES = CART_FRAMES;
export const WAR_TUNNELS = ["war_tunnel_hidekin"] as const;

const CLOTH = 0x8a5f2a, TRIM = 0x6e1d18, SIGIL = 0xe2c79a, BONE = SKIN.bone;
const SOIL = 0x4a3524, SOIL_L = 0x6a4e34, SOIL_D = 0x2c1e14, ROOT = 0x5a4228, ROOT_L = 0x7a5c3a, HOLE = 0x0b0705, TIMBER = 0x3a2c1e;
const CX = 40;

/** A clump of heaped earth. */
const clod = (c: C2, x: number, y: number, rx: number, ry: number, col: number) => {
  vol(c, ellipseP(x, y, rx, ry), col, [x - rx, y - ry, rx * 2, ry * 2], { ao: 0.4 });
  fillShape(c, ellipseP(x - rx * 0.25, y - ry * 0.35, rx * 0.4, ry * 0.3), css(sh(col, 1.3), 0.5));
};
const crumb = (c: C2, x: number, y: number, s: number, col = SOIL_L) => fillShape(c, poly([[x, y], [x + s, y + s * 0.2], [x + s * 0.5, y + s]]), css(col));

/** The soil mound and the black mouth. `slump` lowers the heap (a wrecked mouth is handled by tunnelRubble). */
function mound(c: C2, shake: number) {
  const s = blobPath([[3, G], [5, G - 8], [14, G - 17], [26, G - 24], [40, G - 27], [54, G - 24], [66, G - 17], [75, G - 8], [77, G]]);
  vol(c, s, SOIL, [3, G - 27, 74, 27], { ao: 0.5 });
  grain(c, s, [3, G - 27, 74, 27], SOIL, 11, 150, 0.3, 1.4, 0.3);
  const r = rng(5);
  for (let i = 0; i < 16; i++) clod(c, 6 + r() * 68, G - 2 - r() * 20 * (1 - Math.abs(r() - 0.5)), 1.6 + r() * 2.2, 1.2 + r() * 1.4, r() < 0.5 ? SOIL_L : SOIL);
  // the dug-out mouth: an arch, black inside, a faint ember-warm lip
  const arch = blobPath([[CX - 17, G + 0.5], [CX - 17.5, G - 10], [CX - 12, G - 17], [CX, G - 19.5], [CX + 12, G - 17], [CX + 17.5, G - 10], [CX + 17, G + 0.5]]);
  fillShape(c, arch, css(HOLE));
  const g = c.createLinearGradient(0, G - 20, 0, G); g.addColorStop(0, "rgba(40,26,16,0.0)"); g.addColorStop(1, "rgba(60,36,20,0.35)");
  fillShape(c, arch, g);
  glow(c, CX, G - 4, 9, 0xb06a2a, 0.13 + shake * 0.02);
  // lighter heaped lip around the arch
  for (let i = 0; i < 11; i++) { const a = Math.PI * (1 + i / 10); clod(c, CX + Math.cos(a) * 19.5, G - 0.5 + Math.sin(a) * 21, 2.6, 2.1, i % 2 ? SOIL_L : SOIL); }
}

/** Shoring: two leaning root posts, a lintel with a bone rib, hide lashings. `sh_` shakes the timbers. */
function shoring(c: C2, sh_: number) {
  for (const sx of [-1, 1]) {
    const x = CX + sx * 17.6;
    limb(c, [x + sx * 0.5, G + 0.5], [x - sx * 0.6 + sh_, G - 18], 3, 2.4, ROOT, { lo: 0.4 });
    line(c, [[x - 0.6, G - 2], [x - 0.9 + sh_, G - 17]], sh(ROOT_L, 1.1), 0.5, 0.8);
    for (const y of [G - 5, G - 11]) { line(c, [[x - 2.2 + sx * 0.3, y], [x + 2.2 + sx * 0.3, y + 1]], SIGIL, 0.8); line(c, [[x - 2, y + 1.1], [x + 2, y + 2]], sh(CLOTH, 0.7), 0.6); } // hide thongs
  }
  // lintel: a gnarled root beam, ends overshooting the posts
  limb(c, [CX - 21, G - 18.4 + sh_ * 0.3], [CX + 21, G - 18.4 - sh_ * 0.3], 2.8, 2.8, TIMBER, { lo: 0.5 });
  line(c, [[CX - 20, G - 19.6], [CX + 20, G - 19.6]], sh(ROOT_L, 0.9), 0.5, 0.7);
  grain(c, poly([[CX - 21, G - 20], [CX + 21, G - 20], [CX + 21, G - 17], [CX - 21, G - 17]]), [CX - 21, G - 20, 42, 3], TIMBER, 23, 30, 0.25, 1.4, 0.1);
  // bone ribs lashed under the lintel as props, and a skull-less horn tusk at each end
  for (const x of [CX - 10, CX + 10]) curve(c, [x, G - 17], [x + (x - CX) * 0.06, G - 14], [x + (x - CX) * 0.1, G - 11], BONE, 1.1);
  for (const sx of [-1, 1]) curve(c, [CX + sx * 20, G - 19], [CX + sx * 25, G - 21], [CX + sx * 24, G - 26], sh(BONE, 0.9), 1.3);
}

/** Dangling roots, tips twitching with `t`. */
function roots(c: C2, t: number, wild = 1) {
  const r = rng(9);
  for (let i = 0; i < 6; i++) {
    const x = CX - 14 + i * 5.6 + r() * 2, len = 6 + r() * 7, sw = Math.sin(t * 2.1 + i * 1.7) * 1.6 * wild;
    curve(c, [x, G - 17.6], [x + sw * 0.4, G - 17.6 + len * 0.55], [x + sw, G - 17.6 + len], i % 2 ? ROOT : ROOT_L, 0.9);
    if (i % 2 === 0) line(c, [[x + sw, G - 17.6 + len], [x + sw + 1.4, G - 17.6 + len + 1.4]], ROOT_L, 0.4, 0.8);
  }
  // roots breaking out of the heap on top
  for (const [x, y, d] of [[16, G - 14, -1], [60, G - 15, 1], [34, G - 25, -1]] as const)
    curve(c, [x, y], [x + d * 4, y - 3 - Math.sin(t * 1.9 + x) * 0.8], [x + d * 8, y - 2 + Math.sin(t * 1.9 + x) * 1.4], ROOT_L, 1.2);
}

/** The Hide-Kin banner: a bone pole and a hide pennant with a red stripe, swaying with `t`. */
function banner(c: C2, t: number, shake: number) {
  const px = CX + 26, top = G - 38;
  limb(c, [px, G - 12], [px + shake * 0.5, top], 1.7, 1.2, sh(BONE, 0.85), { lo: 0.5 });
  disc(c, px + shake * 0.5, top - 0.6, 1.2, BONE, 0.4);
  const w = Math.sin(t * 1.5) * 1.1, pts: [number, number][] = [[px + 1, top + 1], [px + 8, top + 1.4 + w * 0.4], [px + 11, top + 5 + w], [px + 8, top + 8.4 + w * 0.5], [px + 1, top + 9.5]];
  const s = poly(pts); vol(c, s, CLOTH, [px, top, 11, 10], { ao: 0.4 });
  line(c, [[px + 1.2, top + 4], [px + 9.2, top + 4.4 + w * 0.7]], TRIM, 1.6, 0.95); // red stripe
  fillShape(c, poly([[px + 3.4, top + 5.8], [px + 4.6, top + 7.2], [px + 3.4, top + 8.2], [px + 2.4, top + 7]]), css(SIGIL)); // sigil: a claw tooth
  for (let i = 0; i < 3; i++) fillShape(c, poly([[px + 1.4 + i * 2.4, top + 9.4], [px + 2.8 + i * 2.4, top + 9.2], [px + 2, top + 11.4 - i * 0.2]]), css(sh(CLOTH, 0.75)));
}

/** Loose spoil and a falling trickle: `n` crumbs seeded by `seed`, `fall` 0..1 along their drop. */
function trickle(c: C2, seed: number, fall: number, n = 3) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) { const x = CX - 12 + r() * 24, y = G - 17 + ((fall + r()) % 1) * 15; fillShape(c, ellipseP(x, y, 0.55, 0.8), css(SOIL_L, 0.9)); }
}
/** A burst of dust and flying clods centred over the mouth. */
function burst(c: C2, k: number, spray = 1) {
  const r = rng(77 + k);
  for (let i = 0; i < 7; i++) { const a = -Math.PI * (0.1 + 0.8 * r()), d = (6 + r() * 14) * k * spray; glow(c, CX + Math.cos(a) * d * 1.3, G - 8 + Math.sin(a) * d, 4 + k * 3, 0xa08460, 0.34); }
  for (let i = 0; i < 9; i++) { const a = -Math.PI * (0.05 + 0.9 * r()), d = (7 + r() * 17) * k * spray; crumb(c, CX + Math.cos(a) * d * 1.3, G - 10 + Math.sin(a) * d + 4 * k * k, 1.2 + r() * 1.4, r() < 0.5 ? SOIL_L : SOIL); }
}
/** Digging claws and a snout of the burrower pushing up out of the dark. */
function digger(c: C2, k: number) {
  const y = G - 4 - k * 2;
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) fillShape(c, poly([[CX + sx * (5 + i * 1.4), y - 2.4], [CX + sx * (6.4 + i * 1.4), y - 4.6 - k], [CX + sx * (7 + i * 1.4), y - 2]]), css(BONE));
  fillShape(c, ellipseP(CX, y, 3.4, 2.4), css(0x2a1c14)); glow(c, CX - 1.2, y - 0.4, 1.8, 0xe8c070, 0.5); glow(c, CX + 1.2, y - 0.4, 1.8, 0xe8c070, 0.5);
}

/** The caved-in mouth: a low heap of rubble, snapped timbers, the banner pole leaning. */
function rubble(c: C2) {
  const r = rng(31);
  const s = blobPath([[4, G], [9, G - 6], [20, G - 11], [34, G - 13.5], [48, G - 12.5], [62, G - 9], [72, G - 5], [76, G]]);
  vol(c, s, SOIL, [4, G - 14, 72, 14], { ao: 0.5 }); grain(c, s, [4, G - 14, 72, 14], SOIL, 12, 120, 0.3, 1.4, 0.3);
  for (let i = 0; i < 24; i++) clod(c, 8 + r() * 62, G - 1.5 - r() * 10 * (1 - Math.abs(r() - 0.5) * 1.2), 1.5 + r() * 2.6, 1.1 + r() * 1.6, r() < 0.45 ? SOIL_L : r() < 0.5 ? SOIL : SOIL_D);
  for (let i = 0; i < 5; i++) fillShape(c, ellipseP(10 + r() * 56, G - 1 - r() * 2.4, 2.4 + r() * 2, 0.9), css(0x7c7468, 0.8)); // pebbles
  limb(c, [20, G - 4], [31, G - 14], 2.6, 2.2, TIMBER, { lo: 0.4 }); limb(c, [44, G - 6], [58, G - 11.4], 2.4, 2, ROOT, { lo: 0.4 }); limb(c, [CX - 6, G - 9], [CX + 8, G - 8], 2.2, 2, sh(TIMBER, 1.2), { lo: 0.4 });
  for (const [x, y, a, b] of [[23, G - 8, 28, G - 12], [50, G - 8.6, 55, G - 10.4]] as const) line(c, [[x, y], [a, b]], SIGIL, 0.7);
  curve(c, [36, G - 10], [41, G - 16], [46, G - 11], BONE, 1.1); curve(c, [12, G - 5], [15, G - 8], [20, G - 5], sh(BONE, 0.9), 1);
  // banner pole fallen over the heap, the pennant draped limp
  limb(c, [CX + 8, G - 9], [CX + 33, G - 4], 1.7, 1.3, sh(BONE, 0.85), { lo: 0.5 });
  const p = poly([[CX + 18, G - 8], [CX + 29, G - 5.8], [CX + 27, G - 2.6], [CX + 16, G - 5]]); vol(c, p, CLOTH, [CX + 16, G - 8, 13, 5], { ao: 0.4 });
  line(c, [[CX + 19, G - 6], [CX + 28, G - 4.2]], TRIM, 1.3, 0.95);
  for (const [x, y] of [[14, G - 11], [68, G - 8], [30, G - 15]] as const) crumb(c, x, y, 1.6);
  curve(c, [8, G - 3], [12, G - 7], [16, G - 8], ROOT_L, 1); curve(c, [64, G - 3], [66, G - 7], [72, G - 7.6], ROOT_L, 1);
  glow(c, 40, G - 12, 5, 0x8a7050, 0.15); // settling dust
}

/** One frame of the tunnel sheet; `sc` is the shadow layer. */
export function paintTunnel(c: C2, sc: C2 | null, _key: string, f: number) {
  shadow(sc, CX, G + 0.8, f === 13 ? 36 : 38, 3.4);
  if (f === 13) { rubble(c); return; }
  const idle = f < 6 || f >= 9 && f < 12, t = f * 0.9;
  const shake = f === 12 ? (f % 2 ? 1.3 : -1.3) : 0;
  const dig = f >= 6 && f <= 8 ? (f - 5) / 3 : 0; // 0.33, 0.67, 1
  c.save(); if (f === 12) c.translate(0.8, 0);
  mound(c, f % 3);
  if (dig) digger(c, dig);
  roots(c, t, f === 12 ? 2.6 : dig ? 1.6 : 1);
  shoring(c, f === 12 ? 1.6 : dig ? (f % 2 ? 0.4 : -0.4) : 0);
  banner(c, t, f === 12 ? 2 : dig ? 0.6 : 0);
  if (idle) trickle(c, 3 + (f % 6), (f % 6) / 6 + 0.1, 2 + (f % 3));
  if (dig) { trickle(c, 40 + f, 0.5, 5); burst(c, dig); }
  if (f === 12) { trickle(c, 90, 0.3, 6); burst(c, 0.8, 1.2); line(c, [[CX - 21, G - 18.4], [CX - 17, G - 20.5]], 0x1a1410, 0.5); } // timbers jolted, a crack
  c.restore();
}
