import { cleanFilter, DEFAULT_FILTER, LootFilter } from "../../shared/heroSheet";

/**
 * The player's loot filter (Inventory tab): which gear the hero picks up when walking over it. Kept in this browser
 * and sent to the server on join and on every change (the server skips filtered gear in pickUp; gold, potions and
 * quest items are always picked up). Filtered drops on the ground are drawn faded.
 */
const KEY = "lootFilter";
let filter: LootFilter = load();
const listeners = new Map<string, () => void>();

function load(): LootFilter {
  try { const raw = localStorage.getItem(KEY); return raw ? cleanFilter(JSON.parse(raw)) : { ...DEFAULT_FILTER }; } catch { return { ...DEFAULT_FILTER }; }
}

export const lootFilter = () => filter;
export function setLootFilter(f: LootFilter) {
  filter = cleanFilter(f);
  try { localStorage.setItem(KEY, JSON.stringify(filter)); } catch { /* private window: this session only */ }
  for (const fn of listeners.values()) { try { fn(); } catch { /* a left room */ } }
}
/** One listener per `key` (a new game scene replaces the old one's). */
export const onLootFilter = (key: string, fn: () => void) => { listeners.set(key, fn); };

/** Bag display preferences (sort, show useless marks), per browser. */
export function bagPref(name: string): boolean {
  try { return localStorage.getItem(`bag.${name}`) === "1"; } catch { return false; }
}
export function setBagPref(name: string, on: boolean) {
  try { localStorage.setItem(`bag.${name}`, on ? "1" : "0"); } catch { /* ignore */ }
}
