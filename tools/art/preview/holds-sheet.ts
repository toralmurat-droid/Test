// Contact sheet of the five clan Holds: npx tsx tools/art/preview/holds-sheet.ts out.png [clan|all] [zoom]
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { paintHoldLayers } from "../../../client/src/holdArt";
import { HOLD_H, HOLD_W } from "../../../client/src/holdAssets";
import { CLAN_KEYS } from "../../../shared/war/clans";
const out = process.argv[2] ?? "holds.png", only = process.argv[3], Z = Number(process.argv[4] ?? 1);
const keys = only && only !== "all" ? CLAN_KEYS.filter((k) => k === only) : CLAN_KEYS;
const cols = keys.length === 1 ? 1 : 2, rows = Math.ceil(keys.length / cols);
const cv = createCanvas(HOLD_W * cols * Z, HOLD_H * rows * Z), c = cv.getContext("2d");
c.fillStyle = "#2c3a20"; c.fillRect(0, 0, cv.width, cv.height);
c.imageSmoothingEnabled = false;
keys.forEach((k, i) => {
  const { ground, stand } = paintHoldLayers(k);
  for (const d of [ground, stand]) {
    const l = createCanvas(HOLD_W, HOLD_H), lc = l.getContext("2d");
    const img = lc.createImageData(HOLD_W, HOLD_H);
    img.data.set(d);
    lc.putImageData(img, 0, 0);
    c.drawImage(l, (i % cols) * HOLD_W * Z, Math.floor(i / cols) * HOLD_H * Z, HOLD_W * Z, HOLD_H * Z);
  }
});
writeFileSync(out, cv.encodeSync("png"));
