/**
 * Siege battles (roadmap M2): while a siege is announced at a land and a hero is near, the room fields both sides as
 * real troopers (server/warSieges.ts) at the land's fronts: each standard and the Hold gate. Attackers march in from an
 * approach on the side facing the attacker's nearest land; defenders hold, scaled by Control like the patrols. A front
 * changes holder only after one side has out-numbered the other for a while (troopers plus sworn heroes, heroes weigh
 * more), and a held front earns its holder valor once a minute, but only with a sworn hero of that clan there: troops
 * alone never move the war. Pure rules and numbers, the same for the server, the tests and the sims.
 */
import { TILE } from "../constants";
import { isSafeZone, isSolidAt } from "../map";
import { noMobsAt } from "../spawns";
import { inVillage } from "../wrath";
import { patrolOf, patrolPos, troopShare, type Patrol } from "./patrols";
import { TERRITORIES } from "./territories";

export const SIEGE_BATTLE = {
  /** Master switch: off, sieges stay virtual (the client's painted battle lines come back). */
  live: true,
  /** Attackers per front at full strength. */
  perFront: 4,
  /** Defenders per front: perFront x troopShare(control), never fewer than this. */
  defMin: 2,
  /** Empty places at the fronts fill again in a wave this often (ms). */
  reinforceMs: 30_000,
  /** Siege troopers alive in one room at most (both sides, all fronts; inside WAR_TROOPS.maxTroops). */
  maxSiegeTroops: 28,
  /** A siege goes live when a living hero above ground is this close to the land's rect (tiles); one per room, the nearest. */
  wakeTiles: 24,
  /** ...and back to virtual (troopers gone, fronts kept) after this long with no hero that close (ms). */
  sleepMs: 30_000,
  /** Fronts are counted this often (ms): living troopers + heroWeight x active sworn heroes within frontRadiusPx. */
  scoreMs: 2000,
  heroWeight: 2,
  frontRadiusPx: 96,
  /** Hysteresis: a front changes holder only after one side led by at least holdMargin for captureMs straight. */
  holdMargin: 2,
  captureMs: 20_000,
  /** Valor for each front's holder per valorEveryMs, only if a sworn hero of that clan was active in its ring meanwhile; the gate counts gateMult. */
  valorEveryMs: 60_000,
  frontValor: 2,
  gateMult: 2,
  /** Front valor per clan per land per room per war tick at most. */
  battleValorPerTick: 20,
  /** A siege trooper fights only within this of its place (px), and ignores wild monsters unless one hits it. */
  leashPx: 6 * TILE,
  /** Formation at a front (px): the two sides stand this far either side of it, neighbours this far apart. */
  depthPx: 26, spacingPx: 18,
  /** The attackers' approach keeps this far from the Hold gate when the land allows (tiles). */
  gateKeepTiles: 8,
};

export type Side = "atk" | "def";
export interface Front { x: number; y: number; gate: boolean; /** Distance along the land's patrol loop (px). */ arc: number }

/** Distance along the loop at each waypoint (px). */
function arcs(p: Patrol): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < p.pts.length; i++) { out.push(acc); const a = p.pts[i], b = p.pts[(i + 1) % p.pts.length]; acc += Math.hypot(b.x - a.x, b.y - a.y); }
  return out;
}

/** A land's fronts: each standard on its patrol loop (in loop order), then the Hold gate (the loop's start). Deterministic. */
export function siegeFronts(t: number): Front[] {
  const p = patrolOf(t);
  if (!p) return [];
  const at = arcs(p), out: Front[] = p.stops.slice(1).map((i) => ({ x: p.pts[i].x, y: p.pts[i].y, gate: false, arc: at[i] }));
  out.push({ x: p.pts[0].x, y: p.pts[0].y, gate: true, arc: 0 });
  return out;
}

/**
 * The unit vector (tile space) from land `t` toward the nearest land held by `atk` (`owner` may hold clan keys or
 * clan indexes, `atk` the same), or undefined when it holds none. The client's painted siege lines use it too.
 */
export function attackAxis(owner: readonly unknown[], t: number, atk: unknown): { x: number; y: number } | undefined {
  const me = TERRITORIES[t];
  if (!me) return undefined;
  let best: { x: number; y: number } | undefined, bd = Infinity;
  for (const u of TERRITORIES) {
    if (u.id === t || owner[u.id] !== atk) continue;
    const d = Math.hypot(u.cx - me.cx, u.cy - me.cy);
    if (d < bd) { bd = d; best = { x: u.cx - me.cx, y: u.cy - me.cy }; }
  }
  return best && bd > 0 ? { x: best.x / bd, y: best.y / bd } : undefined;
}

const offLimits = (x: number, y: number) => isSafeZone(x, y) || inVillage(x, y) || noMobsAt(x, y);

/**
 * Where the attackers come in: the point of the land's patrol loop (sampled every tile) inside its rect that lies
 * farthest toward `axis`, walkable and joined to every front by the loop, with its distance along the loop. Points
 * within `gateKeepTiles` of the Hold gate are taken only when there is nothing else (no spawning among the guards).
 */
export function siegeApproach(t: number, axis: { x: number; y: number }): { x: number; y: number; arc: number } | undefined {
  const p = patrolOf(t), r = TERRITORIES[t];
  if (!p || !r) return undefined;
  const cx = (r.x + r.w / 2) * TILE, cy = (r.y + r.h / 2) * TILE, g = p.pts[0];
  let best: { x: number; y: number; arc: number } | undefined, bs = -Infinity, near: typeof best, ns = -Infinity;
  for (let d = 0; d < p.len; d += TILE) {
    const q = patrolPos(p, d), tx = q.x / TILE, ty = q.y / TILE;
    if (tx < r.x || ty < r.y || tx >= r.x + r.w || ty >= r.y + r.h || isSolidAt(q.x, q.y) || offLimits(q.x, q.y)) continue;
    const s = (q.x - cx) * axis.x + (q.y - cy) * axis.y, far = Math.hypot(q.x - g.x, q.y - g.y) >= SIEGE_BATTLE.gateKeepTiles * TILE;
    if (far && s > bs) { bs = s; best = { x: q.x, y: q.y, arc: d }; }
    if (!far && s > ns) { ns = s; near = { x: q.x, y: q.y, arc: d }; }
  }
  return best ?? near;
}

/**
 * Troopers per front for each side: attackers perFront, defenders by Control (troopShare, at least defMin), then
 * trimmed (the bigger side first) until all fronts fit `budget` (the room's share, at most maxSiegeTroops).
 */
export function siegeForce(fronts: number, control: number, budget: number): { atk: number; def: number } {
  const S = SIEGE_BATTLE, cap = Math.max(0, Math.min(S.maxSiegeTroops, Math.floor(budget)));
  let atk = S.perFront, def = Math.max(S.defMin, Math.round(S.perFront * troopShare(control)));
  const n = Math.max(1, fronts);
  while (n * (atk + def) > cap && atk + def > 0) { if (atk >= def) atk--; else def--; }
  return { atk, def };
}

/** One front's hold: who holds it, who leads now (by holdMargin or more) and since when. */
export interface FrontHold { holder: Side; lead?: Side; since: number }

/**
 * A front's count at `now` (troopers + heroWeight x heroes per side): returns true when the holder changes. A side
 * that leads by holdMargin must keep that lead for captureMs straight; any break starts the clock over.
 */
export function frontStep(f: FrontHold, atk: number, def: number, now: number): boolean {
  const S = SIEGE_BATTLE, lead: Side | undefined = atk - def >= S.holdMargin ? "atk" : def - atk >= S.holdMargin ? "def" : undefined;
  if (!lead || lead === f.holder) { f.lead = undefined; return false; }
  if (f.lead !== lead) { f.lead = lead; f.since = now; return false; }
  if (now - f.since < S.captureMs) return false;
  f.holder = lead; f.lead = undefined; f.since = now;
  return true;
}

/** Valor a front pays its holder for a minute: none without one of its sworn heroes there, else frontValor (gate x gateMult) up to the cap left. */
export function frontPay(gate: boolean, heroThere: boolean, used: number): number {
  const S = SIEGE_BATTLE;
  if (!heroThere) return 0;
  return Math.max(0, Math.min(S.frontValor * (gate ? S.gateMult : 1), S.battleValorPerTick - used));
}

/** What the server sends ("siege"): the live siege's land and fronts with their holders; t -1 and no fronts when none. */
export interface SiegeView { t: number; fronts: { x: number; y: number; gate: boolean; holder: string }[] }
