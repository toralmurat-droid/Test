/**
 * The Night Raiders, 3D-built (mob3d.ts, Murat 2026-11-17): a rider in a great black cloak that streams back over a
 * big dark horse in a tattered caparison, a massive weapon in the right hand, eyes burning in the hood and in the
 * horse's skull. One model in world px (x forward, y its left, z up, hooves on z = 0) posed per sheet frame: stand,
 * step (a gallop stride), wind (rearing, weapon raised back) and strike (lunging, the blow coming down).
 */
import { cap, chain, cone, custom, ell, mat, mixc, rbox, sphere, torus, type Mat, type Model, type Prim, type V3 } from "./mob3d";
import type { Raider } from "../../../shared/raiders";
import type { Pose } from "./beasts3d";
import { shade } from "../canvas";

const CLOAK = 0x17141c, LEATHER = 0x2a2019, WOOD = 0x2e2218, STEEL_DK = 0x3a3a40, HOOF = 0x14100c;
/** A night material: a ramp kept dark (no auto-brightening of black things), so the riders stay shadows. */
const dk = (col: number, lo: number, hi: number, o: Partial<Omit<Mat, "ramp">> = {}, n = 8): Mat =>
  mat(col, { ...o, ramp: Array.from({ length: n }, (_, i) => shade(col, lo + (hi - lo) * (i / (n - 1)))) });
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crossV = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A flat plate (a blade, a pennon): the triangle fan of `pts` thickened to `th`. */
function plate(pts: V3[], th: number, m: Mat, k = 0.15): Prim {
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i] - th - 0.6); hi[i] = Math.max(hi[i], p[i] + th + 0.6); }
  const tris: [V3, V3, V3][] = [];
  for (let i = 1; i < pts.length - 1; i++) tris.push([pts[0], pts[i], pts[i + 1]]);
  return custom(lo, hi, (x, y, z) => { let d = Infinity; for (const T of tris) d = Math.min(d, triDist([x, y, z], ...T)); return d - th; }, m, { k });
}
function triDist(p: V3, a: V3, b: V3, c: V3): number {
  const sub = (u: V3, v: V3): V3 => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u: V3, v: V3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const ba = sub(b, a), pa = sub(p, a), cb = sub(c, b), pb = sub(p, b), ac = sub(a, c), pc = sub(p, c), n = crossV(ba, ac);
  const sgn = Math.sign(dot(crossV(ba, n), pa)) + Math.sign(dot(crossV(cb, n), pb)) + Math.sign(dot(crossV(ac, n), pc));
  const seg = (e: V3, q: V3) => { const h = Math.min(1, Math.max(0, dot(e, q) / (dot(e, e) || 1e-6))); return Math.hypot(e[0] * h - q[0], e[1] * h - q[1], e[2] * h - q[2]); };
  if (sgn < 2) return Math.min(seg(ba, pa), seg(cb, pb), seg(ac, pc));
  return Math.abs(dot(n, pa)) / (Math.hypot(...n) || 1e-6);
}

/** The rider's weapon from the grip along `u`; `s` is the side its blades face (perpendicular to u). */
function weapon(P: Prim[], R: Raider, grip: V3, u: V3, s: V3, pose: Pose, f: number, halos: Model["halos"]) {
  const M = dk(R.metal, 0.4, 1.5, { spec: 0.9, shine: 26, grain: 0.1 }), edge = mat(mixc(R.metal, 0xe8ecf4, 0.5), { spec: 1, lo: 0.45, hi: 1.35 });
  const wood = mat(WOOD, { lo: 0.4, hi: 1.35, grain: 0.3 }), band = mat(mixc(R.trim, 0x302820, 0.4), { spec: 0.5, lo: 0.4, hi: 1.3 });
  const at = (k: number, w = 0): V3 => add(add(grip, u, k), s, w);
  const haft = (a: number, b: number, r = 0.55) => { P.push(cap(at(a), at(b), r, r * 0.9, wood, { k: 0.1 })); for (let k = a + 2; k < b - 1; k += 3.2) P.push(torus(at(k), r + 0.05, 0.22, band, { k: 0.05 })); };
  switch (R.weapon) {
    case "greatsword": {
      P.push(cap(at(-3.5), at(1.0), 0.55, 0.5, mat(LEATHER, { lo: 0.4, hi: 1.3 }), { k: 0.1 }), sphere(at(-3.9), 0.75, M, { k: 0.1 }));
      P.push(cap(at(1.2, -3), at(1.2, 3), 0.55, 0.55, M, { k: 0.1 }));
      P.push(plate([at(1.6, -1.3), at(19, -1.1), at(23, 0), at(19, 1.1), at(1.6, 1.3)], 0.32, M));
      const ember = mat(R.trim, { emit: 0.9, lo: 0.8, hi: 1.6 });
      P.push(cap(at(2.5, 1.35), at(19, 1.2), 0.22, 0.2, ember, { k: 0.05 }), cap(at(19, 1.2), at(22.6, 0.15), 0.2, 0.12, ember, { k: 0.05 }));
      halos!.push({ p: at(14, 1.2), r: 4, col: R.trim, a: 0.3 });
      break;
    }
    case "scythe": {
      haft(-7, 21);
      P.push(cap(at(6), at(6, 2.4), 0.4, 0.35, wood, { k: 0.1 }));
      const e = at(21), d: V3 = [-s[0], -s[1], -s[2]], back: V3 = [-u[0], -u[1], -u[2]];
      const pt = (a: number, b: number): V3 => add(add(e, d, a), back, b);
      P.push(plate([pt(0, 0), pt(4, -1.4), pt(10, 2.2), pt(13.5, 6), pt(8, 0.8), pt(2.5, 1.2)], 0.28, M));
      P.push(...chain([pt(2.5, 1.2), pt(8, 0.8), pt(13.5, 6)], 0.2, 0.12, edge));
      break;
    }
    case "greataxe": {
      haft(-5, 18, 0.65);
      for (const sg of [1, -1]) P.push(plate([at(13, 0.6 * sg), at(11.5, 3.5 * sg), at(10.2, 7.4 * sg), at(15, 6.2 * sg), at(19.6, 7.6 * sg), at(18.2, 3.5 * sg), at(17, 0.6 * sg)], 0.4, M));
      P.push(sphere(at(15), 1.4, M, { k: 0.3 }), cone(at(18), at(21), 0.6, M));
      break;
    }
    case "flail": {
      haft(-3, 9, 0.7);
      P.push(sphere(at(9.3), 0.9, M, { k: 0.1 }));
      const s0 = at(9.6), end: V3 = pose === "strike" ? at(20) : pose === "wind" ? add(add(s0, u, -3), [0, 0, -1], 4) : add(s0, [0.6, 0, -8 + Math.sin(f * 1.3) * 0.5]);
      const links: V3[] = [];
      for (let k = 0; k <= 7; k++) { const q = k / 7; links.push(add(add(s0, [end[0] - s0[0], end[1] - s0[1], end[2] - s0[2]], q), [0, 0, pose === "strike" ? 0 : -Math.sin(q * Math.PI) * 1.2])); }
      P.push(...chain(links, 0.38, 0.38, mat(mixc(R.metal, 0, 0.3), { spec: 0.8, lo: 0.4, hi: 1.4 })));
      P.push(sphere(end, 2.6, M, { k: 0.2 }));
      for (let k = 0; k < 14; k++) { const a = k * 2.4, b = Math.acos(1 - 2 * (k + 0.5) / 14), dv: V3 = [Math.sin(b) * Math.cos(a), Math.sin(b) * Math.sin(a), Math.cos(b)]; P.push(cone(add(end, dv, 2.2), add(end, dv, 4), 0.55, M)); }
      // a cracked bell hangs from the haft (Ilsevar's seven bells)
      const b = add(at(5), [0, 0, -1.4]);
      P.push(cone(add(b, [0, 0, -1.6]), add(b, [0, 0, 0.6]), 1.2, mat(R.trim, { spec: 0.9, lo: 0.4, hi: 1.4 }), { k: 0.1 }));
      break;
    }
    case "lance": {
      P.push(cap(at(-6), at(30), 0.8, 0.4, wood, { k: 0.1 }));
      for (let k = 4; k < 26; k += 5) P.push(torus(at(k), 0.65, 0.2, band, { k: 0.05 }));
      P.push(cone(at(-0.5), at(4.4), 3.2, M, { k: 0.2 })); // vamplate
      P.push(cone(at(28.5), at(35), 1.0, M));
      // a torn pennon under the head, snapping in the wind
      const w = Math.sin(f * 1.9) * 1.4, dn: V3 = [0, 0, -1];
      P.push(plate([at(24.5), at(26.5), add(add(at(26), u, -6), dn, 4 + w * 0.4), add(add(at(25), u, -4), dn, 2.4), add(add(at(24.5), u, -7.5), dn, 3.4 + w)], 0.2, mat(mixc(R.trim, 0x101010, 0.15), { lo: 0.4, hi: 1.3, grain: 0.2 })));
      break;
    }
    case "maul": {
      haft(-4, 14, 0.7);
      const c = at(16.3);
      P.push(cap(add(c, s, -4.6), add(c, s, 4.6), 3.1, 3.1, dk(mixc(R.metal, 0, 0.1), 0.4, 1.45, { spec: 0.7, grain: 0.35 }), { k: 0.1 }));
      for (const sg of [-1, 1]) { P.push(cap(add(c, s, 3.5 * sg), add(c, s, 3.9 * sg), 3.35, 3.35, band, { k: 0.05 }), sphere(add(c, s, 5.2 * sg), 0.9, M, { k: 0.1 })); }
      break;
    }
    case "glaive": {
      haft(-6, 15, 0.6);
      P.push(plate([at(14.5, -1.0), at(18, -1.6), at(24.5, -0.6), at(28, 1.6), at(23, 2.6), at(17, 2.4), at(14.5, 1.2)], 0.3, M));
      P.push(...chain([at(18, -1.6), at(24.5, -0.6), at(28, 1.6)], 0.18, 0.1, edge));
      P.push(cone(at(15.2, -1.4), at(14.0, -3.8), 0.5, M), sphere(at(14.6), 0.85, mat(R.trim, { spec: 0.6, lo: 0.4, hi: 1.4 }), { k: 0.1 }));
      break;
    }
  }
}

/**
 * The cloak: one thin sheet from the shoulders streaming back `len` px, its sides drooping, rippling with the frame,
 * lifted by the wind, the hem torn into teeth with only scraps of the trim colour left.
 */
function cloak(P: Prim[], sh: V3, len: number, lift: number, f: number, seed: number, trim: number) {
  const C = dk(CLOAK, 0.5, 2.4, { grain: 0.22 }), T = dk(mixc(trim, CLOAK, 0.55), 0.5, 1.5, { grain: 0.3 });
  const hw = (u: number) => 3.6 + u * 0.42;
  const teeth = (q: number) => 1.6 * Math.abs(Math.sin(q * 1.9 + seed)) + 0.7 * Math.abs(Math.sin(q * 4.3 + seed * 2));
  const zs = (u: number, y: number) => {
    const w = hw(u), r = Math.min(1, Math.abs(y) / w);
    return sh[2] + 0.4 + lift * 0.6 * Math.sin(Math.min(1, u / len) * Math.PI * 0.62) - u * 0.26 - (3.6 + u * 0.42) * r * r
      + 0.6 * Math.sin(u * 0.75 - f * 1.7 + y * 0.45);
  };
  const lo: V3 = [sh[0] - len - 4, -hw(len) - 3, sh[2] - 16], hi: V3 = [sh[0] + 2, hw(len) + 3, sh[2] + lift + 4];
  const field = (x: number, y: number, z: number, band: boolean) => {
    const u = sh[0] - x, w = hw(Math.max(0, u));
    const end = len - teeth(y) * 1.0, side = w - teeth(u * 1.3) * 0.45;
    const surf = (Math.abs(z - zs(u, y)) - 0.42) * 0.42;
    let d = Math.max(surf, Math.abs(y) - side, -u - 0.5, u - end);
    if (band) d = Math.max(d, Math.min(end - 0.8 - u, side - 0.6 - Math.abs(y)));
    return d;
  };
  P.push(custom(lo, hi, (x, y, z) => field(x, y, z, false), C, { k: 0.3 }));
  P.push(custom(lo, hi, (x, y, z) => field(x, y, z, true) - 0.06, T, { k: 0.05 }));
}

/** One raider frame. */
export function raider(R: Raider, pose: Pose, f: number): Model {
  const P: Prim[] = [], halos: NonNullable<Model["halos"]> = [], eyes: NonNullable<Model["eyes"]> = [];
  const step = pose === "step", wind = pose === "wind", strike = pose === "strike";
  const seed = R.key.charCodeAt(0) * 31 + R.key.length;
  const coat = dk(R.horse, 0.4, 1.55, { grain: 0.22, spec: 0.12 }), mane = dk(R.mane, 0.45, 1.8, { grain: 0.35 });
  const hoof = mat(HOOF, { lo: 0.5, hi: 1.6 }), steel = dk(STEEL_DK, 0.4, 1.35, { spec: 0.8, shine: 24, grain: 0.12 });
  const metalM = mat(mixc(R.metal, 0, 0.25), { spec: 0.9, shine: 24, lo: 0.32, hi: 1.45 }), leather = mat(LEATHER, { lo: 0.4, hi: 1.35, grain: 0.2 });
  const cloth = dk(mixc(R.trim, 0x14101a, 0.68), 0.45, 1.6, { grain: 0.25 }), trimM = mat(mixc(R.trim, 0, 0.15), { lo: 0.4, hi: 1.3 });
  const glowE = mixc(R.eyes, 0xffffff, 0.45);

  // ---- the horse
  const bob = step ? 0.9 : 0, rear = wind ? 1 : 0, lunge = strike ? 1.8 : wind ? -1 : 0;
  const bx = lunge - 1.5, bz = 18.5 + bob + rear * 0.6, pitch = rear * 0.16 - (strike ? 0.05 : 0);
  const at = (x: number, y: number, z: number): V3 => [bx + x, y, bz + z + x * pitch];
  P.push(ell(at(0, 0, 0), [9.2, 4.6, 5.4], coat, { k: 1.4, pitch: -pitch }));
  P.push(ell(at(-6.8, 0, 0.6), [5.0, 4.9, 5.6], coat, { k: 1.6 }));
  P.push(ell(at(6.6, 0, 0.4), [4.6, 4.3, 5.6], coat, { k: 1.6 }));
  // neck up to the long head; ears; mane flying back; eyes burning
  const nb = at(8, 0, 3), hd = at(13.6 + (strike ? 0.8 : 0), 0, 12.5 + rear * 1.2 - (strike ? 1 : 0));
  P.push(cap(nb, hd, 3.6, 2.2, coat, { k: 1.2 }));
  const muz = add(hd, [4.6 + (strike ? 0.6 : 0), 0, -4.2 + rear * 0.6]);
  P.push(cap(hd, muz, 2.3, 1.45, coat, { k: 0.8 }));
  P.push(ell(add(muz, [0.2, 0, -0.3]), [1.6, 1.4, 1.5], coat, { k: 0.5 }));
  if (strike || wind) P.push(cap(add(muz, [-1.6, 0, -1.3]), add(muz, [0.4, 0, -2.4]), 0.8, 0.6, coat, { k: 0.3 })); // jaw open
  for (const sg of [-1, 1]) { P.push(sphere(add(muz, [0.9, sg * 0.75, 0.0]), 0.42, mat(0x050404), { k: 0.1, cut: true })); }
  for (const sg of [-1, 1]) P.push(cone(add(hd, [-0.6, sg * 1.1, 1.6]), add(hd, [-1.4, sg * 1.4, 4.6]), 0.75, coat));
  P.push(...chain([add(hd, [-0.2, 0, 2.2]), add(hd, [1.2, 0, 1.6]), add(hd, [2.0, 0, 0.2])], 0.6, 0.35, mane)); // forelock
  for (const sg of [-1, 1]) { const e = add(hd, [1.3, sg * 1.75, 0.3]); eyes.push({ p: e, col: glowE }); halos.push({ p: e, r: 2.2, col: R.eyes, a: 0.35 }); }
  // bridle
  P.push(torus(add(hd, [2.2, 0, -1.2]), 2.0, 0.22, leather, { tilt: Math.PI / 2 - 0.5, k: 0.05 }));
  for (let i = 0; i < 7; i++) {
    const q = i / 6, root = add(nb, [hd[0] - nb[0], hd[1] - nb[1], hd[2] - nb[2]], q), w = Math.sin(f * 1.6 + i * 1.3) * 0.7;
    const top = add(root, [-0.6, 0, 3.0 - q * 0.6]);
    P.push(...chain([top, add(top, [-2.6, (i % 2 ? 0.8 : -0.8) + w, 0.4]), add(top, [-5.2 - q * 1.2, (i % 2 ? 1.2 : -1.2) + w, -1.2])], 0.75, 0.25, mane, { k: 0.25 }));
  }
  // tail streaming back
  for (let i = 0; i < 4; i++) {
    const w = Math.sin(f * 1.4 + i) * 1.0, y0 = (i - 1.5) * 0.6;
    P.push(...chain([at(-11, y0 * 0.3, 2.6), at(-15.5 - i * 0.4, y0 + w * 0.5, 1.6 + (step ? 1.5 : 0)), at(-17.8 - i * 0.5, y0 * 1.4 + w, -4 + (step ? 2.5 : 0)), at(-18.2 - i * 0.3, y0 * 1.6 + w, -9.5 + (step ? 3 : 0))], 0.95, 0.4, mane, { k: 0.3 }));
  }
  // legs: a gallop stride on the step, rearing on the wind-up, reaching on the blow
  const legs = [{ x: 7.0, s: 1, front: true, ph: 0 }, { x: 7.0, s: -1, front: true, ph: 1 }, { x: -7.6, s: 1, front: false, ph: 1 }, { x: -7.6, s: -1, front: false, ph: 0 }];
  for (const L of legs) {
    const sw = step ? (L.front ? (L.ph ? 4.6 : -2.4) : (L.ph ? 3.2 : -4.4)) : strike ? (L.front ? 3.4 : -3.0) : wind ? (L.front ? 2.4 : 1.2) : (L.ph ? 0.5 : -0.5);
    const lift = step ? (L.ph ? 2.6 : 0) : wind && L.front ? 5.8 + L.ph * 1.8 : 0;
    const hip = at(L.x, L.s * 2.9, -2.6), foot: V3 = [hip[0] + sw, L.s * 3.1, 1.0 + lift];
    const bendF = wind && L.front;
    const knee: V3 = L.front ? [(hip[0] + foot[0]) / 2 + (bendF ? 3.2 : 0.3), L.s * 3.1, (hip[2] + foot[2]) / 2 + (bendF ? 0.6 : 0)]
      : [(hip[0] + foot[0]) / 2 - 2.6, L.s * 3.1, (hip[2] + foot[2]) / 2 - 0.2];
    const fet: V3 = [foot[0] + (bendF ? -0.6 : L.front ? 0 : 0.4), L.s * 3.1, foot[2] + 2.2];
    P.push(cap(hip, knee, L.front ? 2.4 : 3.2, 1.25, coat, { k: 1.0 }));
    P.push(cap(knee, fet, 1.05, 0.85, coat, { k: 0.4 }));
    P.push(ell(add(fet, [0, 0, -0.6]), [1.3, 1.2, 1.4], mane, { k: 0.4 })); // shaggy fetlock
    P.push(cap(add(foot, [0, 0, -0.1]), add(foot, [0.3, 0, -0.6]), 1.15, 1.25, hoof, { k: 0.2 }));
  }
  // caparison: a torn cloth over the back, a faded broken-crown sigil, the saddle
  const cz = (x: number, y: number) => -3.2 + 0.9 * Math.abs(Math.sin(x * 1.3 + y * 0.8 + seed)) + 0.4 * Math.sin(f * 0.9 + x);
  const capLo = at(-10, -6, -6), capHi = at(8, 6, 7);
  P.push(custom([capLo[0], -6, capLo[2] - 3], [capHi[0], 6, capHi[2] + 3], (x, y, z) => {
    const qx = x - bx, qz = z - bz - qx * pitch;
    const e = Math.hypot(qx / 9.6, y / 5.15, (qz - 0.4) / 5.9);
    return Math.max((e - 1) * 4.8, cz(qx, y) - qz, qx - 6.5, -qx - 9.2);
  }, cloth, { k: 0.3 }));
  for (const sg of [-1, 1]) { const c0 = at(-1, sg * 5.0, 0.2); P.push(...chain([add(c0, [-1.6, 0, -0.6]), add(c0, [-0.8, 0, 0.8]), add(c0, [0, 0, 0]), add(c0, [0.8, 0, 0.8]), add(c0, [1.6, 0, -0.6])], 0.2, 0.2, trimM, { k: 0.05 })); }
  P.push(rbox(at(-0.6, 0, 5.4), [3.4, 2.6, 0.6], 0.6, leather, { k: 0.4 }), rbox(at(2.6, 0, 6.4), [0.6, 2.0, 1.1], 0.4, leather, { k: 0.3 }), rbox(at(-3.8, 0, 6.6), [0.6, 2.4, 1.4], 0.4, leather, { k: 0.3 }));

  // ---- the rider
  const lean = strike ? 2.4 : wind ? -1.3 : 0, hipP = at(-0.6, 0, 7.4);
  const shC: V3 = add(hipP, [lean + 0.4, 0, 9.4 - (strike ? 0.6 : 0)]);
  P.push(ell(add(hipP, [0, 0, 0.6]), [2.4, 3.0, 1.8], steel, { k: 0.6 }));
  P.push(cap(add(hipP, [0, 0, 1]), shC, 2.8, 3.3, steel, { k: 0.8 }));
  P.push(torus(add(hipP, [0.1, 0, 1.3]), 2.75, 0.4, leather, { k: 0.1 })); // belt
  for (const sg of [-1, 1]) {
    const th = add(hipP, [0.3, sg * 2.2, 0]), kn = at(3.4, sg * 5.3, 4.0), ft = at(3.0, sg * 5.6, -1.6);
    P.push(cap(th, kn, 1.6, 1.3, steel, { k: 0.4 }), cap(kn, ft, 1.2, 1.0, steel, { k: 0.3 }), ell(add(ft, [0.6, 0, -0.4]), [1.6, 0.9, 0.7], mat(0x101012, { lo: 0.5, hi: 1.6 }), { k: 0.2 }));
    P.push(ell(add(shC, [0, sg * 3.3, 0.3]), [2.2, 1.8, 1.5], metalM, { k: 0.5 })); // pauldrons
  }
  // hood: deep, pointed at the back, nothing inside but the two eyes
  const hc = add(shC, [0.5, 0, 3.6]);
  const hoodM = dk(CLOAK, 0.5, 2.4, { grain: 0.2 });
  P.push(ell(hc, [2.6, 2.4, 2.9], hoodM, { k: 0.6 }));
  P.push(cone(add(hc, [-1.0, 0, 0.9]), add(hc, [-3.6, 0, 3.4]), 1.7, hoodM, { k: 0.6 }));
  P.push(cap(add(shC, [0, 0, 0.5]), add(hc, [0, 0, -1.4]), 3.0, 2.4, hoodM, { k: 0.6 })); // cowl over the shoulders
  P.push(sphere(add(hc, [2.5, 0, -0.4]), 1.75, mat(0x030203, { lo: 1, hi: 1 }), { k: 0.4, cut: true }));
  for (const sg of [-1, 1]) { const e = add(hc, [1.6, sg * 0.8, -0.2]); eyes.push({ p: e, col: glowE }); halos.push({ p: e, r: 2.4, col: R.eyes, a: 0.4 }); }
  P.push(sphere(add(shC, [1.6, 0, -0.2]), 0.7, mat(R.trim, { spec: 0.6, lo: 0.4, hi: 1.4 }), { k: 0.1 })); // cloak clasp
  // the cloak streaming back over the rump: lifted high at a gallop, swept on the blow
  const lift = (step ? 3.2 : strike ? 4 : wind ? 1.6 : 0.8) + Math.sin(f * 1.1) * 0.7;
  cloak(P, add(shC, [-0.4, 0, -0.2]), 20, lift, f, seed, R.trim);
  // the off hand on the reins
  const rein = at(5.8, 1.6, 5.6);
  P.push(...chain([add(shC, [0.4, 3.4, -0.6]), add(shC, [2.6, 4.0, -4.2]), rein], 1.0, 0.75, steel, { k: 0.3 }));
  P.push(...chain([rein, add(hd, [2.0, 1.6, -1.2])], 0.2, 0.2, leather, { k: 0.05 }), ...chain([rein, add(hd, [2.0, -1.6, -1.2])], 0.2, 0.2, leather, { k: 0.05 }));
  // the weapon arm (right = -y) and the weapon
  const lanceW = R.weapon === "lance";
  const shR = add(shC, [0.3, -3.4, -0.4]);
  const hand: V3 = lanceW ? add(shC, strike ? [6, -4.6, -3.6] : wind ? [1.4, -4.6, -3.4] : [3.4, -4.6, -4.2])
    : wind ? add(shC, [-2.6, -4.2, 5.4]) : strike ? add(shC, [6.4, -4.4, -3.4]) : add(shC, [3.8, -4.6, -2.8]);
  const u: V3 = norm(lanceW ? (strike ? [1, 0.05, -0.04] : wind ? [1, 0.05, 0.22] : [1, 0.05, 0.12])
    : wind ? [-0.8, -0.05, 0.6] : strike ? [0.82, -0.08, -0.5] : R.weapon === "flail" ? [0.45, -0.05, 0.9] : [0.36, -0.06, 0.93]);
  const side: V3 = norm(crossV(u, [0, 1, 0])); // the blades face forward / back in the swing plane
  const elbow: V3 = add(add(shR, hand), [0, 0, 0], 1).map((v, i) => v / 2 + (i === 2 ? -1.4 : i === 1 ? -1 : 0)) as V3;
  P.push(cap(shR, elbow, 1.2, 1.0, steel, { k: 0.3 }), cap(elbow, hand, 1.0, 0.9, steel, { k: 0.3 }), sphere(hand, 1.05, mat(0x1a1616, { lo: 0.5, hi: 1.6 }), { k: 0.2 }));
  weapon(P, R, hand, u, side, pose, f, halos);

  return { prims: P, eyes, halos, shadow: { x: bx, y: 0, rx: 16, ry: 6.4, a: 0.45 } };
}
