import { hsh, IsoPaint, mat, ramp, type Mat, type V3 } from "./isoPaint";
import { STRAWR } from "./isoProps";
import type { Pen } from "./worldProps";

/**
 * Cows for the Goldenreach barn (Murat 2026-11-13: "barn is good, put some cows inside"), modelled in 3D like the
 * other props: a heavy body on four legs, head down to the straw now and then, the tail swishing. Facing +u
 * (down-right on screen); flip the sprite to face the other way. Cosmetic only: nothing on the server.
 *
 * Local world px with the body centre at (0, 0); the sprite's foot (bottom centre) is local (COW_FOOT_U, COW_FOOT_V).
 */
export const COW_W = 96, COW_H = 90; // texels (1.5 per world px)
export const COW_FOOT_U = 17, COW_FOOT_V = 15;
const K = 1.5, N = 6;
const PIEBALD = [0x101010, 0x1e1c1c, 0x2e2a2a, 0x423c3a, 0x5a524e];
const WHITE = [0x5a564e, 0x7e786c, 0xa49c8c, 0xc8c0ae, 0xe4ddcc];
const BROWN = [0x2a140a, 0x4a2412, 0x6e3a1c, 0x92522a, 0xb06e3c, 0xc88a54];
const PINK = [0x5a2e2a, 0x84463e, 0xa86458, 0xc88676];
const HORN = [0x4a4232, 0x7a705a, 0xb0a688, 0xd8d0b4];

export const cow = (brown: boolean) => (p: Pen, f: number) => {
  const q = new IsoPaint(p, COW_W, COW_H, COW_W / 2, COW_H - 2);
  const P = (u: number, v: number, z: number): V3 => [(u - COW_FOOT_U) * K, (v - COW_FOOT_V) * K, z * K];
  const coat: Mat = brown
    ? (l, s, t, x, y) => ramp(BROWN, l * 0.95 + (hsh(x >> 2, y >> 2, 7) - 0.5) * 0.12, x, y)
    // black and white patches, fixed on the body (from the surface coordinates, not the screen)
    : (l, s, t, x, y) => (Math.sin(s * 11.3) + Math.sin(t * 7.1 + s * 3) + Math.sin(s * 5 - t * 9) > 0.6 ? ramp(PIEBALD, l + 0.1, x, y) : ramp(WHITE, l * 0.95, x, y));
  const graze = f >= 2 && f <= 4 ? 1 : f === 1 || f === 5 ? 0.5 : 0; // head down to the straw mid-loop
  const swish = Math.sin((f / N) * Math.PI * 2);
  // legs, then the body over them
  for (const [u, v] of [[-10, -4], [-10, 4], [10, -4], [10, 4]]) {
    q.rod(P(u, v, 1.5), P(u + 0.3, v, 11), 1.7 * K, coat);
    q.rod(P(u, v, 0), P(u, v, 1.6), 1.6 * K, mat(PIEBALD, 0.05)); // hooves
  }
  q.blob(P(0, 0, 15.5), 15 * K, 7 * K, 7.5 * K, coat);
  q.blob(P(-4, 0, 8.6), 3.2 * K, 3 * K, 2.2 * K, mat(PINK, 0.1)); // udder
  // neck and head: hung low when grazing
  const hz = 18.5 - graze * 10, hu = 20 + graze * 2;
  q.rod(P(12, 0, 17), P(hu - 3, 0, hz), 4.6 * K, coat);
  q.blob(P(hu, 0, hz), 5 * K, 3.6 * K, 3.8 * K, coat);
  q.blob(P(hu + 4.6, 0, hz - 1.4), 2.4 * K, 2.8 * K, 2.4 * K, mat(PINK, 0.05)); // muzzle
  for (const s of [-1, 1]) {
    q.rod(P(hu - 1.5, s * 2.6, hz + 2.6), P(hu - 1, s * 5, hz + 4.5), 0.6 * K, mat(HORN, 0.1));
    q.blob(P(hu - 2.6, s * 4, hz + 1.4), 0.9 * K, 1.8 * K, 1 * K, coat); // ears
  }
  q.plot(...P(hu + 1.6, 2.6, hz + 1), 0x0a0808, 4); q.plot(...P(hu + 1.6, -2.6, hz + 1), 0x0a0808, 4); // eyes
  // tail: down from the rump, swishing, a dark tuft at the end
  const tv = swish * 3.5;
  q.rod(P(-15, 0, 19), P(-16.5, tv, 7), 0.55 * K, coat);
  q.blob(P(-16.6, tv, 5.6), 1.1 * K, 1.1 * K, 1.8 * K, mat(brown ? BROWN : PIEBALD, -0.05));
  // a wisp of straw in the mouth while it chews
  if (graze > 0.6) q.rod(P(hu + 6, -1, hz - 2), P(hu + 7.5, 1.5, hz - 3), 0.35 * K, mat(STRAWR, 0.1));
};
