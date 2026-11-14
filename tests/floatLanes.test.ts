// Collision lanes for floating texts (client/src/floatLanes.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FLOAT_LIFE_MS, placeFloat, type FloatBox } from "../client/src/floatLanes";

const box = (x: number, y: number, t: number, w = 40, h = 10): FloatBox => ({ x, y, w, h, t });

test("the first float is not moved", () => {
  assert.equal(placeFloat([], box(100, 100, 0)), 0);
});

test("a float that starts on top of a live one is lifted clear of it", () => {
  const live: FloatBox[] = [];
  placeFloat(live, box(100, 100, 0));
  const up = placeFloat(live, box(104, 102, 100));
  assert.ok(up >= 10, `lifted ${up}`);
  // the third one goes above the second
  assert.ok(placeFloat(live, box(100, 100, 200)) > up);
});

test("floats far apart or after the lifetime do not push each other", () => {
  const live: FloatBox[] = [];
  placeFloat(live, box(100, 100, 0));
  assert.equal(placeFloat(live, box(300, 100, 50)), 0, "far sideways");
  assert.equal(placeFloat(live, box(100, 100, FLOAT_LIFE_MS + 1)), 0, "after the old one expired");
});

test("the live list is capped at 40 and expired entries leave", () => {
  const live: FloatBox[] = [];
  for (let i = 0; i < 100; i++) placeFloat(live, box(i * 100, 0, 0));
  assert.ok(live.length <= 40);
  placeFloat(live, box(0, 0, 5000));
  assert.equal(live.length, 1);
});

test("shifting stops at maxSteps", () => {
  const live: FloatBox[] = [];
  for (let i = 0; i < 12; i++) placeFloat(live, box(0, 0, i, 40, 10), 10, 3);
  assert.ok(placeFloat(live, box(0, 0, 20, 40, 10), 10, 3) <= 30);
});
