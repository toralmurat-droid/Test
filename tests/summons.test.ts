import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafeZone, isSolidAt, VILLAGE } from "../shared/map";
import { TILE } from "../shared/constants";
import { SUMMON } from "../shared/summons";
import { startRoom, wait } from "./helpers/room";

/** A walkable spot outside the stockade and the safe zone. */
function openSpot(): [number, number] {
  for (let tx = VILLAGE.x0 - 14; tx > 0; tx--) {
    const x = (tx + 0.5) * TILE, y = (VILLAGE.y0 + 10.5) * TILE;
    if (!isSolidAt(x, y) && !isSafeZone(x, y) && !isSolidAt(x + 20, y) && !isSolidAt(x - 20, y)) return [x, y];
  }
  throw new Error("no open spot");
}

test("summons: cap, PvP rules, no reward for killing one, they fight monsters for their owner, they leave with the owner", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join(), b = await srv.join();
    await wait(200);
    const room = srv.room, A = room.state.players.get(a.sessionId), B = room.state.players.get(b.sessionId);
    const [x, y] = openSpot();
    // Only these heroes out here: no wild monster in the way of the checks below
    room.state.mobs.forEach((_m: any, id: string) => room.state.mobs.delete(id));
    for (const p of [A, B]) { p.x = x; p.y = y; p.level = 20; p.invulnUntil = 0; }

    // Cap: the third summon sends the oldest back
    const s1 = room.summon(a.sessionId, "golem_fire"), s2 = room.summon(a.sessionId, "golem_cold"), s3 = room.summon(a.sessionId, "golem_shock");
    await wait(100);
    const mine = () => [...room.summons.values()].filter((m: any) => m.owner === a.sessionId && !m.dead);
    assert.equal(mine().length, SUMMON.max);
    assert.ok(!room.summons.has(s1) && room.summons.has(s2) && room.summons.has(s3));
    const g = room.state.mobs.get(s2);

    // The owner can't hurt their own golem; another hero can, at any level (no newcomer protection)
    const hp0 = g.hp;
    room.hitTarget(a.sessionId, s2, 30, [0, 0], {});
    assert.equal(g.hp, hp0, "own golem untouched");
    room.hitTarget(b.sessionId, s2, 30, [0, 0], {});
    assert.ok(g.hp < hp0, "enemy hero hurts it");
    const hp1 = g.hp;
    A.level = 8;
    room.hitTarget(b.sessionId, s2, 30, [0, 0], {});
    assert.ok(g.hp < hp1, "a low-level owner's golem can be hurt too");
    A.level = 20;

    // The golem picks the enemy hero (PvP) at any level, never its owner
    g.x = x; g.y = y; B.x = x + 20;
    assert.equal(room.summonTarget(g, a.sessionId, A), b.sessionId);
    B.level = 5;
    assert.equal(room.summonTarget(g, a.sessionId, A), b.sessionId, "low-level hero is a target too");
    B.level = 20;

    // Killing a golem gives no XP
    const xp0 = B.xp;
    room.hitTarget(b.sessionId, s2, 99999, [0, 0], {});
    assert.ok(g.dead && !room.summons.has(s2));
    assert.equal(B.xp, xp0, "no XP for a golem");

    // Fighting a monster: B steps away, a skeleton comes next to the golem; the owner gets the kill
    B.x = x + 2000;
    const before = A.xp;
    room.spawnMob("skeleton", 0, "testskel", { x: x + 16, y, level: 1 });
    const sk = room.state.mobs.get("testskel");
    sk.hp = 30; sk.maxHp = 30;
    A.invulnUntil = Date.now() + 60_000;
    for (let i = 0; i < 60 && !sk.dead; i++) await wait(100);
    assert.ok(sk.dead, "the golem killed the skeleton");
    assert.ok(A.xp > before, "the owner got the XP");

    // The owner leaves: their summons go
    await a.leave();
    await wait(300);
    assert.equal([...room.summons.values()].filter((m: any) => !m.dead).length, 0);
    await b.leave();
  } finally {
    await srv.stop();
  }
});
