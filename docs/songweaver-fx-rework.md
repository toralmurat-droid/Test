# Songweaver effects rework (progress log)

Started 2026-11-15 from the effects gallery (https://claude.ai/artifact/6F9jaqDbDKK3J39DqKhhcF, filmed with
`tools/sw-gallery/capture.ts`). One branch, one PR, one patch note at the end. Desktop only.

## Owner's directions
1. **Shield bubble off the field (all classes).** No absorb shield draws a bubble in the world any more: the Songweaver's
   (Pedal Point...) and the guard circle of the knight's Shield Wall alike, and any shield a class gets later. Your own
   shield shows as an effect on your health orb; other heroes' shields show as a small mark on their nameplate health bar.
2. **Chord rings.** A level ellipse on the ground (no tilt; today it slopes top-left to bottom-right, which fights the
   isometric view). Each note pulses outward: note 1 a small ring, note 2 further out, the finished chord widest.
   Decay collapses slowly inward and fades.
3. **Song gauge.** When it empties (swell or drain), the orb visibly drains downward, fast, instead of vanishing.
4. **Sound waves.** Little colourful music notes instead of glints; each skill's note glyph takes that skill's
   scale-step colour, so a progression reads as a colour sequence. The notes are drawn at 78% of their first size (flight,
   impact frames, trail; `NOTE_K` in `client/src/skillfx.ts`), still readable at normal zoom.
5. **Chord lockout is a HUD clock, not a world ring.** No lockout ring is drawn in the world for anyone (the grey swell-fizzle
   ring stays). The owner gets a small bronze tile above the Song orb (`client/src/lockClock.ts`): a dark wedge sweeps
   clockwise from 12 o'clock over a note glyph, fully dark after `NOTES.lockMs` (shared/songs.ts), then it disappears. Tooltip
   "Chords locked". The client knows the lockout only by the `chlock` status word (no owner-only remaining time exists in
   `Player.me`), so the sweep is timed from when the client first sees the word: a rejoin mid-lockout starts the sweep at empty
   and it hides when the server drops the word (it can end early, never late). A server-side remaining time would need a field.
6. **Mode chip.** The owner sees her current mode beside the Song orb (`client/src/modeChip.ts`): swatch and frame in the mode
   colour, its name, and an effect line from `MODES` (heals / damage multipliers) plus the Lydian shield, Dorian reach or
   Phrygian poise/resonance, scaled by `modeColour` with her ranks from `own().talents`. Tooltip has the full text. It reads her
   own `mode:` status word, so it changes the moment Modulate lands. Songweaver only.

## Log
- 2026-11-15: branch `claude/songweaver-fx` from the default branch, with the gallery capture script.
- 2026-11-15: notes 22% smaller; lockout ring removed from the world, lockout clock and mode chip added to the Song orb group; gallery groups `lock` and `mode`.
