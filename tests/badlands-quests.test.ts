import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAINS, chainState, inZone, packQuest, questStep, SIDE_ARCS, ZONE_ARCS } from "../shared/quests";
import { NPCS } from "../shared/npcs";
import { SPAWN_ZONES } from "../shared/spawns";
import { AREAS, isSolidAt } from "../shared/map";
import { BADLANDS_KINDS } from "../shared/constants";
import { startRoom, wait } from "./helpers/room";

const ci = CHAINS.findIndex((c) => c.id === "badlands");
const arc = SIDE_ARCS.find((a) => a.id === "badlands")!;
const named = new Set([...SPAWN_ZONES.map((z) => z.name), ...AREAS.map((a) => a.name)]);

test("badlands chain: a side arc (no chain index moves), eight quests from Marshal Varro climbing to Old Rourke", () => {
  assert.ok(ci >= ZONE_ARCS.length && arc.quests.length >= 6 && arc.quests.length <= 8);
  assert.equal(SIDE_ARCS[SIDE_ARCS.length - 1], arc, "last of SIDE_ARCS");
  assert.ok(NPCS.some((n) => n.id === "rustmarshal"));
  assert.ok(arc.quests.every((d) => d.giver === "rustmarshal"), "one giver");
  arc.quests.forEach((d, i) => {
    assert.equal(!!d.auto, i > 0, `${d.id}: later quests carry on by themselves`);
    assert.ok(d.outro?.length, `${d.id}: outro`);
    assert.notEqual(d.steps.at(-1)!.type, "talk", `${d.id}: ends in the field`);
  });
  const levels = arc.quests.map((d) => d.minLevel);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b), "levels climb");
  assert.ok(levels[0] >= 25 && levels.at(-1)! <= 40);
  const last = arc.quests.at(-1)!.steps.at(-1)!;
  assert.deepEqual(last.summon?.parts, ["rourke"]);
  assert.equal(last.zone, "Fangrock Keep");
  assert.deepEqual(last.kinds, ["rourke"]);
  assert.ok(last.own);
  assert.notEqual(last.night, true, "a bandit needs no night");
  for (const d of arc.quests) for (const s of d.steps) {
    if (s.zone) assert.ok(named.has(s.zone), `${d.id}: zone ${s.zone} exists`);
    if (s.type === "kill" && !s.summon) for (const k of s.kinds!) assert.ok(BADLANDS_KINDS.includes(k), `${d.id}: ${k} is a badlands monster`);
    for (const o of s.objects ?? []) {
      assert.ok(inZone(s.zone!, o.x, o.y), `${d.id}: ${o.id} stands in ${s.zone}`);
      assert.ok(!isSolidAt(o.x, o.y - 4), `${d.id}: ${o.id} on open ground`);
    }
    if (s.summon) {
      assert.ok(inZone(s.zone!, s.summon.x, s.summon.y), `${d.id}: ${s.summon.title} rises in ${s.zone}`);
      assert.ok(!isSolidAt(s.summon.x, s.summon.y), `${d.id}: boss on open ground`);
      assert.ok(s.own && s.summon.voice?.wake.length && s.summon.voice.death.length, `${d.id}: own, and the boss talks`);
    }
    if (s.at) assert.ok(!isSolidAt(s.at.x, s.at.y), `${d.id}: ${s.at.label} reachable`);
  }
});

test("badlands chain: accepted from Marshal Varro, every quest carries on by itself, done start to finish and saved", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    p.quests.set("tut", packQuest(CHAINS.find((x) => x.id === "tutorial")!.quests.length, 0, 0));
    p.level = 40;
    const hesk = NPCS.find((n) => n.id === "rustmarshal")!;
    p.x = hesk.x + 10; p.y = hesk.y + 10;
    await wait(150);
    c.send("quest", { chain: ci });
    await wait(300);
    assert.equal(chainState(p, ci)!.questStage, 1, "accepted from Marshal Varro");
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
    await c.leave();
  } finally {
    await srv.stop();
  }
});
