import { MAP_W, type Act } from "./constants";
import { buildCity, CITIES, cityGates, citySideGates, plotBox, type City, type CityArea, type CityTiles } from "./capitals";
import { highwayTiles, type Highway } from "./highways";
import { LAND_ROWS } from "./borders";
import type { TileBox } from "./crown";
import type { ClanKey } from "./war/clans";

/**
 * The clans' cities in their homelands (settlement network step 5): a city with a `site` (shared/capitals.ts) is built
 * into its land's map instead of the band, with an apron of cleared ground round its walls, its gates opened onto
 * the land's roads and highways, and whatever stood in the way cut back. Carved after the border roads and before the
 * highways (shared/map.ts section 22b), only inside CITY_MASK; what it changed is kept (`before`: chests and siege sites
 * read the map from before it, so none ever moves). Pure data plus the carve: no map.ts import, like highways.ts.
 */

/** Tiles of cleared ground (nature only) round a city's walls, so no pocket is walled in against them. */
export const CITY_APRON = 2;

/**
 * The clans' old city gate daises (each city's `outerBox` while it stood in the band, W7): a city that moves into its land
 * loses its dais (shared/capitals.ts cityGateDais skips a city with a site), so the land hash tests mask these boxes for
 * good. Fixed numbers: they never follow a city's `outerBox`.
 */
export const OLD_CITY_GATES: Readonly<Record<ClanKey, TileBox>> = {
  wardens: { x0: 8, x1: 18, y0: 43, y1: 52 },
  veiled: { x0: 212, x1: 222, y0: 346, y1: 355 },
  host: { x0: 231, x1: 241, y0: 670, y1: 679 },
  redfang: { x0: 15, x1: 25, y0: 817, y1: 826 },
  hidekin: { x0: 201, x1: 211, y0: 1076, y1: 1085 },
};

/**
 * The highway legs the moves retired (waypoints in local tiles of their land, as they were in shared/highways.ts). Their
 * tiles went back to the map from before the highways; the mask keeps them. Oakvale: from the old city gate to Goldenreach
 * Farms, and from the West Road north to Hunter's Camp through what is now Hearthhold.
 */
export const RETIRED_LEGS: readonly { land: Act; pts: readonly [number, number][] }[] = [
  { land: 1, pts: [[18, 53], [19, 56], [27, 56], [30, 58]] },
  { land: 1, pts: [[52, 57], [52, 21], [44, 16], [36, 16], [35, 17]] },
  // the Red Badlands: the first stretch from Scarwall's old gate dais down to Fangrock (the leg starts at its south gate now)
  { land: 4, pts: [[26, 44], [47, 63]] },
  // the Grey Barrow Moors: the stub from Marrowkeep's old gate dais west of the Host's Muster down to the fork below it
  { land: 3, pts: [[242, 79], [249, 85], [250, 84]] },
];
/** Signposts the moves took away (local tiles of their land): the King's Highway's post where it met the North Meadow road (now inside Hearthhold's walls). */
export const RETIRED_POSTS: readonly { land: Act; x: number; y: number }[] = [{ land: 1, x: 50, y: 20 }];

/** What a city in its land changes round it besides its box. */
export interface CityLandFit {
  /** Dirt roads from a gate's outside tile to the old roads (map tiles, waypoints walked 4-connected; each stops at the first road tile it meets). */
  roads: readonly (readonly [number, number])[][];
  /**
   * Fenced fields cut back off the walls: the fence box as it was (x, y, w, h); the rows above `top` give up their fence
   * and their field (plain ground again), `top` gets the new fence with the old top gap's columns (`gap`) open.
   */
  trims: readonly { x: number; y: number; w: number; h: number; top: number; gap: readonly [number, number] }[];
  /** Signposts beside the gate roads (placed after them, on the nearest free tile beside the road). */
  posts: readonly { x: number; y: number; to: string[] }[];
  /**
   * Ways round the walls (map tile boxes, inside the apron): cliffs and nature cleared to open ground (the ground under them
   * stays), where the walls stand across a way the land had, so it still leads somewhere.
   */
  ways?: readonly TileBox[];
}
export const CITY_LAND: Partial<Record<ClanKey, CityLandFit>> = {
  // Hearthhold: the east gate's road north along the wall to the Watchtower Trail; Goldenreach's north field four rows
  // shorter (its fence stood where the south-west corner of the walls is); the west and south gates are on the highway
  wardens: {
    roads: [[[93, 27], [93, 17]]],
    trims: [{ x: 28, y: 38, w: 18, h: 17, top: 42, gap: [35, 37] }],
    posts: [{ x: 94, y: 25, to: ["Hearthhold", "North Meadow", "Old Watchtower"] }],
  },
  // Scarwall: a few tiles of track out of the east gate onto the head of Gallows Canyon, its post above them (it stands in
  // the canyon, so it names the city and the way to Fangrock through it); the south gate is on the highway, its post is
  // the highway's (shared/highways.ts); no west gate (the band's edge cliffs)
  redfang: {
    roads: [[[61, 808], [64, 808]]],
    trims: [],
    posts: [{ x: 63, y: 806, to: ["Scarwall", "Fangrock"] }],
  },
  // Duskveil: a dirt road from the south gate west along the apron (a row above the brand-totem of the Circle) to the
  // dunes trail out of Mirage Wells, its post by the gate; the west gate is on the highway, its post is the highway's
  // (shared/highways.ts); no east gate (the cliffs)
  veiled: {
    roads: [[[255, 444], [255, 445], [229, 445]]],
    trims: [],
    posts: [{ x: 253, y: 446, to: ["Duskveil", "Mirage Wells", "Kel Ashar"] }],
    // the walls close the foot of the Thornspire's eastern valley (x 254..276), which opened onto the dunes at row 404: a
    // way two tiles wide along the north wall through the cliff knot and down the west wall to the dunes trail
    ways: [{ x0: 228, x1: 276, y0: 402, y1: 403 }, { x0: 228, x1: 229, y0: 402, y1: 431 }],
  },
  // Marrowkeep: a few tiles of track out of the west gate towards the Nine Widows road, its post beside them (the road's
  // own post stood inside the walls: the carve drops it). The track stops short of the road: joined, it makes a fork the
  // forts read as a junction, and the Hollow Mounds' fort would move to Kingsbarrow. The south gate is on the highway, its
  // post is the highway's (shared/highways.ts); no east gate (the crags)
  host: {
    roads: [[[229, 627], [228, 627], [228, 629]]],
    trims: [],
    posts: [{ x: 227, y: 629, to: ["Marrowkeep", "The Nine Widows", "The Host's Muster"] }],
  },
  // Deepden: the back way runs through it (its cross street), so the west gate's road is a step onto the back way; a dirt
  // road from the south gate east along the apron and up the east side to the back way by the east gate, posts beside
  // both. The east gate is on the highway, its post is the highway's (shared/highways.ts)
  hidekin: {
    roads: [[[161, 1109], [161, 1110]], [[187, 1123], [187, 1124], [215, 1124], [215, 1110]]],
    trims: [],
    posts: [{ x: 159, y: 1107, to: ["Deepden", "The Pitfields", "Hidehall"] }, { x: 189, y: 1124, to: ["Deepden", "Hidehall"] }],
  },
};

/**
 * The streets through a city in its land that count as roads (local tiles): the cross street from wall to wall (into the
 * side gates it has: the wall's tile is a road only where it is a gate), and the gate square's middle to the main gate.
 */
const through = (c: City) => {
  const s = citySideGates(c), x0 = s.includes("west") ? 0 : 1, x1 = s.includes("east") ? 51 : 50;
  return [{ x: x0, y: 25, w: x1 - x0 + 1, h: 3 }, { x: 24, y: 28, w: 3, h: 12 }];
};

/** A gate road's tiles (map tiles), 4-connected, all of it (the carve stops at the first road tile). */
export function gateRoadTiles(pts: readonly (readonly [number, number])[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    let [x, y] = pts[i]; const [bx, by] = pts[i + 1];
    if (!out.length) out.push({ x, y });
    while (x !== bx || y !== by) { if (x !== bx) x += Math.sign(bx - x); else y += Math.sign(by - y); out.push({ x, y }); }
  }
  return out;
}
/** The apron round a city's box (map tiles): CITY_APRON tiles each side, never row 0 (the map's edge). */
function apronTiles(c: City): number[] {
  const b = plotBox(c), out: number[] = [];
  for (let y = Math.max(1, b.y - CITY_APRON); y < b.y + b.h + CITY_APRON; y++) for (let x = Math.max(0, b.x - CITY_APRON); x < Math.min(MAP_W, b.x + b.w + CITY_APRON); x++)
    if (x < b.x || y < b.y || x >= b.x + b.w || y >= b.y + b.h) out.push(y * MAP_W + x);
  return out;
}
const postBoxTiles = (p: { x: number; y: number }) => { const s: number[] = []; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) s.push((p.y + j) * MAP_W + p.x + i); return s; };

/**
 * Every tile the cities in their lands may change (map tiles): box, apron, gate roads and posts, trimmed fields, ways round
 * the walls, the retired legs (core and verge, per land) and posts. The map hash tests mask these, with OLD_CITY_GATES.
 */
export const CITY_MASK: Set<number> = (() => {
  const s = new Set<number>();
  for (const c of CITIES) {
    if (!c.site) continue;
    const b = plotBox(c), fit = CITY_LAND[c.clan];
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) s.add(y * MAP_W + x);
    for (const k of apronTiles(c)) s.add(k);
    for (const r of fit?.roads ?? []) for (const t of gateRoadTiles(r)) s.add(t.y * MAP_W + t.x);
    for (const f of fit?.trims ?? []) for (let y = f.y; y <= f.top; y++) for (let x = f.x; x < f.x + f.w; x++) s.add(y * MAP_W + x);
    for (const p of fit?.posts ?? []) for (const k of postBoxTiles(p)) s.add(k);
    for (const w of fit?.ways ?? []) for (let y = w.y0; y <= w.y1; y++) for (let x = w.x0; x <= w.x1; x++) s.add(y * MAP_W + x);
  }
  for (const land of new Set(RETIRED_LEGS.map((l) => l.land))) {
    const legs = RETIRED_LEGS.filter((l) => l.land === land).map((l) => ({ from: "", to: "", pts: l.pts }));
    const { core, verge } = highwayTiles({ land, name: "", seat: "", town: "", towns: [], legs } as Highway);
    for (const k of core) s.add(k);
    for (const k of verge) s.add(k);
  }
  for (const p of RETIRED_POSTS) for (const k of postBoxTiles({ x: p.x, y: p.y + LAND_ROWS[p.land].y0 })) s.add(k);
  return s;
})();

type CityLandT = CityTiles & { TREE: number; PINE: number; BUSH: number; STUMP: number; CACTUS: number; BONES: number; PALM: number; BURROW: number; FENCE: number; FENCE_V: number; FIELD: number; BRIDGE: number };

/**
 * Builds every city with a `site` into its land (shared/map.ts section 22b): cuts back the fields in the way (`natural`:
 * the land's own ground there before any field), clears the apron's nature and the ways round the walls, builds the city over its whole box, makes its
 * through streets and gates roads (and no other tile inside the box), lays the dirt gate roads, and drops the signposts
 * that stood inside the walls. Writes only inside CITY_MASK and keeps what each changed tile was in `before`. Returns the
 * cities' areas (districts first) and the gate roads' signposts for the map to place. `lands`: only the cities of these
 * lands (the band rebuild tests carve one land, like carveHighways). Deterministic, no randomness.
 */
export function carveCitiesInLand(T: CityLandT, ground: number[][], objects: number[][], EMPTY: number, roads: Set<number>,
  posts: { x: number; y: number }[], natural: (x: number, y: number) => number, before?: Map<number, { g: number; o: number }>, lands?: readonly Act[]):
  { areas: CityArea[]; posts: { x: number; y: number; to: string[] }[] } {
  const areas: CityArea[] = [], newPosts: { x: number; y: number; to: string[] }[] = [];
  const was = new Map<number, { g: number; o: number }>();
  for (const k of CITY_MASK) { const x = k % MAP_W, y = Math.floor(k / MAP_W); if (ground[y]?.[x] !== undefined) was.set(k, { g: ground[y][x], o: objects[y][x] }); }
  // what the apron and the gate roads clear: the highway's nature (shared/highways.ts carveHighways), the oases' palms and
  // the sinkholes' burrow mounds (Hidehall's ambush burrow by Deepden's east gate: its Delver is gone, shared/bandits.ts)
  const nature = new Set<number>([T.TREE, T.PINE, T.BUSH, T.ROCK, T.STUMP, T.CACTUS, T.BONES, T.PALM, T.BURROW]);
  for (const c of CITIES) {
    if (!c.site || (lands && !lands.includes(c.act))) continue;
    const b = plotBox(c), fit = CITY_LAND[c.clan], inBox = (x: number, y: number) => x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h;
    // the fields in the way: the rows above the new top lose fence and field, the new top row is fenced but for its gap
    for (const f of fit?.trims ?? []) {
      for (let y = f.y; y < f.top; y++) for (let x = f.x; x < f.x + f.w; x++) {
        if (objects[y][x] === T.FENCE || objects[y][x] === T.FENCE_V) objects[y][x] = EMPTY;
        if (ground[y][x] === T.FIELD) ground[y][x] = natural(x, y);
      }
      for (let x = f.x; x < f.x + f.w; x++) if (x < f.gap[0] || x > f.gap[1]) objects[f.top][x] = T.FENCE;
    }
    for (const k of apronTiles(c)) { const x = k % MAP_W, y = Math.floor(k / MAP_W); if (nature.has(objects[y][x])) objects[y][x] = EMPTY; }
    for (const w of fit?.ways ?? []) for (let y = w.y0; y <= w.y1; y++) for (let x = w.x0; x <= w.x1; x++)
      if (!inBox(x, y) && (objects[y][x] === T.CLIFF || nature.has(objects[y][x]))) objects[y][x] = EMPTY;
    areas.push(...buildCity(c, T, ground, objects, EMPTY));
    // roads: none inside the walls but the through streets and the gates
    for (const k of [...roads]) if (inBox(k % MAP_W, Math.floor(k / MAP_W))) roads.delete(k);
    for (const r of through(c)) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) roads.add((b.y + y) * MAP_W + b.x + x);
    for (const g of cityGates(c)) for (const t of g.tiles) roads.add(t.y * MAP_W + t.x);
    // the gate roads: dirt out to the old roads, nature cleared, never over water, a bridge or anything built
    for (const r of fit?.roads ?? []) for (const t of gateRoadTiles(r)) {
      const k = t.y * MAP_W + t.x, g = ground[t.y][t.x], o = objects[t.y][t.x];
      if (roads.has(k)) break;
      if (g === T.WATER || g === T.BRIDGE || (o !== EMPTY && !nature.has(o))) continue;
      objects[t.y][t.x] = EMPTY; ground[t.y][t.x] = T.DIRT; roads.add(k);
    }
    // the signposts that stood inside the walls are gone with the roads they stood by
    for (let i = posts.length - 1; i >= 0; i--) if (inBox(posts[i].x, posts[i].y)) posts.splice(i, 1);
    newPosts.push(...(fit?.posts ?? []).map((p) => ({ x: p.x, y: p.y, to: [...p.to] })));
  }
  if (before) for (const [k, v] of was) { const x = k % MAP_W, y = Math.floor(k / MAP_W); if ((ground[y][x] !== v.g || objects[y][x] !== v.o) && !before.has(k)) before.set(k, v); }
  return { areas, posts: newPosts };
}
