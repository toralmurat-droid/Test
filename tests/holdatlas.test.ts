import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLAN_KEYS } from "../shared/war/clans";
import { atlasFile } from "../client/src/holdArt";
import { looksOf } from "../tools/art/holds";

// The game draws Holds only from the baked atlases: a fort change (holdWalls.ts) that needs a look the atlas lacks
// would leave a solid cell drawn as nothing. Re-run `npm run art` (or tools/art/holds.ts) when this fails.
test("hold atlases: every piece and ground tile any Hold can need is baked", () => {
  for (const clan of CLAN_KEYS) {
    const meta = JSON.parse(readFileSync(`client/public/assets/holds/${atlasFile(clan, "json")}`, "utf8"));
    const { pieces, ground } = looksOf(clan);
    const missing = [...pieces.keys(), ...ground.keys()].filter((k) => !meta.frames[k]);
    assert.deepEqual(missing, [], `${clan}: looks missing from the atlas`);
  }
});
