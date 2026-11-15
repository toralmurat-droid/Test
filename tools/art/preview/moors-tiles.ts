// The Grey Barrow Moors' new art on a patch of moor: npx tsx tools/art/preview/moors-tiles.ts out.png
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { drawTileset } from "../../../client/src/tileset";
import { T, TILE_COUNT } from "../../../shared/map";
import { TILE } from "../../../shared/constants";
import { paintGate, paintBarrow, paintBirch, paintBones, paintGorse, paintStone, pal, tone, vn, GRASS, HEATH, PEAT, type Sprite } from "../../../client/src/moorsPaint";

const out = process.argv[2] ?? "moors-tiles.png";
const Z = 3, W = 620, H = 500;
const cv = createCanvas(W * Z, H * Z), o = cv.getContext("2d");
o.imageSmoothingEnabled = false;
// ground: heather / bog / moor grass diamonds (stand-in for the ground painter)
const g = createCanvas(W, H), gc = g.getContext("2d"), img = gc.createImageData(W, H);
const BOG = pal(["#0d1311", "#16201d", "#212f2b", "#2f403a"]);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const wx = y + x / 2, wy = y - x / 2, n = vn(wx / 22, wy / 22, 4), bog = vn(wx / 40 + 30, wy / 40, 8) > 0.66;
  const c = bog ? tone(BOG, 0.35 + n * 0.5, x, y) : n > 0.5 ? tone(HEATH, 0.2 + n * 0.45, x, y) : tone(GRASS, 0.2 + n * 0.5, x, y);
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
const row = (list: [Sprite, number, number][]) => { for (const [s, x, y] of list) put(s, x, y); };
row([
  [paintBarrow(3, 1, 1), 80, 90], [paintBarrow(2, 0, 2), 190, 100], [paintBarrow(2, -1, 3), 280, 90], [paintBarrow(3, 1, 4), 400, 130],
  [paintStone(0, 1), 480, 110], [paintStone(1, 2), 520, 125], [paintStone(2, 3), 565, 135],
  [paintBones(1), 60, 210], [paintBones(2), 120, 220], [paintBones(3), 180, 215],
  [paintBirch(0, 1), 240, 230], [paintBirch(1, 2), 290, 235], [paintBirch(2, 3), 335, 225],
  [paintGorse(1), 400, 230], [paintGorse(2), 460, 235],
]);
// the gate, asleep and awake on both sides
const gate = (side: "forest" | "moors", awake: boolean, f: number, x: number) => put({ b: paintGate(side, awake, f, 8), ox: 75, oy: 118 }, x, 360);
gate("forest", false, 0, 80); gate("forest", true, 2, 230); gate("moors", false, 0, 380); gate("moors", true, 5, 530);
// the top-down tiles (tileset.ts): heather, bog, barrow, standing stone, bone pile
const ts = createCanvas(TILE * TILE_COUNT, TILE * 4); drawTileset(ts.getContext("2d") as any, 4);
[T.HEATHER, T.BOG, T.BARROW, T.STANDING_STONE, T.BONE_PILE].forEach((id, i) => o.drawImage(ts, id * TILE, 0, TILE, TILE, (8 + i * 40) * Z, 4 * Z, TILE * Z, TILE * Z));
console.log("painted in", Date.now() - t0, "ms");
writeFileSync(out, cv.toBuffer("image/png"));
