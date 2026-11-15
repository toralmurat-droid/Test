# Saltmere rework: progress

Goal (owner, 2026-11-15): turn Saltmere into "a proper little fishing village, with its own life and variety":
a real town layout, Act 1's second safe town, services, people and side quests, its own look and sound.
Work branch: `claude/wizardly-franklin-nedywr`. Shipped in two PRs:
- **PR A (town and look):** phases 1, 2, 3, 3b.
- **PR B (systems):** phases 4, 5, 6, 7.

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
| 2 | Harbour props: moored boats, rowboats, bell buoy, lobster pots, mooring posts, breakwater; gulls | todo |
| 3 | Layout (`shared/saltmere.ts`, `shared/map.ts`): tavern, chandlery, smokehouse, 3 cottages, Upper Lane, Harbour Street, flagstone harbour square = safe zone, jetties at Gullrock and Heronwreck | done |
| 3b | Building art: tavern and smokehouse styles, signs, smoke, quay edge | todo |
| 4 | Respawn at the nearer town; second stash chest on the square (same account stash) | done |
| 5 | People: Bess Tanner (smokehouse), Hob Wick (chandler shop), Marta (tavern), Agna (net-mender), Pell (after the Redfang chain); fisherfolk routines; town reacts to the Redfang chain | todo |
| 6 | Side arc "Saltmere Ways" (Lv 16-19): Smoke and Salt, The Watch-Fire | todo |
| 7 | The ferry (`shared/ferry.ts`, `server/ferry.ts`, validated and rate-limited message) | todo |

## Log
- 2026-11-15: plan written (planner agent), owner accepted all recommendations. #448 (Ropewell) merged, so
  `area:map` is free; draft PR opened to claim it.
- 2026-11-15: phase 3 done. `shared/saltmere.ts` holds the layout. `SALT_TOWN` is x 125-160 (not 122-163: the two
  lane-end signposts at x 123 and 161 and the Coast Road's last bend at x 124 must stay outside the area, or the posts
  stop naming Saltmere); the clearing is one tile wider each side. Upper Lane y 176, Harbour Street x 148 (cobble),
  Net Alley x 133; tavern, chandlery, smokehouse and cottage E on Upper Lane, cottage G behind them (path down x 129),
  cottage F east of the old fishers' houses. Square `SALT_SAFE` (135,188, 12x7, flagstones) is in `isSafeZone`.
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
