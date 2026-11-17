/**
 * The live clan war (roadmap M1): one war for the whole server, independent of the room (a room closes when its last
 * player leaves; the war goes on). Every WAR.tickMs the scripted leaders (shared/war/doctrine.ts) give orders, the
 * players' valor of the last ten minutes is added, and shared/war/rules.ts moves the fronts. The state is saved after
 * every tick (Postgres table kv, or data/war.json) so a deploy never resets the war. The save names its territories, so
 * a new land or zone remaps the war by name (migrateWar) instead of restarting it.
 */
import { TILE } from "../shared/constants";
import { CLANS, CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds, type Mind } from "../shared/war/doctrine";
import { deployments, newWar, nightRaid, rallyClan, sackHold, supplyMap, WAR, warTick, type Orders, type TickExtra, type WarState } from "../shared/war/rules";
import { initialOwners, TERRITORIES, type Territory } from "../shared/war/territories";
import { regionByKey } from "../shared/war/regions";
import { tunnelStrikes, type TunnelStrike } from "../shared/war/tunnels";
import { warPhase, warView, type WarView } from "../shared/war/view";
import type { WarPlan } from "../shared/war/intel";
import { eventVoice, leaderLine, type WarMoment } from "../shared/war/heralds";
import { holdGrew, HOLD_TIER_KEYS } from "../shared/war/holdTiers";
import { bannerSpot } from "../shared/war/holdSack";
import { atWar, setWarRelations, warPairs, warRelations } from "../shared/war/feuds";
import { COLUMN, marchesOf, marchMult, meetingOf, plansOf, type March, type Meeting } from "../shared/war/marches";
import { pathKnown, warPath, type WarPath } from "../shared/war/roads";
import {
  BATTLE, battleDay, battleField, battleOutcome, battleStep, cleanBattle, isDecisive, meetSite, newBattle, pickMeetings, pickPitched, pitchedSlot, pitchedTimes,
  setMen, siteForces, stormField, type Battle, type BattleSite,
} from "../shared/war/battles";
import { frontStep } from "../shared/war/siege";
import { TOWN, TOWNS, townById, townCounts, townPatron, townStep, townsView, type TownChange, type TownState, type TownsMsg } from "../shared/war/towns";
import { openKv, type Kv } from "./store";
import { cleanCrown, crownClock, crownTick, crownValor, crownView, type CrownSave } from "./warCrown";
import { cleanCouncil, councilClock, councilOnNewMap, leaderOrders, noteOrders, proclaimLine, takeProclamations, type CouncilSave } from "./warCouncil";

/**
 * What else a tick brought, for the room to announce (not logged, not saved): the Night Raiders' strike on the hunted
 * clan, and the Rally when the clan it is for changed (`rally` undefined: nobody is rallied any more).
 */
export interface WarNews { raid?: { clan: ClanKey; ts: number[] }; rally?: { clan?: ClanKey; was?: ClanKey }; /** War Councils in lead mode: their proclamations (server/warCouncil.ts). */ proclaim?: { clan: ClanKey; text: string }[] }
/**
 * `sack` (server/warHolds.ts): a hero sacked the Hold of t; `by` is the sacker's clan, or the holder itself when the hero was unsworn.
 * `grow` (W3): the holder (`by` = `from`) built its Hold of t up to `tier` (1 camp, 2 fortress; shared/war/holdTiers.ts).
 */
/** `town` (W6): town `town` (shared/war/towns.ts) was contested, claimed, submitted or the contest called off (`change`); t is its patron land. */
export interface WarEvent { at: number; tick: number; kind: "siege" | "flip" | "held" | "sack" | "grow" | "town"; t: number; by: ClanKey; from: ClanKey; text: string; tier?: number; town?: string; change?: TownChange | "claimed" }
/** Most Holds the Herald announces growing in one war tick (a new war raises every camp at once; the log keeps the rest quiet). */
const GROW_NEWS = 3;
/** `names`: the territory names in id order (optional: saves before 2026-11-15 have none, and their ids are today's). */
/** `rel`: the last war tick each pair of clans shared a border (shared/war/feuds.ts warRelations; optional: older saves have none). */
/**
 * `ahead` (W4): the leaders' orders for the next tick, given right after each tick (missing: computed on load).
 * `cols` (W4): the marching columns of the current interval by id: soldiers fallen, ms halted by heroes, and how a
 * meeting was settled ("live" fought in a room, "sim" by the formula). Both optional: wellFormed ignores them.
 * `battles` (W5): the big battles announced, being fought or just over (`list`), and the local day's counts (`day`,
 * `n` battles, `meets` meeting battles) and the last pitched slot handled (`pitched`, ms). Optional; read through
 * cleanBattle, so old and new builds read each other's saves.
 */
export interface ColSave { fallen: number; halt: number; met?: "live" | "sim" }
export interface BattleSave { list: Battle[]; day: number; n: number; meets: number; pitched: number }
interface Saved {
  v: 1; state: WarState; minds: Record<ClanKey, Mind>; next: number; log: WarEvent[]; names?: string[]; rel?: (number | null)[];
  ahead?: Partial<Record<ClanKey, Orders>>; cols?: Record<string, ColSave>; battles?: BattleSave;
  /** W6: each capturable town's holder and contest (shared/war/towns.ts). Optional: read through cleanTowns, dropped on a map change. */
  towns?: Record<string, TownState>;
  /** Crown PR4: the Reckoning (server/warCrown.ts). Optional: read through cleanCrown; a save without it has had no Reckoning yet. Kept on a map change. */
  crown?: CrownSave;
  /** War Councils (M3, server/warCouncil.ts): intents, pending remote orders, the council log, daily digests. Optional: read through cleanCouncil; intents dropped on a map change. */
  council?: CouncilSave;
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
const seenLive = new Map<string, Map<unknown, number>>(), halting = new Map<string, number>();
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
 * always starts with its clan. A new territory of a `wards` land (the Crown) is claimed as a new war claims it, round
 * what the save holds (territories.ts initialOwners): its gate territories with their wardens, the rest by the clans
 * with the least land, the Crown Keep by the clan holding the least of all. Pure: same names in the same order give the
 * same war back. `oldNames` / `names` must not repeat a name (wellFormed checks the save's).
 */
export function migrateWar(saved: Saved, oldNames: readonly string[], names: readonly string[], ts: readonly Territory[] = TERRITORIES): Saved {
  const was = new Map(oldNames.map((n, i) => [n, i])), from = names.map((n) => was.get(n)), st = saved.state;
  const pick = <T>(a: T[], seed: (i: number) => T) => from.map((o, i) => (o === undefined ? seed(i) : a[o]));
  const owner = pick<ClanKey | undefined>(st.owner, () => undefined);
  const wardsLand = (t: Territory | undefined) => !!t && !!regionByKey(t.region)?.wards;
  for (let i = 0; i < names.length; i++) {
    if (owner[i]) continue;
    const t = ts.find((x) => x.name === names[i]), home = t && regionByKey(t.region)?.home;
    if (wardsLand(t)) continue; // (claimed below, once every homeland's holder is known)
    const votes = new Map<ClanKey, number>();
    for (const m of t?.near ?? []) { const k = from[m] !== undefined ? owner[m] : undefined; if (k) votes.set(k, (votes.get(k) ?? 0) + 1); }
    const most = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
    owner[i] = t?.capitalOf ?? home ?? most ?? CLAN_KEYS[i % CLAN_KEYS.length];
  }
  if (owner.some((o) => !o)) {
    const at = new Map(names.map((n, i) => [n, i])), fill = initialOwners(ts, ts.map((t) => { const i = at.get(t.name); return i === undefined ? undefined : owner[i]; }));
    for (let i = 0; i < names.length; i++) if (!owner[i]) { const j = ts.findIndex((t) => t.name === names[i]); owner[i] = j >= 0 ? fill[j] : CLAN_KEYS[i % CLAN_KEYS.length]; }
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
  const out: Saved = { ...saved, state, minds, log, names: [...names] };
  if (oldNames.length !== names.length || oldNames.some((n, i) => n !== names[i])) { delete out.ahead; delete out.cols; delete out.battles; } // (orders, columns and battles name territory ids: given afresh on load)
  if (oldNames.length !== names.length || oldNames.some((n, i) => n !== names[i])) delete out.towns; // (W6: each town takes its land's holder again)
  if (oldNames.length !== names.length || oldNames.some((n, i) => n !== names[i])) { const c = councilOnNewMap(out.council); if (c) out.council = c; } // (M3: intents name ids)
  return out;
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
/**
 * The war map before the Crown of the Marches joined it (2026-11-16), with the sinkholes, in id order:
 * PRE_SINKHOLES_NAMES and the 10 sinkholes territories (62). Saves on this map are named, so this only reads an unnamed
 * save of its size. Frozen: never edit it.
 */
export const PRE_CROWN_NAMES: readonly string[] = [...PRE_SINKHOLES_NAMES, "Rootfall Slopes", "Hollowbrook Dells", "The Old Warren", "Tunneltop",
  "Mosslight Fen", "The Pitfields", "The Gnawed Bank", "Scratchroot Burrows", "Rushmere Hollows", "Hidehall"];
/** Older maps an unnamed save may have been written on, told apart by size (a size is never reused). */
const OLD_MAPS = [PRE_MOORS_NAMES, PRE_BADLANDS_NAMES, PRE_SINKHOLES_NAMES, PRE_CROWN_NAMES];

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
  cleanBattles();
  cleanTowns(); // (W6)
  saved.crown = cleanCrown(saved.crown); // (Crown PR4)
  saved.council = cleanCouncil(saved.council); // (M3)
  try { lookAhead(saved.next - WAR.tickMs); } catch (e) { console.error("War: the orders ahead could not be given:", e); } // (the next tick tries again)
  timer = setInterval(() => { step(Date.now()).catch((e) => console.error("War: tick failed:", e)); }, 15_000);
  timer.unref?.();
}

export function stopWar() { if (timer) clearInterval(timer); timer = undefined; }

/** Runs every war tick that is due (at most CATCH_UP after downtime). Exported for tests. */
export async function step(now: number) {
  if (!saved) return;
  settleMeetings(now);
  try { battleClock(now); } catch (e) { console.error("War: battles failed:", e); } // (with no room open, the battles go on here)
  try { crownClock(now); } catch (e) { console.error("War: the Reckoning failed:", e); } // (Crown PR4: its warning, start, standings and close)
  // War Councils (M3): the sessions for the war day of the next orders, before the ticks that give them
  if (now >= saved.next) try { await councilClock(now); } catch (e) { console.error("War: the councils failed (the doctrine leads):", e); }
  if (!saved) return;
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
  const proclaim = takeProclamations();
  if (proclaim.length) news.proclaim = proclaim;
  saved.log.push(...events);
  if (saved.log.length > LOG_MAX) saved.log.splice(0, saved.log.length - LOG_MAX);
  if (!process.env.NODE_TEST_CONTEXT) for (const e of events) console.log(`War: ${e.text}`);
  const view = viewOf(saved);
  listeners.forEach((f) => { try { f(view, events, news); } catch (e) { console.error("War listener:", e); } });
  await save(now);
}

/** War saves run one after another, each writing the war as it stands then: two writes in flight could land out of
 * order (a Postgres pool, one tmp file) and an older one would bring back a Reckoning's pay already claimed. */
let saving: Promise<void> = Promise.resolve();
async function save(now: number) {
  dirtyAt = 0; lastSave = now;
  const write = async () => { if (kv) await kv.set(KEY, saved).catch((e) => console.error("War: could not save:", e)); };
  saving = saving.then(write, write);
  await saving;
}

function tickOnce(at: number, news: WarNews): WarEvent[] {
  const s = saved!.state, before = { owner: [...s.owner], siege: s.siege.map((x) => x && { ...x }), fort: [...s.fort], control: [...s.control] };
  // the orders given one tick ahead (W4: their columns marched since), or given now when there are none (a first tick)
  const orders = saved!.ahead ?? leaderOrders(s, saved!.minds, rng(s.tick * 2654435761 + 1), saved!.council), phase = warPhase(at);
  lastStrikes = tunnelStrikes(s, orders); // (before warTick moves the owners: the strikes the rules fed)
  const raid = nightRaid(s, phase); // (likewise: the lands warTick strikes)
  lastRaided = raid?.ts ?? [];
  if (raid?.ts.length) news.raid = { clan: raid.clan, ts: [...raid.ts] };
  settleMeetings(Infinity); // (marks the meetings not yet marked; they cost no men)
  const battle = battleOutcomes(at);
  warTick(s, orders, { phase, valor, march: marchMults(), ...(battle.length ? { battle } : {}), ...townExtra() });
  lastOrders = orders;
  valor = TERRITORIES.map(() => ({}));
  try { crownTick(at); } catch (e) { console.error("War: the Reckoning's tick failed:", e); } // (Crown PR4: the Crown's land scores on the new owners)
  // the orders for the next tick, at once (same leaders, same seed as if given then): their columns march now
  saved!.cols = {};
  try { saved!.ahead = leaderOrders(s, saved!.minds, rng(s.tick * 2654435761 + 1), saved!.council); noteOrders(s, saved!.ahead, saved!.council); lookAhead(at); }
  catch (e) { delete saved!.ahead; marches = []; console.error("War: the orders ahead could not be given (the next tick gives them):", e); }
  try { planBattles(at); } catch (e) { console.error("War: battles could not be planned:", e); }
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
  try { out.push(...stepTowns(at)); } catch (e) { console.error("War: towns failed:", e); } // (W6: after the owners moved)
  return out;
}

/**
 * A hero's effort for clan `k` in territory `t` (the room adds it while heroes hold standards). `by`: the hero who earned
 * it (server/warCrown.ts keyOf), so a Reckoning knows who took part.
 */
export function addValor(t: number, k: ClanKey, amount: number, by?: string): boolean {
  if (!saved || !(t >= 0 && t < TERRITORIES.length) || !CLANS[k] || !(amount > 0)) return false;
  const v = Math.min(amount, WAR.valorPerAdd);
  valor[t][k] = (valor[t][k] ?? 0) + v;
  crownValor(t, k, v, by);
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
const viewOf = (s: Saved): WarView => ({ ...warView(s.state, s.next, lastRaided), wars: warPairs(), reck: crownView() });
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
  saved.ahead ??= leaderOrders(s, saved.minds, rng(s.tick * 2654435761 + 1), saved.council); // (an old save, or a first tick: as the tick would have given them)
  lastPlans = plansOf(s, saved.ahead, tunnelStrikes(s, saved.ahead), s.tick); // (the view after the last tick carries s.tick)
  marches = marchesOf(lastPlans, deployments(s, saved.ahead, warPhase(at + WAR.tickMs)).attack, s.tick, at);
  const cols = (saved.cols ??= {});
  for (const id of Object.keys(cols)) if (!marches.some((m) => m.id === id)) delete cols[id]; // (a column of an older interval)
  paths.clear(); meets = undefined; seenLive.clear(); halting.clear(); colVersion++;
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

/** Were both columns live in one room at about time `at` (each reported within 2 s before it, by the same room)? */
function liveTogether(a: string, b: string, at: number): boolean {
  const ra = seenLive.get(a), rb = seenLive.get(b);
  if (!ra || !rb) return false;
  for (const [room, t] of ra) if (t >= at - 2000 && (rb.get(room) ?? -Infinity) >= at - 2000) return true;
  return false;
}
/**
 * Meetings whose time has come (by `now`; Infinity at the tick), marked once each: "live" when both columns stood in
 * one room (they fought there: only real deaths count, through columnLost), "sim" otherwise. A meeting costs no men by
 * itself (Murat's call on the W4 review: losses only where a hero is involved), so the war without players plays
 * exactly as before W4; both columns still stand COLUMN.clashMs (the clock) and the clients show it.
 */
function settleMeetings(now: number) {
  if (!saved || !marches.length) return;
  for (const mt of warMeetings()) {
    if (mt.at > now) continue;
    const ca = colOf(mt.a), cb = colOf(mt.b);
    if (ca.met || cb.met || !marchOf(mt.a) || !marchOf(mt.b)) continue;
    ca.met = cb.met = liveTogether(mt.a, mt.b, mt.at) ? "live" : "sim";
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
/** Room `room` has column `id` as real troopers now (a meeting of two columns live in one room is a live clash). */
export function columnSeen(id: string, now = Date.now(), room: unknown = "") {
  const h = halting.get(id);
  if (h !== undefined && now - h > 2500) { halting.delete(id); colVersion++; } // its halt ended
  let r = seenLive.get(id);
  if (!r) seenLive.set(id, (r = new Map()));
  r.set(room, now);
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

// ---- Big battles (W5: shared/war/battles.ts has the rules, server/warBattles.ts the live lines) --------------------

/** Live deaths rooms reported since a battle's last step (attacker, defender): they fill that step's quota. */
const pendingLive = new Map<string, [number, number]>();
/** Men each room fields per battle (room -> [attackers, defenders], when reported): no two rooms field the same men. */
const fielded = new Map<string, Map<unknown, { n: [number, number]; at: number }>>();
/** Per battle: the one room that fields the captains (the room fielding the most men; it keeps them while it reports). */
const captainRoom = new Map<string, unknown>();
/** Per battle: each room's latest banner counts in the current BATTLE.scoreMs window ([attackers, defenders] per banner), and the last window scored. */
type BannerReport = { w: number; n: [number, number][] };
const bannerReports = new Map<string, Map<unknown, { cur: BannerReport; prev?: BannerReport }>>();
const scoredWin = new Map<string, number>();
/** Per battle: per hero name the kill valor and the renown it paid; per clan the valor (BATTLE caps). Memory only. */
const heroCaps = new Map<string, Map<string, { kill: number; renown: number }>>();
const clanCaps = new Map<string, Map<ClanKey, number>>();
/** What happened to the battles since the rooms last looked: announced, started, ended, called off (the rooms announce it). */
export interface BattleNews { kind: "announce" | "start" | "end" | "off" | "banner"; b: Battle; /** "banner": which banner changed hands. */ i?: number }
const battleNews: BattleNews[] = [];
let battleVer = 0;

/** The war save's battles, cleaned (on load and reset): malformed ones are dropped. */
function cleanBattles() {
  if (!saved) return;
  const raw = saved.battles as Partial<BattleSave> | undefined;
  if (!raw || typeof raw !== "object") { delete saved.battles; return; }
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  saved.battles = { list: (Array.isArray(raw.list) ? raw.list : []).flatMap((b) => { const c = cleanBattle(b); return c ? [c] : []; }), day: num(raw.day), n: num(raw.n), meets: num(raw.meets), pitched: num(raw.pitched) };
}
function book(now: number): BattleSave {
  const bs = (saved!.battles ??= { list: [], day: battleDay(now), n: 0, meets: 0, pitched: 0 }), d = battleDay(now);
  if (bs.day !== d) { bs.day = d; bs.n = 0; bs.meets = 0; }
  return bs;
}
const changed = (now: number) => { battleVer++; dirtyAt ||= now; };
/** Is the time [start, end] free of every battle not yet over (one battle at a time)? */
const free = (bs: BattleSave, start: number, end: number) => bs.list.every((b) => !!b.result || b.end <= start || b.start >= end);
/** Pitched battles still to come today (they keep their places under BATTLE.perDay). */
const pitchedLeft = (bs: BattleSave, now: number) => pitchedTimes(battleDay(now)).filter((t) => t > now && t > bs.pitched).length;

/**
 * The battles' clock (every room each second, and the war's own timer): announces the pitched battle BATTLE.noticeMs
 * before its slot, sets each battle's pools at its start, and steps every battle being fought in whole BATTLE.stepMs
 * steps up to `now` (by time, so any number of callers step it once), the live deaths reported meanwhile filling each
 * step's quota. Idempotent.
 */
export function battleClock(now = Date.now()) {
  if (!saved || !BATTLE.live) return;
  const bs = book(now), s = saved.state;
  const slot = pitchedSlot(now);
  if (slot.at - now <= BATTLE.noticeMs && slot.at > bs.pitched) {
    bs.pitched = slot.at; changed(now);
    const taken = new Set(bs.list.filter((b) => !b.result).map((b) => b.t));
    const site = bs.n < BATTLE.perDay && free(bs, slot.at, slot.at + BATTLE.maxMs) ? pickPitched(s, (t) => taken.has(t)) : undefined;
    const f = site && battleField(site.from, site.t);
    if (site && f) add(newBattle(site, "pitched", f.x, f.y, slot.at, 0, 0), now);
  }
  for (const b of [...bs.list]) {
    if (b.result || now < b.start) continue;
    if (!b.begun && !begin(b, now)) continue;
    const step = BATTLE.stepMs;
    while (!b.result && b.start + b.el * 1000 + step <= now + 1e-6) {
      const live = pendingLive.get(b.id) ?? [0, 0];
      pendingLive.delete(b.id);
      battleStep(b, step / 1000, live);
      changed(now);
    }
    if (!b.result) scoreBanners(b, now);
    if (b.result && b.done === undefined) { b.done = now; pendingLive.delete(b.id); battleNews.push({ kind: "end", b }); }
  }
  trimNews();
}
/**
 * The banners' hysteresis (siege.ts frontStep), once per BATTLE.scoreMs window and by time like the steps: every room
 * that has the battle live reports its own count per banner (troopers and active sworn heroes a side in its ring),
 * the counts of all rooms are summed, and each banner steps once with the sum. A window nobody reported leaves the
 * banners as they are, so a room with no men there can neither freeze nor reset them.
 */
function scoreBanners(b: Battle, now: number) {
  const cur = Math.floor((now - b.start) / BATTLE.scoreMs), last = scoredWin.get(b.id);
  scoredWin.set(b.id, cur);
  if (last === undefined) return; // (first sight, or after a restart: from the next window on)
  const reps = bannerReports.get(b.id);
  for (let w = last; w < cur; w++) {
    const sum = b.banners.map((): [number, number] => [0, 0]);
    let any = false;
    for (const x of reps?.values() ?? []) {
      const r = x.cur.w === w ? x.cur : x.prev?.w === w ? x.prev : undefined; // (a room's last count in that window)
      if (r) { any = true; r.n.forEach((c, i) => { if (sum[i]) { sum[i][0] += c[0]; sum[i][1] += c[1]; } }); }
    }
    if (!any) continue;
    b.banners.forEach((f, i) => { if (frontStep(f, sum[i][0], sum[i][1], b.start + (w + 1) * BATTLE.scoreMs)) { battleNews.push({ kind: "banner", b, i }); changed(now); } });
  }
  if (reps) for (const [r, x] of reps) if (x.cur.w < cur - 1) reps.delete(r);
}
function add(b: Battle, now: number) {
  const bs = book(now);
  bs.list.push(b); bs.n++;
  if (b.kind === "meet") bs.meets++;
  battleNews.push({ kind: "announce", b }); changed(now);
}
/** A battle's start: the pools from the forces of the orders for the tick it feeds (false: called off, the land changed hands or the siege lifted). */
function begin(b: Battle, now: number): boolean {
  const s = saved!.state, bs = book(now);
  const off = s.owner[b.t] !== b.b || (b.kind === "pitched" && s.owner[b.from] !== b.a) || (b.kind === "storm" && s.siege[b.t]?.by !== b.a);
  if (off) { bs.list.splice(bs.list.indexOf(b), 1); battleNews.push({ kind: "off", b }); changed(now); return false; }
  const phase = warPhase(saved!.next), dep = deployments(s, saved!.ahead ?? {}, phase);
  let fa: number, fd: number;
  const col = (k: ClanKey, from: number, to: number) => marches.find((m) => m.clan === k && m.from === from && m.to === to)?.force;
  if (b.kind === "meet" && col(b.a, b.from, b.t) !== undefined) { fa = col(b.a, b.from, b.t)!; fd = col(b.b, b.t, b.from) ?? dep.defence[b.t]; }
  else [fa, fd] = siteForces(s, b.kind, b.t, b.a, dep.attack[b.t], dep.defence[b.t], phase);
  setMen(b, fa, fd);
  battleNews.push({ kind: "start", b }); changed(now);
  return true;
}

/**
 * After a tick: a storming for a siege due at the next tick on a close margin (the closest), else the largest meeting
 * of two big columns of clans at war (at most BATTLE.meetPerDay a day), each fought inside this interval and only when
 * no other battle overlaps it and the day's cap (less the pitched battles still to come) allows.
 */
function planBattles(at: number) {
  if (!saved || !BATTLE.live) return;
  const bs = book(at), s = saved.state, next = at + WAR.tickMs, latest = next - BATTLE.tickSlackMs;
  if (bs.n + pitchedLeft(bs, at) >= BATTLE.perDay) return;
  const phase = warPhase(next), dep = deployments(s, saved.ahead ?? {}, phase), supply = supplyMap(s);
  let best = -1, bm = Infinity;
  for (let t = 0; t < s.owner.length; t++) {
    if (!isDecisive(s, t, dep.attack[t], dep.defence[t], phase, supply)) continue;
    const [x, y] = siteForces(s, "storm", t, s.siege[t]!.by, dep.attack[t], dep.defence[t], phase, supply), m = Math.abs(Math.log(Math.max(1e-9, x) / Math.max(1e-9, y)));
    if (m < bm) { bm = m; best = t; }
  }
  const start = at + BATTLE.stormLeadMs, end = Math.min(start + BATTLE.shortMs, latest);
  if (best >= 0 && free(bs, start, end)) {
    const by = s.siege[best]!.by, q = stormField(s.owner, best, by) ?? { x: TERRITORIES[best].cx * TILE, y: TERRITORIES[best].cy * TILE };
    const near = TERRITORIES[best].near.find((n) => s.owner[n] === by) ?? best;
    add(newBattle({ t: best, from: near, a: by, b: s.owner[best] }, "storm", q.x, q.y, start, 0, 0, end - start), at);
    return;
  }
  if (bs.meets >= BATTLE.meetPerDay) return;
  const pairs = warMeetings().flatMap((mt) => { const a = marchOf(mt.a), b = marchOf(mt.b); return a && b ? [{ a, b, mt }] : []; });
  for (const { a, b, mt } of pickMeetings(pairs, pairs.length)) {
    const site = meetSite(a, b), e = Math.min(mt.at + BATTLE.shortMs, latest);
    if (!site || e - mt.at < BATTLE.minMs || !free(bs, mt.at, e)) continue;
    add(newBattle({ t: site.t, from: site.from, a: site.a, b: site.b }, "meet", mt.x, mt.y, mt.at, site.forceA, site.forceB, e - mt.at), at);
    return;
  }
}

/** The tick's battle outcomes (rules.ts TickExtra.battle): every battle over and not yet fed, once; old ones are dropped. */
function battleOutcomes(at: number): NonNullable<TickExtra["battle"]> {
  const bs = saved?.battles;
  if (!bs) return [];
  const out: NonNullable<TickExtra["battle"]> = [];
  // a battle more than a tick interval past its end is stale (never begun, or kept from a long outage): dropped unfed
  const stale = (b: Battle) => at - b.end > WAR.tickMs;
  for (const b of bs.list) if (b.result && !b.fed && !stale(b)) { const o = battleOutcome(b); if (o) out.push(o); b.fed = true; }
  bs.list = bs.list.filter((b) => !stale(b) && !(b.fed && at - (b.done ?? 0) > BATTLE.keepMs));
  for (const m of [heroCaps, clanCaps, fielded, captainRoom, bannerReports, scoredWin] as Map<string, unknown>[])
    for (const id of [...m.keys()]) if (!bs.list.some((b) => b.id === id)) m.delete(id);
  if (out.length) battleVer++;
  lastFed = out;
  return out;
}
let lastFed: NonNullable<TickExtra["battle"]> = [];
/** Tests: the battle outcomes the last war tick was given. */
export const _battleFed = () => lastFed;

/** The battles announced, being fought or just over (oldest first). */
export const warBattles = (): readonly Battle[] => saved?.battles?.list ?? [];
/** Bumped on every battle change rooms pass on ("battle"). */
export const battlesVersion = () => battleVer;
/** The battle news since the last call (each room keeps its own read position: `from`), and the new position. */
export function battleNewsSince(from: number): { news: BattleNews[]; at: number } {
  return { news: Number.isFinite(from) ? battleNews.slice(Math.max(0, from - newsBase)) : [], at: newsBase + battleNews.length };
}
let newsBase = 0;
/** Keeps the last 64 news entries (a room more than 64 behind skips the oldest). */
function trimNews() { if (battleNews.length > 64) { const n = battleNews.length - 64; battleNews.splice(0, n); newsBase += n; } }
const byId = (id: string) => saved?.battles?.list.find((b) => b.id === id);
const fighting = (id: string) => { const b = byId(id); return b && b.begun && !b.result ? b : undefined; };

/** `n` men of side `side` (0 attacker, 1 defender) fell in a room: they fill the next step's quota (only the excess costs extra). */
export function battleDeath(id: string, side: 0 | 1, n = 1): boolean {
  if (!fighting(id) || !(n > 0) || (side !== 0 && side !== 1)) return false;
  const p = pendingLive.get(id) ?? [0, 0];
  p[side] += n; pendingLive.set(id, p);
  return true;
}
/**
 * Room `room` fields `n` men a side of battle `id` now: what it may field, its share of the pools left after what other
 * rooms (reported within 5 s) field. Every room calls it each second for the battle it has live.
 */
export function battleFielded(id: string, room: unknown, n: [number, number], now = Date.now()): { may: [number, number]; captains: boolean } {
  const b = fighting(id);
  if (!b) return { may: [0, 0], captains: false };
  let m = fielded.get(id);
  if (!m) fielded.set(id, (m = new Map()));
  m.set(room, { n: [Math.max(0, n[0]), Math.max(0, n[1])], at: now });
  const others: [number, number] = [0, 0];
  let most: unknown, mostN = 0;
  for (const [r, f] of m) {
    if (now - f.at > BATTLE.roomStaleMs) { m.delete(r); continue; }
    if (r !== room) { others[0] += f.n[0]; others[1] += f.n[1]; }
    if (f.n[0] + f.n[1] > mostN) { mostN = f.n[0] + f.n[1]; most = r; }
  }
  // the captains: one room only, the one fielding the most men; it keeps them while it reports and fields any
  const cur = captainRoom.get(id), keep = cur !== undefined && m.has(cur) && m.get(cur)!.n[0] + m.get(cur)!.n[1] > 0;
  if (!keep) { if (most !== undefined) captainRoom.set(id, most); else if (cur === undefined || !m.has(cur)) captainRoom.set(id, room); }
  return { may: [Math.max(0, b.men[0] - others[0]), Math.max(0, b.men[1] - others[1])], captains: captainRoom.get(id) === room };
}
/**
 * Room `room` counted the banners' rings of battle `id` now ([attackers, defenders] per banner: its troopers and its
 * active sworn heroes): its latest count in this BATTLE.scoreMs window. The clock sums the rooms' counts per window
 * (scoreBanners). Only rooms that have the battle live report.
 */
export function battleScore(id: string, room: unknown, n: readonly (readonly [number, number])[], now = Date.now()) {
  const b = fighting(id);
  if (!b || !Array.isArray(n) || n.length !== b.banners.length) return;
  let m = bannerReports.get(id);
  if (!m) bannerReports.set(id, (m = new Map()));
  const ok = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  const rep: BannerReport = { w: Math.floor((now - b.start) / BATTLE.scoreMs), n: n.map((x) => [ok(x[0]), ok(x[1])] as [number, number]) }, was = m.get(room);
  m.set(room, { cur: rep, prev: was && was.cur.w !== rep.w ? was.cur : was?.prev });
}
/** A storming is announced or being fought at land t (its siege's live waves stand down: server/warSieges.ts). */
export const stormingAt = (t: number): boolean => warBattles().some((b) => b.kind === "storm" && b.t === t && !b.result);
/**
 * Column m stands in a meeting battle being fought now: its live troopers stand down while it runs (the battle's
 * lines take their place; server/warMarches.ts).
 */
export const inMeetBattle = (m: Pick<March, "clan" | "from" | "to">, now = Date.now()): boolean => warBattles().some((b) => b.kind === "meet" && !b.result && now >= b.start
  && ((m.clan === b.a && m.from === b.from && m.to === b.t) || (m.clan === b.b && m.from === b.t && m.to === b.from)));
/** A captain of side `side` fell: that side kills slower for the rest of the battle. False when it has none left. */
export function battleCaptain(id: string, side: 0 | 1, now = Date.now()): boolean {
  const b = fighting(id);
  if (!b || b.captains[side] >= BATTLE.captains) return false;
  b.captains[side]++; changed(now);
  return true;
}
/**
 * What a hero may still take from battle `id`: `kill` valor (BATTLE.killValorCap) or `renown` (BATTLE.renownCap).
 * Books and returns the share of `amount` granted.
 */
export function battleGrant(id: string, name: string, kind: "kill" | "renown", amount: number): number {
  if (!byId(id) || !(amount > 0)) return 0;
  let m = heroCaps.get(id);
  if (!m) heroCaps.set(id, (m = new Map()));
  const c = m.get(name) ?? { kill: 0, renown: 0 }, cap = kind === "kill" ? BATTLE.killValorCap : BATTLE.renownCap;
  const add = Math.max(0, Math.min(amount, cap - c[kind]));
  c[kind] += add; m.set(name, c);
  return add;
}
/** Valor clan `k` may still bring in from battle `id` (BATTLE.valorCap a clan): booked and returned. */
export function battleClanValor(id: string, k: ClanKey, amount: number): number {
  if (!byId(id) || !(amount > 0)) return 0;
  let m = clanCaps.get(id);
  if (!m) clanCaps.set(id, (m = new Map()));
  const add = Math.max(0, Math.min(amount, BATTLE.valorCap - (m.get(k) ?? 0)));
  m.set(k, (m.get(k) ?? 0) + add);
  return add;
}
/** Tests and the bench: a battle of this kind at `site` starting at `start` (ms), placed at once, whatever the schedule. */
export function _forceBattle(site: BattleSite, kind: Battle["kind"], start: number, x: number, y: number, ms?: number): Battle | undefined {
  if (!saved) return undefined;
  const b = newBattle(site, kind, x, y, start, 0, 0, ms);
  add(b, Date.now());
  return b;
}


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
 * sworn heroes only (server/warIntel.ts): the plan is secret from the other clans, though its marching columns are not
 * (server/warMarches.ts sends each hero their own clan's columns and any other within COLUMN.scoutTiles of them).
 * Undefined before the orders are known or when the clan gave no orders.
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
  pendingLive.clear(); fielded.clear(); captainRoom.clear(); bannerReports.clear(); scoredWin.clear(); heroCaps.clear(); clanCaps.clear(); battleNews.length = 0; cleanBattles(); battleVer++;
  heldGate.clear(); cleanTowns(); townVer++; // (W6)
  saved.crown = cleanCrown(saved.crown); // (Crown PR4)
  saved.council = cleanCouncil(saved.council); // (M3)
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
    let townLines = 0;
    for (const e of events) {
      if (e.kind === "town") { townNews(room, e, ++townLines); continue; } // (W6: Herald capped per tick, sfx, the "towns" message)
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
    for (const p of news.proclaim ?? []) room.broadcast("chat", { id: "", name: "Herald", text: proclaimLine(p.clan, p.text) }); // (M3: lead councils only)
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

// ---- Capturable towns (W6: shared/war/towns.ts has the rules, server/warTowns.ts the gate fight and the claim) ----------

/** Towns whose old holder kept the gate during the current war tick (a guard alive and an active defender: warTowns). */
const heldGate = new Set<string>();
/** Bumped on every town change rooms pass on ("towns"). */
let townVer = 0;

/**
 * The war save's towns, cleaned (on load and reset): every town of TOWNS gets a holder (a saved one, else its land's
 * holder, with no contest), a contest only when it names a clan other than the holder and finite ticks. Unknown towns
 * are dropped. A town whose land is missing from the map keeps a valid saved holder (or the first clan).
 */
function cleanTowns() {
  if (!saved) return;
  saved.towns = cleanTownSave(saved.towns, saved.state.owner);
}
/** Pure: a raw `towns` save field cleaned against the war's owners (tests). */
export function cleanTownSave(raw: unknown, owner: readonly ClanKey[]): Record<string, TownState> {
  const src = raw && typeof raw === "object" ? (raw as Record<string, Partial<TownState> | undefined>) : {}, out: Record<string, TownState> = {};
  for (const t of TOWNS) {
    const r = src[t.id], p = townPatron(t.id), land = p >= 0 ? owner[p] : undefined;
    const k = r && CLANS[r.k as ClanKey] ? (r.k as ClanKey) : land ?? CLAN_KEYS[0];
    const c = r?.c, ok = !!c && typeof c === "object" && !!CLANS[c.by as ClanKey] && c.by !== k && Number.isFinite(c.until) && Number.isFinite(c.ext);
    out[t.id] = ok ? { k, c: { by: c!.by as ClanKey, until: Math.floor(c!.until), ext: Math.max(0, Math.min(TOWN.maxExt, Math.floor(c!.ext))) } } : { k };
  }
  return out;
}
/** What the tick hands warTick for the towns (TickExtra.towns), only while the towns are live. */
const townExtra = (): { towns?: Partial<Record<ClanKey, number>> } => (TOWN.live && saved?.towns ? { towns: townCounts(saved.towns) } : {});

const townName = (id: string) => townById(id)?.name ?? id;
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
/** The Herald's line for a town's news. */
export function townLine(id: string, change: TownChange | "claimed", by: ClanKey, from: ClanKey, hero?: string): string {
  const n = townName(id), B = CLANS[by].name, F = CLANS[from].name;
  if (change === "contested") return `${B} hold ${townById(id)?.patron ?? "its land"}: ${n} is contested. ${F} keep its gate for now.`;
  if (change === "off") return `${F} hold their land again: the contest for ${n} is over.`;
  if (change === "submitted") return `${cap(n)} submits to ${B}. ${F} give up its hall.`;
  return `${hero ? `${hero} of ${B}` : B} raised the banner at the gate of ${n}: it belongs to ${B} now.`;
}

/** After each war tick (the owners moved): every town follows its land (townStep), the gate held this tick or not. */
function stepTowns(at: number): WarEvent[] {
  if (!saved || !TOWN.live) { heldGate.clear(); return []; }
  const s = saved.state, towns = (saved.towns ??= cleanTownSave(undefined, s.owner)), out: WarEvent[] = [];
  for (const t of TOWNS) {
    const p = townPatron(t.id);
    if (p < 0 || !s.owner[p]) continue;
    const prev = towns[t.id], r = townStep(prev, s.owner[p], s.tick, heldGate.has(t.id));
    towns[t.id] = r.s;
    if (!r.change || !prev) continue;
    const by = r.change === "off" ? prev.k : r.change === "submitted" ? r.s.k : r.s.c!.by, from = prev.k;
    out.push({ at, tick: s.tick, kind: "town", t: p, by, from, town: t.id, change: r.change, text: townLine(t.id, r.change, by, r.change === "off" ? prev.c?.by ?? from : from) });
  }
  heldGate.clear();
  if (out.length) townVer++;
  return out;
}

/** Every town's state (empty before the war is loaded). */
export const warTowns = (): Readonly<Record<string, TownState>> => saved?.towns ?? {};
/** The clients' towns view, with the banners going up (`raising`: town id -> 0..100). */
export const townsNow = (raising: Partial<Record<string, number>> = {}): TownsMsg =>
  (saved?.towns ? townsView(saved.towns, saved.state.tick, saved.next, raising) : { list: [] });
/** Bumped on every town change rooms pass on ("towns"). */
export const townsVersion = () => townVer;
/** Town `id`'s old holder kept its gate in this war tick (a guard alive and an active defender: server/warTowns.ts). */
export function townHeld(id: string): boolean {
  const c = saved?.towns?.[id]?.c;
  if (!c) return false;
  heldGate.add(id);
  return true;
}
/** Tests: the towns' step after a war tick, on the state as it is (no warTick). */
export const _stepTowns = (at = Date.now()) => stepTowns(at);
/** Tests: towns held this tick so far. */
export const _townsHeld = () => [...heldGate];

/**
 * A hero sworn to `k` raised its banner at the gate of contested town `id` (server/warTowns.ts checked the gate): the
 * town flips at once, the clan earns TOWN.claimValor in the patron land, the news goes out like a tick's (every room's
 * Herald, sfx and "towns"), the war is saved. False when the town is not contested by `k`.
 */
export function townClaim(id: string, k: ClanKey, hero = "A hero", now = Date.now()): boolean {
  const st = saved?.towns?.[id], p = townPatron(id);
  if (!saved || !TOWN.live || !st?.c || st.c.by !== k || p < 0) return false;
  const from = st.k;
  saved.towns![id] = { k };
  heldGate.delete(id);
  addValor(p, k, TOWN.claimValor);
  const e: WarEvent = { at: now, tick: saved.state.tick, kind: "town", t: p, by: k, from, town: id, change: "claimed", text: townLine(id, "claimed", k, from, hero) };
  saved.log.push(e);
  if (saved.log.length > LOG_MAX) saved.log.splice(0, saved.log.length - LOG_MAX);
  if (!process.env.NODE_TEST_CONTEXT) console.log(`War: ${e.text}`);
  townVer++;
  const view = viewOf(saved);
  listeners.forEach((f) => { try { f(view, [e], {}); } catch (err) { console.error("War listener:", err); } });
  kv?.set(KEY, saved).catch((err) => console.error("War: could not save:", err));
  return true;
}
/** Tests: set a town's state as it is (no checks). */
export function _setTown(id: string, s: TownState) { if (saved) { (saved.towns ??= {})[id] = s; townVer++; } }

/** A room passes on a town's news: the Herald (at most TOWN.heraldPerTick lines a tick: `n` counts them) and a sound at the gate. */
function townNews(room: { broadcast(type: string, msg: unknown): void }, e: WarEvent, n: number) {
  if (n <= TOWN.heraldPerTick) room.broadcast("chat", { id: "", name: "Herald", text: e.text });
  const t = townById(e.town);
  if (n <= TOWN.heraldPerTick && e.change !== "off") { // the leaders answer: the new holder boasts, the old one grieves (or the defender calls its gate)
    const nm = townName(e.town!), say = (k: ClanKey, m: WarMoment, foe: ClanKey) => { const l = leaderLine(k, m, nm, foe, e.tick); room.broadcast("chat", { id: "", name: l.name, text: l.text }); };
    if (e.change === "contested") say(e.from, "town_contested", e.by);
    else { say(e.by, "town_claimed", e.from); say(e.from, "town_lost", e.by); }
  }
  if (t && e.change !== "off") room.broadcast("sfx", { ev: e.change === "contested" ? "town_contested" : "town_claimed", id: t.id, x: Math.round((t.gate.x + 0.5) * TILE), y: Math.round((t.gate.y + 0.5) * TILE), by: e.by, from: e.from });
  // (the "towns" view, with the banners going up there, goes out from each room's own WarTowns.onWar, the same news)
}

// ---- The Reckoning (Crown PR4: shared/war/crown.ts has the rules, server/warCrown.ts the window and the pay) ---------------

/** The war save's Reckoning part (created on first use), or undefined before the war is loaded. */
export const warCrownSave = (): CrownSave | undefined => (saved ? (saved.crown ??= {}) : undefined);
/** The Reckoning changed the save: written with the next step's save, or at once when `now` is set (a result, a payout). */
export function warCrownChanged(now: number, atOnce = false) {
  if (!saved) return;
  if (atOnce) { void save(now); return; } // through the save chain: never two war writes in flight
  dirtyAt ||= now;
}
/**
 * A Reckoning gave the Keep (territory t, rules.ts never moves it) to clan `k`: full Control, no siege, no works; the
 * news goes out like a tick's (a "flip" event: the Herald, the leaders, the horn, every room's snapshot).
 */
export function crownKeep(t: number, k: ClanKey, text: string, now = Date.now()) {
  if (!saved || !CLANS[k] || !(t >= 0 && t < saved.state.owner.length)) return;
  const s = saved.state, from = s.owner[t];
  if (from === k) return;
  s.owner[t] = k; s.control[t] = 100; s.siege[t] = null; s.fort[t] = 0; s.pressure[t] = 0;
  const e: WarEvent = { at: now, tick: s.tick, kind: "flip", t, by: k, from, text };
  saved.log.push(e);
  if (saved.log.length > LOG_MAX) saved.log.splice(0, saved.log.length - LOG_MAX);
  if (!process.env.NODE_TEST_CONTEXT) console.log(`War: ${text}`);
  relate();
  const view = viewOf(saved);
  listeners.forEach((f) => { try { f(view, [e], {}); } catch (err) { console.error("War listener:", err); } });
}

// ---- War Councils (M3: shared/war/council.ts has the rules, server/warCouncil.ts the sessions and the remote routes) -----

/** The war save's council part (created on first use), or undefined before the war is loaded. */
export const warCouncilSave = (): CouncilSave | undefined => (saved ? (saved.council ??= cleanCouncil(undefined)) : undefined);
/** The councils changed the save: written with the next step's save, or at once (`atOnce`: a remote submission). */
export function warCouncilChanged(now: number, atOnce = false) {
  if (!saved) return;
  if (atOnce) { void save(now); return; } // through the save chain: never two war writes in flight
  dirtyAt ||= now;
}
/** When the next war tick is due (ms), or undefined before the war is loaded. */
export const warNextTick = (): number | undefined => saved?.next;
