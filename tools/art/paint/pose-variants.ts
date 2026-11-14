/**
 * Painted sheets for heroes holding a weapon of another family (shared/weapons.ts poseSheet): the bare body and every
 * item overlay that can be worn with it, e.g. archer-melee.webp + gear/archer-melee_a_chain.webp.
 * Usage: npx tsx tools/art/paint/pose-variants.ts [hero-family ...]   (no args = all)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import type { Canvas } from "../canvas";
import { buildSheet, HEROES, poseVariant, setPainted } from "../characters";
import { diff } from "../gear";
import { GEAR, GEAR_IDS } from "../../../shared/gear";
import { gearDefs } from "./books";
import { nativeFamily, POSE_FAMILIES, weaponFamily } from "../../../shared/weapons";
import { weaponType } from "../../../shared/gear";
import type { ClassKind } from "../../../shared/classes";
import { PAINT_K, wear } from "./sheets";

function saveWebp(c: Canvas, path: string, q = 88) {
  const n = createCanvas(c.w, c.h), x = n.getContext("2d");
  const img = x.createImageData(c.w, c.h);
  img.data.set(c.data);
  x.putImageData(img, 0, 0);
  writeFileSync(path, n.encodeSync("webp", q));
}
/** `want`: sheet names ("archer-melee") or hero names; empty = all. */
export function buildPoseVariants(OUT: string, want: string[] = []) {
setPainted(true, PAINT_K, true);
mkdirSync(`${OUT}/gear`, { recursive: true });
for (const h of HEROES) for (const fam of POSE_FAMILIES) {
  const cls = h.name as ClassKind, name = `${cls}-${fam}`;
  if (fam === nativeFamily(cls) || (want.length && !want.includes(name) && !want.includes(cls))) continue;
  const v = poseVariant(h, fam);
  wear(null);
  const plain = buildSheet(v);
  saveWebp(plain, `${OUT}/characters/${name}.webp`, 90);
  let n = 0;
  for (const d of gearDefs()) {
    const id = d.id;
    if (d.cls && d.cls !== cls) continue; // class kits only fit their own class
    if (d.slot === "weapon" && weaponFamily(weaponType(cls, id)) !== fam) continue; // that weapon never shows in this stance
    wear(d);
    saveWebp(diff(plain, buildSheet(v)), `${OUT}/gear/${name}_${id}.webp`);
    n++;
  }
  wear(null);
  console.log("done", name, n, "items");
}
setPainted(false, 2);
}

if (process.argv[1]?.endsWith("pose-variants.ts")) buildPoseVariants("client/public/assets/hd", process.argv.slice(2));
