import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import type { ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import type { WarPlan } from "../shared/war/intel";
import { newWar, targetsOf } from "../shared/war/rules";
import { _resetWar, _setWarOrders, step, warNow, warPlan } from "../server/war";

const A: ClanKey = "redfang", B: ClanKey = "veiled";

test("warplan (room): sworn heroes get only their clan's plan, unsworn none; new plans after a war tick and an oath", async () => {
  const s = newWar(), t0 = Date.now() + 1e9;
  _resetWar({ v: 1, state: s, minds: newMinds(), next: t0, log: [] });
  _setWarOrders({ [A]: { defend: 0.5, attack: [{ t: targetsOf(s, A)[0], share: 1 }] }, [B]: { defend: 0.5, attack: [{ t: targetsOf(s, B)[0], share: 1 }] } });
  const srv = await startRoom();
  try {
    // heroes sworn before they join (as from a save): the plan comes with the join
    const a = await srv.join(), b = await srv.join(), u = await srv.join();
    const got: Record<string, WarPlan[]> = { a: [], b: [], u: [] };
    a.onMessage("warplan", (m: WarPlan) => got.a.push(m));
    b.onMessage("warplan", (m: WarPlan) => got.b.push(m));
    u.onMessage("warplan", (m: WarPlan) => got.u.push(m));
    await wait(150);
    const room = srv.room, pa = room.state.players.get(a.sessionId), pb = room.state.players.get(b.sessionId), pu = room.state.players.get(u.sessionId);
    for (const p of [pa, pb, pu]) p.level = 20;
    pa.clan = A; pb.clan = B;

    a.send("clan", { swear: A }); b.send("clan", { swear: B }); // same clan: no change, the plan comes again
    assert.ok(await until(() => got.a.length > 0 && got.b.length > 0), "sworn heroes get a plan");
    assert.deepEqual(got.a.at(-1), warPlan(A)); assert.deepEqual(got.b.at(-1), warPlan(B));
    assert.notDeepEqual(got.a.at(-1), got.b.at(-1), "each its own clan's");

    // a war tick: new orders, a new plan to each sworn hero, none to the unsworn one
    const na = got.a.length, nb = got.b.length;
    await step(t0);
    assert.equal(warNow()!.tick, 1);
    assert.ok(await until(() => got.a.length > na && got.b.length > nb), "a new plan after the tick");
    assert.equal(got.a.at(-1)!.tick, 1); assert.deepEqual(got.a.at(-1), warPlan(A) ?? { tick: 1, march: [] });
    assert.deepEqual(got.b.at(-1), warPlan(B) ?? { tick: 1, march: [] });
    await wait(300);
    assert.equal(got.u.length, 0, "the unsworn hero never gets a plan");

    // an oath: the hero swears and gets the new clan's plan at once
    const nu = got.u.length;
    u.send("clan", { swear: B });
    assert.ok(await until(() => got.u.length > nu), "a plan right after the oath");
    assert.deepEqual(got.u.at(-1), warPlan(B) ?? { tick: 1, march: [] });
    assert.equal(pu.clan, B);
    await a.leave(); await b.leave(); await u.leave();
  } finally { _setWarOrders(undefined); await srv.stop(); }
});

test("warplan (room): a hero sworn when joining gets the plan with the join; an unsworn joiner gets none", async () => {
  const s = newWar();
  _resetWar({ v: 1, state: s, minds: newMinds(), next: Date.now() + 1e9, log: [] });
  _setWarOrders({ [A]: { defend: 0.5, attack: [{ t: targetsOf(s, A)[0], share: 1 }] } });
  const { TownRoom } = await import("../server/TownRoom");
  const proto = TownRoom.prototype as any, onJoin = proto.onJoin, sent: [string, string, unknown][] = [];
  let swornNext = true;
  // the first joiner comes back sworn (as from a save): the oath is set while the room builds the hero, before its join messages
  proto.onJoin = function (client: any, ...rest: unknown[]) {
    const send = client.send.bind(client), stats = this.applyStats, sworn = swornNext;
    swornNext = false;
    client.send = (t: string, m: unknown) => { sent.push([client.sessionId, t, m]); return send(t, m); };
    this.applyStats = (p: any, ...a: unknown[]) => { if (sworn) { p.level = 20; p.clan = A; } return stats.call(this, p, ...a); };
    try { return onJoin.call(this, client, ...rest); } finally { this.applyStats = stats; }
  };
  const srv = await startRoom();
  try {
    const sw = await srv.join({ cls: "wizard" }), un = await srv.join({ cls: "wizard" });
    await wait(300);
    const plans = (id: string) => sent.filter(([sid, t]) => sid === id && t === "warplan").map(([, , m]) => m);
    assert.equal(srv.room.state.players.get(sw.sessionId).clan, A);
    assert.deepEqual(plans(sw.sessionId), [warPlan(A)], "the sworn joiner gets the clan's plan");
    assert.ok(warPlan(A)!.march.length > 0);
    assert.deepEqual(plans(un.sessionId), [], "the unsworn joiner gets none");
    await sw.leave(); await un.leave();
  } finally { proto.onJoin = onJoin; _setWarOrders(undefined); await srv.stop(); }
});
