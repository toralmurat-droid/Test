/**
 * The clan war's carts, the Host's bone ram and the Hide-Kin tunnel mouth, 3D-built (mob3d.ts, Murat 2026-11-17).
 * Same sheets as the painted ones (warCarts.ts, warRam.ts, warTunnel.ts): 14 frames, 0-5 walk (down, up, right),
 * 6-8 idle, 9-11 mid-stride, 12 staggering, 13 wrecked. A cart is the draught beast and its cart as one model
 * (x forward, y its left, z up, world px, wheels on z = 0); down / up views draw the team a little smaller, pulled in
 * so it fits the 44 px frame (the painted sheets did the same).
 */
import { cap, chain, cone, custom, ell, mat, mixc, rbox, renderMob, sphere, torus, YAW, type Mat, type MobFrame, type Model, type Prim, type V3 } from "./mob3d";
import { shade } from "../canvas";
import { scaleModel } from "./beasts3d";

type Clan = "wardens" | "redfang" | "host" | "hidekin" | "veiled";
type Dir = "down" | "up" | "right";
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** A ramp kept as the colour (no auto-brightening of dark things). */
export const dk = (col: number, lo = 0.45, hi = 1.5, o: Partial<Omit<Mat, "ramp">> = {}, n = 8): Mat =>
  mat(col, { ...o, ramp: Array.from({ length: n }, (_, i) => shade(col, lo + (hi - lo) * (i / (n - 1)))) });
const glowM = (col: number) => mat(col, { emit: 1, lo: 0.85, hi: 1.5 });

const BONE = 0xd8cfb2, WOOD = 0x6b4a2a, IRON = 0x6a6a68, GOLD = 0xe9b84a, TEAL = 0x4fe8c0;
const wood = (c = WOOD) => dk(c, 0.45, 1.45, { grain: 0.35 });
const bone = () => dk(BONE, 0.4, 1.18, { grain: 0.15, spec: 0.15 });
const iron = () => dk(IRON, 0.4, 1.45, { spec: 0.8, shine: 22, grain: 0.1 });
export const gold = () => dk(GOLD, 0.45, 1.35, { spec: 1, shine: 26 });

// ---------------------------------------------------------------- transforms of whole prim lists
/** Prims moved by `fwd` (world -> model inverse) with their boxes refit through `inv`'s forward map. */
function remap(ps: Prim[], fwd: (p: V3) => V3, inv: (p: V3) => V3): Prim[] {
  return ps.map((p) => {
    const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
    for (let c = 0; c < 8; c++) { const q = fwd([c & 1 ? p.hi[0] : p.lo[0], c & 2 ? p.hi[1] : p.lo[1], c & 4 ? p.hi[2] : p.lo[2]]); for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], q[i]); hi[i] = Math.max(hi[i], q[i]); } }
    return { ...p, lo, hi, d: (x: number, y: number, z: number) => { const q = inv([x, y, z]); return p.d(q[0], q[1], q[2]); } };
  });
}
/** Tip prims about the axis through `o`: `pitch` about y (+ lifts the front), `roll` about x (+ lifts the right side). */
function tip(ps: Prim[], o: V3, pitch: number, roll = 0): Prim[] {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const fwd = (p: V3): V3 => { let x = p[0] - o[0], y = p[1] - o[1], z = p[2] - o[2]; [x, z] = [x * cp - z * sp, x * sp + z * cp]; [y, z] = [y * cr - z * sr, y * sr + z * cr]; return [x + o[0], y + o[1], z + o[2]]; };
  const inv = (p: V3): V3 => { let x = p[0] - o[0], y = p[1] - o[1], z = p[2] - o[2]; [y, z] = [y * cr + z * sr, -y * sr + z * cr]; [x, z] = [x * cp + z * sp, -x * sp + z * cp]; return [x + o[0], y + o[1], z + o[2]]; };
  return remap(ps, fwd, inv);
}
function shiftModel(m: Model, dx: number): Model {
  const mv = (p: V3): V3 => [p[0] + dx, p[1], p[2]];
  return { ...m, prims: remap(m.prims, mv, (p) => [p[0] - dx, p[1], p[2]]), eyes: m.eyes?.map((e) => ({ ...e, p: mv(e.p) })), halos: m.halos?.map((h) => ({ ...h, p: mv(h.p) })), shadow: { ...m.shadow, x: m.shadow.x + dx } };
}

// ---------------------------------------------------------------- shared parts
/** A spoked cart wheel standing in the x-z plane at `c`, turned by `ang`. */
function wheel(P: Prim[], c: V3, r: number, ang: number, rim: number, spokes = 8) {
  const R = wood(rim);
  P.push(torus(c, r - 0.55, 0.75, R, { tilt: Math.PI / 2, k: 0.1 }));
  for (let i = 0; i < spokes; i++) { const a = ang + (i / spokes) * Math.PI * 2; P.push(cap(c, add(c, [Math.cos(a) * (r - 0.8), 0, Math.sin(a) * (r - 0.8)]), 0.38, 0.32, R, { k: 0.1 })); }
  P.push(cap(add(c, [0, -1.0, 0]), add(c, [0, 1.0, 0]), 1.3, 1.3, iron(), { k: 0.2 }));
}
/** A wheel lying flat on the ground (wreck). */
const flatWheel = (P: Prim[], c: V3, r: number, rim: number) => { P.push(torus(c, r - 0.55, 0.7, wood(rim), { k: 0.1 })); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + 0.3; P.push(cap(c, add(c, [Math.cos(a) * (r - 0.8), Math.sin(a) * (r - 0.8), 0]), 0.35, 0.3, wood(rim), { k: 0.1 })); } };
/** A small skull, facing +x; `eye` glows when given. */
function skull(P: Prim[], c: V3, r: number, eyes: NonNullable<Model["eyes"]>, eye?: number) {
  P.push(sphere(c, r, bone(), { k: 0.2 }), ell(add(c, [r * 0.55, 0, -r * 0.55]), [r * 0.55, r * 0.6, r * 0.45], bone(), { k: 0.3 }));
  for (const s of [-1, 1]) P.push(sphere(add(c, [r * 0.8, s * r * 0.38, 0]), r * 0.3, dk(0x1a1410, 1, 1), { k: 0.1, cut: true }));
  if (eye !== undefined) for (const s of [-1, 1]) eyes.push({ p: add(c, [r * 0.85, s * r * 0.38, 0]), col: eye });
}

// ---------------------------------------------------------------- the draught beasts (facing +x, centred on bx)
interface Beast { col: number; rx: number; rz: number; ry: number; leg: number; legR: number; neck: [number, number]; bone?: boolean }
const OX: Beast = { col: 0x7a5a3a, rx: 8.4, rz: 5.4, ry: 4.6, leg: 7.2, legR: 1.3, neck: [4.6, 0.6] };
const BOAR: Beast = { col: 0x4a3426, rx: 6.6, rz: 4.8, ry: 3.7, leg: 5.0, legR: 1.25, neck: [4.0, 0.4] };
const HORSE: Beast = { col: 0x141a18, rx: 7.8, rz: 4.4, ry: 3.8, leg: 9.0, legR: 0.65, neck: [4.4, 5.6], bone: true };
const MOLE: Beast = { col: 0x56524c, rx: 9.6, rz: 5.8, ry: 5.4, leg: 3.6, legR: 1.9, neck: [4.6, 0.2] };
const CAMEL: Beast = { col: 0xb8905a, rx: 8.2, rz: 4.6, ry: 4.0, leg: 10.2, legR: 0.95, neck: [6.4, 9.6] };

export function beast(P: Prim[], eyes: NonNullable<Model["eyes"]>, halos: NonNullable<Model["halos"]>, clan: Clan, bx: number, by: number, p: number, bow: number) {
  const S = clan === "wardens" ? OX : clan === "redfang" ? BOAR : clan === "host" ? HORSE : clan === "hidekin" ? MOLE : CAMEL;
  const C = dk(S.col, 0.42, 1.5, { grain: 0.3, spec: 0.1 }), Cd = dk(mixc(S.col, 0, 0.3), 0.45, 1.4, { grain: 0.3 });
  const B = bone(), legM = S.bone ? B : Cd;
  const bz = S.leg + S.rz * 0.75, at = (x: number, y: number, z: number): V3 => [bx + x, by + y, bz + z];
  const swing = [0, 1.8, -1.8][p];
  // legs: diagonal pairs swing together
  const legs = [{ x: S.rx * 0.58, s: 1, front: true, k: 1 }, { x: S.rx * 0.58, s: -1, front: true, k: -1 }, { x: -S.rx * 0.58, s: 1, front: false, k: -1 }, { x: -S.rx * 0.58, s: -1, front: false, k: 1 }];
  for (const L of legs) {
    const sw = swing * L.k, lift = sw > 0.5 ? 1 : 0, hip = at(L.x, L.s * S.ry * 0.55, -S.rz * 0.45), foot: V3 = [hip[0] + sw, hip[1], 0.5 + lift];
    const knee: V3 = [(hip[0] + foot[0]) / 2 + (L.front ? 0.6 : -0.9), hip[1], (hip[2] + foot[2]) / 2];
    P.push(cap(hip, knee, S.legR * 1.35, S.legR, legM, { k: S.bone ? 0.2 : 0.6 }), cap(knee, foot, S.legR, S.legR * 0.9, legM, { k: 0.3 }));
    if (S.bone) P.push(sphere(knee, S.legR * 1.3, B, { k: 0.1 }));
    P.push(ell(add(foot, [0.3, 0, -0.1]), [S.legR * 1.2, S.legR * 1.1, 0.55], dk(clan === "host" ? 0x2a2420 : 0x241812, 0.6, 1.6), { k: 0.2 }));
    if (clan === "hidekin") for (let i = -1; i <= 1; i++) P.push(cone(add(foot, [1.0, i * 0.7, 0.2]), add(foot, [2.6, i * 0.9, -0.2]), 0.35, B));
  }
  // body
  if (S.bone) {
    // a bone horse: a dark hollow barrel caged in ribs, a spine, a tattered teal caparison, a ghost glow inside
    P.push(ell(at(0, 0, 0), [S.rx * 0.92, S.ry * 0.85, S.rz * 0.85], dk(0x141a18, 0.6, 1.4), { k: 0.4 }));
    for (let i = -3; i <= 3; i++) P.push(ringX(at(i * 2, 0, 0), S.ry * 0.95, 0.42, B));
    P.push(...chain([at(-S.rx, 0, S.rz * 0.8), at(0, 0, S.rz * 0.95), at(S.rx, 0, S.rz * 0.8)], 0.8, 0.7, B));
    P.push(ell(at(-S.rx * 0.8, 0, 0.4), [2.4, S.ry * 0.9, 2.0], B, { k: 0.4 })); // pelvis
    P.push(ell(at(0.5, 0, 2.6), [4.4, S.ry * 1.08, 1.6], dk(0x1f3a34, 0.5, 1.5, { grain: 0.3 }), { k: 0.3 }));
    halos.push({ p: at(0, 0, 0), r: 6, col: TEAL, a: 0.25 });
  } else {
    P.push(ell(at(0, 0, 0), [S.rx, S.ry, S.rz], C, { k: 1.2 }));
    P.push(ell(at(S.rx * 0.45, 0, 0.4), [S.rx * 0.55, S.ry * 1.04, S.rz * 1.02], C, { k: 1.4 }));
  }
  // neck and head
  const nb = at(S.rx * 0.75, 0, S.rz * 0.3), hd = add(nb, [S.neck[0], 0, S.neck[1] - bow]);
  if (S.bone) for (let i = 0; i <= 4; i++) P.push(sphere(add(nb, [(hd[0] - nb[0]) * i / 4, 0, (hd[2] - nb[2]) * i / 4]), 1.05, B, { k: 0.15 }));
  else P.push(cap(nb, hd, S.rz * 0.72, S.rz * 0.5, C, { k: 1 }));
  switch (clan) {
    case "wardens": {
      P.push(ell(add(hd, [1.6, 0, -0.6]), [3.0, 2.5, 2.3], C, { k: 0.8 }), ell(add(hd, [4.0, 0, -1.6]), [1.6, 1.9, 1.4], dk(0xc79a86, 0.5, 1.3), { k: 0.6 }));
      for (const s of [-1, 1]) { P.push(...chain([add(hd, [0.4, s * 2.0, 1.4]), add(hd, [0.2, s * 4.0, 2.4]), add(hd, [1.6, s * 4.6, 4.2])], 0.75, 0.3, B)); P.push(cone(add(hd, [-0.2, s * 2.3, 0.4]), add(hd, [-1.4, s * 3.8, 0.0]), 0.8, Cd)); }
      P.push(torus(add(hd, [5.2, 0, -2.6]), 0.8, 0.22, gold(), { tilt: Math.PI / 2, k: 0.05 }));
      // yoke and a wide amber-and-green harness blanket
      P.push(ell(at(-0.6, 0, 1.4), [5.0, S.ry * 1.06, S.rz * 0.95], dk(0xc8741f, 0.45, 1.35, { grain: 0.25 }), { k: 0.25 }));
      P.push(ringX(at(2.6, 0, 0), S.ry * 1.02, 0.4, dk(0x3b4a2c)));
      P.push(sphere(at(-0.6, S.ry * 1.05, 0.4), 1.1, gold(), { k: 0.1 }), sphere(at(-0.6, -S.ry * 1.05, 0.4), 1.1, gold(), { k: 0.1 }));
      P.push(cap(at(S.rx * 0.6, -S.ry * 1.4, S.rz * 0.95), at(S.rx * 0.6, S.ry * 1.4, S.rz * 0.95), 0.9, 0.9, wood(), { k: 0.2 }));
      P.push(...chain([at(-S.rx, 0, 1.6), at(-S.rx - 1.4, 0, -1.4), at(-S.rx - 1.2, 0, -4.4)], 0.5, 0.3, Cd));
      break;
    }
    case "redfang": {
      P.push(cap(hd, add(hd, [4.0, 0, -1.2]), 2.6, 1.5, C, { k: 0.8 }), ell(add(hd, [4.4, 0, -1.3]), [0.6, 1.3, 1.2], dk(0xb58c78, 0.5, 1.3), { k: 0.3 }));
      for (const s of [-1, 1]) { P.push(...chain([add(hd, [3.2, s * 1.3, -1.8]), add(hd, [3.8, s * 1.6, -0.6]), add(hd, [3.4, s * 1.5, 0.6])], 0.45, 0.15, dk(0xe3d6b8, 0.6, 1.2))); P.push(cone(add(hd, [-0.4, s * 1.6, 1.4]), add(hd, [-1.4, s * 2.4, 3.0]), 0.8, Cd)); eyes.push({ p: add(hd, [1.8, s * 1.6, 0.6]), col: 0xff6a30 }); }
      for (let i = 0; i < 9; i++) { const x = -S.rx + i * 1.7; P.push(cone(at(x, 0, S.rz * 0.8), at(x - 0.5, (i % 2 ? 0.4 : -0.4), S.rz + 1.8), 0.6, dk(0x1e140e, 0.6, 1.6))); }
      P.push(ringX(at(0.6, 0, 0), S.ry * 1.02, 0.55, dk(0x8e1f1a, 0.5, 1.4)));
      P.push(...chain([at(-S.rx, 0, 1), at(-S.rx - 1.6, 0, 1.8), at(-S.rx - 1.2, 0, 0)], 0.3, 0.2, dk(0x2a1c14)));
      break;
    }
    case "host": {
      P.push(cap(hd, add(hd, [4.8, 0, -2.6]), 1.7, 1.0, B, { k: 0.5 }), cap(add(hd, [0.8, 0, -1.4]), add(hd, [4.4, 0, -3.6]), 0.7, 0.45, B, { k: 0.2 }));
      for (const s of [-1, 1]) { P.push(sphere(add(hd, [1.2, s * 1.2, 0.2]), 0.65, dk(0x0c1412, 1, 1), { k: 0.1, cut: true })); eyes.push({ p: add(hd, [1.3, s * 1.1, 0.2]), col: 0x9ffff0 }); P.push(cone(add(hd, [-0.4, s * 0.8, 1.0]), add(hd, [-1.0, s * 1.0, 3.0]), 0.6, B)); }
      halos.push({ p: add(hd, [1.2, 0, 0.2]), r: 3, col: TEAL, a: 0.45 });
      const mane = mat(0x2f8f78, { jelly: 0.4, emit: 0.35, lo: 0.6, hi: 1.4 });
      for (let i = 0; i < 4; i++) { const q = i / 3, r0 = add(nb, [(hd[0] - nb[0]) * q, 0, (hd[2] - nb[2]) * q + 1]); P.push(...chain([r0, add(r0, [-2.4, (i % 2 ? 0.6 : -0.6), -0.4]), add(r0, [-4.2, (i % 2 ? 1 : -1), -2.0])], 0.55, 0.2, mane)); }
      P.push(...chain([at(-S.rx, 0, 2), at(-S.rx - 2.4, 0.5, -0.6), at(-S.rx - 2.2, -0.4, -4.6)], 0.6, 0.25, mane));
      break;
    }
    case "hidekin": {
      P.push(cap(hd, add(hd, [5.0, 0, -0.8]), 2.9, 1.4, C, { k: 0.8 }), sphere(add(hd, [5.6, 0, -0.9]), 0.9, dk(0x1a1410, 0.6, 1.6), { k: 0.2 }));
      P.push(cap(add(hd, [-0.6, 0, 2.4]), add(hd, [5.2, 0, 0.6]), 0.9, 0.5, dk(0xe0dcd0, 0.5, 1.15), { k: 0.4 })); // the white badger stripe
      for (const s of [-1, 1]) { eyes.push({ p: add(hd, [2.4, s * 1.7, 0.6]), col: 0xd8d0c0 }); P.push(sphere(add(hd, [-0.6, s * 2.4, 1.6]), 0.8, dk(0x2a2622), { k: 0.2 })); }
      for (let i = 0; i < 12; i++) { const x = -S.rx + 1 + i * 1.5; P.push(cone(at(x, 0, S.rz * 0.9), at(x - 0.6, (i % 2 ? 0.5 : -0.5), S.rz + 1.2), 0.5, dk(0x2a2622, 0.6, 1.5))); }
      P.push(ringX(at(-1, 0, 0), S.ry * 1.02, 0.5, dk(0x8a5e30)), rbox(at(3, 0, S.rz * 0.92), [2, 2.4, 0.4], 0.3, dk(0x8a6a40, 0.45, 1.35, { grain: 0.3 }), { k: 0.2 }));
      break;
    }
    case "veiled": {
      P.push(cap(hd, add(hd, [3.6, 0, -0.8]), 1.9, 1.3, C, { k: 0.6 }), ell(add(hd, [4.0, 0, -1.0]), [1.3, 1.2, 1.1], Cd, { k: 0.4 }));
      for (const s of [-1, 1]) { P.push(cone(add(hd, [-0.6, s * 1.2, 1.2]), add(hd, [-1.2, s * 1.6, 2.4]), 0.5, Cd)); P.push(sphere(add(hd, [1.2, s * 1.5, 0.6]), 0.3, dk(0x1a1008, 0.8, 1.2), { k: 0.05 })); }
      P.push(ell(at(-0.8, 0, S.rz + 1.6), [3.6, 3.0, 3.2], C, { k: 1.2 })); // the hump
      P.push(ell(at(-0.4, 0, 0.8), [5.4, S.ry * 1.06, S.rz * 0.95], dk(0x3a3a82, 0.45, 1.45, { grain: 0.2 }), { k: 0.25 }));
      P.push(torus(at(-0.4, 0, -2.4), S.ry * 1.08, 0.38, gold(), { k: 0.05 }), sphere(at(-0.4, S.ry * 1.08, 0), 1.0, gold(), { k: 0.1 }));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; P.push(cone(at(-0.4 + Math.cos(a) * 4.8, Math.sin(a) * S.ry * 1.06, -2.6), at(-0.4 + Math.cos(a) * 4.9, Math.sin(a) * S.ry * 1.1, -4.2), 0.3, gold())); }
      P.push(...chain([at(-S.rx, 0, 1), at(-S.rx - 0.8, 0, -3)], 0.35, 0.3, Cd));
      break;
    }
  }
}

// ---------------------------------------------------------------- the carts (bed from x = -26 to 2, axle at -12)
function cart(P: Prim[], eyes: NonNullable<Model["eyes"]>, halos: NonNullable<Model["halos"]>, clan: Clan, ang: number, wreck: number) {
  const W = wreck === 2, hw = clan === "hidekin" ? 9.4 : 8.6, wx = -12, wr = 6.8;
  const rim = clan === "host" ? 0x4a4038 : clan === "veiled" ? 0x5a4a30 : clan === "redfang" ? 0x2e2218 : WOOD;
  if (clan !== "hidekin") { wheel(P, [wx, hw + 1.4, wr], wr, ang + 0.4, rim); if (!W) wheel(P, [wx, -hw - 1.4, wr], wr, ang, rim); P.push(cap([wx, -hw - 1, wr], [wx, hw + 1, wr], 0.7, 0.7, iron(), { k: 0.1 })); }
  if (!W) for (const s of [-1, 1]) P.push(cap([1, s * 3.4, 12.5], [14, s * 3.8, 12.6], 0.65, 0.55, wood(), { k: 0.1 }));
  const bed = (col: number, top: number, h: number, trim?: number) => {
    P.push(rbox([-12, 0, top - h / 2], [14, hw, h / 2], 0.4, wood(col), { k: 0.1 }));
    for (let i = 1; i < 3; i++) for (const s of [-1, 1]) P.push(rbox([-12, s * (hw + 0.35), top - (h * i) / 3], [13.6, 0.08, 0.12], 0.05, dk(mixc(col, 0, 0.5), 0.6, 1.2), { k: 0.02 }));
    if (trim !== undefined) for (const s of [-1, 1]) P.push(cap([-26, s * (hw + 0.2), top], [2, s * (hw + 0.2), top], 0.45, 0.45, dk(trim, 0.45, 1.35, { spec: 0.4 }), { k: 0.05 }));
  };
  switch (clan) {
    case "wardens": {
      bed(0x6b4a2a, 18, 8.4, 0x3b4a2c);
      const apex = W ? 28 : wreck === 1 ? 33 : 35;
      const can = dk(0xd8962c, 0.45, 1.3, { grain: 0.25 });
      P.push(custom([-27, -hw - 1, 17], [3, hw + 1, apex + 1], (x, y, z) => {
        const e = Math.hypot(y / (hw + 0.4), (z - 18) / (apex - 18)) - 1, ends = Math.max(-26 - x, x - 1.5);
        return Math.max(e * Math.min(hw, apex - 18) * 0.9, ends, 18 - z);
      }, can, { k: 0.3 }));
      P.push(custom([-27, -hw, 17], [-24, hw, apex], (x, y, z) => Math.max(Math.hypot(y / (hw - 1.4), (z - 18) / (apex - 20)) - 1, Math.abs(x + 26) - 1.5) * 5, dk(0x2a1c10, 0.7, 1.2), { k: 0.2, cut: true })); // the dark open back
      for (const x of [-21, -15, -9, -3]) P.push(custom([x - 0.6, -hw - 1, 17], [x + 0.6, hw + 1, apex + 1], (px, y, z) => Math.max(Math.abs(Math.hypot(y / (hw + 0.6), (z - 18) / (apex - 17.4)) - 1) * 6 - 0.45, Math.abs(px - x) - 0.45, 18 - z), dk(0x7a4a14), { k: 0.1 }));
      if (W) P.push(sphere([-11, hw + 0.2, 26], 2.6, dk(0x2a1a0c, 0.8, 1.1), { k: 0.3, cut: true })); // torn hole
      for (const s of [-1, 1]) P.push(cap([-11, s * (hw + 0.5), 25.2], [-11, s * (hw + 0.9), 25.2], 2.1, 2.1, gold(), { k: 0.1 }));
      P.push(rbox([0.4, 0, 22.4], [1.6, hw * 0.7, 0.6], 0.2, wood(), { k: 0.1 }), rbox([2.2, hw - 1.4, 21.4], [0.8, 0.8, 1.2], 0.2, glowM(0xffc060), { k: 0.1 }));
      halos.push({ p: [2.2, hw - 1.4, 21.4], r: 4, col: 0xffb040, a: 0.45 });
      P.push(cap([-20, -hw - 1.3, 12], [-20, -hw - 1.3, 16], 1.6, 1.6, wood(0x4a3018), { k: 0.1 }));
      break;
    }
    case "redfang": {
      bed(0x3e2c22, 14.5, 6, 0x6a6a68);
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) { const x = -24 + i * 5.2; P.push(cone([x, s * hw, 14.5], [x, s * (hw + 0.8), 21], 0.85, iron())); }
      for (const z of [10.5, 13]) P.push(cone([-26, 0, z], [-31, 0, z + 0.4], 0.9, iron()));
      P.push(ell([-21, 2, 17.6], [2.8, 2.6, 3.4], dk(0xa08a5a, 0.45, 1.3, { grain: 0.3 }), { k: 0.6 }), ell([-15.5, -1.5, 16.8], [2.6, 3, 2.6], dk(0x7a6a48, 0.45, 1.3, { grain: 0.3 }), { k: 0.6 }));
      P.push(rbox([-8, 1, 17.6], [3.4, 3.0, 2.6], 0.4, wood(0x5a3820), { k: 0.2 }), cap([-11.4, 1, 20], [-4.6, 1, 20], 2.8, 2.8, wood(0x6a4528), { k: 0.4 }));
      P.push(rbox([-8, 1, 17.6], [3.5, 3.1, 0.3], 0.1, iron(), { k: 0.05 }), sphere([-4.4, 1, 18], 0.7, gold(), { k: 0.05 }));
      for (let i = 0; i < 9; i++) P.push(sphere([-2.4 + (i % 3) * 1.1, -3 + (i >> 1) * 0.7, 15.2 + (i % 4) * 0.4], 0.6, gold(), { k: 0.3 }));
      skull(P, [1.6, 0, 17], 1.4, eyes);
      P.push(cap([-24, -hw + 1, 14], [-24, -hw + 1, 33], 0.45, 0.4, wood(0x2a1c14), { k: 0.05 }));
      P.push(custom([-25, -hw - 0.5, 25], [-14, -hw + 1.5, 34], (x, y, z) => Math.max(Math.abs(y - (-hw + 1)) - 0.25, Math.max(-24 - x, z - 33, 27 - z, (x + 24) - 9 + Math.abs(z - 30) * 0.9)), dk(0x9a1a14, 0.45, 1.4, { grain: 0.2 }), { k: 0.1 })); // red banner
      break;
    }
    case "host": {
      bed(0x23282a, 15, 6.4, BONE);
      for (let i = 0; i < 8; i++) for (const s of [-1, 1]) P.push(cone([-25 + i * 3.6, s * (hw + 0.3), 14.6], [-25 + i * 3.6, s * (hw + 0.4), 11.6], 0.55, bone()));
      P.push(rbox([-12, 0, 18.8], [11, 4.4, 3.4], 0.6, dk(0x2f3836, 0.5, 1.5, { spec: 0.15, grain: 0.2 }), { k: 0.3 }), rbox([-12, 0, 22.1], [11.2, 4.6, 0.25], 0.1, dk(0x4f7d6a), { k: 0.05 }));
      const arch = (x: number) => { const pts: V3[] = []; for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; pts.push([x, Math.cos(a) * (hw - 0.6), 15 + Math.sin(a) * (W ? 11 : 18)]); } P.push(...chain(pts, 0.75, 0.75, bone())); };
      for (const x of [-19, -12, -5]) arch(x);
      for (const x of [-25, 0.5]) { P.push(cap([x, -hw + 1, 15], [x, -hw + 1, 25], 0.55, 0.5, wood(0x4a4038), { k: 0.05 })); skull(P, [x, -hw + 1, 26.6], 1.6, eyes, 0x9ffff0); }
      P.push(cap([1, hw - 1, 15], [1, hw - 1, 29], 0.45, 0.4, wood(0x4a4038), { k: 0.05 }), rbox([1, hw - 1, 30.4], [0.8, 0.8, 1.3], 0.2, glowM(0x9ffff0), { k: 0.1 }));
      halos.push({ p: [1, hw - 1, 30.4], r: 5, col: TEAL, a: 0.55 });
      P.push(ell([-22, 0, 22], [3, hw * 0.65, 2], dk(0x1f3a34, 0.5, 1.5, { grain: 0.3 }), { k: 0.4 })); // a ragged teal shroud
      break;
    }
    case "hidekin": {
      for (const s of [-1, 1]) P.push(...chain([[-28, s * 7.4, 4], [-26, s * 7.4, 0.8], [-20, s * 7.4, 0.6], [0, s * 7.4, 0.6], [4, s * 7.4, 1.4], [5, s * 7.4, 4]], 0.9, 0.9, dk(0xe2c79a, 0.45, 1.2)));
      for (const x of [-22, -12, -2]) for (const s of [-1, 1]) P.push(cap([x, s * 7.4, 1], [x, s * 7.4, 5.6], 0.6, 0.6, wood(0x4a3018), { k: 0.1 }));
      P.push(rbox([-12, 0, 7.6], [14, hw, 2.2], 0.4, wood(0x4a3018), { k: 0.1 }));
      P.push(custom([-27, -hw - 1, 9], [2, hw + 1, 23], (x, y, z) => Math.max(Math.hypot((x + 12) / 14.5, y / (hw + 0.4), (z - 9.5) / 11.5) - 1, 9.6 - z) * 8, dk(0x8a5e30, 0.45, 1.35, { grain: 0.4 }), { k: 0.6 }));
      P.push(ell([-12, 0, 18], [7, 5, 5.4], dk(0x5a4430, 0.45, 1.35, { grain: 0.4 }), { k: 1.2 }));
      for (const x of [-20, -12, -4]) P.push(ringX([x, 0, 9.6], hw - 0.2, 0.3, dk(0xb49a6a)));
      for (let i = 0; i < 6; i++) { const x = -22 + i * 4.2, r = Math.sin(i * 7.3) * 0.5; P.push(...chain([[x, r * 4, 19], [x + r * 5, r * 3 + 1, 25], [x + r * 9, r * 2 - 1, 28]], 0.55, 0.2, wood(0x4a3018))); }
      for (const [x, y] of [[-18, 3], [-6, -2]]) P.push(cone([x, y, 18], [x + 0.4, y, 24], 0.8, bone()));
      P.push(cap([3, 0, 8], [3, 0, 13], 0.4, 0.4, dk(0xb49a6a), { k: 0.05 })); skull(P, [3.4, 0, 14.2], 1.4, eyes);
      break;
    }
    case "veiled": {
      bed(0x2a2a66, 14, 5.8, 0xe0a030);
      const top = W ? 27 : 31;
      P.push(rbox([-12, 0, (14 + top) / 2], [12, hw - 1.2, (top - 14) / 2], 0.4, dk(0x3a3a82, 0.45, 1.45, { grain: 0.2 }), { k: 0.2 }));
      for (const s of [-1, 1]) {
        P.push(rbox([-12, s * (hw - 1.2), (14 + top - 4) / 2], [5, 0.6, (top - 18) / 2], 0.2, dk(0x1a1030, 0.8, 1.1), { k: 0.1, cut: true }));
        for (const d of [-1, 1]) P.push(rbox([-12 + d * 4.6, s * (hw - 1.0), (14 + top - 4) / 2], [1.2, 0.35, (top - 18) / 2], 0.3, dk(0x8a3a9a, 0.45, 1.4, { grain: 0.2 }), { k: 0.1 }));
      }
      // a pagoda roof with gold eaves curling up, a gold knob
      P.push(custom([-28, -hw - 3, top - 1], [4, hw + 3, top + 9], (x, y, z) => {
        const qx = Math.abs(x + 12), qy = Math.abs(y), r = Math.max(qx / 15.5, qy / (hw + 1.8));
        const h = top + 1 + 7 * Math.pow(Math.max(0, 1 - r), 1.6) + 1.6 * Math.pow(r, 6);
        return Math.max(z - h, top - z, (r - 1) * 9) * 0.6;
      }, dk(0x1e1e46, 0.5, 1.6, { grain: 0.2 }), { k: 0.2 }));
      for (const s of [-1, 1]) P.push(cap([-28, s * (hw + 1.7), top + 2.4], [4, s * (hw + 1.7), top + 2.4], 0.45, 0.45, gold(), { k: 0.1 }));
      P.push(sphere([-12, 0, top + 8.6], 1.2, gold(), { k: 0.2 }));
      for (const x of [-26, 2]) { P.push(cap([x, -hw - 1.5, top + 2], [x, -hw - 1.5, top - 1.4], 0.2, 0.2, gold(), { k: 0.05 }), rbox([x, -hw - 1.5, top - 3.2], [1.1, 1.1, 1.6], 0.3, glowM(W ? 0x8a5ab0 : 0xffd060), { k: 0.1 })); halos.push({ p: [x, -hw - 1.5, top - 3.2], r: 4.5, col: W ? 0x6a3a9a : 0xffc040, a: 0.5 }); }
      break;
    }
  }
}

/** Ground clutter round a wrecked cart: planks, the wheel that came off, the clan's spilled goods. */
function debris(P: Prim[], eyes: NonNullable<Model["eyes"]>, halos: NonNullable<Model["halos"]>, clan: Clan) {
  const rim = clan === "host" ? 0x4a4038 : clan === "veiled" ? 0x5a4a30 : clan === "redfang" ? 0x2e2218 : WOOD;
  if (clan !== "hidekin") flatWheel(P, [6, -10, 0.8], 6.4, rim); else P.push(cap([4, -9, 0.9], [15, -11, 0.9], 0.9, 0.9, dk(0xe2c79a, 0.45, 1.2), { k: 0.1 }));
  for (let i = 0; i < 4; i++) { const x = -22 + i * 11, y = (i % 2 ? 8 : -12) + i; P.push(rbox([x, y, 0.5], [2.4, 0.6, 0.35], 0.15, wood(i % 2 ? WOOD : 0x4a3420), { yaw: i * 0.7, k: 0.1 })); }
  const coins = (n: number, x0: number, y0: number) => { for (let i = 0; i < n; i++) P.push(ell([x0 + Math.sin(i * 2.3) * 4, y0 + Math.cos(i * 1.7) * 3, 0.25], [0.7, 0.7, 0.25], gold(), { k: 0.1 })); };
  switch (clan) {
    case "wardens": P.push(ell([14, -4, 2], [3, 2.6, 2.4], dk(0xc9b27a, 0.45, 1.3, { grain: 0.3 }), { k: 0.5 })); coins(8, 18, 2); break;
    case "redfang": P.push(ell([12, -5, 2], [2.6, 2.4, 2.4], dk(0xa08a5a, 0.45, 1.3, { grain: 0.3 }), { k: 0.5 }), rbox([20, 2, 2], [3.4, 2.4, 2], 0.3, wood(0x5a3820), { yaw: 0.4, k: 0.2 })); coins(16, 16, -1); break;
    case "host": skull(P, [14, -3, 1.6], 1.7, eyes, 0x9ffff0); for (let i = 0; i < 6; i++) P.push(cap([16 + i * 2, 2 - i, 0.5], [18 + i * 2, 3 - i * 0.6, 0.7], 0.4, 0.35, bone(), { k: 0.1 })); halos.push({ p: [24, 0, 1], r: 4, col: TEAL, a: 0.4 }); P.push(rbox([24, 0, 1.4], [1, 1, 1.4], 0.3, glowM(0x6fcfb0), { k: 0.1 })); break;
    case "hidekin": P.push(ell([14, -3, 1.4], [6, 3.6, 2.2], dk(0x8a5e30, 0.45, 1.35, { grain: 0.4 }), { k: 0.6 })); for (let i = 0; i < 3; i++) P.push(cap([12 + i * 3, -2, 2], [14 + i * 3, -1, 6 - i], 0.4, 0.2, wood(0x4a3018), { k: 0.1 })); break;
    case "veiled": P.push(rbox([12, -4, 1.6], [1.4, 1.4, 1.6], 0.3, glowM(0xffd060), { k: 0.1 }), ell([20, 2, 1.4], [5, 2.6, 1.6], dk(0x3a3a82, 0.45, 1.45, { grain: 0.2 }), { k: 0.5 })); halos.push({ p: [12, -4, 1.6], r: 4, col: 0x8a3a9a, a: 0.45 }); break;
  }
}

/** A ring round the x axis (girths, straps, iron bands on a log). */
const ringX = (c: V3, R: number, r: number, m: Mat): Prim => custom([c[0] - r - 0.5, c[1] - R - r - 0.5, c[2] - R - r - 0.5], [c[0] + r + 0.5, c[1] + R + r + 0.5, c[2] + R + r + 0.5], (x, y, z) => Math.hypot(Math.hypot(y - c[1], z - c[2]) - R, x - c[0]) - r, m, { k: 0.05 });

const dirOf = (f: number): Dir => (f === 12 || f === 13 ? "right" : f < 6 ? (["down", "up", "right"] as Dir[])[f >> 1] : (["down", "up", "right"] as Dir[])[(f - 6) % 3]);

/** One cart frame as a model in its sheet's facing. */
export function cartModel(key: string, f: number): { m: Model; dir: Dir } {
  const clan = key.replace(/^mob_war_cart_/, "").replace(/^war_cart_/, "") as Clan;
  const dir = dirOf(f), p = f < 6 ? (f % 2 ? 1 : 2) : 0, idle = f >= 6 && f < 9, bob = !idle && f < 12 && f % 2 ? 0.5 : 0;
  const ang = f < 6 ? (f % 2) * 0.45 : f * 0.2, stage = f === 12 ? 1 : f === 13 ? 2 : 0;
  let P: Prim[] = [];
  const eyes: NonNullable<Model["eyes"]> = [], halos: NonNullable<Model["halos"]> = [];
  cart(P, eyes, halos, clan, ang, stage);
  if (stage) P = tip(P, stage === 2 ? [-8, 0, 0] : [-12, 0, 0], stage === 2 ? -0.16 : -0.05, stage === 2 ? -0.1 : 0);
  if (stage === 2) P = remap(P, (q) => [q[0], q[1], q[2] - 3.4], (q) => [q[0], q[1], q[2] + 3.4]);
  if (stage === 2) debris(P, eyes, halos, clan);
  else {
    const B: Prim[] = [];
    if (clan === "redfang") { beast(B, eyes, halos, clan, 17, 3.6, p === 1 ? 2 : 1, stage ? 2 : 0); beast(B, eyes, halos, clan, 18.5, -3.6, p, stage ? 2 : 0); }
    else beast(B, eyes, halos, clan, clan === "hidekin" ? 19 : 18, 0, stage ? 0 : p, stage ? 3.4 : 0);
    P.push(...B);
  }
  if (bob) P = remap(P, (q) => [q[0], q[1], q[2] + bob], (q) => [q[0], q[1], q[2] - bob]);
  let m: Model = { prims: P, eyes: eyes.map((e) => ({ ...e, p: [e.p[0], e.p[1], e.p[2] + bob] as V3 })), halos, shadow: { x: stage === 2 ? -6 : 2, y: 0, rx: stage === 2 ? 26 : 30, ry: 10, a: 0.42 } };
  if (dir !== "right") m = scaleModel(shiftModel(m, dir === "down" ? -20 : 16), 0.8);
  else m = shiftModel(m, -1);
  return { m, dir };
}



// ---------------------------------------------------------------- the Host's bone ram
const TIMBER = 0x2c2620, TIMBER_L = 0x4a4038, PALE = 0xb4d4be;
function ramSkull(P: Prim[], eyes: NonNullable<Model["eyes"]>, halos: NonNullable<Model["halos"]>, c: V3, r: number, lit: number) {
  const B = bone();
  P.push(ell(c, [r, r * 0.9, r * 0.9], B, { k: 0.4 }), cap(add(c, [r * 0.3, 0, -r * 0.2]), add(c, [r * 1.7, 0, -r * 0.5]), r * 0.62, r * 0.45, B, { k: 0.4 }));
  P.push(cap(add(c, [r * 0.4, 0, -r * 0.8]), add(c, [r * 1.6, 0, -r * 1.0]), r * 0.35, r * 0.25, B, { k: 0.2 }));
  for (let i = -1; i <= 1; i++) P.push(cone(add(c, [r * 1.2, i * r * 0.3, -r * 0.75]), add(c, [r * 1.25, i * r * 0.3, -r * 1.15]), r * 0.12, dk(0xe8e0c8, 0.6, 1.1)));
  for (const s of [-1, 1]) {
    P.push(...chain([add(c, [-r * 0.2, s * r * 0.6, r * 0.6]), add(c, [-r * 0.4, s * r * 1.6, r * 1.4]), add(c, [r * 0.3, s * r * 1.9, r * 2.2]), add(c, [r * 1.3, s * r * 1.6, r * 2.2])], r * 0.32, r * 0.08, B));
    P.push(sphere(add(c, [r * 0.75, s * r * 0.45, r * 0.15]), r * 0.3, dk(0x0c1412, 1, 1), { k: 0.1, cut: true }));
    eyes.push({ p: add(c, [r * 0.8, s * r * 0.45, r * 0.15]), col: 0x9ffff0 });
  }
  halos.push({ p: add(c, [r, 0, 0]), r: r * 1.6, col: TEAL, a: 0.3 + lit * 0.25 });
}
const rag = (P: Prim[], x: number, y: number, z: number, w: number, h: number, col = PALE) => P.push(custom([x - w / 2 - 1, y - 1, z - h - 1], [x + w / 2 + 1, y + 1, z + 1], (px, py, pz) => {
  const teeth = h * (0.75 + 0.25 * Math.abs(Math.sin(px * 1.9 + x)));
  return Math.max(Math.abs(py - y - Math.sin(px * 0.8) * 0.3) - 0.25, Math.abs(px - x) - w / 2, pz - z, z - teeth - pz);
}, dk(col, 0.45, 1.25, { grain: 0.3 }), { k: 0.1 }));

export function ramModel(f: number): { m: Model; dir: Dir } {
  const dir = dirOf(f), idle = f >= 6 && f < 9, bob = !idle && f < 12 && f % 2 ? 0.5 : 0;
  const sw = f === 12 ? -1.2 : idle ? [0, 0.35, -0.35][f - 6] : f < 6 ? (f % 2 ? 1 : -1) : [0, 0.6, -0.6][(f - 9) % 3];
  const roll = f < 6 ? (f % 2) * 0.45 : f * 0.2, lit = idle ? (f - 6) / 2 : f % 2;
  let P: Prim[] = [];
  const eyes: NonNullable<Model["eyes"]> = [], halos: NonNullable<Model["halos"]> = [];
  const T = wood(TIMBER), TL = wood(TIMBER_L), B = bone(), hw = 8.4;
  if (f === 13) {
    // collapsed: the chassis sagging on the ground, broken posts, the log fallen, bones, the skull still glowing faintly
    P.push(...tip([rbox([-4, 0, 3], [17, hw, 2.2], 0.4, T, { k: 0.1 })], [-4, 0, 0], -0.1, 0.08));
    P.push(cap([-14, 5, 4], [-2, 3, 16], 1.2, 1.0, TL, { k: 0.1 }), cap([2, -4, 4], [12, -6, 10], 1.1, 1.0, TL, { k: 0.1 }), cap([-20, -6, 1.5], [-8, -9, 2], 1.1, 1.0, TL, { k: 0.1 }));
    P.push(cap([-8, -2, 2.8], [20, -4, 2.8], 2.7, 2.7, wood(0x3a3026), { k: 0.1 }));
    for (const x of [2, 12]) P.push(ringX([x, -2.6, 2.8], 2.6, 0.35, iron()));
    ramSkull(P, eyes, halos, [24, -4, 3.6], 3.2, 0);
    flatWheel(P, [-20, 8, 0.8], 6.2, TIMBER_L); P.push(...tip(remapWheel([10, hw + 4, 5.6], 5.4), [10, hw + 4, 0], 0, 0.5));
    for (let i = 0; i < 9; i++) P.push(cap([-24 + i * 5.6, (i % 3) * 4 - 4, 0.5], [-21 + i * 5.6, (i % 3) * 4 - 3, 0.8], 0.45, 0.4, B, { k: 0.1 }));
    rag(P, -4, 9, 5, 8, 4);
    return { m: shiftModel({ prims: P, eyes, halos, shadow: { x: 0, y: 0, rx: 30, ry: 11, a: 0.42 } }, 2), dir };
  }
  // chassis with a bone fringe, four wheels
  P.push(rbox([0, 0, 11.6], [24, hw, 2.3], 0.4, T, { k: 0.1 }), cap([-24.4, -hw - 0.2, 13.9], [24.4, -hw - 0.2, 13.9], 0.35, 0.35, B, { k: 0.05 }));
  for (let i = 0; i < 10; i++) P.push(cone([-22 + i * 4.8, -hw - 0.3, 13.6], [-22 + i * 4.8, -hw - 0.4, 11], 0.6, B));
  for (const x of [-12, 13]) for (const s of [-1, 1]) wheel(P, [x, s * (hw + 1.4), 6.8], 6.8, roll + (x > 0 ? 0.3 : 0), TIMBER_L);
  for (const x of [-12, 13]) for (const s of [-1, 1]) P.push(sphere([x, s * (hw + 2.4), 6.8], 1.1, B, { k: 0.1 }));
  // two A-frames, a ridge beam, the Host's rags
  for (const x of [-12, 12]) for (const s of [-1, 1]) { P.push(cap([x - 6, s * (hw - 1), 13.8], [x, s * 2.2, 36], 1.1, 0.9, TL, { k: 0.1 }), cap([x + 6, s * (hw - 1), 13.8], [x, s * 2.2, 36], 1.1, 0.9, TL, { k: 0.1 })); P.push(...chain([[x - 3.4, s * (hw - 1.4), 23], [x, s * (hw - 1.0), 24], [x + 3.4, s * (hw - 1.4), 23]], 0.45, 0.45, B)); }
  P.push(cap([-16, 0, 36.4], [16, 0, 36.4], 1.3, 1.3, TL, { k: 0.1 }));
  for (const x of [-12, 12]) P.push(cap([x, -2.6, 36], [x, 2.6, 36], 1.2, 1.2, TL, { k: 0.2 }));
  rag(P, -4, -1.6, 35.6, 7, 9); rag(P, 4, 1.6, 35.6, 6, 7, mixc(PALE, 0, 0.2)); rag(P, -10, 1.6, 35.6, 4.6, 10);
  // chains and the battering log, capped with the horned skull
  const lx = sw * 3.2, lz = 24, lift = sw * 0.6;
  for (const x of [-8, 6]) { const top: V3 = [x, 0, 35.2], bot: V3 = [x + lx * 0.6, 0, lz + 2.6]; const n = 7, L: V3[] = []; for (let i = 0; i <= n; i++) L.push([top[0] + (bot[0] - top[0]) * i / n, 0, top[2] + (bot[2] - top[2]) * i / n]); P.push(...chain(L, 0.35, 0.35, iron())); }
  const LG: Prim[] = [cap([-24, 0, lz], [22, 0, lz + lift], 2.5, 2.4, dk(0x3a3026, 0.45, 1.5, { grain: 0.4 }), { k: 0.1 })];
  for (const x of [-10, 5, 17]) LG.push(ringX([x, 0, lz + lift * (x + 24) / 46], 2.55, 0.4, iron()));
  for (const x of [-16, 0, 12]) LG.push(cone([x, 0, lz - 2.2], [x, 0, lz - 4.6], 0.7, B));
  for (const p of LG) P.push(...remap([p], (q) => [q[0] + lx, q[1], q[2]], (q) => [q[0] - lx, q[1], q[2]]));
  ramSkull(P, eyes, halos, [22 + lx + 3.8, 0, lz + lift + 0.4], 4.2, lit);
  // a lantern on the rear post, a skull on the nose beam
  P.push(cap([-23, 0, 13.8], [-23, 0, 25], 0.5, 0.45, TL, { k: 0.05 }), rbox([-23, 0, 22.4], [0.8, 0.8, 1.4], 0.2, glowM(0x9ffff0), { k: 0.1 }));
  halos.push({ p: [-23, 0, 22.4], r: 5, col: TEAL, a: 0.55 });
  skull(P, [24.6, 0, 15.4], 1.6, eyes, 0x9ffff0);
  if (f === 12) P = tip(P, [0, 0, 0], -0.06);
  if (bob) P = remap(P, (q) => [q[0], q[1], q[2] + bob], (q) => [q[0], q[1], q[2] - bob]);
  let m: Model = { prims: P, eyes, halos, shadow: { x: 0, y: 0, rx: 30, ry: 11, a: 0.42 } };
  m = dir === "right" ? shiftModel(m, -2) : scaleModel(m, 0.82);
  return { m, dir };
}
function remapWheel(c: V3, r: number): Prim[] { const P: Prim[] = []; wheel(P, c, r, 0.2, TIMBER_L, 6); return P; }

// ---------------------------------------------------------------- the Hide-Kin tunnel mouth (facing the camera, +x)
const SOIL = 0x4e3222, SOIL_L = 0x6e4a30, SOIL_D = 0x2c1e14, ROOT = 0x5a4228, ROOT_L = 0x7a5c3a, HOLE = 0x0b0705, TT = 0x3a2c1e;
const T_CLOTH = 0x8a5f2a, T_TRIM = 0x6e1d18, T_SIGIL = 0xe2c79a;

export function tunnelModel(f: number): Model {
  const P: Prim[] = [], eyes: NonNullable<Model["eyes"]> = [], halos: NonNullable<Model["halos"]> = [];
  const soil = dk(SOIL, 0.45, 1.45, { grain: 0.3 }), soilL = dk(SOIL_L, 0.45, 1.4, { grain: 0.3 }), soilD = dk(SOIL_D, 0.5, 1.5, { grain: 0.4 }), B = bone();
  const root = dk(ROOT, 0.45, 1.45, { grain: 0.35 }), rootL = dk(ROOT_L, 0.45, 1.4, { grain: 0.35 });
  const lumps = (n: number, seed: number, rx: number, ry: number, top: number, xs = 1) => { for (let i = 0; i < n; i++) { const a = Math.sin(i * 12.9898 + seed) * 43758.5453, u = a - Math.floor(a), b = Math.sin(i * 78.233 + seed) * 12345.678, v = b - Math.floor(b); const y = (u - 0.5) * 2 * ry, x = (v - 0.5) * 2 * rx * xs, h = top * Math.max(0, 1 - Math.hypot(x / rx, y / ry)); P.push(sphere([x, y, h * 0.85], 1.4 + v * 1.8, i % 3 ? soilL : soil, { k: 0.8 })); } };
  if (f === 13) {
    // caved in: a low rubble heap, snapped timbers, the banner pole fallen across it
    P.push(ell([0, 0, 0], [12, 34, 12], soil, { k: 1 }));
    lumps(26, 3, 11, 31, 11);
    for (let i = 0; i < 5; i++) P.push(ell([6 + i * 1.5, -24 + i * 12, 0.6], [2, 2.4, 0.9], dk(0x7c7468, 0.5, 1.3, { grain: 0.3 }), { k: 0.2 }));
    P.push(cap([4, -20, 3], [2, -9, 12], 1.3, 1.1, dk(TT, 0.5, 1.5, { grain: 0.4 }), { k: 0.2 }), cap([3, 4, 9], [5, 18, 10], 1.2, 1.0, root, { k: 0.2 }), cap([7, -6, 9], [6, 8, 9.6], 1.1, 1.0, dk(mixc(TT, 0xffffff, 0.1), 0.5, 1.5), { k: 0.2 }));
    P.push(...chain([[6, -4, 10.4], [9, 1, 14], [7, 6, 11]], 0.55, 0.55, B));
    P.push(cap([6, 8, 9.4], [10, 33, 3], 0.85, 0.65, B, { k: 0.1 }));
    P.push(custom([7, 14, 2], [14, 30, 10], (x, y, z) => Math.max(Math.abs(z - (9.6 - (y - 14) * 0.25) + (x - 8) * 0.9) - 0.25, Math.abs(y - 21) - 6, Math.abs(x - 10) - 3), dk(T_CLOTH, 0.45, 1.35, { grain: 0.3 }), { k: 0.1 }));
    return shiftModel({ prims: P, eyes, halos, shadow: { x: 0, y: 0, rx: 13, ry: 36, a: 0.42 } }, -6);
  }
  const shake = f === 12 ? 1.3 : 0, dig = f >= 6 && f <= 8 ? (f - 5) / 3 : 0, t = f * 0.9;
  // the heap of soil and its lighter lip, the black mouth dug into its face
  const arch = (x: number, y: number, z: number) => Math.max(Math.hypot(y / 16.5, z / 21) - 1, 2 - x) * 12;
  const heap = ell([0, 0, 0], [13.5, 37, 26], soil, { k: 1 });
  P.push({ ...heap, d: (x, y, z) => Math.max(heap.d(x, y, z), -arch(x, y, z)) });
  lumps(18, 9, 12, 34, 24);
  for (let i = 0; i <= 10; i++) { const a = Math.PI * (i / 10); P.push(sphere([12.5 - Math.sin(a) * 2, Math.cos(a) * 19.5, Math.sin(a) * 23], 2.6, i % 2 ? soilL : soil, { k: 0.8 })); }
  P.push(custom([-6, -18, -1], [20, 18, 22], arch, dk(HOLE, 1, 1.4), { k: 0.6, cut: true }));
  P.push(ell([1.2, 0, 0], [1.6, 16, 20.5], dk(HOLE, 0.8, 1.6), { k: 0.4 }), ell([4, 0, 0], [4, 15.5, 2], dk(0x2a1a10, 0.6, 1.4, { grain: 0.4 }), { k: 0.6 })); // the dark far end, a trodden floor
  halos.push({ p: [8, 0, 3], r: 9, col: 0xb06a2a, a: 0.12 });
  // shoring: two leaning root posts with hide thongs, a gnarled lintel, bone ribs, a tusk at each end
  for (const s of [-1, 1]) {
    P.push(cap([14, s * 17.8, 0], [13.4, s * 17.2 + shake * s * 0.3, 21], 1.6, 1.3, root, { k: 0.3 }));
    for (const z of [5, 12]) P.push(torus([14, s * 17.6, z], 1.7, 0.4, dk(T_SIGIL, 0.45, 1.2), { k: 0.05 }));
    P.push(...chain([[13.6, s * 20, 22], [14, s * 25, 24], [13.6, s * 24, 29]], 0.85, 0.25, B));
  }
  P.push(cap([13.4, -21.6, 21.4 + shake * 0.3], [13.4, 21.6, 21.4 - shake * 0.3], 1.6, 1.6, dk(TT, 0.5, 1.5, { grain: 0.4 }), { k: 0.2 }));
  for (const y of [-10, 10]) P.push(...chain([[13.8, y, 20], [14.2, y + y * 0.06, 16.4], [14.0, y + y * 0.1, 12.8]], 0.55, 0.45, B));
  // dangling roots, tips twitching; roots breaking out of the heap on top
  const wild = f === 12 ? 2.6 : dig ? 1.6 : 1;
  for (let i = 0; i < 6; i++) { const y = -14 + i * 5.6, len = 6 + ((i * 37) % 7), sw = Math.sin(t * 2.1 + i * 1.7) * 1.6 * wild; P.push(...chain([[13.2, y, 20], [13.4, y + sw * 0.4, 20 - len * 0.55], [13.6, y + sw, 20 - len]], 0.5, 0.2, i % 2 ? root : rootL)); }
  for (const [y, z, d] of [[-24, 15, -1], [22, 16, 1], [-6, 25, -1]] as const) P.push(...chain([[4, y, z], [6, y + d * 4, z + 3 + Math.sin(t * 1.9 + y) * 0.8], [7, y + d * 8, z + 2 + Math.sin(t * 1.9 + y) * 1.4]], 0.7, 0.25, rootL));
  // the Hide-Kin banner: a bone pole, a hide pennant with a red stripe and a claw-tooth sigil
  const px: V3 = [4, 26, 12], top: V3 = [4 + shake * 0.4, 26, 40];
  P.push(cap(px, top, 0.85, 0.6, B, { k: 0.1 }), sphere(add(top, [0, 0, 0.6]), 1.2, B, { k: 0.1 }));
  const w = Math.sin(t * 1.5) * 1.1;
  const flag = (yy: number, zz: number) => [5 + Math.sin(yy * 0.5 + t) * 0.6 + w * 0.3 * (yy - 26) / 10, yy, zz] as V3;
  P.push(custom([2, 26, 27], [9, 38, 40], (x, y, z) => { const c = flag(y, z); const len = 11 - Math.abs(z - 34) * 0.55; return Math.max(Math.abs(x - c[0]) - 0.3, y - 26 - len, 26.6 - y, Math.abs(z - 34) - 5); }, dk(T_CLOTH, 0.45, 1.35, { grain: 0.3 }), { k: 0.1 }));
  P.push(custom([2, 26, 34], [9, 37, 36.4], (x, y, z) => { const c = flag(y, z); return Math.max(Math.abs(x - c[0]) - 0.36, y - 35.5, 26.6 - y, Math.abs(z - 35) - 0.9); }, dk(T_TRIM, 0.45, 1.4), { k: 0.05 }));
  P.push(cone(flag(29, 31.4), add(flag(29, 31.4), [0.2, 0, -2]), 0.8, dk(T_SIGIL, 0.5, 1.2)));
  // a trickle of loose spoil, the burrower digging out, a burst of clods when hit
  const crumbs = (n: number, seed: number, fall: number) => { for (let i = 0; i < n; i++) { const a = Math.sin(i * 91.7 + seed) * 999, u = a - Math.floor(a); P.push(sphere([12.5, -12 + u * 24, 20 - ((fall + u) % 1) * 18], 0.5, soilL, { k: 0.05 })); } };
  if (!dig && f !== 12) crumbs(2 + (f % 3), 3 + (f % 6), (f % 6) / 6 + 0.1);
  if (dig) {
    const z = 4 + dig * 2;
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) P.push(cone([11, s * (5 + i * 1.4), z + 1], [13.5, s * (6.4 + i * 1.4), z + 3.6 + dig], 0.5, B));
    P.push(ell([10, 0, z], [3, 3.4, 2.4], dk(0x2a1c14, 0.5, 1.5, { grain: 0.3 }), { k: 0.5 }));
    for (const s of [-1, 1]) eyes.push({ p: [12.8, s * 1.2, z + 0.6], col: 0xe8c070 });
    crumbs(5, 40 + f, 0.5);
    for (let i = 0; i < 9; i++) { const a = Math.PI * (0.05 + 0.9 * ((i * 0.37) % 1)), d = (7 + ((i * 7) % 17)) * dig; P.push(sphere([16 + d * 0.3, Math.cos(a) * d * 1.3, 8 + Math.sin(a) * d - 4 * dig * dig], 0.9 + (i % 3) * 0.4, i % 2 ? soilL : soilD, { k: 0.05 })); }
  }
  if (f === 12) { crumbs(6, 90, 0.3); for (let i = 0; i < 9; i++) { const a = Math.PI * (0.05 + 0.9 * ((i * 0.41) % 1)), d = (7 + ((i * 5) % 15)) * 0.9; P.push(sphere([17, Math.cos(a) * d * 1.3, 9 + Math.sin(a) * d], 0.9 + (i % 3) * 0.4, i % 2 ? soilL : soilD, { k: 0.05 })); } }
  return shiftModel({ prims: P, eyes, halos, shadow: { x: 0, y: 0, rx: 15, ry: 39, a: 0.42 } }, -11);
}

/** Sheets of these (mobs.ts): the model's facing per frame, rendered on the w x h grid with the ground at `oy`. */
export function siegeFrame(model: { m: Model; dir: Dir }, w: number, h: number, oy: number, tx: number): MobFrame {
  return renderMob(model.m, YAW[model.dir], w, h, oy, tx);
}
