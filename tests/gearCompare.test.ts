import { test } from "node:test";
import assert from "node:assert/strict";
import { cardPlace, cardWidth, compareItem, compareTakeOff, signed } from "../client/src/gearCompare";
import { heroSheet, wearing } from "../shared/heroSheet";
import type { SheetHero } from "../shared/heroSheet";
import type { Equipped } from "../shared/gear";

const hero = (cls: any = "wizard", level = 30): SheetHero => ({ cls, level, pts: { sta: 10, str: 10, mag: 20, dex: 10 }, talents: {} });
const worn: Equipped = { weapon: "wizard_weapon", armour: "wizard_armour" } as Equipped;

test("signed: sign, rounding, zero", () => {
  assert.equal(signed(6), "+6");
  assert.equal(signed(-0.24, 1), "-0.2");
  assert.equal(signed(0.04, 1), "0.0");
  assert.equal(signed(0), "0");
});

test("compare: lines are exactly the sheet differences, green when better", () => {
  const h = hero(), id = "a_royal@20";
  const c = compareItem(h, { ...worn, armour: undefined } as Equipped, id)!;
  assert.ok(c); assert.equal(c.current, ""); assert.equal(c.slot, "armour");
  const a = heroSheet(h, { weapon: worn.weapon } as Equipped), b = heroSheet(h, { weapon: worn.weapon, armour: id } as Equipped, h.talents, true);
  const hp = c.lines.find((l) => l.label === "Health")!;
  assert.equal(hp.text, `+${b.hp - a.hp}`);
  assert.ok(hp.good);
  const fire = c.lines.find((l) => l.label === "Fire resistance")!;
  assert.ok(fire && fire.good && fire.text.endsWith("%"));
});

test("compare: a worse item shows red lines with a minus", () => {
  const h = hero();
  const c = compareItem(h, { ...worn, armour: "a_royal@20" } as Equipped, "wizard_armour")!;
  const bad = c.lines.filter((l) => !l.good);
  assert.ok(bad.length > 0);
  for (const l of bad) assert.ok(l.text.startsWith("-"), l.text);
});

test("compare: the same item changes nothing", () => {
  const h = hero(), w = { ...worn, armour: "a_royal@20" } as Equipped;
  assert.deepEqual(compareItem(h, w, "a_royal@20")!.lines, []);
});

test("compare: attack speed in hits per second, sword vs staff", () => {
  const h = hero("knight");
  const c = compareItem(h, { weapon: "knight_weapon" } as Equipped, "w_bronze");
  assert.ok(c);
  for (const l of c!.lines.filter((x) => x.label === "Attack speed")) assert.match(l.text, /^[+-]\d\.\d hits\/s$/);
});

test("compare: not an item, or a class that can't wear it", () => {
  assert.equal(compareItem(hero(), worn, "nonsense"), null);
  assert.equal(compareItem(hero("songweaver"), {} as Equipped, "w_bronze"), null);
});

test("compare: wearing() is applied in the item's own slot (no shield slot clash)", () => {
  const w = wearing(worn, "a_royal@20");
  assert.equal(w.weapon, worn.weapon);
  assert.equal(w.armour, "a_royal@20");
});

test("cardPlace: left of the panel, aligned, clamped on screen", () => {
  assert.deepEqual(cardPlace({ top: 300 }, 600, 320, 200, 1920, 1080), { left: 272, top: 300 });
  assert.equal(cardPlace({ top: 1000 }, 600, 320, 200, 1920, 1080).top, 876);
  assert.equal(cardPlace({ top: -50 }, 600, 320, 200, 1920, 1080).top, 4);
  assert.equal(cardPlace({ top: 10 }, 200, 320, 200, 1366, 768).left, 4);
});

test("cardWidth: shrinks to the room left of the panel, never below the minimum", () => {
  assert.equal(cardWidth(600), 320);
  assert.equal(cardWidth(294), 282);
  assert.equal(cardWidth(100), 240);
});

test("compare: swapping out the piece that enables the weapon switches the weapon off (requirement chain)", () => {
  const h: SheetHero = { cls: "wizard", level: 40, pts: { sta: 0, str: 0, mag: 0, dex: 0 }, talents: {} };
  const w = { weapon: "w_dragon@20", hat: "h_cap@20" } as Equipped;
  const now = heroSheet(h, w);
  assert.ok(now.atk > 0);
  const c = compareItem(h, w, "h_helm@1")!;
  const real = heroSheet(h, wearing(w, "h_helm@1"));
  assert.ok(real.atk < now.atk, "the server would switch the weapon off");
  const atk = c.lines.find((l) => l.label === "Attack")!;
  assert.equal(atk.text, String(real.atk - now.atk));
  assert.ok(!atk.good);
});

test("compare: Mana and Damage per second lines; take-off lists what you'd lose", () => {
  const h = hero();
  const c = compareItem(h, { weapon: "wizard_weapon" } as Equipped, "a_royal@20")!;
  assert.ok(c.lines.some((l) => l.label === "Mana" && l.text.startsWith("+")));
  assert.ok(c.lines.some((l) => l.label === "Damage per second" && l.good));
  const off = compareTakeOff(h, { ...worn, armour: "a_royal@20" } as Equipped, "armour");
  assert.ok(off.length > 0 && off.some((l) => !l.good));
});

test("cardPlace: a shop row keeps the card off the dialog (1366x768: dialog ends at 446, panel starts at 574)", () => {
  assert.equal(cardPlace({ top: 200 }, 574, 240, 300, 1366, 768, 8, 454).left, 454);
  assert.equal(cardPlace({ top: 200 }, 1000, 320, 300, 1920, 1080, 8, 454).left, 672); // room: unchanged
  assert.equal(cardPlace({ top: 200 }, 600, 320, 300, 1920, 1080).left, 272); // the bag case
});
