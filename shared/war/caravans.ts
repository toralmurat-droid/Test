/**
 * Caravans (roadmap M2): supply carts that roll from Hold to Hold along a clan's supply tree, out toward its borders.
 * Raided by a rival-sworn hero they give his clan valor and drop gold; delivered with a sworn hero of their own clan
 * beside them they give valor in the land they reach. The schedule runs on the wall clock: every room and every client
 * agrees where each cart is (an unseen cart travels virtually), and the server only spawns one as real monsters (a
 * cart "trooper" plus escorts, server/warCaravans.ts) when a hero comes near. Routes come from the map alone (a
 * weighted tile search that prefers roads), built on first ask and cached like the patrols. Pure rules and numbers.
 */
import { TILE } from "../constants";
import type { ClanKey } from "./clans";
import { mix } from "./patrols";
import { buildRoad, ROAD_SEARCH, roadOffLimits, routePos, type Road } from "./roads";
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
  hpMult: 4,
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
  /** Route search (roads.ts ROAD_SEARCH, shared with the war roads): tiles of slack around the two lands' bounding box, and the cost of a step on a road and off it. */
  marginTiles: ROAD_SEARCH.marginTiles, roadCost: ROAD_SEARCH.roadCost, wildCost: ROAD_SEARCH.wildCost,
};

/** One cart line: from Hold a to Hold b, both held by `clan`, neighbours in the same land (region). */
export interface CaravanLine { a: number; b: number; clan: ClanKey }
/** A cart road (roads.ts Road): waypoints (px), pts[0] outside a's Hold gate, the last outside b's. */
export type CaravanRoute = Road;

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
      if (TERRITORIES[p].region === TERRITORIES[c].region) out.push({ a: p, b: c, clan: k }); // the waygate link carries no cart
    }
  }
  return out.sort((x, y) => x.a - y.a || x.b - y.b);
}

/** A point (px) no cart nor escort may enter: the safe squares, the stockade, monster-free ground (roads.ts). */
export const caravanOffLimits = roadOffLimits;

const cache = new Map<string, CaravanRoute | undefined>();
/** Whether a's and b's road is already built (or known to be missing), so callers can warm roads a few at a time. */
export const roadKnown = (a: number, b: number) => cache.has(`${Math.min(a, b)}-${Math.max(a, b)}`);
/** The cart road from a's Hold gate to b's (built on first ask, then cached; b -> a is the same road reversed), or undefined. */
export function caravanRoute(a: number, b: number): CaravanRoute | undefined {
  const key = `${a}-${b}`;
  if (cache.has(key)) return cache.get(key);
  const lo = Math.min(a, b), hi = Math.max(a, b), lk = `${lo}-${hi}`;
  if (!cache.has(lk)) cache.set(lk, buildRoad(lo, hi));
  const r = cache.get(lk);
  if (a !== lo) {
    const rev = r && { a, b, pts: [...r.pts].reverse(), cum: r.cum.map((c) => r.len - c).reverse(), len: r.len };
    cache.set(key, rev);
    return rev;
  }
  return r;
}

/** Point and unit direction at distance `d` along the route (clamped to its ends; roads.ts). */
export { routePos };

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
