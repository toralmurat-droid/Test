// client/src/warColumns.ts: the roads and columns model the maps draw (placement on the shared clock, visibility, texts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { columnTip, WarColumns } from "../client/src/warColumns";
import { columnPos } from "../shared/war/marches";
import { roadEntry, roadPairs, warPath } from "../shared/war/roads";

const pair = () => roadPairs().find((p) => !p.link)!;

test("a column is placed like the server places it, in either direction", () => {
  const { a, b } = pair(), e = roadEntry(a, b)!, m = new WarColumns();
  m.setRoads([e]);
  const dep = 1_000_000, now = dep + 40_000;
  m.setColumns({ tick: 1, cols: [["c1", 1, a, b, dep, 5, 1, 0, 1], ["c2", 1, b, a, dep, 3, 0, 0, 1]] }, now);
  const [c1, c2] = m.all(now);
  const q1 = columnPos(warPath(a, b)!, dep, now), q2 = columnPos(warPath(b, a)!, dep, now);
  assert.ok(Math.hypot(c1.x - q1.x, c1.y - q1.y) < 1 && Math.hypot(c2.x - q2.x, c2.y - q2.y) < 1);
  assert.equal(c1.men, 4);
  assert.match(columnTip(c1), /^Redfang column · 4 men · marching on /);
});

test("other clans' columns show only near the hero; the own clan's always", () => {
  const { a, b } = pair(), m = new WarColumns();
  m.setRoads([roadEntry(a, b)!]);
  m.setColumns({ tick: 1, cols: [["x", 1, a, b, 0, 4, 0, 0, 1], ["y", 0, a, b, 0, 4, 0, 0, 1]] }, 10_000);
  const far = { x: -99999, y: -99999 };
  assert.deepEqual(m.visible("wardens", far, 10_000).map((c) => c.id), ["y"]);
  const at = m.all(10_000)[0];
  assert.equal(m.visible("wardens", at, 10_000).length, 2);
});

test("columns are placed on the server's clock: the message's `now` gives the offset", () => {
  const { a, b } = pair(), m = new WarColumns();
  m.setRoads([roadEntry(a, b)!]);
  const dep = 1_000_000, server = dep + 40_000, local = server - 7_000; // this computer's clock runs 7 s behind
  m.setColumns({ tick: 1, now: server, cols: [["c1", 1, a, b, dep, 5, 0, 0, 1]] }, local);
  const c = m.all(local + 2000)[0], q = columnPos(warPath(a, b)!, dep, server + 2000);
  assert.ok(Math.hypot(c.x - q.x, c.y - q.y) < 1);
});
