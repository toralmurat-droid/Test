import { test } from "node:test";
import assert from "node:assert/strict";
import { actOfTile, MAP_H, MAP_W, TILE, type Act } from "../shared/constants";
import {
  AREAS, areaAt, EMPTY, GROUND, HIGHWAY_TILES, isSafeZone, isSolidTile, NATURE, OBJECTS, PORTAL_SPOTS, randomSpawn, SIGNPOSTS, T, WORLD, CITY_POSTS,
} from "../shared/map";
import {
  CITIES, CITY, CITY_TEMPLATE, cityAt, cityGates, cityNpcId, cityNpcPx, citySideGates, cityText, cityTile, inLandCities, plotBox, relocateCitySpot, stripBox,
  type City,
} from "../shared/capitals";
import { carveCitiesInLand, CITY_APRON, CITY_LAND, CITY_MASK, OLD_CITY_GATES, RETIRED_LEGS, RETIRED_POSTS } from "../shared/cityLand";
import { HIGHWAYS, legLine } from "../shared/highways";
import { LAND_ROWS } from "../shared/borders";
import { waygateArrival, waygateById, WAYGATES } from "../shared/act2";
import { NPCS } from "../shared/npcs";
import { STASHES } from "../shared/trade";
import { nearCityGate, noMobsAt, NO_MOB_AREAS, randomPointInZone, SPAWN_ZONES } from "../shared/spawns";
import { territoryAt } from "../shared/war/view";
import { TERRITORIES } from "../shared/war/territories";
import { HOLDS, MUSTERS, STANDARDS } from "../shared/war/standards";
import { CHESTS } from "../shared/chests";
import { SIEGE_SITES } from "../shared/siege";
import { LANDMARKS } from "../shared/landmarks";
import { allObjects } from "../shared/quests";
import { BORDERS, endPath } from "../shared/borders";
import { blocked } from "../shared/movement";
import { BOARDS } from "../shared/bounty";
import { cityClear, clearOfCities, POSTS } from "../shared/bandits";
import { FANGROCK } from "../shared/badlands";
import { KINGS_MOUND } from "../shared/moors";

/**
 * The clans' cities in their homelands (settlement network step 5, shared/capitals.ts City.site, shared/cityLand.ts), one
 * table row per city that has moved: Hearthhold north of Goldenreach Farms (Oakvale's lands), Duskveil in the Sunscar's
 * Saffron Dunes east of Mirage Wells, Marrowkeep on the moor north of Kingsbarrow, Scarwall on the badlands plain north
 * of Fangrock. The rules every moved city keeps run over the table; what is one city's own is in its own
 * test below. The room side (the gate ward, the hand-off) is in tests/cityLand-room.test.ts.
 */
type Pt = { x: number; y: number };
interface Row {
  clan: City["clan"]; land: Act; box: { x: number; y: number; w: number; h: number }; outer: Pt;
  /** Each gate's gap (map tiles), south first. */
  gates: Partial<Record<"south" | "west" | "east", Pt[]>>;
  /** Where the land's own flood starts (its town's square or its way in). */
  seed: () => Pt;
  /** Gates that open onto the highway (the rest onto dirt). */
  highway: ("south" | "west" | "east")[];
  /** Places on road from a gate: [gate, x, y, max road steps or -1 for any, what]. */
  roads: [("south" | "west" | "east"), number, number, number, string][];
  /** Land areas the city's box overlaps: the city's own districts and name come first. */
  over: string[];
  /** A territory point outside the walls and its name. */
  territory: [number, number, string][];
}
const tileOf = (p: Pt): Pt => ({ x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) });
const rows: Row[] = [
  {
    clan: "wardens", land: 1, box: { x: 41, y: 1, w: 52, h: 40 }, outer: { x: 66, y: 41 },
    gates: { south: [65, 66, 67].map((x) => ({ x, y: 40 })), west: [26, 27, 28].map((y) => ({ x: 41, y })), east: [26, 27, 28].map((y) => ({ x: 92, y })) },
    seed: () => tileOf(randomSpawn()), highway: ["south", "west"],
    roads: [["south", 79, 46, 20, "Oakvale's north gate"], ["south", 84, 46, -1, "Oakvale's stone"], ["south", 30, 58, -1, "Goldenreach Farms (the seat)"],
      ["west", 38, 20, -1, "Hunter's Camp's stone"], ["east", 98, 15, 20, "the Watchtower Trail"]],
    over: ["Goldenreach Farms", "North Meadow"], territory: [[45, 46, "Goldenreach Farms"], [100, 20, "North Meadow"]],
  },
  {
    clan: "veiled", land: 2, box: { x: 230, y: 404, w: 52, h: 40 }, outer: { x: 255, y: 444 },
    gates: { south: [254, 255, 256].map((x) => ({ x, y: 443 })), west: [429, 430, 431].map((y) => ({ x: 230, y })) },
    seed: () => tileOf(waygateArrival(waygateById("desert")!)), highway: ["west"],
    roads: [["west", 219, 416, 30, "Mirage Wells' east shore"], ["west", 231, 353, -1, "the Veiled Sanctum's west gate (the seat)"], ["west", 155, 410, -1, "Kel Ashar"],
      ["south", 229, 445, 40, "the dunes trail"], ["south", 219, 416, 60, "Mirage Wells, up the dunes trail"]],
    over: ["The Saffron Dunes", "The Sunscar"], territory: [[229, 430, "The Saffron Dunes"], [255, 446, "The Saffron Dunes"]],
  },
  {
    clan: "host", land: 3, box: { x: 230, y: 601, w: 52, h: 40 }, outer: { x: 255, y: 641 },
    gates: { south: [254, 255, 256].map((x) => ({ x, y: 640 })), west: [626, 627, 628].map((y) => ({ x: 230, y })) },
    seed: () => tileOf(waygateArrival(waygateById("moors")!)), highway: ["south"],
    roads: [["south", 250, 680, 60, "the fork below the Host's Muster (the seat)"], ["south", 89, 704, -1, "Cairnwatch"], ["west", 255, 641, -1, "the south gate, through the city"]],
    over: ["Kingsbarrow", "The Grey Barrow Moors"], territory: [[246, 648, "Kingsbarrow"], [232, 648, "Kingsbarrow"]],
  },
  {
    clan: "redfang", land: 4, box: { x: 9, y: 782, w: 52, h: 40 }, outer: { x: 34, y: 822 },
    gates: { south: [33, 34, 35].map((x) => ({ x, y: 821 })), east: [807, 808, 809].map((y) => ({ x: 60, y })) },
    seed: () => tileOf(waygateArrival(waygateById("badlands")!)), highway: ["south"],
    roads: [["south", 50, 857, 50, "Fangrock's east gate (the seat)"], ["south", 221, 872, -1, "the Rustwater Post"], ["east", 34, 822, -1, "the south gate, through the city"]],
    over: ["Gallows Canyon", "The Red Badlands"], territory: [[61, 808, "Gallows Canyon"], [65, 812, "Gallows Canyon"]],
  },
];
const cityOfRow = (r: Row) => CITIES.find((c) => c.clan === r.clan)!;
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

test("cities in their lands: the table covers every city with a site; the band cities keep their plots", () => {
  assert.deepEqual(inLandCities().map((c) => c.clan), rows.map((r) => r.clan));
  for (const c of CITIES) if (!c.site) { assert.deepEqual(plotBox(c), stripBox(c.plot)); assert.equal(c.sideGates, undefined); }
  // the old gate daises: one per clan, fixed (the land hash tests mask them for good)
  assert.deepEqual(Object.keys(OLD_CITY_GATES).sort(), CITIES.map((c) => c.clan).sort());
  for (const c of CITIES) if (!c.site) assert.deepEqual(OLD_CITY_GATES[c.clan], c.outerBox, `${c.clan}: the dais box is its outerBox while it is in the band`);
});

for (const r of rows) {
  const C = cityOfRow(r), B = plotBox(C), G = cityGates(C), name = cityText(C).name;
  const inBox = (x: number, y: number) => x >= B.x && y >= B.y && x < B.x + B.w && y < B.y + B.h;
  const land = LAND_ROWS[r.land];

  test(`${name}: stands in land ${r.land} at its site; its band plot is rock; the old gate dais is land again`, () => {
    assert.equal(C.act, r.land);
    assert.deepEqual(C.site, { x: r.box.x, y: r.box.y });
    assert.deepEqual(B, r.box);
    assert.deepEqual(C.outerBox, { x0: B.x, x1: B.x + B.w - 1, y0: B.y, y1: B.y + B.h - 1 }, "the highways skip the plot, no more");
    assert.deepEqual(C.outer, r.outer, "just outside the south gate");
    assert.ok(B.y >= land.y0 && B.y + B.h <= land.y0 + land.h, "inside its land's band");
    for (let y = B.y; y < B.y + B.h; y++) for (let x = B.x; x < B.x + B.w; x++) { assert.equal(cityAt(x, y), C); assert.equal(actOfTile(x, y), r.land); }
    assert.equal(cityAt(B.x - 1, B.y + 5), undefined); assert.equal(cityAt(B.x, B.y + B.h), undefined);
    const o = stripBox(C.plot);
    for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) { assert.equal(OBJECTS[y][x], T.ROCK, `rock at ${x},${y}`); assert.equal(cityAt(x, y), undefined); }
    assert.ok(!AREAS.some((a) => a.y >= o.y && a.y < o.y + o.h && a.x >= o.x && a.x < o.x + o.w), "no area left in the old plot");
    // no waygate pair, no dais: the old dais' tiles outside the walls are the land's ground again
    assert.equal(waygateById(`citygate_${C.clan}`), undefined); assert.equal(waygateById(`cityexit_${C.clan}`), undefined);
    assert.ok(!WAYGATES.some((g) => g.id.endsWith(`_${C.clan}`)));
    const O = OLD_CITY_GATES[C.clan];
    for (let y = O.y0; y <= O.y1; y++) for (let x = O.x0; x <= O.x1; x++) if (!inBox(x, y)) assert.ok(GROUND[y][x] !== T.FLAGS && GROUND[y][x] !== T.RUBBLE, `old dais at ${x},${y}`);
  });

  test(`${name}: walled shut but for its gates, every tile inside reachable through each, all safe`, () => {
    assert.deepEqual(G.map((g) => g.side), Object.keys(r.gates), "south first, then the side gates it has");
    assert.deepEqual(G.slice(1).map((g) => g.side), citySideGates(C));
    for (const g of G) assert.deepEqual(g.tiles, r.gates[g.side], `${g.side}: the gap`);
    const gap = new Set(G.flatMap((g) => g.tiles.map((t) => t.y * MAP_W + t.x)));
    assert.equal(gap.size, 3 * G.length);
    for (let y = B.y; y < B.y + B.h; y++) for (let x = B.x; x < B.x + B.w; x++) {
      if (x !== B.x && y !== B.y && x !== B.x + B.w - 1 && y !== B.y + B.h - 1) continue;
      assert.equal(isSolidTile(x, y), !gap.has(y * MAP_W + x), `wall at ${x},${y}`);
      if (!gap.has(y * MAP_W + x)) assert.equal(OBJECTS[y][x], T[C.style.wall]);
    }
    for (const g of G) {
      assert.ok(!isSolidTile(g.out.x, g.out.y) && !inBox(g.out.x, g.out.y), `${g.side}: open ground outside`);
      assert.ok(g.tiles.some((t) => Math.abs(t.x - g.out.x) + Math.abs(t.y - g.out.y) === 1), `${g.side}: the outside tile is beside the gap`);
    }
    const s = r.seed(), home = flood(s.x, s.y);
    for (const g of G) {
      assert.ok(home[g.out.y * MAP_W + g.out.x], `${g.side}: joined to the land's way in`);
      const shut = new Set(G.filter((o) => o !== g).flatMap((o) => o.tiles.map((t) => t.y * MAP_W + t.x)));
      const seen = flood(g.out.x, g.out.y, (x, y) => !isSolidTile(x, y) && !shut.has(y * MAP_W + x));
      let walk = 0;
      for (let y = B.y; y < B.y + B.h; y++) for (let x = B.x; x < B.x + B.w; x++) if (!isSolidTile(x, y) && !shut.has(y * MAP_W + x)) { walk++; assert.ok(seen[y * MAP_W + x], `${g.side}: ${x},${y} reachable`); }
      assert.ok(walk > 1000);
    }
    for (let y = B.y; y < B.y + B.h; y++) for (let x = B.x; x < B.x + B.w; x++) assert.ok(isSafeZone((x + 0.5) * TILE, (y + 0.5) * TILE), `safe at ${x},${y}`);
    assert.ok(!isSafeZone((B.x + B.w + 2) * TILE, (B.y + 5) * TILE));
  });

  test(`${name}: the apron round the walls holds no tree, bush, boulder, cactus, bones or palm`, () => {
    const nature = new Set([...NATURE, T.CACTUS, T.BONES, T.PALM]);
    for (let y = Math.max(1, B.y - CITY_APRON); y < B.y + B.h + CITY_APRON; y++) for (let x = Math.max(0, B.x - CITY_APRON); x < B.x + B.w + CITY_APRON; x++) {
      if (!inBox(x, y)) assert.ok(!nature.has(OBJECTS[y][x]), `nature at ${x},${y}`);
    }
  });

  test(`${name}: its gates are on the land's roads and highway, out to the seat and the towns`, () => {
    for (const g of G) assert.ok(WORLD.roads.has(g.out.y * MAP_W + g.out.x) && g.tiles.every((t) => WORLD.roads.has(t.y * MAP_W + t.x)), `${g.side}: a road through the gate`);
    for (const g of G) {
      const hw = HIGHWAY_TILES.has(g.out.y * MAP_W + g.out.x);
      assert.equal(hw, r.highway.includes(g.side), `${g.side}: ${hw ? "on" : "off"} the highway`);
      if (!hw) assert.equal(GROUND[g.out.y][g.out.x], T.DIRT, `${g.side}: a dirt road`);
    }
    for (const [side, x, y, max, what] of r.roads) {
      const g = G.find((o) => o.side === side)!, n = roadTo(roadSteps(g.out.x, g.out.y), x, y);
      assert.ok(n >= 0 && (max < 0 || n <= max), `${what}: ${n} road steps from the ${side} gate`);
    }
    // the highway: no leg inside the walls, none of the retired legs left
    const h = HIGHWAYS.find((o) => o.land === r.land)!;
    for (const leg of h.legs) for (const k of legLine(h, leg)) assert.ok(!inBox(k % MAP_W, Math.floor(k / MAP_W)), `${leg.from} -> ${leg.to}: no leg inside the walls`);
    assert.ok(h.legs.some((l) => l.from === `${name} Gate`), "a leg from its gate");
    for (const o of RETIRED_LEGS.filter((l) => l.land === r.land)) assert.ok(!h.legs.some((l) => JSON.stringify(l.pts) === JSON.stringify(o.pts)), "a retired leg");
  });

  test(`${name}: signposts by each gate naming it, none inside the walls; the seat's fork names it`, () => {
    for (const p of SIGNPOSTS) assert.ok(!inBox(p.x, p.y), `a post inside the walls at ${p.x},${p.y}`);
    for (const g of G) {
      const s = SIGNPOSTS.find((p) => Math.hypot(p.x - g.out.x, p.y - g.out.y) <= 4);
      assert.ok(s, `${g.side}: a post by the gate`);
      assert.ok(s.dirs.some((d) => d.name.includes(name)), `${g.side}: names ${name} (${s.dirs.map((d) => d.name).join(" | ")})`);
    }
    for (const p of CITY_LAND[C.clan]?.posts ?? []) assert.ok(CITY_POSTS.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= 3 && JSON.stringify(q.to) === JSON.stringify(p.to)), "its gate road posts are placed");
    const h = HIGHWAYS.find((o) => o.land === r.land)!, seat = AREAS.find((a) => a.name === h.seat)!;
    assert.ok(SIGNPOSTS.some((p) => Math.hypot(p.x - (seat.x + seat.w / 2), p.y - (seat.y + seat.h / 2)) < 40 && !inBox(p.x, p.y) && p.dirs.some((d) => d.name.includes(name))), `a post by ${h.seat} names ${name}`);
  });

  test(`${name}: districts named first, people, stash, waystone, board and props inside`, () => {
    const t = cityText(C);
    for (const d of CITY_TEMPLATE.districts) { const c = cityTile(C, { x: d.x + 1, y: d.y + 1 }); assert.equal(areaAt((c.x + 0.5) * TILE, (c.y + 0.5) * TILE), t.districts[d.d]); }
    const gs = cityTile(C, { x: 25, y: 34 });
    assert.equal(areaAt((gs.x + 0.5) * TILE, (gs.y + 0.5) * TILE), t.districts.gate);
    const whole = AREAS.findIndex((a) => a.name === t.name);
    assert.ok(whole >= 0 && AREAS[whole].x === B.x && AREAS[whole].y === B.y && AREAS[whole].w === B.w && AREAS[whole].h === B.h);
    for (const n of r.over) assert.ok(whole < AREAS.findIndex((a) => a.name === n), `before ${n}`);
    assert.ok(!AREAS[whole].mobs?.length);
    for (const n of CITY_TEMPLATE.npcs) {
      const npc = NPCS.find((o) => o.id === cityNpcId(C, n.role))!;
      assert.deepEqual({ x: npc.x, y: npc.y }, cityNpcPx(C, n.role));
      assert.ok(inBox(Math.floor(npc.x / TILE), Math.floor(npc.y / TILE)));
    }
    assert.ok(STASHES.some((s) => cityAt(Math.floor(s.x / TILE), Math.floor(s.y / TILE)) === C), "the stash");
    const ws = PORTAL_SPOTS.find((p) => p.id === `city_${C.clan}`)!;
    assert.deepEqual({ x: ws.x, y: ws.y }, cityTile(C, CITY_TEMPLATE.waystone));
    assert.equal(ws.name, t.waystone);
    const board = BOARDS.find((b) => b.id === `city_${C.clan}`)!;
    assert.ok(inBox(Math.floor(board.x / TILE), Math.floor(board.y / TILE)), "its bounty board by the stone");
  });

  test(`${name}: no monster spawns inside or by a gate, no territory inside, no camp post or patrol there`, () => {
    assert.ok(NO_MOB_AREAS.includes(name));
    for (let y = Math.max(0, B.y - 2); y < B.y + B.h + 2; y++) for (let x = Math.max(0, B.x - 2); x < B.x + B.w + 2; x++) assert.ok(noMobsAt((x + 0.5) * TILE, (y + 0.5) * TILE), `no-mob at ${x},${y}`);
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
    for (const [x, y, n] of r.territory) assert.equal(territoryAt(x, y)?.name, n, "the land's territory outside the walls");
    // the camps (shared/bandits.ts clearOfCities): no post, ambusher or patrol point in the walls, the apron or a gate's ring
    for (const p of POSTS) for (const [x, y] of [p.at, ...(p.route ?? [])]) {
      assert.ok(!(x >= B.x - CITY_APRON && y >= B.y - CITY_APRON && x < B.x + B.w + CITY_APRON && y < B.y + B.h + CITY_APRON), `a camp post at ${x},${y}`);
      for (const g of G) assert.ok(Math.hypot(x - g.out.x, y - g.out.y) >= CITY.gateClear, `a camp post at ${x},${y} by the ${g.side} gate`);
    }
    // nor a fort, a muster or a standard
    for (const h of [...HOLDS, ...MUSTERS, ...STANDARDS]) assert.ok(!inBox(Math.floor(h.x / TILE), Math.floor(h.y / TILE)), "no war site inside");
  });

  test(`${name}: carved only inside CITY_MASK, deterministic, one land at a time`, () => {
    const before = WORLD.cityBefore;
    // the carve again on the map from before it, this land's cities only: the same city, tile for tile (the highways skip the box)
    const g = GROUND.map((row) => [...row]), o = OBJECTS.map((row) => [...row]);
    for (const [k, v] of before) { g[Math.floor(k / MAP_W)][k % MAP_W] = v.g; o[Math.floor(k / MAP_W)][k % MAP_W] = v.o; }
    const inside = { x: B.x + 5, y: B.y + 5 }, far = { x: B.x + B.w + 8, y: B.y + 5 };
    const posts = [{ ...inside }, { ...far }], roads = new Set<number>([inside.y * MAP_W + inside.x]);
    const mine = new Map<number, { g: number; o: number }>();
    const res = carveCitiesInLand(T, g, o, EMPTY, roads, posts, () => T.GRASS, mine, [r.land]);
    for (let y = B.y; y < B.y + B.h; y++) { assert.deepEqual(g[y].slice(B.x, B.x + B.w), GROUND[y].slice(B.x, B.x + B.w)); assert.deepEqual(o[y].slice(B.x, B.x + B.w), OBJECTS[y].slice(B.x, B.x + B.w)); }
    assert.deepEqual(posts, [far], "the post inside the walls dropped");
    assert.ok(!roads.has(inside.y * MAP_W + inside.x), "no road left inside but the through streets");
    const cross = cityTile(C, { x: 20, y: 26 }), sq = cityTile(C, { x: 25, y: 33 });
    assert.ok(roads.has(cross.y * MAP_W + cross.x) && roads.has(sq.y * MAP_W + sq.x), "the cross street and the gate square's middle are roads");
    for (const s of ["west", "east"] as const) {
      const wall = cityTile(C, { x: s === "west" ? 0 : B.w - 1, y: 26 });
      assert.equal(roads.has(wall.y * MAP_W + wall.x), citySideGates(C).includes(s), `${s} wall: a road only where there is a gate`);
    }
    assert.deepEqual(res.areas.map((a) => a.name), [...CITY_TEMPLATE.districts.map((d) => cityText(C).districts[d.d]), cityText(C).name]);
    assert.deepEqual(res.posts, CITY_LAND[C.clan]?.posts ?? []);
    for (const k of mine.keys()) { assert.ok(CITY_MASK.has(k), `${k % MAP_W},${Math.floor(k / MAP_W)}: in the mask`); assert.equal(actOfTile(k % MAP_W, Math.floor(k / MAP_W)), r.land); }
    assert.ok(mine.size > 1500, `${mine.size} tiles changed`);
  });

  test(`${name}: relocateCitySpot moves a spot in the old band plot to the same place in the city; anywhere else stays`, () => {
    const o = stripBox(C.plot);
    const a = relocateCitySpot((o.x + 25.5) * TILE, (o.y + 33.25) * TILE);
    assert.deepEqual(a, { x: (B.x + 25.5) * TILE, y: (B.y + 33.25) * TILE });
    assert.equal(cityAt(Math.floor(a.x / TILE), Math.floor(a.y / TILE)), C);
    for (const p of [{ x: 100, y: 200 }, { x: (o.x - 1) * TILE, y: (o.y + 5) * TILE }]) assert.deepEqual(relocateCitySpot(p.x, p.y), p);
  });

  test(`${name}: every walkable tile of its land is reachable from the land's way in on foot (map-metrics)`, () => {
    const s = r.seed(), seen = flood(s.x, s.y);
    for (let y = land.y0; y < land.y0 + land.h; y++) for (let x = 0; x < MAP_W; x++) if (!isSolidTile(x, y) && !seen[y * MAP_W + x]) assert.fail(`unreachable ${x},${y}`);
  });
}

test("cities in their lands: CITY_MASK holds every changed tile; the retired legs and posts are in their lands", () => {
  for (const k of WORLD.cityBefore.keys()) assert.ok(CITY_MASK.has(k), `${k % MAP_W},${Math.floor(k / MAP_W)}: in the mask`);
  const lands = new Set(rows.map((r) => r.land));
  for (const k of CITY_MASK) assert.ok(lands.has(actOfTile(k % MAP_W, Math.floor(k / MAP_W)) as Act), `the mask lies in a moved city's land (${k % MAP_W},${Math.floor(k / MAP_W)})`);
  for (const l of [...RETIRED_LEGS, ...RETIRED_POSTS]) assert.ok(lands.has(l.land));
  // a band city's sides would be both: the template's default
  assert.deepEqual(citySideGates({ ...CITIES[1], sideGates: undefined }), ["west", "east"]);
});

test("cities in their lands: forts, musters, chests, siege sites, landmarks, quest objects and older stones as before; 25 forts, 14 of 20 pass ends", () => {
  assert.equal(HOLDS.length, 25);
  let n = 0;
  for (const b of BORDERS) for (const e of [b.a, b.b]) { const [x, y] = endPath(e)[0]; if (HOLDS.some((h) => Math.hypot(h.x / TILE - x, h.y / TILE - y) <= 30)) n++; }
  assert.equal(n, 14);
  // the digests taken on the map before the moves (default branch after #571; the same after Hearthhold, Scarwall, Duskveil
  // and Marrowkeep)
  assert.equal(digest(HOLDS, (h) => [h.t, Math.round(h.x), Math.round(h.y)]), "25:9caa51d");
  assert.deepEqual(HOLDS.filter((h) => h.site === "capital").map((h) => [h.x / TILE, h.y / TILE]), [[26.5, 58.5], [241.5, 355.5], [271.5, 671.5], [27.5, 867.5], [248.5, 1105.5]], "the capital forts");
  assert.equal(digest(MUSTERS, (h) => [h.t, Math.round(h.x), Math.round(h.y)]), "72:82341353");
  assert.equal(digest(STANDARDS, (s) => [s.id, s.t, Math.round(s.x), Math.round(s.y)]), "132:d5da7132");
  assert.equal(digest(CHESTS, (c) => [c.id, Math.round(c.x), Math.round(c.y)]), "53:e7366e42");
  assert.equal(digest(SIEGE_SITES, (s) => [s.tx, s.ty]), "14:cac2c0c9");
  assert.equal(digest(LANDMARKS, (l) => [l.id, l.x, l.y, l.solid ?? null]), "6:4b449bf7");
  assert.equal(digest(allObjects(), (o) => [o.id, Math.round(o.x), Math.round(o.y)]), "213:663e782a");
  // every stone but the moved cities' waystones ("41:f8dc4b3" with Duskveil's, before it moved; "40:b1394a39" with
  // Marrowkeep's; the base map without it hashes the same)
  assert.equal(digest(PORTAL_SPOTS.filter((p) => !inLandCities().some((c) => p.id === `city_${c.clan}`)), (p) => [p.id, p.x, p.y]), "39:77de2ae2");
  assert.equal(digest(POSTS, (p) => [p.kind ?? "", p.role, p.at, p.route ?? null]), "95:7b83c3b", "every camp post where it was");
  for (const c of CHESTS) assert.ok(!cityAt(Math.floor(c.x / TILE), Math.floor(c.y / TILE)), `${c.id}: not inside the walls`);
});

test("cities in their lands: the camps' clearance drops a post inside a city or by its gate and trims a patrol", () => {
  const S = CITIES.find((c) => c.clan === "redfang")!, B = plotBox(S), g = cityGates(S)[0].out;
  assert.equal(cityClear(B.x + 10, B.y + 10), false, "inside");
  assert.equal(cityClear(B.x - 2, B.y + 10), false, "on the apron");
  assert.equal(cityClear(g.x + 3, g.y + 5), false, "by the south gate");
  assert.equal(cityClear(g.x + 3, g.y + CITY.gateClear + 2), true);
  const far: [number, number] = [g.x, g.y + 30];
  const posts = clearOfCities([
    { role: "brute", at: [B.x + 10, B.y + 10] },
    { role: "cutthroat", at: far, route: [far, [g.x, g.y + 2], [g.x + 20, g.y + 30]] },
    { role: "archer", at: far },
  ]);
  assert.deepEqual(posts, [{ role: "cutthroat", at: far, route: [far, [g.x + 20, g.y + 30]] }, { role: "archer", at: far }]);
});

test("Hearthhold: the windmill leaves a body's way past the east wall; Goldenreach's north field four rows shorter", () => {
  const W = CITIES.find((c) => c.clan === "wardens")!, B = plotBox(W);
  const inBox = (x: number, y: number) => x >= B.x && y >= B.y && x < B.x + B.w && y < B.y + B.h;
  const mill = LANDMARKS.find((l) => l.id === "windmill")!;
  assert.deepEqual([mill.x, mill.y, mill.solid], [94.5, 31.5, [93.6, 30.6, 1.8, 1.8]], "the windmill stands where it stood (owner's default)");
  for (let y = 29; y <= 34; y += 0.25) assert.ok(!blocked((B.x + B.w + 0.3) * TILE, y * TILE), `a body passes between the wall and the windmill at y ${y}`);
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
  // Oakvale's north gate post and the West Road fork name it; the city's areas win over Goldenreach's and North Meadow's
  const north = SIGNPOSTS.find((p) => p.x === 78 && p.y === 46)!;
  assert.ok(north.dirs.some((d) => d.name.includes("Hearthhold") && d.arrow === "↑"), "Oakvale's north gate: Hearthhold up the road");
  const fork = SIGNPOSTS.find((p) => p.x === 50 && p.y === 56)!;
  assert.ok(fork.dirs.some((d) => d.name.includes("Hearthhold")), "the West Road fork names it");
  assert.equal(areaAt(45.5 * TILE, 38.5 * TILE), "Hearthhold Market", "inside Goldenreach's old rect: the city's");
  assert.equal(areaAt(90.5 * TILE, 10.5 * TILE), cityText(W).districts.hall, "inside North Meadow's rect: the city's");
  assert.ok(Math.hypot(W.outer.x - 79, W.outer.y - 46) < 16, "about fifteen tiles up the road from Oakvale's north gate");
  assert.equal(HIGHWAYS.find((h) => h.land === 1)!.seat, "Goldenreach Farms", "the seat stays (owner's default)");
  assert.equal(PORTAL_SPOTS.find((p) => p.id === "huntcamp")!.x, 38);
});

test("Scarwall: its back to the edge cliffs (no west gate), its east gate onto the head of Gallows Canyon; Fangrock's garrison out of sight", () => {
  const S = CITIES.find((c) => c.clan === "redfang")!, B = plotBox(S), G = cityGates(S);
  assert.deepEqual(S.sideGates, ["east"]);
  for (let y = B.y; y < B.y + B.h; y++) assert.ok(isSolidTile(B.x - 1, y), `edge cliff west of the wall at ${y}`);
  const E = G.find((g) => g.side === "east")!;
  assert.deepEqual(E.out, { x: 61, y: 808 });
  assert.equal(areaAt((E.out.x + 0.5) * TILE, (E.out.y + 0.5) * TILE), "Gallows Canyon");
  // the plain's only way north into the canyon runs through the city: from the south gate to the east gate inside the walls
  const inside = flood(G[0].tiles[1].x, G[0].tiles[1].y, (x, y) => !isSolidTile(x, y) && cityAt(x, y) === S);
  assert.ok(E.tiles.some((t) => inside[t.y * MAP_W + t.x]), "south gate to east gate inside the walls");
  // Fangrock (its stockade, towers and garrison) well south of the walls; the lookouts see 7.5 tiles
  assert.ok(FANGROCK.y + LAND_ROWS[4].y0 - (B.y + B.h) > 20, "Fangrock's stockade 20+ rows below the south wall");
  for (const p of POSTS.filter((o) => o.role === "lookout")) for (const g of G) assert.ok(Math.hypot(p.at[0] - g.out.x, p.at[1] - g.out.y) >= 20, `lookout at ${p.at} by the ${g.side} gate`);
  // the highway from the south gate is the leg to Fangrock; the gate post names Scarwall
  const fromS = roadSteps(G[0].out.x, G[0].out.y);
  assert.ok(HIGHWAY_TILES.has(G[0].out.y * MAP_W + G[0].out.x));
  assert.ok(roadTo(fromS, FANGROCK.x + FANGROCK.w + 2, FANGROCK.y + LAND_ROWS[4].y0 + 14) >= 0, "Fangrock's east gate on road");
});

test("Duskveil: under the Thornspire in the Saffron Dunes, its back to the cliffs (no east gate); the highway from Mirage Wells to its west gate", () => {
  const D = CITIES.find((c) => c.clan === "veiled")!, B = plotBox(D), G = cityGates(D), inBox = (x: number, y: number) => x >= B.x && y >= B.y && x < B.x + B.w && y < B.y + B.h;
  assert.deepEqual(D.sideGates, ["west"]);
  for (let y = B.y; y < B.y + B.h; y++) assert.ok(isSolidTile(B.x + B.w, y), `cliff east of the wall at ${y}`);
  const Wg = G.find((g) => g.side === "west")!;
  assert.deepEqual(Wg.out, { x: 229, y: 430 });
  // the leg from the west gate up the dunes trail into Mirage Wells, where it meets the east shore's leg; the legs from the
  // old gate dais keep their line (the Thornspire's war roads stay), renamed
  const h = HIGHWAYS.find((o) => o.land === 2)!, y0 = LAND_ROWS[2].y0, leg = (from: string, to: string) => h.legs.find((l) => l.from === from && l.to === to)!;
  const mine = leg("Duskveil Gate", "Mirage Wells"), shore = leg("Mirage Wells", "Mirage Wells' east shore");
  assert.deepEqual(mine.pts[0], [Wg.out.x, Wg.out.y - y0]); assert.deepEqual(mine.pts.at(-1), shore.pts.at(-1));
  assert.ok(!mine.join, "no join: it never enters the city's box, and rides Mirage Wells' street as it is");
  assert.deepEqual(leg("The Sanctum's fork", "The Veiled Sanctum").pts, [[223, 54], [231, 53]]);
  assert.deepEqual(leg("The Veiled Sanctum", "Mirage Wells").pts, [[223, 54], [226, 54], [229, 59], [231, 61], [233, 61], [238, 66], [238, 68], [219, 94], [217, 98], [216, 108]]);
  assert.ok(!h.legs.some((l) => l.from.startsWith("Duskveil") && l !== mine), "no other leg from the old gate");
  // Mirage Wells' chest by the north-west corner and the brand-totem under the south road stay outside, free, off the road
  const chest = CHESTS.find((c) => c.id === "sun_6_2")!, cx = Math.floor(chest.x / TILE), cy = Math.floor(chest.y / TILE);
  assert.ok(!inBox(cx, cy) && !isSolidTile(cx, cy) && B.x - cx > CITY_APRON, "sun_6_2 west of the apron");
  const totem = allObjects().find((o) => o.id === "dune_totem3")!, tx = Math.floor(totem.x / TILE), ty = Math.floor(totem.y / TILE);
  assert.ok(!inBox(tx, ty) && !WORLD.roads.has(ty * MAP_W + tx) && !isSolidTile(tx, ty), "the totem: off the road, free");
  assert.ok(WORLD.roads.has((ty - 1) * MAP_W + tx), "the south gate's road runs just above the totem");
  // the south gate's post: the city up through the gate, Mirage Wells and Kel Ashar west along the road
  const sp = SIGNPOSTS.find((p) => Math.hypot(p.x - G[0].out.x, p.y - G[0].out.y) <= 4)!;
  assert.ok(sp.dirs.some((d) => d.name.includes("Duskveil") && !d.name.includes("Mirage Wells")), sp.dirs.map((d) => d.name).join(" | "));
  assert.ok(sp.dirs.some((d) => d.name.includes("Mirage Wells") && d.arrow === "←"), "Mirage Wells to the west");
  // the Sanctum's plateau (the seat, its fort and the Thornspire muster) a long walk north
  assert.ok(B.y - 361 > 40, "the Sanctum's walls 40+ rows north");
});

test("Marrowkeep: north of Kingsbarrow, its back to the crags (no east gate); the highway from its south gate to the Muster's fork", () => {
  const M = CITIES.find((c) => c.clan === "host")!, B = plotBox(M), G = cityGates(M), y0 = LAND_ROWS[3].y0;
  const inBox = (x: number, y: number) => x >= B.x && y >= B.y && x < B.x + B.w && y < B.y + B.h;
  assert.deepEqual(M.sideGates, ["west"]);
  for (let y = B.y; y < B.y + B.h; y++) assert.ok(isSolidTile(B.x + B.w, y), `crag east of the wall at ${y}`);
  // the leg from the south gate down to the fork below the Muster, where the Mourning Road's and Cairnwatch's legs start;
  // the old stub from the gate dais is retired, no other leg from the city
  const h = HIGHWAYS.find((o) => o.land === 3)!, mine = h.legs.find((l) => l.from === "Marrowkeep Gate")!;
  assert.deepEqual(mine.pts[0], [G[0].out.x, G[0].out.y - y0]);
  for (const to of ["The Mourning Road", "Cairnwatch"]) assert.deepEqual(h.legs.find((l) => l.from === "The Host's Muster" && l.to === to)!.pts[0], mine.pts.at(-1));
  assert.equal(h.legs.filter((l) => l.from.startsWith("Marrowkeep")).length, 1);
  assert.ok(RETIRED_LEGS.some((l) => l.land === 3 && JSON.stringify(l.pts) === JSON.stringify([[242, 79], [249, 85], [250, 84]])), "the old stub retired");
  // ...kept off the stump that keeps the Muster's fort where it was (cleared, a spot by the highway ties it and wins)
  assert.equal(OBJECTS[72 + y0][251], T.STUMP);
  assert.deepEqual(HOLDS.find((o) => o.site === "capital" && o.anchor === "The Host's Muster")!.x / TILE, 271.5);
  // the west gate: a few tiles of dirt track towards the Nine Widows road, stopping short of it (joined, the fork would be a
  // junction: the Hollow Mounds' fort would go to Kingsbarrow), the road's old post inside the walls gone
  const Wg = G.find((g) => g.side === "west")!, track = [[229, 627], [228, 627], [228, 628], [228, 629]];
  assert.deepEqual(Wg.out, { x: 229, y: 627 });
  for (const [x, y] of track) { assert.ok(WORLD.roads.has(y * MAP_W + x) && GROUND[y][x] === T.DIRT, `track at ${x},${y}`); }
  const joined = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => WORLD.roads.has((y + j) * MAP_W + x + i) && !track.some(([a, b]) => a === x + i && b === y + j) && !inBox(x + i, y + j));
  assert.ok(!track.some(([x, y]) => joined(x, y)), "the track joins no other road");
  assert.ok(WORLD.roads.has(634 * MAP_W + 228), "the Nine Widows road five tiles below");
  assert.ok(HOLDS.some((o) => o.anchor === "187,700") && !HOLDS.some((o) => TERRITORIES[o.t].name === "Kingsbarrow"), "the Hollow Mounds keep their fort, Kingsbarrow has none");
  assert.ok(!SIGNPOSTS.some((p) => p.x === 230 && p.y === 635), "the Nine Widows road's post inside the walls is gone");
  const wp = SIGNPOSTS.find((p) => Math.hypot(p.x - Wg.out.x, p.y - Wg.out.y) <= 4)!;
  assert.ok(wp.dirs.some((d) => d.name.includes("Marrowkeep")) && wp.dirs.some((d) => d.name.includes("The Nine Widows")), wp.dirs.map((d) => d.name).join(" | "));
  // the fork below the Muster names the city up the leg (beside the Muster: a board names two places)
  const fork = SIGNPOSTS.find((p) => Math.hypot(p.x - 246, p.y - (85 + y0)) <= 3)!;
  assert.ok(fork.dirs.some((d) => d.name.includes("Marrowkeep") && d.name.includes("The Host's Muster")), fork.dirs.map((d) => d.name).join(" | "));
  // the Barrow-King's Mound just below the south apron: its area, its lair and the boss as they were, outside the walls
  const mound = AREAS.find((a) => a.name === "The Barrow-King's Mound")!;
  assert.deepEqual([mound.x, mound.y, mound.w, mound.h], [231, 642, 11, 9]);
  assert.ok(mound.y >= B.y + B.h + 1 && !inBox(KINGS_MOUND.x, KINGS_MOUND.y + y0));
  assert.ok(SPAWN_ZONES.some((z) => z.name === "The Barrow-King's Mound" && z.mobs.barrowking === 1));
  for (let y = mound.y; y < mound.y + mound.h; y++) for (let x = mound.x; x < mound.x + mound.w; x++) assert.ok(!HIGHWAY_TILES.has(y * MAP_W + x), `no highway through the Mound at ${x},${y}`);
});
