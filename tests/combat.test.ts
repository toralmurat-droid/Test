import { test } from "node:test";
import assert from "node:assert/strict";
import { poiseLevelMult, POISE_LEVEL, pvpDamageMult } from "../shared/combat";
import { convertOldXp, levelFromXp, MAX_LEVEL, MAX_XP, oldXpForLevel, xpForLevel, xpStep } from "../shared/classes";

test("poise level multiplier stays within its bounds", () => {
  assert.equal(poiseLevelMult(5, 5), 1);
  assert.equal(poiseLevelMult(1, 99), POISE_LEVEL.min);
  assert.equal(poiseLevelMult(99, 1), POISE_LEVEL.max);
  assert.ok(poiseLevelMult(5, 6) < 1 && poiseLevelMult(6, 5) > 1);
});

test("pvp damage multiplier is 1 at level 1 and shrinks with level", () => {
  assert.equal(pvpDamageMult(1, 1), 1);
  assert.ok(pvpDamageMult(20, 20) < pvpDamageMult(10, 10));
});

test("xp curve: max xp gives max level, levels never go down", () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(MAX_XP), MAX_LEVEL);
  let last = 1;
  for (let xp = 0; xp <= MAX_XP; xp += Math.ceil(MAX_XP / 500)) {
    const l = levelFromXp(xp);
    assert.ok(l >= last);
    last = l;
  }
});

test("xp curve: each level costs more than the last", () => {
  for (let l = 2; l < MAX_LEVEL; l++) assert.ok(xpStep(l) > xpStep(l - 1), `step ${l}`);
});

test("old saves keep their level and progress share on the new xp curve", () => {
  for (const [xp, level] of [[0, 1], [oldXpForLevel(12) + 480, 12], [oldXpForLevel(30), 30], [oldXpForLevel(50), 50]]) {
    const n = convertOldXp(xp, level);
    assert.equal(levelFromXp(n), level);
  }
  // halfway through Lv 12 stays halfway
  const half = convertOldXp(oldXpForLevel(12) + 480, 12);
  assert.equal(half - xpForLevel(12), Math.floor(0.5 * xpStep(12)));
});
