import { test } from "node:test";
import assert from "node:assert/strict";
import { activeSkills, CANTRIPS, SKILLS } from "../shared/skills";
import { ART_IDS } from "../client/src/skillArt";
import { SUMMON } from "../shared/summons";
import { startRoom, wait } from "./helpers/room";

test("every Summoner skill has a painted icon", () => {
  const ids = [...SKILLS.summoner, ...CANTRIPS.summoner].map((s) => s.id);
  assert.deepEqual(ids.filter((id) => !ART_IDS.includes(id)), []);
});

test("Summoner: golems in the attuned element, Attune cycles, the Colossus fuses them for 30 s, Vital Link mends", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "summoner" });
    await wait(200);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
    const client = room.clients.find((x: any) => x.sessionId === id);
    room.maxHero(client); // every skill at max rank
    p.mana = p.maxMana = 9999;
    const live = () => [...room.summons.values()].filter((m: any) => m.owner === id && !m.dead);
    const ready = () => { p.sk.last = {}; p.attackReadyAt = 0; p.sk.chargeUntil = 0; p.sk.windUntil = 0; p.stunUntil = 0; };

    assert.ok(activeSkills("summoner").some((s) => s.id === "su_attune"));
    assert.equal(p.attune, 0);
    ready(); room.cast(id, "su_golem"); await wait(50);
    assert.deepEqual(live().map((m: any) => m.kind), ["golem_fire"]);
    ready(); room.cast(id, "su_attune"); await wait(50);
    assert.equal(p.attune, 1);
    ready(); room.cast(id, "su_golem"); await wait(50);
    assert.deepEqual(live().map((m: any) => m.kind).sort(), ["golem_cold", "golem_fire"]);
    // rank 3 + Vital Link 3 + Magic: tougher than a plain golem of the same level
    const g = live()[0];
    assert.ok(g.maxHp > 150, `golem life ${g.maxHp}`);

    // Vital Link: a hurt golem next to its owner mends
    g.x = p.x + 10; g.y = p.y; g.hp = Math.round(g.maxHp / 2);
    const hurt = g.hp;
    await wait(600);
    assert.ok(g.hp > hurt, "the golem mends near its owner");

    // Colossus: both golems fuse into one, in the current element (frost), for 30 s
    ready(); room.cast(id, "su_colossus");
    await wait(900); // its 600 ms charge
    const after = live();
    assert.equal(after.length, 1);
    assert.equal(after[0].kind, "golem_colossus");
    assert.equal(after[0].weapon, "cold");
    const left = after[0].banishAt - Date.now();
    assert.ok(left > 25_000 && left <= 30_000, `Colossus lasts ~30 s (${left} ms left)`);
    assert.ok(after[0].sPower > 1 + SUMMON.colossusPerGolem, "two fused golems make it stronger");
    await c.leave();
  } finally {
    await srv.stop();
  }
});
