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
  // big, slow grime and damp patches shared by every land material (muted, weathered look)
  const grime = fbm(wx / 110, wy / 110, 91);
  const grain = hash2(Math.floor(sx * 2), Math.floor(sy * 2), 92) - 0.5;
  switch (t) {
    case GRASS: case GRASS_DARK: case TALL: case FLOWERS: {
      const m = fbm(wx / 150, wy / 150, 3);
      const p = vn(wx / 22, wy / 22, 5);
      const blade = vn(sx / 1.1, sy / 4.6, 7) * 0.55 + vn(sx / 0.7, sy / 2.8, 8) * 0.45;
      const dark = t === GRASS_DARK, tall = t === TALL;
      // dark olive to dusty green; dry straw patches
      r = dark ? 46 + 16 * m : 66 + 22 * m;
      g = dark ? 64 + 14 * m : 84 + 18 * m;
      b = dark ? 38 + 6 * m : 42 + 6 * m;
      const dry = sstep(0.55, 0.78, fbm(wx / 70, wy / 70, 4)) * (dark ? 0.4 : 0.8);
      r += (112 - r) * dry * 0.6; g += (100 - g) * dry * 0.5; b += (58 - b) * dry * 0.4;
      if (tall) { r += 10; g += 6; }
      const k = (0.8 + 0.34 * p) * ((tall ? 0.7 : 0.76) + (tall ? 0.55 : 0.44) * blade);
      r *= k; g *= k; b *= k;
      // bare earth showing through worn spots
      const bare = sstep(0.72, 0.86, vn(wx / 38, wy / 38, 6) * 0.7 + p * 0.3 + (0.5 - blade) * 0.25) * (dark ? 0.4 : 0.9);
      if (bare > 0) {
        const e = 0.7 + 0.35 * vn(wx / 5, wy / 5, 12) + 0.25 * vn(wx / 1.6, wy / 1.6, 11);
        r += (84 * e - r) * bare; g += (66 * e - g) * bare; b += (46 * e - b) * bare;
      }
      // fallen leaves, twigs and small stones
      const cx = Math.floor(wx / 4), cy = Math.floor(wy / 4), hc = hash2(cx, cy, 13);
      if (hc < 0.07) {
        const px = (cx + 0.5) * 4 + (hash2(cx, cy, 14) - 0.5) * 2.4, py = (cy + 0.5) * 4 + (hash2(cx, cy, 15) - 0.5) * 2.4;
        const dx = wx - px, dy = wy - py;
        if (hc < 0.035) { // leaf: a small rotated ellipse in ochre / rust
          const an = hash2(cx, cy, 16) * 3.14, ca = Math.cos(an), sa = Math.sin(an);
          const u = (dx * ca + dy * sa) / 1.1, v = (-dx * sa + dy * ca) / 0.55;
          if (u * u + v * v < 1) { const c = hash2(cx, cy, 17); r = c < 0.5 ? 128 : 104; g = c < 0.5 ? 86 : 60; b = c < 0.5 ? 36 : 32; r *= 0.85 + 0.3 * (1 - u * u); g *= 0.85 + 0.3 * (1 - u * u); }
        } else { // pebble with a shadow
          const rr = 0.5 + hash2(cx, cy, 18) * 0.6, d2 = dx * dx + dy * dy;
          if (d2 < rr * rr) { const lit = clamp01(0.55 - (dx + dy) / (rr * 2)); r = 72 + 40 * lit; g = 70 + 36 * lit; b = 62 + 30 * lit; }
          else if (d2 < (rr + 0.5) * (rr + 0.5) && dx + dy > 0) { r *= 0.7; g *= 0.7; b *= 0.7; }
        }
      }
      const f = hash2(Math.floor(sx * 1.5), Math.floor(sy * 1.5), 9);
      if (f > 0.99) { r += 26; g += 26; b += 8; }
      if (t === FLOWERS && f < 0.015) { const c = hash2(Math.floor(sx * 1.5), Math.floor(sy * 1.5), 10); r = c < 0.33 ? 170 : c < 0.66 ? 196 : 150; g = c < 0.33 ? 70 : c < 0.66 ? 170 : 110; b = c < 0.33 ? 90 : c < 0.66 ? 80 : 170; }
      ht = 0.35 + 0.35 * p + 0.25 * blade - bare * 0.2;
      break;
    }
    case DIRT: {
      const m = fbm(wx / 50, wy / 50, 13), p = vn(wx / 8, wy / 8, 14);
      r = 98 + 22 * m; g = 76 + 16 * m; b = 54 + 10 * m;
      const damp = sstep(0.6, 0.8, fbm(wx / 40, wy / 40, 19));
      const k = (0.84 + 0.26 * p + grain * 0.08) * (1 - damp * 0.25);
      r *= k; g *= k; b *= k;
      // dried cracks: thin dark lines along big Voronoi edges
      const C = 22, gx = Math.floor(wx / C), gy = Math.floor(wy / C);
      let d1 = 1e9, d2 = 1e9;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const qx = (gx + i + hash2(gx + i, gy + j, 101)) * C, qy = (gy + j + hash2(gx + i, gy + j, 102)) * C;
        const d = Math.hypot(wx - qx, wy - qy);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      if (d2 - d1 < 0.6 && vn(wx / 12, wy / 12, 103) > 0.62) { r *= 0.8; g *= 0.8; b *= 0.8; }
      // gravel and stones
      const cx = Math.floor(wx / 3.5), cy = Math.floor(wy / 3.5);
      if (hash2(cx, cy, 16) < 0.22) {
        const px = (cx + 0.2 + hash2(cx, cy, 17) * 0.6) * 3.5, py = (cy + 0.2 + hash2(cx, cy, 18) * 0.6) * 3.5;
        const dx = wx - px, dy = wy - py, d2s = dx * dx + dy * dy, rr = 0.45 + hash2(cx, cy, 19) * 0.9;
        if (d2s < rr * rr) { const lit = clamp01(0.55 - (dx + dy) / (rr * 2)); const tone = 0.8 + hash2(cx, cy, 20) * 0.4; r = (96 + 54 * lit) * tone; g = (90 + 48 * lit) * tone; b = (80 + 42 * lit) * tone; ht = 0.9; }
        else if (d2s < (rr + 0.5) * (rr + 0.5) && dx + dy > 0) { r *= 0.68; g *= 0.68; b *= 0.68; }
      }
      ht = Math.max(ht, 0.25 + 0.4 * p);
      break;
    }
    case COBBLE: {
      // worn, irregular Voronoi setts with packed earth in the joints
      const C = 7.5, ux = wx + (vn(wx / 9, wy / 9, 27) - 0.5) * 3, uy = wy + (vn(wx / 9, wy / 9, 28) - 0.5) * 3;
      const gx = Math.floor(ux / C), gy = Math.floor(uy / C);
      let d1 = 1e9, d2 = 1e9, best = 0, bx = 0, by = 0, cid = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = gx + i, cy = gy + j;
        const px = (cx + 0.15 + hash2(cx, cy, 21) * 0.7) * C, py = (cy + 0.15 + hash2(cx, cy, 22) * 0.7) * C;
        const dx = ux - px, dy = uy - py, d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; best = hash2(cx, cy, 23); bx = dx; by = dy; cid = cx * 7919 + cy; } else if (d < d2) d2 = d;
      }
      const edge = d2 - d1;
      const missing = hash2(cid, 3, 29) < 0.05;
      const tone = 0.78 + best * 0.32, warm = hash2(cid, 1, 24);
      r = (104 + 16 * warm) * tone; g = (100 + 8 * warm) * tone; b = (92 - 2 * warm) * tone;
      const n = d1 / (C * 0.62), lit = -(bx + by) / (C * 0.6);
      const k = 1 - 0.34 * n * n + 0.2 * lit * n;
      r *= k; g *= k; b *= k;
      const st = vn(wx * 0.8, wy * 0.8, 25) * 0.6 + vn(wx * 2.2, wy * 2.2, 26) * 0.4; // stone grain and chips
      r *= 0.88 + st * 0.2; g *= 0.88 + st * 0.2; b *= 0.88 + st * 0.2;
      const mortar = missing ? 0 : sstep(0.35, 1.5, edge);
      const mr = 58 + grain * 10, mg = 47 + grain * 8, mb = 36;
      r = mr + (r - mr) * mortar; g = mg + (g - mg) * mortar; b = mb + (b - mb) * mortar;
      if (mortar < 0.6 && vn(wx / 24, wy / 24, 26) > 0.72) { r = 58; g = 72; b = 38; } // moss in the joints
      ht = 0.55 + 0.4 * mortar;
      break;
    }
    case SAND: {
      const m = fbm(wx / 60, wy / 60, 31);
      const rip = Math.sin((wx * 0.55 + wy * 0.25) / 2.2 + vn(wx / 20, wy / 20, 32) * 6) * 0.04;
      r = 158 + 18 * m; g = 140 + 14 * m; b = 104 + 10 * m;
      const k = 0.92 + rip + grain * 0.07;
      r *= k; g *= k; b *= k;
      const cx = Math.floor(wx / 5), cy = Math.floor(wy / 5);
      if (hash2(cx, cy, 34) < 0.08) { // shell bits and pebbles
        const dx = wx - (cx + 0.5) * 5, dy = wy - (cy + 0.5) * 5;
        if (dx * dx + dy * dy < 0.5) { r = 196; g = 186; b = 166; }
      }
      ht = 0.3 + 0.2 * m;
      break;
    }
    case WATER: case BRIDGE: {
      const dd = sstep(0.2, 3.2, depth);
      r = 58 + (16 - 58) * dd; g = 86 + (38 - 86) * dd; b = 72 + (48 - 72) * dd;
      const w1 = vn(sx / 14 + now * 0.3, sy / 3.2, 41), w2 = vn(sx / 7, sy / 1.8 - now * 0.2, 42);
      const wave = w1 * 0.6 + w2 * 0.4;
      const k = 0.9 + wave * 0.16;
      r *= k; g *= k; b *= k;
      if (wave > 0.74) { const s = (wave - 0.74) * 2.4; r += 70 * s; g += 76 * s; b += 70 * s; }
      ht = 0.5;
      break;
    }
    case FIELD: case CROPS: {
      const m = fbm(wx / 80, wy / 80, 51);
      const fur = Math.sin(wy * (Math.PI * 2 / 8) + vn(wx / 30, wy / 30, 52) * 1.5);
      r = 84 + 16 * m; g = 62 + 12 * m; b = 42 + 6 * m;
      const k = 0.86 + fur * 0.16 + grain * 0.08;
      r *= k; g *= k; b *= k;
      if (fur > 0.7 && hash2(Math.floor(wx * 1.5), Math.floor(wy * 1.5), 54) < 0.12) { r = 112; g = 104; b = 58; } // straw
      ht = 0.4 + 0.15 * fur;
      break;
    }
    case FLOOR: { // worn flagstones of the old village
      const C = 15, gx = Math.floor(wx / C + (Math.floor(wy / C) % 2) * 0.5), gy = Math.floor(wy / C);
      const lx = wx / C + (Math.floor(wy / C) % 2) * 0.5 - gx, ly = wy / C - gy;
      const e = Math.min(lx, 1 - lx, ly, 1 - ly) * C;
      const tone = 0.78 + hash2(gx, gy, 71) * 0.28, m = fbm(wx / 12, wy / 12, 72);
      r = 108 * tone * (0.88 + 0.24 * m); g = 102 * tone * (0.88 + 0.24 * m); b = 90 * tone * (0.88 + 0.24 * m);
      if (hash2(gx, gy, 73) < 0.35 && vn(wx / 3, wy / 3, 74) > 0.74) { r *= 0.62; g *= 0.62; b *= 0.62; } // cracks
      const j = sstep(0.3, 1.4, e);
      r = 48 + (r - 48) * j; g = 44 + (g - 44) * j; b = 36 + (b - 36) * j;
      if (j < 0.6 && vn(wx / 20, wy / 20, 75) > 0.5) { r = 58; g = 74; b = 38; } // grass in the joints
      ht = 0.5 + 0.3 * j;
      break;
    }
    case RUBBLE: {
      const m = fbm(wx / 30, wy / 30, 81);
      r = 82 + 16 * m; g = 70 + 14 * m; b = 54 + 10 * m;
      const cx = Math.floor(wx / 6), cy = Math.floor(wy / 6);
      const px = (cx + 0.5) * 6 + (hash2(cx, cy, 82) - 0.5) * 3, py = (cy + 0.5) * 6 + (hash2(cx, cy, 83) - 0.5) * 3;
      const dx = wx - px, dy = wy - py, rr = 1.2 + hash2(cx, cy, 84) * 1.6;
      if (hash2(cx, cy, 85) < 0.55 && dx * dx + dy * dy < rr * rr) { const lit = clamp01(0.6 - (dx + dy) / (rr * 2)); const t2 = 84 + 66 * lit; r = t2; g = t2 * 0.95; b = t2 * 0.86; }
      ht = 0.6;
      break;
    }
    default: r = 70; g = 84; b = 44;
  }
  if (t !== WATER && t !== BRIDGE) {
    const k = 0.78 + 0.3 * grime; // weathering: darker, damp patches
    r *= k; g *= k; b *= k;
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
          r += (190 - r) * fo * 0.7; gg += (196 - gg) * fo * 0.7; b += (184 - b) * fo * 0.7;
        }
      }
      if (t1 !== WATER) {
        const wet = (wt[WATER] || 0);
        if (wet > 0) { const k = 1 - 0.3 * Math.min(1, wet * 2); r *= k; gg *= k; b *= k * 1.02; }
        // contact shadow around walls, rocks and posts
        const ao = field(f.ao, wx / tile - 0.5, wy / tile - 0.5);
        if (ao > 0) { const k = 1 - 0.45 * ao; r *= k; gg *= k; b *= k; }
      }
      for (const t of types) wt[t] = 0;
      const o = (j * W + i) * 4;
      px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = 255;
    }
  }
}
