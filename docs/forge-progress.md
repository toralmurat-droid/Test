# The Forge (roadmap M4): progress log

A clan researches its own weapon or monster from parts that already exist, and the balance sims must pass it before
it can appear. Plan: four PRs.

| PR | Scope | State |
|---|---|---|
| PR1 | Rules and sim gate: `shared/forge.ts`, forged ids in `shared/gear.ts`, `mobSpec(..., { variant })`, `tools/balance/forgeGate.ts`. No live effect. | done (branch `claude/forge-rules`) |
| PR2 | Server live loop: registry and saves, research (`FORGE.researchDays`), cost (`FORGE.armyCost`), gate in a worker thread, forged monsters in the clan's lands, `applyVariant` in the server's mob definition, affixes through the champion machinery. | to do |
| PR3 | Client art: palettes on the base sprites and weapon icons, "Forgotten" items. | to do |
| PR4 | War councils order forgings (`validateRecipe` on the council's order). | to do |

## Owner defaults (2026-11-17), recorded in `FORGE`
- `researchDays = 1`; `armyCost = 0.1` (a share of the clan's army; used from PR2).
- Forged monsters only in the clan's own lands for now (`FORGE.mobsIn = "lands"`), not in troops or garrisons.
- Act 3-6 kinds without a champion family (bog hag, vulture, Gullet Worm, court magus, crown crow) take no affixes.
- No emails (owner approval pending).

## PR1: what exists
- **Recipes** (`WeaponRecipe`, `MonsterRecipe`) and `validateRecipe(raw)`: every problem has a code (`ForgeErrorCode`);
  names are folded like `cleanText`, ASCII letters, digits, space, `'` and `-`, at most 32 characters.
- **Weapons**: base = a typed weapon anyone can find (`isForgeWeaponBase`: has a `wtype`, no class kit, book or lute;
  the planner's list allowed untyped class weapons too, but those take the hero's weapon shape and name, so they are left
  out). 1-3 built-in gear affixes (value up to a level-1 Legendary roll, they grow with the item level like the base
  bonus), an optional element share (<= 0.5, steps of 0.05), a palette from `FORGE_PALETTES` (closed list).
- **Item ids**: `fg<seq>_<baseGearId>`, then `@level`, `~R:affixes`, `^runes` as usual. `setForgedGear(lookup)` plugs the
  registry into `gearDef` / `isGearId` / `gearName` / `weaponType` / `socketsOf` / runes; `clearGearCache()` after any
  change. Unknown forging: "Forgotten <noun>" with the base's stats; `retired` keeps its stats; `revoked` = base stats
  (name kept). A forged weapon's tier (requirements) is the lowest tier whose strongest GEAR weapon it doesn't beat.
- **Monsters**: base from `FORGE_MOB_BASES` (derived: spawns in a `SPAWN_ZONES` zone, not elite / boss / summon /
  blobling / trooper / Night Raider), up to 2 affixes of its family, `weapon` for skeletons and bandits (cutthroat,
  brute, archer), multipliers in `FORGE.range`. `ForgedMob` keeps `kind = base`; `applyVariant(def, v)` gives the
  MobDef (HP, damage, speed multiplied, XP x mobPower).
- **Budgets**: `itemPower <= weaponBudget x TOP_WEAPON_POWER` (Dragonfire, 12.85 -> cap 14.1); `mobPower = hp x dmg x
  speed^0.5 x (1 + affix costs + affixPair when two) <= mobBudget`.
- **Gate**: `forgeGate(def, { runs, seed, timeoutMs, levels })` -> `{ ok, reasons, numbers }`. Seeded (Math.random is
  swapped for mulberry32 from a hash of the recipe's game parts, restored after), fails closed (invalid recipe,
  timeout, error). CLI: `npx tsx tools/balance/forgeGate.ts <recipe.json>`; reference recipes in
  `tools/balance/forge-recipes/`.

## Calibration (PR1)
Numbers changed from the plan, with the reason:

| Value | Plan | Now | Why |
|---|---|---|---|
| `weight.reach` | 60 per 1.0 | 8 | at 60 Skyreach weighs 44 and sets a roof no attack weapon could reach; at 8 the three tier-3 weapons weigh 12.8 / 12.9 / 11.8 |
| `weight.elemFlat` | 0.9 | 1.2 | an Oak Staff with +3 fire per hit (13.25, in budget at 0.9) made the Wizard kill 17% faster |
| `affixCost` | (unset) | split 0.75, siege 0.35, risen 0.35, gang 1.25, sunborn 0.25, brand 0.25, taint 0.2, stitched 0.2, deepvenom 0.2, buried 0.15, veil 0.15 | measured: each affix alone at 1/1/1, worst cell of seconds / HP lost per kill vs the plain base, / 1.3 |
| `affixPair` | (none) | 0.2 | Siegewright + Risen stack (it gets up beside its ballista): 2.0-2.3x seconds per kill at 0.7 summed cost |
| `gate.runs` | 12 | 24 | a 12-fight cell is noisy; 24 still runs in ~1 s (monster) / ~4-9 s (weapon) |
| `gate.hpFloor` | (none) | 0.1 | HP-lost ratios of near-free fights (Lv 1 blobs) divide by ~0 |
| weapon checks | per class and level | per class, pooled over levels, 4 duels per run | one cell of 24 mirror duels has SD ~0.07 against a 0.6 line |
| monster cap | 1.3 x mobPower | 1.3 x min(mobPower, mobBudget) | the sim holds the budget even if the formula were bypassed |

`weaponBudget` 1.1, `mobBudget` 1.8, `minWin` 0.7, `weaponGain` 0.15, `duelMax` 0.6 stay as planned.

### Reference recipes (default seed, 24 runs)
Monsters (cell: seconds / HP lost per kill vs the plain base, worst cell; cap 1.3 x power):

| Recipe | Power | sec max | HP max | Verdict |
|---|---|---|---|---|
| sane: tuskborn 1.2/1.1/1 Hide-Stitched | 1.58 | 1.27 | 1.00 | PASS |
| sane: wight 1.1/1/1 Risen | 1.49 | 1.61 | 1.00 | PASS |
| sane: outrider 1.3/1.35/1 | 1.75 | 1.41 | 1.00 | PASS |
| borderline: skeleton axe 0.9/0.9/1 Siegewright + Risen | 1.54 | 2.02 (cap 2.00) | 1.60 | FAIL (passes on other seeds) |
| borderline: bandit cutthroat 0.9/0.88/1 Ringleader | 1.78 | 2.32 (cap 2.32) | 1.00 | FAIL by a hair |
| strong: skeleton 1.6/1.4/1.15 Siegewright + Risen | 4.56 | - | - | rejected: over_budget |
| strong, costs zeroed (formula bypassed): skeleton 1.4/1.2/1 Siegewright + Risen | 1.68 | 2.85 | 3.41 | FAIL in the sim |
| strong, costs zeroed: bandit 1.5/1.2/1 Ringleader | 1.80 | 3.11 | 1.51 | FAIL in the sim |

Weapons (per class: zone-run gain / duel win vs the usual gearFor weapon, Lv 22 and 30; caps 15% / 60%):

| Recipe | Power | wizard | vampire | summoner | Verdict |
|---|---|---|---|---|---|
| sane: Bastard Sword +2 atk +1 Str | 7.20 | -54% / 6% | -13% / 49% | -16% / 22% | PASS |
| sane: Wanderer's Katana +2 atk +2 Dex | 6.80 | -47% / 6% | -3% / 44% | -18% / 16% | PASS |
| sane: Oak Staff +3 atk +2 Mag, 30% fire | 8.45 | 3% / 55% | 4% / 43% | -4% / 50% | PASS |
| sane: Ember Axe +3 atk +2 Str, 50% fire | 13.45 | -40% / 4% | 2% / 53% | -23% / 15% | PASS |
| borderline: Starfire Wand +1 Dex | 12.40 | 11% / 51% | -8% / 55% | -3% / 50% | PASS (wizard duels 51-61% over 4 seeds: FAIL on 1) |
| strong: Starfire Wand +1 atk +1 Mag (in budget) | 14.00 | 13% / 78% | 2% / 49% | 12% / 63% | FAIL in the sim |
| strong: Starfire Wand +3 atk +3 Mag +3 faith, 50% faith | 22.6 | - | - | - | rejected: over_budget (sim: 27% / 88% wizard) |

Duel / PvE numbers are unchanged: with `Math.random` seeded the same way, `pve.ts 30 --champions`, `pve.ts 20 --zones`
and `duel.ts 60 --brief` print byte-identical output before and after this PR.

## Open for PR2+
- The server registry: persist forgings (seq, recipe, status) with the war state; call `setForgedGear(forgeLookup(...))`
  on load and on every change. Save data gets new optional fields only.
- The gate in a worker thread (`forgeGate` is pure and seeded, so a worker can just call it).
- Forged monsters: `applyVariant` in the server's mob definition, affixes through `server/champions.ts` without the
  champion HP / damage multipliers, rune or title; gold x `forgedRewardMult`.
- Starfire Wand forgings sit close to the lines for the Wizard (+1 Dex alone: 3-12% faster, 51-61% of duels against the
  Dragonfire the sim bots carry): by design (the gate compares to the usual gear), worth knowing for PR4's councils.
