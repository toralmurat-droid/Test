import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, wait } from "./helpers/room";

test("clan message: bad payloads ignored, level gate, oath saved and restored", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join();
    const got: any[] = [];
    c.onMessage("clan", (m: any) => got.push(m));
    await wait(150);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    assert.equal(got[0]?.clan, "", "join tells the hero they are not sworn");
    p.level = 1;
    c.send("clan", { swear: "wardens" }); await wait(100);
    assert.equal(p.clan, undefined, "too low to swear");
    assert.ok(got.at(-1).err);
    p.level = 20;
    for (const bad of [null, 5, "x", { swear: 7 }, { swear: "__proto__" }, { swear: "constructor" }]) c.send("clan", bad as any);
    await wait(150);
    assert.equal(p.clan, undefined, "garbage changes nothing");
    await wait(2200); // the ask budget refills
    c.send("clan", { swear: "veiled" }); await wait(100);
    assert.equal(p.clan, "veiled");
    const save = room.snapshot(p);
    assert.equal(save.clan, "veiled");
    assert.ok(save.clanAt > 0);
    p.clan = undefined; p.clanAt = 0;
    room.restore(p, structuredClone(save));
    assert.equal(p.clan, "veiled", "restored");
    room.restore(p, { ...structuredClone(save), clan: "nope", clanAt: "x" });
    assert.equal(p.clan, undefined, "a broken oath loads as none");
    p.renown = 0;
    assert.equal(room.snapshot(p).renown, undefined, "no renown, no save field");
    p.renown = 37.25;
    const s2 = room.snapshot(p); p.renown = 0;
    room.restore(p, structuredClone(s2));
    assert.equal(p.renown, 37.25, "renown saved and restored");
    room.restore(p, { ...structuredClone(s2), renown: "lots" });
    assert.equal(p.renown, 0, "broken renown loads as 0");
    await c.leave();
  } finally { await srv.stop(); }
});
