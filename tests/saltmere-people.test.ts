// Saltmere rework phase 5 (docs/saltmere-rework-progress.md): the village's people, the chandler's shop, and the lines
// that follow the hero's Redfang progress and the Two Letters choice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { isSolidAt } from "../shared/map";
import { NPCS, npcById } from "../shared/npcs";
import { SALT_BUILDINGS, SALT_STASH, SALT_TOWN } from "../shared/saltmere";
import { SHOPS } from "../shared/shops";
import { CHAINS, RED_CHAIN, npcPresent, packQuest, questDialog } from "../shared/quests";
import { withChoice } from "../shared/questSteps";

const PEOPLE = ["smoker", "chandler", "marta", "agna", "pell"];
const ix = (id: string) => CHAINS.findIndex((c) => c.id === id);
const red = (questId: number) => ({ level: 25, quests: { tut: packQuest(CHAINS[ix("tutorial")].quests.length, 0, 0), red: packQuest(questId, 0, 0) } }) as any;
const say = (id: string, p: any) => questDialog(id, p)?.text.join(" ");

test("Saltmere people: unique ids, inside the town, on free ground, clear of buildings and the stash", () => {
  assert.equal(new Set(NPCS.map((n) => n.id)).size, NPCS.length, "NPC ids are unique");
  for (const id of PEOPLE) {
    const n = npcById(id)!;
    assert.ok(n, id);
    const tx = Math.floor(n.x / TILE), ty = Math.floor(n.y / TILE);
    assert.ok(tx >= SALT_TOWN.x && ty >= SALT_TOWN.y && tx < SALT_TOWN.x + SALT_TOWN.w && ty < SALT_TOWN.y + SALT_TOWN.h, `${id} in Saltmere`);
    assert.ok(!isSolidAt(n.x, n.y), `${id} stands on walkable ground`);
    for (const b of SALT_BUILDINGS) assert.ok(!(tx >= b.x && ty >= b.y && tx < b.x + b.w && ty < b.y + b.h), `${id} is outside the ${b.id}`);
    assert.ok(!(tx === SALT_STASH.x && ty === SALT_STASH.y), `${id} is not on the stash tile`);
  }
});

test("Chandler: Minor and Medium flasks at the usual prices, buys runes like the herbwives", () => {
  assert.equal(npcById("chandler")!.shop, "chandler");
  const shop = SHOPS.chandler, witch = SHOPS.witch;
  assert.ok(shop.buys?.includes("rune"));
  const key = (e: { item: string; size?: number; qty?: number; price: number }) => `${e.item}/${e.size}/${e.qty}/${e.price}`;
  assert.deepEqual(shop.stock.map(key).sort(), witch.stock.map(key).sort(), "same stock and prices as Morwen's");
});

test("Pell is only at his boat once the Redfang chief is down", () => {
  const n = CHAINS[RED_CHAIN].quests.length;
  assert.equal(npcPresent("pell", red(n - 1)), false, "chief not done");
  assert.equal(npcPresent("pell", red(0)), false);
  assert.equal(npcPresent("pell", red(n)), true);
  for (const id of ["smoker", "chandler", "marta", "agna"]) assert.equal(npcPresent(id, red(0)), true, `${id} is always there`);
  assert.ok(say("pell", red(n)));
});

test("Agna follows the Two Letters choice, Marta follows the Redfang chain", () => {
  const n = CHAINS[RED_CHAIN].quests.length;
  const law = { ...red(n), flags: withChoice(0, "letters", 1) }, mercy = { ...red(n), flags: withChoice(0, "letters", 2) };
  const plain = say("agna", red(n));
  assert.ok(plain && say("agna", law) && say("agna", mercy));
  assert.notEqual(say("agna", law), say("agna", mercy));
  assert.notEqual(say("agna", law), plain);
  assert.notEqual(say("agna", mercy), plain);

  const before = say("marta", red(1)), after = say("marta", red(2)), toast = say("marta", red(n));
  assert.ok(before && after && toast);
  assert.equal(new Set([before, after, toast]).size, 3, "three different moods");
  assert.equal(say("marta", red(0)), before, "worried until Salt and Steel is done");
});
