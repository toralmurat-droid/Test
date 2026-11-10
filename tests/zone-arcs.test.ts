import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAINS, chainState, inZone, QUEST_ITEMS, ZONE_ARCS, packQuest } from "../shared/quests";
import { NPCS } from "../shared/npcs";
import { SPAWN_ZONES } from "../shared/spawns";
import { AREAS, isSolidAt } from "../shared/map";
import { actOfTile, DESERT_Y0, TILE } from "../shared/constants";
import { startRoom, wait } from "./helpers/room";

const named = new Set([...SPAWN_ZONES.map((z) => z.name), ...AREAS.map((a) => a.name)]);
const kindsIn = (desert: boolean) => new Set(SPAWN_ZONES.filter((z) => (actOfTile(z.x, z.y) === 2) === desert).flatMap((z) => Object.keys(z.mobs)));

test("zone arcs: givers out in their zone, steps in real zones, objects and bosses on open ground in them", () => {
  for (const arc of ZONE_ARCS) {
    const giver = NPCS.find((n) => n.id === arc.quests[0].giver)!;
    assert.ok(giver, `${arc.id}: giver ${arc.quests[0].giver}`);
    assert.ok(!isSolidAt(giver.x, giver.y), `${arc.id}: ${giver.name} stands on open ground`);
    const desert = giver.y >= DESERT_Y0 * TILE;
    for (const [i, d] of arc.quests.entries()) {
      assert.equal(d.giver, giver.id, `${d.id}: one giver per arc`);
      assert.equal(!!d.auto, i > 0, `${d.id}: later quests of an arc carry on by themselves`);
      assert.ok(d.minLevel >= (desert ? 30 : 1) && d.minLevel <= (desert ? 50 : 30), `${d.id}: level fits its act`);
      assert.notEqual(d.steps[d.steps.length - 1].type, "talk", `${d.id}: ends out in the field`);
      assert.ok(d.outro?.length, `${d.id}: says what happened where it ended`);
      for (const s of d.steps) {
        if (s.zone) assert.ok(named.has(s.zone), `${d.id}: zone ${s.zone} exists`);
        if (s.type === "collect") assert.ok(QUEST_ITEMS[s.item!], `${d.id}: item ${s.item}`);
        if ((s.type === "kill" || s.type === "collect") && !s.summon) assert.ok(s.kinds!.some((k) => kindsIn(desert).has(k)), `${d.id}: its monsters live in this act`);
        for (const o of s.objects ?? []) {
          assert.ok(inZone(s.zone!, o.x, o.y), `${d.id}: ${o.id} stands in ${s.zone}`);
          assert.ok(!isSolidAt(o.x, o.y - 4), `${d.id}: ${o.id} on open ground`);
        }
        if (s.summon) {
          assert.ok(inZone(s.zone!, s.summon.x, s.summon.y), `${d.id}: ${s.summon.title} rises in ${s.zone}`);
          assert.ok(!isSolidAt(s.summon.x, s.summon.y), `${d.id}: ${s.summon.title} on open ground`);
          assert.ok(s.own, `${d.id}: only the hero's own boss counts`);
        }
        if (s.at) assert.ok(!isSolidAt(s.at.x, s.at.y), `${d.id}: ${s.at.label} reachable`);
      }
    }
  }
});

test("zone arcs: accepted from the giver, the next quest starts by itself where the last ended, all kept in a save", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const ci = CHAINS.findIndex((x) => x.id === "mill");
    p.tut = packQuest(CHAINS.find((x) => x.id === "tutorial")!.quests.length, 0, 0);
    p.level = 3;
    const odo = NPCS.find((n) => n.id === "miller")!;
    p.x = odo.x + 10; p.y = odo.y + 10;
    await wait(150);
    c.send("quest", { chain: ci });
    await wait(300);
    assert.equal(chainState(p, ci)!.questStage, 1, "accepted from Odo");
    assert.equal(p.arcs.get("mill"), packQuest(0, 1, 0), "kept in the arcs map");
    // clear the clots (step 1) and kill the blobs (step 2) by hand
    room.questProgress(c.sessionId, p, ci, 0b111);
    room.questProgress(c.sessionId, p, ci, 6);
    assert.equal(chainState(p, ci)!.questId, 1, "first quest done out in the field");
    assert.equal(chainState(p, ci)!.questStage, 0);
    await wait(3000);
    assert.equal(chainState(p, ci)!.questStage, 1, "the spring quest started by itself");
    const snap = room.snapshot(p) as unknown as Record<string, number>;
    assert.deepEqual([snap.millId, snap.millStage], [1, 1], "saved under the arc's names");
    await c.leave();
  } finally {
    await srv.stop();
  }
});
