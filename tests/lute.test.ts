// DI-5 (docs/songweaver-di-plan.md): the musical-only rule, the evolving lute and its id, kit migration v2 and the
// class-aware tutorial gift.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  baseId, canWear, gearDef, gearName, isBound, isGearId, itemLevel, itemRunes, luteAtLevel, luteTraits, NOT_BOOK, NOT_LUTE, plainId,
  socketsOf, starterKit, wearProblem, withRunes, withTraits, BAG_SIZE,
} from "../shared/gear";
import { LUTE_ID, LUTE_STAGES, luteAt } from "../shared/lute";
import { parseRuneCode } from "../shared/runes";
import { TUT_CHAIN, TUT_QUESTS, stepFor } from "../shared/quests";
import { migrateSongweaver, relevelLute, SW_KIT_VERSION } from "../server/songs";
import { sellPrice } from "../shared/shops";
import { startRoom, wait } from "./helpers/room";

const pots = { potion: [0, 0, 0], mpotion: [0, 0, 0] } as any;

test("rule: a Songweaver wears her lute and books only; her ranged slot stays open; others may wear books", () => {
  for (const w of ["w_bronze", "w_frost@12", "wb_hunt", "ww_star", "wf_oak"]) assert.equal(wearProblem("songweaver", w), NOT_LUTE, w);
  for (const sh of ["sh_wood", "sh_iron@9", "knight_shield"]) assert.notEqual(wearProblem("songweaver", sh), "", sh);
  assert.equal(wearProblem("songweaver", "sh_wood"), NOT_BOOK);
  for (const ok of ["songweaver_weapon", "songweaver_weapon@20#steel", "songweaver_shield", "bk_hymnal@8", "r_sling", "a_chain", "h_cap", "s_swift"])
    assert.ok(canWear("songweaver", ok), ok);
  assert.ok(canWear("knight", "bk_march") && canWear("knight", "w_frost") && canWear("wizard", "sh_iron"));
  assert.ok(!canWear("knight", "songweaver_weapon@12"), "her lute is her kit");
});

test("id: songweaver_weapon@<lvl>#<traits>^<runes> round-trips; plainId, baseId and isGearId handle the # segment", () => {
  const id = withRunes(withTraits("songweaver_weapon@25", ["dark", "steel", "deep"]), [parseRuneCode("ember2")!]);
  assert.equal(id, "songweaver_weapon@25#steel.deep.dark^ember2", "group order, runes last");
  assert.ok(isGearId(id));
  assert.equal(baseId(id), LUTE_ID);
  assert.equal(plainId(id), "songweaver_weapon@25");
  assert.equal(itemLevel(id), 25);
  assert.deepEqual(luteTraits(id), ["steel", "deep", "dark"]);
  assert.equal(withRunes(withTraits(plainId(id), luteTraits(id)), itemRunes(id)), id, "rebuilt from its parts");
  assert.equal(withTraits(id, [...luteTraits(id), "gut"]), "songweaver_weapon@25#gut.deep.dark^ember2", "refitting a group replaces its trait");
  for (const bad of ["songweaver_weapon@12#wide.steel", "songweaver_weapon@12#steel.gut", "songweaver_weapon@12#", "songweaver_weapon@12#nope",
    "w_frost@12#steel", "songweaver_weapon@1", "songweaver_weapon@12#steel^ember2.ember2"]) assert.ok(!isGearId(bad), bad);
  assert.ok(isGearId("songweaver_weapon#gut") && isGearId("songweaver_weapon@12"));
});

test("stages: stats and sockets follow the item level, the name is the stage's; the lute is bound", () => {
  assert.deepEqual(LUTE_STAGES.map((s) => s.from), [1, 5, 10, 20, 35]);
  assert.deepEqual(gearDef("songweaver_weapon")!.bonus, {});
  assert.deepEqual(gearDef("songweaver_weapon@7")!.bonus, { atk: 2 });
  assert.deepEqual(gearDef("songweaver_weapon@19#gut")!.bonus, { atk: 4, mag: 1 });
  assert.deepEqual(gearDef("songweaver_weapon@20")!.bonus, { atk: 7, mag: 2 });
  assert.deepEqual(gearDef("songweaver_weapon@50")!.bonus, { atk: 8, mag: 3 });
  assert.equal(socketsOf("songweaver_weapon@19"), 1);
  assert.equal(socketsOf("songweaver_weapon@20"), 2);
  assert.equal(gearName("songweaver_weapon@12", "songweaver"), "Fine Lute");
  assert.equal(gearName("songweaver_weapon@40#steel", "songweaver"), "Virtuoso's Lute");
  assert.equal(luteAt(4).name, "Minstrel's");
  assert.ok(isBound("songweaver_weapon@30#gut^ember2"));
  assert.equal(starterKit("songweaver").weapon, LUTE_ID);
});

test("level: luteAtLevel keeps traits and runes; relevelLute rewrites the worn and bagged lutes", () => {
  assert.equal(luteAtLevel("songweaver_weapon#gut", 14), "songweaver_weapon@14#gut");
  assert.equal(luteAtLevel("songweaver_weapon@1", 1), "songweaver_weapon");
  const out: string[] = [];
  assert.equal(luteAtLevel("songweaver_weapon@25#gut^ember2.ember1", 12, out), "songweaver_weapon@12#gut^ember2", "a socket fewer");
  assert.deepEqual(out, ["rune:ember:1"]);
  assert.equal(luteAtLevel("w_frost@3", 30), "w_frost@3", "not a lute: unchanged");
  const p = { cls: "songweaver", level: 22, weapon: "songweaver_weapon@21#steel" }, bag = ["a_chain", "songweaver_weapon@3"], loose: string[] = [];
  assert.ok(relevelLute(p, bag, loose));
  assert.equal(p.weapon, "songweaver_weapon@22#steel");
  assert.deepEqual(bag, ["a_chain", "songweaver_weapon@22"]);
  assert.equal(relevelLute(p, bag, loose), false, "nothing more to do");
  assert.equal(relevelLute({ cls: "knight", level: 9, weapon: "w_frost" }, [], loose), false);
});

test("migration v2 (pure): a non-lute weapon and a non-book shield are stowed; the lute comes back at her level", () => {
  // a v1 save: sword in hand, the Songbook worn, lute in the bag
  let s: Record<string, unknown> = { weapon: "w_frost@9", shield: "songweaver_shield", bag: ["a_leather", "songweaver_weapon#gut"], swKit: 1 };
  let notes = migrateSongweaver({ cls: "songweaver", level: 15, gold: 0, pots }, s, () => true);
  assert.equal(s.weapon, "songweaver_weapon@15#gut", "her own lute, traits kept, at her level");
  assert.deepEqual(s.bag, ["a_leather", "w_frost@9"]);
  assert.equal(s.swKit, SW_KIT_VERSION);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /bag.*lute and a book/);
  // a v1 save that wore a shield again since, and lost the lute: a new one, the Songbook back in hand
  s = { weapon: "", shield: "sh_iron", bag: ["songweaver_shield"], swKit: 1 };
  notes = migrateSongweaver({ cls: "songweaver", level: 3, gold: 0, pots }, s, () => true);
  assert.deepEqual([s.weapon, s.shield, s.bag], ["songweaver_weapon@3", "songweaver_shield", ["sh_iron"]]);
  // a v1 save with a Hymnal worn and the Songbook in the bag: both stay
  s = { weapon: "songweaver_weapon", shield: "bk_hymnal", bag: ["songweaver_shield"], swKit: 1 };
  assert.deepEqual(migrateSongweaver({ cls: "songweaver", level: 8, gold: 0, pots }, s, () => true), []);
  assert.deepEqual([s.weapon, s.shield, s.bag], ["songweaver_weapon@8", "bk_hymnal", ["songweaver_shield"]]);
  // a v0 save: shield and weapon both move (v1 then v2)
  s = { weapon: "w_bronze", shield: "sh_wood", bag: [] };
  notes = migrateSongweaver({ cls: "songweaver", level: 6, gold: 0, pots }, s, () => true);
  assert.deepEqual([s.weapon, s.shield, s.bag, notes.length], ["songweaver_weapon@6", "songweaver_shield", ["sh_wood", "w_bronze"], 2]);
  // full bag, no stash room: sold
  const full = Array.from({ length: BAG_SIZE }, () => "a_leather"), hero = { cls: "songweaver", level: 6, gold: 10, pots };
  s = { weapon: "w_dragon", shield: "songweaver_shield", bag: full, swKit: 1 };
  notes = migrateSongweaver(hero, s, () => false);
  assert.equal(hero.gold, 10 + sellPrice("w_dragon"));
  assert.match(notes[0], /sold for/);
  assert.equal(s.weapon, "songweaver_weapon@6");
  // up to date or not hers: untouched
  const done = { weapon: "w_frost", swKit: SW_KIT_VERSION };
  assert.deepEqual(migrateSongweaver({ cls: "songweaver", level: 6, gold: 0, pots }, done, () => true), []);
  assert.equal(done.weapon, "w_frost");
  assert.deepEqual(migrateSongweaver({ cls: "knight", level: 6, gold: 0, pots }, { weapon: "w_frost" }, () => true), []);
});

let shared: ReturnType<typeof startRoom> | undefined;
const server = () => (shared ??= startRoom());
after(async () => { if (shared) await (await shared).stop(); });

test("room: a v1 save loads with her lute at her level; the restore filter sends a misfit to the bag; equip refuses a sword", async () => {
  const srv = await server();
  const c = await srv.join({ cls: "songweaver" });
  try {
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const base = { ...room.snapshot(p), level: 12, swKit: 1, weapon: "w_frost@9", shield: "songweaver_shield", bag: ["a_leather"] };
    const moved = room.restore(p, structuredClone(base));
    assert.equal(p.weapon, "songweaver_weapon@12");
    assert.deepEqual([...p.bag], ["a_leather", "w_frost@9"]);
    assert.equal(moved.length, 1);
    assert.equal(room.snapshot(p).swKit, SW_KIT_VERSION);
    // already v2 but a shield in her hand (edited save): the filter puts it in the bag
    room.restore(p, { ...room.snapshot(p), shield: "sh_iron" });
    assert.equal(p.shield, "");
    assert.ok([...p.bag].includes("sh_iron"));
    // equipping the sword is refused with the content line
    let got: any;
    c.onMessage("gearno", (m: any) => { got = m; });
    const i = [...p.bag].indexOf("w_frost@9");
    room.equip(c.sessionId, i);
    await wait(150);
    assert.equal(p.weapon, "songweaver_weapon@12");
    assert.equal(got?.text, NOT_LUTE);
    // level-up: the lute follows
    room.grantXp(c.sessionId, 50_000_000, { x: p.x, y: p.y });
    assert.ok(p.level > 12);
    assert.equal(p.weapon, `songweaver_weapon@${p.level}`);
  } finally { await c.leave(); await wait(50); }
});

test("room: First Steps gives a Songweaver a Hymnal (a knight his bronze weapon), and wearing it moves the quest on", async () => {
  const tut = TUT_QUESTS[0], kill = tut.steps.findIndex((s) => s.type === "kill");
  assert.equal(stepFor(tut.steps[kill], "songweaver").gift, "bk_hymnal");
  assert.equal(stepFor(tut.steps[kill], "knight").gift, "w_bronze");
  assert.match(stepFor(tut.steps[kill + 1], "songweaver").text, /book/);
  assert.match(stepFor(tut.steps.at(-1)!, "songweaver").say!.join(" "), /a book to your name/);
  const srv = await server();
  for (const [cls, gift] of [["songweaver", "bk_hymnal"], ["knight", "w_bronze"]] as const) {
    const c = await srv.join({ cls });
    try {
      await wait(200);
      const room = srv.room, p = room.state.players.get(c.sessionId);
      room.qset(p, TUT_CHAIN, { questId: 0, questStage: kill + 1, questCount: 2 });
      room.questKill(c.sessionId, p, { kind: "slime", merged: 1, x: p.x, y: p.y }, TUT_CHAIN);
      assert.ok([...p.bag].includes(gift), `${cls} got ${gift}: ${[...p.bag]}`);
      assert.equal(room.qs(p, TUT_CHAIN).questStage, kill + 2, "on the equip step");
      room.equip(c.sessionId, [...p.bag].indexOf(gift));
      assert.equal(p[cls === "songweaver" ? "shield" : "weapon"], gift);
      assert.ok(room.qs(p, TUT_CHAIN).questStage >= kill + 3, "worn: the quest moves on");
    } finally { await c.leave(); await wait(50); }
  }
});
