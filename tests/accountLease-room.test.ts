// One account, one server in the room (Ages part 3): with account leases on, onAuth takes the hero's account lease
// (refused while another server holds it) and onLeave saves the hero and gives the lease back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { memLeases } from "../server/lease";
import { memDb } from "./helpers/fencedStore";

test("account leases (room): refused while another server holds the account; taken on auth, saved and released on leave", async () => {
  const acc = await import("../server/accounts");
  const leases = memLeases(), db = memDb<any>(leases);
  await acc.initAccounts({ store: db.store, leases, holder: "here", retryMs: 5 });
  const srv = await startRoom();
  try {
    await srv.join({ cls: "wizard" }); // (makes the room; test rooms skip onAuth, so the hero below goes through it by hand)
    await wait(100);
    const room = srv.room, name = "Leasey", ctx = { ip: "127.0.0.1", headers: {} };
    const opts = { name, password: "testpass1", cls: "wizard" };
    const client = (sid: string) => ({ sessionId: sid, send: () => {} });
    assert.equal(await acc.login(name, "testpass1", "127.0.0.1"), name, "made in the shared table");
    leases.rows.set("acct:leasey", { holder: "other", until: Date.now() + 60_000 });
    await assert.rejects(room.onAuth(client("l1"), opts, ctx), /playing on another server/);
    assert.equal(leases.rows.get("acct:leasey")?.holder, "other");
    leases.rows.delete("acct:leasey"); // the other server let go

    const c = client("l2");
    assert.deepEqual(await room.onAuth(c, opts, ctx), { name });
    assert.equal(leases.rows.get("acct:leasey")?.holder, "here", "taken on auth");
    room.onJoin(c, { cls: "wizard" }, { name });
    await assert.rejects(room.onAuth(client("l3"), { ...opts, cls: "vampire" }, ctx), /already playing/, "one hero per account, in any room");
    room.state.players.get("l2").gold = 4321;
    room.onLeave(c);
    assert.ok(await until(() => !leases.rows.has("acct:leasey")), "released after the leave");
    assert.equal(db.rows.get("leasey").heroes.wizard.gold, 4321, "saved before it was released");
    // Back again: the lease is taken anew and the hero comes back from the saved row
    const d = client("l4");
    await room.onAuth(d, opts, ctx);
    room.onJoin(d, { cls: "wizard" }, { name });
    assert.equal(room.state.players.get("l4").gold, 4321);
    room.onLeave(d);
    assert.ok(await until(() => !leases.rows.has("acct:leasey")));
  } finally { await srv.stop(); }
});
