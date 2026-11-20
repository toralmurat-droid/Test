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
