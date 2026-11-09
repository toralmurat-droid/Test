// Summoner skill icons and golem-aura icons on one sheet: npx tsx tools/art/preview/summoner-icons.ts <out.png>
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { ICON, paintSkill, paintStatus } from "../../../client/src/skillArt";
import { SKILLS } from "../../../shared/skills";

const ids = SKILLS.summoner.map((s) => s.id), status = ["aura_fire", "aura_cold", "aura_poison", "aura_shock", "wisp_shock"];
const Z = 6, COLS = 8, cells = [...ids.map((id) => paintSkill(id)), ...status.map((id) => paintStatus(id))];
const out = createCanvas(COLS * (ICON * Z + 8), Math.ceil(cells.length / COLS) * (ICON * Z + 8)), o = out.getContext("2d");
o.fillStyle = "#20202a"; o.fillRect(0, 0, out.width, out.height);
cells.forEach((g, i) => {
  if (!g) return;
  const x0 = (i % COLS) * (ICON * Z + 8) + 4, y0 = Math.floor(i / COLS) * (ICON * Z + 8) + 4;
  g.forEach((c, k) => { if (c) { o.fillStyle = c; o.fillRect(x0 + (k % ICON) * Z, y0 + Math.floor(k / ICON) * Z, Z, Z); } });
});
writeFileSync(process.argv[2] ?? "summoner-icons.png", out.encodeSync("png"));
