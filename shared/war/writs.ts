/**
 * War writs (roadmap M2): clan work on the bounty boards, apart from the hunts (a hero holds one bounty and one writ).
 * Three kinds: `rout` the soldiers of a rival land the clan can attack, `hold` a standard on a front for full minutes,
 * `clear` the wild monsters out of the clan's own land. Offers come from the war state, so they follow the front:
 * sieges the clan is in first, then the lands under the most pressure. Writs pay gold, renown and valor, never XP.
 * The server (server/warWrits.ts) counts progress and pays; this module only decides what is legal and what it is worth.
 */
import { CLAN_KEYS, type ClanKey } from "./clans";
import { patrolOf } from "./patrols";
import { bordersOf, landOf, targetsOf, type WarState } from "./rules";
import { STANDARD, STANDARDS, isClan } from "./standards";
import { TERRITORIES } from "./territories";

export const WRIT = {
  /** Offers on a board at most. */
  offers: 3,
  /** Writs a hero may finish per UTC day (writDay). */
  perDay: 3,
  /** Rival soldiers to kill for a rout: routMin..routMax. */
  routMin: 6, routMax: 8,
  /** Full minutes at a standard for a hold. */
  holdMin: 5,
  /** Wild monsters (of at least the land's lowest level) to kill for a clear. */
  clearN: 10,
  /** Gold = (12 + land level x 6) x goldMult (the bounty formula, with the land's level). */
  goldMult: 1,
  renown: 15,
  /** Valor added to the writ's land for the hero's clan at completion (WAR.valorPerAdd caps one add at 10). */
  valor: 8,
  /** Underdog bonus on gold and renown: x(1 + rally) for a clan with no land, shrinking to x1 at a fair share. */
  rally: 0.5,
  /** Offers by level: a land whose levels[0] <= L + above and levels[1] >= L - below. */
  above: 3, below: 5,
};

export type WritKind = "rout" | "hold" | "clear";
export const WRIT_KINDS: WritKind[] = ["rout", "hold", "clear"];

export interface Writ {
  kind: WritKind;
  /** Territory id, and its name (a save from a map whose territory ids moved is dropped by cleanWrit). */
  t: number; land: string;
  goal: number;
  /** The hero's clan when taken (a new oath withdraws the writ). */
  clan: ClanKey;
  /** Who held the land when taken (a flip withdraws the writ). */
  holder: ClanKey;
  /** Lowest monster level that counts for a clear (0 for the others). */
  minLevel: number;
  /** Shown on the board; the pay is worked out again at completion (the rally may have changed). */
  gold: number; renown: number;
}
export interface WritState extends Writ { n: number }

/** UTC day number (the daily limit). */
export const writDay = (now: number) => Math.floor(now / 86_400_000);

/** The land's level for pay: the middle of its band. */
export const landLevel = (t: number) => { const l = TERRITORIES[t]?.levels ?? [1, 1]; return Math.round((l[0] + l[1]) / 2); };

/** Gold and renown multiplier for clan `k`: up to 1 + WRIT.rally when it holds less than a fair share. */
export function writRally(s: Pick<WarState, "owner">, k: ClanKey): number {
  const fair = s.owner.length / CLAN_KEYS.length;
  return 1 + WRIT.rally * Math.max(0, 1 - landOf(s as WarState, k) / fair);
}

/** What a writ in land `t` pays clan `k` now. */
export function writPay(s: Pick<WarState, "owner">, k: ClanKey, t: number): { gold: number; renown: number; valor: number } {
  const r = writRally(s, k);
  return { gold: Math.round((12 + landLevel(t) * 6) * WRIT.goldMult * r), renown: Math.round(WRIT.renown * r), valor: WRIT.valor };
}

/** Lands clan `k` may get a writ of this kind for (any act, any level: writOffers filters those). */
export function writLands(s: WarState, k: ClanKey, kind: WritKind): number[] {
  if (kind === "rout") return targetsOf(s, k).filter((t) => s.owner[t] !== k && !!patrolOf(t)); // rival soldiers march there
  if (kind === "hold") {
    const ts = new Set([...bordersOf(s, k), ...targetsOf(s, k)]);
    return [...ts].filter((t) => STANDARDS.some((st) => st.t === t)).sort((a, b) => a - b);
  }
  return TERRITORIES.filter((t) => s.owner[t.id] === k).map((t) => t.id);
}

/** Small seeded random (the same seed always gives the same offers). */
function rng(seed: number) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * The board's writs for a hero sworn to `clan` at `level`, on a board in `act`. `seed` = war tick + writs finished
 * today, so the offers change with the war and after each finished writ, but dropping one does not reroll them.
 * Lands in a siege the clan is part of come first, then the ones under the most pressure; one land per offer.
 */
export function writOffers(s: WarState, clan: ClanKey, level: number, act: number, seed: number): Writ[] {
  if (!isClan(clan) || level < STANDARD.minLevel) return [];
  const r = rng(seed);
  const fits = (t: number) => { const T = TERRITORIES[t]; return !!T && T.act === act && T.levels[0] <= level + WRIT.above && T.levels[1] >= level - WRIT.below; };
  const sieged = (t: number) => { const sg = s.siege[t]; return !!sg && (sg.by === clan || s.owner[t] === clan); };
  const rank = (t: number) => (sieged(t) ? 1e9 : 0) + (s.pressure[t] ?? 0);
  const pool = Object.fromEntries(WRIT_KINDS.map((k) => [k, writLands(s, clan, k).filter(fits).sort((a, b) => rank(b) - rank(a) || a - b)])) as Record<WritKind, number[]>;
  const start = Math.floor(r() * WRIT_KINDS.length), order = WRIT_KINDS.map((_, i) => WRIT_KINDS[(start + i) % WRIT_KINDS.length]);
  const used = new Set<number>(), out: Writ[] = [];
  for (let i = 0; i < WRIT.offers; i++) {
    for (const kind of [...order.slice(i % 3), ...order.slice(0, i % 3)]) {
      const c = pool[kind].filter((t) => !used.has(t));
      if (!c.length) continue;
      // a siege is always taken first; otherwise one of the two hardest-pressed lands, by the seed
      const t = sieged(c[0]) ? c[0] : c[Math.floor(r() * Math.min(2, c.length))];
      used.add(t);
      const goal = kind === "rout" ? WRIT.routMin + Math.floor(r() * (WRIT.routMax - WRIT.routMin + 1)) : kind === "hold" ? WRIT.holdMin : WRIT.clearN;
      const pay = writPay(s, clan, t);
      out.push({ kind, t, land: TERRITORIES[t].name, goal, clan, holder: s.owner[t], minLevel: kind === "clear" ? TERRITORIES[t].levels[0] : 0, gold: pay.gold, renown: pay.renown });
      break;
    }
  }
  return out.sort((a, b) => rank(b.t) - rank(a.t) || a.t - b.t);
}

/** A saved writ, checked (saves are JSON on disk): junk, unknown kinds, a moved territory or another clan's writ load as none. */
export function cleanWrit(v: unknown, clan?: ClanKey): WritState | undefined {
  const w = v as Partial<WritState> | undefined;
  if (!w || typeof w !== "object" || !WRIT_KINDS.includes(w.kind as WritKind)) return undefined;
  const int = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : -1);
  const t = int(w.t), T = TERRITORIES[t];
  if (!T || T.name !== w.land || !isClan(w.clan) || !isClan(w.holder) || (clan !== undefined && w.clan !== clan)) return undefined;
  const goal = int(w.goal);
  if (goal < 1 || goal > 100) return undefined;
  return { kind: w.kind as WritKind, t, land: T.name, goal, clan: w.clan, holder: w.holder, minLevel: Math.max(0, int(w.minLevel)),
    gold: Math.max(0, int(w.gold)), renown: Math.max(0, int(w.renown)), n: Math.min(goal - 1, Math.max(0, int(w.n))) };
}

/** Plain name of the soldiers of `k` in a tracker line. */
const SOLDIERS: Record<ClanKey, string> = { wardens: "Warden", redfang: "Redfang", host: "Host", hidekin: "Hide-Kin", veiled: "Veiled" };

/** "Rout 7 Redfang soldiers", "Hold a standard 5 minutes", "Clear 10 wild monsters" (the land goes on its own line). */
export function writTitle(w: Writ): string {
  return w.kind === "rout" ? `Rout ${w.goal} ${SOLDIERS[w.holder] ?? ""} soldiers` : w.kind === "hold" ? `Hold a standard ${w.goal} minutes` : `Clear ${w.goal} wild monsters`;
}
/** "Rout 3/7 Redfang soldiers" (the tracker). */
export function writProgress(w: WritState): string {
  return w.kind === "rout" ? `Rout ${w.n}/${w.goal} ${SOLDIERS[w.holder] ?? ""} soldiers` : w.kind === "hold" ? `Hold a standard ${w.n}/${w.goal} minutes` : `Clear ${w.n}/${w.goal} wild monsters`;
}
