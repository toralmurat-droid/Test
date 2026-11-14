/**
 * Renders the book overlays (Songbook, Hymnal, War March, Dissonance) for every hero without the long `npm run art`:
 * the old pixel overlays, the painted overlays, the other-weapon stances and the skill-move sheets, plus the gear icon atlas
 * (books, materials, traits). `npm run art` produces the same files for everything, books included.
 * Usage: npx tsx tools/art/paint/new-books.ts [hero ...]   (no heroes = all)
 */
import { buildSheet, HEROES, setGearHook } from "../characters";
import { buildGearIcons, diff, gearHook } from "../gear";
import { buildPainted } from "./sheets";
import { buildPoseVariants } from "./pose-variants";
import { buildSkillMoves } from "./skill-moves";
import { BOOKS, gearDefs, setItemFilter } from "./books";
import { MOVE_HEROES } from "../characters";

const OUT = "client/public/assets";
const want = process.argv.slice(2), heroes = HEROES.filter((h) => !want.length || want.includes(h.name));
const ids = Object.keys(BOOKS);

setItemFilter(null);
buildGearIcons(`${OUT}/gear`); // the full atlas (every item), so this must run unfiltered
setItemFilter(ids);
for (const h of heroes) {
  setGearHook(null);
  const plain = buildSheet(h);
  for (const d of gearDefs()) {
    if (d.cls) continue;
    setGearHook(gearHook(d));
    diff(plain, buildSheet(h)).save(`${OUT}/gear/${h.name}_${d.id}.png`);
  }
  setGearHook(null);
}
console.log("pixel overlays done");
const names = heroes.map((h) => h.name);
buildPainted(`${OUT}/hd`, { only: names });
buildPoseVariants(`${OUT}/hd`, names);
buildSkillMoves(`${OUT}/hd`, names.filter((n) => MOVE_HEROES.includes(n)));
setItemFilter(null);
console.log("books done");
