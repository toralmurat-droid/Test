import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { DOORS, isSafeZone, isSolidAt } from "../shared/map";
import { noMobsAt } from "../shared/spawns";
import { inVillage } from "../shared/wrath";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { CARAVAN, caravanGold, caravanHp, caravanLand, caravanLines, caravanPhase, caravanRoute, caravansOnRoad, caravanTripMs, routePos } from "../shared/war/caravans";
import { patrolOf } from "../shared/war/patrols";
import { newWar, supplyMap, WAR } from "../shared/war/rules";
import { initialOwners, TERRITORIES } from "../shared/war/territories";

/** Every pair of same-act neighbours (the roads any war could put a cart on), each once. */
const PAIRS = TERRITORIES.flatMap((t) => t.near.filter((n) => n > t.id && TERRITORIES[n].act === t.act).map((n) => [t.id, n] as [number, number]));

test("caravans: lines are supply-tree edges between neighbours of one clan in one act, outward from the capitals", () => {
  const s = newWar(), lines = caravanLines(s.owner), supply = supplyMap(s);
  assert.ok(lines.length >= 8, `lines ${lines.length}`);
  assert.deepEqual(caravanLines(s.owner), lines, "deterministic");
  const seen = new Set<string>();
  for (const l of lines) {
    const A = TERRITORIES[l.a], B = TERRITORIES[l.b];
    assert.ok(A.near.includes(l.b), `${A.name} - ${B.name} are neighbours`);
    assert.equal(A.act, B.act, "same act");
    assert.equal(s.owner[l.a], l.clan); assert.equal(s.owner[l.b], l.clan);
    assert.ok(supply[l.a] > supply[l.b], `${A.name} -> ${B.name} flows outward`);
    assert.ok(!seen.has(`${l.b}-${l.a}`) && !seen.has(`${l.a}-${l.b}`), "one direction, once"); seen.add(`${l.a}-${l.b}`);
  }
  // every border land with a road home is fed: its tree edge into it runs
  for (const t of TERRITORIES) {
    const k = s.owner[t.id];
    if (t.capitalOf === k || !t.near.some((n) => s.owner[n] !== k) || supply[t.id] === WAR.cutOff) continue;
    const feeder = lines.find((l) => l.b === t.id);
    if (!feeder) assert.ok(t.near.every((n) => s.owner[n] !== k || TERRITORIES[n].act !== t.act || supply[n] >= supply[t.id]), `${t.name} has a feeder`);
  }
  // land with no road back to a capital carries no cart; a clan with no capital held has none
  const cut = [...s.owner] as ClanKey[], k = cut[lines[0].a];
  for (const t of TERRITORIES) if (t.capitalOf === k) cut[t.id] = CLAN_KEYS.find((c) => c !== k)!;
  assert.ok(caravanLines(cut).every((l) => l.clan !== k), "cut off from every capital: no carts");
});

test("caravans: every road runs gate to gate, deterministic, each segment clear of walls, doors, safe squares, the stockade and monster-free ground", () => {
  const doorTiles = new Set(DOORS.flatMap((d) => d.tiles));
  let built = 0;
  for (const [a, b] of PAIRS) {
    const r = caravanRoute(a, b);
    if (!r) continue;
    built++;
    assert.equal(caravanRoute(a, b), r, "cached");
    assert.deepEqual(r.pts[0], patrolOf(a)!.pts[0], "starts outside a's Hold gate");
    assert.deepEqual(r.pts[r.pts.length - 1], patrolOf(b)!.pts[0], "ends outside b's");
    const back = caravanRoute(b, a)!;
    assert.deepEqual(back.pts, [...r.pts].reverse(), "the way back is the same road");
    assert.ok(Math.abs(back.len - r.len) < 1e-6 && Math.abs(r.cum[r.cum.length - 1] - r.len) < 1e-6);
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const p = r.pts[i], q = r.pts[i + 1], n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y));
      for (let k = 0; k <= n; k++) {
        const x = p.x + ((q.x - p.x) * k) / n, y = p.y + ((q.y - p.y) * k) / n, where = `${TERRITORIES[a].name} -> ${TERRITORIES[b].name} at ${Math.round(x)},${Math.round(y)}`;
        assert.ok(!isSolidAt(x, y), `solid: ${where}`);
        assert.ok(!doorTiles.has(Math.floor(y / TILE) * 288 + Math.floor(x / TILE)), `door: ${where}`);
        assert.ok(!isSafeZone(x, y) && !inVillage(x, y) && !noMobsAt(x, y), `off limits: ${where}`);
      }
    }
    assert.ok(caravanTripMs(r) < CARAVAN.everyMs, `${TERRITORIES[a].name} -> ${TERRITORIES[b].name}: one cart on the road at a time`);
  }
  assert.ok(built >= PAIRS.length * 0.8, `most neighbours have a road (${built}/${PAIRS.length})`);
  // the lines of the opening war almost all have one
  const lines = caravanLines(initialOwners());
  assert.ok(lines.filter((l) => caravanRoute(l.a, l.b)).length >= lines.length - 2);
});

test("caravans: the wall-clock schedule (one departure per route per everyMs, position = time on the road x speed)", () => {
  const l = caravanLines(newWar().owner).find((x) => caravanRoute(x.a, x.b))!, r = caravanRoute(l.a, l.b)!, trip = caravanTripMs(r);
  const off = caravanPhase(l.a, l.b);
  assert.equal(off, caravanPhase(l.a, l.b)); assert.ok(off >= 0 && off < CARAVAN.everyMs);
  const t0 = 5_000 * CARAVAN.everyMs - off; // a departure
  const at0 = caravansOnRoad(r, t0);
  assert.equal(at0.length, 1); assert.equal(at0[0].dep, t0); assert.equal(at0[0].d, 0);
  assert.equal(at0[0].id, `${l.a}-${l.b}-${at0[0].slot}`);
  assert.deepEqual(caravansOnRoad(r, t0 + 10_000), [{ ...at0[0], d: (10_000 * CARAVAN.speed) / 1000 }], "the same cart, further along");
  assert.deepEqual(caravansOnRoad(r, t0 + trip + 1), [], "arrived: none on the road until the next slot");
  const next = caravansOnRoad(r, t0 + CARAVAN.everyMs);
  assert.equal(next.length, 1); assert.equal(next[0].slot, at0[0].slot + 1);
  const end = routePos(r, r.len + 50), start = routePos(r, -5);
  assert.deepEqual([end.x, end.y], [r.pts[r.pts.length - 1].x, r.pts[r.pts.length - 1].y], "clamped at the end");
  assert.deepEqual([start.x, start.y], [r.pts[0].x, r.pts[0].y]);
  // positions run along the road without jumps
  let prev = routePos(r, 0);
  for (let d = 4; d <= r.len; d += 4) { const q = routePos(r, d); assert.ok(Math.hypot(q.x - prev.x, q.y - prev.y) <= 4.01); prev = q; }
});

test("caravans: numbers (a tough cart worth raiding) and the land a cart is in", () => {
  for (const k of CLAN_KEYS) assert.ok(caravanHp(k, 20) > caravanHp(k, 10) && caravanHp(k, 10) > 0);
  assert.ok(caravanGold(30) > caravanGold(10) && caravanGold(1) > 0);
  const [a, b] = PAIRS.find(([x, y]) => caravanRoute(x, y))!, r = caravanRoute(a, b)!;
  assert.equal(caravanLand({ a, b }, r.pts[0].x, r.pts[0].y).id, a, "at a's gate: a");
  const B = TERRITORIES[b];
  assert.equal(caravanLand({ a, b }, (B.x + 1) * TILE, (B.y + 1) * TILE).id, b);
  const A = TERRITORIES[a], far = caravanLand({ a, b }, (A.x - 200) * TILE, A.cy * TILE);
  assert.ok(far.id === a || far.id === b, "between lands: one of its ends");
});
