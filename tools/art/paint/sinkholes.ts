import { C2, P, css, ellipseP, fillShape, line, poly, sh, vol } from "./brush";

/**
 * Act 5 (Mawdeep Sinkholes) monsters that are not Hide-Kin: the Gullet Worm, a pale, ringed burrower that
 * rears out of a mound of spoil with its toothed maw opened. Drawn in world px on a w x h frame (paint/mobs.ts sheet
 * mob_sinkworm), 12 frames like every monster: 0-1 down, 2-3 up, 4-5 right (second = step), then wind-up and strike per facing.
 */
export const SINKWORM_W = 32, SINKWORM_H = 28;
type Dir = "down" | "up" | "right";
type Pose = "stand" | "step" | "wind" | "strike";

const FLESH = 0xcdbba2, FLESH_D = 0x7a6450, RING = 0x8a7260, MAW = 0x8a2a34, MAW_D = 0x3a1018, TOOTH = 0xf0e6c8, DIRT = 0x5a4636, DIRT_L = 0x7a6248, MOSS = 0x5a6a34;

const shadow = (S: C2, x: number, y: number, rx: number, ry: number) => { S.save(); S.translate(x, y); S.scale(1, ry / rx); S.fillStyle = "rgba(0,0,0,0.42)"; S.beginPath(); S.arc(0, 0, rx, 0, Math.PI * 2); S.fill(); S.restore(); };
const ell = (c: C2, x: number, y: number, rx: number, ry: number, col: number, rot = 0, o: { ao?: number; spec?: number } = {}) => {
  fillShape(c, ellipseP(x, y, rx + 0.4, ry + 0.4, rot), css(sh(col, 0.34)));
  vol(c, ellipseP(x, y, rx, ry, rot), col, [x - rx, y - ry, rx * 2, ry * 2], { ao: o.ao ?? 0.3, spec: o.spec ?? 0.2 });
};

/** The heap of loose earth the worm rises from, with a few stones and a patch of moss. */
function mound(c: C2, cx: number, g: number, rx: number) {
  ell(c, cx, g - 1.2, rx, 2.6, DIRT, 0, { ao: 0.35, spec: 0.05 });
  ell(c, cx - rx * 0.45, g - 2.2, rx * 0.4, 1.3, DIRT_L, 0, { ao: 0.2, spec: 0.05 });
  fillShape(c, ellipseP(cx + rx * 0.5, g - 2.4, 1.6, 0.8), css(MOSS));
  for (const [dx, dy] of [[-rx * 0.8, -0.2], [rx * 0.75, 0.2], [rx * 0.2, 0.9]]) ell(c, cx + dx, g + dy, 0.9, 0.6, 0x6a6258, 0, { ao: 0.3 });
}

/** One body ring: a lit pale band with a dark crease below it. */
function ring(c: C2, x: number, y: number, rx: number, ry: number, k: number) {
  ell(c, x, y, rx, ry, k % 2 ? sh(FLESH, 0.92) : FLESH, 0, { ao: 0.3, spec: 0.3 });
  line(c, [[x - rx * 0.85, y + ry * 0.55], [x, y + ry * 0.85], [x + rx * 0.85, y + ry * 0.55]], RING, 0.3, 0.8);
}

/** A round toothed maw seen head on: dark throat, three nested rings of teeth, spiralling inward. */
function frontMaw(c: C2, x: number, y: number, r: number, open: number, f: number) {
  ell(c, x, y, r, r * 0.92, FLESH_D, 0, { ao: 0.2, spec: 0.1 });
  const m = r * (0.62 + open * 0.07);
  fillShape(c, ellipseP(x, y + 0.2, m, m * 0.92), css(MAW));
  fillShape(c, ellipseP(x, y + 0.4, m * 0.55, m * 0.5), css(MAW_D));
  for (let ringI = 0; ringI < 2; ringI++) {
    const rr = m * (1 - ringI * 0.42), n = 9 - ringI * 2;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + ringI * 0.4 + Math.sin(f * 0.7) * 0.06, bx = x + Math.cos(a) * rr, by = y + 0.2 + Math.sin(a) * rr * 0.92;
      fillShape(c, poly([[bx - Math.sin(a) * 0.55, by + Math.cos(a) * 0.5], [bx + Math.sin(a) * 0.55, by - Math.cos(a) * 0.5], [bx - Math.cos(a) * (1.5 + open * 0.2), by - Math.sin(a) * (1.5 + open * 0.2)]]), css(TOOTH));
    }
  }
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.3; line(c, [[x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.74], [x + Math.cos(a) * (r + 0.1), y + Math.sin(a) * (r * 0.92 + 0.1)]], RING, 0.3, 0.8); }
}

/** The Gullet Worm: bone-pale and ringed, no eyes, a round maw of rings of teeth. Wind-up draws it up and back, strike dives the maw forward. */
export function paintSinkworm(c: C2, sc: C2 | null, dir: Dir, pose: Pose, f: number) {
  const w = SINKWORM_W, g = SINKWORM_H - 3, step = pose === "step", wind = pose === "wind", strike = pose === "strike", S = sc ?? c;
  const sway = Math.sin(f * 1.1) * 0.7;
  if (dir === "right") {
    const cx = w * 0.4;
    shadow(S, cx + 1, g + 0.2, 13, 2.6);
    mound(c, cx, g, 9);
    // the column: an S-curve of rings from the mound, the head leaning right (back on wind-up, forward and low on strike)
    const top: P = [cx + (strike ? 11 : wind ? -3 : 3.5) + sway, g - (strike ? 11.5 : wind ? 20 : 17) + (step ? 0.7 : 0)];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), bend = Math.sin(u * Math.PI) * (wind ? -3 : strike ? 1.5 : -1.2);
      const x = cx - 0.5 + (top[0] - cx + 0.5) * (u * u) + bend, y = g - 2.5 + (top[1] - g + 2.5) * u;
      ring(c, x, y, 4.6 - u * 0.8 + (i === 0 ? 1.4 : 0), 1.9, i);
    }
    // the head: a blunt tip with the maw open toward the right, seen edge-on as a dark cup of teeth
    const hx = top[0], hy = top[1], tilt = strike ? 0.35 : wind ? -0.6 : -0.15, open = wind ? 2.4 : strike ? 3.2 : 1.3;
    ell(c, hx, hy, 4.4, 3.8, FLESH, tilt, { ao: 0.3, spec: 0.3 });
    const mx = hx + 3.2 + (strike ? 0.8 : 0), my = hy + 0.3;
    fillShape(c, ellipseP(mx, my, 1.8 + open * 0.15, 2.5 + open * 0.55, tilt), css(sh(FLESH_D, 0.6)));
    fillShape(c, ellipseP(mx + 0.3, my, 1.3, 2.0 + open * 0.45, tilt), css(MAW));
    fillShape(c, ellipseP(mx + 0.7, my, 0.7, 1.2 + open * 0.3, tilt), css(MAW_D));
    for (let k = 0; k < 5; k++) { const a = (k - 2) / 2 * (0.9 + open * 0.08), ty = my + Math.sin(a) * (2.3 + open * 0.5), tx = mx - 0.2 + Math.cos(a) * 0.4;
      fillShape(c, poly([[tx, ty - 0.45], [tx, ty + 0.45], [tx + 1.7, ty]]), css(TOOTH)); }
    line(c, [[hx - 1.8, hy - 2.8], [hx - 2.6, hy + 2.6]], RING, 0.3, 0.8);
    line(c, [[hx + 0.4, hy - 3.2], [hx - 0.4, hy + 3.4]], RING, 0.3, 0.7);
  } else if (dir === "down") {
    const cx = w / 2;
    shadow(S, cx, g + 0.2, 12, 3);
    mound(c, cx, g, 10);
    const hy = g - (wind ? 17 : strike ? 9 : 13.5) + (step ? 0.6 : 0), hx = cx + sway;
    const n = 6;
    for (let i = 0; i < n; i++) { const u = i / (n - 1); ring(c, cx + (hx - cx) * u, g - 2 + (hy - g + 2) * u, 5.4 - u * 0.8, 2.2, i); }
    const r = (wind ? 5.6 : strike ? 7.2 : 6.4);
    frontMaw(c, hx, hy, r, wind ? 1 : strike ? 3 : 0, f);
  } else {
    const cx = w / 2;
    shadow(S, cx, g + 0.2, 12, 3);
    mound(c, cx, g, 10);
    const hy = g - (wind ? 17 : strike ? 10 : 13.5), hx = cx + sway;
    const n = 7;
    for (let i = 0; i < n; i++) { const u = i / (n - 1); ring(c, cx + (hx - cx) * u, g - 2 + (hy - g + 2) * u, 5.4 - u * 0.5, 2.2, i); }
    ell(c, hx, hy - 0.6, 5.0, 3.6, FLESH, 0, { ao: 0.35, spec: 0.35 }); // the blind, domed back of the head
    for (let k = -2; k <= 2; k++) line(c, [[hx + k * 1.5, hy - 3.2], [hx + k * 1.9, hy + 1.6]], RING, 0.26, 0.6);
    fillShape(c, ellipseP(hx - 2, hy - 1.6, 0.9, 0.5), css(MOSS, 0.8));
  }
}
