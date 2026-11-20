import { actOfTile, TILE, type Act } from "../../shared/constants";
import { AREAS, BARNS, EMPTY, GROUND, HIGHWAY_TILES, NATURE, OBJECTS, PORTAL_SPOTS, SIGNPOSTS, T } from "../../shared/map";
import { NPCS, NPC_DECOR } from "../../shared/npcs";
import { CHESTS } from "../../shared/chests";
import { SIEGE_SITES } from "../../shared/siege";
import { HOLDS, MUSTERS } from "../../shared/war/standards";
import { TOWNS } from "../../shared/war/townSites";
import { CAPITAL_FORTS, FORT_SKIP, HIGHWAYS, legLine } from "../../shared/highways";
import { landmarkBoxes, LANDMARKS } from "../../shared/landmarks";
import { VILLAGES, villageBox, type VillageId } from "../../shared/villages";
import { BOARDS } from "../../shared/bounty";
import { allObjects } from "../../shared/quests";
import { WORLD_PROP_SPOTS } from "./worldPropSpots";
import { LK_SHEETS, type LkKind } from "./landKitSheets";

/**
 * Land kits (settlement network step 3, "land identity"): the small props that say what a land's people do, placed
 * round its settlements (Oakvale: stooks, scarecrows, grain carts, beehives, hide frames; the moors: peat and way-cairns;
 * the badlands: longhorns, troughs and ore carts; the Sinkholes: rope and gantries; the Sunscar: camels and salt; the Crown:
 * pavilions, shrines, quintains and pilgrims' ribbon posts). Phaser-free and
 * deterministic, the same on every client; landKitView.ts draws them. Cosmetic and walk-through: the server never
 * reads this file. The solid landmarks are shared/landmarks.ts.
 */
export { LK_SHEETS, type LkKind };
/** `village`: one of a highway village's props (shared/villages.ts; VILLAGE_KIT below). */
export interface KitSpot { kind: LkKind; land: Act; area: string; x: number; y: number; flip: boolean; village?: VillageId }

/** At most this many kit props per land (draw cost, and so the towns don't drown in clutter). */
export const KIT_BUDGET = 40;
/** Tiles kept round a capital fort's highway skip box (shared/highways.ts): the clan seats are dressed in step 5. */
export const SEAT_MARGIN = 12;

const MW = GROUND[0].length;
const hash = (x: number, y: number, s: number) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** Ground a kit prop never stands on. */
const BAD_GROUND = new Set<number>([T.WATER, T.BRIDGE, T.COBBLE, T.MARBLE, T.CROPS, T.FIELD]);
/** Ground that may not touch a kit prop's tile at all (roads stay a clear lane, banks stay dry). */
const NO_NEIGHBOUR = new Set<number>([T.WATER, T.BRIDGE, T.COBBLE, T.MARBLE]);

type Pt = readonly [x: number, y: number, r: number];
const tilePts = (ps: readonly { x: number; y: number }[], r: number): Pt[] => ps.map((p) => [p.x + 0.5, p.y + 0.5, r]);
const pxPts = (ps: readonly { x: number; y: number }[], r: number): Pt[] => ps.map((p) => [p.x / TILE, p.y / TILE, r]);
/** Points a kit prop keeps away from (tile centres, radius in tiles). Built once, on first use. */
let keepPts: Pt[] | undefined;
const keep = () => keepPts ??= [
  ...pxPts(NPCS, 2.5), ...NPC_DECOR.map((d): Pt => [d.x, d.y, 2.5]),
  ...tilePts(SIGNPOSTS, 2), ...pxPts(CHESTS, 2), ...pxPts(BOARDS, 2), ...pxPts(allObjects(), 2),
  ...tilePts(PORTAL_SPOTS, 3),
  ...TOWNS.flatMap((t) => tilePts([t.gate, t.steward, ...t.banners], 3)),
  ...pxPts([...HOLDS, ...MUSTERS], 7),
  ...WORLD_PROP_SPOTS.map((s): Pt => [s.x / TILE, s.y / TILE, s.kind === "wp_millwheel" || s.kind === "wp_shipwreck" ? 5 : 2]),
];
const FIELDS = new Set<number>([T.CROPS, T.FIELD]);
/** What may stand beside a pen kind (`pen` in kitFree): the pen's own fence and hay, the palisade it is built against. */
const PEN_SIDES = new Set<number>([T.FENCE, T.FENCE_V, T.PALISADE, T.HAY]);
const FENCES = new Set<number>([T.FENCE, T.FENCE_V, T.PALISADE]);
/** In a gap of a fence or palisade (a gateway): fence within 3 tiles on both sides, in its row or its column. */
function inGateway(tx: number, ty: number) {
  const fenceAt = (dx: number, dy: number) => { for (let k = 1; k <= 3; k++) if (FENCES.has(OBJECTS[ty + dy * k]?.[tx + dx * k] ?? -1)) return true; return false; };
  return (fenceAt(-1, 0) && fenceAt(1, 0)) || (fenceAt(0, -1) && fenceAt(0, 1));
}
/** A town gate: an open tile in a palisade, with palisade within 2 tiles on both sides of it, in its row or column. */
function palisadeGate(tx: number, ty: number) {
  if (OBJECTS[ty]?.[tx] === T.PALISADE) return false;
  const pal = (dx: number, dy: number) => OBJECTS[ty + dy]?.[tx + dx] === T.PALISADE || OBJECTS[ty + 2 * dy]?.[tx + 2 * dx] === T.PALISADE;
  return (pal(-1, 0) && pal(1, 0)) || (pal(0, -1) && pal(0, 1));
}
/** Within 3 tiles of a town gate: the way in stays clear. */
const nearGate = (tx: number, ty: number) => { for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (palisadeGate(tx + i, ty + j)) return true; return false; };
/** A capital fort's skip box widened by SEAT_MARGIN: the five clan seats. */
export const inSeat = (tx: number, ty: number) => CAPITAL_FORTS.some(([x, y]) => Math.abs(tx - x) <= FORT_SKIP + SEAT_MARGIN && Math.abs(ty - y) <= FORT_SKIP + SEAT_MARGIN);
/** Inside one of a landmark's solid boxes, or within `m` tiles of it. */
const nearLandmarkBox = (tx: number, ty: number, m: number) => LANDMARKS.some((l) => landmarkBoxes(l).some(([x, y, w, h]) => tx + 0.5 > x - m && tx + 0.5 < x + w + m && ty + 0.5 > y - m && ty + 0.5 < y + h + m));

/**
 * The keep-clear rule for a kit prop on tile (tx, ty): its 3x3 holds only empty ground or nature (no fence, wall,
 * door, stall, crate or well beside it), no road, highway, water or bridge; the tile itself is no field or crop
 * either (`onField`: a field or crop tile is fine, for scarecrows), no gateway in a fence, 3 tiles from a palisade gate; clear of NPCs and their props, signposts, chests, boards, quest objects, portal stones, war-town gates,
 * banners and stewards, forts and musters, siege works, the world props (worldPropSpots.ts), barns, landmarks, the
 * clan seats and the other kit props in `taken` (`gap` tiles). `pen`: stock inside a pen may stand against its fence,
 * hay and palisade (and the pen's gap is no gateway to keep clear: the beasts are walk-through).
 */
export function kitFree(tx: number, ty: number, taken: readonly KitSpot[] = [], gap = 2, onField = false, pen = false): boolean {
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const o = OBJECTS[ty + j]?.[tx + i], g = GROUND[ty + j]?.[tx + i];
    if (o === undefined || g === undefined) return false;
    if (i === 0 && j === 0 ? o !== EMPTY || (BAD_GROUND.has(g) && !(onField && FIELDS.has(g))) : o !== EMPTY && !NATURE.has(o) && !(pen && PEN_SIDES.has(o))) return false;
    if (NO_NEIGHBOUR.has(g) || HIGHWAY_TILES.has((ty + j) * MW + tx + i)) return false;
  }
  if ((!pen && (inGateway(tx, ty) || nearGate(tx, ty))) || inSeat(tx, ty) || nearLandmarkBox(tx, ty, 1.5)) return false;
  if (BARNS.some((b) => tx >= b.x - 1 && tx <= b.x + b.w && ty >= b.y - 1 && ty <= b.y + b.h)) return false;
  if (SIEGE_SITES.some((s) => Math.abs(s.tx - tx) <= 9 && Math.abs(s.ty - ty) <= 4)) return false; // the siege works (worldProps rule)
  const cx = tx + 0.5, cy = ty + 0.5;
  for (const [x, y, r] of keep()) if (Math.abs(x - cx) < r && Math.abs(y - cy) < r && Math.hypot(x - cx, y - cy) < r) return false;
  for (const s of taken) if (Math.hypot(s.x / TILE - cx, s.y / TILE - cy) < gap) return false;
  return true;
}

/** Within `r` tiles of one of these grounds (stooks by the fields, a cart by the square). */
const byGround = (gs: number[], r: number) => (tx: number, ty: number) => {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (gs.includes(GROUND[ty + j]?.[tx + i] ?? -1)) return true;
  return false;
};
/** Within `r` tiles of a landmark's foot; `front`: on the side the camera sees (the sails would hide it behind). */
const byLandmark = (id: string, r: number, front = false) => (tx: number, ty: number) =>
  LANDMARKS.some((l) => l.id === id && Math.hypot(l.x - tx - 0.5, l.y - ty - 0.5) <= r && (!front || tx + ty + 1 > l.x + l.y + 1.5));

interface Place {
  area: string; kind: LkKind; n: number; gap?: number; near?: (tx: number, ty: number) => boolean;
  /** Sample only this box of tiles (x, y, w, h) of the area: a few spots near a town in a land-wide area. */
  box?: readonly [number, number, number, number];
  /** The highway village these props dress (KitSpot.village). */
  village?: VillageId;
}
/** Kinds that stand in a field or crop rather than beside it. */
export const ON_FIELD: ReadonlySet<LkKind> = new Set<LkKind>(["lk_scarecrow"]);
/** Kinds that stand inside a pen, against its fence (kitFree's `pen`). */
export const IN_PEN: ReadonlySet<LkKind> = new Set<LkKind>(["lk_longhorn", "lk_trough"]);
/** Inside a box of tiles (x0..x1, y0..y1, inclusive). */
const inBox = (x0: number, y0: number, x1: number, y1: number) => (tx: number, ty: number) => tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1;
/** Within `r` tiles of an area's rectangle (just outside a palisade). */
const byArea = (name: string, r: number) => { const a = AREAS.find((q) => q.name === name)!; return (tx: number, ty: number) => tx >= a.x - r && tx < a.x + a.w + r && ty >= a.y - r && ty < a.y + a.h + r; };

/**
 * Oakvale grows and mills grain: stooks and a cart round the windmill, stooks and a scarecrow by Goldenreach's north
 * field (the fort's end of the farms is the seat, left for step 5), beehives in the orchard corners, a sack cart at
 * Millbrook and on the edge of Oakvale's square, and hide frames at the Hunter's Camp.
 */
const OAKVALE: Place[] = [
  { area: "North Meadow", kind: "lk_grain_cart", n: 1, near: byLandmark("windmill", 4.5, true) },
  { area: "North Meadow", kind: "lk_stook", n: 9, gap: 2.2, near: byLandmark("windmill", 10) },
  { area: "North Meadow", kind: "lk_beehives", n: 1, gap: 4, near: byLandmark("windmill", 14) },
  { area: "Goldenreach Farms", kind: "lk_scarecrow", n: 1, near: (tx, ty) => GROUND[ty][tx] === T.FIELD },
  { area: "Goldenreach Farms", kind: "lk_stook", n: 8, gap: 2.2, near: byGround([T.FIELD], 3) },
  { area: "Goldenreach Farms", kind: "lk_beehives", n: 1, gap: 4 },
  { area: "Millbrook Mill", kind: "lk_grain_cart", n: 1, near: (tx) => tx <= 106 }, // west of the mill: north of it, its roof hides the cart
  { area: "Millbrook Mill", kind: "lk_beehives", n: 1, gap: 3, near: (tx) => tx <= 106 },
  { area: "Hunter's Camp", kind: "lk_hide_frame", n: 2, gap: 3 },
  { area: "Oakvale", kind: "lk_grain_cart", n: 1, near: byGround([T.COBBLE], 2) },
];

/**
 * The moors cut peat and bury their dead under barrows: peat stacks by Cairnwatch's halls, cut banks on the bog outside
 * its palisade, a fuel stack at the Beacon Cairn's foot; way-cairns line the Moors Highway (MOORS_CAIRNS).
 */
const MOORS: Place[] = [
  { area: "Cairnwatch", kind: "lk_peat_stack", n: 4, gap: 4 },
  { area: "The Grey Barrow Moors", kind: "lk_peat_stack", n: 1, box: [71, 686, 13, 13], near: byLandmark("beacon", 6, true) },
  { area: "The Grey Barrow Moors", kind: "lk_peat_bank", n: 3, gap: 6, box: [55, 687, 45, 37], near: (tx, ty) => byArea("Cairnwatch", 9)(tx, ty) && !byArea("Cairnwatch", 1)(tx, ty) },
];
/** A way-cairn about every this many tiles of the Moors Highway's middle line, 3 to 5 tiles off it. */
const CAIRN_EVERY = 22;
/**
 * The badlands drive cattle and dig cinnabar: longhorns and a trough in the Rustwater Post's drovers' pen (its fence row
 * and the palisade's south-east corner), more of the herd grazing outside the palisade, ore carts by the Cinnabar Pits'
 * headframe. (No cart in the post: its yard is the lane from the south gate to the square.)
 */
const BADLANDS: Place[] = [
  { area: "The Rustwater Post", kind: "lk_trough", n: 1, near: inBox(238, 876, 244, 878) },
  { area: "The Rustwater Post", kind: "lk_longhorn", n: 3, gap: 2, near: inBox(238, 876, 244, 878) },
  { area: "The Red Badlands", kind: "lk_longhorn", n: 3, gap: 4, box: [213, 853, 42, 36], near: (tx, ty) => byArea("The Rustwater Post", 9)(tx, ty) && !byArea("The Rustwater Post", 2)(tx, ty) },
  { area: "The Cinnabar Pits", kind: "lk_ore_cart", n: 2, gap: 4, near: byLandmark("headframe", 7) },
];

/** Within `r` tiles of an object of this kind (a gantry by a pit's rim). */
const byObject = (o: number, r: number) => (tx: number, ty: number) => {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (OBJECTS[ty + j]?.[tx + i] === o) return true;
  return false;
};
/**
 * The Sinkholes live by rope and lift: a rope walk in Ropewell's east yard (between the palisade and the crates), coils of
 * rope in its west yard, tripod gantries with their cage baskets on pit rims in Hollowbrook Dells and round the Great
 * Maw. The Ropewell Lift itself is the landmark over the square's sinkhole.
 */
const SINKHOLES: Place[] = [
  { area: "Ropewell", kind: "lk_rope_walk", n: 1, near: inBox(122, 990, 123, 991) },
  { area: "Ropewell", kind: "lk_rope_coil", n: 2, gap: 3, near: inBox(105, 990, 109, 993) },
  { area: "Hollowbrook Dells", kind: "lk_gantry", n: 1, box: [50, 994, 20, 16], near: byObject(T.PIT, 2) },
  { area: "Hollowbrook Dells", kind: "lk_rope_coil", n: 1, box: [50, 994, 20, 16], near: byObject(T.PIT, 3) },
  { area: "The Great Maw", kind: "lk_gantry", n: 2, gap: 8, near: byObject(T.PIT, 2) },
];
/**
 * The Sunscar moves salt by caravan: the camel string and salt slabs round the caravan halt outside Kel Ashar's east
 * gate, salt stacks in the town, camels and salt at the oases (Jackal Springs keeps to stacks: Hamid's camels ran), and
 * salt pans with a stack on the Glasswind Flats.
 */
const SUNSCAR: Place[] = [
  { area: "The Sunscar", kind: "lk_camel_load", n: 1, box: [164, 398, 16, 10], near: byLandmark("caravan", 5) },
  { area: "The Sunscar", kind: "lk_camel", n: 1, box: [164, 398, 16, 10], near: byLandmark("caravan", 6) },
  { area: "The Sunscar", kind: "lk_salt_stack", n: 1, box: [164, 398, 16, 10], near: byLandmark("caravan", 5) },
  { area: "Kel Ashar", kind: "lk_salt_stack", n: 2, gap: 6 },
  { area: "Jackal Springs", kind: "lk_salt_stack", n: 2, gap: 4 },
  { area: "Palmshade Oasis", kind: "lk_camel", n: 2, gap: 5 },
  { area: "Palmshade Oasis", kind: "lk_salt_stack", n: 1 },
  { area: "Mirage Wells", kind: "lk_camel_load", n: 1 },
  { area: "Mirage Wells", kind: "lk_salt_stack", n: 1 },
  { area: "The Glasswind Flats", kind: "lk_salt_pan", n: 3, gap: 4, box: [138, 426, 22, 14] },
  { area: "The Glasswind Flats", kind: "lk_salt_stack", n: 1, box: [138, 426, 22, 14] },
];

/**
 * The Crown keeps the Truce fair and the tourney: heralds' pavilions round Tollcross Square (never behind the herald, who
 * stands at its head), a candle shrine with pilgrims' staves by it in the north-west corner and a quintain on the
 * south-east ground; at the Lists, knights' pavilions and a quintain at the tilt's east end. On the Pilgrims' Way, staves
 * where pilgrims arrive from the Greenward Gate and ribbon posts along the Greenward road (`cairns`); the quest's
 * wayside shrines there are their own objects.
 */
const CROWN: Place[] = [
  { area: "Tollcross", kind: "lk_candle_shrine", n: 1, near: inBox(125, 1185, 132, 1191) },
  { area: "Tollcross", kind: "lk_pilgrim_staves", n: 1, near: inBox(127, 1186, 133, 1193) },
  { area: "Tollcross", kind: "lk_pavilion", n: 1, gap: 5, box: [126, 1185, 9, 10] },
  { area: "Tollcross", kind: "lk_pavilion_blue", n: 1, gap: 5, box: [126, 1185, 9, 10] },
  { area: "Tollcross", kind: "lk_pavilion", n: 1, gap: 5, box: [153, 1185, 9, 10] },
  { area: "Tollcross", kind: "lk_pavilion_blue", n: 1, gap: 5, box: [153, 1185, 9, 10] },
  { area: "Tollcross", kind: "lk_quintain", n: 1, near: inBox(151, 1198, 161, 1202) },
  { area: "The Tourney Grounds", kind: "lk_quintain", n: 1, box: [96, 1207, 5, 4] },
  { area: "The Tourney Grounds", kind: "lk_pavilion", n: 1, gap: 5, near: byLandmark("lists", 10) },
  { area: "The Tourney Grounds", kind: "lk_pavilion_blue", n: 1, gap: 5, near: byLandmark("lists", 10) },
  { area: "The Pilgrims' Way", kind: "lk_pilgrim_staves", n: 1, near: inBox(30, 1170, 44, 1182) },
];

/** Within `r` tiles of a village's box (shared/villages.ts), outside it by at least `out`. */
const byVillage = (id: string, r: number, out = 0) => { const b = villageBox(VILLAGES.find((v) => v.id === id)!); return (tx: number, ty: number) =>
  tx >= b.x0 - r && tx <= b.x1 + r && ty >= b.y0 - r && ty <= b.y1 + r && !(tx >= b.x0 - out && tx <= b.x1 + out && ty >= b.y0 - out && ty <= b.y1 + out); };
/** A village's box widened by `r` (a `Place.box` sampling round it in its land-wide area). */
const villageAround = (id: string, r: number): [number, number, number, number] => { const b = villageBox(VILLAGES.find((v) => v.id === id)!); return [b.x0 - r, b.y0 - r, b.x1 - b.x0 + 1 + 2 * r, b.y1 - b.y0 + 1 + 2 * r]; };
/**
 * The villages along the highways (settlement network step 4) carry their land's kit: peat stacks by Turfhallow's and
 * the Staithe's cottages and cut banks outside Turfhallow, way-cairns round Barrowstead (the Staithe keeps the highway's
 * way-cairn below its square); ore carts by Redlode, longhorns and a trough round Hornstead; rope and a gantry at Windlass and
 * Hempfield, salt and camels at Saltglass and Last Well; pavilions, staves, a candle shrine and ribbon posts in the Crown's
 * three, a cart and a frame at Sawyer's End, hives and stooks at Furrowby. Placed after every other kit, so the older spots never move.
 */
const VILLAGE_KIT: Place[] = [
  { area: "Turfhallow", kind: "lk_peat_stack", n: 1, gap: 3, village: "turfhallow" },
  { area: "The Grey Barrow Moors", kind: "lk_peat_bank", n: 2, gap: 5, box: villageAround("turfhallow", 7), near: byVillage("turfhallow", 7, 2), village: "turfhallow" },
  { area: "The Grey Barrow Moors", kind: "lk_peat_stack", n: 1, box: villageAround("staithe", 4), near: byVillage("staithe", 4, 1), village: "staithe" },
  { area: "The Grey Barrow Moors", kind: "lk_way_cairn", n: 2, gap: 6, box: villageAround("barrowstead", 6), near: byVillage("barrowstead", 6, 2), village: "barrowstead" },
  { area: "The Red Badlands", kind: "lk_ore_cart", n: 2, gap: 4, box: villageAround("redlode", 5), near: byVillage("redlode", 5, 1), village: "redlode" },
  { area: "The Red Badlands", kind: "lk_longhorn", n: 3, gap: 3, box: villageAround("hornstead", 6), near: byVillage("hornstead", 6, 2), village: "hornstead" },
  { area: "The Red Badlands", kind: "lk_trough", n: 1, box: villageAround("hornstead", 5), near: byVillage("hornstead", 5, 1), village: "hornstead" },
  // PR 2 (appended, so PR 1's spots never move): rope coils on Windlass's square and a gantry on the Maw's rim beside it,
  // coils of new rope at Hempfield; salt stacks and pans round Saltglass, kneeling camels and a stack at Last Well
  { area: "Windlass", kind: "lk_rope_coil", n: 1, village: "windlass" },
  { area: "The Mawdeep Sinkholes", kind: "lk_gantry", n: 1, box: villageAround("windlass", 6), near: (tx, ty) => byVillage("windlass", 6, 1)(tx, ty) && byObject(T.PIT, 2)(tx, ty), village: "windlass" },
  { area: "Hempfield", kind: "lk_rope_coil", n: 1, village: "hempfield" },
  { area: "The Mawdeep Sinkholes", kind: "lk_rope_coil", n: 1, box: villageAround("hempfield", 5), near: byVillage("hempfield", 5, 1), village: "hempfield" },
  { area: "Saltglass", kind: "lk_salt_stack", n: 1, village: "saltglass" },
  { area: "The Sunscar", kind: "lk_salt_pan", n: 2, gap: 4, box: villageAround("saltglass", 6), near: byVillage("saltglass", 6, 2), village: "saltglass" },
  { area: "The Sunscar", kind: "lk_camel", n: 2, gap: 4, box: villageAround("lastwell", 5), near: byVillage("lastwell", 5, 1), village: "lastwell" },
  { area: "The Sunscar", kind: "lk_salt_stack", n: 1, box: villageAround("lastwell", 4), near: byVillage("lastwell", 4, 1), village: "lastwell" },
  // PR 3 (appended, so the older spots never move): a quintain at Lists End with a red and a blue pavilion outside it,
  // pilgrims' staves and a candle shrine at Vigil's Rest, staves and ribbon posts at Kneelstone; a cart and a frame at
  // Sawyer's End (the Whispering Woods round it), hives in Furrowby and stooks and a scarecrow on the ground above it
  // (the Sunken Lake's edge: no other named area round it in the open country)
  { area: "Lists End", kind: "lk_quintain", n: 1, village: "listsend" },
  { area: "The Crown of the Marches", kind: "lk_pavilion", n: 1, gap: 5, box: villageAround("listsend", 6), near: byVillage("listsend", 6, 2), village: "listsend" },
  { area: "The Crown of the Marches", kind: "lk_pavilion_blue", n: 1, gap: 5, box: villageAround("listsend", 6), near: byVillage("listsend", 6, 2), village: "listsend" },
  { area: "The Crown of the Marches", kind: "lk_pilgrim_staves", n: 1, box: villageAround("vigilsrest", 5), near: byVillage("vigilsrest", 5, 1), village: "vigilsrest" },
  { area: "The Crown of the Marches", kind: "lk_candle_shrine", n: 1, box: villageAround("vigilsrest", 5), near: byVillage("vigilsrest", 5, 1), village: "vigilsrest" },
  { area: "Kneelstone", kind: "lk_pilgrim_staves", n: 1, village: "kneelstone" },
  { area: "The Crown of the Marches", kind: "lk_ribbon_post", n: 2, gap: 4, box: villageAround("kneelstone", 6), near: byVillage("kneelstone", 6, 2), village: "kneelstone" },
  { area: "Sawyer's End", kind: "lk_grain_cart", n: 1, village: "sawyersend" },
  { area: "Whispering Woods", kind: "lk_hide_frame", n: 1, box: villageAround("sawyersend", 5), near: byVillage("sawyersend", 5, 1), village: "sawyersend" },
  { area: "Furrowby", kind: "lk_beehives", n: 1, village: "furrowby" },
  { area: "Sunken Lake", kind: "lk_stook", n: 2, gap: 2.2, box: villageAround("furrowby", 8), near: byVillage("furrowby", 8, 2), village: "furrowby" },
  { area: "Sunken Lake", kind: "lk_scarecrow", n: 1, box: villageAround("furrowby", 8), near: byVillage("furrowby", 8, 2), village: "furrowby" },
];

/** Way-cairns beside a land's highway: every CAIRN_EVERY tiles of each leg, on the first free tile 3-5 off either side. */
function cairns(out: KitSpot[], land: Act, area: string, kind: LkKind) {
  const h = HIGHWAYS.find((q) => q.land === land), a = AREAS.find((r) => r.name === area);
  if (!h || !a) return;
  for (const leg of h.legs) {
    const line = legLine(h, leg);
    for (let i = CAIRN_EVERY / 2; i + 2 < line.length; i += CAIRN_EVERY) {
      const [x0, y0] = [line[i - 2] % MW, Math.floor(line[i - 2] / MW)], [x1, y1] = [line[i + 2] % MW, Math.floor(line[i + 2] / MW)];
      const mx = line[i] % MW, my = Math.floor(line[i] / MW), dl = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / dl, ny = (x1 - x0) / dl;
      const side = hash(mx, my, 77) < 0.5 ? 1 : -1;
      found: for (const sd of [side, -side]) for (const off of [3, 4, 5]) {
        const tx = Math.round(mx + nx * off * sd), ty = Math.round(my + ny * off * sd);
        if (tx < a.x || ty < a.y || tx >= a.x + a.w || ty >= a.y + a.h || !kitFree(tx, ty, out, 8)) continue;
        out.push({ kind, land: actOfTile(tx, ty), area, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, flip: hash(tx, ty, 5) < 0.5 });
        break found;
      }
    }
  }
}

/** Up to `p.n` free spots for `p.kind` in the area, picked by a fixed hash (the same on every client). */
function scatter(out: KitSpot[], p: Place) {
  const a = AREAS.find((r) => r.name === p.area);
  if (!a) return;
  const r = p.box ? { x: p.box[0], y: p.box[1], w: p.box[2], h: p.box[3] } : a;
  let placed = 0;
  for (let k = 0; k < 600 && placed < p.n; k++) {
    const tx = r.x + Math.floor(hash(k, p.n, p.kind.length * 31 + r.x) * r.w), ty = r.y + Math.floor(hash(p.n, k, p.kind.length * 17 + r.y * 3) * r.h);
    if (tx < a.x || ty < a.y || tx >= a.x + a.w || ty >= a.y + a.h) continue;
    if (!kitFree(tx, ty, out, p.gap ?? 3, ON_FIELD.has(p.kind), IN_PEN.has(p.kind)) || (p.near && !p.near(tx, ty))) continue;
    // the foot jitters inside its tile so a row of stooks doesn't stand on the grid
    const jx = (hash(tx, ty, 11) - 0.5) * 0.5, jy = (hash(tx, ty, 12) - 0.5) * 0.5;
    out.push({ kind: p.kind, land: actOfTile(tx, ty), area: p.area, x: (tx + 0.5 + jx) * TILE, y: (ty + 0.5 + jy) * TILE, flip: hash(tx, ty, 5) < 0.5, ...(p.village ? { village: p.village } : {}) });
    placed++;
  }
}

function build(): KitSpot[] {
  const out: KitSpot[] = [];
  for (const p of [...OAKVALE, ...MOORS]) scatter(out, p);
  cairns(out, 3, "The Grey Barrow Moors", "lk_way_cairn");
  for (const p of [...BADLANDS, ...SINKHOLES, ...SUNSCAR]) scatter(out, p);
  for (const p of CROWN) scatter(out, p);
  cairns(out, 6, "The Pilgrims' Way", "lk_ribbon_post");
  for (const p of VILLAGE_KIT) scatter(out, p);
  return out;
}

/** Every kit prop in the world. */
export const LAND_KIT_SPOTS: readonly KitSpot[] = build();
/** For tests: the same table built again (it must come out identical). */
export const buildLandKit = build;

/** The sheet each landmark is drawn with (shared/landmarks.ts id -> kit sheet). */
export const LANDMARK_SHEET: Record<string, LkKind> = { windmill: "lk_windmill", beacon: "lk_beacon", headframe: "lk_headframe", lift: "lk_lift", caravan: "lk_caravan", lists: "lk_lists" };
/**
 * More sprites of a landmark, each at its own foot (tiles), so heroes between its parts sort between them: the Lists'
 * tilt barrier stands in front of the riders' lane, its stand behind it (shared/landmarks.ts `parts`).
 */
export const LANDMARK_PARTS: Record<string, readonly { kind: LkKind; x: number; y: number }[]> = { lists: [{ kind: "lk_tilt", x: 92.25, y: 1207.5 }] };
/**
 * Landmarks that shine after dusk, from a fire you can see on the sheet (the game's rule: no light without a source).
 * `lift` raises the glow to the flame (world px above the foot), `scale` its size.
 */
export const LANDMARK_LIGHT: Record<string, { lift: number; color: number; scale: number }> = { beacon: { lift: 52, color: 0xff9a3a, scale: 4.5 } };
