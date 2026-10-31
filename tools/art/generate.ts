import { mkdirSync, writeFileSync } from "node:fs";
import { ANIMS, COLS, DIRS, FH, FW, HEROES, buildSheet } from "./characters";
import { buildObjects } from "./objects";

const OUT = "client/public/assets";
mkdirSync(`${OUT}/characters`, { recursive: true });
mkdirSync(`${OUT}/objects`, { recursive: true });

// ---- characters ----
const animations: Record<string, { frames: number[]; fps: number; loop: boolean }> = {};
ANIMS.forEach((a, ai) => DIRS.forEach((dir, di) => {
  const row = ai * DIRS.length + di;
  animations[`${a.name}_${dir}`] = { frames: [...Array(a.frames).keys()].map((i) => row * COLS + i), fps: a.fps, loop: a.loop };
}));
for (const h of HEROES) buildSheet(h).save(`${OUT}/characters/${h.name}.png`);
writeFileSync(`${OUT}/characters/characters.json`, JSON.stringify({
  characters: HEROES.map((h) => h.name),
  image: "{name}.png",
  frameWidth: FW, frameHeight: FH, columns: COLS,
  origin: { x: 0.5, y: 29 / FH },
  directions: DIRS, flipXForLeft: "right",
  animations,
}, null, 1));

// ---- objects ----
buildObjects(OUT + "/objects");
console.log("art generated in", OUT);
