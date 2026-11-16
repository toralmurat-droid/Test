# Clan war (the Riven Marches): progress log

Design: https://play.fmtpa.ch/design/riven-marches/ · Plan: https://play.fmtpa.ch/roadmap (`client/src/roadmap.ts`).

## Decisions
- Murat 2026-11-14: the war runs across the whole map, all acts (future ones too). Villages, dungeons, quest-boss
  lairs and the broad wild zones never change hands.
- Murat 2026-11-14: players may swear to any clan, including the Ossuary Host and the Hide-Kin.
- Murat 2026-11-14: one war that never ends (no resets).
- Murat 2026-11-14: no approval step for AI leaders, forged items or AI code; everything logged, significant items and
  a daily digest emailed to Murat. AI code stays sandboxed with automatic rollback.
- Murat 2026-11-14: saves moved to Postgres on Railway (5 accounts imported).

## M0 Foundations (2026-11-14)
Built, not yet wired into the game (nothing players see):
- `shared/war/clans.ts`: the five clans, colours, doctrine, counter cycle, one capital per act.
- `shared/war/territories.ts`: 31 territories from `SPAWN_ZONES` (21 in Act 1, 10 in Act 2), borders by zone
  distance, the waygate joins the acts; connected starting land around each capital (8/7/6/5/5). A future act needs
  its own capitals and a link to join.
- `shared/war/rules.ts`: `warTick` (10-minute tick): income with overextension, upkeep, defence spread by pressure,
  attacks, counter cycle, day/night doctrines, forts, Control, announced sieges, capitals never fall, rally for clans
  below a fair share, Night Raiders bleed the leader. All numbers in `WAR`. Orders are sanitised (`cleanOrders`): AI leaders will never be trusted.
- `shared/war/doctrine.ts`: scripted leaders (fallback for the future War Councils) and one ruse for the clever-plan check.
- `tools/balance/war.ts`: headless war sim. `tests/war.test.ts`.

Sim, 200 wars x 30 war days, no players (`npx tsx tools/balance/war.ts 200 30 --clever=host`):

| clan | avg land | most land |
|---|---|---|
| Wardens | 23.5% | 29.0% |
| Redfang | 25.6% | 32.3% |
| Ossuary Host | 11.8% | 19.4% |
| Hide-Kin | 17.3% | 19.4% |
| Veiled Circle | 21.9% | 25.8% |

- One clan above 30% for more than 3 days in a row: 0.5% of wars (goal under 5%). Met.
- About 7 territories change hands per war day.
- The Host's ruse (feint by day, all-in at night) gains land (13.0% vs 11.8%) without dominating. The same ruse
  costs the other clans land, as it should: it only pays with a night doctrine.

Open points for M1:
- The Host stays the smallest clan (boxed in between two capitals in both acts). Look at its capitals or give it
  the bone-yard growth from the design before tuning numbers.
- The Hide-Kin never grow past their 6 starting territories (about 60 flips each way in 20 wars, against ~1,500 for
  Host and Redfang): the tunnel doctrine barely matters. Tunnelled targets stand undefended but the attack arrives at
  cut-off supply. Rework the tunnel before tuning.
- The Host churns (many flips both ways) rather than grows.
- 7 flips a day over 31 territories may feel fast once players watch it; check with the first front.

## M1 step 1: the war runs live (2026-11-14)

- `server/war.ts`: one war for the whole server, outside the room. Every 10 minutes the scripted leaders give
  orders, players' valor of the last ten minutes is added, the war ticks with the real time of day
  (`shared/war/view.ts` `warPhase`, so the Host's night push matches the game's night). After downtime at most 3
  ticks are caught up. Saved after every tick (Postgres table `kv`, key `war`; or `data/war.json`). A saved war whose
  territory count no longer fits the map starts over (log line "War: map changed").
- Players: `WAR.valorScale` / `WAR.valorCap` in rules.ts turn valor (hero-minutes at a standard) into troops with
  diminishing returns. `addValor()` exists; standards that feed it come next.
- Clients get the `war` snapshot on join and after each tick; the front plaque (`client/src/warPlaque.ts`) shows
  holder, Control and siege countdown in a territory. The Herald posts sieges, holds and conquests in the chat.
- `GET /war.json`: current snapshot and the last 50 events.
- Scope note: Murat chose the whole map, so the live war runs all five clans over both acts from the start instead
  of the single Wardens-Redfang front the roadmap first planned.

## M1 step 2: standards and oaths (2026-11-14)

- `shared/war/standards.ts`: 58 standards (one or two per territory) on free ground, at least 6 tiles from a portal
  stone. `STANDARD` holds the ring radius, valor per minute, minimum level 5, the one-day oath cooldown, the idle
  limit (3 min without moving, attacking or casting) and the over-level cut (heroes more than 5 levels above a
  territory's monsters bring a quarter).
- `server/warHeroes.ts`: oath validation and save cleaning (`clan`, `clanAt` on the hero save, optional), and
  `Presence`: a full minute in one ring reports valor; leaving the ring starts the minute over.
- Client: `client/src/warStandards.ts` (poles in the holder's colours, rings, E prompt, oath panel; other E
  prompts nearby come first), the plaque tells the hero whether they defend, attack or cannot reach the land.
- Open: rewards for valor (Renown, M2), tabards so other players see the oath (M2), Holds.

## M1 step 3: horns and leaders (2026-11-14)

- `shared/war/heralds.ts`: a leader per clan (Captain Hale, the Redfang Chief, the Pale Marshal, the Hide-Mother,
  the Veiled Oracle) with lines per moment; the defender speaks when besieged or holding, the winner when a land
  falls. Picked by tick, so replays say the same.
- Each war event: Herald line, leader line, and a `warev` message; `client/src/warNotice.ts` sounds the war horn and
  shows a notice when it happens in the hero's territory or next to it.
- `WAR.siegeValor` 1.5: valor counts half again at a territory under siege (the hour's warning is for players).

## M1 step 4: Holds (2026-11-14)

- `client/src/holdArt.ts`: five Hold sprites in the clan styles (Warden watchtower, Redfang war camp, Ossuary tower,
  Hide-Kin burrow, Veiled shrine), generated pixel art in the bonfire style (rebuilt as iso forts later the same day, see below).
- `shared/war/standards.ts` `HOLDS`: one spot per territory near the middle, on clear ground, at least 5 tiles from its standards. The
  sprite follows the owner. Look only: no collision, no siege mechanics at the Hold yet (M2: siege works, gates).

## Tuning: tunnels (2026-11-14)

- Hide-Kin tunnel strikes (two borders away) used to arrive at cut-off supply (0.35), so the doctrine barely
  mattered. Now they keep `WAR.tunnelSupply` (0.8) of the supply of the own land the tunnel starts from.
- Sim 200 x 30 before / after: Hide-Kin 17.3% -> 17.8% (best day 19.4% -> 22.6%), domination 0.5% -> 0.0%,
  flips 7.05 -> 7.33 per day. Wardens 23.5 -> 23.8, Redfang 25.6 -> 24.7, Host 11.8 -> 12.0, Veiled 21.9 -> 21.7.
- Host: raising `hostRaise` to 0.45 / 0.6 moved it only to 12.4% / 12.7%. Its size comes from where its forward
  capitals sit; it is left to the Grey Barrow Moors homeland (roadmap "New Lands").

## M2: Renown (2026-11-14)

- `shared/war/renown.ts`: `RENOWN_RANKS` (Sworn 0, Shieldbearer 30, Standard-bearer 120, Banneret 360, Warlord 900,
  Hero of the Marches 2000). Each valor report from a standard (one full active minute) adds the same amount of
  renown (`heroValor`: a quarter when far over-levelled). Saved per hero as optional `renown`; kept on a clan change.
- The oath panel shows renown and the next rank; the Herald tells the hero in chat on a rank-up. No reward yet beyond
  the title (ideas: tabard trims by rank, Renown in the name tag once a synced field is free).

## M2: Troops on patrol (2026-11-14)

- `shared/war/patrols.ts`: per territory a deterministic loop Hold → standards → Hold (tile BFS inside the land + 2
  tiles, no corner cutting, line-of-sight simplified), built lazily per land (`patrolOf`), ~50 ms for all 31.
  `TROOP` numbers and `TROOP_LOOK` (art keys of each clan's painted soldier sheets, `war_*`, since the soldier art PR).
- `client/src/warTroops.ts`: look only. Three soldiers of the holder walk the loop near the hero, phase from wall
  time (same on every client), pauses at each stop; the lead carries the clan pennant. A flip fades squads over; a
  siege turns the patrol into attacker/defender pairs clashing at each standard. Hidden underground.
- Next: own trooper sheets (tabards) for Wardens/Redfang/Veiled; later interactive server troops (fight monsters and
  enemy-sworn heroes; needs sims and bench).

## M2: Armies and forts (2026-11-14, Murat: "three troops is light", "holds look terrible")

- `TROOP`/`SIEGE_FIGHT` in `shared/war/patrols.ts`: columns of 8 two abreast with an officer, 4–6 guards round the
  Hold (`garrisonSpots`), sieges as 8 v 8 lines per standard with falls and reinforcements (`siegeLife`), fewer
  defenders when control is low. Sprites are created and destroyed per land when a squad's signature changes (`client/src/warTroops.ts`, ≤ 40 near a siege).
- Review fixes: Holds are baked to PNG (`tools/art/holds.ts`, also run by `npm run art` -> `client/public/assets/holds/`,
  ~700 KB) and loaded lazily per clan by `client/src/holdAssets.ts` when a Hold is within 1100 px of the hero; the
  painter (`holdArt.ts`) is art-time only. Guards (`garrisonSpots`) and patrols start outside the fort
  (`HOLD_FORT_PX` in `shared/war/standards.ts`; patrols begin at a spot by the front gate, not the Hold centre).
  `buildHolds` needs the inner 5x5 free of solid tiles (only the outer ring relaxes); Old Watchtower's fort overhangs
  its land's edge by 2 tiles, five others by 1.
- `client/src/holdArt.ts` rebuilt with the iso painter: ~7-tile forts/camps per clan (Warden palisade fort, Redfang
  war camp, Ossuary bone keep, Hide-Kin burrow earthworks, Veiled walled shrine), ground + standing layer
  (`holdKeys`, `paintHoldLayers`, art-time); preview `tools/art/preview/holds-sheet.ts`. `buildHolds` clears a 7×7 area.

## M2: troops fight (2026-11-14)

- Server troops: a land wakes when a hero above ground is within `WAR_TROOPS.wakeTiles` (34) of its rect. Its holder's
  column (`patrolCount`) and Hold guards (`garrisonCount`, both by control; during a siege the column stands down and
  only the guards stay) appear as real monsters of kind
  `"trooper"`, the clan in `Mob.weapon` (`"redfang"`, `"redfang*"` for the captain), so no schema change. Lands nearest
  the heroes come first, `maxTroops` 80 per room (bench). A land sleeps a minute after the last hero left; the fallen come
  back at the Hold gate after a minute; a flip replaces the whole force (`server/warTroops.ts`, rules and numbers in
  `shared/war/troops.ts`).
- AI: march the shared patrol loop in rank (`columnLead`, same phase as the old cosmetic squads), guard the posts, pick a
  foe every 400 ms: heroes sworn to other clans, their creatures, troopers of other clans, and wild monsters inside the
  land + 2 tiles that no hero they leave alone (or that hero's creature) is fighting: troops never steal a neutral's or
  an ally's kill. No elites, bosses, quest monsters or Night Raiders, unless one struck a trooper first.
  Melee with a rush and a javelin (the javelin only hurts heroes that clan fights). Never in the safe squares, the
  stockade or monster-free ground; never newcomers under the oath level. Troopers farther than `livePx` from every hero
  just hold their place (no unseen fights, cheap).
- Room rules: one `canHurtMob` gate for every hero blow (AoE, shots, runes, shock arcs, Black Hole): only heroes the
  troops fight (`troopStance` "enemy") can hurt them; allies and unsworn heroes can't, so no fight starts by accident;
  no XP / loot / quest credit for troop kills, and a trooper's kill never announces a cleared zone; a sworn hero of another clan earns 1 valor (and renown) per kill in the
  land, at most 5 per war tick. Charm, Devour and Bite skip troopers; the village watch leaves them alone.
- Numbers: `troopStats` = MOBS.trooper × level curve × clan (`TROOP_COMBAT`: Wardens tanky, Redfang hard-hitting, Host
  slow and tough, Hide-Kin quick, Veiled strong) × captain (`TROOP_OFFICER`) × veteran ramp (`TROOP_VETERAN`, higher
  lands). Tuned with `npx tsx tools/balance/pve.ts --troops [--clans]`.
- Client: troopers are drawn with the painted soldier sheets (`trooperArt` → `warSoldierTexture`, an old monster look
  until loaded), fall frames 12/13, name "<Clan> soldier/captain" coloured by stance (ally green, neutral grey, enemy
  red); only enemy troopers take the attack cursor. The cosmetic column and guards are off while `WAR_TROOPS.live`;
  siege battles stay cosmetic.
- Next: siege battles with server troops; the class spread (summoners barely touched behind their golems, the
  Songweaver struggles against three at Lv 45).

## M2: War writs (2026-11-15)

- Rules and numbers: `shared/war/writs.ts` (`WRIT`), text: `shared/war/writText.ts` (2-3 lines per clan per kind in
  the leader's voice), server: `server/warWrits.ts` (`WarWrits` behind a narrow `WritHost`), client: the "War Writs"
  section of the bounty board panel and a tracker block (`client/src/bounty.ts`).
- Separate from bounties: a hero holds one bounty and one writ. Three kinds:
  - `rout`: kill 6-8 soldiers of another clan in land X (a target of the hero's clan, held by a rival, with a patrol);
    the killer must stand in X (`WarTroops.killed` now returns `{t, clan}` for such a kill, before the per-tick valor
    cap, so writs count past the cap).
  - `hold`: 5 full minutes at a standard of X (own border lands or targets), from `Presence.tick`'s new `onMinute`.
  - `clear`: kill 10 wild monsters (no troopers, summons, tide marchers, quest waves or quest monsters) of at least
    X's lowest level inside one of the clan's own lands X.
- Offers: `writOffers(war, clan, level, act, seed)`, up to 3, one land each, the board's act and the hero's level
  (`levels[0] <= L+3 && levels[1] >= L-5`); sieges the clan is in first, then highest pressure (takes the full
  `WarState`: pressure is not in the `WarView`). Seed = war tick + writs finished today (dropping does not reroll).
  Unsworn or under `STANDARD.minLevel`: a note, no offers.
- Pay at completion: gold `(12 + land level x 6) x goldMult` (land level = middle of its band), renown 15, valor 8 for
  the clan in X; gold and renown x `1 + WRIT.rally x max(0, 1 - lands / fair share)` (rally 0.5). No XP. 3 per UTC day.
- Withdrawn (no pay, not counted) when X changes hands (checked every war tick and on join) or the hero swears to
  another clan; the Herald says so in the hero's chat.
- Saves: optional `writ`, `writDay`, `writN` on `HeroSave`; plain fields on `Player` (no `@type`); `cleanWrit` drops
  junk, unknown kinds, a territory whose id no longer matches its name, and another clan's writ. Old saves load with none.
- Message contract: client -> server `"writ"`: `{}` | `{take: 0|1|2}` (at a board, sworn) | `{drop: true}`, anything
  else ignored, through `allow("ask")`. Server -> client `"writ"`: `{board?, offers?, active?, left?, note?, done?, err?}`.
- Next: caravans on supply roads.

## M2: Caravans (2026-11-15)

- Rules and numbers: `shared/war/caravans.ts` (`CARAVAN`), server: `server/warCaravans.ts` (`WarCaravans` behind a narrow
  `CaravanHost`, the escorts borrow `WarTroops.think / fight / walk`, refactored out of `WarTroops.step`), room wiring in
  `TownRoom.ts` (field, 1 s tick before the troops, trooper branch of `updateMob`, `hit`, `mobDied`, `forget`).
- Lines: `caravanLines(owner)` takes the edges of each clan's supply tree (the BFS of `supplyMap` from its held capitals,
  first parent wins) that lead to a border land, directed outward, same act only (the waygate link carries none). Takes
  the owner array only, so the client can call it with the `WarView`.
- Roads: `caravanRoute(a, b)` (lazy, cached; b -> a is the same road reversed) from a's Hold gate to b's (the patrol
  loops' `pts[0]`), a weighted 8-way tile search (road ground DIRT / COBBLE / BRIDGE cost 1, the rest 3) over both lands'
  bounding box + 3 tiles (+15 if that fails), never on solid tiles, dungeon door walls (open or shut), the safe squares,
  the stockade or monster-free ground; simplified with line of sight on fully open tiles. 14 of the 15 opening lines
  have a road (Saltwind Coast -> Brinewood is a fallback link across the map: none). No map edits.
- Clock: departure slot = `floor((now + caravanPhase(a, b)) / everyMs)` (7 min, phase from a hash of the ends), id
  `"a-b-slot"`, position = (now - departure) x `speed` (26 px/s) along the road; trips are 15-175 s, so one cart per road.
  Every room and client agrees; an unseen cart travels virtually.
- Spawn: a cart within `wakeTiles` (26) of a living hero above ground becomes real monsters, nearest first, at most
  `maxLive` (4) carts; carts claim 1 + `escorts` of `WAR_TROOPS.maxTroops` first (the troops get `maxTroops - reserved`).
  Back to virtual after `sleepMs` (30 s) with no hero near; the trip keeps the cart's wounds and its fallen escorts.
- Representation: no new MobKind, no schema change. The cart is a `"trooper"` with weapon `"<clan>^"` (`troopWeapon(k,
  false, true)`, `parseTroop(w).cart`), HP = its clan's soldier HP x `hpMult` (5) at the destination's soldier level, no
  attack; it rolls exactly where the clock puts it (stun / knockback don't move it). All trooper gates hold: only
  rival-sworn heroes hurt it, no XP / loot / quest credit, charm / devour skip it, the watch ignores it. Patrol troopers
  never target carts. 3 escorts (plain soldiers, weapon `"<clan>"`) march in formation (one ahead, two behind on the
  sides), fight anything within `leashPx` (6 tiles) of the cart and wild monsters within `huntPx` (3 tiles); a hit on
  the cart turns idle escorts on the hero. Fallen escorts give no valor and are not replaced on that trip.
- Raided (a rival-sworn hero fells the cart): gold `20 + 5 x level` dropped at the cart (the normal gold drop), valor
  `raidValor` (8) for his clan in the land where it fell (the territory there, else the nearer end of the road) if the
  war lets that clan push there, and then renown `raidRenown` (10) for the killer and his sworn clan-mates within
  `helperPx`; a Herald line to the room and `sfx` `caravan_raided` `{id, x, y, by, from}`. Felled by anything else: lost.
  The escorts fight on `scatterMs` round the wreck, then go.
- Delivered: a sworn hero of the cart's clan within `escortPx` (6 tiles) for at least `escortShare` (50%) of the trip,
  and the destination still the clan's: valor `deliverValor` (8) there, renown `escortRenown` (10) for each such hero, a
  Herald line to them and `sfx` `caravan_delivered` `{x, y, clan, t}`. With no hero escort nothing happens.
- Outcomes live in memory for the process (shared by its rooms), so a raided cart never respawns on wake nor rolls on
  in another room; nothing is saved (the war save and `fits()` are untouched).
- Balance (`npx tsx tools/balance/pve.ts 40 --caravan`, the hero alone vs cart + 3 escorts of its level, win = cart
  felled within 120 s): Lv15 wizard 95% / vampire 90% / summoner 73% (slow) / songweaver 80%; Lv30 100/80/100/78%;
  Lv45 73/83/93/28% (the Songweaver's known trouble with three soldiers at Lv 45).
- Client: real carts use their own sheets (`war_cart_<clan>`, `trooperArt` in `textures.ts`; walk, idle, frame 12 hurt, 13 wreck in `TownScene.trooperFrame`), name "<Clan> supply cart"; sounds `caravan_raided`, `caravan_delivered`.
- Several rooms: only "raided" / "delivered" settle a trip for every room (a cart felled after another room settled it pays nothing); an unescorted arrival in one room does not block a delivery in another.
- Not done: `escort` / `raid` writ kinds (the writ board), virtual carts on the war table, building all roads at boot (first use costs 10-75 ms per road).
- Next: escort and raid writs; caravans feeding the war's supply.

## M2: Caravan writs (2026-11-15)

- Two more writ kinds on the same board, same 3-per-UTC-day cap and the same pay path (`writPay` at the writ's land,
  `WRIT.escortN` / `WRIT.raidN` = 1 in the writ table): `escort` and `raid`. A writ of either kind carries an optional
  `road: {a, b, from, to}` (the caravan line, ids and names), so saves reuse `writ` / `writDay` / `writN` with no new
  field; `cleanWrit` checks both ends' names, `t` one of the ends and one act, and drops a broken road. Old saves load
  unchanged; land writs never carry a road.
- Offers: `writLines(s, k, kind)` from `caravanLines(owner)`. Escort: the clan's own lines, `t` = the destination
  (valor goes there). Raid: another clan's lines with an end the clan holds or can target (the raid valor's legal rule,
  on `targetsOf`), `t` = that end (destination first). The level and act filter is on `t`, like the other kinds; one
  land and one line per offer; a line with no road is skipped at the pick (only the two best candidates have their road
  built). Same seed (war tick + finished today), so offers stay deterministic. No line: no writ of that kind.
- Completion: `CaravanHost.writ?(hero, kind, line)` (TownRoom forwards it to `WarWrits.caravan`). Escort: fired in
  `arrive()`'s delivered loop for each hero who earned the escort renown (sworn to the cart's clan, in the room, in
  `names`). Raid: fired in `killed()` for the killer only, once the outcome is "raided" (the killing blow), whatever the
  land's valor did. Raid matches the **line** (both ends and its clan), not any cart of the clan, so a writ reads as one
  target like the land writs.
- Withdrawn (no pay, not counted) when the writ's land changes hands (`holder` = the line's clan) or, on a war tick or
  join, when its line no longer runs in `caravanLines`.
- Text: three leader lines per clan per kind (`{from}`, `{to}`); the board and tracker show the road "A to B"
  (`writWhere`).

## Tuning: troops vs classes (2026-11-15)

- `TROOP_VETERAN.dmg` 0.05 -> 0.025 (Lv45 soldier damage x2.85 -> x1.93 over `mobScale`), `CARAVAN.hpMult` 5 -> 4.
- `pve.ts 40 --troops` Lv45 x3, before -> after (win %): wizard 88 -> 98, vampire 78 -> 90, summoner 95 -> 100,
  songweaver 33 -> 83. Caravan Lv45: 68/75/93/28 -> 88/85/100/70.
- Summoner stays easy against troops: golems take the troopers' hate (Guardian moves it to the golem, `AGGRO.hitBase`
  beats `heroBonus`), on the server as in the sim. Left as is; a golem-vs-trooper rule would be its own change.

## M2: Siege battles (2026-11-15)

- Rules and numbers: `shared/war/siege.ts` (`SIEGE_BATTLE`, pure `siegeFronts`, `attackAxis` (moved from the client's
  painted battles), `siegeApproach`, `siegeForce`, `frontStep`, `frontPay`); server: `server/warSieges.ts` (`WarSieges`
  behind a narrow `SiegeHost`, the soldiers borrow `WarTroops.think / fight / walk / speedOf / seen` like the caravan
  escorts); room wiring in `TownRoom.ts` (field, 1 s tick between the caravans and the patrols, trooper branch of
  `updateMob`, `hit`, `mobDied`, `forget`, the join message). No schema change, no save change.
- Fronts: each standard on the besieged land's patrol loop, then the Hold gate (`patrolOf(t).pts[0]`). No order between
  them. Attackers come in at the approach: the loop point inside the land farthest toward the attacker's nearest land
  (`attackAxis`), at least `gateKeepTiles` (8) from the gate when the land allows; they march along the loop to their
  front, so no one gets stuck behind a wall. Defenders stand at their fronts when the siege wakes, reinforcements walk
  out of the Hold gate.
- Forces: attackers `perFront` (4) per front, defenders `perFront x troopShare(control)`, at least `defMin` (2); empty
  places fill in a wave every `reinforceMs` (30 s). One live siege per room (the nearest a living hero above ground,
  within `wakeTiles` 24 of the land's rect), at most `maxSiegeTroops` (28). Budget order: caravans, then sieges
  (`WAR_TROOPS.maxTroops - caravans`), then patrols (`WarTroops` `reserved()` = caravans + sieges), so the total never
  passes `maxTroops` (80). With no hero near nothing spawns and nothing changes; a live siege sleeps `sleepMs` (30 s)
  after the last hero left (troopers gone, front holders kept). The siege's end or a flip clears its troopers.
- Combat: plain trooper monsters (weapon `troopWeapon(clan, officer)`, the gate's first man on each side is an officer):
  every trooper gate holds (no XP / loot / quest credit, unsworn heroes neither hurt them nor get attacked, enemy-sworn
  heroes are attacked). The two sides fight each other through `pick`; wild monsters only when one strikes first
  (`hunt` is off); leash `leashPx` (6 tiles) round the trooper's place. A hit turns the idle mates of that front on the
  hero. Siege kills give no kill valor and do not count for rout writs (open).
- Front control: every `scoreMs` (2 s) per front, living non-cart troopers of either side + `heroWeight` (2) x active
  sworn heroes (level 5+, `STANDARD.idleMs`) within `frontRadiusPx` (96). A front changes holder only after one side led
  by `holdMargin` (2) or more for `captureMs` (20 s) straight (`frontStep`). Hold guards near the gate count for the
  defender. A change sends `sfx` `siege_front {x, y, clan}` and the new `"siege"` view; the gate also gets a Herald line
  and the winning leader's line (`GATE_LINES` / `gateLine` in `shared/war/heralds.ts`, took and took back).
- War effect: every `valorEveryMs` (60 s) each front's holder gets `frontValor` (2; the gate x `gateMult` 2) through
  `addValor`, only if one of its sworn heroes was active in that ring during the minute (troops alone earn nothing), at
  most `battleValorPerTick` (20) per clan per land per room per war tick, and only where the war lets that clan fight
  (owner, or `targetsOf`). The war rules then decide what it is worth.
- Message: server -> client `"siege"` `{t, fronts: {x, y, gate, holder}[]}` on wake, sleep, end, each front change and
  on join (`t: -1`, no fronts, when none). Nothing comes back from the client.
- Client: `warTroops.ts` draws no painted battle on the land with a live server siege; `warStandards.ts` tints the
  front rings by holder; `warPlaque.ts` adds "Fronts n/m <clan>"; `sfx.ts` `siege_front` (a war-horn blast with drums).
- Balance (`npx tsx tools/balance/pve.ts 40 --siege`, the hero + 4 allied soldiers vs 4 attackers of its level at one
  front; cell = win% / hero HP lost / s / allies lost):

| Lv | soldiers alone | wizard | vampire | summoner | songweaver |
|---|---|---|---|---|---|
| 15 | 50%/-/23.6s/2.5 | 100%/0%/11.3s/0.0 | 100%/27%/6.6s/0.0 | 100%/12%/11.5s/0.0 | 100%/0%/12.8s/0.0 |
| 30 | 73%/-/20.2s/1.9 | 100%/0%/8.0s/0.0 | 98%/23%/4.7s/0.0 | 100%/6%/5.8s/0.0 | 100%/0%/11.2s/0.0 |
| 45 | 48%/-/17.3s/2.5 | 100%/0%/8.5s/0.0 | 95%/24%/5.1s/0.0 | 100%/7%/5.1s/0.0 | 100%/0%/10.7s/0.0 |

- Bench (`WAR=1 SPREAD=1 npm run bench`, 5 bots, a shared machine at load 5-6, so noisy): before 9.6 / 9.9 ms tick avg
  (p95 21.9 / 20.5), after 10.0 / 6.6 (p95 22.2 / 13.3); with `SIEGE=1` (a siege at an Act 1 land, a bot at its gate)
  7.9 / 13.6 (p95 16.6 / 30.0), 20-21 siege troopers inside the 80-trooper cap (patrols yield). No dropped bots.
- `npx tsx tools/balance/war.ts 200 30`: unchanged (no player valor in the sim).
- Not done: kill valor and rout-writ credit for siege kills; virtual sieges in other rooms do not share front holders
  (each room keeps its own, in memory); siege works for the Host (roadmap "later").

## M2: Tabards (2026-11-15)

- Other players see a hero's oath and Renown rank. The Player schema is full (64 fields), so it goes by message, no
  schema change, no save change: server -> client `"oaths"` `{full?: true, o: {sessionId: [clanKey, rankIndex]}, gone?:
  sessionId[]}` (`Oath` / `OathsMsg` in `shared/war/renown.ts`). Unsworn heroes are never listed. Nothing comes back.
- Server: `server/warOaths.ts` (`WarOaths` behind `OathsHost`) keeps what every client was last told and diffs: the room
  calls `sync()` in the 1 s war interval (so renown from standards, troop kills, writs and caravans all reach it without
  hooks), right after a `"clan"` oath, and on join before sending the joiner `full()`; `leave(id)` after the player is
  removed sends `gone`. Room wiring: one field and four calls in `TownRoom.ts`.
- Client: `client/src/warTabards.ts` (look only): an 8x11 px flag on a staff in the clan's cloth / trim / sigil left of
  the name tag (gilt finial from Banneret, rank 3), a clan stripe under the name, and the rank title (`rankTitle`: "Banneret of the
  Redfang", "Hero of the Marches, Hide-Kin"; none for Sworn) in the hero's title line, after a cosmetic title when both.
  Shown on the own hero too. Dead or hidden heroes show none. The banner cloths are dark, so the tag lightens them
  (`lift`) and outlines the flag; both images are drawn by the world-text camera (`__worldText`, `pixelgrid.ts`), crisp
  and unlit at night like the name.
- Why not a cloth on the body: hero bodies are painted HD sheets (96 px frames, per class, per facing, plus skill-move
  sheets) with no per-frame body anchors, so a code-drawn tabard would drift off the chest. A baked overlay per class
  and frame (like the gear overlays, `tools/art/gear.ts`) is the way if a body tabard is wanted later.
- Tests: `tests/waroaths-room.test.ts` (full map on join, delta on oath and rank up, nothing on an unchanged rank,
  `gone` on leave, unsworn not listed).
## M2: Siege works (2026-11-15)

- Rules and numbers: `shared/war/works.ts` (`SIEGE_WORKS`, pure `ramStep`, `ramPos`, `ramBlocked`, `ramSpeed`, `ramHp`);
  server: `server/warWorks.ts` (`WarWorks` behind a narrow `WorksHost`, owned by `WarSieges`, the crew borrow
  `WarTroops.think / fight / walk` like the caravan escorts). Room wiring: `sieges.killed(id, killer, m)` and a `ranked`
  hook on the siege host; nothing else in `TownRoom.ts`. No schema change, no save change.
- Parts: `parseTroop` now returns `part` (`soldier` / `officer` / `cart` / `ram`) and `object` (cart or ram), keeping the
  `officer` / `cart` booleans. The ram's weapon is `"<clan>#"` (`troopWeapon(k, false, false, true)`), name "Ossuary Host
  bone ram". Every "not a fighter" check reads `object`: siege scoring, the patrols' `pick`, the client's art and frames.
- The ram: only while the live siege's attacker is `SIEGE_WORKS.clan` (the Host). HP = Host soldier HP at the land's
  soldier level x `ramHp` (4), no attack. It appears at `siegeApproach` and rolls along the patrol loop (the shorter
  way) to the gate front at `daySpeed` 14 / `nightSpeed` 24 px/s (`warPhase` 2). It stands still while a living
  defender trooper or an alive defender-sworn hero (above ground) is within `blockPx` (64; checked every `pickMs`). Stun
  and knockback don't move it off its loop. `sfx` `ram_at_gate {x, y}` once when it arrives. Two crew (plain `"host"`
  soldiers) walk behind it on either side and fight within `leashPx` of it; fallen crew are not replaced while that ram
  lives; after a wreck they stay round the wreck until the next ram or the siege's sleep.
- Gate weight: at the gate front it adds `ramWeight` (3) to the attacker's count in `score()` (`extraWeight`); that is
  more than `holdMargin`, so an undefended gate falls to the ram alone after `captureMs`. It pays only through the
  existing `frontStep` / `frontPay` (so a Host hero must still be in the ring for valor).
- Wrecking: the trooper gates hold (only rival-sworn heroes hurt it; unsworn and Host-sworn heroes deal 0, no XP / loot /
  quest credit). Any wreck sends `sfx` `ram_wrecked {x, y}` and the new `"siege"` view. Felled by a defender-sworn hero
  (oath level): `wreckValor` (6) for the defender in that land through `WarSieges.payClan` (legal-gated like the front
  pay, inside the same `battleValorPerTick` cap), `wreckRenown` (10) for the killer (renown even when the cap ate the
  valor), and a Herald line. A third clan's wreck pays nothing. One ram per siege per war tick: after a wreck no new one
  until the war tick changes; then a fresh, whole ram at the approach.
- Sleep keeps the ram's place along the loop, wounds and arrival; the siege's end forgets it.
- Budget: the ram and its crew are reserved inside `maxSiegeTroops` (`siegeForce(fronts, control, budget, reserve)`,
  reserve 3 for a Host siege, also after a wreck so the force does not jump), so totals stay within `maxTroops`.
- Message: the `"siege"` view gains an optional `ram: {x, y, hp, maxHp, state}` (`rolling` / `held` / `gate`), sent on
  spawn, wreck, and when the state or the HP quarter changes (checked once a second). Server -> client only.
- Client: the ram uses `war_ram_<clan>` through `warSoldierTexture` (asset `mob_war_ram_host.webp`, the carts' 14-frame
  layout, painted by `tools/art/paint/warRam.ts`); while the art manifest does not list it, `trooperArt` falls back to the
  clan's cart sheet. Cart idle / stagger frames apply to the ram. Sounds `ram_wrecked` (bone crack and timber crash) and
  `ram_at_gate` (a hollow boom on the gate). The plaque's fronts line adds "· Ram rolling / held / at the gate n%".
- Balance (`npx tsx tools/balance/pve.ts 40 --siege`, new ram table: the hero alone vs the ram + 2 crew of its level,
  win = ram wrecked within 120 s; cell = win% / HP lost / s): Lv15 wizard 100%/0%/57s, vampire 100%/1%/32s, summoner
  95%/0%/80s, songweaver 100%/0%/45s; Lv30 100/100/100/100% (38 / 24 / 44 / 44 s); Lv45 100/100/100/100% (45 / 25 / 36 /
  55 s). `ramHp` 6 took 33-100 s solo (summoner Lv15 70%), so 4. The siege-front table is unchanged by this work.
- Bench (`WAR=1 SPREAD=1 SIEGE=1 npm run bench`; the bench's siege land, Stonecrag Quarry, is besieged by the Host, so the
  ram rolls): before 7.68 ms tick avg (p95 12.3), 18 siege troopers; after 6.56 (p95 10.0), 23 incl. ram and crew;
  `SIEGE=host` (new: forces a Host-led siege) 8.55 (p95 14.6). Shared machine, noisy. No dropped bots.
- `npx tsx tools/balance/war.ts 200 30`: unchanged.
- A defender-sworn hero holds the ram only while active (`STANDARD.idleMs`), like at the fronts.
- Not done: works for other clans; a ram marker on the war table.

## M2: Tunnels (2026-11-15)

- Rules and numbers: `shared/war/tunnels.ts` (`TUNNEL`, pure `tunnelStrikes`, `tunnelMouth`, `tunnelPairs`, `mouthHp`);
  server: `server/warTunnels.ts` (`WarTunnels` behind a narrow `TunnelHost`, the soldiers borrow `WarTroops.think / fight /
  walk` like the caravan escorts). Room wiring in `TownRoom.ts`: field, 1 s tick between the sieges and the patrols,
  trooper branch of `updateMob`, `hit`, `mobDied`, `forget` (leave and death), the join message. No schema change, no save
  change, no rules.ts number changed.
- Orders: `server/war.ts` keeps the last tick's orders in memory (`warOrders()`, not saved; after a restart no tunnels until
  the next war tick) and their strikes, read on the state the tick started from (`warStrikes()`, exactly what `warTick`
  fed); a target the tunnel already won (now the striking clan's) gets no mouth. `tunnelStrikes(st, orders)` lists the attacks rules.ts feeds through a tunnel: a clan with the
  tunnel doctrine, a legal target (`targetsOf`, after `cleanOrders`) with a share, and none of its land next to it; `from`
  is its land two borders back with the best supply (the land rules.ts feeds the strike from). The test checks it against
  the attack force `warTick` actually puts on each target.
- Mouth spot: `tunnelMouth(t, from)` walks from the target's middle toward `from`'s middle to `edgeTiles` (4) short of the
  rect's edge, then takes the nearest tile (rings out to `searchTiles` 12, then the whole land) inside the rect, on the
  side facing `from`, with a free 3x3 (no solid tile, safe square, stockade, monster-free ground), no portal stone within
  6 tiles, no dungeon door within 2, at least `keepTiles` (4) from every landmark (`tunnelLandmarks`: NPCs and their props,
  every above-ground stair / rope incl. the sinkhole, crypt door and well-shaft, both waygates, the shrine, the bounty
  boards), clear of EVERY Hold's fort and EVERY standard's ring (territory rects overlap: Saltwind Coast holds Gullrock
  Cove) by 2 tiles, relaxed to 1 tile when nothing fits, and reachable on foot from the Hold gate (4-way flood inside the land + 2 tiles).
  Deterministic, cached per pair; all 120 possible pairs have one (~190 ms for all, first use).
- The mouth: a `"trooper"` with weapon `"hidekin~"` (`troopWeapon(k, false, false, false, true)`, `parseTroop` part
  `mouth`, an object), name "Hide-Kin tunnel". HP = Hide-Kin soldier HP at the land's soldier level x `mouthHp` (3), no
  attack, never moves or turns. All trooper gates hold: only heroes hostile to the Hide-Kin (sworn elsewhere, oath level)
  hurt it, no XP / loot / quest credit; patrol troopers never target it.
- Waves: a living hero above ground within `wakeTiles` (22) of a mouth opens it (`sfx` `tunnel_open {x, y}`) and
  `perWave` (3) plain Hide-Kin soldiers come out of it; another wave every `waveMs` (40 s), at most `maxTunnelTroops` (10,
  the mouth included) per room. Soldiers stand in a ring (`ringPx` 40) round the mouth and fight anything within
  `leashPx` (7 tiles) of it; wild monsters only when one strikes first. A hit on the mouth or a soldier turns the idle
  soldiers on that hero. One live tunnel per room (the one nearest a hero); it sleeps after `sleepMs` (30 s) with no hero
  near, keeping the mouth's wounds.
- Collapse: whoever deals the killing blow; `sfx` `tunnel_collapse {x, y}` always. A hero hostile to the Hide-Kin earns
  `collapseValor` (6) for his clan in the land if the war lets that clan fight there (owner or `targetsOf`, as
  `WarSieges.payClan`), and `collapseRenown` (10) himself either way, and a Herald line. The mouth stays shut until the
  next war tick (then whole again); its soldiers fight on `scatterMs` (6 s), then go. Collapses are settled for every room
  of the process (in memory, keyed by war tick and land, like the caravans' outcomes): another room's copy falls in at
  once and pays nothing.
- Holding: every `valorEveryMs` (60 s) that the mouth stands with an active (`STANDARD.idleMs`) Hide-Kin-sworn hero of oath
  level within `holdPx` (3 tiles), the Hide-Kin earn `mouthValor` (2) in the target land (legal-gated), at most
  `maxValorPerTick` (10) per land per room per war tick (the collapse valor goes through the same cap, per clan).
- Budget: caravans, sieges, tunnels, patrols. The tunnel gets `WAR_TROOPS.maxTroops - caravans - sieges` (capped at
  `maxTunnelTroops`) and drops soldiers (then the mouth) when that shrinks; the patrols' `reserved()` adds the tunnels. A
  mouth back after such a squeeze keeps its wave clock and plays no second `tunnel_open`.
- Message: server -> client `"tunnels"` `{mouths: {t, x, y, state}[]}` (`open` / `shut` / `dormant`) for every ordered
  tunnel, on change and on join. Nothing comes back. The client keeps it (`TownScene.tunnelMouths`); the war-table marker
  is not drawn yet.
- Client: the mouth uses `war_tunnel_hidekin` through `warSoldierTexture` (asset `mob_war_tunnel_hidekin.webp` from the art
  branch, 80x44, frames 0-5 idle loop, 12 hit, 13 rubble); while the art manifest does not list it, `trooperArt` falls
  back to the Hide-Kin cart sheet (standing frame). Sounds `tunnel_open` (earth breaking, clods, a muffled cry) and
  `tunnel_collapse` (timbers snapping, the roof coming down).
- Balance (`npx tsx tools/balance/pve.ts 40 --tunnel`, new table: the hero alone vs the mouth and its waves, win = mouth
  collapsed within 120 s; cell = win% / HP lost / s): Lv15 wizard 98%/7%/40s, vampire 100%/1%/22s, summoner 100%/0%/72s,
  songweaver 88%/16%/37s; Lv30 100/100/100/100% (26 / 16 / 22 / 29 s); Lv45 100/98/100/65% (28 / 17 / 18 / 27 s; the
  Songweaver's known trouble with three soldiers at Lv 45, as at the caravans). `mouthHp` 5 with waves every 30 s gave
  Lv15 summoner 40% (115 s) and Lv45 songweaver 28%, so 3 and 40 s.
- Bench (`WAR=1 SPREAD=1 npm run bench`, 5 bots, shared machine, noisy): before 6.83 ms tick avg (p95 10.3); after 4.98
  (p95 8.5), with the new `TUNNEL=1` (Hide-Kin ordered through a tunnel, a bot at its mouth) 6.36 (p95 9.4) with 4 tunnel
  troopers, `TUNNEL=1 SIEGE=1` 7.79 (p95 11.3), 20 siege + 4 tunnel troopers inside the 80 cap. No dropped bots.
- `npx tsx tools/balance/war.ts 200 30`: unchanged.
- Not done: a collapse cutting the tunnel's supply in the war rules (later); the war-table marker; tunnels for other clans.

## M2: Rituals (2026-11-15)

- Rules and numbers: `shared/war/rituals.ts` (`RITUAL`, pure `ritualSite`, `ritualSpot`, `ritualClear`, `ritualTime`,
  `ritualDay`, `ritualRate`, `channelStep`, `pauseStep`, `ritualPay`, `ritualLine`); server: `server/warRituals.ts`
  (`WarRituals` behind a narrow `RitualHost`, the acolytes borrow `WarTroops.think / fight / walk` like the caravan
  escorts). Room wiring in `TownRoom.ts`: field, 1 s tick between the tunnels and the patrols, trooper branch of
  `updateMob`, `hit`, `mobDied`, `forget` (leave and death), the join message. No schema change, no save change, no
  rules.ts number changed (`timeBonus` is now exported, unchanged).
- When: the Veiled's doctrine phase. rules.ts gives the ritual doctrine its bonus at phase 0 (noon), and
  `RITUAL_PHASE` reads it from `timeBonus`, so rituals run only while `warPhase(now)` is 0 (about 19 of the 30 minutes).
  One noon is one "day phase" (`ritualDay`: from dayFrac 0.965 to the next 0.965).
- Where: one site per day phase for every room of the process, picked from the war state the first time a room looks
  in that phase and then kept (so a war tick in the middle of noon does not move a half-done ritual): the land the Veiled
  besiege (attack; lowest Control, then lowest id), else their border land with the most `pressure` (defence; then the
  lowest id). Spot (`ritualSpot`): reachable on foot from the land's Hold gate (own flood, like the tunnel's), with a
  free 3x3 (no solid tile, safe square, stockade, monster-free ground), no dungeon door within 2 tiles, no portal stone,
  above-ground stair or rope (`LINKS`), sinkhole, crypt door, Undercity shaft, waygate or shrine within
  `entranceKeepTiles` (6), no NPC, NPC prop or bounty board within `npcKeepTiles` (4), and in EVERY pass the whole
  counting ring (`ringPx` 128, wider than the drawn circle, ~68 px) off EVERY Hold's fort edge and EVERY standard's ring
  (lands' rects overlap). Passes, nearest the land's middle: inside the rect by 2 tiles with a 5x5 free of solid tiles and
  one more tile of room; inside by 1 tile; the rect + 2 tiles. All 31 lands have one inside their rect (~0.2 s for all,
  first use, cached), e.g. Rimewater Hollow (241, 25), Old Ruins (140, 53), the Veiled Sanctum (241, 344). The spot
  helpers are the ritual's own, so tunnels.ts is untouched.
- The ritual: a living hero above ground within `wakeTiles` (22) wakes it: `acolytes` (3) plain `"veiled"` troopers
  at the land's soldier level stand on the circle (`postPx` 40) and fight within `leashPx` (6 tiles); wild monsters only
  when one strikes first. All trooper gates hold (only heroes hostile to the Veiled hurt them; no XP / loot). It sleeps
  `sleepMs` (30 s) after the last hero left, keeping its progress, the acolytes' wounds and the fallen. It channels for
  `channelMs` (240 s); each active (`STANDARD.idleMs`) Veiled-sworn hero of oath level within `ringPx` (4 tiles) adds
  `heroSpeed` (0.5), at most `maxHelpers` (3): 2.5x, 96 s. It needs at least one acolyte standing.
- Pause: count = rival troopers (not carts / rams / mouths) + `heroWeight` (2) x active hostile-sworn heroes in the
  ring, less 2 x active Veiled-sworn heroes. A count >= `pauseMargin` (1) for `pauseMs` (3 s) straight pauses it; a count
  <= 0 for `resumeMs` (5 s) straight resumes it; any break restarts the clock (`pauseStep`, like `frontStep`). Acolytes
  do not count: they fight.
- Completion: `ritualValor` (8) for the Veiled in the land through `addValor` if legal (owner or `targetsOf`), `sfx`
  `ritual_done {x, y}`, a Veiled Oracle line (`RITUAL_LINES`). The acolytes stay `lingerMs` (6 s), then go.
- Disruption: the 3 acolytes never come back in that day phase; the killer of the last one breaks it: `sfx`
  `ritual_broken {x, y}`, a Herald line, `disruptRenown` (10) for a killer hostile to the Veiled, and `disruptValor` (6)
  for their clan in the land if legal. A summon's kill counts for its owner.
- One outcome (done or broken) per land per day phase for every room of the process (memory, keyed `day:t`, like the
  caravans and tunnels): another room's copy ends the same way and pays nothing. Valor cap `maxValorPerTick` (10) per
  land per clan per room per war tick.
- Budget: caravans, sieges, tunnels, rituals, patrols. The ritual gets `maxTroops - caravans - sieges - tunnels` (at
  most 3) and drops acolytes when that shrinks; the patrols' `reserved()` adds the rituals.
- Message: server -> client `"rituals"` `{t, x, y, progress (0..1, 2 decimals), state: "channel" | "paused" | "done" |
  "broken"}` for the room's circle while it is awake; `t: -1` when none (noon over, nobody near). On state change at once,
  progress at most every `sendMs` (2 s), and on join. Nothing comes back.
- Client: `client/src/warRituals.ts` draws the circle as 2 px pixel blocks on a Graphics laid flat by the iso view: a
  dark disc in the Veiled cloth, two gold rings, eight runes turning slowly, a six-point star, a slow glow pulse (slower
  and blue-grey progress ring when paused), the progress ring outside it, gaps / grey / cracks when broken, a 1.2 s
  flare when done; nothing is drawn while the hero is more than 30 tiles away. `warPlaque.ts` adds "Ritual n%" (or "(paused)", "complete", "broken") in that land. Sounds in
  `sfx.ts`: `ritual_broken` (glassy crack, the chord falling apart), `ritual_done` (rising choir chord and bell), and a
  soft `ritual_hum` every 2.6 s within 9 tiles of a channelling circle.
- Bench (`WAR=1 SPREAD=1 npm run bench`, 5 bots, shared machine at load ~4, noisy, random spread): before 8.42 / 5.30 ms
  tick avg (p95 16.0 / 9.0), after 10.67 / 4.27 (p95 24.1 / 7.0); with the new `RITUAL=1` (the rituals' clock shifted to
  noon, a bot at the circle) 8.93 (p95 17.8), 3 acolytes channelling. No dropped bots.
- `npx tsx tools/balance/war.ts 200 30`: unchanged (only the run time line differs).
- Not done: a war-table marker; rituals for other clans; a completed ritual changing the war rules beyond valor.

## NL-1: Lands in the war map (2026-11-15)
Territories are grouped into the lands of the continent (design page v0.3), so a homeland can plug in later. Play is
exactly the same today: the golden fingerprint of the map (ids, names, borders, capitals, starting owners) and both war
sims are unchanged.
- `shared/war/regions.ts`: `REGIONS` (key, name, compass, `home`, `contains(tx, ty)`, `capitals`). Built: The Oakvale
  Lands (Act 1 via `actOfTile`, Wardens' home), The Sunscar (Act 2, Veiled home). Planned, no `contains` yet: The Grey
  Barrow Moors (Host, NE), The Red Badlands (Redfang, W), The Mawdeep Sinkholes (Hide-Kin, S), The Crown of the Marches
  (centre). A land is built when at least one territory lies in it. `contains` is checked in `REGIONS` order (first
  match wins): a new land's test must come before the acts' catch-all, or the acts' test must exclude it.
- Capitals moved from `CLANS.capitals` into the lands. Forward capitals (design page: "Clans whose homeland is not built
  yet hold a forward capital there"): Redfang Hollow, Greywatch Keep, Thornwood (Oakvale), Dustrider Camp, Kharsun and
  the Humpback Mesas (Sunscar). `capitalsOf(built)` drops a forward capital once its clan's homeland is built; Palmshade
  Oasis and Cinder Scar stay (the Wardens' and Veiled's capital in the other act is not forward on the design page).
  `Territory.forward` marks them for the plaque.
- `REGION_LINKS`: the Waygate (WAYGATE_OAKVALE <-> WAYGATE_DESERT) first; a link is live only when both lands are built.
  `linkPairs` / `LAND_LINKS` give the territory pair (the one nearest each end): Stonecrag Quarry <-> The Glasswind Flats.
- `territories.ts`: `buildTerritories(zones, regions, links)`; each territory has `region` (and keeps `act`). Borders,
  `minNeighbours` and the "same land" check of `initialOwners(ts)` work per land. Caravan lines and routes, and caravan
  writ roads (`writs.ts`, a deviation from the plan: same rule, same result today), stay inside one land. The writ board's
  `act` filter (where the hero stands) is unchanged.
- Saved war (`server/war.ts`): still `v: 1`, now with `names` (territory names in id order). `migrateWar(saved,
  oldNames, names)` remaps owner, Control, forts, sieges, pressure, the leaders' targets / feints (also ids, not in the
  plan) and the log by name. A new territory starts with its capital's clan, else its land's home clan, else the clan
  holding most of its neighbours, at Control 100; a removed one is dropped with its log lines; a capital always starts
  with its clan. A save without `names` of today's size loads unchanged (the live save on deploy); one of another size
  cannot be mapped and restarts like a malformed one (old save kept aside as `war-old-<ms>`). When the names changed, the
  old save is kept aside too and the remapped war goes on.
- Client: the war table draws a dashed box around each land with its name upright at the top corner (Pixelify Sans),
  a dashed blue line for the Waygate, and a legend row per land with each clan's count there. The plaque's title adds
  " · <land>" and says "(forward capital)" where it applies. Cosmetic only.
- Tests: `tests/warregions.test.ts` (golden fingerprint, 21 / 10 per land, one cross-land border = the Waygate, a fake
  Grey Barrow Moors plugged in through `buildTerritories`, `migrateWar` cases, load paths); `tests/warlive.test.ts` save /
  load round trip with names.
- Sims (`npx tsx tools/balance/war.ts 200 30`, and `--clever=host`): identical before and after but for the run time.
- Not done: a land's own map, zones and capitals (the homelands themselves); the Crown.

## NL-2: Grey Barrow Moors, Cairnwatch quests and words (2026-11-15, moors PR2)
- Quest chain `moors` ("The Grey Barrow Road", `MOOR_QUESTS` in `shared/quests.ts`) is a zone arc (`ZONE_ARCS`, last entry:
  local giver, later quests `auto`, each ends in the field with an `outro`, no report-back). It costs no Player field: it
  lives in the shared `quests` map under `moors`. Given by Warden-Captain Edra Vane (`cairncaptain`), Lv 20-35, rewards from
  `arcReward` like the Act 1/2 arcs (a boss fight counts half a level's XP). Eight quests: The Cairns Are Open (Grey Ring,
  Lv 20), Candles in the Mire (Sorrow Mire, 22), Thane's Rest (23), The Cairn-Lord (Cairnfield, 25, Maelgar), Lamps on the
  Black Water (Blackwater Fen, 26), The Nine Widows (29), The Road to Kingsbarrow (31), The Barrow-King (33; Aldric
  Hollowcrown, Lv 35, `night: true` summon in the Barrow-King's Mound). Both summoned bosses talk (`BossVoice`).
- Two new quest items, `candle` (Corpse-Candle) and `barrowkey` (Barrow-Key); the client draws drops as `q_<id>`.
- Edra's idle line and the herbwife's and armourer's shop greetings reworded. Nothing in `npcs.ts` but the existing text.
- Signposts: `buildMoors` returns `posts` (local tiles); `shared/map.ts` sets each beside the nearest road like the desert's.
  `tools/map-metrics.ts`: the moors stay 100% reachable.
- Tests: `tests/moors-quests.test.ts` (shape, and the whole chain start to finish), `tests/zone-arcs.test.ts` now reads the
  act from the giver's tile (Act 3 levels 20-36).
- Not done: Weeping Stones, Drowned Hollow and the Host's Muster have no quest; the war land (Host territories) is still to come.

## NL-3: the Grey Barrow Moors at war (2026-11-15, PR #442)
The moors are the first homeland built after the acts: the Host fights from home.
- `shared/war/regions.ts`: "moors" (The Grey Barrow Moors, NE, home `host`) now has `contains: actOfTile === 3` and one
  capitals: the Host's seat at **The Host's Muster** (its war camp, `HOST_CAMP`, far east) and the Wardens' **The Grey
  Ring** (the Cairnwatch garrison's ring by the outpost, not forward: like Palmshade Oasis in the Sunscar). `REGION_LINKS` gains **The
  Barrowgate** (`MOORSGATE_OAKVALE` <-> `MOORSGATE_MOORS`): Rimewater Hollow <-> Sorrow Mire.
- With the homeland built, `capitalsOf` drops the Host's forward capitals (Greywatch Keep, Kharsun): ordinary
  territories now. Redfang's and the Hide-Kin's forward capitals stay.
- Sanctuaries: `isSanctuary` also counts a zone whose only spawns are bosses as a lair (the Barrow-King's Mound; no other
  zone is boss-only, so Acts 1-2 do not move). Cairnwatch lies outside every zone; the open moor is `wild`.
- 42 territories: Oakvale 21, Sunscar 10, moors 11 (ids 31-41; Acts 1-2 keep ids 0-30, so active writs keep their ids).
  Golden fingerprint in `tests/warregions.test.ts` refreshed on purpose.
- Saved war: the existing `migrateWar` does it by name: old territories keep holder, Control, forts, sieges, pressure,
  the leaders' targets and the log; the moors territories start at Control 100 with the Host (home clan), but the Grey Ring with the Wardens (a capital
  always starts with its clan);
  the former forward capitals keep their holder (no capital override). `server/war.ts` `PRE_MOORS_NAMES` (frozen) lets an
  **unnamed** save of the old size (31) be remapped too instead of restarting. The old save is kept as `war-old-<ms>`.
- Writs: the Cairnwatch board (act 3) offers moors writs; carts and writ roads stay inside one land (no cart through a gate).
- Client war table: each link is drawn from its territory to the gate in each land (one straight line would cross the
  Sunscar band), with a diamond and the link's name at each gate. Land labels just above the canvas are pulled into it.
  Screenshots: `clan-war/war-moors-1920.png`, `-1366.png`.

Sims (`npx tsx tools/balance/war.ts 200 30 [--clever=host]`):

| clan | before avg / most | moors, Host only | final (with the Wardens' Grey Ring) |
|---|---|---|---|
| Wardens | 23.8% / 29.0% | 21.0% / 23.8% | 21.6% / 23.8% |
| Redfang | 24.7% / 29.0% | 19.0% / 21.4% | 21.9% / 28.6% |
| Ossuary Host | 12.0% / 19.4% | 26.3% / 31.0% | 21.4% / 23.8% |
| Hide-Kin | 17.8% / 22.6% | 15.6% / 26.2% | 15.7% / 21.4% |
| Veiled Circle | 21.7% / 25.8% | 18.2% / 21.4% | 19.3% / 21.4% |

- Flips per war day 7.33 -> 2.04; domination 0.0% throughout. Host ruse: 12.9% vs 12.0% before; 22.7% vs 21.4% final
  (domination 0.0%): the ruse pays.
- With the moors all the Host's (first try) the Host went from smallest to largest (26.3%) and its ruse lost land
  (21.1%): it held its 11 moors and nothing outside, the moors meeting the rest only at the Barrowgate. The Wardens'
  Grey Ring capital (orchestrator's call, 2026-11-15) gives the other clans a foothold in the moors and fixes both.
  Capitals for all four other clans in the moors overshot (Host 11.7%, ruse no gain).
- Open: the moors' war is quiet (one gate, one owner); Weeping Stones / Drowned Hollow / Host's Muster still have no quest.

## M2: Night Raiders hunt the leading clan; Rally for the weakest (2026-11-15)

- Rules and numbers in `shared/war/rules.ts` (`WAR`), so the live war and `tools/balance/war.ts` run the same brakes:
  - `huntedClan(owner)`: a clan over `leaderShare` (30%, ahead of the next), or at least `huntShare` (26%) and `huntLead`
    (2) territories ahead of every other. `nightRaid(s, phase)`: by night (phase 2) the Night Raiders strike `huntLands`
    (2) of its non-capital border lands, weakest Control first (then most pressed, then lowest id): each loses
    `huntControl` (4) Control, and the hunted army loses `raidersHit` (3%, as before, which used to need over 30%).
  - `rallyClan(owner)`: the clan with the least land when that is under `rallyBelow` (0.8) x a fair share; a tie goes to
    CLAN_KEYS order (the smaller army would hand it back and forth). Its heroes' valor counts `rallyValor` (1.3) in
    `warTick` before `valorForce` (so `valorCap` still caps a crowd); renown at standards and for troop kills grows
    `rallyRenown` (1.25) times (`rallyRenown()` in `server/warHeroes.ts`, `server/warTroops.ts`); its writs pay
    `WRIT.rallyClan` (1.25) times on top of the old underdog bonus (`writRally`). The income rally (`WAR.rally`) is unchanged.
- Live (`server/war.ts`): `tickOnce` reads `nightRaid` before `warTick` (like the tunnel strikes) and keeps the struck lands
  in memory (`lastRaided`, not saved). Listeners get a third argument `WarNews` `{raid?, rally?}`; `attachWar` sends a
  Herald line and `warraid` `{clan, ts}` for a raid, a Herald line when the Rally passes or ends. The room tells sworn
  heroes of the newly rallied clan what it means (`rallyTell`), and on login. `WarView` gained optional `hunt`, `raided`,
  `rally` (message only, no schema field). The writ board view has `rally: true` for the rallied clan's sworn.
- In the room the riders hunt too: `NIGHT_RAID.huntPrey` (0.35) extra prey score for the hunted clan's sworn heroes and
  its soldiers and carts (`raiderPrey`).
- Client: `warraid` -> horn and notice in a struck land (`warNotice.ts`, the existing horn), plaque line ("Night Raiders
  struck here" / "The Night Raiders hunt its holder" / "Rally for ..."), war table: violet dashed ring on struck lands,
  "hunted" / "Rally" after the clan in the legend; bounty board: a Rally line over the writs. No new sfx `ev`.
- Saves: none changed. Schema: none changed.
- Sim, 200 wars x 30 days, no players, before -> after (avg / most land): Wardens 21.6/23.8 -> 21.7/26.2, Redfang
  21.9/28.6 -> 21.9/28.6, Host 21.4/23.8 -> 21.4/23.8, Hide-Kin 15.7/21.4 -> 15.7/21.4, Veiled 19.3/21.4 -> 19.4/21.4;
  flips 2.04 -> 2.00 a day; domination (one clan over 30% for over 3 days) 0.0% -> 0.0%. The Raiders hunt on 4.5% of
  night ticks (always Redfang); the Rally is on 43.5% of ticks for the Hide-Kin, 5.8% for the Veiled.
  Ruses (`--clever`), clan's land with the ruse before -> after: Host 22.7 -> 22.6%, Redfang 21.2 -> 21.2%, Hide-Kin
  15.6 -> 15.6%, Wardens 19.5 -> 20.1%; domination 0.0% throughout.
- New sim flags: `--zeal=<clan|all>[:valor]` (sworn heroes add that valor a tick at the clan's main target) and
  `--old-brakes` (the brakes before this change) to see the brakes with players. 100 x 30, old -> new brakes: Redfang
  carried by players (30 valor) 24.6% -> 24.2%, hunted on 25% of nights; a crowd for Redfang (200) 25.0% -> 24.5%; every
  clan's heroes alike (30 each): Hide-Kin 14.9% -> 15.5%, Redfang 24.5% -> 24.1%. Flips per day rise with the brakes on
  under zeal (5.8 -> 7.7): the struck borders change hands more. Domination 0.0% in every run.
- Open: the exit criterion "live" needs days of live play to check (the live war runs the same rules). The brakes rarely
  bite without players (no clan gets far ahead); they matter once players carry a clan.

## NL-4: the Red Badlands, Rustwater Post quests and words (2026-11-15, badlands PR2, PR #445)
- Quest chain `badlands` ("The Redfang Road", `BAD_QUESTS` in `shared/quests.ts`) is a side arc, the last entry of
  `SIDE_ARCS`, not a zone arc: the client sends chain indices, so nothing before it moves. Local giver (Marshal Hesk
  Varro, `rustmarshal`), later quests `auto`, each ends in the field with an `outro`. No Player field: it lives in the
  shared `quests` map under `badlands`. Rewards from `arcReward` like the moors chain.
- Eight quests: Salt on the Wind (Saltlick Flats, Lv 25), The Drovers' Draw (26), Tally-Stones (Hanging Arches, 27), Fire
  in the Pits (Cinnabar Pits, 28), The Hawk of Bloodstone Mesa (30; Dask Morrow, redcaptain summon Lv 32), Talon Fort (32),
  Gallows Canyon (35), Old Rourke (37; `rourke` summon Lv 40 in Fangrock Keep, hpMult 2, no night). Both summoned bosses
  talk (`BossVoice`). Only existing object kinds (`clue`, `cairn`, `nest`) and no new quest items, so no new art.
- Loot: Old Rourke's gold, potions and gear already come from `LOOT` / `GEAR_DROP`; the summoned one drops them like the
  Barrow-King. No chest logic added.
- Marshal Varro's idle line reworded. The armourer's and healer's shop greetings (`shared/shops.ts`) were already written.
- Tests: `tests/badlands-quests.test.ts` (shape, and the whole chain start to finish).
- Not done: Vulture's Roost and Rattlesnake Gulch have no quest; the war land (Redfang territories in Act 4) is still to come.

## NL-5: the Red Badlands at war (2026-11-15, PR #446)
The badlands are the second homeland at war after the acts: Redfang fights from home, as the Host does on the moors (NL-3).
- `shared/war/regions.ts`: "badlands" (The Red Badlands, W, home `redfang`) now has `contains: actOfTile === 4` and one
  capital, the Redfang seat at **Fangrock** (the clan's stockade in the far west). `REGION_LINKS` gains **The Red Pass**
  (`REDPASS_OAKVALE` <-> `REDPASS_BADLANDS`): Mirror Pond <-> The Saltlick Flats.
- With the homeland built, `capitalsOf` drops Redfang's forward capitals (Redfang Hollow, Dustrider Camp): ordinary
  territories now. Only the Hide-Kin's forward capitals (Thornwood, the Humpback Mesas) are left.
- Sanctuaries: Fangrock Keep is Old Rourke's alone (boss-only, a lair like the Barrow-King's Mound), the open badlands are
  `wild`. The Rustwater Post lies outside every zone (a no-mob area): a safe hub out of the war, like Cairnwatch.
- 52 territories: Oakvale 21, Sunscar 10, moors 11, badlands 10 (ids 42-51; Acts 1-3 keep ids 0-41, so active writs keep
  their ids): Saltlick Flats, Drovers' Draw, the Hanging Arches, the Cinnabar Pits, Bloodstone Mesa, Talon Fort, Vulture's
  Roost, Rattlesnake Gulch, Gallows Canyon, Fangrock. A new war starts 11/11/10/10/10 (Wardens, Veiled / Host, Hide-Kin,
  Redfang). Golden fingerprint in `tests/warregions.test.ts` refreshed on purpose.
- Saved war: `migrateWar` by name, as for the moors: Acts 1-3 keep holder, Control, forts, sieges, pressure, the leaders'
  targets and the log; the badlands start at Control 100 with Redfang (home clan; Fangrock its capital); Redfang Hollow and
  Dustrider Camp keep their holder. `server/war.ts` `PRE_BADLANDS_NAMES` (frozen, the moors-era 42) joins
  `PRE_MOORS_NAMES` in `OLD_MAPS`, so an unnamed save of either old size is remapped too (saves on the moors map are all
  named, so this is a fallback). The old save is kept as `war-old-<ms>`.
- Writs: the Rustwater board (act 4) offers badlands writs (it came back empty before). On a new war Redfang gets hold /
  clear writs at home, the Wardens raid writs over the Red Pass; clans with no way in get none there until they reach it.
- `shared/badlands.ts` (area:map): the "Talon Fort" area (and so its zone and territory) now takes 4 tiles of ground
  round the stockade, like Redfang Hollow's: the bare 18x14 stockade had no room for a war Hold (5x5 clear ground away
  from the standard's ring), and with no Hold no patrol, ritual circle or tunnel mouth. Borders, the golden fingerprint
  and the sims are the same either way; `tools/map-metrics.ts`: the badlands stay 100% reachable.
- Client: nothing new needed; the war table already draws every built land and link (a dashed box, the Red Pass's line
  from each territory to its gate with a diamond and the name) and the world map has an Act 4 view.
- `tests/warbrakes-room.test.ts`: the opening map no longer rallies for anyone (too even), so the Rally room tests build
  a war where the Hide-Kin lost land to the Wardens.

Sims (`npx tsx tools/balance/war.ts 200 30 [--clever=<clan>]`):

| clan | before avg / most | badlands, Redfang only (final) |
|---|---|---|
| Wardens | 21.7% / 26.2% | 21.3% / 25.0% |
| Redfang | 21.9% / 28.6% | 17.9% / 21.2% |
| Ossuary Host | 21.4% / 23.8% | 19.1% / 19.2% |
| Hide-Kin | 15.7% / 21.4% | 19.3% / 26.9% |
| Veiled Circle | 19.4% / 21.4% | 22.4% / 25.0% |

- Flips per war day 2.00 -> 3.21; domination 0.0% before and after. Night Raiders 4.5% -> 0.1% of night ticks; the Rally
  43.5% -> 8.0% of ticks for the Hide-Kin, 5.8% -> 0.2% for the Veiled.
- Unlike the moors, Redfang did not jump (it shrank: its Oakvale and Sunscar land went to the others at the start), so no
  foothold capital for another clan was added. Ruses, with vs without: Redfang 18.4% vs 17.9% (pays; before 21.2 vs 21.9),
  Host 19.2 vs 19.1 (before 22.6 vs 21.4), Hide-Kin 18.3 vs 19.3, Wardens 18.2 vs 21.3, Veiled 20.0 vs 22.4; domination
  0.0% in every run.
- Open: like the moors, the badlands meet the rest at one gate, so their war is quiet; Vulture's Roost and Rattlesnake
  Gulch still have no quest.

## NL-6: the Mawdeep Sinkholes, Ropewell quests and words (2026-11-15, sinkholes PR #448)
- Side arc `sinkholes` ("The Rope and the Maw"), last in `SIDE_ARCS`, from Lodge-Warden Brannoc Tull (`ropewarden`): Rootfall
  Rope (Lv 30), Hollowbrook Laughter (31), The Old Warren (32), the Hide-Chieftain of Tunneltop (34, talking summon
  Gorrow Splitear), Mosslight Snares (35), Over the Pitfields (36), Hidehall (40), The Maw-Father (42; the talking
  `mawfather` summon, Lv 45, own, no night: he is awake day and night).
- The chain ties to Act 1's Hide Rite: the trappers' kin were taken into the warrens. Warden idle line added; the two
  Ropewell traders already had shop greetings. Test: `tests/sinkholes-quests.test.ts`.
- Open: the sinkholes' war land; Gnawed Bank, Scratchroot Burrows and Rushmere Hollows have no quest.

## NL-7: the Mawdeep Sinkholes at war (2026-11-15, PR #449)
The sinkholes are the third and last homeland at war: the Hide-Kin fight from home, as the Host does on the moors (NL-3)
and Redfang in the badlands (NL-5).
- `shared/war/regions.ts`: "sinkholes" (The Mawdeep Sinkholes, S, home `hidekin`) now has `contains: actOfTile === 5` and
  one capital, the Hide-Kin seat at **Hidehall** (their warren town in the far south-east). `REGION_LINKS` gains **The
  Sinkway** (`SINKWAY_OAKVALE` <-> `SINKWAY_SINKHOLES`): Sunken Lake <-> Hollowbrook Dells.
- With the homeland built, `capitalsOf` drops the Hide-Kin's forward capitals (Thornwood, the Humpback Mesas): ordinary
  territories now. **No forward capitals are left** (tested); the rule stays in `capitalsOf` for lands to come (the
  fake-land test in `tests/warregions.test.ts` still checks it).
- **Footholds** (orchestrator's target: no clan above ~23% average): with every forward capital gone, Oakvale and the
  Sunscar were the Wardens' and the Veiled's alone, and the Veiled grew to 27.0% (hunted by the Night Raiders on 59% of
  nights), the Wardens to 24.1%. Two Oakvale capitals that are not forward (they stay, like the Wardens' Grey Ring): the
  Host's at **Stormbreak Crags**, Redfang's at **Heronwreck Strand**. A foothold near Ropewell (the remedy planned for
  a Hide-Kin jump, which did not happen) only took land from the Hide-Kin and left the Veiled at 27-28% (table below).
- Sanctuaries: the Great Maw is the Maw-Father's alone (boss-only, a lair), the open sinkholes are `wild`. Ropewell lies
  outside every zone (a no-mob area): a safe hub out of the war.
- 62 territories: Oakvale 21, Sunscar 10, moors 11, badlands 10, sinkholes 10 (ids 52-61; Acts 1-4 keep ids 0-51, so
  active writs keep their ids): Rootfall Slopes, Hollowbrook Dells, the Old Warren, Tunneltop, Mosslight Fen, the
  Pitfields, the Gnawed Bank, Scratchroot Burrows, Rushmere Hollows, Hidehall. A new war starts 12/15/15/10/10 (Wardens,
  Redfang, Host, Hide-Kin, Veiled); the Wardens now also claim Thane's Rest next to the Grey Ring. Golden fingerprint in
  `tests/warregions.test.ts` refreshed on purpose.
- Every sinkholes territory has a Hold (`SINK_LANDS` hold patches; `tests/warheroes.test.ts` checks one per territory).
- Saved war: `migrateWar` by name, as before: Acts 1-4 keep holder, Control, forts, sieges, pressure, the leaders'
  targets and the log; the sinkholes start at Control 100 with the Hide-Kin; Thornwood and the Humpback Mesas keep their
  holder. The footholds are capitals, so a save's holder there gives way to the Host / Redfang (Control 100, siege
  lifted; forts and pressure stay), as a capital always has. `server/war.ts` `PRE_SINKHOLES_NAMES` (frozen, the
  badlands-era 52) joins `OLD_MAPS`, so an unnamed save of that size is remapped too. The old save is kept as `war-old-<ms>`.
- Writs: the Ropewell board (act 5) offers sinkholes writs. On a new war the Hide-Kin get hold / clear writs at home, the
  Wardens raid writs over the Sinkway from Sunken Lake.
- Tests touched for the new map: `tests/war.test.ts` (the tunnel test now builds its tunnel target: the Hide-Kin's only
  way out of the sinkholes is far from Hidehall), `tests/warworks-room.test.ts` (the hero's spot outside every front's
  ring is searched for, not assumed halfway: the picked land changed with the starting owners).
- Client: nothing new needed; the war table draws every built land and link from `REGIONS` / `LAND_LINKS`.

Sims (`npx tsx tools/balance/war.ts 200 30 [--clever=<clan>]`):

| clan | before avg / most | sinkholes, Hide-Kin only | final (with the Oakvale footholds) |
|---|---|---|---|
| Wardens | 21.3% / 25.0% | 24.1% / 27.4% | 21.8% / 27.4% |
| Redfang | 17.9% / 21.2% | 15.9% / 17.7% | 22.0% / 29.0% |
| Ossuary Host | 19.1% / 19.2% | 15.7% / 17.7% | 19.9% / 27.4% |
| Hide-Kin | 19.3% / 26.9% | 17.4% / 19.4% | 16.2% / 17.7% |
| Veiled Circle | 22.4% / 25.0% | 27.0% / 29.0% | 20.0% / 25.8% |

- Flips per war day 3.21 -> 3.75 (Hide-Kin only) -> 5.59; domination 0.0% throughout. Night Raiders 0.1% -> 58.8% ->
  1.0% of night ticks.
- Footholds tried (100 x 30, avg; highest clan): near Ropewell for the Host (Hollowbrook Dells / Rootfall Slopes) Veiled
  27.5 / 26.8%, Redfang Veiled 27.2 / 27.2%, the Veiled 28.0%, the Wardens Veiled 26.5%; in Oakvale, one only: the Host at
  Stormbreak Crags Host 23.1% (200 x 30), at Gravemoor Cemetery 24.2%, Blightmire Fen 24.8%, Old Watchtower 25.8%; Redfang
  at Stormbreak Crags 25.8%, Gullrock Cove 26.2% (domination 9%); the Hide-Kin at Gullrock Cove 26.4% (15%). Two: the Host
  at Gravemoor + Redfang at Heronwreck Strand 22.2% (200 x 30), the Host at Stormbreak + Redfang at Heronwreck 22.0%
  (chosen).
- Ruses, with vs without (final map): Host 20.7 vs 19.9% (pays), Redfang 22.2 vs 22.0% (pays), Hide-Kin 16.2 vs 16.2%,
  Wardens 19.2 vs 21.8%, Veiled 16.6 vs 20.0%; domination 0.0% in every run (before: Hide-Kin 18.3 vs 19.3%).
- Open: the Hide-Kin end at 16.2%, about their homeland and no more (they start with no land outside it and the Sinkway is
  far from Hidehall); not rallied (10 of 62 is just over the line). Gnawed Bank, Scratchroot Burrows and Rushmere Hollows
  still have no quest.

- Hold art rebuilt from the fort cells (2026-11-15): `client/src/holdArt.ts` paints per-cell pieces (`fortLayout`, `paintPiece`,
  `paintGround`) from `fortOf(t, owner)`; `tools/art/holds.ts` (`npm run art`) bakes every look any Hold
  can need into one atlas per clan (`client/public/assets/holds/atlas_<clan>.png/.json`; `tests/holdatlas.test.ts` fails
  when a fort change needs a look the atlas lacks: re-run the bake). `client/src/holdAssets.ts` (`HoldDraw`) loads the
  clan's atlas lazily and builds a Hold in one call, one image per cell sorted by foot depth; `warStandards.ts` shows flat
  cell blocks while an atlas loads and swaps the art in the same frame when a Hold's owner changes. Preview: `npx tsx tools/art/preview/holds-sheet.ts out.png`.

## War table as a continent (2026-11-15, PR #458)
Murat: the in-game war table "looks like a long rectangle, not like the design". It painted the territories over the
real world map, whose acts are bands stacked down a 288-wide map. Now the War table toggle shows a schematic continent
(`client/src/warTableLayout.ts` + `warTable.ts`) laid out by compass like `riven-marches-map.png`: one polygon slot per
land in `SLOTS`, territories placed from their real positions inside their land's slot, cells tinted by holder, front
lines, banners, plates, legend with Homelands, hover tooltip. Pan/zoom/Centre are off while it is up.
- **A new land needs a `SLOTS` entry** in `client/src/warTableLayout.ts` (`tests/warTableLayout.test.ts` fails
  otherwise). The older notes above that say the war table needs nothing new for a land describe the old overlay.
- Open: land plates can hide a marker under them (hover still finds it); legend has no height check.

## W2a Feuds and Wanted (2026-11-15, PR #462)
Murat: attack a clan on your own initiative (enemies attack you, neutral clans only answer), and a "wanted" status for
killing clan members. `shared/war/feuds.ts` (rules, `FEUD`), `server/warFeuds.ts`, `client/src/warFeud.ts`.
- **At war:** clans a and b are at war while either can strike the other's land (`targetsOf`: neighbours, two borders for
  the Hide-Kin), and for `peaceTicks` 6 war ticks after. Opening map: **7 pairs** at war: the 6 that share a border plus
  hidekin-redfang, because the Hide-Kin's tunnels reach two borders (a pair that can strike the other's land is at war;
  kept on purpose). The memory is saved with the war (`Saved.rel`); clients take `WarView.wars` as sent.
- **Stance:** own clan ally; sworn to a clan at war, or a grudge, or Wanted: enemy; else neutral (can't hurt, isn't hurt).
  Behaviour change: sworn heroes are no longer fought by clans their clan doesn't border. Under Lv 5 always neutral.
- **Provoke** (Ctrl+click a neutral trooper under the cursor or a Hold's middle cells, confirmed every time; Shift+click
  stays the attack in place and `pointer.ts` ignores Ctrl+clicks; `"provoke"` message, Lv 5+, not on safe ground, within 10 tiles): a grudge for 10 min (`grudgeMs`), shared with the party, renewed by every blow.
- **Wanted:** kill points per clan (soldier 1, officer / cart / ram / mouth 2, sworn hero 3); a sworn hero's kills of a
  clan at war with theirs count x1/3 (`warKillWeight`: ordinary war fighting stays below Wanted, 12 straight kills reach
  it); provoked neutral clans and unsworn heroes count in full. Tiers 4 Wanted / 10 Hunted / 20 Marked, cap 30, -1 per
  10 min without a kill (Wanted ~40 min, Hunted hours: the way out is death at the clan's hands); time logged out decays
  at half rate (`offlineDecay`). A clan refuses the oath of a hero it wants. Wanted: seen from 2x, chased 4 tiles past the leash. Hunted+: a manhunter squad (captain + 3;
  Marked + 4 at +2 Lv) from the nearest Hold within 40 tiles; 1 per hero, 2 per room, 5 min cooldown, inside
  `maxTroops`. Death to that clan settles everything; a sworn killer gets a bounty (15 renown, 3 valor) once per target
  per UTC day, at most 3 per killer per day (saved `claimDay`/`claims`), none when the victim is sworn to the killer's
  clan or in the killer's party (no farming with alts; the feud is still settled). Saved as optional `HeroSave.feud` (no version bump).
- Open: no war-map markers for squads or wanted heroes; the Songweaver struggles against Marked squads alone (`pve.ts --hunters`).

## W1: war on the map (2026-11-15, PR #463)
Murat 2026-11-15 wants the war to feel real (plan W1-W7: overlay, free engagement + wanted, growing Holds, roads and
marching columns, big battles, capturable towns, walkable capitals). W1: `client/src/warMap.ts` draws on the world map
and minimap: discovered Holds (client fog, `minimap.isSeen`), hover intel (`shared/war/intel.ts` `holdIntel`), siege
rings + countdowns (shown under fog), `WarView.hot` hatching + `frontEdges` lines, the own clan's last-tick attacks,
caravans and tunnel mouths from the per-clan `"warplan"` message (`server/warIntel.ts`, sworn heroes only), the writ land,
and a Calls to arms panel (`callsToArms`). Note: `hot` is public, so other clans see which lands were attacked (not by
whom or from where). The plan shows last tick's attacks, not the next ones.

## W2b Sacking Holds + W2c valor from fighting (2026-11-16)
Murat: attack an encampment on your own initiative; "stand at the standard" valor is clunky.
- **Sack (W2b):** `shared/war/holdSack.ts` (`HOLD_SACK`, `bannerSpot` = the fort's middle cell, a courtyard in every plan,
  `sackReachPx` = `holdReachPx` + 3 tiles so every guard post is inside, `sackStep`, `sackGold`), `rules.ts` `sackHold`
  (`WAR.sackControl` 8, shared with the sim), `server/war.ts` `strikeHold` (between ticks: Control, maybe a siege, a "sack"
  `WarEvent` and a "siege" one when called, listeners and save at once), `server/warHolds.ts` (`WarHolds` behind
  `HoldSackHost`), `server/warTroops.ts` `guardsAlive` / `holdGuardsOff`.
  - A hero the holder's troops fight (`troopStance` enemy) stands within 1.5 tiles of the banner and sends `"sack"` `{t}`
    (`allow("ask")`, integer land, every condition re-checked): refused while a holder guard lives in the reach, an active
    (`STANDARD.idleMs`) holder-sworn hero of oath level stands in it, a siege is announced, the land was sacked this war
    tick, or another hero here is raising. 12 s; any holder trooper (not an object) or active defender in the reach pauses
    it (no grace); `lastHurt` moving restarts it; walking 2.25 tiles off, losing the enemy stance or a siege stops it.
  - Done: one sack per land per war tick for every room (module memory, like caravans). Sworn and legal (`targetsOf`):
    -8 Control, a siege by the sacker's clan at <= 25 (never at a capital), 10 valor, 20 renown (x Rally) to every hero
    sworn to it in the reach. Unsworn or not legal: -4, no siege, no valor. Gold `20 + 5 x troopLevel(t)` at the banner.
    Guards off until the next war tick in every room. `sfx hold_sacked {t, x, y, by, from}`, Herald + holder's leader
    (`WarMoment` "sacked"; none for an unsworn sacker), `warev` kind "sack" (by = the holder when unsworn).
  - Messages: server -> raiser `"sack"` `{t, progress, state: raise|paused|done|stop, err?}` (t -1 + err when refused);
    server -> all `"holds"` `{tick, sacked: [t, clanIdx|-1][], raising: [t, pct, paused][]}` on change, progress 1/s, join.
  - Client: `client/src/warSack.ts` (E prompt "Raise your banner over the X Hold", progress bar, `banner_raise` creak
    within 9 tiles of a banner going up, plaque line), `warStandards.ts` `setSacked` (sacker's standard, or a grey rag for
    an unsworn hero, at the banner spot), `warMap.ts` a small flag on a sacked Hold icon and a tooltip line, `warNotice.ts`
    sack text, sounds `hold_sacked` / `banner_raise` in `sfx.ts`.
- **Valor from fighting (W2c):** `STANDARD.valorPerMin` 0; `Presence` keeps counting minutes (no idle check) only for an
  old `hold` writ, which still loads and completes; boards no longer offer `hold` (`OFFER_KINDS`). Kill valor
  (`WarTroops.killValor`): a sworn hero of oath level killing a soldier (1) / officer (2) of a clan at war with theirs, or
  a hero sworn to one (3, never a party mate), in a land their clan holds or may attack, `killValorPerTick` 12 (was 5),
  renown alike. Patrols pay through `killed()`; the room pays every other trooper (siege, escort, tunnel, acolyte,
  manhunter) and hero kills. Objects (carts, rams, mouths) keep their own pay. Oath panel / prompt: "Swear here · fight
  for valor".
- Sims (`npx tsx tools/balance/war.ts 200 30`): no players and `--zeal=all:30` identical before/after (the sim never
  modelled the standards): Wardens 21.8 / Redfang 22.0 / Host 19.9 / Hide-Kin 16.2 / Veiled 20.0%, 5.59 flips a day (zeal
  12.03), domination 0.0%. New `--sack=<clan|all>[:perDay]`: redfang:6 -> Redfang 21.9%, 4.0 sacks and 1.45 sieges a day,
  6.22 flips; redfang:24 -> 21.4%, 6.21 flips; all:6 -> 19.1 sacks/day, 6.09 flips; hidekin:12 -> 16.3% (best day 24.2%),
  5.52 flips. Domination 0.0% in every run.
- Bench (`WAR=1 SPREAD=1 npm run bench`, noisy): before 3.50 / 6.90 ms tick avg (p95 7.1 / 13.8), after 6.30 / 4.60
  (p95 10.9 / 8.7). 80 troopers, no dropped bots.
- Follow-up: a sack's siege is marked (`Siege.sack`, optional, old saves load as the army's). When it fails it keeps
  Control + `WAR.sackSiegeFail` (2) instead of the army siege's reset to 50. Sims after: no players unchanged (5.59 flips);
  redfang:6 Redfang 21.8% (6.11 flips), redfang:24 21.6% (was 21.4%, 6.50), all:6 top clan 22.0% (6.16), hidekin:12
  Hide-Kin 16.3% (5.35); domination 0.0%, no clan above 22.0% on average. The nudge does not matter (0 gives the same
  numbers): sacks stop backfiring but still win no land, because a sack's siege only flips if the sacker's army is
  attacking that land when it comes due, and the scripted leaders often look elsewhere.
- Leaders follow their heroes' sacks (`doctrine.ts` `followedSack`): while a sack's siege is pending on a land the clan
  may attack, that land comes first in its orders (one at a time, the soonest due). Sims: no players unchanged; redfang:6
  21.7%, redfang:24 21.6%, all:6 top 22.0%, hidekin:12 16.3%; domination 0.0%. Still no land gain. A diagnostic run
  (40 wars, redfang:24) shows why: territory share follows army strength, not Control. Without sacks Redfang won 1891 /
  lost 1966 lands for 13.2 held on average; with sacks 1743 / 1812 for 13.3; letting sack sieges flip more easily (defence
  rally 1.0 or 0.8 instead of 1.3) doubled both wins and losses and still held about 13.0. Sacks churn the front but add no
  army; a land gain needs a force effect (valor that counts in the siege check, or a sacked land's defence weakened for
  the tick) or a smaller army brake on the winner.
- Open: making sacks pay off in land (above); a banner-raise cosmetic on the pole for onlookers; sacked Holds on the war table (`warTable.ts`).

#### W2b/W2c review fixes (PR #466)
- Guards can't be starved away: `WarTroops.guardsDue(t)` = guards the Hold should field (garrisonCount, capped by spots; 0 while sacked) minus those fallen this war tick or not back yet; `why()` refuses while any are due. A land with a hero in sack reach takes trooper slots first, guards before marchers.
- Sack valor and the sack siege need the sacker's clan at war with the holder (`atWar`); a grudge or Wanted alone robs the Hold (gold, half Control, no siege). `sackHold` calls a siege only on a full (not half) sack.
- Hero-kill valor once per victim per killer per war tick (`heroKillValor`). A hero's creature's trooper kills (lone or patrol) pay its owner kill valor and writ credit.
- Presence idle check restored (an idle hero counts no standard minutes for old hold writs). `WarHolds.forget` is called on leave.

## W3: Holds grow with their garrison (outpost, camp, fortress), branch claude/war-tiers
- Tier is derived, never saved (`shared/war/holdTiers.ts`): camp at fort ≥ 0.2 and Control > 25, fortress at fort ≥ 0.6 and Control ≥ 50; a capital held by its clan is always a fortress; a front land (borders a clan its holder is at war with) is at most a camp. Flip resets to outpost.
- Per-tier fort plans per clan (`planOf`/`fortOf(t, clan, tier)`); camps unchanged; outposts and fortresses give way to every camp and keep roads/links open. Walls push heroes out on a tier change.
- Guards 3/6/8 at Control 100 (`TROOP.garrison`). Sack reach follows the live tier. A sack cuts `fort` by `WAR.sackFort` 0.02 (half for unsworn).
- Herald + `hold_grow` sfx when a Hold grows (max 3 per tick).
- Art: tier looks for towers and gates in the per-clan atlases (now 2048 px wide). Client: tier names (`client/src/holdNames.ts`), icon/marker sizes, plaque and tooltip lines.
- Sims: no-player baseline unchanged (21.8/22.0/19.9/16.2/20.0 %, 5.59 flips). `--tiers`: 4 % outposts, 38 % camps, 58 % fortresses; front lands 84 % camps. `--sack=all:6` with sackFort 0.02: top clan 23.2 %, 8.97 flips, domination 0 %.
- Garrison fights (`pve.ts --troops --garrison`, worst case all at once): solo heroes clear outposts; fortresses are group content (Songweaver cannot solo camps/fortresses, Summoner can). Balance follow-up.
- Open: second-line cap (would give ~38 % fortresses); grow notice in the HUD (Herald line only for now).

## W4: war roads and marching columns, branch claude/war-roads (stacked on claude/war-tiers)
Step 1 and 2 of the W4 plan (shared, server, room hooks). Client drawing, art, herald lines per leader and the patch
note are later steps. Owner questions on the plan's defaults (columns public in the world, other clans' columns on the
map within `COLUMN.scoutTiles` 40; orders one tick ahead; floor 0.5; halts up to 90 s; clashes on a shared road only;
the 4 road gaps simulated; joining pays 8 valor and 10 renown; a column camps at the siege approach).
- **War roads** (`shared/war/roads.ts`): the caravans' route search moved here unchanged (`searchBox`, `searchPath`,
  `simplifyPath`, `routePos`; `caravanRoute` builds with it, same cache and results). A war road blocks every Hold's
  whole fort footprint (any clan, any tier) except the road's own two Holds (blocking those too cut 6 more roads: their
  yards hold the gate; every tier's walls are blocked anyway). 88 neighbour pairs: 80 roads, 4 waygate links (two legs:
  Hold gate to the walkable tile nearest the gate within `ROAD_SEARCH.gateReach` 14 tiles, then the far gate to the
  Hold), 4 tracks (North Meadow to Old Watchtower and Old Ruins, Brinewood and Heronwreck Strand to Saltwind Coast:
  straight line between the Hold gates, columns simulated only). About 1.6 s to build all, worst 275 ms; built lazily,
  one per room tick (the columns' paths first). No `shared/map.ts` change.
- **Orders one tick ahead** (`server/war.ts`): after each tick the leaders give the next tick's orders at once (same
  `scriptedOrders`, same seed `tick * 2654435761 + 1` on the same state), kept in the war save as `ahead` and applied at
  the next tick. Missing (old save, `_resetWar` without it): given at the tick as before. `warPlan` (the "warplan" intel)
  now shows the orders ahead. `lastOrders` / `warStrikes` (tunnels) still mean the orders the last tick applied.
- **Rules** (`shared/war/rules.ts`): `deployments(s, orders, phase)` is warTick's step 2, extracted (golden test over
  50 ticks); `TickExtra.march: {t, k, mult}[]` scales clan k's army attack on t (0..1, valor untouched).
- **Columns** (`shared/war/marches.ts`, `COLUMN`): one per non-tunnel march of the plan (`plansOf` moved here from
  `server/war.ts`, re-exported there). Id `${tick}-${clan}-${from}-${to}`; men = 1 officer + clamp(round(force / 30),
  2, 7) soldiers (force: that march's attack from `deployments`); departs 60 s after the tick; walks at 30 px/s, faster
  only when the trip (walk + 90 s halts + 60 s clash + 5 s gate + 30 s slack) would not fit before the next tick; camps
  on the road where it passes nearest the target's `siegeApproach` (axis: from the target toward the land it comes
  from). `columnPos(path, dep, now, haltMs, meetAt)`: the clock, the same on the server and the client.
  `marchMult(alive, size)` = max(0.5, alive / size). `clashLosses` = round(n x min(0.5, 0.6 x F_other / (F_a + F_b))).
  `meetingOf`: columns of one road in opposite directions meet where both clocks (no halts) cross; a column camped
  already is met at its camp; both stand `clashMs` 60 s there.
- **Server** (`server/war.ts`): `cols` in the war save (`{fallen, halt, met?}` per column id, current interval only;
  dirty-flag save at most once a minute from the 15 s timer, and at the tick). `columnLost`, `columnHalt`, `columnSeen`,
  `columnJoined`, readers `warMarches`, `marchCol`, `marchPath`, `warMeetings`, `meetingFor`, `columnsVersion`. At the
  tick: meetings nobody saw live are settled by `clashLosses` (`met: "sim"`; one a room had live: `"live"`, its real
  deaths count), then `TickExtra.march` carries every column that lost men. `v` stays 1; `wellFormed` ignores both new
  fields, so old builds read new saves and new builds read old saves.
- **Room** (`server/warMarches.ts`, `WarMarches` behind `MarchHost`; 9 one-line hooks in `TownRoom.ts`): within 26 tiles
  of a living hero above ground, at most 2 columns per room, plain `"trooper"` mobs (`troopWeapon(clan, officer)`; every
  trooper gate holds), officer first, the rest while `budget()` has slots (unspawned men stay virtual and alive). Two
  abreast behind the officer at the clock anchor; `WarTroops.think / fight / walk`; leash 7 tiles round the anchor; no
  hunting. A soldier fighting an enemy hero halts the column (`columnHalt`, 90 s a trip). Any death counts
  (`columnLost`); kill valor and renown through the room's usual trooper path. Sleeps after 30 s unseen; the fallen stay
  fallen; extra men go when another room's losses bring the column below what this room fields. A sworn hero of the
  column's clan within 6 tiles of the anchor for half the moving time joins it on arrival: 8 valor for the clan in the
  target land (`addValor`), 10 renown, a Herald tell; once per hero per war tick. Columns take trooper slots after
  caravans, sieges, tunnels, rituals and manhunters, before the patrols (`reserved()`).
- **Messages (server -> client only; nothing comes back):**
  - `"warroads"`: `RoadEntry[]` = `[a, b, pts, flag?][]`, a < b, `pts` flat whole tile coordinates `[tx0, ty0, tx1, ty1,
    ...]` of the waypoints (tile centres) walked from a. No flag: a road. `-1`: a track (pts = the two Hold gates).
    `n >= 1`: a waygate link, leg 1 = points `0..n-1` (ends by a's gate), leg 2 = points `n..` (from b's gate). Sent on
    join (the ways built so far) and once to every room when all are built. `roads.ts pathOfEntry(e)` rebuilds the exact
    path the server walks (to walk b -> a, reverse the legs).
  - `"columns"`: `ColumnsMsg` = `{ tick, cols: [id, clanIdx, from, to, dep, size, fallen, haltMs, state][], meets?:
    [a, b, x, y, at][] }`. `size` counts the officer; `state` 0 muster, 1 march, 2 halted by heroes, 3 clash, 4 in a
    waygate, 5 camp. Sent on join, after every war tick, and when a column changes (a death, a halt starting or ending,
    a meeting settled). The client places a column with `columnPos(pathOfEntry(entry), dep, now, haltMs, meetAt)`
    (meetAt = the `at` of the meeting that names it); while state is 2 it stands.
  - sfx: `column_march {id, x, y, clan}` (a column wakes near heroes), `column_clash {x, y, a, b}` (a, b clan keys),
    `column_gate {id, x, y, clan}` (a live column steps into a waygate). Stub recipes in `client/src/sfx.ts`.
  - Herald: one public line per war tick (at most 3 columns), a tell to sworn heroes whose land is marched on or whose
    clan marches, a clash line. Leader lines (`WarMoment` march / ambushed / clash) are added (heralds.ts march, ambushed, clash).
- **Tools:** `tools/balance/war.ts` prints the column size histogram (`--per-soldier=<n>` to try another value) and has
  `--ambush=<clan|all>[:share]` and `--clash`; `tools/balance/pve.ts --column` (a hero alone vs a full column);
  `npm run bench` `COLUMN=1` (with `WAR=1`): a column marches past the first bot for the whole run.
- **Sims** (`npx tsx tools/balance/war.ts 200 30`): no players identical before/after (Wardens 21.8 / Redfang 22.0 /
  Host 19.9 / Hide-Kin 16.2 / Veiled 20.0 %, 5.59 flips a day, domination 0.0 %); `--clever=host` identical too (Host
  20.7 % vs 19.9 %). Column sizes (perSoldier 30, men with the officer): 3: 4.6 / 4: 20.6 / 5: 13.8 / 6: 27.5 / 7: 21.6 /
  8: 11.9 %, about 780 columns a war day. Hooks (report only, domination 0.0 % in every run):
  `--ambush=all` (every column on every land cut by half, every tick) Redfang 23.1 / Host 22.7 %, flips 1.65 a day;
  `--ambush=hidekin` 16.4 %, 5.57 flips; `--ambush=redfang:1` (every column on Redfang land wiped) Redfang 24.9 %,
  3.94 flips; `--clash` (every same-road meeting of clans at war, the sim does not check that both camp short) 93
  meetings and 327 men lost a day, 4.09 flips, top clan 22.1 %.
- **PvE** (`npx tsx tools/balance/pve.ts 40 --column`, a hero alone vs an officer and 7 soldiers of its level; cell =
  win / half cut / men down / HP lost / s): Lv15 wizard 0/0/0.0, vampire 3/10/0.7, summoner 48/48/4.0, songweaver 0/0/0.0;
  Lv30 wizard 35/35/2.8, vampire 60/70/5.5, summoner 100/100/8.0, songweaver 8/8/0.7; Lv45 wizard 38/38/3.0, vampire
  60/68/5.2, summoner 100/100/8.0, songweaver 0/0/0.1. A full column is group content for most classes (like a fortress
  garrison); the Summoner solos it.
- **Bench** (`WAR=1 SPREAD=1 npm run bench`, 5 bots, noisy): before 7.06 / 5.44 ms tick avg (p95 13.8 / 12.1), after
  6.64 / 6.31 (p95 12.9 / 11.4); `COLUMN=1` 5.05 (p95 9.2) with the 8 column troopers live. 80 troopers, no dropped bots.
- Open: client drawing (map polylines, column icons, clash glyph, track decal, plaque line, notice), pennant art, leader
  lines per clan, patch note; the 4 road gaps (a later `area:map` PR); clashes off a shared road and live columns joining
  the siege fronts (W5, `Meeting` records are ready); the `--ambush=redfang:1` extreme lifts one clan to 24.9 % (the
  0.5 floor is the knob).

## W5: big battles, branch claude/war-big-battles (stacked on claude/war-roads)
Owner questions answered with the plan's defaults (2026-11-16): 3 pitched battles a day at 13:00, 19:00 and 21:30
Europe/Zurich; 30 min notice and a reminder at 5; about 140 live soldiers plus painted ranks; stormings settle decisive
sieges (within +-30 %); 2 meeting battles a day; a third clan at war with both sides may join; no veteran badge; battles
in every act.
- **Step 1, shared rules and sim** (`shared/war/battles.ts`, `BATTLE` table): `pitchedSlot(now)` / `pitchedTimes(day)` /
  `battleDay(now)` (local day for the caps, Intl time zone), `battleField(a, b)` (a 20 x 12 box, long side across the
  road, nearest the war way's middle within 24 tiles; 85 % walkable and its middle third clear; off safe ground,
  villages, monster-free ground and every Hold footprint; cached per pair; 87 of 88 neighbour pairs have one, Old Ruins |
  Old Watchtower does not and is never chosen), `battleBanners`, `stormField` (the siege approach), `pickPitched(s)`
  (most pressed non-capital land, strongest neighbouring clan from its best-supplied adjacent land with a field),
  `siegeOdds` / `isDecisive` / `siteForces`, `meetSite` / `pickMeetings` (both columns 6+ men; the stronger column attacks
  the land it marches on), `battleMen(force)` = clamp(round(force / 1), 60, 300), `newBattle`, `battleStep(b, dt, live,
  kMult)` (Lanchester, k 0.00175/s, banners x1.15 each, lost captains x0.92 each, live deaths fill the step's quota and
  only the excess is extra), `battleResult`, `virtualBattle`, `battleOutcome`, `battleView` and the `"battle"` message
  type `BattleMsg { now, list: BattleView[] }`.
- **Rules** (`shared/war/rules.ts`): `TickExtra.battle: BattleOutcome[]` (`{kind, t, att, def, result, lostA, lostB}`,
  validated). The loser's army x(1 - 0.08 x share lost); pitched or meeting won by the attacker: Control -12 and its
  attack there x1.25; won by the defender: defence x1.25 and Control +8; a storming won by the besieger flips the land,
  lost it fails the siege, a draw leaves the usual check. Numbers in `WAR.battle*`. No battle: the tick is identical
  (golden hash over 600 seeded ticks with valor and march extras, `tests/warbattles.test.ts`).
- **Sim** (`npx tsx tools/balance/war.ts 200 30`): without `--battles` identical (21.8 / 22.0 / 19.9 / 16.2 / 20.0 %,
  5.59 flips a day, domination 0.0 %). `--battles`: Wardens 22.0 / Redfang 21.8 / Host 19.8 / Hide-Kin 16.3 / Veiled
  20.1 %, 5.73 flips a day (+2.5 %), domination 0.0 %; per war day 2.87 pitched (attacker 54.9 / defender 42.2 / draw
  2.9 %), 2.45 stormings (35.9 / 56.6 / 7.5 %, 0.88 flips), 0.59 meetings; 171 men a side, 6.1 min fought.
  `--battle-heroes=redfang:1.3`: Redfang 22.0 %, 6.56 flips, domination 0.0 %.
- **The live war follows the `--battles` numbers**: battles are on by default (`BATTLE.live`) and are fought with no
  players too, so the no-player goal is now judged on the `--battles` run (accepted by the orchestrator as long as the
  gate holds: domination 0 %, top clan <= 23 %, flips within +-15 % of 5.59).
