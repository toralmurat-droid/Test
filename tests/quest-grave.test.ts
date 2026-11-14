// Quest concept #3, The Empty Grave: the pick step, the ambush a wrong grave raises, mourners in any order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAINS, chainState, objectDone, packQuest, usableObjects, questStep } from "../shared/quests";
import { choiceOf, PICK } from "../shared/questSteps";
import { npcById } from "../shared/npcs";
import { startRoom, wait } from "./helpers/room";

const G = CHAINS.findIndex((c) => c.id === "grave");
const quest = CHAINS[G].quests[0];
const pickStep = quest.steps[2].pick!;
const RIGHT = pickStep.objects[pickStep.answer], WRONG = pickStep.objects.find((_, i) => i !== pickStep.answer)!;

test("the Empty Grave: pick step, ambush that outlives the step, mourners in any order, the right grave", async () => {
  assert.equal(quest.steps[2].type, "pick");
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    p.tut = packQuest(CHAINS.find((x) => x.id === "tutorial")!.quests.length, 0, 0);
    p.level = quest.minLevel;
    p.hp = p.maxHp = 1_000_000;
    const put = (o: { x: number; y: number }) => { p.x = o.x; p.y = o.y; };
    const state = () => chainState(p, G)!;
    const myAmbush = () => [...room.state.mobs.values()].filter((m: any) => m.summonFor === c.sessionId && m.summonChain === -1 && !m.dead);

    // accept at the sexton; too far away does nothing
    c.send("quest", { chain: G });
    await wait(150);
    assert.equal(state().questStage, 0, "not from across the map");
    put(npcById("sexton")!);
    await wait(100);
    c.send("quest", { chain: G });
    await wait(150);
    assert.equal(state().questStage, 1);

    // stage 1: the stones. A grave is not usable yet.
    c.send("use", { id: WRONG.id });
    await wait(100);
    assert.equal(state().questStage, 1);
    assert.equal(myAmbush().length, 0, "no ambush before the pick step");
    assert.ok(!usableObjects(p).some((u) => u.o.id === WRONG.id));

    // jump to the pick step
    room.qset(p, G, { questStage: 3, questCount: 0 });
    const graves = usableObjects(p).filter((u) => u.chain === G);
    assert.deepEqual(graves.map((u) => u.o.id), pickStep.objects.map((o) => o.id));
    assert.equal(graves.length, 4);

    // too far from the grave: nothing happens, no ambush
    put({ x: WRONG.x + 600, y: WRONG.y });
    c.send("use", { id: WRONG.id });
    await wait(100);
    assert.equal(state().questStage, 3);
    assert.equal(myAmbush().length, 0);

    // a wrong grave: ambush, back to stage 1
    put(WRONG);
    const t0 = Date.now();
    c.send("use", { id: WRONG.id });
    await wait(150);
    const amb = myAmbush();
    assert.equal(amb.length, 1);
    assert.equal(amb[0].summonChain, -1);
    assert.ok(Math.abs(amb[0].banishAt - (t0 + PICK.ambushMs)) < 3000, `banishAt ${amb[0].banishAt - t0} ms ahead`);
    assert.equal(PICK.ambushMs, 120_000);
    assert.deepEqual([state().questStage, state().questCount], [1, 0], "back to the first step with nothing done");
    assert.equal(choiceOf(p, "grave"), 0, "a wrong pick records nothing");
    assert.equal(objectDone(RIGHT, p), false);

    // the ambush survives the hero moving through the chain
    const before = state().questId;
    room.nextStep(c.sessionId, p, G);
    assert.equal(myAmbush().length, 1, "a step change does not unsummon an ambush");
    room.qset(p, G, { questId: before, questStage: 2, questCount: 0 });

    // mourners, in the order 3, 1, 2; one at a time, each only near their own spot
    const order = ["mourner3", "mourner1", "mourner2"];
    put(npcById("mourner1")!);
    c.send("quest", { chain: G });
    await wait(100);
    assert.equal(state().questCount, 1, "heard the one standing there");
    room.qset(p, G, { questStage: 2, questCount: 0 });
    for (let i = 0; i < order.length; i++) {
      put(npcById(order[i])!);
      c.send("quest", { chain: G });
      await wait(120);
      if (i < 2) {
        assert.equal(state().questStage, 2, `still hearing after ${i + 1}`);
        assert.equal(state().questCount.toString(2).split("1").length - 1, i + 1);
      }
    }
    assert.equal(state().questStage, 3, "all three heard: the pick step");
    assert.equal(questStep(state())!.type, "pick");

    // re-sending to the same mourner does not count twice
    room.qset(p, G, { questStage: 2, questCount: 0 });
    put(npcById("mourner2")!);
    for (let i = 0; i < 3; i++) { c.send("quest", { chain: G }); await wait(60); }
    assert.equal(state().questStage, 2);
    assert.equal(state().questCount, 1 << 1);
    room.qset(p, G, { questStage: 3, questCount: 0 });

    // the right grave finishes the quest
    const gold = p.gold;
    put(RIGHT);
    c.send("use", { id: RIGHT.id });
    await wait(200);
    assert.equal(choiceOf(p, "grave"), 1);
    assert.equal(state().questId, 1, "quest done");
    assert.equal(p.gold, gold + quest.reward.gold, "arcReward(15) gold paid");
    assert.ok(quest.reward.xp > 0 && quest.reward.gold > 0);
    assert.equal(objectDone(RIGHT, p), true);
    assert.equal(usableObjects(p).some((u) => u.chain === G), false);
    assert.equal(myAmbush().length, 1, "the ambush is still up after the quest");

    // leaving takes the ambush with it
    await c.leave();
    await wait(900);
    assert.equal([...room.state.mobs.values()].filter((m: any) => m.summonFor === c.sessionId && m.summonChain === -1 && !m.dead).length, 0);
  } finally {
    await srv.stop();
  }
});

test("the Empty Grave: bad messages are ignored", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    p.tut = packQuest(CHAINS.find((x) => x.id === "tutorial")!.quests.length, 0, 0);
    p.level = 20;
    room.qset(p, G, { questId: 0, questStage: 3, questCount: 0 });
    p.x = WRONG.x; p.y = WRONG.y;
    for (const id of [123, null, {}, ["grave_tam"], "x".repeat(41), "grave_nope", ""]) c.send("use", { id });
    c.send("use");
    await wait(200);
    assert.equal(chainState(p, G)!.questStage, 3);
    assert.equal([...room.state.mobs.values()].filter((m: any) => m.summonFor === c.sessionId).length, 0);
    assert.ok(srv.room.clients.length === 1, "still connected");
  } finally {
    await srv.stop();
  }
});
