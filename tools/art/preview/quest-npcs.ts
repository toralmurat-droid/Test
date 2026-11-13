import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";

/**
 * Preview of the quest-concept NPCs (docs/art/quest-concepts/npcs.png): the painted sheets' idle frame, facing down, right and up,
 * next to the guard / villager they derive from. Reads the built sheets: run `npx tsx tools/art/paint/new-npc.ts <names>` first.
 * Usage: npx tsx tools/art/preview/quest-npcs.ts
 */
const NAMES = ["guard", "quartermaster", "sexton", "mourner1", "mourner2", "mourner3", "ilka", "smuggler", "villager", "alewife"];
const F = 48, Z = 5, DIRS = 3; // frame size, zoom; rows 0..2 of the sheet are idle down / up / right (see characters.json)
const meta = JSON.parse(readFileSync("client/public/assets/hd/characters/characters.json", "utf8"));
const rowOf = (dir: string) => Math.floor(meta.animations[`idle_${dir}`].frames[0] / meta.columns);
const out = createCanvas(NAMES.length * F * Z, DIRS * F * Z);
const o = out.getContext("2d");
o.fillStyle = "#566a3c"; o.fillRect(0, 0, out.width, out.height);
o.imageSmoothingEnabled = false;
async function main() {
for (const [i, n] of NAMES.entries()) {
  const img = await loadImage(`client/public/assets/hd/characters/${n}.webp`);
  ["down", "right", "up"].forEach((d, r) => o.drawImage(img, 0, rowOf(d) * F, F, F, i * F * Z, r * F * Z, F * Z, F * Z));
}
writeFileSync("docs/art/quest-concepts/npcs.png", out.encodeSync("png"));
}
void main();
