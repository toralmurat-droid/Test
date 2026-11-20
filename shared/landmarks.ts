import type { Act } from "./constants";

/**
 * Land landmarks (settlement network step 3, "land identity"): one big built thing per land that tells you where you
 * are, like Oakvale's windmill on North Meadow. Pure data, in tiles. `x`, `y` is the foot the art stands on
 * (client/src/landKitView.ts); `solid` (x, y, w, h) blocks movement through shared/npcs.ts isDecorSolidAt, next to the
 * capitals' props (Murat 2026-11-20: landmarks block, land-kit props are walk-through).
 *
 * Not NPC_DECOR: siege works, tunnels and rituals read that list, and none of them may move. No map tiles change, so
 * map hashes, chests, siege sites, forts and musters stay where they are (tests/landKit.test.ts checks the boxes sit on
 * open ground and leave every reachable tile reachable).
 */
export interface Landmark {
  id: string;
  land: Act;
  /** The shared/map.ts AREAS name it stands in. */
  area: string;
  x: number;
  y: number;
  /** Blocks movement here; none when it stands on ground the map already blocks (the lift over its pit). */
  solid?: readonly [number, number, number, number];
}

export const LANDMARKS: readonly Landmark[] = [
  // a post mill on the North Meadow rise above Millbrook: the water mill below and the windmill share the grain
  { id: "windmill", land: 1, area: "North Meadow", x: 94.5, y: 31.5, solid: [93.6, 30.6, 1.8, 1.8] },
  // the moors' Beacon Cairn on the rise north of Cairnwatch's gate: a peat fire on top, seen across the barrows at night
  { id: "beacon", land: 3, area: "The Grey Barrow Moors", x: 77, y: 692, solid: [76.1, 691.1, 1.8, 1.8] },
  // a mine headframe and winch over the shaft at the Cinnabar Pits, by the Badlands Highway (the muster stays 15 tiles off)
  { id: "headframe", land: 4, area: "The Cinnabar Pits", x: 174.5, y: 883.5, solid: [173.1, 882.1, 2.8, 2.8] },
  // the Ropewell Lift: a windlass gantry over the tame sinkhole in Ropewell's square, its cage going up and down. It stands
  // on the pit tiles (115-116, 989-990), which the map already blocks, so it needs no box of its own
  { id: "lift", land: 5, area: "Ropewell", x: 116, y: 990 },
  // the caravan halt outside Kel Ashar's east gate: a loaded litter under a striped canopy (solid), the couched camels
  // round it walk-through like the kit
  { id: "caravan", land: 2, area: "The Sunscar", x: 168.6, y: 404.6, solid: [167.9, 404.05, 1.4, 1.1] },
];

/** The blocking boxes, for the decor collision grid. */
export const LANDMARK_SOLIDS: readonly (readonly [number, number, number, number])[] = LANDMARKS.flatMap((l) => (l.solid ? [l.solid] : []));
