// Contact sheet of the clan war road art (pennants per clan and length, clash, gate, road strokes, track decals): npx tsx tools/art/preview/war-roads-sheet.ts out.png [zoom]
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { CLAN_KEYS } from "../../../shared/war/clans";
import { ROAD_STYLE, TRACK_VARIANTS, drawClashIcon, drawColumnIcon, drawGateGlyph, drawTrackVariant } from "../../../client/src/columnArt";
const out = process.argv[2] ?? "war-roads-art.png", Z = Number(process.argv[3] ?? 4);
const W = 360, H = 190, cv = createCanvas(W * Z, H * Z), c = cv.getContext("2d") as unknown as CanvasRenderingContext2D;
c.imageSmoothingEnabled = false; c.scale(Z, Z);
c.fillStyle = "#3a4a2c"; c.fillRect(0, 0, W, H);
CLAN_KEYS.forEach((k, i) => [2, 5, 8].forEach((n, j) => drawColumnIcon(c, 8 + j * 16, 8 + i * 13, k, n)));
// on a parchment-ish map patch, minimap scale
c.fillStyle = "#6b5a3e"; c.fillRect(70, 4, 120, 70);
CLAN_KEYS.forEach((k, i) => drawColumnIcon(c, 78 + i * 20, 10, k, 7));
drawClashIcon(c, 80, 30); drawGateGlyph(c, 100, 30); drawGateGlyph(c, 114, 30, "redfang"); drawGateGlyph(c, 128, 30, "veiled");
for (const [kind, y] of [["road", 50], ["track", 58], ["mini", 66]] as const) {
  c.save(); ROAD_STYLE.apply(c, kind); c.beginPath(); c.moveTo(76, y); c.bezierCurveTo(110, y - 10, 140, y + 8, 184, y); c.stroke(); c.restore();
}
drawGateGlyph(c, 74, 46); drawGateGlyph(c, 181, 46);
// track decals, a straight run over grass
for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? "#41572e" : "#3c5029"; c.fillRect(8 + i * 32 - (i > 5 ? 0 : 0), 100, 32, 32); }
for (let i = 0; i < 8; i++) drawTrackVariant(c, 8 + i * 32, i % TRACK_VARIANTS, 100);
for (let v = 0; v < TRACK_VARIANTS; v++) { c.fillStyle = "#3c5029"; c.fillRect(8 + v * 36, 140, 32, 32); drawTrackVariant(c, 8 + v * 36, v, 140); }
writeFileSync(out, cv.encodeSync("png"));
