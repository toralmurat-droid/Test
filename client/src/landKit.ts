import { actOfTile, TILE, type Act } from "../../shared/constants";
import { AREAS, BARNS, EMPTY, GROUND, HIGHWAY_TILES, NATURE, OBJECTS, PORTAL_SPOTS, SIGNPOSTS, T } from "../../shared/map";
import { NPCS, NPC_DECOR } from "../../shared/npcs";
import { CHESTS } from "../../shared/chests";
import { SIEGE_SITES } from "../../shared/siege";
import { HOLDS, MUSTERS } from "../../shared/war/standards";
import { TOWNS } from "../../shared/war/townSites";
import { CAPITAL_FORTS, FORT_SKIP } from "../../shared/highways";
import { LANDMARKS } from "../../shared/landmarks";
import { BOARDS } from "../../shared/bounty";
import { allObjects } from "../../shared/quests";
import { WORLD_PROP_SPOTS } from "./worldPropSpots";
import { LK_SHEETS, type LkKind } from "./landKitSheets";

/**
 * Land kits (settlement network step 3, "land identity"): the small props that say what a land's people do, placed
 * round its settlements (Oakvale: stooks, scarecrows, grain carts, beehives, hide frames). Phaser-free and
 * deterministic, the same on every client; landKitView.ts draws them. Cosmetic and walk-through: the server never
 * reads this file. The solid landmarks are shared/landmarks.ts.
 */
export { LK_SHEETS, type LkKind };
export interface KitSpot { kind: LkKind; land: Act; area: string; x: number; y: number; flip: boolean }

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
const FENCES = new Set<number>([T.FENCE, T.FENCE_V, T.PALISADE]);
/** In a gap of a fence or palisade (a gateway): fence within 3 tiles on both sides, in its row or its column. */
function inGateway(tx: number, ty: number) {
  const fenceAt = (dx: number, dy: number) => { for (let k = 1; k <= 3; k++) if (FENCES.has(OBJECTS[ty + dy * k]?.[tx + dx * k] ?? -1)) return true; return false; };
  return (fenceAt(-1, 0) && fenceAt(1, 0)) || (fenceAt(0, -1) && fenceAt(0, 1));
}
/** A capital fort's skip box widened by SEAT_MARGIN: the five clan seats. */
export const inSeat = (tx: number, ty: number) => CAPITAL_FORTS.some(([x, y]) => Math.abs(tx - x) <= FORT_SKIP + SEAT_MARGIN && Math.abs(ty - y) <= FORT_SKIP + SEAT_MARGIN);
/** Inside a landmark's solid box, or within `m` tiles of it. */
const nearLandmarkBox = (tx: number, ty: number, m: number) => LANDMARKS.some((l) => l.solid && tx + 0.5 > l.solid[0] - m && tx + 0.5 < l.solid[0] + l.solid[2] + m && ty + 0.5 > l.solid[1] - m && ty + 0.5 < l.solid[1] + l.solid[3] + m);

/**
 * The keep-clear rule for a kit prop on tile (tx, ty): its 3x3 holds only empty ground or nature (no fence, wall,
 * door, stall, crate or well beside it), no road, highway, water or bridge; the tile itself is no field or crop
 * either (`onField`: a field or crop tile is fine, for scarecrows), and no gateway in a fence; clear of NPCs and their props, signposts, chests, boards, quest objects, portal stones, war-town gates,
 * banners and stewards, forts and musters, siege works, the world props (worldPropSpots.ts), barns, landmarks, the
 * clan seats and the other kit props in `taken` (`gap` tiles).
 */
export function kitFree(tx: number, ty: number, taken: readonly KitSpot[] = [], gap = 2, onField = false): boolean {
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const o = OBJECTS[ty + j]?.[tx + i], g = GROUND[ty + j]?.[tx + i];
    if (o === undefined || g === undefined) return false;
    if (i === 0 && j === 0 ? o !== EMPTY || (BAD_GROUND.has(g) && !(onField && FIELDS.has(g))) : o !== EMPTY && !NATURE.has(o)) return false;
    if (NO_NEIGHBOUR.has(g) || HIGHWAY_TILES.has((ty + j) * MW + tx + i)) return false;
  }
  if (inGateway(tx, ty) || inSeat(tx, ty) || nearLandmarkBox(tx, ty, 1.5)) return false;
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

interface Place { area: string; kind: LkKind; n: number; gap?: number; near?: (tx: number, ty: number) => boolean }
/** Kinds that stand in a field or crop rather than beside it. */
export const ON_FIELD: ReadonlySet<LkKind> = new Set<LkKind>(["lk_scarecrow"]);

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

/** Up to `p.n` free spots for `p.kind` in the area, picked by a fixed hash (the same on every client). */
function scatter(out: KitSpot[], p: Place) {
  const a = AREAS.find((r) => r.name === p.area);
  if (!a) return;
  let placed = 0;
  for (let k = 0; k < 600 && placed < p.n; k++) {
    const tx = a.x + Math.floor(hash(k, p.n, p.kind.length * 31 + a.x) * a.w), ty = a.y + Math.floor(hash(p.n, k, p.kind.length * 17 + a.y * 3) * a.h);
    if (!kitFree(tx, ty, out, p.gap ?? 3, ON_FIELD.has(p.kind)) || (p.near && !p.near(tx, ty))) continue;
    // the foot jitters inside its tile so a row of stooks doesn't stand on the grid
    const jx = (hash(tx, ty, 11) - 0.5) * 0.5, jy = (hash(tx, ty, 12) - 0.5) * 0.5;
    out.push({ kind: p.kind, land: actOfTile(tx, ty), area: p.area, x: (tx + 0.5 + jx) * TILE, y: (ty + 0.5 + jy) * TILE, flip: hash(tx, ty, 5) < 0.5 });
    placed++;
  }
}

function build(): KitSpot[] {
  const out: KitSpot[] = [];
  for (const p of OAKVALE) scatter(out, p);
  return out;
}

/** Every kit prop in the world. */
export const LAND_KIT_SPOTS: readonly KitSpot[] = build();
/** For tests: the same table built again (it must come out identical). */
export const buildLandKit = build;

/** The sheet each landmark is drawn with (shared/landmarks.ts id -> kit sheet). */
export const LANDMARK_SHEET: Record<string, LkKind> = { windmill: "lk_windmill" };
