/**
 * War writs (roadmap M2): clan work on the bounty boards, apart from the hunts (a hero holds one bounty and one writ).
 * Five kinds: `rout` the soldiers of a rival land the clan can attack, `hold` a standard on a front for full minutes,
 * `clear` the wild monsters out of the clan's own land, `escort` one of the clan's caravans to its end, `raid` a rival
 * clan's supply cart on a road that touches land the clan can push into (shared/war/caravans.ts). Offers come from the war state, so they follow the front:
 * sieges the clan is in first, then the lands under the most pressure. Writs pay gold, renown and valor, never XP.
 * The server (server/warWrits.ts) counts progress and pays; this module only decides what is legal and what it is worth.
 */
import { CARAVAN, caravanLines, caravanRoute, type CaravanLine } from "./caravans";
import { CLAN_KEYS, type ClanKey } from "./clans";
import { patrolOf } from "./patrols";
import { bordersOf, landOf, rallyClan, targetsOf, type WarState } from "./rules";
import { STANDARD, STANDARDS, isClan } from "./standards";
import { TERRITORIES } from "./territories";
import { WAR_TROOPS } from "./troops";

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
  /** Deliveries of the named caravan line, as a hero escort, for an escort writ (server/warCaravans.ts arrive). */
  escortN: 1,
  /** Carts of the named rival line felled (the killing blow) for a raid writ (server/warCaravans.ts killed). */
  raidN: 1,
  /** Gold = (12 + land level x 6) x goldMult (the bounty formula, with the land's level). */
  goldMult: 1,
  renown: 15,
  /** Valor added to the writ's land for the hero's clan at completion (WAR.valorPerAdd caps one add at 10). */
  valor: 8,
  /** Underdog bonus on gold and renown: x(1 + rally) for a clan with no land, shrinking to x1 at a fair share. */
  rally: 0.5,
  /** On top of that, writs of the clan the war rallies for (rules.ts rallyClan, the weakest) pay this many times more. */
  rallyClan: 1.25,
  /** Offers by level: a land whose levels[0] <= L + above and levels[1] >= L - below. */
  above: 3, below: 5,
};

export type WritKind = "rout" | "hold" | "clear" | "escort" | "raid";
export const WRIT_KINDS: WritKind[] = ["rout", "hold", "clear", "escort", "raid"];
/** The kinds tied to one caravan line (they carry `road`). */
export const isRoadKind = (k: WritKind) => k === "escort" || k === "raid";

/** The caravan line of an escort or raid writ: from land a to land b (ids and names, checked on load like `land`). */
export interface WritRoad { a: number; b: number; from: string; to: string }

export interface Writ {
  kind: WritKind;
  /**
   * Territory id, and its name (a save from a map whose territory ids moved is dropped by cleanWrit). For an escort,
   * the line's destination; for a raid, the end of the line the clan can push into (its valor goes there).
   */
  t: number; land: string;
  goal: number;
  /** The hero's clan when taken (a new oath withdraws the writ). */
  clan: ClanKey;
  /** Who held the land when taken (a flip withdraws the writ). For escort and raid: the caravan line's clan. */
  holder: ClanKey;
  /** Lowest monster level that counts for a clear (0 for the others). */
  minLevel: number;
  /** Shown on the board; the pay is worked out again at completion (the rally may have changed). */
  gold: number; renown: number;
  /** Escort and raid only: the caravan line named. */
  road?: WritRoad;
}
export interface WritState extends Writ { n: number }

/** UTC day number (the daily limit). */
export const writDay = (now: number) => Math.floor(now / 86_400_000);

/** The land's level for pay: the middle of its band. */
export const landLevel = (t: number) => { const l = TERRITORIES[t]?.levels ?? [1, 1]; return Math.round((l[0] + l[1]) / 2); };

/**
 * Gold and renown multiplier for clan `k`: up to 1 + WRIT.rally when it holds less than a fair share, and WRIT.rallyClan
 * times that while the war rallies for `k` (the weakest clan; the Rally on valor and renown is in rules.ts).
 */
export function writRally(s: Pick<WarState, "owner">, k: ClanKey): number {
  const fair = s.owner.length / CLAN_KEYS.length;
  return (1 + WRIT.rally * Math.max(0, 1 - landOf(s as WarState, k) / fair)) * (rallyClan(s) === k ? WRIT.rallyClan : 1);
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
  if (kind === "clear") return TERRITORIES.filter((t) => s.owner[t.id] === k).map((t) => t.id);
  return [...new Set(writLines(s, k, kind).map((c) => c.t))].sort((a, b) => a - b);
}

/**
 * Caravan lines clan `k` may get an escort or raid writ for, each with the land the writ is in (`t`). Escort: the
 * clan's own lines, t = the destination. Raid: another clan's lines with an end the clan holds or can target (the
 * raid valor's "legal" rule in server/warCaravans.ts, on targetsOf), t = that end (the destination first). Roads are
 * not checked here (building one is slow): writOffers skips a line without one when it picks.
 */
export function writLines(s: WarState, k: ClanKey, kind: WritKind): { t: number; line: CaravanLine }[] {
  if (!isRoadKind(kind)) return [];
  const lines = caravanLines(s.owner);
  if (kind === "escort") return lines.filter((l) => l.clan === k).map((line) => ({ t: line.b, line }));
  const tg = new Set(targetsOf(s, k)), legal = (t: number) => s.owner[t] === k || tg.has(t), out: { t: number; line: CaravanLine }[] = [];
  for (const line of lines) {
    if (line.clan === k) continue;
    for (const t of [line.b, line.a]) if (legal(t)) out.push({ t, line });
  }
  return out;
}

/** Does this writ name this caravan line (both ends and its clan)? */
export const writNamesLine = (w: Writ, l: CaravanLine) => !!w.road && w.road.a === l.a && w.road.b === l.b && w.holder === l.clan;

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
  // each kind's candidates: a land, and for escort / raid the caravan line too
  type Cand = { t: number; line?: CaravanLine };
  const carts = CARAVAN.live && WAR_TROOPS.live; // no carts on the roads: no escort or raid writs
  const pool = Object.fromEntries(WRIT_KINDS.map((k) => [k, (isRoadKind(k) ? (carts ? writLines(s, clan, k) : []) : writLands(s, clan, k).map((t): Cand => ({ t })))
    .filter((c) => fits(c.t)).sort((a, b) => rank(b.t) - rank(a.t) || a.t - b.t || (a.line ? a.line.a - b.line!.a || a.line.b - b.line!.b : 0))])) as Record<WritKind, Cand[]>;
  const start = Math.floor(r() * WRIT_KINDS.length), order = WRIT_KINDS.map((_, i) => WRIT_KINDS[(start + i) % WRIT_KINDS.length]);
  const n = order.length, used = new Set<number>(), lines = new Set<string>(), out: Writ[] = [];
  const hasRoad = (c: Cand) => !c.line || !!caravanRoute(c.line.a, c.line.b); // a line with no road never runs a cart
  for (let i = 0; i < WRIT.offers; i++) {
    for (const kind of [...order.slice(i % n), ...order.slice(0, i % n)]) {
      // the two best open candidates (roads built only for these, lazily)
      const c: Cand[] = [];
      for (const x of pool[kind]) {
        if (used.has(x.t) || (x.line && lines.has(`${x.line.a}-${x.line.b}`)) || !hasRoad(x)) continue;
        c.push(x);
        if (c.length === 2) break;
      }
      if (!c.length) continue;
      // a siege is always taken first; otherwise one of the two hardest-pressed lands, by the seed
      const pick = sieged(c[0].t) ? c[0] : c[Math.floor(r() * c.length)], t = pick.t;
      used.add(t);
      if (pick.line) lines.add(`${pick.line.a}-${pick.line.b}`);
      const goal = kind === "rout" ? WRIT.routMin + Math.floor(r() * (WRIT.routMax - WRIT.routMin + 1)) : kind === "hold" ? WRIT.holdMin
        : kind === "clear" ? WRIT.clearN : kind === "escort" ? WRIT.escortN : WRIT.raidN;
      const pay = writPay(s, clan, t);
      const w: Writ = { kind, t, land: TERRITORIES[t].name, goal, clan, holder: pick.line ? pick.line.clan : s.owner[t], minLevel: kind === "clear" ? TERRITORIES[t].levels[0] : 0, gold: pay.gold, renown: pay.renown };
      if (pick.line) w.road = { a: pick.line.a, b: pick.line.b, from: TERRITORIES[pick.line.a].name, to: TERRITORIES[pick.line.b].name };
      out.push(w);
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
  let road: WritRoad | undefined;
  if (isRoadKind(w.kind as WritKind)) { // the line must still read the same: both ends' ids and names, t one of them, one land
    const r = (w.road ?? {}) as Partial<WritRoad>, a = int(r.a), b = int(r.b), A = TERRITORIES[a], B = TERRITORIES[b];
    if (!A || !B || a === b || A.name !== r.from || B.name !== r.to || (t !== a && t !== b) || A.region !== B.region) return undefined;
    road = { a, b, from: A.name, to: B.name };
  }
  const out: WritState = { kind: w.kind as WritKind, t, land: T.name, goal, clan: w.clan, holder: w.holder, minLevel: Math.max(0, int(w.minLevel)),
    gold: Math.max(0, int(w.gold)), renown: Math.max(0, int(w.renown)), n: Math.min(goal - 1, Math.max(0, int(w.n))) };
  if (road) out.road = road;
  return out;
}

/** Plain name of the soldiers of `k` in a tracker line. */
const SOLDIERS: Record<ClanKey, string> = { wardens: "Warden", redfang: "Redfang", host: "Host", hidekin: "Hide-Kin", veiled: "Veiled" };

/** The target, as "a/b" progress or the goal alone. */
function writText(w: Writ, count: string): string {
  switch (w.kind) {
    case "rout": return `Rout ${count} ${SOLDIERS[w.holder] ?? ""} soldiers`;
    case "hold": return `Hold a standard ${count} minutes`;
    case "clear": return `Clear ${count} wild monsters`;
    case "escort": return w.goal > 1 ? `Escort ${count} supply carts` : `Escort a supply cart${count.includes("/") ? ` ${count}` : ""}`;
    default: return w.goal > 1 ? `Raid ${count} ${SOLDIERS[w.holder] ?? ""} supply carts` : `Raid a ${SOLDIERS[w.holder] ?? ""} supply cart${count.includes("/") ? ` ${count}` : ""}`;
  }
}
/** "Rout 7 Redfang soldiers", "Hold a standard 5 minutes", "Raid a Redfang supply cart" (where goes on its own line). */
export const writTitle = (w: Writ) => writText(w, `${w.goal}`);
/** "Rout 3/7 Redfang soldiers", "Escort a supply cart 0/1" (the tracker). */
export const writProgress = (w: WritState) => writText(w, `${w.n}/${w.goal}`);
/** Where the writ is: the land, or for escort and raid the road "A to B". */
export const writWhere = (w: Writ) => (w.road ? `${w.road.from} to ${w.road.to}` : w.land);
