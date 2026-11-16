import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { bakeCityProp, CITY_PROPS, CITY_PROP_KINDS } from "../../../client/src/cityProps";

/**
 * Preview of the W7 Wardens capital art: the three NPC sheets (down / right / up) and the baked props (two frames each).
 * Usage: npx tsx tools/art/preview/capitals-sheet.ts <out.png>
 */
const NPCS = ["cap_wardens_leader", "cap_wardens_oathkeeper", "cap_wardens_trainer"];
const F = 48, Z = 3, PZ = 3;
async function main() {
  const meta = JSON.parse(readFileSync("client/public/assets/hd/characters/characters.json", "utf8"));
  const rowOf = (d: string) => Math.floor(meta.animations[`idle_${d}`].frames[0] / meta.columns);
  const W = 2300, npcH = 3 * F * Z / 3 * 1 + 0, rowH = F * Z;
  const propRowH = 130 * PZ;
  const out = createCanvas(W, rowH + propRowH + 20), o = out.getContext("2d");
  o.fillStyle = "#3a4030"; o.fillRect(0, 0, W, out.height); o.imageSmoothingEnabled = false;
  void npcH;
  for (const [i, n] of NPCS.entries()) {
    const img = await loadImage(`client/public/assets/hd/characters/${n}.webp`);
    ["down", "right", "up"].forEach((d, r) => o.drawImage(img, 0, rowOf(d) * F, F, F, (i * 3 + r) * F * Z, 0, F * Z, F * Z));
  }
  let x = 10;
  for (const k of CITY_PROP_KINDS) {
    const a = CITY_PROPS[k];
    for (const f of a.frames > 1 ? [0, 3] : [0]) {
      const c = createCanvas(a.w, a.h), cc = c.getContext("2d"), img = cc.createImageData(a.w, a.h);
      img.data.set(bakeCityProp(k, f));
      cc.putImageData(img, 0, 0);
      o.drawImage(c, x, rowH + 10 + (130 - a.h) * PZ, a.w * PZ, a.h * PZ);
      x += a.w * PZ + 10;
    }
  }
  writeFileSync(process.argv[2], out.encodeSync("png"));
}
void main();
