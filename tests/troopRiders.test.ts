import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { CLAN_KEYS } from "../shared/war/clans";
import { fortOf, liveHoldWall, setHoldOwners } from "../shared/war/holdWalls";
import { TROOP_LOOK } from "../shared/war/patrols";
import { HOLDS } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { chargeEnd, chargeStep, charging, newCharge, shotClear, wallPost, wallPosts } from "../shared/war/troopRoles";
import { CLAN_ROLES, parseTroop, ROLE_PLAN, roleOf, TROOP_ROLE, troopName, troopStats, troopWeapon } from "../shared/war/troops";

test("troop riders: every clan fields its rider (one per column, one at a fortress), it round-trips and has a look", () => {
  assert.equal(TROOP_ROLE.rider.fielded, true);
  for (const k of CLAN_KEYS) {
    assert.ok(CLAN_ROLES[k].rider?.name, `${k} rider named`);
    assert.equal(roleOf(k, "march", 1, 1), "rider", `${k} column place 1`);
    assert.equal(roleOf(k, "guard", 2, 6), "rider", `${k} fortress place 6`);
    for (const tier of [0, 1] as const) for (let i = 0; i < 8; i++) assert.notEqual(roleOf(k, "guard", tier, i), "rider", "no riders at an outpost or a camp");
    const w = troopWeapon(k, false, false, false, false, "rider");
    assert.equal(w, `${k}>`); assert.equal(parseTroop(w)?.role, "rider");
    assert.ok(TROOP_LOOK[k].roles.rider?.startsWith(`war_${k === "wardens" ? "warden" : k === "hidekin" ? "hidekin" : k}`), `${k} art key`);
  }
  assert.equal(troopName("wardens", false, false, false, false, "rider"), "Warden lancer");
  assert.equal(troopName("hidekin", false, false, false, false, "rider"), "Hide-Kin boar rider");
  const f = troopStats("redfang", 30), r = troopStats("redfang", 30, false, "rider");
  assert.ok(r.speed > f.speed && r.hp > f.hp && r.dmg > f.dmg && r.shot === undefined, "a rider: quicker, a little tougher and harder");
});

test("troop riders: the charge steps (wind-up, gallop, blow, wheel, cooldown)", () => {
  const C = TROOP_ROLE.rider.charge, c = newCharge();
  assert.deepEqual(chargeStep(c, 1000, C.max + 1), { act: "fight" }, "too far: on foot (it closes in)");
  assert.deepEqual(chargeStep(c, 1000, (C.min + C.max) / 2), { act: "wind", start: true }, "a run-up: it winds up");
  assert.ok(charging(c));
  assert.deepEqual(chargeStep(c, 1000 + C.windupMs - 1, 20), { act: "wind" }, "the wind-up runs its course");
  assert.deepEqual(chargeStep(c, 1000 + C.windupMs, 20), { act: "gallop" });
  chargeEnd(c, 1700, true);
  assert.equal(c.next, 1700 + C.everyMs); assert.ok(!charging(c));
  assert.deepEqual(chargeStep(c, 1800, 10), { act: "wheel" }, "after its blow it rides on");
  assert.deepEqual(chargeStep(c, 1700 + C.wheelMs, 10), { act: "fight" }, "then fights on foot");
  assert.deepEqual(chargeStep(c, 1700 + C.everyMs - 1, (C.min + C.max) / 2), { act: "fight" }, "cooling: no charge");
  assert.equal(chargeStep(c, 1700 + C.everyMs, (C.min + C.max) / 2).act, "wind", "cooled: charges again");
  // a gallop that runs out misses and cools
  const g = newCharge();
  chargeStep(g, 0, C.min); chargeStep(g, C.windupMs, 50);
  assert.deepEqual(chargeStep(g, C.windupMs + C.gallopMs, 50), { act: "fight" });
  assert.equal(g.next, C.windupMs + C.gallopMs + C.everyMs);
  // ready but too close: one wheel for a run-up, then on foot
  const w = newCharge();
  assert.deepEqual(chargeStep(w, 0, 20), { act: "wheel" });
  assert.deepEqual(chargeStep(w, C.wheelMs, 20), { act: "fight" }, "no room found: on foot");
  assert.equal(w.next, C.wheelMs + C.everyMs / 2);
  assert.deepEqual(chargeStep(w, C.wheelMs + 10, C.min), { act: "fight" });
  const x = newCharge();
  chargeStep(x, 0, 20);
  assert.equal(chargeStep(x, 300, C.min).act, "wind", "the wheel found its run-up");
});

test("troop riders: the charge is readable (a wind-up), the pike's brace and the counters are set", () => {
  const C = TROOP_ROLE.rider.charge, B = TROOP_ROLE.pike.brace;
  assert.ok(C.windupMs >= 400, "a wind-up a hero can see");
  assert.ok(C.min > 40 && C.max > C.min && C.everyMs > C.windupMs + C.gallopMs);
  assert.ok(B.ms > 0 && B.stunMs > 0 && B.dmgMult > 0);
  assert.equal(TROOP_ROLE.vs.pike?.rider, 2); assert.equal(TROOP_ROLE.vs.rider?.archer, 1.5); assert.equal(TROOP_ROLE.vs.archer?.pike, 1.25);
});

test("courtyard archers: wall posts are on the holder's live walls at the fort's edge; only archers, only camps and forts", () => {
  assert.deepEqual(ROLE_PLAN.wall[0], []);
  let found = 0;
  for (const h of HOLDS) for (const k of CLAN_KEYS) for (const tier of [1, 2] as const) {
    const f = fortOf(h.t, k, tier)!, posts = wallPosts(h.t, k, tier);
    assert.deepEqual(wallPosts(h.t, k, tier), posts, "cached, pure");
    const walls = new Set(f.walls.map(([x, y]) => `${x},${y}`));
    for (const p of posts) {
      const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
      assert.ok(walls.has(`${tx},${ty}`), `${h.t} ${k} ${tier}: a wall cell`);
      assert.equal(p.x, (tx + 0.5) * TILE);
    }
    ROLE_PLAN.wall[tier].forEach((i, n) => {
      const w = wallPost(h.t, k, tier, i);
      if (roleOf(k, "guard", tier, i) !== "archer") assert.equal(w, undefined, `${k}: no archer, no wall post`);
      else { assert.deepEqual(w, posts[n]); if (w) found++; }
    });
  }
  assert.ok(found > HOLDS.length, `most forts have their courtyard archers (${found})`);
  assert.equal(wallPost(HOLDS[0].t, "hidekin", 2, 3), undefined, "the Hide-Kin have no archers");
  // a wall post stands on a live wall when the clan holds the land at that tier
  const h = HOLDS.find((q) => wallPosts(q.t, "wardens", 2).length)!, p = wallPosts(h.t, "wardens", 2)[0];
  setHoldOwners(TERRITORIES.map((t) => (t.id === h.t ? "wardens" : undefined)), TERRITORIES.map(() => 2));
  try { assert.ok(liveHoldWall(Math.floor(p.x / TILE), Math.floor(p.y / TILE))); } finally { setHoldOwners([]); }
});

test("shotClear: no shot through a live Hold wall; a courtyard archer's own wall does not count", () => {
  const h = HOLDS.find((q) => wallPosts(q.t, "wardens", 2).length >= 2)!, f = fortOf(h.t, "wardens", 2)!;
  setHoldOwners(TERRITORIES.map((t) => (t.id === h.t ? "wardens" : undefined)), TERRITORIES.map(() => 2));
  try {
    const mid = { x: (f.cx + 0.5) * TILE, y: (f.cy + 0.5) * TILE }, R = f.reach;
    // from the banner spot (the courtyard) to well outside, east through the walls (not through the gate row)
    const out = { x: (f.cx + R + 3 + 0.5) * TILE, y: (f.cy + 2 + 0.5) * TILE };
    assert.equal(shotClear(mid.x, mid.y, out.x, out.y), false, "through the walls");
    assert.equal(shotClear(out.x, out.y, mid.x, mid.y), false, "and back");
    // from a wall post straight out: clear (it stands on its own wall)
    const p = wallPosts(h.t, "wardens", 2)[0];
    const dx = Math.sign(p.x - mid.x), dy = Math.sign(p.y - mid.y);
    assert.ok(shotClear(p.x, p.y, p.x + dx * 3 * TILE, p.y + dy * 3 * TILE) || shotClear(p.x, p.y, p.x + dx * 3 * TILE, p.y) || shotClear(p.x, p.y, p.x, p.y + dy * 3 * TILE), "out from the wall");
    // with no walls up the same line is clear (unless the map itself blocks it)
    setHoldOwners([]);
    assert.equal(shotClear(mid.x, mid.y, out.x, out.y), true, "no fort, no wall");
  } finally { setHoldOwners([]); }
});
