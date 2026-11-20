// tools/ci/critical-areas.mjs: which critical areas a PR touches, from its files and diff (see CLAUDE.md).
import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore plain JS module without types
import { areasOf } from "../tools/ci/critical-areas.mjs";

const f = (filename: string, patch = "") => ({ filename, patch });

test("files map to their areas", () => {
  assert.deepEqual(areasOf([f("server/accounts.ts"), f("shared/skillEngine.ts")]), ["saves", "skill-engine"]);
  assert.deepEqual(areasOf([f("server/accountGuard.ts")]), ["saves"]);
  assert.deepEqual(areasOf([f("server/player.ts"), f("shared/map.ts"), f(".github/workflows/ci.yml")]), ["deploy", "map", "schema"]);
  for (const file of ["server/start.ts", "server/gateway.ts", "railway.gateway.json", "railway.json", "server/index.ts"])
    assert.deepEqual(areasOf([f(file)]), ["deploy"], file);
  assert.deepEqual(areasOf([f("shared/moors.ts")]), ["map"]);
  assert.deepEqual(areasOf([f("shared/badlands.ts")]), ["map"], "the Red Badlands band is deterministic map code too");
  assert.deepEqual(areasOf([f("shared/sinkholes.ts")]), ["map"], "the Mawdeep Sinkholes band is deterministic map code too");
  assert.deepEqual(areasOf([f("shared/saltmere.ts")]), ["map"], "Saltmere's layout is drawn by the map builder");
  assert.deepEqual(areasOf([f("shared/crown.ts")]), ["map"], "the Crown of the Marches band is deterministic map code too");
  assert.deepEqual(areasOf([f("shared/highways.ts")]), ["map"], "the land highways are cut into the map");
  assert.deepEqual(areasOf([f("shared/villages.ts")]), ["map"], "the villages are carved into the map");
  assert.deepEqual(areasOf([f("shared/borders.ts")]), ["map"], "the border roads are cut into the map");
  assert.deepEqual(areasOf([f("shared/skills.ts"), f("client/src/TownScene.ts"), f("docs/x.md")]), []);
});

test("TownRoom.ts counts only for changed save or schema lines", () => {
  const ctx = "@@ -980,6 +980,7 @@ export class TownRoom extends Room<TownState> {\n   private snapshot(p: Player): HeroSave {\n";
  assert.deepEqual(areasOf([f("server/TownRoom.ts", ctx + "+    const x = 1;")]), [], "unchanged context lines don't count");
  assert.deepEqual(areasOf([f("server/TownRoom.ts", ctx + "+      swMode: p.mode,\n+    saveHero(p.name, p.cls, this.snapshot(p));")]), ["saves"]);
  assert.deepEqual(areasOf([f("server/TownRoom.ts", "@@ -1 +1 @@\n-    const save = loadHero(p.name, p.cls);")]), ["saves"]);
  assert.deepEqual(areasOf([f("server/TownRoom.ts", "@@ -1 +1 @@\n+  @type(\"number\") rage = 0;")]), ["schema"]);
  assert.deepEqual(areasOf([f("server/TownRoom.ts", "--- a/x\n+++ b/x\n+  const y = 2;")]), [], "file header lines don't count");
});
