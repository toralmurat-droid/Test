/** The host' council plug-in (Living Code). Starts from the doctrine's own answer and changes it as the comments below say. */
import { CLAN_PLUGIN_API, kit, type ClanPlugin, type CouncilBriefing, type CouncilOrders } from "../api";

/*
 * The Pale Marshal, 2026-11-18, v2:
 * The engines already stand before a wall of ours. We do not walk away from a siege we have raised; the dead finish
 * what they begin. When the Host's own siege lies on one of our targets, that land is our first order of the day.
 */
function council(b: CouncilBriefing): CouncilOrders {
  const o = kit.scriptedCouncil(b);
  if (o.targets.length === 0) return o;
  // our own siege already running on a legal target, the one due soonest first (then the lowest id)
  let raised: { id: number; name: string; inTicks: number } | undefined;
  for (const t of b.targets) {
    if (!t.siege || t.siege.by !== b.clan || t.owner === b.clan) continue;
    if (!raised || t.siege.inTicks < raised.inTicks || (t.siege.inTicks === raised.inTicks && t.id < raised.id)) raised = { id: t.id, name: t.name, inTicks: t.siege.inTicks };
  }
  if (!raised || o.targets[0] === raised.id) return o;
  const id = raised.id;
  const targets = [id, ...o.targets.filter((x) => x !== id)].slice(0, kit.limits.maxTargets);
  const rationale = ("Siege doctrine: our engines already stand before " + raised.name + ". The Host finishes what it begins.").slice(0, kit.limits.rationaleMax);
  const proclamation = ("The dead march on " + raised.name + ". They do not tire.").slice(0, kit.limits.proclamationMax);
  return { ...o, targets, proclamation, rationale };
}

export const plugin: ClanPlugin = {
  api: CLAN_PLUGIN_API,
  clan: "host",
  version: "2",
  council,
};
