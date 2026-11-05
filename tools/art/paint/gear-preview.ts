import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { animFrames, HEROES, setPainted } from "../characters";
import { GEAR, GEAR_IDS } from "../../../shared/gear";
import { wear } from "./sheets";
/** Preview: every hero (rows) wearing each item (columns), facing down. `npx tsx tools/art/paint/gear-preview.ts` */
setPainted(true, Number(process.env.K ?? 1.125), process.env.SMOOTH !== "1");
const IDS = process.env.IDS?.split(",");
const F = Math.round(32 * Number(process.env.K ?? 1.125)), ids = [null, ...(IDS ?? GEAR_IDS)];
const out = createCanvas(F * ids.length, F * HEROES.length), o = out.getContext("2d");
o.fillStyle = "#4a5236"; o.fillRect(0, 0, out.width, out.height);
HEROES.forEach((h, hi) => ids.forEach((id, i) => {
  wear(id ? GEAR[id] : null);
  const f = animFrames(h, "idle", (process.env.DIR as any) ?? "down")[0];
  const c = createCanvas(f.w, f.h), x = c.getContext("2d"), img = x.createImageData(f.w, f.h);
  img.data.set(f.data); x.putImageData(img, 0, 0); o.drawImage(c, i * F, hi * F);
}));
wear(null);
writeFileSync(process.env.OUT ?? "gear-preview.png", out.encodeSync("png"));
