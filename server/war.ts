/**
 * The live clan war (roadmap M1): one war for the whole server, independent of the room (a room closes when its last
 * player leaves; the war goes on). Every WAR.tickMs the scripted leaders (shared/war/doctrine.ts) give orders, the
 * players' valor of the last ten minutes is added, and shared/war/rules.ts moves the fronts. The state is saved after
 * every tick (Postgres table kv, or data/war.json) so a deploy never resets the war. The save names its territories, so
 * a new land or zone remaps the war by name (migrateWar) instead of restarting it.
 */
import { CLANS, CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds, scriptedOrders, type Mind } from "../shared/war/doctrine";
import { newWar, WAR, warTick, type Orders, type WarState } from "../shared/war/rules";
import { TERRITORIES, type Territory } from "../shared/war/territories";
import { regionByKey } from "../shared/war/regions";
import { tunnelStrikes, type TunnelStrike } from "../shared/war/tunnels";
import { warPhase, warView, type WarView } from "../shared/war/view";
import { eventVoice, leaderLine } from "../shared/war/heralds";
import { openKv, type Kv } from "./store";

export interface WarEvent { at: number; tick: number; kind: "siege" | "flip" | "held"; t: number; by: ClanKey; from: ClanKey; text: string }
/** `names`: the territory names in id order (optional: saves before 2026-11-15 have none, and their ids are today's). */
interface Saved { v: 1; state: WarState; minds: Record<ClanKey, Mind>; next: number; log: WarEvent[]; names?: string[] }

const KEY = "war";
const LOG_MAX = 200;
/** After downtime, ticks the war catches up at most (so a long outage does not replay a day at once). */
const CATCH_UP = 3;

let kv: Kv | undefined;
let saved: Saved | undefined;
let timer: NodeJS.Timeout | undefined;
let valor: Partial<Record<ClanKey, number>>[] = TERRITORIES.map(() => ({}));
/** The leaders' orders of the last tick (Hide-Kin tunnels, server/warTunnels.ts). Memory only: none after a restart until the next tick. */
let lastOrders: Partial<Record<ClanKey, Orders>> | undefined;
/** The tunnel strikes of those orders, read on the state before the tick (as rules.ts warTick saw it). */
let lastStrikes: TunnelStrike[] = [];
const listeners = new Set<(v: WarView, events: WarEvent[]) => void>();

/** Small seeded random per tick: the same tick always plays out the same way (easy to replay from the log). */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const namesNow = () => TERRITORIES.map((t) => t.name);

function fresh(now: number): Saved {
  return { v: 1, state: newWar(), minds: newMinds(), next: now + WAR.tickMs, log: [], names: namesNow() };
}

/** A saved war that is whole: every per-territory list the same length (any length: the map may have changed since). */
function wellFormed(s: Saved | undefined): s is Saved {
  const st = s?.state, n = st?.owner?.length;
  return !!s && s.v === 1 && !!st && Number.isFinite(s.next) && Array.isArray(s.log) && Array.isArray(st.owner) && n! > 0
    && [st.control, st.fort, st.siege, st.pressure].every((a) => Array.isArray(a) && a.length === n)
    && (s.names === undefined || (Array.isArray(s.names) && s.names.length === n && s.names.every((x) => typeof x === "string") && new Set(s.names).size === n))
    && st.owner.every((k) => !!CLANS[k]) && CLAN_KEYS.every((k) => Number.isFinite(st.army?.[k]) && !!s.minds?.[k]);
}

/**
 * The saved war on today's map: owner, Control, forts, sieges, pressure, the leaders' targets and the log follow their
 * territory by name. A territory new to the map starts with its capital's clan, else its land's home clan, else the
 * clan holding most of its neighbours, at full Control; one gone from the map is dropped (with its log lines). A capital
 * always starts with its clan. Pure: same names in the same order give the same war back. `oldNames` / `names` must not
 * repeat a name (wellFormed checks the save's).
 */
export function migrateWar(saved: Saved, oldNames: readonly string[], names: readonly string[], ts: readonly Territory[] = TERRITORIES): Saved {
  const was = new Map(oldNames.map((n, i) => [n, i])), from = names.map((n) => was.get(n)), st = saved.state;
  const pick = <T>(a: T[], seed: (i: number) => T) => from.map((o, i) => (o === undefined ? seed(i) : a[o]));
  const owner = pick<ClanKey | undefined>(st.owner, () => undefined);
  for (let i = 0; i < names.length; i++) {
    if (owner[i]) continue;
    const t = ts.find((x) => x.name === names[i]), home = t && regionByKey(t.region)?.home;
    const votes = new Map<ClanKey, number>();
    for (const m of t?.near ?? []) { const k = from[m] !== undefined ? owner[m] : undefined; if (k) votes.set(k, (votes.get(k) ?? 0) + 1); }
    const most = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
    owner[i] = t?.capitalOf ?? home ?? most ?? CLAN_KEYS[i % CLAN_KEYS.length];
  }
  const state: WarState = {
    ...st, owner: owner as ClanKey[],
    control: pick(st.control, () => 100), fort: pick(st.fort, () => 0),
    siege: pick(st.siege, () => null).map((x) => x && { ...x }), pressure: pick(st.pressure, () => 0), army: { ...st.army },
  };
  for (let i = 0; i < names.length; i++) {
    const cap = ts.find((x) => x.name === names[i])?.capitalOf;
    if (cap && state.owner[i] !== cap) { state.owner[i] = cap; state.control[i] = 100; state.siege[i] = null; }
  }
  const to = new Map<number, number>();
  from.forEach((o, i) => { if (o !== undefined) to.set(o, i); });
  const re = (t: number | undefined) => (t === undefined ? undefined : to.get(t));
  const minds = Object.fromEntries(CLAN_KEYS.map((k) => {
    const m = { ...saved.minds[k] }, target = re(m.target), feint = re(m.feint);
    if (target === undefined) delete m.target; else m.target = target;
    if (feint === undefined) delete m.feint; else m.feint = feint;
    return [k, m];
  })) as Record<ClanKey, Mind>;
  const log = saved.log.flatMap((e) => { const t = re(e.t); return t === undefined ? [] : [{ ...e, t }]; });
  return { ...saved, state, minds, log, names: [...names] };
}

/** The saved war read for today's map, or undefined when it cannot be (malformed, or an unnamed save of another size). */
function load(got: Saved | undefined): Saved | undefined {
  if (!wellFormed(got)) return undefined;
  const names = namesNow(), old = got.names ?? (got.state.owner.length === names.length ? names : undefined);
  return old && migrateWar(got, old, names);
}

/** Loads the war (or starts it) and starts the clock. Safe to call more than once. */
export async function startWar(store?: Kv) {
  if (timer) return;
  kv = store ?? (await openKv());
  // A load error stops the start (like the accounts): never let a fresh war overwrite a saved one we failed to read
  const got = await kv.get<Saved>(KEY), war = load(got);
  saved = war ?? fresh(Date.now());
  if (!war) {
    if (got) await kv.set(`${KEY}-old-${Date.now()}`, got); // a war that cannot be read: kept aside, not lost
    console.log(got ? "War: the saved war is malformed, a new war begins (old one kept)" : "War: a new war begins");
  } else {
    const old = got!.names;
    if (old && (old.length !== war.names!.length || old.some((n, i) => n !== war.names![i]))) {
      await kv.set(`${KEY}-old-${Date.now()}`, got); // the map changed: the remapped war goes on, the old save is kept aside
      const kept = war.names!.filter((n) => old.includes(n)).length;
      console.log(`War: the map changed (${kept} territories kept, ${war.names!.length - kept} new, ${old.length - kept} gone)`);
    }
    console.log(`War: tick ${saved.state.tick}, next in ${Math.max(0, Math.round((saved.next - Date.now()) / 1000))} s`);
  }
  timer = setInterval(() => { step(Date.now()).catch((e) => console.error("War: tick failed:", e)); }, 15_000);
  timer.unref?.();
}

export function stopWar() { if (timer) clearInterval(timer); timer = undefined; }

/** Runs every war tick that is due (at most CATCH_UP after downtime). Exported for tests. */
export async function step(now: number) {
  if (!saved || now < saved.next) return;
  const late = Math.floor((now - saved.next) / WAR.tickMs);
  if (late >= CATCH_UP) saved.next = now - (CATCH_UP - 1) * WAR.tickMs;
  const events: WarEvent[] = [];
  while (now >= saved.next) {
    const at = saved.next;
    saved.next += WAR.tickMs; // first: a tick that throws is skipped, never retried every 15 s
    try { events.push(...tickOnce(at)); } catch (e) { console.error("War: tick failed, skipped:", e); }
  }
  saved.log.push(...events);
  if (saved.log.length > LOG_MAX) saved.log.splice(0, saved.log.length - LOG_MAX);
  if (!process.env.NODE_TEST_CONTEXT) for (const e of events) console.log(`War: ${e.text}`);
  const view = warView(saved.state, saved.next);
  listeners.forEach((f) => { try { f(view, events); } catch (e) { console.error("War listener:", e); } });
  await kv?.set(KEY, saved).catch((e) => console.error("War: could not save:", e));
}

function tickOnce(at: number): WarEvent[] {
  const s = saved!.state, before = { owner: [...s.owner], siege: s.siege.map((x) => x && { ...x }) };
  const orders = scriptedOrders(s, saved!.minds, rng(s.tick * 2654435761 + 1));
  lastStrikes = tunnelStrikes(s, orders); // (before warTick moves the owners: the strikes the rules fed)
  warTick(s, orders, { phase: warPhase(at), valor });
  lastOrders = orders;
  valor = TERRITORIES.map(() => ({}));
  const out: WarEvent[] = [];
  const name = (k: ClanKey) => CLANS[k].name;
  for (const t of TERRITORIES) {
    const id = t.id, was = before.owner[id], sg = before.siege[id];
    if (s.owner[id] !== was) out.push({ at, tick: s.tick, kind: "flip", t: id, by: s.owner[id], from: was, text: `${name(s.owner[id])} took ${t.name} from ${name(was)}` });
    else if (sg && !s.siege[id]) out.push({ at, tick: s.tick, kind: "held", t: id, by: sg.by, from: was, text: `${name(was)} held ${t.name} against ${name(sg.by)}` });
    else if (!sg && s.siege[id]) out.push({ at, tick: s.tick, kind: "siege", t: id, by: s.siege[id]!.by, from: was, text: `${name(s.siege[id]!.by)} lay siege to ${t.name}, held by ${name(was)}` });
  }
  return out;
}

/** A hero's effort for clan `k` in territory `t` (the room adds it while heroes hold standards). */
export function addValor(t: number, k: ClanKey, amount: number): boolean {
  if (!saved || !(t >= 0 && t < TERRITORIES.length) || !CLANS[k] || !(amount > 0)) return false;
  valor[t][k] = (valor[t][k] ?? 0) + Math.min(amount, WAR.valorPerAdd);
  return true;
}

export const warNow = (): WarView | undefined => (saved ? warView(saved.state, saved.next) : undefined);
export const warLog = (n = 50): WarEvent[] => (saved ? saved.log.slice(-n) : []);
export const warState = (): WarState | undefined => saved?.state;
/** The orders the leaders gave in the last war tick (not saved), or undefined before the first tick of this process. */
export const warOrders = (): Partial<Record<ClanKey, Orders>> | undefined => lastOrders;
/** The tunnel strikes of the last war tick (server/warTunnels.ts), computed on the state that tick started from. Empty before the first tick. */
export const warStrikes = (): readonly TunnelStrike[] => lastStrikes;
/** Called after every war tick with the new view and what happened. Returns an unsubscribe function. */
export function onWar(f: (v: WarView, events: WarEvent[]) => void) { listeners.add(f); return () => { listeners.delete(f); }; }

/** Blocking save at shutdown (JSON store only; Postgres saves after every tick anyway). */
export function flushWar() { if (saved && kv?.setSync) try { kv.setSync(KEY, saved); } catch (e) { console.error("War: could not save:", e); } }

/** Tests: start from a given state without a store or a clock. */
export function _resetWar(s?: Saved, store?: Kv) { stopWar(); saved = s ?? fresh(Date.now()); saved.names ??= namesNow(); kv = store; valor = TERRITORIES.map(() => ({})); lastOrders = undefined; lastStrikes = []; }
/** Tests: set the last tick's orders. */
export function _setWarOrders(o: Partial<Record<ClanKey, Orders>> | undefined) { lastOrders = o; lastStrikes = saved ? tunnelStrikes(saved.state, o) : []; }
/** Tests: valor clan `k` has gathered in territory `t` so far this war tick. */
export const _valorOf = (t: number, k: ClanKey): number => valor[t]?.[k] ?? 0;
export type { Saved as SavedWar };

/** What a room needs: the war snapshot to every client after each tick, and the herald's news in the chat. */
export function attachWar(room: { broadcast(type: string, msg: unknown): void }) {
  return onWar((v, events) => {
    room.broadcast("war", v);
    for (const e of events) {
      room.broadcast("chat", { id: "", name: "Herald", text: e.text });
      const v = eventVoice(e.kind, e.by, e.from), line = leaderLine(v.k, v.moment, TERRITORIES[e.t].name, v.foe, e.tick);
      room.broadcast("chat", { id: "", name: line.name, text: line.text });
      room.broadcast("warev", { kind: e.kind, t: e.t, by: e.by, from: e.from }); // horn and notice (client/src/warNotice.ts)
    }
  });
}
