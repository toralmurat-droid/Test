// Trades move gold and items between players: any hole here is an item or gold duplication bug.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GEAR, BAG_SIZE } from "../shared/gear";
import { offerFrom, settle, takeItems } from "../shared/trade";

const [g1, g2, g3] = Object.keys(GEAR);

test("takeItems takes each item once and fails on a missing one", () => {
  assert.deepEqual(takeItems([g1, g2, g1], [g1]), [g2, g1]);
  assert.equal(takeItems([g1], [g1, g1]), null);
});

test("offerFrom ignores bad indices, repeats and gold the hero does not have", () => {
  const o = offerFrom([g1, g2], 50, [0, 0, 1, 7, -1, 1.5, "0"], 999);
  assert.deepEqual(o, { items: [g1, g2], gold: 50 });
  assert.equal(offerFrom([g1], 50, [], -10).gold, 0);
  assert.equal(offerFrom([g1], 50, [], Number.NaN).gold, 0);
  assert.equal(offerFrom([g1], 50, [], 12.9).gold, 12);
});

test("settle swaps items and gold, and the totals never change", () => {
  const a = { bag: [g1, g2], gold: 100, offer: { items: [g1], gold: 30 } };
  const b = { bag: [g3], gold: 5, offer: { items: [g3], gold: 0 } };
  const r = settle(a, b);
  assert.notEqual(typeof r, "string");
  if (typeof r === "string") return;
  assert.deepEqual(r.a, { bag: [g2, g3], gold: 70 });
  assert.deepEqual(r.b, { bag: [g1], gold: 35 });
  assert.equal(r.a.gold + r.b.gold, a.gold + b.gold);
  assert.equal(r.a.bag.length + r.b.bag.length, a.bag.length + b.bag.length);
});

test("settle refuses stale offers, missing gold and full bags", () => {
  assert.equal(typeof settle({ bag: [], gold: 0, offer: { items: [g1], gold: 0 } }, { bag: [], gold: 0, offer: { items: [], gold: 0 } }), "string");
  assert.equal(typeof settle({ bag: [], gold: 10, offer: { items: [], gold: 11 } }, { bag: [], gold: 0, offer: { items: [], gold: 0 } }), "string");
  assert.equal(typeof settle({ bag: [], gold: 10, offer: { items: [], gold: -5 } }, { bag: [], gold: 0, offer: { items: [], gold: 0 } }), "string");
  const full = Array(BAG_SIZE).fill(g1);
  assert.equal(typeof settle({ bag: full, gold: 0, offer: { items: [], gold: 0 } }, { bag: [g2], gold: 0, offer: { items: [g2], gold: 0 } }), "string");
});
