import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { CHAINS } from "../shared/quests";
import { waygateArrival, waygateById, WAYGATES } from "../shared/act2";
import { startRoom, wait } from "./helpers/room";

// Murat 2026-11-13: the waygate is used like a portal stone (click / E), and walking into it no longer crosses, so a
// hero still walking can't bounce back and forth between the acts.
test("waygate: crosses only when used, never by walking into it", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    const crossed: string[] = [];
    c.onMessage("waygate", (m: { to: string }) => crossed.push(m.to));
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    for (const id of ["tutorial", "crown", "beast"]) room.qset(p, CHAINS.findIndex((ch) => ch.id === id), { questId: CHAINS.find((ch) => ch.id === id)!.quests.length, questStage: 0, questCount: 0 });
    p.level = 30; // the Sunscar opens at level 30
    const oak = WAYGATES.find((g) => g.id === "oakvale")!;
    p.x = oak.x; p.y = oak.y; // standing right in the gate
    await wait(600);
    assert.deepEqual(crossed, [], "walking into the gate does nothing");
    p.x = oak.x; p.y = oak.y + TILE; p.lastHurt = 0;
    c.send("waygate");
    await wait(400);
    assert.deepEqual(crossed, ["desert"]);
    const at = waygateArrival(waygateById("desert")!);
    assert.ok(Math.hypot(p.x - at.x, p.y - at.y) < TILE, "the hero stands by the desert gate");
    p.x = oak.x; p.y = oak.y + 20 * TILE; c.send("waygate"); // too far from any gate
    await wait(300);
    assert.equal(crossed.length, 1);
    await c.leave();
  } finally {
    await srv.stop();
  }
});
