import { type C2, type P, blobPath, clipTo, css, curve, ellipseP, fillShape, glow, grain, limb, line, metal, mix, poly, rng, sh, vol } from "./brush";
import type { Raider } from "../../../shared/raiders";

/**
 * The Night Raiders (shared/raiders.ts): a rider in a great black cloak that floats and billows behind him, on a big
 * dark horse in a tattered caparison, with a massive weapon. Painted in world px on a RAIDER_W x RAIDER_H frame
 * (hooves on the line RAIDER_G), then pixelated by mobs.ts like every monster. Moonlight from the top-left gives the
 * black shapes a cold rim so they still read at night. Facings: down (toward us), up (away), right (side on).
 * Poses: stand / step (a gallop stride), wind (weapon raised back) and strike (the blow comes down).
 */
export const RAIDER_W = 64, RAIDER_H = 62, RAIDER_G = 55;
type Dir = "down" | "up" | "right";
type Pose = "stand" | "step" | "wind" | "strike";

const CLOAK = 0x17141c, CLOAK_DK = 0x09080b, CLOAK_HI = 0x3c3648;
const MOON = 0x9aaccc; // cold rim light
const LEATHER = 0x2a2019, WOOD = 0x2e2218, STEEL_DK = 0x3a3a40;

function moonRim(c: C2, pts: P[], a = 0.55, w = 0.45) { line(c, pts, MOON, w, a); }

/** The rider's weapon from the grip along angle `ang` (radians, screen). `swing` 0..1 bends chains and pennons. */
function weapon(c: C2, R: Raider, grip: P, ang: number, pose: Pose, f: number, far = false) {
  const u: P = [Math.cos(ang), Math.sin(ang)], n: P = [-u[1], u[0]];
  const at = (k: number, s = 0): P => [grip[0] + u[0] * k + n[0] * s, grip[1] + u[1] * k + n[1] * s];
  const M = far ? sh(R.metal, 0.7) : R.metal, trim = R.trim;
  const haft = (from: number, to: number, w = 1.15, col = WOOD) => {
    limb(c, at(from), at(to), w, w * 0.9, col);
    for (let k = from + 2; k < to - 1; k += 3.2) line(c, [at(k, -w * 0.55), at(k + 0.8, w * 0.55)], sh(trim, 0.7), 0.35, 0.8); // iron bands / wraps
  };
  switch (R.weapon) {
    case "greatsword": {
      limb(c, at(-3.5), at(1.2), 1.2, 1.1, LEATHER);
      fillShape(c, ellipseP(...at(-3.8), 1.0, 1.0), css(sh(M, 0.9)));
      limb(c, at(1.3, -3.2), at(1.3, 3.2), 1.2, 1.2, M, { metal: true }); // crossguard
      const blade = poly([at(1.8, -1.45), at(19, -1.25), at(23, 0), at(19, 1.25), at(1.8, 1.45)]);
      metal(c, blade, M, at(8, -1.5), at(8, 1.5), 0.6);
      line(c, [at(3, 0), at(19, 0)], sh(M, 0.45), 0.35, 0.9); // fuller
      line(c, [at(2.5, 1.3), at(19, 1.15), at(23, 0)], trim, 0.4, 0.95); // the ember edge
      glow(c, ...at(14, 1.2), 2.6, trim, 0.35);
      break;
    }
    case "scythe": {
      haft(-7, 21);
      // snath grip on the haft
      limb(c, at(6, 0), at(6, 2.6), 0.8, 0.8, WOOD);
      const e = at(21), d: P = [n[0] * -1, n[1] * -1];
      const blade = blobPath([e, [e[0] + d[0] * 4 + u[0] * 1.4, e[1] + d[1] * 4 + u[1] * 1.4], [e[0] + d[0] * 10 - u[0] * 2.2, e[1] + d[1] * 10 - u[1] * 2.2],
        [e[0] + d[0] * 13 - u[0] * 6, e[1] + d[1] * 13 - u[1] * 6], [e[0] + d[0] * 8 - u[0] * 0.6, e[1] + d[1] * 8 - u[1] * 0.6], [e[0] + d[0] * 2.5 - u[0] * 1.2, e[1] + d[1] * 2.5 - u[1] * 1.2]]);
      metal(c, blade, sh(M, 1.1), e, [e[0] + d[0] * 10, e[1] + d[1] * 10], 0.6);
      line(c, [[e[0] + d[0] * 2.5 - u[0] * 1.2, e[1] + d[1] * 2.5 - u[1] * 1.2], [e[0] + d[0] * 8 - u[0] * 0.6, e[1] + d[1] * 8 - u[1] * 0.6], [e[0] + d[0] * 13 - u[0] * 6, e[1] + d[1] * 13 - u[1] * 6]], 0xe8ecf4, 0.3, 0.7);
      break;
    }
    case "greataxe": {
      haft(-5, 18, 1.3);
      for (const s of [1, -1]) {
        const head = blobPath([at(13, 0.6 * s), at(11.5, 3.5 * s), at(10.2, 7.4 * s), at(15, 6.2 * s), at(19.6, 7.6 * s), at(18.2, 3.5 * s), at(17, 0.6 * s)]);
        metal(c, head, s > 0 ? M : sh(M, 0.8), at(15, 0), at(15, 7 * s), 0.5);
        line(c, [at(10.2, 7.4 * s), at(15, 6.2 * s), at(19.6, 7.6 * s)], 0xd8dce4, 0.3, 0.6);
      }
      fillShape(c, ellipseP(...at(15, 0), 1.7, 1.7), css(sh(M, 0.7)));
      limb(c, at(18), at(20.5), 1.2, 0.3, M, { metal: true }); // top spike
      break;
    }
    case "flail": {
      haft(-3, 9, 1.4);
      fillShape(c, ellipseP(...at(9.3), 1.0, 1.0), css(M));
      // the chain: hangs, trails behind on the wind-up, flies out straight on the blow
      const end: P = pose === "strike" ? at(21) : pose === "wind" ? [at(9)[0] - u[0] * 2 - 6, at(9)[1] + 3] : [at(9)[0] + 1.5, at(9)[1] + 8 + Math.sin(f * 1.3) * 0.6];
      const s0 = at(9.5);
      for (let k = 0; k <= 7; k++) {
        const t = k / 7, x = s0[0] + (end[0] - s0[0]) * t, y = s0[1] + (end[1] - s0[1]) * t + (pose === "strike" ? 0 : Math.sin(t * Math.PI) * 1.2);
        fillShape(c, ellipseP(x, y, 0.5, 0.42, ang), css(k % 2 ? sh(M, 0.6) : M));
      }
      const r = 3.0;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + 0.3; limb(c, end, [end[0] + Math.cos(a) * (r + 1.6), end[1] + Math.sin(a) * (r + 1.6)], 0.9, 0.15, sh(M, 0.85)); }
      vol(c, ellipseP(end[0], end[1], r, r), M, [end[0] - r, end[1] - r, r * 2, r * 2], { spec: 0.5, ao: 0.3 });
      // a cracked bell hangs from the haft (Ilsevar's seven bells)
      const b = at(5, 1.6);
      fillShape(c, poly([[b[0] - 1.1, b[1] + 1.8], [b[0] - 0.6, b[1]], [b[0] + 0.6, b[1]], [b[0] + 1.1, b[1] + 1.8]]), css(trim));
      break;
    }
    case "lance": {
      limb(c, at(-6), at(30), 1.5, 0.7, WOOD);
      for (let k = 4; k < 26; k += 5) line(c, [at(k, -0.7), at(k + 1.2, 0.7)], sh(trim, 0.8), 0.3, 0.9);
      const vamp = poly([at(-0.5, -0.8), at(3.6, -3.2), at(4.2, 0), at(3.6, 3.2), at(-0.5, 0.8)]);
      metal(c, vamp, M, at(2, -3), at(2, 3), 0.5);
      metal(c, poly([at(29, -1.1), at(35, 0), at(29, 1.1)]), M, at(31, -1), at(31, 1), 0.7);
      // a torn pennon under the head, snapping in the wind
      const w = Math.sin(f * 1.9) * 1.4, p0 = at(25, 0.6), p1 = at(25.8, 0.6);
      fillShape(c, poly([p0, p1, [p1[0] - u[0] * 6 + 1, p1[1] - u[1] * 6 + 5 + w], [p0[0] - u[0] * 4, p0[1] - u[1] * 4 + 3.2 + w * 0.6], [p0[0] - u[0] * 7, p0[1] - u[1] * 7 + 4.5 + w]]), css(sh(trim, 0.85)));
      break;
    }
    case "maul": {
      haft(-4, 15, 1.4);
      const head = poly([at(13.2, -4.6), at(19.4, -4.6), at(19.4, 4.6), at(13.2, 4.6)]);
      metal(c, head, sh(M, 0.9), at(16, -4.6), at(16, 4.6), 0.4);
      for (const s of [-1, 1]) line(c, [at(13.3, 3.6 * s), at(19.3, 3.6 * s)], sh(trim, 0.8), 0.55, 0.9); // straps
      for (const s of [-1, 1]) fillShape(c, ellipseP(...at(16.3, 4.8 * s), 1.1, 0.8, ang), css(sh(M, 0.6))); // studs
      grain(c, head, [Math.min(at(13, -5)[0], at(20, 5)[0]) - 2, Math.min(at(13, -5)[1], at(20, 5)[1]) - 2, 16, 16], M, 7, 30, 0.35, 0.6);
      break;
    }
    case "glaive": {
      haft(-6, 15, 1.2);
      const blade = blobPath([at(14.5, -1.0), at(18, -1.6), at(24.5, -0.6), at(28, 1.6), at(23, 2.6), at(17, 2.4), at(14.5, 1.2)]);
      metal(c, blade, M, at(20, -1.5), at(20, 2.5), 0.6);
      line(c, [at(18, -1.6), at(24.5, -0.6), at(28, 1.6)], 0xe8ecf4, 0.3, 0.7);
      limb(c, at(15.2, -1.8), at(14.2, -3.6), 0.8, 0.3, M); // back hook
      fillShape(c, ellipseP(...at(14.6), 1.3, 1.3), css(trim));
      break;
    }
  }
}

/** The floating cloak: a big dark sheet from the shoulders, billowing on the wind with a ragged hem. */
function cloakSheet(c: C2, pts: P[], hem: P[], seed: number, trim: number, box: [number, number, number, number]) {
  const shape = blobPath([...pts, ...hem]);
  const g = c.createLinearGradient(box[0], box[1], box[0] + box[2], box[1] + box[3]);
  g.addColorStop(0, css(CLOAK_HI)); g.addColorStop(0.35, css(CLOAK)); g.addColorStop(1, css(CLOAK_DK));
  fillShape(c, shape, g);
  // deep folds running down to the hem, a sheen on each ridge
  const r = rng(seed);
  clipTo(c, shape, () => {
    for (let i = 0; i < 7; i++) {
      const t = (i + 0.5) / 7, a = pts[Math.min(pts.length - 1, Math.floor(t * pts.length))], b = hem[Math.min(hem.length - 1, Math.floor((1 - t) * hem.length))];
      curve(c, a, [(a[0] + b[0]) / 2 + (r() - 0.5) * 4, (a[1] + b[1]) / 2], b, CLOAK_DK, 0.9 + r() * 0.6, 0.7);
      curve(c, [a[0] + 0.7, a[1]], [(a[0] + b[0]) / 2 + 0.7, (a[1] + b[1]) / 2], [b[0] + 0.7, b[1]], CLOAK_HI, 0.3, 0.45);
    }
  });
  // worn trim along the hem (only scraps of the colour left)
  for (let i = 0; i < hem.length - 1; i++) if (r() < 0.6) line(c, [hem[i], hem[i + 1]], sh(trim, 0.75), 0.45, 0.85);
}

/** A ragged hem from a to b: teeth hanging down, wobbling with the frame. */
function ragged(a: P, b: P, n: number, depth: number, f: number, seed: number): P[] {
  const r = rng(seed), out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    const tooth = i % 2 ? depth * (0.6 + r() * 0.8) : -depth * 0.2 * r();
    out.push([x + Math.sin(f * 1.3 + i) * 0.5, y + tooth + Math.sin(f * 0.9 + i * 1.7) * 0.6]);
  }
  return out;
}

/** The hood: deep, pointed at the back, nothing inside but the two eyes. */
function hood(c: C2, R: Raider, x: number, y: number, dir: Dir) {
  const back = dir === "right" ? -1 : 0;
  const shape = dir === "right"
    ? blobPath([[x - 3.2, y + 2.4], [x - 3.6, y - 1.5], [x - 4.8, y - 4.8], [x - 1, y - 4.2], [x + 2.4, y - 2.2], [x + 3, y + 1], [x + 2.2, y + 3]])
    : blobPath([[x - 3.2, y + 2.6], [x - 3.4, y - 1.8], [x, y - 4.6], [x + 3.4, y - 1.8], [x + 3.2, y + 2.6]]);
  vol(c, shape, CLOAK, [x - 4, y - 5, 8, 8], { hi: 1.6, lo: 0.4, ao: 0.4 });
  moonRim(c, dir === "right" ? [[x - 3.6, y - 1.5], [x - 4.8, y - 4.8], [x - 1, y - 4.2]] : [[x - 3.2, y + 1], [x - 3.2, y - 1.8], [x, y - 4.4]], 0.55, 0.4);
  if (dir === "up") return;
  // the dark of the hood, and the eyes burning in it
  const ox = dir === "right" ? x + 1.2 : x, oy = y + 0.6;
  fillShape(c, ellipseP(ox, oy, dir === "right" ? 1.5 : 2.2, 2.0), css(0x030203));
  const E = mix(R.eyes, 0xffffff, 0.45);
  const eyes: P[] = dir === "right" ? [[ox + 0.9, oy - 0.2]] : [[ox - 0.9, oy - 0.2], [ox + 0.9, oy - 0.2]];
  for (const [ex, ey] of eyes) { glow(c, ex, ey, 1.8, R.eyes, 0.7); fillShape(c, ellipseP(ex, ey, 0.42, 0.32), css(E)); }
  void back;
}

/** The horse seen side on (facing right), barrel centre (bx, by), legs by stride `sw` (-1..1). */
function horseSide(c: C2, R: Raider, bx: number, by: number, g: number, sw: number, rear: number, f: number, part: "far" | "body" | "near") {
  const coat = R.horse, mane = R.mane, far = sh(coat, 0.62);
  const leg = (top: P, knee: P, foot: P, col: number, hind: boolean) => {
    limb(c, top, knee, hind ? 3.4 : 2.6, 1.5, col);
    limb(c, knee, foot, 1.4, 1.2, col);
    fillShape(c, ellipseP(foot[0] - 0.2, foot[1] - 1.3, 1.2, 1.0), css(sh(mane, 0.9))); // shaggy fetlock
    fillShape(c, poly([[foot[0] - 1.1, foot[1] - 0.9], [foot[0] + 1.3, foot[1] - 0.9], [foot[0] + 1.5, foot[1]], [foot[0] - 1.2, foot[1]]]), css(0x14100c));
  };
  if (part === "far") {
    leg([bx - 7.5, by + 2], [bx - 9.6 - sw * 2.2, by + 8.5], [bx - 8.4 - sw * 3.4, g - 0.4], far, true);
    leg([bx + 7.5, by + 2 - rear], [bx + 9 + sw * 2.4, by + 8.5 - rear * 1.6], [bx + 9.6 + sw * 3.6, g - 0.4 - rear * 3], far, false);
    return;
  }
  if (part === "near") {
    leg([bx - 9, by + 2.5], [bx - 11 + sw * 2.2, by + 9], [bx - 9.6 + sw * 3.4, g], coat, true);
    leg([bx + 8.6, by + 2.4 - rear], [bx + 9.4 - sw * 2.4, by + 9 - rear * 1.6], [bx + 9.2 - sw * 3.6, g - rear * 3], coat, false);
    return;
  }
  // tail streaming back
  for (let i = 0; i < 5; i++) {
    const w = Math.sin(f * 1.4 + i) * 1.2;
    curve(c, [bx - 12, by - 3.5 + i * 0.4], [bx - 17 - i * 0.6, by + w], [bx - 18 - i * 0.4 + w, by + 9 + i * 0.6], i % 2 ? mane : sh(mane, 1.4), 1.2 - i * 0.12, 0.95);
  }
  // barrel, chest and haunch
  const body = blobPath([[bx - 10.5, by - 5.2], [bx - 3, by - 5.4], [bx + 4, by - 6 - rear], [bx + 10.5, by - 2 - rear * 1.4], [bx + 10.6, by + 3 - rear], [bx + 1, by + 5.6], [bx - 9, by + 4.4], [bx - 13, by + 0.2]]);
  vol(c, body, coat, [bx - 13, by - 6, 24, 12], { hi: 1.9, lo: 0.45, ao: 0.35, spec: 0.12 });
  grain(c, body, [bx - 13, by - 6, 24, 12], coat, 41, 50, 0.3, 0.9, 0.2);
  fillShape(c, ellipseP(bx - 8.4, by - 0.6, 3.6, 3.8), css(sh(coat, 1.25), 0.35)); // haunch muscle
  moonRim(c, [[bx - 12.6, by - 0.8], [bx - 10.5, by - 5.2], [bx - 3, by - 5.4]], 0.6, 0.5);
  // neck and head (the head reaching forward, mouth open on the strike)
  const nx = bx + 7, ny = by - 4 - rear;
  const neck = blobPath([[nx - 2.5, ny - 1.6], [nx + 4.5, ny - 9 - rear], [nx + 8, ny - 8.4 - rear], [nx + 5.4, ny + 2.5], [nx + 1, ny + 3]]);
  vol(c, neck, coat, [nx - 3, ny - 10, 12, 13], { hi: 1.9, lo: 0.45, ao: 0.3 });
  const hx = nx + 7, hy = ny - 9 - rear;
  const head = blobPath([[hx - 2.2, hy - 1.4], [hx + 0.6, hy - 2], [hx + 5.2, hy + 3.2], [hx + 6, hy + 5.2], [hx + 4.2, hy + 6], [hx + 0.4, hy + 3]]);
  vol(c, head, coat, [hx - 2, hy - 2, 8, 8], { hi: 1.9, lo: 0.45, ao: 0.3 });
  fillShape(c, poly([[hx - 0.6, hy - 1.6], [hx - 0.4, hy - 4.4], [hx + 1, hy - 1.6]]), css(coat)); // ear
  fillShape(c, ellipseP(hx + 5.1, hy + 5.2, 0.5, 0.4), css(0x050404)); // nostril
  glow(c, hx + 1.4, hy + 0.6, 1.6, R.eyes, 0.55); fillShape(c, ellipseP(hx + 1.4, hy + 0.6, 0.45, 0.35), css(mix(R.eyes, 0xffffff, 0.4)));
  moonRim(c, [[nx - 2.2, ny - 1.8], [nx + 4.5, ny - 9 - rear], [hx - 2, hy - 1.4], [hx + 0.6, hy - 2], [hx + 5.2, hy + 3.2]], 0.6, 0.45);
  // bridle
  line(c, [[hx + 0.4, hy - 1], [hx + 1.2, hy + 3.4], [hx + 4.6, hy + 4.4]], LEATHER, 0.45);
  // the mane flying back along the neck
  for (let i = 0; i < 6; i++) {
    const t = i / 5, mx = nx - 1 + (hx - nx + 1) * t, my = ny - 2 + (hy - ny + 2) * t, w = Math.sin(f * 1.6 + i * 1.3) * 0.9;
    curve(c, [mx, my], [mx - 3, my - 1.2 + w], [mx - 5.6 - t * 1.4, my + 0.6 + w], i % 2 ? mane : sh(mane, 1.5), 1.0, 0.95);
  }
}

/** The tattered caparison over the horse's back (side on), the saddle and the rider's seat. */
function caparison(c: C2, R: Raider, bx: number, by: number, f: number, rear: number) {
  const cloth = mix(R.trim, 0x14101a, 0.68);
  const top: P[] = [[bx - 7.5, by - 5.4], [bx - 1, by - 6], [bx + 5, by - 6.4 - rear]];
  const hem = ragged([bx + 6, by + 3.8 - rear], [bx - 8.4, by + 3.4], 9, 1.6, f, 77);
  const shape = blobPath([...top, ...hem]);
  vol(c, shape, cloth, [bx - 9, by - 7, 16, 12], { hi: 1.5, lo: 0.45, ao: 0.35 });
  line(c, hem, sh(R.trim, 0.85), 0.45, 0.9);
  // a faded sigil: a broken crown
  const sx = bx - 1, sy = by - 0.6;
  line(c, [[sx - 1.8, sy + 1], [sx - 1.8, sy - 1], [sx - 0.8, sy], [sx, sy - 1.6], [sx + 0.8, sy], [sx + 1.8, sy - 1], [sx + 1.8, sy + 1], [sx - 1.8, sy + 1]], sh(R.trim, 0.9), 0.35, 0.7);
  // saddle
  fillShape(c, blobPath([[bx - 4.4, by - 6.2], [bx - 3.6, by - 8], [bx + 2.6, by - 7.4], [bx + 3.4, by - 8.6], [bx + 3.8, by - 6.2]]), css(LEATHER));
}

export function paintRaider(c: C2, sc: C2 | null, R: Raider, dir: Dir, pose: Pose, f: number) {
  const W = RAIDER_W, g = RAIDER_G, cx = W / 2;
  const step = pose === "step", wind = pose === "wind", strike = pose === "strike";
  const shadow = (x: number, y: number, rx: number, ry: number) => {
    const s = sc ?? c;
    s.save(); s.translate(x, y); s.scale(1, ry / rx); s.fillStyle = "rgba(0,0,0,0.45)"; s.beginPath(); s.arc(0, 0, rx, 0, Math.PI * 2); s.fill(); s.restore();
  };
  const bob = step ? -0.8 : 0, seed = R.key.charCodeAt(0) * 31 + R.key.length;
  const lance = R.weapon === "lance";

  if (dir === "right") {
    const lunge = strike ? 1.6 : wind ? -0.8 : 0, rear = wind ? 0.8 : 0;
    const bx = cx - 4 + lunge, by = g - 17 + bob, sw = step ? 1 : strike ? 0.5 : wind ? -0.4 : 0;
    shadow(bx, g + 0.2, 17, 3.2);
    horseSide(c, R, bx, by, g, sw, rear, f, "far");
    // the rider's far arm on the reins
    const lean = strike ? 2.4 : wind ? -1.2 : 0;
    const hip: P = [bx - 1, by - 7.4], sh0: P = [bx + lean * 0.6, by - 16.6 + bob * 0.2];
    limb(c, [sh0[0] + 0.6, sh0[1] + 1.2], [bx + 6, by - 9.5], 1.4, 1.2, sh(STEEL_DK, 0.7));
    horseSide(c, R, bx, by, g, sw, rear, f, "body");
    caparison(c, R, bx, by, f, rear);
    // the cloak billowing back over the rump: lifted high at a gallop, swept forward on the blow
    const lift = (step ? 3 : strike ? 4 : wind ? 1.5 : 0.6) + Math.sin(f * 1.1) * 0.8;
    const wv = (k: number) => Math.sin(f * 1.7 + k) * 0.9;
    const top: P[] = [[sh0[0] + 1.6, sh0[1] - 0.4], [sh0[0] - 2.4, sh0[1] - 1.8], [sh0[0] - 9, sh0[1] - 2.6 - lift + wv(0)], [sh0[0] - 17, sh0[1] - 1 - lift * 1.3 + wv(1)], [sh0[0] - 23, sh0[1] + 3 - lift + wv(2)]];
    const hem = ragged([sh0[0] - 24, sh0[1] + 10 - lift * 0.4], [sh0[0] - 1, sh0[1] + 11.5], 11, 2.2, f, seed);
    cloakSheet(c, top, hem, seed, R.trim, [sh0[0] - 24, sh0[1] - 6, 26, 18]);
    moonRim(c, top.slice(1), 0.55, 0.4);
    // the rider: leg in the stirrup, armoured body, hood
    limb(c, hip, [bx + 3, by - 3], 2.6, 2.0, STEEL_DK);
    limb(c, [bx + 3, by - 3], [bx + 2.4, by + 3.4], 1.9, 1.5, STEEL_DK, { metal: true });
    fillShape(c, ellipseP(bx + 3.2, by + 3.8, 1.8, 0.9), css(0x101012));
    const torso = blobPath([[hip[0] - 2.4, hip[1] + 0.6], [sh0[0] - 2.6, sh0[1] + 0.6], [sh0[0] + 0.2, sh0[1] - 0.8], [sh0[0] + 2.6, sh0[1] + 1], [hip[0] + 2.4, hip[1] + 0.4]]);
    metal(c, torso, STEEL_DK, [sh0[0] - 2, sh0[1]], [sh0[0] + 3, sh0[1] + 4], 0.35);
    line(c, [[hip[0] - 2.2, hip[1] - 0.6], [hip[0] + 2.4, hip[1] - 0.8]], LEATHER, 0.7); // belt
    // the cloak's near edge falls over the shoulder and down the back
    fillShape(c, blobPath([[sh0[0] + 1.4, sh0[1] - 1], [sh0[0] - 1.6, sh0[1] + 7], [sh0[0] - 3.4, sh0[1] + 11.5], [sh0[0] - 3.2, sh0[1] - 0.8]]), css(CLOAK));
    fillShape(c, ellipseP(sh0[0] + 0.6, sh0[1] + 0.6, 2.6, 1.9), css(sh(R.metal, 0.75))); // pauldron
    moonRim(c, [[sh0[0] - 1.6, sh0[1] - 0.6], [sh0[0] + 1.6, sh0[1] - 1]], 0.7, 0.45);
    hood(c, R, sh0[0] + 0.9, sh0[1] - 3.4, "right");
    // weapon arm and the weapon
    const hand: P = lance ? (strike ? [sh0[0] + 5.6, sh0[1] + 3] : wind ? [sh0[0] + 1, sh0[1] + 3.4] : [sh0[0] + 3.2, sh0[1] + 4.2])
      : wind ? [sh0[0] - 3, sh0[1] - 5.4] : strike ? [sh0[0] + 6.4, sh0[1] + 3.4] : [sh0[0] + 3.8, sh0[1] + 2.6];
    const ang = lance ? (strike ? -0.04 : wind ? -0.22 : -0.12)
      : wind ? -2.6 : strike ? 0.5 : R.weapon === "flail" ? -1.1 : -1.95;
    const elbow: P = [(sh0[0] + hand[0]) / 2 + (wind ? -1.4 : 0.6), (sh0[1] + hand[1]) / 2 + 1.6];
    if (wind && !lance) weapon(c, R, hand, ang, pose, f); // raised behind the head: the arm passes in front
    limb(c, [sh0[0] + 0.8, sh0[1] + 0.8], elbow, 1.8, 1.5, STEEL_DK, { metal: true });
    limb(c, elbow, hand, 1.5, 1.4, STEEL_DK, { metal: true });
    fillShape(c, ellipseP(hand[0], hand[1], 1.2, 1.1), css(0x1a1616));
    if (!wind || lance) weapon(c, R, hand, ang, pose, f);
    horseSide(c, R, bx, by, g, sw, rear, f, "near");
    return;
  }

  if (dir === "down") {
    const by = g - 16 + bob + (strike ? 0.6 : 0);
    shadow(cx, g - 1.5, 10, 4.2);
    const sw = step ? 1 : 0;
    // hind legs peeking between the front ones, the cloak's wings spread behind the rider
    for (const s of [-1, 1]) {
      const col = sh(R.horse, 0.55);
      limb(c, [cx + s * 4.6, by + 1], [cx + s * 4.8, g - 4 - sw * s], 2.4, 1.4, col);
      fillShape(c, ellipseP(cx + s * 4.8, g - 3.6 - sw * s, 1.2, 0.8), css(0x14100c));
    }
    const sh0y = by - 17 + bob * 0.3 + (strike ? 1.2 : wind ? -0.6 : 0);
    const lift = (step ? 2.6 : strike ? 3.4 : wind ? 1.6 : 0.6) + Math.sin(f * 1.1) * 0.8;
    for (const s of [-1, 1]) {
      const wv = (k: number) => Math.sin(f * 1.7 + k + s) * 0.9;
      const top: P[] = [[cx + s * 1, sh0y - 1], [cx + s * 5.5, sh0y - 2.6 - lift * 0.5 + wv(0)], [cx + s * 11.5, sh0y - 4.6 - lift + wv(1)], [cx + s * 17, sh0y - 3 - lift * 1.3 + wv(2)]];
      const hem = ragged([cx + s * 17.5, sh0y + 4 - lift], [cx + s * 2, sh0y + 15], 10, 2.4, f, seed + s * 5);
      cloakSheet(c, top, hem, seed + s, R.trim, s > 0 ? [cx, sh0y - 6, 18, 22] : [cx - 18, sh0y - 6, 18, 22]);
      moonRim(c, top.slice(1), s < 0 ? 0.55 : 0.25, 0.4);
    }
    // barrel sides behind the chest, caparison skirts
    const cloth = mix(R.trim, 0x14101a, 0.68);
    for (const s of [-1, 1]) {
      vol(c, ellipseP(cx + s * 5.4, by - 1, 3.4, 5), R.horse, [cx + s * 5.4 - 3.4, by - 6, 6.8, 10], { hi: 1.8, lo: 0.4 });
      const hem = ragged([cx + s * 8.6, by + 3.6], [cx + s * 3.6, by + 4.2], 4, 1.5, f, seed + 9 + s);
      fillShape(c, blobPath([[cx + s * 3.4, by - 6], [cx + s * 8.6, by - 5.4], ...hem]), css(cloth));
      line(c, hem, sh(R.trim, 0.85), 0.4, 0.9);
    }
    // the rider: legs in the stirrups either side, the body, the hood
    for (const s of [-1, 1]) {
      limb(c, [cx + s * 2.6, by - 7.6], [cx + s * 6.4, by - 3], 2.6, 2, STEEL_DK);
      limb(c, [cx + s * 6.4, by - 3], [cx + s * 6.8, by + 2.4], 1.9, 1.5, STEEL_DK, { metal: true });
      fillShape(c, ellipseP(cx + s * 6.9, by + 2.8, 1.2, 0.9), css(0x101012));
    }
    const torso = blobPath([[cx - 3, by - 7.2], [cx - 3.6, sh0y + 1.4], [cx, sh0y - 0.4], [cx + 3.6, sh0y + 1.4], [cx + 3, by - 7.2]]);
    metal(c, torso, STEEL_DK, [cx - 3, sh0y], [cx + 3, sh0y + 5], 0.35);
    fillShape(c, poly([[cx - 1.6, sh0y + 1.2], [cx + 1.6, sh0y + 1.2], [cx, sh0y + 6.4]]), css(CLOAK)); // the cloak's clasp falls between
    fillShape(c, ellipseP(cx, sh0y + 1.2, 0.8, 0.8), css(R.trim));
    line(c, [[cx - 3, by - 8.6], [cx + 3, by - 8.6]], LEATHER, 0.7);
    for (const s of [-1, 1]) fillShape(c, ellipseP(cx + s * 3.4, sh0y + 1.2, 2.4, 1.8), css(sh(R.metal, 0.75)));
    moonRim(c, [[cx - 5.6, sh0y + 0.8], [cx - 3.4, sh0y - 0.4]], 0.7, 0.45);
    hood(c, R, cx, sh0y - 3.2, "down");
    // the off hand on the reins
    limb(c, [cx + 3.6, sh0y + 1.6], [cx + 2.6, by - 5.4], 1.6, 1.4, STEEL_DK, { metal: true });
    // the horse: chest and front legs, then the long head coming at us
    for (const s of [-1, 1]) {
      const lift2 = sw * (s > 0 ? 1.2 : -1.2);
      limb(c, [cx + s * 2.6, by + 2], [cx + s * 2.9, by + 8 - lift2], 2.6, 1.5, R.horse);
      limb(c, [cx + s * 2.9, by + 8 - lift2], [cx + s * 2.8, g - 0.2 - Math.max(0, lift2) * 1.5], 1.4, 1.2, R.horse);
      fillShape(c, ellipseP(cx + s * 2.8, g - 1.4 - Math.max(0, lift2) * 1.5, 1.3, 1.0), css(sh(R.mane, 0.9)));
      fillShape(c, ellipseP(cx + s * 2.8, g - 0.5 - Math.max(0, lift2) * 1.5, 1.3, 0.6), css(0x14100c));
    }
    vol(c, ellipseP(cx, by, 5.2, 4.6), R.horse, [cx - 5, by - 5, 10, 9], { hi: 1.9, lo: 0.45, ao: 0.3 });
    const hy = by - 6.5;
    const head = blobPath([[cx - 2.2, hy - 4.6], [cx + 2.2, hy - 4.6], [cx + 2, hy + 1], [cx + 1.6, hy + 5.4], [cx - 1.6, hy + 5.4], [cx - 2, hy + 1]]);
    vol(c, head, R.horse, [cx - 2.4, hy - 5, 5, 11], { hi: 2, lo: 0.45, ao: 0.3 });
    for (const s of [-1, 1]) fillShape(c, poly([[cx + s * 1.2, hy - 4.2], [cx + s * 2.2, hy - 7.4], [cx + s * 2.4, hy - 4]]), css(R.horse));
    fillShape(c, poly([[cx - 1.8, hy - 4.8], [cx, hy - 6.6 + Math.sin(f) * 0.4], [cx + 1.8, hy - 4.8]]), css(R.mane)); // forelock
    for (const s of [-1, 1]) {
      glow(c, cx + s * 1.9, hy - 1.6, 1.5, R.eyes, 0.55);
      fillShape(c, ellipseP(cx + s * 1.9, hy - 1.6, 0.4, 0.35), css(mix(R.eyes, 0xffffff, 0.4)));
      fillShape(c, ellipseP(cx + s * 0.8, hy + 4.6, 0.45, 0.4), css(0x050404));
    }
    line(c, [[cx - 2, hy - 1], [cx - 1.8, hy + 3.2], [cx + 1.8, hy + 3.2], [cx + 2, hy - 1]], LEATHER, 0.45);
    moonRim(c, [[cx - 2.2, hy + 1], [cx - 2.2, hy - 4.4], [cx - 1, hy - 4.8]], 0.6, 0.4);
    // the weapon in the rider's right hand (our left)
    const hand: P = lance ? [cx - 5.6, sh0y + 6] : wind ? [cx - 6.4, sh0y - 4.2] : strike ? [cx - 5, by - 1] : [cx - 6.6, sh0y + 5];
    const ang = lance ? (strike ? 1.35 : wind ? -1.9 : -1.75) : wind ? -2.3 : strike ? 1.85 : R.weapon === "flail" ? -1.2 : -1.75;
    if (!strike) weapon(c, R, hand, ang, pose, f, true);
    const elbow: P = [cx - 6.2, (sh0y + hand[1]) / 2 + 1.2];
    limb(c, [cx - 3.6, sh0y + 1.6], elbow, 1.8, 1.5, STEEL_DK, { metal: true });
    limb(c, elbow, hand, 1.5, 1.4, STEEL_DK, { metal: true });
    fillShape(c, ellipseP(hand[0], hand[1], 1.2, 1.1), css(0x1a1616));
    if (strike) weapon(c, R, hand, ang, pose, f);
    return;
  }

  // up: riding away from us, the cloak falling over the horse's rump
  const by = g - 16 + bob;
  shadow(cx, g - 2, 10, 4.2);
  const sw = step ? 1 : 0;
  const sh0y = by - 17 + bob * 0.3 + (wind ? -0.6 : strike ? 1 : 0);
  // front legs far ahead, neck and head beyond the rider
  for (const s of [-1, 1]) {
    limb(c, [cx + s * 2.6, by - 3], [cx + s * 2.8, g - 4 - sw * s], 2, 1.2, sh(R.horse, 0.55));
  }
  const neck = blobPath([[cx - 2.6, by - 6], [cx - 1.8, by - 18], [cx + 1.8, by - 18], [cx + 2.6, by - 6]]);
  vol(c, neck, R.horse, [cx - 3, by - 19, 6, 14], { hi: 1.8, lo: 0.4 });
  for (const s of [-1, 1]) fillShape(c, poly([[cx + s * 0.8, by - 18], [cx + s * 1.8, by - 21.6], [cx + s * 2.2, by - 17.6]]), css(R.horse)); // ears
  for (let i = 0; i < 4; i++) curve(c, [cx + (i - 1.5) * 0.6, by - 17], [cx + (i - 1.5) * 1.6 + Math.sin(f + i), by - 13], [cx + (i - 1.5) * 2.2, by - 8], R.mane, 0.9, 0.95);
  // the rider's back, mostly under the cloak
  const torso = blobPath([[cx - 3, by - 7.2], [cx - 3.6, sh0y + 1.4], [cx, sh0y - 0.4], [cx + 3.6, sh0y + 1.4], [cx + 3, by - 7.2]]);
  metal(c, torso, STEEL_DK, [cx - 3, sh0y], [cx + 3, sh0y + 5], 0.3);
  // weapon (right hand, our right): behind the cloak while it rests, out to the side when it swings
  const hand: P = lance ? [cx + 5.8, sh0y + 5] : wind ? [cx + 6.6, sh0y - 4.6] : strike ? [cx + 6, by - 4] : [cx + 6.6, sh0y + 4.6];
  const ang = lance ? (strike ? -1.45 : -1.6) : wind ? -1.0 : strike ? -2.0 : R.weapon === "flail" ? -1.9 : -1.4;
  // rump, haunches, tail and hind legs
  for (const s of [-1, 1]) {
    const l = sw * (s > 0 ? 1.2 : -1.2);
    limb(c, [cx + s * 3.8, by + 2], [cx + s * 4.6, by + 8.6 + Math.min(0, -l)], 3.4, 1.6, R.horse);
    limb(c, [cx + s * 4.6, by + 8.6 + Math.min(0, -l)], [cx + s * 4.2, g - Math.max(0, l) * 1.4], 1.5, 1.2, R.horse);
    fillShape(c, ellipseP(cx + s * 4.2, g - 1.2 - Math.max(0, l) * 1.4, 1.3, 1.0), css(sh(R.mane, 0.9)));
    fillShape(c, ellipseP(cx + s * 4.2, g - 0.4 - Math.max(0, l) * 1.4, 1.3, 0.6), css(0x14100c));
  }
  const rump = blobPath([[cx - 7.6, by + 2], [cx - 7.2, by - 4], [cx - 3, by - 6.6], [cx + 3, by - 6.6], [cx + 7.2, by - 4], [cx + 7.6, by + 2], [cx + 4, by + 5], [cx - 4, by + 5]]);
  vol(c, rump, R.horse, [cx - 8, by - 7, 16, 12], { hi: 1.9, lo: 0.45, ao: 0.35 });
  grain(c, rump, [cx - 8, by - 7, 16, 12], R.horse, 23, 40, 0.3, 0.9, 0.2);
  moonRim(c, [[cx - 7.4, by + 0.6], [cx - 7.2, by - 4], [cx - 3, by - 6.6]], 0.6, 0.5);
  for (let i = 0; i < 5; i++) { const w = Math.sin(f * 1.4 + i) * 1.1; curve(c, [cx + (i - 2) * 0.5, by - 4], [cx + (i - 2) * 1.1 + w, by + 3], [cx + (i - 2) * 1.4 + w * 1.4, by + 10.5], i % 2 ? R.mane : sh(R.mane, 1.4), 1.1, 0.95); }
  if (!(wind || strike)) weapon(c, R, hand, ang, pose, f, true);
  // the cloak: from the shoulders down over the rump, spread wide and lifting in the wind
  const lift = (step ? 2.4 : strike ? 2.8 : wind ? 1.4 : 0.6) + Math.sin(f * 1.1) * 0.8;
  const wv = (k: number) => Math.sin(f * 1.7 + k) * 0.9;
  const top: P[] = [[cx + 3.8, sh0y + 0.4], [cx + 2, sh0y - 1.4], [cx - 2, sh0y - 1.4], [cx - 3.8, sh0y + 0.4], [cx - 8 + wv(0), sh0y + 2 - lift * 0.8], [cx - 13 + wv(1), sh0y + 5 - lift * 1.2]];
  const hem = ragged([cx - 12, sh0y + 12 - lift * 0.6], [cx + 12, sh0y + 12 - lift * 0.6], 14, 2.6, f, seed + 3);
  cloakSheet(c, top, [...hem, [cx + 13 + wv(2), sh0y + 5 - lift * 1.2], [cx + 8 + wv(3), sh0y + 2 - lift * 0.8]], seed, R.trim, [cx - 13, sh0y - 2, 26, 16]);
  moonRim(c, [top[3], top[4], top[5]], 0.55, 0.4);
  for (const s of [-1, 1]) fillShape(c, ellipseP(cx + s * 3.4, sh0y + 1, 2.4, 1.7), css(sh(R.metal, 0.7)));
  hood(c, R, cx, sh0y - 3.2, "up");
  const elbow: P = [cx + 6.2, (sh0y + hand[1]) / 2 + 1];
  limb(c, [cx + 3.6, sh0y + 1.6], elbow, 1.8, 1.5, STEEL_DK, { metal: true });
  limb(c, elbow, hand, 1.5, 1.4, STEEL_DK, { metal: true });
  fillShape(c, ellipseP(hand[0], hand[1], 1.2, 1.1), css(0x1a1616));
  if (wind || strike) weapon(c, R, hand, ang, pose, f);
}
