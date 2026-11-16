// Lineup of the Crown of the Marches monsters: npx tsx tools/art/preview/crown-lineup.ts out.png [zoom] [mobsDir]
// Each monster: facing down, up, right (step), wind-up and strike (right).
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
const Z = Number(process.argv[3] ?? 4), M = process.argv[4] ?? "client/public/assets/hd/mobs/";
const mm = JSON.parse(readFileSync(M + "/mobs.json", "utf8"));
const mobs = ["oathbreaker", "crownguard", "hollowherald", "gildhound", "thronewarden", "courtmagus", "crowncrow", "pretender", "rivenking"];
type Item = { img: any; sx: number; sy: number; w: number; h: number };
(async () => {
  const pad = 6, rows: Item[][] = [];
  for (const k of mobs) { const m = mm[`mob_${k}`], img = await loadImage(readFileSync(`${M}/mob_${k}.webp`)), w = m.w * m.scale, h = m.h * m.scale; rows.push([0, 2, 5, 10, 11].map((f) => ({ img, sx: f * w, sy: 0, w, h }))); }
  // two columns of rows so the sheet is not too wide
  const half = Math.ceil(rows.length / 2), cols = [rows.slice(0, half), rows.slice(half)];
  const rowH = (r: Item[]) => Math.max(...r.map((i) => i.h)) + pad, rowW = (r: Item[]) => r.reduce((a, i) => a + i.w + pad, pad);
  const CW = cols.map((c) => Math.max(...c.map(rowW))), H = Math.max(...cols.map((c) => c.reduce((a, r) => a + rowH(r), pad)));
  const cv = createCanvas((CW[0] + CW[1]) * Z, H * Z), c = cv.getContext("2d");
  c.imageSmoothingEnabled = false; const g = c.createLinearGradient(0, 0, 0, cv.height); g.addColorStop(0, "#5c6a50"); g.addColorStop(1, "#3a4234"); c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
  let x0 = 0;
  for (const [ci, col] of cols.entries()) {
    let y = pad;
    for (const r of col) { const h = rowH(r); let x = x0 + pad; for (const it of r) { c.drawImage(it.img, it.sx, it.sy, it.w, it.h, x * Z, (y + h - pad - it.h) * Z, it.w * Z, it.h * Z); x += it.w + pad; } y += h; }
    x0 += CW[ci];
  }
  writeFileSync(process.argv[2], cv.encodeSync("png"));
})();
