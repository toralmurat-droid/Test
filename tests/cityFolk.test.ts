import { test } from "node:test";
import assert from "node:assert/strict";
import { CITIES, cityAtPx, cityGates } from "../shared/capitals";
import { cityFolkPlan, folkFree, folkLine, inCityBox, routeAt, routeLength } from "../client/src/cityFolk";

test("every city has 30..40 people, and a post or route for each", () => {
  for (const c of CITIES) {
    const p = cityFolkPlan(c);
    const n = p.people.length;
    assert.ok(n >= 30 && n <= 40, `${c.clan}: ${n} people`);
    for (const q of p.people) assert.ok(q.spot || q.route, `${c.clan}: ${q.job} has nothing to do`);
    const by = (j: string) => p.people.filter((q) => q.job === j).length;
    assert.equal(by("patrol"), 4); assert.equal(by("recruit"), 3); assert.equal(by("keeper"), 4); assert.equal(by("shopper"), 6);
    assert.equal(by("warden"), 2 * (c.site ? cityGates(c).length : 1), "two at each gate"); assert.equal(by("crier"), 1); assert.equal(by("monk"), 2);
  }
});

test("every spot and starting place is walkable, clear of NPCs and inside its city", () => {
  for (const c of CITIES) {
    const p = cityFolkPlan(c);
    for (const s of p.spots) { assert.ok(folkFree(s.x, s.y), `${c.clan}: ${s.kind} spot ${s.x},${s.y}`); assert.equal(cityAtPx(s.x, s.y), c); }
    for (const q of p.people) assert.ok(folkFree(q.x, q.y), `${c.clan}: ${q.job} at ${q.x},${q.y}`);
  }
});

test("every route point is free and every leg is a clear line", () => {
  for (const c of CITIES) {
    const p = cityFolkPlan(c);
    for (const r of p.routes) {
      assert.ok(r.length >= 2);
      for (const [x, y] of r) { assert.ok(folkFree(x, y), `${c.clan}: route point ${x},${y}`); assert.equal(cityAtPx(x, y), c); }
      for (let i = 1; i < r.length; i++) assert.ok(folkLine(r[i - 1][0], r[i - 1][1], r[i][0], r[i][1]), `${c.clan}: leg ${r[i - 1]} -> ${r[i]}`);
    }
    for (const q of p.people) if (q.loop) { const r = q.route!; assert.ok(folkLine(r[r.length - 1][0], r[r.length - 1][1], r[0][0], r[0][1]), `${c.clan}: loop closing leg`); }
  }
});

test("walkers along a route and a loop stay on it", () => {
  const c = CITIES[0], p = cityFolkPlan(c), q = p.people.find((o) => o.loop)!;
  const len = routeLength(q.route!, true);
  for (let d = 0; d < len; d += 17) { const a = routeAt(q.route!, d, true); assert.ok(folkFree(a.x, a.y)); }
});

test("props keep out of a city in its land and two tiles round it", () => {
  assert.ok(inCityBox(41, 1, 2) && inCityBox(39, 0, 2) && inCityBox(94, 20, 2) && inCityBox(66, 42, 2));
  assert.ok(!inCityBox(38, 20, 2) && !inCityBox(66, 43, 2) && !inCityBox(95, 20, 2));
});
