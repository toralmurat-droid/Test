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
