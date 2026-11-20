/**
 * The works of the Holds (shared/war/holdFall.ts has the rules, the works of each fort and the numbers). A Hold near a
 * hero stands its works as still "trooper" objects of its holder (Mob.weapon "<clan>%<code>"): the barracks, the supply
 * props and its fortifications. Only heroes the holder's soldiers fight can hurt them (the trooper gate). A wrecked work
 * pays the wrecker's clan valor where the war lets it fight (like a sack) and the wrecker renown; it is rebuilt after
 * HOLD_FALL.rebuildMs unless the Hold falls first. While the barracks lies wrecked the Hold fields no new soldier
 * (server/warTroops.ts asks `barracks`). The last work down: the Hold falls (server/war.ts holdFall), its walls and
 * soldiers are gone and it waits for a clan's banner (server/warHolds.ts claims it).
 * What is wrecked is kept for every room of the process (memory, like the sacks): a restart rebuilds every work. TownRoom
 * calls in through the narrow HoldWorksHost below.
 */
import { TILE } from "../shared/constants";
import { underground } from "../shared/dungeon";
import { CLANS, CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { atWar } from "../shared/war/feuds";
import { barracksOf, canFall, HOLD_FALL, holdWorks, workName, workWeapon, type HoldWork, type HoldWorksMsg } from "../shared/war/holdFall";
import { inSackReach } from "../shared/war/holdSack";
import type { HoldTier } from "../shared/war/holdTiers";
import { viewTier } from "../shared/war/intel";
import { RENOWN_RANKS, rankOf } from "../shared/war/renown";
import { rallyRenown, targetsOf } from "../shared/war/rules";
import { HOLDS, STANDARD } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { troopLevel, troopStats, WAR_TROOPS } from "../shared/war/troops";
import { addValor, holdFall, warFallen, warNow, warRole, warState } from "./war";
import { boonRenown } from "./warCrown";
import type { TroopHero, TroopMob } from "./warTroops";

export interface HoldWorksHost {
  /** A plain trooper monster with this id at (x, y) and this level and weapon. */
  spawn(id: string, level: number, x: number, y: number, weapon: string): TroopMob | undefined;
  remove(id: string): void;
  mob(id: string): TroopMob | undefined;
  heroes(): Iterable<[string, TroopHero]>;
  hero(id: string): TroopHero | undefined;
  send(id: string, type: string, msg: unknown): void;
  broadcast(type: string, msg: unknown): void;
  ranked?(heroId: string, rank: string): void;
}

/**
 * A Hold's works for every room: its holder and the tier its works were laid out at (kept while any lies wrecked, so a
 * Hold shrinking in the fight does not shuffle them), and when each wrecked one fell (work index -> ms).
 */
/** `fell`: the Hold fell with these works (every one wrecked): kept for its ruin until a clan claims the land. */
interface LandWorks { clan: ClanKey; tier: HoldTier; wrecked: Map<number, number>; fell?: boolean }
const lands = new Map<number, LandWorks>();
/** Holds brought down here whose fall the war's owner has not applied yet (Ages: a follower): no works rise meanwhile. */
const falling = new Map<number, number>();
const FALL_WAIT_MS = 3 * 60_000;
/** Bumped on every wreck, rebuild or reset (rooms send "holdworks" when it moved). */
let version = 0;
/** Tests: forget every wreck. */
export function _resetHoldWorks() { lands.clear(); falling.clear(); version++; }

/** The works state of land t for its holder `clan` at live tier `tier` (a new holder starts afresh; the tier follows the Hold while nothing is wrecked). */
function landOf(t: number, clan: ClanKey, tier: HoldTier): LandWorks {
  let l = lands.get(t);
  if (!l || l.clan !== clan) { l = { clan, tier, wrecked: new Map() }; lands.set(t, l); version++; }
  if (!l.wrecked.size && l.tier !== tier) l.tier = tier;
  return l;
}

/** One room's work monsters. */
interface Placed { t: number; i: number; clan: ClanKey; tier: HoldTier }

const the = (name: string) => name.replace(/^The /, "the ");

export class WarHoldWorks {
  /** Work monsters of this room, by mob id. */
  private placed = new Map<string, Placed>();
  /** Lands awake in this room (a hero near) and when a hero was last near. */
  private awake = new Map<number, number>();
  private seq = 0;
  private sent = -1;
  /** Works each hero was paid wreck renown for in a war tick. */
  private earned = new Map<string, { tick: number; n: number }>();

  constructor(private h: HoldWorksHost) {}

  /** Work monsters standing in this room (tests, the troop budget). */
  get count(): number { return this.placed.size; }
  owns(id: string): boolean { return this.placed.has(id); }

  /** A work never moves (and never leaves its spot for a wall sweep: a watchtower stands on its wall). */
  step(m: TroopMob, id: string) {
    const p = this.placed.get(id);
    if (!p) { this.h.remove(id); return; }
    const w = holdWorks(p.t, p.clan, p.tier)[p.i];
    if (w) { m.x = m.homeX = w.x; m.y = m.homeY = w.y; }
    m.moving = false; m.winding = false; m.windUntil = 0; m.target = "";
  }

  /**
   * Where territory t's soldiers come out (server/warTroops.ts): its barracks' door while it stands, null while it lies
   * wrecked or the Hold fell (no new soldier), undefined for a Hold without works (a capital: as before).
   */
  barracks(t: number): { x: number; y: number } | null | undefined {
    const st = warState();
    if (!HOLD_FALL.live || !st || !canFall(t)) return undefined;
    if (warFallen(t) || falling.has(t)) return null; // (fallen, or its fall waiting for the war's owner: Ages)
    const clan = st.owner[t], l = clan ? lands.get(t) : undefined, tier = l && l.clan === clan ? l.tier : viewTier(warNow()!, t);
    const works = clan ? holdWorks(t, clan, tier) : [], b = barracksOf(works);
    if (!b) return undefined;
    if (l && l.clan === clan && l.wrecked.has(b.i)) return null;
    return { x: b.x, y: b.y + TILE * 0.6 }; // (out of its door, toward the viewer)
  }

  /** The clients' view: every wrecked work this process knows of (a fallen Hold: all of its works, its ruin). */
  view(): HoldWorksMsg {
    const wrecked: [number, number, number, number][] = [];
    for (const [t, l] of lands) for (const i of l.wrecked.keys()) wrecked.push([t, i, CLAN_KEYS.indexOf(l.clan), l.tier]);
    return { wrecked: wrecked.sort((a, b) => a[0] - b[0] || a[1] - b[1]) };
  }

  /** Once a second: wake the Holds near heroes, rebuild old wrecks, stand the works that should stand, clear the rest. */
  tick(now = Date.now()) {
    const v = HOLD_FALL.live ? warNow() : undefined;
    // the works of other rooms' wrecks (or that vanished) go
    for (const [id, p] of this.placed) {
      const m = this.h.mob(id), l = lands.get(p.t);
      if (!m || m.dead) { this.placed.delete(id); continue; }
      if (!v || !l || l.clan !== p.clan || l.tier !== p.tier || l.wrecked.has(p.i) || warFallen(p.t) || CLAN_KEYS[v.owner[p.t]] !== p.clan) this.drop(id);
    }
    if (!v) { this.tell(); return; }
    for (const [hid, e] of this.earned) if (e.tick !== v.tick) this.earned.delete(hid);
    for (const [t, l] of lands) {
      const down = warFallen(t);
      if (down && l.fell) continue; // (its ruin stays until a clan claims it)
      if ((l.fell && !down && !falling.has(t)) || CLAN_KEYS[v.owner[t]] !== l.clan) { lands.delete(t); version++; continue; } // (a claimed or taken Hold: its works start afresh with its holder)
      if (down) { for (const w of holdWorks(t, l.clan, l.tier)) l.wrecked.set(w.i, now); l.fell = true; version++; continue; } // (fallen on another server: all in ruins)
      for (const [i, at] of l.wrecked) if (now - at >= HOLD_FALL.rebuildMs) { l.wrecked.delete(i); version++; }
    }
    const heroes: TroopHero[] = [];
    for (const [, p] of this.h.heroes()) if (!p.dead && !underground(p.y)) heroes.push(p);
    const wake = WAR_TROOPS.wakeTiles * TILE;
    for (const hd of HOLDS) {
      if (heroes.some((p) => Math.abs(p.x - hd.x) <= wake && Math.abs(p.y - hd.y) <= wake)) this.awake.set(hd.t, now);
    }
    const live = new Set<string>();
    for (const [t, seen] of this.awake) {
      if (now - seen >= WAR_TROOPS.sleepMs) { this.awake.delete(t); continue; }
      const clan = CLAN_KEYS[v.owner[t]];
      const f = falling.get(t);
      if (f !== undefined && (warFallen(t) || now - f >= FALL_WAIT_MS)) falling.delete(t);
      if (!clan || !canFall(t) || warFallen(t) || falling.has(t)) continue;
      const l = landOf(t, clan, viewTier(v, t));
      for (const w of holdWorks(t, clan, l.tier)) {
        if (l.wrecked.has(w.i)) continue;
        live.add(`${t}:${w.i}`);
        if (![...this.placed.values()].some((p) => p.t === t && p.i === w.i)) this.place(t, clan, l.tier, w);
      }
    }
    for (const [id, p] of this.placed) if (!live.has(`${p.t}:${p.i}`)) this.drop(id); // (a Hold that went to sleep)
    this.tell();
  }

  private place(t: number, clan: ClanKey, tier: HoldTier, w: HoldWork) {
    const id = `hw${++this.seq}`, level = troopLevel(t), m = this.h.spawn(id, level, w.x, w.y, workWeapon(clan, w.kind));
    if (!m) return;
    m.hp = m.maxHp = Math.max(1, Math.round(troopStats(clan, level).hp * HOLD_FALL.hp[w.kind]));
    m.homeX = w.x; m.homeY = w.y; m.title = workName(clan, w.kind);
    this.placed.set(id, { t, i: w.i, clan, tier });
  }

  private drop(id: string) { this.placed.delete(id); this.h.remove(id); }

  /** The clients hear of the wrecks when they changed. */
  private tell(force = false) {
    if (!force && this.sent === version) return;
    this.sent = version;
    this.h.broadcast("holdworks", this.view());
  }

  /**
   * A work died (TownRoom.mobDied): wrecked for every room until rebuilt. `heroId`: the hero who wrecked it (or whose
   * creature did). Valor for the hero's clan where the war lets it fight, renown for the hero; the last work brings the
   * Hold down (server/war.ts holdFall). Returns true when it was one of this room's works.
   */
  killed(id: string, heroId: string | undefined, now = Date.now()): boolean {
    const p = this.placed.get(id);
    if (!p) return false;
    this.placed.delete(id);
    const l = lands.get(p.t), w = holdWorks(p.t, p.clan, p.tier)[p.i];
    if (!l || l.clan !== p.clan || l.tier !== p.tier || l.wrecked.has(p.i) || !w) return true;
    l.wrecked.set(p.i, now); version++;
    const hero = heroId ? this.h.hero(heroId) : undefined, land = TERRITORIES[p.t].name, st = warState();
    const legal = !!hero?.clan && !!st && atWar(hero.clan, p.clan) && targetsOf(st, hero.clan).includes(p.t) && hero.level >= STANDARD.minLevel;
    this.h.broadcast("sfx", { ev: "work_wrecked", t: p.t, i: p.i, x: Math.round(w.x), y: Math.round(w.y), kind: w.kind, clan: p.clan });
    const left = holdWorks(p.t, p.clan, p.tier).filter((x) => !l.wrecked.has(x.i)).length;
    if (hero && heroId) {
      let valor = 0;
      if (legal && addValor(p.t, hero.clan!, HOLD_FALL.wreckValor)) valor = HOLD_FALL.wreckValor;
      if (legal && this.mayEarn(heroId)) this.renown([[heroId, hero]], p.t, hero.clan!, HOLD_FALL.wreckRenown); // (only for effort the war counts, capped per war tick)
      const what = workName(p.clan, w.kind);
      this.h.send(heroId, "chat", { id: "", name: "Herald", text: `You wrecked the ${what} of ${land}${valor ? `: +${valor} valor for ${the(CLANS[hero.clan!].name)}` : ""}.${left ? ` ${left} work${left === 1 ? "" : "s"} still stand${left === 1 ? "s" : ""}.` : ""}` });
    }
    if (left === 0) this.fall(p.t, p.clan, heroId, hero, legal, now);
    this.tell(true);
    return true;
  }

  /** The last work is down: the Hold falls (the war decides, the room hears of it as war news), its wreckers are paid. */
  private fall(t: number, holder: ClanKey, heroId: string | undefined, hero: TroopHero | undefined, legal: boolean, now: number) {
    const clan = hero?.clan, by = hero ? hero.name : "A hero";
    if (!holdFall(t, clan, by, now)) return;
    const l = lands.get(t);
    if (l) { for (const w of holdWorks(t, l.clan, l.tier)) l.wrecked.set(w.i, now); l.fell = true; }
    falling.set(t, now); version++;
    for (const [id] of this.placed) if (this.placed.get(id)!.t === t) this.drop(id);
    if (!clan || !heroId) return;
    if (!legal || warRole() === "follower") return; // (renown only for a fall the war counts; on a follower the owner decides: Ages)
    addValor(t, clan, HOLD_FALL.fallValor);
    const sharers: [string, TroopHero][] = [];
    for (const [hid, o] of this.h.heroes()) if (!o.dead && o.clan === clan && o.level >= STANDARD.minLevel && (hid === heroId || inSackReach(t, o.x, o.y))) sharers.push([hid, o]);
    this.renown(sharers, t, clan, HOLD_FALL.fallRenown);
    for (const [hid] of sharers) this.h.send(hid, "chat", { id: "", name: "Herald", text: `The Hold of ${TERRITORIES[t].name} has fallen! ${CLANS[holder].name} lost it: raise ${the(CLANS[clan].name)}'s banner at its middle to claim it.` });
  }

  /** Wreck renown a hero may still earn this war tick (HOLD_FALL.wreckRenownPerTick works). */
  private mayEarn(heroId: string): boolean {
    const tick = warNow()?.tick ?? -1, e = this.earned.get(heroId);
    const n = e && e.tick === tick ? e.n : 0;
    if (n >= HOLD_FALL.wreckRenownPerTick) return false;
    this.earned.set(heroId, { tick, n: n + 1 });
    return true;
  }

  private renown(heroes: [string, TroopHero][], t: number, clan: ClanKey, amount: number) {
    const st = warState();
    for (const [hid, o] of heroes) {
      const was = rankOf(o.renown);
      o.renown += amount * rallyRenown(st, clan) * boonRenown(clan);
      const rank = rankOf(o.renown);
      if (rank > was) this.h.ranked?.(hid, RENOWN_RANKS[rank].name);
    }
    void t;
  }
}
