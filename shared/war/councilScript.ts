/**
 * The council's limits (COUNCIL) and the scripted council, apart from shared/war/council.ts (which re-exports them) so
 * that a clan plug-in's bundle (shared/clans/api.ts kit, tools/clans/build.mjs) carries only these and the Heralds'
 * lines, not the map: a sandboxed plug-in loads in a few milliseconds. Pure.
 */
import { CLAN_KEYS } from "./clans";
import { DOCTRINE } from "./doctrine";
import { FOE_NAME, leaderLine } from "./heralds";
import type { CouncilBriefing, CouncilOrders } from "./council";

/**
 * How the council wants its targets pushed: `attack` as its doctrine does; `defend` keeps more of the army home and
 * strikes only the first target; `feint` by day pushes the second target to pull defenders away, by night throws
 * everything at the first (the doctrine's ruse, doctrine.ts `clever`).
 */
export type CouncilStance = "attack" | "defend" | "feint";
export const COUNCIL_STANCES: readonly CouncilStance[] = ["attack", "defend", "feint"];

export const COUNCIL = {
  /** Most target priorities one order set may name. */
  maxTargets: 3,
  /** Longest proclamation and rationale (characters, after markup is stripped). */
  proclamationMax: 160,
  rationaleMax: 200,
  /** Share of the army a `defend` council keeps home at least; a `feint` council by day and by night. */
  defendStance: 0.85,
  feintDay: 0.9,
  feintNight: 0.2,
  /**
   * A main target pushed for DOCTRINE.stickTicks that still has at least this much Control is a stuck front: the armies
   * move on to the council's next priority (round the list), as the doctrine's leaders switch targets.
   */
  stuckControl: 80,
  /** A raiding clan (doctrine `raid`) also hits its next priority with this share, as its doctrine does. */
  secondShare: 0.5,
  /** A provider that has not answered after this long is dropped for the day (the doctrine leads). */
  timeoutMs: 20_000,
  /** Council log entries and daily digests the war save keeps; last-day events a briefing lists. */
  logMax: 300,
  digestKeep: 7,
  briefEvents: 12,
};

/**
 * The scripted council: the doctrine's answer to a briefing (its favourite legal targets with the doctrine's jitter,
 * seeded by the day, attacking; a leader's march line as the proclamation). Deterministic for a briefing.
 */
export function scriptedCouncil(b: CouncilBriefing): CouncilOrders {
  // the doctrine's jitter, seeded by the day, the clan and the land: a new pick each day, the same pick for the same briefing
  const jit = (t: number) => 1 + ((hash(b.day * 7919 + CLAN_KEYS.indexOf(b.clan) * 104729 + t * 31 + (b.seed | 0) * 15485863) % 1000) / 1000 - 0.5) * DOCTRINE.jitter;
  const targets = b.targets.map((t) => ({ t: t.id, v: t.doctrineScore * jit(t.id) })).sort((x, y) => y.v - x.v || x.t - y.t).slice(0, COUNCIL.maxTargets).map((x) => x.t);
  const first = b.targets.find((t) => t.id === targets[0]);
  if (!first) return { clan: b.clan, day: b.day, targets: [], stance: "defend", rationale: "No legal target: hold every border." };
  return {
    clan: b.clan, day: b.day, targets, stance: "attack",
    proclamation: leaderLine(b.clan, "march", first.name, first.owner, b.day).text,
    rationale: `Doctrine (${b.doctrine}): ${first.name} ranks first (held by ${FOE_NAME[first.owner]}, Control ${first.control}).`,
  };
}

/** A small integer hash (deterministic, no state). */
function hash(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}
