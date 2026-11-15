// What the top monster bar says (client/src/monsterInfo.ts): difficulty colour, names and ranks, affixes, weak/resist,
// status chips, and when the world HP bar shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AFFIXES, packAffixes, championFullName } from "../shared/champions";
import { TIDE } from "../shared/tide";
import { hintFor } from "../client/src/songTables";
import { affinityText } from "../shared/elements";
import { affinityLine, detailLines, extraLine, hpText, isMineOrGroup, levelTone, monsterInfo, plateRows, statusLine, RECENT_HIT_MS, showWorldBar, type InfoCtx, type MobLike } from "../client/src/monsterInfo";
import { altBlocks } from "../client/src/monsterInfo";

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
  assert.equal(i.frame, "normal");
  assert.deepEqual([i.hp, i.maxHp], [50, 100]);
});

test("a two-affix champion: name with epithet, both affixes with their text", () => {
  const champion = packAffixes(["risen", "siege"]);
  const i = monsterInfo(mob({ kind: "skeleton", title: "Morgrul", champion }), ctx);
  assert.equal(i.name, championFullName("Morgrul", champion));
  assert.ok(i.name.startsWith("Morgrul "));
  assert.equal(i.rank, "champion");
  assert.equal(i.frame, "champion");
  assert.equal(i.sub, "Skeleton");
  assert.deepEqual(i.affixes.map((a) => a.key).sort(), ["risen", "siege"]);
  for (const a of i.affixes) { assert.equal(a.text, AFFIXES[a.key].text); assert.equal(a.icon.length, 5); }
});

test("elite, boss and quest title badges", () => {
  const elite = monsterInfo(mob({ kind: "necromancer" }), ctx);
  assert.equal(elite.rank, "elite");
  assert.equal(elite.frame, "elite");
  const boss = monsterInfo(mob({ kind: "hollowking" }), ctx);
  assert.equal(boss.rank, "boss");
  assert.equal(boss.frame, "boss");
  const quest = monsterInfo(mob({ kind: "bandit", title: "Gorrik the Lame" }), ctx);
  assert.equal(quest.name, "Gorrik the Lame");
  assert.equal(quest.sub, "Bandit");
  assert.equal(quest.rank, "quest");
  assert.equal(quest.frame, "quest");
});

test("named tier: titled Night Raiders, not quest targets; Tide marchers and own summons stay plain", () => {
  const raider = monsterInfo(mob({ kind: "nightraider", title: "Ashen Rider" }), ctx);
  assert.equal(raider.rank, "named");
  assert.equal(raider.frame, "named");
  assert.equal(raider.name, "Ashen Rider");
  assert.equal(monsterInfo(mob({ kind: "slime", title: TIDE.title }), ctx).frame, "normal");
  assert.equal(monsterInfo(mob({ kind: "golem_colossus", owner: "p1" }), ctx).frame, "normal");
  assert.equal(monsterInfo(mob({ kind: "skeleton", owner: "p2" }), ctx).frame, "normal");
});

test("rows: B only for ranked monsters with something to say, C while Alt is held", () => {
  const sw = { ...ctx, myClass: "songweaver" };
  const plain = monsterInfo(mob({ kind: "skeleton" }), sw);
  assert.deepEqual(plateRows(plain, false), { traits: false, details: false });
  assert.deepEqual(plateRows(plain, true), { traits: false, details: true });
  const champ = monsterInfo(mob({ kind: "skeleton", title: "Morgrul", champion: packAffixes(["risen"]) }), ctx);
  assert.deepEqual(plateRows(champ, false), { traits: true, details: false });
  assert.deepEqual(plateRows(champ, true), { traits: false, details: true });
  const elite = monsterInfo(mob({ kind: "necromancer" }), ctx);
  assert.equal(plateRows(elite, false).traits, false, "an elite with no affixes and no ear has no row B");
  assert.equal(plateRows(monsterInfo(mob({ kind: "necromancer" }), sw), false).traits, true, "...but a Songweaver gets the ear icons");
});

test("icon lists for a skeleton and a blob", () => {
  const sk = monsterInfo(mob({ kind: "skeleton", stunned: true, slowed: true, fx: "burn,bleed,mark,em_cold" }), ctx);
  assert.deepEqual(sk.weak.sort(), ["faith", "fire"]);
  assert.deepEqual(sk.resist.sort(), ["cold", "poison"]);
  assert.deepEqual(sk.states.map((s) => s.glyph), ["stun", "slow", "burn", "bleed", "mark", "mark"]);
  const blob = monsterInfo(mob({ kind: "slime" }), ctx);
  assert.deepEqual(blob.states, []);
  assert.ok(blob.weak.length > 0, "a blob has weaknesses to show");
});

test("Alt details: the full affinity line, weapon, extras, status, HP numbers, affix texts", () => {
  const sk = monsterInfo(mob({ kind: "skeleton", weapon: "spear", guard: "c1", hp: 822, maxHp: 1370, stunned: true, fx: "burn" }), ctx);
  assert.equal(affinityLine(sk), `Weak to Fire, Faith \u00b7 resists Cold, Poison${sk.hits.length ? " \u00b7 hits with " + sk.hits.map((h) => ({ fire: "Fire", cold: "Cold", poison: "Poison", faith: "Faith", shock: "Electric" } as Record<string, string>)[h]).join(", ") : ""}`);
  assert.equal(extraLine(sk), "Wields Spear \u00b7 Guards a chest");
  assert.equal(statusLine(sk), "Stunned, Burning");
  assert.equal(hpText(822, 1370), "822 / 1370");
  assert.equal(detailLines(sk).hp, "822 / 1370");
  const champion = packAffixes(["risen", "siege"]);
  const ch = detailLines(monsterInfo(mob({ kind: "skeleton", title: "Morgrul", champion }), ctx));
  assert.deepEqual(ch.affixes.map((a) => a.text).sort(), [AFFIXES.risen.text, AFFIXES.siege.text].sort());
  assert.equal(affinityLine(monsterInfo(mob({ kind: "nothing" }), ctx)), "");
});

test("the Songweaver sound hint is in the details for a Songweaver only", () => {
  const sw = monsterInfo(mob({ kind: "skeleton" }), { ...ctx, myClass: "songweaver" });
  assert.equal(detailLines(sw).hint, hintFor("skeleton"));
  assert.ok(detailLines(sw).hint.length > 10);
  assert.equal(detailLines(monsterInfo(mob({ kind: "skeleton" }), { ...ctx, myClass: "wizard" })).hint, "");
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

const base = { hovered: false, targeted: false, now: 10_000, dead: false, hidden: false, ownSummon: false, damaged: false };
test("showWorldBar: damaged, hovered, targeted or recently hit by me / my group; none at full health", () => {
  assert.equal(showWorldBar(base), false);
  assert.equal(showWorldBar({ ...base, hovered: true }), true);
  assert.equal(showWorldBar({ ...base, targeted: true }), true);
  assert.equal(showWorldBar({ ...base, lastMineHitAt: 10_000 - (RECENT_HIT_MS - 100) }), true, "3.9 s after my hit");
  assert.equal(showWorldBar({ ...base, lastMineHitAt: 10_000 - (RECENT_HIT_MS + 100) }), false, "4.1 s after my hit");
  assert.equal(showWorldBar({ ...base, ownSummon: true }), true);
  assert.equal(showWorldBar({ ...base, ownSummon: true, dead: true }), false);
  assert.equal(showWorldBar({ ...base, hovered: true, hidden: true }), false);
  assert.equal(showWorldBar({ ...base, damaged: true }), true, "any damaged monster, whoever hurt it");
  assert.equal(showWorldBar({ ...base, damaged: true, dead: true }), false);
});

test("isMineOrGroup: a missing 'by' is not mine", () => {
  const group = new Set(["g1"]);
  assert.equal(isMineOrGroup("me", "me", group), true);
  assert.equal(isMineOrGroup("g1", "me", group), true);
  assert.equal(isMineOrGroup("stranger", "me", group), false);
  assert.equal(isMineOrGroup(undefined, "me", group), false);
  assert.equal(isMineOrGroup("", "me", group), false);
});

test("altBlocks: while Alt is held, game keys stay away from the browser, but not Enter, Tab, F-keys or chat typing", () => {
  const k = (key: string, o: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) => ({ key, altKey: true, ctrlKey: false, metaKey: false, ...o });
  for (const key of ["d", "D", "ArrowLeft", "f", "1", " ", "Home"]) assert.equal(altBlocks(k(key), null), true, key);
  for (const key of ["Enter", "Tab", "Escape", "F4", "F11", "Alt", "AltGraph"]) assert.equal(altBlocks(k(key), null), false, key);
  assert.equal(altBlocks(k("d", { altKey: false }), null), false, "no Alt");
  assert.equal(altBlocks(k("d", { ctrlKey: true }), null), false, "Ctrl+Alt (AltGr on some layouts)");
  assert.equal(altBlocks(k("d"), { tagName: "INPUT" }), false, "typing in chat");
});
