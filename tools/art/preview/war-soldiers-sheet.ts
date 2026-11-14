// Contact sheet of the clan war soldiers (one row each; walk, attack and fall frames): npx tsx tools/art/preview/war-soldiers-sheet.ts out.png [zoom] [mob_war_x,mob_war_y]
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
const out = process.argv[2] ?? "soldiers.png", Z = Number(process.argv[3] ?? 4), only = process.argv[4];
const R = "client/public/assets/hd/mobs/";
const meta = JSON.parse(readFileSync(R + "mobs.json", "utf8"));
const keys = Object.keys(meta).filter((k) => k.startsWith("mob_war_") && (!only || only.split(",").includes(k)));
(async () => {
  const m = meta[keys[0]], fw = m.w * m.scale, fh = Math.max(...keys.map((k) => meta[k].h * meta[k].scale));
  const show = [0, 1, 2, 4, 5, 6, 7, 10, 11, 12, 13]; // walk down x2, up, side x2; attack down; strike down; attack side x2; fall x2
  const cv = createCanvas(fw * show.length * Z, fh * keys.length * Z), c = cv.getContext("2d");
  c.imageSmoothingEnabled = false;
  for (const [i, k] of keys.entries()) {
    c.fillStyle = i % 2 ? "#4a4538" : "#524c3d"; c.fillRect(0, i * fh * Z, cv.width, fh * Z);
    const img = await loadImage(readFileSync(R + k + ".webp")), h = meta[k].h * meta[k].scale;
    show.forEach((f, j) => c.drawImage(img, f * fw, 0, fw, h, j * fw * Z, (i * fh + fh - h) * Z, fw * Z, h * Z));
  }
  writeFileSync(out, cv.encodeSync("png"));
})();
