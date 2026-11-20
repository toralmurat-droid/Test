import { MAP_H as FULL_H, MAP_W, PLAYER_RADIUS, TILE, UNDER_END, WORLD_H, type MobKind } from "./constants";
import { CRYPT_DOOR, FLOORS, LAIRS, SEA_END, SHORTCUTS, SINKHOLE, UNDER_SHAFT, type Floor } from "./dungeon";
import { carveBorders, LAND_ROWS } from "./borders";
import { carveHighways, fortSkipBoxes, HIGHWAYS, highwayTiles } from "./highways";
import { buildDesert, D, inDesertRow, KEL_MARKET, WAYGATE_OAKVALE } from "./desert";
import { buildMoors, CAIRN_PORTAL, CAIRN_SQUARE, MOORSGATE_OAKVALE, MR } from "./moors";
import { BR, buildBadlands, REDPASS_OAKVALE, RUSTWATER_PORTAL, RUSTWATER_SQUARE } from "./badlands";
import { buildSinkholes, ROPEWELL_PORTAL, ROPEWELL_SQUARE, SINKWAY_OAKVALE, SR } from "./sinkholes";
import { buildCrown, CR, crownwayDais, crownwayFrom, TOLLCROSS_SQUARE, type TileBox } from "./crown";
import { buildCities, cityGateDais as carveCityGate, CITIES, CITY_TEMPLATE, cityAt, cityText, cityTile } from "./capitals";
import { JETTY_RUNS, SALT_BUILDINGS, SALT_HARBOUR_STREET, SALT_LANE, SALT_PIERS, SALT_RACKS, SALT_SQUARE, SALT_TOWN, SALT_UPPER_LANE } from "./saltmere";

/** Mirror Pond, in tiles (centre and radii of its water): the Songweaver's Mirror Pond Air is played on its shore (shared/songbook.ts). */
export const MIRROR_POND = { x: 24, y: 94, rx: 9, ry: 6 };

/** The overworld's rows: the world generator (and everything above ground) works on these; under them lies the Mawdeep (shared/dungeon.ts). */
const MAP_H = WORLD_H;

/**
 * Oakvale and its surroundings — the starting region (288×216 tiles).
 *
 * The world is two tile layers that share one tileset:
 *  - ground:  always filled (grass, roads, water…)
 *  - objects: EMPTY or something standing on the ground (trees, walls, roofs, props). Objects are solid except bushes.
 * The map is generated deterministically, so the server and every client build the exact same world.
 */
export const T = {
  // ground
  GRASS: 0, GRASS_DARK: 1, TALL_GRASS: 2, FLOWERS: 3, DIRT: 4, COBBLE: 5, SAND: 6, WATER: 7, BRIDGE: 8,
  FIELD: 9, CROPS: 10,
  // objects
  TREE: 11, PINE: 12, BUSH: 13, ROCK: 14, PALISADE: 15, FENCE: 16, ROOF_THATCH: 17, ROOF_RED: 18,
  ROOF_SLATE: 19, WALL_TIMBER: 20, WALL_STONE: 21, WINDOW_TIMBER: 22, WINDOW_STONE: 23, DOOR: 24, WELL: 25,
  STALL_RED: 26, STALL_BLUE: 27, BARREL: 28, CRATE: 29, ANVIL: 30, GRAVE: 31, HAY: 32, WHEEL: 33,
  CAMPFIRE: 34, RUIN: 35, SIGN: 36, STUMP: 37, FENCE_V: 38,
  // ruins of the old village
  FLOOR: 39, RUBBLE: 40, BEAM: 41, FLAGS: 42, BONFIRE: 43,
  // a wooden signpost with arrow boards (readable: see SIGNPOSTS)
  SIGNPOST: 44,
  // Act 2, the desert (shared/desert.ts): sandstone peaks, date palms, mud-brick houses and walls, nomad tents, bleached bones
  CLIFF: 45, PALM: 46, ADOBE: 47, ADOBE_WALL: 48, TENT: 49, BONES: 50,
  // Act 3, the Grey Barrow Moors (shared/moors.ts): heather and bog underfoot (walkable ground), burial mounds,
  // standing stones and heaped bones (solid objects)
  HEATHER: 51, BOG: 52, BARROW: 53, STANDING_STONE: 54, BONE_PILE: 55,
  // Act 4, the Red Badlands (shared/badlands.ts; red sand is SAND, mesas CLIFF, bones BONES, the client paints them red
  // there): cracked clay flats and dry riverbed gravel underfoot (walkable ground), stone-arch legs and cactus (solid)
  CLAY: 56, GRAVEL: 57, ARCH: 58, CACTUS: 59,
  // Act 5, the Mawdeep Sinkholes (shared/sinkholes.ts; loam cliffs are CLIFF, the client paints them brown there): moss
  // underfoot (walkable ground), sinkhole pits, Hide-Kin burrow mounds and cave mouths (solid)
  MOSS: 60, PIT: 61, BURROW: 62, CAVE: 63,
  // Act 6, the Crown of the Marches (shared/crown.ts; granite cliffs are CLIFF, the client paints them pale there):
  // cracked marble court paving underfoot (walkable ground), fallen statues, broken spires and braziers (solid)
  MARBLE: 64, STATUE: 65, SPIRE: 66, BRAZIER: 67,
} as const;
export const TILE_COUNT = 68;
export const EMPTY = -1;

/** A named region. `mobs` hints which monsters belong there (empty or missing = none, e.g. inside the village). */
export interface Area { name: string; x: number; y: number; w: number; h: number; mobs?: MobKind[] }

// ---------- deterministic noise ----------
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


// ---------- layout (tile coords) ----------

/** Oakvale's palisade bounds (tiles, inclusive). */
export const VILLAGE = { x0: 68, y0: 50, x1: 92, y1: 70 };
/** Footprints of Oakvale's two named ruins (their walls get their own art: client/src/chapelRuin.ts). */
export const CHAPEL_RUIN = { x: 87, y: 51, w: 5, h: 4 }, TANKARD_RUIN = { x: 87, y: 66, w: 5, h: 4 };
/** Where the two main roads cross the village: King's Road runs west↔east near row RY+1, North Road north↔south near column RX+1. */
export const ROADS = { RX: 79, RY: 59 };
/** Cobbled square in the middle of the ruined village. It is the safe zone. */
/** Walk-in barns (Goldenreach Farms): footprint in tiles and the open doorway columns in the front wall. */
export const BARNS = [{ x: 14, y: 38, w: 9, h: 6, door0: 17, door1: 19 }];

/** Redfang Hollow, the bandit camp: the stockade (tiles) and its three watchtowers by the gates (see shared/bandits.ts). */
/** The Whispering Woods shrine (tile), beside the Bandit Trail: the map keeps a clearing around it (shared/shrine.ts). */
export const SHRINE_SPOT = { x: 226, y: 73 };
/**
 * Carved stone waystones for fast travel (shared/portals.ts), tile of each stone's foot. The map keeps a small
 * clearing around each one. Order = the order of the travel list.
 */
export const PORTAL_SPOTS = [
  { id: "oakvale", name: "Oakvale North Gate", x: 84, y: 46 },
  { id: "farms", name: "Goldenreach Farms", x: 30, y: 63 },
  { id: "barrow", name: "Barrow Downs", x: 50, y: 145 },
  { id: "saltmere", name: "Saltmere", x: 147, y: 175 },
  { id: "ruins", name: "Old Ruins", x: 150, y: 59 },
  { id: "keep", name: "Greywatch Keep", x: 196, y: 69 },
  { id: "gravemoor", name: "Gravemoor Cemetery", x: 210, y: 120 },
  // Act 3: in the cairn-yard of Cairnwatch, the moors' outpost (shared/moors.ts)
  { id: "cairnwatch", name: "Cairnwatch", x: CAIRN_PORTAL.x, y: MR(CAIRN_PORTAL.y) },
  // Act 4: in the yard of the Rustwater Post, the badlands' outpost (shared/badlands.ts)
  { id: "rustwater", name: "Rustwater Post", x: RUSTWATER_PORTAL.x, y: BR(RUSTWATER_PORTAL.y) },
  // Act 5: in the yard of Ropewell, the sinkholes' outpost (shared/sinkholes.ts)
  { id: "ropewell", name: "Ropewell", x: ROPEWELL_PORTAL.x, y: SR(ROPEWELL_PORTAL.y) },
  // the clans' capitals (shared/capitals.ts): each city's waystone in its gate square, id `city_<clan>` (append only)
  ...CITIES.map((c) => ({ id: `city_${c.clan}`, name: cityText(c).waystone, ...cityTile(c, CITY_TEMPLATE.waystone) })),
  // More stones (Murat 2026-11-19: "more portal stones, grouped by territory"): every town and village gets one, and each
  // land at least two, on the roads by its settlements and sights (append only: the ring blocks follow this order)
  { id: "millbrook", name: "Millbrook Mill", x: 104, y: 46 },
  { id: "huntcamp", name: "Hunter's Camp", x: 38, y: 20 },
  { id: "kelashar", name: "Kel Ashar", x: 125, y: D(108) },
  { id: "palmshade", name: "Palmshade Oasis", x: 70, y: D(137) },
  { id: "mirage", name: "Mirage Wells", x: 217, y: D(120) },
  { id: "jackal", name: "Jackal Springs", x: 101, y: D(72) },
  { id: "blackwater", name: "Blackwater Fen", x: 138, y: MR(93) },
  { id: "thanesrest", name: "Thane's Rest", x: 140, y: MR(140) },
  { id: "vulture", name: "Vulture's Roost", x: 119, y: BR(71) },
  { id: "cinnabar", name: "Cinnabar Pits", x: 181, y: BR(87) },
  { id: "tunneltop", name: "Tunneltop", x: 187, y: SR(68) },
  { id: "mosslight", name: "Mosslight Fen", x: 49, y: SR(113) },
  { id: "tollcross", name: "Tollcross", x: 140, y: CR(66) },
  { id: "pilgrims", name: "The Pilgrims' Way", x: 43, y: CR(28) },
] as const;
export const REDFANG = { x: 240, y: 102, w: 24, h: 18 };
export const REDFANG_TOWERS: [number, number][] = [[254, 103], [249, 118], [241, 108]];

/**
 * The wreck of the Grey Heron on Heronwreck Strand (west coast): the ship that carried the Gloam and broke on the
 * shore, letting it loose on the valley (blob quest chain, shared/quests.ts). `x, y` = the foot of the hull sprite
 * (tile, drawn by client/src/worldProps.ts), `solid` = the hull's blocking rect in tiles (x, y, w, h).
 */
export const WRECK = { x: 27, y: 195, solid: [25, 194.3, 5.2, 1.1] as [number, number, number, number] };

export const SAFE_ZONE = { x: 74, y: 55, w: 13, h: 11 };
/** Act 2's safe zone: Kel Ashar's market (shared/desert.ts), in map tiles. */
export const DESERT_SAFE = { x: KEL_MARKET.x, y: D(KEL_MARKET.y), w: KEL_MARKET.w, h: KEL_MARKET.h };
/** Act 3's safe zone: Cairnwatch's square (shared/moors.ts), in map tiles. */
export const MOORS_SAFE = { x: CAIRN_SQUARE.x, y: MR(CAIRN_SQUARE.y), w: CAIRN_SQUARE.w, h: CAIRN_SQUARE.h };
/** Act 4's safe zone: the Rustwater Post's square (shared/badlands.ts), in map tiles. */
export const BADLANDS_SAFE = { x: RUSTWATER_SQUARE.x, y: BR(RUSTWATER_SQUARE.y), w: RUSTWATER_SQUARE.w, h: RUSTWATER_SQUARE.h };
/** Act 5's safe zone: Ropewell's square (shared/sinkholes.ts), in map tiles. */
export const SINKHOLES_SAFE = { x: ROPEWELL_SQUARE.x, y: SR(ROPEWELL_SQUARE.y), w: ROPEWELL_SQUARE.w, h: ROPEWELL_SQUARE.h };
/** Act 6's safe zone: Tollcross Square (shared/crown.ts), in map tiles. */
export const CROWN_SAFE = { x: TOLLCROSS_SQUARE.x, y: CR(TOLLCROSS_SQUARE.y), w: TOLLCROSS_SQUARE.w, h: TOLLCROSS_SQUARE.h };
/** Act 1's second safe zone: Saltmere's harbour square (shared/saltmere.ts), in map tiles. */
export const SALT_SAFE = { x: SALT_SQUARE.x, y: SALT_SQUARE.y, w: SALT_SQUARE.w, h: SALT_SQUARE.h };

/** Column of the river's center for a given row (River Ashwell, east of the village). */
/** Gullrock Cove: a fishers' smokehouse on a little bay east of Saltmere, burned and pillaged by Redfang raiders (Redfang quest chain). */
export const GULLROCK = { x: 178, y: 182, w: 28, h: 12 };
/**
 * The Hollow Throne (far north-east of the Whispering Woods): a ring of old crown-stones round a stone dais and the
 * broken throne of Ostrevar, the Hollow King, the first zone's final boss (Hollow Crown chain, shared/quests.ts).
 * `cx, cy` = the dais centre (tile), `r` = the ring of standing stones (tiles), WARDS = the three ward stones on it.
 */
export const HOLLOW = { x: 257, y: 18, w: 28, h: 25, cx: 271, cy: 31, r: 8.5 };
export const HOLLOW_WARDS: [number, number][] = [[HOLLOW.cx - 7, HOLLOW.cy + 4], [HOLLOW.cx + 7, HOLLOW.cy + 4], [HOLLOW.cx, HOLLOW.cy - 8]];

/**
 * The elemental wilds (Murat 2026-11-05): four places deep in the eastern woods where pieces of the Gloam that fled
 * the Brood Heart soaked up the land and turned elemental (blob quests 8-11, shared/quests.ts). Each has its own
 * ground (the client tints the painted ground and the trees by `el`) and its own blob. Tougher the further east.
 */
export const ELEMENT_LANDS = [
  { name: "Blightmire Fen", el: "poison", x: 150, y: 78, w: 26, h: 36 },
  { name: "Rimewater Hollow", el: "cold", x: 224, y: 3, w: 32, h: 30 },
  { name: "Cinder Scar", el: "fire", x: 248, y: 58, w: 38, h: 34 },
  { name: "Stormbreak Crags", el: "shock", x: 240, y: 132, w: 46, h: 48 },
] as const;
export type ElementLand = (typeof ELEMENT_LANDS)[number];
/** The elemental land at a tile, with how deep inside it is (0 at the edge, 1 from `fade` tiles in). */
export function elementLandAt(tx: number, ty: number, fade = 4): { land: ElementLand; k: number } | undefined {
  for (const land of ELEMENT_LANDS) {
    const d = Math.min(tx - land.x, land.x + land.w - tx, ty - land.y, land.y + land.h - ty);
    if (d > 0) return { land, k: Math.min(1, d / fade) };
  }
  return undefined;
}

export const riverCenter = (y: number) => Math.round(118 + 3 * Math.sin(y / 11) + 1.5 * Math.sin(y / 5));

/** Objects you can walk through (purely decorative, drawn over the player when they stand behind them). */
const WALKABLE_OBJECTS = new Set<number>([T.BUSH]);
/** Solid flag per tile (1 = blocks the whole tile, 2 = only a small core in its middle), filled once the world is built: the hot collision check reads one byte. */
let SOLID: Uint8Array | null = null;
/** Plain copies of the map size and tile size for the hot tile checks below: run under tsx (the tests), every use of
 *  an imported constant is a getter call, which made isSolidAt/isSolidTile a large share of each test file's load. */
const MW = MAP_W, MH = FULL_H, TS = TILE;
/**
 * Cut trees (stumps, dead trunks) only block a small core round the trunk, not their whole tile (Murat 2026-11-08:
 * hard to get through where there are cut trees). Heroes and monsters walk round them, slip between a stump and a
 * tree and pass them diagonally; the look stays the same.
 */
const SMALL_OBJECTS = new Set<number>([T.STUMP]);
/** Half-size in px of a small object's solid core (centred in its tile). Bigger than a hero's feet box (5). */
export const SMALL_CORE = 7;
export const NATURE = new Set<number>([T.TREE, T.PINE, T.BUSH, T.ROCK, T.STUMP]);

function buildWorld() {
  const grid = (v: number) => Array.from({ length: FULL_H }, () => Array<number>(MAP_W).fill(v));
  const ground = grid(T.GRASS);
  const objects = grid(EMPTY);
  const roads = new Set<number>(); // every road/bridge tile, kept clear of obstacles
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  const setG = (x: number, y: number, t: number) => { if (inMap(x, y)) ground[y][x] = t; };
  const setO = (x: number, y: number, t: number) => { if (inMap(x, y)) objects[y][x] = t; };
  const each = (x: number, y: number, w: number, h: number, f: (x: number, y: number) => void) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inMap(i, j)) f(i, j);
  };
  const disk = (cx: number, cy: number, rx: number, ry: number, f: (x: number, y: number, d: number) => void) =>
    each(Math.floor(cx - rx - 1), Math.floor(cy - ry - 1), Math.ceil(rx * 2 + 3), Math.ceil(ry * 2 + 3), (x, y) => {
      const dx = (x - cx) / rx, dy = (y - cy) / ry, d = dx * dx + dy * dy;
      if (d < 1) f(x, y, d);
    });
  const rectG = (x: number, y: number, w: number, h: number, t: number) => each(x, y, w, h, (i, j) => setG(i, j, t));
  const rectO = (x: number, y: number, w: number, h: number, t: number) => each(x, y, w, h, (i, j) => setO(i, j, t));
  const clearO = (x: number, y: number, w: number, h: number) => rectO(x, y, w, h, EMPTY);
  const isGrass = (t: number) => t === T.GRASS || t === T.GRASS_DARK || t === T.TALL_GRASS || t === T.FLOWERS;
  /** Road tile: becomes a bridge over water and clears whatever stood there. */
  const road = (x: number, y: number, w: number, h: number, t: number = T.DIRT) => each(x, y, w, h, (i, j) => {
    setG(i, j, ground[j][i] === T.WATER || ground[j][i] === T.BRIDGE ? T.BRIDGE : t);
    setO(i, j, EMPTY);
    roads.add(j * MAP_W + i);
  });
  /** Fence around a box, with openings: a list of [x, y] tiles left open. */
  const fenceBox = (x: number, y: number, w: number, h: number, gaps: [number, number][] = []) => {
    const gap = (i: number, j: number) => gaps.some(([gx, gy]) => gx === i && gy === j);
    for (let i = x; i < x + w; i++) {
      if (!gap(i, y)) setO(i, y, T.FENCE);
      if (!gap(i, y + h - 1)) setO(i, y + h - 1, T.FENCE);
    }
    for (let j = y + 1; j < y + h - 1; j++) {
      if (!gap(x, j)) setO(x, j, T.FENCE_V);
      if (!gap(x + w - 1, j)) setO(x + w - 1, j, T.FENCE_V);
    }
  };
  /** Openings of `n` tiles centered on each side of a box (for fences with several ways in). */
  const sideGaps = (x: number, y: number, w: number, h: number, n = 3): [number, number][] => {
    const g: [number, number][] = [];
    const cx = x + Math.floor((w - n) / 2), cy = y + Math.floor((h - n) / 2);
    for (let k = 0; k < n; k++) g.push([cx + k, y], [cx + k, y + h - 1], [x, cy + k], [x + w - 1, cy + k]);
    return g;
  };
  /** Roof on top, two rows of wall, door centered on the bottom row, with a clear doorstep. Returns the door tile. */
  const building = (
    x: number, y: number, w: number, h: number,
    roof: number, wall: number, win: number, upperWindows = false,
  ) => {
    rectO(x, y, w, h - 2, roof);
    rectO(x, y + h - 2, w, 2, wall);
    const door = x + Math.floor(w / 2);
    setO(door, y + h - 1, T.DOOR);
    for (const wx of [x + 1, x + w - 2]) if (wx !== door) setO(wx, y + h - 1, win);
    if (upperWindows) for (let wx = x + 1; wx < x + w - 1; wx += 2) setO(wx, y + h - 2, win);
    return { x: door, y: y + h - 1 };
  };
  const house = (x: number, y: number, w: number, h: number, roof: number = T.ROOF_THATCH) =>
    building(x, y, w, h, roof, T.WALL_TIMBER, T.WINDOW_TIMBER);
  /** Path from a door straight down to the next road. */
  const doorPath = (d: { x: number; y: number }, t: number = T.DIRT) => {
    for (let y = d.y + 1; y < MAP_H && !roads.has(y * MAP_W + d.x) && y < d.y + 24; y++) road(d.x, y, 1, 1, t);
  };

  /** Winding road through waypoints (Catmull-Rom spline), `w` tiles wide; bridges itself over water. */
  const curve = (pts: [number, number][], w: number, t: number = T.DIRT, put: (x: number, y: number, u: number) => void = (x, y) => road(x, y, 1, 1, t)) => {
    const P = [pts[0], ...pts, pts[pts.length - 1]];
    let last: [number, number] | undefined;
    for (let i = 1; i < P.length - 2; i++) {
      const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      for (let k = 0; k <= len * 4; k++) {
        const u = k / Math.max(1, len * 4), u2 = u * u, u3 = u2 * u;
        const c = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
        const x = c(p0[0], p1[0], p2[0], p3[0]), y = c(p0[1], p1[1], p2[1], p3[1]);
        const r = w / 2, cx = Math.round(x - r), cy = Math.round(y - r);
        // keep 1-wide paths 4-connected: a diagonal step gets a corner tile, so there is always a walkable way along
        const along = (i - 1 + u) / (P.length - 3); // 0..1 along the whole curve
        if (w === 1 && last && last[0] !== cx && last[1] !== cy) put(cx, last[1], along);
        last = [cx, cy];
        each(cx, cy, w, w, (i2, j2) => put(i2, j2, along));
      }
    }
  };

  const V = VILLAGE, { RX, RY } = ROADS, SQ = SAFE_ZONE;

  // ---------- 1. Ground: grass with patches of dark and tall grass, wildflowers ----------
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const n = noise(x, y, 7, 3);
    const h = hash(x, y, 9);
    ground[y][x] = n > 0.68 ? T.TALL_GRASS : n < 0.32 ? T.GRASS_DARK : h < 0.04 ? T.FLOWERS : T.GRASS;
  }

  // ---------- 2. Water: River Ashwell, Mirror Pond, and the pools of Misty Marsh ----------
  for (let y = 0; y < MAP_H; y++) {
    const cx = riverCenter(y);
    each(cx - 2, y, 4, 1, (x) => setG(x, y, T.WATER));
    for (const x of [cx - 3, cx + 2]) if (ground[y][x] !== T.WATER) setG(x, y, T.SAND);
  }
  const pond = MIRROR_POND;
  disk(pond.x, pond.y, pond.rx * 1.3, pond.ry * 1.35, (x, y) => setG(x, y, T.SAND));
  disk(pond.x, pond.y, pond.rx, pond.ry, (x, y) => setG(x, y, T.WATER));
  const marsh = { x: 36, y: 92, w: 38, h: 22 };
  each(marsh.x, marsh.y, marsh.w, marsh.h, (x, y) => {
    const n = noise(x, y, 4, 61);
    if (n > 0.72) setG(x, y, T.WATER);
    else if (n > 0.64) setG(x, y, T.SAND);
    else if (hash(x, y, 62) < 0.5) setG(x, y, n < 0.45 ? T.GRASS_DARK : T.TALL_GRASS);
  });

  // ---------- 3. Forest: a ragged border all around, groves, and the Whispering Woods east of the river ----------
  const woodsX = riverCenter(60) + 7;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (!isGrass(ground[y][x])) continue;
    const d = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
    const h = hash(x, y, 5);
    const pine = noise(x, y, 8, 31) > 0.55;
    const edge = d < 3 + noise(x, y, 6, 11) * 5;
    const woods = x >= woodsX + Math.round(noise(x, y, 5, 23) * 3) && noise(x, y, 6, 71) > 0.42;
    const grove = noise(x, y, 9, 17) > 0.72;
    if ((edge && h < 0.85) || (woods && h < (x < 160 ? 0.62 : 0.42)) || (grove && h < 0.5) || h < 0.004) setO(x, y, pine ? T.PINE : T.TREE);
    else if ((edge || woods || grove) && h < 0.75) setO(x, y, T.BUSH);
    else if (h > 0.985) setO(x, y, T.BUSH); // bushes are walk-through decoration
  }

  // ---------- 4. Clearings ----------
  clearO(V.x0 - 4, V.y0 - 4, V.x1 - V.x0 + 9, V.y1 - V.y0 + 9); // village + margin
  clearO(10, 34, 40, 46);  // farms
  disk(pond.x, pond.y, pond.rx + 4, pond.ry + 4, (x, y) => setO(x, y, EMPTY));
  clearO(86, 6, 30, 28);   // north meadow
  each(marsh.x, marsh.y, marsh.w, marsh.h, (x, y) => { if (objects[y][x] === T.TREE || objects[y][x] === T.PINE) setO(x, y, hash(x, y, 63) < 0.15 ? T.BUSH : EMPTY); });
  const quarry = { x: 86, y: 92, w: 28, h: 22 };
  clearO(quarry.x, quarry.y, quarry.w, quarry.h);
  const camp = { x: 26, y: 20 }, ruins = { x: 140, y: 60 }, tower = { x: 142, y: 22 };
  disk(camp.x, camp.y, 8, 7, (x, y) => setO(x, y, EMPTY));
  disk(ruins.x, ruins.y, 9, 8, (x, y, d) => { setO(x, y, EMPTY); if (d < 0.45 + hash(x, y, 77) * 0.2 && isGrass(ground[y][x])) setG(x, y, T.DIRT); });
  disk(tower.x, tower.y, 8, 7, (x, y) => setO(x, y, EMPTY));
  const mx = riverCenter(44) - 9; // the mill sits on the west bank
  clearO(mx - 3, 36, 13, 14);

  // ---------- 5. Roads: few and narrow, each one leading from the village to a place ----------
  // Four narrow roads leave the village gates; footpaths branch off to the smaller sights.
  const rc = riverCenter;
  const mill = { x: mx, y: 41 };
  // West Road → Goldenreach Farms (ends at the barn yard)
  curve([[V.x0 - 4, RY + 1], [52, 58], [40, 62], [28, 57], [18, 56]], 1);
  // East Road → over the bridge → the Old Ruins in the woods
  curve([[V.x1 + 4, RY + 1], [104, 63], [rc(60) - 7, 61], [rc(60) + 7, 61], [128, 57], [ruins.x, ruins.y]], 1);
  // North Road → North Meadow, where it splits for the Hunter's Camp and the Watchtower
  curve([[RX + 1, V.y0 - 4], [78, 34], [84, 24]], 1);
  curve([[84, 24], [70, 18], [60, 24], [42, 16], [camp.x, camp.y + 1]], 1);                            // Hunter's Trail
  curve([[84, 24], [98, 15], [rc(18) - 6, 18], [rc(18) + 6, 18], [130, 25], [tower.x, tower.y + 4]], 1); // Watchtower Trail
  curve([[tower.x, tower.y + 4], [146, 36], [142, 48], [ruins.x, ruins.y - 6]], 1);                      // woodland path, watchtower ↔ ruins
  // South Road → Stonecrag Quarry
  curve([[RX + 1, V.y1 + 4], [86, 82], [90, 90], [96, 96]], 1);
  curve([[96, 96], [106, 94], [rc(96) - 6, 97], [rc(96) + 6, 97], [128, 90], [136, 74], [ruins.x, ruins.y + 6]], 1); // Quarry bridge → ruins
  // Footpaths: the mill, Mirror Pond and on to the Misty Marsh
  curve([[V.x1 + 3, RY], [101, 52], [mill.x + 3, mill.y + 8], [mill.x + 3, mill.y + 6]], 1);             // Mill path
  curve([[V.x0 - 3, RY + 2], [60, 68], [56, 72], [44, 72], [36, 78], [33, 86], [42, 96], [marsh.x + 2, 101]], 1);     // Pond & Marsh path

  // ---------- 6. Oakvale: a small ruined village ----------
  // Cobbled streets meet on the square; the rest of the village is grass, dirt and rubble
  curve([[V.x0 - 4, RY + 1], [70, RY + 2], [SQ.x, RY + 1]], 1, T.COBBLE);
  curve([[SQ.x + SQ.w - 1, RY + 1], [91, RY], [V.x1 + 4, RY + 1]], 1, T.COBBLE);
  curve([[RX + 1, V.y0 - 4], [RX, 51], [RX + 1, SQ.y]], 1, T.COBBLE);
  curve([[RX + 1, SQ.y + SQ.h - 1], [RX + 2, 70], [RX + 1, V.y1 + 4]], 1, T.COBBLE);
  road(SQ.x, SQ.y, SQ.w, SQ.h, T.COBBLE);
  // Rounded corners on the square: grass creeps back in
  for (const [cx, cy] of [[SQ.x, SQ.y], [SQ.x + SQ.w - 1, SQ.y], [SQ.x, SQ.y + SQ.h - 1], [SQ.x + SQ.w - 1, SQ.y + SQ.h - 1]]) setG(cx, cy, T.GRASS);
  // A small stockade of sharpened stakes around the village, open only where the roads pass
  // Tight gates (Murat 2026-11-03): the wall stops only on the road tile itself, so each gate is a one-tile gap the watchmen can hold
  const post = (x: number, y: number) => { if (!roads.has(y * MAP_W + x)) setO(x, y, T.PALISADE); };
  for (let x = V.x0; x <= V.x1; x++) { post(x, V.y0); post(x, V.y1); }
  for (let y = V.y0 + 1; y < V.y1; y++) { post(V.x0, y); post(V.x1, y); }

  /**
   * A small roofless ruin: flagstone or plank floor, broken walls with a doorway (on the side facing the
   * square) and breaches, a little rubble. Players can walk in and around.
   */
  const ruinBuilding = (x: number, y: number, w: number, h: number, stone: boolean, doorTop: boolean, seed: number) => {
    rectG(x, y, w, h, stone ? T.FLAGS : T.FLOOR);
    const wall = stone ? T.RUIN : T.BEAM;
    const door = x + Math.floor(w / 2), doorRow = doorTop ? y : y + h - 1;
    for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) {
      const edge = i === x || j === y || i === x + w - 1 || j === y + h - 1;
      if (!edge) { if (hash(i, j, seed) < 0.12) setG(i, j, T.RUBBLE); continue; }
      const corner = (i === x || i === x + w - 1) && (j === y || j === y + h - 1);
      if (j === doorRow && i === door) { setG(i, j, T.RUBBLE); continue; }
      if (corner || noise(i, j, 2.5, seed + 1) > 0.3) setO(i, j, wall); // breaches come in runs, walls in long stretches
      else setG(i, j, T.RUBBLE); // a hole in the wall
    }
    // a little rubble spilling out of the doorway
    for (let k = 0; k < 2; k++) setG(door - 1 + Math.floor(hash(seed, k, 3) * 3), doorTop ? y - 1 : y + h, T.RUBBLE);
  };

  // Four small ruins in the corners of the stockade, doorways facing the square
  ruinBuilding(CHAPEL_RUIN.x, CHAPEL_RUIN.y, CHAPEL_RUIN.w, CHAPEL_RUIN.h, true, false, 101);  // Chapel of the Dawn
  setO(89, 52, T.GRAVE); // the old altar stone
  for (const [gx, gy] of [[95, 51], [96, 53], [95, 55]]) setO(gx, gy, T.GRAVE); // graveyard just outside
  ruinBuilding(69, 51, 5, 4, true, false, 102);  // the Smithy
  setO(71, 52, T.ANVIL);
  ruinBuilding(TANKARD_RUIN.x, TANKARD_RUIN.y, TANKARD_RUIN.w, TANKARD_RUIN.h, false, true, 103);  // The Rusty Tankard
  setO(88, 68, T.BARREL); setO(90, 68, T.CRATE);
  ruinBuilding(69, 66, 5, 4, false, true, 104);  // a cottage

  // The square: a large bonfire in the middle on a ring of hearth stones, the well, a lone stall
  rectO(RX, RY, 2, 2, T.BONFIRE);
  setO(75, 58, T.WELL);
  setO(SQ.x + SQ.w - 3, SQ.y + 1, T.STALL_RED); setO(SQ.x + SQ.w - 2, SQ.y + 1, T.STALL_RED);
  setO(SQ.x + 1, SQ.y + SQ.h - 2, T.CRATE); setO(SQ.x + 2, SQ.y + SQ.h - 2, T.BARREL);
  setO(RX - 2, SQ.y + 1, T.SIGN); // notice board
  for (const [x, y] of [[RX - 3, RY + 3], [RX + 4, RY - 2]]) setO(x, y, T.STUMP); // seats by the fire

  // Nature creeping back: a few trees and hay around the stockade
  for (const [x, y] of [[66, 56], [94, 62], [72, 73], [86, 47]]) setO(x, y, T.TREE);
  setO(90, 62, T.HAY);

  // Signposts outside the village

  // ---------- 7. Goldenreach Farms (west): barn, two fenced fields with openings on every side ----------
  // The barn is open: plank walls round a straw floor, a wide doorway in front, hay and tools inside
  for (const b of BARNS) {
    rectG(b.x, b.y, b.w, b.h, T.FLOOR);
    for (let x = b.x; x < b.x + b.w; x++) { setO(x, b.y, T.WALL_TIMBER); if (x < b.door0 || x > b.door1) setO(x, b.y + b.h - 1, T.WALL_TIMBER); }
    for (let y = b.y; y < b.y + b.h; y++) { setO(b.x, y, T.WALL_TIMBER); setO(b.x + b.w - 1, y, T.WALL_TIMBER); }
    setO(b.x + 1, b.y + 1, T.HAY); setO(b.x + 2, b.y + 1, T.HAY); setO(b.x + 1, b.y + 2, T.HAY);
    setO(b.x + b.w - 2, b.y + 1, T.CRATE); setO(b.x + b.w - 2, b.y + b.h - 2, T.BARREL); setO(b.x + b.w - 3, b.y + 1, T.HAY);
    doorPath({ x: Math.floor((b.door0 + b.door1) / 2), y: b.y + b.h - 1 });
  }
  for (const [x, y] of [[24, 40], [24, 41], [12, 42], [24, 43]]) setO(x, y, T.HAY);
  rectG(29, 39, 16, 15, T.FIELD);
  fenceBox(28, 38, 18, 17, sideGaps(28, 38, 18, 17));
  setO(33, 44, T.HAY); setO(40, 49, T.HAY);
  rectG(13, 66, 14, 9, T.CROPS);
  fenceBox(12, 65, 16, 11, sideGaps(12, 65, 16, 11));

  // ---------- 8. Millbrook watermill ----------
  const millDoor = building(mill.x, mill.y + 1, 6, 5, T.ROOF_THATCH, T.WALL_TIMBER, T.WINDOW_TIMBER);
  setO(riverCenter(44) - 2, 44, T.WHEEL);
  for (let y = 43; y <= 45; y++) for (let x = mx + 6; x <= mx + 7; x++) if (objects[y][x] === EMPTY) setO(x, y, T.WHEEL); // under the wheel's deck on pilings (client/src/millArt.ts)
  doorPath(millDoor);
  setO(mx - 1, 45, T.CRATE); setO(mx - 1, 46, T.BARREL);

  // ---------- 9. North Meadow: flowers and a few boulders ----------
  each(86, 6, 30, 28, (x, y) => {
    if (roads.has(y * MAP_W + x)) return;
    const h = hash(x, y, 41);
    if (h < 0.12) setG(x, y, T.FLOWERS);
    else if (h > 0.992) setO(x, y, T.ROCK);
    else if (h > 0.97) setO(x, y, T.BUSH);
  });

  // ---------- 10. Hunter's Camp (north-west woods) ----------
  setO(camp.x, camp.y - 3, T.CAMPFIRE);
  for (const [x, y] of [[camp.x - 2, camp.y - 3], [camp.x + 2, camp.y - 3], [camp.x, camp.y - 5]]) setO(x, y, T.STUMP);
  setO(camp.x - 5, camp.y - 4, T.HAY); setO(camp.x - 5, camp.y - 3, T.HAY); setO(camp.x + 5, camp.y - 4, T.CRATE); setO(camp.x + 5, camp.y - 3, T.BARREL);
  setO(camp.x + 3, camp.y + 3, T.SIGN);

  // ---------- 11. Old Ruins (on the King's Road, deep in the woods) and the Old Watchtower ----------
  for (const [dx, dy] of [[-6, -5], [-5, -5], [-4, -5], [-6, -4], [-6, -3], [4, -5], [5, -5], [5, -4], [4, 4], [5, 3], [-6, 3], [-5, 4]]) setO(ruins.x + dx, ruins.y + dy, T.RUIN);
  // no campfire: the dead don't camp, they build (siege works, shared/siege.ts)
  for (let a = 0; a < 16; a++) { // broken ring of the watchtower, with wide gaps
    if (a % 4 === 0 || a % 4 === 1) continue;
    const ang = (a / 16) * Math.PI * 2;
    setO(Math.round(tower.x + Math.cos(ang) * 4), Math.round(tower.y + Math.sin(ang) * 3), T.RUIN);
  }
  setO(tower.x, tower.y, T.RUIN);

  // ---------- 12. Stonecrag Quarry (south-east): bare stone, boulders around the rim ----------
  each(quarry.x, quarry.y, quarry.w, quarry.h, (x, y) => {
    if (roads.has(y * MAP_W + x) || ground[y][x] === T.WATER) return;
    const n = noise(x, y, 5, 91), edge = Math.min(x - quarry.x, y - quarry.y, quarry.x + quarry.w - 1 - x, quarry.y + quarry.h - 1 - y);
    setG(x, y, n > 0.55 ? T.COBBLE : n > 0.35 ? T.DIRT : T.SAND);
    if (edge < 2 && hash(x, y, 92) < 0.35) setO(x, y, T.ROCK);
    else if (hash(x, y, 93) < 0.015) setO(x, y, T.ROCK);
  });
  for (const [x, y] of [[96, 104], [97, 104], [104, 100], [108, 108]]) setO(x, y, T.RUIN);
  setO(100, 99, T.CRATE); setO(101, 99, T.CRATE); setO(100, 100, T.BARREL);

  // ---------- 12a. The wider world (tougher areas further from Oakvale) ----------
  // Barrow Downs (south-west): an old burial ground on dark grass, rows of graves and a ruined mausoleum
  const barrow = { x: 22, y: 126, w: 46, h: 30 };
  each(barrow.x, barrow.y, barrow.w, barrow.h, (x, y) => {
    if (objects[y][x] === T.TREE || objects[y][x] === T.PINE) setO(x, y, hash(x, y, 141) < 0.12 ? T.STUMP : EMPTY);
    if (isGrass(ground[y][x])) setG(x, y, noise(x, y, 5, 142) > 0.62 ? T.DIRT : hash(x, y, 143) < 0.7 ? T.GRASS_DARK : T.TALL_GRASS);
  });
  for (let gy = barrow.y + 4; gy < barrow.y + barrow.h - 3; gy += 3) for (let gx = barrow.x + 4; gx < barrow.x + barrow.w - 4; gx += 3) {
    if (hash(gx, gy, 144) < 0.55 && !(gx > 38 && gx < 52 && gy > 134 && gy < 146)) setO(gx, gy, T.GRAVE);
  }
  const mau = { x: 40, y: 136, w: 9, h: 7 }; // the mausoleum, doorway to the south
  rectG(mau.x, mau.y, mau.w, mau.h, T.FLAGS);
  for (let i = mau.x; i < mau.x + mau.w; i++) for (let j = mau.y; j < mau.y + mau.h; j++) {
    const edge = i === mau.x || j === mau.y || i === mau.x + mau.w - 1 || j === mau.y + mau.h - 1;
    if (!edge) { if (hash(i, j, 145) < 0.15) setG(i, j, T.RUBBLE); continue; }
    if (j === mau.y + mau.h - 1 && Math.abs(i - (mau.x + 4)) <= 1) { setG(i, j, T.RUBBLE); continue; }
    if (noise(i, j, 3, 146) > 0.28) setO(i, j, T.RUIN); else setG(i, j, T.RUBBLE);
  }
  setO(mau.x + 4, mau.y + 2, T.GRAVE); // the old king's tomb

  // Sunken Lake (south, west of the river): a wide lake with a ruined shrine on an island, reached by a boardwalk
  const lake = { x: 96, y: 146, rx: 13, ry: 8 };
  disk(lake.x, lake.y, lake.rx + 7, lake.ry + 6, (x, y) => setO(x, y, EMPTY));
  disk(lake.x, lake.y, lake.rx * 1.25, lake.ry * 1.3, (x, y) => setG(x, y, T.SAND));
  disk(lake.x, lake.y, lake.rx, lake.ry, (x, y) => setG(x, y, T.WATER));
  disk(lake.x, lake.y + 1, 3.5, 2.5, (x, y) => setG(x, y, T.GRASS));
  for (const [dx, dy] of [[-2, 0], [2, 0], [-2, 2], [2, 2]]) setO(lake.x + dx, lake.y + dy, T.RUIN);
  setO(lake.x, lake.y + 1, T.CAMPFIRE);

  // Greywatch Keep (far east, beyond the Old Ruins): a ruined castle with corner towers and a west gate
  const keep = { x: 182, y: 50, w: 22, h: 16 };
  clearO(keep.x - 6, keep.y - 6, keep.w + 12, keep.h + 12);
  rectG(keep.x, keep.y, keep.w, keep.h, T.FLAGS);
  each(keep.x - 5, keep.y - 5, keep.w + 10, keep.h + 10, (x, y) => { if (ground[y][x] !== T.FLAGS && noise(x, y, 4, 151) > 0.5) setG(x, y, T.DIRT); });
  for (let i = keep.x; i < keep.x + keep.w; i++) for (let j = keep.y; j < keep.y + keep.h; j++) {
    const edge = i === keep.x || j === keep.y || i === keep.x + keep.w - 1 || j === keep.y + keep.h - 1;
    if (!edge) { if (hash(i, j, 152) < 0.08) setG(i, j, T.RUBBLE); continue; }
    if (i === keep.x && Math.abs(j - (keep.y + 8)) <= 1) continue; // west gate
    if (i === keep.x + keep.w - 1 && Math.abs(j - (keep.y + 8)) <= 0) continue; // postern
    if (noise(i, j, 3, 153) > 0.22) setO(i, j, T.RUIN); else setG(i, j, T.RUBBLE);
  }
  for (const [tx, ty] of [[keep.x - 1, keep.y - 1], [keep.x + keep.w - 2, keep.y - 1], [keep.x - 1, keep.y + keep.h - 2], [keep.x + keep.w - 2, keep.y + keep.h - 2]]) rectO(tx, ty, 3, 3, T.RUIN);
  rectO(keep.x + 8, keep.y + 3, 6, 4, T.RUIN); clearO(keep.x + 10, keep.y + 6, 2, 1); // the broken great hall
  setO(keep.x + 11, keep.y + 5, T.GRAVE);
  setO(keep.x + 16, keep.y + 11, T.CRATE); setO(keep.x + 17, keep.y + 11, T.BARREL);

  // Thornwood (north-east, past the Watchtower): a dark pine forest with one trail through it
  const thorn = { x: 162, y: 2, w: 60, h: 38 };
  each(thorn.x, thorn.y, thorn.w, thorn.h, (x, y) => {
    if (isGrass(ground[y][x])) setG(x, y, T.GRASS_DARK);
    if (objects[y][x] === T.TREE || (objects[y][x] === EMPTY && hash(x, y, 161) < 0.08)) setO(x, y, T.PINE);
  });
  const glade = { x: 196, y: 20 };
  disk(glade.x, glade.y, 7, 5, (x, y) => { setO(x, y, EMPTY); setG(x, y, hash(x, y, 162) < 0.2 ? T.FLOWERS : T.GRASS_DARK); });
  setO(glade.x, glade.y, T.CAMPFIRE); setO(glade.x - 2, glade.y + 1, T.STUMP); setO(glade.x + 2, glade.y + 1, T.STUMP);

  // Roads into the wider world
  curve([[96, 100], [99, 112], [97, 124], [lake.x - 6, lake.y - lake.ry - 4]], 1);                  // Lake Road (from the quarry)
  curve([[lake.x - 6, lake.y - lake.ry - 4], [lake.x - 1, lake.y - lake.ry - 2], [lake.x, lake.y - 1]], 1); // boardwalk to the island
  curve([[marsh.x + 2, 101], [32, 112], [38, 124], [mau.x + 4, mau.y + mau.h + 2]], 1);             // Barrow Road (from the marsh)
  curve([[mau.x + 4, mau.y + mau.h + 2], [60, 152], [74, 148], [lake.x - lake.rx - 4, lake.y]], 1); // Downs path, barrows ↔ lake
  curve([[ruins.x + 6, ruins.y], [156, 62], [168, 58], [keep.x - 6, keep.y + 8], [keep.x + 2, keep.y + 8]], 1); // Keep Road (past the Old Ruins)
  // East of the lake (Murat 2026-11-03): a small makeshift bridge over the river, then a thin dirt trail that fades out
  // in the Whispering Woods. From there only deer trails wind on through the trees, to the Keep, Gravemoor, Redfang Hollow and Saltmere.
  curve([[lake.x + lake.rx + 4, lake.y - 2], [rc(144) - 6, 144], [rc(144) + 6, 144]], 1); // the makeshift bridge
  const makeshift: { x: number; y: number }[] = [];
  for (let x = rc(144) - 6; x <= rc(144) + 6; x++) if (ground[144][x] === T.BRIDGE) makeshift.push({ x, y: 144 });
  /** A thin dirt trail: worn bare at first, then only patches in the grass, then nothing. Kept clear of trees. */
  const fading = (x: number, y: number, u: number) => {
    if (!inMap(x, y) || ground[y][x] === T.WATER || ground[y][x] === T.BRIDGE) return;
    if (NATURE.has(objects[y][x])) setO(x, y, EMPTY);
    if (hash(x, y, 201) < 1.15 - u * 1.25 && isGrass(ground[y][x])) setG(x, y, T.DIRT);
    if (u < 0.45) roads.add(y * MAP_W + x);
  };
  /** A deer trail through the woods: no dirt, just a winding way between the trunks (bushes stay, you walk through them). */
  const deer = (x: number, y: number) => {
    if (!inMap(x, y) || ground[y][x] === T.WATER) return;
    if (objects[y][x] !== T.BUSH && NATURE.has(objects[y][x])) setO(x, y, EMPTY);
    if (isGrass(ground[y][x]) && hash(x, y, 204) < 0.22) setG(x, y, T.DIRT); // a bare, trodden patch now and then
    for (const [i, j] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) // room to pass: thin the trunks beside it
      if (inMap(i, j) && (objects[j][i] === T.TREE || objects[j][i] === T.PINE) && hash(i, j, 202) < 0.4) setO(i, j, hash(i, j, 203) < 0.5 ? T.BUSH : EMPTY);
  };
  curve([[rc(144) + 6, 144], [129, 139], [133, 134], [136, 130]], 1, T.DIRT, fading);
  const WOODS_END: [number, number] = [136, 130];
  curve([WOODS_END, [148, 126], [162, 121], [176, 118], [190, 119], [199, 121], [199, 124]], 1, T.DIRT, deer); // → Gravemoor (north gate)
  curve([[176, 118], [196, 112], [218, 110], [232, 111], [239, 111]], 1, T.DIRT, deer);                     // → Redfang Hollow (west gate)
  curve([[148, 126], [153, 110], [160, 94], [165, 78], [168, 62], [168, 59]], 1, T.DIRT, deer);              // → the Keep Road
  curve([[133, 134], [139, 148], [143, 162], [148, 172], [148, 176]], 1, T.DIRT, deer);                     // → Saltmere
  curve([[tower.x + 4, tower.y], [160, 18], [176, 24], [glade.x - 5, glade.y]], 1);                   // Thornwood trail
  curve([[glade.x + 5, glade.y], [204, 30], [200, 40], [keep.x + keep.w - 1, keep.y + 8]], 1);       // down to the keep's postern

  // ---------- 12a2. The coast and the far east ----------
  // The Saltwind Sea along the south edge: a wavy coastline with a sandy beach; River Ashwell flows into it
  const coastY = (x: number) => Math.round(196 + 3 * Math.sin(x / 11) + 2 * Math.sin(x / 5.3) + noise(x, 0, 6, 181) * 3);
  for (let x = 0; x < MAP_W; x++) {
    const cy = coastY(x);
    for (let y = cy - 4; y < MAP_H; y++) {
      if (!inMap(x, y)) continue;
      setO(x, y, EMPTY);
      if (y >= cy) setG(x, y, T.WATER);
      else if (y >= cy - 2 || hash(x, y, 182) < 0.5) setG(x, y, T.SAND);
    }
    for (let y = cy - 8; y < cy - 4; y++) if (inMap(x, y) && (objects[y][x] === T.TREE || objects[y][x] === T.PINE) && hash(x, y, 183) < 0.7) setO(x, y, hash(x, y, 184) < 0.3 ? T.BUSH : EMPTY); // thin the trees near the beach
  }

  // Saltmere (shared/saltmere.ts): Act 1's second town, a fishing village on the beach east of the river mouth. The four
  // old fishers' houses and the beach lane with its two piers; above them Upper Lane with the tavern, the chandlery and
  // the smokehouse, Harbour Street from the waystone down to the east pier, and the cobbled harbour square (a safe
  // zone) on the sand between the piers. Hedges and a few fences on the land edges, no stockade.
  const ST = SALT_TOWN, lane = SALT_LANE; // lane: the lane along the beach
  const laneW = ST.x, laneE = ST.x + ST.w - 1; // the lane's ends, where the Coast Road and the Smugglers' Path come in
  const cx0 = ST.x - 1, cx1 = ST.x + ST.w; // the clearing's west and east edge columns
  clearO(cx0, ST.y, cx1 - cx0 + 1, ST.h + 1); // the woods north of the old clearing give way too
  each(ST.x, ST.y, ST.w, coastY(143) - ST.y - 3, (x, y) => { if (isGrass(ground[y][x]) && hash(x, y, 185) < 0.3) setG(x, y, T.GRASS); });
  const saltHouses: { x: number; y: number }[] = [];
  for (const [hx, hy, roof] of [[128, 178, T.ROOF_SLATE], [135, 177, T.ROOF_THATCH], [143, 178, T.ROOF_SLATE], [150, 177, T.ROOF_THATCH]] as const)
    saltHouses.push(house(hx, hy + 1, 4, 3, roof)); // narrow two-storey fishers' houses (client/src/houseLife.ts)
  curve([[laneW, lane], [138, lane + 1], [150, lane], [laneE, lane + 1]], 1);
  for (const d of saltHouses) doorPath(d);
  const UL = SALT_UPPER_LANE, HS = SALT_HARBOUR_STREET;
  road(UL.x0, UL.y, UL.x1 - UL.x0 + 1, 1);                   // Upper Lane
  road(HS.x, HS.y0, 1, HS.y1 - HS.y0 + 1, T.COBBLE);         // Harbour Street: waystone → beach lane, beside the east pier
  road(133, UL.y + 1, 1, lane - UL.y - 1);                   // Net Alley, between the old houses down to the beach
  const ROOF = { thatch: T.ROOF_THATCH, red: T.ROOF_RED, slate: T.ROOF_SLATE } as const;
  for (const b of SALT_BUILDINGS) { // doors onto Upper Lane (or a path down to a lane)
    const stone = b.wall === "stone";
    doorPath(building(b.x, b.y, b.w, b.h, ROOF[b.roof], stone ? T.WALL_STONE : T.WALL_TIMBER, stone ? T.WINDOW_STONE : T.WINDOW_TIMBER, b.w >= 7));
  }
  for (const px of SALT_PIERS) { // piers out over the water
    const cy = coastY(px);
    road(px, lane + 1, 1, cy - lane + 5);
    road(px - 1, cy + 4, 3, 1);
    setO(px + 1, cy - 1, T.BARREL); setO(px - 1, cy - 2, T.CRATE);
  }
  const SSQ = SALT_SQUARE; // the harbour square: cobbled like Oakvale's (Act 1 paints FLAGS as grass), open to the lane above and the piers either side
  clearO(SSQ.x, SSQ.y, SSQ.w, SSQ.h); rectG(SSQ.x, SSQ.y, SSQ.w, SSQ.h, T.COBBLE);
  setO(SSQ.x + SSQ.w - 1, SSQ.y + SSQ.h - 1, T.CRATE); setO(SSQ.x + 1, SSQ.y + SSQ.h - 1, T.BARREL);
  for (const [fx, fy] of [[153, 189], [154, 189], ...SALT_RACKS]) setO(fx, fy, T.FENCE); // drying racks: nets on the beach, fish by the smokehouse
  setO(138, 183, T.WELL); setO(129, 189, T.CAMPFIRE); setO(131, 183, T.BARREL); setO(132, 183, T.CRATE); setO(159, 183, T.HAY);
  // the land edges: a hedge along the woods (open where the deer trail comes in), a fence and a hedge down the sides
  for (let x = cx0; x <= cx1; x++) if (Math.abs(x - 147.5) > 2 && objects[ST.y][x] === EMPTY) setO(x, ST.y, T.BUSH);
  for (let y = ST.y + 1; y < UL.y; y++) { setO(cx0, y, T.FENCE_V); setO(cx1, y, y < 172 ? T.BUSH : T.FENCE_V); }
  for (let y = UL.y; y < 182; y++) setO(cx1, y, T.BUSH);

  // Redfang Hollow: a bandit settlement in a clearing deep in the eastern woods, behind a crude fence
  const band = REDFANG;
  disk(band.x + band.w / 2, band.y + band.h / 2, band.w / 2 + 5, band.h / 2 + 5, (x, y, d) => {
    setO(x, y, d > 0.85 && hash(x, y, 186) < 0.3 ? T.STUMP : EMPTY);
    if (isGrass(ground[y][x])) setG(x, y, noise(x, y, 4, 187) > 0.45 ? T.DIRT : T.GRASS_DARK);
  });
  { // a crude stockade of sharpened stakes, with gates on each side and a few stakes missing
    const gaps = sideGaps(band.x, band.y, band.w, band.h, 2), gap = (i: number, j: number) => gaps.some(([gx, gy]) => gx === i && gy === j);
    each(band.x, band.y, band.w, band.h, (i, j) => {
      const edge = i === band.x || j === band.y || i === band.x + band.w - 1 || j === band.y + band.h - 1;
      const corner = (i === band.x || i === band.x + band.w - 1) && (j === band.y || j === band.y + band.h - 1);
      if (edge && !gap(i, j) && (corner || hash(i, j, 77) > 0.08)) setO(i, j, T.PALISADE);
    });
  }
  const bandHuts = [house(band.x + 2, band.y + 3, 4, 3, T.ROOF_THATCH), house(band.x + 9, band.y + 3, 5, 3, T.ROOF_RED), house(band.x + 17, band.y + 3, 4, 3, T.ROOF_THATCH)]; // tall barracks
  rectG(band.x + 1, band.y + 7, band.w - 2, 1, T.DIRT);
  for (const d of bandHuts) setG(d.x, d.y + 1, T.DIRT);
  setO(band.x + 12, band.y + 11, T.CAMPFIRE);
  setO(band.x + 3, band.y + 13, T.STALL_RED); setO(band.x + 4, band.y + 13, T.STALL_RED); // the loot pile
  // the lookouts' watchtowers stand on a stack of crates (drawn by client/src/worldProps.ts, manned per shared/bandits.ts)
  for (const [tx, ty] of REDFANG_TOWERS) setO(tx, ty, T.CRATE);
  for (const [ox, oy, t] of [[band.x + 7, band.y + 14, T.CRATE], [band.x + 8, band.y + 14, T.CRATE], [band.x + 7, band.y + 15, T.BARREL],
    [band.x + 18, band.y + 13, T.HAY], [band.x + 20, band.y + 15, T.BARREL], [band.x + 16, band.y + 15, T.STUMP], [band.x + 14, band.y + 9, T.STUMP], [band.x + 10, band.y + 9, T.STUMP]] as const) setO(ox, oy, t);

  // Gullrock Cove: the Saltmere fishers' smokehouse on the little bay east of town, burned out by Redfang raiders who
  // camp among the broken barrels of salted cod (Redfang quest chain, shared/quests.ts)
  const cove = GULLROCK;
  each(cove.x, cove.y, cove.w, cove.h, (x, y) => {
    if (objects[y][x] === T.TREE || objects[y][x] === T.PINE || objects[y][x] === T.BUSH) if (hash(x, y, 196) < 0.85) setO(x, y, EMPTY);
    if (isGrass(ground[y][x]) && noise(x, y, 3, 197) > 0.68) setG(x, y, T.DIRT);
  });
  ruinBuilding(cove.x + 8, cove.y + 2, 5, 4, false, false, 198); // the burned smokehouse
  setO(cove.x + 10, cove.y + 3, T.BARREL);
  setO(cove.x + 15, cove.y + 6, T.CAMPFIRE); // the raiders' fire
  for (const [ox, oy, t] of [[cove.x + 14, cove.y + 3, T.BARREL], [cove.x + 17, cove.y + 4, T.BARREL], [cove.x + 18, cove.y + 4, T.CRATE], [cove.x + 6, cove.y + 7, T.CRATE],
    [cove.x + 13, cove.y + 8, T.BARREL], [cove.x + 19, cove.y + 7, T.STUMP], [cove.x + 12, cove.y + 6, T.STUMP], [cove.x + 21, cove.y + 3, T.HAY]] as const) setO(ox, oy, t);
  for (const fx of [cove.x + 4, cove.x + 5, cove.x + 22, cove.x + 23]) setO(fx, cove.y + 8, T.FENCE); // net racks, half pulled down
  curve([[191, 177], [192, 181], [cove.x + 14, cove.y + 5]], 1); // the fishers' track down from the Smugglers' Path
  /** A short plank jetty out over the water (shared/saltmere.ts JETTY_RUNS), a T across its head like Saltmere's piers. */
  const jetty = (j: (typeof JETTY_RUNS)[number]) => { road(j.x, j.y0, 1, j.y1 - j.y0 + 1); road(j.x - 1, j.y1 - 1, 3, 1); };
  jetty(JETTY_RUNS[0]); // Gullrock Cove's, below the burned smokehouse

  // Roads to the new places
  curve([[lake.x + 3, lake.y + lake.ry + 3], [104, 166], [110, 174], [rc(178) - 6, 178], [rc(178) + 6, 178], [laneW, lane]], 1); // Coast Road (lake → Saltmere)
  curve([[keep.x + keep.w + 1, keep.y + 8], [216, 68], [228, 84], [band.x + band.w / 2, band.y - 2]], 1);                            // Bandit Trail (keep → Redfang)
  curve([[band.x + band.w / 2, band.y + band.h + 1], [244, 140], [222, 162], [194, 176], [170, 184], [laneE, lane + 1]], 1); // Smugglers' Path (Redfang → Saltmere)

  // Gravemoor Cemetery (deep south-eastern woods): the old valley's great burial ground, walled, with a mausoleum
  // in the middle and four crypts. The Pale Marshal raises his recruits here (skeleton quest chain, shared/quests.ts).
  const grave = { x: 182, y: 126, w: 34, h: 28 };
  disk(grave.x + grave.w / 2, grave.y + grave.h / 2, grave.w / 2 + 4, grave.h / 2 + 4, (x, y, d) => {
    setO(x, y, d > 0.8 && hash(x, y, 191) < 0.25 ? T.STUMP : EMPTY);
    if (isGrass(ground[y][x])) setG(x, y, noise(x, y, 4, 192) > 0.74 ? T.DIRT : hash(x, y, 193) < 0.75 ? T.GRASS_DARK : T.TALL_GRASS);
  });
  const gcx = grave.x + Math.floor(grave.w / 2), gcy = grave.y + Math.floor(grave.h / 2);
  // A low crumbling wall, a gate in the south and in the north
  each(grave.x, grave.y, grave.w, grave.h, (i, j) => {
    const edge = i === grave.x || j === grave.y || i === grave.x + grave.w - 1 || j === grave.y + grave.h - 1;
    if (!edge) return;
    if ((j === grave.y || j === grave.y + grave.h - 1) && Math.abs(i - gcx) <= 1) return; // gates
    if (noise(i, j, 3, 194) > 0.3) setO(i, j, T.RUIN); else setG(i, j, T.RUBBLE);
  });
  // The aisles: a cross of dirt from gate to gate, and one along each side
  rectG(gcx - 1, grave.y, 3, grave.h, T.DIRT);
  rectG(grave.x + 1, gcy, grave.w - 2, 1, T.DIRT);
  // Rows and rows of graves, the dead in ranks
  for (let gy = grave.y + 2; gy < grave.y + grave.h - 2; gy += 2) for (let gx = grave.x + 2; gx < grave.x + grave.w - 2; gx += 2) {
    if (Math.abs(gx - gcx) <= 2 || Math.abs(gy - gcy) <= 1) continue;
    if (hash(gx, gy, 195) < 0.82) setO(gx, gy, T.GRAVE);
  }
  // The mausoleum in the middle (doorway south, onto the aisle)
  const gmau = { x: gcx - 4, y: gcy - 7, w: 9, h: 6 };
  rectG(gmau.x, gmau.y, gmau.w, gmau.h, T.FLAGS);
  clearO(gmau.x - 1, gmau.y - 1, gmau.w + 2, gmau.h + 3);
  for (let i = gmau.x; i < gmau.x + gmau.w; i++) for (let j = gmau.y; j < gmau.y + gmau.h; j++) {
    const edge = i === gmau.x || j === gmau.y || i === gmau.x + gmau.w - 1 || j === gmau.y + gmau.h - 1;
    if (!edge) { if (hash(i, j, 196) < 0.12) setG(i, j, T.RUBBLE); continue; }
    if (j === gmau.y + gmau.h - 1 && Math.abs(i - gcx) <= 1) { setG(i, j, T.FLAGS); continue; }
    if (noise(i, j, 3, 197) > 0.25) setO(i, j, T.RUIN); else setG(i, j, T.RUBBLE);
  }
  setO(gcx, gmau.y + 2, T.GRAVE); // the great tomb
  // Four crypts, one in each quarter: small walled tombs with a doorway in the south wall (the quest seals it)
  for (const [fx, fy] of [[0.2, 0.25], [0.8, 0.25], [0.2, 0.78], [0.8, 0.78]] as const) {
    const cx = grave.x + Math.round(grave.w * fx), cy = grave.y + Math.round(grave.h * fy);
    clearO(cx - 3, cy - 3, 7, 7);
    rectG(cx - 2, cy - 2, 5, 5, T.FLAGS);
    each(cx - 2, cy - 2, 5, 4, (i, j) => {
      const edge = i === cx - 2 || i === cx + 2 || j === cy - 2 || j === cy + 1;
      if (edge && !(i === cx && j === cy + 1)) setO(i, j, T.RUIN);
    });
    setO(cx, cy - 1, T.GRAVE); // the sarcophagus inside
  }
  curve([[gcx, grave.y + grave.h], [gcx + 2, grave.y + grave.h + 6], [204, 167], [208, 169]], 1);  // Gravemoor Lane (to the Smugglers' Path)

  // ---------- 12a3. The west coast: Brinewood and Heronwreck Strand (the end of the Gloam's story) ----------
  // Brinewood: a salt-stunted pine wood behind the dunes, where the druids raised their last binding shrines
  const brine = { x: 4, y: 158, w: 50, h: 26 };
  each(brine.x, brine.y, brine.w, brine.h, (x, y) => {
    if (ground[y][x] === T.WATER || ground[y][x] === T.SAND) return;
    if (isGrass(ground[y][x])) setG(x, y, noise(x, y, 6, 191) > 0.66 ? T.TALL_GRASS : T.GRASS_DARK);
    if (objects[y][x] === T.TREE || (objects[y][x] === EMPTY && hash(x, y, 192) < 0.2 * (0.4 + noise(x, y, 7, 194)))) setO(x, y, T.PINE);
  });
  // Heronwreck Strand: the beach where the Grey Heron broke up. Driftwood and her spilled cargo lie along the sand.
  const strand = { x: 0, y: 184, w: 66, h: MAP_H - 184 };
  clearO(WRECK.x - 6, WRECK.y - 4, 13, 7);
  each(WRECK.x - 7, WRECK.y - 5, 15, 7, (x, y) => { if (ground[y][x] !== T.WATER && hash(x, y, 193) < 0.75) setG(x, y, T.SAND); });
  for (const [ox, oy, t] of [[WRECK.x - 5, WRECK.y - 3, T.BARREL], [WRECK.x - 4, WRECK.y - 3, T.CRATE], [WRECK.x + 5, WRECK.y - 3, T.BARREL],
    [WRECK.x + 6, WRECK.y - 2, T.CRATE], [WRECK.x - 9, WRECK.y - 1, T.BARREL], [WRECK.x + 12, WRECK.y - 2, T.CRATE], [WRECK.x - 14, WRECK.y - 3, T.STUMP]] as const)
    if (inMap(ox, oy) && ground[oy][ox] !== T.WATER) setO(ox, oy, t);
  curve([[mau.x + 4, mau.y + mau.h + 2], [42, 160], [34, 170], [30, 180], [WRECK.x, WRECK.y - 4]], 1); // Wreck Trail (barrows → Brinewood → the strand)
  jetty(JETTY_RUNS[1]); // Heronwreck Strand's, east of the wreck

  // ---------- 12a4. The elemental wilds (ELEMENT_LANDS) ----------
  const LAND = Object.fromEntries(ELEMENT_LANDS.map((l) => [l.el, l])) as Record<ElementLand["el"], ElementLand>;
  const free = (x: number, y: number) => !roads.has(y * MAP_W + x);
  // Blightmire Fen: a rotting bog of dark reeds and poisoned pools, dead trunks and thick brush
  { const L = LAND.poison;
    each(L.x, L.y, L.w, L.h, (x, y) => {
      if (!isGrass(ground[y][x])) return;
      const n = noise(x, y, 3, 301) * 0.7 + noise(x, y, 7, 306) * 0.3, edge = Math.min(x - L.x, L.x + L.w - 1 - x, y - L.y, L.y + L.h - 1 - y);
      if (n > 0.66 && edge > 2 && free(x, y)) { setG(x, y, T.WATER); setO(x, y, EMPTY); return; }
      setG(x, y, noise(x, y, 4, 302) > 0.55 ? T.TALL_GRASS : T.GRASS_DARK);
      const o = objects[y][x];
      if (o === T.TREE || o === T.PINE) setO(x, y, hash(x, y, 303) < 0.45 ? T.STUMP : hash(x, y, 304) < 0.6 ? T.BUSH : EMPTY);
      else if (o === EMPTY && hash(x, y, 305) < 0.07) setO(x, y, T.BUSH);
    }); }
  // Rimewater Hollow: a frozen hollow of frosted pines and grey boulders round a black, half-frozen tarn
  { const L = LAND.cold, cx = L.x + L.w / 2, cy = L.y + L.h / 2 + 1;
    each(L.x, L.y, L.w, L.h, (x, y) => {
      if (isGrass(ground[y][x])) setG(x, y, hash(x, y, 311) < 0.75 ? T.GRASS_DARK : T.GRASS);
      const o = objects[y][x];
      if (o === T.TREE || o === T.BUSH) setO(x, y, hash(x, y, 312) < 0.55 ? T.PINE : EMPTY);
      else if (o === EMPTY && hash(x, y, 313) < 0.025) setO(x, y, T.ROCK);
    });
    disk(cx, cy, 6.5, 4.6, (x, y, d) => { if (d < 0.8 || noise(x, y, 2, 314) > 0.4) { setG(x, y, T.WATER); setO(x, y, EMPTY); } });
    disk(cx, cy, 10, 7.5, (x, y) => { if (ground[y][x] !== T.WATER && NATURE.has(objects[y][x]) && hash(x, y, 315) < 0.8) setO(x, y, EMPTY); }); // open shore round the tarn
    curve([[glade.x + 5, glade.y - 1], [210, 15], [L.x - 2, 14], [L.x + 6, 15]], 1, T.DIRT, deer); // deer trail from the Thornwood glade
  }
  // Cinder Scar: a burned-out scar of ash and cracked earth, charred stumps and blackened boulders
  { const L = LAND.fire;
    each(L.x, L.y, L.w, L.h, (x, y) => {
      if (ground[y][x] === T.WATER) return;
      const edge = Math.min(x - L.x, L.x + L.w - 1 - x, y - L.y, L.y + L.h - 1 - y);
      if (isGrass(ground[y][x]) && edge + noise(x, y, 3, 321) * 4 > 3) setG(x, y, noise(x, y, 4, 322) > 0.5 ? T.DIRT : T.GRASS_DARK);
      const o = objects[y][x];
      if (o === T.TREE || o === T.PINE || o === T.BUSH) setO(x, y, hash(x, y, 323) < 0.35 ? T.STUMP : EMPTY);
      else if (o === EMPTY && hash(x, y, 324) < 0.03) setO(x, y, hash(x, y, 325) < 0.6 ? T.ROCK : T.STUMP);
    }); }
  // Stormbreak Crags: a high stony heath of split boulders and lightning-struck pines, where the storms break
  { const L = LAND.shock;
    each(L.x, L.y, L.w, L.h, (x, y) => {
      if (ground[y][x] === T.WATER || ground[y][x] === T.SAND) return;
      if (isGrass(ground[y][x])) setG(x, y, noise(x, y, 5, 331) > 0.6 ? T.DIRT : T.GRASS_DARK);
      const o = objects[y][x];
      // Thinned out (Murat 2026-11-08: hard to get through): fewer pines and boulders, with open heath between them
      if (o === T.TREE || o === T.BUSH) setO(x, y, hash(x, y, 332) < 0.25 ? T.PINE : hash(x, y, 333) < 0.3 ? T.STUMP : EMPTY);
      else if (o === T.PINE && hash(x, y, 336) < 0.4) setO(x, y, hash(x, y, 337) < 0.35 ? T.STUMP : EMPTY);
      else if (o === EMPTY && free(x, y) && (noise(x, y, 3, 334) > 0.8 || hash(x, y, 335) < 0.012)) setO(x, y, T.ROCK);
    }); }

  // ---------- 12b. Signposts at the gates and road junctions (directions are worked out in SIGNPOSTS) ----------
  const posts: { x: number; y: number; to: string[] }[] = [];
  /** Puts a signpost on the nearest free tile beside (not on) a road, within 3 tiles of (x, y). */
  const signpost = (x: number, y: number, to: string[]) => {
    let best: [number, number] | null = null, bd = 1e9;
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      const tx = x + i, ty = y + j;
      if (!inMap(tx, ty) || roads.has(ty * MAP_W + tx) || ground[ty][tx] === T.WATER || ground[ty][tx] === T.BRIDGE) continue;
      const o = objects[ty][tx];
      if (o !== EMPTY && !NATURE.has(o)) continue;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => roads.has((ty + b) * MAP_W + tx + a))) continue;
      const d = i * i + j * j;
      if (d < bd) { bd = d; best = [tx, ty]; }
    }
    if (!best) return;
    setO(best[0], best[1], T.SIGNPOST);
    posts.push({ x: best[0], y: best[1], to });
  };
  signpost(RX - 2, V.y0 - 4, ["North Meadow", "Hunter's Camp", "Old Watchtower", "Oakvale"]);          // north gate
  signpost(RX - 2, V.y1 + 4, ["Stonecrag Quarry", "Oakvale"]);                                       // south gate
  signpost(V.x0 - 4, RY - 1, ["Goldenreach Farms", "Mirror Pond", "Misty Marsh", "Oakvale"]);         // west gate
  signpost(V.x1 + 5, RY + 3, ["Millbrook Mill", "Old Ruins", "Oakvale"]);                            // east gate
  signpost(84, 26, ["Hunter's Camp", "Old Watchtower", "North Meadow", "Oakvale"]);                 // north fork
  signpost(36, 78, ["Mirror Pond", "Misty Marsh", "Oakvale"]);                                      // pond path
  signpost(ruins.x - 10, 58, ["Old Ruins", "Old Watchtower", "Stonecrag Quarry", "Oakvale"]);       // before the ruins
  signpost(94, 94, ["Stonecrag Quarry", "Old Ruins", "Oakvale"]);                                   // quarry
  signpost(rc(60) - 9, 59, ["Old Ruins", "Millbrook Mill", "Oakvale"]);                              // west end of the bridge
  signpost(98, 116, ["Sunken Lake", "Stonecrag Quarry", "Oakvale"]);                                // lake road
  signpost(33, 112, ["Barrow Downs", "Misty Marsh", "Oakvale"]);                                    // barrow road
  signpost(62, 151, ["Barrow Downs", "Sunken Lake"]);                                               // downs path
  signpost(44, 157, ["Brinewood", "Heronwreck Strand", "Barrow Downs"]);                            // wreck trail
  signpost(156, 61, ["Greywatch Keep", "Old Ruins", "Oakvale"]);                                    // keep road
  signpost(tower.x + 12, 20, ["Thornwood", "Old Watchtower", "Oakvale"]);                            // into the Thornwood
  signpost(202, 42, ["Greywatch Keep", "Thornwood"]);
  signpost(rc(144) + 8, 142, ["Sunken Lake", "Stonecrag Quarry"]);
  signpost(laneW - 1, lane - 1, ["Saltmere", "Sunken Lake"]);                                     // Saltmere's west end
  signpost(band.x + 7, band.y - 6, ["Redfang Hollow", "Greywatch Keep"]);               // bandit trail
  signpost(laneE + 1, lane - 1, ["Saltmere", "Redfang Hollow"]);                       // Saltmere's east end

  // ---------- 12c. Small graveyards where skeletons live (they rise from, and hide in, the graves) ----------
  const graveyard = (cx: number, cy: number, r: number, seed: number) => each(cx - r, cy - r, 2 * r + 1, 2 * r + 1, (i, j) => {
    if ((i - cx) % 2 !== 0 || (j - cy) % 2 !== 0) return; // neat rows, room to walk between them
    if (objects[j][i] !== EMPTY || ground[j][i] === T.WATER || ground[j][i] === T.DIRT || ground[j][i] === T.COBBLE) return;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (roads.has((j + dy) * MAP_W + i + dx)) return;
    if (hash(i, j, seed) < 0.85) setO(i, j, T.GRAVE);
  });
  graveyard(ruins.x + 10, ruins.y + 1, 2, 171);
  graveyard(ruins.x - 9, ruins.y + 0, 2, 172);
  graveyard(tower.x + 8, tower.y, 3, 173);
  graveyard(tower.x - 8, tower.y - 1, 3, 174);
  graveyard(quarry.x + 6, quarry.y + 16, 4, 175);
  graveyard(quarry.x + 20, quarry.y + 5, 3, 176);
  graveyard(keep.x - 3, keep.y + keep.h + 2, 3, 177);
  graveyard(keep.x + keep.w + 2, keep.y - 2, 3, 178);
  signpost(208, 168, ["Gravemoor Cemetery", "Redfang Hollow", "Saltmere"]);                           // Gravemoor Lane

  // ---------- 13. Keep every road clear, with a 1-tile verge ----------
  for (const k of roads) {
    const x = k % MAP_W, y = (k / MAP_W) | 0;
    each(x - 1, y - 1, 3, 3, (i, j) => { if (NATURE.has(objects[j][i])) setO(i, j, EMPTY); });
  }

  // A road clipping the corner of a stream leaves a lone bridge tile: make it a dirt ford instead
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (ground[y][x] !== T.BRIDGE) continue;
    const b = (i: number, j: number) => inMap(i, j) && ground[j][i] === T.BRIDGE;
    if (!b(x - 1, y) && !b(x + 1, y) && !b(x, y - 1) && !b(x, y + 1)) setG(x, y, T.DIRT);
  }

  // ---------- 13b. Broken bridges (Murat 2026-11-03): the spans to the Old Ruins and the Old Watchtower have fallen in
  // halfway across, so new heroes can't wander straight into the high-level zones. The quarry bridge further south
  // still stands, so the ruins (and the woodland path on to the watchtower) can still be reached the long way round.
  const broken: { x: number; y: number }[] = [];
  for (const by of [17, 61]) {
    const cx = rc(by);
    let x0 = cx - 6;
    while (x0 < cx + 6 && ground[by][x0] !== T.BRIDGE) x0++;
    let x1 = x0;
    while (ground[by][x1 + 1] === T.BRIDGE) x1++;
    if (ground[by][x0] !== T.BRIDGE) continue;
    const gx = x0 + Math.floor((x1 - x0 + 1) / 2); // walk at most half the span, then the planks are gone
    setG(gx, by, T.WATER);
    roads.delete(by * MAP_W + gx);
    broken.push({ x: gx, y: by });
  }

  // ---------- 13a. The forest shrine (shared/shrine.ts): a small clearing beside the Bandit Trail, deep in the Whispering Woods ----------
  disk(SHRINE_SPOT.x + 0.5, SHRINE_SPOT.y + 0.5, 3.2, 2.8, (x, y) => { if (NATURE.has(objects[y][x])) setO(x, y, EMPTY); });
  // ---------- 13b. The Hollow Throne: a clearing of dead grass and ash, a flagstone dais, the old king's throne ----------
  {
    const H = HOLLOW;
    disk(H.cx + 0.5, H.cy + 0.5, 13, 11.5, (x, y, d) => {
      setO(x, y, d > 0.85 && hash(x, y, 291) < 0.12 ? T.STUMP : EMPTY);
      if (isGrass(ground[y][x])) setG(x, y, noise(x, y, 3, 292) > 0.6 ? T.DIRT : hash(x, y, 293) < 0.8 ? T.GRASS_DARK : T.TALL_GRASS);
    });
    // the dais: worn flagstones, cracked and heaved, rubble round its rim
    disk(H.cx + 0.5, H.cy + 0.5, 6.6, 5.8, (x, y, d) => setG(x, y, d > 0.7 && hash(x, y, 294) < 0.45 ? T.RUBBLE : T.FLAGS));
    // a few dead trunks at the edge of the clearing
    for (const [ox, oy] of [[-11, -6], [10, -8], [12, 5], [-12, 6], [-4, 10]] as const) setO(H.cx + ox, H.cy + oy, T.STUMP);
    // The King's Way: an old overgrown road from the shrine on the Bandit Trail up to the throne
    curve([[SHRINE_SPOT.x + 2, SHRINE_SPOT.y - 1], [236, 66], [248, 56], [260, 47], [H.cx, H.cy + 7]], 1);
  }
  // ---------- 13c. The portal stones (shared/portals.ts): a little clearing round each ----------
  for (const p of PORTAL_SPOTS) disk(p.x + 0.5, p.y + 0.5, 2.6, 2.2, (x, y) => { if (NATURE.has(objects[y][x])) setO(x, y, EMPTY); });

  // ---------- 13c'. The old waygate south of Oakvale (Act 2, shared/act2.ts): a cracked dais of old flagstones, a path to the South Road ----------
  {
    const G = WAYGATE_OAKVALE;
    disk(G.x + 0.5, G.y + 0.5, 4.2, 3.6, (x, y, d) => {
      setO(x, y, EMPTY);
      setG(x, y, d < 0.55 ? (hash(x, y, 311) < 0.85 ? T.FLAGS : T.RUBBLE) : d < 0.8 && hash(x, y, 312) < 0.5 ? T.RUBBLE : T.GRASS_DARK);
    });
    curve([[G.x - 3, G.y + 1], [G.x - 5, G.y + 2], [87, 83]], 1);
  }
  // ---------- 13d. The Mawdeep sinkhole (shared/dungeon.ts): a ragged clearing of bare earth and stones, a path from the Redfang trail ----------
  disk(SINKHOLE.x + 0.5, SINKHOLE.y + 0.5, 4.6, 3.8, (x, y, d) => {
    setO(x, y, d > 0.8 && hash(x, y, 301) < 0.22 ? T.ROCK : EMPTY);
    if (isGrass(ground[y][x])) setG(x, y, d < 0.55 || hash(x, y, 302) < 0.5 ? T.DIRT : T.GRASS_DARK);
  });
  curve([[SINKHOLE.x, SINKHOLE.y + 3], [SINKHOLE.x + 1, SINKHOLE.y + 7], [SINKHOLE.x - 1, 108], [SINKHOLE.x, 111]], 1, T.DIRT);

  // ---------- 14. Reachability: carve through nature to any pocket the player can't reach ----------
  const solid = (x: number, y: number) => !inMap(x, y) || (objects[y][x] !== EMPTY && !WALKABLE_OBJECTS.has(objects[y][x])) || ground[y][x] === T.WATER;
  const flood = (sx: number, sy: number) => {
    const seen = new Uint8Array(MAP_W * MAP_H);
    const q = [sy * MAP_W + sx]; seen[q[0]] = 1;
    for (let i = 0; i < q.length; i++) {
      const x = q[i] % MAP_W, y = (q[i] / MAP_W) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const k = ny * MAP_W + nx;
        if (!solid(nx, ny) && !seen[k]) { seen[k] = 1; q.push(k); }
      }
    }
    return seen;
  };
  // The main area only ever grows (a carved path joins it; sealed pockets were never part of it), so it is flooded
  // once and then extended from each carved path, and the pocket search goes on from the last pocket (everything
  // before it is already reachable or solid). Same map as re-flooding every pass, but ~50x faster to build:
  // the server starts sooner after a deploy and the game loads sooner in the browser.
  const main = flood(RX + 1, RY + 1);
  const grow = (from: number[]) => {
    const q = from.filter((k) => !main[k] && !solid(k % MAP_W, (k / MAP_W) | 0));
    for (const k of q) main[k] = 1;
    for (let i = 0; i < q.length; i++) {
      const x = q[i] % MAP_W, y = (q[i] / MAP_W) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const k = ny * MAP_W + nx;
        if (!solid(nx, ny) && !main[k]) { main[k] = 1; q.push(k); }
      }
    }
  };
  let scan = 0;
  for (let pass = 0; pass < 3000; pass++) {
    let pocket = -1;
    for (let k = scan; k < MAP_W * MAP_H && pocket < 0; k++) if (!main[k] && !solid(k % MAP_W, (k / MAP_W) | 0)) pocket = k;
    if (pocket < 0) break;
    scan = pocket;
    const px = pocket % MAP_W, py = (pocket / MAP_W) | 0;
    if (Math.min(px, py, MAP_W - 1 - px, MAP_H - 1 - py) < 9) { // a hollow in the border forest: just grow it over
      const seal = flood(px, py);
      for (let k = 0; k < seal.length; k++) if (seal[k]) objects[(k / MAP_W) | 0][k % MAP_W] = hash(k, 0, 97) < 0.7 ? T.TREE : T.PINE;
      continue;
    }
    // shortest path from the pocket to the main area, allowed through nature (and fences) only
    const prev = new Int32Array(MAP_W * MAP_H).fill(-2);
    const q = [pocket]; prev[pocket] = -1;
    let hit = -1;
    for (let i = 0; i < q.length && hit < 0; i++) {
      const x = q[i] % MAP_W, y = (q[i] / MAP_W) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (!inMap(nx, ny)) continue;
        const k = ny * MAP_W + nx, o = objects[ny][nx];
        if (prev[k] !== -2 || ground[ny][nx] === T.WATER) continue;
        if (o !== EMPTY && !NATURE.has(o) && o !== T.FENCE && o !== T.FENCE_V) continue;
        prev[k] = q[i];
        if (main[k]) { hit = k; break; }
        q.push(k);
      }
    }
    if (hit < 0) { // sealed in by water or buildings: fill it so nothing spawns there
      const seal = flood(pocket % MAP_W, (pocket / MAP_W) | 0);
      for (let k = 0; k < seal.length; k++) if (seal[k]) objects[(k / MAP_W) | 0][k % MAP_W] = T.TREE;
      continue;
    }
    const path: number[] = [];
    for (let k = hit; k >= 0; k = prev[k]) { path.push(k); const x = k % MAP_W, y = (k / MAP_W) | 0; if (objects[y][x] !== EMPTY && !WALKABLE_OBJECTS.has(objects[y][x])) objects[y][x] = EMPTY; }
    grow(path);
  }

  // ---------- 14b. The moorgate at the north-east edge (Act 3, shared/act2.ts): a dais cut into the border forest
  // north of the Hollow Throne, a path down to the throne's clearing. Only trees, bushes and stones give way. Cut after
  // the reachability pass, so the rest of Act 1 stays exactly as it was; the path joins the dais to open ground.
  {
    const G = MOORSGATE_OAKVALE;
    disk(G.x + 0.5, G.y + 0.5, 3.6, 3.2, (x, y, d) => {
      if (NATURE.has(objects[y][x])) setO(x, y, EMPTY);
      if (objects[y][x] === EMPTY && ground[y][x] !== T.WATER) setG(x, y, d < 0.5 ? (hash(x, y, 321) < 0.8 ? T.FLAGS : T.RUBBLE) : d < 0.8 && hash(x, y, 322) < 0.5 ? T.RUBBLE : T.GRASS_DARK);
    });
    curve([[G.x, G.y + 3], [G.x + 1, G.y + 7], [G.x - 2, G.y + 12], [HOLLOW.cx + 3, HOLLOW.cy - 10]], 1, T.DIRT, (x, y) => { if (objects[y][x] === EMPTY || NATURE.has(objects[y][x])) road(x, y, 1, 1); });
  }
  // ---------- 14c. The Red Pass at the west edge (Act 4, shared/act2.ts): a dais cut into the border forest between
  // Mirror Pond and Barrow Downs, a short path east to the open meadow. Cut after the reachability pass like the
  // moorgate's, so the rest of Act 1 stays exactly as it was.
  {
    const G = REDPASS_OAKVALE;
    disk(G.x + 0.5, G.y + 0.5, 3.6, 3.2, (x, y, d) => {
      if (NATURE.has(objects[y][x])) setO(x, y, EMPTY);
      if (objects[y][x] === EMPTY && ground[y][x] !== T.WATER) setG(x, y, d < 0.5 ? (hash(x, y, 331) < 0.8 ? T.FLAGS : T.RUBBLE) : d < 0.8 && hash(x, y, 332) < 0.5 ? T.RUBBLE : T.GRASS_DARK);
    });
    curve([[G.x + 2, G.y + 2], [G.x + 6, G.y + 2], [G.x + 10, G.y + 1]], 1, T.DIRT, (x, y) => { if (objects[y][x] === EMPTY || NATURE.has(objects[y][x])) road(x, y, 1, 1); });
  }
  // ---------- 14d. The Sinkway on the beach south of Sunken Lake (Act 5, shared/act2.ts): a dais of old flagstones in
  // front of the cave the Hide-Kin came up by, a path north to the river road. Cut after the reachability pass like the
  // Red Pass's, so the rest of Act 1 stays exactly as it was (outside shared/sinkholes.ts SINKWAY_BOX).
  {
    const G = SINKWAY_OAKVALE;
    disk(G.x + 0.5, G.y + 0.5, 3.6, 3.2, (x, y, d) => {
      if (NATURE.has(objects[y][x])) setO(x, y, EMPTY);
      if (objects[y][x] === EMPTY && ground[y][x] !== T.WATER) setG(x, y, d < 0.5 ? (hash(x, y, 341) < 0.8 ? T.FLAGS : T.RUBBLE) : d < 0.8 && hash(x, y, 342) < 0.5 ? T.RUBBLE : T.SAND);
    });
    curve([[G.x + 1, G.y - 3], [G.x + 4, G.y - 7], [G.x + 7, G.y - 10], [G.x + 9, G.y - 12]], 1, T.DIRT, (x, y) => { if (objects[y][x] === EMPTY || NATURE.has(objects[y][x])) road(x, y, 1, 1); });
  }
  // ---------- 14e. The Greenward Gate on the coast east of Gullrock Cove (Act 6's Crownway, shared/crown.ts): a dais of
  // old flagstones under the Stormbreak Crags, a path north through the trees to the coast road. Cut after the
  // reachability pass like the Sinkway's, so the rest of Act 1 stays exactly as it was (outside its CROWNWAYS box).
  {
    const c = crownwayFrom("oakvale"), G = c.home, B = c.box;
    crownwayDais(c, ground, objects, EMPTY, T, 351, (o) => NATURE.has(o));
    curve([[G.x, G.y - 3], [G.x - 1, G.y - 7], [G.x - 2, G.y - 10], [G.x - 3, G.y - 13]], 1, T.DIRT, (x, y) => { if (x >= B.x0 && x <= B.x1 && y >= B.y0 && y <= B.y1 && (objects[y][x] === EMPTY || NATURE.has(objects[y][x]))) road(x, y, 1, 1); });
  }

  // ---------- 14f. The capitals' city gates (shared/capitals.ts CITIES `outer`): a dais of old flagstones beside each
  // clan's seat in its land, carved after the reachability pass and only inside the city's `outerBox`, so the rest of the
  // land (and its Hold and standards) stays exactly as it was. Act 1's (the Wardens', at Goldenreach Farms) is cut here; the
  // other lands' after their own bands are built (section 20b), with the same dais.
  const cityGateDais = (c: (typeof CITIES)[number]) => carveCityGate(c, T, ground, objects, EMPTY, (o) => NATURE.has(o));
  for (const c of CITIES) if (c.act === 1) cityGateDais(c);

  const areas: Area[] = [
    { name: "Market Square", ...SQ },
    { name: "Chapel of the Dawn", x: 86, y: 50, w: 12, h: 7 },
    { name: "The Rusty Tankard", x: 86, y: 65, w: 7, h: 6 },
    { name: "The Smithy", x: 68, y: 50, w: 7, h: 6 },
    { name: "Oakvale", x: V.x0, y: V.y0, w: V.x1 - V.x0 + 1, h: V.y1 - V.y0 + 1 },
    { name: "Millbrook Mill", x: mx - 3, y: 36, w: 13, h: 14 },
    { name: "Old Ruins", x: ruins.x - 9, y: ruins.y - 8, w: 19, h: 17, mobs: ["skeleton"] },
    { name: "Old Watchtower", x: tower.x - 8, y: tower.y - 7, w: 17, h: 15, mobs: ["skeleton", "skeletonmage"] },
    { name: "Hunter's Camp", x: camp.x - 8, y: camp.y - 7, w: 17, h: 15 },
    { name: "Stonecrag Quarry", ...quarry, mobs: ["skeleton"] },
    { name: "Misty Marsh", ...marsh, mobs: ["slime"] },
    { name: "Mirror Pond", x: pond.x - 13, y: pond.y - 9, w: 26, h: 18, mobs: ["slime"] },
    { name: "Goldenreach Farms", x: 10, y: 34, w: 40, h: 46, mobs: ["slime"] },
    { name: "North Meadow", x: 86, y: 4, w: 30, h: 30, mobs: ["slime"] },
    { name: "Barrow Downs", ...barrow, mobs: ["skeleton", "skeletonmage", "necromancer"] },
    { name: "Sunken Lake", x: lake.x - lake.rx - 6, y: lake.y - lake.ry - 6, w: lake.rx * 2 + 12, h: lake.ry * 2 + 12, mobs: ["slime"] },
    { name: "Greywatch Keep", x: keep.x - 6, y: keep.y - 6, w: keep.w + 12, h: keep.h + 12, mobs: ["skeleton", "skeletonmage", "necromancer"] },
    { name: "Thornwood", ...thorn, mobs: ["slime"] },
    { name: "Gravemoor Cemetery", x: grave.x - 3, y: grave.y - 3, w: grave.w + 6, h: grave.h + 6, mobs: ["skeleton", "skeletonmage", "necromancer"] },
    { name: "Saltmere", ...SALT_TOWN },
    { name: "Redfang Hollow", x: band.x - 4, y: band.y - 4, w: band.w + 8, h: band.h + 8, mobs: ["bandit"] },
    { name: "Brinewood", ...brine, mobs: ["slime"] },
    { name: "Heronwreck Strand", ...strand, mobs: ["slime"] },
    { name: "Gullrock Cove", ...GULLROCK, mobs: ["bandit"] },
    { name: "The Hollow Throne", x: HOLLOW.x, y: HOLLOW.y, w: HOLLOW.w, h: HOLLOW.h },
    { name: "Saltwind Coast", x: strand.x + strand.w, y: 184, w: MAP_W - strand.x - strand.w, h: MAP_H - 184, mobs: ["slime"] },
    ...ELEMENT_LANDS.map((l) => ({ name: l.name, x: l.x, y: l.y, w: l.w, h: l.h, mobs: [({ poison: "venomblob", cold: "frostblob", fire: "fireblob", shock: "stormblob" } as const)[l.el]] as MobKind[] })),
    { name: "River Ashwell", x: riverCenter(60) - 6, y: 0, w: 12, h: MAP_H },
    { name: "Whispering Woods", x: woodsX - 2, y: 0, w: MAP_W - woodsX + 2, h: 184, mobs: ["slime"] },
  ];
  // ---------- 15. Underground: the sea runs on past the coast, then solid rock with the Mawdeep's floors dug into it ----------
  for (let y = WORLD_H; y < FULL_H; y++) for (let x = 0; x < MAP_W; x++) {
    ground[y][x] = y < SEA_END ? T.WATER : T.DIRT;
    objects[y][x] = y < SEA_END ? EMPTY : T.ROCK;
  }
  // ---------- 16. Act 2: the desert, in its own band under the rock (shared/desert.ts) ----------
  const desert = buildDesert(T, ground, objects, EMPTY);
  for (const k of desert.roads) roads.add(k);
  /** Puts a post beside the road on the nearest free tile within 3 of (p.x, p.y) whose row `rowOk` allows (the desert's trails, the highways). */
  const placePost = (p: { x: number; y: number; to: string[] }, rowOk: (y: number) => boolean) => {
    let best: [number, number] | undefined, bd = Infinity;
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      const x = p.x + i, y = p.y + j;
      if (!rowOk(y) || objects[y][x] !== EMPTY || roads.has(y * MAP_W + x) || ground[y][x] === T.WATER) continue;
      let byRoad = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (roads.has((y + dy) * MAP_W + x + dx)) byRoad = true;
      if (byRoad && Math.hypot(i, j) < bd) { bd = Math.hypot(i, j); best = [x, y]; }
    }
    if (best) { objects[best[1]][best[0]] = T.SIGNPOST; posts.push({ x: best[0], y: best[1], to: p.to }); }
  };
  for (const p of desert.posts) placePost(p, inDesertRow); // a post beside the trail, on the nearest free tile
  // the Undercity's well-shaft in Kharsun: a ring of old paving round the black hole (shared/dungeon.ts UNDER_SHAFT)
  for (let y = UNDER_SHAFT.y - 3; y <= UNDER_SHAFT.y + 3; y++) for (let x = UNDER_SHAFT.x - 3; x <= UNDER_SHAFT.x + 3; x++) {
    const d = Math.hypot(x - UNDER_SHAFT.x, (y - UNDER_SHAFT.y) * 1.15);
    if (d > 3.2) continue;
    objects[y][x] = EMPTY;
    ground[y][x] = d < 2.2 ? (hash(x, y, 631) < 0.85 ? T.FLAGS : T.RUBBLE) : T.SAND;
  }
  // the Lantern Crypt's stair, in front of the old king's tomb in the mausoleum (shared/dungeon.ts CRYPT_DOOR)
  objects[CRYPT_DOOR.y][CRYPT_DOOR.x] = EMPTY; ground[CRYPT_DOOR.y][CRYPT_DOOR.x] = T.FLAGS;
  for (const f of FLOORS) carveFloor(f, ground, objects);
  areas.unshift(...LAIRS.map((l) => ({ ...l, mobs: [] as MobKind[] })),
    ...FLOORS.map((f) => ({ name: f.name, x: f.x, y: f.y, w: f.w, h: f.h, mobs: [] as MobKind[] })),
    { name: "Mawdeep Sinkhole", x: SINKHOLE.x - 5, y: SINKHOLE.y - 5, w: 11, h: 10 },
    { name: "The Kharsun Well", x: UNDER_SHAFT.x - 3, y: UNDER_SHAFT.y - 3, w: 7, h: 7 });
  areas.push(...desert.areas);
  // ---------- 17. Act 3: the Grey Barrow Moors, in their own band under the deep band (shared/moors.ts) ----------
  const moors = buildMoors(T, ground, objects, EMPTY);
  for (const k of moors.roads) roads.add(k);
  areas.push(...moors.areas);
  posts.push(...moors.posts); // the moors' signposts (set in shared/moors.ts)
  // ---------- 18. Act 4: the Red Badlands, in their own band under the moors (shared/badlands.ts) ----------
  const badlands = buildBadlands(T, ground, objects, EMPTY);
  for (const k of badlands.roads) roads.add(k);
  areas.push(...badlands.areas);
  posts.push(...badlands.posts);
  // ---------- 19. Act 5: the Mawdeep Sinkholes, in their own band under the badlands (shared/sinkholes.ts) ----------
  const sinkholes = buildSinkholes(T, ground, objects, EMPTY);
  for (const k of sinkholes.roads) roads.add(k);
  areas.push(...sinkholes.areas);
  posts.push(...sinkholes.posts);
  // ---------- 20. Act 6: the Crown of the Marches, in its own band under the sinkholes (shared/crown.ts) ----------
  const crown = buildCrown(T, ground, objects, EMPTY);
  for (const k of crown.roads) roads.add(k);
  areas.push(...crown.areas);
  posts.push(...crown.posts);
  // ---------- 20b. The other lands' city gates (section 14f): the Veiled's by the Sanctum, the Host's by the Muster,
  // Redfang's by Fangrock, the Hide-Kin's by Hidehall, each on open ground inside its `outerBox`
  for (const c of CITIES) if (c.act !== 1) cityGateDais(c);
  // ---------- 21. The clans' capital cities, in their own band under the Crown (shared/capitals.ts) ----------
  // (their areas go first: a city's districts and walls lie inside no other area)
  areas.unshift(...buildCities(T, ground, objects, EMPTY).areas);
  // ---------- 22. The border roads (shared/borders.ts): each land's roads run on out through its cliffs to the band's
  // edge, where the mist of the pass takes the hero on into the neighbouring land. Cut last, only inside BORDER_BOXES.
  carveBorders(ground, objects, roads, T, EMPTY);
  // ---------- 23. The land highways (shared/highways.ts): each land's main road, 3 cobbles wide, from the capital's gate
  // to its towns, villages and pass ends. Cut after everything else, so nothing overwrites it; never inside a town or
  // village, a city gate's box or round a capital's fort (there it rides the old streets), then its signposts beside it
  const skip: TileBox[] = [{ x0: V.x0 - 4, x1: V.x1 + 4, y0: V.y0 - 4, y1: V.y1 + 4 }, { x0: SALT_TOWN.x, x1: SALT_TOWN.x + SALT_TOWN.w - 1, y0: SALT_TOWN.y, y1: SALT_TOWN.y + SALT_TOWN.h - 1 },
    ...CITIES.map((c) => c.outerBox), ...fortSkipBoxes()];
  for (const h of HIGHWAYS) for (const name of h.towns) {
    const a = areas.find((o) => o.name === name);
    if (a) skip.push({ x0: a.x, x1: a.x + a.w - 1, y0: a.y, y1: a.y + a.h - 1 });
  }
  const highwayBefore = new Map<number, { g: number; o: number }>(), highways = carveHighways(ground, objects, roads, T, EMPTY, skip, undefined, highwayBefore);
  for (const h of HIGHWAYS) {
    const { y0, h: rows } = LAND_ROWS[h.land];
    for (const p of h.posts ?? []) placePost({ x: p.x, y: p.y + y0, to: p.to }, (y) => y >= y0 && y < y0 + rows);
  }
  return { ground, objects, areas, posts, roads, broken, makeshift, highways, highwaySkip: skip, highwayBefore };
}

/**
 * Digs one Mawdeep floor out of the rock: ragged chambers joined by winding tunnels, earth underfoot, old flagstones in
 * the halls the beast-folk took over, rubble along the walls. Deterministic like the rest of the world.
 */
function carveFloor(f: Floor, ground: number[][], objects: number[][]) {
  const open = (x: number, y: number) => {
    if (x <= f.x || y <= f.y || x >= f.x + f.w - 1 || y >= f.y + f.h - 1) return; // a rim of rock all round
    objects[y][x] = EMPTY;
  };
  const S = 400 + f.id * 17;
  f.chambers.forEach((c, i) => {
    const cx = f.x + c.x, cy = f.y + c.y;
    for (let y = Math.floor(cy - c.ry - 3); y <= cy + c.ry + 3; y++) for (let x = Math.floor(cx - c.rx - 3); x <= cx + c.rx + 3; x++) {
      const a = Math.atan2(y - cy, x - cx), wob = 1 + 0.18 * (noise(Math.cos(a) * 3 + i * 7, Math.sin(a) * 3, 1, S) - 0.5) * 2 + 0.08 * (hash(x, y, S + 1) - 0.5);
      const d = Math.hypot((x + 0.5 - cx) / c.rx, (y + 0.5 - cy) / c.ry);
      if (d > wob) continue;
      open(x, y);
      if (c.flags && d < 0.72 * wob && hash(x, y, S + 2) < 0.92) ground[y][x] = d > 0.6 * wob && hash(x, y, S + 3) < 0.5 ? T.RUBBLE : T.FLAGS;
    }
  });
  for (const [a, b, bend] of f.tunnels) {
    const A = f.chambers[a], B = f.chambers[b];
    const ax = f.x + A.x, ay = f.y + A.y, bx = f.x + B.x, by = f.y + B.y;
    const mx = (ax + bx) / 2 - (by - ay) * bend * 0.12, my = (ay + by) / 2 + (bx - ax) * bend * 0.12; // bend sideways
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = 1 - t;
      const px = u * u * ax + 2 * u * t * mx + t * t * bx, py = u * u * ay + 2 * u * t * my + t * t * by;
      const r = 1.15 + 0.4 * noise(px, py, 4, S + 5); // a passage two or three wide, no more
      for (let y = Math.floor(py - r - 1); y <= py + r + 1; y++) for (let x = Math.floor(px - r - 1); x <= px + r + 1; x++) {
        if (Math.hypot(x + 0.5 - px, y + 0.5 - py) <= r) open(x, y);
      }
    }
  }
  // loose rocks and rubble: stones fallen from the walls (only where they block nothing important)
  for (let y = f.y + 1; y < f.y + f.h - 1; y++) for (let x = f.x + 1; x < f.x + f.w - 1; x++) {
    if (objects[y][x] !== EMPTY) continue;
    let walls = 0;
    for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (objects[y + j][x + i] === T.ROCK) walls++;
    if (walls >= 1 && ground[y][x] === T.DIRT && hash(x, y, S + 7) < 0.35) ground[y][x] = T.RUBBLE;
  }
}

export const WORLD = buildWorld();
export const GROUND = WORLD.ground;
export const OBJECTS = WORLD.objects;
SOLID = new Uint8Array(MW * MH);
for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
  const o = OBJECTS[ty][tx];
  SOLID[ty * MW + tx] = GROUND[ty][tx] === T.WATER ? 1 : o === EMPTY || WALKABLE_OBJECTS.has(o) ? 0 : SMALL_OBJECTS.has(o) ? 2 : 1;
}
export const AREAS = WORLD.areas;
/** The land highways' paved tiles (shared/highways.ts; row * MAP_W + x): the maps draw them in their own colour. */
export const HIGHWAY_TILES: ReadonlySet<number> = WORLD.highways;
/** Where the highways stay unwidened (towns, villages, city gate boxes, capital forts), for the tests and tools/highway-route.ts. */
export const HIGHWAY_SKIP: readonly TileBox[] = WORLD.highwaySkip;

/**
 * Mawdeep gates (Murat 2026-11-05: "doors to open"; 2026-11-08: "part should be like a prison wall and only part a
 * gate, there could also be doors"): every tunnel into a lair or the Hide-Mother's den is walled across; only a gate
 * in the middle of the wall opens. Elite lairs and the den are shut by iron bars ("bars", a barred gate in a prison
 * wall); the mini-bosses' warrens by a stone wall with an iron-bound door ("door"). A hero opens one (server "door"
 * message) and it shuts again a while after nobody stands in it. Deterministic: server and clients compute the same tiles.
 */
export interface Door {
  id: string; x: number; y: number; floor: number;
  /** "bars": prison bars with a barred gate; "door": a stone wall with a wooden door; "crack": a cracked rock wall hiding a secret room (all of it breaks) */
  kind: "bars" | "door" | "crack";
  /** every tile of the wall across the tunnel (solid, except the gate's while it is open) */
  tiles: number[];
  /** the gate's tiles, in the middle of the wall */
  gate: number[];
  /** the wall's line across the tunnel (unit vector, world) */
  ax: number; ay: number;
  /** a shortcut: only worked from this side (the centre, in tiles, of the chamber it opens from) */
  from?: { x: number; y: number };
}
export const DOOR_RANGE = 1.8; // tiles from the nearest gate tile to work it
const DOOR_ROOMS: Record<number, number[]> = { 1: [7], 2: [1, 5], 3: [3, 4], 4: [5], 5: [5], 6: [5], 7: [5] };
const BARRED = new Set(["2_5", "3_3", "3_4", "5_5", "7_5"]); // the elites' lairs and the den: iron bars; the rest stout doors
function placeDoors(): Door[] {
  const out: Door[] = [];
  /** Wall the tunnel a-b across just outside chamber ci's rim. */
  const place = (f: Floor, ci: number, a: number, b: number, bend: number, kind: Door["kind"], id: string, oneWay: boolean) => {
    if (out.some((d) => d.id === id)) return;
    const C = f.chambers[ci], cx = f.x + C.x, cy = f.y + C.y;
    const ell = (x: number, y: number) => Math.hypot((x - cx) / C.rx, (y - cy) / C.ry);
    const A = f.chambers[a], B = f.chambers[b];
    const ax = f.x + A.x, ay = f.y + A.y, bx = f.x + B.x, by = f.y + B.y;
    const mx = (ax + bx) / 2 - (by - ay) * bend * 0.12, my = (ay + by) / 2 + (bx - ax) * bend * 0.12;
    const at = (t: number) => { const u = 1 - t; return [u * u * ax + 2 * u * t * mx + t * t * bx, u * u * ay + 2 * u * t * my + t * t * by]; };
    // walk out of the chamber along the tunnel until clear of its ragged rim
    let t = a === ci ? 0 : 1; const dt = a === ci ? 0.005 : -0.005;
    while (t >= 0 && t <= 1 && ell(at(t)[0], at(t)[1]) < (C.secret ? 1.35 : 1.5)) t += dt;
    const [px, py] = at(t), [qx, qy] = at(t + dt);
    const len = Math.hypot(qx - px, qy - py) || 1, ux = (qx - px) / len, uy = (qy - py) / len;
    const tiles: number[] = [];
    for (let y = Math.floor(py - 4); y <= py + 4; y++) for (let x = Math.floor(px - 4); x <= px + 4; x++) {
      const dx = x + 0.5 - px, dy = y + 0.5 - py;
      if (Math.abs(dx * ux + dy * uy) > 0.85 || Math.abs(-dx * uy + dy * ux) > 3.2) continue;
      if (SOLID![y * MAP_W + x] || ell(x + 0.5, y + 0.5) < (C.secret ? 1.05 : 1.25)) continue;
      tiles.push(y * MAP_W + x);
    }
    if (!tiles.length || out.some((d) => d.tiles.some((k) => tiles.includes(k)))) return;
    const gx = -uy, gy = ux; // across the tunnel
    const gate = kind === "crack" ? tiles : tiles.filter((k) => Math.abs(((k % MAP_W) + 0.5 - px) * gx + (((k / MAP_W) | 0) + 0.5 - py) * gy) <= 0.8);
    out.push({ id, x: px, y: py, tiles, gate, floor: f.id, ax: gx, ay: gy, kind, ...(oneWay ? { from: { x: cx, y: cy } } : {}) });
  };
  for (const f of FLOORS) {
    for (const ci of DOOR_ROOMS[f.id] ?? []) for (const [a, b, bend] of f.tunnels) {
      if (a !== ci && b !== ci) continue;
      const other = a === ci ? b : a;
      if (out.some((d) => d.id === `gate_${f.id}_${other}_${ci}`)) continue; // one gate per tunnel
      place(f, ci, a, b, bend, BARRED.has(`${f.id}_${ci}`) ? "bars" : "door", `gate_${f.id}_${ci}_${other}`, false);
    }
    // the secret rooms: the short tunnel in is walled up with cracked rock at the secret end
    f.chambers.forEach((c, ci) => {
      if (!c.secret) return;
      const tun = f.tunnels.find(([a, b]) => a === ci || b === ci);
      if (tun) place(f, ci, tun[0], tun[1], tun[2], "crack", `crack_${f.id}_${ci}`, false);
    });
    // shortcuts: a barred gate at the deep end, worked only from there
    for (const [fl, from, to] of SHORTCUTS) {
      if (fl !== f.id) continue;
      const tun = f.tunnels.find(([a, b]) => (a === from && b === to) || (a === to && b === from));
      if (tun) place(f, from, tun[0], tun[1], tun[2], "bars", `short_${f.id}_${from}_${to}`, true);
    }
  }
  return out;
}
/** True when a hero at (px, py) may work door d (a shortcut only from its own side). */
export function doorWorkable(d: Door, px: number, py: number): boolean {
  if (!d.from) return true;
  const tx = px / TILE, ty = py / TILE;
  return Math.hypot(tx - d.from.x, ty - d.from.y) < Math.hypot(d.x - d.from.x, d.y - d.from.y);
}
export const DOORS: Door[] = placeDoors();
for (const d of DOORS) for (const k of d.tiles) SOLID[k] = 1;
/** Open or shut a gate (server and client keep the same SOLID). */
export function setDoorOpen(id: string, open: boolean) {
  const d = DOORS.find((g) => g.id === id);
  if (d) for (const k of d.gate) SOLID![k] = open ? 0 : 1;
}
export const doorById = (id: unknown) => DOORS.find((d) => d.id === id);
/** Distance in tiles from (px,py) in px to the nearest tile of door d's gate. */
export function doorDist(d: Door, px: number, py: number): number {
  const tx = px / TILE, ty = py / TILE;
  let best = Infinity;
  for (const k of d.gate) best = Math.min(best, Math.hypot((k % MAP_W) + 0.5 - tx, ((k / MAP_W) | 0) + 0.5 - ty));
  return best;
}
/** Water tiles where a bridge span has collapsed (the broken bridges to the Old Ruins and the Old Watchtower). */
export const BROKEN_BRIDGES = WORLD.broken;
/** Tiles of the small makeshift bridge east of the Sunken Lake (narrow, no railings). */
export const MAKESHIFT_BRIDGES = WORLD.makeshift;

/** A readable signpost: arrows from the post towards each named place. */
/**
 * A readable signpost: one board per road leaving the spot, each with an arrow along that road and the
 * place(s) the road leads to. A post beside a plain road has two boards; a crossroads has four.
 */
export interface Signpost { x: number; y: number; dirs: { name: string; arrow: string; angle: number }[] }
const ARROWS = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"]; // by compass octant, starting east, clockwise (y points down)

/** The areas a tile lies in, in AREAS order (kept per tile: the signposts walk thousands of road tiles, the 3-wide highways most of all). */
const AREAS_AT = new Map<number, Area[]>();
function areasAt(k: number): Area[] {
  let l = AREAS_AT.get(k);
  if (!l) { const x = k % MW, y = Math.floor(k / MW); l = AREAS.filter((a) => x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h); AREAS_AT.set(k, l); }
  return l;
}
/** The highways' middle lines: a signpost reads a highway as one line along its middle, not three tiles of road. */
const HIGHWAY_MID = new Set(HIGHWAYS.flatMap((h) => [...highwayTiles(h).mid]));
function buildSignpost(p: { x: number; y: number; to: string[] }): Signpost {
  const roads = WORLD.roads, line = (k: number) => roads.has(k) && (!WORLD.highways.has(k) || HIGHWAY_MID.has(k));
  // Centre on the nearest road tile: that's the spot the boards describe
  let cx = p.x + 0.5, cy = p.y + 0.5, cd = Infinity;
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
    const x = p.x + i, y = p.y + j;
    if (line(y * MW + x) && Math.hypot(i, j) < cd) { cd = Math.hypot(i, j); cx = x + 0.5; cy = y + 0.5; }
  }
  const dist = (k: number) => Math.hypot((k % MW) + 0.5 - cx, ((k / MW) | 0) + 0.5 - cy);
  // Road tiles on a ring around the post, grouped into arcs: each arc is one road leaving the spot
  const ring: { k: number; a: number }[] = [];
  for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
    const x = Math.floor(cx) + i, y = Math.floor(cy) + j, k = y * MW + x;
    if (x < 0 || y < 0 || x >= MW || y >= MH || !line(k)) continue;
    const d = dist(k);
    if (d >= 2.5 && d <= 4) ring.push({ k, a: Math.atan2((y + 0.5) - cy, (x + 0.5) - cx) });
  }
  ring.sort((u, v) => u.a - v.a);
  const arcs: { k: number; a: number }[][] = [];
  for (const r of ring) {
    const last = arcs[arcs.length - 1];
    if (last && r.a - last[last.length - 1].a < 0.6) last.push(r); else arcs.push([r]);
  }
  if (arcs.length > 1 && ring[0].a + Math.PI * 2 - ring[ring.length - 1].a < 0.6) arcs[0].push(...arcs.pop()!); // wrap around
  // Walk each road outwards to see which places it reaches first
  const own = new Set(areasAt(p.y * MW + p.x)); // (the places the post stands in are not named on it)
  const broad = (name: string) => (AREAS.find((a) => a.name === name)!.w * AREAS.find((a) => a.name === name)!.h) >= 2500;
  const branches = arcs.map((arc) => {
    const reach = new Map<string, number>();
    const seen = new Set<number>(arc.map((r) => r.k));
    let frontier = arc.map((r) => r.k);
    for (let step = 0; frontier.length && step < 400; step++) {
      for (const k of frontier) for (const a of areasAt(k)) if (!own.has(a) && !reach.has(a.name)) reach.set(a.name, step);
      const next: number[] = [];
      for (const k of frontier) for (const n of [k + 1, k - 1, k + MW, k - MW, k + MW + 1, k + MW - 1, k - MW + 1, k - MW - 1]) {
        if (seen.has(n) || !roads.has(n) || dist(n) < 2.5) continue;
        seen.add(n); next.push(n);
      }
      frontier = next;
    }
    const sx = arc.reduce((t, r) => t + Math.cos(r.a), 0), sy = arc.reduce((t, r) => t + Math.sin(r.a), 0);
    return { angle: Math.atan2(sy, sx), reach };
  });
  // Each wanted place goes on the road that reaches it soonest; a road with none of them names the first place it reaches
  const labels = branches.map(() => [] as { name: string; d: number }[]);
  for (const name of p.to) {
    let best = -1, bd = Infinity;
    branches.forEach((b, i) => { const d = b.reach.get(name); if (d !== undefined && d < bd) { bd = d; best = i; } });
    if (best >= 0) labels[best].push({ name, d: bd });
  }
  const dirs = branches.map((b, i) => {
    let names = labels[i].sort((u, v) => u.d - v.d).slice(0, 2).map((l) => l.name);
    if (!names.length) {
      const first = [...b.reach].sort((u, v) => Number(broad(u[0])) - Number(broad(v[0])) || u[1] - v[1])[0];
      names = [first ? first[0] : "The wilds"];
    }
    const oct = Math.round(b.angle / (Math.PI / 4));
    return { name: names.join(" · "), arrow: ARROWS[(oct + 8) % 8], angle: b.angle };
  });
  return { x: p.x, y: p.y, dirs };
}
export const SIGNPOSTS: Signpost[] = WORLD.posts.map(buildSignpost);
AREAS_AT.clear();

/** The signpost within reach of a player at pixel (px, py), if any. */
export function signpostNear(px: number, py: number, reach = 1.6): Signpost | undefined {
  const tx = px / TILE, ty = py / TILE;
  return SIGNPOSTS.find((s) => Math.hypot(s.x + 0.5 - tx, s.y + 0.5 - ty) <= reach);
}

/**
 * The map as it was before the land highways (shared/highways.ts) were cut: spots worked out from the map that are saved
 * or pinned (chests, siege sites: tests/quest-steps.test.ts) are found on it, so a highway never moves them.
 */
export const groundBefore = (tx: number, ty: number): number | undefined => WORLD.highwayBefore.get(ty * MW + tx)?.g ?? GROUND[ty]?.[tx];
export const objectBefore = (tx: number, ty: number): number | undefined => WORLD.highwayBefore.get(ty * MW + tx)?.o ?? OBJECTS[ty]?.[tx];
export function solidBefore(tx: number, ty: number): boolean {
  const b = WORLD.highwayBefore.get(ty * MW + tx);
  return b ? b.g === T.WATER || (b.o !== EMPTY && !WALKABLE_OBJECTS.has(b.o)) : isSolidTile(tx, ty);
}

export function isSolidTile(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return true;
  if (SOLID && (tx | 0) === tx && (ty | 0) === ty) return SOLID[ty * MW + tx] !== 0;
  const o = OBJECTS[ty][tx];
  return (o !== EMPTY && !WALKABLE_OBJECTS.has(o)) || GROUND[ty][tx] === T.WATER;
}

/** True for a tile that only blocks a small core (a stump): a hero can pass along its sides and past its corners. */
export function isSmallObstacleTile(tx: number, ty: number): boolean {
  return !!SOLID && tx >= 0 && ty >= 0 && tx < MAP_W && ty < FULL_H && SOLID[ty * MAP_W + tx] === 2;
}

export function isSolidAt(px: number, py: number): boolean {
  const tx = Math.floor(px / TS), ty = Math.floor(py / TS);
  if (SOLID && tx >= 0 && ty >= 0 && tx < MW && ty < MH && SOLID[ty * MW + tx] === 2)
    return Math.abs(px - (tx + 0.5) * TS) < SMALL_CORE && Math.abs(py - (ty + 0.5) * TS) < SMALL_CORE;
  return isSolidTile(tx, ty);
}

/** Name of the area at a pixel position (first match wins, so specific areas come first). */
export function areaAt(px: number, py: number): string {
  return areaInfoAt(px, py)?.name ?? "Oakvale Outskirts";
}

/** The area record at a pixel position, if any. */
export function areaInfoAt(px: number, py: number): Area | undefined {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  return AREAS.find((a) => tx >= a.x && ty >= a.y && tx < a.x + a.w && ty < a.y + a.h);
}

const clearAt = (x: number, y: number, r = 6) =>
  ![[-r, -r], [r, -r], [-r, r], [r, r]].some(([dx, dy]) => isSolidAt(x + dx, y + dy));

export function randomSpawn(): { x: number; y: number } {
  // Somewhere free in the market square
  const z = SAFE_ZONE;
  for (let i = 0; i < 200; i++) {
    const x = (z.x + 1 + Math.random() * (z.w - 2)) * TILE;
    const y = (z.y + 1 + Math.random() * (z.h - 2)) * TILE;
    if (clearAt(x, y, PLAYER_RADIUS)) return { x, y };
  }
  return { x: (ROADS.RX + 1.5) * TILE, y: (ROADS.RY + 1.5) * TILE };
}

/** The market squares (Oakvale's, Saltmere's harbour square, Kel Ashar's, Cairnwatch's, the Rustwater Post's, Ropewell's, Tollcross's) and the clans' capital cities are safe zones: no damage there, and monsters will not enter. */
export function isSafeZone(px: number, py: number): boolean {
  const tx = Math.floor(px / TS), ty = Math.floor(py / TS);
  const z = SAFE_ZONE;
  if (tx >= z.x && ty >= z.y && tx < z.x + z.w && ty < z.y + z.h) return true;
  const h = SALT_SAFE; // Act 1: Saltmere's harbour square
  if (tx >= h.x && ty >= h.y && tx < h.x + h.w && ty < h.y + h.h) return true;
  const k = DESERT_SAFE; // Act 2: Kel Ashar's market
  if (tx >= k.x && ty >= k.y && tx < k.x + k.w && ty < k.y + k.h) return true;
  const m = MOORS_SAFE; // Act 3: Cairnwatch's square
  if (tx >= m.x && ty >= m.y && tx < m.x + m.w && ty < m.y + m.h) return true;
  const b = BADLANDS_SAFE; // Act 4: the Rustwater Post's square
  if (tx >= b.x && ty >= b.y && tx < b.x + b.w && ty < b.y + b.h) return true;
  const s = SINKHOLES_SAFE; // Act 5: Ropewell's square
  if (tx >= s.x && ty >= s.y && tx < s.x + s.w && ty < s.y + s.h) return true;
  const c = CROWN_SAFE; // Act 6: Tollcross Square
  if (tx >= c.x && ty >= c.y && tx < c.x + c.w && ty < c.y + c.h) return true;
  return !!cityAt(tx, ty); // the clans' capitals, walls and all (shared/capitals.ts): capitals never fall
}

/** Random walkable point outside the village palisade, where monsters live. */
export function randomOutskirtsPoint(): { x: number; y: number } {
  const v = VILLAGE;
  for (;;) {
    const tx = 2 + Math.floor(Math.random() * (MAP_W - 4));
    const ty = 2 + Math.floor(Math.random() * (MAP_H - 4));
    if (tx >= v.x0 - 2 && tx <= v.x1 + 2 && ty >= v.y0 - 2 && ty <= v.y1 + 2) continue;
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (clearAt(x, y)) return { x, y };
  }
}

/** Random walkable point inside a named area (for per-zone monster spawns). Undefined if the area has no free tile. */
export function randomPointInArea(name: string): { x: number; y: number } | undefined {
  const a = AREAS.find((z) => z.name === name);
  if (!a) return undefined;
  for (let i = 0; i < 400; i++) {
    const x = (a.x + 0.5 + Math.random() * (a.w - 1)) * TILE, y = (a.y + 0.5 + Math.random() * (a.h - 1)) * TILE;
    if (clearAt(x, y) && !isSafeZone(x, y) && areaInfoAt(x, y) === a) return { x, y };
  }
  return undefined;
}
