# Songweaver: design ideas (backlog)

The owner's design ideas, recorded as given (messages that start with "DI"). **Not approved for building.**
Nothing here gets implemented until the owner asks for it. When an idea is picked up, move it into
`docs/songweaver-progress.md` with a date.

## Ideas

### DI-1 (2026-11-14): chord progress as rings under the feet
Show progress through the 3-chord progression as expanding song rings below the player's feet, instead of the
current chord HUD panel (`client/src/chordHud.ts`) that pops up with the progression.
- Open (for later): one ring per logged note (up to 3)? Colour per degree or per mode? What signals the lockout,
  and how does a near-complete chord read? Keep the "?" legend somewhere? Visible to the owner only, or to
  everyone (the `"chord"` message is owner-only today)?
