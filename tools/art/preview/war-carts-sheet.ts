// Contact sheet of the clan war supply carts (one row each; walk down x2, up x2, side x2, idle side, staggering, wrecked): npx tsx tools/art/preview/war-carts-sheet.ts out.png [zoom]
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
const out = process.argv[2] ?? "carts.png", Z = Number(process.argv[3] ?? 3);
const R = "client/public/assets/hd/mobs/";
const meta = JSON.parse(readFileSync(R + "mobs.json", "utf8"));
const keys = Object.keys(meta).filter((k) => k.startsWith("mob_war_cart_"));
(async () => {
  const m = meta[keys[0]], fw = m.w * m.scale, fh = m.h * m.scale;
  const show = [0, 1, 2, 3, 4, 5, 8, 12, 13];
  const cv = createCanvas(fw * show.length * Z, fh * keys.length * Z), c = cv.getContext("2d");
  c.imageSmoothingEnabled = false;
  for (const [i, k] of keys.entries()) {
    c.fillStyle = i % 2 ? "#4a4538" : "#524c3d"; c.fillRect(0, i * fh * Z, cv.width, fh * Z);
    const img = await loadImage(readFileSync(R + k + ".webp"));
    show.forEach((f, j) => c.drawImage(img, f * fw, 0, fw, fh, j * fw * Z, i * fh * Z, fw * Z, fh * Z));
  }
  writeFileSync(out, cv.encodeSync("png"));
})();
