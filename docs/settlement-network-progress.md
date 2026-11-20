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
- Step 2b, PR 2: the other five lands, one commit per land (each with its fort diff, so a shift can be bisected).
  - Sunscar Highway: Duskveil's gate round the Veiled Sanctum south to Mirage Wells, west to Kel Ashar, on to Jackal
    Springs, the Ashen Pass, Dustrider Camp and the Sun Road; Kel Ashar west to Palmshade Oasis and the Dune Road. Legs
    `join` the oases' broken trails through the camps (round the shore, never through water). The Sanctum's own road to
    the Ashen Pass stays a track (paved, it pushed the Humpback Mesas' fort off the pass). Forts unchanged.
  - Moors Highway: Marrowkeep's gate to the Host's Muster, south to the Mourning Road; west past Blackwater Fen to
    Cairnwatch, out to the Eastmarch and south-east to Thane's Rest and the Ashen Pass. Thane's Rest's fort moved from
    138.5,748.5 to 125.5,748.5; the Drowned Hollow's fort stays but is now a pass fort (mourning) instead of a junction
    fort; the Hollow Mounds' anchor junction moved a tile (fort unchanged).
  - Badlands Highway: Scarwall's gate round Fangrock's east wall, east past Vulture's Roost and the Cinnabar Pits to the
    Rustwater Post, the Redgate and Red Road passes; Fangrock down the Rattler's Way. The bandits' ambush ledges
    (shared/bandits.ts LEDGES) are one-tile skip boxes, so they keep their boulders. Talon Fort stays a sight up its own
    track (open owner question). Forts unchanged.
  - Sinkholes Highway: Deepden's gate north to the old road east of the Great Maw, to the Dune Road pass and Hidehall's
    north gate; round the Maw's north rim (fork to Tunneltop) to Ropewell; east to the Deep Road; west through Hollowbrook
    Dells, round the Old Warren's west side to the Rattler's Way and down to Mosslight Fen. Rushmere Hollows' fort moved
    from 231.5,1062.5 to 243.5,1062.5 (still on the Dune Road pass); Rootfall Slopes, Hollowbrook Dells and Mosslight
    Fen shifted one tile. The Rushmere signpost sits off the Hollows' war patch (SINK_LANDS hold, tests/sinkholes.test.ts).
  - The Crown's King's Roads: no widening. The legs follow the king's roads' own middle tiles (crown.ts `trail` splines,
    simplified so the line never leaves them), so the 3-wide core is the old road; the carve only filled the gaps with
    crown paving: Tollcross Square down to the ring road (one tile, inside Tollcross: it is a skip box), and the Red, Deep
    and Sun roads' ends to their passes. 60 ground tiles changed. Forts unchanged. The ring road stays one tile wide.
  - After all six: still 25 forts, 14 of 20 pass ends guarded, capital forts unchanged. The whole map, masked with
    HIGHWAY_MASK, hashes the same as the map before PR 1. Hold atlases rebaked.
  - `tools/highway-route.ts`: `NOFORT=1` routes along the old road past forts (without it, the fort penalty makes detours).

## Next
- Later: 3-wide bridges (client isobridge.ts), per-land cobble palettes, highways on the war table (all owner calls: no for now).
