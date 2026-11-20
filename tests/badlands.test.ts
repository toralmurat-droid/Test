import { test } from "node:test";
import { BORDER_BOXES, carveBorders } from "../shared/borders";
import { HIGHWAY_MASK } from "../shared/highways";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  ACT_LEVEL, actMobLevel, actOfTile, actSpecialLevel, BADLANDS_H, BADLANDS_LEVEL, BADLANDS_Y0, DEEP_END, MAP_H, MAP_W, MOORS_H, MOORS_Y0, SINKHOLES_Y0, TILE, WORLD_H, inCitiesBand,
} from "../shared/constants";
import { EMPTY, GROUND, isSafeZone, isSolidAt, isSolidTile, MIRROR_POND, OBJECTS, randomSpawn, T, TILE_COUNT, NATURE, PORTAL_SPOTS } from "../shared/map";
import {
  ARCHES, BR, buildBadlands, FANGROCK, inBadlandsRow, REDPASS, REDPASS_BADLANDS, REDPASS_OAKVALE, RUSTWATER_POST, RUSTWATER_SQUARE, TALON_FORT,
} from "../shared/badlands";
import { MOORSGATE_MOORS } from "../shared/moors";
import { SINKWAY_BOX } from "../shared/sinkholes";
import { SALT_BOXES } from "../shared/saltmere";
import { crownwayFrom } from "../shared/crown";
import { CITIES, cityGateDais } from "../shared/capitals";
import { KEL_MARKET, D } from "../shared/desert";
import {
  actAt, actOpen, actSpawn, badlandsOpen, badlandsSpawn, gateColdNote, gateOpen, HOMELAND_GATES, isBadlandsGate, isMoorsGate, waygateArrival, waygateById,
} from "../shared/act2";
import { baseLevelAt, SPAWN_ZONES } from "../shared/spawns";
import { TERRITORIES } from "../shared/war/territories";
import { REGIONS, regionOf } from "../shared/war/regions";
import { startRoom, until, wait } from "./helpers/room";

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
const B0 = BADLANDS_Y0, B1 = BADLANDS_Y0 + BADLANDS_H;
const NEW_TILES = [T.CLAY, T.GRAVEL, T.ARCH, T.CACTUS];

test("badlands: a band of its own under the moors, built the same every time", () => {
  assert.equal(BADLANDS_Y0, MOORS_Y0 + MOORS_H + 8);
  assert.equal(BADLANDS_Y0, 780);
  assert.equal(SINKHOLES_Y0, BADLANDS_Y0 + BADLANDS_H + 8, "the sinkholes (Act 5) lie under the badlands' rock");
  assert.equal(GROUND.length, MAP_H);
  assert.ok(TILE_COUNT >= 60);
  assert.deepEqual(NEW_TILES, [56, 57, 58, 59]);
  const fresh = () => {
    const g = Array.from({ length: MAP_H }, () => Array<number>(MAP_W).fill(T.DIRT)), o = Array.from({ length: MAP_H }, () => Array<number>(MAP_W).fill(T.ROCK));
    const r = buildBadlands(T, g, o, EMPTY);
    for (const c of CITIES) if (c.act === 4) cityGateDais(c, T, g, o, EMPTY, (t) => NATURE.has(t)); // the capital's city gate (W7), cut in after the land
    carveBorders(g, o, new Set(), T, EMPTY); // the border roads (shared/borders.ts), cut last
    return { g: g.slice(B0, B1), o: o.slice(B0, B1), areas: r.areas, roads: [...r.roads], posts: r.posts };
  };
  const a = fresh(), b = fresh();
  assert.deepEqual(a, b, "deterministic");
  assert.deepEqual(a.g, GROUND.slice(B0, B1), "the world's badlands ground");
  assert.deepEqual(a.o, OBJECTS.slice(B0, B1), "the world's badlands objects");
  // the land's look: red sand, cracked clay, riverbed gravel, mesas, arches, cactus, scrub, boulders, bones
  const count = (layer: number[][], id: number) => layer.slice(B0, B1).reduce((n, row) => n + row.filter((t) => t === id).length, 0);
  for (const [layer, id, name, min] of [[GROUND, T.SAND, "red sand", 2000], [GROUND, T.CLAY, "clay flats", 2000], [GROUND, T.GRAVEL, "riverbed gravel", 500],
    [OBJECTS, T.CLIFF, "red cliffs and mesas", 5000], [OBJECTS, T.ARCH, "arch legs", ARCHES.length * 2 - 1], [OBJECTS, T.CACTUS, "cactus", 100],
    [OBJECTS, T.BUSH, "dry scrub", 100], [OBJECTS, T.ROCK, "boulders", 100], [OBJECTS, T.BONES, "bones", 20], [OBJECTS, T.STUMP, "dead brush", 20]] as const)
    assert.ok(count(layer as number[][], id) >= min, `${name} in the badlands`);
  // every arch: two solid legs, open ground under its span
  for (const r of ARCHES) {
    assert.equal(OBJECTS[BR(r.y)][r.x], T.ARCH); assert.equal(OBJECTS[BR(r.y)][r.x + r.span], T.ARCH);
    for (let i = 1; i < r.span; i++) assert.ok(!isSolidTile(r.x + i, BR(r.y)), `under arch ${r.x},${r.y}`);
  }
  // the new tiles stay in the badlands band (and the capitals' band)
  for (let y = 0; y < MAP_H; y++) if (!inBadlandsRow(y) && !inCitiesBand(y)) for (let x = 0; x < MAP_W; x++) { // the capitals (W7) lay their streets in the lands' own ground tiles
    assert.ok(!NEW_TILES.includes(GROUND[y][x]) && !NEW_TILES.includes(OBJECTS[y][x]), `badlands tile at ${x},${y}`);
  }
});

test("badlands: actOfTile knows all four acts, the rock strips split between the bands", () => {
  assert.equal(actOfTile(80, 60), 1, "Oakvale");
  assert.equal(actOfTile(REDPASS_OAKVALE.x, REDPASS_OAKVALE.y), 1, "the Red Pass's Act 1 side");
  assert.equal(actOfTile(50, WORLD_H + 30), 1, "the Mawdeep");
  assert.equal(actOfTile(KEL_MARKET.x, D(KEL_MARKET.y)), 2, "Kel Ashar");
  assert.equal(actOfTile(200, DEEP_END - 1), 2, "the Undercity's band");
  assert.equal(actOfTile(MOORSGATE_MOORS.x, MOORSGATE_MOORS.y), 3, "the moors");
  assert.equal(actOfTile(140, MOORS_Y0 - 4), 3, "the rock above the moors");
  assert.equal(actOfTile(140, MOORS_Y0 + MOORS_H - 1), 3, "the moors' last row");
  for (let y = MOORS_Y0 + MOORS_H; y < BADLANDS_Y0; y++) assert.equal(actOfTile(140, y), y < BADLANDS_Y0 - 4 ? 3 : 4, `rock strip row ${y}`);
  assert.equal(actOfTile(REDPASS_BADLANDS.x, REDPASS_BADLANDS.y), 4, "the Red Pass's badlands side");
  assert.equal(actOfTile(0, B0), 4);
  assert.equal(actOfTile(287, B1 + 3), 4, "the rock under the badlands, its upper half");
  assert.equal(actOfTile(287, B1 + 4), 5, "its lower half is the sinkholes'");
  assert.equal(actAt(REDPASS_BADLANDS.y * TILE, REDPASS_BADLANDS.x * TILE), 4);
  assert.ok(inBadlandsRow(BR(0)) && inBadlandsRow(BR(BADLANDS_H - 1)) && !inBadlandsRow(BR(-1)) && !inBadlandsRow(BR(BADLANDS_H)));
});

test("badlands: sealed in rock, every walkable tile reachable from the Red Pass, the Post and the forts open to walk in", () => {
  const gate = waygateById("badlands")!, home = waygateById("redpass")!;
  const [ax, ay] = tileOf(waygateArrival(gate));
  assert.ok(!isSolidTile(ax, ay), "the badlands arrival spot is free");
  assert.ok(ax > MAP_W - 40, "arrival at the band's east edge");
  const seen = flood(ax, ay);
  let walk = 0;
  for (let y = B0; y < B1; y++) for (let x = 0; x < MAP_W; x++) {
    if (isSolidTile(x, y)) continue;
    walk++;
    assert.ok(seen[y * MAP_W + x], `badlands tile ${x},${y} reachable`);
  }
  assert.ok(walk > MAP_W * BADLANDS_H * 0.5, "mostly open land");
  for (let y = MOORS_Y0 + MOORS_H; y < B0; y++) for (let x = 0; x < MAP_W; x++) assert.ok(isSolidTile(x, y), `rock at ${x},${y}`);
  for (let y = B1; y < SINKHOLES_Y0; y++) for (let x = 0; x < MAP_W; x++) assert.ok(isSolidTile(x, y), `rock at ${x},${y}`);
  // the Rustwater Post, Fangrock and Talon Fort (raised in tests/badlands-zones.test.ts): mostly open ground inside their
  // walls, every bit of it reachable through the gates
  for (const r of [RUSTWATER_POST, FANGROCK, TALON_FORT]) {
    let open = 0;
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
      if (isSolidTile(x, BR(y))) continue;
      open++;
      assert.ok(seen[BR(y) * MAP_W + x], `tile ${x},${BR(y)} inside the walls reachable`);
    }
    assert.ok(open > (r.w - 2) * (r.h - 2) * 0.6, `${open} open tiles inside`);
  }
  assert.ok(RUSTWATER_POST.x + RUSTWATER_POST.w < REDPASS.x && REDPASS.x - RUSTWATER_POST.x < 50, "the Post is just west of the arrival");
  assert.ok(FANGROCK.x + FANGROCK.w < 60, "Fangrock in the far west");
  // the Post's square is the badlands' safe zone, and where heroes come back
  assert.ok(isSafeZone((RUSTWATER_SQUARE.x + 1) * TILE, BR(RUSTWATER_SQUARE.y + 1) * TILE));
  for (let i = 0; i < 40; i++) { const p = badlandsSpawn(); assert.equal(actAt(p.y, p.x), 4); assert.ok(isSafeZone(p.x, p.y) && !isSolidAt(p.x, p.y), "a free spawn spot on the square"); }
  // Act 1's side: on open ground, reachable on foot from Oakvale's square, between Mirror Pond and Barrow Downs
  const s = randomSpawn(), oak = flood(...tileOf(s));
  const [ox, oy] = tileOf(waygateArrival(home));
  assert.ok(oak[oy * MAP_W + ox], "the Red Pass's Act 1 arrival is reachable from Oakvale");
  assert.ok(oak[REDPASS_OAKVALE.y * MAP_W + REDPASS_OAKVALE.x], "the gate stands on open ground, joined to Oakvale");
  assert.ok(REDPASS_OAKVALE.x < 6 && REDPASS_OAKVALE.y > MIRROR_POND.y && REDPASS_OAKVALE.y < 145, "west edge, south of Mirror Pond, north of Barrow Downs");
});

test("badlands: the Red Pass (and the Sinkway) leave the rest of Act 1 exactly as it was", () => {
  // the overworld's tiles outside the gates' carve boxes (the Red Pass: x <= 14, rows 113-123; the Sinkway, Act 5:
  // shared/sinkholes.ts SINKWAY_BOX; the Saltmere rework: shared/saltmere.ts SALT_BOXES; the Greenward Gate, Act 6:
  // shared/crown.ts CROWNWAYS; the capitals' city gates, W7: shared/capitals.ts CITIES outerBox), hashed before any of them was added (the same hash before and after the Saltmere rework;
  // re-hashed with the Greenward Gate's box masked on the map before the Crown, and with Hearthhold's box masked on the
  // map before W7: the only tiles the city gate changed lie inside it; the border roads' BORDER_BOXES, shared/borders.ts, too: re-hashed with them masked, the same with and without the roads cut; the portal stones added after the capitals' waystones, settlement network 2026-11-19,
  // each clear the nature in a small disk round them: re-hashed with their boxes masked on the map before them; the land highways, shared/highways.ts
  // HIGHWAY_MASK, cut last and only inside it: re-hashed with the mask on the map before them, the same with and without them). A deliberate change to the overworld
  // map must update this hash.
  const S = SINKWAY_BOX, C = crownwayFrom("oakvale").box;
  const STONE_BOXES = PORTAL_SPOTS.slice(10 + CITIES.length).map((p) => ({ x0: p.x - 3, x1: p.x + 3, y0: p.y - 3, y1: p.y + 3 }));
  const box = (x: number, y: number) => (x <= 14 && y >= 113 && y <= 123) || (x >= S.x0 && x <= S.x1 && y >= S.y0 && y <= S.y1)
    || [...SALT_BOXES, C, ...CITIES.map((c) => c.outerBox), ...BORDER_BOXES, ...STONE_BOXES].some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1)
    || HIGHWAY_MASK.has(y * MAP_W + x);
  const h = createHash("sha256");
  for (let y = 0; y < WORLD_H; y++) h.update(GROUND[y].map((g, x) => (box(x, y) ? -9 : g)).join(",") + "|" + OBJECTS[y].map((o, x) => (box(x, y) ? -9 : o)).join(",") + "\n");
  assert.equal(h.digest("hex"), "a28b8681b9ec3f38021666f2363212f8c386e5d2002b9b2376963fdf3f8b6301");
});

test("badlands: Lv 25-40 climbing west, the Red Pass opens at Lv 25, a war land of their own", () => {
  assert.equal(baseLevelAt(REDPASS.x, BR(REDPASS.y)), 25);
  assert.ok(baseLevelAt(FANGROCK.x + 10, BR(FANGROCK.y + 10)) >= 37, "Fangrock: the top of the band");
  assert.ok(baseLevelAt(140, BR(90)) > baseLevelAt(220, BR(90)), "higher further west");
  assert.equal(actMobLevel(4, 60), BADLANDS_LEVEL.mob); assert.equal(BADLANDS_LEVEL.mob, 38);
  assert.equal(actSpecialLevel(4, 60), BADLANDS_LEVEL.special); assert.equal(BADLANDS_LEVEL.special, 40);
  assert.equal(actMobLevel(4, 3), 25);
  // the other acts keep their bands (the table replaced per-act ternaries)
  assert.deepEqual([actMobLevel(1, 0), actMobLevel(1, 40), actSpecialLevel(1, 40)], [1, 25, 30]);
  assert.deepEqual([actMobLevel(2, 5), actMobLevel(2, 60), actSpecialLevel(2, 60)], [30, 47, 50]);
  assert.deepEqual([actMobLevel(3, 5), actMobLevel(3, 60), actSpecialLevel(3, 60)], [20, 33, 35]);
  assert.deepEqual(Object.keys(ACT_LEVEL), ["1", "2", "3", "4", "5", "6"]);
  // the gate pair
  const g = waygateById("redpass")!, b = waygateById("badlands")!;
  assert.equal(g.to, "badlands"); assert.equal(b.to, "redpass");
  assert.ok(isBadlandsGate(g) && isBadlandsGate(b) && !isMoorsGate(g) && isMoorsGate(waygateById("moors")!));
  assert.ok(!badlandsOpen({ level: 24 }) && badlandsOpen({ level: 25 }) && !badlandsOpen(undefined));
  assert.equal(gateOpen(g, { level: 24 } as never), false);
  assert.equal(gateOpen(b, { level: 25 } as never), true);
  assert.equal(gateColdNote(g, undefined), "The pass is held shut. Return at level 25.");
  assert.equal(gateColdNote(waygateById("moorsgate")!, undefined), "The gate is cold. Return at level 20.");
  assert.deepEqual(HOMELAND_GATES.slice(0, 2).map((h) => [h.act, h.level]), [[3, 20], [4, 25]]);
  assert.ok(actOpen(1, undefined) && actOpen(4, { level: 25 } as never) && !actOpen(4, { level: 24 } as never) && !actOpen(7, { level: 50 } as never));
  for (const act of [1, 2, 3, 4]) { const q = actSpawn(act, randomSpawn); assert.equal(actAt(q.y, q.x), act, `act ${act} spawn`); }
  // the war reaches the badlands as a land of their own (shared/war/regions.ts): every Act 4 territory is in it, none elsewhere
  assert.equal(regionOf(REDPASS.x, BR(REDPASS.y))?.key, "badlands");
  assert.ok(REGIONS.find((r) => r.key === "badlands")!.contains);
  assert.ok(TERRITORIES.some((t) => t.act === 4), "the badlands are at war");
  for (const t of TERRITORIES) assert.equal(t.region === "badlands", t.act === 4, t.name);
  assert.ok(SPAWN_ZONES.some((z) => actOfTile(z.x, z.y) === 4), "its own monster zones (tests/badlands-zones.test.ts)");
});

/** onJoin as an account through a fake client (test rooms skip onAuth), like tests/moors.test.ts. */
let seq = 0;
function fakeJoin(room: any, name: string) {
  const sid = `bad${++seq}`;
  room.onJoin({ sessionId: sid, send: () => {} }, { cls: "wizard" }, { name });
  return { p: room.state.players.get(sid), done: () => room.state.players.delete(sid) };
}

test("room: the Red Pass is shut under Lv 25, crosses at Lv 25, and a hero saved in the badlands logs back in there", async () => {
  const { login, saveHero } = await import("../server/accounts");
  const { dropLive } = await import("../server/handoff");
  const srv = await startRoom();
  const name = `Badlander${process.pid % 1000}`;
  try {
    await login(name, "testpass1", "127.0.0.1");
    const c = await srv.join({ cls: "wizard" });
    const crossed: string[] = [], notes: string[] = [];
    c.onMessage("waygate", (m: { to: string }) => crossed.push(m.to));
    c.onMessage("chat", (m: { text: string }) => notes.push(m.text));
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const gate = waygateById("redpass")!;
    p.level = 24; p.x = gate.x + TILE; p.y = gate.y + TILE; p.lastHurt = 0;
    c.send("waygate");
    assert.ok(await until(() => notes.some((t) => /The pass is held shut\. Return at level 25\./.test(t))), "the shut-pass note");
    assert.deepEqual(crossed, [], "Lv 24: refused");
    assert.equal(actAt(p.y, p.x), 1);
    p.level = 25; p.lastHurt = 0; p.dead = false; p.hp = p.maxHp; // a mob by the pass may have struck while we waited (combat lock PORTAL_COMBAT_MS)
    c.send("waygate");
    assert.ok(await until(() => crossed.length === 1));
    assert.deepEqual(crossed, ["badlands"]);
    assert.equal(actAt(p.y, p.x), 4, "in the badlands");
    const at = waygateArrival(waygateById("badlands")!);
    assert.ok(Math.hypot(p.x - at.x, p.y - at.y) < TILE, "by the badlands side of the pass");
    const save = structuredClone(room.snapshot(p));
    assert.equal(save.act, 4, "the save says act 4");
    // and back home through the badlands side
    p.lastHurt = 0; p.x = at.x; p.y = at.y - TILE;
    c.send("waygate");
    assert.ok(await until(() => crossed.length === 2));
    assert.equal(crossed[1], "redpass");
    assert.equal(actAt(p.y, p.x), 1, "home in Act 1");
    await c.leave();
    // logging in from the act-4 save (a cold login) puts the hero on the Rustwater Post's square
    saveHero(name, "wizard", save);
    dropLive(name, "wizard");
    const j = fakeJoin(room, name);
    try {
      assert.equal(j.p.level, 25);
      assert.equal(actAt(j.p.y, j.p.x), 4, "logs back in in the badlands");
      assert.ok(isSafeZone(j.p.x, j.p.y) && !isSolidAt(j.p.x, j.p.y), "on the Post's square");
      assert.equal(room.snapshot(j.p).act, 4, "and stays in act 4");
    } finally { j.done(); }
    // an act-4 save under Lv 25 falls back to Oakvale's square
    saveHero(name, "wizard", { ...save, level: 22, xp: 0 });
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
