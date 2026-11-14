// What the top monster bar says (client/src/monsterInfo.ts): difficulty colour, names and ranks, affixes, weak/resist,
// status chips, and when the world HP bar shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AFFIXES, packAffixes, championFullName } from "../shared/champions";
import { affinityText } from "../shared/elements";
import { isMineOrGroup, levelTone, monsterInfo, RECENT_HIT_MS, showWorldBar, type InfoCtx, type MobLike } from "../client/src/monsterInfo";

const ctx: InfoCtx = { myLevel: 10, playerName: (id) => ({ p1: "Aldo", p2: "Bera" } as Record<string, string>)[id] };
const mob = (o: Partial<MobLike> & { kind: string }): MobLike => ({ level: 10, hp: 50, maxHp: 100, ...o });

test("levelTone thresholds", () => {
  assert.equal(levelTone(7, 10), "trivial"); // 3 below
  assert.equal(levelTone(8, 10), "even");    // 2 below
  assert.equal(levelTone(10, 10), "even");
  assert.equal(levelTone(11, 10), "tough");
  assert.equal(levelTone(12, 10), "tough");
  assert.equal(levelTone(13, 10), "deadly");
  assert.equal(levelTone(40, 10), "deadly");
});

test("a plain monster: name, level, tone, hp, bronze frame", () => {
  const i = monsterInfo(mob({ kind: "skeleton", level: 12 }), ctx);
  assert.equal(i.name, "Skeleton");
  assert.equal(i.level, 12);
  assert.equal(i.tone, "tough");
  assert.equal(i.rank, "normal");
  assert.equal(i.frame, "bronze");
  assert.equal(i.badge, "");
  assert.deepEqual([i.hp, i.maxHp], [50, 100]);
});

test("a two-affix champion: name with epithet, both affixes with their text", () => {
  const champion = packAffixes(["risen", "siege"]);
  const i = monsterInfo(mob({ kind: "skeleton", title: "Morgrul", champion }), ctx);
  assert.equal(i.name, championFullName("Morgrul", champion));
  assert.ok(i.name.startsWith("Morgrul "));
  assert.equal(i.rank, "champion");
  assert.equal(i.frame, "gold");
  assert.equal(i.sub, "Skeleton");
  assert.deepEqual(i.affixes.map((a) => a.key).sort(), ["risen", "siege"]);
  for (const a of i.affixes) { assert.equal(a.text, AFFIXES[a.key].text); assert.equal(a.icon.length, 5); }
});

test("elite, boss and quest title badges", () => {
  const elite = monsterInfo(mob({ kind: "necromancer" }), ctx);
  assert.equal(elite.badge, "ELITE");
  assert.equal(elite.frame, "gold");
  const boss = monsterInfo(mob({ kind: "hollowking" }), ctx);
  assert.equal(boss.badge, "BOSS");
  assert.equal(boss.frame, "blood");
  const quest = monsterInfo(mob({ kind: "bandit", title: "Gorrik the Lame" }), ctx);
  assert.equal(quest.name, "Gorrik the Lame");
  assert.equal(quest.sub, "Bandit");
  assert.equal(quest.rank, "quest");
});

test("owner and summon naming", () => {
  const golem = monsterInfo(mob({ kind: "golem_colossus", owner: "p1" }), ctx);
  assert.equal(golem.name, "Aldo's Colossus");
  assert.equal(golem.rank, "summon");
  const thrall = monsterInfo(mob({ kind: "skeleton", owner: "p2" }), ctx);
  assert.equal(thrall.name, "Bera's Skeleton thrall");
  assert.equal(thrall.rank, "thrall");
  assert.equal(monsterInfo(mob({ kind: "wisp", owner: "p1" }), ctx).name, "Aldo's Wisp");
});

test("weak / resist from the affinity table", () => {
  const sk = monsterInfo(mob({ kind: "skeleton" }), ctx);
  assert.deepEqual(sk.weak.sort(), ["faith", "fire"]);
  assert.deepEqual(sk.resist.sort(), ["cold", "poison"]);
  assert.ok(affinityText("skeleton").includes("Weak to"));
  const fb = monsterInfo(mob({ kind: "frostblob" }), ctx);
  assert.deepEqual(fb.weak.sort(), ["fire", "shock"]);
  assert.deepEqual(fb.resist.sort(), ["cold", "poison"]);
  assert.deepEqual(fb.hits, ["cold"]);
});

test("a skeleton's weapon and the extras", () => {
  assert.equal(monsterInfo(mob({ kind: "skeleton", weapon: "spear" }), ctx).weapon, "Spear");
  assert.equal(monsterInfo(mob({ kind: "slime", merged: 3 }), ctx).extras[0], "Holds 3 blobs");
  assert.equal(monsterInfo(mob({ kind: "skeleton", guard: "c1" }), ctx).extras[0], "Guards a chest");
});

test("status words and flags become chips", () => {
  const i = monsterInfo(mob({ kind: "skeleton", stunned: true, fx: "burn,em_fire,steam" }), ctx);
  assert.deepEqual(i.states.map((s) => s.id), ["stun", "burn", "em_fire", "steam"]);
  assert.equal(i.states[2].label, "Fire mark");
  assert.equal(i.states[2].icon, "fire");
  assert.deepEqual(monsterInfo(mob({ kind: "skeleton", fx: "nonsense,,weak" }), ctx).states.map((s) => s.id), ["weak"]);
});

test("Songweaver sees how it hears, others do not", () => {
  assert.ok(monsterInfo(mob({ kind: "skeleton" }), { ...ctx, myClass: "songweaver" }).ear);
  assert.equal(monsterInfo(mob({ kind: "skeleton" }), { ...ctx, myClass: "wizard" }).ear, undefined);
});

test("the diff key ignores live HP but follows what is on show", () => {
  const a = monsterInfo(mob({ kind: "skeleton", hp: 90 }), ctx), b = monsterInfo(mob({ kind: "skeleton", hp: 10 }), ctx);
  assert.equal(a.key, b.key);
  assert.notEqual(a.key, monsterInfo(mob({ kind: "skeleton", stunned: true }), ctx).key);
});

const base = { hovered: false, targeted: false, now: 10_000, dead: false, hidden: false, ownSummon: false };
test("showWorldBar: only while hovered, targeted or recently hit by me / my group", () => {
  assert.equal(showWorldBar(base), false);
  assert.equal(showWorldBar({ ...base, hovered: true }), true);
  assert.equal(showWorldBar({ ...base, targeted: true }), true);
  assert.equal(showWorldBar({ ...base, lastMineHitAt: 10_000 - (RECENT_HIT_MS - 100) }), true, "3.9 s after my hit");
  assert.equal(showWorldBar({ ...base, lastMineHitAt: 10_000 - (RECENT_HIT_MS + 100) }), false, "4.1 s after my hit");
  assert.equal(showWorldBar({ ...base, ownSummon: true }), true);
  assert.equal(showWorldBar({ ...base, ownSummon: true, dead: true }), false);
  assert.equal(showWorldBar({ ...base, hovered: true, hidden: true }), false);
});

test("isMineOrGroup: a missing 'by' is not mine", () => {
  const group = new Set(["g1"]);
  assert.equal(isMineOrGroup("me", "me", group), true);
  assert.equal(isMineOrGroup("g1", "me", group), true);
  assert.equal(isMineOrGroup("stranger", "me", group), false);
  assert.equal(isMineOrGroup(undefined, "me", group), false);
  assert.equal(isMineOrGroup("", "me", group), false);
});
