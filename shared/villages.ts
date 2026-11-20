import { MAP_W, type Act } from "./constants";
import { LAND_ROWS } from "./borders";

/**
 * Villages along the land highways (settlement network step 4): a few cottages round a small square a short way off a
 * land's highway, so its road reads capital -> town -> villages. Each has a portal stone on its square, a quest giver with
 * a short local quest (shared/quests.ts SIDE_ARCS), a townsperson or a trader, a reeve, and a gate on its dirt path that
 * the clans can fight over (shared/war/townSites.ts TOWNS, `fort: false`). Monsters keep out (shared/spawns.ts).
 *
 * Every village is one layout (VILLAGE_PLAN) on a 12x9 box, mirrored where the highway lies west of it, carved after the
 * highways (shared/map.ts section 24) on open ground the survey picked (docs/settlement-network-progress.md step 4: 4-9
 * tiles off the highway's middle line, 12+ from a fort, 16+ from a fort for the gate, clear of chests, musters, siege
 * sites, landmarks, NPCs, portal stones, war roads and the clan seats). The dirt path to the highway is NOT a road (no
 * `roads` tile): a new T-junction would make a junction fort anchor (standards.ts). Pure data plus the carve: no map.ts
 * import, so the map can call it (like highways.ts). Tiles are map x and the land's local y (like highways.ts).
 */
export type VillageId = "turfhallow" | "staithe" | "barrowstead" | "redlode" | "hornstead" | "windlass" | "hempfield" | "saltglass" | "lastwell";
type Pt = { x: number; y: number };
/** A cottage: roof rows over two rows of wall, a door in the middle of the front (bottom) wall. Box offsets. */
export interface VillageHouse { dx: number; dy: number; w: number; h: number }
export interface Village {
  id: VillageId; name: string; land: Act;
  /** The territory it follows in the war (never a capital or a haven). */
  patron: string;
  /** Its box: map x, local y, size in tiles. The village's AREAS rect, safe from monsters (plus 2). */
  x: number; y: number; w: number; h: number;
  /** Mirrored: the square and the way out on the west side (the highway lies west). */
  mirror: boolean;
  /** Roof tile kind (shared/map.ts T): the land's house look ("adobe": the Sunscar's flat-roofed mud-brick, every tile T.ADOBE, no windows). */
  roof: "slate" | "red" | "thatch" | "adobe";
  /** The square's centrepiece. */
  centre: "well" | "stone";
  /**
   * The way out of the box (plan offsets, unmirrored) when neither the plan's east nor its south one reaches the road
   * (Last Well: the highway lies north behind a crag, so the path runs up the box's edge from the square's top corner).
   */
  exit?: { dx: number; dy: number };
  /** The dirt path out of the box to the highway (or the old road), local tiles; its last point is the first road tile. */
  spur: readonly [number, number][];
  /** The signpost beside the path where it meets the road (local tile). */
  post: Pt;
  /** The war gate (local tile): on the road outside, 3+ tiles beyond town ground (towns.ts gateClearTiles). */
  gate: Pt;
  /** Nature cleared just outside the box (local tiles), where a cottage would leave a pocket of ground walled in. */
  clear?: readonly [number, number][];
}

/**
 * The one village layout (box offsets, unmirrored; dx 0..11, dy 0..8). Three cottages (a hall top left, a cottage top
 * right, one bottom left), the square to the south-east with its well, the portal stone at its north-east corner, the
 * giver before the hall's door, the townsperson before the cottage's, the reeve between two banners on the square's
 * south side. The way out leaves the box east (`east`, beside the square) or south (`south`, below it).
 */
export const VILLAGE_PLAN = {
  houses: [{ dx: 0, dy: 0, w: 5, h: 4 }, { dx: 6, dy: 0, w: 4, h: 3 }, { dx: 0, dy: 5, w: 4, h: 3 }] as readonly VillageHouse[],
  square: { dx: 5, dy: 4, w: 6, h: 4 },
  centre: { dx: 7, dy: 6 },
  portal: { dx: 10, dy: 4 },
  steward: { dx: 6, dy: 7 },
  banners: [{ dx: 5, dy: 7 }, { dx: 7, dy: 7 }],
  props: [{ dx: 10, dy: 0, kind: "crate" }, { dx: 4, dy: 5, kind: "barrel" }, { dx: 10, dy: 1, kind: "hay" }] as readonly { dx: number; dy: number; kind: "crate" | "barrel" | "hay" }[],
  east: { dx: 11, dy: 6 }, south: { dx: 9, dy: 8 },
};

export const VILLAGES: readonly Village[] = [
  // The Grey Barrow Moors: peat-cutters on the Cairnwatch - Ashen Pass leg, the fen landing above the highway west of
  // the Drowned Hollow, and the barrow-wardens' hostel off the old road south of the Hollow Mounds
  { id: "turfhallow", name: "Turfhallow", land: 3, patron: "Thane's Rest", x: 90, y: 136, w: 12, h: 9, mirror: false, roof: "slate", centre: "well",
    spur: [[102, 142], [104, 142], [104, 136], [106, 136]], post: { x: 105, y: 137 }, gate: { x: 107, y: 133 } },
  { id: "staithe", name: "Blackwater Staithe", land: 3, patron: "Blackwater Fen", x: 176, y: 90, w: 12, h: 8, mirror: true, roof: "slate", centre: "well",
    spur: [[178, 98], [178, 101]], post: { x: 179, y: 100 }, gate: { x: 178, y: 103 }, clear: [[188, 91]] }, // (the strip between the boat-hall and the crag)
  { id: "barrowstead", name: "Barrowstead", land: 3, patron: "The Hollow Mounds", x: 154, y: 152, w: 12, h: 9, mirror: true, roof: "slate", centre: "stone",
    spur: [[153, 158], [148, 158]], post: { x: 150, y: 157 }, gate: { x: 148, y: 160 } },
  // The Red Badlands: the Cinnabar Pits' miners' row above the highway, and a longhorn ranch on the Rattler's Way
  { id: "redlode", name: "Redlode", land: 4, patron: "The Cinnabar Pits", x: 157, y: 68, w: 12, h: 9, mirror: false, roof: "red", centre: "well",
    spur: [[166, 77], [166, 79]], post: { x: 165, y: 78 }, gate: { x: 166, y: 82 } },
  { id: "hornstead", name: "Hornstead", land: 4, patron: "Rattlesnake Gulch", x: 77, y: 109, w: 12, h: 9, mirror: true, roof: "thatch", centre: "well",
    spur: [[79, 118], [79, 120], [74, 120], [74, 122], [72, 122]], post: { x: 74, y: 123 }, gate: { x: 71, y: 125 } },
  // The Mawdeep Sinkholes (PR 2): the lift-men's row on the Great Maw's west rim, its path out to the rim road just
  // short of the highway (the gate stands on the highway at the fork), and the hemp fields for Ropewell's rope walk
  // beside the highway west of the Old Warren
  { id: "windlass", name: "Windlass", land: 5, patron: "The Pitfields", x: 123, y: 90, w: 12, h: 9, mirror: false, roof: "red", centre: "well",
    spur: [[136, 96]], post: { x: 135, y: 97 }, gate: { x: 136, y: 85 } },
  { id: "hempfield", name: "Hempfield", land: 5, patron: "The Old Warren", x: 30, y: 54, w: 12, h: 9, mirror: false, roof: "thatch", centre: "well",
    spur: [[44, 60]], post: { x: 43, y: 61 }, gate: { x: 46, y: 58 } },
  // The Sunscar (PR 2): the salt-cutters above the Dune Road on the Glasswind Flats, and the caravan well under the
  // Ashen Pass road in the Humpback Mesas, both in Kel Ashar's mud-brick
  { id: "saltglass", name: "Saltglass", land: 2, patron: "The Glasswind Flats", x: 79, y: 124, w: 12, h: 9, mirror: false, roof: "adobe", centre: "well",
    spur: [[88, 136]], post: { x: 87, y: 135 }, gate: { x: 88, y: 137 } },
  { id: "lastwell", name: "Last Well", land: 2, patron: "The Humpback Mesas", x: 124, y: 58, w: 12, h: 9, mirror: true, roof: "adobe", centre: "well",
    exit: { dx: 11, dy: 4 }, spur: [[124, 54], [120, 54]], post: { x: 121, y: 55 }, gate: { x: 118, y: 53 } },
];

/** Map row of a village's local row. */
export const vy = (v: Village, y: number) => y + LAND_ROWS[v.land].y0;
/** A plan offset (dx, dy, width w) in map tiles for this village (mirrored on its box when `mirror`). */
export function vtile(v: Village, dx: number, dy: number, w = 1): { x: number; y: number } {
  return { x: v.x + (v.mirror ? v.w - dx - w : dx), y: vy(v, v.y) + dy };
}
/** The village's box in map tiles (inclusive). */
export const villageBox = (v: Village) => ({ x0: v.x, y0: vy(v, v.y), x1: v.x + v.w - 1, y1: vy(v, v.y) + v.h - 1 });
/** Its houses in map tiles. */
export const villageHouses = (v: Village) => VILLAGE_PLAN.houses.map((h) => ({ ...vtile(v, h.dx, h.dy, h.w), w: h.w, h: h.h }));
/** A house's door (map tile): the middle of its front wall. */
export const doorOf = (h: { x: number; y: number; w: number; h: number }) => ({ x: h.x + Math.floor(h.w / 2), y: h.y + h.h - 1 });
/**
 * Where things stand (map tiles): the portal stone, the giver (before the hall's door), the townsperson (before the
 * cottage's), the reeve, the banners, the centrepiece.
 */
export const villageSpots = (v: Village) => {
  const P = VILLAGE_PLAN, t = (p: { dx: number; dy: number }) => vtile(v, p.dx, p.dy), [hall, cot] = villageHouses(v).map(doorOf);
  return { portal: t(P.portal), giver: { x: hall.x, y: hall.y + 1 }, folk: { x: cot.x, y: cot.y + 1 }, steward: t(P.steward), banners: P.banners.map(t), centre: t(P.centre) };
};
/** The village's war gate and signpost in map tiles. */
export const villageGate = (v: Village) => ({ x: v.gate.x, y: vy(v, v.gate.y) });
export const villagePost = (v: Village) => ({ x: v.post.x, y: vy(v, v.post.y) });

/** The path's tiles in map tiles, 4-connected, from the box's way out (its edge tile) to the road (the last point included). */
export function spurTiles(v: Village): { x: number; y: number }[] {
  const e = v.exit ?? (isEastExit(v) ? VILLAGE_PLAN.east : VILLAGE_PLAN.south), exit = vtile(v, e.dx, Math.min(v.h - 1, e.dy));
  const pts: [number, number][] = [[exit.x, exit.y], ...v.spur.map(([x, y]): [number, number] => [x, vy(v, y)])], out: { x: number; y: number }[] = [];
  const push = (x: number, y: number) => { const l = out[out.length - 1]; if (!l || l.x !== x || l.y !== y) out.push({ x, y }); };
  for (let i = 0; i + 1 < pts.length; i++) {
    let [x, y] = pts[i]; const [bx, by] = pts[i + 1];
    push(x, y);
    while (x !== bx || y !== by) { if (x !== bx) x += Math.sign(bx - x); else y += Math.sign(by - y); push(x, y); }
  }
  return out;
}
/** Does the way out leave the box east/west (else south)? Read off the first spur point. */
function isEastExit(v: Village): boolean {
  const [x] = v.spur[0];
  return x < v.x || x >= v.x + v.w;
}

/** Every tile the villages may change (map tiles): their boxes, `clear` tiles, paths and signposts. The map hash tests mask these. */
export const VILLAGE_MASK: Set<number> = (() => {
  const s = new Set<number>();
  for (const v of VILLAGES) {
    const b = villageBox(v);
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) s.add(y * MAP_W + x);
    for (const t of spurTiles(v)) s.add(t.y * MAP_W + t.x);
    for (const [x, y] of v.clear ?? []) s.add(vy(v, y) * MAP_W + x);
    const p = villagePost(v); s.add(p.y * MAP_W + p.x);
  }
  return s;
})();

type VillageT = {
  WATER: number; BRIDGE: number; DIRT: number; FLAGS: number; TREE: number; PINE: number; BUSH: number; ROCK: number; STUMP: number; CACTUS: number; BONES: number;
  ROOF_SLATE: number; ROOF_RED: number; ROOF_THATCH: number; WALL_STONE: number; WINDOW_STONE: number; WALL_TIMBER: number; WINDOW_TIMBER: number; DOOR: number;
  WELL: number; STANDING_STONE: number; CRATE: number; BARREL: number; HAY: number; SIGNPOST: number; ADOBE: number;
};

/**
 * Cuts the villages into the built map (shared/map.ts section 24, after the highways and their posts). Writes only inside
 * VILLAGE_MASK: clears the nature in each box, lays the square's flagstones, builds the cottages in the land's look (the
 * moors' slate over fieldstone, the badlands' and the sinkholes' red tile or thatch over timber, the Sunscar's mud-brick),
 * puts down the centrepiece and a few stores, then the dirt path to the road (never on water, a bridge, a road or any object that is not nature; never added to
 * `roads`) and its signpost. Keeps what each changed tile was in `before` (chests and siege sites read the map before).
 * Returns the signposts (map tiles) for the map's list. Deterministic, no randomness.
 */
export function carveVillages(ground: number[][], objects: number[][], roads: ReadonlySet<number>, T: VillageT, EMPTY: number, names: (v: Village) => string[],
  before?: Map<number, { g: number; o: number }>, only?: readonly VillageId[]): { x: number; y: number; to: string[] }[] {
  const nature = new Set<number>([T.TREE, T.PINE, T.BUSH, T.ROCK, T.STUMP, T.CACTUS, T.BONES]), posts: { x: number; y: number; to: string[] }[] = [];
  const keep = (x: number, y: number) => { const k = y * MAP_W + x; if (before && !before.has(k)) before.set(k, { g: ground[y][x], o: objects[y][x] }); };
  const setG = (x: number, y: number, g: number) => { if (ground[y][x] !== g) { keep(x, y); ground[y][x] = g; } };
  const setO = (x: number, y: number, o: number) => { if (objects[y][x] !== o) { keep(x, y); objects[y][x] = o; } };
  const P = VILLAGE_PLAN;
  for (const v of VILLAGES) {
    if (only && !only.includes(v.id)) continue;
    const b = villageBox(v);
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (nature.has(objects[y][x])) setO(x, y, EMPTY);
    for (const [x, ly] of v.clear ?? []) if (nature.has(objects[vy(v, ly)][x])) setO(x, vy(v, ly), EMPTY);
    // the square, and dry ground under the houses
    for (let j = 0; j < P.square.h; j++) for (let i = 0; i < P.square.w; i++) { const t = vtile(v, P.square.dx + i, P.square.dy + j); setG(t.x, t.y, T.FLAGS); }
    const [roof, wall, win] = v.roof === "slate" ? [T.ROOF_SLATE, T.WALL_STONE, T.WINDOW_STONE] : v.roof === "adobe" ? [T.ADOBE, T.ADOBE, T.ADOBE]
      : [v.roof === "red" ? T.ROOF_RED : T.ROOF_THATCH, T.WALL_TIMBER, T.WINDOW_TIMBER];
    for (const h of villageHouses(v)) {
      for (let j = 0; j < h.h; j++) for (let i = 0; i < h.w; i++) { setG(h.x + i, h.y + j, T.DIRT); setO(h.x + i, h.y + j, j < h.h - 2 ? roof : wall); }
      const d = doorOf(h);
      setO(d.x, d.y, T.DOOR);
      if (d.y + 1 <= b.y1) setG(d.x, d.y + 1, T.DIRT); // a worn step before the door (inside the box)
      if (win !== T.ADOBE) for (const wx of [h.x + 1, h.x + h.w - 2]) if (wx !== d.x) setO(wx, d.y, win); // (mud-brick: no window tiles, like Kel Ashar's houses)
    }
    const s = villageSpots(v);
    setO(s.centre.x, s.centre.y, v.centre === "well" ? T.WELL : T.STANDING_STONE);
    for (const p of P.props) { const t = vtile(v, p.dx, p.dy); setO(t.x, t.y, p.kind === "crate" ? T.CRATE : p.kind === "barrel" ? T.BARREL : T.HAY); }
    // the path out to the road: dirt, the nature beside it left (a footpath, not a highway)
    for (const t of spurTiles(v)) {
      const k = t.y * MAP_W + t.x, g = ground[t.y][t.x], o = objects[t.y][t.x];
      if (roads.has(k)) break;
      if (g === T.WATER || g === T.BRIDGE || g === T.FLAGS || (o !== EMPTY && !nature.has(o))) continue; // (not over the square)
      setO(t.x, t.y, EMPTY); setG(t.x, t.y, T.DIRT);
    }
    const p = villagePost(v);
    if (!roads.has(p.y * MAP_W + p.x) && (objects[p.y][p.x] === EMPTY || nature.has(objects[p.y][p.x]))) { setO(p.x, p.y, T.SIGNPOST); posts.push({ x: p.x, y: p.y, to: names(v) }); }
  }
  return posts;
}
