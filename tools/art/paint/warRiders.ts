/**
 * Mounts of the clan war's riders (art keys war_<clan>_rider), 3D-built (mob3d.ts): a Warden warhorse, a Redfang shaggy pony,
 * the Host's bone horse, a Hide-Kin boar and a Veiled dune camel. Facing +x, feet on z = 0, world px. The rider is a humanoid
 * (paint/mobs.ts lays it on `seat`). Frames are 48 x 48, ground line at 44, the 14-frame soldier layout.
 */
import { cap, chain, cone, ell, mat, rbox, sphere, torus, type Model, type Prim, type V3 } from "./mob3d";
import { beast, dk, gold } from "./siege3d";
import type { WarRider } from "./warLooks";

export const RIDER_W = 48, RIDER_H = 48, RIDER_GROUND = 44;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Where the rider's feet hang: x (along the mount) and z, in model px. The seat is about 9 px above. */
export const RIDER_SEAT: Record<WarRider, { x: number; z: number }> = {
  war_warden_rider: { x: -0.5, z: 9.5 }, war_redfang_rider: { x: -0.5, z: 7.6 }, war_host_rider: { x: -0.6, z: 8.2 },
  war_hidekin_rider: { x: -0.5, z: 7.4 }, war_veiled_rider: { x: -0.6, z: 12.6 },
};

interface Quad { col: number; colD: number; rx: number; ry: number; rz: number; leg: number; legR: number; neck: [number, number]; head: number; hoof: number }
const WARHORSE: Quad = { col: 0x6a4a30, colD: 0x2a1a10, rx: 7.8, ry: 3.6, rz: 4.5, leg: 9.4, legR: 0.8, neck: [4.2, 5.2], head: 4.6, hoof: 0x1e1610 };
const PONY: Quad = { col: 0x7a5c3a, colD: 0x3a2a1c, rx: 6.8, ry: 3.6, rz: 4.3, leg: 7.4, legR: 0.9, neck: [3.6, 3.6], head: 4.0, hoof: 0x1e1610 };
const BOAR: Quad = { col: 0x4a3426, colD: 0x1e140e, rx: 8.4, ry: 4.6, rz: 5.6, leg: 5.4, legR: 1.3, neck: [4.4, 0.2], head: 4.6, hoof: 0x1a1410 };

/** A quadruped walking: `p` 0 stand, 1 / 2 the two strides (diagonal pairs), `bow` drops the head. */
function quad(S: Quad, kind: "warden" | "redfang" | "hidekin", p: number, bow: number): Model {
  const P: Prim[] = [], eyes: NonNullable<Model["eyes"]> = [];
  const C = dk(S.col, 0.42, 1.5, { grain: 0.3, spec: 0.1 }), D = dk(S.colD, 0.5, 1.5, { grain: 0.3 });
  const bz = S.leg + S.rz * 0.75, at = (x: number, y: number, z: number): V3 => [x, y, bz + z], swing = [0, 2.2, -2.2][p];
  for (const L of [{ x: 0.58, s: 1, f: true, k: 1 }, { x: 0.58, s: -1, f: true, k: -1 }, { x: -0.58, s: 1, f: false, k: -1 }, { x: -0.58, s: -1, f: false, k: 1 }]) {
    const sw = swing * L.k, lift = sw > 0.5 ? 1.6 : 0, hip = at(L.x * S.rx, L.s * S.ry * 0.55, -S.rz * 0.45), foot: V3 = [hip[0] + sw, hip[1], 0.5 + lift];
    const knee: V3 = [(hip[0] + foot[0]) / 2 + (L.f ? 0.7 : -1), hip[1], (hip[2] + foot[2]) / 2 + (lift ? 1.4 : 0)];
    P.push(cap(hip, knee, S.legR * 1.5, S.legR * 1.05, C, { k: 0.6 }), cap(knee, foot, S.legR, S.legR * 0.9, kind === "hidekin" ? D : C, { k: 0.3 }));
    P.push(ell(add(foot, [0.3, 0, -0.1]), [S.legR * 1.3, S.legR * 1.2, 0.6], dk(S.hoof, 0.6, 1.6), { k: 0.2 }));
    if (kind === "redfang") P.push(ell(add(foot, [0, 0, 1.2]), [S.legR * 1.5, S.legR * 1.5, 1.2], D, { k: 0.5 })); // shaggy feathering
  }
  P.push(ell(at(0, 0, 0), [S.rx, S.ry, S.rz], C, { k: 1.2 }), ell(at(S.rx * 0.45, 0, 0.4), [S.rx * 0.55, S.ry * 1.04, S.rz * 1.02], C, { k: 1.4 }));
  const nb = at(S.rx * 0.75, 0, S.rz * 0.3), hd = add(nb, [S.neck[0], 0, S.neck[1] - bow]);
  P.push(cap(nb, hd, S.rz * 0.7, S.rz * 0.48, C, { k: 1 }));
  const tailC = kind === "warden" ? dk(0x1e1410, 0.5, 1.4) : D;
  P.push(...chain([at(-S.rx, 0, S.rz * 0.5), at(-S.rx - 2.4, 0.4, -0.6), at(-S.rx - 2.8, 0, -S.rz * 1.1 - (kind === "hidekin" ? -2.6 : 0))], kind === "hidekin" ? 0.5 : 1.1, 0.4, tailC));
  if (kind === "hidekin") { // a boar: a long wedge head, tusks, a bristle ridge, a barbed-bone girth
    P.push(cap(hd, add(hd, [S.head, 0, -1.4]), 2.9, 1.5, C, { k: 0.8 }), sphere(add(hd, [S.head + 0.7, 0, -1.5]), 1.1, dk(0x1a1410, 0.6, 1.6), { k: 0.2 }));
    for (const s of [-1, 1]) {
      P.push(cone(add(hd, [S.head - 1.4, s * 1.3, -2.2]), add(hd, [S.head - 0.2, s * 1.7, 0.4]), 0.55, dk(0xe8dfc4, 0.6, 1.2)), sphere(add(hd, [-0.6, s * 2.5, 1.7]), 0.9, D, { k: 0.2 }));
      eyes.push({ p: add(hd, [2.0, s * 1.9, 0.5]), col: 0xd8a070 });
    }
    for (let i = 0; i < 11; i++) { const x = -S.rx + 1 + i * 1.6; P.push(cone(at(x, 0, S.rz * 0.85), at(x - 0.6, i % 2 ? 0.5 : -0.5, S.rz + 2.0), 0.55, dk(0x2a2018, 0.6, 1.6))); }
    P.push(torus(at(-0.5, 0, 0), S.ry * 1.05, 0.45, dk(0xe2c79a, 0.5, 1.2), { tilt: Math.PI / 2, k: 0.1 }));
    P.push(rbox(at(-0.5, 0, S.rz * 0.9), [3.2, 2.8, 0.5], 0.3, dk(0x8a6a40, 0.45, 1.35, { grain: 0.3 }), { k: 0.2 })); // hide saddle pad
  } else {
    const head = kind === "redfang" ? 3.6 : 4.4;
    P.push(ell(add(hd, [1.2, 0, -0.4]), [2.8, 2.0, 2.4], C, { k: 0.8 }), cap(add(hd, [1.8, 0, -0.8]), add(hd, [head, 0, -2.8]), 1.7, 1.2, C, { k: 0.6 }), sphere(add(hd, [head + 0.3, 0, -2.9]), 0.7, dk(0x2a1a14, 0.7, 1.4), { k: 0.2 }));
    for (const s of [-1, 1]) { P.push(cone(add(hd, [-0.4, s * 1.2, 1.4]), add(hd, [-0.8, s * 1.4, 3.4]), 0.55, D)); eyes.push({ p: add(hd, [1.6, s * 1.6, 0.4]), col: 0x140c08 }); }
    const maneC = kind === "warden" ? dk(0x1e1410, 0.5, 1.4) : dk(0x2a1c14, 0.5, 1.4);
    for (let i = 0; i < 4; i++) { const q = i / 3, r0 = add(nb, [(hd[0] - nb[0]) * q, 0, (hd[2] - nb[2]) * q + S.rz * 0.5]); P.push(...chain([r0, add(r0, [-1.6, i % 2 ? 0.6 : -0.6, 0.2]), add(r0, [-2.6, i % 2 ? 0.7 : -0.7, -1.6])], 0.7, 0.3, maneC)); }
    if (kind === "warden") { // a green and amber saddle cloth, brass bridle
      P.push(ell(at(-0.6, 0, S.rz * 0.4), [4.6, S.ry * 1.1, S.rz * 0.9], dk(0xc8741f, 0.45, 1.35, { grain: 0.25 }), { k: 0.25 }));
      P.push(torus(at(-0.6, 0, -1.4), S.ry * 1.12, 0.35, dk(0x3b4a2c), { tilt: Math.PI / 2, k: 0.05 }));
      P.push(torus(add(hd, [3.2, 0, -1.6]), 1.5, 0.22, gold(), { tilt: Math.PI / 2, k: 0.05 }));
      P.push(rbox(at(-0.6, 0, S.rz * 0.95), [2.4, 2.2, 0.5], 0.3, dk(0x4a2e18, 0.45, 1.4, { grain: 0.3 }), { k: 0.2 }));
    } else { // a shaggy pony: a ragged red blanket, shaggy chest tufts
      P.push(ell(at(-0.4, 0, S.rz * 0.5), [4.2, S.ry * 1.08, S.rz * 0.8], dk(0x8e1f1a, 0.45, 1.4, { grain: 0.35 }), { k: 0.25 }));
      for (let i = 0; i < 5; i++) P.push(cone(at(-3.4 + i * 1.7, S.ry * 1.0, -1.6), at(-3.6 + i * 1.7, S.ry * 1.15, -3.6), 0.5, dk(0x8e1f1a, 0.5, 1.4)), cone(at(-3.4 + i * 1.7, -S.ry * 1.0, -1.6), at(-3.6 + i * 1.7, -S.ry * 1.15, -3.6), 0.5, dk(0x8e1f1a, 0.5, 1.4)));
      for (let i = 0; i < 6; i++) P.push(cone(at(S.rx * 0.8, (i - 2.5) * 0.9, -2.2), at(S.rx * 0.85 + 0.6, (i - 2.5) * 1.1, -4.4), 0.5, D));
    }
  }
  return { prims: P, eyes, shadow: { x: 0, y: 0, rx: 13, ry: 4.6, a: 0.42 } };
}

/** One mount of the rider sheet at stride `p` (0 stand, 1 / 2 strides). */
export function mountModel(key: WarRider, p: number, bow = 0): Model {
  const P: Prim[] = [], eyes: NonNullable<Model["eyes"]> = [], halos: NonNullable<Model["halos"]> = [];
  switch (key) {
    case "war_warden_rider": return quad(WARHORSE, "warden", p, bow);
    case "war_redfang_rider": return quad(PONY, "redfang", p, bow);
    case "war_hidekin_rider": return quad(BOAR, "hidekin", p, bow);
    case "war_host_rider": beast(P, eyes, halos, "host", 0, 0, p, bow); break;
    case "war_veiled_rider": beast(P, eyes, halos, "veiled", 0, 0, p, bow); break;
  }
  return { prims: P, eyes, halos, shadow: { x: 0, y: 0, rx: 13, ry: 4.6, a: 0.42 } };
}
