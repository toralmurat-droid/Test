// A class trained with a weapon (its native weapon) fights with its own numbers; others borrow the first class's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLASSES } from "../shared/classes";
import { profileOf } from "../shared/weapons";

test("native weapons use the class's own attack; the others the weapon's first class", () => {
  for (const [cls, type] of [["knight", "sword"], ["vampire", "sword"], ["wizard", "staff"], ["summoner", "staff"]] as const) {
    const p = profileOf(type, cls);
    assert.equal(p.damage, CLASSES[cls].damage, `${cls} ${type}`);
    assert.equal(p.combo, CLASSES[cls].combo, `${cls} ${type} combo`);
  }
  assert.equal(profileOf("staff", "archer").damage, CLASSES.wizard.damage, "an archer with a staff fights like a wizard");
  assert.equal(profileOf("sword", "archer").damage, CLASSES.knight.damage, "an archer with a sword fights like a knight");
  assert.equal(profileOf("staff").attackCooldownMs, CLASSES.wizard.attackCooldownMs);
});

test("the Summoner's combo ends in an elemental burst", () => {
  const c = CLASSES.summoner.combo;
  assert.equal(c.length, 3);
  assert.ok((c[2].attune ?? 0) > 0 && (c[2].shotScale ?? 1) > 1 && c[2].damage > c[0].damage);
});
