import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAINS, packQuest } from "../shared/quests";
import { chainProgress, groupByChain, logEntries, mapFocus, objectiveRows } from "../client/src/questLogView";
import { chainState } from "../shared/quests";

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
