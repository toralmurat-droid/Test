/** The hidekin' council plug-in (Living Code). Starts from the doctrine's own answer and adjusts it in character. */
import { CLAN_PLUGIN_API, kit, type ClanPlugin, type CouncilBriefing, type CouncilOrders } from "../api";

/** A target held by the clan we counter is worth this share of the best doctrine score or more: dig there first. */
const PREY_SHARE = 0.8;

/*
 * The Hide-Mother speaks, 2026-11-19, version 2:
 * The Wardens build their walls high and forget the ground beneath them. When their land is nearly as good a dig as
 * the best one, my children go under the Wardens first. Walls do not stop teeth that come from below.
 */
function council(b: CouncilBriefing): CouncilOrders {
  const o = kit.scriptedCouncil(b);
  if (!o.targets.length || !b.targets.length) return o;
  const best = Math.max(...b.targets.map((t) => t.doctrineScore));
  if (!(best > 0)) return o;
  // the clan we counter, close enough to the doctrine's best: its best land goes first
  const prey = b.targets
    .filter((t) => t.owner === b.counters && t.doctrineScore >= best * PREY_SHARE)
    .sort((x, y) => y.doctrineScore - x.doctrineScore || x.id - y.id)[0];
  if (!prey || o.targets[0] === prey.id) return o;
  const targets = [prey.id, ...o.targets.filter((t) => t !== prey.id)].slice(0, kit.limits.maxTargets);
  const proclamation = `Dig under ${prey.name}, my children. Their walls do not reach below.`.slice(0, kit.limits.proclamationMax);
  const rationale = `Tunnel: ${prey.name} is held by our prey (${b.counters}, Control ${prey.control}) and digs nearly as well as the best; go under them first.`.slice(0, kit.limits.rationaleMax);
  return { ...o, targets, stance: "attack", proclamation, rationale };
}

export const plugin: ClanPlugin = {
  api: CLAN_PLUGIN_API,
  clan: "hidekin",
  version: "2",
  council,
};
