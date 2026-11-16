import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAN_KEYS } from "../shared/war/clans";
import { HOLD_TIER, holdGrew, holdTier, holdTiers } from "../shared/war/holdTiers";
import { viewTier } from "../shared/war/intel";
import { newWar, sackHold, targetsOf, WAR, warTick, type WarState } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { warView } from "../shared/war/view";

/** A land that is nobody's capital, and a capital held by its clan, in a fresh war. */
const plain = TERRITORIES.find((t) => !t.capitalOf)!.id;
const capital = TERRITORIES.find((t) => t.capitalOf)!.id;
const at = (s: WarState, t: number, fort: number, control: number) => { s.fort[t] = fort; s.control[t] = control; return holdTier(s, t); };

test("hold tiers: outpost, camp and fortress by built-up time (fort) and Control", () => {
  const s = newWar();
  assert.equal(at(s, plain, 0, 100), 0, "a new Hold is an outpost");
  assert.equal(at(s, plain, 0.19, 100), 0);
  assert.equal(at(s, plain, 0.2, 100), 1, "fort 0.2: a camp");
  assert.equal(at(s, plain, 0.3, 100), 1);
  assert.equal(at(s, plain, 0.6, 100), 2, "fort 0.6: a fortress");
  assert.equal(at(s, plain, 0.7, 100), 2);
  assert.equal(at(s, plain, 2, 100), 2, "the Wardens build to 2");
  // a shaken land shrinks through the Control gates
  assert.equal(at(s, plain, 0.7, 50), 2);
  assert.equal(at(s, plain, 0.7, 45), 1, "a fortress at Control 45 shows a camp");
  assert.equal(at(s, plain, 0.7, WAR.siegeAt + 1), 1);
  assert.equal(at(s, plain, 0.7, WAR.siegeAt), 0, "at the siege line: an outpost");
  assert.equal(at(s, plain, 0.3, 10), 0);
  assert.equal(HOLD_TIER.camp.control, WAR.siegeAt);
  // junk reads as nothing built
  assert.equal(at(s, plain, NaN, 100), 0);
  assert.equal(holdTier({ owner: [], fort: [], control: [] }, 0), 0, "no holder: an outpost");
});

test("hold tiers: a clan's capital is always a fortress, even fresh and shaken", () => {
  const s = newWar();
  assert.equal(s.owner[capital], TERRITORIES[capital].capitalOf);
  assert.equal(at(s, capital, 0, 100), 2);
  assert.equal(at(s, capital, 0, 5), 2);
  s.owner[capital] = CLAN_KEYS.find((k) => k !== TERRITORIES[capital].capitalOf)!;
  assert.equal(at(s, capital, 0, 100), 0, "someone else's capital is an ordinary land");
});

test("hold tiers: a flip resets the Hold to an outpost; quiet ticks grow it back; a sack cuts the works", () => {
  const s = newWar();
  // quiet ticks (nobody attacks): every land's fort grows WAR.fortGrow a tick, the Wardens' twice as fast
  for (let i = 0; i < 20; i++) warTick(s, {});
  const nonWarden = TERRITORIES.find((t) => !t.capitalOf && s.owner[t.id] !== "wardens")!.id;
  const warden = TERRITORIES.find((t) => !t.capitalOf && s.owner[t.id] === "wardens")!.id;
  assert.equal(holdTier(s, nonWarden), 1, "20 quiet ticks (3 h 20 min): a camp");
  for (let i = 0; i < 10; i++) warTick(s, {});
  assert.equal(holdTier(s, warden), 2, "the Wardens: a fortress in 30 quiet ticks (5 h)");
  assert.equal(holdTier(s, nonWarden), 1);
  for (let i = 0; i < 30; i++) warTick(s, {});
  assert.equal(holdTier(s, nonWarden), 2, "60 quiet ticks (10 h): a fortress");
  // the war's own flip sets fort to 0 (rules.ts warTick): the new holder starts with an outpost
  const before = { owner: [...s.owner], fort: [...s.fort], control: [...s.control] };
  s.owner[nonWarden] = CLAN_KEYS.find((k) => k !== s.owner[nonWarden])!; s.fort[nonWarden] = 0; s.control[nonWarden] = 60;
  assert.equal(holdTier(s, nonWarden), 0);
  assert.equal(holdGrew(before, s, nonWarden), undefined, "a flip is no growth");
  // a sack takes WAR.sackFort off the works (half for an unsworn hero) and WAR.sackControl off the grip
  const t2 = TERRITORIES.find((t) => !t.capitalOf && TERRITORIES[t.id].near.some((n) => s.owner[n] !== s.owner[t.id]))!.id;
  const foe = CLAN_KEYS.find((k) => k !== s.owner[t2] && targetsOf(s, k).includes(t2))!;
  const f0 = s.fort[t2];
  sackHold(s, t2, foe, false);
  assert.ok(Math.abs(s.fort[t2] - Math.max(0, f0 - WAR.sackFort)) < 1e-9, "a sack cuts the fort");
  const f1 = s.fort[t2];
  sackHold(s, t2, undefined, true);
  assert.ok(Math.abs(s.fort[t2] - Math.max(0, f1 - WAR.sackFort / 2)) < 1e-9, "an unsworn sack cuts half");
  assert.ok(WAR.sackFort > 0 && WAR.sackFort <= 0.1);
});

test("hold tiers: the Herald hears of growth only when the works cross a tier (not when Control comes back)", () => {
  const a = newWar(), b = newWar();
  a.fort[plain] = 0.19; b.fort[plain] = 0.2;
  assert.equal(holdGrew(a, b, plain), 1, "outpost -> camp");
  a.fort[plain] = 0.59; b.fort[plain] = 0.6;
  assert.equal(holdGrew(a, b, plain), 2, "camp -> fortress");
  a.fort[plain] = 0.6; b.fort[plain] = 0.61;
  assert.equal(holdGrew(a, b, plain), undefined, "no change");
  // a fortress whose Control climbs back over 50: no news
  a.fort[plain] = 0.8; a.control[plain] = 49; b.fort[plain] = 0.81; b.control[plain] = 50;
  assert.equal(holdTier(a, plain), 1); assert.equal(holdTier(b, plain), 2);
  assert.equal(holdGrew(a, b, plain), undefined);
  // works crossing while a siege holds Control down: not grown
  a.fort[plain] = 0.19; a.control[plain] = 20; b.fort[plain] = 0.2; b.control[plain] = 21;
  assert.equal(holdGrew(a, b, plain), undefined);
  assert.equal(holdGrew(a, a, capital), undefined, "a capital never grows");
});

test("hold tiers: WarView.tier has one tier (0..2) per land, matching holdTiers; older snapshots read as camps", () => {
  const s = newWar();
  s.fort[plain] = 0.3;
  const v = warView(s, 0);
  assert.equal(v.tier!.length, TERRITORIES.length);
  assert.ok(v.tier!.every((x) => x === 0 || x === 1 || x === 2));
  assert.deepEqual(v.tier, holdTiers(s));
  assert.equal(v.tier![plain], 1);
  assert.equal(v.tier![capital], 2);
  assert.equal(viewTier(v, plain), 1);
  assert.equal(viewTier({}, plain), 1, "no tiers: a camp");
  assert.equal(viewTier({ tier: [7] }, 0), 1, "junk: a camp");
});
