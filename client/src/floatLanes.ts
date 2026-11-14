/**
 * Collision lanes for floating texts ("Broken!", "-58", "absorbed"...): a new text whose starting box overlaps a live
 * one is shifted up until it fits, so two words that appear together never print over each other. Cosmetic, pure.
 */
export interface FloatBox { x: number; y: number; w: number; h: number; t: number }

/** A float lives this long in the list (its rise takes about as long); older ones no longer block. */
export const FLOAT_LIFE_MS = 600;
const MAX_LIVE = 40;

const hit = (a: FloatBox, b: FloatBox) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;

/**
 * Where to put `b` (box centred on x, y; `t` = now in ms): returns how many px up to shift it (0 = fits). Drops
 * expired entries, adds the placed box to `live` (capped at 40).
 */
export function placeFloat(live: FloatBox[], b: FloatBox, step = b.h, maxSteps = 4): number {
  for (let i = live.length - 1; i >= 0; i--) if (b.t - live[i].t >= FLOAT_LIFE_MS) live.splice(i, 1);
  let n = 0;
  const box = { ...b };
  while (n < maxSteps && live.some((o) => hit(o, box))) { n++; box.y = b.y - n * step; }
  live.push(box);
  if (live.length > MAX_LIVE) live.splice(0, live.length - MAX_LIVE);
  return n * step;
}
