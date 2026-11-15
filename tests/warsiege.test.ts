import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { isSafeZone, isSolidAt } from "../shared/map";
import { CLAN_KEYS } from "../shared/war/clans";
import { patrolOf, troopShare } from "../shared/war/patrols";
import { newWar } from "../shared/war/rules";
import { attackAxis, frontPay, frontStep, SIEGE_BATTLE, siegeApproach, siegeForce, siegeFronts, type FrontHold } from "../shared/war/siege";
import { STANDARDS } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { WAR_TROOPS } from "../shared/war/troops";

test("siege fronts: every standard on the land's loop plus the Hold gate (last, doubled for valor), the same every time", () => {
  for (const t of TERRITORIES) {
    const p = patrolOf(t.id), f = siegeFronts(t.id);
    if (!p) { assert.equal(f.length, 0); continue; }
    assert.deepEqual(f, siegeFronts(t.id), "deterministic");
    assert.equal(f.length, p.stops.length, `${t.name}: standards + gate`);
    assert.equal(f.filter((x) => x.gate).length, 1);
    const g = f[f.length - 1];
    assert.ok(g.gate && g.x === p.pts[0].x && g.y === p.pts[0].y && g.arc === 0, "the gate is the loop's start");
    for (const s of f.slice(0, -1)) assert.ok(STANDARDS.some((x) => x.t === t.id && Math.hypot(x.x - s.x, x.y - s.y) < 1), `${t.name}: a front at each standard`);
  }
});

test("siege approach: inside the land, on walkable ground off the safe squares, toward the attacker's nearest land", () => {
  const s = newWar();
  let tried = 0;
  for (const t of TERRITORIES) {
    const atk = CLAN_KEYS.find((k) => k !== s.owner[t.id] && t.near.some((n) => s.owner[n] === k));
    if (!atk || !patrolOf(t.id)) continue;
    const ax = attackAxis(s.owner, t.id, atk)!;
    assert.ok(ax && Math.abs(Math.hypot(ax.x, ax.y) - 1) < 1e-9, "a unit axis");
    const a = siegeApproach(t.id, ax)!;
    assert.ok(a, `${t.name}: an approach`);
    const tx = a.x / TILE, ty = a.y / TILE;
    assert.ok(tx >= t.x && ty >= t.y && tx < t.x + t.w && ty < t.y + t.h, `${t.name}: inside the land`);
    assert.ok(!isSolidAt(a.x, a.y) && !isSafeZone(a.x, a.y), `${t.name}: walkable`);
    assert.ok(a.arc >= 0 && a.arc <= patrolOf(t.id)!.len, "on the loop");
    // on the attacker's side of the land's middle (when the loop reaches that side at all)
    const cx = (t.x + t.w / 2) * TILE, cy = (t.y + t.h / 2) * TILE, opp = siegeApproach(t.id, { x: -ax.x, y: -ax.y })!;
    assert.ok((a.x - cx) * ax.x + (a.y - cy) * ax.y >= (opp.x - cx) * ax.x + (opp.y - cy) * ax.y - 1e-6, `${t.name}: facing the attacker`);
    tried++;
  }
  assert.ok(tried > 10);
  assert.equal(attackAxis(s.owner.map(() => "wardens"), 0, "redfang"), undefined, "an attacker with no land: no axis");
});

test("siege force: attackers perFront, defenders by Control (at least defMin), always within the budget and maxSiegeTroops", () => {
  const S = SIEGE_BATTLE;
  assert.deepEqual(siegeForce(3, 100, 80), { atk: S.perFront, def: S.perFront });
  assert.equal(siegeForce(3, 0, 80).def, Math.max(S.defMin, Math.round(S.perFront * troopShare(0))));
  assert.ok(siegeForce(1, 0, 80).def >= S.defMin);
  for (const n of [1, 2, 3, 4]) for (const c of [0, 25, 60, 100]) for (const b of [0, 3, 7, 12, 20, 28, 80, WAR_TROOPS.maxTroops]) {
    const f = siegeForce(n, c, b);
    assert.ok(n * (f.atk + f.def) <= Math.min(b, S.maxSiegeTroops), `n${n} c${c} b${b}`);
    assert.ok(f.atk >= 0 && f.def >= 0);
  }
  assert.ok(3 * S.perFront * 2 <= S.maxSiegeTroops, "three full fronts fit the cap");
});

test("front hold: a lead of holdMargin must last captureMs straight; a short swing changes nothing", () => {
  const S = SIEGE_BATTLE, f: FrontHold = { holder: "def", since: 0 };
  let now = 0;
  // the attackers lead, but not for long enough, then it evens out: the clock starts over
  for (; now < S.captureMs - 2000; now += S.scoreMs) assert.equal(frontStep(f, 5, 2, now), false);
  assert.equal(frontStep(f, 3, 2, now), false, "a lead below holdMargin breaks the run");
  assert.equal(f.lead, undefined);
  now += S.scoreMs;
  const start = now;
  let flipped = false;
  for (; now <= start + S.captureMs + S.scoreMs && !flipped; now += S.scoreMs) flipped = frontStep(f, 4, 2, now);
  assert.ok(flipped, "a lead kept captureMs takes it");
  assert.equal(f.holder, "atk");
  assert.ok(now - S.scoreMs - start >= S.captureMs);
  // the holder leading changes nothing; nor does a tie
  assert.equal(frontStep(f, 6, 0, now), false);
  assert.equal(frontStep(f, 2, 2, now + 1e6), false);
  assert.equal(f.holder, "atk");
});

test("front pay: nothing without a sworn hero of the holder there; the gate pays double; the cap holds", () => {
  const S = SIEGE_BATTLE;
  assert.equal(frontPay(false, false, 0), 0, "troops alone earn nothing");
  assert.equal(frontPay(true, false, 0), 0);
  assert.equal(frontPay(false, true, 0), S.frontValor);
  assert.equal(frontPay(true, true, 0), S.frontValor * S.gateMult);
  assert.equal(frontPay(true, true, S.battleValorPerTick - 1), 1);
  assert.equal(frontPay(false, true, S.battleValorPerTick), 0);
});
