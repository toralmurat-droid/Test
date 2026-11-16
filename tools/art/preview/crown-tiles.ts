// The Crown of the Marches' new art on a patch of marble ground: npx tsx tools/art/preview/crown-tiles.ts out.png
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { drawTileset } from "../../../client/src/tileset";
import { T, TILE_COUNT } from "../../../shared/map";
import { TILE } from "../../../shared/constants";
import { Bmp, box, hash, vn, type Sprite } from "../../../client/src/moorsPaint";
import { BRAZIER_FRAMES, crownCliffPixel, crownCliffTopPixel, paintBrazier, paintCrownGround, paintSpire, paintStatue, type GroundKit } from "../../../client/src/crownPaint";

const out = process.argv[2] ?? "crown-tiles.png";
const Z = 3, W = 640, H = 470;
const cv = createCanvas(W * Z, H * Z), o = cv.getContext("2d");
o.imageSmoothingEnabled = false;
// ground: marble flagstones, a paved path and wild grass, painted with the band's ground painter on an iso grid
const g = createCanvas(W, H), gc = g.getContext("2d"), img = gc.createImageData(W, H);
let cr = 0, cg = 0, cb = 0;
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const kit: GroundKit = {
  ramp: (p, lv, sx, sy) => { const d = BAY[(Math.floor(sy * 1.5) & 3) * 4 + (Math.floor(sx * 1.5) & 3)], c = p[Math.max(0, Math.min(p.length - 1, Math.floor(lv + 0.5 + d * 0.9)))]; cr = c[0]; cg = c[1]; cb = c[2]; },
  vn, hash2: (x, y, s) => hash(x, y, s), fbm: (x, y, s) => vn(x, y, s) * 0.55 + vn(x * 2.03, y * 2.03, s + 11) * 0.3 + vn(x * 4.1, y * 4.1, s + 23) * 0.15,
};
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const wx = y + x / 2, wy = y - x / 2, reg = vn(wx / 140, wy / 140, 5);
  paintCrownGround(reg > 0.62 ? "grass" : reg > 0.56 ? "dust" : reg < 0.2 ? "paving" : "marble", wx, wy, x, y, kit);
  const i = (y * W + x) * 4; img.data[i] = cr; img.data[i + 1] = cg; img.data[i + 2] = cb; img.data[i + 3] = 255;
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
  [paintStatue(0), 50, 110], [paintStatue(1), 130, 110], [paintStatue(2), 210, 110], [paintStatue(3), 290, 110],
  [paintSpire(0), 380, 120], [paintSpire(1), 460, 120], [paintSpire(2), 540, 120], [paintSpire(3), 615, 120],
  ...Array.from({ length: BRAZIER_FRAMES }, (_, f) => [paintBrazier(f % 2, f, BRAZIER_FRAMES), 50 + f * 70, 220] as [Sprite, number, number]),
] as [Sprite, number, number][]) put(s, x, y);
// pale granite cliff blocks: a stand-in cliff recoloured (the game recolours desertArt's cliffTexture the same way)
const cliff = (h: number, v: number, x: number, y: number) => {
  const b = new Bmp(64, 32 + h + 8), ox = 32, oy = h + 16;
  box(b, ox, oy, -16, 16, -16, 16, 0, h, (hit) => { const l = 0.18 + hit.lit * 0.75 + (vn(hit.sx * 0.4, hit.sy * 0.4, 2) - 0.5) * 0.15; return [l * 255, l * 255, l * 255]; });
  for (let py = 0; py < b.h; py++) for (let px = 0; px < b.w; px++) {
    const i = (py * b.w + px) * 4; if (b.d[i + 3] < 8) continue;
    const top = hit_top(b, px, py);
    const c = top ? crownCliffTopPixel(px * 1.5, py * 3) : crownCliffPixel(b.d[i] / 255, px, py, v); b.d[i] = c[0]; b.d[i + 1] = c[1]; b.d[i + 2] = c[2];
  }
  b.outline(0.5);
  put({ b, ox, oy }, x, y);
};
function hit_top(b: Bmp, px: number, py: number) { return b.d[(py * b.w + px) * 4] > 190; }
cliff(46, 0, 70, 330); cliff(82, 1, 140, 340); cliff(30, 2, 210, 330);
// the top-down tiles (tileset.ts): marble (4 variants), statue (2), spire (2), brazier (4 frames)
const ts = createCanvas(TILE * TILE_COUNT, TILE * 4); drawTileset(ts.getContext("2d") as any, 4);
for (let r = 0; r < 4; r++) o.drawImage(ts, T.MARBLE * TILE, r * TILE, TILE, TILE, (290 + r * 36) * Z, 300 * Z, TILE * Z, TILE * Z);
[T.STATUE, T.SPIRE, T.BRAZIER].forEach((id, i) => o.drawImage(ts, id * TILE, 0, TILE, TILE, (290 + i * 36) * Z, 345 * Z, TILE * Z, TILE * Z));
console.log("painted in", Date.now() - t0, "ms");
writeFileSync(out, cv.toBuffer("image/png"));
