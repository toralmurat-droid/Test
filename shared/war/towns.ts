/**
 * Capturable towns and villages (W6). A few settlements belong to a clan: the holder of the town's patron land, with a
 * delay. When the land changes hands the town is contested by the new holder for TOWN.graceTicks war ticks; the old
 * holder's town guard stands at a gate muster outside the town (server/warTowns.ts), a hero sworn to the new holder may
 * raise its banner there once the guard is down (the claim: the town flips at once), and with nobody claiming it the
 * town submits when the grace runs out. A town never flips while its land does not. Inside, nothing changes but the
 * look (banners, the town watch and a steward NPC in the holder's colours) and a discount for the holder's sworn
 * heroes at the town's shops: no settlement ever sees a fight, and towns are not territories (the war map's count, and
 * so server/war.ts fits(), is untouched). Pure rules, spots and numbers: the room module, the war and the sim read them.
 */
import { TILE } from "../constants";
import { AREAS } from "../map";
import { HOLD_SACK } from "./holdSack";
import { WAR } from "./rules";
import { CLAN_KEYS, CLANS, type ClanKey } from "./clans";
import { TERRITORIES } from "./territories";

export const TOWN = {
  /** Master switch: off, no town is contested, guarded or claimed (and no discount is given). */
  live: true,
  /** War ticks a contest runs before the town submits to its land's new holder (30 min). */
  graceTicks: 3,
  /** Most war ticks of grace the defenders can add by holding the gate (one per tick held). */
  maxExt: 3,
  /** The town guard at the gate muster while contested: soldiers and one captain of the old holder. */
  guards: 4, captain: 1,
  /** Gate guards are at least this level, so a town on a beginner land (Millbrook, North Meadow) still needs a real fight. */
  minGuardLevel: 15,
  /** Time to raise the banner at the gate (ms): the Holds' sack rules (holdSack.ts sackStep). */
  raiseMs: HOLD_SACK.raiseMs,
  /** The raiser must stand this close to the gate (tiles): to start, and (x1.5) to keep raising. */
  useTiles: 1.5,
  /** The gate's reach (px, a circle round the gate): guards and defenders inside it stop a claim; the claim's renown goes to the sworn inside it. */
  reachPx: 6 * TILE,
  /** The guard wakes when a living hero above ground is this close to the gate (tiles), and sleeps sleepMs after the last one left. */
  wakeTiles: 30, sleepMs: 30_000,
  /** No guard chases anything farther than this from the gate (px), nor onto town ground (keepOut). */
  leashPx: 8 * TILE,
  /** Town ground: the settlement's area plus this margin (tiles). No trooper stands or fights on it. */
  marginTiles: 2,
  /** A gate muster stands at least this far (tiles, Chebyshev) outside town ground, so its whole guard ring does too. */
  gateClearTiles: 3,
  /** Shop discount for heroes sworn to the holder (never a surcharge for anyone). */
  discount: 0.1,
  /** A claim: valor for the clan in the patron land, renown for each of its sworn heroes in the reach. */
  claimValor: 10, claimRenown: 20,
  /** Most town lines the Herald says per war tick (the log keeps the rest). */
  heraldPerTick: 3,
  /** The raise's progress reaches the clients at most this often (ms). */
  sendMs: 1000,
};

export type TownId = "saltmere" | "rustwater" | "ropewell" | "millbrook";
/** A capturable settlement. Spots are tiles; `area` is its shared/map.ts AREAS name, `patron` the territory it follows. */
export interface Town {
  id: TownId; name: string; kind: "town" | "village"; area: string; patron: string;
  /** The gate muster: a tile on the road out of town, beyond town ground (keepOut) by TOWN.gateClearTiles. */
  gate: { x: number; y: number };
  /** Where the holder's banners fly (cosmetic, drawn by the client). */
  banners: { x: number; y: number }[];
  /** Where the steward stands (an NPC of shared/npcs.ts, `steward_<id>`). */
  steward: { x: number; y: number };
}

/**
 * Owner question 1 (2026-11-16, defaults): Oakvale stays the Wardens' hub; Cairnwatch and the Hunter's Camp follow
 * Wardens capitals that never fall; Kel Ashar is Act 2's main town. Spots checked by tests/warTowns.test.ts.
 */
export const TOWNS: readonly Town[] = [
  { id: "saltmere", name: "Saltmere", kind: "town", area: "Saltmere", patron: "Saltwind Coast", gate: { x: 171, y: 183 }, banners: [{ x: 148, y: 182 }, { x: 152, y: 182 }], steward: { x: 150, y: 182 } },
  { id: "rustwater", name: "the Rustwater Post", kind: "town", area: "The Rustwater Post", patron: "The Saltlick Flats", gate: { x: 212, y: 872 }, banners: [{ x: 226, y: 875 }, { x: 230, y: 875 }], steward: { x: 228, y: 875 } },
  { id: "ropewell", name: "Ropewell", kind: "town", area: "Ropewell", patron: "Rootfall Slopes", gate: { x: 136, y: 993 }, banners: [{ x: 108, y: 995 }, { x: 112, y: 995 }], steward: { x: 110, y: 995 } },
  { id: "millbrook", name: "Millbrook Mill", kind: "village", area: "Millbrook Mill", patron: "North Meadow", gate: { x: 99, y: 52 }, banners: [{ x: 108, y: 48 }, { x: 112, y: 48 }], steward: { x: 110, y: 48 } },
];
export const TOWN_IDS = TOWNS.map((t) => t.id);
export const townById = (id: unknown): Town | undefined => TOWNS.find((t) => t.id === id);

/** Territory id of a town's patron land (-1 when the map has no such land: then the town stays as it is). */
export function townPatron(id: string): number {
  const name = townById(id)?.patron;
  return TERRITORIES.find((t) => t.name === name)?.id ?? -1;
}

const rectOf = (t: Town) => AREAS.find((a) => a.name === t.area);
/** Town ground (tiles, x1/y1 exclusive): the area plus TOWN.marginTiles. */
export function keepOut(t: Town): { x0: number; y0: number; x1: number; y1: number } | undefined {
  const a = rectOf(t), m = TOWN.marginTiles;
  return a && { x0: a.x - m, y0: a.y - m, x1: a.x + a.w + m, y1: a.y + a.h + m };
}
/** The capturable town whose area holds (px, py), if any (the price and the plaque). */
export function townAt(px: number, py: number): Town | undefined {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  return TOWNS.find((t) => { const a = rectOf(t); return !!a && tx >= a.x && ty >= a.y && tx < a.x + a.w && ty < a.y + a.h; });
}
/** Is (px, py) on any capturable town's ground (area plus margin)? No town guard stands or chases there. */
export function onTownGround(px: number, py: number): boolean {
  const tx = px / TILE, ty = py / TILE;
  return TOWNS.some((t) => { const r = keepOut(t); return !!r && tx >= r.x0 && ty >= r.y0 && tx < r.x1 && ty < r.y1; });
}
/** The gate muster's middle (px). */
export const gatePx = (t: Town) => ({ x: (t.gate.x + 0.5) * TILE, y: (t.gate.y + 0.5) * TILE });
/** The town guard's posts round the gate (px): the captain on the gate, the soldiers on a ring about it. */
export function gatePosts(t: Town): { x: number; y: number }[] {
  const g = gatePx(t), out = [g], n = TOWN.guards, r = 1.5 * TILE;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.PI / 4; out.push({ x: g.x + Math.cos(a) * r, y: g.y + Math.sin(a) * r }); }
  return out;
}
/** Is (px, py) within the gate's reach? */
export const inGateReach = (t: Town, px: number, py: number) => { const g = gatePx(t); return Math.hypot(px - g.x, py - g.y) <= TOWN.reachPx; };

/** A running contest: the land's new holder `by`, the war tick it submits at (`until`), and the ticks the gate added (`ext`). */
export interface TownContest { by: ClanKey; until: number; ext: number }
/** A town's state (saved in the war save: server/war.ts, field `towns`): its holder and any contest. */
export interface TownState { k: ClanKey; c?: TownContest }
export type TownChange = "contested" | "off" | "submitted";

/**
 * One war tick of a town (`tick`: the war's tick after it ran): `owner` is the patron land's holder now, `held` whether
 * the old holder kept the gate during that tick (a guard alive and an active defender at it). A land that changed hands
 * contests the town for TOWN.graceTicks; a contest is called off when the land goes back to the town's holder, starts
 * over when a third clan takes the land, gains a tick per tick held (at most TOWN.maxExt), and the town submits when
 * its time is up. Each held town adds WAR.townIncome to its holder's income (rules.ts TickExtra.towns). Pure: returns the new state and what happened.
 */
export function townStep(prev: TownState | undefined, owner: ClanKey, tick: number, held = false): { s: TownState; change?: TownChange } {
  if (!prev || !CLANS[prev.k]) return { s: { k: owner } };
  const c = prev.c;
  if (!c) return owner === prev.k ? { s: prev } : { s: { k: prev.k, c: { by: owner, until: tick + TOWN.graceTicks, ext: 0 } }, change: "contested" };
  if (owner === prev.k) return { s: { k: prev.k }, change: "off" };
  if (owner !== c.by) return { s: { k: prev.k, c: { by: owner, until: tick + TOWN.graceTicks, ext: 0 } }, change: "contested" };
  const next: TownContest = held && c.ext < TOWN.maxExt ? { by: c.by, until: c.until + 1, ext: c.ext + 1 } : { ...c };
  if (tick >= next.until) return { s: { k: c.by }, change: "submitted" };
  return { s: { k: prev.k, c: next } };
}

/**
 * What a hero pays at a town's shop: `holder`'s sworn heroes (`heroClan`) pay TOWN.discount less; everyone else the
 * plain price, never more. Outside a capturable town (no `town`) nothing changes. Sell prices never go through it.
 */
export function townPrice(base: number, town: Town | undefined, holder: ClanKey | undefined, heroClan: ClanKey | undefined): number {
  if (!TOWN.live || !town || !holder || !heroClan || heroClan !== holder || !(base > 0)) return base;
  return Math.min(base, Math.max(1, Math.round(base * (1 - TOWN.discount))));
}

/**
 * What the clients get ("towns" message): per town its holder (`k`, a CLAN_KEYS index), any contest (`c`: the contester's
 * index and the wall-clock ms it submits at, if nobody claims it and the gate is not held) and a banner going up at its
 * gate (`raise`: 0..100).
 */
export interface TownsMsg { list: { id: TownId; k: number; c?: { by: number; until: number }; raise?: number }[] }
/** The towns' view: `tick` is the war's tick now, `next` the wall-clock ms of the next war tick. */
export function townsView(state: Partial<Record<string, TownState>>, tick: number, next: number, raising: Partial<Record<string, number>> = {}): TownsMsg {
  const list: TownsMsg["list"] = [];
  for (const t of TOWNS) {
    const s = state[t.id];
    if (!s) continue;
    const e: TownsMsg["list"][number] = { id: t.id, k: CLAN_KEYS.indexOf(s.k) };
    if (s.c) e.c = { by: CLAN_KEYS.indexOf(s.c.by), until: next + (s.c.until - tick - 1) * WAR.tickMs };
    const r = raising[t.id];
    if (r !== undefined) e.raise = Math.max(0, Math.min(100, Math.floor(r)));
    list.push(e);
  }
  return { list };
}
/** The client's reading of a "towns" message (junk dropped). */
export function cleanTownsMsg(m: unknown): TownsMsg {
  const raw = m && typeof m === "object" && Array.isArray((m as TownsMsg).list) ? (m as TownsMsg).list : [];
  const clan = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < CLAN_KEYS.length;
  const list: TownsMsg["list"] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object" || !townById(e.id) || !clan(e.k)) continue;
    const o: TownsMsg["list"][number] = { id: e.id, k: e.k };
    if (e.c && clan(e.c.by) && Number.isFinite(e.c.until)) o.c = { by: e.c.by, until: e.c.until };
    if (Number.isFinite(e.raise)) o.raise = Math.max(0, Math.min(100, Math.floor(e.raise!)));
    list.push(o);
  }
  return { list };
}
/** Held towns per clan (rules.ts TickExtra.towns): what the live war and the sim hand to warTick. */
export function townCounts(state: Partial<Record<string, TownState>>): Partial<Record<ClanKey, number>> {
  const out: Partial<Record<ClanKey, number>> = {};
  for (const t of TOWNS) { const k = state[t.id]?.k; if (k && CLANS[k]) out[k] = (out[k] ?? 0) + 1; }
  return out;
}
