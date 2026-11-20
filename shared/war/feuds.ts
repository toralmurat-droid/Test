/**
 * Feuds (Murat 2026-11-15: "we should be able to engage in attacking an encampment or soldiers of another clan than our
 * own of our own initiative (ennemy clans would attack us, but neutral clans would only respond to us engaging first).
 * Also in case you kill clan members this could create some kind of 'wanted' status until killed by the clan").
 *
 * Three things decide how a clan's soldiers see a hero (troops.ts troopStance reads them):
 * - war: two clans are at war while one can strike the other's land (rules.ts targetsOf: neighbours, two borders for
 *   the Hide-Kin), and for FEUD.peaceTicks war ticks after that ended. A hero sworn to one is fought by the other.
 * - a grudge: a hero who deliberately provoked a clan (the "provoke" message) or killed its people is fought by it
 *   until the grudge runs out; every blow on its soldiers keeps it going.
 * - Wanted: kill points per clan, tiers at FEUD.tiers. Wanted heroes are seen from farther and chased past the land;
 *   from Hunted on the clan sends manhunters (server/warFeuds.ts). Points decay; death at that clan's hands clears them.
 * Pure rules and numbers; the server (server/warFeuds.ts), the client (client/src/warFeud.ts) and the tests read them.
 */
import { CLAN_KEYS, type ClanKey } from "./clans";
import { targetsOf } from "./rules";
import type { TroopPart } from "./troops";

export const FEUD = {
  /** Two clans stay at war this many war ticks after they last could strike each other's land. */
  peaceTicks: 6,
  /** A grudge lasts this long after the provocation or the last blow on that clan's people. */
  grudgeMs: 10 * 60_000,
  /** A provocation needs a trooper or a Hold of that clan this close to the hero (tiles). */
  provokeTiles: 10,
  /** Kill points per victim: soldiers, officers, objects (cart, ram, tunnel mouth), heroes sworn to the clan. */
  pts: { soldier: 1, officer: 2, cart: 2, ram: 2, mouth: 2, work: 1, hero: 3 } as Record<TroopPart | "hero", number>,
  /** A sworn hero's kills of a clan at war with their own count this much (fighting for your clan is the point of the
   * war: only a rampage builds Wanted). Kills of a provoked neutral clan, and every unsworn hero's kills, count in full. */
  warKillWeight: 1 / 3,
  /** Points at which a hero becomes Wanted, Hunted, Marked (tiers 1, 2, 3). */
  tiers: [4, 10, 20],
  /** Points never climb past this (so decay brings a rampage down in a sane time). */
  maxPts: 30,
  /** One point is forgiven per this long without a new kill of that clan's people (Wanted lasts ~40 min, Hunted hours:
   * the way out is meant to be death at the clan's hands)... */
  decayMs: 10 * 60_000,
  /** ...and time logged out counts this much (logging out is never the quickest way out). */
  offlineDecay: 0.5,
  /** A Wanted hero is seen this many times as far... */
  sight: 2,
  /** ...and chased this many tiles farther past the land's leash (WAR_TROOPS.leashTiles). */
  leashTiles: 4,
  /** Manhunters: from Hunted on, a squad marches from the nearest Hold of that clan within `fromTiles` of the hero. */
  hunt: {
    fromTiles: 40,
    /** Soldiers with the captain, and levels above the hero, by tier (index: tier; tiers below 2 send none). */
    soldiers: [0, 0, 3, 4], levelUp: [0, 0, 0, 2],
    /** Squads at most per room; a hero waits this long after one ends before the next comes. */
    perRoom: 2, cooldownMs: 5 * 60_000,
    /** A squad gives up after this long, or when its quarry is this far from all of them (tiles). */
    lifeMs: 5 * 60_000, loseTiles: 60,
    /** They fight anything their clan fights within this many tiles of the quarry. */
    leashTiles: 12,
  },
  /** A hero sworn to the clan who kills a Wanted hero: renown and valor, once per target per UTC day. */
  bounty: { renown: 15, valor: 3, perDay: 3 },
};

/** Tier names (index: wantedTier). */
export const WANTED_TIERS = ["", "Wanted", "Hunted", "Marked"] as const;

/** One clan's account with a hero. `until`: grudge end (ms); `pts`: kill points; `at`: last kill or decay step (ms); `paid`: UTC day a bounty was last paid on them. */
export interface FeudEntry { until?: number; pts?: number; at?: number; paid?: number }
/** A hero's feuds by clan (saved as HeroSave.feud; missing = none). */
export type FeudState = Partial<Record<ClanKey, FeudEntry>>;

export const utcDay = (now: number) => Math.floor(now / 86_400_000);

// ---- war relations: set by the server after every war tick, by the client from the "war" snapshot -----------------

const N = CLAN_KEYS.length;
/** Index of the unordered pair (a, b), a !== b, in 0..9. */
export function pairOf(a: ClanKey, b: ClanKey): number {
  let i = CLAN_KEYS.indexOf(a), j = CLAN_KEYS.indexOf(b);
  if (i < 0 || j < 0 || i === j) return -1;
  if (i > j) [i, j] = [j, i];
  return i * N - (i * (i + 1)) / 2 + (j - i - 1);
}
const PAIRS = (N * (N - 1)) / 2;
/** The clans of pair p (pairOf's inverse). */
export function clansOf(p: number): [ClanKey, ClanKey] | undefined {
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (pairOf(CLAN_KEYS[i], CLAN_KEYS[j]) === p) return [CLAN_KEYS[i], CLAN_KEYS[j]];
  return undefined;
}

/** The pairs whose land touches now: either can strike the other's (targetsOf). */
export function borderPairs(owner: readonly (ClanKey | number | null | undefined)[]): Set<number> {
  const own = owner.map((o) => (typeof o === "number" ? CLAN_KEYS[o] : o)) as ClanKey[];
  const out = new Set<number>();
  for (const a of CLAN_KEYS) for (const t of targetsOf({ owner: own }, a)) { const b = own[t]; if (b && b !== a) out.add(pairOf(a, b)); }
  return out;
}

/** Last war tick each pair shared a border (-Infinity: never seen); the pairs at war now. Undefined until set: no wars. */
let LAST: number[] | undefined;
let WARS = new Set<number>();

/**
 * The war's holders at war tick `tick`: pairs that border now are at war, and stay so FEUD.peaceTicks ticks after.
 * `last` (the server's saved warRelations()) restores the memory after a restart. Same pattern as holdWalls.ts setHoldOwners.
 */
export function setWarRelations(owner: readonly (ClanKey | number | null | undefined)[], tick: number, last?: readonly unknown[]) {
  if (!LAST || last) LAST = Array.from({ length: PAIRS }, (_, p) => (typeof last?.[p] === "number" && Number.isFinite(last[p] as number) ? (last[p] as number) : -Infinity));
  for (const p of borderPairs(owner)) LAST[p] = Math.max(LAST[p], tick);
  WARS = new Set(LAST.flatMap((t, p) => (tick - t <= FEUD.peaceTicks ? [p] : [])));
}
/** The client's copy: exactly the pairs the server says are at war (WarView.wars). */
export function setWarPairs(pairs: readonly unknown[]) {
  WARS = new Set(pairs.filter((p): p is number => Number.isInteger(p) && (p as number) >= 0 && (p as number) < PAIRS));
  LAST ??= Array(PAIRS).fill(-Infinity);
}
/** The memory to save with the war (last bordering tick per pair; null for never). */
export const warRelations = (): (number | null)[] => (LAST ?? Array(PAIRS).fill(-Infinity)).map((t) => (Number.isFinite(t) ? t : null));
/** The pairs at war now, ascending (WarView.wars). */
export const warPairs = (): number[] => [...WARS].sort((a, b) => a - b);
/** Tests: forget everything (no clan at war). */
export function _resetWarRelations() { LAST = undefined; WARS = new Set(); }

/** Are clans a and b at war? */
export const atWar = (a: ClanKey, b: ClanKey): boolean => WARS.has(pairOf(a, b));

// ---- a hero's feuds ------------------------------------------------------------------------------------------------

/** Kill points with clan k after decay at `now` (no mutation). */
export function ptsOf(f: FeudState | undefined, k: ClanKey, now: number): number {
  const e = f?.[k];
  if (!e?.pts) return 0;
  const steps = Math.max(0, Math.floor((now - (e.at ?? now)) / FEUD.decayMs));
  return Math.max(0, e.pts - steps);
}
/** 0 none, 1 Wanted, 2 Hunted, 3 Marked. */
export const tierOf = (pts: number) => FEUD.tiers.filter((t) => pts >= t).length;
export const wantedTier = (f: FeudState | undefined, k: ClanKey, now: number) => tierOf(ptsOf(f, k, now));
/** Does clan k fight this hero on its own account (a grudge running, or Wanted, which implies one)? */
export function grudgeActive(f: FeudState | undefined, k: ClanKey, now: number): boolean {
  const e = f?.[k];
  return !!e && ((e.until ?? 0) > now || wantedTier(f, k, now) >= 1);
}
/** The clans that fight this hero on their own account now. */
export const grudgesOf = (f: FeudState | undefined, now: number): ClanKey[] => CLAN_KEYS.filter((k) => grudgeActive(f, k, now));

/** A grudge with clan k until at least `until` (provocation, a blow, a kill). */
export function addGrudge(f: FeudState, k: ClanKey, until: number) {
  const e = (f[k] ??= {});
  e.until = Math.max(e.until ?? 0, until);
}

/** Points kept on a 1/300 grid, so thirds (FEUD.warKillWeight) add up to whole tiers exactly, in the save and on the client too. */
export const snapPts = (x: number) => Math.round(x * 300) / 300;

/** Points a kill of clan `victim`'s people (a trooper part or a sworn hero) is worth to a hero sworn to `killer` (or unsworn). */
export function killPoints(part: TroopPart | "hero", killer: ClanKey | undefined, victim: ClanKey): number {
  const n = FEUD.pts[part] ?? 1;
  return killer && killer !== victim && atWar(killer, victim) ? n * FEUD.warKillWeight : n;
}

/**
 * A kill of clan k's people worth `n` points at `now` (decay up to now first). Also a grudge. Returns the tier before
 * and after, so the caller can announce a rise.
 */
export function addKill(f: FeudState, k: ClanKey, n: number, now: number): { was: number; tier: number } {
  decayFeud(f, now);
  const e = (f[k] ??= {}), was = tierOf(e.pts ?? 0);
  e.pts = Math.min(FEUD.maxPts, snapPts((e.pts ?? 0) + Math.max(0, n)));
  e.at = now;
  addGrudge(f, k, now + FEUD.grudgeMs);
  return { was, tier: tierOf(e.pts) };
}

/**
 * Forgives a point per FEUD.decayMs since each clan's `at`, drops spent grudges and empty entries (a `paid` day other
 * than today goes too). Returns the clans whose tier changed.
 */
export function decayFeud(f: FeudState, now: number): ClanKey[] {
  const changed: ClanKey[] = [];
  for (const k of CLAN_KEYS) {
    const e = f[k];
    if (!e) continue;
    if (e.pts) {
      const was = tierOf(e.pts), steps = Math.max(0, Math.floor((now - (e.at ?? now)) / FEUD.decayMs));
      if (steps > 0) { e.pts = Math.max(0, e.pts - steps); e.at = (e.at ?? now) + steps * FEUD.decayMs; }
      if (tierOf(e.pts) !== was) changed.push(k);
    }
    if (!e.pts) { delete e.pts; delete e.at; }
    if ((e.until ?? 0) <= now) delete e.until;
    if (e.paid !== undefined && e.paid !== utcDay(now)) delete e.paid;
    if (e.pts === undefined && e.until === undefined && e.paid === undefined) delete f[k];
  }
  return changed;
}

/** Death at clan k's hands settles the account: points and grudge are gone (the bounty day stays). */
export function settleFeud(f: FeudState, k: ClanKey) {
  const e = f[k];
  if (!e) return;
  delete e.pts; delete e.at; delete e.until;
  if (e.paid === undefined) delete f[k];
}

const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
/**
 * A saved feud made safe: unknown clans and junk dropped, numbers clamped, decay applied (at FEUD.offlineDecay when
 * `offline`: a save being loaded), expired entries gone. Old saves (no feud) give {}.
 */
export function cleanFeud(raw: unknown, now: number, offline = false): FeudState {
  const out: FeudState = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const k of CLAN_KEYS) {
    const e = (raw as Record<string, unknown>)[k];
    if (!e || typeof e !== "object" || Array.isArray(e)) continue;
    const r = e as Record<string, unknown>, c: FeudEntry = {};
    const until = num(r.until, 0, now + FEUD.grudgeMs), pts = num(r.pts, 0, FEUD.maxPts), at = num(r.at, 0, now), paid = num(r.paid, 0, utcDay(now));
    if (until !== undefined && until > now) c.until = until;
    if (pts) {
      c.pts = snapPts(pts); c.at = at ?? now;
      // a save loaded after time away: that time decays at FEUD.offlineDecay (mapped back onto the online clock)
      if (offline) c.at = now - (now - c.at) * FEUD.offlineDecay;
    }
    if (paid !== undefined && Number.isInteger(paid)) c.paid = paid;
    if (c.until !== undefined || c.pts !== undefined || c.paid !== undefined) out[k] = c;
  }
  decayFeud(out, now);
  return out;
}

/** What the hero's own client is told ("feud" message): per clan, ms of grudge left, points, ms to the next decay. */
export interface FeudView { c: Partial<Record<ClanKey, { g: number; p: number; d: number }>>; err?: string }
export function feudView(f: FeudState, now: number): FeudView {
  const c: FeudView["c"] = {};
  for (const k of CLAN_KEYS) {
    const e = f[k], p = ptsOf(f, k, now), g = Math.max(0, (e?.until ?? 0) - now);
    if (!e || (!p && !g)) continue;
    c[k] = { g, p, d: p ? Math.max(0, FEUD.decayMs - ((now - (e.at ?? now)) % FEUD.decayMs)) : 0 };
  }
  return { c };
}
/** The client's FeudState rebuilt from a FeudView received at local time `now`. */
export function feudFromView(v: unknown, now: number): FeudState {
  const out: FeudState = {}, c = v && typeof v === "object" ? (v as { c?: unknown }).c : undefined;
  if (!c || typeof c !== "object") return out;
  for (const k of CLAN_KEYS) {
    const e = (c as Record<string, unknown>)[k] as { g?: unknown; p?: unknown; d?: unknown } | undefined;
    if (!e || typeof e !== "object") continue;
    const g = num(e.g, 0, FEUD.grudgeMs) ?? 0, p = snapPts(num(e.p, 0, FEUD.maxPts) ?? 0), d = num(e.d, 0, FEUD.decayMs) ?? 0;
    const x: FeudEntry = {};
    if (g > 0) x.until = now + g;
    if (p > 0) { x.pts = p; x.at = now + d - FEUD.decayMs; }
    if (x.until || x.pts) out[k] = x;
  }
  return out;
}

/** The marks other heroes see: session id -> [clan, tier] for every clan the hero is Wanted (tier 1+) by. */
export type WantedMarks = [ClanKey, number][];
export interface WantedMsg { full?: boolean; w: Record<string, WantedMarks>; gone?: string[] }
export function marksOf(f: FeudState | undefined, now: number): WantedMarks {
  const out: WantedMarks = [];
  for (const k of CLAN_KEYS) { const t = wantedTier(f, k, now); if (t) out.push([k, t]); }
  return out;
}
