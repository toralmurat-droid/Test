import { DESERT_Y0, TILE } from "./constants";
import { CHAINS, chainDone, type Quester } from "./quests";
import { KEL_MARKET, D, WAYGATE_DESERT, WAYGATE_OAKVALE } from "./desert";

/**
 * Act 2 (Murat 2026-11-08): the old waygate south of Oakvale and its twin in the desert's Sunstone Circle
 * (shared/desert.ts). It wakes for a hero once the first zone's two last bosses are down: Ostrevar the Hollow King
 * (the Hollow Crown chain) and Grandam Ursk, the Hide-Mother (the Hide Rite chain, the Mawdeep's last quest).
 * Walking into an awake gate takes the hero through to the other one, like the Mawdeep's ropes.
 */
export interface Waygate { id: "oakvale" | "desert"; x: number; y: number; to: "oakvale" | "desert"; label: string }
const px = (t: { x: number; y: number }) => ({ x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE });
export const WAYGATES: Waygate[] = [
  { id: "oakvale", ...px(WAYGATE_OAKVALE), to: "desert", label: "Step through the waygate to the Sunscar" },
  { id: "desert", ...px(WAYGATE_DESERT), to: "oakvale", label: "Step through the waygate home to Oakvale" },
];
export const WAYGATE_RANGE = 0.8 * TILE;
export const waygateById = (id: string) => WAYGATES.find((g) => g.id === id);
/** Where a hero coming out of gate `g` stands: a few steps south of it, off the gate. */
export const waygateArrival = (g: Waygate) => ({ x: g.x, y: g.y + 2.4 * TILE });

/** The chains that must be finished: the Hollow Crown (Ostrevar) and the Hide Rite (the Hide-Mother). */
export const ACT2_KEYS = ["crown", "beast"] as const;
const chainIx = (id: string) => CHAINS.findIndex((c) => c.id === id);
/** True once the hero has beaten both of the first zone's last bosses (their quests handed in). */
export function act2Open(p: Quester | undefined): boolean {
  return ACT2_KEYS.every((k) => { const c = chainIx(k); return c >= 0 && chainDone(p, c); });
}
/** What is still missing, for the "the gate is cold" note. */
export function act2Missing(p: Quester | undefined): string[] {
  return ACT2_KEYS.filter((k) => { const c = chainIx(k); return c < 0 || !chainDone(p, c); }).map((k) => (k === "crown" ? "Ostrevar the Hollow King" : "the Hide-Mother of the Mawdeep"));
}

/** Which act a point (px) is in. */
export const actAt = (py: number): 1 | 2 => (py >= DESERT_Y0 * TILE ? 2 : 1);
/** Kel Ashar's market: where heroes in the desert come back after dying, and where they log in if they left from Act 2. */
export function desertSpawn(): { x: number; y: number } {
  const M = KEL_MARKET;
  return { x: (M.x + 2 + Math.random() * (M.w - 4)) * TILE, y: (D(M.y + M.h - 2) + Math.random()) * TILE };
}
