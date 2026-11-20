import { CITIES_Y0, CITY_ACTS, CITY_PLOT, MAP_W, TILE, type Act } from "./constants";
import type { ClanKey } from "./war/clans";
import { CITY_TEXT, type CityText } from "./war/cityText";
import { TITLES } from "./cosmetics";

/**
 * The clans' capital cities (W7, owner's option B): a band of five walled cities under the Crown's rock, one per clan,
 * side by side (plots in shared/constants.ts CITY_PLOT, west to east in CITY_CLANS order). A hero walks in through a
 * city gate beside the clan's seat (a waygate pair, shared/act2.ts WAYGATES) and arrives inside the city's main gate.
 * Capitals never fall: no monsters, no spawn zones, no war territory, and the whole plot is a safe zone (shared/map.ts
 * isSafeZone). Each city counts as part of its clan's homeland (shared/constants.ts actOfTile), so a hero who logs out
 * inside logs back in at that land's town.
 *
 * Settlement network step 5: one by one the cities leave the band and stand in their homelands (`site`, shared/cityLand.ts
 * builds them there): heroes walk in through three open gates (south, west, east) on the land's roads, and a gate ward
 * (server/cityGates.ts) keeps W7's entry rules. Hearthhold stands in Oakvale's north-west; its strip plot stays rock until
 * all five have moved.
 *
 * Every city is the same plan (CITY_TEMPLATE, local tiles 0..w-1 x 0..h-1, the gate in the south wall) dressed in its
 * clan's style (walls, roofs, ground): gate square with the waystone and the stash, market with the quartermaster,
 * barracks yard with the trainer, oath hall with the altar and its keeper, houses, and the keep with the clan's leader
 * and the war table. All five are built: Hearthhold (Wardens), Duskveil (Veiled), Marrowkeep (Host), Scarwall (Redfang)
 * and Deepden (Hide-Kin). Tile ids are passed in (shared/map.ts T) so this file does not import map.ts.
 */
export const CITY_CLANS: readonly ClanKey[] = ["wardens", "veiled", "host", "redfang", "hidekin"];

/** Rules and numbers of the capitals. */
export const CITY = {
  /** Heroes below this level find the outer gate barred (the oath's own minimum, shared/war/standards.ts STANDARD.minLevel). */
  minLevel: 5,
  /** Spawn zones place no monster within this many tiles of a city's outer gate (shared/spawns.ts; wanderers may still pass). */
  gateClear: 10,
  /** The gate ward (server/cityGates.ts) watches heroes this many tiles round a city in its land (past any dash or blink). */
  wardTiles: 16,
  /** Shop and trainer discount for heroes sworn to the city's clan (W6's town discount, shared/war/towns.ts TOWN.discount). */
  discount: 0.1,
  /** Gold the leader pays once per hero for each renown rank reached (index: shared/war/renown.ts RENOWN_RANKS; Sworn pays nothing). */
  rankGold: [0, 150, 400, 1000, 2500, 6000],
  /** From this rank on (Banneret) the leader also names the hero with the clan's title (CityText.title). */
  titleRank: 3,
  /** How close (px) a hero must stand to the leader, the oath-keeper or the trainer to deal with them. */
  reachPx: 1.6 * TILE,
} as const;

/** A box of local city tiles. */
export interface CityRect { x: number; y: number; w: number; h: number }
export type CityDistrict = "gate" | "market" | "barracks" | "hall" | "keep" | "houses";
export type CityRole = "leader" | "quartermaster" | "oathkeeper" | "trainer";
/** Props the client draws (local tiles, foot of the prop). `solid` blocks movement (local tiles x, y, w, h; shared/npcs.ts isDecorSolidAt). */
export type CityPropKind = "wartable" | "altar" | "stash" | "dummy" | "rack" | "banner";
export interface CityProp { kind: CityPropKind; x: number; y: number; solid?: [number, number, number, number] }
/** A building's footprint (local tiles, roof and walls), its door tile on the bottom row, and what it is (the client's house style). */
export interface CityBuilding { kind: "keep" | "hall" | "barracks" | "house"; x: number; y: number; w: number; h: number; door: { x: number; y: number } }
/** Where a city NPC stands (local tiles, feet: x + 0.5, y + 0.6 like the other NPCs) and which way they face. */
export interface CityNpcSpot { role: CityRole; x: number; y: number; dir: "down" | "up" | "left" | "right" }

/**
 * The city plan every capital shares (local tiles of a CITY_PLOT.w x CITY_PLOT.h plot). The outer wall runs round the
 * plot's edge; the main gate is a gap in the south wall onto the band's rock, its inner waygate just inside. The main
 * street runs north from the gate square to the keep; a cross street joins the districts.
 */
export const CITY_TEMPLATE = {
  /** The main gate's gap in the south wall (x range, row h-1) and the inner waygate's tile. */
  gateGap: [24, 26] as const,
  gate: { x: 25, y: 38 },
  /** A city in its land (City.site) also has a west and an east gate: these rows of its side walls, where the cross street ends. */
  sideGateRows: [25, 27] as const,
  /** The waystone (shared/portals.ts) and the account stash chest (shared/trade.ts STASHES) in the gate square. */
  waystone: { x: 31, y: 33 },
  stash: { x: 20, y: 33 },
  districts: [
    { d: "gate", x: 17, y: 28, w: 18, h: 11 },
    { d: "market", x: 1, y: 28, w: 15, h: 11 },
    { d: "houses", x: 36, y: 28, w: 15, h: 11 },
    { d: "barracks", x: 1, y: 1, w: 14, h: 24 },
    { d: "hall", x: 37, y: 1, w: 14, h: 24 },
    { d: "keep", x: 15, y: 1, w: 22, h: 11 },
  ] as readonly (CityRect & { d: CityDistrict })[],
  /** Streets (cobbles): the main street gate -> keep, the cross street west -> east. */
  streets: [{ x: 24, y: 11, w: 4, h: 17 }, { x: 1, y: 25, w: 50, h: 3 }] as readonly CityRect[],
  /** Flagstone courts: the gate square, the keep's courtyard, the oath hall's court. */
  courts: [{ x: 17, y: 28, w: 18, h: 11 }, { x: 16, y: 7, w: 20, h: 4 }, { x: 38, y: 8, w: 12, h: 9 }] as readonly CityRect[],
  /** Packed earth: the market and the barracks yard. */
  yards: [{ x: 1, y: 28, w: 15, h: 11 }, { x: 1, y: 7, w: 13, h: 18 }] as readonly CityRect[],
  /** The keep's courtyard wall (front row with a gap for the main street, and its two sides). */
  keepWall: { x0: 15, x1: 36, y0: 1, y1: 11, gap: [23, 28] as const },
  buildings: [
    { kind: "keep", x: 19, y: 1, w: 14, h: 6, door: { x: 26, y: 6 } },
    { kind: "barracks", x: 2, y: 2, w: 12, h: 5, door: { x: 8, y: 6 } },
    { kind: "hall", x: 38, y: 2, w: 12, h: 6, door: { x: 44, y: 7 } },
    { kind: "house", x: 16, y: 13, w: 6, h: 5, door: { x: 19, y: 17 } },
    { kind: "house", x: 16, y: 19, w: 6, h: 5, door: { x: 19, y: 23 } },
    { kind: "house", x: 30, y: 13, w: 6, h: 5, door: { x: 33, y: 17 } },
    { kind: "house", x: 30, y: 19, w: 6, h: 5, door: { x: 33, y: 23 } },
    { kind: "house", x: 37, y: 29, w: 6, h: 5, door: { x: 40, y: 33 } },
    { kind: "house", x: 44, y: 29, w: 6, h: 5, door: { x: 47, y: 33 } },
  ] as readonly CityBuilding[],
  /** Market stalls (alternating red and blue awnings), crates and barrels, the well by the houses (map objects). */
  stalls: [[3, 31], [6, 31], [10, 31], [13, 31]] as readonly [number, number][],
  crates: [[2, 37], [3, 37], [14, 37], [14, 29]] as readonly [number, number][],
  well: { x: 43, y: 36 },
  npcs: [
    { role: "leader", x: 26, y: 8, dir: "down" },
    { role: "quartermaster", x: 8, y: 33, dir: "down" },
    { role: "oathkeeper", x: 44, y: 11, dir: "down" },
    { role: "trainer", x: 8, y: 9, dir: "down" },
  ] as readonly CityNpcSpot[],
  props: [
    { kind: "wartable", x: 21, y: 9, solid: [20.3, 8.6, 1.9, 0.8] },
    { kind: "altar", x: 44, y: 12, solid: [43.6, 12.2, 0.8, 0.6] },
    { kind: "stash", x: 20, y: 33, solid: [19.7, 32.7, 0.6, 0.45] },
    { kind: "dummy", x: 4, y: 13, solid: [3.8, 12.8, 0.4, 0.4] },
    { kind: "dummy", x: 7, y: 13, solid: [6.8, 12.8, 0.4, 0.4] },
    { kind: "dummy", x: 10, y: 13, solid: [9.8, 12.8, 0.4, 0.4] },
    { kind: "rack", x: 12, y: 9, solid: [11.6, 8.7, 0.8, 0.4] },
    { kind: "banner", x: 17, y: 8 }, { kind: "banner", x: 34, y: 8 }, { kind: "banner", x: 22, y: 37 }, { kind: "banner", x: 29, y: 37 },
  ] as readonly CityProp[],
} as const;

/** Walkable ground tiles a city may be laid in (existing tile ids only: the client restyles them per city). */
export type CityGround = "GRASS" | "GRASS_DARK" | "FLOWERS" | "TALL_GRASS" | "DIRT" | "SAND" | "HEATHER" | "CLAY" | "GRAVEL" | "MOSS" | "RUBBLE";
/**
 * A city's look: which tiles its walls, roofs and streets are (the client paints a city's ground like its homeland's and
 * recolours it per clan). `ground` is the open ground inside the walls [main, patches (a quarter), rare specks], `yard` the
 * market's and the barracks yard's earth. Pick grounds the homeland's painter knows (client/src/groundPaint.ts).
 */
export interface CityStyle {
  wall: "WALL_STONE" | "PALISADE" | "ADOBE_WALL" | "CLIFF"; roof: "ROOF_RED" | "ROOF_SLATE" | "ROOF_THATCH"; roof2: "ROOF_RED" | "ROOF_SLATE" | "ROOF_THATCH";
  street: "COBBLE" | "FLAGS" | "MARBLE" | "CLAY" | "GRAVEL" | "DIRT";
  ground: readonly [CityGround, CityGround, CityGround]; yard: CityGround;
}

/**
 * One capital. `outer` is the city gate in the clan's land (map tiles), carved only inside `outerBox`. A city with a `site`
 * stands in its land instead: `outer` is the tile outside its south gate and `outerBox` its plot (the highways skip it).
 */
export interface City {
  clan: ClanKey;
  /** Its land (shared/constants.ts CITY_ACTS for its plot). */
  act: Act;
  /** Index into CITY_CLANS / CITY_PLOT (west to east). */
  plot: number;
  outer: { x: number; y: number };
  outerBox: { x0: number; x1: number; y0: number; y1: number };
  style: CityStyle;
  /** NPC character sheets per role (client/public/assets/characters). */
  sprites: Record<CityRole, string>;
  /** Built in its land (settlement network step 5): the map tile of its plot's top-left corner. Unset: in the band's plot. */
  site?: { x: number; y: number };
  /**
   * A city in its land: which side walls have a gate besides the south wall's (unset: both). A side against the land's
   * edge cliffs or a lake has none, so no gate opens onto rock.
   */
  sideGates?: readonly ("west" | "east")[];
}

export const CITIES: readonly City[] = [
  // The Wardens' Hearthhold: in Oakvale's north-west (settlement network step 5), north of Goldenreach Farms and the
  // King's Highway, a short walk up the road from Oakvale's north gate. Its city gate used to stand at Goldenreach
  // (shared/cityLand.ts OLD_CITY_GATES); the farm's Hold (26, 58) and standards (30, 49 / 34, 68) stay where they were.
  {
    clan: "wardens", act: 1, plot: 0, outer: { x: 66, y: 41 }, outerBox: { x0: 41, x1: 92, y0: 1, y1: 40 }, site: { x: 41, y: 1 },
    style: { wall: "WALL_STONE", roof: "ROOF_SLATE", roof2: "ROOF_RED", street: "COBBLE", ground: ["GRASS", "GRASS_DARK", "FLOWERS"], yard: "DIRT" },
    sprites: { leader: "cap_wardens_leader", quartermaster: "steward_wardens", oathkeeper: "cap_wardens_oathkeeper", trainer: "cap_wardens_trainer" },
  },
  // The Veiled Circle's Duskveil: its city gate stands on the open sand of the Thornspire Heights west of the Veiled
  // Sanctum, clear of the Sanctum's walls, its Hold (228, 358) and standard (233, 344). Mud-brick walls, sandstone streets.
  {
    clan: "veiled", act: 2, plot: 1, outer: { x: 217, y: 350 }, outerBox: { x0: 212, x1: 222, y0: 346, y1: 355 },
    style: { wall: "ADOBE_WALL", roof: "ROOF_SLATE", roof2: "ROOF_THATCH", street: "COBBLE", ground: ["SAND", "DIRT", "RUBBLE"], yard: "DIRT" },
    sprites: { leader: "cap_veiled_leader", quartermaster: "steward_veiled", oathkeeper: "cap_veiled_oathkeeper", trainer: "cap_veiled_trainer" },
  },
  // The Ossuary Host's Marrowkeep: its city gate stands on the heather west of the Host's Muster, a dozen tiles from the
  // war camp, outside every territory (Kingsbarrow is north, the Drowned Hollow south-west). Black stone and bone.
  {
    clan: "host", act: 3, plot: 2, outer: { x: 236, y: 674 }, outerBox: { x0: 231, x1: 241, y0: 670, y1: 679 },
    style: { wall: "WALL_STONE", roof: "ROOF_SLATE", roof2: "ROOF_SLATE", street: "COBBLE", ground: ["HEATHER", "GRASS_DARK", "RUBBLE"], yard: "DIRT" },
    sprites: { leader: "cap_host_leader", quartermaster: "steward_host", oathkeeper: "cap_host_oathkeeper", trainer: "cap_host_trainer" },
  },
  // The Redfang Compact's Scarwall: its city gate stands on the open sand north of Fangrock's stockade (which has no
  // north gate), thirty tiles and more from every post of the garrison. A red palisade, clay streets.
  {
    clan: "redfang", act: 4, plot: 3, outer: { x: 20, y: 821 }, outerBox: { x0: 15, x1: 25, y0: 817, y1: 826 },
    style: { wall: "PALISADE", roof: "ROOF_RED", roof2: "ROOF_THATCH", street: "CLAY", ground: ["SAND", "GRAVEL", "CLAY"], yard: "GRAVEL" },
    sprites: { leader: "cap_redfang_leader", quartermaster: "steward_redfang", oathkeeper: "cap_redfang_oathkeeper", trainer: "cap_redfang_trainer" },
  },
  // The Hide-Kin's Deepden: its city gate stands in the mossy hollow north-west of Hidehall, off the back way and out of
  // sight of the warren's posts, patrols and burrow ambushers (24 tiles and more). Hide roofs, a palisade, moss and earth.
  {
    clan: "hidekin", act: 5, plot: 4, outer: { x: 206, y: 1080 }, outerBox: { x0: 201, x1: 211, y0: 1076, y1: 1085 },
    style: { wall: "PALISADE", roof: "ROOF_THATCH", roof2: "ROOF_THATCH", street: "COBBLE", ground: ["MOSS", "GRASS_DARK", "TALL_GRASS"], yard: "DIRT" },
    sprites: { leader: "cap_hidekin_leader", quartermaster: "steward_hidekin", oathkeeper: "cap_hidekin_oathkeeper", trainer: "cap_hidekin_trainer" },
  },
];
export const cityOf = (clan: unknown): City | undefined => CITIES.find((c) => c.clan === clan);
/** A city's names and lines (shared/war/cityText.ts). */
export const cityText = (c: City): CityText => CITY_TEXT[c.clan]!;

/** The TITLES index of the clan title a city's leader grants at CITY.titleRank (-1 if the list lacks it). */
export const cityTitle = (c: City): number => (TITLES as readonly string[]).indexOf(cityText(c).title);

/** A band plot's box in map tiles. */
export const stripBox = (plot: number) => ({ x: CITY_PLOT.x0 + plot * CITY_PLOT.stride, y: CITIES_Y0 + CITY_PLOT.y, w: CITY_PLOT.w, h: CITY_PLOT.h });
/** A city's box in map tiles: its site in its land, else its band plot (a number: that band plot). */
export const plotBox = (c: City | number) => (typeof c === "number" ? stripBox(c) : c.site ? { x: c.site.x, y: c.site.y, w: CITY_PLOT.w, h: CITY_PLOT.h } : stripBox(c.plot));
/** A local city tile in map tiles. */
export const cityTile = (c: City, t: { x: number; y: number }) => { const b = plotBox(c); return { x: b.x + t.x, y: b.y + t.y }; };
/** A local city point (tiles, fractional) in px. */
export const cityPx = (c: City, x: number, y: number) => { const b = plotBox(c); return { x: (b.x + x) * TILE, y: (b.y + y) * TILE }; };
/** The side walls with a gate of a city in its land (City.sideGates; both when unset), west first. */
export const citySideGates = (c: City): ("west" | "east")[] => (["west", "east"] as const).filter((s) => !c.sideGates || c.sideGates.includes(s));
/** The cities built in their lands (City.site), not in the band. */
export const inLandCities = (): City[] => CITIES.filter((c) => c.site);

/** The built city whose plot (walls included) holds map tile (tx, ty), if any. */
export function cityAt(tx: number, ty: number): City | undefined {
  for (const c of CITIES) { const b = plotBox(c); if (tx >= b.x && ty >= b.y && tx < b.x + b.w && ty < b.y + b.h) return c; }
  return undefined;
}
/** The built city at a pixel position, if any. */
export const cityAtPx = (px: number, py: number) => cityAt(Math.floor(px / TILE), Math.floor(py / TILE));

/** The NPC id of a city role: `cap_<clan>_<role>` (shared/npcs.ts). */
export const cityNpcId = (c: City, role: CityRole) => `cap_${c.clan}_${role}`;
/** The city and role of a city NPC id, if it is one. */
export function cityNpcRole(id: string): { city: City; role: CityRole } | undefined {
  const m = /^cap_([a-z]+)_([a-z]+)$/.exec(id), city = m ? cityOf(m[1]) : undefined;
  return city && CITY_TEMPLATE.npcs.some((n) => n.role === m![2]) ? { city, role: m![2] as CityRole } : undefined;
}
/** Where a city NPC stands (px, feet). */
export function cityNpcPx(c: City, role: CityRole): { x: number; y: number } {
  const n = CITY_TEMPLATE.npcs.find((o) => o.role === role)!;
  return cityPx(c, n.x + 0.5, n.y + 0.6);
}
/** The city whose `role` NPC stands within CITY.reachPx of (px, py), if any. */
export function cityRoleNear(role: CityRole, px: number, py: number): City | undefined {
  return CITIES.find((c) => { const n = cityNpcPx(c, role); return Math.hypot(n.x - px, n.y - py) <= CITY.reachPx; });
}
/** The city whose waystone has portal id `id` (`city_<clan>`, shared/map.ts PORTAL_SPOTS), if any. */
export const cityOfPortal = (id: string): City | undefined => (id.startsWith("city_") ? cityOf(id.slice(5)) : undefined);
/** The shop id of a city's quartermaster (shared/shops.ts). */
export const cityShopId = (c: City) => `cap_${c.clan}`;
/** Every city prop's solid box in map tiles (shared/npcs.ts adds them to the props that block movement). */
export const CITY_SOLIDS: [number, number, number, number][] = CITIES.flatMap((c) => {
  const b = plotBox(c);
  return CITY_TEMPLATE.props.flatMap((p) => (p.solid ? [[b.x + p.solid[0], b.y + p.solid[1], p.solid[2], p.solid[3]] as [number, number, number, number]] : []));
});

/** One walk-in gate of a city in its land: its gap in the wall (map tiles, 3 wide) and the tile just outside it. */
export interface CityGate { side: "south" | "west" | "east"; tiles: { x: number; y: number }[]; out: { x: number; y: number } }
/**
 * The walk-in gates of a city in its land (City.site): the main gate's gap in the south wall and the cross street's ends in
 * the side walls it has a gate in (citySideGates), south first, then west, then east. A band city has none (its waygate
 * pair, shared/act2.ts, is its way in). The gate ward (server/cityGates.ts), the spawn ring (shared/spawns.ts
 * nearCityGate) and the client's gatehouses read these.
 */
export function cityGates(c: City): CityGate[] {
  if (!c.site) return [];
  const b = plotBox(c), P = CITY_TEMPLATE, [r0, r1] = P.sideGateRows, rows = Array.from({ length: r1 - r0 + 1 }, (_, i) => b.y + r0 + i);
  const mid = b.y + Math.round((r0 + r1) / 2);
  const side = (s: "west" | "east"): CityGate => (s === "west"
    ? { side: "west", tiles: rows.map((y) => ({ x: b.x, y })), out: { x: b.x - 1, y: mid } }
    : { side: "east", tiles: rows.map((y) => ({ x: b.x + b.w - 1, y })), out: { x: b.x + b.w, y: mid } });
  return [
    { side: "south", tiles: Array.from({ length: P.gateGap[1] - P.gateGap[0] + 1 }, (_, i) => ({ x: b.x + P.gateGap[0] + i, y: b.y + b.h - 1 })), out: { ...c.outer } },
    ...citySideGates(c).map(side),
  ];
}
/**
 * A spot (px) remembered before a city moved into its land (a deploy's live hand-off, server/handoff.ts): inside the old
 * band plot of a city that now has a site, the same local tile at the site; anywhere else, unchanged.
 */
export function relocateCitySpot(x: number, y: number): { x: number; y: number } {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (const c of CITIES) {
    if (!c.site) continue;
    const o = stripBox(c.plot);
    if (tx >= o.x && ty >= o.y && tx < o.x + o.w && ty < o.y + o.h) return { x: x + (c.site.x - o.x) * TILE, y: y + (c.site.y - o.y) * TILE };
  }
  return { x, y };
}

/** Why a city gate (or its waystone) refuses a hero: "ok" lets them in. */
export type CityAdmit = "ok" | "war" | "wanted";
/**
 * Who gets in (owner's default): heroes sworn to the city's clan, unsworn heroes and heroes of clans at peace with it.
 * A hero whose clan is at war with the city's, or who is Wanted by it (`wanted`: their shared/war/feuds.ts wantedTier
 * against the city's clan), stays outside. Nobody already inside is thrown out when the war changes.
 */
export function cityAdmits(hero: { clan?: ClanKey; wanted?: number }, city: City, atWar: (a: ClanKey, b: ClanKey) => boolean): CityAdmit {
  if ((hero.wanted ?? 0) >= 1) return "wanted";
  if (hero.clan && hero.clan !== city.clan && atWar(hero.clan, city.clan)) return "war";
  return "ok";
}

/** What a sworn hero at rank `rank` is owed by a leader, having been paid up to rank `paid`: gold for each rank between. */
export function rankRewardGold(paid: number, rank: number): number {
  let g = 0;
  for (let r = Math.max(0, paid) + 1; r <= rank && r < CITY.rankGold.length; r++) g += CITY.rankGold[r];
  return g;
}
/** Old or broken save values: `capPaid` a rank index (0 = none paid), `home` a built city's clan or none. */
export const cleanCapPaid = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v > 0 ? Math.min(v, CITY.rankGold.length - 1) : 0);
export const cleanHome = (v: unknown): ClanKey | undefined => (cityOf(v) ? (v as ClanKey) : undefined);

export interface CityTiles {
  GRASS: number; GRASS_DARK: number; FLOWERS: number; TALL_GRASS: number; DIRT: number; SAND: number; HEATHER: number; GRAVEL: number; MOSS: number; RUBBLE: number;
  COBBLE: number; FLAGS: number; MARBLE: number; CLAY: number; ROCK: number; WATER: number;
  WALL_STONE: number; PALISADE: number; ADOBE_WALL: number; CLIFF: number; ROOF_RED: number; ROOF_SLATE: number; ROOF_THATCH: number;
  WALL_TIMBER: number; WINDOW_TIMBER: number; WINDOW_STONE: number; DOOR: number; STALL_RED: number; STALL_BLUE: number; CRATE: number; BARREL: number; WELL: number;
}
export interface CityArea { name: string; x: number; y: number; w: number; h: number }

function hash(x: number, y: number, seed: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Builds every band city in CITIES on its plot (the band is solid rock before: shared/map.ts section 15) and returns their
 * areas, districts first (the first match names a tile). The cities with a `site` are built in their lands instead
 * (shared/cityLand.ts). Deterministic.
 */
export function buildCities(T: CityTiles, ground: number[][], objects: number[][], EMPTY: number): { areas: CityArea[] } {
  const areas: CityArea[] = [];
  for (const c of CITIES) if (!c.site) areas.push(...buildCity(c, T, ground, objects, EMPTY));
  return { areas };
}

/**
 * Builds one city on its box (plotBox: its band plot, or its site in its land), every tile of the box, and returns its
 * areas, districts first. A city in its land also opens its side gates (citySideGates, CITY_TEMPLATE.sideGateRows). Deterministic.
 */
export function buildCity(c: City, T: CityTiles, ground: number[][], objects: number[][], EMPTY: number): CityArea[] {
  const areas: CityArea[] = [];
  const P = CITY_TEMPLATE;
  const b = plotBox(c), S = c.style, txt = cityText(c);
  const setG = (x: number, y: number, t: number) => { ground[b.y + y][b.x + x] = t; };
  const setO = (x: number, y: number, t: number) => { objects[b.y + y][b.x + x] = t; };
  const rect = (r: CityRect, f: (x: number, y: number) => void) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) f(x, y); };
  // open ground inside the wall, the wall round the plot's edge, the main gate's gap onto the rock
  rect({ x: 0, y: 0, w: b.w, h: b.h }, (x, y) => {
    const edge = x === 0 || y === 0 || x === b.w - 1 || y === b.h - 1, h = hash(b.x + x, b.y + y, 701);
    setG(x, y, T[h < 0.25 ? S.ground[1] : h > 0.97 ? S.ground[2] : S.ground[0]]);
    setO(x, y, edge ? T[S.wall] : EMPTY);
  });
  for (let x = P.gateGap[0]; x <= P.gateGap[1]; x++) { setO(x, b.h - 1, EMPTY); setG(x, b.h - 1, T.FLAGS); }
  if (c.site) for (let y = P.sideGateRows[0]; y <= P.sideGateRows[1]; y++) for (const s of citySideGates(c)) { const x = s === "west" ? 0 : b.w - 1; setO(x, y, EMPTY); setG(x, y, T[S.street]); }
  for (const r of P.yards) rect(r, (x, y) => setG(x, y, T[hash(b.x + x, b.y + y, 702) < 0.15 ? S.ground[1] : S.yard]));
  for (const r of P.courts) rect(r, (x, y) => setG(x, y, T.FLAGS));
  for (const r of P.streets) rect(r, (x, y) => setG(x, y, T[S.street]));
  // the keep's courtyard wall: the front row (a gap for the main street) and the two sides
  const K = P.keepWall;
  for (let x = K.x0; x <= K.x1; x++) if (x < K.gap[0] || x > K.gap[1]) setO(x, K.y1, T[S.wall]);
  for (let y = K.y0; y < K.y1; y++) { setO(K.x0, y, T[S.wall]); setO(K.x1, y, T[S.wall]); }
  // buildings: roof rows, two rows of wall, the door on the bottom row, windows beside it
  for (const B of P.buildings) {
    const stone = B.kind !== "house", wall = stone ? T.WALL_STONE : T.WALL_TIMBER, win = stone ? T.WINDOW_STONE : T.WINDOW_TIMBER;
    const roof = B.kind === "house" ? T[(B.x + B.y) % 2 ? S.roof2 : S.roof] : T[S.roof];
    rect({ x: B.x, y: B.y, w: B.w, h: B.h - 2 }, (x, y) => setO(x, y, roof));
    rect({ x: B.x, y: B.y + B.h - 2, w: B.w, h: 2 }, (x, y) => setO(x, y, wall));
    for (const wx of [B.x + 1, B.x + B.w - 2]) setO(wx, B.y + B.h - 1, win);
    if (B.kind === "hall" || B.kind === "keep") for (let wx = B.x + 1; wx < B.x + B.w - 1; wx += 2) setO(wx, B.y + B.h - 2, win);
    setO(B.door.x, B.door.y, T.DOOR);
    setG(B.door.x, B.door.y + 1, T[S.street]); // the doorstep
  }
  P.stalls.forEach(([x, y], i) => setO(x, y, i % 2 ? T.STALL_BLUE : T.STALL_RED));
  P.crates.forEach(([x, y], i) => setO(x, y, i % 2 ? T.BARREL : T.CRATE));
  setO(P.well.x, P.well.y, T.WELL);
  for (const d of P.districts) areas.push({ name: txt.districts[d.d], x: b.x + d.x, y: b.y + d.y, w: d.w, h: d.h });
  areas.push({ name: txt.name, x: b.x, y: b.y, w: b.w, h: b.h });
  return areas;
}

/**
 * Cuts a city's outer gate dais into its land (shared/map.ts sections 14f / 20b, and the land tests that rebuild a band):
 * a disk of old flagstones and rubble round `outer`, clearing nature (`nature`: trees, bushes, boulders) and never
 * touching water, and only inside `outerBox`, so nothing else in the land changes. Deterministic.
 */
export function cityGateDais(c: City, T: Pick<CityTiles, "FLAGS" | "RUBBLE" | "WATER">, ground: number[][], objects: number[][], EMPTY: number, nature: (o: number) => boolean) {
  if (c.site) return; // (a city in its land has walk-in gates: shared/cityLand.ts)
  const G = c.outer, B = c.outerBox;
  for (let y = B.y0; y <= B.y1; y++) for (let x = B.x0; x <= B.x1; x++) {
    const dx = (x - G.x - 0.5) / 3.6, dy = (y - G.y - 0.5) / 3.2, d = dx * dx + dy * dy;
    if (d >= 1) continue;
    if (nature(objects[y][x])) objects[y][x] = EMPTY;
    if (objects[y][x] === EMPTY && ground[y][x] !== T.WATER) ground[y][x] = d < 0.5 ? (hash(x, y, 361) < 0.8 ? T.FLAGS : T.RUBBLE) : d < 0.8 && hash(x, y, 362) < 0.5 ? T.RUBBLE : ground[y][x];
  }
}

/** True when the plots fit the band side by side (a guard for the numbers in shared/constants.ts). */
export const plotsFit = () => CITY_ACTS.every((_, i) => { const b = stripBox(i); return b.x >= 1 && b.x + b.w <= MAP_W - 1; });

/**
 * What a hero pays at a capital's quartermaster or trainer: heroes sworn to the city's clan pay CITY.discount less
 * (never below 1 gold, never a surcharge), everyone else the base price. The server charges this; the client shows it.
 */
export function cityPrice(base: number, city: City | undefined, heroClan: ClanKey | undefined): number {
  if (!city || !heroClan || heroClan !== city.clan || base <= 0) return base;
  return Math.min(base, Math.max(1, Math.round(base * (1 - CITY.discount))));
}
