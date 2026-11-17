/**
 * The forge save's version contract (roadmap M5 "Ages": two builds read one forge save, kv key "forge", side by side),
 * the same rules as the war's (shared/war/api.ts). A build writes saves of version FORGE_API and reads any save up to
 * it; a newer build that changes the save in a way older code would misread bumps FORGE_API, and writes `minReader`
 * when older code may still *show* it. An older build never writes over a newer save: it shows its forgings read-only
 * when `minReader` allows, else hides the registry (server/forge.ts).
 */
import { warAccess, type WarAccess } from "./war/api";

export const FORGE_API = 1;

/** What a build may do with a saved forge: "write", only "read" (show), "hide", or "corrupt" (not an object at all). */
export type ForgeAccess = WarAccess;

/**
 * Pure: how a build of version `api` may use the raw forge save `raw`. Unlike the war, an object with no usable `v` is
 * not corrupt: it is cleaned as version 1, as every build before the Ages did (old saves load forever).
 */
export function forgeAccess(raw: unknown, api = FORGE_API): ForgeAccess {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "corrupt";
  const a = warAccess(raw, api);
  return a === "corrupt" ? "write" : a;
}
