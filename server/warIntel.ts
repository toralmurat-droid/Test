/**
 * War intel by message (shared/war/intel.ts reads it): each clan's plan of the last war tick, server -> client
 * "warplan", only to heroes sworn to that clan, since orders are secret from the other clans. Sent on join, after every
 * war tick and after an oath. An unsworn hero gets nothing, except an empty plan right after an oath change so a
 * client never keeps a clan's plan it no longer belongs to. No client -> server message.
 */
import type { ClanKey } from "../shared/war/clans";
import type { WarPlan } from "../shared/war/intel";
import { warNow, warPlan } from "./war";

export interface PlanHero { clan?: ClanKey }
export interface PlanClient { send(type: string, msg: unknown): void }

/** An empty plan for the current war tick (no orders yet, or nothing to keep). */
const none = (): WarPlan => ({ tick: warNow()?.tick ?? 0, march: [] });

/** Sends hero `p` their clan's plan (an empty one before the first tick). `clear`: an unsworn hero gets an empty plan instead of nothing. */
export function sendPlan(client: PlanClient, p: PlanHero, clear = false) {
  if (p.clan) client.send("warplan", warPlan(p.clan) ?? none());
  else if (clear) client.send("warplan", none());
}

/** After a war tick: every sworn hero in the room gets their clan's new plan. */
export function planAll(heroes: Iterable<[string, PlanHero]>, client: (id: string) => PlanClient | undefined) {
  for (const [id, p] of heroes) { if (!p.clan) continue; const c = client(id); if (c) sendPlan(c, p); }
}
