// The Riven Throne (chain id "throne", not "crown": that is the Hollow Crown's): Herald-Marshal Ysmay Corrant's
// chain from Tollcross, Lv 40-48, through Prince Ottrin to Aldemar, the Riven King, in the Throne Hall.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAINS, chainState, inZone, packQuest, questStep, SIDE_ARCS, ZONE_ARCS } from "../shared/quests";
import { NPCS } from "../shared/npcs";
import { SPAWN_ZONES } from "../shared/spawns";
import { AREAS, isSolidAt } from "../shared/map";
import { CROWN_KINDS, RIVEN_KING } from "../shared/constants";
import { startRoom, wait } from "./helpers/room";

const ci = CHAINS.findIndex((c) => c.id === "throne");
const arc = SIDE_ARCS.find((a) => a.id === "throne")!;
const named = new Set([...SPAWN_ZONES.map((z) => z.name), ...AREAS.map((a) => a.name)]);

test("throne chain: a side arc appended last (no chain index moves), seven quests from the Herald-Marshal climbing to the Riven King", () => {
  assert.ok(arc && ci >= ZONE_ARCS.length, "a side arc after the zone arcs");
  assert.equal(SIDE_ARCS.indexOf(arc), SIDE_ARCS.findIndex((a) => a.id === "saltways") + 1, "appended after Saltmere Ways (the highway villages' arcs follow it: tests/villages.test.ts)");
  assert.equal(CHAINS.filter((c) => c.id === "throne").length, 1);
  assert.ok(CHAINS.some((c) => c.id === "crown") && CHAINS.find((c) => c.id === "crown") !== CHAINS[ci], "the Hollow Crown keeps its own id");
  assert.equal(arc.name, "The Riven Throne");
  assert.ok(NPCS.some((n) => n.id === "crownherald"));
  assert.ok(arc.quests.every((d) => d.giver === "crownherald"), "one giver");
  arc.quests.forEach((d, i) => {
    assert.equal(!!d.auto, i > 0, `${d.id}: later quests carry on by themselves`);
    assert.ok(d.outro?.length, `${d.id}: outro`);
    assert.notEqual(d.steps.at(-1)!.type, "talk", `${d.id}: ends in the field`);
  });
  const levels = arc.quests.map((d) => d.minLevel);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b), "levels climb");
  assert.ok(levels[0] >= 40 && levels.at(-1)! <= 50);
  assert.equal(levels.length, 7);
  // Prince Ottrin mid-chain, the Riven King at the end: both talk
  const mid = arc.quests.flatMap((d) => d.steps).filter((s) => s.summon?.parts[0] === "pretender");
  assert.equal(mid.length, 1, "one named Pretender mid-chain");
  assert.ok(mid[0].summon!.voice!.taunt.length && mid[0].summon!.voice!.half.length);
  const last = arc.quests.at(-1)!.steps.at(-1)!;
  assert.deepEqual(last.summon?.parts, ["rivenking"]);
  assert.equal(last.zone, "The Throne Hall");
  assert.deepEqual(last.kinds, ["rivenking"]);
  assert.ok(last.own);
  assert.equal(last.summon!.level, 50);
  assert.ok(last.summon!.voice!.taunt.length && last.summon!.voice!.half.length);
  assert.notEqual(last.night, true, "he holds court day and night");
  assert.ok(RIVEN_KING.lines.kill.length, "and has a word for a hero he fells");
  for (const d of arc.quests) for (const s of d.steps) {
    if (s.zone) assert.ok(named.has(s.zone), `${d.id}: zone ${s.zone} exists`);
    if (s.type === "kill" && !s.summon) for (const k of s.kinds!) assert.ok(CROWN_KINDS.includes(k), `${d.id}: ${k} is a Crown monster`);
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

test("throne chain: accepted from the Herald-Marshal, every quest carries on by itself, done start to finish", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    p.quests.set("tut", packQuest(CHAINS.find((x) => x.id === "tutorial")!.quests.length, 0, 0));
    p.level = 48;
    const herald = NPCS.find((n) => n.id === "crownherald")!;
    p.x = herald.x + 10; p.y = herald.y + 10;
    await wait(150);
    c.send("quest", { chain: ci });
    await wait(300);
    assert.equal(chainState(p, ci)!.questStage, 1, "accepted from the Herald-Marshal");
    assert.ok(p.quests.has("throne"), "kept under its own key in the quests map (no new Player field)");
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
