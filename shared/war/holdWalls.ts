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
 */
import { MAP_H, MAP_W, TILE } from "../constants";
import { DOORS, isSolidTile, PORTAL_SPOTS, WORLD } from "../map";
import { BOARDS } from "../bounty";
import { CHESTS } from "../chests";
import { LINKS } from "../dungeon";
import { NPCS } from "../npcs";
import { CLAN_KEYS, type ClanKey } from "./clans";
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
  /** Overall size in tiles (the plan's bounding box) and what its main wall is made of (for the art). */
  w: number; h: number; material: string;
  /** Every cell of the plan, offsets in tiles from the Hold's middle tile (the plan's cell at floor(w/2), floor(h/2)). */
  cells: FortCell[];
}

/**
 * The plans, one row per string, east to the right (the front gate, toward the viewer in iso, is on the east side at
 * dy = 0 in every plan: patrols and the siege's gate front stand outside it). Legend: `#` wall, `T` tower, `n` tent,
 * `f` low fence, `M` burrow mound, `G` gate, `.` courtyard, `o` the middle tile (courtyard), space: not part of the fort.
 */
const PLAN_ROWS: Record<ClanKey, { material: string; rows: string[] }> = {
  // a big square palisade, gates east and west, a 2x2 watchtower in the north-west corner
  wardens: { material: "palisade", rows: [
    "TT#######",
    "TT......#",
    "#.......#",
    "#.......#",
    "G...o...G",
    "#.......#",
    "#.......#",
    "#.......#",
    "#########",
  ] },
  // a loose, wide ring of hide tents and low stake fence, open on four sides
  redfang: { material: "stakes", rows: [
    " nffGnffn ",
    "f........n",
    "G........f",
    "n....o...G",
    "f........n",
    " nffnfGfn ",
  ] },
  // a tall compact keep: walls two thick, a tower on each corner, one gate (east) through the wall
  host: { material: "stone", rows: [
    "TT###TT",
    "TT###TT",
    "##...##",
    "##.o.GG",
    "##...##",
    "TT###TT",
    "TT###TT",
  ] },
  // a round earthwork bank with the burrow mound in the middle, gaps east and west
  hidekin: { material: "bank", rows: [
    "  ####  ",
    " #....# ",
    "#......#",
    "#..MM..#",
    "G...o..G",
    "#......#",
    " #....# ",
    "  ####  ",
  ] },
  // a walled shrine shaped like a diamond, pylons on three tips, one gate (the east tip)
  veiled: { material: "sandstone", rows: [
    "    T    ",
    "   #.#   ",
    "  #...#  ",
    " #.....# ",
    "T...o...G",
    " #.....# ",
    "  #...#  ",
    "   #.#   ",
    "    T    ",
  ] },
};

const CHAR: Record<string, FortKind> = { "#": "wall", T: "tower", n: "tent", f: "fence", M: "mound", G: "gate", ".": "court", o: "court" };

function parsePlan(clan: ClanKey): FortPlan {
  const { material, rows } = PLAN_ROWS[clan], h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const ox = Math.floor(w / 2), oy = Math.floor(h / 2), cells: FortCell[] = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => { const kind = CHAR[ch]; if (kind) cells.push({ dx: x - ox, dy: y - oy, kind }); }));
  return { clan, w, h, material, cells };
}

/** Each clan's fort plan (before fitting to a Hold). */
export const FORT_PLANS: Record<ClanKey, FortPlan> = Object.fromEntries(CLAN_KEYS.map((k) => [k, parsePlan(k)])) as Record<ClanKey, FortPlan>;

/** Tiles a fort wall keeps from a portal stone, an NPC, a standard (its spot and some of its ring stay open ground), and a chest, bounty board or stair. */
export const HOLD_WALL_KEEP = { portal: 3, npc: 1.5, standard: 2, prop: 1.5 };

/** One clan's fort as built at one Hold. Offsets in `cells`; absolute tiles in `walls` (blocking) and `gates` (gates and gaps). */
export interface HoldFort {
  t: number; clan: ClanKey;
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

let doorTiles: Set<number> | undefined;
/** Must tile (x, y) stay open ground (a road, a dungeon gate, by a portal stone, an NPC, a chest, a board, a stair or a standard)? */
function keepOpen(x: number, y: number): boolean {
  if (WORLD.roads.has(key(x, y))) return true;
  if (!doorTiles) { doorTiles = new Set(); for (const d of DOORS) for (const k of d.tiles) doorTiles.add(k); }
  if (doorTiles.has(key(x, y))) return true;
  const K = HOLD_WALL_KEEP, mx = x + 0.5, my = y + 0.5;
  if (PORTAL_SPOTS.some((p) => Math.hypot(p.x + 0.5 - mx, p.y + 0.5 - my) < K.portal)) return true;
  if (NPCS.some((n) => Math.hypot(n.x / TILE - mx, n.y / TILE - my) < K.npc)) return true;
  // things a hero walks up to and uses: chests, bounty boards, stairs and ropes
  if ([...CHESTS, ...BOARDS, ...LINKS].some((o) => Math.hypot(o.x / TILE - mx, o.y / TILE - my) < K.prop)) return true;
  return STANDARDS.some((s) => Math.hypot(s.x / TILE - mx, s.y / TILE - my) < K.standard);
}

/**
 * Plan `clan` laid out at Hold `h`: clamped into its land's rect (a side that would leave it is pulled in), wall cells on
 * a solid map tile dropped (the map walls there already), on ground that must stay open (keepOpen) or another Hold's
 * tiles turned into gaps. repair() then opens whatever would cut a way.
 */
function layout(h: Hold, clan: ClanKey, claimed: ReadonlySet<number>): FortCell[] {
  const T = TERRITORIES[h.t], cx = Math.floor(h.x / TILE), cy = Math.floor(h.y / TILE);
  const lx = T.x - cx, hx = T.x + T.w - 1 - cx, ly = T.y - cy, hy = T.y + T.h - 1 - cy;
  const at = new Map<number, FortKind>(); // offset key -> kind
  const ok = (dx: number, dy: number) => (dy + 64) * 128 + dx + 64;
  for (const c of FORT_PLANS[clan].cells) {
    const dx = clamp(c.dx, lx, hx), dy = clamp(c.dy, ly, hy), k = ok(dx, dy), was = at.get(k);
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

/**
 * Opens wall cells (to "gap") until the walls of all `sets` together (cells round tile (cx, cy)) cut no way: ground
 * joined (4-way: a hero's box never squeezes past a touching corner) inside a box round the fort stays joined with the
 * walls up, so no way anywhere is cut (a way through the box can always go round inside it).
 */
function repair(cx: number, cy: number, sets: FortCell[][]) {
  let R = 0;
  for (const cells of sets) for (const c of cells) R = Math.max(R, Math.abs(c.dx), Math.abs(c.dy));
  const B = R + REACH_BOX, W = 2 * B + 1, idx = (dx: number, dy: number) => (dy + B) * W + dx + B;
  const solid = new Uint8Array(W * W);
  for (let dy = -B; dy <= B; dy++) for (let dx = -B; dx <= B; dx++) solid[idx(dx, dy)] = isSolidTile(cx + dx, cy + dy) ? 1 : 0;
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
    const walls = sets.flat().filter((c) => BLOCKING.has(c.kind)).sort((a, b) => Math.hypot(a.dx - gateAt.dx, a.dy - gateAt.dy) - Math.hypot(b.dx - gateAt.dx, b.dy - gateAt.dy));
    const pick = walls.find((c) => joins(c, true)) ?? walls.find((c) => joins(c, false));
    if (!pick) break; // (cannot happen: a piece cut off borders a wall cell)
    for (const c of sets.flat()) if (c.dx === pick.dx && c.dy === pick.dy && BLOCKING.has(c.kind)) c.kind = "gap"; // in every plan that walls it
  }
}

/** The fort as built from its cells. */
function finish(h: Hold, clan: ClanKey, cells: FortCell[]): HoldFort {
  const cx = Math.floor(h.x / TILE), cy = Math.floor(h.y / TILE);
  const walls: [number, number][] = [], gates: [number, number][] = [];
  let reachT = 0;
  for (const c of cells) {
    if (BLOCKING.has(c.kind)) { walls.push([cx + c.dx, cy + c.dy]); reachT = Math.max(reachT, Math.abs(c.dx), Math.abs(c.dy)); }
    else if (c.kind === "gate" || c.kind === "gap") gates.push([cx + c.dx, cy + c.dy]);
  }
  return { t: h.t, clan, cx, cy, cells, walls, gates, reach: reachT };
}

// ---- the fitted forts and the wall grid (built on first use) -----------------------------------------------------

let FORTS: Map<number, Record<ClanKey, HoldFort>> | undefined;
/** Per map tile: (territory + 1) << 5 | a bit per clan (CLAN_KEYS order) whose fort walls this tile. 0: no fort wall. */
let GRID: Uint16Array | undefined;
const TILES = new Map<number, number[]>();

function build() {
  FORTS = new Map(); GRID = new Uint16Array(MAP_W * MAP_H);
  const claimed = new Set<number>();
  for (const h of HOLDS) {
    const per = {} as Record<ClanKey, HoldFort>;
    const cx = Math.floor(h.x / TILE), cy = Math.floor(h.y / TILE), sets = CLAN_KEYS.map((k) => layout(h, k, claimed));
    for (const cells of sets) repair(cx, cy, [cells]); // each fort alone cuts no way...
    repair(cx, cy, sets); // ...nor all of them at once (routes planned for any holder go round every clan's walls)
    CLAN_KEYS.forEach((k, i) => { per[k] = finish(h, k, sets[i]); });
    FORTS.set(h.t, per);
    const mine = new Set<number>();
    CLAN_KEYS.forEach((k, ci) => {
      const f = per[k];
      for (const c of f.cells) mine.add(key(f.cx + c.dx, f.cy + c.dy));
      for (const [x, y] of f.walls) GRID![key(x, y)] |= ((h.t + 1) << 5) | (1 << ci);
    });
    for (const k of mine) claimed.add(k);
    TILES.set(h.t, [...mine].sort((a, b) => a - b));
  }
}
const forts = () => { if (!FORTS) build(); return FORTS!; };
const grid = () => { if (!GRID) build(); return GRID!; };

/** Territory t's Hold built to clan `clan`'s plan (undefined: the land has no Hold). */
export function fortOf(t: number, clan: ClanKey): HoldFort | undefined { return forts().get(t)?.[clan]; }

/** Every tile any clan's fort at territory t's Hold covers (map index ty * MAP_W + tx): what to recompute when it changes hands. */
export function holdTiles(t: number): number[] { forts(); return TILES.get(t) ?? []; }

/** Farthest wall from territory t's Hold middle over every clan's fort (tiles, Chebyshev). */
export function holdReach(t: number): number {
  const f = forts().get(t);
  return f ? Math.max(...CLAN_KEYS.map((k) => f[k].reach)) : HOLD_FORT_PX / TILE - 0.5;
}
/** Half-size (px) of the square round territory t's Hold that any clan's fort may wall: troops, guards, rituals and tunnels keep outside. */
export const holdReachPx = (t: number) => (holdReach(t) + 0.5) * TILE;

/** Is tile (tx, ty) a wall of the fort its land's holder builds? `ownerOf` gives each territory's holder. */
export function holdWallAt(tx: number, ty: number, ownerOf: (t: number) => ClanKey | undefined): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
  const v = grid()[ty * MAP_W + tx];
  if (!v) return false;
  const own = ownerOf((v >> 5) - 1), ci = own ? CLAN_KEYS.indexOf(own) : -1;
  return ci >= 0 && ((v >> ci) & 1) === 1;
}

/** Could any clan's fort wall tile (tx, ty)? Routes planned once for every holder (patrols, caravans, reach) go round it. */
export function anyHoldWall(tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && grid()[ty * MAP_W + tx] !== 0;
}

// ---- the live holders: set by the server (the war) and the client (the "war" snapshot) -------------------------

/** Holder of each territory as a CLAN_KEYS index (-1: none). Undefined until the war is known: then no Hold has walls. */
let OWN: Int8Array | undefined;

/**
 * The war's holders now (clan keys or CLAN_KEYS indexes, by territory id): the walls follow them. Returns the territories
 * whose fort changed (to refresh a walk grid or move people out of new walls). An empty list takes every wall down.
 */
export function setHoldOwners(owner: readonly (ClanKey | number | undefined | null)[]): number[] {
  grid();
  const next = new Int8Array(TERRITORIES.length).fill(-1), changed: number[] = [];
  for (let t = 0; t < next.length; t++) {
    const o = owner[t];
    next[t] = typeof o === "number" ? (o >= 0 && o < CLAN_KEYS.length ? o : -1) : typeof o === "string" ? CLAN_KEYS.indexOf(o as ClanKey) : -1;
    if ((OWN ? OWN[t] : -1) !== next[t] && forts().has(t)) changed.push(t);
  }
  OWN = next.some((c) => c >= 0) ? next : undefined;
  return changed;
}

/** Is tile (tx, ty) a wall of a Hold as its land is held now? */
export function liveHoldWall(tx: number, ty: number): boolean {
  if (!OWN || tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
  const v = GRID![ty * MAP_W + tx];
  if (!v) return false;
  const ci = OWN[(v >> 5) - 1];
  return ci >= 0 && ((v >> ci) & 1) === 1;
}

/** Is pixel (px, py) inside a Hold wall as the lands are held now? The movement check (shared/movement.ts) asks this. */
export const holdWallPx = (px: number, py: number) => OWN !== undefined && liveHoldWall(Math.floor(px / TILE), Math.floor(py / TILE));

/** Does a body of half-size r (px) at (x, y) overlap a live Hold wall? */
export function touchesHoldWall(x: number, y: number, r: number): boolean {
  return OWN !== undefined && (holdWallPx(x - r, y - r) || holdWallPx(x + r, y - r) || holdWallPx(x - r, y + r) || holdWallPx(x + r, y + r));
}

/** Half-size (px) of the square round territory t's Hold that its fort walls as held now (0: no walls up). */
export function liveReachPx(t: number): number {
  const ci = OWN ? OWN[t] : -1, f = ci >= 0 ? fortOf(t, CLAN_KEYS[ci]) : undefined;
  return f && f.walls.length ? (f.reach + 0.5) * TILE : 0;
}

/** Holder of territory t as the walls stand now (a CLAN_KEYS index; -1 none or no war known). */
export const liveHolder = (t: number) => (OWN ? OWN[t] ?? -1 : -1);
