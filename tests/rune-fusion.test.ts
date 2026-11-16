// Rune fusion (Lot C): 4 identical loose runes + gold -> one rank higher, at a trader who buys runes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fuseCost, fuseProblem, fuseRunes, looseRuneCounts, RUNE_FUSE_COST, runeId } from "../shared/runes";
import { BAG_SIZE, withRunes } from "../shared/gear";
import { SHOPS, shopFuses } from "../shared/shops";
import { NPCS } from "../shared/npcs";
import { potionSlots } from "../shared/potions";

const e1 = runeId("ember", 1), e2 = runeId("ember", 2), e3 = runeId("ember", 3), t1 = runeId("thorn", 1);
const st = (bag: string[], gold = 1000, reserved = 0) => ({ bag, gold, reserved, bagSize: BAG_SIZE });

test("costs: 100 gold for rank 1 -> 2, 400 for 2 -> 3, nothing past rank 3", () => {
  assert.deepEqual(RUNE_FUSE_COST, [0, 100, 400]);
  assert.equal(fuseCost(1), 100);
  assert.equal(fuseCost(2), 400);
  assert.equal(fuseCost(3), undefined);
  assert.equal(fuseCost(0), undefined);
  assert.equal(fuseCost(1.5), undefined);
});

test("a valid fusion takes exactly four runes and the gold, and gives one rune a rank higher in place of the first", () => {
  const bag = ["w_bronze", e1, t1, e1, e1, e1, e1];
  const r = fuseRunes(e1, st(bag, 150));
  assert.ok(typeof r !== "string");
  assert.deepEqual(r.bag, ["w_bronze", e2, t1, e1]);
  assert.equal(r.gold, 50);
  assert.equal(r.made, e2);
  assert.deepEqual(bag, ["w_bronze", e1, t1, e1, e1, e1, e1]); // pure: the input is untouched
  const r2 = fuseRunes(e2, st([e2, e2, e2, e2], 400));
  assert.ok(typeof r2 !== "string");
  assert.deepEqual(r2.bag, [e3]);
  assert.equal(r2.gold, 0);
});

test("refused: three runes, mixed keys, rank 3, not enough gold, junk ids", () => {
  assert.match(fuseRunes(e1, st([e1, e1, e1])) as string, /need 4/);
  assert.match(fuseRunes(e1, st([e1, e1, e1, t1])) as string, /need 4/); // never across keys
  assert.match(fuseRunes(e3, st([e3, e3, e3, e3])) as string, /Greater/);
  assert.match(fuseRunes(e1, st([e1, e1, e1, e1], 99)) as string, /100 gold/);
  assert.match(fuseRunes(e2, st([e2, e2, e2, e2], 399)) as string, /400 gold/);
  for (const bad of ["rune:ember:4", "w_bronze", "", 5, null, undefined, { id: e1 }]) assert.equal(fuseRunes(bad, st([e1, e1, e1, e1])), "That is not a rune");
  assert.match(fuseRunes(e1, st([e1, e1, e1, e1], NaN)) as string, /gold/);
});

test("runes set in an item never count", () => {
  const sword = withRunes("w_frost@17~R:atk3", [{ key: "ember", rank: 1 }, { key: "ember", rank: 1 }]);
  const bag = [sword, e1, e1, e1];
  assert.equal(looseRuneCounts(bag).get(e1), 3);
  assert.equal(looseRuneCounts(bag).size, 1);
  assert.match(fuseProblem(e1, st(bag)) as string, /have 3/);
});

test("bag room: a full bag can still fuse (four out, one in); only an over-full bag is refused", () => {
  const full = [e1, e1, e1, e1, ...Array(BAG_SIZE - 6).fill("w_bronze")];
  assert.equal(fuseProblem(e1, st(full, 1000, 2)), "");
  assert.match(fuseProblem(e1, st(full, 1000, 6)) as string, /No room/);
});

test("the service is offered by every rune buyer, one in each act (Saltmere's chandler too), and nowhere else", () => {
  const fusers = NPCS.filter((n) => n.shop && shopFuses(SHOPS[n.shop])).map((n) => n.id);
  assert.deepEqual(fusers.sort(), ["chandler", "moorherbalist", "ropehealer", "rusthealer", "spicetrader", "witch"]);
  for (const [id, s] of Object.entries(SHOPS)) assert.equal(shopFuses(s), !!s.buys?.includes("rune"), id);
});

test("in the game: fusing at Morwen and at Zahra, with every refusal leaving bag and gold untouched", async () => {
  const { startRoom, wait } = await import("./helpers/room");
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    const replies: { ok: boolean; text: string }[] = [];
    c.onMessage("shop", (m: any) => replies.push(m));
    await wait(200);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id), cl = room.clients.find((x: any) => x.sessionId === id);
    const setBag = (items: string[]) => { p.bag.clear(); for (const i of items) p.bag.push(i); };
    const at = (npc: string, dx = 10) => { const n = NPCS.find((x) => x.id === npc)!; p.x = n.x + dx; p.y = n.y; };
    const same = (bag: string[], gold: number) => { assert.deepEqual(p.bag.toArray(), bag); assert.equal(p.gold, gold); };

    // valid, through the real message
    at("witch");
    setBag(["w_bronze", e1, e1, e1, e1]);
    p.gold = 120;
    c.send("fuse", { id: e1 });
    await wait(300);
    same(["w_bronze", e2], 20);
    assert.equal(replies.at(-1)?.ok, true);

    // three only
    setBag([e1, e1, e1]); p.gold = 1000;
    room.fuseRunesMsg(cl, e1);
    same([e1, e1, e1], 1000);
    // rank 3
    setBag([e3, e3, e3, e3]);
    room.fuseRunesMsg(cl, e3);
    same([e3, e3, e3, e3], 1000);
    // not enough gold
    setBag([e2, e2, e2, e2]); p.gold = 399;
    room.fuseRunesMsg(cl, e2);
    same([e2, e2, e2, e2], 399);
    // runes set in an item don't count
    const sword = withRunes("w_frost@17~R:atk3", [{ key: "ember", rank: 1 }, { key: "ember", rank: 1 }]);
    setBag([sword, e1, e1, e1]); p.gold = 1000;
    room.fuseRunesMsg(cl, e1);
    same([sword, e1, e1, e1], 1000);
    // full bag: still works, frees three slots
    const free = BAG_SIZE - potionSlots(p.pots);
    const full = [e1, e1, e1, e1, ...Array(free - 4).fill("w_bronze")];
    setBag(full);
    room.fuseRunesMsg(cl, e1);
    assert.equal(p.bag.length, free - 3);
    assert.equal(p.bag.at(0), e2);
    assert.equal(p.gold, 900);
    // too far from the trader, and next to a trader who doesn't buy runes
    setBag([e1, e1, e1, e1]); p.gold = 1000;
    at("witch", 400);
    room.fuseRunesMsg(cl, e1);
    same([e1, e1, e1, e1], 1000);
    at("weaponsmith");
    room.fuseRunesMsg(cl, e1);
    same([e1, e1, e1, e1], 1000);
    await wait(200);
    assert.match(replies.at(-1)?.text ?? "", /rune trader/);
    // dead heroes can't fuse
    at("witch"); p.dead = true;
    room.fuseRunesMsg(cl, e1);
    same([e1, e1, e1, e1], 1000);
    p.dead = false;
    // Act 2: Zahra in Kel Ashar
    at("spicetrader");
    room.fuseRunesMsg(cl, e1);
    same([e2], 900);
    // a burst of messages can fuse only what is there: 8 runes -> 2 fusions, never more
    at("witch");
    setBag(Array(8).fill(e1)); p.gold = 1000;
    for (let i = 0; i < 5; i++) c.send("fuse", { id: e1 });
    await wait(300);
    same([e2, e2], 800);
  } finally {
    await srv.stop();
  }
});
