/**
 * One light for every 3D-built body (heroes in body3d.ts, monsters in mob3d.ts), so a hero and the mob it fights are lit
 * the same way (Murat 2026-11-21: "the shading on mobs and characters looks a bit off").
 *
 * What it fixes over the first pass, which lit with a plain Lambert term and dithered every ramp step:
 * - a key light with a clear terminator (lit planes vs shadow planes) instead of a soft CG gradient,
 * - real self-shadow: an arm or a hood throws shade onto the body (the old pass only had a touch of folds),
 * - a lifted shadow floor so dark sides keep their colour and form instead of sinking into near-black mush,
 * - ambient occlusion kept to the folds, not a grey wash over the whole body,
 * - a cool, faint back rim on the shadow edge so dark bodies still part from dark ground at night,
 * - ordered dither only in a thin band at each step, so shading reads as clean pixel clusters, not static.
 * Light comes from the upper left, a little toward the camera: the same side as the world props and the bonfire.
 */
export type V3 = [number, number, number];
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const nrm = (v: V3): V3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
export const SIN = 0.5, COS = Math.sqrt(3) / 2;
/** World frame of the casters: x screen right, y away from the camera, z up. */
export const LIGHT: V3 = nrm([-0.5, -0.5, 0.74]);
/** Toward the camera (30 degrees down). */
export const VIEW: V3 = [0, -COS, SIN];
export const HALF: V3 = nrm([LIGHT[0] + VIEW[0], LIGHT[1] + VIEW[1], LIGHT[2] + VIEW[2]]);
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Light (0..1, before glints, grain and glow) at a surface with world normal `n`, ambient occlusion `ao` (0 = deep
 * fold) and `sun` (1 = the light reaches it, 0 = in another part's shadow).
 */
export function light3(n: V3, ao: number, sun: number): number {
  const ndl = dot(n, LIGHT);
  // key: a short terminator band, then the lit side still turns with the form (no flat CG plateau)
  const t = clamp((ndl + 0.06) / 0.26), key = t * t * (3 - 2 * t) * (0.3 + 0.7 * clamp(ndl)) * sun;
  const sky = 0.5 + 0.5 * n[2];
  const fold = 0.45 + 0.55 * Math.pow(clamp(ao), 0.8);
  let v = (0.09 + 0.08 * sky) * fold + key * 0.7 * (0.65 + 0.35 * fold);
  // a small hot cluster where the form faces the light squarely
  v += Math.pow(clamp(ndl), 6) * 0.1 * sun * fold;
  // back rim: the turned-away edge catches a little cool sky, so dark bodies part from dark ground
  const edge = 1 - Math.abs(dot(n, VIEW));
  v += Math.pow(edge, 3) * (1 - t) * 0.2 * clamp(n[2] + 0.6);
  return v;
}

/** Glint toward the camera: wet slime, metal, polished bone. */
export const glint = (n: V3, shine: number) => Math.pow(Math.max(0, dot(n, HALF)), shine);

/** Ramp step for light `v` at texel (i, j): the step edge is dithered over a thin band only, clean clusters elsewhere. */
export function rampStep(v: number, N: number, i: number, j: number): number {
  const c = clamp(v) * N, k = Math.floor(c), f = c - k, b = (BAYER[j & 3][i & 3] + 0.5) / 16;
  const step = f > 0.82 ? (f - 0.82) / 0.18 > b ? 1 : 0 : 0;
  return clamp(k + step, 0, N - 1);
}

/** Soft shadow toward `L` from point `p` (already pushed off the surface): 1 = lit, 0 = shaded. */
export function sunAt(sd: (x: number, y: number, z: number) => number, p: V3, L: V3, maxT = 22): number {
  let t = 0.35, k = 1;
  for (let s = 0; s < 40 && t < maxT; s++) {
    const d = sd(p[0] + L[0] * t, p[1] + L[1] * t, p[2] + L[2] * t);
    if (d < 0.02) return 0;
    k = Math.min(k, 4 * d / t);
    t += Math.max(0.12, d * 0.9);
  }
  return clamp(k);
}
