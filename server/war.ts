/**
 * The live clan war (roadmap M1): one war for the whole server, independent of the room (a room closes when its last
 * player leaves; the war goes on). Every WAR.tickMs the scripted leaders (shared/war/doctrine.ts) give orders, the
 * players' valor of the last ten minutes is added, and shared/war/rules.ts moves the fronts. The state is saved after
 * every tick (Postgres table kv, or data/war.json) so a deploy never resets the war.
 */
import { CLANS, CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds, scriptedOrders, type Mind } from "../shared/war/doctrine";
import { newWar, WAR, warTick, type WarState } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { warPhase, warView, type WarView } from "../shared/war/view";
import { openKv, type Kv } from "./store";

export interface WarEvent { at: number; tick: number; kind: "siege" | "flip" | "held"; t: number; by: ClanKey; from: ClanKey; text: string }
interface Saved { v: 1; state: WarState; minds: Record<ClanKey, Mind>; next: number; log: WarEvent[] }

const KEY = "war";
const LOG_MAX = 200;
/** After downtime, ticks the war catches up at most (so a long outage does not replay a day at once). */
const CATCH_UP = 3;

let kv: Kv | undefined;
let saved: Saved | undefined;
let timer: NodeJS.Timeout | undefined;
let valor: Partial<Record<ClanKey, number>>[] = TERRITORIES.map(() => ({}));
const listeners = new Set<(v: WarView, events: WarEvent[]) => void>();

/** Small seeded random per tick: the same tick always plays out the same way (easy to replay from the log). */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function fresh(now: number): Saved {
  return { v: 1, state: newWar(), minds: newMinds(), next: now + WAR.tickMs, log: [] };
}

/** A saved war that still fits today's map (a new zone or act changes the territory count: then the war restarts). */
function fits(s: Saved | undefined): s is Saved {
  const n = TERRITORIES.length, st = s?.state;
  return !!s && s.v === 1 && !!st && Number.isFinite(s.next) && Array.isArray(s.log)
    && [st.owner, st.control, st.fort, st.siege, st.pressure].every((a) => Array.isArray(a) && a.length === n)
    && st.owner.every((k) => !!CLANS[k]) && CLAN_KEYS.every((k) => Number.isFinite(st.army?.[k]) && !!s.minds?.[k]);
}

/** Loads the war (or starts it) and starts the clock. Safe to call more than once. */
export async function startWar(store?: Kv) {
  if (timer) return;
  kv = store ?? (await openKv());
  // A load error stops the start (like the accounts): never let a fresh war overwrite a saved one we failed to read
  const got = await kv.get<Saved>(KEY);
  saved = fits(got) ? got : fresh(Date.now());
  if (!fits(got)) {
    if (got) await kv.set(`${KEY}-old-${Date.now()}`, got); // a war that no longer fits the code: kept aside, not lost
    console.log(got ? "War: the saved war no longer fits the map, a new war begins (old one kept)" : "War: a new war begins");
  } else console.log(`War: tick ${saved.state.tick}, next in ${Math.max(0, Math.round((saved.next - Date.now()) / 1000))} s`);
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
  warTick(s, orders, { phase: warPhase(at), valor });
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
export function addValor(t: number, k: ClanKey, amount: number) {
  if (!saved || !(t >= 0 && t < TERRITORIES.length) || !CLANS[k] || !(amount > 0)) return;
  valor[t][k] = (valor[t][k] ?? 0) + Math.min(amount, WAR.valorPerAdd);
}

export const warNow = (): WarView | undefined => (saved ? warView(saved.state, saved.next) : undefined);
export const warLog = (n = 50): WarEvent[] => (saved ? saved.log.slice(-n) : []);
export const warState = (): WarState | undefined => saved?.state;
/** Called after every war tick with the new view and what happened. Returns an unsubscribe function. */
export function onWar(f: (v: WarView, events: WarEvent[]) => void) { listeners.add(f); return () => { listeners.delete(f); }; }

/** Blocking save at shutdown (JSON store only; Postgres saves after every tick anyway). */
export function flushWar() { if (saved && kv?.setSync) try { kv.setSync(KEY, saved); } catch (e) { console.error("War: could not save:", e); } }

/** Tests: start from a given state without a store or a clock. */
export function _resetWar(s?: Saved, store?: Kv) { stopWar(); saved = s ?? fresh(Date.now()); kv = store; valor = TERRITORIES.map(() => ({})); }
export type { Saved as SavedWar };

/** What a room needs: the war snapshot to every client after each tick, and the herald's news in the chat. */
export function attachWar(room: { broadcast(type: string, msg: unknown): void }) {
  return onWar((v, events) => {
    room.broadcast("war", v);
    for (const e of events) room.broadcast("chat", { id: "", name: "Herald", text: e.text });
  });
}
