import { test } from "node:test";
import { carveBorders } from "../shared/borders";
import { CITIES, cityGateDais } from "../shared/capitals";
import assert from "node:assert/strict";
import {
  actMobLevel, actOfTile, actSpecialLevel, BADLANDS_Y0, DEEP_END, DESERT_Y0, MAP_H, MAP_W, MOORS_H, MOORS_LEVEL, MOORS_Y0, TILE, WORLD_H,
} from "../shared/constants";
import { EMPTY, GROUND, isSolidAt, isSolidTile, OBJECTS, randomSpawn, T, TILE_COUNT, NATURE } from "../shared/map";
import { buildMoors, inMoorsRow, MOORGATE, MOORS_OUTPOST, MOORSGATE_MOORS, MOORSGATE_OAKVALE, MR } from "../shared/moors";
import { KEL_MARKET, D } from "../shared/desert";
import { CRYPT_FLOORS, UNDER_FLOORS } from "../shared/dungeon";
import { actAt, actSpawn, cityGateOf, gateOpen, moorsOpen, moorsSpawn, waygateArrival, waygateById, WAYGATES } from "../shared/act2";
import { baseLevelAt, SPAWN_ZONES } from "../shared/spawns";
import { huntable } from "../shared/bounty";
import { TERRITORIES } from "../shared/war/territories";
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

test("moors: its own band under the deep band, built the same every time", () => {
  assert.equal(MOORS_Y0, DEEP_END + 8);
  assert.equal(BADLANDS_Y0, MOORS_Y0 + MOORS_H + 8, "the badlands (Act 4) lie under the moors' rock");
  assert.equal(GROUND.length, MAP_H);
  assert.ok(TILE_COUNT >= 56);
  for (const id of [T.HEATHER, T.BOG, T.BARROW, T.STANDING_STONE, T.BONE_PILE]) assert.ok(id < TILE_COUNT);
  // two fresh builds of the band are equal, and equal to the live world's
  const fresh = () => {
    const g = Array.from({ length: MAP_H }, () => Array<number>(MAP_W).fill(T.DIRT)), o = Array.from({ length: MAP_H }, () => Array<number>(MAP_W).fill(T.ROCK));
    const r = buildMoors(T, g, o, EMPTY);
    for (const c of CITIES) if (c.act === 3) cityGateDais(c, T, g, o, EMPTY, (t) => NATURE.has(t)); // the capital's city gate (W7), cut in after the land
    carveBorders(g, o, new Set(), T, EMPTY); // the border roads (shared/borders.ts), cut last
    return { g: g.slice(MOORS_Y0, MOORS_Y0 + MOORS_H), o: o.slice(MOORS_Y0, MOORS_Y0 + MOORS_H), areas: r.areas, roads: [...r.roads] };
  };
  const a = fresh(), b = fresh();
  assert.deepEqual(a, b, "deterministic");
  assert.deepEqual(a.g, GROUND.slice(MOORS_Y0, MOORS_Y0 + MOORS_H), "the world's moors ground");
  assert.deepEqual(a.o, OBJECTS.slice(MOORS_Y0, MOORS_Y0 + MOORS_H), "the world's moors objects");
  // the land has its own look: heather, bog, barrows, standing stones and bones are all there
  const count = (layer: number[][], id: number) => layer.slice(MOORS_Y0, MOORS_Y0 + MOORS_H).reduce((n, row) => n + row.filter((t) => t === id).length, 0);
  for (const [layer, id, name] of [[GROUND, T.HEATHER, "heather"], [GROUND, T.BOG, "bog"], [GROUND, T.WATER, "bog pools"], [OBJECTS, T.BARROW, "barrows"], [OBJECTS, T.STANDING_STONE, "standing stones"], [OBJECTS, T.BONE_PILE, "bone piles"], [OBJECTS, T.STUMP, "dead trees"]] as const)
    assert.ok(count(layer as number[][], id) > 20, `${name} in the moors`);
  // the new tiles stay in the moors band
  for (let y = 0; y < MOORS_Y0; y++) for (let x = 0; x < MAP_W; x++) {
    assert.ok(GROUND[y][x] !== T.HEATHER && GROUND[y][x] !== T.BOG, `moors ground at ${x},${y}`);
    assert.ok(OBJECTS[y][x] !== T.BARROW && OBJECTS[y][x] !== T.STANDING_STONE && OBJECTS[y][x] !== T.BONE_PILE, `moors object at ${x},${y}`);
  }
});

test("moors: actOfTile knows the moors band", () => {
  assert.equal(actOfTile(80, 60), 1, "Oakvale");
  assert.equal(actOfTile(MOORSGATE_OAKVALE.x, MOORSGATE_OAKVALE.y), 1, "the moorgate's Act 1 side");
  assert.equal(actOfTile(50, WORLD_H + 30), 1, "the Mawdeep");
  assert.equal(actOfTile(KEL_MARKET.x, D(KEL_MARKET.y)), 2, "Kel Ashar");
  assert.equal(actOfTile(CRYPT_FLOORS[0].x + 9, CRYPT_FLOORS[0].y + 8), 1, "the Lantern Crypt");
  assert.equal(actOfTile(UNDER_FLOORS[1].x + 9, UNDER_FLOORS[1].y + 8), 2, "the Undercity");
  assert.equal(actOfTile(DESERT_Y0, DEEP_END - 1), 2, "the deep band's east, last row");
  assert.equal(actOfTile(MOORSGATE_MOORS.x, MOORSGATE_MOORS.y), 3, "the moorgate's moors side");
  assert.equal(actOfTile(10, MOORS_Y0), 3);
  assert.equal(actOfTile(280, MOORS_Y0 + MOORS_H - 1), 3, "the moors' last row");
  assert.equal(actOfTile(140, MOORS_Y0 - 3), 3, "the rock strip above the moors");
  assert.equal(actOfTile(140, MOORS_Y0 + MOORS_H + 3), 3, "the rock strip under the moors, upper half");
  assert.equal(actOfTile(140, BADLANDS_Y0 - 4), 4, "its lower half is the badlands'");
  assert.equal(actAt(MOORSGATE_MOORS.y * TILE, MOORSGATE_MOORS.x * TILE), 3);
  assert.ok(inMoorsRow(MR(0)) && inMoorsRow(MR(MOORS_H - 1)) && !inMoorsRow(MR(-1)) && !inMoorsRow(MR(MOORS_H)));
});

test("moors: every walkable tile is reachable from the moorgate; the Act 1 gate from Oakvale", () => {
  const moorsGate = waygateById("moors")!, oakGate = waygateById("moorsgate")!;
  const [ax, ay] = tileOf(waygateArrival(moorsGate));
  assert.ok(!isSolidTile(ax, ay), "the moors arrival spot is free");
  const seen = flood(ax, ay);
  let walk = 0;
  for (let y = MOORS_Y0; y < MOORS_Y0 + MOORS_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (isSolidTile(x, y)) continue;
    walk++;
    assert.ok(seen[y * MAP_W + x], `moors tile ${x},${y} reachable`);
  }
  assert.ok(walk > MAP_W * MOORS_H * 0.5, "mostly open land");
  // the band is sealed: nothing walkable in the rock round it
  for (let y = DEEP_END; y < MOORS_Y0; y++) for (let x = 0; x < MAP_W; x++) assert.ok(isSolidTile(x, y), `rock at ${x},${y}`);
  for (let y = MOORS_Y0 + MOORS_H; y < BADLANDS_Y0; y++) for (let x = 0; x < MAP_W; x++) assert.ok(isSolidTile(x, y), `rock at ${x},${y}`);
  // Cairnwatch stands on the outpost's ground: every open tile inside its palisade (the square too) is reachable, no water
  for (let y = MOORS_OUTPOST.y; y < MOORS_OUTPOST.y + MOORS_OUTPOST.h; y++) for (let x = MOORS_OUTPOST.x; x < MOORS_OUTPOST.x + MOORS_OUTPOST.w; x++) {
    assert.ok(GROUND[MR(y)][x] !== T.WATER, `no water in Cairnwatch at ${x},${MR(y)}`);
    if (!isSolidTile(x, MR(y))) assert.ok(seen[MR(y) * MAP_W + x], `Cairnwatch tile ${x},${MR(y)} reachable`);
  }
  // Act 1's side: reachable on foot from Oakvale's square
  const s = randomSpawn(), home = flood(...tileOf(s));
  const [ox, oy] = tileOf(waygateArrival(oakGate));
  assert.ok(home[oy * MAP_W + ox], "the moorgate's Act 1 arrival is reachable from Oakvale");
  assert.ok(home[MOORSGATE_OAKVALE.y * MAP_W + MOORSGATE_OAKVALE.x], "the gate stands on open ground, joined to Oakvale");
  for (let i = 0; i < 40; i++) { const p = moorsSpawn(); assert.equal(actAt(p.y, p.x), 3); assert.ok(!isSolidAt(p.x, p.y), "a free spawn spot"); }
});

test("moors: levels 20-35 from the moorgate; gates; each act keeps its own boards; the moors are their own war land", () => {
  assert.equal(baseLevelAt(MOORGATE.x, MR(MOORGATE.y)), 20);
  assert.ok(baseLevelAt(270, MR(20)) > 30, "far from the gate: higher");
  assert.equal(actMobLevel(3, 50), MOORS_LEVEL.mob);
  assert.equal(actSpecialLevel(3, 50), MOORS_LEVEL.special);
  assert.equal(actMobLevel(3, 5), MOORS_LEVEL.min);
  assert.equal(actMobLevel(2, 5), 30, "Act 2 unchanged");
  assert.equal(actMobLevel(1, 40), 25, "Act 1 unchanged");
  assert.ok(!moorsOpen({ level: 19 }) && moorsOpen({ level: 20 }) && !moorsOpen(undefined));
  const g = waygateById("moorsgate")!;
  assert.equal(g.to, "moors");
  assert.equal(gateOpen(g, { level: 19 } as never), false);
  assert.equal(gateOpen(g, { level: 20 } as never), true);
  assert.equal(gateOpen(waygateById("oakvale")!, { level: 50 } as never), false, "the Sunscar's gate still wants its bosses");
  assert.equal(WAYGATES.filter((w) => !cityGateOf(w)).length, 18, "the Sunscar's, the moors', the badlands' and the sinkholes' pairs, the Crown's five (and the capitals' city gates)");
  // respawns and logins land in the act's own place (death in the moors: Cairnwatch's square)
  for (const act of [1, 2, 3]) { const q = actSpawn(act, randomSpawn); assert.equal(actAt(q.y, q.x), act, `act ${act} spawn`); }
  // the moors' hunts are only on the moors' board (its act), never on Act 1's or Act 2's
  for (const z of SPAWN_ZONES) if (actOfTile(z.x, z.y) === 3) { assert.ok(!huntable(z, 1) && !huntable(z, 2)); }
  // the war reaches the moors as a land of its own (shared/war/regions.ts): every Act 3 territory is in it, none elsewhere
  assert.ok(TERRITORIES.some((t) => t.act === 3), "the moors are at war");
  for (const t of TERRITORIES) assert.equal(t.region === "moors", t.act === 3, t.name);
});

/** onJoin as an account through a fake client (test rooms skip onAuth), like tests/songweaver-kit.test.ts. */
let seq = 0;
function fakeJoin(room: any, name: string) {
  const sid = `moors${++seq}`;
  room.onJoin({ sessionId: sid, send: () => {} }, { cls: "wizard" }, { name });
  return { p: room.state.players.get(sid), done: () => room.state.players.delete(sid) };
}

test("room: the moorgate is cold under Lv 20, crosses at Lv 20, and a hero saved in the moors logs back in there", async () => {
  const { login, saveHero } = await import("../server/accounts");
  const { dropLive } = await import("../server/handoff");
  const srv = await startRoom();
  const name = `Moorer${process.pid % 1000}`;
  try {
    await login(name, "testpass1", "127.0.0.1");
    const c = await srv.join({ cls: "wizard" });
    const crossed: string[] = [], notes: string[] = [];
    c.onMessage("waygate", (m: { to: string }) => crossed.push(m.to));
    c.onMessage("chat", (m: { text: string }) => notes.push(m.text));
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const gate = waygateById("moorsgate")!;
    p.level = 19; p.x = gate.x; p.y = gate.y + TILE; p.lastHurt = 0;
    c.send("waygate");
    assert.ok(await until(() => notes.some((t) => /The gate is cold\. Return at level 20\./.test(t))), "the cold-gate note");
    assert.deepEqual(crossed, [], "Lv 19: refused");
    assert.equal(actAt(p.y, p.x), 1);
    p.level = 20;
    c.send("waygate");
    assert.ok(await until(() => crossed.length === 1));
    assert.deepEqual(crossed, ["moors"]);
    assert.equal(actAt(p.y, p.x), 3, "in the moors");
    const at = waygateArrival(waygateById("moors")!);
    assert.ok(Math.hypot(p.x - at.x, p.y - at.y) < TILE, "by the moors gate");
    const save = structuredClone(room.snapshot(p));
    assert.equal(save.act, 3, "the save says act 3");
    // and back home through the moors side
    p.lastHurt = 0; p.x = at.x; p.y = at.y - TILE;
    c.send("waygate");
    assert.ok(await until(() => crossed.length === 2));
    assert.equal(crossed[1], "moorsgate");
    assert.equal(actAt(p.y, p.x), 1, "home in Act 1");
    await c.leave();
    // logging in from that save (a cold login: no live state to resume) puts the hero in the moors
    saveHero(name, "wizard", save);
    dropLive(name, "wizard");
    const j = fakeJoin(room, name);
    try {
      assert.equal(j.p.level, 20);
      assert.equal(actAt(j.p.y, j.p.x), 3, "logs back in in the moors");
      assert.ok(!isSolidAt(j.p.x, j.p.y));
      assert.equal(room.snapshot(j.p).act, 3, "and stays in act 3");
    } finally { j.done(); }
    // an act-3 save that can't be placed (a hero under Lv 20 there) falls back to Oakvale's square
    saveHero(name, "wizard", { ...save, level: 12, xp: 0 });
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
