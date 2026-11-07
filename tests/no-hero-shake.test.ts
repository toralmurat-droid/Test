// Rule (Murat 2026-11-07): hero skills and spells never shake the screen, for every class.
// This test fails CI if a screen shake is added to any hero skill / spell effect file.
// Monster and boss shakes (TownScene, via camfx.quake) are still allowed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "../client/src");
/** Files that draw hero skills, spells, attacks and their effects. New hero FX files belong here too. */
const HERO_FX_FILES = ["skillfx.ts", "skillMoves.ts", "skillMoveData.ts", "elemFx.ts", "gearfx.ts", "beastFx.ts"];
const SHAKE = /\bquake\s*\(|\.shake\s*\(|shakeEffect|from\s+["']\.\/camfx["']/;

test("hero skill and spell effects never shake the screen", () => {
  for (const f of HERO_FX_FILES) {
    const lines = readFileSync(join(SRC, f), "utf8").split("\n");
    lines.forEach((l, i) => {
      if (l.trim().startsWith("//") || l.trim().startsWith("*")) return;
      assert.ok(!SHAKE.test(l), `${f}:${i + 1} shakes the screen from a hero skill/spell. Hero spells must not shake the screen (Murat's rule). Line: ${l.trim()}`);
    });
  }
});

test("all screen shakes go through camfx.quake (no direct camera.shake)", () => {
  for (const f of readdirSync(SRC).filter((n) => n.endsWith(".ts") && n !== "camfx.ts")) {
    const src = readFileSync(join(SRC, f), "utf8");
    assert.ok(!/\.shake\s*\(/.test(src), `${f} calls camera.shake directly; use quake() from camfx.ts (never for hero spells)`);
  }
});

// Rule (Murat 2026-11-07): very few shakes. Only major bosses, level-up and the village guards' wrath.
// Every quake() call must match one entry here. Adding a shake means adding it here, on purpose, for one of those.
const ALLOWED_SHAKES: { file: string; reason: string; note: string }[] = [
  { file: "TownScene.ts", reason: "major-boss", note: "Mother Blob slam" },
  { file: "TownScene.ts", reason: "major-boss", note: "Bone Demon rises" },
  { file: "TownScene.ts", reason: "major-boss", note: "Bone Demon hellfire" },
  { file: "TownScene.ts", reason: "major-boss", note: "Redfang Chief leap" },
  { file: "TownScene.ts", reason: "village-guards", note: "" },
  { file: "TownScene.ts", reason: "level-up", note: "" },
];

test("only whitelisted screen shakes exist (major bosses, level-up, village guards)", () => {
  const found: string[] = [];
  for (const f of readdirSync(SRC).filter((n) => n.endsWith(".ts") && n !== "camfx.ts")) {
    readFileSync(join(SRC, f), "utf8").split("\n").forEach((l, i) => {
      const m = /\bquake\s*\(.*,\s*"([a-z-]+)"\s*\)/.exec(l);
      if (!/\bquake\s*\(/.test(l) || l.trim().startsWith("//") || l.trim().startsWith("*")) return;
      assert.ok(m, `${f}:${i + 1} calls quake() without a reason`);
      const ok = ALLOWED_SHAKES.some((a) => a.file === f && a.reason === m![1] && (!a.note || l.includes(`// ${a.note}`)));
      assert.ok(ok, `${f}:${i + 1} adds a screen shake that is not on the whitelist. Murat's rule: only major bosses, level-up and the village guards shake the screen. Line: ${l.trim()}`);
      found.push(`${f}:${m![1]}`);
    });
  }
  assert.ok(found.length <= ALLOWED_SHAKES.length, `${found.length} screen shakes, only ${ALLOWED_SHAKES.length} allowed: ${found.join(", ")}`);
});
