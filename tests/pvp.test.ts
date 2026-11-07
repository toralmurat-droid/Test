import { test } from "node:test";
import assert from "node:assert/strict";
import { PVP_PROTECT_LEVEL, pvpProtected } from "../shared/combat";
import { isSafeZone, isSolidAt, VILLAGE } from "../shared/map";
import { TILE } from "../shared/constants";
import { startRoom, wait } from "./helpers/room";

test("pvpProtected: off, heroes of any level can fight", () => {
  assert.equal(PVP_PROTECT_LEVEL, 0);
  assert.equal(pvpProtected(30, 1), false);
  assert.equal(pvpProtected(1, 30), false);
  assert.equal(pvpProtected(1, 1), false);
});

test("in the room: a level 30 hero can hurt a level 1 hero outside the safe zone", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join(), b = await srv.join();
    await wait(200);
    const room = srv.room, pa = room.state.players.get(a.sessionId), pb = room.state.players.get(b.sessionId);
    // A walkable spot outside the stockade and the safe zone
    let x = 0, y = 0;
    for (let tx = VILLAGE.x0 - 12; tx > 0; tx--) {
      x = (tx + 0.5) * TILE; y = (VILLAGE.y0 + 10.5) * TILE;
      if (!isSolidAt(x, y) && !isSafeZone(x, y)) break;
    }
    for (const p of [pa, pb]) { p.x = x; p.y = y; p.invulnUntil = 0; }
    pa.level = 30;
    pb.level = 1;
    const hp0 = pb.hp;
    assert.ok(room.targetsAround(x, y, 40, a.sessionId).includes(b.sessionId), "level 1 hero is a target");
    room.hitTarget(a.sessionId, b.sessionId, 50, [0, 0], {});
    assert.ok(pb.hp < hp0, "level 1 hero is hurt");
    await a.leave(); await b.leave();
  } finally {
    await srv.stop();
  }
});
