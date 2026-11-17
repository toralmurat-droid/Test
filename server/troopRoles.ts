/**
 * The troop roles in a fight (shared/war/troops.ts TroopRole, TROOP_ROLE; the pure rules in shared/war/troopRoles.ts):
 * the archer who shoots from range and steps back, the pike who holds its place with a longer reach. Foot soldiers never
 * come here: server/warTroops.ts fight() switches on the role and keeps the foot soldier's turn as it was.
 * An archer's shot at a hero is a real projectile (the room's trooper shot: it only hurts heroes the clan fights); at a
 * monster or another trooper it is a hit that lands after the flight time (TroopArrows), with an `sfx` "troop_shot"
 * event for the clients to draw the shot.
 */
import { dirInput, MOB_ATTACK_RANGE, TILE, type MobKind } from "../shared/constants";
import { MOB_COMBAT, mobBody } from "../shared/combat";
import { isSafeZone } from "../shared/map";
import { moveStep } from "../shared/movement";
import { SLOW_MOB } from "../shared/powers";
import { noMobsAt } from "../shared/spawns";
import { inVillage } from "../shared/wrath";
import { bowOf, flightMs, kiteStep, roleVs, shotReady } from "../shared/war/troopRoles";
import { parseTroop, TROOP_ROLE, troopName, troopStats, WAR_TROOPS } from "../shared/war/troops";
import type { Fighter, FightGround, TroopHero, TroopMob, WarTroopsHost } from "./warTroops";

/** A point (px) where a trooper may never stand or chase into: the safe squares, the stockade, monster-free ground. */
export const offLimits = (x: number, y: number) => isSafeZone(x, y) || inVillage(x, y) || noMobsAt(x, y);

/** Shots in flight at monsters and troopers: each lands (or not, if its target is gone) after its flight time. */
export class TroopArrows {
  private q: { from: string; to: string; dmg: number; at: number }[] = [];
  get size(): number { return this.q.length; }
  add(from: string, to: string, dmg: number, at: number) { this.q.push({ from, to, dmg, at }); }
  /** Lands the shots due by `now` on targets still standing (the room's mob-on-mob blow, without a swing). */
  fly(h: WarTroopsHost, now: number) {
    if (!this.q.length) return;
    const keep: typeof this.q = [];
    for (const a of this.q) {
      if (now < a.at) { keep.push(a); continue; }
      const o = h.mob(a.to);
      if (o && !o.dead && !o.hidden) h.strikeMob(a.from, a.to, a.dmg, true);
    }
    this.q = keep;
  }
  clear() { this.q = []; }
}

/** What an archer's turn needs from WarTroops. */
export interface RoleCtx { h: WarTroopsHost; arrows: TroopArrows; walk(m: TroopMob, gx: number, gy: number, dt: number, pace: number): void }

const face = (m: TroopMob, x: number, y: number) => { m.dir = Math.abs(x - m.x) > Math.abs(y - m.y) ? (x > m.x ? "right" : "left") : (y > m.y ? "down" : "up"); };

/**
 * One legal step away from (fx, fy): never into a wall or off-limits ground, never past the fight's leash, and a guard
 * no farther than TROOP_ROLE.ranged.guardTetherTiles from its post. False when it could not step (pinned).
 */
export function kiteAway(m: TroopMob, fx: number, fy: number, f: Fighter, g: FightGround, dt: number, now: number): boolean {
  const pace = troopStats(f.clan, m.level, f.officer, f.role).speed * (m.slowed ? SLOW_MOB : 1);
  const r = moveStep(m.x, m.y, dirInput(m.x - fx, m.y - fy), dt, pace);
  if ((r.x === m.x && r.y === m.y) || offLimits(r.x, r.y) || !g.leash(r.x, r.y)) return false;
  if (g.guard && g.post) {
    const p = g.post(now), lim = TROOP_ROLE.ranged.guardTetherTiles * TILE, nd = Math.hypot(r.x - p.x, r.y - p.y);
    if (nd > lim && nd > Math.hypot(m.x - p.x, m.y - p.y)) return false;
  }
  m.x = m.homeX = r.x; m.y = m.homeY = r.y; m.moving = true;
  face(m, fx, fy); // (it backs off facing its foe)
  return true;
}

/** May a pike still go for a foe at (x, y)? Only within its tether (plus its reach) of its post or column place. */
export function pikeHolds(g: FightGround, x: number, y: number, now: number): boolean {
  if (!g.post) return true;
  const p = g.post(now), P = TROOP_ROLE.pike;
  return Math.hypot(x - p.x, y - p.y) <= P.tetherTiles * TILE + MOB_ATTACK_RANGE + P.reach + WAR_TROOPS.heroBody;
}

/** After a pike's step: back where it was if the step took it past its tether and farther from its post. */
export function pikeTether(m: TroopMob, ox: number, oy: number, g: FightGround, now: number) {
  if (!g.post) return;
  const p = g.post(now), lim = TROOP_ROLE.pike.tetherTiles * TILE, nd = Math.hypot(m.x - p.x, m.y - p.y);
  if (nd > lim && nd > Math.hypot(ox - p.x, oy - p.y)) { m.x = m.homeX = ox; m.y = m.homeY = oy; m.moving = false; }
}

/**
 * An archer's turn on its (checked) target: finish a wound-up blow or an aimed shot, step back from a foe inside keepAway
 * (a pinned archer strikes in melee at its weaker blow, or shoots), shoot from range, close in when out of it. Always true.
 */
export function archerFight(c: RoleCtx, m: TroopMob, id: string, f: Fighter, g: FightGround, tp: TroopHero | undefined, tm: TroopMob | undefined, dt: number, now: number): boolean {
  const t = (tp ?? tm)!, R = TROOP_ROLE.ranged, W = WAR_TROOPS, st = troopStats(f.clan, m.level, f.officer, "archer");
  const dist = Math.hypot(t.x - m.x, t.y - m.y), reach = MOB_ATTACK_RANGE + (tm ? mobBody(tm.kind as MobKind) : W.heroBody);
  const by = troopName(f.clan, f.officer, false, false, false, "archer"), target = m.target;
  const vs = tm && tm.kind === "trooper" ? roleVs("archer", parseTroop(tm.weapon)?.role ?? "foot") : 1;
  if (m.broken) { f.aimUntil = 0; m.windUntil = 0; m.winding = false; if (!kiteAway(m, t.x, t.y, f, g, dt, now)) m.moving = false; return true; }
  // a wound-up melee blow (pinned) lands first
  if (m.windUntil) {
    m.moving = false; face(m, t.x, t.y);
    if (now >= m.windUntil) {
      m.windUntil = 0; m.winding = false; m.lastAttack = now;
      if (dist <= reach + W.swingSlack) { if (tp) c.h.strikeHero(id, target, st.dmg, by); else c.h.strikeMob(id, target, Math.round(st.dmg * vs)); }
    }
    return true;
  }
  // an aimed shot: it stands still until it leaves
  if (f.aimUntil) {
    m.moving = false; face(m, t.x, t.y);
    if (!shotReady(f, now, dist)) return true;
    m.winding = false; m.lastAttack = now;
    const bow = bowOf(f.clan), dmg = st.shot ?? st.dmg;
    if (tp) c.h.shoot(id, f.clan, t.x, t.y, dmg, by, { kind: bow.shot, speed: bow.speed, range: R.range, radius: R.radius });
    else if (dist <= R.range * 1.4) {
      const ms = flightMs(dist, bow.speed);
      c.arrows.add(id, target, Math.round(dmg * vs), now + ms);
      c.h.sfx?.({ ev: "troop_shot", id, to: target, kind: bow.shot, x: Math.round(m.x), y: Math.round(m.y), tx: Math.round(t.x), ty: Math.round(t.y), ms });
    }
    return true;
  }
  const k = kiteStep(dist, R);
  if (k < 0 && kiteAway(m, t.x, t.y, f, g, dt, now)) return true;
  if (k < 0 && dist <= reach) { // pinned with the foe at arm's length: the knife, a weaker blow
    m.moving = false; face(m, t.x, t.y);
    if (now - m.lastAttack >= st.cd) { m.windUntil = now + MOB_COMBAT.trooper.windupMs; m.winding = true; }
    return true;
  }
  if (k <= 0) {
    m.moving = false; face(m, t.x, t.y);
    shotReady(f, now, dist, R); // (starts the wind-up when the bow is ready)
    if (f.aimUntil) m.winding = true;
    return true;
  }
  c.walk(m, t.x, t.y, dt, st.speed * (m.slowed ? SLOW_MOB : 1));
  return true;
}
