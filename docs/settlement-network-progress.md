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
    the Ashen Pass stays a track (paved, it pushed the Humpback Mesas' fort off the pass). Forts unchanged; one unfortified muster (territory 30) shifts about 5 tiles.
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

- Step 3, PR 1: land identity framework + Oakvale (plan: each land gets a kit of props, one house look and one landmark).
  - Owner calls (Murat 2026-11-20, the plan's defaults): landmarks block movement, kit props are walk-through; the windmill
    stands on North Meadow; the five clan seats stay undressed until step 5; Tollcross gets cosmetic pavilions (PR 4).
  - `shared/landmarks.ts`: `LANDMARKS` (id, land, area, foot, optional `solid` box in tiles) and `LANDMARK_SOLIDS`, added to
    the decor collision grid in `shared/npcs.ts` (`isDecorSolidAt`) next to `CITY_SOLIDS`. Not in `NPC_DECOR` (siege works,
    tunnels and rituals read that). Oakvale: the windmill, foot 94.5,31.5, solid 93.6,30.6 1.8x1.8.
  - `client/src/landKit.ts` (Phaser-free): `kitFree` keep-clear rule (3x3 of empty or nature, no road/highway/water/bridge
    beside it, no field under it except for `ON_FIELD` kinds, no fence gateway; 2.5 tiles from NPCs and NPC_DECOR, 2 from
    signposts, chests, bounty boards, quest objects; 3 from portal stones and war-town gates/banners/stewards; 7 from forts
    and musters; the siege-site box; barns; 1.5 round a landmark box; never in a `CAPITAL_FORTS` skip box + `SEAT_MARGIN`
    12; clear of the world props). `LAND_KIT_SPOTS`: per-land `Place` lists scattered by a fixed hash; budget 40 per land.
  - `client/src/worldPropSpots.ts`: worldProps.ts's placement (spots, scatter, free) moved out, Phaser-free, so the kits
    keep clear of it. `client/src/landKitSheets.ts`: one size table for the bake, the client and the test.
  - `client/src/landKitView.ts`: preload (from `preloadBakedProps`) and placement (from `addWorldProps`), static chunks,
    skips a sheet that failed to load. The windmill's sails turn as a 6-frame sheet (a quarter turn, 5 fps).
  - Art: `tools/art/paint/landKit/oakvale.ts` (stook, scarecrow with a crow, grain cart, beehives, hide frame, windmill),
    listed in `tools/art/bake-props.ts`, sheets `client/public/assets/hd/props/lk_*.png`. One file per land, so the next
    lands' models can be made in parallel.
  - Oakvale's 26 props: North Meadow (cart, 9 stooks, hives round the windmill), Goldenreach's north field (scarecrow, 8
    stooks, hives by the barn; the fort end is the seat), Millbrook (cart and hives west of the mill: north of it the roof
    hides them), the Hunter's Camp (2 hide frames), Oakvale's square (a cart on the east edge).
  - Text: Odo's and Huntmaster Bryn's IDLE lines (shared/quests.ts), Brann's and Hilda's greetings (shared/shops.ts).
  - `tests/landKit.test.ts`: determinism, keep-clear rules, seats, budget, sheet sizes on disk, landmark boxes on open
    ground and blocking, reachability with and without the landmarks, and digests of chests, siege sites, forts and musters
    taken on the commit before (unchanged). No map tile changed: map hashes and map-metrics untouched.
  - Not done: Oakvale's working townsfolk (sack carriers at Millbrook), left for later; the spare millstone from the plan.

- Step 3, PR 2: the Grey Barrow Moors and the Red Badlands.
  - Landmarks (`shared/landmarks.ts`, both solid): the Beacon Cairn north of Cairnwatch's gate (foot 77,692, solid
    76.1,691.1 1.8x1.8: a dry-stone tower with an iron basket of burning peat, `lk_beacon`, 6 frames) and the Cinnabar
    Pits' headframe (foot 174.5,883.5, solid 173.1,882.1 2.8x2.8: timber legs over the shaft, a turning sheave wheel,
    the bucket rising and sinking, the winch to the west, `lk_headframe`). The muster at 188.5,887.5 stays 14 tiles off.
  - The beacon's glow: `LANDMARK_LIGHT` in landKit.ts (only landmarks whose sheet shows a fire); landKitView.ts passes it
    to the day/night layer through `addWorldProps`' new `fire` callback (TownScene.ts), so it fades in after dusk.
  - Kit (`tools/art/paint/landKit/moors.ts`, `badlands.ts`): peat stacks, a cut peat bank with its turf spade, way-cairns;
    longhorns, a plank trough, ore carts on a rail stub. `flame2d` is exported from paint/dungeon3d.ts for the beacon.
  - Placement (landKit.ts): Cairnwatch's peat stacks (3) and a fuel stack at the beacon's foot; 3 peat banks just outside
    the palisade; 15 way-cairns, one about every 22 tiles of the Moors Highway's middle line, 3-5 tiles off it
    (`cairns()`); in the Rustwater Post's drovers' pen 3 longhorns and the trough (`IN_PEN` kinds may stand against the
    pen's fence, hay and palisade), 3 more grazing outside the post, 2 ore carts by the headframe. No cart inside the post:
    its yard is the lane from the south gate. Moors 22 props, badlands 9 (budget 40). A `Place` may now sample a `box`
    of a land-wide area (600 hash tries over the whole moors found nothing near the beacon). New keep-clear rule: 3 tiles
    from a palisade gate (`nearGate`); Oakvale's 26 spots came out byte-identical.
  - House looks: `client/src/isobuild.ts` STYLE_AREAS is now `LAND_LOOK` (per settlement: `style` = the tall houses as
    before, `dress` = the low cottage painted in the land's way). `client/src/houseLand.ts`: Cairnwatch "cairn" (rough
    fieldstone courses, mossy foot, sod roof with heather, grass over the eaves, weighting stones) and the Rustwater Post
    "drover" (bleached planks, hides pegged out low on the wall, a longhorn skull on the gable, patched shingles; in the
    iso view the eaves hide the upper half of a low wall, so nothing goes up there). Saltmere,
    Millbrook and Redfang take the same path as before. Peat smoke: Cairnwatch's chimney tops go into `PEAT_SMOKE`
    (known before the lazy bake); ambient.ts gives each a thicker blue-grey plume anchored at the chimney.
  - Text: the cairncaptain's IDLE line (peat for the beacon), the rustmarshal's (longhorns and cinnabar carts); greetings
    of Mother Ysolde, Gorm, the Rustwater armourer and healer (shared/shops.ts). No item ids, no stock change.
  - Monster placements (PR 1 reviewer): the room put bodies down with the map's `isSolidAt` only, which misses landmarks
    (and the capitals' props). Champions' blinks, splits, gangs and ballistae (champions.ts `canStand`), the Hide-Kin's
    `canStand`, the Crown monsters' `canStand`, budded bloblings, raised skeletons, called reinforcements and a tree
    ambusher's landing now test `bodySolidAt` (shared/movement.ts: what movement treats as solid). `findHideSpot`'s
    step-out spot skips tiles under a landmark. Spawn zones were already covered by `underLandmark`.
  - Review of #566: every other room path that slides or puts down a body now tests `bodySolidAt` too: beast rushes
    (pounce, swoop, gore, stampede), the skill host's `move` and `place` (hero dashes and leaps, pulls and pushes on
    monsters), the Black Hole's void-hop, summon placement and recall, the brides, the Colossus split, chest guards, the
    rite's demon, the Chief's Leap landing, raiseServant and raiseKin. `bodySolidAt` is the map at the point (as before,
    so moves along map walls are unchanged) plus the feet box (PLAYER_RADIUS) against decor and Hold walls: a dash
    stops before a landmark as walking does, never with its feet in it (moveStep would then refuse every step out).
    Before, a tuskborn's gore ran straight through the headframe. Left on the map test: line of sight, spark hazards,
    projectiles (they still fly through landmarks), and wisps (they fly, no walls). tools/balance/duel.ts shares none of
    this (its own host, no walls); with Math.random seeded the same, its output is byte-identical before and after.
    `tests/landmarkBodies.test.ts` (room): a hero's dash and a beast's gore at the headframe stop west of it and walk on.
  - Tests (tests/landKit.test.ts): each land's kit and landmark, the pen, ore carts by the headframe, way-cairns 2.5-6 tiles
    off the highway, the beacon's light, `bodySolidAt` inside every landmark box, hide spots; the NPC_DECOR check is per
    landmark (its id, sheet and box), the seat test reads FORT_SKIP + SEAT_MARGIN. No map tile changed.
  - Not done: working townsfolk for Cairnwatch and Rustwater (plan Q5), the turf drying rack, creels by the doors, the
    tailings heap, skulls on the gateposts (the skull is on the gables instead).

## Next
- Step 3, PR 3: Sinkholes + Sunscar (ropewright style in `LAND_LOOK`, Ropewell Lift, rope kit; caravan halt, salt kit,
  Kel Ashar awnings). PR 4: Crown. Each adds a `tools/art/paint/landKit/<land>.ts` and its `Place` list in landKit.ts.
- Later: 3-wide bridges (client isobridge.ts), per-land cobble palettes, highways on the war table (all owner calls: no for now).
