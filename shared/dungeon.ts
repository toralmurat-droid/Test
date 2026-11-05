import { MAP_H, MAP_W, TILE, WORLD_H } from "./constants";

/**
 * The Mawdeep Warrens (Murat 2026-11-05): a dungeon of three floors under the Whispering Woods, dug out by the
 * beast-folk, men and women of the valley sewn into animal hides by the Hide-Mother's rite.
 *
 * The floors live in the underground band of the map (rows WORLD_H..MAP_H, below the Saltwind Sea), each walled in
 * by solid rock, so the server, the collisions and the pathing need nothing special. Heroes go down and up by
 * walking onto a rope or a stair (LINKS): the server moves them to the other end. Tiles in tiles, points in px.
 *
 * Each floor is a set of chambers (ellipses, local tile coords) joined by winding tunnels. map.ts carves them.
 */
export interface Chamber { x: number; y: number; rx: number; ry: number; flags?: boolean }
export interface Floor {
  id: number; name: string;
  x: number; y: number; w: number; h: number;
  chambers: Chamber[];
  /** tunnels between chambers (indices), with a bend */
  tunnels: [number, number, number][];
}

/** Rows WORLD_H..SEA_END stay sea (the overworld coast looks out on open water), the rest is rock. */
export const SEA_END = WORLD_H + 10;

const F1: Floor = {
  id: 1, name: "The Gnawing Halls", x: 10, y: 228, w: 68, h: 54,
  chambers: [
    { x: 9, y: 8, rx: 5, ry: 4.5 },      // 0 under the sinkhole: the rope
    { x: 27, y: 9, rx: 6.5, ry: 5 },     // 1 the midden
    { x: 13, y: 27, rx: 7, ry: 6 },      // 2 rat nest
    { x: 34, y: 28, rx: 9, ry: 7.5, flags: true }, // 3 the old gnawed hall
    { x: 53, y: 12, rx: 6.5, ry: 5.5 },  // 4
    { x: 52, y: 36, rx: 7.5, ry: 6.5 },  // 5 the boar wallow
    { x: 59, y: 47, rx: 4.5, ry: 4 },    // 6 the stair down
    { x: 18, y: 45, rx: 5.5, ry: 4.5 },  // 7 side burrow
  ],
  tunnels: [[0, 1, 1.5], [0, 2, -2], [1, 3, 2], [2, 3, -1.5], [1, 4, -2], [4, 5, 2.5], [3, 5, -2], [5, 6, 1], [2, 7, 2], [7, 3, -2]],
};
const F2: Floor = {
  id: 2, name: "The Silk Pens", x: 98, y: 228, w: 68, h: 54,
  chambers: [
    { x: 9, y: 8, rx: 5, ry: 4.5 },      // 0 stair up
    { x: 25, y: 14, rx: 7.5, ry: 6 },    // 1 the web hall
    { x: 12, y: 32, rx: 6.5, ry: 6 },    // 2 pens (cocoons)
    { x: 34, y: 34, rx: 8.5, ry: 7, flags: true }, // 3 the skinning floor
    { x: 50, y: 10, rx: 6.5, ry: 5.5 },  // 4 pens (cocoons)
    { x: 53, y: 30, rx: 8, ry: 7 },      // 5 Gorehowl's lair
    { x: 59, y: 47, rx: 4.5, ry: 4 },    // 6 stair down
    { x: 28, y: 48, rx: 5.5, ry: 4 },    // 7 pens (cocoons)
  ],
  tunnels: [[0, 1, 1.5], [1, 2, -2], [1, 4, -1.5], [2, 3, 2], [3, 5, -1.5], [4, 5, 2], [5, 6, 1.5], [3, 7, 1.5]],
};
const F3: Floor = {
  id: 3, name: "The Hide-Mother's Den", x: 186, y: 228, w: 72, h: 56,
  chambers: [
    { x: 9, y: 8, rx: 5, ry: 4.5 },      // 0 stair up
    { x: 23, y: 18, rx: 7, ry: 6 },      // 1
    { x: 10, y: 36, rx: 6, ry: 6 },      // 2
    { x: 40, y: 11, rx: 8, ry: 6.5 },    // 3 the Hornbrute's byre
    { x: 46, y: 36, rx: 14, ry: 12, flags: true }, // 4 the Hide-Mother's den
  ],
  tunnels: [[0, 1, 1.5], [1, 2, -2], [1, 3, 2], [2, 4, 2.5], [3, 4, -2.5]],
};
export const FLOORS: Floor[] = [F1, F2, F3];

/** A chamber's centre (tile, world). */
export const chamberAt = (f: Floor, i: number): [number, number] => [f.x + f.chambers[i].x, f.y + f.chambers[i].y];

/** The sinkhole in the Whispering Woods, north of the trail to Redfang Hollow (tile of its mouth). */
export const SINKHOLE = { x: 214, y: 99 };

/** Ropes and stairs. Walking within `r` px of (x, y) takes a hero to `to` (which faces the way back, a step away from its own link). */
export interface Link { id: string; label: string; x: number; y: number; to: string; down: boolean; floor: number }
const at = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });
const [f1in, f1down, f2in, f2down, f3in] = [chamberAt(F1, 0), chamberAt(F1, 6), chamberAt(F2, 0), chamberAt(F2, 6), chamberAt(F3, 0)];
export const LINKS: Link[] = [
  { id: "sink", label: "Climb down into the Mawdeep", ...at(SINKHOLE.x, SINKHOLE.y), to: "f1up", down: true, floor: 0 },
  { id: "f1up", label: "Climb up to the woods", ...at(f1in[0] - 2, f1in[1] - 2), to: "sink", down: false, floor: 1 },
  { id: "f1down", label: "Go down to the Silk Pens", ...at(f1down[0] + 1, f1down[1] + 1), to: "f2up", down: true, floor: 1 },
  { id: "f2up", label: "Go up to the Gnawing Halls", ...at(f2in[0] - 2, f2in[1] - 2), to: "f1down", down: false, floor: 2 },
  { id: "f2down", label: "Go down to the Hide-Mother's Den", ...at(f2down[0] + 1, f2down[1] + 1), to: "f3up", down: true, floor: 2 },
  { id: "f3up", label: "Go up to the Silk Pens", ...at(f3in[0] - 2, f3in[1] - 2), to: "f2down", down: false, floor: 3 },
];
export const LINK_RANGE = 0.75 * TILE;
/** Where a hero arriving through link `l` stands: two steps out of it, toward the chamber. */
export function arrivalAt(l: Link): { x: number; y: number } {
  if (l.id === "sink") return { x: l.x, y: l.y + 2 * TILE };
  return { x: l.x + 2 * TILE * (l.down ? -1 : 1) * 0.75, y: l.y + 2 * TILE * (l.down ? -1 : 1) * 0.75 };
}
export const linkById = (id: string) => LINKS.find((l) => l.id === id);

/** Floor at a tile (undefined above ground). */
export function floorAt(tx: number, ty: number): Floor | undefined {
  if (ty < WORLD_H) return undefined;
  return FLOORS.find((f) => tx >= f.x && tx < f.x + f.w && ty >= f.y && ty < f.y + f.h);
}
/** True below the surface (pixel coords). */
export const underground = (py: number) => py >= WORLD_H * TILE;
export const floorAtPx = (px: number, py: number) => floorAt(Math.floor(px / TILE), Math.floor(py / TILE));

/**
 * Elite lairs and the boss den (map areas, tile rects): the Packlord's chamber, the Hornbrute's byre, and the mini-boss
 * zones (Old Gnasher's warren on the first floor, the Weaver's loom on the second). Each lair's guardians keep a chest (chests.ts).
 */
const lair = (f: Floor, i: number, name: string) => { const c = f.chambers[i]; return { name, x: Math.round(f.x + c.x - c.rx - 1), y: Math.round(f.y + c.y - c.ry - 1), w: Math.round(c.rx * 2 + 2), h: Math.round(c.ry * 2 + 2) }; };
export const LAIRS = [lair(F2, 5, "Gorehowl's Lair"), lair(F3, 3, "The Hornbrute's Byre"), lair(F3, 4, "The Hide-Mother's Bed"), lair(F1, 7, "Gnasher's Warren"), lair(F2, 1, "The Weaver's Loom")];
/** The boss den's centre (tile): the Hide-Mother rises from her bed of hides here. */
export const DEN = { x: F3.x + F3.chambers[4].x, y: F3.y + F3.chambers[4].y };
/** The three hide totems round her bed (quest objects, tiles). */
export const TOTEMS: [number, number][] = [[DEN.x - 9, DEN.y - 4], [DEN.x + 9, DEN.y - 4], [DEN.x, DEN.y + 8]];
/** Trappers wrapped in silk in the pens (quest objects, tiles): one in each pen chamber of floor 2. */
export const COCOONS: [number, number][] = [chamberAt(F2, 2), chamberAt(F2, 4), chamberAt(F2, 7)].map(([x, y]) => [x + 2, y - 1]);

/**
 * Lit braziers and rite-fires (tiles): the only light down there, besides the one heroes carry (client darkness).
 * One per chamber, a little off its centre, plus the den's ring.
 */
export const BRAZIERS: [number, number][] = [
  ...FLOORS.flatMap((f) => f.chambers.map((c, i): [number, number] => [f.x + Math.round(c.x + (i % 2 ? 2 : -2)), f.y + Math.round(c.y - c.ry * 0.5)])),
  [DEN.x - 5, DEN.y + 6], [DEN.x + 5, DEN.y + 6],
];

// sanity: the dungeon must fit the map
for (const f of FLOORS) if (f.x + f.w > MAP_W || f.y + f.h > MAP_H || f.y < SEA_END) throw new Error(`dungeon floor ${f.name} is outside the map`);

/** Floor number at a point in px (0 above ground). */
export const floorNo = (px: number, py: number) => (underground(py) ? floorAtPx(px, py)?.id ?? 0 : 0);
/**
 * When a quest target is on another floor than the hero, the rope or stair to take first (else undefined):
 * the way down when the target is deeper, the way up otherwise.
 */
export function routeVia(tx: number, ty: number, hx: number, hy: number): Link | undefined {
  const hf = floorNo(hx, hy), tf = floorNo(tx, ty);
  if (hf === tf) return undefined;
  return LINKS.find((l) => l.floor === hf && l.down === tf > hf);
}
