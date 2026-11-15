// Contact sheet of painted monsters (one row each; walk, attack, side frames): npx tsx tools/art/preview/mobs-sheet.ts out.png [zoom] mob_a,mob_b
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
const out = process.argv[2] ?? "mobs.png", Z = Number(process.argv[3] ?? 4), only = (process.argv[4] ?? "").split(",").filter(Boolean);
const R = "client/public/assets/hd/mobs/";
const meta = JSON.parse(readFileSync(R + "mobs.json", "utf8"));
const keys = only.filter((k) => meta[k]);
(async () => {
  const fw = Math.max(...keys.map((k) => meta[k].w * meta[k].scale)), fh = Math.max(...keys.map((k) => meta[k].h * meta[k].scale));
  const show = [0, 1, 2, 4, 5, 6, 7, 10, 11]; // down x2, up, side x2, attack down wind/strike, side wind/strike
  const cv = createCanvas(fw * show.length * Z, fh * keys.length * Z), c = cv.getContext("2d");
  c.imageSmoothingEnabled = false;
  for (const [i, k] of keys.entries()) {
    c.fillStyle = i % 2 ? "#4a4538" : "#524c3d"; c.fillRect(0, i * fh * Z, cv.width, fh * Z);
    const img = await loadImage(readFileSync(R + k + ".webp")), m = meta[k], w = m.w * m.scale, h = m.h * m.scale;
    show.forEach((f, j) => c.drawImage(img, f * w, 0, w, h, j * fw * Z + (fw - w) * Z / 2, (i * fh + fh - h) * Z, w * Z, h * Z));
  }
  writeFileSync(out, cv.encodeSync("png"));
})();
