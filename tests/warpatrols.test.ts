import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { isSolidAt } from "../shared/map";
import { CLAN_KEYS } from "../shared/war/clans";
import { garrisonCount, garrisonSpots, patrolCount, patrolOf, patrolPos, patrols, SIEGE_FIGHT, siegeCounts, siegeLife, TROOP, TROOP_LOOK, type Patrol } from "../shared/war/patrols";
import { HOLD_FORT_PX, HOLDS, STANDARD, STANDARDS } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";

const seg = (p: Patrol, i: number) => [p.pts[i], p.pts[(i + 1) % p.pts.length]] as const;
/** Distance (px) from point q to segment ab. */
const toSeg = (q: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const f = l2 ? Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / l2)) : 0;
  return Math.hypot(a.x + (b.x - a.x) * f - q.x, a.y + (b.y - a.y) * f - q.y);
};

test("patrols: every territory with a Hold and a standard has one; gate first (just outside the Hold's walls), stops at each standard", () => {
  const all = patrols();
  for (const t of TERRITORIES) {
    if (!HOLDS.some((h) => h.t === t.id) || !STANDARDS.some((s) => s.t === t.id)) continue;
    const p = all.find((q) => q.t === t.id);
    assert.ok(p, `${t.name} has a patrol`);
    assert.equal(patrolOf(t.id), p);
    const hold = HOLDS.find((h) => h.t === t.id)!;
    const g = p.pts[0], gd = Math.max(Math.abs(g.x - hold.x), Math.abs(g.y - hold.y));
    assert.ok(gd >= HOLD_FORT_PX && gd <= HOLD_FORT_PX + 5 * TILE, `${t.name} starts just outside its fort (${gd.toFixed(0)} px)`);
    assert.ok(!isSolidAt(g.x, g.y), `${t.name} gate spot walkable`);
    assert.equal(p.stops[0], 0);
    assert.ok(p.pts.length >= 2 && p.len > 0);
    // the loop closes back on pts[0] (len counts the closing segment)
    let len = 0;
    for (let i = 0; i < p.pts.length; i++) { const [a, b] = seg(p, i); len += Math.hypot(b.x - a.x, b.y - a.y); }
    assert.ok(Math.abs(len - p.len) < 1e-6, `${t.name} len`);
    const mine = STANDARDS.filter((s) => s.t === t.id);
    assert.equal(p.stops.length, mine.length + 1, `${t.name}: every standard reachable today`);
    for (const s of mine) {
      const near = Math.min(...p.pts.map((_, i) => toSeg(s, ...seg(p, i))));
      assert.ok(near <= STANDARD.range, `${t.name} passes standard ${s.id} (${near.toFixed(0)} px)`);
    }
    for (const [k, i] of p.stops.entries()) {
      const target = k === 0 ? p.pts[0] : mine[k - 1];
      assert.deepEqual(p.pts[i], { x: target.x, y: target.y }, `${t.name} stop ${k}`);
    }
  }
});

test("patrols: waypoints and 4 px samples are walkable and stay within the territory + 2 tiles", () => {
  for (const p of patrols()) {
    const t = TERRITORIES[p.t];
    const x0 = (t.x - 2) * TILE, y0 = (t.y - 2) * TILE, x1 = (t.x + t.w + 2) * TILE, y1 = (t.y + t.h + 2) * TILE;
    for (const q of p.pts) assert.ok(q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1, `${t.name} waypoint in rect`);
    for (let i = 0; i < p.pts.length; i++) {
      const [a, b] = seg(p, i), n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
      for (let k = 0; k <= n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n;
        assert.ok(!isSolidAt(x, y), `${t.name} segment ${i} solid at ${x.toFixed(0)},${y.toFixed(0)}`);
      }
    }
  }
});

test("patrolPos: deterministic, wraps, continuous, unit direction", () => {
  for (const p of patrols()) {
    const same = (a: ReturnType<typeof patrolPos>, b: ReturnType<typeof patrolPos>) =>
      assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.dx - b.dx) < 1e-9 && Math.abs(a.dy - b.dy) < 1e-9);
    assert.deepEqual(patrolPos(p, 77.7), patrolPos(p, 77.7), "deterministic");
    same(patrolPos(p, 0), patrolPos(p, p.len));
    same(patrolPos(p, 123.4), patrolPos(p, 123.4 + 3 * p.len));
    same(patrolPos(p, -10), patrolPos(p, p.len - 10));
    const s = patrolPos(p, 0);
    assert.ok(Math.abs(s.x - p.pts[0].x) < 1e-6 && Math.abs(s.y - p.pts[0].y) < 1e-6);
    let prev = patrolPos(p, -p.len * 0.01);
    for (let d = -p.len * 0.01 + 2; d <= p.len * 1.01; d += 2) {
      const q = patrolPos(p, d);
      assert.ok(Math.hypot(q.x - prev.x, q.y - prev.y) <= 2 + 1e-6, `${TERRITORIES[p.t].name} jump at ${d.toFixed(1)}`);
      assert.ok(Math.abs(Math.hypot(q.dx, q.dy) - 1) < 1e-9);
      prev = q;
    }
  }
});

test("patrols: building twice gives the same routes", () => {
  const a = JSON.stringify(patrols());
  // a fresh copy of the module rebuilds from scratch
  const fresh = require.resolve("../shared/war/patrols");
  delete require.cache[fresh];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const again = (require("../shared/war/patrols") as typeof import("../shared/war/patrols")).patrols();
  assert.notEqual(again, patrols());
  assert.equal(JSON.stringify(again), a);
});

test("troops: look covers every clan; settings sane", () => {
  for (const k of CLAN_KEYS) assert.ok(TROOP_LOOK[k]?.kinds.length, k);
  assert.ok(TROOP.perPatrol >= 1 && TROOP.speed > 0 && TROOP.rankGap > 0 && TROOP.lateral > 0 && TROOP.pauseMs >= 0 && TROOP.viewRange > 0);
});

test("troops: counts scale with control, siege fits the sprite budget", () => {
  assert.equal(patrolCount(100), TROOP.perPatrol);
  assert.ok(patrolCount(0) >= TROOP.patrolMin && patrolCount(0) < patrolCount(100));
  assert.equal(garrisonCount(0), TROOP.garrisonMin);
  assert.equal(garrisonCount(100), TROOP.garrisonMax);
  for (const n of [1, 2, 3]) for (const c of [0, 50, 100]) {
    const k = siegeCounts(n, c);
    assert.ok(n * (k.atk + k.def) <= SIEGE_FIGHT.budget || k.atk + k.def <= 2 * SIEGE_FIGHT.minDefenders * 2);
    assert.ok(k.def <= k.atk && k.def >= 1);
  }
  assert.deepEqual(siegeCounts(2, 100), { atk: 8, def: 8 });
  for (const k of CLAN_KEYS) assert.ok(TROOP_LOOK[k].officer);
});

test("garrisonSpots: outside the fort, walkable, distinct, deterministic", () => {
  for (const t of TERRITORIES) {
    if (!HOLDS.some((h) => h.t === t.id)) continue;
    const g = garrisonSpots(t.id, TROOP.garrisonMax);
    assert.ok(g.length >= TROOP.garrisonMin, `${t.name} has room for ${g.length} guards`);
    const h = HOLDS.find((x) => x.t === t.id)!;
    for (const p of g) { assert.ok(!isSolidAt(p.x, p.y)); assert.ok(Math.max(Math.abs(p.x - h.x), Math.abs(p.y - h.y)) >= HOLD_FORT_PX, `${t.name} guard outside the fort`); assert.ok(Math.abs(Math.hypot(p.fx, p.fy) - 1) < 1e-9); }
    assert.deepEqual(garrisonSpots(t.id, 3), g.slice(0, 3));
  }
});

test("siegeLife: deterministic; fallen fighters leave and are replaced by walkers; some fall, most fight", () => {
  const seen = { walk: 0, fight: 0, down: 0, gone: 0 };
  for (let slot = 0; slot < 16; slot++) for (let ms = 0; ms < 120000; ms += 250) {
    const a = siegeLife(7, slot, ms);
    assert.deepEqual(a, siegeLife(7, slot, ms));
    seen[a.s]++;
  }
  for (const k of Object.keys(seen) as (keyof typeof seen)[]) assert.ok(seen[k] > 0, k);
  const total = seen.walk + seen.fight + seen.down + seen.gone;
  assert.ok(seen.fight / total > 0.6, "mostly fighting");
});
