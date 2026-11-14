# Songweaver: design ideas (backlog)

The owner's design ideas, recorded as given (messages that start with "DI"). **Not approved for building.**
Nothing here gets implemented until the owner asks for it. When an idea is picked up, move it into
`docs/songweaver-progress.md` with a date.

## Ideas

### DI-1 (2026-11-14): chord progress as rings under the feet
Show progress through the 3-chord progression as expanding song rings below the player's feet, instead of the
current chord HUD panel (`client/src/chordHud.ts`) that pops up with the progression.
- Owner answers (2026-11-14):
  - **One ring per note played** (up to 3); the rings fade out.
  - **Colour:** orchestrator's choice. Proposal: tint by the current mode (same palette as the song rings: major
    gold, minor blue, lydian pale violet, dorian green, phrygian crimson), each new ring a step larger and
    brighter. A completed chord flashes all three and bursts.
  - **Other players see the rings.** Chord progress is owner-only today (the `"chord"` message), so it would need
    to become visible to nearby players, e.g. via the `fx` status words or the existing `note` event.
- Open: how the 12 s lockout reads with fading rings (perhaps a dim, slowly closing ring).

### DI-2 (2026-11-14): the Songbook
The Songweaver carries a small **Songbook** item.
- It holds the chord legend (what the "?" button on the chord HUD shows today).
- It **collects songs**.
- Owner hint: maybe new songs to collect, i.e. songs found or earned in the world rather than only learned from
  the tree. Not designed yet.
- Owner (2026-11-14): **the Songbook is equipment.** That opens design space for **other books**, each
  supporting a play style (e.g. a hymnal book for healers, a war-march book for party buffs, a book of
  dissonance for solo damage).
  - Owner (2026-11-14): **books go in the `shield` slot.** No new gear slot and no new `Player` field.
- Open: where songs come from (drops, quests,
  NPCs, places); what a collected song does (a new song skill, a new progression or finisher, a mode, a
  cosmetic tune); how it saves (a new optional save field).

### DI-3 (2026-11-14): the mana bubble becomes a song gauge
For the Songweaver, the mana bubble works as a gauge instead of a pool:
- It **starts empty** and has **no natural regen**.
- It **fills with each note played**.
- When **full**, it **triggers a special effect**, then **empties completely** and the cycle starts again.

Orchestrator notes for when it's picked up:
- Today Songweaver skills **cost** mana (it's a `manaClasses` class), so mana stops being a cost. Skills then need
  a different limit, such as cooldowns only, or some other cost.
- Overlap with what exists: **Tempo** stacks (built by notes, spent by Twelve-Tone Storm) and the chord finishers.
  Decide whether the gauge replaces Tempo or sits beside it.
- Open:
  - what the special effect is (fixed, chosen by branch or mode, or set by the equipped book, see DI-2);
  - whether basic-attack notes fill it or only skill notes;
  - whether chords fill it faster;
  - what mana potions do;
  - whether it drains when out of combat or on death;
  - how the sims model it (`tools/balance/duel.ts` and `pve.ts` use the mana model today).

### DI-4 (2026-11-14): Verses and Choruses
- Rename the Songweaver's skills by kind: **attacks are "Verses"** and **auras (songs) are "Choruses"**.
- **Choruses are mutually exclusive:** only one can be active at a time. This matches today's rule of one song
  per Songweaver (`SkillRuntime.song`).
- **The current Chorus always shows a visible effect under the feet.**
  - Today the caster gets no ring while Dirge plays, because Dirge has no party buff; only allies with the buff
    get one. So this is a real change, not just a rename.

Orchestrator notes for when it's picked up:
- Mostly player-facing text:
  - skill descriptions;
  - tree and tooltip labels (`client/src/talents.ts`);
  - the content doc;
  - the patch note.
  Ids (`sg_*`) stay as they are.
- Decide which skills are Verses: every non-song active (notes, Shrill Note, Cracked String, Mending Note …),
  and whether the basic attack counts as one.
- Under the feet, layer with DI-1: the Chorus effect is the steady base ring, and the chord-progress rings
  expand above it.

### DI-5 (2026-11-14): Songweaver equipment rethink, an evolving lute
Problem (owner, 2026-11-14): itemisation doesn't fit the class.
- Untyped weapons do turn into lutes, but no loot touches the music (keys, notes, resonance, bounce, songs,
  chords).
- Typed wands and staves replace her sound waves with their own basic attack.
- The shield slot competes with the Songbook (DI-2).

Direction:
- The Songweaver **can't equip non-musical weapons or shields**.
- Weapon slot: the lute only. Shield slot: books only (DI-2).
- Instead of lute drops, the **lute evolves**.

Orchestrator notes for when it's picked up:
- Open:
  - **What drives the evolution:** level, chords played, resonance bursts, songs collected (DI-2), materials
    from monsters, or a luthier NPC in Oakvale.
  - **What it gives:** stats growing with level (so it keeps pace with drops), plus musical traits: extra
    bounces, wider song radius, resonance gain, a note register, a key affinity. These are a natural home for the
    "tuned lutes" from owner question 13.
  - **Choice or fixed track:** branching upgrades per play style, like the books.
  - **Look:** the lute art changes per stage (generated in `tools/art`).
  - **Armour, hat, shoes:** still normal drops?
- Loot impact: weapon and shield drops become useless to her. Either sell value, or a conversion into evolution
  material, so loot still feels rewarding.
- Constraints:
  - `canWear` in `shared/gear.ts` gets a class rule;
  - saves need a migration for Songweavers already holding a non-lute weapon or a shield (unequip them to the bag);
  - lute state saved as an optional field or encoded in the item id (ids must round-trip, as in
    `tests/runes.test.ts`);
  - balance: the sims use gear stats.

## Owner answers (2026-11-14)
Unanswered questions take the orchestrator's default (marked *default*).

**DI-1**
- 1.1 *default*: the lockout shows as a dim ring slowly closing in.
- 1.2 *default*: rings are tinted by the current mode, each new one a step larger and brighter; a finished chord
  flashes all three and bursts.

**DI-2**
- 2.1 Songs come from **quests, villagers and special places, never a plain drop**.
- 2.2 A collected song gives a **new chord progression or finisher**.
- 2.3 *default*: the first books are Hymnal (healing), War March (party buffs) and Dissonance (solo damage).
- 2.4 Books are **not class-locked**. They have a **very low block stat**, so for other classes they work only as
  a poor shield.

**DI-3**
- 3.1 *default*: Songweaver skills are limited by cooldowns only.
- 3.2 **Open: to discuss** (gauge vs Tempo).
- 3.3 The special effect is **set by the equipped book**.
- 3.4 **Basic attacks fill a little.**
- 3.5 **Chords fill it faster.**
- 3.6 Mana potions do **nothing for now** (design space for later).
- 3.7 **It drains after a short time with no action.**

**DI-4**
- 4.1 **The basic attack is a Verse.**
- 4.2 *default*: Verse = every skill that isn't a song.
- 4.3 *default*: the Chorus is the steady base ring; the chord rings expand on top of it.

**DI-5**
- 5.1 **Levels unlock options at a lute-maker**; more exotic options **also cost monster materials**.
- 5.2 Growth gives **stats that keep up with drops, plus musical traits**.
- 5.3 Traits chosen at the lute-maker are **mutually exclusive or limited in number**, so a player can't have
  everything at once.
- 5.4 **No new look per stage for now.**
- 5.5 **Armour, hat and shoes still drop as normal.**
- 5.6 Weapon and shield drops are **sold for gold or broken into material** (for the lute-maker).
- 5.7 *default*: on login, a Songweaver's non-lute weapon or shield moves to the bag.
