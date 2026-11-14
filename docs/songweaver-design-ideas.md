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
