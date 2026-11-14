// Quest concept #7 (The Tide, WP5): the world meter, the dusk schedule, the march, the pay and the messages.
// Pure rules (shared/tide.ts) first, then the world store, then the room (server/tide.ts) driven through its own
// start()/tick() so no test waits minutes. All files go to a temp folder, never into data/.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, wait } from "./helpers/room"; // first: sets SAVE_FILE / IDEAS_FILE to a temp dir
import { MOBS, mobScale, TILE } from "../shared/constants";
import { CHAINS, chainState, packQuest } from "../shared/quests";
import { DAY_CYCLE_MS, DUSK } from "../shared/daynight";
import { WATCH, WATCH_POSTS } from "../shared/watch";
import { actAt } from "../shared/act2";
import { findPath } from "../shared/bandits";
import { marchTime, msUntilDusk, TIDE, TIDE_GATE, TIDE_GOAL, TIDE_SPAWNS, tideGold, tideHome, tidePayouts, tideShares } from "../shared/tide";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tide-test-"));
process.env.WORLD_FILE = path.join(dir, "world.json"); // before server/worldStore is first loaded (startRoom imports it lazily)
process.env.DAY_TIME = "night"; // worldDayFrac = 0.8
const NIGHT = 0.8;

const worldMod = () => import("../server/worldStore");
async function until(cond: () => boolean, ms = 15_000, what = "condition") {
  const end = Date.now() + ms;
  while (!cond()) { if (Date.now() > end) assert.fail(`timed out waiting for ${what}`); await wait(20); }
}

// ---------- pure rules ----------

test("msUntilDusk: the next dusk, zero while it is dusk, wraps over midnight", () => {
  assert.equal(msUntilDusk(0.5), (DUSK.from - 0.5) * DAY_CYCLE_MS);
  assert.equal(msUntilDusk(DUSK.from), 0);
  assert.equal(msUntilDusk((DUSK.from + DUSK.to) / 2), 0);
  assert.ok(Math.abs(msUntilDusk(DUSK.to) - (1 - DUSK.to + DUSK.from) * DAY_CYCLE_MS) < 1, "dusk just over: a full day minus the dusk");
  assert.ok(Math.abs(msUntilDusk(0.75) - (1 - 0.75 + DUSK.from) * DAY_CYCLE_MS) < 1, "night wraps to the dusk of the next day");
  assert.ok(Math.abs(msUntilDusk(0) - DUSK.from * DAY_CYCLE_MS) < 1);
  for (let t = 0; t < 1; t += 0.037) { const ms = msUntilDusk(t); assert.ok(ms >= 0 && ms < DAY_CYCLE_MS); }
  assert.equal(marchTime(1000, (DUSK.from + DUSK.to) / 2), 1000);
  assert.equal(marchTime(1000, 0.5), 1000 + Math.round(msUntilDusk(0.5)));
});

test("tide pay: share floor, gold formula, cap, level limit, offline heroes, runes for the top 3", () => {
  const dmg = new Map([["a", 500], ["b", 300], ["c", 150], ["d", 30], ["e", 20]]);
  const sh = tideShares(dmg);
  assert.deepEqual(sh.map((s) => s.name), ["a", "b", "c", "d", "e"]);
  assert.ok(Math.abs(sh.reduce((s, x) => s + x.share, 0) - 1) < 1e-9);
  assert.deepEqual(tideShares(new Map()), []);
  assert.deepEqual(tideShares(new Map([["a", 0], ["b", -4]])), [], "no damage, no shares");
  assert.equal(tideGold(10, TIDE.shareFloor - 0.001), 0, "under the floor: nothing");
  assert.ok(tideGold(10, TIDE.shareFloor) > 0, "exactly the floor is paid");
  assert.equal(tideGold(10, 0.5), Math.round(TIDE.gold(10) * (0.5 + 0.5)));
  assert.equal(tideGold(10, 1), Math.round(TIDE.gold(10) * 1.5));
  assert.ok(tideGold(99, 1) <= TIDE.goldCap, "capped");
  assert.equal(tideGold(30, 1), Math.min(TIDE.goldCap, Math.round(TIDE.gold(30) * 1.5)));
  assert.equal(TIDE.gold(60), TIDE.gold(30), "levels above Act 1's pay as the Act 1 limit");
  assert.equal(TIDE.gold(0), TIDE.gold(1), "levels below 1 pay as level 1");
  const pays = tidePayouts(dmg, (n) => (n === "b" ? undefined : 10));
  assert.deepEqual(pays.map((p) => p.name), ["a", "c", "d"], "b is offline (not paid), e is under the floor");
  assert.deepEqual(pays.map((p) => p.rune), [true, true, false], "runes for the top shares overall (an offline hero's rune is lost)");
  assert.equal(pays[0].gold, tideGold(10, 0.5));
  const all = tidePayouts(dmg, () => 10);
  assert.deepEqual(all.map((p) => p.rune), all.map((_, i) => i < TIDE.runeTop));
});

test("tide places: home spots and the goal are out of the watch's sight, marchers can walk there", () => {
  const sight = WATCH.sightTiles * TILE;
  const dist = (x: number, y: number) => Math.min(...WATCH_POSTS.map((p) => Math.hypot(p.x - x, p.y - y)));
  assert.ok(Math.abs(Math.hypot(TIDE_GOAL.x - TIDE_GATE.x, TIDE_GOAL.y - TIDE_GATE.y) - TIDE.goalTiles * TILE) <= 2 * TILE, "about goalTiles from the gate");
  assert.ok(TIDE_GOAL.x < TIDE_GATE.x, "outside, to the west");
  assert.ok(dist(TIDE_GOAL.x, TIDE_GOAL.y) > sight + TIDE.spreadTiles * TILE, "the whole spread around the goal is out of sight");
  for (let i = 0; i < 3000; i++) {
    const h = tideHome();
    assert.ok(dist(h.x, h.y) > sight, "every marcher's own spot is out of sight");
    assert.ok(Math.hypot(h.x - TIDE_GOAL.x, h.y - TIDE_GOAL.y) <= TIDE.spreadTiles * TILE + 1, "within the spread");
  }
  assert.ok(TIDE_SPAWNS.length > 20);
  for (const s of TIDE_SPAWNS) assert.ok(findPath(s.x, s.y, TIDE_GOAL.x, TIDE_GOAL.y).length, "a way to the goal");
  assert.ok(Math.hypot(TIDE_GOAL.x - TIDE_GATE.x, TIDE_GOAL.y - TIDE_GATE.y) + TIDE.spreadTiles * TILE < TIDE.creditTiles * TILE, "heroes fighting at the goal are in the credit radius");
  assert.equal(TIDE.waves.at(-1)!.n, TIDE.maxAlive, "the last wave fits exactly under maxAlive");
});

// ---------- the world store (JSON) ----------

test("world store: cleanWorld on bad data, JSON write and reload", async () => {
  const { cleanWorld, flushWorldFinal, initWorld, world, worldChanged } = await worldMod();
  assert.deepEqual(cleanWorld(undefined), { v: 1, tide: 0, marches: 0 });
  assert.deepEqual(cleanWorld("junk"), { v: 1, tide: 0, marches: 0 });
  assert.deepEqual(cleanWorld({ v: 7, tide: -3, marchAt: "x", marches: 2.7 }), { v: 1, tide: 0, marches: 2 });
  assert.deepEqual(cleanWorld({ tide: NaN, marchAt: -5, marches: Infinity }), { v: 1, tide: 0, marches: 0 });
  assert.deepEqual(cleanWorld({ v: 1, tide: 12, marchAt: 5000, marches: 1 }), { v: 1, tide: 12, marchAt: 5000, marches: 1 });
  assert.ok(process.env.WORLD_FILE!.startsWith(dir), "the world file is in the temp dir");
  await initWorld(); // no file yet: a fresh world
  assert.deepEqual(world(), { v: 1, tide: 0, marches: 0 });
  world().tide = 321; world().marchAt = 123456; world().marches = 4; worldChanged();
  await flushWorldFinal();
  assert.deepEqual(JSON.parse(fs.readFileSync(process.env.WORLD_FILE!, "utf8")), { v: 1, tide: 321, marchAt: 123456, marches: 4 });
  assert.ok(!fs.existsSync(process.env.WORLD_FILE + ".tmp"), "no temp file left");
  fs.writeFileSync(process.env.WORLD_FILE!, JSON.stringify({ v: 1, tide: 77, marches: 2 }));
  await initWorld(); // load again
  assert.deepEqual(world(), { v: 1, tide: 77, marches: 2 });
  fs.writeFileSync(process.env.WORLD_FILE!, "{ not json");
  await initWorld();
  assert.deepEqual(world(), { v: 1, tide: 0, marches: 0 }, "a broken file starts a fresh world");
});

// ---------- the room ----------

type Msg = Record<string, any>;
/** A room with three heroes: a summoner (Act 1, the main one), a knight, and a knight we later send to Act 2. */
async function setup() {
  const srv = await startRoom();
  const { world } = await worldMod();
  const w = world();
  w.tide = 0; w.marchAt = undefined; w.marches = 0;
  const log = () => ({ tide: [] as Msg[], sfx: [] as string[] });
  const L = [log(), log(), log()];
  // Listen right after each join, so the meter sent on join is not missed.
  const cs: any[] = [];
  for (const [i, cls] of ["summoner", "knight", "knight"].entries()) {
    const c = await srv.join({ cls });
    c.onMessage("tide", (m: Msg) => L[i].tide.push({ ...m, at: Date.now() }));
    c.onMessage("sfx", (m: Msg) => { if (String(m.ev).startsWith("tide")) L[i].sfx.push(m.ev); });
    cs.push(c);
  }
  const room = srv.room;
  await until(() => cs.every((c) => room.state.players.get(c.sessionId)), 10_000, "heroes in the room");
  const [p, p2, p3] = cs.map((c) => room.state.players.get(c.sessionId));
  for (const h of [p, p2, p3]) { h.hp = h.maxHp = 1e6; h.level = 10; h.invulnUntil = Date.now() + 600_000; }
  const marchers = () => [...room.state.mobs.entries()].filter(([, m]: any) => m.tide && !m.dead) as [string, any][];
  /** Kill a monster of `kind` (hp 1) with a hit by hero `by`; `extra` sets mob fields (qwave, owner...). */
  const kill = (kind: string, extra: Record<string, unknown> = {}, by = cs[0].sessionId) => {
    const id = `x${Math.random()}`;
    room.spawnMob(kind, -1, id, { x: p.x + 600, y: p.y, level: 3 });
    Object.assign(room.state.mobs.get(id), extra);
    room.state.mobs.get(id).hp = 1;
    room.hitTarget(by, id, 50, [0, 0], {});
    return id;
  };
  return { srv, room, w, cs, p, p2, p3, L, tide: room.tide, marchers, kill };
}
/** Push the march along without waiting: the next pack is due, the check runs now. */
function push(tide: any) { const M = tide.m; if (M) M.nextPack = 0; tide.checkAt = 0; tide.tick(Date.now()); }

test("meter: +1 per blob a hero kills; summons, hold waves, marchers, non-blobs and others' creatures give nothing", async () => {
  const t = await setup();
  try {
    const { w, kill, room, cs } = t;
    kill("slime"); kill("warriorblob");
    assert.equal(w.tide, 2, "+1 per blob");
    kill("skeleton"); kill("slime", { qwave: true }); kill("slime", { summonFor: cs[0].sessionId }); kill("slime", { tide: true });
    assert.equal(w.tide, 2, "skeletons, hold waves, quest summons, marchers: nothing");
    kill("slime", { owner: cs[1].sessionId });
    assert.equal(w.tide, 2, "someone's creature: nothing");
    // a golem's kill counts for its owner
    const sumId = room.summon(cs[0].sessionId, "golem_fire");
    assert.ok(sumId, "summoned a golem");
    const g = room.state.mobs.get(sumId);
    room.spawnMob("slime", -1, "petprey", { x: g.x + 10, y: g.y, level: 3 });
    room.state.mobs.get("petprey").hp = 1;
    room.summonStrike(g, sumId, "petprey", room.state.mobs.get("petprey"), { damage: 50 });
    assert.ok(room.state.mobs.get("petprey").dead, "the golem killed it");
    assert.equal(w.tide, 3, "a pet's kill counts for its owner");
  } finally { await t.srv.stop(); }
});

test("marchers fill no bounty and no quest kill step, and give TIDE.xpMult of their kill XP", async () => {
  const t = await setup();
  try {
    const { kill, p } = t;
    p.bounty = { zone: "North Meadow", kind: "slime", goal: 50, minLevel: 1, xp: 0, gold: 0, n: 0 };
    p.quests.set("hunt", packQuest(0, 2, 0)); // Cold Ashes, step 2: kill blobs anywhere
    const hunt = () => chainState(p, CHAINS.findIndex((c) => c.id === "hunt"))!.questCount;
    const base = Math.round(MOBS.slime.xp * mobScale(3, "xp"));
    let xp0 = p.xp;
    kill("slime", { tide: true });
    assert.equal(p.bounty.n, 0, "a marcher fills no bounty");
    assert.equal(hunt(), 0, "a marcher fills no quest kill step");
    assert.equal(p.xp - xp0, Math.round(base * TIDE.xpMult), "a marcher gives xpMult of its kill XP");
    xp0 = p.xp;
    kill("slime");
    assert.equal(p.bounty.n, 1, "a plain slime still counts for the bounty");
    assert.equal(hunt(), 1, "and for the quest");
    assert.equal(p.xp - xp0, base, "and gives its full XP");
  } finally { await t.srv.stop(); }
});

test("meter: a full meter calls the march for the next dusk, ignores further kills, and the clients are told", async () => {
  const t = await setup();
  try {
    const { w, kill, L } = t;
    await until(() => L[0].tide.length >= 1, 10_000, "the meter on join");
    assert.equal(L[0].tide[0].goal, TIDE.goal);
    assert.equal(L[0].tide[0].n, 0);
    w.tide = TIDE.goal - 1;
    const t0 = Date.now();
    kill("slime");
    assert.equal(w.tide, TIDE.goal);
    assert.ok(w.marchAt !== undefined && Math.abs(w.marchAt - (t0 + msUntilDusk(NIGHT))) < 3000, "marchAt = now + msUntilDusk(dayFrac)");
    const at = w.marchAt;
    kill("slime"); kill("warriorblob");
    assert.equal(w.tide, TIDE.goal, "a full meter ignores further kills");
    assert.equal(w.marchAt, at, "and does not move the march");
    await until(() => L[0].tide.at(-1)?.marchAt === at, 10_000, "marchAt on the client");
    assert.equal(L[0].tide.at(-1)!.n, TIDE.goal);
    await until(() => L[0].sfx.includes("tidefull"), 10_000, "tidefull");
  } finally { await t.srv.stop(); }
});

test("messages: at most about one a second under rapid kills; the dev /tide command sets the meter", async () => {
  const t = await setup();
  try {
    const { w, kill, L, cs } = t;
    kill("slime"); kill("slime"); kill("slime");
    await until(() => L[0].tide.at(-1)?.n === 3, 10_000, "the meter at 3");
    const n0 = L[0].tide.length;
    for (let i = 0; i < 30; i++) kill("slime");
    await until(() => L[0].tide.at(-1)?.n === 33, 10_000, "the meter at 33");
    const got = L[0].tide.slice(n0);
    assert.ok(got.length <= 2, `30 rapid kills sent ${got.length} messages`);
    cs[0].send("chat", "/tide 77");
    await until(() => w.tide === 77, 10_000, "/tide 77");
    cs[0].send("chat", "/tide 0");
    await until(() => w.tide === 0, 10_000, "/tide 0");
  } finally { await t.srv.stop(); }
});

test("schedule: a march at marchAt sets out; one missed by more than lateMs waits for the next dusk", async () => {
  const t = await setup();
  try {
    const { w, tide, L, marchers } = t;
    w.tide = TIDE.goal;
    w.marchAt = Date.now() - 10; // on time
    await until(() => tide.marching, 10_000, "the march sets out");
    assert.equal(w.marchAt, undefined, "marchAt is cleared when it starts");
    await until(() => L[0].tide.at(-1)?.wave === 1, 10_000, "wave 1 on the client");
    assert.equal(L[0].tide.at(-1)!.waves, TIDE.waves.length);
    await until(() => L[0].sfx.includes("tidemarch"), 10_000, "tidemarch");
    await until(() => marchers().length >= TIDE.pack[0], 10_000, "the first pack");
    tide.dev("/tideend");
    assert.ok(!tide.marching);
    w.tide = TIDE.goal; // late
    const late = Date.now() - TIDE.lateMs - 5000;
    w.marchAt = late;
    const before = Date.now();
    tide.tick(Date.now());
    assert.ok(!tide.marching, "a missed march does not start");
    assert.ok(w.marchAt !== undefined && w.marchAt > late, "it is moved");
    assert.ok(Math.abs(w.marchAt - (before + msUntilDusk(NIGHT))) < 3000, "to the next dusk");
  } finally { await t.srv.stop(); }
});

test("march: at most maxAlive alive, never merged, out of the watch's sight, and no Act 1 raiders meanwhile", async () => {
  const t = await setup();
  const realRandom = Math.random;
  try {
    const { room, tide, marchers, p, p2 } = t;
    p.x = TIDE_GATE.x + 2 * TILE; p.y = TIDE_GATE.y; p2.x = p.x; p2.y = p.y; // inside the gate: nobody to chase
    tide.start(Date.now());
    for (let i = 0; i < 60; i++) { push(tide); assert.ok(marchers().length <= TIDE.maxAlive); }
    assert.ok(marchers().length >= TIDE.pack[0], "marchers are out");
    for (const [, m] of marchers()) {
      assert.equal(m.title, TIDE.title);
      assert.ok(m.level >= TIDE.waves[0].level[0] && m.level <= TIDE.waves[0].level[1], "wave 1 levels");
      assert.ok(Math.hypot(m.homeX - TIDE_GOAL.x, m.homeY - TIDE_GOAL.y) <= TIDE.spreadTiles * TILE + 1, "home at the goal");
      assert.ok(!(room.constructor as any).canMerge(m), "marchers never merge");
      assert.equal(m.merged, 1);
    }
    // worst case: the last wave all at once is exactly maxAlive
    tide.dev("/tideend");
    assert.ok(!tide.marching);
    tide.start(Date.now(), true);
    assert.equal(marchers().length, TIDE.maxAlive);
    for (let i = 0; i < 20; i++) { push(tide); assert.ok(marchers().length <= TIDE.maxAlive); }

    // no Act 1 raiders while it marches (riders always roll in for this check)
    p2.x = TIDE_GOAL.x - 30 * TILE; p2.y = TIDE_GOAL.y;
    Math.random = () => 0.01;
    room.nextRaidCheck = 0; room.nextRaidRoll = 1; room.raidRest = { 1: 0, 2: 0 };
    room.updateRaids(Date.now());
    Math.random = realRandom;
    assert.equal([...room.raiders.values()].filter((m: any) => m.raidAct === 1).length, 0, "no riders during the march");

    // the watch leaves marchers alone at their spot: put each there and let the watch think for a while
    p2.x = p.x; p2.y = p.y;
    for (const [, m] of marchers()) { m.x = m.homeX; m.y = m.homeY; m.target = ""; }
    const stop = Date.now() + 1500;
    while (Date.now() < stop) {
      room.state.watch.forEach((wm: any) => { const mt = wm.target && room.state.mobs.get(wm.target); assert.ok(!mt?.tide, "no watchman goes for a marcher at its spot"); });
      await wait(100);
    }
  } finally { Math.random = realRandom; await t.srv.stop(); }
});

test("pay: a cleared march pays the top heroes near the gate by damage, resets the meter, and Act 2 hears nothing", async () => {
  const t = await setup();
  try {
    const { room, w, tide, marchers, p, p2, p3, cs, L } = t;
    p3.x = 100 * TILE; p3.y = 400 * TILE; // the desert
    assert.equal(actAt(p3.y, p3.x), 2);
    await until(() => L[0].tide.length >= 1, 10_000, "news for the Act 1 hero");
    L[2].tide.length = 0; L[2].sfx.length = 0; // whatever came before the move
    const sumId = room.summon(cs[0].sessionId, "golem_fire");
    const g = room.state.mobs.get(sumId);
    w.tide = TIDE.goal; w.marchAt = Date.now() - 10;
    await until(() => tide.marching, 10_000, "the march");
    await until(() => marchers().length > 0, 10_000, "marchers");

    p.x = TIDE_GOAL.x + 20; p.y = TIDE_GOAL.y; // fighting at the goal, inside the credit radius
    const [mid, m1] = marchers()[0];
    m1.hp = m1.maxHp = 1e5;
    room.hitTarget(cs[0].sessionId, mid, 100, [0, 0], {});
    g.x = m1.x + 10; g.y = m1.y;
    room.summonStrike(g, sumId, mid, m1, { damage: 50 });
    const dmg = tide.m.dmg as Map<string, number>;
    assert.ok((dmg.get(p.name) ?? 0) > 100, "hero + golem damage go to the hero");
    p2.x = TIDE_GATE.x - (TIDE.creditTiles + 10) * TILE; p2.y = TIDE_GATE.y; // too far from the gate
    room.hitTarget(cs[1].sessionId, mid, 100, [0, 0], {});
    assert.equal(dmg.get(p2.name), undefined, "damage beyond creditTiles from the gate is not credited");
    p2.x = TIDE_GOAL.x; p2.y = TIDE_GOAL.y;
    room.hitTarget(cs[1].sessionId, mid, 1, [0, 0], {});
    const total = [...dmg.values()].reduce((a, b) => a + b);
    assert.ok((dmg.get(p2.name) ?? 0) > 0 && (dmg.get(p2.name) ?? 0) / total < TIDE.shareFloor, "p2 is under the floor");

    const gold0 = p.gold, gold2 = p2.gold;
    const waves = new Set<number>();
    for (let i = 0; i < 600 && tide.marching; i++) {
      if (tide.m) waves.add(tide.m.wave);
      for (const [id, m] of marchers()) { m.hp = 1; m.x = p.x; m.y = p.y; room.hitTarget(cs[0].sessionId, id, 50, [0, 0], {}); }
      push(tide);
      if (i % 20 === 0) await wait(1);
    }
    assert.ok(!tide.marching, "the march ends when the last wave is down");
    assert.deepEqual([...waves].sort(), TIDE.waves.map((_, i) => i), "all waves came");
    assert.equal(w.tide, 0, "the meter is empty");
    assert.equal(w.marchAt, undefined);
    assert.equal(w.marches, 1);
    assert.equal(marchers().length, 0);
    await until(() => L[0].tide.some((m) => m.result) && L[1].tide.some((m) => m.result), 10_000, "the result");
    const res = L[0].tide.find((m) => m.result)!.result, res2 = L[1].tide.find((m) => m.result)!.result;
    assert.equal(res.cleared, true);
    assert.equal(res.top[0].name, p.name);
    assert.ok(res.you.gold > 0 && res.you.rune, "top hero: gold and a rune");
    assert.ok(p.gold - gold0 >= res.you.gold);
    assert.ok(Array.from(p.bag).includes(res.you.rune) || [...room.state.items.values()].some((it: any) => it.gear === res.you.rune), "the rune is in the bag or at their feet");
    assert.equal(res2.you.gold, 0, "under the floor: told the share, no gold");
    assert.ok(!res2.you.rune);
    assert.equal(p2.gold, gold2, "no gold paid");
    await until(() => L[0].sfx.includes("tideend"), 10_000, "tideend");
    assert.equal(L[2].tide.length, 0, "Act 2: no Tide messages");
    assert.deepEqual(L[2].sfx, [], "Act 2: no Tide sounds");
  } finally { await t.srv.stop(); }
});

test("pay: at the time limit the march ends, the rest melts away, the meter resets and the march counts", async () => {
  const t = await setup();
  try {
    const { w, tide, marchers, L } = t;
    w.tide = TIDE.goal; w.marches = 5;
    tide.start(Date.now(), true);
    assert.equal(marchers().length, TIDE.maxAlive);
    tide.m.start = Date.now() - TIDE.limitMs - 1;
    tide.checkAt = 0;
    tide.tick(Date.now());
    assert.ok(!tide.marching);
    await until(() => marchers().length === 0, 10_000, "marchers gone");
    assert.equal(w.tide, 0);
    assert.equal(w.marchAt, undefined);
    assert.equal(w.marches, 6);
    await until(() => L[0].tide.some((m) => m.result), 10_000, "the result");
    assert.equal(L[0].tide.find((m) => m.result)!.result.cleared, false);
  } finally { await t.srv.stop(); }
});
