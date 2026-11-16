/**
 * War roads (W4): the ways a clan's marching column takes from one Hold to a neighbour's. Generated, not painted into
 * the map (shared/map.ts and WORLD.roads stay untouched): the same weighted tile search as the caravans (it prefers
 * DIRT, COBBLE and BRIDGE, so it follows the real roads where there are some), with every tile any clan's fort at any
 * tier may cover blocked (walls everywhere; the whole footprint of every Hold but the road's own two), so a road never
 * runs into a Hold that might grow later. Pairs in one land get a road; the
 * four waygate links get two legs (Hold to gate, gate to Hold); a neighbour pair the search cannot join gets a straight
 * "track" whose columns are simulated only. The server builds roads lazily and sends them to clients once ("warroads");
 * the client never runs the search. Pure and deterministic, like the map. The caravans (caravans.ts) share the search.
 */
import { MAP_H, MAP_W, TILE } from "../constants";
import { DOORS, GROUND, isSafeZone, isSolidAt, isSolidTile, T } from "../map";
import { noMobsAt } from "../spawns";
import { inVillage } from "../wrath";
import { anyHoldWall, holdCellAt } from "./holdWalls";
import { patrolOf } from "./patrols";
import { LAND_LINKS, TERRITORIES } from "./territories";

/** The route search, shared by the caravans' cart roads (CARAVAN takes these) and the war roads. */
export const ROAD_SEARCH = {
  /** Tiles of slack around the two ends' bounding box (a second try uses 5x as much), the cost of a step on a road and off it. */
  marginTiles: 3, roadCost: 1, wildCost: 3,
  /** A waygate leg ends at the walkable tile nearest the gate within this many tiles (the gate may stand on safe ground). */
  gateReach: 14,
};

/** A walked way: waypoints (px, tile centres), the distance along it at each waypoint, and its length. */
export interface Road {
  a: number; b: number;
  /** Waypoints (px), pts[0] outside a's Hold gate, the last outside b's (or at a waygate, for a link leg). */
  pts: { x: number; y: number }[];
  /** Distance along the route at each waypoint (px); cum[last] = len. */
  cum: number[];
  len: number;
}

/** A point (px) no marching soldier, cart nor escort may enter: the safe squares, the stockade, monster-free ground. */
export const roadOffLimits = (x: number, y: number) => isSafeZone(x, y) || inVillage(x, y) || noMobsAt(x, y);

let doorTiles: Set<number> | undefined;
/** Every tile of a dungeon gate's wall, open or shut (a route must not depend on a door someone opened). */
const isDoor = (tx: number, ty: number) => {
  if (!doorTiles) { doorTiles = new Set(); for (const d of DOORS) for (const k of d.tiles) doorTiles.add(k); }
  return doorTiles.has(ty * MAP_W + tx);
};

export interface SearchBox { x0: number; y0: number; w: number; h: number; walk: Uint8Array; open: Uint8Array; cost: Uint8Array }
/**
 * The search area with walkability (centre free, never off limits or a door) and line-of-sight (no solid at all) read
 * once. `foot`: every tile of a Hold's fort footprint (any clan, any tier: walls, gates, courtyard) is blocked too, but
 * for the Holds listed in `own` (a road's own ends: every tier's walls are blocked anyway, so it may cross their yards).
 */
export function searchBox(x0: number, y0: number, x1: number, y1: number, foot = false, own: readonly number[] = []): SearchBox {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(MAP_W - 1, x1); y1 = Math.min(MAP_H - 1, y1);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, walk = new Uint8Array(w * h), open = new Uint8Array(w * h), cost = new Uint8Array(w * h);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const i = (ty - y0) * w + tx - x0, cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    const banned = isDoor(tx, ty) || anyHoldWall(tx, ty) || (foot && footOf(tx, ty, own)) || roadOffLimits(cx, cy) || roadOffLimits(tx * TILE, ty * TILE) || roadOffLimits((tx + 1) * TILE - 0.01, (ty + 1) * TILE - 0.01)
      || roadOffLimits((tx + 1) * TILE - 0.01, ty * TILE) || roadOffLimits(tx * TILE, (ty + 1) * TILE - 0.01);
    walk[i] = !banned && !isSolidAt(cx, cy) ? 1 : 0;
    open[i] = !banned && !isSolidTile(tx, ty) ? 1 : 0;
    const g = GROUND[ty][tx];
    cost[i] = g === T.DIRT || g === T.COBBLE || g === T.BRIDGE ? ROAD_SEARCH.roadCost : ROAD_SEARCH.wildCost;
  }
  return { x0, y0, w, h, walk, open, cost };
}
const footOf = (tx: number, ty: number, own: readonly number[]) => { const h = holdCellAt(tx, ty); return h >= 0 && !own.includes(h); };
const inBox = (b: SearchBox, tx: number, ty: number) => tx >= b.x0 && ty >= b.y0 && tx < b.x0 + b.w && ty < b.y0 + b.h;
const walkable = (b: SearchBox, tx: number, ty: number) => inBox(b, tx, ty) && b.walk[(ty - b.y0) * b.w + tx - b.x0] === 1;

const STEPS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Cheapest-path tree from (ax, ay) over the box, stopping at index `goal` (-1: the whole box). Ties break by index: deterministic. */
function dijkstra(b: SearchBox, ax: number, ay: number, goal: number): { dist: Float64Array; prev: Int32Array } {
  const N = b.w * b.h, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const idx = (x: number, y: number) => (y - b.y0) * b.w + (x - b.x0);
  const start = idx(ax, ay);
  // binary heap of [cost, index]
  const hc: number[] = [], hi: number[] = [];
  const push = (c: number, i: number) => {
    let k = hc.length; hc.push(c); hi.push(i);
    while (k > 0) { const p = (k - 1) >> 1; if (hc[p] < c || (hc[p] === c && hi[p] <= i)) break; hc[k] = hc[p]; hi[k] = hi[p]; k = p; }
    hc[k] = c; hi[k] = i;
  };
  const pop = (): [number, number] => {
    const c = hc[0], i = hi[0], lc = hc.pop()!, li = hi.pop()!;
    if (hc.length) {
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k, mc = lc, mi = li;
        if (l < hc.length && (hc[l] < mc || (hc[l] === mc && hi[l] < mi))) { m = l; mc = hc[l]; mi = hi[l]; }
        if (r < hc.length && (hc[r] < mc || (hc[r] === mc && hi[r] < mi))) { m = r; mc = hc[r]; mi = hi[r]; }
        if (m === k) break;
        hc[k] = hc[m]; hi[k] = hi[m]; k = m;
      }
      hc[k] = lc; hi[k] = li;
    }
    return [c, i];
  };
  dist[start] = 0; prev[start] = start; push(0, start);
  while (hc.length) {
    const [c, i] = pop();
    if (c > dist[i]) continue;
    if (i === goal) break;
    const cx = (i % b.w) + b.x0, cy = Math.floor(i / b.w) + b.y0;
    for (const [dx, dy] of STEPS) {
      const nx = cx + dx, ny = cy + dy;
      if (!walkable(b, nx, ny)) continue;
      if (dx && dy && (!walkable(b, cx + dx, cy) || !walkable(b, cx, cy + dy))) continue;
      const j = idx(nx, ny), nc = c + b.cost[j] * (dx && dy ? Math.SQRT2 : 1);
      if (nc < dist[j]) { dist[j] = nc; prev[j] = i; push(nc, j); }
    }
  }
  return { dist, prev };
}

/** The tile path from the tree's start to index `goal`. */
function walkBack(b: SearchBox, prev: Int32Array, goal: number): [number, number][] {
  const out: [number, number][] = [];
  for (let c = goal; ; c = prev[c]) { out.push([(c % b.w) + b.x0, Math.floor(c / b.w) + b.y0]); if (prev[c] === c) break; }
  return out.reverse();
}

/** Cheapest 8-connected tile path a -> b (roads cheap, no cutting a blocked corner), or undefined. Ties break by index: deterministic. */
export function searchPath(b: SearchBox, ax: number, ay: number, bx: number, by: number): [number, number][] | undefined {
  if (!walkable(b, ax, ay) || !walkable(b, bx, by)) return undefined;
  const goal = (by - b.y0) * b.w + (bx - b.x0), { prev } = dijkstra(b, ax, ay, goal);
  return prev[goal] === -1 ? undefined : walkBack(b, prev, goal);
}

/**
 * Cheapest path from a to the reachable tile nearest (gx, gy) within `reach` tiles (a waygate may stand on safe ground,
 * where no column walks: the leg ends short of it). Nearest first, then cheapest, then lowest index. Undefined if none.
 */
export function searchNear(b: SearchBox, ax: number, ay: number, gx: number, gy: number, reach: number): [number, number][] | undefined {
  if (!walkable(b, ax, ay)) return undefined;
  const { dist, prev } = dijkstra(b, ax, ay, -1);
  let best = -1, bd = Infinity, bc = Infinity;
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] === Infinity) continue;
    const d = Math.hypot((i % b.w) + b.x0 - gx, Math.floor(i / b.w) + b.y0 - gy);
    if (d <= reach && (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && dist[i] < bc))) { best = i; bd = d; bc = dist[i]; }
  }
  return best < 0 ? undefined : walkBack(b, prev, best);
}

/** True when the straight segment (px) touches no solid, door or off-limits tile (1 px samples, a half-pixel spread). */
function clear(b: SearchBox, ax: number, ay: number, bx: number, by: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
  for (let i = 0; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n;
    for (let k = 0; k < 4; k++) {
      const tx = Math.floor((x + (k & 1 ? 0.5 : -0.5)) / TILE), ty = Math.floor((y + (k & 2 ? 0.5 : -0.5)) / TILE);
      if (!inBox(b, tx, ty) || !b.open[(ty - b.y0) * b.w + tx - b.x0]) return false;
    }
  }
  return true;
}

/** Waypoints of a tile path: corners only, then greedy line of sight (on fully open tiles), keeping both ends. */
export function simplifyPath(b: SearchBox, path: [number, number][]): { x: number; y: number }[] {
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

/** A road through these waypoints. */
export function makeRoad(a: number, b: number, pts: { x: number; y: number }[]): Road {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { a, b, pts, cum, len: cum[cum.length - 1] };
}
/** The same road walked the other way (from b to a), measured afresh so it is the road the client rebuilds from its points. */
export const reverseRoad = (r: Road): Road => makeRoad(r.b, r.a, [...r.pts].reverse());

/** Point and unit direction at distance `d` along the road (clamped to its ends). */
export function routePos(r: Road, d: number): { x: number; y: number; dx: number; dy: number } {
  const n = r.pts.length, dd = Math.max(0, Math.min(r.len, d));
  let i = 0;
  while (i < n - 2 && r.cum[i + 1] < dd) i++;
  const a = r.pts[i], b = r.pts[Math.min(n - 1, i + 1)], l = r.cum[Math.min(n - 1, i + 1)] - r.cum[i];
  if (!(l > 0)) return { x: a.x, y: a.y, dx: 1, dy: 0 };
  const f = Math.max(0, Math.min(1, (dd - r.cum[i]) / l));
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dx: (b.x - a.x) / l, dy: (b.y - a.y) / l };
}

const tileOf = (p: { x: number; y: number }): [number, number] => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)];

/**
 * The road from a's Hold gate to b's (the patrol loops' first stop), two territories of one land, over both lands' box
 * (a wider box if water or walls cut it). `foot`: keep off the fort footprint of every other Hold (war roads); the caravans' cart roads
 * keep the search they always had. Undefined when none is found.
 */
export function buildRoad(a: number, b: number, foot = false): Road | undefined {
  const A = TERRITORIES[a], B = TERRITORIES[b], pa = patrolOf(a), pb = patrolOf(b);
  if (!A || !B || A.region !== B.region || !pa || !pb) return undefined;
  for (const M of [ROAD_SEARCH.marginTiles, ROAD_SEARCH.marginTiles * 5]) {
    const bx = searchBox(Math.min(A.x, B.x) - M, Math.min(A.y, B.y) - M, Math.max(A.x + A.w, B.x + B.w) - 1 + M, Math.max(A.y + A.h, B.y + B.h) - 1 + M, foot, [a, b]);
    const path = searchPath(bx, ...tileOf(pa.pts[0]), ...tileOf(pb.pts[0]));
    if (path && path.length >= 2) return makeRoad(a, b, simplifyPath(bx, path));
  }
  return undefined;
}

/** One leg from t's Hold gate toward the waygate tile (gx, gy), ending at the walkable tile nearest it (other Holds' footprints kept off). */
function gateLeg(t: number, gx: number, gy: number): Road | undefined {
  const A = TERRITORIES[t], p = patrolOf(t);
  if (!A || !p) return undefined;
  for (const M of [ROAD_SEARCH.marginTiles, ROAD_SEARCH.marginTiles * 5]) {
    const R = ROAD_SEARCH.gateReach;
    const bx = searchBox(Math.min(A.x, gx - R) - M, Math.min(A.y, gy - R) - M, Math.max(A.x + A.w - 1, gx + R) + M, Math.max(A.y + A.h - 1, gy + R) + M, true, [t]);
    const path = searchNear(bx, ...tileOf(p.pts[0]), gx, gy, R);
    if (path && path.length >= 2) return makeRoad(t, t, simplifyPath(bx, path));
  }
  return undefined;
}

const cache = new Map<string, Road | undefined>();
const lk = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
/** Whether a's and b's war road is already built (or known to be missing), so callers can warm roads a few at a time. */
export const warRoadKnown = (a: number, b: number) => cache.has(lk(a, b)) || linkKnown(a, b);
/** The war road from a's Hold gate to b's, two neighbours of one land (built on first ask, then cached; b -> a is the same road reversed). */
export function warRoad(a: number, b: number): Road | undefined {
  const key = lk(a, b);
  if (!cache.has(key)) cache.set(key, TERRITORIES[a]?.near.includes(b) ? buildRoad(Math.min(a, b), Math.max(a, b), true) : undefined);
  const r = cache.get(key);
  return r && a > b ? reverseRoad(r) : r;
}

/** The two legs of a march across a waygate link: a's Hold to the near gate, then the far gate to b's Hold. */
export interface LinkLegs { legs: [Road, Road]; gate: string }
const legCache = new Map<string, [Road, Road] | null>();
const linkOf = (a: number, b: number) => LAND_LINKS.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
const linkKnown = (a: number, b: number) => legCache.has(lk(a, b));
/** The legs of the waygate link between territories a and b (LAND_LINKS), walked from a; undefined when they are not linked or a leg has no road. */
export function linkLegs(a: number, b: number): LinkLegs | undefined {
  const link = linkOf(a, b);
  if (!link) return undefined;
  const key = lk(a, b);
  if (!legCache.has(key)) {
    const l1 = gateLeg(link.a, link.link.pa.x, link.link.pa.y), l2 = gateLeg(link.b, link.link.pb.x, link.link.pb.y);
    legCache.set(key, l1 && l2 ? [{ ...l1, a: link.a, b: link.b }, { ...reverseRoad(l2), a: link.a, b: link.b }] : null);
  }
  const legs = legCache.get(key);
  if (!legs) return undefined;
  if (link.a === a) return { legs: [legs[0], legs[1]], gate: link.link.name };
  const back = (r: Road) => ({ ...reverseRoad(r), a, b });
  return { legs: [back(legs[1]), back(legs[0])], gate: link.link.name };
}

/** Kind of a neighbour pair's way: a road in one land, a waygate link, or a straight track (no road found: columns simulated only). */
export type RoadKind = "road" | "link" | "track";
/** Every pair of neighbouring territories (a < b) and what joins them (`kind` known once built: warRoad / linkLegs). */
export function roadPairs(): { a: number; b: number; link: boolean }[] {
  const out: { a: number; b: number; link: boolean }[] = [];
  for (const t of TERRITORIES) for (const n of t.near) if (n > t.id) out.push({ a: t.id, b: n, link: t.region !== TERRITORIES[n].region });
  return out;
}

/** A Hold gate (px, the tile centre): its patrol's first stop, else the land's centre. */
export function holdGate(t: number): { x: number; y: number } {
  const p = patrolOf(t), T = TERRITORIES[t], [tx, ty] = p ? tileOf(p.pts[0]) : [Math.floor(T.cx), Math.floor(T.cy)];
  return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }; // (a tile centre, so the client's copy from "warroads" measures the same)
}

/**
 * The way a column walks from a to b, as one or two legs: the war road, the waygate legs (`gate`: a gate step between
 * them), or a straight track between the two Hold gates (`track`: never walked by real soldiers). Builds on demand.
 */
export interface WarPath { a: number; b: number; legs: Road[]; kind: RoadKind; len: number }
export function warPath(a: number, b: number): WarPath | undefined {
  if (!TERRITORIES[a]?.near.includes(b)) return undefined;
  if (TERRITORIES[a].region === TERRITORIES[b].region) {
    const r = warRoad(a, b);
    if (r) return { a, b, legs: [r], kind: "road", len: r.len };
  } else {
    const l = linkLegs(a, b);
    if (l) return { a, b, legs: l.legs, kind: "link", len: l.legs[0].len + l.legs[1].len };
  }
  const r = makeRoad(a, b, [holdGate(a), holdGate(b)]);
  return { a, b, legs: [r], kind: "track", len: r.len };
}
/** Is the way between a and b built (or known missing)? */
export const pathKnown = (a: number, b: number) => (TERRITORIES[a]?.region === TERRITORIES[b]?.region ? cache.has(lk(a, b)) : linkKnown(a, b));

/**
 * The "warroads" message entry of a pair (a < b): `[a, b, pts, flag?]`, pts flat whole tile coordinates
 * [tx0, ty0, tx1, ty1, ...] of the waypoints (tile centres) walked from a. No flag: a road. Flag -1: a track (pts are the
 * two Hold gates; columns there are simulated). Flag n >= 1: a waygate link, leg 1 is points 0..n-1 (ending by a's
 * gate), leg 2 points n.. (from b's gate).
 */
export type RoadEntry = [a: number, b: number, pts: number[], flag?: number];
const flat = (pts: { x: number; y: number }[]) => pts.flatMap((p) => tileOf(p));
export function roadEntry(a: number, b: number): RoadEntry | undefined {
  const p = warPath(a, b);
  if (!p) return undefined;
  if (p.kind === "road") return [a, b, flat(p.legs[0].pts)];
  if (p.kind === "track") return [a, b, flat(p.legs[0].pts), -1];
  return [a, b, [...flat(p.legs[0].pts), ...flat(p.legs[1].pts)], p.legs[0].pts.length];
}
/** Reads a "warroads" entry back into the path the server walks (the client draws and moves columns with it). */
export function pathOfEntry(e: RoadEntry): WarPath {
  const [a, b, f, flag] = e, pts: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < f.length; i += 2) pts.push({ x: (f[i] + 0.5) * TILE, y: (f[i + 1] + 0.5) * TILE });
  if (flag !== undefined && flag >= 1) {
    const l1 = makeRoad(a, b, pts.slice(0, flag)), l2 = makeRoad(a, b, pts.slice(flag));
    return { a, b, legs: [l1, l2], kind: "link", len: l1.len + l2.len };
  }
  const r = makeRoad(a, b, pts);
  return { a, b, legs: [r], kind: flag === -1 ? "track" : "road", len: r.len };
}
/** Tests: forget every built war road. */
export function _resetWarRoads() { cache.clear(); legCache.clear(); }
