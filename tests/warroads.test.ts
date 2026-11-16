import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { DOORS } from "../shared/map";
import { anyHoldWall, holdCellAt } from "../shared/war/holdWalls";
import { patrolOf } from "../shared/war/patrols";
import { holdGate, linkLegs, pathOfEntry, roadEntry, roadOffLimits, roadPairs, ROAD_SEARCH, warPath, warRoad, type Road } from "../shared/war/roads";
import { LAND_LINKS, TERRITORIES, territoryByName } from "../shared/war/territories";
import { caravanRoute } from "../shared/war/caravans";
import { MAP_W } from "../shared/constants";

/** The four neighbour pairs of one land the search cannot join today (W4 plan): their columns are simulated on a straight track. */
const NO_ROAD = [["North Meadow", "Old Watchtower"], ["North Meadow", "Old Ruins"], ["Brinewood", "Saltwind Coast"], ["Heronwreck Strand", "Saltwind Coast"]]
  .map(([a, b]) => [territoryByName(a)!.id, territoryByName(b)!.id].sort((x, y) => x - y).join("-"));

const doors = new Set<number>();
for (const d of DOORS) for (const k of d.tiles) doors.add(k);

/** Every waypoint of road r (walked between Holds a and b) stands where a column may: no safe ground, stockade, monster-free ground, door, wall or other Hold's fort. */
function checkRoad(r: Road, own: number[], what: string) {
  for (const p of r.pts) {
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE), h = holdCellAt(tx, ty);
    assert.ok(!roadOffLimits(p.x, p.y), `${what}: waypoint (${tx}, ${ty}) off limits`);
    assert.ok(!doors.has(ty * MAP_W + tx), `${what}: waypoint on a door`);
    assert.ok(!anyHoldWall(tx, ty), `${what}: waypoint on a fort wall`);
    assert.ok(h < 0 || own.includes(h), `${what}: waypoint in the fort of ${TERRITORIES[h]?.name}`);
    assert.equal(p.x, (tx + 0.5) * TILE, `${what}: a tile centre`); assert.equal(p.y, (ty + 0.5) * TILE);
  }
  // and nowhere between them (sampled every 4 px)
  for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1], b = r.pts[i], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4);
    for (let k = 0; k <= n; k++) { const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n; assert.ok(!roadOffLimits(x, y), `${what}: segment off limits at (${Math.round(x)}, ${Math.round(y)})`); }
  }
}

test("war roads: every neighbour pair in one land has a road but the four known gaps (tracks); roads keep off limits and off other Holds' forts", () => {
  const pairs = roadPairs();
  assert.ok(pairs.length >= 80, `${pairs.length} neighbour pairs`);
  let roads = 0;
  for (const { a, b, link } of pairs) {
    if (link) continue;
    const p = warPath(a, b)!, key = `${a}-${b}`, what = `${TERRITORIES[a].name} - ${TERRITORIES[b].name}`;
    if (NO_ROAD.includes(key)) { assert.equal(p.kind, "track", `${what}: no road (a track)`); continue; }
    assert.equal(p.kind, "road", `${what}: a road`);
    roads++;
    const r = p.legs[0];
    assert.deepEqual(r.pts[0], holdGate(a), `${what}: from a's Hold gate`);
    assert.deepEqual(r.pts.at(-1), holdGate(b), `${what}: to b's Hold gate`);
    checkRoad(r, [a, b], what);
    if (!caravanRoute(a, b)) assert.fail(`${what}: the caravans' search finds no road where the war road does`);
  }
  assert.equal(roads, pairs.filter((p) => !p.link).length - NO_ROAD.length);
});

test("war roads: a reversed road is the road reversed; built once and cached", () => {
  const { a, b } = roadPairs().find((p) => !p.link && warPath(p.a, p.b)!.kind === "road")!;
  const r = warRoad(a, b)!, back = warRoad(b, a)!;
  assert.equal(warRoad(a, b), r, "cached");
  assert.deepEqual(back.pts, [...r.pts].reverse());
  assert.ok(Math.abs(back.len - r.len) < 1e-6);
  back.cum.forEach((c, i) => assert.ok(Math.abs(c - (r.len - r.cum[r.cum.length - 1 - i])) < 1e-6));
  assert.equal(warRoad(a, a + 1000), undefined, "no road between lands that do not border");
});

test("war roads: each waygate link has two legs (Hold to gate, gate to Hold), ending near the gates; reversed it is walked back", () => {
  assert.equal(LAND_LINKS.length, 4);
  for (const l of LAND_LINKS) {
    const legs = linkLegs(l.a, l.b), what = l.link.name;
    assert.ok(legs, `${what}: legs`);
    const [l1, l2] = legs!.legs;
    assert.deepEqual(l1.pts[0], holdGate(l.a), `${what}: leg 1 from a's Hold gate`);
    assert.deepEqual(l2.pts.at(-1), holdGate(l.b), `${what}: leg 2 to b's Hold gate`);
    const e1 = l1.pts.at(-1)!, s2 = l2.pts[0];
    assert.ok(Math.hypot(e1.x / TILE - l.link.pa.x, e1.y / TILE - l.link.pa.y) <= ROAD_SEARCH.gateReach + 1, `${what}: leg 1 ends by the near gate`);
    assert.ok(Math.hypot(s2.x / TILE - l.link.pb.x, s2.y / TILE - l.link.pb.y) <= ROAD_SEARCH.gateReach + 1, `${what}: leg 2 starts by the far gate`);
    checkRoad(l1, [l.a], `${what} leg 1`); checkRoad(l2, [l.b], `${what} leg 2`);
    const back = linkLegs(l.b, l.a)!;
    assert.deepEqual(back.legs[0].pts, [...l2.pts].reverse()); assert.deepEqual(back.legs[1].pts, [...l1.pts].reverse());
    assert.equal(warPath(l.a, l.b)!.kind, "link");
  }
});

test("war roads: the \"warroads\" entry reads back into the same path (the client walks the columns on it)", () => {
  let n = 0;
  for (const { a, b } of roadPairs()) {
    const e = roadEntry(a, b)!, p = warPath(a, b)!, q = pathOfEntry(JSON.parse(JSON.stringify(e)));
    assert.equal(q.kind, p.kind);
    assert.equal(q.legs.length, p.legs.length);
    q.legs.forEach((l, i) => { assert.deepEqual(l.pts, p.legs[i].pts); assert.equal(l.len, p.legs[i].len); });
    assert.ok(e[2].every((v) => Number.isInteger(v)), "whole tile coordinates");
    if (p.kind === "track") assert.equal(e[3], -1); else if (p.kind === "link") assert.equal(e[3], p.legs[0].pts.length); else assert.equal(e.length, 3);
    n++;
  }
  assert.equal(n, roadPairs().length);
  assert.ok(patrolOf(LAND_LINKS[0].a));
});
