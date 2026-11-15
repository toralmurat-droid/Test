import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAINS, chainState, packQuest, questStep, ZONE_ARCS } from "../shared/quests";
import { NPCS } from "../shared/npcs";
import { areaAt } from "../shared/map";
import { MOORS_KINDS } from "../shared/constants";
import { startRoom, wait } from "./helpers/room";

const ci = CHAINS.findIndex((c) => c.id === "moors");
const arc = ZONE_ARCS.find((a) => a.id === "moors")!;

test("moors chain: eight quests from Edra Vane up through the zones, ending on the Barrow-King at night", () => {
  assert.ok(ci >= 0 && arc.quests.length >= 6 && arc.quests.length <= 8);
  assert.ok(arc.quests.every((d) => d.giver === "cairncaptain"), "one giver");
  const levels = arc.quests.map((d) => d.minLevel);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b), "levels climb");
  const last = arc.quests[arc.quests.length - 1].steps.at(-1)!;
  assert.deepEqual(last.summon?.parts, ["barrowking"]);
  assert.equal(last.night, true, "he wakes at night");
  assert.equal(areaAt(last.summon!.x, last.summon!.y), "The Barrow-King's Mound");
  for (const d of arc.quests) for (const s of d.steps) {
    if (s.type === "kill" && !s.summon) for (const k of s.kinds!) assert.ok(MOORS_KINDS.includes(k), `${d.id}: ${k} is a moors monster`);
    if (s.summon) assert.ok(s.summon.voice?.wake.length && s.summon.voice.death.length, `${d.id}: the boss talks`);
  }
});

test("moors chain: accepted from Edra Vane, every quest carries on by itself, done start to finish and saved", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    p.quests.set("tut", packQuest(CHAINS.find((x) => x.id === "tutorial")!.quests.length, 0, 0));
    p.level = 36;
    const edra = NPCS.find((n) => n.id === "cairncaptain")!;
    p.x = edra.x + 10; p.y = edra.y + 10;
    await wait(150);
    c.send("quest", { chain: ci });
    await wait(300);
    assert.equal(chainState(p, ci)!.questStage, 1, "accepted from Edra Vane");
    const gold0 = p.gold;
    for (const [i, d] of arc.quests.entries()) {
      if (i > 0) { room.autoStart(c.sessionId, ci, i); assert.equal(chainState(p, ci)!.questStage, 1, `${d.id} started by itself`); }
      for (let st = 0; st < d.steps.length; st++) {
        const s = questStep(chainState(p, ci)!)!;
        assert.equal(s, d.steps[st], `${d.id}: step ${st + 1}`);
        room.questProgress(c.sessionId, p, ci, s.type === "use" ? (1 << s.objects!.length) - 1 : s.goal ?? 1);
      }
      assert.equal(chainState(p, ci)!.questId, i + 1, `${d.id} done out in the field`);
    }
    assert.equal(chainState(p, ci)!.questId, arc.quests.length, "chain done");
    assert.ok(p.gold > gold0, "rewards paid");
    const snap = room.snapshot(p) as unknown as Record<string, number>;
    assert.equal(snap.moorsId, arc.quests.length, "saved under the arc's names");
    await c.leave();
  } finally {
    await srv.stop();
  }
});
