/**
 * Bakes the 3D-built shot models (paint/shots3d.ts) to client/public/assets/hd/fx/fx3_<look>.png, loaded by
 * skillfx.ts (preloadShotSheets), and the area-spell objects (paint/areafx3.ts) the same way. `npx tsx tools/art/bake-fx.ts [look ...]`; PREVIEW=file writes a contact sheet.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { bakeSheet, renderProp } from "./paint/prop3d";
import { HEADINGS, SHOTS3D, turn, type FxEntry } from "./paint/shots3d";
import { AREA3D } from "./paint/areafx3";

const OUT = "client/public/assets/hd/fx", only = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const png = (argb: Uint32Array, w: number, h: number) => {
  const cv = createCanvas(w, h), c = cv.getContext("2d"), img = c.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const v = argb[i]; img.data[i * 4] = (v >> 16) & 255; img.data[i * 4 + 1] = (v >> 8) & 255; img.data[i * 4 + 2] = v & 255; img.data[i * 4 + 3] = v >>> 24; }
  c.putImageData(img, 0, 0); return cv;
};
const sheets: { key: string; cv: ReturnType<typeof png>; w: number; h: number }[] = [];
const ALL: (FxEntry & { frames?: number; ox?: number; oy?: number })[] = [...SHOTS3D, ...AREA3D];
for (const E of ALL) {
  if (only.length && !only.includes(E.key)) continue;
  const n = E.dir ? HEADINGS : E.frames ?? 1, ox = E.ox ?? E.w / 2, oy = E.oy ?? E.h / 2;
  const draw = (f: number) => renderProp(E.dir ? turn(E.model(0), (f / HEADINGS) * Math.PI * 2) : E.model(f), E.w, E.h, ox, oy);
  let sheet: Uint32Array;
  if (E.outline) sheet = bakeSheet(E.w, E.h, n, draw);
  else { sheet = new Uint32Array(E.w * n * E.h); for (let f = 0; f < n; f++) { const b = draw(f); for (let y = 0; y < E.h; y++) for (let x = 0; x < E.w; x++) sheet[y * E.w * n + f * E.w + x] = b[y * E.w + x]; } }
  const cv = png(sheet, E.w * n, E.h);
  writeFileSync(`${OUT}/fx3_${E.key}.png`, cv.toBuffer("image/png"));
  sheets.push({ key: E.key, cv, w: E.w * n, h: E.h });
  console.log(E.key, n);
}
if (process.env.PREVIEW) {
  const S = 6, W = Math.max(...sheets.map((s) => s.w)) * S, H = sheets.reduce((a, s) => a + s.h * S + 6, 0);
  const cv = createCanvas(W, H), c = cv.getContext("2d"); c.fillStyle = "#4a5a3a"; c.fillRect(0, 0, W, H); c.imageSmoothingEnabled = false;
  let y = 0; for (const s of sheets) { c.drawImage(s.cv, 0, y, s.w * S, s.h * S); y += s.h * S + 6; }
  writeFileSync(process.env.PREVIEW, cv.toBuffer("image/png"));
}
