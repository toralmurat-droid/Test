/**
 * Clan troops that fight (shared/war/troops.ts has the numbers and the pure rules). A land wakes when a hero comes
 * near it: its holder's patrol column and Hold guards appear as real monsters (kind "trooper", clan in Mob.weapon),
 * march the shared patrol loop, hunt the wild monsters of their land and fight heroes sworn to other clans (and heroes
 * who struck them: a grudge). Fallen troopers come back at the Hold gate; a land with no hero near goes back to sleep.
 * TownRoom calls in at a few points (a tick a second, every trooper's turn, a hero's hit on one, its death, the war
 * news, a hero leaving) through the narrow WarTroopsHost below. Troopers give no XP and no loot (TownRoom.hitTarget).
 */
import { BOSS, dirInput, ELITE, MOB_ATTACK_RANGE, MOBS, mobScale, TILE, type Dir, type MobKind } from "../shared/constants";
import { MOB_COMBAT, mobBody } from "../shared/combat";
import { underground } from "../shared/dungeon";
import { isSafeZone } from "../shared/map";
import { blocked, moveStep } from "../shared/movement";
import { noMobsAt } from "../shared/spawns";
import { inVillage } from "../shared/wrath";
import { CLAN_KEYS, CLANS, type ClanKey } from "../shared/war/clans";
import { garrisonCount, garrisonSpots, patrolCount, patrolOf, patrolPos, TROOP } from "../shared/war/patrols";
import { RENOWN_RANKS, rankOf } from "../shared/war/renown";
import { STANDARD } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { columnLead, parseTroop, TROOP_COMBAT, troopLevel, troopName, troopStance, troopWeapon, WAR_TROOPS, type TroopStance } from "../shared/war/troops";
import type { WarView } from "../shared/war/view";
import { addValor, warNow } from "./war";

/** The parts of a hero this module reads (TownRoom's Player). */
export interface TroopHero { name: string; clan?: ClanKey; level: number; x: number; y: number; dead: boolean; renown: number }
/** The parts of a monster this module reads and moves (TownRoom's Mob). */
export interface TroopMob {
  kind: string; weapon: string; level: number; x: number; y: number; homeX: number; homeY: number; dir: Dir;
  hp: number; maxHp: number; dead: boolean; hidden: boolean; owner: string; target: string; hateId: string; hate: number;
  summonFor: string; qwave: boolean; servant: boolean; title: string; tide: boolean;
  moving: boolean; stunned: boolean; slowed: boolean; broken: boolean; winding: boolean;
  windUntil: number; lastAttack: number; stunUntil: number; slowUntil: number;
}

export interface WarTroopsHost {
  /** A plain trooper monster with this id at (x, y) and this level and weapon (no zone: it never respawns by itself). */
  spawn(id: string, level: number, x: number, y: number, weapon: string): TroopMob | undefined;
  /** Gone without a death (its land sleeps, changed hands, or holds fewer men). */
  remove(id: string): void;
  mob(id: string): TroopMob | undefined;
  mobsInBox(x: number, y: number, r: number): Iterable<[string, TroopMob]>;
  heroes(): Iterable<[string, TroopHero]>;
  hero(id: string): TroopHero | undefined;
  /** The hero cannot be seen or touched right now (Void Slip). */
  hidden(id: string, now: number): boolean;
  /** A trooper's blow on a hero / on a monster (summons and other troopers included). */
  strikeHero(mobId: string, heroId: string, dmg: number, byName: string): void;
  strikeMob(mobId: string, targetId: string, dmg: number): void;
  /** A Herald line to one hero. */
  note(heroId: string, text: string): void;
  /** A hero reached a new renown rank (the room tells them, as for the standards). */
  ranked(heroId: string, rank: string): void;
}

type Role = "march" | "guard";
/** One place in a land's force: who fills it (or when its man fell). */
interface Slot { role: Role; i: number; officer: boolean; id: string; fellAt: number }
interface Land { t: number; clan?: ClanKey; lastHero: number; slots: Slot[] }
interface Troop { t: number; clan: ClanKey; slot: Slot; nextPick: number; near: boolean }

const SLEEPING = -Infinity;
/** A point (px) where a trooper may never stand or chase into: the safe squares, the stockade, monster-free ground. */
const offLimits = (x: number, y: number) => isSafeZone(x, y) || inVillage(x, y) || noMobsAt(x, y);

export class WarTroops {
  private lands = new Map<number, Land>();
  private troops = new Map<string, Troop>();
  /** Grudges by hero session id: clan -> wall ms it ends. */
  private grudges = new Map<string, Partial<Record<ClanKey, number>>>();
  /** Kill valor per hero name in the current war tick (WAR_TROOPS.killValorPerTick). */
  private valor = new Map<string, { tick: number; n: number }>();
  private seq = 0;

  constructor(private h: WarTroopsHost) {}

  /** Troopers alive now (tests, the bench). */
  get count(): number { return this.troops.size; }

  /** The stance of clan `k`'s troops toward hero `pid`. */
  stance(k: ClanKey, pid: string, now = Date.now()): TroopStance {
    const p = this.h.hero(pid);
    return p ? troopStance(k, p, this.grudges.get(pid)?.[k] ?? 0, now) : "neutral";
  }

  /** May this hero hurt that trooper? Never their own clan's, never one on the safe square. */
  canHurt(heroId: string, m: TroopMob): boolean {
    const tr = parseTroop(m.weapon), p = this.h.hero(heroId);
    if (!tr || !p) return true;
    return p.clan !== tr.clan && !isSafeZone(m.x, m.y);
  }

  /** Does trooper `m` fight hero `pid` (so the hero's creatures may go for it on their own)? */
  hostile(pid: string, m: TroopMob, now = Date.now()): boolean {
    const tr = parseTroop(m.weapon);
    return !!tr && this.stance(tr.clan, pid, now) === "enemy";
  }

  /** A hero's blow landed on a trooper: an unsworn hero earns that clan's grudge (a note the first time), and it turns on them. */
  hit(heroId: string, m: TroopMob, now = Date.now()) {
    const tr = parseTroop(m.weapon), p = this.h.hero(heroId);
    if (!tr || !p) return;
    if (!p.clan && p.level >= STANDARD.minLevel) { // (newcomers are never fought, so they earn no grudge either)
      const g = this.grudges.get(heroId) ?? {}, was = g[tr.clan] ?? 0;
      g[tr.clan] = now + WAR_TROOPS.grudgeMs;
      this.grudges.set(heroId, g);
      if (was <= now) this.h.note(heroId, WAR_TROOPS.lines.grudge(CLANS[tr.clan].name, WAR_TROOPS.grudgeMs / 1000));
    }
    if (this.stance(tr.clan, heroId, now) === "enemy") m.target = heroId;
  }

  /** A trooper died (by any hand). A hero sworn to another clan standing in its land earns valor for their clan (capped per war tick). */
  killed(m: TroopMob, id: string, killerId: string, now = Date.now()) {
    const tr = this.troops.get(id);
    if (!tr) return;
    this.troops.delete(id);
    tr.slot.id = ""; tr.slot.fellAt = now;
    const p = this.h.hero(killerId), t = TERRITORIES[tr.t], v = warNow();
    if (!p || !p.clan || p.clan === tr.clan || !t || !v) return;
    const tx = p.x / TILE, ty = p.y / TILE;
    if (tx < t.x || ty < t.y || tx >= t.x + t.w || ty >= t.y + t.h) return;
    const c = this.valor.get(p.name), used = c && c.tick === v.tick ? c.n : 0;
    const add = Math.min(WAR_TROOPS.killValor, WAR_TROOPS.killValorPerTick - used);
    if (add <= 0) return;
    this.valor.set(p.name, { tick: v.tick, n: used + add });
    const was = rankOf(p.renown);
    if (addValor(tr.t, p.clan, add)) p.renown += add; // effort the war counted earns renown, as at the standards (server/warHeroes.ts)
    const rank = rankOf(p.renown);
    if (rank > was) this.h.ranked(killerId, RENOWN_RANKS[rank].name);
  }

  /** A hero left or died: their grudges end and no trooper keeps chasing them. */
  forget(heroId: string) {
    this.grudges.delete(heroId);
    for (const id of this.troops.keys()) { const m = this.h.mob(id); if (m && m.target === heroId) m.target = ""; }
  }

  /** War news (after every war tick): owners and control may have changed, so the lands are set right at once. */
  onWar(_v: WarView) { this.tick(Date.now()); }

  /** Once a second: wake lands near heroes, put the others to sleep, fill and trim each land's force, bring back the fallen. */
  tick(now = Date.now()) {
    // troopers that vanished without a death (a test, a reset) free their slot at once
    for (const [id, tr] of this.troops) {
      const m = this.h.mob(id);
      if (!m || m.dead) { this.troops.delete(id); tr.slot.id = ""; tr.slot.fellAt = m ? now : SLEEPING; }
    }
    const v = WAR_TROOPS.live ? warNow() : undefined;
    const heroes: TroopHero[] = [];
    if (v) for (const [, p] of this.h.heroes()) if (!p.dead && !underground(p.y)) heroes.push(p);
    const near: [number, number][] = []; // [territory, tiles to the nearest hero]
    if (v) for (const t of TERRITORIES) {
      let best = Infinity;
      for (const p of heroes) {
        const tx = p.x / TILE, ty = p.y / TILE;
        const d = Math.hypot(Math.max(0, t.x - tx, tx - (t.x + t.w)), Math.max(0, t.y - ty, ty - (t.y + t.h)));
        if (d < best) best = d;
      }
      const land = this.lands.get(t.id);
      if (best <= WAR_TROOPS.wakeTiles) {
        if (!land) this.lands.set(t.id, { t: t.id, lastHero: now, slots: [] }); else land.lastHero = now;
      }
      const l = this.lands.get(t.id);
      if (l && now - l.lastHero < WAR_TROOPS.sleepMs && patrolOf(t.id)) near.push([t.id, best]);
    }
    const awake = new Set(near.map(([t]) => t));
    for (const [t, land] of this.lands) if (!awake.has(t)) { this.clearLand(land); this.lands.delete(t); }
    near.sort((a, b) => a[1] - b[1]);
    let budget = WAR_TROOPS.maxTroops;
    for (const [t] of near) {
      const land = this.lands.get(t)!, clan = CLAN_KEYS[v!.owner[t]];
      if (!clan) { this.clearLand(land); continue; }
      const flipped = !!land.clan && land.clan !== clan;
      if (flipped) this.clearLand(land);
      const fresh = !land.clan || flipped;
      land.clan = clan;
      const control = v!.control[t] ?? 100, siege = v!.sieges.some((s) => s[0] === t);
      const marchers = siege ? 0 : patrolCount(control), guards = Math.min(garrisonCount(control), garrisonSpots(t, TROOP.garrisonMax).length);
      const want = Math.min(marchers + guards, budget);
      budget -= want;
      const slots: Slot[] = [];
      for (let i = 0; i < marchers; i++) slots.push(this.slotOf(land, "march", i));
      for (let i = 0; i < guards; i++) slots.push(this.slotOf(land, "guard", i));
      // fewer men now (lower control, a siege, the room's cap): the extra ones go
      for (const s of land.slots) if (!slots.slice(0, want).includes(s) && s.id) this.drop(s);
      land.slots = slots.slice(0, want);
      for (const s of land.slots) {
        if (s.id) continue;
        if (s.fellAt !== SLEEPING && now - s.fellAt < WAR_TROOPS.respawnMs) continue;
        // a land that just woke has its men at their posts; a new holder, the fallen and new recruits come out of the Hold gate
        this.spawn(land, s, fresh && !flipped && s.fellAt === SLEEPING ? this.postOf(t, s, now) : { ...patrolOf(t)!.pts[0] }, clan);
      }
    }
  }

  /** The slot for role/index in a land, reusing the existing one (it keeps its man and its fall time). */
  private slotOf(land: Land, role: Role, i: number): Slot {
    return land.slots.find((s) => s.role === role && s.i === i) ?? { role, i, officer: i === 0, id: "", fellAt: SLEEPING };
  }

  private spawn(land: Land, s: Slot, at: { x: number; y: number }, clan: ClanKey) {
    const id = `wt${++this.seq}`, level = troopLevel(land.t, s.officer);
    const m = this.h.spawn(id, level, at.x, at.y, troopWeapon(clan, s.officer));
    if (!m) return;
    m.hp = m.maxHp = Math.max(1, Math.round(m.maxHp * TROOP_COMBAT[clan].hp));
    s.id = id; s.fellAt = SLEEPING;
    this.troops.set(id, { t: land.t, clan, slot: s, nextPick: 0, near: false });
  }

  private drop(s: Slot) {
    if (s.id) { this.troops.delete(s.id); this.h.remove(s.id); }
    s.id = ""; s.fellAt = SLEEPING;
  }

  private clearLand(land: Land) {
    for (const s of land.slots) this.drop(s);
    land.slots = []; land.clan = undefined;
  }

  /** Where a trooper of this slot belongs now: its place in the marching column, or its guard post. */
  private postOf(t: number, s: Slot, now: number): { x: number; y: number } {
    const p = patrolOf(t)!;
    if (s.role === "guard") { const g = garrisonSpots(t, TROOP.garrisonMax)[s.i]; return g ? { x: g.x, y: g.y } : { ...p.pts[0] }; }
    const lead = columnLead(p, now), q = patrolPos(p, lead.d - (s.i >> 1) * TROOP.rankGap), side = s.i & 1 ? 1 : -1;
    const ox = q.x - q.dy * side * TROOP.lateral, oy = q.y + q.dx * side * TROOP.lateral;
    return offLimits(ox, oy) || blocked(ox, oy) ? { x: q.x, y: q.y } : { x: ox, y: oy };
  }

  /** Is (x, y) within `tiles` of territory t's rect? */
  private inLand(t: number, x: number, y: number, tiles: number): boolean {
    const r = TERRITORIES[t], tx = x / TILE, ty = y / TILE;
    return !!r && tx >= r.x - tiles && ty >= r.y - tiles && tx < r.x + r.w + tiles && ty < r.y + r.h + tiles;
  }

  /** The foe a trooper fights now: an enemy hero, an enemy's creature, a trooper of another clan, or a wild monster of its land. */
  private pick(m: TroopMob, id: string, tr: Troop, now: number): string {
    const W = WAR_TROOPS, R = W.aggroPx;
    let best = "", bs = 0;
    const consider = (tid: string, x: number, y: number, bonus: number) => {
      const d = Math.hypot(x - m.x, y - m.y), hated = tid === m.hateId ? m.hate : 0;
      if (d >= (hated > 0 ? R * 2 : R) || offLimits(x, y) || !this.inLand(tr.t, x, y, W.leashTiles)) return;
      const s = Math.max(0.05, 1 - d / R) + bonus + hated + (tid === m.target ? W.stick : 0);
      if (s > bs) { bs = s; best = tid; }
    };
    for (const [pid, p] of this.h.heroes()) {
      if (p.dead || Math.abs(p.x - m.x) > R * 2 || Math.abs(p.y - m.y) > R * 2) continue;
      if (troopStance(tr.clan, p, this.grudges.get(pid)?.[tr.clan] ?? 0, now) !== "enemy" || this.h.hidden(pid, now)) continue;
      consider(pid, p.x, p.y, 0.5); // a soldier goes for the enemy hero first
    }
    const hated = m.hateId && m.hate > 0 ? this.h.mob(m.hateId) : undefined; // (the only one it sees from twice as far)
    for (const [oid, o] of hated ? [...this.h.mobsInBox(m.x, m.y, R), [m.hateId, hated] as [string, TroopMob]] : this.h.mobsInBox(m.x, m.y, R)) {
      if (oid === id || o.dead || o.hidden) continue;
      if (o.kind === "trooper") { const k = parseTroop(o.weapon)?.clan; if (k && k !== tr.clan) consider(oid, o.x, o.y, 0.3); continue; }
      if (o.owner) { if (this.stance(tr.clan, o.owner, now) === "enemy") consider(oid, o.x, o.y, 0); continue; }
      const fought = oid === m.hateId && m.hate > 0; // whatever hit it, it answers (within its leash)
      if (!fought && (o.summonFor || o.qwave || o.servant || o.title || o.tide || ELITE[o.kind as MobKind] || BOSS[o.kind as MobKind] || o.kind === "nightraider")) continue;
      if (!fought && !this.inLand(tr.t, o.x, o.y, W.mobMarginTiles)) continue;
      const helps = o.target && this.stance(tr.clan, o.target, now) === "ally" ? W.helpBonus : 0;
      consider(oid, o.x, o.y, helps);
    }
    return best;
  }

  /** A trooper's turn (TownRoom.updateMob): fight what it picked, else keep its place in the column or at its post. */
  step(m: TroopMob, id: string, dt: number, now: number) {
    const tr = this.troops.get(id);
    if (!tr) { this.h.remove(id); return; } // left over from a land that is gone (should not happen)
    m.stunned = now < m.stunUntil; m.slowed = now < m.slowUntil;
    if (m.stunned || m.broken) { m.winding = false; m.windUntil = 0; }
    if (m.stunned) { m.moving = false; return; }
    if (now >= tr.nextPick) {
      tr.nextPick = now + WAR_TROOPS.pickMs;
      tr.near = this.seen(m, WAR_TROOPS.livePx);
      m.target = tr.near ? this.pick(m, id, tr, now) : "";
    }
    if (!tr.near) { // no hero near enough to see it: it just keeps its place, no walking and no fights (cheap)
      const post = this.postOf(tr.t, tr.slot, now);
      if ((Math.abs(post.x - m.x) > 1 || Math.abs(post.y - m.y) > 1) && !offLimits(post.x, post.y)) { m.x = m.homeX = post.x; m.y = m.homeY = post.y; }
      m.moving = false; m.windUntil = 0; m.winding = false;
      return;
    }
    // the target must still be fair game (a grudge can run out, a hero can step onto the safe square)
    const tp = m.target ? this.h.hero(m.target) : undefined, tm = !tp && m.target ? this.h.mob(m.target) : undefined;
    const t = tp ?? tm;
    if (m.target && (!t || (tp && (tp.dead || this.stance(tr.clan, m.target, now) !== "enemy" || this.h.hidden(m.target, now)))
      || (tm && (tm.dead || tm.hidden)) || offLimits(t.x, t.y) || !this.inLand(tr.t, t.x, t.y, WAR_TROOPS.leashTiles))) { m.target = ""; m.windUntil = 0; m.winding = false; }
    const def = MOBS.trooper, speed = def.speed * (m.slowed ? 0.5 : 1);
    let gx: number, gy: number, pace: number;
    if (m.target && t) {
      const dist = Math.hypot(t.x - m.x, t.y - m.y), reach = MOB_ATTACK_RANGE + (tm ? mobBody(tm.kind as MobKind) : 4);
      if ((dist <= reach || m.windUntil) && !m.broken) {
        m.moving = false;
        m.dir = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? (t.x > m.x ? "right" : "left") : (t.y > m.y ? "down" : "up");
        if (m.windUntil) {
          if (now >= m.windUntil) {
            m.windUntil = 0; m.winding = false; m.lastAttack = now;
            if (dist <= reach + 6) {
              const dmg = Math.max(1, Math.round(def.damage * mobScale(m.level, "damage") * TROOP_COMBAT[tr.clan].dmg));
              if (tp) this.h.strikeHero(id, m.target, dmg, troopName(tr.clan, tr.slot.officer)); else this.h.strikeMob(id, m.target, dmg);
            }
          }
        } else if (now - m.lastAttack >= def.attackCooldownMs) { m.windUntil = now + MOB_COMBAT.trooper.windupMs; m.winding = true; }
        return;
      }
      gx = t.x; gy = t.y; pace = speed;
    } else {
      const post = this.postOf(tr.t, tr.slot, now), d = Math.hypot(post.x - m.x, post.y - m.y);
      if (d > WAR_TROOPS.warpPx && !this.seen(m, WAR_TROOPS.warpUnseenPx) && !offLimits(post.x, post.y)) { m.x = post.x; m.y = post.y; m.moving = false; return; }
      gx = post.x; gy = post.y;
      pace = d > WAR_TROOPS.slackPx ? speed : TROOP.speed * 1.15; // in step with the column, a little quicker to catch up
      if (d < 2) { m.moving = false; this.face(m, tr, now); return; }
    }
    const dx = gx - m.x, dy = gy - m.y, d = Math.hypot(dx, dy);
    const r = moveStep(m.x, m.y, dirInput(dx, dy), dt, Math.min(pace, d / Math.max(dt, 1e-3)));
    if (!offLimits(r.x, r.y)) { m.x = r.x; m.y = r.y; m.moving = r.moving; } else m.moving = false;
    m.homeX = m.x; m.homeY = m.y;
    m.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  }

  /** At its place: a guard looks out from the Hold, a marcher along the route. */
  private face(m: TroopMob, tr: Troop, now: number) {
    let fx: number, fy: number;
    if (tr.slot.role === "guard") { const g = garrisonSpots(tr.t, TROOP.garrisonMax)[tr.slot.i]; fx = g?.fx ?? 0; fy = g?.fy ?? 1; }
    else { const p = patrolOf(tr.t)!, q = patrolPos(p, columnLead(p, now).d); fx = q.dx; fy = q.dy; }
    m.dir = Math.abs(fx) > Math.abs(fy) ? (fx > 0 ? "right" : "left") : (fy > 0 ? "down" : "up");
  }

  /** Is a living hero within r (px, square) of the trooper? */
  private seen(m: TroopMob, r: number): boolean {
    for (const [, p] of this.h.heroes()) if (!p.dead && Math.abs(p.x - m.x) < r && Math.abs(p.y - m.y) < r) return true;
    return false;
  }

  /** Tests: the land state, read-only. */
  _land(t: number) { return this.lands.get(t); }
}
