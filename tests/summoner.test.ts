import { test } from "node:test";
import assert from "node:assert/strict";
import { activeSkills, CANTRIPS, SKILLS } from "../shared/skills";
import { ART_IDS } from "../client/src/skillArt";
import { SUMMON } from "../shared/summons";
import { startRoom, wait } from "./helpers/room";
import { isSafeZone, isSolidAt, VILLAGE } from "../shared/map";
import { TILE } from "../shared/constants";

test("every Summoner skill has a painted icon", () => {
  const ids = [...SKILLS.summoner, ...CANTRIPS.summoner].map((s) => s.id);
  assert.deepEqual(ids.filter((id) => !ART_IDS.includes(id)), []);
});

test("Summoner: Elemental Golem pulls the golems back whole, ranks make them tougher, Vital Link mends, the Colossus lasts 30 s", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "summoner" });
    await wait(200);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
    const client = room.clients.find((x: any) => x.sessionId === id);
    room.maxHero(client); // every skill at max rank
    p.mana = p.maxMana = 9999;
    // out of the safe zone (no golem in town, and casting there makes an outlaw)
    for (let tx = VILLAGE.x0 - 14; tx > 0; tx--) {
      const x = (tx + 0.5) * TILE, y = (VILLAGE.y0 + 10.5) * TILE;
      if (!isSolidAt(x, y) && !isSafeZone(x, y) && !isSolidAt(x + 20, y) && !isSolidAt(x - 20, y)) { p.x = x; p.y = y; break; }
    }
    const live = () => [...room.summons.values()].filter((m: any) => m.owner === id && !m.dead);
    const ready = () => { p.sk.last = {}; p.attackReadyAt = 0; p.sk.chargeUntil = 0; p.sk.windUntil = 0; p.stunUntil = 0; };

    assert.ok(!activeSkills("summoner").some((s) => s.id === "su_attune"), "Attune is gone: the grimoire picks the elements");
    room.setGrimoire(p, "fire,cold");
    ready(); room.cast(id, "su_golem"); await wait(50);
    assert.deepEqual(live().map((m: any) => m.kind).sort(), ["golem_cold", "golem_fire"], "both grimoire golems at once (Twin Bond at max level)");
    // rank 5 + Golem Mastery + Magic: tougher than a plain golem of the same level
    const g = live()[0];
    assert.ok(g.maxHp > 150, `golem life ${g.maxHp}`);
    // a hurt golem is pulled back whole
    g.hp = 1;
    ready(); room.cast(id, "su_golem"); await wait(50);
    assert.ok(live().every((m: any) => m.hp === m.maxHp));

    // Vital Link: a hurt golem next to its owner mends
    const h = live()[0];
    h.x = p.x + 10; h.y = p.y; h.hp = Math.round(h.maxHp / 2);
    const hurt = h.hp;
    await wait(600);
    assert.ok(h.hp > hurt, "the golem mends near its owner");

    // Colossus: both golems fuse into one for 30 s
    ready(); room.cast(id, "su_colossus");
    await wait(900); // its 600 ms charge
    const after = live();
    assert.equal(after.length, 1);
    assert.equal(after[0].kind, "golem_colossus");
    const left = after[0].banishAt - Date.now();
    assert.ok(left > 25_000 && left <= 30_000, `Colossus lasts ~30 s (${left} ms left)`);
    assert.ok(after[0].sPower > 1 + SUMMON.colossusPerGolem, "two fused golems make it stronger");
    await c.leave();
  } finally {
    await srv.stop();
  }
});
