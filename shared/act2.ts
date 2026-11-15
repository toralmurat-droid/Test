import { actOfTile, MOORS_LEVEL, PLAYER_RADIUS, TILE } from "./constants";
import { CHAINS, chainDone, type Quester } from "./quests";
import { KEL_MARKET, D, WAYGATE_DESERT, WAYGATE_OAKVALE } from "./desert";
import { CAIRN_SQUARE, MOORSGATE_MOORS, MOORSGATE_OAKVALE, MR } from "./moors";
import { isSolidAt } from "./map";

/**
 * Act 2 (Murat 2026-11-08): the old waygate south of Oakvale and its twin in the desert's Sunstone Circle
 * (shared/desert.ts). It wakes for a hero once the first zone's two last bosses are down: Ostrevar the Hollow King
 * (the Hollow Crown chain) and Grandam Ursk, the Hide-Mother (the Hide Rite chain, the Mawdeep's last quest).
 * Act 3: the moorgate at Act 1's north-east edge and its twin in the Grey Barrow Moors (shared/moors.ts), awake from
 * hero Lv 20 (MOORS_LEVEL.min), no quest needed.
 * Using an awake gate takes the hero through to its twin, like the Mawdeep's ropes.
 */
export type WaygateId = "oakvale" | "desert" | "moorsgate" | "moors";
export interface Waygate { id: WaygateId; x: number; y: number; to: WaygateId; label: string }
const px = (t: { x: number; y: number }) => ({ x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE });
export const WAYGATES: Waygate[] = [
  { id: "oakvale", ...px(WAYGATE_OAKVALE), to: "desert", label: "Step through the waygate to the Sunscar" },
  { id: "desert", ...px(WAYGATE_DESERT), to: "oakvale", label: "Step through the waygate home to Oakvale" },
  { id: "moorsgate", ...px(MOORSGATE_OAKVALE), to: "moors", label: "Step through the moorgate to the Grey Barrow Moors" },
  { id: "moors", ...px(MOORSGATE_MOORS), to: "moorsgate", label: "Step through the moorgate home to Oakvale" },
];
/** How close a hero must stand to use a waygate (click it or press E), like a portal stone's PORTAL_RANGE. */
export const WAYGATE_RANGE = 1.6 * TILE;
export const waygateById = (id: string) => WAYGATES.find((g) => g.id === id);
/** Where a hero coming out of gate `g` stands: a few steps south of it, off the gate. */
export const waygateArrival = (g: Waygate) => ({ x: g.x, y: g.y + 2.4 * TILE });
/** True for the moorgate pair (Act 3), false for the Sunscar's waygates (Act 2). */
export const isMoorsGate = (g: Waygate) => g.id === "moorsgate" || g.id === "moors";

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
/** True once the hero is strong enough for the moors (Act 3): hero level only, no quest. */
export const moorsOpen = (p: { level: number } | undefined) => !!p && p.level >= MOORS_LEVEL.min;
/** Whether gate `g` is awake for this hero. */
export const gateOpen = (g: Waygate, p: (Quester & { level: number }) | undefined) => (isMoorsGate(g) ? moorsOpen(p) : act2Open(p));

/** Which act a point (px) is in (the Lantern Crypt, deep under the desert's west, is Act 1's). */
export const actAt = (py: number, px: number): 1 | 2 | 3 => actOfTile(Math.floor(px / TILE), Math.floor(py / TILE));
/** Kel Ashar's market: where heroes in the desert come back after dying, and where they log in if they left from Act 2. */
export function desertSpawn(): { x: number; y: number } {
  const M = KEL_MARKET;
  return { x: (M.x + 2 + Math.random() * (M.w - 4)) * TILE, y: (D(M.y + M.h - 2) + Math.random()) * TILE };
}
/**
 * Cairnwatch's square (shared/moors.ts): where heroes in the moors come back after dying, and where they log in if
 * they left from Act 3. Free ground only; the moorgate's arrival spot if none is found.
 */
export function moorsSpawn(): { x: number; y: number } {
  const Q = CAIRN_SQUARE, r = PLAYER_RADIUS;
  for (let i = 0; i < 60; i++) {
    const x = (Q.x + 1 + Math.random() * (Q.w - 2)) * TILE, y = (MR(Q.y) + 1 + Math.random() * (Q.h - 2)) * TILE;
    if (![[-r, -r], [r, -r], [-r, r], [r, r]].some(([dx, dy]) => isSolidAt(x + dx, y + dy))) return { x, y };
  }
  return waygateArrival(waygateById("moors")!);
}
/** The town (or camp) of an act, for a login or a respawn there; anything else is Oakvale's square (`home`). */
export function actSpawn(act: number, home: () => { x: number; y: number }): { x: number; y: number } {
  return act === 3 ? moorsSpawn() : act === 2 ? desertSpawn() : home();
}
