// The Forge's sim gate (tools/balance/forgeGate.ts): seeded, fails closed, passes sane forgings and stops strong ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { forgeGate, recipeOf, rng } from "../tools/balance/forgeGate";
import { mobSpec } from "../tools/balance/pve";
import { defFromRecipe, FORGE, type MonsterRecipe, type WeaponRecipe } from "../shared/forge";
import { gearDef } from "../shared/gear";

const tusker: MonsterRecipe = { kind: "monster", clan: "hidekin", name: "Gore-Sewn Tusker", base: "tuskborn", affixes: ["stitched"], hp: 1.2, dmg: 1.1, speed: 1, palette: "hidekin" };
const sword: WeaponRecipe = { kind: "weapon", clan: "redfang", name: "Fang of Rourke", base: "ws_bastard", implicit: [{ key: "atk", value: 2 }, { key: "str", value: 1 }], palette: "redfang" };

test("the PRNG is deterministic and in [0, 1)", () => {
  const a = rng(42), b = rng(42), xs = Array.from({ length: 1000 }, a);
  assert.deepEqual(xs.slice(0, 20), Array.from({ length: 20 }, b));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(xs.slice(0, 5), Array.from({ length: 5 }, rng(43)));
});

test("mobSpec applies a forged variant", () => {
  const v = defFromRecipe(tusker, 1), plain = mobSpec("tuskborn", 24), forged = mobSpec("tuskborn", 24, { variant: v });
  assert.ok(Math.abs(forged.hp / plain.hp - 1.2) < 0.02);
  assert.ok(Math.abs(forged.dmg / plain.dmg - 1.1) < 0.02);
  assert.equal(forged.speed, plain.speed);
  assert.equal(forged.label, "Gore-Sewn Tusker");
  const skel = defFromRecipe({ ...tusker, base: "skeleton", affixes: [], weapon: "bow" }, 2);
  assert.ok(mobSpec("skeleton", 12, { variant: skel }).ranged, "the variant's weapon is used");
});

test("the gate is deterministic, restores Math.random and passes a sane monster", () => {
  const v = defFromRecipe(tusker, 1), orig = Math.random;
  const a = forgeGate(v, { runs: 6 }), b = forgeGate(v, { runs: 6 });
  assert.equal(Math.random, orig);
  assert.deepEqual(a, b);
  assert.notDeepEqual(forgeGate(v, { runs: 6, seed: 9 }).numbers, a.numbers, "the seed option changes the draw");
  const full = forgeGate(v);
  assert.ok(full.ok, full.reasons.join("; "));
  assert.equal(full.numbers.kind, "monster");
  if (full.numbers.kind === "monster") assert.equal(full.numbers.cells.length, 2 * 4, "4 active classes at both ends of the band");
});

test("the gate fails closed: invalid recipes, timeouts", () => {
  const bad = forgeGate({ ...defFromRecipe(tusker, 1), mult: { hp: 1.6, dmg: 1.4, speed: 1.15 } });
  assert.equal(bad.ok, false);
  assert.match(bad.reasons[0], /^over_budget/);
  const fam = forgeGate({ ...defFromRecipe(tusker, 1), affixes: ["gang"] });
  assert.equal(fam.ok, false);
  assert.match(fam.reasons[0], /^affix_family/);
  const slow = forgeGate(defFromRecipe(tusker, 1), { timeoutMs: -1 });
  assert.equal(slow.ok, false);
  assert.match(slow.reasons[0], /^timeout/);
});

test("the sim catches a monster whose affixes cost too little", () => {
  const saved = { ...FORGE.affixCost }, pair = FORGE.affixPair;
  try {
    for (const k of Object.keys(FORGE.affixCost) as (keyof typeof FORGE.affixCost)[]) FORGE.affixCost[k] = 0;
    FORGE.affixPair = 0;
    const r = forgeGate(defFromRecipe({ ...tusker, base: "skeleton", affixes: ["siege", "risen"], weapon: "sword", hp: 1.4, dmg: 1.2 }, 1));
    assert.equal(r.ok, false);
    assert.ok(r.reasons.some((x) => /per kill/.test(x)), r.reasons.join("; "));
  } finally { Object.assign(FORGE.affixCost, saved); FORGE.affixPair = pair; }
});

test("weapons: a sane forging passes, a strong one fails, the registry is restored", () => {
  const w = defFromRecipe(sword, 1);
  const ok = forgeGate(w);
  assert.ok(ok.ok, ok.reasons.join("; "));
  assert.equal(ok.numbers.kind, "weapon");
  if (ok.numbers.kind === "weapon") assert.deepEqual(ok.numbers.classes.map((c) => c.cls), ["wizard", "vampire", "summoner"], "the Songweaver plays her lute only");
  assert.equal(gearDef(w.id)!.name, "Forgotten Sword", "the forging under test is unplugged again");
  // within the item budget, but a Starfire Wand with more Magic is too much for the casters
  const star = forgeGate(defFromRecipe({ ...sword, name: "Star of the Circle", base: "ww_star", implicit: [{ key: "atk", value: 1 }, { key: "mag", value: 1 }] }, 2));
  assert.equal(star.ok, false);
  assert.ok(star.reasons.some((x) => /duels/.test(x)), star.reasons.join("; "));
});

test("recipeOf gives back the recipe a forging was made from", () => {
  assert.deepEqual(recipeOf(defFromRecipe(sword, 3)), sword);
  assert.deepEqual(recipeOf(defFromRecipe(tusker, 3)), tusker);
});
