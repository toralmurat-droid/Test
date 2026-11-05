import type { Pen } from "./worldProps";

/**
 * Art of the elemental wilds (shared/map.ts ELEMENT_LANDS, Murat 2026-11-05): the Heart Shards (quest objects of blob
 * quests 8-11) and the standing props of each land: venom toadstools in Blightmire Fen, ice spikes in Rimewater
 * Hollow, smoking ember vents in the Cinder Scar and split, crackling storm stones on Stormbreak Crags.
 * Same hand as the village bonfire and the other world props: 1.5 texels per world px, flat colour steps with ordered
 * dithering, light from the top left, dark weathered palette; the 1px outline comes from sheet().
 */
export type LandEl = "poison" | "cold" | "fire" | "shock";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dith = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];
const step = (pal: number[], v: number, x: number, y: number) => {
  const c = Math.max(0, Math.min(pal.length - 1, v)), i = Math.floor(c);
  return pal[Math.min(pal.length - 1, c - i > dith(x, y) ? i + 1 : i)];
};
const hash = (x: number, y: number, s: number) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const noise = (x: number, y: number, s: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};

/** Element ramps, darkest first. */
export const LAND_PAL: Record<LandEl, number[]> = {
  poison: [0x141c0a, 0x2a3e12, 0x4a6a1c, 0x78a82c, 0xb4e04e, 0xeaffa8],
  cold: [0x0e1a2c, 0x1e3e64, 0x3a72a8, 0x6eb0e0, 0xb0e4ff, 0xf2fcff],
  fire: [0x1e0a06, 0x5a1a0c, 0xa83a12, 0xe0661c, 0xffa848, 0xfff0a8],
  shock: [0x100e2a, 0x2a2470, 0x4e4ac8, 0x8090f8, 0xbcd0ff, 0xf6f8ff],
};
/** Multiply tint for the trees in each land (client/src/ambient.ts). */
export const LAND_TREE_TINT: Record<LandEl, number> = { poison: 0xc4cc8a, cold: 0xd4e4f2, fire: 0x5e524a, shock: 0x9aa0b8 };

const STONE = [0x141318, 0x24222a, 0x36343b, 0x4a484e, 0x5f5c60, 0x787574, 0x948f88];
const GLOAM = [0x1a0814, 0x3a0e2c, 0x5a1440, 0x9b2c6b, 0xe26fa8]; // the Brood Heart's flesh, still inside each shard
const ICE = LAND_PAL.cold;

function rock(p: Pen, x: number, y: number, lv: number, seed: number) {
  const v = lv + (noise(x * 0.35, y * 0.35, seed) - 0.5) * 1.3 + (noise(x * 1.1, y * 1.1, seed + 1) - 0.5) * 0.6;
  const crack = noise(x * 0.22, y * 0.9, seed + 2);
  p.px(x, y, step(STONE, crack > 0.47 && crack < 0.5 ? v - 2 : v, x, y));
}
/** Is (x, y) inside the polygon? */
function inside(pts: [number, number][], x: number, y: number) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** A faceted crystal spike from a base (bx..bx+bw at by) up to a tip: lit left facet, dark right facet, a bright edge. */
function spike(p: Pen, bx: number, by: number, bw: number, tx: number, ty: number, pal: number[], glow: number, core = true) {
  const mid = bx + bw * 0.55, pts: [number, number][] = [[bx, by], [tx, ty], [bx + bw, by]];
  const x0 = Math.floor(Math.min(bx, tx)) - 1, x1 = Math.ceil(Math.max(bx + bw, tx)) + 1;
  for (let y = Math.floor(ty); y <= by; y++) for (let x = x0; x <= x1; x++) {
    if (!inside(pts, x + 0.5, y + 0.5)) continue;
    const u = (y - ty) / Math.max(1, by - ty); // 0 tip .. 1 base
    const ridge = tx + (mid - tx) * u; // the edge between the two facets
    const left = x < ridge;
    let v = (left ? 3.6 : 2.0) - u * 1.1 + glow * 0.8 + (noise(x * 0.5, y * 0.25, 7) - 0.5) * 0.7;
    if (Math.abs(x - ridge) < 0.7) v += 1.4; // bright facet edge
    let c = step(pal, v, x, y);
    // the dark heart-flesh still pulsing in its core
    if (core && u > 0.35 && Math.abs(x - ridge) < bw * 0.18 * u && noise(x * 0.4, y * 0.3, 9) > 0.35) c = step(GLOAM, 1.6 + glow * 2.2 + u, x, y);
    p.px(x, y, c);
  }
}

// ---------------------------------------------------------------------------------------- the Heart Shards
export const SHARD_W = 36, SHARD_H = 50;
/** A Heart Shard of the Gloam on its stone, frame f (pulse); `broken`: shattered stubs and splinters. */
export function heartShard(p: Pen, f: number, el: LandEl, broken: boolean) {
  const W = SHARD_W, H = SHARD_H, cx = W / 2, t = (f / 6) * Math.PI * 2, pal = LAND_PAL[el];
  const glow = broken ? 0 : 0.5 + 0.5 * Math.sin(t);
  // the stone it grew out of: a low cracked boulder
  for (let y = H - 11; y < H; y++) for (let x = 3; x < W - 3; x++) {
    const dx = (x - cx) / (W / 2 - 3), dy = (y - (H - 3)) / 8;
    if (dx * dx + dy * dy > 1 || hash(x, y, 3) < 0.04) continue;
    rock(p, x, y, 4.4 - (x - 3) / (W - 6) * 2 - (y - (H - 11)) / 11 * 1.2, 31);
  }
  // element stains seeping into the stone
  for (let i = 0; i < 18; i++) { const x = 5 + Math.floor(hash(i, 1, 33) * (W - 10)), y = H - 9 + Math.floor(hash(i, 2, 33) * 7); p.px(x, y, pal[2]); }
  if (broken) {
    spike(p, cx - 7, H - 8, 6, cx - 6, H - 15, pal, 0, false);
    spike(p, cx - 1, H - 8, 7, cx + 3, H - 17, pal, 0, false);
    spike(p, cx + 6, H - 8, 5, cx + 9, H - 13, pal, 0, false);
    for (let i = 0; i < 10; i++) { // splinters lying round it
      const x = 3 + Math.floor(hash(i, 4, 35) * (W - 6)), y = H - 3 - Math.floor(hash(i, 5, 35) * 3);
      p.px(x, y, pal[3]); p.px(x + 1, y, pal[2]);
    }
    return;
  }
  // three spikes, the big one in the middle
  spike(p, cx - 12, H - 7, 9, cx - 13, H - 28, pal, glow);
  spike(p, cx + 4, H - 7, 9, cx + 13, H - 30, pal, glow);
  spike(p, cx - 6, H - 6, 13, cx + 1, 3, pal, glow);
  // its own light: specks drifting up in the element's motion
  for (let i = 0; i < 7; i++) {
    const ph = ((f + i * 0.8) % 6) / 6, x = Math.round(cx - 12 + hash(i, 7, 37) * 24 + (el === "shock" ? (hash(i, f, 38) - 0.5) * 6 : 0));
    const y = Math.round(H - 12 - ph * (el === "cold" ? 14 : 30));
    if (el === "cold" && ph > 0.5) continue;
    p.px(x, y, pal[ph < 0.5 ? 5 : 4], 1 - ph * 0.6);
  }
  if (el === "shock" && f % 3 === 0) { // a little arc jumping between two spikes
    let x = cx - 10, y = H - 22;
    while (x < cx + 10) { p.px(x, y, pal[5]); x++; y += hash(x, f, 39) < 0.5 ? -1 : 1; }
  }
}

// ------------------------------------------------------------------------------------------ land props
const CAP_P = [0x2a1028, 0x4a1c46, 0x6e2a62, 0x9a4888, 0xc87ab4]; // bruised toadstool caps
const STALK = [0x5a5040, 0x7e745e, 0xa89c80, 0xd0c4a4];

/** Venom toadstools: a clump of bloated purple-capped mushrooms dripping green, bubbles rising from the ooze round them. */
export const VENOM_W = 34, VENOM_H = 30;
export function venomCaps(p: Pen, f: number) {
  const W = VENOM_W, H = VENOM_H, t = (f / 6) * Math.PI * 2, G = LAND_PAL.poison;
  // the ooze puddle at the foot
  for (let y = H - 6; y < H; y++) for (let x = 2; x < W - 2; x++) {
    const dx = (x - W / 2) / (W / 2 - 2), dy = (y - (H - 3)) / 3;
    if (dx * dx + dy * dy <= 1) p.px(x, y, step(G, 1.6 + (noise(x * 0.4, y * 0.6 + f * 0.3, 41) - 0.5) * 1.6 - dy * 0.4, x, y));
  }
  const caps: [number, number, number, number][] = [[10, H - 4, 7, 14], [20, H - 3, 9, 20], [27, H - 4, 5, 10], [15, H - 3, 4, 8]];
  for (const [i, [x, by, r, h]] of caps.entries()) {
    const sway = Math.round(Math.sin(t + i) * 0.6), top = by - h;
    for (let y = top + 2; y <= by; y++) { p.px(x + sway - 1, y, STALK[2]); p.px(x + sway, y, STALK[1]); if (r > 5) p.px(x + sway + 1, y, STALK[0]); }
    for (let y = top - Math.round(r * 0.75); y <= top + 2; y++) for (let xx = x - r; xx <= x + r; xx++) {
      const dx = (xx - x) / r, dy = (y - top - 2) / (r * 0.8);
      if (dx * dx + dy * dy > 1 || y > top + 2) continue;
      let v = 3.2 - dx * 1.2 + dy * 1.3 + (noise(xx * 0.5, y * 0.5, 42 + i) - 0.5) * 0.8;
      if (hash(xx, y, 43 + i) < 0.08 && dy < 0.6) v = 5; // pale warts
      p.px(xx + sway, y, step(CAP_P, v, xx, y));
    }
    // green venom dripping off the rim
    const dx = x - r + 2 + ((f + i * 2) % 4) * Math.round(r / 2), dl = (f + i) % 3;
    for (let k = 0; k <= dl; k++) p.px(dx + sway, top + 3 + k, G[4 - Math.min(2, k)]);
  }
  // bubbles rising out of the ooze and popping
  for (let i = 0; i < 3; i++) {
    const ph = ((f + i * 2) % 6) / 6, x = 6 + i * 10 + Math.round(hash(i, 3, 44) * 4), y = Math.round(H - 4 - ph * 9);
    if (ph < 0.85) { p.px(x, y, G[4]); p.px(x + 1, y, G[3]); p.px(x, y - 1, G[5], 0.7); } else { p.px(x - 1, y, G[4], 0.6); p.px(x + 1, y, G[4], 0.6); }
  }
}

/** Ice spikes: a cluster of jagged blue ice pushing up through frosted stones, glittering. */
export const ICE_W = 34, ICE_H = 40;
export function iceSpikes(p: Pen, f: number) {
  const W = ICE_W, H = ICE_H;
  for (let y = H - 7; y < H; y++) for (let x = 3; x < W - 3; x++) {
    const dx = (x - W / 2) / (W / 2 - 3), dy = (y - (H - 3)) / 4.5;
    if (dx * dx + dy * dy <= 1) p.px(x, y, hash(x, y, 51) < 0.35 ? ICE[4] : step(STONE, 4 - dy - dx, x, y)); // frosted stones
  }
  spike(p, 5, H - 5, 8, 4, H - 22, ICE, 0.3, false);
  spike(p, 20, H - 4, 9, 27, H - 26, ICE, 0.2, false);
  spike(p, 11, H - 4, 11, 15, 2, ICE, 0.45, false);
  spike(p, 25, H - 5, 5, 30, H - 14, ICE, 0.1, false);
  // glints running up the facets
  for (let i = 0; i < 3; i++) {
    const k = (f + i * 2) % 6, x = [8, 15, 24][i], y = H - 8 - k * [2, 5, 3][i];
    if (k < 4) { p.px(x, y, 0xffffff); p.px(x - 1, y, ICE[5], 0.6); p.px(x + 1, y, ICE[5], 0.6); p.px(x, y - 1, ICE[5], 0.6); }
  }
}

/** Ember vent: a cracked black boulder split open over a glowing seam, smoke curling up from it. */
export const VENT_W = 34, VENT_H = 34;
export function emberVent(p: Pen, f: number) {
  const W = VENT_W, H = VENT_H, F = LAND_PAL.fire, t = (f / 6) * Math.PI * 2, cx = W / 2;
  const glow = 0.5 + 0.5 * Math.sin(t);
  for (let y = H - 16; y < H; y++) for (let x = 2; x < W - 2; x++) {
    const dx = (x - cx) / (W / 2 - 2), dy = (y - (H - 4)) / 12;
    if (dx * dx + dy * dy > 1) continue;
    const seam = Math.abs(x - cx - Math.sin(y * 0.7) * 2) < 1.6 + (y > H - 6 ? 1.5 : 0);
    if (seam) { p.px(x, y, step(F, 3.2 + glow * 1.6 - Math.abs(x - cx) * 0.3, x, y)); continue; }
    const v = 2.6 - dx * 1.0 - dy * 0.6 + (noise(x * 0.4, y * 0.4, 61) - 0.5) * 1.1;
    let c = step(STONE.slice(0, 5), v, x, y);
    if (Math.abs(x - cx) < 5 && hash(x, y, 62) < 0.2 + glow * 0.15) c = F[2 + (hash(x, y, 63) < 0.5 ? 0 : 1)]; // glow on the lips of the crack
    p.px(x, y, c);
  }
  // embers flicking up, smoke above them
  for (let i = 0; i < 5; i++) {
    const ph = ((f + i * 1.3) % 6) / 6, x = Math.round(cx + Math.sin(i * 2.1 + ph * 3) * (2 + ph * 4)), y = Math.round(H - 14 - ph * 16);
    p.px(x, y, F[ph < 0.4 ? 5 : ph < 0.7 ? 4 : 3]);
  }
  for (let i = 0; i < 9; i++) {
    const ph = ((f / 6 + i / 9) % 1), x = Math.round(cx + Math.sin(ph * 5 + i) * (2 + ph * 5)), y = Math.round(H - 18 - ph * 14);
    p.px(x, y, 0x4a4440, 0.55 - ph * 0.45); p.px(x + 1, y, 0x3a3532, 0.45 - ph * 0.4);
  }
}

/** Storm stone: a tall standing stone split down the middle by lightning, a blue arc crackling across the split. */
export const STORM_W = 30, STORM_H = 50;
export function stormStone(p: Pen, f: number) {
  const W = STORM_W, H = STORM_H, S = LAND_PAL.shock, cx = W / 2;
  for (let y = 4; y < H - 1; y++) for (let x = 4; x < W - 4; x++) {
    const u = (y - 4) / (H - 5), hw = 7 + u * 4 - (y < 9 ? (9 - y) * 0.8 : 0);
    if (Math.abs(x - cx + 0.5) > hw) continue;
    const split = Math.abs(x - cx - Math.round(Math.sin(y * 0.45) * 1.5)) < (y < H * 0.75 ? 1.2 : 0.4);
    if (split) { if (y > 6) p.px(x, y, (f + y) % 4 === 0 ? S[5] : S[1]); continue; }
    const v = 3.6 - (x - cx + hw) / (hw * 2) * 2 + (noise(x * 0.4, y * 0.25, 71) - 0.5) * 1.2 - u * 0.6;
    let c = step(STONE, v, x, y);
    if (noise(x * 0.6, y * 0.6, 72) > 0.72) c = step(S.slice(0, 4), 1.2 + v * 0.3, x, y); // scorched, glassy streaks
    p.px(x, y, c);
  }
  // the crackle: a jagged arc across the split, jumping to a new shape each frame
  if (f % 2 === 0 || f === 3) {
    let x = cx - 7, y = 12 + (f * 7) % 18;
    while (x <= cx + 7) { p.px(x, y, S[5]); p.px(x, y + 1, S[3], 0.6); x++; y += hash(x, f, 73) < 0.5 ? -1 : 1; }
  }
  // sparks dancing round its foot
  for (let i = 0; i < 4; i++) { const x = 4 + Math.floor(hash(i, f, 74) * (W - 8)), y = H - 2 - Math.floor(hash(f, i, 75) * 5); p.px(x, y, S[4 + (i & 1)]); }
}
