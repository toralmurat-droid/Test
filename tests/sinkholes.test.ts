import { test } from "node:test";
import { carveBorders } from "../shared/borders";
import { carveHighways } from "../shared/highways";
import { carveCitiesInLand } from "../shared/cityLand";
import { CITIES, cityAt, cityGateDais } from "../shared/capitals";
import assert from "node:assert/strict";
import {
  ACT_LEVEL, actMobLevel, actOfTile, actSpecialLevel, BADLANDS_H, BADLANDS_Y0, CROWN_Y0, MAP_H, MAP_W, SINKHOLES_H, SINKHOLES_LEVEL, SINKHOLES_Y0, TILE, WORLD_H, inCitiesBand,
} from "../shared/constants";
import { AREAS, CITY_POSTS, EMPTY, GROUND, HIGHWAY_POSTS, HIGHWAY_SKIP, isSafeZone, isSolidAt, isSolidTile, OBJECTS, randomSpawn, T, TILE_COUNT, NATURE } from "../shared/map";
import {
  buildSinkholes, CAVE_MOUTHS, GREAT_MAW, HIDEHALL, inSinkholesRow, ROPEWELL, ROPEWELL_SQUARE, SINK_LANDS, SINKGATE, SINKS, SINKWAY_BOX,
  SINKWAY_OAKVALE, SINKWAY_SINKHOLES, SR, WARRENS,
} from "../shared/sinkholes";
import { REDPASS_BADLANDS } from "../shared/badlands";
import {
  actAt, actOpen, actSpawn, gateColdNote, gateOpen, HOMELAND_GATES, isBadlandsGate, isSinkholesGate, sinkholesSpawn, waygateArrival, waygateById,
} from "../shared/act2";
import { baseLevelAt, SPAWN_ZONES } from "../shared/spawns";
import { TERRITORIES } from "../shared/war/territories";
import { regionOf } from "../shared/war/regions";
import { startRoom, until, wait } from "./helpers/room";
import { carveVillages, VILLAGES } from "../shared/villages";

/** 4-way flood over free tiles from (sx, sy). */
function flood(sx: number, sy: number) {
  const seen = new Uint8Array(MAP_W * MAP_H), q = [sy * MAP_W + sx];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % MAP_W, y = (q[i] / MAP_W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (isSolidTile(nx, ny) || seen[ny * MAP_W + nx]) continue;
      seen[ny * MAP_W + nx] = 1; q.push(ny * MAP_W + nx);
    }
  }
  return seen;
}
const tileOf = (p: { x: number; y: number }) => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)] as const;
const S0 = SINKHOLES_Y0, S1 = SINKHOLES_Y0 + SINKHOLES_H;
const NEW_TILES = [T.MOSS, T.PIT, T.BURROW, T.CAVE];

test("sinkholes: a band of its own under the badlands, built the same every time", () => {
  assert.equal(SINKHOLES_Y0, BADLANDS_Y0 + BADLANDS_H + 8);
  assert.equal(SINKHOLES_Y0, 964);
  assert.equal(CROWN_Y0, SINKHOLES_Y0 + SINKHOLES_H + 8, "the Crown (Act 6) lies under the sinkholes' rock");
  assert.equal(GROUND.length, MAP_H);
  assert.ok(TILE_COUNT >= 64);
  assert.deepEqual(NEW_TILES, [60, 61, 62, 63]);
  const fresh = () => {
    const g = Array.from({ length: MAP_H }, () => Array<number>(MAP_W).fill(T.DIRT)), o = Array.from({ length: MAP_H }, () => Array<number>(MAP_W).fill(T.ROCK));
    const r = buildSinkholes(T, g, o, EMPTY);
    for (const c of CITIES) if (c.act === 5) cityGateDais(c, T, g, o, EMPTY, (t) => NATURE.has(t)); // the capital's city gate (W7), cut in after the land
    carveBorders(g, o, new Set(), T, EMPTY); // the border roads (shared/borders.ts), cut last
    const rd = new Set(r.roads);
    carveCitiesInLand(T, g, o, EMPTY, rd, [...r.posts], () => T.GRASS_DARK, undefined, [5]); for (const p of CITY_POSTS) o[p.y][p.x] = T.SIGNPOST; // Deepden (shared/cityLand.ts, settlement network step 5) and its posts, after them
    carveHighways(g, o, rd, T, EMPTY, HIGHWAY_SKIP, [5]); for (const p of HIGHWAY_POSTS) o[p.y][p.x] = T.SIGNPOST; // the land highway and its posts (shared/highways.ts), after them
    carveVillages(g, o, rd, T, EMPTY, () => [], undefined, VILLAGES.filter((v) => v.land === 5).map((v) => v.id)); // its villages (shared/villages.ts), last
    return { g: g.slice(S0, S1), o: o.slice(S0, S1), areas: r.areas, roads: [...r.roads], posts: r.posts };
  };
  const a = fresh(), b = fresh();
  assert.deepEqual(a, b, "deterministic");
  assert.deepEqual(a.g, GROUND.slice(S0, S1), "the world's sinkholes ground");
  assert.deepEqual(a.o, OBJECTS.slice(S0, S1), "the world's sinkholes objects");
  // the land's look: dark grass, moss, mud, loam cliffs, pits, drowned sinks, burrows, copses, rubble
  const count = (layer: number[][], id: number) => layer.slice(S0, S1).reduce((n, row) => n + row.filter((t) => t === id).length, 0);
  for (const [layer, id, name, min] of [[GROUND, T.GRASS_DARK, "dark grass", 5000], [GROUND, T.MOSS, "moss", 5000], [GROUND, T.DIRT, "mud", 1000],
    [GROUND, T.WATER, "drowned sinks", 60], [GROUND, T.RUBBLE, "collapsed slopes", 200], [OBJECTS, T.CLIFF, "loam cliffs", 5000],
    [OBJECTS, T.PIT, "sinkhole pits", 300], [OBJECTS, T.BURROW, "burrow mounds", 40], [OBJECTS, T.CAVE, "cave mouths", CAVE_MOUTHS.length * 3],
    [OBJECTS, T.TREE, "willows and alders", 100], [OBJECTS, T.BUSH, "brush", 200], [OBJECTS, T.ROCK, "boulders", 100]] as const)
    assert.ok(count(layer as number[][], id) >= min, `${name} in the sinkholes`);
  // the Great Maw is a pit (the Maw-Father's ledge down in its middle, tests/sinkholes-zones.test.ts), every sink a pit or black water
  assert.equal(OBJECTS[SR(GREAT_MAW.y)][GREAT_MAW.x - GREAT_MAW.rx + 3], T.PIT);
  assert.equal(OBJECTS[SR(GREAT_MAW.y)][GREAT_MAW.x + GREAT_MAW.rx - 3], T.PIT);
  for (const s of SINKS) if (!cityAt(s.x, SR(s.y))) assert.ok(s.flooded ? GROUND[SR(s.y)][s.x] === T.WATER : OBJECTS[SR(s.y)][s.x] === T.PIT, `sink at ${s.x},${s.y}`); // (Deepden is built over the pond at 205,150)
  assert.equal(SINKS.filter((s) => cityAt(s.x, SR(s.y))).length, 1, "one sink under a city");
  for (const c of CAVE_MOUTHS) for (let i = -1; i <= 1; i++) assert.equal(OBJECTS[SR(c.y)][c.x + i], T.CAVE, `cave mouth at ${c.x},${c.y}`);
  // the new tiles stay in the sinkholes band (and the capitals' band)
  for (let y = 0; y < MAP_H; y++) if (!inSinkholesRow(y) && !inCitiesBand(y)) for (let x = 0; x < MAP_W; x++) { // the capitals (W7) lay their streets in the lands' own ground tiles
    assert.ok(!NEW_TILES.includes(GROUND[y][x]) && !NEW_TILES.includes(OBJECTS[y][x]), `sinkholes tile at ${x},${y}`);
  }
  // its own name, not the Act 1 hole down to the Warrens
  assert.ok(AREAS.some((r) => r.name === "The Mawdeep Sinkholes" && r.y === S0 && r.h === SINKHOLES_H));
  assert.ok(AREAS.some((r) => r.name === "Mawdeep Sinkhole" && r.y < WORLD_H), "Act 1's Mawdeep Sinkhole keeps its name");
});

test("sinkholes: actOfTile knows all five acts, the rock strip under the badlands split between them", () => {
  assert.equal(actOfTile(80, 60), 1, "Oakvale");
  assert.equal(actOfTile(SINKWAY_OAKVALE.x, SINKWAY_OAKVALE.y), 1, "the Sinkway's Act 1 side");
  assert.equal(actOfTile(140, 400), 2, "the Sunscar");
  assert.equal(actOfTile(140, 700), 3, "the moors");
  assert.equal(actOfTile(REDPASS_BADLANDS.x, REDPASS_BADLANDS.y), 4, "the badlands");
  assert.equal(actOfTile(140, BADLANDS_Y0 + BADLANDS_H - 1), 4, "the badlands' last row");
  for (let y = BADLANDS_Y0 + BADLANDS_H; y < S0; y++) assert.equal(actOfTile(140, y), y < S0 - 4 ? 4 : 5, `rock strip row ${y}`);
  assert.deepEqual([956, 959, 960, 963].map((y) => actOfTile(0, y)), [4, 4, 5, 5], "rows 956-959 Act 4, 960-963 Act 5");
  assert.equal(actOfTile(SINKWAY_SINKHOLES.x, SINKWAY_SINKHOLES.y), 5, "the Sinkway's sinkholes side");
  assert.equal(actOfTile(0, S0), 5);
  assert.equal(actOfTile(287, S1 + 3), 5, "the rock under the sinkholes, its upper half");
  assert.equal(actOfTile(287, S1 + 4), 6, "its lower half is the Crown's");
  assert.equal(actAt(SINKWAY_SINKHOLES.y * TILE, SINKWAY_SINKHOLES.x * TILE), 5);
  assert.ok(inSinkholesRow(SR(0)) && inSinkholesRow(SR(SINKHOLES_H - 1)) && !inSinkholesRow(SR(-1)) && !inSinkholesRow(SR(SINKHOLES_H)));
});

test("sinkholes: sealed in rock, every walkable tile reachable from the Sinkway, Ropewell and Hidehall open to walk in, room for the war", () => {
  const gate = waygateById("sinkholes")!, home = waygateById("sinkway")!;
  const [ax, ay] = tileOf(waygateArrival(gate));
  assert.ok(!isSolidTile(ax, ay), "the sinkholes arrival spot is free");
  assert.ok(ax < MAP_W / 2 && ay < S0 + 20, "arrival at the band's north-west");
  assert.equal(OBJECTS[SR(SINKGATE.y - 1)][SINKGATE.x], T.CAVE, "heroes come up out of a cave mouth");
  const seen = flood(ax, ay);
  let walk = 0;
  for (let y = S0; y < S1; y++) for (let x = 0; x < MAP_W; x++) {
    if (isSolidTile(x, y)) continue;
    walk++;
    assert.ok(seen[y * MAP_W + x], `sinkholes tile ${x},${y} reachable`);
  }
  assert.ok(walk > MAP_W * SINKHOLES_H * 0.5, "mostly open land");
  for (let y = BADLANDS_Y0 + BADLANDS_H; y < S0; y++) for (let x = 0; x < MAP_W; x++) assert.ok(isSolidTile(x, y), `rock at ${x},${y}`);
  for (let y = S1; y < CROWN_Y0; y++) for (let x = 0; x < MAP_W; x++) assert.ok(isSolidTile(x, y), `rock at ${x},${y}`);
  // Ropewell (just south-east of the gate) and Hidehall (far south-east), raised in tests/sinkholes-zones.test.ts: mostly
  // open ground inside their walls, every bit of it reachable through the gates
  for (const r of [ROPEWELL, HIDEHALL]) {
    let open = 0;
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
      if (isSolidTile(x, SR(y))) continue;
      open++;
      assert.ok(seen[SR(y) * MAP_W + x], `tile ${x},${SR(y)} inside the walls reachable`);
    }
    assert.ok(open > (r.w - 2) * (r.h - 2) * 0.6, `${open} open tiles inside`);
  }
  assert.ok(ROPEWELL.x > SINKGATE.x && ROPEWELL.y > SINKGATE.y && ROPEWELL.x - SINKGATE.x < 20, "Ropewell just south-east of the gate");
  assert.ok(HIDEHALL.x > MAP_W * 0.7 && HIDEHALL.y > SINKHOLES_H * 0.6, "Hidehall in the far south-east");
  // every future zone land has a clear 5x5 for a war Hold, inside the land
  for (const l of SINK_LANDS) {
    const [hx, hy] = l.hold;
    assert.ok(hx - 2 >= l.x && hx + 2 < l.x + l.w && hy - 2 >= l.y && hy + 2 < l.y + l.h, `${l.name}: the patch is inside the land`);
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) assert.ok(!isSolidTile(hx + i, SR(hy + j)) && seen[SR(hy + j) * MAP_W + hx + i], `${l.name}: clear ground at ${hx + i},${hy + j}`);
  }
  assert.ok(WARRENS.every((w) => SINK_LANDS.some((l) => l.name === w.name)), "every warren is a land of its own");
  // Ropewell's square is the sinkholes' safe zone, and where heroes come back
  assert.ok(isSafeZone((ROPEWELL_SQUARE.x + 1) * TILE, SR(ROPEWELL_SQUARE.y + 1) * TILE));
  assert.ok(!isSafeZone(waygateArrival(gate).x, waygateArrival(gate).y), "the arrival is not on the square");
  for (let i = 0; i < 40; i++) { const p = sinkholesSpawn(); assert.equal(actAt(p.y, p.x), 5); assert.ok(isSafeZone(p.x, p.y) && !isSolidAt(p.x, p.y), "a free spawn spot on the square"); }
  // Act 1's side: on open ground on the beach south of Sunken Lake, reachable on foot from Oakvale's square
  const s = randomSpawn(), oak = flood(...tileOf(s));
  const [ox, oy] = tileOf(waygateArrival(home));
  assert.ok(oak[oy * MAP_W + ox], "the Sinkway's Act 1 arrival is reachable from Oakvale");
  assert.ok(oak[SINKWAY_OAKVALE.y * MAP_W + SINKWAY_OAKVALE.x], "the gate stands on open ground, joined to Oakvale");
  const B = SINKWAY_BOX;
  assert.ok(SINKWAY_OAKVALE.x - 4 >= B.x0 && SINKWAY_OAKVALE.x + 4 <= B.x1 && SINKWAY_OAKVALE.y - 4 >= B.y0 && SINKWAY_OAKVALE.y + 4 <= B.y1, "the dais is inside the carve box");
  assert.ok(B.y1 < WORLD_H);
});

test("sinkholes: Lv 30-45 climbing south-east, the Sinkway opens at Lv 30, a war land of their own", () => {
  assert.equal(baseLevelAt(SINKWAY_SINKHOLES.x, SINKWAY_SINKHOLES.y), 30);
  assert.ok(baseLevelAt(HIDEHALL.x + 10, SR(HIDEHALL.y + 10)) >= 43, "Hidehall: the top of the band");
  assert.ok(baseLevelAt(200, SR(120)) > baseLevelAt(110, SR(40)), "higher further south-east");
  assert.deepEqual(SINKHOLES_LEVEL, { min: 30, mob: 43, special: 45, tilesPerLevel: 12 });
  assert.equal(ACT_LEVEL[5], SINKHOLES_LEVEL);
  assert.deepEqual([actMobLevel(5, 3), actMobLevel(5, 60), actSpecialLevel(5, 60)], [30, 43, 45]);
  assert.deepEqual([actMobLevel(4, 3), actMobLevel(4, 60), actSpecialLevel(4, 60)], [25, 38, 40], "Act 4 unchanged");
  // the gate pair
  const g = waygateById("sinkway")!, b = waygateById("sinkholes")!;
  assert.equal(g.to, "sinkholes"); assert.equal(b.to, "sinkway");
  assert.ok(isSinkholesGate(g) && isSinkholesGate(b) && !isBadlandsGate(g) && !isSinkholesGate(waygateById("redpass")!));
  assert.equal(gateOpen(g, { level: 29 } as never), false);
  assert.equal(gateOpen(b, { level: 30 } as never), true);
  assert.equal(gateColdNote(g, undefined), "The tunnel is caved in. Return at level 30.");
  assert.deepEqual(HOMELAND_GATES.slice(0, 3).map((h) => [h.act, h.level]), [[3, 20], [4, 25], [5, 30]]);
  assert.ok(actOpen(5, { level: 30 } as never) && !actOpen(5, { level: 29 } as never));
  for (const act of [1, 2, 3, 4, 5]) { const q = actSpawn(act, randomSpawn); assert.equal(actAt(q.y, q.x), act, `act ${act} spawn`); }
  // its own monsters (tests/sinkholes-zones.test.ts); the war reaches the sinkholes as a land of their own
  // (shared/war/regions.ts): every Act 5 territory is in it, none elsewhere
  assert.ok(SPAWN_ZONES.some((z) => actOfTile(z.x, z.y) === 5), "its own monster zones");
  assert.equal(regionOf(SINKWAY_SINKHOLES.x, SINKWAY_SINKHOLES.y)?.key, "sinkholes");
  assert.ok(TERRITORIES.some((t) => t.act === 5), "the sinkholes are at war");
  for (const t of TERRITORIES) assert.equal(t.region === "sinkholes", t.act === 5, t.name);
});

/** onJoin as an account through a fake client (test rooms skip onAuth), like tests/badlands.test.ts. */
let seq = 0;
function fakeJoin(room: any, name: string) {
  const sid = `sink${++seq}`;
  room.onJoin({ sessionId: sid, send: () => {} }, { cls: "wizard" }, { name });
  return { p: room.state.players.get(sid), done: () => room.state.players.delete(sid) };
}

test("room: the Sinkway is caved in under Lv 30, crosses at Lv 30, and a hero saved in the sinkholes logs back in there", async () => {
  const { login, saveHero } = await import("../server/accounts");
  const { dropLive } = await import("../server/handoff");
  const srv = await startRoom();
  const name = `Sinker${process.pid % 1000}`;
  try {
    await login(name, "testpass1", "127.0.0.1");
    const c = await srv.join({ cls: "wizard" });
    const crossed: string[] = [], notes: string[] = [];
    c.onMessage("waygate", (m: { to: string }) => crossed.push(m.to));
    c.onMessage("chat", (m: { text: string }) => notes.push(m.text));
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const gate = waygateById("sinkway")!;
    p.level = 29; p.x = gate.x + TILE; p.y = gate.y + TILE; p.lastHurt = 0;
    c.send("waygate");
    assert.ok(await until(() => notes.some((t) => /The tunnel is caved in\. Return at level 30\./.test(t))), "the caved-in note");
    assert.deepEqual(crossed, [], "Lv 29: refused");
    assert.equal(actAt(p.y, p.x), 1);
    p.level = 30;
    c.send("waygate");
    assert.ok(await until(() => crossed.length === 1));
    assert.deepEqual(crossed, ["sinkholes"]);
    assert.equal(actAt(p.y, p.x), 5, "in the sinkholes");
    const at = waygateArrival(waygateById("sinkholes")!);
    assert.ok(Math.hypot(p.x - at.x, p.y - at.y) < TILE, "by the sinkholes end of the Sinkway");
    const save = structuredClone(room.snapshot(p));
    assert.equal(save.act, 5, "the save says act 5");
    // and back home up the Sinkway
    p.lastHurt = 0; p.x = at.x; p.y = at.y - TILE;
    c.send("waygate");
    assert.ok(await until(() => crossed.length === 2));
    assert.equal(crossed[1], "sinkway");
    assert.equal(actAt(p.y, p.x), 1, "home in Act 1");
    await c.leave();
    // logging in from the act-5 save (a cold login) puts the hero on Ropewell's square
    saveHero(name, "wizard", save);
    dropLive(name, "wizard");
    const j = fakeJoin(room, name);
    try {
      assert.equal(j.p.level, 30);
      assert.equal(actAt(j.p.y, j.p.x), 5, "logs back in in the sinkholes");
      assert.ok(isSafeZone(j.p.x, j.p.y) && !isSolidAt(j.p.x, j.p.y), "on Ropewell's square");
      assert.equal(room.snapshot(j.p).act, 5, "and stays in act 5");
    } finally { j.done(); }
    // an act-5 save under Lv 30 falls back to Oakvale's square
    saveHero(name, "wizard", { ...save, level: 27, xp: 0 });
    dropLive(name, "wizard");
    const k = fakeJoin(room, name);
    try {
      assert.equal(actAt(k.p.y, k.p.x), 1, "back in Oakvale");
      assert.ok(!isSolidAt(k.p.x, k.p.y));
    } finally { k.done(); }
  } finally {
    await srv.stop();
  }
});
