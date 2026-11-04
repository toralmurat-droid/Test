/**
 * Re-renders only the given gear items on every hero (painted HD overlays + old pixel overlays) and the icon atlas,
 * without the full `npm run art`. Usage: npx tsx tools/art/paint/new-weapons.ts wb_hunt ws_arming ...
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import type { Canvas } from "../canvas";
import { buildSheet, HEROES, setGearHook, setPainted } from "../characters";
import { buildGearIcons, diff, gearHook } from "../gear";
import { GEAR } from "../../../shared/gear";
import { PAINT_K, wear } from "./sheets";

const OUT = "client/public/assets";
const ids = process.argv.slice(2).filter((id) => GEAR[id]);
function saveWebp(c: Canvas, path: string, q = 88) {
  const n = createCanvas(c.w, c.h), x = n.getContext("2d");
  const img = x.createImageData(c.w, c.h);
  img.data.set(c.data);
  x.putImageData(img, 0, 0);
  writeFileSync(path, n.encodeSync("webp", q));
}
buildGearIcons(`${OUT}/gear`);
// old pixel sheets (?pixel=1)
for (const hero of HEROES) {
  setGearHook(null);
  const plain = buildSheet(hero);
  for (const id of ids) { setGearHook(gearHook(GEAR[id])); diff(plain, buildSheet(hero)).save(`${OUT}/gear/${hero.name}_${id}.png`); }
}
setGearHook(null);
// painted sheets
setPainted(true, PAINT_K, true);
mkdirSync(`${OUT}/hd/gear`, { recursive: true });
for (const h of HEROES) {
  wear(null);
  const plain = buildSheet(h);
  for (const id of ids) { wear(GEAR[id]); saveWebp(diff(plain, buildSheet(h)), `${OUT}/hd/gear/${h.name}_${id}.webp`); }
  wear(null);
  console.log("done", h.name);
}
setPainted(false, 2);
