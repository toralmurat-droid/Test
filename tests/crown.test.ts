import { test } from "node:test";
import { BEAST_CHAIN, CHAINS, CROWN_CHAIN, packQuest } from "../shared/quests";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  ACT_LEVEL, actMobLevel, actOfTile, actSpecialLevel, BADLANDS_H, BADLANDS_Y0, CROWN_H, CROWN_LEVEL, CROWN_Y0, DESERT_H, DESERT_Y0, MAP_H, MAP_W,
  MOORS_H, MOORS_Y0, SINKHOLES_H, SINKHOLES_LEVEL, SINKHOLES_Y0, TILE,
} from "../shared/constants";
import { AREAS, EMPTY, GROUND, isSafeZone, isSolidAt, isSolidTile, OBJECTS, randomSpawn, T, TILE_COUNT } from "../shared/map";
import {
  buildCrown, COURTS, CR, CROWN_KEEP, CROWN_KEEP_GATES, CROWN_LANDS, crownGateTile, CROWNWAYS, GARDENS, inCrownRow, SPIRES, THRONE_DOOR, THRONE_HALL,
  TOLLCROSS, TOLLCROSS_SQUARE, type TileBox,
} from "../shared/crown";
import {
  actAt, actOpen, actSpawn, crownSpawn, gateColdNote, gateOpen, HOMELAND_GATES, homelandGate, isCrownGate, isSinkholesGate, waygateArrival, waygateById, WAYGATES,
} from "../shared/act2";
import { baseLevelAt, SPAWN_ZONES } from "../shared/spawns";
import { regionOf } from "../shared/war/regions";
import { TERRITORIES } from "../shared/war/territories";
import { startRoom, until, wait } from "./helpers/room";

const tileOf = (p: { x: number; y: number }) => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)] as const;
const C0 = CROWN_Y0, C1 = CROWN_Y0 + CROWN_H;
const NEW_TILES = [T.MARBLE, T.STATUE, T.SPIRE, T.BRAZIER];
const gate = (from: string) => waygateById(`crown_${from}`)!, home = (from: string) => waygateById(`crownway_${from}`)!;
/**
 * One 4-way flood over the whole map (the only one in this file), seeded with each land's own way in: Oakvale's square,
 * the Sunscar's, the moors', the badlands' and the sinkholes' gates, and one Crownway's Crown side. The bands are sealed
 * from each other by rock, so a tile seen in a band was reached from that band's own seed.
 */
const SEEN = (() => {
  const seeds = [randomSpawn(), ...["desert", "moors", "badlands", "sinkholes", "crown_oakvale"].map((id) => waygateArrival(waygateById(id)!))].map(tileOf);
  const seen = new Uint8Array(MAP_W * MAP_H), q: number[] = [];
  for (const [x, y] of seeds) { assert.ok(!isSolidTile(x, y), `seed ${x},${y} free`); seen[y * MAP_W + x] = 1; q.push(y * MAP_W + x); }
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % MAP_W, y = (q[i] / MAP_W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (isSolidTile(nx, ny) || seen[ny * MAP_W + nx]) continue;
      seen[ny * MAP_W + nx] = 1; q.push(ny * MAP_W + nx);
    }
  }
  return seen;
})();
const reached = (x: number, y: number) => SEEN[y * MAP_W + x] === 1;

test("crown: a band of its own under the sinkholes, built the same every time", () => {
  assert.equal(CROWN_Y0, SINKHOLES_Y0 + SINKHOLES_H + 8);
  assert.equal(CROWN_Y0, 1148);
  assert.equal(CROWN_H, 176);
  assert.equal(MAP_H, CROWN_Y0 + CROWN_H + 4);
  assert.equal(MAP_H, 1328);
  assert.equal(GROUND.length, MAP_H);
  assert.equal(TILE_COUNT, 68);
  assert.deepEqual(NEW_TILES, [64, 65, 66, 67]);
  const fresh = () => {
    const g = Array.from({ length: MAP_H }, () => Array<number>(MAP_W).fill(T.DIRT)), o = Array.from({ length: MAP_H }, () => Array<number>(MAP_W).fill(T.ROCK));
    const r = buildCrown(T, g, o, EMPTY);
    return { g: g.slice(C0, C1), o: o.slice(C0, C1), areas: r.areas, roads: [...r.roads], posts: r.posts };
  };
  const a = fresh(), b = fresh();
  assert.deepEqual(a, b, "deterministic");
  assert.deepEqual(a.g, GROUND.slice(C0, C1), "the world's Crown ground");
  assert.deepEqual(a.o, OBJECTS.slice(C0, C1), "the world's Crown objects");
  // the land's look: wild grass over cracked marble, granite cliffs, statues, spires, braziers, gardens, groves
  const count = (layer: number[][], id: number) => layer.slice(C0, C1).reduce((n, row) => n + row.filter((t) => t === id).length, 0);
  for (const [layer, id, name, min] of [[GROUND, T.GRASS, "grass", 5000], [GROUND, T.MARBLE, "marble paving", 1500], [GROUND, T.FLAGS, "the kings' roads", 1000],
    [GROUND, T.FLOWERS, "wild gardens", 150], [GROUND, T.RUBBLE, "rubble", 200], [OBJECTS, T.CLIFF, "granite cliffs", 5000], [OBJECTS, T.STATUE, "fallen statues", 60],
    [OBJECTS, T.SPIRE, "broken spires", SPIRES.length * 3], [OBJECTS, T.BRAZIER, "braziers", 20], [OBJECTS, T.WALL_STONE, "the Keep's walls", 120],
    [OBJECTS, T.RUIN, "broken court walls", 40], [OBJECTS, T.TREE, "trees", 40], [OBJECTS, T.BUSH, "hedges and brush", 200]] as const)
    assert.ok(count(layer as number[][], id) >= min, `${name} in the Crown (${count(layer as number[][], id)})`);
  // the new tiles stay in the Crown's band
  for (let y = 0; y < MAP_H; y++) if (!inCrownRow(y)) for (let x = 0; x < MAP_W; x++) {
    assert.ok(!NEW_TILES.includes(GROUND[y][x]) && !NEW_TILES.includes(OBJECTS[y][x]), `Crown tile at ${x},${y}`);
  }
  assert.ok(COURTS.length >= 6 && GARDENS.length >= 3);
  assert.ok(AREAS.some((r) => r.name === "The Crown of the Marches" && r.y === C0 && r.h === CROWN_H));
  for (const n of ["Tollcross Square", "Tollcross", "The Throne Hall", ...CROWNWAYS.map((c) => c.name), ...CROWN_LANDS.map((l) => l.name)]) {
    assert.equal(AREAS.filter((r) => r.name === n).length, 1, `one area named ${n}`);
  }
});

test("crown: actOfTile knows all six acts, the rock strip under the sinkholes split between them", () => {
  assert.equal(actOfTile(140, SINKHOLES_Y0 + SINKHOLES_H - 1), 5, "the sinkholes' last row");
  assert.deepEqual([1140, 1143, 1144, 1147].map((y) => actOfTile(0, y)), [5, 5, 6, 6], "rows 1140-1143 Act 5, 1144-1147 Act 6");
  assert.equal(actOfTile(0, C0), 6);
  assert.equal(actOfTile(287, MAP_H - 1), 6, "the last row (rock under the Crown)");
  for (const c of CROWNWAYS) {
    const g = crownGateTile(c);
    assert.equal(actOfTile(g.x, g.y), 6, `${c.name}: its Crown side`);
    assert.equal(actOfTile(c.home.x, c.home.y), { oakvale: 1, sunscar: 2, moors: 3, badlands: 4, sinkholes: 5 }[c.from], `${c.name}: its homeland side`);
  }
  assert.ok(inCrownRow(CR(0)) && inCrownRow(CR(CROWN_H - 1)) && !inCrownRow(CR(-1)) && !inCrownRow(CR(CROWN_H)));
});

test("crown: sealed in rock, every walkable tile reachable from every Crownway, Tollcross and the Keep open, room for the war", () => {
  let walk = 0;
  for (let y = C0; y < C1; y++) for (let x = 0; x < MAP_W; x++) {
    if (isSolidTile(x, y)) continue;
    walk++;
    assert.ok(reached(x, y), `Crown tile ${x},${y} reachable`);
  }
  assert.ok(walk > MAP_W * CROWN_H * 0.5, `mostly open land (${walk})`);
  for (let y = SINKHOLES_Y0 + SINKHOLES_H; y < C0; y++) for (let x = 0; x < MAP_W; x++) assert.ok(isSolidTile(x, y), `rock at ${x},${y}`);
  for (let y = C1; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) assert.ok(isSolidTile(x, y), `rock at ${x},${y}`);
  // the five gates on the rim, each on the side its homeland lies, every arrival free and joined to the others
  const at = Object.fromEntries(CROWNWAYS.map((c) => [c.from, c.gate]));
  assert.ok(at.oakvale.x < MAP_W / 4 && at.oakvale.y < CROWN_H / 4, "Oakvale's gate on the north-west rim");
  assert.ok(at.moors.x > MAP_W * 0.75 && at.moors.y < CROWN_H / 4, "the moors' on the north-east rim");
  assert.ok(at.badlands.x < MAP_W / 8 && Math.abs(at.badlands.y - CROWN_H / 2) < CROWN_H / 8, "the badlands' on the west rim");
  assert.ok(Math.abs(at.sinkholes.x - MAP_W / 2) < MAP_W / 8 && at.sinkholes.y > CROWN_H * 0.8, "the sinkholes' on the south rim");
  assert.ok(at.sunscar.x > MAP_W * 0.75 && at.sunscar.y > CROWN_H * 0.75, "the Sunscar's on the south-east rim");
  for (const c of CROWNWAYS) {
    const g = gate(c.from), [ax, ay] = tileOf(waygateArrival(g));
    assert.ok(!isSolidTile(ax, ay) && reached(ax, ay), `${c.name}: the Crown arrival is free and joined to the rest`);
    assert.ok(!isSolidTile(c.gate.x, CR(c.gate.y)), `${c.name}: the gate stands on open ground`);
    assert.equal(GROUND[CR(c.gate.y)][c.gate.x], T.MARBLE, `${c.name}: on its marble dais`);
    assert.ok(!isSafeZone(waygateArrival(g).x, waygateArrival(g).y), "no arrival on the square");
  }
  // Tollcross outside the Keep's north gate: open ground, its square the Crown's safe zone and where heroes come back
  const X = TOLLCROSS, K = CROWN_KEEP, Q = TOLLCROSS_SQUARE;
  assert.ok(X.y + X.h <= K.y && X.x <= CROWN_KEEP_GATES.north[0] && X.x + X.w > CROWN_KEEP_GATES.north[1], "Tollcross lies outside the north gate");
  for (let y = Q.y; y < Q.y + Q.h; y++) for (let x = Q.x; x < Q.x + Q.w; x++) {
    assert.ok(!isSolidTile(x, CR(y)) && reached(x, CR(y)) && isSafeZone((x + 0.5) * TILE, (CR(y) + 0.5) * TILE), `square tile ${x},${y}`);
  }
  for (let i = 0; i < 40; i++) { const p = crownSpawn(); assert.equal(actAt(p.y, p.x), 6); assert.ok(isSafeZone(p.x, p.y) && !isSolidAt(p.x, p.y), "a free spawn spot on the square"); }
  // the Keep: walled, both gates open and walked through, the Throne Hall's floor reached through its door only
  for (const gx of CROWN_KEEP_GATES.north) assert.ok(reached(gx, CR(K.y)) && reached(gx, CR(K.y + K.h - 1)), `Keep gates at x ${gx}`);
  for (let x = K.x + 1; x < K.x + K.w - 1; x++) if (x < CROWN_KEEP_GATES.north[0] || x > CROWN_KEEP_GATES.north[1]) assert.ok(isSolidTile(x, CR(K.y)) && isSolidTile(x, CR(K.y + K.h - 1)), `curtain wall at x ${x}`);
  for (let y = K.y; y < K.y + K.h; y++) assert.ok(isSolidTile(K.x, CR(y)) && isSolidTile(K.x + K.w - 1, CR(y)), `curtain wall at y ${y}`);
  const Th = THRONE_HALL;
  for (const dx of THRONE_DOOR) assert.ok(reached(dx, CR(Th.y + Th.h - 1)), "the Throne Hall's door");
  let hall = 0;
  for (let y = Th.y + 1; y < Th.y + Th.h - 1; y++) for (let x = Th.x + 1; x < Th.x + Th.w - 1; x++) if (!isSolidTile(x, CR(y))) { hall++; assert.ok(reached(x, CR(y))); }
  assert.ok(hall > (Th.w - 2) * (Th.h - 2) * 0.7, "the hall is mostly open floor");
  for (let x = Th.x; x < Th.x + Th.w; x++) assert.ok(isSolidTile(x, CR(Th.y)), "the hall's back wall");
  // every future zone land has a clear 5x5 for a war Hold, inside the land
  assert.equal(CROWN_LANDS.length, 10);
  for (const l of CROWN_LANDS) {
    const [hx, hy] = l.hold;
    assert.ok(hx - 2 >= l.x && hx + 2 < l.x + l.w && hy - 2 >= l.y && hy + 2 < l.y + l.h, `${l.name}: the patch is inside the land`);
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) assert.ok(!isSolidTile(hx + i, CR(hy + j)) && reached(hx + i, CR(hy + j)), `${l.name}: clear ground at ${hx + i},${hy + j}`);
  }
});

test("crown: every homeland's Crownway dais is open ground joined to its land, carved inside its box only", () => {
  for (const c of CROWNWAYS) {
    const h = home(c.from), [ax, ay] = tileOf(waygateArrival(h)), B = c.box;
    assert.ok(!isSolidTile(c.home.x, c.home.y) && reached(c.home.x, c.home.y), `${c.name}: the dais in ${c.land} is reachable`);
    assert.ok(!isSolidTile(ax, ay) && reached(ax, ay), `${c.name}: its homeland arrival is free and reachable`);
    assert.ok([GROUND[c.home.y][c.home.x]].some((g) => g === T.FLAGS || g === T.RUBBLE), `${c.name}: on old flagstones`);
    assert.ok(c.home.x - 4 >= B.x0 && c.home.x + 4 <= B.x1 && c.home.y - 4 >= B.y0 && c.home.y + 4 <= B.y1, `${c.name}: the dais is inside the box`);
    assert.ok(ay <= B.y1, `${c.name}: the arrival is inside the box`);
  }
  // each homeland band's tiles outside its box, hashed on the map before the Crown was added (Act 1's in
  // tests/badlands.test.ts). A deliberate change to a homeland's map must update its hash.
  const hash = (y0: number, y1: number, B: TileBox) => {
    const h = createHash("sha256"), inB = (x: number, y: number) => x >= B.x0 && x <= B.x1 && y >= B.y0 && y <= B.y1;
    for (let y = y0; y < y1; y++) h.update(GROUND[y].map((g, x) => (inB(x, y) ? -9 : g)).join(",") + "|" + OBJECTS[y].map((o, x) => (inB(x, y) ? -9 : o)).join(",") + "\n");
    return h.digest("hex");
  };
  const box = (from: string) => CROWNWAYS.find((c) => c.from === from)!.box;
  assert.equal(hash(DESERT_Y0, DESERT_Y0 + DESERT_H, box("sunscar")), "cf06ed1b908ff518c8008beebb90be356a63c7d042900bd5568b7585005d3077", "the Sunscar");
  assert.equal(hash(MOORS_Y0, MOORS_Y0 + MOORS_H, box("moors")), "6b9d38ddc1d4a8812ead5333fb181d0ee29d2077b33a616409cfde153a7c6179", "the moors");
  assert.equal(hash(BADLANDS_Y0, BADLANDS_Y0 + BADLANDS_H, box("badlands")), "87d87a882414c81d6ebd845e784c73f21f385397ca763bbcb766dc33a926b9c4", "the badlands");
  assert.equal(hash(SINKHOLES_Y0, SINKHOLES_Y0 + SINKHOLES_H, box("sinkholes")), "6b461371a4d43dfeb6212584ed495fa5dc09115a48f3d09893985aaffa800a53", "the sinkholes");
});

test("crown: Lv 40-50 climbing inward from the rim, the Crownways open at Lv 40, no war there yet", () => {
  assert.deepEqual(CROWN_LEVEL, { min: 40, mob: 48, special: 50, tilesPerLevel: 10 });
  assert.equal(ACT_LEVEL[6], CROWN_LEVEL);
  assert.deepEqual([actMobLevel(6, 3), actMobLevel(6, 60), actSpecialLevel(6, 60)], [40, 48, 50]);
  assert.deepEqual([actMobLevel(5, 3), actMobLevel(5, 60), actSpecialLevel(5, 60)], [30, 43, 45], "Act 5 unchanged");
  assert.equal(SINKHOLES_LEVEL.min, 30);
  for (const c of CROWNWAYS) assert.equal(baseLevelAt(c.gate.x, CR(c.gate.y)), 40, `${c.name}: Lv 40 at the gate`);
  const keep = baseLevelAt(CROWN_KEEP.x + CROWN_KEEP.w / 2, CR(CROWN_KEEP.y + CROWN_KEEP.h / 2));
  assert.ok(keep >= 45, `the Keep near the top of the band (Lv ${keep})`);
  assert.ok(baseLevelAt(144, CR(60)) > baseLevelAt(60, CR(30)), "higher further in");
  // the gates: five pairs, each Crown side leading back to its own homeland
  const crown = WAYGATES.filter(isCrownGate);
  assert.equal(crown.length, 10);
  assert.equal(WAYGATES.length, 18);
  for (const c of CROWNWAYS) {
    const g = home(c.from), b = gate(c.from);
    assert.equal(g.to, b.id); assert.equal(b.to, g.id);
    assert.ok(isCrownGate(g) && isCrownGate(b) && !isSinkholesGate(g));
    assert.equal(gateOpen(g, { level: 39 } as never), false);
    assert.equal(gateOpen(b, { level: 40 } as never), c.from !== "sunscar", `${c.name}: Lv 40 only (the Sun Gate also wants Act 2)`);
    assert.equal(gateColdNote(g, undefined), "The road is barred. Return at level 40.");
    assert.equal(homelandGate(g)?.act, 6);
  }
  assert.ok(!isCrownGate(waygateById("sinkway")!) && !isCrownGate(waygateById("oakvale")!));
  // the Sun Gate is no way round Act 2's lock: both ends want Ostrevar and the Hide-Mother beaten as well as Lv 40
  const done = (ch: number) => packQuest(CHAINS[ch].quests.length, 0, 0);
  const keys = { quests: { gloam: done(0), bone: done(1), red: done(2), crown: done(CROWN_CHAIN), tut: done(CHAINS.findIndex((q) => q.id === "tutorial")), beast: done(BEAST_CHAIN) } };
  for (const sg of [home("sunscar"), gate("sunscar")]) {
    assert.equal(gateOpen(sg, { level: 50, quests: {} } as never), false, `${sg.id}: shut without Act 2`);
    assert.match(gateColdNote(sg, { level: 50, quests: {} } as never), /Ostrevar/);
    assert.equal(gateColdNote(sg, { level: 39, quests: {} } as never), "The road is barred. Return at level 40.");
    assert.equal(gateOpen(sg, { level: 40, ...keys } as never), true, `${sg.id}: open with Act 2 and Lv 40`);
    assert.equal(gateOpen(sg, { level: 39, ...keys } as never), false);
  }
  assert.deepEqual(HOMELAND_GATES.map((h) => [h.act, h.level]), [[3, 20], [4, 25], [5, 30], [6, 40]]);
  assert.ok(actOpen(6, { level: 40 } as never) && !actOpen(6, { level: 39 } as never));
  for (const act of [1, 2, 3, 4, 5, 6]) { const q = actSpawn(act, randomSpawn); assert.equal(actAt(q.y, q.x), act, `act ${act} spawn`); }
  // no monsters and no war in the Crown yet: neutral ground, its zones and territories come later
  assert.ok(!SPAWN_ZONES.some((z) => actOfTile(z.x, z.y) === 6), "no monster zones yet");
  assert.equal(regionOf(crownGateTile(CROWNWAYS[0]).x, crownGateTile(CROWNWAYS[0]).y), undefined, "not a war land yet");
  assert.ok(!TERRITORIES.some((t) => t.act === 6));
});

/** onJoin as an account through a fake client (test rooms skip onAuth), like tests/sinkholes.test.ts. */
let seq = 0;
function fakeJoin(room: any, name: string) {
  const sid = `crown${++seq}`;
  room.onJoin({ sessionId: sid, send: () => {} }, { cls: "wizard" }, { name });
  return { p: room.state.players.get(sid), done: () => room.state.players.delete(sid) };
}

test("room: the Crownway is barred under Lv 40, crosses at Lv 40 and back, and a hero saved in the Crown logs back in at Tollcross", async () => {
  const { login, saveHero } = await import("../server/accounts");
  const { dropLive } = await import("../server/handoff");
  const srv = await startRoom();
  const name = `Crowner${process.pid % 1000}`;
  try {
    await login(name, "testpass1", "127.0.0.1");
    const c = await srv.join({ cls: "wizard" });
    const crossed: string[] = [], notes: string[] = [];
    c.onMessage("waygate", (m: { to: string }) => crossed.push(m.to));
    c.onMessage("chat", (m: { text: string }) => notes.push(m.text));
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const g = home("oakvale");
    p.level = 39; p.x = g.x + TILE; p.y = g.y + TILE; p.lastHurt = 0;
    c.send("waygate");
    assert.ok(await until(() => notes.some((t) => /The road is barred\. Return at level 40\./.test(t))), "the barred note");
    assert.deepEqual(crossed, [], "Lv 39: refused");
    assert.equal(actAt(p.y, p.x), 1);
    p.level = 40;
    c.send("waygate");
    assert.ok(await until(() => crossed.length === 1));
    assert.deepEqual(crossed, ["crown_oakvale"]);
    assert.equal(actAt(p.y, p.x), 6, "in the Crown");
    const at = waygateArrival(gate("oakvale"));
    assert.ok(Math.hypot(p.x - at.x, p.y - at.y) < TILE, "by the Greenward Gate");
    const save = structuredClone(room.snapshot(p));
    assert.equal(save.act, 6, "the save says act 6");
    // and back home through the same gate
    p.lastHurt = 0; p.x = at.x; p.y = at.y - TILE;
    c.send("waygate");
    assert.ok(await until(() => crossed.length === 2));
    assert.equal(crossed[1], "crownway_oakvale");
    assert.equal(actAt(p.y, p.x), 1, "home in Act 1");
    await c.leave();
    // logging in from the act-6 save (a cold login) puts the hero on Tollcross Square
    saveHero(name, "wizard", save);
    dropLive(name, "wizard");
    const j = fakeJoin(room, name);
    try {
      assert.equal(j.p.level, 40);
      assert.equal(actAt(j.p.y, j.p.x), 6, "logs back in in the Crown");
      assert.ok(isSafeZone(j.p.x, j.p.y) && !isSolidAt(j.p.x, j.p.y), "on Tollcross Square");
      assert.equal(room.snapshot(j.p).act, 6, "and stays in act 6");
    } finally { j.done(); }
    // an act-6 save under Lv 40 falls back to Oakvale's square
    saveHero(name, "wizard", { ...save, level: 37, xp: 0 });
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
