import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { HEROES, NPCS, PAINT_DIRS, setPainted, sheetFrames } from "../characters";
/** Contact sheet: per character, one row per facing (incl. 3/4) with idle, the 8-frame walk and an attack. */
setPainted(true, Number(process.env.K ?? 1.125), process.env.SMOOTH !== "1");
const names = process.argv.slice(2);
const walk = process.env.ANIM ?? "walk";
const all = [...HEROES, ...NPCS].filter((h) => !names.length || names.includes(h.name));
const F = Math.round(32 * Number(process.env.K ?? 1.125)), Z = Math.max(1, Math.round(160 / F)), COLS = 12;
const out = createCanvas(F * Z * COLS, F * Z * all.length * PAINT_DIRS.length);
const o = out.getContext("2d");
o.fillStyle = "#4a5236"; o.fillRect(0, 0, out.width, out.height);
o.imageSmoothingEnabled = false;
all.forEach((h, hi) => {
  PAINT_DIRS.forEach((d, di) => {
    const fr = [sheetFrames(h, "idle", d)[0], ...sheetFrames(h, walk, d), ...sheetFrames(h, "attack", d).slice(1, 3), sheetFrames(h, "skill", d)[2]];
    fr.forEach((f, fi) => {
      const c = createCanvas(f.w, f.h); const x = c.getContext("2d"); const id = x.createImageData(f.w, f.h); id.data.set(f.data); x.putImageData(id, 0, 0);
      o.drawImage(c, fi * F * Z, (hi * PAINT_DIRS.length + di) * F * Z, F * Z, F * Z);
    });
  });
});
writeFileSync(process.env.OUT ?? "paint-preview.png", out.encodeSync("png"));
