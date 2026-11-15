import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAINS, chainState, inZone, packQuest, questStep, SIDE_ARCS, ZONE_ARCS } from "../shared/quests";
import { NPCS } from "../shared/npcs";
import { SPAWN_ZONES } from "../shared/spawns";
import { AREAS, isSolidAt } from "../shared/map";
import { SINKHOLES_KINDS } from "../shared/constants";
import { startRoom, wait } from "./helpers/room";

const ci = CHAINS.findIndex((c) => c.id === "sinkholes");
const arc = SIDE_ARCS.find((a) => a.id === "sinkholes")!;
const named = new Set([...SPAWN_ZONES.map((z) => z.name), ...AREAS.map((a) => a.name)]);

test("sinkholes chain: a side arc (no chain index moves), eight quests from Lodge-Warden Tull climbing to the Maw-Father", () => {
  assert.ok(ci >= ZONE_ARCS.length && arc.quests.length >= 6 && arc.quests.length <= 8);
  assert.equal(SIDE_ARCS[SIDE_ARCS.length - 1], arc, "last of SIDE_ARCS");
  assert.ok(NPCS.some((n) => n.id === "ropewarden"));
  assert.ok(arc.quests.every((d) => d.giver === "ropewarden"), "one giver");
  arc.quests.forEach((d, i) => {
    assert.equal(!!d.auto, i > 0, `${d.id}: later quests carry on by themselves`);
    assert.ok(d.outro?.length, `${d.id}: outro`);
    assert.notEqual(d.steps.at(-1)!.type, "talk", `${d.id}: ends in the field`);
  });
  const levels = arc.quests.map((d) => d.minLevel);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b), "levels climb");
  assert.ok(levels[0] >= 30 && levels.at(-1)! <= 45);
  assert.equal(levels.length, 8);
  const mid = arc.quests.flatMap((d) => d.steps).filter((s) => s.summon && s.summon.parts[0] === "hidechief");
  assert.equal(mid.length, 1, "one named Hide-Chieftain mid-chain");
  assert.ok(mid[0].summon!.voice!.taunt.length && mid[0].summon!.voice!.half.length);
  const last = arc.quests.at(-1)!.steps.at(-1)!;
  assert.deepEqual(last.summon?.parts, ["mawfather"]);
  assert.equal(last.zone, "The Great Maw");
  assert.deepEqual(last.kinds, ["mawfather"]);
  assert.ok(last.own);
  assert.equal(last.summon!.level, 45);
  assert.ok(last.summon!.voice!.taunt.length && last.summon!.voice!.half.length);
  assert.notEqual(last.night, true, "he is awake day and night");
  for (const d of arc.quests) for (const s of d.steps) {
    if (s.zone) assert.ok(named.has(s.zone), `${d.id}: zone ${s.zone} exists`);
    if (s.type === "kill" && !s.summon) for (const k of s.kinds!) assert.ok(SINKHOLES_KINDS.includes(k), `${d.id}: ${k} is a sinkholes monster`);
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

test("sinkholes chain: accepted from Lodge-Warden Tull, every quest carries on by itself, done start to finish and saved", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    p.quests.set("tut", packQuest(CHAINS.find((x) => x.id === "tutorial")!.quests.length, 0, 0));
    p.level = 45;
    const warden = NPCS.find((n) => n.id === "ropewarden")!;
    p.x = warden.x + 10; p.y = warden.y + 10;
    await wait(150);
    c.send("quest", { chain: ci });
    await wait(300);
    assert.equal(chainState(p, ci)!.questStage, 1, "accepted from Lodge-Warden Tull");
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
