import { C2, P, css, curve, ellipseP, fillShape, glow, limb, line, poly, sh, vol } from "./brush";

/**
 * Act 4 (Red Badlands) monsters that are not men: the Redfang war-hound, the carrion vulture, the giant rattlesnake.
 * Drawn in world px on a w x h frame (paint/mobs.ts sheets mob_warhound, mob_vulture, mob_rattler), 12 frames like
 * every monster: 0-1 down, 2-3 up, 4-5 right (second = step), then wind-up and strike per facing.
 */
export const WARHOUND_W = 34, WARHOUND_H = 24, VULTURE_W = 36, VULTURE_H = 34, RATTLER_W = 32, RATTLER_H = 22;
type Dir = "down" | "up" | "right";
type Pose = "stand" | "step" | "wind" | "strike";

const shadow = (S: C2, x: number, y: number, rx: number, ry: number) => { S.save(); S.translate(x, y); S.scale(1, ry / rx); S.fillStyle = "rgba(0,0,0,0.42)"; S.beginPath(); S.arc(0, 0, rx, 0, Math.PI * 2); S.fill(); S.restore(); };
/** A lit, outlined ellipse. */
const ell = (c: C2, x: number, y: number, rx: number, ry: number, col: number, rot = 0, o: { ao?: number; spec?: number } = {}) => {
  fillShape(c, ellipseP(x, y, rx + 0.4, ry + 0.4, rot), css(sh(col, 0.34)));
  vol(c, ellipseP(x, y, rx, ry, rot), col, [x - rx, y - ry, rx * 2, ry * 2], { ao: o.ao ?? 0.3, spec: o.spec ?? 0.2 });
};
const lmb = (c: C2, a: P, b: P, wa: number, wb: number, col: number) => { limb(c, a, b, wa + 0.8, wb + 0.8, sh(col, 0.34)); limb(c, a, b, wa, wb, col); };

// ------------------------------------------------------------------ the war-hound
const FUR = 0x8e4326, FUR_D = 0x4e2216, FUR_L = 0xc07c4c, IRON = 0x70706c, PAINT = 0xb3261c, AMBER = 0xffc03a, TOOTH = 0xf4ecd8;

/** A big red-furred war dog: heavy chest, a spiked iron collar, red war-paint stripes on the shoulder, amber eyes, a torn ear. */
export function paintWarhound(c: C2, sc: C2 | null, dir: Dir, pose: Pose, f: number) {
  const w = WARHOUND_W, h = WARHOUND_H, g = h - 3, step = pose === "step", wind = pose === "wind", strike = pose === "strike", S = sc ?? c;
  const eye = (x: number, y: number) => { fillShape(c, ellipseP(x, y, 0.8, 0.6), css(0x180806)); glow(c, x, y, 1.2, AMBER, 0.5); fillShape(c, ellipseP(x, y, 0.42, 0.34), css(AMBER)); };
  const studs = (pts: P[]) => { for (const [x, y] of pts) { fillShape(c, poly([[x - 0.5, y + 0.2], [x + 0.5, y + 0.2], [x, y - 1.3]]), css(0xc4c4bc)); } };
  const leg = (hip: P, s: number, lift: number, far: boolean, hind: boolean, sgn = 1) => {
    const col = far ? sh(FUR, 0.66) : FUR, fx = hip[0] + sgn * s * 2.8, fy = g - lift, kx = hip[0] + sgn * (hind ? -1.8 : 1.2) + s * sgn * 0.8, ky = (hip[1] + fy) / 2;
    lmb(c, hip, [kx, ky], hind ? 2.4 : 2.1, 1.4, col); lmb(c, [kx, ky], [fx, fy - 0.6], 1.3, 1.0, col);
    ell(c, fx + sgn * 0.7, fy - 0.2, 1.5, 0.85, far ? sh(FUR_D, 0.8) : FUR_D);
  };
  if (dir === "right") {
    const bx = w * 0.46 + (strike ? 2 : wind ? -1.5 : 0), hy = g - 9.4 + (wind ? 0.8 : 0), sw = step ? 1 : -1;
    shadow(S, bx + 1, g + 0.4, 13, 2.4);
    const fs = strike ? 1.3 : wind ? -0.4 : sw, hs = strike ? -1.4 : wind ? 0.2 : -sw;
    leg([bx + 5, hy + 1.5], -fs * 0.8, step ? 1.6 : 0, true, false); leg([bx - 5, hy + 1.3], -hs * 0.8, step ? 0 : 1.6, true, true);
    // tail: a thick brush held low, flicking
    curve(c, [bx - 8.5, hy - 1.4], [bx - 12.5, hy + 0.5 + (step ? -1 : 0.8)], [bx - 13.5, hy + 3.4 + (step ? -1.4 : 0)], sh(FUR_D, 0.85), 2.1);
    curve(c, [bx - 8.5, hy - 1.4], [bx - 12.5, hy + 0.5 + (step ? -1 : 0.8)], [bx - 13.5, hy + 3.4 + (step ? -1.4 : 0)], FUR, 1.5);
    // body: haunch, barrel, deep chest, then a dark mane along the back
    ell(c, bx - 5.2, hy + 0.4, 4.6, 4.4, FUR); ell(c, bx, hy, 6.6, 4.2, FUR); ell(c, bx + 4.6, hy + 0.8, 4.4, 4.7, FUR);
    ell(c, bx + 0.4, hy + 3.2, 5.2, 1.6, FUR_L, 0, { ao: 0.1 });
    for (let k = 0; k < 8; k++) fillShape(c, poly([[bx - 6 + k * 1.7, hy - 3.6 + Math.abs(k - 4) * 0.12], [bx - 5 + k * 1.7, hy - 3.7], [bx - 5.3 + k * 1.7, hy - 5.3 + (k % 2) * 0.5 + Math.abs(k - 4) * 0.1]]), css(FUR_D)); // bristling mane
    // war-paint across the shoulder
    for (const o of [0, 1.6, 3.2]) line(c, [[bx + 2.4 + o, hy - 3.4], [bx + 3.4 + o, hy + 0.6]], PAINT, 0.7, 0.9);
    leg([bx + 4.8, hy + 1.8], fs, step ? 0 : 1.7, false, false); leg([bx - 5, hy + 1.6], hs, step ? 1.7 : 0, false, true);
    // neck + spiked collar + head
    const hd: P = [bx + 10.4 + (strike ? 2.4 : 0), hy - (wind ? 1.4 : 2.2) + (strike ? 1.2 : 0)];
    lmb(c, [bx + 6.4, hy - 0.6], [hd[0] - 1.2, hd[1] + 0.6], 4.2, 3.2, FUR);
    lmb(c, [bx + 7.6, hy - 2.0], [bx + 8.2, hy + 2.8], 1.5, 1.5, IRON); studs([[bx + 8.4, hy - 2.4], [bx + 8.9, hy - 0.8], [bx + 9.1, hy + 0.8]]);
    const open = wind ? 2.4 : strike ? 3.2 : 0.5 + (step ? 0.3 : 0);
    ell(c, hd[0] + 3.6, hd[1] + 1.8 + open * 0.7, 3.2, 1.0, sh(FUR_D, 1.2), open * 0.07); // lower jaw
    for (let k = 0; k < 3; k++) fillShape(c, poly([[hd[0] + 2.4 + k * 1.1, hd[1] + 1.7 + open * 0.55], [hd[0] + 3.0 + k * 1.1, hd[1] + 1.7 + open * 0.55], [hd[0] + 2.7 + k * 1.1, hd[1] + 0.5 + open * 0.3]]), css(TOOTH));
    ell(c, hd[0], hd[1], 3.6, 3.0, FUR); ell(c, hd[0] + 3.8, hd[1] + 0.9, 3.5, 1.8, FUR_L, -0.1, { ao: 0.2 });
    fillShape(c, ellipseP(hd[0] + 6.6, hd[1] + 0.4, 0.85, 0.7), css(0x120808)); // nose
    for (let k = 0; k < 3; k++) fillShape(c, poly([[hd[0] + 2.4 + k * 1.1, hd[1] + 2.2], [hd[0] + 3.0 + k * 1.1, hd[1] + 2.2], [hd[0] + 2.7 + k * 1.1, hd[1] + 3.2 + open * 0.2]]), css(TOOTH));
    eye(hd[0] + 1.5, hd[1] - 0.6);
    fillShape(c, poly([[hd[0] - 1.8, hd[1] - 2], [hd[0] - 3.0, hd[1] - 5.2], [hd[0] - 1.2, hd[1] - 4.6], [hd[0] - 0.2, hd[1] - 2.2]]), css(FUR_D)); // ear, torn at the tip
    line(c, [[hd[0] + 0.6, hd[1] - 2.2], [hd[0] + 1.8, hd[1] + 0.4]], PAINT, 0.6, 0.9); // a stripe of war-paint down the brow
  } else if (dir === "down") {
    const cx = w / 2, hy = g - 8 + (strike ? 1 : wind ? -0.8 : 0), sw = step ? 1 : -1;
    shadow(S, cx, g - 0.8, 10, 3);
    for (const sd of [-1, 1]) leg([cx + sd * 3.4, hy - 4], sd * sw * 0.3, 0, true, true, sd);
    ell(c, cx, hy - 5.6, 4.2, 3.2, FUR); // the rump behind
    curve(c, [cx, hy - 8], [cx + 3, hy - 10.5 + (step ? 1 : 0)], [cx + 1.4, hy - 11.5], FUR_D, 1.6);
    ell(c, cx, hy - 1.4, 6.0, 5.4, FUR); // the chest
    for (const o of [-1.6, 0, 1.6]) line(c, [[cx + o - 1, hy - 5], [cx + o + 1, hy - 1]], PAINT, 0.7, 0.9);
    for (const sd of [-1, 1]) leg([cx + sd * 3.6, hy + 0.4], sd * sw * 0.4 * (strike ? 0 : 1), sd * sw > 0 ? 1.4 : 0, false, false, sd);
    lmb(c, [cx - 4.4, hy + 0.2], [cx + 4.4, hy + 0.2], 1.6, 1.6, IRON); studs([[cx - 3.2, hy - 0.2], [cx - 1.2, hy + 0.2], [cx + 1.2, hy + 0.2], [cx + 3.2, hy - 0.2]]);
    const open = wind ? 2.2 : strike ? 2.8 : 0.4;
    ell(c, cx, hy + 3.2 + open * 0.8, 2.3, 1.1, sh(FUR_D, 1.2));
    ell(c, cx, hy + 0.8, 3.7, 3.2, FUR); ell(c, cx, hy + 2.6, 2.1, 1.6, FUR_L, 0, { ao: 0.1 });
    for (const sd of [-1, 1]) { fillShape(c, poly([[cx + sd * 2.3, hy - 1.4], [cx + sd * 4.4, hy - 4.6], [cx + sd * 3.8, hy - 0.6]]), css(FUR_D)); eye(cx + sd * 1.6, hy + 0.2); }
    fillShape(c, ellipseP(cx, hy + 2.5, 0.9, 0.7), css(0x120808));
    for (const sd of [-1, 1]) fillShape(c, poly([[cx + sd * 1.2 - 0.3, hy + 3.2], [cx + sd * 1.2 + 0.3, hy + 3.2], [cx + sd * 1.2, hy + 4.4 + open * 0.3]]), css(TOOTH));
    line(c, [[cx, hy - 2.4], [cx, hy + 0.8]], PAINT, 0.7, 0.9);
  } else {
    const cx = w / 2, hy = g - 8 + (strike ? -0.8 : wind ? 0.6 : 0), sw = step ? 1 : -1;
    shadow(S, cx, g - 0.8, 10, 3);
    ell(c, cx, hy - 5.6, 4, 3, FUR_D); // head peeking over the shoulders
    for (const sd of [-1, 1]) fillShape(c, poly([[cx + sd * 1.6, hy - 8], [cx + sd * 3, hy - 10.4], [cx + sd * 2.6, hy - 7]]), css(FUR_D));
    ell(c, cx, hy - 1.4, 6.2, 5.4, FUR);
    for (let k = 0; k < 5; k++) fillShape(c, poly([[cx - 4 + k * 2, hy - 5.6], [cx - 3 + k * 2, hy - 5.6], [cx - 3.5 + k * 2, hy - 7.4]]), css(FUR_D));
    for (const sd of [-1, 1]) leg([cx + sd * 3.8, hy - 0.6], sd * sw * 0.3, 0, true, true, sd);
    ell(c, cx, hy + 1.2, 5, 3.6, FUR);
    for (const sd of [-1, 1]) leg([cx + sd * 3.6, hy + 2], sd * sw * 0.4, sd * sw > 0 ? 1.4 : 0, false, true, sd);
    const tw = Math.sin(f * 1.3) * 1.2;
    curve(c, [cx, hy + 0.6], [cx + tw, hy - 2], [cx + tw * 1.4, hy - 4.4], FUR_D, 2); curve(c, [cx, hy + 0.6], [cx + tw, hy - 2], [cx + tw * 1.4, hy - 4.4], FUR, 1.4);
  }
}

// ------------------------------------------------------------------ the carrion vulture
const PLUME = 0x3c2c26, PLUME_L = 0x6a5240, RUFF = 0xe0d6c2, SKIN = 0xc8604e, BEAK = 0xd8b050, TALON = 0x2a2220;

/**
 * A big carrion vulture: dark brown plumage with paler wing coverts, a ragged white ruff, a bald wrinkled red head and a
 * hooked bill. It hovers (the sheet is painted with the body lifted, wings beating): stand and step are the up and down
 * beats, wind-up rears back with the wings raised, the strike drops claws-first.
 */
export function paintVulture(c: C2, sc: C2 | null, dir: Dir, pose: Pose, f: number) {
  const w = VULTURE_W, h = VULTURE_H, g = h - 3, step = pose === "step", wind = pose === "wind", strike = pose === "strike", S = sc ?? c;
  const lift = 8 + (wind ? 1.5 : strike ? -2 : 0) + (step ? -1 : 0);
  shadow(S, w / 2, g, 8 - lift * 0.15, 2);
  const flap = wind ? 1.2 : strike ? -0.6 : step ? -0.7 : 0.6; // + wings high, - wings low
  /** One wing: shoulder -> wrist -> a fan of long primaries. `s` = side (-1 left, +1 right) from the viewer, spread 0..1. */
  const wing = (sx: number, sy: number, s: number, far: boolean, reach: number) => {
    const base = far ? sh(PLUME, 0.7) : PLUME, cov = far ? sh(PLUME_L, 0.7) : PLUME_L;
    const wx = sx + s * reach * 0.55, wy = sy - flap * 4.5, tx = sx + s * reach, ty = sy - flap * 8 + 1.5;
    // coverts and the fan of primaries
    for (let k = 0; k < 6; k++) {
      const u = k / 5, ex = wx + (tx - wx) * 0.5 + s * 1.4 - s * u * 2.6, ey = (wy + ty) / 2 + 2.5 + u * 6.2 + flap * 1.6;
      lmb(c, [wx - s * 0.6, wy + u], [ex + s * (1.2 - u), ey + (1 - u) * 0.8 + u * 1.2 + 1.4], 1.6, 0.8, k % 2 ? base : sh(base, 1.1));
    }
    lmb(c, [sx, sy], [wx, wy], 3.0, 2.2, base); lmb(c, [wx, wy], [tx, ty], 2.2, 1.2, base);
    ell(c, (sx + wx) / 2, (sy + wy) / 2 + 1, Math.abs(wx - sx) / 2 + 1.4, 1.9, cov, Math.atan2(wy - sy, wx - sx), { ao: 0.2 });
  };
  const head = (x: number, y: number, face: "front" | "side" | "back", tilt = 0) => {
    if (face === "back") { ell(c, x, y, 1.6, 1.8, PLUME); return; }
    // ruff: ragged white feathers round the base of the neck
    for (let k = 0; k < 7; k++) fillShape(c, poly([[x - 3.4 + k * 1.1, y + 1.2], [x - 2.5 + k * 1.1, y + 1.2], [x - 3 + k * 1.1 + tilt * 0.3, y + 3.6 - (k % 2) * 0.7]]), css(RUFF));
    lmb(c, [x, y + 1.6], [x - tilt, y - 0.4], 1.6, 1.3, SKIN);
    if (face === "front") {
      ell(c, x, y - 1.4, 1.9, 2.3, SKIN);
      fillShape(c, poly([[x - 1, y - 0.4], [x + 1, y - 0.4], [x, y + 2.2]]), css(BEAK)); line(c, [[x, y - 0.4], [x, y + 2.2]], sh(BEAK, 0.5), 0.3);
      for (const sd of [-1, 1]) { fillShape(c, ellipseP(x + sd * 1.0, y - 1.6, 0.5, 0.4), css(0x100806)); fillShape(c, ellipseP(x + sd * 1.0, y - 1.7, 0.2, 0.2), css(0xffd070)); }
    } else {
      ell(c, x, y - 1.2, 2.2, 2.0, SKIN);
      fillShape(c, poly([[x + 1.6, y - 2.0], [x + 4.6, y - 0.4 + tilt * 0.3], [x + 3.4, y + 0.8], [x + 1.6, y + 0.6]]), css(BEAK)); // hooked bill
      fillShape(c, poly([[x + 4.2, y - 0.5], [x + 4.7, y + 0.4], [x + 3.9, y + 0.9]]), css(sh(BEAK, 0.55)));
      fillShape(c, ellipseP(x + 0.8, y - 1.6, 0.55, 0.45), css(0x100806)); fillShape(c, ellipseP(x + 0.7, y - 1.7, 0.22, 0.2), css(0xffd070));
    }
  };
  const claws = (x: number, y: number, reach: number) => { lmb(c, [x, y], [x + reach * 0.3, y + 3 + reach], 1.2, 0.8, TALON); for (const o of [-1, 0, 1]) line(c, [[x + reach * 0.3, y + 3 + reach], [x + reach * 0.3 + o * 1.1, y + 4.8 + reach]], TALON, 0.45); };
  if (dir === "right") {
    const bx = w / 2 + (strike ? 2 : wind ? -1.4 : 0), by = g - lift - 7 + (wind ? 0.8 : 0);
    wing(bx - 1, by - 2, -1, true, 8); // far wing, behind
    lmb(c, [bx - 5, by + 1.6], [bx - 9 + (step ? 0 : 1), by + 6], 3.2, 1.2, PLUME); lmb(c, [bx - 9, by + 5], [bx - 8, by + 7.5], 1.2, 0.8, PLUME_L); // tail
    ell(c, bx, by, 6.4, 3.8, PLUME, -0.2); ell(c, bx + 1.2, by + 1.4, 3.6, 2.4, PLUME_L, -0.2, { ao: 0.1 });
    claws(bx + 1, by + 3, strike ? 2.4 : wind ? -0.6 : 0.6); claws(bx - 1.4, by + 3.4, strike ? 2.2 : 0.4);
    head(bx + 7.4, by - 2.6 + (strike ? 1.6 : 0), "side", 1);
    wing(bx + 0.5, by - 2.4, -1, false, 9.5);
  } else {
    const cx = w / 2, by = g - lift - 7 + (strike ? 1 : 0), face = dir === "down" ? "front" : "back";
    wing(cx - 2, by - 2, -1, false, 13); wing(cx + 2, by - 2, 1, false, 13);
    if (dir === "up") { lmb(c, [cx, by + 3], [cx, by + 8], 4, 2.4, PLUME); for (const o of [-1.6, 0, 1.6]) line(c, [[cx + o * 0.6, by + 7], [cx + o * 1.3, by + 10]], PLUME_L, 0.7); }
    ell(c, cx, by, 4.2, 5.2, PLUME); ell(c, cx, by + 1.2, 2.6, 3.0, dir === "down" ? PLUME_L : PLUME, 0, { ao: 0.1 });
    if (dir === "down") { claws(cx - 1.6, by + 4.4, strike ? 3 : wind ? -0.6 : 0.5); claws(cx + 1.6, by + 4.4, strike ? 3 : 0.5); }
    head(cx, by - 5.6 + (strike ? 1.4 : 0), face);
  }
}

// ------------------------------------------------------------------ the giant rattlesnake
const SCALE = 0xb0763c, SCALE_D = 0x5a3418, DIAMOND = 0x3e220e, BELLY = 0xe8cfa0, RATTLE = 0xe4d6a8;

/**
 * A giant rattlesnake the length of a man: sand-red scales with dark diamonds, a pale belly, a wedge head with slit
 * eyes. It coils low with the head raised; the tail ends in a buzzing rattle. Wind-up draws the head back, strike lunges.
 */
export function paintRattler(c: C2, sc: C2 | null, dir: Dir, pose: Pose, f: number) {
  const w = RATTLER_W, h = RATTLER_H, g = h - 3, step = pose === "step", wind = pose === "wind", strike = pose === "strike", S = sc ?? c;
  const seg = (x: number, y: number, r: number, k: number) => { // one body ring: dark rim, lit scales, a diamond on the back
    ell(c, x, y, r, r * 0.86, k % 2 ? sh(SCALE, 0.94) : SCALE, 0, { ao: 0.25, spec: 0.25 });
    fillShape(c, poly([[x, y - r * 0.55], [x + r * 0.5, y], [x, y + r * 0.4], [x - r * 0.5, y]]), css(DIAMOND, 0.85));
  };
  const rattle = (x: number, y: number, up: number) => { for (let k = 0; k < 3; k++) ell(c, x + (step ? 0.4 : -0.4) * k, y - up * k * 1.1, 1.2 - k * 0.12, 1.0, k % 2 ? RATTLE : sh(RATTLE, 0.85), 0, { ao: 0.2 }); };
  const head = (x: number, y: number, ang: number, open: number) => { // wedge head, seen from the side along `ang`
    const ux = Math.cos(ang), uy = Math.sin(ang), px = -uy, py = ux;
    const P2 = (a: number, b: number): P => [x + ux * a + px * b, y + uy * a + py * b];
    fillShape(c, poly([P2(-2.4, -1.6), P2(2.8, -1.0), P2(3.6, 0.2), P2(2.6, 1.2), P2(-2.4, 1.8)]), css(sh(SCALE, 0.34)));
    vol(c, poly([P2(-2.2, -1.4), P2(2.6, -0.8), P2(3.3, 0.1), P2(2.4, 1.0), P2(-2.2, 1.6)]), SCALE, [x - 3, y - 3, 6, 6], { ao: 0.3, spec: 0.3 });
    if (open > 0) { fillShape(c, poly([P2(2.6, 0.9), P2(5.4 + open, 2.2 + open * 0.8), P2(2.2, 1.9)]), css(0xd8506a)); for (const b of [-0.4, 0.6]) fillShape(c, poly([P2(3 + b, 1.0), P2(3.5 + b, 1.0), P2(3.2 + b, 2.6 + open * 0.3)]), css(TOOTH)); }
    const e = P2(1.2, -0.5); fillShape(c, ellipseP(e[0], e[1], 0.6, 0.45), css(0xe8c030)); fillShape(c, ellipseP(e[0], e[1], 0.15, 0.4), css(0x120804));
    const t = P2(3.6, 0.3); line(c, [t, P2(5.4, 0.3 + (step ? 0.3 : -0.2)), P2(6.4, 0.9)], 0xc0204a, 0.28);
  };
  /** A spine (list of ring centres, tail first): drawn tail to head so the head end overlaps. */
  const body = (pts: P[], r0: number, r1: number) => { pts.forEach(([x, y], i) => seg(x, y, r0 + (r1 - r0) * (i / (pts.length - 1)), i)); };
  if (dir === "right") {
    const cx = w * 0.42, by = g - 2;
    shadow(S, cx + 1, g + 0.2, 12, 2.4);
    // the coiled tail end on the left, rising into an S and the raised neck
    const hx = cx + 7.6 + (strike ? 5.5 : wind ? -3 : 0), hyy = by - (strike ? 4.2 : wind ? 10.5 : 8.4) + (step ? 0.6 : 0);
    const neck: P[] = [];
    for (let i = 0; i <= 7; i++) { const u = i / 7; neck.push([cx + 2.4 + (hx - cx - 2.4) * u + Math.sin(u * Math.PI) * (wind ? -3.4 : 1.2), by - 1 + (hyy - by + 1) * (u ** (strike ? 1 : 1.5)) ]); }
    const coil: P[] = [[cx - 8, by - 1], [cx - 6.4, by - 0.6], [cx - 4.2, by - 1], [cx - 2, by - 1.4], [cx, by - 1.6], [cx + 2.4, by - 1]];
    body(coil, 1.7, 2.4);
    ell(c, cx - 3.6, by - 0.4, 6.2, 2.6, SCALE, 0, { ao: 0.3 }); ell(c, cx - 3.6, by + 0.4, 5.2, 1.4, BELLY, 0, { ao: 0.1 });
    for (let k = 0; k < 4; k++) fillShape(c, poly([[cx - 6.8 + k * 2.4, by - 1.8], [cx - 5.6 + k * 2.4, by - 0.6], [cx - 6.8 + k * 2.4, by + 0.6], [cx - 8 + k * 2.4, by - 0.6]]), css(DIAMOND, 0.85));
    ell(c, cx - 11, by - 1.2 + (step ? 0.3 : 0), 2.4, 1.6, SCALE_D); rattle(cx - 13, by - 2.4, 0.4); // the tail end and its rattle
    body(neck, 2.4, 2.0);
    head(hx + 1.2, hyy, strike ? 0.1 : wind ? 0.35 : 0.5, wind ? 2.2 : strike ? 3 : 0.3);
  } else if (dir === "down") {
    const cx = w / 2, by = g - 2;
    shadow(S, cx, g + 0.2, 11, 3.2);
    // a flat spiral of coils seen from the front, the neck rising from its middle toward us
    ell(c, cx, by - 1.2, 9.6, 3.8, SCALE_D); ell(c, cx, by - 1.6, 9.4, 3.6, SCALE, 0, { ao: 0.3 });
    ell(c, cx, by - 1.6, 6.4, 2.4, sh(SCALE, 0.78), 0, { ao: 0.2 });
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; fillShape(c, poly([[cx + Math.cos(a) * 8.2, by - 1.7 + Math.sin(a) * 2.8 - 0.8], [cx + Math.cos(a) * 8.2 + 0.9, by - 1.7 + Math.sin(a) * 2.8], [cx + Math.cos(a) * 8.2, by - 1.7 + Math.sin(a) * 2.8 + 0.8], [cx + Math.cos(a) * 8.2 - 0.9, by - 1.7 + Math.sin(a) * 2.8]]), css(DIAMOND, 0.85)); }
    rattle(cx + 8.6, by - 2.6, 0.7);
    const hy = by - (wind ? 12 : strike ? 4.6 : 9) + (step ? 0.6 : 0), hsw = Math.sin(f * 1.1) * 0.5;
    for (let i = 0; i < 6; i++) { const u = i / 5; seg(cx + hsw * u, by - 2 + (hy - by + 2) * u, 2.6 - u * 0.5, i); }
    // a hooded-wedge head facing the viewer
    const hx = cx + hsw, open = wind ? 2 : strike ? 3 : 0.2;
    ell(c, hx, hy, 3.4, 2.7, SCALE, 0, { ao: 0.3, spec: 0.3 });
    fillShape(c, poly([[hx - 1.2, hy - 0.2], [hx + 1.2, hy - 0.2], [hx, hy + 1.6]]), css(sh(SCALE, 0.7)));
    if (open > 0.5) { fillShape(c, ellipseP(hx, hy + 1.8, 1.8, 0.8 + open * 0.4), css(0xd8506a)); for (const sd of [-1, 1]) fillShape(c, poly([[hx + sd * 1.3 - 0.3, hy + 1.2], [hx + sd * 1.3 + 0.3, hy + 1.2], [hx + sd * 1.3, hy + 3.2 + open * 0.3]]), css(TOOTH)); }
    for (const sd of [-1, 1]) { fillShape(c, ellipseP(hx + sd * 1.6, hy - 0.9, 0.62, 0.42), css(0xe8c030)); fillShape(c, ellipseP(hx + sd * 1.6, hy - 0.9, 0.14, 0.4), css(0x120804)); }
    line(c, [[hx, hy + 1.8], [hx + (step ? 0.5 : -0.5), hy + 3.4 + open * 0.5], [hx + 1, hy + 4.2 + open * 0.5]], 0xc0204a, 0.28);
  } else {
    const cx = w / 2, by = g - 2;
    shadow(S, cx, g + 0.2, 11, 3.2);
    ell(c, cx, by - 1.2, 9.6, 3.8, SCALE_D); ell(c, cx, by - 1.6, 9.4, 3.6, SCALE, 0, { ao: 0.3 });
    ell(c, cx, by - 1.6, 6.2, 2.3, sh(SCALE, 0.78), 0, { ao: 0.2 });
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, x = cx + Math.cos(a) * 8.2, y = by - 1.7 + Math.sin(a) * 2.8; fillShape(c, poly([[x, y - 0.8], [x + 0.9, y], [x, y + 0.8], [x - 0.9, y]]), css(DIAMOND, 0.85)); }
    // from behind: the head peeks over the coil, the rattle shivers high in the foreground
    const hy = by - (wind ? 10 : strike ? 6 : 8.2);
    for (let i = 0; i < 4; i++) { const u = i / 3; seg(cx, by - 3 + (hy - by + 3) * u, 2.4, i); }
    ell(c, cx, hy - 0.4, 2.8, 2.2, sh(SCALE, 0.9), 0, { ao: 0.3 });
    const sh1 = Math.sin(f * 2.2) * 0.9;
    for (let k = 0; k < 4; k++) ell(c, cx + 4 + sh1 * (k / 3), by - 3.4 - k * 1.5, 1.4 - k * 0.1, 1.1, k % 2 ? RATTLE : sh(RATTLE, 0.85), 0, { ao: 0.2 });
  }
}
