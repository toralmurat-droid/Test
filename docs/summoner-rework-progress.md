# Summoner « Void Lord » rework: progress

Spec: the brief « Refonte de la classe Invocateur : Maître du Néant » (Murat 2026-11-08).
Work branch: `claude/pensive-mccarthy-2razu7`. PR 1 opened at the end of session B, **as a draft** (drafts are never
auto-merged): the duel sim shows the Summoner far too strong against the Wizard (see below). Murat (2026-11-09):
PR 1 stays a draft until the balance work (PR 3) is done; sessions C-E keep pushing to this branch.

## Plan (5 sessions, one PR)
Murat 2026-11-09: everything goes on this branch and into PR 1 (still a draft); new order **D (UI) -> C (art) ->
E (balance)**, the balance pass once everything is in place. No PvE threshold: keep the brief's wording ("loses a
little life"). Session D done in the same session as B; C and E each in a new session.

- **A (done)**: baseline sims, shared data, permanent golems, grimoire, auras, golem powers, death bursts, Essence,
  Stone Bond passive, PvP settings, Black Hole (incl. projectile eating), Void Velocity, Void Slip, Colossus split,
  save reset, duel sim updated, tests.
- **B (done)**: wisps (Mob kinds + client placeholder sprite), Void Arsenal (blade, lance, axe, 4 wisps), golem-element Void
  Blades, staff portal attack (~220 px), Essence/wisp expiry (toVoid on time-out), sim (wisps, arsenal, portal), e2e
  (`tools/e2e-summoner.cjs`, `tools/e2e-two-players.cjs`), `npm run bench`, patch note, **open PR 1**.
- **C**: art (hero repaint: tailcoat + scarf, starter kit, wisp sheets, skill icons, skillfx).
- **D (done)**: UI (grimoire panel, HUD: auras, golem respawn, Essence), mobile check.
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

## Done in session B
- `shared/summons.ts`: `WISP` (cap 4, shot per element, last burst per element, Resonance x1.15), `wispEls`, `BLADE_EL`
  + `BLADES_BASE`, `ARSENAL` (blade field, lance, axe, the four wisps), `PORTAL`.
- `shared/voidConjure.ts` (new): `wispTick`, `wispEnd` (toVoid: Essence + Return to the Void, then the burst),
  `openArsenal` (blade field, lance and axe timed with `h.later`, each only with a foe in reach). Server and sim share it.
- `shared/skillEngine.ts`: `ShotSpec.pet` (wisp shots get SUMMON.pvp on heroes, chains too); Void Blades take the
  golems' element (alternating per tick with two), x1.15, and cut `blades/3` harder (Void Edge 5 = x5/3).
- `shared/constants.ts` etc.: Mob kind `wisp` (element in `Mob.weapon`, no new synced field), LOOT / MOB_COMBAT / GEAR_DROP.
- `shared/classes.ts`: Summoner staff `range 220`, `portal: true`; finisher `burst: 30` (`ComboHit.burst`).
- `server/TownRoom.ts`: `spawnWisps` (replaces the old ones, no Essence), `updateWisp` (floats on a ring, no walls),
  expiry and death -> `wispEnd`, `voidArsenal`, `portalShot` (nearest foe within 0.82 of the aim, wall check, sfx
  `portal`), finisher burst in `explode`. `summon()` only counts golem kinds toward SUMMON.max (the Colossus used to
  send wisps back). Stone Bond and the guardian rule skip wisps.
- Client: wisps drawn with the elemental blob of their element, shrunk and floating (`WISP_STANDIN` in textures.ts),
  label "X's Wisp", no thrall tint. Unknown sfx (wisps, wispend, arsenal, portal) ignored for now; the lance flies as
  the default fireball look (kind `voidlance`).
- Sim (`tools/balance/duel.ts`): wisps (`addWisps`, `wispBrain`), Arsenal, portal (bolt only flies its last stretch).
- Tests: `tests/voidconjure.test.ts` (4 tests: wisps, Arsenal, blades element, portal + finisher).
  `tools/e2e-summoner.cjs` rewritten (grimoire, golems, wisps, blades, Black Hole, Arsenal, Colossus).
- Bench: `CAST=1|skill,skill` option in `tools/perf/bots.ts`.

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

## Done in session D (UI)
- `client/src/grimoire.ts` (new, replaces the "Next golem" badge `#attune`): bottom right above the mana orb (phones in
  portrait: higher, above the level-up note). One page per golem slot: element (aura icon), state (fighting, back in
  N s, resting, fused, or why page 2 is shut: level 18 / Twin Bond). Click or tap a page: the four elements, the
  choice is sent as the `grimoire` message. Rebuilt only when the pages change (a rebuild under the pointer swallowed
  taps), countdowns only rewrite their text.
- Server `golemNews` (every 500 ms with autoGolems): private `golems` message {book, slots:[{st, ms?}]}, sent only
  when it changes (`Player.golemSig`, not synced); the client asks again with `golems` once it listens.
- Buff row: golem auras have names, painted icons (`aura_*`, `wisp_shock` in skillArt STATUS_ART), a violet frame
  and no countdown (`isLasting` in shared/buffTimers.ts); topping an aura up no longer resends Player.timers.
- Essence cell: its own tooltip (how it is gained) and its 30 s fade; skill tree hint says the same.
- Wisps: no name label unless under the mouse (four labels cluttered the screen).
- Tests: grimoire news test in `tests/voidconjure.test.ts`. `tools/e2e-summoner.cjs` picks elements by clicking the
  panel. `tools/e2e-summoner-mobile.cjs` (new): desktop, iPhone 13 and Pixel 7, portrait and landscape: panel shown,
  a real tap changes the golem, no overlap with other HUD boxes, no client error. All 5 OK.
- Seen, not fixed (existing HUD, not this work): on phones in portrait the skill bar is wider than the screen (first
  and last buttons cut).

Session B decisions:
- Wisps are hittable (45 HP base, monster scaling): a destroyed wisp also goes back to the Void (Essence + burst).
- Wisps take the golems' elements in turn (fire if no golem); the Arsenal always brings all four.
- Recasting wisps sends the old ones back without Essence (else spamming them would farm Essence).
- PR 1 as a draft (see the sim numbers): to ship, mark it ready for review.

After session B (60 fights/pair, `npx tsx tools/balance/duel.ts 60`), overall:
summoner 51 / 70 / 61 / 62 / 67 / 63 / 71 / 79 / 80 % (Lv 1..50). Against the Wizard 90-100 % at every level
(session A: 35 % Lv 5, ~70 % Lv 20 and 40). Isolation at Lv 5 vs Wizard: all 100 %, old staff (160 px, no portal) 73 %,
no wisps / Arsenal 93 %. Both the 220 px reach and the wisps push it; the sim is 1D, so out-ranging the Wizard
weighs more than in the game. Levers for session E: staff range/damage, wisp damage or fire rate, blades x1.15.

Bench (`npm run bench -- 10 20`, SPREAD=1): tick avg 13.2 ms / p95 20.4 ms; with CAST=1 (5 Summoners at /max spamming
wisps, blades, holes, Arsenal) 21.4 / 34.3 ms; CAST=su_wisps 22.4 / 39.0 ms. Budget 50 ms. The cost is projectiles:
`targetsAround` scans every monster (~5,700) per projectile sub-step (no spatial grid; suggested as a separate task).
Not spread, 10 bots: 8.5 / 12.4 ms (base 9.0 / 12.8).

## Pitfalls
- Player schema is at the 64-field limit: pack new synced data into existing fields.
- `cleanRanks` drops a skill whose parent is missing: tests must set parents too.
- The skill tree slab fits 4 rows: keep each branch at depth ≤ 3 (tests/treeLayout.test.ts).
- `MOB_FIELDS` order: new synced Mob fields go at the end (none added in sessions A and B).
- e2e scripts need a fresh save file per run (an existing account skips the class picker); walking out of town can
  stall, the script re-routes every 5 s. One run out of 5 logged Colyseus decode errors (`refId not found`,
  `utf8Read invalid byte`); not reproduced in 4 more runs, not seen on the base branch in 1 run. Unexplained.
