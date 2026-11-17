/**
 * The War Councils on the server (roadmap M3, part 1): once per war day each clan whose council is on hears its
 * briefing, its provider decides, the orders are validated (shared/war/council.ts) and, in `lead` mode, become the
 * clan's intent for the day; in `shadow` mode they are only logged and compared with what the doctrine did. Every
 * decision, rejection and fallback goes to an append-only log in the war save (capped), and a plain-text digest of each
 * war day is kept there too (admin route /admin/war-digest).
 *
 * Providers: `scripted` (the doctrine's own answer, deterministic) and `remote` (orders a scheduled Claude routine
 * POSTs to /api/war/council/orders before the day's session: docs/war-council-routine.md). No AI call runs in this
 * process and nothing here needs a dependency. A provider that throws, times out or hands in illegal orders leaves the
 * doctrine leading that clan for the day (logged).
 *
 * Config (env, read by configureCouncils at start; setters for tests and admins):
 * - WAR_COUNCIL: `off` (default), `shadow` or `lead` for every clan, or per clan `wardens:lead,host:shadow` (a bare
 *   mode first sets every clan: `shadow,redfang:lead`).
 * - WAR_COUNCIL_PROVIDER: `scripted` (default) or `remote`, same format.
 * - WAR_COUNCIL_KILL=1: the kill switch (also killCouncils()): every clan reverts to the doctrine at once.
 * - WAR_COUNCIL_TOKEN: the bearer token of the remote routes (unset or shorter than 16 characters: routes off).
 *
 * The Forge (M4 PR4): an order set may carry one `forge` recipe. It is checked apart from the targets
 * (validateForgeOrder): a bad recipe is logged as a forge rejection and never stops the targets from leading, and bad
 * targets never stop a legal recipe. At the session a `lead` council commissions it (server/forge.ts commission: paid,
 * gated, live a research day later), a `shadow` council only logs it; one forge order per clan per war day (`forged`).
 * The scripted council never forges (tests can give it a recipe: _setScriptedForge).
 */
import crypto from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import { CLANS, CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import {
  agrees, buildBriefing, COUNCIL, COUNCIL_MODES, COUNCIL_STANCES, councilOrders, dailyDigest, FORGE_NOTE_STATUSES, intentOf, ORDER_SCHEMA, scriptedCouncil,
  validateCouncil, validateForgeOrder, warDay,
  type BriefingCtx, type CouncilBriefing, type CouncilIntent, type CouncilLogEntry, type CouncilMode, type CouncilOrders, type ForgeNote,
} from "../shared/war/council";
import { validateRecipe } from "../shared/forge";
import { commission, forgeBrief, forgeClock, forgeDayLines, forgeKilled, forgeTicking } from "./forge";
import type { Mind } from "../shared/war/doctrine";
import { warPairs } from "../shared/war/feuds";
import { reckoningAt } from "../shared/war/crown";
import { WAR, type Orders, type WarState } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { KeyedLimiter, clientIp } from "./ratelimit";
import { warBattles, warCouncilChanged, warCouncilSave, warCrownSave, warLog, warNextTick, warState } from "./war";

/** A council: hears a briefing, hands in orders (never trusted: validateCouncil checks them). */
export interface CouncilProvider { name: string; decide(b: CouncilBriefing): Promise<unknown> }

/** The day's intent as saved: the mode it was decided in, and (shadow) ticks the doctrine agreed / ticks counted. */
export interface SavedIntent extends CouncilIntent { mode: CouncilMode; agree?: [number, number] }
/**
 * The war save's `council` field (optional: a save without it has had no council yet; read through cleanCouncil).
 * `held`: the last war day each clan's council sat. `pending`: remote orders accepted for a day not yet sat.
 * `digested`, `since`: the last war day digested and when (ms).
 */
export interface CouncilSave {
  intents: Partial<Record<ClanKey, SavedIntent>>;
  held: Partial<Record<ClanKey, number>>;
  pending: Partial<Record<ClanKey, { day: number; at: number; orders: CouncilOrders }>>;
  log: CouncilLogEntry[];
  digests: { day: number; at: number; text: string }[];
  digested?: number; since?: number;
  /** The last war day each clan's council handed in a forge order the forge took (commissioned or shadow-logged). */
  forged?: Partial<Record<ClanKey, number>>;
}

// ---- Save ------------------------------------------------------------------------------------------------------------

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isDay = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 0;
const isClan = (v: unknown): v is ClanKey => typeof v === "string" && CLAN_KEYS.includes(v as ClanKey);
const ids = (v: unknown): number[] => (Array.isArray(v) ? v.filter((t) => Number.isInteger(t) && t >= 0 && t < TERRITORIES.length).slice(0, COUNCIL.maxTargets) : []);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
function cleanOrdersSave(v: unknown): CouncilOrders | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>, o: CouncilOrders = { targets: ids(r.targets) };
  if (isClan(r.clan)) o.clan = r.clan;
  if (isDay(r.day)) o.day = r.day;
  if (COUNCIL_STANCES.includes(r.stance as never)) o.stance = r.stance as CouncilOrders["stance"];
  const p = str(r.proclamation, COUNCIL.proclamationMax), why = str(r.rationale, COUNCIL.rationaleMax);
  if (p) o.proclamation = p;
  if (why) o.rationale = why;
  const f = r.forge !== undefined ? validateRecipe(r.forge) : undefined; // (a recipe no longer legal is dropped: the session would refuse it)
  if (f?.ok && (!isClan(r.clan) || f.recipe.clan === r.clan)) o.forge = f.recipe;
  return o;
}
const FORGE_KINDS = ["weapon", "monster"];
function cleanForgeNote(v: unknown): ForgeNote | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  if (!FORGE_NOTE_STATUSES.includes(r.status as ForgeNote["status"])) return undefined;
  const n: ForgeNote = { status: r.status as ForgeNote["status"] };
  if (FORGE_KINDS.includes(r.kind as string)) n.kind = r.kind as ForgeNote["kind"];
  const name = str(r.name, 40), base = str(r.base, 40);
  if (name) n.name = name;
  if (base) n.base = base;
  if (isDay(r.seq)) n.seq = r.seq;
  if (isDay(r.liveDay)) n.liveDay = r.liveDay;
  if (Array.isArray(r.errors)) n.errors = r.errors.filter((m) => typeof m === "string").slice(0, 12).map((m) => (m as string).slice(0, 200));
  return n;
}

/** The war save's `council` field, cleaned: malformed parts are dropped, so an old save (none) reads as no council yet. Pure. */
export function cleanCouncil(raw: unknown): CouncilSave {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: CouncilSave = { intents: {}, held: {}, pending: {}, log: [], digests: [] };
  const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  for (const k of CLAN_KEYS) {
    const it = rec(rec(r.intents)[k]);
    if (isDay(it.day) && COUNCIL_MODES.includes(it.mode as CouncilMode) && COUNCIL_STANCES.includes(it.stance as never)) {
      const x: SavedIntent = { day: it.day, targets: ids(it.targets), stance: it.stance as SavedIntent["stance"], mode: it.mode as CouncilMode };
      if (Array.isArray(it.agree) && it.agree.length === 2 && it.agree.every(isDay)) x.agree = [it.agree[0], it.agree[1]];
      out.intents[k] = x;
    }
    const h = rec(r.held)[k];
    if (isDay(h)) out.held[k] = h;
    const p = rec(rec(r.pending)[k]), po = cleanOrdersSave(p.orders);
    if (isDay(p.day) && isNum(p.at) && po) out.pending[k] = { day: p.day, at: p.at, orders: po };
  }
  const STATUS = ["led", "shadow", "fallback", "rejected", "forge_rejected"];
  for (const e of Array.isArray(r.log) ? r.log.slice(-COUNCIL.logMax) : []) {
    const x = rec(e);
    if (!isNum(x.at) || !isDay(x.day) || !isClan(x.k) || !COUNCIL_MODES.includes(x.mode as CouncilMode) || !STATUS.includes(x.status as string)) continue;
    const y: CouncilLogEntry = { at: x.at, day: x.day, k: x.k, mode: x.mode as CouncilMode, provider: str(x.provider, 32) ?? "?", status: x.status as CouncilLogEntry["status"] };
    const o = cleanOrdersSave(x.orders);
    if (o) y.orders = o;
    if (Array.isArray(x.errors)) y.errors = x.errors.filter((m) => typeof m === "string").slice(0, 12).map((m) => (m as string).slice(0, 200));
    if (typeof x.reason === "string") y.reason = x.reason.slice(0, 200);
    if (Array.isArray(x.agree) && x.agree.length === 2 && x.agree.every(isDay)) y.agree = [x.agree[0], x.agree[1]];
    const fn = cleanForgeNote(x.forge);
    if (fn) y.forge = fn;
    out.log.push(y);
  }
  for (const d of Array.isArray(r.digests) ? r.digests.slice(-COUNCIL.digestKeep) : []) {
    const x = rec(d);
    if (isDay(x.day) && isNum(x.at) && typeof x.text === "string") out.digests.push({ day: x.day, at: x.at, text: x.text.slice(0, 20_000) });
  }
  if (isDay(r.digested)) out.digested = r.digested;
  if (isNum(r.since)) out.since = r.since;
  for (const k of CLAN_KEYS) {
    const f = rec(r.forged)[k];
    if (isDay(f)) (out.forged ??= {})[k] = f;
  }
  return out;
}

/** The council save on a changed war map: intents and pending orders name territory ids, so they go (the log stays). */
export const councilOnNewMap = (c: CouncilSave | undefined): CouncilSave | undefined => (c ? { ...c, intents: {}, pending: {} } : c);

// ---- Config, kill switch -----------------------------------------------------------------------------------------------

const modes = {} as Record<ClanKey, CouncilMode>, providerOf = {} as Record<ClanKey, string>;
let killed = false;

/** `shadow,redfang:lead` style: a bare value sets every clan, `clan:value` one clan. Unknown parts are ignored (logged). */
function parseClanMap<T extends string>(raw: string | undefined, ok: readonly T[], into: Record<ClanKey, T>) {
  for (const part of (raw ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const [a, b] = part.split(":").map((x) => x.trim());
    if (b === undefined && ok.includes(a as T)) { for (const k of CLAN_KEYS) into[k] = a as T; continue; }
    if (isClan(a) && ok.includes(b as T)) into[a] = b as T;
    else console.warn(`War councils: ignored config "${part}"`);
  }
}
/** Reads the council config (module comment). Every clan off with the scripted provider unless the env says otherwise. */
export function configureCouncils(env: NodeJS.ProcessEnv = process.env) {
  for (const k of CLAN_KEYS) { modes[k] = "off"; providerOf[k] = "scripted"; }
  parseClanMap(env.WAR_COUNCIL, COUNCIL_MODES, modes);
  parseClanMap(env.WAR_COUNCIL_PROVIDER, [...providers.keys()], providerOf);
  killed = env.WAR_COUNCIL_KILL === "1" || env.WAR_COUNCIL_KILL === "true";
  const on = CLAN_KEYS.filter((k) => modes[k] !== "off");
  if (on.length && !env.NODE_TEST_CONTEXT) console.log(`War councils: ${on.map((k) => `${k} ${modes[k]} (${providerOf[k]})`).join(", ")}${killed ? " - KILLED, doctrine leads" : ""}`);
}
/** Clan `k`'s council mode as it acts now: off while the kill switch is on. */
export const councilMode = (k: ClanKey): CouncilMode => (killed ? "off" : modes[k] ?? "off");
export function setCouncilMode(k: ClanKey, m: CouncilMode) { if (isClan(k) && COUNCIL_MODES.includes(m)) modes[k] = m; }
export function setCouncilProvider(k: ClanKey, name: string) { if (isClan(k) && providers.has(name)) providerOf[k] = name; }
/** The kill switch: on, every clan reverts to its doctrine from the very next orders (intents stay saved but unused). */
export function killCouncils(on = true) { killed = on; if (on) console.log("War councils: kill switch on, the doctrine leads every clan"); }
export const councilsKilled = () => killed;

// ---- Providers -------------------------------------------------------------------------------------------------------

const providers = new Map<string, CouncilProvider>();
/** Adds a provider (a future in-process council would register here; none needs an API today). */
export function registerProvider(p: CouncilProvider) { providers.set(p.name, p); }
/** Tests only: a forge order the scripted council adds (raw, never checked here). Unset: the scripted council never forges. */
let scriptedForge: ((b: CouncilBriefing) => unknown) | undefined;
export function _setScriptedForge(f?: (b: CouncilBriefing) => unknown) { scriptedForge = f; }
registerProvider({
  name: "scripted",
  decide: async (b) => { const o = scriptedCouncil(b); return scriptedForge ? { ...o, forge: scriptedForge(b) } : o; },
});
registerProvider({
  name: "remote",
  decide: async (b) => {
    const p = warCouncilSave()?.pending[b.clan];
    if (!p || p.day !== b.day) throw new Error(`no orders arrived for war day ${b.day}`);
    return p.orders;
  },
});
configureCouncils();

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const t = new Promise<never>((_, no) => { timer = setTimeout(() => no(new Error(`no answer within ${ms} ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

// ---- The tick side ---------------------------------------------------------------------------------------------------

/** The intents that lead now: clans in `lead` mode whose council led today's war day (none with the kill switch on). */
export function leadIntents(cs: CouncilSave | undefined, tick: number): Partial<Record<ClanKey, CouncilIntent>> {
  const out: Partial<Record<ClanKey, CouncilIntent>> = {};
  if (killed || !cs) return out;
  for (const k of CLAN_KEYS) { const it = cs.intents[k]; if (it && it.mode === "lead" && it.day === warDay(tick) && councilMode(k) === "lead") out[k] = it; }
  return out;
}
/** The leaders' orders for a tick (server/war.ts): the doctrine, with the leading councils' intents on top. */
export const leaderOrders = (s: WarState, minds: Record<ClanKey, Mind>, rnd: () => number, cs: CouncilSave | undefined): Record<ClanKey, Orders> =>
  councilOrders(s, minds, rnd, leadIntents(cs, s.tick));
/** Shadow mode: after the orders for a tick are given, counts whether the doctrine's main target matched the council's. */
export function noteOrders(s: WarState, orders: Partial<Record<ClanKey, Orders>>, cs: CouncilSave | undefined) {
  if (!cs || killed) return;
  for (const k of CLAN_KEYS) {
    const it = cs.intents[k];
    if (!it || it.mode !== "shadow" || it.day !== warDay(s.tick) || councilMode(k) !== "shadow") continue;
    const a = (it.agree ??= [0, 0]);
    a[1]++;
    if (agrees(s, k, orders[k], it)) a[0]++;
  }
}

/** Lead proclamations waiting for the next war tick's news (the Herald announces them). */
const proclaims: { clan: ClanKey; text: string }[] = [];
export const takeProclamations = () => proclaims.splice(0);
/** The Herald's line for a council's proclamation. */
export const proclaimLine = (clan: ClanKey, text: string) => `The war council of ${CLANS[clan].name} proclaims: "${text}"`;

// ---- Sessions --------------------------------------------------------------------------------------------------------

let busy: Promise<void> | undefined;
const cap = (m: string[]) => m.slice(0, 12).map((x) => x.slice(0, 200)); // as on load: client text never grows the save
function logCouncil(cs: CouncilSave, e: CouncilLogEntry) {
  if (e.errors) e.errors = cap(e.errors);
  if (e.forge?.errors) e.forge = { ...e.forge, errors: cap(e.forge.errors) };
  cs.log.push(e);
  if (cs.log.length > COUNCIL.logMax) cs.log.splice(0, cs.log.length - COUNCIL.logMax);
  if (!process.env.NODE_TEST_CONTEXT) console.log(`War council: ${e.k} day ${e.day} ${e.status}${e.reason ? ` (${e.reason})` : ""}${e.errors?.length ? `: ${e.errors.join("; ")}` : ""}`);
}

/** Clan k's briefing for war day `day`: the shared context plus its side of the Forge. */
const briefFor = (s: NonNullable<ReturnType<typeof warState>>, k: ClanKey, ctx: BriefingCtx, day: number) => buildBriefing(s, k, { ...ctx, forge: forgeBrief(k, day) }, day);

/** What the server adds to a briefing: the clans at war, the last day's events, the Reckoning. */
function briefCtx(now: number): BriefingCtx {
  const w = reckoningAt(now), last = warCrownSave()?.last;
  return {
    wars: warPairs(), events: warLog(200).filter((e) => e.at > now - 24 * 3600_000),
    reckoning: { start: w.start, end: w.end, ...(now >= w.start && now < w.end ? { on: true } : {}), ...(last ? { lastWinner: last.winner } : {}) },
  };
}

/** Clan `k`'s session for war day `day`: brief, decide (bounded by COUNCIL.timeoutMs), validate, apply, log. */
async function session(cs: CouncilSave, k: ClanKey, day: number, now: number) {
  const mode = councilMode(k), pname = providerOf[k] ?? "scripted", prov = providers.get(pname), s = warState();
  cs.held[k] = day; // (one session a day, whatever comes of it)
  delete cs.intents[k];
  if (!s) return;
  const base = { at: now, day, k, mode, provider: pname };
  let raw: unknown;
  try {
    if (!prov) throw new Error(`no provider "${pname}"`);
    raw = await withTimeout(prov.decide(briefFor(s, k, briefCtx(now), day)), COUNCIL.timeoutMs);
  } catch (e) {
    logCouncil(cs, { ...base, status: "fallback", reason: `provider failed: ${String((e as Error)?.message ?? e).slice(0, 160)}` });
    return;
  } finally {
    if (pname === "remote") delete cs.pending[k];
  }
  const v = validateCouncil(raw, warState() ?? s, k, day), now2 = councilMode(k);
  // the forge order on its own: whatever comes of it, the targets below are judged as if it were not there
  const f = sessionForge(cs, k, day, raw, now2, now), orders = f?.recipe ? { ...v.orders, forge: f.recipe } : v.orders, fx = f ? { forge: f.note } : {};
  if (!v.ok) { logCouncil(cs, { ...base, status: "fallback", reason: "invalid orders", orders, errors: v.errors, ...fx }); return; }
  if (now2 === "off") { logCouncil(cs, { ...base, status: "fallback", reason: "council switched off (kill switch) during the session", orders, ...fx }); return; }
  cs.intents[k] = { ...intentOf(v.orders, day), mode: now2, ...(now2 === "shadow" ? { agree: [0, 0] as [number, number] } : {}) };
  logCouncil(cs, { ...base, mode: now2, status: now2 === "lead" ? "led" : "shadow", orders, ...fx });
  if (now2 === "lead" && v.orders.proclamation) proclaims.push({ clan: k, text: v.orders.proclamation });
}

/** The raw orders' `forge` field (undefined when there is none). */
const forgeField = (raw: unknown): unknown => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>).forge ?? undefined : undefined);
/**
 * Clan k's forge order at its session for war day `day`: checked (validateForgeOrder), then commissioned (`lead`) or
 * logged (`shadow`) by server/forge.ts, at most once a clan a war day. Undefined when the orders carry none.
 */
function sessionForge(cs: CouncilSave, k: ClanKey, day: number, raw: unknown, mode: CouncilMode, now: number): { note: ForgeNote; recipe?: CouncilOrders["forge"] } | undefined {
  const rawF = forgeField(raw);
  if (rawF === undefined) return undefined;
  const c = validateForgeOrder(rawF, k);
  if (!c.ok || !c.recipe) return { note: { status: "rejected", errors: c.errors.slice(0, 12) } };
  const r = c.recipe, what = { kind: r.kind, name: r.name, base: r.base }, refused = (msg: string) => ({ note: { status: "refused" as const, ...what, errors: [msg] }, recipe: r });
  if (mode === "off") return refused("council switched off (kill switch) during the session");
  if ((cs.forged?.[k] ?? -1) >= day) return refused(`one forge order a war day: ${k} has forged on war day ${day} already`);
  const res = commission(k, r, day, mode, now);
  if (!res.ok) return refused(`${res.code}: ${res.msg}`);
  (cs.forged ??= {})[k] = day;
  if (mode === "lead") warCouncilChanged(now, true); // the forge saved its project at once: so must the war, or a crash forges twice
  return { note: mode === "lead" ? { status: "commissioned", ...what, ...(res.seq ? { seq: res.seq } : {}), ...(res.liveDay !== undefined ? { liveDay: res.liveDay } : {}) } : { status: "shadow", ...what }, recipe: r };
}

/** Closes war day `day`: the shadow councils' agreement goes into their log entries, then the day's digest is kept. */
function closeDay(cs: CouncilSave, day: number, now: number) {
  for (const k of CLAN_KEYS) {
    const it = cs.intents[k];
    if (!it || it.day !== day || !it.agree) continue;
    const e = [...cs.log].reverse().find((x) => x.k === k && x.day === day && x.status === "shadow");
    if (e) e.agree = [it.agree[0], it.agree[1]];
  }
  const since = cs.since ?? now - 24 * 3600_000, s = warState(), last = warCrownSave()?.last;
  const text = dailyDigest(day, {
    council: cs.log,
    events: warLog(200).filter((e) => e.at > since && e.at <= now),
    battles: warBattles().filter((b) => b.result && (b.done ?? 0) > since && (b.done ?? 0) <= now).map((b) => ({ kind: b.kind, t: b.t, a: b.a, b: b.b, result: b.result })),
    ...(last && last.at > since && last.at <= now ? { reckoning: { winner: last.winner, kept: last.kept } } : {}),
    ...(s ? { owner: s.owner } : {}),
    forge: forgeDayLines(day),
  });
  cs.digests.push({ day, at: now, text });
  if (cs.digests.length > COUNCIL.digestKeep) cs.digests.splice(0, cs.digests.length - COUNCIL.digestKeep);
  cs.digested = day; cs.since = now;
  if (!process.env.NODE_TEST_CONTEXT) console.log(text);
}

/**
 * Before the war ticks (server/war.ts step): the councils for the war day of the next orders, once per clan, and the
 * digest of the day before. Never runs two at once: a session still waiting on a slow provider leaves the tick to the
 * doctrine (its result applies when it lands). Exported for tests (await it to let every session finish).
 */
export async function councilClock(now = Date.now()) {
  if (busy) return;
  const s = warState(), cs = warCouncilSave();
  if (!s || !cs) return;
  if (!forgeTicking()) try { forgeClock(); } catch (e) { console.error("War councils: the forge clock failed:", e); } // (no forge timer: tests, tools)
  const day = warDay(s.tick + 1);
  if (day > 0 && (cs.digested ?? -1) < day - 1) { closeDay(cs, day - 1, now); warCouncilChanged(now); }
  const due = CLAN_KEYS.filter((k) => councilMode(k) !== "off" && (cs.held[k] ?? -1) < day);
  if (!due.length) return;
  busy = Promise.all(due.map((k) => session(cs, k, day, now))).then(() => undefined);
  try { await busy; } finally { busy = undefined; warCouncilChanged(now); }
}

// ---- Remote councils: the routine's endpoints -------------------------------------------------------------------------

/** The war day a remote council of `k` may hand orders in for: the next session's (today's while today's has not sat). */
export function openDay(k: ClanKey): number | undefined {
  const s = warState(), cs = warCouncilSave();
  if (!s || !cs) return undefined;
  const d = warDay(s.tick + 1);
  return (cs.held[k] ?? -1) >= d ? d + 1 : d;
}

/** The briefings for the remote routine: every clan (or one), the day each may order for, the schema, about when the session sits. */
export function councilBriefings(clan?: string, now = Date.now()): { status: number; body: unknown } {
  const s = warState(), cs = warCouncilSave();
  if (!s || !cs) return { status: 503, body: { error: "the war is not loaded" } };
  if (clan !== undefined && !isClan(clan)) return { status: 400, body: { error: `clan must be one of ${CLAN_KEYS.join(", ")}` } };
  const ctx = briefCtx(now), next = warNextTick() ?? now;
  const clans = (clan ? [clan as ClanKey] : CLAN_KEYS).map((k) => {
    const day = openDay(k)!, p = cs.pending[k];
    return {
      clan: k, mode: councilMode(k), provider: providerOf[k], day,
      sessionAt: next + Math.max(0, day * WAR.ticksPerDay - 1 - s.tick) * WAR.tickMs,
      ...(p ? { submitted: { day: p.day, at: p.at } } : {}),
      briefing: briefFor(s, k, ctx, day),
    };
  });
  return { status: 200, body: { now, warDay: warDay(s.tick), tick: s.tick, killed, schema: ORDER_SCHEMA, clans } };
}

/**
 * A remote council's orders ({clan, day, orders}): validated as any provider's, kept for that clan's war day (a later
 * submission for the same day replaces it until the session sits), a rejection logged. The answer names every error,
 * so the routine can fix and resubmit.
 */
export function submitCouncilOrders(body: unknown, now = Date.now()): { status: number; body: Record<string, unknown> } {
  const s = warState(), cs = warCouncilSave();
  if (!s || !cs) return { status: 503, body: { ok: false, errors: ["the war is not loaded"] } };
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!isClan(b.clan)) return { status: 400, body: { ok: false, errors: [`clan: must be one of ${CLAN_KEYS.join(", ")}`] } };
  const k = b.clan, open = openDay(k)!;
  if (!Number.isInteger(b.day)) return { status: 400, body: { ok: false, errors: ["day: must be the war day id from the briefing"], day: open } };
  if (killed || councilMode(k) === "off") return { status: 409, body: { ok: false, errors: [`the council of ${k} is off${killed ? " (kill switch)" : ""}`], day: open } };
  if (providerOf[k] !== "remote") return { status: 409, body: { ok: false, errors: [`the council of ${k} is not run remotely (provider ${providerOf[k]})`], day: open } };
  const day = b.day as number;
  if (day < open) return { status: 409, body: { ok: false, errors: [`day: war day ${day} is past; orders are open for war day ${open}`], day: open } };
  if (day > open) return { status: 409, body: { ok: false, errors: [`day: war day ${day} is not open yet; orders are open for war day ${open}`], day: open } };
  const v = validateCouncil(b.orders, s, k, day), rawF = forgeField(b.orders);
  // the forge order is judged on its own (answer's `forge`): a bad recipe never costs the targets their place
  const f = rawF === undefined ? undefined : validateForgeOrder(rawF, k);
  const fErr = f && (!f.ok ? f.errors : forgeKilled() ? ["forge.killed: the forge is off; no forge order is taken now"] : []);
  const forge = f ? { forge: { accepted: !fErr!.length, errors: fErr!, ...(f.recipe ? { recipe: f.recipe } : {}) } } : {};
  const note: ForgeNote | undefined = f && !f.ok ? { status: "rejected", errors: f.errors.slice(0, 12) } : undefined;
  if (!v.ok) {
    logCouncil(cs, { at: now, day, k, mode: councilMode(k), provider: "remote", status: "rejected", orders: v.orders, errors: v.errors, ...(note ? { forge: note } : {}) });
    warCouncilChanged(now);
    return { status: 422, body: { ok: false, accepted: false, day, errors: v.errors, orders: v.orders, ...forge } };
  }
  if (note) logCouncil(cs, { at: now, day, k, mode: councilMode(k), provider: "remote", status: "forge_rejected", errors: note.errors, forge: note });
  const orders: CouncilOrders = f?.ok && !fErr!.length ? { ...v.orders, forge: f.recipe } : v.orders;
  const replaced = cs.pending[k]?.day === day;
  cs.pending[k] = { day, at: now, orders };
  warCouncilChanged(now, true);
  return { status: 200, body: { ok: true, accepted: true, replaced, day, errors: [], orders, ...forge } };
}

/** Is `header` "Bearer <token>" for this token? Constant time (both sides hashed to one length). False when no token is set. */
export function councilAuth(header: unknown, token: string | undefined): boolean {
  if (!token || token.length < 16 || typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const h = (x: string) => crypto.createHash("sha256").update(x).digest();
  return crypto.timingSafeEqual(h(header.slice(7).trim()), h(token));
}

/**
 * The remote council routes, behind the WAR_COUNCIL_TOKEN bearer token (read per request; unset: 404). Rate-limited
 * per address, bodies capped at 8 kB. `env`: tests pass their own.
 */
export function mountCouncilRoutes(app: Express, env: NodeJS.ProcessEnv = process.env) {
  const limit = new KeyedLimiter(0.2, 20);
  const guard = (req: Request, res: Response): boolean => {
    res.setHeader("Cache-Control", "no-store");
    const token = env.WAR_COUNCIL_TOKEN;
    if (!token || token.length < 16) { res.sendStatus(404); return false; }
    if (!limit.take(clientIp(req))) { res.status(429).json({ ok: false, errors: ["too many requests"] }); return false; }
    if (!councilAuth(req.headers.authorization, token)) { res.status(401).json({ ok: false, errors: ["missing or wrong bearer token"] }); return false; }
    return true;
  };
  app.get("/api/war/council/briefing", (req, res) => {
    if (!guard(req, res)) return;
    const q = req.query.clan, r = councilBriefings(typeof q === "string" && q && q !== "all" ? q : undefined);
    res.status(r.status).json(r.body);
  });
  const json = express.json({ limit: "8kb" });
  app.post("/api/war/council/orders", (req, res, next) => { if (guard(req, res)) next(); }, (req, res, next) => {
    json(req, res, (err?: unknown) => {
      if (!err) { next(); return; }
      const status = (err as { status?: number }).status ?? 400;
      res.status(status).json({ ok: false, errors: [status === 413 ? "body too large (8 kB at most)" : "body: not valid JSON"] });
    });
  }, (req, res) => {
    const r = submitCouncilOrders(req.body);
    res.status(r.status).json(r.body);
  });
}

/** The admin view (/admin/war-digest): modes, kill switch, the kept digests and the latest log entries. */
export function councilAdmin(n = 60) {
  const cs = warCouncilSave();
  return { killed, modes: Object.fromEntries(CLAN_KEYS.map((k) => [k, { mode: modes[k], provider: providerOf[k] }])), digests: cs?.digests ?? [], log: cs?.log.slice(-n) ?? [] };
}

/** Tests: forget sessions in flight and proclamations (the save is reset with the war). */
export function _resetCouncils() { busy = undefined; proclaims.length = 0; scriptedForge = undefined; configureCouncils({ NODE_TEST_CONTEXT: "1" }); }
