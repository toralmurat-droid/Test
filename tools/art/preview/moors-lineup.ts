// Lineup of the Grey Barrow Moors monsters and NPCs: npx tsx tools/art/preview/moors-lineup.ts out.png [zoom]
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
const Z = Number(process.argv[3] ?? 5), M = "client/public/assets/hd/mobs/", Ch = "client/public/assets/hd/characters/";
const mm = JSON.parse(readFileSync(M + "mobs.json", "utf8")), cm = JSON.parse(readFileSync(Ch + "characters.json", "utf8"));
const mobs = ["wight", "boghag", "bonehound", "mistwraith", "legionary", "cairnlord", "barrowking"], npcs = ["cairncaptain", "moorherbalist", "moorarmourer"];
(async () => {
  const H = 62 * 1.5, pad = 8, items: { img: any; sx: number; sy: number; w: number; h: number }[] = [];
  for (const k of mobs) { const m = mm[`mob_${k}`], img = await loadImage(readFileSync(`${M}mob_${k}.webp`)), w = m.w * m.scale, h = m.h * m.scale; for (const f of [0, 4]) items.push({ img, sx: f * w, sy: 0, w, h }); }
  for (const n of npcs) { const img = await loadImage(readFileSync(`${Ch}${n}.webp`)), fr = cm.animations.idle_down.frames[0]; for (const [d, j] of [["idle_down", 0]] as [string, number][]) { const f = cm.animations[d].frames[j]; items.push({ img, sx: (f % cm.columns) * cm.frameWidth, sy: Math.floor(f / cm.columns) * cm.frameHeight, w: cm.frameWidth, h: cm.frameHeight }); } void fr; }
  const W = items.reduce((a, i) => a + i.w + pad, pad), cv = createCanvas(W * Z, (H + pad * 2) * Z), c = cv.getContext("2d");
  c.imageSmoothingEnabled = false; const g = c.createLinearGradient(0, 0, 0, cv.height); g.addColorStop(0, "#3c4238"); g.addColorStop(1, "#2a3028"); c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
  let x = pad; for (const i of items) { c.drawImage(i.img, i.sx, i.sy, i.w, i.h, x * Z, (H + pad - i.h) * Z, i.w * Z, i.h * Z); x += i.w + pad; }
  writeFileSync(process.argv[2], cv.encodeSync("png"));
})();
