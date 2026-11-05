/**
 * Re-renders every weapon item (found weapons and class-kit weapons) on the heroes: the painted overlays for the
 * class's own stance and for the other stances (pose variants), plus the icon atlas. Run after changing weaponArt.ts.
 * Usage: npx tsx tools/art/paint/weapons.ts [hero ...]   (no heroes = icons only + all heroes)
 * Heroes can run in parallel processes: one per hero, then `npx tsx tools/art/paint/weapons.ts icons`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import type { Canvas } from "../canvas";
import { buildSheet, HEROES, poseVariant, setPainted } from "../characters";
import { buildGearIcons, diff } from "../gear";
import { GEAR, GEAR_IDS, weaponType } from "../../../shared/gear";
import { nativeFamily, POSE_FAMILIES, weaponFamily } from "../../../shared/weapons";
import type { ClassKind } from "../../../shared/classes";
import { PAINT_K, wear } from "./sheets";

const OUT = "client/public/assets";
const args = process.argv.slice(2);
function saveWebp(c: Canvas, path: string, q = 88) {
  const n = createCanvas(c.w, c.h), x = n.getContext("2d");
  const img = x.createImageData(c.w, c.h);
  img.data.set(c.data);
  x.putImageData(img, 0, 0);
  writeFileSync(path, n.encodeSync("webp", q));
}
if (!args.length || args.includes("icons")) buildGearIcons(`${OUT}/gear`);
const heroes = HEROES.filter((h) => (args.length ? args.includes(h.name) : true));
const weapons = GEAR_IDS.filter((id) => GEAR[id].slot === "weapon");
setPainted(true, PAINT_K, true);
mkdirSync(`${OUT}/hd/gear`, { recursive: true });
for (const h of heroes) {
  const cls = h.name as ClassKind;
  for (const fam of POSE_FAMILIES) {
    const native = fam === nativeFamily(cls);
    const v = native ? h : poseVariant(h, fam);
    const name = native ? cls : `${cls}-${fam}`;
    wear(null);
    const plain = buildSheet(v);
    let n = 0;
    for (const id of weapons) {
      const d = GEAR[id];
      if (d.cls && d.cls !== cls) continue;
      if (!native && weaponFamily(weaponType(cls, id)) !== fam) continue;
      wear(d);
      saveWebp(diff(plain, buildSheet(v)), `${OUT}/hd/gear/${name}_${id}.webp`);
      n++;
    }
    wear(null);
    console.log("done", name, n);
  }
}
setPainted(false, 2);
