/**
 * Saltmere, Act 1's fishing village on the south coast and its second safe town (docs/saltmere-rework-progress.md).
 * Layout constants only, in map tiles: shared/map.ts builds the village from them, the client can style the named
 * buildings from the footprints, and later phases (stash, ferry, watch-fire quest) hang their places on the reserved
 * spots. No import from shared/map.ts (it imports this file): tile ids are chosen there.
 */

/**
 * The village's area box ("Saltmere" in AREAS): the lanes, the buildings, the beach and both piers' roots. It runs from
 * the beach lane's west end to its east end: the signposts just beyond them (x 123 and 161) and the Coast Road's last
 * bend (x 124) stay outside, so the posts still point the way into town. The clearing (and its hedges and fences) is
 * one tile wider on each side.
 */
export const SALT_TOWN = { x: 125, y: 168, w: 36, h: 31 };
/** The flagstone harbour square on the sand between the two piers: Saltmere's safe zone (shared/map.ts SALT_SAFE). */
export const SALT_SQUARE = { x: 135, y: 188, w: 12, h: 7 };
/** The beach lane's row, and the columns of the two piers out over the water (the Harbour Street pier is the east one). */
export const SALT_LANE = 186;
export const SALT_PIERS = [134, 147] as const;
/** Upper Lane (row, east-west) in front of the new buildings, and Harbour Street (column) from the waystone to the pier. */
export const SALT_UPPER_LANE = { y: 176, x0: 125, x1: 160 };
export const SALT_HARBOUR_STREET = { x: 148, y0: 176, y1: 185 };

/** One of the village's buildings: footprint (roof rows on top, two wall rows, the door centred on the bottom row). */
export interface SaltBuilding {
  id: "tavern" | "chandlery" | "smokehouse" | "cottageE" | "cottageF" | "cottageG";
  name: string;
  x: number; y: number; w: number; h: number;
  wall: "stone" | "timber";
  roof: "thatch" | "red" | "slate";
}
/**
 * The new buildings (the four older fishers' houses stay as they were). Footprints so the client can give each its own
 * look later; the door is at (x + floor(w / 2), y + h - 1), its step on the row below.
 */
export const SALT_BUILDINGS: readonly SaltBuilding[] = [
  { id: "tavern", name: "The Gull & Anchor", x: 131, y: 171, w: 7, h: 5, wall: "stone", roof: "red" },
  { id: "chandlery", name: "The Chandlery", x: 139, y: 172, w: 5, h: 4, wall: "timber", roof: "slate" },
  { id: "smokehouse", name: "The Smokehouse", x: 150, y: 172, w: 6, h: 4, wall: "stone", roof: "thatch" },
  { id: "cottageE", name: "Cottage", x: 125, y: 173, w: 4, h: 3, wall: "timber", roof: "thatch" },
  { id: "cottageF", name: "Cottage", x: 155, y: 178, w: 4, h: 3, wall: "timber", roof: "thatch" },
  { id: "cottageG", name: "Cottage", x: 127, y: 168, w: 4, h: 3, wall: "timber", roof: "slate" },
];
/** The tile in front of a building's door. */
export const saltDoorStep = (b: SaltBuilding) => ({ x: b.x + Math.floor(b.w / 2), y: b.y + b.h });

/** Fish racks drying beside the smokehouse (tiles, solid like fences). */
export const SALT_RACKS: [number, number][] = [[157, 172], [158, 172], [157, 174], [158, 174]];

// ---------- reserved for later phases (nothing uses these yet) ----------
/** Where the square's stash chest will stand (phase 4: same account stash as Oakvale's). */
export const SALT_STASH = { x: 137, y: 189 };
/**
 * Where the ferry ties up (phase 7): the head of the Harbour Street pier, a short jetty at Gullrock Cove and one on
 * Heronwreck Strand east of the wreck. Each is a bridge tile at the end of its pier.
 */
export const SALT_JETTIES = {
  saltmere: { x: 147, y: 204 },
  gullrock: { x: 189, y: 194 },
  heronwreck: { x: 37, y: 201 },
} as const;
/** The two short jetties (shared/map.ts builds them): pier column, first row on the beach, last row over the water. */
export const JETTY_RUNS = [
  { id: "gullrock", x: 189, y0: 190, y1: 195 },
  { id: "heronwreck", x: 37, y0: 196, y1: 202 },
] as const;
/**
 * The rework's Act 1 carve boxes (map tiles, inclusive): nothing else in Act 1 changed for it (tests/badlands.test.ts).
 * The town's runs two rows north of the clearing: there the map's reachability pass (shared/map.ts section 14) no
 * longer cuts the old way out of the woods, and cuts a new one. Then the two jetties with their verges.
 */
export const SALT_BOXES = [
  { x0: 124, x1: 161, y0: 166, y1: 199 },
  { x0: 187, x1: 191, y0: 189, y1: 196 },
  { x0: 35, x1: 39, y0: 195, y1: 203 },
] as const;
/** The watch-fire cairn (phase 6) on the village's eastern point, on the sand beyond the square: kept open all round. */
export const WATCH_FIRE = { x: 160, y: 195 };
