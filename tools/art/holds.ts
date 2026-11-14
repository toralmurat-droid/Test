// Bakes the five clan Holds to PNG (two layers each: ground under heroes, standing parts sorted by the foot).
// Run by `npm run art`, or alone: npx tsx tools/art/holds.ts [outDir]. The client loads them lazily (client/src/holdAssets.ts).
import { createCanvas } from "@napi-rs/canvas";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { paintHoldLayers } from "../../client/src/holdArt";
import { HOLD_H, HOLD_W, holdFile } from "../../client/src/holdAssets";
import { CLAN_KEYS } from "../../shared/war/clans";

export function buildHolds(out: string) {
  mkdirSync(out, { recursive: true });
  for (const k of CLAN_KEYS) {
    const { ground, stand } = paintHoldLayers(k);
    for (const [layer, d] of [["ground", ground], ["stand", stand]] as const) {
      const cv = createCanvas(HOLD_W, HOLD_H), c = cv.getContext("2d"), img = c.createImageData(HOLD_W, HOLD_H);
      img.data.set(d);
      c.putImageData(img, 0, 0);
      const path = `${out}/${holdFile(k, layer)}`;
      writeFileSync(path, cv.encodeSync("png"));
      console.log(path, Math.round(statSync(path).size / 1024), "KB");
    }
  }
}
if (process.argv[1]?.endsWith("holds.ts")) buildHolds(process.argv[2] ?? "client/public/assets/holds");
