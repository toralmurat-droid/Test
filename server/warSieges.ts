/**
 * Siege battles (shared/war/siege.ts has the fronts, the force, the hysteresis and the numbers). While the war has a
 * siege announced at a land and a hero comes near it, the room fields both sides as real troopers (kind "trooper", clan
 * in Mob.weapon, so every trooper gate holds: no XP or loot, only enemy-sworn heroes hurt them and get attacked):
 * defenders at each front, attackers marching in along the land's patrol loop from the approach facing their own land.
 * They fight with the patrol troopers' moves (WarTroops.think / fight / walk, like the caravan escorts). Every scoreMs
 * each front is counted; a side that keeps the lead long enough takes it, and a held front pays its clan valor once a
 * minute, only while one of that clan's sworn heroes stands in it. One live siege per room (the nearest a hero); with
 * no hero near nothing spawns and nothing changes. TownRoom calls in through the narrow SiegeHost below.
 */
import { TILE } from "../shared/constants";
import { underground } from "../shared/dungeon";
import { isSafeZone } from "../shared/map";
import { blocked } from "../shared/movement";
import { noMobsAt } from "../shared/spawns";
import { inVillage } from "../shared/wrath";
import { CLANS, CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { gateLine } from "../shared/war/heralds";
import { patrolOf, patrolPos } from "../shared/war/patrols";
import { targetsOf } from "../shared/war/rules";
import { attackAxis, frontPay, frontStep, SIEGE_BATTLE, siegeApproach, siegeForce, siegeFronts, type Front, type FrontHold, type Side, type SiegeView } from "../shared/war/siege";
import { STANDARD } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { parseTroop, planRole, troopLevel, type TroopRole, troopStance, troopStats, troopWeapon, WAR_TROOPS } from "../shared/war/troops";
import { rolePlace } from "../shared/war/troopRoles";
import { addValor, stormingAt, warNow, warState } from "./war";
import { newFighter, type FightGround, type Fighter, type TroopHero, type TroopMob, type WarTroops } from "./warTroops";
import { WarWorks } from "./warWorks";

/** A hero as the sieges read it: a trooper's view plus the last time they moved, attacked or cast (STANDARD.idleMs). */
export interface SiegeHero extends TroopHero { lastAct: number }

export interface SiegeHost {
  /** A plain trooper monster with this id, level and weapon at (x, y) (the same as the troops'). */
  spawn(id: string, level: number, x: number, y: number, weapon: string): TroopMob | undefined;
  remove(id: string): void;
  mob(id: string): TroopMob | undefined;
  mobsInBox(x: number, y: number, r: number): Iterable<[string, TroopMob]>;
  heroes(): Iterable<[string, SiegeHero]>;
  hero(id: string): SiegeHero | undefined;
  broadcast(type: string, msg: unknown): void;
  /** Troopers the sieges may field now: WAR_TROOPS.maxTroops less what the caravans hold (they come first). */
  budget(): number;
  /** A hero reached a new renown rank (a wrecked siege ram, server/warWorks.ts). */
  ranked?(heroId: string, rank: string): void;
}
/** The soldier's moves the siege troopers borrow from the troops. */
export type Soldiers = Pick<WarTroops, "think" | "fight" | "walk" | "speedOf" | "seen">;

interface FrontState extends Front, FrontHold { /** Clans with an active sworn hero in the ring since the last pay. */ seen: Set<ClanKey> }
interface Slot { side: Side; front: number; i: number; id: string; post?: { x: number; y: number } }
interface Siege {
  t: number; atk: ClanKey; def: ClanKey; fronts: FrontState[]; axis: { x: number; y: number }; approach: { x: number; y: number; arc: number };
  live: boolean; lastHero: number; nextWave: number; nextScore: number; nextPay: number; slots: Map<string, Slot>;
}
interface Troop extends Fighter { s: Siege; slot: Slot; d: number; arrived: boolean; px: number; py: number; g: FightGround }

const offLimits = (x: number, y: number) => isSafeZone(x, y) || inVillage(x, y) || noMobsAt(x, y);
const sideClan = (s: Siege, side: Side) => (side === "atk" ? s.atk : s.def);
/** The role of a place at a front (ROLE_PLAN.siege by side and place; the gate front's place 0 is its officer, on foot). */
const roleAt = (s: Siege, sl: Slot): TroopRole => (s.fronts[sl.front].gate && sl.i === 0 ? "foot" : planRole(sideClan(s, sl.side), sl.side === "atk" ? "siegeAtk" : "siegeDef", sl.i));

export class WarSieges {
  private sieges = new Map<number, Siege>();
  private troops = new Map<string, Troop>();
  /** Front valor paid per land and clan in the current war tick (SIEGE_BATTLE.battleValorPerTick). */
  private paid = new Map<string, { tick: number; n: number }>();
  private seq = 0;
  /** Siege works (the Host's bone ram and its crew), inside each siege's share. */
  private works: WarWorks;

  constructor(private h: SiegeHost, private soldiers: Soldiers) {
    this.works = new WarWorks(h, soldiers, (t, clan, v, tick) => this.payClan(t, clan, v, tick));
  }

  /** Siege troopers alive now, works included (they count against WAR_TROOPS.maxTroops). */
  get count(): number { return this.troops.size + this.works.count; }
  owns(id: string): boolean { return this.troops.has(id) || this.works.owns(id); }

  /** The live siege for the clients ("siege" message): t -1 when none. */
  view(): SiegeView {
    for (const s of this.sieges.values()) if (s.live) {
      const out: SiegeView = { t: s.t, fronts: s.fronts.map((f) => ({ x: Math.round(f.x), y: Math.round(f.y), gate: f.gate, holder: sideClan(s, f.holder) })) }, ram = this.works.view(s.t);
      if (ram) out.ram = ram;
      return out;
    }
    return { t: -1, fronts: [] };
  }

  /** Once a second (after the caravans, before the patrols): follow the war's sieges, wake the nearest, field its troops, count its fronts, pay. */
  tick(now = Date.now()) {
    for (const [id, tr] of this.troops) { const m = this.h.mob(id); if (!m || m.dead) { this.troops.delete(id); tr.slot.id = ""; } }
    this.works.sweep();
    const v = SIEGE_BATTLE.live && WAR_TROOPS.live ? warNow() : undefined;
    const want = new Map<number, [ClanKey, ClanKey]>();
    if (v) for (const [t, by] of v.sieges) { const atk = CLAN_KEYS[by], def = CLAN_KEYS[v.owner[t]]; if (atk && def && atk !== def) want.set(t, [atk, def]); }
    // a siege that ended, or whose land changed hands (or attacker), is cleared
    for (const [t, s] of this.sieges) { const w = want.get(t); if (!w || w[0] !== s.atk || w[1] !== s.def) this.end(s); }
    if (!v) return;
    for (const [t, [atk, def]] of want) if (!this.sieges.has(t)) {
      const fronts = siegeFronts(t), axis = attackAxis(v.owner, t, CLAN_KEYS.indexOf(atk)) ?? { x: -1, y: 0 }, approach = siegeApproach(t, axis);
      if (!fronts.length || !approach) continue;
      this.sieges.set(t, { t, atk, def, axis, approach, live: false, lastHero: 0, nextWave: 0, nextScore: 0, nextPay: 0, slots: new Map(),
        fronts: fronts.map((f) => ({ ...f, holder: "def", since: now, seen: new Set() })) });
    }
    // the one live siege: the nearest a hero (above ground, alive) within wakeTiles; the last one lingers sleepMs
    const heroes: SiegeHero[] = [];
    for (const [, p] of this.h.heroes()) if (!p.dead && !underground(p.y)) heroes.push(p);
    let near: Siege | undefined, nd = Infinity;
    for (const s of this.sieges.values()) {
      if (stormingAt(s.t)) continue; // a storming (W5) is called at this gate: the battle's lines replace the siege's waves
      const r = TERRITORIES[s.t];
      for (const p of heroes) {
        const tx = p.x / TILE, ty = p.y / TILE, d = Math.hypot(Math.max(0, r.x - tx, tx - (r.x + r.w)), Math.max(0, r.y - ty, ty - (r.y + r.h)));
        if (d <= SIEGE_BATTLE.wakeTiles && d < nd) { nd = d; near = s; }
      }
    }
    for (const s of this.sieges.values()) if (s.live && s !== near && (near || stormingAt(s.t) || now - s.lastHero > SIEGE_BATTLE.sleepMs)) this.sleep(s);
    if (near) {
      near.lastHero = now;
      if (!near.live) { near.live = true; near.nextWave = 0; near.nextScore = now + SIEGE_BATTLE.scoreMs; near.nextPay = now + SIEGE_BATTLE.valorEveryMs; this.h.broadcast("siege", this.view()); }
    }
    for (const s of this.sieges.values()) if (s.live) this.field(s, v.control[s.t] ?? 100, now, v.tick);
    if (near && now >= near.nextScore) { near.nextScore = now + SIEGE_BATTLE.scoreMs; this.score(near, now); }
    if (near && now >= near.nextPay) { near.nextPay = now + SIEGE_BATTLE.valorEveryMs; this.pay(near, v.tick); }
  }

  /** The live siege's force: places by the budget, extra men go, the empty places fill in a wave every reinforceMs. */
  private field(s: Siege, control: number, now: number, tick: number) {
    const room = Math.min(SIEGE_BATTLE.maxSiegeTroops, this.h.budget()), fresh = s.nextWave === 0, f = siegeForce(s.fronts.length, control, room, this.works.reserve(s));
    if (this.works.field(s, tick, room)) this.h.broadcast("siege", this.view()); // the ram (and its crew) take their reserved places first
    const keep = new Set<string>();
    s.fronts.forEach((_, fi) => {
      for (const [side, n] of [["atk", f.atk], ["def", f.def]] as [Side, number][]) for (let i = 0; i < n; i++) {
        const k = `${side}:${fi}:${i}`;
        keep.add(k);
        if (!s.slots.has(k)) s.slots.set(k, { side, front: fi, i, id: "" });
      }
    });
    for (const [k, sl] of s.slots) if (!keep.has(k)) { this.drop(sl); s.slots.delete(k); }
    if (!fresh && now < s.nextWave) return;
    s.nextWave = now + SIEGE_BATTLE.reinforceMs;
    for (const sl of s.slots.values()) if (!sl.id) this.spawn(s, sl, fresh);
  }

  /** A trooper for a place: attackers march in from the approach; defenders stand at their front when the siege wakes, else march out of the Hold gate. */
  private spawn(s: Siege, sl: Slot, fresh: boolean) {
    const clan = sideClan(s, sl.side), fr = s.fronts[sl.front], officer = fr.gate && sl.i === 0, level = troopLevel(s.t, officer), p = patrolOf(s.t)!;
    const at = sl.side === "def" && fresh ? this.postOf(s, sl) : sl.side === "atk" ? s.approach : { x: p.pts[0].x, y: p.pts[0].y, arc: 0 };
    const d = sl.side === "atk" ? s.approach.arc : 0, arrived = sl.side === "def" && (fresh || fr.gate);
    const role = roleAt(s, sl); // (archers behind the line, riders on the flank: postOf)
    const id = `ws${++this.seq}`, m = this.h.spawn(id, level, at.x, at.y, troopWeapon(clan, officer, false, false, false, role));
    if (!m) return;
    m.hp = m.maxHp = troopStats(clan, level, officer, role).hp;
    sl.id = id;
    const tr: Troop = { ...newFighter(clan, officer, role), s, slot: sl, d: arrived ? fr.arc : d, arrived, px: at.x, py: at.y, g: { leash: () => false, hunt: () => false } };
    tr.g = { leash: (x, y) => Math.hypot(x - tr.px, y - tr.py) <= SIEGE_BATTLE.leashPx, hunt: () => false }; // wild monsters only when they strike first
    if (role !== "foot") tr.g.post = () => ({ x: tr.px, y: tr.py }); // (a pike's tether: its place at the front, or on the march)
    this.troops.set(id, tr);
  }

  private drop(sl: Slot) {
    if (sl.id) { this.troops.delete(sl.id); this.h.remove(sl.id); }
    sl.id = "";
  }

  /** Back to virtual: the troopers go, the fronts keep their holders (nothing changes while no hero is near). */
  private sleep(s: Siege) {
    for (const sl of s.slots.values()) this.drop(sl);
    s.slots.clear(); s.live = false;
    this.works.sleep(s.t);
    for (const f of s.fronts) { f.lead = undefined; f.seen.clear(); }
    this.h.broadcast("siege", this.view());
  }

  /** The siege is over (or its land changed hands): its troopers go and its fronts are forgotten. */
  private end(s: Siege) {
    const was = s.live;
    s.live = false;
    for (const sl of s.slots.values()) this.drop(sl);
    this.works.end(s.t);
    this.sieges.delete(s.t);
    if (was) this.h.broadcast("siege", this.view());
  }

  /** A place's spot at its front: attackers on the approach side, defenders on the other, side by side. */
  private postOf(s: Siege, sl: Slot): { x: number; y: number; arc: number } {
    const fr = s.fronts[sl.front];
    if (!sl.post) {
      const S = SIEGE_BATTLE, sd = sl.side === "atk" ? 1 : -1, ax = s.axis, n = S.perFront;
      const lat = (sl.i - (n - 1) / 2) * S.spacingPx, x = fr.x + ax.x * sd * S.depthPx - ax.y * lat, y = fr.y + ax.y * sd * S.depthPx + ax.x * lat;
      const role = roleAt(s, sl), out = Math.sign(lat);
      const q = role === "foot" ? undefined : rolePlace(role, x, y, [ax.x * sd, ax.y * sd], [-ax.y * out, ax.x * out]); // archers a step behind the line, riders out on its flank (ROLE_FORM)
      sl.post = q && !offLimits(q.x, q.y) && !blocked(q.x, q.y) ? q : offLimits(x, y) || blocked(x, y) ? { x: fr.x, y: fr.y } : { x, y };
    }
    return { ...sl.post, arc: fr.arc };
  }

  /** Counts every front (troopers of both sides, active sworn heroes weigh heroWeight) and moves its hold (frontStep). */
  private score(s: Siege, now: number) {
    const S = SIEGE_BATTLE, R = S.frontRadiusPx;
    s.fronts.forEach((f) => {
      let atk = 0, def = 0;
      for (const [, o] of this.h.mobsInBox(f.x, f.y, R)) {
        if (o.dead || o.kind !== "trooper" || Math.hypot(o.x - f.x, o.y - f.y) > R) continue;
        const k = parseTroop(o.weapon);
        if (!k || k.object) continue; // (a cart or a ram is no fighter: the ram weighs through extraWeight)
        if (k.clan === s.atk) atk++; else if (k.clan === s.def) def++;
      }
      atk += this.works.extraWeight(s.t, f, "atk"); def += this.works.extraWeight(s.t, f, "def");
      for (const [, p] of this.h.heroes()) {
        if (p.dead || !p.clan || p.level < STANDARD.minLevel || now - p.lastAct > STANDARD.idleMs || Math.hypot(p.x - f.x, p.y - f.y) > R) continue;
        if (p.clan === s.atk) { atk += S.heroWeight; f.seen.add(p.clan); } else if (p.clan === s.def) { def += S.heroWeight; f.seen.add(p.clan); }
      }
      if (!frontStep(f, atk, def, now)) return;
      const clan = sideClan(s, f.holder), foe = f.holder === "atk" ? s.def : s.atk;
      this.h.broadcast("sfx", { ev: "siege_front", x: Math.round(f.x), y: Math.round(f.y), clan });
      this.h.broadcast("siege", this.view());
      if (!f.gate) return;
      const land = TERRITORIES[s.t].name, retook = f.holder === "def";
      this.h.broadcast("chat", { id: "", name: "Herald", text: `The ${CLANS[clan].name} ${retook ? "took back" : "took"} the gate of ${land}.` });
      const line = gateLine(clan, retook, land, foe, Math.floor(now / 1000));
      this.h.broadcast("chat", { id: "", name: line.name, text: line.text });
    });
  }

  /**
   * Once a minute: each front's holder earns frontValor (the gate x gateMult) if one of its sworn heroes was active in
   * the ring meanwhile, at most battleValorPerTick per clan and land in a war tick, and only where the war lets that clan
   * fight (it holds the land, or may attack it): the war's own rules decide what the valor does.
   */
  private pay(s: Siege, tick: number) {
    for (const f of s.fronts) {
      const clan = sideClan(s, f.holder), v = frontPay(f.gate, f.seen.has(clan), this.used(s.t, clan, tick));
      f.seen.clear();
      if (v) this.payClan(s.t, clan, v, tick);
    }
  }

  /** Siege valor `clan` already earned in land t this war tick. */
  private used(t: number, clan: ClanKey, tick: number): number {
    for (const [k, c] of this.paid) if (c.tick !== tick) this.paid.delete(k);
    return this.paid.get(`${t}:${clan}`)?.n ?? 0;
  }

  /**
   * Valor for `clan` in land t from the siege (fronts, a wrecked ram): up to battleValorPerTick per clan and land in a
   * war tick, and only where the war lets that clan fight (it holds the land, or may attack it). Returns what it paid.
   */
  private payClan(t: number, clan: ClanKey, v: number, tick: number): number {
    const st = warState(), used = this.used(t, clan, tick), n = Math.min(v, SIEGE_BATTLE.battleValorPerTick - used);
    if (n <= 0 || !st || !(st.owner[t] === clan || targetsOf(st, clan).includes(t))) return 0;
    if (!addValor(t, clan, n)) return 0;
    this.paid.set(`${t}:${clan}`, { tick, n: used + n });
    return n;
  }

  /** A siege trooper's turn (TownRoom.updateMob, trooper branch): fight within its leash, else march to its front and hold it. */
  step(m: TroopMob, id: string, dt: number, now: number) {
    if (this.works.owns(id)) return this.works.step(m, id, dt, now);
    const tr = this.troops.get(id);
    if (!tr) { this.h.remove(id); return; }
    const p = patrolOf(tr.s.t);
    if (!p) { this.h.remove(id); return; }
    let post: { x: number; y: number };
    if (tr.arrived) post = this.postOf(tr.s, tr.slot);
    else { // on the march along the land's loop: the point ahead moves on only while the trooper keeps up with it
      const q = patrolPos(p, tr.d);
      if (!tr.near || Math.hypot(q.x - m.x, q.y - m.y) < WAR_TROOPS.slackPx) {
        const goal = tr.s.fronts[tr.slot.front].arc, L = p.len || 1;
        let delta = (((goal - tr.d) % L) + L) % L;
        if (delta > L / 2) delta -= L;
        const stepPx = this.soldiers.speedOf(m, tr) * dt;
        if (Math.abs(delta) <= stepPx) { tr.d = goal; tr.arrived = true; } else tr.d += Math.sign(delta) * stepPx;
      }
      post = tr.arrived ? this.postOf(tr.s, tr.slot) : patrolPos(p, tr.d);
    }
    tr.px = post.x; tr.py = post.y;
    if (this.soldiers.think(m, id, tr, tr.g, now)) return;
    if (!tr.near) { // nobody to see it: it keeps its place (cheap)
      if (!offLimits(post.x, post.y)) { m.x = m.homeX = post.x; m.y = m.homeY = post.y; }
      m.moving = !tr.arrived; m.windUntil = 0; m.winding = false;
      return;
    }
    if (this.soldiers.fight(m, id, tr, tr.g, dt, now)) return;
    const d = Math.hypot(post.x - m.x, post.y - m.y);
    if (d > WAR_TROOPS.warpPx && !this.soldiers.seen(m, WAR_TROOPS.warpUnseenPx) && !offLimits(post.x, post.y)) { m.x = post.x; m.y = post.y; m.moving = false; return; }
    if (d < 2) {
      m.moving = false;
      const fr = tr.s.fronts[tr.slot.front], fx = fr.x - m.x, fy = fr.y - m.y; // face across the front
      if (Math.abs(fx) + Math.abs(fy) > 1) m.dir = Math.abs(fx) > Math.abs(fy) ? (fx > 0 ? "right" : "left") : fy > 0 ? "down" : "up";
      return;
    }
    this.soldiers.walk(m, post.x, post.y, dt, this.soldiers.speedOf(m, tr));
  }

  /** An enemy hero's blow on a siege trooper: its idle mates at the same front turn on them. */
  hit(heroId: string, id: string) {
    if (this.works.owns(id)) return this.works.hit(heroId, id);
    const tr = this.troops.get(id), p = this.h.hero(heroId);
    if (!tr || !p || troopStance(tr.clan, p) !== "enemy") return;
    for (const [oid, o] of this.troops) {
      if (o.s !== tr.s || o.slot.front !== tr.slot.front || o.slot.side !== tr.slot.side) continue;
      const m = this.h.mob(oid);
      if (m && !m.dead && !m.target) m.target = heroId;
    }
  }

  /** A siege trooper died (by any hand): its place waits for the next wave. No valor and no loot for it (a wrecked ram: server/warWorks.ts). */
  killed(id: string, killerId = "", m?: TroopMob): boolean {
    if (m && this.works.owns(id)) { if (this.works.killed(m, id, killerId)) this.h.broadcast("siege", this.view()); return true; }
    const tr = this.troops.get(id);
    if (!tr) return false;
    this.troops.delete(id);
    tr.slot.id = "";
    return true;
  }

  /** A hero left or died: no siege trooper keeps chasing them. */
  forget(heroId: string) {
    for (const id of this.troops.keys()) { const m = this.h.mob(id); if (m && m.target === heroId) m.target = ""; }
    this.works.forget(heroId);
  }

  /** Tests: the siege works (the ram), read-only use. */
  get _works() { return this.works; }
  /** Tests: a siege's state, read-only. */
  _siege(t: number) { return this.sieges.get(t); }
  /** Tests: the ids of a siege's troopers by side. */
  _troops(t: number, side?: Side): string[] {
    const out: string[] = [];
    for (const [id, tr] of this.troops) if (tr.s.t === t && (!side || tr.slot.side === side)) out.push(id);
    return out;
  }
}
