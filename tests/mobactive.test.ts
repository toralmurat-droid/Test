// The tick visits only the monsters that may not be frozen (MobGrid passes, TownRoom.markWarm / update). It must
// visit exactly what the old full `mobs.forEach` loop did: every monster that is not frozen when the loop reaches
// it, in map order. A live Map iterator walks along with each pass and plays the old loop: every entry it passes
// on the way to the next visited monster must be frozen at that moment (the old loop would have skipped it there).
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, wait } from "./helpers/room";
import { FACTION, TILE } from "../shared/constants";

type Srv = Awaited<ReturnType<typeof startRoom>>;

/** Wraps the room's monster pass with the old loop's check; returns counters and any mismatch found. */
function watchPasses(room: any) {
  const mobs = room.state.mobs, run = mobs.runPass;
  const st = { passes: 0, visits: 0, skipped: 0, errors: [] as string[], visited: new Set<any>() };
  mobs.runPass = function (fn: (m: any, id: string) => void) {
    st.passes++;
    const it: Iterator<[string, any]> = Map.prototype.entries.call(mobs); // live: sees adds and deletes as forEach would
    const skipTo = (m: any, id: string | undefined) => {
      for (;;) {
        const e = it.next();
        if (e.done) { if (m) st.errors.push(`visited ${id}, which the map order never reaches`); return; }
        const [eid, o] = e.value;
        if (o === m && eid === id) return;
        st.skipped++;
        if (!room.frozen(o)) st.errors.push(`${eid} (${o.kind}) not frozen but not visited${m ? ` before ${id}` : " (end of pass)"}`);
      }
    };
    run.call(this, (m: any, id: string) => {
      if (st.errors.length < 20) skipTo(m, id);
      st.visits++; st.visited.add(m);
      fn(m, id);
    });
    if (st.errors.length < 20) skipTo(undefined, undefined);
  };
  // The feud grid is built from the same pass: it must hold what the old full scan put in it, in the same order
  const feud = room.buildFeudGrid, FEUD_CELL = 128;
  room.buildFeudGrid = function () {
    feud.call(this);
    const old = new Map<number, string[]>();
    mobs.forEach((o: any, oid: string) => {
      if (o.dead || o.summonFor || !FACTION[o.kind as keyof typeof FACTION] || (o.dozy && room.cold(o.x, o.y))) return;
      const k = Math.floor(o.x / FEUD_CELL) * 4096 + Math.floor(o.y / FEUD_CELL);
      (old.get(k) ?? old.set(k, []).get(k)!).push(oid);
    });
    const now = new Map<number, string[]>();
    room.feudGrid.forEach((v: [string, any][], k: number) => now.set(k, v.map(([id]) => id)));
    try { assert.deepEqual(now, old); } catch { st.errors.push("feud grid differs from a full scan"); }
  };
  return { st, stop: () => { delete mobs.runPass; delete room.buildFeudGrid; } };
}

/** A living, dozing monster far from every hero: frozen. */
function farFrozen(room: any, from: { x: number; y: number }, not: Set<any> = new Set()) {
  for (const [id, m] of room.state.mobs) {
    if (m.dead || m.hidden || m.owner || m.target || not.has(m) || !room.frozen(m)) continue;
    if (Math.max(Math.abs(m.x - from.x), Math.abs(m.y - from.y)) < 60 * TILE) continue;
    return [id as string, m] as const;
  }
  throw new Error("no frozen monster found");
}

test("the tick visits every monster the old full loop processed, in map order", async () => {
  const srv: Srv = await startRoom();
  try {
    const c = await srv.join();
    await wait(300);
    const room = srv.room, me = room.state.players.get(c.sessionId);
    me.invulnUntil = Date.now() + 120_000;
    const w = watchPasses(room);
    // Walk among monsters in several zones and swing at whatever is near; jump between them so warm squares move
    const spots: any[] = [];
    room.state.mobs.forEach((m: any) => { if (!m.dead && !m.hidden && !m.owner && m.zone >= 0 && spots.length < 400) spots.push(m); });
    const dirs = [{ right: true }, { down: true }, { left: true }, { up: true }];
    for (let leg = 0; leg < 8; leg++) {
      const m = spots[(leg * 47) % spots.length];
      me.x = m.x + 50; me.y = m.y;
      for (let k = 0; k < 6; k++) {
        c.send("input", { up: false, down: false, left: false, right: false, ...dirs[(leg + k) % 4], seq: leg * 10 + k });
        c.send("attack");
        await wait(120);
      }
    }
    c.send("input", { up: false, down: false, left: false, right: false, seq: 999 });
    w.stop();
    const { st } = w;
    assert.deepEqual(st.errors, []);
    assert.ok(st.passes >= 20, `${st.passes} ticks watched`);
    // The point of it: most monsters are frozen and never visited
    assert.ok(st.skipped > st.visits * 2, `visited ${st.visits}, skipped ${st.skipped}`);
    await c.leave();
  } finally { await srv.stop(); }
});

test("a frozen monster is visited on the next tick once it gets a target, is hit or is spawned far away", async () => {
  const srv: Srv = await startRoom();
  try {
    const c = await srv.join();
    await wait(400);
    const room = srv.room, me = room.state.players.get(c.sessionId);
    me.invulnUntil = Date.now() + 60_000;
    const w = watchPasses(room);
    const visitedNext = async (m: any) => { w.st.visited.clear(); await wait(160); return w.st.visited.has(m); };

    // Given a target (an alert, a call for help, ...)
    const [, a] = farFrozen(room, me);
    a.target = c.sessionId;
    assert.ok(await visitedNext(a), "a monster given a target is visited");

    // Hit from afar (a long-range skill): the hit makes it go after the hero
    const [bid, b] = farFrozen(room, me, new Set([a]));
    room.hitTarget(c.sessionId, bid, 1, [0, 1]);
    assert.ok(b.target || b.foe, "the hit set a target");
    assert.ok(await visitedNext(b), "a monster hit from afar is visited");

    // Spawned far from every hero (a respawn, a raid, a dungeon wave): new monsters start awake
    const far = farFrozen(room, me, new Set([a, b]))[1];
    room.spawnMob(far.kind, far.zone, "s1test");
    const s = room.state.mobs.get("s1test");
    assert.ok(s, "spawned");
    assert.ok(await visitedNext(s), "a spawned monster is visited");

    // Set again under the same id (another monster in its place) and deleted: the old one is never visited again
    const s2 = new (s.constructor as any)();
    s2.kind = s.kind; s2.x = s.x; s2.y = s.y; s2.hp = s2.maxHp = 10;
    room.state.mobs.set("s1test", s2);
    w.st.visited.clear(); await wait(160);
    assert.ok(w.st.visited.has(s2) && !w.st.visited.has(s), "the new one is visited, the replaced one is not");
    room.state.mobs.delete("s1test");
    w.st.visited.clear(); await wait(160);
    assert.ok(!w.st.visited.has(s2), "a deleted monster is not visited");

    w.stop();
    assert.deepEqual(w.st.errors, []);
    await c.leave();
  } finally { await srv.stop(); }
});

test("a hero walking up to a frozen pack wakes it as before", async () => {
  const srv: Srv = await startRoom();
  try {
    const c = await srv.join();
    await wait(400);
    const room = srv.room, me = room.state.players.get(c.sessionId);
    me.invulnUntil = Date.now() + 60_000;
    const w = watchPasses(room);
    const [, m] = farFrozen(room, me);
    const pack: any[] = [];
    room.state.mobs.forEach((o: any) => { if (!o.dead && room.frozen(o) && Math.hypot(o.x - m.x, o.y - m.y) < 6 * TILE) pack.push(o); });
    assert.ok(pack.length >= 1);
    me.x = m.x + 3 * TILE; me.y = m.y;
    await wait(400);
    for (const o of pack) {
      if (o.dead) continue;
      assert.ok(w.st.visited.has(o), `${o.kind} in the pack was visited`);
      assert.equal(o.dozy, false, `${o.kind} in the pack is awake`);
      assert.ok(Date.now() - o.lastTick < 300, `${o.kind} in the pack is updated`);
    }
    w.stop();
    assert.deepEqual(w.st.errors, []);
    await c.leave();
  } finally { await srv.stop(); }
});
