/**
 * Siege works (shared/war/works.ts has the numbers and the pure roll). While the live siege battle (server/warSieges.ts)
 * is led by the Ossuary Host, a bone ram (a "trooper" with weapon "host#", so every trooper gate holds: only rival-sworn
 * heroes hurt it, no XP or loot) rolls from the attackers' approach along the land's patrol loop to the Hold gate, with
 * SIEGE_WORKS.crew soldiers walking beside it (WarTroops.think / fight / walk, like the caravan escorts). Defenders in
 * its way stop it; at the gate it weighs for the attacker in the gate's count (extraWeight). A defender-sworn hero who
 * wrecks it earns his clan valor (through WarSieges' capped, legal pay) and himself renown. One ram per siege per war
 * tick. WarSieges owns this module and calls in through the narrow WorksHost below; the room never sees it.
 */
import { underground } from "../shared/dungeon";
import { isSafeZone } from "../shared/map";
import { blocked } from "../shared/movement";
import { noMobsAt } from "../shared/spawns";
import { inVillage } from "../shared/wrath";
import { CLANS, type ClanKey } from "../shared/war/clans";
import { patrolOf } from "../shared/war/patrols";
import { RENOWN_RANKS, rankOf } from "../shared/war/renown";
import type { Side } from "../shared/war/siege";
import { STANDARD } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { parseTroop, troopLevel, troopStance, troopWeapon, WAR_TROOPS } from "../shared/war/troops";
import { ramBlocked, ramHp, ramPos, ramSpeed, ramStep, SIEGE_WORKS, type RamView } from "../shared/war/works";
import { warNow } from "./war";
import { newFighter, type FightGround, type Fighter, type TroopHero, type TroopMob, type WarTroops } from "./warTroops";

export interface WorksHost {
  /** A plain trooper monster with this id, level and weapon at (x, y). */
  spawn(id: string, level: number, x: number, y: number, weapon: string): TroopMob | undefined;
  remove(id: string): void;
  mob(id: string): TroopMob | undefined;
  mobsInBox(x: number, y: number, r: number): Iterable<[string, TroopMob]>;
  heroes(): Iterable<[string, TroopHero]>;
  hero(id: string): TroopHero | undefined;
  broadcast(type: string, msg: unknown): void;
  /** A hero reached a new renown rank. */
  ranked?(heroId: string, rank: string): void;
}
/** The soldier's moves the crew borrow from the troops. */
export type Soldiers = Pick<WarTroops, "think" | "fight" | "walk" | "speedOf" | "seen">;
/** What the works read of a live siege. */
export interface WorksSiege { t: number; atk: ClanKey; def: ClanKey; approach: { arc: number }; fronts: { gate: boolean; arc: number }[] }
/** Valor for `clan` in land t, through the sieges' legal and capped pay: returns what was paid. */
export type WorksPay = (t: number, clan: ClanKey, v: number, tick: number) => number;

interface Ram {
  t: number; atk: ClanKey; def: ClanKey; start: number; goal: number; level: number; maxHp: number;
  /** Kept while the siege sleeps: distance along the loop, wounds, heading, at the gate, the crew that fell. */
  hp: number; d: number; dir: number; arrived: boolean; fallen: Set<number>;
  id: string; crew: string[]; fighters: Fighter[]; held: boolean; nextHeld: number; x: number; y: number;
  /** The war tick of its last wreck (-1 none): no new ram before the next. */
  wreckTick: number;
  /** What the clients last heard ("siege" view): state and HP quarter. */
  sent: string; g: FightGround;
}

const offLimits = (x: number, y: number) => isSafeZone(x, y) || inVillage(x, y) || noMobsAt(x, y);
const the = (name: string) => name.replace(/^The /, "the ");

export class WarWorks {
  private rams = new Map<number, Ram>();
  /** Mob id -> its ram and place (-1 the ram, 0.. a crewman). */
  private mobs = new Map<string, { r: Ram; i: number }>();
  private seq = 0;

  constructor(private h: WorksHost, private soldiers: Soldiers, private pay: WorksPay) {}

  /** Works monsters alive now (the ram and its crew: inside the siege's share). */
  get count(): number { return this.mobs.size; }
  owns(id: string): boolean { return this.mobs.has(id); }

  /** Places a siege keeps free for its works (inside SIEGE_BATTLE.maxSiegeTroops): the ram and its crew for a Host-led siege. */
  reserve(s: { atk: ClanKey }): number { return SIEGE_WORKS.live && s.atk === SIEGE_WORKS.clan ? 1 + SIEGE_WORKS.crew : 0; }

  /** Monsters that vanished without a death (a test, a reset): the ram keeps its wounds, a crewman's place stays empty. */
  sweep() {
    for (const [id, o] of this.mobs) {
      const m = this.h.mob(id);
      if (m && !m.dead) continue;
      this.mobs.delete(id);
      if (o.i >= 0) { o.r.crew[o.i] = ""; if (m) o.r.fallen.add(o.i); } else this.drop(o.r);
    }
  }

  /**
   * A live siege's works, once a second: its ram (with its crew) appears at the approach when none rolls, it was not
   * wrecked in this war tick and `room` (the siege's share) has the places. True when the clients should hear anew.
   */
  field(s: WorksSiege, tick: number, room: number): boolean {
    if (!this.reserve(s)) return false;
    let r = this.rams.get(s.t);
    if (r && (r.atk !== s.atk || r.def !== s.def)) { this.end(s.t); r = undefined; }
    const p = patrolOf(s.t), gate = s.fronts.find((f) => f.gate);
    if (!p || !gate) return false;
    if (!r) {
      const level = troopLevel(s.t), maxHp = ramHp(s.atk, level), g: FightGround = { leash: () => false, hunt: () => false };
      r = { t: s.t, atk: s.atk, def: s.def, start: s.approach.arc, goal: gate.arc, level, maxHp, hp: maxHp, d: s.approach.arc, dir: 0, arrived: false, fallen: new Set(),
        id: "", crew: [], fighters: [], held: false, nextHeld: 0, x: 0, y: 0, wreckTick: -1, sent: "", g };
      const rr = r;
      r.g = { leash: (x, y) => Math.hypot(x - rr.x, y - rr.y) <= SIEGE_WORKS.leashPx, hunt: () => false }; // wild monsters only when one strikes first
      this.rams.set(s.t, r);
    }
    if (r.id) { const k = this.stateKey(r); if (k !== r.sent) { r.sent = k; return true; } return false; }
    if (r.wreckTick === tick || room < this.reserve(s)) return false;
    // a ram for the siege (a wrecked one's crew leave first)
    for (const cid of r.crew) if (cid) { this.mobs.delete(cid); this.h.remove(cid); }
    if (r.hp <= 0) { r.hp = r.maxHp; r.d = r.start; r.arrived = false; r.fallen.clear(); }
    r.dir = ramStep(r.d, r.goal, p.len, 1, 0, false).dir || r.dir || 1;
    const q = ramPos(p, r.d), id = `wr${++this.seq}`, m = this.h.spawn(id, r.level, q.x, q.y, troopWeapon(r.atk, false, false, true));
    if (!m) return false;
    m.maxHp = r.maxHp; m.hp = Math.min(r.maxHp, r.hp);
    r.id = id; r.x = q.x; r.y = q.y; r.held = false; r.nextHeld = 0;
    this.mobs.set(id, { r, i: -1 });
    r.crew = []; r.fighters = [];
    for (let i = 0; i < SIEGE_WORKS.crew; i++) {
      r.fighters.push(newFighter(r.atk, false)); r.crew.push("");
      if (r.fallen.has(i)) continue; // fell beside this ram earlier: no new man
      const post = this.postOf(r, i), cid = `${id}c${i}`, c = this.h.spawn(cid, r.level, post.x, post.y, troopWeapon(r.atk));
      if (!c) continue;
      r.crew[i] = cid;
      this.mobs.set(cid, { r, i });
    }
    r.sent = this.stateKey(r);
    return true;
  }

  private state(r: Ram): RamView["state"] { return r.arrived ? "gate" : r.held ? "held" : "rolling"; }
  private stateKey(r: Ram) { const m = this.h.mob(r.id); return `${this.state(r)}:${m ? Math.ceil((m.hp / Math.max(1, m.maxHp)) * 4) : 0}`; }

  /** The ram of land t for the "siege" view, while one rolls. */
  view(t: number): RamView | undefined {
    const r = this.rams.get(t), m = r?.id ? this.h.mob(r.id) : undefined;
    if (!r || !m || m.dead) return undefined;
    return { x: Math.round(m.x), y: Math.round(m.y), hp: Math.max(0, Math.round(m.hp)), maxHp: m.maxHp, state: this.state(r) };
  }

  /** The gate front's extra weight for `side`: SIEGE_WORKS.ramWeight for the attacker while its ram stands at the gate. */
  extraWeight(t: number, front: { gate: boolean }, side: Side): number {
    const r = this.rams.get(t), m = r?.id ? this.h.mob(r.id) : undefined;
    return side === "atk" && front.gate && r && r.arrived && m && !m.dead ? SIEGE_WORKS.ramWeight : 0;
  }

  /** Its monsters go (the ram keeps its place and wounds for the siege's next wake). */
  private drop(r: Ram) {
    const m = r.id ? this.h.mob(r.id) : undefined;
    if (m && !m.dead) r.hp = m.hp;
    for (const id of [r.id, ...r.crew]) if (id) { this.mobs.delete(id); this.h.remove(id); }
    r.id = ""; r.crew = r.crew.map(() => "");
  }

  /** The siege sleeps (no hero near): the ram and crew go, the ram's state is kept. */
  sleep(t: number) { const r = this.rams.get(t); if (r) this.drop(r); }
  /** The siege is over (or its land changed hands): the works are forgotten. */
  end(t: number) { const r = this.rams.get(t); if (r) { this.drop(r); this.rams.delete(t); } }

  /** Crewman i's place: behind the ram on its loop, one on each side. */
  private postOf(r: Ram, i: number): { x: number; y: number } {
    const p = patrolOf(r.t)!, q = ramPos(p, r.d - r.dir * SIEGE_WORKS.crewBehind), side = i % 2 ? 1 : -1;
    const x = q.x - q.dy * side * SIEGE_WORKS.crewLateral, y = q.y + q.dx * side * SIEGE_WORKS.crewLateral;
    return offLimits(x, y) || blocked(x, y) ? { x: q.x, y: q.y } : { x, y };
  }

  /** Is a living defender trooper or a defender-sworn hero within blockPx of the ram? */
  private blockedAt(r: Ram, x: number, y: number): boolean {
    const B = SIEGE_WORKS.blockPx, near: { x: number; y: number }[] = [];
    for (const [, o] of this.h.mobsInBox(x, y, B)) {
      if (o.dead || o.kind !== "trooper") continue;
      const k = parseTroop(o.weapon);
      if (k && k.clan === r.def && !k.object) near.push(o);
    }
    for (const [, p] of this.h.heroes()) if (!p.dead && !underground(p.y) && troopStance(r.def, p) === "ally") near.push(p);
    return ramBlocked(x, y, near);
  }

  /** A works monster's turn (WarSieges.step): the ram rolls on unless held; the crew fight within a leash of it. */
  step(m: TroopMob, id: string, dt: number, now: number) {
    const o = this.mobs.get(id), p = o ? patrolOf(o.r.t) : undefined;
    if (!o || !p) { this.mobs.delete(id); this.h.remove(id); return; }
    const r = o.r;
    if (o.i < 0) { // the ram: no fighting; stun and knockback don't move it off its loop
      if (now >= r.nextHeld) { r.nextHeld = now + WAR_TROOPS.pickMs; r.held = !r.arrived && this.blockedAt(r, m.x, m.y); }
      const st = ramStep(r.d, r.goal, p.len, ramSpeed(now), Math.min(0.5, Math.max(0, dt)), r.held);
      r.d = st.d;
      if (st.dir) r.dir = st.dir;
      if (st.arrived && !r.arrived) {
        r.arrived = true;
        const q = ramPos(p, r.d);
        this.h.broadcast("sfx", { ev: "ram_at_gate", x: Math.round(q.x), y: Math.round(q.y) });
      }
      const q = ramPos(p, r.d);
      m.x = m.homeX = r.x = q.x; m.y = m.homeY = r.y = q.y;
      m.moving = st.dir !== 0; m.target = ""; m.windUntil = 0; m.winding = false;
      const fx = q.dx * r.dir, fy = q.dy * r.dir;
      m.dir = Math.abs(fx) > Math.abs(fy) ? (fx > 0 ? "right" : "left") : fy > 0 ? "down" : "up";
      return;
    }
    const f = r.fighters[o.i];
    if (this.soldiers.think(m, id, f, r.g, now)) return;
    const post = this.postOf(r, o.i);
    if (!f.near) {
      if (!offLimits(post.x, post.y)) { m.x = m.homeX = post.x; m.y = m.homeY = post.y; }
      m.moving = !r.arrived && !r.held; m.windUntil = 0; m.winding = false;
      return;
    }
    if (this.soldiers.fight(m, id, f, r.g, dt, now)) return;
    const d = Math.hypot(post.x - m.x, post.y - m.y);
    if (d > WAR_TROOPS.warpPx && !this.soldiers.seen(m, WAR_TROOPS.warpUnseenPx) && !offLimits(post.x, post.y)) { m.x = post.x; m.y = post.y; m.moving = false; return; }
    if (d < 2) { m.moving = false; return; }
    this.soldiers.walk(m, post.x, post.y, dt, d > WAR_TROOPS.slackPx ? this.soldiers.speedOf(m, f) : ramSpeed(now) * WAR_TROOPS.catchUp);
  }

  /** An enemy hero's blow on the ram or a crewman: the idle crew turn on them. */
  hit(heroId: string, id: string) {
    const o = this.mobs.get(id), p = this.h.hero(heroId);
    if (!o || !p || troopStance(o.r.atk, p) !== "enemy") return;
    for (const cid of o.r.crew) { const c = cid ? this.h.mob(cid) : undefined; if (c && !c.dead && !c.target) c.target = heroId; }
  }

  /** A hero left or died: no crewman keeps chasing them. */
  forget(heroId: string) {
    for (const id of this.mobs.keys()) { const m = this.h.mob(id); if (m && m.target === heroId) m.target = ""; }
  }

  /**
   * A works monster died. A crewman's place stays empty while that ram lives. The ram is wrecked: no new one this war
   * tick; felled by a defender-sworn hero, his clan earns wreckValor in the land (WarSieges' pay: legal and capped) and he
   * wreckRenown, and the Herald tells the room. True when it was the ram.
   */
  killed(m: TroopMob, id: string, killerId: string): boolean {
    const o = this.mobs.get(id);
    if (!o) return false;
    this.mobs.delete(id);
    const r = o.r;
    if (o.i >= 0) { r.crew[o.i] = ""; r.fallen.add(o.i); return false; }
    const tick = warNow()?.tick ?? 0, x = Math.round(m.x), y = Math.round(m.y);
    r.id = ""; r.hp = 0; r.wreckTick = tick; // (its crew fight on round the wreck until the next ram or the siege's sleep)
    this.h.broadcast("sfx", { ev: "ram_wrecked", x, y });
    const p = this.h.hero(killerId);
    if (!p || p.clan !== r.def || p.level < STANDARD.minLevel) return true;
    this.pay(r.t, r.def, SIEGE_WORKS.wreckValor, tick);
    const was = rankOf(p.renown);
    p.renown += SIEGE_WORKS.wreckRenown;
    const rank = rankOf(p.renown);
    if (rank > was) this.h.ranked?.(killerId, RENOWN_RANKS[rank].name);
    this.h.broadcast("chat", { id: "", name: "Herald", text: `${p.name} of ${the(CLANS[r.def].name)} wrecked the bone ram of ${the(CLANS[r.atk].name)} at ${TERRITORIES[r.t].name}.` });
    return true;
  }

  /** Tests: a land's ram, read-only. */
  _ram(t: number) { return this.rams.get(t); }
}
