import { test } from "node:test";
import assert from "node:assert/strict";
import { SHOPS } from "../shared/shops";
import { NPCS, isDecorSolidAt } from "../shared/npcs";
import { gearDef, itemLevel } from "../shared/gear";
import { TILE } from "../shared/constants";

const RANGES: Record<string, [number, number]> = { armourer: [1, 16], saltarmourer: [16, 30], sandarmourer: [30, 50], moorarmourer: [20, 35] };

test("each village armourer sells only armour at its area's levels", () => {
  for (const [id, [lo, hi]] of Object.entries(RANGES)) {
    const npc = NPCS.find((n) => n.id === id);
    assert.ok(npc && npc.shop === id, `${id} stands in a village`);
    const shop = SHOPS[id];
    assert.ok(shop.stock.length >= 16);
    for (const e of shop.stock) {
      const d = gearDef(e.item)!;
      assert.ok(["shield", "armour", "hat", "shoes"].includes(d.slot), `${e.item} is armour`);
      const lv = itemLevel(e.item);
      assert.ok(lv >= lo && lv <= hi, `${e.item} Lv ${lv} in ${lo}-${hi}`);
      assert.ok(e.price > 0);
    }
  }
});

test("armourers can be reached: not standing inside their own props", () => {
  for (const id of Object.keys(RANGES)) {
    const n = NPCS.find((x) => x.id === id)!;
    assert.equal(isDecorSolidAt(n.x, n.y + TILE * 0.6), false);
  }
  // Brann's forge still blocks
  assert.equal(isDecorSolidAt(70.2 * TILE, 56.6 * TILE), true);
});
