import { MAP_W, type Act } from "./constants";
import { LAND_ROWS } from "./borders";
import { crownPaving, type TileBox } from "./crown";

/**
 * Land highways (settlement network step 2b): each land's main road, 3 cobbled tiles wide, a tier above the 1-tile dirt
 * roads. It runs from the capital's city gate past the seat to the main town, then on to every village and every border
 * road's pass end, so a hero can follow it from the capital to any settlement of the land without leaving road.
 *
 * The legs mostly widen roads that were already there: their waypoints (local tiles of the land, like borders.ts; worked
 * out with tools/highway-route.ts, then nudged by hand off the lake shore and a lair's chest) stay within a tile of the old
 * road, so it lies under the new cobbles. Carved last (shared/map.ts, after the border roads), only on open ground: never
 * on water or a bridge (the highway narrows to the bridge), never over a house, wall, palisade, signpost or cliff (it
 * narrows round them), and not at all inside a town, a village, a city gate's box or round a capital's fort (`skip`):
 * there it rides the existing streets and gates.
 * Pure data plus the carve: no map.ts import, so the map can call it (like borders.ts).
 */
export interface HighwayLeg {
  from: string; to: string; pts: readonly [number, number][];
  /**
   * The old streets it rides through a town or village break off (round the Sunscar's oases, the camps' sand between the
   * tents, Tollcross's square above the Crown's north road): inside the skip boxes, pave its middle line one tile wide
   * where the ground is open, so the way stays whole. Never set on a leg through a city gate's or a capital fort's box.
   */
  join?: boolean;
}
export interface Highway {
  land: Act; name: string; legs: readonly HighwayLeg[];
  /** The seat's and the main town's AREAS names: every fork's signpost names both (the way home). */
  seat: string; town: string;
  /** AREAS (shared/map.ts) the highway passes through without widening: its towns and villages. */
  towns: readonly string[];
  /** Signposts at its forks and settlement exits (local tiles; placed on the nearest free tile beside the road). */
  posts?: readonly { x: number; y: number; to: string[] }[];
  /** "crown": the Crown's own flagstones and rubble (crown.ts crownPaving) instead of cobbles; what is paved already stays. */
  paving?: "crown";
}

/** Tiles each side of the middle line: the paved core is 2 * HALF + 1 wide. */
export const HIGHWAY_HALF = 1;
/** Tiles beyond the core each side where only trees, bushes, boulders, stumps, cactus and bones are cleared (the ground stays). */
export const HIGHWAY_VERGE = 1;
/** Capitals' forts (map tiles; pinned in tests/holdsites.test.ts): the highway keeps a 9x9 box round each unwidened. */
export const CAPITAL_FORTS: readonly [number, number][] = [[26, 58], [241, 355], [271, 671], [27, 867], [248, 1105]];
/** Half the side of the box round each capital fort. */
export const FORT_SKIP = 4;

export const HIGHWAYS: readonly Highway[] = [
  // Oakvale: from Hearthhold's gate at Goldenreach Farms along the West Road to Oakvale; north to Hunter's Camp, east to
  // Millbrook Mill, south-west to the Red Road, south to Stonecrag Quarry, then over the quarry bridge to the Old Ruins,
  // Greywatch Keep and the Eastmarch Pass (the Ruins bridge on the King's Road stays broken), and round the Sunken Lake
  // to Saltmere and along the coast to the Greenward Road (up to the old spur down to the pass: paved, its cleared verge
  // would pull Saltwind Coast's fort east of the river and cut the clans' Brinewood road)
  { land: 1, name: "The King's Highway", seat: "Goldenreach Farms", town: "Oakvale", towns: ["Oakvale", "Millbrook Mill", "Hunter's Camp", "Saltmere"], legs: [
    { from: "Hearthhold Gate", to: "Goldenreach Farms", pts: [[18, 53], [19, 56], [27, 56], [30, 58]] },
    { from: "Goldenreach Farms", to: "Oakvale", pts: [[30, 58], [37, 61], [44, 61], [49, 58], [59, 58], [64, 60]] },
    { from: "Goldenreach Farms", to: "Hunter's Camp", pts: [[52, 57], [52, 21], [44, 16], [36, 16], [35, 17]] },
    { from: "Oakvale", to: "Millbrook Mill", pts: [[96, 60], [95, 57], [100, 52], [104, 50]] },
    { from: "Oakvale", to: "The Red Road", pts: [[63, 60], [64, 62], [55, 72], [44, 71], [41, 72], [35, 77], [32, 85], [42, 97], [35, 104], [32, 110], [29, 113], [22, 113], [14, 121]] },
    { from: "Oakvale", to: "Stonecrag Quarry", pts: [[80, 74], [86, 82], [88, 88], [92, 94], [95, 95]] },
    { from: "Stonecrag Quarry", to: "Saltmere", pts: [[96, 96], [96, 101], [98, 103], [99, 117], [95, 128], [109, 142], [110, 143], [110, 149], [109, 150], [107, 151], [106, 152], [104, 153], [102, 154], [100, 156], [100, 160], [112, 177], [121, 177], [123, 178], [125, 176]] },
    { from: "Saltmere", to: "The Greenward Road", pts: [[163, 185], [170, 184], [194, 176], [206, 170], [209, 170], [212, 167], [222, 162], [234, 171], [246, 176], [262, 176], [272, 177]] },
    { from: "Stonecrag Quarry", to: "Old Ruins", pts: [[96, 95], [109, 94], [115, 97], [125, 97], [127, 95], [128, 87], [131, 83], [139, 66]] },
    { from: "Old Ruins", to: "The Eastmarch Pass", pts: [[139, 66], [146, 60], [157, 62], [169, 57], [202, 57], [203, 58], [206, 58], [220, 73], [222, 73], [223, 72], [228, 72], [246, 57]] },
  ], posts: [
    // forks: each names the seat and the main town (the way home) and what the other ways lead to
    { x: 52, y: 56, to: ["Goldenreach Farms", "Oakvale", "Hunter's Camp"] }, // West Road, the turn north
    { x: 50, y: 20, to: ["Goldenreach Farms", "Oakvale", "Hunter's Camp"] }, // where it meets the North Meadow road
    { x: 16, y: 119, to: ["Goldenreach Farms", "Oakvale"] }, // the Red Road's foot
    { x: 96, y: 126, to: ["Goldenreach Farms", "Oakvale", "Saltmere", "Sunken Lake"] }, // above the Sunken Lake
    { x: 110, y: 174, to: ["Goldenreach Farms", "Oakvale", "Saltmere", "Saltwind Coast"] }, // above Saltmere's bridge
    { x: 193, y: 176, to: ["Goldenreach Farms", "Oakvale", "Gullrock Cove", "Gravemoor Cemetery"] }, // the coast road east
    { x: 221, y: 162, to: ["Goldenreach Farms", "Oakvale", "Redfang Hollow", "Stormbreak Crags"] }, // where the Greenward leg leaves the old road
    { x: 146, y: 64, to: ["Goldenreach Farms", "Oakvale", "Greywatch Keep", "Old Ruins"] }, // the Old Ruins
    { x: 224, y: 74, to: ["Goldenreach Farms", "Oakvale", "Redfang Hollow", "Cinder Scar"] }, // past Greywatch Keep, the Redfang road and the Eastmarch
  ] },
  // The Sunscar: from Duskveil's gate by the Veiled Sanctum round the Sanctum's walls and south to Mirage Wells, west to
  // Kel Ashar; from Kel Ashar's north gate to Jackal Springs, on to the Ashen Pass and west through Dustrider Camp to the Sun
  // Road; from its west gate to Palmshade Oasis and the Dune Road. Round each oasis by its shore, never through the water:
  // the old trails broke off at the palms, so the legs `join` them through the camps. The Sanctum's own road east to the
  // Ashen Pass stays a track (paved, it would push the Humpback Mesas' fort off the pass)
  { land: 2, name: "The Sunscar Highway", seat: "The Veiled Sanctum", town: "Kel Ashar", towns: ["Kel Ashar", "Jackal Springs", "Palmshade Oasis", "Mirage Wells", "Dustrider Camp"], legs: [
    { from: "Duskveil Gate", to: "The Veiled Sanctum", pts: [[223, 54], [231, 53]] },
    { from: "Duskveil Gate", to: "Mirage Wells", pts: [[223, 54], [226, 54], [229, 59], [231, 61], [233, 61], [238, 66], [238, 68], [219, 94], [217, 98], [216, 108]] },
    { from: "Mirage Wells", to: "Kel Ashar", pts: [[216, 108], [205, 107], [203, 109], [204, 114], [200, 116], [192, 116], [175, 111], [171, 111], [170, 109], [162, 110], [162, 111], [158, 111], [155, 110]], join: true },
    { from: "Mirage Wells", to: "Mirage Wells' east shore", pts: [[216, 108], [219, 109], [222, 113], [222, 115], [220, 117], [219, 116]], join: true },
    { from: "Kel Ashar", to: "Jackal Springs", pts: [[148, 95], [149, 92], [148, 89], [124, 83], [109, 74], [100, 65]] },
    { from: "Jackal Springs", to: "The Ashen Pass", pts: [[100, 65], [102, 61], [99, 60], [111, 61], [118, 54], [120, 50], [126, 44], [130, 42], [135, 42], [135, 44], [137, 46], [146, 45]], join: true },
    { from: "Jackal Springs", to: "The Sun Road", pts: [[100, 65], [97, 65], [95, 67], [91, 67], [91, 65], [89, 65], [89, 64], [79, 64], [63, 67], [47, 67], [46, 68]], join: true },
    { from: "Kel Ashar", to: "The Dune Road", pts: [[131, 110], [126, 112], [121, 119], [113, 127], [107, 131], [102, 132], [94, 136], [74, 139], [70, 141], [66, 141], [64, 139], [62, 139], [57, 145], [52, 145], [51, 146], [47, 145], [46, 148], [43, 151], [42, 150]], join: true },
  ], posts: [
    { x: 227, y: 57, to: ["The Veiled Sanctum", "Kel Ashar", "Mirage Wells"] }, // under Duskveil's gate, the way round the Sanctum
    { x: 199, y: 114, to: ["The Veiled Sanctum", "Kel Ashar", "Mirage Wells"] }, // Mirage Wells' west way out
    { x: 104, y: 62, to: ["The Veiled Sanctum", "Kel Ashar", "Jackal Springs", "Dustrider Camp"] }, // Jackal Springs: north-east to the pass, west to the camp
    { x: 137, y: 48, to: ["The Veiled Sanctum", "Kel Ashar", "Jackal Springs", "The Humpback Mesas"] }, // below the Ashen Pass, where the Sanctum's road comes in
    { x: 69, y: 66, to: ["The Veiled Sanctum", "Kel Ashar", "Dustrider Camp", "Jackal Springs"] }, // Dustrider Camp's east way in
    { x: 67, y: 141, to: ["The Veiled Sanctum", "Kel Ashar", "Palmshade Oasis"] }, // Palmshade Oasis' east way in
  ] },
  // The Grey Barrow Moors: from Marrowkeep's gate east to the Host's Muster, south to the Mourning Road; from the Muster
  // down the old road west past the Drowned Hollow and Blackwater Fen to Cairnwatch, and out of its south gate to the
  // Eastmarch Pass and south-east along the flagged way to Thane's Rest and the Ashen Pass (a fork below Blackwater Fen
  // instead, the plan's, would be a new junction: its fort would go to Blackwater Fen and the Hollow Mounds lose theirs)
  { land: 3, name: "The Moors Highway", seat: "The Host's Muster", town: "Cairnwatch", towns: ["Cairnwatch"], legs: [
    { from: "Marrowkeep Gate", to: "The Host's Muster", pts: [[242, 79], [249, 85], [250, 84]] },
    { from: "The Host's Muster", to: "The Mourning Road", pts: [[250, 84], [246, 91], [250, 95], [250, 99], [257, 106]] },
    { from: "The Host's Muster", to: "Cairnwatch", pts: [[250, 84], [249, 87], [244, 92], [240, 94], [227, 97], [224, 99], [220, 100], [220, 101], [217, 101], [213, 104], [209, 105], [204, 104], [201, 108], [191, 105], [186, 105], [183, 103], [170, 100], [142, 98], [134, 96], [132, 96], [131, 98], [117, 98], [96, 105], [94, 108], [89, 108]] },
    { from: "Cairnwatch", to: "The Eastmarch Pass", pts: [[77, 118], [75, 120], [73, 121], [69, 122], [65, 123], [64, 124], [52, 124]] },
    { from: "Cairnwatch", to: "The Ashen Pass", pts: [[78, 121], [80, 120], [84, 123], [93, 126], [102, 130], [110, 138], [115, 146], [117, 143], [121, 142], [126, 137], [140, 137], [146, 144]] },
  ], posts: [
    { x: 246, y: 85, to: ["The Host's Muster", "Cairnwatch", "The Drowned Hollow"] }, // below the Muster: Marrowkeep's gate, the Mourning Road, the way west
    { x: 245, y: 94, to: ["The Host's Muster", "Cairnwatch", "The Weeping Stones"] }, // where the Mourning leg leaves the old road
    { x: 81, y: 123, to: ["The Host's Muster", "Cairnwatch", "Thane's Rest", "The Moorgate"] }, // below Cairnwatch's south gate: the Eastmarch and Thane's Rest
    { x: 138, y: 135, to: ["The Host's Muster", "Cairnwatch", "Thane's Rest"] }, // Thane's Rest, above the Ashen Pass
  ] },
  // The Red Badlands: from Scarwall's gate south round Fangrock's east wall to its east gate, then the old road east past
  // Vulture's Roost and the Cinnabar Pits to the Rustwater Post, and out of its south and east gates to the Redgate and
  // Red Road passes; from below Fangrock south down the Rattler's Way. Talon Fort is a sight up its own track
  { land: 4, name: "The Badlands Highway", seat: "Fangrock", town: "The Rustwater Post", towns: ["Fangrock", "The Rustwater Post"], legs: [
    { from: "Scarwall Gate", to: "Fangrock", pts: [[26, 44], [47, 63], [48, 76], [50, 77]] },
    { from: "Fangrock", to: "Vulture's Roost", pts: [[50, 77], [57, 76], [67, 70], [72, 70], [79, 74], [82, 74], [93, 78], [99, 78], [107, 74], [119, 74]] },
    { from: "Fangrock", to: "The Rattler's Way", pts: [[60, 73], [62, 73], [65, 76], [60, 90], [60, 98], [64, 109], [72, 125], [76, 128]] },
    { from: "Vulture's Roost", to: "The Rustwater Post", pts: [[119, 74], [120, 75], [134, 76], [150, 84], [152, 83], [157, 84], [167, 80], [174, 80], [181, 83], [187, 83], [191, 86], [200, 89], [205, 89], [207, 91], [221, 92]] },
    { from: "The Rustwater Post", to: "The Redgate Road", pts: [[234, 100], [231, 102], [231, 110]] },
    { from: "The Rustwater Post", to: "The Red Road", pts: [[246, 92], [257, 96], [260, 95], [271, 96]] },
  ], posts: [
    { x: 52, y: 79, to: ["Fangrock", "The Rustwater Post", "Gallows Canyon"] }, // by Fangrock's east gate, where Scarwall's leg comes down
    { x: 66, y: 69, to: ["Fangrock", "The Rustwater Post", "Rattlesnake Gulch", "Vulture's Roost"] }, // the Rattler's Way leaves the east road
    { x: 237, y: 101, to: ["Fangrock", "The Rustwater Post", "The Saltlick Flats"] }, // below the Rustwater Post's south gate
    { x: 250, y: 95, to: ["Fangrock", "The Rustwater Post", "The Red Pass"] }, // the Red Road east of the Post
  ] },
  // The Mawdeep Sinkholes: from Deepden's gate north to the old road east of the Great Maw, east to the Dune Road pass and
  // down into Hidehall's north gate; west along that road and round the Maw's north rim (a fork up to Tunneltop) and north
  // to Ropewell's south gate; out of its east gate to the Deep Road and its west gate into Hollowbrook Dells, south past
  // the Old Warren (round its west side, not through the burrows) to the Fen's cave road and the Rattler's Way; and down
  // the Fen trail to Mosslight Fen
  { land: 5, name: "The Sinkholes Highway", seat: "Hidehall", town: "Ropewell", towns: ["Hidehall", "Ropewell", "Tunneltop"], legs: [
    { from: "Deepden Gate", to: "Hidehall", pts: [[206, 111], [207, 99], [232, 102], [235, 103], [241, 110], [243, 117], [248, 125]] },
    { from: "Hidehall", to: "The Dune Road", pts: [[236, 104], [238, 103]] },
    { from: "Hidehall", to: "Ropewell", pts: [[207, 99], [193, 96], [189, 97], [186, 95], [166, 92], [165, 88], [160, 83], [155, 81], [144, 81], [141, 82], [137, 86], [122, 62], [122, 56], [119, 53], [119, 47], [117, 45], [116, 36]] },
    { from: "The Great Maw", to: "Tunneltop", pts: [[158, 82], [192, 70]] },
    { from: "Ropewell", to: "The Deep Road", pts: [[127, 27], [160, 34]] },
    { from: "Ropewell", to: "The Rattler's Way", pts: [[104, 28], [104, 29], [99, 31], [91, 31], [87, 33], [78, 32], [77, 33], [64, 33], [54, 35], [53, 40], [57, 44], [57, 46], [54, 57], [48, 58], [45, 62], [46, 66], [45, 79], [35, 77], [30, 73]] },
    { from: "The Rattler's Way", to: "Mosslight Fen", pts: [[45, 79], [48, 80], [49, 84], [44, 102], [44, 112]] },
  ], posts: [
    { x: 210, y: 97, to: ["Hidehall", "Ropewell", "The Great Maw"] }, // where Deepden's leg meets the old road
    { x: 241, y: 106, to: ["Hidehall", "Ropewell", "Tunneltop"] }, // below the Dune Road fork, on the way down to Hidehall (off the Hollows' war patch)
    { x: 161, y: 80, to: ["Hidehall", "Ropewell", "Tunneltop", "The Great Maw"] }, // on the Maw's rim, the way up to Tunneltop
    { x: 131, y: 29, to: ["Hidehall", "Ropewell", "Rootfall Slopes"] }, // outside Ropewell's east gate
    { x: 62, y: 36, to: ["Hidehall", "Ropewell", "Hollowbrook Dells", "Mosslight Fen"] }, // in the Dells, where the way turns south
    { x: 43, y: 81, to: ["Hidehall", "Ropewell", "Mosslight Fen"] }, // the Fen's cave road: the Rattler's Way and the Fen
  ] },
];

/** A leg's middle line in map tiles (row * MAP_W + x), in walking order, without repeats. */
export function legLine(h: Highway, leg: HighwayLeg): number[] {
  const y0 = LAND_ROWS[h.land].y0, out: number[] = [];
  for (let i = 0; i + 1 < leg.pts.length; i++) {
    const [x0, ya] = leg.pts[i], [x1, yb] = leg.pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, yb - ya) * 4));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(ya + ((yb - ya) * k) / n) + y0, t = y * MAP_W + x;
      if (out[out.length - 1] !== t) out.push(t);
    }
  }
  return out;
}

/** Every tile a highway may touch (map tiles): the middle line, the paved core round it, and the verge beyond that. */
export function highwayTiles(h: Highway): { mid: Set<number>; core: Set<number>; verge: Set<number> } {
  const mid = new Set<number>(), core = new Set<number>(), verge = new Set<number>(), { y0, h: rows } = LAND_ROWS[h.land];
  const R = HIGHWAY_HALF + HIGHWAY_VERGE, inLand = (x: number, y: number) => x >= 0 && x < MAP_W && y >= y0 && y < y0 + rows;
  for (const leg of h.legs) for (const t of legLine(h, leg)) mid.add(t);
  for (const t of mid) {
    const x = t % MAP_W, y = Math.floor(t / MAP_W);
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
      if (!inLand(x + i, y + j)) continue;
      const k = (y + j) * MAP_W + x + i;
      if (Math.max(Math.abs(i), Math.abs(j)) <= HIGHWAY_HALF) core.add(k); else verge.add(k);
    }
  }
  for (const k of core) verge.delete(k);
  return { mid, core, verge };
}

/** The tiles round a highway's signpost spot the post may land on (it takes the nearest free tile within 3). */
const postBox = (h: Highway, p: { x: number; y: number }): TileBox => {
  const y = p.y + LAND_ROWS[h.land].y0;
  return { x0: p.x - 3, x1: p.x + 3, y0: y - 3, y1: y + 3 };
};

/** Every tile the highways (and their signposts) may change: the map hash tests mask these. */
export const HIGHWAY_MASK: Set<number> = (() => {
  const s = new Set<number>();
  for (const h of HIGHWAYS) {
    const { core, verge } = highwayTiles(h);
    for (const k of core) s.add(k);
    for (const k of verge) s.add(k);
    for (const p of h.posts ?? []) { const b = postBox(h, p); for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) s.add(y * MAP_W + x); }
  }
  return s;
})();

/** The boxes the carve leaves alone: a capital fort's (see CAPITAL_FORTS). The map adds its towns, villages and city gates. */
export const fortSkipBoxes = (): TileBox[] => CAPITAL_FORTS.map(([x, y]) => ({ x0: x - FORT_SKIP, x1: x + FORT_SKIP, y0: y - FORT_SKIP, y1: y + FORT_SKIP }));

type HighwayT = { COBBLE: number; WATER: number; BRIDGE: number; TREE: number; PINE: number; BUSH: number; ROCK: number; STUMP: number; CACTUS: number; BONES: number; FLAGS: number; RUBBLE: number; MARBLE: number };

/**
 * Cuts the highways into the built map (shared/map.ts, after the border roads; tests pass `lands` to cut one band).
 * Core: cobbles (the Crown's paving there), nature cleared, every tile a road. Verge: nature cleared only. Nothing changes
 * inside `skip` (but a `join` leg's middle line), on water or a bridge, or under any object that is not nature. Returns the
 * paved tiles (and keeps what each changed tile was in `before`). Deterministic, no randomness.
 */
export function carveHighways(ground: number[][], objects: number[][], roads: Set<number>, T: HighwayT, EMPTY: number, skip: readonly TileBox[], lands?: readonly Act[], before?: Map<number, { g: number; o: number }>): Set<number> {
  const nature = new Set<number>([T.TREE, T.PINE, T.BUSH, T.ROCK, T.STUMP, T.CACTUS, T.BONES]), paved = new Set<number>();
  const skipped = (x: number, y: number) => skip.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
  for (const h of HIGHWAYS) {
    if (lands && !lands.includes(h.land)) continue;
    const { core, verge } = highwayTiles(h), y0 = LAND_ROWS[h.land].y0, paving = new Set<number>([T.FLAGS, T.RUBBLE, T.MARBLE]);
    const joins = new Set<number>();
    for (const leg of h.legs) if (leg.join) for (const k of legLine(h, leg)) if (skipped(k % MAP_W, Math.floor(k / MAP_W))) joins.add(k);
    for (const [set, pave, inSkip] of [[verge, false, false], [core, true, false], [joins, true, true]] as const) for (const k of [...set].sort((a, b) => a - b)) {
      const x = k % MAP_W, y = Math.floor(k / MAP_W), g = ground[y][x], o = objects[y][x];
      if (skipped(x, y) !== inSkip || g === T.WATER || g === T.BRIDGE || (o !== EMPTY && !nature.has(o))) continue;
      if (inSkip && roads.has(k)) continue; // a street already: ride it as it is
      if (before && !before.has(k) && (o !== EMPTY || pave)) before.set(k, { g, o });
      objects[y][x] = EMPTY;
      if (!pave) continue;
      ground[y][x] = h.paving === "crown" ? (paving.has(g) ? g : crownPaving(x, y - y0, T)) : T.COBBLE;
      roads.add(k); paved.add(k);
    }
  }
  return paved;
}
