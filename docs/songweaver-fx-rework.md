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
   scale-step colour, so a progression reads as a colour sequence.

## Log
- 2026-11-15: branch `claude/songweaver-fx` from the default branch, with the gallery capture script.
