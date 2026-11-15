import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { RENOWN_RANKS, rankTitle } from "../shared/war/renown";

test("oaths: a second client gets the map on join, a delta on oath and rank up, and the entry goes on leave", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join();
    await wait(150);
    const room = srv.room, pa = room.state.players.get(a.sessionId);
    pa.level = 20;
    const b = await srv.join(); // joins while A is unsworn
    const got: any[] = [];
    b.onMessage("oaths", (m: any) => got.push(m));
    assert.ok(await until(() => got.some((m) => m.full)), "the joining client gets the full map");
    const full = got.find((m) => m.full);
    assert.deepEqual(full.o, {}, "unsworn heroes are not listed");

    a.send("clan", { swear: "redfang" });
    assert.ok(await until(() => got.some((m) => m.o?.[a.sessionId])), "a delta when A swears");
    assert.deepEqual(got.at(-1).o[a.sessionId], ["redfang", 0]);

    const n = got.length;
    pa.renown = RENOWN_RANKS[3].at + 1; // Banneret: renown grows somewhere (standard, kill, writ, caravan)
    assert.ok(await until(() => got.length > n && got.at(-1).o?.[a.sessionId]?.[1] === 3), "a delta on a rank up");
    assert.equal(rankTitle(got.at(-1).o[a.sessionId]), "Banneret of the Redfang");
    const m = got.length;
    pa.renown += 5; // the same rank: nothing new goes out
    await wait(1300);
    assert.equal(got.length, m, "no message when the rank did not change");

    const c = await srv.join(); // a third client sees A in its full map
    const gotC: any[] = [];
    c.onMessage("oaths", (msg: any) => gotC.push(msg));
    assert.ok(await until(() => gotC.some((x) => x.full)));
    assert.deepEqual(gotC.find((x) => x.full).o, { [a.sessionId]: ["redfang", 3] });

    const aid = a.sessionId;
    await a.leave();
    assert.ok(await until(() => got.some((x) => x.gone?.includes(aid))), "the entry goes on leave");
    await b.leave(); await c.leave();
  } finally { await srv.stop(); }
});

test("rankTitle: Sworn and junk give no title", () => {
  assert.equal(rankTitle(["wardens", 0]), "");
  assert.equal(rankTitle(["wardens", 99]), "");
  assert.equal(rankTitle(["hidekin", 5]), "Hero of the Marches, Hide-Kin");
});
