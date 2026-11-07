// server/mobView.ts sends monster fields by their index in the schema: MOB_FIELDS must list the synced Mob fields
// in the same order. A field added in the middle of Mob would silently send wrong values to every client.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOB_FIELDS } from "../shared/mobView";
import { Mob } from "../server/TownRoom";

test("MOB_FIELDS matches the order of the synced Mob fields", () => {
  const md = (Mob as any)[Symbol.metadata];
  const names: string[] = [];
  for (let i = 0; md?.[i] !== undefined; i++) names.push(md[i].name);
  assert.deepEqual(names, [...MOB_FIELDS]);
});

test("a client following the monster feed sees the monsters where the server has them", async () => {
  const { startRoom, wait } = await import("./helpers/room");
  const { POS_SCALE, X_FIELD, Y_FIELD } = await import("../shared/mobView");
  const srv = await startRoom();
  try {
    const c = await srv.join();
    const seen = new Map<string, unknown[]>();
    c.onMessage("mv", (msg: any) => {
      for (const row of msg.a ?? []) seen.set(row[0], row.slice(1));
      for (const row of msg.c ?? []) { const v = seen.get(row[0]); if (v) for (let i = 1; i < row.length; i += 2) v[row[i]] = row[i + 1]; }
      for (const id of msg.r ?? []) seen.delete(id);
    });
    c.send("mvready");
    await wait(300);
    const room = srv.room, me = room.state.players.get(c.sessionId);
    // Stand among monsters and let them move for a while (some chase the hero)
    let near: any;
    room.state.mobs.forEach((m: any) => { if (!near && !m.dead && !m.hidden && m.zone === 0) near = m; });
    me.x = near.x + 40; me.y = near.y; me.invulnUntil = Date.now() + 60_000;
    await wait(2500);
    // Monsters keep moving between the last feed message and this check (more so on a busy machine): try a few
    // times, a wrong field index (the bug this guards against) is off every time and by far more
    const check = () => {
      let checked = 0, off = 0;
      for (const [id, v] of seen) {
        const m = room.state.mobs.get(id);
        if (!m || m.dead) continue;
        checked++;
        if (Math.abs((v[X_FIELD] as number) / POS_SCALE - m.x) > 24 || Math.abs((v[Y_FIELD] as number) / POS_SCALE - m.y) > 24) off++;
        assert.equal(v[0], m.kind);
      }
      return { checked, off };
    };
    let { checked, off } = check();
    for (let i = 0; i < 10 && off > 0; i++) { await wait(150); ({ checked, off } = check()); }
    assert.ok(checked > 5, `checked ${checked} monsters`);
    assert.equal(off, 0, `${off} of ${checked} monsters are not where the server has them`);
    await c.leave();
  } finally {
    await srv.stop();
  }
});
