// The five Crownway gates, both sides, asleep and awake: npx tsx tools/art/preview/crown-gates.ts out.png
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { GATE_H, GATE_OX, GATE_OY, GATE_W, paintCrownGate, type CrownFrom } from "../../../client/src/crownPaint";

const out = process.argv[2] ?? "crown-gates.png";
const lands: CrownFrom[] = ["oakvale", "moors", "badlands", "sinkholes", "sunscar"];
const Z = 2, cols = 5, rows = 4;
const cv = createCanvas(GATE_W * Z * cols, GATE_H * Z * rows), o = cv.getContext("2d");
o.fillStyle = "#1a1a1e"; o.fillRect(0, 0, cv.width, cv.height);
o.imageSmoothingEnabled = false;
const put = (b: { w: number; h: number; d: Uint8ClampedArray }, x: number, y: number) => {
  const c = createCanvas(b.w, b.h), cc = c.getContext("2d"), id = cc.createImageData(b.w, b.h); id.data.set(b.d); cc.putImageData(id, 0, 0);
  o.drawImage(c, x * GATE_W * Z, y * GATE_H * Z, b.w * Z, b.h * Z);
};
const t0 = Date.now();
lands.forEach((l, i) => {
  put(paintCrownGate(l, "crown", false, 0, 8), i, 0);
  put(paintCrownGate(l, "crown", true, 2 + (i % 3), 8), i, 1);
  put(paintCrownGate(l, "home", false, 0, 8), i, 2);
  put(paintCrownGate(l, "home", true, 5, 8), i, 3);
});
console.log("painted in", Date.now() - t0, "ms", GATE_OX, GATE_OY);
writeFileSync(out, cv.toBuffer("image/png"));
