import { test } from "node:test";
import assert from "node:assert/strict";
import { dayFrac } from "../shared/daynight";
import { patrolOf, patrolPos } from "../shared/war/patrols";
import { SIEGE_BATTLE, siegeForce } from "../shared/war/siege";
import { TERRITORIES } from "../shared/war/territories";
import { troopStats } from "../shared/war/troops";
import { warPhase } from "../shared/war/view";
import { ramBlocked, ramHp, ramPos, ramSpeed, ramStep, SIEGE_WORKS } from "../shared/war/works";

const LOOP = patrolOf(TERRITORIES.find((t) => patrolOf(t.id))!.id)!;

test("works: ramPos follows the land's patrol loop", () => {
  for (const d of [0, 37, LOOP.len / 2, LOOP.len - 1]) assert.deepEqual(ramPos(LOOP, d), patrolPos(LOOP, d));
});

test("works: ramStep rolls the shorter way round to the gate and stops there", () => {
  const L = 1000;
  let r = ramStep(300, 0, L, 20, 1, false);
  assert.deepEqual(r, { d: 280, dir: -1, arrived: false }, "back down the loop (300 < 500)");
  r = ramStep(800, 0, L, 20, 1, false);
  assert.deepEqual(r, { d: 820, dir: 1, arrived: false }, "forward over the end (200 to go)");
  r = ramStep(10, 0, L, 20, 1, false);
  assert.deepEqual(r, { d: 0, dir: -1, arrived: true }, "arrives without overshooting");
  assert.equal(ramStep(0, 0, L, 20, 1, false).arrived, true, "at the gate it stays");
  // a whole trip at a fixed step lands exactly on the gate
  let d = 448, n = 0;
  for (; n < 1000; n++) { const s = ramStep(d, 0, L, SIEGE_WORKS.daySpeed, 0.05, false); d = s.d; if (s.arrived) break; }
  assert.equal(d, 0);
  assert.ok(Math.abs(n * 0.05 - 448 / SIEGE_WORKS.daySpeed) < 0.2, "takes distance / speed");
});

test("works: night is faster than day (warPhase 2)", () => {
  assert.ok(SIEGE_WORKS.nightSpeed > SIEGE_WORKS.daySpeed);
  let day = -1, night = -1;
  for (let t = 0; t < 2 * 3600_000 && (day < 0 || night < 0); t += 10_000) { if (warPhase(t) === 0 && day < 0) day = t; if (warPhase(t) === 2 && night < 0) night = t; }
  assert.ok(day >= 0 && night >= 0, `phases found (dayFrac ${dayFrac(0)})`);
  assert.equal(ramSpeed(day), SIEGE_WORKS.daySpeed);
  assert.equal(ramSpeed(night), SIEGE_WORKS.nightSpeed);
  const a = ramStep(500, 0, 2000, ramSpeed(day), 1, false), b = ramStep(500, 0, 2000, ramSpeed(night), 1, false);
  assert.ok(500 - b.d > 500 - a.d, "covers more ground at night");
});

test("works: blocked while a defender stands within blockPx; held, the ram does not move", () => {
  const B = SIEGE_WORKS.blockPx;
  assert.equal(ramBlocked(100, 100, [{ x: 100 + B - 1, y: 100 }]), true);
  assert.equal(ramBlocked(100, 100, [{ x: 100 + B * 0.8, y: 100 + B * 0.8 }]), false, "round, not square");
  assert.equal(ramBlocked(100, 100, [{ x: 100 + B + 1, y: 100 }]), false);
  assert.equal(ramBlocked(100, 100, []), false);
  assert.deepEqual(ramStep(300, 0, 1000, 20, 1, true), { d: 300, dir: 0, arrived: false }, "held");
});

test("works: the ram's HP is the soldier's x ramHp, and its places come out of the siege's share", () => {
  for (const lv of [10, 30, 45]) assert.equal(ramHp("host", lv), Math.round(troopStats("host", lv).hp * SIEGE_WORKS.ramHp));
  const reserve = 1 + SIEGE_WORKS.crew;
  for (const budget of [SIEGE_BATTLE.maxSiegeTroops, 20, 12, 5]) for (const fronts of [2, 3]) {
    const f = siegeForce(fronts, 60, budget, reserve), room = Math.min(SIEGE_BATTLE.maxSiegeTroops, budget);
    assert.ok(fronts * (f.atk + f.def) + reserve <= Math.max(room, reserve), `budget ${budget}, ${fronts} fronts`);
  }
  assert.deepEqual(siegeForce(3, 60, 28, 0), siegeForce(3, 60, 28), "no reserve: unchanged");
});
