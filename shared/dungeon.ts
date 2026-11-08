import { MAP_W, TILE, UNDER_END, WORLD_H } from "./constants";

/**
 * The Mawdeep Warrens (Murat 2026-11-05): a dungeon of three floors under the Whispering Woods, dug out by the
 * beast-folk, men and women of the valley sewn into animal hides by the Hide-Mother's rite.
 *
 * The floors live in the underground band of the map (rows WORLD_H..UNDER_END, below the Saltwind Sea), each walled in
 * by solid rock, so the server, the collisions and the pathing need nothing special. Heroes go down and up by
 * walking onto a rope or a stair (LINKS): the server moves them to the other end. Tiles in tiles, points in px.
 *
 * Each floor is a set of chambers (ellipses, local tile coords) joined by winding tunnels. map.ts carves them.
 */
export interface Chamber { x: number; y: number; rx: number; ry: number; flags?: boolean;
  /** a hidden treasure room behind a cracked wall (map.ts walls its tunnel with a "crack" door) */
  secret?: boolean }
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
    { x: 9, y: 8, rx: 4.5, ry: 4 },      // 0 under the sinkhole: the rope
    { x: 27, y: 9, rx: 5.5, ry: 4.5 },   // 1 the midden (what is left is thrown here)
    { x: 13, y: 27, rx: 5.5, ry: 4.5 },  // 2 the cages (the villagers brought down are kept here)
    { x: 34, y: 28, rx: 7, ry: 5.5, flags: true }, // 3 the butchery, in the old flagged hall
    { x: 53, y: 12, rx: 5, ry: 4.5 },    // 4 the larder
    { x: 52, y: 36, rx: 6, ry: 5 },      // 5 the boar wallow
    { x: 59, y: 47, rx: 4.5, ry: 4 },    // 6 the stair down
    { x: 18, y: 45, rx: 5.5, ry: 4.5 },  // 7 Old Gnasher's warren
    { x: 62, y: 9, rx: 2.5, ry: 2, secret: true }, // 8 behind the larder's cracked wall
  ],
  tunnels: [[0, 1, 1.5], [0, 2, -2], [1, 3, 2], [2, 3, -1.5], [1, 4, -2], [4, 5, 2.5], [3, 5, -2], [5, 6, 1], [2, 7, 2], [7, 3, -2], [4, 8, 0],
    [6, 7, 0]], // the old drain from the stair back to the warren (a shortcut, barred from the stair's side)
};
const F2: Floor = {
  id: 2, name: "The Silk Pens", x: 98, y: 228, w: 68, h: 54,
  chambers: [
    { x: 9, y: 8, rx: 4.5, ry: 4 },      // 0 stair up
    { x: 25, y: 14, rx: 6.5, ry: 5.5 },  // 1 the Weaver's loom
    { x: 12, y: 32, rx: 5.5, ry: 5 },    // 2 pens (cocoons)
    { x: 34, y: 34, rx: 7, ry: 5.5, flags: true }, // 3 the skinning floor
    { x: 50, y: 10, rx: 5.5, ry: 4.5 },  // 4 pens (cocoons)
    { x: 53, y: 30, rx: 7, ry: 6 },      // 5 Gorehowl's lair, in front of the way down
    { x: 59, y: 47, rx: 4.5, ry: 4 },    // 6 stair down
    { x: 28, y: 48, rx: 5, ry: 4 },      // 7 pens (cocoons)
    { x: 4, y: 43, rx: 2.5, ry: 2, secret: true }, // 8 behind the pens' cracked wall
  ],
  tunnels: [[0, 1, 1.5], [0, 2, 2], [1, 2, -2], [1, 4, -1.5], [2, 3, 2], [3, 5, -1.5], [4, 5, 2], [5, 6, 1.5], [3, 7, 1.5], [2, 8, 0], // 0-2: past the loom without facing the Weaver
    [6, 7, 0]], // shortcut from the stair round Gorehowl's lair, barred from the stair's side
};
const F3: Floor = {
  id: 3, name: "The Hide-Mother's Den", x: 186, y: 228, w: 72, h: 56,
  chambers: [
    { x: 9, y: 8, rx: 4.5, ry: 4 },      // 0 stair up
    { x: 23, y: 18, rx: 6, ry: 5 },      // 1 the stitching room
    { x: 10, y: 36, rx: 5.5, ry: 5 },    // 2 the cages
    { x: 40, y: 11, rx: 6.5, ry: 5.5 },  // 3 the Hornbrute's byre
    { x: 46, y: 36, rx: 11, ry: 9.5, flags: true }, // 4 the Hide-Mother's den
    { x: 8, y: 48, rx: 2.5, ry: 2, secret: true }, // 5 behind the cages' cracked wall
  ],
  tunnels: [[0, 1, 1.5], [1, 2, -2], [1, 3, 2], [2, 4, 2.5], [3, 4, -2.5], [2, 5, 0]], // the den's own way back is the rope (f3out)
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
  // The way out from the bottom (Murat 2026-11-07): an old rope hanging down a crack in the den's roof, up to the woods
  { id: "f3out", label: "Climb the rope back to the woods", ...at(F3.x + F3.chambers[4].x + 6, F3.y + F3.chambers[4].y + 3), to: "sink", down: false, floor: 3 },
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
  if (ty < WORLD_H || ty >= UNDER_END) return undefined;
  return FLOORS.find((f) => tx >= f.x && tx < f.x + f.w && ty >= f.y && ty < f.y + f.h);
}
/** True below the surface (pixel coords). */
export const underground = (py: number) => py >= WORLD_H * TILE && py < UNDER_END * TILE;
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
export const TOTEMS: [number, number][] = [[DEN.x - 7, DEN.y - 3], [DEN.x + 7, DEN.y - 3], [DEN.x, DEN.y + 6]];
/** Trappers wrapped in silk in the pens (quest objects, tiles): one in each pen chamber of floor 2. */
export const COCOONS: [number, number][] = [chamberAt(F2, 2), chamberAt(F2, 4), chamberAt(F2, 7)].map(([x, y]) => [x + 2, y - 1]);

/**
 * Lit braziers and rite-fires (tiles): the only light down there, besides the one heroes carry (client darkness).
 * One per chamber, a little off its centre, plus the den's ring.
 */
export const BRAZIERS: [number, number][] = [
  ...FLOORS.flatMap((f) => f.chambers.flatMap((c, i): [number, number][] => (c.secret ? [] : [[f.x + Math.round(c.x + (i % 2 ? 2 : -2)), f.y + Math.round(c.y - c.ry * 0.5)]]))),
  [DEN.x - 5, DEN.y + 6], [DEN.x + 5, DEN.y + 6],
];

// sanity: the dungeon must fit the map
for (const f of FLOORS) if (f.x + f.w > MAP_W || f.y + f.h > UNDER_END || f.y < SEA_END) throw new Error(`dungeon floor ${f.name} is outside the map`);

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

/**
 * The floor's rhythm (Murat 2026-11-08: "redesign by using best in class principles of the genre"): each floor opens
 * on a lit landing where nothing spawns, builds through rooms of packs and ambushes to its mini-boss or elite, then the
 * way down. Ambush rooms: the beast-folk there lurk in the dark (only their eyes show) and rush out together when a
 * hero walks in; one per floor keeps a chest. Shortcuts: a barred gate on a back tunnel, opened only from the deep end,
 * that then stays open a long while. Secrets: a cracked wall on each floor hides a small treasure room.
 */
export const LANDING = 0;
export const AMBUSH_ROOMS: Record<number, number[]> = { 1: [1, 4], 2: [3, 7], 3: [2] };
/** The ambush room on each floor that keeps a chest (its lurkers guard it). */
export const AMBUSH_CHEST: Record<number, number> = { 1: 4, 2: 7, 3: 2 };
/** Shortcut tunnels: [floor, the deep chamber the gate opens from, the chamber it leads back to]. */
export const SHORTCUTS: [number, number, number][] = [[1, 6, 7], [2, 6, 7]];
/** How long a shortcut or a broken wall stays open once worked (ms). */
export const SHORTCUT_OPEN_MS = 20 * 60_000, CRACK_OPEN_MS = 10 * 60_000;

/** The chamber a point (px) is in, if any (a little past its rim). */
export function chamberAtPx(px: number, py: number): { floor: Floor; index: number } | undefined {
  const f = floorAtPx(px, py);
  if (!f) return undefined;
  const tx = px / TILE, ty = py / TILE;
  const index = f.chambers.findIndex((c) => Math.hypot((tx - f.x - c.x) / c.rx, (ty - f.y - c.y) / c.ry) <= 1.05);
  return index < 0 ? undefined : { floor: f, index };
}
/** True on a floor's landing (nothing spawns there). */
export const inLanding = (px: number, py: number) => chamberAtPx(px, py)?.index === LANDING;
/** The ambush room key ("floor_chamber") a point is in, if any. */
export function ambushRoomAt(px: number, py: number): string | undefined {
  const c = chamberAtPx(px, py);
  return c && AMBUSH_ROOMS[c.floor.id]?.includes(c.index) ? `${c.floor.id}_${c.index}` : undefined;
}
/** A random point (px) well inside chamber i of floor f (may be solid: callers check). */
export function pointInChamber(f: Floor, i: number, rnd = Math.random): { x: number; y: number } {
  const c = f.chambers[i], a = rnd() * Math.PI * 2, r = 0.75 * Math.sqrt(rnd());
  return { x: (f.x + c.x + Math.cos(a) * c.rx * r) * TILE, y: (f.y + c.y + Math.sin(a) * c.ry * r) * TILE };
}
