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
