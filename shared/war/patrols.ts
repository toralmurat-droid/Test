/**
 * Clan troop patrols (cosmetic): each territory's holder sends small squads walking a loop from its Hold past its
 * standards and back. Only the client draws them; the server never imports this. Routes come from the map alone
 * (tile BFS), so every client sees the same loops.
 */
import { TILE } from "../constants";
import { isSolidAt, isSolidTile } from "../map";
import type { ClanKey } from "./clans";
import { HOLDS, STANDARDS } from "./standards";
import { TERRITORIES } from "./territories";

export const TROOP = {
  /** Soldiers in one squad: enough to read as a troop, few enough to stay cheap to draw. */
  perPatrol: 3,
  /** Walking speed (px/s): a slow march, well under a hero's pace, so squads read as scenery. */
  speed: 30,
  /** Spacing between soldiers along the route (px): just under a tile, so a squad looks like a file. */
  gap: 28,
  /** Pause at each stop (Hold, standard): the squad "checks in" there before moving on. */
  pauseMs: 2500,
  /** Extra skirmish squads per standard in a contested territory (the client decides when one is contested). */
  skirmishPerStandard: 2,
  /** The client draws squads whose territory has a stop this close to the hero (px); farther ones are off screen. */
  viewRange: 22 * TILE,
};

export interface Patrol {
  t: number;
  /** Closed loop of waypoints (px); pts[0] is the Hold, the last point links back to it. */
  pts: { x: number; y: number }[];
  /** Indexes in pts of the Hold and standard stops. */
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

function build(tid: number): Patrol | undefined {
  const t = TERRITORIES[tid], hold = HOLDS.find((h) => h.t === tid);
  if (!t || !hold) return undefined;
  const b = box(t.x - MARGIN, t.y - MARGIN, t.x + t.w - 1 + MARGIN, t.y + t.h - 1 + MARGIN);
  const tile = (p: { x: number; y: number }): [number, number] => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)];
  const [hx, hy] = tile(hold);
  const out = STANDARDS.filter((s) => s.t === tid).map((s) => ({ s, path: bfs(b, hx, hy, ...tile(s)) })).filter((r) => r.path);
  if (!out.length) return undefined;
  // Hold -> first standard, standard -> next (BFS), last standard -> Hold (the way out, reversed)
  const legs: [number, number][][] = [out[0].path!];
  for (let i = 0; i + 1 < out.length; i++) legs.push(bfs(b, ...tile(out[i].s), ...tile(out[i + 1].s))!); // both reach the Hold, so each other
  legs.push([...out[out.length - 1].path!].reverse());
  const pts: { x: number; y: number }[] = [], stops: number[] = [];
  for (const leg of legs) {
    stops.push(pts.length);
    pts.push(...simplify(b, leg).slice(0, -1)); // the leg's end is the next leg's start (or the Hold again)
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

/** Sprite kinds (texture keys from tools/art/characters.ts) each clan's soldiers wear; the client picks per soldier. */
export const TROOP_LOOK: Record<ClanKey, { kinds: string[] }> = {
  wardens: { kinds: ["watchman"] },
  redfang: { kinds: ["bandit", "bandit_brute"] },
  host: { kinds: ["skeleton_spear", "skeleton"] },
  hidekin: { kinds: ["gnawkin_folk", "tuskborn_folk"] },
  veiled: { kinds: ["veiled", "nomad_folk"] },
};
