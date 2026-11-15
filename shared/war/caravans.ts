/**
 * Caravans (roadmap M2): supply carts that roll from Hold to Hold along a clan's supply tree, out toward its borders.
 * Raided by a rival-sworn hero they give his clan valor and drop gold; delivered with a sworn hero of their own clan
 * beside them they give valor in the land they reach. The schedule runs on the wall clock: every room and every client
 * agrees where each cart is (an unseen cart travels virtually), and the server only spawns one as real monsters (a
 * cart "trooper" plus escorts, server/warCaravans.ts) when a hero comes near. Routes come from the map alone (a
 * weighted tile search that prefers roads), built on first ask and cached like the patrols. Pure rules and numbers.
 */
import { MAP_H, MAP_W, TILE } from "../constants";
import { DOORS, GROUND, isSafeZone, isSolidAt, isSolidTile, T } from "../map";
import { noMobsAt } from "../spawns";
import { inVillage } from "../wrath";
import type { ClanKey } from "./clans";
import { mix, patrolOf } from "./patrols";
import { TERRITORIES, type Territory } from "./territories";
import { troopLevel, troopStats } from "./troops";

export const CARAVAN = {
  /** Master switch: off, no cart ever spawns (the schedule still answers for the client). */
  live: true,
  /** One departure per route per this long (each route is phased by its own hash). */
  everyMs: 7 * 60_000,
  /** Cart speed (px/s): a slow ox cart, a little under the marching column (shared/war/patrols.ts TROOP.speed 30). */
  speed: 26,
  /** A cart is spawned when a living hero above ground is this close to where it is on the road (tiles)... */
  wakeTiles: 26,
  /** ...and goes back to travelling virtually after this long with no hero that close. */
  sleepMs: 30_000,
  /** Carts alive in one room at most; each costs 1 + escorts of WAR_TROOPS.maxTroops (caravans claim first). */
  maxLive: 4,
  /** Soldiers marching with each cart (clan soldiers of the destination land's level). */
  escorts: 3,
  /** The cart's hit points: its clan's soldier HP at its level times this. It has no attack. */
  hpMult: 5,
  /** Escorts fight anything within this of the cart (px), and start on wild monsters only within huntPx of it. */
  leashPx: 6 * TILE, huntPx: 3 * TILE,
  /** Formation (px): one escort ahead of the cart, two behind it, one on each side. */
  ahead: 34, behind: 26, lateral: 16,
  /** After the cart is raided its escorts fight on this long round the wreck, then march off. */
  scatterMs: 8000,
  /** A sworn hero of the cart's clan this close to it (px) escorts it; one who escorts it for escortShare of the trip delivers it. */
  escortPx: 6 * TILE, escortShare: 0.5,
  /** Sworn heroes of the raider's clan this close to the cart when it falls (px) share the raid's renown. */
  helperPx: 8 * TILE,
  /** Valor for the raiders' clan in the land where the cart fell (if the war lets them push there), renown per raider. */
  raidValor: 8, raidRenown: 10,
  /** Valor for the cart's clan in the land it reaches, renown per hero who delivered it. */
  deliverValor: 8, escortRenown: 10,
  /** Gold the cart spills when raided: base + perLevel x its level (the existing gold drop). */
  gold: { base: 20, perLevel: 5 },
  /** Route search: tiles of slack around the two lands' bounding box, and the cost of a step on a road and off it. */
  marginTiles: 3, roadCost: 1, wildCost: 3,
};

/** One cart line: from Hold a to Hold b, both held by `clan`, neighbours in the same act. */
export interface CaravanLine { a: number; b: number; clan: ClanKey }
export interface CaravanRoute {
  a: number; b: number;
  /** Waypoints (px), pts[0] outside a's Hold gate, the last outside b's. */
  pts: { x: number; y: number }[];
  /** Distance along the route at each waypoint (px); cum[last] = len. */
  cum: number[];
  len: number;
}

/**
 * The supply lines that run for every clan now: the edges of its supply tree (the BFS of rules.ts supplyMap from its
 * held capitals through its own land) that lead toward a border land, in the direction supplies flow (outwards).
 * Takes the owner array only, so the client can call it with the WarView's owners.
 */
export function caravanLines(owner: readonly (ClanKey | undefined)[]): CaravanLine[] {
  const n = TERRITORIES.length, parent = Array<number>(n).fill(-2);
  let frontier = TERRITORIES.filter((t) => t.capitalOf && owner[t.id] === t.capitalOf).map((t) => t.id);
  for (const id of frontier) parent[id] = -1;
  while (frontier.length) {
    const next: number[] = [];
    for (const id of frontier) for (const m of TERRITORIES[id].near)
      if (parent[m] === -2 && owner[m] && owner[m] === owner[id]) { parent[m] = id; next.push(m); }
    frontier = next;
  }
  const edges = new Set<string>(), out: CaravanLine[] = [];
  for (const t of TERRITORIES) {
    const k = owner[t.id];
    if (!k || parent[t.id] === -2 || !t.near.some((m) => owner[m] !== k)) continue; // a border land with a road home
    for (let c = t.id; parent[c] >= 0; c = parent[c]) {
      const p = parent[c], key = `${p}-${c}`;
      if (edges.has(key)) break; // the rest of the way home is marked already
      edges.add(key);
      if (TERRITORIES[p].act === TERRITORIES[c].act) out.push({ a: p, b: c, clan: k }); // the waygate link carries no cart
    }
  }
  return out.sort((x, y) => x.a - y.a || x.b - y.b);
}

/** A point (px) no cart nor escort may enter: the safe squares, the stockade, monster-free ground. */
export const caravanOffLimits = (x: number, y: number) => isSafeZone(x, y) || inVillage(x, y) || noMobsAt(x, y);

let doorTiles: Set<number> | undefined;
/** Every tile of a dungeon gate's wall, open or shut (a route must not depend on a door someone opened). */
const isDoor = (tx: number, ty: number) => {
  if (!doorTiles) { doorTiles = new Set(); for (const d of DOORS) for (const k of d.tiles) doorTiles.add(k); }
  return doorTiles.has(ty * MAP_W + tx);
};

interface Box { x0: number; y0: number; w: number; h: number; walk: Uint8Array; open: Uint8Array; cost: Uint8Array }
/** The search area with walkability (centre free, never off limits or a door) and line-of-sight (no solid at all) read once. */
function box(x0: number, y0: number, x1: number, y1: number): Box {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(MAP_W - 1, x1); y1 = Math.min(MAP_H - 1, y1);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, walk = new Uint8Array(w * h), open = new Uint8Array(w * h), cost = new Uint8Array(w * h);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const i = (ty - y0) * w + tx - x0, cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    const banned = isDoor(tx, ty) || caravanOffLimits(cx, cy) || caravanOffLimits(tx * TILE, ty * TILE) || caravanOffLimits((tx + 1) * TILE - 0.01, (ty + 1) * TILE - 0.01)
      || caravanOffLimits((tx + 1) * TILE - 0.01, ty * TILE) || caravanOffLimits(tx * TILE, (ty + 1) * TILE - 0.01);
    walk[i] = !banned && !isSolidAt(cx, cy) ? 1 : 0;
    open[i] = !banned && !isSolidTile(tx, ty) ? 1 : 0;
    const g = GROUND[ty][tx];
    cost[i] = g === T.DIRT || g === T.COBBLE || g === T.BRIDGE ? CARAVAN.roadCost : CARAVAN.wildCost;
  }
  return { x0, y0, w, h, walk, open, cost };
}
const inBox = (b: Box, tx: number, ty: number) => tx >= b.x0 && ty >= b.y0 && tx < b.x0 + b.w && ty < b.y0 + b.h;
const walkable = (b: Box, tx: number, ty: number) => inBox(b, tx, ty) && b.walk[(ty - b.y0) * b.w + tx - b.x0] === 1;

const STEPS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Cheapest 8-connected tile path a -> b (roads cheap, no cutting a blocked corner), or undefined. Ties break by index: deterministic. */
function search(b: Box, ax: number, ay: number, bx: number, by: number): [number, number][] | undefined {
  if (!walkable(b, ax, ay) || !walkable(b, bx, by)) return undefined;
  const N = b.w * b.h, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const idx = (x: number, y: number) => (y - b.y0) * b.w + (x - b.x0);
  const start = idx(ax, ay), goal = idx(bx, by);
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
  if (prev[goal] === -1) return undefined;
  const out: [number, number][] = [];
  for (let c = goal; ; c = prev[c]) { out.push([(c % b.w) + b.x0, Math.floor(c / b.w) + b.y0]); if (c === start) break; }
  return out.reverse();
}

/** True when the straight segment (px) touches no solid, door or off-limits tile (1 px samples, a half-pixel spread). */
function clear(b: Box, ax: number, ay: number, bx: number, by: number): boolean {
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

function build(a: number, b: number): CaravanRoute | undefined {
  const A = TERRITORIES[a], B = TERRITORIES[b], pa = patrolOf(a), pb = patrolOf(b);
  if (!A || !B || A.act !== B.act || !pa || !pb) return undefined;
  const tile = (p: { x: number; y: number }): [number, number] => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)];
  // from Hold gate to Hold gate (the patrol loops' first stop), over both lands' box; a wider box if water or walls cut it
  for (const M of [CARAVAN.marginTiles, CARAVAN.marginTiles * 5]) {
    const bx = box(Math.min(A.x, B.x) - M, Math.min(A.y, B.y) - M, Math.max(A.x + A.w, B.x + B.w) - 1 + M, Math.max(A.y + A.h, B.y + B.h) - 1 + M);
    const path = search(bx, ...tile(pa.pts[0]), ...tile(pb.pts[0]));
    if (path && path.length >= 2) return route(a, b, simplify(bx, path));
  }
  return undefined;
}
function route(a: number, b: number, pts: { x: number; y: number }[]): CaravanRoute {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { a, b, pts, cum, len: cum[cum.length - 1] };
}

const cache = new Map<string, CaravanRoute | undefined>();
/** The cart road from a's Hold gate to b's (built on first ask, then cached; b -> a is the same road reversed), or undefined. */
export function caravanRoute(a: number, b: number): CaravanRoute | undefined {
  const key = `${a}-${b}`;
  if (cache.has(key)) return cache.get(key);
  const lo = Math.min(a, b), hi = Math.max(a, b), lk = `${lo}-${hi}`;
  if (!cache.has(lk)) cache.set(lk, build(lo, hi));
  const r = cache.get(lk);
  if (a !== lo) {
    const rev = r && { a, b, pts: [...r.pts].reverse(), cum: r.cum.map((c) => r.len - c).reverse(), len: r.len };
    cache.set(key, rev);
    return rev;
  }
  return r;
}

/** Point and unit direction at distance `d` along the route (clamped to its ends). */
export function routePos(r: CaravanRoute, d: number): { x: number; y: number; dx: number; dy: number } {
  const n = r.pts.length, dd = Math.max(0, Math.min(r.len, d));
  let i = 0;
  while (i < n - 2 && r.cum[i + 1] < dd) i++;
  const a = r.pts[i], b = r.pts[Math.min(n - 1, i + 1)], l = r.cum[Math.min(n - 1, i + 1)] - r.cum[i];
  if (!(l > 0)) return { x: a.x, y: a.y, dx: 1, dy: 0 };
  const f = Math.max(0, Math.min(1, (dd - r.cum[i]) / l));
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dx: (b.x - a.x) / l, dy: (b.y - a.y) / l };
}

/** A route's trip time (ms) at CARAVAN.speed. */
export const caravanTripMs = (r: CaravanRoute) => (r.len / CARAVAN.speed) * 1000;
/** Each route's phase in the departure clock (ms), from its ends alone: the same in every room and client. */
export const caravanPhase = (a: number, b: number) => mix(a, b, 0xca7a) % CARAVAN.everyMs;
/** The id of the cart that left a for b in departure slot `slot`. */
export const caravanId = (a: number, b: number, slot: number) => `${a}-${b}-${slot}`;

/**
 * The carts on route r at wall time `now`: departure slot = floor((now + phase) / everyMs), each at `d` px along the
 * road ((now - departure) x speed). A trip longer than everyMs would put two on the road; none today is.
 */
export function caravansOnRoad(r: CaravanRoute, now: number): { slot: number; dep: number; d: number; id: string }[] {
  const E = CARAVAN.everyMs, off = caravanPhase(r.a, r.b), trip = caravanTripMs(r), out: { slot: number; dep: number; d: number; id: string }[] = [];
  for (let s = Math.floor((now + off) / E); ; s--) {
    const dep = s * E - off, el = now - dep;
    if (el > trip) break;
    if (el >= 0) out.push({ slot: s, dep, d: (el * CARAVAN.speed) / 1000, id: caravanId(r.a, r.b, s) });
  }
  return out;
}

/** The land a cart of `line` is in at (x, y) px: the territory there, else (on the road between) the nearer of its two ends. */
export function caravanLand(line: Pick<CaravanLine, "a" | "b">, x: number, y: number): Territory {
  const tx = x / TILE, ty = y / TILE, at = TERRITORIES.find((t) => tx >= t.x && tx < t.x + t.w && ty >= t.y && ty < t.y + t.h);
  if (at) return at;
  const gap = (t: Territory) => Math.hypot(Math.max(0, t.x - tx, tx - (t.x + t.w)), Math.max(0, t.y - ty, ty - (t.y + t.h)));
  const A = TERRITORIES[line.a], B = TERRITORIES[line.b];
  return gap(B) < gap(A) ? B : A;
}

/** A cart's level: the soldiers' level of the land it is bound for. */
export const caravanLevel = (b: number) => troopLevel(b);
/** A cart's hit points: its clan's soldier at that level times CARAVAN.hpMult. */
export const caravanHp = (k: ClanKey, level: number) => Math.round(troopStats(k, level).hp * CARAVAN.hpMult);
/** Gold a raided cart spills. */
export const caravanGold = (level: number) => Math.round(CARAVAN.gold.base + CARAVAN.gold.perLevel * level);
