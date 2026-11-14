// The Gloam Tide's world store (server/worldStore.ts) and the clan war's kv store (server/war.ts, server/store.ts
// openKv) both keep one document next to the saves file. They must never write the same file: guard the names.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ptb-worldwar-"));
// Before either module is loaded: the world file follows SAVE_FILE's folder, the war's kv files too; no Postgres here
process.env.SAVE_FILE = path.join(dir, "saves.json");
delete process.env.WORLD_FILE;
delete process.env.DATABASE_URL;

test("the world store and the war's kv store keep separate files in the saves folder", async () => {
  const { openKv } = await import("../server/store");
  const { initWorld, world, worldChanged, flushWorldFinal } = await import("../server/worldStore");
  const { _resetWar, flushWar, warState } = await import("../server/war");
  try {
    await initWorld();
    world().tide = 123; worldChanged();
    await flushWorldFinal();
    const kv = await openKv();
    _resetWar(undefined, kv);
    flushWar(); // the war's shutdown write (key "war")
    const files = fs.readdirSync(dir).sort();
    assert.deepEqual(files, ["war.json", "world.json"], "one file each, no temp files left");
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "world.json"), "utf8")).tide, 123, "the war did not overwrite the world");
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "war.json"), "utf8")).state.tick, warState()!.tick, "the world did not overwrite the war");
    assert.ok(await kv.get("war"), "the war loads back from its own file");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
