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

- Step 3, PR 3: the Mawdeep Sinkholes and the Sunscar.
  - Landmarks (`shared/landmarks.ts`): the Ropewell Lift (`lk_lift`, 12 frames: two A-frames astride the square's
    sinkhole, head beam, pulley, windlass, the cage going down into the pit and up again), foot 116,990 on the pit tiles
    115-116, 989-990. Those tiles already block (map PIT), so the lift has **no `solid` box** (`Landmark.solid` is now
    documented as optional for that case). The caravan halt outside Kel Ashar's east gate (`lk_caravan`: a loaded litter
    under a striped canopy, the camel string couched round it, a hitching rail), foot 168.6,404.6, solid 167.9,404.05
    1.4x1.1 round the canopy only (the camels are walk-through). It stands a little west of the plan's box: a rock is at
    171,405. It lies in The Sunscar's monster zone: `underLandmark` covers its spawns (the spawn test checks it).
  - Kit (`tools/art/paint/landKit/sinkholes.ts`, `sunscar.ts`): rope coils, a rope walk (stakes, the jack's hooks turning,
    the traveller), a tripod gantry with a swinging cage basket; kneeling camels (saddled, salt-loaded), salt-slab stacks,
    a salt pan with its rake.
  - Placement (landKit.ts `SINKHOLES`, `SUNSCAR`): the rope walk north-south in Ropewell's east yard, 2 coils in its west
    yard; a gantry and a coil by the pits in Hollowbrook Dells, 2 gantries on the Great Maw's pits (`byObject`); a loaded
    camel, a camel and a salt stack by the caravan halt; 2 salt stacks in Kel Ashar, 2 at Jackal Springs (no camels there:
    Hamid's ran), 2 camels and a stack at Palmshade, a loaded camel and a stack at Mirage Wells, 3 pans and a stack on the
    Glasswind Flats. Sinkholes 7, Sunscar 16 props (budget 40). Hidehall and the Veiled Sanctum stay undressed.
  - House looks: Ropewell is `{ style: "ropewright", dress: "ropewright" }` in `LAND_LOOK`, the only new tall style
    (houseLife.ts: a ropewright in the door with a coil over the shoulder, rope inside, a hoist beam with a pulley and cage
    basket, coils on pegs on the side wall and by the door; houseLand.ts: the halls stand on short stilts over a dark crawl
    space with a sill beam, braced lower walls, a tarred rope net over the thatch with hanging stones, a pulley block under
    the gable). Ropewell no longer matches the Rustwater Post. Kel Ashar: the door tiles already had striped awnings
    (desertArt.ts), so this adds wind-catchers (`windCatcherTexture`, iso.ts `windCatchers`): a plastered tower with
    louvred vents and a striped flap on the back corner of the upper storey of the three biggest houses that have one.
  - Text: the ropewarden's IDLE line (the rope walk and the Lift), a new IDLE line for Hamid the caravaneer (salt slabs,
    the east gate halt), Hesta Coil's and Zahra's greetings. No item ids, no stock change.
  - Tests (tests/landKit.test.ts): the two lands' kinds and landmarks, the rope walk in the east yard, gantries by pits,
    camels by the halt, every oasis and the Flats dressed, the two seats undressed; a landmark with no box stands on ground
    the map blocks (only the lift, all four pit tiles solid to the map and to bodies). No map tile changed.
  - Not done: Ropewell's working townsfolk (plan Q5), rope ladders into pits, hitching rails and water jars at the oases
    (the halt has a rail), a light for the Lift's lantern (LANDMARK_LIGHT stays the beacon only).

- Step 3, PR 4: the Crown of the Marches (pilgrims and tourneys). **Step 3 is done**: all six lands have their kit and landmark.
  - Landmark (`shared/landmarks.ts`): the Lists on the Tourney Grounds, south of the old lists' ruined court. Two solid
    boxes: the viewing stand (`solid` 88.6,1205.1 3.8x0.9) and the tilt barrier (new optional `parts`: 88.6,1207.1
    7.3x0.4), with the riders' lane between them open (1.1 tiles). `landmarkBoxes(l)` gives every box of a landmark;
    `LANDMARK_SOLIDS`, landKit.ts's keep-clear rule and the tests read it. The barrier is 0.4 thick so a body centred on it
    has its feet box inside (at 0.3 it did not). It stands 2.6 tiles off the King's Hunt pennant at 98.5,1205.7 ("they
    hang from the old lists") and 13 off the muster at 108.5,1206.5. It is in the Tourney Grounds' monster zone:
    `underLandmark` covers its spawns.
  - Art (`tools/art/paint/landKit/crown.ts`): heralds' pavilions in two liveries (red and cream, blue and gold) with
    gored roofs, valances, door flaps tied back and a house shield; a candle shrine (a marble niche with a saint, votive
    candles flickering on the steps, painted flames via `overlay`); a quintain with its shield and sandbag swinging; a
    bundle of pilgrims' staves with shells and a gourd; ribbon posts with a cairn of pilgrims' stones; the Lists in two
    sheets, `lk_lists` (the stand, at the landmark's foot) and `lk_tilt` (the barrier), so heroes in the lane sort between
    them: `LANDMARK_PARTS` in landKit.ts, drawn by landKitView.ts at each part's own foot.
  - Placement (landKit.ts `CROWN`): Tollcross a red and a blue pavilion on each side of the square (none behind the
    herald), the candle shrine and staves in the north-west corner, a quintain on the south-east ground; at the Lists a
    quintain at the tilt's east end and two knights' pavilions south of it; staves at the Greenward Gate's arrival and
    ribbon posts along the Greenward road through the Pilgrims' Way (`cairns()` on the King's Roads). 13 props (budget
    40). The quest's wayside shrines and pennants keep 2 tiles; the Crown Keep and the Throne Hall stay as they are. The
    other lands' spots came out byte-identical.
  - Text: the herald's IDLE line (pilgrims' ribbons, the pavilions, the mended Lists). No item ids, no stock change.
  - Tests: tests/landKit.test.ts (the Crown's kinds and the Lists, both sides of the square, ribbon posts 2.5-6 tiles off
    the road, quest objects clear, the lane open, the pennant in reach, the tilt's sprite at its box; every landmark box
    on open ground, blocking and in a monster zone; part sheets on disk). The reviewer's Hidehall / Veiled Sanctum check
    now tests positions against each area and its seat box (it compared the spot's area name, which could never fail).
    tests/landmarkBodies.test.ts: a dash and a gore north at the tilt stop south of it and walk on. No map tile changed.
  - Not done: Tollcross's working townsfolk (plan Q5), herald shield boards, the pilgrim relic-seller (Q6: no).

- Step 4, PR 1: new villages, framework + the Grey Barrow Moors and the Red Badlands (one commit for both lands: they
  were wired together, and the fort and muster digests did not move, so there is nothing to bisect).
  - Data and carve (`shared/villages.ts`): one template plan (three houses, a square with a well or a stone, a portal
    stone, a reeve, banners, a crate, a barrel and hay), mirrored per village, plus a hand-routed dirt spur from the
    square's exit to the highway and a signpost by the road. `carveVillages` runs as map.ts section 24, after the highway
    signposts, into its own `villageBefore` map (chests and siege sites read the map from before both carves). The spur is
    not in `roads`, never crosses water, bridges, flags or roads. `VILLAGE_MASK` (boxes, spur, post, `clear` tiles) lets
    the land hash tests mask the villages as they mask the highways.
  - Villages: Turfhallow (Thane's Rest), Blackwater Staithe (Blackwater Fen), Barrowstead (the Hollow Mounds) on the
    moors; Redlode (the Cinnabar Pits) and Hornstead (Rattlesnake Gulch) in the badlands. Their stones are appended to
    `PORTAL_SPOTS` (older ids and spots unchanged; the 13c nature disk skips them via `EARLY_STONES`); names are in
    `NO_MOB_AREAS`; signposts name the village on a first board pointing up the path.
  - People (`shared/npcs.ts` `VILLAGE_FOLK`, appended): a giver and a townsperson or trader each, and a reeve
    (`steward_<id>`). Cobb sells flasks at the Staithe, Ilse Copperhand sells the Rustwater armourer's stock at Redlode
    (`shared/shops.ts`; no new item ids).
  - Quests (`shared/quests.ts` `villageQuest`): one arc per village, appended last in `SIDE_ARCS` (no chain index moves):
    find three objects in the patron zone, then kill there; arc reward. Save keys are new top-level `<id>Id/Stage/Count/Ver`
    fields (old saves load as not begun); `ACCOUNT_API` is 2 for the new `*Ver` fields.
  - War: each village is a `TOWNS` entry with `fort: false` (standards.ts skips it, so forts and musters stay where they
    were) and `income: 0.5` (`townIncome`, `townCounts` weighted, `townCount` steps of a half). No WAR_API bump.
  - Client: LAND_LOOK dresses the houses with the land's existing look (cairn, drover); music lists include the names;
    landKit's `VILLAGE_KIT` is scattered last (older spots never move; spots carry `village`).
  - Tests: `tests/villages.test.ts` (sites, carve in the mask and deterministic, reachability to the land's town stone,
    pins of older portals, landmarks, signposts, forts 25, musters, chests, siege sites, 14 of 20 pass ends guarded),
    `tests/villages-room.test.ts` (Turfhallow's stone wakes and takes travellers, Old Maddock's quest runs to its reward;
    a save from before loads). map-metrics: 100% reachable.
  - Not done: villages in the other lands (PR 2), new art or sprites (owner: none), forts at village gates (owner: no).

- Step 4, PR 2: villages in the Mawdeep Sinkholes and the Sunscar, on PR 1's framework (one commit for both lands, as
  in PR 1: the fort and muster digests did not move).
  - Villages (`shared/villages.ts`, appended): Windlass (the Pitfields) on the Great Maw's west rim, its path out to the
    Maw's rim road a tile short of the highway, the gate on the highway at the fork; Hempfield (the Old Warren) beside the
    highway west of the warren; Saltglass (the Glasswind Flats) above the Dune Road; Last Well (the Humpback Mesas) under
    the Ashen Pass road. Windlass sits 2 tiles west of the plan's box (the rim road runs down that box's east column),
    Saltglass 1 west (14 tiles off the Sunstone Circle). Last Well's highway lies north behind a crag, so the template
    gets an optional `exit` (plan offsets): its path leaves the square's top corner and runs up the box's edge.
  - Looks: the Sunscar's houses are Kel Ashar's mud-brick (new `roof: "adobe"`: every tile T.ADOBE but the door, no window
    tiles; iso.ts isoDesert draws them, awning over the door; no wind-catchers, those stay Kel Ashar's). The sinkholes'
    cottages (red tile at Windlass, thatch at Hempfield) wear the ropewright dress (rope nets on the roof, stilts and
    braces) on the low cottage; the tall ropewright style stays Ropewell's. No new tiles or art.
  - People: Liftmaster Corran and Nell Hawser (Ropewell's armour steps) at Windlass; Mother Brakken and Tam at Hempfield;
    Salt-mistress Nadira and Rana at Saltglass; Old Hadiya and Samira (flasks) at Last Well; a reeve each. Existing
    sprites, existing stock (no new item ids). Steward names for every clan.
  - Quests (appended last in `SIDE_ARCS`): Frayed Anchors (splice 3 rope anchors, kill 6 delvers), Rooted Hemp (gather 3
    hemp sheaves, drive off 6 quillbacks: `use` then `kill` like the others, not the plan's `collect` step), Sledges on the
    Flats (search 3 salt sledges, kill 8 scorpions), Fouled Troughs (clear 3 troughs, drive off 6 camelfolk).
  - War: four more `TOWNS` villages, `fort: false`, income 0.5 (13 capturable towns). No WAR_API bump.
  - Saves: `ACCOUNT_API` 2 -> 3. PR 1 (2) was already merged and released, and its `cleanPortals` would drop the four new
    stones from an account it writes (CLAUDE.md: new ids inside an existing save object). The quest fields are new
    top-level fields (free). `ACCOUNT_MIN_READER` stays 1.
  - Client: music lists (Kel Ashar's tune in the Sunscar's villages, the village tune in the sinkholes'); `VILLAGE_KIT`
    appended (rope coils and a gantry on the Maw's rim at Windlass, coils at Hempfield, salt stacks and pans at Saltglass,
    kneeling camels and a stack at Last Well): Sinkholes 7 -> 12, Sunscar 16 -> 22 props (budget 40).
  - Tests: `tests/villages.test.ts` (the four boxes, mud-brick in the Sunscar, homes Kel Ashar and Ropewell, PR 1's stones,
    towns, posts and arcs pinned unchanged, a bounty board by every stone, the gantry on a pit's rim);
    `tests/villages-room.test.ts` (Saltglass's stone from Kel Ashar's, Sledges on the Flats to its reward; the old-save
    test covers all nine). The Sunscar's and the sinkholes' band hashes in tests/crown.test.ts re-taken with the larger
    mask: the same on the map before and after (no tile outside VILLAGE_MASK moved). map-metrics: 100% reachable.
  - Numbers: war sim with towns (9 -> 13 towns) within noise: land 25.8 / 16.9 / 22.2 / 18.0 / 17.1%, 4.86 changes a war
    day (4.85), no clan over 30% for 3+ days; the sinkholes' villages go to the hidekin, the Sunscar's to the veiled.
    Bench tickAvg 4.15-5.64 ms before, 4.07-4.16 after; 22 fewer monsters (the no-mob rects).
  - Not done: the optional third villages (Pulley Cross, Halfway Khan: owner, no), new art or sprites (owner: none).

- Step 4, PR 3: villages in the Crown of the Marches and Oakvale, on the same framework. **Step 4 is done**: every land has
  its highway villages (Moors and Crown 3, the others 2; no optional third villages, owner).
  - Villages (`shared/villages.ts`, appended): Lists End (the Tourney Grounds) beside the old spire path above the Greenward
    road, Vigil's Rest (the Vigil Courts) above the Sun road, Kneelstone (the Field of Statues) above the Red road; Sawyer's
    End (Cinder Scar) off the Eastmarch road and Furrowby (Saltwind Coast) above the Sunken Lake road. Lists End sits 5 tiles
    west of the plan's box and is 12x8 (the spire path runs down the plan box's east side, statues stand above it, and 9 rows
    came within 3 of the highway's middle line); its path joins the spire path, its gate stands on that path by the highway.
    Sawyer's End and Furrowby use `exit` (the square's top corner) for a straight path to the highway. Furrowby's patron is the
    Saltwind Coast (plan Q3: the nearer lands are havens), which it shares with Saltmere: a hand-over there contests both.
    None touches the Crown Keep, the Throne Hall, the Crownway gates (48+ tiles), the King's Hunt pennants or the Lists.
  - Looks: plain stone cottages in the Crown (slate over fieldstone, no dress, owner Q8), Oakvale's plain timber cottages
    (red tile at Sawyer's End, thatch at Furrowby). No new tiles or art.
  - People: Sir Brannoc and Wat Hammel (Kel Ashar's armour steps: the Crown has no armourer) at Lists End; Brother Cuthwin and
    Old Agnes at Vigil's Rest; Master Mason Joss and Brenna at Kneelstone; Garth Holloway and Hew at Sawyer's End; Goody
    Marrow and Pip Tansy (the chandler's small flasks) at Furrowby; a reeve each and steward names for every clan. Existing
    sprites and stock (no new item ids).
  - Quests (appended last in `SIDE_ARCS`): Stolen Pennons (3 pennons, 6 oathbroken knights), The Wayside Candles (3 candles,
    6 hollow heralds), Defaced Plinths (3 plinths, 6 crownguard), Smouldering Logs (3 log stacks, 6 fire blobs), Trampled
    Hives (3 hives, 6 warrior blobs). Objects 4+ tiles from every other quest object (the King's Hunt pennants included).
  - War: five more `TOWNS` villages, `fort: false`, income 0.5 (18 capturable towns). No WAR_API bump.
  - Saves: `ACCOUNT_API` 3 -> 4 (PR 2 merged and released first; its `cleanPortals` would drop the five new stones). Quest
    fields are new top-level fields. `ACCOUNT_MIN_READER` stays 1.
  - The map: the 13c nature disk already skips every village stone (`EARLY_STONES`), so the reachability pass is unchanged.
    The Act 1 hash (tests/badlands.test.ts) now masks `VILLAGE_MASK` too: the same hash on the map before and after Oakvale's
    villages. The Crown band's rebuild test carves land 6's villages as before. map-metrics: 100% reachable.
  - Client: music lists (Oakvale's villages the village tune, the Crown's the Tollcross tune); `VILLAGE_KIT` appended (a
    quintain and two pavilions at Lists End, staves and a candle shrine at Vigil's Rest, staves and ribbon posts at Kneelstone,
    a cart and a hide frame at Sawyer's End, hives in Furrowby with stooks and a scarecrow on the Sunken Lake's edge above it):
    Oakvale 26 -> 32, Crown 13 -> 21 props (budget 40). Roadmap note mentions step 4.
  - Tests: `tests/villages.test.ts` (the five boxes, stone cottages in the Crown, homes Oakvale and Tollcross, PR 2's stones,
    towns, posts and arcs pinned), `tests/villages-room.test.ts` (Furrowby's stone from Oakvale's, Trampled Hives to its
    reward), tests/warTowns.test.ts (Saltmere and Furrowby contested together), tests/landKit.test.ts (the Way's ribbon posts
    leave out Kneelstone's), tests/accountVersions.test.ts (4).
  - Numbers: land shares unchanged; the Crown's villages slow the Crown's turnover (3.81 -> 2.58 changes a war
    day, overall 4.86 -> 3.75; a control run without them: 3.71 / 4.85), contests 0.02 -> 2.15 a day; no clan over 30% for
    3+ days in 0.5% of runs. Bench within noise, 51 fewer monsters.
  - Open (owner): the Crown villages' war income (keep 0.5, lower it, or leave them out of the war).

## Step 5: clan cities move into their homelands (one PR per city)
- PR 1 Hearthhold (PR #572, branch `claude/hearthhold-in-land`): the Wardens' city leaves the city strip and stands in
  Oakvale's north-west (x 41..92, y 1..40), with south, west and east gates on the highways and roads, a gate ward for
  W7's entry rules, and about 37 client-side townsfolk per city. Plot 0 of the strip stays rock until all five cities have
  moved. Defaults taken: keep entry rules, remove the old Goldenreach gate dais, highway seat stays Goldenreach Farms,
  login stays at Oakvale, strip cities get the townsfolk too.
  - Built: `City.site`, `shared/cityLand.ts` (carve in map section 22b, `CITY_MASK`, `cityBefore`), highway legs from
    the south and west gates, east-gate road to the Watchtower Trail, `server/cityGates.ts` gate ward, `relocateCitySpot`
    on resume, client `cityFolk.ts` (37 people in Hearthhold, 33 in strip cities), `paintGatehouse` in cityProps.ts,
    crier lines in cityText.ts.
  - Deviations: windmill stays 0.6 tiles off the east wall (walkable gap tested); champions family-share floor 0.90 -> 0.88
    (Oakvale lost ~160 blobs); city through streets join the road set.

- PR 2 Scarwall (PR #573, branch `claude/scarwall-in-land`): framework for the other four (`City.sideGates`,
  `OLD_CITY_GATES`, per-land retired legs, land filter on `carveCitiesInLand`, bandit clearance, table-driven
  cityLand tests) plus Scarwall in the Badlands' north-west (x 9..60, y 782..821), south and east gates, highway to
  Fangrock. Then Duskveil (Sunscar, below the Thornspire east of Mirage Wells), Marrowkeep (Moors, north of
  Kingsbarrow), Deepden (Sinkholes, on the back way west of Hidehall), merged one at a time; the strip stays rock.
  - Built: Scarwall site {9,782}, east gate onto Gallows Canyon (4-tile dirt stub + post), highway leg from the south gate
    joining the old line at (47,63) (old segment [[26,44],[47,63]] retired); musters can't stand in or against an in-land
    city (standards.ts); in-land city posts below the overworld were dropped by a MAP_H/FULL_H mix-up in #572, fixed;
    city waystones keep the level rule from any stone; no dust or mist inside city walls.
- PR 3 Duskveil (PR #574, branch `claude/duskveil-in-land`): site {230,404} in the Saffron Dunes below the Thornspire,
  south and west gates; new highway leg "Duskveil Gate -> Mirage Wells"; the old dais legs keep their points, renamed
  ("The Sanctum's fork -> The Veiled Sanctum", "The Veiled Sanctum -> Mirage Wells"); south gate dirt road west above
  dune_totem3. Client: desert adobe walls whole and clan-tinted inside cities, city doors drawn plain.
- PR 4 Marrowkeep (branch `claude/marrowkeep-in-land`): site {230,601} north of Kingsbarrow, south and west gates; new
  highway leg "Marrowkeep Gate -> The Host's Muster" (routed off the stump at local (251,72): clearing it lets a spot by
  the highway tie the Muster's capital fort and win); old stub retired; west gate track stops 5 tiles short of the Nine
  Widows road (joined, the fork becomes a junction and the Hollow Mounds' fort moves to Kingsbarrow). Three war roads
  re-route round the walls; war sim unchanged. Client: moors painter skipped inside cities.

- PR 5 Deepden (PR #576, branch `claude/deepden-in-land`): site {162,1083} on the back way west of Hidehall, south,
  west and east gates; new highway leg "Deepden Gate -> The Great Maw road" (the rest renamed "The Great Maw road ->
  Hidehall", fork post moved); Hidehall's two burrow Delvers by the city dropped and two west patrols shortened; war
  roads unchanged. The old city strip is now empty rock (map-metrics row "Old cities' band (rock)"). Client: sinkholes
  painter skipped inside cities, Deepden's houses take the Hide-Kin tint. Step 5 done: all five cities in their homelands.

## Next
- Step 3 optional follow-ups: working townsfolk for Millbrook, Cairnwatch, the Rustwater Post,
  Ropewell and Tollcross (plan Q5); the small props left out (spare millstone, turf drying rack, creels, tailings heap,
  skulls on gateposts, rope ladders, hitching rails and water jars at the oases, herald shield boards); a light for the
  Lift's lantern and the candle shrine; real stalls in Tollcross with step 4 (Murat: cosmetic pavilions for now).
- Later: 3-wide bridges (client isobridge.ts), per-land cobble palettes, highways on the war table (all owner calls: no for now).
