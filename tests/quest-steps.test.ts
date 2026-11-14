// WP1 pure rules: choices, stage skipping, text variants, cosmetics, and the pinned world positions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHOICES, META, choiceOf, withChoice, stepOn, nextStage, sayFor, metaOf, type ChoiceId } from "../shared/questSteps";
import { packCosmetics, unpackCosmetics, hasTrait, withTrait, withTitle, TITLES } from "../shared/cosmetics";
import { CHAINS, CROWN_QUESTS, ENGINES, type QuestDef, type QuestStep } from "../shared/quests";
import { SIEGE_SITES } from "../shared/siege";
import { CHESTS } from "../shared/chests";

const ids = Object.keys(CHOICES) as ChoiceId[];
const hero = (flags: number) => ({ level: 50, arcs: { [META.flags]: flags } }) as any;

test("choices round-trip and never clobber their neighbours", () => {
  assert.deepEqual({ ...CHOICES }, { letters: 0, bargain: 1, grave: 2 }, "indices are append-only");
  for (const id of ids) for (const v of [0, 1, 2, 3]) {
    for (const base of [0, 0b111111, 0xffffffff >>> 0, 0b100110]) {
      const f = withChoice(base, id, v);
      assert.equal(choiceOf(hero(f), id), v);
      for (const o of ids) if (o !== id) assert.equal(choiceOf(hero(f), o), choiceOf(hero(base), o), `${id}=${v} left ${o} alone`);
    }
  }
  assert.equal(withChoice(0, "grave", 1), 1 << 4);
  assert.equal(withChoice(0, "letters", 7), 3, "values keep to 2 bits");
  assert.equal(choiceOf(undefined, "letters"), 0);
  assert.equal(choiceOf({ level: 1 } as any, "letters"), 0);
  assert.equal(metaOf(hero(5), META.flags), 5);
  assert.equal(metaOf({ level: 1, arcs: { [META.flags]: NaN } } as any, META.flags), 0, "garbage reads as 0");
  assert.equal(metaOf({ level: 1, arcs: new Map([[META.cosm, 9]]) } as any, META.cosm), 9, "a map-like arcs works too");
});

test("stepOn and nextStage skip steps for another choice", () => {
  const step = (onlyIf?: QuestStep["onlyIf"]) => ({ type: "talk", npc: "captain", text: "", onlyIf }) as QuestStep;
  const d = { steps: [step(), step({ flag: "letters", v: [1] }), step({ flag: "letters", v: [2] }), step()] } as unknown as QuestDef;
  const law = hero(withChoice(0, "letters", 1)), mercy = hero(withChoice(0, "letters", 2));
  assert.equal(stepOn(undefined, undefined), true);
  assert.equal(stepOn(d.steps[1], hero(0)), false, "no choice made matches nothing");
  assert.equal(stepOn(d.steps[1], law), true);
  assert.equal(nextStage(d, 0, law), 1);
  assert.equal(nextStage(d, 1, law), 2, "law lands on its own step");
  assert.equal(nextStage(d, 1, mercy), 3, "mercy skips the law step");
  assert.equal(nextStage(d, 2, law), 4, "law skips the mercy step");
  assert.equal(nextStage(d, 4, hero(0)), 5, "past the end = steps.length + 1 (quest done)");
  assert.equal(nextStage(d, 1, hero(0)), 4, "no choice skips both branches");
  const tail = { steps: [step(), step({ flag: "letters", v: [1] })] } as unknown as QuestDef;
  assert.equal(nextStage(tail, 1, hero(0)), 3, "a skipped last step still ends the quest");
});

test("sayFor falls back to say; the Hollow Crown hand-in varies, its shape does not", () => {
  const s = { type: "talk", text: "", say: ["a"], sayBy: { flag: "letters", lines: { 1: ["x"], 2: ["y"] } } } as unknown as QuestStep;
  assert.deepEqual(sayFor(s, hero(0)), ["a"]);
  assert.deepEqual(sayFor(s, hero(withChoice(0, "letters", 1))), ["x"]);
  assert.deepEqual(sayFor(s, hero(withChoice(0, "letters", 2))), ["y"]);
  assert.deepEqual(sayFor(s, hero(withChoice(0, "letters", 3))), ["a"], "an unlisted value falls back");
  assert.deepEqual(sayFor({ type: "talk", text: "" } as QuestStep, hero(0)), []);
  const crown = CHAINS.find((c) => c.id === "crown")!;
  assert.deepEqual(crown.quests.map((q) => q.steps.length), [2, 4], "the Crown keeps its step count");
  assert.equal(crown.version, 2, "and its version");
  const hand = CROWN_QUESTS.flatMap((q) => q.steps).filter((st) => st.sayBy);
  assert.equal(hand.length, 1);
  const base = sayFor(hand[0], hero(0));
  assert.deepEqual(base, hand[0].say, "no choice: the original lines");
  const law = sayFor(hand[0], hero(withChoice(0, "letters", 1))), mercy = sayFor(hand[0], hero(withChoice(0, "letters", 2)));
  assert.notDeepEqual(law, base); assert.notDeepEqual(mercy, base); assert.notDeepEqual(law, mercy);
});

test("cosmetics pack and unpack", () => {
  assert.equal(packCosmetics({ title: 0, traits: 0 }), 0);
  for (let title = 0; title < TITLES.length; title++) for (const traits of [0, 1, 0xffff, 0b1010]) {
    assert.deepEqual(unpackCosmetics(packCosmetics({ title, traits })), { title, traits });
  }
  assert.equal(packCosmetics({ title: 1, traits: 1 }), 1 | (1 << 8), "title low byte, traits from bit 8");
  assert.equal(packCosmetics({ title: 99, traits: 0 }), 0, "an unknown title is dropped");
  assert.equal(packCosmetics({ title: -1, traits: 0 }), 0);
  assert.equal(packCosmetics({ title: 1.5, traits: 0 }), 0);
  assert.deepEqual(unpackCosmetics(99), { title: 0, traits: 0 }, "garbage title reads as none");
  assert.deepEqual(unpackCosmetics(NaN), { title: 0, traits: 0 });
  assert.equal(hasTrait(0, "beast"), false);
  const n = withTrait(withTitle(0, 2), "beast");
  assert.equal(hasTrait(n, "beast"), true);
  assert.equal(unpackCosmetics(n).title, 2, "adding a trait keeps the title");
  assert.equal(unpackCosmetics(withTitle(n, 0)).traits, 1, "clearing the title keeps the trait");
  assert.equal(withTrait(n, "beast"), n, "idempotent");
});

test("no chain id starts with $ (reserved arcs keys)", () => {
  for (const c of CHAINS) assert.ok(!c.id.startsWith("$"), c.id);
  for (const id of ["grave", "sandcrown", "letters"]) assert.ok(CHAINS.some((c) => c.id === id), id);
});

// Positions are pinned on purpose: a quest or map change that moves a siege site, a catapult or a chest must update
// these on purpose, so the overlap rules (shared/siege.ts fits()) get looked at again.
const r2 = (n: number) => Math.round(n * 100) / 100;
test("pinned: siege sites, engines and chests keep their positions", () => {
  assert.deepEqual(SIEGE_SITES.map((s: any) => [s.zone, r2(s.x), r2(s.y)]), [["Stonecrag Quarry",2864,3196.8],["Stonecrag Quarry",3056,3516.8],["Stonecrag Quarry",3408,3388.8],["Stonecrag Quarry",3280,3068.8],["Old Ruins",4464,1948.8],["Old Watchtower",4432,604.8],["Barrow Downs",1968,4348.8],["Barrow Downs",816,4796.8],["Barrow Downs",848,4316.8],["Barrow Downs",1200,4700.8],["Greywatch Keep",6096,1564.8],["Greywatch Keep",6416,1884.8],["Greywatch Keep",5744,1788.8],["Greywatch Keep",5936,2044.8]]);
  assert.deepEqual(ENGINES.map((o) => [o.id, r2(o.x), r2(o.y)]), [["engine1", 2864, 3216], ["engine2", 3056, 3536], ["engine3", 3408, 3408], ["engine4", 3280, 3088]]);
  assert.deepEqual(CHESTS.map((c: any) => [c.id, r2(c.x), r2(c.y)]), [["lair_1",3248,627.2],["lair_2",880,1939.2],["lair_3",1776,3155.2],["lair_4",1008,3251.2],["lair_5",3216,3347.2],["lair_6",4368,2131.2],["lair_7",4784,499.2],["lair_8",3440,4947.2],["lair_9",1456,4115.2],["lair_10",6192,1907.2],["lair_11",6384,627.2],["lair_12",7824,3603.2],["lair_13",3920,6035.2],["lair_14",7312,6195.2],["lair_15",7088,2835.2],["lair_16",7664,4435.2],["lair_17",6384,4403.2],["lair_18",5488,3315.2],["lair_19",7792,307.2],["lair_20",8816,2515.2],["lair_21",7696,4467.2],["lair_22",912,8691.2],["lair_23",3920,7763.2],["lair_24",4848,8243.2],["lair_25",7248,7667.2],["maw_hoard_1",2000,7635.2],["maw_secret_1",2320,7603.2],["maw_hoard_2",4016,8787.2],["maw_secret_2",3280,8659.2],["maw_hoard_3",6288,8435.2],["maw_secret_3",6224,8819.2],["maw_hoard_4",752,18291.2],["maw_secret_4",2128,17587.2],["maw_hoard_5",2768,17907.2],["maw_secret_5",2608,18419.2],["maw_hoard_6",5360,18259.2],["maw_secret_6",6736,17587.2],["maw_hoard_7",7344,17907.2],["maw_secret_7",7152,18387.2],["story_3_1",2320,3539.2],["story_5_3",2832,4435.2],["story_6_1",1488,5491.2],["story_7_2",880,6163.2],["story_8_3",5136,3123.2],["story_9_3",7792,307.2],["story_10_3",8496,2355.2],["story_11_3",8304,5235.2],["bones_5_2",6768,4851.2],["bones_6_2",6128,1939.2],["sun_4_2",2832,15411.2],["sun_6_2",7184,13043.2]]);
});
