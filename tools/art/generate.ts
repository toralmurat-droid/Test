import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ANIMS, COLS, DIRS, FH, FW, HEROES, K, LH, NPCS, PAINT_COLS, PAINT_DIRS, animsOf, buildSheet } from "./characters";
import { buildObjects } from "./objects";
import { buildHolds } from "./holds";
import { buildGear } from "./gear";
import { buildPainted, PAINT_K } from "./paint/sheets";
import { buildPoseVariants } from "./paint/pose-variants";
import { buildSkillMoves } from "./paint/skill-moves";
import { buildMobs } from "./paint/mobs";

const OUT = "client/public/assets";
mkdirSync(`${OUT}/characters`, { recursive: true });
mkdirSync(`${OUT}/objects`, { recursive: true });

// ---- characters ----
/** Animation table for a sheet laid out as anim x dir rows of `cols` frames. */
function animTable(anims: typeof ANIMS, dirs: readonly string[], cols: number) {
  const animations: Record<string, { frames: number[]; fps: number; loop: boolean }> = {};
  anims.forEach((a, ai) => dirs.forEach((dir, di) => {
    const row = ai * dirs.length + di;
    animations[`${a.name}_${dir}`] = { frames: [...Array(a.frames).keys()].map((i) => row * cols + i), fps: a.fps, loop: a.loop };
  }));
  // Normal-attack variants for the game (server sends variant 0-3); attack3 stays the combo finisher.
  const SWINGS = ["attack", "attack2", "attack4", "attack5"];
  SWINGS.forEach((src, i) => dirs.forEach((dir) => { animations[`swing${i + 1}_${dir}`] = animations[`${src}_${dir}`]; }));
  return animations;
}
const animations = animTable(ANIMS, DIRS, COLS);
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
buildHolds(OUT + "/holds"); // clan Hold atlases, loaded lazily by the client (holdAssets.ts)
// ---- gear overlays (must run after the plain sheets; see gear.ts) ----
buildGear(OUT + "/gear");
// ---- painted (smooth) characters + gear: assets/hd, used unless ?pixel=1 (`npm run art -- --hd-only knight` = just those) ----
const args = process.argv.slice(2), hdOnly = args[0] === "--hd-only";
buildPainted(OUT + "/hd", { only: hdOnly ? args.slice(1) : [] });
buildPoseVariants(OUT + "/hd", hdOnly ? args.slice(1) : []); // other weapon stances (archer-melee...), slow: ~20 s a sheet
buildSkillMoves(OUT + "/hd", hdOnly ? args.slice(1) : []); // big melee skill poses (client/src/skillMoveData.ts)
buildMobs(OUT + "/hd/mobs");
writeFileSync(`${OUT}/hd/characters/characters.json`, JSON.stringify({
  ...JSON.parse(readFileSync(`${OUT}/characters/characters.json`, "utf8")),
  image: "{name}.webp", frameWidth: FW / K * PAINT_K, frameHeight: FH / K * PAINT_K, artScale: PAINT_K,
  // 3/4 facings (flipX for downleft/upleft) and 8-frame walk/run cycles
  columns: PAINT_COLS, directions: PAINT_DIRS, animations: animTable(animsOf(true), PAINT_DIRS, PAINT_COLS),
}, null, 1));
console.log("art generated in", OUT);
