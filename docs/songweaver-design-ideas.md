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
- Open: what it is in game (a gear slot, a bag item, a HUD button); where songs come from (drops, quests,
  NPCs, places); what a collected song does (a new song skill, a new progression or finisher, a mode, a
  cosmetic tune); how it saves (a new optional save field).
