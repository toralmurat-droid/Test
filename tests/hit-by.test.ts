// The "hit" broadcast names the player behind the blow (`by`), so the client shows a monster's HP bar to whoever
// (or whose group) hurt it. A creature's blow counts as its owner's; monsters and the world name nobody.
import { test } from "node:test";
import assert from "node:assert/strict";
import { byPart, hitBy } from "../server/hitBy";
import { isSafeZone, isSolidAt, VILLAGE } from "../shared/map";
import { MOBS, TILE } from "../shared/constants";
import { startRoom, wait } from "./helpers/room";

test("hitBy: heroes are themselves, creatures their owner, everyone else nobody", () => {
  const players = new Set(["hero", "other"]);
  const mobs = new Map([["golem1", { owner: "hero" }], ["slime1", { owner: "" }], ["orphan", { owner: "gone" }]]);
  assert.equal(hitBy(players, mobs, "hero"), "hero");
  assert.equal(hitBy(players, mobs, "golem1"), "hero", "a summon counts as its owner");
  assert.equal(hitBy(players, mobs, "slime1"), undefined, "a wild monster names nobody");
  assert.equal(hitBy(players, mobs, "orphan"), undefined, "an owner who left names nobody");
  assert.equal(hitBy(players, mobs, "watch"), undefined, "the village watch, the world");
  assert.equal(hitBy(players, mobs, ""), undefined);
  assert.equal(hitBy(players, mobs, undefined), undefined);
  assert.deepEqual(byPart("hero"), { by: "hero" });
  assert.equal("by" in byPart(undefined), false, "no by key at all when nobody is behind it");
});

function openSpot(): [number, number] {
  for (let tx = VILLAGE.x0 - 14; tx > 0; tx--) {
    const x = (tx + 0.5) * TILE, y = (VILLAGE.y0 + 10.5) * TILE;
    if (!isSolidAt(x, y) && !isSafeZone(x, y) && !isSolidAt(x + 20, y) && !isSolidAt(x - 20, y)) return [x, y];
  }
  throw new Error("no open spot");
}

test("hit broadcasts in the room: hero and golem blows carry by, a monster's blow does not", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join();
    await wait(200);
    const room = srv.room, A = room.state.players.get(a.sessionId);
    const [x, y] = openSpot();
    let mobId = "", mob: any;
    room.state.mobs.forEach((m: any, id: string) => { if (!mobId && !m.owner && m.kind === "slime") { mobId = id; mob = m; } });
    room.state.mobs.forEach((_m: any, id: string) => { if (id !== mobId) room.state.mobs.delete(id); });
    assert.ok(mob, "a slime to hit");
    mob.x = x + 30; mob.y = y; mob.level = 20; mob.hp = mob.maxHp = 1e6; mob.dead = false;
    A.x = x; A.y = y; A.level = 20; A.invulnUntil = 0;
    const hits: any[] = [];
    const bc = room.broadcast.bind(room);
    room.broadcast = (t: string, msg: any, ...r: any[]) => { if (t === "hit") hits.push(msg); return bc(t, msg, ...r); };
    const last = (id: string) => hits.filter((h) => h.id === id).at(-1);

    // The hero's own blow, and its damage over time
    room.hitTarget(a.sessionId, mobId, 10, [1, 0], { kb: 0, basic: true });
    assert.equal(last(mobId)?.by, a.sessionId);
    room.hitTarget(a.sessionId, mobId, 10, [0, 0], { kb: 0, dot: true });
    assert.equal(last(mobId)?.dot, true);
    assert.equal(last(mobId)?.by, a.sessionId, "a hero's damage over time is theirs too");

    // The hero's golem: its owner
    const gid = room.summon(a.sessionId, "golem_fire");
    const g = room.state.mobs.get(gid);
    g.x = x + 20; g.y = y;
    const n = hits.length;
    room.summonStrike(g, gid, mobId, mob, MOBS.golem_fire);
    assert.ok(hits.length > n, "the golem's blow was broadcast");
    assert.equal(last(mobId)?.by, a.sessionId, "a golem's blow counts as its owner's");

    // A creature in a monster brawl (mobHitsMob) counts as its owner; a wild monster's blow names nobody
    room.mobHitsMob(g, gid, mob, mobId, 5);
    assert.equal(last(mobId)?.by, a.sessionId);
    room.mobHitsMob(mob, mobId, g, gid, 1);
    assert.ok(last(gid), "the monster's blow on the golem was broadcast");
    assert.equal("by" in last(gid), false, "a monster hitting a creature names nobody");

    // A monster hits the hero: no by
    const hp = A.hp;
    room.damagePlayer(a.sessionId, 5, "Slime", [0, 0], 0, { from: mobId });
    assert.ok(A.hp < hp, "the blow landed");
    assert.ok(last(a.sessionId), "the monster's blow on the hero was broadcast");
    assert.equal("by" in last(a.sessionId), false, "a monster hitting a hero names nobody");
  } finally {
    await srv.stop();
  }
});
