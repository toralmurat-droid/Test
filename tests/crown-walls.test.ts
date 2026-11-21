// The Crown Keep's baked 3D walls (client/src/crownWalls.ts): every wall piece the map uses must be in the baked sheet,
// so a map change that adds a new piece fails here until tools/art/bake-crown-walls.ts is run again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { OBJECTS } from "../shared/map";
import { CRW, wallKeys } from "../client/src/crownWalls";
import { CROWN_WALL_FRAMES } from "../client/src/crownWallFrames";

test("every Crown Keep wall piece on the map is baked", () => {
  const keys = wallKeys(OBJECTS, (x, y) => OBJECTS[y]?.[x] ?? -1);
  assert.ok(keys.some((k) => k.startsWith("slab_")) && keys.some((k) => k.startsWith("moss_")), "the curtain wall and the Throne Hall both have pieces");
  assert.deepEqual(keys, [...CROWN_WALL_FRAMES], "re-run: npx tsx tools/art/bake-crown-walls.ts");
  assert.ok(existsSync(`client/public/assets/hd/props/${CRW.key}.png`));
});
