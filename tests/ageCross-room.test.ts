// Ages part 8 in the real room (docs/ages-progress.md): with shared accounts and a gateway, a hero crosses to another
// Age: refused while fighting, a failed commit keeps them here, then saved, `cross` sent, closed with 4410, the account
// lease given back and the spot carrying the crossing. Off (no gateway): "/age" says one Age, no "ages" at join.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { memLeases } from "../server/lease";
import { memDb } from "./helpers/fencedStore";
import { ACCOUNT_API } from "../shared/accountApi";
import { ACTIVE_CLASSES } from "../shared/classes";
import { CROSS_CLOSE, CROSS_TEXT } from "../shared/ageCross";

const ages = { primary: "blue", ages: ["blue", "green"].map((slot) => ({ slot, name: slot === "blue" ? "Blue" : "Green", up: true, accountApi: ACCOUNT_API, classes: [...ACTIVE_CLASSES] })) };

test("crossing (room): quiet rule, a failed commit, then saved, sent away with 4410 and the lease given back", async () => {
  const acc = await import("../server/accounts");
  const ac = await import("../server/ageCross");
  const { takeLive } = await import("../server/handoff");
  const leases = memLeases(), db = memDb<any>(leases);
  await acc.initAccounts({ store: db.store, leases, holder: "here", retryMs: 5 });
  ac.setAgeCross({ url: "http://gw.internal:8080", here: "blue", fetch: async () => ages });
  const srv = await startRoom();
  const err = console.error;
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(100);
    const room = srv.room, sid = c.sessionId, p = room.state.players.get(sid), name = p.name;
    // (test rooms skip onAuth: the account is made, claimed and mapped by hand, as onAuth does)
    await acc.login(name, "testpass1", "127.0.0.1");
    assert.equal(await acc.claimAccount(name), "fresh");
    room.accts.set(sid, name);
    const said: string[] = [], crossed: unknown[] = [];
    let code = 0;
    c.onMessage("chat", (m: { name: string; text: string }) => { if (m.name === "Ages") said.push(m.text); });
    c.onMessage("cross", (m: unknown) => crossed.push(m));
    c.onLeave((n: number) => { code = n; });

    p.lastHurt = Date.now();
    c.send("cross", { slot: "green" });
    assert.ok(await until(() => said.length === 1));
    assert.equal(said[0], CROSS_TEXT.fight);
    p.lastHurt = 0;
    c.send("cross", { slot: "../green" }); // ignored
    c.send("ages");
    let list: any;
    c.onMessage("ages", (m: unknown) => { list = m; });
    c.send("ages");
    assert.ok(await until(() => !!list));
    assert.deepEqual(list.list.map((r: any) => [r.slot, r.why ?? null]), [["blue", CROSS_TEXT.here], ["green", null]]);

    // The database fails: the crossing fails, the hero stays and can play on
    console.error = () => {};
    db.fail = true;
    p.gold = 777;
    room.askBuckets.clear(); // ("ages" and "cross" share the "ask" budget: 4 at once, then one per 2 s)
    c.send("cross", { slot: "green" });
    assert.ok(await until(() => said.length === 2, 10_000));
    assert.equal(said[1], CROSS_TEXT.saveFail);
    assert.equal(code, 0);
    assert.equal(room.ageCross.gate(sid, "input"), true, "unfrozen");
    db.fail = false;
    console.error = err;

    // Now it goes through
    p.gold = 4321;
    room.askBuckets.clear();
    c.send("cross", { slot: "green" });
    assert.ok(await until(() => code === CROSS_CLOSE, 10_000), "closed with 4410");
    assert.deepEqual(crossed, [{ slot: "green" }]);
    assert.equal(db.rows.get(name.toLowerCase()).heroes.wizard.gold, 4321, "committed");
    assert.ok(await until(() => !leases.rows.has(`acct:${name.toLowerCase()}`)), "the lease given back after the leave");
    const spot = takeLive(name, "wizard");
    assert.ok(spot && typeof spot.crossed === "number" && Date.now() - spot.crossed < 10_000, "the spot carries the crossing");
    assert.equal(ac.crossStats().crossed, 1);
    assert.equal(ac.crossStats().failed, 1);
  } finally { console.error = err; db.fail = false; await srv.stop(); }
});

test("crossing (room): off without a gateway: no `ages` at join, /age says only one Age is open", async () => {
  const ac = await import("../server/ageCross");
  ac.setAgeCross({ url: undefined, here: "blue", shared: () => true });
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(100);
    const room = srv.room, sent: string[] = [];
    room.onJoin({ sessionId: "f1", send: (t: string) => sent.push(t) }, { cls: "wizard" }, { name: "Fakey" });
    assert.ok(sent.length > 0 && !sent.includes("ages"), "no `ages` when off");
    room.onLeave({ sessionId: "f1", send: () => {} });
    const said: string[] = [], others: string[] = [];
    c.onMessage("chat", (m: { name: string; text: string }) => { if (m.name === "Ages") said.push(m.text); else others.push(m.text); });
    c.send("chat", "/age");
    c.send("chat", "/age green");
    assert.ok(await until(() => said.length === 2));
    assert.deepEqual(said, [CROSS_TEXT.off, CROSS_TEXT.off]);
    assert.ok(!others.some((t) => t.includes("/age")), "not said out loud");

    ac.setAgeCross({ url: "http://gw", here: "blue", shared: () => true, fetch: async () => ages });
    const on: [string, any][] = [];
    room.onJoin({ sessionId: "f2", send: (t: string, m: unknown) => on.push([t, m]) }, { cls: "wizard" }, { name: "Fakey2" });
    assert.deepEqual(on.find(([t]) => t === "ages")?.[1], { on: true, here: "blue" }, "on: `ages` at join");
    room.onLeave({ sessionId: "f2", send: () => {} });
  } finally { await srv.stop(); }
});
