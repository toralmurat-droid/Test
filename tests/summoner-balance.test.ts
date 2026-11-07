// Summoner balance pass (2026-11-07): the bound golem, Stone Bond, and monsters that fight the golems.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafeZone, isSolidAt, VILLAGE } from "../shared/map";
import { TILE } from "../shared/constants";
import { SUMMON } from "../shared/summons";
import { startRoom, wait } from "./helpers/room";

function openSpot(): [number, number] {
  for (let tx = VILLAGE.x0 - 14; tx > 0; tx--) {
    const x = (tx + 0.5) * TILE, y = (VILLAGE.y0 + 10.5) * TILE;
    if (!isSolidAt(x, y) && !isSafeZone(x, y) && !isSolidAt(x + 20, y) && !isSolidAt(x - 20, y)) return [x, y];
  }
  throw new Error("no open spot");
}

test("bound golem, Stone Bond, monsters turn on the golem", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "summoner" });
    await wait(300);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
    const live = () => [...room.summons.values()].filter((m: any) => m.owner === id && !m.dead);

    // In the safe zone (where heroes start): no golem comes, however long
    assert.ok(isSafeZone(p.x, p.y));
    room.autoGolems(Date.now()); room.autoGolems(Date.now() + SUMMON.autoMs + 100);
    assert.equal(live().length, 0, "no bound golem in the safe zone");

    // Outside: one comes by itself after SUMMON.autoMs, at level 1 with no skill learned, in the attuned element
    room.state.mobs.forEach((_m: any, mid: string) => room.state.mobs.delete(mid));
    const [x, y] = openSpot();
    p.x = x; p.y = y; p.attune = 2;
    const t0 = Date.now();
    room.autoGolems(t0);
    assert.equal(live().length, 0, "not at once");
    room.autoGolems(t0 + SUMMON.autoMs + 10);
    assert.deepEqual(live().map((m: any) => m.kind), ["golem_poison"]);
    room.autoGolems(t0 + 3 * SUMMON.autoMs);
    assert.equal(live().length, 1, "only while none is out");

    // Stone Bond: the golem takes SUMMON.guardShare of a blow on its owner
    const g = live()[0];
    g.x = x + 10; g.y = y; p.invulnUntil = 0;
    const hp0 = p.hp, ghp0 = g.hp;
    room.damagePlayer(id, 100, "test", [0, 0], 0);
    const toGolem = ghp0 - g.hp, toHero = hp0 - p.hp;
    assert.ok(toGolem > 0 && toHero > 0, `split ${toHero}/${toGolem}`);
    assert.ok(Math.abs(toGolem / (toGolem + toHero) - SUMMON.guardShare) < 0.03, `golem took ${toGolem} of ${toGolem + toHero}`);

    // Guardian: a monster the Summoner hits turns on the golem standing by, not on the Summoner
    room.spawnMob("skeleton", 0, "guardtest", { x: x + 30, y, level: 1 });
    const sk = room.state.mobs.get("guardtest");
    sk.hp = sk.maxHp = 9999;
    room.hitTarget(id, "guardtest", 5, [1, 0], {});
    const gid = [...room.summons].find(([, m]: any) => m === g)![0];
    assert.equal(sk.foe, gid, "the skeleton fights the golem");
    assert.equal(sk.target, "");
    room.pickTarget(sk, { aggroRange: 110, leash: 200 });
    assert.equal(sk.target, "", "still on the golem after re-picking its target");
    await c.leave();
  } finally {
    await srv.stop();
  }
});
