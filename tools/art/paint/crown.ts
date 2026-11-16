import type { BirdPalette, HoundPalette } from "./badlands";

/**
 * Act 6 (the Crown of the Marches) monsters that are not men: the royal hunt's Gildhound (a lean, pale sighthound in a
 * gilt studded collar, gold leaf on its shoulder where the warhound wears paint, cold blue eyes) and the Crown Crow (a
 * big black carrion crow of the empty courts, a dark ruff, a black bill, gold eyes). Both are painted with the badlands'
 * hound and vulture (paint/badlands.ts) in these colours (paint/mobs.ts sheets mob_gildhound, mob_crowncrow).
 */
export const GILDHOUND_PAL: HoundPalette = { fur: 0xd8c8a8, furD: 0x8a7458, furL: 0xf0e6d0, iron: 0xc8982e, stud: 0xf0d878, paint: 0xd4a83a, eye: 0x9ad8ff, tooth: 0xf4ecd8 };
export const CROWNCROW_PAL: BirdPalette = { plume: 0x1e1a24, plumeL: 0x3a3448, ruff: 0x4a4258, skin: 0x2a2632, beak: 0x4a4650, talon: 0x1a1820, eye: 0xf0c850 };
