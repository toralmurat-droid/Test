/**
 * Marching columns (W4): when a clan attacks, a column (an officer and soldiers in its colours) leaves the Hold it
 * attacks from and walks the war road (roads.ts) to the target's Hold, camping by the target's siege approach until the
 * war tick. The leaders' orders come one tick ahead (server/war.ts), so every attack of the next tick marches first.
 * What reaches the target decides how hard the attack lands: fallen soldiers scale the army's attack there
 * (rules.ts TickExtra.march, floored at COLUMN.floor). Every column runs on the wall clock (position = f(now - departure
 * - halts)), the same in every room and on every client; the server spawns one as real troopers only near heroes
 * (server/warMarches.ts). Two columns of clans at war on one road in opposite directions meet (a deterministic point
 * and time) and fight. Pure rules and numbers: the server, the client and the war sim read the same.
 */
import { TILE } from "../constants";
import { CLAN_KEYS, type ClanKey } from "./clans";
import type { WarPlan } from "./intel";
import { TROOP } from "./patrols";
import { cleanOrders, supplyMap, targetsOf, WAR, type Orders, type WarState } from "./rules";
import { routePos, type Road, type WarPath } from "./roads";
import { siegeApproach } from "./siege";
import { TERRITORIES } from "./territories";
import type { TunnelStrike } from "./tunnels";

export const COLUMN = {
  /** Master switch: off, no column is ever spawned as real troopers (the clock, the joins and the war's march mults still run). */
  live: true,
  /** Soldiers = clamp(round(attack force / perSoldier), min, max), plus the officer (tools/balance/war.ts prints the histogram). */
  perSoldier: 30, min: 2, max: 7,
  /** A column leaves this long after the war tick that ordered it (the muster at the Hold gate). */
  musterMs: 60_000,
  /** Marching speed (px/s): the patrols' pace; faster only when the trip would not fit before the next tick. */
  speed: TROOP.speed,
  /** Time kept free before the next tick when fitting the trip: the worst halts (haltMaxMs + clashMs + gateMs) and this slack. */
  slackMs: 30_000,
  /** While a soldier fights an enemy hero the column stands, at most this long a trip. */
  haltMaxMs: 90_000,
  /** Two columns that meet stand and fight this long, then march on. */
  clashMs: 60_000,
  /** A waygate crossing: the column vanishes into the gate for this long and comes out of the far one. */
  gateMs: 5000,
  /** Unseen meetings: each side loses round(n x min(clashCap, clashLoss x F_other / (F_a + F_b))) soldiers. */
  clashLoss: 0.6, clashCap: 0.5,
  /** Players cut an attack to this share of itself at most (what is left of the column, alive / size). */
  floor: 0.5,
  /** A column is spawned when a living hero above ground is this close to its anchor (tiles)... */
  wakeTiles: 26,
  /** ...at most this many per room (nearest first)... */
  maxLive: 2,
  /** ...and goes back to travelling virtually after this long with no hero that close. */
  sleepMs: 30_000,
  /** Soldiers fight anything within this of the anchor (px); they start on no wild monster (only one that strikes first). */
  leashPx: 7 * TILE,
  /** Formation (px): two abreast behind the officer, this far apart along the road and to each side. */
  rankGap: TROOP.rankGap, lateral: TROOP.lateral,
  /** A hero sworn to the column's clan this close to the anchor (px) marches with it; for joinShare of the moving time, they joined. */
  escortPx: 6 * TILE, joinShare: 0.5,
  /** On arrival each hero who joined brings this much valor for the clan in the target land, and earns this renown (once a war tick). */
  joinValor: 8, joinRenown: 10,
  /** Other clans' columns show on a hero's world map within this many tiles (the client; own columns always show). */
  scoutTiles: 40,
  /** The war save keeps column losses at most this often between ticks (and at every tick). */
  saveMs: 60_000,
};

/**
 * Every clan's plan from its orders, on the state the orders were given for: each legal attack once, fed from the
 * adjacent own land with the best supply (as warTick feeds it; first in near order on a tie), or, for a Hide-Kin strike
 * with no own land next to it, from the tunnel's start (`tunnel` 1). `tick`: the WarView.tick the plan goes out with.
 */
export function plansOf(s: WarState, orders: Partial<Record<ClanKey, Orders>> | undefined, strikes: readonly TunnelStrike[], tick: number): Partial<Record<ClanKey, WarPlan>> {
  const out: Partial<Record<ClanKey, WarPlan>> = {};
  if (!orders) return out;
  let supply: number[] | undefined;
  for (const k of CLAN_KEYS) {
    if (!orders[k]) continue;
    const o = cleanOrders(orders[k]), legal = new Set(targetsOf(s, k)), march: WarPlan["march"] = [];
    for (const a of o.attack) {
      if (march.length >= PLAN_MAX || !legal.has(a.t) || !(a.share > 0) || march.some((m) => m[1] === a.t)) continue;
      supply ??= supplyMap(s);
      let from = -1;
      for (const n of TERRITORIES[a.t].near) if (s.owner[n] === k && (from < 0 || supply[n] > supply[from])) from = n;
      if (from >= 0) { march.push([from, a.t, 0]); continue; }
      const st = strikes.find((x) => x.clan === k && x.t === a.t);
      if (st) march.push([st.from, a.t, 1]);
    }
    out[k] = { tick, march };
  }
  return out;
}
/** Most attacks one plan lists (cleanOrders keeps 8 anyway). */
const PLAN_MAX = 8;

/** One marching column: clan `clan` from its land `from` on land `to`, ordered at the war tick `tick` (wall time `at`). */
export interface March {
  id: string; clan: ClanKey; from: number; to: number;
  /** The WarView.tick it was ordered in (it lands at the tick after), and that tick's wall time (ms). */
  tick: number; at: number;
  /** Departure (ms): at + COLUMN.musterMs. */
  dep: number;
  /** The attack force it carries (rules.ts deployments), and its men: the officer and the soldiers (columnSize). */
  force: number; size: number;
}

/** Men in a column carrying `force`: 1 officer + clamp(round(force / perSoldier), min, max) soldiers (more force never fewer men). */
export function columnSize(force: number): number {
  const C = COLUMN, f = Number.isFinite(force) && force > 0 ? force : 0;
  return 1 + Math.max(C.min, Math.min(C.max, Math.round(f / C.perSoldier)));
}
export const columnId = (tick: number, k: ClanKey, from: number, to: number) => `${tick}-${k}-${from}-${to}`;

/**
 * The columns of these plans: one per march that walks (tunnel strikes march none: their mouths already show), sized
 * by the attack each carries (`attack`: rules.ts deployments on the state the orders were given for). `tick` and `at`:
 * the war tick that ordered them (WarView.tick) and its wall time. Clans in CLAN_KEYS order, marches in plan order.
 */
export function marchesOf(plans: Partial<Record<ClanKey, WarPlan>>, attack: readonly Partial<Record<ClanKey, number>>[], tick: number, at: number): March[] {
  const out: March[] = [];
  for (const k of CLAN_KEYS) for (const [from, to, tunnel] of plans[k]?.march ?? []) {
    if (tunnel) continue;
    const force = attack[to]?.[k] ?? 0;
    out.push({ id: columnId(tick, k, from, to), clan: k, from, to, tick, at, dep: at + COLUMN.musterMs, force, size: columnSize(force) });
  }
  return out;
}

/** What is left of a column, as the share of its attack that lands: alive / size, never under COLUMN.floor. */
export function marchMult(alive: number, size: number): number {
  if (!(size > 0)) return 1;
  return Math.max(COLUMN.floor, Math.min(1, Math.max(0, alive) / size));
}

/** Men each side loses in an unseen meeting: round(n x min(clashCap, clashLoss x F_other / (F_a + F_b))). Never more than half. */
export function clashLosses(na: number, nb: number, fa: number, fb: number): [number, number] {
  const sum = Math.max(0, fa) + Math.max(0, fb), C = COLUMN;
  if (!(sum > 0)) return [0, 0];
  const share = (f: number) => Math.min(C.clashCap, C.clashLoss * Math.max(0, f) / sum);
  return [Math.round(Math.max(0, na) * share(fb)), Math.round(Math.max(0, nb) * share(fa))];
}

/** A column's trip on its path: how far it walks (to its camp by the target's siege approach) and how fast. */
export interface Trip { walk: number; speed: number; moveMs: number }
const trips = new WeakMap<WarPath, Trip>();
/**
 * The distance along the path's last leg where it passes nearest the target's siege approach (the point of the target's
 * patrol loop farthest toward the land the column comes from): the column camps there, short of the Hold's guards.
 */
function campOn(p: WarPath): number {
  const leg = p.legs[p.legs.length - 1], A = TERRITORIES[p.a], B = TERRITORIES[p.b];
  const ax = A.cx - B.cx, ay = A.cy - B.cy, n = Math.hypot(ax, ay) || 1;
  const q = siegeApproach(p.b, { x: ax / n, y: ay / n });
  if (!q || p.kind === "track") return leg.len;
  let best = leg.len, bd = Infinity;
  for (let d = 0; d <= leg.len; d += TILE / 2) { const r = routePos(leg, d), e = Math.hypot(r.x - q.x, r.y - q.y); if (e < bd - 1e-9) { bd = e; best = d; } }
  return best;
}
/** The trip of a path (cached per path object): walked to the camp, at COLUMN.speed or faster when it would not fit before the next tick. */
export function columnTrip(p: WarPath): Trip {
  let t = trips.get(p);
  if (!t) {
    const C = COLUMN, gate = p.kind === "link" ? C.gateMs : 0;
    const walk = (p.legs.length > 1 ? p.legs[0].len : 0) + campOn(p);
    const budget = WAR.tickMs - C.musterMs - C.haltMaxMs - C.clashMs - C.gateMs - C.slackMs;
    const speed = Math.max(C.speed, walk / (budget / 1000));
    t = { walk, speed, moveMs: (walk / speed) * 1000 + gate };
    trips.set(p, t);
  }
  return t;
}

/** Where a column is: 0 muster (at the gate), 1 march, 2 halted by heroes (server only), 3 clash, 4 in a waygate, 5 camp. */
export type ColumnState = 0 | 1 | 2 | 3 | 4 | 5;
export const COLUMN_STATE = { muster: 0, march: 1, halt: 2, clash: 3, gate: 4, camp: 5 } as const;
export interface ColumnPos { x: number; y: number; dx: number; dy: number; leg: number; d: number; state: ColumnState; walked: number }

/** Distance walked along the whole path (both legs) after `e` ms of moving time (gate steps count as standing at its end). */
function walkedAt(p: WarPath, t: Trip, e: number): { walked: number; gate: boolean } {
  const v = t.speed / 1000;
  if (p.kind !== "link") return { walked: Math.min(t.walk, Math.max(0, e) * v), gate: false };
  const L1 = p.legs[0].len, e1 = L1 / v;
  if (e < e1) return { walked: Math.max(0, e) * v, gate: false };
  if (e < e1 + COLUMN.gateMs) return { walked: L1, gate: true };
  return { walked: Math.min(t.walk, L1 + (e - e1 - COLUMN.gateMs) * v), gate: false };
}
/** The point `walked` px along the path (leg 1, then leg 2 of a link). */
export function pathPos(p: WarPath, walked: number): { x: number; y: number; dx: number; dy: number; leg: number; d: number } {
  const L1 = p.legs[0].len, leg = p.legs.length > 1 && walked > L1 ? 1 : 0, d = leg ? walked - L1 : walked;
  return { ...routePos(p.legs[leg] as Road, d), leg, d };
}

/**
 * Where a column departing at `dep` stands at wall time `now` after `haltMs` of halts (by heroes), on its path: the clock
 * only (deterministic). `meetAt`: the wall time of its meeting (meetingOf), where it stands COLUMN.clashMs. Same on the
 * server, in every room and on the client.
 */
export function columnPos(p: WarPath, dep: number, now: number, haltMs = 0, meetAt?: number): ColumnPos {
  const t = columnTrip(p);
  if (now < dep) { const q = pathPos(p, 0); return { ...q, state: 0, walked: 0 }; }
  let e = Math.max(0, now - dep - Math.max(0, haltMs)), state: ColumnState = 1;
  if (meetAt !== undefined) {
    const me = meetAt - dep;
    if (e >= me) { if (e - me < COLUMN.clashMs) state = 3; e = Math.max(me, e - COLUMN.clashMs); }
  }
  const w = walkedAt(p, t, e), q = pathPos(p, w.walked);
  if (w.gate) state = 4;
  else if (state !== 3 && w.walked >= t.walk) state = 5;
  return { ...q, state, walked: w.walked };
}
/** Wall time a column arrives at its camp (with its halts and its meeting's stand). */
export const arriveAt = (p: WarPath, dep: number, haltMs = 0, met = false) => dep + Math.max(0, haltMs) + columnTrip(p).moveMs + (met ? COLUMN.clashMs : 0);

/** Two columns that meet on a road: ids (a < b), the place (px) and the wall time. W5 grows these into battles. */
export interface Meeting { a: string; b: string; x: number; y: number; at: number }
/**
 * Where and when columns `ma` (on path `pa`) and `mb` (on `pb`) meet: only on one road walked in opposite directions
 * (a.from = b.to and a.to = b.from), by both clocks without halts (one that camped already is met at its camp). The
 * same whichever is given first. Undefined when they never cross: both camp short of each other (the caller checks the
 * clans are at war).
 */
export function meetingOf(ma: March, pa: WarPath, mb: March, pb: WarPath): Meeting | undefined {
  if (ma.id === mb.id || ma.from !== mb.to || ma.to !== mb.from || pa.kind !== pb.kind) return undefined;
  const [A, PA, B, PB] = ma.id < mb.id ? [ma, pa, mb, pb] : [mb, pb, ma, pa];
  const ta = columnTrip(PA), tb = columnTrip(PB), R = PA.len;
  const end = Math.max(A.dep + ta.moveMs, B.dep + tb.moveMs);
  for (let now = Math.max(A.dep, B.dep); now <= end; now += 250) {
    const wa = walkedAt(PA, ta, now - A.dep).walked, wb = walkedAt(PB, tb, now - B.dep).walked;
    if (wa + wb < R) continue; // (one camped already is met where it camps)
    const q = pathPos(PA, Math.max(0, Math.min(R, (wa + R - wb) / 2)));
    return { a: A.id, b: B.id, x: Math.round(q.x), y: Math.round(q.y), at: now };
  }
  return undefined;
}

/**
 * The "columns" message (server -> client, to each hero: their clan's columns and others within COLUMN.scoutTiles; on
 * the war tick, on change, when that set changes and on join), with the server's `now`, the columns of the interval as
 * [id, clan (CLAN_KEYS index), from, to, dep (ms), size (men, officer included), fallen, haltMs, state (ColumnState)],
 * and the meetings as [a, b, x, y (px), at (ms)]. The client walks each column with columnPos on the path of its pair
 * from "warroads" (roads.ts pathOfEntry), the meeting's `at` as meetAt; while state is 2 (halted) it stands.
 */
export type ColumnRow = [id: string, clan: number, from: number, to: number, dep: number, size: number, fallen: number, haltMs: number, state: ColumnState];
export type MeetRow = [a: string, b: string, x: number, y: number, at: number];
export interface ColumnsMsg { tick: number; /** Server wall time (ms) when sent: the client's clock offset. */ now?: number; cols: ColumnRow[]; meets?: MeetRow[] }
