# Crown of the Marches: progress log

Act 6, the neutral land in the middle of the Riven Marches (levels 40-50). Plan: the Crown plan of 2026-11-15
(`client/src/roadmap.ts`). The clan war side is logged in [clan-war-progress.md](clan-war-progress.md).

| PR | What | State |
|---|---|---|
| 1 | The land: `shared/crown.ts`, the five Crownways, Tollcross, the Crown Keep and its Throne Hall | merged |
| 2 | The court's monsters, the Riven King, The Riven Throne quest chain | merged |
| 3 | War territories (ids 62-71) | this log (branch claude/crown-war) |
| 4 | The Reckoning | not started |

## PR2: the Riven Court (2026-11-16)

**Monsters** (`MOBS` etc. in `shared/constants.ts`, moves in `server/crownMobs.ts`, numbers in `CROWN_AI` / `RIVEN_KING`):

| kind | name | what it does |
|---|---|---|
| `oathbreaker` | Oathbroken Knight | gores; below 40% HP breaks its last oath: faster, harder, quicker |
| `crownguard` | Crownguard | mauls; plants its shield toward its foe (blows from the front x0.25) |
| `hollowherald` | Hollow Herald | cold bolts; reads a decree (1.1 s cast) that rallies the court in 256 px; a stun or break cuts it off |
| `courtmagus` | Court Magus | shock bolts; blinks 130 px away from a hero who closes in |
| `gildhound` | Gildhound | pack hunter, pounces, bleeds; when one falls the rest of its hunt goes wild onto the killer |
| `crowncrow` | Crown Crow | flying pack, swoops |
| `pretender` | Pretender | calls two Oathbroken; when hurt trades places with the nearest of its court |
| `thronewarden` | Thronewarden (elite) | stomps and mauls, cries war, wards the most hurt of the court (x0.5 taken) |
| `rivenking` | Aldemar, the Riven King (boss, Lv 50) | see below |

The dead (`CROWN_DEAD`: knights, guards, heralds, the Thronewarden, the King) are spared by the Night Raiders; the
dead knights, guards and heralds come as the Necromancer's champions (Risen, Siegewright); Pretenders and Gildhounds come as Ringleaders (outlaw swords).
Crows and magi have no champion family yet.

**The Riven King** (`RIVEN_KING`): 1900 HP (x2 as the quest boss), three phases. All fight long his Riven Edge marks a
lane (0.9 s) and cuts down it. Below 66%: crown shards fall where heroes stand (4 marks, 1.3 s, short stun). Below 33%:
he quickens and brings the hall down round himself (Kingsfall: 104 px, 2 s warning). He calls Crownguard and Oathbroken,
stomps and mauls, and speaks (wake, taunts, half, death, a line for each phase and for a hero he fells).

**Zones** (`shared/spawns.ts`, act 6 block): ten lands Lv 40-48 climbing from the Crownways to the Keep, the Throne Hall
(the Riven King alone, Lv 50, fixed, 5 min respawn), a wild zone last. Density 24 / 60 tiles per monster (about 1,030
monsters). Tollcross and the five Crownway daises are monster-free. The Keep's zone never spawns inside the hall
(`BOSS_HALLS`).

**Quests** (`shared/quests.ts` `THRONE_QUESTS`, side arc id `throne`, appended last so no chain index moves): Herald-Marshal
Ysmay Corrant in Tollcross Square. Pilgrims' Way (40), The King's Hunt (42), Court of Mirrors (43), The Silent Heralds
(44), The Pretender of the Vigil (45, Prince Ottrin Lv 47), The Crown Keep (47, the Thronewarden, the hall's door), The
Riven King (48, Aldemar Lv 50 in the Throne Hall). Saves: the chain is one more key in the `quests` map, no new field.

**Client:** painted sheets for the nine kinds and the Herald-Marshal (`tools/art/paint/crown.ts`, `look.ts`,
`characters.ts`), `client/src/crownFx.ts` (shield arcs, decree rings, blink puffs, the King's telegraphs on the ground),
sounds in `client/src/sfx.ts`, battle music.

**Balance** (`tools/balance/pve.ts --zones --crown`, `--bosses`): Crown zone runs 99-100% cleared for every class, 0-4% HP
lost and 2.2-4.1 s per kill. Thronewarden Lv 46 and Prince Ottrin Lv 47: 100% for every class. Riven King Lv 50:
wizard 83%, vampire 90%, summoner 100%, songweaver 90% (46-90 s fights). The hardest boss in the game, as planned.

**Bench:** a hero standing in a Crown zone costs about what one in the sinkholes does (2.5-3.4 ms vs 2.4-3.7 ms a tick
in-process); the Crown's monsters doze while nobody is there.

**Open:**
- Tollcross is still bare ground (no buildings, portal stone, board or shops); the Herald-Marshal stands in its square.
- The champion share is just above the 90% the champions test asks for (0.901): the next land with monsters that have
  no champion family will need one (a Crown court family with its own affix is the natural next step).

## PR3: the Crown at war (2026-11-16)

**Land** (`shared/war/regions.ts`): the `crown` region is built (`contains: actOfTile === 6`), no home, no capital,
`wards: true` and `reckoning: ["The Crown Keep"]`. The five Crownways are `REGION_LINKS` (appended after the Sinkway, so
the older links keep their ids): each joins its homeland's dais to its Crown gate. On today's map every Crownway lands
on a capital at home: Stormbreak Crags (the Host's Oakvale foothold, not a Wardens land), the Host's Muster, Fangrock,
Hidehall, the Veiled Sanctum.

**Territories** (`shared/war/territories.ts`): ids 62-71, in `SPAWN_ZONES` order: the Pilgrims' Way, the Field of
Statues, the Spirefall, the Sunken Courts, the Ember Gardens, the Tourney Grounds, the Gilded Ruins, the Mourning
Gardens, the Vigil Courts, the Crown Keep. The Throne Hall (a lair) and the open Crown (wild) stay out; Tollcross lies
outside every zone (a safe hub, no territory).
- `Territory.wards`: the clan a gate territory of a `wards` land starts with, the home clan behind its Crownway:
  Pilgrims' Way Wardens, Spirefall Host, Field of Statues Redfang, Sunken Courts Hide-Kin, Ember Gardens Veiled.
- `Territory.reckoningOnly` (the Keep): **the hook for PR4.** `rules.ts` never lists it in `targetsOf` (no attack,
  valor, siege, march or feud through it; a tunnel may pass under it) nor in `bordersOf` (no defenders, no Night Raid),
  `sackHold` ignores it and `warTick` never flips it. `server/warHolds.ts` refuses a sack there ("only at a
  Reckoning"). PR4 sets the holder by hand (`state.owner[keep] = winner`); nothing else needs to change.
- `initialOwners(ts, preset?)`: the homelands are claimed first exactly as before (the pre-Crown fingerprint of ids
  0-61 is unchanged, `tests/warregions.test.ts`), then the approaches go to their wardens, the inner lands are claimed
  by the clans with the least land, and the Keep goes to `leastLanded` (ties: `CLAN_KEYS` order). A new war starts
  14/16/16/13/13 (Wardens to Veiled); the Keep goes to the Hide-Kin.
- Holds: `shared/war/standards.ts` tries the land's `CROWN_LANDS` hold patch first (standards keep off it); the generic
  search placed some Crown Holds on the king's roads, where a fort is all gaps (the Spirefall and the Sunken Courts left
  the Veiled 2 wall cells). Only the Crown has patches in that table, so no older Hold moved. Hold atlases re-baked
  (`npx tsx tools/art/holds.ts`). Standards, roads, patrols and tunnels come from the existing generators.

**Save migration** (`server/war.ts`): `PRE_CROWN_NAMES` freezes the 62 sinkholes-era names (joins `OLD_MAPS`, so an
unnamed save of 62 is read too). `migrateWar` maps a saved war by name as before: ids 0-61 keep holder, Control, forts,
sieges, pressure, the leaders' targets and the log exactly. New territories of a `wards` land are seeded with
`initialOwners(ts, preset)` round the saved holders (wardens, inner lands to the clans with the least land, the Keep to
the clan with the least land of the save), Control 100, no fort, siege or pressure. Orders, columns, battles and towns
are dropped and given afresh, as on every map change; the old save is kept as `war-old-<ms>`.

**Client** (owned by the client engineer; the brief asked for it): `client/src/warRoute.ts` drops `CROWN_NODE`: the
Crown's territories are nodes, the Crownways come from `REGION_LINKS` (ids `crownway_<land>`, same costs and level
notes). `warTableLayout.ts`: the Crown's plate sits in the middle of its slot and its territories keep out of it
(`keepOut`). `warTable.ts`: the Keep drawn with a gold crown, a key line, hover text; `warPlaque.ts`: "Falls only at a
Reckoning"; `warHere.ts`, `TownScene.ts`: the `CROWN_NODE` cases removed.

**War sim** (`npx tsx tools/balance/war.ts 200 30`, then `--battles --towns`; the sim now also reports the Crown):

| clan | before avg / most | after avg / most | after, battles + towns |
|---|---|---|---|
| Wardens | 21.8% / 27.4% | 19.3% / 26.4% | 19.5% / 27.8% |
| Redfang | 22.0% / 29.0% | 22.7% / 29.2% | 23.0% / 27.8% |
| Ossuary Host | 19.9% / 27.4% | 18.3% / 25.0% | 17.8% / 26.4% |
| Hide-Kin | 16.2% / 17.7% | 18.0% / 20.8% | 17.9% / 19.4% |
| Veiled Circle | 20.0% / 25.8% | 21.7% / 27.8% | 21.8% / 27.8% |

- Flips per war day 5.59 -> 7.93 (5.85 -> 8.69 with battles and towns); domination 0.0% throughout. Night Raiders
  1.0% -> 5.7% of night ticks (3.4% -> 10.6%), mostly on Redfang. The Rally goes to the Host on 17% of ticks (22%).
- The Crown: 1.83 flips a war day (2.03); average share of it Wardens 12.7%, Redfang 15.0%, Host 10.9%, Hide-Kin 29.6%
  (the Keep is a tenth of it), Veiled 31.8%. **No clan held more than half of the Crown on any day** (0.0%).

**Bench** (`npm run bench`, 5 bots; `SPREAD=1 npm run bench -- 20`): tick avg 3.92 / 4.92 ms before, 5.30 / 5.21 ms
after (p95 9.5 / 6.6 before, 6.8 / 6.8 after); spread 20 bots 12.70 ms -> 13.58 ms (p95 19.0 -> 18.7). Within the run
to run noise (two before runs differ by 1 ms).

**Open:**
- No writ board in the Crown (Tollcross has none yet), so no Crown writs.
- The client still offers the "raise banner" prompt at the Keep's Hold; the server answers that it falls only at a
  Reckoning.
- The Wardens' approach is cut off from their supply on a new war (its Crownway lands on the Host's Stormbreak Crags).
- PR4: the Reckoning (sets the Keep's holder through `reckoningOnly`).

