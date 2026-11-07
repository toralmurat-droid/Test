// Golem look proposals: 3 styles x 4 elements, painted (paint/golems.ts) and pixelized like the game's monsters.
// npx tsx tools/art/proposals/golems.ts <out.png>
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { setPainted } from "../characters";
import { pixelize, shrink } from "../paint/body";
import { GOLEM_H, GOLEM_W, paintGolemFrame, type GolemDir, type GolemElement, type GolemPose, type GolemStyle } from "../paint/golems";

const HI = 8, TX = 1.5, Z = 3, LABEL = 40;
const STYLES: [GolemStyle, string][] = [["monolith", "1 · Monolithe (rochers, fissures en fusion)"], ["elemental", "2 · Élémentaire pur (le corps est l'élément)"], ["runic", "3 · Construit runique (maçonnerie, fer, rune)"]];
const ELS: GolemElement[] = ["fire", "cold", "poison", "shock"];
const shots: [GolemElement, GolemDir, GolemPose][] = [...ELS.map((e) => [e, "down", "stand"] as [GolemElement, GolemDir, GolemPose]), ["fire", "right", "stand"], ["cold", "right", "strike"], ["poison", "down", "wind"], ["shock", "up", "stand"]];

setPainted(true, 1.5, true);
const tw = GOLEM_W * TX, th = GOLEM_H * TX;
const out = createCanvas(tw * Z * shots.length, (th * Z + LABEL) * STYLES.length), o = out.getContext("2d");
o.fillStyle = "#3d4530"; o.fillRect(0, 0, out.width, out.height);
o.imageSmoothingEnabled = false;
STYLES.forEach(([style, title], row) => {
  const y0 = row * (th * Z + LABEL);
  o.fillStyle = "#f2e6c8"; o.font = "bold 26px sans-serif"; o.fillText(title, 12, y0 + 30);
  shots.forEach(([el, dir, pose], col) => {
    const body = createCanvas(GOLEM_W * HI, GOLEM_H * HI), c = body.getContext("2d");
    c.scale(HI, HI);
    paintGolemFrame(c as any, style, el, dir, pose);
    const px = shrink(body as any, "gp", tw, th);
    pixelize(px, tw, th, true);
    const f = createCanvas(tw, th), fc = f.getContext("2d"), img = fc.createImageData(tw, th);
    img.data.set(px); fc.putImageData(img, 0, 0);
    o.drawImage(f, col * tw * Z, y0 + LABEL, tw * Z, th * Z);
  });
});
writeFileSync(process.argv[2] ?? "golem-proposals.png", out.encodeSync("png"));
