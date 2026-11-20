import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Monster run frames (tools/art/paint/mobs.ts RUN_FRAMES, client TownScene MOB_RUN_FRAMES): 6 per facing x 3, at the end of the sheet
test("mobs.json run frames sit after every other frame", () => {
  const meta: Record<string, { frames: number; run?: number }> = JSON.parse(readFileSync("client/public/assets/hd/mobs/mobs.json", "utf8"));
  let n = 0;
  for (const [k, m] of Object.entries(meta)) {
    if (m.run === undefined) continue;
    n++;
    assert.equal(m.run, m.frames - 18, k);
    assert.ok(m.run >= 12, k);
  }
  assert.ok(n > 0);
});
