/**
 * The account save's version contract (roadmap M5 "Ages": two builds play from one account table side by side), the
 * war's rules (shared/war/api.ts) for each account row. A build writes accounts as version ACCOUNT_API (field `av`) and
 * may write any account up to it; a build whose saves older code would misread or damage bumps ACCOUNT_API (and writes
 * ACCOUNT_MIN_READER, the oldest build that may still *show* them). An older build never writes a newer account: it
 * refuses its login and edits (server/accounts.ts). Only new top-level optional fields need no bump (older builds keep
 * the fields they do not know: server/accounts.ts saveHero). Bump with any save-version bump (xpv, SUMMONER_TREE, song
 * tree, a quest *Ver), new item/gear/rune/skill ids, a level-cap raise, or new sub-fields inside existing save objects:
 * an older build's restore rewrites those (drops unknown ids, caps levels, refunds trees) and would save the damage.
 */
import { warAccess } from "./war/api";

/**
 * 2: settlement network step 4, PR 1 (the moors' and the badlands' village stones in `portals`); 3: step 4, PR 2 (the
 * sinkholes' and the Sunscar's: PR 1's build, already released, would drop them with cleanPortals).
 */
export const ACCOUNT_API = 3;
/** Written as `minReader` with every account this build saves: the oldest ACCOUNT_API that may show (not write) it. */
export const ACCOUNT_MIN_READER = 1;

/** What a build may do with an account: "write" it (its version or older), only "read" (show) it, or "hide" it. */
export type AccountAccess = "write" | "read" | "hide";

/**
 * Pure: how a build of version `api` may use the raw account `raw`. A missing `av` is version 1 (every account before
 * the Ages); an `av` that is there but no version at all is not ours to read or write ("hide").
 */
export function accountAccess(raw: unknown, api = ACCOUNT_API): AccountAccess {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "hide";
  const r = raw as { av?: unknown; minReader?: unknown };
  const a = warAccess({ v: r.av ?? 1, minReader: r.minReader }, api);
  return a === "corrupt" ? "hide" : a;
}
