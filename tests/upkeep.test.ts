import { test } from "node:test";
import assert from "node:assert/strict";
import { respecCost, RESPEC } from "../shared/upkeep";
import { startRoom, wait } from "./helpers/room";

test("respec cost: free at low levels, then per level", () => {
  assert.equal(respecCost(RESPEC.freeUpTo), 0);
  assert.equal(respecCost(20), RESPEC.perLevel * 20);
});

test("in the room: death no longer wears gear (stats unchanged); resets cost gold", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    await wait(200);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
    const before = { sta: p.sta, str: p.str, mag: p.mag, dex: p.dex };
    for (let i = 0; i < 5; i++) { p.dead = false; p.invulnUntil = 0; p.x = 0; p.y = 0; room.damagePlayer(id, 99999, "test", [0, 0], 0); }
    assert.deepEqual({ sta: p.sta, str: p.str, mag: p.mag, dex: p.dex }, before, "gear keeps its stats after deaths");
    assert.equal("wear" in room.snapshot(p), false, "wear is no longer saved");
    // Paid stat reset at level 20
    p.dead = false; p.level = 20; p.ptSta = 3; p.lastHurt = 0; p.gold = 0;
    room.resetStats(id);
    assert.equal(p.ptSta, 3, "can't pay: points stay");
    p.gold = respecCost(20);
    room.resetStats(id);
    assert.equal(p.ptSta, 0);
    assert.equal(p.gold, 0);
    await c.leave();
  } finally {
    await srv.stop();
  }
});
