import { C2, css, ellipseP, fillShape, glow, grain, limb, line, curve, poly, rng, sh, vol, blobPath } from "./brush";
import { CART_FRAMES, CART_H, CART_W, G, SKIN, disc, planks, rect, shadow, wheel } from "./warCarts";

/**
 * The Ossuary Host's bone siege ram (art key war_ram_host, sheet mob_war_ram_host from paint/mobs.ts): a heavy wheeled frame of
 * bone and dark timber, a battering log hung from it on chains and capped with a horned skull. Art-only, same frame size and
 * 14-frame layout as the supply carts (warCarts.ts): 0-5 walk (down, up, right), 6-8 idle, 9-11 mid-stride, 12 staggering, 13 wrecked.
 * Colours come from shared/war/clans.ts (host: cloth 0x1f2422, trim 0x4f7d6a, sigil 0xd8cfb2).
 */
export const RAM_W = CART_W, RAM_H = CART_H, RAM_FRAMES = CART_FRAMES;
export const WAR_RAMS = ["war_ram_host"] as const;

const CLOTH = 0x1f2422, TRIM = 0x4f7d6a, BONE = SKIN.bone, TIMBER = 0x2c2620, TIMBER_L = 0x4a4038, GLOW = 0x4fe8c0, PALE = 0xb4d4be;

/** A ragged pale cloth strip hanging from (x, y). */
const rag = (c: C2, x: number, y: number, w: number, h: number, seed: number, col = PALE) => {
  const r = rng(seed), n = Math.max(2, Math.round(w / 2.2)), pts: [number, number][] = [[x, y], [x + w, y]];
  for (let i = n; i >= 0; i--) pts.push([x + (w * i) / n, y + h * (i % 2 ? 0.55 + r() * 0.2 : 0.9 + r() * 0.1)]);
  const s = poly(pts); vol(c, s, col, [x, y, w, h], { ao: 0.4 });
  line(c, [[x, y + 0.3], [x + w, y + 0.3]], sh(col, 1.25), 0.4, 0.8);
};
const boneRib = (c: C2, x0: number, y0: number, x1: number, y1: number, bend: number, w = 1.1) => curve(c, [x0, y0], [(x0 + x1) / 2 + bend, (y0 + y1) / 2], [x1, y1], BONE, w);

/** The horned battering skull, side view, facing right; (x, y) is the cranium centre. */
function ramSkull(c: C2, x: number, y: number, r: number, lit: number) {
  // horns sweep up and forward
  curve(c, [x - r * 0.2, y - r * 0.7], [x + r * 0.2, y - r * 2.4], [x + r * 1.5, y - r * 2.1], sh(BONE, 0.9), 1.5);
  curve(c, [x - r * 0.4, y - r * 0.4], [x - r * 1.2, y - r * 2.1], [x - r * 0.4, y - r * 2.4], sh(BONE, 0.65), 1.2, 0.9);
  vol(c, ellipseP(x, y, r, r * 0.9), BONE, [x - r, y - r, r * 2, r * 1.8], { ao: 0.35, spec: 0.4 });
  vol(c, poly([[x + r * 0.2, y - r * 0.3], [x + r * 1.7, y + r * 0.1], [x + r * 1.7, y + r * 0.8], [x + r * 0.4, y + r * 0.8]]), sh(BONE, 0.95), [x, y - r * 0.3, r * 1.8, r * 1.1], { ao: 0.35 }); // snout
  fillShape(c, poly([[x + r * 0.5, y + r * 0.8], [x + r * 1.7, y + r * 0.8], [x + r * 1.5, y + r * 1.2], [x + r * 0.9, y + r * 1.0]]), css(sh(BONE, 0.7))); // jaw
  for (let i = 0; i < 3; i++) fillShape(c, poly([[x + r * (0.7 + i * 0.35), y + r * 0.8], [x + r * (0.9 + i * 0.35), y + r * 0.8], [x + r * (0.8 + i * 0.35), y + r * 1.15]]), css(0xe8e0c8));
  fillShape(c, ellipseP(x + r * 1.55, y + r * 0.35, r * 0.18, r * 0.16), css(0x1a1410)); // nostril
  glow(c, x + r * 0.35, y - r * 0.1, r * 0.9, GLOW, 0.5 + lit * 0.35);
  fillShape(c, ellipseP(x + r * 0.35, y - r * 0.1, r * 0.34, r * 0.3), css(0x0c1412)); fillShape(c, ellipseP(x + r * 0.35, y - r * 0.1, r * 0.2, r * 0.18), css(0x9ffff0));
  line(c, [[x - r * 0.6, y - r * 0.5], [x - r * 0.1, y - r * 0.1]], sh(BONE, 0.7), 0.3, 0.8); // a crack
}

/** One side view, facing right. `sw` swings the log (-1 back .. 1 forward), `roll` turns the wheels, `lit` pulses the eyes. */
function ramSide(c: C2, sw: number, roll: number, lit: number, tilt = 0) {
  const wy = -6.2, w1 = 15, w2 = 40;
  // far wheels sliver, chassis beams
  wheel(c, w1 + 2.4, wy - 1, 5.6, roll + 0.4, TIMBER_L, 0x3a3a38, 8, true); wheel(c, w2 + 2.4, wy - 1, 5.6, roll + 0.9, TIMBER_L, 0x3a3a38, 8, true);
  rect(c, 5, -14, 49, 4.6, TIMBER, { spec: 0.1 }); planks(c, 5, -14, 49, 4.6, 2, TIMBER);
  line(c, [[5, -14], [54, -14]], BONE, 0.7);
  for (let i = 0; i < 10; i++) fillShape(c, poly([[6 + i * 4.8, -14], [7.4 + i * 4.8, -14], [6.7 + i * 4.8, -11.6]]), css(BONE)); // bone fringe
  // two A-frames of timber and bone, a ridge beam across them
  for (const [x, top] of [[15, 14], [41, 14]] as const) {
    limb(c, [x - 7, -14], [x + 1, -35 + top - 14 + 0], 2.2, 1.7, TIMBER_L, { lo: 0.5 });
    limb(c, [x + 9, -14], [x + 1, -35 + top - 14 + 0], 2.2, 1.7, sh(TIMBER_L, 0.75), { lo: 0.5 });
    line(c, [[x - 4.4, -22], [x + 6.4, -22]], sh(TIMBER_L, 0.6), 1);
    boneRib(c, x - 3.6, -24, x + 5.6, -24, 0, 0.8);
  }
  limb(c, [11, -35], [47, -35], 2.4, 2.4, TIMBER_L, { lo: 0.5 });
  line(c, [[11, -36.2], [47, -36.2]], sh(TIMBER_L, 1.5), 0.4, 0.7);
  for (const x of [11, 47]) { disc(c, x, -35, 1.6, 0x5a5a56, 0.5); }
  // the Host's cloth hangs from the ridge
  rag(c, 19, -34.6, 7, 9, 3); rag(c, 28, -34.6, 6, 7, 5, sh(PALE, 0.8)); rag(c, 34.6, -34.6, 5, 10, 9);
  line(c, [[19, -33.8], [32, -33.8]], TRIM, 0.4, 0.8);
  // chains and the log; the log centre swings with `sw`
  const lx = sw * 3.2, ly = -23.5 + Math.abs(sw) * 0.0, lift = sw * 0.6;
  for (const x of [23, 37]) line(c, [[x, -34.4], [x + lx * 0.6, ly - 3]], 0x6a6a68, 0.7, 0.95), line(c, [[x + 0.9, -34.4], [x + 0.9 + lx * 0.6, ly - 3]], 0x3a3a38, 0.4, 0.8);
  c.save(); c.translate(lx, ly); c.rotate(-0.02 * sw + tilt);
  limb(c, [8, 0], [56, -lift], 4.8, 4.8, 0x3a3026, { lo: 0.5 });
  line(c, [[9, -1.8], [55, -2.4 - lift]], sh(0x3a3026, 1.5), 0.5, 0.7);
  grain(c, poly([[8, -2.4], [56, -2.4 - lift], [56, 2.4], [8, 2.4]]), [8, -2.4, 48, 4.8], 0x3a3026, 19, 40, 0.2, 1.2, 0.2);
  for (const x of [22, 37, 50]) { line(c, [[x, -2.6], [x, 2.6]], 0x6a6a68, 1); line(c, [[x + 0.6, -2.6], [x + 0.6, 2.6]], 0x2a2a28, 0.4, 0.8); } // iron bands
  for (const x of [14, 30, 44]) fillShape(c, poly([[x, 2.4], [x + 1.6, 2.4], [x + 0.8, 4.6]]), css(BONE)); // bone studs
  ramSkull(c, 60.5, -0.6 - lift, 4.7, lit);
  c.restore();
  // the near wheels, big and bone-rimmed
  wheel(c, w1, wy, 6.8, roll, TIMBER_L, 0x5a5a56); wheel(c, w2, wy, 6.8, roll + 0.3, TIMBER_L, 0x5a5a56);
  for (const x of [w1, w2]) disc(c, x, wy, 1.2, BONE, 0.4);
  // lantern on the rear post, a skull on the nose beam
  glow(c, 5, -22, 3.4, GLOW, 0.7); rect(c, 4.2, -23.4, 1.8, 3, 0x9ffff0); line(c, [[5, -23.4], [5, -30]], TIMBER_L, 0.7);
  skullLite(c, 53, -16.6, 1.6);
}
const skullLite = (c: C2, x: number, y: number, r: number) => { disc(c, x, y, r, BONE, 0.4); fillShape(c, ellipseP(x - r * 0.35, y - r * 0.05, r * 0.28, r * 0.3), css(0x0c1412)); fillShape(c, ellipseP(x + r * 0.35, y - r * 0.05, r * 0.28, r * 0.3), css(GLOW)); };

/** Head-on (`back` false) or from behind, centred on x = 0. */
function ramFB(c: C2, back: boolean, sw: number, lit: number) {
  for (const sx of [-1, 1]) { const x = sx * 10.2; vol(c, ellipseP(x, -6.4, 1.7, 6.4), TIMBER_L, [x - 1.7, -12.8, 3.4, 12.8], { ao: 0.4 }); line(c, [[x, -11.5], [x, -1.4]], 0x2a1c10, 0.5, 0.7); disc(c, x, -6.4, 0.9, BONE, 0.3); }
  rect(c, -10, -14, 20, 4.6, TIMBER); planks(c, -10, -14, 20, 4.6, 2, TIMBER); line(c, [[-10, -14], [10, -14]], BONE, 0.7);
  for (const sx of [-1, 1]) { limb(c, [sx * 9.4, -14], [sx * 4.6, -35], 2.2, 1.8, TIMBER_L, { lo: 0.5 }); boneRib(c, sx * 8.4, -20, sx * 5.6, -20, 0, 0.7); }
  limb(c, [-6, -35], [6, -35], 2.4, 2.4, TIMBER_L, { lo: 0.5 });
  rag(c, -6, -34.6, 5, 9, 4); rag(c, 1, -34.6, 5, 10, 8, sh(PALE, 0.8));
  const lx = sw * 0.8;
  if (!back) {
    glow(c, lx, -17, 8, GLOW, 0.2 + lit * 0.12);
    vol(c, ellipseP(lx, -16, 3.2, 3.4), 0x3a3026, [lx - 3.2, -19.4, 6.4, 6.8], { ao: 0.4 }); // log end behind the skull
    const r = 4.4, x = lx, y = -17;
    curve(c, [x - r * 0.7, y - r * 0.6], [x - r * 2.2, y - r * 0.9], [x - r * 1.9, y - r * 2.4], BONE, 1.5); curve(c, [x + r * 0.7, y - r * 0.6], [x + r * 2.2, y - r * 0.9], [x + r * 1.9, y - r * 2.4], BONE, 1.5);
    vol(c, ellipseP(x, y, r, r * 1.05), BONE, [x - r, y - r, r * 2, r * 2], { ao: 0.35, spec: 0.4 });
    vol(c, poly([[x - r * 0.45, y + r * 0.1], [x + r * 0.45, y + r * 0.1], [x + r * 0.35, y + r * 1.2], [x - r * 0.35, y + r * 1.2]]), sh(BONE, 0.9), [x - 2, y, 4, 5], { ao: 0.3 });
    for (const e of [-1, 1]) { glow(c, x + e * r * 0.42, y - r * 0.1, r * 0.8, GLOW, 0.6 + lit * 0.3); fillShape(c, ellipseP(x + e * r * 0.42, y - r * 0.1, r * 0.3, r * 0.32), css(0x0c1412)); fillShape(c, ellipseP(x + e * r * 0.42, y - r * 0.1, r * 0.17, r * 0.18), css(0x9ffff0)); }
    fillShape(c, poly([[x - 0.5, y + r * 0.35], [x + 0.5, y + r * 0.35], [x, y + r * 0.75]]), css(0x1a1410));
    for (let i = -1; i <= 1; i++) fillShape(c, poly([[x + i * 1.1 - 0.4, y + r * 1.2], [x + i * 1.1 + 0.4, y + r * 1.2], [x + i * 1.1, y + r * 1.5]]), css(0xe8e0c8));
  } else {
    vol(c, ellipseP(lx, -16, 3.4, 3.6), 0x3a3026, [lx - 3.4, -19.6, 6.8, 7.2], { ao: 0.4 }); for (let i = -1; i <= 1; i++) line(c, [[lx - 3, -16 + i * 1.6], [lx + 3, -16 + i * 1.6]], 0x6a6a68, 0.5);
    for (const sx of [-1, 1]) curve(c, [lx + sx * 1.5, -19], [lx + sx * 6, -21], [lx + sx * 5.6, -26], BONE, 1.2);
    glow(c, 0, -30, 3, GLOW, 0.5);
  }
  for (const sx of [-1, 1]) line(c, [[sx * 3.6 + 1, -34.4], [sx * 3.2 + lx * 0.6, -21]], 0x6a6a68, 0.6, 0.95);
}

/** A collapsed pile: broken beams, the log on the ground, bones, a cracked skull still glowing faintly, a torn rag. */
function ramWreck(c: C2) {
  const r = rng(41);
  limb(c, [6, G - 3], [18, G - 5.4], 2.2, 2, TIMBER_L, { lo: 0.4 }); limb(c, [14, G - 4], [26, G - 3.2], 2, 2, TIMBER);
  c.save(); c.translate(14, G); c.rotate(-0.1); rect(c, 0, -9, 36, 4.6, TIMBER); planks(c, 0, -9, 36, 4.6, 2, TIMBER); line(c, [[0, -9], [36, -9]], BONE, 0.6); c.restore(); // the chassis, sagging
  limb(c, [20, G - 8], [33, G - 20], 2.2, 1.8, TIMBER_L, { lo: 0.4 }); limb(c, [28, G - 12], [41, G - 8], 2, 2, sh(TIMBER_L, 0.8)); // leaning posts
  limb(c, [24, G - 8], [58, G - 3], 5, 5, 0x3a3026, { lo: 0.5 }); // the log fallen to the ground
  for (const x of [34, 46]) line(c, [[x, G - 6.4], [x + 1.4, G - 0.6]], 0x6a6a68, 1);
  ramSkull(c, 61, G - 4, 4, 0);
  glow(c, 62, G - 5, 5, GLOW, 0.25);
  c.save(); c.translate(8, G - 2); c.scale(1, 0.4); wheel(c, 0, 0, 6.4, 0.5, TIMBER_L, 0x4a4a48, 8); c.restore(); // a wheel flat on the ground
  c.save(); c.translate(46, G - 2); c.rotate(0.3); wheel(c, 0, 0, 5.4, 0.2, TIMBER_L, 0x4a4a48, 6); c.restore();
  for (let i = 0; i < 9; i++) limb(c, [4 + i * 5.6 + r() * 2, G - 1 - r()], [8 + i * 5.6 + r() * 3, G - 1.6 - r() * 1.4], 0.9, 0.8, BONE);
  skullLite(c, 3, G - 2, 1.7); disc(c, 40, G - 1.6, 1.2, sh(BONE, 0.9));
  rag(c, 22, G - 9, 8, 4, 12); vol(c, blobPath([[28, G], [28, G - 2], [36, G - 3], [41, G]]), sh(PALE, 0.7), [28, G - 3, 13, 3], { ao: 0.4 });
  glow(c, 10, G - 4, 3, GLOW, 0.4); rect(c, 9.2, G - 5, 1.8, 2.6, 0x1f3a34);
}

/** One frame of the ram sheet; `sc` is the shadow layer. */
export function paintRam(c: C2, sc: C2 | null, _key: string, f: number) {
  const dir = f === 12 || f === 13 ? "right" : f < 6 ? (["down", "up", "right"] as const)[f >> 1] : (["down", "up", "right"] as const)[(f - 6) % 3];
  const idle = f >= 6 && f < 9, bob = !idle && f < 12 && f % 2 ? 0.5 : 0;
  const sw = f === 12 ? -1.2 : idle ? [0, 0.35, -0.35][f - 6] : f < 6 ? (f % 2 ? 1 : -1) : [0, 0.6, -0.6][(f - 9) % 3];
  const roll = f < 6 ? (f % 2) * 0.45 : f * 0.2, lit = idle ? (f - 6) / 2 : f % 2;
  if (dir === "right") {
    shadow(sc, 36, G + 0.6, f === 13 ? 31 : 34, 3.3);
    if (f === 13) { ramWreck(c); return; }
    c.save(); c.translate(0, -bob);
    if (f === 12) { c.translate(3, G); c.translate(30, -3); c.rotate(-0.06); c.translate(-30, 3); ramSide(c, sw, 0.3, 0, -0.07); line(c, [[8, -12], [12, -16]], 0x1a1410, 0.5); } // juddering back, the log kicked rearward
    else { c.translate(2, G); ramSide(c, sw, roll, lit); }
    c.restore();
    return;
  }
  shadow(sc, 36, G - 1.4, 14, 3.2);
  c.save(); c.translate(0, -bob); c.translate(36, G - 1); ramFB(c, dir === "up", sw, lit); c.restore();
}
