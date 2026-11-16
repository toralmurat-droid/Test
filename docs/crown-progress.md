# Crown of the Marches: progress log

Act 6, the neutral land in the middle of the Riven Marches (levels 40-50). Plan: the Crown plan of 2026-11-15
(`client/src/roadmap.ts`). The clan war side is logged in [clan-war-progress.md](clan-war-progress.md).

| PR | What | State |
|---|---|---|
| 1 | The land: `shared/crown.ts`, the five Crownways, Tollcross, the Crown Keep and its Throne Hall | merged |
| 2 | The court's monsters, the Riven King, The Riven Throne quest chain | this log |
| 3 | War territories (ids 62-71) | not started |
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
