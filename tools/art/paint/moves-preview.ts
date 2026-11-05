import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import type { Canvas } from "../canvas";
import { HEROES, MOVE_ANIMS, setPainted, sheetFrames } from "../characters";
import { diff } from "../gear";
import { GEAR, starterKit } from "../../../shared/gear";
import { wear } from "./sheets";

/**
 * Skill-move poses preview (MOVE_ANIMS): one row per anim and facing, the 8 frames with the class kit stacked on.
 * `npx tsx tools/art/paint/moves-preview.ts knight [lunge,whirl] [downright,right]`  (OUT=file.png)
 */
setPainted(true, 1.5, true);
const hero = HEROES.find((h) => h.name === (process.argv[2] ?? "knight"))!;
const anims = process.argv[3]?.split(",") ?? MOVE_ANIMS.map((a) => a.name);
const dirs = process.argv[4]?.split(",") ?? ["downright", "right", "down", "up"];
const ORDER = ["armour", "shoes", "ranged", "hat", "shield", "weapon"] as const;
const F = 48, Z = 3;
const out = createCanvas(F * Z * 8, F * Z * anims.length * dirs.length), o = out.getContext("2d");
o.fillStyle = "#3d4530"; o.fillRect(0, 0, out.width, out.height);
o.imageSmoothingEnabled = false;
const draw = (f: Canvas, x: any) => {
  const t = createCanvas(f.w, f.h), tx = t.getContext("2d"), id = tx.createImageData(f.w, f.h);
  id.data.set(f.data); tx.putImageData(id, 0, 0); x.drawImage(t, 0, 0);
};
let row = 0;
for (const a of anims) for (const d of dirs) {
  wear(null);
  const bare = sheetFrames(hero, a, d as any);
  const kit = starterKit(hero.name as any);
  const layers: Canvas[][] = [];
  for (const slot of ORDER) { const id = kit[slot]; if (!id) continue; wear(GEAR[id]); const fr = sheetFrames(hero, a, d as any); layers.push(fr.map((f, i) => diff(bare[i], f))); }
  wear(null);
  bare.forEach((b, i) => {
    const c = createCanvas(F, F), x = c.getContext("2d");
    for (const f of [b, ...layers.map((l) => l[i])]) draw(f, x);
    o.drawImage(c, i * F * Z, row * F * Z, F * Z, F * Z);
  });
  row++;
}
writeFileSync(process.env.OUT ?? "moves-preview.png", out.encodeSync("png"));
