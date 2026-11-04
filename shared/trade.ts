import { TILE } from "./constants";
import { EMPTY, isSolidTile, OBJECTS, SAFE_ZONE } from "./map";
import { NPCS } from "./npcs";
import { BAG_SIZE, isGearId } from "./gear";

/**
 * Player trading and the account stash (Murat 2026-11-04, from the expert review).
 *  - Trade: two heroes close together open a trade window, each puts up bag items and gold.
 *    Any change to an offer takes back both "Ready" marks; the swap happens only when both are ready,
 *    and the server checks again that every item and coin is still there (no dupes, no bait and switch).
 *  - Stash: one chest in Oakvale, shared by every hero of an account, holds items and gold.
 *    Saved with the account in the same file write as the hero, so an item is never in both places.
 */
export const TRADE = {
  range: TILE * 5,      // px: how close two heroes must be to start a trade
  breakRange: TILE * 9, // px: walking further apart than this cancels it
  maxItems: 8,          // items per side
  askMs: 20_000,        // how long a trade request stays open
};

export const STASH_SIZE = 24;
export const STASH_RANGE = TILE * 1.2;
export const STASH_GOLD_MAX = 10_000_000;

/** Open tile (nothing solid around it, nothing tall just in front in the iso view); the square's cobbles are fine. */
function freeTile(tx: number, ty: number) {
  if (OBJECTS[ty]?.[tx] !== EMPTY) return false;
  for (let dy = -1; dy <= 3; dy++) for (let dx = -1; dx <= 3; dx++) {
    if ((dy <= 1 && dx <= 1) || dx >= 0 && dy >= 0) if (isSolidTile(tx + dx, ty + dy)) return false;
  }
  return true;
}

/** The stash chest: on the village square, near its south-west corner, clear of the traders, the fire and the spawn. */
export const STASH = (() => {
  const Z = SAFE_ZONE, mid = { x: Z.x + Z.w / 2, y: Z.y + Z.h / 2 };
  let best: { tx: number; ty: number; d: number } | undefined;
  for (let ty = Z.y + 1; ty < Z.y + Z.h - 1; ty++) for (let tx = Z.x + 1; tx < Z.x + Z.w - 1; tx++) {
    const x = (tx + 0.5) * TILE, y = (ty + 0.6) * TILE;
    if (!freeTile(tx, ty) || Math.hypot(tx - mid.x, ty - mid.y) < 4) continue;
    if (!NPCS.every((n) => Math.hypot(n.x - x, n.y - y) > TILE * 2.5)) continue;
    const d = Math.hypot(tx - (Z.x + 2), ty - (Z.y + Z.h - 3));
    if (!best || d < best.d) best = { tx, ty, d };
  }
  const s = best ?? { tx: Z.x + 2, ty: Z.y + Z.h - 3 };
  return { x: (s.tx + 0.5) * TILE, y: (s.ty + 0.6) * TILE };
})();

export interface Offer { items: string[]; gold: number }
export interface Side { bag: string[]; gold: number; offer: Offer }

/** `bag` without the items of `take` (each taken once), or null if one of them isn't there. */
export function takeItems(bag: string[], take: string[]): string[] | null {
  const left = [...bag];
  for (const id of take) {
    const i = left.indexOf(id);
    if (i < 0) return null;
    left.splice(i, 1);
  }
  return left;
}

/** Clean an offer from the client: bag indices -> item ids (each index once), whole gold within what the hero has. */
export function offerFrom(bag: string[], gold: number, items: unknown, coins: unknown): Offer {
  const idx = Array.isArray(items) ? items : [];
  const seen = new Set<number>(), out: string[] = [];
  for (const v of idx) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= bag.length || seen.has(v)) continue;
    if (!isGearId(bag[v])) continue;
    seen.add(v); out.push(bag[v]);
    if (out.length >= TRADE.maxItems) break;
  }
  const g = typeof coins === "number" && Number.isFinite(coins) ? Math.floor(coins) : 0;
  return { items: out, gold: Math.max(0, Math.min(gold, g)) };
}

/** The swap of a trade, checked against what both heroes hold right now. Returns a reason when it can't happen. */
export function settle(a: Side, b: Side): { a: { bag: string[]; gold: number }; b: { bag: string[]; gold: number } } | string {
  const aLeft = takeItems(a.bag, a.offer.items), bLeft = takeItems(b.bag, b.offer.items);
  if (!aLeft || !bLeft) return "An offered item is no longer in the bag";
  if (a.offer.gold > a.gold || b.offer.gold > b.gold || a.offer.gold < 0 || b.offer.gold < 0) return "Not enough gold any more";
  const aBag = [...aLeft, ...b.offer.items], bBag = [...bLeft, ...a.offer.items];
  if (aBag.length > BAG_SIZE || bBag.length > BAG_SIZE) return "Not enough room in a bag";
  return {
    a: { bag: aBag, gold: a.gold - a.offer.gold + b.offer.gold },
    b: { bag: bBag, gold: b.gold - b.offer.gold + a.offer.gold },
  };
}
