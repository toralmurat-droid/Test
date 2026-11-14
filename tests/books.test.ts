// DI-2 books (docs/songweaver-di-plan.md): Hymnal, War March and Dissonance in the shield slot. A poor shield for
// anyone; a Songweaver's full song gauge fires the book's gift. Found as tier-2 loot, never class-locked.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { FINISHERS, skillById } from "../shared/skills";
import { fillGauge } from "../shared/skillEngine";
import { GAUGE, MODES } from "../shared/songs";
import { canWear, GEAR, gearDef, gearReq, isBound, isGearId, LOOT_IDS, rollGear, withLevel } from "../shared/gear";
import { gearFor, pointsFor } from "../tools/balance/duel";
import { near, singer, world } from "./helpers/songWorld";
import { startRoom, wait } from "./helpers/room";

const BOOKS = { bk_hymnal: "sg_g_bless", bk_march: "sg_g_rally", bk_dissonance: "sg_g_cacoph" } as const;

test("data: three tier-2 books in the shield slot, a very low block, a Magic requirement, a gift in FINISHERS", () => {
  for (const [id, full] of Object.entries(BOOKS)) {
    const d = GEAR[id];
    assert.ok(d, id);
    assert.equal(d.slot, "shield");
    assert.equal(d.tier, 2);
    assert.equal(d.cls, undefined, "not class-locked");
    assert.equal(isBound(id), false, "a found book can be sold or traded");
    assert.deepEqual(d.book, { full });
    assert.ok(FINISHERS.includes(skillById(full)!), `${full} is a hidden full-gauge effect`);
    assert.ok(skillById(full)!.finisher);
    assert.ok((gearDef(withLevel(id, 50))!.bonus.block ?? 0) <= 0.055, "block stays around 5% at Lv 50");
    assert.equal(gearReq(withLevel(id, 20), "knight").stat, "mag", "books ask for Magic, whoever reads them");
    assert.equal(gearReq(withLevel(id, 20), "knight").points, 10);
    assert.ok(LOOT_IDS.includes(id), "in the loot pool");
    for (const cls of ["knight", "wizard", "songweaver", "vampire"]) assert.ok(canWear(cls, id), `${cls} may wear ${id}`);
    assert.ok(isGearId(`${id}@12~R:sta2,mag3,fre5`), "affixes on a book");
  }
  assert.equal(GEAR.songweaver_shield.cls, "songweaver", "the Songbook is her kit (the art pipeline reads cls)");
  assert.equal(GEAR.bk_dissonance.bonus.mag, 3);
  assert.equal(GEAR.bk_hymnal.bonus.mag, 2);
});

test("loot: books drop from the tier-2 pool", () => {
  // rollGear: chance roll, tier roll, pool index, rarity; a demon at Lv 1 rolls tier 2 for r in [0.05, 0.5)
  const pool = LOOT_IDS.filter((id) => GEAR[id].tier === 2);
  for (const id of Object.keys(BOOKS)) {
    const i = pool.indexOf(id);
    assert.ok(i >= 0, `${id} in tier 2`);
    const rolls = [0, 0.2, (i + 0.5) / pool.length, 0.99];
    const got = rollGear("demon", 1, () => rolls.shift() ?? 0.99);
    assert.equal(got, id);
  }
});

test("gifts: Benediction heals and shields the party, Rally buffs damage and speed, Cacophony blasts and stuns", () => {
  // Benediction
  let w = world();
  let u = singer(w, { hp: 50 });
  const ally = w.add("ally", 20, { cls: "knight", hp: 50, maxHp: 200 });
  u.sk.book = "bk_hymnal"; u.sk.mode = "major";
  u.mana = GAUGE.max - 1;
  fillGauge(w.h, "sw", 5);
  const sw = w.fx.find((e) => e.ev === "swell");
  assert.deepEqual([sw.book, sw.fizzle], ["bk_hymnal", undefined]);
  assert.equal(u.mana, 0, "the gauge empties");
  const me = w.heals.find((x) => x.id === "sw");
  assert.ok(me && near(me.amount, 200 * 22 / 100 * MODES.major.ally, 1e-3), `22% heal: ${me?.amount}`);
  assert.ok(w.heals.some((x) => x.id === "ally"), "the party is healed too");
  assert.ok(u.sk.buffs.some((b) => b.id === "sg_g_bless" && (b.shield ?? 0) > 0), "and shielded");
  assert.ok(ally.sk.buffs.some((b) => b.id === "sg_g_bless"), "the ally gets the shield");
  // Rally
  w = world();
  u = singer(w);
  u.sk.book = "bk_march";
  u.mana = GAUGE.max;
  fillGauge(w.h, "sw", 1);
  const r = u.sk.buffs.find((b) => b.id === "sg_g_rally");
  assert.ok(r && (r.b.dmg ?? 0) > 0 && (r.b.atkspd ?? 0) > 0 && (r.b.speed ?? 0) > 0, "damage, attack speed and speed");
  assert.equal(r!.until - w.now, 8000);
  // Cacophony
  w = world();
  u = singer(w);
  const foe = w.add("foe", 30, { hp: 500, maxHp: 500 });
  u.sk.book = "bk_dissonance"; u.sk.mode = "minor";
  u.mana = GAUGE.max;
  fillGauge(w.h, "sw", 1);
  const hit = w.hits.find((x) => x.to === "foe");
  assert.ok(hit && hit.dmg > 0, "a blast");
  assert.ok((hit!.o.stunMs ?? 0) >= 500 && (hit!.o.weakMs ?? 0) > 0, "stun and weak");
  assert.equal(hit!.o.sound?.res, 40, "+40 resonance");
  assert.ok(foe.sk.res > 0, "it rings");
});

test("sims: from Lv 6 gearFor gives the Songweaver her build's book; below, her Songbook", () => {
  const at = (level: number, build: 0 | 1 | 2) => gearFor("songweaver", level, pointsFor("songweaver", level, build), build).shield!;
  assert.equal(at(5, 0), "songweaver_shield");
  assert.equal(at(6, 0).split("@")[0], "bk_hymnal");
  assert.equal(at(12, 1).split("@")[0], "bk_march");
  assert.equal(at(30, 2).split("@")[0], "bk_dissonance");
  assert.equal(gearFor("songweaver", 30).shield, "songweaver_shield", "no build: the Songbook");
  assert.equal(gearFor("knight", 30, undefined, 0).shield?.startsWith("bk_"), false, "other classes keep their shield");
});

let shared: ReturnType<typeof startRoom> | undefined;
const server = () => (shared ??= startRoom());
after(async () => { if (shared) await (await shared).stop(); });

test("room: the engine's book is the worn book she can read (an unread one gives no gift)", async () => {
  const srv = await server();
  const c = await srv.join({ cls: "songweaver" });
  try {
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    p.shield = "bk_hymnal";
    room.applyStats(p);
    assert.equal(p.sk.book, "bk_hymnal");
    p.shield = withLevel("bk_march", 40); // needs Lv 40 and 20 Magic
    room.applyStats(p);
    assert.equal(p.sk.book, undefined);
  } finally { await c.leave(); }
});
