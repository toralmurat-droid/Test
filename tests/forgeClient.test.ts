// The client's view of the forge pack (client/src/forgePack.ts): the quartermaster's stock must match the server's order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defFromRecipe, liveWeapons, type WeaponRecipe } from "../shared/forge";
import { setForgedGear } from "../shared/gear";
import { shopWithForged } from "../shared/shops";
import { forgedLine, shopOf, takeForged } from "../client/src/forgePack";

const recipe = (name: string, clan: WeaponRecipe["clan"], base: string): WeaponRecipe =>
  ({ kind: "weapon", clan, name, base, implicit: [{ key: "atk", value: 1 }], palette: "iron" });
const defs = [defFromRecipe(recipe("Third Blade", "redfang", "ws_bastard"), 7), defFromRecipe(recipe("First Blade", "redfang", "ws_arming"), 2),
  defFromRecipe(recipe("Host Blade", "host", "ws_arming"), 4), defFromRecipe(recipe("Second Blade", "redfang", "wx_hand"), 5)];

test("client shop stock equals the server's order (shopWithForged over liveWeapons) and follows the pack", () => {
  try {
    takeForged(defs, true);
    const want = shopWithForged("cap_redfang", liveWeapons(defs, "redfang").map((d) => d.id))!;
    assert.deepEqual(liveWeapons(defs, "redfang").map((d) => d.seq), [2, 5, 7], "seq order whatever the pack order");
    assert.deepEqual(shopOf("cap_redfang")!.stock, want.stock);
    assert.equal(shopOf("smith")?.stock.length, shopWithForged("smith", [])?.stock.length, "only capitals");
    assert.match(forgedLine(defs[0].id), /^Forged by /);
    // a pack that lost forging 5: it leaves the stock at once (provisionally retired), before any answer
    takeForged(defs.filter((d) => d.seq !== 5), true);
    assert.deepEqual(shopOf("cap_redfang")!.stock, shopWithForged("cap_redfang", liveWeapons(defs.filter((d) => d.seq !== 5), "redfang").map((d) => d.id))!.stock);
    assert.match(forgedLine(defs[3].id), /\(retired\)/);
    // the kill switch hides all forged stock
    takeForged(defs, true, true);
    assert.equal(shopOf("cap_redfang")!.stock.length, shopWithForged("cap_redfang", [])!.stock.length);
  } finally { setForgedGear(undefined); }
});
