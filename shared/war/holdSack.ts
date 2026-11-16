/**
 * Sacking a Hold (W2b, Murat 2026-11-15: "we should be able to engage in attacking an encampment ... of our own
 * initiative"). A hero the holder's soldiers fight (troops.ts troopStance "enemy": at war, a grudge, Wanted) walks into
 * the courtyard and raises their banner at the Hold's middle cell. It is allowed only while no holder guard and no active
 * holder-sworn hero stands within the Hold's reach and the land has no announced siege; it takes HOLD_SACK.raiseMs, a
 * holder trooper or defender in the reach pauses it, a blow on the raiser starts it over. A sack loosens the holder's
 * Control (rules.ts sackHold, shared with the war sim), pays the sacker's clan valor where the war lets it fight, drops a
 * war chest and keeps the guards down until the next war tick (server/warHolds.ts). Pure rules, spots and numbers.
 */
import { TILE } from "../constants";
import { CLAN_KEYS, type ClanKey } from "./clans";
import { fortOf, holdReachPx, holdsLive, liveTier, tierReachPx } from "./holdWalls";
import type { HoldTier } from "./holdTiers";
import { WAR } from "./rules";
import { HOLDS } from "./standards";

export const HOLD_SACK = {
  /** Master switch: off, no banner can be raised. */
  live: true,
  /** Time to raise the banner with nobody in the way (ms). */
  raiseMs: 12_000,
  /** The raiser must stand this close to the banner spot (tiles): to start, and to keep raising. */
  useTiles: 1.5,
  /** The Hold's reach: the square round its middle that any clan's fort at the Hold's tier may wall (holdWalls.ts
   * tierReachPx) plus this much (px), so the guard posts outside the walls (patrols.ts garrisonSpots) are inside it. */
  marginPx: 3 * TILE,
  /** Control the holder loses (WAR.sackControl, read by rules.ts sackHold; half for an unsworn or out-of-reach sacker). */
  control: WAR.sackControl,
  /** Valor for the sacker's clan in the land (only where the war lets it fight there: targetsOf), and renown for each
   * hero sworn to it within the reach, the raiser included. */
  sackValor: 10, sackRenown: 20,
  /** The war chest: gold = base + perLevel x the land's soldier level (like a raided caravan). */
  gold: { base: 20, perLevel: 5 },
  /** The raising state reaches the clients at most this often (ms; a start, a pause or the end go at once). */
  sendMs: 1000,
};

/** The banner spot of territory t's Hold (px): the middle cell of its fort (the same for every clan's plan and tier). */
export function bannerSpot(t: number): { x: number; y: number } | undefined {
  const f = fortOf(t, CLAN_KEYS[0]);
  if (f) return { x: (f.cx + 0.5) * TILE, y: (f.cy + 0.5) * TILE };
  const h = HOLDS.find((x) => x.t === t);
  return h && { x: h.x, y: h.y };
}

/**
 * Half-size (px) of the square round territory t's banner that counts as the Hold's reach at `tier`; without one, at the
 * Hold's live tier (holdWalls.ts setHoldOwners), or the largest any tier has while no war is known.
 */
export function sackReachPx(t: number, tier?: HoldTier): number {
  const at = tier ?? (holdsLive() ? liveTier(t) : undefined);
  return (at === undefined ? holdReachPx(t) : tierReachPx(t, at)) + HOLD_SACK.marginPx;
}
/** Is (x, y) within territory t's Hold reach (a square round its banner, like the forts and their guard ring) at `tier` (default: live)? */
export function inSackReach(t: number, x: number, y: number, tier?: HoldTier): boolean {
  const b = bannerSpot(t), r = sackReachPx(t, tier);
  return !!b && Math.abs(x - b.x) <= r && Math.abs(y - b.y) <= r;
}

/** A banner being raised: done share (0..1) and whether a defender holds it up. */
export interface SackRaise { progress: number; paused: boolean }
export type SackStep = "raise" | "paused" | "restart" | "done";

/**
 * One step of raising the banner (like siege.ts frontStep / rituals.ts pauseStep, but with no grace: the reach is small
 * and a defender is plain to see): `dtMs` of work unless `defenders` (holder troopers and active defender-sworn heroes in
 * the reach) are there; `hurt` (the raiser took a blow since the last step) starts it over from nothing.
 */
export function sackStep(r: SackRaise, dtMs: number, defenders: number, hurt: boolean): SackStep {
  r.paused = defenders > 0;
  if (hurt) { r.progress = 0; return "restart"; }
  if (r.paused) return "paused";
  r.progress = Math.min(1, r.progress + Math.max(0, Math.min(dtMs, 2000)) / HOLD_SACK.raiseMs); // (a stalled tick never jumps it)
  return r.progress >= 1 ? "done" : "raise";
}

/** Gold in a sacked Hold's war chest for a land of soldier level `level`. */
export const sackGold = (level: number) => Math.round(HOLD_SACK.gold.base + HOLD_SACK.gold.perLevel * level);

/**
 * What the clients get ("holds" message): the Holds sacked this war tick, each with the sacker's clan (a CLAN_KEYS index,
 * -1 for an unsworn hero), flying until the next war tick; and the banners being raised now (t, progress 0..100, paused 0/1).
 */
export interface HoldsMsg { tick: number; sacked: [number, number][]; raising: [number, number, number][] }
/** The client's reading of a "holds" message (junk dropped). */
export function cleanHoldsMsg(m: unknown): HoldsMsg {
  const o = m && typeof m === "object" ? (m as Partial<HoldsMsg>) : {};
  const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  return {
    tick: Number.isFinite(o.tick) ? (o.tick as number) : -1,
    sacked: Array.isArray(o.sacked) ? o.sacked.filter((x) => Array.isArray(x) && int(x[0], 0, 9999) && int(x[1], -1, CLAN_KEYS.length - 1)) : [],
    raising: Array.isArray(o.raising) ? o.raising.filter((x) => Array.isArray(x) && int(x[0], 0, 9999) && int(x[1], 0, 100) && int(x[2], 0, 1)) : [],
  };
}
/** The clan whose banner flies on a sacked Hold (undefined for an unsworn hero's plain banner). */
export const sackerOf = (by: number): ClanKey | undefined => CLAN_KEYS[by];
