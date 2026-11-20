import { BADLANDS_Y0, CROWN_H, CROWN_Y0, DESERT_Y0, MAP_W, MOORS_Y0, SINKHOLES_Y0 } from "./constants";

/**
 * Act 6: the Crown of the Marches, the ruined kingdom of the last High King in the middle of the continent (Lv 40-50,
 * the endgame). Neutral ground no clan calls home: pale granite cliffs wall a high basin of broken courts, fallen
 * statues, snapped spires and gardens gone wild round the Crown Keep, the walled citadel on its hill in the middle. Its
 * own band of the map (rows CROWN_Y0..+CROWN_H, under the sinkholes' rock), walled like the other homelands
 * (shared/sinkholes.ts), so collisions and pathing need nothing special.
 *
 * Every homeland has a road in: the five Crownways (shared/act2.ts WAYGATES), each a dais in its homeland and a gate on
 * the Crown's rim on the side that homeland lies (Oakvale north-west, the moors north-east, the badlands west, the
 * sinkholes south, the Sunscar south-east), open from hero Lv 40. Tollcross, the Truce Market the Heralds' College
 * keeps outside the Keep's north gate, is the safe hub; the Throne Hall inside the Keep is left for the boss to come.
 *
 * This file is the land and its places; monsters, quests and the war come later. Tile ids are passed in (shared/map.ts T)
 * so this file does not import map.ts (nor the band files, which import the Crownway table from here). Layout constants
 * are in local Crown coordinates (0..MAP_W, 0..CROWN_H) unless they say map tiles; `CR(y)` turns a local row into a map row.
 */
export const CR = (y: number) => y + CROWN_Y0;
/** True for a map row inside the Crown's band. */
export const inCrownRow = (ty: number) => ty >= CROWN_Y0 && ty < CROWN_Y0 + CROWN_H;

/** An inclusive box of map tiles. */
export interface TileBox { x0: number; x1: number; y0: number; y1: number }
export type CrownwayFrom = "oakvale" | "moors" | "badlands" | "sinkholes" | "sunscar";
/**
 * One of the five Crownways. `home`: the dais in its homeland (map tiles), carved after that band was built and only
 * inside `box` (map tiles, inclusive: nothing else in the homeland changed for it, tests/crown.test.ts). `gate`: its
 * Crown side (local tiles), a marble dais on the rim facing that homeland. Heroes step out just south of either.
 */
export interface Crownway { from: CrownwayFrom; name: string; land: string; home: { x: number; y: number }; box: TileBox; gate: { x: number; y: number } }
export const CROWNWAYS: readonly Crownway[] = [
  // Oakvale's south-east edge: the coast east of Gullrock Cove, under the Stormbreak Crags, a path north to the coast road
  { from: "oakvale", name: "The Greenward Gate", land: "Oakvale", home: { x: 273, y: 191 }, box: { x0: 264, x1: 280, y0: 175, y1: 197 }, gate: { x: 36, y: 18 } },
  // the open heather south of the Host's Muster (shared/moors.ts HOST_CAMP)
  { from: "moors", name: "The Mourning Gate", land: "the Grey Barrow Moors", home: { x: 256, y: MOORS_Y0 + 101 }, box: { x0: 250, x1: 262, y0: MOORS_Y0 + 96, y1: MOORS_Y0 + 106 }, gate: { x: 252, y: 18 } },
  // the sand flats south of Fangrock's stockade (shared/badlands.ts FANGROCK)
  { from: "badlands", name: "The Red Gate", land: "the Red Badlands", home: { x: 44, y: BADLANDS_Y0 + 106 }, box: { x0: 38, x1: 50, y0: BADLANDS_Y0 + 100, y1: BADLANDS_Y0 + 112 }, gate: { x: 20, y: 88 } },
  // the dells west of Hidehall's palisade (shared/sinkholes.ts HIDEHALL)
  { from: "sinkholes", name: "The Deep Gate", land: "the Mawdeep Sinkholes", home: { x: 217, y: SINKHOLES_Y0 + 135 }, box: { x0: 211, x1: 223, y0: SINKHOLES_Y0 + 129, y1: SINKHOLES_Y0 + 141 }, gate: { x: 144, y: 152 } },
  // the sand east of the Veiled Sanctum on the Thornspire (shared/desert.ts SANCTUM)
  { from: "sunscar", name: "The Sun Gate", land: "the Sunscar", home: { x: 265, y: DESERT_Y0 + 46 }, box: { x0: 259, x1: 271, y0: DESERT_Y0 + 40, y1: DESERT_Y0 + 52 }, gate: { x: 256, y: 146 } },
];
export const crownwayFrom = (from: CrownwayFrom) => CROWNWAYS.find((c) => c.from === from)!;
/** A Crownway's Crown side in map tiles. */
export const crownGateTile = (c: Crownway) => ({ x: c.gate.x, y: CR(c.gate.y) });
/** The open ground round each Crown-side gate (local tiles, ellipse radii round the gate, mostly south of it). */
export const CROWNGATE_CLEARING = { rx: 7, ry: 5, dy: 2 };

/**
 * The Crown Keep (local tiles): the last High King's citadel on its hill in the middle of the land, a curtain wall of
 * grey stone round the outer bailey, gates north (to Tollcross) and south (the Deep Gate's road). A ring of crag
 * (`hill`, an ellipse round the walls) is the hill's scarp; the roads climb it through gaps at the gates.
 */
export const CROWN_KEEP = { x: 122, y: 72, w: 44, h: 36 };
/** Gate gaps in the Keep's curtain wall (local tiles): x range on the north and south walls. */
export const CROWN_KEEP_GATES = { north: [142, 145], south: [142, 145] } as const;
/** The hill's scarp round the Keep (local tiles: centre, radii; a ring of crag 2 tiles thick, gaps at the gates). */
export const CROWN_HILL = { x: 144, y: 90, rx: 36, ry: 30 };
/** The Throne Hall inside the bailey (local tiles, walls included; its door faces south): a boss-only lair, later. */
export const THRONE_HALL = { x: 134, y: 82, w: 20, h: 14 };
/** The Throne Hall's door gap (local tiles: x range on its south wall). */
export const THRONE_DOOR = [143, 144] as const;
/**
 * Tollcross (local tiles), the Truce Market: the pilgrims' and traders' fair the Heralds' College keeps on the old
 * parade ground outside the Keep's north gate, where every Crownway road meets. Bare ground until it is raised.
 */
export const TOLLCROSS = { x: 124, y: 36, w: 40, h: 22 };
/** Tollcross's square (local tiles): the Crown's safe zone (shared/map.ts isSafeZone), where heroes come back after dying. */
export const TOLLCROSS_SQUARE = { x: 138, y: 42, w: 12, h: 8 };
/** The ring road round the Keep's hill (local tiles: centre, radii): every Crownway road joins it. */
export const CROWN_RING = { x: 144, y: 90, rx: 42, ry: 35 };
/** Ruined courts (local tiles): cracked marble floors inside broken walls, statues fallen in them. */
export const COURTS: readonly { x: number; y: number; w: number; h: number }[] = [
  { x: 120, y: 132, w: 14, h: 10 }, { x: 156, y: 134, w: 12, h: 10 }, { x: 138, y: 140, w: 10, h: 6 }, // the Sunken Courts
  { x: 178, y: 44, w: 14, h: 10 }, { x: 196, y: 50, w: 10, h: 10 },                                     // the Gilded Ruins
  { x: 190, y: 78, w: 12, h: 10 }, { x: 206, y: 94, w: 12, h: 10 },                                     // the Vigil Courts
  { x: 80, y: 44, w: 18, h: 12 },                                                                       // the Tourney Grounds' lists
];
/** Broken spires (local tiles): stumps of the old towers, each a 2x2 of SPIRE with rubble round it. */
export const SPIRES: [number, number][] = [[226, 24], [240, 30], [222, 40], [248, 42], [234, 44], [212, 30], [60, 136], [104, 26], [196, 130]];
/** Overgrown gardens (local tiles: centre, radii): flowers gone wild, hedges in broken rows, old trees. */
export const GARDENS: readonly { x: number; y: number; rx: number; ry: number }[] = [
  { x: 86, y: 114, rx: 12, ry: 8 }, { x: 236, y: 132, rx: 14, ry: 9 }, { x: 222, y: 150, rx: 8, ry: 5 }, { x: 50, y: 40, rx: 8, ry: 5 },
];
/** The Field of Statues (local tiles): the old kings' likenesses, toppled where they stood. */
export const STATUE_FIELD = { x: 26, y: 70, w: 40, h: 36 };
/**
 * The lands that will hold monster zones and war territories (local tiles): the five approaches inside the gates, four
 * inner lands round the hill and the Keep's bailey. Each has a 7x7 patch of clear ground (`hold`, its middle) so a war
 * Hold (shared/war/standards.ts, an inner 5x5 free of anything solid) always fits.
 */
export const CROWN_LANDS: readonly { name: string; x: number; y: number; w: number; h: number; hold: [number, number] }[] = [
  { name: "The Pilgrims' Way", x: 14, y: 14, w: 60, h: 36, hold: [62, 22] },
  { name: "The Spirefall", x: 210, y: 14, w: 64, h: 38, hold: [232, 34] },
  { name: "The Field of Statues", x: 14, y: 62, w: 56, h: 50, hold: [40, 100] },
  { name: "The Sunken Courts", x: 112, y: 126, w: 64, h: 34, hold: [168, 152] },
  { name: "The Ember Gardens", x: 210, y: 116, w: 64, h: 46, hold: [252, 124] },
  { name: "The Tourney Grounds", x: 76, y: 38, w: 44, h: 28, hold: [108, 58] },
  { name: "The Gilded Ruins", x: 168, y: 38, w: 44, h: 28, hold: [204, 44] },
  { name: "The Mourning Gardens", x: 70, y: 98, w: 40, h: 32, hold: [100, 104] },
  { name: "The Vigil Courts", x: 182, y: 70, w: 42, h: 42, hold: [216, 80] },
  { name: "The Crown Keep", ...CROWN_KEEP, hold: [128, 101] }, // its outer bailey (the Throne Hall is its own area)
];
/** Granite crags out on the land (local tiles: centre, radii): lumps of cliff the roads wind round. */
const CRAGS: [number, number, number, number][] = [[64, 58, 5, 3], [228, 64, 6, 4], [40, 128, 6, 4], [100, 146, 5, 3], [254, 104, 5, 4], [184, 156, 5, 3], [24, 50, 4, 3]];

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

/**
 * Carves a Crownway's homeland-side dais (map tiles): old flagstones in a ring of rubble, the ground round it kept.
 * Each band calls it last, after its own reachability pass, on open ground joined to its roads; only objects `clear`
 * allows give way (all of them by default), water stays water. Everything it touches lies inside the Crownway's box.
 */
export function crownwayDais(c: Crownway, ground: number[][], objects: number[][], EMPTY: number, T: { FLAGS: number; RUBBLE: number; WATER: number }, seed: number, clear: (o: number) => boolean = () => true) {
  const cx = c.home.x + 0.5, cy = c.home.y + 0.5, rx = 3.6, ry = 3.2;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
    if (d >= 1 || x < c.box.x0 || x > c.box.x1 || y < c.box.y0 || y > c.box.y1) continue;
    if (objects[y][x] !== EMPTY && clear(objects[y][x])) objects[y][x] = EMPTY;
    if (objects[y][x] !== EMPTY || ground[y][x] === T.WATER) continue;
    if (d < 0.5) ground[y][x] = hash(x, y, seed) < 0.8 ? T.FLAGS : T.RUBBLE;
    else if (d < 0.8 && hash(x, y, seed + 1) < 0.5) ground[y][x] = T.RUBBLE;
  }
}

export interface CrownTiles {
  GRASS: number; GRASS_DARK: number; TALL_GRASS: number; FLOWERS: number; DIRT: number; RUBBLE: number; FLAGS: number; WATER: number;
  TREE: number; PINE: number; BUSH: number; ROCK: number; STUMP: number; CLIFF: number; SIGNPOST: number; RUIN: number; WALL_STONE: number;
  MARBLE: number; STATUE: number; SPIRE: number; BRAZIER: number;
}
export interface CrownArea { name: string; x: number; y: number; w: number; h: number; mobs?: never[] }

/**
 * The outer ring of the band's cliffs (local tiles, row y * MAP_W + x), filled by buildCrown: the client draws these CLIFF
 * tiles as ray-traced 3D pale granite mountains (groundPaint.ts relief) instead of terraced blocks (Murat 2026-11-19). The map
 * is unchanged: the tiles stay CLIFF, so collisions and pathing are the same.
 */
export const CROWN_RIM = new Uint8Array(MAP_W * CROWN_H);
/** True for a map tile in the band's outer mountain ring (check it is CLIFF too: roads and clearings carve the ring open). */
export const isCrownRim = (x: number, y: number) => inCrownRow(y) && x >= 0 && x < MAP_W && CROWN_RIM[(y - CROWN_Y0) * MAP_W + x] === 1;

/**
 * Builds the Crown into the map's ground/object grids (map coordinates). Deterministic (fixed seeds), like the rest of
 * the world. Returns its named areas (specific first), the road tiles and the signposts. Every open tile joins the
 * Crownways' arrivals.
 */
export function buildCrown(T: CrownTiles, ground: number[][], objects: number[][], EMPTY: number) {
  const Y0 = CROWN_Y0, H = CROWN_H, W = MAP_W;
  const inBand = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H;
  const setG = (x: number, y: number, t: number) => { if (inBand(x, y)) ground[y + Y0][x] = t; };
  const setO = (x: number, y: number, t: number) => { if (inBand(x, y)) objects[y + Y0][x] = t; };
  const getG = (x: number, y: number) => (inBand(x, y) ? ground[y + Y0][x] : -1);
  const getO = (x: number, y: number) => (inBand(x, y) ? objects[y + Y0][x] : T.CLIFF);
  const roads = new Set<number>(); // map index
  const keep = new Uint8Array(W * H); // tiles that must stay open (the gates, the reserved places, the roads)
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
  /** A road tile: the old kings' flagstones, cracked and patched with rubble, clear of whatever stood there. */
  const road = (x: number, y: number, t?: number) => {
    if (!inBand(x, y)) return;
    setG(x, y, t ?? (getG(x, y) === T.MARBLE ? T.MARBLE : hash(x, y, 1401) < 0.86 ? T.FLAGS : T.RUBBLE));
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
  /** A king's road, `wide` + 1 tiles of open verge each side, through any rock on its way. */
  const trail = (pts: [number, number][], wide = 0, paved = 0) => spline(pts, (cx, cy) => {
    for (let j = -paved; j <= paved; j++) for (let i = -paved; i <= paved; i++) road(cx + i, cy + j);
    for (let j = -1 - wide - paved; j <= 1 + wide + paved; j++) for (let i = -1 - wide - paved; i <= 1 + wide + paved; i++) open(cx + i, cy + j);
  });
  const ellipse = (e: { x: number; y: number; rx: number; ry: number }, k: number, n: number): [number, number] => {
    const a = (k / n) * Math.PI * 2;
    return [Math.round(e.x + Math.cos(a) * e.rx), Math.round(e.y + Math.sin(a) * e.ry)];
  };

  // ---------- 1. Upland ground: wild grass over the old kingdom, bare earth, cracked marble where courts once stood ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = noise(x, y, 12, 1301), m = noise(x, y, 4, 1302), r = noise(x, y, 7, 1303);
    setG(x, y, r > 0.8 && m > 0.4 ? T.MARBLE : n < 0.3 ? T.GRASS_DARK : n > 0.76 && m < 0.45 ? T.DIRT : m > 0.74 ? T.TALL_GRASS : T.GRASS);
    setO(x, y, EMPTY);
  }

  // ---------- 2. Pale granite cliffs: a ragged wall all round, crags out on the land, the scarp of the Keep's hill ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (d < 6 + noise(x, y, 9, 1311) * 8 + noise(x, y, 3, 1312) * 2) cliff[y * W + x] = 1;
  }
  CROWN_RIM.set(cliff); // the outer ring
  CRAGS.forEach(([cx, cy, rx, ry], i) => disk(cx, cy, rx + 2, ry + 2, (x, y) => {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy < 0.8 + 0.4 * noise(x, y, 3, 1321 + i)) cliff[y * W + x] = 1;
  }));
  const Hl = CROWN_HILL;
  disk(Hl.x, Hl.y, Hl.rx, Hl.ry, (x, y, d) => {
    if (Math.sqrt(d) > 0.92 - 0.03 * noise(x, y, 3, 1331) && Math.abs(x + 0.5 - Hl.x) > 3.5) cliff[y * W + x] = 1; // gaps north and south for the roads
  });

  // ---------- 3. Places that must stay open ----------
  const clearDisk = (cx: number, cy: number, rx: number, ry: number) => disk(cx, cy, rx, ry, (x, y) => { cliff[y * W + x] = 0; keep[y * W + x] = 1; });
  const clearRect = (r: { x: number; y: number; w: number; h: number }, m: number) => clearDisk(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + m, r.h / 2 + m);
  const G = CROWNGATE_CLEARING, K = CROWN_KEEP, X = TOLLCROSS;
  for (const c of CROWNWAYS) clearDisk(c.gate.x + 0.5, c.gate.y + 0.5 + G.dy, G.rx + 3, G.ry + 2);
  clearRect(X, 2); clearRect(K, 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cliff[y * W + x]) setO(x, y, T.CLIFF);

  // ---------- 4. The Crown-side gates: a marble dais on the rim, braziers either side, open ground below ----------
  for (const c of CROWNWAYS) {
    const gx = c.gate.x, gy = c.gate.y;
    disk(gx + 0.5, gy + 0.5 + G.dy, G.rx, G.ry, (x, y, d) => { setO(x, y, EMPTY); open(x, y); setG(x, y, d < 0.45 ? T.FLAGS : hash(x, y, 1341) < 0.5 ? T.GRASS : T.DIRT); });
    disk(gx + 0.5, gy + 1, 2.6, 2.2, (x, y, d) => setG(x, y, d > 0.65 && hash(x, y, 1342) < 0.4 ? T.RUBBLE : T.MARBLE));
    setO(gx - 3, gy, T.BRAZIER); setO(gx + 3, gy, T.BRAZIER);
  }

  // ---------- 5. Tollcross: the old parade ground, bare until the fair is raised; its square paved in marble ----------
  each(X.x, X.y, X.w, X.h, (x, y) => { setO(x, y, EMPTY); open(x, y); setG(x, y, hash(x, y, 1351) < 0.7 ? T.DIRT : T.GRASS); });

  // ---------- 6. The Keep: the hill top, the curtain wall, the bailey, the Throne Hall ----------
  disk(Hl.x, Hl.y, Hl.rx - 4, Hl.ry - 4, (x, y) => { setO(x, y, EMPTY); open(x, y); setG(x, y, hash(x, y, 1361) < 0.6 ? T.GRASS_DARK : T.DIRT); });
  {
    const x1 = K.x + K.w - 1, y1 = K.y + K.h - 1, Gt = CROWN_KEEP_GATES, Th = THRONE_HALL, tx1 = Th.x + Th.w - 1, ty1 = Th.y + Th.h - 1;
    each(K.x, K.y, K.w, K.h, (x, y) => setG(x, y, noise(x, y, 5, 1362) > 0.55 ? T.MARBLE : hash(x, y, 1363) < 0.6 ? T.DIRT : T.RUBBLE));
    // the curtain wall, broken here and there into heaps of fallen stone (still solid: the breaches are filled with rubble)
    each(K.x, K.y, K.w, K.h, (x, y) => {
      if (!(x === K.x || x === x1 || y === K.y || y === y1)) return;
      if ((y === K.y && x >= Gt.north[0] && x <= Gt.north[1]) || (y === y1 && x >= Gt.south[0] && x <= Gt.south[1])) return;
      setO(x, y, hash(x, y, 1364) < 0.12 ? T.RUIN : T.WALL_STONE);
    });
    // corner towers: stumps of spires
    for (const [cx, cy] of [[K.x, K.y], [x1, K.y], [K.x, y1], [x1, y1]]) setO(cx, cy, T.SPIRE);
    // the Throne Hall: marble inside its walls, the door south onto the bailey
    each(Th.x, Th.y, Th.w, Th.h, (x, y) => {
      setG(x, y, T.MARBLE);
      const wall = x === Th.x || x === tx1 || y === Th.y || y === ty1;
      setO(x, y, wall && !(y === ty1 && x >= THRONE_DOOR[0] && x <= THRONE_DOOR[1]) ? T.WALL_STONE : EMPTY);
    });
    // the dais at its north end, braziers down the nave, statues of the kings along the walls
    each(Th.x + 7, Th.y + 1, 6, 3, (x, y) => setG(x, y, T.FLAGS));
    for (let y = Th.y + 3; y < ty1 - 1; y += 3) { setO(Th.x + 4, y, T.BRAZIER); setO(tx1 - 4, y, T.BRAZIER); }
    for (let y = Th.y + 2; y < ty1; y += 3) { setO(Th.x + 1, y, T.STATUE); setO(tx1 - 1, y, T.STATUE); }
    // the bailey: the lane from gate to gate round the hall, braziers at the gates, fallen statues and rubble
    for (let y = K.y; y <= y1; y++) for (let x = Gt.north[0] + 1; x <= Gt.north[1] - 1; x++) if (y < Th.y || y > ty1) road(x, y, T.MARBLE);
    for (let x = Th.x - 2; x <= tx1 + 2; x++) { road(x, Th.y - 2, T.MARBLE); road(x, ty1 + 2, T.MARBLE); }
    for (let y = Th.y - 2; y <= ty1 + 2; y++) { road(Th.x - 2, y, T.MARBLE); road(tx1 + 2, y, T.MARBLE); }
    for (const gx of [Gt.north[0] - 1, Gt.north[1] + 1]) { setO(gx, K.y + 1, T.BRAZIER); setO(gx, y1 - 1, T.BRAZIER); }
    for (const [sx, sy] of [[K.x + 4, K.y + 4], [x1 - 4, K.y + 5], [K.x + 14, y1 - 3], [x1 - 5, y1 - 3], [K.x + 3, K.y + 16], [x1 - 3, K.y + 20]]) setO(sx, sy, T.STATUE);
  }

  // ---------- 7. The roads: every Crownway to the ring road round the hill, Tollcross to the Keep's gates ----------
  const R = CROWN_RING, ring = Array.from({ length: 25 }, (_, k) => ellipse(R, k, 24));
  trail(ring, 0, 0);                                                                                            // the ring road
  const arrival = (c: Crownway): [number, number] => [c.gate.x, c.gate.y + 3];
  const [oak, moors, bad, sink, sun] = CROWNWAYS.map(arrival);
  trail([oak, [52, 26], [80, 34], [104, 42], [X.x, X.y + 12]], 0, 1);                                            // the Greenward road to Tollcross
  trail([moors, [236, 26], [208, 34], [184, 42], [X.x + X.w, X.y + 12]], 0, 1);                                   // the Mourning road to Tollcross
  trail([bad, [36, 90], [60, 88], [84, 90], ellipse(R, 12, 24)], 0, 1);                                           // the Red road east to the ring
  // (the south rim's gates face their homelands across the land: their roads leave from behind the dais)
  trail([[sink[0], sink[1] - 5], [144, 140], ellipse(R, 6, 24)], 0, 1);                                         // the Deep road north to the ring
  trail([[sun[0], sun[1] - 5], [238, 140], [214, 128], [200, 116], ellipse(R, 3, 24)], 0, 1);                    // the Sun road north-west to the ring
  trail([[144, X.y + X.h - 1], [144, K.y]], 0, 1);                                                               // Tollcross down to the Keep's north gate
  trail([[144, K.y + K.h - 1], ellipse(R, 6, 24)], 0, 1);                                                        // the south gate down to the ring
  trail([[X.x, X.y + 12], [X.x + X.w, X.y + 12]], 0, 0);                                                         // across Tollcross
  trail([[X.x + 4, X.y + X.h], ellipse(R, 15, 24)]); trail([[X.x + X.w - 4, X.y + X.h], ellipse(R, 21, 24)]);    // Tollcross to the ring
  trail([[104, 42], [100, 30], [104, 28]]);                                                                       // to the spire on the Tourney Grounds
  trail([[184, 42], [196, 56], [200, 60]]);                                                                       // into the Gilded Ruins
  trail([ellipse(R, 1, 24), [196, 88], [212, 98]]);                                                               // into the Vigil Courts
  trail([[84, 90], [86, 106], [86, 114]]);                                                                        // down to the Mourning Gardens
  trail([[144, 140], [128, 137], [162, 139]]);                                                                    // through the Sunken Courts
  trail([[214, 128], [230, 132], [236, 132]]);                                                                    // into the Ember Gardens
  trail([[60, 88], [46, 80], [40, 72]]);                                                                          // up through the Field of Statues

  // ---------- 8. Ruined courts: marble floors, broken walls with gaps, a statue fallen in each ----------
  COURTS.forEach((c, i) => {
    each(c.x, c.y, c.w, c.h, (x, y) => { if (getO(x, y) !== T.CLIFF) setG(x, y, hash(x, y, 1371) < 0.85 ? T.MARBLE : T.RUBBLE); });
    const x1 = c.x + c.w - 1, y1 = c.y + c.h - 1, mx = c.x + (c.w >> 1), my = c.y + (c.h >> 1);
    each(c.x, c.y, c.w, c.h, (x, y) => {
      if (!(x === c.x || x === x1 || y === c.y || y === y1) || roads.has((y + Y0) * W + x)) return;
      if (Math.abs(x - mx) <= 1 || Math.abs(y - my) <= 1) return; // a doorway in the middle of every side
      if (hash(x, y, 1372 + i) < 0.55) setO(x, y, T.RUIN);
    });
    if (!roads.has((my + Y0) * W + mx - 2)) setO(mx - 2, my, T.STATUE);
  });

  // ---------- 9. The Field of Statues: the old kings toppled where they stood, in their broken rows ----------
  { const F = STATUE_FIELD;
    for (let y = F.y + 2; y < F.y + F.h; y += 5) for (let x = F.x + 2 + ((y / 5) & 1) * 2; x < F.x + F.w; x += 5) {
      if (hash(x, y, 1381) < 0.7 && getO(x, y) === EMPTY && !keep[y * W + x]) setO(x, y, T.STATUE);
    }
    each(F.x, F.y, F.w, F.h, (x, y) => { if (getO(x, y) === EMPTY && getG(x, y) !== T.MARBLE && noise(x, y, 5, 1382) > 0.62) setG(x, y, T.MARBLE); });
  }

  // ---------- 10. Broken spires: 2x2 stumps of the old towers, rubble fanned out round them ----------
  for (const [sx, sy] of SPIRES) {
    disk(sx + 1, sy + 1, 3.5, 3, (x, y) => { if (getO(x, y) !== T.CLIFF && !roads.has((y + Y0) * W + x)) setG(x, y, hash(x, y, 1391) < 0.7 ? T.RUBBLE : T.DIRT); });
    each(sx, sy, 2, 2, (x, y) => { if (!keep[y * W + x]) setO(x, y, T.SPIRE); });
  }

  // ---------- 11. Overgrown gardens: wild flowers, hedges in broken rows, old trees, a brazier gone cold ----------
  GARDENS.forEach((g, i) => disk(g.x, g.y, g.rx, g.ry, (x, y, d) => {
    if (getO(x, y) === T.CLIFF || roads.has((y + Y0) * W + x)) return;
    setG(x, y, hash(x, y, 1401 + i) < 0.55 ? T.FLOWERS : T.TALL_GRASS);
    if (keep[y * W + x]) return;
    if (y % 3 === 0 && d > 0.15 && hash(x, y, 1411 + i) < 0.75) setO(x, y, T.BUSH); // hedge rows, gappy
    else if (hash(x, y, 1421 + i) < 0.05) setO(x, y, T.TREE);
  }));

  // ---------- 12. Scatter: old pines and oaks, brush, boulders under the cliffs, more fallen statues by the roads ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (getO(x, y) !== EMPTY || keep[y * W + x] || roads.has((y + Y0) * W + x) || getG(x, y) === T.WATER) continue;
    const h = hash(x, y, 1431), near = (dx: number, dy: number) => getO(x + dx, y + dy) === T.CLIFF;
    const foot = near(1, 0) || near(-1, 0) || near(0, 1) || near(0, -1);
    const grove = noise(x, y, 10, 1432) > 0.72;
    if (foot && h < 0.12) setO(x, y, T.ROCK);
    else if (grove && h < 0.2) setO(x, y, h < 0.09 ? T.PINE : h < 0.13 ? T.TREE : T.BUSH);
    else if (h < 0.01) setO(x, y, T.TREE);
    else if (h < 0.026) setO(x, y, T.BUSH); // brush (walk-through)
    else if (h < 0.032) setO(x, y, T.ROCK);
    else if (h < 0.036) setO(x, y, T.STUMP);
    else if (h < 0.039) setO(x, y, T.STATUE);
  }
  // the roads keep a clear verge
  for (const k of roads) {
    const x = k % W, y = ((k / W) | 0) - Y0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const o = getO(x + i, y + j); if (o === T.ROCK || o === T.BUSH || o === T.STUMP || o === T.TREE || o === T.PINE || o === T.STATUE) setO(x + i, y + j, EMPTY); }
  }
  // statues line the avenues into Tollcross (every few tiles, two off the road) and braziers stand at its corners
  for (const [x, y] of [-3, -9, -15, X.w + 2, X.w + 8, X.w + 14].flatMap((dx) => [[X.x + dx, X.y + 9], [X.x + dx, X.y + 15]])) {
    if (getO(x, y) === EMPTY && !roads.has((y + Y0) * W + x)) setO(x, y, T.STATUE);
  }
  const Q = TOLLCROSS_SQUARE;
  each(Q.x, Q.y, Q.w, Q.h, (x, y) => road(x, y, T.MARBLE));
  for (const [x, y] of [[Q.x - 1, Q.y - 1], [Q.x + Q.w, Q.y - 1], [Q.x - 1, Q.y + Q.h], [Q.x + Q.w, Q.y + Q.h]]) { setO(x, y, T.BRAZIER); roads.delete((y + Y0) * W + x); }
  // every future zone keeps a 7x7 of clear ground for a war Hold
  for (const l of CROWN_LANDS) each(l.hold[0] - 3, l.hold[1] - 3, 7, 7, (x, y) => { setO(x, y, EMPTY); open(x, y); if (getG(x, y) === T.WATER) setG(x, y, T.GRASS); });

  // ---------- 13. Reachability: every open tile joins the Crownways' arrivals (pockets cut off by rock are filled in) ----------
  const solid = (x: number, y: number) => {
    if (!inBand(x, y)) return true;
    const o = getO(x, y);
    return (o !== EMPTY && o !== T.BUSH) || getG(x, y) === T.WATER;
  };
  const seen = new Uint8Array(W * H);
  const q = CROWNWAYS.map((c) => (c.gate.y + 2) * W + c.gate.x); // the arrival spots
  for (const k of q) seen[k] = 1;
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % W, y = (q[i] / W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (solid(nx, ny) || seen[ny * W + nx]) continue;
      seen[ny * W + nx] = 1; q.push(ny * W + nx);
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!seen[y * W + x] && !solid(x, y)) setO(x, y, T.CLIFF);

  // ---------- 14. Named areas (specific first) ----------
  const A = (name: string, x: number, y: number, w: number, h: number): CrownArea => ({ name, x: Math.floor(x), y: Math.floor(y) + Y0, w: Math.ceil(w), h: Math.ceil(h) });
  const areas: CrownArea[] = [
    A("Tollcross Square", Q.x, Q.y, Q.w, Q.h),
    A("Tollcross", X.x, X.y, X.w, X.h),
    A("The Throne Hall", THRONE_HALL.x, THRONE_HALL.y, THRONE_HALL.w, THRONE_HALL.h),
    ...CROWNWAYS.map((c) => A(c.name, c.gate.x - 4, c.gate.y - 1, 9, 6)), // the dais and the arrival
    ...CROWN_LANDS.map((l) => A(l.name, l.x, l.y, l.w, l.h)),
    A("The Crown of the Marches", 0, 0, W, H),
  ];
  // signposts at the road junctions (local tiles; put on the free tile beside the nearest road)
  const wanted: { x: number; y: number; to: string[] }[] = [
    ...CROWNWAYS.map((c) => ({ x: c.gate.x + 3, y: c.gate.y + (c.gate.y > H / 2 ? -4 : 5), to: ["Tollcross", c.name] })),
    { x: X.x - 2, y: X.y + 14, to: ["Tollcross", "The Pilgrims' Way", "The Tourney Grounds"] },
    { x: X.x + X.w + 1, y: X.y + 14, to: ["Tollcross", "The Spirefall", "The Gilded Ruins"] },
    { x: 146, y: X.y + X.h + 3, to: ["The Crown Keep", "Tollcross"] },
    { x: 146, y: K.y + K.h + 4, to: ["The Sunken Courts", "The Deep Gate", "The Crown Keep"] },
  ];
  const posts: { x: number; y: number; to: string[] }[] = []; // map tiles, as shared/map.ts SIGNPOSTS wants them
  for (const p of wanted) {
    let best: [number, number] | undefined, bd = Infinity;
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      const x = p.x + i, y = p.y + j;
      if (!inBand(x, y) || getO(x, y) !== EMPTY || roads.has((y + Y0) * W + x) || !seen[y * W + x] || getG(x, y) === T.WATER) continue;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => roads.has((y + dy + Y0) * W + x + dx))) continue;
      if (CROWNWAYS.some((c) => Math.abs(x - c.gate.x) <= 1 && y >= c.gate.y && y <= c.gate.y + 3)) continue; // never on an arrival spot
      if (Math.hypot(i, j) < bd) { bd = Math.hypot(i, j); best = [x, y]; }
    }
    if (best) { setO(best[0], best[1], T.SIGNPOST); posts.push({ x: best[0], y: best[1] + Y0, to: p.to }); }
  }
  return { areas, roads, posts };
}
