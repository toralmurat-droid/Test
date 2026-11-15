# Songweaver effects rework (progress log)

Started 2026-11-15 from the effects gallery (https://claude.ai/artifact/6F9jaqDbDKK3J39DqKhhcF, filmed with
`tools/sw-gallery/capture.ts`). One branch, one PR, one patch note at the end. Desktop only.

## Owner's directions
1. **Shield bubble off the field.** The Songweaver's shields (Pedal Point and any other Songweaver absorb shield) no
   longer draw a bubble in the world. Your own shield shows as an effect on your health orb; other heroes' shields show
   as a small mark on their nameplate health bar. Other classes' shields stay as they are.
2. **Chord rings.** A level ellipse on the ground (no tilt; today it slopes top-left to bottom-right, which fights the
   isometric view). Each note pulses outward: note 1 a small ring, note 2 further out, the finished chord widest.
   Decay collapses slowly inward and fades.
3. **Song gauge.** When it empties (swell or drain), the orb visibly drains downward, fast, instead of vanishing.
4. **Sound waves.** Little colourful music notes instead of glints; each skill's note glyph takes that skill's
   scale-step colour, so a progression reads as a colour sequence.

## Log
- 2026-11-15: branch `claude/songweaver-fx` from the default branch, with the gallery capture script.
