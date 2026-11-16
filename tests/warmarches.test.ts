import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds, scriptedOrders } from "../shared/war/doctrine";
import { arriveAt, clashLosses, COLUMN, columnPos, columnSize, columnTrip, marchesOf, marchMult, meetingOf, plansOf, type March } from "../shared/war/marches";
import { pathOfEntry, roadEntry, roadPairs, routePos, warPath } from "../shared/war/roads";
import { deployments, newWar, phaseOf, targetsOf, WAR, warTick, type WarState } from "../shared/war/rules";
import { tunnelStrikes } from "../shared/war/tunnels";
import { TERRITORIES } from "../shared/war/territories";

function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clone = (s: WarState): WarState => JSON.parse(JSON.stringify(s));

test("marches: warTick with deployments extracted plays exactly as before (golden over 50 seeded ticks, valor included)", () => {
  // The hash was taken with shared/war/rules.ts as it was before W4 (deployments inline in warTick)
  const s = newWar(), minds = newMinds(), rnd = mulberry(4242), pressure: number[] = [];
  for (let i = 0; i < 50; i++) {
    const o = scriptedOrders(s, minds, rnd);
    warTick(s, o, { valor: i % 7 === 3 ? s.owner.map((_, t) => (t % 5 === 0 ? { redfang: 12 } : {})) : undefined });
    pressure.push(s.pressure.reduce((a, b) => a + b, 0));
  }
  const json = JSON.stringify({ s, pressure }, (_k, v) => (typeof v === "number" ? Number(v.toFixed(6)) : v));
  let h = 2166136261;
  for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  assert.equal(h.toString(16), "6004e2da");
});

test("marches: deployments is pure and gives warTick's pressure; a march mult scales only that clan's army attack there", () => {
  const s = newWar(), minds = newMinds(), rnd = mulberry(7);
  for (let i = 0; i < 30; i++) warTick(s, scriptedOrders(s, minds, rnd));
  let checked = 0;
  for (let i = 0; i < 20; i++) {
    const o = scriptedOrders(s, minds, rnd), before = clone(s), d = deployments(s, o, phaseOf(s.tick));
    assert.deepEqual(s, before, "deployments never writes the state");
    const k = CLAN_KEYS.find((c) => Object.keys(o[c].attack).length && d.attack.some((a) => (a[c] ?? 0) > 0));
    const t = k ? d.attack.findIndex((a) => (a[k] ?? 0) > 0) : -1;
    const a = clone(s), b = clone(s), c = clone(s);
    warTick(a, o, {});
    warTick(c, o, { march: k ? [{ t, k, mult: 1 }] : [] });
    assert.deepEqual(c, a, "a mult of 1 changes nothing");
    if (k) {
      warTick(b, o, { march: [{ t, k, mult: 0.5 }, { t: -1, k, mult: 0 }, { t: 9999, k, mult: 0 }] });
      a.pressure.forEach((p, j) => { if (j !== t) assert.equal(b.pressure[j], p, "other lands untouched"); });
      assert.ok(b.pressure[t] < a.pressure[t], "the cut column's land takes less");
      checked++;
    }
    warTick(s, o);
  }
  assert.ok(checked > 10);
});

test("marches: columnSize grows with force, clamped; more force never fewer men", () => {
  let prev = 0;
  for (let f = 0; f <= 2000; f += 0.5) {
    const n = columnSize(f);
    assert.ok(n >= 1 + COLUMN.min && n <= 1 + COLUMN.max, `size ${n} at ${f}`);
    assert.ok(n >= prev, "monotonic");
    assert.ok(columnSize(2 * f) >= n, "twice the force");
    prev = n;
  }
  assert.equal(columnSize(NaN), 1 + COLUMN.min); assert.equal(columnSize(-5), 1 + COLUMN.min); assert.equal(columnSize(1e9), 1 + COLUMN.max);
});

test("marches: marchMult has its floor; clashLosses is bounded", () => {
  assert.equal(marchMult(8, 8), 1); assert.equal(marchMult(6, 8), 0.75); assert.equal(marchMult(0, 8), COLUMN.floor); assert.equal(marchMult(-3, 8), COLUMN.floor);
  assert.equal(marchMult(3, 0), 1);
  for (const [na, nb, fa, fb] of [[8, 8, 100, 100], [3, 8, 10, 500], [8, 3, 500, 10], [5, 5, 0, 0], [0, 7, 50, 50], [8, 8, -5, 50]]) {
    const [la, lb] = clashLosses(na, nb, fa, fb);
    assert.ok(Number.isInteger(la) && Number.isInteger(lb) && la >= 0 && lb >= 0);
    assert.ok(la <= Math.ceil(na * COLUMN.clashCap) && lb <= Math.ceil(nb * COLUMN.clashCap), "never more than half");
  }
  assert.deepEqual(clashLosses(5, 5, 0, 0), [0, 0]);
  const [weak, strong] = clashLosses(8, 8, 50, 300);
  assert.ok(weak > strong, "the weaker side loses more");
});

test("marches: marchesOf walks every non-tunnel march, sized by the attack it carries, departing after the muster", () => {
  const s = newWar(), minds = newMinds(), rnd = mulberry(3);
  for (let i = 0; i < 60; i++) warTick(s, scriptedOrders(s, minds, rnd));
  let seen = 0;
  for (let i = 0; i < 80; i++) {
    const o = scriptedOrders(s, minds, rnd), plans = plansOf(s, o, tunnelStrikes(s, o), s.tick), atk = deployments(s, o, 0).attack, at = 1_000_000 + i;
    const ms = marchesOf(plans, atk, s.tick, at), walking = CLAN_KEYS.flatMap((k) => (plans[k]?.march ?? []).filter((m) => !m[2]).map((m) => [k, ...m] as const));
    assert.equal(ms.length, walking.length, "one column per walking march, none for a tunnel");
    for (const m of ms) {
      assert.equal(m.id, `${s.tick}-${m.clan}-${m.from}-${m.to}`);
      assert.equal(m.dep, at + COLUMN.musterMs);
      assert.equal(m.size, columnSize(atk[m.to][m.clan] ?? 0));
      assert.ok(TERRITORIES[m.to].near.includes(m.from) && s.owner[m.from] === m.clan && targetsOf(s, m.clan).includes(m.to));
      seen++;
    }
    warTick(s, o);
  }
  assert.ok(seen > 100);
});

const march = (clan: ClanKey, from: number, to: number, at = 0, size = 6): March => ({ id: `0-${clan}-${from}-${to}`, clan, from, to, tick: 0, at, dep: at + COLUMN.musterMs, force: size * 30, size });

test("marches: a column walks its road on the clock, the same on the server and the client, and camps before the next tick even after every halt", () => {
  for (const { a, b } of roadPairs()) for (const [x, y] of [[a, b], [b, a]]) {
    const p = warPath(x, y)!, q = pathOfEntry(roadEntry(Math.min(x, y), Math.max(x, y))!), t = columnTrip(p), at = 5_000_000;
    if (x > y) continue; // (the client's copy is the a < b entry)
    assert.ok(t.speed >= COLUMN.speed, "never slower than the march");
    assert.ok(arriveAt(p, at + COLUMN.musterMs, COLUMN.haltMaxMs, true) <= at + WAR.tickMs, `${TERRITORIES[x].name} -> ${TERRITORIES[y].name}: camps before the tick`);
    for (const dt of [0, 30_000, 61_000, 100_000, 200_000, 400_000, 599_000]) {
      const s1 = columnPos(p, at + COLUMN.musterMs, at + dt, 4000), s2 = columnPos(q, at + COLUMN.musterMs, at + dt, 4000);
      assert.deepEqual(s1, s2, "the client's path gives the same place");
      assert.deepEqual(columnPos(p, at + COLUMN.musterMs, at + dt, 4000), s1, "deterministic");
    }
    assert.equal(columnPos(p, at + COLUMN.musterMs, at + 10_000).state, 0, "musters first");
    assert.equal(columnPos(p, at + COLUMN.musterMs, at + WAR.tickMs - 1).state, 5, "camps at the end");
    if (p.kind === "road") {
      const mid = columnPos(p, at + COLUMN.musterMs, at + COLUMN.musterMs + 10_000);
      assert.ok(Math.abs(mid.walked - (t.speed * 10)) < 1e-6 || mid.walked === t.walk, "speed x time along the road");
      const halted = columnPos(p, at + COLUMN.musterMs, at + COLUMN.musterMs + 20_000, 10_000);
      assert.ok(Math.abs(halted.walked - mid.walked) < 1e-6, "a halt holds it back by as long");
    }
  }
  // a waygate link: into the gate, out of the far one gateMs later
  const link = roadPairs().find((p) => p.link)!, lp = warPath(link.a, link.b)!, lt = columnTrip(lp), dep = 0, e1 = (lp.legs[0].len / lt.speed) * 1000;
  assert.equal(lp.kind, "link");
  assert.equal(columnPos(lp, dep, e1 - 100).leg, 0);
  assert.equal(columnPos(lp, dep, e1 + COLUMN.gateMs / 2).state, 4, "in the gate");
  const out = columnPos(lp, dep, e1 + COLUMN.gateMs + 100);
  assert.equal(out.leg, 1); assert.equal(out.state, 1);
  assert.ok(Math.hypot(out.x - lp.legs[1].pts[0].x, out.y - lp.legs[1].pts[0].y) < 10, "out of the far gate");
});

test("marches: two columns on one road in opposite directions meet at one place and time, whichever is asked first; both stand clashMs there", () => {
  let n = 0;
  for (const { a, b, link } of roadPairs()) {
    if (link || n >= 10) continue;
    const pa = warPath(a, b)!, pb = warPath(b, a)!;
    if (pa.kind !== "road") continue;
    const A = march("redfang", a, b), B = march("veiled", b, a), m1 = meetingOf(A, pa, B, pb), m2 = meetingOf(B, pb, A, pa);
    assert.deepEqual(m1, m2, "symmetric");
    if (!m1) { assert.ok(columnTrip(pa).walk + columnTrip(pb).walk < pa.len + 1, "no meeting only when both camp before they cross"); continue; }
    assert.equal(m1!.a < m1!.b, true);
    const qa = columnPos(pa, A.dep, m1!.at + 1000, 0, m1!.at), qb = columnPos(pb, B.dep, m1!.at + 1000, 0, m1!.at);
    assert.equal(qa.state, 3); assert.equal(qb.state, 3);
    assert.ok(Math.hypot(qa.x - m1!.x, qa.y - m1!.y) < 24 && Math.hypot(qb.x - m1!.x, qb.y - m1!.y) < 24, "both at the meeting");
    const later = columnPos(pa, A.dep, m1!.at + COLUMN.clashMs - 10, 0, m1!.at);
    assert.ok(Math.abs(later.walked - qa.walked) < 1e-6, "standing while they fight");
    const on = columnPos(pa, A.dep, m1!.at + COLUMN.clashMs + 5000, 0, m1!.at);
    assert.ok((on.state === 1 || on.state === 5) && on.walked >= qa.walked, "then they march on (or camp)");
    assert.ok(arriveAt(pa, A.dep, 0, true) > arriveAt(pa, A.dep, 0, false));
    assert.equal(meetingOf(A, pa, march("veiled", a, b), pa), undefined, "same direction: no meeting");
    assert.equal(meetingOf(A, pa, A, pa), undefined);
    n++;
  }
  assert.ok(n >= 5);
  const r = warPath(roadPairs()[0].a, roadPairs()[0].b)!;
  assert.ok(routePos(r.legs[0], 0));
});
