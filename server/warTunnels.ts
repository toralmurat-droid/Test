/**
 * Hide-Kin tunnels (shared/war/tunnels.ts has the strikes, the mouth spots and the numbers). Every attack of the last war
 * tick's orders that goes through a tunnel (tunnelStrikes) has a mouth at its target land's edge. When a living hero
 * above ground comes near one, the room gets it as real monsters: the mouth (a "trooper" with weapon "hidekin~", so every
 * trooper gate holds: only heroes hostile to the Hide-Kin hurt it, no XP or loot) and waves of Hide-Kin soldiers coming
 * out of it, fighting within a leash of it (WarTroops.think / fight / walk, like the caravan escorts). A hostile hero
 * who collapses it earns valor and renown, and it stays shut until the next war tick in every room of the process;
 * Hide-Kin heroes standing by it earn their clan valor in the land. One live tunnel per room (the nearest a hero).
 * TownRoom calls in through the narrow TunnelHost below.
 */
import { TILE, type Dir } from "../shared/constants";
import { underground } from "../shared/dungeon";
import { isSafeZone } from "../shared/map";
import { blocked } from "../shared/movement";
import { noMobsAt } from "../shared/spawns";
import { inVillage } from "../shared/wrath";
import { CLANS, type ClanKey } from "../shared/war/clans";
import { RENOWN_RANKS, rankOf } from "../shared/war/renown";
import { targetsOf, type Orders } from "../shared/war/rules";
import { STANDARD } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { troopLevel, troopStance, troopStats, troopWeapon, WAR_TROOPS } from "../shared/war/troops";
import { mouthHp, TUNNEL, tunnelMouth, tunnelStrikes, type TunnelStrike, type TunnelsView } from "../shared/war/tunnels";
import { addValor, warNow, warOrders, warState } from "./war";
import type { SiegeHero } from "./warSieges";
import { newFighter, type FightGround, type Fighter, type TroopHero, type TroopMob, type WarTroops } from "./warTroops";

export interface TunnelHost {
  /** A plain trooper monster with this id, level and weapon at (x, y) (the same as the troops'). */
  spawn(id: string, level: number, x: number, y: number, weapon: string): TroopMob | undefined;
  remove(id: string): void;
  mob(id: string): TroopMob | undefined;
  heroes(): Iterable<[string, SiegeHero]>;
  hero(id: string): TroopHero | undefined;
  broadcast(type: string, msg: unknown): void;
  /** Troopers the tunnels may field now: WAR_TROOPS.maxTroops less what the caravans and the sieges hold (they come first). */
  budget(): number;
  /** A hero reached a new renown rank. */
  ranked?(heroId: string, rank: string): void;
}
/** The soldier's moves the tunnel soldiers borrow from the troops. */
export type Soldiers = Pick<WarTroops, "think" | "fight" | "walk" | "speedOf" | "seen">;

/**
 * Mouths collapsed in the current war tick, for every room of this process (key "tick:t"): a mouth collapsed in one room
 * is shut in all of them and pays only once. Memory only, like the caravans' outcomes.
 */
const collapsed = new Map<string, number>();
const keyOf = (tick: number, t: number) => `${tick}:${t}`;
/** Tests: forget every collapse. */
export function _resetTunnels() { collapsed.clear(); }

interface Tunnel {
  t: number; from: number; clan: ClanKey; x: number; y: number; level: number; maxHp: number;
  /** Kept while it sleeps: the mouth's wounds. */
  hp: number;
  live: boolean; lastHero: number; mouth: string; soldiers: Set<string>;
  /** The war tick it was collapsed in (-1 open), and when its soldiers go back down. */
  shutTick: number; scatterUntil: number;
  nextWave: number; nextPay: number; held: boolean; g: FightGround;
}
interface Soldier { tn: Tunnel; f?: Fighter; i: number }

const offLimits = (x: number, y: number) => isSafeZone(x, y) || inVillage(x, y) || noMobsAt(x, y);
const the = (name: string) => name.replace(/^The /, "the ");

export class WarTunnels {
  private tunnels = new Map<number, Tunnel>();
  /** Mob id -> its tunnel (no `f`: the mouth). */
  private mobs = new Map<string, Soldier>();
  /** Tunnel valor paid per land and clan in the current war tick (TUNNEL.maxValorPerTick). */
  private paid = new Map<string, { tick: number; n: number }>();
  private strikesKey: { tick: number; orders?: Partial<Record<ClanKey, Orders>> } = { tick: NaN };
  private strikes: TunnelStrike[] = [];
  private sent = "";
  private seq = 0;

  constructor(private h: TunnelHost, private soldiers: Soldiers) {}

  /** Tunnel monsters alive now, the mouth included (they count against WAR_TROOPS.maxTroops). */
  get count(): number { return this.mobs.size; }
  owns(id: string): boolean { return this.mobs.has(id); }

  /** Every ordered tunnel for the clients ("tunnels" message). */
  view(): TunnelsView {
    return { mouths: [...this.tunnels.values()].map((tn) => ({ t: tn.t, x: Math.round(tn.x), y: Math.round(tn.y), state: tn.shutTick >= 0 ? "shut" as const : tn.mouth ? "open" as const : "dormant" as const })) };
  }

  /** Once a second (after the sieges, before the patrols): follow the orders, wake the nearest mouth, field its waves, pay its holders. */
  tick(now = Date.now()) {
    for (const [id, o] of this.mobs) { // monsters that vanished without a death (a test, a reset)
      const m = this.h.mob(id);
      if (m && !m.dead) continue;
      this.mobs.delete(id);
      if (o.f) o.tn.soldiers.delete(id); else { o.tn.mouth = ""; }
    }
    const v = TUNNEL.live && WAR_TROOPS.live ? warNow() : undefined, st = v ? warState() : undefined, tick = v?.tick ?? -1;
    for (const [k, at] of collapsed) if (at !== tick && v) collapsed.delete(k);
    const orders = warOrders();
    if (st && (this.strikesKey.tick !== tick || this.strikesKey.orders !== orders)) { this.strikesKey = { tick, orders }; this.strikes = tunnelStrikes(st, orders); }
    const strikes = st ? this.strikes : [];
    for (const tn of [...this.tunnels.values()]) {
      const s = strikes.find((x) => x.t === tn.t);
      if (!s || s.from !== tn.from || s.clan !== tn.clan) this.end(tn);
    }
    for (const s of strikes) if (!this.tunnels.has(s.t)) {
      const at = tunnelMouth(s.t, s.from);
      if (!at) continue;
      const level = troopLevel(s.t), maxHp = mouthHp(s.clan, level);
      const tn: Tunnel = { t: s.t, from: s.from, clan: s.clan, x: at.x, y: at.y, level, maxHp, hp: maxHp, live: false, lastHero: 0, mouth: "", soldiers: new Set(),
        shutTick: -1, scatterUntil: 0, nextWave: 0, nextPay: 0, held: false, g: { leash: () => false, hunt: () => false } };
      tn.g = { leash: (x, y) => Math.hypot(x - tn.x, y - tn.y) <= TUNNEL.leashPx, hunt: () => false }; // wild monsters only when one strikes first
      this.tunnels.set(s.t, tn);
    }
    for (const tn of this.tunnels.values()) {
      if (tn.shutTick >= 0 && tn.shutTick !== tick) { tn.shutTick = -1; tn.hp = tn.maxHp; } // a new war tick: it opens again, whole
      if (tn.shutTick < 0 && collapsed.has(keyOf(tick, tn.t))) this.shut(tn, now, tick, true); // collapsed in another room
    }
    // the one live tunnel: the nearest a hero (above ground, alive) within wakeTiles of its mouth; the last one lingers sleepMs
    let near: Tunnel | undefined, nd = Infinity;
    for (const [, p] of this.h.heroes()) {
      if (p.dead || underground(p.y)) continue;
      for (const tn of this.tunnels.values()) {
        const d = Math.hypot(p.x - tn.x, p.y - tn.y) / TILE;
        if (d <= TUNNEL.wakeTiles && d < nd) { nd = d; near = tn; }
      }
    }
    for (const tn of this.tunnels.values()) if (tn.live && tn !== near && (near || now - tn.lastHero > TUNNEL.sleepMs)) this.sleep(tn);
    if (near) {
      near.lastHero = now;
      if (!near.live) { near.live = true; near.nextWave = 0; near.nextPay = now + TUNNEL.valorEveryMs; near.held = false; }
    }
    for (const tn of this.tunnels.values()) if (tn.live) this.field(tn, now, tick);
    this.tell();
  }

  /** The clients hear of the mouths when something changed. */
  private tell() {
    const v = this.view(), s = JSON.stringify(v);
    if (s !== this.sent) { this.sent = s; this.h.broadcast("tunnels", v); }
  }

  /** The live tunnel: the mouth opens (if not shut), a wave comes out every waveMs up to the room's share, its holders earn valor. */
  private field(tn: Tunnel, now: number, tick: number) {
    const room = Math.max(0, Math.min(TUNNEL.maxTunnelTroops, this.h.budget()));
    for (const id of [...tn.soldiers]) { if (this.count <= room) break; this.dropOne(id); } // fewer places now: soldiers go first
    if (this.count > room && tn.mouth) this.dropMouth(tn);
    if (tn.shutTick >= 0) { if (now >= tn.scatterUntil) for (const id of [...tn.soldiers]) this.dropOne(id); return; }
    if (!tn.mouth) {
      if (room < 1) return;
      const id = `wn${++this.seq}`, m = this.h.spawn(id, tn.level, tn.x, tn.y, troopWeapon(tn.clan, false, false, false, true));
      if (!m) return;
      m.maxHp = tn.maxHp; m.hp = Math.max(1, Math.min(tn.maxHp, tn.hp)); m.dir = "down";
      tn.mouth = id;
      this.mobs.set(id, { tn, i: -1 });
      tn.nextWave = now;
      this.h.broadcast("sfx", { ev: "tunnel_open", x: Math.round(tn.x), y: Math.round(tn.y) });
    }
    if (now >= tn.nextWave) {
      tn.nextWave = now + TUNNEL.waveMs;
      for (let n = 0; n < TUNNEL.perWave && this.count < room; n++) {
        const id = `${tn.mouth}s${++this.seq}`, m = this.h.spawn(id, tn.level, tn.x, tn.y, troopWeapon(tn.clan));
        if (!m) break;
        m.hp = m.maxHp = troopStats(tn.clan, tn.level).hp;
        tn.soldiers.add(id);
        this.mobs.set(id, { tn, f: newFighter(tn.clan, false), i: this.seq });
      }
    }
    // holding: an active Hide-Kin-sworn hero by the standing mouth
    const mm = this.h.mob(tn.mouth);
    if (mm && !mm.dead) for (const [, p] of this.h.heroes()) {
      if (p.dead || p.clan !== tn.clan || p.level < STANDARD.minLevel || now - p.lastAct > STANDARD.idleMs || underground(p.y)) continue;
      if (Math.hypot(p.x - tn.x, p.y - tn.y) <= TUNNEL.holdPx) { tn.held = true; break; }
    }
    if (now >= tn.nextPay) {
      tn.nextPay = now + TUNNEL.valorEveryMs;
      if (tn.held) this.payClan(tn.t, tn.clan, TUNNEL.mouthValor, tick);
      tn.held = false;
    }
  }

  /** Tunnel valor `clan` already earned in land t this war tick. */
  private used(t: number, clan: ClanKey, tick: number): number {
    for (const [k, c] of this.paid) if (c.tick !== tick) this.paid.delete(k);
    return this.paid.get(`${t}:${clan}`)?.n ?? 0;
  }

  /** Valor for `clan` in land t from a tunnel: up to maxValorPerTick per clan and land in a war tick, only where the war lets that clan fight. Returns what it paid. */
  private payClan(t: number, clan: ClanKey, v: number, tick: number): number {
    const st = warState(), used = this.used(t, clan, tick), n = Math.min(v, TUNNEL.maxValorPerTick - used);
    if (n <= 0 || !st || !(st.owner[t] === clan || targetsOf(st, clan).includes(t))) return 0;
    if (!addValor(t, clan, n)) return 0;
    this.paid.set(`${t}:${clan}`, { tick, n: used + n });
    return n;
  }

  private dropOne(id: string) { const o = this.mobs.get(id); if (o) o.tn.soldiers.delete(id); this.mobs.delete(id); this.h.remove(id); }
  /** The mouth goes (it keeps its wounds for the next wake). */
  private dropMouth(tn: Tunnel) {
    const m = tn.mouth ? this.h.mob(tn.mouth) : undefined;
    if (m && !m.dead) tn.hp = m.hp;
    if (tn.mouth) { this.mobs.delete(tn.mouth); this.h.remove(tn.mouth); }
    tn.mouth = "";
  }
  /** No hero near: the mouth and its soldiers go back down, the mouth keeps its wounds. */
  private sleep(tn: Tunnel) {
    this.dropMouth(tn);
    for (const id of [...tn.soldiers]) this.dropOne(id);
    tn.live = false;
  }
  /** The tunnel is no longer ordered (or starts elsewhere now): it is forgotten. */
  private end(tn: Tunnel) { this.sleep(tn); this.tunnels.delete(tn.t); }

  /** Collapsed: shut until the next war tick, whole again then; its soldiers fight on scatterMs. `elsewhere`: in another room (this copy just falls in). */
  private shut(tn: Tunnel, now: number, tick: number, elsewhere = false) {
    if (elsewhere && tn.mouth) {
      const m = this.h.mob(tn.mouth);
      if (m && !m.dead) this.h.broadcast("sfx", { ev: "tunnel_collapse", x: Math.round(tn.x), y: Math.round(tn.y) });
      this.mobs.delete(tn.mouth); this.h.remove(tn.mouth);
    }
    tn.mouth = ""; tn.shutTick = tick; tn.scatterUntil = now + TUNNEL.scatterMs; tn.hp = tn.maxHp;
  }

  /** A soldier's place by the mouth: a ring round it (the mouth itself if that spot is a wall). */
  private postOf(tn: Tunnel, i: number): { x: number; y: number } {
    const a = (i * 2.399) % (Math.PI * 2), x = tn.x + Math.cos(a) * TUNNEL.ringPx, y = tn.y + Math.sin(a) * TUNNEL.ringPx;
    return offLimits(x, y) || blocked(x, y) ? { x: tn.x, y: tn.y } : { x, y };
  }

  /** A tunnel monster's turn (TownRoom.updateMob, trooper branch): the mouth never moves; the soldiers fight within its leash. */
  step(m: TroopMob, id: string, dt: number, now: number) {
    const o = this.mobs.get(id);
    if (!o) { this.h.remove(id); return; }
    const tn = o.tn, f = o.f;
    if (!f) { // the mouth: no fighting; stun and knockback don't move it, it never turns
      m.x = m.homeX = tn.x; m.y = m.homeY = tn.y;
      m.moving = false; m.target = ""; m.windUntil = 0; m.winding = false; m.dir = "down";
      return;
    }
    if (this.soldiers.think(m, id, f, tn.g, now)) return;
    const post = this.postOf(tn, o.i);
    if (!f.near) { // nobody to see it: it keeps its place (cheap)
      if (!offLimits(post.x, post.y)) { m.x = m.homeX = post.x; m.y = m.homeY = post.y; }
      m.moving = false; m.windUntil = 0; m.winding = false;
      return;
    }
    if (this.soldiers.fight(m, id, f, tn.g, dt, now)) return;
    const d = Math.hypot(post.x - m.x, post.y - m.y);
    if (d > WAR_TROOPS.warpPx && !this.soldiers.seen(m, WAR_TROOPS.warpUnseenPx) && !offLimits(post.x, post.y)) { m.x = post.x; m.y = post.y; m.moving = false; return; }
    if (d < 2) { m.moving = false; m.dir = dirOf(post.x - tn.x, post.y - tn.y); return; } // looking out from the mouth
    this.soldiers.walk(m, post.x, post.y, dt, this.soldiers.speedOf(m, f));
  }

  /** An enemy hero's blow on the mouth or a soldier: the idle soldiers turn on them. */
  hit(heroId: string, id: string) {
    const o = this.mobs.get(id), p = this.h.hero(heroId);
    if (!o || !p || troopStance(o.tn.clan, p) !== "enemy") return;
    for (const sid of o.tn.soldiers) { const s = this.h.mob(sid); if (s && !s.dead && !s.target) s.target = heroId; }
  }

  /** A hero left or died: no tunnel soldier keeps chasing them. */
  forget(heroId: string) {
    for (const id of this.mobs.keys()) { const m = this.h.mob(id); if (m && m.target === heroId) m.target = ""; }
  }

  /**
   * A tunnel monster died (TownRoom.mobDied). A soldier is just gone (the next wave fills in). The mouth collapses: shut
   * in every room until the next war tick; collapsed by a hero hostile to the Hide-Kin, his clan earns collapseValor in
   * the land (legal and capped, like the holders' pay) and he collapseRenown, and the Herald tells the room. Already
   * collapsed in another room: nothing more. True when it was a tunnel monster.
   */
  killed(m: TroopMob, id: string, killerId: string, now = Date.now()): boolean {
    const o = this.mobs.get(id);
    if (!o) return false;
    this.mobs.delete(id);
    const tn = o.tn;
    if (o.f) { tn.soldiers.delete(id); return true; }
    const tick = warNow()?.tick ?? -1, k = keyOf(tick, tn.t), x = Math.round(m.x), y = Math.round(m.y);
    tn.mouth = "";
    const first = !collapsed.has(k);
    this.shut(tn, now, tick);
    if (!first) return true; // another room's copy fell first: no second pay
    collapsed.set(k, tick);
    this.h.broadcast("sfx", { ev: "tunnel_collapse", x, y });
    this.tell();
    const p = this.h.hero(killerId);
    if (!p || troopStance(tn.clan, p) !== "enemy") return true;
    this.payClan(tn.t, p.clan!, TUNNEL.collapseValor, tick);
    const was = rankOf(p.renown);
    p.renown += TUNNEL.collapseRenown;
    const rank = rankOf(p.renown);
    if (rank > was) this.h.ranked?.(killerId, RENOWN_RANKS[rank].name);
    this.h.broadcast("chat", { id: "", name: "Herald", text: `${p.name} of ${the(CLANS[p.clan!].name)} collapsed a tunnel of ${the(CLANS[tn.clan].name)} at ${TERRITORIES[tn.t].name}.` });
    return true;
  }

  /** Tests: a land's tunnel, read-only. */
  _tunnel(t: number) { return this.tunnels.get(t); }
}

const dirOf = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
