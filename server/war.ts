/**
 * The live clan war (roadmap M1): one war for the whole server, independent of the room (a room closes when its last
 * player leaves; the war goes on). Every WAR.tickMs the scripted leaders (shared/war/doctrine.ts) give orders, the
 * players' valor of the last ten minutes is added, and shared/war/rules.ts moves the fronts. The state is saved after
 * every tick (Postgres table kv, or data/war.json) so a deploy never resets the war. The save names its territories, so
 * a new land or zone remaps the war by name (migrateWar) instead of restarting it.
 */
import { CLANS, CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds, scriptedOrders, type Mind } from "../shared/war/doctrine";
import { deployments, newWar, nightRaid, rallyClan, sackHold, WAR, warTick, type Orders, type TickExtra, type WarState } from "../shared/war/rules";
import { TERRITORIES, type Territory } from "../shared/war/territories";
import { regionByKey } from "../shared/war/regions";
import { tunnelStrikes, type TunnelStrike } from "../shared/war/tunnels";
import { warPhase, warView, type WarView } from "../shared/war/view";
import type { WarPlan } from "../shared/war/intel";
import { eventVoice, leaderLine } from "../shared/war/heralds";
import { holdGrew, HOLD_TIER_KEYS } from "../shared/war/holdTiers";
import { bannerSpot } from "../shared/war/holdSack";
import { atWar, setWarRelations, warPairs, warRelations } from "../shared/war/feuds";
import { clashLosses, COLUMN, marchesOf, marchMult, meetingOf, plansOf, type March, type Meeting } from "../shared/war/marches";
import { pathKnown, warPath, type WarPath } from "../shared/war/roads";
import { openKv, type Kv } from "./store";

/**
 * What else a tick brought, for the room to announce (not logged, not saved): the Night Raiders' strike on the hunted
 * clan, and the Rally when the clan it is for changed (`rally` undefined: nobody is rallied any more).
 */
export interface WarNews { raid?: { clan: ClanKey; ts: number[] }; rally?: { clan?: ClanKey; was?: ClanKey } }
/**
 * `sack` (server/warHolds.ts): a hero sacked the Hold of t; `by` is the sacker's clan, or the holder itself when the hero was unsworn.
 * `grow` (W3): the holder (`by` = `from`) built its Hold of t up to `tier` (1 camp, 2 fortress; shared/war/holdTiers.ts).
 */
export interface WarEvent { at: number; tick: number; kind: "siege" | "flip" | "held" | "sack" | "grow"; t: number; by: ClanKey; from: ClanKey; text: string; tier?: number }
/** Most Holds the Herald announces growing in one war tick (a new war raises every camp at once; the log keeps the rest quiet). */
const GROW_NEWS = 3;
/** `names`: the territory names in id order (optional: saves before 2026-11-15 have none, and their ids are today's). */
/** `rel`: the last war tick each pair of clans shared a border (shared/war/feuds.ts warRelations; optional: older saves have none). */
/**
 * `ahead` (W4): the leaders' orders for the next tick, given right after each tick (missing: computed on load).
 * `cols` (W4): the marching columns of the current interval by id: soldiers fallen, ms halted by heroes, and how a
 * meeting was settled ("live" fought in a room, "sim" by the formula). Both optional: wellFormed ignores them.
 */
export interface ColSave { fallen: number; halt: number; met?: "live" | "sim" }
interface Saved {
  v: 1; state: WarState; minds: Record<ClanKey, Mind>; next: number; log: WarEvent[]; names?: string[]; rel?: (number | null)[];
  ahead?: Partial<Record<ClanKey, Orders>>; cols?: Record<string, ColSave>;
}

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
/** Each clan's plan of its orders for the next tick (warPlan: saved.ahead, read on the state they were given for). Memory only. */
let lastPlans: Partial<Record<ClanKey, WarPlan>> = {};
/** The marching columns of those orders (shared/war/marches.ts), recomputed from saved.ahead after a load. Memory only. */
let marches: March[] = [];
/** Their paths (built on demand: shared/war/roads.ts) and their meetings (computed once every path is known). */
const paths = new Map<string, WarPath>();
let meets: Meeting[] | undefined;
/** Columns a room has as real troopers (id -> last time seen), and those halted by a fight with heroes right now. */
const seenLive = new Map<string, number>(), halting = new Map<string, number>();
/** Hero name -> the war tick they last joined a column in (one join per hero per war tick). */
const joined = new Map<string, number>();
/** Bumped on every column change rooms should pass on ("columns"); the war save is dirty since `dirtyAt` (0: clean). */
let colVersion = 0, dirtyAt = 0, lastSave = 0;
/** The lands the Night Raiders struck in the last tick (memory only, like lastOrders: shown on the war table and plaque). */
let lastRaided: number[] = [];
const listeners = new Set<(v: WarView, events: WarEvent[], news: WarNews) => void>();

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

/**
 * The war map before the Grey Barrow Moors joined it (2026-11-15), in id order: an unnamed save (written before saves
 * named their territories) of this size was written on this map. Frozen: never edit it.
 */
export const PRE_MOORS_NAMES: readonly string[] = ["North Meadow", "Goldenreach Farms", "Mirror Pond", "Misty Marsh", "Stonecrag Quarry",
  "Old Ruins", "Old Watchtower", "Sunken Lake", "Barrow Downs", "Gravemoor Cemetery", "Thornwood", "Greywatch Keep", "Redfang Hollow",
  "Brinewood", "Heronwreck Strand", "Gullrock Cove", "Blightmire Fen", "Rimewater Hollow", "Cinder Scar", "Stormbreak Crags",
  "Saltwind Coast", "The Glasswind Flats", "Palmshade Oasis", "Jackal Springs", "Dustrider Camp", "Kharsun, the Buried City",
  "The Humpback Mesas", "The Saffron Dunes", "Mirage Wells", "The Veiled Sanctum", "The Thornspire Heights"];

/**
 * The war map before the Red Badlands joined it (2026-11-15), with the moors, in id order: PRE_MOORS_NAMES and the 11
 * moors territories. Saves on this map are named, so this only reads an unnamed save of its size. Frozen: never edit it.
 */
export const PRE_BADLANDS_NAMES: readonly string[] = [...PRE_MOORS_NAMES, "The Grey Ring", "Sorrow Mire", "Thane's Rest", "The Cairnfield",
  "Blackwater Fen", "The Hollow Mounds", "The Drowned Hollow", "The Nine Widows", "The Weeping Stones", "Kingsbarrow", "The Host's Muster"];
/**
 * The war map before the Mawdeep Sinkholes joined it (2026-11-15), with the badlands, in id order: PRE_BADLANDS_NAMES
 * and the 10 badlands territories. Saves on this map are named, so this only reads an unnamed save of its size. Frozen:
 * never edit it.
 */
export const PRE_SINKHOLES_NAMES: readonly string[] = [...PRE_BADLANDS_NAMES, "The Saltlick Flats", "Drovers' Draw", "The Hanging Arches",
  "The Cinnabar Pits", "Bloodstone Mesa", "Talon Fort", "Vulture's Roost", "Rattlesnake Gulch", "Gallows Canyon", "Fangrock"];
/** Older maps an unnamed save may have been written on, told apart by size (a size is never reused). */
const OLD_MAPS = [PRE_MOORS_NAMES, PRE_BADLANDS_NAMES, PRE_SINKHOLES_NAMES];

/** The names an unnamed save of `n` territories was written with: today's map, else an older map of that size. */
const unnamed = (n: number, names: readonly string[]) => (n === names.length ? names : OLD_MAPS.find((m) => m.length === n));

/** The saved war read for today's map, or undefined when it cannot be (malformed, or an unnamed save of an unknown size). */
function load(got: Saved | undefined): Saved | undefined {
  if (!wellFormed(got)) return undefined;
  const names = namesNow(), old = got.names ?? unnamed(got.state.owner.length, names);
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
    console.log(got ? "War: the saved war cannot be read or mapped to this map, a new war begins (old one kept)" : "War: a new war begins");
  } else {
    const old = got!.names ?? unnamed(got!.state.owner.length, war.names!);
    if (old && (old.length !== war.names!.length || old.some((n, i) => n !== war.names![i]))) {
      await kv.set(`${KEY}-old-${Date.now()}`, got); // the map changed: the remapped war goes on, the old save is kept aside
      const kept = war.names!.filter((n) => old.includes(n)).length;
      console.log(`War: the map changed (${kept} territories kept, ${war.names!.length - kept} new, ${old.length - kept} gone)`);
    }
    console.log(`War: tick ${saved.state.tick}, next in ${Math.max(0, Math.round((saved.next - Date.now()) / 1000))} s`);
  }
  relate(saved.rel ?? []);
  try { lookAhead(saved.next - WAR.tickMs); } catch (e) { console.error("War: the orders ahead could not be given:", e); } // (the next tick tries again)
  timer = setInterval(() => { step(Date.now()).catch((e) => console.error("War: tick failed:", e)); }, 15_000);
  timer.unref?.();
}

export function stopWar() { if (timer) clearInterval(timer); timer = undefined; }

/** Runs every war tick that is due (at most CATCH_UP after downtime). Exported for tests. */
export async function step(now: number) {
  if (!saved) return;
  settleMeetings(now);
  if (now < saved.next) { if (dirtyAt && now - lastSave >= COLUMN.saveMs) await save(now); return; }
  const late = Math.floor((now - saved.next) / WAR.tickMs);
  if (late >= CATCH_UP) saved.next = now - (CATCH_UP - 1) * WAR.tickMs;
  const events: WarEvent[] = [], news: WarNews = {}, rallyWas = rallyClan(saved.state);
  while (now >= saved.next) {
    const at = saved.next;
    saved.next += WAR.tickMs; // first: a tick that throws is skipped, never retried every 15 s
    try { events.push(...tickOnce(at, news)); } catch (e) { console.error("War: tick failed, skipped:", e); }
  }
  relate();
  const rallyNow = rallyClan(saved.state);
  if (rallyNow !== rallyWas) news.rally = { clan: rallyNow, was: rallyWas };
  saved.log.push(...events);
  if (saved.log.length > LOG_MAX) saved.log.splice(0, saved.log.length - LOG_MAX);
  if (!process.env.NODE_TEST_CONTEXT) for (const e of events) console.log(`War: ${e.text}`);
  const view = viewOf(saved);
  listeners.forEach((f) => { try { f(view, events, news); } catch (e) { console.error("War listener:", e); } });
  await save(now);
}

async function save(now: number) {
  dirtyAt = 0; lastSave = now;
  await kv?.set(KEY, saved).catch((e) => console.error("War: could not save:", e));
}

function tickOnce(at: number, news: WarNews): WarEvent[] {
  const s = saved!.state, before = { owner: [...s.owner], siege: s.siege.map((x) => x && { ...x }), fort: [...s.fort], control: [...s.control] };
  // the orders given one tick ahead (W4: their columns marched since), or given now when there are none (a first tick)
  const orders = saved!.ahead ?? scriptedOrders(s, saved!.minds, rng(s.tick * 2654435761 + 1)), phase = warPhase(at);
  lastStrikes = tunnelStrikes(s, orders); // (before warTick moves the owners: the strikes the rules fed)
  const raid = nightRaid(s, phase); // (likewise: the lands warTick strikes)
  lastRaided = raid?.ts ?? [];
  if (raid?.ts.length) news.raid = { clan: raid.clan, ts: [...raid.ts] };
  settleMeetings(Infinity); // a meeting nobody saw is fought by the formula before the attack lands
  warTick(s, orders, { phase, valor, march: marchMults() });
  lastOrders = orders;
  valor = TERRITORIES.map(() => ({}));
  // the orders for the next tick, at once (same leaders, same seed as if given then): their columns march now
  saved!.cols = {};
  try { saved!.ahead = scriptedOrders(s, saved!.minds, rng(s.tick * 2654435761 + 1)); lookAhead(at); }
  catch (e) { delete saved!.ahead; marches = []; console.error("War: the orders ahead could not be given (the next tick gives them):", e); }
  const out: WarEvent[] = [];
  const name = (k: ClanKey) => CLANS[k].name;
  for (const t of TERRITORIES) {
    const id = t.id, was = before.owner[id], sg = before.siege[id];
    if (s.owner[id] !== was) out.push({ at, tick: s.tick, kind: "flip", t: id, by: s.owner[id], from: was, text: `${name(s.owner[id])} took ${t.name} from ${name(was)}` });
    else if (sg && !s.siege[id]) out.push({ at, tick: s.tick, kind: "held", t: id, by: sg.by, from: was, text: `${name(was)} held ${t.name} against ${name(sg.by)}` });
    else if (!sg && s.siege[id]) out.push({ at, tick: s.tick, kind: "siege", t: id, by: s.siege[id]!.by, from: was, text: `${name(s.siege[id]!.by)} lay siege to ${t.name}, held by ${name(was)}` });
  }
  // Holds built up to a camp or a fortress (W3): the biggest news first, a few a tick
  const grew = TERRITORIES.flatMap((t) => { const g = holdGrew(before, s, t.id); return g ? [{ t, g }] : []; }).sort((a, b) => b.g - a.g || a.t.id - b.t.id);
  for (const { t, g } of grew.slice(0, GROW_NEWS))
    out.push({ at, tick: s.tick, kind: "grow", t: t.id, by: s.owner[t.id], from: s.owner[t.id], tier: g, text: `${name(s.owner[t.id])} raise a ${HOLD_TIER_KEYS[g]} at ${t.name}` });
  return out;
}

/** A hero's effort for clan `k` in territory `t` (the room adds it while heroes hold standards). */
export function addValor(t: number, k: ClanKey, amount: number): boolean {
  if (!saved || !(t >= 0 && t < TERRITORIES.length) || !CLANS[k] || !(amount > 0)) return false;
  valor[t][k] = (valor[t][k] ?? 0) + Math.min(amount, WAR.valorPerAdd);
  return true;
}

/**
 * A hero sacked territory t's Hold between war ticks (server/warHolds.ts, which settles it once per land per war tick
 * for every room): rules.ts sackHold loosens the holder's grip (half when `half`) and may call a siege by clan `k`. The
 * news goes out at once like a tick's (a "sack" event, and a "siege" event when one was called), every room gets the new
 * snapshot, and the war is saved. `hero`: the sacker's name for the log. Undefined when nothing changed.
 */
export function strikeHold(t: number, k: ClanKey | undefined, half: boolean, hero = "A hero", now = Date.now()): { control: number; siege: boolean } | undefined {
  if (!saved) return undefined;
  const s = saved.state, from = s.owner[t], r = from && sackHold(s, t, k, half);
  if (!r) return undefined;
  const land = TERRITORIES[t].name, name = (c: ClanKey) => CLANS[c].name;
  const events: WarEvent[] = [{ at: now, tick: s.tick, kind: "sack", t, by: k ?? from, from, text: `${hero}${k ? ` of ${name(k)}` : ""} sacked the Hold of ${land}, held by ${name(from)}` }];
  if (r.siege) events.push({ at: now, tick: s.tick, kind: "siege", t, by: r.siege.by, from, text: `${name(r.siege.by)} lay siege to ${land}, held by ${name(from)}` });
  saved.log.push(...events);
  if (saved.log.length > LOG_MAX) saved.log.splice(0, saved.log.length - LOG_MAX);
  if (!process.env.NODE_TEST_CONTEXT) for (const e of events) console.log(`War: ${e.text}`);
  const view = viewOf(saved);
  listeners.forEach((f) => { try { f(view, events, {}); } catch (e) { console.error("War listener:", e); } });
  kv?.set(KEY, saved).catch((e) => console.error("War: could not save:", e));
  return { control: r.control, siege: !!r.siege };
}

/** The snapshot players get, with the clans at war (shared/war/feuds.ts: the client takes them as they are). */
const viewOf = (s: Saved): WarView => ({ ...warView(s.state, s.next, lastRaided), wars: warPairs() });
export const warNow = (): WarView | undefined => (saved ? viewOf(saved) : undefined);
/**
 * The clans at war (shared/war/feuds.ts) for the war as it stands: after a load (`last`: the saved memory), after every
 * tick, and once a second from the room (a cheap no-op unless the owners changed outside a tick: tests, a migration).
 */
export function relate(last?: readonly unknown[]) {
  if (!saved) return;
  setWarRelations(saved.state.owner, saved.state.tick, last);
  saved.rel = warRelations();
}

// ---- Marching columns (W4: shared/war/marches.ts has the rules, server/warMarches.ts the live troopers) ------------

/** The plans, columns and march paths of the orders ahead (saved.ahead, given now if missing), for the tick at `at`. */
function lookAhead(at: number) {
  if (!saved) return;
  const s = saved.state;
  saved.ahead ??= scriptedOrders(s, saved.minds, rng(s.tick * 2654435761 + 1)); // (an old save, or a first tick: as the tick would have given them)
  lastPlans = plansOf(s, saved.ahead, tunnelStrikes(s, saved.ahead), s.tick); // (the view after the last tick carries s.tick)
  marches = marchesOf(lastPlans, deployments(s, saved.ahead, warPhase(at + WAR.tickMs)).attack, s.tick, at);
  const cols = (saved.cols ??= {});
  for (const id of Object.keys(cols)) if (!marches.some((m) => m.id === id)) delete cols[id]; // (a column of an older interval)
  paths.clear(); meets = undefined; colVersion++;
}

/** The share of each cut-down column's attack that lands (TickExtra.march): only columns that lost men. */
function marchMults(): NonNullable<TickExtra["march"]> {
  const out: NonNullable<TickExtra["march"]> = [];
  for (const m of marches) { const c = saved?.cols?.[m.id]; if (c && c.fallen > 0) out.push({ t: m.to, k: m.clan, mult: marchMult(m.size - c.fallen, m.size) }); }
  return out;
}

const colOf = (id: string): ColSave => ((saved!.cols ??= {})[id] ??= { fallen: 0, halt: 0 });
const marchOf = (id: string) => marches.find((m) => m.id === id);
const dirty = (now: number) => { dirtyAt ||= now; colVersion++; };

/** The marching columns of the current interval (empty before the orders ahead are known). */
export const warMarches = (): readonly March[] => marches;
/** A column's losses and halts so far (zeros when untouched). */
export const marchCol = (id: string): Readonly<ColSave> => saved?.cols?.[id] ?? { fallen: 0, halt: 0 };
/** A column's path (shared/war/roads.ts warPath), built on demand unless `build` is false (then undefined while unbuilt). */
export function marchPath(m: March, build = true): WarPath | undefined {
  let p = paths.get(m.id);
  if (!p && (build || pathKnown(m.from, m.to))) { p = warPath(m.from, m.to); if (p) paths.set(m.id, p); }
  return p;
}
/** The meetings of this interval: columns of clans at war on one road in opposite directions (deterministic). */
export function warMeetings(): Meeting[] {
  if (meets) return meets;
  const out: Meeting[] = [];
  for (let i = 0; i < marches.length; i++) for (let j = i + 1; j < marches.length; j++) {
    const a = marches[i], b = marches[j];
    if (a.from !== b.to || a.to !== b.from || a.clan === b.clan || !atWar(a.clan, b.clan)) continue;
    const pa = marchPath(a), pb = marchPath(b), m = pa && pb && meetingOf(a, pa, b, pb);
    if (m) out.push(m);
  }
  return (meets = out);
}
/** The meeting column `id` has this interval, if any. */
export const meetingFor = (id: string): Meeting | undefined => warMeetings().find((x) => x.a === id || x.b === id);

/**
 * Meetings whose time has come (by `now`; Infinity at the tick): one a room saw live was fought there (its real deaths
 * count); one nobody saw costs both sides clashLosses. Settled once each.
 */
function settleMeetings(now: number) {
  if (!saved || !marches.length) return;
  for (const mt of warMeetings()) {
    if (mt.at > now) continue;
    const ca = colOf(mt.a), cb = colOf(mt.b), A = marchOf(mt.a), B = marchOf(mt.b);
    if (ca.met || cb.met || !A || !B) continue;
    const live = [mt.a, mt.b].some((id) => (seenLive.get(id) ?? -Infinity) >= mt.at - 2000);
    if (!live) {
      const [la, lb] = clashLosses(A.size - ca.fallen, B.size - cb.fallen, A.force, B.force);
      ca.fallen = Math.min(A.size, ca.fallen + la); cb.fallen = Math.min(B.size, cb.fallen + lb);
    }
    ca.met = cb.met = live ? "live" : "sim";
    dirty(Number.isFinite(now) ? now : Date.now());
  }
}

/** A soldier of column `id` fell (any hand): it counts against the attack at the next tick. False for an unknown or empty column. */
export function columnLost(id: string, n = 1, now = Date.now()): boolean {
  const m = marchOf(id);
  if (!saved || !m || !(n > 0)) return false;
  const c = colOf(id);
  if (c.fallen >= m.size) return false;
  c.fallen = Math.min(m.size, c.fallen + n);
  dirty(now);
  return true;
}
/** Column `id` stood `ms` more in a fight with heroes (at most COLUMN.haltMaxMs a trip). Returns the halt so far. */
export function columnHalt(id: string, ms: number, now = Date.now()): number {
  if (!saved || !marchOf(id) || !(ms > 0)) return marchCol(id).halt;
  const c = colOf(id), was = c.halt;
  c.halt = Math.min(COLUMN.haltMaxMs, c.halt + ms);
  const started = now - (halting.get(id) ?? -Infinity) > 2500;
  halting.set(id, now);
  if (c.halt !== was) { dirtyAt ||= now; if (started) colVersion++; } // (the clients hear when it stops and starts, not every second)
  return c.halt;
}
/** Is column `id` halted by a fight right now (a room reported it within the last 2.5 s)? */
export const columnHalting = (id: string, now = Date.now()) => now - (halting.get(id) ?? -Infinity) <= 2500;
/** A room has column `id` as real troopers now (an unseen meeting is fought by the formula, a seen one in the room). */
export function columnSeen(id: string, now = Date.now()) {
  const h = halting.get(id);
  if (h !== undefined && now - h > 2500) { halting.delete(id); colVersion++; } // its halt ended
  seenLive.set(id, now);
}
/** Hero `name` joined column `id` on arrival: true once per hero per war tick (the caller pays). */
export function columnJoined(id: string, name: string): boolean {
  const m = marchOf(id);
  if (!m || joined.get(name) === m.tick) return false;
  joined.set(name, m.tick);
  return true;
}
/** Bumped on every change of the columns rooms pass on ("columns"). */
export const columnsVersion = () => colVersion;
/** Tests: the march mults the next tick would apply (rules.ts TickExtra.march). */
export const _marchMults = () => marchMults();
/** Tests: the save would be written at the next step (columns changed since the last save). */
export const _warDirty = () => dirtyAt > 0;

export const warLog = (n = 50): WarEvent[] => (saved ? saved.log.slice(-n) : []);
export const warState = (): WarState | undefined => saved?.state;
/** The orders the leaders gave in the last war tick (not saved), or undefined before the first tick of this process. */
export const warOrders = (): Partial<Record<ClanKey, Orders>> | undefined => lastOrders;
/** The tunnel strikes of the last war tick (server/warTunnels.ts), computed on the state that tick started from. Empty before the first tick. */
export const warStrikes = (): readonly TunnelStrike[] => lastStrikes;
/** Every clan's plan from its orders (shared/war/marches.ts; kept here for the callers that read it from the war). */
export { plansOf };
/**
 * Clan `k`'s attacks of the next war tick (W4: the orders come one tick ahead, and their columns march now), for its
 * sworn heroes only (server/warIntel.ts): orders are secret from the other clans. Undefined before the orders are known
 * or when the clan gave no orders.
 */
export const warPlan = (k: ClanKey): WarPlan | undefined => lastPlans[k];
/** Called after every war tick with the new view and what happened. Returns an unsubscribe function. */
export function onWar(f: (v: WarView, events: WarEvent[], news: WarNews) => void) { listeners.add(f); return () => { listeners.delete(f); }; }

/** Blocking save at shutdown (JSON store only; Postgres saves after every tick anyway). */
export function flushWar() { if (saved && kv?.setSync) try { kv.setSync(KEY, saved); } catch (e) { console.error("War: could not save:", e); } }

/** Tests: start from a given state without a store or a clock. */
export function _resetWar(s?: Saved, store?: Kv) {
  stopWar(); saved = s ?? fresh(Date.now()); saved.names ??= namesNow(); kv = store; valor = TERRITORIES.map(() => ({})); lastOrders = undefined; lastStrikes = []; lastPlans = {}; lastRaided = []; relate(saved.rel ?? []);
  marches = []; paths.clear(); meets = undefined; seenLive.clear(); halting.clear(); joined.clear(); dirtyAt = 0; colVersion++;
  if (saved.ahead) lookAhead(saved.next - WAR.tickMs); // (no orders ahead: given at the first tick, as before W4)
}
/** Tests: set the last tick's orders; they are the orders ahead too (the plan and the columns follow them). */
export function _setWarOrders(o: Partial<Record<ClanKey, Orders>> | undefined) {
  lastOrders = o; lastStrikes = saved ? tunnelStrikes(saved.state, o) : [];
  if (!saved) { lastPlans = {}; return; }
  if (o) saved.ahead = o; else delete saved.ahead;
  saved.cols = {};
  lookAhead(saved.next - WAR.tickMs);
}
/** Tests: valor clan `k` has gathered in territory `t` so far this war tick. */
export const _valorOf = (t: number, k: ClanKey): number => valor[t]?.[k] ?? 0;
export type { Saved as SavedWar };

/** What a room needs: the war snapshot to every client after each tick, and the herald's news in the chat. */
export function attachWar(room: { broadcast(type: string, msg: unknown): void }) {
  return onWar((v, events, news) => {
    room.broadcast("war", v);
    for (const e of events) {
      room.broadcast("chat", { id: "", name: "Herald", text: e.text });
      if (e.kind === "grow") { // a hammer chord where the Hold grew (client/src/sfx.ts hold_grow); no leader line, no horn
        const at = bannerSpot(e.t);
        if (at) room.broadcast("sfx", { ev: "hold_grow", t: e.t, x: Math.round(at.x), y: Math.round(at.y), by: e.by, tier: e.tier ?? 1 });
        continue;
      }
      const v = eventVoice(e.kind, e.by, e.from), line = leaderLine(v.k, v.moment, TERRITORIES[e.t].name, v.foe, e.tick);
      if (e.by !== e.from) room.broadcast("chat", { id: "", name: line.name, text: line.text }); // (an unsworn hero's sack: no clan to answer)
      room.broadcast("warev", { kind: e.kind, t: e.t, by: e.by, from: e.from }); // horn and notice (client/src/warNotice.ts)
    }
    if (news.raid) {
      room.broadcast("chat", { id: "", name: "Herald", text: raidLine(news.raid.clan, news.raid.ts) });
      room.broadcast("warraid", news.raid); // a notice in the struck lands (client/src/warNotice.ts)
    }
    if (news.rally) room.broadcast("chat", { id: "", name: "Herald", text: rallyLine(news.rally.clan, news.rally.was) });
  });
}

/** The Herald's line when the Night Raiders strike the hunted clan's lands. */
export function raidLine(clan: ClanKey, ts: readonly number[]): string {
  const lands = ts.map((t) => TERRITORIES[t]?.name).filter(Boolean);
  const where = lands.length > 1 ? `${lands.slice(0, -1).join(", ")} and ${lands[lands.length - 1]}` : lands[0] ?? "its borders";
  return `The Night Raiders ride against ${CLANS[clan].name}, the mightiest clan: ${where} bleed.`;
}
/** The Herald's line when the Rally passes to another clan (or ends). */
export function rallyLine(clan: ClanKey | undefined, was: ClanKey | undefined): string {
  if (!clan) return `${CLANS[was!]?.name ?? "The weakest clan"} stand again: the Rally is over.`;
  return `Rally for ${CLANS[clan].name}! The weakest clan calls its sworn: their valor and renown count more, its writs pay more.`;
}
/** What a hero sworn to the rallied clan is told on joining (and the room tells its own sworn when the Rally comes). */
export const rallyTell = (clan: ClanKey) =>
  `Rally! ${CLANS[clan].name} hold the least land: your valor counts x${WAR.rallyValor}, your renown x${WAR.rallyRenown}, and its writs pay more.`;
