/**
 * Capturable towns in the room (W6; shared/war/towns.ts has the rules, spots and numbers, server/war.ts the towns'
 * state). While a town is contested and a hero comes near its gate muster, the old holder's town guard stands there as
 * real troopers (kind "trooper", clan in Mob.weapon, so every trooper gate holds: no XP or loot, only enemy-sworn heroes
 * hurt them and get attacked, kill valor through the room's usual path). They fight with the patrol troopers' moves,
 * leashed to the gate and never onto town ground. A guard felled stays down until the next war tick.
 * A hero of oath level sworn to the contesting clan raises its banner at the gate ("townclaim" {id}): refused while a
 * guard is owed or an active hero sworn to the old holder stands in the reach; it takes TOWN.raiseMs (holdSack.ts
 * sackStep: defenders in the reach pause it, a blow starts it over, walking off stops it). Done, the town flips at once
 * (server/war.ts townClaim), and the clan's sworn heroes in the reach earn renown. One raise per town for every room of
 * the process. Each second a gate still held (a guard alive and an active defender at it) is reported to the war
 * (townHeld: a tick of grace). TownRoom calls in through the narrow TownHost below.
 * Ages: on a follower the claim is queued for the war's owner (server/war.ts claimAct), which flips the town and adds
 * the valor if it is still contested by that clan; the renown here waits until it did (warActFate "ok").
 */
import { TILE } from "../shared/constants";
import { underground } from "../shared/dungeon";
import { isSafeZone } from "../shared/map";
import { noMobsAt } from "../shared/spawns";
import { inVillage } from "../shared/wrath";
import { CLANS, type ClanKey } from "../shared/war/clans";
import { sackStep, type SackRaise } from "../shared/war/holdSack";
import { RENOWN_RANKS, rankOf } from "../shared/war/renown";
import { rallyRenown } from "../shared/war/rules";
import { STANDARD } from "../shared/war/standards";
import { gatePosts, gatePx, inGateReach, onTownGround, TOWN, TOWNS, townById, townPatron, type Town } from "../shared/war/towns";
import { troopLevel, troopStats, troopStance, troopWeapon, WAR_TROOPS } from "../shared/war/troops";
import { ACT_FATE_MS, claimAct, townClaim, townHeld, townsNow, townsVersion, warActFate, warNow, warRole, warState, warTowns } from "./war";
import { boonRenown } from "./warCrown";
import type { SiegeHero, Soldiers } from "./warSieges";
import { newFighter, type FightGround, type Fighter, type TroopMob } from "./warTroops";

/** A hero as the towns read it (TownRoom's Player): `lastHurt` is when they last took a blow. */
export interface TownHero extends SiegeHero { lastHurt: number }

export interface TownHost {
  spawn(id: string, level: number, x: number, y: number, weapon: string): TroopMob | undefined;
  remove(id: string): void;
  mob(id: string): TroopMob | undefined;
  heroes(): Iterable<[string, TownHero]>;
  hero(id: string): TownHero | undefined;
  send(id: string, type: string, msg: unknown): void;
  broadcast(type: string, msg: unknown): void;
  /** Troopers the town guards may field now (WAR_TROOPS.maxTroops less what the other war systems hold). */
  budget(): number;
  ranked?(heroId: string, rank: string): void;
}

/** What the raiser's own client hears ("townclaim"): the banner's progress and state, or why not. */
export interface TownClaimMsg { id: string; progress?: number; state?: "raise" | "paused" | "done" | "stop"; err?: string }

/** For every room of this process: the town whose banner a hero is raising, and the room raising it. */
const raisingIn = new Map<string, WarTowns>();
/** Tests: forget every raise. */
export function _resetTowns() { raisingIn.clear(); }

interface Raise extends SackRaise { hero: string; id: string; lastStep: number; hurtAt: number }
/** A follower's claim waiting for the war's owner (Ages): the claimer and the heroes who share its renown. */
interface Waiting { act: string; pid: string; town: string; k: ClanKey; heroes: string[]; at: number }
/** A gate guard: its town, its post (0 the captain), the contest it stands for. */
interface Guard extends Fighter { town: Town; post: number; key: string; g: FightGround }
/** A gate awake in this room: its contest key ("<town>:<holder>:<by>"), the guards' slots, the last time a hero was near. */
interface Gate { key: string; town: Town; k: ClanKey; lastHero: number; slots: string[] }

/** No town guard stands or chases where blood is never spilled, nor on any town's ground. */
const offLimits = (x: number, y: number) => isSafeZone(x, y) || inVillage(x, y) || noMobsAt(x, y) || onTownGround(x, y);

export class WarTowns {
  private raises = new Map<string, Raise>();
  private guards = new Map<string, Guard>();
  private gates = new Map<string, Gate>();
  /** Guards fallen per contest and war tick ("<key>@<tick>" -> posts): they stay down until the next war tick. */
  private fallen = new Map<string, Set<number>>();
  private seq = 0;
  /** The gate guards' monsters (canHurt asks by the monster). */
  private mobs = new WeakSet<object>();
  private told = ""; private toldAt = 0;
  /** Ages: this room's claims queued for the war's owner, their renown given when it applies them (settle). */
  private waiting: Waiting[] = [];

  constructor(private h: TownHost, private soldiers: Soldiers) {}

  /** Gate guards alive now (they count against WAR_TROOPS.maxTroops). */
  get count(): number { return this.guards.size; }
  owns(id: string): boolean { return this.guards.has(id); }

  /** The clients' view: every town's holder and contest, and the banners being raised here. */
  view() {
    const raising: Record<string, number> = {};
    for (const r of this.raises.values()) raising[r.id] = Math.floor(r.progress * 100);
    return townsNow(raising);
  }

  private contestKey(id: string): string | undefined {
    const s = warTowns()[id];
    return s?.c ? `${id}:${s.k}:${s.c.by}` : undefined;
  }
  private fellNow(key: string): Set<number> {
    const k = `${key}@${warNow()?.tick ?? -1}`;
    let f = this.fallen.get(k);
    if (!f) this.fallen.set(k, (f = new Set()));
    return f;
  }
  /** Guards town `id`'s gate still owes a fight this war tick (felled ones are down until the next), whatever the room's budget. */
  guardsDue(id: string): number {
    const key = this.contestKey(id);
    return key ? Math.max(0, TOWN.guards + TOWN.captain - this.fellNow(key).size) : 0;
  }
  /** Living gate guards of town `id` within its reach. */
  private guardsAlive(t: Town): number {
    let n = 0;
    for (const [gid, g] of this.guards) { const m = this.h.mob(gid); if (g.town === t && m && !m.dead && inGateReach(t, m.x, m.y)) n++; }
    return n;
  }
  /** Active heroes of oath level sworn to `k` within the gate's reach. */
  private defenders(t: Town, k: ClanKey, now: number): number {
    let n = 0;
    for (const [, p] of this.h.heroes())
      if (!p.dead && p.clan === k && p.level >= STANDARD.minLevel && now - p.lastAct <= STANDARD.idleMs && !underground(p.y) && inGateReach(t, p.x, p.y)) n++;
    return n;
  }

  /** Why hero `pid` may not raise their banner at town `id`'s gate now ("" when they may). */
  why(pid: string, id: string, now = Date.now()): string {
    const p = this.h.hero(pid), t = townById(id), st = warTowns()[id], g = t && gatePx(t);
    if (!TOWN.live || !p || p.dead || !t || !g || !st) return "There is no banner to raise here.";
    if (p.level < STANDARD.minLevel) return `Only heroes of level ${STANDARD.minLevel} and above take part in the clan war.`;
    if (underground(p.y) || Math.hypot(p.x - g.x, p.y - g.y) > TOWN.useTiles * TILE) return `Stand at the gate muster of ${t.name}.`;
    if (!st.c) return `${cap(t.name)} is not contested.`;
    if (!p.clan) return "Swear to a clan first: only its sworn raise its banner.";
    if (p.clan === st.k) return `${cap(t.name)} is your own clan's: hold its gate instead.`;
    if (p.clan !== st.c.by) return `Only heroes sworn to ${CLANS[st.c.by].name} may claim ${t.name} now.`;
    const other = raisingIn.get(id);
    if ((other && other !== this) || [...this.raises.values()].some((r) => r.id === id && r.hero !== pid)) return "Another hero is raising a banner here.";
    if (this.guardsDue(id) > 0 || this.guardsAlive(t) > 0) return "The town guard still stands: cut it down first.";
    if (this.defenders(t, st.k, now) > 0) return `A hero sworn to ${CLANS[st.k].name} holds the gate.`;
    return "";
  }

  /** The "townclaim" message `{id}`: the hero starts raising their banner at that town's gate. Returns "" or why not. */
  claim(pid: string, msg: unknown, now = Date.now()): string {
    const raw = msg && typeof msg === "object" ? (msg as { id?: unknown }).id : undefined;
    if (typeof raw !== "string" || raw.length > 16 || !townById(raw)) return "There is no banner to raise here.";
    const err = this.why(pid, raw, now);
    if (err) return err;
    if (this.raises.get(pid)?.id === raw) return "";
    const p = this.h.hero(pid)!;
    this.drop(pid); // (a banner at another gate stops: the town it was for is free again)
    this.raises.set(pid, { hero: pid, id: raw, progress: 0, paused: false, lastStep: now, hurtAt: p.lastHurt });
    raisingIn.set(raw, this);
    this.h.send(pid, "townclaim", { id: raw, progress: 0, state: "raise" } satisfies TownClaimMsg);
    this.tell(now, true);
    return "";
  }

  private stop(pid: string, why = "") { this.drop(pid, why); }
  /** The hero's banner stops (left, fell, asked for another gate): their client hears it (a gone client: a no-op send). */
  private drop(pid: string, why = "") {
    const r = this.raises.get(pid);
    if (!r) return;
    this.release(pid);
    this.h.send(pid, "townclaim", { id: r.id, state: "stop", ...(why ? { err: why } : {}) } satisfies TownClaimMsg);
  }
  /** Forgets the hero's banner without a word (it is done: the caller says so). */
  private release(pid: string) {
    const r = this.raises.get(pid);
    if (!r) return;
    this.raises.delete(pid);
    if (raisingIn.get(r.id) === this) raisingIn.delete(r.id);
  }

  /**
   * May hero `pid` hurt monster `m`? Not a gate guard while standing on town ground (where the guard may never follow:
   * no free whittling from inside), nor below TOWN.minFoeLevel (the guards leave those heroes alone too). True for any other monster.
   */
  canHurt(pid: string, m: TroopMob): boolean {
    if (!this.mobs.has(m)) return true;
    const p = this.h.hero(pid);
    return !!p && p.level >= TOWN.minFoeLevel && !onTownGround(p.x, p.y);
  }

  /** A hero left or died: their banner stops, no gate guard keeps chasing them. */
  forget(pid: string) {
    if (this.raises.has(pid)) { this.drop(pid); this.tell(Date.now(), true); }
    for (const gid of this.guards.keys()) { const m = this.h.mob(gid); if (m && m.target === pid) m.target = ""; }
  }

  /** War news: the towns may have changed (the clients hear at once; the gates follow at the next tick). */
  onWar(now = Date.now()) { this.tick(now); this.tell(now, true); }

  /** Once a second (before the patrols): follow the contests, wake the gates near heroes, field their guards, move the banners. */
  tick(now = Date.now()) {
    for (const [gid, g] of this.guards) { const m = this.h.mob(gid); if (!m || m.dead) { this.guards.delete(gid); if (m) this.fellNow(g.key).add(g.post); } }
    const tick = warNow()?.tick ?? -1;
    for (const k of this.fallen.keys()) if (!k.endsWith(`@${tick}`)) this.fallen.delete(k);
    const v = TOWN.live && WAR_TROOPS.live ? warNow() : undefined, towns = warTowns();
    const heroes: TownHero[] = [];
    if (v) for (const [, p] of this.h.heroes()) if (!p.dead && !underground(p.y)) heroes.push(p);
    for (const t of TOWNS) {
      const key = v ? this.contestKey(t.id) : undefined, gate = this.gates.get(t.id);
      if (gate && gate.key !== key) { this.sleep(gate); this.gates.delete(t.id); }
      if (!key) continue;
      const g = gatePx(t), near = heroes.some((p) => Math.hypot(p.x - g.x, p.y - g.y) <= TOWN.wakeTiles * TILE);
      let gt = this.gates.get(t.id);
      if (near && !gt) this.gates.set(t.id, (gt = { key, town: t, k: towns[t.id]!.k, lastHero: now, slots: [] }));
      if (!gt) continue;
      if (near) gt.lastHero = now;
      else if (now - gt.lastHero > TOWN.sleepMs) { this.sleep(gt); this.gates.delete(t.id); continue; }
      this.field(gt);
      // the old holder kept the gate this second: a guard alive and an active defender there (a tick of grace: townHeld)
      if (this.guardsAlive(t) > 0 && this.defenders(t, gt.k, now) > 0) townHeld(t.id);
    }
    this.raise(now);
    this.settle(now);
    this.tell(now);
  }

  /** Ages: the claims this room queued that the war's owner applied earn their renown; dropped ones are told. */
  private settle(now: number) {
    if (!this.waiting.length) return;
    this.waiting = this.waiting.filter((w) => {
      const fate = warActFate(w.act);
      if (fate === undefined && now - w.at < ACT_FATE_MS) return true;
      const name = townById(w.town)?.name ?? w.town;
      if (fate !== "ok") { this.h.send(w.pid, "chat", { id: "", name: "Herald", text: `The war did not count your banner over ${name} (the contest was over): no renown.` }); return false; }
      this.renown(w.heroes.flatMap((hid) => { const o = this.h.hero(hid); return o && !o.dead && o.clan === w.k ? [[hid, o] as [string, TownHero]] : []; }), w.k);
      this.h.send(w.pid, "chat", { id: "", name: "Herald", text: `The war counted your banner over ${name}: +${TOWN.claimValor} valor for your clan, +${TOWN.claimRenown} renown.` });
      return false;
    });
  }

  /** Renown for a claim to clan `k`'s heroes `heroes`. */
  private renown(heroes: Iterable<[string, TownHero]>, k: ClanKey) {
    const st = warState();
    for (const [hid, o] of heroes) {
      const was = rankOf(o.renown);
      o.renown += TOWN.claimRenown * rallyRenown(st, k) * boonRenown(k);
      const rank = rankOf(o.renown);
      if (rank > was) this.h.ranked?.(hid, RENOWN_RANKS[rank].name);
    }
  }

  /** A gate's guard: the posts not fallen this war tick, by the room's budget (the captain first). */
  private field(gt: Gate) {
    const fell = this.fellNow(gt.key), posts = gatePosts(gt.town), patron = townPatron(gt.town.id);
    let room = Math.max(0, this.h.budget());
    for (let i = 0; i < posts.length; i++) {
      const id = gt.slots[i], alive = !!id && this.guards.has(id);
      if (alive) continue;
      gt.slots[i] = "";
      if (fell.has(i) || room <= 0) continue;
      const officer = i === 0, level = Math.max(TOWN.minGuardLevel, troopLevel(patron, officer)), at = posts[i];
      const gid = `wg${++this.seq}`, m = this.h.spawn(gid, level, at.x, at.y, troopWeapon(gt.k, officer));
      if (!m) continue;
      m.hp = m.maxHp = troopStats(gt.k, level, officer).hp;
      gt.slots[i] = gid; room--;
      const t = gt.town, g = gatePx(t);
      this.guards.set(gid, { ...newFighter(gt.k, officer), town: t, post: i, key: gt.key,
        g: { leash: (x, y) => Math.hypot(x - g.x, y - g.y) <= TOWN.leashPx && !offLimits(x, y), hunt: () => false, foe: (h) => h.level >= TOWN.minFoeLevel } }); // wild monsters only when they strike first
      this.mobs.add(m);
    }
  }

  /** A gate sleeps or its contest is over: the guards go (those felled stay counted until the next war tick). */
  private sleep(gt: Gate) {
    for (const id of gt.slots) if (id) { this.guards.delete(id); this.h.remove(id); }
    gt.slots = [];
  }

  /** Every banner going up moves on (sackStep), or stops. */
  private raise(now: number) {
    const towns = warTowns();
    for (const [pid, r] of this.raises) {
      const p = this.h.hero(pid), t = townById(r.id)!, st = towns[r.id], g = gatePx(t);
      if (!p || p.dead) { this.drop(pid, p?.dead ? "You fell." : ""); continue; }
      if (underground(p.y) || Math.hypot(p.x - g.x, p.y - g.y) > TOWN.useTiles * TILE * 1.5) { this.stop(pid, "You left the gate."); continue; }
      if (!st?.c || p.clan !== st.c.by || p.level < STANDARD.minLevel) { this.stop(pid, `${cap(t.name)} is not yours to claim now.`); continue; }
      const hurt = p.lastHurt > r.hurtAt;
      r.hurtAt = p.lastHurt;
      const dt = now - r.lastStep, was = r.paused;
      r.lastStep = now;
      const step = sackStep(r, dt, this.guardsAlive(t) + this.defenders(t, st.k, now), hurt);
      if (step === "done") this.done(pid, p, r, st.c.by, now);
      else this.h.send(pid, "townclaim", { id: r.id, progress: Math.round(r.progress * 100) / 100, state: r.paused ? "paused" : "raise" } satisfies TownClaimMsg);
      if (step !== "done" && r.paused !== was) this.tell(now, true);
    }
  }

  /** The banner is up: the town flips (server/war.ts townClaim: valor, the Herald, every room), the clan's sworn in the reach earn renown. */
  private done(pid: string, p: TownHero, r: Raise, k: ClanKey, now: number) {
    this.release(pid);
    const t = townById(r.id)!;
    const follower = warRole() === "follower", act = follower ? claimAct(r.id, k, p.name) : undefined; // (Ages: the owner decides; renown in settle)
    if (follower ? !act : !townClaim(r.id, k, p.name, now)) { this.h.send(pid, "townclaim", { id: r.id, state: "stop", err: `${cap(t.name)} is not yours to claim now.` } satisfies TownClaimMsg); return; }
    const heroes: [string, TownHero][] = [];
    for (const [hid, o] of this.h.heroes()) if (!o.dead && o.clan === k && o.level >= STANDARD.minLevel && (hid === pid || inGateReach(t, o.x, o.y))) heroes.push([hid, o]);
    if (act) this.waiting.push({ act, pid, town: r.id, k, heroes: heroes.map(([hid]) => hid), at: now });
    else this.renown(heroes, k);
    const g = gatePx(t);
    this.h.broadcast("sfx", { ev: "banner_raise", id: t.id, x: Math.round(g.x), y: Math.round(g.y), by: k });
    this.h.send(pid, "townclaim", { id: r.id, progress: 1, state: "done" } satisfies TownClaimMsg);
    this.h.send(pid, "chat", { id: "", name: "Herald", text: act
      ? `You raised the banner of ${CLANS[k].name} over ${t.name}. The heralds carry the news to the war: the valor and renown come when it counts.`
      : `You raised the banner of ${CLANS[k].name} over ${t.name}: +${TOWN.claimValor} valor for your clan, +${TOWN.claimRenown} renown.` });
    this.tell(now, true);
  }

  /** The clients hear of the towns at once on a change, of a banner's progress at most every TOWN.sendMs. */
  private tell(now: number, force = false) {
    const ver = townsVersion(), raising = [...this.raises.values()].map((r) => `${r.id}:${r.paused ? 1 : 0}`).join(","), s = `${ver}|${raising}`;
    const moved = this.raises.size > 0 && now - this.toldAt >= TOWN.sendMs;
    if (!force && s === this.told && !moved) return;
    this.told = s; this.toldAt = now;
    this.h.broadcast("towns", this.view());
  }

  /** A gate guard's turn (TownRoom.updateMob, trooper branch): fight within its leash, else back to its post. */
  step(m: TroopMob, id: string, dt: number, now: number) {
    const gd = this.guards.get(id);
    if (!gd) { this.h.remove(id); return; }
    const post = gatePosts(gd.town)[gd.post] ?? gatePx(gd.town);
    if (this.soldiers.think(m, id, gd, gd.g, now)) return;
    if (!gd.near) { m.x = m.homeX = post.x; m.y = m.homeY = post.y; m.moving = false; m.windUntil = 0; m.winding = false; return; }
    if (this.soldiers.fight(m, id, gd, gd.g, dt, now)) return;
    const d = Math.hypot(post.x - m.x, post.y - m.y);
    if (d < 2) { m.moving = false; return; }
    this.soldiers.walk(m, post.x, post.y, dt, this.soldiers.speedOf(m, gd));
  }

  /** An enemy hero's blow on a gate guard: the idle guards of that gate turn on them. */
  hit(pid: string, id: string) {
    const gd = this.guards.get(id), p = this.h.hero(pid);
    if (!gd || !p || troopStance(gd.clan, p) !== "enemy") return;
    for (const [oid, o] of this.guards) { if (o.town !== gd.town) continue; const m = this.h.mob(oid); if (m && !m.dead && !m.target) m.target = pid; }
  }

  /** A gate guard died (any hand): its post stays empty until the next war tick. True when it was one. */
  killed(id: string): boolean {
    const gd = this.guards.get(id);
    if (!gd) return false;
    this.guards.delete(id);
    this.fellNow(gd.key).add(gd.post);
    return true;
  }

  /** Tests: the guard ids at town `id`'s gate. */
  _guards(id: string): string[] { return [...this.guards].filter(([, g]) => g.town.id === id).map(([gid]) => gid); }
}

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
