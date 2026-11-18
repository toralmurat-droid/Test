/**
 * The troop roles' small AI rules (shared/war/troops.ts TroopRole, TROOP_ROLE), pure, so the server's soldiers
 * (server/troopRoles.ts) and the PvE sim (tools/balance/pve.ts --roles, --garrison) move and shoot the same way.
 */
import { TILE } from "../constants";
import { isSolidAt, isSolidTile } from "../map";
import { blocked } from "../movement";
import type { ClanKey } from "./clans";
import { fortOf, holdWallPx, type FortKind } from "./holdWalls";
import type { HoldTier } from "./holdTiers";
import { battleLine } from "./battles";
import { RITUAL } from "./rituals";
import { gatePosts, gatePx, keepOut, onTownGround, type Town } from "./towns";
import { CLAN_ROLES, fieldRole, planRole, ROLE_FORM, ROLE_PLAN, roleOf, TROOP_ROLE, type TroopRole } from "./troops";

type Ranged = Omit<typeof TROOP_ROLE.ranged, "wall">;

/** The bow an archer draws: a courtyard archer on its wall (`perch`) shoots and sees farther (TROOP_ROLE.ranged.wall). */
export function bowRange(perch = false): Ranged {
  const R = TROOP_ROLE.ranged;
  return perch ? { ...R, range: R.wall.range, sightPx: R.wall.sightPx } : R;
}

/** A soldier's give-up state (part of the server's Fighter): the target out of reach since when, the one given up on and until when. */
export interface GiveUp { outOf: string; outSince: number; shun: string; shunUntil: number }
/**
 * The give-up rule (TROOP_ROLE.giveUp) for a courtyard archer or a guard pike (mutates `f`): its target `target` is
 * `out` of its reach now; once it has been out for giveUp.ms straight it is dropped (true) and shunned for shunMs
 * (`f.shun`, `f.shunUntil`: WarTroops.pick skips it). A new target, or one back in reach, starts the clock over.
 */
export function giveUpStep(f: GiveUp, target: string, out: boolean, now: number, G = TROOP_ROLE.giveUp): boolean {
  if (!out || f.outOf !== target) { f.outOf = out ? target : ""; f.outSince = now; return false; }
  if (now - f.outSince < G.ms) return false;
  f.shun = target; f.shunUntil = now + G.shunMs; f.outOf = ""; f.outSince = 0;
  return true;
}
/** A soldier called onto a foe (a tethered pike's call for help, or its own sally: server/troopRoles.ts pikeCall). */
export interface Call { call: string; callUntil: number; nextCall: number }
/** Is `id` the foe this soldier was called onto (or a pike sallies at), still within TROOP_ROLE.pike.call.ms? */
export const called = (f: Pick<Call, "call" | "callUntil">, id: string, now: number): boolean => !!id && f.call === id && now < f.callUntil;
/** Is `id` shunned now (a target given up as out of reach: giveUpStep)? */
export const shunned = (f: Pick<GiveUp, "shun" | "shunUntil">, id: string, now: number): boolean => !!id && f.shun === id && now < f.shunUntil;

/**
 * The role of place i of clan `k`'s side in a field battle (ROLE_PLAN.battle; where it stands: shared/war/battles.ts
 * battleLine): captains are foot; the front line's `wings` places at each end ride, its others cycle through `front`
 * from the left end; the rear line's cycle through `rear`. A role the clan lacks is foot (fieldRole).
 */
export function battleRole(k: ClanKey, i: number): TroopRole {
  const { line, k: at, per, captain } = battleLine(i), P = ROLE_PLAN.battle;
  if (captain) return "foot";
  const n = Math.round(at + (per - 1) / 2); // 0 .. per-1 from the left end
  if (line === 0 && (n < P.wings || n >= per - P.wings)) return fieldRole(k, "rider");
  const plan = line === 0 ? P.front : P.rear;
  return fieldRole(k, plan[n % plan.length]);
}

/**
 * A soldier's place in a line shifted by its role (ROLE_FORM): an archer `archerBack` px along `back` (the unit vector
 * away from the foe), a rider `riderWide` px along `out` (the unit vector toward its end of the line; 0 in the middle).
 * The caller keeps the plain place when the shifted one is blocked.
 */
export function rolePlace(role: TroopRole, x: number, y: number, back: [number, number], out: [number, number]): { x: number; y: number } {
  const b = role === "archer" ? ROLE_FORM.archerBack : 0, w = role === "rider" ? ROLE_FORM.riderWide : 0;
  return { x: x + back[0] * b + out[0] * w, y: y + back[1] * b + out[1] * w };
}

/**
 * Acolyte place i of a clan `k` ritual circle at (cx, cy) and its role (ROLE_PLAN.ritual): on the circle at RITUAL.postPx,
 * an archer ROLE_FORM.archerBack nearer the centre (inside the ring of the others). `free` (server: not off limits, not
 * blocked) checks the spot: a blocked shifted spot falls back to the plain one, a blocked plain one to the centre.
 */
export function ritualPlace(k: ClanKey, i: number, cx: number, cy: number, free: (x: number, y: number) => boolean = (x, y) => !blocked(x, y)): { x: number; y: number; role: TroopRole } {
  const role = planRole(k, "ritual", i), a = -Math.PI / 2 + (i * 2 * Math.PI) / RITUAL.acolytes, c = Math.cos(a), s = Math.sin(a);
  const x = cx + c * RITUAL.postPx, y = cy + s * RITUAL.postPx;
  if (!free(x, y)) return { x: cx, y: cy, role };
  const q = rolePlace(role, x, y, [-c, -s], [0, 0]);
  return free(q.x, q.y) ? { ...q, role } : { x, y, role };
}

/**
 * Where each gate guard place of clan `k` stands at town t's gate muster (index = place: ROLE_PLAN.gate; same count as
 * towns.ts gatePosts): the captain (place 0) on the gate; the ring's spots handed out from the one farthest from the town
 * to the nearest, pikes first, then foot, then archers, so the pikes face the road and the archers stand behind them,
 * shifted ROLE_FORM.archerBack further toward the town. `free` checks a shifted spot (default: not town ground, not
 * blocked); a blocked one keeps the plain ring spot. A clan with neither keeps gatePosts' order.
 */
export function gateGuardPosts(t: Town, k: ClanKey, free: (x: number, y: number) => boolean = (x, y) => !onTownGround(x, y) && !blocked(x, y)): { x: number; y: number }[] {
  const plain = gatePosts(t), g = gatePx(t), r = keepOut(t), roles = plain.map((_, i) => (i === 0 ? "foot" : planRole(k, "gate", i)));
  if (!r || roles.every((x) => x === "foot")) return plain;
  const tx = ((r.x0 + r.x1) / 2) * TILE - g.x, ty = ((r.y0 + r.y1) / 2) * TILE - g.y, tl = Math.hypot(tx, ty) || 1, back: [number, number] = [tx / tl, ty / tl];
  const inward = (p: { x: number; y: number }) => (p.x - g.x) * back[0] + (p.y - g.y) * back[1];
  const spots = plain.slice(1).sort((a, b) => inward(a) - inward(b)), rank: Record<TroopRole, number> = { pike: 0, rider: 1, foot: 2, archer: 3 };
  const order = roles.map((_, i) => i).slice(1).sort((a, b) => rank[roles[a]] - rank[roles[b]] || a - b);
  const out = plain.slice();
  order.forEach((i, n) => {
    const p = spots[n], q = rolePlace(roles[i], p.x, p.y, back, [0, 0]);
    out[i] = roles[i] === "foot" || !free(q.x, q.y) ? p : q;
  });
  return out;
}

/** An archer's move against a foe `dist` px away: -1 step back (inside keepAway), 1 close in (out of range), 0 stand and shoot. */
export function kiteStep(dist: number, R: Ranged = TROOP_ROLE.ranged): -1 | 0 | 1 {
  return dist < R.keepAway ? -1 : dist > R.range ? 1 : 0;
}

/** An archer's bow state (part of the server's Fighter and of the sim's archer). */
export interface Bow { nextShot: number; aimUntil: number }

/**
 * The archer's bow at `now` with its foe `dist` px away (mutates `b`): ready and in range, it starts its wind-up
 * (aimUntil); true at the moment the shot leaves, which puts the next one everyMs away. A wind-up is not cut short by range.
 */
export function shotReady(b: Bow, now: number, dist: number, R: Ranged = TROOP_ROLE.ranged): boolean {
  if (b.aimUntil) {
    if (now < b.aimUntil) return false;
    b.aimUntil = 0; b.nextShot = now + R.everyMs;
    return true;
  }
  if (now >= b.nextShot && dist <= R.range) b.aimUntil = now + R.windupMs;
  return false;
}

/** The counter multiplier on a blow (or shot) of a `att` soldier on a `def` soldier: troop against troop only (TROOP_ROLE.vs). */
export const roleVs = (att: TroopRole, def: TroopRole): number => TROOP_ROLE.vs[att]?.[def] ?? 1;

/** What clan `k`'s archers shoot: the client's projectile kind and its speed (px/s); a plain arrow for a clan without archers. */
export function bowOf(k: ClanKey): { shot: string; speed: number } {
  const a = CLAN_ROLES[k]?.archer;
  return { shot: a?.shot ?? "arrow", speed: a?.shotSpeed ?? 200 };
}

/** Flight time (ms) of a shot over `dist` px at `speed` px/s: an archer's hit on a monster or a trooper lands after it. */
export const flightMs = (dist: number, speed: number): number => Math.round((Math.max(0, dist) / Math.max(1, speed)) * 1000);

type ChargeNums = typeof TROOP_ROLE.rider.charge;
/** A rider's charge (part of the server's Fighter and of the sim's rider): `phase` 0 ready / fighting on foot, 1 winding up, 2 galloping, 3 wheeling away; `until` ends the phase; `next` the cooldown; `wheeled` one wheel per cooldown. */
export interface Charge { phase: 0 | 1 | 2 | 3; until: number; next: number; wheeled: boolean; /** The lane (unit vector), fixed when the wind-up starts. */ dx: number; dy: number }
export const newCharge = (): Charge => ({ phase: 0, until: 0, next: 0, wheeled: false, dx: 0, dy: 0 });

/**
 * What a rider does at `now` with its foe `dist` px away (mutates `c`; TROOP_ROLE.rider.charge): "fight" (no charge going:
 * close in and strike on foot), "wheel" (ride away from the foe for a run-up), "wind" (stand winding up: the caller fixed
 * the lane when it began, `start` true on its first turn), "gallop" (ride the lane: the caller checks the hit, a braced
 * pike and the ground, and ends it with chargeEnd). A wind-up ends in the gallop; a gallop that runs out ends the charge.
 */
export function chargeStep(c: Charge, now: number, dist: number, C: ChargeNums = TROOP_ROLE.rider.charge): { act: "fight" | "wheel" | "wind" | "gallop"; start?: boolean } {
  if (c.phase === 1) {
    if (now < c.until) return { act: "wind" };
    c.phase = 2; c.until = now + C.gallopMs;
  }
  if (c.phase === 2) {
    if (now < c.until) return { act: "gallop" };
    chargeEnd(c, now, false);
  }
  if (c.phase === 3) {
    if (now < c.until && dist < C.min) return { act: "wheel" };
    c.phase = 0;
    if (dist < C.min && now >= c.next) c.next = now + C.everyMs / 2; // no room for a run-up: on foot for a while
  }
  if (now >= c.next) {
    if (dist >= C.min && dist <= C.max) { c.phase = 1; c.until = now + C.windupMs; c.wheeled = false; return { act: "wind", start: true }; }
    if (dist < C.min && !c.wheeled) { c.phase = 3; c.until = now + C.wheelMs; c.wheeled = true; return { act: "wheel" }; }
  }
  return { act: "fight" };
}

/** The gallop is over (`hit`: it struck, or a pike stopped it): the charge cools for everyMs; after a blow the rider rides on (wheels away) a while. */
export function chargeEnd(c: Charge, now: number, hit: boolean, C: ChargeNums = TROOP_ROLE.rider.charge) {
  c.next = now + C.everyMs; c.wheeled = false;
  if (hit) { c.phase = 3; c.until = now + C.wheelMs; } else { c.phase = 0; c.until = 0; }
}

/** A charge broken off before it struck or missed (the rider stunned or broken, its foe gone): ready again breakMs later. */
export function chargeBreak(c: Charge, now: number, C: ChargeNums = TROOP_ROLE.rider.charge) {
  if (c.phase !== 1 && c.phase !== 2) return;
  c.phase = 0; c.until = 0; c.wheeled = false; c.next = now + C.breakMs;
}

/** Is a charge under way (wound up or galloping): what a rival pike braces against. */
export const charging = (c: Charge | undefined): boolean => !!c && (c.phase === 1 || c.phase === 2);

/**
 * May an archer's shot fly from (x0, y0) to (x1, y1) at a monster or a trooper? Not through rock, water, trees or a live
 * Hold wall (sampled every 6 px along the line): a wild monster behind a wall can't be shot for free. A courtyard
 * archer stands on its wall, so the wall cells it starts on (the solid run from the start) don't count.
 */
export function shotClear(x0: number, y0: number, x1: number, y1: number): boolean {
  const solid = (x: number, y: number) => isSolidAt(x, y) || holdWallPx(x, y);
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6);
  let out = !solid(x0, y0);
  for (let i = 1; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n, s = solid(x, y);
    if (!s) out = true; else if (out) return false;
  }
  return true;
}

/** Which wall cells a courtyard archer may stand on, best first: towers, then the main wall (no tents, fences or mounds). */
const PERCH: Partial<Record<FortKind, number>> = { tower: 0, wall: 1 };
const perches = new Map<string, { x: number; y: number }[]>();
/**
 * The wall posts of territory t's Hold as clan `k` builds it at `tier` (px, tile middles): towers first, then wall cells,
 * each on the fort's outer edge (a neighbour tile that is open ground outside the fort) so it looks out and can be
 * reached from outside; the first nearest the front (east) gate, the next farthest from those before it. Pure, cached.
 */
export function wallPosts(t: number, k: ClanKey, tier: HoldTier): { x: number; y: number }[] {
  const key = `${t}|${k}|${tier}`;
  let out = perches.get(key);
  if (!out) {
    out = [];
    const f = fortOf(t, k, tier);
    if (f) {
      const at = new Set(f.cells.map((c) => `${c.dx},${c.dy}`));
      const outside = (dx: number, dy: number) => !at.has(`${dx},${dy}`) && !isSolidTile(f.cx + dx, f.cy + dy);
      const cand = f.cells.filter((c) => PERCH[c.kind] !== undefined && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => outside(c.dx + ax, c.dy + ay)));
      const best = Math.min(...cand.map((c) => PERCH[c.kind]!));
      const pool = cand.filter((c) => PERCH[c.kind] === best).map((c) => ({ dx: c.dx, dy: c.dy }));
      const px = (c: { dx: number; dy: number }) => ({ x: (f.cx + c.dx + 0.5) * TILE, y: (f.cy + c.dy + 0.5) * TILE });
      const picked: { dx: number; dy: number }[] = [];
      while (pool.length && picked.length < 4) {
        let bi = 0, bs = -Infinity;
        pool.forEach((c, i) => {
          const s = picked.length ? Math.min(...picked.map((p) => Math.hypot(p.dx - c.dx, p.dy - c.dy))) : -Math.hypot(c.dx - f.reach, c.dy);
          if (s > bs) { bs = s; bi = i; }
        });
        picked.push(pool.splice(bi, 1)[0]);
      }
      out = picked.map(px);
    }
    perches.set(key, out);
  }
  return out;
}

/** Where guard place `i` of clan `k`'s Hold at territory t stands when it is a courtyard archer on the wall (ROLE_PLAN.wall), else undefined. */
export function wallPost(t: number, k: ClanKey, tier: HoldTier, i: number): { x: number; y: number } | undefined {
  const w = ROLE_PLAN.wall[tier]?.indexOf(i) ?? -1;
  if (w < 0 || roleOf(k, "guard", tier, i) !== "archer") return undefined;
  return wallPosts(t, k, tier)[w];
}
