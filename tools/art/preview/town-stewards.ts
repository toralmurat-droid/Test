import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";

/**
 * Preview of the clan war W6 town stewards and banners: idle frame facing down / right / up of each painted steward sheet,
 * with the clan's town banner beside it. Reads the built sheets (npx tsx tools/art/paint/new-npc.ts steward_<clan> ...).
 * Usage: npx tsx tools/art/preview/town-stewards.ts <out.png>
 */
const NAMES = ["wardens", "redfang", "host", "hidekin", "veiled", "neutral"];
const F = 48, Z = 4, BZ = 4;
async function main() {
  // townBanners.ts draws on DOM canvases: give it napi canvases
  (globalThis as any).document = { createElement: () => createCanvas(1, 1) };
  const { townBannerCanvas } = await import("../../../client/src/townBanners");
  const meta = JSON.parse(readFileSync("client/public/assets/hd/characters/characters.json", "utf8"));
  const rowOf = (dir: string) => Math.floor(meta.animations[`idle_${dir}`].frames[0] / meta.columns);
  const colW = F * Z, bw = 16 * 2 * BZ, bh = 40 * 2 * BZ;
  const out = createCanvas(NAMES.length * colW, 3 * F * Z + 24 + bh);
  const o = out.getContext("2d");
  o.fillStyle = "#3a4030"; o.fillRect(0, 0, out.width, out.height);
  o.imageSmoothingEnabled = false;
  for (const [i, n] of NAMES.entries()) {
    const img = await loadImage(`client/public/assets/hd/characters/steward_${n}.webp`);
    ["down", "right", "up"].forEach((d, r) => o.drawImage(img, 0, rowOf(d) * F, F, F, i * colW, r * F * Z, colW, F * Z));
    o.drawImage(townBannerCanvas(n === "neutral" ? null : (n as any)) as any, i * colW + (colW - bw) / 2, 3 * F * Z + 12, bw, bh);
  }
  writeFileSync(process.argv[2], out.encodeSync("png"));
}
void main();
