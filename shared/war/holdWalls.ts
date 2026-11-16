/**
 * Hold walls (Murat 2026-11-15: "the encampments all look similar in size and shape and my hero can walk through their
 * walls"): every clan builds its Hold to its own plan (FORT_PLANS), and the plan of the clan that holds a land is solid.
 * Heroes, troopers and wild monsters stop at its walls and pass its gates (shared/movement.ts asks holdWallPx); when a
 * land changes hands its fort changes with it and the server moves anyone left inside a wall (server/holdWalls.ts).
 *
 * A plan is fitted to each Hold once, from the map alone (deterministic, same on server and client): squeezed in where
 * its land's rect ends, broken where it would cover a road, a portal stone, an NPC, a dungeon gate, a standard or a
 * neighbour's fort, and opened wherever it would wall off ground that was reachable before. Art draws from the same data
 * (fortOf / FORT_PLANS cells). Projectiles ignore the walls (they fly over). Troopers steer round them with holdRoutes.ts.
 *
 * W3: each clan has three plans, one per Hold tier (holdTiers.ts: outpost, camp, fortress; planOf), all fitted to every
 * Hold up front; the live walls follow the holder and the tier (setHoldOwners). FORT_PLANS are the camps (the plans of
 * before), and the camps are fitted exactly as before. Routes and spots planned once for any holder (anyHoldWall,
 * holdReach, holdTiles) cover every tier; guard posts and the sack reach follow the tier (tierReachPx).
 */
import { MAP_H, MAP_W, TILE } from "../constants";
import { DOORS, isSolidTile, PORTAL_SPOTS, WORLD } from "../map";
import { BOARDS } from "../bounty";
import { CHESTS } from "../chests";
import { LINKS } from "../dungeon";
import { NPCS } from "../npcs";
import { CLAN_KEYS, type ClanKey } from "./clans";
import { HOLD_TIERS, type HoldTier } from "./holdTiers";
import { HOLD_FORT_PX, HOLDS, STANDARDS, type Hold } from "./standards";
import { TERRITORIES } from "./territories";

/**
 * What a cell of a fort is. Blocking: wall (the clan's main wall: palisade, stakes, stone, bank or shrine wall, see
 * FortPlan.material), tower, tent, fence (a low stake fence), mound (the Hide-Kin burrow mound). Open: gate (a planned
 * way in), gap (a wall cell the fitting left out: a road, a portal stone, a standard... runs there), court (inside).
 */
export type FortKind = "wall" | "tower" | "tent" | "fence" | "mound" | "gate" | "gap" | "court";
export interface FortCell { dx: number; dy: number; kind: FortKind }
export const BLOCKING: ReadonlySet<FortKind> = new Set<FortKind>(["wall", "tower", "tent", "fence", "mound"]);

export interface FortPlan {
  clan: ClanKey;
  /** The Hold's tier this plan is for (holdTiers.ts). */
  tier: HoldTier;
  /** Overall size in tiles (the plan's bounding box) and what its main wall is made of (for the art). */
  w: number; h: number; material: string;
  /** Every cell of the plan, offsets in tiles from the Hold's middle tile (the plan's cell at floor(w/2), floor(h/2)). */
  cells: FortCell[];
}

/**
 * The plans per tier (holdTiers.ts: 0 outpost, 1 camp, 2 fortress), one row per string, east to the right (the front
 * gate, toward the viewer in iso, is on the east side at dy = 0 in every plan: patrols and the siege's gate front stand
 * outside it). Legend: `#` wall, `T` tower, `n` tent, `f` low fence, `M` burrow mound, `G` gate, `.` courtyard, `o` the
 * middle tile (courtyard, the banner spot: the same cell at every tier), space: not part of the fort. The camp is the
 * plan the clans built before W3; the fortress is the camp with outer works round it (parsePlan checks both line up).
 */
const PLAN_ROWS: Record<ClanKey, { material: string; tiers: [string[], string[], string[]] }> = {
  // a big square palisade, gates east and west, a 2x2 watchtower in the north-west corner
  wardens: { material: "palisade", tiers: [[
    // outpost: the watchtower and a short palisade round a small yard
    "TT###",
    "TT..#",
    "#.o.G",
    "#...#",
    "#####",
  ], [
    "TT#######",
    "TT......#",
    "#.......#",
    "#.......#",
    "G...o...G",
    "#.......#",
    "#.......#",
    "#.......#",
    "#########",
  ], [
    // fortress: an outer palisade with a tower on each corner and a gatehouse east
    "T###########T",
    "#...........#",
    "#.TT#######.#",
    "#.TT......#.#",
    "#.#.......#.#",
    "#.#.......#.T",
    "G.G...o...G.G",
    "#.#.......#.T",
    "#.#.......#.#",
    "#.#.......#.#",
    "#.#########.#",
    "#...........#",
    "T###########T",
  ]] },
  // a loose, wide ring of hide tents and low stake fence, open on four sides
  redfang: { material: "stakes", tiers: [[
    // outpost: two tents and a few stakes round a fire
    " n f ",
    "f...n",
    "G.o.G",
    "n...f",
    " f n ",
  ], [
    " nffGnffn ",
    "f........n",
    "G........f",
    "n....o...G",
    "f........n",
    " nffnfGfn ",
  ], [
    // war camp: an outer ring of stakes and tents, lookouts on the corners and by the east gate
    "Tff fnGnf ffT",
    "f...........f",
    "n nffGnffn .n",
    "ff........n.f",
    "GG........f.T",
    "fn....o...G.G",
    "ff........n.T",
    "n nffnfGfn .n",
    "f...........f",
    "Tff fnGnf ffT",
  ]] },
  // a tall compact keep: walls two thick, a tower on each corner, one gate (east) through the wall
  host: { material: "stone", tiers: [[
    // outpost: a small walled tower yard
    "T###T",
    "#...#",
    "#.o.G",
    "#...#",
    "T###T",
  ], [
    "TT###TT",
    "TT###TT",
    "##...##",
    "##.o.GG",
    "##...##",
    "TT###TT",
    "TT###TT",
  ], [
    // fortress: a curtain wall with corner towers round the keep, a gatehouse east
    "T#########T",
    "#.........#",
    "#.TT###TT.#",
    "#.TT###TT.#",
    "#.##...##.T",
    "#.##.o.GG.G",
    "#.##...##.T",
    "#.TT###TT.#",
    "#.TT###TT.#",
    "#.........#",
    "T#########T",
  ]] },
  // a round earthwork bank with the burrow mound in the middle, gaps east and west
  hidekin: { material: "bank", tiers: [[
    // outpost: a small bank round a burrow mouth
    " ### ",
    "#.M.#",
    "G.o.G",
    "#...#",
    " ### ",
  ], [
    "  ####  ",
    " #....# ",
    "#......#",
    "#..MM..#",
    "G...o..G",
    "#......#",
    " #....# ",
    "  ####  ",
  ], [
    // fortress: a second, wider bank round the first
    "   ######   ",
    "  #......#  ",
    " #..####..# ",
    "#..#....#..#",
    "#.#......#.#",
    "#.#..MM..#.#",
    "G.G...o..G.G",
    "#.#......#.#",
    "#..#....#..#",
    " #..####..# ",
    "  #......#  ",
    "   ######   ",
  ]] },
  // a walled shrine shaped like a diamond, pylons on three tips, one gate (the east tip)
  veiled: { material: "sandstone", tiers: [[
    // outpost: a pylon shrine
    "  T  ",
    " #.# ",
    "T.o.G",
    " #.# ",
    "  T  ",
  ], [
    "    T    ",
    "   #.#   ",
    "  #...#  ",
    " #.....# ",
    "T...o...G",
    " #.....# ",
    "  #...#  ",
    "   #.#   ",
    "    T    ",
  ], [
    // fortress: a colonnade of pylons and wall pieces round the shrine, a gate between two pylons east
    "T  ## T ##  T",
    " ........... ",
    " .....T..... ",
    "#....#.#....#",
    "#...#...#...#",
    " ..#.....#..T",
    "T.T...o...G.G",
    " ..#.....#..T",
    "#...#...#...#",
    "#....#.#....#",
    " .....T..... ",
    " ........... ",
    "T  ## T ##  T",
  ]] },
};

const CHAR: Record<string, FortKind> = { "#": "wall", T: "tower", n: "tent", f: "fence", M: "mound", G: "gate", ".": "court", o: "court" };

function parsePlan(clan: ClanKey, tier: HoldTier): FortPlan {
  const { material, tiers } = PLAN_ROWS[clan], rows = tiers[tier], h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const ox = Math.floor(w / 2), oy = Math.floor(h / 2), cells: FortCell[] = [];
  if (rows[oy][ox] !== "o") throw new Error(`holdWalls: ${clan} tier ${tier}: the middle cell is not the banner spot`);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { const kind = CHAR[ch]; if (kind) cells.push({ dx: x - ox, dy: y - oy, kind }); }));
  return { clan, tier, w, h, material, cells };
}

const TIER_PLANS: Record<ClanKey, [FortPlan, FortPlan, FortPlan]> = Object.fromEntries(CLAN_KEYS.map((k) => [k, HOLD_TIERS.map((n) => parsePlan(k, n))])) as Record<ClanKey, [FortPlan, FortPlan, FortPlan]>;
/** Clan `clan`'s fort plan at `tier` (before fitting to a Hold): what the art draws. */
export const planOf = (clan: ClanKey, tier: HoldTier = 1): FortPlan => TIER_PLANS[clan][tier];
/** Each clan's camp plan (the middle tier, the fort every Hold had before W3). */
export const FORT_PLANS: Record<ClanKey, FortPlan> = Object.fromEntries(CLAN_KEYS.map((k) => [k, planOf(k, 1)])) as Record<ClanKey, FortPlan>;

/** Tiles a fort wall keeps from a portal stone, an NPC, a standard (its spot and some of its ring stay open ground), and a chest, bounty board or stair. */
export const HOLD_WALL_KEEP = { portal: 3, npc: 1.5, standard: 2, prop: 1.5 };

/** One clan's fort at one tier as built at one Hold. Offsets in `cells`; absolute tiles in `walls` (blocking) and `gates` (gates and gaps). */
export interface HoldFort {
  t: number; clan: ClanKey; tier: HoldTier;
  /** The Hold's middle tile. */
  cx: number; cy: number;
  cells: FortCell[];
  walls: [number, number][];
  gates: [number, number][];
  /** Farthest blocking cell from the middle (Chebyshev, tiles). */
  reach: number;
}

/** Tiles of ground round a fort inside which the fitting keeps every way open (any box that holds the walls keeps them all). */
export const REACH_BOX = 3;

const RANK: Record<FortKind, number> = { court: 0, gap: 0, fence: 1, wall: 1, tent: 2, tower: 3, mound: 4, gate: 5 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const key = (x: number, y: number) => y * MAP_W + x;
const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

let OPEN: Set<number> | undefined;
/** Must tile (x, y) stay open ground (a road, a dungeon gate, by a portal stone, an NPC, a chest, a board, a stair or a standard)? */
function keepOpen(x: number, y: number): boolean {
  if (!OPEN) {
    // every tile near something a hero walks up to, marked once (the forts ask about many thousand tiles)
    OPEN = new Set();
    for (const d of DOORS) for (const k of d.tiles) OPEN.add(k);
    const K = HOLD_WALL_KEEP, near = (sx: number, sy: number, r: number) => { // (sx, sy): the thing's spot in tiles
      for (let ty = Math.floor(sy - r - 1); ty <= Math.ceil(sy + r); ty++) for (let tx = Math.floor(sx - r - 1); tx <= Math.ceil(sx + r); tx++)
        if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && Math.hypot(sx - tx - 0.5, sy - ty - 0.5) < r) OPEN!.add(key(tx, ty));
    };
    for (const p of PORTAL_SPOTS) near(p.x + 0.5, p.y + 0.5, K.portal);
    for (const n of NPCS) near(n.x / TILE, n.y / TILE, K.npc);
    // things a hero walks up to and uses: chests, bounty boards, stairs and ropes
    for (const o of [...CHESTS, ...BOARDS, ...LINKS]) near(o.x / TILE, o.y / TILE, K.prop);
    for (const st of STANDARDS) near(st.x / TILE, st.y / TILE, K.standard);
  }
  const k = key(x, y);
  return WORLD.roads.has(k) || OPEN.has(k);
}

/**
 * Plan `clan` at `tier` laid out at Hold `h`. Cells inside the camp plan's box are clamped into the land's rect (a side
 * that would leave it is pulled in), as the forts always were; outer works (a fortress's cells beyond the camp's box) are
 * dropped where they would leave the rect, land on a solid tile, on ground that must stay open (keepOpen) or on another
 * Hold's tiles: clamping them would squash them onto the land's edge. A camp wall cell on a solid map tile is dropped (the
 * map walls there already), on keepOpen ground or another Hold's tiles turned into a gap. repair() then opens whatever
 * would cut a way.
 */
function layout(h: Hold, clan: ClanKey, tier: HoldTier, claimed: { has(k: number): boolean }): FortCell[] {
  const T = TERRITORIES[h.t], cx = Math.floor(h.x / TILE), cy = Math.floor(h.y / TILE), camp = planOf(clan, 1);
  const lx = T.x - cx, hx = T.x + T.w - 1 - cx, ly = T.y - cy, hy = T.y + T.h - 1 - cy;
  const cox = Math.floor(camp.w / 2), coy = Math.floor(camp.h / 2);
  const inner = (c: FortCell) => c.dx >= -cox && c.dx <= camp.w - 1 - cox && c.dy >= -coy && c.dy <= camp.h - 1 - coy;
  const at = new Map<number, FortKind>(); // offset key -> kind
  const ok = (dx: number, dy: number) => (dy + 64) * 128 + dx + 64;
  for (const c of planOf(clan, tier).cells) {
    let dx = c.dx, dy = c.dy;
    if (inner(c)) { dx = clamp(dx, lx, hx); dy = clamp(dy, ly, hy); }
    else {
      const x = cx + dx, y = cy + dy;
      if (dx < lx || dx > hx || dy < ly || dy > hy || isSolidTile(x, y) || keepOpen(x, y) || claimed.has(key(x, y))) continue;
    }
    const k = ok(dx, dy), was = at.get(k);
    if (was === undefined || RANK[c.kind] > RANK[was]) at.set(k, c.kind);
  }
  const cells: FortCell[] = [];
  for (const [k, kind] of at) {
    const dx = (k % 128) - 64, dy = Math.floor(k / 128) - 64, x = cx + dx, y = cy + dy;
    if (BLOCKING.has(kind) && isSolidTile(x, y)) continue; // the map walls it already
    cells.push({ dx, dy, kind: BLOCKING.has(kind) && (keepOpen(x, y) || claimed.has(key(x, y))) ? "gap" : kind });
  }
  cells.sort((a, b) => a.dy - b.dy || a.dx - b.dx);
  return cells;
}

/** isSolidTile, remembered while the forts are built (the repairs read the same tiles many times over). */
let SOLID: Int8Array | undefined;
function solidMemo(x: number, y: number): number {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || !SOLID) return isSolidTile(x, y) ? 1 : 0;
  const k = y * MAP_W + x;
  if (SOLID[k] < 0) SOLID[k] = isSolidTile(x, y) ? 1 : 0;
  return SOLID[k];
}

/**
 * Opens wall cells (to "gap") until the walls of all `sets` together (cells round tile (cx, cy)) cut no way: ground
 * joined (4-way: a hero's box never squeezes past a touching corner) inside a box round the fort stays joined with the
 * walls up, so no way anywhere is cut (a way through the box can always go round inside it). The walls of the first
 * `firm` sets are opened only when no other wall will do (the camps, already repaired among themselves, keep their shape
 * when the other tiers join: a way the extra walls cut is opened in the extra walls). `other`: walls of neighbouring Holds
 * that count as solid ground (two Holds close together must not cut a way between them either).
 */
function repair(cx: number, cy: number, sets: FortCell[][], firm = 0, other?: (x: number, y: number) => boolean) {
  let R = 0;
  for (const cells of sets) for (const c of cells) R = Math.max(R, Math.abs(c.dx), Math.abs(c.dy));
  const B = R + REACH_BOX, W = 2 * B + 1, idx = (dx: number, dy: number) => (dy + B) * W + dx + B;
  const solid = new Uint8Array(W * W);
  for (let dy = -B; dy <= B; dy++) for (let dx = -B; dx <= B; dx++) solid[idx(dx, dy)] = solidMemo(cx + dx, cy + dy) || (other?.(cx + dx, cy + dy) ? 1 : 0);
  /** Component label of every open tile in the box (0: solid or wall). */
  const label = (wall: Uint8Array) => {
    const lab = new Int32Array(W * W), q: number[] = [];
    let n = 0;
    for (let s0 = 0; s0 < W * W; s0++) {
      if (lab[s0] || solid[s0] || wall[s0]) continue;
      lab[s0] = ++n; q.push(s0);
      while (q.length) {
        const i = q.pop()!, dx = (i % W) - B, dy = Math.floor(i / W) - B;
        for (const [ax, ay] of N4) {
          const nx = dx + ax, ny = dy + ay;
          if (Math.abs(nx) > B || Math.abs(ny) > B) continue;
          const j = idx(nx, ny);
          if (!lab[j] && !solid[j] && !wall[j]) { lab[j] = n; q.push(j); }
        }
      }
    }
    return lab;
  };
  const before = label(new Uint8Array(W * W));
  const fixed = new Set(sets.slice(0, firm).flatMap((cells) => cells.filter((c) => BLOCKING.has(c.kind)).map((c) => idx(c.dx, c.dy))));
  const gateAt = sets[0].find((c) => c.kind === "gate" && c.dy === 0 && c.dx > 0) ?? { dx: R, dy: 0 };
  for (;;) {
    const wall = new Uint8Array(W * W);
    for (const cells of sets) for (const c of cells) if (BLOCKING.has(c.kind)) wall[idx(c.dx, c.dy)] = 1;
    const now = label(wall), parts = new Map<number, Map<number, number>>(); // before label -> after label -> tiles
    for (let i = 0; i < W * W; i++) if (now[i]) { const m = parts.get(before[i]) ?? parts.set(before[i], new Map()).get(before[i])!; m.set(now[i], (m.get(now[i]) ?? 0) + 1); }
    const split = new Set([...parts].filter(([, m]) => m.size > 1).map(([b]) => b));
    if (!split.size) break;
    // open the wall cell that joins two pieces of one split ground (else one by a smaller piece), nearest the front gate first
    const main = new Map([...parts].map(([b, m]) => [b, [...m].sort((x, y) => y[1] - x[1])[0][0]]));
    const joins = (c: FortCell, both: boolean) => {
      const seen = new Map<number, Set<number>>();
      for (const [ax, ay] of N4) {
        const nx = c.dx + ax, ny = c.dy + ay;
        if (Math.abs(nx) > B || Math.abs(ny) > B) continue;
        const j = idx(nx, ny);
        if (!now[j] || !split.has(before[j])) continue;
        if (!both && now[j] !== main.get(before[j])) return true;
        (seen.get(before[j]) ?? seen.set(before[j], new Set()).get(before[j])!).add(now[j]);
      }
      return [...seen.values()].some((v) => v.size > 1);
    };
    const seen = new Set<number>(), walls = sets.flat().filter((c) => BLOCKING.has(c.kind) && !seen.has(idx(c.dx, c.dy)) && !!seen.add(idx(c.dx, c.dy))).sort((a, b) => Math.hypot(a.dx - gateAt.dx, a.dy - gateAt.dy) - Math.hypot(b.dx - gateAt.dx, b.dy - gateAt.dy));
    const soft = fixed.size ? walls.filter((c) => !fixed.has(idx(c.dx, c.dy))) : walls;
    const pick = soft.find((c) => joins(c, true)) ?? soft.find((c) => joins(c, false)) ?? walls.find((c) => joins(c, true)) ?? walls.find((c) => joins(c, false));
    if (!pick) break; // (cannot happen: a piece cut off borders a wall cell)
    for (const c of sets.flat()) if (c.dx === pick.dx && c.dy === pick.dy && BLOCKING.has(c.kind)) c.kind = "gap"; // in every plan that walls it
  }
}

/** The fort as built from its cells. */
function finish(h: Hold, clan: ClanKey, tier: HoldTier, cells: FortCell[]): HoldFort {
  const cx = Math.floor(h.x / TILE), cy = Math.floor(h.y / TILE);
  const walls: [number, number][] = [], gates: [number, number][] = [];
  let reachT = 0;
  for (const c of cells) {
    if (BLOCKING.has(c.kind)) { walls.push([cx + c.dx, cy + c.dy]); reachT = Math.max(reachT, Math.abs(c.dx), Math.abs(c.dy)); }
    else if (c.kind === "gate" || c.kind === "gap") gates.push([cx + c.dx, cy + c.dy]);
  }
  return { t: h.t, clan, tier, cx, cy, cells, walls, gates, reach: reachT };
}

// ---- the fitted forts and the wall grid (built on first use) -----------------------------------------------------

type Tiered = [HoldFort, HoldFort, HoldFort];
let FORTS: Map<number, Record<ClanKey, Tiered>> | undefined;
/** Per map tile: territory + 1 of the Hold whose forts (some clan, some tier) wall it; 0: no fort wall. A tile is walled by one Hold at most. */
let GRID: Uint16Array | undefined;
/**
 * Per Hold, a box round its forts' walls: for each tile a bit per clan and tier (bit tier * 5 + CLAN_KEYS index) whose
 * fort walls it. Two small typed arrays instead of a 32-bit map-sized grid (the client builds it too).
 */
interface WallBox { x0: number; y0: number; w: number; h: number; bits: Uint16Array }
const BOXES = new Map<number, WallBox>();
const TILES = new Map<number, number[]>();
const REACH = new Map<number, number[]>(); // per Hold: the largest fort reach of any clan at each tier
const bit = (tier: number, ci: number) => 1 << (tier * CLAN_KEYS.length + ci);
if (HOLD_TIERS.length * CLAN_KEYS.length > 16) throw new Error("holdWalls: clan x tier bits no longer fit WallBox.bits (Uint16)");

function build() {
  FORTS = new Map(); GRID = new Uint16Array(MAP_W * MAP_H); SOLID = new Int8Array(MAP_W * MAP_H).fill(-1);
  // the camps first, each Hold giving way to the camps laid out before it (exactly as the forts were built before the
  // tiers); then the other tiers give way to every other Hold's camp and to all of the earlier Holds' forts
  const campClaimed = new Set<number>(), campOf = new Map<number, number[]>(), CAMPS = new Map<number, FortCell[][]>();
  const wallOf = new Map<number, number>(); // map tile -> the Hold some fort of which walls it (camps, then the other tiers as built)
  for (const h of HOLDS) {
    const cx = Math.floor(h.x / TILE), cy = Math.floor(h.y / TILE), camps = CLAN_KEYS.map((k) => layout(h, k, 1, campClaimed));
    // each camp alone cuts no way, nor all of them at once (exactly as the forts were built before the tiers)
    for (const cells of camps) repair(cx, cy, [cells]);
    repair(cx, cy, camps);
    CAMPS.set(h.t, camps);
    const mine = new Set(camps.flatMap((cells) => cells.map((c) => key(cx + c.dx, cy + c.dy))));
    for (const k of mine) { campClaimed.add(k); (campOf.get(k) ?? campOf.set(k, []).get(k)!).push(h.t); }
    for (const cells of camps) for (const c of cells) if (BLOCKING.has(c.kind)) wallOf.set(key(cx + c.dx, cy + c.dy), h.t);
  }
  const claimed = new Set<number>();
  for (const h of HOLDS) {
    const cx = Math.floor(h.x / TILE), cy = Math.floor(h.y / TILE);
    const taken = { has: (k: number) => claimed.has(k) || !!campOf.get(k)?.some((o) => o !== h.t) };
    // the camp plans first: the repair opens walls nearest the camp's front gate first, as it did before the tiers
    const order = ([1, 0, 2] as HoldTier[]).flatMap((tier) => CLAN_KEYS.map((k) => ({ tier, k })));
    const sets = [...CAMPS.get(h.t)!, ...order.slice(CLAN_KEYS.length).map(({ tier, k }) => layout(h, k, tier, taken))];
    // each outpost and fortress alone cuts no way, nor every fort of every tier at once (routes planned for any holder and
    // tier go round them all), with any neighbouring Hold's walls up as well
    const other = (x: number, y: number) => { const o = wallOf.get(key(x, y)); return o !== undefined && o !== h.t; };
    for (const cells of sets.slice(CLAN_KEYS.length)) repair(cx, cy, [cells], 0, other);
    repair(cx, cy, sets, CLAN_KEYS.length, other);
    const per = Object.fromEntries(CLAN_KEYS.map((k) => [k, [] as unknown as Tiered])) as Record<ClanKey, Tiered>;
    order.forEach(({ tier, k }, i) => { per[k][tier] = finish(h, k, tier, sets[i]); });
    FORTS.set(h.t, per);
    for (const k of CLAN_KEYS) for (const f of per[k]) for (const [x, y] of f.walls) wallOf.set(key(x, y), h.t);
    const mine = new Set<number>();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of CLAN_KEYS) for (const f of per[k]) {
      for (const c of f.cells) mine.add(key(f.cx + c.dx, f.cy + c.dy));
      for (const [x, y] of f.walls) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    if (x1 >= x0) {
      const b: WallBox = { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1, bits: new Uint16Array((x1 - x0 + 1) * (y1 - y0 + 1)) };
      CLAN_KEYS.forEach((k, ci) => per[k].forEach((f, tier) => {
        for (const [x, y] of f.walls) { GRID![key(x, y)] = h.t + 1; b.bits[(y - y0) * b.w + x - x0] |= bit(tier, ci); }
      }));
      BOXES.set(h.t, b);
    }
    REACH.set(h.t, HOLD_TIERS.map((tier) => Math.max(...CLAN_KEYS.map((k) => per[k][tier].reach))));
    for (const k of mine) claimed.add(k);
    TILES.set(h.t, [...mine].sort((a, b) => a - b));
  }
  SOLID = undefined; OPEN = undefined;
}
const forts = () => { if (!FORTS) build(); return FORTS!; };
const grid = () => { if (!GRID) build(); return GRID!; };
/** The clan and tier bits of tile (tx, ty) (0: no fort wall), and the Hold they belong to (-1 none). In range only. */
function wallBits(tx: number, ty: number): { t: number; bits: number } {
  const v = grid()[ty * MAP_W + tx];
  if (!v) return { t: -1, bits: 0 };
  const b = BOXES.get(v - 1)!;
  return { t: v - 1, bits: b.bits[(ty - b.y0) * b.w + tx - b.x0] };
}

/** Territory t's Hold built to clan `clan`'s plan at `tier` (default the camp; undefined: the land has no Hold). */
export function fortOf(t: number, clan: ClanKey, tier: HoldTier = 1): HoldFort | undefined { return forts().get(t)?.[clan]?.[tier]; }

let FOOT: Map<number, number> | undefined;
/** The Hold (territory id) one of whose forts, any clan's at any tier, covers tile (tx, ty) (walls, gates or courtyard); -1 none. */
export function holdCellAt(tx: number, ty: number): number {
  if (!FOOT) { FOOT = new Map(); for (const h of HOLDS) for (const k of holdTiles(h.t)) FOOT.set(k, h.t); }
  return tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H ? -1 : FOOT.get(ty * MAP_W + tx) ?? -1;
}

/** Every tile any clan's fort at any tier at territory t's Hold covers (map index ty * MAP_W + tx): what to recompute when it changes. */
export function holdTiles(t: number): number[] { forts(); return TILES.get(t) ?? []; }

/** Farthest wall from territory t's Hold middle over every clan's fort at every tier (tiles, Chebyshev). */
export function holdReach(t: number): number {
  forts();
  const r = REACH.get(t);
  return r ? Math.max(...r) : HOLD_FORT_PX / TILE - 0.5;
}
/** Half-size (px) of the square round territory t's Hold that any clan's fort may wall: troops, guards, rituals and tunnels keep outside. */
export const holdReachPx = (t: number) => (holdReach(t) + 0.5) * TILE;
/** Half-size (px) of the square round territory t's Hold that any clan's fort at `tier` may wall (guard posts and the sack reach of that tier). */
export function tierReachPx(t: number, tier: HoldTier): number {
  forts();
  const r = REACH.get(t);
  return r ? (r[tier] + 0.5) * TILE : HOLD_FORT_PX;
}

/** Is tile (tx, ty) a wall of the fort its land's holder builds? `ownerOf` gives each territory's holder, `tierOf` its tier (default camp). */
export function holdWallAt(tx: number, ty: number, ownerOf: (t: number) => ClanKey | undefined, tierOf: (t: number) => HoldTier = () => 1): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
  const { t, bits } = wallBits(tx, ty);
  if (t < 0) return false;
  const own = ownerOf(t), ci = own ? CLAN_KEYS.indexOf(own) : -1;
  return ci >= 0 && (bits & bit(tierOf(t), ci)) !== 0;
}

/** Could any clan's fort at any tier wall tile (tx, ty)? Routes planned once for every holder (patrols, caravans, reach) go round it. */
export function anyHoldWall(tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && grid()[ty * MAP_W + tx] !== 0;
}

/** The Hold (territory id) whose forts could wall tile (tx, ty), and whether some clan's fort at `tier` there does. t -1: none. */
export function tierWallAt(tx: number, ty: number, tier: HoldTier): { t: number; wall: boolean } {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return { t: -1, wall: false };
  const { t, bits } = wallBits(tx, ty), mask = ((1 << CLAN_KEYS.length) - 1) << (tier * CLAN_KEYS.length);
  return { t, wall: (bits & mask) !== 0 };
}

// ---- the live holders and tiers: set by the server (the war) and the client (the "war" snapshot) -----------------

/** Holder of each territory as a CLAN_KEYS index (-1: none). Undefined until the war is known: then no Hold has walls. */
let OWN: Int8Array | undefined;
/** Tier of each territory's Hold (holdTiers.ts), set with OWN. */
let TIER: Int8Array | undefined;

const tierOf = (v: unknown): HoldTier => (v === 0 || v === 1 || v === 2 ? v : 1);

/**
 * The war's holders now (clan keys or CLAN_KEYS indexes, by territory id) and their Holds' tiers (holdTiers.ts; missing
 * or bad: the camp): the walls follow them. Returns the territories whose fort changed (holder or tier: to refresh a walk
 * grid or move people out of new walls). An empty owner list takes every wall down.
 */
export function setHoldOwners(owner: readonly (ClanKey | number | undefined | null)[], tier?: readonly (number | undefined | null)[] | null): number[] {
  grid();
  const n = TERRITORIES.length, next = new Int8Array(n).fill(-1), nextT = new Int8Array(n).fill(1), changed: number[] = [];
  for (let t = 0; t < n; t++) {
    const o = owner[t];
    next[t] = typeof o === "number" ? (o >= 0 && o < CLAN_KEYS.length ? o : -1) : typeof o === "string" ? CLAN_KEYS.indexOf(o as ClanKey) : -1;
    nextT[t] = tierOf(tier?.[t]);
    const was = OWN ? OWN[t] : -1, wasT = TIER ? TIER[t] : 1;
    if ((was !== next[t] || (next[t] >= 0 && wasT !== nextT[t])) && forts().has(t)) changed.push(t);
  }
  const any = next.some((c) => c >= 0);
  OWN = any ? next : undefined;
  TIER = any ? nextT : undefined;
  return changed;
}

/** Is tile (tx, ty) a wall of a Hold as its land is held now? */
export function liveHoldWall(tx: number, ty: number): boolean {
  if (!OWN || tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
  const v = GRID![ty * MAP_W + tx];
  if (!v) return false;
  const ci = OWN[v - 1];
  if (ci < 0) return false;
  const b = BOXES.get(v - 1)!;
  return (b.bits[(ty - b.y0) * b.w + tx - b.x0] & bit(TIER![v - 1], ci)) !== 0;
}

/** Is pixel (px, py) inside a Hold wall as the lands are held now? The movement check (shared/movement.ts) asks this. */
export const holdWallPx = (px: number, py: number) => OWN !== undefined && liveHoldWall(Math.floor(px / TILE), Math.floor(py / TILE));

/** Does a body of half-size r (px) at (x, y) overlap a live Hold wall? */
export function touchesHoldWall(x: number, y: number, r: number): boolean {
  return OWN !== undefined && (holdWallPx(x - r, y - r) || holdWallPx(x + r, y - r) || holdWallPx(x - r, y + r) || holdWallPx(x + r, y + r));
}

/** Tier of territory t's Hold as the walls stand now (the camp when no war is known). */
export const liveTier = (t: number): HoldTier => (TIER ? tierOf(TIER[t]) : 1);
/** Is the war (and so the live holders and tiers) known here? */
export const holdsLive = () => OWN !== undefined;

/** Half-size (px) of the square round territory t's Hold that its fort walls as held now (0: no walls up). */
export function liveReachPx(t: number): number {
  const ci = OWN ? OWN[t] : -1, f = ci >= 0 ? fortOf(t, CLAN_KEYS[ci], liveTier(t)) : undefined;
  return f && f.walls.length ? (f.reach + 0.5) * TILE : 0;
}

/** Holder of territory t as the walls stand now (a CLAN_KEYS index; -1 none or no war known). */
export const liveHolder = (t: number) => (OWN ? OWN[t] ?? -1 : -1);
