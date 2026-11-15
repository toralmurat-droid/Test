// Lineup of the Red Badlands monsters and the Rustwater Post NPCs: npx tsx tools/art/preview/badlands-lineup.ts out.png [zoom]
// Monsters: facing down, up, right (step), wind-up and strike (right); NPCs: idle down / up / right, walk and attack frames.
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
const Z = Number(process.argv[3] ?? 4), M = "client/public/assets/hd/mobs/", Ch = "client/public/assets/hd/characters/";
const mm = JSON.parse(readFileSync(M + "mobs.json", "utf8")), cm = JSON.parse(readFileSync(Ch + "characters.json", "utf8"));
const mobs = ["outrider", "crossbowman", "firebrand", "warhound", "vulture", "rattler", "redcaptain", "rourke"], npcs = ["rustmarshal", "rustarmourer", "rusthealer"];
type Item = { img: any; sx: number; sy: number; w: number; h: number };
(async () => {
  const pad = 6, rows: Item[][] = [];
  for (const k of mobs) { const m = mm[`mob_${k}`], img = await loadImage(readFileSync(`${M}mob_${k}.webp`)), w = m.w * m.scale, h = m.h * m.scale; rows.push([0, 2, 5, 10, 11].map((f) => ({ img, sx: f * w, sy: 0, w, h }))); }
  for (const n of npcs) {
    const img = await loadImage(readFileSync(`${Ch}${n}.webp`));
    rows.push(["idle_down", "idle_up", "idle_right", "walk_right", "attack_right", "attack_down"].map((a) => {
      const an = cm.animations[a], f = an.frames[a.startsWith("idle") ? 0 : a.startsWith("walk") ? 2 : 3 % an.frames.length];
      return { img, sx: (f % cm.columns) * cm.frameWidth, sy: Math.floor(f / cm.columns) * cm.frameHeight, w: cm.frameWidth, h: cm.frameHeight };
    }));
  }
  const rowH = rows.map((r) => Math.max(...r.map((i) => i.h)) + pad), rowW = rows.map((r) => r.reduce((a, i) => a + i.w + pad, pad));
  // two columns of rows so the sheet is not too wide: monsters left, NPCs right
  const left = rows.slice(0, mobs.length), right = rows.slice(mobs.length), lh = rowH.slice(0, mobs.length), rh = rowH.slice(mobs.length);
  const LW = Math.max(...rowW.slice(0, mobs.length)), RW = Math.max(...rowW.slice(mobs.length)), H = Math.max(lh.reduce((a, b) => a + b, pad), rh.reduce((a, b) => a + b, pad));
  const cv = createCanvas((LW + RW + pad) * Z, H * Z), c = cv.getContext("2d");
  c.imageSmoothingEnabled = false; const g = c.createLinearGradient(0, 0, 0, cv.height); g.addColorStop(0, "#6a4a38"); g.addColorStop(1, "#4a3226"); c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
  const draw = (rs: Item[][], hs: number[], x0: number) => { let y = pad; rs.forEach((r, i) => { let x = x0 + pad; for (const it of r) { c.drawImage(it.img, it.sx, it.sy, it.w, it.h, x * Z, (y + hs[i] - pad - it.h) * Z, it.w * Z, it.h * Z); x += it.w + pad; } y += hs[i]; }); };
  draw(left, lh, 0); draw(right, rh, LW + pad);
  writeFileSync(process.argv[2], cv.encodeSync("png"));
})();
