/**
 * The capturable towns' spots (W6, rules in towns.ts), apart from their rules so the forts (standards.ts, beside each town's
 * gate) can read them without an import cycle (towns.ts -> holdSack.ts -> holdWalls.ts -> standards.ts). Pure data.
 */
import { VILLAGES, villageGate, villageSpots, type VillageId } from "../villages";

export type TownId = "saltmere" | "rustwater" | "ropewell" | "millbrook" | VillageId;
/** A capturable settlement. Spots are tiles; `area` is its shared/map.ts AREAS name, `patron` the territory it follows. */
export interface Town {
  id: TownId; name: string; kind: "town" | "village"; area: string; patron: string;
  /** The gate muster: a tile on the road out of town, beyond town ground (keepOut) by TOWN.gateClearTiles. */
  gate: { x: number; y: number };
  /** Where the holder's banners fly (cosmetic, drawn by the client). */
  banners: { x: number; y: number }[];
  /** Where the steward stands (an NPC of shared/npcs.ts, `steward_<id>`). */
  steward: { x: number; y: number };
  /**
   * false: its gate is no fort anchor (standards.ts buildSites; the highway villages, owner question Q2 of step 4: a new
   * anchor would move forts). Default (missing): the gate anchors a fort, as the first four towns' do.
   */
  fort?: false;
  /** Its share of WAR.townIncome while held (1 when missing; the highway villages pay half: Q1 of step 4). */
  income?: number;
}

/**
 * Owner question 1 (2026-11-16, defaults): Oakvale stays the Wardens' hub; Cairnwatch and the Hunter's Camp follow
 * Wardens capitals that never fall; Kel Ashar is Act 2's main town. Spots checked by tests/warTowns.test.ts.
 */
export const TOWNS: readonly Town[] = [
  { id: "saltmere", name: "Saltmere", kind: "town", area: "Saltmere", patron: "Saltwind Coast", gate: { x: 171, y: 183 }, banners: [{ x: 148, y: 182 }, { x: 152, y: 182 }], steward: { x: 150, y: 182 } },
  { id: "rustwater", name: "the Rustwater Post", kind: "town", area: "The Rustwater Post", patron: "The Saltlick Flats", gate: { x: 212, y: 872 }, banners: [{ x: 226, y: 875 }, { x: 230, y: 875 }], steward: { x: 228, y: 875 } },
  { id: "ropewell", name: "Ropewell", kind: "town", area: "Ropewell", patron: "Rootfall Slopes", gate: { x: 136, y: 993 }, banners: [{ x: 108, y: 995 }, { x: 112, y: 995 }], steward: { x: 110, y: 995 } },
  { id: "millbrook", name: "Millbrook Mill", kind: "village", area: "Millbrook Mill", patron: "North Meadow", gate: { x: 99, y: 52 }, banners: [{ x: 108, y: 48 }, { x: 112, y: 48 }], steward: { x: 110, y: 48 } },
  // the villages along the highways (settlement network step 4, shared/villages.ts): the gate on the road where the
  // village's path meets it, the reeve between two banners on the square; no fort anchor, half a town's income
  ...VILLAGES.map((v): Town => {
    const s = villageSpots(v);
    return { id: v.id, name: v.name, kind: "village", area: v.name, patron: v.patron, gate: villageGate(v), banners: s.banners, steward: s.steward, fort: false, income: 0.5 };
  }),
];
/** A town's income share (Town.income, 1 when missing). */
export const townIncome = (t: Town): number => t.income ?? 1;
