// Contact sheet of the Hide-Kin tunnel mouth (walk down x2, up x2, side x2, idle x3, mid-stride x3, staggering, wrecked): npx tsx tools/art/preview/war-ram-sheet.ts out.png [zoom] [frames e.g. 0,2,4,12,13]
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
const out = process.argv[2] ?? "tunnels.png", Z = Number(process.argv[3] ?? 3);
const R = "client/public/assets/hd/mobs/";
const meta = JSON.parse(readFileSync(R + "mobs.json", "utf8"));
const keys = Object.keys(meta).filter((k) => k.startsWith("mob_war_tunnel_"));
(async () => {
  const m = meta[keys[0]], fw = m.w * m.scale, fh = m.h * m.scale;
  const show = process.argv[4] ? process.argv[4].split(",").map(Number) : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const cv = createCanvas(fw * show.length * Z, fh * keys.length * Z), c = cv.getContext("2d");
  c.imageSmoothingEnabled = false;
  for (const [i, k] of keys.entries()) {
    c.fillStyle = i % 2 ? "#4a4538" : "#524c3d"; c.fillRect(0, i * fh * Z, cv.width, fh * Z);
    const img = await loadImage(readFileSync(R + k + ".webp"));
    show.forEach((f, j) => c.drawImage(img, f * fw, 0, fw, fh, j * fw * Z, i * fh * Z, fw * Z, fh * Z));
  }
  writeFileSync(out, cv.encodeSync("png"));
})();
