// Songweaver icons on one sheet: npx tsx tools/art/preview/songweaver-icons.ts docs/art/songweaver-icons.png
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { ICON, paintSkill, SONG_ART_IDS } from "../../../client/src/skillArt";
import { SONG_SMALL } from "../../../client/src/songIcons";

const Z = 6, PAD = 8, CELL = ICON * Z + PAD, COLS = 6;
const big = SONG_ART_IDS, small = Object.keys(SONG_SMALL);
const rows = Math.ceil(big.length / COLS), SZ = 8, SCELL = 12 * SZ + PAD;
const out = createCanvas(COLS * CELL, rows * CELL + Math.ceil(small.length / 8) * SCELL + 8), o = out.getContext("2d");
o.fillStyle = "#20202a"; o.fillRect(0, 0, out.width, out.height);
big.forEach((id, i) => {
  const g = paintSkill(id);
  if (!g) return;
  const x0 = (i % COLS) * CELL + PAD / 2, y0 = Math.floor(i / COLS) * CELL + PAD / 2;
  g.forEach((c, k) => { if (c) { o.fillStyle = c; o.fillRect(x0 + (k % ICON) * Z, y0 + Math.floor(k / ICON) * Z, Z, Z); } });
});
const sy = rows * CELL + 8;
small.forEach((id, i) => {
  const ic = SONG_SMALL[id], x0 = (i % 8) * SCELL + PAD / 2, y0 = sy + Math.floor(i / 8) * SCELL + PAD / 2;
  o.fillStyle = "#33384a"; o.fillRect(x0 - 2, y0 - 2, 12 * SZ + 4, 12 * SZ + 4);
  ic.px.forEach((row, y) => [...row].forEach((ch, x) => { const c = ic.pal[ch]; if (c) { o.fillStyle = c; o.fillRect(x0 + x * SZ, y0 + y * SZ, SZ, SZ); } }));
});
writeFileSync(process.argv[2] ?? "songweaver-icons.png", out.encodeSync("png"));
