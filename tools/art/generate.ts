import { mkdirSync, writeFileSync } from "node:fs";
import { ANIMS, COLS, DIRS, FH, FW, HEROES, K, LH, NPCS, buildSheet } from "./characters";
import { buildObjects } from "./objects";
import { buildGear } from "./gear";

const OUT = "client/public/assets";
mkdirSync(`${OUT}/characters`, { recursive: true });
mkdirSync(`${OUT}/objects`, { recursive: true });

// ---- characters ----
const animations: Record<string, { frames: number[]; fps: number; loop: boolean }> = {};
ANIMS.forEach((a, ai) => DIRS.forEach((dir, di) => {
  const row = ai * DIRS.length + di;
  animations[`${a.name}_${dir}`] = { frames: [...Array(a.frames).keys()].map((i) => row * COLS + i), fps: a.fps, loop: a.loop };
}));
// Normal-attack variants for the game (server sends variant 0-3); attack3 stays the combo finisher.
const SWINGS = ["attack", "attack2", "attack4", "attack5"];
SWINGS.forEach((src, i) => DIRS.forEach((dir) => { animations[`swing${i + 1}_${dir}`] = animations[`${src}_${dir}`]; }));
for (const h of [...HEROES, ...NPCS]) buildSheet(h).save(`${OUT}/characters/${h.name}.png`);
writeFileSync(`${OUT}/characters/characters.json`, JSON.stringify({
  characters: HEROES.map((h) => h.name),
  npcs: NPCS.map((h) => h.name),
  image: "{name}.png",
  frameWidth: FW, frameHeight: FH, columns: COLS,
  origin: { x: 0.5, y: 29 / LH },
  /** Fine pixels per logical pixel: display frames at 1/artScale of their size to keep the old world size. */
  artScale: K,
  directions: DIRS, flipXForLeft: "right",
  animations,
}, null, 1));

// ---- objects ----
buildObjects(OUT + "/objects");
// ---- gear overlays (must run after the plain sheets; see gear.ts) ----
buildGear(OUT + "/gear");
console.log("art generated in", OUT);
