import test from "node:test";
import assert from "node:assert/strict";
import { attrEffect, pointsRule, skillHint, toneOf } from "../client/src/heroText";
import { HP_PER_STA, HP_PER_STR, DMG_PER_POINT, STATS } from "../shared/powers";
import { CLASSES } from "../shared/classes";

test("attrEffect: numbers come from the rules", () => {
  for (const cls of Object.keys(CLASSES) as (keyof typeof CLASSES)[]) {
    assert.match(attrEffect("sta", cls), new RegExp(`\\+${HP_PER_STA} health`));
    assert.match(attrEffect("str", cls), new RegExp(`\\+${HP_PER_STR} health`));
    const main = STATS[cls].attackStat;
    assert.equal(attrEffect("str", cls).includes("attack"), main === "str");
    assert.equal(attrEffect("mag", cls).includes("and attack"), main === "mag");
    assert.match(attrEffect("mag", cls), new RegExp(`\\+${Math.round(DMG_PER_POINT * 100)}% spell damage`));
    assert.match(attrEffect("dex", cls), /\+1% critical chance/);
  }
});

test("toneOf: stat kinds", () => {
  assert.equal(toneOf("hp"), "health");
  assert.equal(toneOf("mana"), "mana");
  assert.equal(toneOf("spell"), "spell");
  assert.equal(toneOf("atk"), "attack");
  assert.equal(toneOf("crit"), "gold");
  assert.equal(toneOf("speed"), "speed");
  assert.equal(toneOf("def"), "plain");
  assert.equal(toneOf("unknown"), "plain");
});

test("hint texts", () => {
  assert.match(pointsRule(), /3 at levels 3, 5, 8 and 10/);
  assert.equal(skillHint(1), "1 point · 1 per level · a skill needs the one above it");
  assert.equal(skillHint(0), "0 points · 1 per level · a skill needs the one above it");
});
