import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAINS, SUN_CHAIN, chainOpen, chainState, packQuest, QUEST_ITEMS } from "../shared/quests";
import { NPCS } from "../shared/npcs";
import { SPAWN_ZONES } from "../shared/spawns";
import { areaAt } from "../shared/map";
import { DESERT_Y0, TILE } from "../shared/constants";
import { startRoom, wait } from "./helpers/room";

const sun = CHAINS[SUN_CHAIN];

test("the Second Sun: givers and talkers live in Kel Ashar, kill steps use desert monsters, objects stand in their zones", () => {
  assert.equal(sun.id, "sun");
  const desertKinds = new Set(SPAWN_ZONES.filter((z) => z.y >= DESERT_Y0).flatMap((z) => Object.keys(z.mobs)));
  for (const d of sun.quests) {
    const giver = NPCS.find((n) => n.id === d.giver);
    assert.ok(giver && giver.y >= DESERT_Y0 * TILE, `${d.title}: giver ${d.giver} is in the desert`);
    assert.ok(d.minLevel >= 30 && d.minLevel <= 50, `${d.title}: Act 2 level`);
    for (const s of d.steps) {
      if (s.type === "talk") assert.ok(NPCS.some((n) => n.id === s.npc), `${d.title}: talks to ${s.npc}`);
      if (s.type === "kill") for (const k of s.kinds ?? []) assert.ok(desertKinds.has(k as string), `${d.title}: ${k} lives in the desert`);
      if (s.type === "collect") assert.ok(QUEST_ITEMS[s.item as keyof typeof QUEST_ITEMS], `${d.title}: item ${s.item}`);
      if (s.type === "use") for (const o of s.objects!) assert.equal(areaAt(o.x, o.y), s.zone, `${d.title}: ${o.id} stands in ${s.zone}`);
    }
  }
});

test("the Second Sun opens only after the Hollow Crown and the Hide Rite", () => {
  const crown = CHAINS.findIndex((c) => c.id === "crown"), beast = CHAINS.findIndex((c) => c.id === "beast");
  const done = (c: number) => packQuest(CHAINS[c].quests.length, 0, 0);
  assert.equal(chainOpen({ level: 30 }, SUN_CHAIN), false);
  assert.equal(chainOpen({ level: 30, crown: done(crown) }, SUN_CHAIN), false);
  assert.equal(chainOpen({ level: 30, crown: done(crown), beast: done(beast) }, SUN_CHAIN), true);
});

test("Redfang and the Second Sun are packed, accepted from Rakhim and kept across a save", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const crown = CHAINS.findIndex((x) => x.id === "crown"), beast = CHAINS.findIndex((x) => x.id === "beast");
    p.crown = packQuest(CHAINS[crown].quests.length, 0, 0);
    p.beast = packQuest(CHAINS[beast].quests.length, 0, 0);
    p.red = packQuest(2, 1, 3);
    p.tut = packQuest(CHAINS.find((x) => x.id === "tutorial")!.quests.length, 0, 0);
    p.level = 30;
    const rakhim = NPCS.find((n) => n.id === sun.quests[0].giver)!;
    p.x = rakhim.x + 10; p.y = rakhim.y + 10;
    await wait(150);
    c.send("quest", { chain: SUN_CHAIN });
    await wait(300);
    assert.equal(chainState(p, SUN_CHAIN)!.questStage, 1, "the first quest is accepted");
    const snap = room.snapshot(p);
    assert.deepEqual([snap.redId, snap.redStage, snap.redCount], [2, 1, 3], "Redfang saves under its old names");
    assert.deepEqual([snap.sunId, snap.sunStage], [0, 1]);
    await c.leave();
  } finally {
    await srv.stop();
  }
});
