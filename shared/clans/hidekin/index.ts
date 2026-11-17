/** The hidekin' council plug-in (Living Code v1). The default: the doctrine's own answer, so it changes nothing until rewritten. */
import { CLAN_PLUGIN_API, kit, type ClanPlugin } from "../api";

export const plugin: ClanPlugin = {
  api: CLAN_PLUGIN_API,
  clan: "hidekin",
  version: "1",
  council: (b) => kit.scriptedCouncil(b),
};
