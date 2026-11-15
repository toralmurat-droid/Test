import { C2, P, blobPath, css, curve, ellipseP, fillShape, glow, limb, line, mix, poly, sh, vol, rng } from "./brush";

/**
 * Act 3 (Grey Barrow Moors) monsters that are not men: the Bone Hound and the Mist Wraith. Drawn in world px on a
 * w x h frame (paint/mobs.ts sheets mob_bonehound, mob_mistwraith), 12 frames like every monster:
 * 0-1 down, 2-3 up, 4-5 right (second = step), then wind-up and strike per facing.
 */
export const HOUND_W = 30, HOUND_H = 22, WRAITH_W = 28, WRAITH_H = 38;
type Dir = "down" | "up" | "right";
type Pose = "stand" | "step" | "wind" | "strike";

const BONE = 0xd8d2bc, HIDE = 0x2c2420, BRONZE = 0x8a6a30, EYE = 0x8fd8ff;

// ------------------------------------------------------------------ the Bone Hound
/** A skeletal hound, low and fast: bare bone, scraps of dark hide on the haunch, a bronze collar with a chain stub, faint cold eyes. */
export function paintHound(c: C2, sc: C2 | null, dir: Dir, pose: Pose, f: number) {
  const w = HOUND_W, h = HOUND_H, g = h - 3, step = pose === "step", wind = pose === "wind", strike = pose === "strike";
  const S = sc ?? c;
  const shadow = (x: number, y: number, rx: number, ry: number) => { S.save(); S.translate(x, y); S.scale(1, ry / rx); S.fillStyle = "rgba(0,0,0,0.42)"; S.beginPath(); S.arc(0, 0, rx, 0, Math.PI * 2); S.fill(); S.restore(); };
  const bone = (a: P, b: P, wa: number, wb = wa, col = BONE) => { limb(c, a, b, wa + 0.45, wb + 0.45, sh(col, 0.4)); limb(c, a, b, wa, wb, col); };
  const knob = (p: P, r: number, col = BONE) => vol(c, ellipseP(p[0], p[1], r, r), col, [p[0] - r, p[1] - r, r * 2, r * 2], { ao: 0.3, spec: 0.3 });
  const scrap = (pts: P[], col = HIDE) => { const s = blobPath(pts); vol(c, s, col, [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), 6, 5], { ao: 0.3 }); };
  /** One leg: hip -> knee -> hock -> paw, the paw pushed forward (+) or back (-) by `s`, lifted by `lift`. */
  const leg = (hip: P, s: number, lift: number, far: boolean, hind: boolean, sgn = 1) => {
    const col = far ? sh(BONE, 0.68) : BONE, fx = hip[0] + sgn * s * 2.6, fy = g - lift, kx = hip[0] + sgn * (hind ? -1.4 : 0.9) + s * sgn * 0.8, ky = (hip[1] + fy) / 2 + 0.4;
    bone(hip, [kx, ky], 1.25, 0.9, col); bone([kx, ky], [fx, fy - 0.7], 0.85, 0.6, col); knob([kx, ky], 0.65, col);
    for (const t of [-0.5, 0.1, 0.7]) line(c, [[fx, fy - 0.5], [fx + sgn * 0.9 + t * 0.2, fy + 0.2 + Math.abs(t) * 0.1]], sh(col, 0.7), 0.35);
  };
  const eyeAt = (x: number, y: number, r = 0.55) => { fillShape(c, ellipseP(x, y, r + 0.3, r + 0.2), css(0x0a1014)); glow(c, x, y, 1.3, EYE, 0.55); fillShape(c, ellipseP(x, y, r * 0.5, r * 0.5), css(mix(EYE, 0xffffff, 0.7))); };

  if (dir === "right") {
    const bx = w * 0.5 + (strike ? 1.6 : wind ? -1.2 : 0), hy = g - 8.6 - (wind ? -0.9 : 0), sw = step ? 1 : -1;
    shadow(bx, g + 0.3, 11, 2.2);
    // far legs
    const fs = strike ? 1.2 : wind ? -0.4 : sw, hs = strike ? -1.4 : wind ? 0.2 : -sw;
    leg([bx + 4.2, hy + 1.0], -fs * 0.8, step ? 1.5 : 0, true, false); leg([bx - 4.6, hy + 0.8], -hs * 0.8, step ? 0 : 1.5, true, true);
    // tail: a chain of small bones curling up behind
    const tl: P[] = [[bx - 6.2, hy - 0.2], [bx - 8.0, hy - 2.0 + (step ? 0.5 : 0)], [bx - 9.6, hy - 2.0 + (step ? 1 : 0)], [bx - 10.8, hy - 0.8]];
    for (let i = 0; i < 3; i++) bone(tl[i], tl[i + 1], 0.9 - i * 0.2, 0.7 - i * 0.2);
    // spine, ribcage, pelvis
    const sp: P[] = [[bx - 5.4, hy - 0.4], [bx - 2.6, hy - 1.7], [bx + 0.6, hy - 1.9], [bx + 3.8, hy - 0.8]];
    for (let i = 0; i < 4; i++) { const a = i < 3 ? sp[i] : sp[3]; if (i < 3) bone(a, sp[i + 1], 1.0); }
    for (let k = 0; k < 5; k++) { const x = bx - 3.4 + k * 1.75, y = hy - 1.8 + (k === 0 || k === 4 ? 0.4 : 0); curve(c, [x, y], [x + 0.7, y + 3.2 - Math.abs(k - 2) * 0.35], [x + 0.3, y + 4.2 - Math.abs(k - 2) * 0.5], sh(BONE, 0.45), 0.85, 1); curve(c, [x, y], [x + 0.7, y + 3.2 - Math.abs(k - 2) * 0.35], [x + 0.3, y + 4.2 - Math.abs(k - 2) * 0.5], BONE, 0.5, 1); }
    vol(c, blobPath([[bx - 6.4, hy - 0.8], [bx - 3.8, hy - 1.2], [bx - 3.2, hy + 1.6], [bx - 5.4, hy + 2.4], [bx - 7.0, hy + 1.2]]), BONE, [bx - 7, hy - 1.2, 4, 3.6], { ao: 0.35 });
    // hide scraps hanging off the haunch and the shoulder
    scrap([[bx - 6.4, hy - 1.0], [bx - 3.2, hy - 1.6], [bx - 3.0, hy + 1.8], [bx - 4.2, hy + 3.0], [bx - 5.2, hy + 1.6], [bx - 6.6, hy + 3.2], [bx - 7.2, hy + 1.0]]);
    scrap([[bx + 2.2, hy - 1.4], [bx + 4.8, hy - 0.8], [bx + 4.4, hy + 1.8], [bx + 3.2, hy + 1.0], [bx + 2.4, hy + 2.4]], 0x3a2e28);
    // near legs
    leg([bx + 4.0, hy + 1.2], fs, step ? 0 : 1.6, false, false); leg([bx - 4.4, hy + 1.0], hs, step ? 1.6 : 0, false, true);
    // neck and head
    const hd: P = [bx + 8.6 + (strike ? 1.8 : 0), hy - (wind ? 0.2 : 1.6) + (strike ? 1.0 : 0)];
    bone([bx + 3.6, hy - 0.8], [hd[0] - 1.2, hd[1] + 0.4], 1.4, 1.2);
    for (let k = 0; k < 3; k++) { const q = (k + 1) / 4; knob([bx + 3.6 + (hd[0] - 1.2 - bx - 3.6) * q, hy - 0.8 + (hd[1] + 0.4 - hy + 0.8) * q - 0.6], 0.5); }
    const open = wind ? 1.9 : strike ? 2.4 : 0.5 + (step ? 0.2 : 0);
    // lower jaw, then cranium and muzzle
    bone([hd[0] - 0.6, hd[1] + 1.2], [hd[0] + 4.0, hd[1] + 1.2 + open], 1.0, 0.7);
    for (let k = 0; k < 4; k++) fillShape(c, poly([[hd[0] + 1.2 + k * 0.7, hd[1] + 1.1 + open * (0.3 + k * 0.17)], [hd[0] + 1.6 + k * 0.7, hd[1] + 1.1 + open * (0.3 + k * 0.17)], [hd[0] + 1.4 + k * 0.7, hd[1] + 0.3 + open * (0.3 + k * 0.17)]]), css(0xf0ead6));
    vol(c, blobPath([[hd[0] - 2.2, hd[1] - 0.4], [hd[0] - 1.2, hd[1] - 2.0], [hd[0] + 1.0, hd[1] - 2.2], [hd[0] + 2.0, hd[1] - 1.2], [hd[0] + 5.0, hd[1] - 0.6], [hd[0] + 5.2, hd[1] + 0.6], [hd[0] + 1.0, hd[1] + 1.4], [hd[0] - 1.8, hd[1] + 1.2]]), BONE, [hd[0] - 2.2, hd[1] - 2.2, 7.4, 3.8], { ao: 0.35, spec: 0.3 });
    for (let k = 0; k < 4; k++) fillShape(c, poly([[hd[0] + 1.6 + k * 0.8, hd[1] + 0.7], [hd[0] + 2.0 + k * 0.8, hd[1] + 0.7], [hd[0] + 1.8 + k * 0.8, hd[1] + 1.5]]), css(0xf0ead6));
    fillShape(c, ellipseP(hd[0] + 5.0, hd[1] - 0.1, 0.45, 0.4), css(0x1a1614)); // nose hole
    eyeAt(hd[0] + 1.1, hd[1] - 0.7);
    fillShape(c, poly([[hd[0] - 1.6, hd[1] - 1.6], [hd[0] - 2.6, hd[1] - 4.2], [hd[0] - 0.4, hd[1] - 2.0]]), css(sh(BONE, 0.8))); // ear
    // the collar and its chain stub
    const cl: P = [bx + 5.0, hy - 0.4];
    bone([cl[0] - 0.6, cl[1] - 0.8], [cl[0] + 0.5, cl[1] + 1.0], 1.0, 1.0, BRONZE);
    const swing = Math.sin(f * 1.3) * 0.5;
    for (let k = 0; k < 3; k++) fillShape(c, ellipseP(cl[0] + 0.6 + swing * (k / 2), cl[1] + 1.6 + k * 0.8, 0.38, 0.5), css(k % 2 ? 0x9a7a3a : 0x6a5224));
  } else if (dir === "down") {
    const cx = w / 2, hy = g - 6.2 + (strike ? 0.8 : wind ? -0.6 : 0), sw = step ? 1 : -1;
    shadow(cx, g - 1.2, 9, 3);
    // body behind the head: ribcage and spine up the screen, haunches, tail
    for (const sd of [-1, 1]) leg([cx + sd * 3.0, hy - 6.6], sd * sw * 0.3, 0, true, true, sd);
    const tailTop = hy - 10.8;
    bone([cx, hy - 8.4], [cx + 0.6, tailTop + 1], 0.8, 0.6); bone([cx + 0.6, tailTop + 1], [cx - 0.4, tailTop - 0.8 + (step ? 0.5 : 0)], 0.6, 0.45);
    vol(c, blobPath([[cx - 3.2, hy - 8.8], [cx + 3.2, hy - 8.8], [cx + 2.4, hy - 6.2], [cx - 2.4, hy - 6.2]]), BONE, [cx - 3.2, hy - 9, 6.4, 3], { ao: 0.35 });
    for (let k = 0; k < 4; k++) { const y = hy - 6.0 + k * -0.001 - k * 0.0; const yy = hy - 6.2 + k * 1.0 - 3.0 + 0.2; for (const sd of [-1, 1]) curve(c, [cx, yy], [cx + sd * (3.0 - Math.abs(k - 1.5) * 0.35), yy - 0.2], [cx + sd * (2.6 - Math.abs(k - 1.5) * 0.3), yy + 1.2], sh(BONE, 0.5), 0.8); void y; }
    bone([cx, hy - 8.0], [cx, hy - 2.4], 1.0);
    scrap([[cx - 3.3, hy - 8.6], [cx - 0.4, hy - 8.0], [cx - 0.6, hy - 5.6], [cx - 1.8, hy - 4.6], [cx - 3.0, hy - 5.4]]);
    // forelegs, then the head with the collar under it
    for (const sd of [-1, 1]) leg([cx + sd * 2.5, hy - 3.2], sd * sw * 0.4 * (strike ? 0 : 1), (sd * sw > 0 ? 1.1 : 0), false, false, sd);
    bone([cx - 2.4, hy - 3.6], [cx + 2.4, hy - 3.6], 1.0);
    bone([cx, hy - 3.4], [cx, hy - 1.0], 1.5, 1.3);
    bone([cx - 1.4, hy - 0.6], [cx + 1.4, hy - 0.6], 1.1, 1.1, BRONZE);
    const open = wind ? 1.9 : strike ? 2.2 : 0.4;
    vol(c, blobPath([[cx - 2.0, hy + 1.2 + open], [cx + 2.0, hy + 1.2 + open], [cx + 1.2, hy + 2.4 + open], [cx - 1.2, hy + 2.4 + open]]), sh(BONE, 0.9), [cx - 2, hy + 1 + open, 4, 1.6], { ao: 0.3 });
    vol(c, blobPath([[cx - 2.5, hy - 1.0], [cx - 1.6, hy - 2.5], [cx + 1.6, hy - 2.5], [cx + 2.5, hy - 1.0], [cx + 1.6, hy + 1.2], [cx + 1.0, hy + 2.6], [cx - 1.0, hy + 2.6], [cx - 1.6, hy + 1.2]]), BONE, [cx - 2.5, hy - 2.5, 5, 5.2], { ao: 0.35, spec: 0.3 });
    for (const sd of [-1, 1]) { fillShape(c, poly([[cx + sd * 1.6, hy - 2.2], [cx + sd * 2.9, hy - 4.2], [cx + sd * 2.6, hy - 1.6]]), css(sh(BONE, 0.8))); eyeAt(cx + sd * 1.15, hy - 0.5, 0.5); }
    fillShape(c, poly([[cx - 0.7, hy + 0.5], [cx + 0.7, hy + 0.5], [cx, hy + 1.4]]), css(0x1a1614));
    for (let k = -2; k <= 2; k++) fillShape(c, poly([[cx + k * 0.42 - 0.2, hy + 2.3], [cx + k * 0.42 + 0.2, hy + 2.3], [cx + k * 0.42, hy + 3.1 + open * 0.4]]), css(0xf0ead6));
  } else {
    const cx = w / 2, hy = g - 6.2 + (strike ? -0.8 : wind ? 0.6 : 0), sw = step ? 1 : -1;
    shadow(cx, g - 1.2, 9, 3);
    // from behind: head peeking over the shoulders at the top, haunches and the tail nearest us
    bone([cx, hy - 12.4], [cx, hy - 9.6], 1.4, 1.2);
    vol(c, blobPath([[cx - 2.4, hy - 14.6], [cx + 2.4, hy - 14.6], [cx + 2.6, hy - 11.6], [cx, hy - 10.6], [cx - 2.6, hy - 11.6]]), BONE, [cx - 2.6, hy - 14.8, 5.2, 4.2], { ao: 0.35 });
    for (const sd of [-1, 1]) fillShape(c, poly([[cx + sd * 1.6, hy - 14.2], [cx + sd * 2.8, hy - 16.4], [cx + sd * 2.4, hy - 13.4]]), css(sh(BONE, 0.8)));
    for (const sd of [-1, 1]) leg([cx + sd * 2.5, hy - 8.4], sd * sw * 0.3, 0, true, false, sd);
    bone([cx, hy - 10.0], [cx, hy - 3.0], 1.0);
    for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) curve(c, [cx, hy - 9.4 + k * 1.1], [cx + sd * (3.0 - Math.abs(k - 1.5) * 0.35), hy - 9.6 + k * 1.1], [cx + sd * 2.6, hy - 8.2 + k * 1.1], sh(BONE, 0.5), 0.8);
    scrap([[cx - 3.2, hy - 6.6], [cx + 2.4, hy - 6.8], [cx + 2.2, hy - 4.6], [cx + 0.6, hy - 5.2], [cx - 0.4, hy - 3.8], [cx - 2.2, hy - 4.8]], 0x3a2e28);
    vol(c, blobPath([[cx - 3.4, hy - 4.6], [cx + 3.4, hy - 4.6], [cx + 2.8, hy - 1.6], [cx - 2.8, hy - 1.6]]), BONE, [cx - 3.4, hy - 4.8, 6.8, 3.4], { ao: 0.35 });
    for (const sd of [-1, 1]) leg([cx + sd * 2.6, hy - 2.6], sd * sw * 0.4, (sd * sw > 0 ? 1.1 : 0), false, true, sd);
    const tw = Math.sin(f * 1.3) * 0.8;
    bone([cx, hy - 3.8], [cx + tw, hy - 6.4], 0.9, 0.7); bone([cx + tw, hy - 6.4], [cx + tw * 1.6, hy - 8.4], 0.7, 0.5);
  }
}

// ------------------------------------------------------------------ the Mist Wraith
/**
 * A hooded shape of grey-white mist with no legs: the body tapers into a trailing tail that sways, two long thin
 * hands, a cyan core light in the chest, two cold points in the dark of the hood. It hovers above its shadow.
 */
export function paintWraith(c: C2, sc: C2 | null, dir: Dir, pose: Pose, f: number) {
  const w = WRAITH_W, h = WRAITH_H, wind = pose === "wind", strike = pose === "strike", step = pose === "step";
  const S = sc ?? c, lift = 6 + Math.sin(f * 1.7) * 1.0 + (wind ? -1 : 0);
  S.save(); S.translate(w / 2, h - 3); S.scale(1, 0.3); S.fillStyle = "rgba(0,0,0,0.3)"; S.beginPath(); S.arc(0, 0, 6.5 - lift * 0.15, 0, Math.PI * 2); S.fill(); S.restore();
  const R = dir === "right", cx = w / 2, top = h - 3 - lift - 29 + (strike ? 0.6 : 0), bot = h - 3 - lift + 1.5;
  const sway = (y: number, a: number) => Math.sin(f * 0.9 + y * 0.28) * a * ((y - top) / (bot - top)) ** 1.3;
  const lean = (y: number) => (R ? (strike ? 1.6 : wind ? -1.2 : 0) * (1 - (y - top) / (bot - top)) : 0);
  // half-width of the shape at height y: hood, shoulders, then a taper into the tail
  const half = (y: number) => { const t = (y - top) / (bot - top); return (t < 0.1 ? 1.6 + t * 20 : t < 0.2 ? 3.6 - (t - 0.1) * 6 : t < 0.32 ? 3.0 + (t - 0.2) * 30 : 6.6 * Math.pow(1 - (t - 0.32) / 0.68, 1.5) + 0.5) * (R ? 0.78 : 1); };
  const mid = (y: number) => cx + lean(y) + sway(y, step ? 2.6 : 1.8) * (R ? -1.2 : 1) + (R ? -((y - top) / (bot - top)) * 3.4 : 0);
  const edge = (side: number): P[] => { const pts: P[] = []; for (let k = 0; k <= 18; k++) { const y = top + (bot - top) * k / 18; pts.push([mid(y) + side * half(y) * (1 + 0.07 * Math.sin(k * 2.3 + f)), y]); } return pts; };
  const body = blobPath([...edge(-1), ...edge(1).reverse()]);
  const box: [number, number, number, number] = [cx - 9, top, 18, bot - top];
  // trailing wisps first (behind), then the cloak in layers: dark underlayer, pale body, light fold highlights
  const g = c.createLinearGradient(cx - 6, top, cx + 4, bot);
  g.addColorStop(0, css(0xeef4f6, 0.97)); g.addColorStop(0.45, css(0xb4c4cf, 0.93)); g.addColorStop(1, css(0x6e8294, 0.55));
  fillShape(c, body, g);
  c.save(); c.beginPath(); body(c); c.clip();
  const rr = rng(11 + (f >> 1));
  for (let k = 0; k < 9; k++) { // folds and drifting mist strands
    const x = cx - 5 + k * 1.3 + (rr() - 0.5), y0 = top + 7 + rr() * 6;
    curve(c, [mid(y0) + (x - cx) * 0.8, y0], [mid(y0 + 7) + (x - cx) * 0.9 + Math.sin(f + k) * 0.8, y0 + 7], [mid(y0 + 14) + (x - cx) * 0.4, y0 + 15], k % 3 ? 0x56687a : 0xffffff, 0.35, k % 3 ? 0.35 : 0.45);
  }
  c.restore();
  c.save(); c.beginPath(); body(c); c.strokeStyle = css(0x56687a, 0.55); c.lineWidth = 0.5; c.stroke(); c.restore();
  void box;
  // the hood's dark face-hollow, with two cold points
  const hy = top + 5.2, hx = mid(hy) + (R ? 1.6 : 0);
  if (dir !== "up") {
    fillShape(c, R ? blobPath([[hx - 1.0, hy - 2.4], [hx + 1.8, hy - 1.6], [hx + 2.2, hy + 1.4], [hx - 0.4, hy + 3.0], [hx - 1.4, hy + 0.5]]) : ellipseP(hx, hy, 2.5, 3.0), css(0x0a1218, 0.97));
    for (const x of R ? [hx + 1.0] : [hx - 1.1, hx + 1.1]) { glow(c, x, hy - 0.3, 1.6, 0x66e8ff, 0.8); fillShape(c, ellipseP(x, hy - 0.3, 0.42, 0.3), css(0xe6ffff)); }
  } else fillShape(c, ellipseP(hx, hy + 0.5, 1.8, 2.2), css(0x8ca0ae, 0.5));
  // the cyan core light in the chest
  const cy = top + 12.5, cxx = mid(cy) + (R ? 0.8 : 0), pulse = 0.75 + 0.2 * Math.sin(f * 1.1);
  glow(c, cxx, cy, 4.6, 0x3ad8ff, dir === "up" ? 0.4 : pulse); fillShape(c, ellipseP(cxx, cy, 0.95, 1.1), css(0xd8ffff, dir === "up" ? 0.5 : 0.95));
  // arms: long thin bone-pale hands with three long fingers; wind-up draws them back, strike rakes them forward
  const sy = top + 9.6, arm = (sx: number, sd: number, far: boolean) => {
    const col = far ? 0x93a4b2 : 0xd6e0e6;
    const reach = strike ? [R ? 7.5 : sd * 3.5, R ? 0.4 : 7.2] : wind ? [R ? -4.0 : sd * 6.2, -4.2] : [R ? 3.4 : sd * 4.0, 5.4 + (step ? 0.6 : 0)];
    const ex = sx + reach[0] * (far && !R ? 0.9 : 1), ey = sy + reach[1];
    const el: P = [sx + reach[0] * 0.35 + sd * 0.6, sy + reach[1] * 0.6];
    limb(c, [sx, sy], el, 1.1, 0.7, col); limb(c, el, [ex, ey], 0.7, 0.5, col);
    const ang = Math.atan2(ey - el[1], ex - el[0]);
    for (const o of [-0.45, 0, 0.45]) line(c, [[ex, ey], [ex + Math.cos(ang + o) * 3.0, ey + Math.sin(ang + o) * 3.0]], sh(col, 0.8), 0.28, 0.95);
  };
  if (R) { arm(mid(sy) - 0.4, 1, true); arm(mid(sy) + 1.2, 1, false); } else { arm(mid(sy) - half(sy) * 0.8, -1, false); arm(mid(sy) + half(sy) * 0.8, 1, false); }
}
