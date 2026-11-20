/**
 * The capturable towns' spots (W6, rules in towns.ts), apart from their rules so the forts (standards.ts, beside each town's
 * gate) can read them without an import cycle (towns.ts -> holdSack.ts -> holdWalls.ts -> standards.ts). Pure data.
 */
export type TownId = "saltmere" | "rustwater" | "ropewell" | "millbrook";
/** A capturable settlement. Spots are tiles; `area` is its shared/map.ts AREAS name, `patron` the territory it follows. */
export interface Town {
  id: TownId; name: string; kind: "town" | "village"; area: string; patron: string;
  /** The gate muster: a tile on the road out of town, beyond town ground (keepOut) by TOWN.gateClearTiles. */
  gate: { x: number; y: number };
  /** Where the holder's banners fly (cosmetic, drawn by the client). */
  banners: { x: number; y: number }[];
  /** Where the steward stands (an NPC of shared/npcs.ts, `steward_<id>`). */
  steward: { x: number; y: number };
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
];
