// Golden save test: tests/fixtures/save-quests.json was captured from the code BEFORE the Player.quests restructure
// (snapshot() of heroes with progress in every chain). Saves must keep loading and writing the same keys forever.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CHAINS, TUT_CHAIN, chainState, packQuest } from "../shared/quests";
import { startRoom, wait } from "./helpers/room";

const fixture: Record<string, Record<string, unknown>> = JSON.parse(fs.readFileSync(new URL("./fixtures/save-quests.json", import.meta.url), "utf8"));
const chainKeys = CHAINS.flatMap((ch) => [...ch.keys, ch.verKey]);
const pick = (s: Record<string, unknown>) => Object.fromEntries(chainKeys.map((k) => [k, s[k]]));

test("save fixture covers every chain and at least two zone arcs", () => {
  for (const save of Object.values(fixture)) {
    for (const k of chainKeys) assert.equal(typeof save[k], "number", `fixture has ${k}`);
    assert.ok(CHAINS.filter((c) => c.local).length >= 2);
  }
});

for (const name of Object.keys(fixture)) {
  test(`save round trip (${name}): restore then snapshot gives the same chain keys, the client sees the packed map`, async () => {
    const srv = await startRoom();
    try {
      const c = await srv.join({ cls: "wizard" });
      await wait(300);
      const room = srv.room, p = room.state.players.get(c.sessionId), save = fixture[name];
      room.restore(p, structuredClone(save));
      assert.deepEqual(pick(room.snapshot(p)), pick(save), "same chain keys and values");
      await wait(300);
      const me = c.state.players.get(c.sessionId);
      for (const ch of CHAINS) {
        const [a, b, n] = ch.keys, want = packQuest(save[a] as number, save[b] as number, save[n] as number);
        assert.equal(me.quests.get(ch.packed) ?? 0, want, `client sees ${ch.packed}`);
        assert.equal(p.quests.has(ch.packed), want !== 0, `${ch.packed} key present only when non-zero`);
      }
      await c.leave();
    } finally { await srv.stop(); }
  });
}

test("save round trip: tutorial state is distinct between the two fixtures", () => {
  assert.equal(fixture.tutDone.tutId, CHAINS[TUT_CHAIN].quests.length);
  assert.equal(fixture.tutDone.tutStage, 0);
  assert.ok((fixture.tutInProgress.tutStage as number) > 0);
});

test("saves: no tutVer counts the tutorial as done; new hero starts First Steps on step 1; progress 0 removes the key", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(300);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    // a brand-new hero: First Steps step 1, nothing else
    assert.deepEqual([...p.quests.keys()], ["tut"]);
    assert.equal(p.quests.get("tut"), packQuest(0, 1, 0));
    assert.equal(chainState(p, TUT_CHAIN)!.questStage, 1);
    // an old save without tutVer
    const old = structuredClone(fixture.tutInProgress) as Record<string, unknown>;
    for (const k of ["tutId", "tutStage", "tutCount", "tutVer"]) delete old[k];
    room.restore(p, old);
    assert.equal(p.quests.get("tut"), packQuest(CHAINS[TUT_CHAIN].quests.length, 0, 0), "tutorial counts as done");
    assert.equal(room.snapshot(p).tutId, CHAINS[TUT_CHAIN].quests.length);
    // a very old save with no chain keys at all: no quest keys but the done tutorial
    room.restore(p, { color: 1, level: 1 });
    assert.deepEqual([...p.quests.keys()], ["tut"]);
    // progress 0 removes the key
    room.qset(p, 0, { questId: 3, questStage: 1, questCount: 2 });
    assert.equal(p.quests.get("gloam"), packQuest(3, 1, 2));
    room.qset(p, 0, { questId: 0, questStage: 0, questCount: 0 });
    assert.equal(p.quests.has("gloam"), false);
    assert.equal(room.snapshot(p).questId, 0);
    await c.leave();
  } finally { await srv.stop(); }
});
