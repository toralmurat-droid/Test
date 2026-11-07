import { test } from "node:test";
import assert from "node:assert/strict";
import { addHeat, coolHeat, heatOf, isOverheated, OVERLOAD, ventLeft } from "../shared/overload";
import { canPay, pay, skillCost } from "../shared/mana";

test("heat skills build heat and overload past the top", () => {
  const u = { energy: 0, mana: 0 };
  const slash = skillCost({ cost: 30 });
  assert.ok(pay(u, slash)); assert.ok(pay(u, slash)); assert.ok(pay(u, slash));
  assert.equal(heatOf(u), 90);
  assert.ok(pay(u, slash), "the push over the top still goes through");
  assert.ok(isOverheated(u));
  assert.ok(!canPay(u, slash), "locked while venting");
  assert.ok(canPay(u, { mana: 0 }), "skills with no heat cost are not locked");
});

test("venting takes OVERLOAD.ventMs, then the hero is cool", () => {
  const u = { energy: 0 };
  addHeat(u, 200);
  assert.equal(ventLeft(u), OVERLOAD.ventMs / 1000);
  let ended = false;
  for (let t = 0; t < OVERLOAD.ventMs - 100; t += 50) ended = coolHeat(u, "vampire", 0.05) || ended;
  assert.ok(isOverheated(u) && !ended);
  for (let t = 0; t < 200; t += 50) ended = coolHeat(u, "vampire", 0.05) || ended;
  assert.ok(ended && !isOverheated(u) && u.energy === 0);
});

test("heat cools steadily when not overheated", () => {
  const u = { energy: 50 };
  coolHeat(u, "vampire", 1);
  assert.ok(u.energy! < 50 && u.energy! > 0);
});
