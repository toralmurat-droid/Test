import test from "node:test";
import assert from "node:assert/strict";
import { barScale, boxesHit } from "../client/src/hudSlots";

test("barScale: the bar follows k at 100% and up", () => {
  for (const dpr of [1, 1.25, 2]) assert.equal(barScale(1, dpr), 1);
  assert.equal(barScale(1.5, 1), 1.5);
  assert.equal(barScale(1.5, 2), 1.5);
});

test("barScale: below 100% it is the smallest crisp size in [1, 1.25]", () => {
  assert.equal(barScale(0.75, 1), 1);
  assert.equal(barScale(0.75, 2), 1);
  assert.equal(barScale(0.75, 1.25), 1.2); // 2 * 1.2 * 1.25 = 3 device px per art pixel
  for (const k of [0.5, 0.75, 0.9]) for (const dpr of [1, 1.25, 1.5, 2]) { const s = barScale(k, dpr); assert.ok(s >= 1 && s <= 1.25); }
});

test("boxesHit: edges count, pad grows the boxes, no boxes never hit", () => {
  const b = [{ left: 100, top: 10, right: 200, bottom: 50 }];
  assert.ok(boxesHit(b, 150, 30));
  assert.ok(boxesHit(b, 100, 10) && boxesHit(b, 200, 50));
  assert.ok(!boxesHit(b, 99, 30) && !boxesHit(b, 150, 51));
  assert.ok(boxesHit(b, 95, 30, 5));
  assert.ok(!boxesHit([], 1, 1));
});
