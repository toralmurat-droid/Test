// The Gloam Tide with more than one TownRoom (past maxClients): one world meter, one owner. Only the owner schedules,
// marches and pays; every room counts its kills and tells its own Act 1 heroes. First with two Tides on fake hosts,
// then with two real rooms in one process (the first one locked, as a full room is, so the next hero opens a second).
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, wait } from "./helpers/room"; // first: sets SAVE_FILE / IDEAS_FILE to a temp dir
import { Tide, type TideHost, type TideMob } from "../server/tide";
import type { WorldState } from "../server/worldStore";
import { TIDE } from "../shared/tide";

process.env.DAY_TIME = "night";

async function until(cond: () => boolean, ms = 15_000, what = "condition") {
  const end = Date.now() + ms;
  while (!cond()) { if (Date.now() > end) assert.fail(`timed out waiting for ${what}`); await wait(20); }
}

/** A room as the Tide sees it: one Act 1 hero, the monsters it spawned, the messages it sent. */
function fakeRoom(w: WorldState, hero: string) {
  const heroes = new Map([[hero, { name: hero, level: 10, x: 0, y: 0, dead: false }]]);
  const mobs = new Map<string, TideMob>(), sent: { pid: string; type: string; msg: any }[] = [], paid: string[] = [];
  let seq = 0;
  const host: TideHost = {
    heroes: () => heroes.entries(), hero: (pid) => heroes.get(pid), mob: (id) => mobs.get(id),
    spawn: (kind) => { const id = `${hero}-m${++seq}`; mobs.set(id, { kind, dead: false, owner: "", summonFor: "", qwave: false, tide: true }); return id; },
    removeMob: (id) => { const m = mobs.get(id); if (m) m.dead = true; },
    send: (pid, type, msg) => sent.push({ pid, type, msg }),
    act1: () => true, dayFrac: () => 0.8, pay: (pid) => paid.push(pid),
    world: () => w, changed: () => {},
  };
  return { host, mobs, sent, paid, tide: new Tide(host), alive: () => [...mobs.values()].filter((m) => !m.dead).length };
}
const blob = (): TideMob => ({ kind: "slime", dead: false, owner: "", summonFor: "", qwave: false, tide: false });

test("two Tides, one world: the first to tick owns it; both fill the meter and hear it; only the owner marches", () => {
  const w: WorldState = { v: 1, tide: 0, marches: 0 };
  const A = fakeRoom(w, "a1"), B = fakeRoom(w, "b1");
  try {
    let now = 1_000_000;
    A.tide.tick(now); B.tide.tick(now);
    assert.ok(A.tide.owns && !B.tide.owns, "the first room to tick owns the Tide");

    // kills from both rooms fill the one meter, and both rooms' heroes get it
    for (let i = 0; i < 3; i++) A.tide.kill("a1", blob(), now);
    for (let i = 0; i < 2; i++) B.tide.kill("b1", blob(), now);
    assert.equal(w.tide, 5, "kills from both rooms count");
    now += TIDE.sendMs + 1;
    A.tide.tick(now); B.tide.tick(now);
    for (const R of [A, B]) assert.equal(R.sent.filter((s) => s.type === "tide").at(-1)?.msg.n, 5, "the meter in every room");

    // the room that is not the owner fills it: one march booked, both rooms hear it fill
    w.tide = TIDE.goal - 1;
    B.tide.kill("b1", blob(), now);
    assert.equal(w.tide, TIDE.goal);
    assert.ok(w.marchAt !== undefined, "the march is booked");
    const booked = w.marchAt;
    for (const R of [A, B]) assert.ok(R.sent.some((s) => s.type === "sfx" && s.msg.ev === "tidefull"), "tidefull in every room");
    A.tide.kill("a1", blob(), now); B.tide.kill("b1", blob(), now);
    assert.equal(w.marchAt, booked, "further kills don't move it");

    // it is due: the owner sets out, the other room never books a second one nor marches
    w.marchAt = now - 10;
    for (let i = 0; i < 20; i++) {
      now += TIDE.checkMs + 1;
      B.tide.tick(now); A.tide.tick(now); B.tide.tick(now);
      assert.equal(w.marchAt, undefined, `tick ${i}: nobody books a second march while it is out`);
    }
    assert.ok(A.tide.marching && !B.tide.marching, "only the owner marches");
    assert.ok(A.alive() > 0, "the owner's room has marchers");
    assert.equal(B.mobs.size, 0, "the other room has none");
    B.tide.dev("/tidemarch", now); B.tide.start(now);
    assert.equal(B.mobs.size, 0, "asking the other room to march starts nothing more");
    B.tide.kill("b1", blob(), now);
    assert.equal(w.tide, TIDE.goal, "no kills count while it marches");

    // it ends once: one march counted, the meter empty, no pay-out from the other room
    A.tide.dev("/tideend", now);
    assert.ok(!A.tide.marching);
    for (let i = 0; i < 10; i++) { now += TIDE.checkMs + 1; A.tide.tick(now); B.tide.tick(now); }
    assert.equal(w.marches, 1, "one march for one meter");
    assert.equal(w.tide, 0);
    assert.equal(w.marchAt, undefined);
    assert.equal(B.sent.filter((s) => s.type === "tide" && s.msg.result).length, 0, "the other room pays and reports nothing");

    // the owner's room closes in the middle of a full meter: the other room takes over and books the next dusk
    w.tide = TIDE.goal; w.marchAt = undefined;
    A.tide.release();
    B.tide.tick(now);
    assert.ok(B.tide.owns, "the next room to tick owns it");
    assert.ok(w.marchAt !== undefined, "and books the march");
    A.tide.tick(now);
    assert.ok(!A.tide.owns, "a closed room claims nothing");
  } finally { A.tide.release(); B.tide.release(); }
});

test("two real rooms: one owns the Tide, kills in both fill the meter, only the owner's room marches; it hands over on close", async () => {
  const srv = await startRoom();
  const { world } = await import("../server/worldStore");
  const w = world();
  w.tide = 0; w.marchAt = undefined; w.marches = 0;
  try {
    const c1 = await srv.join({ cls: "knight" });
    const r1 = srv.room;
    await until(() => !!r1.state.players.get(c1.sessionId), 10_000, "hero 1 in room 1");
    await until(() => r1.tide.owns, 10_000, "room 1 owns the Tide");
    await r1.lock(); // full: the next hero gets a new room
    const c2 = await srv.join({ cls: "knight" });
    const r2 = srv.room;
    assert.notEqual(r1, r2, "two rooms");
    await until(() => !!r2.state.players.get(c2.sessionId), 10_000, "hero 2 in room 2");
    const news = [] as any[];
    c2.onMessage("tide", (m: any) => news.push(m));
    await wait(300);
    assert.ok(r1.tide.owns && !r2.tide.owns, "room 2 does not own it");

    const kill = (room: any, by: string) => {
      const p = room.state.players.get(by), id = `x${Math.random()}`;
      room.spawnMob("slime", -1, id, { x: p.x + 600, y: p.y, level: 3 });
      room.state.mobs.get(id).hp = 1;
      room.hitTarget(by, id, 50, [0, 0], {});
    };
    kill(r1, c1.sessionId); kill(r2, c2.sessionId); kill(r2, c2.sessionId);
    assert.equal(w.tide, 3, "kills in both rooms fill the one meter");
    await until(() => news.at(-1)?.n === 3, 10_000, "room 2's hero gets the meter");

    w.tide = TIDE.goal; w.marchAt = Date.now() - 10;
    const marchers = (room: any) => [...room.state.mobs.values()].filter((m: any) => m.tide && !m.dead).length;
    await until(() => r1.tide.marching && marchers(r1) > 0, 10_000, "room 1 marches");
    await wait(1200);
    assert.ok(!r2.tide.marching, "room 2 does not");
    assert.equal(marchers(r2), 0, "no marchers in room 2");
    assert.equal(w.marchAt, undefined, "no second march booked");
    r1.tide.dev("/tideend");
    assert.equal(w.marches, 1);

    // room 1 empties and closes: room 2 takes the Tide
    await c1.leave();
    await until(() => r2.tide.owns, 15_000, "room 2 owns the Tide once room 1 is gone");
    await c2.leave();
  } finally { await srv.stop(); delete process.env.DAY_TIME; }
});
