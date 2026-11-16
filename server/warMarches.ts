/**
 * Marching columns (W4; shared/war/marches.ts has the rules and the clock, server/war.ts the columns of the interval and
 * their losses). Every column walks its war road on the wall clock whether anyone sees it or not; when a hero comes
 * within COLUMN.wakeTiles of one, the room gets it as real monsters: plain "trooper"s in its clan's colours (an officer
 * first, then the soldiers while the room has slots), two abreast round the clock's anchor, fighting within a leash of
 * it (WarTroops.think / fight / walk) but never starting on a wild monster. Every trooper gate holds (only heroes its
 * clan fights hurt them; no XP, loot or quest credit; kill valor through the room's usual path). Any fallen soldier
 * counts against the attack at the next tick (server/war.ts columnLost); a fight with heroes halts the column (at most
 * COLUMN.haltMaxMs a trip); a sworn hero of its clan who marches beside it for most of the trip joins it on arrival.
 * Also warms the war roads a path a second and sends them ("warroads") and the columns ("columns") to the clients.
 * TownRoom calls in at the same points as for the caravans, through the narrow MarchHost below.
 */
import { TILE, type Dir } from "../shared/constants";
import { underground } from "../shared/dungeon";
import { blocked } from "../shared/movement";
import { CLAN_KEYS, CLANS, type ClanKey } from "../shared/war/clans";
import { COLUMN, columnPos, columnTrip, type ColumnPos, type ColumnRow, type ColumnsMsg, type March } from "../shared/war/marches";
import { leaderLine, type WarMoment } from "../shared/war/heralds";
import { RENOWN_RANKS, rankOf } from "../shared/war/renown";
import { pathKnown, roadEntry, roadOffLimits, roadPairs, routePos, warPath, type RoadEntry, type WarPath } from "../shared/war/roads";
import { TERRITORIES } from "../shared/war/territories";
import { troopLevel, troopStance, troopStats, troopWeapon, WAR_TROOPS } from "../shared/war/troops";
import { addValor, inMeetBattle, columnHalt, columnHalting, columnJoined, columnLost, columnSeen, columnsVersion, marchCol, marchPath, meetingFor, warMarches, warMeetings, warNow } from "./war";
import type { Soldiers } from "./warCaravans";
import { newFighter, type FightGround, type Fighter, type TroopHero, type TroopMob } from "./warTroops";

export interface MarchHost {
  /** A plain trooper monster with this id, level and weapon at (x, y) (the same as the troops'). */
  spawn(id: string, level: number, x: number, y: number, weapon: string): TroopMob | undefined;
  remove(id: string): void;
  mob(id: string): TroopMob | undefined;
  heroes(): Iterable<[string, TroopHero]>;
  hero(id: string): TroopHero | undefined;
  broadcast(type: string, msg: unknown): void;
  /** A Herald line to one hero. */
  tell(heroId: string, text: string): void;
  ranked(heroId: string, rank: string): void;
  /** Trooper slots free for the columns now: WAR_TROOPS.maxTroops less every system before the patrols, these columns included. */
  budget(): number;
  /** A message to one hero's client ("columns" goes to each hero filtered: their clan's columns, others in scout range). */
  send(heroId: string, type: string, msg: unknown): void;
}

// ---- the war roads for the clients ("warroads"), shared by every room -------------------------------------------

let roadsAll: RoadEntry[] | undefined;
/** Every neighbour pair's way built so far, as "warroads" entries (roads.ts roadEntry); all of them once warm. */
export function warRoadsMsg(): RoadEntry[] {
  if (roadsAll) return roadsAll;
  const out: RoadEntry[] = [];
  let all = true;
  for (const p of roadPairs()) {
    if (!pathKnown(p.a, p.b)) { all = false; continue; }
    const e = roadEntry(p.a, p.b);
    if (e) out.push(e);
  }
  if (all) roadsAll = out;
  return out;
}
/** Builds one unbuilt way (the columns' first, then every neighbour pair's). False when every way is known. */
function warmOne(ms: readonly March[]): boolean {
  const m = ms.find((x) => !pathKnown(x.from, x.to));
  if (m) { warPath(m.from, m.to); return true; }
  const p = roadPairs().find((x) => !pathKnown(x.a, x.b));
  if (p) { warPath(p.a, p.b); return true; }
  return false;
}
/** Tests: forget the "warroads" message built so far. */
export function _resetRoadsMsg() { roadsAll = undefined; }

/** One column as this room has it: its men (index 0 the officer; "" fallen or not spawned) round the anchor. */
interface Live { m: March; p: WarPath; men: string[]; fighters: Fighter[]; lastSeen: number; g: FightGround; pos: ColumnPos; posAt: number; haltAt: number }

export class WarMarches {
  private live = new Map<string, Live>();
  /** Mob id -> its column and place in it. */
  private mobs = new Map<string, { live: Live; i: number }>();
  /** Column id -> hero name -> ms marched beside its anchor. */
  private beside = new Map<string, Map<string, number>>();
  private arrived = new Set<string>();
  private clashed = new Set<string>();
  /** Columns whose first fallen soldier the leader already answered. */
  private ambushed = new Set<string>();
  /** Per hero: what their last "columns" carried (version, clan, the ids they could see). */
  private sentTo = new Map<string, string>();
  /** The columns the Herald last announced (their ids), so a sack's news between ticks does not repeat it. */
  private announced = "";
  private sentRoads = !!roadsAll; // (a room opened after the roads were built: its joiners get them all on join)
  private lastTick = 0;
  private seq = 0;

  constructor(private h: MarchHost, private soldiers: Soldiers) {}

  /** Column troopers alive now (they count against WAR_TROOPS.maxTroops, after caravans, sieges, tunnels, rituals and manhunters). */
  get count(): number { return this.mobs.size; }
  /** Is this monster a soldier of one of this room's columns? */
  owns(id: string): boolean { return this.mobs.has(id); }

  /** Once a second: road warm-up, march time beside the columns, arrivals, meetings, halts, columns waking and sleeping. */
  tick(now = Date.now()) {
    for (const [id, s] of this.mobs) { const m = this.h.mob(id); if (!m || m.dead) { this.mobs.delete(id); s.live.men[s.i] = ""; } } // (gone without a death: a test, a reset)
    const ms = warMarches(), dt = Math.min(2000, Math.max(0, now - (this.lastTick || now)));
    this.lastTick = now;
    warmOne(ms);
    if (!this.sentRoads && warRoadsMsg() === roadsAll) { this.sentRoads = true; this.h.broadcast("warroads", roadsAll); } // every way known: the whole set once
    if (!warNow()) { for (const l of [...this.live.values()]) this.drop(l); return; }
    const live = COLUMN.live && WAR_TROOPS.live; // (off: the columns still march, join and arrive, but none is spawned)
    if (!live) for (const l of [...this.live.values()]) this.drop(l);
    for (const l of [...this.live.values()]) if (!ms.includes(l.m) || inMeetBattle(l.m, now)) this.drop(l); // a new interval: the old columns are done; a meeting battle (W5) takes their place while it runs
    for (const id of this.beside.keys()) if (!ms.some((m) => m.id === id)) this.beside.delete(id);
    for (const id of this.arrived) if (!ms.some((m) => m.id === id)) this.arrived.delete(id);
    const heroes: [string, TroopHero][] = [];
    for (const [hid, p] of this.h.heroes()) if (!p.dead && !underground(p.y)) heroes.push([hid, p]);
    const want: { m: March; p: WarPath; dist: number }[] = [];
    for (const m of ms) {
      const p = marchPath(m, false);
      if (!p) continue;
      const pos = this.posOf(m, p, now);
      if (pos.state >= 1 && pos.state <= 4) { // marching: sworn heroes of its clan beside the anchor
        let b = this.beside.get(m.id);
        for (const [, h] of heroes) if (h.clan === m.clan && troopStance(m.clan, h) === "ally" && Math.hypot(h.x - pos.x, h.y - pos.y) <= COLUMN.escortPx) {
          if (!b) this.beside.set(m.id, (b = new Map()));
          b.set(h.name, (b.get(h.name) ?? 0) + dt);
        }
      }
      if (pos.state === 5 && !this.arrived.has(m.id)) this.arrive(m, p);
      this.clash(m, now);
      const lv = this.live.get(m.id);
      if (pos.state === 4) { // into the waygate: it vanishes, and comes out of the far one
        if (lv) { this.h.broadcast("sfx", { ev: "column_gate", id: m.id, x: Math.round(pos.x), y: Math.round(pos.y), clan: m.clan }); this.drop(lv); }
        continue;
      }
      if (!live || p.kind === "track" || m.size - marchCol(m.id).fallen <= 0 || inMeetBattle(m, now)) continue; // (a track's column is simulated only; one in a meeting battle stands down)
      let dist = Infinity;
      for (const [, h] of heroes) dist = Math.min(dist, Math.hypot(h.x - pos.x, h.y - pos.y) / TILE);
      if (dist <= COLUMN.wakeTiles) want.push({ m, p, dist });
    }
    for (const l of [...this.live.values()]) {
      if (want.some((w) => w.m === l.m)) l.lastSeen = now;
      if (now - l.lastSeen > COLUMN.sleepMs) { this.drop(l); continue; } // back on the road unseen; its fallen stay fallen
      columnSeen(l.m.id, now, this);
      // fewer alive than this room fields (soldiers fell in another room): the last ones go
      let extra = l.men.filter(Boolean).length - (l.m.size - marchCol(l.m.id).fallen);
      for (let i = l.men.length - 1; i >= 0 && extra > 0; i--) if (l.men[i]) { this.mobs.delete(l.men[i]); this.h.remove(l.men[i]); l.men[i] = ""; extra--; }
      // a soldier fighting an enemy hero halts the column (while it marches)
      const st = this.posOf(l.m, l.p, now).state;
      const fighting = l.men.some((id) => { const mm = id ? this.h.mob(id) : undefined, hero = mm?.target ? this.h.hero(mm.target) : undefined; return !!hero && !hero.dead && troopStance(l.m.clan, hero) === "enemy"; });
      if (fighting && (st === 1 || st === 2)) { columnHalt(l.m.id, dt, now); l.haltAt = now; }
    }
    want.sort((a, b) => a.dist - b.dist);
    for (const w of want) {
      if (this.live.has(w.m.id)) continue;
      if (this.live.size >= COLUMN.maxLive || this.h.budget() < 1) break;
      this.wake(w.m, w.p, now);
    }
    this.send(now);
  }

  /**
   * "columns" to each hero whose view changed: a column changed (columnsVersion), or the set the hero may see did (their
   * clan, or they walked into or out of scout range of another clan's column). `all`: to every hero (a war tick).
   */
  private send(now: number, all = false) {
    const v = columnsVersion(), here = new Set<string>();
    for (const [hid, h] of this.h.heroes()) {
      here.add(hid);
      const ids = this.visible(h, now), key = `${v}|${h.clan ?? ""}|${ids.join()}`;
      if (!all && this.sentTo.get(hid) === key) continue;
      this.sentTo.set(hid, key);
      this.h.send(hid, "columns", this.view(now, h, ids));
    }
    for (const hid of this.sentTo.keys()) if (!here.has(hid)) this.sentTo.delete(hid);
  }
  /** Ids of the columns hero `h` may see: their own clan's, and any other whose anchor is within COLUMN.scoutTiles. */
  private visible(h: Pick<TroopHero, "clan" | "x" | "y">, now: number): string[] {
    const r = COLUMN.scoutTiles * TILE, out: string[] = [];
    for (const m of warMarches()) {
      if (m.clan === h.clan) { out.push(m.id); continue; }
      const p = marchPath(m, false);
      if (!p) continue;
      const q = this.posOf(m, p, now);
      if (Math.hypot(q.x - h.x, q.y - h.y) <= r) out.push(m.id);
    }
    return out;
  }

  /** Where column m is now; for a live one halted by a fight, the anchor stands between the second ticks too. */
  private posOf(m: March, p: WarPath, now: number): ColumnPos {
    const l = this.live.get(m.id);
    if (l && l.posAt === now) return l.pos;
    let halt = marchCol(m.id).halt;
    if (l && columnHalting(m.id, now) && l.haltAt) halt = Math.min(COLUMN.haltMaxMs, halt + Math.max(0, now - l.haltAt));
    const pos = columnPos(p, m.dep, now, halt, meetingFor(m.id)?.at);
    if (l) { l.pos = pos; l.posAt = now; }
    return pos;
  }

  private wake(m: March, p: WarPath, now: number) {
    const alive = m.size - marchCol(m.id).fallen;
    if (alive <= 0) return;
    const pos = this.posOf(m, p, now);
    const l: Live = { m, p, men: [], fighters: [], lastSeen: now, g: { leash: () => false, hunt: () => false }, pos, posAt: now, haltAt: 0 };
    l.g = { leash: (x, y) => Math.hypot(x - l.pos.x, y - l.pos.y) <= COLUMN.leashPx, hunt: () => false }; // (wild monsters only when they strike first)
    this.live.set(m.id, l);
    for (let i = 0; i < alive; i++) {
      const officer = i === 0;
      l.fighters.push(newFighter(m.clan, officer));
      l.men.push("");
      if (this.h.budget() < 1) continue; // no slot: this one marches on virtually (it cannot fall, and still counts as alive)
      const id = `wm${++this.seq}`, level = troopLevel(m.to, officer), at = this.postOf(l, i), mob = this.h.spawn(id, level, at.x, at.y, troopWeapon(m.clan, officer));
      if (!mob) continue;
      mob.hp = mob.maxHp = troopStats(m.clan, level, officer).hp;
      l.men[i] = id;
      this.mobs.set(id, { live: l, i });
    }
    columnSeen(m.id, now, this);
    this.h.broadcast("sfx", { ev: "column_march", id: m.id, x: Math.round(pos.x), y: Math.round(pos.y), clan: m.clan }); // drums: a column comes into sight
  }

  /** Its men go (the fallen stay fallen in server/war.ts); the column marches on virtually. */
  private drop(l: Live) {
    for (const id of l.men) if (id) { this.mobs.delete(id); this.h.remove(id); }
    l.men = l.men.map(() => "");
    this.live.delete(l.m.id);
  }

  /** Man i's place: the officer at the anchor, the soldiers two abreast behind him along the road. */
  private postOf(l: Live, i: number): { x: number; y: number } {
    const leg = l.p.legs[l.pos.leg], C = COLUMN;
    if (i === 0) return { x: l.pos.x, y: l.pos.y };
    const q = routePos(leg, l.pos.d - ((i + 1) >> 1) * C.rankGap), side = i % 2 ? 1 : -1;
    const x = q.x - q.dy * side * C.lateral, y = q.y + q.dx * side * C.lateral;
    return roadOffLimits(x, y) || blocked(x, y) ? { x: q.x, y: q.y } : { x, y };
  }

  /** A column soldier's turn (TownRoom.updateMob, trooper branch): fight within the leash, else keep its place. */
  step(m: TroopMob, id: string, dt: number, now: number) {
    const s = this.mobs.get(id);
    if (!s) { this.h.remove(id); return; }
    const l = s.live, f = l.fighters[s.i];
    this.posOf(l.m, l.p, now);
    if (this.soldiers.think(m, id, f, l.g, now)) return;
    const post = this.postOf(l, s.i), marching = l.pos.state === 1;
    if (!f.near) { // nobody to see it: it keeps its place in the column (cheap)
      if (!roadOffLimits(post.x, post.y)) { m.x = m.homeX = post.x; m.y = m.homeY = post.y; }
      m.moving = marching; m.windUntil = 0; m.winding = false; m.dir = dirOf(l.pos.dx, l.pos.dy);
      return;
    }
    if (this.soldiers.fight(m, id, f, l.g, dt, now)) return;
    const d = Math.hypot(post.x - m.x, post.y - m.y);
    if (d > WAR_TROOPS.warpPx && !this.soldiers.seen(m, WAR_TROOPS.warpUnseenPx) && !roadOffLimits(post.x, post.y)) { m.x = post.x; m.y = post.y; m.moving = false; return; }
    if (d < 2) { m.moving = false; m.dir = dirOf(l.pos.dx, l.pos.dy); return; }
    this.soldiers.walk(m, post.x, post.y, dt, d > WAR_TROOPS.slackPx ? this.soldiers.speedOf(m, f) : columnTrip(l.p).speed * WAR_TROOPS.catchUp);
  }

  /** An enemy hero's blow on a column soldier: the idle ones turn on them. */
  hit(heroId: string, id: string) {
    const s = this.mobs.get(id), p = this.h.hero(heroId);
    if (!s || !p || troopStance(s.live.m.clan, p) !== "enemy") return;
    for (const mid of s.live.men) { const e = mid ? this.h.mob(mid) : undefined; if (e && !e.dead && !e.target) e.target = heroId; }
  }

  /** A hero left or died: no column soldier keeps chasing them. */
  forget(heroId: string) {
    for (const id of this.mobs.keys()) { const m = this.h.mob(id); if (m && m.target === heroId) m.target = ""; }
  }

  /**
   * A column soldier died (TownRoom.mobDied), whatever killed it: one man fewer reaches the target (server/war.ts
   * columnLost). Kill valor and renown come from the room's usual trooper path (WarTroops.killValor, capped per tick).
   */
  killed(_m: TroopMob, id: string, _killerId: string, now = Date.now()): boolean {
    const s = this.mobs.get(id);
    if (!s) return false;
    this.mobs.delete(id);
    s.live.men[s.i] = "";
    const m = s.live.m;
    if (columnLost(m.id, 1, now) && !this.ambushed.has(m.id)) {
      this.ambushed.add(m.id);
      if (this.ambushed.size > 64) this.ambushed.delete(this.ambushed.values().next().value!);
      this.say(m.clan, "ambushed", m, this.defender(m));
    }
    return true;
  }

  /** Arrival at the camp: the sworn heroes who marched beside it for COLUMN.joinShare of the trip joined it (once a war tick each). */
  private arrive(m: March, p: WarPath) {
    this.arrived.add(m.id);
    const need = COLUMN.joinShare * columnTrip(p).moveMs, b = this.beside.get(m.id);
    if (!b) return;
    const land = TERRITORIES[m.to].name;
    for (const [hid, h] of this.h.heroes()) {
      if (h.clan !== m.clan || (b.get(h.name) ?? 0) < need || !columnJoined(m.id, h.name)) continue;
      addValor(m.to, m.clan, COLUMN.joinValor); // (the war counts it if the clan may still push there)
      const was = rankOf(h.renown);
      h.renown += COLUMN.joinRenown;
      const rank = rankOf(h.renown);
      if (rank > was) this.h.ranked(hid, RENOWN_RANKS[rank].name);
      this.h.tell(hid, `You marched with the ${CLANS[m.clan].name} column to ${land}: +${COLUMN.joinRenown} renown, and your valor counts there.`);
    }
  }

  /** The clan holding the land a column marches on (the other side of its leader's words). */
  private defender(m: March): ClanKey {
    const d = CLAN_KEYS[(warNow()?.owner ?? [])[m.to]];
    return d && d !== m.clan ? d : CLAN_KEYS[(CLAN_KEYS.indexOf(m.clan) + 1) % CLAN_KEYS.length];
  }
  /** The leader of `k` speaks in the room's chat about a column (march, ambushed, clash), as for a sack (server/war.ts attachWar). */
  private say(k: ClanKey, moment: WarMoment, m: March, foe: ClanKey) {
    const l = leaderLine(k, moment, TERRITORIES[m.to].name, foe, warNow()?.tick ?? 0);
    this.h.broadcast("chat", { id: "", name: l.name, text: l.text });
  }

  /** A meeting's moment came: the clash sound where it is and a Herald line, once per room. */
  private clash(m: March, now: number) {
    const mt = meetingFor(m.id);
    if (!mt || mt.a !== m.id || now < mt.at || now - mt.at >= COLUMN.clashMs || this.clashed.has(mt.a + mt.b)) return;
    this.clashed.add(mt.a + mt.b);
    if (this.clashed.size > 64) this.clashed.delete(this.clashed.values().next().value!);
    const o = warMarches().find((x) => x.id === mt.b);
    if (!o) return;
    this.h.broadcast("sfx", { ev: "column_clash", x: mt.x, y: mt.y, a: m.clan, b: o.clan });
    this.h.broadcast("chat", { id: "", name: "Herald", text: `The ${CLANS[m.clan].name} and the ${CLANS[o.clan].name} columns clash on the road between ${TERRITORIES[m.from].name} and ${TERRITORIES[m.to].name}!` });
    this.say(m.clan, "clash", m, o.clan);
    this.say(o.clan, "clash", m, m.clan);
  }

  /**
   * War news (after every war tick, and a sack between ticks): the columns to the room; for a new set of columns, a
   * public line and a word to the sworn heroes concerned.
   */
  onWar() {
    const ms = warMarches(), now = Date.now(), key = ms.map((m) => m.id).join();
    this.send(now, true);
    if (!ms.length || key === this.announced) return;
    this.announced = key;
    const on = (m: March) => `the ${CLANS[m.clan].name} on ${TERRITORIES[m.to].name}`, few = ms.slice(0, 3).map(on);
    const list = few.length > 1 ? `${few.slice(0, -1).join(", ")} and ${few[few.length - 1]}` : few[0];
    this.h.broadcast("chat", { id: "", name: "Herald", text: `Columns march: ${list}${ms.length > 3 ? `, and ${ms.length - 3} more` : ""}.` });
    for (const m of ms.slice(0, 3)) this.say(m.clan, "march", m, this.defender(m));
    const owner = warNow()?.owner ?? [];
    for (const [hid, h] of this.h.heroes()) {
      if (!h.clan) continue;
      const mine = ms.find((m) => m.clan === h.clan), foe = ms.find((m) => m.clan !== h.clan && CLAN_KEYS[owner[m.to]] === h.clan);
      if (foe) this.h.tell(hid, `A ${CLANS[foe.clan].name} column marches on ${TERRITORIES[foe.to].name}, your clan's land: cut it down on the road.`);
      else if (mine) this.h.tell(hid, `Your clan's column marches from ${TERRITORIES[mine.from].name} on ${TERRITORIES[mine.to].name}: march beside it for renown.`);
    }
  }

  /** A hero joined: the war roads built so far and the columns they may see. */
  join(client: { sessionId: string; send(type: string, msg: unknown): void }, hero: Pick<TroopHero, "clan" | "x" | "y">, now = Date.now()) {
    client.send("warroads", warRoadsMsg());
    const ids = this.visible(hero, now);
    this.sentTo.set(client.sessionId, `${columnsVersion()}|${hero.clan ?? ""}|${ids.join()}`);
    client.send("columns", this.view(now, hero, ids));
  }

  /**
   * The "columns" message (shared/war/marches.ts ColumnsMsg) with the server time; for hero `h` only the columns they may
   * see (`ids`, default visible()) and the meetings of those. Without a hero: every column (tests, tools).
   */
  view(now = Date.now(), h?: Pick<TroopHero, "clan" | "x" | "y">, ids = h ? this.visible(h, now) : undefined): ColumnsMsg {
    const show = ids && new Set(ids);
    const cols: ColumnRow[] = warMarches().filter((m) => !show || show.has(m.id)).map((m) => {
      const c = marchCol(m.id), p = marchPath(m, false);
      const state = columnHalting(m.id, now) ? 2 : p ? this.posOf(m, p, now).state : now < m.dep ? 0 : 1;
      return [m.id, CLAN_KEYS.indexOf(m.clan), m.from, m.to, m.dep, m.size, c.fallen, Math.round(c.halt), state];
    });
    const meets = warMeetings().filter((x) => !show || show.has(x.a) || show.has(x.b));
    return { tick: warNow()?.tick ?? 0, now, cols, ...(meets.length ? { meets: meets.map((x) => [x.a, x.b, x.x, x.y, x.at] as [string, string, number, number, number]) } : {}) };
  }

  /** Tests: a column's live state, read-only. */
  _live(id: string) { return this.live.get(id); }
}

const dirOf = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
