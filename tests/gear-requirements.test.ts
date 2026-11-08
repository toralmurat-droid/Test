import { test } from "node:test";
import assert from "node:assert/strict";
import { activeGear, gearReq, reqProblem, withLevel } from "../shared/gear";

// Vampire: base Strength 8, Stamina 7. A Lv 20 Chainmail (tier 2) asks for 10 Stamina.
const chain = withLevel("a_chain", 20);

test("worn gear counts towards another item's requirement", () => {
  const r = gearReq(chain, "vampire");
  assert.equal(r.stat, "sta");
  const bare = { cls: "vampire", level: 20, pts: {} };
  assert.match(reqProblem(chain, bare), /Stamina/);
  const need = r.points - 7;
  const sword = withLevel("w_bronze", 1); // no Stamina
  // own points alone are enough
  assert.equal(reqProblem(chain, { ...bare, pts: { sta: need } }), "");
  // a worn sword gives no Stamina: still short by one
  assert.match(reqProblem(chain, { ...bare, pts: { sta: need - 1 }, worn: { weapon: sword } }), /you: /);
});

test("an item never holds itself up, and activeGear only counts pieces it can switch on", () => {
  const r = gearReq(chain, "vampire");
  const h = { cls: "vampire", level: 20, pts: { sta: r.points - 7 - 1 }, worn: { armour: chain } };
  // wearing the chainmail itself does not count for its own requirement
  assert.notEqual(reqProblem(chain, h), "");
  assert.deepEqual(activeGear({ armour: chain }, h), {});
  // a Lv 1 Iron Helm (+3 Stamina, no requirement) lifts the hero over the line: both pieces count
  const worn = { armour: chain, hat: "h_helm" };
  const h2 = { ...h, worn };
  assert.equal(reqProblem(chain, h2), "");
  assert.deepEqual(activeGear(worn, h2), worn);
});
