# Summoner « Void Lord » rework: progress

Spec: the brief « Refonte de la classe Invocateur : Maître du Néant » (Murat 2026-11-08).
Work branch: `claude/pensive-mccarthy-2razu7`. PR 1 opened at the end of session B, **as a draft** (drafts are never
auto-merged): the duel sim shows the Summoner far too strong against the Wizard (see below). Murat (2026-11-09):
PR 1 stays a draft until the balance work (PR 3) is done; sessions C-E keep pushing to this branch.

## Plan (5 sessions, one PR)
Murat 2026-11-09: everything goes on this branch and into PR 1 (still a draft); new order **D (UI) -> C (art) ->
E (balance)**, the balance pass once everything is in place. No PvE threshold: keep the brief's wording ("loses a
little life"). Session D done in the same session as B; C done 2026-11-09 in its own session; E (balance) is next.

- **A (done)**: baseline sims, shared data, permanent golems, grimoire, auras, golem powers, death bursts, Essence,
  Stone Bond passive, PvP settings, Black Hole (incl. projectile eating), Void Velocity, Void Slip, Colossus split,
  save reset, duel sim updated, tests.
- **B (done)**: wisps (Mob kinds + client placeholder sprite), Void Arsenal (blade, lance, axe, 4 wisps), golem-element Void
  Blades, staff portal attack (~220 px), Essence/wisp expiry (toVoid on time-out), sim (wisps, arsenal, portal), e2e
  (`tools/e2e-summoner.cjs`, `tools/e2e-two-players.cjs`), `npm run bench`, patch note, **open PR 1**.
- **C (done)**: art (hero repaint: tailcoat + scarf, starter kit, wisp sheets, skill icons, skillfx), sounds.
- **D (done)**: UI (grimoire panel, HUD: auras, golem respawn, Essence), mobile check.
- **E (done, 2026-11-09)**: balance against the Vampire (Murat: the Wizard matchup as low as it goes, see below).

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
After merging the spatial grid (base PR #374, server/mobGrid.ts) on 2026-11-09: SPREAD=1 15.7 / 24.3 ms,
CAST=su_wisps 19.8 / 28.9 ms. The base's CAST now casts every listed skill every 100 ms and every bot takes /max, so
CAST=1 (24.4 / 36.0 ms, 734 active monsters) is not comparable with the numbers above.
Not spread, 10 bots: 8.5 / 12.4 ms (base 9.0 / 12.8).

## Done in session C (art and sounds)
Murat's answers (2026-11-09): bare-headed with the scarf, tailcoat OK, also a pass on the sounds, the extra effects
too, but sober. Two looks proposed (`docs/art/summoner-proposals.png`: A charcoal and plum, B Void black); **Murat
picked A (2026-11-09)**, the one in place.
- Body painter (`tools/art/paint/body.ts`): torso kind `tailcoat` (open front over a waistcoat `vest`, lapels and piping
  in `trim`, buttons in `buckle`, no belt) with two tails to mid-thigh (`coatTails`: behind the legs from the front and
  side, over them from behind; they swing with the gait and fly back at a run). `Look.scarf {col, band}`: wound round
  the neck after the head (`scarfWrap`), two ends as ribbons on a travelling wave (`scarfEnds`): stirring at rest,
  swinging walking, streaming back running (from the front they hang either side of the coat's opening and fly up past
  the shoulders at a run). Motion comes from the pose (`phase`, `run`), so walk/run loops stay seamless. `palmFlame`
  takes a cold colour now (violet Void flame); warm flames keep their orange heart.
- Kit (`look.ts` KITS.summoner, `shared/gear.ts`): Binding Rod (Void flame), Warlock's Tailcoat (armour, style
  `tailcoat`), Void Scarf (hat slot, style `scarf`), Warlock's Boots. Item ids unchanged (saves fine). New 16px icons
  `scarf` and `tailcoat` in `tools/art/gear.ts`. The bare body (summoner.webp) is unchanged.
- Wisps (`tools/art/paint/wisps.ts`, sheets `mob_wisp_<element>` 16x22, 12 frames): an orb of the element with a dark
  Void eye and a violet rim, floating above its shadow (fire flame tongue, frost shards, venom drip, storm spikes);
  wind / strike frames gather and flare. Client: `textures.ts` loads them (smooth look), the blobs stay for ?pixel=1.
- Icons (`client/src/skillArt.ts`): 15 new paintings (Stone Bond, Golem Mastery, Resonance, Twin Bond, Rift Step
  repainted, Black Hole, Void Velocity, Gravity, Void Slip, Event Horizon, Void Blades, Elemental Wisps, Void Edge,
  Return to the Void, Swarm, Void Arsenal); `BORROWED` and the 12 old-tree icons are gone. Sheet:
  `npx tsx tools/art/preview/summoner-icons.ts out.png`.
- Effects (`client/src/skillfx.ts`, "the Summoner's Void" section): staff portals (two small upright rifts), Black Hole
  and Event Horizon ground disc with a turning rim and motes spiralling in, swallow / eatshot / holeclose / voidhop,
  Void Blades (3, or 1 for the Arsenal) wheeling round the hero edged in the first grimoire page's element, the
  lance projectile (`voidlance`) with a trail, the axe sweep (`axeSweep`), Arsenal opening, Void Slip (shards, then a
  rift where the hero comes back), wisps out of rifts and their elemental burst, golem nova / death / Colossus split,
  Return to the Void motes, grimoire page puff.
- Sounds (`client/src/sfx.ts`): voidPortal, voidOpen (Black Hole / Event Horizon cast), voidClose, voidGulp, voidEat,
  voidSpit, voidSlip, voidArsenal, voidLance (lance launch), wispCall, wispEnd (by element), golemNova, golemCrumble,
  voidReturn and pageTurn (only for the Summoner themself). Low volumes, rate-limited (`minGap`).
- Generation (only the Summoner, ~5 min): `npx tsx tools/art/paint/new-hero.ts summoner`, then
  `npx tsx -e "import { buildMobs } from './tools/art/paint/mobs'; buildMobs('client/public/assets/hd/mobs', ['mob_wisp_fire','mob_wisp_cold','mob_wisp_poison','mob_wisp_shock'])"`.
  Only the Summoner kit overlays, the gear icon atlas, the wisp sheets and mobs.json change (checked with git status).
- Previews in `docs/art/`: kit-preview (idle and run), wisps, icons, the two proposals.
- Checks: `npm test` OK (one unexplained failure on the first of 4 runs, the 3 others clean), `npm run build` OK,
  smoke OK, `tools/e2e-summoner.cjs` and `tools/e2e-summoner-mobile.cjs` OK (production server, fresh save each);
  the wisps use their painted sheets in the browser.

Session C limits (to revisit):
- The client can't know Void Edge ranks or Twin Bond: Void Blades always show 3 blades and take the first page's element.
- The scarf is a hat-slot overlay drawn over the armour overlay: where the scarf trails behind the body it can paint a
  few pixels over the coat's edge. A found hat replaces the scarf.
- The old pixel look (?pixel=1) still shows the old class sheet (as for every hero there).
- Golems have no footstep sounds (four permanent golems stomping would be noise).

## Session E (balance)
Murat (2026-11-09): target overall 45-55 % at every level and no matchup above 65 %; Summoner numbers only; the PR stays
a draft until Murat marks it ready himself.

Baseline (`npx tsx tools/balance/duel.ts 150`), Summoner vs Wizard / vs Vampire:
Lv1 100/0, Lv5 100/32, Lv10 99/25, Lv15 99/13, Lv20 94/41, Lv25 95/37, Lv30 96/49, Lv40 93/67, Lv50 89/79;
overall 50 66 62 56 67 66 72 80 84 %. The other classes are off too: Vampire 98 % at Lv1, 17-25 % at Lv40-50; Wizard
1-2 % at Lv1, 28-41 % from Lv5 to 25.

Levers (`tools/balance/summoner-levers.ts`, one part off at a time, 150 fights, Lv 5/20/40, vs Wizard and vs Vampire):
- Nothing about the kit's numbers moves the Wizard matchup below ~85 %: staff range 175 or 160, no portal, portal exit
  45-60 px, staff damage 14-15, no wisps / Arsenal / Blades / Black Hole / Colossus / auras / Stone Bond, golems halved
  (`SUMMON.pvp` dmg 0.425, hp 0.5): all 82-100 % against the Wizard.
- With no golems at all the Summoner still wins 64-71 % against the Wizard (range 220), 41-59 % with range 175.
- Golems at a quarter in PvP (dmg/hp 0.25, cc 0.1) and range 175: Wizard 67 / 89 / 82 %, but Vampire 7 / 1 / 41 %.
- Against the Vampire the golems carry everything (no golems: 1 %).
So the two matchups pull opposite ways: what would bring the Wizard down to 65 % breaks the Vampire matchup.
Why the Wizard loses (damage probe, Lv 20): the 220 px staff out-ranges its 170 px (it fires ~3 basic bolts a
fight); its skills land on the golems and wisps around the Summoner; the portal bolt is almost never dodged.
Sim changes made while probing (`tools/balance/duel.ts` SIM): `kitePets` (on: a ranged bot backs away from a melee
creature closing in, it used to stand in the golems' blows; overall numbers barely moved), `golemBlock` and
`aimHero` (off by default, levers only: a golem stops every shot in its path on a line / bots aim point skills at the
hero; neither moved the Wizard matchup).

Murat's call after this (2026-11-09): balance against the Vampire, and leave the Wizard matchup if nothing fixes it.
Changes (each measured with the lever runs, 300-400 fights for the final checks):
- Staff reach 220 -> 175 px (`shared/classes.ts`): the Wizard (170 px) can shoot back; Vampire matchup unchanged.
- Stone Bond `SUMMON.guardShare` 0.3 -> 0.4 (Lv 1-20; still 22 % from Lv 25): Lv 5-15 against the Vampire +8-10 points.
- `SUMMON.pvp.hp` 1 -> 1.3: golems last longer against heroes (Lv 5-15 again).
- `SUMMON_SCALE.rate` 0.4 -> 0 and Golem Mastery 8 -> 5 % per rank: the Lv 40-50 lead shrinks.
- Void Arsenal damage x0.7 (blade 5, lance 10, axe 11): Lv 40-50 again.
- PvE: `SUMMON.guardHold` 1 (new, `server/TownRoom.ts` guardOf and the summon aggro check, counted once per tick;
  `tools/balance/pve.ts` mobTarget): a golem keeps one monster busy (the Colossus two), the others go for the Summoner.
Results (`npx tsx tools/balance/duel.ts 300`), Summoner vs Vampire / vs Wizard:
Lv1 1/85, Lv5 58/96, Lv10 43/90, Lv15 36/98, Lv20 42/94, Lv25 39/90, Lv30 44/90, Lv40 70/88 (two 400-fight runs: 62
and 65), Lv50 63/89 (400: 66, 63); overall 43 77 67 67 68 64 67 79 76 %. Lv1 against the Vampire stays ~0 % (the
Vampire wins 98 % of Lv1 duels against every class). The Wizard matchup stays 85-98 %: nothing in the Summoner's kit
moves it without breaking the Vampire one. Overall stays above 55 % because of the Wizard.
PvE (`tools/balance/pve.ts`): HP lost per kill rounds to 0 % at every level, before and after (per-mille measure: 0.0-0.8 %
with guardHold 1, 0.3-1.6 % with no guardian at all, Wizard 0.4-5 %); every boss 100 %, Night Raider as before. The
sim's ranged heroes hardly get hit in zones; the brief's "loses a little life" is not reached in the sim.
Checks: `npm test` 100 pass (the portal test target moved to 150 px, inside the new reach), build, smoke, desktop e2e
OK. Mobile e2e: 4 runs, each with 1-3 of 5 devices failing; the base commit (before E) fails the same way (the hero
stalls walking out of town, golems then "resting"). One run logged Colyseus `refId not found` on 2 devices (the
session B issue, still unexplained). Bench `SPREAD=1`: 13.0 / 18.1 ms; `SPREAD=1 CAST=1`: 16.0 / 23.8 ms.
Out of scope, worth a task: the Wizard is the weakest class (6-55 % overall) and the Vampire swings from 98 % (Lv1) to
21 % (Lv50).

## Pitfalls
- Player schema is at the 64-field limit: pack new synced data into existing fields.
- `cleanRanks` drops a skill whose parent is missing: tests must set parents too.
- The skill tree slab fits 4 rows: keep each branch at depth ≤ 3 (tests/treeLayout.test.ts).
- `MOB_FIELDS` order: new synced Mob fields go at the end (none added in sessions A and B).
- e2e scripts need a fresh save file per run (an existing account skips the class picker); walking out of town can
  stall, the script re-routes every 5 s. One run out of 5 logged Colyseus decode errors (`refId not found`,
  `utf8Read invalid byte`); not reproduced in 4 more runs, not seen on the base branch in 1 run. Unexplained.
