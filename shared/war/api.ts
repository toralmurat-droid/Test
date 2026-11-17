/**
 * The war save's version contract (roadmap M5 "Ages": two builds of the game read one war save side by side).
 * A build writes saves of version WAR_API and reads any save up to it. A newer build that changes the save in a way
 * older code would misread bumps WAR_API; when its saves still make sense to older code *for showing*, it writes
 * `minReader` (the oldest WAR_API that may show them). An older build never writes over a newer save: it shows it
 * read-only when `minReader` allows, else hides the war (server/war.ts).
 */
export const WAR_API = 1;

/** The part of a war save every version keeps: its version and the oldest reader it allows (missing: `v` itself). */
export interface WarSaveHead { v: number; minReader?: number }

/**
 * What this build may do with a saved war: "write" it (its version or older), only "read" (show) a newer one that
 * allows it, "hide" a newer one that does not, or treat it as "corrupt" (no usable version at all).
 */
export type WarAccess = "write" | "read" | "hide" | "corrupt";

const ver = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x >= 1 ? x : undefined);

/** Pure: how a build of version `api` may use the raw save `raw` (checks only the head, not the war inside). */
export function warAccess(raw: unknown, api = WAR_API): WarAccess {
  const v = raw && typeof raw === "object" ? ver((raw as Partial<WarSaveHead>).v) : undefined;
  if (v === undefined) return "corrupt";
  if (v <= api) return "write";
  const min = ver((raw as Partial<WarSaveHead>).minReader) ?? v; // (a newer save that names no reader: only its own version reads it)
  return min <= api ? "read" : "hide";
}

/** May a build of version `api` show this save (its own version or older, or a newer one that allows it)? */
export const readable = (raw: unknown, api = WAR_API): boolean => { const a = warAccess(raw, api); return a === "write" || a === "read"; };
