/**
 * The Reckoning on the server (Crown PR4; the rules are in shared/war/crown.ts). The war (server/war.ts) keeps its state
 * in the war save (`Saved.crown`, optional: a save without it has had no Reckoning yet) and calls in here: crownClock
 * every 15 s (the warning, the start, the hourly standings, the close), crownTick after every war tick (land points)
 * and crownValor for every valor added (the Crown valor of a clan and of the hero who earned it). At the close the top
 * clan takes the Keep (war.ts crownKeep), the clan is crowned (the boon: boonGold / boonRenown), and each hero who took
 * part gets pay waiting for their next login (WarCrown.join), or at once when they are online in a room.
 */
import { CLANS, CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import {
  crownBoon, heroKey, keepOf, landPoints, RECKONING, reckoningAt, reckonReward, reckonWinner, scoresOf, standings, type ReckonView, type ReckonWindow,
} from "../shared/war/crown";
import { RENOWN_RANKS, rankOf } from "../shared/war/renown";
import { TERRITORIES } from "../shared/war/territories";
import { crownKeep, warCrownSave, warCrownChanged, warState } from "./war";

/** A hero's part in the Reckoning under way: the clan they earned Crown valor for, and how much. */
interface HeroPart { k: ClanKey; v: number }
/** The Reckoning under way: its window, the clans' land points and Crown valor, the heroes' parts, the standings told. */
interface CrownCur { start: number; end: number; land: Partial<Record<ClanKey, number>>; valor: Partial<Record<ClanKey, number>>; heroes: Record<string, HeroPart>; told: number }
/** Pay waiting for a hero (heroKey) until `until`. */
interface CrownPay { gold: number; renown: number; until: number; won: boolean }
/**
 * The war save's Reckoning part. Every field optional: `crowned` the clan the last Reckoning crowned, `warned` the start
 * of the window whose warning went out, `cur` the Reckoning under way, `last` the last result, `pay` pay waiting.
 */
export interface CrownSave {
  crowned?: ClanKey; warned?: number; cur?: CrownCur;
  last?: { at: number; start: number; winner: ClanKey; kept: boolean; score: Record<ClanKey, number> };
  pay?: Record<string, CrownPay>;
}

/** What rooms hear (the "reckon" message and the Herald): the warning, the start, the hourly standings, the result. */
export interface CrownNews { kind: "warn" | "start" | "standings" | "result"; start: number; end: number; score?: Record<ClanKey, number>; winner?: ClanKey; kept?: boolean; holder?: ClanKey }

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const isClan = (v: unknown): v is ClanKey => typeof v === "string" && CLAN_KEYS.includes(v as ClanKey);
function clanNums(raw: unknown): Partial<Record<ClanKey, number>> {
  const out: Partial<Record<ClanKey, number>> = {};
  if (raw && typeof raw === "object") for (const k of CLAN_KEYS) { const v = num((raw as Record<string, unknown>)[k]); if (v !== undefined && v > 0) out[k] = v; }
  return out;
}
const fullScore = (raw: unknown) => Object.fromEntries(CLAN_KEYS.map((k) => [k, clanNums(raw)[k] ?? 0])) as Record<ClanKey, number>;

/** The war save's `crown` field, cleaned (on load): anything malformed is dropped, so an old or broken save reads as no Reckoning yet. */
export function cleanCrown(raw: unknown): CrownSave {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}, out: CrownSave = {};
  if (isClan(r.crowned)) out.crowned = r.crowned;
  if (num(r.warned) !== undefined) out.warned = r.warned as number;
  const c = r.cur as Record<string, unknown> | undefined;
  if (c && typeof c === "object" && num(c.start) !== undefined && num(c.end) !== undefined && (c.end as number) > (c.start as number)) {
    const heroes: Record<string, HeroPart> = {};
    if (c.heroes && typeof c.heroes === "object") for (const [key, h] of Object.entries(c.heroes as Record<string, { k?: unknown; v?: unknown }>).slice(0, RECKONING.heroesMax))
      if (h && isClan(h.k) && (num(h.v) ?? 0) > 0) heroes[key] = { k: h.k, v: h.v as number };
    out.cur = { start: c.start as number, end: c.end as number, land: clanNums(c.land), valor: clanNums(c.valor), heroes, told: Math.max(0, Math.floor(num(c.told) ?? 0)) };
  }
  const l = r.last as Record<string, unknown> | undefined;
  if (l && typeof l === "object" && isClan(l.winner) && num(l.at) !== undefined && num(l.start) !== undefined)
    out.last = { at: l.at as number, start: l.start as number, winner: l.winner, kept: l.kept === true, score: fullScore(l.score) };
  if (r.pay && typeof r.pay === "object") {
    const pay: Record<string, CrownPay> = {};
    for (const [key, p] of Object.entries(r.pay as Record<string, Partial<CrownPay>>)) {
      const gold = num(p?.gold), renown = num(p?.renown), until = num(p?.until);
      if (gold !== undefined && renown !== undefined && until !== undefined && gold >= 0 && renown >= 0) pay[key] = { gold: Math.floor(gold), renown, until, won: p.won === true };
    }
    if (Object.keys(pay).length) out.pay = pay;
  }
  return out;
}

const listeners = new Set<(n: CrownNews) => void>();
/** Rooms hear the Reckoning's news here. Returns an unsubscribe function. */
export function onCrown(f: (n: CrownNews) => void) { listeners.add(f); return () => { listeners.delete(f); }; }
const tellAll = (n: CrownNews) => listeners.forEach((f) => { try { f(n); } catch (e) { console.error("Reckoning listener:", e); } });

const keep = keepOf(TERRITORIES);
const isCrown = (t: number) => TERRITORIES[t]?.region === "crown";

/**
 * The Reckoning's clock (server/war.ts step, every 15 s): pay past its time is dropped; the warning RECKONING.warnMs
 * before a window, its start, the standings every RECKONING.standingsMs and its close go out once each. A server down
 * for the whole window holds no Reckoning that month; one that comes back during it opens it late.
 */
export function crownClock(now: number) {
  const c = warCrownSave(), s = warState();
  if (!c || !s || !keep) return;
  let changed = false;
  if (c.pay) for (const [key, p] of Object.entries(c.pay)) if (now >= p.until) { delete c.pay[key]; changed = true; }
  if (c.cur && now >= c.cur.end) { close(now); return; } // (close saves)
  const w = reckoningAt(now);
  if (!c.cur && now < w.start && now >= w.start - RECKONING.warnMs && c.warned !== w.start) {
    c.warned = w.start; changed = true;
    tellAll({ kind: "warn", start: w.start, end: w.end, holder: s.owner[keep.id] });
  }
  if (!c.cur && now >= w.start && now < w.end) { open(w); changed = true; }
  else if (c.cur) {
    const h = Math.floor((now - c.cur.start) / RECKONING.standingsMs);
    if (h > c.cur.told) { c.cur.told = h; changed = true; tellAll({ kind: "standings", start: c.cur.start, end: c.cur.end, score: scoresOf(c.cur) }); }
  }
  if (changed) warCrownChanged(now);
}

function open(w: ReckonWindow) {
  const c = warCrownSave()!;
  c.cur = { start: w.start, end: w.end, land: {}, valor: {}, heroes: {}, told: 0 };
  c.warned = w.start;
  tellAll({ kind: "start", start: w.start, end: w.end, holder: warState()?.owner[keep!.id] });
}

/** The close: the top clan takes the Keep (a tie: the holder keeps it), is crowned, and the heroes who took part are owed their pay. */
function close(now: number) {
  const c = warCrownSave(), s = warState();
  if (!c?.cur || !s || !keep) return;
  const cur = c.cur, score = scoresOf(cur), holder = s.owner[keep.id], { winner, kept } = reckonWinner(score, holder);
  delete c.cur;
  c.crowned = winner;
  c.last = { at: now, start: cur.start, winner, kept, score };
  const pay = (c.pay ??= {});
  for (const [key, h] of Object.entries(cur.heroes)) {
    if (h.v < RECKONING.reward.minValor) continue;
    const won = h.k === winner, r = reckonReward(won);
    pay[key] = { gold: r.gold + (pay[key]?.gold ?? 0), renown: r.renown + (pay[key]?.renown ?? 0), until: cur.end + RECKONING.reward.keepMs, won };
  }
  if (!kept) crownKeep(keep.id, winner, `${CLANS[winner].name} won the Reckoning and took the Crown Keep from ${CLANS[holder].name}`, now);
  warCrownChanged(now, true);
  tellAll({ kind: "result", start: cur.start, end: cur.end, score, winner, kept, holder });
}

/** After every war tick (server/war.ts tickOnce, on the new owners): a tick inside the window scores the Crown's land. */
export function crownTick(at: number) {
  const c = warCrownSave(), s = warState();
  if (!c?.cur || !s || at < c.cur.start || at >= c.cur.end) return;
  for (const [k, v] of Object.entries(landPoints(s.owner, TERRITORIES)) as [ClanKey, number][]) c.cur.land[k] = (c.cur.land[k] ?? 0) + v;
}

/** Valor counted for clan `k` in territory `t` (server/war.ts addValor): in the Crown during a Reckoning it scores, for the clan and for hero `by` (heroKey). */
export function crownValor(t: number, k: ClanKey, v: number, by?: string, now = Date.now()) {
  const cur = warCrownSave()?.cur;
  if (!cur || !isCrown(t) || !(v > 0) || now < cur.start || now >= cur.end) return;
  cur.valor[k] = (cur.valor[k] ?? 0) + v;
  if (by) crownCredit(t, by, k, v, now);
}
/**
 * Hero `by` (heroKey) took part for clan `k` in Crown territory `t` (valor counted once for their clan, shared by several
 * heroes: a caravan's escort, a Hold's sackers). Their clan's valor is added by addValor, not here.
 */
export function crownCredit(t: number, by: string, k: ClanKey, v: number, now = Date.now()) {
  const cur = warCrownSave()?.cur;
  if (!cur || !isCrown(t) || !(v > 0) || now < cur.start || now >= cur.end) return;
  const h = cur.heroes[by];
  if (!h && Object.keys(cur.heroes).length >= RECKONING.heroesMax) return;
  cur.heroes[by] = { k, v: (h?.v ?? 0) + v }; // (a hero who changed clans in the window counts for the last)
}

/** The key of a hero (account and class) as the war passes it to addValor; undefined without a class (a test double). */
export const keyOf = (p: { name: string; cls?: string }): string | undefined => (p.cls ? heroKey(p.name, p.cls) : undefined);

/** The boon for a hero sworn to `k` (shared/war/crown.ts crownBoon) as the war stands. */
const boon = (k: ClanKey | undefined) => crownBoon(warCrownSave()?.crowned, keep ? warState()?.owner[keep.id] : undefined, k);
/** Gold a hero sworn to `k` gets for `amount` earned (x 1.1 for the crowned clan). */
export const boonGold = (k: ClanKey | undefined, amount: number) => (amount > 0 ? Math.round(amount * boon(k).gold) : amount);
/** The gold multiplier for a hero sworn to `k` (monster loot: the killer's clan). */
export const boonGoldMult = (k: ClanKey | undefined) => boon(k).gold;
/** The renown multiplier for a hero sworn to `k` (x 1.1 for the crowned clan; multiplies the Rally's). */
export const boonRenown = (k: ClanKey | undefined) => boon(k).renown;

/** The clients' view of the Reckoning (WarView.reck). */
export function crownView(now = Date.now()): ReckonView {
  const c = warCrownSave(), s = warState(), w = c?.cur ?? reckoningAt(now), v: ReckonView = { start: w.start, end: w.end };
  if (c?.cur) { v.on = true; const sc = scoresOf(c.cur); v.score = CLAN_KEYS.map((k) => Math.round(sc[k])); }
  if (c?.crowned && keep && s?.owner[keep.id] === c.crowned) v.crowned = CLAN_KEYS.indexOf(c.crowned);
  if (c?.last) v.last = { at: c.last.at, winner: CLAN_KEYS.indexOf(c.last.winner), kept: c.last.kept, score: CLAN_KEYS.map((k) => Math.round(c.last!.score[k])) };
  return v;
}

/** Hero `key`'s pay waiting, taken (once: a second call, in any room, finds none). */
export function claimCrown(key: string, now = Date.now()): CrownPay | undefined {
  const c = warCrownSave(), p = c?.pay?.[key];
  if (!c || !p) return undefined;
  delete c.pay![key];
  warCrownChanged(now, true);
  return now < p.until ? p : undefined;
}

/** Tests only (no message reaches it): open a Reckoning now, for `ms`. */
export function _startReckoning(now = Date.now(), ms = RECKONING.hours * 3600_000) {
  const c = warCrownSave();
  if (!c) return;
  delete c.cur;
  open({ start: now, end: now + ms });
  warCrownChanged(now);
}
/** Tests: the Reckoning under way (read-only). */
export const _reckoning = () => warCrownSave()?.cur;

// ---- In a room -----------------------------------------------------------------------------------------------------

const when = (ms: number) => new Date(ms).toISOString().slice(11, 16) + " UTC";
const scoreLine = (sc: Record<ClanKey, number>) => standings(sc).map((k) => `${CLANS[k].name} ${Math.round(sc[k])}`).join(", ");
/** The Herald's line for a piece of Reckoning news. */
export function crownLine(n: CrownNews): string {
  const keepName = keep?.name ?? "the Crown Keep";
  if (n.kind === "warn") return `The Reckoning begins in an hour (${when(n.start)}): hold the Crown's lands and fight there for ${keepName}.${n.holder ? ` ${CLANS[n.holder].name} hold it now.` : ""}`;
  if (n.kind === "start") return `The Reckoning has begun! Until ${when(n.end)} every land of the Crown counts, ${keepName} thrice, and every blow struck there by a sworn hero.`;
  if (n.kind === "standings") return `The Reckoning stands: ${scoreLine(n.score!)}.`;
  const w = CLANS[n.winner!].name;
  return n.kept ? `The Reckoning is over: ${w} keep ${keepName} (${scoreLine(n.score!)}). Their sworn earn more gold and renown until the next.`
    : `The Reckoning is over: ${w} take ${keepName}! (${scoreLine(n.score!)}). Their sworn earn more gold and renown until the next.`;
}

/** The parts of a hero the Reckoning reads and pays (TownRoom's Player). */
export interface CrownHero { name: string; cls: string; clan?: ClanKey; gold: number; renown: number }
export interface CrownHost {
  heroes(): Iterable<[string, CrownHero]>;
  hero(id: string): CrownHero | undefined;
  broadcast(type: string, msg: unknown): void;
  send(id: string, type: string, msg: unknown): void;
  /** A hero reached a new renown rank. */
  ranked(id: string, rank: string): void;
  /** A hero's renown changed (the "clan" message). */
  renowned(id: string): void;
}

/** A room's side of the Reckoning: the Herald and the "reckon" notice, the pay of its heroes. */
export class WarCrown {
  constructor(private h: CrownHost) {}

  /** Subscribes to the Reckoning's news; returns the unsubscribe. */
  attach() {
    return onCrown((n) => {
      this.h.broadcast("chat", { id: "", name: "Herald", text: crownLine(n) });
      this.h.broadcast("reckon", { kind: n.kind, start: n.start, end: n.end, ...(n.score ? { score: CLAN_KEYS.map((k) => Math.round(n.score![k])) } : {}),
        ...(n.winner ? { winner: CLAN_KEYS.indexOf(n.winner), kept: !!n.kept } : {}) }); // (a notice in the pixel font: client/src/warNotice.ts)
      if (n.kind === "result") for (const [id] of this.h.heroes()) this.pay(id);
    });
  }

  /** A hero joined: their pay waiting, and a word when a Reckoning runs or is near. */
  join(id: string, now = Date.now()) {
    this.pay(id, now);
    const c = warCrownSave(), w = reckoningAt(now);
    if (c?.cur) this.h.send(id, "chat", { id: "", name: "Herald", text: `The Reckoning is under way until ${when(c.cur.end)}: ${scoreLine(scoresOf(c.cur))}.` });
    else if (now >= w.start - RECKONING.warnMs) this.h.send(id, "chat", { id: "", name: "Herald", text: `The Reckoning begins at ${when(w.start)}.` });
  }

  /** Pays hero `id` what a Reckoning owes them (once). */
  pay(id: string, now = Date.now()) {
    const p = this.h.hero(id);
    if (!p) return;
    const got = claimCrown(heroKey(p.name, p.cls), now);
    if (!got) return;
    const was = rankOf(p.renown);
    p.gold += got.gold; p.renown += got.renown;
    const rank = rankOf(p.renown);
    this.h.send(id, "chat", { id: "", name: "Herald", text: `For your part in the Reckoning${got.won ? ", won by your clan" : ""}: +${got.gold} gold and +${got.renown} renown.` });
    if (rank > was) this.h.ranked(id, RENOWN_RANKS[rank].name); else this.h.renowned(id);
  }
}
