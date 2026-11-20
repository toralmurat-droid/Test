import { test } from "node:test";
import assert from "node:assert/strict";
import { actOfTile, MAP_H, MAP_W, TILE, WORLD_H } from "../shared/constants";
import {
  AREAS, areaAt, EMPTY, GROUND, HIGHWAY_TILES, isSafeZone, isSolidTile, NATURE, OBJECTS, PORTAL_SPOTS, randomSpawn, SIGNPOSTS, T, WORLD, CITY_POSTS,
} from "../shared/map";
import {
  CITIES, CITY, CITY_TEMPLATE, cityAt, cityGates, cityNpcId, cityNpcPx, cityText, cityTile, inLandCities, plotBox, relocateCitySpot, stripBox,
} from "../shared/capitals";
import { carveCitiesInLand, CITY_APRON, CITY_LAND, CITY_MASK, OLD_HEARTHHOLD_GATE, RETIRED_LEGS } from "../shared/cityLand";
import { HIGHWAYS, legLine } from "../shared/highways";
import { waygateById, WAYGATES } from "../shared/act2";
import { NPCS } from "../shared/npcs";
import { STASHES } from "../shared/trade";
import { nearCityGate, noMobsAt, NO_MOB_AREAS, randomPointInZone, SPAWN_ZONES } from "../shared/spawns";
import { territoryAt } from "../shared/war/view";
import { HOLDS, MUSTERS, STANDARDS } from "../shared/war/standards";
import { CHESTS } from "../shared/chests";
import { SIEGE_SITES } from "../shared/siege";
import { LANDMARKS } from "../shared/landmarks";
import { allObjects } from "../shared/quests";
import { BORDERS, endPath } from "../shared/borders";
import { blocked } from "../shared/movement";
import { BOARDS } from "../shared/bounty";

/**
 * Hearthhold in Oakvale's lands (settlement network step 5): the Wardens' city leaves the band and stands north of
 * Goldenreach Farms (shared/capitals.ts City.site, shared/cityLand.ts). The room side (the gate ward, the hand-off) is in
 * tests/hearthhold-room.test.ts.
 */
const W = CITIES.find((c) => c.clan === "wardens")!, B = plotBox(W), G = cityGates(W);
const inBox = (x: number, y: number) => x >= B.x && y >= B.y && x < B.x + B.w && y < B.y + B.h;
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
const digest = <X>(a: readonly X[], f: (x: X) => unknown) => `${a.length}:${fnv(JSON.stringify(a.map(f)))}`;
function flood(x0: number, y0: number, ok: (x: number, y: number) => boolean = (x, y) => !isSolidTile(x, y)) {
  const seen = new Uint8Array(MAP_W * MAP_H), q = [y0 * MAP_W + x0];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % MAP_W, y = (q[i] / MAP_W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || seen[ny * MAP_W + nx] || !ok(nx, ny)) continue;
      seen[ny * MAP_W + nx] = 1; q.push(ny * MAP_W + nx);
    }
  }
  return seen;
}
/** Steps along walkable road tiles (8-way, like a signpost's walk) from (x, y): -1 where the road never gets. */
function roadSteps(x0: number, y0: number): Int32Array {
  const d = new Int32Array(MAP_W * MAP_H).fill(-1), q = [y0 * MAP_W + x0];
  d[q[0]] = 0;
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % MAP_W, y = (q[i] / MAP_W) | 0;
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const n = (y + j) * MAP_W + x + k;
      if (d[n] >= 0 || !WORLD.roads.has(n) || isSolidTile(x + k, y + j)) continue;
      d[n] = d[q[i]] + 1; q.push(n);
    }
  }
  return d;
}
/** The nearest road tile's steps from a road walk (map tiles). */
const roadTo = (d: Int32Array, x: number, y: number, r = 6) => {
  let best = -1;
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const s = d[(y + j) * MAP_W + x + i]; if (s >= 0 && (best < 0 || s < best)) best = s; }
  return best;
};

test("hearthhold: the Wardens' city stands in Oakvale's north-west, x 41..92, y 1..40; its band plot is rock", () => {
  assert.deepEqual(inLandCities().map((c) => c.clan), ["wardens"], "the other four stay in the band for now");
  assert.deepEqual(W.site, { x: 41, y: 1 });
  assert.deepEqual(B, { x: 41, y: 1, w: 52, h: 40 });
  assert.deepEqual(W.outerBox, { x0: 41, x1: 92, y0: 1, y1: 40 }, "the highways skip the plot, no more");
  assert.deepEqual(W.outer, { x: 66, y: 41 }, "just outside the south gate");
  for (let y = B.y; y < B.y + B.h; y++) for (let x = B.x; x < B.x + B.w; x++) { assert.equal(cityAt(x, y), W); assert.equal(actOfTile(x, y), 1); }
  assert.ok(B.y + B.h <= WORLD_H);
  assert.equal(cityAt(B.x - 1, B.y + 5), undefined); assert.equal(cityAt(B.x, B.y + B.h), undefined);
  // the old plot in the band: solid rock, no city, no area
  const o = stripBox(W.plot);
  for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) {
    assert.equal(OBJECTS[y][x], T.ROCK, `rock at ${x},${y}`);
    assert.equal(cityAt(x, y), undefined);
  }
  assert.ok(!AREAS.some((a) => a.y >= o.y && a.y < o.y + o.h && a.x >= o.x && a.x < o.x + o.w), "no area left in the old plot");
  // the other four cities are where they were, in the band
  for (const c of CITIES) if (c !== W) assert.deepEqual(plotBox(c), stripBox(c.plot));
  // Oakvale's north gate is about fifteen tiles south of the south gate
  assert.ok(Math.hypot(W.outer.x - 79, W.outer.y - 46) < 16);
});

test("hearthhold: walled shut but for three 3-wide gates (south, west, east), every tile inside reachable through them, all safe", () => {
  assert.deepEqual(G.map((g) => g.side), ["south", "west", "east"]);
  const gap = new Set(G.flatMap((g) => g.tiles.map((t) => t.y * MAP_W + t.x)));
  assert.equal(gap.size, 9);
  assert.deepEqual(G.find((g) => g.side === "south")!.tiles, [65, 66, 67].map((x) => ({ x, y: 40 })));
  assert.deepEqual(G.find((g) => g.side === "west")!.tiles, [26, 27, 28].map((y) => ({ x: 41, y })));
  assert.deepEqual(G.find((g) => g.side === "east")!.tiles, [26, 27, 28].map((y) => ({ x: 92, y })));
  for (let y = B.y; y < B.y + B.h; y++) for (let x = B.x; x < B.x + B.w; x++) {
    if (x !== B.x && y !== B.y && x !== B.x + B.w - 1 && y !== B.y + B.h - 1) continue;
    assert.equal(isSolidTile(x, y), !gap.has(y * MAP_W + x), `wall at ${x},${y}`);
    if (!gap.has(y * MAP_W + x)) assert.equal(OBJECTS[y][x], T[W.style.wall]);
  }
  for (const g of G) {
    assert.ok(!isSolidTile(g.out.x, g.out.y) && !inBox(g.out.x, g.out.y), `${g.side}: open ground outside`);
    assert.ok(g.tiles.some((t) => Math.abs(t.x - g.out.x) + Math.abs(t.y - g.out.y) === 1), `${g.side}: the outside tile is beside the gap`);
  }
  // reachable on foot from Oakvale's square through each gate on its own
  const oak = flood(Math.floor(randomSpawn().x / TILE), Math.floor(randomSpawn().y / TILE));
  for (const g of G) {
    assert.ok(oak[g.out.y * MAP_W + g.out.x], `${g.side}: joined to Oakvale`);
    const shut = new Set(G.filter((o) => o !== g).flatMap((o) => o.tiles.map((t) => t.y * MAP_W + t.x)));
    const seen = flood(g.out.x, g.out.y, (x, y) => !isSolidTile(x, y) && !shut.has(y * MAP_W + x));
    let walk = 0;
    for (let y = B.y; y < B.y + B.h; y++) for (let x = B.x; x < B.x + B.w; x++) if (!isSolidTile(x, y) && !shut.has(y * MAP_W + x)) { walk++; assert.ok(seen[y * MAP_W + x], `${g.side}: ${x},${y} reachable`); }
    assert.ok(walk > 1000);
  }
  for (let y = B.y; y < B.y + B.h; y++) for (let x = B.x; x < B.x + B.w; x++) assert.ok(isSafeZone((x + 0.5) * TILE, (y + 0.5) * TILE), `safe at ${x},${y}`);
  assert.ok(!isSafeZone((B.x - 1) * TILE, (B.y + 5) * TILE));
  // no waygate pair: walk-in gates only
  assert.equal(waygateById("citygate_wardens"), undefined);
  assert.ok(!WAYGATES.some((g) => g.id.endsWith("_wardens")));
});

test("hearthhold: the apron round the walls holds no tree, bush or boulder, and the windmill leaves a body's way past the east wall", () => {
  for (let y = Math.max(1, B.y - CITY_APRON); y < B.y + B.h + CITY_APRON; y++) for (let x = B.x - CITY_APRON; x < B.x + B.w + CITY_APRON; x++) {
    if (inBox(x, y)) continue;
    assert.ok(!NATURE.has(OBJECTS[y][x]), `nature at ${x},${y}`);
  }
  const mill = LANDMARKS.find((l) => l.id === "windmill")!;
  assert.deepEqual([mill.x, mill.y, mill.solid], [94.5, 31.5, [93.6, 30.6, 1.8, 1.8]], "the windmill stands where it stood (owner's default)");
  for (let y = 29; y <= 34; y += 0.25) assert.ok(!blocked((B.x + B.w + 0.3) * TILE, y * TILE), `a body passes between the wall and the windmill at y ${y}`);
});

test("hearthhold: its gates join the highways and roads: south to Oakvale and Goldenreach, west to Hunter's Camp, east to the Watchtower Trail", () => {
  for (const g of G) assert.ok(WORLD.roads.has(g.out.y * MAP_W + g.out.x) && g.tiles.every((t) => WORLD.roads.has(t.y * MAP_W + t.x)), `${g.side}: a road through the gate`);
  const S = G[0], Wg = G[1], E = G[2];
  assert.ok(HIGHWAY_TILES.has(S.out.y * MAP_W + S.out.x) && HIGHWAY_TILES.has(Wg.out.y * MAP_W + Wg.out.x), "the south and west gates open onto the highway");
  assert.equal(GROUND[E.out.y][E.out.x], T.DIRT, "the east gate onto a dirt road");
  const fromS = roadSteps(S.out.x, S.out.y);
  const oak = PORTAL_SPOTS.find((p) => p.id === "oakvale")!, camp = PORTAL_SPOTS.find((p) => p.id === "huntcamp")!;
  const n = roadTo(fromS, 79, 46);
  assert.ok(n >= 0 && n <= 20, `Oakvale's north gate ${n} road steps from the south gate`);
  assert.ok(roadTo(fromS, oak.x, oak.y) >= 0, "Oakvale's stone on road");
  assert.ok(roadTo(fromS, 30, 58) >= 0, "Goldenreach Farms (the seat) on road");
  const fromW = roadSteps(Wg.out.x, Wg.out.y);
  assert.ok(roadTo(fromW, camp.x, camp.y) >= 0, "Hunter's Camp on road from the west gate");
  const fromE = roadSteps(E.out.x, E.out.y), trail = roadTo(fromE, 98, 15, 1);
  assert.ok(trail >= 0 && trail <= 20, "the Watchtower Trail from the east gate");
  // the highway: the new legs; the old ones from Goldenreach's dais and up the West Road through the city's ground are gone
  const oakH = HIGHWAYS.find((h) => h.land === 1)!;
  assert.ok(oakH.legs.some((l) => l.from === "Hearthhold Gate" && l.to === "Oakvale"));
  assert.equal(oakH.seat, "Goldenreach Farms", "the seat stays (owner's default)");
  for (const leg of oakH.legs) for (const k of legLine(oakH, leg)) assert.ok(!inBox(k % MAP_W, Math.floor(k / MAP_W)), `${leg.from} -> ${leg.to}: no leg inside the walls`);
  for (const pts of RETIRED_LEGS) assert.ok(!oakH.legs.some((l) => JSON.stringify(l.pts) === JSON.stringify(pts)), "a retired leg");
  // no city gate dais left at Goldenreach (farmland again)
  const O = OLD_HEARTHHOLD_GATE;
  for (let y = O.y0; y <= O.y1; y++) for (let x = O.x0; x <= O.x1; x++) assert.ok(GROUND[y][x] !== T.FLAGS && GROUND[y][x] !== T.RUBBLE, `old dais at ${x},${y}`);
});

test("hearthhold: signposts by each gate naming it, none inside the walls; Oakvale's north gate post points to it", () => {
  for (const p of SIGNPOSTS) assert.ok(!inBox(p.x, p.y), `a post inside the walls at ${p.x},${p.y}`);
  for (const g of G) {
    const s = SIGNPOSTS.find((p) => Math.hypot(p.x - g.out.x, p.y - g.out.y) <= 4);
    assert.ok(s, `${g.side}: a post by the gate`);
    assert.ok(s.dirs.some((d) => d.name.includes("Hearthhold")), `${g.side}: names Hearthhold (${s.dirs.map((d) => d.name).join(" | ")})`);
  }
  assert.equal(CITY_POSTS.length, CITY_LAND.wardens!.posts.length);
  const north = SIGNPOSTS.find((p) => p.x === 78 && p.y === 46)!;
  assert.ok(north.dirs.some((d) => d.name.includes("Hearthhold") && d.arrow === "↑"), "Oakvale's north gate: Hearthhold up the road");
  const fork = SIGNPOSTS.find((p) => p.x === 50 && p.y === 56)!;
  assert.ok(fork.dirs.some((d) => d.name.includes("Hearthhold")), "the West Road fork names it");
});

test("hearthhold: districts named first (over Goldenreach and North Meadow), people, stash, waystone and props inside", () => {
  const t = cityText(W);
  for (const d of CITY_TEMPLATE.districts) { const c = cityTile(W, { x: d.x + 1, y: d.y + 1 }); assert.equal(areaAt((c.x + 0.5) * TILE, (c.y + 0.5) * TILE), t.districts[d.d]); }
  assert.equal(areaAt(66.5 * TILE, 35.5 * TILE), "Hearthhold Gate Square");
  assert.equal(areaAt(45.5 * TILE, 38.5 * TILE), "Hearthhold Market", "inside Goldenreach's old rect: the city's");
  assert.equal(areaAt(90.5 * TILE, 10.5 * TILE), t.districts.hall, "inside North Meadow's rect: the city's");
  const whole = AREAS.findIndex((a) => a.name === t.name);
  assert.ok(whole >= 0 && AREAS[whole].x === B.x && AREAS[whole].y === B.y && AREAS[whole].w === B.w && AREAS[whole].h === B.h);
  assert.ok(whole < AREAS.findIndex((a) => a.name === "Goldenreach Farms") && whole < AREAS.findIndex((a) => a.name === "North Meadow"));
  assert.ok(!AREAS[whole].mobs?.length);
  for (const n of CITY_TEMPLATE.npcs) {
    const npc = NPCS.find((o) => o.id === cityNpcId(W, n.role))!;
    assert.deepEqual({ x: npc.x, y: npc.y }, cityNpcPx(W, n.role));
    assert.ok(inBox(Math.floor(npc.x / TILE), Math.floor(npc.y / TILE)));
  }
  assert.ok(STASHES.some((s) => cityAt(Math.floor(s.x / TILE), Math.floor(s.y / TILE)) === W), "the stash");
  const ws = PORTAL_SPOTS.find((p) => p.id === "city_wardens")!;
  assert.deepEqual({ x: ws.x, y: ws.y }, cityTile(W, CITY_TEMPLATE.waystone));
  assert.equal(ws.name, "Hearthhold");
  const board = BOARDS.find((b) => b.id === "city_wardens")!;
  assert.ok(inBox(Math.floor(board.x / TILE), Math.floor(board.y / TILE)), "its bounty board by the stone");
});

test("hearthhold: no monster spawns inside or by a gate, no territory inside", () => {
  assert.ok(NO_MOB_AREAS.includes("Hearthhold"));
  for (let y = Math.max(0, B.y - 2); y < B.y + B.h + 2; y++) for (let x = B.x - 2; x < B.x + B.w + 2; x++) assert.ok(noMobsAt((x + 0.5) * TILE, (y + 0.5) * TILE), `no-mob at ${x},${y}`);
  for (const g of G) {
    assert.ok(nearCityGate(g.out.x, g.out.y) && nearCityGate(g.out.x, g.out.y + CITY.gateClear - 1));
    const R = CITY.gateClear, near = SPAWN_ZONES.filter((z) => z.x < g.out.x + R && z.x + z.w > g.out.x - R && z.y < g.out.y + R && z.y + z.h > g.out.y - R);
    assert.ok(near.length > 0, `${g.side}: a zone reaches the gate`);
    for (const z of near) for (let i = 0; i < 300; i++) {
      const p = randomPointInZone(z), tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
      assert.ok(Math.hypot(tx - g.out.x, ty - g.out.y) >= R, `${g.side}: ${z.name} spawned by the gate`);
      assert.ok(!inBox(tx, ty), `${z.name} spawned inside`);
    }
  }
  for (let y = B.y; y < B.y + B.h; y += 3) for (let x = B.x; x < B.x + B.w; x += 3) assert.equal(territoryAt(x, y), undefined, `no territory at ${x},${y}`);
  assert.equal(territoryAt(45, 46)?.name, "Goldenreach Farms", "Goldenreach outside the walls");
  assert.equal(territoryAt(100, 20)?.name, "North Meadow");
});

test("hearthhold: Goldenreach's north field four rows shorter, fenced with a gap on every side; the barn, hay, Hold and standards stay", () => {
  // the fence's new top row 42 with its gap at 35..37; nothing of the old field above it
  for (let x = 28; x <= 45; x++) assert.equal(OBJECTS[42][x], x >= 35 && x <= 37 ? EMPTY : T.FENCE, `top fence at ${x}`);
  for (let y = 38; y <= 41; y++) for (let x = 28; x <= 45; x++) if (!inBox(x, y)) {
    assert.ok(OBJECTS[y][x] !== T.FENCE && OBJECTS[y][x] !== T.FENCE_V && GROUND[y][x] !== T.FIELD, `old field at ${x},${y}`);
  }
  for (let y = 43; y <= 53; y++) for (const x of [28, 45]) assert.equal(OBJECTS[y][x], y >= 45 && y <= 47 ? EMPTY : T.FENCE_V, `side fence at ${x},${y}`);
  for (let x = 28; x <= 45; x++) assert.equal(OBJECTS[54][x], x >= 35 && x <= 37 ? EMPTY : T.FENCE, "the bottom fence as it was");
  assert.equal(OBJECTS[44][33], T.HAY); assert.equal(OBJECTS[49][40], T.HAY);
  assert.deepEqual(HOLDS.filter((h) => h.site === "capital" && h.anchor === "Goldenreach Farms").map((h) => [h.x / TILE, h.y / TILE]), [[26.5, 58.5]]);
  assert.deepEqual(STANDARDS.filter((s) => s.t === HOLDS.find((h) => h.anchor === "Goldenreach Farms")!.t).map((s) => [s.x / TILE, s.y / TILE]), [[30.5, 49.5], [34.5, 68.5]]);
  assert.equal(OBJECTS[38][14], T.WALL_TIMBER, "the barn");
});

test("hearthhold: forts, musters, chests, siege sites, landmarks, quest objects and older stones as before; 25 forts, 14 of 20 pass ends", () => {
  assert.equal(HOLDS.length, 25);
  let n = 0;
  for (const b of BORDERS) for (const e of [b.a, b.b]) { const [x, y] = endPath(e)[0]; if (HOLDS.some((h) => Math.hypot(h.x / TILE - x, h.y / TILE - y) <= 30)) n++; }
  assert.equal(n, 14);
  // the digests taken on the map before the move (default branch after #571)
  assert.equal(digest(HOLDS, (h) => [h.t, Math.round(h.x), Math.round(h.y)]), "25:9caa51d");
  assert.equal(digest(MUSTERS, (h) => [h.t, Math.round(h.x), Math.round(h.y)]), "72:82341353");
  assert.equal(digest(STANDARDS, (s) => [s.id, s.t, Math.round(s.x), Math.round(s.y)]), "132:d5da7132");
  assert.equal(digest(CHESTS, (c) => [c.id, Math.round(c.x), Math.round(c.y)]), "53:e7366e42");
  assert.equal(digest(SIEGE_SITES, (s) => [s.tx, s.ty]), "14:cac2c0c9");
  assert.equal(digest(LANDMARKS, (l) => [l.id, l.x, l.y, l.solid ?? null]), "6:4b449bf7");
  assert.equal(digest(allObjects(), (o) => [o.id, Math.round(o.x), Math.round(o.y)]), "213:663e782a");
  assert.equal(digest(PORTAL_SPOTS.filter((p) => p.id !== "city_wardens"), (p) => [p.id, p.x, p.y]), "42:5ad6fb7c");
  const camp = PORTAL_SPOTS.find((p) => p.id === "huntcamp")!;
  assert.deepEqual([camp.x, camp.y], [38, 20], "Hunter's Camp stone");
  for (const c of CHESTS) assert.ok(!inBox(Math.floor(c.x / TILE), Math.floor(c.y / TILE)), `${c.id}: not inside the walls`);
});

test("hearthhold: carved only inside CITY_MASK, deterministic; the map before it is kept for chests and siege sites", () => {
  const before = WORLD.cityBefore;
  assert.ok(before.size > 1500, `${before.size} tiles changed`);
  for (const k of before.keys()) assert.ok(CITY_MASK.has(k), `${k % MAP_W},${Math.floor(k / MAP_W)}: in the mask`);
  for (const k of CITY_MASK) assert.ok(Math.floor(k / MAP_W) < WORLD_H, "the mask lies in Act 1");
  // the carve again on the map before it: the same city, tile for tile, inside the walls (the highways skip the box)
  const g = GROUND.map((r) => [...r]), o = OBJECTS.map((r) => [...r]);
  for (const [k, v] of before) { g[Math.floor(k / MAP_W)][k % MAP_W] = v.g; o[Math.floor(k / MAP_W)][k % MAP_W] = v.o; }
  const posts = [{ x: 84, y: 25 }, { x: 10, y: 10 }], roads = new Set<number>([(B.y + 5) * MAP_W + B.x + 5]);
  const r = carveCitiesInLand(T, g, o, EMPTY, roads, posts, () => T.GRASS);
  for (let y = B.y; y < B.y + B.h; y++) { assert.deepEqual(g[y].slice(B.x, B.x + B.w), GROUND[y].slice(B.x, B.x + B.w)); assert.deepEqual(o[y].slice(B.x, B.x + B.w), OBJECTS[y].slice(B.x, B.x + B.w)); }
  assert.deepEqual(posts, [{ x: 10, y: 10 }], "the post inside the walls dropped");
  assert.ok(!roads.has((B.y + 5) * MAP_W + B.x + 5), "no road left inside but the through streets");
  assert.ok(roads.has((B.y + 26) * MAP_W + B.x + 20) && roads.has((B.y + 33) * MAP_W + B.x + 25), "the cross street and the gate square's middle are roads");
  assert.deepEqual(r.areas.map((a) => a.name), [...CITY_TEMPLATE.districts.map((d) => cityText(W).districts[d.d]), cityText(W).name]);
  assert.deepEqual(r.posts, CITY_LAND.wardens!.posts);
});

test("hearthhold: relocateCitySpot moves a spot in the old band plot to the same place in the city; anywhere else stays", () => {
  const o = stripBox(W.plot);
  const a = relocateCitySpot((o.x + 25.5) * TILE, (o.y + 33.25) * TILE);
  assert.deepEqual(a, { x: (B.x + 25.5) * TILE, y: (B.y + 33.25) * TILE });
  assert.equal(cityAt(Math.floor(a.x / TILE), Math.floor(a.y / TILE)), W);
  for (const p of [{ x: 100, y: 200 }, { x: (stripBox(1).x + 5) * TILE, y: (stripBox(1).y + 5) * TILE }, { x: (o.x - 1) * TILE, y: (o.y + 5) * TILE }]) assert.deepEqual(relocateCitySpot(p.x, p.y), p);
});

test("hearthhold: every walkable tile of Oakvale's lands is reachable from its square on foot (map-metrics)", () => {
  const s = randomSpawn(), seen = flood(Math.floor(s.x / TILE), Math.floor(s.y / TILE));
  let walk = 0, reach = 0;
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < MAP_W; x++) if (!isSolidTile(x, y)) { walk++; if (seen[y * MAP_W + x]) reach++; else assert.fail(`unreachable ${x},${y}`); }
  assert.equal(reach, walk);
});
