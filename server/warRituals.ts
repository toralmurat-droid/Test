/**
 * Veiled Circle rituals (shared/war/rituals.ts has the site, the spot, the phase, the pause and the numbers). At noon,
 * the Veiled's doctrine phase, one ritual circle stands on the land ritualSite picks from the war state (fixed for the
 * whole day phase, for every room of the process). When a living hero above ground comes near it, the room fields three
 * acolytes on the circle: plain "veiled" troopers (every trooper gate holds: no XP or loot, only heroes hostile to the
 * Veiled hurt them), fighting within a leash of it with the troops' moves (WarTroops.think / fight / walk, like the
 * caravan escorts). The circle channels; active Veiled-sworn heroes in the ring speed it up, rivals pause it. Completed,
 * the Veiled earn valor in the land; the hero who kills the last acolyte breaks it for renown and valor. One outcome per
 * land per day phase, settled for every room of the process. TownRoom calls in through the narrow RitualHost below.
 */
import { TILE, type Dir } from "../shared/constants";
import { underground } from "../shared/dungeon";
import { isSafeZone } from "../shared/map";
import { blocked } from "../shared/movement";
import { noMobsAt } from "../shared/spawns";
import { inVillage } from "../shared/wrath";
import { CLANS, type ClanKey } from "../shared/war/clans";
import { RENOWN_RANKS, rankOf } from "../shared/war/renown";
import { channelStep, NO_RITUAL, pauseStep, RITUAL, ritualDay, ritualLine, ritualPay, ritualSite, ritualSpot, ritualTime, type RitualHold, type RitualState, type RitualView } from "../shared/war/rituals";
import { targetsOf, type WarState } from "../shared/war/rules";
import { STANDARD } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { parseTroop, troopLevel, troopStance, troopStats, troopWeapon, WAR_TROOPS } from "../shared/war/troops";
import { addValor, warNow, warState } from "./war";
import type { SiegeHero } from "./warSieges";
import { newFighter, type FightGround, type Fighter, type TroopMob, type WarTroops } from "./warTroops";

export interface RitualHost {
  /** A plain trooper monster with this id, level and weapon at (x, y) (the same as the troops'). */
  spawn(id: string, level: number, x: number, y: number, weapon: string): TroopMob | undefined;
  remove(id: string): void;
  mob(id: string): TroopMob | undefined;
  mobsInBox(x: number, y: number, r: number): Iterable<[string, TroopMob]>;
  heroes(): Iterable<[string, SiegeHero]>;
  hero(id: string): SiegeHero | undefined;
  broadcast(type: string, msg: unknown): void;
  /** Troopers the ritual may field now: WAR_TROOPS.maxTroops less the caravans, sieges and tunnels (they come first). */
  budget(): number;
  /** A hero reached a new renown rank. */
  ranked?(heroId: string, rank: string): void;
}
/** The soldier's moves the acolytes borrow from the troops. */
export type Soldiers = Pick<WarTroops, "think" | "fight" | "walk" | "speedOf" | "seen">;

/**
 * For every room of this process: the ritual land of each day phase (picked once, at the first look in that phase) and
 * the outcomes (key "day:t"): a ritual completed or broken in one room is over in all of them and pays only once.
 * Memory only, like the caravans' and tunnels' outcomes.
 */
const sites = new Map<number, number | undefined>();
const outcomes = new Map<string, { day: number; kind: "done" | "broken" }>();
/** Tests: forget every site and outcome. */
export function _resetRituals() { sites.clear(); outcomes.clear(); }
/** The ritual land of day phase `day` (picked from the war state the first time anyone asks in it). */
function siteOf(day: number, st: WarState): number | undefined {
  for (const d of sites.keys()) if (d !== day) sites.delete(d);
  if (!sites.has(day)) sites.set(day, ritualSite(st)?.t);
  return sites.get(day);
}

interface Slot { i: number; id: string; dead: boolean; hp: number }
interface Ritual {
  day: number; t: number; key: string; x: number; y: number; level: number;
  progress: number; hold: RitualHold; state: RitualState;
  live: boolean; lastHero: number; lastStep: number; lingerUntil: number;
  slots: Slot[]; g: FightGround;
}
interface Acolyte extends Fighter { r: Ritual; slot: Slot }

const offLimits = (x: number, y: number) => isSafeZone(x, y) || inVillage(x, y) || noMobsAt(x, y);
const the = (name: string) => name.replace(/^The /, "the ");

export class WarRituals {
  private r?: Ritual;
  private mobs = new Map<string, Acolyte>();
  /** Ritual valor paid per land and clan in the current war tick (RITUAL.maxValorPerTick). */
  private paid = new Map<string, { tick: number; n: number }>();
  private sent = ""; private sentProgress = -1; private sentAt = 0;
  private seq = 0;

  constructor(private h: RitualHost, private soldiers: Soldiers) {}

  /** Acolytes alive now (they count against WAR_TROOPS.maxTroops). */
  get count(): number { return this.mobs.size; }
  owns(id: string): boolean { return this.mobs.has(id); }

  /** The room's circle for the clients ("rituals" message): only while a hero is near (t -1 otherwise). */
  view(): RitualView {
    const r = this.r;
    if (!r || !r.live) return { ...NO_RITUAL };
    return { t: r.t, x: Math.round(r.x), y: Math.round(r.y), progress: Math.round(r.progress * 100) / 100, state: r.state };
  }

  /** Once a second (after the tunnels, before the patrols): follow the noon, wake the circle near a hero, field its acolytes, channel, settle. */
  tick(now = Date.now()) {
    for (const [id, a] of this.mobs) { // acolytes that vanished without a death (a test, a reset): back next wake, not dead
      const m = this.h.mob(id);
      if (m && !m.dead) continue;
      this.mobs.delete(id); a.slot.id = "";
    }
    const st = RITUAL.live && WAR_TROOPS.live && ritualTime(now) ? warState() : undefined, day = ritualDay(now);
    for (const [k, o] of outcomes) if (o.day !== day) outcomes.delete(k);
    const site = st ? siteOf(day, st) : undefined;
    if (this.r && (this.r.day !== day || this.r.t !== site)) this.end();
    if (!this.r && site !== undefined) {
      const at = ritualSpot(site);
      if (at) {
        const r: Ritual = { day, t: site, key: `${day}:${site}`, x: at.x, y: at.y, level: troopLevel(site), progress: 0, hold: { paused: false, since: now }, state: "channel",
          live: false, lastHero: 0, lastStep: now, lingerUntil: 0, slots: Array.from({ length: RITUAL.acolytes }, (_, i) => ({ i, id: "", dead: false, hp: 0 })), g: { leash: () => false, hunt: () => false } };
        r.g = { leash: (x, y) => Math.hypot(x - r.x, y - r.y) <= RITUAL.leashPx, hunt: () => false }; // wild monsters only when one strikes first
        this.r = r;
      }
    }
    const r = this.r;
    if (r) {
      const o = outcomes.get(r.key);
      if (o && (r.state === "channel" || r.state === "paused")) this.settled(r, o.kind, now); // over in another room
      // wake: a living hero above ground within wakeTiles; the circle lingers sleepMs after the last one left
      let near = false;
      for (const [, p] of this.h.heroes()) if (!p.dead && !underground(p.y) && Math.hypot(p.x - r.x, p.y - r.y) <= RITUAL.wakeTiles * TILE) { near = true; break; }
      if (near) {
        r.lastHero = now;
        if (!r.live) { r.live = true; r.lastStep = now; r.hold.lead = undefined; }
      } else if (r.live && now - r.lastHero > RITUAL.sleepMs) this.sleep(r);
      if (r.live) this.field(r, now);
    }
    this.tell(now);
  }

  /** The clients hear of the circle at once when its state changes, its progress at most every sendMs. */
  private tell(now: number, force = false) {
    const v = this.view(), s = `${v.t}:${v.x}:${v.y}:${v.state}`;
    if (!force && s === this.sent && (v.progress === this.sentProgress || now - this.sentAt < RITUAL.sendMs)) return;
    this.sent = s; this.sentProgress = v.progress; this.sentAt = now;
    this.h.broadcast("rituals", v);
  }

  /** The live circle: acolytes on their places (as the budget allows), the ring counted, the channel moved on. */
  private field(r: Ritual, now: number) {
    const room = Math.max(0, Math.min(RITUAL.acolytes, this.h.budget()));
    for (const sl of r.slots) if (sl.id && this.count > room) this.drop(sl); // fewer places now
    if (r.state === "broken") return;
    if (r.state === "done") { if (now >= r.lingerUntil) for (const sl of r.slots) this.drop(sl); return; }
    for (const sl of r.slots) {
      if (sl.id || sl.dead || this.count >= room) continue;
      const post = this.postOf(r, sl.i), id = `wr${++this.seq}`, m = this.h.spawn(id, r.level, post.x, post.y, troopWeapon(RITUAL.clan));
      if (!m) break;
      m.maxHp = troopStats(RITUAL.clan, r.level).hp; m.hp = sl.hp > 0 ? Math.min(m.maxHp, sl.hp) : m.maxHp;
      sl.id = id;
      this.mobs.set(id, { ...newFighter(RITUAL.clan, false), r, slot: sl });
    }
    // the ring: Veiled-sworn heroes help (and stand against rivals); rival troopers and hostile-sworn heroes pause it
    let helpers = 0, rivals = 0;
    for (const [, p] of this.h.heroes()) {
      if (p.dead || !p.clan || p.level < STANDARD.minLevel || now - p.lastAct > STANDARD.idleMs || underground(p.y) || Math.hypot(p.x - r.x, p.y - r.y) > RITUAL.ringPx) continue;
      const s = troopStance(RITUAL.clan, p);
      if (s === "ally") helpers++; else if (s === "enemy") rivals += RITUAL.heroWeight;
    }
    for (const [, o] of this.h.mobsInBox(r.x, r.y, RITUAL.ringPx)) {
      if (o.dead || o.kind !== "trooper" || Math.hypot(o.x - r.x, o.y - r.y) > RITUAL.ringPx) continue;
      const k = parseTroop(o.weapon);
      if (k && !k.object && k.clan !== RITUAL.clan) rivals++;
    }
    if (pauseStep(r.hold, rivals, helpers * RITUAL.heroWeight, now)) r.state = r.hold.paused ? "paused" : "channel";
    const dt = Math.min(2000, Math.max(0, now - r.lastStep)); // a stalled tick never jumps the channel
    r.lastStep = now;
    if (!r.slots.some((sl) => sl.id)) return; // no acolyte on the circle (no room for them): it waits
    r.progress = channelStep(r.progress, dt, helpers, r.hold.paused);
    if (r.progress >= 1) this.complete(r, now);
  }

  /** The circle closes: the Veiled earn ritualValor in the land (legal and capped), the acolytes stay a moment. */
  private complete(r: Ritual, now: number) {
    if (outcomes.has(r.key)) { this.settled(r, outcomes.get(r.key)!.kind, now); return; }
    outcomes.set(r.key, { day: r.day, kind: "done" });
    r.state = "done"; r.progress = 1; r.lingerUntil = now + RITUAL.lingerMs;
    this.h.broadcast("sfx", { ev: "ritual_done", x: Math.round(r.x), y: Math.round(r.y) });
    this.payClan(r.t, RITUAL.clan, RITUAL.ritualValor, warNow()?.tick ?? -1);
    const line = ritualLine(TERRITORIES[r.t].name, Math.floor(now / 1000));
    this.h.broadcast("chat", { id: "", name: line.name, text: line.text });
    this.tell(now, true);
  }

  /** Completed or broken in another room: this copy ends the same way, paying nothing. */
  private settled(r: Ritual, kind: "done" | "broken", now: number) {
    if (r.live) this.h.broadcast("sfx", { ev: kind === "done" ? "ritual_done" : "ritual_broken", x: Math.round(r.x), y: Math.round(r.y) });
    r.state = kind;
    if (kind === "done") { r.progress = 1; r.lingerUntil = now + RITUAL.lingerMs; } else for (const sl of r.slots) this.drop(sl);
  }

  /** Ritual valor `clan` already earned in land t this war tick. */
  private used(t: number, clan: ClanKey, tick: number): number {
    for (const [k, c] of this.paid) if (c.tick !== tick) this.paid.delete(k);
    return this.paid.get(`${t}:${clan}`)?.n ?? 0;
  }

  /** Valor for `clan` in land t from a ritual: capped per clan and land in a war tick, only where the war lets that clan fight. Returns what it paid. */
  private payClan(t: number, clan: ClanKey, v: number, tick: number): number {
    const st = warState(), used = this.used(t, clan, tick), n = ritualPay(v, used);
    if (n <= 0 || !st || !(st.owner[t] === clan || targetsOf(st, clan).includes(t))) return 0;
    if (!addValor(t, clan, n)) return 0;
    this.paid.set(`${t}:${clan}`, { tick, n: used + n });
    return n;
  }

  /** An acolyte goes without a death (keeping its wounds for the next wake). */
  private drop(sl: Slot) {
    if (!sl.id) return;
    const m = this.h.mob(sl.id);
    if (m && !m.dead) sl.hp = m.hp;
    this.mobs.delete(sl.id); this.h.remove(sl.id);
    sl.id = "";
  }
  /** No hero near: the acolytes go, the channel and the fallen are kept. */
  private sleep(r: Ritual) {
    for (const sl of r.slots) this.drop(sl);
    r.live = false; r.hold.lead = undefined;
  }
  /** Noon is over (or the site moved): the circle is forgotten. */
  private end() {
    if (!this.r) return;
    this.sleep(this.r);
    this.r = undefined;
  }

  /** An acolyte's place on the circle (the centre if that spot is a wall). */
  private postOf(r: Ritual, i: number): { x: number; y: number } {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / RITUAL.acolytes, x = r.x + Math.cos(a) * RITUAL.postPx, y = r.y + Math.sin(a) * RITUAL.postPx;
    return offLimits(x, y) || blocked(x, y) ? { x: r.x, y: r.y } : { x, y };
  }

  /** An acolyte's turn (TownRoom.updateMob, trooper branch): fight within the leash, else back to its place, facing the centre. */
  step(m: TroopMob, id: string, dt: number, now: number) {
    const a = this.mobs.get(id);
    if (!a) { this.h.remove(id); return; }
    const r = a.r, post = this.postOf(r, a.slot.i);
    if (this.soldiers.think(m, id, a, r.g, now)) return;
    if (!a.near) { // nobody to see it: it keeps its place (cheap)
      if (!offLimits(post.x, post.y)) { m.x = m.homeX = post.x; m.y = m.homeY = post.y; }
      m.moving = false; m.windUntil = 0; m.winding = false;
      return;
    }
    if (this.soldiers.fight(m, id, a, r.g, dt, now)) return;
    const d = Math.hypot(post.x - m.x, post.y - m.y);
    if (d > WAR_TROOPS.warpPx && !this.soldiers.seen(m, WAR_TROOPS.warpUnseenPx) && !offLimits(post.x, post.y)) { m.x = post.x; m.y = post.y; m.moving = false; return; }
    if (d < 2) { m.moving = false; m.dir = dirOf(r.x - m.x, r.y - m.y); return; } // chanting toward the centre
    this.soldiers.walk(m, post.x, post.y, dt, this.soldiers.speedOf(m, a));
  }

  /** An enemy hero's blow on an acolyte: the idle acolytes turn on them. */
  hit(heroId: string, id: string) {
    const a = this.mobs.get(id), p = this.h.hero(heroId);
    if (!a || !p || troopStance(RITUAL.clan, p) !== "enemy") return;
    for (const oid of this.mobs.keys()) { const m = this.h.mob(oid); if (m && !m.dead && !m.target) m.target = heroId; }
  }

  /** A hero left or died: no acolyte keeps chasing them. */
  forget(heroId: string) {
    for (const id of this.mobs.keys()) { const m = this.h.mob(id); if (m && m.target === heroId) m.target = ""; }
  }

  /**
   * An acolyte died (TownRoom.mobDied): it stays dead for this day phase. When the last of the three falls the ritual
   * breaks (once per land and day phase, in every room): `sfx` ritual_broken, and a killer hostile to the Veiled earns
   * disruptRenown and disruptValor for their clan in the land (legal and capped), with a Herald line (a summon's kill counts
 * for its owner). True when it was an acolyte.
   */
  killed(m: TroopMob, id: string, killerId: string, now = Date.now()): boolean {
    const a = this.mobs.get(id);
    if (!a) return false;
    this.mobs.delete(id);
    const r = a.r;
    a.slot.id = ""; a.slot.dead = true; a.slot.hp = 0;
    if ((r.state !== "channel" && r.state !== "paused") || !r.slots.every((sl) => sl.dead)) return true;
    if (outcomes.has(r.key)) { this.settled(r, outcomes.get(r.key)!.kind, now); this.tell(now, true); return true; }
    outcomes.set(r.key, { day: r.day, kind: "broken" });
    r.state = "broken";
    this.h.broadcast("sfx", { ev: "ritual_broken", x: Math.round(r.x), y: Math.round(r.y) });
    this.tell(now, true);
    if (!this.h.hero(killerId)) killerId = this.h.mob(killerId)?.owner || killerId; // a summon's kill counts for its hero
    const p = this.h.hero(killerId);
    if (!p || !p.clan || troopStance(RITUAL.clan, p) !== "enemy") return true; // (an unsworn hero with a grudge breaks it for nobody)
    this.payClan(r.t, p.clan, RITUAL.disruptValor, warNow()?.tick ?? -1);
    const was = rankOf(p.renown);
    p.renown += RITUAL.disruptRenown;
    const rank = rankOf(p.renown);
    if (rank > was) this.h.ranked?.(killerId, RENOWN_RANKS[rank].name);
    this.h.broadcast("chat", { id: "", name: "Herald", text: `${p.name} of ${the(CLANS[p.clan!].name)} broke a ritual of ${the(CLANS[RITUAL.clan].name)} at ${TERRITORIES[r.t].name}.` });
    return true;
  }

  /** Tests: the room's ritual, read-only. */
  get _ritual() { return this.r; }
}

const dirOf = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
