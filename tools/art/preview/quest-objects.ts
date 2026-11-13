import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { CONCEPT_ART, HIDE_FRAME, HideDir, hideboundPixels } from "../../../client/src/questConceptData";

/**
 * Previews of the quest-concept objects and the hide-bound overlay (docs/art/quest-concepts/objects.png, hidebound.png).
 * Usage: npx tsx tools/art/preview/quest-objects.ts
 */
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
const Z = 8;

async function main() {
  // ---- objects: every texture in questConceptData, on grass, 1.5x like the game's object scale, zoomed
  const keys = Object.keys(CONCEPT_ART), cell = 26 * Z;
  const out = createCanvas(cell * 6, cell * Math.ceil(keys.length / 6) );
  const o = out.getContext("2d");
  o.fillStyle = "#566a3c"; o.fillRect(0, 0, out.width, out.height);
  keys.forEach((k, i) => {
    const { rows, pal } = CONCEPT_ART[k], cx = (i % 6) * cell, cy = Math.floor(i / 6) * cell;
    const w = Math.max(...rows.map((r) => r.length)), x0 = cx + Math.round((cell - w * Z) / 2), y0 = cy + cell - 12 - rows.length * Z;
    rows.forEach((row, y) => [...row].forEach((ch, x) => { const c = pal[ch]; if (c !== undefined) { o.fillStyle = hex(c); o.fillRect(x0 + x * Z, y0 + y * Z, Z, Z); } }));
    if (k.includes("seal_turned") || k.includes("lit") || k === "qobj_lamp" || k.includes("lamp_small")) { // the glow the game adds
      const g = o.createRadialGradient(x0 + w * Z / 2, y0 + rows.length * Z / 2, 0, x0 + w * Z / 2, y0 + rows.length * Z / 2, 70);
      g.addColorStop(0, "rgba(255,220,120,0.35)"); g.addColorStop(1, "rgba(255,220,120,0)");
      o.fillStyle = g; o.fillRect(cx, cy, cell, cell);
    }
  });
  writeFileSync("docs/art/quest-concepts/objects.png", out.encodeSync("png"));

  // ---- hide-bound overlay over the three active heroes, facing down / right / up
  const meta = JSON.parse(readFileSync("client/public/assets/hd/characters/characters.json", "utf8"));
  const F = HIDE_FRAME, Z2 = 6, heroes = ["wizard", "vampire", "summoner"], dirs: [string, HideDir][] = [["down", "down"], ["right", "side"], ["up", "up"]];
  const sheet = createCanvas(F * Z2 * heroes.length * 2, F * Z2 * 3);
  const s = sheet.getContext("2d");
  s.fillStyle = "#566a3c"; s.fillRect(0, 0, sheet.width, sheet.height); s.imageSmoothingEnabled = false;
  for (const [hi, h] of heroes.entries()) {
    const img = await loadImage(`client/public/assets/hd/characters/${h}.webp`);
    for (const [ri, [d, view]] of dirs.entries()) {
      const row = Math.floor(meta.animations[`idle_${d}`].frames[0] / meta.columns);
      const bare = (hi * 2) * F * Z2, worn = (hi * 2 + 1) * F * Z2, y = ri * F * Z2;
      s.drawImage(img, 0, row * F, F, F, bare, y, F * Z2, F * Z2);
      s.drawImage(img, 0, row * F, F, F, worn, y, F * Z2, F * Z2);
      for (const [px, py, c] of hideboundPixels(h, view)) { s.fillStyle = hex(c); s.fillRect(worn + px * Z2, y + py * Z2, Z2, Z2); }
    }
  }
  writeFileSync("docs/art/quest-concepts/hidebound.png", sheet.encodeSync("png"));
}
void main();
