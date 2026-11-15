import { BADLANDS_H, BADLANDS_Y0, MAP_W } from "./constants";

/**
 * Act 4: the Red Badlands, the Redfang bandit clan's homeland (Lv 25-40). Red mesas, canyons and dry riverbeds in
 * their own band of the map (rows BADLANDS_Y0..+BADLANDS_H, under the moors' rock), walled in by red cliffs like the
 * moors (shared/moors.ts), so collisions and pathing need nothing special. Heroes come through the Red Pass at Act 1's
 * west edge (shared/act2.ts WAYGATES) from hero Lv 25 and arrive at the band's east edge; the land climbs in level
 * westward to Fangrock, the clan's stronghold in the far west.
 *
 * This file is the land and its places. The Rustwater Post (the outpost), Fangrock and Talon Fort are reserved ground
 * for now (their buildings, the zones and the monsters come later). Tile ids are passed in (shared/map.ts T) so this
 * file does not import map.ts. Layout constants are in local badlands coordinates (0..MAP_W, 0..BADLANDS_H); `BR(y)`
 * turns a local row into a map row.
 */
export const BR = (y: number) => y + BADLANDS_Y0;
/** True for a map row inside the badlands band. */
export const inBadlandsRow = (ty: number) => ty >= BADLANDS_Y0 && ty < BADLANDS_Y0 + BADLANDS_H;

/**
 * The Red Pass's badlands side (local tile): a gate under a natural arch of red rock (ARCHES[0]) in a clearing at the
 * band's east edge; heroes step out just south of it.
 */
export const REDPASS = { x: 264, y: 92 };
/**
 * Where the Red Pass stands on each side (map tiles): in a dais cut into the border forest at Act 1's west edge
 * (between Mirror Pond and Barrow Downs), and in the badlands' arrival clearing.
 */
export const REDPASS_OAKVALE = { x: 3, y: 118 };
export const REDPASS_BADLANDS = { x: REDPASS.x, y: BR(REDPASS.y) };
/** The arrival clearing round the Red Pass (local tiles, ellipse): always open ground, nothing stands in it. */
export const REDPASS_CLEARING = { x: 264.5, y: 93.5, rx: 9, ry: 7 };
/**
 * The Rustwater Post, the badlands' outpost (local tiles, reserved: bare ground until its buildings come): a palisaded
 * waystation round a spring in a canyon mouth, west of the Red Pass, the last friendly roof before Redfang country.
 */
export const RUSTWATER_POST = { x: 222, y: 82, w: 24, h: 18 };
/** The Post's square (local tiles): the badlands' safe zone (shared/map.ts isSafeZone), where heroes come back after dying. */
export const RUSTWATER_SQUARE = { x: 229, y: 87, w: 10, h: 7 };
/** Fangrock, the Redfang clan's stronghold on its crag in the far west (local tiles, reserved). */
export const FANGROCK = { x: 12, y: 64, w: 34, h: 30 };
/** Talon Fort: a smaller Redfang stockade watching the north road and the Dry Ashwell's upper reach (local tiles, reserved). */
export const TALON_FORT = { x: 118, y: 18, w: 18, h: 14 };
/** Bloodstone Mesa: the biggest of the red table-mountains, sheer on every side (local tiles, ellipse of the rock). */
export const BLOODSTONE_MESA = { x: 190, y: 44, rx: 15, ry: 10 };
/** The Hanging Arches: a field of wind-cut stone arches (local tiles, ellipse; the arches are in ARCHES). */
export const HANGING_ARCHES = { x: 206, y: 142, rx: 14, ry: 9 };
/** The Cinnabar Pits: old diggings for red cinnabar, spoil heaps and sunken pits (local tiles, ellipse). */
export const CINNABAR_PITS = { x: 180, y: 110, rx: 12, ry: 8 };
/** Vulture's Roost: a ring of boulders on a bare rise, bones bleaching round a dead tree (local tiles, ring radius). */
export const VULTURES_ROOST = { x: 108, y: 66, r: 6 };
/** The Dry Ashwell: a dead riverbed of grey gravel across the band, north to south (local tiles, its course). */
export const DRY_ASHWELL: readonly [number, number][] = [[156, 8], [150, 30], [160, 56], [152, 84], [140, 110], [146, 140], [138, 166]];
/**
 * The canyons (local tiles): a massif of red rock (`rock`: x, y, w, h) with a narrow winding floor cut through it
 * (`floor`: its course). Rattlesnake Gulch runs east-west in the south, Gallows Canyon north-south in the west.
 */
export const CANYONS = [
  { name: "Rattlesnake Gulch", rock: { x: 84, y: 118, w: 40, h: 30 }, floor: [[78, 134], [92, 128], [104, 138], [116, 130], [128, 136]] as [number, number][] },
  { name: "Gallows Canyon", rock: { x: 56, y: 28, w: 24, h: 38 }, floor: [[68, 22], [62, 36], [72, 48], [64, 60], [68, 70]] as [number, number][] },
];
/**
 * Stone arches (local tiles): two legs on one row, `span` tiles apart (x and x + span), solid; the ground under the
 * span is open and the client draws the rock bridging the legs. The first is the Red Pass's own arch.
 */
export const ARCHES: readonly { x: number; y: number; span: number }[] = [
  { x: REDPASS.x - 2, y: REDPASS.y, span: 4 },
  { x: 198, y: 136, span: 4 }, { x: 209, y: 138, span: 3 }, { x: 201, y: 146, span: 5 }, { x: 213, y: 147, span: 4 }, { x: 196, y: 141, span: 3 },
  { x: 86, y: 98, span: 4 }, { x: 246, y: 128, span: 3 },
];
/** Lesser mesas out on the flats (local tiles: centre, radii). */
const MESAS: [number, number, number, number][] = [
  [232, 40, 9, 6], [42, 30, 8, 5], [252, 146, 7, 5], [96, 16, 6, 4], [168, 150, 6, 4], [204, 112, 4, 3],
  [30, 134, 9, 7], [84, 82, 4, 3], [256, 60, 5, 4], [180, 74, 5, 3], [120, 100, 5, 3], [62, 150, 6, 4],
];

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

export interface BadlandsTiles {
  SAND: number; DIRT: number; RUBBLE: number; FLAGS: number; ROCK: number; BUSH: number; STUMP: number; CLIFF: number; BONES: number; SIGNPOST: number;
  CLAY: number; GRAVEL: number; ARCH: number; CACTUS: number;
}
export interface BadlandsArea { name: string; x: number; y: number; w: number; h: number; mobs?: never[] }

/**
 * Builds the badlands into the map's ground/object grids (map coordinates). Deterministic (fixed seeds), like the rest
 * of the world. Returns its named areas (specific first), the road tiles and the signposts. Every open tile joins the
 * Red Pass.
 */
export function buildBadlands(T: BadlandsTiles, ground: number[][], objects: number[][], EMPTY: number) {
  const Y0 = BADLANDS_Y0, H = BADLANDS_H, W = MAP_W;
  const inBand = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H;
  const setG = (x: number, y: number, t: number) => { if (inBand(x, y)) ground[y + Y0][x] = t; };
  const setO = (x: number, y: number, t: number) => { if (inBand(x, y)) objects[y + Y0][x] = t; };
  const getG = (x: number, y: number) => (inBand(x, y) ? ground[y + Y0][x] : -1);
  const getO = (x: number, y: number) => (inBand(x, y) ? objects[y + Y0][x] : T.CLIFF);
  const roads = new Set<number>(); // map index
  const keep = new Uint8Array(W * H); // tiles that must stay open (the gate, the reserved places, the trails)
  const cliff = new Uint8Array(W * H);
  const each = (x: number, y: number, w: number, h: number, f: (x: number, y: number) => void) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inBand(i, j)) f(i, j);
  };
  const disk = (cx: number, cy: number, rx: number, ry: number, f: (x: number, y: number, d: number) => void) =>
    each(Math.floor(cx - rx - 1), Math.floor(cy - ry - 1), Math.ceil(rx * 2 + 3), Math.ceil(ry * 2 + 3), (x, y) => {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
      if (d < 1) f(x, y, d);
    });
  const open = (x: number, y: number) => { if (inBand(x, y)) { keep[y * W + x] = 1; cliff[y * W + x] = 0; if (getO(x, y) === T.CLIFF) setO(x, y, EMPTY); } };
  /** A trail tile: packed red earth, clear of whatever stood there (gravel stays gravel where it fords the Dry Ashwell). */
  const road = (x: number, y: number, t: number = T.DIRT) => {
    if (!inBand(x, y)) return;
    if (getG(x, y) !== T.GRAVEL) setG(x, y, t);
    setO(x, y, EMPTY); open(x, y);
    roads.add((y + Y0) * W + x);
  };
  /** Walks a Catmull-Rom curve through the waypoints, 4-connected, calling `put` on each tile. */
  const spline = (pts: [number, number][], put: (x: number, y: number) => void) => {
    const P = [pts[0], ...pts, pts[pts.length - 1]];
    let last: [number, number] | undefined;
    for (let i = 1; i < P.length - 2; i++) {
      const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      for (let k = 0; k <= len * 4; k++) {
        const u = k / Math.max(1, len * 4), u2 = u * u, u3 = u2 * u;
        const c = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
        const cx = Math.round(c(p0[0], p1[0], p2[0], p3[0])), cy = Math.round(c(p0[1], p1[1], p2[1], p3[1]));
        if (last && last[0] !== cx && last[1] !== cy) put(cx, last[1]);
        last = [cx, cy];
        put(cx, cy);
      }
    }
  };
  /** A winding trail, 1 tile wide with open verges (`wide` more on each side), through any rock on its way. */
  const trail = (pts: [number, number][], t: number = T.DIRT, wide = 0) => spline(pts, (cx, cy) => {
    road(cx, cy, t);
    for (let j = -1 - wide; j <= 1 + wide; j++) for (let i = -1 - wide; i <= 1 + wide; i++) open(cx + i, cy + j);
  });

  // ---------- 1. Red sand, cracked clay flats in the hollows, bare earth where the wind scours it ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = noise(x, y, 13, 901), m = noise(x, y, 4, 902);
    setG(x, y, n < 0.3 ? T.CLAY : n > 0.78 && m < 0.5 ? T.DIRT : T.SAND);
    setO(x, y, EMPTY);
  }

  // ---------- 2. Red cliffs: a ragged wall all round, mesas on the flats, the canyons' rock ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (d < 6 + noise(x, y, 9, 911) * 8 + noise(x, y, 3, 912) * 2) cliff[y * W + x] = 1;
  }
  /** A flat-topped mesa: a squarish blob (superellipse) with a crumbling edge. */
  const mesa = (cx: number, cy: number, rx: number, ry: number, seed: number) => disk(cx, cy, rx + 2, ry + 2, (x, y) => {
    const dx = Math.abs(x + 0.5 - cx) / rx, dy = Math.abs(y + 0.5 - cy) / ry;
    if (dx ** 3 + dy ** 3 < 0.85 + 0.35 * noise(x, y, 3, seed)) cliff[y * W + x] = 1;
  });
  mesa(BLOODSTONE_MESA.x, BLOODSTONE_MESA.y, BLOODSTONE_MESA.rx, BLOODSTONE_MESA.ry, 921);
  MESAS.forEach(([cx, cy, rx, ry], i) => mesa(cx, cy, rx, ry, 931 + i));
  for (const c of CANYONS) each(c.rock.x, c.rock.y, c.rock.w, c.rock.h, (x, y) => {
    const e = Math.min(x - c.rock.x, c.rock.x + c.rock.w - 1 - x, y - c.rock.y, c.rock.y + c.rock.h - 1 - y);
    if (e > 2 * noise(x, y, 3, 941)) cliff[y * W + x] = 1; // a ragged edge
  });

  // ---------- 3. Places that must stay open ----------
  const clearDisk = (cx: number, cy: number, rx: number, ry: number) => disk(cx, cy, rx, ry, (x, y) => { cliff[y * W + x] = 0; keep[y * W + x] = 1; });
  const clearRect = (r: { x: number; y: number; w: number; h: number }, m: number) => clearDisk(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + m, r.h / 2 + m);
  const G = REDPASS_CLEARING, O = RUSTWATER_POST;
  clearDisk(G.x, G.y, G.rx + 3, G.ry + 3);
  clearRect(O, 4); clearRect(FANGROCK, 4); clearRect(TALON_FORT, 3);
  clearDisk(HANGING_ARCHES.x, HANGING_ARCHES.y, HANGING_ARCHES.rx + 3, HANGING_ARCHES.ry + 3);
  clearDisk(CINNABAR_PITS.x, CINNABAR_PITS.y, CINNABAR_PITS.rx + 3, CINNABAR_PITS.ry + 3);
  clearDisk(VULTURES_ROOST.x + 0.5, VULTURES_ROOST.y + 0.5, VULTURES_ROOST.r + 3, VULTURES_ROOST.r + 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cliff[y * W + x]) setO(x, y, T.CLIFF);

  // ---------- 4. The Dry Ashwell: a wide bed of grey gravel and cobbles, banks of cracked clay, cut through any rock ----------
  spline(DRY_ASHWELL as [number, number][], (cx, cy) => {
    const r = 2 + noise(cx, cy, 7, 951) * 2;
    disk(cx + 0.5, cy + 0.5, r + 1.5, r + 1.5, (x, y, d) => {
      if (getO(x, y) === T.CLIFF) { setO(x, y, EMPTY); open(x, y); }
      if (d < (r / (r + 1.5)) ** 2) setG(x, y, T.GRAVEL);
      else if (getG(x, y) !== T.GRAVEL) setG(x, y, T.CLAY);
    });
  });

  // ---------- 5. The canyons: narrow floors of gravel winding through the rock ----------
  for (const c of CANYONS) spline(c.floor, (cx, cy) => {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { open(cx + i, cy + j); setG(cx + i, cy + j, hash(cx + i, cy + j, 961) < 0.7 ? T.GRAVEL : T.DIRT); }
    if (hash(cx, cy, 962) < 0.3) for (const [i, j] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { open(cx + i, cy + j); setG(cx + i, cy + j, T.GRAVEL); } // the walls bulge out here and there
  });

  // ---------- 6. The Red Pass: a gate under an arch of red rock, a clearing of packed earth round it ----------
  disk(G.x, G.y, G.rx, G.ry, (x, y, d) => { setO(x, y, EMPTY); open(x, y); setG(x, y, d < 0.5 ? T.DIRT : hash(x, y, 971) < 0.6 ? T.SAND : T.CLAY); });
  disk(REDPASS.x + 0.5, REDPASS.y + 0.5, 3.6, 2.8, (x, y, d) => setG(x, y, d > 0.6 && hash(x, y, 972) < 0.5 ? T.RUBBLE : T.FLAGS));

  // ---------- 7. Reserved ground: the Rustwater Post, Fangrock and Talon Fort stand empty until their buildings come ----------
  for (const r of [O, FANGROCK, TALON_FORT]) each(r.x, r.y, r.w, r.h, (x, y) => { setO(x, y, EMPTY); open(x, y); setG(x, y, hash(x, y, 981) < 0.75 ? T.DIRT : T.SAND); });

  // ---------- 8. The Cinnabar Pits: red spoil, sunken pits, heaps of broken ore ----------
  {
    const P = CINNABAR_PITS;
    disk(P.x, P.y, P.rx + 2, P.ry + 2, (x, y, d) => { if (getO(x, y) !== T.CLIFF) setG(x, y, d < 0.7 || hash(x, y, 991) < 0.5 ? T.RUBBLE : T.CLAY); });
    for (const [px, py, rx, ry] of [[-6, -3, 2, 1.5], [3, -4, 1.6, 1.2], [6, 2, 2.2, 1.6], [-3, 3, 1.8, 1.4], [-9, 2, 1.4, 1.2]] as const)
      disk(P.x + px, P.y + py, rx, ry, (x, y) => setO(x, y, T.CLIFF)); // the pits (sheer-sided, rock all round)
    disk(P.x, P.y, P.rx, P.ry, (x, y) => { if (getO(x, y) === EMPTY && hash(x, y, 992) < 0.06) setO(x, y, T.ROCK); });
  }

  // ---------- 9. Vulture's Roost: a ring of boulders on bare rock, bones round a dead tree ----------
  {
    const V = VULTURES_ROOST;
    disk(V.x + 0.5, V.y + 0.5, V.r + 1.5, V.r + 1.5, (x, y) => { setO(x, y, EMPTY); open(x, y); setG(x, y, hash(x, y, 1001) < 0.6 ? T.RUBBLE : T.DIRT); });
    for (let k = 0; k < 14; k++) {
      if (k === 3 || k === 4 || k === 10) continue; // the ways in, south and north
      const a = (k / 14) * Math.PI * 2, bx = Math.round(V.x + Math.cos(a) * V.r), by = Math.round(V.y + Math.sin(a) * V.r);
      setO(bx, by, T.ROCK);
    }
    setO(V.x, V.y, T.STUMP); // the dead tree the vultures sit in
    for (const [bx, by] of [[V.x - 2, V.y + 1], [V.x + 2, V.y - 1], [V.x + 1, V.y + 2], [V.x - 3, V.y - 2]] as const) setO(bx, by, T.BONES);
  }

  // ---------- 10. Arches: two solid legs, open ground under the span ----------
  for (const a of ARCHES) {
    for (let i = 0; i <= a.span; i++) { setO(a.x + i, a.y, EMPTY); open(a.x + i, a.y); open(a.x + i, a.y + 1); open(a.x + i, a.y - 1); }
    setO(a.x, a.y, T.ARCH); setO(a.x + a.span, a.y, T.ARCH);
  }

  // ---------- 11. Trails: the Fang Road west to Fangrock, ways to every place ----------
  const gate: [number, number] = [REDPASS.x, REDPASS.y + 4];
  const ox = O.x + (O.w >> 1), oy = O.y + O.h;
  trail([gate, [258, 96], [O.x + O.w, O.y + 10]], T.DIRT, 1);                                                      // the Red Pass to the Post's east side
  trail([[O.x, O.y + 10], [204, 90], [186, 84], [170, 80], [152, 84], [132, 76], [VULTURES_ROOST.x + 1, VULTURES_ROOST.y + 8]]); // the Fang Road, west
  trail([[VULTURES_ROOST.x - 1, VULTURES_ROOST.y + 8], [96, 78], [80, 74], [68, 70], [56, 76], [FANGROCK.x + FANGROCK.w, FANGROCK.y + 14]], T.DIRT, 1); // on to Fangrock
  trail([[204, 90], [192, 98], [CINNABAR_PITS.x + 4, CINNABAR_PITS.y - CINNABAR_PITS.ry]]);                         // down to the Cinnabar Pits
  trail([[186, 84], [196, 70], [198, 60], [BLOODSTONE_MESA.x, BLOODSTONE_MESA.y + BLOODSTONE_MESA.ry + 3]]);      // under Bloodstone Mesa
  trail([[ox, oy], [230, 112], [222, 128], [HANGING_ARCHES.x + 8, HANGING_ARCHES.y - HANGING_ARCHES.ry]]);          // the Post's south side to the Hanging Arches
  trail([[HANGING_ARCHES.x - HANGING_ARCHES.rx, HANGING_ARCHES.y - 2], [190, 126], [CINNABAR_PITS.x - 2, CINNABAR_PITS.y + CINNABAR_PITS.ry]]); // the Arches to the Pits
  trail([[152, 84], [146, 62], [136, 44], [TALON_FORT.x + (TALON_FORT.w >> 1), TALON_FORT.y + TALON_FORT.h]]);     // north up the river to Talon Fort
  trail([[132, 76], [130, 100], [CANYONS[0].floor[4][0], CANYONS[0].floor[4][1]]]);                               // south to Rattlesnake Gulch
  trail([[CANYONS[0].floor[0][0], CANYONS[0].floor[0][1]], [66, 112], [60, 92], [68, 70]]);                         // out of the gulch's west mouth, north to the road

  // ---------- 12. Scatter: cactus, dry scrub, dead brush, boulders under the cliffs, bones ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (getO(x, y) !== EMPTY || keep[y * W + x] || roads.has((y + Y0) * W + x)) continue;
    const h = hash(x, y, 1011), near = (dx: number, dy: number) => getO(x + dx, y + dy) === T.CLIFF;
    const foot = near(1, 0) || near(-1, 0) || near(0, 1) || near(0, -1);
    const scrub = noise(x, y, 9, 1012) > 0.68; // patches of thorny scrub
    if (foot && h < 0.16) setO(x, y, T.ROCK);
    else if (scrub && h < 0.12) setO(x, y, h < 0.05 ? T.CACTUS : T.BUSH);
    else if (h < 0.006) setO(x, y, T.ROCK);
    else if (h < 0.016) setO(x, y, T.CACTUS);
    else if (h < 0.028) setO(x, y, T.BUSH); // dry scrub (walk-through)
    else if (h < 0.032) setO(x, y, T.STUMP); // dead brush
    else if (h < 0.035) setO(x, y, T.BONES);
  }
  // boulders tumbled into the riverbed and the canyons
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (getG(x, y) !== T.GRAVEL || getO(x, y) !== EMPTY || roads.has((y + Y0) * W + x)) continue;
    if (hash(x, y, 1021) < 0.025) setO(x, y, T.ROCK);
  }
  // the roads keep a clear verge
  for (const k of roads) {
    const x = k % W, y = ((k / W) | 0) - Y0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const o = getO(x + i, y + j); if (o === T.ROCK || o === T.BUSH || o === T.STUMP || o === T.BONES || o === T.CACTUS) setO(x + i, y + j, EMPTY); }
  }
  // the reserved places stay bare
  for (const r of [O, FANGROCK, TALON_FORT]) each(r.x, r.y, r.w, r.h, (x, y) => setO(x, y, EMPTY));

  // ---------- 13. Reachability: every open tile joins the Red Pass (pockets cut off by rock are filled in) ----------
  const solid = (x: number, y: number) => {
    if (!inBand(x, y)) return true;
    const o = getO(x, y);
    return o !== EMPTY && o !== T.BUSH;
  };
  const seen = new Uint8Array(W * H);
  const q = [(REDPASS.y + 3) * W + REDPASS.x]; seen[q[0]] = 1; // the arrival spot
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % W, y = (q[i] / W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (solid(nx, ny) || seen[ny * W + nx]) continue;
      seen[ny * W + nx] = 1; q.push(ny * W + nx);
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!seen[y * W + x] && !solid(x, y)) setO(x, y, T.CLIFF);

  // ---------- 14. Named areas (specific first) ----------
  const A = (name: string, x: number, y: number, w: number, h: number): BadlandsArea => ({ name, x: Math.floor(x), y: Math.floor(y) + Y0, w: Math.ceil(w), h: Math.ceil(h) });
  const Q = RUSTWATER_SQUARE, F = FANGROCK, TF = TALON_FORT, M = BLOODSTONE_MESA, HA = HANGING_ARCHES, P = CINNABAR_PITS, V = VULTURES_ROOST;
  const ash = DRY_ASHWELL.reduce((b, [x, y]) => ({ x0: Math.min(b.x0, x), x1: Math.max(b.x1, x), y0: Math.min(b.y0, y), y1: Math.max(b.y1, y) }), { x0: W, x1: 0, y0: H, y1: 0 });
  const areas: BadlandsArea[] = [
    A("Rustwater Square", Q.x, Q.y, Q.w, Q.h),
    A("The Rustwater Post", O.x, O.y, O.w, O.h),
    A("The Red Pass", G.x - G.rx, G.y - G.ry, G.rx * 2, G.ry * 2),
    A("Fangrock", F.x, F.y, F.w, F.h),
    A("Talon Fort", TF.x, TF.y, TF.w, TF.h),
    A("Vulture's Roost", V.x - V.r - 2, V.y - V.r - 2, V.r * 2 + 5, V.r * 2 + 5),
    A("The Cinnabar Pits", P.x - P.rx - 2, P.y - P.ry - 2, P.rx * 2 + 4, P.ry * 2 + 4),
    A("The Hanging Arches", HA.x - HA.rx - 2, HA.y - HA.ry - 2, HA.rx * 2 + 4, HA.ry * 2 + 4),
    A("Bloodstone Mesa", M.x - M.rx - 5, M.y - M.ry - 5, M.rx * 2 + 10, M.ry * 2 + 10),
    ...CANYONS.map((c) => A(c.name, c.rock.x - 4, c.rock.y - 4, c.rock.w + 8, c.rock.h + 8)),
    A("The Dry Ashwell", ash.x0 - 6, ash.y0, ash.x1 - ash.x0 + 12, ash.y1 - ash.y0),
    A("The Red Badlands", 0, 0, W, H),
  ];
  // signposts at the road junctions (local tiles; put on the free tile beside the nearest road)
  const wanted: { x: number; y: number; to: string[] }[] = [
    { x: gate[0] - 3, y: gate[1] + 2, to: ["The Rustwater Post", "The Red Pass"] },                           // out of the Red Pass
    { x: 204, y: 92, to: ["Fangrock", "The Cinnabar Pits", "The Rustwater Post"] },                          // the Post's west road
    { x: 186, y: 86, to: ["Bloodstone Mesa", "Fangrock", "The Rustwater Post"] },                             // under the mesa
    { x: 154, y: 86, to: ["Talon Fort", "Fangrock", "The Rustwater Post"] },                                  // the Ashwell ford
    { x: 132, y: 78, to: ["Rattlesnake Gulch", "Vulture's Roost", "The Rustwater Post"] },                     // the gulch road
    { x: 68, y: 72, to: ["Fangrock", "Gallows Canyon", "Rattlesnake Gulch"] },                               // the last fork before Fangrock
  ];
  const posts: { x: number; y: number; to: string[] }[] = []; // map tiles, as shared/map.ts SIGNPOSTS wants them
  for (const p of wanted) {
    let best: [number, number] | undefined, bd = Infinity;
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      const x = p.x + i, y = p.y + j;
      if (!inBand(x, y) || getO(x, y) !== EMPTY || roads.has((y + Y0) * W + x) || !seen[y * W + x]) continue;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => roads.has((y + dy + Y0) * W + x + dx))) continue;
      if (Math.hypot(i, j) < bd) { bd = Math.hypot(i, j); best = [x, y]; }
    }
    if (best) { setO(best[0], best[1], T.SIGNPOST); posts.push({ x: best[0], y: best[1] + Y0, to: p.to }); }
  }
  return { areas, roads, posts };
}
