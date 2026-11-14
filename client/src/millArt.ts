import { IsoPaint, ramp, mat, hsh, type Mat, type V3 } from "./isoPaint";
import { IRONR, ROPER, STONER, STRAWR, WOODR, wood } from "./isoProps";
import type { Pen } from "./worldProps";

/**
 * Millbrook's water wheel (Murat 2026-11-13: "a large wheel attached to it where you can also see the turning
 * mill, the section of the house on the water on pilings, the inside something to crush grains"): a lean-to on
 * pilings out from the mill's east wall over the river, open on the near side so the millstones show, and a big
 * undershot wheel beside it, dipping in the stream. 6 frames turn the wheel 1/8 of a round (its 8 spokes make it loop).
 *
 * Local world coordinates: u = 0 is the mill's east wall, v = 0 the middle of its depth. The sprite's foot (its
 * bottom centre, origin 0.5, 1) is local (MILL_FOOT_U, MILL_FOOT_V), the nearest point of the drawing.
 */
const SC = 1.4; // the model is built at 1/SC of its world size (Murat: "a large wheel")
export const MILL_W = Math.ceil(168 * SC), MILL_H = Math.ceil(176 * SC); // texels (1.5 per world px)
/** Where the sprite's foot is, in world px from the middle of the mill's east wall. */
export const MILL_FOOT_U = 54 * SC, MILL_FOOT_V = 31 * SC;
const K = 1.5 * SC, N = 6, FU = 54, FV = 31;
const WATER = [0x0e1e22, 0x18323a, 0x2a4e56, 0x4a7478, 0x8aaeaa, 0xd4e6e0];

export function millWheel(p: Pen, f: number) {
  const q = new IsoPaint(p, MILL_W, MILL_H, MILL_W / 2, MILL_H - 2);
  const P = (u: number, v: number, z: number): V3 => [(u - FU) * K, (v - FV) * K, z * K];
  const box = (u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, m: Mat, faces = 7) => {
    const a = P(u0, v0, z0), b = P(u1, v1, z1);
    q.box(a[0], b[0], a[1], b[1], a[2], b[2], m, faces);
  };
  const rod = (a: V3, b: V3, r: number, m: Mat) => q.rod(P(...a), P(...b), r * K, m);
  const DU = 30, V0 = -34, V1 = 30, DZ = 6; // deck: out to u = DU, from v = V0 to V1, at height DZ
  // pilings into the stream, cross-braced
  for (const u of [3, 15, 27]) for (const v of [V0 + 2, -2, V1 - 2]) rod([u, v, -4], [u, v, DZ], 1.3, wood(WOODR, -0.1, 10));
  for (const v of [V0 + 2, V1 - 2]) rod([3, v, -1], [27, v, DZ - 1], 0.6, wood(WOODR, -0.2, 24));
  // the deck, its back wall, the house-side posts and a lean-to roof sloping from the mill wall
  box(0, DU, V0, V1, DZ - 2, DZ, wood(WOODR, 0.05, 30));
  q.quad(P(0, V0, DZ), [DU * K, 0, 0], [0, 0, 36 * K], wood(WOODR, -0.15, 36));
  for (const [u, v] of [[DU - 1, V0 + 26], [DU - 1, V0 + 1]]) box(u - 1.2, u + 1.2, v - 1.2, v + 1.2, DZ, 40, wood(WOODR, 0, 34));
  const roof: Mat = (l, s, t, x, y) => ramp(STRAWR, l * 0.9 - 0.05 + (hsh(x, y >> 1, 3) - 0.5) * 0.2 - ((t * 9) % 1 < 0.12 ? 0.18 : 0), x, y);
  q.quad(P(-2, V0 - 3, 54), [(DU + 5) * K, 0, -14 * K], [0, 30 * K, 0], roof); // over the back half: the millstones work in the open front
  // inside: a millstone pair on a timber bed, the hopper above it, sacks of grain and flour
  const MU = 13, MV = 15;
  box(MU - 8, MU + 8, MV - 8, MV + 8, DZ, DZ + 7, wood(WOODR, -0.05, 16));
  const stone = (z0: number, h: number, turn: number) => q.surf((s, t) => {
    const a = s * Math.PI * 2, top = t > 0.5, r = top ? 7 * (1 - (t - 0.5) * 2) : 7, z = top ? z0 + h : z0 + h * t * 2;
    return [P(MU + Math.cos(a) * r, MV + Math.sin(a) * r, z), top ? [0, 0, 1] : [Math.cos(a), Math.sin(a), 0]];
  }, 60, 14, (l, s, t, x, y) => {
    const groove = t > 0.5 && ((s + turn) * 8 % 1) < 0.14;
    return ramp(STONER, l + 0.1 - (groove ? 0.3 : 0) + (hsh(x, y, 9) - 0.5) * 0.15, x, y);
  });
  stone(DZ + 7, 3, 0); stone(DZ + 10.2, 3, f / N / 8);
  q.blob(P(MU, MV, DZ + 24), 4.5 * K, 4.5 * K, 5 * K, mat(WOODR, -0.05), 0, 0.6); // hopper
  for (const [du, dv, dz] of [[-6, -24, 0], [-1, -26, 0], [-4, -25, 4.5], [5, -26, 0]]) q.blob(P(MU + du, MV + dv, DZ + 3 + dz), 3.4 * K, 2.6 * K, 3 * K, mat(STRAWR, -0.05));
  // the axle from the wheel through the deck to a gear, and the wheel
  const WU = 37, WV = -4, WZ = 22, R = 24, ang0 = (f / N) * (Math.PI / 4);
  rod([DU - 6, WV, WZ], [WU + 5, WV, WZ], 1.6, wood(WOODR, 0.05, 12));
  q.blob(P(DU - 5, WV, WZ), 1.8 * K, 6 * K, 6 * K, wood(WOODR, -0.05, 8));
  const wheelPt = (a: number, r: number, u: number): V3 => [u, WV + Math.cos(a) * r, WZ + Math.sin(a) * r];
  for (const u of [WU - 3.5, WU + 3.5]) { // the two rims
    q.surf((s, t) => { const a = s * Math.PI * 2, r = R - 1.6 + t * 3.2; return [P(...wheelPt(a, r, u)), [u > WU ? 1 : -1, 0, 0]]; }, 220, 4, wood(WOODR, 0.05, 160));
  }
  for (let k = 0; k < 8; k++) { // spokes
    const a = ang0 + (k / 8) * Math.PI * 2;
    rod(wheelPt(a, 2.5, WU + 3.5), wheelPt(a, R - 1.5, WU + 3.5), 0.85, wood(WOODR, 0.05, 24));
  }
  for (let k = 0; k < 16; k++) { // paddles across the rims
    const a = ang0 + (k / 16) * Math.PI * 2, o = wheelPt(a, R + 0.5, WU - 4), e2: V3 = [0, Math.cos(a) * 5.5 * K, Math.sin(a) * 5.5 * K];
    q.quad(P(...o), [8 * K, 0, 0], [-e2[0], -e2[1], -e2[2]], wood(WOODR, -0.05, 8));
  }
  q.blob(P(WU, WV, WZ), 2.2 * K, 3.2 * K, 3.2 * K, mat(IRONR, 0.05)); // hub
  // the stream round the wheel's foot: churned white water, and spray thrown up by the paddles
  const ph = (f / N) * Math.PI * 2;
  for (let k = 0; k < 70; k++) {
    const a = hsh(k, 1, 31) * Math.PI * 2, r = 3 + hsh(k, 2, 31) * 14, du = Math.cos(a) * r * 0.7, dv = Math.sin(a) * r;
    const z = Math.max(0, Math.sin(ph + k) * 1.6) + (hsh(k, 3, 31) < 0.25 ? Math.abs(Math.sin(ph * 2 + k)) * 5 : 0);
    q.plot(...P(WU + du, WV + dv, z), ramp(WATER, 0.7 + hsh(k, 4, 31) * 0.3, k, f), 0.2);
  }
  rod([DU - 0.5, V0 + 26, 38], [DU - 0.5, V0 + 26, DZ + 6], 0.3, mat(ROPER)); // a rope hanging from the roof post
}
