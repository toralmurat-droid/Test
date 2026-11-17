/**
 * Crossing between Ages (docs/ages-progress.md part 8; rules, texts and message shapes in shared/ageCross.ts). A hero
 * asks to go to another open Age; this server checks the hero and the target (the gateway's list, fetched afresh),
 * freezes the hero, saves, waits for the account's commit and the handoff spot (which carries `crossed`, so the next
 * Age keeps the cooldown), then sends "cross" and closes with CROSS_CLOSE. The room's onLeave saves once more and gives
 * the account lease back; the client then logs in through the gateway on the target Age, which takes the lease.
 * On only with shared accounts (account leases), AGE_SLOT and GATEWAY_URL; off, the room behaves as before.
 * TownRoom keeps only the wiring (an AgeCross per room); the list cache and the per-account cooldowns are per process.
 */
import { ACCOUNT_API } from "../shared/accountApi";
import { ACTIVE_CLASSES } from "../shared/classes";
import {
  AGE_SLOT_RE, CROSS, CROSS_CLOSE, CROSS_SPEAKER, CROSS_TEXT, GATEWAY_AGES_PATH, ageName, cleanAgesList, crossRefusal,
  type AgeRow, type AgeSelf, type AgesList, type AgesMsg,
} from "../shared/ageCross";
import { accountsShared, settleAccount } from "./accounts";
import { handoffWritten } from "./handoff";

/** Fetches a JSON document within `ms` (rejects on a timeout, a non-200 or bad JSON). */
export type JsonFetcher = (url: string, ms: number) => Promise<unknown>;
const fetchJson: JsonFetcher = async (url, ms) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`status ${r.status}`);
  return r.json();
};

interface Config {
  /** The gateway's base URL (GATEWAY_URL, private network), or undefined: crossing off. */
  url?: string;
  /** This server's slot (AGE_SLOT); empty: crossing off. */
  here: string;
  fetch: JsonFetcher;
  /** Waits for the account's commit (server/accounts.ts settleAccount; tests replace it). */
  settle: (name: string) => Promise<boolean>;
  now: () => number;
  /** Crossing also needs shared accounts (tests may force it). */
  shared: () => boolean;
}
const fromEnv = (env = process.env): Config => ({
  url: env.GATEWAY_URL?.replace(/\/+$/, "") || undefined,
  here: AGE_SLOT_RE.test(env.AGE_SLOT ?? "") ? env.AGE_SLOT! : "",
  fetch: fetchJson, settle: settleAccount, now: Date.now, shared: accountsShared,
});
let cfg: Config = fromEnv();
let cache: { at: number; list?: AgesList; p?: Promise<AgesList | undefined> } | undefined;
/** Per account (lower-case name): when it last crossed from here or arrived having crossed (ms). */
const crossedAt = new Map<string, number>();
const stats = { crossed: 0, refused: 0, failed: 0, listFails: 0 };

/** Tests: replace parts of the config (and forget the cache, the cooldowns and the counters). */
export function setAgeCross(over: Partial<Config> & { env?: NodeJS.ProcessEnv } = {}) {
  const { env, ...rest } = over;
  cfg = { ...fromEnv(env), ...rest };
  cache = undefined; crossedAt.clear();
  Object.assign(stats, { crossed: 0, refused: 0, failed: 0, listFails: 0 });
}

/** Crossing is on: shared accounts, this server's slot and the gateway's address are known. */
export const crossOn = () => !!cfg.url && !!cfg.here && cfg.shared();

/** This server's own info, public (GET /age-info.json; the gateway probes it for its list). */
export const ageInfo = (build: string, env = process.env): AgeSelf =>
  ({ slot: env.AGE_SLOT || "main", build, accountApi: ACCOUNT_API, classes: [...ACTIVE_CLASSES] });

/** For /admin/ages.json (server/agesStatus.ts): counts since boot. */
export const crossStats = () => ({ on: crossOn(), here: cfg.here || null, gateway: !!cfg.url, cooldowns: crossedAt.size, ...stats });

/** The gateway's list of open Ages: cached CROSS.listCacheMs (the menu), or `fresh` (a crossing). Undefined: unreachable. */
export function agesList(fresh = false): Promise<AgesList | undefined> {
  const now = cfg.now();
  if (!fresh && cache?.list && now - cache.at < CROSS.listCacheMs) return Promise.resolve(cache.list);
  if (cache?.p) return cache.p; // (one fetch at a time; a crossing waiting on it gets a list at most 2 s old)
  const url = `${cfg.url}${GATEWAY_AGES_PATH}`;
  const p = cfg.fetch(url, CROSS.fetchMs).then(cleanAgesList, (e) => { console.error(`Ages: could not fetch ${url}:`, e?.message ?? e); return undefined; });
  const entry: NonNullable<typeof cache> = { at: cache?.at ?? 0, list: cache?.list, p };
  cache = entry;
  return p.then((list) => {
    if (cache === entry) cache = list ? { at: cfg.now(), list } : { at: entry.at, list: entry.list };
    if (!list) stats.listFails++;
    return list;
  });
}

/** When this account last crossed, while its cooldown runs (ms), else undefined. */
export function crossedFor(name: string): number | undefined {
  const k = name.trim().toLowerCase(), t = crossedAt.get(k);
  if (t === undefined) return undefined;
  if (cfg.now() - t >= CROSS.cooldownMs) { crossedAt.delete(k); return undefined; }
  return t;
}
/** A crossing time another Age wrote (its clock: never later than ours, so a skew cannot lengthen the cooldown). */
function noteCrossed(name: string, at: number) {
  const t = Math.min(at, cfg.now());
  if (Number.isFinite(t) && t > (crossedFor(name) ?? -Infinity) && cfg.now() - t < CROSS.cooldownMs) crossedAt.set(name.trim().toLowerCase(), t);
}

/** What a crossing needs of a hero (server/player.ts Player). */
export interface CrossHero {
  name: string; cls: string; dead: boolean; lastHurt: number; invulnUntil: number;
  input: { up: boolean; down: boolean; left: boolean; right: boolean; vx?: number; vy?: number };
}
/** What a crossing needs of the room (server/TownRoom.ts). */
export interface CrossHost {
  hero(sid: string): CrossHero | undefined;
  trading(sid: string): boolean;
  /** Saves the hero and remembers their spot (rememberLive, with `crossed` from crossedFor). */
  save(sid: string): void;
  send(sid: string, type: string, msg: unknown): void;
  leave(sid: string, code: number): void;
}

/** Messages a crossing hero may still send (everything else is dropped while frozen). */
const WHILE_FROZEN = new Set(["ping"]);
/** Messages that count as fighting for the quiet rule (with being hit: Player.lastHurt). */
const FIGHT = new Set(["attack", "cast", "useslot", "ranged"]);
const CMD = /^\/age(?:\s+(\S*))?\s*$/i;

/** One room's side of crossing: frozen heroes, their last fight, and the messages. */
export class AgeCross {
  private frozen = new Set<string>();
  private asking = new Set<string>(); // a crossing waiting for the gateway's list (before the freeze)
  private fought = new Map<string, number>();
  constructor(private host: CrossHost) {}

  /** Every client message passes here (TownRoom limitMessages): false = drop it (the hero is crossing). */
  gate(sid: string, type: string): boolean {
    if (this.frozen.has(sid)) return WHILE_FROZEN.has(type);
    if (FIGHT.has(type)) this.fought.set(sid, cfg.now());
    return true;
  }

  /** A hero joined: the cooldown their spot carried (another Age's crossing), and "ages" when crossing is on. */
  join(name: string, crossed: number | undefined, send: (type: string, msg: unknown) => void) {
    if (crossed !== undefined) noteCrossed(name, crossed);
    if (crossOn()) send("ages", { on: true, here: cfg.here } satisfies AgesMsg);
  }
  leave(sid: string) { this.frozen.delete(sid); this.asking.delete(sid); this.fought.delete(sid); }
  /** The handoff spot's crossing field for this hero ({} when none: the spot is as before). */
  spot(name: string): { crossed?: number } { const t = crossedFor(name); return t === undefined ? {} : { crossed: t }; }

  /** A chat line that is a crossing command ("/age", "/age <slot>"). */
  isCmd(text: unknown) { return typeof text === "string" && CMD.test(text.trim()); }

  /** "/age" lists the Ages in chat; "/age <slot>" crosses. */
  async chat(sid: string, text: string) {
    const m = CMD.exec(text.trim());
    if (!m) return;
    if (!crossOn()) return this.say(sid, CROSS_TEXT.off);
    if (m[1]) return this.cross(sid, { slot: m[1].toLowerCase() });
    const msg = await this.listMsg(sid);
    if (!msg) return;
    if (msg.err) return this.say(sid, msg.err);
    for (const r of msg.list ?? []) this.say(sid, `${r.name} (/age ${r.slot}): ${r.here ? CROSS_TEXT.here : r.why ?? "you may cross"}`);
    if (msg.list?.some((r) => !r.why)) this.say(sid, CROSS_TEXT.usage);
  }

  /** Client "ages": the list with this hero's reasons. */
  async ask(sid: string) {
    if (!crossOn()) return this.say(sid, CROSS_TEXT.off);
    const msg = await this.listMsg(sid);
    if (msg) this.host.send(sid, "ages", msg);
  }

  private async listMsg(sid: string): Promise<AgesMsg | undefined> {
    const list = await agesList();
    const p = this.host.hero(sid);
    if (!p) return undefined;
    if (!list) return { on: true, here: cfg.here, list: [], err: CROSS_TEXT.listFail };
    const rows = list.ages.map((a): AgeRow => {
      const why = crossRefusal(this.check(sid, p, a.slot, list));
      return { slot: a.slot, name: a.name || ageName(a.slot), here: a.slot === cfg.here, ...(why ? { why } : {}) };
    });
    return { on: true, here: cfg.here, list: rows };
  }

  private check(sid: string, p: CrossHero, slot: string, list: AgesList) {
    const now = cfg.now();
    return {
      slot, here: cfg.here, ages: list.ages, cls: p.cls, dead: p.dead, trading: this.host.trading(sid),
      crossing: this.frozen.has(sid) || this.asking.has(sid), lastFight: Math.max(p.lastHurt, this.fought.get(sid) ?? 0),
      crossedAt: crossedFor(p.name), now,
    };
  }

  /** Client "cross" {slot} (also "/age <slot>"). Never throws. */
  async cross(sid: string, raw: unknown) {
    const slot = raw && typeof raw === "object" ? (raw as { slot?: unknown }).slot : undefined;
    if (typeof slot !== "string" || !AGE_SLOT_RE.test(slot)) return;
    if (!crossOn()) return this.say(sid, CROSS_TEXT.off);
    let p = this.host.hero(sid);
    if (!p) return;
    if (this.frozen.has(sid) || this.asking.has(sid)) return this.say(sid, CROSS_TEXT.crossing);
    if (slot === cfg.here) return this.say(sid, CROSS_TEXT.here);
    this.asking.add(sid);
    let list: AgesList | undefined;
    try { list = await agesList(true); } finally { this.asking.delete(sid); }
    p = this.host.hero(sid);
    if (!p) return; // (left meanwhile)
    if (!list) { stats.refused++; return this.say(sid, CROSS_TEXT.listFail); }
    const why = crossRefusal(this.check(sid, p, slot, list));
    if (why) { stats.refused++; return this.say(sid, why); }
    // Frozen from here: no input, no attack or skill, no trade; unhurt while the save runs
    const now = cfg.now(), name = p.name, prev = crossedFor(name), inv = p.invulnUntil;
    this.frozen.add(sid);
    p.input = { up: false, down: false, left: false, right: false };
    p.invulnUntil = Math.max(p.invulnUntil, now + CROSS.saveMs + 2_000);
    crossedAt.set(name.trim().toLowerCase(), now); // (the spot written now carries it)
    let ok = false;
    try {
      this.host.save(sid);
      const spot = handoffWritten(name, p.cls) ?? Promise.resolve();
      let t: NodeJS.Timeout | undefined;
      ok = await Promise.race([
        Promise.all([spot, cfg.settle(name)]).then(([, s]) => s),
        new Promise<boolean>((res) => { t = setTimeout(() => res(false), CROSS.saveMs); }),
      ]).finally(() => clearTimeout(t));
    } catch (e: any) { console.error(`Ages: crossing of ${name} could not save:`, e?.message ?? e); }
    const still = this.host.hero(sid) === p;
    if (!ok) {
      stats.failed++;
      if (prev === undefined) crossedAt.delete(name.trim().toLowerCase()); else crossedAt.set(name.trim().toLowerCase(), prev);
      this.frozen.delete(sid);
      if (still) { p.invulnUntil = inv; this.say(sid, CROSS_TEXT.saveFail); }
      return;
    }
    if (!still) return; // (left while it saved: their onLeave saved them; the cooldown stands)
    stats.crossed++;
    console.log(`Ages: ${name} crosses from ${cfg.here} to ${slot}`);
    this.host.send(sid, "cross", { slot });
    this.host.leave(sid, CROSS_CLOSE);
  }

  private say(sid: string, text: string) { this.host.send(sid, "chat", { id: "", name: CROSS_SPEAKER, text }); }
}
