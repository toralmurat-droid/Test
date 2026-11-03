import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import type { Canvas } from "../canvas";
import { HEROES, PAINT_DIRS, setPainted, sheetFrames } from "../characters";
import { diff } from "../gear";
import { GEAR, starterKit } from "../../../shared/gear";
import { wear } from "./sheets";

/**
 * Class kits preview: per hero and facing, the bare body, each kit item alone (as its overlay), then everything stacked
 * the way the game layers it. `npx tsx tools/art/paint/kit-preview.ts [hero...]` (ANIM=walk FRAME=2 for another pose).
 */
const ORDER = ["armour", "shoes", "ranged", "hat", "shield", "weapon"] as const;
setPainted(true, 1.5, true);
const names = process.argv.slice(2), anim = process.env.ANIM ?? "idle", fi = Number(process.env.FRAME ?? 0);
const heroes = HEROES.filter((h) => !names.length || names.includes(h.name));
const dirs = (process.env.DIRS?.split(",") ?? ["down", "downright", "right", "up"]).filter((d) => (PAINT_DIRS as readonly string[]).includes(d));
const F = 48, Z = 4, COLS = 7;
const out = createCanvas(F * Z * COLS, F * Z * heroes.length * dirs.length), o = out.getContext("2d");
o.fillStyle = "#3d4530"; o.fillRect(0, 0, out.width, out.height);
o.imageSmoothingEnabled = false;
const put = (f: Canvas, col: number, row: number) => {
  const c = createCanvas(f.w, f.h), x = c.getContext("2d"), id = x.createImageData(f.w, f.h);
  id.data.set(f.data); x.putImageData(id, 0, 0);
  o.drawImage(c, col * F * Z, row * F * Z, F * Z, F * Z);
};
heroes.forEach((h, hi) => dirs.forEach((d, di) => {
  const row = hi * dirs.length + di;
  wear(null);
  const bare = sheetFrames(h, anim, d as any)[fi];
  put(bare, 0, row);
  const kit = starterKit(h.name);
  const layers: Canvas[] = [];
  let col = 1;
  for (const slot of ORDER) {
    const id = kit[slot];
    if (!id) continue;
    wear(GEAR[id]);
    const ov = diff(bare, sheetFrames(h, anim, d as any)[fi]);
    layers.push(ov);
    put(ov, col++, row);
  }
  wear(null);
  // stacked, the way GearLayer draws it
  const c = createCanvas(F, F), x = c.getContext("2d");
  for (const f of [bare, ...layers]) {
    const t = createCanvas(f.w, f.h), tx = t.getContext("2d"), id = tx.createImageData(f.w, f.h);
    id.data.set(f.data); tx.putImageData(id, 0, 0); x.drawImage(t, 0, 0);
  }
  o.drawImage(c, (COLS - 1) * F * Z, row * F * Z, F * Z, F * Z);
}));
writeFileSync(process.env.OUT ?? "kit-preview.png", out.encodeSync("png"));
