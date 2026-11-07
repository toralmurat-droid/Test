import { test } from "node:test";
import assert from "node:assert/strict";
import { CLASS_KINDS } from "../shared/classes";
import { childrenOf } from "../shared/skills";
import { TILE, treeLayout } from "../client/src/treeLayout";

// Skill tree slab (talents.ts): tiles, their rank box (5 px out at the bottom right) and the arrows never overlap
const W = 620, H = 520;
for (const cls of CLASS_KINDS) test(`skill tree tiles of the ${cls} never overlap`, () => {
  const { nodes, cols } = treeLayout(cls, W, H);
  const half = TILE / 2, box = (n: { x: number; y: number }) => ({ l: n.x - half, r: n.x + half + 5, t: n.y - half, b: n.y + half + 5 });
  assert.ok(cols[2].x1 <= W - 10, `${cls}: schools wider than the slab`);
  for (const n of nodes) {
    const b = box(n), c = cols[n.s.branch];
    assert.ok(b.l >= c.x0 && b.r <= c.x1, `${n.s.id} leaves its school`);
    assert.ok(b.t >= 40 && b.b <= H - 50, `${n.s.id} off the slab`);
  }
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = box(nodes[i]), b = box(nodes[j]);
    assert.ok(a.r + 4 <= b.l || b.r + 4 <= a.l || a.b + 4 <= b.t || b.b + 4 <= a.t, `${nodes[i].s.id} overlaps ${nodes[j].s.id}`);
  }
  // every skill sits lower than the one it grows from
  const byId = new Map(nodes.map((n) => [n.s.id, n]));
  for (const n of nodes) for (const k of childrenOf(cls, n.s.id)) assert.ok(byId.get(k.id)!.y > n.y, `${k.id} not below ${n.s.id}`);
});
