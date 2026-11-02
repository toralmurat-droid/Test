import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { animFrames, HEROES, NPCS, setPainted, DIRS } from "../characters";
setPainted(true, 3);
const names = process.argv.slice(2);
const anims = ["idle", "walk", "attack", "attack3", "skill", "hit"];
const all = [...HEROES, ...NPCS].filter((h) => !names.length || names.includes(h.name));
const Z = 2, F = 96;
const out = createCanvas(F * Z * 6 * DIRS.length, F * Z * all.length * 2);
const o = out.getContext("2d");
o.fillStyle = "#4a5236"; o.fillRect(0, 0, out.width, out.height);
o.imageSmoothingEnabled = true;
all.forEach((h, hi) => {
  DIRS.forEach((d, di) => {
    const fr = [...animFrames(h, "idle", d).slice(0, 1), ...animFrames(h, "walk", d).slice(0, 2), ...animFrames(h, "attack", d).slice(1, 3), animFrames(h, "attack3", d)[2]];
    const fr2 = [animFrames(h, "skill", d)[2], animFrames(h, "hit", d)[0], animFrames(h, "ko", d)[3], animFrames(h, "cheer", d)[1], animFrames(h, "dodge", d)[2], animFrames(h, "attack2", d)[2]];
    [fr, fr2].forEach((row, ri) => row.forEach((f, fi) => {
      const c = createCanvas(f.w, f.h); const x = c.getContext("2d"); const id = x.createImageData(f.w, f.h); id.data.set(f.data); x.putImageData(id, 0, 0);
      o.drawImage(c, (di * 6 + fi) * F * Z, (hi * 2 + ri) * F * Z, F * Z, F * Z);
    }));
  });
});
writeFileSync(process.env.OUT ?? "paint-preview.png", out.encodeSync("png"));
