// Contact sheet of the big-battle art (banner pole in 3 states and 2 flutter poses, map glyphs, battle marker): npx tsx tools/art/preview/battle-art-sheet.ts out.png [zoom]
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { drawBannerGlyph, drawBannerSprite, drawBattleMarker } from "../../../client/src/battleArt";
const out = process.argv[2] ?? "battle-art.png", Z = Number(process.argv[3] ?? 4);
const W = 240, H = 80, cv = createCanvas(W * Z, H * Z), c = cv.getContext("2d") as unknown as CanvasRenderingContext2D;
c.imageSmoothingEnabled = false; c.scale(Z, Z);
c.fillStyle = "#3a4a2c"; c.fillRect(0, 0, 192, H);
(["attacker", "defender", "neutral"] as const).forEach((s, i) => { drawBannerSprite(c, 4 + i * 64, 4, s, 0); drawBannerSprite(c, 36 + i * 64, 4, s, 1); });
c.fillStyle = "#6b5a3e"; c.fillRect(192, 0, W - 192, H);
(["attacker", "defender", "neutral"] as const).forEach((s, i) => drawBannerGlyph(c, 198 + i * 12, 6, s));
drawBattleMarker(c, 200, 28); drawBattleMarker(c, 218, 28);
writeFileSync(out, cv.encodeSync("png"));
