import { BADLANDS_H, BADLANDS_Y0, MAP_W } from "./constants";

/**
 * Act 4: the Red Badlands, the Redfang bandit clan's homeland (Lv 25-40). Red mesas, canyons and dry riverbeds in
 * their own band of the map (rows BADLANDS_Y0..+BADLANDS_H, under the moors' rock), walled in by red cliffs like the
 * moors (shared/moors.ts), so collisions and pathing need nothing special. Heroes come through the Red Pass at Act 1's
 * west edge (shared/act2.ts WAYGATES) from hero Lv 25 and arrive at the band's east edge; the land climbs in level
 * westward to Fangrock, the clan's stronghold in the far west.
 *
 * This file is the land and its places: the Rustwater Post (the outpost), Fangrock (the Redfang seat, with Old Rourke's
 * keep) and Talon Fort. Monster zones are in shared/spawns.ts, the monsters in shared/constants.ts (BADLANDS_KINDS), the
 * forts' garrisons in shared/bandits.ts (CAMPS). Tile ids are passed in (shared/map.ts T) so this file does not import map.ts. Layout constants are in local badlands coordinates (0..MAP_W, 0..BADLANDS_H); `BR(y)`
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
 * The Rustwater Post, the badlands' outpost (local tiles): a palisaded waystation round a spring in a canyon mouth, west
 * of the Red Pass, the last friendly roof before Redfang country. Drovers and salt-miners who refuse the Redfang hold it.
 * Gates west (the Fang Road), east (from the Red Pass) and south (to the Hanging Arches).
 */
export const RUSTWATER_POST = { x: 222, y: 82, w: 24, h: 18 };
/** The Post's square (local tiles): the badlands' safe zone (shared/map.ts isSafeZone), where heroes come back after dying. */
export const RUSTWATER_SQUARE = { x: 229, y: 87, w: 10, h: 7 };
/** Gate gaps in the Post's palisade (local tiles): y range on the west / east walls, x range on the south wall. */
export const RUSTWATER_GATES = { west: [91, 93], east: [91, 93], south: [233, 235] } as const;
/** The rust-red spring the Post is named for (local tiles: a pool against the west palisade, flagstones round it). */
export const RUSTWATER_SPRING = { x: 223, y: 88, w: 2, h: 3 };
/** The Post's portal stone (local tile), in the yard south-west of the square (shared/map.ts PORTAL_SPOTS). */
export const RUSTWATER_PORTAL = { x: 226, y: 96 };
/**
 * Fangrock, the Redfang clan's seat on its crag in the far west (local tiles): a big stockade of sharpened logs with
 * watchtowers, barracks and the clan's fires, and in its west end Old Rourke's keep behind a second wall. The main gate
 * faces east (the Fang Road), a back gate south.
 */
export const FANGROCK = { x: 12, y: 64, w: 34, h: 30 };
/** Gate gaps in Fangrock's outer stockade (local tiles): y range on the east wall, x range on the south wall. */
export const FANGROCK_GATES = { east: [77, 79], south: [27, 29] } as const;
/** Old Rourke's keep inside Fangrock (local tiles): its own stockade, the gate on its east side (y range), the great hall in it. */
export const FANGROCK_KEEP = { x: 15, y: 67, w: 13, h: 12, gate: [72, 74] as const };
/** Talon Fort: a smaller Redfang stockade watching the north road and the Dry Ashwell's upper reach (local tiles); gate south. */
export const TALON_FORT = { x: 118, y: 18, w: 18, h: 14 };
export const TALON_GATE = [126, 128] as const;
/** The forts' watchtowers (local tiles, a stack of crates the client draws a tower on): Redfang crossbowmen keep watch up there. */
export const FANGROCK_TOWERS: [number, number][] = [[44, 75], [44, 81], [42, 66], [25, 91], [31, 91], [28, 70]];
export const TALON_TOWERS: [number, number][] = [[124, 30], [130, 30], [134, 19]];
/**
 * Rock ledges along the roads to the forts (local tiles): a boulder on each, where Redfang ambushers crouch out of sight
 * (shared/bandits.ts CAMPS, the badlands' answer to Redfang Hollow's tree ambushers).
 */
export const LEDGES: [number, number][] = [[58, 74], [62, 80], [73, 68], [75, 73], [134, 46], [147, 58], [52, 100], [44, 97]];
/** The Saltlick Flats: white-crusted clay south-east of the Post where the salt-miners dig (local tiles, a hunting ground). */
export const SALTLICK_FLATS = { x: 236, y: 104, w: 28, h: 22 };
/** Drovers' Draw: the dry wash north of the Post where the drovers water their herds after rain (local tiles). */
export const DROVERS_DRAW = { x: 226, y: 50, w: 32, h: 24 };
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
  // the Post and the Redfang forts: timber and thatch, palisades, the yards' props
  COBBLE: number; WATER: number; PALISADE: number; FENCE: number; ROOF_THATCH: number; ROOF_RED: number; WALL_TIMBER: number; WINDOW_TIMBER: number;
  DOOR: number; BARREL: number; CRATE: number; HAY: number; STALL_RED: number; STALL_BLUE: number; BONFIRE: number; CAMPFIRE: number; TENT: number; ANVIL: number;
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

  // ---------- 7. The Rustwater Post's, Fangrock's and Talon Fort's ground: bare until they are raised (step 12b) ----------
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
  trail([[FANGROCK_GATES.south[0] + 1, FANGROCK.y + FANGROCK.h], [34, 100], [48, 99], [60, 92]]);                   // Fangrock's back gate to the gulch road

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
  // the forts and the Post stand on bare ground
  for (const r of [O, FANGROCK, TALON_FORT]) each(r.x, r.y, r.w, r.h, (x, y) => setO(x, y, EMPTY));

  // ---------- 12b. The Rustwater Post, Fangrock and Talon Fort ----------
  /** A building: `roof` rows over two rows of timber wall, a door in the front wall (like the valley's houses). */
  const house = (x: number, y: number, w: number, h: number, roof: number) => {
    each(x, y, w, h - 2, (i, j) => setO(i, j, roof));
    each(x, y + h - 2, w, 2, (i, j) => setO(i, j, T.WALL_TIMBER));
    const door = x + Math.floor(w / 2);
    setO(door, y + h - 1, T.DOOR);
    for (const wx of [x + 1, x + w - 2]) if (wx !== door) setO(wx, y + h - 1, T.WINDOW_TIMBER);
  };
  /** A palisade round a rect, with gaps: `gaps(x, y)` true for a gate tile (paths through the gates stay open). */
  const stockade = (r: { x: number; y: number; w: number; h: number }, gap: (x: number, y: number) => boolean) => {
    const x1 = r.x + r.w - 1, y1 = r.y + r.h - 1;
    each(r.x, r.y, r.w, r.h, (x, y) => { if ((x === r.x || x === x1 || y === r.y || y === y1) && !gap(x, y)) setO(x, y, T.PALISADE); });
  };
  const props = (list: readonly (readonly [number, number, number])[]) => { for (const [x, y, t] of list) setO(x, y, t); };
  {
    // the Post: a timber palisade round a yard of packed earth, the cobbled square in the middle with the drovers' fire
    const Q = RUSTWATER_SQUARE, Gt = RUSTWATER_GATES, S = RUSTWATER_SPRING, x1 = O.x + O.w - 1, y1 = O.y + O.h - 1;
    each(O.x, O.y, O.w, O.h, (x, y) => setG(x, y, hash(x, y, 1031) < 0.7 ? T.DIRT : T.SAND));
    each(Q.x, Q.y, Q.w, Q.h, (x, y) => road(x, y, T.COBBLE));
    for (let x = O.x; x < Q.x; x++) road(x, Gt.west[0] + 1);            // the west gate (the Fang Road)
    for (let x = Q.x + Q.w; x <= x1; x++) road(x, Gt.east[0] + 1);      // the east gate (from the Red Pass)
    for (let y = Q.y + Q.h; y <= y1; y++) road(Gt.south[0] + 1, y);     // the south gate
    house(223, 83, 6, 4, T.ROOF_RED);     // the marshal's hall
    house(230, 83, 4, 4, T.ROOF_THATCH);  // the armoury
    house(235, 83, 4, 4, T.ROOF_THATCH);  // the healer's house
    house(240, 83, 5, 4, T.ROOF_THATCH);  // the drovers' bunkhouse
    stockade(O, (x, y) => (x === O.x && y >= Gt.west[0] && y <= Gt.west[1]) || (x === x1 && y >= Gt.east[0] && y <= Gt.east[1]) || (y === y1 && x >= Gt.south[0] && x <= Gt.south[1]));
    // the spring: a rust-red pool against the west wall, flagstones round it
    each(S.x, S.y - 1, S.w + 1, S.h + 2, (x, y) => setG(x, y, T.FLAGS));
    each(S.x, S.y, S.w, S.h, (x, y) => { setG(x, y, T.WATER); roads.delete((y + Y0) * W + x); });
    // the portal stone's yard, the fire on the square, the trader's stall, the salt-miners' stores, the drovers' pen
    each(RUSTWATER_PORTAL.x - 2, RUSTWATER_PORTAL.y - 1, 5, 3, (x, y) => setG(x, y, T.FLAGS));
    setO(Q.x + 4, Q.y + 3, T.BONFIRE);
    setO(Q.x + Q.w - 1, Q.y, T.STALL_BLUE); // the healer's stall, beside her door
    setO(Q.x, Q.y + 1, T.ANVIL);             // the armourer's anvil
    props([[239, 95, T.FENCE], [240, 95, T.FENCE], [241, 95, T.FENCE], [242, 95, T.FENCE], [243, 95, T.FENCE], [240, 97, T.HAY], [241, 97, T.HAY],
      [236, 97, T.BARREL], [237, 97, T.CRATE], [237, 98, T.CRATE], [244, 88, T.BARREL], [244, 89, T.BARREL]]);
  }
  {
    // Fangrock: a stockade of sharpened logs, barracks and tents round the clan's fires, Old Rourke's keep in the west end
    const F = FANGROCK, K = FANGROCK_KEEP, Gt = FANGROCK_GATES, x1 = F.x + F.w - 1, y1 = F.y + F.h - 1;
    each(F.x, F.y, F.w, F.h, (x, y) => setG(x, y, noise(x, y, 4, 1041) > 0.45 ? T.DIRT : hash(x, y, 1042) < 0.5 ? T.RUBBLE : T.SAND));
    for (let x = K.x + K.w; x <= x1; x++) road(x, Gt.east[0] + 1);                       // the main lane: the east gate to the keep
    for (let y = K.gate[0] + 1; y <= y1; y++) road(Gt.south[0] + 1, y);                  // up to the keep's gate, down to the back gate
    stockade(F, (x, y) => (x === x1 && y >= Gt.east[0] && y <= Gt.east[1]) || (y === y1 && x >= Gt.south[0] && x <= Gt.south[1]));
    // the keep: flagstones, its own wall, the great hall under red tiles, the clan's loot heaped by the fire
    const kx1 = K.x + K.w - 1;
    each(K.x + 1, K.y + 1, K.w - 2, K.h - 2, (x, y) => setG(x, y, hash(x, y, 1043) < 0.8 ? T.FLAGS : T.RUBBLE));
    stockade(K, (x, y) => x === kx1 && y >= K.gate[0] && y <= K.gate[1]);
    house(K.x + 2, K.y + 1, 8, 4, T.ROOF_RED);
    props([[K.x + 6, K.y + 8, T.BONFIRE], [K.x + 2, K.y + 9, T.STALL_RED], [K.x + 3, K.y + 9, T.STALL_RED], [K.x + 9, K.y + 9, T.BARREL], [K.x + 9, K.y + 10, T.CRATE]]);
    // barracks along the north wall, tents and fires in the bailey, the firebrands' oil stores, a smithy
    house(31, 66, 5, 3, T.ROOF_THATCH); house(37, 66, 5, 3, T.ROOF_THATCH); house(31, 84, 4, 3, T.ROOF_THATCH);
    props([[36, 80, T.CAMPFIRE], [24, 86, T.CAMPFIRE], [33, 88, T.TENT], [38, 86, T.TENT], [41, 89, T.TENT], [19, 85, T.TENT], [17, 89, T.TENT],
      [40, 71, T.BARREL], [41, 71, T.BARREL], [40, 72, T.BARREL], [34, 72, T.ANVIL], [43, 88, T.HAY], [43, 89, T.CRATE], [21, 81, T.CRATE], [22, 81, T.BARREL]]);
    for (const [tx, ty] of FANGROCK_TOWERS) setO(tx, ty, T.CRATE); // the watchtowers stand on a stack of crates (client draws the tower)
  }
  {
    // Talon Fort: a small stockade, two huts and a fire, watchtowers by the gate
    const F = TALON_FORT, x1 = F.x + F.w - 1, y1 = F.y + F.h - 1;
    each(F.x, F.y, F.w, F.h, (x, y) => setG(x, y, hash(x, y, 1051) < 0.75 ? T.DIRT : T.RUBBLE));
    for (let y = F.y + 6; y <= y1; y++) road(TALON_GATE[0] + 1, y);
    stockade(F, (x, y) => y === y1 && x >= TALON_GATE[0] && x <= TALON_GATE[1]);
    house(120, 20, 5, 3, T.ROOF_THATCH); house(129, 20, 5, 3, T.ROOF_THATCH);
    props([[125, 25, T.CAMPFIRE], [121, 27, T.TENT], [133, 27, T.TENT], [120, 24, T.BARREL], [121, 24, T.CRATE], [134, 24, T.HAY]]);
    for (const [tx, ty] of TALON_TOWERS) setO(tx, ty, T.CRATE);
  }
  // the ambushers' ledges: a boulder on each, off the road
  for (const [lx, ly] of LEDGES) if (!roads.has((ly + Y0) * W + lx)) setO(lx, ly, T.ROCK);

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
  const Q = RUSTWATER_SQUARE, F = FANGROCK, FK = FANGROCK_KEEP, TF = TALON_FORT, M = BLOODSTONE_MESA, HA = HANGING_ARCHES, P = CINNABAR_PITS, V = VULTURES_ROOST;
  const SF = SALTLICK_FLATS, DD = DROVERS_DRAW;
  const ash = DRY_ASHWELL.reduce((b, [x, y]) => ({ x0: Math.min(b.x0, x), x1: Math.max(b.x1, x), y0: Math.min(b.y0, y), y1: Math.max(b.y1, y) }), { x0: W, x1: 0, y0: H, y1: 0 });
  const areas: BadlandsArea[] = [
    A("Rustwater Square", Q.x, Q.y, Q.w, Q.h),
    A("The Rustwater Post", O.x, O.y, O.w, O.h),
    A("The Red Pass", G.x - G.rx, G.y - G.ry, G.rx * 2, G.ry * 2),
    A("Fangrock Keep", FK.x, FK.y, FK.w, FK.h),
    A("Fangrock", F.x, F.y, F.w, F.h),
    A("Talon Fort", TF.x, TF.y, TF.w, TF.h),
    A("Vulture's Roost", V.x - V.r - 2, V.y - V.r - 2, V.r * 2 + 5, V.r * 2 + 5),
    A("The Cinnabar Pits", P.x - P.rx - 2, P.y - P.ry - 2, P.rx * 2 + 4, P.ry * 2 + 4),
    A("The Hanging Arches", HA.x - HA.rx - 2, HA.y - HA.ry - 2, HA.rx * 2 + 4, HA.ry * 2 + 4),
    A("Bloodstone Mesa", M.x - M.rx - 5, M.y - M.ry - 5, M.rx * 2 + 10, M.ry * 2 + 10),
    ...CANYONS.map((c) => A(c.name, c.rock.x - 4, c.rock.y - 4, c.rock.w + 8, c.rock.h + 8)),
    A("The Saltlick Flats", SF.x, SF.y, SF.w, SF.h),
    A("Drovers' Draw", DD.x, DD.y, DD.w, DD.h),
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
