import { test } from "node:test";
import assert from "node:assert/strict";
import { GEAR, gearStats } from "../shared/gear";
import { gearPrice } from "../shared/shops";
import { NPCS } from "../shared/npcs";
import { repairCost, REPAIR_RATE, respecCost, RESPEC, WEAR, wearMult } from "../shared/upkeep";
import { startRoom, wait } from "./helpers/room";

const [g1, g2] = Object.keys(GEAR).filter((id) => gearPrice(id) > 0);

test("wear multiplier goes from 1 (new) to 1 - statLoss (fully worn), clamped", () => {
  assert.equal(wearMult(0), 1);
  assert.equal(wearMult(WEAR.max), 1 - WEAR.statLoss);
  assert.equal(wearMult(500), 1 - WEAR.statLoss);
  assert.equal(wearMult(-5), 1);
});

test("repair cost: share of the equipped gear's worth, scaled by wear", () => {
  assert.equal(repairCost([g1, g2], 0), 0);
  assert.equal(repairCost([undefined, ""], 50), 0);
  assert.equal(repairCost([g1, g2], WEAR.max), Math.round((gearPrice(g1) + gearPrice(g2)) * REPAIR_RATE));
  assert.ok(repairCost([g1], 10) >= 1);
});

test("respec cost: free at low levels, then per level", () => {
  assert.equal(respecCost(RESPEC.freeUpTo), 0);
  assert.equal(respecCost(20), RESPEC.perLevel * 20);
});

test("in the room: death wears gear and lowers its stats; the smith repairs for gold; resets cost gold", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    await wait(200);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
    const client = room.clients.find((x: any) => x.sessionId === id);
    const before = { sta: p.sta, str: p.str, mag: p.mag, dex: p.dex };
    // Die 5 times (outside the safe zone is not needed: damagePlayer is called directly, and death respawns later)
    for (let i = 0; i < 5; i++) { p.dead = false; p.invulnUntil = 0; p.x = 0; p.y = 0; room.damagePlayer(id, 99999, "test", [0, 0], 0); }
    assert.equal(p.wear, 5 * WEAR.perDeath);
    const after = p.sta + p.str + p.mag + p.dex, sum0 = before.sta + before.str + before.mag + before.dex;
    const g = gearStats(p.cls, room.equipped(p)), gsum = g.sta + g.str + g.mag + g.dex;
    if (gsum >= 2) assert.ok(after < sum0, "worn gear gives less");
    else assert.ok(after <= sum0);
    // Repair at Brann's (weaponsmith)
    const brann = NPCS.find((n) => n.id === "weaponsmith")!;
    p.dead = false; p.x = brann.x; p.y = brann.y;
    const cost = repairCost(["weapon", "armour", "shoes", "hat", "shield", "ranged"].map((s) => p[s]), p.wear);
    p.gold = cost - 1;
    room.repairGear(client);
    assert.equal(p.wear, 5 * WEAR.perDeath, "not enough gold: nothing repaired");
    p.gold = cost + 7;
    room.repairGear(client);
    assert.equal(p.wear, 0);
    assert.equal(p.gold, 7);
    // Paid stat reset at level 20
    p.level = 20; p.ptSta = 3; p.lastHurt = 0; p.gold = 0;
    room.resetStats(id);
    assert.equal(p.ptSta, 3, "can't pay: points stay");
    p.gold = respecCost(20);
    room.resetStats(id);
    assert.equal(p.ptSta, 0);
    assert.equal(p.gold, 0);
    // The wear is saved with the hero
    p.wear = 30;
    assert.equal(room.snapshot(p).wear, 30);
    await c.leave();
  } finally {
    await srv.stop();
  }
});
