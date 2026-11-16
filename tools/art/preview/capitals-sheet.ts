import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { bakeCityProp, CITY_PROPS, CITY_PROP_KINDS } from "../../../client/src/cityProps";
import type { ClanKey } from "../../../shared/war/clans";

/**
 * Preview of the W7 capital art, one band per clan: the city's three NPC sheets (down / right / up) and its baked props in
 * the clan's colours (two frames each).
 * Usage: npx tsx tools/art/preview/capitals-sheet.ts <out.png> [clan ...]   (default: every clan)
 */
const CLANS: ClanKey[] = ["wardens", "veiled", "host", "redfang", "hidekin"];
const F = 48, Z = 3, PZ = 3;
async function main() {
  const meta = JSON.parse(readFileSync("client/public/assets/hd/characters/characters.json", "utf8"));
  const rowOf = (d: string) => Math.floor(meta.animations[`idle_${d}`].frames[0] / meta.columns);
  const clans = process.argv.length > 3 ? (process.argv.slice(3) as ClanKey[]) : CLANS;
  const W = 2300, rowH = F * Z, propRowH = 130 * PZ, bandH = rowH + propRowH + 20;
  const out = createCanvas(W, bandH * clans.length), o = out.getContext("2d");
  o.fillStyle = "#3a4030"; o.fillRect(0, 0, W, out.height); o.imageSmoothingEnabled = false;
  for (const [ci, clan] of clans.entries()) {
    const y0 = ci * bandH;
    for (const [i, role] of ["leader", "oathkeeper", "trainer"].entries()) {
      const img = await loadImage(`client/public/assets/hd/characters/cap_${clan}_${role}.webp`);
      ["down", "right", "up"].forEach((d, r) => o.drawImage(img, 0, rowOf(d) * F, F, F, (i * 3 + r) * F * Z, y0, F * Z, F * Z));
    }
    let x = 10;
    for (const k of CITY_PROP_KINDS) {
      const a = CITY_PROPS[k];
      for (const f of a.frames > 1 ? [0, 3] : [0]) {
        const c = createCanvas(a.w, a.h), cc = c.getContext("2d"), img = cc.createImageData(a.w, a.h);
        img.data.set(bakeCityProp(k, f, clan));
        cc.putImageData(img, 0, 0);
        o.drawImage(c, x, y0 + rowH + 10 + (130 - a.h) * PZ, a.w * PZ, a.h * PZ);
        x += a.w * PZ + 10;
      }
    }
  }
  writeFileSync(process.argv[2], out.encodeSync("png"));
}
void main();
