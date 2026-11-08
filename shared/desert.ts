import { MAP_W, DESERT_Y0, DESERT_H, type MobKind } from "./constants";

/**
 * Act 2: the Sunscar (Murat 2026-11-08). A desert as big as Oakvale's valley, reached through the old waygate south of
 * Oakvale once the first zone's last boss is down. It lives in its own band of the map (rows DESERT_Y0..+DESERT_H,
 * under the Mawdeep's rock), walled in by mountains, so the server, collisions and pathing need nothing special:
 * the waygate moves heroes between the two acts like the Mawdeep's ropes (shared/act2.ts), and the client frames
 * the camera, minimap and world map to the act the hero is in.
 *
 * Tile ids are passed in (shared/map.ts T) so this file does not import map.ts. Layout constants are in local
 * desert coordinates (0..MAP_W, 0..DESERT_H); `D(y)` turns a local row into a map row.
 */
export const D = (y: number) => y + DESERT_Y0;
/** True for a map row inside the desert band. */
export const inDesertRow = (ty: number) => ty >= DESERT_Y0 && ty < DESERT_Y0 + DESERT_H;

/** Kel Ashar, the oasis town (local tiles): its mud-brick wall, the market (safe zone), the spring in its heart. */
export const KEL_ASHAR = { x0: 132, y0: 96, x1: 164, y1: 124 };
export const KEL_MARKET = { x: 141, y: 104, w: 15, h: 11 };
export const KEL_SPRING = { x: 148.5, y: 109.5, rx: 3.2, ry: 2.4 };
/** The Sunstone Circle: where the waygate lets heroes out, a ring of sun-stones round a sandstone dais (local tile). */
export const SUNSTONE = { x: 112, y: 128 };
/** Palmshade, the big oasis west of the town; Mirage Wells, a small one out east. */
export const OASES = [
  { name: "Palmshade Oasis", x: 52, y: 138, rx: 9, ry: 6 },
  { name: "Mirage Wells", x: 214, y: 112, rx: 5, ry: 3.5 },
  { name: "Jackal Springs", x: 92, y: 62, rx: 4, ry: 3 },
];
/** The Dustrider camp, the nomad raiders' tents in the north-west. */
export const DUSTRIDER = { x: 52, y: 64, rx: 14, ry: 10 };
/** The buried city of Kharsun, half under the sand (south-west): sand skeletons. */
export const KHARSUN = { x: 42, y: 172, w: 54, h: 26 };
/** The Humpback Mesas: the camel-folk's canyon country (north, between flat-topped hills). */
export const MESAS = { x: 116, y: 22, w: 76, h: 48 };
/** The Saffron Dunes: big rolling dunes, the scorpions' land (east). */
export const SAFFRON = { x: 186, y: 128, w: 82, h: 62 };
/** The Glasswind Flats round the Sunstone Circle: hard-baked plain, the first hunting grounds. */
export const GLASSWIND = { x: 80, y: 128, w: 106, h: 52 };
/** The Thornspire Heights (north-east mountains) and, high in them, the Veiled Circle's hidden sanctum. */
export const THORNSPIRE = { x: 198, y: 20, w: 72, h: 76 };
export const SANCTUM = { x: 232, y: 46, w: 20, h: 14 };
/** The Sun Furnace: the plateau on top of the Thornspire where the Veiled Circle means to light a second sun (final boss). */
export const FURNACE = { x: 246, y: 24, r: 8 };

/** Where the waygate stands on each side (map tiles): south of Oakvale's south gate, and in the Sunstone Circle. */
export const WAYGATE_OAKVALE = { x: 92, y: 79 };
export const WAYGATE_DESERT = { x: SUNSTONE.x, y: D(SUNSTONE.y) };

function hash(x: number, y: number, seed: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
function noise(x: number, y: number, scale: number, seed: number) {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = smooth(fx - x0), ty = smooth(fy - y0);
  const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed), c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

export interface DesertTiles {
  GRASS: number; DIRT: number; COBBLE: number; SAND: number; WATER: number; FLAGS: number; RUBBLE: number; FLOOR: number;
  ROCK: number; BUSH: number; STUMP: number; WELL: number; STALL_RED: number; STALL_BLUE: number; BARREL: number; CRATE: number;
  CAMPFIRE: number; RUIN: number; GRAVE: number; DOOR: number; SIGNPOST: number; HAY: number;
  CLIFF: number; PALM: number; ADOBE: number; ADOBE_WALL: number; TENT: number; BONES: number;
}
export interface DesertArea { name: string; x: number; y: number; w: number; h: number; mobs?: MobKind[] }

/**
 * Builds the desert into the map's ground/object grids (map coordinates). Returns its named areas (specific first),
 * the signposts to put up, and the road tiles.
 */
export function buildDesert(T: DesertTiles, ground: number[][], objects: number[][], EMPTY: number) {
  const Y0 = DESERT_Y0, H = DESERT_H, W = MAP_W;
  const inBand = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H;
  const setG = (x: number, y: number, t: number) => { if (inBand(x, y)) ground[y + Y0][x] = t; };
  const setO = (x: number, y: number, t: number) => { if (inBand(x, y)) objects[y + Y0][x] = t; };
  const getG = (x: number, y: number) => (inBand(x, y) ? ground[y + Y0][x] : -1);
  const getO = (x: number, y: number) => (inBand(x, y) ? objects[y + Y0][x] : T.CLIFF);
  const roads = new Set<number>(); // map index
  const keep = new Uint8Array(W * H); // tiles that must stay open (towns, camps, trails)
  const each = (x: number, y: number, w: number, h: number, f: (x: number, y: number) => void) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inBand(i, j)) f(i, j);
  };
  const disk = (cx: number, cy: number, rx: number, ry: number, f: (x: number, y: number, d: number) => void) =>
    each(Math.floor(cx - rx - 1), Math.floor(cy - ry - 1), Math.ceil(rx * 2 + 3), Math.ceil(ry * 2 + 3), (x, y) => {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
      if (d < 1) f(x, y, d);
    });
  const open = (x: number, y: number) => { if (inBand(x, y)) { keep[y * W + x] = 1; if (getO(x, y) === T.CLIFF) setO(x, y, EMPTY); } };
  const road = (x: number, y: number, t: number = T.DIRT) => {
    if (!inBand(x, y)) return;
    if (getG(x, y) !== T.WATER) setG(x, y, t);
    setO(x, y, EMPTY); open(x, y);
    roads.add((y + Y0) * W + x);
  };
  /** A winding trail through waypoints (Catmull-Rom), 1 tile wide and 4-connected, cutting through any mountain on its way. */
  const trail = (pts: [number, number][], t: number = T.DIRT, wide = 0) => {
    const P = [pts[0], ...pts, pts[pts.length - 1]];
    let last: [number, number] | undefined;
    for (let i = 1; i < P.length - 2; i++) {
      const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      for (let k = 0; k <= len * 4; k++) {
        const u = k / Math.max(1, len * 4), u2 = u * u, u3 = u2 * u;
        const c = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
        const cx = Math.round(c(p0[0], p1[0], p2[0], p3[0])), cy = Math.round(c(p0[1], p1[1], p2[1], p3[1]));
        if (last && last[0] !== cx && last[1] !== cy) road(cx, last[1], t);
        last = [cx, cy];
        road(cx, cy, t);
        // a pass through the hills: the slopes on both sides stand back a little
        for (let j = -1 - wide; j <= 1 + wide; j++) for (let i2 = -1 - wide; i2 <= 1 + wide; i2++) open(cx + i2, cy + j);
      }
    }
  };

  // ---------- 1. Sand everywhere, hard-baked flats and gravel where the dunes thin out ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = noise(x, y, 14, 501), m = noise(x, y, 5, 502);
    setG(x, y, n < 0.24 || (n < 0.3 && m < 0.35) ? T.DIRT : T.SAND);
    setO(x, y, EMPTY);
  }
  // the Glasswind Flats: mostly baked clay, a few sand drifts
  each(GLASSWIND.x, GLASSWIND.y, GLASSWIND.w, GLASSWIND.h, (x, y) => {
    const e = Math.min(x - GLASSWIND.x, GLASSWIND.x + GLASSWIND.w - 1 - x, y - GLASSWIND.y, GLASSWIND.y + GLASSWIND.h - 1 - y);
    if (noise(x, y, 9, 503) < 0.5 && e > 3 * noise(x, y, 4, 504)) setG(x, y, T.DIRT);
  });
  // the Saffron Dunes: all sand
  each(SAFFRON.x, SAFFRON.y, SAFFRON.w, SAFFRON.h, (x, y) => { if (noise(x, y, 10, 505) > 0.2) setG(x, y, T.SAND); });

  // ---------- 2. Mountains: a ragged ring of sandstone peaks all round, ridges between the lands, flat-topped mesas ----------
  const cliff = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (d < 7 + noise(x, y, 9, 511) * 9 + noise(x, y, 3, 512) * 2) cliff[y * W + x] = 1;
  }
  const ridge = (pts: [number, number][], r: number, seed: number) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
      for (let k = 0; k <= n; k++) {
        const t = k / n, px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
        const rr = r * (0.55 + 0.7 * noise(px, py, 6, seed));
        for (let y = Math.floor(py - rr - 2); y <= py + rr + 2; y++) for (let x = Math.floor(px - rr - 2); x <= px + rr + 2; x++) {
          if (inBand(x, y) && Math.hypot(x + 0.5 - px, y + 0.5 - py) < rr + (noise(x, y, 2.5, seed + 1) - 0.5) * 2) cliff[y * W + x] = 1;
        }
      }
    }
  };
  const mesa = (cx: number, cy: number, rx: number, ry: number, seed: number) => disk(cx, cy, rx + 2, ry + 2, (x, y) => {
    const a = Math.atan2(y - cy, x - cx), wob = 0.82 + 0.3 * noise(Math.cos(a) * 3 + seed, Math.sin(a) * 3, 1, seed);
    if (Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry) < wob) cliff[y * W + x] = 1;
  });
  // the Thornspire: a high range in the north-east, the sanctum and the Furnace in a fold of it
  ridge([[196, 12], [204, 40], [200, 70], [212, 98], [236, 102], [262, 96]], 4.5, 521);
  ridge([[222, 30], [230, 38]], 3, 522);
  ridge([[262, 60], [252, 72], [238, 76]], 3.2, 523);
  // the spine between the mesas and the Dustrider country, and the hills south of the camp
  ridge([[104, 10], [110, 34], [102, 52]], 3.5, 524);
  ridge([[20, 104], [44, 98], [66, 104]], 3, 525);
  // a broken ridge between the Glasswind Flats and the buried city, another along the dunes' west edge
  ridge([[100, 164], [112, 184], [104, 204]], 3, 526);
  ridge([[178, 130], [184, 150], [176, 168]], 2.6, 527);
  // the Humpback Mesas: flat-topped hills with canyons between
  for (const [cx, cy, rx, ry, s] of [[128, 32, 7, 5, 531], [150, 26, 6, 4, 532], [170, 38, 8, 5, 533], [140, 54, 6, 4, 534], [164, 60, 5, 4, 535], [184, 28, 5, 6, 536], [120, 62, 4, 3, 537]] as const) mesa(cx, cy, rx, ry, s);
  // lone buttes out on the sand
  for (const [cx, cy, rx, ry, s] of [[74, 118, 3, 2, 541], [196, 186, 4, 3, 542], [236, 150, 3.5, 2.5, 543], [30, 40, 4, 3, 544], [124, 158, 2.5, 2, 545], [256, 128, 3, 4, 546]] as const) mesa(cx, cy, rx, ry, s);

  // ---------- 3. Places that must stay open ----------
  const clearDisk = (cx: number, cy: number, rx: number, ry: number) => disk(cx, cy, rx, ry, (x, y) => { cliff[y * W + x] = 0; keep[y * W + x] = 1; });
  const K = KEL_ASHAR;
  clearDisk((K.x0 + K.x1) / 2, (K.y0 + K.y1) / 2, (K.x1 - K.x0) / 2 + 7, (K.y1 - K.y0) / 2 + 7);
  clearDisk(SUNSTONE.x + 0.5, SUNSTONE.y + 0.5, 11, 9);
  for (const o of OASES) clearDisk(o.x, o.y, o.rx + 7, o.ry + 6);
  clearDisk(DUSTRIDER.x, DUSTRIDER.y, DUSTRIDER.rx + 3, DUSTRIDER.ry + 3);
  clearDisk(KHARSUN.x + KHARSUN.w / 2, KHARSUN.y + KHARSUN.h / 2, KHARSUN.w / 2 + 2, KHARSUN.h / 2 + 2);
  clearDisk(SANCTUM.x + SANCTUM.w / 2, SANCTUM.y + SANCTUM.h / 2, SANCTUM.w / 2 + 4, SANCTUM.h / 2 + 4);
  clearDisk(FURNACE.x + 0.5, FURNACE.y + 0.5, FURNACE.r + 4, FURNACE.r + 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cliff[y * W + x]) setO(x, y, T.CLIFF);

  // ---------- 4. Oases: still water, a green rim, date palms ----------
  const oasis = (cx: number, cy: number, rx: number, ry: number, seed: number) => {
    disk(cx, cy, rx + 4.5, ry + 4, (x, y, d) => { if (getO(x, y) !== T.CLIFF && (d < 0.75 || hash(x, y, seed) < 0.6)) setG(x, y, T.GRASS); });
    disk(cx, cy, rx, ry, (x, y) => { setG(x, y, T.WATER); setO(x, y, EMPTY); });
    disk(cx, cy, rx + 4, ry + 3.5, (x, y, d) => {
      if (getG(x, y) === T.WATER || getO(x, y) !== EMPTY) return;
      const h = hash(x, y, seed + 1);
      if (d > 0.3 && h < 0.2) setO(x, y, T.PALM);
      else if (h > 0.94) setO(x, y, T.BUSH);
    });
  };
  for (const [i, o] of OASES.entries()) oasis(o.x, o.y, o.rx, o.ry, 560 + i * 7);

  // ---------- 5. Kel Ashar: mud-brick houses round a market and a spring, a low wall with four gates ----------
  const kx = Math.round((K.x0 + K.x1) / 2), ky = Math.round((K.y0 + K.y1) / 2);
  each(K.x0 - 2, K.y0 - 2, K.x1 - K.x0 + 5, K.y1 - K.y0 + 5, (x, y) => { setO(x, y, EMPTY); setG(x, y, hash(x, y, 571) < 0.8 ? T.DIRT : T.SAND); });
  // main streets (sandstone paving) to the four gates, then out into the desert
  trail([[K.x0 - 3, ky], [K.x1 + 3, ky]], T.COBBLE);
  trail([[kx, K.y0 - 3], [kx, K.y1 + 3]], T.COBBLE);
  const M = KEL_MARKET;
  each(M.x, M.y, M.w, M.h, (x, y) => road(x, y, T.COBBLE));
  for (const [cx, cy] of [[M.x, M.y], [M.x + M.w - 1, M.y], [M.x, M.y + M.h - 1], [M.x + M.w - 1, M.y + M.h - 1]]) setG(cx, cy, T.DIRT);
  // the spring in the market's heart: a stone-rimmed pool, palms round it
  disk(KEL_SPRING.x, KEL_SPRING.y, KEL_SPRING.rx + 1.4, KEL_SPRING.ry + 1.3, (x, y) => setG(x, y, T.FLAGS));
  disk(KEL_SPRING.x, KEL_SPRING.y, KEL_SPRING.rx, KEL_SPRING.ry, (x, y) => { setG(x, y, T.WATER); roads.delete((y + Y0) * W + x); });
  for (const [px, py] of [[144, 106], [153, 106], [144, 113], [153, 113]]) setO(px, py, T.PALM);
  // stalls along the market's north and south sides
  for (const [sx, sy, t] of [[M.x + 1, M.y + 1, T.STALL_RED], [M.x + 4, M.y + 1, T.STALL_BLUE], [M.x + 10, M.y + 1, T.STALL_RED], [M.x + 13, M.y + 1, T.STALL_BLUE],
    [M.x + 1, M.y + M.h - 2, T.STALL_BLUE], [M.x + 13, M.y + M.h - 2, T.STALL_RED]] as const) setO(sx, sy, t);
  for (const [bx, by] of [[M.x + 2, M.y + 1], [M.x + 11, M.y + M.h - 2], [M.x + 12, M.y + M.h - 2]]) setO(bx, by, hash(bx, by, 572) < 0.5 ? T.BARREL : T.CRATE);
  // houses: flat-roofed mud-brick blocks, a door on the street side
  const house = (x: number, y: number, w: number, h: number, doorDown: boolean) => {
    each(x, y, w, h, (i, j) => setO(i, j, T.ADOBE));
    const dx = x + Math.floor(w / 2), dy = doorDown ? y + h - 1 : y;
    setO(dx, dy, T.DOOR);
    road(dx, doorDown ? dy + 1 : dy - 1, T.DIRT);
  };
  house(134, 98, 5, 4, true); house(140, 98, 4, 4, true); house(153, 98, 4, 4, true); house(158, 98, 5, 4, true);
  house(134, 104, 5, 3, true); house(158, 104, 5, 4, true);
  house(134, 116, 5, 4, false); house(140, 118, 5, 4, false); house(153, 118, 4, 4, false); house(158, 115, 5, 4, false);
  house(158, 108, 4, 3, false);
  // the low town wall, broken only by the four gates
  const wall = (x: number, y: number) => { if (!roads.has((y + Y0) * W + x)) setO(x, y, T.ADOBE_WALL); };
  for (let x = K.x0; x <= K.x1; x++) { wall(x, K.y0); wall(x, K.y1); }
  for (let y = K.y0 + 1; y < K.y1; y++) { wall(K.x0, y); wall(K.x1, y); }
  // a well and hay for the camels by the east gate, palms inside the walls
  setO(K.x1 - 3, ky + 3, T.WELL); setO(K.x1 - 2, ky - 3, T.HAY); setO(K.x1 - 3, ky - 3, T.HAY);
  for (const [px, py] of [[135, 110], [137, 113], [161, 113], [139, 103], [156, 103]]) if (getO(px, py) === EMPTY && !roads.has((py + Y0) * W + px)) setO(px, py, T.PALM);

  // ---------- 6. The Sunstone Circle: a sandstone dais, a ring of standing sun-stones, the waygate in the middle ----------
  disk(SUNSTONE.x + 0.5, SUNSTONE.y + 0.5, 5.6, 4.6, (x, y, d) => { setG(x, y, d > 0.72 && hash(x, y, 581) < 0.4 ? T.RUBBLE : T.FLAGS); setO(x, y, EMPTY); open(x, y); });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2, sx = Math.round(SUNSTONE.x + Math.cos(a) * 7.5), sy = Math.round(SUNSTONE.y + Math.sin(a) * 6);
    if (k === 1 || k === 4) continue; // two have fallen: the gaps are the ways in
    setO(sx, sy, T.ROCK);
  }

  // ---------- 7. The Dustrider camp: tents round a fire, the raiders' loot heaped about ----------
  {
    const C = DUSTRIDER;
    disk(C.x, C.y, C.rx, C.ry, (x, y, d) => { setO(x, y, EMPTY); if (d < 0.5 && hash(x, y, 591) < 0.6) setG(x, y, T.DIRT); });
    setO(C.x, C.y, T.CAMPFIRE);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + 0.4, tx = Math.round(C.x + Math.cos(a) * C.rx * 0.62), ty = Math.round(C.y + Math.sin(a) * C.ry * 0.62);
      setO(tx, ty, T.TENT);
    }
    for (let k = 0; k < 10; k++) {
      const tx = Math.round(C.x + (hash(k, 1, 592) - 0.5) * C.rx * 1.5), ty = Math.round(C.y + (hash(k, 2, 592) - 0.5) * C.ry * 1.5);
      if (getO(tx, ty) === EMPTY && Math.hypot(tx - C.x, ty - C.y) > 2) setO(tx, ty, k % 3 === 0 ? T.BARREL : k % 3 === 1 ? T.CRATE : T.HAY);
    }
  }

  // ---------- 8. Kharsun, the buried city: sandstone walls poking out of the drifts, old paving, tombs ----------
  {
    const B = KHARSUN;
    each(B.x, B.y, B.w, B.h, (x, y) => {
      setO(x, y, EMPTY);
      const n = noise(x, y, 6, 601);
      if (n < 0.45) setG(x, y, hash(x, y, 602) < 0.85 ? T.FLAGS : T.RUBBLE); else setG(x, y, T.SAND);
    });
    const ruin = (x: number, y: number, w: number, h: number, seed: number) => {
      for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) {
        const edge = i === x || j === y || i === x + w - 1 || j === y + h - 1;
        if (edge && noise(i, j, 2.2, seed) > 0.36 && !(j === y + h - 1 && i === x + (w >> 1))) setO(i, j, T.RUIN);
        else if (!edge && hash(i, j, seed) < 0.1) setG(i, j, T.RUBBLE);
      }
    };
    let s = 610;
    for (const [rx, ry, rw, rh] of [[46, 175, 8, 6], [58, 176, 6, 5], [70, 174, 9, 7], [84, 176, 7, 6], [48, 186, 6, 6], [62, 185, 10, 8], [78, 187, 7, 6], [88, 186, 5, 5]] as const) ruin(rx, ry, rw, rh, s++);
    // tombs: gravestones and bone heaps between the walls
    for (let k = 0; k < 26; k++) {
      const tx = B.x + 2 + Math.floor(hash(k, 3, 620) * (B.w - 4)), ty = B.y + 2 + Math.floor(hash(k, 4, 620) * (B.h - 4));
      if (getO(tx, ty) === EMPTY) setO(tx, ty, k % 3 === 0 ? T.BONES : T.GRAVE);
    }
  }

  // ---------- 9. The Veiled Sanctum: a hidden hall cut into the Thornspire, and the Sun Furnace above it ----------
  {
    const S = SANCTUM;
    each(S.x, S.y, S.w, S.h, (x, y) => { setO(x, y, EMPTY); setG(x, y, T.FLAGS); open(x, y); });
    for (let i = S.x; i < S.x + S.w; i++) for (let j = S.y; j < S.y + S.h; j++) {
      const edge = i === S.x || j === S.y || i === S.x + S.w - 1 || j === S.y + S.h - 1;
      const door = j === S.y + S.h - 1 && Math.abs(i - (S.x + S.w / 2)) < 1.5;
      const inner = (i === S.x + 6 || i === S.x + S.w - 7) && j > S.y + 2 && j < S.y + S.h - 4; // two colonnades
      if ((edge && !door && noise(i, j, 3, 631) > 0.2) || (inner && j % 2 === 0)) setO(i, j, T.RUIN);
    }
    const F = FURNACE;
    disk(F.x + 0.5, F.y + 0.5, F.r, F.r * 0.8, (x, y, d) => { setO(x, y, EMPTY); open(x, y); setG(x, y, d > 0.8 && hash(x, y, 641) < 0.5 ? T.RUBBLE : T.FLAGS); });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, px = Math.round(F.x + Math.cos(a) * (F.r - 1.5)), py = Math.round(F.y + Math.sin(a) * (F.r - 1.5) * 0.8); setO(px, py, T.ROCK); }
  }

  // ---------- 10. The camel-folk's camps in the canyons ----------
  for (const [cx, cy] of [[140, 42], [158, 46], [130, 72]] as const) {
    disk(cx, cy, 4, 3, (x, y) => { if (getO(x, y) !== T.CLIFF) setO(x, y, EMPTY); });
    setO(cx, cy, T.CAMPFIRE);
    for (const [dx, dy] of [[-3, -1], [2, -2], [3, 1], [-2, 2]]) if (getO(cx + dx, cy + dy) === EMPTY) setO(cx + dx, cy + dy, T.TENT);
  }

  // ---------- 11. Caravan trails out of Kel Ashar ----------
  const gateW: [number, number] = [K.x0 - 3, ky], gateE: [number, number] = [K.x1 + 3, ky], gateN: [number, number] = [kx, K.y0 - 3], gateS: [number, number] = [kx, K.y1 + 3];
  trail([gateW, [124, 114], [SUNSTONE.x + 4, SUNSTONE.y - 3], [SUNSTONE.x + 1, SUNSTONE.y - 1]]);                     // to the Sunstone Circle
  trail([gateS, [146, 140], [128, 154], [116, 168], [104, 178], [KHARSUN.x + KHARSUN.w - 4, KHARSUN.y + 10]]);         // the Tomb Road, south-west to Kharsun
  trail([[SUNSTONE.x - 3, SUNSTONE.y + 2], [92, 136], [70, 140], [OASES[0].x + 9, OASES[0].y]]);                        // west to Palmshade
  trail([[OASES[0].x - 2, OASES[0].y - 7], [44, 116], [40, 96], [DUSTRIDER.x - 4, DUSTRIDER.y + DUSTRIDER.ry]]);        // Palmshade north over the hills to the Dustriders
  trail([gateN, [146, 88], [128, 84], [110, 74], [OASES[2].x + 4, OASES[2].y + 2], [DUSTRIDER.x + DUSTRIDER.rx, DUSTRIDER.y + 2]]); // the Raiders' Track
  trail([[OASES[2].x + 2, OASES[2].y - 3], [112, 60], [126, 44], [140, 42], [158, 46], [176, 50], [192, 46]], T.DIRT, 1); // up into the mesas
  trail([[128, 84], [130, 72]]);
  trail([gateE, [178, 112], [196, 116], [OASES[1].x - 6, OASES[1].y + 1]]);                                              // east to the Mirage Wells
  trail([[OASES[1].x + 5, OASES[1].y + 4], [226, 132], [230, 160], [214, 178]]);                                         // on into the dunes
  trail([[OASES[1].x + 2, OASES[1].y - 4], [218, 96], [226, 84], [236, 70], [SANCTUM.x + SANCTUM.w / 2, SANCTUM.y + SANCTUM.h + 1]], T.DIRT, 1); // the climb to the sanctum
  trail([[192, 46], [204, 52], [216, 54], [SANCTUM.x, SANCTUM.y + 7]], T.DIRT, 1);                                       // mesas to the Thornspire
  trail([[SANCTUM.x + SANCTUM.w - 2, SANCTUM.y], [252, 40], [FURNACE.x, FURNACE.y + FURNACE.r * 0.8]], T.FLAGS, 1);       // the Furnace Stair
  trail([[KHARSUN.x + 6, KHARSUN.y], [40, 160], [OASES[0].x - 4, OASES[0].y + 6]]);                                      // Kharsun north to Palmshade

  // ---------- 12. Scatter: boulders, dry thorn scrub, bleached bones, dead trees ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (getO(x, y) !== EMPTY || keep[y * W + x] || roads.has((y + Y0) * W + x) || getG(x, y) === T.WATER) continue;
    const h = hash(x, y, 651), near = (dx: number, dy: number) => getO(x + dx, y + dy) === T.CLIFF;
    const foot = near(1, 0) || near(-1, 0) || near(0, 1) || near(0, -1);
    if (foot && h < 0.16) setO(x, y, T.ROCK); // scree at the foot of the cliffs
    else if (h < 0.006) setO(x, y, T.ROCK);
    else if (h < 0.016 && getG(x, y) !== T.GRASS) setO(x, y, T.BUSH); // thorn scrub (walk-through)
    else if (h < 0.019) setO(x, y, T.BONES);
    else if (h < 0.0215) setO(x, y, T.STUMP); // a dead tree, bleached grey
  }
  // the trails keep a clear verge
  for (const k of roads) {
    const x = k % W, y = ((k / W) | 0) - Y0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const o = getO(x + i, y + j); if (o === T.ROCK || o === T.BUSH || o === T.BONES || o === T.STUMP) setO(x + i, y + j, EMPTY); }
  }

  // ---------- 13. Reachability: every open tile joins the town (pockets cut off by the hills are filled in) ----------
  const solid = (x: number, y: number) => {
    if (!inBand(x, y)) return true;
    const o = getO(x, y);
    return (o !== EMPTY && o !== T.BUSH) || getG(x, y) === T.WATER;
  };
  const seen = new Uint8Array(W * H);
  const q = [(K.y1 + 3) * W + kx]; seen[q[0]] = 1; // the south gate
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % W, y = (q[i] / W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (solid(nx, ny) || seen[ny * W + nx]) continue;
      seen[ny * W + nx] = 1; q.push(ny * W + nx);
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!seen[y * W + x] && !solid(x, y)) setO(x, y, T.CLIFF);

  // ---------- 14. Named areas (specific first) and signposts ----------
  const A = (name: string, x: number, y: number, w: number, h: number, mobs: MobKind[] = []): DesertArea => ({ name, x, y: y + Y0, w, h, mobs });
  const areas: DesertArea[] = [
    A("Kel Ashar Market", M.x, M.y, M.w, M.h),
    A("Kel Ashar", K.x0, K.y0, K.x1 - K.x0 + 1, K.y1 - K.y0 + 1),
    A("The Sunstone Circle", SUNSTONE.x - 8, SUNSTONE.y - 7, 17, 15),
    A("The Sun Furnace", FURNACE.x - FURNACE.r - 2, FURNACE.y - FURNACE.r, FURNACE.r * 2 + 5, FURNACE.r * 2),
    A("The Veiled Sanctum", SANCTUM.x - 2, SANCTUM.y - 2, SANCTUM.w + 4, SANCTUM.h + 4),
    A("Dustrider Camp", DUSTRIDER.x - DUSTRIDER.rx - 2, DUSTRIDER.y - DUSTRIDER.ry - 2, DUSTRIDER.rx * 2 + 4, DUSTRIDER.ry * 2 + 4),
    ...OASES.map((o) => A(o.name, Math.floor(o.x - o.rx - 5), Math.floor(o.y - o.ry - 5), Math.ceil(o.rx * 2 + 10), Math.ceil(o.ry * 2 + 10))),
    A("Kharsun, the Buried City", KHARSUN.x - 2, KHARSUN.y - 2, KHARSUN.w + 4, KHARSUN.h + 4),
    A("The Humpback Mesas", MESAS.x, MESAS.y, MESAS.w, MESAS.h),
    A("The Thornspire Heights", THORNSPIRE.x, THORNSPIRE.y, THORNSPIRE.w, THORNSPIRE.h),
    A("The Saffron Dunes", SAFFRON.x, SAFFRON.y, SAFFRON.w, SAFFRON.h),
    A("The Glasswind Flats", GLASSWIND.x, GLASSWIND.y, GLASSWIND.w, GLASSWIND.h),
    A("The Red Wastes", 8, 8, 104, 120),
    A("The Sunscar", 0, 0, W, H),
  ];
  const posts: { x: number; y: number; to: string[] }[] = [
    { x: K.x0 - 5, y: D(ky - 2), to: ["The Sunstone Circle", "Palmshade Oasis", "Kel Ashar"] },
    { x: kx + 2, y: D(K.y1 + 5), to: ["Kharsun, the Buried City", "Kel Ashar"] },
    { x: kx - 2, y: D(K.y0 - 5), to: ["Dustrider Camp", "The Humpback Mesas", "Kel Ashar"] },
    { x: K.x1 + 5, y: D(ky + 2), to: ["Mirage Wells", "The Saffron Dunes", "Kel Ashar"] },
    { x: OASES[1].x - 2, y: D(OASES[1].y - 6), to: ["The Veiled Sanctum", "The Saffron Dunes", "Kel Ashar"] },
    { x: SUNSTONE.x + 6, y: D(SUNSTONE.y - 4), to: ["Kel Ashar", "Palmshade Oasis"] },
  ];
  return { areas, posts, roads };
}
