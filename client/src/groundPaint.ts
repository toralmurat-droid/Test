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
  /** The elemental wilds (shared/map.ts ELEMENT_LANDS): rects in tiles whose ground turns blighted, frosted, burned or storm-scoured. */
  lands?: { x: number; y: number; w: number; h: number; el: string }[];
}

// Tile ids (shared/map.ts T)
const GRASS = 0, GRASS_DARK = 1, TALL = 2, FLOWERS = 3, DIRT = 4, COBBLE = 5, SAND = 6, WATER = 7, BRIDGE = 8, FIELD = 9, CROPS = 10;
const FLOOR = 39, RUBBLE = 40;
const NT = 64;
/** Kernel radius in tiles: how far grounds reach into each other. */
const KR = 1.8;

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
/** How much of the material owns this spot (1 deep inside, ~0.3 at a border): old roads crumble near their edges. */
let OWN = 1;

/**
 * Colour + "height" of one material at a world point. The height lets materials poke into each other at
 * borders (cobbles over grass, grass over dirt) instead of a plain cross-fade.
 */
const hx = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const COB = ["#3a3632", "#524d47", "#6a645b", "#837b70", "#9d9486"].map(hx);
const COB_WARM = ["#3d342c", "#574b3f", "#706152", "#8a7966", "#a4917b"].map(hx);
const COB_COOL = ["#33353a", "#4a4d52", "#62646a", "#7b7d82", "#95969a"].map(hx);
const COB_LINE = hx("#1b1714"), JOINT = ["#241c15", "#3a2e22", "#4f4030"].map(hx), MOSSG = ["#2a3a1a", "#3e5424", "#566e30"].map(hx);

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
      // worn, irregular hand-laid setts: uneven sizes, sunken and tilted stones, chips, cracks, earth in the joints
      const w1 = 3, w2 = 0.8;
      const ux = wx + (vn(wx / 9, wy / 9, 27) - 0.5) * w1 * 2 + (vn(wx / 2.6, wy / 2.6, 37) - 0.5) * w2;
      const uy = wy + (vn(wx / 9, wy / 9, 28) - 0.5) * w1 * 2 + (vn(wx / 2.6, wy / 2.6, 38) - 0.5) * w2;
      const C = 5.8;
      const gx = Math.floor(ux / C), gy = Math.floor(uy / C);
      let d1 = 1e9, d2 = 1e9, best = 0, bx = 0, by = 0, cid = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = gx + i, cy = gy + j;
        const px = (cx + 0.1 + hash2(cx, cy, 21) * 0.8) * C, py = (cy + 0.1 + hash2(cx, cy, 22) * 0.8) * C;
        const dx = ux - px, dy = uy - py, d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; best = hash2(cx, cy, 23); bx = dx; by = dy; cid = cx * 7919 + cy; } else if (d < d2) d2 = d;
      }
      const edge = d2 - d1;
      // patches where the setts are gone: packed earth and gravel show through
      const decay = clamp01((0.85 - OWN) * 1.6);
      const hole = sstep(0.72, 0.8, vn(wx / 30, wy / 30, 39) * 0.75 + hash2(cid, 5, 40) * 0.25 + decay * 0.35);
      const missing = hash2(cid, 3, 29) < 0.04 + decay * 0.45 || hole > 0.5;
      // Drawn like the bonfire: each sett a few flat tones from a stone ramp with ordered dithering, a dark outline,
      // a lit rim on the top-left, so the square reads as hand-made pixel art rather than soft shading.
      const tone = 0.7 + best * 0.42, warm = hash2(cid, 1, 24);
      const tilt = (hash2(cid, 6, 41) - 0.5) * 0.9, sink = hash2(cid, 7, 42);
      const n = d1 / (C * 0.6), lit = -(bx * (1 + tilt) + by * (1 - tilt)) / (C * 0.6);
      const st = vn(wx * 0.8, wy * 0.8, 25) * 0.6 + vn(wx * 2.2, wy * 2.2, 26) * 0.4; // stone grain and chips
      const dx0 = Math.floor(sx * 1.5), dy0 = Math.floor(sy * 1.5), dth = BAYER4[(dy0 & 3) * 4 + (dx0 & 3)];
      let lv = (tone - 0.7) * 4 + 1.2 - n * n * 1.3 + lit * n * 1.4 + (st - 0.5) * 1.4 + dth * 0.9 + (sink < 0.12 ? -0.7 : sink > 0.9 ? 0.4 : 0);
      if (hash2(cid, 8, 43) < 0.1) { // hairline cracks across some stones
        const an = hash2(cid, 9, 44) * Math.PI, cr = Math.abs(bx * Math.sin(an) - by * Math.cos(an) + (vn(wx * 1.3, wy * 1.3, 45) - 0.5) * 0.9);
        if (cr < 0.22) lv = -1;
      }
      const rp = warm < 0.22 ? COB_WARM : warm > 0.9 ? COB_COOL : COB;
      let c = lv < 0 ? COB_LINE : rp[Math.min(rp.length - 1, Math.floor(lv))];
      const jw = 0.35 + 0.5 * vn(wx / 14, wy / 14, 46);
      const mortar = missing ? 0 : edge > jw + 0.55 ? 1 : edge > jw ? 0.5 : 0;
      if (mortar === 0.5) c = lit > 0.25 && n > 0.6 ? rp[rp.length - 2] : COB_LINE; // outline, catching light on the lit side
      else if (mortar === 0) c = (grain + dth) > 0.55 ? JOINT[1] : JOINT[0];
      if (missing) { // loose gravel and earth in the gaps
        const gc = hash2(Math.floor(wx * 1.1), Math.floor(wy * 1.1), 47);
        c = gc < 0.12 ? COB[3] : gc < 0.3 ? COB[1] : (grain + dth) > 0.6 ? JOINT[2] : JOINT[1];
      }
      if (mortar < 1 && vn(wx / 24, wy / 24, 26) + dth * 0.12 > 0.68) c = MOSSG[(grain + dth) > 0.55 ? 2 : (grain + dth) > 0.2 ? 1 : 0]; // moss in the joints
      r = c[0]; g = c[1]; b = c[2];
      ht = (missing ? 0.3 : 0.55 + 0.4 * mortar) + (sink - 0.5) * 0.2;
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
    case FLOOR: { // worn flagstones of the old village: cracked, sunk, some lifted out with grass and earth below
      const C = 15, ox = (vn(wx / 20, wy / 20, 76) - 0.5) * 2.5, oy = (vn(wx / 20, wy / 20, 77) - 0.5) * 2.5;
      const qx = wx + ox, qy = wy + oy;
      const row = Math.floor(qy / C), shift = (row % 2) * 0.5 + hash2(row, 0, 78) * 0.3;
      const gx = Math.floor(qx / C + shift), gy = row;
      const lx = qx / C + shift - gx, ly = qy / C - gy;
      const e = Math.min(lx, 1 - lx, ly, 1 - ly) * C;
      const gone = hash2(gx, gy, 79) < 0.14 || vn(wx / 40, wy / 40, 80) > 0.7;
      if (gone) { // the slab is missing: earth, weeds and stone bits
        const m = vn(wx / 4, wy / 4, 81), gr = vn(wx / 9, wy / 9, 82);
        r = 70 + 18 * m; g = 60 + 14 * m; b = 44 + 8 * m;
        if (gr > 0.45) { const k = 0.8 + 0.4 * vn(sx / 1.1, sy / 3.2, 83); r = 62 * k; g = 80 * k; b = 40 * k; }
        if (hash2(Math.floor(wx), Math.floor(wy), 84) < 0.08) { r = 112; g = 106; b = 94; }
        { const t = BAYER4[(Math.floor(sy * 1.5) & 3) * 4 + (Math.floor(sx * 1.5) & 3)]; r = Math.round(r / 14 + t) * 14; g = Math.round(g / 14 + t) * 14; b = Math.round(b / 14 + t) * 14; }
        ht = 0.35;
        break;
      }
      const tone = 0.74 + hash2(gx, gy, 71) * 0.34, m = fbm(wx / 12, wy / 12, 72);
      // each slab sits a little tilted: light falls off across it
      const tilt = (hash2(gx, gy, 85) - 0.5) * 0.3, sl = 1 + tilt * ((lx - 0.5) + (ly - 0.5));
      const kk = tone * (0.86 + 0.26 * m) * sl;
      r = 108 * kk; g = 102 * kk; b = 90 * kk;
      if (hash2(gx, gy, 73) < 0.45) { // cracks running across the slab
        const an = hash2(gx, gy, 86) * Math.PI, d = Math.abs((lx - 0.5) * Math.sin(an) - (ly - 0.5) * Math.cos(an) + (vn(wx / 2, wy / 2, 87) - 0.5) * 0.12);
        if (d < 0.025) { r *= 0.58; g *= 0.58; b *= 0.58; }
      }
      if (hash2(gx, gy, 88) < 0.3 && lx + ly < 0.45) { r *= 0.7; g *= 0.68; b *= 0.66; } // chipped corner
      const j = sstep(0.3, 1.6, e);
      r = 48 + (r - 48) * j; g = 44 + (g - 44) * j; b = 36 + (b - 36) * j;
      if (j < 0.75 && vn(wx / 14, wy / 14, 75) > 0.42) { r = 56 + grain * 14; g = 74 + grain * 14; b = 36; } // grass in the joints
      if (vn(wx / 10, wy / 10, 89) > 0.7) { r = r * 0.6 + 50 * 0.4; g = g * 0.6 + 70 * 0.4; b = b * 0.6 + 34 * 0.4; } // moss creeping over
      { // pixel style like the bonfire: flat dithered tone steps and a dark edge on each slab
        const t = BAYER4[(Math.floor(sy * 1.5) & 3) * 4 + (Math.floor(sx * 1.5) & 3)];
        r = Math.round(r / 14 + t) * 14; g = Math.round(g / 14 + t) * 14; b = Math.round(b / 14 + t) * 14;
        if (e > 0.25 && e < 0.85) { r = 30; g = 26; b = 22; } else if (e >= 0.85 && e < 1.4 && lx + ly < 1) { r *= 1.15; g *= 1.15; b *= 1.15; }
      }
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
/**
 * The ground of an elemental land over the normal ground colour (k = how deep inside, 0..1, wavy at the edges).
 * Poison: sickly yellow-green bog with oily sheen on the pools. Cold: hoar-frost on the grass, the tarn iced over
 * with cracks. Fire: ash and char with glowing ember cracks. Shock: slate-grey scoured earth with glassy blue scorch lines.
 */
function landTint(el: string, k: number, r: number, g: number, b: number, wx: number, wy: number, sx: number, sy: number, wet: boolean): [number, number, number] {
  const lum = (r * 0.3 + g * 0.55 + b * 0.15) / 255, dth = BAYER4[(Math.floor(sy * 1.5) & 3) * 4 + (Math.floor(sx * 1.5) & 3)];
  let tr = r, tg = g, tb = b;
  if (el === "poison") {
    if (wet) { const s = vn(sx / 6, sy / 2.5, 301); tr = 46 + 30 * s; tg = 70 + 40 * s; tb = 22 + 12 * s; if (s > 0.78) { tr = 150; tg = 118; tb = 170; } } // oily violet sheen
    else { tr = 40 + 120 * lum; tg = 46 + 118 * lum; tb = 14 + 34 * lum; if (vn(wx / 9, wy / 9, 302) > 0.74) { tr *= 0.7; tg *= 0.62; tb *= 0.7; } }
  } else if (el === "cold") {
    if (wet) { // ice: pale blue-grey, cracks along Voronoi-ish lines, a little shine
      const c = Math.abs(vn(wx / 7, wy / 7, 311) - vn(wx / 7 + 3.1, wy / 7, 312));
      tr = 120 + 40 * lum; tg = 150 + 40 * lum; tb = 170 + 30 * lum;
      if (c < 0.035) { tr *= 0.72; tg *= 0.78; tb *= 0.85; } else if (vn(sx / 10, sy / 3, 313) > 0.75) { tr += 40; tg += 40; tb += 34; }
    } else {
      const rime = vn(wx / 14, wy / 14, 314) * 0.6 + vn(wx / 3, wy / 3, 315) * 0.4 + dth * 0.2;
      tr = 60 + 110 * lum; tg = 72 + 112 * lum; tb = 84 + 120 * lum;
      if (rime > 0.55) { tr = 178 + 30 * lum; tg = 196 + 30 * lum; tb = 212 + 30 * lum; } // white frost patches
    }
  } else if (el === "fire") {
    tr = 38 + 70 * lum; tg = 32 + 56 * lum; tb = 28 + 44 * lum; // ash and char
    if (vn(wx / 20, wy / 20, 321) > 0.6) { tr *= 0.6; tg *= 0.55; tb *= 0.55; } // burned black patches
    const C = 26, gx = Math.floor(wx / C), gy = Math.floor(wy / C); // ember cracks: glowing lines on big cells
    let d1 = 1e9, d2 = 1e9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const qx = (gx + i + hash2(gx + i, gy + j, 322)) * C, qy = (gy + j + hash2(gx + i, gy + j, 323)) * C;
      const d = Math.hypot(wx - qx, wy - qy);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    const e = d2 - d1;
    if (e < 0.9 && vn(wx / 10, wy / 10, 324) > 0.5) { const hot = vn(wx / 4, wy / 4, 325); tr = 200 + 55 * hot; tg = 70 + 80 * hot; tb = 20 + 20 * hot; }
    else if (e < 2) { tr *= 0.7; tg *= 0.62; tb *= 0.6; }
  } else if (el === "shock") {
    tr = 52 + 80 * lum; tg = 56 + 82 * lum; tb = 70 + 96 * lum; // slate, scoured
    const fl = Math.abs(vn(wx / 16, wy / 16, 331) - 0.5) * 2; // lightning scars: thin glassy streaks
    if (fl < 0.035 && vn(wx / 30, wy / 30, 332) > 0.55) { tr = 150; tg = 170; tb = 255; }
    else if (fl < 0.08 && vn(wx / 30, wy / 30, 332) > 0.55) { tr *= 0.6; tg *= 0.6; tb *= 0.7; }
  }
  return [r + (tr - r) * k, g + (tg - g) * k, b + (tb - b) * k];
}

export function paintChunk(g: GroundData, f: Fields, sx0: number, sy0: number, cw: number, ch: number, res: number, px: Uint8ClampedArray) {
  const { w, h, tile, ground } = g;
  // lands that touch this chunk (world box of the iso rectangle, in tiles, with a margin)
  const wxs = [sy0 + sx0 / 2, sy0 + (sx0 + cw) / 2, sy0 + ch + sx0 / 2, sy0 + ch + (sx0 + cw) / 2], wys = [sy0 - sx0 / 2, sy0 - (sx0 + cw) / 2, sy0 + ch - sx0 / 2, sy0 + ch - (sx0 + cw) / 2];
  const bx0 = Math.min(...wxs) / tile - 3, bx1 = Math.max(...wxs) / tile + 3, by0 = Math.min(...wys) / tile - 3, by1 = Math.max(...wys) / tile + 3;
  const lands = (g.lands ?? []).filter((l) => l.x < bx1 && l.x + l.w > bx0 && l.y < by1 && l.y + l.h > by0);
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
      const u = wx + (vn(wx / 45, wy / 45, 3) - 0.5) * 18 + (vn(wx / 15, wy / 15, 1) - 0.5) * 10 + (vn(wx / 4, wy / 4, 4) - 0.5) * 4;
      const v = wy + (vn(wx / 45, wy / 45, 5) - 0.5) * 18 + (vn(wx / 15, wy / 15, 2) - 0.5) * 10 + (vn(wx / 4, wy / 4, 6) - 0.5) * 4;
      // wide tent kernel over the tiles around: a broad zone where neighbouring grounds mix
      const fx = u / tile - 0.5, fy = v / tile - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      types.length = 0;
      let tot = 0;
      for (let b2 = -1; b2 <= 2; b2++) {
        const ky = 1 - Math.abs(fy - (y0 + b2)) / KR;
        if (ky <= 0) continue;
        for (let a2 = -1; a2 <= 2; a2++) {
          const kx = 1 - Math.abs(fx - (x0 + a2)) / KR;
          if (kx <= 0) continue;
          add(at(x0 + a2, y0 + b2), kx * ky); tot += kx * ky;
        }
      }
      for (const t of types) wt[t] /= tot;
      const depth = field(f.depth, wx / tile - 0.5, wy / tile - 0.5);
      let s1 = -9, s2 = -9, t1 = types[0], t2 = -1;
      let ar = 0, ag = 0, ab = 0, al = 0; // weighted mean colour of the land grounds here (dust, sand and earth carry over)
      for (const t of types) {
        OWN = wt[t];
        const ht = material(t, wx, wy, sx, sy, depth, 0);
        // patches: each ground spills into its neighbour as islands and specks, bigger blobs then fine scatter
        const wet = t === WATER;
        const patch = vn(wx / 16, wy / 16, 70 + t) * 0.55 + vn(wx / 5, wy / 5, 80 + t) * 0.3 + hash2(Math.floor(wx / 1.5), Math.floor(wy / 1.5), 60 + t) * 0.15;
        const s = wt[t] + (wet ? 0.3 : 1.15) * (patch - 0.5) + (wet ? 0.2 : 0.4) * (ht - 0.5);
        if (s > s1) { s2 = s1; t2 = t1; s1 = s; t1 = t; c2.set(c1); c1.set(out3); }
        else if (s > s2) { s2 = s; t2 = t; c2.set(out3); }
        if (!wet) { ar += out3[0] * wt[t]; ag += out3[1] * wt[t]; ab += out3[2] * wt[t]; al += wt[t]; }
      }
      let r = c1[0], gg = c1[1], b = c1[2];
      if (t1 !== WATER && al > 0 && wt[t1] < 0.98) {
        const k = 0.45 * (1 - wt[t1]);
        c1[0] += (ar / al - c1[0]) * k; c1[1] += (ag / al - c1[1]) * k; c1[2] += (ab / al - c1[2]) * k;
        r = c1[0]; gg = c1[1]; b = c1[2];
      }
      if (t2 >= 0 && t2 !== t1) {
        const soft = t1 <= FLOWERS && t2 <= FLOWERS; // grass into grass: a wide, soft blend, no earth band
        const a = clamp01(0.5 + (s1 - s2) / (soft ? 0.5 : 0.09));
        r = c1[0] * a + c2[0] * (1 - a); gg = c1[1] * a + c2[1] * (1 - a); b = c1[2] * a + c2[2] * (1 - a);
        // worn earth and scattered gravel along borders between land materials
        if (!soft && t1 !== WATER && t2 !== WATER && t1 !== DIRT) {
          const band = clamp01(1 - (s1 - s2) / 0.18) * (0.55 + 0.45 * vn(wx / 6, wy / 6, 64));
          if (band > 0.15) {
            material(DIRT, wx, wy, sx, sy, 0, 0);
            const e = band * 0.75;
            r += (out3[0] * 0.92 - r) * e; gg += (out3[1] * 0.92 - gg) * e; b += (out3[2] * 0.92 - b) * e;
          }
        }
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
      if (lands.length) {
        const tx = wx / tile, ty = wy / tile;
        for (const l of lands) {
          const d = Math.min(tx - l.x, l.x + l.w - tx, ty - l.y, l.y + l.h - ty) + (vn(wx / 40, wy / 40, 340) - 0.5) * 5 + (vn(wx / 9, wy / 9, 341) - 0.5) * 1.5;
          if (d <= 0) continue;
          [r, gg, b] = landTint(l.el, Math.min(1, d / 3.5) * 0.9, r, gg, b, wx, wy, sx, sy, t1 === WATER);
        }
      }
      for (const t of types) wt[t] = 0;
      const o = (j * W + i) * 4;
      px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = 255;
    }
  }
}
