import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Monster run frames (tools/art/paint/mobs.ts RUN_FRAMES, client TownScene MOB_RUN_FRAMES): 6 per facing x 3, after
// every other frame; then, for armed ones, the 3D swings (3 blows x 3 facings x 4 poses, client MOB_SWING_FRAMES)
test("mobs.json run and swing frames sit after every other frame", () => {
  const meta: Record<string, { frames: number; run?: number; swing?: number }> = JSON.parse(readFileSync("client/public/assets/hd/mobs/mobs.json", "utf8"));
  let n = 0, sw = 0;
  for (const [k, m] of Object.entries(meta)) {
    if (m.swing !== undefined) { sw++; assert.equal(m.swing, m.run! + 18, k); assert.equal(m.frames, m.swing + 36, k); continue; }
    if (m.run === undefined) continue;
    n++;
    assert.equal(m.run, m.frames - 18, k);
    assert.ok(m.run >= 12, k);
  }
  assert.ok(n > 0 && sw > 0);
});
