/**
 * The clan plug-in interface (Living Code, roadmap M6 part 1). Each clan may own a folder shared/clans/<clan>/ whose
 * index.ts exports `plugin: ClanPlugin`; that code may import only this file (tools/clans/check.ts enforces it). The
 * server never imports a plug-in: tools/clans/build.mjs bundles it, and server/clanPlugins.ts runs the bundle in a
 * sandboxed worker (server/clanPluginWorker.ts) only when Murat has pinned its hash (CLAN_PLUGINS). Anything wrong, and
 * the doctrine leads. The client never imports any of this.
 *
 * API v1 has one point, `council`: once a war day the clan's briefing goes in, an order set comes out (validated like
 * every council's: shared/war/council.ts validateCouncil). It must be pure and synchronous: no clock, no timers, no
 * network, no other clans, no saves, no forge commissions. Per-tick behaviour must later be data, not code.
 */
import { CLAN_KEYS, type ClanKey } from "../war/clans";
import { COUNCIL, COUNCIL_STANCES, scriptedCouncil, type CouncilStance } from "../war/councilScript";
import type { CouncilBriefing, CouncilOrders } from "../war/council";

export type { ClanKey, CouncilBriefing, CouncilOrders, CouncilStance };

/** The interface version a plug-in declares (`api`); the server runs only this one. */
export const CLAN_PLUGIN_API = 1;

/**
 * Points a later API may add (herald lines, per-tick tactics, forge flavour). Reserved: a v1 plug-in that exports any
 * of them is refused (never run), so nothing slips in before the server knows how to fence it.
 */
export const RESERVED_POINTS = ["herald", "tactics", "forgeFlavour"] as const;

/** A clan's plug-in (v1): who it is for, its version (shown in the council log), and the council point. */
export interface ClanPlugin {
  api: typeof CLAN_PLUGIN_API;
  clan: ClanKey;
  /** Short version label, letters, digits, dots and dashes (at most 12 characters). */
  version: string;
  /** The day's orders for the briefing. Pure and synchronous; a throw, a hang or illegal orders mean the doctrine leads. */
  council(b: CouncilBriefing): CouncilOrders;
}

/** Deep-frozen, so a plug-in can never change what another call (or another clan) sees. */
function freeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) freeze(v); }
  return o;
}

/** What a plug-in may use besides the briefing: the scripted council (the doctrine's answer) and the council's limits. */
export const kit = freeze({
  /** The doctrine's own answer to the briefing (deterministic): the default plug-ins return exactly this. */
  scriptedCouncil: (b: CouncilBriefing): CouncilOrders => scriptedCouncil(b),
  limits: { maxTargets: COUNCIL.maxTargets, proclamationMax: COUNCIL.proclamationMax, rationaleMax: COUNCIL.rationaleMax, stances: [...COUNCIL_STANCES] },
  clans: [...CLAN_KEYS],
});

/**
 * The sandbox's limits (server/clanPlugins.ts, server/clanPluginWorker.ts, tools/clans/gate.ts). Not gameplay: a plug-in
 * that breaks one fails closed (the doctrine leads that day, logged).
 */
export const CLAN_PLUGIN = {
  /** One council call (vm timeout, ms); loading the bundle into a fresh context gets as long again. */
  callMs: 200,
  /** The worker is terminated this long after its budget (a hang the vm timeout did not catch). */
  killMarginMs: 2000,
  /** Longest answer, as JSON (characters). */
  maxOut: 4096,
  /** Failures in a row that switch a clan's plug-in off until an admin re-enables it. */
  failLimit: 3,
  /** The worker's memory and stack (MB). */
  oldMb: 32, youngMb: 8, stackMb: 1,
  /** Shortest hash pin (hex characters of the bundle's sha256) CLAN_PLUGINS accepts. */
  minPin: 16,
  /** The CI gate: briefings per clan, and its stricter per-call budget (ms). */
  gateBriefings: 200, gateMs: 20,
  /** A plug-in source file's size cap (bytes), and the longest `version` (fits the council log's provider id). */
  maxFileBytes: 20_000, versionMax: 8,
};
