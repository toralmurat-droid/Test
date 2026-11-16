/**
 * Caravans (shared/war/caravans.ts has the roads, the clock and the numbers). Every supply line's carts run on the wall
 * clock whether anyone sees them or not; when a hero comes within CARAVAN.wakeTiles of one, the room gets it as real
 * monsters: the cart (a "trooper" with weapon "<clan>^", so every trooper gate holds: only rival-sworn heroes hurt it,
 * no XP or loot by the generic path) rolling exactly where the clock puts it, and CARAVAN.escorts soldiers marching in
 * formation round it, fighting within a leash of it (WarTroops.think / fight / walk). A rival-sworn hero who fells the
 * cart raids it; a sworn hero of its clan who walks beside it for most of the trip delivers it.
 * TownRoom calls in at the same points as for the troops, through the narrow CaravanHost below.
 */
import { TILE, type Dir } from "../shared/constants";
import { underground } from "../shared/dungeon";
import { blocked } from "../shared/movement";
import { CLANS, type ClanKey } from "../shared/war/clans";
import { CARAVAN, caravanGold, caravanHp, caravanLand, caravanLevel, caravanLines, caravanOffLimits, caravanRoute, caravansOnRoad, caravanTripMs, roadKnown, routePos, type CaravanLine, type CaravanRoute } from "../shared/war/caravans";
import { RENOWN_RANKS, rankOf } from "../shared/war/renown";
import { targetsOf } from "../shared/war/rules";
import { STANDARD } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { troopStance, troopWeapon, WAR_TROOPS } from "../shared/war/troops";
import { clanOfIndex } from "../shared/war/view";
import { addValor, warNow, warState } from "./war";
import { newFighter, type FightGround, type Fighter, type TroopHero, type TroopMob, type WarTroops } from "./warTroops";

export interface CaravanHost {
  /** A plain trooper monster with this id, level and weapon at (x, y) (the same as the troops'). */
  spawn(id: string, level: number, x: number, y: number, weapon: string): TroopMob | undefined;
  remove(id: string): void;
  mob(id: string): TroopMob | undefined;
  heroes(): Iterable<[string, TroopHero]>;
  hero(id: string): TroopHero | undefined;
  /** Gold on the ground (the room's usual gold drop). */
  dropGold(x: number, y: number, amount: number): void;
  broadcast(type: string, msg: unknown): void;
  /** A Herald line to one hero. */
  tell(heroId: string, text: string): void;
  ranked(heroId: string, rank: string): void;
  /** War writs (server/warWrits.ts caravan): a delivery this hero escorted, or a cart this hero felled in a raid. */
  writ?(heroId: string, kind: "escort" | "raid", line: CaravanLine): void;
}
/** The soldier's moves the escorts borrow from the troops. */
export type Soldiers = Pick<WarTroops, "think" | "fight" | "walk" | "speedOf" | "seen">;

export type CaravanOutcome = "raided" | "delivered" | "lost";
/**
 * What became of carts of the current slots, for every room of this process (a raided cart must not roll again in
 * another room, nor respawn when a hero comes back). Memory only: after a restart the clock simply goes on.
 */
const outcomes = new Map<string, { kind: CaravanOutcome; until: number }>();
export const caravanOutcome = (id: string): CaravanOutcome | undefined => outcomes.get(id)?.kind;
/** Tests: forget every outcome. */
/** Raided or delivered somewhere in the process: every room's copy of that trip is done. */
const settled = (id: string) => { const k = outcomes.get(id)?.kind; return k === "raided" || k === "delivered"; };
export function _resetCaravans() { outcomes.clear(); }

/** One cart's trip as this room knows it (kept while the cart sleeps, so an escort's time and its wounds survive). */
interface Trip { id: string; line: CaravanLine; r: CaravanRoute; dep: number; tripMs: number; level: number; hp: number; fallen: Set<number>; heroMs: Map<string, number>; lastTick: number }
interface Live { trip: Trip; cart: string; escorts: string[]; fighters: Fighter[]; lastSeen: number; x: number; y: number; wreckAt: number; g: FightGround }

export class WarCaravans {
  private trips = new Map<string, Trip>();
  private live = new Map<string, Live>();
  /** Mob id -> its caravan and place (-1 the cart, 0.. an escort). */
  private mobs = new Map<string, { live: Live; i: number }>();
  private linesKey = "";
  private lines: CaravanLine[] = [];
  private seq = 0;

  constructor(private h: CaravanHost, private soldiers: Soldiers) {}

  /** Caravan monsters alive now (they count against WAR_TROOPS.maxTroops). */
  get count(): number { return this.mobs.size; }
  /** Carts alive now. */
  get carts(): number { return this.live.size; }
  /** Is this monster a cart or an escort of this room's caravans? */
  owns(id: string): boolean { return this.mobs.has(id); }

  /** Once a second: escort time, arrivals, carts waking near heroes and sleeping away from them. */
  tick(now = Date.now()) {
    for (const [k, o] of outcomes) if (o.until < now) outcomes.delete(k);
    // monsters that vanished without a death (a test, a reset)
    for (const [id, s] of this.mobs) {
      const m = this.h.mob(id);
      if (m && !m.dead) continue;
      this.mobs.delete(id);
      if (s.i >= 0) { s.live.escorts[s.i] = ""; if (m) s.live.trip.fallen.add(s.i); }
      else if (!s.live.wreckAt) { s.live.cart = ""; this.drop(s.live); }
    }
    const v = CARAVAN.live && WAR_TROOPS.live ? warNow() : undefined;
    if (!v) { for (const l of [...this.live.values()]) this.drop(l); this.trips.clear(); return; }
    const owner = v.owner.map(clanOfIndex), key = owner.join();
    if (key !== this.linesKey) { this.linesKey = key; this.lines = caravanLines(owner); }
    // warm one unbuilt road per tick, so a board read or a hero arriving never pays for several at once
    const cold = this.lines.find((l) => !roadKnown(l.a, l.b));
    if (cold) caravanRoute(cold.a, cold.b);
    const heroes: TroopHero[] = [];
    for (const [, p] of this.h.heroes()) if (!p.dead && !underground(p.y)) heroes.push(p);
    // escort time: a sworn hero of the cart's clan beside it
    for (const l of this.live.values()) {
      const tr = l.trip, dt = Math.min(2000, Math.max(0, now - tr.lastTick));
      tr.lastTick = now;
      if (l.wreckAt || !l.cart) continue;
      for (const p of heroes) if (troopStance(tr.line.clan, p) === "ally" && Math.hypot(p.x - l.x, p.y - l.y) <= CARAVAN.escortPx) tr.heroMs.set(p.name, (tr.heroMs.get(p.name) ?? 0) + dt);
    }
    // arrivals (seen or not), and wrecks whose escorts are done
    for (const tr of [...this.trips.values()]) if (now >= tr.dep + tr.tripMs) { if (settled(tr.id)) this.trips.delete(tr.id); else this.arrive(tr, now); }
    for (const l of [...this.live.values()]) {
      if (l.wreckAt && now - l.wreckAt >= CARAVAN.scatterMs) this.drop(l);
      else if (!l.wreckAt && outcomes.has(l.trip.id)) this.drop(l); // raided or delivered in another room
    }
    // carts near heroes
    const want: { line: CaravanLine; r: CaravanRoute; id: string; dep: number; at: { x: number; y: number }; dist: number }[] = [];
    if (heroes.length) for (const line of this.lines) {
      const A = TERRITORIES[line.a], B = TERRITORIES[line.b], W = CARAVAN.wakeTiles + CARAVAN.marginTiles * 5;
      const x0 = Math.min(A.x, B.x) - W, y0 = Math.min(A.y, B.y) - W, x1 = Math.max(A.x + A.w, B.x + B.w) + W, y1 = Math.max(A.y + A.h, B.y + B.h) + W;
      if (!heroes.some((p) => p.x / TILE >= x0 && p.x / TILE <= x1 && p.y / TILE >= y0 && p.y / TILE <= y1)) continue; // no road work far from every hero
      const r = caravanRoute(line.a, line.b);
      if (!r) continue;
      for (const c of caravansOnRoad(r, now)) {
        if (outcomes.has(c.id)) continue;
        const at = routePos(r, c.d);
        let dist = Infinity;
        for (const p of heroes) dist = Math.min(dist, Math.hypot(p.x - at.x, p.y - at.y) / TILE);
        if (dist <= CARAVAN.wakeTiles) want.push({ line, r, id: c.id, dep: c.dep, at, dist });
      }
    }
    const running = (l: Live) => this.lines.some((x) => x.a === l.trip.line.a && x.b === l.trip.line.b && x.clan === l.trip.line.clan);
    for (const l of [...this.live.values()]) {
      if (l.wreckAt) continue;
      if (want.some((w) => w.id === l.trip.id)) l.lastSeen = now;
      if (now - l.lastSeen > CARAVAN.sleepMs || !running(l)) this.drop(l); // back on the road unseen (or its line stopped)
    }
    want.sort((a, b) => a.dist - b.dist);
    for (const w of want) {
      if (this.live.has(w.id)) continue;
      const tr = this.trips.get(w.id);
      const need = 1 + CARAVAN.escorts - (tr?.fallen.size ?? 0);
      if (this.live.size >= CARAVAN.maxLive || this.count + need > WAR_TROOPS.maxTroops) break;
      this.wake(w.line, w.r, w.id, w.dep, w.at, now);
    }
  }

  private wake(line: CaravanLine, r: CaravanRoute, id: string, dep: number, at: { x: number; y: number }, now: number) {
    let tr = this.trips.get(id);
    if (tr && tr.line.clan !== line.clan) { this.trips.delete(id); tr = undefined; } // the line changed hands mid-trip: a new cart
    const level = caravanLevel(line.b);
    if (!tr) { tr = { id, line, r, dep, tripMs: caravanTripMs(r), level, hp: caravanHp(line.clan, level), fallen: new Set(), heroMs: new Map(), lastTick: now }; this.trips.set(id, tr); }
    tr.lastTick = now;
    const cart = `wc${++this.seq}`, m = this.h.spawn(cart, level, at.x, at.y, troopWeapon(line.clan, false, true));
    if (!m) return;
    m.maxHp = caravanHp(line.clan, level); m.hp = Math.min(m.maxHp, tr.hp);
    const l: Live = { trip: tr, cart, escorts: [], fighters: [], lastSeen: now, x: at.x, y: at.y, wreckAt: 0, g: { leash: () => false, hunt: () => false } };
    l.g = { leash: (x, y) => Math.hypot(x - l.x, y - l.y) <= CARAVAN.leashPx, hunt: (x, y) => Math.hypot(x - l.x, y - l.y) <= CARAVAN.huntPx };
    this.live.set(id, l);
    this.mobs.set(cart, { live: l, i: -1 });
    for (let i = 0; i < CARAVAN.escorts; i++) {
      l.fighters.push(newFighter(line.clan, false));
      l.escorts.push("");
      if (tr.fallen.has(i)) continue; // fell earlier on this trip: no new man on the road
      const eid = `${cart}e${i}`, post = this.postOf(l, i, now), e = this.h.spawn(eid, level, post.x, post.y, troopWeapon(line.clan));
      if (!e) continue;
      l.escorts[i] = eid;
      this.mobs.set(eid, { live: l, i });
    }
  }

  /** Its monsters go (the cart keeps its wounds for the next wake); the trip stays known. */
  private drop(l: Live) {
    const cm = l.cart ? this.h.mob(l.cart) : undefined;
    if (cm && !cm.dead) l.trip.hp = cm.hp;
    for (const id of [l.cart, ...l.escorts]) if (id) { this.mobs.delete(id); this.h.remove(id); }
    l.cart = ""; l.escorts = l.escorts.map(() => "");
    this.live.delete(l.trip.id);
  }

  /** Distance along the road of a trip's cart now. */
  private along(tr: Trip, now: number) { return Math.max(0, Math.min(tr.r.len, ((now - tr.dep) * CARAVAN.speed) / 1000)); }

  /** Escort i's place: one ahead of the cart, two behind it on each side (round the wreck once it fell). */
  private postOf(l: Live, i: number, now: number): { x: number; y: number } {
    const C = CARAVAN;
    if (l.wreckAt) { const a = (i / C.escorts) * Math.PI * 2; return this.safe(l.x + Math.cos(a) * C.lateral * 2, l.y + Math.sin(a) * C.lateral * 2, l.x, l.y); }
    const d = this.along(l.trip, now), q = routePos(l.trip.r, i === 0 ? d + C.ahead : d - C.behind);
    if (i === 0) return { x: q.x, y: q.y };
    const side = i % 2 ? 1 : -1;
    return this.safe(q.x - q.dy * side * C.lateral, q.y + q.dx * side * C.lateral, q.x, q.y);
  }
  private safe(x: number, y: number, fx: number, fy: number) { return caravanOffLimits(x, y) || blocked(x, y) ? { x: fx, y: fy } : { x, y }; }

  /** A caravan monster's turn (TownRoom.updateMob, trooper branch). */
  step(m: TroopMob, id: string, dt: number, now: number) {
    const s = this.mobs.get(id);
    if (!s) { this.h.remove(id); return; }
    const l = s.live, tr = l.trip;
    if (s.i < 0) { // the cart rolls exactly where the clock puts it: no fighting, no stopping, the same in every room
      const q = routePos(tr.r, this.along(tr, now));
      m.x = m.homeX = l.x = q.x; m.y = m.homeY = l.y = q.y;
      m.moving = this.along(tr, now) < tr.r.len; m.target = ""; m.windUntil = 0; m.winding = false;
      m.dir = dirOf(q.dx, q.dy);
      return;
    }
    const f = l.fighters[s.i];
    if (this.soldiers.think(m, id, f, l.g, now)) return;
    const post = this.postOf(l, s.i, now);
    if (!f.near) { // nobody to see it: it keeps its place in the formation (cheap)
      if (!caravanOffLimits(post.x, post.y)) { m.x = m.homeX = post.x; m.y = m.homeY = post.y; }
      m.moving = !l.wreckAt; m.windUntil = 0; m.winding = false;
      return;
    }
    if (this.soldiers.fight(m, id, f, l.g, dt, now)) return;
    const d = Math.hypot(post.x - m.x, post.y - m.y);
    if (d > WAR_TROOPS.warpPx && !this.soldiers.seen(m, WAR_TROOPS.warpUnseenPx) && !caravanOffLimits(post.x, post.y)) { m.x = post.x; m.y = post.y; m.moving = false; return; }
    if (d < 2) { m.moving = false; const q = routePos(tr.r, this.along(tr, now)); m.dir = dirOf(q.dx, q.dy); return; }
    this.soldiers.walk(m, post.x, post.y, dt, d > WAR_TROOPS.slackPx ? this.soldiers.speedOf(m, f) : CARAVAN.speed * WAR_TROOPS.catchUp);
  }

  /** An enemy hero's blow on the cart or an escort: the idle escorts turn on them. */
  hit(heroId: string, id: string) {
    const s = this.mobs.get(id), p = this.h.hero(heroId);
    if (!s || !p || troopStance(s.live.trip.line.clan, p) !== "enemy") return;
    for (const eid of s.live.escorts) { const e = eid ? this.h.mob(eid) : undefined; if (e && !e.dead && !e.target) e.target = heroId; }
  }

  /** A hero left or died: no escort keeps chasing them. */
  forget(heroId: string) {
    for (const id of this.mobs.keys()) { const m = this.h.mob(id); if (m && m.target === heroId) m.target = ""; }
  }

  /**
   * A caravan monster died (TownRoom.mobDied). An escort's place stays empty for the rest of the trip. The cart: felled
   * by a rival-sworn hero it is raided (gold on the ground, valor for his clan where it fell if the war lets them push
   * there, renown for him and his sworn friends near, the Herald tells the room); by anything else it is just lost.
   */
  killed(m: TroopMob, id: string, killerId: string, now = Date.now()): CaravanOutcome | undefined {
    const s = this.mobs.get(id);
    if (!s) return undefined;
    this.mobs.delete(id);
    const l = s.live, tr = l.trip, clan = tr.line.clan;
    if (s.i >= 0) { l.escorts[s.i] = ""; tr.fallen.add(s.i); return undefined; }
    l.cart = ""; l.wreckAt = now; l.x = m.x; l.y = m.y; tr.hp = 0;
    const until = tr.dep + tr.tripMs + CARAVAN.everyMs;
    if (settled(tr.id)) return "lost"; // another room's copy of this cart was raided or delivered first: no second pay
    const p = this.h.hero(killerId);
    if (!p || troopStance(clan, p) !== "enemy") { outcomes.set(tr.id, { kind: "lost", until }); return "lost"; }
    outcomes.set(tr.id, { kind: "raided", until });
    this.h.writ?.(killerId, "raid", tr.line); // the killing blow counts for a raid writ, wherever the valor goes
    const raider = p.clan, st = warState(), land = caravanLand(tr.line, m.x, m.y); // (an unsworn hero with a grudge raids for nobody: shared/war/feuds.ts)
    this.h.dropGold(m.x, m.y, caravanGold(tr.level));
    const legal = !!st && !!raider && (st.owner[land.id] === raider || targetsOf(st, raider).includes(land.id));
    if (raider && legal && addValor(land.id, raider, CARAVAN.raidValor)) {
      for (const [hid, o] of this.h.heroes()) {
        if (o.dead || o.clan !== raider || o.level < STANDARD.minLevel || (hid !== killerId && Math.hypot(o.x - m.x, o.y - m.y) > CARAVAN.helperPx)) continue;
        this.renown(hid, o, CARAVAN.raidRenown);
      }
    }
    this.h.broadcast("sfx", { ev: "caravan_raided", id, x: Math.round(m.x), y: Math.round(m.y), by: raider, from: clan });
    this.h.broadcast("chat", { id: "", name: "Herald", text: `${p.name}${raider ? ` of the ${CLANS[raider].name}` : ""} raided a ${CLANS[clan].name} caravan near ${land.name}.` });
    return "raided";
  }

  /**
   * A trip reached its end (seen or not). Delivered when a sworn hero of its clan walked beside it for
   * CARAVAN.escortShare of the trip and the land it went to is still the clan's: valor there and renown for those
   * heroes. With no such hero nothing happens (the war's own supply is untouched).
   */
  private arrive(tr: Trip, now: number) {
    const l = this.live.get(tr.id), until = tr.dep + tr.tripMs + CARAVAN.everyMs, clan = tr.line.clan, b = tr.line.b;
    this.trips.delete(tr.id);
    if (l) this.drop(l);
    const need = CARAVAN.escortShare * tr.tripMs, names = new Set([...tr.heroMs].filter(([, ms]) => ms >= need).map(([n]) => n));
    const st = warState();
    // "lost" never blocks another room's copy of the same trip, whose escort may still deliver it
    if (!names.size || !st || st.owner[b] !== clan) { if (!outcomes.has(tr.id)) outcomes.set(tr.id, { kind: "lost", until }); return; }
    outcomes.set(tr.id, { kind: "delivered", until });
    if (!addValor(b, clan, CARAVAN.deliverValor)) return;
    const end = tr.r.pts[tr.r.pts.length - 1];
    for (const [hid, p] of this.h.heroes()) {
      if (!names.has(p.name) || p.clan !== clan) continue;
      this.renown(hid, p, CARAVAN.escortRenown);
      this.h.writ?.(hid, "escort", tr.line);
      this.h.tell(hid, `The caravan reached ${TERRITORIES[b].name}: the ${CLANS[clan].name} thank you.`);
    }
    this.h.broadcast("sfx", { ev: "caravan_delivered", x: Math.round(end.x), y: Math.round(end.y), clan, t: b });
  }

  private renown(hid: string, p: TroopHero, n: number) {
    const was = rankOf(p.renown);
    p.renown += n;
    const rank = rankOf(p.renown);
    if (rank > was) this.h.ranked(hid, RENOWN_RANKS[rank].name);
  }

  /** Tests: a caravan's live state, read-only. */
  _live(id: string) { return this.live.get(id); }
  _trip(id: string) { return this.trips.get(id); }
}

const dirOf = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
