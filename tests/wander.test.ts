// Idle monsters stroll round their home spot (WANDER): they never jitter on one spot at the edge of it, nor keep
// pressing on a rock, which made desert scorpions and Gildhounds look stuck in place.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, wait } from "./helpers/room";
import { WANDER } from "../shared/constants";

test("idle Gildhounds and scorpions stroll freely, without jittering in place", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(300);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    let moving = 0, stuck = 0, far = 0;
    for (const kind of ["gildhound", "scorpion"]) {
      const mobs = ([...room.state.mobs.entries()] as [string, any][]).filter(([, m]) => m.kind === kind && !m.dead && !m.hidden);
      assert.ok(mobs.length, `some ${kind}s`);
      const f = mobs[0][1], hx = f.x + 12 * 32, hy = f.y; // awake (within sleep range) but out of their sight
      const near = mobs.map(([, m]) => m).filter((m) => Math.abs(m.x - hx) < 18 * 32 && Math.abs(m.y - hy) < 18 * 32);
      const last = new Map(near.map((m) => [m, [m.x, m.y]]));
      for (let i = 0; i < 60; i++) {
        p.x = hx; p.y = hy; p.hp = p.maxHp = 1e7;
        await wait(100);
        for (const m of near) {
          if (m.target || m.foe || m.spot || m.hidden) continue; // hunting, or off to a hiding spot of its own (HIDE: may lie beyond the stroll ring)
          const [x, y] = last.get(m)!, d = Math.hypot(m.x - x, m.y - y);
          if (m.moving) { moving++; if (d < 0.5) stuck++; }
          if (Math.hypot(m.x - m.homeX, m.y - m.homeY) > WANDER.homeAt + 8) far++;
          last.set(m, [m.x, m.y]);
        }
      }
    }
    assert.ok(moving > 50, `they stroll (${moving} moving samples)`);
    assert.ok(stuck / moving < 0.1, `walking on the spot ${stuck} of ${moving} samples`);
    assert.equal(far, 0, "they stay round home");
  } finally { await srv.stop(); }
});
