// Settlement network step 4 (shared/villages.ts) in the real room: walking into Turfhallow wakes its stone, a hero
// travels there from Cairnwatch's and lands in front of it, Old Maddock gives "Lost Spades", the spades and the wights
// finish it and pay the arc reward, and his `after` line follows. PR 2: the same for Saltglass in the Sunscar (from Kel
// Ashar's stone; Salt-mistress Nadira's sledges and scorpions). A save from before the villages loads as not begun.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { isSolidAt } from "../shared/map";
import { arrivalOf, PORTALS } from "../shared/portals";
import { CHAINS, chainState, packQuest, questDialog } from "../shared/quests";
import { npcById } from "../shared/npcs";
import { townAt } from "../shared/war/towns";
import { VILLAGES } from "../shared/villages";
import { startRoom, until, wait } from "./helpers/room";

const ci = CHAINS.findIndex((c) => c.id === "turfhallow");
const VILLAGE_IDS = VILLAGES.map((v) => v.id);
const [spades] = CHAINS[ci].quests;
const TUT = CHAINS.find((x) => x.id === "tutorial")!.quests.length;

test("room: Turfhallow's stone wakes and takes travellers; Old Maddock gives Lost Spades and the spades and wights finish it", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(200);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
    p.quests.set("tut", packQuest(TUT, 0, 0));
    p.level = spades.minLevel; p.invulnUntil = Date.now() + 600_000;

    // the stone: walking up to it wakes it; from Cairnwatch's stone a hero travels there and lands in front of it
    const stone = PORTALS.find((q) => q.id === "turfhallow")!, cairn = PORTALS.find((q) => q.id === "cairnwatch")!;
    p.x = stone.x; p.y = stone.y + TILE;
    assert.ok(await until(() => p.portals.has("turfhallow")), "Turfhallow's stone woke");
    assert.ok(townAt(p.x, p.y)?.id === "turfhallow", "standing in the village");
    p.portals.add("cairnwatch");
    p.x = cairn.x; p.y = cairn.y + TILE * 0.5;
    await wait(100);
    c.send("travel", { to: "turfhallow" });
    const at = arrivalOf(stone);
    assert.ok(await until(() => p.x === at.x && p.y === at.y), "travelled to the village's stone");
    assert.ok(!isSolidAt(p.x, p.y), "on free ground in front of it");

    // Old Maddock offers the quest; accepting starts it
    const maddock = npcById(spades.giver)!;
    assert.equal(maddock.name, "Old Maddock");
    const toHim = () => { p.x = maddock.x; p.y = maddock.y + 10; };
    toHim();
    await wait(100);
    const offer = questDialog(maddock.id, p);
    assert.ok(offer?.accept?.startsWith(spades.acceptText) && offer.text[0] === spades.offer[0], "his dialog offers Lost Spades");
    c.send("quest", { chain: ci });
    assert.ok(await until(() => chainState(p, ci)!.questStage === 1), "Lost Spades accepted");
    assert.equal(p.quests.get("turfhallow"), packQuest(0, 1, 0), "kept in the quests map under the village's id");

    // step 1: the three spades at Thane's Rest
    for (const o of spades.steps[0].objects!) {
      p.x = o.x + TILE * 0.5; p.y = o.y;
      await wait(60);
      c.send("use", { id: o.id });
      await wait(120);
    }
    assert.ok(await until(() => chainState(p, ci)!.questStage === 2), "three spades found: on to the wights");

    // step 2: six Barrow-Wights; the last one finishes the quest and pays the arc reward (no hand-in)
    const gold0 = p.gold, potions0 = p.potions;
    for (let i = 0; i < 6; i++) room.questKill(id, p, { kind: "wight", x: p.x, y: p.y }, ci);
    assert.ok(await until(() => chainState(p, ci)!.questId === 1), "Lost Spades done");
    assert.equal(p.gold, gold0 + spades.reward.gold, "the arc reward's gold");
    assert.ok(p.potions >= potions0, "and its potions");
    toHim();
    const after = questDialog(maddock.id, p);
    assert.ok(after && JSON.stringify(after).includes(spades.after.slice(0, 30)), "his after line follows");
    const snap = room.snapshot(p) as unknown as Record<string, number>;
    assert.deepEqual([snap.turfhallowId, snap.turfhallowStage, snap.turfhallowVer], [1, 0, 1], "saved under the arc's own names");
    assert.ok((snap as unknown as { portals: string[] }).portals.includes("turfhallow"), "the woken stone is saved");
    await c.leave();
  } finally {
    await srv.stop();
  }
});

const si = CHAINS.findIndex((c) => c.id === "saltglass");
const [sledges] = CHAINS[si].quests;

test("room: Saltglass's stone wakes and takes travellers from Kel Ashar; Salt-mistress Nadira's sledges and scorpions finish Sledges on the Flats", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "vampire" });
    await wait(200);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
    p.quests.set("tut", packQuest(TUT, 0, 0));
    p.level = sledges.minLevel; p.invulnUntil = Date.now() + 600_000;

    const stone = PORTALS.find((q) => q.id === "saltglass")!, kel = PORTALS.find((q) => q.id === "kelashar")!;
    p.x = stone.x; p.y = stone.y + TILE;
    assert.ok(await until(() => p.portals.has("saltglass")), "Saltglass's stone woke");
    assert.equal(townAt(p.x, p.y)?.id, "saltglass", "standing in the village");
    p.portals.add("kelashar");
    p.x = kel.x; p.y = kel.y + TILE * 0.5;
    await wait(100);
    c.send("travel", { to: "saltglass" });
    const at = arrivalOf(stone);
    assert.ok(await until(() => p.x === at.x && p.y === at.y), "travelled to the village's stone");
    assert.ok(!isSolidAt(p.x, p.y), "on free ground in front of it");

    const nadira = npcById(sledges.giver)!;
    assert.equal(nadira.name, "Salt-mistress Nadira");
    const toHer = () => { p.x = nadira.x; p.y = nadira.y + 10; };
    toHer();
    await wait(100);
    const offer = questDialog(nadira.id, p);
    assert.ok(offer?.accept?.startsWith(sledges.acceptText) && offer.text[0] === sledges.offer[0], "her dialog offers Sledges on the Flats");
    c.send("quest", { chain: si });
    assert.ok(await until(() => chainState(p, si)!.questStage === 1), "accepted");
    assert.equal(p.quests.get("saltglass"), packQuest(0, 1, 0), "kept under the village's id");

    for (const o of sledges.steps[0].objects!) {
      p.x = o.x + TILE * 0.5; p.y = o.y;
      await wait(60);
      c.send("use", { id: o.id });
      await wait(120);
    }
    assert.ok(await until(() => chainState(p, si)!.questStage === 2), "three sledges searched: on to the scorpions");

    const gold0 = p.gold;
    for (let i = 0; i < 8; i++) room.questKill(id, p, { kind: "scorpion", x: p.x, y: p.y }, si);
    assert.ok(await until(() => chainState(p, si)!.questId === 1), "Sledges on the Flats done");
    assert.equal(p.gold, gold0 + sledges.reward.gold, "the arc reward's gold");
    toHer();
    assert.ok(JSON.stringify(questDialog(nadira.id, p)).includes(sledges.after.slice(0, 30)), "her after line follows");
    const snap = room.snapshot(p) as unknown as Record<string, unknown>;
    assert.deepEqual([snap.saltglassId, snap.saltglassStage, snap.saltglassVer], [1, 0, 1], "saved under the arc's own names");
    assert.ok((snap.portals as string[]).includes("saltglass"), "the woken stone is saved");
    await c.leave();
  } finally {
    await srv.stop();
  }
});

test("room: a save from before the villages loads with their arcs not begun and their stones asleep", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const save = room.snapshot(p) as Record<string, unknown>;
    for (const v of VILLAGE_IDS) {
      const ch = CHAINS.find((q) => q.id === v)!;
      for (const k of [...ch.keys, ch.verKey]) delete save[k];
    }
    save.portals = ["oakvale", "cairnwatch"];
    room.restore(p, save);
    for (const v of VILLAGE_IDS) {
      const i = CHAINS.findIndex((q) => q.id === v);
      assert.equal(p.quests.has(v), false, `${v}: no key in the quests map`);
      assert.equal(chainState(p, i)!.questId, 0);
      assert.equal(p.portals.has(v), false, `${v}: its stone not woken`);
    }
    assert.deepEqual([...p.portals].sort(), ["cairnwatch", "oakvale"]);
    await c.leave();
  } finally {
    await srv.stop();
  }
});
