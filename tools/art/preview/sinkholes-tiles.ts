// The Mawdeep Sinkholes' new art on a patch of damp ground: npx tsx tools/art/preview/sinkholes-tiles.ts out.png
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { drawTileset } from "../../../client/src/tileset";
import { T, TILE_COUNT } from "../../../shared/map";
import { TILE } from "../../../shared/constants";
import { Bmp, box, tone, vn, type Sprite } from "../../../client/src/moorsPaint";
import { LOAM, MOSSY, loamCliffPixel, paintBurrow, paintCaveMouth, paintFern, paintPit, paintSinkway, paintWillow } from "../../../client/src/sinkholesPaint";

const out = process.argv[2] ?? "sinkholes-tiles.png";
const Z = 3, W = 640, H = 600;
const cv = createCanvas(W * Z, H * Z), o = cv.getContext("2d");
o.imageSmoothingEnabled = false;
// ground: moss / loam diamonds (stand-in for the ground painter)
const g = createCanvas(W, H), gc = g.getContext("2d"), img = gc.createImageData(W, H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const wx = y + x / 2, wy = y - x / 2, n = vn(wx / 20, wy / 20, 4), mud = vn(wx / 46 + 30, wy / 46, 8) > 0.66;
  const c = mud ? tone(LOAM, 0.2 + n * 0.3, x, y) : tone(MOSSY, 0.12 + n * 0.4, x, y);
  const i = (y * W + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
}
gc.putImageData(img, 0, 0);
o.drawImage(g, 0, 0, W * Z, H * Z);
const put = (s: Sprite, cx: number, cy: number) => {
  const c = createCanvas(s.b.w, s.b.h), cc = c.getContext("2d");
  const id = cc.createImageData(s.b.w, s.b.h); id.data.set(s.b.d); cc.putImageData(id, 0, 0);
  o.drawImage(c, (cx - s.ox) * Z, (cy - s.oy) * Z, s.b.w * Z, s.b.h * Z);
};
const t0 = Date.now();
for (const [s, x, y] of [
  [paintPit(false, 0), 50, 60], [paintPit(false, 1), 120, 60], [paintPit(false, 2), 190, 60], [paintPit(true, 0), 260, 60], [paintPit(true, 1), 330, 60], [paintPit(true, 2), 400, 60],
  [paintBurrow(0), 470, 62], [paintBurrow(1), 540, 62], [paintBurrow(2), 610, 62],
  [paintFern(0, 1), 40, 130], [paintFern(0, 2), 90, 130], [paintFern(1, 3), 140, 130], [paintFern(1, 4), 190, 130], [paintFern(2, 5), 240, 130], [paintFern(2, 6), 280, 130],
  [paintCaveMouth(0), 360, 160], [paintCaveMouth(1), 450, 160],
  [paintWillow(1), 90, 250], [paintWillow(2), 210, 250], [paintWillow(3), 330, 250],
] as [Sprite, number, number][]) put(s, x, y);
// a stand-in loam cliff block recoloured (the game recolours desertArt's cliffTexture the same way)
const cliff = (h: number, v: number, x: number, y: number) => {
  const b = new Bmp(64, 32 + h + 8), ox = 32, oy = h + 16;
  box(b, ox, oy, -16, 16, -16, 16, 0, h, (hit) => { const l = 0.18 + hit.lit * 0.75 + (vn(hit.sx * 0.4, hit.sy * 0.4, 2) - 0.5) * 0.15; return [l * 255, l * 255, l * 255]; });
  for (let py = 0; py < b.h; py++) for (let px = 0; px < b.w; px++) {
    const i = (py * b.w + px) * 4; if (b.d[i + 3] < 8) continue;
    const c = loamCliffPixel(b.d[i] / 255, px, py, v); b.d[i] = c[0]; b.d[i + 1] = c[1]; b.d[i + 2] = c[2];
  }
  b.outline(0.5);
  put({ b, ox, oy }, x, y);
};
cliff(46, 0, 450, 250); cliff(82, 1, 520, 260); cliff(30, 2, 590, 250);
// the gate: coast side and sinkholes side, asleep and awake
const gate = (side: "coast" | "sinkholes", awake: boolean, f: number, x: number, y: number) => put({ b: paintSinkway(side, awake, f, 8), ox: 75, oy: 118 }, x, y);
gate("coast", false, 0, 85, 440); gate("coast", true, 2, 245, 440); gate("sinkholes", false, 0, 405, 440); gate("sinkholes", true, 5, 565, 440);
// the top-down tiles (tileset.ts): moss (4 variants), pit, burrow, cave
const ts = createCanvas(TILE * TILE_COUNT, TILE * 4); drawTileset(ts.getContext("2d") as any, 4);
for (let r = 0; r < 4; r++) o.drawImage(ts, T.MOSS * TILE, r * TILE, TILE, TILE, (8 + r * 36) * Z, 330 * Z, TILE * Z, TILE * Z);
[T.PIT, T.BURROW, T.CAVE].forEach((id, i) => o.drawImage(ts, id * TILE, 0, TILE, TILE, (8 + i * 36) * Z, 372 * Z, TILE * Z, TILE * Z));
console.log("painted in", Date.now() - t0, "ms");
writeFileSync(out, cv.toBuffer("image/png"));
