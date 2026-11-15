/**
 * Clan troops that fight (shared/war/troops.ts has the numbers and the pure rules). A land wakes when a hero comes
 * near it: its holder's patrol column and Hold guards appear as real monsters (kind "trooper", clan in Mob.weapon),
 * march the shared patrol loop, hunt the wild monsters of their land (never one a hero they don't fight is busy with)
 * and fight the heroes their clan fights (troopStance: sworn to a clan at war, provoked, Wanted: shared/war/feuds.ts); only
 * those heroes can hurt them. A Wanted hero is seen from farther and chased past the leash. Fallen troopers come back at the Hold gate; a
 * land with no hero near goes back to sleep.
 * TownRoom calls in at a few points (a tick a second, every trooper's turn, a hero's hit on one, its death, the war
 * news, a hero leaving) through the narrow WarTroopsHost below. Troopers give no XP and no loot (TownRoom.hitTarget).
 */
import { BOSS, dirInput, ELITE, MOB_ATTACK_RANGE, TILE, type Dir, type MobKind } from "../shared/constants";
import { MOB_COMBAT, mobBody } from "../shared/combat";
import { SLOW_MOB } from "../shared/powers";
import { underground } from "../shared/dungeon";
import { isSafeZone } from "../shared/map";
import { blocked, moveStep } from "../shared/movement";
import { noMobsAt } from "../shared/spawns";
import { inVillage } from "../shared/wrath";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { fortDetour } from "../shared/war/holdRoutes";
import { garrisonCount, garrisonSpots, patrolCount, patrolOf, patrolPos, TROOP } from "../shared/war/patrols";
import { RENOWN_RANKS, rankOf } from "../shared/war/renown";
import { TERRITORIES } from "../shared/war/territories";
import { columnLead, parseTroop, troopLevel, troopStats, troopName, troopStance, troopWeapon, WAR_TROOPS, type TroopStance } from "../shared/war/troops";
import type { WarView } from "../shared/war/view";
import { rallyRenown } from "../shared/war/rules";
import { FEUD, wantedTier, type FeudState } from "../shared/war/feuds";
import { addValor, warNow, warState } from "./war";

/** The parts of a hero this module reads (TownRoom's Player). */
export interface TroopHero { name: string; clan?: ClanKey; level: number; x: number; y: number; dead: boolean; renown: number; feud?: FeudState }
/** The parts of a monster this module reads and moves (TownRoom's Mob). */
export interface TroopMob {
  kind: string; weapon: string; level: number; x: number; y: number; homeX: number; homeY: number; dir: Dir;
  hp: number; maxHp: number; dead: boolean; hidden: boolean; owner: string; target: string; hateId: string; hate: number; foe: string;
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
  /** A javelin from the trooper toward (tx, ty): it only hurts heroes clan `clan` fights. */
  shoot(mobId: string, clan: ClanKey, tx: number, ty: number, dmg: number, byName: string): void;
  /** A hero reached a new renown rank (the room tells them, as for the standards). */
  ranked(heroId: string, rank: string): void;
  /** Troopers the caravans hold out of WAR_TROOPS.maxTroops right now (server/warCaravans.ts). */
  reserved?(): number;
}

type Role = "march" | "guard";
/** One place in a land's force: who fills it (or when its man fell). */
interface Slot { role: Role; i: number; officer: boolean; id: string; fellAt: number }
interface Land { t: number; clan?: ClanKey; lastHero: number; slots: Slot[] }
/** A soldier's fighting state: a patrol trooper's, or a caravan escort's (server/warCaravans.ts). */
export interface Fighter { clan: ClanKey; officer: boolean; nextPick: number; near: boolean; nextRush: number; rushUntil: number; rushHit: boolean; nextThrow: number; throwing: boolean }
/**
 * Where a soldier fights: `leash` holds every foe and chase, `hunt` the wild monsters it goes for unprovoked, `far` (when
 * given) the wider leash for a hero its clan wants (shared/war/feuds.ts FEUD.leashTiles).
 */
export interface FightGround { leash(x: number, y: number): boolean; hunt(x: number, y: number): boolean; far?(x: number, y: number): boolean }
export const newFighter = (clan: ClanKey, officer: boolean): Fighter => ({ clan, officer, nextPick: 0, near: false, nextRush: 0, rushUntil: 0, rushHit: false, nextThrow: 0, throwing: false });
interface Troop extends Fighter { t: number; slot: Slot; g: FightGround }

const SLEEPING = -Infinity;
/** A point (px) where a trooper may never stand or chase into: the safe squares, the stockade, monster-free ground. */
const offLimits = (x: number, y: number) => isSafeZone(x, y) || inVillage(x, y) || noMobsAt(x, y);

export class WarTroops {
  private lands = new Map<number, Land>();
  private troops = new Map<string, Troop>();
  /** Kill valor per hero name in the current war tick (WAR_TROOPS.killValorPerTick). */
  private valor = new Map<string, { tick: number; n: number }>();
  private seq = 0;

  constructor(private h: WarTroopsHost) {}

  /** Troopers alive now (tests, the bench). */
  get count(): number { return this.troops.size; }

  /** The stance of clan `k`'s troops toward hero `pid` (troopStance: the hero's oath, level and feuds, and the clans at war). */
  stance(k: ClanKey, pid: string): TroopStance {
    const p = this.h.hero(pid);
    return p ? troopStance(k, p) : "neutral";
  }

  /**
   * May this hero hurt that trooper? Only a hero the troops fight (sworn to another clan, of oath level), never on the
   * safe square: allies and neutrals can't touch them, so nobody starts a fight by a stray Blizzard (the client's
   * attack cursor reads the same stance).
   */
  canHurt(heroId: string, m: TroopMob): boolean {
    const tr = parseTroop(m.weapon);
    if (!tr) return true;
    return this.stance(tr.clan, heroId) === "enemy" && !isSafeZone(m.x, m.y);
  }

  /** A hero's blow landed on a trooper (only an enemy's can, canHurt): it turns on them. */
  hit(heroId: string, m: TroopMob) {
    const tr = parseTroop(m.weapon);
    if (tr && this.stance(tr.clan, heroId) === "enemy") m.target = heroId;
  }

  /**
   * A trooper died (by any hand). A hero sworn to another clan standing in its land earns valor for their clan (capped
   * per war tick). Returns the land and the trooper's clan when the killer was such a hero (war writs count it, cap or not).
   */
  killed(m: TroopMob, id: string, killerId: string, now = Date.now()): { t: number; clan: ClanKey } | undefined {
    const tr = this.troops.get(id);
    if (!tr) return undefined;
    this.troops.delete(id);
    tr.slot.id = ""; tr.slot.fellAt = now;
    const p = this.h.hero(killerId), t = TERRITORIES[tr.t], v = warNow();
    if (!p || !p.clan || p.clan === tr.clan || !t || !v) return undefined;
    const tx = p.x / TILE, ty = p.y / TILE;
    if (tx < t.x || ty < t.y || tx >= t.x + t.w || ty >= t.y + t.h) return undefined;
    const out = { t: tr.t, clan: tr.clan };
    for (const [k, c] of this.valor) if (c.tick !== v.tick) this.valor.delete(k); // counts of past war ticks are done with
    const c = this.valor.get(p.name), used = c && c.tick === v.tick ? c.n : 0;
    const add = Math.min(WAR_TROOPS.killValor, WAR_TROOPS.killValorPerTick - used);
    if (add <= 0) return out;
    this.valor.set(p.name, { tick: v.tick, n: used + add });
    const was = rankOf(p.renown);
    if (addValor(tr.t, p.clan, add)) p.renown += add * rallyRenown(warState(), p.clan); // effort the war counted earns renown, as at the standards (server/warHeroes.ts)
    const rank = rankOf(p.renown);
    if (rank > was) this.h.ranked(killerId, RENOWN_RANKS[rank].name);
    return out;
  }

  /** A hero left or died: no trooper keeps chasing them. */
  forget(heroId: string) {
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
    let budget = Math.max(0, WAR_TROOPS.maxTroops - (this.h.reserved?.() ?? 0)); // caravans (server/warCaravans.ts) claim their share first
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
    m.hp = m.maxHp = troopStats(clan, level, s.officer).hp;
    s.id = id; s.fellAt = SLEEPING;
    const t = land.t, W = WAR_TROOPS;
    const g: FightGround = { leash: (x, y) => this.inLand(t, x, y, W.leashTiles), hunt: (x, y) => this.inLand(t, x, y, W.mobMarginTiles), far: (x, y) => this.inLand(t, x, y, W.leashTiles + FEUD.leashTiles) };
    this.troops.set(id, { ...newFighter(clan, s.officer), t, slot: s, g });
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

  /**
   * Is wild monster `o` busy with someone clan `k` doesn't fight (a hero, or a hero's creature)? The troops keep out of
   * that fight: no stealing a neutral's kill (or its quest credit), no taking sides for an ally.
   */
  private busyElsewhere(o: TroopMob, k: ClanKey): boolean {
    for (const id of [o.target, o.hateId, o.foe]) {
      if (!id) continue;
      const owner = this.h.hero(id) ? id : this.h.mob(id)?.owner;
      if (owner && this.stance(k, owner) !== "enemy") return true;
    }
    return false;
  }

  /**
   * The foe a trooper fights now: an enemy hero, an enemy's creature, a trooper of another clan, a wild monster of its
   * land that no hero they leave alone is fighting, or whatever hit it.
   */
  private pick(m: TroopMob, id: string, tr: Fighter, g: FightGround, now: number): string {
    const W = WAR_TROOPS, R = W.aggroPx;
    let best = "", bs = 0;
    const consider = (tid: string, x: number, y: number, bonus: number, wanted = false) => {
      const d = Math.hypot(x - m.x, y - m.y), hated = tid === m.hateId ? m.hate : 0;
      if (d >= (hated > 0 ? R * 2 : R) * (wanted ? FEUD.sight : 1) || offLimits(x, y) || !(wanted && g.far ? g.far(x, y) : g.leash(x, y))) return;
      const s = Math.max(0.05, 1 - d / R) + bonus + hated + (tid === m.target ? W.stick : 0);
      if (s > bs) { bs = s; best = tid; }
    };
    for (const [pid, p] of this.h.heroes()) {
      const wanted = wantedTier(p.feud, tr.clan, now) > 0, far = R * 2 * (wanted ? FEUD.sight : 1); // a Wanted hero is seen from farther
      if (p.dead || Math.abs(p.x - m.x) > far || Math.abs(p.y - m.y) > far) continue;
      if (troopStance(tr.clan, p, now) !== "enemy" || this.h.hidden(pid, now)) continue;
      consider(pid, p.x, p.y, W.heroBonus, wanted); // a soldier goes for the enemy hero first
    }
    const hated = m.hateId && m.hate > 0 ? this.h.mob(m.hateId) : undefined; // (the only one it sees from twice as far)
    for (const [oid, o] of hated ? [...this.h.mobsInBox(m.x, m.y, R), [m.hateId, hated] as [string, TroopMob]] : this.h.mobsInBox(m.x, m.y, R)) {
      if (oid === id || o.dead || o.hidden) continue;
      if (o.kind === "trooper") { const k = parseTroop(o.weapon); if (k && k.clan !== tr.clan && !k.object) consider(oid, o.x, o.y, W.troopBonus); continue; } // (carts and rams are for heroes to wreck)
      if (o.owner) { if (this.stance(tr.clan, o.owner) === "enemy") consider(oid, o.x, o.y, 0); continue; }
      const fought = oid === m.hateId && m.hate > 0; // whatever hit it, it answers (within its leash)
      if (!fought && (o.summonFor || o.qwave || o.servant || o.title || o.tide || ELITE[o.kind as MobKind] || BOSS[o.kind as MobKind] || o.kind === "nightraider")) continue;
      if (!fought && (!g.hunt(o.x, o.y) || this.busyElsewhere(o, tr.clan))) continue;
      consider(oid, o.x, o.y, 0);
    }
    return best;
  }

  /** A trooper's turn (TownRoom.updateMob): fight what it picked, else keep its place in the column or at its post. */
  step(m: TroopMob, id: string, dt: number, now: number) {
    const tr = this.troops.get(id);
    if (!tr) { this.h.remove(id); return; } // left over from a land that is gone (should not happen)
    if (this.think(m, id, tr, tr.g, now)) return;
    if (!tr.near) { // no hero near enough to see it: it just keeps its place, no walking and no fights (cheap)
      const post = this.postOf(tr.t, tr.slot, now);
      if ((Math.abs(post.x - m.x) > 1 || Math.abs(post.y - m.y) > 1) && !offLimits(post.x, post.y)) { m.x = m.homeX = post.x; m.y = m.homeY = post.y; }
      m.moving = false; m.windUntil = 0; m.winding = false;
      return;
    }
    if (this.fight(m, id, tr, tr.g, dt, now)) return;
    const post = this.postOf(tr.t, tr.slot, now), d = Math.hypot(post.x - m.x, post.y - m.y);
    if (d > WAR_TROOPS.warpPx && !this.seen(m, WAR_TROOPS.warpUnseenPx) && !offLimits(post.x, post.y)) { m.x = post.x; m.y = post.y; m.moving = false; return; }
    if (d < 2) { m.moving = false; this.face(m, tr, now); return; }
    // in step with the column, a little quicker to catch up
    this.walk(m, post.x, post.y, dt, d > WAR_TROOPS.slackPx ? this.speedOf(m, tr) : TROOP.speed * WAR_TROOPS.catchUp);
  }

  /** A soldier's walking speed now (slowed or not). */
  speedOf(m: TroopMob, f: Fighter): number { return troopStats(f.clan, m.level, f.officer).speed * (m.slowed ? SLOW_MOB : 1); }

  /**
   * The start of a soldier's turn (patrols and caravan escorts alike): stun and break end its wind-ups, and every
   * pickMs it looks whether a hero is near (`f.near`) and picks a foe on `g`. True when the turn is over (stunned).
   */
  think(m: TroopMob, id: string, f: Fighter, g: FightGround, now: number): boolean {
    m.stunned = now < m.stunUntil; m.slowed = now < m.slowUntil;
    if (m.stunned || m.broken) { m.winding = false; m.windUntil = 0; f.throwing = false; f.rushHit = false; }
    if (m.stunned) { m.moving = false; return true; }
    if (now >= f.nextPick) {
      f.nextPick = now + WAR_TROOPS.pickMs;
      f.near = this.seen(m, WAR_TROOPS.livePx);
      m.target = f.near ? this.pick(m, id, f, g, now) : "";
    }
    return false;
  }

  /**
   * A soldier fights its target: the rush, the javelin at an enemy hero, the wound-up blow, else it closes in. True when
   * it did; false when it has no foe (left), so the caller walks it back to its place. Shared with the caravan escorts.
   */
  fight(m: TroopMob, id: string, tr: Fighter, g: FightGround, dt: number, now: number): boolean {
    // the target must still be fair game (a hero can swear another oath or step onto the safe square)
    const tp = m.target ? this.h.hero(m.target) : undefined, tm = !tp && m.target ? this.h.mob(m.target) : undefined;
    const t = tp ?? tm;
    const far = !!tp && !!g.far && wantedTier(tp.feud, tr.clan, now) > 0; // a Wanted hero is chased past the usual leash
    if (m.target && (!t || (tp && (tp.dead || this.stance(tr.clan, m.target) !== "enemy" || this.h.hidden(m.target, now)))
      || (tm && (tm.dead || tm.hidden)) || offLimits(t.x, t.y) || !(far ? g.far!(t.x, t.y) : g.leash(t.x, t.y)))) { m.target = ""; m.windUntil = 0; m.winding = false; }
    if (!m.target || !t) { tr.throwing = false; tr.rushHit = false; return false; }
    const st = troopStats(tr.clan, m.level, tr.officer), speed = st.speed * (m.slowed ? SLOW_MOB : 1);
    const W = WAR_TROOPS, dist = Math.hypot(t.x - m.x, t.y - m.y), reach = MOB_ATTACK_RANGE + (tm ? mobBody(tm.kind as MobKind) : W.heroBody);
    const R = W.rush, J = WAR_TROOPS.javelin, by = troopName(tr.clan, tr.officer);
    // the rush lands: a blow on arrival, no wind-up
    if (tr.rushHit && dist <= reach + W.rushSlack && !m.broken) {
      tr.rushHit = false; tr.rushUntil = 0; m.lastAttack = now;
      const dmg = Math.round(st.dmg * R.dmgMult);
      if (tp) this.h.strikeHero(id, m.target, dmg, by); else this.h.strikeMob(id, m.target, dmg);
      return true;
    }
    if (tr.rushHit && now > tr.rushUntil + R.missGraceMs) tr.rushHit = false; // missed
    // a javelin at an enemy hero a few steps away
    if (tp && !m.broken && !m.windUntil && !tr.rushHit && (tr.throwing || (now >= tr.nextThrow && dist >= J.min && dist <= J.max))) {
      if (!tr.throwing) { tr.throwing = true; tr.nextThrow = now + J.windupMs; m.winding = true; }
      m.moving = false;
      m.dir = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? (t.x > m.x ? "right" : "left") : (t.y > m.y ? "down" : "up");
      if (now < tr.nextThrow) return true;
      tr.throwing = false; m.winding = false; tr.nextThrow = now + J.everyMs; m.lastAttack = now;
      this.h.shoot(id, tr.clan, t.x, t.y, Math.round(st.dmg * J.dmgMult), by);
      return true;
    }
    if (!m.broken && !m.windUntil && now >= tr.nextRush && dist >= R.min && dist <= R.max) { tr.nextRush = now + R.everyMs; tr.rushUntil = now + R.ms; tr.rushHit = true; }
    if ((dist <= reach || m.windUntil) && !m.broken) {
      m.moving = false;
      m.dir = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? (t.x > m.x ? "right" : "left") : (t.y > m.y ? "down" : "up");
      if (m.windUntil) {
        if (now >= m.windUntil) {
          m.windUntil = 0; m.winding = false; m.lastAttack = now;
          if (dist <= reach + W.swingSlack) {
            if (tp) this.h.strikeHero(id, m.target, st.dmg, by); else this.h.strikeMob(id, m.target, st.dmg);
          }
        }
      } else if (now - m.lastAttack >= st.cd) { m.windUntil = now + MOB_COMBAT.trooper.windupMs; m.winding = true; }
      return true;
    }
    this.walk(m, t.x, t.y, dt, speed * (now < tr.rushUntil ? R.speedMult : 1));
    return true;
  }

  /** One step toward (gx, gy) at `pace` px/s, never into the safe squares, the stockade or monster-free ground. */
  walk(m: TroopMob, gx: number, gy: number, dt: number, pace: number) {
    const to = fortDetour(m.x, m.y, gx, gy), dx = to.x - m.x, dy = to.y - m.y, d = Math.hypot(dx, dy); // round a Hold's walls, not into them
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
  seen(m: TroopMob, r: number): boolean {
    for (const [, p] of this.h.heroes()) if (!p.dead && Math.abs(p.x - m.x) < r && Math.abs(p.y - m.y) < r) return true;
    return false;
  }

  /** Tests: the land state, read-only. */
  _land(t: number) { return this.lands.get(t); }
}
