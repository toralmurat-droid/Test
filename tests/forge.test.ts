// The Forge (roadmap M4, shared/forge.ts): recipes, budgets, forged item ids and the gear registry hook.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyVariant, defFromRecipe, FORGE, FORGE_IMPLICIT_KEYS, FORGE_MOB_BAND, FORGE_MOB_BASES, FORGE_PALETTES, FORGE_WEAPON_BASES, forgedGearDef,
  forgedGearId, forgedMobId, forgeLookup, forgeMobAffixes, forgeTier, implicitMax, itemPower, mobPower, parseForgedMobId, TOP_WEAPON_POWER,
  validateRecipe, weaponCap, type ForgeErrorCode, type MonsterRecipe, type WeaponRecipe,
} from "../shared/forge";
import {
  baseId, clearGearCache, GEAR, GEAR_IDS, gearDef, gearName, isGearId, itemAffixes, itemLevel, itemRarity, itemRunes, parseForgedGearId, plainId,
  setForgedGear, socketsOf, stripRunes, weaponType, withAffixes, withLevel, withRunes, type ForgedGearInfo,
} from "../shared/gear";
import { BOSS, ELITE, MOBS } from "../shared/constants";
import { isSummonKind } from "../shared/summons";

const sword: WeaponRecipe = { kind: "weapon", clan: "redfang", name: "Fang of Rourke", base: "ws_bastard", implicit: [{ key: "atk", value: 2 }, { key: "str", value: 1 }], palette: "redfang" };
const beast: MonsterRecipe = { kind: "monster", clan: "hidekin", name: "Gore-Sewn Tusker", base: "tuskborn", affixes: ["stitched"], hp: 1.2, dmg: 1.1, speed: 1, palette: "hidekin" };
const codes = (raw: unknown): ForgeErrorCode[] => { const c = validateRecipe(raw); return c.ok ? [] : c.errors.map((e) => e.code); };

test("existing gear ids behave exactly as before with a forge registry plugged in", () => {
  const ids = [...GEAR_IDS, "w_frost@17", "w_frost@17~R:atk3,sta4,dex2", "w_frost@17~R:atk3,sta4,dex2^ember2", "ws_bastard@30~M:atk3", "songweaver_weapon@12", "bk_hymnal@9"];
  const before = ids.map((id) => [isGearId(id), JSON.stringify(gearDef(id)), gearName(id, "vampire"), weaponType("wizard", id), socketsOf(id)]);
  const prev = setForgedGear(forgeLookup([defFromRecipe(sword, 3)]));
  try {
    assert.deepEqual(ids.map((id) => [isGearId(id), JSON.stringify(gearDef(id)), gearName(id, "vampire"), weaponType("wizard", id), socketsOf(id)]), before);
  } finally { setForgedGear(prev); }
});

test("forged item ids round-trip with level, affixes and runes", () => {
  const head = forgedGearId(12, "ws_bastard");
  assert.equal(head, "fg12_ws_bastard");
  const lv = withLevel(head, 30), full = withRunes(withAffixes(lv, 2, [{ key: "atk", value: 3 }, { key: "sta", value: 4 }, { key: "dex", value: 2 }]), [{ key: "ember", rank: 2 }]);
  assert.equal(lv, "fg12_ws_bastard@30");
  assert.equal(full, "fg12_ws_bastard@30~R:atk3,sta4,dex2^ember2");
  assert.equal(baseId(full), head);
  assert.equal(plainId(full), lv);
  assert.equal(stripRunes(full), "fg12_ws_bastard@30~R:atk3,sta4,dex2");
  assert.equal(itemLevel(full), 30);
  assert.equal(itemRarity(full), 2);
  assert.deepEqual(itemAffixes(full).map((a) => a.key), ["atk", "sta", "dex"]);
  assert.deepEqual(itemRunes(full), [{ key: "ember", rank: 2 }]);
  assert.deepEqual(parseForgedGearId(full), { seq: 12, base: "ws_bastard" });
  for (const id of [head, lv, full]) assert.ok(isGearId(id), id);
  assert.equal(socketsOf(full), 2);
});

test("isGearId rejects malformed forged ids", () => {
  for (const bad of ["fg0_ws_bastard", "fg012_ws_bastard", "fg12.ws_bastard", "fg12_", "fg_ws_bastard", "fg12_nope", "fgx_ws_bastard",
    "fg12_w_bronze", "fg12_songweaver_weapon", "fg12_bk_hymnal", "fg12_a_royal", "fg12_knight_weapon", "fg12_ws_bastard@30~R:atk3"]) assert.equal(isGearId(bad), false, bad);
});

test("unknown forgings are 'Forgotten' base weapons; retired keep their stats, revoked fall back to the base", () => {
  setForgedGear(undefined);
  const d = gearDef("fg7_ws_bastard")!;
  assert.equal(d.name, "Forgotten Sword");
  assert.deepEqual(d.bonus, GEAR.ws_bastard.bonus);
  assert.equal(gearName("fg7_ws_bastard", "vampire"), "Forgotten Sword");
  assert.equal(weaponType("wizard", "fg7_ww_bone"), "wand");
  assert.equal(gearDef("fg7_wb_thorn")!.name, "Forgotten Bow");
  const w = defFromRecipe(sword, 7);
  const info: ForgedGearInfo = forgeLookup([w])(7)!;
  try {
    setForgedGear((seq) => (seq === 7 ? info : undefined));
    assert.equal(gearDef("fg7_ws_bastard")!.name, "Fang of Rourke");
    assert.deepEqual(gearDef("fg7_ws_bastard")!.bonus, { atk: 6, sta: 1, str: 1 });
    assert.deepEqual(gearDef("fg7_ws_bastard"), forgedGearDef(w));
    assert.equal(gearDef("fg7_ws_bastard")!.color, FORGE_PALETTES.redfang.color);
    assert.equal(gearDef("fg7_ww_bone")!.name, "Forgotten Wand", "the id's base must match the forging's");
    assert.equal(gearDef("fg8_ws_bastard")!.name, "Forgotten Sword");
    assert.ok(gearDef("fg7_ws_bastard@30")!.bonus.atk! > 6, "built-ins grow with the item level like the base bonus");
    info.status = "retired"; clearGearCache();
    assert.deepEqual(gearDef("fg7_ws_bastard")!.bonus, { atk: 6, sta: 1, str: 1 });
    info.status = "revoked"; clearGearCache();
    assert.equal(gearDef("fg7_ws_bastard")!.name, "Fang of Rourke");
    assert.deepEqual(gearDef("fg7_ws_bastard")!.bonus, GEAR.ws_bastard.bonus);
  } finally { setForgedGear(undefined); }
  assert.equal(gearDef("fg7_ws_bastard")!.name, "Forgotten Sword", "setForgedGear clears the cache");
});

test("weapon bases, implicit keys and the power budget", () => {
  assert.ok(FORGE_WEAPON_BASES.length > 0);
  for (const id of FORGE_WEAPON_BASES) { const d = GEAR[id]; assert.ok(d.slot === "weapon" && d.wtype && !d.cls && !d.book, id); }
  assert.ok(!FORGE_WEAPON_BASES.includes("songweaver_weapon") && !FORGE_WEAPON_BASES.includes("w_bronze"));
  assert.deepEqual(FORGE_IMPLICIT_KEYS.sort(), ["atk", "cdm", "dex", "fdm", "hdm", "mag", "pdm", "sdm", "sta", "str"].sort());
  assert.equal(TOP_WEAPON_POWER, itemPower(GEAR.w_dragon));
  for (const id of ["w_dragon", "w_sky", "ww_star"]) assert.ok(Math.abs(itemPower(GEAR[id]) - TOP_WEAPON_POWER) < 1.2, `${id}: tier-3 weapons weigh about the same`);
  assert.equal(weaponCap(), FORGE.weaponBudget * TOP_WEAPON_POWER);
  assert.equal(forgeTier(itemPower(GEAR.ws_arming)), 1);
  assert.equal(forgeTier(itemPower(GEAR.w_frost)), 2);
  assert.equal(forgeTier(itemPower(GEAR.w_dragon)), 3);
  assert.equal(implicitMax("atk"), 3);
  assert.ok(validateRecipe(sword).ok);
  assert.deepEqual(codes({ ...sword, base: "ww_star", implicit: [{ key: "atk", value: 3 }, { key: "mag", value: 3 }, { key: "hdm", value: 3 }], elem: { el: "faith", share: 0.5 } }), ["over_budget"]);
});

test("validateRecipe names every problem", () => {
  assert.deepEqual(codes(null), ["not_object"]);
  assert.deepEqual(codes([]), ["not_object"]);
  assert.deepEqual(codes({ ...sword, kind: "armour" }), ["bad_kind"]);
  assert.deepEqual(codes({ ...sword, clan: "pirates" }), ["bad_clan"]);
  assert.deepEqual(codes({ ...sword, palette: "#ff0000" }), ["bad_palette"]);
  assert.deepEqual(codes({ ...sword, name: "   " }), ["name_missing"]);
  assert.deepEqual(codes({ ...sword, name: "x".repeat(33) }), ["name_too_long"]);
  assert.deepEqual(codes({ ...sword, name: "Fang <b>" }), ["name_chars"]);
  assert.deepEqual(codes({ ...sword, name: "Épée" }), ["name_chars"]);
  assert.deepEqual(codes({ ...sword, base: "nope" }), ["base_unknown"]);
  assert.deepEqual(codes({ ...sword, base: "w_bronze" }), ["base_not_forgeable"]);
  assert.deepEqual(codes({ ...sword, base: "songweaver_weapon" }), ["base_not_forgeable"]);
  assert.deepEqual(codes({ ...sword, base: "bk_hymnal" }), ["base_not_forgeable"]);
  assert.deepEqual(codes({ ...sword, elem: { el: "lava", share: 0.2 } }), ["elem_bad"]);
  assert.deepEqual(codes({ ...sword, elem: { el: "fire", share: 0.55 } }), ["elem_share"]);
  assert.deepEqual(codes({ ...sword, elem: { el: "fire", share: 0.33 } }), ["elem_share"]);
  assert.deepEqual(codes({ ...sword, elem: { el: "fire", share: 0 } }), ["elem_share"]);
  assert.deepEqual(codes({ ...sword, implicit: [] }), ["implicit_count"]);
  assert.deepEqual(codes({ ...sword, implicit: [1, 2, 3, 4] }), ["implicit_count"]);
  assert.deepEqual(codes({ ...sword, implicit: [{ key: "spd", value: 2 }] }), ["implicit_key"]);
  assert.deepEqual(codes({ ...sword, implicit: [{ key: "fre", value: 2 }] }), ["implicit_key"]);
  assert.deepEqual(codes({ ...sword, implicit: [{ key: "atk", value: 1 }, { key: "atk", value: 1 }] }), ["implicit_dup"]);
  assert.deepEqual(codes({ ...sword, implicit: [{ key: "atk", value: 4 }] }), ["implicit_value"]);
  assert.deepEqual(codes({ ...sword, implicit: [{ key: "atk", value: 1.5 }] }), ["implicit_value"]);
  assert.deepEqual(codes({ ...sword, level: 51 }), ["level_bad"]);
  // several problems at once are all reported
  assert.deepEqual(codes({ ...sword, clan: "x", palette: "y", name: "" }), ["bad_clan", "bad_palette", "name_missing"]);
  // monsters
  assert.ok(validateRecipe(beast).ok);
  assert.deepEqual(codes({ ...beast, base: "dragon" }), ["base_unknown"]);
  for (const b of ["hollowking", "necromancer", "golem_fire", "bride", "wisp", "trooper", "nightraider", "blobling"]) assert.deepEqual(codes({ ...beast, base: b, affixes: [] }), ["base_not_forgeable"], b);
  assert.deepEqual(codes({ ...beast, affixes: ["stitched", "stitched"] }), ["affix_dup"]);
  assert.deepEqual(codes({ ...beast, affixes: ["a", "b", "c"] }), ["affix_count"]);
  assert.deepEqual(codes({ ...beast, affixes: ["nope"] }), ["affix_key"]);
  assert.deepEqual(codes({ ...beast, affixes: ["gang"] }), ["affix_family"]);
  assert.deepEqual(codes({ ...beast, base: "boghag", affixes: ["risen"] }), ["affix_family"], "no family, no affixes (Act 3-6 kinds without one)");
  assert.deepEqual(codes({ ...beast, weapon: "sword" }), ["weapon_bad"]);
  assert.deepEqual(codes({ ...beast, base: "skeleton", affixes: [], weapon: "trebuchet" }), ["weapon_bad"]);
  assert.deepEqual(codes({ ...beast, base: "bandit", affixes: [], weapon: "lookout" }), ["weapon_bad"]);
  assert.ok(validateRecipe({ ...beast, base: "skeleton", affixes: ["risen"], weapon: "bow" }).ok);
  assert.deepEqual(codes({ ...beast, hp: "lots" }), ["mult_bad"]);
  assert.deepEqual(codes({ ...beast, hp: 1.7 }), ["mult_range"]);
  assert.deepEqual(codes({ ...beast, speed: 0.85 }), ["mult_range"]);
  assert.deepEqual(codes({ ...beast, dmg: Infinity }), ["mult_bad"]);
  assert.deepEqual(codes({ ...beast, hp: 1.6, dmg: 1.4, speed: 1.15 }), ["over_budget"]);
  // the name is folded and unknown fields dropped
  const c = validateRecipe({ ...beast, name: "  Gore-Sewn   Tusker ", extra: 1 });
  assert.ok(c.ok && c.recipe.name === "Gore-Sewn Tusker" && !("extra" in c.recipe));
});

test("monster bases are zone monsters with a level band; affixes come from the base's family", () => {
  assert.ok(FORGE_MOB_BASES.length > 20);
  for (const k of FORGE_MOB_BASES) {
    assert.ok(!ELITE[k] && !BOSS[k] && !isSummonKind(k) && k !== "trooper" && k !== "nightraider", k);
    const b = FORGE_MOB_BAND[k]!;
    assert.ok(b && b[0] >= 1 && b[1] >= b[0], k);
  }
  assert.deepEqual(forgeMobAffixes("skeleton"), ["siege", "risen"]);
  assert.deepEqual(forgeMobAffixes("boghag"), []);
});

test("mobPower, applyVariant and ids of forged monsters", () => {
  const v = defFromRecipe(beast, 4);
  assert.equal(v.id, "fm4");
  assert.equal(forgedMobId(4), "fm4");
  assert.equal(parseForgedMobId("fm4"), 4);
  for (const bad of ["fm0", "fm04", "fm", "fg4", "fm4x"]) assert.equal(parseForgedMobId(bad), undefined, bad);
  assert.deepEqual(v.mult, { hp: 1.2, dmg: 1.1, speed: 1 });
  assert.equal(mobPower(v), mobPower(beast));
  assert.ok(Math.abs(mobPower(v) - 1.2 * 1.1 * (1 + FORGE.affixCost.stitched)) < 1e-9);
  assert.equal(mobPower({ hp: 1, dmg: 1, speed: 1, affixes: [] }), 1);
  assert.ok(Math.abs(mobPower({ hp: 1, dmg: 1, speed: 1, affixes: ["siege", "risen"] }) - (1 + FORGE.affixCost.siege + FORGE.affixCost.risen + FORGE.affixPair)) < 1e-9);
  const d = MOBS.tuskborn, a = applyVariant(d, v);
  assert.equal(a.name, "Gore-Sewn Tusker");
  assert.equal(a.maxHp, Math.round(d.maxHp * 1.2));
  assert.ok(Math.abs(a.damage - d.damage * 1.1) < 0.051);
  assert.equal(a.speed, d.speed);
  assert.equal(a.xp, Math.round(d.xp * mobPower(v)));
  assert.equal(a.attackCooldownMs, d.attackCooldownMs);
  assert.notEqual(a, d);
  assert.equal(MOBS.tuskborn.maxHp, d.maxHp, "the table is never touched");
});

test("defFromRecipe copies the recipe and gives forged weapons their item id", () => {
  const w = defFromRecipe({ ...sword, elem: { el: "fire", share: 0.25 } }, 12);
  assert.equal(w.id, "fg12_ws_bastard");
  assert.equal(w.status, "active");
  assert.equal(w.seq, 12);
  assert.notEqual(w.implicit, sword.implicit);
  const def = forgedGearDef(w);
  assert.equal(def.wtype, "sword");
  assert.deepEqual(def.elem, { el: "fire", share: 0.25 });
  assert.equal(def.tier, forgeTier(itemPower(def)));
  assert.deepEqual(forgedGearDef(defFromRecipe(sword, 1)).elem, GEAR.ws_bastard.elem, "no elem: the base's stays");
});

test("FORGE records the owner's defaults", () => {
  assert.equal(FORGE.researchDays, 1);
  assert.ok(FORGE.armyCost > 0 && FORGE.armyCost < 1);
  assert.equal(FORGE.mobsIn, "lands");
});
