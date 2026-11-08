// Runes (shared/runes.ts): set into gear and taken out whole; the item ids must stay valid and round-trip.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gearDef, isBagItem, isGearId, itemAffixes, itemLevel, itemRarity, itemRunes, plainId, runeEffects, socketProblem, socketsOf, stripRunes, withRunes, baseId } from "../shared/gear";
import { isRuneId, mergeRunes, parseRune, rollMobRune, RUNE_KEYS, RUNE_MAX_CHANCE, RUNES, runeId, runeText } from "../shared/runes";
import { offerFrom } from "../shared/trade";
import { passesFilter, uselessItem } from "../shared/heroSheet";

const rare = "w_frost@17~R:atk3,sta4,dex2";
const ember = { key: "ember" as const, rank: 2 }, thorn = { key: "thorn" as const, rank: 1 };

test("loose rune ids parse and reject junk", () => {
  for (const k of RUNE_KEYS) for (const r of [1, 2, 3]) assert.deepEqual(parseRune(runeId(k, r)), { key: k, rank: r });
  for (const bad of ["rune:ember:4", "rune:nope:1", "rune:ember", "rune:ember:1x", "ember2", 5, null]) assert.equal(isRuneId(bad), false);
  assert.equal(isGearId(runeId("ember", 1)), false);
  assert.equal(isBagItem(runeId("ember", 1)), true);
});

test("a rune set in an item keeps the item's level, rarity, bonuses and art", () => {
  const id = withRunes(rare, [ember]);
  assert.equal(id, `${rare}^ember2`);
  assert.ok(isGearId(id));
  assert.equal(itemLevel(id), 17);
  assert.equal(itemRarity(id), 2);
  assert.deepEqual(itemAffixes(id), itemAffixes(rare));
  assert.equal(baseId(id), "w_frost");
  assert.equal(plainId(id), "w_frost@17");
  assert.deepEqual(gearDef(id)!.bonus, gearDef(rare)!.bonus);
  assert.deepEqual(itemRunes(id), [ember]);
  assert.equal(stripRunes(id), rare);
  assert.equal(withRunes(id, []), rare); // taken out again: the bare item
});

test("sockets: one on plain items, two on Rare and Legendary, none on ranged; weapon and armour runes fit their own", () => {
  assert.equal(socketsOf("w_frost"), 1);
  assert.equal(socketsOf(rare), 2);
  assert.equal(socketsOf("r_sling"), 0);
  assert.equal(socketsOf("knight_weapon"), 1);
  assert.equal(socketProblem("w_frost", ember), "");
  assert.notEqual(socketProblem("w_frost", thorn), "");
  assert.equal(socketProblem("a_chain", thorn), "");
  assert.notEqual(socketProblem("r_sling", ember), "");
  assert.notEqual(socketProblem(withRunes("w_frost", [ember]), ember), ""); // full
  assert.equal(socketProblem(withRunes(rare, [ember]), ember), "");
  // invalid sets are refused when loading saves
  assert.equal(isGearId(withRunes("w_frost", [ember, ember])), false);
  assert.equal(isGearId(withRunes("a_chain", [ember])), false);
  assert.equal(isGearId("w_frost^"), false);
  assert.equal(isGearId("w_frost^zzz1"), false);
  assert.ok(isGearId(withRunes("knight_armour", [thorn])));
});

test("worn runes merge: chances add up to the cap, the best rank sets the power", () => {
  const fx = runeEffects({ armour: withRunes("a_chain", [thorn]), hat: withRunes("h_helm", [{ key: "thorn", rank: 3 }]) });
  assert.equal(fx.thorn!.rank, 3);
  assert.equal(fx.thorn!.power, RUNES.thorn.power[3]);
  assert.ok(Math.abs(fx.thorn!.chance - Math.min(RUNE_MAX_CHANCE, RUNES.thorn.chance[1] + RUNES.thorn.chance[3])) < 1e-9);
  const many = mergeRunes(Array(10).fill({ key: "storm", rank: 3 }));
  assert.equal(many.storm!.chance, RUNE_MAX_CHANCE);
  for (const k of RUNE_KEYS) assert.ok(runeText({ key: k, rank: 2 }).length > 10);
});

test("runes trade, pass the loot filter and are never junk; summons never drop them", () => {
  const r = runeId("venom", 1);
  assert.deepEqual(offerFrom([r, "w_frost"], 0, [0], 0).items, [r]);
  assert.equal(passesFilter({ minRarity: 3, ownClass: true }, "knight", r), true);
  assert.equal(uselessItem({ cls: "knight" } as any, {}, r), false);
  assert.equal(rollMobRune(0, 30, () => 0), undefined);
  assert.ok(isRuneId(rollMobRune(1, 30, () => 0)));
});

test("in the game: set a rune, it fires in a fight, take it out whole", async () => {
  const { startRoom, wait } = await import("./helpers/room");
  const { isSafeZone, isSolidAt, VILLAGE } = await import("../shared/map");
  const { TILE } = await import("../shared/constants");
  const srv = await startRoom();
  const random = Math.random;
  try {
    const c = await srv.join({ cls: "knight" });
    await wait(200);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id), cl = room.clients.find((x: any) => x.sessionId === id);
    const bag = () => p.bag.toArray();
    p.weapon = "w_frost"; p.armour = "a_chain";
    room.setBagFor = (items: string[]) => { p.bag.clear(); for (const i of items) p.bag.push(i); };
    room.setBagFor([runeId("ember", 2), runeId("mend", 3), "w_bronze"]);
    // weapon rune into the worn weapon, armour rune into a weapon in the bag is refused
    room.socketRune(cl, { rune: 1, item: 2 });
    assert.equal(bag().length, 3);
    room.socketRune(cl, { rune: 0, slot: "weapon" });
    assert.equal(p.weapon, "w_frost^ember2");
    assert.deepEqual(bag(), [runeId("mend", 3), "w_bronze"]);
    room.socketRune(cl, { rune: 0, slot: "armour" });
    assert.equal(p.armour, "a_chain^mend3");
    // a fight: Math.random 0 makes every rune fire
    let x = 0, y = 0;
    for (let tx = VILLAGE.x0 - 14; tx > 0 && !x; tx--) {
      const xx = (tx + 0.5) * TILE, yy = (VILLAGE.y0 + 10.5) * TILE;
      if (!isSolidAt(xx, yy) && !isSafeZone(xx, yy)) { x = xx; y = yy; }
    }
    room.state.mobs.forEach((_m: any, mid: string) => room.state.mobs.delete(mid));
    p.x = x; p.y = y;
    room.spawnMob("skeleton", 0, "t1", { x: x + 16, y, level: 5 });
    room.spawnMob("skeleton", 0, "t2", { x: x + 30, y, level: 5 });
    const m1 = room.state.mobs.get("t1"), m2 = room.state.mobs.get("t2");
    m1.hp = m1.maxHp = m2.hp = m2.maxHp = 100000;
    Math.random = () => 0;
    room.hitTarget(id, "t1", 100, [1, 0], { basic: true });
    await wait(300);
    Math.random = random;
    assert.ok(m2.hp < m2.maxHp, "the ember burst hit the second skeleton");
    p.hp = 10;
    Math.random = () => 0;
    room.damagePlayer(id, 5, "Skeleton", [0, 0], 0, { from: "t1" });
    Math.random = random;
    assert.ok(p.hp > 10, "the mend rune healed");
    // out again: back in the bag whole
    room.unsocketRune(cl, { slot: "weapon", n: 0 });
    assert.equal(p.weapon, "w_frost");
    assert.ok(bag().includes(runeId("ember", 2)));
  } finally {
    Math.random = random;
    await srv.stop();
  }
});

test("in the game: selling a rune to Morwen pays its price", async () => {
  const { startRoom, wait } = await import("./helpers/room");
  const { NPCS } = await import("../shared/npcs");
  const { RUNE_PRICE } = await import("../shared/shops");
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    await wait(200);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id), cl = room.clients.find((x: any) => x.sessionId === id);
    const w = NPCS.find((n: any) => n.id === "witch")!;
    p.x = w.x + 10; p.y = w.y;
    p.bag.clear(); p.bag.push("w_frost"); p.bag.push(runeId("storm", 3));
    const gold = p.gold;
    room.shopSell(cl, 0); // she doesn't buy swords
    assert.equal(p.bag.length, 2);
    room.shopSell(cl, 1);
    assert.deepEqual(p.bag.toArray(), ["w_frost"]);
    assert.equal(p.gold, gold + RUNE_PRICE[3]);
  } finally {
    await srv.stop();
  }
});

test("Morwen buys loose runes by rank; the smiths do not, and they still buy gear with runes in it", async () => {
  const { SHOPS, shopBuys, sellPrice, RUNE_PRICE } = await import("../shared/shops");
  const r1 = runeId("ember", 1);
  assert.equal(shopBuys(SHOPS.witch, r1), true);
  assert.equal(shopBuys(SHOPS.witch, "w_frost"), false);
  assert.equal(shopBuys(SHOPS.weaponsmith, r1), false);
  assert.equal(shopBuys(SHOPS.weaponsmith, withRunes("w_frost", [ember])), true);
  assert.equal(sellPrice(r1), RUNE_PRICE[1]);
  assert.ok(sellPrice(runeId("ward", 3)) > sellPrice(runeId("ward", 2)) && sellPrice(runeId("ward", 2)) > sellPrice(r1));
});
