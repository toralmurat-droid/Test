# Settlement network: progress log

Murat 2026-11-19: each land gets its own look and a capital-town-village road chain; capitals move into their homelands.
Roadmap: client/src/roadmap.ts, "Settlement network".

## Done
- Step 1: portal stones grouped by land (every town and village has one).
- Step 2: forts beside the roads (shared/war/standards.ts HOLD_SITES; tests/holdsites.test.ts: 25-30 forts, at least 14 of
  20 pass ends guarded).
- Step 2b, PR 1: land highways framework + Oakvale.
  - `shared/highways.ts`: pure data (legs of waypoints per land, posts at forks) and `carveHighways`. Core 3 wide (COBBLE,
    nature cleared, added to `roads`), a 1-tile verge where only nature is cleared. Never on water or bridges, never over a
    non-nature object, nothing inside the skip boxes (towns and villages listed in `towns`, Oakvale's palisade + 4, Saltmere,
    every city gate `outerBox`, a 9x9 round each capital fort in `CAPITAL_FORTS`).
  - `shared/map.ts` section 23 cuts them after the border roads, then places their signposts (`placePost`, lifted from the
    desert's posts). Exports `HIGHWAY_TILES`, `HIGHWAY_SKIP`, and `groundBefore` / `objectBefore` / `solidBefore` (the map
    before the highways), which chests (shared/chests.ts) and siege sites (shared/siege.ts) are placed on, so the pinned
    spots in tests/quest-steps.test.ts never move. Signposts read a highway along its middle line (`HIGHWAY_MID`).
  - Oakvale: Hearthhold's gate -> Goldenreach -> West Road -> Oakvale; north to Hunter's Camp; east to Millbrook Mill;
    south-west to the Red Road pass; south to Stonecrag Quarry, then over the quarry bridge to the Old Ruins, through
    Greywatch Keep to the Eastmarch pass; and round the Sunken Lake to Saltmere and along the coast to the Greenward pass.
    The plan's "E Road -> bridge -> Old Ruins" was not used: that bridge is broken on purpose (map.ts 13b, Murat
    2026-11-03), so the highway takes the standing quarry bridge.
  - Client: `MAP_KEY.highway` and a "Highways" legend row in the "ways" layer (client/src/mapLayers.ts); the minimap and
    zone map draw highway tiles in that colour (client/src/minimap.ts), not the war table.
  - `tools/highway-route.ts` suggests waypoints (road-preferring search, simplified to within a tile) and prints the forts.
    It reads the built map, so route a land with its legs empty.
  - The Greenward leg stops where the old dirt spur to the pass begins (272,177). Paved down the spur, its cleared verge
    opened a fort spot on the coast: Saltwind Coast's fort jumped east of the river to guard the Greenward pass, and the
    Brinewood - Saltwind Coast war road turned into a track (tests/warroads.test.ts). Keep that in mind before widening it.
  - Fort diff after Oakvale: Saltwind Coast's fort moved from 97.5,189.5 to 105.5,190.5 (its junction anchor moved from
    110,174 to 129,174: the widened road joins runs); Gravemoor's anchor junction moved from 205,167 to 222,162 (fort
    unchanged). Still 25 forts, 14 of 20 pass ends guarded, capital forts unchanged. Hold atlases rebaked.

## Next
- PR 2: the Sunscar, the moors, the badlands, the sinkholes and the Crown (one commit per land; plan in the step 2b brief).
  Each land: add its legs and posts, its town areas to `towns`, set `seat` / `town`, rerun the fort diff, extend
  tests/highways.test.ts (a) to its gate, and call `carveHighways(..., [land])` in that land's test `fresh()`.
- Later: 3-wide bridges (client isobridge.ts), per-land cobble palettes, highways on the war table (all owner calls: no for now).
