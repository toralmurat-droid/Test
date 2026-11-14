/**
 * Clan troop patrols (cosmetic): each territory's holder sends small squads walking a loop from its Hold past its
 * standards and back. Only the client draws them; the server never imports this. Routes come from the map alone
 * (tile BFS), so every client sees the same loops.
 */
import { TILE } from "../constants";
import { isSolidAt, isSolidTile } from "../map";
import type { ClanKey } from "./clans";
import { HOLD_FORT_PX, HOLDS, STANDARDS } from "./standards";
import { TERRITORIES } from "./territories";

export const TROOP = {
  /** Soldiers in a full-strength patrol column (marching two abreast). */
  perPatrol: 8,
  /** Smallest column a weakly held land still sends. */
  patrolMin: 4,
  /** Sideways offset of each file from the path (px): two abreast, one on each side. */
  lateral: 10,
  /** Walking speed (px/s): a slow march, well under a hero's pace, so squads read as scenery. */
  speed: 30,
  /** Distance between ranks along the route (px): a rank is two soldiers side by side. */
  rankGap: 24,
  /** Pause at each stop (Hold, standard): the squad "checks in" there before moving on. */
  pauseMs: 2500,
  /** Hold guards of a land at control 0 and at control 100 (px ring around the Hold, see garrisonSpots). */
  garrisonMin: 4,
  garrisonMax: 6,
  /** Fraction of a column / siege defence a land at control 0 still fields (scales linearly up to 1 at control 100). */
  weakShare: 0.5,
  /** The client draws squads whose territory has a stop this close to the hero (px); farther ones are off screen. */
  viewRange: 22 * TILE,
};

/** Siege battle at one standard (cosmetic): two loose lines clash, some fall, reinforcements walk in. */
export const SIEGE_FIGHT = {
  /** Fighters per side per standard (defenders are scaled by the land's control). */
  perSide: 8,
  /** Sprites a land may show in a siege (both sides, all standards): perSide shrinks to fit. */
  budget: 40,
  /** Fewest defenders that still make a line. */
  minDefenders: 4,
  /** Distance between the two lines (px) and between neighbours in a line. */
  lineGap: 44,
  spacing: 18,
  /** Chance (%) that a fighter falls in one life cycle. */
  dieChance: 40,
  /** One life cycle of a slot (ms) plus a per-slot stretch, so the fight never pulses in step. */
  cycleMs: 14000,
  cycleJitter: 5000,
  /** A reinforcement's walk to the line, and how far away it starts (px). */
  walkMs: 2400,
  walkFrom: 130,
  /** Earliest a fighter falls after reaching the line; fall, lie and fade durations; shortest gap before the next arrival. */
  fightMinMs: 2500,
  fallMs: 500,
  lieMs: 1800,
  fadeMs: 700,
  goneMinMs: 1500,
};

/** Share (0..1) of full strength a land fields at `control` (0..100). */
export function troopShare(control: number): number {
  const c = Math.max(0, Math.min(100, Number.isFinite(control) ? control : 100)) / 100;
  return TROOP.weakShare + (1 - TROOP.weakShare) * c;
}
/** Soldiers in a land's patrol column at `control`. */
export const patrolCount = (control: number) => Math.max(TROOP.patrolMin, Math.round(TROOP.perPatrol * troopShare(control)));
/** Hold guards at `control`. */
export const garrisonCount = (control: number) =>
  Math.round(TROOP.garrisonMin + (TROOP.garrisonMax - TROOP.garrisonMin) * Math.max(0, Math.min(100, control)) / 100);
/** Fighters per side at each of a land's `stds` standards; defenders shrink with the land's control, attackers do not. */
export function siegeCounts(stds: number, control: number): { atk: number; def: number } {
  const per = Math.max(1, Math.min(SIEGE_FIGHT.perSide, Math.floor(SIEGE_FIGHT.budget / (2 * Math.max(1, stds)))));
  return { atk: per, def: Math.min(per, Math.max(SIEGE_FIGHT.minDefenders, Math.round(per * troopShare(control)))) };
}

/** Small integer hash (deterministic noise for looks): 0..2^32-1. */
export function mix(a: number, b: number, c = 0): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b) ^ Math.imul(c | 0, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return h >>> 0;
}

/**
 * Where a siege fighter's slot is at wall time `wall`: walking in as a reinforcement ("walk", u 0..1), fighting
 * ("fight"), fallen ("down", t ms since the fall) or away ("gone"). Each cycle a slot dies with dieChance %; a slot
 * whose last cycle ended in a death arrives by walking at the start of the next one. Same on every client.
 */
export function siegeLife(seed: number, slot: number, wall: number): { s: "walk" | "fight" | "down" | "gone"; t: number; u: number } {
  const F = SIEGE_FIGHT, P = F.cycleMs + (mix(seed, slot, 1) % F.cycleJitter);
  const x = wall + (mix(seed, slot, 2) % P), n = Math.floor(x / P), tc = x - n * P;
  const dies = (c: number) => mix(seed, slot, 100 + c) % 100 < F.dieChance;
  const walk = dies(n - 1) ? F.walkMs : 0;
  if (tc < walk) return { s: "walk", t: tc, u: tc / walk };
  if (!dies(n)) return { s: "fight", t: tc - walk, u: 1 };
  const last = P - (F.fallMs + F.lieMs + F.fadeMs) - F.goneMinMs, first = walk + F.fightMinMs;
  const at = first + (mix(seed, slot, 5000 + n) % Math.max(1, last - first));
  if (tc < at) return { s: "fight", t: tc - walk, u: 1 };
  const d = tc - at;
  return d < F.fallMs + F.lieMs + F.fadeMs ? { s: "down", t: d, u: 1 } : { s: "gone", t: 0, u: 1 };
}

export interface Patrol {
  t: number;
  /** Closed loop of waypoints (px); pts[0] is the spot outside the Hold's front gate, the last point links back to it. */
  pts: { x: number; y: number }[];
  /** Indexes in pts of the gate and standard stops. */
  stops: number[];
  /** Loop length (px), closing segment included. */
  len: number;
}

/** Tiles of slack around a territory's rect that a route may use (to step around a wall at its edge). */
const MARGIN = 2;

/** A territory's working area (tiles, inclusive) with its walkability read from the map once. */
interface Box { x0: number; y0: number; x1: number; y1: number; w: number; walk: Uint8Array; open: Uint8Array }
function box(x0: number, y0: number, x1: number, y1: number): Box {
  const w = x1 - x0 + 1, h = y1 - y0 + 1, walk = new Uint8Array(w * h), open = new Uint8Array(w * h);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    walk[(ty - y0) * w + tx - x0] = isSolidAt((tx + 0.5) * TILE, (ty + 0.5) * TILE) ? 0 : 1; // a hero can stand on its centre
    open[(ty - y0) * w + tx - x0] = isSolidTile(tx, ty) ? 0 : 1; // nothing on it at all (segments may cross it anywhere)
  }
  return { x0, y0, x1, y1, w, walk, open };
}
const inside = (b: Box, tx: number, ty: number) => tx >= b.x0 && ty >= b.y0 && tx <= b.x1 && ty <= b.y1;
const free = (b: Box, tx: number, ty: number) => inside(b, tx, ty) && b.walk[(ty - b.y0) * b.w + tx - b.x0] === 1;

const STEPS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Shortest 8-connected tile path from a to b inside the box (diagonals only past two free sides), or undefined. */
function bfs(b: Box, ax: number, ay: number, bx: number, by: number): [number, number][] | undefined {
  const w = b.w, idx = (x: number, y: number) => (y - b.y0) * w + (x - b.x0);
  if (!free(b, ax, ay) || !free(b, bx, by)) return undefined;
  const prev = new Int32Array(b.walk.length).fill(-1), q = new Int32Array(b.walk.length);
  let head = 0, tail = 0;
  const start = idx(ax, ay), goal = idx(bx, by);
  prev[start] = start; q[tail++] = start;
  while (head < tail) {
    const c = q[head++];
    if (c === goal) break;
    const cx = (c % w) + b.x0, cy = Math.floor(c / w) + b.y0;
    for (const [dx, dy] of STEPS) {
      const nx = cx + dx, ny = cy + dy;
      if (!free(b, nx, ny)) continue;
      if (dx && dy && (!free(b, cx + dx, cy) || !free(b, cx, cy + dy))) continue; // no cutting a solid corner
      const n = idx(nx, ny);
      if (prev[n] !== -1) continue;
      prev[n] = c; q[tail++] = n;
    }
  }
  if (prev[goal] === -1) return undefined;
  const out: [number, number][] = [];
  for (let c = goal; ; c = prev[c]) { out.push([(c % w) + b.x0, Math.floor(c / w) + b.y0]); if (c === start) break; }
  return out.reverse();
}

/** True when the straight segment (px) touches no solid tile: 1 px samples, each checked with a half-pixel spread. */
function clear(b: Box, ax: number, ay: number, bx: number, by: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
  for (let i = 0; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n;
    for (let k = 0; k < 4; k++) {
      const tx = Math.floor((x + (k & 1 ? 0.5 : -0.5)) / TILE), ty = Math.floor((y + (k & 2 ? 0.5 : -0.5)) / TILE);
      if (!inside(b, tx, ty) || !b.open[(ty - b.y0) * b.w + tx - b.x0]) return false;
    }
  }
  return true;
}

/** Waypoints (px) of a tile path: drop the middle of straight runs, then greedy line-of-sight, keeping both ends. */
function simplify(b: Box, path: [number, number][]): { x: number; y: number }[] {
  const turns = path.filter((c, i) => i === 0 || i === path.length - 1
    || c[0] - path[i - 1][0] !== path[i + 1][0] - c[0] || c[1] - path[i - 1][1] !== path[i + 1][1] - c[1]);
  const px = turns.map(([tx, ty]) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }));
  const out = [px[0]];
  let i = 0;
  while (i < px.length - 1) {
    let j = i + 1;
    while (j + 1 < px.length && clear(b, px[i].x, px[i].y, px[j + 1].x, px[j + 1].y)) j++;
    out.push(px[j]); i = j;
  }
  return out;
}

/** Slack between the fort's walls and the soldiers outside them (px). */
const FORT_MARGIN = 28;

/** Spots on a square just outside the Hold's walls, the front gate (+x side, toward the viewer in iso) first, then outwards round it. */
function gateSpots(h: { x: number; y: number }): { x: number; y: number }[] {
  const d0 = HOLD_FORT_PX + FORT_MARGIN, out: { x: number; y: number }[] = [];
  for (let d = d0; d <= d0 + 3 * TILE; d += TILE / 2)
    for (let o = -d; o <= d; o += TILE / 2) out.push({ x: h.x + d, y: h.y + o }, { x: h.x - d, y: h.y + o }, { x: h.x + o, y: h.y + d }, { x: h.x + o, y: h.y - d });
  const g = { x: h.x + d0, y: h.y + 8 };
  return out.sort((a, c) => Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(c.x - g.x, c.y - g.y));
}

function build(tid: number): Patrol | undefined {
  const t = TERRITORIES[tid], hold = HOLDS.find((h) => h.t === tid);
  if (!t || !hold) return undefined;
  const b = box(t.x - MARGIN, t.y - MARGIN, t.x + t.w - 1 + MARGIN, t.y + t.h - 1 + MARGIN);
  const tile = (p: { x: number; y: number }): [number, number] => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)];
  // the loop starts and ends at a spot outside the fort's gate (never inside the compound, where the layers sort wrong)
  let gate: { x: number; y: number } | undefined, out: { s: (typeof STANDARDS)[number]; path: [number, number][] | undefined }[] = [];
  for (const g of gateSpots(hold)) {
    const [gx, gy] = tile(g);
    if (!free(b, gx, gy)) continue;
    const r = STANDARDS.filter((s) => s.t === tid).map((s) => ({ s, path: bfs(b, gx, gy, ...tile(s)) })).filter((x) => x.path);
    if (r.length) { gate = { x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE }; out = r; break; }
  }
  if (!gate || !out.length) return undefined;
  // gate -> first standard, standard -> next (BFS), last standard -> gate (the way out, reversed)
  const legs: [number, number][][] = [out[0].path!];
  for (let i = 0; i + 1 < out.length; i++) legs.push(bfs(b, ...tile(out[i].s), ...tile(out[i + 1].s))!); // both reach the gate, so each other
  legs.push([...out[out.length - 1].path!].reverse());
  const pts: { x: number; y: number }[] = [], stops: number[] = [];
  for (const leg of legs) {
    stops.push(pts.length);
    pts.push(...simplify(b, leg).slice(0, -1)); // the leg's end is the next leg's start (or the gate again)
  }
  let len = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length]; len += Math.hypot(c.x - a.x, c.y - a.y); }
  return { t: tid, pts, stops, len };
}

const cache = new Map<number, Patrol | undefined>();
/** Territory `t`'s patrol (built on first ask, then cached), or undefined if it has no Hold or reachable standard. */
export function patrolOf(t: number): Patrol | undefined {
  if (!cache.has(t)) cache.set(t, build(t));
  return cache.get(t);
}

let all: Patrol[] | undefined;
/** Every territory's patrol, built on the first call (no map work at import). */
export function patrols(): Patrol[] {
  if (!all) all = TERRITORIES.map((t) => patrolOf(t.id)).filter((p): p is Patrol => !!p);
  return all;
}

/** Point and unit direction at distance `dist` (wrapped by len) along the loop. */
export function patrolPos(p: Patrol, dist: number): { x: number; y: number; dx: number; dy: number } {
  const n = p.pts.length;
  if (n === 1 || p.len <= 0) return { x: p.pts[0].x, y: p.pts[0].y, dx: 1, dy: 0 };
  let d = ((dist % p.len) + p.len) % p.len;
  for (let i = 0; i < n; i++) {
    const a = p.pts[i], b = p.pts[(i + 1) % n], l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l === 0) continue;
    if (d <= l || i === n - 1) {
      const f = Math.min(1, d / l);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dx: (b.x - a.x) / l, dy: (b.y - a.y) / l };
    }
    d -= l;
  }
  return { x: p.pts[0].x, y: p.pts[0].y, dx: 1, dy: 0 };
}

const spots = new Map<number, { x: number; y: number; fx: number; fy: number }[]>();
/**
 * Up to `n` guard posts around territory `t`'s Hold, outside its walls: deterministic ring points on walkable ground, each with the
 * unit direction pointing away from the Hold (the way a guard faces). Fewer come back if the ground is cramped.
 */
export function garrisonSpots(t: number, n: number): { x: number; y: number; fx: number; fy: number }[] {
  if (!spots.has(t)) {
    const hold = HOLDS.find((h) => h.t === t), out: { x: number; y: number; fx: number; fy: number }[] = [];
    if (hold) for (let k = 0; k < 64 && out.length < TROOP.garrisonMax; k++) {
      // a square ring outside the fort's walls: Chebyshev distance from the Hold, so no guard stands in the compound
      const a = k * 2.399963 + t * 0.7, fx = Math.cos(a), fy = Math.sin(a), r = (HOLD_FORT_PX + FORT_MARGIN + (k % 3) * 18) / Math.max(Math.abs(fx), Math.abs(fy));
      const x = hold.x + fx * r, y = hold.y + fy * r;
      if (isSolidAt(x, y) || isSolidAt(x + 8, y) || isSolidAt(x - 8, y) || isSolidAt(x, y + 8) || isSolidAt(x, y - 8)) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.y - y) < 28)) continue;
      out.push({ x, y, fx, fy });
    }
    spots.set(t, out);
  }
  return spots.get(t)!.slice(0, n);
}

/**
 * Art keys of each clan's soldiers: a line soldier (`kinds`, picked per soldier) and the `officer` who leads the column.
 * Painted sheets `mob_<key>` (tools/art/paint/warLooks.ts); art-only, they are not monster kinds and sit in no gameplay table.
 * Without the painted look (`?pixel=1`) the client falls back to older monster sheets (client/src/warTroops.ts LEGACY).
 */
export const TROOP_LOOK: Record<ClanKey, { kinds: string[]; officer: string }> = {
  wardens: { kinds: ["war_warden"], officer: "war_warden_cap" },
  redfang: { kinds: ["war_redfang"], officer: "war_redfang_chief" },
  host: { kinds: ["war_host"], officer: "war_host_cap" },
  hidekin: { kinds: ["war_hidekin"], officer: "war_hidekin_chief" },
  veiled: { kinds: ["war_veiled"], officer: "war_veiled_adept" },
};
