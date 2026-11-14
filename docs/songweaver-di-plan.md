# Songweaver DI-1 to DI-5: plan (planner, 2026-11-14)

**Not approved for building.** Source: `docs/songweaver-design-ideas.md` and the owner's answers. No new `Player`
field (53 of 64 used) and no new `Mob` field.

## Found in the code
1. `restore()` (`server/TownRoom.ts` ~1056) clears any gear that fails `canWear`. With the new Songweaver rule,
   the non-lute weapon and the shield on every existing Songweaver would be deleted. The migration must run first,
   or the filter must send failures to the bag.
2. The tutorial gift `w_bronze` (`shared/quests.ts:1898`) plus its "equip" step would stall for a Songweaver.
   It needs a class-aware gift.
3. With no mana cost, a Chorus (2 s cooldown) could be re-cast for free gauge fill. Rule: refreshing the same
   Chorus with more than 10 s left logs no note and adds no fill.
4. Kit items can be dropped and sold today. The evolving lute and the Songbook must be bound.
5. Tempo is the generic `sk.stacks`, synced as `Player.stacks`.
6. Song `Field` entities are already synced, so the Chorus ring needs no server change.
7. The gauge can reuse `p.mana` / `p.maxMana` (synced in `mp`). Every refill path must skip the Songweaver:
   regen, potions, respawn, bonfire, `resume`, `applyStats`, the Execute refund and the Echo rune.

## Spec, in short
- **DI-1:**
  - Every `note` event spawns an expanding ring under the caster, tinted by its mode, each a step larger; rings
    fade over ~2.5 s.
  - `fx` gets `ch1` / `ch2` / `chlock` so everyone sees progress and the lockout.
  - A chord bursts the rings; the lockout shows as a dim ring closing in.
  - The chord panel is removed; the legend moves to the skills page "?" (Songbook reader in C2).
- **DI-4:** `songKind(s)` → "Chorus" (songs) / "Verse" (other actives) / "Key change" (Modulate). The ids stay.
  The owner's Chorus always shows a base ring (from the `Field`), Dirge included.
- **DI-3:** `GAUGE` in `shared/songs.ts`.
  - Max 100, stored in `mana`; starts at 0; no regen.
  - Fill: +8 per note, +2 per basic hit (+4 on the strum), +20 per chord, +10 on an Execute.
  - After 4 s idle it drains at 20/s; it empties on death.
  - When full, the book's effect fires (a hidden skill `sg_g_*`), with an `{ev:"swell"}` event; then the gauge
    empties. With no book: a fizzle.
  - All Songweaver `mana:` costs go (cooldowns only). Mana potions are refused with a message.
  - No Tempo stacks.
  - Accelerando scales with the fill (full = today's 5 stacks).
  - Twelve-Tone Storm empties the gauge, ×(0.7 + 0.6 × fill/100), with no book effect.
- **DI-2 books** (shield slot; ask for Magic via `GearDef.req`; block ≤ ~0.05 at Lv 50; normal ids, affixes,
  runes):

  | Book | Source | Stats | Full effect |
  |---|---|---|---|
  | Songbook | kit, bound | none | Refrain: the Chorus beats 3× now and resets to 30 s (no Chorus: party heal 8%); holds collected songs |
  | Hymnal | drop, tier 2 | mag 2, sta 1, block 0.03 | Benediction: party heal 22%, shield 12% |
  | War March | drop, tier 2 | mag 2, sta 1, block 0.03 | Rally: party +18% damage / attack speed, +10% speed, 8 s |
  | Dissonance | drop, tier 2 | mag 3, block 0.02 | Cacophony: nova 40 damage, 500 ms stun, +40 resonance, weak |

  The books also sell at the lute-maker.
- **DI-2 songs** (`SONG_SOURCES` in the new `shared/songbook.ts`; never a drop; each adds a progression and a
  finisher):

  | Song | Source | Progression | Finisher |
  |---|---|---|---|
  | The Gloam's Hum | quest `jelly` | I–V–I | damage, resonance, self-heal |
  | Miller's Round | villager Odo: play a major Chorus within 4 tiles | I–V–vi | party damage and speed |
  | Mirror Pond Air | place: Mirror Pond shore, play a Chorus | i–bII–i | pull, slow, resonance |
  | The Hollow King's Lament | quest `king` | i–V–I (Picardy) | nova and party heal |

  Saves that already finished those quests get the song on load.
- **DI-5 rule:** a Songweaver's weapon slot holds lutes only and her shield slot books only. The ranged slot stays
  open. Other classes may wear books.
- **DI-5 evolving lute:** it stays `songweaver_weapon`. The id gains `@lvl` and a `#traits` segment, so
  `plainId`, `baseId` and `isGearId` must handle `#`.
  - The level follows the hero; the stage stats keep up with the sims' `gearFor` weapons:

    | Stage | Levels | Bonus | Sockets |
    |---|---|---|---|
    | Minstrel's | 1–4 | none | 1 |
    | Journeyman's | 5–9 | atk 2 | 1 |
    | Fine | 10–19 | atk 4, mag 1 | 1 |
    | Master's | 20–34 | atk 7, mag 2 | 2 |
    | Virtuoso's | 35+ | atk 8, mag 3 | 2 |

  - No new look per stage.
- **DI-5 lute-maker:** Wren, a new Oakvale NPC with a shop that stocks the books, buys weapons and shields, and
  breaks them into material.
  - Traits: one per group, at most 3; refitting a group costs again.

    | Group | Trait | Level | Cost | Effect |
    |---|---|---|---|---|
    | Strings | Steel | 5 | 150 g + 6 Tonewood | basic waves bounce once |
    | Strings | Gut | 5 | 150 g + 6 Tonewood | +15% resonance |
    | Strings | Silk (exotic) | 18 | 600 g + 8 Silk + 10 Tonewood | bounces lose no damage |
    | Body | Wide Bowl | 12 | 400 g + 8 Tonewood | +15% Chorus radius |
    | Body | Deep Bowl | 12 | 400 g + 8 Tonewood | low notes +15% |
    | Body | Horn Bowl (exotic) | 24 | 900 g + 8 Horn + 10 Brass | chords fill the gauge +50% |
    | Tuning | Bright | 25 | 800 g + 6 Brass | +8% ally power in bright modes |
    | Tuning | Dark | 25 | 800 g + 6 Brass | +8% foe power in dark modes |
    | Tuning | Bone Pegs (exotic) | 30 | 1500 g + 10 Bone + 4 Sunglass | drain waits +4 s; full effect +15% |

  - Materials are counters per hero, not bag items.
    - Breaking: a weapon gives Tonewood, a shield or book gives Brass, both scaled by tier and rarity; runes come
      back to the bag.
    - Monster drops, credited on kill: Bone (skeletons, Hollow King), Silk (silkwretch, weaver), Horn (tusk
      beasts), Sunglass (desert).

## State and saves
- Gauge in `mana`. Chord progress in `fx` words. Book in `p.shield`, lute in the `p.weapon` id, each mirrored into
  `sk`.
- Collected songs and materials are server-side, sent to the owner in a `"songbook"` message.
- New optional save fields `swSongs`, `swMats`, `swKit`.
- Migrations in `migrateSongweaver`, run in `restore` before the gear filter:
  - v1 (B): the shield moves to the bag; the Songbook goes into the shield slot.
  - v2 (D1): a non-lute weapon moves to the bag; the lute is restored and set to the hero level; songs for
    already-finished quests are granted.
  - If the bag is full: the stash, else sold with a chat note.
- Nothing to migrate for Tempo, and no tree version bump.

## Phases (one PR each)
| PR | Scope | Depends on | `TownRoom.ts` |
|---|---|---|---|
| A | DI-1 rings, DI-4 naming and Chorus ring | none | no |
| B | DI-3 gauge, Songbook and Refrain, mana and Tempo removal, migration v1, sims, cooldown retune | none | yes |
| C1 | DI-2 three books, effects, Magic requirement, loot, art | B | yes |
| D1 | DI-5 musical-only rule, evolving lute, migration v2, tutorial gift, bound items | B | yes |
| C2 | DI-2 song collection (4 songs, sources, Songbook reader, save) | B, A | yes |
| D2 | DI-5 lute-maker, shop, breaking, materials, traits | D1, C1 | yes |

A runs in parallel with B. The `TownRoom.ts` changes go in order: B → C1 → D1 → C2 → D2.

## Risks
- **Mana removal is a buff:** retune cooldowns +15–25% so the balance targets still hold.
- **Chorus spam:** the refresh rule closes it.
- **Sims:** the mana model has to branch for the gauge, and `sk.book` / `sk.lute` must be set from `gearFor`.
- **Stacking:** book effects on top of finishers and uncapped PvP heals; watch the Hymnal build.
- **Loot feel:** weapon and shield drops become material.
- **Saves:** the restore filter, a full bag, a lost lute.
- **Phones:** the Songbook reader and the lute-maker panel must fit 360×640.
- **`refId`:** no schema change, so no new cause.

## Planner's open questions (recommendations)
1. Collected songs count only while the Songbook is worn: yes.
2. The lute's stats grow automatically with level; the lute-maker is for traits only: yes.
3. Monster materials are credited on kill (no ground drop): yes.
4. The ranged slot stays open for the Songweaver: yes.
5. The Echo rune fills the gauge by its %: yes.
6. Breaking works only at the lute-maker: yes.

Full per-phase file plans and acceptance criteria: planner report, 2026-11-14 (session log). Rebuild them per
phase from this summary when a phase starts.

## Owner answers (2026-11-14)
- Q3: **monster materials drop on the ground** like other loot, to stay consistent with the game's feel. They're
  picked up as ground items and credited to the material counters on pickup.
  - Open detail, orchestrator default: everyone sees the drop, but only a Songweaver can pick it up. Other heroes
    see it greyed, as with gear they can't wear.
- Q1, Q2, Q4, Q5, Q6: planner's recommendations stand (orchestrator default).
- **Balance: ignore for now.** Get the game feel right first and rebalance later.
  - No cooldown retune and no balance targets in these phases.
  - Still run the duel/PvE sims and put the numbers in each PR, as CLAUDE.md's merge rule requires, as
    information only.

## Build (owner, 2026-11-14: "start whatever you can in parallel, build to end")
- Integration branch: `claude/songweaver-ideas`, one PR at the end.
- Phase order for `shared/` and `server/` (one gameplay engineer at a time): A-shared → B → C1 → D1 → C2 → D2.
- Client, art, sound and text work runs in parallel against the contract below.

## Interface contract (orchestrator). Agents build against it; changes go through the orchestrator.
- **`fx` status words (all units):**
  - `ch1`, `ch2`: notes so far toward a known progression;
  - `chlock`: chords locked.
- **Helpers:**
  - `songKind(s): "Chorus" | "Verse" | "Key change" | undefined` (`shared/songs.ts`);
  - `chordProgress(sk, progs?)`.
- **Gauge:** the Songweaver's gauge lives in `mana` / `maxMana` (max 100, starts at 0); `p.stacks` stays 0.
- **Events (`broadcast("sfx", …)`):**
  - `{ ev: "swell", id, book, x, y, fizzle? }`: gauge full; `book` = equipped book id or `null` (then
    `fizzle: true`);
  - `{ ev: "newsong", id, song }`: a song collected;
  - `{ ev: "matpick", id, mat, n, x, y }`: materials picked up;
  - `{ ev: "lutefit", id, trait }`: a trait fitted;
  - `{ ev: "break", id, mat, n }`: an item broken.
- **Hidden skills (in `FINISHERS`):**
  - full-gauge effects: `sg_g_refrain` (Songbook), `sg_g_bless` (Hymnal), `sg_g_rally` (War March),
    `sg_g_cacoph` (Dissonance);
  - song finishers: `sg_f_hum`, `sg_f_round`, `sg_f_undertow`, `sg_f_picardy`, with `prog` values `hum`,
    `round`, `undertow`, `picardy`.
- **Items:**
  - Songbook kit: `songweaver_shield`; books: `bk_hymnal`, `bk_march`, `bk_dissonance`.
  - Lute: `songweaver_weapon@<lvl>#<trait>.<trait>` (`#` segment before `^` runes).
- **Lute traits:** `steel`, `gut`, `silk` (Strings) · `wide`, `deep`, `horn` (Body) · `bright`, `dark`,
  `bonepegs` (Tuning).
- **Materials:** `tonewood`, `brass`, `bone`, `silk`, `horn`, `sunglass`. Ground items carry the id `mat_<id>`
  (e.g. `mat_silk`); only a Songweaver can pick them up.
- **Songs:** `song_hum`, `song_round`, `song_pond`, `song_lament`.
- **NPC:** `lutemaker` (Wren, Lute-maker), in Oakvale.
- **Messages:**
  - server→owner: `"songbook" { songs: string[], mats: Record<string, number> }`, on join and on change;
  - client→server: `"break" { bag: number }`, `"lutefit" { trait: string }`.
