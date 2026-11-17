/**
 * The blobs, 3D-built (mob3d.ts): a sagging, lumpy sack of see-through slime with what it swallowed floating inside
 * (a bone, grit, for the mothers their curled-up young), a wet glint up top, mismatched eyes and a toothy maw, and each
 * kind's extra (spout, helmet, halo, ice, cinders and flame, poison sacs, trapped lightning, crowns) as real parts.
 */
import { cap, chain, cone, custom, ell, mat, mixc, noise3, rbox, rng, sphere, torus, type Mat, type Model, type Prim, type V3 } from "./mob3d";
import { shade } from "../canvas";

export interface BlobPal { G: number; L: number; D: number; E: number }
export type BlobExtra = "shooter" | "warrior" | "healer" | "mother1" | "mother2" | "mother3" | "venom" | "frost" | "fire" | "storm";
export interface BlobOpts { bodyH: number; extra?: BlobExtra; seed?: number }
export type Pose = "stand" | "step" | "wind" | "strike";

/** Footprint radius of a blob drawn w world px wide (its body fills the frame like the painted one did). */
export const blobRadius = (w: number) => w / 2 - 1;
/** Height of the dome so it stands as tall on screen as the painted blob (bodyH) did. */
function domeH(R: number, bodyH: number) {
  const top = bodyH * 0.97 - R * 0.5; // screen px above the footprint centre
  return Math.sqrt(Math.max(1, top * top - (R * 0.5) ** 2)) / (Math.sqrt(3) / 2);
}

const BONE = 0xc9bf9e, GUNK = 0x2b2a12;

export function blobModel(w: number, pal: BlobPal, o: BlobOpts, pose: Pose, f: number): Model {
  const seed = o.seed ?? 3, x = o.extra;
  const R0 = blobRadius(w), H0 = domeH(R0, o.bodyH);
  const wind = pose === "wind", strike = pose === "strike", squish = pose === "step";
  const R = R0 * (wind ? 1.1 : strike ? 0.86 : squish ? 1.05 : 1), H = H0 * (wind ? 0.74 : strike ? 1.1 : squish ? 0.86 : 1);
  const lean = wind ? -0.16 : strike ? 0.2 : 0; // x shift per unit of height: rears back, then lunges
  const bile = mixc(pal.G, 0x8c8a3c, 0.3), gunk = mixc(pal.D, GUNK, 0.35);
  const P: Prim[] = [];
  const molten = x === "fire";
  // ---- the jelly
  const jel: Mat = mat(0, {
    ramp: [shade(gunk, 0.45), shade(gunk, 0.7), shade(pal.D, 0.85), pal.D, mixc(pal.D, bile, 0.5), bile, mixc(bile, pal.G, 0.6), mixc(pal.G, pal.L, 0.3), pal.L],
    spec: 0.9, shine: 30, jelly: molten ? 0.2 : 0.55, emit: molten ? 0.3 : 0, grain: x === "frost" ? 0.2 : 0.06,
  });
  const ph = rng(seed * 977 + 13), p0 = ph() * 6.3, p1 = ph() * 6.3, p2 = ph() * 6.3, wob = f * 0.7;
  const cz = H * 0.36, rz = H * 0.64;
  /** Lumpy, sagging dome sitting on the ground: wider low on the sides, shaved flat at z = 0. */
  const domeD = (px: number, py: number, pz: number) => {
    const sx = px - lean * pz;
    const a = Math.atan2(py, sx);
    const sag = 1 + 0.18 * Math.pow(clamp01(1 - pz / H), 2.2);
    const lump = 1 + 0.07 * Math.sin(a * 3 + p0) + 0.045 * Math.sin(a * 5 + p1) + 0.02 * Math.sin(a * 8 + p2 + wob);
    const rr = R * sag * lump;
    const qx = sx / rr, qy = py / rr, qz = (pz - cz) / rz;
    const k0 = Math.hypot(qx, qy, qz), k1 = Math.hypot(qx / rr, qy / rr, qz / rz);
    let d = (k0 * (k0 - 1)) / k1;
    d += (noise3(px * 0.55 + seed, py * 0.55, pz * 0.55 + wob * 0.3) - 0.5) * 0.5; // greasy unevenness
    return Math.max(d, -pz);
  };
  P.push(custom([-R * 1.5, -R * 1.5, -0.5], [R * 1.5, R * 1.5, H + 1], domeD, jel, { k: 0.4 }));
  // the ooze it leaves under itself
  P.push(ell([0.2, 0, 0], [R * 1.22, R * 1.18, 0.55], jel, { k: 1.4 }));
  // ---- what floats inside
  const inner = (p: Prim) => { p.inner = true; P.push(p); };
  const core = mat(shade(gunk, 0.85), { lo: 0.4, hi: 1.1, grain: 0.1 });
  inner(ell([0.1 * R, 0, H * 0.3], [R * 0.5, R * 0.45, H * 0.26], core, { k: 0.6 }));
  if (w >= 10) {
    const bone = mat(BONE, { lo: 0.45, hi: 1.25 }), by = (ph() - 0.5) * R * 0.5;
    inner(cap([-R * 0.45, by, H * 0.3], [R * 0.25, by + R * 0.2, H * 0.42], 0.32, 0.32, bone));
    inner(sphere([-R * 0.45, by, H * 0.3], 0.5, bone, { k: 0.2 }));
    inner(sphere([R * 0.25, by + R * 0.2, H * 0.42], 0.5, bone, { k: 0.2 }));
  }
  if (x?.startsWith("mother")) { // her young, curled up and half dissolved
    const yg = mat(mixc(pal.L, bile, 0.5), { lo: 0.45, hi: 1.2 });
    for (const [bx, by, bz, s] of [[-R * 0.15, -R * 0.4, 2.2, 1.7], [R * 0.25, R * 0.42, 3.0, 1.5], [R * 0.45, -R * 0.05, 1.4, 1.3]] as const) {
      inner(ell([bx, by, bz], [s * 1.1, s, s * 0.8], yg, { k: 0.3 }));
      inner(sphere([bx + s * 0.6, by, bz + s * 0.2], s * 0.25, mat(gunk), { k: 0.1 }));
    }
    // and a skull she never finished
    const sk = mat(BONE, { lo: 0.4, hi: 1.2 });
    inner(sphere([-R * 0.35, R * 0.2, H * 0.48], 1.5, sk, { k: 0.3 }));
    inner(sphere([-R * 0.35 + 1.3, R * 0.2 + 0.5, H * 0.45], 0.45, mat(GUNK), { k: 0.1 }));
    inner(sphere([-R * 0.35 + 1.3, R * 0.2 - 0.5, H * 0.45], 0.45, mat(GUNK), { k: 0.1 }));
  }
  // ---- the surface: where things sit on the front of the dome (angle round, height up)
  const surf = (az: number, z: number, out = 0): V3 => {
    const sag = 1 + 0.18 * Math.pow(clamp01(1 - z / H), 2.2), qz = (z - cz) / rz;
    const r = R * sag * Math.sqrt(Math.max(0, 1 - qz * qz)) + out;
    return [Math.cos(az) * r + lean * z, Math.sin(az) * r, z];
  };
  // pustules swelling out of the skin
  const pus = mat(mixc(0xd8cf6a, pal.L, 0.25), { lo: 0.45, hi: 1.25, spec: 0.6 });
  const rs = rng(seed * 31 + 7);
  for (let k = 0; k < Math.max(1, Math.round(w / 7)); k++) {
    const az = Math.PI * (0.35 + rs() * 1.3) * (rs() < 0.5 ? 1 : -1), z = H * (0.35 + rs() * 0.4), pr = 0.45 + rs() * Math.max(0.3, w / 22);
    P.push(sphere(surf(az, z, -pr * 0.3), pr, pus, { k: 0.25 }));
  }
  // ---- face (on the front, +x)
  const es = Math.max(0.75, w / 14), gap = Math.max(1, w / 6.8), ez = H * 0.56;
  const white = mat(0xe6dfa8, { lo: 0.55, hi: 1.15, spec: 0.5 }), dark = mat(0x1e0a10, { lo: 0.6, hi: 1 });
  const eyes: Model["eyes"] = [];
  for (const [side, k, look] of [[1, 1.15, -0.3], [-1, 0.82, 0.25]] as const) {
    const s = es * k, az = Math.atan2(side * gap, R) * 1.05, c = surf(az, ez + (side < 0 ? -0.25 : 0), -s * 0.35);
    P.push(sphere(c, s * 1.35, mat(shade(gunk, 0.5), { lo: 0.5, hi: 0.9 }), { cut: true, k: 0.25 })); // socket
    P.push(sphere(c, s, white, { k: 0.15 }));
    const fwd: V3 = [Math.cos(az), Math.sin(az), 0];
    eyes.push({ p: [c[0] + fwd[0] * s * 0.95, c[1] + fwd[1] * s * 0.95 + look * s * 0.4, c[2] - s * 0.1], col: pal.E });
    // heavy lid sliding over the top (scowling when it attacks)
    const lidZ = (wind || strike) ? s * 0.35 : s * 0.62;
    P.push(ell([c[0] + 0.1, c[1] + side * (wind || strike ? s * 0.15 : 0), c[2] + lidZ], [s * 1.0, s * 1.25, s * 0.5], jel, { k: 0.25, pitch: wind || strike ? 0.25 : 0 }));
  }
  // drooling maw full of crooked teeth
  const open = (wind ? 0.9 : strike ? 1.6 : 0.55) * es, mz = ez - es * 2.1 - open * 0.3, mw = Math.max(0.9, gap * 0.85);
  const mc = surf(0.08, mz, -0.25);
  P.push(ell(mc, [1.1 + open * 0.4, mw, Math.max(0.35, open * 0.55)], dark, { cut: true, k: 0.35 }));
  P.push(ell([mc[0] - 0.7, mc[1], mc[2] - open * 0.3], [0.7, mw * 0.55, Math.max(0.25, open * 0.25)], mat(0x7a2633, { lo: 0.5, hi: 1.1 }), { k: 0.2 })); // tongue
  const tooth = mat(0xe8e0bc, { lo: 0.55, hi: 1.1 });
  for (let k = 0; k < 4; k++) {
    const ty = -mw * 0.75 + k * mw * 0.5, top = mc[2] + Math.max(0.3, open * 0.5) - 0.1;
    P.push(cone([mc[0] + 0.2, ty, top], [mc[0] + 0.35, ty + (k % 2 ? 0.1 : -0.05), top - open * (0.45 + (k % 3) * 0.15) - 0.25], 0.32, tooth));
  }
  P.push(cap([mc[0] + 0.5, mw * 0.4, mc[2] - open * 0.4], [mc[0] + 0.9, mw * 0.45, Math.max(0.2, mc[2] - open * 0.4 - 1.2 - (f % 2) * 0.4)], 0.28, 0.18, jel, { k: 0.2 })); // drool
  const halos: Model["halos"] = [];
  // ---- extras
  const top = surf(0, H * 0.98);
  if (x === "shooter") {
    const iron = mat(0x4a4458, { spec: 0.8, lo: 0.32, hi: 1.4, grain: 0.12 });
    const a: V3 = [top[0] - 0.4, 0, H * 0.82], b: V3 = [top[0] + 1.1, 0, H + 2.3];
    P.push(cap(a, b, 1.15, 0.9, iron, { k: 0.5 }));
    P.push(torus([b[0], 0, b[2] - 0.05], 0.85, 0.32, iron, { tilt: 0 }));
    P.push(sphere(b, 0.62, mat(0x0e0c14), { cut: true, k: 0.1 }));
  } else if (x === "warrior") {
    const steel = mat(0x8e96a2, { spec: 1.0, shine: 30, lo: 0.3, hi: 1.25, grain: 0.22 });
    const hz = H * 0.6, hr = R * 0.82;
    P.push(custom([-hr - 1, -hr - 1, hz - 1], [hr + 1, hr + 1, H + 2], (px, py, pz) => {
      const sx = px - lean * pz;
      const qx = sx / hr, qy = py / hr, qz = (pz - hz) / (H * 0.52);
      const k0 = Math.hypot(qx, qy, qz), k1 = Math.hypot(qx / hr, qy / hr, qz / (H * 0.52));
      return Math.max((k0 * (k0 - 1)) / k1, hz - pz);
    }, steel, { k: 0.15 }));
    P.push(torus([lean * hz, 0, hz + 0.15], hr * 0.97, 0.4, mat(0x5b6470, { spec: 0.6 }))); // brim
    const red = mat(0xc22a33, { lo: 0.35, hi: 1.3, grain: 0.15 });
    for (let k = 0; k < 5; k++) {
      const u = (k - 2) / 2;
      P.push(...chain([[u * hr * 0.6 + lean * H, 0, H + 0.2], [u * hr * 0.75 - 0.4 + lean * H, 0, H + 1.6 - Math.abs(u) * 0.4], [u * hr * 0.9 - 1.2 + lean * H, 0, H + 2.4 - Math.abs(u) * 0.8]], 0.42, 0.3, red));
    }
  } else if (x === "healer") {
    const gold = mat(0xffd54f, { emit: 0.7, spec: 0.8, lo: 0.5, hi: 1.25 });
    const hz = H + 1.6 + Math.sin(f * 1.3) * 0.3;
    P.push(torus([lean * H, 0, hz], R * 0.58, 0.42, gold));
    halos.push({ p: [lean * H, 0, hz], r: R * 0.9, col: 0xffd54f, a: 0.35 });
    const green = mat(0x43c463, { emit: 0.75, lo: 0.6, hi: 1.3 });
    const gc = surf(0.8, H * 0.3, -0.25); // a glowing cross welling up under the skin of its belly
    P.push(rbox(gc, [0.45, 0.4, 1.25], 0.1, green, { k: 0.15, yaw: 0.8 }));
    P.push(rbox(gc, [0.45, 1.25, 0.4], 0.1, green, { k: 0.15, yaw: 0.8 }));
  } else if (x === "venom") {
    const sac = mat(0x8fd13a, { jelly: 0.3, spec: 0.9, emit: 0.3, lo: 0.4, hi: 1.25 });
    const sw = wind ? 1.35 : strike ? 0.8 : 1, k = Math.max(0.8, w / 14);
    for (const [az, z, r0] of [[2.6, 0.72, 1.4], [-2.4, 0.66, 1.6], [3.1, 0.92, 1.1]] as const) {
      const c = surf(az, H * z, -0.3), r = r0 * sw * k;
      P.push(sphere(c, r, sac, { k: 0.4 }));
      halos.push({ p: c, r: r * 2, col: 0x9be564, a: 0.22 });
    }
    inner(cap([-R * 0.3, -R * 0.2, H * 0.2], [R * 0.2, R * 0.3, H * 0.55], 0.28, 0.2, mat(0x3a1440))); // poison veins
    inner(cap([-R * 0.4, R * 0.3, H * 0.15], [0, -R * 0.1, H * 0.5], 0.25, 0.18, mat(0x3a1440)));
    P.push(cap([mc[0] + 0.4, -mw * 0.3, mc[2] - open * 0.3], [mc[0] + 0.7, -mw * 0.3, Math.max(0.2, mc[2] - 1.4 - (f % 3) * 0.4)], 0.3, 0.2, mat(0xb4e04e, { emit: 0.5 }), { k: 0.15 }));
  } else if (x === "frost") {
    const ice = mat(0x9fd0f0, { spec: 1.2, shine: 34, lo: 0.45, hi: 1.45 });
    for (const [az, h0, r0] of [[2.4, 2.2, 0.9], [3.0, 3.6, 1.1], [-2.7, 2.9, 1.0], [-2.0, 1.8, 0.8], [0.9, 1.6, 0.7]] as const) {
      const b = surf(az, H * 0.82, -0.4), out: V3 = [Math.cos(az) * 0.5, Math.sin(az) * 0.5, 1];
      const hh = h0 * (wind ? 1.2 : 1);
      P.push(cone(b, [b[0] + out[0] * hh * 0.5, b[1] + out[1] * hh * 0.5, b[2] + hh], r0, ice));
    }
    for (let k = 0; k < 5; k++) { const az = -0.9 + k * 0.45, b = surf(az, 0.9, 0.1); P.push(cone(b, [b[0] + 0.1, b[1], -0.6 - (k % 2) * 0.5], 0.4, ice)); }
    inner(sphere([0.1 * R, 0, H * 0.38], R * 0.32, mat(0x9fdcff, { emit: 0.6 }), { k: 0.4 }));
    halos.push({ p: [0, 0, H + 1], r: R, col: 0xbfe8ff, a: 0.18 });
  } else if (x === "fire") {
    const cinder = mat(0x231210, { lo: 0.6, hi: 2.0, grain: 0.35 });
    const cr = rng(seed * 53 + 1);
    for (let k = 0; k < 16; k++) {
      const az = (cr() - 0.5) * Math.PI * 2, z = H * (0.2 + cr() * 0.65), c = surf(az, z, -0.1), s = 1.0 + cr() * R * 0.2;
      P.push(ell(c, [s, s * 0.9, 0.45], cinder, { k: 0.2, yaw: az, pitch: -(1 - z / H) * 1.2 }));
    }
    const fl = rng(f * 13 + 5), flame = mat(0xe0461a, { emit: 0.8, lo: 0.6, hi: 1.35 }), core2 = mat(0xffb347, { emit: 0.9, lo: 0.8, hi: 1.3 });
    for (let k = 0; k < 5; k++) {
      const u = (k + 0.5) / 5 - 0.5, b = surf(u * 1.9 + Math.PI, H * (0.9 - Math.abs(u) * 0.25), -0.5);
      const hh = (1.7 + fl() * 1.6) * (1 - Math.abs(u) * 0.8) * (wind ? 1.5 : 1), tip: V3 = [b[0] + (fl() - 0.5) * 0.9 - 0.4, b[1] + (fl() - 0.5) * 0.6, b[2] + hh + 0.6];
      P.push(cone(b, tip, 0.85, flame, { k: 0.5 }));
      P.push(cone([b[0] + 0.1, b[1], b[2] + 0.2], [tip[0] * 0.6 + b[0] * 0.4, tip[1], b[2] + hh * 0.6], 0.42, core2, { k: 0.1 }));
    }
    for (let k = 0; k < 3; k++) P.push(sphere([(fl() - 0.5) * R * 1.4, (fl() - 0.5) * R, H + 2 + fl() * 3], 0.32, core2, { k: 0 }));
    halos.push({ p: [0, 0, H * 0.7], r: R * 1.6, col: 0xff8a2a, a: wind ? 0.5 : 0.32 });
  } else if (x === "storm") {
    const bolt = mat(0xd8e0ff, { emit: 0.95, lo: 0.8, hi: 1.25 }), lr = rng(seed * 67 + f * 7 + 4);
    for (let k = 0; k < 2; k++) {
      let px = -R * 0.7, py = (lr() - 0.5) * R, pz = H * (0.2 + lr() * 0.4);
      const pts: V3[] = [[px, py, pz]];
      while (px < R * 0.7) { px += 0.9 + lr() * 1.1; py += (lr() - 0.5) * 1.2; pz = Math.min(H * 0.75, Math.max(0.6, pz + (lr() - 0.5) * 1.8)); pts.push([px, py, pz]); }
      for (const c of chain(pts, 0.3, 0.3, bolt)) inner(c);
    }
    const st = rng(f * 17 + 9), spike = mat(0x6a68e8, { emit: 0.7, lo: 0.6, hi: 1.4 });
    for (let k = 0; k < 6; k++) {
      const u = (k + 0.5) / 6 - 0.5, b = surf(u * 2.6 + Math.PI * (k % 2), H * (0.86 - Math.abs(u) * 0.3), -0.3);
      const len = 1.4 + st() * 1.4 + (wind ? 0.8 : 0), pts: V3[] = [b];
      let q = b;
      for (let v = 0; v < 3; v++) { q = [q[0] + (st() - 0.5) * 0.9, q[1] + u * 0.8 + (st() - 0.5) * 0.5, q[2] + len / 3]; pts.push(q); }
      P.push(...chain(pts, 0.36, 0.22, spike));
    }
    halos.push({ p: [0, 0, H * 0.8], r: R * 1.3, col: 0x8090f8, a: 0.3 });
  } else if (x === "mother1" || x === "mother3") {
    const iron = x === "mother3";
    const metalM = mat(iron ? 0x9aa3ad : 0xffc93c, { spec: 1.1, shine: 30, lo: 0.32, hi: 1.35, grain: iron ? 0.15 : 0.04 });
    const cz2 = H * 0.86, cr2 = R * 0.3, sx = lean * cz2;
    P.push(custom([sx - cr2 - 1, -cr2 - 1, cz2 - 1], [sx + cr2 + 1, cr2 + 1, cz2 + 2], (px, py, pz) => Math.max(Math.abs(Math.hypot(px - sx, py) - cr2) - 0.35, Math.abs(pz - cz2 - 0.8) - 1.0), metalM, { k: 0.2 }));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, tall = (k === 0 ? (iron ? 2.6 : 1.9) : iron ? 1.9 : 1.2);
      const b: V3 = [sx + Math.cos(a) * cr2, Math.sin(a) * cr2, cz2 + 1.6];
      P.push(cone(b, [b[0] + Math.cos(a) * 0.2, b[1] + Math.sin(a) * 0.2, b[2] + tall * 1.4], 0.7, metalM));
    }
    const gem: V3 = [sx + cr2 + 0.35, 0, cz2 + 0.5];
    P.push(sphere(gem, 0.5, mat(0xe63946, { spec: 1, emit: 0.4 }), { k: 0.05 }));
    eyes.push({ p: [gem[0] + 0.45, 0, gem[2] + 0.1], col: 0xff7a80 });
    halos.push({ p: gem, r: 1.6, col: 0xe63946, a: 0.35 });
  }
  return { prims: P, eyes, halos, shadow: { x: 0, y: 0, rx: R * 1.32, ry: R * 1.25, a: 0.42 } };
}

function clamp01(v: number) { return v < 0 ? 0 : v > 1 ? 1 : v; }
