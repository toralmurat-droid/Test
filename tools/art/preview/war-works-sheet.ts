// Contact sheet of the Hold works (barracks / stores / rack per clan; frames 0 = intact, 12 = shaken, 13 = wrecked):
//   npx tsx tools/art/preview/war-works-sheet.ts out.png [zoom] [frames e.g. 0,12,13] [key prefix e.g. mob_war_work_]
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
const out = process.argv[2] ?? "works.png", Z = Number(process.argv[3] ?? 3);
const R = "client/public/assets/hd/mobs/";
const meta = JSON.parse(readFileSync(R + "mobs.json", "utf8"));
const prefix = process.argv[5] ?? "mob_war_work_";
const kinds = prefix.includes("work") ? ["barracks", "stores", "rack", "rubble"] : [""], clans = ["wardens", "redfang", "host", "hidekin", "veiled"];
const keys = clans.flatMap((c) => kinds.map((k) => `${prefix}${k ? k + "_" : ""}${c}`)).filter((k) => meta[k]);
(async () => {
  const show = (process.argv[4] ?? "0,12,13").split(",").map(Number);
  // one row per clan: the kinds side by side, each shown in the chosen frames
  const rows = clans.map((c) => keys.filter((k) => k.endsWith("_" + c)));
  const rowW = (r: string[]) => r.reduce((s, k) => s + meta[k].w * meta[k].scale * show.length * Z + 12, 0);
  const rowH = Math.max(...keys.map((k) => meta[k].h * meta[k].scale)) * Z + 8;
  const cv = createCanvas(Math.max(...rows.map(rowW)), rowH * rows.length), c = cv.getContext("2d");
  c.imageSmoothingEnabled = false;
  for (const [i, r] of rows.entries()) {
    c.fillStyle = i % 2 ? "#4a4538" : "#524c3d"; c.fillRect(0, i * rowH, cv.width, rowH);
    let x = 0;
    for (const k of r) {
      const m = meta[k], fw = m.w * m.scale, fh = m.h * m.scale, img = await loadImage(readFileSync(R + k + ".webp"));
      for (const f of show) { c.drawImage(img, f * fw, 0, fw, fh, x, i * rowH + (rowH - fh * Z) - 4, fw * Z, fh * Z); x += fw * Z; }
      x += 12;
    }
  }
  writeFileSync(out, cv.encodeSync("png"));
})();
