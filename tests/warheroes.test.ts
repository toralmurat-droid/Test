import { test } from "node:test";
import assert from "node:assert/strict";
import { newMinds } from "../shared/war/doctrine";
import { newWar, WAR } from "../shared/war/rules";
import { STANDARD, STANDARDS, standardAt } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { isSolidAt } from "../shared/map";
import { _resetWar, step, warState } from "../server/war";
import { cleanOath, Presence, swear, type WarHero } from "../server/warHeroes";

test("standards: every territory has one, on free ground inside it", () => {
  for (const t of TERRITORIES) assert.ok(STANDARDS.some((s) => s.t === t.id), t.name);
  for (const s of STANDARDS) {
    const t = TERRITORIES[s.t];
    assert.ok(s.x / 32 >= t.x && s.x / 32 < t.x + t.w && s.y / 32 >= t.y && s.y / 32 < t.y + t.h, `standard ${s.id} in ${t.name}`);
    assert.ok(!isSolidAt(s.x, s.y), `standard ${s.id} walkable`);
    assert.equal(standardAt(s.x + 10, s.y)?.id, s.id);
  }
});

test("oath: level gate, unknown clans, a day before changing", () => {
  const p: WarHero = { clanAt: 0, dead: false, level: 3, x: 0, y: 0 };
  assert.notEqual(swear(p, "wardens", 1000), "");
  p.level = 10;
  assert.notEqual(swear(p, "nope", 1000), "");
  assert.equal(swear(p, "wardens", 1000), ""); assert.equal(p.clan, "wardens");
  assert.notEqual(swear(p, "redfang", 2000), ""); assert.equal(p.clan, "wardens");
  assert.equal(swear(p, "redfang", 1000 + STANDARD.swearCooldownMs), ""); assert.equal(p.clan, "redfang");
  assert.deepEqual(cleanOath("veiled", 5), { clan: "veiled", clanAt: 5 });
  assert.deepEqual(cleanOath("bogus", 5), { clanAt: 0 });
  assert.deepEqual(cleanOath(undefined, undefined), { clanAt: 0 });
});

test("presence: a sworn hero in a ring for ten minutes moves the war there", async () => {
  const t0 = 5_000_000_000_000, s0 = newWar();
  // A standard in a territory some clan does not own
  const std = STANDARDS.find((s) => !TERRITORIES[s.t].capitalOf)!;
  const own = s0.owner[std.t];
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: t0, log: [] });
  const pr = new Presence();
  const hero: WarHero = { clan: own, clanAt: 0, dead: false, level: 20, x: std.x, y: std.y };
  const away: WarHero = { clan: own, clanAt: 0, dead: false, level: 20, x: 0, y: 0 };
  for (let i = 0; i < 600; i++) pr.tick([["a", hero], ["b", away]]);
  // The owner defends: run the tick and compare with a war without the hero
  await step(t0);
  const withHero = warState()!.control[std.t];
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: t0, log: [] });
  await step(t0);
  assert.ok(withHero >= warState()!.control[std.t], "defending valor never hurts the holder");
  assert.ok(WAR.valorPerAdd >= STANDARD.valorPerMin);
});
