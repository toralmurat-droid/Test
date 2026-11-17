import { forgeLookup, type Forged, type ForgedWeapon } from "../../shared/forge";
import { setForgedGear } from "../../shared/gear";

/**
 * The forgings this client has heard of (server/forge.ts packFor: "forge" on join and on every change, "forgeQ" for
 * retired ones). Weapons go into the shared gear registry so names and stats show like the server's; art comes later.
 */
const known = new Map<string, Forged>();

/** Merges forgings from the server and refreshes the gear registry. Malformed entries are skipped. */
export function takeForged(defs: unknown) {
  if (!Array.isArray(defs)) return;
  for (const d of defs) if (d && typeof d === "object" && typeof (d as Forged).id === "string") known.set((d as Forged).id, d as Forged);
  setForgedGear(forgeLookup([...known.values()].filter((d): d is ForgedWeapon => d.kind === "weapon")));
}
