/**
 * Renders every asset of ONE hero without the long `npm run art` (Vampire, 2026-11-05): the old pixel sheet and its
 * loot overlays, the gear icon atlas, the painted sheet with its kit and gear overlays, the other-weapon stances and
 * the skill-move sheet, and adds the hero to the sheet lists (characters.json, gear.json).
 * Usage: npx tsx tools/art/paint/new-hero.ts vampire
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSheet, HEROES, MOVE_HEROES, setGearHook } from "../characters";
import { buildGearIcons, diff, gearHook } from "../gear";
import { GEAR, GEAR_IDS, LOOT_IDS } from "../../../shared/gear";
import { buildPainted } from "./sheets";
import { buildPoseVariants } from "./pose-variants";
import { buildSkillMoves } from "./skill-moves";

const OUT = "client/public/assets";
const name = process.argv[2];
const h = HEROES.find((x) => x.name === name);
if (!h) throw new Error(`no hero ${name} in tools/art/characters.ts HEROES`);
const skip = new Set(process.argv.slice(3)); // e.g. "pixel" "painted" "poses" "moves" to leave a part out

// lists of heroes the client reads
const addTo = (path: string, key: string) => {
  const j = JSON.parse(readFileSync(path, "utf8"));
  j[key] = HEROES.map((x) => x.name).filter((n) => j[key].includes(n) || n === name);
  writeFileSync(path, JSON.stringify(j, null, 1));
};
addTo(`${OUT}/characters/characters.json`, "characters");
addTo(`${OUT}/hd/characters/characters.json`, "characters");
addTo(`${OUT}/gear/gear.json`, "heroes");
const gj = JSON.parse(readFileSync(`${OUT}/gear/gear.json`, "utf8"));
gj.items = GEAR_IDS; writeFileSync(`${OUT}/gear/gear.json`, JSON.stringify(gj, null, 1));

if (!skip.has("pixel")) {
  setGearHook(null);
  const plain = buildSheet(h);
  plain.save(`${OUT}/characters/${name}.png`);
  for (const id of LOOT_IDS) { setGearHook(gearHook(GEAR[id])); diff(plain, buildSheet(h)).save(`${OUT}/gear/${name}_${id}.png`); }
  setGearHook(null);
  buildGearIcons(`${OUT}/gear`);
  console.log("pixel sheet + overlays", name);
}
if (!skip.has("painted")) buildPainted(`${OUT}/hd`, { only: [name] });
if (!skip.has("moves") && MOVE_HEROES.includes(name)) buildSkillMoves(`${OUT}/hd`, [name]);
if (!skip.has("poses")) buildPoseVariants(`${OUT}/hd`, [name]);
console.log("done", name);
