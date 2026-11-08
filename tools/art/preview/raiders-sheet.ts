// Contact sheet of the Night Raider sheets: npx tsx tools/art/preview/raiders-sheet.ts out.png [zoom]
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
const out = process.argv[2] ?? "raiders.png", Z = Number(process.argv[3] ?? 3);
const meta = JSON.parse(readFileSync("client/public/assets/hd/mobs/mobs.json", "utf8"));
const keys = Object.keys(meta).filter((k) => k.startsWith("mob_nightraider_"));
(async () => {
  const m = meta[keys[0]], fw = m.w * m.scale, fh = m.h * m.scale, NF = m.frames;
  const cv = createCanvas(fw * NF * Z, fh * keys.length * Z), c = cv.getContext("2d");
  c.fillStyle = "#4a4436"; c.fillRect(0, 0, cv.width, cv.height);
  c.imageSmoothingEnabled = false;
  for (const [i, k] of keys.entries()) {
    const img = await loadImage(readFileSync(`client/public/assets/hd/mobs/${k}.webp`));
    if (i % 2) { c.fillStyle = "#3e3a2e"; c.fillRect(0, i * fh * Z, cv.width, fh * Z); }
    c.drawImage(img, 0, 0, fw * NF, fh, 0, i * fh * Z, fw * NF * Z, fh * Z);
  }
  writeFileSync(out, cv.encodeSync("png"));
})();
