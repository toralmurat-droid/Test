// Client helper: which take-spot object is hidden while a carry is on (client/src/carryHide.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAINS, packQuest } from "../shared/quests";
import { carryHiddenId, LANTERN_OBJECT } from "../client/src/carryHide";

const ci = (id: string) => CHAINS.findIndex((c) => c.id === id);
const hero = (chain: string, quest: number, stage: number) => ({ quests: new Map([[chain, packQuest(quest, stage, 0)]]) }) as any;

test("the Last Lantern hides its own take object", () => {
  assert.equal(carryHiddenId(hero("lantern", 0, 2), ci("lantern")), LANTERN_OBJECT);
});
test("Garrick's lantern is hidden on the Watch-Fire carry step", () => {
  const c = ci("saltways"), q = CHAINS[c].quests.findIndex((d) => d.id === "watchfire");
  assert.equal(carryHiddenId(hero("saltways", q, 1), c), "salt_firelantern");
});
test("unknown step or chain falls back to the Last Lantern", () => {
  assert.equal(carryHiddenId(undefined, -1), LANTERN_OBJECT);
  assert.equal(carryHiddenId(hero("saltways", 0, 1), ci("saltways")), LANTERN_OBJECT);
});
