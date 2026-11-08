# Summoner « Void Lord » rework: progress

Spec: the brief « Refonte de la classe Invocateur : Maître du Néant » (Murat 2026-11-08).
Work branch: `claude/pensive-mccarthy-2razu7`. No PR until the mechanics are complete (end of session B).

## Plan (5 sessions, 3 PRs)
- **A (done)**: baseline sims, shared data, permanent golems, grimoire, auras, golem powers, death bursts, Essence,
  Stone Bond passive, PvP settings, Black Hole (incl. projectile eating), Void Velocity, Void Slip, Colossus split,
  save reset, duel sim updated, tests.
- **B**: wisps (Mob kinds + client placeholder sprite), Void Arsenal (blade, lance, axe, 4 wisps), golem-element Void
  Blades, staff portal attack (~220 px), Essence/wisp expiry (toVoid on time-out), sim (wisps, arsenal, portal), e2e
  (`tools/e2e-summoner.cjs`, `tools/e2e-two-players.cjs`), `npm run bench`, patch note, **open PR 1**.
- **C**: art (hero repaint: tailcoat + scarf, starter kit, wisp sheets, skill icons, skillfx).
- **D**: UI (grimoire panel, HUD: auras, golem respawn, Essence), mobile check. **PR 2**.
- **E**: balance (≥150 fights/pair, Lv 1-50), PvE not trivial. **PR 3**.

## Done in session A
- `shared/summons.ts`: `GOLEM` (respawn 12 s, enter 1.5 s, twin Lv 18), grimoire (`parseGrimoire`, default fire,fire),
  `AURA` + `RESONANCE` (x1.5) + `auraBuffs`, `GOLEM_SKILL`, `GOLEM_DEATH`, `ESSENCE`, `SUMMON.pvp` {dmg, hp, cc},
  `SUMMONER_TREE` (save version), `golemSlots`.
- `shared/golemAI.ts` (new): golem powers (fire nova 6 s, frost freeze every 3rd blow, venom pool 5 s, storm chain 5 s)
  and death bursts, run through SkillHost by the server and the duel sim.
- `shared/skills.ts`: new tree (Golems / Void / Conjuration, 7/6/6 skills, mastery ranks Lv 30/40 like the vampire),
  Attune and the old skills removed, new talent effects (summon, golemRegen, bond, resonance, twin, gravity, velocity,
  slip, edge, swarm, return), `FieldDef.hole` / `blades`, `BuffDef.cdr`, passive `blink` / `slip`.
- `shared/skillEngine.ts`: auras kept topped up in `tickUnit` (host `golemEls`), Essence (no gain from basic hits,
  30 s decay, `gainEssence`, `toVoid` + Return to the Void), field pull every tick (heroes x `SUMMON.pvp.cc`), Black
  Hole swallow / close (host `voidHop`), Gravity, Void Edge extra blades, Void Velocity buff on blink, `voidSlip`,
  `inVoid`, `HitOpts.pet`.
- `server/TownRoom.ts`: slot golems (`autoGolems`, `recallGolems`, `golemFell`, `splitColossus`), grimoire message
  (`grimoire` {slot, el}, throttled, packed in `Player.attune` = el1 + 4·el2 because Player is at 64 fields),
  `voidHop`, `holeEats` (projectiles), `loseHero` (Void Slip), PvP multipliers in `hitTarget`, Stone Bond talent +
  Essence, save `grimoire` / `suTree` with free reset of old trees.
- Client: provisional icons (`BORROWED` in `client/src/skillArt.ts`). Unknown sfx events (golemfire, golemdeath,
  voidhop, eatshot, swallow, holeclose, voidslip, grimoire, colossussplit, voidreturn) are ignored for now.
- Tests: `tests/voidlord.test.ts` (6 tests), `summoner*.test.ts` updated. `npm test`, `npm run build`, smoke: OK.

## Decisions taken (to confirm or revisit)
- Stone Bond: the base share (30% → 22% from Lv 20-25) stays without the passive; the passive adds +2%/rank (cap 60%).
  Otherwise the Summoner would lose its bond at Lv 1 (0 skill points).
- Fire aura +dmg also boosts the golems (hitTarget applies the owner's dealt multiplier to golem blows, as before).
- Golem powers' damage is the golem's own blow; death bursts scale with the owner's Magic (like skills).
- Swarm: base 3 wisps, +1 with Swarm (4 max).
- Bosses are never swallowed by the Black Hole (they stay, take the damage).

## Sim numbers
Baseline before the rework (`npx tsx tools/balance/duel.ts 150`, overall win rate):

| | Lv1 | Lv5 | Lv10 | Lv15 | Lv20 | Lv25 | Lv30 | Lv40 | Lv50 |
|---|---|---|---|---|---|---|---|---|---|
| wizard | 6% | 57% | 59% | 47% | 48% | 64% | 62% | 67% | 79% |
| vampire | 96% | 47% | 45% | 53% | 59% | 57% | 40% | 42% | 42% |
| summoner | 46% | 51% | 51% | 50% | 40% | 41% | 45% | 50% | 29% |

PvE before: the Summoner loses 0% HP per kill at every level (Act 1 and Act 2): trivial.

After session A (60 fights/pair, no wisps / Arsenal yet, so low levels are weak):
summoner 16 / 28 / 23 / 35 / 51 / 43 / 50 / 45 / 53 %. Not tuned on purpose (session E).

## Pitfalls
- Player schema is at the 64-field limit: pack new synced data into existing fields.
- `cleanRanks` drops a skill whose parent is missing: tests must set parents too.
- The skill tree slab fits 4 rows: keep each branch at depth ≤ 3 (tests/treeLayout.test.ts).
- `MOB_FIELDS` order: new synced Mob fields go at the end (none added in session A).
