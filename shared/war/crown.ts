/**
 * The Reckoning (Crown PR4, owner's defaults of 2026-11-15): once a month the clans settle who holds the Crown Keep, the
 * one territory the armies never move (territories.ts reckoningOnly). For three hours (the first Saturday of the month,
 * 18:00-21:00 UTC, so no daylight saving to mind) every war tick scores each clan its Crown land, the Keep counting more,
 * and the valor its sworn heroes earn in the Crown is added; the top score takes the Keep, a tie leaves it with its
 * holder. The winner's sworn heroes earn a little more gold and renown until the next Reckoning, and every hero who
 * fought in the Crown in the window is paid on their next login. Pure: the server (server/warCrown.ts), the war sim
 * (tools/balance/war.ts) and the client's countdown read the same rules.
 */
import { CLAN_KEYS, type ClanKey } from "./clans";
import type { Territory } from "./territories";

export const RECKONING = {
  /** UTC day of the week (0 Sunday .. 6 Saturday): the first of these in a month is Reckoning day. */
  weekday: 6,
  /** UTC hour the window opens, and how long it lasts. */
  hour: 18,
  hours: 3,
  /** Points a war tick: per Crown territory held, for the Keep (instead of landPts). */
  landPts: 1,
  keepPts: 3,
  /**
   * Points per valor a clan's sworn heroes earn in Crown territories during the window. A hero tops out near 12 valor a
   * war tick (WAR_TROOPS.killValorPerTick), so one busy hero outweighs the whole Crown: the heroes who turn up decide the Reckoning,
   * not the armies (at 0.25 the holder kept the Keep ~98% of the time even against a busy clan).
   */
  valorPts: 1,
  /** Heralds: a warning this long before the window, the standings every `standingsMs` while it runs. */
  warnMs: 60 * 60_000,
  standingsMs: 60 * 60_000,
  /** The holder's boon until the next Reckoning, for heroes sworn to it: gold and renown they earn x (1 + this). */
  boon: { gold: 0.1, renown: 0.1 },
  /**
   * Pay for a hero who took part (sworn, at least `minValor` Crown valor in the window), on their next login within
   * `keepMs`; a hero of the winning clan gets the `win` amounts on top.
   */
  reward: { gold: 500, renown: 30, winGold: 500, winRenown: 30, minValor: 1, keepMs: 14 * 24 * 3600_000 },
  /** Most heroes one Reckoning keeps track of (a guard on the save's size). */
  heroesMax: 2000,
} as const;

export interface ReckonWindow { start: number; end: number }

/** The Reckoning of a month (UTC year, month 0-11): 18:00 UTC on its first Saturday, for RECKONING.hours. */
export function reckoningOf(year: number, month: number): ReckonWindow {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay(), day = 1 + ((RECKONING.weekday - first + 7) % 7);
  const start = Date.UTC(year, month, day, RECKONING.hour);
  return { start, end: start + RECKONING.hours * 3600_000 };
}

/** The Reckoning under way at `now`, else the next one (this month's if still to come, else next month's). */
export function reckoningAt(now: number): ReckonWindow {
  const d = new Date(now), w = reckoningOf(d.getUTCFullYear(), d.getUTCMonth());
  return now < w.end ? w : reckoningOf(d.getUTCFullYear(), d.getUTCMonth() + 1); // (Date.UTC rolls month 12 into the next year)
}
/** Is a Reckoning under way at `now`? */
export const inReckoning = (now: number) => { const w = reckoningAt(now); return now >= w.start && now < w.end; };

/** The Crown's territories (regions.ts `crown`) and the Keep among them. */
export const crownLands = (ts: readonly Territory[]) => ts.filter((t) => t.region === "crown");
export const keepOf = (ts: readonly Territory[]) => ts.find((t) => t.reckoningOnly);

/** One war tick's land points per clan: RECKONING.landPts per Crown territory held, keepPts for the Keep. */
export function landPoints(owner: readonly ClanKey[], ts: readonly Territory[]): Partial<Record<ClanKey, number>> {
  const out: Partial<Record<ClanKey, number>> = {};
  for (const t of crownLands(ts)) { const k = owner[t.id]; if (k) out[k] = (out[k] ?? 0) + (t.reckoningOnly ? RECKONING.keepPts : RECKONING.landPts); }
  return out;
}

/** A clan's tally so far: land points summed over the window's ticks, and the Crown valor its heroes earned. */
export interface ReckonTally { land: Partial<Record<ClanKey, number>>; valor: Partial<Record<ClanKey, number>> }
/** Every clan's score (land + valor x valorPts), in CLAN_KEYS order. */
export const scoresOf = (t: ReckonTally): Record<ClanKey, number> =>
  Object.fromEntries(CLAN_KEYS.map((k) => [k, (t.land[k] ?? 0) + (t.valor[k] ?? 0) * RECKONING.valorPts])) as Record<ClanKey, number>;

/**
 * Who holds the Keep after a Reckoning: the clan with the top score; on a tie for the top (or when nobody scored) the
 * holder keeps it. `kept`: the holder still holds it.
 */
export function reckonWinner(scores: Record<ClanKey, number>, holder: ClanKey): { winner: ClanKey; kept: boolean } {
  const top = Math.max(...CLAN_KEYS.map((k) => scores[k] ?? 0)), best = CLAN_KEYS.filter((k) => (scores[k] ?? 0) === top);
  const winner = top <= 0 || best.length !== 1 ? holder : best[0];
  return { winner, kept: winner === holder };
}

/** The clans by score, best first (ties: CLAN_KEYS order), for the Herald's standings. */
export const standings = (scores: Record<ClanKey, number>): ClanKey[] => [...CLAN_KEYS].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));

/**
 * The boon's multipliers for a hero sworn to `k`: x(1 + boon) while `k` is the clan a Reckoning crowned (`crowned`) and
 * still holds the Keep (`keepHolder`); 1 otherwise (and before the first Reckoning: the Keep's first holder was only
 * given it).
 */
export function crownBoon(crowned: ClanKey | undefined, keepHolder: ClanKey | undefined, k: ClanKey | undefined): { gold: number; renown: number } {
  const on = !!k && !!crowned && crowned === k && keepHolder === k;
  return { gold: on ? 1 + RECKONING.boon.gold : 1, renown: on ? 1 + RECKONING.boon.renown : 1 };
}

/** What a hero is paid for a Reckoning they took part in (`won`: sworn to the clan that holds the Keep after it). */
export const reckonReward = (won: boolean): { gold: number; renown: number } => ({
  gold: RECKONING.reward.gold + (won ? RECKONING.reward.winGold : 0), renown: RECKONING.reward.renown + (won ? RECKONING.reward.winRenown : 0),
});

/** The key a hero's Reckoning record and pay go under: account name and class (one hero per class per account). */
export const heroKey = (name: string, cls: string) => `${name}/${cls}`;

/** The view a client gets with the war snapshot ("war" message, WarView.reck). */
export interface ReckonView {
  /** The Reckoning under way, or the next one. */
  start: number; end: number;
  /** True while it runs. */
  on?: true;
  /** Scores so far (while it runs), by CLAN_KEYS index, whole numbers. */
  score?: number[];
  /** The clan a Reckoning crowned (CLAN_KEYS index) while it still holds the Keep: its banners wear the crown. */
  crowned?: number;
  /** The last Reckoning's result: when it ended, the winner (CLAN_KEYS index), whether the holder kept it, the final scores. */
  last?: { at: number; winner: number; kept: boolean; score: number[] };
}

/** "2d 5h", "3h 10m", "12m": a span for the countdowns (the war table, the notice). */
export function spanText(ms: number): string {
  const m = Math.max(0, Math.ceil(ms / 60_000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`;
}
/** The Reckoning's countdown line: "in 2d 5h" before it, "ends in 1h 20m" while it runs. */
export const reckonCountdown = (v: Pick<ReckonView, "start" | "end" | "on">, now: number): string =>
  (v.on || (now >= v.start && now < v.end) ? `ends in ${spanText(v.end - now)}` : `in ${spanText(v.start - now)}`);
