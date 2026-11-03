import { TILE } from "./constants";
import { PORTAL_SPOTS } from "./map";

/**
 * Portal stones for fast travel (Murat 2026-11-03): carved standing-stone arches in several zones, one right outside
 * Oakvale's north gate. A hero wakes a portal by walking up to it once (saved per hero); a woken portal glows
 * orange. At any woken portal, E opens the travel list, which only shows the portals this hero has woken, so the
 * full list stays unknown until every stone is found. Travel only goes to portals already reached on foot, so the
 * broken bridges (shared/map.ts) still decide how a hero first gets to the Old Ruins.
 */
export interface Portal { id: string; name: string; x: number; y: number }
/** Pixel position of each portal's foot (the centre of the arch's threshold). */
export const PORTALS: Portal[] = PORTAL_SPOTS.map((p) => ({ id: p.id, name: p.name, x: (p.x + 0.5) * TILE, y: (p.y + 0.6) * TILE }));
export const portalById = (id: unknown) => PORTALS.find((p) => p.id === id);

/** Walking this close wakes a portal (px). */
export const PORTAL_WAKE_RANGE = TILE * 2.2;
/** This close you can use it (px from the foot). */
export const PORTAL_RANGE = TILE * 1.6;
/** No travel this soon after taking a hit: portals are not an escape from a fight. */
export const PORTAL_COMBAT_MS = 5000;
/** Where a hero arrives: just in front of the stone. */
export const arrivalOf = (p: Portal) => ({ x: p.x, y: p.y + TILE * 0.9 });

/** Keeps only known portal ids, once each, in map order. */
export const cleanPortals = (ids: unknown): string[] =>
  Array.isArray(ids) ? PORTALS.filter((p) => ids.includes(p.id)).map((p) => p.id) : [];

/** The portal within reach of a pixel position, if any. */
export function portalNear(x: number, y: number, range = PORTAL_RANGE): Portal | undefined {
  let best: Portal | undefined, bd = range;
  for (const p of PORTALS) { const d = Math.hypot(p.x - x, p.y - y); if (d <= bd) { bd = d; best = p; } }
  return best;
}
