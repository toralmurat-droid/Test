/**
 * The clans' capital cities on the server (W7, shared/capitals.ts has the plan, rules and numbers): who the city gate
 * and the city's waystone let in, the oath at the altar, the leader's one-time rank rewards, binding the city as home
 * and the respawn that uses it. State is the hero's plain Player.home / capPaid (saved, never synced: the "city"
 * message carries it to its owner). TownRoom calls in through the small CapitalsHost below; no per-tick work.
 */
import { TILE } from "../shared/constants";
import { actAt } from "../shared/act2";
import { CITY, CITY_TEMPLATE, cityAdmits, cityAt, cityOf, cityPx, cityRoleNear, cityText, cityTitle, cityTile, rankRewardGold, type City } from "../shared/capitals";
import { underground } from "../shared/dungeon";
import { isSolidAt } from "../shared/map";
import { isDecorSolidAt } from "../shared/npcs";
import { CLANS, type ClanKey } from "../shared/war/clans";
import { CITY_LINES, cityLine } from "../shared/war/cityText";
import { atWar, wantedTier, type FeudState } from "../shared/war/feuds";
import { RENOWN_RANKS, rankOf } from "../shared/war/renown";
import { TITLES } from "../shared/cosmetics";
import { swear, type WarHero } from "./warHeroes";

/** The parts of a hero this module reads and writes (TownRoom's Player). */
export interface CapHero extends WarHero { gold: number; home?: ClanKey; capPaid: number; feud: FeudState }

export interface CapitalsHost {
  hero(id: string): CapHero | undefined;
  send(id: string, type: string, msg: unknown): void;
  /** A chat note to this hero only. */
  note(id: string, text: string): void;
  /** Everything the room does after a hero's oath changed (the "clan" reply, writs, tabards, the clan's plan). */
  oathChanged(id: string): void;
  /** Gives the hero TITLES[i] (server/titles.ts award); true when it is new to them. */
  award(id: string, i: number): boolean;
  /** broadcast("sfx", ...) */
  sfx(msg: { ev: string; [k: string]: unknown }): void;
}

/** "city" (server -> owner): the hero's standing with the capitals. `home` = the bound city's clan or "". */
export interface CityView { home: ClanKey | ""; paid: number; rank: number; owed: number; err?: string; text?: string }

/** The hero's view (what the leader would pay now, the bound home). */
export function cityView(p: CapHero, extra: { err?: string; text?: string } = {}): CityView {
  const rank = rankOf(p.renown);
  return { home: p.home ?? "", paid: p.capPaid, rank, owed: p.clan && cityOf(p.clan) ? rankRewardGold(p.capPaid, rank) : 0, ...extra };
}

/** Why `city`'s gates refuse this hero now, or "ok" (shared/capitals.ts cityAdmits, with today's wars and Wanted marks). */
export const admitOf = (p: CapHero, city: City, now = Date.now()) => cityAdmits({ clan: p.clan, wanted: wantedTier(p.feud, city.clan, now) }, city, atWar);

/** A free spot in a city's gate square (px), for a respawn there; the inner gate's arrival if none is found. */
export function citySpawn(c: City): { x: number; y: number } {
  const sq = CITY_TEMPLATE.districts.find((d) => d.d === "gate")!, r = 6;
  for (let i = 0; i < 60; i++) {
    const p = cityPx(c, sq.x + 1 + Math.random() * (sq.w - 2), sq.y + 1 + Math.random() * (sq.h - 3));
    if (![[-r, -r], [r, -r], [-r, r], [r, r]].some(([dx, dy]) => isSolidAt(p.x + dx, p.y + dy) || isDecorSolidAt(p.x + dx, p.y + dy))) return p;
  }
  const g = cityTile(c, CITY_TEMPLATE.gate);
  return { x: (g.x + 0.5) * TILE, y: (g.y + 0.5 - 2.4) * TILE };
}

export class WarCapitals {
  /** When each hero was last told a gate is shut (one note per 3 s, like a cold waygate's). */
  private noted = new Map<string, number>();
  constructor(private h: CapitalsHost) {}

  /**
   * A hero tries to enter `city` (its city gate or its waystone): true lets them in; otherwise they get a note saying
   * why and stay where they are. The same check for both ways in, so the waystone is no way round the gate.
   */
  admit(id: string, city: City, now = Date.now()): boolean {
    const p = this.h.hero(id);
    if (!p) return false;
    const why = admitOf(p, city, now);
    if (why === "ok") return true;
    if (now - (this.noted.get(id) ?? 0) > 3000) {
      this.noted.set(id, now);
      this.h.note(id, cityLine(why === "war" ? CITY_LINES.shutWar : CITY_LINES.shutWanted, { city: cityText(city).name, clan: CLANS[city.clan].name }));
    }
    return false;
  }

  /** The hero left the room. */
  leave(id: string) { this.noted.delete(id); }

  /** "cityoath" {}: at a city's altar, swear to its clan (the oath's own rules: shared/war/standards.ts, server/warHeroes.ts swear). */
  oath(id: string, now = Date.now()) {
    const p = this.h.hero(id);
    if (!p || p.dead) return;
    const city = cityRoleNear("oathkeeper", p.x, p.y);
    if (!city) return this.h.send(id, "city", cityView(p, { err: CITY_LINES.tooFar }));
    const clan = CLANS[city.clan].name;
    if (p.clan === city.clan) return this.h.send(id, "city", cityView(p, { err: cityLine(CITY_LINES.oathSame, { clan }) }));
    const was = p.clan, err = swear(p, city.clan, now);
    if (err) return this.h.send(id, "city", cityView(p, { err }));
    this.h.oathChanged(id);
    this.h.sfx({ ev: "cityoath", id, clan: city.clan, was: was ?? "" });
    this.h.send(id, "city", cityView(p, { text: cityLine(CITY_LINES.oathSworn, { clan }) }));
  }

  /** "cityreward" {}: beside a city's leader, a hero sworn to that clan is paid once for every renown rank not yet paid. */
  reward(id: string) {
    const p = this.h.hero(id);
    if (!p || p.dead) return;
    const city = cityRoleNear("leader", p.x, p.y);
    if (!city) return this.h.send(id, "city", cityView(p, { err: CITY_LINES.tooFar }));
    const t = cityText(city), leader = t.npcs.leader[0];
    if (p.clan !== city.clan) return this.h.send(id, "city", cityView(p, { err: cityLine(CITY_LINES.rewardUnsworn, { leader, clan: CLANS[city.clan].name }) }));
    const rank = rankOf(p.renown), gold = rankRewardGold(p.capPaid, rank), lines: string[] = [];
    if (gold > 0) {
      p.gold += gold; p.capPaid = rank;
      lines.push(cityLine(CITY_LINES.rewardPaid, { leader, rank: RENOWN_RANKS[rank].name, gold }));
    }
    const ti = cityTitle(city);
    if (rank >= CITY.titleRank && ti > 0 && this.h.award(id, ti)) lines.push(cityLine(CITY_LINES.rewardTitle, { title: TITLES[ti] }));
    if (!lines.length) return this.h.send(id, "city", cityView(p, { text: cityLine(CITY_LINES.rewardNone, { leader }) }));
    this.h.sfx({ ev: "cityreward", id, clan: city.clan, gold });
    this.h.send(id, "city", cityView(p, { text: lines.join(" ") }));
  }

  /** "cityhome" {on: boolean}: at a city's oath hall, a hero sworn to its clan binds it as home; {on: false} unbinds anywhere. */
  home(id: string, m: unknown) {
    const p = this.h.hero(id);
    const on = m && typeof m === "object" ? (m as { on?: unknown }).on : undefined;
    if (!p || typeof on !== "boolean") return;
    if (!on) {
      const was = cityOf(p.home);
      p.home = undefined;
      return this.h.send(id, "city", cityView(p, was ? { text: cityLine(CITY_LINES.homeCleared, { city: cityText(was).name }) } : {}));
    }
    if (p.dead) return;
    const city = cityRoleNear("oathkeeper", p.x, p.y);
    if (!city) return this.h.send(id, "city", cityView(p, { err: CITY_LINES.tooFar }));
    const name = cityText(city).name;
    if (p.clan !== city.clan) return this.h.send(id, "city", cityView(p, { err: cityLine(CITY_LINES.homeUnsworn, { clan: CLANS[city.clan].name, city: name }) }));
    p.home = city.clan;
    this.h.send(id, "city", cityView(p, { text: cityLine(CITY_LINES.homeBound, { city: name }) }));
  }

  /** "city" {}: the hero's standing, resent. */
  view(id: string) { const p = this.h.hero(id); if (p) this.h.send(id, "city", cityView(p)); }
}

/** A hero's oath changed (at a standard or an altar): a home in another clan's city is unbound. */
export function homeAfterOath(p: { clan?: ClanKey; home?: ClanKey }) {
  if (p.home && p.home !== p.clan) p.home = undefined;
}

/**
 * Where a hero who died at (x, y) px comes back (owner's default): at the land's own town (`fallback`), unless they
 * bound a capital of their clan in that same land as home, the city still lets them in, and its city gate is nearer
 * the place they fell than the town. Never across lands, never from underground: dying is not free travel.
 */
export function respawnAt(p: CapHero, x: number, y: number, fallback: { x: number; y: number }, now = Date.now()): { x: number; y: number } {
  const city = cityOf(p.home);
  if (!city || p.clan !== city.clan) return fallback;
  if (cityAt(Math.floor(x / TILE), Math.floor(y / TILE)) === city) return citySpawn(city);
  if (underground(y) || actAt(y, x) !== city.act || admitOf(p, city, now) !== "ok") return fallback;
  const g = { x: (city.outer.x + 0.5) * TILE, y: (city.outer.y + 0.5) * TILE };
  return Math.hypot(g.x - x, g.y - y) < Math.hypot(fallback.x - x, fallback.y - y) ? citySpawn(city) : fallback;
}
