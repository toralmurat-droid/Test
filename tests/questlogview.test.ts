import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAINS, chainState, packQuest } from "../shared/quests";
import { withChoice } from "../shared/questSteps";
import { SPAWN_ZONES } from "../shared/spawns";
import { DESERT_Y0, SINKHOLES_Y0, TILE, WORLD_H } from "../shared/constants";
import { chainProgress, groupByChain, logEntries, mapAreaOf, mapFocus, objectiveRows } from "../client/src/questLogView";

const hero = (quests: Record<string, number>) => ({ level: 10, quests, cls: "wizard" });
const ci = (id: string) => CHAINS.findIndex((c) => c.id === id);

test("quest log: entries split into active and finished, grouped by chain with N of M", () => {
  const p = hero({ gloam: packQuest(3, 1, 2), bone: packQuest(1, 1, 0), tut: packQuest(3, 0, 0) });
  const { active, done } = logEntries(p);
  assert.deepEqual(active.map((e) => e.key), [`${ci("gloam")}:3`, `${ci("bones")}:1`]);
  assert.equal(done.filter((e) => e.chain === ci("gloam")).length, 3);
  const g = groupByChain(done, p).find((x) => x.chain === ci("gloam"))!;
  assert.equal(g.name, "The Gloam");
  assert.deepEqual([g.finished, g.total], [3, CHAINS[ci("gloam")].quests.length]);
  assert.deepEqual(g.entries.map((e) => e.index), [0, 1, 2]);
});

test("chainProgress is clamped to the chain length and 0 for a chain not begun", () => {
  assert.equal(chainProgress(hero({}), ci("sun")).finished, 0);
  const n = CHAINS[ci("bones")].quests.length;
  assert.equal(chainProgress(hero({ bone: packQuest(n, 0, 0) }), ci("bones")).finished, n);
});

test("objectiveRows: each step once, done / now with count / todo dimmed", () => {
  const p = hero({ gloam: packQuest(3, 1, 2) });
  const q = chainState(p, 0)!, d = CHAINS[0].quests[3];
  const rows = objectiveRows(d, q, p, false);
  assert.equal(rows[0].state, "now");
  assert.equal(rows[0].n, 2);
  assert.ok(rows.slice(1).every((r) => r.state === "todo" && r.n === 0));
  assert.ok(objectiveRows(d, q, p, true).every((r) => r.state === "done" && r.n === r.goal));
});

test("mapFocus: objective point of the current step, giver once finished", () => {
  const p = hero({ gloam: packQuest(3, 1, 0) });
  const q = chainState(p, 0)!, d = CHAINS[0].quests[3];
  const live = mapFocus(d, q, false)!, old = mapFocus(d, q, true)!;
  assert.equal(live.kind, "objective");
  assert.equal(old.kind, "giver");
});

test("objectiveRows: class text (Songweaver's book) and branch steps left out", () => {
  const ti = ci("tutorial"), d = CHAINS[ti].quests[0];
  const at = (cls: string) => objectiveRows(d, { questId: 0, questStage: 1, questCount: 0, chain: ti }, { level: 1, quests: {}, cls }, false).map((r) => r.text);
  assert.ok(at("wizard").includes("Wear the weapon the blob dropped"));
  assert.ok(at("songweaver").includes("Wear the book the blob dropped"));
  assert.ok(!at("songweaver").includes("Wear the weapon the blob dropped"));
  // the Two Letters chain: each choice sees only its own branch
  const qd = CHAINS[ci("letters")].quests.find((x) => x.steps.some((s) => s.onlyIf))!;
  const branch = qd.steps.filter((s) => s.onlyIf);
  const texts = (v: number) => objectiveRows(qd, undefined, { level: 20, quests: {}, flags: withChoice(0, "letters", v) }, true).map((r) => r.text);
  assert.ok(branch.length >= 2);
  for (const v of [1, 2]) {
    const mine = branch.filter((s) => s.onlyIf!.v.includes(v)), other = branch.filter((s) => !s.onlyIf!.v.includes(v));
    assert.ok(mine.every((s) => texts(v).includes(s.text)));
    assert.ok(other.every((s) => !texts(v).includes(s.text)));
  }
});

test("mapFocus falls back to the zone when the giver is unknown; mapAreaOf names the area", () => {
  const z = SPAWN_ZONES[0];
  const d = { ...CHAINS[0].quests[0], giver: "nobody", zone: z.name };
  const f = mapFocus(d, undefined, true)!;
  assert.equal(f.kind, "zone");
  assert.equal(f.x, (z.x + z.w / 2) * TILE);
  assert.equal(mapFocus({ ...d, zone: "Nowhere" }, undefined, true), undefined);
  assert.equal(mapAreaOf(100 * TILE, 100 * TILE).name, "Oakvale's lands");
  assert.equal(mapAreaOf(100 * TILE, (DESERT_Y0 + 20) * TILE).name, "the Sunscar desert");
  assert.equal(mapAreaOf(100 * TILE, (SINKHOLES_Y0 + 50) * TILE).name, "the Mawdeep Sinkholes");
  assert.notEqual(mapAreaOf(100 * TILE, (WORLD_H + 2) * TILE).key, "world");
});
