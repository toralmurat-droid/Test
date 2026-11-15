// The Red Badlands' new art on a patch of red ground: npx tsx tools/art/preview/badlands-tiles.ts out.png
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { drawTileset } from "../../../client/src/tileset";
import { T, TILE_COUNT } from "../../../shared/map";
import { TILE } from "../../../shared/constants";
import { tone, vn, type Sprite } from "../../../client/src/moorsPaint";
import { EARTH, OCHRE, MESA, paintArch, paintBoulder, paintBones, paintCactus, paintRedGate, paintScrub, paintSnag, redCliffPixel } from "../../../client/src/badlandsPaint";
import { box } from "../../../client/src/moorsPaint";
import { Bmp } from "../../../client/src/moorsPaint";

const out = process.argv[2] ?? "badlands-tiles.png";
const Z = 3, W = 640, H = 640;
const cv = createCanvas(W * Z, H * Z), o = cv.getContext("2d");
o.imageSmoothingEnabled = false;
// ground: red earth / ochre diamonds (stand-in for the ground painter)
const g = createCanvas(W, H), gc = g.getContext("2d"), img = gc.createImageData(W, H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const wx = y + x / 2, wy = y - x / 2, n = vn(wx / 22, wy / 22, 4), pale = vn(wx / 50 + 30, wy / 50, 8) > 0.62;
  const c = pale ? tone(OCHRE, 0.3 + n * 0.4, x, y) : tone(EARTH, 0.35 + n * 0.5, x, y);
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
  [paintBoulder(1), 40, 60], [paintBoulder(2), 100, 66], [paintBoulder(3), 150, 58],
  [paintBones(1), 200, 62], [paintBones(2), 250, 66], [paintBones(3), 300, 60],
  [paintScrub(0, 1), 350, 62], [paintScrub(0, 2), 400, 66], [paintScrub(1, 3), 450, 62], [paintScrub(1, 4), 490, 66],
  [paintSnag(0, 1), 540, 70], [paintSnag(1, 2), 585, 72], [paintSnag(2, 3), 625, 66],
  [paintCactus(0, 1), 40, 150], [paintCactus(1, 2), 90, 150], [paintCactus(2, 3), 140, 150], [paintCactus(0, 5), 190, 150],
] as [Sprite, number, number][]) put(s, x, y);
// arches: the full bridge from the left leg
put(paintArch(3, 1), 40, 270); put(paintArch(4, 2), 190, 290); put(paintArch(5, 3), 380, 300);
// a stand-in mesa cliff block recoloured (the game recolours desertArt's cliffTexture the same way)
const cliff = (h: number, v: number, x: number, y: number) => {
  const b = new Bmp(64, 32 + h + 8), ox = 32, oy = h + 16;
  box(b, ox, oy, -16, 16, -16, 16, 0, h, (hit) => { const l = 0.18 + hit.lit * 0.75 + (vn(hit.sx * 0.4, hit.sy * 0.4, 2) - 0.5) * 0.15; return [l * 255, l * 255, l * 255]; });
  for (let py = 0; py < b.h; py++) for (let px = 0; px < b.w; px++) {
    const i = (py * b.w + px) * 4; if (b.d[i + 3] < 8) continue;
    const c = redCliffPixel(b.d[i] / 255, px, py, v); b.d[i] = c[0]; b.d[i + 1] = c[1]; b.d[i + 2] = c[2];
  }
  b.outline(0.5);
  put({ b, ox, oy }, x, y);
};
cliff(46, 0, 540, 160); cliff(82, 1, 590, 170);
// the gate: forest side asleep/awake, badlands side (under the arch) asleep/awake
const gate = (side: "forest" | "badlands", awake: boolean, f: number, x: number, y: number) => put({ b: paintRedGate(side, awake, f, 8), ox: 75, oy: 118 }, x, y);
gate("forest", false, 0, 80, 440); gate("forest", true, 2, 230, 440);
put(paintArch(4, 1), 330, 440); gate("badlands", false, 0, 330 + 64, 440 + 32); // asleep, drawn over its arch
put(paintArch(4, 1), 480, 560); gate("badlands", true, 5, 480 + 64, 560 + 32);
// the top-down tiles (tileset.ts): clay, gravel, arch, cactus
const ts = createCanvas(TILE * TILE_COUNT, TILE * 4); drawTileset(ts.getContext("2d") as any, 4);
[T.CLAY, T.GRAVEL, T.ARCH, T.CACTUS].forEach((id, i) => { for (let r = 0; r < 2; r++) o.drawImage(ts, id * TILE, r * TILE, TILE, TILE, (8 + i * 40) * Z, (500 + r * 40) * Z, TILE * Z, TILE * Z); });
void MESA;
console.log("painted in", Date.now() - t0, "ms");
writeFileSync(out, cv.toBuffer("image/png"));
