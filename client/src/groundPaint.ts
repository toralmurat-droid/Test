/**
 * Smooth painted ground for the isometric view (no pixel art): grass, dirt roads, cobbles, sand, water and fields
 * are painted per screen pixel at high resolution, with soft, wavy borders between them.
 * Runs inside a Web Worker (groundWorker.ts), so painting never stalls the game.
 *
 * A chunk is a rectangle of iso screen space (sx, sy). Each output pixel is mapped back to the world
 * (wx = sy + sx / 2, wy = sy - sx / 2), the ground tiles around it are blended, and the material colours are made
 * from layered value noise, Voronoi stones and furrows.
 */

export interface GroundData {
  w: number; h: number; tile: number;
  /** Ground tile id per tile (bridges already turned to water). */
  ground: Int16Array;
  /** 1 where a solid thing stands (walls, palisade, rocks): ground around it gets a soft contact shadow. */
  solid: Uint8Array;
}

// Tile ids (shared/map.ts T)
const GRASS = 0, GRASS_DARK = 1, TALL = 2, FLOWERS = 3, DIRT = 4, COBBLE = 5, SAND = 6, WATER = 7, BRIDGE = 8, FIELD = 9, CROPS = 10;
const FLOOR = 39, RUBBLE = 40;
const NT = 64;

function hash2(x: number, y: number, s: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise in [0, 1). */
function vn(x: number, y: number, s: number) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  let tx = x - x0, ty = y - y0;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, s), b = hash2(x0 + 1, y0, s), c = hash2(x0, y0 + 1, s), d = hash2(x0 + 1, y0 + 1, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
const fbm = (x: number, y: number, s: number) => vn(x, y, s) * 0.55 + vn(x * 2.03, y * 2.03, s + 11) * 0.3 + vn(x * 4.1, y * 4.1, s + 23) * 0.15;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Precomputed fields at tile resolution, interpolated per pixel. */
export interface Fields { depth: Float32Array; ao: Float32Array }

export function makeFields(g: GroundData): Fields {
  const { w, h, ground, solid } = g;
  // Water depth: tiles from the nearest land (BFS), 0 on land
  const depth = new Float32Array(w * h).fill(99);
  const q: number[] = [];
  for (let i = 0; i < w * h; i++) if (ground[i] !== WATER && ground[i] !== BRIDGE) { depth[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % w, y = (i / w) | 0, d = depth[i] + 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (depth[j] > d) { depth[j] = d; q.push(j); }
    }
  }
  // Contact shadow: solid tiles blurred over their neighbours
  const ao = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const nx = x + a, ny = y + b;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (solid[ny * w + nx]) s += a === 0 && b === 0 ? 0.5 : a === 0 || b === 0 ? 0.14 : 0.07;
    }
    ao[y * w + x] = Math.min(1, s);
  }
  return { depth, ao };
}

const out3 = new Float32Array(3);

/**
 * Colour + "height" of one material at a world point. The height lets materials poke into each other at
 * borders (cobbles over grass, grass over dirt) instead of a plain cross-fade.
 */
function material(t: number, wx: number, wy: number, sx: number, sy: number, depth: number, now: number): number {
  let r = 0, g = 0, b = 0, ht = 0.5;
  switch (t) {
    case GRASS: case GRASS_DARK: case TALL: case FLOWERS: {
      const m = fbm(wx / 170, wy / 170, 3);
      const p = vn(wx / 26, wy / 26, 5);
      const blade = vn(sx / 1.3, sy / 4.2, 7) * 0.6 + vn(sx / 0.8, sy / 2.6, 8) * 0.4;
      const dark = t === GRASS_DARK, tall = t === TALL;
      // warm, sunny green to cooler green
      r = dark ? 50 + 22 * m : 72 + 40 * m;
      g = dark ? 96 + 22 * m : 124 + 26 * m;
      b = dark ? 50 + 10 * m : 54 + 8 * m;
      if (tall) { r += 14; g += 6; }
      const k = (0.84 + 0.3 * p) * ((tall ? 0.8 : 0.88) + (tall ? 0.38 : 0.24) * blade);
      r *= k; g *= k; b *= k;
      // tiny flecks of light blades
      const f = hash2(Math.floor(sx * 1.5), Math.floor(sy * 1.5), 9);
      if (f > 0.985) { r += 30; g += 34; b += 10; }
      if (t === FLOWERS && f < 0.02) { const c = hash2(Math.floor(sx * 1.5), Math.floor(sy * 1.5), 10); r = c < 0.33 ? 240 : c < 0.66 ? 250 : 200; g = c < 0.33 ? 110 : c < 0.66 ? 230 : 140; b = c < 0.33 ? 150 : c < 0.66 ? 120 : 230; }
      ht = 0.35 + 0.35 * p + 0.25 * blade;
      break;
    }
    case DIRT: {
      const m = fbm(wx / 60, wy / 60, 13), p = vn(wx / 9, wy / 9, 14);
      r = 142 + 30 * m; g = 108 + 24 * m; b = 70 + 16 * m;
      const k = 0.86 + 0.22 * p + (hash2(Math.floor(sx * 2), Math.floor(sy * 2), 15) - 0.5) * 0.06;
      r *= k; g *= k; b *= k;
      // pebbles
      const cx = Math.floor(wx / 5), cy = Math.floor(wy / 5);
      if (hash2(cx, cy, 16) < 0.16) {
        const px = (cx + 0.2 + hash2(cx, cy, 17) * 0.6) * 5, py = (cy + 0.2 + hash2(cx, cy, 18) * 0.6) * 5;
        const dx = wx - px, dy = wy - py, d2 = dx * dx + dy * dy, rr = 0.8 + hash2(cx, cy, 19) * 0.9;
        if (d2 < rr * rr) { const lit = clamp01(0.6 - (dx + dy) / (rr * 2)); r = 150 + 50 * lit; g = 136 + 46 * lit; b = 116 + 40 * lit; ht = 0.9; }
        else if (d2 < (rr + 0.6) * (rr + 0.6) && dx + dy > 0) { r *= 0.8; g *= 0.8; b *= 0.8; }
      }
      ht = Math.max(ht, 0.25 + 0.4 * p);
      break;
    }
    case COBBLE: {
      // Voronoi stones
      const C = 7, gx = Math.floor(wx / C), gy = Math.floor(wy / C);
      let d1 = 1e9, d2 = 1e9, best = 0, bx = 0, by = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = gx + i, cy = gy + j;
        const px = (cx + 0.15 + hash2(cx, cy, 21) * 0.7) * C, py = (cy + 0.15 + hash2(cx, cy, 22) * 0.7) * C;
        const dx = wx - px, dy = wy - py, d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; best = hash2(cx, cy, 23); bx = dx; by = dy; } else if (d < d2) d2 = d;
      }
      const edge = d2 - d1;
      const tone = 0.88 + best * 0.2, warm = hash2(Math.floor(best * 1000), 1, 24);
      r = (138 + 22 * warm) * tone; g = (128 + 12 * warm) * tone; b = (114 - 4 * warm) * tone;
      // dome shading, light from the top-left of the screen (world -x-y is screen up)
      const n = d1 / (C * 0.62);
      const lit = -(bx + by) / (C * 0.6);
      const k = 1 - 0.28 * n * n + 0.16 * lit * n;
      r *= k; g *= k; b *= k;
      const grain = vn(wx * 0.9, wy * 0.9, 25);
      r *= 0.93 + grain * 0.12; g *= 0.93 + grain * 0.12; b *= 0.93 + grain * 0.12;
      const mortar = sstep(0.4, 1.6, edge);
      const mr = 74, mg = 68, mb = 56;
      r = mr + (r - mr) * mortar; g = mg + (g - mg) * mortar; b = mb + (b - mb) * mortar;
      // a bit of moss in the joints
      if (mortar < 0.5 && vn(wx / 30, wy / 30, 26) > 0.8) { r = 82; g = 108; b = 54; }
      ht = 0.55 + 0.4 * mortar;
      break;
    }
    case SAND: {
      const m = fbm(wx / 70, wy / 70, 31);
      const rip = Math.sin((wx * 0.55 + wy * 0.25) / 2.2 + vn(wx / 20, wy / 20, 32) * 6) * 0.035;
      r = 214 + 18 * m; g = 190 + 16 * m; b = 136 + 12 * m;
      const k = 0.94 + rip + (hash2(Math.floor(sx * 2), Math.floor(sy * 2), 33) - 0.5) * 0.05;
      r *= k; g *= k; b *= k;
      ht = 0.3 + 0.2 * m;
      break;
    }
    case WATER: case BRIDGE: {
      const dd = sstep(0.2, 3.2, depth);
      r = 70 + (24 - 70) * dd; g = 168 + (84 - 168) * dd; b = 172 + (140 - 172) * dd;
      const w1 = vn(sx / 14 + now * 0.3, sy / 3.2, 41), w2 = vn(sx / 7, sy / 1.8 - now * 0.2, 42);
      const wave = w1 * 0.6 + w2 * 0.4;
      const k = 0.92 + wave * 0.14;
      r *= k; g *= k; b *= k;
      if (wave > 0.72) { const s = (wave - 0.72) * 3; r += 90 * s; g += 90 * s; b += 80 * s; }
      ht = 0.5;
      break;
    }
    case FIELD: case CROPS: {
      const m = fbm(wx / 80, wy / 80, 51);
      const fur = Math.sin(wy * (Math.PI * 2 / 8) + vn(wx / 30, wy / 30, 52) * 1.5);
      r = 122 + 20 * m; g = 88 + 14 * m; b = 58 + 8 * m;
      const k = 0.9 + fur * 0.12 + (hash2(Math.floor(sx * 2), Math.floor(sy * 2), 53) - 0.5) * 0.05;
      r *= k; g *= k; b *= k;
      ht = 0.4 + 0.15 * fur;
      break;
    }
    case FLOOR: { // worn flagstones of the old village
      const C = 15, gx = Math.floor(wx / C + (Math.floor(wy / C) % 2) * 0.5), gy = Math.floor(wy / C);
      const lx = wx / C + (Math.floor(wy / C) % 2) * 0.5 - gx, ly = wy / C - gy;
      const e = Math.min(lx, 1 - lx, ly, 1 - ly) * C;
      const tone = 0.82 + hash2(gx, gy, 71) * 0.26, m = fbm(wx / 12, wy / 12, 72);
      r = 150 * tone * (0.9 + 0.2 * m); g = 140 * tone * (0.9 + 0.2 * m); b = 122 * tone * (0.9 + 0.2 * m);
      if (hash2(gx, gy, 73) < 0.3 && vn(wx / 3, wy / 3, 74) > 0.75) { r *= 0.7; g *= 0.7; b *= 0.7; } // cracks
      const j = sstep(0.3, 1.4, e);
      r = 70 + (r - 70) * j; g = 66 + (g - 66) * j; b = 54 + (b - 54) * j;
      if (j < 0.6 && vn(wx / 20, wy / 20, 75) > 0.55) { r = 76; g = 112; b = 50; } // grass in the joints
      ht = 0.5 + 0.3 * j;
      break;
    }
    case RUBBLE: {
      const m = fbm(wx / 30, wy / 30, 81);
      r = 120 + 20 * m; g = 104 + 18 * m; b = 80 + 12 * m;
      const cx = Math.floor(wx / 6), cy = Math.floor(wy / 6);
      const px = (cx + 0.5) * 6 + (hash2(cx, cy, 82) - 0.5) * 3, py = (cy + 0.5) * 6 + (hash2(cx, cy, 83) - 0.5) * 3;
      const dx = wx - px, dy = wy - py, rr = 1.2 + hash2(cx, cy, 84) * 1.6;
      if (hash2(cx, cy, 85) < 0.55 && dx * dx + dy * dy < rr * rr) { const lit = clamp01(0.6 - (dx + dy) / (rr * 2)); const t2 = 120 + 70 * lit; r = t2; g = t2 * 0.95; b = t2 * 0.86; }
      ht = 0.6;
      break;
    }
    default: r = 90; g = 130; b = 60;
  }
  out3[0] = r; out3[1] = g; out3[2] = b;
  return ht;
}

/**
 * Paints the screen rectangle [sx0, sx0 + cw) x [sy0, sy0 + ch) at `res` pixels per screen px into RGBA `px`.
 */
export function paintChunk(g: GroundData, f: Fields, sx0: number, sy0: number, cw: number, ch: number, res: number, px: Uint8ClampedArray) {
  const { w, h, tile, ground } = g;
  const W = Math.round(cw * res), H = Math.round(ch * res);
  const wt = new Float32Array(NT);
  const types: number[] = [];
  const at = (x: number, y: number) => ground[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)];
  const field = (arr: Float32Array, fx: number, fy: number) => {
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const g = (x: number, y: number) => arr[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)];
    return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
  };
  const c1 = new Float32Array(3), c2 = new Float32Array(3);
  const add = (t: number, k: number) => {
    if (k <= 0) return;
    t %= 45; // display grids carry art-row variants
    if (t === BRIDGE) t = WATER;
    if (wt[t] === 0) types.push(t);
    wt[t] += k;
  };
  for (let j = 0; j < H; j++) {
    const sy = sy0 + (j + 0.5) / res;
    for (let i = 0; i < W; i++) {
      const sx = sx0 + (i + 0.5) / res;
      const wx = sy + sx / 2, wy = sy - sx / 2;
      // wavy borders: warp the lookup point
      const u = wx + (vn(wx / 15, wy / 15, 1) - 0.5) * 16, v = wy + (vn(wx / 15, wy / 15, 2) - 0.5) * 16;
      const fx = u / tile - 0.5, fy = v / tile - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      let tx = fx - x0, ty = fy - y0;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      types.length = 0;
      add(at(x0, y0), (1 - tx) * (1 - ty)); add(at(x0 + 1, y0), tx * (1 - ty));
      add(at(x0, y0 + 1), (1 - tx) * ty); add(at(x0 + 1, y0 + 1), tx * ty);
      const depth = field(f.depth, wx / tile - 0.5, wy / tile - 0.5);
      let s1 = -9, s2 = -9, t1 = types[0], t2 = -1;
      for (const t of types) {
        const ht = material(t, wx, wy, sx, sy, depth, 0);
        const s = wt[t] + 0.45 * (ht - 0.5);
        if (s > s1) { s2 = s1; t2 = t1; s1 = s; t1 = t; c2.set(c1); c1.set(out3); }
        else if (s > s2) { s2 = s; t2 = t; c2.set(out3); }
      }
      let r = c1[0], gg = c1[1], b = c1[2];
      if (t2 >= 0 && t2 !== t1) {
        const a = clamp01(0.5 + (s1 - s2) / 0.09);
        r = c1[0] * a + c2[0] * (1 - a); gg = c1[1] * a + c2[1] * (1 - a); b = c1[2] * a + c2[2] * (1 - a);
        // foam where water meets land, wet darker ground just above it
        if ((t1 === WATER) !== (t2 === WATER)) {
          const foam = 1 - Math.abs(a - 0.5) * 2;
          const fo = foam * foam * (0.55 + 0.45 * vn(sx / 3, sy / 1.5, 61));
          r += (235 - r) * fo; gg += (245 - gg) * fo; b += (240 - b) * fo;
        }
      }
      if (t1 !== WATER) {
        const wet = (wt[WATER] || 0);
        if (wet > 0) { const k = 1 - 0.3 * Math.min(1, wet * 2); r *= k; gg *= k; b *= k * 1.02; }
        // contact shadow around walls, rocks and posts
        const ao = field(f.ao, wx / tile - 0.5, wy / tile - 0.5);
        if (ao > 0) { const k = 1 - 0.32 * ao; r *= k; gg *= k; b *= k; }
      }
      for (const t of types) wt[t] = 0;
      const o = (j * W + i) * 4;
      px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = 255;
    }
  }
}
