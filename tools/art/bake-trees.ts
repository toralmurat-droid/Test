/**
 * Bakes the 3D-built trees, bushes and grass (paint/trees3d.ts) to client/public/assets/hd/trees/<key>.png, WIND_FRAMES
 * wind poses side by side. `npx tsx tools/art/bake-trees.ts [key ...]`; PREVIEW=dir also writes a 4x contact sheet there.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { bakeSheet, renderProp } from "./paint/prop3d";
import { LANDS3D, TREES3D } from "./paint/trees3d";
import { TREE3D, WIND_FRAMES } from "../../client/src/trees3d";

const OUT = "client/public/assets/hd/trees";
const only = process.argv.slice(2);

function png(argb: Uint32Array, w: number, h: number) {
  const cv = createCanvas(w, h), c = cv.getContext("2d"), img = c.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const v = argb[i]; img.data[i * 4] = (v >> 16) & 255; img.data[i * 4 + 1] = (v >> 8) & 255; img.data[i * 4 + 2] = v & 255; img.data[i * 4 + 3] = v >>> 24; }
  c.putImageData(img, 0, 0);
  return cv;
}

mkdirSync(OUT, { recursive: true });
const PREVIEW = process.env.PREVIEW;
const done: { key: string; cv: ReturnType<typeof png>; w: number; h: number }[] = [];
for (const P of [...TREES3D, ...LANDS3D]) {
  if (only.length && !only.includes(P.key)) continue;
  const reg = TREE3D[P.key];
  if (!reg || reg[0] !== P.w || reg[1] !== P.h || reg[2] !== P.ox || reg[3] !== P.oy) throw new Error(`${P.key}: TREE3D in client/src/trees3d.ts does not match`);
  const t0 = Date.now();
  const sheet = bakeSheet(P.w, P.h, WIND_FRAMES, (f) => renderProp(P.model(f), P.w, P.h, P.ox, P.oy));
  const cv = png(sheet, P.w * WIND_FRAMES, P.h);
  writeFileSync(`${OUT}/${P.key}.png`, cv.toBuffer("image/png"));
  done.push({ key: P.key, cv, w: P.w * WIND_FRAMES, h: P.h });
  console.log(P.key, `${Date.now() - t0} ms`);
}
if (PREVIEW && done.length) {
  mkdirSync(PREVIEW, { recursive: true });
  const S = 3, W = Math.max(...done.map((d) => d.w)) * S, H = done.reduce((a, d) => a + d.h * S + 6, 0);
  const cv = createCanvas(W, H), c = cv.getContext("2d");
  c.fillStyle = "#3e4a30"; c.fillRect(0, 0, W, H);
  c.imageSmoothingEnabled = false;
  let y = 0;
  for (const d of done) { c.drawImage(d.cv, 0, y, d.w * S, d.h * S); y += d.h * S + 6; }
  writeFileSync(`${PREVIEW}/trees3d-sheet.png`, cv.toBuffer("image/png"));
}
