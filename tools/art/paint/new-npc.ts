/**
 * Renders ONE townsfolk sheet (pixel + painted) without the long `npm run art` (Kel Ashar, Act 2).
 * The NPC must be in tools/art/characters.ts NPCS and paint/look.ts LOOKS, and in the `npcs` list of both characters.json.
 * Usage: npx tsx tools/art/paint/new-npc.ts wellkeeper [sandcaptain ...]
 */
import { buildSheet, NPCS, setGearHook } from "../characters";
import { buildPainted } from "./sheets";

const OUT = "client/public/assets";
const names = process.argv.slice(2);
for (const name of names) {
  const h = NPCS.find((x) => x.name === name);
  if (!h) throw new Error(`no NPC ${name} in tools/art/characters.ts NPCS`);
  setGearHook(null);
  buildSheet(h).save(`${OUT}/characters/${name}.png`);
  console.log("pixel", name);
}
buildPainted(`${OUT}/hd`, { only: names, gear: false });
