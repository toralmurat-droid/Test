# Saltmere rework: progress

Goal (owner, 2026-11-15): turn Saltmere into "a proper little fishing village, with its own life and variety":
a real town layout, Act 1's second safe town, services, people and side quests, its own look and sound.
Work branch: `claude/wizardly-franklin-nedywr`. All phases shipped in one PR, #450 (planned as two; done in one session).

## Decisions (owner 2026-11-15: "go with the recommendations")
1. **Respawn:** in Act 1, a hero who has woken the `saltmere` waystone wakes at the nearer of Oakvale and Saltmere
   (straight-line distance, overworld only). Underground deaths still go to Oakvale. No new save field (`portals` is saved).
2. **Login:** Act 1 logins keep starting in Oakvale.
3. **Fishing:** flavour only in this rework (fisherfolk, racks, the smokehouse quest). A real mechanic is a later PR.
4. **Ferry:** Pell's boat after "The Redfang Chief", a small fee, stops at Saltmere, Gullrock Cove, Heronwreck Strand.
5. **Walls:** stone quay, breakwater and fences; no stockade ("No soldiers, no walls", shared/quests.ts).
6. **No outlaw rule** in Saltmere (Oakvale's "no magic" rule stays Oakvale's); townsfolk get their own lines instead.

## Plan
| # | Phase | Status |
|---|---|---|
| 1 | Coastal sound bed (surf, gulls by day, rigging, bell buoy), optional `saltmere-tune.mp3` slot | done |
| 2 | Harbour props: moored boats, rowboats, bell buoy, lobster pots, mooring posts, breakwater; gulls | done |
| 3 | Layout (`shared/saltmere.ts`, `shared/map.ts`): tavern, chandlery, smokehouse, 3 cottages, Upper Lane, Harbour Street, cobbled harbour square = safe zone, jetties at Gullrock and Heronwreck | done |
| 3b | Building art: tavern and smokehouse styles, signs, smoke (the quay edge became shore boulders) | done |
| 4 | Respawn at the nearer town; second stash chest on the square (same account stash) | done |
| 5 | People: Bess Tanner (smokehouse), Hob Wick (chandler shop), Marta (tavern), Agna (net-mender), Pell (after the Redfang chain); fisherfolk routines; town reacts to the Redfang chain | done (racks/lanterns reacting per hero: not done) |
| 6 | Side arc "Saltmere Ways" (Lv 16-17): Smoke and Salt, The Watch-Fire | done |
| 7 | The ferry (`shared/ferry.ts`, `server/ferry.ts`, validated and rate-limited message) | done |

## Log
- 2026-11-15: plan written (planner agent), owner accepted all recommendations. #448 (Ropewell) merged, so
  `area:map` is free; draft PR opened to claim it.
- 2026-11-15: phase 3 done. `shared/saltmere.ts` holds the layout. `SALT_TOWN` is x 125-160 (not 122-163: the two
  lane-end signposts at x 123 and 161 and the Coast Road's last bend at x 124 must stay outside the area, or the posts
  stop naming Saltmere); the clearing is one tile wider each side. Upper Lane y 176, Harbour Street x 148 (cobble),
  Net Alley x 133; tavern, chandlery, smokehouse and cottage E on Upper Lane, cottage G behind them (path down x 129),
  cottage F east of the old fishers' houses. Square `SALT_SAFE` (135,188, 12x7; flagstones at first, now cobbles, see below) is in `isSafeZone`.
  Reserved: `SALT_STASH` (137,189), `SALT_JETTIES` (147,204 / 189,194 / 37,201), `WATCH_FIRE` (160,195). Outside
  `SALT_BOXES` the overworld is unchanged (hash in `tests/badlands.test.ts`; 9 tiles in rows 166-167 come from the
  reachability pass, which no longer cuts the old way out of the woods).
- 2026-11-15: phase 1 done. Coast bed in `client/src/sfx.ts` (`coastTick`: surf by sea-row count y >= 180, gulls by
  day, pier creaks and hull knocks within 6 tiles of a pier in Saltmere, a distant bell buoy). Music: optional
  `saltmere` track (`/assets/music/saltmere-tune.mp3`), `SALT_TOWNS` in `client/src/music.ts`; without the file
  Saltmere keeps the village tune. Not yet listened to in a browser: volumes untuned.
- 2026-11-15: phase 4 done. Respawn: `act1Home(x, y, woke)` in `shared/act2.ts` (with `saltmereSpawn()`, free ground
  on `SALT_SQUARE`) is the `home` the room passes to `actSpawn` on a death, so only Act 1 deaths change: with the
  `saltmere` waystone in `p.portals`, an overworld death nearer Saltmere's square centre than Oakvale's `SAFE_ZONE`
  centre wakes in Saltmere; underground (Mawdeep, Lantern Crypt; `underground()`) and without the waystone, Oakvale.
  Logins are unchanged (still `actSpawn(save.act, randomSpawn)`); there is no other respawn path (recall, party,
  siege and war code never place a hero in a town). Stash: `STASHES` (Oakvale's `STASH` first, then `SALT_STASH`) and
  `stashNear` in `shared/trade.ts`; the room's `nearStash` accepts any chest, and the client draws one chest per entry.
  The chest is not a map tile (like Oakvale's), so the map is unchanged. Tests: `tests/saltmere-home.test.ts`.
- 2026-11-15: phase 5, NPCs and shop done (fisherfolk routines are the other agent's, in the client). Five people in
  `shared/npcs.ts`, placeholder sheets: Bess Tanner (`smoker`, smokehouse door; side arc comes in phase 6), Hob Wick
  (`chandler`, chandlery door, shop `chandler`: Minor and Medium flasks at Morwen's prices, buys and fuses runes), Marta
  (`marta`, tavern door), Agna (`agna`, net racks on the beach), Pell (`pell`, east of the Harbour Street pier root).
  Pell uses `PRESENCE` in `shared/quests.ts` (`chainDone(RED_CHAIN)`). Lines: new `IDLE_WHEN` table beside `IDLE_BY`
  (chain progress; Marta: worried / after "Salt and Steel" / after "The Redfang Chief"), Agna uses `IDLE_BY` on the
  `letters` choice (law / mercy; plain line before). `idleFor` order: `whenFor`, `moodFor`, `IDLE`. All per hero from
  their own quest state, nothing broadcast. Busking lines for Marta, Bess, Hob and Agna (not Pell: busking ignores
  presence). Tests: `tests/saltmere-people.test.ts`. Not done: fisherfolk routines, Bess's quests (phase 6), the ferry.
- 2026-11-15: phase 6 done. "Saltmere Ways" is the last of `SIDE_ARCS` (chain id and quests-map key `saltways`, save
  names `saltwaysId/Stage/Count/Ver`; a save without them is "not begun"). Both from Bess (`smoker`), not `auto`, ending
  with a hand-in. "Smoke and Salt" (Lv 16, `arcReward(16)`: 870 XP, 190 gold): 8 `QUEST_ITEMS.driftwood` from the shore
  blobs (slime 40%, Mother Blob 60%, warrior/shooter/healer 25%), then the smoke-pit (`clue` object on the tile between
  the `SALT_RACKS`), then Bess. "The Watch-Fire" (Lv 17, `arcReward(17)`: 960 XP, 205 gold): offered only once "Salt and
  Steel" is done (the arc's `needs` holds for every offer of this chain, so it gates the second quest); a carry step (a
  `lastlantern` storm lantern by Garrick's fire, light 60) to the cairn, a `use` on the `cairn` object at `WATCH_FIRE`,
  then Bess. `WATCH_FIRE` moved from (160,195) to (157,193): the old spot was one tile from the Wreckers' false light
  (coast arc, (160,196)). No map tile, no new message, no new sfx `ev` (the use burst and the lantern's existing
  events). Bess has an `IDLE_WHEN` line between the two quests pointing to the Redfang. No Pell quest (the ferry is his,
  phase 7). Tests: `tests/saltmere-quests.test.ts`. Client follow-ups (not done): a `q_driftwood` drop icon
  (`client/src/textures.ts`, falls back to the gold art now); the carried-lantern take spot is hidden only for
  `lantern_last` (`client/src/questCarry.ts` LANTERN_OBJECT), so Garrick's lantern stays drawn at its spot while carried;
  a lit-fire look for the cairn once done (today `qobj_cairn_read`, gold marks).
- 2026-11-15: phases 2 and 3b done (client only, nothing in `shared/` or `server/`). Harbour props are in
  `client/src/saltmereArt.ts` (called from `addWorldProps`): smacks at the pier heads (bobbing), rowboats on the sand, bell
  buoy, mooring posts and lobster pots on the piers, breakwater boulders, the quay edge along the square's south side,
  fish drying on `SALT_RACKS`. Positions come from the map (piers = BRIDGE runs from `SALT_PIERS` / `JETTY_RUNS`, boulders on
  shore-touching water tiles, rowboats on beach sand) plus `shared/saltmere.ts`. Gulls (pooled, 8) live in
  `client/src/ambient.ts` (`updateGulls`): perch on roof ridges and pier posts, wheel over the harbour, only near the
  camera and by day. Buildings: `isobuild.ts` matches each house to `SALT_BUILDINGS` by footprint and picks the new
  `HouseStyle`s `tavern` / `smokehouse` / `chandlery` (`houseLife.ts` + `houseSalt.ts`: hanging signs, lit panes, bench and
  barrels, ropes and lanterns, soot, smoking fish, woodpile; roof louvre on the smokehouse). The small registries in
  `client/src/saltmereReg.ts` (perches, smoke, night glow) connect the pieces without import cycles; the lamp glow and
  the smokehouse plume are driven from `Ambient`. Screenshots: `docs/art/saltmere-*.png`.
- 2026-11-15: phase 5 fisherfolk done. `client/src/villagers.ts` takes a `VillagerConfig` (Oakvale is the default,
  unchanged, wrath on); `client/src/saltmereFolk.ts` builds Saltmere's 7 fisherfolk spots from `shared/saltmere.ts`
  (net racks, pier heads, Garrick's fire, the square, door steps), wrath off, home at dusk, idle beyond 30 tiles.
  Tests: `tests/saltmere-folk.test.ts`.
- 2026-11-15: phase 7, server side done. `shared/ferry.ts`: `FERRY_STOPS` (saltmere, gullrock, heronwreck; `tile` = the
  `SALT_JETTIES` head, arrival `x, y` = centre of the plank one tile north, landward, all three walkable and reachable),
  `FERRY_FEE` 12 gold a leg, `FERRY_RANGE` 2.5 tiles from a jetty head or its arrival plank, or from Pell for the
  Saltmere stop (server slack x1.5, as portals), `FERRY_COMBAT_MS` = `PORTAL_COMBAT_MS`, `ferryOpen` =
  `chainDone(RED_CHAIN)` (Pell's `PRESENCE` gate), `ferryStopNear`. `server/ferry.ts` `rideFerry` runs one ride; the
  room's `onMessage("ferry")` goes through `allow("ask")`. Message `ferry {to: stop id}`; refusals the player can act on
  answer `ferryno {why: "closed" | "far" | "fight" | "gold"}` (bad payloads, same stop, dead: silent; a lantern carrier
  gets the room's usual note). A ride takes the fee, moves the hero, and broadcasts `travel {id, from: "", to: "", x, y,
  why: "ferry"}` (so clients snap, as for a quest warp) and `sfx {ev: "ferry", id, from, to, x1, y1, x, y, fee}`.
  Tests: `tests/ferry.test.ts`. Not done (client): Pell's dialog / jetty prompt with the stop list and fee, the oars and
  bell sound for `ev: "ferry"`, a `ferryno` float text, and the arrival look (today `why` set gives the dark-red quest
  fade in `client/src/TownScene.ts`).
- 2026-11-15: the harbour square is COBBLE, not FLAGS: Act 1's iso ground painter draws FLAGS as dark grass (on purpose,
  for the war camps), so the square was invisible in game. Oakvale's square is COBBLE too.
- 2026-11-15: closing entry, #450 ready. Phase 7 client (`client/src/ferry.ts`): E prompt at a jetty head when
  `ferryOpen`, "Take Pell's boat" in Pell's dialog, the fare list of the other two stops, `ferryno` float texts, a
  sea-blue arrival fade, `ferryOff` / `ferryOn` sounds for `ev: "ferry"`. Phase 6 client follow-ups done: `q_driftwood`
  icon, `client/src/carryHide.ts` hides any carry step's take object (Garrick's lantern stays lit after the quest), a
  burning watch-fire and a smoking smoke-pit per hero. The quay edge along the square was dropped (it stood on the
  beach, five tiles from the water): boulders follow the shore between the piers instead. `shared/saltmere.ts` is
  `area:map` (`tools/ci/critical-areas.mjs`, CLAUDE.md). Review: OK TO MERGE.
- Open for later: the per-hero town reactions to the Redfang chain (cod on the racks, lanterns lit; Marta's and
  Agna's lines already follow it); new character art for the five NPCs (placeholder sheets now); a real
  `saltmere-tune.mp3`; tuning the coast sound volumes by ear; a real fishing mechanic (decision 3).
