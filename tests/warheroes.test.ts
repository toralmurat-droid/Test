import { test } from "node:test";
import assert from "node:assert/strict";
import { newMinds } from "../shared/war/doctrine";
import { newWar, WAR } from "../shared/war/rules";
import { heroValor, STANDARD, STANDARDS, standardAt } from "../shared/war/standards";
import { PORTAL_SPOTS } from "../shared/map";
import { targetsOf } from "../shared/war/rules";
import { CLAN_KEYS } from "../shared/war/clans";
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

test("standards keep clear of portal stones", () => {
  for (const s of STANDARDS) for (const p of PORTAL_SPOTS) assert.ok(Math.hypot(p.x - s.x / 32, p.y - s.y / 32) >= 5, `standard ${s.id} vs ${p.id}`);
});

test("presence: ten active minutes in an enemy ring attack it; idle, dead or wandering heroes add nothing", async () => {
  const t0 = 5_000_000_000_000, base = newWar();
  let k = CLAN_KEYS[0], std = STANDARDS[0];
  for (const c of CLAN_KEYS) { const s = STANDARDS.find((x) => targetsOf(base, c).includes(x.t) && !TERRITORIES[x.t].capitalOf); if (s) { k = c; std = s; break; } }
  const run = async (hero: (i: number) => WarHero) => {
    _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: t0, log: [] });
    const pr = new Presence();
    for (let i = 0; i < 600; i++) pr.tick([["a", hero(i)]], t0 - 600_000 + i * 1000);
    await step(t0);
    return warState()!.pressure[std.t]; // attack that reached the territory this tick
  };
  const active = (i: number): WarHero => ({ clan: k, clanAt: 0, dead: false, level: 1, x: std.x, y: std.y, lastAct: t0 - 600_000 + i * 1000 });
  const quiet = await run((i) => ({ ...active(i), clan: undefined }));
  assert.ok(await run(active) > quiet, "attacking valor reaches the territory");
  assert.equal(await run((i) => ({ ...active(i), lastAct: 0 })), quiet, "idle hero adds nothing");
  assert.equal(await run((i) => ({ ...active(i), dead: true })), quiet, "dead hero adds nothing");
  assert.equal(await run((i) => ({ ...active(i), x: i % 60 === 59 ? std.x : 0 })), quiet, "a second in the ring per minute is not a minute");
  assert.ok(heroValor(50, std.t) < heroValor(1, std.t), "far over-levelled heroes bring less");
  assert.ok(WAR.valorPerAdd >= STANDARD.valorPerMin);
});

test("holds: one per territory, on free ground inside it", async () => {
  const { HOLDS } = await import("../shared/war/standards");
  assert.equal(HOLDS.length, TERRITORIES.length);
  for (const h of HOLDS) {
    const t = TERRITORIES[h.t];
    assert.ok(h.x / 32 >= t.x && h.x / 32 < t.x + t.w && h.y / 32 >= t.y && h.y / 32 < t.y + t.h, t.name);
    assert.ok(!isSolidAt(h.x, h.y), `${t.name} hold walkable`);
    for (const s of STANDARDS.filter((x) => x.t === h.t)) assert.ok(Math.hypot(s.x - h.x, s.y - h.y) > STANDARD.range + 2 * 32, `${t.name} hold clear of standard ${s.id}`);
  }
});
