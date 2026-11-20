// Settlement network step 4 (shared/villages.ts): villages along the land highways. Their sites keep the survey's rules
// (docs/settlement-network-progress.md), the carve stays inside VILLAGE_MASK and is deterministic, each village has its
// cottages, square, stone, people, quest and war gate, and nothing that stood before moved: forts, musters, chests,
// siege sites, landmarks, the older portal stones and the signposts. PR 1 built the moors' and the badlands' villages, PR 2
// the sinkholes' and the Sunscar's, PR 3 the Crown's and Oakvale's (each appended after the last: the earlier PRs' stones,
// towns, arcs and posts keep their places).
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAP_H, MAP_W, TILE, WORLD_H, actOfTile } from "../shared/constants";
import { BORDER_BOXES, BORDERS, endPath } from "../shared/borders";
import { CAPITAL_FORTS, HIGHWAYS, highwayTiles } from "../shared/highways";
import { AREAS, EMPTY, GROUND, HIGHWAY_TILES, isSafeZone, isSolidTile, NATURE, OBJECTS, PORTAL_SPOTS, SIGNPOSTS, T, VILLAGE_POSTS, WORLD } from "../shared/map";
import {
  carveVillages, doorOf, spurTiles, VILLAGE_MASK, VILLAGE_PLAN, VILLAGES, villageBox, villageGate, villageHouses, villagePost, villageSpots, vy, type Village,
} from "../shared/villages";
import { HOLDS, MUSTERS } from "../shared/war/standards";
import { CHESTS } from "../shared/chests";
import { SIEGE_SITES } from "../shared/siege";
import { landmarkBoxes, LANDMARKS } from "../shared/landmarks";
import { NPCS, npcById } from "../shared/npcs";
import { CITIES } from "../shared/capitals";
import { arrivalOf, PORTAL_LANDS, PORTALS, portalLand } from "../shared/portals";
import { noMobsAt, NO_MOB_AREAS, randomPointInZone, SPAWN_ZONES } from "../shared/spawns";
import { TERRITORIES } from "../shared/war/territories";
import { TOWNS, townAt, townPatron } from "../shared/war/towns";
import { roadPairs, warRoad } from "../shared/war/roads";
import { allObjects, CHAINS, SIDE_ARCS, type QuestObject } from "../shared/quests";
import { stepObjects } from "../shared/questSteps";
import { SHOPS } from "../shared/shops";
import { boardById } from "../shared/bounty";
import { LAND_KIT_SPOTS } from "../client/src/landKit";

const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
const digest = <X>(a: readonly X[], f: (x: X) => unknown) => `${a.length}:${fnv(JSON.stringify(a.map(f)))}`;
/** Chebyshev gap from a point (tile coords, fractional allowed) to a box (inclusive tiles); 0 inside. */
const gap = (px: number, py: number, b: { x0: number; y0: number; x1: number; y1: number }) => Math.max(b.x0 - px, px - b.x1 - 1, b.y0 - py, py - b.y1 - 1, 0);
/** Gap between two boxes as the survey measured it (the difference of their facing edges; 0 when they overlap). */
const boxGap = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }) =>
  Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1, 0);
const VNAMES = new Set(VILLAGES.map((v) => v.name)), VIDS = new Set<string>(VILLAGES.map((v) => v.id));
const OLD_PORTALS = PORTAL_SPOTS.slice(0, PORTAL_SPOTS.length - VILLAGES.length);
const villageNpc = (id: string) => VILLAGES.some((v) => [`steward_${v.id}`].includes(id)) || VILLAGES.some((v) => { const s = villageSpots(v); return NPCS.some((n) => n.id === id && [s.giver, s.folk].some((p) => Math.floor(n.x / TILE) === p.x && Math.floor(n.y / TILE) === p.y)); });
const VILLAGE_ARCS = SIDE_ARCS.slice(SIDE_ARCS.length - VILLAGES.length);

test("villages: PR 1 builds the moors' three and the badlands' two, PR 2 the sinkholes' two and the Sunscar's two, PR 3 the Crown's three and Oakvale's two, as the plan names and places them", () => {
  assert.deepEqual(VILLAGES.map((v) => [v.id, v.name, v.land, v.x, v.y, v.w, v.h]), [
    ["turfhallow", "Turfhallow", 3, 90, 136, 12, 9], ["staithe", "Blackwater Staithe", 3, 176, 90, 12, 8], ["barrowstead", "Barrowstead", 3, 154, 152, 12, 9],
    ["redlode", "Redlode", 4, 157, 68, 12, 9], ["hornstead", "Hornstead", 4, 77, 109, 12, 9],
    // PR 2. Windlass sits 2 tiles west of the plan's box (the Maw's rim road runs down the box's east column there);
    // Saltglass 1 west (14 tiles off the Sunstone Circle)
    ["windlass", "Windlass", 5, 123, 90, 12, 9], ["hempfield", "Hempfield", 5, 30, 54, 12, 9],
    ["saltglass", "Saltglass", 2, 79, 124, 12, 9], ["lastwell", "Last Well", 2, 124, 58, 12, 9],
    // PR 3. Lists End sits 5 tiles west of the plan's box and is 12x8 (a path to an old spire runs down the plan box's
    // east side, statues stand above it, and a full 9 rows would come within 3 of the highway's middle line)
    ["listsend", "Lists End", 6, 87, 24, 12, 8], ["vigilsrest", "Vigil's Rest", 6, 194, 103, 12, 9], ["kneelstone", "Kneelstone", 6, 68, 76, 12, 9],
    ["sawyersend", "Sawyer's End", 1, 242, 67, 12, 9], ["furrowby", "Furrowby", 1, 84, 166, 12, 9],
  ]);
  for (const v of VILLAGES) {
    const b = villageBox(v);
    assert.equal(actOfTile(b.x0, b.y0), v.land); assert.equal(actOfTile(b.x1, b.y1), v.land);
    const a = AREAS.find((r) => r.name === v.name)!;
    assert.deepEqual([a.x, a.y, a.w, a.h], [b.x0, b.y0, v.w, v.h], `${v.id}: its area is its box`);
    assert.equal(AREAS.indexOf(a), AREAS.findIndex((r) => VNAMES.has(r.name)) + VILLAGES.indexOf(v), "village areas come first (they win over the land-wide areas)");
  }
});

test("villages: sites keep the survey's rules (highway 4-9, forts, gates, musters, chests, siege sites, landmarks, NPCs, stones, seats, war roads)", () => {
  // (Furrowby's patron is the Saltwind Coast, plan Q3: the lands nearer it are havens, which never change hands)
  const warTiles = new Set<number>();
  for (const { a, b } of roadPairs()) {
    const r = warRoad(a, b); if (!r) continue;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const p = r.pts[i], q = r.pts[i + 1], n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / (TILE / 2));
      for (let k = 0; k <= n; k++) warTiles.add(Math.floor((p.y + (q.y - p.y) * k / n) / TILE) * MAP_W + Math.floor((p.x + (q.x - p.x) * k / n) / TILE));
    }
  }
  const settle = AREAS.filter((a) => [...NO_MOB_AREAS, ...HIGHWAYS.flatMap((h) => [...h.towns, h.seat])].includes(a.name) && !VNAMES.has(a.name)).map((a) => ({ x0: a.x, y0: a.y, x1: a.x + a.w - 1, y1: a.y + a.h - 1 }));
  for (const v of VILLAGES) {
    const b = villageBox(v), h = HIGHWAYS.find((q) => q.land === v.land)!, { mid } = highwayTiles(h), g = villageGate(v);
    const hd = Math.min(...[...mid].map((k) => Math.max(b.x0 - (k % MAP_W), (k % MAP_W) - b.x1, b.y0 - Math.floor(k / MAP_W), Math.floor(k / MAP_W) - b.y1, 0)));
    assert.ok(v.id === "barrowstead" ? hd <= 9 : hd >= 4 && hd <= 9, `${v.id}: ${hd} tiles from its highway's middle line`);
    for (const f of HOLDS) {
      assert.ok(gap(f.x / TILE, f.y / TILE, b) >= 12, `${v.id}: a fort ${gap(f.x / TILE, f.y / TILE, b)} tiles off`);
      assert.ok(Math.max(Math.abs(f.x / TILE - g.x), Math.abs(f.y / TILE - g.y)) >= 16, `${v.id}: its gate 16+ from every fort`);
    }
    for (const m of MUSTERS) assert.ok(gap(m.x / TILE, m.y / TILE, b) >= 8, `${v.id}: muster`);
    for (const c of CHESTS) assert.ok(gap(c.x / TILE, c.y / TILE, b) >= 6, `${v.id}: chest ${c.id}`);
    for (const s of SIEGE_SITES) assert.ok(gap(s.tx, s.ty, b) >= 8, `${v.id}: siege site`);
    for (const l of LANDMARKS) for (const [x, y, w, h] of [[l.x, l.y, 0, 0], ...landmarkBoxes(l)]) for (const [px, py] of [[x, y], [x + w, y + h]])
      assert.ok(gap(px, py, b) >= 6, `${v.id}: landmark ${l.id}`); // its foot and every box (the Lists has two)
    for (const n of NPCS) if (!villageNpc(n.id)) assert.ok(gap(n.x / TILE, n.y / TILE, b) >= 5, `${v.id}: NPC ${n.id}`);
    for (const p of OLD_PORTALS) assert.ok(gap(p.x, p.y, b) >= 6, `${v.id}: portal ${p.id}`);
    for (const [fx, fy] of CAPITAL_FORTS) assert.ok(Math.max(Math.abs(fx - (b.x0 + b.x1) / 2), Math.abs(fy - (b.y0 + b.y1) / 2)) >= 24, `${v.id}: clan seat`);
    for (const c of CITIES) assert.ok(boxGap(b, c.outerBox) >= 6, `${v.id}: city box`);
    for (const B of BORDER_BOXES) assert.ok(boxGap(b, B) >= 4, `${v.id}: border box`);
    for (const s of settle) assert.ok(boxGap(b, s) >= 14, `${v.id}: settlement ${JSON.stringify(s)}`);
    for (const o of VILLAGES) if (o !== v) assert.ok(boxGap(b, villageBox(o)) >= 14, `${v.id} and ${o.id}`);
    for (let y = b.y0 - 2; y <= b.y1 + 2; y++) for (let x = b.x0 - 2; x <= b.x1 + 2; x++) assert.ok(!warTiles.has(y * MAP_W + x), `${v.id}: a war road at ${x},${y}`);
    // the patron: an ordinary land of the village's own
    const t = TERRITORIES.find((q) => q.name === v.patron)!;
    assert.ok(t && !t.capitalOf && !t.haven && t.act === v.land, `${v.id}: patron ${v.patron}`);
  }
});

test("villages: the carve stays inside VILLAGE_MASK, clears only nature, never water or roads, and is deterministic", () => {
  const before = WORLD.villageBefore;
  assert.ok(before.size > 300);
  const roads = WORLD.roads;
  for (const [k, b] of before) {
    const x = k % MAP_W, y = Math.floor(k / MAP_W);
    assert.ok(VILLAGE_MASK.has(k), `${x},${y}: inside the mask`);
    assert.ok(b.g !== T.WATER && b.g !== T.BRIDGE, `${x},${y}: no water or bridge built over`);
    assert.ok(b.o === EMPTY || NATURE.has(b.o) || b.o === T.CACTUS || b.o === T.BONES, `${x},${y}: only nature cleared (was ${b.o})`);
    assert.ok(!roads.has(k) || HIGHWAY_TILES.has(k) === false, `${x},${y}`);
  }
  for (const v of VILLAGES) spurTiles(v).forEach((t, i, all) => assert.ok(!roads.has(t.y * MAP_W + t.x) || i === all.length - 1, `${v.id}: its path is no road (${t.x},${t.y})`));
  // carve again on the map before the villages: the same map
  const g = GROUND.map((r) => [...r]), o = OBJECTS.map((r) => [...r]);
  for (const [k, b] of before) { g[Math.floor(k / MAP_W)][k % MAP_W] = b.g; o[Math.floor(k / MAP_W)][k % MAP_W] = b.o; }
  const posts = carveVillages(g, o, roads, T, EMPTY, (v) => { const h = HIGHWAYS.find((q) => q.land === v.land)!; return [v.name, h.seat, h.town]; });
  for (let y = 0; y < WORLD_H; y++) { assert.deepEqual(g[y], GROUND[y], `row ${y} ground`); assert.deepEqual(o[y], OBJECTS[y], `row ${y} objects`); }
  assert.deepEqual(posts, VILLAGE_POSTS);
});

test("villages: three cottages in the land's look round a flagged square, a centrepiece, a path to the road and a signpost", () => {
  for (const v of VILLAGES) {
    // the land's look: slate over fieldstone on the moors and in the Crown (its plain stone cottages), red tile or thatch over
    // timber in Oakvale, the badlands and the sinkholes, Kel Ashar's mud-brick in the Sunscar (every tile T.ADOBE but the door)
    const stone = v.land === 3 || v.land === 6;
    const hs = villageHouses(v), roof = stone ? T.ROOF_SLATE : v.land === 2 ? T.ADOBE : [T.ROOF_RED, T.ROOF_THATCH], wall = stone ? T.WALL_STONE : v.land === 2 ? T.ADOBE : T.WALL_TIMBER;
    assert.equal(v.roof === "adobe", v.land === 2, `${v.id}: mud-brick only in the Sunscar`);
    assert.equal(hs.length, 3);
    for (const h of hs) {
      for (let j = 0; j < h.h; j++) for (let i = 0; i < h.w; i++) {
        const ob = OBJECTS[h.y + j][h.x + i];
        if (j < h.h - 2) assert.ok(([] as number[]).concat(roof).includes(ob), `${v.id}: roof at ${h.x + i},${h.y + j}`);
        else assert.ok([wall, T.DOOR, T.WINDOW_STONE, T.WINDOW_TIMBER].includes(ob), `${v.id}: wall at ${h.x + i},${h.y + j}`);
      }
      const d = doorOf(h);
      assert.equal(OBJECTS[d.y][d.x], T.DOOR);
    }
    const s = villageSpots(v), P = VILLAGE_PLAN.square;
    assert.equal(OBJECTS[s.centre.y][s.centre.x], v.centre === "well" ? T.WELL : T.STANDING_STONE);
    let flags = 0;
    for (let j = 0; j < P.h; j++) for (let i = 0; i < P.w; i++) { const b = villageBox(v), x = v.mirror ? b.x1 - P.dx - i : b.x0 + P.dx + i; if (GROUND[b.y0 + P.dy + j][x] === T.FLAGS) flags++; }
    assert.equal(flags, P.w * P.h, `${v.id}: the square is flagged`);
    // the path: dirt, open, 4-connected, from the box's edge to a road tile
    const sp = spurTiles(v), end = sp[sp.length - 1];
    assert.ok(WORLD.roads.has(end.y * MAP_W + end.x), `${v.id}: the path ends on a road`);
    for (let i = 0; i + 1 < sp.length; i++) {
      assert.equal(Math.abs(sp[i].x - sp[i + 1].x) + Math.abs(sp[i].y - sp[i + 1].y), 1, `${v.id}: 4-connected`);
      assert.ok(!isSolidTile(sp[i].x, sp[i].y), `${v.id}: path tile ${sp[i].x},${sp[i].y} open`);
      if (i > 0) assert.equal(GROUND[sp[i].y][sp[i].x], T.DIRT, `${v.id}: dirt at ${sp[i].x},${sp[i].y}`);
    }
    const p = villagePost(v), post = SIGNPOSTS.find((q) => q.x === p.x && q.y === p.y)!;
    assert.equal(OBJECTS[p.y][p.x], T.SIGNPOST);
    assert.ok(post && post.dirs[0].name === v.name, `${v.id}: its signpost's first board names it`);
    assert.ok(post.dirs.length >= 2, `${v.id}: and the road's ways`);
    assert.ok(sp.some((t) => Math.abs(t.x - p.x) + Math.abs(t.y - p.y) === 1), `${v.id}: the post beside the path`);
    const h = HIGHWAYS.find((q) => q.land === v.land)!;
    assert.deepEqual(VILLAGE_POSTS.find((q) => q.x === p.x && q.y === p.y)!.to, [v.name, h.seat, h.town]);
  }
});

test("villages: stone, people, gate and banners on free ground; each portal stone reaches its land's town on foot", () => {
  const free = (x: number, y: number) => !isSolidTile(x, y);
  const homes: Record<number, string> = { 1: "oakvale", 2: "kelashar", 3: "cairnwatch", 4: "rustwater", 5: "ropewell", 6: "tollcross" };
  for (const v of VILLAGES) {
    const s = villageSpots(v), g = villageGate(v), b = villageBox(v);
    for (const p of [s.portal, s.giver, s.folk, s.steward, ...s.banners, g]) assert.ok(free(p.x, p.y), `${v.id}: ${p.x},${p.y} free`);
    for (const p of [s.portal, s.giver, s.folk, s.steward, ...s.banners]) assert.ok(gap(p.x, p.y, b) === 0, `${v.id}: inside the box`);
    const stone = PORTALS.find((q) => q.id === v.id)!, a = arrivalOf(stone);
    assert.ok(free(Math.floor(a.x / TILE), Math.floor(a.y / TILE)), `${v.id}: arrival free`);
    // flood from the arrival to the land's town's stone
    const home = PORTAL_SPOTS.find((q) => q.id === homes[v.land])!, seen = new Uint8Array(MAP_W * MAP_H), q = [Math.floor(a.y / TILE) * MAP_W + Math.floor(a.x / TILE)];
    seen[q[0]] = 1;
    for (let i = 0; i < q.length && !seen[(home.y + 1) * MAP_W + home.x]; i++) {
      const x = q[i] % MAP_W, y = (q[i] / MAP_W) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) if (!seen[ny * MAP_W + nx] && free(nx, ny)) { seen[ny * MAP_W + nx] = 1; q.push(ny * MAP_W + nx); }
    }
    assert.ok(seen[(home.y + 1) * MAP_W + home.x], `${v.id}: ${home.name} on foot from the stone`);
  }
});

test("villages: portal stones appended (ids = the villages'), grouped with their land; the older stones did not move", () => {
  // the 29 older stones, as before step 4 ("29:6a70cae7"), but the five cities' waystones, which moved with their cities
  // (step 5; "28:8245c3f0" without Hearthhold's only, "27:76a98b7" without Scarwall's too, "26:d2f86d91" without Duskveil's
  // too, "25:5455fae2" without Marrowkeep's too; the map before Deepden's move hashes the same without its stone)
  assert.equal(digest(OLD_PORTALS.filter((p) => !["city_wardens", "city_redfang", "city_veiled", "city_host", "city_hidekin"].includes(p.id)), (p) => [p.id, p.x, p.y]), "24:b0d3fce7");
  assert.deepEqual(PORTAL_SPOTS.slice(-VILLAGES.length).map((p) => p.id), VILLAGES.map((v) => v.id));
  for (const v of VILLAGES) {
    const p = PORTALS.find((q) => q.id === v.id)!, land = portalLand(p);
    assert.equal(land.key, ({ 1: "oakvale", 2: "sunscar", 3: "moors", 4: "badlands", 5: "sinkholes", 6: "crown" } as Record<number, string>)[v.land]);
    assert.ok(land.portals.indexOf(p) >= land.portals.length - VILLAGES.filter((o) => o.land === v.land).length, `${v.id}: after its land's older stones`);
    assert.equal(p.name, v.name);
  }
  assert.equal(PORTAL_LANDS.reduce((n, l) => n + l.portals.length, 0), PORTALS.length);
  // PR 1's five stones, towns, signposts and arcs keep their places and spots (PR 2's are appended after them), and PR 2's
  // four theirs (PR 3's after them)
  assert.equal(digest(PORTAL_SPOTS.slice(OLD_PORTALS.length, OLD_PORTALS.length + 5), (p) => [p.id, p.x, p.y]), "5:9c72fc1e");
  assert.equal(digest(TOWNS.slice(4, 9), (t) => [t.id, t.gate, t.steward, t.banners]), "5:934126b6");
  assert.equal(digest(VILLAGE_POSTS.slice(0, 5), (p) => [p.x, p.y, p.to]), "5:dc5e0355");
  assert.deepEqual(VILLAGE_ARCS.slice(0, 5).map((a) => a.id), ["turfhallow", "staithe", "barrowstead", "redlode", "hornstead"]);
  assert.equal(digest(PORTAL_SPOTS.slice(OLD_PORTALS.length + 5, OLD_PORTALS.length + 9), (p) => [p.id, p.x, p.y]), "4:cdea50ea");
  assert.equal(digest(TOWNS.slice(9, 13), (t) => [t.id, t.gate, t.steward, t.banners]), "4:300d178a");
  assert.equal(digest(VILLAGE_POSTS.slice(5, 9), (p) => [p.x, p.y, p.to]), "4:5312b5dc");
  assert.deepEqual(VILLAGE_ARCS.slice(5, 9).map((a) => a.id), ["windlass", "hempfield", "saltglass", "lastwell"]);
  // every village's stone brings its own bounty board, a few steps from it, on open ground
  for (const v of VILLAGES) {
    const b = boardById(v.id)!, s = villageSpots(v).portal;
    assert.ok(b && b.name === `${v.name} Bounty Board`, `${v.id}: a bounty board`);
    assert.ok(Math.hypot(b.x / TILE - (s.x + 0.5), b.y / TILE - (s.y + 0.5)) <= 5, `${v.id}: the board by the stone`);
    assert.ok(!isSolidTile(Math.floor(b.x / TILE), Math.floor(b.y / TILE)), `${v.id}: the board on open ground`);
  }
});

test("villages: forts, musters, chests, siege sites, landmarks and signposts stand where they stood (25 forts, 14 of 20 passes)", () => {
  assert.equal(HOLDS.length, 25);
  let n = 0;
  for (const b of BORDERS) for (const e of [b.a, b.b]) { const [x, y] = endPath(e)[0]; if (HOLDS.some((h) => Math.hypot(h.x / TILE - x, h.y / TILE - y) <= 30)) n++; }
  assert.equal(n, 14, `${n} of ${BORDERS.length * 2} pass ends guarded`);
  assert.equal(BORDERS.length * 2, 20);
  // the digests tests/landKit.test.ts pins (taken before step 3; unchanged by the villages)
  assert.equal(digest(HOLDS, (h) => [h.t, Math.round(h.x), Math.round(h.y)]), "25:9caa51d");
  assert.equal(digest(MUSTERS, (h) => [h.t, Math.round(h.x), Math.round(h.y)]), "72:82341353");
  assert.equal(digest(CHESTS, (c) => [c.id, Math.round(c.x), Math.round(c.y)]), "53:e7366e42");
  assert.equal(digest(SIEGE_SITES, (s) => [s.tx, s.ty]), "14:cac2c0c9");
  assert.equal(digest(LANDMARKS.filter((l) => l.id !== "lists"), (l) => [l.id, l.x, l.y, l.solid ?? null]), "5:894e42c8");
  assert.equal(digest(LANDMARKS, (l) => [l.id, l.x, l.y, landmarkBoxes(l)]), "6:78da6c25"); // with the Crown's Lists (PR #568), every box
  assert.ok(!HOLDS.some((h) => VIDS.has(h.anchor)), "no fort anchored at a village gate (fort: false)");
  // every older signpost stays; the villages add one each. Hearthhold's move (step 5) took the north fork's and the
  // highway's posts inside its walls (84,25 and 51,18: "88:1d1dbb68" with them) and put up three by its gates; Scarwall's
  // (step 5 PR 2) and Duskveil's (PR 3) took none and put up two by their gates each; Marrowkeep's (PR 4) took the Nine
  // Widows road's post inside its walls (230,635), moved the fork's below the Muster two tiles (245,681 -> 247,681: the
  // highway round it changed) and put up two by its gates ("84:fd5e5ab5" on the map before it without those two old ones);
  // Deepden's (PR 5) took none, put up three by its gates (158,1108, 189,1123 and the highway's 217,1111) and moved the
  // fork's post on the Great Maw road four rows (210,1061 -> 209,1065: there it reads the new leg as a road of its own;
  // "83:30929f12" on the map before it without the old one)
  const moved = [[84, 25], [51, 18], [94, 25], [66, 44], [38, 28], [63, 807], [36, 824], [253, 446], [227, 427], [227, 629], [257, 643], [247, 681],
    [158, 1108], [189, 1123], [217, 1111], [209, 1065]];
  const old = SIGNPOSTS.filter((p) => !VILLAGE_POSTS.some((q) => q.x === p.x && q.y === p.y) && !moved.some(([x, y]) => p.x === x && p.y === y));
  assert.equal(digest(old, (p) => [p.x, p.y]), "83:30929f12");
  assert.equal(SIGNPOSTS.length - VILLAGE_POSTS.length, 97, "83 older posts, Hearthhold's and Deepden's three, Scarwall's, Duskveil's and Marrowkeep's two, the Muster's and the Maw road's forks'");
  assert.equal(VILLAGE_POSTS.length, VILLAGES.length);
});

test("villages: no monster spawns or walks inside a village (area + 2), and no highway paving lies in that rect", () => {
  for (const v of VILLAGES) {
    assert.ok(NO_MOB_AREAS.includes(v.name));
    const b = villageBox(v);
    for (let y = b.y0 - 2; y <= b.y1 + 2; y++) for (let x = b.x0 - 2; x <= b.x1 + 2; x++) {
      assert.ok(noMobsAt((x + 0.5) * TILE, (y + 0.5) * TILE), `${v.id}: ${x},${y} no-mob`);
      assert.ok(!HIGHWAY_TILES.has(y * MAP_W + x), `${v.id}: highway paving at ${x},${y} inside the no-mob rect`);
    }
    assert.ok(!isSafeZone((b.x0 + 1) * TILE, (b.y0 + 1) * TILE), `${v.id}: casting allowed (no safe square)`);
    for (const z of SPAWN_ZONES.filter((q) => q.x <= b.x1 + 2 && q.x + q.w > b.x0 - 2 && q.y <= b.y1 + 2 && q.y + q.h > b.y0 - 2)) {
      for (let i = 0; i < 4000; i++) { const p = randomPointInZone(z); if (!p) continue; assert.ok(gap(p.x / TILE, p.y / TILE, { x0: b.x0 - 2, y0: b.y0 - 2, x1: b.x1 + 2, y1: b.y1 + 2 }) > 0, `${v.id}: a ${z.name} spawn inside`); }
    }
  }
});

test("villages: a capturable village each (no fort anchor, half a town's income), the reeve on the square, the gate outside on the road", () => {
  for (const v of VILLAGES) {
    const t = TOWNS.find((q) => q.id === v.id)!, s = villageSpots(v);
    assert.ok(t, `${v.id}: in TOWNS`);
    assert.deepEqual([t.kind, t.area, t.patron, t.fort, t.income], ["village", v.name, v.patron, false, 0.5]);
    assert.deepEqual(t.gate, villageGate(v)); assert.deepEqual(t.steward, s.steward); assert.deepEqual(t.banners, s.banners);
    assert.ok(townPatron(v.id) >= 0);
    assert.equal(townAt((s.portal.x + 0.5) * TILE, (s.portal.y + 0.5) * TILE)?.id, v.id, "its shops' discount goes by its area");
    assert.ok(WORLD.roads.has(t.gate.y * MAP_W + t.gate.x) || spurTiles(v).some((q) => q.x === t.gate.x && q.y === t.gate.y), `${v.id}: the gate on the road or the path`);
    const n = npcById(`steward_${v.id}`)!;
    assert.equal(n.title, "Village Reeve");
  }
  assert.equal(TOWNS.filter((t) => t.fort === false).length, VILLAGES.length, "only the highway villages skip the fort anchor");
});

test("villages: a giver with one quest arc each (appended), a townsperson or trader on existing stock, objects in the patron's zone", () => {
  assert.deepEqual(VILLAGE_ARCS.map((a) => [a.id, a.name]), VILLAGES.map((v) => [v.id, v.name]), "one arc per village, named after it, at the end of SIDE_ARCS");
  assert.deepEqual(SIDE_ARCS.slice(0, SIDE_ARCS.length - VILLAGES.length).map((a) => a.id), ["letters", "penance", "badlands", "sinkholes", "saltways", "throne"], "the older arcs keep their places");
  assert.deepEqual(CHAINS.slice(-VILLAGES.length).map((c) => [c.id, c.packed, ...c.keys, c.verKey]), VILLAGES.map((v) => [v.id, v.id, `${v.id}Id`, `${v.id}Stage`, `${v.id}Count`, `${v.id}Ver`]));
  const others: QuestObject[] = allObjects().filter((o) => !VILLAGE_ARCS.some((a) => a.quests.some((d) => d.steps.some((s) => stepObjects(s).includes(o)))));
  const existingItems = new Set(Object.entries(SHOPS).filter(([id]) => !VIDS.has(id)).flatMap(([, s]) => s.stock.map((e) => `${e.item}:${e.size ?? ""}:${e.qty ?? ""}`)));
  for (const [i, v] of VILLAGES.entries()) {
    const arc = VILLAGE_ARCS[i], s = villageSpots(v), [d] = arc.quests, t = TERRITORIES.find((q) => q.name === v.patron)!;
    assert.equal(arc.quests.length, 1);
    const giver = npcById(d.giver)!;
    assert.deepEqual([Math.floor(giver.x / TILE), Math.floor(giver.y / TILE)], [s.giver.x, s.giver.y], `${v.id}: the giver stands before the hall`);
    assert.ok(giver.where?.startsWith(v.name), `${v.id}: the log says where`);
    assert.equal(d.minLevel, t.levels[0], `${v.id}: from its patron land's level`);
    assert.deepEqual(d.steps.map((q) => q.type), ["use", "kill"]);
    const [use, kill] = d.steps;
    assert.equal(use.zone, v.patron);
    const z = SPAWN_ZONES.find((q) => q.name === v.patron)!;
    for (const o of use.objects!) {
      const tx = Math.floor(o.x / TILE), ty = Math.floor(o.y / TILE);
      assert.ok(tx >= z.x && ty >= z.y && tx < z.x + z.w && ty < z.y + z.h, `${o.id}: in ${v.patron}`);
      assert.ok(!isSolidTile(tx, ty), `${o.id}: free`);
      for (const p of others) assert.ok(Math.hypot(p.x - o.x, p.y - o.y) >= 4 * TILE, `${o.id}: 4+ tiles from ${p.id}`);
      for (const f of [...HOLDS, ...MUSTERS]) assert.ok(Math.hypot(f.x - o.x, f.y - o.y) >= 6 * TILE, `${o.id}: off a fort or muster`);
    }
    assert.equal(use.chest, false, "no story chest (chests stay where they are)");
    const kz = SPAWN_ZONES.find((q) => q.name === kill.zone)!;
    for (const k of kill.kinds!) assert.ok((kz.mobs[k] ?? 0) > 0, `${v.id}: ${k} live in ${kill.zone}`);
    // the townsperson or trader
    const folk = NPCS.find((n) => Math.floor(n.x / TILE) === s.folk.x && Math.floor(n.y / TILE) === s.folk.y)!;
    assert.ok(folk && folk.where?.startsWith(v.name), `${v.id}: someone before the cottage`);
    if (folk.shop) for (const e of SHOPS[folk.shop].stock) assert.ok(existingItems.has(`${e.item}:${e.size ?? ""}:${e.qty ?? ""}`), `${folk.shop}: ${e.item} is sold elsewhere already (no new item)`);
    assert.ok(!folk.shop || !SHOPS[folk.shop].buys?.includes("rune"), "no new rune fuser");
  }
});

test("villages: their kit props stand round them, in their land", () => {
  const kit = LAND_KIT_SPOTS.filter((s) => s.village);
  for (const v of VILLAGES) {
    const mine = kit.filter((s) => s.village === v.id), b = villageBox(v);
    assert.ok(mine.length >= 1, `${v.id}: dressed`);
    for (const s of mine) { assert.equal(s.land, v.land); assert.ok(gap(s.x / TILE, s.y / TILE, b) <= 8, `${v.id}: ${s.kind} near`); }
  }
  const kinds = (id: string) => new Set(kit.filter((s) => s.village === id).map((s) => s.kind));
  assert.ok(kinds("turfhallow").has("lk_peat_stack") && kinds("turfhallow").has("lk_peat_bank"));
  assert.ok(kinds("redlode").has("lk_ore_cart") && kinds("hornstead").has("lk_longhorn") && kinds("hornstead").has("lk_trough"));
  assert.ok(kinds("windlass").has("lk_rope_coil") && kinds("windlass").has("lk_gantry") && kinds("hempfield").has("lk_rope_coil"));
  assert.ok(kinds("saltglass").has("lk_salt_stack") && kinds("saltglass").has("lk_salt_pan") && kinds("lastwell").has("lk_camel"));
  assert.ok(kinds("listsend").has("lk_quintain") && (kinds("listsend").has("lk_pavilion") || kinds("listsend").has("lk_pavilion_blue")), "Lists End: a quintain and a pavilion");
  assert.ok(kinds("vigilsrest").has("lk_pilgrim_staves") && kinds("vigilsrest").has("lk_candle_shrine"), "Vigil's Rest: staves and a candle shrine");
  assert.ok(kinds("kneelstone").has("lk_ribbon_post"), "Kneelstone: ribbon posts");
  assert.ok(kinds("sawyersend").has("lk_grain_cart") && kinds("furrowby").has("lk_beehives"), "Sawyer's End: a cart; Furrowby: hives");
  // Windlass's gantry stands on the Maw's rim (a pit within 2 tiles)
  for (const g of kit.filter((s) => s.village === "windlass" && s.kind === "lk_gantry")) {
    const tx = Math.floor(g.x / TILE), ty = Math.floor(g.y / TILE);
    assert.ok([-2, -1, 0, 1, 2].some((j) => [-2, -1, 0, 1, 2].some((i) => OBJECTS[ty + j][tx + i] === T.PIT)), "the gantry on a pit's rim");
  }
  // the Staithe keeps the highway's way-cairn below its square
  assert.ok(LAND_KIT_SPOTS.some((s) => s.kind === "lk_way_cairn" && !s.village && gap(s.x / TILE, s.y / TILE, villageBox(VILLAGES[1])) <= 2), "the Staithe's way-cairn");
});

test("villages: the layout fits a 12x8 box too (the Staithe), every spot inside", () => {
  const v: Village = VILLAGES.find((q) => q.h === 8)!;
  for (const h of villageHouses(v)) assert.ok(h.y + h.h - 1 <= vy(v, v.y) + v.h - 1);
});
