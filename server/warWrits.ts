/**
 * War writs (shared/war/writs.ts has the rules and numbers): clan work taken at a bounty board, one writ at a time per
 * hero, apart from the bounty. Progress comes from the room's events (a rival trooper killed, a full minute at a
 * standard, a wild monster killed, a caravan delivered or raided: server/warCaravans.ts CaravanHost.writ); the last one pays gold, renown and valor on the spot. A writ is withdrawn, unpaid
 * and not counted for the day, when its land changes hands, its caravan line stops running or the hero swears another clan. State is the hero's plain
 * Player.writ / writDay / writN, saved; TownRoom calls in through the small WritHost below.
 */
import { actOfTile, TILE } from "../shared/constants";
import { caravanLines, type CaravanLine } from "../shared/war/caravans";
import { nearestBoard } from "../shared/bounty";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { RENOWN_RANKS, rankOf } from "../shared/war/renown";
import { rallyClan, type WarState } from "../shared/war/rules";
import { STANDARD } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { clanOfIndex, type WarView } from "../shared/war/view";
import { writDay, writNamesLine, writOffers, writPay, writWhere, WRIT, type Writ, type WritState } from "../shared/war/writs";

/** The parts of a hero this module reads and writes (TownRoom's Player). */
export interface WritHero { name: string; clan?: ClanKey; level: number; x: number; y: number; dead: boolean; renown: number; writ?: WritState; writDay: number; writN: number }
/** The parts of a monster a clear writ looks at. */
export interface WritMob { kind: string; level: number; x: number; y: number; owner: string; tide: boolean; qwave: boolean; summonFor: string }

export interface WritHost {
  hero(id: string): WritHero | undefined;
  heroes(): Iterable<[string, WritHero]>;
  send(id: string, type: string, msg: unknown): void;
  /** A chat line to this hero only. */
  chat(id: string, name: string, text: string): void;
  war(): WarState | undefined;
  addValor(t: number, k: ClanKey, v: number): boolean;
  pay(id: string, gold: number): void;
  /** A hero reached a new renown rank (the room tells them, as for the standards). */
  ranked(id: string, rank: string): void;
  save(id: string): void;
}

/** Server -> client "writ". `active` null = no writ; `left` = writs the hero may still finish today; `rally`: the war rallies for the hero's clan (its writs pay more). */
export interface WritMsg { board?: string; offers?: Writ[]; active?: WritState | null; left?: number; note?: string; done?: Writ & { valor: number }; err?: string; rally?: true }

export const SWEAR_FIRST = "Swear to a clan at a standard to take war writs.";

/** Does the writ's caravan line still run (the clans' supply trees change with the war)? */
const runs = (w: Writ, lines: CaravanLine[]) => lines.some((l) => writNamesLine(w, l));

/** Is tile point (px) inside territory t? */
const inLand = (t: number, x: number, y: number) => {
  const T = TERRITORIES[t], tx = x / TILE, ty = y / TILE;
  return !!T && tx >= T.x && ty >= T.y && tx < T.x + T.w && ty < T.y + T.h;
};

export class WarWrits {
  constructor(private h: WritHost) {}

  /** Writs this hero finished today (UTC). */
  private doneToday(p: WritHero, now: number) { return p.writDay === writDay(now) ? p.writN : 0; }

  /** The board view for a hero: offers if at a board, sworn, of oath level and with writs left today. */
  view(id: string, now = Date.now()): WritMsg {
    const p = this.h.hero(id);
    if (!p) return {};
    const board = nearestBoard(p.x, p.y), left = Math.max(0, WRIT.perDay - this.doneToday(p, now)), war = this.h.war();
    const sworn = !!p.clan && p.level >= STANDARD.minLevel;
    const out: WritMsg = { board: board?.id ?? "", offers: [], active: p.writ ?? null, left };
    if (!sworn) out.note = SWEAR_FIRST;
    else if (!left) out.note = `You have finished ${WRIT.perDay} war writs today. New ones at dawn (UTC).`;
    else if (board && war) out.offers = writOffers(war, p.clan!, p.level, actOfTile(Math.floor(board.x / TILE), Math.floor(board.y / TILE)), war.tick + this.doneToday(p, now));
    if (sworn && war && rallyClan(war) === p.clan) out.rally = true;
    return out;
  }

  /** "writ": {} = show me, {take: 0|1|2} = take offer i (at a board, sworn), {drop: true} = give it up. Anything else is ignored. */
  msg(id: string, raw: unknown, now = Date.now()) {
    const p = this.h.hero(id);
    if (!p) return;
    const m = (raw ?? {}) as Record<string, unknown>;
    if (typeof m !== "object" || Array.isArray(m)) return;
    const keys = Object.keys(m);
    const take = keys.length === 1 && Number.isInteger(m.take) && (m.take as number) >= 0 && (m.take as number) < WRIT.offers ? (m.take as number) : -1;
    const drop = keys.length === 1 && m.drop === true;
    if (keys.length && take < 0 && !drop) return;
    if (drop) { p.writ = undefined; this.h.send(id, "writ", this.view(id, now)); return; }
    if (take < 0) { this.h.send(id, "writ", this.view(id, now)); return; }
    const v = this.view(id, now);
    let err = "";
    if (!v.board) err = "Read a bounty board to take a war writ.";
    else if (!p.clan || p.level < STANDARD.minLevel) err = SWEAR_FIRST;
    else if (p.writ) err = "You already carry a war writ.";
    else if (!v.left) err = v.note ?? "No writs left today.";
    else if (!v.offers?.[take]) err = "That writ is no longer offered.";
    else { p.writ = { ...v.offers[take], n: 0 }; v.active = p.writ; this.h.save(id); }
    this.h.send(id, "writ", err ? { ...v, err } : v);
  }

  /** A hero joined: a writ whose land changed hands while they were away is withdrawn; then their state goes out. */
  join(id: string) {
    const p = this.h.hero(id), war = this.h.war();
    if (p?.writ && war && war.owner[p.writ.t] !== p.writ.holder) this.withdraw(id, p, "the land changed hands while you were away");
    else if (p?.writ?.road && war && !runs(p.writ, caravanLines(war.owner))) this.withdraw(id, p, "that caravan road no longer runs");
    this.h.send(id, "writ", this.view(id));
  }

  /** A rival trooper fell to this hero inside land t (server/warTroops.ts killed: the hero stood in the land). */
  trooperKilled(id: string, t: number, clan: ClanKey) {
    const p = this.h.hero(id), w = p?.writ;
    if (p && w && w.kind === "rout" && w.t === t && clan !== w.clan && p.clan === w.clan) this.advance(id, p, w);
  }

  /** A full minute at a standard in land t (server/warHeroes.ts Presence). */
  standardMinute(id: string, t: number) {
    const p = this.h.hero(id), w = p?.writ;
    if (p && w && w.kind === "hold" && w.t === t && p.clan === w.clan) this.advance(id, p, w);
  }

  /** A monster died to this hero: a wild one of the writ's level inside the writ's land counts for a clear. */
  mobKilled(id: string, m: WritMob) {
    const p = this.h.hero(id), w = p?.writ;
    if (!p || !w || w.kind !== "clear" || p.clan !== w.clan) return;
    if (m.kind === "trooper" || m.owner || m.tide || m.qwave || m.summonFor || m.level < w.minLevel || !inLand(w.t, m.x, m.y)) return;
    this.advance(id, p, w);
  }

  /**
   * A caravan of `line` was delivered with this hero among its escorts (server/warCaravans.ts arrive) or its cart fell
   * to this hero's blow (killed): an escort writ for that line, or a raid writ for that rival line, counts.
   */
  caravan(id: string, kind: "escort" | "raid", line: CaravanLine) {
    const p = this.h.hero(id), w = p?.writ;
    if (!p || !w || w.kind !== kind || p.clan !== w.clan || !writNamesLine(w, line)) return;
    if (kind === "escort" ? line.clan !== w.clan : line.clan === w.clan) return;
    this.advance(id, p, w);
  }

  /** After every war tick: writs whose land changed hands, or whose caravan line stopped running, are withdrawn. */
  onWar(v: WarView) {
    let lines: CaravanLine[] | undefined;
    for (const [id, p] of this.h.heroes()) {
      const w = p.writ;
      if (!w) continue;
      if (CLAN_KEYS[v.owner[w.t]] !== w.holder) this.withdraw(id, p, `${w.land} changed hands`);
      else if (w.road && !runs(w, (lines ??= caravanLines(v.owner.map(clanOfIndex))))) this.withdraw(id, p, "that caravan road no longer runs");
    }
  }

  /** The hero swore an oath: a writ for another clan is withdrawn. */
  oathChanged(id: string) {
    const p = this.h.hero(id);
    if (p?.writ && p.writ.clan !== p.clan) this.withdraw(id, p, "you swore to another clan");
  }

  private withdraw(id: string, p: WritHero, why: string) {
    const w = p.writ!;
    p.writ = undefined;
    this.h.chat(id, "Herald", `Your war writ for ${writWhere(w)} is withdrawn: ${why}. No pay, and it does not count for today.`);
    this.h.send(id, "writ", { active: null, left: Math.max(0, WRIT.perDay - this.doneToday(p, Date.now())) });
    this.h.save(id);
  }

  private advance(id: string, p: WritHero, w: WritState, now = Date.now()) {
    w.n++;
    if (w.n < w.goal) { this.h.send(id, "writ", { active: w }); return; }
    p.writ = undefined;
    p.writN = this.doneToday(p, now) + 1; p.writDay = writDay(now);
    const war = this.h.war(), pay = war ? writPay(war, w.clan, w.t) : { gold: w.gold, renown: w.renown, valor: WRIT.valor };
    this.h.pay(id, pay.gold);
    const was = rankOf(p.renown);
    p.renown += pay.renown;
    this.h.addValor(w.t, w.clan, pay.valor);
    const rank = rankOf(p.renown);
    if (rank > was) this.h.ranked(id, RENOWN_RANKS[rank].name);
    this.h.send(id, "writ", { active: null, done: { ...w, gold: pay.gold, renown: pay.renown, valor: pay.valor }, left: Math.max(0, WRIT.perDay - p.writN) });
    this.h.save(id);
  }
}
