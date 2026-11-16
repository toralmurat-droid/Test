/**
 * Contact sheet for the 3D-built heroes (body3d.ts): one row per facing, with idle, walk, run, attacks and a hit,
 * dressed in the class kit (KIT=0 for the bare body) or one found item (ITEM=a_chain), 3D on or off (FLAT=1).
 *   npx tsx tools/art/paint/hero3d-preview.ts vampire out.png
 */
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { HEROES, PAINT_DIRS, setPainted, sheetFrames } from "../characters";
import { setPaintGear, setPaintKit, setRay3D } from "./body";
import { KITS } from "./look";
import { GEAR } from "../../../shared/gear";
import { wear } from "./sheets";

const [name = "vampire", out = "hero3d-preview.png"] = process.argv.slice(2);
setPainted(true, 1.5, true);
setRay3D(process.env.FLAT !== "1");
const h = HEROES.find((x) => x.name === name)!;
if (process.env.ITEM) wear(GEAR[process.env.ITEM]);
else if (process.env.KIT !== "0") { setPaintKit(Object.assign({}, ...Object.values(KITS[name] ?? {}))); setPaintGear(null); }
const anims = (process.env.ANIMS ?? "idle:0,walk:0,walk:2,walk:4,run:1,run:3,attack:1,attack:2,attack2:2,skill:2,hit:0").split(",").map((x) => x.split(":"));
const F = 48, Z = Number(process.env.Z ?? 3);
const cv = createCanvas(F * Z * anims.length, F * Z * PAINT_DIRS.length), o = cv.getContext("2d");
o.fillStyle = "#3b3529"; o.fillRect(0, 0, cv.width, cv.height); o.imageSmoothingEnabled = false;
PAINT_DIRS.forEach((d, di) => anims.forEach(([a, i], ai) => {
  const f = sheetFrames(h, a, d)[Number(i)]; if (!f) return;
  const c = createCanvas(f.w, f.h), x = c.getContext("2d"), id = x.createImageData(f.w, f.h); id.data.set(f.data); x.putImageData(id, 0, 0);
  o.drawImage(c, ai * F * Z, di * F * Z, F * Z, F * Z);
}));
writeFileSync(out, cv.encodeSync("png"));
